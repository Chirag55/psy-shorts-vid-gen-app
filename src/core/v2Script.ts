import {
  CATCHPHRASE,
  FLAGSHIP_ANCHORS,
  countWords,
  endsWithCatchphrase,
  longNarration,
  sentences,
  textWords,
} from './bankV2';
import { WORDS_PER_SECOND } from './guardrails';
import { SHOT_LISTS } from '@/assets/shotLists';
import { SHOT_OVERRIDES } from '@/assets/shotOverrides';
import { bundledTitle } from './bundledBank';
import { chapterVisuals, heroChapters } from './hybridPlan';
import { planFromShotList } from './shotListPlan';
import { planScreenplay } from './screenplayPlan';
import { DEFAULT_CHANNEL_CONFIG } from './channelConfig';

/** How each Short format opens, for the planner brief. */
export const FORMAT_OPENINGS: Record<string, string> = {
  STUDY: 'STUDY — opens on the surprising result: frame 0 is the most vivid moment of the experiment itself, already under way.',
  SCEN: 'SCEN — opens on the scenario: frame 0 drops the viewer straight into the situation the first line describes, from their point of view.',
  TACTIC: 'TACTIC — opens on the tactic being used on the viewer: frame 0 is someone doing it toward the camera, over the shoulder of the target.',
  MYTH: 'MYTH — opens on the popular claim being struck out: frame 0 is a macro insert of a hand drawing a thick red line through a handwritten note (the writing need not be legible), then the evidence.',
  LIST: 'LIST — opens on the count: frame 0 shows three of something lined up or three fingers raised, and every item gets its own shot. The app overlays the numerals.',
  DEFENSE: 'DEFENSE — opens on what to do: frame 0 is the character already doing the defensive action, mid-motion, before any explanation.',
};

/** The first shot's prompt per Short format. */
export const OPENING_PROMPTS: Record<string, string> = {
  STUDY: 'Whip pan. The most vivid moment of the experiment, already under way',
  SCEN: "Handheld drift. Point of view: the viewer's own moment, exactly as the first line puts it",
  TACTIC: 'Over-shoulder shot. Someone uses the tactic straight toward the camera',
  MYTH: 'Macro insert. A hand draws a thick red line through a handwritten note',
  LIST: 'Slow push in. Three everyday objects lined up in a row',
  DEFENSE: 'Whip pan. The character already doing the defensive action, mid-motion',
};

const LIST_NUMBER = new RegExp(`^(${['one', 'two', 'three', 'four', 'five', 'six', 'seven'].join('|')})\\s*[:,.]\\s*`, 'i');

export const CATCHPHRASE_WORDS = countWords(CATCHPHRASE);

/** Lighting a Short's shots share, picked from its order. */
export const SHORT_LIGHTING = [
  'soft morning light',
  'warm golden hour',
  'night, a warm lamp',
  'rain on the window, cool light',
  'indoor tungsten',
];

export interface V2Beat {
  beat: 'hook' | 'mechanism' | 'reframe' | 'item' | 'closer';
  line: string;
  on_screen?: string;
}

const VARIETY_NOTE =
  '\n- Variety: at least 8 distinct visuals, two or more settings, one close-up of a prop and one image of the metaphor; one clip supplies at most two visuals, the second framed clearly differently.';

const TACTIC_PREFIX = /^(\d+\.|Myth \d+ —|Real \d+ —)\s*/i;

/** Lines grouped into pieces of at least `size` words; a short tail joins the last piece. */
function chunk(lines: string[], size: number): string[] {
  const out: string[] = [];
  let cur: string[] = [];
  for (const l of lines) {
    cur.push(l);
    if (countWords(cur.join(' ')) >= size) {
      out.push(cur.join(' '));
      cur = [];
    }
  }
  if (cur.length) {
    if (!out.length || !(countWords(cur.join(' ')) < size / 2)) out.push(cur.join(' '));
    else out[out.length - 1] = `${out[out.length - 1]} ${cur.join(' ')}`;
  }
  return out;
}

