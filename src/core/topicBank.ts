/**
 * The legacy YAML topic bank (topic_bank_shorts / topic_bank_longform blocks
 * in markdown), and the v2/psych bank import plan, duplicates, the daily
 * picker and markdown export. Rebuilt from 6.1.13.
 */
import YAML from 'yaml';
import { complianceOf, isComplianceBank } from './compliance';
import { WEEKDAYS } from './schedule';
import { convertPsychBank, isPsychBank } from './psychBank';
import { isV2Bank, parseBankV2, readScenes, V2_BANK_ID, type BankEntry } from './bankV2';
import { lfReportLine } from './psychBank';
import { cueLine } from './viralBatch';

export const FRAMINGS = ['identity', 'self_callout', 'test', 'relationship', 'borrowed'];
const LONG_FRAMINGS = ['identity', 'self_callout', 'relationship', 'borrowed'];
const FORMATS = ['single', 'rapid_list', 'test'];
const YAML_BLOCK = /^```yaml[ \t]*\r?\n([\s\S]*?)^```[ \t]*$/gm;
const BANK_KEYS = ['topic_bank_shorts', 'topic_bank_longform'];
const BEAT_KINDS = ['hook', 'mechanism', 'reframe', 'item', 'closer', 'reveal', 'hold'];
export const SCRIPT_TOLERANCE = 0.15;
export const SHORT_CALM_WPS = 2;
export const CALM_TOLERANCE = 0.2;
export const LONG_TARGET_MIN = { min: 3, max: 15 };
const SHORT_FIELDS = new Set([
  'id', 'title', 'framing', 'format', 'length_s', 'concept', 'hook', 'beats_hint', 'stimulus', 'stimulus_hold_s',
  'cta_question', 'tag_line', 'priority', 'notes', 'script', 'visual_brief', 'seo', 'best_day', 'hook_card', 'status',
  'video_id', 'published_at', 'uploaded', 'hook_text', 'hook_text_pov', 'related_longform', 'skip_reason',
]);
const LONG_FIELDS = new Set([
  'id', 'title', 'framing', 'target_min', 'cold_open', 'chapters', 'closing_idea', 'related_shorts', 'cta_question',
  'priority', 'notes', 'script', 'seo', 'status', 'video_id', 'published_at', 'uploaded', 'structure', 'title_alts',
  'thumbnail_text', 'thumbnail_texts', 'thumbnail_concepts', 'tags', 'description', 'next_video', 'skip_reason',
  'scenes', 'scene_count', 'character_looks',
]);
const TITLE_STOP = new Set([
  'a', 'an', 'the', 'why', 'you', 'your', 'you’re', "you're", 'is', 'are', 'of', 'to', 'in', 'on', 'and', 'or', 'for',
  'what', 'who', 'how', 'when', 'it', 'this', 'that', 'be', 'do', 'does', 'people', 'someone', 'psychology',
]);
export const TITLE_OVERLAP_WARN = 0.6;
const DAY_MS = 86400000;
const SHORT_EXPORT_ORDER = [
  'id', 'title', 'framing', 'format', 'length_s', 'concept', 'hook', 'beats_hint', 'stimulus', 'stimulus_hold_s',
  'cta_question', 'tag_line', 'priority', 'notes', 'best_day', 'hook_card', 'visual_brief', 'script', 'seo',
];
const LONG_EXPORT_ORDER = [
  'id', 'title', 'framing', 'target_min', 'cold_open', 'chapters', 'closing_idea', 'related_shorts', 'cta_question',
  'priority', 'notes', 'script', 'seo',
];

const isString = (v: unknown): v is string => typeof v === 'string' && v.trim().length > 0;
const isNumber = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

function extractYamlBlocks(md: string): string[] {
  const out: string[] = [];
  YAML_BLOCK.lastIndex = 0;
  for (let m = YAML_BLOCK.exec(md); m; m = YAML_BLOCK.exec(md)) out.push(m[1]);
  return out;
}

const countScriptWords = (lines: string[]) => lines.join(' ').trim().split(/\s+/).filter(Boolean).length;

export type ScriptBeatKind = 'hook' | 'mechanism' | 'reframe' | 'item' | 'closer' | 'reveal' | 'hold';

export interface BankScriptBeat {
  beat: ScriptBeatKind;
  line?: string;
  on_screen?: string;
  duration_s?: number;
}

export interface ShortBankScript {
  source: 'bank' | 'edited';
  word_count: number;
  loops_into_hook: boolean;
  beats: BankScriptBeat[];
}

export interface LongBankScript {
  source: 'bank' | 'edited';
  word_count: number;
  cold_open: string;
  chapters: { title: string; narration: string }[];
  closing: string;
}

export interface BankSeo {
  description: string;
  hashtags: string[];
  tags: string[];
  pinned_comment: string;
  title_alt?: string;
  hook_alt?: string;
}

