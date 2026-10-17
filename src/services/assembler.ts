import { File } from 'expo-file-system';
import { buildLongFormAss, buildShortFormAss } from '@/core/ass';
import { buildCaptionFrames } from '@/core/captions';
import { CALM_CAPTION_WORDS, hootHiddenSpans } from '@/core/styleProfiles';
import { connectiveStillDuration, kenBurnsFilter, moveForChapter, setptsFactor, stillInputArgs } from '@/core/kenburns';
import { emotionFor } from '@/core/mascot';
import { HOOT_PLACEMENT } from '@/core/hoot';
import { buildTrack, chapterHolds, concatList, shortHolds } from '@/core/hootTrack';
import { cardFrameSeconds, frameConcat } from '@/core/cards';
import { stillParts, timeVisuals, wordStarts } from '@/core/hybridPlan';
import { applyPauses, HOOT_MOMENT_SECONDS } from '@/core/screenplayPlan';
import { assetKeyFor, flattenShots, joinHeldShots } from '@/core/shots';
import {
  cardWindows,
  clipFirst,
  CTA_CARD_SECONDS,
  holdPoint,
  hookCardText,
  hookStyleOf,
  loopCutDuration,
  narrationTrim,
  shiftWords,
  trimWords,
} from '@/core/hooks';
import { DEFAULT_CHANNEL_CONFIG, type HookConfig } from '@/core/channelConfig';
import {
  capPauses,
  editAudioFilters,
  HOOT_ENTRY_SECONDS,
  lineEndIndexes,
  loudnormFilter,
  musicBedFilters,
  paceLines,
  PAUSE_ACCEPT_SECONDS,
  punchInFilter,
  SHORT_HOOT,
  shortEncodeArgs,
  textWatermarkFilters,
  watermarkPatch,
  whooshFilters,
} from '@/core/renderRules';
import { unvoicedTracks } from '@/core/voiceGaps';
import { frameFilter, framePlan } from '@/core/framing';
import { scriptGateHits, scriptGateMessage } from '@/core/scriptGate';
import type { Project, WordTiming } from '@/core/types';
import { hootAtWidth } from './hootPack';
import { renderCardFrames } from './cardRender';
import {
  captionBandY,
  captionStyleFor,
  preloadCaptionFont,
  renderCaptionFrames,
  renderTextCard,
  renderWatermark,
  textCardY,
} from './captionRenderer';
import { renderStimulusCard } from './stimulusCard';
import {
  detectLeadingSilence,
  detectSilences,
  extractFrame,
  FFmpegError,
  measureIntegratedLoudness,
  measureLoudness,
  probeDuration,
  probeSize,
  run,
  type LogSink,
} from './ffmpeg';
import { bucketDir, bucketFile, toFsPath, writeText } from './workspace';
import { mark, traced } from './breadcrumbs';

const SHORT_W = 1080;
const SHORT_H = 1920;
const LONG_W = 1920;
const LONG_H = 1080;
const FPS = 30;

/**
 * Seconds of last-frame hold appended to every segment. Generous on purpose:
 * `-t` trims it back to the audio duration, so it costs nothing when unused and
 * prevents a black tail when the clamped speed correction falls short.
 */
const HOLD_TAIL = 10;
/** How long a long-form chapter's title card stays up. */
const TITLE_CARD_SECONDS = 2.5;
/** A clip shorter than its slot by more than this holds its last frame with a slow push-in. */
const CLIP_SHORTFALL_SECONDS = 1.2;
/** Ken Burns moves, cycled when one still covers a long slot in parts. */
const KB_MOVES = ['zoom_in', 'pan_right', 'zoom_out', 'pan_left'] as const;
/** Where thumbnail candidate frames are sampled, as fractions of the runtime. */
const THUMB_MARKS = [0.15, 0.3, 0.45, 0.6, 0.8];
const AUDIO_FORMAT = 'aresample=44100,aformat=sample_fmts=fltp:channel_layouts=stereo';

export interface RenderInfo {
  draft: boolean;
  width: number;
  height: number;
  hookText: string;
  lufs?: number;
  longGaps?: number;
  pausesCut?: number;
  frame0?: string;
  frame30?: string;
}

export interface AssembleOptions {
  includeMascot: boolean;
  includeCaptions: boolean;
  /** Draft renders at 720p to keep phone render times and heat down. */
  draft: boolean;
  /** The channel's hook settings (hook card length, pre-roll, silence threshold). */
  hook?: HookConfig;
  punchIn?: boolean;
  cutWhoosh?: boolean;
  musicBed?: boolean;
  /** Word-by-word captions instead of calm phrases (Profile P). */
  wordCaptions?: boolean;
  textWatermark?: boolean;
  /** When Hoot shows on a Short: 'endcard' (default), 'off', or always. */
  mascot?: string;
  onLog?: LogSink;
  onProgress?: (step: string, completed: number, total: number) => void;
  onRenderInfo?: (info: RenderInfo) => void;
  signal?: AbortSignal;
}

/** Normalises a source clip to the target canvas, framerate and sample aspect. */
function normaliseVideo(
  label: string,
  out: string,
  w: number,
  h: number,
  _fromClip = true,
  size?: { width: number; height: number } | null,
): string {
  const plan = size ? framePlan(size.width, size.height, w, h) : { mode: 'cover' as const, cropPercent: 0 };
  const chain = [frameFilter(plan, w, h), 'setsar=1', watermarkPatch(w, h), `fps=${FPS}`, 'format=yuv420p']
    .filter(Boolean)
    .join(',');
  return `[${label}]${chain}[${out}]`;
}

/** Pose for a Short's hook card when the script has no bank v2 data. */
function legacyHookPose(text: string): string {
  const emotion = emotionFor(text, 'hook');
  if (emotion === 'thinking') return 'thinking';
  return emotion === 'knowing' ? 'happy' : 'surprised';
}

