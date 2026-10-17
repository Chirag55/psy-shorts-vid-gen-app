import type { SkFont, SkImage, SkSurface, SkTypeface } from '@shopify/react-native-skia';
import { File } from 'expo-file-system';
import { guardImageBytes } from '@/core/binaryGuards';
import { captionTypeface, preloadCaptionFont } from './captionRenderer';
import { skia } from './skia';
import { makeRasterSurface } from './skiaSurface';
import { bucketFile } from './workspace';
import { mark } from './breadcrumbs';

type SkiaApi = ReturnType<typeof skia>['Skia'];
type PaintStyleApi = ReturnType<typeof skia>['PaintStyle'];

export const THUMB_W = 1280;
export const THUMB_H = 720;

/** Short layout: the 9:16 frame sits sharp in a centre column over a blurred copy. */
const COLUMN_W = Math.round(405);
const COLUMN_X = Math.round(437.5);
const BADGE = {
  x: 456,
  y: 92,
  height: 21,
  padX: 13,
  capHeight: 9,
  labelWidth: 138,
  fill: '#DE204B',
  label: '#FFFFFF',
};
const TITLE = {
  x: 468,
  column: 320,
  baseline1: 180,
  baseline2: 234,
  maxCapHeight: 46,
  scaleX: 1.15,
  outline: 12,
  line1: '#FDEB05',
  line2: '#FFFFFF',
};
const MASCOT = { x: 616, width: 195, bottomGap: 38 };
const BACKDROP = { blurSigma: 18, dim: 0.68 };
/** Long layout: full-bleed frame, shaded from the left, title in the left column. */
const LONG = {
  x: 60,
  badgeY: 70,
  badgeScale: 1.7,
  column: 640,
  baseline1: 250,
  baseline2: 372,
  maxCapHeight: 96,
  outline: 18,
  shade: 0.82,
  shadeEnd: 0.72,
  mascotWidth: 300,
  mascotRight: 40,
  mascotBottom: 24,
};

function badgeTypeface(Skia: SkiaApi): SkTypeface | null {
  try {
    const mgr = Skia.FontMgr.System();
    const { FontStyle } = skia();
    return (
      mgr.matchFamilyStyle('sans-serif', FontStyle.Bold) ??
      mgr.matchFamilyStyle(undefined as unknown as string, FontStyle.Bold)
    );
  } catch {
    return null;
  }
}

async function readImage(uri: string, Skia: SkiaApi): Promise<SkImage> {
  const file = new File(uri);
  if (!file.exists) throw new Error('That frame could not be found. Sample the frames again.');
  const bytes = await file.bytes();
  const guard = guardImageBytes(bytes);
  if (!guard.ok) throw new Error(guard.reason ?? 'That frame is not a readable image.');
  const image = Skia.Image.MakeImageFromEncoded(Skia.Data.fromBytes(bytes));
  if (!image) throw new Error('That frame could not be decoded.');
  return image;
}

function fitToColumn(
  typeface: SkTypeface | null,
  text: string,
  column: number,
  capHeight: number,
  Skia: SkiaApi,
): { size: number; scaleX: number } {
  const scaleX = TITLE.scaleX;
  const size = capHeight / 0.8605;
  const font = Skia.Font(typeface ?? undefined, size);
  font.setScaleX(scaleX);
  const width = font.measureText(text).width;
  let fitted = size;
  if (width > 0 && width > column) fitted = (size * column) / width;
  return { size: Math.max(8, fitted), scaleX };
}

function drawOutlinedText(
  canvas: ReturnType<SkSurface['getCanvas']>,
  text: string,
  x: number,
  y: number,
  color: string,
  size: number,
  scaleX: number,
  typeface: SkTypeface | null,
  Skia: SkiaApi,
  PaintStyle: PaintStyleApi,
  outline: number = TITLE.outline,
): void {
  const font: SkFont = Skia.Font(typeface ?? undefined, size);
  font.setScaleX(scaleX);
  const stroke = Skia.Paint();
  stroke.setStyle(PaintStyle.Stroke);
  stroke.setStrokeWidth(outline);
  stroke.setColor(Skia.Color('#000000'));
  stroke.setAntiAlias(true);
  const fill = Skia.Paint();
  fill.setColor(Skia.Color(color));
  fill.setAntiAlias(true);
  canvas.drawText(text, x, y, stroke, font);
  canvas.drawText(text, x, y, fill, font);
}

/**
 * Draws the 1280x720 thumbnail from a sampled frame: two title lines, an
 * optional badge and an optional mascot. Saved as JPEG, or PNG if JPEG fails.
 */
