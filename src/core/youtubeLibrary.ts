/**
 * Helpers for reading back what the channel has published.
 *
 * Kept free of I/O so the parsing and classification rules can be tested
 * directly — they are the parts most likely to be subtly wrong.
 */

export interface UploadedVideo {
  videoId: string;
  title: string;
  description: string;
  publishedAt: string;
  thumbnailUrl: string;
  /** Runtime in seconds, from contentDetails.duration. */
  durationSeconds: number;
  viewCount: number;
  likeCount: number;
  commentCount: number;
  privacyStatus: string;
}

/**
 * Parses an ISO 8601 duration (`PT1M30S`) into seconds.
 *
 * The YouTube API returns durations in this format only; there is no numeric
 * field. Returns 0 for anything unparseable rather than NaN, so a single odd
 * value cannot poison sorting or filtering.
 */
export function parseIso8601Duration(value: string): number {
  if (!value) return 0;

  const match = /^P(?:(\d+)D)?T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+(?:\.\d+)?)S)?$/.exec(value);
  if (!match) return 0;

  const [, days, hours, minutes, seconds] = match;
  return (
    Number(days ?? 0) * 86400 +
    Number(hours ?? 0) * 3600 +
    Number(minutes ?? 0) * 60 +
    Number(seconds ?? 0)
  );
}

/**
 * YouTube's maximum Shorts length. Raised from 60s in late 2024, so both older
 * and newer uploads fall under the same ceiling.
 */
export const SHORTS_MAX_SECONDS = 180;

/**
 * Best-effort Shorts classification.
 *
 * The Data API exposes no "is a Short" flag, so length is the only signal
 * available from a plain videos.list call. A vertical three-minute upload that
 * was never published as a Short will be counted as one; that is a limitation of
 * the API, not a bug here, which is why the Library screen lets you switch
 * between Shorts and everything.
 */
export function isLikelyShort(video: Pick<UploadedVideo, 'durationSeconds'>): boolean {
  return video.durationSeconds > 0 && video.durationSeconds <= SHORTS_MAX_SECONDS;
}

/** Compact view counts: 1200 -> "1.2K". */
export function formatCount(count: number): string {
  if (!Number.isFinite(count) || count < 0) return '0';
  if (count < 1000) return String(count);
  if (count < 1_000_000) {
    const k = count / 1000;
    return `${k < 10 ? k.toFixed(1).replace(/\.0$/, '') : Math.round(k)}K`;
  }
  const m = count / 1_000_000;
  return `${m < 10 ? m.toFixed(1).replace(/\.0$/, '') : Math.round(m)}M`;
}

/** Runtime as M:SS, or H:MM:SS past an hour. */
export function formatDuration(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}

/** Relative age, for the card subtitle. */
export function formatPublished(iso: string, now: Date = new Date()): string {
  const then = new Date(iso);
  if (Number.isNaN(then.getTime())) return '';

  const seconds = Math.max(0, (now.getTime() - then.getTime()) / 1000);
  const units: Array<[number, string]> = [
    [31_536_000, 'year'],
    [2_592_000, 'month'],
    [604_800, 'week'],
    [86_400, 'day'],
    [3_600, 'hour'],
    [60, 'minute'],
  ];

  for (const [size, name] of units) {
    if (seconds >= size) {
      const n = Math.floor(seconds / size);
      return `${n} ${name}${n === 1 ? '' : 's'} ago`;
    }
  }
  return 'just now';
}

/** Highest-resolution thumbnail the API offered, falling back down the ladder. */
export function pickThumbnail(thumbnails: Record<string, { url?: string } | undefined> | undefined): string {
  if (!thumbnails) return '';
  for (const key of ['maxres', 'standard', 'high', 'medium', 'default']) {
    const url = thumbnails[key]?.url;
    if (url) return url;
  }
  return '';
}
