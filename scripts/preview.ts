/** Composites rendered caption frames onto a dark backdrop so they can be eyeballed. */
import fs from 'node:fs';
import nodePath from 'node:path';
import { loadSkia } from './harness/skiaShim';

const dir = process.argv[2] ?? '.dryrun/outputs/subs/dryrun/caps_ch0';
const out = process.argv[3] ?? '.dryrun/preview.png';

const main = async () => {
  const { Skia, enums } = await loadSkia();
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.png')).sort().slice(0, 8);

  const first = Skia.Image.MakeImageFromEncoded(
    Skia.Data.fromBytes(new Uint8Array(fs.readFileSync(nodePath.join(dir, files[0]))))
  );
  const w = first.width();
  const h = first.height();
  first.dispose();

  const surface = Skia.Surface.Make(w, h * files.length);
  const canvas = surface.getCanvas();
  canvas.clear(Skia.Color('#241a12'));

  files.forEach((f, i) => {
    const img = Skia.Image.MakeImageFromEncoded(
      Skia.Data.fromBytes(new Uint8Array(fs.readFileSync(nodePath.join(dir, f))))
    );
    canvas.drawImage(img, 0, i * h);
    img.dispose();
  });

  const snap = surface.makeImageSnapshot();
  fs.writeFileSync(out, Buffer.from(snap.encodeToBytes(enums.ImageFormat.PNG, 100)));
  snap.dispose();
  surface.dispose();
  console.log(`wrote ${out} (${w}x${h * files.length}) from ${files.length} frames`);
};

main();
