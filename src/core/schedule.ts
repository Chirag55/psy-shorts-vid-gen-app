/**
 * Release slots in the channel's zone (CR-50): Shorts at the primary or
 * fallback slot, one long-form a week on its weekday, minimum gaps between
 * releases. Rebuilt from 6.1.13.
 */
import { parseClock, type ScheduleConfig } from './channelConfig';
import type { Mode, Project } from './types';

export const MIN_LEAD_MINUTES = 30;
export const WEEKDAYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
const HOUR = 3600000;
const DAY = 86400000;
const DAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const DAY_LONG = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export type Slot = 'primary' | 'fallback' | 'longform' | 'override';

export interface Release {
  id: string;
  kind: Mode | string;
  at: Date;
  title: string;
}

const clock = (value: string | undefined, fallback: number) => parseClock(value ?? '') ?? fallback;
const shifted = (date: Date, cfg: ScheduleConfig) => new Date(date.getTime() + cfg.utcOffsetMinutes * 60000);
const ymd = (day: string) => day.split('-').map(Number);

export function localParts(date: Date, cfg: ScheduleConfig): { day: string; minutes: number; weekday: string } {
  const d = shifted(date, cfg);
  return { day: d.toISOString().slice(0, 10), minutes: d.getUTCHours() * 60 + d.getUTCMinutes(), weekday: WEEKDAYS[d.getUTCDay()] };
}

/** The instant of `minutes` past local midnight on `day`. */
export function atLocal(day: string, minutes: number, cfg: ScheduleConfig): Date {
  const [y, m, d] = ymd(day);
  return new Date(Date.UTC(y, m - 1, d) + (minutes - cfg.utcOffsetMinutes) * 60000);
}

export function addDays(day: string, n: number): string {
  const [y, m, d] = ymd(day);
  return new Date(Date.UTC(y, m - 1, d) + n * DAY).toISOString().slice(0, 10);
}

export function slotAt(day: string, slot: Slot, cfg: ScheduleConfig): Date {
  const minutes =
    slot === 'primary'
      ? clock(cfg.primarySlot, 990)
      : slot === 'fallback'
        ? clock(cfg.fallbackSlot, 1050)
        : clock(cfg.longformSlot, 660);
  return atLocal(day, minutes, cfg);
}

export function classifySlot(date: Date, kind: Mode | string, cfg: ScheduleConfig): Slot {
  const { minutes } = localParts(date, cfg);
  if (kind !== 'long') {
    if (minutes === clock(cfg.primarySlot, 990)) return 'primary';
    if (minutes === clock(cfg.fallbackSlot, 1050)) return 'fallback';
    return 'override';
  }
  return minutes === clock(cfg.longformSlot, 660) ? 'longform' : 'override';
}

/** "Sat 18 Oct, 4:30 pm IST". */
export function formatRelease(date: Date, cfg: ScheduleConfig): string {
  const d = shifted(date, cfg);
  const h = d.getUTCHours();
  const h12 = h % 12 !== 0 ? h % 12 : 12;
  const mm = String(d.getUTCMinutes()).padStart(2, '0');
  return `${DAY_SHORT[d.getUTCDay()]} ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}, ${h12}:${mm} ${h < 12 ? 'am' : 'pm'} ${cfg.zoneLabel}`;
}

export function checkRelease(
  at: Date,
  kind: Mode | string,
  releases: Release[],
  cfg: ScheduleConfig,
  now: Date,
  selfId?: string,
): { ok: boolean; problems: string[]; conflicts: Release[] } {
  const problems: string[] = [];
  if (at.getTime() - now.getTime() < MIN_LEAD_MINUTES * 60000) {
    problems.push(`Too soon: YouTube needs the publish time at least ${MIN_LEAD_MINUTES} minutes ahead.`);
  }
  const latest = parseClock(cfg.latestAllowed);
  const long = kind === 'long';
  if (long && cfg.longformWeekday && localParts(at, cfg).weekday !== cfg.longformWeekday) {
    problems.push(`Long-form goes out on ${DAY_LONG[WEEKDAYS.indexOf(cfg.longformWeekday)]}s only (CR-50).`);
  }
  const conflicts: Release[] = [];
  if (long) {
    for (const r of releases) {
      if (r.id !== selfId && r.kind === 'long' && Math.abs(at.getTime() - r.at.getTime()) / DAY < 6) {
        conflicts.push(r);
        problems.push(`Within a week of the long-form "${r.title}" (${formatRelease(r.at, cfg)}): one long-form a week (CR-50).`);
      }
    }
  }
  if (kind === 'short' && latest !== null && localParts(at, cfg).minutes > latest) {
    problems.push(`After ${cfg.latestAllowed} ${cfg.zoneLabel}: a Short released late at night is tested on an audience that's asleep.`);
  }
  for (const r of releases) {
    if (r.id === selfId) continue;
    const hours = Math.abs(at.getTime() - r.at.getTime()) / HOUR;
    const bothShort = kind === 'short' && r.kind === 'short';
    const gap = bothShort ? cfg.minGapHoursShort : cfg.minGapHoursAny;
    if (hours < gap) {
      conflicts.push(r);
      problems.push(
        `Within ${gap} h of ${r.kind === 'short' ? 'the Short' : 'the long-form'} "${r.title}" (${formatRelease(r.at, cfg)}): ` +
          (bothShort ? "two Shorts this close split the feed's test traffic." : 'a long-form and another video this close split the traffic.'),
      );
    }
  }
  return { ok: problems.length === 0, problems, conflicts };
}

