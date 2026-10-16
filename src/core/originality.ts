/** Title originality against cached competitor titles. Rebuilt from 6.1.13. */
export const ORIGINALITY = { block: 0.8, warn: 0.65 };
export const ORIGINALITY_CHECKLIST = [
  'The title is not a near-copy of a competitor video.',
  'The explanation names a study or source.',
  'The visuals are our own (Hoot, the cast, Flow or Veo output).',
];

const STOP = new Set(
  "a an the and or but if so of to in on at by for with from as is are was were be been being am it its it's this that these those you your you're youre yours we our they them their he she his her i me my not no do does did can could should would will just than then too very how what when who whom which about into out up down over under why because while also more most some any every each all get gets got".split(
    ' ',
  ),
);
const GENERIC = new Set([
  'sign', 'signs', 'reason', 'reasons', 'way', 'ways', 'trick', 'tricks', 'thing', 'things', 'tactic', 'tactics',
  'tip', 'tips', 'habit', 'habits', 'flag', 'flags', 'watch', 'psychology', 'explained',
]);

function stem(w: string): string {
  if (w.length > 4 && w.endsWith('ies')) return `${w.slice(0, -3)}y`;
  if (w.length > 3 && w.endsWith('s') && !w.endsWith('ss')) return w.slice(0, -1);
  return w;
}

const norm = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();

export function titleTokens(title: string): string[] {
  const words = title
    .toLowerCase()
    .replace(/[‘’]/g, "'")
    .replace(/\([^)]*\)/g, ' $& ')
    .replace(/[^\p{L}\p{N}\s'-]/gu, ' ')
    .split(/\s+/)
    .map((w) => w.replace(/^'+|'+$/g, ''))
    .filter((w) => w && !/^\d+$/.test(w) && !STOP.has(w) && !GENERIC.has(w));
  return [...new Set(words.map(stem))];
}

/** Jaccard overlap of the titles' content words; 1 for the same title. */
export function titleSimilarity(a: string, b: string): number {
  if (norm(a) && norm(a) === norm(b)) return 1;
  const ta = titleTokens(a);
  const tb = titleTokens(b);
  if (ta.length < 2 || tb.length < 2) return 0;
  const both = ta.filter((t) => tb.includes(t)).length;
  return both / (ta.length + tb.length - both);
}

export interface Competitor {
  title: string;
  channel?: string;
  [k: string]: unknown;
}

export interface OriginalityMatch {
  proposed: string;
  competitor: Competitor;
  score: number;
}

export interface OriginalityResult {
  level: 'ok' | 'amber' | 'red';
  matches: OriginalityMatch[];
}

export function checkOriginality(titles: string[], competitors: Competitor[]): OriginalityResult {
  const matches: OriginalityMatch[] = [];
  for (const proposed of titles.map((t) => t.trim()).filter(Boolean)) {
    for (const competitor of competitors) {
      const s = titleSimilarity(proposed, competitor.title);
      if (s >= ORIGINALITY.warn) matches.push({ proposed, competitor, score: Math.round(s * 100) / 100 });
    }
  }
  matches.sort((a, b) => b.score - a.score);
  const level = matches.some((m) => m.score >= ORIGINALITY.block) ? 'red' : matches.length ? 'amber' : 'ok';
  return { level, matches: matches.slice(0, 5) };
}

export function originalityLine(r: OriginalityResult): string {
  if (r.level === 'ok') return 'No title is close to a cached competitor title.';
  const m = r.matches[0];
  const channel = m.competitor.channel ? ` (${m.competitor.channel})` : '';
  return `${r.level === 'red' ? 'Near-copy' : 'Similar'}: "${m.proposed}" is ${Math.round(m.score * 100)}% like the competitor title "${m.competitor.title}"${channel}.`;
}
