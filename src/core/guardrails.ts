import type { LongScript, ShortScript, ScriptBody } from './types';

/**
 * Retention and cost guardrails — spec §7.
 *
 * These are checked client-side after generation as well as being written into
 * the Gemini prompt, because a model that drifts past the word cap produces
 * audio that will not fit the clip budget, and that costs real credits.
 */

/** Human speaking cadence the whole system is calibrated to. */
export const WORDS_PER_SECOND = 2.4;

export const SHORT_WORD_MAX = 70;
export const SHORT_WORD_HARD_MAX = 72;
export const SHORT_WORD_MIN = 55;

export const LONG_WORD_MAX = 700;
export const LONG_WORD_MIN = 450;

/** Free-tier ElevenLabs allowance, and the ceiling we refuse to cross. */
export const ELEVENLABS_FREE_TIER_CHARS = 10_000;
export const ELEVENLABS_SAFETY_CEILING = 9_000;

export function countWords(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

export function estimateDuration(text: string): number {
  return countWords(text) / WORDS_PER_SECOND;
}

export function shortNarration(script: ShortScript): string {
  return script.beats.map((b) => b.text).join(' ');
}

export function longNarration(script: LongScript): string {
  return [script.coldOpen, ...script.chapters.map((c) => c.narration), script.closingSynthesis].join(' ');
}

export function fullNarration(script: ScriptBody): string {
  return script.mode === 'short' ? shortNarration(script) : longNarration(script);
}

export interface GuardrailIssue {
  severity: 'error' | 'warning';
  message: string;
}

/** Validates a generated script against the cadence caps before it can be synthesised. */
export function validateScript(script: ScriptBody): GuardrailIssue[] {
  const issues: GuardrailIssue[] = [];
  const words = countWords(fullNarration(script));

  if (script.mode === 'short') {
    if (words > SHORT_WORD_HARD_MAX) {
      issues.push({ severity: 'error', message: `${words} words exceeds the hard cap of ${SHORT_WORD_HARD_MAX}. Regenerate or trim before synthesising.` });
    } else if (words > SHORT_WORD_MAX) {
      issues.push({ severity: 'warning', message: `${words} words is over the ${SHORT_WORD_MAX}-word target — the short will run long.` });
    }
    if (words < SHORT_WORD_MIN) {
      issues.push({ severity: 'warning', message: `${words} words is under ${SHORT_WORD_MIN}; the short may feel thin.` });
    }
    if (script.beats.length !== 3) {
      issues.push({ severity: 'error', message: `Expected 3 beats (hook, mechanism, reframe), got ${script.beats.length}.` });
    }
  } else {
    if (words > LONG_WORD_MAX) {
      issues.push({ severity: 'error', message: `${words} words exceeds the ${LONG_WORD_MAX}-word cap.` });
    }
    if (words < LONG_WORD_MIN) {
      issues.push({ severity: 'warning', message: `${words} words is under the ${LONG_WORD_MIN}-word floor — the deep dive will feel rushed.` });
    }
    if (!script.closingSynthesis.toLowerCase().includes('stay curious')) {
      issues.push({ severity: 'warning', message: "Closing synthesis is missing Hoot's catchphrase." });
    }
  }

  return issues;
}

export interface QuotaCheck {
  allowed: boolean;
  estimatedChars: number;
  usedChars: number;
  remainingChars: number;
  ceiling: number;
  reason?: string;
}

/**
 * Pre-flight quota guard. Runs *before* any ElevenLabs call so a long script
 * cannot silently burn the month's allowance.
 */
export function checkVoiceQuota(text: string, usedChars: number, limitChars: number): QuotaCheck {
  const estimatedChars = text.length;
  const ceiling = Math.min(ELEVENLABS_SAFETY_CEILING, Math.floor(limitChars * 0.9));
  const remainingChars = Math.max(0, limitChars - usedChars);
  const projected = usedChars + estimatedChars;

  if (projected > ceiling) {
    return {
      allowed: false,
      estimatedChars,
      usedChars,
      remainingChars,
      ceiling,
      reason: `Synthesising would put you at ${projected.toLocaleString()} characters, past the ${ceiling.toLocaleString()} safety ceiling.`,
    };
  }

  return { allowed: true, estimatedChars, usedChars, remainingChars, ceiling };
}
