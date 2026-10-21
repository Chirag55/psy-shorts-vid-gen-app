import type { ChannelConfig, FlowConfig, ScheduleConfig } from './channelConfig';
import { hybridClipCount } from './hybridPlan';
import { budgetWarnings, forecastPeriods, measuredShortCost, type BudgetItem } from './flowBudget';
import { localParts, upcomingSlots, type Release } from './schedule';
import {
  blockReasons,
  pickForDay,
  plannableLongs,
  plannableShorts,
  poolUse,
  poolWarnings,
  reorderQueue,
  rotationHistory,
  rotationProblems,
  type RotationItem,
} from './rotation';
import { isV2 } from './topicBank';
import { isViral, viralFirst } from './viralBatch';
import { longClipCount } from './v2Script';

/** Days of Shorts a plan covers. */
export const QUEUE_DAYS = 14;
/** Hours a feeding Short should go out before its long-form. */
export const SEED_HOURS = 48;

export interface PlanDay {
  day: string;
  weekday: string;
  at: string;
  entryId: string;
}

export interface WeekPlan {
  createdAt: string;
  days: PlanDay[];
  long?: PlanDay[];
}

const short = (id: string) => id.replace(/^MF-S-/, '');

/** The plan's v2 Shorts as rotation items on their days. */
function datedPlan(plan: WeekPlan, entries: any[]): RotationItem[] {
  const byId = new Map(entries.map((e) => [e.id, e]));
  return plan.days.flatMap((d) => {
    const e = byId.get(d.entryId);
    return e && isV2(e) && e.kind === 'short' ? [{ id: e.id, format: e.format, pillar: e.pillar, day: d.day }] : [];
  });
}

/** Long-forms planned less than SEED_HOURS after a Short that feeds them. */
export function seedWarnings(plan: WeekPlan, byId: Map<string, any>): string[] {
  const out: string[] = [];
  for (const l of plan.long ?? []) {
    const longAt = new Date(l.at).getTime();
    for (const d of plan.days) {
      const e = byId.get(d.entryId);
      if (!e || !isV2(e) || e.kind !== 'short' || e.related_longform !== l.entryId) continue;
      const hours = (longAt - new Date(d.at).getTime()) / 3600000;
      if (0 < hours && hours < SEED_HOURS) {
        out.push(
          `${l.day}: ${l.entryId} goes out ${Math.round(hours)} h after ${e.id.replace(/^MF-S-/, '')}, a Short that feeds it; leave ${SEED_HOURS} h so the Short can seed search demand first.`,
        );
      }
    }
  }
  return out;
}

/** Published and planned long-forms with the clips each needs, for the Flow pool. */
export function longDays(plan: WeekPlan | null | undefined, entries: any[], projects: any[]): { id: string; day: string; clips?: number }[] {
  const clipsFor = (id: string): number | undefined => {
    const project = projects.find((p) => p.bankEntryId === id && p.mode === 'long');
    if (project) return longClipCount(project.script);
    const e = entries.find((x) => x.id === id);
    return e && isV2(e) && e.kind === 'long' ? hybridClipCount(e) : undefined;
  };
  const planned = (plan?.long ?? []).map((l) => ({ id: l.entryId, day: l.day, clips: clipsFor(l.entryId) }));
  const published = entries
    .filter((e) => e.kind === 'long' && e.publishedAt && !planned.some((p) => p.id === e.id))
    .map((e) => ({ id: e.id, day: new Date(e.publishedAt).toISOString().slice(0, 10), clips: clipsFor(e.id) }));
  return [...published, ...planned];
}

/** Fills the slots with the best Shorts and long-forms, keeping rotation and seeding rules. */
export function planQueue(
  entries: any[],
  shortSlots: Date[],
  longSlots: Date[],
  history: RotationItem[],
  cfg: ScheduleConfig,
  now: Date = new Date(),
): WeekPlan {
  let pool = plannableShorts(entries);
  const placed: RotationItem[] = [...history];
  const days: PlanDay[] = [];
  const longs = plannableLongs(entries);
  const longPlan = longSlots.slice(0, longs.length).map((at, i) => ({ at, id: longs[i].id }));
  for (const at of shortSlots) {
    if (!pool.length) break;
    const { day, weekday } = localParts(at, cfg);
    const soon = new Set(
      longPlan
        .filter((l) => l.at.getTime() > at.getTime() && l.at.getTime() - at.getTime() < SEED_HOURS * 3600000)
        .map((l) => l.id),
    );
    const free = pool.filter((e) => !soon.has(e.related_longform));
    // A9: the viral batch goes out first, in order, whatever else is waiting.
    const viral = pool.find(isViral);
    const { pick } = viral ? { pick: viral } : pickForDay(free.length ? free : pool, day, placed);
    if (!pick) break;
    days.push({ day, weekday, at: at.toISOString(), entryId: pick.id });
    placed.push({ id: pick.id, format: pick.format, pillar: pick.pillar, day });
    pool = pool.filter((e) => e.id !== pick.id);
  }
  const long = longSlots.slice(0, longs.length).map((at, i) => {
    const parts = localParts(at, cfg);
    return { day: parts.day, weekday: parts.weekday, at: at.toISOString(), entryId: longs[i].id };
  });
  return { createdAt: now.toISOString(), days, long };
}

