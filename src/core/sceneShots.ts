/**
 * Turns a scene-first entry's visual beats into the render's shot plan:
 * one picture per beat, placed against the voiced segments, with the
 * pattern-interrupt beat, punch-ins and calm (slower) Shorts.
 * Rebuilt from 6.1.13.
 */
import type { KenBurnsMove } from './types';
import type { Shot } from './shots';
import { parseVisualBeat, SHOT_COUNT, sizeFamily, type VisualBeat } from './shortFormat';
import { typedPrompt } from './typedPrompt';
import { shortShotPrompt } from './shotPrompts';

export const ACCENTS = ['amber', 'teal', 'magenta', 'cool blue', 'green'];
export const LIGHTS = ['window daylight', 'a warm lamp', 'a neon sign', 'dusk', 'cool screen glow'];
export const INTERRUPT_BEAT = 2;
export const MAX_FACE_BEATS = 2;
export const CALM_MIN_SHOT_SECONDS = 4.5;
const CALM_STRETCH = 1.1428571428571428;

const PERSON_RE =
  /\b(alex|maya|leo|sam|nora|ben|lena|theo|mia|ryan|zoe|max|ella|jonah|ivy|he|she|his|her|him|they|face|smil\w*|eyes?|stares?|grins?|frowns?|coworker|friend|stranger|salesperson|boss)\b/i;
const SIZE_PHRASE: Record<string, string> = {
  close: 'close-up',
  wide: 'wide shot',
  insert: 'extreme close-up insert',
  pov: 'first-person point-of-view shot',
  medium: 'medium shot',
  ots: 'over-the-shoulder shot',
};
const MOVE_CYCLE: KenBurnsMove[] = ['pan_right', 'zoom_out', 'pan_left', 'zoom_in'];
const REVERSE: Record<string, KenBurnsMove> = {
  zoom_in: 'zoom_out',
  zoom_out: 'zoom_in',
  pan_left: 'pan_right',
  pan_right: 'pan_left',
  tilt_up: 'tilt_down',
  tilt_down: 'tilt_up',
};
const STILL_TAIL =
  ' as the accent light or one prop. Full-frame vertical 9:16 artwork (1080x1920): fully detailed, sharp scenery fills the entire frame from the top edge to the bottom edge and from the left edge to the right edge, with rich detail in every part of the image, including the very top and the very bottom. No blur, no empty space, no flat or blank areas, no bands, no borders, no letterboxing, no black bars. No readable text';

export interface Segment {
  seconds: number;
}

export type SceneShot = Shot & {
  planSec?: number;
  interrupt?: boolean;
  punch?: boolean;
  move?: KenBurnsMove;
  beatId?: string;
  beatType?: string;
  promptFinal?: boolean;
  held?: boolean;
};

const total = (segs: Segment[]) => segs.reduce((a, s) => a + s.seconds, 0);

export function showsPerson(b: VisualBeat): boolean {
  return sizeFamily(b.size) !== 'insert' && PERSON_RE.test(b.subject);
}

export function showsFace(b: VisualBeat): boolean {
  const f = sizeFamily(b.size);
  if (f === 'pov' || f === 'insert') return false;
  return PERSON_RE.test(b.subject);
}

export function cameraPhrase(camera: string): string | undefined {
  const c = camera.toLowerCase();
  if (/whip/.test(c)) return 'Whip pan';
  if (/orbit/.test(c)) return 'Slow orbit';
  if (/tracking/.test(c)) return 'Tracking shot';
  if (/tilt[- ]?up/.test(c)) return 'Slow tilt up';
  if (/tilt[- ]?down/.test(c)) return 'Slow tilt down';
  if (/pull[- ]?(back|out)|push[- ]out|dolly[- ]?back/.test(c)) return 'Slow pull back';
  if (/push|dolly/.test(c)) return 'Slow push in';
  if (/handheld|drift/.test(c)) return 'Handheld drift';
  if (/rack/.test(c)) return 'Rack focus';
  if (/top[- ]?down|overhead/.test(c)) return 'Overhead shot';
  if (/macro/.test(c)) return 'Macro insert';
  return undefined;
}

