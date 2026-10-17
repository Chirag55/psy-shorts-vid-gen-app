/**
 * A small SVG reader for Hoot's poses: enough of SVG (basic shapes, groups,
 * clip paths, rotation) to draw him on a canvas without an SVG renderer.
 */

export type HootShape =
  | { kind: 'circle'; cx: number; cy: number; r: number }
  | { kind: 'ellipse'; cx: number; cy: number; rx: number; ry: number }
  | { kind: 'rect'; x: number; y: number; width: number; height: number; rx: number; ry: number }
  | { kind: 'path'; d: string }
  | { kind: 'line'; x1: number; y1: number; x2: number; y2: number }
  | { kind: 'polygon'; points: [number, number][] };

export interface HootPaint {
  fill?: string;
  stroke?: string;
  strokeWidth: number;
  round: boolean;
  opacity: number;
}

export interface HootOp {
  shape: HootShape;
  paint: HootPaint;
  rotate?: { deg: number; cx: number; cy: number };
  clip?: HootShape[];
}

const TAG = /<(\/?)([a-zA-Z]+)([^>]*?)(\/?)>/g;

type Attrs = Record<string, string>;

const attrsOf = (text: string): Attrs =>
  Object.fromEntries([...text.matchAll(/([a-zA-Z][\w-]*)="([^"]*)"/g)].map((m) => [m[1], m[2]]));

const num = (a: Attrs, name: string, fallback = 0): number => (a[name] !== undefined ? Number(a[name]) : fallback);

/** Text cannot be drawn from SVG here; those poses ship as PNGs. */
export const hasText = (svg: string): boolean => /<text\b/.test(svg);

function shapeOf(tag: string, a: Attrs): HootShape {
  switch (tag) {
    case 'circle':
      return { kind: 'circle', cx: num(a, 'cx'), cy: num(a, 'cy'), r: num(a, 'r') };
    case 'ellipse':
      return { kind: 'ellipse', cx: num(a, 'cx'), cy: num(a, 'cy'), rx: num(a, 'rx'), ry: num(a, 'ry') };
    case 'rect': {
      const rx = a.rx === undefined ? num(a, 'ry') : num(a, 'rx');
      const ry = a.ry !== undefined ? num(a, 'ry') : rx;
      return { kind: 'rect', x: num(a, 'x'), y: num(a, 'y'), width: num(a, 'width'), height: num(a, 'height'), rx, ry };
    }
    case 'path':
      return { kind: 'path', d: a.d ?? '' };
    case 'line':
      return { kind: 'line', x1: num(a, 'x1'), y1: num(a, 'y1'), x2: num(a, 'x2'), y2: num(a, 'y2') };
    case 'polygon': {
      const n = (a.points ?? '').trim().split(/[\s,]+/).map(Number);
      const points: [number, number][] = [];
      for (let i = 0; i + 1 < n.length; i += 2) points.push([n[i], n[i + 1]]);
      return { kind: 'polygon', points };
    }
    default:
      throw new Error(`Hoot SVG: <${tag}> is not supported`);
  }
}

function rotateOf(transform: string | undefined) {
  if (!transform) return undefined;
  const m = /^rotate\(\s*(-?[\d.]+)(?:[\s,]+(-?[\d.]+)[\s,]+(-?[\d.]+))?\s*\)$/.exec(transform.trim());
  if (!m) throw new Error(`Hoot SVG: transform "${transform}" is not supported`);
  return { deg: Number(m[1]), cx: Number(m[2] ?? 0), cy: Number(m[3] ?? 0) };
}

/** Hoot's SVG as a list of draw operations at its viewBox size. */
export function parseHootSvg(svg: string): { size: number; ops: HootOp[] } {
  if (hasText(svg)) throw new Error('Hoot SVG: text is not drawn from SVG; ship this state as a PNG');
  const root = attrsOf(/<svg\b([^>]*)>/.exec(svg)?.[1] ?? '');
  const size = Number((root.viewBox ?? '').split(/\s+/)[2] ?? root.width ?? 0);
  if (!(size > 0)) throw new Error('Hoot SVG: no viewBox size');
  const clips = new Map<string, HootShape[]>();
  const ops: HootOp[] = [];
  const groups: Attrs[] = [];
  let clipId: string | null = null;
  for (const [, close, tag, attrText, selfClose] of svg.matchAll(TAG)) {
    if (tag === 'svg') continue;
    if (tag === 'clipPath') {
      clipId = close ? null : (attrsOf(attrText).id ?? null);
      if (clipId) clips.set(clipId, []);
      continue;
    }
    if (tag === 'g') {
      if (close) groups.pop();
      else if (!selfClose) groups.push(attrsOf(attrText));
      continue;
    }
    if (close) continue;
    const a = attrsOf(attrText);
    const shape = shapeOf(tag, a);
    if (clipId) {
      clips.get(clipId)?.push(shape);
      continue;
    }
    const style: Attrs = Object.assign({}, ...groups, a);
    const fill =
      style.fill !== undefined ? (style.fill !== 'none' ? style.fill : undefined) : style.stroke ? undefined : '#000000';
    const stroke = style.stroke && style.stroke !== 'none' ? style.stroke : undefined;
    const clipRef = /url\(#([^)]+)\)/.exec(style['clip-path'] ?? '')?.[1];
    if (clipRef && !clips.has(clipRef)) throw new Error(`Hoot SVG: clip "${clipRef}" is used before it is defined`);
    ops.push({
      shape,
      paint: {
        fill,
        stroke,
        strokeWidth: num(style, 'stroke-width', 1),
        round: style['stroke-linecap'] === 'round',
        opacity: num(a, 'opacity', 1) * groups.reduce((o, g) => o * (g.opacity !== undefined ? Number(g.opacity) : 1), 1),
      },
      ...(a.transform || groups.some((g) => g.transform)
        ? { rotate: rotateOf(a.transform ?? groups.find((g) => g.transform)?.transform) }
        : {}),
      ...(clipRef ? { clip: clips.get(clipRef) } : {}),
    });
  }
  return { size, ops };
}
