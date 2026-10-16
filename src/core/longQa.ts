/**
 * Long-form pre-publish QA: hook loop, no welcome, visual cadence, chapters,
 * end screen, recap, cue coverage, cast share, picture mix, repeats, card
 * designs, variety, diversity, neutral words and runtime. Rebuilt from 6.1.13.
 */
import { calmSeconds } from './compliance';
import { WORDS_PER_SECOND } from './guardrails';
import { stillParts, timeVisuals } from './hybridPlan';
import { cardDesign, pauseSeconds, pausedWords, varietyScore, type Pause, type PlanVisual } from './screenplayPlan';
import { diversityLines, diversityReport } from './diversityLint';
import { neutralHits } from './neutralLint';
import { STILL_TARGET } from './stillReuse';

export const FLAGSHIP_SECONDS = { min: 600, max: 690 };
export const STORY_SECONDS = { min: 600, max: 735 };
export const FLAGSHIP_WORDS = { min: 1260, max: 1450 };
export const QA = {
  loopSeconds: 35,
  welcomeSeconds: 60,
  holdFirstMinute: 5,
  holdAfter: 8,
  changesFirstMinute: 12,
  mixMin: 0.15,
  varietyWarn: 60,
  minChapterSeconds: 10,
  minChapters: 3,
  endSeconds: 20,
  recapMax: 3,
};

const words = (s: string) => s.split(/\s+/).filter(Boolean);
const PROMISE_RE =
  /\b(this (one )?is for you|if you've ever|every (sign|item|trick|reason) comes with|the last one|in the next|in this (file|video)|stay (to|for) the end|and at the end|by the end|you'll (see|learn|find|know|discover|spot)|here's (why|how|what)|the (one|only) (thing|reason)|nobody (tells|told)|the reason is)\b/i;
const LIST_ITEM_RE = /^(one|two|three|four|five|six|seven|eight|first|second|third|fourth|fifth|sixth|\d)\s*[:.,)]/i;

export interface QaChapter {
  index: number;
  title: string;
  narration: string;
  visuals?: PlanVisual[];
  cues?: { pauses: Pause[]; hoot: unknown[] };
}

export interface QaBankInfo {
  sceneCount?: number;
  nextVideo?: string;
  cueCounts?: { stat: number; guess: number; silence: number; hoot: number };
  planNotes?: string[];
  castShareMax?: number;
  reenactChapters?: string[];
  visualPlan?: { chapter: string; setting: string }[];
  flagship?: boolean;
  structure?: string;
}

export interface QaPlan {
  chapters: QaChapter[];
  bankV2?: QaBankInfo;
}

export interface QaOptions {
  alignment?: Record<string, { start: number; end: number }[]>;
  durations?: Record<string, number>;
  welcome: (text: string) => string[];
  neutralTerms?: string[];
}

export type QaStatus = 'pass' | 'warn' | 'block';

export interface QaCheck {
  id: string;
  label: string;
  status: QaStatus;
  detail: string;
}

/** Start/end seconds and kind of every visual across the whole video. */
export function visualTimeline(
  plan: QaPlan,
  opts: Pick<QaOptions, 'alignment' | 'durations'> = {},
): { start: number; end: number; kind: string }[] {
  const out: { start: number; end: number; kind: string }[] = [];
  let t0 = 0;
  for (const ch of plan.chapters) {
    const k = String(ch.index);
    const visuals = ch.visuals ?? [];
    const timed = opts.alignment?.[k] ?? [];
    const dur =
      opts.durations?.[k] ??
      (timed.length ? timed[timed.length - 1].end + 0.3 : words(ch.narration).length / WORDS_PER_SECOND);
    const total = dur + pauseSeconds(ch.cues);
    if (!timed.length) {
      let off = 0;
      for (const v of visuals) {
        const secs = v.seconds ?? v.words / WORDS_PER_SECOND;
        out.push({ start: t0 + off, end: t0 + off + secs, kind: v.kind });
        off += v.anchor !== 'gap' && !v.seconds ? v.words / WORDS_PER_SECOND : secs;
      }
    } else {
      for (const x of timeVisuals(visuals, pausedWords(ch.cues, timed), total, () => 'x')) {
        out.push({ start: t0 + x.start, end: t0 + x.end, kind: x.visual.kind });
      }
    }
    t0 += total;
  }
  return out;
}

