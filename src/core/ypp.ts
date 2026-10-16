/** YouTube Partner Program thresholds, and the later ones after the deadline. */
export const YPP = {
  subsFan: 500,
  subsFull: 1000,
  watchHours: 4000,
  shortsFan: 3000000,
  shortsFull: 10000000,
  deadline: '2027-02-01',
  watchHoursAfter: 8000,
  shortsAfter: 20000000,
};

/** Days of daily figures the pace is averaged over. */
export const PACE_DAYS = 14;

const DAY_MS = 86400000;

export interface YppDay {
  day: string;
  longformMinutes: number;
  engagedShorts: number;
  subsNet: number;
}

export interface YppSnapshot {
  at: string;
  subscribers: number;
  longformHours: number | null;
  engagedShorts: number | null;
  daily: YppDay[];
  notes: string[];
  videoMinutes?: Record<string, number>;
}

/** Figures typed in from Studio when Analytics won't give them. */
export interface YppManualReading {
  at: string;
  longformHours?: number;
  engagedShorts?: number;
}

export type YppSource = 'api' | 'manual' | 'none';

export interface YppRow {
  label: string;
  current: number;
  target: number;
  source: YppSource;
  pace: number;
  eta: string | null;
}

/** 'done', the day a target is reached at this pace, or null if never (within ten years). */
export function projectDate(current: number, target: number, pace: number, now: Date): string | null {
  if (current >= target) return 'done';
  if (!(pace > 0)) return null;
  const days = Math.ceil((target - current) / pace);
  if (days > 3650) return null;
  return new Date(now.getTime() + days * DAY_MS).toISOString().slice(0, 10);
}

/** Whole days from now until `day` (YYYY-MM-DD), never negative. */
export function daysUntil(day: string, now: Date): number {
  const [y, m, d] = day.split('-').map(Number);
  return Math.max(0, Math.ceil((Date.UTC(y, m - 1, d) - now.getTime()) / DAY_MS));
}

/** Each YPP threshold with where the channel is, the daily pace and an estimated date. */
export function yppProgress(snap: YppSnapshot | null | undefined, manual: YppManualReading[], now: Date): YppRow[] {
  const daily = snap?.daily ?? [];
  const days = Math.max(1, daily.length);
  const sum = (pick: (d: YppDay) => number) => daily.reduce((n, d) => n + pick(d), 0);
  const subsPace = sum((d) => d.subsNet) / days;
  const hoursPace = sum((d) => d.longformMinutes) / 60 / days;
  const shortsPace = sum((d) => d.engagedShorts) / days;
  const subs = snap?.subscribers ?? 0;
  const latest = (key: 'longformHours' | 'engagedShorts') =>
    [...manual].sort((a, b) => b.at.localeCompare(a.at)).find((m) => typeof m[key] === 'number')?.[key];
  const manualHours = latest('longformHours');
  const manualShorts = latest('engagedShorts');
  const hours = snap?.longformHours ?? manualHours ?? 0;
  const shorts = snap?.engagedShorts ?? manualShorts ?? 0;
  const hoursSource: YppSource = snap?.longformHours != null ? 'api' : manualHours !== undefined ? 'manual' : 'none';
  const shortsSource: YppSource = snap?.engagedShorts != null ? 'api' : manualShorts !== undefined ? 'manual' : 'none';
  const subsSource: YppSource = snap ? 'api' : 'none';
  const row = (label: string, current: number, target: number, source: YppSource, pace: number): YppRow => ({
    label,
    current,
    target,
    source,
    pace,
    eta: projectDate(current, target, pace, now),
  });
  return [
    row('Subscribers (fan funding)', subs, YPP.subsFan, subsSource, subsPace),
    row('Subscribers (full YPP)', subs, YPP.subsFull, subsSource, subsPace),
    row('Public long-form watch hours, 365 days', hours, YPP.watchHours, hoursSource, hoursPace),
    row('Engaged Shorts views, 90 days (fan funding)', shorts, YPP.shortsFan, shortsSource, shortsPace),
    row('Engaged Shorts views, 90 days (full YPP)', shorts, YPP.shortsFull, shortsSource, shortsPace),
  ];
}

/** Whether the snapshot is missing or a day old. */
export function snapshotStale(snap: YppSnapshot | null | undefined, now: Date): boolean {
  return !snap || now.getTime() - new Date(snap.at).getTime() >= DAY_MS;
}

/** YYYY-MM-DD `days` before `date`. */
export function dayMinus(date: Date, days: number): string {
  return new Date(date.getTime() - days * DAY_MS).toISOString().slice(0, 10);
}

/** Long-form minutes and engaged Shorts views from rows split by creatorContentType. */
export function contentTypeTotals(rows: Record<string, unknown>[]): { longformMinutes: number; engagedShorts: number } {
  let longformMinutes = 0;
  let engagedShorts = 0;
  for (const r of rows) {
    const type = String(r.creatorContentType ?? '');
    if (type === 'VIDEO_ON_DEMAND') longformMinutes += Number(r.estimatedMinutesWatched ?? 0);
    if (type === 'SHORTS') engagedShorts += Number(r.engagedViews ?? 0);
  }
  return { longformMinutes, engagedShorts };
}

/** Views of a `minutes`-long video watched to `fraction` that add up to `hours`. */
export function viewsForHours(hours: number, minutes: number, fraction: number): number {
  if (!(minutes > 0) || !(fraction > 0)) return 0;
  return Math.round((hours * 60) / (minutes * fraction));
}

type AnalyticsQuery = (params: Record<string, string>) => Promise<Record<string, unknown>[]>;

