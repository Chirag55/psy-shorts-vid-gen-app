import { CATCHPHRASE_WORDS } from './v2Script';
import { sentences } from './bankV2';
import {
  BLINK,
  EXPRESSION_HOLD_MS,
  FORMAT_POSES,
  LIP_FLAP,
  LONGFORM_POSES,
  revealPose,
  type ShortFormatCode,
} from './hoot';
import { fnv1a } from './researchLayer2';

/** Hoot's poses as a timeline: what he shows from when to when. */
export interface HootSegment {
  pose: string;
  start: number;
  end: number;
}

interface TimedWord {
  start: number;
  end: number;
}

/** Track times land on frames at this rate. */
const FPS = 30;
const snap = (t: number) => Math.round(t * FPS) / FPS;

/** A sentence that names the effect: Hoot reacts to the reveal. */
const NAMED = /\b(it's called|that's called|is called|this is called|psychologists call|researchers call|named this|that's the)\b/i;
/** A list item's opening ("Three:", "4."). */
const ITEM = /^(one|two|three|four|five|six|seven|eight|nine|ten|\d+)[:.]/i;
/** Long-form chapter reactions, first match wins. */
const RULES: { pose: string; test: (text: string, pillar?: string) => boolean }[] = [
  { pose: 'serious', test: (t, pillar) => pillar === 'Manipulation & Defense' && /^tactic\b/i.test(t) },
  { pose: 'idea', test: (t) => /^(the response|the defense|here's the defense|so here's the defense|the fix|the test)\b/i.test(t) },
  { pose: 'confused', test: (t) => /^myth\b/i.test(t) },
  { pose: 'shocked', test: (t) => /\b(percent|\d+%)/i.test(t) && /\b(only|just|more than|nearly|almost|twice|doubled)\b/i.test(t) },
  { pose: 'happy', test: (t) => /\b(that's not weakness|isn't a diagnosis|not your fault|you were never|stop fearing)\b/i.test(t) },
  { pose: 'thinking', test: (t) => /\?$/.test(t.trim()) && !/^(so|and)\b/i.test(t) },
];
/** Seconds between long-form reactions after the first. */
const REACTION_GAP = 6;

/** Each later segment cuts a hole in the ones beneath it. */
function overlay(base: HootSegment[], layer: HootSegment[]): HootSegment[] {
  let out = base;
  for (const o of layer) {
    if (!(o.end > o.start)) continue;
    const next: HootSegment[] = [];
    for (const s of out) {
      if (s.end <= o.start || s.start >= o.end) {
        next.push(s);
        continue;
      }
      if (s.start < o.start) next.push({ ...s, end: o.start });
      if (s.end > o.end) next.push({ ...s, start: o.end });
    }
    next.push({ pose: o.pose, start: o.start, end: o.end });
    next.sort((a, b) => a.start - b.start);
    out = next;
  }
  return out;
}

/** Lip flap while words are spoken, idle between, and seeded blinks on top. */
function baseLayer(duration: number, words: TimedWord[], seed: string): HootSegment[] {
  const flap = LIP_FLAP.holdMs / 1000;
  const out: HootSegment[] = [];
  let cursor = 0;
  for (const w of words) {
    const start = Math.max(cursor, Math.min(w.start, duration));
    const end = Math.min(Math.max(w.end, start), duration);
    if (start > cursor) out.push({ pose: 'idle', start: cursor, end: start });
    let t = start;
    let talk = true;
    while (t < end - 1e-6) {
      const next = Math.min(end, t + flap);
      out.push({ pose: talk ? 'talk' : 'idle', start: t, end: next });
      talk = !talk;
      t = next;
    }
    cursor = Math.max(cursor, end);
  }
  if (cursor < duration) out.push({ pose: 'idle', start: cursor, end: duration });
  const hash = (s: string) => Number.parseInt(fnv1a(s).slice(0, 8), 16) || 0;
  const [lo, hi] = BLINK.intervalS;
  const hold = BLINK.holdMs / 1000;
  const blinks: HootSegment[] = [];
  let t = lo + ((hash(seed) % 1000) / 1000) * (hi - lo);
  while (t + hold < duration) {
    blinks.push({ pose: 'blink', start: t, end: t + hold });
    t = t + lo + ((hash(`${seed}:${t.toFixed(3)}`) % 1000) / 1000) * (hi - lo);
  }
  return overlay(out, blinks);
}

/** Each sentence of the narration with the time it is spoken. */
export function sentenceSpans(narration: string, words: TimedWord[]): { text: string; start: number; end: number }[] {
  const out: { text: string; start: number; end: number }[] = [];
  let i = 0;
  for (const s of sentences(narration)) {
    const n = s.split(/\s+/).filter(Boolean).length;
    if (i >= words.length) break;
    const first = words[i];
    const last = words[Math.min(words.length - 1, i + n - 1)];
    out.push({ text: s, start: first.start, end: last.end });
    i += n;
  }
  return out;
}

/** The whole track: base lip flap and blinks with expression holds over them, snapped to frames, no gaps. */
export function buildTrack(input: { duration: number; holds: HootSegment[]; words: TimedWord[]; seed: string }): HootSegment[] {
  const { duration } = input;
  if (!(duration > 0)) return [];
  const hold = EXPRESSION_HOLD_MS / 1000;
  const expanded = input.holds.map((h) => ({
    ...h,
    end: Math.min(duration, h.pose !== 'none' ? Math.max(h.end, h.start + hold) : h.end),
  }));
  const merged = overlay(
    baseLayer(duration, input.words, input.seed),
    expanded.filter((h) => h.start < duration),
  );
  const out: HootSegment[] = [];
  for (const seg of merged) {
    const start = snap(seg.start);
    const end = snap(seg.end);
    if (end <= start) continue;
    const prev = out[out.length - 1];
    if (prev && prev.pose === seg.pose && Math.abs(prev.end - start) < 1e-6) {
      prev.end = end;
      continue;
    }
    if (!prev || start >= prev.end) out.push({ pose: seg.pose, start, end });
    else if (end > prev.end) out.push({ pose: seg.pose, start: prev.end, end });
  }
  if (out.length) {
    out[0].start = 0;
    for (let i = 1; i < out.length; i++) out[i].start = out[i - 1].end;
    out[out.length - 1].end = snap(duration) || duration;
  }
  return out;
}

/** A Short's expression holds: the hook, list items or the reveal, and the sign-off wave. */
export function shortHolds(s: {
  format: ShortFormatCode;
  hookSeconds: number;
  words: TimedWord[];
  narration: string;
  effect?: string;
  pillar?: string;
  ending?: string;
  duration: number;
}): HootSegment[] {
  const hold = EXPRESSION_HOLD_MS / 1000;
  const holds: HootSegment[] = [{ pose: FORMAT_POSES[s.format].hook, start: 0, end: Math.max(s.hookSeconds, hold) }];
  const spans = sentenceSpans(s.narration, s.words);
  const effect = s.effect?.toLowerCase();
  const reveal = spans.slice(1).find((sp) => (effect && sp.text.toLowerCase().includes(effect)) || NAMED.test(sp.text));
  if (s.format === 'LIST') {
    for (const sp of spans) {
      if (ITEM.test(sp.text.trim())) {
        holds.push({ pose: FORMAT_POSES.LIST.itemMarker ?? 'glance', start: sp.start, end: sp.start + hold });
      }
    }
  }
  if (reveal && s.format !== 'LIST') holds.push({ pose: revealPose(s.format, s.pillar), start: reveal.start, end: reveal.end });
  if (s.ending === 'SIGNOFF' && s.words.length >= CATCHPHRASE_WORDS) {
    holds.push({ pose: 'wave', start: s.words[s.words.length - CATCHPHRASE_WORDS].start, end: s.duration });
  }
  return holds;
}

/** A long-form chapter's holds: the card or the cold-open reaction, spaced reactions, and the closing wave. */
export function chapterHolds(c: {
  narration: string;
  words: TimedWord[];
  index: number;
  cardSeconds: number;
  hookPose?: string;
  pillar?: string;
  last?: boolean;
  duration: number;
}): HootSegment[] {
  const holds: HootSegment[] = [];
  const spans = sentenceSpans(c.narration, c.words);
  let lastAt = 0;
  if (c.index !== 0) {
    holds.push({ pose: LONGFORM_POSES.chapterCard, start: 0, end: c.cardSeconds });
    lastAt = c.cardSeconds;
  } else {
    holds.push({ pose: c.hookPose ?? 'surprised', start: 0, end: 2 });
    lastAt = 2;
    const file = spans.find((sp) => /\bfile\b/i.test(sp.text));
    if (file) holds.push({ pose: LONGFORM_POSES.intro, start: file.start, end: file.end });
  }
  for (const sp of spans) {
    const gap = holds.length > 1 ? REACTION_GAP : 0;
    if (sp.start < lastAt + gap) continue;
    const rule = RULES.find((r) => r.test(sp.text.trim(), c.pillar));
    if (!rule) continue;
    holds.push({ pose: rule.pose, start: sp.start, end: Math.min(sp.end, sp.start + 3) });
    lastAt = sp.start;
  }
  if (c.last && c.words.length >= CATCHPHRASE_WORDS) {
    holds.push({ pose: 'wave', start: c.words[c.words.length - CATCHPHRASE_WORDS].start, end: c.duration });
  }
  return holds;
}

/** Hoot hidden from the start until `seconds`. */
export function hiddenUntil(seconds: number): HootSegment[] {
  return seconds > 0 ? [{ pose: 'none', start: 0, end: seconds }] : [];
}

/** The track as an FFmpeg concat list of pose images. */
export function concatList(segments: HootSegment[], fileFor: (pose: string) => string): string {
  const quote = (s: string) => `'${s.replace(/'/g, "'\\''")}'`;
  const lines = ['ffconcat version 1.0'];
  for (const s of segments) lines.push(`file ${quote(fileFor(s.pose))}`, `duration ${(s.end - s.start).toFixed(4)}`);
  const last = segments[segments.length - 1];
  if (last) lines.push(`file ${quote(fileFor(last.pose))}`);
  return `${lines.join('\n')}\n`;
}
