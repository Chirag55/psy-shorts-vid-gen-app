/**
 * The mandatory STYLE_LOCK (spec §5.2).
 *
 * Every prompt handed to Veo or Imagen must terminate with this exact string —
 * it is what keeps generated clips looking like one continuous 2D editorial
 * documentary instead of unrelated AI stock footage.
 */
export const STYLE_LOCK =
  'modern 2D editorial animation, expressive character acting, smooth cinematic movement, ' +
  'rich dynamic lighting, silent video, no audio, no voices, no music, ' +
  'consistent with The Mind Files signature visual style';

/** Appends STYLE_LOCK unless the prompt already ends with it. Idempotent. */
export function withStyleLock(prompt: string): string {
  const body = prompt.trim().replace(/[,\s]+$/, '');
  if (body.toLowerCase().endsWith(STYLE_LOCK.toLowerCase())) return body;
  return `${body}, ${STYLE_LOCK}`;
}

/** True when the prompt already carries the lock — used for the storyboard badge. */
export function hasStyleLock(prompt: string): boolean {
  return prompt.trim().toLowerCase().endsWith(STYLE_LOCK.toLowerCase());
}

/**
 * Continuity preamble for clips 2 and 3 of a short (spec §5.3).
 * Restating wardrobe and setting is what stops Veo re-rolling the character.
 */
export function continuationPrefix(characterDescription: string): string {
  return `Continuation of previous clip: The exact same character ${characterDescription.trim()}`;
}
