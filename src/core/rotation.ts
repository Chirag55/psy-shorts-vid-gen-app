import { WAIVE } from './compliance';
import { coldOpenProblems, contentWords, hookProblems, SHORT_MAX_WORDS, SHORT_MIN_WORDS } from './authenticity';
import type { ScheduleConfig } from './channelConfig';
import { addDays, localParts, upcomingSlots, type Release } from './schedule';
import { isSceneFirst, shortFormatProblems } from './shortFormat';
import { isV2 } from './topicBank';

/** One Short placed on a calendar day. */
export interface RotationItem {
  id: string;
  format?: string;
  pillar?: string;
  day: string;
}

export const MAX_FORMAT_PER_WEEK = 3;
export const MAX_PILLAR_RUN = 2;

const short = (id: string) => id.replace(/^MF-S-/, '');
const WAIVED = new Set(Object.keys(WAIVE));
const VIRALITY_RANK: Record<string, number> = { high: 0, medium: 1, low: 2 };
const PRIORITY_RANK: Record<string, number> = { A: 0, B: 1, C: 2, published: 3 };

function asItem(e: any): { id: string; format?: string; pillar?: string } {
  return { id: e.id, format: e.format, pillar: e.pillar };
}

/** Format and pillar clashes if `entry` went out on `day` alongside `placed`. */
export function rotationProblems(entry: any, day: string, placed: RotationItem[]): string[] {
  const out: string[] = [];
  const byDay = new Map<string, RotationItem>();
  for (const p of placed) if (p.id !== entry.id) byDay.set(p.day, p);
  const at = (n: number) => byDay.get(addDays(day, n));
  for (const [offset, label] of [
    [-1, 'the day before'],
    [1, 'the day after'],
  ] as const) {
    const p = at(offset);
    if (p && p.format === entry.format) out.push(`Same format (${entry.format}) as ${short(p.id)} ${label}.`);
  }
  for (let start = -6; start <= 0; start++) {
    const ids = [entry.id];
    for (let i = start; i < start + 7; i++) {
      if (i === 0) continue;
      const p = at(i);
      if (p && p.format === entry.format) ids.push(p.id);
    }
    if (ids.length > MAX_FORMAT_PER_WEEK) {
      out.push(
        `${ids.length} ${entry.format} Shorts within 7 days (${ids.map(short).join(', ')}); ${MAX_FORMAT_PER_WEEK} at most.`,
      );
      break;
    }
  }
  if (entry.pillar) {
    let before = 0;
    while (at(-(before + 1))?.pillar === entry.pillar) before++;
    let after = 0;
    while (at(after + 1)?.pillar === entry.pillar) after++;
    const run = before + 1 + after;
    if (run > MAX_PILLAR_RUN) out.push(`${entry.pillar} ${run} days running; ${MAX_PILLAR_RUN} at most.`);
  }
  return out;
}

/** Why an entry can't go into the plan at all. */
export function blockReasons(entry: any): string[] {
  if (!isV2(entry)) return [];
  if (entry.kind === 'long') return coldOpenProblems(entry.chapters?.[0]?.narration ?? '');
  const sceneFirst = isSceneFirst(entry);
  const problems = WAIVED.has(entry.id) ? [] : hookProblems(entry.narration, entry.hook_text, { sceneFirst });
  const n = contentWords(entry.narration).length;
  if (!sceneFirst && (n < SHORT_MIN_WORDS || n > SHORT_MAX_WORDS)) {
    problems.push(
      `The narration is ${n} words; a Short needs ${SHORT_MIN_WORDS} to ${SHORT_MAX_WORDS} (target 55 to 125).`,
    );
  }
  const red = shortFormatProblems(entry).red.filter(
    (m: string) => !(WAIVE[entry.id]?.includes('S3') && /cites its source/.test(m)),
  );
  problems.push(...red);
  return problems;
}

/** Unused v2 Shorts ready to plan, best first. */
export function plannableShorts(entries: any[]): any[] {
  return entries
    .filter(
      (e) =>
        isV2(e) &&
        e.kind === 'short' &&
        e.status === 'unused' &&
        e.priority !== 'C' &&
        e.priority !== 'published' &&
        !blockReasons(e).length,
    )
    .sort(
      (a, b) =>
        (a.priority ? PRIORITY_RANK[a.priority] : PRIORITY_RANK.B) -
          (b.priority ? PRIORITY_RANK[b.priority] : PRIORITY_RANK.B) ||
        (a.queue ?? Number.MAX_SAFE_INTEGER) - (b.queue ?? Number.MAX_SAFE_INTEGER) ||
        VIRALITY_RANK[a.virality ?? 'medium'] - VIRALITY_RANK[b.virality ?? 'medium'] ||
        a.order - b.order,
    );
}

/** Unused v2 long-forms ready to plan, in publish order. */
export function plannableLongs(entries: any[]): any[] {
  return entries
    .filter((e) => isV2(e) && e.kind === 'long' && e.status === 'unused' && !blockReasons(e).length)
    .sort((a, b) => a.publish_order - b.publish_order || a.order - b.order);
}

