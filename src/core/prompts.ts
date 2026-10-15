import yaml from 'yaml';
import { ACTION_VERBS, DEFAULT_CLIP_BUDGET, MAX_SHOT_SECONDS, MIN_SHOTS, STATIC_VERBS } from './shots';
import { DEFAULT_CHANNEL_CONFIG } from './channelConfig';
import { titleRulesPrompt, type TitleRuleConfig } from './titleRules';
import { STYLE_LOCK } from './styleLock';
import { LONG_WORD_MAX, LONG_WORD_MIN, SHORT_WORD_MAX, SHORT_WORD_MIN, WORDS_PER_SECOND } from './guardrails';

/**
 * Prompt construction. The brand bible is prepended to every generation call so
 * tone, mascot rules and the style lock never drift between requests.
 */

export const CHARACTER_AND_VISUAL_RULES =
  "CHARACTER RULES:\n- Never dress characters in occupational costume (scrubs, firefighter gear, pilot jackets)\n  unless the script explicitly analyses that profession.\n- Wardrobe is relatable and stylish: washed charcoal hoodie, olive chore jacket, lilac knit\n  sweater, terracotta corduroy overshirt, and similar.\n- Never reuse the same character archetype twice inside one video.\n\nNEUTRAL SETTINGS (the audience is global):\n- Use the names given. A new person is named from Sam, Nora, Ben, Lena, Theo, Mia, Ryan, Zoe, Max,\n  Ella, Jonah, Ivy.\n- Do not add a city, country, nationality, festival, food or landmark tied to one culture. Say\n  \"apartment\", not \"flat\". Money is in dollars.\n\nVISUAL PROMPT RULES:\n- NO OWL, NO MASCOT, NO BIRD of any kind in any prompt. Professor Hoot is added later as\n  an overlay; a prompt that mentions him, or any owl, bird, or cartoon animal observer,\n  puts a duplicate into the footage. This applies even though he is described above — that\n  description exists so you know the channel, not so you can stage him.\n- Every Veo and Imagen prompt you write describes a SILENT scene: no dialogue, no captions,\n  no on-screen text, no logos.\n- The channel's art style is ANIME. Never ask for photorealism, live action, stock footage\n  or 3D render; describe the scene as an anime shot.\n- Every visual prompt must end with exactly this string:\n  \"" +
  STYLE_LOCK +
  "\"\n- Continuity: clips after the first must open with\n  \"Continuation of previous clip: The exact same character [restate face, hair and wardrobe]...\"";

export const BRAND_BIBLE =
  "You are the head writer for \"The Mind Files\", a YouTube channel investigating why\nhumans think, react, sabotage, and love the way they do.\n\nTONE: Calm, warm, slightly amused intellectual curiosity. Never preachy, never clinical.\nNo medical disclaimers unless the topic is a diagnosable pathology.\n\nMASCOT: Professor Hoot — a distinguished owl in an academic tweed waistcoat and round\nspectacles. He reacts to revelations; he never narrates.\nHe is composited onto the finished video afterwards, as a separate overlay. He must\ntherefore NEVER appear in any prompt you write, and never be referred to in the\nnarration. Writing him into a clip prompt produces a second owl in the final video.\n\nCADENCE LAW: All spoken copy is bound to " +
  WORDS_PER_SECOND +
  " words per second. Word counts are\nnot stylistic suggestions — they are timing constraints. Exceeding them breaks the render.\n\nNAME THE TACTIC (this is the channel's single strongest signal):\nEvery script is about one specific, named psychological mechanism — love bombing,\nfoot-in-the-door, triangulation, sunk cost, anchoring, social proof, intermittent\nreinforcement, and so on. Never build a script around a generic label such as\n\"manipulation\", \"psychology\", \"toxic behaviour\" or \"the brain\". Naming the tactic\nis what reads as expert knowledge; a generic label reads as filler, and measurably\nunderperforms on this channel.\nIn a Short, the name comes AFTER the hook: the hook leads with something the viewer\ndoes, in plain words, and the tactic is named in the beat that follows. Jargon-first\nhooks and titles are what this channel's worst performers have in common.\n\nPOINT IT AT THE VIEWER:\nFrame the mechanism as something being done TO the viewer, happening to them,\nright now — not as a skill for reading or influencing other people. \"This is\nbeing done to you\" consistently outperforms \"here is how to read someone\" on this\nchannel by a wide margin, even on near-identical subject matter. The viewer is the\ntarget of the tactic, not the practitioner of it.\n\n" +
  CHARACTER_AND_VISUAL_RULES;

