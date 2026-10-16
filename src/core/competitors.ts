/** Competitor channels whose breakout long-forms are worth studying. */
export const COMPETITORS = [
  { id: 'UCHacVMLp7bHDC7e4eoPi9Dw', name: 'Psychology Simplified' },
  { id: 'UCWhS0dkpQcB76Pdusz78leg', name: 'Koo Psychology' },
  { id: 'UC7ogBsKt4AoJBu8bObb0QiA', name: 'PsychToons' },
  { id: 'UCQUnqaW8Q33siyLYhisN7HQ', name: 'Antidote' },
  { id: 'UCAIO3QOzR-LAM2RJt4eLMXA', name: 'Psychology Reveal' },
  { id: 'UCir93b_ftqInEaDpsWYbo_g', name: 'Practical Psychology' },
  { id: 'UC6hTWH55msNTkbz0hvsGVgw', name: 'Chad Sensei' },
];
/** Views this many times the channel's median make an outlier. */
export const OUTLIER_RATIO = 3;
export const WINDOW_DAYS = 30;
/** Shorter than this is a Short, not a long-form. */
export const MIN_LONG_SECONDS = 181;

export interface ChannelVideo {
  videoId: string;
  title: string;
  publishedAt: string;
  durationSeconds: number;
  views: number;
  [key: string]: unknown;
}

export interface CompetitorOutlier extends ChannelVideo {
  channelId: string;
  channelName: string;
  median: number;
  ratio: number;
}

export function median(values: number[]): number {
  if (!values.length) return 0;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

/** A channel's long-forms from the last 30 days that ran far past its median. */
export function channelOutliers(channel: { id: string; name: string }, videos: ChannelVideo[], now: Date): CompetitorOutlier[] {
  const longs = videos.filter((v) => v.durationSeconds >= MIN_LONG_SECONDS);
  const med = median(longs.map((v) => v.views));
  if (!(med > 0)) return [];
  const since = now.getTime() - 2592000000;
  return longs
    .filter((v) => new Date(v.publishedAt).getTime() >= since)
    .map((v) => ({ ...v, channelId: channel.id, channelName: channel.name, median: med, ratio: v.views / med }))
    .filter((v) => v.ratio >= OUTLIER_RATIO)
    .sort((a, b) => b.ratio - a.ratio);
}

/** The outliers not yet studied, biggest first. */
export function competitorQueue(outliers: CompetitorOutlier[], done: string[]): CompetitorOutlier[] {
  return outliers.filter((o) => !done.includes(o.videoId)).sort((a, b) => b.ratio - a.ratio);
}
