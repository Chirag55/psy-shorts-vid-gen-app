import yaml from 'yaml';
import { isHootPose, poseNamedIn, type HootPose } from './hoot';
import { LF_CATCHPHRASE } from './longformPlan';
import { parseSubtitles, parseVoiceSettings } from './viralBatch';
import { parseShotTimes } from './bankTiming';

/**
 * Topic bank v2 parser. A bank is a markdown export: one `### ID — Title`
 * heading per entry, followed by a fenced YAML block of fields and, for
 * Shorts, the narration (and for long-forms, chapters marked `[Chapter: …]`).
 * Anything malformed is reported per line instead of failing the import.
 */

export const PILLARS = ['Persuasion & Influence', 'Manipulation & Defense', 'Cognitive Bias', 'Body Language & Social'];
export const V2_FORMATS = ['STUDY', 'SCEN', 'TACTIC', 'MYTH', 'LIST', 'DEFENSE'];
export const ENDINGS = ['SIGNOFF', 'LOOP'];
export const SIGNOFF_CARD = 'Stay curious, stay sharp.';
export const CATCHPHRASE = "...and that's the mind for you. Stay curious, stay sharp.";
export const V2_BANK_ID = 'mindfiles-v2';
export const V2_TITLE_MAX = 60;
export const LONG_ALT_MAX = 70;
export const THUMBNAIL_MAX_WORDS = 4;
export const THUMBNAIL_MIN_WORDS = 2;
export const LONG_FORMATS = ['A', 'B', 'C', 'D', 'E'];
export const LONG_FORMAT_NAMES: Record<string, string> = { A: 'Identity', B: 'Aspirational', C: 'Explainer', D: 'Book summary', E: 'Calm compilation' };
export const SHORT_PRIORITIES = ['A', 'B', 'C', 'published'];
export const VIRALITY_LEVELS = ['high', 'medium', 'low'];
export const CARD_TEMPLATES = ['count_up', 'split_compare', 'icon_array', 'bar', 'study', 'bullets', 'protect'];
export const CAST_SHARE_DEFAULT = 0.35;
export const MAX_ANCHORS = 4;
export const FLAGSHIP_ANCHORS = 6;
export const SCREENPLAY_KEYS = [
  'protagonist', 'cast', 'story_spine', 'flow_budget_credits', 'flow_clips', 'stat_cards', 'hoot_moments', 'guess_pauses',
  'silence_beats', 'music', 'cast_share_max', 'anchors', 'reenactments', 'metaphors', 'inserts', 'scenes', 'scene_count', 'character_looks',
];
export const MUSIC_MOODS = ['curious_pulse', 'warm_romance', 'playful_pizzicato', 'tense_low', 'reflective_piano', 'uplifting_resolve'];
export const POSE_ALIASES: Record<string, HootPose> = { amused: 'happy' };
export const GUESS_SECONDS = 1.5;
export const SILENCE_SECONDS = 0.8;

/** Fields a Short entry may carry; anything else is reported as unknown. */
const SHORT_FIELDS = new Set([
  'id', 'pillar', 'format', 'ending', 'hook_text', 'related_longform', 'source', 'effect', 'hashtags', 'tags', 'long_tail', 'status',
  'video_id', 'published_at', 'hook_spoken', 'hook_onscreen', 'beats', 'loop_line', 'feeds_longform', 'version', 'skip_reason', 'virality',
  'pinned_comment', 'settings_pool', 'insert_props', 'metaphor', 'hook_alt', 'title_alt', 'description_line', 'source_line', 'visual_beats',
  'bank_id', 'priority', 'queue', 'title_final', 'description_full', 'evidence', 'ig_keywords', 'ig_line1', 'ig_hashtags', 'ig_first_comment',
  'clip_ids', 'still_ids', 'mood', 'audit', 'hook_text_pov', 'test_profile', 'test_hook', 'shots', 'est_seconds', 'compliance', 'character_looks',
  'viral_batch', 'upload_order', 'voice_settings', 'subtitles', 'bottom_overlay', 'thumb_text', 'thumb_visual',
  'virality_rank', 'gemini_score', 'shot_times',
]);

/** Fields a reader may find on either kind (accepted without a warning in the other kind's block). */
const SHARED_FIELDS = new Set([
  'effect', 'hashtags', 'tags', 'long_tail', 'format_type', 'hoot_hook_pose', 'next_video', 'comment_question', 'title_alts', 'thumbnail_texts',
  'thumbnail_concepts', 'hook_spoken', 'hook_onscreen', 'beats', 'loop_line', 'feeds_longform', 'pinned_comment', 'settings_pool', 'insert_props',
  'metaphor', 'virality', 'hook_alt', 'title_alt', 'description_line', 'source_line', 'visual_beats', 'bank_id', 'priority', 'queue', 'title_final',
  'description_full', 'evidence', 'ig_keywords', 'ig_line1', 'ig_hashtags', 'ig_first_comment', 'clip_ids', 'still_ids', 'mood', 'audit',
  'hook_text_pov', 'test_profile', 'test_hook', 'shots', 'est_seconds', 'compliance', 'character_looks', 'structure', 'description',
  'related_shorts', 'thumbnail_concept', 'cold_open', 'interrupts', 'feeder_shorts', 'chapters', 'flagship', 'item_count', 'pattern_interrupt',
  'recap_line', 'care_line', 'next_teaser', 'visual_plan', 'description_intro', 'description_body', 'evidence_lines', 'written_plan',
]);

/** Fields a long-form entry may carry. */
const LONG_FIELDS = new Set([
  'id', 'pillar', 'publish_order', 'target_length', 'thumbnail_text', 'sources', 'effect', 'hashtags', 'tags', 'long_tail', 'status', 'video_id',
  'published_at', 'format_type', 'hoot_hook_pose', 'next_video', 'comment_question', 'title_alts', 'thumbnail_texts', 'thumbnail_concepts',
  'thumbnail_concept', 'cold_open', 'interrupts', 'feeder_shorts', 'chapters', 'screenplay', 'flagship', 'hook_alt', 'item_count',
  'pattern_interrupt', 'recap_line', 'care_line', 'next_teaser', 'visual_plan', 'description_intro', 'description_body', 'evidence_lines',
  'written_plan', 'structure', 'description', 'related_shorts', 'compliance', 'care_line', 'version',
]);

/** `### D01 — The One Word That Forces a Yes` (or `##` for long-forms). */
const HEADING = /^(#{2,3})\s+(\S+)\s+[—–-]\s+(.+?)\s*$/;
const ANY_HEADING = /^#{1,6}\s/;

export interface BankIssue {
  line: number;
  id?: string;
  reason: string;
}

function isText(v: unknown): v is string {
  return typeof v === 'string' && v.trim().length > 0;
}

/** Words that carry a letter or digit (dashes and bullets are not words). */
function words(s: string): string[] {
  return s.trim().split(/\s+/).filter((w) => /[\p{L}\p{N}]/u.test(w));
}

function asText(v: unknown): string {
  if (typeof v === 'string') return v.trim();
  return typeof v === 'number' ? String(v) : '';
}

function asList(v: unknown): any[] {
  return Array.isArray(v) ? v.filter((x) => Boolean(x) && typeof x === 'object') : [];
}

/** Typographic quotes, ellipsis and runs of whitespace flattened. */
function plain(s: string): string {
  return s.replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/…/g, '...').replace(/\s+/g, ' ').trim();
}