const ENUMERATED_VARIANT =
  "\n\nVARIANT — ENUMERATED LIST:\nThis script counts off THREE named tactics instead of exploring one. Adjust the beats:\n- HOOK still follows the hook rules and MUST include the count (\"three things you do…\"\n  style, but never that exact phrasing).\n- MECHANISM becomes three micro-beats of 10-13 words each, one per tactic. Each names\n  its tactic outright and gives the single most recognisable way it shows up. No\n  preamble between them — cut straight from one to the next.\n- REFRAME closes on what all three have in common.\nThe total word budget is UNCHANGED. Three tactics in the same " + SHORT_WORD_MAX + " words means\neach is stated, not explained. Brevity is the format.";

export const SHOT_HARD_RULES =
  "Hard rules, each of which is checked:\n1. NO SHOT MAY HOLD LONGER THAN " +
  MAX_SHOT_SECONDS +
  " SECONDS. Set \"durationSec\" accordingly.\n2. At least one shot must be a CUTAWAY with \"isCutaway\": true — the character not in\n   frame at all. A price tag, a lock screen, a wallet closing, a hand withdrawing. This\n   is what makes a Short feel edited rather than filmed in one take.\n3. Use 2-3 DIFFERENT settings across the Short. Kitchen counter, then the phone in her\n   hand, then a doorway. Backgrounds may be simple; variety matters more than detail.\n4. \"action\" MUST be a verb of motion or change. These are BANNED as the main action\n   because they can be held forever and the footage comes out frozen:\n   " +
  STATIC_VERBS.slice(0, 12).join(', ') +
  '.\n   Use instead: ' +
  ACTION_VERBS.join(', ') +
  ".\n5. The character's IDENTITY stays constant; the SHOT does not. Every shot showing the\n   character restates the same hair, wardrobe and face, but the framing, the camera move\n   and what they are doing must differ every time. Identical framing twice is a failure.\n6. Name a camera move in each prompt: push in, rack focus, whip pan, handheld drift,\n   overhead, macro insert, over-shoulder.\n7. Every clipPrompt ends with the mandatory style lock string.";

const HOOK_RULES = "HOOK RULES — a feed viewer decides in the first two seconds:\n- The first 6 words describe something the VIEWER does, in plain everyday words,\n  second person: \"You copy strangers without noticing…\", \"You defend arguments you\n  already lost…\".\n- The grammatical subject is \"you\". Never \"people\", \"someone\", \"they\" or \"humans\".\n- Do NOT say the tactic's name in the hook. Name it in the next beat.\n- No \"Did you know\", no \"Have you ever\". Open mid-thought, at stakes.";

export const SCENE_FIRST_RULES = "SCENE-FIRST FORMAT (the Short is about 20 to 28 seconds):\n- Open on an emotional moment the viewer has lived (a message left unanswered, a comparison, a door that closes). Do not open with a definition, a name, a year or a study.\n- CR-91: no theory name, \"research\", year or study in the first 25 words. Say the term once, late (in the last 40% of the words), or not\n  at all; no disclaimer sentence (\"a popular term, not a diagnosis\"): plain hedges (\"often\", \"can\") only, sources in the description.\n- Then ONE plain reason it works, and ONE thing to do or watch for.\n- End on a reflective question to the viewer (the same question as \"pinnedComment\"), then the sign-off. No loop ending.\n- One sentence per line in \"narration\" order: the voice pauses at least 0.4 s between lines (CR-91).\n- Prefer relationship, family and everyday-pain angles to abstract or mathematical biases.\n- Never mention researchers, studies, experiments, psychologists, universities, journals, years or author names. State the effect as plain\n  fact; hedge (\"research is mixed\") only when the topic's evidence is mixed or debunked.\n- 44 to 66 spoken words (a numbered list 50 to 80), the sign-off included; at 2.0 words a second with the pauses it must run 45 s or less. Second person. Every sentence 12 words or fewer.\n- No origin trivia (\"named after\", \"coined\", \"after an old play\", \"originally\").\n- Return \"sourceLine\": who found it and when, and the one-line finding (\"Based on Freedman & Fraser, 1966. Evidence: strong.\"). It goes in the\n  description and is never spoken.\n- CR-91: three shots of about 10 s each: S1 a moody still on a slow push-in that already shows the moment, C1 one Veo clip as the\n  pattern interrupt, S2 a still to the end. Slow moves only (slow push-in, pull-out, pan, tilt, tracking). Rain, night, windows, one\n  solitary figure, symbolic objects; at most two people in a shot; no cups, desks, cafés, phones or laptops as the subject.";

