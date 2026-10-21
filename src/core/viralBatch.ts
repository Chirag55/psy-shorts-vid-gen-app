/**
 * Viral batch Shorts (audit A9, VIRAL_BATCH_A9.md): the curated uploads that go
 * out first, in `queue` order, with fixed pacing, voice settings, burned-in
 * subtitles, a bottom overlay carrying the unspoken question, and a thumbnail
 * text drawn by the app.
 */
import { FRAME_9X16, lookLines, SHOT_NEG, SHOT_STYLE } from './shotPrompts';

export interface SubtitleCue {
  start: number;
  end: number;
  text: string;
}

export interface VoiceSettings {
  /** ElevenLabs voice_settings, 0 to 1. */
  stability: number;
  similarity: number;
  style: number;
  speed: number;
}

export interface ViralInfo {
  batch: string;
  /** Position in the batch (1-based) and the batch size, from "1 of 5". */
  position: number;
  size: number;
  queue?: number;
  voice?: VoiceSettings;
  subtitles: SubtitleCue[];
  bottomOverlay?: string;
  thumbText?: string;
  thumbVisual?: string;
  pinnedComment?: string;
  /** The Short's character looks, for the thumbnail prompt. */
  looks?: string[];
}

/** Seconds the bottom overlay stays on at the end. */
export const BOTTOM_OVERLAY_SECONDS = 2.5;
/** The hashtags every A9 title and description end with. */
export const A9_HASHTAGS = ['shorts', 'psychology', 'DarkPsychology'];
/** Fixed pacing (A9 rule 1). */
export const VIRAL_SHOTS = 10;
export const VIRAL_CLIPS = 3;
export const VIRAL_SECONDS = 24;
/** Seconds after publishing within which the pinned comment goes up. */
export const PIN_WITHIN_SECONDS = 30;

/** "0:02.5" or "2.5" → seconds. */
export function timeOf(s: string): number | undefined {
  const m = /^\s*(?:(\d+):)?(\d+(?:\.\d+)?)\s*$/.exec(s);
  if (!m) return undefined;
  return (m[1] ? Number(m[1]) * 60 : 0) + Number(m[2]);
}

/** "0:00-0:02.0 | POV: The compliment was a trap" → a cue, or null. */
export function parseCue(line: string): SubtitleCue | null {
  const m = /^\s*([\d:.]+)\s*[-–—]\s*([\d:.]+)\s*\|\s*(.+?)\s*$/.exec(line);
  if (!m) return null;
  const start = timeOf(m[1]);
  const end = timeOf(m[2]);
  if (start === undefined || end === undefined || !(end > start)) return null;
  return { start, end, text: m[3] };
}

/** Seconds → "0:02.5". */
function clock(t: number): string {
  const m = Math.floor(t / 60);
  const sec = t - m * 60;
  return `${m}:${sec < 10 ? '0' : ''}${Number.isInteger(sec) ? sec : sec.toFixed(1)}`;
}

/** A cue back as a bank line: "0:02.0-0:04.5 | text". */
export function cueLine(c: SubtitleCue): string {
  return `${clock(c.start)}-${clock(c.end)} | ${c.text}`;
}

/** The cues of a `subtitles` list, with the lines that are not cues. */
export function parseSubtitles(lines: string[]): { cues: SubtitleCue[]; bad: string[] } {
  const cues: SubtitleCue[] = [];
  const bad: string[] = [];
  for (const line of lines) {
    const cue = parseCue(line);
    if (cue) cues.push(cue);
    else bad.push(line);
  }
  cues.sort((a, b) => a.start - b.start);
  return { cues, bad };
}

/** "ElevenLabs: stability 45, clarity 80, style exaggeration 25, speed 1.12 (…)" → voice settings. */
export function parseVoiceSettings(text: string): VoiceSettings | undefined {
  const num = (re: RegExp) => {
    const m = re.exec(text);
    return m ? Number(m[1]) : undefined;
  };
  const pct = (v: number | undefined) => (v === undefined ? undefined : v > 1 ? v / 100 : v);
  const stability = pct(num(/stability\s*[:=]?\s*(\d+(?:\.\d+)?)/i));
  const similarity = pct(num(/(?:clarity|similarity(?:[ _]boost)?)\s*[:=]?\s*(\d+(?:\.\d+)?)/i));
  const style = pct(num(/style(?:\s+exaggeration)?\s*[:=]?\s*(\d+(?:\.\d+)?)/i));
  const speed = num(/speed\s*[:=]?\s*(\d+(?:\.\d+)?)/i);
  if (stability === undefined && similarity === undefined && style === undefined && speed === undefined)
    return undefined;
  const clamp = (v: number | undefined, d: number, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, v ?? d));
  return {
    stability: clamp(stability, 0.5),
    similarity: clamp(similarity, 0.75),
    style: clamp(style, 0),
    speed: clamp(speed, 1, 0.7, 1.2),
  };
}

/** "1 of 5" → position and size. */
export function parseUploadOrder(text: string | undefined): { position: number; size: number } | undefined {
  const m = /^\s*(\d+)\s*(?:of|\/)\s*(\d+)\s*$/i.exec(text ?? '');
  return m ? { position: Number(m[1]), size: Number(m[2]) } : undefined;
}

