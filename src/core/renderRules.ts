/**
 * The render rules for a Short: frame size and bitrate, loudness, how long a
 * pause may run, and the FFmpeg filters that cut, pace, mix and mark it.
 */

export const SHORT_RENDER = {
  width: 1080,
  height: 1920,
  fps: 30,
  videoKbps: 8000,
  maxrateKbps: 8000,
  bufsizeKbps: 16000,
  minVideoKbps: 6000,
};
/** YouTube's loudness target, and the window a finished render must land in. */
export const LOUDNESS = { integrated: -14, truePeak: -1.5, range: 7, acceptMin: -15, acceptMax: -13 };
/** Pauses longer than this are cut down to it. */
export const PAUSE_CAP_SECONDS = 0.35;
/** A render whose longest pause is under this passes. */
export const PAUSE_ACCEPT_SECONDS = 0.45;
export const HOOT_ENTRY_SECONDS = 3;
export const SHORT_HOOT = { widthRatio: 0.2, side: 'left' as const };
/** The patch over a generated clip's corner watermark, as a share of the width. */
export const WATERMARK_PATCH = 0.15;
export const TEXT_WATERMARK = { opacity: 0.4, marginRatio: 0.04 };
/** The pause at the end of a written line, at least… */
export const LINE_PAUSE_MIN = 0.4;
/** …and at most. */
export const LINE_PAUSE_MAX = 0.8;
/** How far a punch-in zooms. */
export const PUNCH_IN = 0.12;
export const WHOOSH_SECONDS = 0.3;
export const WHOOSH_DB = -24;

const AUDIO_FORMAT = 'aresample=44100,aformat=sample_fmts=fltp:channel_layouts=stereo';

export interface TimedWord {
  start: number;
  end: number;
  [key: string]: unknown;
}

export interface Cut {
  from: number;
  to: number;
}

export interface Insert {
  at: number;
  seconds: number;
}

/** Shortens every pause over the cap, keeping half the cap on each side. */
export function capPauses<T extends TimedWord>(words: T[], cap = PAUSE_CAP_SECONDS) {
  const cuts: Cut[] = [];
  const out: T[] = [];
  let removed = 0;
  words.forEach((w, i) => {
    const prev = words[i - 1];
    if (prev && w.start - prev.end > cap) {
      const from = prev.end + cap / 2;
      const to = w.start - cap / 2;
      cuts.push({ from, to });
      removed += to - from;
    }
    out.push({ ...w, start: w.start - removed, end: w.end - removed });
  });
  return { words: out, cuts, removed };
}

export function textWatermarkFilters(base: string, watermark: string, out: string, height: number): string[] {
  const margin = Math.round(TEXT_WATERMARK.marginRatio * height);
  return [
    `[${watermark}]format=rgba,lut=a='val*${TEXT_WATERMARK.opacity}'[wm]`,
    `[${base}][wm]overlay=${margin}:${margin}[${out}]`,
  ];
}

/** Paces the voice: line ends get a breath between the min and max, other pauses are capped. */
export function paceLines<T extends TimedWord>(words: T[], lineEnds: Set<number>, cap = PAUSE_CAP_SECONDS) {
  const cuts: Cut[] = [];
  const inserts: Insert[] = [];
  const out: T[] = [];
  let shift = 0;
  let removed = 0;
  let added = 0;
  words.forEach((w, i) => {
    const prev = words[i - 1];
    if (prev) {
      const gap = w.start - prev.end;
      const lineEnd = lineEnds.has(i - 1);
      const min = lineEnd ? LINE_PAUSE_MIN : 0;
      const max = lineEnd ? LINE_PAUSE_MAX : cap;
      if (gap > max) {
        const from = prev.end + max / 2;
        const to = w.start - max / 2;
        cuts.push({ from, to });
        removed += to - from;
        shift -= to - from;
      } else if (gap < min) {
        const seconds = min - Math.max(0, gap);
        inserts.push({ at: prev.end + Math.max(0, gap) / 2, seconds });
        added += seconds;
        shift += seconds;
      }
    }
    out.push({ ...w, start: w.start + shift, end: w.end + shift });
  });
  return { words: out, cuts, removed, inserts, added };
}

/** The index of each line's last word, or none when the lines don't add up to the words. */
export function lineEndIndexes(lines: string[], wordCount: number): Set<number> {
  const ends = new Set<number>();
  let n = 0;
  lines.slice(0, -1).forEach((l) => {
    n += l.split(/\s+/).filter(Boolean).length;
    ends.add(n - 1);
  });
  const last = lines.length ? lines[lines.length - 1].split(/\s+/).filter(Boolean).length : 0;
  if (n + last !== wordCount) return new Set();
  return ends;
}

const trim = (a: number, b: number | undefined) =>
  b !== undefined ? `start=${a.toFixed(4)}:end=${b.toFixed(4)}` : `start=${a.toFixed(4)}`;