const HOOK_TEXT_RULES = "ON-SCREEN HOOK TEXT:\nReturn \"hookText\": the hook's promise in 2 to 6 words, burned on screen as a static\nbanner from frame 0 (\"WHY YOU COPY STRANGERS\"). Plain words, no tactic name, no\npunctuation beyond a question mark.\nReturn \"hookTextPov\": a caption-first version of the same banner, \"POV:\" plus the viewer's\nmoment, 9 words or fewer, no year (\"POV: One hour, no reply, tight chest\").\n\nENDING (CR-84D, CR-88D) — no loop, no cliffhanger cut mid-sentence:\n- The last beat ends on the sign-off \"...and that's the mind for you. Stay curious, stay sharp.\"\n- Return \"loopBridge\": the EXACT final 3-6 words of the last beat, copied verbatim (kept for the record).\n- No \"follow for more\".\n\nTITLES — return \"titleOptions\": exactly 3 titles, best first, and set \"title\" to the first:\n- 3-7 words, at most 50 characters, addressed to \"you\" or led by a number.\n{TITLE_RULES}\n- Describe the viewer's behaviour, not the tactic's name.\n- At most ONE intensifier (\"Secretly\", \"Instantly\", \"Really\") per title; prefer none.\n- No hashtags and no \"#Shorts\" in any title.\n- Flawless grammar.\n- Three genuinely different angles — not one template with a word swapped.\n\nTACTIC: return \"tactic\": the standard name of the tactic this Short is about\n(\"social proof\", \"reciprocity\"). For a list, the one that ties them together.";

/** How an assigned bank entry's framing overrides "point it at the viewer". */
export const FRAMING_RULES: Record<string, string> = {
  identity: "IDENTITY — describe a type of person the viewer is or knows, in a recognising, non-judgemental way. Never diagnose. Never stereotype by gender, religion or caste.",
  self_callout: "SELF-CALLOUT — \"you do this, here's why\". Light and relatable, never shaming.",
  test: "TEST — the viewer takes part first, then gets the reveal.",
  relationship: "RELATIONSHIP — about the viewer's relationships. Defensive, never how to manipulate someone.",
  borrowed: "BORROWED — cricket, family life, anime or history is the doorway into a real concept. Warm, never mocking the culture it borrows from.",
};

/** Tactics that have worked on this channel; topic ideas lean toward them. */
export const PRIORITY_TACTICS = ['social proof', 'reciprocity', 'foot-in-the-door', 'commitment & consistency', 'sunk cost'];
export const DEPRIORITISED_TACTICS = ['gaslighting', 'body-language micro-claims (what crossed arms or a glance "really" mean)'];
export const DEFENSIVE_CATEGORY = 'Persuasion & Influence';

/** A topic-bank entry as the writer sees it (YAML), minus the app's own `kind` field. */
export interface PromptEntry {
  kind?: string;
  format?: string;
  framing?: string;
  title?: string;
  hook?: string;
  notes?: string;
  length_s?: number;
  stimulus_hold_s?: number;
  stimulus?: string;
  beats_hint?: string;
  cta_question?: string;
  target_min?: number;
  cold_open?: string;
  closing_idea?: string;
  chapters?: { title: string; concept: string }[];
  [key: string]: unknown;
}

export type ShortStructure = 'single' | 'list' | 'rapid' | 'test';

export function clipRule(budget: number): string {
  if (budget <= 0) return 'The budget for this Short is ZERO clips: every shot must be "still".';
  const where =
    budget >= 3
      ? "Put one on the HOOK (the first two seconds decide whether the viewer stays), at least one in the middle, and one on the final payoff"
      : budget === 2
        ? "Put one on the HOOK (the first two seconds decide whether the viewer stays) and one in the middle"
        : "Put it on the HOOK — the first two seconds decide whether the viewer stays";
  return (
    `Use EXACTLY ${budget} clip${budget === 1 ? '' : 's'} in the whole Short — more is unaffordable, fewer leaves the Short without motion.\n  ` +
    `${where}. Spend them on shots where the character moves and carries the performance, never on a cutaway.`
  );
}

