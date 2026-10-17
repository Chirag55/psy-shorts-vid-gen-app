import type { SkFont, SkImage, SkSurface } from '@shopify/react-native-skia';
import { File } from 'expo-file-system';
import { guardImageBytes } from '@/core/binaryGuards';
import {
  ACCENT_RED,
  FULL_BLEED,
  TEXT_BAND,
  THUMB_MAX_BYTES,
  THUMB_V2,
  fullBleedFontSize,
  hootThumbBox,
  textColour,
  thumbnailFontSize,
  thumbnailLines,
  type ThumbnailVariant,
} from '@/core/thumbnailLayout';
import { captionTypeface, preloadCaptionFont } from './captionRenderer';
import { ensureHootPack } from './hootPack';
import { skia } from './skia';
import { makeRasterSurface } from './skiaSurface';
import { bucketFile } from './workspace';
import { mark } from './breadcrumbs';

/** Cap height as a share of the font size (Anton). */
const CAP_RATIO = 0.8605;

async function imageFrom(uri: string): Promise<SkImage> {
  const { Skia } = skia();
  const file = new File(uri);
  if (!file.exists) throw new Error('An image for the thumbnail is missing. Import it again.');
  const bytes = await file.bytes();
  const guard = guardImageBytes(bytes);
  if (!guard.ok) throw new Error(guard.reason ?? 'That image could not be read.');
  const image = Skia.Image.MakeImageFromEncoded(Skia.Data.fromBytes(bytes));
  if (!image) throw new Error('That image could not be decoded.');
  return image;
}

function spaceWidth(font: SkFont, size: number): number {
  return Math.max(font.measureText(' ').width, size * 0.28);
}

function lineWidth(font: SkFont, text: string, size: number): number {
  const words = text.split(' ').filter(Boolean);
  const sum = words.reduce((acc, w) => acc + font.measureText(w).width, 0);
  return sum + Math.max(0, words.length - 1) * Math.max(font.measureText(' ').width, size * 0.28);
}

/**
 * Draws one v2 thumbnail variant at 1280x720. With art it is full bleed with
 * the words bottom-left; otherwise Hoot (or the prop) sits under a top text
 * band. Saved as JPEG under YouTube's 2 MB limit, PNG if JPEG fails.
 */
