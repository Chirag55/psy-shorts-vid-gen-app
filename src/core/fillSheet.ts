import { CAST, type CastMember } from '@/assets/cast';
import { WORDS_PER_SECOND } from './guardrails';

/** Most new stills a long video may use. */
export const MAX_STILLS = 15;
/** Most video clips a long video may use. */
export const MAX_CLIPS = 6;

const SHEET_HEADER =
  '# The Mind Files fill-in sheet. Edit setting, cutaway and cast; keep the key. One row per beat: key | setting | cutaway | cast';

const CAST_NAMES = Object.values(CAST).map((c) => c.name);
/** Cast by display name; the first entry with a name wins. */
const BY_NAME = Object.values(CAST).reduce<Record<string, CastMember>>((m, c) => {
  m[c.name] = m[c.name] ?? c;
  return m;
}, {});

const norm = (s: string) => s.toLowerCase().replace(/\s+/g, ' ').trim();
const replaceAll = (text: string, from: string, to: string) =>
  from && text.includes(from) ? text.split(from).join(to) : text;

/** Cast members named in a prompt ("Name: look"), in order of appearance. */
export function castIn(prompt: string): string[] {
  return [
    ...new Set(
      CAST_NAMES.map((n) => ({ n, at: prompt.search(new RegExp(`\\b${n}: `)) }))
        .filter((x) => x.at >= 0)
        .sort((a, b) => a.at - b.at)
        .map((x) => x.n),
    ),
  ];
}

export interface SheetVisual {
  key: string;
  kind: string;
  prompt: string;
  reuse?: string;
  setting?: string;
  subject?: string;
  words: number;
  seconds?: number;
  [key: string]: unknown;
}

export interface RowEdit {
  setting?: string;
  cutaway?: string;
  cast?: string;
}

/** A visual with its setting, cutaway object or single cast member changed, in the prompt too. */
export function applyRowEdit<V extends SheetVisual>(v: V, edit: RowEdit): V {
  if (v.kind === 'card') return v;
  const out: V = { ...v };
  let prompt = v.prompt;
  if (edit.setting !== undefined && edit.setting !== (v.setting ?? '')) {
    prompt = v.setting ? replaceAll(prompt, v.setting, edit.setting) : prompt.replace(/Setting: ;/, `Setting: ${edit.setting};`);
    out.setting = edit.setting;
  }
  if (edit.cutaway !== undefined && edit.cutaway !== (v.subject ?? '')) {
    if (v.subject) prompt = replaceAll(prompt, v.subject, edit.cutaway);
    out.subject = edit.cutaway;
  }
  if (edit.cast !== undefined) {
    const present = castIn(prompt);
    const target = edit.cast !== 'none' ? BY_NAME[edit.cast] : undefined;
    if (present.length === 1 && (!target || present[0] !== target.name)) {
      const current = BY_NAME[present[0]];
      const at = prompt.indexOf(`${current.name}: ${current.look}`);
      if (at >= 0) {
        const end = prompt.indexOf('. Setting:', at);
        if (end > at) {
          const insert = target ? `${target.name}: ${target.look}, wearing ${target.outfits[0]}` : '';
          prompt = `${prompt.slice(0, at)}${insert}${prompt.slice(end)}`.replace(/\.\s*\./g, '.').replace(/\s{2,}/g, ' ');
        }
      }
    }
  }
  out.prompt = prompt;
  return out;
}

export interface SheetRow {
  beat: number;
  chapter: string;
  key: string;
  words: number;
  seconds: number;
  setting: string;
  cutaway: string;
  cast: string;
  visual: string;
  number: string;
  status: 'imported' | 'prompt copied' | 'empty';
  blanks: string[];
  chip?: string;
}

