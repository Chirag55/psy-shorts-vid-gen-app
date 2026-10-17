import { CURRENT_CAST_IDS } from '@/assets/cast';
import { WORDS_PER_SECOND } from './guardrails';
import { STILL_COST_USD } from './stillQueue';

/** First line of the master prompt file. */
export const MASTER_HEADER = '# Generate one image per numbered line. Keep the number order.';
/** A screenplay scene id, e.g. "MF012-V3". */
export const SCENE_ID = /^[A-Z]+\d+-V\d+$/;
/** Smallest acceptable short side of an imported picture, in pixels. */
export const MIN_SIDE = 1080;

const CAST = CURRENT_CAST_IDS.map((id) => id.replace(/_v\d+$/, ''));
/** Filename words that say nothing about the picture. */
const NOISE = /^(?:img\d*|image\d*|scene|clip|video|still|s|c|png|jpe?g|webp|mp4|mov|webm|\d+)$/;

/** SHA-1 of a string's UTF-8 bytes, as hex. */
export function sha1(text: string): string {
  const bytes: number[] = [];
  for (const ch of unescape(encodeURIComponent(text))) bytes.push(ch.charCodeAt(0));
  const bits = bytes.length * 8;
  bytes.push(0x80);
  while (bytes.length % 64 !== 56) bytes.push(0);
  for (const word of [Math.floor(bits / 4294967296), bits >>> 0]) {
    for (let shift = 24; shift >= 0; shift -= 8) bytes.push((word >>> shift) & 255);
  }
  let [h0, h1, h2, h3, h4] = [1732584193, 4023233417, 2562383102, 271733878, 3285377520];
  const rol = (n: number, s: number) => (n << s) | (n >>> (32 - s));
  const w = new Array<number>(80);
  for (let off = 0; off < bytes.length; off += 64) {
    for (let i = 0; i < 16; i++) {
      const j = off + i * 4;
      w[i] = (bytes[j] << 24) | (bytes[j + 1] << 16) | (bytes[j + 2] << 8) | bytes[j + 3];
    }
    for (let i = 16; i < 80; i++) w[i] = rol(w[i - 3] ^ w[i - 8] ^ w[i - 14] ^ w[i - 16], 1);
    let [a, b, c, d, e] = [h0, h1, h2, h3, h4];
    for (let i = 0; i < 80; i++) {
      const [f, k] =
        i < 20
          ? [(b & c) | (~b & d), 1518500249]
          : i < 40
            ? [b ^ c ^ d, 1859775393]
            : i < 60
              ? [(b & c) | (b & d) | (c & d), 2400959708]
              : [b ^ c ^ d, 3395469782];
      const t = (rol(a, 5) + f + e + k + w[i]) | 0;
      [e, d, c, b, a] = [d, c, rol(b, 30), a, t];
    }
    h0 = (h0 + a) | 0;
    h1 = (h1 + b) | 0;
    h2 = (h2 + c) | 0;
    h3 = (h3 + d) | 0;
    h4 = (h4 + e) | 0;
  }
  return [h0, h1, h2, h3, h4].map((h) => (h >>> 0).toString(16).padStart(8, '0')).join('');
}

/** "S" or "C" from an id like "MF012-C3" or "S004". */
export function prefixOfId(id: string): string {
  return /([SC])\d+$/.exec(id)?.[1] ?? 'S';
}

/** The id of the i-th still (0-based): S001, S002… */
export function stillId(i: number, prefix: string = 'S'): string {
  return `${prefix}${String(i + 1).padStart(3, '0')}`;
}

const oneLine = (s: string) => s.replace(/\s+/g, ' ').trim();
const chapterOf = (key: string) => Number.parseInt(key, 10) || 0;
const natural = (a: string, b: string) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });
const wordsOf = (s: string) =>
  s
    .toLowerCase()
    .replace(/\.[a-z0-9]{2,4}$/, '')
    .split(/[^a-z0-9]+/)
    .filter((w) => w && !NOISE.test(w));

