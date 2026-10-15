import { moveForChapter } from './kenburns';
import { stripMascotFromPrompt } from './promptHygiene';
import { withStyleLock } from './styleLock';
import { longWordCap, shortWordTarget, structureForFormat, type PromptEntry } from './prompts';
import type { RawLongScript, RawShortScript } from './scriptSchemas';
import type { LongScript, ShortScript, StimulusCard } from './types';

/** Model output → the app's script model: titles deduplicated, prompts mascot-stripped and style-locked. */

const HEX = /^#[0-9a-f]{6}$/i;

const clamp = (v: unknown, lo: number, hi: number, fallback: number) =>
  typeof v === 'number' && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : fallback;

/** Hashtags removed, whitespace collapsed, case-insensitive duplicates dropped; the preferred title first. */
function cleanTitles(preferred: string, others: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const t of [preferred, ...others]) {
    const c = (t ?? '').replace(/\s*#\S+/g, '').replace(/\s+/g, ' ').trim();
    const key = c.toLowerCase();
    if (!c || seen.has(key)) continue;
    seen.add(key);
    out.push(c);
  }
  return out;
}

/** Keeps only drawable items, inside the safe area; falls back to a dark card with a white "l" text. */
export function sanitiseStimulusCard(card: any): StimulusCard | undefined {
  if (!card || !Array.isArray(card.items)) return undefined;
  const items = card.items
    .filter((i: any) => typeof i.text === 'string' && i.text.trim())
    .map((i: any) => ({
      text: i.text.trim(),
      color: HEX.test(i.color) ? i.color : '#FFFFFF',
      size: ['s', 'm', 'l', 'xl'].includes(i.size) ? i.size : 'l',
      x: clamp(i.x, 0.05, 0.95, 0.5),
      y: clamp(i.y, 0.08, 0.92, 0.5),
    }));
  if (!items.length) return undefined;
  return {
    background: HEX.test(card.background) ? card.background : '#101418',
    frame: card.frame === 'triangle' || card.frame === 'box' ? card.frame : 'none',
    items,
  };
}

export function toShortScript(raw: RawShortScript, structure: string, entry?: PromptEntry & { id?: string; tag_line?: string }): ShortScript {
  const preferred = entry?.title ?? raw.titleOptions?.[0] ?? raw.title;
  const titles = cleanTitles(preferred, [...(raw.titleOptions ?? []), raw.title]).slice(0, 3);
  const fromEntry = entry
    ? {
        bankEntryId: entry.id,
        wordTarget: shortWordTarget(entry),
        ctaQuestion: entry.cta_question,
        tagLine: entry.tag_line,
        ...(entry.format === 'test'
          ? { stimulus: { description: entry.stimulus ?? '', holdSeconds: entry.stimulus_hold_s ?? 0, card: sanitiseStimulusCard(raw.stimulusCard) } }
          : {}),
      }
    : {};
  const sourceLine = raw.sourceLine?.trim();
  const pov = raw.hookTextPov?.trim();
  return {
    mode: 'short',
    structure: entry ? structureForFormat(entry.format) : structure,
    title: titles[0] ?? raw.title,
    titleOptions: titles,
    ...fromEntry,
    tactic: raw.tactic?.trim(),
    ...(sourceLine ? { sourceLine } : {}),
    hookText: raw.hookText?.trim(),
    ...(pov ? { hookTextPov: pov } : {}),
    loopBridge: raw.loopBridge?.trim(),
    hookLine: raw.hookLine,
    characterDescription: raw.characterDescription,
    archetype: raw.archetype,
    hashtags: raw.hashtags ?? [],
    beats: (raw.beats ?? []).map((b) => ({
      kind: b.kind,
      text: b.text,
      ...(b.cardText?.trim() ? { cardText: b.cardText.trim() } : {}),
      shots: (b.shots ?? []).map((s) => ({ ...s, clipPrompt: withStyleLock(stripMascotFromPrompt(s.clipPrompt)) })),
    })),
  };
}

export function toLongScript(raw: RawLongScript, structure: string, entry?: PromptEntry & { id?: string }): LongScript {
  return {
    mode: 'long',
    structure,
    title: entry?.title ?? raw.title.replace(/\s*#\S+/g, '').trim(),
    ...(entry ? { bankEntryId: entry.id, wordTarget: longWordCap(entry), ctaQuestion: entry.cta_question } : {}),
    coldOpen: raw.coldOpen,
    characterDescription: raw.characterDescription,
    archetype: raw.archetype,
    closingSynthesis: raw.closingSynthesis,
    tags: raw.tags ?? [],
    tactics: (raw.tactics ?? []).map((t) => t.trim()).filter(Boolean),
    chapters: (raw.chapters ?? []).map((c, i) => ({
      ...c,
      index: i + 1,
      kenBurns: moveForChapter(i),
      heroA: withStyleLock(stripMascotFromPrompt(c.heroA)),
      heroB: withStyleLock(stripMascotFromPrompt(c.heroB)),
      stillPrompt: withStyleLock(stripMascotFromPrompt(c.stillPrompt)),
    })),
  };
}
