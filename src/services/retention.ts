import { useStudio } from '@/store';
import { snapshotDue } from '@/core/retention';
import type { Project } from '@/core/types';
import { getKey, setKey } from './keys';
import { ensureFreshToken } from './youtube';
import { report } from './youtubeAnalytics';

const day = (t: number): string => new Date(t).toISOString().slice(0, 10);

export interface RetentionReading {
  at: string;
  views: number;
  averageViewPercentage: number;
  averageViewDuration: number;
  curve?: number[];
  engagedViews?: number;
  likes?: number;
  comments?: number;
  subscribersGained?: number;
}

/**
 * Lifetime totals for one video, plus its retention curve and engagement when
 * YouTube has them. Null when there is no data yet.
 */
export async function readRetention(
  accessToken: string,
  videoId: string,
  publishedAt: number,
  now: Date,
): Promise<RetentionReading | null> {
  const base = { startDate: day(publishedAt), endDate: day(now.getTime()), filters: `video==${videoId}` };
  const totals = await report(accessToken, { ...base, metrics: 'views,averageViewDuration,averageViewPercentage' });
  if (!totals[0]) return null;
  let curve: number[] | undefined;
  try {
    const rows = await report(accessToken, {
      ...base,
      metrics: 'audienceWatchRatio',
      dimensions: 'elapsedVideoTimeRatio',
      sort: 'elapsedVideoTimeRatio',
    });
    const points = rows.map((r) => Number(r.audienceWatchRatio)).filter((n) => Number.isFinite(n));
    if (points.length >= 3) curve = points;
  } catch {
    // The curve is optional; totals are enough for a snapshot.
  }
  const extra: Record<string, number> = {};
  try {
    const rows = await report(accessToken, { ...base, metrics: 'engagedViews,likes,comments,subscribersGained' });
    const row = rows[0];
    if (row) {
      for (const key of ['engagedViews', 'likes', 'comments', 'subscribersGained']) {
        const n = Number(row[key]);
        if (row[key] !== undefined && Number.isFinite(n)) extra[key] = n;
      }
    }
  } catch {
    // Engagement is optional too.
  }
  return {
    ...extra,
    at: now.toISOString(),
    views: Number(totals[0].views) || 0,
    averageViewPercentage: Number(totals[0].averageViewPercentage) || 0,
    averageViewDuration: Number(totals[0].averageViewDuration) || 0,
    ...(curve ? { curve } : {}),
  };
}

/** Takes the 48-hour and 7-day snapshots that are due, for one project or all. */
export async function takeDueSnapshots(
  now: Date = new Date(),
  project?: Project,
): Promise<{ taken: number; errors: string[] }> {
  const [stored, clientId] = await Promise.all([getKey('youtubeTokens'), getKey('youtubeClientId')]);
  if (!stored || !clientId) throw new Error('Sign in to YouTube in Settings first.');
  const tokens = await ensureFreshToken(clientId, JSON.parse(stored));
  await setKey('youtubeTokens', JSON.stringify(tokens));
  const list = project ? [project] : useStudio.getState().projects;
  let taken = 0;
  const errors: string[] = [];
  for (const p of list) {
    const videoId = p.assets.youtubeVideoId;
    const publishedAt = p.assets.publishedAt;
    if (!videoId || !publishedAt) continue;
    const window = snapshotDue(publishedAt, p.virality?.snapshots, now);
    if (!window) continue;
    try {
      const snap = await readRetention(tokens.accessToken, videoId, publishedAt, now);
      if (snap) {
        useStudio.getState().recordRetention(p.id, window, snap);
        taken += 1;
      }
    } catch (e) {
      errors.push(`${p.script.title}: ${e instanceof Error ? e.message : String(e)}`);
      // These won't clear up for the next video either.
      if (/quota|sign out of YouTube|enable "YouTube Analytics API"/i.test(e instanceof Error ? e.message : '')) break;
    }
  }
  return { taken, errors };
}