const mmss = (s: number) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`;
const sumWords = (vs: { words: number }[]) => vs.reduce((a, v) => a + v.words, 0);

export function longQaChecks(plan: QaPlan, opts: QaOptions): QaCheck[] {
  const out: QaCheck[] = [];
  const add = (id: string, label: string, status: QaStatus, detail: string) => out.push({ id, label, status, detail });
  const first = plan.chapters[0];
  const opening = first?.narration ?? '';
  const v2 = plan.bankV2;

  const loopHead = words(opening).slice(0, Math.round(QA.loopSeconds * WORDS_PER_SECOND)).join(' ');
  const loop = /\?/.test(loopHead) || PROMISE_RE.test(loopHead);
  add(
    'qa-loop',
    'Open loop',
    loop ? 'pass' : 'block',
    loop
      ? 'A question or a promise lands inside the first 35 s.'
      : 'Nothing in the first 35 s opens a loop: ask the question or promise what they will see.',
  );

  const welcomeHead = words(opening).slice(0, Math.round(QA.welcomeSeconds * WORDS_PER_SECOND)).join(' ');
  const welcome = [
    ...opts.welcome(welcomeHead),
    ...(/\bwelcome (back )?to\b|\bthe mind files\b/i.test(welcomeHead)
      ? ['"Welcome to" or the channel name is in the first 60 s.']
      : []),
  ];
  add(
    'qa-welcome',
    'No welcome',
    welcome.length ? 'block' : 'pass',
    welcome.length ? welcome[0] : 'No welcome or channel name in the first 60 s.',
  );

  const timeline = visualTimeline(plan, opts);
  if (!timeline.length) {
    add('qa-visuals', 'Visual cadence', 'block', 'There is no picture plan.');
  } else {
    const end = timeline[timeline.length - 1].end;
    const body = timeline.filter(
      (x) => x.kind !== 'clip' && !(x.kind === 'card' && x.end >= end - 0.01 && x.start >= end - QA.endSeconds),
    );
    const pieces = body.flatMap((x) => {
      const n = x.kind === 'still' ? stillParts(x.start, x.end - x.start) : 1;
      return Array.from({ length: n }, (_, k) => ({
        start: x.start + ((x.end - x.start) * k) / n,
        end: x.start + ((x.end - x.start) * (k + 1)) / n,
      }));
    });
    const held = pieces.filter((p) => p.end - p.start > (p.start < 60 ? QA.holdFirstMinute : QA.holdAfter) + 0.05);
    const changes = v2?.sceneCount
      ? pieces.filter((p) => p.start < 60).length + timeline.filter((x) => x.kind === 'clip' && x.start < 60).length
      : timeline.filter((x) => x.start < 60).length;
    const longest = pieces.reduce((m, p) => Math.max(m, p.end - p.start), 0);
    const problems = [
      ...(held.length
        ? [
            `${held.length} picture${held.length === 1 ? '' : 's'} held too long (the longest ${longest.toFixed(1)} s; ${
              QA.holdFirstMinute
            } s in the first minute, ${QA.holdAfter} s after)`,
          ]
        : []),
      ...(changes < QA.changesFirstMinute
        ? [`only ${changes} changes in the first 60 s (${QA.changesFirstMinute} needed)`]
        : []),
    ];
    add(
      'qa-visuals',
      'Visual cadence',
      problems.length ? 'block' : 'pass',
      problems.length
        ? `${problems.join('; ')}.`
        : `${changes} changes in the first 60 s; no still held over ${longest.toFixed(1)} s.`,
    );
  }

  const seconds = plan.chapters.map(
    (ch) => (opts.durations?.[String(ch.index)] ?? words(ch.narration).length / WORDS_PER_SECOND) + pauseSeconds(ch.cues),
  );
  const short = plan.chapters.filter((_c, i) => seconds[i] < QA.minChapterSeconds).map((c) => c.title);
  const chapterProblems = [
    ...(plan.chapters.length < QA.minChapters ? [`only ${plan.chapters.length} chapters (at least ${QA.minChapters})`] : []),
    ...(short.length ? [`under ${QA.minChapterSeconds} s: ${short.join(', ')}`] : []),
  ];
  add(
    'qa-chapters',
    'Chapters',
    chapterProblems.length ? 'block' : 'pass',
    chapterProblems.length
      ? `${chapterProblems.join('; ')}.`
      : `${plan.chapters.length} chapters from 0:00, each at least ${QA.minChapterSeconds} s.`,
  );

  const last = plan.chapters.at(-1);
  const lastWords = words(last?.narration ?? '').length;
  let endAt = -1;
  let acc = 0;
  for (const v of last?.visuals ?? []) {
    if (v.card?.kind === 'end') endAt = acc;
    acc += v.words;
  }
  const endOk =
    Boolean(v2?.nextVideo) && endAt >= 0 && lastWords - endAt <= Math.round(QA.endSeconds * WORDS_PER_SECOND);
  add(
    'qa-end',
    'End screen',
    endOk ? 'pass' : 'block',
    endOk
      ? `The next video (${v2?.nextVideo}) is on the end card in the last 20 s.`
      : v2?.nextVideo
        ? 'The last 20 s carry no end card for the next video.'
        : 'No next_video is set, so there is nothing for the end screen to show.',
  );
  add(
    'qa-music',
    'Music and loudness',
    'warn',
    'Music 15 dB under the voice and −14 LUFS are not measured yet (they come with the music library, CR-66). Check them by ear before scheduling.',
  );

  let run = 0;
  let longestRun = 0;
  for (const s of (last?.narration ?? '').split(/(?<=[.!?])\s+/)) {
    run = LIST_ITEM_RE.test(s.trim()) ? run + 1 : 0;
    longestRun = Math.max(longestRun, run);
  }
  add(
    'qa-recap',
    'No recap list',
    longestRun > QA.recapMax ? 'block' : 'pass',
    longestRun > QA.recapMax
      ? `The last chapter lists ${longestRun} items back to back (${QA.recapMax} at most).`
      : 'The last chapter does not recite a list.',
  );

  const cc = v2?.cueCounts;
  if (cc) {
    const all = plan.chapters.flatMap((c) => c.visuals ?? []);
    const stats = all.filter((v) => v.card && !['title', 'guess', 'end'].includes(v.card.kind)).length;
    const count = (kind: string) =>
      plan.chapters.reduce((a, c) => a + (c.cues?.pauses.filter((p) => p.kind === kind).length ?? 0), 0);
    const guess = count('guess');
    const silence = count('silence');
    const hoot = plan.chapters.reduce((a, c) => a + (c.cues?.hoot.length ?? 0), 0);
    const short1 = (n: number, what: string) => `${n} ${what}${n === 1 ? '' : 's'}`;
    const missing = [
      ...(stats < cc.stat ? [short1(cc.stat - stats, 'stat card')] : []),
      ...(guess < cc.guess ? [short1(cc.guess - guess, 'guess pause')] : []),
      ...(silence < cc.silence ? [short1(cc.silence - silence, 'silence beat')] : []),
      ...(hoot < cc.hoot ? [short1(cc.hoot - hoot, 'Hoot moment')] : []),
    ];
    add(
      'qa-cues',
      'Every cue rendered',
      missing.length ? 'block' : 'pass',
      missing.length
        ? `Not in the plan: ${missing.join(', ')}. ${v2?.planNotes?.[0] ?? ''}`.trim()
        : `${cc.stat} stat cards, ${cc.guess + cc.silence} pauses and ${cc.hoot} Hoot moments are all in the plan.`,
    );
  }

  const opener = first?.visuals ?? [];
  const hookClips = opener.slice(0, 3).filter((v) => v.kind === 'clip').length;
  const hookOk =
    hookClips >= 2 && opener[0]?.kind === 'clip' && (opener[0].role === 'anchor' || opener[0].role === undefined);
  if (!v2?.sceneCount) {
    add(
      'qa-hook',
      'Hook clips',
      hookOk ? 'pass' : 'block',
      hookOk
        ? `The first 30 s open on ${hookClips} Veo clips, the first of them the opening anchor.`
        : `The first 30 s have ${hookClips} Veo clip${hookClips === 1 ? '' : 's'}; CR-61 wants at least 2, opening on the first anchor.`,
    );
  } else {
    const firstPicture = opener.find((v) => v.kind !== 'card');
    const ok = firstPicture?.kind === 'still';
    add(
      'qa-hook',
      'Hook clips',
      ok ? 'pass' : 'block',
      ok
        ? 'The story opens on its first scene (a still; a long-form told in scenes uses no Veo clips).'
        : 'The first picture is not the first scene.',
    );
  }

  if (v2?.cueCounts) {
    const scenes = Boolean(v2.sceneCount);
    const capShare = v2.castShareMax ?? 0.35;
    const over: string[] = [];
    plan.chapters.forEach((ch) => {
      const vs = ch.visuals ?? [];
      const total = sumWords(vs);
      const cast = sumWords(vs.filter((v) => v.role === 'anchor' || v.role === 'cast'));
      if (total && cast / total > capShare + 0.005) over.push(`${ch.title} (${Math.round((cast / total) * 100)}%)`);
    });
    if (scenes) over.length = 0;
    add(
      'qa-cast',
      'Cast share',
      over.length ? 'block' : 'pass',
      scenes
        ? "The scenes are the bank's own; the cast is not capped (CR-91D)."
        : over.length
          ? `More than ${Math.round(capShare * 100)}% of the runtime shows the cast in: ${over.join(', ')}.`
          : `The cast takes at most ${Math.round(capShare * 100)}% of every chapter.`,
    );

    const noReenact = (v2.reenactChapters ?? []).filter(
      (t) => !(plan.chapters.find((c) => c.title === t)?.visuals ?? []).some((v) => v.role === 'reenactment'),
    );
    add(
      'qa-reenact',
      'Reenactments',
      noReenact.length ? 'block' : 'pass',
      noReenact.length
        ? `No period reenactment in: ${noReenact.join(', ')}.`
        : `Every one of the ${(v2.reenactChapters ?? []).length} listed chapters has its reenactment.`,
    );

    const all = plan.chapters.flatMap((c) => c.visuals ?? []);
    const totalWords = sumWords(all) || 1;
    const share = (role: string) => sumWords(all.filter((v) => v.role === role)) / totalWords;
    const mix = [
      ...(share('metaphor') < QA.mixMin ? [`symbolic ${Math.round(share('metaphor') * 100)}%`] : []),
      ...(share('insert') < QA.mixMin ? [`object close-ups ${Math.round(share('insert') * 100)}%`] : []),
    ];
    add(
      'qa-mix',
      'Picture mix',
      mix.length && !scenes ? 'block' : 'pass',
      scenes
        ? "One still per scene; the mix is the bank's own (CR-91D)."
        : mix.length
          ? `Under ${QA.mixMin * 100}%: ${mix.join(', ')}.`
          : `Symbolic ${Math.round(share('metaphor') * 100)}%, object close-ups ${Math.round(
              share('insert') * 100,
            )}%, cast ${Math.round((share('anchor') + share('cast')) * 100)}% of the runtime.`,
    );

    const prompts = new Set<string>();
    const repeats: string[] = [];
    const sig = (v: PlanVisual) => `${v.role}|${v.subject}|${v.size}|${v.setting}|${v.composition ?? ''}`;
    all.forEach((v, i) => {
      if (v.kind === 'still' && !v.reuse) {
        if (prompts.has(v.prompt)) repeats.push(`${v.key} repeats an earlier still`);
        prompts.add(v.prompt);
      }
      if (v.role && v.role !== 'graphic' && v.subject && !v.reuse) {
        const twin = all.slice(Math.max(0, i - 10), i).find((p) => p.role === v.role && p.subject && sig(p) === sig(v));
        if (twin) repeats.push(`${v.key} looks like ${twin.key}`);
      }
    });
    const images = all.filter((v) => v.kind === 'still' && !v.reuse).length;
    const moments = all.filter((v) => v.kind === 'still').length;
    const cap = Math.max(STILL_TARGET, v2.sceneCount ?? 0);
    const clipCount = all.filter((v) => v.kind === 'clip' && !v.reuse).length;
    const sceneNote =
      v2.sceneCount && images + clipCount !== v2.sceneCount
        ? `; the bank has ${v2.sceneCount} scenes (${clipCount} clips), one picture each`
        : '';
    add(
      'qa-stills',
      'Pictures to make',
      images > cap || sceneNote ? 'warn' : 'pass',
      `${images} stills to make for ${moments} still moments${images > cap ? `; the cap is ${cap}` : ''}${sceneNote} (a picture may stand for several moments, each with its own zoom or pan).`,
    );
    add(
      'qa-unique',
      'No repeats',
      repeats.length ? 'block' : 'pass',
      repeats.length
        ? `${repeats.slice(0, 3).join('; ')}${repeats.length > 3 ? ` and ${repeats.length - 3} more` : ''}.`
        : 'No still is used twice, and no picture repeats one of the ten before it.',
    );

    const cards = all
      .filter((v) => v.card && !['title', 'guess', 'end'].includes(v.card.kind))
      .map((v) => ({ key: v.key, kind: cardDesign(v.card!) }));
    const alike = cards.filter((c, i) => i > 0 && cards[i - 1].kind === c.kind);
    add(
      'qa-cards',
      'Card designs',
      alike.length ? 'block' : 'pass',
      alike.length
        ? `${alike.length} stat card${alike.length === 1 ? '' : 's'} share a design with the one before (${alike
            .slice(0, 3)
            .map((c) => `${c.key}: ${c.kind}`)
            .join(', ')}).`
        : `${cards.length} stat cards, no two in a row alike.`,
    );

    const scores = plan.chapters.map((ch) => {
      const counts: Record<string, number> = {};
      for (const v of ch.visuals ?? []) {
        const r = v.role ?? 'graphic';
        counts[r] = (counts[r] ?? 0) + v.words;
      }
      return { title: ch.title, score: varietyScore(counts) };
    });
    const low = scores.filter((s) => s.score < QA.varietyWarn);
    add(
      'qa-variety',
      'Variety score',
      low.length && !scenes ? 'warn' : 'pass',
      `${scores.map((s) => `${s.score}`).join(' · ')}${low.length ? `; low: ${low.map((s) => s.title).join(', ')}` : ''}.`,
    );

    const report = diversityReport(
      plan.chapters.map((c) => ({ title: c.title, visuals: c.visuals ?? [] })) as never,
      v2.visualPlan,
    );
    add(
      'qa-diversity',
      'Diversity',
      report.ok || scenes ? 'pass' : 'block',
      scenes
        ? "Every scene is its own picture; the bank's gate (L11) checks that no setting and action repeat."
        : !report.ok
          ? diversityLines(report).join(' ')
          : `No two pictures are described alike, no framing repeats inside 3 shots, the protagonist is in ${Math.round(
              report.protagonist * 100,
            )}% of the shots${v2.visualPlan ? ', every item has its cutaway and its own setting' : ''}.`,
    );
  }

  const neutral = plan.chapters.flatMap((ch) =>
    [
      { where: 'narration', text: ch.narration },
      ...(ch.visuals ?? []).filter((v) => v.prompt).map((v) => ({ where: 'picture', text: v.prompt ?? '' })),
    ].flatMap(({ where, text }) => {
      const hits = neutralHits(text, opts.neutralTerms ?? []);
      return hits.length ? [`chapter ${ch.index} ${where}: ${hits.join(', ')}`] : [];
    }),
  );
  add(
    'qa-neutral',
    'Neutral cast',
    neutral.length ? 'block' : 'pass',
    neutral.length
      ? `A word tied to one culture (CR-78, blocking): ${neutral.slice(0, 4).join('; ')}${
          neutral.length > 4 ? `; and ${neutral.length - 4} more` : ''
        }.`
      : 'No city, country, festival, food or currency tied to one culture.',
  );

  if (v2?.flagship && v2.structure !== 'single_idea_story') {
    const tl = visualTimeline(plan, opts);
    const end = tl.length ? tl[tl.length - 1].end : 0;
    const ok = end >= FLAGSHIP_SECONDS.min && end <= FLAGSHIP_SECONDS.max;
    const total = plan.chapters.reduce((a, c) => a + words(c.narration).length, 0);
    add(
      'qa-runtime',
      'Flagship runtime',
      ok ? 'pass' : 'warn',
      `${mmss(end)}${opts.alignment ? '' : ' (estimated from the words)'}; a flagship runs ${mmss(FLAGSHIP_SECONDS.min)} to ${mmss(
        FLAGSHIP_SECONDS.max,
      )} (CR-88E), about ${FLAGSHIP_WORDS.min.toLocaleString()} to ${FLAGSHIP_WORDS.max.toLocaleString()} words; this script has ${total.toLocaleString()} words.`,
    );
  }
  if (v2?.structure === 'single_idea_story') {
    const tl = opts.alignment ? visualTimeline(plan, opts) : [];
    const end = tl.length ? tl[tl.length - 1].end : calmSeconds(plan.chapters.map((c) => c.narration));
    const ok = end >= STORY_SECONDS.min && end <= STORY_SECONDS.max;
    add(
      'qa-runtime',
      'Story runtime',
      ok ? 'pass' : 'warn',
      `${mmss(end)}${opts.alignment ? '' : ' (estimated at 2.0 words a second with line pauses)'}; a single-idea story runs ${mmss(
        STORY_SECONDS.min,
      )} to ${mmss(STORY_SECONDS.max)} (CR-91).`,
    );
  }
  return out;
}
