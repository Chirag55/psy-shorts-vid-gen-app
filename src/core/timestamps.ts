import type { LongScript } from './types';
import { estimateDuration } from './guardrails';

/** Formats seconds as the M:SS / H:MM:SS that YouTube parses into chapter markers. */
export function ytTimestamp(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}

/**
 * Builds the YouTube chapter list. YouTube only renders chapters when the first
 * entry is 0:00 and there are at least three of them.
 */
export function buildChapterTimestamps(script: LongScript, durations?: Record<string, number>): string {
  const lines: string[] = [];
  let cursor = 0;

  const durationOf = (key: string, text: string) => durations?.[key] ?? estimateDuration(text);

  lines.push(`${ytTimestamp(0)} Cold Open`);
  cursor += durationOf('0', script.coldOpen);

  script.chapters.forEach((ch, i) => {
    lines.push(`${ytTimestamp(cursor)} ${ch.title}`);
    cursor += durationOf(String(i + 1), ch.narration);
  });

  lines.push(`${ytTimestamp(cursor)} Closing Synthesis`);

  return lines.join('\n');
}

/** Assembles the full YouTube description: summary, chapters, then tags. */
export function buildDescription(script: LongScript, durations?: Record<string, number>): string {
  return [
    script.coldOpen,
    '',
    'CHAPTERS',
    buildChapterTimestamps(script, durations),
    '',
    'Stay curious.',
    '',
    script.tags.map((t) => `#${t.replace(/[^A-Za-z0-9]/g, '')}`).join(' '),
  ].join('\n');
}