function endsWithCatchphrase(s: string): boolean {
  return plain(s).toLowerCase().endsWith(plain(CATCHPHRASE).toLowerCase());
}

function hasCatchphrase(s: string): boolean {
  return plain(s).toLowerCase().includes("and that's the mind for you");
}

/** Each line whitespace-collapsed; empty lines dropped. */
function keepLines(s: string): string {
  return s
    .split(/\r?\n/)
    .map((l) => l.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .join('\n');
}

/** Text with `[Chapter: Title]` markers → the chapters and whatever came before the first marker. */
function splitChapters(text: string): { chapters: { title: string; narration: string }[]; before: string } {
  const re = /\[Chapter:\s*([^\]]+?)\s*\]/g;
  const marks: { title: string; start: number; end: number }[] = [];
  for (let m = re.exec(text); m; m = re.exec(text)) marks.push({ title: m[1].trim(), start: m.index, end: m.index + m[0].length });
  const before = (marks.length ? text.slice(0, marks[0].start) : text).trim();
  const chapters = marks.map((mk, i) => ({
    title: mk.title,
    narration: keepLines(text.slice(mk.end, i + 1 < marks.length ? marks[i + 1].start : text.length)),
  }));
  return { chapters, before };
}

/** "12:30 min" → 12.5, "11 min" → 11. */
function minutesOf(v: unknown): number | undefined {
  const mmss = /(\d+):(\d{2})\s*min/i.exec(String(v ?? ''));
  if (mmss) return Math.round((Number(mmss[1]) + Number(mmss[2]) / 60) * 10) / 10;
  const m = /(\d+(?:\.\d+)?)\s*min/i.exec(String(v ?? ''));
  return m ? Number(m[1]) : undefined;
}

