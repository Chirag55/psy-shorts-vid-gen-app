const HASHTAG = /#[\p{L}\p{N}_]+/gu;
const EMOJI = /[\p{Extended_Pictographic}\u{1F1E6}-\u{1F1FF}\u{FE0F}\u{200D}\u{20E3}]/gu;

/** A title without hashtags, emoji or a trailing separator, plus its hashtags. */
export function normalizeTitle(title: string): { titleClean: string; hashtags: string[] } {
  const tags = (title.match(HASHTAG) ?? []).map((t) => t.slice(1).toLowerCase());
  const titleClean = title
    .replace(HASHTAG, ' ')
    .replace(EMOJI, ' ')
    .replace(/\s*[|•·]\s*$/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  return { titleClean, hashtags: [...new Set(tags)] };
}

export function titleTokens(title: string): string[] {
  return title.toLowerCase().match(/[\p{L}\p{N}']+/gu) ?? [];
}

/** Word tokens for comparing titles, ignoring "Part 2" style numbering. */
export function comparisonTokens(title: string): Set<string> {
  return new Set(
    title
      .toLowerCase()
      .replace(/\bp(ar)?t\.?\s*\d+\b/g, ' ')
      .match(/[\p{L}']+/gu) ?? [],
  );
}

/** Jaccard similarity of two token sets (1 when both are empty). */
export function tokenSetSimilarity(a: Set<string>, b: Set<string>): number {
  if (!a.size && !b.size) return 1;
  let shared = 0;
  for (const t of a) if (b.has(t)) shared++;
  return shared / (a.size + b.size - shared);
}
