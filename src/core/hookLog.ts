import { hookCardText, hookStyleOf } from './hooks';
import { bestSnapshot } from './retention';
import { compareProfiles, type StyleProfile } from './styleProfiles';

/** Shorts per arm before a hook variant is called. */
export const HOOK_LOG_MIN = 5;
/** Stayed-to-watch is read this many hours after publishing. */
export const READ_AFTER_HOURS = 72;
export const HOUR_MS = 3600000;
/** Studio's stayed-to-watch for classic Shorts before scene-first. */
export const CLASSIC_BASELINE = 39.6;
/** Bank schema that introduced scene-first Shorts. */
export const SCENE_FIRST_SCHEMA = '2.5';
/** Readings before stayed-to-watch feeds the planner. */
export const FEEDBACK_MIN = 8;

export type HookArm = 'A' | 'B';
export type ShortFormatKind = 'scene-first' | 'classic';

export interface HookLogRow {
  projectId: string;
  title: string;
  hookText?: string;
  hookStyle: 'pov' | 'label';
  hookType?: string;
  profile?: StyleProfile;
  captionMode?: string;
  music?: string;
  endingMode?: string;
  publishTime: string;
  publishedAt: number;
  arm: HookArm;
  format: ShortFormatKind;
  stayed?: number;
  viewed?: number;
  /** No reading yet and old enough to have one. */
  due: boolean;
}

export const armOf = (variant?: string): HookArm => (variant === 'alt' ? 'B' : 'A');

export function formatOf(script: { bankV2?: { sourceLine?: string; visualBeats?: unknown[] } | null }): ShortFormatKind {
  return script.bankV2?.sourceLine || script.bankV2?.visualBeats?.length ? 'scene-first' : 'classic';
}

const median = (xs: number[]): number | undefined => {
  if (!xs.length) return undefined;
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  const m = s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
  return Math.round(m * 10) / 10;
};

/** Published Shorts with their hook, arm, format and 72-hour reading, newest first. */
export function hookLogRows(projects: any[], now: number): HookLogRow[] {
  return projects
    .filter((p) => p.mode === 'short' && p.assets.youtubeVideoId && p.assets.publishedAt)
    .map((p): HookLogRow => {
      const publishedAt: number = p.assets.publishedAt;
      const snap = bestSnapshot<any>(p.virality?.snapshots);
      const stayed: number | undefined = p.stayedToWatch?.percent ?? snap?.viewedPercent;
      return {
        ...(p.style
          ? {
              profile: p.style.profile,
              captionMode: p.style.captionMode,
              music: p.style.music,
              endingMode: p.style.endingMode,
            }
          : {}),
        hookText: p.script.bankV2 ? hookCardText(p.script) : p.script.hookText,
        hookStyle: hookStyleOf(p.script),
        ...(p.virality?.hookShell ? { hookType: p.virality.hookShell } : {}),
        publishTime: new Date(publishedAt).toISOString(),
        ...(snap && snap.averageViewPercentage > 0 ? { viewed: snap.averageViewPercentage } : {}),
        projectId: p.id,
        title: p.publish.title || p.script.title,
        arm: armOf(p.hookVariant),
        format: formatOf(p.script),
        publishedAt,
        ...(stayed === undefined ? {} : { stayed }),
        due: stayed === undefined && now - publishedAt >= READ_AFTER_HOURS * HOUR_MS,
      };
    })
    .sort((a, b) => b.publishedAt - a.publishedAt);
}

/** Monday of the UTC week, as YYYY-MM-DD. */
export function weekOf(t: number): string {
  const d = new Date(t);
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - ((d.getUTCDay() + 6) % 7)))
    .toISOString()
    .slice(0, 10);
}

interface ArmStat {
  n: number;
  median?: number;
}

export function summariseHookLog(rows: HookLogRow[]) {
  const read = rows.filter((r) => r.stayed !== undefined);
  const arm = (a: HookArm, list: HookLogRow[] = read): ArmStat => {
    const xs = list.filter((r) => r.arm === a).map((r) => r.stayed as number);
    return { n: xs.length, median: median(xs) };
  };
  const weeks = [...new Set(read.map((r) => weekOf(r.publishedAt)))]
    .sort()
    .reverse()
    .map((week) => {
      const list = read.filter((r) => weekOf(r.publishedAt) === week);
      const a = arm('A', list);
      const b = arm('B', list);
      return {
        week,
        ...(a.n ? { A: { n: a.n, median: a.median } } : {}),
        ...(b.n ? { B: { n: b.n, median: b.median } } : {}),
      } as { week: string; A?: ArmStat; B?: ArmStat };
    });
  const A = arm('A');
  const B = arm('B');
  const ready = A.n >= HOOK_LOG_MIN && B.n >= HOOK_LOG_MIN;
  const head = `Stayed to watch, median: A (default hook) ${A.median ?? '–'}% over ${A.n}, B (alternate) ${B.median ?? '–'}% over ${B.n}.`;
  let summary: string;
  if (!ready) {
    summary = `${head} No variant is called until each has ${HOOK_LOG_MIN} Shorts (A ${A.n}, B ${B.n}).`;
  } else {
    const gap = Math.round(Math.abs((A.median as number) - (B.median as number)) * 10) / 10;
    summary =
      head +
      (gap < 1
        ? ' About equal.'
        : ` ${(A.median as number) > (B.median as number) ? 'A' : 'B'} is ahead by ${gap} points; a proposed lesson only, never applied.`);
  }
  return { weeks, A, B, ready, summary };
}

