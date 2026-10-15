import { stripMascotFromPrompt } from './promptHygiene';

/**
 * The mandatory STYLE_LOCK. Every prompt handed to Flow (Veo/Imagen) ends with
 * this exact string so clips and stills read as one anime series.
 */
export const STYLE_LOCK =
  'Modern TV anime illustration, clean uniform ink line art, soft cel shading with gentle gradients, hand-painted background layers with soft depth of field, muted pastel palette anchored on dusty blue and warm cream with one warm accent color per scene, realistic adult proportions, expressive but grounded faces, cinematic lighting, high detail, sharp focus, no photorealism, no 3D render look, silent video, no audio, no voices, no music, no on-screen text, anime art style';

/** Older locks that are swapped for the current one when a prompt is re-finalised. */
const LEGACY_LOCKS = [
  'expressive character acting, smooth cinematic movement, rich dynamic lighting, clean line art, cel shading, the same character design in every shot, silent video, no audio, no voices, no music, no on-screen text, anime art style',
  'modern 2D editorial animation, expressive character acting, smooth cinematic movement, rich dynamic lighting, silent video, no audio, no voices, no music, consistent with The Mind Files signature visual style',
];

/** Long-form stills must fill a 16:9 frame edge to edge. */
export const FRAME16 =
  'Full-frame horizontal 16:9 artwork (1920x1080): fully detailed, sharp scenery fills the entire frame from the top edge to the bottom edge and from the left edge to the right edge, with rich detail in every part of the image. No blur, no empty space, no flat or blank areas, no bands, no borders, no letterboxing, no black bars.';

const STOP_WORDS = new Set(['with', 'and', 'the', 'her', 'his', 'their', 'a', 'an', 'in', 'of', 'on', 'wearing', 'who', 'has']);

export function withLongFrame(prompt: string): string {
  return `${withStyleLock(prompt)}. ${FRAME16}`;
}

/** Appends STYLE_LOCK unless already there, replacing a legacy lock. Idempotent; keeps a trailing FRAME16. */
export function withStyleLock(prompt: string): string {
  let body = prompt.trim();
  if (body.endsWith(FRAME16)) {
    return withLongFrame(body.slice(0, body.length - FRAME16.length).replace(/[.\s]+$/, ''));
  }
  body = body.replace(/[,\s]+$/, '');
  if (body.toLowerCase().endsWith(STYLE_LOCK.toLowerCase())) return body;
  for (const legacy of LEGACY_LOCKS) {
    if (body.toLowerCase().endsWith(legacy.toLowerCase())) {
      body = body.slice(0, body.length - legacy.length).replace(/[,\s]+$/, '');
      break;
    }
  }
  return body ? `${body}, ${STYLE_LOCK}` : STYLE_LOCK;
}

/** True when the prompt already carries the lock — used for the storyboard badge. */
export function hasStyleLock(prompt: string): boolean {
  let body = prompt.trim();
  if (body.endsWith(FRAME16)) body = body.slice(0, body.length - FRAME16.length).replace(/[.\s]+$/, '');
  return body.toLowerCase().endsWith(STYLE_LOCK.toLowerCase());
}

/**
 * Prefixes the recurring character's description unless the prompt already
 * restates most (60%) of its distinctive words.
 */
export function withCharacter(prompt: string, character?: string | null): string {
  const desc = (character ?? '').trim().replace(/[.,;\s]+$/, '');
  if (!desc) return prompt;
  const words = [...new Set(desc.toLowerCase().match(/[a-z]+/g) ?? [])].filter((w) => w.length >= 4 && !STOP_WORDS.has(w));
  const lower = prompt.toLowerCase();
  const hits = words.filter((w) => lower.includes(w)).length;
  if (words.length && hits / words.length >= 0.6) return prompt;
  return `Recurring character, identical in every shot: ${desc}. ${prompt.trim()}`;
}

/** Mascot-stripped, character-anchored, style-locked: the one place a visual prompt is finished. */
export function finalisePrompt(prompt: string, opts: { character?: string | null } = {}): string {
  let p = stripMascotFromPrompt(prompt);
  if (opts.character) p = withCharacter(p, opts.character);
  return withStyleLock(p);
}

export function characterReferencePrompt(character: string): string {
  const desc = character.trim().replace(/[.,;\s]+$/, '');
  return withStyleLock(
    `Character reference sheet for one recurring character: ${desc}. ` +
      'Full body front view and a close-up of the face side by side, neutral expression, ' +
      'plain light grey background, soft even lighting, no props, no other people',
  );
}

/** Continuity preamble for clips 2 and 3 of a short: restating wardrobe and setting stops Veo re-rolling the character. */
export function continuationPrefix(characterDescription: string): string {
  return `Continuation of previous clip: The exact same character ${characterDescription.trim()}`;
}
