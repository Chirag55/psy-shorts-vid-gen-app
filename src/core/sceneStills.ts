/**
 * Long-form screenplay scenes → per-chapter visuals, cut where each scene's
 * starts_at words are spoken. Rebuilt from 6.1.13.
 */
import type { KenBurnsMove } from './types';
import type { ScreenplayScene } from './bankV2';
import { stillMove } from './sceneShots';
import { lookLines, sceneClipPrompt, sceneStillPrompt } from './shotPrompts';

export interface SceneVisual {
  key: string;
  kind: 'clip' | 'still';
  prompt: string;
  text: string;
  words: number;
  kenBurns: KenBurnsMove;
  role: 'anchor' | 'insert' | 'cast' | 'metaphor';
  size: 'close' | 'wide' | 'object' | 'medium';
  setting: string;
  subject: string;
  cue: string;
  reuse?: string;
}

const norm = (w: string) => w.toLowerCase().replace(/[^a-z0-9']/g, '');
const spokenWords = (text: string) => text.split(/\s+/).filter(Boolean);

export function scenesOfChapter(scenes: ScreenplayScene[], title: string): ScreenplayScene[] {
  return scenes.filter((s) => s.chapter.trim().toLowerCase() === title.trim().toLowerCase());
}

export function sceneMove(move: string): KenBurnsMove {
  return stillMove(move);
}

export function showsCharacter(scene: ScreenplayScene, looks?: string[]): boolean {
  return Boolean(lookLines(`${scene.action} ${scene.setting}`, looks));
}

/** Index of the first of up to 10 words of `phrase` in `words`, from `from`. */
export function startWordIndex(words: string[], phrase: string, from = 0): number {
  const probe = spokenWords(phrase).slice(0, 10).map(norm).filter(Boolean);
  if (!probe.length) return -1;
  const said = words.map(norm);
  for (let i = from; i + probe.length <= said.length; i++) {
    if (probe.every((w, k) => said[i + k] === w)) return i;
  }
  return -1;
}

export function sceneStartsIn(
  words: string[],
  scenes: ScreenplayScene[],
): { scene: ScreenplayScene; start: number }[] {
  const out: { scene: ScreenplayScene; start: number }[] = [];
  let from = 0;
  for (const scene of scenes) {
    const start = startWordIndex(words, scene.starts_at, from);
    if (start < 0) continue;
    out.push({ scene, start });
    from = start + 1;
  }
  return out;
}

export function sceneVisual(
  scene: ScreenplayScene,
  looks: string[] | undefined,
  key: string,
  text: string,
  words: number,
): SceneVisual {
  const character = showsCharacter(scene, looks);
  const clip = scene.kind === 'clip';
  return {
    key,
    kind: clip ? 'clip' : 'still',
    prompt: clip ? sceneClipPrompt(scene, { looks }) : sceneStillPrompt(scene, { looks }),
    text,
    words,
    kenBurns: sceneMove(scene.move),
    role: clip && character ? 'anchor' : scene.size === 'Insert' ? 'insert' : character ? 'cast' : 'metaphor',
    size:
      scene.size === 'CU' || scene.size === 'Profile'
        ? 'close'
        : scene.size === 'Wide'
          ? 'wide'
          : scene.size === 'Insert'
            ? 'object'
            : 'medium',
    setting: scene.setting,
    subject: scene.action,
    cue: scene.id,
  };
}

export function sceneAgain(v: SceneVisual, key: string, text: string, words: number): SceneVisual {
  return { ...v, key, text, words, kind: 'still', reuse: v.key };
}

/** Visuals per chapter; a chapter with no matched scene holds the last picture. */
export function buildSceneVisuals(
  chapters: { index: number; title: string; narration: string }[],
  scenes: ScreenplayScene[],
  looks?: string[],
): SceneVisual[][] {
  let last: SceneVisual | undefined;
  return chapters.map((ch) => {
    const words = spokenWords(ch.narration);
    const starts = sceneStartsIn(words, scenesOfChapter(scenes, ch.title));
    if (!starts.length) {
      if (!last) return [];
      return [sceneAgain(last, `${ch.index}_v1`, ch.narration, words.length)];
    }
    const bounds = starts.map((s, i) => (i === 0 ? 0 : s.start));
    return starts.map((s, i) => {
      const end = i + 1 < starts.length ? bounds[i + 1] : words.length;
      last = sceneVisual(s.scene, looks, `${ch.index}_v${i + 1}`, words.slice(bounds[i], end).join(' '), end - bounds[i]);
      return last;
    });
  });
}
