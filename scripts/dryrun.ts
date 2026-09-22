/**
 * Dry run: renders caption frames and prepares a mascot with real Skia, in Node.
 *
 * Every hard crash so far has been a native call that JavaScript could not see
 * failing. This runs those same calls for real — real font bytes, real layout,
 * real surfaces, real PNG encoding — so the drawing path is exercised before an
 * APK is built rather than after the user's phone dies on it.
 */
import nodePath from 'node:path';
import fs from 'node:fs';
import { loadSkia, installModuleShims } from './harness/skiaShim';
import { setRoot } from './harness/fsShim';

const OUT = nodePath.join(process.cwd(), '.dryrun');

async function main() {
  fs.rmSync(OUT, { recursive: true, force: true });
  fs.mkdirSync(OUT, { recursive: true });
  setRoot(OUT);

  const skia = await loadSkia();
  installModuleShims(skia);

  let failures = 0;
  const fail = (msg: string) => {
    failures++;
    console.error(`  FAIL  ${msg}`);
  };
  const pass = (msg: string) => console.log(`  ok    ${msg}`);

  // Imported after the shims are installed so the renderer picks them up.
  const { renderCaptionFrames, captionStyleFor, preloadCaptionFont } = await import(
    '../src/services/captionRenderer'
  );
  const { buildCaptionFrames } = await import('../src/core/captions');

  console.log('\n[1] Caption font');
  await preloadCaptionFont();
  const { Skia } = skia;
  // Confirm the embedded font actually produced glyphs, not a silent fallback.
  const { ANTON_REGULAR_BASE64, ANTON_BYTE_LENGTH } = await import('../src/assets/antonFont');
  const { base64ToBytes, guardFontBytes } = await import('../src/core/binaryGuards');
  const fontBytes = base64ToBytes(ANTON_REGULAR_BASE64);
  if (fontBytes.length !== ANTON_BYTE_LENGTH) fail(`font decoded to ${fontBytes.length}`);
  else pass(`Anton decoded to ${fontBytes.length} bytes`);
  const guard = guardFontBytes(fontBytes, ANTON_BYTE_LENGTH);
  if (!guard.ok) fail(`font guard: ${guard.reason}`);
  else pass('font guard passed');

  const tf = Skia.Typeface.MakeFreeTypeFaceFromData(Skia.Data.fromBytes(fontBytes));
  if (!tf) fail('Skia refused the embedded Anton bytes');
  else pass('Skia built a typeface from the embedded bytes');

  console.log('\n[2] Caption frames (the step that crashed)');
  const words = Array.from({ length: 70 }, (_, i) => ({
    word: ['MANIPULATION', 'STARTS', 'WITH', 'A', 'COMPLIMENT', 'YOU', 'DIDNT', 'ASK', 'FOR'][i % 9],
    start: i * 0.32,
    end: i * 0.32 + 0.3,
  }));
  const frames = buildCaptionFrames(words, { singleWord: true });
  const style = captionStyleFor('short', 720, 1280);
  console.log(`  style ${style.width}x${style.height} @ ${style.fontSize}px, ${frames.length} frames`);

  const started = Date.now();
  let peakRss = 0;
  const rssTimer = setInterval(() => {
    peakRss = Math.max(peakRss, process.memoryUsage().rss);
  }, 20);

  const result = await renderCaptionFrames({
    frames,
    slug: 'dryrun',
    key: 'ch0',
    style,
    totalDuration: words[words.length - 1].end,
    onProgress: (done, total) => {
      if (done === total) console.log(`  rendered ${done}/${total}`);
    },
  });
  clearInterval(rssTimer);

  if (!result) {
    fail('renderCaptionFrames returned null');
  } else {
    pass(`rendered ${result.frameCount} frames in ${Date.now() - started}ms`);
    const dir = nodePath.join(OUT, 'outputs', 'subs', 'dryrun', 'caps_ch0');
    const pngs = fs.readdirSync(dir).filter((f) => f.endsWith('.png'));
    pass(`${pngs.length} PNG files on disk, peak RSS ${(peakRss / 1e6).toFixed(0)}MB`);

    // A PNG that is only a header means the draw produced nothing.
    let empties = 0;
    let smallest = Infinity;
    for (const f of pngs) {
      const size = fs.statSync(nodePath.join(dir, f)).size;
      smallest = Math.min(smallest, size);
      if (size < 200) empties++;
    }
    if (empties > 1) fail(`${empties} frames are effectively blank (smallest ${smallest}B)`);
    else pass(`frames carry real pixel data (smallest ${smallest}B)`);

    const list = fs.readFileSync(nodePath.join(dir, 'frames.txt'), 'utf8');

    // Every file the concat list names must exist. Reusing a frame for a
    // repeated word is only safe if the reference still resolves.
    const referenced = Array.from(list.matchAll(/^file '([^']+)'$/gm)).map((m) => m[1]);
    const missing = referenced.filter((f) => !fs.existsSync(nodePath.join(dir, f)));
    if (missing.length) fail(`concat list references missing files: ${missing.slice(0, 3).join(', ')}`);
    else pass(`all ${new Set(referenced).size} referenced files exist (${pngs.length} drawn for ${result.frameCount} entries)`);
    const declared = (list.match(/^file /gm) ?? []).length;
    if (declared !== result.frameCount + 1) {
      fail(`concat list has ${declared} entries for ${result.frameCount} frames`);
    } else {
      pass(`concat list matches (${declared} entries incl. the repeated last)`);
    }

    const totalDur = Array.from(list.matchAll(/^duration ([\d.]+)$/gm)).reduce(
      (s, m) => s + Number(m[1]),
      0
    );
    if (Math.abs(totalDur - words[words.length - 1].end) > 0.1) {
      fail(`durations sum to ${totalDur.toFixed(2)}s, expected ${words[words.length - 1].end.toFixed(2)}s`);
    } else {
      pass(`durations cover the chapter (${totalDur.toFixed(2)}s)`);
    }
  }

  console.log('\n[3] Repeated runs (the crash was not on the first pass)');
  for (let run = 0; run < 5; run++) {
    const r = await renderCaptionFrames({
      frames,
      slug: 'dryrun',
      key: `rep${run}`,
      style,
      totalDuration: words[words.length - 1].end,
    });
    if (!r) fail(`repeat run ${run} returned null`);
  }
  pass('5 further full renders completed');
  const afterRss = process.memoryUsage().rss;
  pass(`RSS after 6 renders: ${(afterRss / 1e6).toFixed(0)}MB`);

  console.log('\n[4] Long-form volume');
  const longWords = Array.from({ length: 400 }, (_, i) => ({
    word: `WORD${i}`,
    start: i * 0.3,
    end: i * 0.3 + 0.28,
  }));
  const longFrames = buildCaptionFrames(longWords, { singleWord: false, phraseSize: 4 });
  const longStyle = captionStyleFor('long', 1280, 720);
  const longResult = await renderCaptionFrames({
    frames: longFrames,
    slug: 'dryrun',
    key: 'long',
    style: longStyle,
    totalDuration: longWords[longWords.length - 1].end,
  });
  if (!longResult) fail('long-form render returned null');
  else pass(`long-form rendered ${longResult.frameCount} frames`);

  console.log('\n[5] Mascot preparation (the other crash path)');
  const { prepareMascot } = await import('../src/services/mascotPrep');
  // A synthetic mascot: a dark blob on white, with an enclosed white region
  // standing in for the owl's eyes — the case a colour key would destroy.
  const W = 600;
  const H = 600;
  const surface = Skia.Surface.Make(W, H);
  if (!surface) {
    fail('Skia.Surface.Make returned null');
  } else {
    const c = surface.getCanvas();
    c.clear(Skia.Color('#FFFFFF'));
    const body = Skia.Paint();
    body.setColor(Skia.Color('#3B2F5E'));
    c.drawCircle(300, 320, 200, body);
    const eye = Skia.Paint();
    eye.setColor(Skia.Color('#FFFFFF'));
    c.drawCircle(240, 270, 55, eye);
    c.drawCircle(360, 270, 55, eye);
    const img = surface.makeImageSnapshot();
    const png = img.encodeToBytes(skia.enums.ImageFormat.PNG, 100);
    const srcPath = nodePath.join(OUT, 'mascot-src.png');
    fs.writeFileSync(srcPath, Buffer.from(png));
    img.dispose();
    surface.dispose();

    const prepared = await prepareMascot(`file://${srcPath}`, 'base');
    pass(`mascot prepared -> ${nodePath.basename(prepared.uri)}`);
    const frac = prepared.report.clearedFraction;
    console.log(`  cleared ${(frac * 100).toFixed(1)}% of pixels`);
    if (frac < 0.3 || frac > 0.85) fail(`cleared fraction ${frac.toFixed(3)} is implausible`);
    else pass('background removed in a plausible proportion');
    if (prepared.report.warning) console.log(`  warning: ${prepared.report.warning}`);

    // The eyes must survive. Re-decode and check the centre of an eye is opaque.
    const outBytes = new Uint8Array(fs.readFileSync(nodePath.join(OUT, 'outputs', 'stills', '_mascot', 'base.png')));
    const outImg = Skia.Image.MakeImageFromEncoded(Skia.Data.fromBytes(outBytes));
    if (!outImg) {
      fail('prepared mascot could not be decoded');
    } else {
      const px = outImg.readPixels(0, 0, {
        width: outImg.width(),
        height: outImg.height(),
        colorType: skia.enums.ColorType.RGBA_8888,
        alphaType: skia.enums.AlphaType.Unpremul,
      }) as Uint8Array;
      const alphaAt = (x: number, y: number) => px[(y * outImg.width() + x) * 4 + 3];
      if (alphaAt(240, 270) < 200) fail(`left eye was erased (alpha ${alphaAt(240, 270)})`);
      else pass(`left eye survived (alpha ${alphaAt(240, 270)})`);
      if (alphaAt(360, 270) < 200) fail(`right eye was erased (alpha ${alphaAt(360, 270)})`);
      else pass(`right eye survived (alpha ${alphaAt(360, 270)})`);
      if (alphaAt(5, 5) !== 0) fail(`corner background was kept (alpha ${alphaAt(5, 5)})`);
      else pass('corner background removed');
      outImg.dispose();
    }
  }

  console.log('\n[6] Oversized mascot (downscale path)');
  const big = Skia.Surface.Make(3000, 2400);
  if (!big) {
    fail('could not allocate a 3000x2400 raster surface');
  } else {
    const bc = big.getCanvas();
    bc.clear(Skia.Color('#FFFFFF'));
    const p = Skia.Paint();
    p.setColor(Skia.Color('#204060'));
    bc.drawCircle(1500, 1200, 900, p);
    const bimg = big.makeImageSnapshot();
    const bpng = bimg.encodeToBytes(skia.enums.ImageFormat.PNG, 100);
    const bigPath = nodePath.join(OUT, 'mascot-big.png');
    fs.writeFileSync(bigPath, Buffer.from(bpng));
    bimg.dispose();
    big.dispose();
    const preparedBig = await prepareMascot(`file://${bigPath}`, 'big');
    if (!preparedBig.downscaledTo) fail('7.2MP image was not downscaled');
    else pass(`downscaled to ${preparedBig.downscaledTo.width}x${preparedBig.downscaledTo.height}`);
  }

  console.log(`\n${failures === 0 ? 'DRY RUN PASSED' : `DRY RUN FAILED (${failures} problem(s))`}`);
  console.log(`artifacts in ${OUT}`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error('\nDRY RUN CRASHED');
  console.error(e);
  process.exit(1);
});
