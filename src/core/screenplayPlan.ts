/**
 * Long-form screenplay → per-chapter visual timeline: Veo clips (anchors,
 * metaphor, reenactments) within the Flow budget, chapter/stat/guess/end
 * cards, stills in between with a role mix, and Hoot moments.
 * Rebuilt from 6.1.13.
 */
import { CAST, CAST_STYLE } from '../assets/cast';
import { CAST_SHARE_DEFAULT, MAX_ANCHORS, occurrences, type Screenplay, type VisualPlanRow } from './bankV2';
import { statParts, type Card } from './cards';
import { WORDS_PER_SECOND } from './guardrails';
import type { HootPose } from './hoot';
import { reuseStills, STILL_TARGET } from './stillReuse';
import { sceneAgain, sceneStartsIn, scenesOfChapter, sceneVisual, type SceneVisual } from './sceneStills';
import {
  allocateMix,
  castFocus,
  castFor,
  composition,
  LIGHTING,
  SETTINGS,
  stillPrompt,
  type StillRole,
  type StillSize,
} from './screenplayVariety';
import { withLongFrame } from './styleLock';
import type { KenBurnsMove } from './types';

export const STILL_WORDS = { first: 9, later: 15 };
export const FIRST_MINUTE_WORDS = Math.round(60 * WORDS_PER_SECOND);
export const CLIP_WORDS = Math.round(8 * WORDS_PER_SECOND);
export const CHAPTER_CARD_SECONDS = 2;
export const STAT_CARD_SECONDS = 3.5;
export const HOOT_MOMENT_SECONDS = 2.5;
export const END_CARD_SECONDS = 6;
const END_CARD_WORDS = Math.round(END_CARD_SECONDS * WORDS_PER_SECOND);
const CHAPTER_CARD_WORDS = Math.round(CHAPTER_CARD_SECONDS * WORDS_PER_SECOND);
const STAT_CARD_WORDS = Math.round(STAT_CARD_SECONDS * WORDS_PER_SECOND);
const HOOT_GAP_WORDS = FIRST_MINUTE_WORDS;
const MOVES: KenBurnsMove[] = ['zoom_in', 'pan_right', 'zoom_out', 'pan_left'];
const SCENE_HOLD_WORDS = 4;
const AUTO_POSES: HootPose[] = ['thinking', 'pointing', 'idea', 'surprised', 'glance', 'happy'] as HootPose[];

/** Typographic quotes, ellipses and runs of space made plain. */
function plain(s: string): string {
  return s
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/…/g, '...')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Word span [start, end) of `phrase` in `text`, when it occurs exactly once. */
export function phraseSpan(text: string, phrase: string): { start: number; end: number } | null {
  if (occurrences(text, phrase) !== 1) return null;
  const words = text.split(/\s+/).filter(Boolean).map(plain);
  const joined = words.join(' ');
  const needle = plain(phrase);
  const at = joined.indexOf(needle);
  if (at < 0) return null;
  let pos = 0;
  let start = -1;
  let end = -1;
  words.forEach((w, i) => {
    const e = pos + w.length;
    if (start < 0 && e > at) start = i;
    if (e >= at + needle.length && end < 0) end = i + 1;
    pos = e + 1;
  });
  return start >= 0 && end > start ? { start, end } : null;
}

/** "Label → value (note)", "a · b · c", "40% → 55% → 70%" → a card. */
export function parseStatText(text: string): Card {
  const t = text.trim();
  const items = t
    .split(/\s+·\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
  const parts = (s: string) => s.split(/\s*→\s*/).map((p) => p.trim());
  if (items.length !== 1) {
    const rows = items.map((s) => {
      const p = parts(s);
      if (p.length === 1 && /^[^:]+:\s+\S/.test(s)) {
        const [label, ...rest] = s.split(/:\s+/);
        return { label, value: rest.join(': ') };
      }
      return { label: p[0], value: p.slice(1).join(' → ') };
    });
    return rows.every((r) => r.value) ? { kind: 'stats', rows } : { kind: 'label', lines: [t] };
  }
  const p = parts(items[0]);
  if (p.length >= 3 && p.every((v) => /^\d+(\.\d+)?%$/.test(v))) {
    return { kind: 'bars', values: p.map((v) => parseFloat(v)), labels: p.map(() => ''), unit: '%' };
  }
  if (p.length < 2) return { kind: 'label', lines: [t] };
  const rest = p.slice(1).join(' → ');
  const note = /\(([^)]+)\)\s*$/.exec(rest)?.[1];
  return { kind: 'stat', label: p[0], value: rest.replace(/\s*\([^)]+\)\s*$/, ''), ...(note ? { note } : {}) };
}

