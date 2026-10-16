import {
  BREAKOUT,
  CONSISTENTLY_BIG,
  FLAGS,
  MEDIAN_FLOOR,
  NON_ENGLISH_MAX_SHARE,
  RANK_WEIGHTS,
  SHORTS_MAX_SEC,
  SIZE_WEIGHT,
  SUB_FLOOR,
} from './researchConfig';

/** Flags that keep a video out of pattern mining. */
export const PATTERN_EXCLUDED_FLAGS = ['Loop-inflated', 'Podcast clip', 'Consistently big'];

export interface ScoredVideo {
  hoursSincePublish: number;
  vph: number;
  subs: number | null;
  subsHidden: boolean;
  subRatio: number | null;
  recentMedian: number | null;
  breakout: number | null;
  rankScore: number;
  engagementRate: number;
}

const log10 = (x: number) => Math.log10(Math.max(x, 1));

export function median(values: number[]): number | null {
  if (!values.length) return null;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

/** The median views of a channel's recent Shorts, leaving out the one being scored. */
export function recentMedianExcluding(recent: { videoId: string; views: number }[], videoId: string): number | null {
  const views = recent.filter((r) => r.videoId !== videoId).map((r) => r.views);
  return views.length >= 3 ? median(views) : null;
}

/** A channel's most recent Shorts (by upload order), up to `limit`. */
export function recentShorts(
  ids: string[],
  details: { videoId: string; durationSec: number; views: number }[],
  limit: number = BREAKOUT.recentShorts,
): { videoId: string; views: number }[] {
  const byId = new Map(details.map((d) => [d.videoId, d]));
  const out: { videoId: string; views: number }[] = [];
  for (const id of ids) {
    const d = byId.get(id);
    if (!d || d.durationSec <= 0 || d.durationSec > SHORTS_MAX_SEC) continue;
    out.push({ videoId: id, views: d.views });
    if (out.length >= limit) break;
  }
  return out;
}

/** How much a channel's size counts toward rank: small channels a little less. */
export function sizeWeight(subs: number | null): number {
  if (subs === null) return 0.8;
  const w = Math.log10(Math.max(subs, SUB_FLOOR)) / Math.log10(SIZE_WEIGHT.reference);
  return Math.min(SIZE_WEIGHT.max, Math.max(SIZE_WEIGHT.min, w));
}

/** Views per hour, views against subscribers and against the channel's usual, and a rank score. */
export function scoreVideo(
  v: { publishedAt: string; views: number; likes: number; comments: number },
  channel: { subs: number | null } | null | undefined,
  now: Date,
  recentMedian: number | null = null,
): ScoredVideo {
  const hoursSincePublish = Math.max(1, (now.getTime() - new Date(v.publishedAt).getTime()) / 3600000);
  const vph = v.views / hoursSincePublish;
  const subs = channel ? channel.subs : null;
  const subsHidden = subs === null;
  const subRatio = subsHidden ? null : v.views / Math.max(subs!, SUB_FLOOR);
  const breakout = recentMedian !== null ? v.views / Math.max(recentMedian, MEDIAN_FLOOR) : null;
  const weight = subsHidden ? 0.8 : sizeWeight(subs);
  const rankScore =
    breakout !== null
      ? weight *
        (RANK_WEIGHTS.withBreakout.breakout * log10(breakout) +
          RANK_WEIGHTS.withBreakout.subRatio * log10(subRatio ?? 1) +
          RANK_WEIGHTS.withBreakout.vph * log10(vph))
      : weight * (RANK_WEIGHTS.withoutBreakout.subRatio * log10(subRatio ?? 1) + RANK_WEIGHTS.withoutBreakout.vph * log10(vph));
  const engagementRate = v.views > 0 ? (v.likes + v.comments) / v.views : 0;
  return { hoursSincePublish, vph, subs, subsHidden, subRatio, recentMedian, breakout, rankScore, engagementRate };
}

export function consistentlyBig(score: Pick<ScoredVideo, 'recentMedian'>): boolean {
  return score.recentMedian !== null && score.recentMedian >= CONSISTENTLY_BIG.medianViews;
}

/** Whether a video beat its channel by enough to study. */
export function isOutlier(
  v: { durationSec: number; views: number; publishedAt: string },
  score: ScoredVideo,
  filters: {
    maxDurationSec: number;
    minViews: number;
    windowDays: number;
    maxSubs: number | null;
    minSubRatio: number;
    minBreakout: number;
  },
  now: Date,
  minSubRatio: number = filters.minSubRatio,
): boolean {
  if (v.durationSec <= 0 || v.durationSec > filters.maxDurationSec) return false;
  if (v.views < filters.minViews) return false;
  if (now.getTime() - new Date(v.publishedAt).getTime() > filters.windowDays * 86400000) return false;
  if (filters.maxSubs !== null && score.subs !== null && score.subs > filters.maxSubs) return false;
  if (consistentlyBig(score)) return score.breakout !== null && score.breakout >= CONSISTENTLY_BIG.minBreakout;
  return (
    (score.subRatio !== null && score.subRatio >= minSubRatio) ||
    (score.breakout !== null && score.breakout >= filters.minBreakout)
  );
}

export function likelyNonEnglish(title: string): boolean {
  const letters = [...title].filter((c) => /\p{L}/u.test(c));
  if (letters.length < 4) return false;
  return 1 - letters.filter((c) => /[A-Za-zÀ-ɏ]/.test(c)).length / letters.length > NON_ENGLISH_MAX_SHARE;
}

export function offNiche(title: string, terms: string[]): boolean {
  const lower = title.toLowerCase();
  return !terms.some((t) => lower.includes(t.toLowerCase()));
}

/** Labels that explain or qualify a video's score. */
export function flagsFor(
  v: { durationSec: number; title: string },
  score: ScoredVideo,
  nicheTerms: string[],
  loopBelowSec = 0,
  fewShorts = false,
): string[] {
  const flags: string[] = [];
  if (fewShorts) flags.push('Few Shorts');
  if (loopBelowSec && v.durationSec < loopBelowSec) flags.push('Loop-inflated');
  if (consistentlyBig(score)) flags.push('Consistently big');
  if (score.hoursSincePublish < FLAGS.spikeMaxAgeHours && score.vph >= FLAGS.spikeMinVph) flags.push('Spike?');
  if (score.subs !== null && score.subs > FLAGS.bigChannelSubs) flags.push('Big channel');
  if (likelyNonEnglish(v.title)) flags.push('Likely non-English');
  if (offNiche(v.title, nicheTerms)) flags.push('Off-niche');
  if (score.subsHidden) flags.push('Subs hidden');
  return flags;
}
