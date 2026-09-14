import type { BeatKind } from './types';

/**
 * Professor Hoot emotion state machine — spec §6.3.
 *
 * Emotion is chosen by keyword sentiment first, falling back to the structural
 * beat when a line contains no cue words.
 */

export type Emotion = 'base' | 'surprised' | 'thinking' | 'knowing';

const SURPRISE_KEYWORDS = [
  'why', 'shocking', 'sudden', 'unexpected', 'alarm', 'danger', 'secret', 'never', 'instantly',
];
const THINKING_KEYWORDS = [
  'because', 'cortex', 'dopamine', 'mechanism', 'brain', 'exploit', 'biological', 'psychology',
];
const KNOWING_KEYWORDS = [
  'remember', 'reframe', 'power', 'control', 'boundary', 'recognize', 'grounded', 'autonomy',
];

const BEAT_DEFAULT: Record<BeatKind, Emotion> = {
  hook: 'surprised',
  mechanism: 'thinking',
  reframe: 'knowing',
};

function scoreKeywords(haystack: string, keywords: string[]): number {
  return keywords.reduce((acc, kw) => (haystack.includes(kw) ? acc + 1 : acc), 0);
}

/** Picks the emotion for a spoken line, biased by which beat the line belongs to. */
export function emotionFor(text: string, beat: BeatKind): Emotion {
  const lower = ` ${text.toLowerCase()} `;

  const scores: Array<[Emotion, number]> = [
    ['surprised', scoreKeywords(lower, SURPRISE_KEYWORDS)],
    ['thinking', scoreKeywords(lower, THINKING_KEYWORDS)],
    ['knowing', scoreKeywords(lower, KNOWING_KEYWORDS)],
  ];

  scores.sort((a, b) => b[1] - a[1]);
  const [topEmotion, topScore] = scores[0];

  // A tie between two cue sets is no signal at all — trust the beat instead.
  const tied = scores[1][1] === topScore;
  if (topScore === 0 || tied) return BEAT_DEFAULT[beat];

  return topEmotion;
}

/**
 * Mascot overlay window for long-form (spec §7, "Mascot Fatigue").
 * Hoot appears only for the first 3.5s and last 2.5s of a chapter — never
 * during the mechanism, where he would pull attention off the explanation.
 */
export interface MascotWindow {
  start: number;
  end: number;
  emotion: Emotion;
}

/** Uncovered mechanism time required before a chapter earns a second overlay. */
const MIN_MECHANISM_GAP = 2;

export function longFormMascotWindows(chapterDuration: number, miniHook: string, reframe: string): MascotWindow[] {
  const windows: MascotWindow[] = [];
  const head = Math.min(3.5, chapterDuration / 3);
  const tail = Math.min(2.5, chapterDuration / 3);

  if (head > 0.5) {
    windows.push({ start: 0, end: head, emotion: emotionFor(miniHook, 'hook') });
  }

  // Only add the closing overlay if a real mechanism gap survives between the
  // two windows. On a very short chapter the head and tail would otherwise
  // almost touch, strobing Hoot on and off — the fatigue the guardrail exists
  // to prevent.
  if (tail > 0.5 && chapterDuration - tail - head >= MIN_MECHANISM_GAP) {
    windows.push({ start: chapterDuration - tail, end: chapterDuration, emotion: emotionFor(reframe, 'reframe') });
  }

  return windows;
}

/** Shorts keep Hoot on screen throughout — the beat just drives which face shows. */
export function shortFormMascotWindows(beats: Array<{ kind: BeatKind; text: string; start: number; end: number }>): MascotWindow[] {
  return beats.map((b) => ({ start: b.start, end: b.end, emotion: emotionFor(b.text, b.kind) }));
}
