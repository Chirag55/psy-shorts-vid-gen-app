/**
 * The Skia drawing API, loaded on first use: its native setup first, then the
 * core module, skipping the React components the renderers never need.
 */
export const SKIA_NATIVE_SETUP = '@shopify/react-native-skia/lib/module/skia/NativeSetup';
export const SKIA_ENTRY = '@shopify/react-native-skia/lib/module/skia';

type SkiaCore = typeof import('@shopify/react-native-skia/lib/module/skia');

let cached: SkiaCore | null = null;

export function skia(): SkiaCore {
  if (cached) return cached;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    require('@shopify/react-native-skia/lib/module/skia/NativeSetup');
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    cached = require('@shopify/react-native-skia/lib/module/skia') as SkiaCore;
    return cached;
  } catch (e) {
    throw new Error(
      `The drawing engine could not be loaded, so captions and the mascot are unavailable: ${e instanceof Error ? e.message : String(e)}`,
    );
  }
}
