import { buildLongFormAss, buildShortFormAss } from '@/core/ass';
import { connectiveStillDuration, kenBurnsFilter, setptsFactor } from '@/core/kenburns';
import { emotionFor, longFormMascotWindows, type Emotion, type MascotWindow } from '@/core/mascot';
import type { LongScript, Project, ShortScript, WordTiming } from '@/core/types';
import { escapeFilterPath, probeDuration, run, type LogSink } from './ffmpeg';
import { bucketDir, bucketFile, toFsPath, writeText } from './workspace';
import { File } from 'expo-file-system';

const SHORT_W = 1080;
const SHORT_H = 1920;
const LONG_W = 1920;
const LONG_H = 1080;
const FPS = 24;

/**
 * Seconds of last-frame hold appended to every segment. Generous on purpose:
 * `-t` trims it back to the audio duration, so it costs nothing when unused and
 * prevents a black tail when the clamped speed correction falls short.
 */
const HOLD_TAIL = 10;

export interface AssembleOptions {
  includeMascot: boolean;
  includeCaptions: boolean;
  /** Draft renders at 720p to keep phone render times and heat down. */
  draft: boolean;
  /** Absolute uris of the four Professor Hoot expressions, if the user imported them. */
  mascotAssets?: Partial<Record<Emotion, string>>;
  onLog?: LogSink;
  onProgress?: (step: string, completed: number, total: number) => void;
}

/** Normalises any source clip to the target canvas, framerate and sample aspect. */
function normaliseVideo(label: string, out: string, w: number, h: number): string {
  return `[${label}]scale=${w}:${h}:force_original_aspect_ratio=increase,crop=${w}:${h},setsar=1,fps=${FPS},format=yuv420p[${out}]`;
}

/**
 * Keys the white background out of a Professor Hoot JPG and scales him to the
 * overlay width. This replaces the desktop studio's flood-fill transparency
 * extraction — `colorkey` does the same job in one filter, with soft edges
 * instead of the fringing a hard flood fill leaves behind.
 */
function mascotChain(label: string, out: string, width: number): string {
  return `[${label}]scale=${width}:-1,colorkey=0xFFFFFF:0.30:0.08,format=rgba[${out}]`;
}

function overlayWithWindow(base: string, mascot: string, out: string, x: string, y: string, win: MascotWindow): string {
  return `[${base}][${mascot}]overlay=${x}:${y}:enable='between(t,${win.start.toFixed(2)},${win.end.toFixed(2)})'[${out}]`;
}

/**
 * Maps each short-form beat onto a time window using the word alignment.
 *
 * The short is voiced as one continuous take for natural prosody, so beat
 * boundaries have to be recovered from word counts rather than from separate
 * audio files.
 */
export function beatWindows(words: WordTiming[], beatTexts: string[]): Array<{ start: number; end: number }> {
  const counts = beatTexts.map((t) => t.trim().split(/\s+/).filter(Boolean).length);
  const windows: Array<{ start: number; end: number }> = [];
  let cursor = 0;

  for (let i = 0; i < counts.length; i++) {
    const startIdx = Math.min(cursor, Math.max(0, words.length - 1));
    const endIdx = Math.min(cursor + counts[i] - 1, words.length - 1);
    const start = words.length ? words[startIdx].start : 0;
    const end = words.length ? words[endIdx].end : 0;
    // The last beat always runs to the end of the audio so no silence is left uncovered.
    windows.push({ start, end: i === counts.length - 1 && words.length ? words[words.length - 1].end : end });
    cursor += counts[i];
  }

  return windows;
}

/**
 * Assembles a 9:16 short: three hero clips speed-matched to one continuous
 * voiceover, word-level kinetic captions, and a Hoot PiP that changes
 * expression per beat.
 */
