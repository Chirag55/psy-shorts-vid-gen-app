import type { WordTiming } from './types';
import { groupIntoPhrases } from './alignment';

/**
 * Caption timeline construction.
 *
 * The renderer draws captions as images and FFmpeg composites them, rather than
 * using FFmpeg's `ass` filter. That is not a stylistic choice: every Android
 * FFmpeg build still distributable today is compiled without libass, freetype
 * and fontconfig, so `ass`, `subtitles` and `drawtext` are all unavailable. See
 * docs/FFMPEG.md.
 *
 * This module is the pure half — it decides what text is on screen and when.
 * Actually drawing it lives in services/captionRenderer.ts.
 */

export interface CaptionToken {
  text: string;
  /** True for the word currently being spoken, which gets the neon highlight. */
  active: boolean;
}

export interface CaptionFrame {
  tokens: CaptionToken[];
  start: number;
  end: number;
}

/** A frame with no tokens renders as fully transparent, clearing the caption band. */
export function isBlank(frame: CaptionFrame): boolean {
  return frame.tokens.length === 0;
}

export interface CaptionOptions {
  /** Words per on-screen phrase. */
  phraseSize?: number;
  /**
   * Short form highlights the active word; long form shows a static phrase,
   * because a 3-5 word chunk at 46pt reads better without motion.
   */
  highlightActiveWord?: boolean;
  /** Frames shorter than this are merged forward — sub-frame flashes just strobe. */
  minFrameDuration?: number;
}

/**
 * Converts word timings into a gapless sequence of caption frames.
 *
 * Gapless matters: the frames feed FFmpeg's concat demuxer, which has no notion
 * of "nothing here". Silence has to be represented by an explicit blank frame or
 * the previous caption would hang on screen through it.
 */
export function buildCaptionFrames(words: WordTiming[], opts: CaptionOptions = {}): CaptionFrame[] {
  const phraseSize = opts.phraseSize ?? 4;
  const highlight = opts.highlightActiveWord ?? true;
  const minDuration = opts.minFrameDuration ?? 0.06;

  if (!words.length) return [];

  const phrases = groupIntoPhrases(words, phraseSize);
  const raw: CaptionFrame[] = [];

  for (const phrase of phrases) {
    if (!phrase.length) continue;

    if (!highlight) {
      raw.push({
        tokens: phrase.map((w) => ({ text: w.word, active: false })),
        start: phrase[0].start,
        end: phrase[phrase.length - 1].end,
      });
      continue;
    }

    for (let i = 0; i < phrase.length; i++) {
      // Hold each state until the next word begins so the phrase never blinks
      // out between its own words.
      const end = i + 1 < phrase.length ? phrase[i + 1].start : phrase[i].end;
      raw.push({
        tokens: phrase.map((w, j) => ({ text: w.word, active: j === i })),
        start: phrase[i].start,
        end,
      });
    }
  }

  return fillGaps(mergeShortFrames(raw, minDuration));
}

/**
 * Absorbs frames too short to be seen.
 *
 * Merging backwards into the predecessor is the normal case, but the first
 * frame has no predecessor — so a short opening frame is instead carried
 * forward and absorbed by whichever frame follows it. Without that, a rushed
 * opening word produces a single-digit-millisecond flash.
 */
function mergeShortFrames(frames: CaptionFrame[], minDuration: number): CaptionFrame[] {
  const out: CaptionFrame[] = [];
  let carriedStart: number | null = null;

  for (const frame of frames) {
    const tooShort = frame.end - frame.start < minDuration;
    const previous = out[out.length - 1];

    if (tooShort && previous) {
      previous.end = Math.max(previous.end, frame.end);
      continue;
    }

    if (tooShort && !previous) {
      // Nothing to merge into yet; remember where this frame began so the next
      // one can start there instead.
      carriedStart = carriedStart ?? frame.start;
      continue;
    }

    out.push({ ...frame, start: carriedStart ?? frame.start });
    carriedStart = null;
  }

  // Every frame was too short to stand alone — emit one covering the whole span.
  if (!out.length && frames.length) {
    out.push({ ...frames[frames.length - 1], start: carriedStart ?? frames[0].start });
  }

  return out;
}

/** Inserts blank frames so the timeline is continuous from 0 to the last word. */
function fillGaps(frames: CaptionFrame[]): CaptionFrame[] {
  if (!frames.length) return [];

  const out: CaptionFrame[] = [];
  let cursor = 0;

  for (const frame of frames) {
    if (frame.start > cursor + 0.01) {
      out.push({ tokens: [], start: cursor, end: frame.start });
    }
    // Clamp rather than trust the input: overlapping frames would desync every
    // later caption from the audio.
    const start = Math.max(cursor, frame.start);
    const end = Math.max(start, frame.end);
    out.push({ ...frame, start, end });
    cursor = end;
  }

  return out;
}