/** The card for a stat_cards entry, shaped by its template. */
export function statCard(text: string, template?: string): Card {
  if (template === 'study') {
    const [name, ...meta] = text.split('|').map((s) => s.trim());
    return { kind: 'study', name: name.toUpperCase(), meta: meta.join(' · ') };
  }
  if (template === 'bullets') {
    return {
      kind: 'label',
      lines: text
        .split('|')
        .map((s) => s.trim())
        .filter(Boolean)
        .slice(0, 3),
    };
  }
  if (template === 'protect') return { kind: 'label', lines: ['PROTECT YOURSELF', text.trim()], accentLast: true };
  const card = parseStatText(text);
  if (!template) return card;
  const pair = card.kind === 'stat' ? { from: card.label, to: card.value } : null;
  switch (template) {
    case 'count_up':
      return card;
    case 'split_compare':
      if (card.kind === 'stats') return { kind: 'split', pairs: card.rows.map((r) => ({ from: r.label, to: r.value, caption: '' })) };
      return pair ? { kind: 'split', pairs: [{ from: pair.from, to: pair.to, caption: '' }] } : card;
    case 'icon_array': {
      const items = text
        .split(/\s+·\s+/)
        .map((s) => s.trim())
        .filter(Boolean);
      if (items.length >= 2 && items.length <= 6 && items.every((s) => s.length <= 14 && !/→|:/.test(s))) {
        return { kind: 'icons', labels: items };
      }
      if (pair) return { kind: 'icons', labels: [pair.from, pair.to] };
      if (card.kind === 'stats') return { kind: 'icons', labels: card.rows.map((r) => r.label) };
      return card;
    }
    case 'bar':
      if (card.kind === 'bars') return card;
      if (card.kind === 'stat' && /^\d+(\.\d+)?%/.test(card.value) && /^\d+(\.\d+)?%/.test(card.note ?? '')) {
        return {
          kind: 'bars',
          values: [parseFloat(card.note as string), parseFloat(card.value)],
          labels: [card.note ?? '', card.label],
          unit: '%',
        };
      }
      return card;
    default:
      return card;
  }
}

/** A card's visual design, so two cards in a row never look the same. */
export function cardDesign(card: Card): string {
  if (card.kind !== 'label') return card.kind;
  return `label${card.accentLast ? '+' : card.lines.length > 1 ? '2' : ''}`;
}

/** statCard, but never the same design as the card before it. */
export function statCardAfter(text: string, template: string | undefined, previous?: string): Card {
  const card = statCard(text, template);
  if (cardDesign(card) !== previous) return card;
  if (template === 'study' || template === 'bullets' || template === 'protect') return card;
  for (const t of ['count_up', 'split_compare', 'icon_array', 'bar']) {
    const c = statCard(text, t);
    if (cardDesign(c) !== previous) return c;
  }
  const words = text.trim().split(/\s+/);
  const half = Math.ceil(words.length / 2);
  return words.length > 1
    ? { kind: 'label', lines: [words.slice(0, half).join(' '), words.slice(half).join(' ')], accentLast: true }
    : card;
}

/** Looks of the cast named in `text` (or the protagonist), in their default wardrobe. */
export function castLine(text: string, sp: { cast: string[]; protagonist?: string }): string {
  const ids = sp.cast.length ? sp.cast : sp.protagonist ? [sp.protagonist] : [];
  let named = ids.filter((id) => CAST[id] && new RegExp(`\\b${CAST[id].name.replace('.', '\\.')}`, 'i').test(text));
  if (!named.length) named = sp.protagonist && CAST[sp.protagonist] ? [sp.protagonist] : ids.slice(0, 1);
  return named
    .filter((id) => CAST[id])
    .map((id) => `${CAST[id].name}: ${CAST[id].look}, wearing ${CAST[id].wardrobe}`)
    .join('; ');
}

