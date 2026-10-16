/**
 * Hybrid long-form visuals: Veo clips for the hook and hero chapters, Ken
 * Burns stills for the rest, cut on phrase boundaries; and the timing of a
 * chapter's visuals against its word timestamps. Rebuilt from 6.1.13.
 */
import { FLAGSHIP_ANCHORS, sentences, type LongEntry } from './bankV2';
import { planScreenplay } from './screenplayPlan';
import { bundledTitle } from './bundledBank';
import { SHOT_LISTS } from '../assets/shotLists';
import { WORDS_PER_SECOND } from './guardrails';
import { withLongFrame } from './styleLock';
import type { KenBurnsMove } from './types';

export const HOOK_CLIPS = 4;
export const HERO_CLIPS = 2;
export const HOOK_SECONDS = 30;
export const CLIP_SECONDS = 8;
export const STILL_SECONDS = 6;
export const STILL_HOLD_SECONDS = { first: 4.8, later: 7.5 };
const MOVES: KenBurnsMove[] = ['zoom_in', 'pan_right', 'zoom_out', 'pan_left'];
const MOVE_WORDS: Record<KenBurnsMove, string> = {
  zoom_in: 'Slow push in',
  zoom_out: 'Slow pull back',
  pan_left: 'Slow pan left',
  pan_right: 'Slow pan right',
  tilt_up: 'Slow tilt up',
  tilt_down: 'Slow tilt down',
};
const PHRASE_SECONDS = CLIP_SECONDS;

const spoken = (s: string) => s.split(/\s+/).filter(Boolean).length;
const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s);

/** Sentences, long ones split at the comma/dash nearest their middle. */
export function phrases(text: string): string[] {
  const max = PHRASE_SECONDS * WORDS_PER_SECOND;
  const split = (s: string): string[] => {
    const words = s.split(/\s+/).filter(Boolean);
    if (words.length <= max) return [s];
    const cuts = words
      .map((w, i) => (i < words.length - 1 && /[,;:—–]$|^[—–]$/.test(w) ? i : -1))
      .filter((i) => i >= 2 && i <= words.length - 3);
    if (!cuts.length) return [s];
    const half = words.length / 2;
    const best = cuts.reduce((a, b) => (Math.abs(b + 1 - half) < Math.abs(a + 1 - half) ? b : a));
    return [...split(words.slice(0, best + 1).join(' ')), ...split(words.slice(best + 1).join(' '))];
  };
  return sentences(text).flatMap(split);
}

/** Phrases grouped to the target seconds of each visual, then `fallback` seconds each. */
function groupSentences(text: string, targets: number[], fallback: number): string[] {
  const groups: string[] = [];
  let cur: string[] = [];
  let curWords = 0;
  const target = () => (targets[groups.length] ?? fallback) * WORDS_PER_SECOND;
  for (const p of phrases(text)) {
    const n = spoken(p);
    if (cur.length && target() - curWords < curWords + n - target()) {
      groups.push(cur.join(' '));
      cur = [];
      curWords = 0;
    }
    cur.push(p);
    curWords += n;
  }
  if (cur.length) {
    if (!groups.length || !(curWords < (fallback * WORDS_PER_SECOND) / 2)) groups.push(cur.join(' '));
    else groups[groups.length - 1] = `${groups[groups.length - 1]} ${cur.join(' ')}`;
  }
  return groups;
}

export interface HybridChapter {
  index: number;
  narration: string;
  stillPrompt: string;
  heroA?: string;
  heroB?: string;
  characterDescription: string;
  intro?: boolean;
  hero?: boolean;
}

export interface HybridVisual {
  kind: 'clip' | 'still';
  key: string;
  prompt: string;
  text: string;
  words: number;
  kenBurns?: KenBurnsMove;
}

export function chapterVisuals(ch: HybridChapter): HybridVisual[] {
  const clips = ch.intro ? HOOK_CLIPS : ch.hero ? 1 : 0;
  const groups = groupSentences(
    ch.narration,
    Array.from({ length: clips }, () => (ch.intro ? 7.5 : CLIP_SECONDS)),
    STILL_SECONDS,
  );
  const scene = ch.stillPrompt
    .replace(/^(slow [a-z ]+?)\.\s*/i, '')
    .replace(/,\s*[^,]*$/, '')
    .trim();
  let stillTurn = 0;
  return groups.map((text, i) => {
    const key = `${ch.index}_v${i + 1}`;
    if (!(i < clips)) {
      const move = MOVES[(ch.index + stillTurn++) % MOVES.length];
      const prompt = withLongFrame(
        `${MOVE_WORDS[move]}. A still illustration with no people in frame and no text or lettering, in the same world as ${
          scene || 'the chapter'
        }, showing: ${clip(text, 220)}`,
      );
      return { kind: 'still', key, prompt, text, words: spoken(text), kenBurns: move };
    }
    let prompt = i === 0 ? ch.heroA : i === 1 ? ch.heroB : '';
    if (!prompt) {
      prompt = withLongFrame(
        `${i % 2 ? 'Handheld drift' : 'Slow push in'}. The same character (${ch.characterDescription}) in the moment the narration describes: ${clip(
          text,
          160,
        )}; anyone else only as a soft-focus background figure`,
      );
    }
    return { kind: 'clip', key, prompt, text, words: spoken(text) };
  });
}

