import type { WordTiming } from './types';

/** The character-level payload ElevenLabs returns alongside the audio. */
export interface ElevenLabsAlignment {
  characters: string[];
  character_start_times_seconds: number[];
  character_end_times_seconds: number[];
}

const round3 = (n: number) => Math.round(n * 1000) / 1000;

/**
 * Port of `alignment_to_words` (spec §6.1).
 *
 * ElevenLabs timestamps every character; the subtitle engine needs word
 * boundaries. Walk the character stream, accumulating into the current word and
 * flushing whenever whitespace is hit.
 */
export function alignmentToWords(alignment: ElevenLabsAlignment): WordTiming[] {
  const chars = alignment.characters ?? [];
  const starts = alignment.character_start_times_seconds ?? [];
  const ends = alignment.character_end_times_seconds ?? [];

  const words: WordTiming[] = [];
  let current: string[] = [];
  let wStart: number | null = null;
  let wEnd = 0;

  const flush = () => {
    if (current.length && wStart !== null) {
      words.push({ word: current.join(''), start: round3(wStart), end: round3(wEnd) });
    }
    current = [];
    wStart = null;
  };

  const n = Math.min(chars.length, starts.length, ends.length);
  for (let i = 0; i < n; i++) {
    const c = chars[i];
    if (/\s/.test(c)) {
      flush();
    } else {
      if (wStart === null) wStart = starts[i];
      current.push(c);
      wEnd = ends[i];
    }
  }
  flush();

  return words;
}

/**
 * Groups words into phrases of `size` for long-form phrase-level subtitles
 * (spec §6.2). Chunks break on sentence-final punctuation so a phrase never
 * straddles two sentences.
 */
export function groupIntoPhrases(words: WordTiming[], size = 4): WordTiming[][] {
  const phrases: WordTiming[][] = [];
  let buffer: WordTiming[] = [];

  for (const w of words) {
    buffer.push(w);
    const endsSentence = /[.!?]["')\]]?$/.test(w.word);
    if (buffer.length >= size || endsSentence) {
      phrases.push(buffer);
      buffer = [];
    }
  }
  if (buffer.length) phrases.push(buffer);

  return phrases;
}
