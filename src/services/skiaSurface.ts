/**
 * Offscreen surface allocation.
 *
 * Everything this app draws offscreen is destined for a PNG on disk — caption
 * bands and the mascot cut-out — and is never shown on screen. That makes the
 * GPU the wrong tool, and on Android an actively dangerous one.
 *
 * `Skia.Surface.MakeOffscreen` allocates a real GPU backend texture through a
 * thread-local `GrDirectContext`, wraps it with a release callback that calls
 * `deleteBackendTexture`, and requires the EGL context to be current on the
 * calling thread both when the texture is created and when it is finally
 * destroyed. Destruction is deferred into Skia's command stream, so a loop that
 * creates and drops one surface per caption frame leaves a queue of pending
 * texture deletions racing against the UI thread's own use of the shared EGL
 * display. When that race is lost the process is killed by the driver: no
 * JavaScript exception, no stack, nothing an error boundary can catch. It is
 * timing-dependent, which is why the same chapter could render once and take
 * the app down the next time.
 *
 * `Skia.Surface.Make` is the CPU raster equivalent: a plain heap allocation,
 * no EGL, no driver, no thread affinity, no deferred destruction. For work that
 * is immediately encoded to bytes it is also no slower in practice, because the
 * GPU path has to read every pixel back across the bus anyway.
 *
 * So: nothing in this app may call `MakeOffscreen`. A test enforces it.
 */

type SkiaLike = {
  Surface: { Make: (width: number, height: number) => unknown | null };
};

/** Largest raster surface worth allocating, in pixels. */
export const MAX_SURFACE_PIXELS = 8_000_000;

export interface SurfacePlan {
  ok: boolean;
  reason?: string;
}

/**
 * Checks a requested size before asking Skia for the memory.
 *
 * A zero or negative dimension makes Skia return null, and an absurd one makes
 * it allocate until the OS kills the process. Both are caught here so the
 * failure is a message rather than a death.
 */
export function checkSurfaceSize(width: number, height: number): SurfacePlan {
  if (!Number.isFinite(width) || !Number.isFinite(height)) {
    return { ok: false, reason: 'The surface size is not a number.' };
  }
  if (width < 1 || height < 1) {
    return { ok: false, reason: `A ${width}x${height} surface has no area to draw on.` };
  }
  const pixels = width * height;
  if (pixels > MAX_SURFACE_PIXELS) {
    return {
      ok: false,
      reason: `A ${width}x${height} surface needs ${Math.round((pixels * 4) / 1e6)}MB, which is more than is safe to allocate.`,
    };
  }
  return { ok: true };
}

/**
 * Allocates a CPU raster surface, or throws with a reason.
 *
 * Returning null is what Skia does; throwing is what the callers need, because
 * a null that is not checked becomes a native crash one line later.
 */
export function makeRasterSurface<T>(skia: SkiaLike, width: number, height: number): T {
  const plan = checkSurfaceSize(width, height);
  if (!plan.ok) throw new Error(plan.reason);

  const surface = skia.Surface.Make(Math.round(width), Math.round(height));
  if (!surface) {
    throw new Error(`Skia could not allocate a ${width}x${height} drawing surface.`);
  }
  return surface as T;
}