/** Which chapters (by index in the body) get a hero clip. */
export function heroChapters(count: number): number[] {
  if (count < 2) return [];
  if (count < 3) return [count - 1];
  return [Math.floor(count / 2), count - 1];
}

function screenplayPlanOf(e: LongEntry) {
  const sp = e.screenplay!;
  return planScreenplay(
    sp,
    e.chapters.map((c, i) => ({ index: i + 1, title: c.title, narration: c.narration })),
    {
      budget: sp.flow_budget_credits ?? 120,
      creditsPerClip: 20,
      nextTitle: e.next_video ? bundledTitle(e.next_video) : undefined,
      ...(e.visual_plan ? { visualPlan: e.visual_plan } : {}),
      ...(e.flagship ? { maxAnchors: FLAGSHIP_ANCHORS } : {}),
    },
  );
}

function perChapter(e: LongEntry, pick: (groups: number, clips: number) => number): number {
  const heroes = heroChapters(e.chapters.length);
  return e.chapters.reduce((sum, ch, i) => {
    const clips = i === 0 ? HOOK_CLIPS : heroes.includes(i) ? 1 : 0;
    const groups = groupSentences(
      ch.narration,
      Array.from({ length: clips }, () => (i !== 0 ? CLIP_SECONDS : 7.5)),
      STILL_SECONDS,
    ).length;
    return sum + pick(groups, clips);
  }, 0);
}

export function hybridClipCount(e: LongEntry): number {
  if (e.screenplay) return screenplayPlanOf(e).clips.kept;
  const list = e.id ? SHOT_LISTS[e.id] : undefined;
  if (list) return list.shots.filter((s) => s.type === 'V').length;
  return perChapter(e, (groups, clips) => Math.min(groups, clips));
}

export function hybridStillCount(e: LongEntry): number {
  if (e.screenplay) {
    return screenplayPlanOf(e)
      .chapters.flat()
      .filter((v) => v.kind === 'still' && !v.reuse).length;
  }
  const list = e.id ? SHOT_LISTS[e.id] : undefined;
  if (list) return list.shots.filter((s) => s.type === 'S').length;
  return perChapter(e, (groups, clips) => Math.max(0, groups - clips));
}

/** Word index each visual starts at. */
export function wordStarts(visuals: { words: number }[]): number[] {
  let at = 0;
  return visuals.map((v) => {
    const s = at;
    at += v.words;
    return s;
  });
}

/** How many stills a stretch of `seconds` starting at `at` seconds needs. */
export function stillParts(at: number, seconds: number): number {
  const per = at < 60 ? STILL_HOLD_SECONDS.first : STILL_HOLD_SECONDS.later;
  return Math.max(1, Math.ceil(seconds / per - 1e-9));
}

export interface TimedVisual<V> {
  visual: V;
  start: number;
  end: number;
  uri: string | undefined;
}

/** Start/end seconds of each visual against the chapter's word timings. */
export function timeVisuals<V extends { words: number; seconds?: number; anchor?: string; kind: string }>(
  visuals: V[],
  words: { start: number; end: number }[],
  total: number,
  uriOf: (v: V) => string | undefined,
): TimedVisual<V>[] {
  const starts: number[] = [];
  let wordCount = 0;
  let ptr = 0;
  for (let i = 0; i < visuals.length; i++) {
    const v = visuals[i];
    const prev = starts[i - 1] ?? 0;
    let t =
      i !== 0 && words.length ? (words[Math.min(ptr, words.length - 1)]?.start ?? total) : i !== 0 ? prev : 0;
    if (v.anchor === 'gap' && v.seconds && words.length) {
      t = Math.max(prev, (words[Math.min(ptr, words.length - 1)]?.start ?? total) - v.seconds);
    }
    if (v.anchor === 'end' && 0 < i && wordCount > 0 && words.length) {
      const e = Math.min(wordCount, words.length);
      t = Math.max(prev, words[e - 1].end);
      ptr = e;
    }
    starts.push(t);
    wordCount += v.words;
    if (v.seconds && v.anchor !== 'gap' && words.length) {
      const endT = t + v.seconds;
      let k = ptr;
      while (k < words.length && words[k].start < endT - 1e-6) k++;
      ptr = Math.max(k, 0);
    } else {
      ptr += v.words;
    }
  }
  const items = visuals
    .map((visual, i) => ({
      visual,
      start: Math.min(starts[i], total),
      end: Math.min(i + 1 < visuals.length ? starts[i + 1] : total, total),
      uri: uriOf(visual),
    }))
    .filter((x) => x.uri)
    .map((x) => ({ ...x }));
  if (items.length) {
    items[0].start = 0;
    items[items.length - 1].end = total;
    for (let i = 0; i + 1 < items.length; i++) {
      if (items[i + 1].start - items[i].end <= 0) continue;
      if (items[i].visual.kind === 'card' && items[i + 1].visual.kind !== 'card') items[i + 1].start = items[i].end;
      else items[i].end = items[i + 1].start;
    }
    for (let i = 1; i < items.length; i++) items[i].start = items[i - 1].end;
  }
  return items.filter((x) => x.end - x.start > 1 / 30);
}
