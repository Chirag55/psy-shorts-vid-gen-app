/** Aspect ratios this close are scaled rather than cropped. */
const ASPECT_TOLERANCE = 0.01;

export interface FramePlan {
  mode: 'none' | 'scale' | 'cover';
  cropPercent: number;
}

/** How a picture of one size fills a frame of another: unchanged, scaled, or scaled and cropped. */
export function framePlan(width: number, height: number, targetWidth: number, targetHeight: number): FramePlan {
  if (!(width > 0 && height > 0)) return { mode: 'cover', cropPercent: 0 };
  if (width === targetWidth && height === targetHeight) return { mode: 'none', cropPercent: 0 };
  const aspect = width / height;
  const target = targetWidth / targetHeight;
  if (Math.abs(aspect - target) / target <= ASPECT_TOLERANCE) return { mode: 'scale', cropPercent: 0 };
  const kept = aspect > target ? target / aspect : aspect / target;
  return { mode: 'cover', cropPercent: Math.round((1 - kept) * 1000) / 10 };
}

export function frameFilter(plan: FramePlan, width: number, height: number): string {
  if (plan.mode === 'none') return '';
  if (plan.mode === 'scale') return `scale=${width}:${height}`;
  return `scale=${width}:${height}:force_original_aspect_ratio=increase,crop=${width}:${height}`;
}

/** A warning when an imported picture is the wrong shape and will be cropped. */
export function framingProblems(
  size: { width: number; height: number },
  target: { width: number; height: number } = { width: 1080, height: 1920 },
): string[] {
  if (!(size.width > 0 && size.height > 0)) return [];
  const plan = framePlan(size.width, size.height, target.width, target.height);
  if (plan.mode !== 'cover') return [];
  const shape = target.width < target.height ? 'portrait 9:16' : 'landscape 16:9';
  return [
    `it is ${size.width}x${size.height}, not ${shape}: the render crops ${plan.cropPercent}% of it to fill the frame (set Flow to ${shape} and generate it again for the whole picture)`,
  ];
}
