import type { FlowConfig } from './channelConfig';
import { poolPeriod } from './rotation';

/** Flow tries per clip key, and the clips given up as stills. */
export interface FlowLedger {
  tries: Record<string, number>;
  stills: string[];
}

export type ClipState = 'still' | 'ready' | 'offer-still' | 'retry' | 'untried';

export const MAX_TRIES = 2;
export const EMPTY_LEDGER: FlowLedger = { tries: {}, stills: [] };

const STILL_CAMERA = /\s*(Static camera, one slow movement\.|Slow push in\.)\s*/i;
const PUSH_IN = /,?\s*slow push-in\b/i;

const triesOf = (ledger?: FlowLedger | null) => Object.values(ledger?.tries ?? {}).reduce((a, b) => a + b, 0);

/** The flow config for one script: its bank budget, or a cap wide enough for its clips. */
export function flowFor(script: any, cfg: FlowConfig): FlowConfig {
  const budget = script?.bankV2?.flowBudget;
  if (budget && budget > 0) return { ...cfg, longformCap: budget };
  const clips =
    script?.chapters?.reduce(
      (n: number, c: any) => n + (c.visuals ?? []).filter((v: any) => v.kind === 'clip' && !v.reuse).length,
      0,
    ) ?? 0;
  const need = Math.ceil(clips * (cfg.creditsPerClip ?? 20) * 1.5);
  return need > cfg.longformCap ? { ...cfg, longformCap: need } : cfg;
}

export function creditsSpent(ledger: FlowLedger | undefined | null, cfg: FlowConfig): number {
  return triesOf(ledger) * cfg.creditsPerClip;
}

export function creditsPlanned(script: any, cfg: FlowConfig): number {
  const clips = script.chapters.reduce(
    (n: number, c: any) => n + (c.visuals ?? []).filter((v: any) => v.kind === 'clip').length,
    0,
  );
  return clips * cfg.creditsPerClip;
}

/** Whether another Flow try at `key` fits the tries limit and the video's cap. */
export function canTry(
  ledger: FlowLedger | undefined | null,
  key: string,
  cfg: FlowConfig,
): { ok: boolean; reason?: string; remaining: number } {
  const remaining = cfg.longformCap - triesOf(ledger) * cfg.creditsPerClip;
  const tries = ledger?.tries[key] ?? 0;
  if (tries >= MAX_TRIES) {
    return {
      ok: false,
      reason: `This clip has failed ${tries} times. Use a still with a slow zoom instead of a third try.`,
      remaining,
    };
  }
  if (!(cfg.creditsPerClip > remaining)) return { ok: true, remaining };
  const total = triesOf(ledger) * cfg.creditsPerClip + cfg.creditsPerClip;
  return {
    ok: false,
    reason: `Another try would cost ${cfg.creditsPerClip} credits and take this video to ${total}, over its ${cfg.longformCap}-credit cap. Use a still instead, or raise the cap in Settings.`,
    remaining,
  };
}

export function logTry(ledger: FlowLedger | undefined | null, key: string): FlowLedger {
  const l = ledger ?? EMPTY_LEDGER;
  return { ...l, tries: { ...l.tries, [key]: (l.tries[key] ?? 0) + 1 } };
}

export function clipState(ledger: FlowLedger | undefined | null, key: string, imported: boolean): ClipState {
  if (ledger?.stills.includes(key)) return 'still';
  if (imported) return 'ready';
  const tries = ledger?.tries[key] ?? 0;
  if (tries >= MAX_TRIES) return 'offer-still';
  return tries > 0 ? 'retry' : 'untried';
}

/** A clip visual turned into a slow-zoom still. */
export function clipAsStill<T extends { prompt: string }>(v: T): T & { kind: 'still'; kenBurns: 'zoom_in' } {
  return {
    ...v,
    kind: 'still',
    kenBurns: 'zoom_in',
    prompt: v.prompt.replace(STILL_CAMERA, ' ').replace(PUSH_IN, '').trim(),
  };
}

/** The script with the clip at `key` swapped for a still. */
export function fallbackToStill<S extends { chapters: any[] }>(script: S, key: string): S {
  return {
    ...script,
    chapters: script.chapters.map((c) => ({
      ...c,
      visuals: c.visuals?.map((v: any) => (v.kind === 'clip' && v.key === key ? clipAsStill(v) : v)),
    })),
  };
}

export function markStill(ledger: FlowLedger | undefined | null, key: string): FlowLedger {
  const l = ledger ?? EMPTY_LEDGER;
  if (l.stills.includes(key)) return l;
  return { ...l, stills: [...l.stills, key] };
}

export function creditsLine(ledger: FlowLedger | undefined | null, cfg: FlowConfig): string {
  const tries = triesOf(ledger);
  const stills = ledger?.stills.length ?? 0;
  const spent = triesOf(ledger) * cfg.creditsPerClip;
  const stillPart = stills ? `, ${stills} clip${stills === 1 ? '' : 's'} turned into a still` : '';
  return `${spent} of ${cfg.longformCap} credits spent (${tries} ${tries === 1 ? 'try' : 'tries'}${stillPart})`;
}

export interface FlowCostRow {
  id: string;
  title: string;
  spent: number;
  tries: number;
  clips: number;
  imported: number;
  stills: number;
  over: boolean;
}

/** Flow spend per long-form, newest first, and this credit period's total. */
export function flowCostRows(
  projects: any[],
  cfg: FlowConfig,
  now: Date,
): { rows: FlowCostRow[]; periodSpent: number; periodStart: string; pool: number } {
  const periodStart = poolPeriod(new Date(now.getTime()).toISOString().slice(0, 10), cfg.poolResetDay);
  const longs = projects.filter((p) => p.mode === 'long').sort((a, b) => b.createdAt - a.createdAt);
  const rows = longs.map((p) => {
    const script = p.script;
    const keys: string[] = script.chapters.flatMap((c: any) =>
      (c.visuals ?? []).filter((v: any) => v.kind === 'clip').map((v: any) => v.key),
    );
    const spent = triesOf(p.flow) * cfg.creditsPerClip;
    return {
      id: p.id,
      title: script.title,
      spent,
      tries: triesOf(p.flow),
      clips: keys.length,
      imported: keys.filter((k) => p.assets.clips[k]).length,
      stills: p.flow?.stills.length ?? 0,
      over: spent > flowFor(script, cfg).longformCap,
    };
  });
  const periodSpent = longs
    .filter((p) => poolPeriod(new Date(p.createdAt).toISOString().slice(0, 10), cfg.poolResetDay) === periodStart)
    .reduce((sum, p) => sum + triesOf(p.flow) * cfg.creditsPerClip, 0);
  return { rows, periodSpent, periodStart, pool: cfg.monthlyPool };
}
