/** Visual variety checks for a Short's shot list. Rebuilt from 6.1.13. */
import type { ShortScript } from './types';

export const SHORT_VARIETY = { visuals: 8, settings: 2, maxVisualsPerClip: 2 };

export interface VarietyCheck {
  id: string;
  label: string;
  ok: boolean;
  detail: string;
}

const words = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 3);

/** Whether `prompt` names at least half the content words of `phrase`. */
export function mentions(prompt: string, phrase: string): boolean {
  const want = [...new Set(words(phrase))];
  if (!want.length) return false;
  const have = new Set(words(prompt));
  return want.filter((w) => have.has(w)).length >= Math.ceil(want.length * 0.5);
}

export function shortVarietyChecks(script: ShortScript): VarietyCheck[] {
  const v2 = (script as ShortScript & {
    bankV2?: { format?: string; visualBeats?: string[]; insertProps?: string[]; metaphor?: string };
  }).bankV2;
  const shots = script.beats.flatMap((b) => b.shots ?? []);
  const prompts = shots.map((s) => s.clipPrompt as string);
  const numerals = v2?.format === 'LIST' ? script.beats.filter((b) => b.cardText).length : 0;
  const out: VarietyCheck[] = [];
  out.push({
    id: 'visuals',
    label: 'Distinct visuals',
    ok: shots.length + numerals >= SHORT_VARIETY.visuals,
    detail: `${shots.length} shots${numerals ? ` and ${numerals} numeral cards` : ''} (${SHORT_VARIETY.visuals} or more).`,
  });
  const settings = new Set(shots.map((s) => s.setting.trim().toLowerCase()).filter(Boolean));
  out.push({
    id: 'settings',
    label: 'Settings',
    ok: settings.size >= SHORT_VARIETY.settings,
    detail: `${settings.size} setting${settings.size === 1 ? '' : 's'} (${SHORT_VARIETY.settings} or more).`,
  });
  const closeUp = shots.some((s) => s.isCutaway || /\b(macro insert|close-up|close on)\b/i.test(s.clipPrompt as string));
  const hasBeats = Boolean(v2?.visualBeats?.length);
  const props = v2?.insertProps?.length && !hasBeats ? v2.insertProps : null;
  out.push({
    id: 'close-up',
    label: 'Close-up',
    ok: props ? props.some((p) => prompts.some((q) => mentions(q, p))) : closeUp,
    detail: props ? `A close-up of one of: ${props.join('; ')}.` : 'At least one close-up of an object.',
  });
  if (v2?.metaphor && !hasBeats) {
    const metaphor = v2.metaphor;
    out.push({
      id: 'metaphor',
      label: 'Symbolic image',
      ok: prompts.some((q) => mentions(q, metaphor)),
      detail: `A visual for "${metaphor}".`,
    });
  }
  const counts = new Map<string, number>();
  for (const p of prompts) counts.set(p, (counts.get(p) ?? 0) + 1);
  const most = Math.max(0, ...counts.values());
  out.push({
    id: 'clip-reuse',
    label: 'Clip reuse',
    ok: most <= SHORT_VARIETY.maxVisualsPerClip,
    detail: `No prompt used more than ${SHORT_VARIETY.maxVisualsPerClip} times (the most is ${most}).`,
  });
  return out;
}
