import { z } from 'zod';
import { TYPED_MAX_SHOT_SECONDS } from './shortFormat';
import { CALM_SHOT_MAX_SECONDS, moodOf, type ShortStyle } from './styleProfiles';
import { INTERRUPT_BEAT, beatAt, reverseMove, sceneShots, usableBeats } from './sceneShots';
import { longScriptFromBank, shortScriptFromBank, spokenBeats } from './bankScript';
import { WORDS_PER_SECOND } from './guardrails';
import { mentionsMascot, stripMascotFromPrompt } from './promptHygiene';
import { CHARACTER_AND_VISUAL_RULES, FRAMING_RULES, SHOT_HARD_RULES, clipRule } from './prompts';
import { ShortShotSchema } from './scriptSchemas';
import { DEFAULT_CLIP_BUDGET, MAX_SHOT_SECONDS, MIN_SHOTS, STATIC_VERBS, type Shot } from './shots';
import { continuationPrefix, withStyleLock } from './styleLock';
import { isV2 } from './topicBank';
import { finishV2Long, finishV2Short, v2LongView, v2ShortView } from './v2Script';

/**
 * Plans the pictures for a script whose narration is already written and locked.
 */

const countWords = (s: string) => s.trim().split(/\s+/).filter(Boolean).length;

/** Keys whose values are narration; anything under them in a plan is discarded. */
const NARRATION_KEYS = new Set([
  'text', 'line', 'lines', 'narration', 'hook', 'hookline', 'hooktext', 'loopbridge', 'voiceover', 'voice', 'script',
  'spoken', 'dialogue', 'caption', 'captions', 'cardtext', 'on_screen', 'onscreen', 'title', 'titleoptions', 'coldopen',
  'closing', 'closingsynthesis', 'minihook', 'mechanism', 'microreframe',
]);

export const ShortPlanSchema = z.object({
  characterDescription: z.string().min(1),
  archetype: z.string().min(1),
  beats: z.array(z.object({ beat: z.number(), shots: z.array(ShortShotSchema).min(1) })).min(1),
});

export const LongPlanSchema = z.object({
  characterDescription: z.string().min(1),
  archetype: z.string().min(1),
  chapters: z
    .array(
      z.object({
        chapter: z.number(),
        heroA: z.string().min(1),
        heroB: z.string().min(1),
        stillPrompt: z.string().min(1),
      }),
    )
    .min(1),
});

export type ShortPlan = z.infer<typeof ShortPlanSchema>;
export type LongPlan = z.infer<typeof LongPlanSchema>;

const SHOT_RESPONSE = {
  type: 'OBJECT',
  properties: {
    source: {
      type: 'STRING',
      enum: ['clip', 'still'],
      description: 'clip = generated video, budgeted. still = one image the app pushes in on. Cutaways are always still.',
    },
    setting: { type: 'STRING', description: 'Where the shot happens: one of the 2-3 settings, named identically each time.' },
    subject: { type: 'STRING', description: 'What is on screen: the character, or an object for a cutaway.' },
    action: { type: 'STRING', description: 'What changes on screen. A verb of motion, never a pose.' },
    durationSec: { type: 'NUMBER', description: 'Screen time in seconds. Never more than 3.' },
    isCutaway: { type: 'BOOLEAN', description: 'True when the character is not in frame at all.' },
    clipPrompt: {
      type: 'STRING',
      description: 'The full silent Veo/Imagen prompt: camera move first, ending with the style lock.',
    },
  },
  required: ['source', 'setting', 'subject', 'action', 'durationSec', 'isCutaway', 'clipPrompt'],
};

export const SHORT_PLAN_RESPONSE_SCHEMA = {
  type: 'OBJECT',
  properties: {
    characterDescription: {
      type: 'STRING',
      description: 'Face, hair and wardrobe as one reusable phrase. Never the setting.',
    },
    archetype: { type: 'STRING', description: 'Two-to-four word character type.' },
    beats: {
      type: 'ARRAY',
      description: 'One entry per narrated beat, in order.',
      items: {
        type: 'OBJECT',
        properties: {
          beat: { type: 'NUMBER', description: 'The beat number from the brief.' },
          shots: { type: 'ARRAY', items: SHOT_RESPONSE },
        },
        required: ['beat', 'shots'],
      },
    },
  },
  required: ['characterDescription', 'archetype', 'beats'],
};

export const LONG_PLAN_RESPONSE_SCHEMA = {
  type: 'OBJECT',
  properties: {
    characterDescription: {
      type: 'STRING',
      description: 'Face, hair and wardrobe as one reusable phrase. Never the setting.',
    },
    archetype: { type: 'STRING', description: 'Two-to-four word character type.' },
    chapters: {
      type: 'ARRAY',
      description: 'One entry per chapter, in order.',
      items: {
        type: 'OBJECT',
        properties: {
          chapter: { type: 'NUMBER', description: 'The chapter number from the brief.' },
          heroA: { type: 'STRING', description: '8-10 s clip: the character starts the tension. Ends with the style lock.' },
          heroB: {
            type: 'STRING',
            description: '8-10 s clip: the same character escalates it. Opens with the continuity phrase.',
          },
          stillPrompt: { type: 'STRING', description: 'Symbolic still with no people in frame. Ends with the style lock.' },
        },
        required: ['chapter', 'heroA', 'heroB', 'stillPrompt'],
      },
    },
  },
  required: ['characterDescription', 'archetype', 'chapters'],
};

const PLANNER_ROLE =
  'You are the shot planner for "The Mind Files", a YouTube psychology channel whose footage\nis anime. The MASCOT, Professor Hoot, is composited onto the finished video afterwards as\nan overlay, so he must never appear in any prompt you write.';
const NARRATION_LOCKED =
  'THE NARRATION IS FINISHED AND LOCKED. It was written and reviewed outside the app and is\nvoiced word for word. You plan PICTURES ONLY. Do not write, rewrite, add, shorten or return\nany narration, caption or on-screen text — there is no field for it, and anything like it\nyou send is discarded.';
/** Framing labels, not character types; never treated as a repeated archetype. */
const NOT_ARCHETYPES = new Set(['identity', 'self callout', 'test', 'relationship', 'borrowed']);
const CAMERA_MOVE =
  /\b(push(?:es|ing)?[- ]in|pull(?:s|ing)?[- ](?:back|out)|rack(?:s|ing)?[- ]focus|whip[- ]pan|handheld|drift(?:s|ing)?|overhead|top[- ]down|macro|over[- ](?:the[- ])?shoulder|dolly|tracking|crane|tilt(?:s|ing)?|pan(?:s|ning)?|orbit(?:s|ing)?|zoom(?:s|ing)?)\b/i;