export function summariseFormats(rows: HookLogRow[]) {
  const read = rows.filter((r) => r.stayed !== undefined);
  const of = (f: ShortFormatKind): ArmStat => {
    const xs = read.filter((r) => r.format === f).map((r) => r.stayed as number);
    return { n: xs.length, median: median(xs) };
  };
  const sceneFirst = of('scene-first');
  const classic = of('classic');
  const ready = sceneFirst.n >= HOOK_LOG_MIN;
  const head = `Stayed to watch, median: scene-first ${sceneFirst.median ?? '–'}% over ${sceneFirst.n}, classic ${classic.median ?? '–'}% over ${classic.n} (Studio's figure before the change: ${CLASSIC_BASELINE}%).`;
  let summary: string;
  if (!ready) {
    summary = `${head} Nothing is concluded until ${HOOK_LOG_MIN} scene-first Shorts have a 72-hour reading (${sceneFirst.n} so far).`;
  } else {
    const d = Math.round(((sceneFirst.median as number) - CLASSIC_BASELINE) * 10) / 10;
    const verdict =
      d >= 1
        ? ` Scene-first is ${d} points above the old ${CLASSIC_BASELINE}%.`
        : d <= -1
          ? ` Scene-first is ${Math.abs(d)} points below the old ${CLASSIC_BASELINE}%.`
          : ` About the same as the old ${CLASSIC_BASELINE}%.`;
    summary = `${head}${verdict} Judge at 72 hours and again at 7 days.`;
  }
  return { sceneFirst, classic, ready, summary };
}

/** The label-banner against POV-banner test, in banner words. */
export function summariseHookStyles(rows: HookLogRow[]) {
  const r = compareProfiles(
    rows.map((x) => ({ profile: (x.hookStyle === 'pov' ? 'C' : 'P') as StyleProfile, stayed: x.stayed, viewed: x.viewed })),
  );
  return {
    ...r,
    summary: r.summary
      .replace('P (punchy)', 'label banner')
      .replace('C (calm)', 'POV banner')
      .replace(/each style/g, 'each banner')
      .replace(/\bP\b(?= \d)/, 'label')
      .replace(/\bC\b(?= \d)/, 'POV')
      .replace(/\b([PC]) is ahead/, (_m, x: string) => `${x === 'P' ? 'Label' : 'POV'} is ahead`),
  };
}

export function summariseProfiles(rows: HookLogRow[]) {
  return compareProfiles(rows.map((r) => ({ profile: r.profile as StyleProfile, stayed: r.stayed, viewed: r.viewed })));
}

export type StayedTone = 'ok' | 'warn' | 'danger' | 'neutral';

/** A project's stayed-to-watch badge. */
export function stayedCell(p: any): { percent?: number; tone: StayedTone; label: string } {
  const percent: number | undefined = p.stayedToWatch?.percent ?? bestSnapshot<any>(p.virality?.snapshots)?.viewedPercent;
  if (percent !== undefined) {
    const tone: StayedTone = percent >= 44.6 ? 'ok' : percent >= 34.6 ? 'warn' : 'danger';
    return { percent, tone, label: `Stayed ${Math.round(percent * 10) / 10}%` };
  }
  return { tone: 'neutral', label: 'Stayed: no data yet' };
}

/** A planner note on stayed-to-watch by hook type, once there are enough readings. */
export function stayedFeedback(rows: HookLogRow[]): string {
  const read = rows.filter((r) => r.stayed !== undefined);
  if (read.length < FEEDBACK_MIN) return '';
  const byType = new Map<string, number[]>();
  for (const r of read) {
    if (r.hookType) byType.set(r.hookType, [...(byType.get(r.hookType) ?? []), r.stayed as number]);
  }
  const types = [...byType.entries()]
    .filter(([, xs]) => xs.length >= 2)
    .map(([type, xs]) => ({ type, n: xs.length, median: median(xs) as number }))
    .sort((a, b) => b.median - a.median);
  const all = median(read.map((r) => r.stayed as number));
  if (types.length >= 2) {
    const best = types[0];
    const worst = types[types.length - 1];
    return `\n\nSTAYED TO WATCH (72 h, ${read.length} Shorts): median ${all}%. Best hook type: ${best.type} (${best.median}% over ${best.n}). Weakest: ${worst.type} (${worst.median}% over ${worst.n}). Evidence, not a template.`;
  }
  return `\n\nSTAYED TO WATCH (72 h, ${read.length} Shorts): median ${all}%.`;
}
