import { File } from 'expo-file-system';
import { assessTransparency, clearConnectedBackground, type TransparencyReport } from '@/core/floodFill';
import { bucketFile } from './workspace';

/**
 * Prepares a mascot image for overlay by removing its background once, at
 * import time.
 *
 * Doing it here rather than during the render is deliberate: it happens once
 * instead of on every chapter of every render, the result can be inspected
 * before it reaches a video, and a bad import can be reported while the user is
 * still looking at the screen that caused it.
 */

type SkiaModule = typeof import('@shopify/react-native-skia');

let cachedSkia: SkiaModule | null = null;

function skia(): SkiaModule {
  if (!cachedSkia) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    cachedSkia = require('@shopify/react-native-skia') as SkiaModule;
  }
  return cachedSkia;
}

export interface PreparedMascot {
  uri: string;
  report: TransparencyReport;
}

/**
 * Reads the source image, clears background connected to its border, and writes
 * a transparent PNG into the workspace.
 */
export async function prepareMascot(sourceUri: string, emotion: string): Promise<PreparedMascot> {
  const { Skia, AlphaType, ColorType, ImageFormat } = skia();

  const data = await Skia.Data.fromURI(sourceUri);
  const source = Skia.Image.MakeImageFromEncoded(data);
  if (!source) throw new Error('That image could not be decoded. Try a PNG or JPG.');

  const width = source.width();
  const height = source.height();

  // A mascot overlay is never displayed above a few hundred pixels wide, so a
  // multi-megapixel source buys nothing and costs a pixel buffer of
  // width*height*4 bytes plus a flood-fill stack over every pixel.
  const MAX_PIXELS = 4_000_000;
  if (width * height > MAX_PIXELS) {
    source.dispose();
    data.dispose();
    throw new Error(
      `That image is ${width}x${height}, which is larger than this needs. Scale it to roughly 600px wide and import it again.`
    );
  }

  const info = {
    width,
    height,
    colorType: ColorType.RGBA_8888,
    alphaType: AlphaType.Unpremul,
  };

  const raw = source.readPixels(0, 0, info);
  source.dispose();
  data.dispose();
  if (!raw) throw new Error('Could not read the image pixels.');

  const pixels = raw instanceof Uint8Array ? raw : new Uint8Array(raw.buffer);
  const cleared = clearConnectedBackground(pixels, width, height);
  const report = assessTransparency(cleared, width * height);

  const output = Skia.Image.MakeImage(info, Skia.Data.fromBytes(pixels), width * 4);
  if (!output) throw new Error('Could not rebuild the image after removing its background.');

  let bytes: Uint8Array | null;
  try {
    bytes = output.encodeToBytes(ImageFormat.PNG, 100);
  } finally {
    output.dispose();
  }
  if (!bytes) throw new Error('Could not encode the transparent PNG.');

  const target: File = bucketFile('stills', '_mascot', `${emotion}.png`);
  if (target.exists) target.delete();
  target.create({ intermediates: true, overwrite: true });
  target.write(bytes);

  return { uri: target.uri, report };
}
