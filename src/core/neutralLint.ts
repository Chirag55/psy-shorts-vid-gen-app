/**
 * CR-78: the channel is for an international audience, so bank text and
 * prompts avoid culture-tied words, places and the legacy cast names.
 * Rebuilt from 6.1.13.
 */
import { narrationText } from './authenticity';
import type { Project } from './types';

export const NEUTRAL_TERMS = [
  'rupee', 'rupees', 'lakh', 'lakhs', 'crore', 'crores', 'diwali', 'holi', 'chai', 'samosa', 'biryani', 'tiffin',
  'dhaba', 'saree', 'sari', 'kurta', 'salwar', 'bollywood', 'auto-rickshaw', 'rickshaw', 'mumbai', 'delhi',
  'bangalore', 'bengaluru', 'kolkata', 'chennai', 'hyderabad', 'pune', 'goa', 'india', 'indian', 'london', 'paris',
  'new york', 'tokyo', 'beijing', 'dubai', 'sydney', 'toronto', 'los angeles', 'berlin', 'madrid', 'rome', 'america',
  'american', 'britain', 'british', 'canada', 'australia', 'pakistan', 'china', 'chinese', 'japan', 'japanese',
  'germany', 'france', 'italy', 'spain', 'mexico', 'brazil', 'nigeria', 'mum', 'meera', 'kabir', 'ritu', 'dev',
  'arjun', 'desai', 'priya', 'rahul', 'raj', 'anita', 'sanjay', 'amit', 'neha', 'rohit', 'pooja', 'vikram', 'ananya',
  'aarav', 'ishaan', 'kavya',
];

/** "flat" in the apartment sense only; "flat" as an adjective is fine. */
const FLAT_RE =
  /(?<=\b(?:my|his|her|their|our|your|shared|empty|new|own|tiny|small|rented|first|moving)\s+)flats?\b|\bflats\b|\bflat(?:mates?|-hunting)\b/gi;

export const LEGACY_CAST_NAMES = ['Meera', 'Arjun', 'Dev', 'Kabir', 'Ritu', 'Desai'];
const LEGACY_RE = new RegExp(`\\b(?:${LEGACY_CAST_NAMES.join('|')})\\b`, 'g');

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function termRegex(terms: string[]): RegExp | null {
  const list = terms.map((t) => t.trim().toLowerCase()).filter(Boolean);
  if (!list.length) return null;
  const sorted = [...new Set(list)].sort((a, b) => b.length - a.length).map(escape);
  return new RegExp(`(?<![\\w-])(?:${sorted.join('|')})(?![\\w-])`, 'gi');
}

/** Culture-tied words in `text`, in order of first appearance, each once. */
export function neutralHits(text: string, extra: string[] = []): string[] {
  const hits: { at: number; term: string }[] = [];
  const re = termRegex([...NEUTRAL_TERMS, ...extra]);
  if (re) for (const m of text.matchAll(re)) hits.push({ at: m.index ?? 0, term: m[0].toLowerCase() });
  for (const m of text.matchAll(FLAT_RE)) hits.push({ at: m.index ?? 0, term: m[0].toLowerCase() });
  const seen = new Set<string>();
  return hits
    .sort((a, b) => a.at - b.at)
    .filter((h) => {
      if (seen.has(h.term)) return false;
      seen.add(h.term);
      return true;
    })
    .map((h) => h.term);
}

/** Every piece of an entry that is spoken, shown or prompted, with where it lives. */
export function entryTexts(e: any): { where: string; text: string }[] {
  const alts: string[] = e.kind !== 'long' ? (e.title_alt ? [e.title_alt] : []) : (e.title_alts ?? []);
  const out: { where: string; text: string }[] = [{ where: 'title', text: [e.title, ...alts].join(' | ') }];
  const sp = e.kind === 'long' ? e.screenplay : undefined;
  if (e.kind !== 'short') {
    e.chapters.forEach((c: any) => out.push({ where: `chapter "${c.title}"`, text: c.narration }));
    if (e.hook_alt) out.push({ where: 'alt hook', text: e.hook_alt });
    if (sp) {
      if (sp.story_spine) out.push({ where: 'story spine', text: sp.story_spine });
      sp.anchors.forEach((a: any, i: number) => out.push({ where: `anchor ${i + 1}`, text: a.beat }));
      sp.flow_clips.forEach((c: any, i: number) => out.push({ where: `clip ${i + 1}`, text: c.beat }));
      sp.reenactments.forEach((r: any, i: number) =>
        out.push({ where: `reenactment ${i + 1}`, text: `${r.setting}. ${r.look}` }),
      );
      if (sp.metaphors.length) out.push({ where: 'metaphors', text: sp.metaphors.join(' | ') });
      if (sp.inserts.length) out.push({ where: 'inserts', text: sp.inserts.join(' | ') });
    }
    if (e.visual_plan?.length) {
      out.push({
        where: 'visual plan',
        text: e.visual_plan.map((r: any) => `${r.setting} | ${r.cutaway}`).join(' | '),
      });
    }
    return out;
  }
  out.push({ where: 'narration', text: e.narration });
  if (e.hook_alt) out.push({ where: 'alt hook', text: e.hook_alt });
  for (const [where, list] of [
    ['settings', e.settings_pool],
    ['props', e.insert_props],
  ] as [string, string[] | undefined][]) {
    if (list?.length) out.push({ where, text: list.join(' | ') });
  }
  if (e.metaphor) out.push({ where: 'metaphor', text: e.metaphor });
  return out;
}

export interface NeutralFinding {
  id: string;
  where: string;
  terms: string[];
}

export function neutralFindings(entries: any[], extra: string[] = []): NeutralFinding[] {
  return entries.flatMap((e) =>
    entryTexts(e).flatMap(({ where, text }) => {
      const terms = neutralHits(text, extra);
      return terms.length ? [{ id: e.id, where, terms }] : [];
    }),
  );
}

export function legacyNameHits(text: string): string[] {
  return [...new Set(text.match(LEGACY_RE) ?? [])];
}

/** Voiced projects whose lines still say a renamed cast member need a re-voice. */
export function revoiceReason(project: Project): string | null {
  const voiced =
    Object.keys(project.assets.audio ?? {}).length > 0 || Object.keys(project.assets.alignment ?? {}).length > 0;
  if (!voiced) return null;
  const names = [...new Set(narrationText(project.script).match(LEGACY_RE) ?? [])];
  if (!names.length) return null;
  return `Needs re-voice: the vignette lines say ${names.join(', ')}, who were renamed for an international audience (CR-78).`;
}
