/**
 * Prompts for typed visual beats ("MF065-C1 clip | cu | kitchen | ... | orbit").
 * Rebuilt from 6.1.13.
 */
import type { VisualBeat } from './shortFormat';

const STYLE_DAY =
  'Anime illustration, clean ink line art, soft cel shading, muted pastel palette of dusty blue and warm cream';
const STYLE_NIGHT =
  'Anime illustration, clean ink line art, soft cel shading, moody cool blue night palette with deep shadows';
const SIZES: Record<string, string> = {
  cu: 'close-up',
  'close-up': 'close-up',
  wide: 'wide shot',
  medium: 'medium shot',
  insert: 'insert shot of an object',
  macro: 'extreme macro close-up',
  overhead: 'overhead top-down shot',
  pov: 'first-person point-of-view shot',
  'over-shoulder': 'over-the-shoulder shot',
  split: 'two clearly separate halves in one frame',
};
const CAMERA: Record<string, string> = {
  orbit: 'slow orbit around the subject',
  handheld: 'subtle handheld drift',
  'whip-pan': 'fast whip pan that lands on the subject',
  'dolly-back': 'slow dolly back',
  'rack-focus': 'rack focus from foreground to subject',
  tracking: 'smooth tracking shot following the subject',
};
const ACCENTS = ['warm amber', 'teal', 'soft magenta', 'cool blue', 'fresh green'];
const DAY_LIGHTS = [
  'soft window daylight',
  'warm lamp light',
  'neon glow at dusk',
  'cool screen glow',
  'golden-hour sunlight',
  'overcast soft light',
];
const NIGHT_LIGHTS = [
  'rainy night street light',
  'late-night cafe lamp light',
  'a single window glow at night',
  'cool streetlight through rain',
  'dim lamp light in a still room',
  'blue night light with one warm lamp',
];
const FRAME =
  'Full-frame vertical 9:16 artwork (1080x1920): fully detailed, sharp scenery fills the entire frame from the top edge to the bottom edge and from the left edge to the right edge, with rich detail in every part of the image, including the very top and the very bottom. No blur, no empty space, no flat or blank areas, no bands, no borders, no letterboxing, no black bars. No readable text, no logos, no watermark. Natural neutral colour balance, no green or teal colour cast, no colour overlay, no heavy vignette.';
const NAMES_RE = /\b(Alex|Maya|Leo)(?:'s)?\b/g;

const upper = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const numberOf = (id: string) => Number(/MF(\d{3})/.exec(id)?.[1] ?? 0);

/** Named cast become "the character" so a single typed Short keeps one face. */
function unnamed(subject: string): string {
  if (!NAMES_RE.test(subject)) return subject;
  NAMES_RE.lastIndex = 0;
  return subject
    .replace(NAMES_RE, (_m, _name, at: number, whole: string) =>
      at === 0 || /[.!?]\s*$/.test(whole.slice(0, at)) ? 'The character' : 'the character',
    )
    .replace(/\b(her|his)\b/gi, (m) => (m[0] === 'H' ? 'Their' : 'their'))
    .replace(/\b(she|he)\b/gi, (m) => (m[0] === 'S' || m[0] === 'H' ? 'They' : 'they'));
}

export function beatLabel(beat: VisualBeat, setting?: string): string {
  const size = SIZES[beat.size.toLowerCase()] ?? beat.size.toLowerCase();
  return `${upper(size)}${setting ? `, ${setting}` : ''}`;
}

export function typedPrompt(
  beat: VisualBeat,
  index: number,
  setting?: string,
  character?: string,
  palette: 'warm' | 'dark' = 'warm',
): string {
  const n = numberOf(beat.id ?? '');
  const dark = palette === 'dark';
  const accent = dark ? 'warm amber' : ACCENTS[n % ACCENTS.length];
  const lights = dark ? NIGHT_LIGHTS : DAY_LIGHTS;
  const light = lights[(n + index) % lights.length];
  const same = character ? ` Same character in every shot: ${character.trim().replace(/[.,;\s]+$/, '')}.` : '';
  const size = SIZES[beat.size.toLowerCase()] ?? beat.size.toLowerCase();
  const line = `${upper(size)}${setting ? ` in ${setting}` : ''}: ${unnamed(beat.subject)}.`;
  const desc = `${dark ? STYLE_NIGHT : STYLE_DAY}, one ${accent} accent.${same} ${line} ${upper(light)}.`;
  if (beat.type !== 'still') {
    const camera = CAMERA[beat.camera] ?? beat.camera;
    const surprise = beat.type === 'clip*' ? ' The most surprising shot of the video.' : '';
    const motion = /-C1$/.test(beat.id ?? '')
      ? 'The action is already underway in the very first frame and moves at full speed from the first second: no establishing hold, no fade-in, no slow start. 6 seconds, no cuts, silent.'
      : 'One continuous 6-second shot, no cuts, silent.';
    return `Camera: ${camera}. ${desc} ${motion}${surprise} ${FRAME}`;
  }
  return `One single image, not a collage or panels. ${desc} ${FRAME}`;
}
