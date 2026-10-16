import { feedViewedPercent, type VideoAnalytics } from './analytics';
import { formatCount, isLikelyShort, type UploadedVideo } from './youtubeLibrary';

/**
 * Turns published results into a prompt fragment.
 *
 * The point is to let what actually performed steer the next script, instead of
 * writing every one blind. What gets fed in is deliberately narrow: titles,
 * views, subscribers gained and where feed viewers dropped off.
 */

/** Views over this multiple of the median make a video an outlier. */
export const OUTLIER_MULTIPLE = 5;
/** Feed viewers watching less than this percent means the hook lost them. */
export const HOOK_DROP_OFF_PCT = 50;
/** Feed views needed before the drop-off is read. */
export const MIN_FEED_VIEWS = 20;

export interface PerformanceSummary {
  /** Videos considered, after filtering to Shorts where asked. */
  sampleSize: number;
  medianViews: number;
  topPerformers: UploadedVideo[];
  weakPerformers: UploadedVideo[];
  outliers: UploadedVideo[];
  hookDropOffs: { video: UploadedVideo; feedViewedPct: number }[];
  analytics: Record<string, VideoAnalytics>;
}

function median(values: number[]): number {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : Math.round((sorted[mid - 1] + sorted[mid]) / 2);
}

/**
 * Ranks uploads by subscribers gained, then views.
 *
 * Recent uploads are excluded (two days, three for Shorts): they have not had
 * time to accumulate views. Breakout outliers are pulled out so they don't skew
 * the median, and Shorts whose hook lost feed viewers never rank as best.
 */
export function summarisePerformance(
  videos: UploadedVideo[],
  opts: { shortsOnly?: boolean; now?: Date; sampleLimit?: number; analytics?: Record<string, VideoAnalytics> } = {},
): PerformanceSummary {
  const now = opts.now ?? new Date();
  const analytics = opts.analytics ?? {};
  const cutoff = now.getTime() - (opts.shortsOnly ? 3 : 2) * 86_400_000;

  const eligible = videos
    .filter((v) => (opts.shortsOnly ? isLikelyShort(v) : true))
    .filter((v) => v.privacyStatus === 'public')
    .filter((v) => {
      const published = new Date(v.publishedAt).getTime();
      return Number.isFinite(published) && published <= cutoff;
    });

  if (!eligible.length) {
    return { sampleSize: 0, medianViews: 0, topPerformers: [], weakPerformers: [], outliers: [], hookDropOffs: [], analytics };
  }

  const allMedian = median(eligible.map((v) => v.viewCount));
  const outliers =
    eligible.length >= 4 && allMedian > 0
      ? eligible.filter((v) => v.viewCount > allMedian * OUTLIER_MULTIPLE).sort((a, b) => b.viewCount - a.viewCount)
      : [];
  const outlierIds = new Set(outliers.map((v) => v.videoId));
  const rest = eligible.filter((v) => !outlierIds.has(v.videoId));

  const hookDropOffs = eligible
    .map((v) => {
      const a = analytics[v.videoId];
      const pct = a && a.feedViews >= MIN_FEED_VIEWS ? feedViewedPercent(a) : undefined;
      return pct !== undefined && pct < HOOK_DROP_OFF_PCT ? { video: v, feedViewedPct: pct } : null;
    })
    .filter((d): d is { video: UploadedVideo; feedViewedPct: number } => d !== null);
  const dropIds = new Set(hookDropOffs.map((d) => d.video.videoId));

  const subs = (v: UploadedVideo) => analytics[v.videoId]?.subscribersGained ?? 0;
  const ranked = [...rest].sort((a, b) => subs(b) - subs(a) || b.viewCount - a.viewCount);
  const limit = opts.sampleLimit ?? 5;

  return {
    sampleSize: eligible.length,
    medianViews: median(rest.map((v) => v.viewCount)),
    topPerformers: ranked.filter((v) => !dropIds.has(v.videoId)).slice(0, limit),
    weakPerformers: ranked.length > limit * 2 ? ranked.slice(-limit).reverse() : [],
    outliers,
    hookDropOffs,
    analytics,
  };
}

/**
 * Renders the summary as a prompt suffix.
 *
 * Returns an empty string when there is too little data to say anything
 * meaningful — a confident-sounding pattern drawn from two videos is worse than
 * no guidance, because the model will follow it.
 */
export function buildPerformanceContext(summary: PerformanceSummary, minSample = 4, extra = ''): string {
  if (summary.sampleSize < minSample) return '';
  if (!summary.topPerformers.length && !summary.outliers.length) return '';
  const analytics = summary.analytics;
  const line = (v: UploadedVideo) => {
    const a = analytics[v.videoId];
    const gained = a ? `, +${a.subscribersGained} subscriber${a.subscribersGained === 1 ? '' : 's'}` : '';
    return `- "${v.title}" — ${formatCount(v.viewCount)} views${gained}`;
  };

  const top = summary.topPerformers.map(line).join('\n');
  const outliers = summary.outliers.length
    ? `\n\nOUTLIER — STUDY THE ANGLE. These broke out far beyond the channel's usual range:\n${summary.outliers
        .map(line)
        .join('\n')}\nWork out what the angle promised and who it was about. Borrow that instinct; do not copy the topic.`
    : '';
  const weak = summary.weakPerformers.length
    ? `\n\nAVOID THESE ANGLES. They underperformed against the channel median of ${formatCount(summary.medianViews)} views:\n${summary.weakPerformers
        .map(line)
        .join('\n')}\nDo not reuse their framing, their angle, or the kind of promise they make. If the\ntopic you have been given resembles one of these, find a different way into it.`
    : '';
  const drops = summary.hookDropOffs.length
    ? `\n\nAVOID THESE OPENINGS. Viewers from the Shorts feed left early — the hook lost them, whatever the view count:\n${summary.hookDropOffs
        .map((d) => `- "${d.video.title}" — feed viewers watched ${Math.round(d.feedViewedPct)}% on average`)
        .join('\n')}\nDo not open the way these open.`
    : '';
  const ranking = Object.keys(analytics).length ? 'ranked by subscribers gained, then views' : 'ranked by views';
  const best = top ? `Best performing (${ranking}):\n${top}` : '';
  const tail = extra ? `\n\n${extra}` : '';

  return `\nCHANNEL PERFORMANCE — what has actually worked on this channel so far.\nAcross ${summary.sampleSize} published videos, the typical video gets ${formatCount(summary.medianViews)} views.\n${best}${outliers}${weak}${drops}\n\nStudy what the strongest titles have in common — the shape of the tension they\npromise, how concrete the situation is, whose behaviour is being explained — and\ncarry that instinct into this script. Do not copy phrasing, reuse a hook, or\nrewrite an existing topic. This is evidence about what this audience responds\nto, not a template.${tail}`;
}
