/**
 * Format checks for scene-first Short entries (CR-78 / CR-80 / CR-91):
 * word window, hook text, visual beats and the typed clip/still pattern.
 * Rebuilt from 6.1.13.
 */
import { contentWords, FIRST_SENTENCE_MAX_WORDS } from './authenticity';
import { citationHits, spokenBody } from './citations';
import { neutralHits } from './neutralLint';
import { VIRAL_SHOTS } from './viralBatch';

export { citationHits, spokenBody };

export const STANDARD_WORDS = { min: 46, max: 66 };
export const NUMBERED_MAX_WORDS = 82;
export const TYPED_MIN_WORDS = 36;
export const NUMBERED_RED_WORDS = 90;
export const MIN_RED_WORDS = 30;
export const BEATS = 5;
export const MIN_SETTINGS = 3;
export const SPOKEN_MAX_SECONDS = 32;
export const STILL_MOVES = ['push-in', 'pull-out', 'pan-left', 'pan-right', 'tilt-up', 'tilt-down'];
export const CLIP_MOVES = ['orbit', 'handheld', 'whip-pan', 'dolly-back', 'rack-focus', 'tracking'];
export const TYPED_PATTERN = ['clip', 'still', 'clip*', 'still', 'still', 'clip'];
export const TYPED_BEATS = TYPED_PATTERN.length;
export const MIN_TYPED_SETTINGS = 4;
export const SHOT_COUNT = { min: 6, max: 9 };
export const SHORT_CLIPS = 3;
export const SLOW_MOVES = [
  'slow push-in',
  'slow pull-out',
  'slow pan-left',
  'slow pan-right',
  'slow tilt-up',
  'slow tilt-down',
  'slow tracking',
];
export const TYPED_MAX_SHOT_SECONDS = 2.5;

export interface VisualBeat {
  id?: string;
  type?: string;
  size: string;
  setting: string;
  subject: string;
  camera: string;
}

/** Fields of a bank entry these checks read. */
export interface SceneFirstFields {
  id?: string;
  bank_id?: string;
  format?: string;
  narration: string;
  hook_text: string;
  hook_alt?: string;
  source_line?: string;
  visual_beats?: string[];
  published_on?: string;
  priority?: string;
  [field: string]: unknown;
}

export function isSceneFirst(e: { source_line?: string; visual_beats?: string[] }): boolean {
  return Boolean(e.source_line || e.visual_beats?.length);
}

/** "size | setting | subject and action | camera", optionally led by "MF065-1 clip". */
export function parseVisualBeat(line: string): VisualBeat | null {
  const p = line.split('|').map((s) => s.trim());
  if (p.length === 5 && p.every(Boolean)) {
    const m = /^(\S+)\s+(clip\*?|still)$/i.exec(p[0]);
    if (!m) return null;
    return { id: m[1], type: m[2].toLowerCase(), size: p[1], setting: p[2], subject: p[3], camera: p[4] };
  }
  if (p.length === 4 && p.every(Boolean)) return { size: p[0], setting: p[1], subject: p[2], camera: p[3] };
  if (p.length === 3 && p.every(Boolean)) return { size: p[0], setting: '', subject: p[1], camera: p[2] };
  return null;
}

export function sizeFamily(size: string): string {
  const k = size.toLowerCase().replace(/[^a-z]/g, '');
  if (/^(cu|closeup|ecu|macro)/.test(k)) return 'close';
  if (/^(wide|ws|establishing)/.test(k)) return 'wide';
  if (/^(insert|object)/.test(k)) return 'insert';
  if (/^pov/.test(k)) return 'pov';
  if (/^(medium|mid|ms|mcu)/.test(k)) return 'medium';
  if (/^(ots|overtheshoulder|overshoulder)/.test(k)) return 'ots';
  return k;
}

/** The typed six-beat pattern: clip/still order, id prefix, moves per type. */
export function typedBeatProblems(id: string, beats: VisualBeat[]): string[] {
  const out: string[] = [];
  const prefix = /^MF-\d{3}$/.test(id) ? id.replace('-', '') : '';
  beats.forEach((b, i) => {
    if (b.type !== TYPED_PATTERN[i]) {
      out.push(`beat ${i + 1} is "${b.type}"; the pattern is ${TYPED_PATTERN.join(', ')}.`);
    }
    if (prefix && b.id && !b.id.startsWith(prefix)) {
      out.push(`beat ${i + 1} id "${b.id}" does not start with ${prefix}.`);
    }
    const moves = b.type !== 'still' ? CLIP_MOVES : STILL_MOVES;
    if (!moves.includes(b.camera)) {
      out.push(
        `beat ${i + 1} (${b.type}) uses the move "${b.camera}"; ${b.type === 'still' ? 'a still' : 'a clip'} takes ${moves.join(', ')}.`,
      );
    }
  });
  const cams = beats.map((b) => b.camera);
  if (new Set(cams).size !== cams.length) out.push('a camera move repeats inside the Short; every beat needs its own.');
  if (beats.some((b, i) => i && b.size.toLowerCase() === beats[i - 1].size.toLowerCase())) {
    out.push('two neighbouring beats share a shot size.');
  }
  if (new Set(beats.map((b) => b.setting.toLowerCase())).size < MIN_TYPED_SETTINGS) {
    out.push(`the beats use fewer than ${MIN_TYPED_SETTINGS} settings.`);
  }
  return [...new Set(out)];
}

