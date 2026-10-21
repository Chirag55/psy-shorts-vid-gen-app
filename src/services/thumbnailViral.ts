import type { SkImage, SkSurface } from '@shopify/react-native-skia';
import { File } from 'expo-file-system';
import { guardImageBytes } from '@/core/binaryGuards';
import { THUMB_MAX_BYTES } from '@/core/thumbnailLayout';
import { captionTypeface, preloadCaptionFont } from './captionRenderer';
import { skia } from './skia';
import { makeRasterSurface } from './skiaSurface';
import { bucketFile } from './workspace';
import { mark } from './breadcrumbs';

export const VIRAL_THUMB_W = 1080;
export const VIRAL_THUMB_H = 1920;
/** Text block: top-centre, inside the side margins, at most two lines. */
const TEXT = { top: 150, side: 70, maxSize: 190, minSize: 90, lineGap: 18, outlineRatio: 0.14 };

async function imageFrom(uri: string): Promise<SkImage> {
  const { Skia } = skia();
  const file = new File(uri);
  if (!file.exists) throw new Error('The thumbnail artwork is missing. Import it again.');
  const bytes = await file.bytes();
  const guard = guardImageBytes(bytes);
  if (!guard.ok) throw new Error(guard.reason ?? 'That image could not be read.');
  const image = Skia.Image.MakeImageFromEncoded(Skia.Data.fromBytes(bytes));
  if (!image) throw new Error('That image could not be decoded.');
  return image;
}

/**
 * Draws an A9 viral Short's 9:16 thumbnail: the artwork full-frame and the
 * thumb text top-centre in bold white with a black stroke. Saved as JPEG under
 * YouTube's 2 MB limit.
 */
export async function renderViralThumbnail(input: { slug: string; artUri: string; text: string }): Promise<string> {
  await preloadCaptionFont();
  const { Skia, PaintStyle, ImageFormat } = skia();
  const typeface = captionTypeface();
  const done = mark(`Rendering the viral thumbnail (${VIRAL_THUMB_W}x${VIRAL_THUMB_H})`);
  try {
    const art = await imageFrom(input.artUri);
    const surface = makeRasterSurface<SkSurface>(Skia, VIRAL_THUMB_W, VIRAL_THUMB_H);
    try {
      const canvas = surface.getCanvas();
      canvas.clear(Skia.Color('#000000'));
      const fw = art.width();
      const fh = art.height();
      const cover = Math.max(VIRAL_THUMB_W / fw, VIRAL_THUMB_H / fh);
      const paint = Skia.Paint();
      paint.setAntiAlias(true);
      canvas.drawImageRect(
        art,
        { x: 0, y: 0, width: fw, height: fh },
        {
          x: (VIRAL_THUMB_W - fw * cover) / 2,
          y: (VIRAL_THUMB_H - fh * cover) / 2,
          width: fw * cover,
          height: fh * cover,
        },
        paint,
      );
      art.dispose();

      const words = input.text.trim().toUpperCase().split(/\s+/).filter(Boolean);
      const maxWidth = VIRAL_THUMB_W - TEXT.side * 2;
      // The largest size that fits on one line, else two balanced lines.
      let size = TEXT.maxSize;
      let lines: string[] = [words.join(' ')];
      for (; size >= TEXT.minSize; size -= 6) {
        const font = Skia.Font(typeface ?? undefined, size);
        if (font.measureText(words.join(' ')).width <= maxWidth) {
          lines = [words.join(' ')];
          break;
        }
        if (words.length > 1) {
          const cut = Math.ceil(words.length / 2);
          const two = [words.slice(0, cut).join(' '), words.slice(cut).join(' ')];
          if (two.every((l) => font.measureText(l).width <= maxWidth)) {
            lines = two;
            break;
          }
        }
      }
      size = Math.max(size, TEXT.minSize);
      const font = Skia.Font(typeface ?? undefined, size);
      const stroke = Skia.Paint();
      stroke.setStyle(PaintStyle.Stroke);
      stroke.setStrokeWidth(Math.round(size * TEXT.outlineRatio));
      stroke.setColor(Skia.Color('#000000'));
      stroke.setAntiAlias(true);
      const fill = Skia.Paint();
      fill.setColor(Skia.Color('#FFFFFF'));
      fill.setAntiAlias(true);
      let y = TEXT.top + size;
      for (const line of lines) {
        const x = Math.round((VIRAL_THUMB_W - font.measureText(line).width) / 2);
        canvas.drawText(line, x, y, stroke, font);
        canvas.drawText(line, x, y, fill, font);
        y += size + TEXT.lineGap;
      }

      const image = surface.makeImageSnapshot();
      try {
        let bytes: Uint8Array | null = null;
        for (const quality of [92, 85, 75]) {
          if (bytes && bytes.length && bytes.length <= THUMB_MAX_BYTES) break;
          bytes = image.encodeToBytes(ImageFormat.JPEG, quality);
        }
        if (!bytes || !bytes.length || bytes.length > THUMB_MAX_BYTES) {
          throw new Error('The thumbnail came out over YouTube’s 2 MB limit.');
        }
        const file = bucketFile('thumbnails', input.slug, 'thumb_viral.jpg');
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