/** Reads the YPP figures from YouTube Analytics; a refused report becomes a note, not a failure. */
export async function readYppSnapshot(
  query: AnalyticsQuery,
  subscribers: number,
  now: Date,
  isFatal: (e: unknown) => boolean,
): Promise<YppSnapshot> {
  const notes: string[] = [];
  const endDate = dayMinus(now, 1);
  const why = (e: unknown) => (e instanceof Error ? e.message : String(e));
  const attempt = async (params: Record<string, string>, message: string) => {
    try {
      return await query(params);
    } catch (e) {
      if (isFatal(e)) throw e;
      notes.push(`${message} (${why(e)}).`);
      return undefined;
    }
  };
  const longRows = await attempt(
    { startDate: dayMinus(now, 365), endDate, metrics: 'estimatedMinutesWatched', dimensions: 'creatorContentType' },
    'Analytics refused long-form watch time over 365 days; enter the hours from Studio instead',
  );
  const shortRows = await attempt(
    { startDate: dayMinus(now, 90), endDate, metrics: 'engagedViews', dimensions: 'creatorContentType' },
    'Analytics refused engaged Shorts views over 90 days; enter the number from Studio instead',
  );
  const range = { startDate: dayMinus(now, PACE_DAYS), endDate };
  const dailyMinutes =
    (await attempt(
      { ...range, metrics: 'estimatedMinutesWatched', dimensions: 'day,creatorContentType' },
      'The daily watch-time report failed, so its pace is not projected',
    )) ?? [];
  const dailyEngaged =
    (await attempt(
      { ...range, metrics: 'engagedViews', dimensions: 'day,creatorContentType' },
      'The daily engaged-views report failed, so its pace is not projected',
    )) ?? [];
  const dailySubs =
    (await attempt(
      { ...range, metrics: 'subscribersGained,subscribersLost', dimensions: 'day' },
      'The daily subscriber report failed, so its pace is not projected',
    )) ?? [];
  const videoRows = await attempt(
    {
      startDate: dayMinus(now, 365),
      endDate,
      metrics: 'estimatedMinutesWatched',
      dimensions: 'video',
      sort: '-estimatedMinutesWatched',
      maxResults: '200',
    },
    'The per-video watch-time report failed, so hours by format are not shown',
  );
  const days = [...new Set([...dailyMinutes, ...dailyEngaged, ...dailySubs].map((r) => String(r.day)))].sort();
  const daily = days.map((day) => {
    const subs = dailySubs.find((r) => String(r.day) === day);
    return {
      day,
      longformMinutes: contentTypeTotals(dailyMinutes.filter((r) => String(r.day) === day)).longformMinutes,
      engagedShorts: contentTypeTotals(dailyEngaged.filter((r) => String(r.day) === day)).engagedShorts,
      subsNet: Number(subs?.subscribersGained ?? 0) - Number(subs?.subscribersLost ?? 0),
    };
  });
  return {
    at: now.toISOString(),
    subscribers,
    longformHours: longRows ? Math.round((contentTypeTotals(longRows).longformMinutes / 60) * 10) / 10 : null,
    engagedShorts: shortRows ? contentTypeTotals(shortRows).engagedShorts : null,
    daily,
    notes,
    ...(videoRows
      ? {
          videoMinutes: Object.fromEntries(
            videoRows.map((r) => [String(r.video), Number(r.estimatedMinutesWatched ?? 0)]),
          ),
        }
      : {}),
  };
}

/** Long-form watch hours by video format, with the rest as "Other". */
export function hoursByFormat(
  snap: YppSnapshot | null | undefined,
  videos: { videoId?: string; format?: string }[],
  labels: Record<string, string>,
): { label: string; hours: number }[] {
  if (!snap?.videoMinutes) return [];
  const byLabel = new Map<string, number>();
  let total = 0;
  for (const v of videos) {
    if (!v.videoId) continue;
    const minutes = snap.videoMinutes[v.videoId];
    if (!minutes) continue;
    const label = v.format ? `${v.format} · ${labels[v.format] ?? v.format}` : 'No format';
    byLabel.set(label, (byLabel.get(label) ?? 0) + minutes / 60);
    total += minutes / 60;
  }
  if (snap.longformHours !== null && snap.longformHours !== undefined && snap.longformHours - total > 0.05) {
    byLabel.set('Other (not made in the app)', snap.longformHours - total);
  }
  return [...byLabel.entries()]
    .map(([label, hours]) => ({ label, hours: Math.round(hours * 10) / 10 }))
    .sort((a, b) => b.hours - a.hours);
}

/** The full-YPP progress as plain lines. */
export function partnerLine(snap: YppSnapshot | null | undefined, manual: YppManualReading[], now: Date): string[] {
  const [, subs, hours, , shorts] = yppProgress(snap, manual, now);
  const n = (x: number) => Math.round(x).toLocaleString();
  const src = (r: YppRow) => (r.source === 'none' ? ' (no reading yet)' : r.source === 'manual' ? ' (from your Studio reading)' : '');
  return [
    `Subscribers ${n(subs.current)} / ${n(subs.target)}${src(subs)}`,
    `Public long-form watch hours, 12 months: ${n(hours.current)} / ${n(hours.target)}${src(hours)}`,
    `Shorts views, 90 days: ${n(shorts.current)} / ${n(shorts.target)}${src(shorts)}`,
    `The hours path: ${n(YPP.watchHours)} h is ${n(viewsForHours(YPP.watchHours, 10, 1))} views of a 10-minute video watched to the end, about ${n(viewsForHours(YPP.watchHours, 10, 0.5))} at 50% viewed or ${n(viewsForHours(YPP.watchHours, 10, 0.4))} at 40%. Shorts watch time does not count toward it.`,
  ];
}