/** Removes the cut spans from an audio stream. */
export function cutAudioFilters(input: string, cuts: Cut[], _total: number, out: string, format = AUDIO_FORMAT): string[] {
  if (!cuts.length) return [`[${input}]${format}[${out}]`];
  const segments: [number, number | undefined][] = [];
  let t = 0;
  for (const c of cuts) {
    segments.push([t, c.from]);
    t = c.to;
  }
  segments.push([t, undefined]);
  const split = `${out}_s`;
  const filters = [`[${input}]asplit=${segments.length}${segments.map((_, i) => `[${split}${i}]`).join('')}`];
  segments.forEach(([a, b], i) => {
    filters.push(`[${split}${i}]atrim=${trim(a, b)},asetpts=PTS-STARTPTS,${format}[${out}_k${i}]`);
  });
  filters.push(`${segments.map((_, i) => `[${out}_k${i}]`).join('')}concat=n=${segments.length}:v=0:a=1[${out}]`);
  return filters;
}

/** Removes the cut spans and adds silence at the inserts. */
export function editAudioFilters(
  input: string,
  cuts: Cut[],
  inserts: Insert[],
  out: string,
  format = AUDIO_FORMAT,
): string[] {
  if (!inserts.length) return cutAudioFilters(input, cuts, 0, out, format);
  const events = [
    ...cuts.map((c) => ({ at: c.from, cut: c as Cut | undefined, insert: undefined as Insert | undefined })),
    ...inserts.map((x) => ({ at: x.at, cut: undefined as Cut | undefined, insert: x as Insert | undefined })),
  ].sort((a, b) => a.at - b.at);
  const parts: ({ keep: [number, number | undefined] } | { silence: number })[] = [];
  let t = 0;
  for (const ev of events) {
    if (ev.cut) {
      parts.push({ keep: [t, ev.cut.from] });
      t = ev.cut.to;
    } else if (ev.insert) {
      parts.push({ keep: [t, ev.insert.at] }, { silence: ev.insert.seconds });
      t = ev.insert.at;
    }
  }
  parts.push({ keep: [t, undefined] });
  const keeps = parts.filter((p) => 'keep' in p);
  const split = `${out}_s`;
  const filters = [`[${input}]asplit=${keeps.length}${keeps.map((_, i) => `[${split}${i}]`).join('')}`];
  const labels: string[] = [];
  let k = 0;
  parts.forEach((p, i) => {
    if (!('keep' in p)) {
      filters.push(`aevalsrc=0|0:s=44100:d=${p.silence.toFixed(4)},${format}[${out}_p${i}]`);
    } else {
      const [a, b] = p.keep;
      filters.push(`[${split}${k++}]atrim=${trim(a, b)},asetpts=PTS-STARTPTS,${format}[${out}_p${i}]`);
    }
    labels.push(`[${out}_p${i}]`);
  });
  filters.push(`${labels.join('')}concat=n=${labels.length}:v=0:a=1[${out}]`);
  return filters;
}

export interface LoudnormMeasure {
  inputI: number;
  inputTp: number;
  inputLra: number;
  inputThresh: number;
  targetOffset: number;
}

/** The measurement JSON loudnorm prints in its first pass. */
export function parseLoudnorm(lines: string[]): LoudnormMeasure | undefined {
  const text = lines.join('\n');
  const at = text.lastIndexOf('{');
  if (at < 0) return undefined;
  const json = text.slice(at, text.indexOf('}', at) + 1);
  const field = (name: string) => {
    const m = new RegExp(`"${name}"\\s*:\\s*"?(-?[\\d.]+|-?inf)"?`, 'i').exec(json);
    const v = m ? Number(m[1]) : NaN;
    return Number.isFinite(v) ? v : undefined;
  };
  const inputI = field('input_i');
  const inputTp = field('input_tp');
  const inputLra = field('input_lra');
  const inputThresh = field('input_thresh');
  const targetOffset = field('target_offset');
  if ([inputI, inputTp, inputLra, inputThresh, targetOffset].some((v) => v === undefined)) return undefined;
  return {
    inputI: inputI as number,
    inputTp: inputTp as number,
    inputLra: inputLra as number,
    inputThresh: inputThresh as number,
    targetOffset: targetOffset as number,
  };
}

/** One-pass loudnorm, or the linear second pass when the first pass was measured. */
export function loudnormFilter(m?: LoudnormMeasure | null): string {
  const target = `I=${LOUDNESS.integrated}:TP=${LOUDNESS.truePeak}:LRA=${LOUDNESS.range}`;
  if (!m) return `loudnorm=${target}`;
  return `loudnorm=${target}:measured_I=${m.inputI}:measured_TP=${m.inputTp}:measured_LRA=${m.inputLra}:measured_thresh=${m.inputThresh}:offset=${m.targetOffset}:linear=true`;
}

export function loudnormMeasureArgs(input: string): string[] {
  return [
    '-hide_banner',
    '-nostats',
    '-i',
    input,
    '-af',
    `loudnorm=I=${LOUDNESS.integrated}:TP=${LOUDNESS.truePeak}:LRA=${LOUDNESS.range}:print_format=json`,
    '-f',
    'null',
    '-',
  ];
}

export function loudnessOk(lufs: number): boolean {
  return lufs >= LOUDNESS.acceptMin && lufs <= LOUDNESS.acceptMax;
}