export function shortFormatProblems(e: SceneFirstFields): { red: string[]; amber: string[] } {
  const red: string[] = [];
  const amber: string[] = [];
  if (!isSceneFirst(e) || e.published_on || e.priority === 'published') return { red, amber };

  const cites = citationHits(e.narration);
  if (cites.length) {
    red.push(
      `The voice cites its source ("${cites.join('", "')}"). Put it in source_line; the narration states the effect as plain fact.`,
    );
  }

  const shots = (e.visual_beats ?? []).map(parseVisualBeat);
  const cr91 =
    shots.length >= SHOT_COUNT.min &&
    shots.length <= (e.viral_batch ? VIRAL_SHOTS : SHOT_COUNT.max) &&
    shots.every((s) => s?.type && /^slow\b/i.test(s.camera));
  if (cr91) {
    const list = shots as VisualBeat[];
    const clips = list.filter((s) => s.type?.startsWith('clip')).length;
    if (clips !== SHORT_CLIPS) red.push(`a Short has exactly ${SHORT_CLIPS} Veo clips; this one has ${clips} (CR-91).`);
    if (new Set(list.map((s) => s.id)).size !== list.length) {
      red.push('a shot id repeats; every shot is its own picture (CR-91).');
    }
    list.forEach((s, i) => {
      if (!SLOW_MOVES.includes(s.camera)) {
        red.push(`shot ${i + 1} uses the move "${s.camera}"; only slow moves: ${SLOW_MOVES.join(', ')} (CR-91).`);
      }
    });
    const hits = neutralHits((e.visual_beats ?? []).join(' '));
    if (hits.length) amber.push(`visual_beats name culture-tied words: ${hits.join(', ')} (CR-78).`);
    if (!e.source_line) amber.push('No source_line: the description will have nothing to cite.');
    return { red, amber };
  }

  const n = contentWords(spokenBody(e.narration)).length;
  const numbered = e.format === 'LIST';
  const max = numbered ? NUMBERED_MAX_WORDS : STANDARD_WORDS.max;
  const typedAny = e.visual_beats?.some((b) => parseVisualBeat(b)?.type);
  const min = typedAny ? TYPED_MIN_WORDS : STANDARD_WORDS.min;
  if (n > NUMBERED_RED_WORDS || n < MIN_RED_WORDS) {
    red.push(
      `The narration is ${n} words before the sign-off; ${MIN_RED_WORDS} to ${NUMBERED_RED_WORDS} is the most the format allows.`,
    );
  } else if (n > max || n < min) {
    amber.push(
      `The narration is ${n} words before the sign-off; ${min} to ${max} is the target for ${numbered ? 'a numbered Short' : 'a Short'}.`,
    );
  }

  const hookWords = e.hook_text.trim().split(/\s+/).filter(Boolean).length;
  if (hookWords < 2 || hookWords > 6) {
    amber.push(`hook_text is ${hookWords} word${hookWords === 1 ? '' : 's'}; 2 to 6 reads in one glance.`);
  }
  if (e.hook_alt) {
    const first = e.hook_alt.split(/(?<=[.?!])\s+/)[0] ?? '';
    if (contentWords(first).length > FIRST_SENTENCE_MAX_WORDS) {
      amber.push(`hook_alt's first sentence is over ${FIRST_SENTENCE_MAX_WORDS} words.`);
    }
  }
  if (!e.source_line) amber.push('No source_line: the description will have nothing to cite.');

  if (!e.visual_beats?.length) return { red, amber };
  const beats = e.visual_beats.map(parseVisualBeat);
  const typed = beats.some((b) => b?.type);
  const need = typed ? TYPED_BEATS : BEATS;
  if (e.visual_beats.length !== need) red.push(`visual_beats has ${e.visual_beats.length} beats; ${need} are needed.`);
  const bad = beats.findIndex((b) => !b);
  if (bad >= 0) {
    red.push(
      `visual_beats beat ${bad + 1} is not "shot size | setting | subject and action | camera" (the setting may be left out).`,
    );
    return { red, amber };
  }
  const parsed = beats as VisualBeat[];
  if (typed) typedBeatProblems(e.bank_id ?? e.id ?? '', parsed).forEach((p) => red.push(p));
  if (new Set(parsed.map((b) => (b.setting || b.subject).toLowerCase())).size < MIN_SETTINGS) {
    amber.push(`visual_beats use fewer than ${MIN_SETTINGS} settings.`);
  }
  const hits = neutralHits(e.visual_beats.join(' '));
  const neutralLine = hits.length ? [`visual_beats name culture-tied words: ${hits.join(', ')} (CR-78).`] : [];
  if (typed) return { red, amber: [...amber, ...neutralLine] };

  parsed.forEach((b, i) => {
    if (!i) return;
    const prev = parsed[i - 1];
    if (sizeFamily(b.size) === sizeFamily(prev.size)) {
      amber.push(`visual_beats beats ${i} and ${i + 1} share the shot size "${b.size}".`);
    }
    if (b.camera.toLowerCase() === prev.camera.toLowerCase()) {
      amber.push(`visual_beats beats ${i} and ${i + 1} use the same camera move.`);
    }
  });
  const families = new Set(parsed.map((b) => sizeFamily(b.size)));
  if (!families.has('pov')) amber.push('visual_beats have no POV shot.');
  if (!families.has('insert')) amber.push('visual_beats have no insert (object) shot.');
  amber.push(...neutralLine);
  return { red, amber };
}

/** Parsed beats, or null when any line does not parse. */
export function usableBeatsOf(e: { visual_beats?: string[] }): VisualBeat[] | null {
  const beats = (e.visual_beats ?? []).map(parseVisualBeat);
  return beats.length && beats.every(Boolean) ? (beats as VisualBeat[]) : null;
}