export async function renderThumbnail(input: {
  slug: string;
  frameUri: string;
  layout?: 'long' | 'short';
  line1: string;
  line2: string;
  badge?: string;
  mascotUri?: string;
}): Promise<string> {
  await preloadCaptionFont();
  const { Skia, PaintStyle, ImageFormat, TileMode } = skia();
  const typeface = captionTypeface();
  const done = mark(`Rendering the thumbnail (${THUMB_W}x${THUMB_H})`);
  try {
    const frame = await readImage(input.frameUri, Skia);
    const surface = makeRasterSurface<SkSurface>(Skia, THUMB_W, THUMB_H);
    try {
      const canvas = surface.getCanvas();
      canvas.clear(Skia.Color('#000000'));
      const isLong = input.layout === 'long';
      const fw = frame.width();
      const fh = frame.height();
      const cover = Math.max(THUMB_W / fw, THUMB_H / fh);
      const dw = fw * cover;
      const dh = fh * cover;
      const backdrop = Skia.Paint();
      backdrop.setAntiAlias(true);
      if (!isLong) {
        backdrop.setImageFilter(
          Skia.ImageFilter.MakeBlur(BACKDROP.blurSigma, BACKDROP.blurSigma, TileMode.Clamp, null),
        );
      }
      canvas.drawImageRect(
        frame,
        { x: 0, y: 0, width: fw, height: fh },
        { x: (THUMB_W - dw) / 2, y: (THUMB_H - dh) / 2, width: dw, height: dh },
        backdrop,
      );
      if (!isLong) {
        const dim = Skia.Paint();
        dim.setColor(Skia.Color('#000000'));
        dim.setAlphaf(BACKDROP.dim);
        canvas.drawRect({ x: 0, y: 0, width: THUMB_W, height: THUMB_H }, dim);
        const scale = Math.max(COLUMN_W / fw, THUMB_H / fh);
        const sw = COLUMN_W / scale;
        const sh = THUMB_H / scale;
        const sharp = Skia.Paint();
        sharp.setAntiAlias(true);
        canvas.drawImageRect(
          frame,
          { x: (fw - sw) / 2, y: (fh - sh) / 2, width: sw, height: sh },
          { x: COLUMN_X, y: 0, width: COLUMN_W, height: THUMB_H },
          sharp,
        );
      } else {
        const shade = Skia.Paint();
        shade.setShader(
          Skia.Shader.MakeLinearGradient(
            { x: 0, y: 0 },
            { x: THUMB_W * LONG.shadeEnd, y: 0 },
            [Skia.Color(`rgba(0,0,0,${LONG.shade})`), Skia.Color('rgba(0,0,0,0)')],
            null,
            TileMode.Clamp,
          ),
        );
        canvas.drawRect({ x: 0, y: 0, width: THUMB_W, height: THUMB_H }, shade);
      }
      frame.dispose();

      if (input.badge) {
        const s = isLong ? LONG.badgeScale : 1;
        const height = BADGE.height * s;
        const padX = BADGE.padX * s;
        const cap = BADGE.capHeight * s;
        const font = Skia.Font(badgeTypeface(Skia) ?? typeface ?? undefined, cap / 0.72);
        const textWidth = font.measureText(input.badge).width;
        const gaps = Math.max(1, input.badge.length - 1);
        const spacing = Math.min(cap * 0.25, Math.max(0, (BADGE.labelWidth * s - textWidth) / gaps));
        const total = textWidth + spacing * gaps;
        const fill = Skia.Paint();
        fill.setColor(Skia.Color(BADGE.fill));
        fill.setAntiAlias(true);
        const x = isLong ? LONG.x : BADGE.x;
        const y = isLong ? LONG.badgeY : BADGE.y;
        canvas.drawRRect(
          { rect: { x, y, width: total + padX * 2, height }, rx: height / 2, ry: height / 2 },
          fill,
        );
        const label = Skia.Paint();
        label.setColor(Skia.Color(BADGE.label));
        label.setAntiAlias(true);
        let tx = x + padX;
        const ty = y + (height + cap) / 2;
        for (const ch of input.badge) {
          canvas.drawText(ch, tx, ty, label, font);
          tx += font.measureText(ch).width + spacing;
        }
      }

      const place = isLong
        ? { x: LONG.x, column: LONG.column, cap: LONG.maxCapHeight, b1: LONG.baseline1, b2: LONG.baseline2, outline: LONG.outline }
        : { x: TITLE.x, column: TITLE.column, cap: TITLE.maxCapHeight, b1: TITLE.baseline1, b2: TITLE.baseline2, outline: TITLE.outline };
      const lines: [string, number, string][] = [
        [input.line1, place.b1, TITLE.line1],
        [input.line2, place.b2, TITLE.line2],
      ];
      for (const [text, baseline, color] of lines) {
        if (!text) continue;
        const fit = fitToColumn(typeface, text, place.column, place.cap, Skia);
        drawOutlinedText(canvas, text, place.x, baseline, color, fit.size, fit.scaleX, typeface, Skia, PaintStyle, place.outline);
      }

      if (input.mascotUri) {
        const mascot = await readImage(input.mascotUri, Skia);
        const width = isLong ? LONG.mascotWidth : MASCOT.width;
        const height = mascot.height() * (width / mascot.width());
        const x = isLong ? THUMB_W - LONG.mascotRight - width : MASCOT.x;
        const y = THUMB_H - (isLong ? LONG.mascotBottom : MASCOT.bottomGap) - height;
        const paint = Skia.Paint();
        paint.setAntiAlias(true);
        canvas.drawImageRect(
          mascot,
          { x: 0, y: 0, width: mascot.width(), height: mascot.height() },
          { x, y, width, height },
          paint,
        );
        mascot.dispose();
      }

      const image = surface.makeImageSnapshot();
      try {
        let ext = 'jpg';
        let bytes: Uint8Array | null = image.encodeToBytes(ImageFormat.JPEG, 92);
        if (!bytes || bytes.length === 0) {
          bytes = image.encodeToBytes(ImageFormat.PNG, 100);
          ext = 'png';
        }
        if (!bytes) throw new Error('The thumbnail could not be encoded.');
        const file = bucketFile('thumbnails', input.slug, `thumbnail.${ext}`);
        if (file.exists) file.delete();
        file.create({ intermediates: true, overwrite: true });
        file.write(bytes);
        return file.uri;
      } finally {
        image.dispose();
      }
    } finally {
      surface.dispose();
    }
  } finally {
    done();
  }
}
