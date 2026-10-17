import type { SkSurface } from '@shopify/react-native-skia';
import { HOOT_PNG_BASE64, HOOT_PNG_BYTES, HOOT_PNG_SIZE, HOOT_SVG } from '@/assets/hootAssets';
import { HOOT_POSES, HOOT_VERSION } from '@/core/hoot';
import { parseHootSvg } from '@/core/hootSvg';
import { run, type RunOptions } from './ffmpeg';
import { drawHoot } from './drawHoot';
import { skia } from './skia';
import { makeRasterSurface } from './skiaSurface';
import { bucketFile, toFsPath, writeBase64 } from './workspace';

/** Workspace folder for this version's poses, so an update redraws them. */
const PACK_SLUG = `_hoot_v${HOOT_VERSION.replace(/\./g, '_')}`;

function drawToFile(pose: string, svg: string, expectedUri: string): void {
  const { Skia, ImageFormat } = skia();
  const surface = makeRasterSurface<SkSurface>(Skia, HOOT_PNG_SIZE, HOOT_PNG_SIZE);
  try {
    const canvas = surface.getCanvas();
    canvas.clear(Skia.Color('transparent'));
    drawHoot(canvas, parseHootSvg(svg), HOOT_PNG_SIZE);
    const image = surface.makeImageSnapshot();
    try {
      const bytes = image.encodeToBytes(ImageFormat.PNG, 100);
      if (!bytes?.length) throw new Error(`Hoot "${pose}" could not be encoded.`);
      const file = bucketFile('stills', PACK_SLUG, `hoot_${pose}.png`);
      if (file.exists) file.delete();
      file.create({ intermediates: true, overwrite: true });
      file.write(bytes);
      if (file.uri !== expectedUri) throw new Error('Hoot pack path changed while writing.');
    } finally {
      image.dispose();
    }
  } finally {
    surface.dispose();
  }
}

/** Every pose as a full-size PNG in the workspace: drawn from SVG, or written from the bundled PNG. */
export async function ensureHootPack(): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  for (const pose of HOOT_POSES) {
    const file = bucketFile('stills', PACK_SLUG, `hoot_${pose}.png`);
    const svg = HOOT_SVG[pose];
    if (svg) {
      if (!file.exists || file.size < 1000) drawToFile(pose, svg, file.uri);
    } else {
      const png = HOOT_PNG_BASE64[pose];
      if (!png) throw new Error(`Hoot "${pose}" is missing from the bundled pack.`);
      if (!file.exists || file.size !== HOOT_PNG_BYTES[pose]) {
        if (file.exists) file.delete();
        writeBase64(file, png);
      }
    }
    out[pose] = file.uri;
  }
  return out;
}

/** Every pose scaled to `width` (mirrored when Hoot stands on the left), plus a transparent "none". */
export async function hootAtWidth(width: number, mirror: boolean, options: RunOptions = {}): Promise<Record<string, string>> {
  const pack = await ensureHootPack();
  const tag = `${width}${mirror ? 'm' : ''}`;
  const out: Record<string, string> = {};
  for (const pose of HOOT_POSES) {
    const file = bucketFile('stills', PACK_SLUG, `w${tag}_${pose}.png`);
    if (!file.exists || !file.size) {
      const vf = `scale=${width}:${width}:flags=lanczos${mirror ? ',hflip' : ''},format=rgba`;
      await run(['-y', '-i', toFsPath(pack[pose]), '-vf', vf, '-frames:v', '1', toFsPath(file.uri)], options);
    }
    out[pose] = file.uri;
  }
  const none = bucketFile('stills', PACK_SLUG, `w${width}_none.png`);
  if (!none.exists || !none.size) {
    await run(
      [
        '-y',
        '-i',
        toFsPath(pack.idle),
        '-vf',
        `scale=${width}:${width},format=rgba,colorchannelmixer=aa=0`,
        '-frames:v',
        '1',
        toFsPath(none.uri),
      ],
      options,
    );
  }
  out.none = none.uri;
  return out;
}
