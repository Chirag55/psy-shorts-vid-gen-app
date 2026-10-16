import * as config from './researchConfig';
import { fnv1a } from './researchLayer2';

/** A key-order-independent serialisation, regexes as their source. */
function stable(v: unknown): string {
  if (v instanceof RegExp) return v.toString();
  if (Array.isArray(v)) return `[${v.map(stable).join(',')}]`;
  if (!v || typeof v !== 'object') return JSON.stringify(v);
  const o = v as Record<string, unknown>;
  return `{${Object.keys(o)
    .filter((k) => o[k] !== undefined)
    .sort()
    .map((k) => `${JSON.stringify(k)}:${stable(o[k])}`)
    .join(',')}}`;
}

/** A hash of a run's input and every ranking rule, so two runs can be compared like for like. */
export function researchConfigHash(input: unknown): string {
  const c = config as Record<string, unknown>;
  return fnv1a(
    stable({
      input,
      rules: {
        RANK_WEIGHTS: c.RANK_WEIGHTS,
        SUB_FLOOR: c.SUB_FLOOR,
        MEDIAN_FLOOR: c.MEDIAN_FLOOR,
        SIZE_WEIGHT: c.SIZE_WEIGHT,
        CONSISTENTLY_BIG: c.CONSISTENTLY_BIG,
        OUTLIER_RATE_CAP: c.OUTLIER_RATE_CAP,
        DIVERSITY: c.DIVERSITY,
        KEYWORD_LABELS: c.KEYWORD_LABELS,
        KEYWORD_LOW_RESULTS: c.KEYWORD_LOW_RESULTS,
        LOOP_RANK_FACTOR: c.LOOP_RANK_FACTOR,
        NON_ENGLISH_MAX_SHARE: c.NON_ENGLISH_MAX_SHARE,
        LAYER2: c.LAYER2,
        BREAKOUT: c.BREAKOUT,
        SHORTS_MAX_SEC: c.SHORTS_MAX_SEC,
        NEGATIVE_TERMS: c.NEGATIVE_TERMS,
        NEGATIVE_PHRASES: c.NEGATIVE_PHRASES,
        NICHE_COTERMS: c.NICHE_COTERMS,
        EPISODE_PATTERN: c.EPISODE_PATTERN,
        GHOST_CONTEXT: c.GHOST_CONTEXT,
      },
    }),
  );
}
