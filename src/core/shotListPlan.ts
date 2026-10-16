import type { Card } from './cards';
import { WORDS_PER_SECOND } from './guardrails';

/** One row of a long-form shot list: V clip, S still, C card. */
export interface ListShot {
  n: number;
  type: 'V' | 'S' | 'C';
  cue: string;
  visual: string;
  section: number;
}

export interface ShotList {
  style: string;
  sections: string[];
  shots: ListShot[];
}

/** Hand fixes per shot number: a placement phrase, card fields, card beat phrases. */
export interface ShotOverrides {
  anchors?: Record<number, string>;
  cards?: Record<number, Record<string, unknown>>;
  beats?: Record<number, string[]>;
}

export interface ListVisual {
  key: string;
  kind: 'clip' | 'still' | 'card';
  prompt: string;
  text: string;
  words: number;
  shot: number;
  cue: string;
  kenBurns?: string;
  card?: Card;
  beats?: number[];
}

/** The longest a shot should hold, in seconds. */
export const LONGEST_SHOT_SECONDS = 12;

const SECTION_RE = /^###\s+(.+?)\s*$/;
const ROW_RE = /^\|\s*(\d+)\s*\|\s*([VSC])\s*\|(.*)\|\s*$/;
const ONES = [
  'zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten',
  'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen',
];
const TENS = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];
const KEN_BURNS = ['zoom_in', 'pan_right', 'zoom_out', 'pan_left'];
const CAMERA_RE = /\b(push|pull|pan|tilt|dolly|track|static|zoom|drift|handheld|crane)\b/i;
/** Words a sentence-length title card covers. */
const TITLE_SPAN = { min: 6, max: 13 };
/** Words a number card stays up after its number is said. */
const CARD_TAIL = 7;
/** Words before the next shot a card may take back. */
const CARD_HOLD = { title: 30, number: 14 };
const CHAPTER_OPEN = /^chapter open$/i;
const MASCOT_RE = /\b(hoot|owl|mascot|professor|presenter)\b/i;

/** A number under 1000 in words, as narration says it. */
export function numberWords(n: number): string {
  if (n < 20) return ONES[n];
  if (n < 100) return TENS[Math.floor(n / 10)] + (n % 10 ? `-${ONES[n % 10]}` : '');
  const rest = n % 100;
  return `${ONES[Math.floor(n / 100)]} hundred${rest ? ` ${numberWords(rest)}` : ''}`;
}

