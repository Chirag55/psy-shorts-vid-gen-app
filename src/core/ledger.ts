/**
 * The day-by-day ledger behind the week plan: which days have a clean Short,
 * which relaxed a rotation rule, which are already held and which are empty
 * and why. Rebuilt from 6.1.13.
 */
import type { ScheduleConfig } from './channelConfig';
import { plannableLongs, plannableShorts, rotationProblems, type RotationItem } from './rotation';
import { addDays, checkRelease, localParts, slotAt, WEEKDAYS, type Release } from './schedule';
import { isV2 } from './topicBank';
import type { WeekPlan } from './weekPlan';

/** How many ideas to ask for when the bank runs dry. */
export const REFILL_IDEAS = 8;

export type LedgerState = 'clean' | 'relaxed' | 'taken' | 'empty';

export interface LedgerRow {
  day: string;
  weekday: string;
  state: LedgerState;
  breaks: string[];
  entryId?: string;
  reason?: string;
  bankEmpty?: boolean;
}

export interface LedgerLong {
  day: string;
  entryId?: string;
  due?: string;
}

export interface Ledger {
  rows: LedgerRow[];
  longs: LedgerLong[];
  counts: Record<LedgerState, number>;
  summary: string;
}

export function buildLedger(input: {
  bank: any[];
  plan: WeekPlan;
  history: RotationItem[];
  releases: Release[];
  schedule: ScheduleConfig;
  now: Date;
  startDay: string;
  days: number;
}): Ledger {
  const entries = new Map(input.bank.map((e) => [e.id, e]));
  const planByDay = new Map(input.plan.days.map((d) => [d.day, d]));
  const planned = new Set(input.plan.days.map((d) => d.entryId));
  const recent: RotationItem[] = [
    ...input.history.filter((h) => !planned.has(h.id)),
    ...input.plan.days.flatMap((d) => {
      const e = entries.get(d.entryId);
      return e && isV2(e) && e.kind === 'short' ? [{ id: e.id, format: e.format, pillar: e.pillar, day: d.day }] : [];
    }),
  ];
  const available = plannableShorts(input.bank).filter((e) => !planned.has(e.id));
  const rows: LedgerRow[] = [];

  for (let i = 0; i < input.days; i++) {
    const day = addDays(input.startDay, i);
    const weekday = WEEKDAYS[new Date(`${day}T12:00:00Z`).getUTCDay()];
    const p = planByDay.get(day);
    if (!p) {
      const held = input.history.find((h) => h.day === day);
      const release = input.releases.find(
        (r) => r.kind === 'short' && localParts(r.at, input.schedule).day === day,
      );
      if (held || release) {
        rows.push({
          day,
          weekday,
          state: 'taken',
          breaks: [],
          entryId: held?.id,
          reason: held
            ? `${held.id.replace(/^MF-S-/, '')} is already out or in progress for this day.`
            : `"${release!.title}" is already scheduled.`,
        });
        continue;
      }
      if (!available.length) {
        rows.push({
          day,
          weekday,
          state: 'empty',
          breaks: [],
          bankEmpty: true,
          reason: `Bank empty: refill (${REFILL_IDEAS} ideas).`,
        });
        continue;
      }
      const check = checkRelease(
        slotAt(day, 'primary', input.schedule),
        'short',
        [
          ...input.releases,
          ...input.plan.days.map((d) => ({ id: d.entryId, kind: 'short', at: new Date(d.at), title: d.entryId })),
        ],
        input.schedule,
        input.now,
      );
      rows.push({
        day,
        weekday,
        state: 'empty',
        breaks: [],
        reason: check.problems[0] ?? 'No Short was planned for this day: re-plan.',
      });
      continue;
    }
    const e = entries.get(p.entryId);
    const breaks =
      e && isV2(e) && e.kind === 'short'
        ? rotationProblems({ id: e.id, format: e.format, pillar: e.pillar }, day, recent)
        : [];
    rows.push({ day, weekday, state: breaks.length ? 'relaxed' : 'clean', entryId: p.entryId, breaks });
  }

  const longWeekday = input.schedule.longformWeekday;
  const ready = plannableLongs(input.bank).filter((e) => !(input.plan.long ?? []).some((l) => l.entryId === e.id));
  const longs: LedgerLong[] = [];
  for (const l of input.plan.long ?? []) longs.push({ day: l.day, entryId: l.entryId });
  if (longWeekday) {
    for (const row of rows) {
      if (row.weekday !== longWeekday || longs.some((l) => l.day === row.day)) continue;
      longs.push({
        day: row.day,
        due: ready.length
          ? `Long-form due: pick ${ready[0].id.replace(/^MF-/, '')}.`
          : 'Long-form due: none is ready (a Short goes out instead).',
      });
    }
  }
  longs.sort((a, b) => a.day.localeCompare(b.day));

  const counts: Record<LedgerState, number> = { clean: 0, relaxed: 0, taken: 0, empty: 0 };
  for (const row of rows) counts[row.state]++;
  const why = [
    ...new Set(rows.filter((r) => r.state === 'empty').map((r) => (r.bankEmpty ? 'bank empty' : 'gap rule or slot'))),
  ];
  const parts = [
    `${counts.clean} clean`,
    `${counts.relaxed} relaxed`,
    ...(counts.taken ? [`${counts.taken} already held`] : []),
    `${counts.empty} empty${why.length ? ` (${why.join(', ')})` : ''}`,
  ];
  return { rows, longs, counts, summary: `${input.days} days: ${parts.join(', ')}` };
}

/** Entries that would break a rotation rule on `day`, with the rules they break. */
export function rejectionsFor(day: string, entries: any[], recent: RotationItem[]): { id: string; problems: string[] }[] {
  return entries
    .map((e) => ({ id: e.id, problems: rotationProblems(e, day, recent) }))
    .filter((r) => r.problems.length);
}