/** The free Short and long-form slots for the next `days`, after what's already in progress. */
export function queueSlots(
  entries: any[],
  releases: Release[],
  cfg: ScheduleConfig,
  now: Date,
  days: number = QUEUE_DAYS,
): { shortSlots: Date[]; longSlots: Date[]; history: RotationItem[] } {
  const { history, pending } = rotationHistory(entries, releases, cfg, now);
  const shortSlots = upcomingSlots('short', releases, cfg, now, pending + days)
    .slice(pending)
    .map((s) => s.at);
  const pendingLongs = entries.filter((e) => e.kind === 'long' && e.status === 'in_progress' && !e.videoId).length;
  const horizon = shortSlots.length
    ? shortSlots[shortSlots.length - 1].getTime() + 86400000
    : now.getTime() + days * 86400000;
  const longSlots = upcomingSlots('long', releases, cfg, now, pendingLongs + Math.ceil(days / 7) + 1)
    .slice(pendingLongs)
    .map((s) => s.at)
    .filter((at) => at.getTime() <= horizon);
  return { shortSlots, longSlots, history };
}

export function swapPlanDays(plan: WeekPlan, a: number, b: number): WeekPlan {
  if (a < 0 || b < 0 || a >= plan.days.length || b >= plan.days.length || a === b) return plan;
  const days = plan.days.map((d) => ({ ...d }));
  [days[a].entryId, days[b].entryId] = [days[b].entryId, days[a].entryId];
  return { ...plan, days };
}

export function replacePlanDay(plan: WeekPlan, index: number, entryId: string): WeekPlan {
  if (index < 0 || index >= plan.days.length) return plan;
  return { ...plan, days: plan.days.map((d, i) => (i === index ? { ...d, entryId } : d)) };
}

/** The entry planned for `day`, if it's still unused and not blocked. */
export function plannedEntry(plan: WeekPlan | null | undefined, day: string, entries: any[]): any | undefined {
  const id = plan?.days.find((d) => d.day === day)?.entryId;
  const e = id ? entries.find((x) => x.id === id) : undefined;
  return e?.status === 'unused' && !blockReasons(e).length ? e : undefined;
}

/** Everything wrong with a plan: short runs, blocked or stale entries, rotation, seeding, Flow budget. */
export function planWarnings(
  plan: WeekPlan,
  entries: any[],
  history: RotationItem[] = [],
  flow?: FlowConfig,
  projects: any[] = [],
): string[] {
  const out: string[] = [];
  const byId = new Map(entries.map((e) => [e.id, e]));
  if (plan.days.length < QUEUE_DAYS) {
    out.push(
      `Only ${plan.days.length} of the next ${QUEUE_DAYS} days have a Short ready: import or fix more (blocked and skipped ones are not planned).`,
    );
  }
  const placed = [...history.filter((h) => !plan.days.some((d) => d.entryId === h.id)), ...datedPlan(plan, entries)];
  for (const d of plan.days) {
    const e = byId.get(d.entryId);
    if (!e) {
      out.push(`${d.day}: ${d.entryId} is no longer in the bank.`);
      continue;
    }
    if (!isV2(e)) {
      out.push(`${d.day}: ${e.id} is a legacy topic.`);
    } else if (e.kind === 'short') {
      const reasons = blockReasons(e);
      if (reasons.length) out.push(`${d.day}: ${short(e.id)} is blocked — ${reasons[0]}`);
      for (const p of rotationProblems({ id: e.id, format: e.format, pillar: e.pillar }, d.day, placed)) {
        out.push(`${d.day}: ${short(e.id)} — ${p}`);
      }
    }
    if (e.status !== 'unused' && e.status !== 'in_progress') out.push(`${d.day}: ${e.id} is ${e.status}.`);
  }
  out.push(...seedWarnings(plan, byId));
  if (flow) {
    out.push(...poolWarnings(poolUse(longDays(plan, entries, projects), flow), flow));
    const items: BudgetItem[] = [
      ...plan.days.map((d) => ({ id: d.entryId, day: d.day, kind: 'short' as const })),
      ...(plan.long ?? []).map((l) => {
        const e = entries.find((x) => x.id === l.entryId);
        const credits = e && isV2(e) && e.kind === 'long' ? e.screenplay?.flow_budget_credits : undefined;
        return { id: l.entryId, day: l.day, kind: 'long' as const, ...(credits ? { credits } : {}) };
      }),
    ];
    out.push(...budgetWarnings(forecastPeriods(items, flow, measuredShortCost(projects, flow))));
  }
  return [...new Set(out)];
}

