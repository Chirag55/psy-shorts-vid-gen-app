import type { SkSurface } from '@shopify/react-native-skia';
import { File } from 'expo-file-system';
import { assessTransparency, clearConnectedBackground, type TransparencyReport } from '@/core/floodFill';
import { guardImageBytes, planDecodeSize } from '@/core/binaryGuards';
import { bucketFile } from './workspace';
import { makeRasterSurface } from './skiaSurface';
import { mark } from './breadcrumbs';

/**
 * Prepares a mascot image for overlay by removing its background once, at
 * import time.
 *
 * Doing it here rather than during the render means it happens once instead of
 * on every chapter, the result can be checked before it reaches a video, and a
 * bad import is reported while the user is still on the screen that caused it.
 *
 * Every step that hands data to native code is guarded. Skia's loaders return
 * empty data instead of throwing when they cannot read a source, and the next
 * call passes that to an image decoder, which segfaults — taking the process
 * down with no JavaScript error to show. Bytes are therefore read and checked
 * in JavaScript first.
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
  /** Set when the source was larger than is sensible and was scaled down. */
  downscaledTo?: { width: number; height: number };
}

/**
 * Reads the bytes of a picked image.
 *
 * The picker can hand back a URI that Skia's own loader cannot resolve, so the
 * file is read here and the bytes are passed directly. That also makes the
 * header check possible.
 */
async function readImageBytes(sourceUri: string): Promise<Uint8Array> {
  const file = new File(sourceUri);
  if (!file.exists) {
    throw new Error('That image could not be found. Try picking it again.');
  }
  return file.bytes();
}

export async function prepareMascot(sourceUri: string, emotion: string): Promise<PreparedMascot> {
  const doneRead = mark(`Reading mascot image (${emotion})`);
  let bytes: Uint8Array;
  try {
    bytes = await readImageBytes(sourceUri);
  } finally {
    doneRead();
  }

  const guard = guardImageBytes(bytes);
  if (!guard.ok) throw new Error(guard.reason ?? 'That file is not a readable image.');

  const { Skia, AlphaType, ColorType, ImageFormat } = skia();

  const doneDecode = mark(`Decoding mascot image (${emotion}, ${bytes.length} bytes)`);
  let source;
  try {
    source = Skia.Image.MakeImageFromEncoded(Skia.Data.fromBytes(bytes));
  } finally {
    doneDecode();
  }
  if (!source) throw new Error('That image could not be decoded. Export it as a PNG and try again.');

  const sourceWidth = source.width();
  const sourceHeight = source.height();

  // A huge source is scaled down rather than refused: readPixels materialises
  // width*height*4 bytes in JavaScript and the flood fill allocates two more
  // arrays over the same pixel count, so a phone photo would be hundreds of
  // megabytes before anything is drawn.
  const plan = planDecodeSize(sourceWidth, sourceHeight);
  const width = plan.targetWidth;
  const height = plan.targetHeight;

  const info = {
    width,
    height,
    colorType: ColorType.RGBA_8888,
    alphaType: AlphaType.Unpremul,
  };

  // Pixels are read from whichever image ends up at the working size. The
  // surface below is a CPU raster one for the same reason the caption renderer
  // uses one: a GPU-backed offscreen surface ties its texture's lifetime to the
  // EGL context and kills the process if that goes wrong, and this image is
  // headed straight for `readPixels` anyway.
  const doneRead2 = mark(`Reading mascot pixels (${width}x${height})`);
  let raw;
  try {
    if (plan.wasDownscaled) {
      const surface = makeRasterSurface<SkSurface>(Skia, width, height);
      try {
        const canvas = surface.getCanvas();
        canvas.clear(Skia.Color('#00000000'));
        const paint = Skia.Paint();
        paint.setAntiAlias(true);
        canvas.drawImageRect(
          source,
          { x: 0, y: 0, width: sourceWidth, height: sourceHeight },
          { x: 0, y: 0, width, height },
          paint
        );
        // Read from the snapshot while the surface is still alive, so there is
        // never an image outliving the buffer it borrows.
        const scaled = surface.makeImageSnapshot();
        try {
          raw = scaled.readPixels(0, 0, info);
        } finally {
          scaled.dispose();
        }
      } finally {
        surface.dispose();
      }
    } else {
      raw = source.readPixels(0, 0, info);
    }
  } finally {
    source.dispose();
    doneRead2();
  }
  if (!raw) throw new Error('Could not read the image pixels.');

  const pixels = raw instanceof Uint8Array ? raw : new Uint8Array(raw.buffer);

  const doneFill = mark(`Removing mascot background (${width}x${height})`);
  let cleared: number;
  try {
    cleared = clearConnectedBackground(pixels, width, height);
  } finally {
    doneFill();
  }
  const report = assessTransparency(cleared, width * height);

  const doneEncode = mark('Encoding transparent mascot PNG');
  let encoded: Uint8Array | null;
  try {
    const output = Skia.Image.MakeImage(info, Skia.Data.fromBytes(pixels), width * 4);
    if (!output) throw new Error('Could not rebuild the image after removing its background.');
    try {
      encoded = output.encodeToBytes(ImageFormat.PNG, 100);
    } finally {
      output.dispose();
    }
  } finally {
    doneEncode();
  }
  if (!encoded) throw new Error('Could not encode the transparent PNG.');

  const target: File = bucketFile('stills', '_mascot', `${emotion}.png`);
  if (target.exists) target.delete();
  target.create({ intermediates: true, overwrite: true });
  target.write(encoded);

  return {
    uri: target.uri,
    report,
    downscaledTo: plan.wasDownscaled ? { width, height } : undefined,
  };
}
