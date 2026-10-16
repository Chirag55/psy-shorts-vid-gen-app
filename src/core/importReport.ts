import { isSceneFirst, shortFormatProblems } from './shortFormat';
import { isV2, type ImportPlan } from './topicBank';
import { lintBank } from './scriptLint';
import { lintLongTitle, lintShortTitles, promisedCount, searchIntentTitle, type TitleIssue } from './longTitleLint';
import { checkOriginality, originalityLine } from './originality';
import { hookProblems } from './authenticity';
import { withAltHook } from './hookVariants';
import { neutralFindings } from './neutralLint';

/** Speaking pace the runtime estimate uses. */
export const REPORT_WPM = 150;

const wordsIn = (text: string) => text.split(/\s+/).filter(Boolean).length;
const isLongId = (id: string) => /^(MF-L-|L-)/.test(id);

export interface LongSummary {
  id: string;
  title: string;
  chapters: number;
  words: number;
  minutes: number;
  clips: number;
  budget?: number;
  cues: { stat: number; hoot: number; guess: number; silence: number; music: number };
  hasScreenplay: boolean;
}

/** What an import did and what it found, as counts and readable lines. */
export function importReport(
  bank: { entries: any[] },
  plan: ImportPlan,
  opts: { competitorTitles?: any[]; neutralTerms?: string[] } = {},
) {
  const longs: LongSummary[] = bank.entries
    .filter((e) => e.kind === 'long' && isV2(e))
    .map((e) => {
      const sp = e.screenplay;
      const words = e.chapters.reduce((n: number, c: any) => n + wordsIn(c.narration), 0);
      return {
        id: e.id,
        title: e.title,
        chapters: e.chapters.length,
        words,
        minutes: Math.round((words / REPORT_WPM) * 10) / 10,
        clips: sp ? (sp.anchors.length || sp.flow_clips.length) + 1 + sp.reenactments.length : 0,
        ...(sp?.flow_budget_credits ? { budget: sp.flow_budget_credits } : {}),
        cues: {
          stat: sp?.stat_cards?.length ?? 0,
          hoot: sp?.hoot_moments?.length ?? 0,
          guess: sp?.guess_pauses?.length ?? 0,
          silence: sp?.silence_beats?.length ?? 0,
          music: sp?.music?.length ?? 0,
        },
        hasScreenplay: Boolean(sp),
      };
    });
  const cueErrors = plan.rejected.map((r) => r.reason).filter((r) => /screenplay .* (cue|names the chapter)/.test(r));
  const counts = {
    longAdded: plan.added.filter(isLongId).length,
    longReplaced: plan.updated.filter(isLongId).length,
    shortAdded: plan.added.filter((id) => !isLongId(id)).length,
    shortReplaced: plan.updated.filter((id) => !isLongId(id)).length,
    skipped: plan.skipped.length,
    conditional: plan.conditional.length,
    locked: plan.locked.length,
    rejected: plan.rejected.length,
  };
  const entries = bank.entries.filter((e) => isV2(e) && !e.skip_reason && !plan.skipped.some((s) => s.id === e.id));
  const lint = lintBank(entries);
  const pending = entries.filter((e) => !e.published_on);
  const packaging: (TitleIssue & { id: string })[] = pending.flatMap((e) => {
    let issues: TitleIssue[];
    if (e.kind !== 'long') {
      issues = lintShortTitles({
        title: e.title,
        alt: e.title_alt,
        numbered: e.format === 'LIST',
        count: promisedCount(e.narration),
      });
    } else {
      const count = e.item_count ? { itemCount: e.item_count } : {};
      issues = [
        ...lintLongTitle({ title: e.title, thumbnailText: e.thumbnail_text, ...count }),
        ...((e.title_alts ?? []) as string[]).flatMap((alt) =>
          lintLongTitle({ title: alt, ...count })
            .filter((i) => i.level === 'red' && i.rule !== 'search-pattern')
            .map((i) => ({ ...i, message: `alt title "${alt}": ${i.message}` })),
        ),
      ];
    }
    return issues.map((i) => ({ ...i, id: e.id }));
  });
  const altHooks: string[] = entries.flatMap((e) =>
    e.kind === 'short' && e.hook_alt
      ? hookProblems(withAltHook(e.narration, e.hook_alt), e.hook_text, { sceneFirst: isSceneFirst(e) }).map(
          (p) => `${e.id}: alt hook: ${p}`,
        )
      : [],
  );
  const originality: string[] = opts.competitorTitles?.length
    ? entries.flatMap((e) => {
        const titles = [
          e.title,
          ...(e.kind === 'short' && e.title_alt ? [e.title_alt] : []),
          ...(e.kind !== 'long' ? [] : e.title_alts ?? []),
        ];
        const r = checkOriginality(titles, opts.competitorTitles ?? []);
        return r.level !== 'ok' ? [`${e.id}: ${originalityLine(r)}`] : [];
      })
    : [];
  const neutral = neutralFindings(entries, opts.neutralTerms ?? []);
  const shorts = entries.filter((e) => e.kind === 'short');
  const sceneShorts = shorts.filter((e) => e.kind === 'short' && isSceneFirst(e));
  const sceneFirst = {
    count: sceneShorts.length,
    older: shorts.length - sceneShorts.length,
    notes: sceneShorts.flatMap((e) => {
      if (e.kind !== 'short') return [];
      const p = shortFormatProblems(e);
      return [...p.red.map((m) => `${e.id}: ${m} (blocks the Short)`), ...p.amber.map((m) => `${e.id}: ${m}`)];
    }),
  };
  const short = longs
    .filter((l) => l.minutes < 8.2)
    .map((l) => `${l.id} is ${l.minutes} min at ${REPORT_WPM} wpm (under 8.2)`);
  const s = (n: number) => (n === 1 ? '' : 's');
  const screenplays = longs.filter((l) => l.hasScreenplay).length;
  const lines: string[] = [
    `Long-form: ${counts.longAdded} added, ${counts.longReplaced} replaced.`,
    `Shorts: ${counts.shortAdded} added, ${counts.shortReplaced} replaced, ${counts.skipped} skipped, ${counts.conditional} conditional.`,
    ...(plan.published.length
      ? [`Already published (CR-80): ${plan.published.join(', ')} recorded as published, never queued.`]
      : []),
    ...(counts.locked
      ? [`${counts.locked} already started or published and left as they are: ${plan.locked.join(', ')}.`]
      : []),
    ...(plan.reset.length
      ? [
          `In progress and rewritten (CR-91): ${plan.reset.join(', ')}. They take the new script and stay in progress; their projects' old voice and render are discarded: make them again from the bank.`,
        ]
      : []),
    `Cues: ${cueErrors.length} cue-phrase error${s(cueErrors.length)}${
      longs.some((l) => l.hasScreenplay) ? `; every cue in ${screenplays} screenplays matched exactly once` : ''
    }.`,
    ...longs.map((l) => {
      const head = `${l.id}: ${l.chapters} chapters, ${l.words} words, ${l.minutes} min at ${REPORT_WPM} wpm`;
      if (!l.hasScreenplay) return `${head}; no screenplay (the shot list or the generic cut plans it)`;
      const budget = l.budget ? `, ${Math.floor(l.budget / 20)} paid for by ${l.budget} credits` : '';
      return `${head}; ${l.clips} Veo clips wanted${budget}, ${l.cues.stat} stat cards, ${l.cues.hoot} Hoot moments, ${l.cues.guess} guess pause${s(l.cues.guess)}, ${l.cues.silence} silence beat${s(l.cues.silence)}`;
    }),
    ...short.map((l) => `Runtime: ${l}.`),
    ...(lint.length
      ? [`Script lint (CR-76): ${lint.length} warning${s(lint.length)}.`, ...lint.slice(0, 8).map((i) => `  ${i.message}`)]
      : []),
    ...(packaging.length
      ? [
          `Titles (CR-60): ${packaging.filter((i) => i.level === 'red').length} red, ${packaging.filter((i) => i.level === 'amber').length} amber.`,
          ...packaging
            .filter((i) => i.level === 'red')
            .slice(0, 8)
            .map((i) => {
              const e = entries.find((x) => x.id === i.id);
              const better =
                e?.kind === 'long' && i.rule === 'search-pattern' ? searchIntentTitle({ title: e.title }, e.title_alts) : undefined;
              const hint = better && better !== e?.title ? ` An alternative that is: "${better}".` : '';
              return `  ${i.id}: ${i.message}${hint}`;
            }),
        ]
      : []),
    ...(altHooks.length
      ? [`Alt hooks (CR-63): ${altHooks.length} problem${s(altHooks.length)}.`, ...altHooks.slice(0, 5).map((l) => `  ${l}`)]
      : []),
    ...(originality.length
      ? [
          `Originality (CR-62): ${originality.length} title${s(originality.length)} close to a competitor's.`,
          ...originality.slice(0, 5).map((l) => `  ${l}`),
        ]
      : []),
    ...(neutral.length
      ? [
          `Neutral cast (CR-78): ${neutral.length} place${s(neutral.length)} with a word tied to one culture (amber).`,
          ...neutral.slice(0, 8).map((f) => `  ${f.id} ${f.where}: ${f.terms.join(', ')}`),
        ]
      : []),
    ...(sceneFirst.count || sceneFirst.older
      ? [
          `Scene-first Shorts (CR-82): ${sceneFirst.count} written in the new format, ${sceneFirst.older} in the older one (kept as they are).`,
          ...sceneFirst.notes.slice(0, 8).map((l) => `  ${l}`),
        ]
      : []),
    ...plan.conditional.map((c) => `Waiting for your answer: ${c.id} — ${c.condition}`),
  ];
  return { longs, counts, cueErrors, short, lint, packaging, originality, altHooks, neutral, sceneFirst, lines };
}
