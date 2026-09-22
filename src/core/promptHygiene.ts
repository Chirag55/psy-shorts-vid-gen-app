/**
 * Post-generation checks on visual prompts.
 *
 * The brand bible tells the writer about Professor Hoot so it understands the
 * channel, and then tells it not to stage him. Models do not always hold both
 * at once, and an owl written into a Veo prompt becomes a second owl in the
 * finished video — the overlay is composited on top regardless. Stripping it
 * after the fact is cheap insurance against a wasted Flow generation.
 */

/** Words that would put an unwanted creature in frame. */
const MASCOT_TERMS = [
  'professor hoot',
  'hoot',
  'owl',
  'owlish',
];

const MASCOT_PATTERN = new RegExp(`\\b(${MASCOT_TERMS.join('|')})\\b`, 'i');

export function mentionsMascot(prompt: string): boolean {
  return MASCOT_PATTERN.test(prompt);
}

/**
 * Removes clauses that stage the mascot.
 *
 * Works clause by clause rather than on the whole string: a prompt is a list of
 * comma-separated descriptors, so dropping just the offending one keeps the rest
 * of the scene — and the style lock — intact.
 */
export function stripMascotFromPrompt(prompt: string): string {
  if (!mentionsMascot(prompt)) return prompt;

  const kept = prompt
    .split(',')
    .filter((clause) => !MASCOT_PATTERN.test(clause))
    .map((clause) => clause.trim())
    .filter(Boolean);

  // If every clause mentioned the mascot there is nothing meaningful left, so
  // return the original rather than an empty prompt — a visibly wrong clip is
  // better than a prompt that generates nothing.
  return kept.length ? kept.join(', ') : prompt;
}

export interface PromptAudit {
  cleaned: string;
  wasStripped: boolean;
}

export function auditVisualPrompt(prompt: string): PromptAudit {
  const cleaned = stripMascotFromPrompt(prompt);
  return { cleaned, wasStripped: cleaned !== prompt };
}