/** A bank entry's format → the script structure the writer is asked for. */
export function structureForFormat(format?: string): string {
  if (format === 'rapid_list') return 'rapid';
  return format === 'test' ? 'test' : 'single';
}

/** Spoken words for an entry: its length less any silent stimulus hold, at the channel cadence. */
export function shortWordTarget(entry: PromptEntry): number {
  const seconds = entry.format === 'test' ? (entry.length_s ?? 0) - (entry.stimulus_hold_s ?? 0) : (entry.length_s ?? 0);
  return Math.round(seconds * WORDS_PER_SECOND);
}

export function longWordCap(entry: PromptEntry): number {
  return Math.round((entry.target_min ?? 0) * 60 * WORDS_PER_SECOND);
}

/** List items named in beats_hint ("1) … 2) …"), clamped to 3-4. */
export function rapidItemCount(hint: string): number {
  const n = hint.match(/(?:^|\s)\d[).]/g)?.length ?? 0;
  return Math.min(4, Math.max(3, n || 3));
}

function archetypeBlock(recent: string[]): string {
  return recent.length ? `\n\nARCHETYPES USED RECENTLY — DO NOT REUSE ANY OF THESE:\n${recent.map((a) => `- ${a}`).join('\n')}` : '';
}

function assignedBlock(entry: PromptEntry): string {
  const { kind: _kind, ...rest } = entry;
  const body = yaml.stringify(rest, { lineWidth: 0 }).trimEnd();
  const notes = entry.notes ? `\nNOTES — follow these exactly; some limit what may be claimed. Never overclaim:\n${entry.notes}\n` : '';
  return (
    'ASSIGNED TOPIC (locked). Do not change the topic, framing, format or concept.\nWrite the script for this entry:\n\n' +
    body +
    `\n\nFRAMING — this overrides the brand bible's "POINT IT AT THE VIEWER" law for this script:\n` +
    (FRAMING_RULES[entry.framing ?? ''] ?? '') +
    '\n' +
    notes
  );
}

function entryStructure(entry: PromptEntry): string {
  const t = shortWordTarget(entry);
  const range = `${Math.floor(t * 0.95)}-${Math.ceil(t * 1.05)}`;
  const hook = `The first line is the entry's hook: "${entry.hook}". You may tighten its wording, but keep its meaning and its subject.`;
  if (entry.format === 'rapid_list') {
    const items = rapidItemCount(entry.beats_hint ?? '');
    const lines = Array.from({ length: items }, (_, i) => `${i + 2}. ITEM ${i + 1} (12-18 words, kind "mechanism"), following beats_hint.`).join('\n');
    return (
      `STRUCTURE — RAPID LIST: exactly ${items + 2} beats, ${range} spoken words TOTAL (about ${entry.length_s} s).\n1. HOOK (10-14 words, kind "hook"). ${hook}\n` +
      lines +
      "\n   Every item beat also returns \"cardText\": its number and a 2-4 word label, shown bold on\n   screen for that beat (\"1. YOU PAUSE FIRST\").\n" +
      `${items + 2}. CLOSER (6-10 words, kind "reframe"), ending on the loop bridge.\nName the concept plainly in one of the items.`
    );
  }
  if (entry.format === 'test') {
    return (
      `STRUCTURE — TEST: ${range} spoken words TOTAL, not counting the silent hold.\n1. INSTRUCTION HOOK (8-14 words, kind "hook"): tells the viewer exactly what to do. ${hook}` +
      `\n   Then the app shows the stimulus for ${entry.stimulus_hold_s}` +
      " seconds IN SILENCE. Do not narrate it,\n   do not describe it, do not count down — the viewer is doing the test.\n2. REVEAL AND MECHANISM (kind \"mechanism\", one or two beats, the rest of the budget less\n   the closer): what just happened in the viewer's brain. Name the concept plainly.\n3. CLOSER (one line, kind \"reframe\"), ending on the loop bridge.\n\nSTIMULUS — return \"stimulusCard\": the stimulus below laid out for the app to draw on a\n9:16 card. Never put it in a video prompt; generated video cannot render text reliably.\n  " +
      (entry.stimulus ?? '') +
      "\n- \"background\": a hex colour. \"frame\": \"triangle\" for a road-sign shape, \"box\", or \"none\".\n- \"items\": every piece of text or symbol, each with its exact \"text\", a hex \"color\",\n  a \"size\" (s, m, l, xl) and its centre \"x\" and \"y\" as fractions of the card (0-1).\n  Keep everything between x 0.1-0.9 and y 0.15-0.85. Use \"●\" for a solid dot.\n  Reproduce the stimulus exactly — the colours, the words, the spelling, the line breaks."
    );
  }
  return (
    `STRUCTURE — exactly three beats, ${range} spoken words TOTAL (about ${entry.length_s} s).\n1. HOOK (about a fifth of the words). ${hook}` +
    '\n2. MECHANISM (about half): cover beats_hint, and name the concept plainly.\n3. REFRAME (the rest): the takeaway, ending on the loop bridge.'
  );
}

