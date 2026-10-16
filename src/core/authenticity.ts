/**
 * Authenticity gate (CR-46 / CR-80 hooks, cold opens, originality, the
 * pre-publish gate). Rebuilt from 6.1.13.
 */
import { sentences } from './bankV2';
import { DEFAULT_CHANNEL_CONFIG } from './channelConfig';
import { fnv1a } from './researchLayer2';
import type { LongScript, ScriptBody, ShortScript } from './types';

export const FIRST_SENTENCE_MAX_WORDS = 12;
export const HOOK_TEXT_MIN_WORDS = 3;
export const HOOK_TEXT_MAX_WORDS = 6;
export const BANNED_OPENERS = ['In this video', 'Hey guys', 'Welcome back', 'Today we', "Let's talk about", 'Did you know'];
export const NAMED_TERMS: string[] = [
  ...DEFAULT_CHANNEL_CONFIG.titles.conceptTerms,
  'silent treatment',
  'guilt trip',
  'guilt tripping',
  'future faking',
  'darvo',
  'decoy effect',
  'peak-end rule',
  'endowment effect',
  'ikea effect',
  'liking gap',
  'duchenne smile',
  'fundamental attribution error',
  'mere exposure effect',
  'spotlight effect',
  'halo effect',
  'bystander effect',
  'scarcity principle',
  'foot in the door',
  'door in the face',
  'love bomb',
  'gaslight',
  'gaslighter',
  'gaslighters',
];
const YOU_RE = /\b(you|your|you're|youre|yours|yourself|yourselves|you've|you'll|you'd)\b/i;
export const NUMBER_WORDS = [
  'zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve',
  'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen', 'twenty', 'thirty', 'forty',
  'fifty', 'sixty', 'seventy', 'eighty', 'ninety', 'hundred', 'thousand', 'million', 'billion', 'first', 'second',
  'third', 'fourth', 'fifth', 'sixth', 'seventh', 'eighth', 'ninth', 'tenth', 'half', 'percent', 'dollar',
  'dollars', 'number',
];
export const EFFECT_WORDS = /\b(effect|rule|bias|tactic|trick|word|lie|myth)\b/i;
export const SHORT_MIN_WORDS = 50;
export const SHORT_MAX_WORDS = 130;
export const COLD_OPEN_WORDS = 72;
export const COLD_OPEN_BANNED = [
  'welcome', 'in this video', "i'm professor hoot", 'i am professor hoot', 'my name is', 'the mind files', 'mind files', 'subscribe',
];
export const SIMILARITY_WARN = 0.25;
export const SIMILARITY_BLOCK = 0.35;
export const SIMILARITY_WINDOW = 20;
export const SCENE_FIRST_MAX_SECONDS = 32;
export const SHORT_TARGET = { min: 20, max: 50, warnBelow: 15, blockAbove: 60 };
export const LONG_TARGET = { minMinutes: 8, maxMinutes: 12, warnBelowMinutes: 8 };

const straighten = (s: string) => s.replace(/[‘’]/g, "'");

