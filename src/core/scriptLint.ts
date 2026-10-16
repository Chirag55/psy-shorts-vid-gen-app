export const LINT = { maxResearchers: 3, maxYears: 6, stockWindow: 4, stockRepeats: 3, shortWords: 75, titleColon: 25 };
/** Stock lines that go stale when every long-form uses them. */
export const STOCK_PHRASES = ['quick one', "it's on screen now", 'take a guess'];

export interface LintIssue {
  id: string;
  rule: string;
  message: string;
}

const norm = (s: string) => s.toLowerCase().replace(/[‘’]/g, "'");
const wordCount = (s: string) => s.split(/\s+/).filter(Boolean).length;
const longText = (e: any): string => e.chapters.map((c: any) => c.narration).join(' ');

/** Surnames cited in a source line, before its year. */
export function citedNames(source: string): string[] {
  return source
    .split(/\(\d{4}/)[0]
    .split(/,|&|\band\b|\bet al\.?/i)
    .map((p) => p.trim().split(/\s+/).pop() ?? '')
    .filter((n) => /^[A-Z][A-Za-z'’-]{2,}$/.test(n));
}

/** Too many researchers or years read aloud in one long-form. */
export function lintLong(e: any): LintIssue[] {
  const out: LintIssue[] = [];
  const text = longText(e);
  const named = (e.sources as string[]).filter((s) => {
    const n = citedNames(s)[0];
    return n && new RegExp(`\\b${n}\\b`).test(text);
  });
  if (named.length > LINT.maxResearchers) {
    out.push({
      id: e.id,
      rule: 'researchers',
      message: `${e.id}: ${named.length} researchers are named aloud (${named.map((s) => citedNames(s)[0]).join(', ')}); ${LINT.maxResearchers} at most.`,
    });
  }
  const years = text.match(/\b(19|20)\d{2}\b/g) ?? [];
  if (years.length > LINT.maxYears) {
    out.push({ id: e.id, rule: 'years', message: `${e.id}: ${years.length} years are spoken; ${LINT.maxYears} at most.` });
  }
  return out;
}

/** A stock phrase in too many long-forms in a row. */
export function lintStockPhrases(longs: any[]): LintIssue[] {
  const sorted = [...longs].sort((a, b) => a.publish_order - b.publish_order);
  const has = (e: any, phrase: string) => norm(longText(e)).includes(phrase);
  const out: LintIssue[] = [];
  for (const phrase of STOCK_PHRASES) {
    for (let i = 0; i + LINT.stockWindow <= sorted.length; i++) {
      const window = sorted.slice(i, i + LINT.stockWindow);
      const hits = window.filter((e) => has(e, phrase));
      if (hits.length >= LINT.stockRepeats) {
        out.push({
          id: window[0].id,
          rule: 'stock-phrase',
          message: `"${phrase}" is in ${hits.length} of ${window.length} long-forms in a row (${hits.map((e) => e.id).join(', ')}); vary it.`,
        });
        break;
      }
    }
  }
  return out;
}

/** A Short's title hook and length. */
export function lintShort(e: any): LintIssue[] {
  const out: LintIssue[] = [];
  const title: string = e.title;
  const hooked =
    /\byou(r|'re|'ve|'ll)?\b/i.test(title) ||
    /\d/.test(title) ||
    /\b(one|two|three|four|five|six|seven|eight|nine|ten)\b/i.test(title) ||
    /^if\b/i.test(title);
  if (!hooked) out.push({ id: e.id, rule: 'short-title', message: `${e.id}: the title has no "you", number or "If…" frame.` });
  const colon = title.indexOf(':');
  if (colon >= 0 && colon < LINT.titleColon) {
    out.push({
      id: e.id,
      rule: 'short-title',
      message: `${e.id}: the title has a colon within its first ${LINT.titleColon} characters.`,
    });
  }
  const n = wordCount(e.narration);
  if (n > LINT.shortWords) {
    out.push({ id: e.id, rule: 'short-length', message: `${e.id}: ${n} words; a Short over ${LINT.shortWords} runs long.` });
  }
  return out;
}

export function lintBank(entries: any[]): LintIssue[] {
  const longs = entries.filter((e) => e.kind === 'long');
  return [
    ...longs.flatMap(lintLong),
    ...lintStockPhrases(longs),
    ...entries.filter((e) => e.kind === 'short').flatMap(lintShort),
  ];
}
