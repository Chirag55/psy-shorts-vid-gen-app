/**
 * The punchy (P) and calm (C) Short styles, and the test between them.
 */

export type StyleProfile = 'P' | 'C';
export type Mood = 'warm' | 'dark';

/** Calm Shorts hold each picture this long… */
export const CALM_SHOT_SECONDS = 4;
/** …and never longer than this. */
export const CALM_SHOT_MAX_SECONDS = 9;
/** Calm Shorts keep Hoot off the first and last seconds. */
export const CALM_HOOT = { firstSeconds: 3, lastSeconds: 2 };
/** Words per caption phrase in a calm Short. */
export const CALM_CAPTION_WORDS = 6;
/** A gap in "stayed to watch" bigger than this many points is a signal. */
export const SIGNAL_POINTS = 10;
/** Shorts each style needs before the comparison concludes anything. */
export const ARM_MIN = 5;
/** Voice speed for a calm Short. */
export const CALM_VOICE_SPEED = 0.88;

export interface ShortStyle {
  profile: StyleProfile;
  captionMode: 'word' | 'phrase';
  music: boolean;
  endingMode: 'signoff_question';
  mood: Mood;
}

export function paceFor(voicePace: string | undefined, style?: { profile?: StyleProfile } | null): 'calm' | 'normal' {
  return style?.profile === 'C' || voicePace === 'calm' ? 'calm' : 'normal';
}

export function moodFor(profile: StyleProfile, mood: Mood, override?: Mood | null): Mood {
  return override ?? (profile === 'C' ? 'dark' : mood);
}

/** When Hoot is hidden: all of it when off, the last seconds for an end card, or a delayed entry. */
export function hootHiddenSpans(
  mode: string,
  durationSeconds: number,
  delaySeconds: number,
): { start: number; end: number }[] {
  if (mode === 'off') return [{ start: 0, end: durationSeconds }];
  if (mode === 'endcard') return [{ start: 0, end: Math.max(0, durationSeconds - CALM_HOOT.lastSeconds) }];
  return delaySeconds > 0 ? [{ start: 0, end: delaySeconds }] : [];
}

export function styleFor(profile: StyleProfile, mood: Mood = 'warm'): ShortStyle {
  return profile === 'C'
    ? { profile, captionMode: 'phrase', music: true, endingMode: 'signoff_question', mood }
    : { profile, captionMode: 'word', music: false, endingMode: 'signoff_question', mood };
}

/** A bank entry's mood: its own, or dark for the defense pillar. */
export function moodOf(e: { mood?: string; pillar?: string }): Mood {
  if (e.mood === 'warm' || e.mood === 'dark') return e.mood;
  return e.pillar === 'Manipulation & Defense' ? 'dark' : 'warm';
}

/** Alternates the style from the most recent styled Short. */
export function nextProfile(projects: { mode: string; style?: ShortStyle; createdAt: number }[]): StyleProfile {
  const last = projects.filter((p) => p.mode === 'short' && p.style).sort((a, b) => b.createdAt - a.createdAt)[0];
  if (!last) return 'C';
  return last.style?.profile === 'C' ? 'P' : 'C';
}

const median = (xs: number[]) => {
  if (!xs.length) return undefined;
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  const m = s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
  return Math.round(m * 10) / 10;
};
const mean = (xs: number[]) => (xs.length ? Math.round((xs.reduce((a, b) => a + b, 0) / xs.length) * 10) / 10 : undefined);

export interface ProfileRow {
  profile: StyleProfile;
  stayed?: number;
  viewed?: number;
}

export function compareProfiles(rows: ProfileRow[]) {
  const arm = (profile: StyleProfile) => {
    const mine = rows.filter((r) => r.profile === profile);
    const stayed = mine.filter((r) => r.stayed !== undefined).map((r) => r.stayed as number);
    const viewed = mine.filter((r) => r.viewed !== undefined).map((r) => r.viewed as number);
    return { n: stayed.length, median: median(stayed), avgViewed: mean(viewed) };
  };
  const P = arm('P');
  const C = arm('C');
  const ready = P.n >= ARM_MIN && C.n >= ARM_MIN;
  const head = `Stayed to watch, median: P (punchy) ${P.median ?? '–'}% over ${P.n}, C (calm) ${C.median ?? '–'}% over ${C.n}.`;
  let summary: string;
  if (!ready) {
    summary = `${head} Nothing is concluded until each style has ${ARM_MIN} Shorts with a 72-hour reading (P ${P.n}, C ${C.n}).`;
  } else {
    const gap = Math.round(Math.abs((P.median as number) - (C.median as number)) * 10) / 10;
    const leader: StyleProfile = (P.median as number) > (C.median as number) ? 'P' : 'C';
    summary =
      gap > SIGNAL_POINTS
        ? `${head} ${leader} is ahead by ${gap} points: a signal. Compare average percentage viewed next, keep the winner as the default and do not mix variables after that.`
        : `${head} The gap is ${gap} points, under ${SIGNAL_POINTS}: noise at this size. Repeat the test.`;
  }
  return { P, C, ready, summary };
}
