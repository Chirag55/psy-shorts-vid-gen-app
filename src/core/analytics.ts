/** Analytics are read once a video has been public this long. */
export const ANALYTICS_MIN_AGE_MS = 172800000;
/** Stored analytics are refreshed after this long. */
export const ANALYTICS_REFRESH_MS = 43200000;
/** The traffic source YouTube reports for the Shorts feed. */
export const SHORTS_FEED_SOURCE = 'SHORTS';
/** Shorts per variant before an A/B comparison is trusted. */
export const AB_MIN_PER_VARIANT = 10;

export interface VideoAnalytics {
  videoId: string;
  views: number;
  averageViewDuration: number;
  averageViewPercentage: number;
  subscribersGained: number;
  feedViews: number;
  feedAverageViewDuration: number;
  otherViews: number;
  durationSeconds: number;
  fetchedAt: number;
}

const num = (v: unknown): number => {
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
};

export function isEligibleForAnalytics(
  video: { publishedAt: string; privacyStatus?: string },
  now: Date = new Date(),
): boolean {
  const published = new Date(video.publishedAt).getTime();
  return video.privacyStatus === 'public' && Number.isFinite(published) && now.getTime() - published >= ANALYTICS_MIN_AGE_MS;
}

export function needsRefresh(stored: { fetchedAt: number } | undefined | null, now: Date = new Date()): boolean {
  return !stored || now.getTime() - stored.fetchedAt >= ANALYTICS_REFRESH_MS;
}

/** An Analytics API report as rows keyed by column name. */
export function parseReport(report: any): Record<string, unknown>[] {
  const r = report ?? {};
  const names: string[] = (r.columnHeaders ?? []).map((h: any) => h.name ?? '');
  return (r.rows ?? []).map((row: unknown[]) => {
    const out: Record<string, unknown> = {};
    names.forEach((name, i) => {
      if (name) out[name] = row[i];
    });
    return out;
  });
}

export function buildVideoAnalytics(
  videoId: string,
  durationSeconds: number,
  totals: Record<string, unknown> | undefined,
  sources: Record<string, unknown>[],
  fetchedAt: number,
): VideoAnalytics {
  const feed = sources.find((s) => s.insightTrafficSourceType === SHORTS_FEED_SOURCE);
  const sourceViews = sources.reduce((n, s) => n + num(s.views), 0);
  const views = totals ? num(totals.views) : sourceViews;
  const feedViews = feed ? num(feed.views) : 0;
  return {
    videoId,
    views,
    averageViewDuration: num(totals?.averageViewDuration),
    averageViewPercentage: num(totals?.averageViewPercentage),
    subscribersGained: num(totals?.subscribersGained),
    feedViews,
    feedAverageViewDuration: feed ? num(feed.averageViewDuration) : 0,
    otherViews: Math.max(0, (sourceViews || views) - feedViews),
    durationSeconds,
    fetchedAt,
  };
}

/** Percent of the Short a feed viewer watched, when there is feed data. */
export function feedViewedPercent(a: VideoAnalytics): number | undefined {
  if (!(a.feedViews > 0 && a.durationSeconds > 0 && a.feedAverageViewDuration > 0)) return undefined;
  return (a.feedAverageViewDuration / a.durationSeconds) * 100;
}

/** Share of views that came from the Shorts feed. */
export function feedShare(a: VideoAnalytics): number {
  const total = a.feedViews + a.otherViews;
  return total > 0 ? a.feedViews / total : 0;
}

export function compareVariants(items: { variant: string; analytics: VideoAnalytics }[]) {
  const groups = new Map<string, VideoAnalytics[]>();
  for (const item of items) groups.set(item.variant, [...(groups.get(item.variant) ?? []), item.analytics]);
  return [...groups.entries()].map(([variant, list]) => {
    const pcts = list.map(feedViewedPercent).filter((p): p is number => p !== undefined);
    return {
      variant,
      shorts: list.length,
      avgFeedViewedPct: pcts.length ? pcts.reduce((a, b) => a + b, 0) / pcts.length : undefined,
      avgSubscribersGained: list.reduce((n, a) => n + a.subscribersGained, 0) / list.length,
    };
  });
}