const RAPID_STRUCTURE = "STRUCTURE — RAPID LIST: exactly FIVE beats, 38-46 spoken words TOTAL. Never exceed 46.\nThis is a fast numbered list of three SIGNS someone is using a tactic on the viewer.\n1. HOOK (8-10 words, kind \"hook\"): follows the hook rules and includes the count 3.\n2. SIGN ONE (8-10 words, kind \"mechanism\").\n3. SIGN TWO (8-10 words, kind \"mechanism\").\n4. SIGN THREE (8-10 words, kind \"mechanism\").\n   Each sign is one concrete, recognisable behaviour, stated not explained. Name the\n   tactic in sign one. Every sign beat also returns \"cardText\": its number and the sign\n   in at most 5 words, shown on screen for that beat (\"1. THEY MIRROR YOU\").\n5. CLOSER (4-6 words, kind \"reframe\"): the takeaway, ending on the loop bridge.";

const SHOTS_TEST = "Shots per beat (the stimulus is drawn by the app and is NOT a shot):\n- HOOK: 1 shot of the character reacting to or doing the instruction.\n- REVEAL/MECHANISM: at least 2 shots that show the idea — a close-up insert, a change\n  of setting, the brain's shortcut made physical.\n- CLOSER: 1 shot. A physical payoff.";
const SHOTS_SINGLE = "Shots per beat:\n- HOOK: 1 shot. Open on the behaviour itself or its consequence, not on someone\n  talking — a hand slipping a decoy price tag onto a shelf, a thumb hovering over \"Buy Now\".\n- MECHANISM: at least 2 shots. Each sentence lands on a new picture: a different\n  location, a close-up insert, or a change of action. Never explain over one held frame.\n- REFRAME: 1 shot. A physical payoff — a door closing, a phone turned face down, a\n  receipt torn — not the line delivered to camera.";
const SHOTS_RAPID = "Shots per beat:\n- HOOK: 1 shot. Open on the behaviour itself, not on someone talking.\n- EACH SIGN: 1 shot that SHOWS that sign happening — the mirrored gesture, the favour\n  offered, the phone flipped face down.\n- CLOSER: 1 shot. A physical payoff — a door closing, a hand pulling back.";