function validateShortScript(raw: any, topic: any): { script?: ShortBankScript; reason?: string } {
  if (raw === undefined) return {};
  const s = raw ?? {};
  if (!Array.isArray(s.beats) || !s.beats.length) return { reason: 'script needs a list of beats' };
  const beats: BankScriptBeat[] = [];
  for (const [i, b] of (s.beats as any[]).entries()) {
    const kind = b?.beat;
    if (!BEAT_KINDS.includes(kind)) return { reason: `script beat ${i + 1} has an unknown kind "${String(b?.beat)}"` };
    if (kind !== 'hold') {
      if (!isString(b.line)) return { reason: `script beat ${i + 1} (${kind}) has no line` };
    } else if (!(isNumber(b.duration_s) && !(b.duration_s <= 0))) {
      return { reason: `script beat ${i + 1} is a hold with no duration_s` };
    }
    beats.push({
      beat: kind,
      ...(isString(b.line) ? { line: b.line.trim() } : {}),
      ...(isString(b.on_screen) ? { on_screen: b.on_screen.trim() } : {}),
      ...(kind === 'hold' ? { duration_s: b.duration_s } : {}),
    });
  }
  const holds = beats.filter((b) => b.beat === 'hold');
  if (topic.format === 'test' && holds.length !== 1) return { reason: 'a test script needs exactly one hold beat' };
  if (topic.format !== 'test' && holds.length) return { reason: 'only a test script may have a hold beat' };
  if (beats[0].beat !== 'hook') return { reason: 'a script must open with its hook beat' };
  const words = countScriptWords(beats.filter((b) => b.line).map((b) => b.line as string));
  const spoken = topic.length_s - (topic.stimulus_hold_s ?? 0);
  const want = spoken * 2.4;
  const calm = spoken * SHORT_CALM_WPS;
  if (Math.abs(words - want) > want * SCRIPT_TOLERANCE && Math.abs(words - calm) > calm * CALM_TOLERANCE) {
    return { reason: `script is ${words} words; ${topic.length_s}s needs about ${Math.round(want)} words (±15%)` };
  }
  return {
    script: {
      source: s.source === 'edited' ? 'edited' : 'bank',
      word_count: words,
      loops_into_hook: s.loops_into_hook === true,
      beats,
    },
  };
}

function validateLongScript(raw: any, topic: any): { script?: LongBankScript; reason?: string } {
  if (raw === undefined) return {};
  const s = raw ?? {};
  if (!isString(s.cold_open) || !isString(s.closing)) return { reason: 'script needs cold_open and closing' };
  if (!Array.isArray(s.chapters) || s.chapters.length !== topic.chapters.length) {
    return {
      reason: `script has ${Array.isArray(s.chapters) ? s.chapters.length : 0} chapters; the entry lists ${topic.chapters.length}`,
    };
  }
  const chapters: { title: string; narration: string }[] = [];
  for (const [i, c] of (s.chapters as any[]).entries()) {
    if (!isString(c?.narration)) return { reason: `script chapter ${i + 1} has no narration` };
    chapters.push({ title: isString(c.title) ? c.title.trim() : topic.chapters[i].title, narration: c.narration.trim() });
  }
  const words = countScriptWords([s.cold_open, ...chapters.map((c) => c.narration), s.closing]);
  const want = topic.target_min * 144;
  const calm = topic.target_min * 120;
  if (Math.abs(words - want) > want * SCRIPT_TOLERANCE && Math.abs(words - calm) > calm * CALM_TOLERANCE) {
    return { reason: `script is ${words} words; ${topic.target_min} min needs about ${Math.round(want)} words (±15%)` };
  }
  return {
    script: {
      source: s.source === 'edited' ? 'edited' : 'bank',
      word_count: words,
      cold_open: s.cold_open.trim(),
      chapters,
      closing: s.closing.trim(),
    },
  };
}

function validateSeo(raw: any): { seo?: BankSeo; reason?: string } {
  if (raw === undefined) return {};
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { reason: '"seo" must be a block with description, hashtags, tags and pinned_comment' };
  }
  if (!isString(raw.description)) return { reason: '"seo" needs a description' };
  const listOk = (v: unknown) => v === undefined || (Array.isArray(v) && v.every(isString));
  if (!listOk(raw.tags)) return { reason: '"seo.tags" must be a list of text' };
  if (!listOk(raw.hashtags)) return { reason: '"seo.hashtags" must be a list of text' };
  if (raw.pinned_comment !== undefined && typeof raw.pinned_comment !== 'string') {
    return { reason: '"seo.pinned_comment" must be text' };
  }
  const description = raw.description.replace(/\r\n/g, '\n').trim();
  if (description.length > 5000) {
    return { reason: `"seo.description" is ${description.length} characters; YouTube allows 5000` };
  }
  return {
    seo: {
      description,
      hashtags: (raw.hashtags ?? []).map((h: string) => h.trim()),
      tags: (raw.tags ?? []).map((t: string) => t.trim()),
      pinned_comment: typeof raw.pinned_comment === 'string' ? raw.pinned_comment.trim() : '',
      ...(isString(raw.title_alt) ? { title_alt: raw.title_alt.trim() } : {}),
      ...(isString(raw.hook_alt) ? { hook_alt: raw.hook_alt.trim() } : {}),
    },
  };
}

