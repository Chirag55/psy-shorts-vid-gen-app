/**
 * Authenticity gate (CR-46 / CR-80 hooks, cold opens, originality, the
 * pre-publish gate). Rebuilt from 6.1.13.
 */
import { sentences, textWords } from './bankV2';
import { DEFAULT_CHANNEL_CONFIG } from './channelConfig';
import { fnv1a } from './researchLayer2';
import { assetKeyFor, flattenShots } from './shots';
import { longQaChecks, type QaPlan } from './longQa';
import { shortVarietyChecks } from './shortVariety';
import { checkOriginality, originalityLine, type Competitor } from './originality';
import type { LongScript, Project, ReviewStamp, ScriptBody, ShortScript, WordTiming } from './types';

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

export type GateStatus = 'pass' | 'warn' | 'block';

export interface GateCheck {
  id: string;
  label: string;
  status: GateStatus;
  detail: string;
}

export interface GateInput {
  script: ScriptBody;
  sources: string[];
  review?: ReviewStamp;
  published: { id: string; title: string; narration: string }[];
  neutralTerms?: string[];
  voiceSeconds?: number;
  frameZeroReady?: boolean;
  alignment?: Record<string, WordTiming[]>;
  durations?: Record<string, number>;
  competitorTitles?: Competitor[];
  titles?: string[];
  originalityOverride?: { reason: string; at: string };
}

export interface GateResult {
  checks: GateCheck[];
  ok: boolean;
  scriptHash: string;
}

type BankInfo = {
  sourceLine?: string;
  visualBeats?: string[];
  settingsPool?: string[];
  insertProps?: string[];
  metaphor?: string;
  cueCounts?: unknown;
  source?: string;
  sources?: string[];
  titleAlt?: string;
};
const bankOf = (script: ScriptBody) => (script as ScriptBody & { bankV2?: BankInfo }).bankV2;

