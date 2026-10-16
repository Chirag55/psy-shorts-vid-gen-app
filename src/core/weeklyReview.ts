import { addDays, localParts } from './schedule';
import type { ScheduleConfig } from './channelConfig';

export type Diagnosis = 'fix-hook' | 'fix-middle' | 'working' | 'needs-swipe-rate';

export const DIAGNOSIS_TEXT: Record<Diagnosis, string> = {
  'fix-hook': 'Viewed-vs-swiped is below the median: fix the hook only.',
  'fix-middle': 'Viewed is fine but % viewed is low: fix the middle and payoff.',
  working: 'Holding up on both: keep the shape.',
  'needs-swipe-rate': 'Enter "viewed vs swiped away" from Studio to diagnose it.',
};

const WEEK = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];

export interface ReviewVideo {
  videoId: string;
  title: string;
  publishedAt: string;
  views: number;
  hook?: string;
  effect?: string;
  pillar?: string;
  averageViewPercentage?: number;
  viewedRate?: number;
}

export function median(values: number[]): number {
  const s = values.filter((v) => Number.isFinite(v)).sort((a, b) => a - b);
  if (!s.length) return 0;
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

/** The local Monday of the week a moment falls in. */
export function mondayOf(date: Date, cfg: ScheduleConfig): string {
  const p = localParts(date, cfg);
  return addDays(p.day, -WEEK.indexOf(p.weekday));
}

export function weeklyRunDue(lastWeek: string | undefined, now: Date, cfg: ScheduleConfig): boolean {
  return lastWeek !== mondayOf(now, cfg);
}

/** Which half of the Short lost viewers, from the swipe rate and % viewed. */
export function diagnose<T extends ReviewVideo>(rows: T[], rates: Record<string, number | undefined>): (T & { diagnosis: Diagnosis })[] {
  const withRates = rows.map((r) => (rates[r.videoId] !== undefined ? { ...r, viewedRate: rates[r.videoId] } : r));
  const rateMedian = median(withRates.filter((r) => r.viewedRate !== undefined).map((r) => r.viewedRate as number));
  const viewedMedian = median(
    withRates.filter((r) => r.averageViewPercentage !== undefined).map((r) => r.averageViewPercentage as number),
  );
  return withRates.map((r) => {
    const diagnosis: Diagnosis =
      r.viewedRate === undefined
        ? 'needs-swipe-rate'
        : r.viewedRate < rateMedian
          ? 'fix-hook'
          : r.averageViewPercentage !== undefined && r.averageViewPercentage < viewedMedian
            ? 'fix-middle'
            : 'working';
    return { ...r, diagnosis };
  });
}

/** This week's Shorts ranked against the 30-day median, with sequels, long-form ideas and what to avoid. */
export function weeklyReview(videos: ReviewVideo[], now: Date, cfg: ScheduleConfig) {
  const t = now.getTime();
  const recent = videos.filter((v) => {
    const published = new Date(v.publishedAt).getTime();
    return t - published <= 2592000000 && published <= t;
  });
  const week = recent.filter((v) => t - new Date(v.publishedAt).getTime() <= 604800000);
  const median30 = median(recent.map((v) => v.views));
  const ranked = [...week]
    .map((v) => ({ ...v, ratio: median30 > 0 ? v.views / median30 : 0 }))
    .sort((a, b) => b.ratio - a.ratio);
  const k = ranked.length ? Math.max(1, Math.ceil(ranked.length * 0.2)) : 0;
  const top = new Set(ranked.slice(0, k).map((v) => v.videoId));
  const bottom = new Set(ranked.length > k ? ranked.slice(-k).map((v) => v.videoId) : []);
  const tiered = diagnose(
    ranked.map((v) => ({
      ...v,
      tier: (top.has(v.videoId) ? 'top' : bottom.has(v.videoId) ? 'bottom' : 'middle') as 'top' | 'middle' | 'bottom',
      diagnosis: 'working' as Diagnosis,
    })),
    {},
  );
  const winners = tiered.filter((v) => v.tier === 'top');
  const sequelIdeas = winners.map(
    (v) =>
      `Sequel to "${v.title}": one more Short on ${v.effect ?? 'the same tactic'}, a new study or angle (${v.ratio.toFixed(1)}× the 30-day median).`,
  );
  const byPillar = new Map<string, typeof winners>();
  for (const v of winners) {
    if (v.pillar) byPillar.set(v.pillar, [...(byPillar.get(v.pillar) ?? []), v]);
  }
  const longformCandidates = [...byPillar.entries()]
    .filter(([, vs]) => vs.length >= 2)
    .map(
      ([pillar, vs]) =>
        `Long-form candidate (${pillar}): ${vs.length} winners this week — ${vs.map((v) => `"${v.title}"`).join(', ')}.`,
    );
  const avoid = tiered.filter((v) => v.tier === 'bottom').map((v) => ({ title: v.title, hook: v.hook }));
  return {
    at: now.toISOString(),
    week: mondayOf(now, cfg),
    median30,
    ranked: tiered,
    sequelIdeas,
    longformCandidates,
    avoid,
  };
}

/** A prompt note on the week's weakest Shorts. */
export function avoidBlock(avoid: { title: string; hook?: string }[]): string {
  if (!avoid.length) return '';
  const lines = avoid.slice(0, 12).map((a) => `- "${a.title}" — opened with "${a.hook}"`);
  return `\n\nAVOID THESE (weekly review, bottom 20% against the channel's 30-day median). Don't reuse these titles or openings:\n${lines.join('\n')}`;
}