function norm(w: string): string {
  return w
    .toLowerCase()
    .replace(/[’]/g, "'")
    .replace(/[^a-z0-9'-]/g, '')
    .replace(/^[-']+|[-']+$/g, '');
}

interface Word {
  raw: number;
  word: string;
}

const wordsOf = (text: string): Word[] =>
  text
    .split(/\s+/)
    .filter(Boolean)
    .map((w, i) => ({ raw: i, word: norm(w) }))
    .filter((w) => w.word);

/** The raw index where `phrase` starts at or after `from`, or -1. */
function find(words: Word[], phrase: string, from: number): number {
  const toks = phrase.split(/\s+/).map(norm).filter(Boolean);
  if (!toks.length) return -1;
  for (let i = 0; i + toks.length <= words.length; i++) {
    if (words[i].raw < from) continue;
    if (toks.every((t, k) => words[i + k].word === t)) return words[i].raw;
  }
  return -1;
}

/** The quoted pieces of a cue, split at ellipses. */
function cueFragments(cue: string): string[] {
  return cue
    .replace(/[“”"]/g, '')
    .split(/…|\.\.\./)
    .map((s) => s.replace(/[.?!]+$/g, '').trim())
    .filter((s) => norm(s).length > 0 && /[a-z]/i.test(s));
}

/** Numbers in a cue, written out as the narration says them. */
function numberPhrases(text: string): string[] {
  const out: string[] = [];
  for (const m of text.matchAll(/\$?(\d{1,3})\s*[%×]?/g)) {
    const n = Number(m[1]);
    if (n >= 0 && n < 1000) out.push(numberWords(n));
  }
  return out;
}

function quoted(text: string): string[] {
  return [...text.matchAll(/["“]([^"”]+)["”]/g)].map((m) => m[1]);
}

function percents(text: string): number[] {
  return [...text.matchAll(/(\d+(?:\.\d+)?)\s*%/g)].map((m) => Number(m[1]));
}

/** The word index each shot starts on: found cues, gaps spread evenly, never going back. */
export function placeShots(
  shots: Pick<ListShot, 'n' | 'cue' | 'visual'>[],
  narration: string,
  overrides: ShotOverrides = {},
): number[] {
  const words = wordsOf(narration);
  const total = narration.split(/\s+/).filter(Boolean).length;
  const found: (number | null)[] = [];
  let cursor = 0;
  shots.forEach((s, i) => {
    if (i === 0) {
      found.push(0);
      return;
    }
    let at = -1;
    const anchor = overrides.anchors?.[s.n];
    const phrases = anchor ? [anchor] : [...cueFragments(s.cue)];
    if (!anchor && !CHAPTER_OPEN.test(s.cue)) {
      if (!phrases.length || /\d/.test(s.cue)) phrases.push(...numberPhrases(s.cue));
      if (!phrases.length) phrases.push(...numberPhrases(s.visual));
    }
    for (const p of phrases) {
      at = find(words, p, cursor);
      if (at >= 0) break;
    }
    if (at >= 0) cursor = at;
    found.push(at >= 0 ? at : null);
  });
  const out = found.map((v) => v ?? -1);
  for (let i = 0; i < out.length; i++) {
    if (out[i] >= 0) continue;
    let j = i;
    while (j < out.length && out[j] < 0) j++;
    const prev = out[i - 1] ?? 0;
    const next = j < out.length ? out[j] : total;
    const span = j - i + 1;
    for (let k = i; k < j; k++) out[k] = Math.round(prev + ((next - prev) * (k - i + 1)) / span);
    i = j - 1;
  }
  for (let i = 1; i < out.length; i++) out[i] = Math.max(out[i], out[i - 1]);
  return out;
}

/** The drawn card a C shot describes. */
export function cardFromShot(shot: Pick<ListShot, 'cue' | 'visual'>, nextTitle?: string): Card {
  const { cue, visual } = shot;
  const q = quoted(visual);
  if (CHAPTER_OPEN.test(cue) && q.length) return { kind: 'title', text: q[0] };
  if (/^study card/i.test(visual) && q.length) {
    const [name, ...rest] = q[0].split(/\s*·\s*/);
    return { kind: 'study', name, meta: rest.join(' · ') };
  }
  if (/button icon/i.test(visual) && !/labell?ed/i.test(visual)) return { kind: 'pulse' };
  if (/icons? labell?ed/i.test(visual)) {
    return {
      kind: 'icons',
      labels: visual
        .replace(/^.*labell?ed\s*/i, '')
        .split('/')
        .map((s) => s.trim())
        .filter(Boolean),
    };
  }
  if (/end card/i.test(visual)) return { kind: 'end', text: nextTitle ?? 'Open the next file' };
  if (/split card/i.test(visual)) {
    const pairs = [...cue.matchAll(/(\d+)\s*→\s*(\d+)\s*%?/g)].map((m) => ({ from: m[1], to: `${m[2]}%`, caption: '' }));
    if (pairs.length) return { kind: 'split', pairs };
  }
  if (/number flip/i.test(visual)) {
    const [from, to] = q.length >= 2 ? q : (/(\d+%)\s*→\s*(\d+%)/.exec(cue) ?? []).slice(1);
    if (from && to) return { kind: 'flip', from, to, captions: ['', ''] };
  }
  if (/price cards/i.test(visual)) {
    const prices = [...visual.matchAll(/\$\d+/g)].map((m) => m[0]);
    if (prices.length >= 2) return { kind: 'prices', prices, labels: prices.map(() => ''), fade: Math.floor(prices.length / 2) };
  }
  if (/bars|stack/i.test(visual)) {
    const times = [...visual.matchAll(/(\d)×/g)].map((m) => Number(m[1]));
    const values = times.length >= 2 ? times : percents(cue);
    const labelText = /labels?:\s*(.+)$/i.exec(visual)?.[1] ?? '';
    const labels = labelText ? labelText.split('/').map((s) => s.trim().replace(/^["“]|["”]$/g, '')) : [];
    if (values.length) {
      return { kind: 'bars', values, labels: values.map((_, i) => labels[i] ?? ''), unit: times.length >= 2 ? '×' : '%' };
    }
  }
  if (!q.length) return { kind: 'label', lines: [visual.replace(/\.$/, '')] };
  const text = q[0];
  const lines = text.includes('→')
    ? text.split('→').map((s) => s.trim())
    : (text.match(/[^.?!]+[.?!]?/g) ?? [text]).map((s) => s.trim()).filter(Boolean);
  return { kind: 'label', lines, accentLast: lines.length > 1 };
}

/** Parses the "## … shot list" section of a long-form markdown file. */
export function parseShotList(md: string): { list?: ShotList; problems: string[] } {
  const lines = md.replace(/\r/g, '').split('\n');
  const problems: string[] = [];
  const start = lines.findIndex((l) => /^##\s+.*shot list/i.test(l));
  if (start < 0) return { problems: ['No "Shot list" section found.'] };
  let end = lines.length;
  for (let i = start + 1; i < lines.length; i++) {
    if (/^##\s/.test(lines[i])) {
      end = i;
      break;
    }
  }
  const sections: string[] = [];
  const shots: ListShot[] = [];
  let inStyle = false;
  let style = '';
  for (let i = start + 1; i < end; i++) {
    const line = lines[i];
    const h = SECTION_RE.exec(line);
    if (h) {
      inStyle = /style lock/i.test(h[1]);
      if (!inStyle && !/shot types?/i.test(h[1])) sections.push(h[1].replace(/\s*\(.*\)\s*$/, ''));
      continue;
    }
    if (inStyle) {
      const m = /^>\s?(.*)$/.exec(line);
      if (m) style = `${style} ${m[1].replace(/\*\*/g, '')}`.trim();
      continue;
    }
    const row = ROW_RE.exec(line);
    if (!row) continue;
    const rest = row[3];
    const bar = rest.indexOf('|');
    const parts = bar < 0 ? null : [rest.slice(0, bar).trim(), rest.slice(bar + 1).trim()];
    if (!parts) {
      problems.push(`Shot ${row[1]} has no visual.`);
    } else if (!sections.length) {
      problems.push(`Shot ${row[1]} comes before any section heading.`);
    } else {
      shots.push({
        n: Number(row[1]),
        type: row[2] as ListShot['type'],
        cue: parts[0].replace(/^\*\*|\*\*$/g, ''),
        visual: parts[1].replace(/\*\*/g, ''),
        section: sections.length - 1,
      });
    }
  }
  if (!style) problems.push('No style lock found: the block quote under "Style lock".');
  if (!shots.length) problems.push('No shots found.');
  shots.forEach((s, i) => {
    if (s.n !== i + 1) problems.push(`Shot numbers jump: expected ${i + 1}, found ${s.n}.`);
  });
  if (problems.length) return { problems };
  return { list: { style, sections, shots }, problems };
}

/** The image prompt for a shot: the locked style, then the visual. */
export function shotPrompt(style: string, shot: Pick<ListShot, 'type' | 'visual'>): string {
  const visual = shot.visual.replace(/^\*\*[^*]+\*\*\s*/, '').replace(/\.$/, '');
  if (shot.type !== 'V') return `${style} ${visual}.`;
  return `${style} ${CAMERA_RE.test(visual) ? '' : 'Static camera, one slow movement. '}${visual}.`;
}

/** Each chapter's visuals from the shot list, placed on its narration words. */
export function planFromShotList(
  list: ShotList,
  chapters: { index: number; title: string; narration: string }[],
  opts: { overrides?: ShotOverrides; nextTitle?: string } = {},
): { chapters: ListVisual[][]; problems: string[] } {
  const problems: string[] = [];
  let stillCount = 0;
  if (list.sections.length !== chapters.length) {
    problems.push(`The shot list has ${list.sections.length} sections; the script has ${chapters.length} chapters.`);
    return { chapters: chapters.map(() => []), problems };
  }
  const out = chapters.map((ch, ci) => {
    const shots = list.shots.filter((s) => s.section === ci);
    if (!shots.length) problems.push(`Section "${list.sections[ci]}" has no shots.`);
    const words = ch.narration.split(/\s+/).filter(Boolean);
    let seq: ListShot[] = shots;
    if (ci > 0 && shots.length > 0 && !CHAPTER_OPEN.test(shots[0].cue)) {
      seq = [
        { n: 0, type: 'C', cue: 'Chapter open', visual: `Card: "${ch.title.toUpperCase()}"`, section: ci },
        ...shots,
      ];
    }
    const starts = placeShots(seq, ch.narration, opts.overrides);
    const normWords = wordsOf(ch.narration);
    seq.forEach((s, i) => {
      if (s.type !== 'C' || i + 1 >= seq.length) return;
      let end: number | null = null;
      let hold = CARD_HOLD.number;
      if (CHAPTER_OPEN.test(s.cue)) {
        hold = CARD_HOLD.title;
        const after = words.slice(starts[i]);
        const k = after.findIndex((w) => /[.?!]["”']?$/.test(w));
        const len = k >= 0 ? k + 1 : after.length;
        end = starts[i] + Math.min(TITLE_SPAN.max, Math.max(TITLE_SPAN.min, len));
      } else if (/[%$→]/.test(s.cue)) {
        const pos = Math.max(-1, ...numberPhrases(s.cue).map((p) => find(normWords, p, starts[i])));
        if (pos >= 0) end = pos + CARD_TAIL;
      }
      if (end !== null && end < starts[i + 1]) {
        starts[i + 1] = Math.max(end, starts[i] + TITLE_SPAN.min, starts[i + 1] - hold);
      }
    });
    for (let i = 1; i < starts.length; i++) starts[i] = Math.max(starts[i], starts[i - 1]);
    return seq.map((s, i): ListVisual => {
      const from = starts[i];
      const to = i + 1 < seq.length ? starts[i + 1] : words.length;
      const base = {
        key: `${ch.index}_v${i + 1}`,
        text: words.slice(from, to).join(' '),
        words: Math.max(0, to - from),
        shot: s.n,
        cue: s.cue,
      };
      if (s.type === 'V') return { ...base, kind: 'clip', prompt: shotPrompt(list.style, s) };
      if (s.type !== 'C') {
        return {
          ...base,
          kind: 'still',
          prompt: shotPrompt(list.style, s),
          kenBurns: KEN_BURNS[stillCount++ % KEN_BURNS.length],
        };
      }
      const drawn = cardFromShot(s, opts.nextTitle);
      const fix = opts.overrides?.cards?.[s.n];
      const card = (fix ? { ...drawn, ...fix } : drawn) as Card;
      const beatFix = (opts.overrides ?? {}).beats?.[s.n];
      let phrases: string[] | null = null;
      if (beatFix) phrases = ['', ...beatFix];
      else if (card.kind === 'bars') phrases = card.unit === '%' ? card.values.map(numberWords) : null;
      else if (card.kind === 'split') phrases = card.pairs.map((p) => numberWords(Number(p.from)));
      else if (card.kind === 'flip') phrases = [card.from, card.to].map((x) => numberWords(Number(x.replace(/\D/g, ''))));
      let beats: number[] | null = null;
      if (phrases && phrases.length >= 2) {
        beats = [0];
        let at = from;
        for (let k = 1; k < phrases.length; k++) {
          const pos = find(normWords, phrases[k], at);
          if (pos < 0 || pos >= to) {
            beats = null;
            break;
          }
          beats.push(pos - from);
          at = pos;
        }
      }
      return { ...base, kind: 'card', prompt: '', card, ...(beats ? { beats } : {}) };
    });
  });
  return { chapters: out, problems };
}

export function shotCounts(shots: { type?: string; kind?: string }[]): { clips: number; stills: number; cards: number } {
  const typeOf = (s: { type?: string; kind?: string }) =>
    s.type ?? (s.kind === 'clip' ? 'V' : s.kind === 'still' ? 'S' : 'C');
  return {
    clips: shots.filter((s) => typeOf(s) === 'V').length,
    stills: shots.filter((s) => typeOf(s) === 'S').length,
    cards: shots.filter((s) => typeOf(s) === 'C').length,
  };
}

/** Hard blocks (mascot in a shot, missing style lock) and pacing warnings. */
export function shotRules(list: ShotList, chapters: ListVisual[][]): { blocks: string[]; warnings: string[] } {
  const blocks: string[] = [];
  const flat = chapters.flat();
  for (const v of flat) {
    if (v.kind === 'card') continue;
    const visual = list.shots.find((s) => s.n === v.shot)?.visual ?? '';
    if (MASCOT_RE.test(visual)) blocks.push(`Shot ${v.shot} shows the mascot; Hoot is only ever the overlay.`);
    if (!v.prompt.startsWith(list.style)) blocks.push(`Shot ${v.shot} is missing the locked style prefix.`);
  }
  const warnings: string[] = [];
  let pairs = 0;
  for (let i = 1; i < flat.length; i++) {
    if (flat[i].kind !== flat[i - 1].kind) continue;
    pairs++;
    if (pairs <= 3) warnings.push(`Shots ${flat[i - 1].shot} and ${flat[i].shot} are both ${flat[i].kind}s back to back.`);
  }
  if (pairs > 3) warnings.push(`…and ${pairs - 3} more back-to-back pairs of the same kind.`);
  const long = flat.filter((v) => v.words / WORDS_PER_SECOND > LONGEST_SHOT_SECONDS);
  if (long.length) {
    warnings.push(
      `Shot${long.length > 1 ? 's' : ''} ${long.map((v) => v.shot).join(', ')} stay on screen over ${LONGEST_SHOT_SECONDS} s.`,
    );
  }
  return { blocks, warnings };
}