function parseWeekday(v: unknown): string | undefined {
  if (typeof v !== 'string') return undefined;
  const day = v.trim().toLowerCase().slice(0, 3);
  const full = v.trim().toLowerCase();
  if (WEEKDAYS.includes(day) && (full.length === 3 || ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'].includes(full))) {
    return day;
  }
  return undefined;
}

function unknownFields(raw: Record<string, unknown>, short: boolean): string[] {
  const allowed = short ? SHORT_FIELDS : LONG_FIELDS;
  const out = Object.keys(raw).filter((k) => !allowed.has(k));
  if (short && raw.best_day !== undefined && !parseWeekday(raw.best_day)) out.push(`best_day (${String(raw.best_day)})`);
  return out;
}

export interface ShortTopic {
  kind: 'short';
  id: string;
  title: string;
  framing: string;
  format: string;
  length_s: number;
  concept: string;
  hook: string;
  beats_hint: string;
  stimulus?: string;
  stimulus_hold_s?: number;
  cta_question: string;
  tag_line: string;
  priority: number;
  notes?: string;
  best_day?: string;
  hook_card?: string;
  hook_text?: string;
  hook_text_pov?: string;
  related_longform?: string;
  visual_brief?: { setting_arc: string[]; must_show: string[]; shots?: string[]; character_looks?: string[] };
  script?: ShortBankScript;
  seo?: BankSeo;
  [k: string]: unknown;
}

export interface LongTopic {
  kind: 'long';
  id: string;
  title: string;
  framing: string;
  target_min: number;
  cold_open: string;
  chapters: { title: string; concept: string }[];
  closing_idea: string;
  related_shorts?: string[];
  cta_question: string;
  priority: number;
  notes?: string;
  script?: LongBankScript;
  seo?: BankSeo;
  [k: string]: unknown;
}

type Validated<T> = { entry?: T; reason?: string };

function validateShort(raw: any): Validated<ShortTopic> {
  const id = raw.id;
  if (!isString(id) || !/^S-\d{3,}$/.test(id)) return { reason: 'id must look like S-001' };
  for (const k of ['title', 'concept', 'hook', 'beats_hint', 'cta_question', 'tag_line']) {
    if (!isString(raw[k])) return { reason: `missing required field "${k}"` };
  }
  const title = String(raw.title).trim();
  if (title.length > 50) return { reason: `title is ${title.length} characters; the limit is 50` };
  if (!FRAMINGS.includes(raw.framing)) return { reason: `framing must be one of ${FRAMINGS.join(', ')}` };
  if (!FORMATS.includes(raw.format)) return { reason: `format must be one of ${FORMATS.join(', ')}` };
  if (!(isNumber(raw.length_s) && Number.isInteger(raw.length_s) && !(raw.length_s < 15) && !(raw.length_s > 45))) {
    return { reason: 'length_s must be a whole number from 15 to 45' };
  }
  if (![1, 2, 3].includes(raw.priority)) return { reason: 'priority must be 1, 2 or 3' };
  if (raw.format === 'test') {
    if (!isString(raw.stimulus)) return { reason: 'a test entry needs "stimulus"' };
    if (!(isNumber(raw.stimulus_hold_s) && !(raw.stimulus_hold_s <= 0))) return { reason: 'a test entry needs "stimulus_hold_s"' };
    if (raw.stimulus_hold_s >= raw.length_s - 5) return { reason: 'stimulus_hold_s leaves no time for the narration' };
  }
  if (raw.notes !== undefined && typeof raw.notes !== 'string') return { reason: '"notes" must be text' };
  const bestDay = parseWeekday(raw.best_day);
  const hookCard = isString(raw.hook_card) ? raw.hook_card.trim() : undefined;
  const vb = raw.visual_brief;
  const stringList = (v: unknown) => v === undefined || (Array.isArray(v) && v.every(isString));
  if (
    vb !== undefined &&
    (vb === null || typeof vb !== 'object' || Array.isArray(vb) || !stringList(vb.setting_arc) || !stringList(vb.must_show))
  ) {
    return { reason: '"visual_brief" needs setting_arc and must_show as lists of text' };
  }
  const trimAll = (v: string[]) => v.map((x) => x.trim());
  const entry: ShortTopic = {
    kind: 'short',
    id,
    title,
    framing: raw.framing,
    format: raw.format,
    length_s: raw.length_s,
    concept: String(raw.concept).trim(),
    hook: String(raw.hook).trim(),
    beats_hint: String(raw.beats_hint).trim(),
    ...(raw.format === 'test' ? { stimulus: String(raw.stimulus).trim(), stimulus_hold_s: raw.stimulus_hold_s } : {}),
    cta_question: String(raw.cta_question).trim(),
    tag_line: String(raw.tag_line).trim(),
    priority: raw.priority,
    ...(isString(raw.notes) ? { notes: raw.notes.trim() } : {}),
    ...(bestDay ? { best_day: bestDay } : {}),
    ...(hookCard ? { hook_card: hookCard } : {}),
    ...(isString(raw.hook_text) ? { hook_text: raw.hook_text.trim() } : {}),
    ...(isString(raw.hook_text_pov) ? { hook_text_pov: raw.hook_text_pov.trim() } : {}),
    ...(isString(raw.related_longform) ? { related_longform: raw.related_longform.trim() } : {}),
    ...(vb
      ? {
          visual_brief: {
            setting_arc: trimAll(vb.setting_arc ?? []),
            must_show: trimAll(vb.must_show ?? []),
            ...(Array.isArray(vb.shots) && vb.shots.every(isString) ? { shots: trimAll(vb.shots) } : {}),
            ...(Array.isArray(vb.character_looks) && vb.character_looks.every(isString)
              ? { character_looks: trimAll(vb.character_looks) }
              : {}),
          },
        }
      : {}),
  };
  return { entry };
}

function withScript<T>(
  res: Validated<T>,
  raw: any,
  check: (raw: any, topic: any) => { script?: unknown; reason?: string },
): Validated<T> {
  if (!res.entry) return res;
  const sc = check(raw.script, res.entry);
  if (sc.reason) return { reason: sc.reason };
  const seo = validateSeo(raw.seo);
  if (seo.reason) return { reason: seo.reason };
  return { entry: { ...res.entry, ...(sc.script ? { script: sc.script } : {}), ...(seo.seo ? { seo: seo.seo } : {}) } };
}

const withShortScript = (res: Validated<ShortTopic>, raw: any) => withScript(res, raw, validateShortScript);
const withLongScript = (res: Validated<LongTopic>, raw: any) => withScript(res, raw, validateLongScript);

/** Long-form packaging fields carried over as given. */
function longPackaging(raw: any): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  const list = (v: unknown) => (Array.isArray(v) && v.every(isString) ? v.map((x: string) => x.trim()) : undefined);
  if (isString(raw.structure)) out.structure = raw.structure.trim();
  if (list(raw.title_alts)) out.title_alts = list(raw.title_alts);
  if (isString(raw.thumbnail_text)) out.thumbnail_text = raw.thumbnail_text.trim();
  if (list(raw.thumbnail_texts)) out.thumbnail_texts = list(raw.thumbnail_texts);
  if (list(raw.thumbnail_concepts)) out.thumbnail_concepts = list(raw.thumbnail_concepts);
  if (list(raw.tags)) out.tags = list(raw.tags);
  if (isString(raw.description)) out.description = raw.description.replace(/\r\n/g, '\n').trim();
  if (isString(raw.next_video)) out.next_video = raw.next_video.trim();
  if (list(raw.character_looks)) out.character_looks = list(raw.character_looks);
  if (Array.isArray(raw.scenes)) {
    out.scenes = readScenes(raw.scenes);
    out.scene_count = raw.scenes.length;
  }
  return out;
}

