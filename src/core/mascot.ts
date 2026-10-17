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
