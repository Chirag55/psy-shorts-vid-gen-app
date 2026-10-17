import { DEEP_DIVE_SIGN_OFF } from './bankScript';

/** A Short with its spoken beats replaced by the user's edits; blank edits keep the original. */
export function applyShortEdits<S extends { beats: { text: string }[] }>(script: S, edits: string[]) {
  return {
    ...script,
    beats: script.beats.map((b, i) => ({ ...b, text: (edits[i] ?? b.text).trim() || b.text })),
    scriptSource: 'edited',
  };
}

/** A long video with the cold open, chapter narration and closing replaced by the user's edits. */
export function applyLongEdits<S extends { coldOpen: string; chapters: { narration: string }[]; closingSynthesis: string }>(
  script: S,
  edits: { coldOpen: string; chapters: string[]; closing: string },
) {
  return {
    ...script,
    coldOpen: edits.coldOpen.trim() || script.coldOpen,
    chapters: script.chapters.map((c, i) => ({ ...c, narration: (edits.chapters[i] ?? c.narration).trim() || c.narration })),
    closingSynthesis: edits.closing.trim() || script.closingSynthesis,
    scriptSource: 'edited',
  };
}

const wordCount = (text: string) => text.trim().split(/\s+/).filter(Boolean).length;

/** The bank's Short script with the edited lines written back, holds untouched. */
export function shortBankScriptFrom(bank: { beats: { beat: string; line?: string }[]; [key: string]: any }, script: { beats: { text: string }[] }) {
  let i = 0;
  const beats = bank.beats.map((b) => (b.beat === 'hold' ? b : { ...b, line: script.beats[i++]?.text ?? b.line }));
  return {
    ...bank,
    source: 'edited',
    beats,
    word_count: wordCount(
      beats
        .filter((b) => b.line)
        .map((b) => b.line)
        .join(' '),
    ),
  };
}

/** The bank's long script with the edited narration written back; the spoken sign-off is not part of the closing. */
export function longBankScriptFrom(
  bank: { chapters: { narration?: string }[]; [key: string]: any },
  script: { coldOpen: string; chapters: { narration: string }[]; closingSynthesis: string },
) {
  const closing = script.closingSynthesis.replace(DEEP_DIVE_SIGN_OFF, '').trim();
  const chapters = bank.chapters.map((c, i) => ({ ...c, narration: script.chapters[i]?.narration ?? c.narration }));
  return {
    ...bank,
    source: 'edited',
    cold_open: script.coldOpen,
    chapters,
    closing,
    word_count: wordCount([script.coldOpen, ...chapters.map((c) => c.narration), closing].join(' ')),
  };
}

/** Audio keys whose spoken text changed, so their voiceover must be redone. */
export function staleAudioKeys(before: any, after: any): string[] {
  if (before.mode === 'short' && after.mode === 'short') {
    return before.beats.some((b: any, i: number) => b.text !== after.beats[i]?.text) ? ['short'] : [];
  }
  if (before.mode !== 'long' || after.mode !== 'long') return [];
  const keys: string[] = [];
  if (before.coldOpen !== after.coldOpen) keys.push('0');
  before.chapters.forEach((c: any, i: number) => {
    if (c.narration !== after.chapters[i]?.narration) keys.push(String(c.index));
  });
  if (before.closingSynthesis !== after.closingSynthesis) keys.push('99');
  return keys;
}