export async function renderThumbnailV2(input: {
  slug: string;
  variant: ThumbnailVariant;
  artUri?: string;
  propUri?: string;
}): Promise<string> {
  await preloadCaptionFont();
  const { Skia, ImageFormat } = skia();
  const typeface = captionTypeface();
  const done = mark(`Drawing thumbnail ${input.variant.variant} (${THUMB_V2.width}x${THUMB_V2.height})`);
  try {
    const surface = makeRasterSurface<SkSurface>(Skia, THUMB_V2.width, THUMB_V2.height);
    try {
      const canvas = surface.getCanvas();
      const v = input.variant;
      canvas.clear(Skia.Color(v.background === 'white' ? '#FFFFFF' : '#000000'));
      const widthAt = (text: string, size: number) => lineWidth(Skia.Font(typeface ?? undefined, size), text, size);
      const upper = v.words.map((w) => ({ ...w, word: w.word.toUpperCase() }));

      if (input.artUri) {
        const art = await imageFrom(input.artUri);
        const scale = Math.max(THUMB_V2.width / art.width(), THUMB_V2.height / art.height());
        const sw = THUMB_V2.width / scale;
        const sh = THUMB_V2.height / scale;
        const paint = Skia.Paint();
        paint.setAntiAlias(true);
        canvas.drawImageRect(
          art,
          Skia.XYWHRect((art.width() - sw) / 2, (art.height() - sh) / 2, sw, sh),
          Skia.XYWHRect(0, 0, THUMB_V2.width, THUMB_V2.height),
          paint,
        );
        art.dispose();

        const half = Math.ceil(upper.length / 2);
        const lines = upper.length > 2 ? [upper.slice(0, half), upper.slice(half)] : [upper];
        const size = fullBleedFontSize(
          lines.map((l) => l.map((w) => w.word).join(' ')),
          widthAt,
        );
        const font = Skia.Font(typeface ?? undefined, size);
        const cap = size * CAP_RATIO;
        const space = spaceWidth(font, size);
        const fill = Skia.Paint();
        fill.setAntiAlias(true);
        fill.setColor(Skia.Color('#FFFFFF'));
        const accent = Skia.Paint();
        accent.setAntiAlias(true);
        accent.setColor(Skia.Color(ACCENT_RED));
        const outline = Skia.Paint();
        outline.setAntiAlias(true);
        outline.setColor(Skia.Color('#000000'));
        outline.setStyle(1);
        outline.setStrokeWidth(FULL_BLEED.outline);
        outline.setStrokeJoin(1);
        const shadow = Skia.Paint();
        shadow.setAntiAlias(true);
        shadow.setColor(Skia.Color('rgba(0,0,0,0.55)'));
        const top =
          THUMB_V2.height - FULL_BLEED.bottomMargin - lines.length * cap - (lines.length - 1) * FULL_BLEED.lineGap;
        lines.forEach((line, i) => {
          let x = FULL_BLEED.sideMargin;
          const y = top + cap + i * (cap + FULL_BLEED.lineGap);
          for (const w of line) {
            canvas.drawText(w.word, x + 8, y + 10, shadow, font);
            canvas.drawText(w.word, x, y, outline, font);
            canvas.drawText(w.word, x, y, w.accent ? accent : fill, font);
            x += font.measureText(w.word).width + space;
          }
        });
      } else {
        const box = hootThumbBox();
        const rect = Skia.XYWHRect(box.x, box.y, box.size, box.size);
        const paint = Skia.Paint();
        paint.setAntiAlias(true);
        if (input.propUri) {
          const prop = await imageFrom(input.propUri);
          const s = Math.min(box.size / prop.width(), box.size / prop.height());
          const dw = prop.width() * s;
          const dh = prop.height() * s;
          canvas.drawImageRect(
            prop,
            Skia.XYWHRect(0, 0, prop.width(), prop.height()),
            Skia.XYWHRect(box.x + (box.size - dw) / 2, box.y + (box.size - dh) / 2, dw, dh),
            paint,
          );
          prop.dispose();
        } else {
          const pack = await ensureHootPack();
          const hoot = await imageFrom(pack[v.pose]);
          canvas.drawImageRect(hoot, Skia.XYWHRect(0, 0, hoot.width(), hoot.height()), rect, paint);
          hoot.dispose();
        }

        const lines = thumbnailLines(upper, widthAt);
        const size = thumbnailFontSize(
          lines.map((l) => l.map((w) => w.word).join(' ')),
          widthAt,
        );
        const font = Skia.Font(typeface ?? undefined, size);
        const cap = size * CAP_RATIO;
        const space = spaceWidth(font, size);
        const fill = Skia.Paint();
        fill.setAntiAlias(true);
        fill.setColor(Skia.Color(textColour(v.background)));
        const accent = Skia.Paint();
        accent.setAntiAlias(true);
        accent.setColor(Skia.Color(ACCENT_RED));
        lines.forEach((line, i) => {
          const text = line.map((w) => w.word).join(' ');
          let x = (THUMB_V2.width - lineWidth(font, text, size)) / 2;
          const y = TEXT_BAND.capTop + cap + i * (cap + TEXT_BAND.lineGap);
          for (const w of line) {
            canvas.drawText(w.word, x, y, w.accent ? accent : fill, font);
            x += font.measureText(w.word).width + space;
          }
        });
      }

      const image = surface.makeImageSnapshot();
      try {
        let bytes: Uint8Array | null = null;
        let ext = 'jpg';
        for (const quality of [92, 85, 75]) {
          if (bytes && bytes.length && bytes.length <= THUMB_MAX_BYTES) break;
          bytes = image.encodeToBytes(ImageFormat.JPEG, quality);
        }
        if (!bytes || !bytes.length) {
          bytes = image.encodeToBytes(ImageFormat.PNG, 100);
          ext = 'png';
        }
        if (!bytes || bytes.length > THUMB_MAX_BYTES) {
          throw new Error('The thumbnail came out over YouTube’s 2 MB limit.');
        }
        const file = bucketFile('thumbnails', input.slug, `thumb_${v.variant}.${ext}`);
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
