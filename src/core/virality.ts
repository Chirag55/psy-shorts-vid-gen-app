import type { WordTiming } from './types';
import { buildCaptionFrames } from './captions';
import { coldOpenProblems } from './authenticity';
import { WORDS_PER_SECOND } from './guardrails';
import { ACCENT_RED, HOOT_THUMB, TEXT_BAND, THUMB_V2, textColour, thumbnailVariants } from './thumbnailLayout';

type Range = [number, number];
type Band = { pass: Range; warn: Range };

/** The virality playbook's targets for each check. */
export const VIRALITY = {
  short: {
    hookSeconds: 2,
    hookWords: 10,
    onscreenWords: 6,
    seconds: { pass: [20, 40], warn: [15, 50] } as Band,
    wpm: { pass: [160, 190], warn: [144, 209] } as Band,
    deadAirSeconds: 0.4,
    avgShotSeconds: 2.5,
    maxShotSeconds: 4,
    captionCoverage: 0.95,
    midBeat: [0.4, 0.6] as Range,
  },
  long: {
    coldOpenSeconds: 15,
    minutes: { pass: [10, 14], warn: [8, 16] } as Band,
    interruptSeconds: { pass: 90, warn: 120 },
    wpm: { pass: [140, 170], warn: [126, 187] } as Band,
    deadAirSeconds: 0.8,
    visualSeconds: { pass: 5.5, warn: 8 },
    titleMax: 60,
    thumbnailWords: 4,
    minFontPx: 10,
    contrast: 4.5,
    hootShare: 0.25,
    chapters: 4,
  },
  gate: { warn: 75, confirm: 60 },
};

export type CheckStatus = 'pass' | 'warn' | 'fail';
export type Gate = 'ok' | 'warn' | 'confirm';

export interface ViralityCheck {
  id: string;
  label: string;
  weight: number;
  status: CheckStatus;
  detail: string;
  fix?: string;
}

export interface ViralityReport {
  mode: 'short' | 'long';
  score: number;
  checks: ViralityCheck[];
  topFixes: string[];
  gate: Gate;
}