/** Writes Hoot's pose track as an ffconcat list over the pose PNGs at this width. */
async function hootTrackInput(
  track: { pose: string; start: number; end: number }[],
  width: number,
  mirror: boolean,
  slug: string,
  name: string,
  opts: AssembleOptions,
): Promise<string[]> {
  const paths = await hootAtWidth(width, mirror, { onLog: opts.onLog, signal: opts.signal });
  const list = bucketFile('segments', slug, `hoot_${name}.ffconcat`);
  writeText(
    list,
    concatList(track as any, (pose) => toFsPath(paths[pose])),
  );
  return ['-f', 'concat', '-safe', '0', '-i', toFsPath(list.uri)];
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
    windows.push({ start, end: i === counts.length - 1 && words.length ? words[words.length - 1].end : end });
    cursor += counts[i];
  }

  return windows;
}

/**
 * Prepares the caption overlay for one segment.
 *
 * Returns the extra FFmpeg input arguments and the filter that composites the
 * caption band, or null when there is nothing to draw.
 */
async function prepareCaptions(
  project: Project,
  key: string,
  mode: 'short' | 'long',
  W: number,
  H: number,
  duration: number,
  opts: AssembleOptions,
  cap: { words?: WordTiming[]; maxHoldSeconds?: number; phrases?: boolean } = {},
): Promise<{ inputs: string[]; filter: (base: string, capLabel: string, out: string) => string } | null> {
  const words = cap.words ?? project.assets.alignment[key] ?? [];
  if (!words.length) return null;

  const frames = buildCaptionFrames(words, {
    maxHoldSeconds: cap.maxHoldSeconds,
    singleWord: mode === 'short' && !cap.phrases,
    phraseSize: cap.phrases ? CALM_CAPTION_WORDS : 4,
    highlightActiveWord: false,
  });
  if (!frames.length) return null;

  // Bundled typeface must be resolved before the first frame is drawn.
  await preloadCaptionFont();

  const styleMode = cap.phrases ? 'shortPhrase' : mode;
  const style = captionStyleFor(styleMode, W, H);
  const doneCaptions = mark(`Drawing ${frames.length} caption frames (${mode}, ${style.width}x${style.height})`);
  let rendered;
  try {
    rendered = await renderCaptionFrames({
      frames,
      slug: project.slug,
      key,
      style,
      totalDuration: duration,
      signal: opts.signal,
      onProgress: (done, total) => opts.onProgress?.(`Drawing captions ${done}/${total}`, done, total),
    });
  } finally {
    doneCaptions();
  }
  if (!rendered) return null;

  // Also write the .ass sidecar. It is not used by this renderer, but it is
  // exactly what the desktop studio consumes, so a project rendered here can
  // still be finished there.
  const doneAss = mark(`Writing the .ass sidecar (${mode}, ${words.length} words)`);
  try {
    const ass = mode !== 'short' ? buildLongFormAss(words) : buildShortFormAss(words);
    writeText(bucketFile('subs', project.slug, `ch_${key}.ass`), ass);
  } finally {
    doneAss();
  }

  const y = captionBandY(styleMode, H, style.height);

  return {
    // The concat demuxer needs -safe 0 to accept the generated file list.
    inputs: ['-f', 'concat', '-safe', '0', '-i', toFsPath(rendered.listPath)],
    filter: (base, capLabel, out) =>
      `[${capLabel}]format=rgba,fps=${FPS}[capsf];[${base}][capsf]overlay=0:${y}:format=auto:eof_action=pass[${out}]`,
  };
}

/**
 * Assembles a 9:16 Short: the planned shots speed-matched to one continuous
 * voiceover, the hook card on frame 0, captions, Hoot and the audio polish,
 * then checks the render (frame 0, loudness, long silences).
 */