/** The first slot (up to 120 days out) that passes checkRelease. */
export function nextValidSlot(
  kind: Mode | string,
  releases: Release[],
  cfg: ScheduleConfig,
  now: Date,
  selfId?: string,
): { at: Date; slot: Slot } {
  const today = localParts(now, cfg).day;
  const earliest = now.getTime() + MIN_LEAD_MINUTES * 60000;
  const long = kind === 'long';
  for (let i = 0; i < 120; i++) {
    const day = addDays(today, i);
    if (long && cfg.longformWeekday && localParts(atLocal(day, 720, cfg), cfg).weekday !== cfg.longformWeekday) continue;
    const slots: Slot[] = long ? ['longform'] : ['primary'];
    if (kind === 'short' && i === 0 && slotAt(day, 'primary', cfg).getTime() < earliest) slots.push('fallback');
    for (const slot of slots) {
      const at = slotAt(day, slot, cfg);
      if (checkRelease(at, kind, releases, cfg, now, selfId).ok) return { at, slot };
    }
  }
  return { at: slotAt(addDays(today, 1), long ? 'longform' : 'primary', cfg), slot: 'override' };
}

export function weekStrip(
  releases: Release[],
  cfg: ScheduleConfig,
  now: Date,
  days = 7,
): { day: string; label: string; weekday: string; releases: Release[] }[] {
  const today = localParts(now, cfg).day;
  return Array.from({ length: days }, (_, i) => {
    const day = addDays(today, i);
    const noon = shifted(atLocal(day, 720, cfg), cfg);
    return {
      day,
      label: `${DAY_SHORT[noon.getUTCDay()]} ${noon.getUTCDate()}`,
      weekday: WEEKDAYS[noon.getUTCDay()],
      releases: releases.filter((r) => localParts(r.at, cfg).day === day).sort((a, b) => a.at.getTime() - b.at.getTime()),
    };
  });
}

/** Scheduled and public releases from the projects, plus any from the channel. */
export function collectReleases(
  projects: Project[],
  extra: { videoId: string; kind: string; at: string | number; title: string }[] = [],
): Release[] {
  const map = new Map<string, Release>();
  for (const e of extra) {
    const at = new Date(e.at);
    if (!Number.isNaN(at.getTime())) map.set(e.videoId, { id: e.videoId, kind: e.kind, at, title: e.title });
  }
  for (const p of projects) {
    const id = p.assets.youtubeVideoId;
    if (!id) continue;
    const at = p.assets.scheduledFor
      ? new Date(p.assets.scheduledFor)
      : p.publish?.privacyStatus === 'public' && p.assets.publishedAt
        ? new Date(p.assets.publishedAt)
        : null;
    if (at && !Number.isNaN(at.getTime())) map.set(id, { id, kind: p.mode, at, title: p.script.title });
  }
  return [...map.values()].sort((a, b) => a.at.getTime() - b.at.getTime());
}

/** The next `count` valid slots, each planned before finding the next. */
export function upcomingSlots(
  kind: Mode | string,
  releases: Release[],
  cfg: ScheduleConfig,
  now: Date,
  count: number,
): { at: Date; slot: Slot }[] {
  const out: { at: Date; slot: Slot }[] = [];
  const planned = [...releases];
  for (let i = 0; i < count; i++) {
    const s = nextValidSlot(kind, planned, cfg, now);
    out.push(s);
    planned.push({ id: `planned-${i}`, kind, at: s.at, title: 'planned' });
  }
  return out;
}
