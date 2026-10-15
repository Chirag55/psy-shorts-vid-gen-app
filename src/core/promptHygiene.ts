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

/** Drops the comma-separated descriptors that stage the mascot, sentence by sentence, keeping each sentence's end mark. */
function stripSentence(sentence: string): string {
  const end = /[.!?;]$/.exec(sentence.trim())?.[0] ?? '';
  const body = end ? sentence.trim().slice(0, -1) : sentence.trim();
  const kept = body.split(',').map((c) => c.trim()).filter((c) => c && !MASCOT_PATTERN.test(c));
  return kept.length ? `${kept.join(', ')}${end}` : '';
}

/**
 * Removes clauses that stage the mascot. If every clause mentioned it, the
 * original is returned: a visibly wrong clip beats a prompt that makes nothing.
 */
export function stripMascotFromPrompt(prompt: string): string {
  if (!MASCOT_PATTERN.test(prompt)) return prompt;
  const kept = prompt.split(/(?<=[.!?;])\s+/).map(stripSentence).filter(Boolean);
  return kept.length ? kept.join(' ') : prompt;
}

export interface PromptAudit {
  cleaned: string;
  wasStripped: boolean;
}

export function auditVisualPrompt(prompt: string): PromptAudit {
  const cleaned = stripMascotFromPrompt(prompt);
  return { cleaned, wasStripped: cleaned !== prompt };
}