/** The plan's Shorts reordered so no rotation rule breaks, or null if no order works. */
export function autoReorder(plan: WeekPlan, entries: any[], history: RotationItem[]): WeekPlan | null {
  const byId = new Map(entries.map((e) => [e.id, e]));
  const picked = plan.days.map((d) => byId.get(d.entryId)).filter((e) => Boolean(e && isV2(e) && e.kind === 'short'));
  if (picked.length !== plan.days.length) return null;
  const queue = picked
    .map((e) => ({ ...e, id: e.id, format: e.format, pillar: e.pillar, order: e.order, feeds: e.related_longform }))
    .sort((a, b) => a.order - b.order);
  const viral = viralFirst(queue).filter(isViral);
  const days = plan.days.map((d) => d.day);
  const base = history.filter((h) => !picked.some((p) => p.id === h.id));
  const soon = plan.days.map(
    (d) =>
      new Set(
        (plan.long ?? [])
          .filter(
            (l) =>
              new Date(l.at).getTime() > new Date(d.at).getTime() &&
              new Date(l.at).getTime() - new Date(d.at).getTime() < 172800000,
          )
          .map((l) => l.entryId),
      ),
  );
  // A9: the viral batch keeps the first days, in batch order; the rest is reordered around it.
  const rest = queue.filter((q) => !isViral(q));
  const fixed = viral.map((v, i) => ({ ...v, day: days[i] }));
  const restDays = days.slice(viral.length);
  const restBase = [...base, ...fixed.map((f) => ({ id: f.id, format: f.format, pillar: f.pillar, day: f.day }))];
  const restOrder =
    reorderQueue(rest, restDays, restBase, (q, i) => !soon[i + viral.length].has(q.feeds)) ??
    reorderQueue(rest, restDays, restBase);
  if (!restOrder) return null;
  const order = [...viral, ...restOrder];
  return { ...plan, days: plan.days.map((d, i) => ({ ...d, entryId: order[i].id })) };
}

/** Shorts that could take day `index`, fewest clashes first. */
export function swapOptions(
  plan: WeekPlan,
  index: number,
  entries: any[],
  history: RotationItem[] = [],
): { entry: any; warnings: string[] }[] {
  const day = plan.days[index];
  if (!day) return [];
  const inPlan = new Set(plan.days.map((d) => d.entryId));
  const placed = [
    ...history.filter((h) => !inPlan.has(h.id)),
    ...datedPlan(plan, entries).filter((p) => p.day !== day.day),
  ];
  return plannableShorts(entries)
    .filter((e) => !inPlan.has(e.id))
    .map((e) => ({ entry: e, warnings: rotationProblems({ id: e.id, format: e.format, pillar: e.pillar }, day.day, placed) }))
    .sort((a, b) => a.warnings.length - b.warnings.length || a.entry.order - b.entry.order);
}

/** Pillar and format counts across swap options, most common first. */
export function optionCategories(options: { entry: any }[]): {
  pillars: { value: string; count: number }[];
  formats: { value: string; count: number }[];
} {
  const pillars = new Map<string, number>();
  const formats = new Map<string, number>();
  for (const { entry } of options) {
    if (!isV2(entry) || entry.kind !== 'short') continue;
    pillars.set(entry.pillar, (pillars.get(entry.pillar) ?? 0) + 1);
    formats.set(entry.format, (formats.get(entry.format) ?? 0) + 1);
  }
  const sorted = (m: Map<string, number>) =>
    [...m.entries()].map(([value, count]) => ({ value, count })).sort((a, b) => b.count - a.count);
  return { pillars: sorted(pillars), formats: sorted(formats) };
}

/** The Short for the next free slot: the planned one if it's still good, else the best pick. */
export function nextShortFor(
  entries: any[],
  releases: Release[],
  cfg: ChannelConfig,
  plan: WeekPlan | null | undefined,
  now: Date = new Date(),
): { entry: any; at: Date; weekday: string; problems: string[] } {
  const { history, pending } = rotationHistory(entries, releases, cfg.schedule, now);
  const at = upcomingSlots('short', releases, cfg.schedule, now, pending + 1)[pending].at;
  const { day, weekday } = localParts(at, cfg.schedule);
  const planned = plannedEntry(plan, day, entries);
  if (planned) return { entry: planned, at, weekday, problems: [] };
  const { pick, problems } = pickForDay(plannableShorts(entries), day, history);
  return { entry: pick, at, weekday, problems };
}

/** The next long-form: the first planned one still unused, else the first plannable. */
export function nextLongFor(entries: any[], plan: WeekPlan | null | undefined): any | undefined {
  const planned = plan?.long?.map((l) => entries.find((e) => e.id === l.entryId)).find((e) => e?.status === 'unused');
  return planned ?? plannableLongs(entries)[0];
}