/** The proven Short hook shapes. */
export const HOOK_SHELLS = [
  {
    id: 'doing-tactic',
    label: 'If someone does X, they’re doing a tactic to you',
    test: /^if (someone|they|he|she)\b.*\b(they['’]?re|that['’]?s|it['’]?s)\b/i,
  },
  { id: 'brain-does', label: 'Your brain does X every time you…', test: /^your brain\b/i },
  { id: 'people-who', label: 'People who X aren’t Y. They’re Z', test: /^people who\b/i },
  {
    id: 'number-signs',
    label: '[Number] signs someone is…',
    test: /^(\d+|one|two|three|four|five|six|seven|eight|nine|ten)\b.*\b(signs?|ways?|lines?|rules?|secrets?|tricks?)\b/i,
  },
  { id: 'stop-habit', label: 'Stop X. Here’s what it tells people', test: /^stop\b/i },
];

const BANNED_OPENERS = [
  /^did you know\b/i,
  /^have you ever wondered\b/i,
  /^in psychology\b/i,
  /^(psychologists?|researchers?) (call|define|say)\b/i,
];
const DEFINITION_FIRST =
  /^(?:the\s+|a\s+|an\s+)?[\w'’-]+(?:\s+[\w'’-]+){0,3}\s+(?:is|are|means|refers to)\s+(?:a|an|the|when|defined)\b/i;
const SIGN_OFF =
  /\b(subscribe|follow|like (and|this)|comment below|hit the|stay curious|that['’]?s the mind for you|see you|thanks for watching)\b/i;
const TWIST =
  /\b(but here['’]?s|here['’]?s the (wild|strange|weird|part|catch|twist|cruel)|then it got|the catch|but the (catch|twist)|what nobody|here['’]?s why|and then|plot twist|it gets (worse|stranger))\b/i;
const TITLE_SHELLS = [
  { id: 'The Psychology of People Who…', test: /^the psychology of (people|those) who\b/i },
  { id: 'Why … (Psychology Explains)', test: /^why\b.*\(psychology explains\)\s*$/i },
  { id: 'The Dark Side of …', test: /^the dark side of\b/i },
];
const STATUS_SCORE: Record<CheckStatus, number> = { pass: 1, warn: 0.5, fail: 0 };
const SENTENCE_END = /[.?!]["”')]*$/;

const wordCount = (text: string) => text.trim().split(/\s+/).filter(Boolean).length;
const mmss = (seconds: number) => `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`;
const fixed = (n: number, digits = 1) => n.toFixed(digits);
const spokenSeconds = (words: WordTiming[]) =>
  words.length ? Math.max(0.1, words[words.length - 1].end - words[0].start) : 0;
const flat = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9\s']/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
const band = (v: number, b: Band): CheckStatus =>
  v >= b.pass[0] && v <= b.pass[1] ? 'pass' : v >= b.warn[0] && v <= b.warn[1] ? 'warn' : 'fail';

export function publishGate(score: number): Gate {
  return score < VIRALITY.gate.confirm ? 'confirm' : score < VIRALITY.gate.warn ? 'warn' : 'ok';
}

export function firstSentence(text: string): { text: string; words: number } {
  const toks = text.trim().split(/\s+/).filter(Boolean);
  const end = toks.findIndex((t) => SENTENCE_END.test(t));
  const words = end < 0 ? toks : toks.slice(0, end + 1);
  return { text: words.join(' '), words: words.length };
}

/** When the first spoken sentence ends. */
export function hookEnd(words: WordTiming[]): { seconds: number; wordCount: number } | null {
  if (!words.length) return null;
  let end = words.findIndex((w) => SENTENCE_END.test(w.word));
  if (end < 0) end = words.length - 1;
  return { seconds: words[end].end - words[0].start, wordCount: end + 1 };
}

/** Gaps between spoken words, longest first. */
export function pauses(words: WordTiming[]): { start: number; end: number; seconds: number }[] {
  const out: { start: number; end: number; seconds: number }[] = [];
  for (let i = 1; i < words.length; i++) {
    const gap = words[i].start - words[i - 1].end;
    if (gap > 0) out.push({ start: words[i - 1].end, end: words[i].start, seconds: gap });
  }
  return out.sort((a, b) => b.seconds - a.seconds);
}

export function wordsPerMinute(words: WordTiming[]): number {
  return words.length ? (words.length / spokenSeconds(words)) * 60 : 0;
}

export function hookShell(text: string): string | null {
  return HOOK_SHELLS.find((s) => s.test.test(text.trim()))?.id ?? null;
}

/** Silences from an FFmpeg silencedetect log. */
export function silencesFromLog(lines: string[]): { start: number; end: number }[] {
  const out: { start: number; end: number }[] = [];
  let start: number | null = null;
  for (const line of lines) {
    const s = /silence_start:\s*(-?[\d.]+)/.exec(line);
    if (s) start = Math.max(0, Number(s[1]));
    const e = /silence_end:\s*([\d.]+)/.exec(line);
    if (e && start !== null) {
      out.push({ start, end: Number(e[1]) });
      start = null;
    }
  }
  return out;
}

/** Where the twist line lands, as a share of the runtime. */
export function midBeatPosition(
  narration: string,
  words: WordTiming[],
  seconds: number,
  beats: string[],
): number | null {
  const toks = narration.split(/\s+/).filter(Boolean);
  const joined = flat(toks.join(' '));
  let index = -1;
  for (const beat of beats) {
    const key = flat(beat).split(' ').slice(0, 6).join(' ');
    const at = joined.indexOf(key);
    if (!flat(beat) || !(at >= 0)) continue;
    index = joined.slice(0, at).split(' ').filter(Boolean).length;
    break;
  }
  if (index < 0) {
    const m = TWIST.exec(toks.join(' '));
    if (m) index = toks.join(' ').slice(0, m.index).split(/\s+/).filter(Boolean).length;
  }
  if (index < 0) return null;
  if (!words.length) {
    return seconds > 0 ? index / WORDS_PER_SECOND / seconds : index / Math.max(1, toks.length);
  }
  const w = words[Math.min(index, words.length - 1)];
  const span = words[words.length - 1].end - words[0].start;
  return span > 0 ? (w.start - words[0].start) / span : null;
}

export function titleShell(title: string): string | null {
  return TITLE_SHELLS.find((s) => s.test.test(title.trim()))?.id ?? null;
}

/** WCAG contrast ratio between two hex colours. */
export function contrastRatio(a: string, b: string): number {
  const lum = (hex: string) => {
    const h = hex.replace('#', '');
    const [r, g, bl] = [0, 2, 4]
      .map((i) => parseInt(h.slice(i, i + 2), 16) / 255)
      .map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
    return 0.2126 * r + 0.7152 * g + 0.0722 * bl;
  };
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

export interface InterruptChapter {
  narration: string;
  words: WordTiming[];
  seconds: number;
}

/** When the long-form's questions and reveals land, in seconds. */
export function detectInterrupts(chapters: InterruptChapter[], cues: string[] = []): number[] {
  const out: number[] = [];
  let offset = 0;
  for (const ch of chapters) {
    const toks = ch.narration.split(/\s+/).filter(Boolean);
    const starts = [0];
    toks.forEach((t, i) => {
      if (SENTENCE_END.test(t) && i + 1 < toks.length) starts.push(i + 1);
    });
    starts.forEach((s, k) => {
      const end = starts[k + 1] ?? toks.length;
      const sentence = toks.slice(s, end).join(' ');
      const cued = cues.some((c) => flat(c) && flat(sentence).includes(flat(c).split(' ').slice(0, 6).join(' ')));
      const turn =
        /\?$/.test(sentence) ||
        /\b(here['’]?s (the|what|why)|most people|almost nobody|the (honest|cruel|strange) part|but here['’]?s|and then)\b/i.test(
          sentence,
        );
      if (cued || (!cues.length && turn) || (cues.length && turn && /\?$/.test(sentence))) {
        const w = ch.words[Math.min(s, ch.words.length - 1)];
        out.push(offset + (w ? w.start : (s / Math.max(1, toks.length)) * ch.seconds));
      }
    });
    offset += ch.seconds;
  }
  return out;
}

function finish(mode: 'short' | 'long', checks: ViralityCheck[]): ViralityReport {
  const total = checks.reduce((n, c) => n + c.weight, 0);
  const got = checks.reduce((n, c) => n + c.weight * STATUS_SCORE[c.status], 0);
  const score = total ? Math.round((got / total) * 100) : 0;
  const topFixes = checks
    .filter((c) => c.status !== 'pass' && c.fix)
    .sort((a, b) => b.weight * (1 - STATUS_SCORE[b.status]) - a.weight * (1 - STATUS_SCORE[a.status]))
    .slice(0, 3)
    .map((c) => c.fix as string);
  return { mode, score, checks, topFixes, gate: publishGate(score) };
}

function check(
  out: ViralityCheck[],
  id: string,
  label: string,
  weight: number,
  status: CheckStatus,
  detail: string,
  fix?: string,
) {
  out.push({ id, label, weight, status, detail, ...(status !== 'pass' && fix ? { fix } : {}) });
}

export interface ShortAuditInput {
  narration: string;
  words: WordTiming[];
  durationSeconds: number;
  hookOnscreen?: string | null;
  hookCardSeconds?: number | null;
  silences?: { start: number; end: number }[] | null;
  shotSeconds?: number[] | null;
  captionsOn?: boolean;
  catchphraseOn?: boolean;
  mascotOn?: boolean;
  mascotDelaySeconds?: number;
  bank?: { beats?: string[]; loop_line?: string } | null;
}

export function auditShort(s: ShortAuditInput): ViralityReport {
  const T = VIRALITY.short;
  const words = s.words;
  const timed = words.length > 0;
  const first = firstSentence(s.narration);
  const hook = hookEnd(words);
  const checks: ViralityCheck[] = [];

  if (!hook) {
    check(checks, 'S1', 'Hook timing', 2, 'fail', 'No voice timing yet, so the hook can’t be timed.', 'Voice the Short, then audit it.');
  } else {
    check(
      checks,
      'S1',
      'Hook timing',
      2,
      hook.seconds <= T.hookSeconds ? 'pass' : 'fail',
      `The first sentence ends at ${fixed(hook.seconds)} s (limit ${fixed(T.hookSeconds)} s).`,
      `Hook ends at ${fixed(hook.seconds)} s — cut it to end by ${fixed(T.hookSeconds)} s: "${first.text
        .split(/\s+/)
        .slice(0, T.hookWords)
        .join(' ')}".`,
    );
  }

  check(
    checks,
    'S2',
    'Hook length',
    2,
    first.words <= T.hookWords ? 'pass' : 'fail',
    `${first.words} words in the first sentence (limit ${T.hookWords}).`,
    `The hook is ${first.words} words — cut it to ${T.hookWords} or fewer.`,
  );

  const opener = BANNED_OPENERS.find((re) => re.test(first.text))
    ? 'a banned opener'
    : DEFINITION_FIRST.test(first.text)
      ? 'a definition first'
      : '';
  check(
    checks,
    'S3',
    'No banned opener',
    2,
    opener ? 'fail' : 'pass',
    opener ? `It opens with ${opener}: "${first.text.slice(0, 50)}".` : 'It opens on the viewer or a situation.',
    'Open on the viewer or a concrete situation, not "Did you know…", "In psychology…" or a definition.',
  );

  const onscreen = s.hookOnscreen?.trim() ?? '';
  const onscreenCount = wordCount(onscreen);
  const cardSeconds = s.hookCardSeconds ?? 0;
  check(
    checks,
    'S4',
    'On-screen hook',
    2,
    onscreen && cardSeconds > 0 && onscreenCount <= T.onscreenWords ? 'pass' : 'fail',
    !onscreen
      ? 'No text on frame 0.'
      : onscreenCount > T.onscreenWords
        ? `${onscreenCount} words on screen (limit ${T.onscreenWords}).`
        : cardSeconds <= 0
          ? 'The hook card is switched off.'
          : `"${onscreen}" on frame 0.`,
    !onscreen
      ? 'Give the Short on-screen hook text of 6 words or fewer.'
      : onscreenCount > T.onscreenWords
        ? `Cut the on-screen hook to ${T.onscreenWords} words.`
        : 'Switch the hook card on.',
  );

  const d = s.durationSeconds;
  check(
    checks,
    'S5',
    'Duration',
    1,
    d > 0 ? band(d, T.seconds) : 'fail',
    d > 0 ? `${fixed(d)} s (${T.seconds.pass[0]}–${T.seconds.pass[1]} s is the target).` : 'No runtime yet.',
    d > T.seconds.pass[1]
      ? `${fixed(d)} s is long — cut about ${Math.round(d - T.seconds.pass[1])} s.`
      : `${fixed(d)} s is short — add a beat.`,
  );

  const wpm = timed ? wordsPerMinute(words) : 0;
  check(
    checks,
    'S6',
    'Pace',
    1,
    timed ? band(wpm, T.wpm) : 'fail',
    timed ? `${Math.round(wpm)} words a minute (${T.wpm.pass[0]}–${T.wpm.pass[1]}).` : 'No voice timing yet.',
    wpm < T.wpm.pass[0]
      ? `${Math.round(wpm)} WPM is slow: speed the voice up or tighten the script.`
      : `${Math.round(wpm)} WPM is fast: slow the voice or cut words.`,
  );

  const hookEndsAt = hook ? hook.seconds + words[0].start : 0;
  const silences = s.silences ?? pauses(words).map((p) => ({ start: p.start, end: p.end }));
  const worst = silences
    .filter((p) => p.start >= hookEndsAt - 0.05 && (!words.length || p.end <= words[words.length - 1].end + 0.05))
    .map((p) => ({ ...p, seconds: p.end - p.start }))
    .sort((a, b) => b.seconds - a.seconds)
    .find((p) => p.seconds > T.deadAirSeconds);
  const at = (p: { start: number }) => mmss(p.start - (words[0]?.start ?? 0));
  check(
    checks,
    'S7',
    'No dead air',
    1,
    timed ? (worst ? 'fail' : 'pass') : 'fail',
    timed
      ? worst
        ? `A ${fixed(worst.seconds, 2)} s silence at ${at(worst)} (limit ${T.deadAirSeconds} s).`
        : 'No silence over 0.4 s after the hook.'
      : 'No voice timing yet.',
    worst ? `Cut the ${fixed(worst.seconds, 1)} s silence at ${at(worst)}: pauses make viewers swipe.` : 'Voice the Short first.',
  );

  const planned = s.shotSeconds ?? [];
  const plannedTotal = planned.reduce((a, b) => a + b, 0);
  const scale = plannedTotal > 0 && d > 0 ? d / plannedTotal : 1;
  const shots = planned.map((x) => x * scale);
  const avgShot = shots.length ? d / shots.length : 0;
  const longestShot = shots.length ? Math.max(...shots) : 0;
  check(
    checks,
    'S8',
    'Cut cadence',
    1,
    shots.length && avgShot <= T.avgShotSeconds && longestShot <= T.maxShotSeconds ? 'pass' : 'fail',
    shots.length
      ? `${shots.length} shots, ${fixed(avgShot)} s on average, the longest ${fixed(longestShot)} s (limits ${T.avgShotSeconds} and ${T.maxShotSeconds} s).`
      : 'No shot plan.',
    `Cut more often: ${shots.length} shots over ${fixed(d, 0)} s, the longest ${fixed(longestShot)} s. Aim for a new picture every ${T.avgShotSeconds} s.`,
  );

  const frames =
    s.captionsOn && timed ? buildCaptionFrames(words, { singleWord: true, phraseSize: 4, highlightActiveWord: false }) : [];
  const captioned = frames.reduce((n, f) => n + f.tokens.length, 0);
  const coverage = timed ? Math.min(1, captioned / words.length) : 0;
  check(
    checks,
    'S9',
    'Word-by-word captions',
    1,
    s.captionsOn && coverage >= T.captionCoverage ? 'pass' : 'fail',
    !s.captionsOn
      ? 'Captions are off.'
      : timed
        ? `${Math.round(coverage * 100)}% of the speech is captioned.`
        : 'No voice timing to caption.',
    s.captionsOn ? 'Voice the Short so captions can follow it.' : 'Switch captions on in Assembly.',
  );

  const pos = midBeatPosition(s.narration, words, d, s.bank?.beats ?? []);
  const inBand = pos !== null && pos >= T.midBeat[0] && pos <= T.midBeat[1];
  check(
    checks,
    'S10',
    'Mid-Short twist',
    1,
    pos === null ? 'fail' : inBand ? 'pass' : 'warn',
    pos === null
      ? 'No twist or escalation line found.'
      : `The twist lands at ${Math.round(pos * 100)}% of the runtime (target ${T.midBeat[0] * 100}–${T.midBeat[1] * 100}%).`,
    pos === null
      ? 'Add a "But here\'s the part nobody tells you…" line at about half way.'
      : 'Move the twist line toward the middle of the Short.',
  );

  const sentences = s.narration.trim().split(/(?<=[.?!]["”')]*)\s+/).filter(Boolean);
  const lastLine = sentences[sentences.length - 1] ?? '';
  const signOff = SIGN_OFF.test(lastLine);
  const loop = s.bank?.loop_line?.trim();
  if (s.catchphraseOn) {
    check(
      checks,
      'S11',
      'Loops cleanly',
      1,
      'pass',
      'The catchphrase is on for this Short (variant: catchphrase); it is tagged for the test.',
    );
  } else {
    check(
      checks,
      'S11',
      'Loops cleanly',
      1,
      !signOff && loop ? 'pass' : 'fail',
      signOff
        ? `The last line is a sign-off or call to action: "${lastLine.slice(0, 50)}".`
        : loop
          ? 'No CTA or sign-off, and a loop_line is written.'
          : 'The bank entry has no loop_line, so the loop isn’t confirmed.',
      signOff
        ? 'End on a line that reads straight into the hook: no sign-off, no subscribe.'
        : 'Add a loop_line that flows into the hook.',
    );
  }

  const delayed = Boolean(s.mascotDelaySeconds && s.mascotDelaySeconds > 0);
  check(
    checks,
    'S12',
    'Hoot from frame 0',
    1,
    s.mascotOn && !delayed ? 'pass' : 'fail',
    !s.mascotOn
      ? 'Hoot is switched off.'
      : s.mascotDelaySeconds
        ? `Hoot is held back for ${fixed(s.mascotDelaySeconds)} s.`
        : 'Hoot is in his corner from the first frame.',
    s.mascotOn ? 'Turn off the delayed entry so Hoot is there from frame 0.' : 'Switch Hoot on in Assembly.',
  );

  return finish('short', checks);
}

export interface LongAuditChapter extends InterruptChapter {
  /** Word timings of the voice alone, when the chapter audio carries extra pauses. */
  voiceWords?: WordTiming[];
  pauseSeconds?: number;
}

export interface LongAuditInput {
  title: string;
  chapters: LongAuditChapter[];
  interrupts?: string[];
  visualSeconds: number[];
  thumbnail: { texts?: string[]; concepts?: string[]; text?: string };
  marks: { at: number }[];
  feederShorts: number;
}

export function auditLong(L: LongAuditInput): ViralityReport {
  const T = VIRALITY.long;
  const checks: ViralityCheck[] = [];
  const add = (id: string, label: string, weight: number, status: CheckStatus, detail: string, fix?: string) =>
    check(checks, id, label, weight, status, detail, fix);
  const total = L.chapters.reduce((n, c) => n + c.seconds, 0);

  const words: WordTiming[] = [];
  let offset = 0;
  for (const ch of L.chapters) {
    const o = offset;
    words.push(...ch.words.map((w) => ({ ...w, start: w.start + o, end: w.end + o })));
    offset += ch.seconds;
  }
  const voiced: WordTiming[] = [];
  let voiceOffset = 0;
  for (const ch of L.chapters) {
    const o = voiceOffset;
    voiced.push(...(ch.voiceWords ?? ch.words).map((w) => ({ ...w, start: w.start + o, end: w.end + o })));
    voiceOffset += ch.seconds - (ch.pauseSeconds ?? 0);
  }
  const timed = words.length > 0;

  const open = L.chapters[0]?.narration ?? '';
  const opening = open
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, Math.round(T.coldOpenSeconds * WORDS_PER_SECOND))
    .join(' ');
  const you = /\b(you|you're|you've|your|you'll)\b/i.test(opening);
  const problems = coldOpenProblems(open);
  add(
    'L1',
    'Cold open',
    2,
    you && !problems.length ? 'pass' : 'fail',
    !you
      ? `No "you" in the first ${T.coldOpenSeconds} s.`
      : problems.length
        ? problems[0]
        : 'The viewer is in the first scene within 15 s, with no channel intro before it.',
    you ? (problems[0] ?? '').replace(/^/, 'Fix the cold open: ') : 'Open on a second-person scene the viewer recognises, within 15 s.',
  );

  const minutes = total / 60;
  add(
    'L2',
    'Length',
    1,
    total > 0 ? band(minutes, T.minutes) : 'fail',
    total > 0 ? `${fixed(minutes)} minutes (${T.minutes.pass[0]}–${T.minutes.pass[1]} is the target).` : 'No voiced runtime yet.',
    minutes < T.minutes.pass[0]
      ? `${fixed(minutes)} min is short: competitors run 11–15 min.`
      : `${fixed(minutes)} min is long: trim to ${T.minutes.pass[1]} min.`,
  );

  const interrupts = detectInterrupts(L.chapters, L.interrupts ?? []);
  const marks = [0, ...interrupts, total];
  const longestStretch = Math.max(0, ...marks.slice(1).map((t, i) => t - marks[i]));
  add(
    'L3',
    'Pattern interrupts',
    1,
    timed
      ? longestStretch <= T.interruptSeconds.pass
        ? 'pass'
        : longestStretch <= T.interruptSeconds.warn
          ? 'warn'
          : 'fail'
      : 'fail',
    timed
      ? `${interrupts.length} interrupts; the longest stretch without one is ${Math.round(longestStretch)} s (limit ${T.interruptSeconds.pass}).`
      : 'No voice timing yet.',
    `A ${Math.round(longestStretch)} s stretch has no question or reveal: add one every 60–90 s.`,
  );

  const wpm = wordsPerMinute(voiced);
  const dead = pauses(voiced).find((p) => p.seconds > T.deadAirSeconds);
  const inPass = wpm >= T.wpm.pass[0] && wpm <= T.wpm.pass[1];
  const inWarn = wpm >= T.wpm.warn[0] && wpm <= T.wpm.warn[1];
  add(
    'L4',
    'Pace',
    1,
    !timed ? 'fail' : inPass && !dead ? 'pass' : inWarn && !dead ? 'warn' : 'fail',
    timed
      ? `${Math.round(wpm)} words a minute (${T.wpm.pass[0]}–${T.wpm.pass[1]})${
          dead ? `; a ${fixed(dead.seconds, 1)} s silence at ${mmss(dead.start)}` : ''
        }.`
      : 'No voice timing yet.',
    dead
      ? `Close the ${fixed(dead.seconds, 1)} s silence at ${mmss(dead.start)}.`
      : wpm < T.wpm.pass[0]
        ? `${Math.round(wpm)} WPM is slow: try the voice at 1.1× (playbook §2).`
        : `${Math.round(wpm)} WPM is fast: slow the voice.`,
  );

  const vs = L.visualSeconds;
  const longestPicture = vs.length ? Math.max(...vs) : 0;
  const over = vs.filter((v) => v > T.visualSeconds.pass).length;
  add(
    'L5',
    'Visual change',
    1,
    vs.length
      ? longestPicture <= T.visualSeconds.pass
        ? 'pass'
        : longestPicture <= T.visualSeconds.warn
          ? 'warn'
          : 'fail'
      : 'fail',
    vs.length
      ? `${vs.length} pictures; the longest holds ${fixed(longestPicture, 0)} s and ${over} run over ${T.visualSeconds.pass} s.`
      : 'No picture plan.',
    `${over} pictures stay on screen over ${T.visualSeconds.pass} s (the longest ${fixed(longestPicture, 0)} s): add shots so something changes every 5 s.`,
  );

  const chars = [...L.title].length;
  const shell = titleShell(L.title);
  add(
    'L6',
    'Title shell',
    2,
    chars <= T.titleMax ? 'pass' : 'fail',
    `${chars} characters; ${shell ? `uses the shell "${shell}"` : 'a custom shell (not one of the three proven ones)'}.`,
    `The title is ${chars} characters; the limit is ${T.titleMax}.`,
  );

  const variants = thumbnailVariants({
    thumbnailTexts: L.thumbnail.texts,
    thumbnailConcepts: L.thumbnail.concepts,
    thumbnailText: L.thumbnail.text,
  });
  const texts = variants.map((v) => v.words.map((w) => w.word).join(' '));
  const bad = texts.find(
    (t) => t.split(/\s+/).length > T.thumbnailWords || L.title.toLowerCase().includes(t.toLowerCase()),
  );
  const hasText = Boolean(texts.length && texts[0]);
  add(
    'L7',
    'Thumbnail text',
    2,
    hasText ? (bad ? 'fail' : 'pass') : 'fail',
    hasText
      ? bad
        ? `"${bad}" is ${bad.split(/\s+/).length > T.thumbnailWords ? 'over 4 words' : 'part of the title'}.`
        : `${texts.length} variants, each 4 words or fewer and adding to the title.`
      : 'No thumbnail text in the bank entry.',
    bad ? `Rewrite "${bad}": 4 words or fewer, and not words already in the title.` : 'Add thumbnail_texts to the bank entry.',
  );

  const previewPx = TEXT_BAND.minSize * (168 / THUMB_V2.width);
  const lowestContrast = variants.length
    ? Math.min(
        ...variants.flatMap((v) => {
          const bg = v.background === 'white' ? '#FFFFFF' : '#000000';
          return [contrastRatio(textColour(v.background), bg), contrastRatio(ACCENT_RED, bg)];
        }),
      )
    : 0;
  add(
    'L8',
    'Thumbnail readability',
    2,
    variants.length && previewPx >= T.minFontPx && lowestContrast >= T.contrast ? 'pass' : 'fail',
    variants.length
      ? `Text is ${fixed(previewPx, 0)} px tall at 168×94 (min ${T.minFontPx}); the lowest contrast is ${fixed(lowestContrast)}:1 (min ${T.contrast}:1).`
      : 'No thumbnail to check.',
    variants.length
      ? lowestContrast < T.contrast
        ? 'Pick a text or accent colour with more contrast on that background.'
        : 'Make the thumbnail text bigger.'
      : 'Add thumbnail_texts to the bank entry.',
  );

  const hootShare = (HOOT_THUMB.size * HOOT_THUMB.size) / (THUMB_V2.width * THUMB_V2.height);
  add(
    'L9',
    'Thumbnail focal point',
    2,
    hootShare >= T.hootShare ? 'pass' : 'fail',
    `Hoot fills ${Math.round(hootShare * 100)}% of the frame (min ${T.hootShare * 100}%).`,
    'Make Hoot bigger in the thumbnail.',
  );

  const firstMark = L.marks[0];
  add(
    'L10',
    'Chapters',
    1,
    L.marks.length >= T.chapters && firstMark?.at === 0 ? 'pass' : 'fail',
    `${L.marks.length} chapters${firstMark ? `, the first at ${mmss(firstMark.at)}` : ''}.`,
    L.marks.length < T.chapters
      ? `${L.marks.length} chapters; YouTube needs at least ${T.chapters}, the first at 0:00.`
      : 'Start the first chapter at 0:00.',
  );

  add(
    'L11',
    'Funnel',
    1,
    L.feederShorts >= 1 ? 'pass' : 'fail',
    L.feederShorts
      ? `${L.feederShorts} feeder Short${L.feederShorts === 1 ? '' : 's'} linked or queued.`
      : 'No Short is linked to this long-form.',
    'Queue a feeder Short that points at this long-form.',
  );

  return finish('long', checks);
}