export function shortFormInstruction(
  topic: string,
  category: string,
  recentArchetypes: string[],
  structure: ShortStructure | string = 'single',
  clipBudget: number = DEFAULT_CLIP_BUDGET,
  entry?: PromptEntry,
  titles: TitleRuleConfig = DEFAULT_CHANNEL_CONFIG.titles,
): string {
  if (entry) structure = structureForFormat(entry.format);
  const titleRules = titleRulesPrompt(titles);
  const topicBlock = entry ? assignedBlock(entry) : `TOPIC: ${topic}\nCATEGORY: ${category}`;
  const structureBlock = entry
    ? entryStructure(entry)
    : structure === 'rapid'
      ? RAPID_STRUCTURE
      : `STRUCTURE — exactly three beats, ${SHORT_WORD_MIN}-${SHORT_WORD_MAX} spoken words TOTAL across all three.\nNever exceed ${SHORT_WORD_MAX} words. This is a hard constraint.\n` +
        (structure === 'list' ? ENUMERATED_VARIANT : '') +
        "\n\n1. HOOK (8-12 words, the first sentence 12 words or fewer, in the viewer's moment): follows the hook rules below.\n2. MECHANISM (20-36 words): NAME THE TACTIC here — the actual term — and explain it\n   with zero academic jargon, framed as something being done TO the viewer in a\n   specific, recognisable moment they have lived through. Not \"how to spot someone\n   doing X\" — \"X is being done to you, here is how it works on you\".\n3. REFRAME (8-16 words): A practical takeaway or empowered boundary that returns control\n   to the viewer, then the sign-off \"...and that's the mind for you. Stay curious, stay sharp.\"";
  const hookRules = entry ? '' : `${HOOK_RULES}\n\n${SCENE_FIRST_RULES}`;
  const hookText = (
    entry
      ? "ON-SCREEN HOOK TEXT: return \"hookText\": the hook's promise in AT MOST 6 words, shown for the\nfirst two seconds.\n\nLOOP — the Short replays automatically. Return \"loopBridge\": the EXACT final 3-6 words of the\nlast beat, which must lead grammatically into the first words of the hook. No outro, no\nsign-off, no \"follow for more\".\n\nDO NOT NARRATE THE CTA. The app shows \"" +
        entry.cta_question +
        "\" on screen for the last 1.5 seconds.\nNever say it, or anything like it, in the script.\n\nTITLES — return \"titleOptions\": exactly 3. The FIRST must be exactly \"" +
        entry.title +
        "\". The\nother two are alternatives in the same spirit: at most 50 characters, no hashtags, flawless\ngrammar, genuinely different angles.\n{TITLE_RULES}\n\nTACTIC: return \"tactic\": the concept's standard short name (\"Stroop effect\", \"liking gap\")."
      : HOOK_TEXT_RULES
  ).replace('{TITLE_RULES}', titleRules);
  const shotsPerBeat = structure === 'test' ? SHOTS_TEST : structure === 'rapid' ? SHOTS_RAPID : SHOTS_SINGLE;
  const minShots = structure === 'rapid' ? 5 : MIN_SHOTS;
  return (
    BRAND_BIBLE +
    '\n\nTASK: Write one short-form vertical video (YouTube Shorts / Reels / TikTok).\n\n' +
    topicBlock + '\n\n' + structureBlock + '\n\n' + hookRules + '\n\n' + hookText +
    "\n\nVISUALS — A SHOT LIST, NOT HELD FRAMES.\n\nA beat is a unit of narration. A shot is a unit of picture. One beat is NOT one shot.\nA Short where the same person stays in the same place doing the same thing is a talking\nhead, and viewers leave. Something on screen must change every couple of seconds.\n\n" +
    shotsPerBeat +
    '\n\nThat is ' + minShots +
    " shots minimum. More is better — but see the budget below,\nbecause shot count and cost are separate things.\n\nBUDGET — THE MOST IMPORTANT CONSTRAINT HERE.\n\nEvery shot sets \"source\" to either \"clip\" or \"still\":\n- \"clip\" is generated video. It is EXPENSIVE. " +
    clipRule(clipBudget) +
    "\n- \"still\" is one generated image. The app pushes in on it, so it moves on screen — for a\n  prop, a phone, a hand, a price tag or a closing door it is indistinguishable from a\n  short clip, and it costs a fraction as much.\n\nRULES:\n- EVERY cutaway must be \"still\". No exceptions. A price tag does not need to act.\n- If you want more shots, add stills. Stills are effectively free; clips are not.\n- A six-shot Short with " +
    clipBudget + ' clip' + (clipBudget === 1 ? '' : 's') +
    " and the rest stills is better than a four-shot\n  Short where every shot is a clip. Cut more, spend exactly the budget.\n\n" +
    SHOT_HARD_RULES +
    "\n\nAlso return \"characterDescription\": a single reusable phrase capturing the character's face,\nhair and wardrobe ONLY — never the setting, which changes from shot to shot, and \"archetype\": a two-to-four word label for the character type you chose." +
    archetypeBlock(recentArchetypes)
  );
}

/** Words per chapter for a long-form of `chapters` chapters, inside the overall caps. */
export function chapterWordRange(chapters: number): { min: number; max: number } {
  const n = Math.max(1, chapters);
  return { min: Math.min(70, Math.ceil((LONG_WORD_MIN - 45) / n)), max: Math.min(110, Math.floor((LONG_WORD_MAX - 50) / n)) };
}