/** The long video's visuals as one editable row per beat, with numbering, blanks and limits. */
export function buildSheet(
  chapters: { title: string; visuals?: SheetVisual[] }[],
  imported: { still: (key: string) => boolean; clip: (key: string) => boolean },
  copied: Set<string> = new Set(),
) {
  const flat = chapters.flatMap((ch) => (ch.visuals ?? []).map((v) => ({ v, chapter: ch.title })));
  const numbers = new Map<string, string>();
  let n = 0;
  for (const { v } of flat) {
    if (v.kind === 'still' && !v.reuse) numbers.set(v.key, `S${String(++n).padStart(3, '0')}`);
  }
  let clips = 0;
  const rows: SheetRow[] = flat.map(({ v, chapter }, i) => {
    const source = v.reuse ?? v.key;
    const number =
      v.kind === 'still' ? `${numbers.get(source) ?? ''}${v.reuse ? ' (reuse)' : ''}` : v.kind === 'clip' ? `C${++clips}` : '';
    const has = v.kind === 'still' ? imported.still(source) : v.kind === 'clip' ? imported.clip(v.key) : false;
    const isCard = v.kind === 'card';
    const cast = castIn(v.prompt);
    const setting = isCard ? '' : (v.setting ?? '').trim();
    const cutaway = isCard ? '' : (v.subject ?? '').trim();
    const blanks: string[] = [];
    if (!isCard) {
      if (!setting) blanks.push('setting');
      if (!cutaway) blanks.push('cutaway');
    }
    const prev = i > 0 ? flat[i - 1].v : undefined;
    const chip =
      prev &&
      prev.kind !== 'card' &&
      !isCard &&
      setting &&
      norm(setting) === norm(prev.setting ?? '') &&
      cutaway &&
      norm(cutaway) === norm(prev.subject ?? '')
        ? 'Same setting and cutaway as the row before'
        : undefined;
    return {
      beat: i + 1,
      chapter,
      key: v.key,
      words: v.words,
      seconds: Math.round((v.seconds ?? v.words / WORDS_PER_SECOND) * 10) / 10,
      setting,
      cutaway,
      cast: cast.length ? cast.join(', ') : 'none',
      visual: v.kind,
      number,
      status: has ? 'imported' : copied.has(source) ? 'prompt copied' : 'empty',
      blanks,
      ...(chip ? { chip } : {}),
    };
  });
  const stills = numbers.size;
  const blanks = rows.reduce((sum, r) => sum + r.blanks.length, 0);
  const problems: string[] = [];
  if (stills > MAX_STILLS) problems.push(`${stills} stills; ${MAX_STILLS} at most. Reuse one for up to 3 beats.`);
  if (clips > MAX_CLIPS) problems.push(`${clips} clips; ${MAX_CLIPS} at most.`);
  const uniq = (xs: string[]) => [...new Set(xs.filter(Boolean))];
  return {
    rows,
    blanks,
    stills,
    clips,
    cards: rows.filter((r) => r.visual === 'card').length,
    problems,
    summary: blanks ? `${blanks} blank${blanks === 1 ? '' : 's'} left` : 'No blanks left',
    settings: uniq(rows.map((r) => r.setting)),
    cutaways: uniq(rows.map((r) => r.cutaway)),
  };
}

export type FillSheet = ReturnType<typeof buildSheet>;

/** The sheet as plain text to edit outside the app. */
export function sheetText(sheet: FillSheet): string {
  const lines = sheet.rows
    .filter((r) => r.visual !== 'card')
    .map((r) => [r.key, r.setting, r.cutaway, r.cast].join(' | '));
  return `${SHEET_HEADER}\n${lines.join('\n')}\n`;
}

/** Edits from a pasted sheet, and the lines that could not be used. */
export function parseSheetText(text: string, sheet: FillSheet): { edits: Record<string, RowEdit>; skipped: string[] } {
  const edits: Record<string, RowEdit> = {};
  const skipped: string[] = [];
  const byKey = new Map(sheet.rows.map((r) => [r.key, r]));
  text.split(/\r?\n/).forEach((line, i) => {
    if (!line.trim() || line.trim().startsWith('#')) return;
    const [key = '', setting = '', cutaway = '', cast = ''] = line.split('|').map((s) => s.trim());
    const row = byKey.get(key);
    if (!row || row.visual === 'card') {
      skipped.push(`line ${i + 1}: "${key}" is not an editable row`);
      return;
    }
    if (cast && cast !== 'none' && !BY_NAME[cast.split(',')[0].trim()]) {
      skipped.push(`line ${i + 1}: "${cast}" is not in the cast`);
      return;
    }
    const e: RowEdit = {};
    if (setting !== row.setting) e.setting = setting;
    if (cutaway !== row.cutaway) e.cutaway = cutaway;
    if (cast && cast !== row.cast) e.cast = cast.split(',')[0].trim();
    if (Object.keys(e).length) edits[key] = e;
  });
  return { edits, skipped };
}

export function applyEdits<C extends { visuals?: SheetVisual[] }>(chapters: C[], edits: Record<string, RowEdit>): C[] {
  return chapters.map((ch) =>
    ch.visuals ? { ...ch, visuals: ch.visuals.map((v) => (edits[v.key] ? applyRowEdit(v, edits[v.key]) : v)) } : ch,
  );
}

/** A prompt asking a model to fill the blank settings and cutaways. */
export function fillBlanksPrompt(sheet: FillSheet, lineFor: (key: string) => string): string {
  const rows = sheet.rows
    .filter((r) => r.blanks.length)
    .map(
      (r) =>
        `${r.key}: needs ${r.blanks.join(' and ')}; chapter "${r.chapter}"; the line it covers: "${lineFor(r.key).slice(0, 160)}"`,
    );
  return [
    'Fill the blank fields of a documentary long-form storyboard.',
    `Settings already used (reuse when natural, never the same setting as the row before): ${sheet.settings.join('; ') || 'none yet'}.`,
    `Cutaway objects already used: ${sheet.cutaways.join('; ') || 'none yet'}.`,
    'A setting is a place (2 to 5 words, no city, country or nationality). A cutaway is one concrete object (2 to 6 words). No readable text, no brand names.',
    'Return JSON: {"rows":[{"key":"...","setting":"...","cutaway":"..."}]} with one entry per row below, filling only what it needs.',
    rows.join('\n'),
  ].join('\n');
}