export async function assembleShort(project: Project, opts: AssembleOptions): Promise<string> {
  const script = project.script as ShortScript;
  const slug = project.slug;
  const log = opts.onLog;

  const W = opts.draft ? 720 : SHORT_W;
  const H = opts.draft ? 1280 : SHORT_H;

  const audioUri = project.assets.audio['short'];
  if (!audioUri) throw new Error('Synthesise the voiceover before assembling.');

  const words = project.assets.alignment['short'] ?? [];
  const audioDuration = await probeDuration(audioUri);
  if (audioDuration <= 0) throw new Error('Could not read the voiceover duration.');

  const clipUris = script.beats.map((_, i) => project.assets.clips[`short_${i}`]).filter(Boolean) as string[];
  if (clipUris.length === 0) throw new Error('Import at least one hero clip before assembling.');

  opts.onProgress?.('Probing clips', 1, 5);
  const clipDurations = await Promise.all(clipUris.map(probeDuration));
  const videoTotal = clipDurations.reduce((a, b) => a + b, 0);

  const inputs: string[] = [];
  clipUris.forEach((uri) => inputs.push('-i', toFsPath(uri)));
  const audioIndex = clipUris.length;
  inputs.push('-i', toFsPath(audioUri));

  const filters: string[] = [];
  clipUris.forEach((_, i) => filters.push(normaliseVideo(`${i}:v`, `v${i}`, W, H)));
  filters.push(`${clipUris.map((_, i) => `[v${i}]`).join('')}concat=n=${clipUris.length}:v=1:a=0[vcat]`);

  // Stretch or compress the visual track so it lands exactly on the voiceover.
  const factor = setptsFactor(audioDuration, videoTotal);
  let stage = 'vcat';
  if (factor) {
    filters.push(`[${stage}]setpts=${factor.toFixed(5)}*PTS[vsync]`);
    stage = 'vsync';
  }

  // setpts is clamped to a watchable range, so a badly short clip set can still
  // finish before the narration does. Hold the last frame across the shortfall;
  // the -t flag trims the padding away whenever it is not needed. The narration
  // itself is never retimed — audio duration is what drives pacing.
  filters.push(`[${stage}]tpad=stop_mode=clone:stop_duration=${HOLD_TAIL}[vhold]`);
  stage = 'vhold';

  opts.onProgress?.('Building captions', 2, 5);
  if (opts.includeCaptions && words.length) {
    const ass = buildShortFormAss(words, { fontSize: Math.round(58 * (W / SHORT_W)), marginV: Math.round(320 * (H / SHORT_H)) });
    const assFile = writeText(bucketFile('subs', slug, 'short.ass'), ass);
    filters.push(`[${stage}]ass=filename='${escapeFilterPath(toFsPath(assFile.uri))}'[vsub]`);
    stage = 'vsub';
  }

  opts.onProgress?.('Compositing mascot', 3, 5);
  let mascotInputIndex = audioIndex + 1;
  if (opts.includeMascot && opts.mascotAssets && words.length) {
    const windows = beatWindows(words, script.beats.map((b) => b.text)).map((w, i) => ({
      ...w,
      emotion: emotionFor(script.beats[i]?.text ?? '', script.beats[i]?.kind ?? 'hook'),
    }));

    const mascotWidth = Math.round(280 * (W / SHORT_W));
    for (const win of windows) {
      const asset = opts.mascotAssets[win.emotion] ?? opts.mascotAssets.base;
      if (!asset) continue;
      inputs.push('-i', toFsPath(asset));
      const idx = mascotInputIndex++;
      filters.push(mascotChain(`${idx}:v`, `m${idx}`, mascotWidth));
      const out = `vm${idx}`;
      filters.push(overlayWithWindow(stage, `m${idx}`, out, '40', `main_h-overlay_h-${Math.round(120 * (H / SHORT_H))}`, win));
      stage = out;
    }
  }

  const outFile = bucketFile('final', slug, `${slug}-short.mp4`);
  if (outFile.exists) outFile.delete();

  opts.onProgress?.('Encoding', 4, 5);
  await run(
    [
      '-y',
      ...inputs,
      '-filter_complex', filters.join(';'),
      '-map', `[${stage}]`,
      '-map', `${audioIndex}:a`,
      '-t', audioDuration.toFixed(3),
      '-c:v', 'libx264',
      '-preset', opts.draft ? 'veryfast' : 'medium',
      '-crf', opts.draft ? '28' : '20',
      '-pix_fmt', 'yuv420p',
      '-c:a', 'aac',
      '-b:a', '192k',
      '-movflags', '+faststart',
      toFsPath(outFile.uri),
    ],
    log
  );

  opts.onProgress?.('Done', 5, 5);
  return outFile.uri;
}

/**
 * Assembles a 16:9 deep dive.
 *
 * Each chapter is rendered independently against its own audio before anything
 * is concatenated. That is the whole reason long-form never drifts: a chapter
 * that lands 40ms short cannot push every later chapter's subtitles out of sync,
 * because later chapters were never timed against it.
 */