/** The integrated loudness from an ebur128 summary. */
export function integratedFromEbur128(lines: string[]): number | undefined {
  let value: number | undefined;
  for (const line of lines) {
    const m = /^\s*I:\s*(-?[\d.]+)\s*LUFS/.exec(line);
    if (m) value = Number(m[1]);
  }
  return value;
}

/** A slow zoom that eases in over the shot. */
export function punchInFilter(width: number, height: number, seconds: number): string {
  const z = `(1+${PUNCH_IN}*min(t/${Math.max(0.5, seconds).toFixed(3)},1))`;
  return `scale=w='trunc(${width}*${z}/2)*2':h='trunc(${height}*${z}/2)*2':eval=frame,crop=${width}:${height}`;
}

/** Blurs out a generated clip's corner watermark. */
export function watermarkPatch(width: number, height: number): string {
  const size = Math.round(width * WATERMARK_PATCH);
  return `delogo=x=${width - size - 2}:y=${height - size - 2}:w=${size}:h=${size}`;
}

export function shortEncodeArgs(preview?: boolean): string[] {
  if (preview) return ['-c:v', 'libx264', '-preset', 'veryfast', '-crf', '28', '-pix_fmt', 'yuv420p'];
  return [
    '-c:v',
    'libx264',
    '-preset',
    'medium',
    '-b:v',
    `${SHORT_RENDER.videoKbps}k`,
    '-minrate',
    `${SHORT_RENDER.videoKbps}k`,
    '-maxrate',
    `${SHORT_RENDER.maxrateKbps}k`,
    '-bufsize',
    `${SHORT_RENDER.bufsizeKbps}k`,
    '-x264-params',
    'nal-hrd=cbr',
    '-pix_fmt',
    'yuv420p',
  ];
}

/** A soft whoosh under each cut. */
export function whooshFilters(input: string, cutTimes: number[], duration: number, out: string): string[] {
  const times = cutTimes.filter((t) => t > 0.05 && t < duration - 0.1).map((t) => Math.max(0, t - 0.08));
  if (!times.length) return [`[${input}]anull[${out}]`];
  const n = times.length;
  const source = `anoisesrc=d=${WHOOSH_SECONDS}:c=pink:r=44100:a=0.6,highpass=f=500,lowpass=f=5000,afade=t=in:d=0.1,afade=t=out:st=0.12:d=0.18,volume=${WHOOSH_DB}dB,aformat=sample_fmts=fltp:channel_layouts=stereo`;
  const labels = times.map((_, i) => `[${out}_w${i}]`);
  return [
    n !== 1 ? `${source},asplit=${n}${labels.join('')}` : `${source}${labels[0]}`,
    ...times.map((t, i) => `[${out}_w${i}]adelay=${Math.round(t * 1000)}|${Math.round(t * 1000)}[${out}_d${i}]`),
    `[${input}]${times.map((_, i) => `[${out}_d${i}]`).join('')}amix=inputs=${n + 1}:duration=first:normalize=0[${out}]`,
  ];
}

/** A10: a loud low-bass thud at 0:00.00 under the first word, limited so it never clips. */
export function hookHitFilters(input: string, out: string): string[] {
  const thud = '0.55*sin(2*PI*48*t)*exp(-7*t)+0.3*sin(2*PI*96*t)*exp(-12*t)+0.15*sin(2*PI*150*t)*exp(-22*t)';
  return [
    `aevalsrc='${thud}':s=44100:d=0.6,lowpass=f=320,volume=-1dB,aformat=sample_fmts=fltp:channel_layouts=stereo[${out}_hit]`,
    `[${input}][${out}_hit]amix=inputs=2:duration=first:normalize=0,alimiter=limit=0.97:level=disabled[${out}]`,
  ];
}

/** A quiet synth bed under the voice, ducked whenever the voice speaks. */
export function musicBedFilters(
  voice: string,
  duration: number,
  out: string,
  opts: { gainDb?: number; fadeSeconds?: number } = {},
): string[] {
  const gain = opts.gainDb ?? -15;
  const fade = opts.fadeSeconds ?? 1.5;
  const length = Math.max(2, duration + 2).toFixed(2);
  const weights = [0.25, 0.2, 0.2, 0.15];
  const expr = [110, 164.81, 220, 261.63].map((f, i) => `${weights[i]}*sin(2*PI*${f}*t)`).join('+');
  const fadeOutAt = Math.max(0, duration - fade).toFixed(2);
  return [
    `aevalsrc='${expr}':s=44100:d=${length},lowpass=f=900,tremolo=f=0.15:d=0.35,volume=${gain}dB,afade=t=in:d=${fade},afade=t=out:st=${fadeOutAt}:d=${fade},aformat=sample_fmts=fltp:channel_layouts=stereo[${out}_bed]`,
    `[${voice}]asplit=2[${out}_v1][${out}_v2]`,
    `[${out}_bed][${out}_v2]sidechaincompress=threshold=0.015:ratio=10:attack=15:release=450[${out}_duck]`,
    `[${out}_v1][${out}_duck]amix=inputs=2:duration=first:normalize=0[${out}]`,
  ];
}
