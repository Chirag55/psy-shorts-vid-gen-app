import { hookUnit } from './authenticity';
import { conceptLead } from './longTitleLint';

export type HookVariant = 'default' | 'alt';

/** Shorts per variant before the comparison shows. */
export const HOOK_TEST_MIN = 8;
/** Below this per side the comparison is a small sample. */
export const HOOK_TEST_SMALL = 20;

const sentences = (text: string) => text.trim().split(/(?<=[.!?])\s+/).filter(Boolean);

function median(values: number[]): number | undefined {
  if (!values.length) return undefined;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  const m = s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
  return Math.round(m * 100) / 100;
}

/** Alternates the variant within a category, starting from the default. */
export function assignVariant(category: string, history: { category: string; variant?: string }[]): HookVariant {
  const last = [...history].reverse().find((h) => h.category === category)?.variant;
  return last === 'default' ? 'alt' : 'default';
}

/** The script with its hook unit swapped for the alt hook. */
export function withAltHook(script: string, alt: string): string {
  const sents = sentences(script);
  if (!sents.length || !alt.trim()) return script;
  return [alt.trim(), ...sents.slice(hookUnit(sents).length)].join(' ');
}

export function variantTitle(variant: HookVariant | undefined, title: string, altTitle?: string): string {
  return variant === 'alt' && altTitle?.trim() ? altTitle.trim() : title;
}

export interface HookRow {
  hookVariant?: HookVariant;
  averageViewPercentage: number;
  sharesPerView?: number;
}

export interface HookSide {
  n: number;
  medianWatch?: number;
  medianShares?: number;
}

export interface HookTest {
  ready: boolean;
  default: HookSide;
  alt: HookSide;
  confidence: 'small sample' | 'fair';
  summary: string;
  winner?: 'default' | 'alt' | 'tie';
  lesson?: string;
}

export function hookTest(rows: HookRow[]): HookTest {
  const side = (variant: HookVariant) => {
    const rs = rows.filter((r) => r.hookVariant === variant);
    return {
      rows: rs,
      n: rs.length,
      medianWatch: median(rs.map((r) => r.averageViewPercentage)),
      medianShares: median(rs.flatMap((r) => (r.sharesPerView !== undefined ? [r.sharesPerView] : []))),
    };
  };
  const d = side('default');
  const a = side('alt');
  const ready = d.n >= HOOK_TEST_MIN && a.n >= HOOK_TEST_MIN;
  const out: HookTest = {
    ready,
    default: { n: d.n, medianWatch: d.medianWatch, medianShares: d.medianShares },
    alt: { n: a.n, medianWatch: a.medianWatch, medianShares: a.medianShares },
    confidence: d.n < HOOK_TEST_SMALL || a.n < HOOK_TEST_SMALL ? 'small sample' : 'fair',
    summary: '',
  };
  if (!ready) {
    out.summary = `${d.n} default and ${a.n} alt Shorts published; the comparison appears at ${HOOK_TEST_MIN} of each.`;
    return out;
  }
  const dw = d.medianWatch ?? 0;
  const aw = a.medianWatch ?? 0;
  out.winner = Math.abs(dw - aw) < 1 ? 'tie' : aw > dw ? 'alt' : 'default';
  out.summary = `Median % viewed: default ${dw}% (${d.n}) against alt ${aw}% (${a.n}); ${out.confidence}.`;
  out.lesson =
    out.winner === 'tie'
      ? 'The "If you…" identification hooks and the default hooks hold viewers about equally; keep mixing them.'
      : out.winner === 'alt'
        ? 'Identification hooks ("If you…") held viewers better than the default hooks; try opening more Shorts that way.'
        : 'The default hooks held viewers better than the identification ("If you…") hooks; keep them as the default.';
  return out;
}

/** The script with its first beat set to the chosen hook. */
export function applyHookVariant<T extends { beats: { text: string }[]; bankV2?: any }>(script: T, variant: HookVariant | undefined): T {
  const bank = script.bankV2;
  if (!bank?.hookAlt || !bank.hookDefault) return script;
  const hook: string = variant !== 'alt' ? bank.hookDefault : bank.hookAlt;
  if (script.beats[0]?.text === hook) return script;
  return { ...script, beats: script.beats.map((b, i) => (i === 0 ? { ...b, text: hook } : b)) };
}

/** The variant the next Short in this pillar should use. */
export function nextVariantFor(script: any, projects: any[]): HookVariant {
  const bank = script.bankV2;
  if (!bank?.hookAlt) return 'default';
  if (conceptLead(bank.hookDefault ?? script.beats[0]?.text ?? '') && !conceptLead(bank.hookAlt)) return 'alt';
  const history = projects
    .filter((p) => p.mode === 'short' && p.script.bankV2?.hookAlt)
    .map((p) => ({ category: p.script.bankV2?.pillar ?? '', variant: p.hookVariant }));
  return assignVariant(bank.pillar, history);
}