function jaccard(a: string[], b: string[]): number {
  const A = new Set(a);
  const B = new Set(b);
  let shared = 0;
  for (const w of A) if (B.has(w)) shared += 1;
  const union = A.size + B.size - shared;
  return union !== 0 ? shared / union : 0;
}

export interface MasterVisual {
  key: string;
  kind: string;
  prompt?: string;
  reuse?: string;
  words: number;
  cue?: string;
}

export interface ManifestRow {
  id: string;
  beat: number;
  seconds: number;
  cast: string[];
  hash: string;
  key: string;
}

/** One numbered prompt per new still, plus a manifest to match the downloads back. */
export function masterStills(visuals: MasterVisual[]) {
  const stills = visuals.filter((v) => v.kind === 'still' && !v.reuse && v.prompt);
  const manifest: ManifestRow[] = stills.map((s, i) => {
    const words = s.words + visuals.filter((v) => v.reuse === s.key).reduce((n, v) => n + v.words, 0);
    const prompt = oneLine(s.prompt as string);
    const lower = prompt.toLowerCase();
    return {
      id: s.cue && SCENE_ID.test(s.cue) ? s.cue : stillId(i),
      beat: chapterOf(s.key),
      seconds: Math.round((words / WORDS_PER_SECOND) * 10) / 10,
      cast: CAST.filter((c) => new RegExp(`\\b${c}\\b`).test(lower)),
      hash: sha1(prompt),
      key: s.key,
    };
  });
  const lines = stills.map((s, i) => `${manifest[i].id} | ${oneLine(s.prompt as string)}`);
  const cost = Math.round(stills.length * STILL_COST_USD * 100) / 100;
  return {
    lines,
    manifest,
    text: `${MASTER_HEADER}\n${lines.join('\n')}\n`,
    fileName: 'stills_master_prompt.txt',
    manifestName: 'stills_manifest.json',
    json: JSON.stringify(manifest.map(({ key: _key, ...rest }) => rest)),
    cost: `${stills.length} still${stills.length === 1 ? '' : 's'}. Flow images use no clip credits. (Gemini API: about $${cost.toFixed(2)}, $${STILL_COST_USD} each.)`,
  };
}

/** The number in a downloaded file's name ("S004.png", "scene_4", "004 - ..."), or null. */
export function numberInName(name: string, kind: string = 'S'): number | null {
  const base = name.replace(/^.*[\\/]/, '');
  const words = kind === 'C' ? 'c|clip|video|scene' : 's|still|scene';
  const m =
    new RegExp(`^(?:${words})[ _-]?0*(\\d{1,4})(?!\\d)`, 'i').exec(base) ?? /^0*(\d{1,4})[ _-]/.exec(base);
  return m ? Number.parseInt(m[1], 10) : null;
}

export interface PickedFile {
  name: string;
  uri?: string;
  width?: number;
  height?: number;
  modified?: number;
  [key: string]: unknown;
}

export interface FileMatch<F> {
  file: F;
  id?: string;
  method?: 'number' | 'text' | 'order' | 'time';
  confidence: 'high' | 'amber';
}

export interface DownloadMatch<F> {
  matches: FileMatch<F>[];
  variants: Record<string, F[]>;
  missing: string[];
  unmatched: F[];
  small: F[];
}

const isSmall = (f: PickedFile) => !!(f.width && f.height && Math.min(f.width, f.height) < MIN_SIDE);

/**
 * Matches downloaded files to manifest rows: by an id in the name, then by a
 * number, then by the prompt's words, and last by order when the counts agree.
 */
