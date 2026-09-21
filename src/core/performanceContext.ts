import { formatCount, isLikelyShort, type UploadedVideo } from './youtubeLibrary';

/**
 * Turns published results into a prompt fragment.
 *
 * The point is to let what actually performed steer the next script, instead of
 * writing every one blind. What gets fed in is deliberately narrow: titles,
 * views and the spread between best and worst. Dumping whole descriptions would
 * cost tokens and mostly teach the model to imitate its own boilerplate.
 */

export interface PerformanceSummary {
  /** Videos considered, after filtering to Shorts where asked. */
  sampleSize: number;
  medianViews: number;
  topPerformers: UploadedVideo[];
  weakPerformers: UploadedVideo[];
}

function median(values: number[]): number {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : Math.round((sorted[mid - 1] + sorted[mid]) / 2);
}

/**
 * Ranks uploads by views.
 *
 * Videos published in the last two days are excluded: they have not had time to
 * accumulate views, and including them would rank genuinely good uploads as
 * failures purely for being recent.
 */
export function summarisePerformance(
  videos: UploadedVideo[],
  opts: { shortsOnly?: boolean; now?: Date; sampleLimit?: number } = {}
): PerformanceSummary {
  const now = opts.now ?? new Date();
  const cutoff = now.getTime() - 2 * 86_400_000;

  const eligible = videos
    .filter((v) => (opts.shortsOnly ? isLikelyShort(v) : true))
    .filter((v) => v.privacyStatus === 'public')
    .filter((v) => {
      const published = new Date(v.publishedAt).getTime();
      return Number.isFinite(published) && published <= cutoff;
    });

  if (!eligible.length) {
    return { sampleSize: 0, medianViews: 0, topPerformers: [], weakPerformers: [] };
  }

  const ranked = [...eligible].sort((a, b) => b.viewCount - a.viewCount);
  const limit = opts.sampleLimit ?? 5;

  return {
    sampleSize: eligible.length,
    medianViews: median(eligible.map((v) => v.viewCount)),
    topPerformers: ranked.slice(0, limit),
    weakPerformers: ranked.length > limit * 2 ? ranked.slice(-limit).reverse() : [],
  };
}

/**
 * Renders the summary as a prompt suffix.
 *
 * Returns an empty string when there is too little data to say anything
 * meaningful — a confident-sounding pattern drawn from two videos is worse than
 * no guidance, because the model will follow it.
 */
export function buildPerformanceContext(summary: PerformanceSummary, minSample = 4): string {
  if (summary.sampleSize < minSample || !summary.topPerformers.length) return '';

  const top = summary.topPerformers
    .map((v) => `- "${v.title}" — ${formatCount(v.viewCount)} views`)
    .join('\n');

  // Underperformers carry an explicit avoid instruction rather than sitting
  // alongside the winners with identical framing. Presented neutrally the model
  // treats them as more examples to learn from, which is the opposite of what
  // they are evidence for.
  const weak = summary.weakPerformers.length
    ? `\n\nAVOID THESE ANGLES. They underperformed against the channel median of ${formatCount(summary.medianViews)} views:\n${summary.weakPerformers
        .map((v) => `- "${v.title}" — ${formatCount(v.viewCount)} views`)
        .join('\n')}\nDo not reuse their framing, their angle, or the kind of promise they make. If the
topic you have been given resembles one of these, find a different way into it.`
    : '';

  return `

CHANNEL PERFORMANCE — what has actually worked on this channel so far.
Across ${summary.sampleSize} published videos, the median is ${formatCount(summary.medianViews)} views.

Best performing:
${top}${weak}

Study what the strongest titles have in common — the shape of the tension they
promise, how concrete the situation is, whose behaviour is being explained — and
carry that instinct into this script. Do not copy phrasing, reuse a hook, or
rewrite an existing topic. This is evidence about what this audience responds
to, not a template.`;
}
