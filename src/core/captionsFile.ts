import { estimateDuration } from './guardrails';
import { pausedWords } from './screenplayPlan';
import type { LongScript } from './types';

export interface Cue {
  start: number;
  end: number;
  text: string;
}

interface Word {
  word: string;
  start: number;
  end: number;
  [key: string]: unknown;
}

/** Longest caption line YouTube shows comfortably. */
const MAX_CHARS = 84;
/** Longest a single cue stays on screen. */
const MAX_SECONDS = 6;

/** Groups words into cues: a cue ends at a sentence end, or before it gets too long. */
export function cuesFromWords(words: Word[], offset = 0): Cue[] {
  const cues: Cue[] = [];
  let buf: Word[] = [];
  const flush = () => {
    if (!buf.length) return;
    cues.push({
      start: offset + buf[0].start,
      end: offset + buf[buf.length - 1].end,
      text: buf.map((w) => w.word).join(' '),
    });
    buf = [];
  };
  for (const w of words) {
    const joined = [...buf.map((b) => b.word), w.word].join(' ');
    if (buf.length && (joined.length > MAX_CHARS || w.end - buf[0].start > MAX_SECONDS)) flush();
    buf.push(w);
    if (/[.!?]["”’']?$/.test(w.word)) flush();
  }
  flush();
  return cues;
}

/** Cues for the whole long-form video, part by part on the assembled timeline. */
export function longFormCues(
  script: LongScript,
  alignments: Record<string, Word[]>,
  durations?: Record<string, number>,
): Cue[] {
  const parts = [
    ...(script.coldOpen.trim() ? [{ key: '0', text: script.coldOpen }] : []),
    ...script.chapters.map((c) => ({ key: String(c.index), text: c.narration })),
    ...(script.closingSynthesis.trim() ? [{ key: '99', text: script.closingSynthesis }] : []),
  ];
  const cues: Cue[] = [];
  let offset = 0;
  for (const part of parts) {
    const chapter: any = script.chapters.find((c) => String(c.index) === part.key);
    const words = pausedWords(chapter?.cues, alignments[part.key] ?? []);
    cues.push(...cuesFromWords(words, offset));
    offset += durations?.[part.key] ?? estimateDuration(part.text);
  }
  for (let i = 0; i < cues.length - 1; i++) {
    cues[i].end = Math.min(cues[i].end + 0.3, cues[i + 1].start);
  }
  return cues;
}

function stamp(seconds: number): string {
  const ms = Math.max(0, Math.round(seconds * 1000));
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  const pad = (n: number, w = 2) => String(n).padStart(w, '0');
  return `${pad(h)}:${pad(m)}:${pad(s)},${pad(ms % 1000, 3)}`;
}

export function toSrt(cues: Cue[]): string {
  return cues.map((c, i) => `${i + 1}\n${stamp(c.start)} --> ${stamp(c.end)}\n${c.text}\n`).join('\n');
}