/** The word index nearest `i` that follows punctuation, within `radius`. */
function snap(words: string[], i: number, radius = 6): number {
  let best = Math.max(0, Math.min(words.length - 1, i));
  let dist = Infinity;
  for (let j = Math.max(1, i - radius); j <= Math.min(words.length - 1, i + radius); j++) {
    if (/[.?!,;:]["”')]*$/.test(words[j - 1]) && Math.abs(j - i) < dist) {
      dist = Math.abs(j - i);
      best = j;
    }
  }
  return best;
}

/** 0–100: how evenly a chapter's words are spread across picture roles. */
export function varietyScore(mix: Record<string, number | undefined>): number {
  const values = Object.values(mix);
  const total = values.reduce<number>((a, v) => a + (v ?? 0), 0);
  if (!total) return 0;
  const hhi = values.reduce<number>((a, v) => a + ((v ?? 0) / total) ** 2, 0);
  return Math.round(Math.min(1, (1 - hhi) / 0.8) * 100);
}

export interface TimedWord {
  start: number;
  end: number;
  [k: string]: unknown;
}

export interface Pause {
  at: number;
  secs: number;
  kind?: string;
}

/** Shifts word timings to make room for pauses (guess / silence) before word `at`. */
export function applyPauses<T extends TimedWord>(
  words: T[],
  pauses: Pause[],
): { words: T[]; cuts: { at: number; secs: number }[]; extra: number } {
  const sorted = [...pauses].filter((p) => p.at >= 1 && p.at < words.length).sort((a, b) => a.at - b.at);
  const cuts = sorted.map((p) => {
    const prev = words[p.at - 1];
    const cur = words[p.at];
    return { at: cur.start > prev.end ? (prev.end + cur.start) / 2 : cur.start, secs: p.secs };
  });
  let offset = 0;
  let k = 0;
  const shifted = words.map((w, i) => {
    while (k < sorted.length && i >= sorted[k].at) offset += sorted[k++].secs;
    return { ...w, start: w.start + offset, end: w.end + offset };
  });
  return { words: shifted, cuts, extra: cuts.reduce((a, c) => a + c.secs, 0) };
}

export function pauseSeconds(cues?: { pauses?: Pause[] } | null): number {
  return (cues?.pauses ?? []).reduce((a, p) => a + p.secs, 0);
}

export interface PlanVisual {
  key: string;
  kind: 'clip' | 'still' | 'card';
  prompt: string;
  text: string;
  words: number;
  seconds?: number;
  anchor?: 'gap' | 'end';
  role?: string;
  card?: Card;
  cue?: string;
  size?: string;
  setting?: string;
  subject?: string;
  face?: boolean;
  kenBurns?: KenBurnsMove;
  composition?: string;
  reuse?: string;
  [k: string]: unknown;
}

export interface ChapterCues {
  hoot: { pose: HootPose; after: number }[];
  pauses: Pause[];
}

export interface ScreenplayPlan {
  chapters: PlanVisual[][];
  cues: ChapterCues[];
  clips: { kept: number; dropped: number };
  stills: { images: number; segments: number };
  variety: { chapter: string; score: number; mix: Record<string, number>; castShare: number }[];
  problems: string[];
}

export interface PlanOptions {
  budget: number;
  creditsPerClip: number;
  maxAnchors?: number;
  visualPlan?: VisualPlanRow[];
  nextTitle?: string;
  stillTarget?: number;
}

interface ClipWish {
  chapter: string;
  role: string;
  face?: boolean;
  cue: string;
  size: string;
  setting: string;
  subject: string;
  era?: string;
  look?: string;
  prompt: string;
}

type Make = (key: string, text: string, words: number) => PlanVisual;

interface Slot {
  start: number;
  end: number;
  seconds?: number;
  gap?: boolean;
  fixed?: boolean;
  slot?: { role?: StillRole };
  make: Make;
}

export function pausedWords<T extends TimedWord>(cues: { pauses: Pause[] } | null | undefined, words: T[]): T[] {
  return cues?.pauses.length && words.length ? applyPauses(words, cues.pauses).words : words;
}

/** Chapter durations plus each chapter's pauses. */
export function withPauseDurations(
  plan: { chapters: { index: number; cues?: { pauses?: Pause[] } }[] },
  durations: Record<string, number>,
): Record<string, number> {
  const out = { ...durations };
  for (const ch of plan.chapters) {
    const k = String(ch.index);
    if (out[k] && ch.cues) out[k] += pauseSeconds(ch.cues);
  }
  return out;
}

/** Whether a card's number counts up on screen. */
export function countsUp(card: Card): boolean {
  return (
    (card.kind === 'stat' && Boolean(statParts(card.value))) ||
    (card.kind === 'stats' && card.rows.some((r) => statParts(r.value)))
  );
}

export function describeEntry(e: { chapters: unknown[]; screenplay?: Screenplay }): { chapters: number; cues: number } {
  const sp = e.screenplay;
  return {
    chapters: e.chapters.length,
    cues: sp
      ? sp.stat_cards.length +
        sp.hoot_moments.length +
        sp.guess_pauses.length +
        sp.silence_beats.length +
        (sp.anchors.length || sp.flow_clips.length) +
        sp.reenactments.length
      : 0,
  };
}

export function planScreenplay(
  sp: Screenplay,
  chapters: { index: number; title: string; narration: string }[],
  opts: PlanOptions,
): ScreenplayPlan {
  const problems: string[] = [];
  const capShare = sp.cast_share_max ?? CAST_SHARE_DEFAULT;
  const anchors = (sp.anchors.length ? sp.anchors : sp.flow_clips).slice(0, opts.maxAnchors ?? MAX_ANCHORS);
  let lightTurn = 0;
  const used = { metaphor: 0, insert: 0, reenact: 0 };
  const turns = { castSize: 0, reenactSize: 0, setting: 0 };
  const recentSizes: string[] = [];
  const firstTitle = chapters[0]?.title ?? '';
  const hook = anchors.find((a) => a.chapter === firstTitle) ?? anchors[0];
  const protagonist = sp.protagonist && CAST[sp.protagonist] ? CAST[sp.protagonist].name : '';

  const anchorWish = (a: { chapter: string; beat: string }): ClipWish => ({
    chapter: a.chapter,
    role: 'anchor',
    face: Boolean(protagonist) && new RegExp(`\\b${protagonist}`, 'i').test(a.beat),
    cue: a.beat,
    size: 'medium',
    setting: a.beat,
    subject: a.beat,
    prompt: withLongFrame(
      `Slow push in, one steady camera movement. ${a.beat}. ${castFor(
        sp,
        a.beat,
        Math.max(0, chapters.findIndex((c) => c.title === a.chapter)),
      )}. ${CAST_STYLE}. Silent, no on-screen text.`,
    ),
  });

  const wishes: ClipWish[] = [];
  if (hook) wishes.push(anchorWish(hook));
  if (sp.metaphors[0]) {
    wishes.push({
      chapter: firstTitle,
      role: 'metaphor',
      cue: sp.metaphors[0],
      size: 'symbolic',
      setting: 'abstract',
      subject: sp.metaphors[0],
      prompt: withLongFrame(
        `Slow push in, one steady camera movement. A symbolic image: ${sp.metaphors[0]}. No people in frame, calm, illustrative. Silent, no on-screen text.`,
      ),
    });
  }
  for (const a of anchors) if (a !== hook) wishes.push(anchorWish(a));
  for (const r of sp.reenactments) {
    wishes.push({
      chapter: r.chapter,
      role: 'reenactment',
      cue: `${r.era}: ${r.setting}`,
      size: 'wide',
      setting: r.setting,
      subject: r.setting,
      era: r.era,
      look: r.look,
      prompt: withLongFrame(
        `Slow push in, one steady camera movement. A ${r.era} reenactment: ${r.setting}. Look: ${
          r.look || 'period-accurate'
        }. Anonymous people, no real person's likeness, no cast characters. Silent, no on-screen text.`,
      ),
    });
  }

  const hasScenes = Boolean(sp.scenes?.length);
  const looks = sp.character_looks ?? [];
  const sceneVisuals = new Map<string, SceneVisual>();
  const lastScene: { v?: SceneVisual } = {};
  let poseTurn = 0;
  const clipCount = hasScenes ? 0 : Math.max(0, Math.floor(opts.budget / Math.max(1, opts.creditsPerClip)));
  const clips = wishes.slice(0, clipCount);
  const dropped = hasScenes ? [] : wishes.slice(clipCount);
  if (dropped.length) {
    const one = dropped.length === 1;
    problems.push(
      `The ${opts.budget}-credit budget pays for ${clipCount} clips; ${dropped.length} reenactment${one ? '' : 's'} become${
        one ? 's' : ''
      } stills in the same look.`,
    );
  }
  if (clips.some((c) => c.role === 'metaphor')) used.metaphor = 1;
  const clipsIn = (chapter: string) => clips.filter((c) => c.chapter === chapter);

  let wordsBefore = 0;
  const allVisuals: PlanVisual[][] = [];
  const cues: ChapterCues[] = [];
  const variety: ScreenplayPlan['variety'] = [];
  const lastHoot = { at: -Infinity };
  let carried: { pose: HootPose }[] = [];
  let moveTurn = 0;
  let lastDesign: string | undefined;
  const prompts = new Set<string>();

  chapters.forEach((ch, ci) => {
    const words = ch.narration.split(/\s+/).filter(Boolean);
    const W = words.length;
    const chClips = clipsIn(ch.title);
    const starts = hasScenes ? sceneStartsIn(words, scenesOfChapter(sp.scenes ?? [], ch.title)) : [];
    const lastStart = () => starts[starts.length - 1]?.start;
    const keepLastScene = (i: number): number => {
      const last = lastStart();
      if (last === undefined || last + SCENE_HOLD_WORDS <= i) return i;
      return Math.max(i, Math.min(last + SCENE_HOLD_WORDS, W - 6));
    };
    if (ci === 0 && !hasScenes && chClips.length < 2) {
      problems.push(
        `${ch.title}: only ${chClips.length} Veo clip${chClips.length === 1 ? '' : 's'} in the first chapter; CR-61 wants at least 2 in the first 30 seconds`,
      );
    }

    const slots: Slot[] = [];
    const rowIndex = opts.visualPlan?.findIndex((r) => r.chapter === ch.title) ?? -1;
    const row = rowIndex >= 0 ? opts.visualPlan?.[rowIndex] : undefined;
    let rowCutawayUsed = false;
    let focusTurn = 0;
    const cardTitle = row
      ? `${rowIndex + 1} · ${ch.title.split(':')[0].trim().toUpperCase()}`
      : ch.title.toUpperCase();

    let cardWords = 0;
    if (ci > 0) {
      cardWords = Math.min(CHAPTER_CARD_WORDS, W);
      slots.push({
        start: 0,
        end: cardWords,
        seconds: CHAPTER_CARD_SECONDS,
        make: (key, text, n) => ({
          key,
          kind: 'card',
          prompt: '',
          text,
          words: n,
          seconds: CHAPTER_CARD_SECONDS,
          role: 'graphic',
          card: { kind: 'title', text: cardTitle },
        }),
      });
    }

    const pauses: Pause[] = [];
    for (const [list, kind] of [
      [sp.guess_pauses, 'guess'],
      [sp.silence_beats, 'silence'],
    ] as [{ chapter: string; before: string; secs: number }[], string][]) {
      for (const p of list.filter((x) => x.chapter === ch.title)) {
        const span = phraseSpan(ch.narration, p.before);
        if (!span) {
          problems.push(
            `${ch.title}: the ${kind === 'guess' ? 'guess pause' : 'silence beat'} before "${p.before.slice(0, 30)}" can't be placed`,
          );
        } else {
          pauses.push({ at: span.start, secs: p.secs, kind });
        }
      }
    }
    pauses.sort((a, b) => a.at - b.at);
    for (const p of pauses.filter((x) => x.kind === 'guess')) {
      slots.push({
        start: p.at,
        end: p.at,
        seconds: p.secs,
        gap: true,
        make: (key, text) => ({
          key,
          kind: 'card',
          prompt: '',
          text,
          words: 0,
          seconds: p.secs,
          anchor: 'gap',
          role: 'graphic',
          card: { kind: 'guess' },
        }),
      });
    }

    const statSpans: [number, number][] = [];
    for (const sc of sp.stat_cards.filter((x) => x.chapter === ch.title)) {
      const span = phraseSpan(ch.narration, sc.after);
      if (!span) {
        problems.push(`${ch.title}: the stat card after "${sc.after.slice(0, 30)}" can't be placed`);
        continue;
      }
      let start = Math.min(span.end, W);
      let end = Math.min(W, start + STAT_CARD_WORDS);
      if (end - start < Math.ceil(STAT_CARD_WORDS / 2)) {
        start = Math.max(0, W - STAT_CARD_WORDS);
        end = W;
      }
      const inClip = starts.findIndex(
        (s, k) => s.scene.kind === 'clip' && s.start < start && start < (starts[k + 1]?.start ?? W),
      );
      if (inClip >= 0 && starts[inClip + 1]) {
        const next = starts[inClip + 1].start;
        end = Math.min(W, next + (end - start));
        start = next;
      }
      if (end >= W) {
        const last = lastStart();
        if (last !== undefined && !(last + SCENE_HOLD_WORDS <= start)) {
          start = Math.max(start, Math.min(last + SCENE_HOLD_WORDS, W - Math.ceil(STAT_CARD_WORDS / 2)));
        }
      }
      if (end <= start) continue;
      statSpans.push([start, end]);
      slots.push({
        start,
        end,
        seconds: STAT_CARD_SECONDS,
        fixed: true,
        make: (key, text, n) => {
          const card = statCardAfter(sc.text, sc.template, lastDesign);
          lastDesign = cardDesign(card);
          return {
            key,
            kind: 'card',
            prompt: '',
            text,
            words: n,
            seconds: STAT_CARD_SECONDS,
            anchor: 'end',
            role: 'graphic',
            card,
          };
        },
      });
    }

    if (opts.nextTitle && ci === chapters.length - 1 && W > END_CARD_WORDS) {
      const nextTitle = opts.nextTitle;
      slots.push({
        start: keepLastScene(Math.max(cardWords, W - END_CARD_WORDS)),
        end: W,
        seconds: END_CARD_SECONDS,
        fixed: true,
        make: (key, text, n) => ({
          key,
          kind: 'card',
          prompt: '',
          text,
          words: n,
          seconds: END_CARD_SECONDS,
          role: 'graphic',
          card: { kind: 'end', text: nextTitle },
        }),
      });
    }

    chClips.forEach((clip, k) => {
      let pos: number;
      if (ci !== 0) pos = k !== 0 ? snap(words, cardWords + Math.round(((W - cardWords) * k) / chClips.length)) : cardWords;
      else pos = k !== 0 ? snap(words, CLIP_WORDS * k, 4) : 0;
      const hit = pauses.find((p) => p.at > pos && p.at < pos + CLIP_WORDS);
      if (hit) pos = hit.at;
      const end = Math.min(W, pos + CLIP_WORDS);
      if (end <= pos) {
        problems.push(`${ch.title}: a Flow clip has no room`);
        return;
      }
      slots.push({
        start: pos,
        end,
        make: (key, text, n) => ({
          key,
          kind: 'clip',
          prompt: clip.prompt,
          text,
          words: n,
          cue: clip.cue,
          role: clip.role,
          size: clip.size,
          setting: clip.setting,
          subject: clip.subject,
          ...(clip.face ? { face: true } : {}),
        }),
      });
    });

    const fixed = slots.filter((s) => s.fixed);
    for (const s of slots) {
      if (s.gap || s.seconds || s.fixed) continue;
      for (const f of fixed) {
        if (f.start < s.end && f.end > s.start) {
          if (f.start - s.start >= 8) {
            s.end = f.start;
          } else {
            const len = s.end - s.start;
            s.start = f.end;
            s.end = Math.min(W, f.end + len);
          }
        }
      }
    }

    slots.sort((a, b) => a.start - b.start || a.end - b.end);
    const placed: Slot[] = [];
    let cursor = 0;
    for (const s of slots) {
      const start = Math.max(s.start, s.gap ? s.start : cursor);
      const end = Math.max(start, s.gap ? s.start : Math.min(W, Math.max(s.end, start + (s.end - s.start))));
      if (!s.gap && start >= W) {
        problems.push(`${ch.title}: a card or clip fell past the end and was dropped`);
        continue;
      }
      placed.push({ ...s, start: s.gap ? s.start : start, end: s.gap ? s.start : end });
      if (!s.gap) cursor = end;
    }

    const stillSlots: Slot[] = [];
    let chapterRe: { chapter: string; era: string; setting: string; look: string } | undefined;

    const characterSize = (sizes: StillSize[], turn: 'castSize' | 'reenactSize'): StillSize => {
      const n = turns[turn]++;
      const rotated = [...sizes.slice(n % sizes.length), ...sizes.slice(0, n % sizes.length)];
      const pick = rotated.find((s) => !recentSizes.slice(-2).includes(s)) ?? rotated[0];
      recentSizes.push(pick);
      return pick;
    };

    const buildStill = (slot: { role?: StillRole }, key: string, text: string, n: number): PlanVisual => {
      const role: StillRole = slot.role ?? 'metaphor';
      const moment = text.length > 140 ? `${text.slice(0, 139).trimEnd()}…` : text;
      const kenBurns = MOVES[moveTurn++ % MOVES.length];
      const lighting = LIGHTING[lightTurn++ % LIGHTING.length];
      let size: StillSize;
      let setting: string;
      let subject: string;
      let comp: string;
      let focus: { subject: string; cast: string; face: boolean } | undefined;
      if (role === 'metaphor') {
        const list = sp.metaphors.length ? sp.metaphors : [ch.title];
        subject = list[used.metaphor % list.length];
        comp = composition(list.length, used.metaphor++);
        size = 'symbolic';
        setting = 'abstract';
      } else if (role === 'insert') {
        const list = sp.inserts.length ? sp.inserts : ['an object from the scene'];
        if (row && !rowCutawayUsed) {
          rowCutawayUsed = true;
          subject = row.cutaway;
          comp = composition(1, used.insert++);
        } else {
          subject = list[used.insert % list.length];
          comp = composition(list.length, used.insert++);
        }
        size = 'object';
        setting = 'tabletop';
      } else if (role === 'reenactment') {
        setting = chapterRe?.setting ?? ch.title;
        size = characterSize(['wide', 'medium'], 'reenactSize');
        comp = composition(1, used.reenact++);
        subject = setting;
      } else {
        setting = row ? row.setting : SETTINGS[turns.setting++ % SETTINGS.length];
        focus = castFocus(sp, focusTurn++ + ci, setting, ci);
        subject = focus.subject;
        size = characterSize(['wide', 'medium', 'close'], 'castSize');
        comp = '';
      }
      const cast = role === 'cast' ? (focus?.cast ?? castFor(sp, subject, ci)) : undefined;
      const spec = {
        role,
        size,
        subject,
        setting,
        look: chapterRe?.look,
        era: chapterRe?.era,
        lighting,
        composition: comp,
        cast,
        moment,
      };
      let prompt = withLongFrame(stillPrompt(spec) as string);
      for (let k = 1; prompts.has(prompt); k++) {
        prompt = withLongFrame(
          stillPrompt({
            ...spec,
            lighting: LIGHTING[(lightTurn + k) % LIGHTING.length],
            composition: `${comp}${comp ? ', ' : ''}variation ${k}`,
          }) as string,
        );
      }
      prompts.add(prompt);
      let face = false;
      if (role === 'cast') {
        face = focus ? focus.face : protagonist ? new RegExp(`\\b${protagonist}`, 'i').test(subject) : false;
      }
      return {
        key,
        kind: 'still',
        prompt,
        text,
        words: n,
        kenBurns,
        role,
        size,
        setting,
        subject,
        ...(comp ? { composition: comp } : {}),
        ...(face ? { face: true } : {}),
      };
    };

    const fillScenes = (from: number, to: number): Slot[] => {
      if (to - from <= 0) return [];
      const bounds = [from, ...starts.map((s) => s.start).filter((s) => s > from && s < to), to];
      return bounds.slice(0, -1).map((b, i) => {
        const sc = [...starts].reverse().find((s) => s.start <= b) ?? starts[0];
        return {
          start: b,
          end: bounds[i + 1],
          slot: {},
          make: (key, text, n) => {
            const seen = sceneVisuals.get(sc.scene.id);
            if (seen) return sceneAgain(seen, key, text, n) as PlanVisual;
            const v = sceneVisual(sc.scene, looks, key, text, n);
            sceneVisuals.set(sc.scene.id, v);
            lastScene.v = v;
            return v as PlanVisual;
          },
        };
      });
    };

    const fill = (from: number, to: number): Slot[] => {
      const len = to - from;
      if (len <= 0) return [];
      if (starts.length) return fillScenes(from, to);
      if (hasScenes && !starts.length && lastScene.v) {
        const v = lastScene.v;
        return [{ start: from, end: to, slot: {}, make: (key, text, n) => sceneAgain(v, key, text, n) as PlanVisual }];
      }
      const per = wordsBefore + from < FIRST_MINUTE_WORDS ? STILL_WORDS.first : STILL_WORDS.later;
      const count = Math.max(1, Math.ceil(len / per));
      const points = Array.from({ length: count + 1 }, (_, i) => from + Math.round((len * i) / count));
      return points.slice(0, -1).map((p, i) => {
        const slot: { role?: StillRole } = {};
        const item: Slot = { start: p, end: points[i + 1], slot, make: (key, text, n) => buildStill(slot, key, text, n) };
        stillSlots.push(item);
        return item;
      });
    };

    const segments: Slot[] = [];
    let at = 0;
    for (const s of placed) {
      const before = fill(at, s.start);
      if (!s.gap) {
        segments.push(...before, s);
        at = s.end;
      } else {
        segments.push(...before);
        at = Math.max(at, s.start);
        segments.push(s);
      }
    }
    segments.push(...fill(at, W));

    const droppedRe = dropped.find((c) => c.chapter === ch.title && c.role === 'reenactment');
    chapterRe = droppedRe
      ? { chapter: ch.title, era: droppedRe.era ?? '', setting: droppedRe.setting, look: droppedRe.look ?? '' }
      : sp.reenactments.find((r) => r.chapter === ch.title && !chClips.some((c) => c.role === 'reenactment'));

    const anchorWords = placed
      .filter((s) => !(s.gap || s.seconds) && s.make('', '', 0).kind === 'clip')
      .filter((s) => s.make('', '', 0).role === 'anchor')
      .reduce((a, s) => a + (s.end - s.start), 0);
    const mix = allocateMix({
      stills: stillSlots.length,
      capShare,
      chapterWords: W,
      castWords: anchorWords + 2,
      avgWords: stillSlots.length ? stillSlots.reduce((a, s) => a + (s.end - s.start), 0) / stillSlots.length : 1,
      needReenactment: Boolean(chapterRe),
    });
    stillSlots.forEach((s, i) => {
      (s.slot as { role?: StillRole }).role = mix[i];
    });
    if (row && stillSlots.length >= 2 && !stillSlots.some((s) => s.slot?.role === 'insert')) {
      const i = stillSlots.findIndex(
        (_s, k) => k > 0 && stillSlots[k - 1].slot?.role !== 'insert' && stillSlots[k + 1]?.slot?.role !== 'insert',
      );
      if (i > 0) (stillSlots[i].slot as { role?: StillRole }).role = 'insert';
    }
    const wordsOf = (s: Slot) => s.end - s.start;
    let castWords = anchorWords + stillSlots.filter((s) => s.slot?.role === 'cast').reduce((a, s) => a + wordsOf(s), 0);
    while (castWords + 2 > capShare * W) {
      const longest = stillSlots.filter((s) => s.slot?.role === 'cast').sort((a, b) => wordsOf(b) - wordsOf(a))[0];
      if (!longest) break;
      const i = stillSlots.indexOf(longest);
      const near = [stillSlots[i - 1]?.slot?.role, stillSlots[i + 1]?.slot?.role];
      (longest.slot as { role?: StillRole }).role = near.includes('insert') ? 'metaphor' : 'insert';
      castWords -= wordsOf(longest);
    }

    const visuals: PlanVisual[] = [];
    segments.forEach((seg) => {
      const text = words.slice(seg.start, seg.end).join(' ');
      const n = seg.end - seg.start;
      const last = visuals[visuals.length - 1];
      if (!seg.gap && n < 3 && last && !last.seconds && seg.slot) {
        last.words += n;
        last.text = `${last.text} ${text}`.trim();
        return;
      }
      visuals.push(seg.make(`${ch.index}_v${visuals.length + 1}`, text, n));
    });
    allVisuals.push(visuals);

    const counts: Record<string, number> = {};
    for (const v of visuals) {
      const r = v.role ?? 'graphic';
      counts[r] = (counts[r] ?? 0) + v.words;
    }
    const castShareWords = (counts.anchor ?? 0) + (counts.cast ?? 0);
    variety.push({ chapter: ch.title, score: varietyScore(counts), mix: counts, castShare: W ? castShareWords / W : 0 });

    const hoots: { pose: HootPose; after: number }[] = [];
    for (const c of carried) {
      const after = Math.min(W - 1, CHAPTER_CARD_WORDS - 1);
      if (wordsBefore + after - lastHoot.at >= HOOT_GAP_WORDS || lastHoot.at === -Infinity) {
        hoots.push({ pose: c.pose, after });
        lastHoot.at = wordsBefore + after;
      } else {
        problems.push(
          `${ch.title}: a Hoot moment carried over from the chapter before is within a minute of the last, so it is skipped`,
        );
      }
    }
    carried = [];
    for (const h of sp.hoot_moments.filter((x) => x.chapter === ch.title)) {
      const span = phraseSpan(ch.narration, h.after);
      const quote = h.after.slice(0, 30);
      if (!span) {
        problems.push(`${ch.title}: the Hoot moment after "${quote}" can't be placed`);
        continue;
      }
      const hootWords = Math.round(HOOT_MOMENT_SECONDS * WORDS_PER_SECOND);
      let pos = span.end;
      for (let k = 0; k < statSpans.length; k++) {
        const hit = statSpans.find(([s, e]) => pos < e && pos + hootWords > s);
        if (!hit) break;
        pos = hit[1];
      }
      if (pos >= W) {
        if (ci + 1 < chapters.length) {
          carried.push({ pose: h.pose });
          problems.push(
            `${ch.title}: the Hoot moment after "${quote}" has no room before the chapter ends under a stat card, so it steps in at the start of the next chapter`,
          );
        } else {
          problems.push(`${ch.title}: the Hoot moment after "${quote}" has no room after the stat card, so it is skipped`);
        }
        continue;
      }
      if (wordsBefore + pos - lastHoot.at < HOOT_GAP_WORDS) {
        problems.push(`${ch.title}: the Hoot moment after "${quote}" is within a minute of the last, so it is skipped`);
        continue;
      }
      if (pos !== span.end) {
        problems.push(
          `${ch.title}: the Hoot moment after "${quote}" would cover a stat card, so it waits for the card to end`,
        );
      }
      hoots.push({ pose: h.pose, after: pos - 1 });
      lastHoot.at = wordsBefore + pos;
    }
    if (hasScenes && !sp.hoot_moments.length) {
      for (const [k, sc] of starts.entries()) {
        if (k === 0 || sc.start >= W - 4) continue;
        if (wordsBefore + sc.start - lastHoot.at < HOOT_GAP_WORDS) continue;
        if (statSpans.some(([s, e]) => sc.start > s - 2 && sc.start < e + 2)) continue;
        hoots.push({ pose: AUTO_POSES[poseTurn++ % AUTO_POSES.length], after: sc.start - 1 });
        lastHoot.at = wordsBefore + sc.start;
      }
    }
    cues.push({ hoot: hoots, pauses });
    wordsBefore += W;
  });

  const target = hasScenes ? 0 : (opts.stillTarget ?? STILL_TARGET);
  const keep = new Set(
    chapters
      .map((c, i) => (opts.visualPlan?.some((r) => r.chapter === c.title) ? i : -1))
      .filter((i) => i >= 0),
  );
  const stills =
    target > 0
      ? reuseStills(allVisuals, target, keep)
      : {
          images: allVisuals.flat().filter((v) => v.kind === 'still' && !v.reuse).length,
          segments: allVisuals.flat().filter((v) => v.kind === 'still').length,
          overTarget: false,
        };
  if (stills.overTarget) {
    problems.push(
      `${stills.images} pictures to make for ${stills.segments} still moments: every chapter is already down to the pictures it must keep (target ${target}).`,
    );
  }
  return {
    chapters: allVisuals,
    cues,
    clips: { kept: clips.length, dropped: dropped.length },
    stills: { images: stills.images, segments: stills.segments },
    variety,
    problems,
  };
}
