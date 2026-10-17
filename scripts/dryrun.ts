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

  console.log(`\n${failures === 0 ? 'DRY RUN PASSED' : `DRY RUN FAILED (${failures} problem(s))`}`);
  console.log(`artifacts in ${OUT}`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error('\nDRY RUN CRASHED');
  console.error(e);
  process.exit(1);
});