export function matchDownload<F extends PickedFile>(
  files: F[],
  shots: { id: string; prompt?: string }[],
  kind: string = 'S',
): DownloadMatch<F> {
  const ids = shots.map((s) => s.id);
  const positional = ids.length > 0 && ids.every((id) => SCENE_ID.test(id));
  const sorted = [...files].sort((a, b) => natural(a.name, b.name));
  const got = new Map<F, FileMatch<F>>();
  for (const f of sorted) {
    const base = f.name.replace(/^.*[\\/]/, '');
    const m = /(?<![A-Za-z0-9])(MF\d{3}-[SC]\d|[A-Z]+\d+-V\d+)(?!\d)/i.exec(base);
    const id = m?.[1] != null ? m[1].toUpperCase() : base;
    if (id && ids.includes(id)) got.set(f, { file: f, id, method: 'number', confidence: 'high' });
  }
  for (const f of sorted) {
    if (got.has(f)) continue;
    const n = numberInName(f.name, kind);
    const id =
      n !== null ? (ids.includes(stillId(n - 1, kind)) || !positional ? stillId(n - 1, kind) : ids[n - 1]) : null;
    if (id && ids.includes(id)) got.set(f, { file: f, id, method: 'number', confidence: 'high' });
  }
  for (const f of sorted) {
    if (got.has(f)) continue;
    const words = wordsOf(f.name);
    if (words.length < 4) continue;
    const scored = shots
      .filter((s) => s.prompt)
      .map((s) => {
        const pw = wordsOf(s.prompt as string);
        return { id: s.id, score: Math.max(jaccard(words, pw), jaccard(words, pw.slice(0, words.length))) };
      })
      .sort((a, b) => b.score - a.score);
    if (scored[0] && scored[0].score >= 0.6 && (!scored[1] || scored[1].score < scored[0].score)) {
      got.set(f, { file: f, id: scored[0].id, method: 'text', confidence: 'high' });
    }
  }
  const free = () => sorted.filter((f) => !got.has(f));
  const freeIds = () => ids.filter((id) => ![...got.values()].some((m) => m.id === id));
  const unnamed = free().filter((f) => !/(?<![A-Za-z0-9])MF\d{3}-[SC]\d/i.test(f.name));
  if (unnamed.length && unnamed.length === freeIds().length) {
    const open = freeIds();
    unnamed.forEach((f, i) => got.set(f, { file: f, id: open[i], method: 'order', confidence: 'amber' }));
  }
  const matches = sorted.map((f) => got.get(f) ?? { file: f, confidence: 'amber' as const });
  const variants: Record<string, F[]> = {};
  for (const m of matches) {
    if (m.id) (variants[m.id] ??= []).push(m.file);
  }
  return {
    matches,
    variants,
    missing: ids.filter((id) => !variants[id]),
    unmatched: matches.filter((m) => !m.id).map((m) => m.file),
    small: files.filter(isSmall),
  };
}

/** When the counts agree, files in download order match the manifest in order. */
export function matchByTime<F extends PickedFile>(files: F[], manifest: { id: string; prompt?: string }[]): DownloadMatch<F> {
  if (files.length !== manifest.length || files.some((f) => f.modified === undefined)) {
    return matchDownload(files, manifest);
  }
  const matches = [...files]
    .sort((a, b) => (a.modified as number) - (b.modified as number) || natural(a.name, b.name))
    .map((f, i): FileMatch<F> => ({ file: f, id: manifest[i].id, method: 'time', confidence: 'amber' }));
  const variants: Record<string, F[]> = {};
  for (const m of matches) variants[m.id as string] = [m.file];
  return { matches, variants, missing: [], unmatched: [], small: files.filter(isSmall) };
}

/** One file name per still key: the earlier pick when it is still offered, else the first variant. */
export function picksFor<F extends PickedFile>(
  match: DownloadMatch<F>,
  manifest: { id: string; key: string }[],
  previous: Record<string, string> = {},
): Record<string, string> {
  const picks: Record<string, string> = {};
  for (const row of manifest) {
    const files = match.variants[row.id];
    if (!files?.length) continue;
    picks[row.key] = (files.find((f) => f.name === previous[row.id]) ?? files[0]).name;
  }
  return picks;
}
