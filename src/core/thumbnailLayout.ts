import { parseConcept, thumbnailWords } from './bankV2';
import { HOOT_ANCHOR, type HootPose } from './hoot';

/** The v2 thumbnail canvas. */
export const THUMB_V2 = { width: 1280, height: 720 };
/** The accent word's colour. */
export const ACCENT_RED = '#E53935';
/** YouTube's thumbnail size limit. */
export const THUMB_MAX_BYTES = 2097152;
/** The text band along the top of a v2 thumbnail. */
export const TEXT_BAND = { minSize: 95, maxSize: 120, sideMargin: 50, capTop: 48, lineGap: 14 };
/** Hoot's size and where his branch sits. */
export const HOOT_THUMB = { size: 628, branchY: 686 };
/** Where YouTube's duration badge covers the frame. */
export const BADGE_ZONE = { x: Math.round(THUMB_V2.width * 0.8), y: Math.round(THUMB_V2.height * 0.85) };
const VARIANT_POSES: Record<'A' | 'B' | 'C', HootPose> = { A: 'idle', B: 'shocked', C: 'pointing' } as Record<
  'A' | 'B' | 'C',
  HootPose
>;
/** Full-bleed thumbnails: text over the picture on the left. */
export const FULL_BLEED = { sideMargin: 56, bottomMargin: 64, minSize: 120, maxSize: 168, lineGap: 10, outline: 14 };
/** Width of the smallest place a thumbnail shows (search on a phone). */
export const PREVIEW_WIDTH = 120;
/** Smallest readable cap height at that width. */
export const PREVIEW_MIN_CAP = 7;

export interface ThumbnailVariant {
  variant: 'A' | 'B' | 'C';
  text: string;
  words: { word: string; accent: boolean }[];
  background: 'white' | 'black';
  pose: HootPose;
  concept: string;
}

type Measure = (text: string, size: number) => number;

/** Hoot's box, centred, standing on the branch. */
export function hootThumbBox(): { x: number; y: number; size: number } {
  const size = HOOT_THUMB.size;
  return {
    x: Math.round((THUMB_V2.width - size) / 2),
    y: Math.round(HOOT_THUMB.branchY - HOOT_ANCHOR.y * size),
    size,
  };
}

/** The thumbnail texts as A/B/C variants, each with its background and Hoot pose. */
export function thumbnailVariants(e: {
  thumbnailTexts?: string[];
  thumbnailConcepts?: string[];
  thumbnailText?: string;
}): ThumbnailVariant[] {
  const texts = e.thumbnailTexts ?? [];
  if (!texts.length) {
    const t = (e.thumbnailText ?? '').trim();
    if (!t) return [];
    const parts = t.split(/\s+/);
    const text = [...parts.slice(0, -1), `*${parts[parts.length - 1]}*`].join(' ');
    return [{ variant: 'A', text, words: thumbnailWords(text), background: 'white', pose: 'idle' as HootPose, concept: '' }];
  }
  return texts.map((text, i) => {
    const c = e.thumbnailConcepts?.[i] ? parseConcept(e.thumbnailConcepts[i], i) : null;
    const variant = c?.variant ?? (['A', 'B', 'C'] as const)[i % 3];
    return {
      variant,
      text,
      words: thumbnailWords(text),
      background: c?.background ?? (variant === 'B' ? 'black' : 'white'),
      pose: c?.pose ?? VARIANT_POSES[variant],
      concept: c?.text ?? '',
    };
  });
}

export function textColour(background: 'white' | 'black'): string {
  return background === 'white' ? '#111111' : '#FFFFFF';
}

/** One line, or two balanced lines when one won't fit at the smallest size. */
export function thumbnailLines<W extends { word: string }>(words: W[], measure: Measure): W[][] {
  const available = THUMB_V2.width - 2 * TEXT_BAND.sideMargin;
  const join = (ws: W[]) => ws.map((w) => w.word).join(' ');
  if (words.length < 2 || measure(join(words), TEXT_BAND.minSize) <= available) return [words];
  let best = Infinity;
  let split = 1;
  for (let i = 1; i < words.length; i++) {
    const diff = Math.abs(measure(join(words.slice(0, i)), 100) - measure(join(words.slice(i)), 100));
    if (diff < best) {
      best = diff;
      split = i;
    }
  }
  return [words.slice(0, split), words.slice(split)];
}

/** The largest size every line fits at, never below 48. */
export function thumbnailFontSize(lines: string[], measure: Measure): number {
  const available = THUMB_V2.width - 2 * TEXT_BAND.sideMargin;
  let size = TEXT_BAND.maxSize;
  for (const line of lines) {
    const w = measure(line, size);
    if (w > available) size = Math.floor((size * available) / w);
  }
  return Math.max(48, size);
}

/** Whether the text still reads when the thumbnail is 120 px wide. */
export function thumbnailLegibility(
  wordCount: number,
  fontSize: number,
  capRatio = 0.8605,
): { ok: boolean; capAtPreview: number; message: string } {
  const cap = Math.round((((fontSize * capRatio) * PREVIEW_WIDTH) / THUMB_V2.width) * 10) / 10;
  const problems: string[] = [];
  if (wordCount < 2 || wordCount > 4) problems.push(`${wordCount} words; 2 to 4 read at a glance`);
  if (cap < PREVIEW_MIN_CAP) problems.push(`the letters are ${cap} px tall at 120 px wide; at least ${PREVIEW_MIN_CAP}`);
  return {
    ok: !problems.length,
    capAtPreview: cap,
    message: problems.length ? `Hard to read at 120 px: ${problems.join('; ')}.` : `Reads at 120 px (letters ${cap} px tall).`,
  };
}

/** The largest size every full-bleed line fits at, never below 72. */
export function fullBleedFontSize(lines: string[], measure: Measure): number {
  const available = Math.round(THUMB_V2.width * 0.7) - FULL_BLEED.sideMargin;
  let size = FULL_BLEED.maxSize;
  for (const line of lines) {
    const w = measure(line, size);
    if (w > available) size = Math.floor((size * available) / w);
  }
  return Math.max(72, size);
}
