import nodePath from 'node:path';
import Module from 'node:module';
import * as fsShim from './fsShim';

/**
 * Loads the real React Native Skia JavaScript API, backed by CanvasKit.
 *
 * This is the same `Skia` object the app uses — same factories, same argument
 * shapes, same null-return behaviour — with the WebAssembly build of Skia
 * underneath instead of the Android one. It cannot reproduce Android's GPU
 * threading, but it does execute every drawing call for real and produce real
 * PNGs, which is what makes a dry run worth anything.
 */

export interface LoadedSkia {
  Skia: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  enums: any;
}

export async function loadSkia(): Promise<LoadedSkia> {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const CanvasKitInit = require('canvaskit-wasm');
  const wasmDir = nodePath.dirname(require.resolve('canvaskit-wasm'));

  const CanvasKit = await CanvasKitInit({
    locateFile: (file: string) => nodePath.join(wasmDir, file),
  });

  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { JsiSkApi } = require('@shopify/react-native-skia/lib/commonjs/skia/web');
  const Skia = JsiSkApi(CanvasKit);

  // `measureText` is the one call the renderer needs that the web backend
  // leaves unimplemented. CanvasKit exposes the pieces Skia's own
  // implementation uses, so it is reconstructed faithfully here (sum of glyph
  // advances) rather than approximated — otherwise the wrap logic under test
  // would be measuring against numbers the device would never produce.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { JsiSkFont } = require('@shopify/react-native-skia/lib/commonjs/skia/web/JsiSkFont');
  if (JsiSkFont && !JsiSkFont.prototype.__measurePolyfilled) {
    JsiSkFont.prototype.measureText = function measureText(text: string, paint?: unknown) {
      const ids = this.getGlyphIDs(text);
      const widths = this.getGlyphWidths(ids, paint ?? null);
      const width = widths.reduce((sum: number, w: number) => sum + w, 0);
      const metrics = this.getMetrics();
      const height = Math.abs(metrics.descent - metrics.ascent);
      return { x: 0, y: metrics.ascent ?? 0, width, height };
    };
    JsiSkFont.prototype.__measurePolyfilled = true;
  }

  // The enums are plain JavaScript objects in the types module — no native code
  // involved — so the real ones can be used rather than hand-copied constants
  // that could silently drift from them.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const enums = require('@shopify/react-native-skia/lib/commonjs/skia/types');

  return { Skia, enums };
}

/**
 * Redirects the two modules the renderer pulls in natively.
 *
 * Patching the loader rather than editing the source means the dry run tests
 * the shipped code exactly as written.
 */
export function installModuleShims(skia: LoadedSkia): void {
  const loader = (Module as any)._load;

  (Module as any)._load = function patched(request: string, parent: unknown, isMain: boolean) {
    if (request === 'expo-file-system') return fsShim;
    if (request === '@shopify/react-native-skia') {
      return { ...skia.enums, Skia: skia.Skia };
    }
    return loader.apply(this, [request, parent, isMain]);
  };
}