export function longFormInstruction(
  topic: string,
  category: string,
  chapters: number,
  recentArchetypes: string[],
  structure: string = 'standard',
  entry?: PromptEntry,
): string {
  if (entry) {
    const total = Math.round((entry.target_min ?? 0) * 60 * WORDS_PER_SECOND);
    const list = entry.chapters ?? [];
    const n = list.length;
    const perMax = Math.min(110, Math.floor((total - 55) / n));
    const perMin = Math.max(55, Math.min(perMax - 10, Math.floor((total * 0.8 - 55) / n)));
    const chapterLines = list.map((c, i) => `    ${i + 1}. "${c.title}" — ${c.concept}`).join('\n');
    return (
      BRAND_BIBLE +
      '\n\nTASK: Write one long-form 16:9 deep dive.\n\n' +
      assignedBlock(entry) +
      `\nTITLE: exactly "${entry.title}".\n\nTOTAL SPOKEN WORDS: at most ${total} (${entry.target_min} minutes at ${WORDS_PER_SECOND}` +
      ` words per second). Hard cap.\n\nSTRUCTURE:\n- COLD OPEN (12-20 words): built on "${entry.cold_open}` +
      `". You may tighten it, keeping its meaning.\n- EXACTLY ${n} CHAPTERS, in this order, each ${perMin}-${perMax} spoken words:\n` +
      chapterLines +
      "\n  Keep each chapter's title. Each is built from a miniHook, a mechanism that explains the\n  concept through a specific scenario, and a microReframe. Also return \"narration\" for each\n  chapter: the three parts joined into one natural spoken paragraph.\n- CLOSING SYNTHESIS (25-35 words): expands \"" +
      entry.closing_idea +
      "\" and MUST end with exactly:\n  \"Stay curious, keep your eyes wide, and remember: once you see the pattern, you hold the power.\"\n- Do NOT narrate \"" +
      entry.cta_question +
      "\". The app shows it on screen at the end.\n\nPER-CHAPTER VISUALS — three distinct assets:\n  * heroA: ~8-10s Veo clip. The protagonist physically initiates the chapter's moment.\n  * heroB: ~8-10s Veo clip. The same person escalating it. Describe the action, the framing and the\n    setting only: the app adds the character's identity block itself (CR-77).\n  * stillPrompt: a symbolic environmental still with no people in frame.\nAll three end with the mandatory style lock string.\n\nAlso return \"tactics\": the standard name of each chapter's concept, in order,\n\"characterDescription\" (face, hair and wardrobe as one reusable phrase — never the setting),\n\"archetype\" (a two-to-four word character label) and \"tags\"." +
      archetypeBlock(recentArchetypes)
    );
  }
  let variant = '';
  if (structure === 'numbered') {
    const r = chapterWordRange(chapters);
    variant =
      `\n\nVARIANT — NUMBERED DEFENSIVE ("${chapters} Signs / ${chapters} Tactics"):\n- Exactly ${chapters}` +
      " chapters, each built around ONE named tactic someone uses on the viewer.\n- Chapter \"title\" is the tactic's plain name (\"Love Bombing\", \"The Foot In The Door\").\n- miniHook: the moment the viewer meets it. mechanism: how it works on them.\n  microReframe: HOW TO SPOT IT — the single tell that gives it away, and what to do.\n- Each chapter is " +
      `${r.min}-${r.max} spoken words (this replaces the 70-110 range above).\n- The cold open states the count ("${chapters}` +
      " tactics are working on you right now\" in spirit,\n  never that exact phrasing).\n- Title formula, max 60 characters:\n  \"[" +
      chapters +
      "] [Tactics/Signs] [Someone Is Using On You / People Use To …]\"\n  e.g. \"" +
      chapters +
      " Tactics People Use To Control You\".\n- Keep the framing defensive — protecting the viewer, never teaching them to manipulate.";
  }
  return (
    BRAND_BIBLE +
    `\n\nTASK: Write one long-form 16:9 deep dive.\n\nTOPIC: ${topic}\nCATEGORY: ${category}\nCHAPTERS: exactly ${chapters}` +
    `\n\nTOTAL SPOKEN WORDS: ${LONG_WORD_MIN}-${LONG_WORD_MAX}. Never exceed ${LONG_WORD_MAX}` +
    ". Hard constraint.\n\nSTRUCTURE:\n- COLD OPEN (12-16 words): A high-stakes, visceral opening image or claim.\n- " +
    chapters +
    " CHAPTERS, 70-110 spoken words each, each built from three parts:\n    * miniHook (12-18 words) — a re-engagement beat that earns the next 45 seconds.\n    * mechanism (40-60 words) — the psychological dynamic, told through a specific\n      interpersonal scenario rather than abstraction.\n    * microReframe (16-24 words) — an actionable boundary or mental shift.\n  Also return \"narration\" for each chapter: miniHook + mechanism + microReframe joined\n  into one natural spoken paragraph. This is the exact text that will be voiced.\n- CLOSING SYNTHESIS (25-35 words): Unify every chapter into one overarching insight.\n  It MUST end with exactly:\n  \"Stay curious, keep your eyes wide, and remember: once you see the pattern, you hold the power.\"\n\nPER-CHAPTER VISUALS — three distinct assets, following the three-beat visual architecture:\n  * heroA: ~8-10s Veo clip. The protagonist physically initiates the scenario's tension.\n  * heroB: ~8-10s Veo clip. The same person escalating the behavioural dynamic. Describe the action,\n    the framing and the setting only: the app adds the character's identity block itself, so never\n    restate face, hair or wardrobe (CR-77).\n  * stillPrompt: a symbolic environmental still with no people in frame — an object or\n    space that carries the reframe as metaphor. This becomes a Ken Burns pan/zoom.\nAll three end with the mandatory style lock string.\n" +
    variant +
    "\n\nAlso return \"tactics\": the standard name of every tactic the video covers, in order.\n\nAlso return \"characterDescription\" (face, hair and wardrobe as one reusable phrase — never the setting) and\n\"archetype\" (a two-to-four word character label)." +
    archetypeBlock(recentArchetypes)
  );
}

