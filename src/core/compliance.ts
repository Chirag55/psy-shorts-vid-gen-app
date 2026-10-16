/**
 * Gemini-audit compliance checks (S*, L*, V*, P*, N* codes) for bank
 * entries: Short narration and shot lists, long-form runtime, metadata and
 * scenes. Rebuilt from 6.1.13.
 */
import { neutralHits } from './neutralLint';

export const SIGN_OFF = "...and that's the mind for you. Stay curious, stay sharp.";
const CITE_SHORT_RE =
  /\b(research|researchers?|stud(?:y|ies)|experiments?|psychologists?|scientists?|therapists?|harvard|university|journal|named after|comes from|old play|data shows?|(?:18|19|20)\d\d)\b/i;
const CITE_LONG_RE =
  /\b(researchers?|stud(?:y|ies)|experiments?|psychologists?|scientists?|harvard|university|journal|(?:18|19|20)\d\d|research (?:shows|suggests|found))\b/i;
const DISCLAIMER_RE =
  /(not a diagnosis|popular term|popular pattern|popular strategy|clinical|formal research|evidence is|the research|not a guarantee|is debated|is mixed)/i;
const YOU_RE = /\b(you|your|you're|you'd|you've|you'll|yours|yourself)\b/i;
const BLOCKING_RE = /\b(cups?|mugs?|coffee|desks?|caf[eé]s?|phones?|laptops?|tables?|smartphones?)\b/i;
const MASCOT_RE = /\b(hoot|owl)\b|🦉/i;
const LIGHT_RE =
  /\b(night|rain|rainy|dawn|dusk|lamp|neon|glow\w*|\w*light\w*|storm\w*|mist\w*|fog|lanterns?|moon\w*|sun\w*|shadows?|candle\w*|lit|snow|steam|golden hour|twilight|evening|grey|gray|blue|dim|dark\w*|morning|noon|afternoon)\b/i;
const CHILD_RE = /\b(child|children|kid|kids|boy|girl|baby|toddler|schoolchild|school)\b/i;
export const SHOT_SIZES = ['CU', 'Medium', 'Wide', 'Insert', 'OTS', 'Profile'];
export const LOOK_NAMES = ['Alex', 'Maya', 'Leo', 'Nora', 'Ryan'];
const SKIN_RE = /\b(skin|complexion|freckles?|sunburnt|ethnic\w*|race|racial)\b/i;
export const SLOW_MOVES = [
  'slow push-in',
  'slow pull-out',
  'slow pan-left',
  'slow pan-right',
  'slow tilt-up',
  'slow tilt-down',
  'slow tracking',
];
export const CALM_WPS = 2;
export const LINE_PAUSE_S = 0.4;

/** Audit codes waived per entry after a manual review. */
export const WAIVE: Record<string, string[]> = {
  'MF-S-D69': ['S1', 'S13', 'S2', 'S5', 'S6'],
  'MF-S-D72': ['S13', 'S2', 'S5', 'S6'],
  'MF-S-D73': ['S1', 'S13', 'S5', 'S6'],
  'MF-S-D74': ['S1', 'S13', 'S2', 'S5', 'S6'],
  'MF-S-D75': ['S1', 'S13', 'S5', 'S6'],
  'MF-S-D76': ['S13', 'S3', 'S5', 'S6'],
  'MF-S-D77': ['S1', 'S13', 'S5', 'S6'],
  'MF-S-D126': ['S1', 'S13', 'S2', 'S5', 'S6'],
  'MF-S-D78': ['S1', 'S13', 'S2', 'S5', 'S6'],
  'MF-S-D79': ['S13', 'S5', 'S6'],
  'MF-S-D129': ['S1', 'S13', 'S2', 'S5', 'S6'],
  'MF-S-D130': ['S1', 'S13', 'S5', 'S6'],
};

