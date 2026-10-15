import { citationHits } from './citations';
import { checkHook, checkHookText, checkLoopBridge, checkShortTitle, wordBudget } from './hooks';
import type { LongScript, ShortScript, ScriptBody } from './types';

/**
 * Retention and cost guardrails, checked client-side after generation as well
 * as written into the prompt: a script past the word cap makes audio that will
 * not fit the clip budget, and that costs real credits.
 */

/** Human speaking cadence the whole system is calibrated to. */
export const WORDS_PER_SECOND = 2.4;

export const SHORT_WORD_MAX = 66;
export const SHORT_WORD_HARD_MAX = 66;
export const SHORT_WORD_MIN = 44;
export const SHORT_LIST_WORD_MAX = 82;
/** The slower, calmer delivery Shorts are voiced at. */
export const CALM_WORDS_PER_SECOND = 2.1;
export const SHORT_MAX_SECONDS = 45;

export const LONG_WORD_MAX = 700;
export const LONG_WORD_MIN = 450;

/** Free-tier ElevenLabs allowance, and the ceiling we refuse to cross. */
export const ELEVENLABS_FREE_TIER_CHARS = 10_000;
export const ELEVENLABS_SAFETY_CEILING = 9_000;

/** Seconds a Short of `words` words runs at the calm pace, with 2 s of breath. */
export function estimatedShortSeconds(words: number): number {
  return words / CALM_WORDS_PER_SECOND + 2;
}

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

  if (script.mode !== 'short') {
    const cap = script.wordTarget ?? LONG_WORD_MAX;
    if (words > cap) issues.push({ severity: 'error', message: `${words} words exceeds the ${cap}-word cap.` });
    if (script.structure === 'numbered' && (script.chapters.length < 5 || script.chapters.length > 7)) {
      issues.push({ severity: 'warning', message: `A numbered deep dive should have 5-7 chapters; this one has ${script.chapters.length}.` });
    }
    const floor = script.wordTarget ? Math.floor(script.wordTarget * 0.8) : LONG_WORD_MIN;
    if (words < floor) issues.push({ severity: 'warning', message: `${words} words is under the ${floor}-word floor — the deep dive will feel rushed.` });
    if (!script.closingSynthesis.toLowerCase().includes('stay curious')) {
      issues.push({ severity: 'warning', message: "Closing synthesis is missing Hoot's catchphrase." });
    }
    return issues;
  }

  const budget = wordBudget(script.structure, script.wordTarget);
  const assigned = Boolean(script.bankEntryId);
  if (words > budget.hardMax) {
    issues.push({ severity: 'error', message: `${words} words exceeds the hard cap of ${budget.hardMax}. Regenerate or trim before synthesising.` });
  } else if (words > budget.max) {
    issues.push({ severity: 'warning', message: `${words} words is over the ${budget.max}-word target — the short will run long.` });
  }
  if (words < budget.min) issues.push({ severity: 'warning', message: `${words} words is under ${budget.min}; the short may feel thin.` });
  if (estimatedShortSeconds(words) > SHORT_MAX_SECONDS) {
    issues.push({
      severity: 'error',
      message: `${words} words runs about ${Math.round(estimatedShortSeconds(words))} s at the calm pace, over ${SHORT_MAX_SECONDS} s. Cut it before synthesising.`,
    });
  }
  if (script.hookTextPov !== undefined) {
    const pov = script.hookTextPov.trim();
    const n = countWords(pov);
    if (!/^POV:/.test(pov) || n < 3 || n > 9 || /\b(19|20)\d\d\b/.test(pov)) {
      issues.push({ severity: 'warning', message: `POV banner "${pov}" should start "POV:", run 3 to 9 words and name no year (CR-88D).` });
    }
  }
  if (!assigned && !script.scriptSource) {
    const hits = citationHits(fullNarration(script));
    if (hits.length) {
      issues.push({ severity: 'warning', message: `The voice cites its source ("${hits.join('", "')}"). Put it in the source line; the script should state the effect as plain fact.` });
    }
  }
  const beats = script.beats.length;
  if (!script.scriptSource && (beats < budget.beats || beats > (budget.maxBeats ?? budget.beats))) {
    const expected = budget.maxBeats ? `${budget.beats}-${budget.maxBeats}` : String(budget.beats);
    const shape =
      script.structure === 'rapid' ? 'hook, the list items, closer' : script.structure === 'test' ? 'instruction, reveal, closer' : 'hook, mechanism, reframe';
    issues.push({ severity: 'error', message: `Expected ${expected} beats (${shape}), got ${beats}.` });
  }
  if (script.structure === 'test' && script.stimulus && !script.stimulus.card) {
    issues.push({ severity: 'warning', message: 'The stimulus came back without a layout; the app will show its description as plain text.' });
  }
  if (script.hookText !== undefined || script.loopBridge !== undefined) {
    for (const m of checkHook(script.beats[0]?.text ?? '', script.tactic, { assigned })) issues.push({ severity: 'error', message: `Hook: ${m}` });
    for (const m of checkHookText(script.hookText)) issues.push({ severity: 'warning', message: m });
    if (!/stay curious, stay sharp\.?\s*$/i.test(fullNarration(script))) {
      for (const m of checkLoopBridge(script)) issues.push({ severity: 'warning', message: `Loop: ${m}` });
    }
    for (const m of checkShortTitle(script.title, { tactic: script.tactic, assigned })) issues.push({ severity: 'warning', message: `Title: ${m}` });
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
 * Pre-flight quota guard. Runs before any ElevenLabs call so a long script
 * cannot silently burn the month's allowance.
 */
export function checkVoiceQuota(text: string, usedChars: number, limitChars: number): QuotaCheck {
  const estimatedChars = text.length;
  const ceiling = limitChars > 0 ? Math.floor(limitChars * 0.9) : ELEVENLABS_SAFETY_CEILING;
  const remainingChars = Math.max(0, limitChars - usedChars);
  const base = { estimatedChars, usedChars, remainingChars, ceiling };
  if (!(usedChars + estimatedChars > ceiling)) return { allowed: true, ...base };
  const left = Math.max(0, ceiling - usedChars);
  return {
    allowed: false,
    ...base,
    reason:
      `This needs about ${estimatedChars.toLocaleString()} characters and only ${left.toLocaleString()} are left before the ` +
      `${ceiling.toLocaleString()} safety ceiling this month (${usedChars.toLocaleString()} used). Upgrade the ElevenLabs plan ` +
      'for this month, make a shorter version, or wait for the allowance to reset (CR-88F).',
  };
}
