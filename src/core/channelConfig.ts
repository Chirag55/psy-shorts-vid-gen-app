import type { TitleRuleConfig } from './titleRules';

/** Everything about the channel that is a setting rather than code. Times are Asia/Kolkata. */
export interface ScheduleConfig {
  primarySlot: string;
  fallbackSlot: string;
  latestAllowed: string;
  minGapHoursShort: number;
  minGapHoursAny: number;
  longformSlot: string;
  longformWeekday: string;
  timezone: string;
  utcOffsetMinutes: number;
  zoneLabel: string;
}

export interface VerificationConfig {
  statusCheckMinutes: number;
  zeroViewsMinutes: number;
  underperformMinutes: number;
  underperformRatio: number;
}

export interface FlowConfig {
  creditsPerClip: number;
  shortDailyFree: number;
  monthlyPool: number;
  poolResetDay: number;
  longformCredits: number;
  longformCap: number;
}

export interface HookConfig {
  cardSeconds: number;
  maxCardWords: number;
  maxPreRollMs: number;
  silenceThresholdDb: number;
}

export interface PickerConfig {
  maxRapidListInARow: number;
  bestDayFallbackFormat: string;
}

export interface ChannelConfig {
  configVersion: number;
  schedule: ScheduleConfig;
  verification: VerificationConfig;
  flow: FlowConfig;
  titles: TitleRuleConfig;
  hook: HookConfig;
  picker: PickerConfig;
}

export const CHANNEL_CONFIG_VERSION = 5;

export const DEFAULT_CHANNEL_CONFIG: ChannelConfig = {
  configVersion: 5,
  schedule: { primarySlot: '16:30', fallbackSlot: '17:30', latestAllowed: '20:00', minGapHoursShort: 20, minGapHoursAny: 2, longformSlot: '18:30', longformWeekday: 'sat', timezone: 'Asia/Kolkata', utcOffsetMinutes: 330, zoneLabel: 'IST' },
  verification: { statusCheckMinutes: 10, zeroViewsMinutes: 120, underperformMinutes: 360, underperformRatio: 0.25 },
  flow: { creditsPerClip: 20, shortDailyFree: 60, monthlyPool: 1000, poolResetDay: 1, longformCredits: 120, longformCap: 120 },
  titles: {
    maxLength: 60,
    colonWithin: 25,
    leadingWords: 3,
    conceptTerms: [
      'reciprocity', 'scarcity', 'anchoring', 'anchor', 'pratfall', 'foot-in-the-door', 'foot in the door', 'door-in-the-face',
      'cognitive dissonance', 'confirmation bias', 'social proof', 'mirroring', 'chameleon effect', 'gaslighting',
      'intermittent reinforcement', 'belief perseverance', 'thin slicing', 'halo effect', 'framing effect', 'loss aversion',
      'sunk cost', 'bystander effect', 'dunning-kruger', 'spotlight effect', 'zeigarnik', 'benjamin franklin effect',
      'present bias', 'negativity bias', 'projection', 'love bombing', 'mere exposure', 'priming', 'the pratfall effect',
    ],
  },
  hook: { cardSeconds: 3.5, maxCardWords: 6, maxPreRollMs: 50, silenceThresholdDb: -45 },
  picker: { maxRapidListInARow: 2, bestDayFallbackFormat: 'rapid_list' },
};

type PartialConfig = { [K in keyof ChannelConfig]?: K extends 'configVersion' ? number : Partial<ChannelConfig[K]> };

/** Fills missing settings from the defaults and applies the per-version migrations. */
export function withChannelDefaults(saved?: PartialConfig | null): ChannelConfig {
  const s = saved ?? {};
  const d = DEFAULT_CHANNEL_CONFIG;
  const c: ChannelConfig = {
    configVersion: s.configVersion as number,
    schedule: { ...d.schedule, ...s.schedule },
    flow: { ...d.flow, ...s.flow },
    verification: { ...d.verification, ...s.verification },
    titles: { ...d.titles, ...s.titles },
    hook: { ...d.hook, ...s.hook },
    picker: { ...d.picker, ...s.picker },
  };
  const v = s.configVersion ?? 1;
  if (saved && v < 2) {
    c.schedule = { ...c.schedule, longformSlot: '18:30', longformWeekday: 'sat', minGapHoursAny: 2 };
    c.hook = { ...c.hook, cardSeconds: 2 };
    c.titles = { ...c.titles, maxLength: Math.max(c.titles.maxLength, 60) };
  }
  if (saved && v < 3) c.flow = { ...c.flow, longformCredits: d.flow.longformCredits };
  if (saved && v < 4 && c.flow.shortDailyFree === 50) c.flow = { ...c.flow, shortDailyFree: 60 };
  if (saved && v < 5 && c.hook.cardSeconds < 3.5) c.hook = { ...c.hook, cardSeconds: 3.5 };
  c.configVersion = CHANNEL_CONFIG_VERSION;
  return c;
}

export function flowProblems(f: FlowConfig): string[] {
  const out: string[] = [];
  if (!(f.creditsPerClip > 0)) out.push('Credits per clip must be more than 0.');
  if (!(f.shortDailyFree >= 0)) out.push('Free daily credits must be 0 or more.');
  if (!(f.monthlyPool >= 0)) out.push('The monthly pool must be 0 or more.');
  if (!Number.isInteger(f.poolResetDay) || !(f.poolResetDay >= 1) || !(f.poolResetDay <= 28)) out.push('The pool reset day must be 1 to 28.');
  if (!(f.longformCredits > 0)) out.push('Credits per long-form must be more than 0.');
  if (!(f.longformCap >= f.creditsPerClip)) out.push('The cap per long-form must pay for at least one clip.');
  return out;
}

/** How many Short clips the free daily credits pay for. */
export function shortClipCap(f: FlowConfig): number {
  return f.creditsPerClip > 0 ? Math.floor(f.shortDailyFree / f.creditsPerClip) : 0;
}

/** "16:30" → minutes after midnight, or null. */
export function parseClock(text: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(text.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return h * 60 + min;
}

export function scheduleProblems(s: ScheduleConfig): string[] {
  const primary = parseClock(s.primarySlot);
  const fallback = parseClock(s.fallbackSlot);
  const latest = parseClock(s.latestAllowed);
  const longform = parseClock(s.longformSlot);
  const out: string[] = [];
  if (primary === null) out.push('Primary slot must be a time like 16:30.');
  if (fallback === null) out.push('Fallback slot must be a time like 17:30.');
  if (latest === null) out.push('Latest allowed must be a time like 20:00.');
  if (longform === null) out.push('Long-form slot must be a time like 11:00.');
  if (primary !== null && fallback !== null && fallback <= primary) out.push('The fallback slot must be after the primary slot.');
  if (fallback !== null && latest !== null && fallback > latest) out.push('The fallback slot must not be after the latest allowed time.');
  if (!(s.minGapHoursShort >= 0 && s.minGapHoursShort <= 72)) out.push('Hours between Shorts must be 0 to 72.');
  if (!(s.minGapHoursAny >= 0 && s.minGapHoursAny <= 72)) out.push('Hours between a long-form and another video must be 0 to 72.');
  return out;
}