/** A bank entry's viral batch info, or undefined when it is not in a batch. */
export function viralOf(e: any): ViralInfo | undefined {
  if (!e || typeof e.viral_batch !== 'string' || !e.viral_batch.trim()) return undefined;
  const order = parseUploadOrder(e.upload_order);
  const queue = typeof e.queue === 'number' ? e.queue : undefined;
  return {
    batch: e.viral_batch.trim(),
    position: order?.position ?? queue ?? 0,
    size: order?.size ?? 0,
    ...(queue !== undefined ? { queue } : {}),
    ...(e.voice_settings ? { voice: parseVoiceSettings(e.voice_settings) } : {}),
    subtitles: e.subtitles ?? [],
    ...(e.bottom_overlay ? { bottomOverlay: e.bottom_overlay } : {}),
    ...(e.thumb_text ? { thumbText: e.thumb_text } : {}),
    ...(e.thumb_visual ? { thumbVisual: e.thumb_visual } : {}),
    ...(e.pinned_comment ? { pinnedComment: e.pinned_comment } : {}),
    ...(e.character_looks?.length ? { looks: e.character_looks } : {}),
  };
}

/** The 9:16 thumbnail art prompt (as in shorts_thumbnail_prompts.txt): style, looks, the visual, frame, negatives. */
export function viralThumbnailPrompt(v: Pick<ViralInfo, 'thumbVisual' | 'looks'>): string {
  const visual = (v.thumbVisual ?? '').trim();
  if (!visual) return '';
  const looks = lookLines(visual, v.looks ?? []);
  return [
    SHOT_STYLE,
    ...(looks ? [looks] : []),
    `Large close-up of the faces, the expression is clear and readable at a glance, at 120 pixels wide: ${visual.replace(/\.?$/, '.')}`,
    'One strong focal point, nothing else competing.',
    FRAME_9X16,
    SHOT_NEG,
  ].join(' ');
}

export const isViral = (e: any): boolean => Boolean(viralOf(e));

/** "VIRAL A9 #1". */
export function viralBadge(v: Pick<ViralInfo, 'batch' | 'position'>): string {
  return `VIRAL ${v.batch} #${v.position}`;
}

/** Viral Shorts first in batch order, then the rest as given. */
export function viralFirst<T>(list: T[], entryOf: (x: T) => any = (x) => x): T[] {
  const rank = (x: T) => {
    const v = viralOf(entryOf(x));
    return v ? (v.queue ?? v.position) : Number.MAX_SAFE_INTEGER;
  };
  return list
    .map((x, i) => ({ x, i }))
    .sort((a, b) => rank(a.x) - rank(b.x) || a.i - b.i)
    .map(({ x }) => x);
}

/** Title or description text ending with exactly the three A9 hashtags. */
export function withA9Hashtags(text: string): string {
  const onlyTags = /^\s*(#[\p{L}\p{N}_]+\s*)+$/u;
  const body = text
    .split('\n')
    .filter((l) => !onlyTags.test(l))
    .join('\n')
    .replace(/(\s*#[\p{L}\p{N}_]+)+\s*$/u, '')
    .replace(/\n{3,}/g, '\n\n')
    .trimEnd();
  const sep = body.includes('\n') ? '\n\n' : ' ';
  return `${body}${sep}${A9_HASHTAGS.map((h) => `#${h}`).join(' ')}`;
}

/** Problems with a viral Short's A9 fields (the import refuses on these). */
export function viralProblems(e: any): string[] {
  const v = viralOf(e);
  if (!v) return [];
  const out: string[] = [];
  const shots = e.visual_beats?.length ?? 0;
  if (shots !== VIRAL_SHOTS) out.push(`A9 ${shots} shots, a viral Short needs ${VIRAL_SHOTS}`);
  const clips = (e.visual_beats ?? []).filter((b: string) => /^\S+\s+clip/.test(b)).length;
  if (clips !== VIRAL_CLIPS) out.push(`A9 ${clips} clips, a viral Short needs exactly ${VIRAL_CLIPS}`);
  if (!v.subtitles.length) out.push('A9 no subtitles');
  if (!v.bottomOverlay) out.push('A9 no bottom_overlay');
  if (!v.thumbText) out.push('A9 no thumb_text');
  else if (v.thumbText.split(/\s+/).filter(Boolean).length > 3) out.push('A9 thumb_text is more than 3 words');
  if (!v.voice) out.push('A9 voice_settings unreadable');
  for (const t of [e.title_final ?? '', e.description_full ?? '']) {
    const tags = (/((?:\s*#[\p{L}\p{N}_]+)+)\s*$/u.exec(t)?.[1] ?? '').match(/#[\p{L}\p{N}_]+/gu) ?? [];
    if (tags.join(' ') !== A9_HASHTAGS.map((h) => `#${h}`).join(' ')) {
      out.push(`A9 ${t === e.title_final ? 'title' : 'description'} must end with #shorts #psychology #DarkPsychology`);
    }
  }
  return out;
}

export interface ViralOverlay {
  name: string;
  text: string;
  start: number;
  end: number;
  bottom: boolean;
}

/**
 * The subtitle cues on the render's timeline, scaled from the bank's timings
 * to the voice's length, and the bottom overlay over the last 2.5 s.
 */
export function viralOverlays(v: Pick<ViralInfo, 'subtitles' | 'bottomOverlay'>, duration: number): ViralOverlay[] {
  const out: ViralOverlay[] = [];
  const planned = v.subtitles.length ? v.subtitles[v.subtitles.length - 1].end : 0;
  const scale = planned > 0 && duration > 0 ? duration / planned : 1;
  v.subtitles.forEach((c, i) => {
    const start = Math.max(0, c.start * scale);
    const end = i === v.subtitles.length - 1 ? duration : Math.min(duration, c.end * scale);
    if (end > start) out.push({ name: `subtitle_${i}`, text: c.text, start, end, bottom: false });
  });
  if (v.bottomOverlay && duration > 0) {
    out.push({
      name: 'bottom_overlay',
      text: v.bottomOverlay,
      start: Math.max(0, duration - BOTTOM_OVERLAY_SECONDS),
      end: duration,
      bottom: true,
    });
  }
  return out;
}