export function contentWords(text: string): string[] {
  return straighten(text).match(/[A-Za-z0-9$%']+/g) ?? [];
}

function padded(text: string): string {
  const flat = straighten(text.toLowerCase()).replace(/[^a-z0-9' -]+/g, ' ').replace(/\s+/g, ' ');
  return ` ${flat} `;
}

function termIn(hay: string) {
  return (term: string) => {
    const t = term.toLowerCase().replace(/[^a-z0-9' -]+/g, ' ').trim();
    return t.length > 2 && (hay.includes(` ${t} `) || hay.includes(` ${t.replace(/-/g, ' ')} `));
  };
}

/** What the first sentence leans on: the viewer, a number, or a named effect. */
export function hookAnchor(sentence: string): 'you' | 'number' | 'named' | null {
  const s = sentence.trim().replace(/^["“'‘]+/, '');
  if (YOU_RE.test(s) || /^ever\b/i.test(s)) return 'you';
  if (/\d/.test(s)) return 'number';
  if (contentWords(s).some((w) => NUMBER_WORDS.includes(w.toLowerCase()))) return 'number';
  if (EFFECT_WORDS.test(straighten(s))) return 'named';
  if (NAMED_TERMS.find(termIn(padded(s)))) return 'named';
  return null;
}

/** The hook: the first sentence, or a short question plus its answer. */
export function hookUnit(sents: string[]): string[] {
  const first = sents[0] ?? '';
  if (
    sents.length > 1 &&
    /[?!]["”’']?$/.test(first) &&
    (contentWords(first).length <= 3 || !hookAnchor(first)) &&
    contentWords(`${first} ${sents[1]}`).length <= FIRST_SENTENCE_MAX_WORDS
  ) {
    return sents.slice(0, 2);
  }
  return sents.slice(0, 1);
}

export function namesTerm(text: string, terms: string[] = NAMED_TERMS): string | undefined {
  return terms.find(termIn(padded(text)));
}

export function hookProblems(narration: string, hookText?: string | null, opts: { sceneFirst?: boolean } = {}): string[] {
  const unit = hookUnit(sentences(narration)).join(' ');
  const n = contentWords(unit).length;
  const out: string[] = [];
  if (n > FIRST_SENTENCE_MAX_WORDS) {
    out.push(`The first sentence is ${n} words ("${unit}"); CR-80 allows ${FIRST_SENTENCE_MAX_WORDS}.`);
  }
  if (!opts.sceneFirst && !hookAnchor(unit)) {
    out.push(`The first sentence ("${unit}") has no "you"/"your", no number and no named tactic or effect.`);
  }
  const opening = straighten(narration.trim().replace(/^["“'‘.…\s]+/, '').toLowerCase());
  const banned = BANNED_OPENERS.find((o) => opening.startsWith(o.toLowerCase()));
  if (banned) out.push(`The narration opens with "${banned}", which CR-46 bans.`);
  const count = (hookText ?? '').trim().split(/\s+/).filter(Boolean).length;
  if (!hookText?.trim()) {
    out.push('There is no hook text for frame 0.');
  } else {
    const min = opts.sceneFirst ? 2 : HOOK_TEXT_MIN_WORDS;
    if (count < min || count > HOOK_TEXT_MAX_WORDS) {
      out.push(
        `The hook text "${hookText.trim()}" is ${count} word${count === 1 ? '' : 's'}; CR-46 needs ${min} to ${HOOK_TEXT_MAX_WORDS}.`,
      );
    }
  }
  return out;
}

export function coldOpenProblems(text: string, whole = false): string[] {
  const out: string[] = [];
  const opening = straighten(text.trim().replace(/^["“'‘.…\s]+/, '').toLowerCase());
  const banned = BANNED_OPENERS.find((o) => opening.startsWith(o.toLowerCase()));
  if (banned) out.push(`The cold open starts with "${banned}".`);
  const words = contentWords(text);
  const head = ` ${(whole ? words : words.slice(0, COLD_OPEN_WORDS)).join(' ').toLowerCase()} `;
  for (const phrase of COLD_OPEN_BANNED) {
    if (head.includes(` ${phrase} `)) {
      out.push(`The first ${whole ? 60 : 30} seconds say "${phrase}"; go straight to the promise.`);
    }
  }
  return out;
}

export function trigrams(text: string): Set<string> {
  const words = straighten(text.toLowerCase())
    .replace(/[^\p{L}\p{N}'\s]+/gu, ' ')
    .split(/\s+/)
    .filter(Boolean);
  const out = new Set<string>();
  for (let i = 0; i + 2 < words.length; i++) out.add(`${words[i]} ${words[i + 1]} ${words[i + 2]}`);
  return out;
}

export function jaccard(a: Set<string>, b: Set<string>): number {
  if (!a.size || !b.size) return 0;
  let both = 0;
  for (const x of a) if (b.has(x)) both++;
  return both / (a.size + b.size - both);
}

export interface Similarity {
  score: number;
  closest?: { id: string; title: string };
  compared: number;
}

export function similarityTo(
  narration: string,
  previous: { id: string; title: string; narration: string }[],
): Similarity {
  const mine = trigrams(narration);
  let best: Similarity = { score: 0, compared: 0 };
  const window = previous.slice(0, SIMILARITY_WINDOW);
  for (const p of window) {
    const score = jaccard(mine, trigrams(p.narration));
    if (score > best.score) best = { score, closest: { id: p.id, title: p.title }, compared: 0 };
  }
  return { ...best, compared: window.length };
}

export function formatDuration(seconds: number): string {
  if (seconds < 120) return `${seconds.toFixed(1)} s`;
  const m = Math.floor(seconds / 60);
  return `${m}:${String(Math.round(seconds - m * 60)).padStart(2, '0')}`;
}

/** Hash of everything a reviewer signed off on; any edit invalidates the review. */
export function scriptHash(script: ScriptBody): string {
  if (script.mode !== 'short') {
    const s = script as LongScript;
    return fnv1a(
      JSON.stringify([
        s.title,
        s.coldOpen,
        s.closingSynthesis,
        s.chapters.map((c) => [c.title, c.narration, c.heroA, c.heroB, c.stillPrompt]),
      ]),
    );
  }
  const s = script as ShortScript;
  return fnv1a(
    JSON.stringify([
      s.title,
      s.hookText,
      s.hookCard,
      s.beats.map((b) => [b.text, b.cardText, (b.shots ?? []).map((x) => [x.source, x.clipPrompt])]),
    ]),
  );
}

export function narrationText(script: ScriptBody): string {
  if (script.mode !== 'short') {
    const s = script as LongScript;
    return [s.coldOpen, ...s.chapters.map((c) => c.narration), s.closingSynthesis].filter(Boolean).join(' ');
  }
  return script.beats.map((b) => b.text).join(' ');
}

/** The words on frame 0. */
export function frameZeroText(script: ShortScript): string | undefined {
  const v2 = (script as ShortScript & { bankV2?: { hookText?: string } }).bankV2;
  return v2?.hookText ?? script.hookCard ?? script.hookText;
}