/** The pre-render authenticity gate (CR-45): review, similarity, originality, source, hook, length, variety, QA. */
export function runGate(input: GateInput): GateResult {
  const script = input.script;
  const hash = scriptHash(script);
  const checks: GateCheck[] = [];
  const narration = narrationText(script);
  const review = input.review;
  if (!review) {
    checks.push({ id: 'review', label: 'Human review', status: 'block', detail: 'Tick "I\'ve read this script and the visuals match it."' });
  } else if (review.scriptHash === hash) {
    checks.push({
      id: 'review',
      label: 'Human review',
      status: 'pass',
      detail: `${review.reviewer}, ${review.at.slice(0, 16).replace('T', ' ')} UTC`,
    });
  } else {
    checks.push({
      id: 'review',
      label: 'Human review',
      status: 'block',
      detail: `The script or shots changed after ${review.reviewer} reviewed it. Read it again and re-tick.`,
    });
  }

  const sim = similarityTo(narration, input.published);
  const pct = `${Math.round(sim.score * 100)}%`;
  const closest = sim.closest ? ` (closest: "${sim.closest.title}")` : '';
  if (sim.score > SIMILARITY_BLOCK) {
    checks.push({
      id: 'similarity',
      label: 'Similarity',
      status: 'block',
      detail: `${pct} overlap with a recent upload${closest}; the limit is ${35}%.`,
    });
  } else if (sim.score > SIMILARITY_WARN) {
    checks.push({
      id: 'similarity',
      label: 'Similarity',
      status: 'warn',
      detail: `${pct} overlap with a recent upload${closest}; over ${25}% reads as templated.`,
    });
  } else {
    checks.push({
      id: 'similarity',
      label: 'Similarity',
      status: 'pass',
      detail: `${pct} at most, against the last ${sim.compared} published.`,
    });
  }

  if (input.competitorTitles?.length && input.titles?.length) {
    const r = checkOriginality(input.titles, input.competitorTitles);
    if (r.level !== 'ok') {
      if (r.level === 'red' && input.originalityOverride) {
        checks.push({
          id: 'originality',
          label: 'Originality',
          status: 'warn',
          detail: `${originalityLine(r)} Published anyway: "${input.originalityOverride.reason}" (${input.originalityOverride.at.slice(0, 10)}).`,
        });
      } else {
        checks.push({
          id: 'originality',
          label: 'Originality',
          status: r.level === 'red' ? 'block' : 'warn',
          detail: `${originalityLine(r)}${r.level === 'red' ? ' Change the title, or confirm with a reason.' : ''}`,
        });
      }
    } else {
      checks.push({
        id: 'originality',
        label: 'Originality',
        status: 'pass',
        detail: `No title is close to the ${input.competitorTitles.length} cached competitor titles.`,
      });
    }
  }

  const sources = input.sources.map((s) => s.trim()).filter(Boolean);
  checks.push(
    sources.length
      ? { id: 'source', label: 'Source', status: 'pass', detail: sources.length !== 1 ? `${sources.length} sources` : sources[0] }
      : { id: 'source', label: 'Source', status: 'block', detail: 'No source. Every video cites the study or concept it is based on.' },
  );

  const v2 = bankOf(script);
  if (script.mode !== 'short') {
    if (v2) {
      const problems = coldOpenProblems(script.chapters[0]?.narration ?? '');
      checks.push(
        problems.length
          ? { id: 'hook', label: 'Cold open', status: 'block', detail: problems.join(' ') }
          : { id: 'hook', label: 'Cold open', status: 'pass', detail: 'No welcome, branding or "in this video" in the first 30 s.' },
      );
    }
  } else {
    const sceneFirst = Boolean(v2?.sourceLine || v2?.visualBeats?.length);
    const problems = hookProblems(narration, frameZeroText(script), { sceneFirst });
    if (!script.beats[0]?.shots?.[0]) problems.push('Frame 0 has no shot: it would be a bare title card.');
    else if (input.frameZeroReady === false) {
      problems.push(
        "Frame 0 has no picture yet: import or generate a clip or still for the hook's shots, or the video opens on a later beat.",
      );
    }
    checks.push(
      problems.length
        ? { id: 'hook', label: 'Hook (CR-46)', status: 'block', detail: problems.join(' ') }
        : { id: 'hook', label: 'Hook (CR-46)', status: 'pass', detail: `"${frameZeroText(script)}" on the first shot from frame 0.` },
    );
  }

  const seconds = input.voiceSeconds ?? textWords(narration).length / 2.4;
  const basis = input.voiceSeconds !== undefined ? 'voice' : 'estimate';
  if (script.mode !== 'short') {
    const minutes = seconds / 60;
    const T = LONG_TARGET;
    const status: GateStatus = minutes < T.warnBelowMinutes || minutes > T.maxMinutes ? 'warn' : 'pass';
    const text =
      minutes < T.warnBelowMinutes
        ? `under ${T.warnBelowMinutes} min, so no mid-roll ads once monetized`
        : minutes > T.maxMinutes
          ? `over the ${T.minMinutes}–${T.maxMinutes} min target`
          : `within ${T.minMinutes}–${T.maxMinutes} min`;
    checks.push({ id: 'duration', label: 'Length (CR-47)', status, detail: `${formatDuration(seconds)} (${basis}): ${text}.` });
  } else {
    const T = SHORT_TARGET;
    const sceneFirst = Boolean(v2?.sourceLine || v2?.visualBeats?.length);
    const over = sceneFirst && seconds > SCENE_FIRST_MAX_SECONDS;
    const status: GateStatus =
      seconds > T.blockAbove
        ? 'block'
        : seconds < T.warnBelow || seconds < T.min || seconds > T.max || over
          ? 'warn'
          : 'pass';
    const text =
      seconds > T.blockAbove
        ? `over ${T.blockAbove} s is blocked for now`
        : seconds < T.warnBelow
          ? `under ${T.warnBelow} s, where Shorts reach collapsed in 2026`
          : over
            ? `over ${SCENE_FIRST_MAX_SECONDS} s: the scene-first format is built for 20 to 28 s, and the tail loses viewers`
            : seconds < T.min || seconds > T.max
              ? `outside the ${T.min}–${T.max} s target`
              : `within ${T.min}–${T.max} s`;
    checks.push({ id: 'duration', label: 'Length (CR-47)', status, detail: `${formatDuration(seconds)} (${basis}): ${text}.` });
  }

  if (script.mode === 'short' && (v2?.settingsPool || v2?.insertProps || v2?.metaphor)) {
    for (const c of shortVarietyChecks(script)) {
      checks.push({ id: `qa-short-${c.id}`, label: c.label, status: c.ok ? 'pass' : 'warn', detail: c.detail });
    }
  }
  if (script.mode === 'long' && v2?.cueCounts) {
    checks.push(
      ...longQaChecks(script as unknown as QaPlan, {
        alignment: input.alignment,
        durations: input.durations,
        welcome: (text) => coldOpenProblems(text, true),
        neutralTerms: input.neutralTerms,
      }),
    );
  }
  return { checks, ok: !checks.some((c) => c.status === 'block'), scriptHash: hash };
}

export interface GateLogEntry {
  at: string;
  reviewer?: string;
  scriptHash: string;
  ok: boolean;
  checks: { id: string; status: GateStatus; detail: string }[];
}