function validateLong(raw: any): Validated<LongTopic> {
  const id = raw.id;
  if (!isString(id) || !/^L-\d{3,}$/.test(id)) return { reason: 'id must look like L-001' };
  for (const k of ['title', 'cold_open', 'closing_idea', 'cta_question']) {
    if (!isString(raw[k])) return { reason: `missing required field "${k}"` };
  }
  const title = String(raw.title).trim();
  if (title.length > 70) return { reason: `title is ${title.length} characters; the limit is 70` };
  if (!LONG_FRAMINGS.includes(raw.framing)) return { reason: `framing must be one of ${LONG_FRAMINGS.join(', ')}` };
  if (!(isNumber(raw.target_min) && !(raw.target_min < LONG_TARGET_MIN.min) && !(raw.target_min > LONG_TARGET_MIN.max))) {
    return { reason: `target_min must be ${LONG_TARGET_MIN.min} to ${LONG_TARGET_MIN.max}` };
  }
  if (![1, 2, 3].includes(raw.priority)) return { reason: 'priority must be 1, 2 or 3' };
  const chapters = raw.chapters;
  if (!Array.isArray(chapters) || chapters.length < 3 || chapters.length > 12) {
    return { reason: 'chapters must list 3 to 12 items' };
  }
  for (const c of chapters) {
    if (!c || !isString(c.title) || !isString(c.concept)) return { reason: 'every chapter needs a title and a concept' };
  }
  const related = raw.related_shorts;
  if (related !== undefined && !(Array.isArray(related) && related.every(isString))) {
    return { reason: '"related_shorts" must be a list of Short ids' };
  }
  const entry: LongTopic = {
    kind: 'long',
    id,
    title,
    framing: raw.framing,
    target_min: raw.target_min,
    cold_open: String(raw.cold_open).trim(),
    chapters: chapters.map((c: any) => ({ title: String(c.title).trim(), concept: String(c.concept).trim() })),
    closing_idea: String(raw.closing_idea).trim(),
    ...(related ? { related_shorts: related.map((r: string) => r.trim()) } : {}),
    ...longPackaging(raw),
    cta_question: String(raw.cta_question).trim(),
    priority: raw.priority,
    ...(isString(raw.notes) ? { notes: raw.notes.trim() } : {}),
  };
  return { entry };
}

export type BankTopic = (ShortTopic | LongTopic | BankEntry) & {
  bankId: string;
  order: number;
  skip_reason?: string;
  published_on?: string;
  [k: string]: unknown;
};

export interface BankRejection {
  id?: string;
  bankId?: string;
  line?: number;
  reason: string;
}

export interface ParsedBank {
  entries: BankTopic[];
  banks: { bankId: string; excludeConcepts: string[]; importedAt: number }[];
  rejected: BankRejection[];
  ignored: { id: string; bankId: string; fields: string[] }[];
  skips?: { id: string; topic: string; reason: string }[];
  warnings?: { line: number; reason: string; id?: string }[];
  rewritesInProgress?: boolean;
}

export function parseBankMarkdown(md: string, now: number = Date.now()): ParsedBank {
  if (isPsychBank(md)) {
    const conv = convertPsychBank(md);
    const res = parseBankMarkdown(conv.markdown, now);
    res.rejected.push(...conv.rejected.map((r) => ({ id: r.id, bankId: V2_BANK_ID, reason: r.reason })));
    res.warnings = [
      ...(res.warnings ?? []),
      ...conv.warnings.map((w) => ({ line: 0, reason: w })),
      ...conv.longforms.map((l) => ({ line: 0, reason: lfReportLine(l) })),
    ];
    return res;
  }
  const result: ParsedBank = { entries: [], banks: [], rejected: [], ignored: [] };
  const ids = new Set<string>();
  let order = 0;
  for (const [i, block] of extractYamlBlocks(md).entries()) {
    if (/^id:\s*MF-[SL]-/m.test(block)) continue;
    let doc: any;
    try {
      doc = YAML.parse(block);
    } catch (e) {
      result.rejected.push({ reason: `YAML block ${i + 1} could not be read: ${(e as Error).message.split('\n')[0]}` });
      continue;
    }
    if (!doc || typeof doc !== 'object') continue;
    if (!BANK_KEYS.includes(doc.type)) continue;
    const bankId = doc.bank_id;
    if (!isString(bankId)) {
      result.rejected.push({ reason: `a ${String(doc.type)} block has no bank_id` });
      continue;
    }
    if (!Array.isArray(doc.topics)) {
      result.rejected.push({ bankId, reason: `bank ${bankId} has no topics list` });
      continue;
    }
    const exclude = Array.isArray(doc.exclude_concepts)
      ? doc.exclude_concepts.filter(isString).map((c: string) => c.trim())
      : [];
    const bank = result.banks.find((b) => b.bankId === bankId);
    if (!bank) result.banks.push({ bankId, excludeConcepts: exclude, importedAt: now });
    else bank.excludeConcepts = [...new Set([...bank.excludeConcepts, ...exclude])];
    const short = doc.type === 'topic_bank_shorts';
    for (const topic of doc.topics) {
      const raw = topic ?? {};
      const res = short ? withShortScript(validateShort(raw), raw) : withLongScript(validateLong(raw), raw);
      const id = raw.id;
      if (!res.entry) {
        result.rejected.push({ id, bankId, reason: res.reason ?? 'invalid entry' });
        continue;
      }
      if (ids.has(res.entry.id)) {
        result.rejected.push({ id, bankId, reason: 'duplicate id in this file' });
        continue;
      }
      ids.add(res.entry.id);
      const extra = {
        ...(isString(raw.skip_reason) && /^skipped/i.test(String(raw.status ?? 'skipped'))
          ? { skip_reason: raw.skip_reason.trim() }
          : {}),
        ...(/^published/i.test(String(raw.status ?? ''))
          ? {
              published_on:
                (isString(raw.published_at) ? (/\d{4}-\d{2}-\d{2}/.exec(raw.published_at)?.[0] ?? raw.published_at) : '') ||
                'published',
            }
          : {}),
      };
      result.entries.push({ ...(res.entry as ShortTopic | LongTopic), ...extra, bankId, order: order++ } as BankTopic);
      const unknown = unknownFields(raw, short);
      if (unknown.length) result.ignored.push({ id, bankId, fields: unknown });
    }
  }
  if (isV2Bank(md)) {
    const v2 = parseBankV2(md);
    for (const e of v2.entries) {
      if (ids.has(e.id)) {
        result.rejected.push({ id: e.id, bankId: V2_BANK_ID, line: e.line, reason: `line ${e.line}: duplicate id in this file` });
        continue;
      }
      ids.add(e.id);
      result.entries.push({ ...e, bankId: V2_BANK_ID, order: order++ } as BankTopic);
    }
    for (const r of v2.rejected) {
      result.rejected.push({ id: r.id, bankId: V2_BANK_ID, line: r.line, reason: `line ${r.line}: ${r.reason}` });
    }
    for (const g of v2.ignored) result.ignored.push({ id: g.id, bankId: V2_BANK_ID, fields: g.fields });
    result.skips = v2.skips;
    result.warnings = v2.warnings;
    if (v2.entries.length && !result.banks.some((b) => b.bankId === V2_BANK_ID)) {
      result.banks.push({ bankId: V2_BANK_ID, excludeConcepts: [], importedAt: now });
    }
  }
  if (isComplianceBank(md)) {
    result.rewritesInProgress = true;
    result.entries = result.entries.filter((e) => {
      const problems = complianceOf(e);
      if (!problems?.length) return true;
      result.rejected.push({
        id: e.id,
        bankId: e.bankId,
        reason: `${e.id}: refused by the compliance gate (CR-91): ${problems.join('; ')}`,
      });
      return false;
    });
  }
  return result;
}