export async function assembleLongform(project: Project, opts: AssembleOptions): Promise<string> {
  const script = project.script as LongScript;
  const slug = project.slug;
  const W = opts.draft ? 1280 : LONG_W;
  const H = opts.draft ? 720 : LONG_H;

  const keys = ['0', ...script.chapters.map((c) => String(c.index)), '99'];
  const rendered: string[] = [];
  const total = keys.length + 1;

  for (let i = 0; i < keys.length; i++) {
    const key = keys[i];
    opts.onProgress?.(`Syncing chapter ${key}`, i + 1, total);
    const segment = await assembleChapter(project, key, W, H, opts);
    if (segment) rendered.push(segment);
  }

  if (!rendered.length) throw new Error('No chapter could be rendered — synthesise the voiceovers first.');

  opts.onProgress?.('Concatenating', total, total);
  const listFile = bucketFile('segments', slug, 'concat.txt');
  writeText(listFile, rendered.map((uri) => `file '${toFsPath(uri)}'`).join('\n'));

  const outFile = bucketFile('final', slug, `${slug}-final.mp4`);
  if (outFile.exists) outFile.delete();

  await run(
    [
      '-y',
      '-f', 'concat',
      '-safe', '0',
      '-i', toFsPath(listFile.uri),
      '-c', 'copy',
      '-movflags', '+faststart',
      toFsPath(outFile.uri),
    ],
    opts.onLog
  );

  return outFile.uri;
}