const CAMERA_MOVES = ['Slow push in', 'Handheld drift', 'Rack focus', 'Whip pan', 'Overhead shot', 'Macro insert', 'Over-shoulder shot'];
const CAST_RULES =
  'CAST — one protagonist carries the whole video:\n- Choose ONE character and describe them once in "characterDescription": face, hair and wardrobe\n  only, never the setting. Every prompt that shows them restates that description identically.\n- Relatable, stylish, everyday wardrobe. No occupational costume unless the topic is that job.\n- Anyone else the story needs (parents, an uncle, friends, colleagues) appears ONLY as a\n  soft-focus background figure, over the protagonist\'s shoulder, from behind (back of the head),\n  or on a phone screen — never as a second face in focus. Continuity hangs on one character.\n- Return "archetype": a two-to-four word label for the character type you chose.';

const normalise = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z\s]/g, ' ')
    .replace(/\b(the|a|an)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
const staticVerb = (action: string) => STATIC_VERBS.find((v) => action.toLowerCase().includes(v));
const settingKey = (setting: string) => normalise(setting);

export interface PlannedBeat {
  number: number;
  kind: string;
  line: string;
  seconds: number;
  minShots: number;
  onScreen?: string;
}

/** Each narrated beat with how long it runs and the fewest shots it needs. */
function beatPlan(e: any): PlannedBeat[] {
  const beats: PlannedBeat[] = spokenBeats(e).map((b: any, i: number) => {
    const seconds = countWords(b.line) / WORDS_PER_SECOND;
    return {
      number: i + 1,
      kind: b.beat,
      line: b.line,
      seconds: Math.round(seconds * 10) / 10,
      minShots: Math.max(1, Math.ceil(seconds / MAX_SHOT_SECONDS)),
      ...(b.on_screen ? { onScreen: b.on_screen } : {}),
    };
  });
  let total = beats.reduce((n, b) => n + b.minShots, 0);
  while (total < MIN_SHOTS && beats.length) {
    const roomiest = beats.reduce((a, b) => (b.seconds / b.minShots > a.seconds / a.minShots ? b : a));
    roomiest.minShots += 1;
    total += 1;
  }
  return beats;
}

/** The beats whose character shots the clip budget goes to. */
function clipTargets(e: any, beats: PlannedBeat[]): number[] {
  const last = beats.length - 1;
  const visual = usableBeats(e.visual_brief?.beats ?? e.visual_brief?.shots);
  let targets: number[];
  if (visual && visual.length > INTERRUPT_BEAT) {
    targets = [0, beatAt(beats, (2 * INTERRUPT_BEAT + 0.5) / (2 * visual.length)), last];
  } else if (e.format === 'rapid_list') {
    const items = beats.flatMap((b, i) => (b.kind === 'item' ? [i] : []));
    targets = [0, items.length ? items[Math.floor((items.length - 1) / 2)] : Math.floor(last / 2), last];
  } else if (e.format === 'test') {
    const reveal = beats.findIndex((b, i) => i > 0 && b.kind !== 'closer' && b.kind !== 'reframe');
    targets = [0, reveal > 0 ? reveal : last, last];
  } else {
    targets = [0, Math.max(Math.min(1, last), Math.floor(last / 2)), last];
  }
  return [...new Set(targets.filter((t) => t >= 0 && t <= last))];
}

/** Removes anything narration-like from a planner's answer. */
function stripNarration(value: unknown): { value: any; dropped: string[] } {
  const dropped = new Set<string>();
  const walk = (v: unknown): unknown => {
    if (Array.isArray(v)) return v.map(walk);
    if (!v || typeof v !== 'object') return v;
    const out: Record<string, unknown> = {};
    for (const [k, val] of Object.entries(v)) {
      if (NARRATION_KEYS.has(k.toLowerCase())) dropped.add(k);
      else out[k] = walk(val);
    }
    return out;
  };
  return { value: walk(value), dropped: [...dropped] };
}

const avoidArchetypes = (recent: string[]) => {
  const avoid = recent.filter((a) => !NOT_ARCHETYPES.has(normalise(a)));
  return avoid.length
    ? `\n- "archetype" must NOT be any of these character types, used in the last 10 videos:\n${avoid.map((a) => `    - ${a}`).join('\n')}`
    : '';
};

const videoBlock = (e: any) =>
  e.plannerBrief
    ? `VIDEO:\n- Title: ${e.title}\n${e.plannerBrief}`
    : `VIDEO:\n- Title: ${e.title}\n${e.kind === 'short' ? `- Concept: ${e.concept}\n` : ''}- Framing: ${FRAMING_RULES[e.framing]}${
        e.notes ? `\n- Notes: ${e.notes}` : ''
      }`;

const rejectedBlock = (rejections: string[]) =>
  rejections.length
    ? `\n\nYOUR PREVIOUS PLAN WAS REJECTED. Fix every one of these and return a complete new plan:\n${rejections
        .map((r) => `- ${r}`)
        .join('\n')}`
    : '';

export function shortPlannerInstruction(
  e: any,
  recentArchetypes: string[],
  clipBudget: number = DEFAULT_CLIP_BUDGET,
  rejections: string[] = [],
): string {
  const beats = beatPlan(e);
  const hold =
    e.format === 'test'
      ? (e.script?.beats.find((b: any) => b.beat === 'hold')?.duration_s ?? e.stimulus_hold_s ?? 0)
      : 0;
  const beatLines = beats
    .map((b) => {
      const card = b.onScreen
        ? `\n   The app overlays the card "${b.onScreen}" on this beat: its own shot(s) must show exactly that.`
        : '';
      const stimulus =
        hold && b.number === 1
          ? `\n   → Then the app shows the test stimulus for ${hold} s in silence. That is NOT a shot: plan nothing for it.`
          : '';
      return `BEAT ${b.number} — ${b.kind.toUpperCase()}, ${b.seconds.toFixed(1)} s on screen, AT LEAST ${b.minShots} shot${
        b.minShots === 1 ? '' : 's'
      }:\n   "${b.line}"${card}${stimulus}`;
    })
    .join('\n');
  const vb = e.visual_brief;
  let brief = 'VISUAL BRIEF: none — choose 2-3 settings that suit the story, in story order.';
  if (vb) {
    const arc: string[] = vb.setting_arc;
    const settings =
      arc.length === 1
        ? `- Setting: ${arc[0]}. Every Short uses 2-3 settings, so add one or two micro-locations in or right\n  next to it (a different corner, a window, a doorway), in story order.`
        : arc.length
          ? `- Settings, in story order: ${arc.join(' → ')}. You may substitute similar settings, but keep the\n  count and the order.`
          : '- Settings: choose 2-3 that suit the story, in story order.';
    const mustShow = (vb.must_show as string[]).map((m) => `    - ${m}`).join('\n') || '    - (nothing specific)';
    brief = `VISUAL BRIEF (guidance, not a shot list):\n${settings}\n- Must appear on screen somewhere, so the picture matches the words:\n${mustShow}`;
  }
  const cast = `${CAST_RULES}${avoidArchetypes(recentArchetypes)}`;
  const rapid = e.format === 'rapid_list' ? '\n- Each item beat gets its own shot(s), showing that item happening.' : '';
  const frame0 = e.plannerBrief
    ? '\n- Frame 0 is the first shot of beat 1 and follows the Format line above. It is never a title\n  card and never a black frame: the app overlays the hook text on it.'
    : '';
  let clips: string;
  if (!(clipBudget <= 0)) {
    const targets = clipTargets(e, beats);
    while (targets.length < clipBudget && targets.length) {
      const last = targets[targets.length - 1];
      targets.push(last === 0 && beats.length > 1 ? 1 : last);
    }
    const labels = targets.map((i) => `beat ${i + 1} (${beats[i].kind})`);
    clips = `Use EXACTLY ${clipBudget} clip${clipBudget === 1 ? '' : 's'} in the whole Short — more is unaffordable, fewer leaves the Short without motion.\n  Put ${
      clipBudget === 1 ? 'it' : 'them'
    } on ${labels.slice(0, clipBudget).join(', then ')}: one character shot each. Spend them on shots where the character moves and carries the performance, never on a cutaway.`;
  } else {
    clips = clipRule(0);
  }
  return `${PLANNER_ROLE}\n\nTASK: Plan the cast and the full shot list for one vertical Short.\n\n${NARRATION_LOCKED}\n\n${videoBlock(
    e,
  )}\n\nLOCKED NARRATION, beat by beat, with how long each beat is on screen:\n${beatLines}\n\n${brief}\n\n${cast}\n\n${CHARACTER_AND_VISUAL_RULES}\n\nSHOT LIST — a beat is a unit of narration, a shot is a unit of picture:\n- Every beat gets AT LEAST the number of shots stated above: nothing holds longer than\n  ${MAX_SHOT_SECONDS} seconds. Each sentence lands on a new picture.${rapid}\n- The hook opens on the behaviour itself, not on someone talking. The last beat ends on a\n  physical payoff.${frame0}\n\nBUDGET — every shot sets "source":\n- "clip" is generated video and EXPENSIVE. ${clips}\n- "still" is one generated image the app pushes in on — for a prop, a screen, a hand or a\n  closing door it is indistinguishable from a short clip. Every other shot is a still.\n- EVERY cutaway is a "still". No exceptions.\n\n${SHOT_HARD_RULES}\n\nRETURN "characterDescription", "archetype" and "beats": exactly ${
    beats.length
  } entries, one per\nnarrated beat above, in order, each with "beat" (its number) and "shots".${rejectedBlock(rejections)}`;
}

export function longPlannerInstruction(e: any, recentArchetypes: string[], rejections: string[] = []): string {
  const script = e.script;
  const chapterLines = (e.chapters as { title: string; concept: string }[])
    .map((c, i) => {
      const narration = script?.chapters?.[i]?.narration;
      const title = script?.chapters?.[i]?.title ?? c.title;
      return `CHAPTER ${i + 1} — "${title}" — concept: ${c.concept}${
        narration ? `\n   Narration (locked, for reference): "${narration}"` : ''
      }`;
    })
    .join('\n');
  const coldOpen = (script?.cold_open ?? e.cold_open)
    ? `\n- Cold open (voiced over chapter 1's clips): "${script?.cold_open ?? e.cold_open}"`
    : '';
  const cast = `${CAST_RULES}${avoidArchetypes(recentArchetypes)}`;
  return `${PLANNER_ROLE}\n\nTASK: Plan the cast and the visuals for one long-form 16:9 deep dive.\n\n${NARRATION_LOCKED}\n\n${videoBlock(
    e,
  )}${coldOpen}\n\n${chapterLines}\n\nPER-CHAPTER VISUALS — three distinct assets for every chapter, built from its title, concept\nand narration:\n  * heroA: ~8-10 s clip. The protagonist physically starts the chapter's moment — the tension begins.\n  * heroB: ~8-10 s clip. The same person escalating that tension. Describe the action, the framing and the setting only:\n    the app adds the character's identity block itself (CR-77), so do not restate face, hair or wardrobe.\n  * Every chapter takes its own setting from the chapter before; use a cutaway (an object, a screen, a symbolic image) as well as the people.\n  * stillPrompt: a symbolic environmental still with NO people in frame — an object or space\n    that carries the chapter's idea as a metaphor.\n- Name a camera move in every prompt: push in, rack focus, whip pan, handheld drift, overhead,\n  macro insert, over-shoulder. Actions are verbs of motion or change, never a held pose.\n- Vary the setting from chapter to chapter.\n\n${cast}\n\n${CHARACTER_AND_VISUAL_RULES}\n\nRETURN "characterDescription", "archetype" and "chapters": exactly ${
    e.chapters.length
  } entries, in order, each\nwith "chapter" (its number), "heroA", "heroB" and "stillPrompt".${rejectedBlock(rejections)}`;
}

function sameArchetype(a: string, b: string): boolean {
  const x = normalise(a);
  const y = normalise(b);
  if (!x || !y) return false;
  return x === y || ` ${x} `.includes(` ${y} `) || ` ${y} `.includes(` ${x} `);
}

const repeatedArchetype = (recent: string[], archetype: string) =>
  recent.filter((a) => !NOT_ARCHETYPES.has(normalise(a))).find((a) => sameArchetype(a, archetype));

export function shortPlanIssues(e: any, plan: ShortPlan, recentArchetypes: string[]): string[] {
  const beats = beatPlan(e);
  const issues: string[] = [];
  if (plan.beats.length !== beats.length) {
    issues.push(`Return exactly ${beats.length} beats, one per narrated beat; you returned ${plan.beats.length}.`);
  }
  const sorted = [...plan.beats].sort((a, b) => a.beat - b.beat);
  beats.forEach((b, i) => {
    const n = sorted[i]?.shots.length ?? 0;
    if (n < b.minShots) {
      issues.push(`Beat ${b.number} runs ${b.seconds.toFixed(1)} s and needs at least ${b.minShots} shots; you gave ${n}.`);
    }
  });
  const shots = sorted.flatMap((b) => b.shots) as any[];
  if (!shots.some((s) => s.isCutaway)) {
    issues.push('Add at least one cutaway (isCutaway true): a prop, a screen or a hand, with the character out of frame.');
  }
  const settings = new Set(shots.map((s) => settingKey(s.setting)).filter(Boolean));
  if (settings.size < 2) issues.push('Use 2-3 different settings; every shot is in the same one.');
  if (settings.size > 3) {
    issues.push(`Use 2-3 settings, named identically each time; you used ${settings.size}: ${[...settings].join(', ')}.`);
  }
  shots.forEach((s, i) => {
    const pose = staticVerb(s.action);
    if (pose) issues.push(`Shot ${i + 1}'s action "${s.action}" is a pose ("${pose}"). Use a verb of motion or change.`);
    if (!CAMERA_MOVE.test(s.clipPrompt)) issues.push(`Shot ${i + 1}'s prompt names no camera move.`);
    if (s.durationSec > MAX_SHOT_SECONDS) {
      issues.push(`Shot ${i + 1} holds ${s.durationSec} s; the maximum is ${MAX_SHOT_SECONDS}.`);
    }
  });
  if ([plan.characterDescription, ...shots.flatMap((s) => [s.clipPrompt, s.subject, s.action, s.setting])].some(mentionsMascot)) {
    issues.push('Remove every owl, bird and mascot from the plan. Professor Hoot is added later as an overlay.');
  }
  const repeat = repeatedArchetype(recentArchetypes, plan.archetype);
  if (repeat) {
    issues.push(`The archetype "${plan.archetype}" repeats "${repeat}" from the last 10 videos. Choose a different character type.`);
  }
  return issues;
}

export function longPlanIssues(e: any, plan: LongPlan, recentArchetypes: string[]): string[] {
  const issues: string[] = [];
  if (plan.chapters.length !== e.chapters.length) {
    issues.push(`Return exactly ${e.chapters.length} chapters; you returned ${plan.chapters.length}.`);
  }
  plan.chapters.forEach((c, i) => {
    if (!CAMERA_MOVE.test(c.heroA)) issues.push(`Chapter ${i + 1} heroA names no camera move.`);
    if (!CAMERA_MOVE.test(c.heroB)) issues.push(`Chapter ${i + 1} heroB names no camera move.`);
  });
  if ([plan.characterDescription, ...plan.chapters.flatMap((c) => [c.heroA, c.heroB, c.stillPrompt])].some(mentionsMascot)) {
    issues.push('Remove every owl, bird and mascot from the plan. Professor Hoot is added later as an overlay.');
  }
  const repeat = repeatedArchetype(recentArchetypes, plan.archetype);
  if (repeat) {
    issues.push(`The archetype "${plan.archetype}" repeats "${repeat}" from the last 10 videos. Choose a different character type.`);
  }
  return issues;
}

/** A prompt with no mascot in it, a camera move up front and the style lock on the end. */
function safePrompt(prompt: string, fallback: string, move: string): string {
  let p = stripMascotFromPrompt(prompt);
  if (mentionsMascot(p)) p = stripMascotFromPrompt(fallback);
  if (mentionsMascot(p)) p = 'An everyday room, light shifting across it';
  if (!CAMERA_MOVE.test(p)) p = `${move}. ${p}`;
  return withStyleLock(p);
}

function clean(text: string, fallback = ''): string {
  const t = stripMascotFromPrompt(text).trim();
  return mentionsMascot(t) ? fallback : t;
}

/** Hands the clip budget out across the shots, preferring the planner's own clip picks. */
function placeClips(e: any, beats: PlannedBeat[], perBeat: any[][], budget: number): void {
  const wanted = perBeat.map((shots) => shots.map((s) => s.source === 'clip' && !s.isCutaway));
  for (const shots of perBeat) shots.forEach((s, j) => (shots[j] = { ...s, source: 'still' }));
  let left = Math.max(0, budget);
  const firstShotOf = (b: number) => {
    if (left <= 0) return true;
    for (const shots of perBeat) {
      const k = shots.findIndex((s) => s.beat === b && !s.punch);
      if (!(k >= 0)) continue;
      shots[k] = { ...shots[k], source: 'clip' };
      left -= 1;
      break;
    }
    return false;
  };
  const typed = [
    ...new Set(
      perBeat
        .flat()
        .flatMap((s) => (s.beatType && s.beatType !== 'still' && !s.punch && s.beat !== undefined ? [s.beat] : [])),
    ),
  ].sort((a, b) => a - b);
  if (typed.length) {
    for (const b of typed) if (firstShotOf(b)) break;
    return;
  }
  const scenes = [...new Set(perBeat.flat().flatMap((s) => (s.beat !== undefined && !s.punch ? [s.beat] : [])))].sort(
    (a, b) => a - b,
  );
  if (scenes.length) {
    const last = scenes[scenes.length - 1];
    const order = [
      ...new Set([scenes[0], ...(scenes.includes(INTERRUPT_BEAT) ? [INTERRUPT_BEAT] : []), last, ...scenes]),
    ];
    for (const b of order) if (firstShotOf(b)) break;
    return;
  }
  const take = (i: number, preferWanted: boolean) => {
    const shots = perBeat[i];
    let k = -1;
    if (preferWanted) k = shots.findIndex((s, j) => wanted[i][j] && s.source === 'still' && !s.punch);
    if (k < 0) k = shots.findIndex((s) => (!s.isCutaway || s.beat !== undefined) && s.source === 'still' && !s.punch);
    if (!(k >= 0)) return false;
    shots[k] = { ...shots[k], source: 'clip' };
    left -= 1;
    return true;
  };
  const targets = clipTargets(e, beats);
  for (const t of targets) if (left > 0) take(t, true);
  const rest = targets.filter((t) => t !== 0);
  const order = [...rest, ...beats.map((_, i) => i).filter((i) => i !== 0 && !rest.includes(i)), 0];
  const wantsStill = (i: number) => wanted[i].some((w, j) => w && perBeat[i][j].source === 'still');
  for (const i of order) {
    while (left > 0 && wantsStill(i)) {
      if (!take(i, true)) break;
    }
  }
  for (const i of order) {
    while (left > 0 && take(i, false)) {
      // keep filling this beat
    }
  }
}

export interface FinalShortPlan {
  characterDescription: string;
  archetype: string;
  shots: Shot[][];
}

/** The planner's answer made safe and complete: no mascot, enough shots, the clip budget placed, continuity kept. */
export function finaliseShortPlan(
  e: any,
  plan: ShortPlan,
  clipBudget: number = DEFAULT_CLIP_BUDGET,
  style: Partial<ShortStyle> = {},
): FinalShortPlan {
  const calm = style.profile === 'C';
  const beats = beatPlan(e);
  const sorted = [...plan.beats].sort((a, b) => a.beat - b.beat);
  if (sorted.length !== beats.length) {
    throw new Error(`The shot planner returned ${sorted.length} beats for ${beats.length} narrated lines. Try again.`);
  }
  const character = clean(plan.characterDescription);
  let moveIndex = 0;
  const nextMove = () => CAMERA_MOVES[moveIndex++ % CAMERA_MOVES.length];

  const perBeat: any[][] = sorted.map((b, i) => {
    const shots: any[] = (b.shots as any[]).map((s) => ({
      ...s,
      setting: clean(s.setting, 'the scene'),
      subject: clean(s.subject, s.isCutaway ? 'object insert' : 'the character'),
      action: clean(s.action, 'moves through the frame'),
      clipPrompt: s.clipPrompt,
    }));
    const held = shots.some((s) => s.held);
    const typed = shots.some((s) => s.beatType) && !calm && !held;
    if (!held) {
      let k = 0;
      while (
        shots.length < beats[i].minShots ||
        (typed && beats[i].seconds / shots.length > TYPED_MAX_SHOT_SECONDS + 1e-9)
      ) {
        const src = typed ? shots[shots.length - 1] : shots[k % shots.length];
        k += 1;
        shots.push({
          ...src,
          source: 'still',
          action: src.action,
          clipPrompt: `${nextMove()}, a tighter angle on the same moment. ${stripMascotFromPrompt(src.clipPrompt)}`,
          ...(src.beat === undefined
            ? {}
            : { punch: true, interrupt: false, move: src.beatType && src.move ? reverseMove(src.move) : 'zoom_in' }),
        });
      }
    }
    const each = held
      ? Math.round((beats[i].seconds / shots.length) * 10) / 10
      : Math.min(
          calm ? CALM_SHOT_MAX_SECONDS : typed ? TYPED_MAX_SHOT_SECONDS : MAX_SHOT_SECONDS,
          Math.round((beats[i].seconds / shots.length) * 10) / 10,
        );
    return shots.map((s) => ({
      ...s,
      durationSec: s.held && s.planSec !== undefined ? s.planSec : Math.max(0.5, each),
      clipPrompt: s.promptFinal ? s.clipPrompt : safePrompt(s.clipPrompt, `${s.setting}: ${s.action}`, nextMove()),
      source: s.isCutaway && s.beat === undefined ? 'still' : s.source,
    }));
  });

  if (!perBeat.flat().some((s) => s.isCutaway || s.held)) {
    const longest = beats.reduce((best, b, i) => (b.seconds > beats[best].seconds ? i : best), 0);
    const subject =
      e.visual_brief?.must_show.find((m: string) => /cutaway|close|insert/i.test(m)) ??
      e.visual_brief?.must_show[0] ??
      'an object from the scene';
    const setting = perBeat[longest][0]?.setting ?? '';
    perBeat[longest].push({
      source: 'still',
      setting,
      subject: 'object insert',
      action: 'slides into frame',
      durationSec: 0,
      isCutaway: true,
      clipPrompt: safePrompt(
        `Macro insert. Close on ${subject}${setting ? ` in the ${setting}` : ''}, no people in frame`,
        'Macro insert. A close object detail',
        'Macro insert',
      ),
    });
    const each = Math.min(MAX_SHOT_SECONDS, Math.round((beats[longest].seconds / perBeat[longest].length) * 10) / 10);
    perBeat[longest] = perBeat[longest].map((s) => ({ ...s, durationSec: Math.max(0.5, each) }));
  }

  placeClips(e, beats, perBeat, clipBudget);

  let seenClip = false;
  for (const shots of perBeat) {
    for (const [j, s] of shots.entries()) {
      if (s.source !== 'clip' || s.promptFinal) continue;
      if (seenClip && !/^continuation of previous clip/i.test(s.clipPrompt) && character) {
        shots[j] = { ...s, clipPrompt: withStyleLock(`${continuationPrefix(character)}. ${s.clipPrompt}`) };
      }
      seenClip = true;
    }
  }

  const flat = perBeat.flat();
  const firstOfBeat = new Map<number, number>();
  flat.forEach((s, i) => {
    if (s.beat !== undefined && !s.punch && !firstOfBeat.has(s.beat)) firstOfBeat.set(s.beat, i);
  });

  let prev: any = null;
  for (const shots of perBeat) {
    for (const [j, s] of shots.entries()) {
      if (prev && s.beatType === 'still' && prev.beat === s.beat && prev.move && s.move === prev.move) {
        shots[j] = { ...s, move: reverseMove(prev.move) };
      }
      prev = shots[j];
    }
  }

  const used = new Map<number, number>();
  for (const shots of perBeat) {
    for (const [j, s] of shots.entries()) {
      const origin = s.punch && s.beat !== undefined ? firstOfBeat.get(s.beat) : undefined;
      if (origin === undefined) continue;
      const base = flat[origin];
      const start = used.get(origin) ?? base.durationSec;
      used.set(origin, start + s.durationSec);
      shots[j] = {
        ...s,
        reuse: origin,
        source: base.source,
        isCutaway: base.isCutaway,
        ...(base.source === 'clip' ? { startSec: start } : {}),
      };
    }
  }

  return { characterDescription: character, archetype: plan.archetype.trim(), shots: perBeat };
}

/** The long-form planner's answer made safe: no mascot, a camera move and the style lock on every prompt. */
export function finaliseLongPlan(e: any, plan: LongPlan) {
  const sorted = [...plan.chapters].sort((a, b) => a.chapter - b.chapter);
  if (sorted.length !== e.chapters.length) {
    throw new Error(`The shot planner returned ${sorted.length} chapters for ${e.chapters.length}. Try again.`);
  }
  return {
    characterDescription: clean(plan.characterDescription),
    archetype: plan.archetype.trim(),
    chapters: sorted.map((c, i) => {
      const concept = e.chapters[i].concept;
      const heroB = c.heroB.trim().replace(/^continuation of previous clip:?\s*(the exact same character[^.]*\.?\s*)?/i, '');
      return {
        heroA: safePrompt(c.heroA, `A person physically starts the moment of ${concept}`, 'Slow push in'),
        heroB: safePrompt(heroB, 'The same person, the moment escalating', 'Handheld drift'),
        stillPrompt: safePrompt(
          c.stillPrompt,
          `A symbolic still with no people in frame that stands for ${concept}`,
          'Slow push in',
        ),
      };
    }),
  };
}

/** Everyday cast for the offline planner. */
const LOCAL_CAST = [
  { archetype: 'college student', description: 'a young woman of about twenty with a shoulder-length black bob, warm brown eyes, a lilac knit sweater and small silver hoop earrings' },
  { archetype: 'new office hire', description: 'a man in his mid twenties with short wavy dark hair and light stubble, a washed charcoal hoodie under an olive chore jacket' },
  { archetype: 'young mother', description: 'a woman in her early thirties with a long dark braid over one shoulder, a terracotta corduroy overshirt over a cream tee' },
  { archetype: 'graduate student', description: 'a man of about twenty-four with round glasses and a messy dark undercut, a mustard cardigan over a white tee' },
  { archetype: 'freelance designer', description: 'a woman in her late twenties with short curly hair, an oversized light denim jacket over a black turtleneck' },
  { archetype: 'retired grandfather', description: 'a man in his late sixties with neat silver hair and a trimmed white moustache, a grey cable-knit vest over a checked shirt' },
  { archetype: 'teenage gamer', description: 'a boy of about sixteen with a tousled fringe, a black oversized tee under an open forest-green flannel, headphones around his neck' },
  { archetype: 'late-night commuter', description: 'a woman in her thirties with a high ponytail and gold studs, a camel trench coat over a grey knit top' },
  { archetype: 'aspiring musician', description: 'a man in his early twenties with shoulder-length hair tied back, a burgundy bomber jacket over a white henley' },
  { archetype: 'older sister', description: 'a woman in her mid twenties with hair clipped up in a tortoiseshell claw clip, a sage-green hoodie with the sleeves pushed up' },
  { archetype: 'middle-aged father', description: 'a man in his mid forties with a salt-and-pepper beard, a navy quarter-zip sweater over a light blue collar' },
  { archetype: 'fitness enthusiast', description: 'a woman in her late twenties with a sleek high ponytail, a black zip-up athleisure jacket with white piping' },
  { archetype: 'book lover', description: 'a man in his early thirties with curly brown hair and wire-rim glasses, an oatmeal crewneck sweater' },
  { archetype: 'first-time manager', description: 'a woman in her early thirties with a chin-length bob and bangs, a cream blazer over a navy striped tee' },
  { archetype: 'weekend cyclist', description: 'a man in his late twenties with a short fade and a thin beard, a white polo with the sleeves rolled and a grey zip hoodie tied at the waist' },
  { archetype: 'homebody introvert', description: 'a woman in her mid twenties with a messy bun and round glasses, an oversized rust-orange sweater' },
];
const LOCAL_ACTIONS = [
  'turns sharply toward the door',
  'sets a mug down hard on the counter',
  'glances up from a buzzing phone',
  'flips a notebook open and scans it',
  'leans in across the table',
  'pushes a door open with one shoulder',
  'snaps a laptop shut',
  'paces to the window and back',
  'pulls a jacket on in one quick motion',
  'sweeps a pile of papers aside',
  'recoils from a sudden sound',
  'taps a phone screen twice',
];
const LOCAL_HANDS = [
  { action: 'slides a phone across a table', prompt: 'slide a phone across a table' },
  { action: 'flips a notebook open', prompt: 'flip a notebook open' },
  { action: 'twists a ring nervously', prompt: 'twist a ring nervously' },
  { action: 'folds a note in half', prompt: 'fold a note in half' },
  { action: 'pushes a chair back', prompt: 'push a chair back' },
  { action: 'drums fingers on a table', prompt: 'drum their fingers on a table' },
];
const LOCAL_SETTINGS = [
  'a bedroom at night',
  'a busy cafe',
  'a city bus at dusk',
  'a rooftop at sunset',
  'a sunlit kitchen in the morning',
  'a park bench in autumn',
  'an office corridor',
  'a rainy street under neon signs',
];
const PEOPLE =
  /\b(protagonist|person|people|someone|friend|friends|woman|man|girl|boy|they|he|she|character|group|family|parent|parents|uncle|aunt|crowd|couple|partner|kid|child|student|colleague|boss|sibling|fan|fans|everyone|face|faces|reaction|reacting)\b/i;
const OTHERS_SOFT = 'anyone else only as a soft-focus background figure';

/** "turns sharply toward the door" → "turn sharply toward the door" */
function baseVerb(phrase: string): string {
  const [first, ...rest] = phrase.split(' ');
  const base = /(ch|sh|x|ss)es$/.test(first) ? first.slice(0, -2) : first.replace(/s$/, '');
  return [base, ...rest].join(' ');
}

function hashOf(s: string): number {
  let h = 0;
  for (const ch of s) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return h;
}

/** A cast member for the entry, skipping types used in the last 10 videos. */
function pickCast(id: string, recentArchetypes: string[]) {
  const avoid = recentArchetypes.filter((a) => !NOT_ARCHETYPES.has(normalise(a)));
  const start = hashOf(id) % LOCAL_CAST.length;
  for (let i = 0; i < LOCAL_CAST.length; i++) {
    const c = LOCAL_CAST[(start + i) % LOCAL_CAST.length];
    if (!avoid.some((a) => sameArchetype(a, c.archetype))) return c;
  }
  return LOCAL_CAST[start];
}

/** The first clause of a line, at most 14 words, lower-cased at the start. */
function gist(line: string): string {
  const first = line.split(/[.!?;:]\s/)[0] ?? line;
  const g = first
    .replace(/["“”‘’]/g, '')
    .replace(/'(?=\s|$)/g, '')
    .trim()
    .split(/\s+/)
    .slice(0, 14)
    .join(' ');
  return g.charAt(0).toLowerCase() + g.slice(1);
}

function localSettings(e: any): string[] {
  const arc: string[] = (e.visual_brief?.setting_arc ?? []).filter(Boolean);
  if (arc.length >= 2) return arc.slice(0, 3);
  if (arc.length === 1) return [arc[0], `corner by the window near the ${arc[0].replace(/^(a|an|the)\s+/i, '')}`];
  return ['cozy living room', 'busy street at dusk'];
}

/** A shot plan made without a model, from the bank entry alone. */
export function localShortPlan(e: any, recentArchetypes: string[], style: Partial<ShortStyle> = {}): ShortPlan {
  const beats = beatPlan(e);
  const settings = localSettings(e);
  const cast = pickCast(e.id, recentArchetypes);
  const visual = usableBeats(e.visual_brief?.beats ?? e.visual_brief?.shots);
  if (visual) {
    const shots = sceneShots(e.id, visual, beats, {
      character: cast.description,
      mood: style.mood,
      calm: style.profile === 'C',
      looks: e.visual_brief?.character_looks,
    });
    return {
      characterDescription: cast.description,
      archetype: cast.archetype,
      beats: beats.map((b, i) => ({ beat: b.number, shots: shots[i] as any })),
    };
  }

  let seed = hashOf(e.id);
  const act = () => LOCAL_ACTIONS[seed++ % LOCAL_ACTIONS.length];
  const hands = () => LOCAL_HANDS[seed++ % LOCAL_HANDS.length];
  const settingFor = (i: number) => settings[Math.min(settings.length - 1, Math.floor((i * settings.length) / beats.length))];

  const planned = beats.map((b, i) => {
    const setting = settingFor(i);
    const moment = b.onScreen
      ? `${b.onScreen.replace(/^\d+\s*[·.)-]?\s*/, '').toLowerCase()} — ${gist(b.line)}`
      : gist(b.line);
    const makers: (() => { action: string; prompt: string })[] = [
      () => {
        const action = act();
        if (i === 0 && e.openingPrompt) {
          return { action, prompt: `${e.openingPrompt}, in the ${setting}: ${moment}; ${OTHERS_SOFT}` };
        }
        return {
          action,
          prompt: `${i === 0 ? 'Whip pan' : 'Slow push in'}. In the ${setting}, the character ${action}, acting out the moment: ${moment}; ${OTHERS_SOFT}`,
        };
      },
      () => ({
        action: 'reacts to it',
        prompt: `Rack focus. A close-up of the character's face reacting as it lands: ${moment}; the ${setting} soft behind`,
      }),
      () => {
        const h = hands();
        return { action: h.action, prompt: `Macro insert. The character's hands ${h.prompt} in the ${setting}` };
      },
      () => {
        const action = act();
        return {
          action,
          prompt: `Over-shoulder shot. Over the character's shoulder in the ${setting} as they ${baseVerb(action)}; ${OTHERS_SOFT}`,
        };
      },
      () => {
        const action = act();
        return { action, prompt: `Handheld drift. The character ${action} across the ${setting}, the mood shifting: ${moment}` };
      },
    ];
    return {
      beat: b.number,
      shots: Array.from({ length: b.minShots }, (_, k) => {
        const m = makers[k % makers.length]();
        return {
          source: 'still',
          setting,
          subject: 'the character',
          action: m.action,
          durationSec: 0,
          isCutaway: false,
          clipPrompt: m.prompt,
        };
      }) as any[],
    };
  });

  const mustShow: string[] = (e.visual_brief?.must_show ?? []).filter(Boolean);
  const used = new Set<string>();
  const place = (target: number, shot: any) => {
    const shots = planned[target].shots;
    const slot = shots
      .map((_, j) => j)
      .reverse()
      .find((j) => j > 0 && !used.has(`${target}:${j}`));
    if (slot !== undefined) {
      shots[slot] = shot;
      used.add(`${target}:${slot}`);
    } else {
      shots.push(shot);
      used.add(`${target}:${shots.length - 1}`);
    }
  };
  mustShow.forEach((m, k) => {
    const cutaway = /\bcutaway\b/i.test(m);
    const text = m
      .replace(/\s*\((?:cutaway|insert)\)\s*/gi, ' ')
      .replace(/^close cutaway inserts? of\s*/i, '')
      .trim();
    const target =
      mustShow.length !== 1 ? Math.round((k * (beats.length - 1)) / (mustShow.length - 1)) : Math.floor(beats.length / 2);
    const setting = settingFor(target);
    place(
      target,
      cutaway || !PEOPLE.test(text)
        ? {
            source: 'still',
            setting,
            subject: 'object insert',
            action: 'slides into view',
            durationSec: 0,
            isCutaway: true,
            clipPrompt: `Macro insert. Close on ${text} in the ${setting}, no people in frame`,
          }
        : {
            source: 'still',
            setting,
            subject: 'the character',
            action: 'turns toward it',
            durationSec: 0,
            isCutaway: false,
            clipPrompt: `Handheld drift. In the ${setting}: ${text.replace(/\bthe protagonist\b/gi, 'the character')}; ${OTHERS_SOFT}`,
          },
    );
  });

  if (!planned.some((b) => b.shots.some((s) => s.isCutaway))) {
    const longest = beats.reduce((best, b, i) => (b.seconds > beats[best].seconds ? i : best), 0);
    const setting = settingFor(longest);
    const shots = planned[longest].shots;
    const slot = shots
      .map((_, j) => j)
      .reverse()
      .find((j) => j > 0 && !used.has(`${longest}:${j}`));
    const cut = {
      source: 'still',
      setting,
      subject: 'object insert',
      action: 'slides into view',
      durationSec: 0,
      isCutaway: true,
      clipPrompt: `Macro insert. Close on an everyday object in the ${setting} that echoes the moment: ${gist(
        beats[longest].line,
      )}; no people in frame`,
    };
    if (slot !== undefined) shots[slot] = cut;
    else shots.push(cut);
  }

  if (e.lighting) {
    for (const b of planned) {
      for (const s of b.shots) {
        if (!s.clipPrompt.includes(e.lighting)) s.clipPrompt = `${s.clipPrompt}; ${e.lighting}`;
      }
    }
  }
  return { characterDescription: cast.description, archetype: cast.archetype, beats: planned };
}

/** A long-form visual plan made without a model. */
export function localLongPlan(e: any, recentArchetypes: string[]): LongPlan {
  const cast = pickCast(e.id, recentArchetypes);
  const h = hashOf(e.id);
  return {
    characterDescription: cast.description,
    archetype: cast.archetype,
    chapters: (e.chapters as { title: string; concept: string }[]).map((c, i) => {
      const setting = LOCAL_SETTINGS[(h + i) % LOCAL_SETTINGS.length];
      const starts = LOCAL_ACTIONS[(h + i * 2) % LOCAL_ACTIONS.length];
      const escalates = LOCAL_ACTIONS[(h + i * 2 + 1) % LOCAL_ACTIONS.length];
      const title = c.title.toLowerCase();
      return {
        chapter: i + 1,
        heroA: `Slow push in. In ${setting}, the character ${starts}, starting the moment of ${title}: ${c.concept}; ${OTHERS_SOFT}`,
        heroB: `Handheld drift. The same character ${escalates} as the tension of ${title} escalates in ${setting}`,
        stillPrompt: `Slow push in on a symbolic still life with no people in frame: an everyday object in ${setting} that stands for ${c.concept}`,
      };
    }),
  };
}

/** Plans the pictures for a bank entry on the phone, with no model call. */
export function planBankedScriptLocally(
  e: any,
  recentArchetypes: string[],
  clipBudget: number = DEFAULT_CLIP_BUDGET,
  style: Partial<ShortStyle> = {},
): any {
  if (isV2(e)) {
    if (e.kind !== 'short') return finishV2Long(e, planBankedScriptLocally(v2LongView(e), recentArchetypes, clipBudget));
    return finishV2Short(
      e,
      planBankedScriptLocally(v2ShortView(e), recentArchetypes, clipBudget, { ...style, mood: style.mood ?? moodOf(e) }),
    );
  }
  if (!e.script) throw new Error(`${e.id} has no script to plan shots for.`);
  if (e.kind === 'short') {
    return shortScriptFromBank(e, finaliseShortPlan(e, localShortPlan(e, recentArchetypes, style), clipBudget, style));
  }
  return longScriptFromBank(e, finaliseLongPlan(e, localLongPlan(e, recentArchetypes)));
}

export interface PlanOptions {
  /** Sends an instruction to the model and returns its parsed JSON. */
  call?: (instruction: string) => Promise<unknown>;
  recentArchetypes: string[];
  clipBudget?: number;
  style?: Partial<ShortStyle>;
  signal?: AbortSignal;
  onNotice?: (message: string) => void;
}

/** Plans with the model, rejecting and retrying once, and falls back to the phone's own planner. */
async function planWithAi(e: any, opts: PlanOptions & { call: NonNullable<PlanOptions['call']> }, clipBudget: number) {
  let rejections: string[] = [];
  for (let attempt = 0; attempt < 2; attempt++) {
    const instruction =
      e.kind !== 'short'
        ? longPlannerInstruction(e, opts.recentArchetypes, rejections)
        : shortPlannerInstruction(e, opts.recentArchetypes, clipBudget, rejections);
    const raw = await opts.call(instruction);
    const { value, dropped } = stripNarration(raw);
    if (dropped.length) {
      opts.onNotice?.(`The shot planner sent words (${dropped.join(', ')}); ignored — the bank's narration is final.`);
    }
    const last = attempt === 1;
    const shapeProblem = (issues: { path: (string | number)[]; message: string }[]) =>
      `Your reply did not match the required shape (${issues
        .slice(0, 3)
        .map((i) => `${i.path.join('.')}: ${i.message}`)
        .join('; ')}).`;
    if (e.kind !== 'short') {
      const parsed = LongPlanSchema.safeParse(value);
      if (!parsed.success) {
        if (last) {
          throw new Error(
            `The shot planner returned an unusable plan: ${parsed.error.issues[0]?.message ?? 'bad shape'}. Try again.`,
          );
        }
        rejections = [shapeProblem(parsed.error.issues as any)];
        continue;
      }
      const issues = longPlanIssues(e, parsed.data, opts.recentArchetypes);
      if (issues.length && !last) {
        opts.onNotice?.(`Tightening the visual plan (${issues.length} fix${issues.length === 1 ? '' : 'es'})…`);
        rejections = issues;
        continue;
      }
      return longScriptFromBank(e, finaliseLongPlan(e, parsed.data));
    }
    const parsed = ShortPlanSchema.safeParse(value);
    if (!parsed.success) {
      if (last) {
        throw new Error(
          `The shot planner returned an unusable plan: ${parsed.error.issues[0]?.message ?? 'bad shape'}. Try again.`,
        );
      }
      rejections = [shapeProblem(parsed.error.issues as any)];
      continue;
    }
    const issues = shortPlanIssues(e, parsed.data, opts.recentArchetypes);
    if (issues.length && !last) {
      opts.onNotice?.(`Tightening the shot plan (${issues.length} fix${issues.length === 1 ? '' : 'es'})…`);
      rejections = issues;
      continue;
    }
    if (issues.some((i) => i.startsWith('The archetype'))) {
      opts.onNotice?.(`Kept the character "${parsed.data.archetype}", though it was used recently.`);
    }
    return shortScriptFromBank(e, finaliseShortPlan(e, parsed.data, clipBudget));
  }
  throw new Error('The shot planner did not return a usable plan. Try again.');
}

/** Plans the pictures for a bank entry: with the model when one is set, on the phone otherwise or when it fails. */
export async function planBankedScript(e: any, opts: PlanOptions): Promise<any> {
  if (isV2(e)) {
    if (e.kind !== 'short') return finishV2Long(e, await planBankedScript(v2LongView(e), opts));
    return finishV2Short(
      e,
      await planBankedScript(v2ShortView(e), { ...opts, style: { ...opts.style, mood: opts.style?.mood ?? moodOf(e) } }),
    );
  }
  if (!e.script) throw new Error(`${e.id} has no script to plan shots for.`);
  const clipBudget = opts.clipBudget ?? DEFAULT_CLIP_BUDGET;
  const call = opts.call;
  if (call && !(e.kind === 'short' && usableBeats(e.visual_brief?.beats ?? e.visual_brief?.shots))) {
    try {
      return await planWithAi(e, { ...opts, call }, clipBudget);
    } catch (err) {
      if (opts.signal?.aborted) throw err;
      const message = (err instanceof Error ? err.message : String(err)).split('\n')[0].slice(0, 140);
      opts.onNotice?.(`The AI shot planner failed (${message}) — planned on the phone instead.`);
      return planBankedScriptLocally(e, opts.recentArchetypes, clipBudget, opts.style);
    }
  }
  return planBankedScriptLocally(e, opts.recentArchetypes, clipBudget, opts.style);
}

export {
  beatPlan,
  clipTargets,
  stripNarration,
  sameArchetype,
};