export function appendGateLog(
  log: GateLogEntry[] | undefined,
  result: GateResult,
  review: ReviewStamp | undefined,
  now: Date,
): GateLogEntry[] {
  const entry: GateLogEntry = {
    at: now.toISOString(),
    ...(review ? { reviewer: review.reviewer } : {}),
    scriptHash: result.scriptHash,
    ok: result.ok,
    checks: result.checks.map(({ id, status, detail }) => ({ id, status, detail })),
  };
  return [...(log ?? []), entry].slice(-30);
}

/** The latest passing gate run for this exact script, if any. */
export function passedGateFor(log: GateLogEntry[] | undefined, script: ScriptBody): GateLogEntry | undefined {
  const hash = scriptHash(script);
  return [...(log ?? [])].reverse().find((e) => e.ok && e.scriptHash === hash);
}

export function gateLogMarkdown(
  projects: { title: string; videoId?: string; log: GateLogEntry[] }[],
  now: Date,
): string {
  const lines = [
    '# The Mind Files — authenticity gate log',
    '',
    `Exported ${now.toISOString().slice(0, 10)}. One section per video; every render was checked before it was made (CR-45).`,
    '',
  ];
  for (const p of projects) {
    if (!p.log.length) continue;
    lines.push(`## ${p.title}${p.videoId ? ` (https://youtu.be/${p.videoId})` : ''}`, '');
    for (const e of p.log) {
      lines.push(
        `- ${e.at.replace('T', ' ').slice(0, 19)} UTC — ${e.ok ? 'PASSED' : 'BLOCKED'}${
          e.reviewer ? `, reviewed by ${e.reviewer}` : ''
        }, script ${e.scriptHash}`,
      );
      for (const c of e.checks) lines.push(`  - ${c.id}: ${c.status} — ${c.detail}`);
    }
    lines.push('');
  }
  return lines.join('\n');
}

export function projectSources(project: Project): string[] {
  const s = project.script;
  const v2 = bankOf(s);
  if (s.mode === 'short' && v2) return [v2.source as string];
  if (s.mode === 'long' && v2) return v2.sources as string[];
  return project.source?.trim() ? [project.source.trim()] : [];
}

function voicedEntries(project: Project): [string, WordTiming[]][] {
  return Object.entries(project.assets.alignment ?? {}).filter(([k]) =>
    project.mode !== 'short' ? k !== 'short' : k === 'short',
  );
}

const lastEnd = (entries: [string, WordTiming[]][]) =>
  entries.reduce((a, [, w]) => a + (w.length ? w[w.length - 1].end : 0), 0);

/** Seconds of voice the project has, from its word timings. */
export function voicedSeconds(project: Project): number | null {
  const entries = voicedEntries(project);
  if (!entries.length) return null;
  return lastEnd(entries);
}

export function gateInputFor(
  project: Project,
  projects: Project[],
  competitorTitles?: Competitor[],
  neutralTerms?: string[],
): GateInput {
  const published = projects
    .filter((p) => p.id !== project.id && p.assets.youtubeVideoId)
    .sort((a, b) => (b.assets.publishedAt ?? 0) - (a.assets.publishedAt ?? 0))
    .map((p) => ({ id: p.id, title: p.publish.title || p.script.title, narration: narrationText(p.script) }));
  const entries = voicedEntries(project);
  const voiceSeconds = entries.length ? lastEnd(entries) : undefined;
  let frameZeroReady: boolean | undefined;
  if (project.mode === 'short') {
    frameZeroReady = flattenShots(project.script as ShortScript & { beats: never })
      .filter((f) => f.beatIndex === 0)
      .some((f) =>
        Boolean(
          project.assets.clips[assetKeyFor(f.flatIndex, f.shot)] || project.assets.stills[assetKeyFor(f.flatIndex, f.shot)],
        ),
      );
  }
  const input: GateInput = {
    script: project.script,
    sources: projectSources(project),
    ...(project.review ? { review: project.review } : {}),
    published,
  };
  Object.assign(input, neutralTerms?.length ? { neutralTerms } : {});
  Object.assign(input, voiceSeconds !== undefined ? { voiceSeconds } : {});
  Object.assign(input, frameZeroReady !== undefined ? { frameZeroReady } : {});
  Object.assign(
    input,
    project.mode === 'long' && Object.keys(project.assets.alignment ?? {}).length
      ? { alignment: project.assets.alignment }
      : {},
  );
  if (competitorTitles?.length) {
    const titleAlt = project.mode === 'short' ? bankOf(project.script)?.titleAlt : undefined;
    Object.assign(input, {
      competitorTitles,
      titles: [project.publish.title || project.script.title, ...(titleAlt ? [titleAlt] : [])],
      ...(project.originalityOverride ? { originalityOverride: project.originalityOverride } : {}),
    });
  }
  return input;
}