/** The on-screen card for list item `n`: its short name, or just the number. */
export function itemCard(line: string, n: number, next?: string): string {
  const own = line.replace(LIST_NUMBER, '').replace(/["“”]/g, '').replace(/[.!?]+$/, '').trim();
  let label = own;
  if (!own && next) {
    const nextLabel = next.replace(/["“”]/g, '').replace(/[.!?]+$/, '').trim();
    if (textWords(nextLabel).length <= 3) label = nextLabel;
  }
  const words = textWords(label);
  return words.length && words.length <= 5 ? `${n}. ${label.toUpperCase()}` : String(n);
}

/** A v2 Short's narration as script beats: hook, mechanism, list items, reframe, sign-off. */
export function v2ShortBeats(e: any): V2Beat[] {
  const lines = e.narration
    .split('\n')
    .map((l: string) => l.trim())
    .filter(Boolean);
  if (lines.length >= 3 && (e.visual_beats == null ? lines.length : e.visual_beats.length) === 3) {
    const last = lines[lines.length - 1];
    const signoff =
      e.ending === 'SIGNOFF' && endsWithCatchphrase(last) && countWords(last) <= CATCHPHRASE_WORDS + 1 ? last : '';
    const body: string[] = signoff ? lines.slice(0, -1) : lines;
    return [
      { beat: 'hook', line: body[0] },
      ...body.slice(1, -1).map((line): V2Beat => ({ beat: 'mechanism', line })),
      ...(body.length > 1 ? [{ beat: 'reframe' as const, line: body[body.length - 1] }] : []),
      ...(signoff ? [{ beat: 'closer' as const, line: signoff }] : []),
    ];
  }
  const all = sentences(e.narration);
  const { body, signoff } =
    e.ending === 'SIGNOFF' && endsWithCatchphrase(e.narration)
      ? { body: all.slice(0, -2), signoff: all.slice(-2).join(' ') }
      : { body: all, signoff: '' };
  if (!body.length) return [{ beat: 'hook', line: e.narration }];
  const out: V2Beat[] = [{ beat: 'hook', line: body[0] }];
  const rest = body.slice(1);
  const items = e.format !== 'LIST' ? [] : rest.map((l, i) => (LIST_NUMBER.test(l) ? i : -1)).filter((i) => i >= 0);
  const mechanisms = (ls: string[]) => chunk(ls, 20).map((line): V2Beat => ({ beat: 'mechanism', line }));
  if (!(items.length >= 2)) {
    if (rest.length) {
      out.push(...mechanisms(rest.slice(0, -1)));
      out.push({ beat: 'reframe', line: rest[rest.length - 1] });
    }
  } else {
    if (items[0] > 0) out.push(...mechanisms(rest.slice(0, items[0])));
    const gaps = items.slice(0, -1).map((v, i) => items[i + 1] - v);
    const avg = Math.max(
      1,
      Math.min(Math.round(gaps.reduce((a, b) => a + b, 0) / gaps.length), rest.length - items[items.length - 1] - 1),
    );
    items.forEach((start, i) => {
      const end = i + 1 < items.length ? items[i + 1] : start + avg;
      out.push({ beat: 'item', line: rest.slice(start, end).join(' '), on_screen: itemCard(rest[start], i + 1, rest[start + 1]) });
    });
    const tail = rest.slice(items[items.length - 1] + avg);
    if (tail.length > 1) out.push(...mechanisms(tail.slice(0, -1)));
    if (tail.length) out.push({ beat: 'reframe', line: tail[tail.length - 1] });
  }
  if (signoff) out.push({ beat: 'closer', line: signoff });
  return out;
}

/** The lighting for a Short: by its order, or a hash of its id. */
export function lightingFor(order: number | null | undefined, id: string): string {
  const seed = order ?? [...id].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7);
  return SHORT_LIGHTING[seed % SHORT_LIGHTING.length];
}

/** A v2 Short as the legacy topic view the generator expects. */
export function v2ShortView(e: any): any {
  const beats = v2ShortBeats(e);
  const rich = Boolean(e.settings_pool?.length || e.insert_props?.length || e.metaphor);
  let brief: Record<string, unknown> | undefined;
  if (rich || e.visual_beats?.length) {
    brief = {
      setting_arc: (e.settings_pool ?? []).slice(0, 3),
      must_show: [
        ...(e.insert_props ?? []).map((p: string) => `${p} (cutaway)`),
        ...(e.metaphor ? [`a symbolic image: ${e.metaphor} (cutaway)`] : []),
      ],
      ...(e.visual_beats?.length ? { beats: e.visual_beats } : {}),
      ...(e.character_looks?.length ? { character_looks: e.character_looks } : {}),
    };
  }
  const lighting = lightingFor(e.order, e.id);
  const words = countWords(beats.map((b) => b.line ?? '').join(' '));
  return {
    kind: 'short',
    id: e.id,
    title: e.title,
    framing: 'identity',
    format: e.format === 'LIST' ? 'rapid_list' : 'single',
    length_s: Math.round(words / WORDS_PER_SECOND),
    concept: e.effect ?? e.title,
    hook: beats[0]?.line ?? '',
    beats_hint: '',
    cta_question: '',
    tag_line: '',
    priority: 1,
    hook_card: e.hook_text,
    openingPrompt: OPENING_PROMPTS[e.format],
    plannerBrief: `- Pillar: ${e.pillar}\n- Format: ${FORMAT_OPENINGS[e.format]}${e.effect ? `\n- About: ${e.effect}` : ''}\n- Light: ${lighting}${rich ? VARIETY_NOTE : ''}`,
    lighting,
    ...(brief ? { visual_brief: brief } : {}),
    script: { source: 'bank', word_count: words, loops_into_hook: false, beats },
  };
}

/** A v2 long-form as the legacy topic view the generator expects. */
export function v2LongView(e: any): any {
  const words = countWords(longNarration(e));
  return {
    kind: 'long',
    id: e.id,
    title: e.title,
    framing: 'identity',
    target_min: e.target_min ?? Math.round(words / WORDS_PER_SECOND / 60),
    cold_open: '',
    chapters: e.chapters.map((c: any) => ({ title: c.title, concept: c.title })),
    closing_idea: '',
    cta_question: '',
    priority: 1,
    plannerBrief: `- Pillar: ${e.pillar}${e.effect ? `\n- About: ${e.effect}` : ''}\n- Long-form, ${e.chapters.length} chapters; the first chapter is the intro and opens the video.`,
    script: { source: 'bank', word_count: words, cold_open: '', chapters: e.chapters.map((c: any) => ({ ...c })), closing: '' },
  };
}

/** The bank fields a generated Short keeps for publishing and checks. */
export function finishV2Short(e: any, script: any): any {
  const all = sentences(e.narration);
  const { signoff } =
    e.ending === 'SIGNOFF' && endsWithCatchphrase(e.narration)
      ? { signoff: all.slice(-2).join(' ') }
      : { signoff: '' };
  return {
    ...script,
    hookText: e.hook_text,
    hookCard: e.hook_text,
    loopBridge: undefined,
    ctaQuestion: undefined,
    tagLine: undefined,
    tactic: e.effect ?? script.tactic,
    hashtags: e.hashtags ?? [],
    bankV2: {
      pillar: e.pillar,
      format: e.format,
      ending: e.ending,
      hookText: e.hook_text,
      ...(e.hook_text_pov ? { hookTextPov: e.hook_text_pov } : {}),
      ...(e.test_hook ? { testHook: e.test_hook } : {}),
      ...(e.test_profile ? { testProfile: e.test_profile } : {}),
      source: e.source,
      relatedLongform: e.related_longform,
      signoffWords: signoff ? countWords(signoff) : 0,
      ...(e.effect ? { effect: e.effect } : {}),
      ...(e.hook_spoken ? { hookSpoken: e.hook_spoken } : {}),
      ...(e.hook_onscreen ? { hookOnscreen: e.hook_onscreen } : {}),
      ...(e.beats ? { beats: e.beats } : {}),
      ...(e.loop_line ? { loopLine: e.loop_line } : {}),
      ...(e.feeds_longform ? { feedsLongform: e.feeds_longform } : {}),
      ...(e.pinned_comment ? { pinnedComment: e.pinned_comment } : {}),
      ...(e.virality ? { virality: e.virality } : {}),
      ...(e.settings_pool?.length ? { settingsPool: e.settings_pool } : {}),
      ...(e.source_line ? { sourceLine: e.source_line } : {}),
      ...(e.visual_beats?.length ? { visualBeats: e.visual_beats } : {}),
      ...(e.insert_props?.length ? { insertProps: e.insert_props } : {}),
      ...(e.metaphor ? { metaphor: e.metaphor } : {}),
      ...(e.hook_alt ? { hookAlt: e.hook_alt, hookDefault: script.beats[0]?.text ?? '' } : {}),
      ...(e.title_alt ? { titleAlt: e.title_alt } : {}),
    },
  };
}

/** The bank fields a generated long-form keeps. */
function longV2Info(e: any): Record<string, unknown> {
  return {
    pillar: e.pillar,
    sources: e.sources,
    thumbnailText: e.thumbnail_text,
    publishOrder: e.publish_order,
    ...(e.effect ? { effect: e.effect } : {}),
    ...(e.hashtags ? { hashtags: e.hashtags } : {}),
    ...(e.format_type ? { formatType: e.format_type } : {}),
    ...(e.hoot_hook_pose ? { hootHookPose: e.hoot_hook_pose } : {}),
    ...(e.next_video ? { nextVideo: e.next_video } : {}),
    ...(e.comment_question ? { commentQuestion: e.comment_question } : {}),
    ...(e.title_alts ? { titleAlts: e.title_alts } : {}),
    ...(e.thumbnail_texts ? { thumbnailTexts: e.thumbnail_texts } : {}),
    ...(e.thumbnail_concepts ? { thumbnailConcepts: e.thumbnail_concepts } : {}),
    ...(e.cold_open ? { coldOpenField: e.cold_open } : {}),
    ...(e.interrupts ? { interrupts: e.interrupts } : {}),
    ...(e.feeder_shorts ? { feederShorts: e.feeder_shorts } : {}),
    ...(e.flagship ? { flagship: true } : {}),
    ...(e.item_count ? { itemCount: e.item_count } : {}),
    ...(e.visual_plan ? { visualPlan: e.visual_plan } : {}),
    ...(e.hook_alt ? { hookAlt: e.hook_alt } : {}),
    ...(e.pattern_interrupt ? { patternInterrupt: e.pattern_interrupt } : {}),
    ...(e.recap_line ? { recapLine: e.recap_line } : {}),
    ...(e.care_line ? { careLine: e.care_line } : {}),
    ...(e.next_teaser ? { nextTeaser: e.next_teaser } : {}),
    ...(e.structure ? { structure: e.structure } : {}),
    ...(e.screenplay?.scenes?.length ? { sceneCount: e.screenplay.scenes.length } : {}),
  };
}

const tacticsOf = (e: any): string[] => e.chapters.map((c: any) => c.title.replace(TACTIC_PREFIX, ''));
const chapterInputs = (script: any) =>
  script.chapters.map((c: any) => ({ index: c.index, title: c.title, narration: c.narration }));

/** A generated long-form's visuals: from its screenplay, its shot list, or the hybrid plan. */
export function finishV2Long(e: any, script: any): any {
  const sp = e.screenplay;
  const nextTitle = e.next_video ? bundledTitle(e.next_video) : undefined;
  if (!sp) {
    const list = SHOT_LISTS[e.id];
    const plan = list
      ? planFromShotList(list, chapterInputs(script), { overrides: SHOT_OVERRIDES[e.id], nextTitle })
      : null;
    const useList = Boolean(plan && !plan.problems.length);
    const heroes = heroChapters(script.chapters.length);
    const chapters = script.chapters.map((c: any, i: number) => ({
      ...c,
      visuals: useList
        ? plan!.chapters[i]
        : chapterVisuals({
            index: c.index,
            narration: c.narration,
            heroA: c.heroA,
            heroB: c.heroB,
            stillPrompt: c.stillPrompt,
            intro: i === 0,
            hero: heroes.includes(i),
            characterDescription: script.characterDescription,
          }),
    }));
    return {
      ...script,
      ...(useList ? { characterDescription: '' } : {}),
      coldOpen: '',
      closingSynthesis: '',
      chapters,
      ctaQuestion: undefined,
      tactics: tacticsOf(e),
      tags: [],
      wordTarget: countWords(longNarration(e)),
      bankV2: longV2Info(e),
    };
  }
  const budget = sp.flow_budget_credits ?? DEFAULT_CHANNEL_CONFIG.flow.longformCap;
  const plan = planScreenplay(sp, chapterInputs(script), {
    budget,
    creditsPerClip: DEFAULT_CHANNEL_CONFIG.flow.creditsPerClip,
    nextTitle,
    ...(e.visual_plan ? { visualPlan: e.visual_plan } : {}),
    ...(e.flagship ? { maxAnchors: FLAGSHIP_ANCHORS } : {}),
  });
  return {
    ...script,
    characterDescription: '',
    coldOpen: '',
    closingSynthesis: '',
    chapters: script.chapters.map((c: any, i: number) => ({ ...c, visuals: plan.chapters[i], cues: plan.cues[i] })),
    ctaQuestion: undefined,
    tactics: tacticsOf(e),
    tags: [],
    wordTarget: countWords(longNarration(e)),
    bankV2: {
      ...longV2Info(e),
      flowBudget: budget,
      cast: sp.cast,
      music: sp.music.map((m: any) => ({ from: m.from_chapter, mood: m.mood })),
      castShareMax: sp.cast_share_max ?? 0.35,
      reenactChapters: sp.reenactments.map((r: any) => r.chapter),
      varietyScores: plan.variety.map((v) => v.score),
      cueCounts: {
        stat: sp.stat_cards.length,
        hoot: sp.hoot_moments.length,
        guess: sp.guess_pauses.length,
        silence: sp.silence_beats.length,
      },
      ...(plan.problems.length ? { planNotes: plan.problems } : {}),
    },
  };
}

export function longClipCount(script: any): number {
  return script.chapters.reduce(
    (n: number, c: any) =>
      n + (c.visuals ? c.visuals.filter((v: any) => v.kind === 'clip').length : (c.heroA ? 1 : 0) + (c.heroB ? 1 : 0)),
    0,
  );
}

export function longCardCount(script: any): number {
  return script.chapters.reduce(
    (n: number, c: any) => n + (c.visuals ? c.visuals.filter((v: any) => v.kind === 'card').length : 0),
    0,
  );
}

export function longStillCount(script: any): number {
  return script.chapters.reduce(
    (n: number, c: any) =>
      n + (c.visuals ? c.visuals.filter((v: any) => v.kind === 'still' && !v.reuse).length : c.stillPrompt ? 1 : 0),
    0,
  );
}

/** The script with the bank's new titles and narration, re-planned; null if the chapter count changed. */
export function refreshLongFromBank(script: any, e: any): { script: any; changed: string[] } | null {
  if (script.chapters.length !== e.chapters.length) return null;
  const changed: string[] = [];
  const chapters = script.chapters.map((c: any, i: number) => {
    const b = e.chapters[i];
    if (c.narration === b.narration && c.title === b.title) return c;
    if (c.narration !== b.narration) changed.push(String(c.index));
    return { ...c, title: b.title, narration: b.narration };
  });
  let next = finishV2Long(e, { ...script, title: e.title, chapters, coldOpen: '', closingSynthesis: '' });
  if (script.chapters.every((c: any) => !c.visuals?.length)) {
    next = { ...next, chapters: next.chapters.map((c: any) => ({ ...c, visuals: undefined })) };
  }
  return { script: next, changed };
}

/** Whether the bank's long-form no longer matches the project's script. */
export function longProjectStale(script: any, e: any): boolean {
  return (
    script.chapters.length !== e.chapters.length ||
    script.chapters.some((c: any, i: number) => c.narration !== e.chapters[i].narration || c.title !== e.chapters[i].title) ||
    script.title !== e.title
  );
}