/** A canonical JSON string with sorted keys, so equal entries compare equal. */
function stableStringify(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(stableStringify).join(',')}]`;
  if (!v || typeof v !== 'object') return JSON.stringify(v);
  const o = v as Record<string, unknown>;
  const keys = Object.keys(o)
    .filter((k) => o[k] !== undefined)
    .sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(o[k])}`).join(',')}}`;
}

/** The bank-owned fields of an entry, for change detection. */
export function bankFields(e: Record<string, unknown>): string {
  const copy: Record<string, unknown> = { ...e };
  for (const k of ['order', 'importedAt', 'status', 'projectId', 'videoId', 'publishedAt', 'startedAt', 'uploaded', 'line', 'skipReason']) {
    delete copy[k];
  }
  return stableStringify(copy);
}

function normaliseText(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9 ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function contentTokens(s: string): Set<string> {
  return new Set(
    normaliseText(s)
      .split(' ')
      .filter((w) => w && !TITLE_STOP.has(w)),
  );
}

/** Share of the shorter title's content words that the other title also has. */
export function titleOverlap(a: string, b: string): number {
  const ta = contentTokens(a);
  const tb = contentTokens(b);
  if (!ta.size || !tb.size) return 0;
  let both = 0;
  for (const t of ta) if (tb.has(t)) both++;
  return both / Math.min(ta.size, tb.size);
}

const v2Field = (key: string, v: unknown) => (typeof v !== 'number' ? `${key}: ${JSON.stringify(v)}` : `${key}: ${v}`);
const yamlList = (key: string, items?: unknown[]) =>
  items?.length ? [`${key}:`, ...items.map((x) => `  - ${JSON.stringify(x)}`)] : [];

/** Writes v2 entries back as bank markdown, keeping their status. */
function exportV2Items(items: any[]): string[] {
  const out = ['**Schema:** v2', ''];
  const status = (e: any) => [
    `status: ${e.status}`,
    `video_id: ${e.videoId ? JSON.stringify(e.videoId) : 'null'}`,
    `published_at: ${e.publishedAt ? JSON.stringify(new Date(e.publishedAt).toISOString()) : 'null'}`,
  ];
  const scalar = (e: any, key: string, field = key) => (e[field] ? [v2Field(key, e[field])] : []);
  const raw = (e: any, key: string) => (e[key] ? [`${key}: ${e[key]}`] : []);
  const inline = (e: any, key: string) => (e[key]?.length ? [`${key}: [${e[key].join(', ')}]`] : []);
  const meta = (e: any) => [
    ...scalar(e, 'effect'),
    ...inline(e, 'hashtags'),
    ...yamlList('tags', e.tags),
    ...yamlList('long_tail', e.long_tail),
    ...scalar(e, 'hook_spoken'),
    ...scalar(e, 'hook_onscreen'),
    ...yamlList('beats', e.beats),
    ...scalar(e, 'loop_line'),
    ...scalar(e, 'feeds_longform'),
    ...scalar(e, 'thumbnail_concept'),
    ...scalar(e, 'cold_open'),
    ...yamlList('interrupts', e.interrupts),
    ...inline(e, 'feeder_shorts'),
    ...yamlList('chapters', e.chapters_field),
    ...raw(e, 'virality'),
    ...scalar(e, 'pinned_comment'),
    ...yamlList('settings_pool', e.settings_pool),
    ...yamlList('insert_props', e.insert_props),
    ...scalar(e, 'metaphor'),
    ...scalar(e, 'hook_alt'),
    ...scalar(e, 'title_alt'),
    ...scalar(e, 'description_line'),
    ...scalar(e, 'source_line'),
    ...yamlList('visual_beats', e.visual_beats),
    ...scalar(e, 'bank_id'),
    ...scalar(e, 'priority'),
    ...raw(e, 'queue'),
    ...scalar(e, 'title_final'),
    ...scalar(e, 'description_full'),
    ...scalar(e, 'evidence'),
    ...scalar(e, 'ig_keywords'),
    ...scalar(e, 'ig_line1'),
    ...scalar(e, 'ig_hashtags'),
    ...scalar(e, 'ig_first_comment'),
    ...(e.clip_ids?.length ? [v2Field('clip_ids', e.clip_ids.join(' '))] : []),
    ...(e.still_ids?.length ? [v2Field('still_ids', e.still_ids.join(' '))] : []),
    ...raw(e, 'mood'),
    ...scalar(e, 'audit'),
    ...scalar(e, 'hook_text_pov'),
    ...raw(e, 'test_profile'),
    ...raw(e, 'test_hook'),
    ...raw(e, 'virality_rank'),
    ...scalar(e, 'gemini_score'),
    ...raw(e, 'viral_batch'),
    ...scalar(e, 'upload_order'),
    ...scalar(e, 'voice_settings'),
    ...yamlList('shot_times', e.shot_times?.map((t: any) => `${t.id} ${t.start.toFixed(1)}-${t.end.toFixed(1)}`)),
    ...yamlList('subtitles', e.subtitles?.map(cueLine)),
    ...scalar(e, 'bottom_overlay'),
    ...scalar(e, 'thumb_text'),
    ...scalar(e, 'thumb_visual'),
  ];
  for (const e of items) {
    if (e.kind !== 'short') {
      out.push(
        `## ${e.id} — ${e.title}`,
        '```yaml',
        `id: ${e.id}`,
        v2Field('pillar', e.pillar),
        `publish_order: ${e.publish_order}`,
        ...(e.target_min ? [`target_length: "~${e.target_min} min"`] : []),
        v2Field('thumbnail_text', e.thumbnail_text),
        'sources:',
        ...e.sources.map((s: string) => `  - ${JSON.stringify(s)}`),
        ...raw(e, 'format_type'),
        ...raw(e, 'hoot_hook_pose'),
        ...raw(e, 'next_video'),
        ...scalar(e, 'comment_question'),
        ...(e.flagship ? ['flagship: yes'] : []),
        ...raw(e, 'item_count'),
        ...scalar(e, 'pattern_interrupt'),
        ...scalar(e, 'recap_line'),
        ...scalar(e, 'care_line'),
        ...scalar(e, 'next_teaser'),
        ...scalar(e, 'description_intro'),
        ...scalar(e, 'description_body'),
        ...scalar(e, 'written_plan'),
        ...yamlList('evidence_lines', e.evidence_lines),
        ...(e.visual_plan?.length
          ? [
              'visual_plan:',
              ...e.visual_plan.map(
                (r: any) => `  - ${JSON.stringify(`${r.setting} | ${r.cutaway} | ${r.chapter}`)}`,
              ),
            ]
          : []),
        ...yamlList('title_alts', e.title_alts),
        ...yamlList('thumbnail_texts', e.thumbnail_texts),
        ...yamlList('thumbnail_concepts', e.thumbnail_concepts),
        ...meta(e),
        ...status(e),
        ...(e.version !== undefined ? [`version: ${e.version}`] : []),
        ...(e.screenplay
          ? [
              'screenplay:',
              ...YAML.stringify(e.screenplay, { indent: 2, lineWidth: 0 })
                .trimEnd()
                .split('\n')
                .map((l: string) => `  ${l}`),
            ]
          : []),
        '```',
        '**narration:**',
        '',
        ...e.chapters.flatMap((c: any) => [`[Chapter: ${c.title}]`, c.narration, '']),
        '---',
        '',
      );
    } else {
      out.push(
        `### ${e.id.replace(/^MF-S-/, '')} — ${e.title}`,
        ...(e.condition ? [`> **Conditional:** ${e.condition}`, ''] : []),
        '```yaml',
        `id: ${e.id}`,
        v2Field('pillar', e.pillar),
        `format: ${e.format}`,
        `ending: ${e.ending}`,
        v2Field('hook_text', e.hook_text),
        `related_longform: ${e.related_longform}`,
        v2Field('source', e.source),
        ...meta(e),
        ...status(e),
        ...(e.version !== undefined ? [`version: ${e.version}`] : []),
        ...scalar(e, 'skip_reason'),
        '```',
        '**narration:**',
        e.narration,
        '',
        '---',
        '',
      );
    }
  }
  return out;
}

