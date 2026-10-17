import type { SkCanvas, SkPath } from '@shopify/react-native-skia';
import type { HootOp, HootShape } from '@/core/hootSvg';
import { skia } from './skia';

function pathOf(shape: HootShape): SkPath {
  const { Skia } = skia();
  if (shape.kind === 'path') {
    const p = Skia.Path.MakeFromSVGString(shape.d);
    if (!p) throw new Error(`Hoot: unreadable path "${shape.d.slice(0, 30)}"`);
    return p;
  }
  const path = Skia.Path.Make();
  switch (shape.kind) {
    case 'circle':
      path.addCircle(shape.cx, shape.cy, shape.r);
      break;
    case 'ellipse':
      path.addOval(Skia.XYWHRect(shape.cx - shape.rx, shape.cy - shape.ry, shape.rx * 2, shape.ry * 2));
      break;
    case 'rect':
      path.addRRect(Skia.RRectXY(Skia.XYWHRect(shape.x, shape.y, shape.width, shape.height), shape.rx, shape.ry));
      break;
    case 'line':
      path.moveTo(shape.x1, shape.y1);
      path.lineTo(shape.x2, shape.y2);
      break;
    case 'polygon':
      shape.points.forEach(([x, y], i) => (i ? path.lineTo(x, y) : path.moveTo(x, y)));
      path.close();
      break;
  }
  return path;
}

/** Draws Hoot's parsed pose onto a canvas at `size` pixels square. */
export function drawHoot(canvas: SkCanvas, hoot: { size: number; ops: HootOp[] }, size: number): void {
  const { Skia, PaintStyle, StrokeCap, ClipOp } = skia();
  canvas.save();
  canvas.scale(size / hoot.size, size / hoot.size);
  for (const op of hoot.ops) {
    canvas.save();
    if (op.rotate) canvas.rotate(op.rotate.deg, op.rotate.cx, op.rotate.cy);
    if (op.clip) {
      const clip = Skia.Path.Make();
      for (const s of op.clip) clip.addPath(pathOf(s));
      canvas.clipPath(clip, ClipOp.Intersect, true);
    }
    const path = pathOf(op.shape);
    if (op.paint.fill) {
      const paint = Skia.Paint();
      paint.setAntiAlias(true);
      paint.setColor(Skia.Color(op.paint.fill));
      paint.setAlphaf(op.paint.opacity);
      canvas.drawPath(path, paint);
    }
    if (op.paint.stroke) {
      const paint = Skia.Paint();
      paint.setAntiAlias(true);
      paint.setStyle(PaintStyle.Stroke);
      paint.setStrokeWidth(op.paint.strokeWidth);
      paint.setStrokeCap(op.paint.round ? StrokeCap.Round : StrokeCap.Butt);
      paint.setColor(Skia.Color(op.paint.stroke));
      paint.setAlphaf(op.paint.opacity);
      canvas.drawPath(path, paint);
    }
    canvas.restore();
  }
  canvas.restore();
}