/** Published Shorts by local day, plus in-progress ones on the slots they'll take. */
export function rotationHistory(
  entries: any[],
  releases: Release[],
  cfg: ScheduleConfig,
  now: Date,
  includePending = true,
): { history: RotationItem[]; pending: number } {
  const history: RotationItem[] = entries
    .filter((e) => isV2(e) && e.kind === 'short')
    .filter((e) => e.status === 'published' && e.publishedAt)
    .map((e) => ({ ...asItem(e), day: localParts(new Date(e.publishedAt), cfg).day }));
  const pending = entries
    .filter((e) => e.kind === 'short' && e.status === 'in_progress' && !e.videoId)
    .sort((a, b) => (a.startedAt ?? 0) - (b.startedAt ?? 0));
  const slots = upcomingSlots('short', releases, cfg, now, pending.length);
  pending.forEach((e, i) => {
    if (includePending && isV2(e) && e.kind === 'short' && slots[i]) {
      history.push({ ...asItem(e), day: localParts(slots[i].at, cfg).day });
    }
  });
  return { history, pending: pending.length };
}

/** How bad a set of rotation problems is: pillar runs cost least, other clashes most. */
export function relaxCost(problems: string[]): number {
  return problems.reduce((sum, p) => sum + (/days running/.test(p) ? 1 : /within 7 days/.test(p) ? 2 : 3), 0);
}

/** The first candidate with no clash on `day`, else the one with the cheapest clashes. */
export function pickForDay(candidates: any[], day: string, placed: RotationItem[]): { pick?: any; problems: string[] } {
  let best: { pick?: any; problems: string[]; cost: number } = { problems: [], cost: Infinity };
  for (const c of candidates) {
    const problems = rotationProblems(c, day, placed);
    if (!problems.length) return { pick: c, problems };
    const cost = relaxCost(problems);
    if (!best.pick || cost < best.cost) best = { pick: c, problems, cost };
  }
  return { pick: best.pick, problems: best.problems };
}

/** An order of `queue` across `days` with no rotation clash, or null if there isn't one. */
export function reorderQueue(
  queue: any[],
  days: string[],
  placed: RotationItem[],
  allow?: (entry: any, dayIndex: number) => boolean,
): any[] | null {
  const n = Math.min(queue.length, days.length);
  const chosen: RotationItem[] = [];
  const used = new Array(queue.length).fill(false);
  const order: any[] = [];
  let steps = 0;
  const visit = (i: number): boolean => {
    if (i === n) return true;
    steps++;
    if (steps > 50000) return false;
    const tried = new Set<string>();
    for (let j = 0; j < queue.length; j++) {
      if (used[j]) continue;
      const e = queue[j];
      const key = `${e.format}|${e.pillar}${allow ? '|'.concat(e.id) : ''}`;
      if (tried.has(key)) continue;
      tried.add(key);
      if (rotationProblems(e, days[i], [...placed, ...chosen]).length) continue;
      if (allow && !allow(e, i)) continue;
      used[j] = true;
      chosen.push({ ...asItem(e), day: days[i] });
      order.push(e);
      if (visit(i + 1)) return true;
      used[j] = false;
      chosen.pop();
      order.pop();
    }
    return false;
  };
  return visit(0) ? order : null;
}

/** The first day of the Flow credit period `day` falls in. */
export function poolPeriod(day: string, resetDay: number): string {
  const [y, m, d] = day.split('-').map(Number);
  const start = d >= resetDay ? new Date(Date.UTC(y, m - 1, resetDay)) : new Date(Date.UTC(y, m - 2, resetDay));
  return start.toISOString().slice(0, 10);
}

export interface PoolConfig {
  poolResetDay: number;
  longformCredits: number;
  creditsPerClip: number;
  monthlyPool: number;
}

export interface PoolUse {
  period: string;
  credits: number;
  longforms: string[];
}

/** Flow credits each credit period's long-forms need. */
export function poolUse(items: { id: string; day: string; clips?: number }[], cfg: PoolConfig): PoolUse[] {
  const byPeriod = new Map<string, PoolUse>();
  for (const it of items) {
    const period = poolPeriod(it.day, cfg.poolResetDay);
    const use = byPeriod.get(period) ?? { period, credits: 0, longforms: [] };
    use.credits += it.clips === undefined ? cfg.longformCredits : it.clips * cfg.creditsPerClip;
    use.longforms.push(it.id);
    byPeriod.set(period, use);
  }
  return [...byPeriod.values()].sort((a, b) => a.period.localeCompare(b.period));
}

export function poolWarnings(uses: PoolUse[], cfg: { monthlyPool: number }): string[] {
  return uses
    .filter((u) => u.credits > cfg.monthlyPool)
    .map(
      (u) =>
        `Flow pool from ${u.period}: ${u.longforms.map((id) => id).join(', ')} need ${u.credits.toLocaleString()} credits; the pool is ${cfg.monthlyPool.toLocaleString()}. Move a long-form to the next period or plan fewer clips.`,
    );
}
