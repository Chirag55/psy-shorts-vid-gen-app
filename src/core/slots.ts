/** The daily publish slot. */
export interface PublishSlot {
  hour: number;
  minute: number;
  utcOffsetMinutes: number;
  zone: string;
}

export const DEFAULT_SLOT: PublishSlot = { hour: 19, minute: 30, utcOffsetMinutes: 330, zone: 'IST' };
/** A slot sooner than this can't be scheduled. */
export const MIN_LEAD_MINUTES = 30;
const DAY = 86400000;
const MIN_LEAD_MS = 1800000;

/** The slot's local calendar day. */
export function slotDay(date: Date, slot: PublishSlot = DEFAULT_SLOT): string {
  return new Date(date.getTime() + slot.utcOffsetMinutes * 60000).toISOString().slice(0, 10);
}

/** The next slot at least 30 minutes away on a day nothing else is scheduled. */
export function nextFreeSlot(now: Date, taken: (number | string | Date)[] = [], slot: PublishSlot = DEFAULT_SLOT): Date {
  const takenDays = new Set([...taken].map((t) => slotDay(new Date(t as any), slot)));
  const local = new Date(now.getTime() + slot.utcOffsetMinutes * 60000);
  let candidate = new Date(
    Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate(), slot.hour, slot.minute) -
      slot.utcOffsetMinutes * 60000,
  );
  if (candidate.getTime() - now.getTime() < MIN_LEAD_MS) candidate = new Date(candidate.getTime() + DAY);
  for (let i = 0; takenDays.has(slotDay(candidate, slot)) && i < 366; i++) {
    candidate = new Date(candidate.getTime() + DAY);
  }
  return candidate;
}

/** Moves a slot by whole days, unless that lands too close to now. */
export function shiftSlot(date: Date, days: number, now: Date): Date {
  const next = new Date(date.getTime() + days * DAY);
  return next.getTime() - now.getTime() < MIN_LEAD_MS ? date : next;
}

/** "Fri 17 Oct, 7:30 pm IST" */
export function formatSlot(date: Date, slot: PublishSlot = DEFAULT_SLOT): string {
  const local = new Date(date.getTime() + slot.utcOffsetMinutes * 60000);
  const h = local.getUTCHours();
  const h12 = h % 12 !== 0 ? h % 12 : 12;
  const day = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][local.getUTCDay()];
  const month = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][local.getUTCMonth()];
  const mm = String(local.getUTCMinutes()).padStart(2, '0');
  return `${day} ${local.getUTCDate()} ${month}, ${h12}:${mm} ${h < 12 ? 'am' : 'pm'} ${slot.zone}`;
}
