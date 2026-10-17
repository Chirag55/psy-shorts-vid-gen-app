import type { SkFont, SkSurface } from '@shopify/react-native-skia';
import { Directory, File } from 'expo-file-system';
import type { StimulusCard } from '@/core/types';
import { captionTypeface, preloadCaptionFont } from './captionRenderer';
import { skia } from './skia';
import { makeRasterSurface } from './skiaSurface';
import { bucketDir } from './workspace';

const SIZES: Record<string, number> = { s: 0.045, m: 0.065, l: 0.09, xl: 0.14 };

function fontFor(px: number): SkFont {
  const { Skia } = skia();
  const typeface = captionTypeface();
  return typeface ? Skia.Font(typeface, px) : Skia.Font(undefined, px);
}

function wrap(text: string, font: SkFont, maxWidth: number): string[] {
  const lines: string[] = [];
  let line = '';
  for (const word of text.split(/\s+/).filter(Boolean)) {
    const candidate = line ? `${line} ${word}` : word;
    if (line && font.measureText(candidate).width > maxWidth) {
      lines.push(line);
      line = word;
    } else {
      line = candidate;
    }
  }
  if (line) lines.push(line);
  return lines;
}

/**
 * Draws a test Short's stimulus card as one PNG. With no card laid out, the
 * description is drawn as plain centred text so the Short still renders.
 */
export async function renderStimulusCard(input: {
  slug: string;
  width: number;
  height: number;
  card?: StimulusCard | null;
  description: string;
}): Promise<string> {
  await preloadCaptionFont();
  const { Skia, PaintStyle, ImageFormat } = skia();
  const { width, height } = input;
  const surface = makeRasterSurface<SkSurface>(Skia, width, height);
  try {
    const canvas = surface.getCanvas();
    const paint = Skia.Paint();
    paint.setAntiAlias(true);
    const card = input.card;
    canvas.clear(Skia.Color(card?.background ?? '#101418'));

    if (!card) {
      const px = Math.round(0.07 * width);
      const font = fontFor(px);
      const lines = wrap(input.description.toUpperCase(), font, width * 0.84);
      const lineHeight = px * 1.25;
      let y = Math.round(height / 2 - ((lines.length - 1) * lineHeight) / 2 + px * 0.35);
      paint.setColor(Skia.Color('#FFFFFF'));
      for (const line of lines) {
        const w = font.measureText(line).width;
        canvas.drawText(line, Math.round((width - w) / 2), y, paint, font);
        y += lineHeight;
      }
    } else {
      const bg = Skia.Color(card.background);
      const light = bg[0] + bg[1] + bg[2] > 1.5;
      const ink = light ? '#111111' : '#F2F2F2';

      if (card.frame === 'triangle' || card.frame === 'box') {
        const stroke = Skia.Paint();
        stroke.setAntiAlias(true);
        stroke.setStyle(PaintStyle.Stroke);
        stroke.setStrokeWidth(Math.max(4, Math.round(width * 0.012)));
        stroke.setColor(Skia.Color(ink));
        const ys = card.items.map((item) => item.y * height);
        const top = Math.max(
          height * 0.05,
          Math.min(...ys) - width * (card.frame === 'triangle' ? 0.6 : 0.25),
        );
        const bottom = Math.min(height * 0.95, Math.max(...ys) + width * 0.15);
        const path = Skia.Path.Make();
        if (card.frame !== 'triangle') {
          path.addRect(Skia.XYWHRect(width * 0.08, top, width * 0.84, bottom - top));
        } else {
          path.moveTo(width / 2, top);
          path.lineTo(width * 0.92, bottom);
          path.lineTo(width * 0.08, bottom);
          path.close();
        }
        canvas.drawPath(path, stroke);
      }

      for (const item of card.items) {
        const px = Math.round(SIZES[item.size] * width);
        const x = item.x * width;
        const y = item.y * height;
        paint.setColor(Skia.Color(item.color));
        if (item.text === '●' || item.text === '•') {
          canvas.drawCircle(x, y, px * 0.32, paint);
        } else if (item.text === '+') {
          const arm = px * 0.45;
          const thick = Math.max(3, px * 0.1);
          canvas.drawRect(Skia.XYWHRect(x - arm, y - thick / 2, arm * 2, thick), paint);
          canvas.drawRect(Skia.XYWHRect(x - thick / 2, y - arm, thick, arm * 2), paint);
        } else {
          const font = fontFor(px);
          const maxWidth = width * 0.84;
          const lines =
            font.measureText(item.text).width > maxWidth ? wrap(item.text, font, maxWidth) : [item.text];
          const lineHeight = px * 1.2;
          let ly = Math.round(y - ((lines.length - 1) * lineHeight) / 2 + px * 0.35);
          for (const line of lines) {
            const w = font.measureText(line).width || line.length * px * 0.55;
            const lx = Math.max(width * 0.04, Math.min(width * 0.96 - w, x - w / 2));
            canvas.drawText(line, Math.round(lx), ly, paint, font);
            ly += lineHeight;
          }
        }
      }
    }

    const image = surface.makeImageSnapshot();
    try {
      const bytes = image.encodeToBytes(ImageFormat.PNG, 100);
      if (!bytes) throw new Error('Skia could not encode the stimulus card.');
      const dir = new Directory(bucketDir('subs', input.slug), 'cards');
      if (!dir.exists) dir.create({ intermediates: true });
      const file = new File(dir, 'stimulus.png');
      file.create({ overwrite: true });
      file.write(bytes);
      return file.uri;
    } finally {
      image.dispose();
    }
  } finally {
    surface.dispose();
  }
}
