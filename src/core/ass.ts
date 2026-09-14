import type { WordTiming } from './types';
import { groupIntoPhrases } from './alignment';

/**
 * Advanced Sub Station (ASS) subtitle generation — spec §6.2.
 *
 * Two flavours:
 *  - Short-form: word-level kinetic highlighting on a 1080x1920 canvas.
 *  - Long-form:  phrase-level chunks of 3-5 words on a 1920x1080 canvas.
 *
 * Colours are ASS BGR hex, not RGB: &H0000FFFF& is neon yellow, &H00FFFFFF&
 * is white.
 */

const NEON_YELLOW = '&H0000FFFF&';
const WHITE = '&H00FFFFFF&';

/** ASS timestamps are H:MM:SS.cc — centiseconds, single-digit hour, no padding. */
export function assTime(seconds: number): string {
  const total = Math.max(0, seconds);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = Math.floor(total % 60);
  const cs = Math.round((total - Math.floor(total)) * 100);
  // Rounding centiseconds can carry into the next second; clamp rather than carry.
  const csClamped = Math.min(99, cs);
  const pad = (n: number, w = 2) => String(n).padStart(w, '0');
  return `${h}:${pad(m)}:${pad(s)}.${pad(csClamped)}`;
}

/** Text placed in a Dialogue line must not contain raw braces or newlines. */
function escapeAssText(text: string): string {
  return text.replace(/\\/g, '\\\\').replace(/\{/g, '\\{').replace(/\}/g, '\\}').replace(/\r?\n/g, ' ');
}

function header(playResX: number, playResY: number, fontSize: number, marginV: number): string {
  return `[Script Info]
ScriptType: v4.00+
PlayResX: ${playResX}
PlayResY: ${playResY}
WrapStyle: 2
ScaledBorderAndShadow: yes

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,Anton,${fontSize},${WHITE},&H000000FF,&H00000000,&H80000000,-1,0,0,0,100,100,0,0,1,6,3,2,60,60,${marginV},1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
`;
}

/**
 * Short-form word-level kinetic subtitles.
 *
 * One Dialogue line is emitted per word. Each line renders the whole phrase but
 * recolours only the word that is currently being spoken, which is what produces
 * the karaoke-style highlight without needing \k timing.
 */
export function buildShortFormAss(words: WordTiming[], opts?: { phraseSize?: number; fontSize?: number; marginV?: number }): string {
  const phraseSize = opts?.phraseSize ?? 4;
  const fontSize = opts?.fontSize ?? 58;
  const marginV = opts?.marginV ?? 320;

  let out = header(1080, 1920, fontSize, marginV);
  const phrases = groupIntoPhrases(words, phraseSize);

  for (const phrase of phrases) {
    for (let i = 0; i < phrase.length; i++) {
      const active = phrase[i];
      const rendered = phrase
        .map((w, j) =>
          j === i
            ? `{\\c${NEON_YELLOW}}${escapeAssText(w.word)}{\\c${WHITE}}`
            : escapeAssText(w.word)
        )
        .join(' ');

      // Hold the line until the next word starts so there is never a blank frame
      // mid-phrase; the final word holds until its own end time.
      const end = i + 1 < phrase.length ? phrase[i + 1].start : active.end;
      out += `Dialogue: 0,${assTime(active.start)},${assTime(Math.max(end, active.start + 0.05))},Default,,0,0,0,,${rendered}\n`;
    }
  }

  return out;
}

/**
 * Long-form phrase-level subtitles. MarginV 140 keeps the text clear of the
 * YouTube scrub bar.
 */
export function buildLongFormAss(words: WordTiming[], opts?: { phraseSize?: number; fontSize?: number; marginV?: number }): string {
  const phraseSize = opts?.phraseSize ?? 4;
  const fontSize = opts?.fontSize ?? 46;
  const marginV = opts?.marginV ?? 140;

  let out = header(1920, 1080, fontSize, marginV);
  const phrases = groupIntoPhrases(words, phraseSize);

  for (const phrase of phrases) {
    if (!phrase.length) continue;
    const start = phrase[0].start;
    const end = phrase[phrase.length - 1].end;
    const text = phrase.map((w) => escapeAssText(w.word)).join(' ');
    out += `Dialogue: 0,${assTime(start)},${assTime(Math.max(end, start + 0.2))},Default,,0,0,0,,${text}\n`;
  }

  return out;
}

/**
 * Shifts every timing by `offset` seconds. Chapters are synthesised
 * independently, so their alignments all start at 0 and need rebasing before
 * they can be burned onto a concatenated timeline.
 */
export function offsetWords(words: WordTiming[], offset: number): WordTiming[] {
  return words.map((w) => ({ ...w, start: w.start + offset, end: w.end + offset }));
}