export function actionFor(camera: string): string {
  const c = camera.toLowerCase();
  if (/whip/.test(c)) return 'whips across the frame';
  if (/orbit/.test(c)) return 'circles slowly around the subject';
  if (/tracking/.test(c)) return 'tracks alongside the subject';
  if (/tilt[- ]?up/.test(c)) return 'tilts slowly upward';
  if (/tilt[- ]?down/.test(c)) return 'tilts slowly downward';
  if (/pull[- ]?(back|out)|push[- ]out|dolly[- ]?back/.test(c)) return 'pulls slowly back';
  if (/push|dolly/.test(c)) return 'pushes slowly in';
  if (/handheld|drift/.test(c)) return 'drifts through the scene';
  if (/rack/.test(c)) return 'shifts focus across the frame';
  if (/top[- ]?down|overhead/.test(c)) return 'slides into view from above';
  if (/macro/.test(c)) return 'slides into sharp focus';
  return 'comes into view';
}

export function reverseMove(move: KenBurnsMove): KenBurnsMove {
  return REVERSE[move];
}

/** The Ken Burns move a still takes for a written camera move. */
export function stillMove(camera: string): KenBurnsMove {
  const c = camera.toLowerCase();
  if (/tilt[- ]?up/.test(c)) return 'tilt_up';
  if (/tilt[- ]?down/.test(c)) return 'tilt_down';
  if (/pull[- ]?(back|out)|push[- ]out|zoom out/.test(c)) return 'zoom_out';
  if (/pan[- ]left/.test(c)) return 'pan_left';
  if (/pan[- ]right/.test(c)) return 'pan_right';
  if (/pan|whip|handheld|drift/.test(c)) return 'pan_right';
  if (/push|zoom|dolly/.test(c)) return 'zoom_in';
  return 'pan_right';
}

/** Moves per beat; neighbours never repeat a move. */
export function beatMoves(cameras: string[]): KenBurnsMove[] {
  const out: KenBurnsMove[] = [];
  cameras.forEach((c, i) => {
    let m = stillMove(c);
    for (let k = 0; i && m === out[i - 1] && k < MOVE_CYCLE.length; k++) {
      m = MOVE_CYCLE[(MOVE_CYCLE.indexOf(m) + 1) % MOVE_CYCLE.length];
    }
    out.push(m);
  });
  return out;
}

/** Stable accent and per-beat light for an entry id. */
export function sceneSeeds(id: string, count: number): { accent: string; lights: string[] } {
  const h = [...id].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7);
  return {
    accent: ACCENTS[h % ACCENTS.length],
    lights: Array.from({ length: count }, (_, i) => LIGHTS[(h + i * 2) % LIGHTS.length]),
  };
}

/** Which segment a point (0..1 of the voiced length) falls in. */
export function beatAt(segments: Segment[], at: number): number {
  const sum = total(segments) || 1;
  let cum = 0;
  for (let i = 0; i < segments.length; i++) {
    cum += segments[i].seconds / sum;
    if (at < cum - 1e-9) return i;
  }
  return Math.max(0, segments.length - 1);
}

export function usableBeats(lines?: string[] | null): VisualBeat[] | null {
  if (!lines || lines.length < 3) return null;
  const beats = lines.map(parseVisualBeat);
  return beats.every(Boolean) ? (beats as VisualBeat[]) : null;
}

export function calmBeatCount(seconds: number): number {
  return Math.max(4, Math.min(6, Math.floor(seconds / CALM_MIN_SHOT_SECONDS)));
}

