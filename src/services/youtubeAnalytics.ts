import {
  buildVideoAnalytics,
  isEligibleForAnalytics,
  needsRefresh,
  parseReport,
  type VideoAnalytics,
} from '@/core/analytics';

const API = 'https://youtubeanalytics.googleapis.com/v2/reports';
/** Most videos read in one refresh. */
const MAX_PER_REFRESH = 40;
/** Requests in flight at once. */
const CONCURRENCY = 4;

export type AnalyticsErrorKind = 'reauth' | 'enable-api' | 'quota' | 'other';

export class AnalyticsError extends Error {
  kind: AnalyticsErrorKind;
  constructor(message: string, kind: AnalyticsErrorKind) {
    super(message);
    this.name = 'AnalyticsError';
    this.kind = kind;
  }
}

export interface AnalyticsVideo {
  videoId: string;
  publishedAt: string;
  privacyStatus?: string;
  durationSeconds: number;
}

async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i]);
    }
  });
  await Promise.all(workers);
  return results;
}

const day = (d: Date): string => d.toISOString().slice(0, 10);

/** One Analytics API report for this channel, as rows keyed by column. */
export async function report(accessToken: string, params: Record<string, string>): Promise<Record<string, unknown>[]> {
  const query = new URLSearchParams({ ids: 'channel==MINE', ...params }).toString();
  const res = await fetch(`${API}?${query}`, { headers: { Authorization: `Bearer ${accessToken}` } });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    if (res.status === 401 || /insufficient|ACCESS_TOKEN_SCOPE/i.test(text)) {
      throw new AnalyticsError(
        'This sign-in was made before the app asked for Analytics access. Sign out of YouTube in Settings and sign in again, allowing "View YouTube Analytics reports".',
        'reauth',
      );
    }
    if (/accessNotConfigured|has not been used|is disabled|SERVICE_DISABLED/i.test(text)) {
      throw new AnalyticsError(
        'The YouTube Analytics API is not enabled on the Google Cloud project behind this sign-in. Enable "YouTube Analytics API" in Google Cloud Console (APIs & Services → Library), then refresh.',
        'enable-api',
      );
    }
    if (/quota/i.test(text)) {
      throw new AnalyticsError('YouTube Analytics quota used up for today. Try again tomorrow.', 'quota');
    }
    throw new AnalyticsError(`YouTube Analytics ${res.status}: ${text.slice(0, 200)}`, 'other');
  }
  return parseReport(await res.json());
}

const isFatal = (e: unknown): boolean => e instanceof AnalyticsError && e.kind !== 'other';

/**
 * Reads analytics for public videos old enough and not read recently. One
 * report covers every video; if it fails for a non-fatal reason each video
 * is read on its own. Traffic sources are read per video.
 */
export async function refreshAnalytics(
  accessToken: string,
  videos: AnalyticsVideo[],
  stored: Record<string, VideoAnalytics | undefined>,
  now: Date = new Date(),
): Promise<Record<string, VideoAnalytics>> {
  const due = videos
    .filter((v) => isEligibleForAnalytics(v, now) && needsRefresh(stored[v.videoId], now))
    .slice(0, MAX_PER_REFRESH);
  if (!due.length) return {};
  const startDate = day(new Date(Math.min(...due.map((v) => new Date(v.publishedAt).getTime()))));
  const endDate = day(now);
  const metrics = 'views,averageViewDuration,averageViewPercentage,subscribersGained';
  let rows: Record<string, unknown>[];
  try {
    rows = await report(accessToken, {
      startDate,
      endDate,
      metrics,
      dimensions: 'video',
      filters: `video==${due.map((v) => v.videoId).join(',')}`,
      sort: '-views',
      maxResults: '200',
    });
  } catch (e) {
    if (isFatal(e)) throw e;
    const each = await mapLimit(due, CONCURRENCY, async (v) => {
      try {
        const r = await report(accessToken, { startDate, endDate, metrics, filters: `video==${v.videoId}` });
        return r[0] ? { ...r[0], video: v.videoId } : null;
      } catch (err) {
        if (isFatal(err)) throw err;
        return null;
      }
    });
    rows = each.filter((r): r is Record<string, unknown> & { video: string } => r !== null);
  }
  const byVideo = new Map(rows.map((r) => [String(r.video), r]));
  const fetchedAt = now.getTime();
  const out: Record<string, VideoAnalytics> = {};
  await mapLimit(due, CONCURRENCY, async (v) => {
    let sources: Record<string, unknown>[] = [];
    try {
      sources = await report(accessToken, {
        startDate,
        endDate,
        metrics: 'views,averageViewDuration',
        dimensions: 'insightTrafficSourceType',
        filters: `video==${v.videoId}`,
      });
    } catch (e) {
      if (isFatal(e)) throw e;
    }
    const totals = byVideo.get(v.videoId);
    if (totals || sources.length) {
      out[v.videoId] = buildVideoAnalytics(v.videoId, v.durationSeconds, totals, sources, fetchedAt);
    }
  });
  return out;
}
