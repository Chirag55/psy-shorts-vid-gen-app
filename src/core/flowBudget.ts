import type { FlowConfig } from './channelConfig';
import { poolPeriod } from './rotation';

/** Flow credits a Short is assumed to take until real ones are measured. */
export const DEFAULT_SHORT_CREDITS = 60;
/** Headroom for failed tries, as a share of the forecast. */
export const RETRY_BUFFER = 0.1;

export interface BudgetItem {
  id: string;
  day: string;
  kind: 'short' | 'long';
  credits?: number;
}

export interface PeriodForecast {
  period: string;
  shorts: number;
  longs: string[];
  shortCredits: number;
  longCredits: number;
  retry: number;
  total: number;
  available: number;
  over: boolean;
}

/** Days in the credit period starting on `period`. */
function daysIn(period: string, resetDay: number): number {
  const [y, m] = period.split('-').map(Number);
  const end = new Date(Date.UTC(y, m, resetDay)).getTime();
  return Math.round((end - new Date(`${period}T00:00:00Z`).getTime()) / 86400000);
}

/** Forecast Flow spend per credit period against what the period makes available. */
export function forecastPeriods(
  items: BudgetItem[],
  cfg: FlowConfig,
  shortCredits: number = DEFAULT_SHORT_CREDITS,
): PeriodForecast[] {
  const byPeriod = new Map<string, BudgetItem[]>();
  for (const it of items) {
    const period = poolPeriod(it.day, cfg.poolResetDay);
    byPeriod.set(period, [...(byPeriod.get(period) ?? []), it]);
  }
  return [...byPeriod.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([period, list]) => {
      const shorts = list.filter((i) => i.kind === 'short').length;
      const longs = list.filter((i) => i.kind === 'long');
      const sCredits = shorts * shortCredits;
      const lCredits = longs.reduce((sum, l) => sum + (l.credits ?? cfg.longformCredits), 0);
      const retry = Math.round((sCredits + lCredits) * RETRY_BUFFER);
      const total = sCredits + lCredits + retry;
      const available = cfg.shortDailyFree * daysIn(period, cfg.poolResetDay) + cfg.monthlyPool;
      return {
        period,
        shorts,
        longs: longs.map((l) => l.id),
        shortCredits: sCredits,
        longCredits: lCredits,
        retry,
        total,
        available,
        over: total > available,
      };
    });
}

export function budgetWarnings(forecast: PeriodForecast[]): string[] {
  return forecast
    .filter((p) => p.over)
    .map(
      (p) =>
        `Flow budget from ${p.period}: about ${p.total.toLocaleString()} credits forecast (${p.shorts} Shorts, ${p.longs.length} long-form${p.longs.length === 1 ? '' : 's'}, a ${Math.round(RETRY_BUFFER * 100)}% retry buffer) against ${p.available.toLocaleString()}. Move a long-form to the next period or plan fewer clips.`,
    );
}

/** Whether adding `item` keeps its credit period in budget, and the next period start if that one fits. */
export function canSchedule(
  items: BudgetItem[],
  item: BudgetItem,
  cfg: FlowConfig,
  shortCredits: number = DEFAULT_SHORT_CREDITS,
): { ok: true } | { ok: false; reason: string; nextFeasible?: string } {
  const before = forecastPeriods(items, cfg, shortCredits);
  const after = forecastPeriods([...items, item], cfg, shortCredits);
  const period = poolPeriod(item.day, cfg.poolResetDay);
  const now = after.find((p) => p.period === period);
  const was = before.find((p) => p.period === period);
  if (!now?.over) return { ok: true };
  const [y, m] = period.split('-').map(Number);
  const next = new Date(Date.UTC(y, m, cfg.poolResetDay)).toISOString().slice(0, 10);
  const moved = forecastPeriods([...items, { ...item, day: next }], cfg, shortCredits).find((p) => p.period === next);
  return {
    ok: false,
    reason: `This would take the Flow budget from ${period} to about ${now.total.toLocaleString()} credits against ${now.available.toLocaleString()}${was?.over ? ' (it was already over)' : ''}.`,
    ...(moved && !moved.over ? { nextFeasible: next } : {}),
  };
}

/** The average Flow spend of the last ten Shorts that used clips. */
export function measuredShortCost(projects: any[], cfg: FlowConfig): number {
  const costs = projects
    .filter((p) => p.mode === 'short')
    .slice(0, 10)
    .map(
      (p) =>
        p.script.beats.flatMap((b: any) => b.shots).filter((s: any) => s.source === 'clip' && s.reuse === undefined)
          .length * cfg.creditsPerClip,
    )
    .filter((c: number) => c > 0);
  if (!costs.length) return DEFAULT_SHORT_CREDITS;
  return Math.max(DEFAULT_SHORT_CREDITS, Math.round(costs.reduce((a: number, b: number) => a + b, 0) / costs.length));
}

export function longBudget(script: any, cfg: FlowConfig): number {
  return script?.bankV2?.flowBudget ?? cfg.longformCredits;
}

/** Scheduled and published projects as budget items, leaving out `excludeId`. */
export function projectItems(projects: any[], cfg: FlowConfig, excludeId?: string): BudgetItem[] {
  return projects
    .filter((p) => p.id !== excludeId && (p.assets.scheduledFor || p.assets.publishedAt))
    .map((p) => {
      const day = p.assets.scheduledFor
        ? p.assets.scheduledFor.slice(0, 10)
        : new Date(p.assets.publishedAt).toISOString().slice(0, 10);
      if (p.mode !== 'long') return { id: p.id, day, kind: 'short' as const };
      return { id: p.id, day, kind: 'long' as const, credits: p.script?.bankV2?.flowBudget ?? cfg.longformCredits };
    });
}