/** Renders one chapter to its own MP4, exactly as long as that chapter's audio. */
async function assembleChapter(
  project: Project,
  key: string,
  W: number,
  H: number,
  opts: AssembleOptions
): Promise<string | null> {
  const script = project.script as LongScript;
  const slug = project.slug;

  const audioUri = project.assets.audio[key];
  if (!audioUri) return null;

  const audioDuration = await probeDuration(audioUri);
  if (audioDuration <= 0) return null;

  const chapter = script.chapters.find((c) => String(c.index) === key);
  const heroA = project.assets.clips[`${key}_a`];
  const heroB = project.assets.clips[`${key}_b`];
  const still = project.assets.stills[key];

  const inputs: string[] = [];
  const filters: string[] = [];
  const videoLabels: string[] = [];
  let inputIndex = 0;

  const durA = heroA ? await probeDuration(heroA) : 0;
  const durB = heroB ? await probeDuration(heroB) : 0;

  if (heroA) {
    inputs.push('-i', toFsPath(heroA));
    filters.push(normaliseVideo(`${inputIndex}:v`, `v${inputIndex}`, W, H));
    videoLabels.push(`v${inputIndex}`);
    inputIndex++;
  }
  if (heroB) {
    inputs.push('-i', toFsPath(heroB));
    filters.push(normaliseVideo(`${inputIndex}:v`, `v${inputIndex}`, W, H));
    videoLabels.push(`v${inputIndex}`);
    inputIndex++;
  }

  // The still fills whatever the hero clips leave uncovered. With no hero clips
  // at all it carries the entire chapter, which keeps a half-sourced project renderable.
  const stillDuration = connectiveStillDuration(audioDuration, durA, durB);
  if (still) {
    inputs.push('-loop', '1', '-t', stillDuration.toFixed(3), '-i', toFsPath(still));
    const move = chapter?.kenBurns ?? 'zoom_in';
    filters.push(
      `[${inputIndex}:v]${kenBurnsFilter(move, stillDuration, W, H)},setsar=1,format=yuv420p[v${inputIndex}]`
    );
    videoLabels.push(`v${inputIndex}`);
    inputIndex++;
  } else if (!videoLabels.length) {
    // Nothing visual at all — render a black bed so the chapter still exists in
    // the final cut rather than silently disappearing from the timeline.
    inputs.push('-f', 'lavfi', '-t', audioDuration.toFixed(3), '-i', `color=c=black:s=${W}x${H}:r=${FPS}`);
    filters.push(`[${inputIndex}:v]setsar=1,format=yuv420p[v${inputIndex}]`);
    videoLabels.push(`v${inputIndex}`);
    inputIndex++;
  }

  const audioIndex = inputIndex;
  inputs.push('-i', toFsPath(audioUri));
  inputIndex++;

  let stage: string;
  if (videoLabels.length > 1) {
    filters.push(`${videoLabels.map((l) => `[${l}]`).join('')}concat=n=${videoLabels.length}:v=1:a=0[vcat]`);
    stage = 'vcat';
  } else {
    stage = videoLabels[0];
  }

  const videoTotal = durA + durB + (still ? stillDuration : videoLabels.length ? audioDuration : 0);
  const factor = setptsFactor(audioDuration, videoTotal);
  if (factor) {
    filters.push(`[${stage}]setpts=${factor.toFixed(5)}*PTS[vsync]`);
    stage = 'vsync';
  }

  // Guarantee the chapter's visuals cover its audio even when the clamped
  // setpts correction could not stretch far enough (see assembleShort).
  filters.push(`[${stage}]tpad=stop_mode=clone:stop_duration=${HOLD_TAIL}[vhold]`);
  stage = 'vhold';

  // Chapter-local alignment starts at zero, so subtitles are burned per chapter
  // and never need rebasing onto a global timeline.
  if (opts.includeCaptions) {
    const words = project.assets.alignment[key] ?? [];
    if (words.length) {
      const ass = buildLongFormAss(words, { fontSize: Math.round(46 * (W / LONG_W)), marginV: Math.round(140 * (H / LONG_H)) });
      const assFile = writeText(bucketFile('subs', slug, `ch_${key}.ass`), ass);
      filters.push(`[${stage}]ass=filename='${escapeFilterPath(toFsPath(assFile.uri))}'[vsub]`);
      stage = 'vsub';
    }
  }

  if (opts.includeMascot && opts.mascotAssets && chapter) {
    const windows = longFormMascotWindows(audioDuration, chapter.miniHook, chapter.microReframe);
    const mascotWidth = Math.round(300 * (W / LONG_W));
    for (const win of windows) {
      const asset = opts.mascotAssets[win.emotion] ?? opts.mascotAssets.base;
      if (!asset) continue;
      inputs.push('-i', toFsPath(asset));
      const idx = inputIndex++;
      filters.push(mascotChain(`${idx}:v`, `m${idx}`, mascotWidth));
      const out = `vm${idx}`;
      filters.push(
        overlayWithWindow(stage, `m${idx}`, out, `main_w-overlay_w-${Math.round(60 * (W / LONG_W))}`, `main_h-overlay_h-${Math.round(80 * (H / LONG_H))}`, win)
      );
      stage = out;
    }
  }

  const outFile = bucketFile('segments', slug, `ch_${key}.mp4`);
  if (outFile.exists) outFile.delete();

  await run(
    [
      '-y',
      ...inputs,
      '-filter_complex', filters.join(';'),
      '-map', `[${stage}]`,
      '-map', `${audioIndex}:a`,
      '-t', audioDuration.toFixed(3),
      '-c:v', 'libx264',
      '-preset', opts.draft ? 'veryfast' : 'medium',
      '-crf', opts.draft ? '28' : '20',
      '-pix_fmt', 'yuv420p',
      '-r', String(FPS),
      '-c:a', 'aac',
      '-b:a', '192k',
      // Uniform timebase across every segment, otherwise the concat demuxer
      // refuses to stream-copy them together.
      '-video_track_timescale', '90000',
      toFsPath(outFile.uri),
    ],
    opts.onLog
  );

  return outFile.uri;
}

/** Samples candidate thumbnail frames at 25%, 50% and 75% of runtime (spec §6.5). */
export async function sampleThumbnailFrames(videoUri: string, slug: string, onLog?: LogSink): Promise<string[]> {
  const duration = await probeDuration(videoUri);
  if (duration <= 0) throw new Error('Could not read the video duration.');

  const dir = bucketDir('thumbnails', slug);
  const marks = [0.25, 0.5, 0.75];
  const out: string[] = [];

  for (let i = 0; i < marks.length; i++) {
    const file = new File(dir, `candidate_${i}.jpg`);
    if (file.exists) file.delete();
    await run(
      [
        '-y',
        '-ss', (duration * marks[i]).toFixed(3),
        '-i', toFsPath(videoUri),
        '-frames:v', '1',
        '-q:v', '2',
        toFsPath(file.uri),
      ],
      onLog
    );
    out.push(file.uri);
  }

  return out;
}