export function isV2(e: { schema?: unknown }): boolean {
  return e.schema === 2;
}

export function isLegacy(e: { schema?: unknown }): boolean {
  return !(e.schema === 2);
}

/** The Shorts that feed a long-form entry. */
export function relatedShortIds(entry: any, all: any[]): string[] {
  if (entry.kind !== 'long') return [];
  if (entry.schema !== 2) return entry.related_shorts ?? [];
  return all.filter((e) => e.kind === 'short' && e.schema === 2 && e.related_longform === entry.id).map((e) => e.id);
}

export function conceptOf(e: any): string | undefined {
  if (e.kind !== 'short') return undefined;
  return e.schema !== 2 ? e.concept : e.effect;
}

export interface ImportPlan {
  added: string[];
  updated: string[];
  unchanged: string[];
  locked: string[];
  scriptsAdded: string[];
  briefsAdded: string[];
  seoAdded: string[];
  rejected: BankRejection[];
  ignored: { id: string; bankId: string; fields: string[] }[];
  conditional: { id: string; condition: string }[];
  skipped: { id: string; reason: string }[];
  published: string[];
  reset: string[];
  warnings: { line: number; reason: string; id?: string }[];
  next: any[];
  banks: { bankId: string; excludeConcepts: string[]; importedAt: number }[];
}

