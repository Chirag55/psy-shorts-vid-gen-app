import { Asset } from 'expo-asset';
import type { SkFont, SkSurface, SkTypeface } from '@shopify/react-native-skia';

/**
 * Skia is required lazily for the same reason as FFmpeg: nothing native should
 * load while the JS bundle is still being evaluated, because a failure there
 * kills the app before any error boundary exists to report it.
 */
type SkiaModule = typeof import('@shopify/react-native-skia');

let cachedSkia: SkiaModule | null = null;

function skia(): SkiaModule {
  if (!cachedSkia) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    cachedSkia = require('@shopify/react-native-skia') as SkiaModule;
  }
  return cachedSkia;
}
import { Directory, File } from 'expo-file-system';
import { isBlank, type CaptionFrame } from '@/core/captions';
import { bucketDir } from './workspace';

/**
 * Draws caption frames as transparent PNGs for FFmpeg to composite.
 *
 * Only a band is rendered, not the full canvas — a 1080x400 strip instead of a
 * 1080x1920 frame is roughly five times less pixel work and disk per frame, and
 * the caption never occupies more than that band anyway.
 */

const NEON_YELLOW = '#FFFF00';
const WHITE = '#FFFFFF';
const OUTLINE = '#000000';

export interface CaptionStyle {
  fontSize: number;
  /** Canvas width; the band always spans it. */
  width: number;
  /** Band height. Two lines of text plus outline padding. */
  height: number;
  outlineWidth: number;
  lineGap: number;
  /** Horizontal padding before text wraps. */
  sidePadding: number;
}

export interface RenderedCaptions {
  /** Path to the FFmpeg concat list describing the frame sequence. */
  listPath: string;
  width: number;
  height: number;
  frameCount: number;
}

export interface RenderCaptionsOptions {
  frames: CaptionFrame[];
  slug: string;
  /** Distinguishes chapters so their frame sets never collide on disk. */
  key: string;
  style: CaptionStyle;
  /** Pads the final frame so captions cover the whole chapter. */
  totalDuration: number;
  onProgress?: (done: number, total: number) => void;
  signal?: AbortSignal;
}

/**
 * Anton, bundled with the app.
 *
 * The published Shorts are set in Anton, and matching them is the whole point —
 * relying on a system font meant captions rendered in whatever condensed face
 * the device happened to ship, which is visibly not the same typeface. Loaded
 * once and reused; the module is long-lived so the cache never needs clearing.
 */
let cachedTypeface: SkTypeface | null = null;
let typefaceLoadFailed = false;

export async function preloadCaptionFont(): Promise<void> {
  if (cachedTypeface || typefaceLoadFailed) return;

  try {
    const asset = Asset.fromModule(require('../../assets/fonts/Anton-Regular.ttf'));
    await asset.downloadAsync();
    const uri = asset.localUri ?? asset.uri;

    const { Skia } = skia();
    const data = await Skia.Data.fromURI(uri);
    cachedTypeface = Skia.Typeface.MakeFreeTypeFaceFromData(data);
    if (!cachedTypeface) typefaceLoadFailed = true;
  } catch {
    // Fall back to a system face rather than failing the whole render.
    typefaceLoadFailed = true;
  }
}

function loadFont(size: number): SkFont {
  // System fonts only. Shipping a font file would bloat the APK, and Skia's
  // system manager already resolves a bold sans that reads well at this size.
  //
  // matchFamilyStyle is typed as non-null but returns null for a family the
  // device does not have, and the condensed face is not present on every
  // Android build — so fall all the way through to Skia's default rather than
  // handing a null typeface to Skia.Font.
  const { Skia, FontStyle } = skia();

  // Bundled Anton first — this is what makes captions match the channel.
  if (cachedTypeface) return Skia.Font(cachedTypeface, size);

  try {
    const fontMgr = Skia.FontMgr.System();
    const typeface =
      (fontMgr.matchFamilyStyle('sans-serif-condensed', FontStyle.Bold) as SkTypeface | null) ??
      (fontMgr.matchFamilyStyle('sans-serif', FontStyle.Bold) as SkTypeface | null);
    if (typeface) return Skia.Font(typeface, size);
  } catch {
    // Fall through to the default face below.
  }
  return Skia.Font(undefined, size);
}

interface Line {
  tokens: Array<{ text: string; active: boolean; width: number }>;
  width: number;
}

/** Greedy wrap into at most two lines, which is all the band has room for. */
function layout(
  frame: CaptionFrame,
  font: SkFont,
  maxWidth: number,
  spaceWidth: number,
  fallbackCharWidth: number
): Line[] {
  const lines: Line[] = [];
  let current: Line = { tokens: [], width: 0 };

  for (const token of frame.tokens) {
    // A face missing a glyph can measure zero; approximate rather than stack
    // every token at the same x.
    const measured = font.measureText(token.text).width;
    const width = measured > 0 ? measured : token.text.length * fallbackCharWidth;
    const projected = current.tokens.length ? current.width + spaceWidth + width : width;

    if (current.tokens.length && projected > maxWidth) {
      lines.push(current);
      current = { tokens: [{ ...token, width }], width };
    } else {
      current.tokens.push({ ...token, width });
      current.width = projected;
    }
  }

  if (current.tokens.length) lines.push(current);
  return lines.slice(0, 2);
}

/**
 * Renders every frame to disk and writes the concat list.
 *
 * Yields to the event loop periodically: a long-form chapter can be a couple of
 * hundred frames, and drawing them in one uninterrupted run would block the JS
 * thread long enough for Android to raise an ANR.
 */
