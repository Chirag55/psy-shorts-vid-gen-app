import type { SkSurface } from '@shopify/react-native-skia';
import { Directory, File } from 'expo-file-system';
import { CARD_CANVAS, cardFrameCount, cardKey, cardOps, type Card } from '@/core/cards';
import { captionTypeface, preloadCaptionFont } from './captionRenderer';
import { skia } from './skia';
import { makeRasterSurface } from './skiaSurface';
import { bucketDir } from './workspace';

/**
 * Draws every frame of a data card as a PNG at the output size; frames already
 * on disk are reused, so a re-render redraws only what changed.
 */
export async function renderCardFrames(
  card: Card,
  size: { slug: string; width: number; height: number },
): Promise<string[]> {
  await preloadCaptionFont();
  const { Skia, PaintStyle, ImageFormat } = skia();
  const typeface = captionTypeface();
  const measure = (text: string, px: number) => Skia.Font(typeface ?? undefined, px).measureText(text).width;
  const dir = new Directory(bucketDir('subs', size.slug), 'cards');
  if (!dir.exists) dir.create({ intermediates: true });
  const key = cardKey(card, String(size.width));
  const uris: string[] = [];
  for (let i = 0; i < cardFrameCount(card); i++) {
    const file = new File(dir, `card_${key}_${i}.png`);
    if (file.exists && file.size > 0) {
      uris.push(file.uri);
      continue;
    }
    const surface = makeRasterSurface<SkSurface>(Skia, size.width, size.height);
    try {
      const canvas = surface.getCanvas();
      canvas.scale(size.width / CARD_CANVAS.width, size.height / CARD_CANVAS.height);
      const fill = Skia.Paint();
      fill.setAntiAlias(true);
      fill.setStyle(PaintStyle.Fill);
      const stroke = Skia.Paint();
      stroke.setAntiAlias(true);
      stroke.setStyle(PaintStyle.Stroke);
      for (const op of cardOps(card, i, measure)) {
        if (op.op === 'text') {
          const font = Skia.Font(typeface ?? undefined, op.size);
          fill.setColor(Skia.Color(op.colour));
          canvas.drawText(op.text, op.cx - font.measureText(op.text).width / 2, op.baseline, fill, font);
        } else if (op.op === 'poly') {
          const path = Skia.Path.Make();
          op.points.forEach(([x, y], n) => (n ? path.lineTo(x, y) : path.moveTo(x, y)));
          path.close();
          fill.setColor(Skia.Color(op.fill));
          canvas.drawPath(path, fill);
        } else if (op.op === 'circle') {
          if (op.fill) {
            fill.setColor(Skia.Color(op.fill));
            canvas.drawCircle(op.cx, op.cy, op.r, fill);
          }
          if (op.stroke) {
            stroke.setColor(Skia.Color(op.stroke));
            stroke.setStrokeWidth(op.strokeWidth ?? 6);
            canvas.drawCircle(op.cx, op.cy, op.r, stroke);
          }
        } else {
          const rect = Skia.XYWHRect(op.x, op.y, op.w, op.h);
          const rounded = op.radius ? Skia.RRectXY(rect, op.radius, op.radius) : null;
          if (op.fill) {
            fill.setColor(Skia.Color(op.fill));
            if (rounded) canvas.drawRRect(rounded, fill);
            else canvas.drawRect(rect, fill);
          }
          if (op.stroke) {
            stroke.setColor(Skia.Color(op.stroke));
            stroke.setStrokeWidth(op.strokeWidth ?? 6);
            if (rounded) canvas.drawRRect(rounded, stroke);
            else canvas.drawRect(rect, stroke);
          }
        }
      }
      const image = surface.makeImageSnapshot();
      try {
        const bytes = image.encodeToBytes(ImageFormat.PNG, 100);
        if (!bytes || !bytes.length) throw new Error('Skia could not encode a card.');
        file.create({ overwrite: true });
        file.write(bytes);
        uris.push(file.uri);
      } finally {
        image.dispose();
      }
    } finally {
      surface.dispose();
    }
  }
  return uris;
}