/** How a parsed bank merges into the stored entries, without touching anything in use. */
export function planImport(
  existing: any[],
  parsed: ParsedBank,
  banks: { bankId: string; excludeConcepts: string[]; importedAt: number }[] = [],
  now: number = Date.now(),
  opts: { accept?: string[] } = {},
): ImportPlan {
  const byId = new Map(existing.map((e) => [e.id, e]));
  const plan: ImportPlan = {
    added: [],
    updated: [],
    unchanged: [],
    locked: [],
    scriptsAdded: [],
    briefsAdded: [],
    seoAdded: [],
    rejected: parsed.rejected,
    ignored: parsed.ignored ?? [],
    conditional: [],
    skipped: [],
    published: [],
    reset: [],
    warnings: parsed.warnings ?? [],
    next: [...existing],
    banks: [],
  };
  const base = existing.reduce((m, e) => Math.max(m, e.order + 1), 0);
  for (const e of parsed.entries as any[]) {
    const old = byId.get(e.id);
    if (e.condition && !(opts.accept ?? []).includes(e.id)) {
      plan.conditional.push({ id: e.id, condition: e.condition });
      continue;
    }
    const skip = e.skip_reason;
    const pub = e.published_on;
    const publishedAt = pub && Number.isFinite(Date.parse(pub)) ? Date.parse(pub) : undefined;
    const statusFor = () => (skip ? 'skipped' : pub ? 'published' : 'unused');
    const record = () => {
      if (pub && !skip) plan.published.push(e.id);
      if (skip) plan.skipped.push({ id: e.id, reason: skip });
    };
    if (!old) {
      plan.added.push(e.id);
      plan.next.push({
        ...e,
        order: base + e.order,
        importedAt: now,
        status: statusFor(),
        ...(publishedAt !== undefined ? { publishedAt } : {}),
        ...(skip ? { skipReason: skip } : {}),
      });
      record();
      continue;
    }
    if (old.status === 'skipped' && skip) {
      plan.unchanged.push(e.id);
      continue;
    }
    if (old.status === 'published') {
      if (!pub && bankFields(old) !== bankFields(e)) plan.locked.push(e.id);
      else plan.unchanged.push(e.id);
      continue;
    }
    if (parsed.rewritesInProgress && old.status === 'in_progress' && bankFields(old) !== bankFields(e)) {
      plan.updated.push(e.id);
      plan.reset.push(e.id);
      const patch = {
        order: old.order,
        importedAt: now,
        status: skip ? 'skipped' : 'in_progress',
        ...(old.projectId ? { projectId: old.projectId } : {}),
        ...(old.startedAt ? { startedAt: old.startedAt } : {}),
        ...(skip ? { skipReason: skip } : {}),
      };
      if (skip) plan.skipped.push({ id: e.id, reason: skip });
      plan.next = plan.next.map((x) => (x.id === e.id ? { ...e, ...patch } : x));
      continue;
    }
    if (old.status === 'unused') {
      if (bankFields(old) !== bankFields(e)) {
        plan.updated.push(e.id);
        const replacement = {
          ...e,
          order: old.order,
          importedAt: now,
          status: statusFor(),
          ...(publishedAt !== undefined ? { publishedAt } : {}),
          ...(skip ? { skipReason: skip } : {}),
        };
        record();
        plan.next = plan.next.map((x) => (x.id === e.id ? replacement : x));
      } else {
        plan.unchanged.push(e.id);
      }
      continue;
    }
    const legacyBoth = old.schema !== 2 && e.schema !== 2;
    const script = legacyBoth && !old.script && e.script ? e.script : undefined;
    const brief =
      old.kind === 'short' && e.kind === 'short' && legacyBoth && !old.visual_brief && e.visual_brief
        ? e.visual_brief
        : undefined;
    const seo = legacyBoth && !old.seo && e.seo ? e.seo : undefined;
    if (!script && !brief && !seo) {
      plan.locked.push(e.id);
      continue;
    }
    if (script) plan.scriptsAdded.push(e.id);
    if (brief) plan.briefsAdded.push(e.id);
    if (seo) plan.seoAdded.push(e.id);
    plan.next = plan.next.map((x) =>
      x.id === e.id
        ? { ...x, ...(script ? { script } : {}), ...(brief ? { visual_brief: brief } : {}), ...(seo ? { seo } : {}) }
        : x,
    );
  }
  for (const s of parsed.skips ?? []) {
    const i = plan.next.findIndex((x) => x.id === s.id);
    if (i >= 0 && plan.next[i].status === 'unused') {
      plan.next[i] = { ...plan.next[i], status: 'skipped', skipReason: s.reason };
      plan.skipped.push({ id: s.id, reason: s.reason });
    }
  }
  const bankMap = new Map(banks.map((b) => [b.bankId, b]));
  for (const b of parsed.banks) bankMap.set(b.bankId, { ...b, importedAt: now });
  plan.banks = [...bankMap.values()];
  return plan;
}

/** Concepts on the exclude list, titles close to published ones, and near-duplicate pairs. */
export function findDuplicates(
  entries: any[],
  opts: { excludeConcepts?: string[]; others?: any[]; published?: { title: string; concept?: string }[] } = {},
): { id: string; message: string }[] {
  const out: { id: string; message: string }[] = [];
  const excluded = new Set((opts.excludeConcepts ?? []).map(normaliseText));
  const pool = [...entries, ...(opts.others ?? []).filter((o) => !entries.some((e) => e.id === o.id))];
  for (const e of entries) {
    const concept = e.concept ? normaliseText(e.concept) : '';
    if (concept && excluded.has(concept)) {
      out.push({ id: e.id, message: `${e.id}: concept "${e.concept}" is on the bank's exclude list` });
    }
    for (const p of opts.published ?? []) {
      if (titleOverlap(e.title, p.title) >= TITLE_OVERLAP_WARN) {
        out.push({ id: e.id, message: `${e.id}: title is close to the published "${p.title}"` });
      } else if (concept && p.concept && normaliseText(p.concept) === concept) {
        out.push({ id: e.id, message: `${e.id}: same concept as the published "${p.title}"` });
      }
    }
    for (const o of pool) {
      const inEntries = entries.some((x) => x.id === o.id);
      if (o.id === e.id || (inEntries && o.id < e.id)) continue;
      if (titleOverlap(e.title, o.title) >= TITLE_OVERLAP_WARN) {
        out.push({ id: e.id, message: `${e.id} and ${o.id}: titles are very similar` });
      } else if (concept && o.concept && normaliseText(o.concept) === concept) {
        out.push({ id: e.id, message: `${e.id} and ${o.id}: same concept` });
      }
    }
  }
  return out;
}

