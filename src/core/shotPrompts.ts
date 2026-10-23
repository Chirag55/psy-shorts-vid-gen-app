/**
 * Prompts for scene-first shots (CR-91 Shorts) and long-form screenplay scenes.
 * Rebuilt from 6.1.13.
 */
export const SHOT_STYLE =
  'Modern TV anime illustration, clean uniform ink line art, soft cel shading with gentle gradients, hand-painted background layers with soft depth of field, muted pastel palette anchored on dusty blue and warm cream with one warm accent color per scene, realistic adult proportions, expressive but grounded faces, cinematic lighting, high detail, sharp focus, no photorealism, no 3D render look.';
export const SHOT_MOOD =
  'Moody, atmospheric, cinematic mood that matches the emotion of the moment; the light comes from the scene itself (rain, night, lamps, dawn).';
export const SHOT_NEG =
  'No readable text, no letters or numbers, no logos, no owls, no mascot, adult characters only, no black bars, no blank space, no watermark. Natural neutral colour balance, no green or teal colour cast, no colour overlay, no heavy vignette.';
export const FRAME_9X16 =
  'Full-frame vertical 9:16 artwork (1080x1920): fully detailed, sharp scenery fills the entire frame from the top edge to the bottom edge and from the left edge to the right edge, with rich detail in every part of the image, including the very top and the very bottom. No blur, no empty space, no flat or blank areas, no bands, no borders, no letterboxing, no black bars.';
export const FRAME_16X9 =
  'Full-frame horizontal 16:9 artwork (1920x1080): fully detailed, sharp scenery fills the entire frame from the top edge to the bottom edge and from the left edge to the right edge, with rich detail in every part of the image. No blur, no empty space, no flat or blank areas, no bands, no borders, no letterboxing, no black bars.';
/** A10 (Gemini, 23 Oct 2026): every Short's lighting anchor; it overrides daylight named in the scene. */
export const SHORT_LIGHT =
  'Lighting: dramatic chiaroscuro lighting, dark moody background, warm rim light, deep shadows, high-contrast thriller aesthetic, intense psychological thriller mood. This lighting overrides any daylight named in the scene description; the figures stay clearly lit and readable.';
/** A10: a close-up first beat is an extreme close-up that fills the frame. */
export const FIRST_BEAT_CU = 'extreme close-up, the face or eyes fill about 70% of the vertical frame';
export const FROZEN = 'The moment is caught mid-action, as if paused at its most dramatic instant.';
export const CLIP_RULES =
  'One continuous shot of up to 8 seconds with clear, natural movement in the subject (not a frozen picture), no cuts. At most two characters; keep faces, hair and clothes exactly as described for the whole clip.';

const SIZE_WORDS: Record<string, string> = {
  cu: 'close-up',
  wide: 'wide establishing shot',
  medium: 'medium shot',
  insert: 'insert shot of an object or detail',
  ots: 'over-the-shoulder shot',
  profile: 'side-profile close-up',
};
const MOVES: Record<string, string> = {
  'slow push-in': 'very slow push-in',
  'slow pull-out': 'very slow pull-out',
  'slow pan-left': 'slow pan to the left',
  'slow pan-right': 'slow pan to the right',
  'slow tilt-up': 'slow tilt upward',
  'slow tilt-down': 'slow tilt downward',
  'slow tracking': 'slow, smooth tracking shot',
};
const CAST_ORDER = ['Alex', 'Maya', 'Leo', 'Nora', 'Ryan'];

const cap = (s: string) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);
const sizeWords = (size: string) => SIZE_WORDS[size.toLowerCase()] ?? size;
const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const nameOf = (look: string) => /^([^,]+),/.exec(look)?.[1]?.trim() ?? '';
const rank = (look: string) => {
  const i = CAST_ORDER.indexOf(nameOf(look));
  return i < 0 ? CAST_ORDER.length : i;
};

/** The character looks ("Maya, 30s, ...") of everyone named in `text`, in cast order. */
export function lookLines(text: string, looks: string[] = []): string {
  return [...looks]
    .sort((a, b) => rank(a) - rank(b))
    .filter((l) => {
      const name = nameOf(l);
      return Boolean(name) && new RegExp(`\\b${esc(name)}\\b`).test(text);
    })
    .join(' ');
}

export interface ShortShot {
  id: string;
  kind: string;
  size: string;
  setting: string;
  action: string;
  move: string;
}

export interface SceneShot {
  id: string;
  size: string;
  setting: string;
  action: string;
  move: string;
}

/** "the same kitchen" names the first setting so every clip re-states it. */
export function settingOf(shot: { setting: string }, firstSetting?: string): string {
  return /^(the )?same\b/i.test(shot.setting) && firstSetting && !shot.setting.includes('(')
    ? `${shot.setting} (${firstSetting})`
    : shot.setting;
}

export function shortShotPrompt(
  shot: ShortShot,
  opts: { firstSetting?: string; looks?: string[]; withId?: boolean; first?: boolean },
): string {
  // A10: daylight words give way to the thriller lighting; beat 1 opens on an extreme close-up.
  const setting = settingOf(shot, opts.firstSetting).replace(/\b(sunlit|sunny|bright|sunshine)\b/gi, 'dim');
  const looks = lookLines(shot.action, opts.looks);
  const size = opts.first && shot.size.toLowerCase() === 'cu' ? FIRST_BEAT_CU : sizeWords(shot.size);
  const head = `${SHOT_STYLE} ${looks ? `${looks} ` : ''}${cap(size)}, ${setting}: ${shot.action}.`;
  let p: string;
  if (shot.kind !== 'still') {
    p = `${head} Camera: ${MOVES[shot.move] ?? shot.move}. ${CLIP_RULES} ${SHOT_MOOD} ${SHORT_LIGHT} ${FRAME_9X16} ${SHOT_NEG}`;
  } else {
    const frozen = /S1$/.test(shot.id) ? FROZEN : '';
    p = `${head} ${frozen} ${SHOT_MOOD} ${SHORT_LIGHT} ${FRAME_9X16} ${SHOT_NEG}`.replace(/ {2}/g, ' ');
  }
  return opts.withId ? `${shot.id} | ${p}` : p;
}

export function sceneClipPrompt(scene: SceneShot, opts: { looks?: string[]; withId?: boolean }): string {
  const looks = lookLines(`${scene.action} ${scene.setting}`, opts.looks);
  const p = `${SHOT_STYLE} ${looks ? `${looks} ` : ''}${cap(sizeWords(scene.size))}, ${scene.setting}: ${scene.action}. Camera: ${
    MOVES[scene.move] ?? scene.move
  }. ${CLIP_RULES} ${SHOT_MOOD} ${FRAME_16X9} ${SHOT_NEG}`.replace(/ {2}/g, ' ');
  return opts.withId ? `${scene.id} | ${p}` : p;
}

export function sceneStillPrompt(scene: SceneShot, opts: { looks?: string[]; withId?: boolean }): string {
  const looks = lookLines(`${scene.action} ${scene.setting}`, opts.looks);
  const p = `${SHOT_STYLE} ${looks ? `${looks} ` : ''}${cap(sizeWords(scene.size))}, ${scene.setting}: ${scene.action}. ${SHOT_MOOD} ${FRAME_16X9} ${SHOT_NEG}`.replace(
    / {2}/g,
    ' ',
  );
  return opts.withId ? `${scene.id} | ${p}` : p;
}