export async function assembleShort(project: Project, opts: AssembleOptions): Promise<string> {
  const script = project.script as any;
  const slug = project.slug;
  const W = opts.draft ? 720 : SHORT_W;
  const H = opts.draft ? 1280 : SHORT_H;
  const audio = project.assets.audio.short;
  if (!audio) throw new Error('Synthesise the voiceover before assembling.');

  const hits = scriptGateHits(
    script.beats
      .map((b: any) => b.text)
      .join(' ')
      .replace(/\.\.\.and that's the mind for you\. Stay curious, stay sharp\./i, ''),
  );
  if (hits.length) throw new Error(scriptGateMessage(hits));

  const hookCfg = opts.hook ?? DEFAULT_CHANNEL_CONFIG.hook;
  const hookText = hookCardText(script, hookCfg.maxCardWords);
  if (!hookText) {
    throw new Error('This Short has no hook text. Frame 0 must carry it (CR-80J): add the hook text, then render.');
  }
  opts.onLog?.([
    `Hook text drawn from frame 0 (${hookStyleOf(script) === 'pov' ? 'hook_text_pov' : 'hook_text'}): "${hookText}"`,
  ]);

  const audioDuration = await traced('Probing the voiceover duration', () => probeDuration(audio));
  if (audioDuration <= 0) throw new Error('Could not read the voiceover duration.');
  const words = project.assets.alignment.short ?? [];
  if (words.length && audioDuration > 0) {
    opts.onLog?.([
      `Narration pace: ${(words.length / audioDuration).toFixed(2)} words/s over ${audioDuration.toFixed(1)} s`,
    ]);
  }

  const lead = await traced('Measuring the silence before the first word', () =>
    detectLeadingSilence(audio, hookCfg.silenceThresholdDb),
  );
  const shortWords: any[] = project.assets.alignment.short ?? [];
  const trim = Math.min(narrationTrim(shortWords, lead, hookCfg.maxPreRollMs), Math.max(0, audioDuration - 1));
  const trimmed: any[] = trimWords(shortWords, trim);
  const anyHeld = script.beats.some((b: any) => b.shots?.some((s: any) => s.held));
  const lineEnds = anyHeld
    ? lineEndIndexes(
        script.beats.map((b: any) => b.text),
        trimmed.length,
      )
    : new Set<number>();
  const paced = lineEnds.size ? paceLines(trimmed, lineEnds) : { ...capPauses(trimmed), inserts: [], added: 0 };
  const pacedWords: any[] = paced.words;
  const spoken = audioDuration - trim - paced.removed + paced.added;
  if (paced.cuts.length) {
    opts.onLog?.([`Pauses capped at 0.35 s: ${paced.cuts.length} cut, ${paced.removed.toFixed(2)} s removed`]);
  }
  if (lineEnds.size) {
    opts.onLog?.([
      `Line pauses (CR-91): ${lineEnds.size} line breaks held at 0.4 to 0.8 s; ${paced.inserts.length} lengthened, ${paced.added.toFixed(2)} s of silence added`,
    ]);
  } else if (anyHeld) {
    opts.onLog?.([
      'Line pauses (CR-91): the voice timing does not match the lines word for word, so the pauses were left as voiced',
    ]);
  }
  const voiceLen = loopCutDuration(pacedWords, spoken);
  const stimHold =
    script.structure === 'test' && script.stimulus && script.stimulus.holdSeconds > 0 && pacedWords.length
      ? script.stimulus.holdSeconds
      : 0;
  const holdAt = stimHold ? holdPoint(pacedWords, script.beats[0]?.text ?? '') : 0;
  const finalWords: any[] = stimHold ? shiftWords(pacedWords, holdAt, stimHold) : pacedWords;
  const total = voiceLen + stimHold;

  const shots = flattenShots(script)
    .map((f) => ({
      ...f,
      uri:
        f.shot.source !== 'still'
          ? project.assets.clips[assetKeyFor(f.flatIndex, f.shot)]
          : project.assets.stills[assetKeyFor(f.flatIndex, f.shot)],
    }))
    .filter((f) => Boolean(f.uri)) as any[];
  const ordered = clipFirst(joinHeldShots(shots)) as any[];
  if (ordered.some((f) => f.shot.held)) {
    opts.onLog?.([
      `Three shots (CR-91): ${ordered.map((f) => `${f.shot.beatId ?? f.shot.source} ${f.shot.durationSec.toFixed(1)} s`).join(', ')}`,
    ]);
  }
  if (project.style?.profile === 'C') {
    const n = ordered.length;
    opts.onLog?.([
      `Calm profile: N = ${n} shots, about ${(total / Math.max(1, n)).toFixed(1)} s each over ${total.toFixed(1)} s of voice`,
    ]);
  }
  if (ordered.length === 0) {
    throw new Error('Import a clip or generate a still for at least one shot before assembling.');
  }

  opts.onProgress?.('Probing clips', 1, 5);
  const clips = ordered.filter((f) => f.shot.source !== 'still');
  const durations = await traced(`Probing ${clips.length} hero clips`, () =>
    Promise.all(clips.map((c) => probeDuration(c.uri))),
  );
  const sizes = await Promise.all(clips.map((c) => probeSize(c.uri)));
  opts.onLog?.(
    clips.map((_, i) => {
      const size = sizes[i];
      const plan = size ? framePlan(size.width, size.height, W, H) : undefined;
      const dims = size ? `${size.width}x${size.height}` : 'size unknown';
      const how = plan
        ? `${plan.mode === 'none' ? 'used as is' : plan.mode === 'scale' ? 'scaled' : 'covered'}, crop ${plan.cropPercent}%`
        : 'covered';
      return `Clip ${i + 1}: ${dims}, ${how}`;
    }),
  );

  const clipUse = clips.map((c, i) =>
    !(c.shot.durationSec > 0) || !(durations[i] > 0)
      ? durations[i]
      : Math.min(Math.max(0.5, durations[i] - (c.shot.startSec ?? 0)), c.shot.durationSec),
  );
  const stillTotal = ordered
    .filter((f) => f.shot.source === 'still')
    .reduce((acc, f) => acc + Math.max(0.5, f.shot.durationSec || 2), 0);
  const videoTotal = clipUse.reduce((a, b) => a + b, 0) + stillTotal;

  const inputs: string[] = [];
  const filters: string[] = [];
  const labels: string[] = [];
  const lens: number[] = [];
  const isHook: boolean[] = [];
  let idx = 0;
  let clipI = 0;

  ordered.forEach((f, i) => {
    isHook.push(f.beatIndex === 0);
    if (f.shot.source !== 'still') {
      const src = durations[clipI] ?? 0;
      const use = clipUse[clipI++] ?? src;
      lens.push(use);
      inputs.push('-i', toFsPath(f.uri));
      const start = f.shot.startSec ?? 0;
      const size = sizes[clipI - 1];
      const plan = size ? framePlan(size.width, size.height, W, H) : { mode: 'cover' as const, cropPercent: 0 };
      const base = [frameFilter(plan, W, H), 'setsar=1', watermarkPatch(W, H), `fps=${FPS}`, 'format=yuv420p']
        .filter(Boolean)
        .join(',');
      if (use > 0 && (use < src || start > 0)) {
        filters.push(`[${idx}:v]${base}[t${idx}]`);
        const from = start > 0 ? `start=${start.toFixed(3)}:` : '';
        const punch = opts.punchIn ? `,${punchInFilter(W, H, use)},setsar=1` : '';
        filters.push(`[t${idx}]trim=${from}duration=${use.toFixed(3)},setpts=PTS-STARTPTS${punch}[v${idx}]`);
      } else {
        const out = opts.punchIn ? `n${idx}` : `v${idx}`;
        filters.push(`[${idx}:v]${base}[${out}]`);
        if (opts.punchIn) filters.push(`[n${idx}]${punchInFilter(W, H, use)},setsar=1[v${idx}]`);
      }
    } else {
      const d = Math.max(0.5, f.shot.durationSec || 2);
      lens.push(d);
      inputs.push(...stillInputArgs(toFsPath(f.uri)));
      const move = i !== 0 ? (f.shot.move ?? moveForChapter(i)) : 'zoom_in';
      filters.push(`[${idx}:v]${kenBurnsFilter(move, d, W, H, FPS)},setsar=1,format=yuv420p[v${idx}]`);
    }
    labels.push(`v${idx}`);
    idx++;
  });

  const audioIdx = idx;
  inputs.push(...(trim > 0 ? ['-ss', trim.toFixed(3)] : []), '-i', toFsPath(audio));
  let next = audioIdx + 1;
  let stage = 'vcat';

  const loud = await traced('Measuring the voice loudness', () => measureLoudness(audio));
  filters.push(...editAudioFilters(`${audioIdx}:a`, paced.cuts, paced.inserts, 'acut'));
  filters.push(`[acut]${loudnormFilter(loud)},${AUDIO_FORMAT}[aloud]`);
  let audioOut = '[aloud]';

  if (stimHold) {
    const segment = (label: string, idxs: number[], dur: number) => {
      if (!idxs.length || !(dur > 0)) {
        filters.push(
          `color=c=black:s=${W}x${H}:r=${FPS}:d=${Math.max(0.04, dur).toFixed(3)},setsar=1,format=yuv420p[${label}]`,
        );
        return;
      }
      const factor = setptsFactor(
        dur,
        idxs.reduce((acc, i) => acc + lens[i], 0),
      );
      filters.push(
        `${idxs.map((i) => `[${labels[i]}]`).join('')}concat=n=${idxs.length}:v=1:a=0${factor ? `,setpts=${factor.toFixed(5)}*PTS` : ''},` +
          `tpad=stop_mode=clone:stop_duration=${HOLD_TAIL},trim=duration=${dur.toFixed(3)},setpts=PTS-STARTPTS[${label}]`,
      );
    };
    const hookIdx = labels.map((_, i) => i).filter((i) => isHook[i]);
    const restIdx = labels.map((_, i) => i).filter((i) => !isHook[i]);
    segment('seghook', hookIdx, holdAt);
    segment('segrest', restIdx, voiceLen - holdAt);
    const stim = await traced('Drawing the test stimulus', () =>
      renderStimulusCard({
        card: script.stimulus?.card,
        description: script.stimulus?.description ?? '',
        slug,
        width: W,
        height: H,
      }),
    );
    inputs.push('-loop', '1', '-framerate', String(FPS), '-t', stimHold.toFixed(3), '-i', toFsPath(stim));
    const si = next++;
    const barH = Math.max(6, Math.round(H * 0.012));
    filters.push(`[${si}:v]scale=${W}:${H},setsar=1,format=yuv420p[stimbase]`);
    filters.push(`color=c=0xFFF000:s=${W}x${barH}:r=${FPS}:d=${stimHold.toFixed(3)}[bar]`);
    filters.push(
      `[stimbase][bar]overlay=x='-w*t/${stimHold.toFixed(3)}':y=${Math.round(H * 0.06)}:eval=frame:shortest=1,trim=duration=${stimHold.toFixed(3)},setpts=PTS-STARTPTS[segstim]`,
    );
    filters.push('[seghook][segstim][segrest]concat=n=3:v=1:a=0[vcat]');
    filters.push('[aloud]asplit=2[vo1][vo2]');
    filters.push(`[vo1]atrim=0:${holdAt.toFixed(3)},asetpts=PTS-STARTPTS,${AUDIO_FORMAT}[ahook]`);
    filters.push(`[vo2]atrim=start=${holdAt.toFixed(3)},asetpts=PTS-STARTPTS,${AUDIO_FORMAT}[arest]`);
    filters.push(`anullsrc=r=44100:cl=stereo,atrim=0:${stimHold.toFixed(3)},${AUDIO_FORMAT}[asil]`);
    filters.push('[ahook][asil][arest]concat=n=3:v=0:a=1[aout]');
    audioOut = '[aout]';
  } else {
    filters.push(`${labels.map((l) => `[${l}]`).join('')}concat=n=${labels.length}:v=1:a=0[vcat]`);
    const factor = setptsFactor(total, videoTotal);
    if (factor) {
      filters.push(`[${stage}]setpts=${factor.toFixed(5)}*PTS[vsync]`);
      stage = 'vsync';
    }
  }

  if (opts.cutWhoosh) {
    const sum = lens.reduce((a, b) => a + b, 0) || 1;
    let acc = 0;
    const cutTimes = lens
      .map((l) => (acc += l))
      .slice(0, -1)
      .map((t) => (t / sum) * total);
    filters.push(...whooshFilters(audioOut.replace(/^\[|\]$/g, ''), cutTimes, total, 'awhoosh'));
    audioOut = '[awhoosh]';
  }
  if (opts.musicBed) {
    filters.push(
      ...musicBedFilters(
        audioOut.replace(/^\[|\]$/g, ''),
        total,
        'amusic',
        project.style?.profile !== 'C' ? {} : { gainDb: -24, fadeSeconds: 1 },
      ),
    );
    audioOut = '[amusic]';
  }

  // Guarantee the visuals cover the full voiceover even when the clamped speed
  // correction could not stretch far enough.
  filters.push(`[${stage}]tpad=stop_mode=clone:stop_duration=${HOLD_TAIL}[vhold]`);
  stage = 'vhold';

  if (opts.includeCaptions) {
    opts.onProgress?.('Drawing captions', 2, 5);
    const captions = await prepareCaptions(project, 'short', 'short', W, H, total, opts, {
      words: finalWords,
      maxHoldSeconds: stimHold ? 0.7 : undefined,
      phrases: !(opts.wordCaptions && project.style?.profile === 'P'),
    });
    if (captions) {
      inputs.push(...captions.inputs);
      const ci = next++;
      filters.push(captions.filter(stage, `${ci}:v`, 'vcap'));
      stage = 'vcap';
    }
  }

  const windows = beatWindows(
    finalWords,
    script.beats.map((b: any) => b.text),
  );
  const cards = cardWindows(
    script,
    windows,
    total,
    stimHold ? { start: holdAt, end: holdAt + stimHold } : undefined,
    hookCfg,
  ).filter((c) => opts.includeCaptions || c.name === 'hook');
  for (const c of cards) {
    const card = await traced(`Drawing the "${c.name}" text card`, () =>
      renderTextCard({
        text: c.text,
        slug,
        name: c.name,
        width: W,
        rightPadding: c.name === 'hook' ? Math.round(W * 0.12) : undefined,
      }),
    );
    if (!card) continue;
    inputs.push('-i', toFsPath(card.uri));
    const ci = next++;
    const out = `vcard${ci}`;
    filters.push(`[${ci}:v]format=rgba[card${ci}]`);
    filters.push(
      `[${stage}][card${ci}]overlay=0:${textCardY(H, card.height)}:enable='between(t,${c.start.toFixed(2)},${c.end.toFixed(2)})'[${out}]`,
    );
    stage = out;
  }

  if (opts.textWatermark) {
    const wm = await renderWatermark({ slug, width: W });
    if (wm) {
      inputs.push('-i', toFsPath(wm.uri));
      const wi = next++;
      filters.push(...textWatermarkFilters(stage, `${wi}:v`, 'vmark', W));
      stage = 'vmark';
      opts.onLog?.(['Text watermark "@TheMindFiles" at 40% opacity, top-left (CR-91)']);
    }
  }

  opts.onProgress?.('Compositing mascot', 3, 5);
  const doneHoot = mark('Building the Hoot pose track');
  try {
    if (opts.includeMascot && pacedWords.length) {
      const narration = script.beats.map((b: any) => b.text).join(' ');
      const bank = script.bankV2;
      const holds: { pose: string; start: number; end: number }[] = bank
        ? shortHolds({
            narration,
            words: finalWords,
            duration: total,
            format: bank.format,
            pillar: bank.pillar,
            ending: bank.ending === 'SIGNOFF' && !bank.signoffWords ? 'LOOP' : bank.ending,
            effect: bank.effect,
            hookSeconds: hookCfg.cardSeconds,
          } as any)
        : [{ pose: legacyHookPose(script.beats[0]?.text ?? ''), start: 0, end: hookCfg.cardSeconds }];
      if (stimHold) holds.push({ pose: 'thinking', start: holdAt, end: holdAt + stimHold });
      for (const span of hootHiddenSpans(opts.mascot ?? 'endcard', total, HOOT_ENTRY_SECONDS)) {
        holds.push({ pose: 'none', start: span.start, end: span.end });
      }
      const track = buildTrack({ duration: total, words: finalWords, holds: holds as any, seed: project.id });
      const side = SHORT_HOOT.side as string;
      const place = HOOT_PLACEMENT.short;
      const hootW = Math.round(place.widthRatio * W);
      const margin = Math.round(place.marginRatio * W);
      const hi = next++;
      inputs.push(...(await hootTrackInput(track, hootW, side === 'left', slug, 'short', opts)));
      filters.push(`[${hi}:v]fps=${FPS},format=rgba[hoot]`);
      const x = side !== 'left' ? `main_w-overlay_w-${margin}` : String(margin);
      filters.push(
        `[${stage}][hoot]overlay=${x}:main_h-overlay_h-${Math.round(place.bottomSafeRatio * H)}:eof_action=repeat[vhoot]`,
      );
      stage = 'vhoot';
    }
  } finally {
    doneHoot();
  }

  const doneOut = mark('Preparing the output file');
  let outFile: File;
  try {
    outFile = bucketFile('final', slug, `${slug}-short.mp4`);
    if (outFile.exists) outFile.delete();
  } finally {
    doneOut();
  }

  opts.onProgress?.('Encoding', 4, 5);
  const doneEncode = mark(`Encoding short (${W}x${H}, ${inputs.length / 2} inputs)`);
  try {
    await run(
      [
        '-y',
        ...inputs,
        '-filter_complex', filters.join(';'),
        '-map', `[${stage}]`,
        '-map', audioOut,
        '-t', total.toFixed(3),
        ...shortEncodeArgs(opts.draft),
        '-c:a', 'aac',
        '-b:a', '192k',
        '-movflags', '+faststart',
        toFsPath(outFile.uri),
      ],
      { onLog: opts.onLog, signal: opts.signal },
    );
  } finally {
    doneEncode();
  }

  const doneCheck = mark('Checking the render');
  try {
    const frame0 = bucketFile('thumbnails', slug, `${slug}-frame0.png`);
    const frame30 = bucketFile('thumbnails', slug, `${slug}-frame30.png`);
    for (const f of [frame0, frame30]) {
      if (f.exists) f.delete();
    }
    const [ok0, ok30, lufs, gaps] = await Promise.all([
      extractFrame(outFile.uri, 0, frame0.uri),
      extractFrame(outFile.uri, 1, frame30.uri),
      measureIntegratedLoudness(outFile.uri),
      detectSilences(outFile.uri, -35, PAUSE_ACCEPT_SECONDS),
    ]);
    const info: RenderInfo = {
      draft: opts.draft,
      width: W,
      height: H,
      hookText,
      ...(lufs === undefined ? {} : { lufs }),
      ...(gaps ? { longGaps: gaps.length } : {}),
      ...(paced.removed > 0 ? { pausesCut: Math.round(paced.removed * 100) / 100 } : {}),
      ...(ok0 ? { frame0: frame0.uri } : {}),
      ...(ok30 ? { frame30: frame30.uri } : {}),
    };
    if (opts.onLog) {
      const loudness = lufs !== undefined ? `, ${lufs.toFixed(1)} LUFS` : '';
      const silences = gaps
        ? `, ${gaps.length} silence${gaps.length === 1 ? '' : 's'} over ${PAUSE_ACCEPT_SECONDS} s`
        : '';
      opts.onLog([`Render checked: ${W}x${H}${loudness}${silences}`]);
    }
    opts.onRenderInfo?.(info);
  } finally {
    doneCheck();
  }
  opts.onProgress?.('Done', 5, 5);
  return outFile.uri;
}

/** Renders every chapter to its own segment, then joins them without re-encoding. */
export async function assembleLongform(project: Project, opts: AssembleOptions): Promise<string> {
  const script = project.script as any;
  const slug = project.slug;
  const W = opts.draft ? 1280 : LONG_W;
  const H = opts.draft ? 720 : LONG_H;

  const missing = unvoicedTracks(script, project.assets.audio);
  if (missing.length) {
    throw new Error(
      `No voiceover yet for: ${missing.join(', ')}. Synthesise ${missing.length > 1 ? 'them' : 'it'} on the Voice screen first, or the video would have no voice there.`,
    );
  }

  const keys = ['0', ...script.chapters.map((c: any) => String(c.index)), '99'];
  const rendered: string[] = [];
  const total = keys.length + 1;

  for (let i = 0; i < keys.length; i++) {
    if (opts.signal?.aborted) throw new Error('Render cancelled.');
    const key = keys[i];
    opts.onProgress?.(`Syncing chapter ${key}`, i + 1, total);
    let segment: string | null;
    try {
      segment = await assembleChapter(project, key, W, H, opts);
    } catch (e) {
      if (e instanceof FFmpegError && !opts.signal?.aborted) {
        const label = key === '0' ? 'Cold open' : key === '99' ? 'Closing' : `Chapter ${key}`;
        throw new FFmpegError(`${label}: ${e.message}`, e.logs);
      }
      throw e;
    }
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
    { onLog: opts.onLog, signal: opts.signal },
  );

  return outFile.uri;
}

/** Renders one chapter to its own MP4, exactly as long as that chapter's audio (plus any planned pauses). */
async function assembleChapter(
  project: Project,
  key: string,
  W: number,
  H: number,
  opts: AssembleOptions,
): Promise<string | null> {
  const script = project.script as any;
  const slug = project.slug;

  const audioUri = project.assets.audio[key];
  if (!audioUri) return null;

  const audioDuration = await probeDuration(audioUri);
  if (audioDuration <= 0) {
    const what = key === '0' ? 'the cold open' : key === '99' ? 'the closing' : `chapter ${key}`;
    throw new Error(`The voiceover for ${what} cannot be read. Synthesise it again on the Voice screen.`);
  }

  const chapter = script.chapters.find((c: any) => String(c.index) === key);
  const aligned: any[] = project.assets.alignment[key] ?? [];
  const paused = chapter?.cues?.pauses.length && aligned.length ? applyPauses(aligned, chapter.cues.pauses) : null;
  const duration = audioDuration + (paused?.extra ?? 0);
  const words: any[] = paused?.words ?? aligned;

  let heroA = project.assets.clips[`${key}_a`];
  const heroB = project.assets.clips[`${key}_b`];
  let still = project.assets.stills[key];
  if (!heroA && !heroB && !still) {
    // The cold open and closing borrow the first / last chapter's visuals.
    const first = script.chapters[0];
    const last = script.chapters[script.chapters.length - 1];
    if (key === '0' && first) {
      heroA = project.assets.clips[`${first.index}_a`] ?? project.assets.clips[`${first.index}_b`];
      if (!heroA) still = project.assets.stills[String(first.index)];
    } else if (key === '99' && last) {
      still = project.assets.stills[String(last.index)];
      if (!still) heroA = project.assets.clips[`${last.index}_b`] ?? project.assets.clips[`${last.index}_a`];
    }
  }

  const inputs: string[] = [];
  const filters: string[] = [];
  const labels: string[] = [];
  let idx = 0;
  let stage: string;

  const isFirstChapter = Boolean(script.bankV2 && chapter && script.chapters[0] === chapter);
  const hasTitleCard = Boolean(chapter?.visuals?.[0]?.card?.kind === 'title');
  const showTitle = Boolean(chapter && script.scriptSource && opts.includeCaptions && duration > 3 && !isFirstChapter);
  let timed: any[] = [];
  const planned = Boolean(
    chapter?.visuals?.some((v: any) =>
      v.kind !== 'clip' ? project.assets.stills[v.reuse ?? v.key] : project.assets.clips[v.key],
    ),
  );

  if (chapter?.visuals?.length && (planned || !(heroA || heroB || still))) {
    // Screenplay: each planned visual on its own slot of the timeline.
    const starts = wordStarts(chapter.visuals);
    timed = timeVisuals(chapter.visuals, words, duration, (v: any) =>
      v.kind === 'card'
        ? `card:${v.key}`
        : v.kind === 'clip'
          ? project.assets.clips[v.key]
          : project.assets.stills[v.reuse ?? v.key],
    );
    const cover = `scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H},setsar=1`;
    const label = () => `v${idx}`;
    for (const t of timed) {
      const dur = t.end - t.start;
      const durStr = dur.toFixed(3);
      if (t.visual.kind === 'card') {
        const card = t.visual.card;
        const frames = await renderCardFrames(card, { slug, width: W, height: H });
        let seconds = cardFrameSeconds(card, dur);
        const vi = chapter.visuals.indexOf(t.visual);
        if (t.visual.beats && t.visual.beats.length === frames.length && words.length) {
          const offsets: number[] = t.visual.beats.map(
            (b: number) => (words[Math.min(starts[vi] + b, words.length - 1)]?.start ?? t.start) - t.start,
          );
          const lengths = offsets.map((o, i) => (i + 1 < offsets.length ? offsets[i + 1] - o : dur - o));
          if (offsets[0] <= 0.5 && lengths.every((l) => l >= 0.2)) {
            seconds = [lengths[0] + Math.max(0, offsets[0]), ...lengths.slice(1)];
          }
        }
        const out = label();
        if (frames.length !== 1) {
          const list = bucketFile('segments', slug, `card_${key}_${vi}.ffconcat`);
          writeText(list, frameConcat(frames.map((p, i) => ({ path: toFsPath(p), seconds: seconds[i] }))));
          inputs.push('-f', 'concat', '-safe', '0', '-i', toFsPath(list.uri));
        } else {
          inputs.push('-i', toFsPath(frames[0]));
        }
        filters.push(
          `[${idx}:v]${cover},fps=${FPS},format=yuv420p,tpad=stop_mode=clone:stop_duration=${durStr},trim=duration=${durStr},setpts=PTS-STARTPTS[${out}]`,
        );
        labels.push(out);
        idx++;
      } else if (t.visual.kind === 'clip') {
        const use = Math.max(0.1, await probeDuration(t.uri));
        const len = dur > use + CLIP_SHORTFALL_SECONDS ? use : dur;
        const out = label();
        inputs.push('-i', toFsPath(t.uri));
        filters.push(
          `[${idx}:v]${cover},fps=${FPS},format=yuv420p,` +
            `trim=duration=${len.toFixed(3)},setpts=PTS-STARTPTS,tpad=stop_mode=clone:stop_duration=${len.toFixed(3)},trim=duration=${len.toFixed(3)}[${out}]`,
        );
        labels.push(out);
        idx++;
        if (dur > use + CLIP_SHORTFALL_SECONDS) {
          // Hold the clip's last frame with a slow push-in for the rest of the slot.
          const rest = dur - use;
          const tail = label();
          inputs.push('-sseof', '-0.2', '-i', toFsPath(t.uri));
          filters.push(
            `[${idx}:v]${cover},fps=${FPS},trim=end_frame=1,setpts=PTS-STARTPTS,${kenBurnsFilter('zoom_in', rest, W, H, FPS)},setsar=1,format=yuv420p[${tail}]`,
          );
          labels.push(tail);
          idx++;
        }
      } else {
        const parts = stillParts(key === '0' || key === '1' ? t.start : 1e9, dur);
        const base = Math.max(0, KB_MOVES.indexOf(t.visual.kenBurns ?? 'zoom_in'));
        for (let i = 0; i < parts; i++) {
          const out = label();
          inputs.push(...stillInputArgs(toFsPath(t.uri)));
          filters.push(
            `[${idx}:v]${kenBurnsFilter(KB_MOVES[(base + i) % KB_MOVES.length], dur / parts, W, H, FPS)},setsar=1,format=yuv420p[${out}]`,
          );
          labels.push(out);
          idx++;
        }
      }
    }
    if (!labels.length) {
      filters.push(
        `color=c=black:s=${W}x${H}:r=${FPS}:d=${duration.toFixed(3)},setsar=1,format=yuv420p[vbed]`,
      );
      labels.push('vbed');
    }
    inputs.push('-i', toFsPath(audioUri));
    idx++;
    if (labels.length > 1) {
      filters.push(`${labels.map((l) => `[${l}]`).join('')}concat=n=${labels.length}:v=1:a=0[vcat]`);
      stage = 'vcat';
    } else {
      stage = labels[0];
    }
  } else {
    const durA = heroA ? await probeDuration(heroA) : 0;
    const durB = heroB ? await probeDuration(heroB) : 0;

    if (heroA) {
      inputs.push('-i', toFsPath(heroA));
      filters.push(normaliseVideo(`${idx}:v`, `v${idx}`, W, H, true, await probeSize(heroA)));
      labels.push(`v${idx}`);
      idx++;
    }
    if (heroB) {
      inputs.push('-i', toFsPath(heroB));
      filters.push(normaliseVideo(`${idx}:v`, `v${idx}`, W, H, true, await probeSize(heroB)));
      labels.push(`v${idx}`);
      idx++;
    }

    // The still fills whatever the hero clips leave uncovered. With no hero clips
    // at all it carries the entire chapter, keeping a half-sourced project renderable.
    const stillDuration = connectiveStillDuration(duration, durA, durB);
    if (still) {
      inputs.push(...stillInputArgs(toFsPath(still)));
      const move = chapter?.kenBurns ?? 'zoom_in';
      filters.push(`[${idx}:v]${kenBurnsFilter(move, stillDuration, W, H, FPS)},setsar=1,format=yuv420p[v${idx}]`);
      labels.push(`v${idx}`);
      idx++;
    } else if (!labels.length) {
      // Nothing visual at all — a black bed keeps the chapter in the final cut.
      filters.push(
        `color=c=black:s=${W}x${H}:r=${FPS}:d=${duration.toFixed(3)},setsar=1,format=yuv420p[vbed]`,
      );
      labels.push('vbed');
    }

    inputs.push('-i', toFsPath(audioUri));
    idx++;
    if (labels.length > 1) {
      filters.push(`${labels.map((l) => `[${l}]`).join('')}concat=n=${labels.length}:v=1:a=0[vcat]`);
      stage = 'vcat';
    } else {
      stage = labels[0];
    }

    const videoTotal = durA + durB + (still ? stillDuration : labels.length ? duration : 0);
    const factor = setptsFactor(duration, videoTotal);
    if (factor) {
      filters.push(`[${stage}]setpts=${factor.toFixed(5)}*PTS[vsync]`);
      stage = 'vsync';
    }
  }
  const audioIdx = idx - 1;

  // Guarantee the chapter's visuals cover its audio even when the clamped setpts
  // correction could not stretch far enough.
  filters.push(`[${stage}]tpad=stop_mode=clone:stop_duration=${HOLD_TAIL}[vhold]`);
  stage = 'vhold';

  // Chapter-local alignment starts at zero, so captions are composited per
  // chapter and never need rebasing onto a global timeline.
  if (opts.includeCaptions) {
    const captions = await prepareCaptions(
      project,
      key,
      'long',
      W,
      H,
      duration,
      opts,
      paused ? { words, maxHoldSeconds: 0.7 } : {},
    );
    if (captions) {
      inputs.push(...captions.inputs);
      const ci = idx++;
      filters.push(captions.filter(stage, `${ci}:v`, 'vcap'));
      stage = 'vcap';
    }
  }

  if (opts.includeMascot && chapter) {
    const chapterIndex = script.chapters.indexOf(chapter);
    const holds = chapterHolds({
      index: chapterIndex,
      narration: chapter.narration,
      words,
      duration,
      pillar: script.bankV2?.pillar,
      hookPose: script.bankV2?.hootHookPose,
      cardSeconds: hasTitleCard
        ? timed[0]
          ? Math.max(0, timed[0].end - timed[0].start)
          : TITLE_CARD_SECONDS
        : showTitle
          ? TITLE_CARD_SECONDS
          : 0,
      last: chapterIndex === script.chapters.length - 1 && !script.closingSynthesis,
    });
    const track = buildTrack({ duration, words, holds, seed: `${project.id}:${key}` });
    const place = HOOT_PLACEMENT.long;
    const hootW = Math.round(place.widthRatio * W);
    const margin = Math.round(place.marginRatio * W);
    const hi = idx++;
    inputs.push(...(await hootTrackInput(track, hootW, false, slug, `ch_${key}`, opts)));
    filters.push(`[${hi}:v]fps=${FPS},format=rgba[hoot]`);
    filters.push(
      `[${stage}][hoot]overlay=main_w-overlay_w-${margin}:main_h-overlay_h-${margin}:eof_action=repeat[vhoot]`,
    );
    stage = 'vhoot';

    // Hoot "stingers": a larger Hoot pops in for a moment after the cued words.
    for (const [i, cue] of (chapter.cues?.hoot ?? []).entries()) {
      const w = words[Math.min(cue.after, words.length - 1)];
      if (!w) continue;
      const at = Math.min(w.end, Math.max(0, duration - HOOT_MOMENT_SECONDS));
      const size = Math.round(place.widthRatio * W * 1.8);
      const sting = buildTrack({
        duration: HOOT_MOMENT_SECONDS,
        words: [],
        holds: [{ pose: cue.pose, start: 0, end: HOOT_MOMENT_SECONDS }],
        seed: `${project.id}:${key}:s${i}`,
      });
      const si = idx++;
      inputs.push(...(await hootTrackInput(sting, size, false, slug, `st_${key}_${i}`, opts)));
      filters.push(`[${si}:v]fps=${FPS},format=rgba,setpts=PTS+${at.toFixed(3)}/TB[stinger${i}]`);
      filters.push(
        `[${stage}][stinger${i}]overlay=main_w-overlay_w-${margin}:main_h-overlay_h-${margin}:eof_action=pass[vstinger${i}]`,
      );
      stage = `vstinger${i}`;
    }
  }

  if (showTitle && chapter && !hasTitleCard) {
    const card = await renderTextCard({ text: chapter.title, slug, name: `chapter_${key}`, width: W });
    if (card) {
      inputs.push('-i', toFsPath(card.uri));
      const ci = idx++;
      filters.push(`[${ci}:v]format=rgba[chcard]`);
      filters.push(
        `[${stage}][chcard]overlay=0:${textCardY(H, card.height)}:enable='between(t,0,${TITLE_CARD_SECONDS})'[vchapter]`,
      );
      stage = 'vchapter';
    }
  }

  if (key === '99' && script.ctaQuestion && opts.includeCaptions && duration > CTA_CARD_SECONDS) {
    const card = await renderTextCard({ text: script.ctaQuestion, slug, name: 'cta_long', width: W });
    if (card) {
      inputs.push('-i', toFsPath(card.uri));
      const ci = idx++;
      filters.push(`[${ci}:v]format=rgba[ctacard]`);
      filters.push(
        `[${stage}][ctacard]overlay=0:${textCardY(H, card.height)}:enable='between(t,${(duration - CTA_CARD_SECONDS).toFixed(2)},${duration.toFixed(2)})'[vcta]`,
      );
      stage = 'vcta';
    }
  }

  let audioMap = `${audioIdx}:a`;
  if (paused && paused.cuts.length) {
    // Planned pauses: split the voice at each cut and splice silence in.
    const n = paused.cuts.length + 1;
    filters.push(
      `[${audioIdx}:a]asplit=${n}${Array.from({ length: n }, (_, i) => `[vo${i}]`).join('')}`,
    );
    const bounds = [0, ...paused.cuts.map((c) => c.at)];
    const parts: string[] = [];
    for (let i = 0; i < n; i++) {
      const end = i + 1 < n ? `:end=${bounds[i + 1].toFixed(3)}` : '';
      filters.push(`[vo${i}]atrim=start=${bounds[i].toFixed(3)}${end},asetpts=PTS-STARTPTS,${AUDIO_FORMAT}[av${i}]`);
      parts.push(`[av${i}]`);
      if (i < paused.cuts.length) {
        filters.push(`anullsrc=r=44100:cl=stereo,atrim=0:${paused.cuts[i].secs.toFixed(3)},${AUDIO_FORMAT}[az${i}]`);
        parts.push(`[az${i}]`);
      }
    }
    filters.push(`${parts.join('')}concat=n=${parts.length}:v=0:a=1[apaused]`);
    audioMap = '[apaused]';
  }

  const outFile = bucketFile('segments', slug, `ch_${key}.mp4`);
  if (outFile.exists) outFile.delete();

  await run(
    [
      '-y',
      ...inputs,
      '-filter_complex', filters.join(';'),
      '-map', `[${stage}]`,
      '-map', audioMap,
      '-t', duration.toFixed(3),
      '-c:v', 'libx264',
      '-preset', opts.draft ? 'veryfast' : 'medium',
      '-crf', opts.draft ? '28' : '20',
      '-pix_fmt', 'yuv420p',
      '-r', String(FPS),
      '-c:a', 'aac',
      '-b:a', '192k',
      '-ar', '44100',
      '-ac', '2',
      // Uniform timebase across every segment, otherwise the concat demuxer
      // refuses to stream-copy them together.
      '-video_track_timescale', '90000',
      toFsPath(outFile.uri),
    ],
    { onLog: opts.onLog, signal: opts.signal },
  );

  return outFile.uri;
}

/** Samples candidate thumbnail frames across the runtime (JPEG, PNG as a fallback). */
export async function sampleThumbnailFrames(videoUri: string, slug: string, onLog?: LogSink): Promise<string[]> {
  const duration = await probeDuration(videoUri);
  if (duration <= 0) throw new Error('Could not read the video duration. Re-render the video and try again.');

  const dir = bucketDir('thumbnails', slug);
  const out: string[] = [];
  let lastLine = '';

  const capture = async (file: File, at: number): Promise<boolean> => {
    if (file.exists) file.delete();
    try {
      await run(
        ['-y', '-ss', at.toFixed(3), '-i', toFsPath(videoUri), '-frames:v', '1', '-q:v', '2', toFsPath(file.uri)],
        {
          onLog: (lines) => {
            lastLine = lines[lines.length - 1] ?? lastLine;
            onLog?.(lines);
          },
        },
      );
      return file.exists && file.size > 1024;
    } catch (e) {
      lastLine = e instanceof Error ? e.message : String(e);
      return false;
    }
  };

  for (let i = 0; i < THUMB_MARKS.length; i++) {
    const at = duration * THUMB_MARKS[i];
    if (at >= duration) continue;
    const jpg = new File(dir, `candidate_${i}.jpg`);
    if (await capture(jpg, at)) {
      out.push(jpg.uri);
      continue;
    }
    const png = new File(dir, `candidate_${i}.png`);
    if (await capture(png, at)) out.push(png.uri);
  }

  if (!out.length) {
    throw new Error(`No frames could be read from the video.${lastLine ? ` FFmpeg said: ${lastLine}` : ''}`);
  }
  return out;
}
