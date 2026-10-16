import type { WordTiming } from './types';
import { HOOK_SHELLS, hookShell, type ViralityCheck } from './virality';

/** When the retention snapshots are taken, after publishing. */
export const SNAPSHOT_AFTER = { h48: 259200000, d7: 604800000 };
/** Tagged Shorts before the catchphrase comparison shows. */
export const CATCHPHRASE_TEST_SHORTS = 14;

export interface RetentionSnapshot {
  averageViewPercentage: number;
  [key: string]: unknown;
}

export interface RetentionVideo {
  videoId: string;
  title: string;
  hook?: string;
  variant?: string;
  hookVariant?: string;
  averageViewPercentage: number;
  auditScore?: number;
  checks: ViralityCheck[];
}

const mmss = (seconds: number) => `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`;
const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : undefined);
const round1 = (x: number | undefined) => (x !== undefined ? Math.round(x * 10) / 10 : undefined);
const SENTENCE_END = /[.?!]["”')]*$/;

/** Which snapshot is due now, if any. */
export function snapshotDue(
  publishedMs: number,
  snapshots: { h48?: unknown; d7?: unknown } | undefined | null,
  now: Date,
): 'h48' | 'd7' | null {
  const age = now.getTime() - publishedMs;
  if (!Number.isFinite(age) || age < SNAPSHOT_AFTER.h48) return null;
  if (age >= SNAPSHOT_AFTER.d7) return snapshots?.d7 ? null : 'd7';
  return snapshots?.h48 ? null : 'h48';
}

export function bestSnapshot<T>(snapshots: { h48?: T; d7?: T } | undefined | null): T | undefined {
  return snapshots?.d7 ?? snapshots?.h48;
}

/** The spoken sentence at a moment of the voice. */
export function sentenceAt(words: WordTiming[], seconds: number): string {
  if (!words.length) return '';
  const t = words[0].start + seconds;
  let i = words.findIndex((w) => t >= w.start && t <= w.end + 0.15);
  if (i < 0) i = Math.max(0, words.findIndex((w) => w.start > t) - 1);
  if (i < 0) i = words.length - 1;
  let start = i;
  while (start > 0 && !SENTENCE_END.test(words[start - 1].word)) start--;
  let end = i;
  while (end < words.length - 1 && !SENTENCE_END.test(words[end].word)) end++;
  return words
    .slice(start, end + 1)
    .map((w) => w.word)
    .join(' ');
}

/** The steepest fall in an audience-retention curve, and what was being said. */
export function retentionDrop(
  curve: number[],
  durationSeconds: number,
  words: WordTiming[],
): { at: number; points: number; line: string; text: string } | null {
  if (curve.length < 3 || !(durationSeconds > 0)) return null;
  let best = 0;
  let index = -1;
  for (let i = 1; i < curve.length; i++) {
    const drop = curve[i - 1] - curve[i];
    if (drop > best) {
      best = drop;
      index = i;
    }
  }
  if (index < 0 || best <= 0) return null;
  const at = (index / curve.length) * durationSeconds;
  const line = sentenceAt(words, at);
  return {
    at,
    points: Math.round(best * 1000) / 10,
    line,
    text: `Viewers left at ${mmss(at)}${line ? ` during: "${line}"` : ''}.`,
  };
}

/** Published projects with a retention snapshot. */
export function retentionVideos(projects: any[], mode: 'short' | 'long' = 'short'): RetentionVideo[] {
  const out: RetentionVideo[] = [];
  for (const p of projects) {
    const snap = bestSnapshot<RetentionSnapshot>(p.virality?.snapshots);
    const videoId = p.assets.youtubeVideoId;
    if (p.mode !== mode || !snap || !videoId) continue;
    out.push({
      videoId,
      title: p.script.title,
      hook: p.virality?.hook ?? (p.mode === 'short' ? p.script.beats[0]?.text : undefined),
      variant: p.virality?.variant,
      ...(p.hookVariant ? { hookVariant: p.hookVariant } : {}),
      averageViewPercentage: snap.averageViewPercentage,
      auditScore: p.virality?.audit?.score,
      checks: p.virality?.audit?.checks ?? [],
    });
  }
  return out;
}

export interface CorrelationRow {
  id: string;
  passed: number;
  failed: number;
  avgWhenPassed?: number;
  avgWhenFailed?: number;
  delta?: number;
}

/** For each audit check, retention when it passed against when it didn't. */
export function correlationTable(videos: RetentionVideo[]): CorrelationRow[] {
  const ids = [...new Set(videos.flatMap((v) => v.checks.map((c) => c.id)))];
  return ids
    .map((id) => {
      const passed = videos
        .filter((v) => v.checks.find((c) => c.id === id)?.status === 'pass')
        .map((v) => v.averageViewPercentage);
      const failed = videos
        .filter((v) => v.checks.some((c) => c.id === id && c.status !== 'pass'))
        .map((v) => v.averageViewPercentage);
      const whenPassed = avg(passed);
      const whenFailed = avg(failed);
      return {
        id,
        passed: passed.length,
        failed: failed.length,
        avgWhenPassed: round1(whenPassed),
        avgWhenFailed: round1(whenFailed),
        ...(whenPassed !== undefined && whenFailed !== undefined
          ? { delta: Math.round((whenPassed - whenFailed) * 10) / 10 }
          : {}),
      };
    })
    .sort(
      (a, b) =>
        (b.delta ?? -Infinity) - (a.delta ?? -Infinity) || a.id.localeCompare(b.id, undefined, { numeric: true }),
    );
}

/** Retention by hook shell. */
export function hookShellTable(videos: RetentionVideo[]) {
  return HOOK_SHELLS.map((s) => {
    const vs = videos.filter((v) => v.hook && hookShell(v.hook) === s.id).map((v) => v.averageViewPercentage);
    return { id: s.id, label: s.label, videos: vs.length, avg: round1(avg(vs)) ?? 0 };
  })
    .filter((r) => r.videos)
    .sort((a, b) => b.avg - a.avg);
}

/** The catchphrase ending against the loop ending. */
export function catchphraseTest(videos: RetentionVideo[]) {
  const tagged = videos.filter((v) => v.variant);
  const withIt = tagged.filter((v) => v.variant === 'catchphrase').map((v) => v.averageViewPercentage);
  const without = tagged.filter((v) => v.variant === 'loop').map((v) => v.averageViewPercentage);
  const ready = tagged.length >= CATCHPHRASE_TEST_SHORTS && withIt.length > 0 && without.length > 0;
  const a = round1(avg(withIt));
  const b = round1(avg(without));
  const winner: 'catchphrase' | 'loop' | undefined =
    ready && a !== undefined && b !== undefined ? (a >= b ? 'catchphrase' : 'loop') : undefined;
  return {
    ready,
    with: { n: withIt.length, avg: a },
    without: { n: without.length, avg: b },
    winner,
    advice: !ready
      ? `${tagged.length} of ${CATCHPHRASE_TEST_SHORTS} Shorts tagged so far; the comparison appears after ${CATCHPHRASE_TEST_SHORTS}.`
      : winner !== 'catchphrase'
        ? `Without it wins (${b}% against ${a}%): make the loop ending the default and keep Hoot on screen as the signature.`
        : `With the catchphrase wins (${a}% against ${b}%): keep it as the default.`,
  };
}

export function topBottomHooks(videos: RetentionVideo[], n = 5) {
  const sorted = videos.filter((v) => v.hook).sort((a, b) => b.averageViewPercentage - a.averageViewPercentage);
  return { top: sorted.slice(0, n), bottom: sorted.length > n ? sorted.slice(-n).reverse() : [] };
}

/** A prompt note on which hooks held viewers and which lost them. */
export function hookContext(videos: RetentionVideo[], n = 5): string {
  const { top, bottom } = topBottomHooks(videos, n);
  if (!top.length) return '';
  const line = (v: RetentionVideo) => `- "${(v.hook ?? '').slice(0, 90)}" (${Math.round(v.averageViewPercentage)}% viewed)`;
  return [
    'Hooks that held viewers (average % viewed), imitate their shape:',
    ...top.map(line),
    ...(bottom.length ? ['Hooks that lost viewers, avoid their shape:', ...bottom.map(line)] : []),
  ].join('\n');
}
