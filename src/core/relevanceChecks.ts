import {
  EPISODE_PATTERN,
  GHOST_CONTEXT,
  NEGATIVE_PHRASES,
  NEGATIVE_TERMS,
  NICHE_COTERMS,
  NON_ENGLISH_MAX_SHARE,
} from './researchConfig';
import { titleTokens } from './titleSimilarity';

export type RelevanceResult =
  | { status: 'pass' }
  | { status: 'flag'; reason: string }
  | { status: 'drop'; reason: string; group: string };

const squash = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Whether a hashtag is the term, or starts with it when the term is 4+ letters. */
function hashtagHas(tags: string[], term: string): boolean {
  const s = squash(term);
  return tags.some((t) => t === s || (s.length >= 4 && t.startsWith(s)));
}

/** Share of letters outside the Latin script (0 for very short titles). */
export function nonLatinShare(text: string): number {
  const letters = [...text].filter((c) => /\p{L}/u.test(c));
  if (letters.length < 4) return 0;
  return 1 - letters.filter((c) => /[A-Za-zÀ-ɏ]/.test(c)).length / letters.length;
}

/** Niche terms the title uses, with ambiguous ones needing a co-term ("mind" plus "psychology"). */
export function nicheMatches(lowerTitle: string, terms: string[]): string[] {
  const words = new Set(lowerTitle.split(/[^\p{L}\p{N}']+/u).filter(Boolean));
  return terms.filter((term) => {
    const t = term.toLowerCase();
    if (!new RegExp(`(^|[^\\p{L}\\p{N}])${escape(t)}`, 'u').test(lowerTitle)) return false;
    const co = NICHE_COTERMS[t];
    return !co || co.some((c) => words.has(c));
  });
}

/** Whether a competitor video belongs in research: language, fandom, negatives, paranormal, niche, podcast. */
export function checkRelevance(
  item: { titleClean: string; hashtags: string[] },
  description: string,
  profile: { entityBlocklist: string[]; nicheTerms: string[]; podcastTerms: string[] },
): RelevanceResult {
  const tokens = new Set(titleTokens(item.titleClean));
  const lower = item.titleClean.toLowerCase();
  const tags = item.hashtags;
  if (nonLatinShare(item.titleClean) > NON_ENGLISH_MAX_SHARE) {
    return { status: 'drop', reason: 'Non-English', group: 'Non-English' };
  }
  const desc = description.toLowerCase();
  const tagText = tags.join(' ');
  for (const entity of profile.entityBlocklist) {
    const t = entity.toLowerCase().trim();
    if (!t) continue;
    const re = new RegExp(`\\b${escape(t)}\\b`, 'i');
    if (re.test(lower) || re.test(desc) || tagText.includes(squash(t))) {
      return { status: 'drop', reason: `Fandom/TV: "${entity}"`, group: 'Format/fandom' };
    }
  }
  if (EPISODE_PATTERN.test(item.titleClean) || tags.some((t) => /^s\d+e\d+$/.test(t))) {
    return { status: 'drop', reason: 'TV episode code', group: 'Format/fandom' };
  }
  for (const [group, terms] of Object.entries(NEGATIVE_TERMS)) {
    for (const term of terms) {
      if (tokens.has(term) || hashtagHas(tags, term)) return { status: 'drop', reason: `${group}: "${term}"`, group };
    }
  }
  const spaced = lower.replace(/[-_]+/g, ' ').replace(/\s+/g, ' ');
  for (const [group, phrases] of Object.entries(NEGATIVE_PHRASES)) {
    for (const phrase of phrases) {
      if (
        new RegExp(`(^|[^\\p{L}])${escape(phrase)}($|[^\\p{L}])`, 'u').test(spaced) ||
        tags.includes(squash(phrase))
      ) {
        return { status: 'drop', reason: `${group}: "${phrase}"`, group };
      }
    }
  }
  const ghostWord = tokens.has('ghost') || tokens.has('ghosted') || tokens.has('ghosting');
  const ghostTag = tags.some((t) => t === 'ghost' || t === 'ghosts');
  const ghostContext = GHOST_CONTEXT.some((w) => tokens.has(w) || tags.includes(w));
  if (ghostTag || (ghostWord && ghostContext)) {
    return { status: 'drop', reason: 'Paranormal: "ghost"', group: 'Paranormal' };
  }
  if (!nicheMatches(lower, profile.nicheTerms).length) {
    const ambiguous = profile.nicheTerms.some(
      (t) =>
        NICHE_COTERMS[t.toLowerCase()] &&
        new RegExp(`(^|[^\\p{L}\\p{N}])${escape(t.toLowerCase())}`, 'u').test(lower),
    );
    return {
      status: 'drop',
      reason: ambiguous
        ? 'No niche term in the title ("mind" needs psychology, trick, read, brain or people)'
        : 'No niche term in the title',
      group: 'Off-niche',
    };
  }
  for (const term of profile.podcastTerms) {
    const t = term.toLowerCase();
    if (lower.includes(t) || desc.includes(t) || hashtagHas(tags, t)) return { status: 'flag', reason: 'Podcast clip' };
  }
  return { status: 'pass' };
}

/** A comma- or line-separated list as clean, unique terms. */
export function parseTermList(text: string): string[] {
  return [
    ...new Set(
      text
        .split(/[,\n]/)
        .map((s) => s.trim().toLowerCase().replace(/\s+/g, ' '))
        .filter(Boolean),
    ),
  ];
}