const words = (s: string) => s.match(/[A-Za-z0-9'’-]+/g) ?? [];
const namedIn = (text: string) => LOOK_NAMES.filter((n) => new RegExp(`\\b${n}\\b`).test(text));
const skinLooks = (looks: string[]) =>
  looks.filter((l) => SKIN_RE.test(l)).map((l) => `N2 look line describes skin or ethnicity: ${l.split(',')[0]}`);
const hasLook = (looks: string[], name: string) => looks.some((l) => l.startsWith(`${name},`));

export interface ShotLine {
  id: string;
  kind: string;
  size: string;
  setting: string;
  action: string;
  move: string;
}

/** "MF065-C1 clip | CU | setting | action | slow push-in". */
export function parseShotLine(line: string): ShotLine | null {
  const p = line.split('|').map((s) => s.trim());
  if (p.length !== 5) return null;
  const head = p[0].split(/\s+/);
  if (head.length < 2) return null;
  return { id: head[0], kind: head[1], size: p[1], setting: p[2], action: p[3], move: p[4] };
}

export function checkShots(lines: string[], looks: string[] = []): string[] {
  const out: string[] = [];
  if (lines.length < 6 || lines.length > 9) out.push(`V1 ${lines.length} shots, need 6 to 9`);
  const parsed = lines.map(parseShotLine);
  const clips = parsed.every(Boolean) ? (parsed as ShotLine[]).filter((p) => p.kind.startsWith('clip')).length : -1;
  if (clips !== 3) out.push(`V1 ${clips} clips, need exactly 3`);
  const seen = new Set<string>();
  const ids = new Set<string>();
  let prev: { size: string; setting: string } | null = null;
  lines.forEach((line, i) => {
    const p = parsed[i];
    if (!p) {
      out.push(`V1 shot not in 5 fields: ${line.slice(0, 40)}`);
      return;
    }
    if (ids.has(p.id)) out.push(`V1 duplicate shot id ${p.id}`);
    ids.add(p.id);
    const text = `${p.setting} ${p.action}`;
    if (BLOCKING_RE.test(text)) out.push(`V4 blocking word in ${p.id}`);
    if (CHILD_RE.test(text)) out.push(`V4 child wording in ${p.id}`);
    if (!LIGHT_RE.test(text)) out.push(`V3 no light cue in ${p.id}`);
    if (!SHOT_SIZES.includes(p.size)) out.push(`V7 size ${p.size} in ${p.id}`);
    if (!SLOW_MOVES.includes(p.move)) out.push(`V6 move in ${p.id}`);
    if (namedIn(text).length > 2) out.push(`V4 more than 2 named characters in ${p.id}`);
    const key = `${p.setting}\x00${p.action}`;
    if (seen.has(key)) out.push(`V7 ${p.id} repeats an earlier shot`);
    seen.add(key);
    if (prev && prev.size === p.size && prev.setting === p.setting) {
      out.push(`V7 ${p.id} same size and setting as the shot before`);
    }
    prev = { size: p.size, setting: p.setting };
  });
  const missing = namedIn(lines.join(' ')).filter((n) => !hasLook(looks, n));
  out.push(...skinLooks(looks));
  if (missing.length) out.push(`V8 character look missing for [${missing.join(', ')}]`);
  const texts = parsed.map((p) => (p ? `${p.setting} ${p.action}` : ''));
  for (const name of LOOK_NAMES) {
    const first = texts.findIndex((t) => new RegExp(`\\b${name}\\b`).test(t));
    if (first > 1) out.push(`V9 ${name} first appears in shot ${first + 1} (must appear in shot 1 or 2)`);
  }
  for (const [i, p] of parsed.entries()) {
    if (!p) continue;
    if (
      /sunny|daylight|sunlit|golden|morning|afternoon|midday/i.test(p.setting) &&
      /\b(rain\w*|wet|drizzle|umbrellas?|night|storm)\b/i.test(`${p.setting} ${p.action}`) &&
      !lines[i].includes('storm drain') &&
      !lines[i].includes('eyes wet')
    ) {
      out.push(`V10 weather/time conflict in ${p.id}`);
    }
  }
  return out;
}

export interface ShortInput {
  lines: string[];
  hookText?: string;
  pov?: string;
  titleFinal?: string;
  beats: string[];
  looks?: string[];
  tags: string[];
  pinned?: string;
  effect?: string;
  description?: string;
  blob: string;
}

export function checkShort(s: ShortInput): string[] {
  const out: string[] = [];
  let lines = s.lines.map((l) => l.trim()).filter(Boolean);
  if (lines.length === 1) {
    lines = lines[0].split(/(?<=[.?!])\s+/).filter(Boolean);
    out.push('S7 narration not one sentence per line');
  }
  if (lines.length < 2) return [...out, 'narration too short'];
  const hook = lines[0];
  if (words(hook).length > 12) out.push('S1 hook > 12 words');
  if (!YOU_RE.test(hook) && !hook.trimEnd().endsWith('?')) out.push('S1 hook not you/question');
  const all = lines.join(' ');
  if (/stay sharp/i.test(all)) out.push('sign-off present (audit A9: no catchphrase outro)');
  const n = words(all).length;
  const [min, max] = lines.some((l) => /^(One|Two|Three|Four|Five)\b/.test(l)) ? [41, 71] : [35, 57];
  if (n < min || n > max) out.push(`S6 ${n} words`);
  if (s.effect) {
    const term = s.effect
      .replace(/\(.*?\)/g, '')
      .replace(/the /g, '')
      .trim()
      .toLowerCase();
    if (term && words(all).slice(0, 25).join(' ').toLowerCase().includes(term)) {
      out.push(`S2 term in first 25 words: ${term}`);
    }
  }
  const cite = CITE_SHORT_RE.exec(all);
  if (cite) out.push(`S3 citation: ${cite[0]}`);
  const disclaimer = DISCLAIMER_RE.exec(all);
  if (disclaimer) out.push(`S4 disclaimer: ${disclaimer[0]}`);
  const last = lines[lines.length - 1];
  if (!last.endsWith('?')) out.push('S5 no closing question');
  if (s.pinned && s.pinned !== last) out.push('S13 pinned comment != spoken question');
  const hw = words(s.hookText ?? '').length;
  if (!s.hookText || hw < 2 || hw > 6) out.push('S10 hook_text');
  if (!s.pov || !s.pov.startsWith('POV: ')) out.push('S10 pov');
  if (s.titleFinal && s.titleFinal.length > 100) out.push('S9 title > 100 chars');
  out.push(...checkShots(s.beats, s.looks ?? []));
  if (s.tags.length < 5 || s.tags.length > 6) out.push(`P3 ${s.tags.length} tags`);
  if (MASCOT_RE.test(s.blob)) out.push('P4 mascot');
  const hits = neutralHits(s.blob);
  if (hits.length) out.push(`N1 culture-tied word: ${hits.join(', ')}`);
  if (s.description && s.description.split('\n')[0].length < 40) out.push('P1 description line 1 too short');
  return out;
}

export interface ScriptSentence {
  n: number;
  chapter: string;
  text: string;
  wordsBefore: number;
}

export function scriptSentences(chapters: { title: string; text: string }[]): ScriptSentence[] {
  const out: ScriptSentence[] = [];
  let n = 0;
  let before = 0;
  for (const ch of chapters) {
    for (const line of ch.text.split('\n')) {
      for (const s of line.trim().split(/(?<=[.?!])\s+(?=["“‘A-Z0-9])/)) {
        if (!s.trim()) continue;
        out.push({ n: ++n, chapter: ch.title, text: s.trim(), wordsBefore: before });
        before += words(s).length;
      }
    }
  }
  return out;
}

export interface SceneLine {
  id?: string;
  chapter?: string;
  starts_at?: string;
  size?: string;
  setting?: string;
  action?: string;
  move?: string;
  kind?: string;
}

export function checkScenes(
  chapters: { title: string; text: string }[],
  scenes: SceneLine[] | undefined,
  looks: string[] = [],
  minWords = 9,
  maxWords = 42,
): string[] {
  const out: string[] = [];
  const sents = scriptSentences(chapters);
  const total = chapters.reduce((a, c) => a + words(c.text).length, 0);
  const starts = new Map<string, { n: number; wb: number }>();
  for (const s of sents) {
    const k = s.text.split(/\s+/).slice(0, 10).join(' ');
    if (!starts.has(k)) starts.set(k, { n: s.n, wb: s.wordsBefore });
  }
  if (!scenes?.length) return ['L11 no scenes'];
  if (scenes.length < total / 28) {
    out.push(`L11 only ${scenes.length} scenes for ${total} words (need at least one per 28 words)`);
  }
  const placed: { n: number; wb: number }[] = [];
  const seen = new Set<string>();
  const settings = new Set<string>();
  const sizes = new Set<string>();
  let prev: SceneLine | null = null;
  scenes.forEach((sc, i) => {
    if (!(sc.id && sc.chapter && sc.starts_at && sc.size && sc.setting && sc.action && sc.move)) {
      out.push(`L11 scene ${i + 1} missing fields`);
      return;
    }
    const hit = starts.get(sc.starts_at.split(/\s+/).slice(0, 10).join(' '));
    if (!hit) {
      out.push(`L11 scene ${sc.id} starts_at not found in the script`);
      return;
    }
    if (placed.length && hit.n <= placed[placed.length - 1].n) {
      out.push(`L11 scene ${sc.id} out of order`);
      return;
    }
    placed.push(hit);
    if (!SHOT_SIZES.includes(sc.size)) out.push(`L11 size ${sc.size} in ${sc.id}`);
    if (!SLOW_MOVES.includes(sc.move)) out.push(`L11 move in ${sc.id}`);
    if (CHILD_RE.test(`${sc.setting} ${sc.action}`)) out.push(`L11 child wording in ${sc.id}`);
    const key = `${sc.setting}\x00${sc.action}`;
    if (seen.has(key)) out.push(`L11 ${sc.id} repeats an earlier scene`);
    seen.add(key);
    settings.add(sc.setting);
    sizes.add(sc.size);
    if (prev && prev.size === sc.size && prev.setting === sc.setting) {
      out.push(`L11 ${sc.id} same size and setting as the scene before`);
    }
    prev = sc;
  });
  if (placed.length && placed[0].n !== 1) out.push('L11 first scene must start at the first sentence');
  placed.forEach((p, i) => {
    const next = i + 1 < placed.length ? placed[i + 1].wb : total;
    const len = next - p.wb;
    const cap = maxWords + (i + 1 === placed.length ? 15 : 0);
    if (len > cap) out.push(`L11 scene ${i + 1} lasts ${len} words (> ${cap})`);
    if (len < minWords && i + 1 < placed.length) out.push(`L11 scene ${i + 1} lasts ${len} words (< ${minWords})`);
  });
  const clips = scenes.map((s, i) => (s.kind === 'clip' ? i : -1)).filter((i) => i >= 0);
  if (clips.length < 6 || clips.length > 12) out.push(`L12 ${clips.length} clip scenes (need 6 to 12)`);
  if (clips.some((x, k) => k && x - clips[k - 1] < 3)) out.push('L12 clip scenes closer than 3 scenes apart');
  if (scenes.some((s) => s.kind !== 'still' && s.kind !== 'clip')) out.push('L12 scene without kind still or clip');
  if (settings.size < 10) out.push(`L11 only ${settings.size} distinct settings (need 10)`);
  if (sizes.size < 4) out.push(`L11 only ${sizes.size} shot sizes (need 4)`);
  const missing = namedIn(scenes.map((s) => `${s.setting ?? ''} ${s.action ?? ''}`).join(' ')).filter(
    (n) => !hasLook(looks, n),
  );
  out.push(...skinLooks(looks));
  if (missing.length) out.push(`V8 character look missing for [${missing.join(', ')}]`);
  return out;
}

/** Runtime at the calm pace, with a pause per line break. */
export function calmSeconds(texts: string[]): number {
  return texts.reduce((a, t) => a + words(t).length / CALM_WPS + LINE_PAUSE_S * (t.match(/\n/g) ?? []).length, 0);
}

export interface LongInput {
  title: string;
  chapters: { title: string; text: string }[];
  thumbnailText?: string;
  thumbnailTexts?: string[];
  tags: string[];
  description: string;
  scenes?: SceneLine[];
  looks?: string[];
  blob: string;
}

export function checkLong(l: LongInput): { problems: string[]; seconds: number } {
  const out: string[] = [];
  const text = l.chapters.map((c) => c.text).join(' ');
  const seconds = calmSeconds(l.chapters.map((c) => c.text));
  if (seconds < 600 || seconds > 735) out.push(`L2 runtime ${Math.floor(seconds)} s`);
  if (l.title.length > 60) out.push('L5 title > 60');
  if (/^\d/.test(l.title)) out.push('L1 numbered title');
  if (l.chapters.length && words(l.chapters[0].text).length / CALM_WPS > 36) out.push('L3 open > 36 s');
  for (const t of [l.thumbnailText ?? '', ...(l.thumbnailTexts ?? [])]) {
    if (words(t).length > 4) out.push(`L6 thumb: ${t}`);
  }
  if (l.tags.length < 5 || l.tags.length > 6) out.push('L8 tags');
  const dw = words(l.description).length;
  if (dw < 150 || dw > 300) out.push(`L7 description ${dw} words`);
  if (!l.description.includes('Chapters') || !l.description.includes('0:00')) out.push('L4 chapters');
  const cite = CITE_LONG_RE.exec(text);
  if (cite) out.push(`L9 citation: ${cite[0]}`);
  if (MASCOT_RE.test(l.blob)) out.push('L10 mascot');
  const hits = neutralHits(l.blob);
  if (hits.length) out.push(`N1 culture-tied word: ${hits.join(', ')}`);
  if (!text.trimEnd().endsWith(SIGN_OFF)) out.push('sign-off');
  out.push(...checkScenes(l.chapters, l.scenes, l.looks ?? []));
  return { problems: out, seconds };
}

/** Compliance problems of a bank entry, or null when it is skipped or published. */
export function complianceOf(e: any): string[] | null {
  let problems: string[] | null = null;
  if (!e.skip_reason && !e.published_on) {
    if (!('schema' in e) || e.schema !== 2) {
      if (e.kind !== 'short') {
        if (!e.script) {
          problems = ['no script'];
        } else {
          problems = checkLong({
            title: e.title,
            chapters: [
              { title: 'Cold open', text: e.script.cold_open },
              ...e.script.chapters.map((c: any) => ({ title: c.title, text: c.narration })),
              { title: 'Closing', text: e.script.closing },
            ],
            thumbnailText: e.thumbnail_text,
            thumbnailTexts: e.thumbnail_texts,
            tags: e.tags ?? [],
            description: e.description ?? '',
            scenes: e.scenes,
            looks: e.character_looks,
            blob: JSON.stringify(e),
          }).problems;
        }
      } else {
        const lines = (e.script?.beats ?? []).map((b: any) => b.line).filter(Boolean);
        if (!lines.length) {
          problems = ['no script'];
        } else {
          problems = checkShort({
            lines,
            hookText: e.hook_text,
            pov: e.hook_text_pov,
            beats: e.visual_brief?.shots ?? [],
            looks: e.visual_brief?.character_looks,
            tags: e.seo?.tags ?? [],
            pinned: e.seo?.pinned_comment,
            description: e.seo?.description ?? '',
            blob: [lines.join(' '), JSON.stringify(e.seo ?? {}), JSON.stringify(e.visual_brief ?? {})].join(' '),
          });
        }
      }
    } else if (e.kind !== 'short') {
      problems = checkLong({
        title: e.title,
        chapters: e.chapters.map((c: any) => ({ title: c.title, text: c.narration })),
        thumbnailText: e.thumbnail_text,
        thumbnailTexts: e.thumbnail_texts,
        tags: e.tags ?? [],
        description: e.description ?? '',
        scenes: e.screenplay?.scenes,
        looks: e.screenplay?.character_looks,
        blob: JSON.stringify({ ...e, line: undefined }),
      }).problems;
    } else {
      problems = checkShort({
        lines: e.narration.split('\n'),
        hookText: e.hook_text,
        pov: e.hook_text_pov,
        titleFinal: e.title_final,
        beats: e.visual_beats ?? [],
        tags: e.tags ?? [],
        pinned: e.pinned_comment,
        effect: e.effect,
        description: e.description_full,
        looks: e.character_looks,
        blob: [e.narration, e.description_full ?? '', ...(e.visual_beats ?? [])].join(' '),
      });
    }
  }
  const waived = WAIVE[e.id ?? ''];
  return problems && waived ? problems.filter((p) => !waived.includes(p.split(' ')[0])) : problems;
}

/** A bank written to the Gemini audits (compliance/structure fields). */
export function isComplianceBank(md: string): boolean {
  return /^\s*(?:- )?(compliance|structure): /m.test(md) && /single_idea_story|Gemini audits/.test(md);
}