export async function renderCaptionFrames(opts: RenderCaptionsOptions): Promise<RenderedCaptions | null> {
  const { frames, style, totalDuration } = opts;
  if (!frames.length) return null;

  const dir = new Directory(bucketDir('subs', opts.slug), `caps_${opts.key}`);
  if (dir.exists) dir.delete();
  dir.create({ intermediates: true });

  const font = loadFont(style.fontSize);
  const spaceWidth = font.measureText(' ').width || style.fontSize * 0.3;
  const fallbackCharWidth = style.fontSize * 0.55;
  const maxTextWidth = style.width - style.sidePadding * 2;
  const lineHeight = style.fontSize + style.lineGap;

  const { Skia, PaintStyle, ImageFormat } = skia();

  const fill = Skia.Paint();
  fill.setStyle(PaintStyle.Fill);
  fill.setAntiAlias(true);

  const stroke = Skia.Paint();
  stroke.setStyle(PaintStyle.Stroke);
  stroke.setStrokeWidth(style.outlineWidth);
  stroke.setColor(Skia.Color(OUTLINE));
  stroke.setAntiAlias(true);

  const entries: Array<{ name: string; duration: number }> = [];
  let surface: SkSurface | null = null;
  // Silences are all identical, so one encoded transparent frame is reused for
  // every one of them instead of drawing and writing the same empty PNG again.
  let blankName: string | null = null;

  try {
    for (let i = 0; i < frames.length; i++) {
      if (opts.signal?.aborted) throw new Error('Caption rendering cancelled.');

      const frame = frames[i];

      if (isBlank(frame) && blankName) {
        entries.push({ name: blankName, duration: Math.max(0.02, frame.end - frame.start) });
        continue;
      }

      const name = `cap_${String(i).padStart(5, '0')}.png`;
      if (isBlank(frame)) blankName = name;

      surface = Skia.Surface.MakeOffscreen(style.width, style.height);
      if (!surface) throw new Error('Skia could not allocate an offscreen surface for captions.');

      const canvas = surface.getCanvas();
      canvas.clear(Skia.Color('#00000000'));

      const lines = layout(frame, font, maxTextWidth, spaceWidth, fallbackCharWidth);
      const blockHeight = lines.length * lineHeight;
      let y = (style.height - blockHeight) / 2 + style.fontSize;

      for (const line of lines) {
        let x = (style.width - line.width) / 2;
        for (const token of line.tokens) {
          // Outline first, fill second — drawing the stroke over the fill would
          // eat into the glyph and thin the text.
          canvas.drawText(token.text, x, y, stroke, font);
          fill.setColor(Skia.Color(token.active ? NEON_YELLOW : WHITE));
          canvas.drawText(token.text, x, y, fill, font);
          x += token.width + spaceWidth;
        }
        y += lineHeight;
      }

      const image = surface.makeImageSnapshot();
      const bytes = image.encodeToBytes(ImageFormat.PNG, 100);
      if (!bytes) throw new Error('Skia could not encode a caption frame.');

      const file = new File(dir, name);
      file.create({ overwrite: true });
      file.write(bytes);

      entries.push({ name, duration: Math.max(0.02, frame.end - frame.start) });

      surface.dispose();
      surface = null;

      if (i % 12 === 11) {
        opts.onProgress?.(i + 1, frames.length);
        await new Promise((resolve) => setTimeout(resolve, 0));
      }
    }
  } finally {
    surface?.dispose();
  }

  // Pad to the full chapter so the overlay never runs out mid-render.
  const covered = entries.reduce((sum, e) => sum + e.duration, 0);
  if (totalDuration > covered + 0.05) {
    entries[entries.length - 1].duration += totalDuration - covered;
  }

  const lines = entries.map((e) => `file '${e.name}'\nduration ${e.duration.toFixed(3)}`);
  // The concat demuxer ignores the last entry's duration, so the final image is
  // repeated without one to make its length explicit.
  lines.push(`file '${entries[entries.length - 1].name}'`);

  const listFile = new File(dir, 'frames.txt');
  listFile.create({ overwrite: true });
  listFile.write(lines.join('\n'));

  opts.onProgress?.(frames.length, frames.length);

  return {
    listPath: listFile.uri,
    width: style.width,
    height: style.height,
    frameCount: entries.length,
  };
}

/** Caption band geometry for each format, scaled from the spec's 1080p figures. */
export function captionStyleFor(mode: 'short' | 'long', width: number, height: number): CaptionStyle {
  if (mode === 'short') {
    const scale = width / 1080;
    return {
      // One word alone carries a larger face than a wrapped phrase could.
      fontSize: Math.round(76 * scale),
      width,
      height: Math.round(170 * scale),
      outlineWidth: Math.max(2, Math.round(6 * scale)),
      lineGap: Math.round(16 * scale),
      sidePadding: Math.round(60 * scale),
    };
  }

  const scale = width / 1920;
  return {
    fontSize: Math.round(46 * scale),
    width,
    height: Math.round(200 * scale),
    outlineWidth: Math.max(2, Math.round(5 * scale)),
    lineGap: Math.round(14 * scale),
    sidePadding: Math.round(120 * scale),
  };
}

/** Vertical placement of the band, keeping clear of platform UI. */
export function captionBandY(mode: 'short' | 'long', canvasHeight: number, bandHeight: number): number {
  if (mode === 'short') {
    // Centred slightly above the midline, matching the published Shorts.
    // A lower band collides with the Shorts action rail and the title overlay,
    // and reads as an afterthought; mid-frame sits over the subject and is
    // legible at the size a Short is actually watched.
    return Math.round(canvasHeight * 0.5 - bandHeight / 2);
  }
  // Long form still clears the YouTube scrub bar.
  return Math.round(canvasHeight - bandHeight - canvasHeight * 0.06);
}