/** A calm typed Short drops stills so every picture holds at least 4.5 s. */
export function calmBeats(beats: VisualBeat[], seconds = 27): VisualBeat[] {
  const pattern = ['clip', 'still', 'clip', 'still', 'still', 'clip'];
  if (beats.length !== 6 || !beats.every((b, i) => b.type?.replace('*', '') === pattern[i])) return beats;
  const count = calmBeatCount(seconds);
  const keep = count >= 6 ? [0, 1, 2, 3, 4, 5] : count !== 5 ? [0, 1, 2, 5] : [0, 1, 2, 3, 5];
  return keep.map((i) => beats[i]);
}

export function calmAudioSeconds(segments: Segment[]): number {
  return total(segments) * CALM_STRETCH;
}

/** CR-91: 6 to 12 typed shots (A12), all slow moves, exactly three clips. */
export function isSlowShots(beats: VisualBeat[]): boolean {
  const clips = beats.filter((b) => b.type?.startsWith('clip')).length;
  return (
    beats.length >= 6 && beats.length <= SHOT_COUNT.max && beats.every((b) => b.type && /^slow\b/i.test(b.camera)) && clips === 3
  );
}

/** The segment each of `count` evenly spaced shots starts in. */
export function shotStartBeats(segments: Segment[], count: number): number[] {
  return Array.from({ length: count }, (_, i) => beatAt(segments, i / count + 1e-9));
}

function slowShots(beats: VisualBeat[], segments: Segment[], opts: { looks?: string[] } = {}): SceneShot[][] {
  const looks = opts.looks ?? [];
  const sum = total(segments) || 1;
  const n = beats.length;
  const firstSetting = beats[0]?.setting ?? '';
  const shots: SceneShot[] = beats.map((b, i) => {
    const insert = sizeFamily(b.size) === 'insert';
    const clip = Boolean(b.type?.startsWith('clip'));
    return {
      source: clip ? 'clip' : 'still',
      setting: b.setting || 'the scene',
      subject: insert ? 'object insert' : 'the character',
      action: actionFor(b.camera),
      durationSec: 0,
      planSec: sum / n,
      isCutaway: insert,
      clipPrompt: shortShotPrompt(
        { id: b.id ?? `S${i + 1}`, kind: clip ? 'clip' : 'still', size: b.size, setting: b.setting, action: b.subject, move: b.camera },
        { firstSetting, looks, first: i === 0 },
      ),
      beat: i,
      interrupt: clip,
      move: stillMove(b.camera),
      beatId: b.id,
      beatType: b.type,
      promptFinal: true,
      held: true,
    } as SceneShot;
  });
  const owner = shotStartBeats(segments, n);
  const starts = segments.map((_, j) => total(segments.slice(0, j)) / sum);
  return segments.map((_, j) => {
    const own = shots.filter((_s, k) => owner[k] === j);
    if (own.length) return own;
    const idx = Math.min(n - 1, Math.max(0, Math.floor(starts[j] * n + 1e-9)));
    return [{ ...shots[idx], interrupt: false, punch: true, continues: true, planSec: 0 }];
  });
}

export interface SceneShotOptions {
  character?: string;
  mood?: 'warm' | 'dark';
  calm?: boolean;
  looks?: string[];
}

/**
 * Shots per voiced segment. `seed` is the entry id; `opts` may be the
 * character description on its own.
 */
