/**
 * Bank subtitles and shot cuts re-timed to the voice (VIRAL_BATCH_A9.md, 23 Oct
 * 2026). The bank's `subtitles` are 3 to 5 word blocks copied verbatim from the
 * narration and its `shot_times` are estimates at about 2 words a second; the
 * render places both on the ElevenLabs word timestamps instead, keeping the
 * shot order and the words each shot belongs to.
 */
import type { CaptionFrame } from './captions';
import type { SubtitleCue } from './viralBatch';

export interface ShotTime {
  id: string;
  start: number;
  end: number;
}

export interface TimedWord {
  start: number;
  end: number;
}

/** The first cut on a non-viral Short lands in this window when the words allow (A12). */
export const FIRST_CUT = { min: 2.0, max: 2.5 };
/** The shortest a re-timed shot may run. */
export const MIN_SHOT_SECONDS = 0.8;

/** "MF031-C1 0.0-3.0" → a shot time, or null. */
export function parseShotTime(line: string): ShotTime | null {
  const m = /^\s*(\S+)\s+(\d+(?:\.\d+)?)\s*-\s*(\d+(?:\.\d+)?)\s*$/.exec(line);
  if (!m) return null;
  const start = Number(m[2]);
  const end = Number(m[3]);
  return end > start ? { id: m[1], start, end } : null;
}

export function parseShotTimes(lines: string[]): { times: ShotTime[]; bad: string[] } {
  const times: ShotTime[] = [];
  const bad: string[] = [];
  for (const line of lines) {
    const t = parseShotTime(line);
    if (t) times.push(t);
    else bad.push(line);
  }
  return { times, bad };
}

const tokens = (s: string) => s.split(/\s+/).filter((w) => /[\p{L}\p{N}]/u.test(w));

/** A subtitle word shown in the highlight colour: the block's word written in capitals. */
export function isKeyword(word: string): boolean {
  const letters = word.replace(/[^\p{L}]/gu, '');
  return letters.length >= 2 && letters === letters.toUpperCase() && /\p{Lu}/u.test(letters);
}

/** Word offsets of each block within the narration's words. */
function offsets(cues: SubtitleCue[]): { starts: number[]; total: number } {
  const starts: number[] = [];
  let n = 0;
  for (const c of cues) {
    starts.push(n);
    n += tokens(c.text).length;
  }
  return { starts, total: n };
}

/** The voice time at a (fractional) word position, scaled when the counts differ. */
function timeAt(pos: number, planned: number, words: TimedWord[]): number {
  if (!words.length || planned <= 0) return 0;
  const idx = Math.min(words.length - 1, Math.max(0, Math.round((pos * words.length) / planned)));
  return words[idx].start;
}

/** The subtitle blocks on the voice's timeline; each runs until the next begins. */
export function retimeSubtitles(cues: SubtitleCue[], words: TimedWord[], duration: number): SubtitleCue[] {
  if (!cues.length) return [];
  if (!words.length) {
    const planned = cues[cues.length - 1].end || 1;
    return cues.map((c, i) => ({
      ...c,
      start: (c.start * duration) / planned,
      end: i === cues.length - 1 ? duration : (cues[i + 1].start * duration) / planned,
    }));
  }
  const { starts, total } = offsets(cues);
  const at = starts.map((s, i) => (i === 0 ? 0 : timeAt(s, total, words)));
  return cues.map((c, i) => ({ ...c, start: at[i], end: i + 1 < cues.length ? Math.max(at[i], at[i + 1]) : duration }));
}

/** The word position (in subtitle words) the bank's estimated time `t` falls on. */
function positionAt(t: number, cues: SubtitleCue[], starts: number[], total: number): number {
  let k = 0;
  while (k + 1 < cues.length && cues[k + 1].start <= t + 1e-6) k++;
  const c = cues[k];
  const len = tokens(c.text).length;
  const span = c.end - c.start;
  const f = span > 0 ? Math.min(1, Math.max(0, (t - c.start) / span)) : 0;
  return Math.min(total, starts[k] + f * len);
}

/**
 * Shot durations on the voice's timeline, in shot order: each cut moves to the
 * word it was planned on. The first cut is held in 2.0 to 2.5 s (A12) unless
 * `keepFirstCut`, and no shot runs shorter than 0.8 s.
 */
export function retimeShots(
  shots: ShotTime[],
  cues: SubtitleCue[],
  words: TimedWord[],
  duration: number,
  opts: { keepFirstCut?: boolean } = {},
): ShotTime[] {
  if (!shots.length) return [];
  const planned = shots[shots.length - 1].end || 1;
  let cuts: number[];
  if (cues.length && words.length) {
    const { starts, total } = offsets(cues);
    cuts = shots.slice(1).map((s) => timeAt(positionAt(s.start, cues, starts, total), total, words));
  } else {
    cuts = shots.slice(1).map((s) => (s.start * duration) / planned);
  }
  if (!opts.keepFirstCut && cuts.length) {
    const room = (cuts[1] ?? duration) - MIN_SHOT_SECONDS;
    cuts[0] = Math.min(Math.max(cuts[0], FIRST_CUT.min), Math.max(FIRST_CUT.min, Math.min(FIRST_CUT.max, room)));
  }
  // Keep the cuts in order with every shot at least MIN_SHOT_SECONDS long.
  for (let i = 0; i < cuts.length; i++) {
    const lo = (i ? cuts[i - 1] : 0) + MIN_SHOT_SECONDS;
    if (cuts[i] < lo) cuts[i] = lo;
  }
  for (let i = cuts.length - 1; i >= 0; i--) {
    const hi = (i + 1 < cuts.length ? cuts[i + 1] : duration) - MIN_SHOT_SECONDS;
    if (cuts[i] > hi) cuts[i] = hi;
  }
  const bounds = [0, ...cuts, duration];
  return shots.map((s, i) => ({ id: s.id, start: bounds[i], end: bounds[i + 1] }));
}

/** Subtitle blocks as caption frames, the capitalised keyword highlighted. */
export function subtitleFrames(cues: SubtitleCue[]): CaptionFrame[] {
  return cues
    .filter((c) => c.end > c.start)
    .map((c) => ({
      start: c.start,
      end: c.end,
      tokens: c.text
        .split(/\s+/)
        .filter(Boolean)
        .map((t) => ({ text: t, active: isKeyword(t) })),
    }));
}