/** "#a #b c" → ["a", "b", "c"], lower-case, deduplicated. */
function parseHashtagField(s: string): string[] {
  return [...new Set((s.match(/#?[\p{L}\p{N}_]+/gu) ?? []).map((t) => t.replace(/^#/, '').toLowerCase()))];
}

/** "a, b, A" → ["a", "b"] (first spelling kept). */
function parseTagField(s: string): string[] {
  const seen = new Set<string>();
  return s
    .split(',')
    .map((t) => t.trim())
    .filter((t) => t && !seen.has(t.toLowerCase()) && (seen.add(t.toLowerCase()), true));
}

function stringList(v: unknown): string[] | undefined {
  if (v === undefined) return undefined;
  return Array.isArray(v) && v.every(isText) ? v.map((s: string) => s.trim()) : undefined;
}

/** Problems with a thumbnail text: more than one *accent*, or the wrong word count. */
export function thumbnailTextProblems(text: string): string[] {
  const accents = text.match(/\*[^*]+\*/g) ?? [];
  const stars = text.match(/\*/g) ?? [];
  const out: string[] = [];
  if (stars.length && !(accents.length === 1 && stars.length === 2)) {
    out.push(`"${text}" marks more than one *accent* (the red word); mark one or none`);
  }
  const n = words(text.replace(/\*/g, '')).length;
  if (n < THUMBNAIL_MIN_WORDS || n > THUMBNAIL_MAX_WORDS) {
    out.push(`"${text}" is ${n} words; a thumbnail carries ${THUMBNAIL_MIN_WORDS} to ${THUMBNAIL_MAX_WORDS}`);
  }
  return out;
}

type Meta = Record<string, any>;

/** Optional fields shared by both kinds, validated into `meta` (keys as in the bank). */
function metaFields(f: Record<string, any>, line: number, id: string, issues: BankIssue[]): Meta {
  const meta: Meta = {};
  const bad = (reason: string) => issues.push({ line, id, reason });
  if (f.effect !== undefined) {
    if (isText(f.effect)) meta.effect = f.effect.trim();
    else bad('"effect" must be text');
  }
  if (f.hashtags !== undefined) {
    const list = typeof f.hashtags === 'string' && f.hashtags.trim() ? parseHashtagField(f.hashtags) : stringList(f.hashtags);
    if (!list) bad('"hashtags" must be a list of text, or hashtags separated by spaces');
    else if (list.length > 5) bad(`"hashtags" lists ${list.length}; a description carries 2 to 5 in all`);
    else meta.hashtags = list.map((h) => h.replace(/^#/, '').replace(/\s+/g, ''));
  }
  if (f.tags !== undefined) {
    const list = typeof f.tags === 'string' && f.tags.trim() ? parseTagField(f.tags) : stringList(f.tags);
    if (!list) bad('"tags" must be a list of text, or tags separated by commas');
    else meta.tags = list;
  }
  const text = (v: unknown) => (isText(v) ? v.trim() : undefined);
  const lines = (v: unknown): string[] | undefined => {
    if (Array.isArray(v)) return v.filter(isText).map((s) => s.trim());
    return isText(v) ? v.split(/\n|;/).map((s) => s.trim()).filter(Boolean) : undefined;
  };
  const ids = (v: unknown): string[] | undefined => {
    if (Array.isArray(v)) return v.filter(isText).map((s) => s.trim());
    return isText(v) ? v.split(/[\s,]+/).filter(Boolean) : undefined;
  };
  const assign = (key: string, v: unknown) => {
    if (v === undefined) return;
    if (Array.isArray(v) && !v.length) return;
    meta[key] = v;
  };
  assign('hook_spoken', text(f.hook_spoken));
  assign('hook_onscreen', text(f.hook_onscreen));
  assign('beats', lines(f.beats));
  assign('loop_line', text(f.loop_line));
  assign('feeds_longform', text(f.feeds_longform));
  assign('thumbnail_concept', text(f.thumbnail_concept));
  assign('cold_open', text(f.cold_open));
  assign('interrupts', lines(f.interrupts));
  assign('feeder_shorts', ids(f.feeder_shorts));
  assign('chapters_field', lines(f.chapters));
  assign('pinned_comment', text(f.pinned_comment));
  assign('settings_pool', lines(f.settings_pool));
  assign('insert_props', lines(f.insert_props));
  assign('metaphor', text(f.metaphor));
  assign('hook_alt', text(f.hook_alt));
  assign('title_alt', text(f.title_alt));
  assign('description_line', text(f.description_line));
  assign('source_line', text(f.source_line));
  const beats = Array.isArray(f.visual_beats)
    ? lines(f.visual_beats)
    : isText(f.visual_beats)
      ? f.visual_beats.split('//').map((s: string) => s.trim()).filter(Boolean)
      : undefined;
  assign('visual_beats', beats);
  assign('bank_id', text(f.bank_id));
  assign('title_final', text(f.title_final));
  assign('description_full', text(f.description_full)?.replace(/\\n/g, '\n'));
  assign('evidence', text(f.evidence));
  assign('ig_keywords', text(f.ig_keywords));
  assign('ig_line1', text(f.ig_line1));
  assign('ig_hashtags', text(f.ig_hashtags));
  assign('ig_first_comment', text(f.ig_first_comment));
  assign('clip_ids', ids(f.clip_ids));
  assign('still_ids', ids(f.still_ids));
  assign('audit', text(f.audit));
  assign('hook_text_pov', text(f.hook_text_pov));
  assign('compliance', text(f.compliance));
  assign('viral_batch', text(f.viral_batch));
  assign('upload_order', text(f.upload_order));
  assign('voice_settings', text(f.voice_settings));
  assign('bottom_overlay', text(f.bottom_overlay));
  assign('thumb_text', text(f.thumb_text));
  assign('thumb_visual', text(f.thumb_visual));
  if (f.subtitles !== undefined) {
    const { cues, bad: wrong } = parseSubtitles(lines(f.subtitles) ?? []);
    if (wrong.length) bad(`"subtitles" lines must read "0:00-0:02.5 | text" (${wrong.length} do not)`);
    else assign('subtitles', cues);
  }
  if (f.shot_times !== undefined) {
    const { times, bad: wrong } = parseShotTimes(lines(f.shot_times) ?? []);
    if (wrong.length) bad(`"shot_times" lines must read "MF031-C1 0.0-3.0" (${wrong.length} do not)`);
    else assign('shot_times', times);
  }
  if (f.voice_settings !== undefined && !parseVoiceSettings(String(f.voice_settings))) {
    bad('"voice_settings" names no stability, clarity, style or speed');
  }
  if (Array.isArray(f.character_looks)) assign('character_looks', f.character_looks.map((s: unknown) => String(s).trim()).filter(Boolean));
  for (const key of ['shots', 'est_seconds']) {
    if (f[key] === undefined) continue;
    const n = Number(f[key]);
    if (!Number.isFinite(n) || !(n > 0)) bad(`"${key}" must be a number (it is "${String(f[key])}")`);
    else meta[key] = n;
  }
  const choice = (key: string, allowed: string[], message: string) => {
    if (f[key] === undefined) return;
    const v = String(f[key]).trim().toLowerCase();
    if (allowed.includes(v)) meta[key] = v;
    else bad(`${message} (it is "${String(f[key])}")`);
  };
  choice('test_profile', ['calm', 'punchy'], '"test_profile" must be calm or punchy');
  choice('test_hook', ['label', 'pov'], '"test_hook" must be label or pov');
  choice('mood', ['warm', 'dark'], '"mood" must be warm or dark');
  assign('gemini_score', text(f.gemini_score));
  if (f.virality_rank !== undefined) {
    const r = Number(f.virality_rank);
    if (Number.isInteger(r) && r >= 1) meta.virality_rank = r;
    else bad(`"virality_rank" must be a whole number from 1 (it is "${String(f.virality_rank)}")`);
  }
  if (f.queue !== undefined) {
    const q = Number(f.queue);
    if (Number.isInteger(q) && q >= 1) meta.queue = q;
    else bad(`"queue" must be a whole number from 1 (it is "${String(f.queue)}")`);
  }
  if (f.priority !== undefined) {
    const p = String(f.priority).trim();
    const hit = SHORT_PRIORITIES.find((x) => x.toLowerCase() === p.toLowerCase());
    if (hit) meta.priority = hit;
    else bad(`"priority" must be A, B, C or published (it is "${p}")`);
  }
  if (f.virality !== undefined) {
    const v = String(f.virality).trim().toLowerCase();
    if (VIRALITY_LEVELS.includes(v)) meta.virality = v;
    else bad(`"virality" must be high, medium or low (it is "${String(f.virality)}")`);
  }
  if (f.long_tail !== undefined) {
    const list = stringList(f.long_tail);
    if (!list) bad('"long_tail" must be a list of text');
    else if (list.length < 3 || list.length > 5) bad(`"long_tail" lists ${list.length}; CR-56 asks for 3 to 5`);
    else meta.long_tail = list;
  }
  return meta;
}

export interface ThumbnailConcept {
  variant: 'A' | 'B' | 'C';
  background: 'white' | 'black';
  pose?: HootPose;
  text: string;
}

/** "B black: hoot(shocked) on the left…" → its variant, background and Hoot pose; un-prefixed concepts take A/B/C by position. */
export function parseConcept(text: string, index?: number): ThumbnailConcept | null {
  const m = /^\s*([ABC])\s+(white|black)\s*:\s*(.+)$/i.exec(text);
  if (m) {
    return {
      variant: m[1].toUpperCase() as ThumbnailConcept['variant'],
      background: m[2].toLowerCase() as ThumbnailConcept['background'],
      pose: poseNamedIn(m[3]),
      text: m[3].trim(),
    };
  }
  if (index === undefined || index < 0 || index > 2 || !text.trim()) return null;
  const variant = (['A', 'B', 'C'] as const)[index];
  return { variant, background: variant === 'B' ? 'black' : 'white', pose: poseNamedIn(text), text: text.trim() };
}

type Report = (message: string, line: number) => void;

/** Long-form packaging fields (playbook §4): format type, Hoot pose, alt titles, thumbnail texts and concepts. */
function packagingFields(f: Record<string, any>, id: string, lineOf: (key: string) => number, error: Report, warn: Report): Meta {
  const out: Meta = {};
  if (f.format_type !== undefined) {
    const m = /^\s*([A-E])\b/.exec(String(f.format_type));
    if (m) out.format_type = m[1];
    else error(`${id}: format_type must start with A, B, C, D or E (playbook §4)`, lineOf('format_type'));
  }
  if (f.hoot_hook_pose !== undefined) {
    const pose = String(f.hoot_hook_pose).trim().toLowerCase();
    if (isHootPose(pose)) out.hoot_hook_pose = pose;
    else error(`${id}: hoot_hook_pose "${String(f.hoot_hook_pose)}" is not a Hoot v2 state`, lineOf('hoot_hook_pose'));
  }
  if (f.next_video !== undefined) {
    const m = /^\s*(MF-L-\d{2,})\b/.exec(String(f.next_video));
    if (m) out.next_video = m[1];
    else error(`${id}: next_video must start with a long-form id like MF-L-02`, lineOf('next_video'));
  }
  if (f.comment_question !== undefined) {
    if (isText(f.comment_question)) out.comment_question = f.comment_question.trim();
    else error(`${id}: comment_question must be text`, lineOf('comment_question'));
  }
  if (f.title_alts !== undefined) {
    const alts = stringList(f.title_alts);
    if (!alts?.length) {
      error(`${id}: title_alts must be a list of titles`, lineOf('title_alts'));
    } else {
      alts.forEach((t, i) => {
        const trimmed = t.replace(/\s*\([^)]*\)\s*$/, '').trim();
        if (t.length > LONG_ALT_MAX && trimmed && trimmed.length <= LONG_ALT_MAX && trimmed !== t) {
          alts[i] = trimmed;
          warn(`${id}: the alternative title "${t}" was ${t.length} characters (limit ${LONG_ALT_MAX}); kept as "${trimmed}"`, lineOf('title_alts'));
        }
      });
      const long = alts.find((t) => t.length > LONG_ALT_MAX);
      if (!long) out.title_alts = alts;
      else error(`${id}: the alternative title "${long}" is ${long.length} characters; the limit is ${LONG_ALT_MAX}`, lineOf('title_alts'));
    }
  }
  if (f.thumbnail_texts !== undefined) {
    const texts = stringList(f.thumbnail_texts);
    if (!texts?.length) {
      error(`${id}: thumbnail_texts must be a list`, lineOf('thumbnail_texts'));
    } else {
      const problems = texts.flatMap(thumbnailTextProblems);
      if (!problems.length) out.thumbnail_texts = texts;
      else problems.forEach((p) => error(`${id}: ${p}`, lineOf('thumbnail_texts')));
    }
  }
  if (f.thumbnail_concepts !== undefined) {
    const concepts = stringList(f.thumbnail_concepts);
    if (!concepts?.length) {
      error(`${id}: thumbnail_concepts must be a list`, lineOf('thumbnail_concepts'));
    } else {
      const unparsed = concepts.find((c, i) => !parseConcept(c, i));
      const variants = concepts.map((c, i) => parseConcept(c, i)?.variant);
      if (unparsed) {
        error(`${id}: the concept "${unparsed.slice(0, 40)}…" must start "A white:", "B black:" or similar`, lineOf('thumbnail_concepts'));
      } else if (new Set(variants).size !== variants.length) {
        error(`${id}: thumbnail_concepts repeats a variant letter`, lineOf('thumbnail_concepts'));
      } else {
        const badHoot = concepts.find((c, i) => /\bhoot\s*\(/i.test(c) && !parseConcept(c, i)?.pose);
        if (badHoot) error(`${id}: "${badHoot.slice(0, 40)}…" names a Hoot state that isn't in pack v2`, lineOf('thumbnail_concepts'));
        else out.thumbnail_concepts = concepts;
      }
    }
  }
  if (out.thumbnail_texts && out.thumbnail_concepts && out.thumbnail_texts.length !== out.thumbnail_concepts.length) {
    error(
      `${id}: ${out.thumbnail_texts.length} thumbnail_texts but ${out.thumbnail_concepts.length} thumbnail_concepts; they pair up`,
      lineOf('thumbnail_concepts'),
    );
  }
  return out;
}

function norm(s: string): string {
  return s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
}

/** How many times `needle` appears in `haystack` once quotes and whitespace are flattened. */
function occurrences(haystack: string, needle: string): number {
  const h = plain(haystack);
  const n = plain(needle);
  if (!n) return 0;
  let count = 0;
  for (let i = h.indexOf(n); i >= 0; i = h.indexOf(n, i + n.length)) count++;
  return count;
}

export interface VisualPlanRow {
  setting: string;
  cutaway: string;
  chapter: string;
}

/** Flagship long-form fields: the numbered-list structure, spoken lines that must be in the narration, the visual plan. */
function flagshipFields(
  f: Record<string, any>,
  id: string,
  chapters: { title: string }[],
  narration: string,
  lineOf: (key: string) => number,
  error: Report,
  warn: Report,
): Meta {
  const out: Meta = {};
  if (f.flagship !== undefined) {
    const v = String(f.flagship).trim().toLowerCase();
    if (['yes', 'true'].includes(v)) out.flagship = true;
    else if (!['no', 'false'].includes(v)) error(`${id}: flagship must be yes or no`, lineOf('flagship'));
  }
  if (f.hook_alt !== undefined) {
    if (isText(f.hook_alt)) out.hook_alt = f.hook_alt.trim();
    else error(`${id}: hook_alt must be text`, lineOf('hook_alt'));
  }
  if (f.description_intro !== undefined) {
    if (isText(f.description_intro)) out.description_intro = f.description_intro.trim();
    else error(`${id}: description_intro must be text`, lineOf('description_intro'));
  }
  if (f.related_shorts !== undefined) {
    const list = stringList(f.related_shorts);
    if (list) out.related_shorts = list;
    else error(`${id}: related_shorts must be a list of Short ids`, lineOf('related_shorts'));
  }
  if (isText(f.description)) out.description = f.description.replace(/\\n/g, '\n').trim();
  for (const key of ['description_body', 'written_plan', 'structure']) {
    if (f[key] === undefined) continue;
    if (isText(f[key])) out[key] = f[key].trim();
    else error(`${id}: ${key} must be text`, lineOf(key));
  }
  if (f.evidence_lines !== undefined) {
    const list = stringList(f.evidence_lines);
    if (list?.length) out.evidence_lines = list;
    else error(`${id}: evidence_lines must list one "Tactic: source (evidence: …)" line per item`, lineOf('evidence_lines'));
  }
  for (const key of ['pattern_interrupt', 'recap_line', 'care_line', 'next_teaser']) {
    if (f[key] === undefined) continue;
    if (!isText(f[key])) {
      error(`${id}: ${key} must be text`, lineOf(key));
      continue;
    }
    const v = f[key].trim();
    out[key] = v;
    const spoken = occurrences(narration, v);
    if (key === 'care_line' && spoken >= 1) {
      warn(`${id}: care_line "${v.slice(0, 50)}…" is not spoken; it goes in the description only`, lineOf(key));
    } else if (key !== 'next_teaser' && spoken < 1) {
      error(`${id}: ${key} "${v.slice(0, 50)}…" is not in the narration; it is spoken`, lineOf(key));
    }
  }
  if (f.item_count !== undefined) {
    const n = Number(f.item_count);
    if (Number.isInteger(n) && n >= 1 && n <= 12) out.item_count = n;
    else error(`${id}: item_count must be a whole number from 1 to 12`, lineOf('item_count'));
  }
  if (f.visual_plan !== undefined) {
    const lines = stringList(f.visual_plan);
    if (!lines?.length) {
      error(`${id}: visual_plan must list one row per item as "setting | cutaway object | chapter label"`, lineOf('visual_plan'));
      return out;
    }
    const rows: VisualPlanRow[] = [];
    lines.forEach((line, i) => {
      const [setting, cutaway, chapter] = line.split('|').map((c) => c.trim());
      if (setting && cutaway && chapter) rows.push({ setting, cutaway, chapter });
      else error(`${id}: visual_plan row ${i + 1} must be "setting | cutaway object | chapter label"`, lineOf('visual_plan'));
    });
    const titles = new Set(chapters.map((c) => c.title));
    if (rows.length === lines.length) {
      if (out.item_count !== undefined && rows.length !== out.item_count) {
        error(`${id}: visual_plan has ${rows.length} rows for ${out.item_count} items; it needs one row per item`, lineOf('visual_plan'));
      }
      const stray = rows.find((r) => !titles.has(r.chapter));
      if (stray) error(`${id}: visual_plan chapter "${stray.chapter}" is not a [Chapter: …] marker in the narration`, lineOf('visual_plan'));
      rows.forEach((r, i) => {
        if (i && norm(r.setting) === norm(rows[i - 1].setting)) {
          warn(`${id}: items ${i} and ${i + 1} share the setting "${r.setting}"; no two consecutive items should`, lineOf('visual_plan'));
        }
      });
      out.visual_plan = rows;
    }
  }
  return out;
}

/** A YAML-ish scalar: quoted strings unquoted, integers as numbers, anything else as written. */
function scalarOf(raw: string): string | number {
  const t = raw.trim();
  if (((t.startsWith('"') && t.endsWith('"')) || (t.startsWith("'") && t.endsWith("'"))) && t.length > 1) {
    try {
      return yaml.parse(t);
    } catch {
      return t.slice(1, -1);
    }
  }
  return /^-?\d+$/.test(t) ? Number(t) : t;
}

interface SourceLine {
  text: string;
  line: number;
}

interface Section {
  heading: string;
  code: string;
  title: string;
  line: number;
  body: SourceLine[];
}

/**
 * Top-level `field: value` lines, `field:` followed by `- item` lines, and
 * `field: [a, b]`. Each field's line is kept for error reports.
 */
function readFields(lines: SourceLine[]): { raw: Record<string, any>; lineOf: Map<string, number>; problems: { line: number; reason: string }[] } {
  const raw: Record<string, any> = {};
  const lineOf = new Map<string, number>();
  const problems: { line: number; reason: string }[] = [];
  for (let i = 0; i < lines.length; i++) {
    const { text, line } = lines[i];
    if (!text.trim() || /^\s*#/.test(text)) continue;
    const m = /^([A-Za-z_][\w-]*):(?:[ \t]+(.*))?$/.exec(text.replace(/\s+$/, ''));
    if (!m) {
      problems.push({ line, reason: `line ${line} is not "field: value" (${text.trim().slice(0, 40)})` });
      continue;
    }
    const key = m[1];
    if (lineOf.has(key)) {
      problems.push({ line, reason: `"${key}" is given twice (first at line ${lineOf.get(key)})` });
      continue;
    }
    lineOf.set(key, line);
    const value = (m[2] ?? '').trim();
    if (!value) {
      const list: unknown[] = [];
      let j = i;
      while (j + 1 < lines.length && /^\s*-\s+/.test(lines[j + 1].text)) {
        j++;
        list.push(scalarOf(lines[j].text.replace(/^\s*-\s+/, '')));
      }
      raw[key] = list.length ? list : '';
      i = j;
    } else if (value.startsWith('[')) {
      try {
        raw[key] = yaml.parse(value);
      } catch {
        problems.push({ line, reason: `"${key}" is not a readable [list]` });
      }
    } else {
      raw[key] = scalarOf(value);
    }
  }
  return { raw, lineOf, problems };
}

/** The bank's entries: `### CODE — Title` headings outside code fences, kept only when they carry an `id: MF-…`. */
function sections(md: string): Section[] {
  const lines = md.replace(/\r\n/g, '\n').split('\n');
  const out: Section[] = [];
  let cur: Section | null = null;
  let inFence = false;
  lines.forEach((text, i) => {
    if (/^```/.test(text)) inFence = !inFence;
    const m = inFence ? null : HEADING.exec(text);
    if (!inFence && ANY_HEADING.test(text)) {
      if (cur) out.push(cur);
      cur = m ? { heading: text, code: m[2], title: m[3], line: i + 1, body: [] } : null;
      return;
    }
    if (cur != null) cur.body.push({ text, line: i + 1 });
  });
  if (cur) out.push(cur);
  return out.filter((s) => s.body.some((b) => /^id:\s*MF-/.test(b.text.trim())));
}

export interface ScreenplayScene {
  id: string;
  chapter: string;
  starts_at: string;
  approx_start_s?: number;
  size: string;
  setting: string;
  action: string;
  move: string;
  kind?: string;
}

export interface Screenplay {
  cast: string[];
  flow_clips: { chapter: string; beat: string }[];
  stat_cards: { chapter: string; after: string; text: string; template?: string }[];
  hoot_moments: { chapter: string; after: string; pose: HootPose }[];
  guess_pauses: { chapter: string; before: string; secs: number }[];
  silence_beats: { chapter: string; before: string; secs: number }[];
  music: { from_chapter: string; mood: string }[];
  anchors: { chapter: string; beat: string }[];
  reenactments: { chapter: string; era: string; setting: string; look: string }[];
  metaphors: string[];
  inserts: string[];
  character_looks?: string[];
  scenes?: ScreenplayScene[];
  scene_count?: number;
  cast_share_max?: number;
  protagonist?: string;
  story_spine?: string;
  flow_budget_credits?: number;
}

export interface UnknownFields {
  id: string;
  line: number;
  fields: string[];
}

function readScenes(list: any[]): ScreenplayScene[] {
  const str = (v: unknown) => (typeof v === 'string' ? v.trim() : v !== undefined && v !== null ? String(v).trim() : '');
  return list.map((s) => {
    const sc = s ?? {};
    const approx = Number(sc.approx_start_s);
    const kind = str(sc.kind);
    return {
      id: str(sc.id),
      chapter: str(sc.chapter),
      starts_at: str(sc.starts_at),
      ...(Number.isFinite(approx) ? { approx_start_s: approx } : {}),
      size: str(sc.size),
      setting: str(sc.setting),
      action: str(sc.action),
      move: str(sc.move),
      ...(kind ? { kind } : {}),
    };
  });
}

/**
 * The `screenplay:` YAML block of a long-form: cast, Flow clips, stat cards,
 * Hoot moments, pauses and music cues, each tied to a `[Chapter: …]` marker and
 * a phrase that must occur exactly once in that chapter's narration.
 */
function readScreenplay(
  lines: SourceLine[],
  chapters: { title: string; narration: string }[],
  label: string,
  error: Report,
  unknown: UnknownFields[],
  id: string,
  warn: Report,
  maxAnchors: number = MAX_ANCHORS,
): Screenplay | undefined {
  const line = (lines[0]?.line ?? 1) - 1;
  try {
    const doc = yaml.parse(lines.map((l) => l.text).join('\n'));
    if (!doc || typeof doc !== 'object' || Array.isArray(doc)) throw new Error('not a mapping');
    const stray = Object.keys(doc).filter((k) => !SCREENPLAY_KEYS.includes(k));
    if (stray.length) unknown.push({ id, line, fields: stray.map((k) => `screenplay.${k}`) });
    const byTitle = new Map(chapters.map((c) => [c.title, c]));
    const chapterOf = (o: any, key: string, kind: string) => {
      const name = asText(o[key]);
      const ch = byTitle.get(name);
      if (!ch) error(`${label}: screenplay ${kind} names the chapter "${name}", which is not a [Chapter: …] marker`, line);
      return ch;
    };
    const phrase = (o: any, key: string, kind: string, ch?: { title: string; narration: string }) => {
      const text = asText(o[key]);
      if (!text) {
        error(`${label}: a screenplay ${kind} cue has no "${key}" phrase`, line);
      } else if (ch) {
        const n = occurrences(ch.narration, text);
        if (n !== 1) error(`${label}: screenplay ${kind} cue "${text}" matches ${n} time${n === 1 ? '' : 's'} in chapter "${ch.title}"; it must match exactly once`, line);
      }
      return text;
    };
    const sp: Screenplay = {
      cast: Array.isArray(doc.cast) ? doc.cast.map(asText).filter(Boolean) : [],
      flow_clips: [],
      stat_cards: [],
      hoot_moments: [],
      guess_pauses: [],
      silence_beats: [],
      music: [],
      anchors: [],
      reenactments: [],
      metaphors: Array.isArray(doc.metaphors) ? doc.metaphors.map(asText).filter(Boolean) : [],
      inserts: Array.isArray(doc.inserts) ? doc.inserts.map(asText).filter(Boolean) : [],
      ...(Array.isArray(doc.character_looks) ? { character_looks: doc.character_looks.map(asText).filter(Boolean) } : {}),
      ...(Array.isArray(doc.scenes) ? { scenes: readScenes(doc.scenes), scene_count: doc.scenes.length } : {}),
    };
    if (doc.cast_share_max !== undefined) {
      const v = Number(doc.cast_share_max);
      if (v > 0 && v <= 1) sp.cast_share_max = v;
      else error(`${label}: screenplay cast_share_max must be between 0 and 1`, line);
    }
    if (asText(doc.protagonist)) sp.protagonist = asText(doc.protagonist);
    if (asText(doc.story_spine)) sp.story_spine = asText(doc.story_spine);
    if (doc.flow_budget_credits !== undefined) {
      const v = Number(doc.flow_budget_credits);
      if (Number.isFinite(v) && v > 0) sp.flow_budget_credits = v;
      else error(`${label}: screenplay flow_budget_credits must be a number of credits`, line);
    }
    for (const c of asList(doc.flow_clips)) {
      const ch = chapterOf(c, 'chapter', 'flow clip');
      const beat = asText(c.beat);
      if (!beat) error(`${label}: a screenplay flow clip has no beat`, line);
      if (ch && beat) sp.flow_clips.push({ chapter: ch.title, beat });
    }
    for (const a of asList(doc.anchors)) {
      const ch = chapterOf(a, 'chapter', 'anchor');
      const beat = asText(a.beat);
      if (!beat) error(`${label}: a screenplay anchor has no beat`, line);
      if (ch && beat) sp.anchors.push({ chapter: ch.title, beat });
    }
    if (sp.anchors.length > maxAnchors) {
      warn(`${label}: ${sp.anchors.length} anchors; the bank fixes ${maxAnchors} scenes at most and the planner builds the rest (CR-72)`, line);
    }
    for (const r of asList(doc.reenactments)) {
      const ch = chapterOf(r, 'chapter', 'reenactment');
      const era = asText(r.era);
      const setting = asText(r.setting);
      if (!era || !setting) error(`${label}: a screenplay reenactment needs an era and a setting`, line);
      if (ch && era && setting) sp.reenactments.push({ chapter: ch.title, era, setting, look: asText(r.look) });
    }
    for (const s of asList(doc.stat_cards)) {
      const ch = chapterOf(s, 'chapter', 'stat card');
      const after = phrase(s, 'after', 'stat card', ch);
      const text = asText(s.text);
      if (!text) error(`${label}: a screenplay stat card has no text`, line);
      const template = asText(s.template);
      if (template && !CARD_TEMPLATES.includes(template)) {
        warn(`${label}: stat card template "${template}" is not one of ${CARD_TEMPLATES.join(', ')}; the planner picks one`, line);
      }
      if (ch && after && text) sp.stat_cards.push({ chapter: ch.title, after, text, ...(CARD_TEMPLATES.includes(template) ? { template } : {}) });
    }
    for (const h of asList(doc.hoot_moments)) {
      const ch = chapterOf(h, 'chapter', 'Hoot moment');
      const after = phrase(h, 'after', 'Hoot moment', ch);
      const raw = asText(h.pose).toLowerCase();
      const pose = POSE_ALIASES[raw] ?? raw;
      if (POSE_ALIASES[raw]) warn(`${label}: screenplay pose "${raw}" is not in Hoot pack v2.0.0; read as "${pose}"`, line);
      if (!isHootPose(pose)) error(`${label}: screenplay Hoot moment "${after.slice(0, 30)}": "${pose}" is not a Hoot v2 state`, line);
      else if (ch && after) sp.hoot_moments.push({ chapter: ch.title, after, pose });
    }
    const pauses: [string, { chapter: string; before: string; secs: number }[], number, string][] = [
      ['guess_pauses', sp.guess_pauses, GUESS_SECONDS, 'guess pause'],
      ['silence_beats', sp.silence_beats, SILENCE_SECONDS, 'silence beat'],
    ];
    for (const [key, list, fallback, kind] of pauses) {
      for (const p of asList(doc[key])) {
        const ch = chapterOf(p, 'chapter', kind);
        const before = phrase(p, 'before', kind, ch);
        const secs = p.secs !== undefined ? Number(p.secs) : fallback;
        if (!(secs > 0 && secs <= 10)) error(`${label}: screenplay ${kind} "${before.slice(0, 30)}": secs must be between 0 and 10`, line);
        else if (ch && before) list.push({ chapter: ch.title, before, secs });
      }
    }
    for (const m of asList(doc.music)) {
      const ch = chapterOf(m, 'from_chapter', 'music cue');
      const mood = asText(m.mood);
      if (!MUSIC_MOODS.includes(mood)) unknown.push({ id, line, fields: [`screenplay.music mood "${mood}"`] });
      else if (ch) sp.music.push({ from_chapter: ch.title, mood });
    }
    return sp;
  } catch (e) {
    const message = e instanceof Error ? e.message.split('\n')[0] : String(e);
    error(`${label}: the screenplay block can't be read (${message})`, line);
    return undefined;
  }
}

/** Rows of the bank's "Skip" table: `| D12 | topic | reason |`. */
function skipTable(md: string): { id: string; topic: string; reason: string }[] {
  const out: { id: string; topic: string; reason: string }[] = [];
  let inSkip = false;
  for (const line of md.replace(/\r\n/g, '\n').split('\n')) {
    if (/^#{2,4}\s/.test(line)) {
      inSkip = /^#{2,4}\s+Skip\b/i.test(line);
      continue;
    }
    if (!inSkip) continue;
    const m = /^\|\s*(D\d{2,})\s*\|\s*([^|]+?)\s*\|\s*(.+?)\s*\|\s*$/.exec(line);
    if (m) out.push({ id: `MF-S-${m[1]}`, topic: m[2], reason: m[3] });
  }
  return out;
}

/** "WHY YOU *STAY*" → words with the *accented* (red) ones flagged; an accent may span words. */
export function thumbnailWords(text: string): { word: string; accent: boolean }[] {
  const out: { word: string; accent: boolean }[] = [];
  let accent = false;
  for (let w of text.trim().split(/\s+/).filter(Boolean)) {
    let opened = false;
    if (w.startsWith('*')) {
      accent = true;
      opened = true;
      w = w.slice(1);
    }
    const closes = w.endsWith('*');
    if (closes) w = w.slice(0, -1);
    if (w) out.push({ word: w, accent });
    if (closes) accent = false;
    else if (opened) accent = true;
  }
  return out;
}

export interface BankEntryBase {
  schema: 2;
  id: string;
  title: string;
  pillar: string;
  line: number;
  [field: string]: any;
}

export interface ShortEntry extends BankEntryBase {
  kind: 'short';
  format: string;
  ending: 'SIGNOFF' | 'LOOP';
  hook_text: string;
  related_longform: string;
  source: string;
  narration: string;
}

export interface LongEntry extends BankEntryBase {
  kind: 'long';
  publish_order: number;
  target_min?: number;
  thumbnail_text: string;
  sources: string[];
  chapters: { title: string; narration: string }[];
  screenplay?: Screenplay;
}

export type BankEntry = ShortEntry | LongEntry;

export interface BankParse {
  entries: BankEntry[];
  rejected: BankIssue[];
  ignored: UnknownFields[];
  warnings: BankIssue[];
  skips: { id: string; topic: string; reason: string }[];
}

/** True for a v2 bank (fenced YAML blocks with MF-S-/MF-L- ids). */
export function isV2Bank(md: string): boolean {
  return /^```yaml[ \t]*\r?\n(?:[^\n]*\n)*?id:\s*MF-[SL]-/m.test(md);
}

export function withoutCatchphrase(s: string): string {
  if (!endsWithCatchphrase(s)) return s.trim();
  const p = plain(s);
  return p.slice(0, p.length - plain(CATCHPHRASE).length).trim();
}

export function parseBankV2(md: string): BankParse {
  const result: BankParse = { entries: [], rejected: [], ignored: [], warnings: [], skips: skipTable(md) };
  const seen = new Map<string, number>();
  const longIds = new Set<string>();
  const orders = new Map<number, string>();

  for (const section of sections(md)) {
    const issues: BankIssue[] = [];
    const yamlStart = section.body.findIndex((l) => /^```yaml\s*$/.test(l.text.trim()));
    const yamlEnd = yamlStart >= 0 ? section.body.findIndex((l, i) => i > yamlStart && /^```\s*$/.test(l.text.trim())) : -1;
    if (yamlStart < 0 || yamlEnd < 0) {
      result.rejected.push({ line: section.line, id: section.code, reason: `${section.code}: no complete \`\`\`yaml block under the heading` });
      continue;
    }
    const block = section.body.slice(yamlStart + 1, yamlEnd);
    const spAt = block.findIndex((l) => /^screenplay:\s*$/.test(l.text));
    let spLines: SourceLine[] = [];
    let fieldLines = block;
    if (spAt >= 0) {
      let j = spAt + 1;
      while (j < block.length && (!block[j].text.trim() || /^\s/.test(block[j].text))) j++;
      spLines = block.slice(spAt + 1, j);
      fieldLines = [...block.slice(0, spAt), ...block.slice(j)];
    }
    const read = readFields(fieldLines);
    if (read.problems.length) {
      result.rejected.push(...read.problems.map((p) => ({ line: p.line, id: section.code, reason: `${section.code}: ${p.reason}` })));
      continue;
    }
    const raw = read.raw;
    const fieldLine = (key: string) => read.lineOf.get(key) ?? section.body[yamlStart].line;
    for (const [k, v] of Object.entries(raw)) {
      if (v !== '' || !(SHORT_FIELDS.has(k) || LONG_FIELDS.has(k))) continue;
      const who = isText(raw.id) ? raw.id.trim() : section.code;
      result.warnings.push({ id: who, line: fieldLine(k), reason: `${who}: "${k}" is present but empty, so it is ignored` });
      if (SHARED_FIELDS.has(k)) delete raw[k];
    }
    const id = isText(raw.id) ? raw.id.trim() : '';

    const narrAt = section.body.findIndex((l, i) => i > yamlEnd && /^\*\*narration:\*\*\s*$/i.test(l.text.trim()));
    let narrLines: SourceLine[] = [];
    if (narrAt >= 0) {
      const rest = section.body.slice(narrAt + 1);
      const end = rest.findIndex((l) => /^---+\s*$/.test(l.text.trim()));
      narrLines = end >= 0 ? rest.slice(0, end) : rest;
    }
    const narration = narrLines.map((l) => l.text).join('\n').trim();
    const narrationLine = narrLines.find((l) => l.text.trim())?.line ?? (narrAt >= 0 ? section.body[narrAt].line : section.line);

    const isShort = /^MF-S-/.test(id);
    const isLong = /^MF-L-/.test(id);
    if (isLong) longIds.add(id);
    const reject = (reason: string, line: number = section.line) => issues.push({ line, id: section.code, reason });
    const warn = (reason: string, line: number = section.line) => result.warnings.push({ id, line, reason });

    if (!isShort && !isLong) reject(`${section.code}: id must look like MF-S-D01 or MF-L-01`, fieldLine('id'));
    else if (isShort && !/^MF-S-D\d{2,}$/.test(id)) reject(`${section.code}: a Short's id must look like MF-S-D01`, fieldLine('id'));
    else if (isLong && !/^MF-L-\d{2,}$/.test(id)) reject(`${section.code}: a long-form id must look like MF-L-01`, fieldLine('id'));
    else if (isShort ? id !== `MF-S-${section.code}` : id !== section.code) {
      reject(`${section.code}: the heading says ${section.code} but the id is ${id}`, fieldLine('id'));
    }
    if (id && seen.has(id)) reject(`${id} appears twice (first at line ${seen.get(id)})`, fieldLine('id'));

    const title = section.title.trim();
    if (!title) reject(`${section.code}: no title after the dash in the heading`);
    else if (title.length > V2_TITLE_MAX) reject(`${section.code}: the title is ${title.length} characters; the limit is ${V2_TITLE_MAX}`);
    if (!PILLARS.includes(raw.pillar)) reject(`${section.code}: pillar must be one of ${PILLARS.join(' / ')}`, fieldLine('pillar'));
    if (!narration) {
      reject(`${section.code}: no narration (a "**narration:**" line followed by the text)`, narrAt >= 0 ? section.body[narrAt].line : section.line);
    }

    const preamble = section.body.slice(0, yamlStart).map((l) => l.text).join('\n');
    const condition = /^>\s*\*\*Conditional:\*\*\s*(.+)$/m.exec(preamble)?.[1]?.trim();
    const version = typeof raw.version === 'number' ? raw.version : /^\s*(\d+)/.exec(String(raw.version ?? ''))?.[1];
    const meta = metaFields(raw, fieldLine('id'), section.code, issues);
    if (version !== undefined) meta.version = Number(version);
    if (condition) meta.condition = condition;
    if (isText(raw.skip_reason)) meta.skip_reason = raw.skip_reason.trim();
    else if (/^skipped/i.test(String(raw.status ?? ''))) meta.skip_reason = 'skipped in the file';
    if (isText(raw.status) && /^published\b/i.test(raw.status.trim())) {
      const fromPublished = isText(raw.published_at) ? /\d{4}-\d{2}-\d{2}/.exec(raw.published_at)?.[0] : undefined;
      meta.published_on = /\d{4}-\d{2}-\d{2}/.exec(raw.status)?.[0] ?? fromPublished ?? 'published';
    }
    const unknown = Object.keys(raw).filter((k) => !(isShort ? SHORT_FIELDS : LONG_FIELDS).has(k));

    if (isLong) {
      const order = raw.publish_order;
      if (!(typeof order === 'number' && Number.isInteger(order) && order >= 1)) {
        reject(`${section.code}: publish_order must be a whole number from 1`, fieldLine('publish_order'));
      } else if (orders.has(order) && !/^published/i.test(String(raw.status ?? ''))) {
        reject(`${section.code}: publish_order ${order} is also ${orders.get(order)}'s`, fieldLine('publish_order'));
      }
      const sources = stringList(raw.sources);
      if (!sources?.length) reject(`${section.code}: sources must list at least one citation`, fieldLine('sources'));
      if (!isText(raw.thumbnail_text)) reject(`${section.code}: missing thumbnail_text`, fieldLine('thumbnail_text'));
      else if (words(raw.thumbnail_text).length > THUMBNAIL_MAX_WORDS) {
        reject(`${section.code}: thumbnail_text is ${words(raw.thumbnail_text).length} words; CR-51 allows ${THUMBNAIL_MAX_WORDS}`, fieldLine('thumbnail_text'));
      }
      const { chapters, before } = splitChapters(narration);
      if (narration && before) reject(`${section.code}: the narration must open with a [Chapter: …] marker`, narrationLine);
      if (narration && chapters.length < 3) reject(`${section.code}: ${chapters.length} chapters; YouTube needs at least 3`, narrationLine);
      const empty = chapters.find((c) => !c.narration);
      if (empty) reject(`${section.code}: chapter "${empty.title}" has no narration`, narrationLine);
      if (narration && !endsWithCatchphrase(narration) && !plain(narration).endsWith(plain(LF_CATCHPHRASE))) {
        reject(`${section.code}: a long-form narration ends with "${CATCHPHRASE}" (or, from a written plan, "${LF_CATCHPHRASE}")`, narrationLine);
      }
      const packaging = packagingFields(raw, section.code, fieldLine, reject, warn);
      Object.assign(packaging, flagshipFields(raw, section.code, chapters, narration, fieldLine, reject, warn));
      if (spLines.length) {
        const sp = readScreenplay(spLines, chapters, section.code, reject, result.ignored, id, (m, l) => result.warnings.push({ id, line: l, reason: m }), packaging.flagship ? FLAGSHIP_ANCHORS : MAX_ANCHORS);
        if (sp) meta.screenplay = sp;
      }
      if (!issues.length) {
        if (!/^published/i.test(String(raw.status ?? ''))) orders.set(order, id);
        const minutes = minutesOf(raw.target_length);
        result.entries.push({
          kind: 'long',
          schema: 2,
          id,
          title,
          pillar: raw.pillar,
          publish_order: order,
          ...(minutes ? { target_min: minutes } : {}),
          thumbnail_text: String(raw.thumbnail_text).trim(),
          sources: sources ?? [],
          chapters,
          ...packaging,
          ...meta,
          line: section.line,
        } as LongEntry);
      }
    } else if (isShort) {
      if (!V2_FORMATS.includes(raw.format)) reject(`${section.code}: format must be one of ${V2_FORMATS.join(', ')}`, fieldLine('format'));
      if (!ENDINGS.includes(raw.ending)) reject(`${section.code}: ending must be SIGNOFF or LOOP`, fieldLine('ending'));
      if (!isText(raw.hook_text)) reject(`${section.code}: missing hook_text`, fieldLine('hook_text'));
      if (!isText(raw.related_longform) || !/^(MF-L-\d{2,}|L-\d{3,})$/.test(raw.related_longform.trim())) {
        reject(`${section.code}: related_longform must be a long-form id like MF-L-01 or L-001`, fieldLine('related_longform'));
      }
      if (!isText(raw.source)) reject(`${section.code}: missing source (the citation that goes into the description)`, fieldLine('source'));
      if (narration && /\[Chapter:/i.test(narration)) reject(`${section.code}: a Short's narration has no [Chapter: …] markers`, narrationLine);
      if (narration && raw.ending === 'SIGNOFF' && !endsWithCatchphrase(narration)) {
        reject(`${section.code}: ending is SIGNOFF, so the narration must end with "${CATCHPHRASE}"`, narrationLine);
      }
      if (narration && raw.ending === 'LOOP' && hasCatchphrase(narration)) {
        reject(`${section.code}: ending is LOOP, so the narration must not say the catchphrase`, narrationLine);
      }
      if (!issues.length) {
        result.entries.push({
          kind: 'short',
          schema: 2,
          id,
          title,
          pillar: raw.pillar,
          format: raw.format,
          ending: raw.ending,
          hook_text: String(raw.hook_text).trim(),
          related_longform: String(raw.related_longform).trim(),
          source: String(raw.source).trim(),
          narration: keepLines(narration),
          ...meta,
          line: section.line,
        } as ShortEntry);
      }
    }

    if (issues.length) result.rejected.push(...issues);
    else if (unknown.length) result.ignored.push({ id, line: section.line, fields: unknown });
    if (id && !seen.has(id)) seen.set(id, section.line);
  }

  if (longIds.size) {
    for (const e of [...result.entries]) {
      if (e.kind !== 'short' || longIds.has(e.related_longform) || /^L-\d/.test(e.related_longform)) continue;
      result.rejected.push({ line: e.line, id: e.id, reason: `${e.id}: related_longform ${e.related_longform} is not in this file` });
      result.entries = result.entries.filter((x) => x !== e);
    }
  }
  return result;
}

/** Sentences, keeping initials ("J. Smith") and quoted sentences whole. */
export function sentences(text: string): string[] {
  const t = text.replace(/\s+/g, ' ').trim();
  const out: string[] = [];
  const re = /[.!?]+["”’']?(?=\s+["“‘'.$\p{Lu}\p{N}])/gu;
  let start = 0;
  for (let m = re.exec(t); m; m = re.exec(t)) {
    const end = m.index + m[0].length;
    if (/(^|\s)\p{Lu}$/u.test(t.slice(start, m.index)) && m[0] === '.') continue;
    const head = t.slice(0, end);
    const straight = head.match(/"/g)?.length ?? 0;
    const open = straight % 2 === 1 || (head.match(/“/g)?.length ?? 0) > (head.match(/”/g)?.length ?? 0);
    if (open) continue;
    out.push(t.slice(start, end).trim());
    start = end;
  }
  const tail = t.slice(start).trim();
  if (tail) out.push(tail);
  return out.filter(Boolean);
}

export function countWords(s: string): number {
  return s.trim().split(/\s+/).filter(Boolean).length;
}

export function textWords(s: string): string[] {
  return words(s);
}

export function longNarration(e: { chapters: { narration: string }[] }): string {
  return e.chapters.map((c) => c.narration).join(' ');
}

export function narrationOf(e: BankEntry): string {
  return e.kind === 'short' ? e.narration : longNarration(e);
}

export function itemLabel(e: { id: string; title: string }): string {
  return `${e.id.replace(/^MF-S-/, '')} · ${e.title}`;
}

export { endsWithCatchphrase, keepLines, splitChapters, parseHashtagField, parseTagField, readFields, occurrences, readScenes };
