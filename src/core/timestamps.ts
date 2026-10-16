import type { LongScript } from './types';
import { estimateDuration } from './guardrails';

/** Chapters shorter than this merge into the next (or the previous, at the end). */
export const MIN_CHAPTER_SECONDS = 10;
/** YouTube only shows chapters when there are at least this many. */
export const MIN_CHAPTERS = 3;

/** Formats seconds as the M:SS / H:MM:SS that YouTube parses into chapter markers. */
export function ytTimestamp(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}

/** Chapter start times, with segments under MIN_CHAPTER_SECONDS folded into a neighbour. */
export function chapterMarkers(script: LongScript, durations?: Record<string, number>): { at: number; title: string }[] {
  const durationOf = (key: string, text: string) => durations?.[key] ?? estimateDuration(text);
  const segments = [
    ...(script.coldOpen.trim() ? [{ title: 'Cold Open', seconds: durationOf('0', script.coldOpen) }] : []),
    ...script.chapters.map((c) => ({
      title: c.title,
      seconds: durations?.[String(c.index)] ?? estimateDuration(c.narration),
    })),
    ...(script.closingSynthesis.trim()
      ? [{ title: 'Closing Synthesis', seconds: durationOf('99', script.closingSynthesis) }]
      : []),
  ];
  const merged: { title: string; seconds: number }[] = [];
  let carry = 0;
  segments.forEach((s, i) => {
    const seconds = s.seconds + carry;
    if (seconds < MIN_CHAPTER_SECONDS && i !== segments.length - 1) {
      carry = seconds;
      return;
    }
    carry = 0;
    if (seconds < MIN_CHAPTER_SECONDS && merged.length) merged[merged.length - 1].seconds += seconds;
    else merged.push({ title: s.title, seconds });
  });
  const out: { at: number; title: string }[] = [];
  let at = 0;
  for (const m of merged) {
    out.push({ at: Math.floor(at), title: m.title });
    at += m.seconds;
  }
  return out;
}

/** The YouTube chapter list, or '' when there would be too few chapters to show. */
export function buildChapterTimestamps(script: LongScript, durations?: Record<string, number>): string {
  const markers = chapterMarkers(script, durations);
  if (markers.length < MIN_CHAPTERS) return '';
  return markers.map((m) => `${ytTimestamp(m.at)} ${m.title}`).join('\n');
}

/** Assembles the full YouTube description: summary, chapters, then tags. */
export function buildDescription(script: LongScript, durations?: Record<string, number>): string {
  const chapters = buildChapterTimestamps(script, durations);
  return [
    script.coldOpen,
    '',
    ...(chapters ? ['CHAPTERS', chapters, ''] : []),
    'Stay curious.',
    '',
    script.tags.map((t) => `#${t.replace(/[^A-Za-z0-9]/g, '')}`).join(' '),
  ].join('\n');
}