export function sceneShots(
  seed: string,
  visualBeats: VisualBeat[],
  segments: Segment[],
  options: SceneShotOptions | string = {},
): SceneShot[][] {
  const opts: SceneShotOptions = typeof options === 'string' ? { character: options } : options;
  const character = opts.character;
  const mood = opts.mood ?? 'warm';
  const calm = opts.calm ?? false;
  if (isSlowShots(visualBeats)) return slowShots(visualBeats, segments, options as { looks?: string[] });

  const beats = calm ? calmBeats(visualBeats, calmAudioSeconds(segments)) : visualBeats;
  const n = beats.length;
  const { accent, lights } = sceneSeeds(seed, n);
  const typed = beats.every((b) => b.type);
  const slow = (m: KenBurnsMove): KenBurnsMove => (m === 'tilt_up' ? 'zoom_in' : m === 'tilt_down' ? 'zoom_out' : m);
  const moves = typed
    ? beats.map((b) => (calm ? slow(stillMove(b.camera)) : stillMove(b.camera)))
    : beatMoves(beats.map((b) => b.camera));

  let faces = 0;
  const fromBehind = beats.map((b) => {
    const f = sizeFamily(b.size);
    if (f === 'pov' || f === 'insert' || !PERSON_RE.test(b.subject)) return false;
    faces++;
    return faces > MAX_FACE_BEATS;
  });

  let lastSetting = '';
  const shots: SceneShot[] = beats.map((b, i) => {
    lastSetting = b.setting || lastSetting;
    const fam = sizeFamily(b.size);
    const interrupt = i === INTERRUPT_BEAT && n >= 3;
    const cam = interrupt && !typed ? 'Whip pan' : cameraPhrase(b.camera);
    const subject = fromBehind[i] ? `${b.subject}, seen from behind, no face in frame` : b.subject;
    const insert = fam === 'insert' || (fam === 'pov' && !PERSON_RE.test(b.subject));
    let prompt: string;
    if (!typed) {
      const size = SIZE_PHRASE[fam] ?? b.size.toLowerCase();
      const head = `${interrupt ? 'Pattern interrupt. ' : ''}${cam ? `${cam}. ` : ''}A ${size}${
        lastSetting ? ` in the ${lastSetting}` : ''
      }: ${subject}. `;
      const light = lights[i];
      prompt = head + `${light[0].toUpperCase()}${light.slice(1)} lighting, with ${accent}${STILL_TAIL}`;
    } else {
      const person = fam !== 'insert' && PERSON_RE.test(b.subject);
      prompt = typedPrompt(b, i, lastSetting, person ? character : undefined, mood);
    }
    const shot: SceneShot = {
      source: 'still',
      setting: lastSetting || 'the scene',
      subject: insert ? 'object insert' : 'the character',
      action: actionFor(b.camera),
      durationSec: 0,
      isCutaway: insert,
      clipPrompt: prompt,
      beat: i,
      interrupt,
      move: moves[i],
    };
    return { ...shot, ...(typed ? { beatId: b.id, beatType: b.type, promptFinal: true } : {}) };
  });

  const placed: { shot: SceneShot; at: number }[] = calm
    ? shots.map((shot, i) => ({ shot, at: (i + 0.5) / n }))
    : shots.flatMap((shot, i) => [
        { shot, at: (2 * i + 0.5) / (2 * n) },
        {
          shot: {
            ...shot,
            interrupt: false,
            punch: true,
            move: typed ? REVERSE[shot.move as string] : 'zoom_in',
            clipPrompt: `${
              typed ? 'The same picture again, the camera move reversed.' : 'Punch in on the key detail of the same picture.'
            } ${(shot.clipPrompt ?? '').replace(/^Pattern interrupt\.\s*/, '')}`,
          },
          at: (2 * i + 1.5) / (2 * n),
        },
      ]);

  const out: SceneShot[][] = segments.map(() => []);
  for (const p of placed) out[beatAt(segments, p.at)].push(p.shot);
  out.forEach((list, j) => {
    if (list.length) return;
    const mid = (total(segments.slice(0, j)) + segments[j].seconds / 2) / (total(segments) || 1);
    const near = placed.reduce((best, p) => (Math.abs(p.at - mid) < Math.abs(best.at - mid) ? p : best), placed[0]);
    list.push({
      ...near.shot,
      punch: true,
      interrupt: false,
      move: typed ? REVERSE[near.shot.move as string] : 'zoom_in',
    });
  });
  return out;
}