/** "at least 3 days apart from S-012" rules in an entry's notes. */
export function pairingRules(notes?: string | null): { id: string; days: number }[] {
  const re = /at least (\d+) days? apart from (S-\d{3,})/gi;
  const out: { id: string; days: number }[] = [];
  for (let m = re.exec(notes ?? ''); m; m = re.exec(notes ?? '')) out.push({ id: m[2].toUpperCase(), days: Number(m[1]) });
  return out;
}

export interface PickOptions {
  targetDay?: string;
  nextDay?: string;
  bestDayFallbackFormat?: string;
  maxRapidListInARow?: number;
  targetDate?: Date;
}

/** The next legacy topic to make: priority, best day, framing variety, list runs and pairing gaps. */
export function pickNext(entries: any[], kind: string, opts: PickOptions = {}): any | undefined {
  const pool = entries
    .filter((e) => e.kind === kind && e.status === 'unused' && e.schema !== 2)
    .sort((a, b) => a.priority - b.priority || a.order - b.order);
  if (kind !== 'short' || pool.length < 2) return pool[0];
  let matched: any[] = [];
  let plain = pool;
  let others: any[] = [];
  if (opts.targetDay) {
    matched = pool.filter((e) => e.best_day === opts.targetDay);
    plain = pool.filter((e) => !e.best_day);
    others = pool.filter((e) => e.best_day && e.best_day !== opts.targetDay);
    if (!matched.length && opts.targetDay === 'sun') {
      const fmt = opts.bestDayFallbackFormat ?? 'rapid_list';
      plain = [...plain.filter((e) => e.format === fmt), ...plain.filter((e) => e.format !== fmt)];
    }
  }
  const recent = entries
    .filter((e) => e.kind === 'short' && Boolean(e.startedAt))
    .sort((a, b) => (b.startedAt ?? 0) - (a.startedAt ?? 0));
  const lastFraming = recent[0]?.framing;
  let rapidRun = 0;
  for (const r of recent) {
    if (r.format !== 'rapid_list') break;
    rapidRun++;
  }
  const maxRapid = opts.maxRapidListInARow ?? 2;
  const target = (opts.targetDate ?? new Date()).getTime();
  const byId = new Map(entries.map((e) => [e.id, e]));
  const pairingOk = (e: any) => {
    const rules = [
      ...pairingRules(e.notes),
      ...entries
        .filter((x) => x.schema !== 2)
        .flatMap((x) => pairingRules(x.notes).filter((r) => r.id === e.id).map((r) => ({ id: x.id, days: r.days }))),
    ];
    return rules.every((r) => {
      const other = byId.get(r.id);
      if (!other?.publishedAt) return true;
      return Math.abs(target - other.publishedAt) >= r.days * DAY_MS;
    });
  };
  const ok = (e: any) =>
    e.framing !== lastFraming && !(e.format === 'rapid_list' && rapidRun >= maxRapid) && pairingOk(e);
  const tomorrow = opts.nextDay ? pool.filter((e) => e.best_day === opts.nextDay) : [];
  const leavesTomorrow = (e: any) =>
    !tomorrow.length ||
    tomorrow.some(
      (t) =>
        t.framing !== e.framing &&
        !(t.format === 'rapid_list' && (e.format === 'rapid_list' ? rapidRun + 1 : 0) >= maxRapid),
    );
  return (
    matched.find(ok) ??
    matched.find(pairingOk) ??
    plain.find((e) => ok(e) && leavesTomorrow(e)) ??
    plain.find(ok) ??
    matched[0] ??
    plain[0] ??
    others.find(ok) ??
    others[0]
  );
}

/** The whole bank as markdown, with each entry's current status. */
export function exportBankMarkdown(
  entries: any[],
  banks: { bankId: string; excludeConcepts: string[] }[],
  now: Date = new Date(),
): string {
  const count = (s: string) => entries.filter((e) => e.status === s).length;
  const summary =
    `Exported ${now.toISOString().slice(0, 10)}. ${count('published')} published, ` +
    `${count('in_progress')} in progress, ` +
    `${count('unused')} unused, ${count('skipped')} skipped.`;
  const lines = ['# The Mind Files — Topic bank status', '', summary, ''];
  const v2 = entries.filter(isV2).sort((a, b) => a.order - b.order);
  if (v2.length) lines.push(...exportV2Items(v2));
  for (const bankId of [...new Set(entries.filter(isLegacy).map((e) => e.bankId))]) {
    for (const kind of ['short', 'long']) {
      const items = entries
        .filter((e) => e.bankId === bankId && e.kind === kind && e.schema !== 2)
        .sort((a, b) => a.order - b.order);
      if (!items.length) continue;
      const short = kind === 'short';
      const fields = short ? SHORT_EXPORT_ORDER : LONG_EXPORT_ORDER;
      const doc: Record<string, unknown> = { type: short ? 'topic_bank_shorts' : 'topic_bank_longform', bank_id: bankId };
      const exclude = banks.find((b) => b.bankId === bankId)?.excludeConcepts;
      if (short && exclude?.length) doc.exclude_concepts = exclude;
      doc.topics = items.map((e) => {
        const o: Record<string, unknown> = {};
        for (const k of fields) if (e[k] !== undefined) o[k] = e[k];
        o.status = e.status;
        o.video_id = e.videoId ?? null;
        o.published_at = e.publishedAt ? new Date(e.publishedAt).toISOString() : null;
        if (e.uploaded) o.uploaded = e.uploaded;
        return o;
      });
      lines.push('```yaml', YAML.stringify(doc, { lineWidth: 0 }).trimEnd(), '```', '');
    }
  }
  return lines.join('\n');
}

export { extractYamlBlocks, countScriptWords, parseWeekday, normaliseText };
