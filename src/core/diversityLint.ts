import { FRAME16, STYLE_LOCK } from './styleLock';
import { CAST_STYLE } from '../assets/cast';

/**
 * Visual diversity checks for a long-form plan: pictures described too alike,
 * the same framing or camera move inside a few shots, too much of the
 * protagonist's face, chapters with no cutaway, and consecutive shared settings.
 */

export const DIVERSITY = { jaccard: 0.55, window: 3, protagonistMax: 0.4 };

const STOP = new Set(
  (
    'a an the and or of to in on at by for with from as is are was were be it its this that these those no not nothing single still frame ' +
    'written anywhere silent audio shot moment line supports one steady camera movement slow push extreme close-up table surface shallow ' +
    'depth field people frame symbolic image illustrative calm composition wide medium close scene setting reenactment look anonymous real ' +
    'person likeness cast characters supports'
  ).split(' '),
);

export interface VisualLike {
  key: string;
  kind: string;
  prompt?: string;
  reuse?: string;
  role?: string;
  size?: string;
  kenBurns?: string;
  face?: boolean;
}

/** The distinctive words of a prompt: style locks and character identity blocks removed. */
export function sceneWords(prompt: string): Set<string> {
  let p = prompt.toLowerCase();
  for (const lock of [FRAME16, STYLE_LOCK, CAST_STYLE]) p = p.replace(lock.toLowerCase(), ' ');
  p = p.replace(/\b[a-z.]+: (an? )?\d+-year-old[^;]*?(?=;|\. )/g, ' ').replace(/[^a-z\s'-]/g, ' ');
  return new Set(p.split(/\s+/).filter((w) => w.length > 2 && !STOP.has(w)));
}

export function jaccard(a: Set<string>, b: Set<string>): number {
  if (!a.size || !b.size) return 0;
  let both = 0;
  for (const w of a) if (b.has(w)) both++;
  return both / (a.size + b.size - both);
}

/** Pairs of generated pictures (not cards, not reuses) whose descriptions overlap at least `threshold`. */
export function similarPairs(visuals: VisualLike[], threshold: number = DIVERSITY.jaccard): { a: string; b: string; score: number }[] {
  const items = visuals.filter((v) => v.kind !== 'card' && v.prompt && !v.reuse).map((v) => ({ key: v.key, words: sceneWords(v.prompt as string) }));
  const out: { a: string; b: string; score: number }[] = [];
  for (let i = 0; i < items.length; i++) {
    for (let j = i + 1; j < items.length; j++) {
      const s = jaccard(items[i].words, items[j].words);
      if (s >= threshold) out.push({ a: items[i].key, b: items[j].key, score: Math.round(s * 100) / 100 });
    }
  }
  return out.sort((x, y) => y.score - x.score);
}

/** Two cast/reenactment stills of the same size, or two stills with the same move, within `window` shots. */
export function framingRepeats(visuals: VisualLike[], window: number = DIVERSITY.window): { at: string; what: 'size' | 'move'; value?: string }[] {
  const shots = visuals.filter((v) => v.kind !== 'card');
  const out: { at: string; what: 'size' | 'move'; value?: string }[] = [];
  const seen = new Set<string>();
  const add = (r: { at: string; what: 'size' | 'move'; value?: string }) => {
    const k = `${r.at}|${r.what}`;
    if (seen.has(k)) return;
    seen.add(k);
    out.push(r);
  };
  for (let i = 0; i < shots.length; i++) {
    for (let j = i + 1; j < Math.min(shots.length, i + window); j++) {
      const a = shots[i];
      const b = shots[j];
      const sameAsset = (a.reuse && (a.reuse === b.reuse || a.reuse === b.key)) || b.reuse === a.key;
      const people = (v: VisualLike) => v.role === 'cast' || v.role === 'reenactment';
      if (a.kind === 'still' && b.kind === 'still' && !sameAsset && people(a) && people(b) && a.size && a.size === b.size) {
        add({ at: b.key, what: 'size', value: a.size });
      }
      if (a.kind === 'still' && b.kind === 'still' && a.kenBurns && a.kenBurns === b.kenBurns) add({ at: b.key, what: 'move', value: a.kenBurns });
    }
  }
  return out;
}

export function protagonistShare(visuals: VisualLike[]): number {
  return visuals.length ? visuals.filter((v) => v.face).length / visuals.length : 0;
}

export interface DiversityReport {
  pairs: { a: string; b: string; score: number }[];
  framing: { at: string; what: 'size' | 'move'; value?: string }[];
  protagonist: number;
  noCutaway: string[];
  sharedSetting: string[];
  ok: boolean;
}

export function diversityReport(
  chapters: { title: string; visuals: VisualLike[] }[],
  items?: { chapter: string; setting: string }[] | null,
): DiversityReport {
  const visuals = chapters.flatMap((c) => c.visuals);
  const pairs = similarPairs(visuals);
  const framing = framingRepeats(visuals);
  const protagonist = visuals.length ? visuals.filter((v) => v.face).length / visuals.length : 0;
  const noCutaway: string[] = [];
  const sharedSetting: string[] = [];
  (items ?? []).forEach((item, i) => {
    const vs = chapters.find((c) => c.title === item.chapter)?.visuals ?? [];
    if (!vs.some((v) => v.role === 'insert' || v.role === 'metaphor')) noCutaway.push(item.chapter);
    const prev = items?.[i - 1];
    if (prev && prev.setting.trim().toLowerCase() === item.setting.trim().toLowerCase()) sharedSetting.push(item.chapter);
  });
  const ok = !pairs.length && !framing.length && protagonist <= DIVERSITY.protagonistMax && !noCutaway.length && !sharedSetting.length;
  return { pairs, framing, protagonist, noCutaway, sharedSetting, ok };
}

export function diversityLines(r: DiversityReport): string[] {
  const out: string[] = [];
  if (r.pairs.length) {
    const list = r.pairs.slice(0, 5).map((p) => `${p.a} and ${p.b} (${p.score})`).join('; ');
    out.push(`${r.pairs.length} pair${r.pairs.length === 1 ? '' : 's'} of pictures described alike (${DIVERSITY.jaccard} or more): ${list}.`);
  }
  if (r.framing.length) {
    const list = r.framing.slice(0, 5).map((f) => `${f.at} (${f.what} ${f.value})`).join('; ');
    out.push(`A framing or camera move repeats inside ${DIVERSITY.window} shots: ${list}.`);
  }
  if (r.protagonist > DIVERSITY.protagonistMax) {
    out.push(`The protagonist's face is in ${Math.round(r.protagonist * 100)}% of the shots; ${DIVERSITY.protagonistMax * 100}% at most.`);
  }
  if (r.noCutaway.length) out.push(`No cutaway in: ${r.noCutaway.join(', ')}.`);
  if (r.sharedSetting.length) out.push(`Same setting as the item before: ${r.sharedSetting.join(', ')}.`);
  return out;
}
