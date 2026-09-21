/**
 * Border flood-fill for mascot transparency.
 *
 * This replaces keying out every white pixel, which was actively wrong for this
 * mascot: Professor Hoot is mostly white — white face, white belly, white eyes —
 * so a colour key punches holes straight through him. The desktop studio never
 * had this problem because it flood-fills inward from the edges, removing only
 * background that is *connected* to the border. White enclosed by the character
 * is left alone.
 *
 * Kept free of Skia imports so the algorithm can be tested directly on plain
 * pixel arrays.
 */

export interface FloodFillOptions {
  /** A pixel this bright on every channel counts as background. */
  threshold?: number;
  /**
   * Alpha applied to pixels on the boundary between kept and removed regions.
   * Softening the edge avoids the hard fringe a binary cut leaves behind.
   */
  featherEdges?: boolean;
}

/**
 * Clears background connected to the image border, in place.
 *
 * `pixels` is RGBA, 4 bytes per pixel, row-major. Returns how many pixels were
 * made transparent, which is a useful sanity signal: zero means nothing was
 * removed, and near-total means the threshold ate the subject.
 */
export function clearConnectedBackground(
  pixels: Uint8Array,
  width: number,
  height: number,
  options: FloodFillOptions = {}
): number {
  const threshold = options.threshold ?? 230;
  const total = width * height;
  if (pixels.length < total * 4 || total === 0) return 0;

  const isBackground = (index: number): boolean => {
    const p = index * 4;
    return pixels[p] >= threshold && pixels[p + 1] >= threshold && pixels[p + 2] >= threshold;
  };

  const visited = new Uint8Array(total);
  // An explicit stack rather than recursion: a 1024x1024 image would blow the
  // call stack long before it finished.
  const stack: number[] = [];

  const push = (index: number) => {
    if (visited[index]) return;
    visited[index] = 1;
    if (isBackground(index)) stack.push(index);
  };

  // Seed from every border pixel.
  for (let x = 0; x < width; x++) {
    push(x);
    push((height - 1) * width + x);
  }
  for (let y = 0; y < height; y++) {
    push(y * width);
    push(y * width + width - 1);
  }

  let cleared = 0;

  while (stack.length) {
    const index = stack.pop() as number;
    pixels[index * 4 + 3] = 0;
    cleared++;

    const x = index % width;
    const y = (index - x) / width;

    if (x > 0) push(index - 1);
    if (x < width - 1) push(index + 1);
    if (y > 0) push(index - width);
    if (y < height - 1) push(index + width);
  }

  if (options.featherEdges !== false) featherBoundary(pixels, width, height);

  return cleared;
}

/**
 * Halves alpha on opaque pixels that touch a cleared one.
 *
 * Without it the cut edge is a hard staircase against the video behind it,
 * which is exactly the fringing the desktop implementation was written to
 * avoid.
 */
function featherBoundary(pixels: Uint8Array, width: number, height: number): void {
  const edges: number[] = [];

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const index = y * width + x;
      if (pixels[index * 4 + 3] === 0) continue;

      const neighbourCleared =
        (x > 0 && pixels[(index - 1) * 4 + 3] === 0) ||
        (x < width - 1 && pixels[(index + 1) * 4 + 3] === 0) ||
        (y > 0 && pixels[(index - width) * 4 + 3] === 0) ||
        (y < height - 1 && pixels[(index + width) * 4 + 3] === 0);

      if (neighbourCleared) edges.push(index);
    }
  }

  // Collected first, then applied, so feathering cannot cascade inward.
  for (const index of edges) {
    pixels[index * 4 + 3] = Math.round(pixels[index * 4 + 3] * 0.5);
  }
}

export interface TransparencyReport {
  clearedPixels: number;
  totalPixels: number;
  clearedFraction: number;
  /** Set when the result looks wrong enough to be worth telling the user. */
  warning?: string;
}

/**
 * Judges whether a flood fill produced something usable.
 *
 * A mascot import is the kind of thing that fails silently — the overlay just
 * looks wrong in the finished render — so the outcome is checked rather than
 * assumed.
 */
export function assessTransparency(cleared: number, total: number): TransparencyReport {
  const clearedFraction = total > 0 ? cleared / total : 0;

  let warning: string | undefined;
  if (clearedFraction === 0) {
    warning =
      'No background was removed. The image may already have transparency, or its background may not be white.';
  } else if (clearedFraction > 0.95) {
    warning = 'Almost the entire image was removed — it may be blank, or very pale throughout.';
  } else if (clearedFraction < 0.02) {
    warning = 'Very little was removed. If the mascot still has a visible backdrop, its background may not be white enough.';
  }

  return { clearedPixels: cleared, totalPixels: total, clearedFraction, warning };
}
