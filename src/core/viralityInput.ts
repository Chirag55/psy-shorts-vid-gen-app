import { cardFrameSeconds } from './cards';
import { HOOT_DELAYED_ENTRY_SECONDS } from './hooks';
import { timeVisuals } from './hybridPlan';
import { flattenShots } from './shots';
import { pauseSeconds, pausedWords } from './screenplayPlan';
import { chapterMarkers } from './timestamps';
import { shortNarration } from './guardrails';
import type { WordTiming } from './types';
import type { LongAuditInput, ShortAuditInput } from './virality';

/** Seconds a long-form picture may hold before the audit counts it as a new one. */
const HOLD_SECONDS = 8;

export interface ShortMedia {
  durationSeconds: number;
  silences?: { start: number; end: number }[] | null;
  hookCardSeconds?: number;
  captionsOn?: boolean;
  mascotOn?: boolean;
}

/** The catchphrase sign-off is on unless the project says otherwise; by default it follows the bank's ending. */
export function catchphraseOn(project: any): boolean {
  return project.catchphraseOnShort === undefined
    ? project.script.bankV2?.ending === 'SIGNOFF'
    : project.catchphraseOnShort;
}

export function variantOf(project: any): 'catchphrase' | 'loop' {
  return catchphraseOn(project) ? 'catchphrase' : 'loop';
}

export function shortAuditInput(project: any, media: ShortMedia): ShortAuditInput {
  const script = project.script;
  const words: WordTiming[] = project.assets.alignment.short ?? [];
  const bank = script.bankV2;
  return {
    narration: script.beats.length ? shortNarration(script) : '',
    words,
    durationSeconds: media.durationSeconds,
    silences: media.silences,
    shotSeconds: flattenShots(script).map((f) => f.shot.durationSec),
    hookOnscreen: script.hookText ?? bank?.hookText,
    hookCardSeconds: media.hookCardSeconds,
    captionsOn: media.captionsOn,
    mascotOn: media.mascotOn,
    mascotDelaySeconds: project.hootEntry === 'delayed' ? HOOT_DELAYED_ENTRY_SECONDS : 0,
    bank: bank
      ? {
          hook_spoken: bank.hookSpoken,
          hook_onscreen: bank.hookOnscreen,
          beats: bank.beats,
          loop_line: bank.loopLine,
          feeds_longform: bank.feedsLongform,
        }
      : undefined,
    catchphraseOn: catchphraseOn(project),
  } as ShortAuditInput;
}

/** How long each long-form picture holds, cards split at their frames. */
export function visualHolds(
  script: any,
  alignment: Record<string, any[]>,
  durations: Record<string, number>,
): number[] {
  const holds: number[] = [];
  for (const ch of script.chapters) {
    const key = String(ch.index);
    const seconds = durations[key];
    if (!ch.visuals?.length || !seconds) continue;
    for (const t of timeVisuals(ch.visuals, pausedWords(ch.cues, alignment[key] ?? []), seconds, () => 'x') as any[]) {
      const length = t.end - t.start;
      if (t.visual.kind === 'card' && t.visual.card) {
        holds.push(...cardFrameSeconds(t.visual.card, length).filter((s) => s > 0.2));
      } else {
        const n = Math.max(1, Math.ceil(length / HOLD_SECONDS - 0.15));
        for (let k = 0; k < n; k++) holds.push(length / n);
      }
    }
  }
  return holds;
}

export function longAuditInput(
  project: any,
  media: { durations: Record<string, number>; feederShorts: number },
): LongAuditInput {
  const script = project.script;
  const bank = script.bankV2;
  const alignment = project.assets.alignment;
  return {
    title: script.title,
    chapters: script.chapters.map((c: any) => ({
      title: c.title,
      narration: c.narration,
      words: pausedWords(c.cues, alignment[String(c.index)] ?? []),
      voiceWords: alignment[String(c.index)] ?? [],
      pauseSeconds: pauseSeconds(c.cues),
      seconds: media.durations[String(c.index)] ?? 0,
    })),
    visualSeconds: visualHolds(script, alignment, media.durations),
    marks: chapterMarkers(script, media.durations),
    thumbnail: { text: bank?.thumbnailText, texts: bank?.thumbnailTexts, concepts: bank?.thumbnailConcepts },
    interrupts: bank?.interrupts,
    feederShorts: media.feederShorts,
  };
}
