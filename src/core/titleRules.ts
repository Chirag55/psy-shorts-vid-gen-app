/**
 * Title rules learnt from this channel's own results: concept-first titles got
 * 11-35 views; numbered and "Why You…" titles got 70-612.
 */
export interface TitleRuleConfig {
  /** How many leading words count as "the start" of the title. */
  leadingWords: number;
  /** A colon before this many characters reads as "Concept: explanation". */
  colonWithin: number;
  maxLength: number;
  /** Psychology terms that must not lead a title. */
  conceptTerms: string[];
}

export type TitlePattern = 'numbered' | 'why_you' | 'signs' | 'concept_first' | 'other';

const NUMBER_WORDS = ['one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten'];

function clean(title: string): string {
  return title.trim().replace(/\s+/g, ' ');
}

export function leadsWithNumber(title: string): boolean {
  const first = clean(title).split(' ')[0]?.toLowerCase() ?? '';
  return /^\d+$/.test(first) || NUMBER_WORDS.includes(first);
}

/** The concept term the title opens with, if any (longest match wins; "the" is ignored). */
export function leadingConcept(title: string, cfg: TitleRuleConfig): string | undefined {
  const head = clean(title)
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s'-]/gu, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, cfg.leadingWords)
    .join(' ')
    .replace(/^the /, '');
  return cfg.conceptTerms
    .map((t) => t.toLowerCase().replace(/^the /, ''))
    .filter(Boolean)
    .sort((a, b) => b.length - a.length)
    .find((t) => head === t || head.startsWith(`${t} `) || head.startsWith(`${t}'`) || head.startsWith(`${t}-`));
}

export function titlePattern(title: string, cfg: TitleRuleConfig): TitlePattern {
  const t = clean(title);
  if (leadsWithNumber(t)) return 'numbered';
  if (/^why (you|your|you're|you’re)\b/i.test(t)) return 'why_you';
  if (/^signs? (someone|you|your)\b/i.test(t)) return 'signs';
  const colon = t.indexOf(':');
  if (leadingConcept(t, cfg) || (colon >= 0 && colon < cfg.colonWithin)) return 'concept_first';
  return 'other';
}

export function lintTitle(title: string, cfg: TitleRuleConfig): string[] {
  const t = clean(title);
  const out: string[] = [];
  if (!t) return out;
  const concept = leadingConcept(t, cfg);
  if (concept) out.push(`Opens with the concept "${concept}". Concept-first titles got 11–35 views here; lead with a number, "Why You…" or "Signs…".`);
  const colon = t.indexOf(':');
  if (colon >= 0 && colon < cfg.colonWithin) out.push(`Colon in the first ${cfg.colonWithin} characters: reads as "Concept: explanation".`);
  if (t.includes('#')) out.push('Contains "#". Hashtags, #Shorts included, go in the description.');
  if (t.length > cfg.maxLength) out.push(`${t.length} characters; keep it to ${cfg.maxLength}.`);
  if (!/\b(you|your|you're|you’re|yours|yourself)\b/i.test(t) && !leadsWithNumber(t)) {
    out.push('Neither "you/your" nor a leading number. Address the viewer, or lead with a number.');
  }
  const caps = t.split(' ').filter((w) => /^[A-Z]{4,}[!?.,]*$/.test(w));
  if (caps.length) out.push(`ALL CAPS word${caps.length > 1 ? 's' : ''} (${caps.join(', ')}).`);
  return out;
}

export function titleRulesPrompt(cfg: TitleRuleConfig): string {
  const examples = cfg.conceptTerms
    .slice(0, 3)
    .map((t) => `"${t[0].toUpperCase()}${t.slice(1)}:"`)
    .join(', ');
  return (
    'TITLE RULES FROM THIS CHANNEL\'S RESULTS (concept-first titles got 11-35 views; numbered and "Why You…" titles got 70-612):\n' +
    '- PREFER: a number first ("3 Signs…", "4 Things…"), or "Why You…" / "Why Your…", or "Signs someone…" / "Signs you…".\n' +
    `- PREFER: plain words a 30-year-old uses, addressed to "you", ${cfg.maxLength} characters or fewer.\n` +
    `- AVOID: a psychology term as the first word or before a colon (${examples}, "The Pratfall Effect:").\n` +
    '- AVOID: hashtags in titles, "#Shorts" included, and ALL CAPS words.'
  );
}
