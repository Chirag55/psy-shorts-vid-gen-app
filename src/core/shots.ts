/**
 * Shot lists for Shorts: each beat is cut into several shots so the video never
 * reads as one held frame. Character shots that matter are Flow clips; cutaways
 * and inserts are stills, which cost a fraction and still move on screen.
 */
export const MIN_SHOTS = 4;
export const DEFAULT_CLIP_BUDGET = 3;
export const MAX_SHOT_SECONDS = 3;

/** Poses, not actions: a shot built on one of these reads as a still photo. */
export const STATIC_VERBS = [
  'sitting', 'sits', 'standing', 'stands', 'stirring', 'stirs', 'sipping', 'sips', 'resting', 'rests',
  'looking at camera', 'looks at camera', 'staring', 'stares', 'holding', 'holds', 'waiting', 'waits',
  'posing', 'poses', 'at her desk', 'at his desk', 'at their desk',
];

export const ACTION_VERBS = [
  'flips through', 'taps', 'slides', 'points at', 'reacts to', 'snaps toward', 'leans in', 'recoils from',
  'sweeps aside', 'snatches', 'pushes away', 'spins to face',
];

export type ShotSource = 'clip' | 'still';

export interface Shot {
  source: ShotSource;
  setting: string;
  subject: string;
  action: string;
  durationSec: number;
  isCutaway: boolean;
  clipPrompt?: string;
  stillPrompt?: string;
  /** Re-uses another shot's asset (its key) instead of generating a new one. */
  reuse?: string;
  /** Which beat a shot belongs to when it was planned outside a beat. */
  beat?: string;
  /** Continues the previous shot's asset: the render joins them into one hold. */
  continues?: boolean;
  [extra: string]: unknown;
}

export interface BeatWithShots {
  kind: string;
  text?: string;
  clipPrompt?: string;
  shots?: Shot[];
}

export interface FlatShot {
  beatIndex: number;
  shotIndex: number;
  flatIndex: number;
  beatKind: string;
  shot: Shot;
}

/** Every shot of every beat in order; a beat with no shot list becomes one clip shot. */
export function flattenShots(script: { beats: BeatWithShots[] }): FlatShot[] {
  const out: FlatShot[] = [];
  let flat = 0;
  script.beats.forEach((beat, beatIndex) => {
    const shots: Shot[] = beat.shots?.length
      ? beat.shots
      : beat.clipPrompt
        ? [{ source: 'clip', setting: '', subject: '', action: '', durationSec: 0, isCutaway: false, clipPrompt: beat.clipPrompt }]
        : [];
    shots.forEach((shot, shotIndex) => {
      out.push({ beatIndex, shotIndex, flatIndex: flat++, beatKind: beat.kind, shot });
    });
  });
  return out;
}

export function assetKeyFor(key: string, shot: Shot): string {
  return `short_${shot.reuse ?? key}`;
}

export function clipKeyFor(key: string): string {
  return `short_${key}`;
}

function usesStaticVerb(action: string): string | null {
  const a = action.toLowerCase();
  return STATIC_VERBS.find((v) => a.includes(v)) ?? null;
}

export interface ShotAudit {
  shotCount: number;
  cutawayCount: number;
  clipCount: number;
  stillCount: number;
  settings: string[];
  warnings: string[];
}

export function auditShots(script: { beats: BeatWithShots[] }, clipBudget: number = DEFAULT_CLIP_BUDGET): ShotAudit {
  const all = flattenShots(script);
  const own = all.filter((f) => f.shot.reuse === undefined);
  const warnings: string[] = [];
  const settings = [...new Set(own.map((f) => f.shot.setting.trim().toLowerCase()).filter(Boolean))];
  const cutawayCount = own.filter((f) => f.shot.isCutaway).length;
  const clipCount = own.filter((f) => f.shot.source === 'clip').length;
  const stillCount = own.length - clipCount;

  if (clipCount > clipBudget) {
    warnings.push(`${clipCount} shots need generated video but the budget is ${clipBudget}. Cutaways and simple inserts should be stills — they cost a fraction and still move on screen.`);
  }
  const wanted = Math.min(clipBudget, own.filter((f) => !f.shot.isCutaway).length);
  if (clipCount < wanted) {
    warnings.push(`Only ${clipCount} of ${clipBudget} budgeted clip${clipBudget === 1 ? '' : 's'} used. Switch a character shot to "clip" — ideally the hook — or the Short will lean on stills.`);
  }
  for (const f of own) {
    if (f.shot.isCutaway && f.shot.source === 'clip' && f.shot.beat === undefined) {
      warnings.push(`Shot ${f.flatIndex + 1} is a cutaway but asks for video. A prop or screen works as a still and costs far less.`);
    }
  }
  if (clipBudget > 0 && own.length && own[0].shot.source === 'still') {
    const hookHasClip = own.some((f) => f.beatIndex === 0 && f.shot.source === 'clip');
    warnings.push(
      hookHasClip
        ? 'The hook opens on a still. The render moves its clip to the front, so frame 0 moves.'
        : "The hook has no video clip, so frame 0 is a still. Make the hook's first shot a clip.",
    );
  }
  if (all.length < MIN_SHOTS) {
    warnings.push(`Only ${all.length} shot${all.length === 1 ? '' : 's'} — a Short needs at least ${MIN_SHOTS} to stop reading as one held frame.`);
  }
  if (!cutawayCount && own.length > 1) {
    warnings.push('No cutaway. At least one shot should leave the character entirely — a prop, a screen, a hand — or the video looks filmed in one take.');
  }
  if (settings.length < 2 && own.length > 1) {
    warnings.push('Every shot is in the same setting. Two or three micro-locations keep the eye moving.');
  }
  for (const f of own) {
    const verb = usesStaticVerb(f.shot.action);
    if (verb) {
      warnings.push(`Shot ${f.flatIndex + 1} is a pose, not an action: "${verb}". Use something that changes, like "${ACTION_VERBS[f.flatIndex % ACTION_VERBS.length]}".`);
    }
    if (f.shot.durationSec > MAX_SHOT_SECONDS) {
      warnings.push(`Shot ${f.flatIndex + 1} holds for ${f.shot.durationSec}s; nothing should sit longer than ${MAX_SHOT_SECONDS}s without cutting.`);
    }
  }
  return { shotCount: own.length, cutawayCount, clipCount, stillCount, settings, warnings };
}

/** Merges a shot that `continues` the previous one on the same asset into a single longer hold. */
export function joinHeldShots<T extends { uri: string; shot: Shot }>(items: T[]): T[] {
  const out: T[] = [];
  for (const it of items) {
    const prev = out[out.length - 1];
    if (prev && it.shot.continues && prev.uri === it.uri) {
      out[out.length - 1] = { ...prev, shot: { ...prev.shot, durationSec: prev.shot.durationSec + it.shot.durationSec } };
    } else {
      out.push(it);
    }
  }
  return out;
}