export function topicIdeasInstruction(category: string, count: number, existing: string[], priority: string[] = PRIORITY_TACTICS): string {
  const defensive =
    category.trim().toLowerCase() === DEFENSIVE_CATEGORY.toLowerCase()
      ? "\n\nDEFENSIVE LANE — at least a third of the proposals are \"signs someone is using X on you\":\nhow to spot a named tactic being used on the viewer, and what gives it away."
      : '';
  const existingList = existing.length ? existing.map((t) => `- ${t}`).join('\n') : '(none yet)';
  return (
    BRAND_BIBLE +
    `\n\nTASK: Propose ${count} fresh video topics for the category "${category}` +
    "\".\n\nEach topic must name a SPECIFIC psychological tactic with an observable behavioural\nsignature — not a broad field, and not a generic label. \"Why we reread messages we\nalready memorised\" is a topic; \"anxiety\" is not. \"Foot-in-the-door: why a tiny favour\nmakes the next one impossible to refuse\" is a topic; \"manipulation tactics\" is not.\n\nFrame each so the viewer is the one it is happening TO, and phrase it around what the\nviewer does (\"Why you copy strangers\"), with the tactic named in the angle.\n\nWEIGHT TOWARD THESE — what has worked on this channel:\n" +
    priority.map((t) => `- ${t}`).join('\n') +
    '\nAt least half the proposals should centre on one of these or a close relative.' +
    defensive +
    '\n\nDO NOT LEAD WITH: ' +
    DEPRIORITISED_TACTICS.join('; ') +
    ". These underperform here. Propose one\nonly if it is the single best fit for the category.\n\nDo not propose anything that overlaps with these existing topics:\n" +
    existingList
  );
}

export function titleCheckInstruction(title: string): string {
  return (
    'You are proofreading a YouTube Shorts title before it is published.\n\nTITLE: ' +
    JSON.stringify(title) +
    "\n\nCheck ONLY grammar and whether it reads naturally to a native English speaker:\nsubject-verb agreement, missing words, wrong word forms, awkward capitalisation.\nTitle Case is intended; do not flag it. Do not rewrite for style, length or punch.\n\nReturn \"ok\": true if it is correct. Otherwise \"ok\": false, \"corrected\": the same title\nwith only the grammar fixed, and \"issue\": one short sentence naming the problem."
  );
}
