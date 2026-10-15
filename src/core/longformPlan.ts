/**
 * Long-form numbered episodes ("LF-01 | …") from the topic bank's
 * "Long-form episodes" section: parsing, the spoken script built from the
 * tables, chapter timings, the description, and a plan checker.
 */

export const LF_CATCHPHRASE = 'Stay curious, keep your eyes wide, and remember: once you see the pattern, you hold the power.';
export const LF_WORDS_PER_SECOND = 2.1;

const ORDINALS = ['one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve'];

export interface LfItem {
  n: number;
  short: string;
  tactic: string;
  vignette: string;
  setting: string;
  cutaway: string;
  chapter: string;
  body: string;
  where: string;
  defence: string;
}

export interface LfPlan {
  id: string;
  title: string;
  hook: string;
  hookAlt: string;
  promise: string;
  recap: string;
  resolution: string;
  care: string;
  commentQuestion: string;
  teaser: string;
  descLine1: string;
  descBody: string;
  openChapter: string;
  closeChapter: string;
  tags: string[];
  runtime: string;
  storyArc: string;
  /** Spoken-word budget [min, max]. */
  words: [number, number];
  interruptAfter: number;
  interrupt: string;
  items: LfItem[];
  visualRows: number;
  scriptRows: number;
}

export interface LfSegment {
  label: string;
  chapter?: string;
  text: string;
}

const wordCount = (s: string) => s.split(/\s+/).filter(Boolean).length;
const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function unq(s: string): string {
  const t = s.trim();
  return t.length > 1 && t.startsWith('"') && t.endsWith('"') ? t.slice(1, -1).trim() : t;
}

/** Rows of the markdown table under `header` (header and separator skipped). */
function table(md: string, header: string): string[][] {
  const i = md.indexOf(header);
  if (i < 0) return [];
  const rows: string[][] = [];
  for (const line of md.slice(i).split('\n').slice(2)) {
    if (!line.startsWith('|')) break;
    rows.push(line.trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim()));
  }
  return rows;
}

/** Evidence line of each Short ("MF-065" → "moderate (…)"), used in long-form descriptions. */
export function shortsEvidence(md: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const sec of md.split(/^# Long-form episodes.*$/m)[0].split(/\n(?=## MF-\d{3} \|)/)) {
    const id = /^## (MF-\d{3})/.exec(sec)?.[1];
    if (!id) continue;
    const ev = /^- evidence: (.*)$/m.exec(sec)?.[1]?.trim();
    if (ev != null) out[id] = ev;
  }
  return out;
}

export function parseLfPlans(md: string): LfPlan[] {
  const parts = md.split(/^# Long-form episodes.*$/m);
  if (parts.length < 2) return [];
  return parts[1]
    .split(/\n(?=## LF-\d\d \|)/)
    .slice(1)
    .map((section) => {
      const main = section.split('\n**Next-episode teasers:**')[0];
      const [id = '', title = ''] = main.split('\n', 1)[0].slice(3).split('|').map((s) => s.trim());
      const f = (label: string) => unq(new RegExp(`^- \\*\\*${esc(label)}[^*]*\\*\\*:? ?(.*)$`, 'm').exec(main)?.[1]?.trim() ?? '');
      const interrupt = /^- \*\*Pattern interrupt \(after item (\d+)\)[^*]*\*\*:? ?(.*)$/m.exec(main);
      const rows = table(main, '| # | Short | Tactic | Vignette seed |');
      const visual = table(main, '| # | Setting | Cutaway object | Chapter label |');
      const script = table(main, "| # | Item body | Where else you'll see it | Defence line |");
      const budget = (f('Word budget').match(/[\d,]+/g) ?? []).map((n) => Number(n.replace(/,/g, '')));
      return {
        id,
        title,
        hook: f('Hook (first 15 s)'),
        hookAlt: f('Hook alt'),
        promise: f('Promise'),
        recap: f('Recap line'),
        resolution: f('Resolution'),
        care: f('Care line'),
        commentQuestion: f('Comment question'),
        teaser: f('Next-episode teaser'),
        descLine1: f('Suggested description line 1'),
        descBody: f('Description body'),
        openChapter: f('Opening chapter label'),
        closeChapter: f('Closing chapter label'),
        tags: f('Tags (5 to 6)').split(',').map((t) => t.trim()).filter(Boolean),
        runtime: f('Target runtime'),
        storyArc: f('Story arc'),
        words: budget.length >= 2 ? [budget[0], budget[1]] : [0, 0],
        interruptAfter: interrupt ? Number(interrupt[1]) : 0,
        interrupt: interrupt ? unq(interrupt[2]) : '',
        items: rows.map((r, i) => ({
          n: i + 1,
          short: r[1] ?? '',
          tactic: r[2] ?? '',
          vignette: r[3] ?? '',
          setting: visual[i]?.[1] ?? '',
          cutaway: visual[i]?.[2] ?? '',
          chapter: visual[i]?.[3] ?? '',
          body: script[i]?.[1] ?? '',
          where: script[i]?.[2] ?? '',
          defence: script[i]?.[3] ?? '',
        })),
        visualRows: visual.length,
        scriptRows: script.length,
      } satisfies LfPlan;
    });
}

/** The spoken script, in order, labelled; segments that open a chapter carry its label. */
export function lfSegments(plan: LfPlan): LfSegment[] {
  const segs: LfSegment[] = [
    { label: 'COLD OPEN', chapter: plan.openChapter, text: plan.hook },
    { label: 'PROMISE', text: plan.promise },
  ];
  for (const it of plan.items) {
    segs.push({
      label: `ITEM ${it.n}: ${it.tactic} (${it.short})`,
      chapter: it.chapter,
      text: `Number ${ORDINALS[it.n - 1]}. ${it.vignette} ${it.body} ${it.where} ${it.defence}`,
    });
    if (it.n === plan.interruptAfter) segs.push({ label: 'PATTERN INTERRUPT', text: plan.interrupt });
  }
  segs.push({ label: 'RECAP', chapter: plan.closeChapter, text: plan.recap }, { label: 'RESOLUTION', text: plan.resolution });
  if (plan.care) segs.push({ label: 'CARE LINE', text: plan.care });
  segs.push({ label: 'OUTRO', text: `${plan.commentQuestion} ${plan.teaser} ${LF_CATCHPHRASE}` });
  return segs.map((s) => (s.chapter ? s : { label: s.label, text: s.text }));
}

/** Chapters as voiced units: a segment without a chapter label continues the previous chapter. */
export function lfChapters(plan: LfPlan): { title: string; narration: string }[] {
  const out: { title: string; narration: string }[] = [];
  for (const seg of lfSegments(plan)) {
    if (!seg.chapter && out.length) out[out.length - 1].narration += ` ${seg.text}`;
    else out.push({ title: seg.chapter ?? plan.openChapter, narration: seg.text });
  }
  return out;
}

export function lfNarration(plan: LfPlan): string {
  return lfSegments(plan)
    .map((s) => (s.chapter ? `[Chapter: ${s.chapter}]\n${s.text}` : s.text))
    .join('\n\n');
}

export function lfSpoken(plan: LfPlan): string {
  return lfSegments(plan)
    .map((s) => s.text)
    .join(' ');
}

/** Both tables are filled in, so the script can be voiced. */
export function lfWritten(plan: LfPlan): boolean {
  return plan.items.length > 0 && plan.scriptRows === plan.items.length;
}

/** Chapter start times estimated from word counts at the calm pace. */
export function lfEstimatedChapters(plan: LfPlan): { at: number; title: string }[] {
  const out: { at: number; title: string }[] = [];
  let words = 0;
  for (const seg of lfSegments(plan)) {
    if (seg.chapter) out.push({ at: words / LF_WORDS_PER_SECOND, title: seg.chapter });
    words += wordCount(seg.text);
  }
  return out;
}

/** "Tactic: citation (evidence: strength)" per item, from the Shorts' evidence lines. */
export function lfEvidenceLines(plan: LfPlan, evidence: Record<string, string>): string[] {
  return plan.items.map((it) => {
    const ev = evidence[it.short] ?? '';
    const m = /^(\S+)\s*\((.*)\)\s*(.*)$/.exec(ev);
    return m ? `${it.tactic}: ${m[2]} (evidence: ${m[1]})` : `${it.tactic}: ${ev}`;
  });
}

export function lfHashtags(firstTag: string): string {
  const tag = firstTag
    .toLowerCase()
    .replace(/[^a-z ]/g, '')
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w[0].toUpperCase() + w.slice(1))
    .join('');
  return `#psychology${tag ? ` #${tag}` : ''} #TheMindFiles`;
}

export function lfDescription(
  d: { line1: string; body: string; evidence: string[]; care: string; firstTag: string },
  chapters: string,
): string {
  const lines = [d.line1, '', d.body, ''];
  if (chapters.trim()) lines.push('Chapters', chapters.trim(), '');
  if (d.evidence.length) lines.push('Sources and evidence', ...d.evidence, '');
  if (d.care) lines.push(d.care, '');
  lines.push(lfHashtags(d.firstTag));
  return lines.join('\n');
}

function ts(seconds: number): string {
  const s = Math.round(seconds);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

export interface LfCheck {
  id: string;
  words: number;
  seconds: number;
  voiceChars: number;
  descWords: number;
  problems: string[];
}

export function checkLfPlan(plan: LfPlan, evidence: Record<string, string>): LfCheck {
  const spoken = lfSpoken(plan);
  const words = lfSegments(plan).reduce((n, s) => n + wordCount(s.text), 0);
  const chapters = lfEstimatedChapters(plan);
  const desc = lfDescription(
    { line1: plan.descLine1, body: plan.descBody, evidence: lfEvidenceLines(plan, evidence), care: plan.care, firstTag: plan.tags[0] ?? '' },
    chapters.map((c) => `${ts(c.at)} ${c.title}`).join('\n'),
  );
  const descWords = wordCount(desc);
  const [lo, hi] = plan.words;
  const problems: string[] = [];
  if (!(lo <= words && words <= hi)) problems.push(`spoken words ${words} outside budget ${lo}-${hi}`);
  if (descWords < 150 || descWords > 300) problems.push(`description ${descWords} words (150-300)`);
  if (chapters.length < 3) problems.push('fewer than 3 chapters');
  if (chapters.length && chapters[0].at !== 0) problems.push('first chapter not at 0:00');
  if (chapters.some((c, i) => i > 0 && c.at - chapters[i - 1].at < 10)) problems.push('a chapter shorter than 10 s');
  const required: [keyof LfPlan, string][] = [
    ['hook', 'hook'], ['promise', 'promise'], ['recap', 'recap'], ['resolution', 'resolution'],
    ['commentQuestion', 'comment_q'], ['teaser', 'teaser'], ['descLine1', 'desc_line1'], ['descBody', 'desc_body'],
    ['openChapter', 'open_chapter'], ['closeChapter', 'close_chapter'], ['interrupt', 'interrupt'],
  ];
  for (const [k, label] of required) if (!plan[k]) problems.push(`missing ${label}`);
  const n = plan.items.length;
  if (!n || plan.visualRows !== n || plan.scriptRows !== n) {
    problems.push(`tables do not match: ${n} vignettes, ${plan.visualRows} visual rows, ${plan.scriptRows} script rows`);
  }
  if (!(plan.interruptAfter >= 1 && plan.interruptAfter < n)) problems.push('pattern interrupt position');
  for (const it of plan.items) {
    if (!it.vignette || !it.body || !it.where || !it.defence || !it.chapter) problems.push(`item ${it.n} incomplete`);
  }
  const lead = /^(\d+)/.exec(plan.title);
  if (lead && Number(lead[1]) !== n) problems.push(`title count ${lead[1]} != ${n} items`);
  return { id: plan.id, words, seconds: words / LF_WORDS_PER_SECOND, voiceChars: spoken.length, descWords, problems };
}

/** "One: … Two: … Three: …" in a closing line → three short bullet points and what follows them. */
export function lfListBullets(text: string): { points: string[]; after: string } | null {
  const sentences = text.split(/(?<=[.?!]['"”’]?)\s+(?=[A-Z'"])/);
  const idx = ['One', 'Two', 'Three'].map((w) => sentences.findIndex((s) => new RegExp(`^${w}:\\s`).test(s)));
  if (idx.some((i) => i < 0) || !(idx[0] < idx[1] && idx[1] < idx[2])) return null;
  const point = (s: string) => {
    const head = s.replace(/^\w+:\s*/, '').replace(/[.?!]$/, '').split(/[,:;]| because | and then /)[0].trim();
    return head.charAt(0).toUpperCase() + head.slice(1);
  };
  return { points: idx.map((i) => point(sentences[i])), after: sentences.slice(idx[2] + 1).join(' ').trim() };
}

/** Replaces (or appends) the "Chapters" block of a description with real timestamps. */
export function withRealChapters(description: string, chapters?: string | null): string {
  const ch = (chapters ?? '').trim();
  if (!ch) return description.trim();
  const lines = description.replace(/\r\n/g, '\n').split('\n');
  const i = lines.findIndex((l) => /^chapters:?\s*$/i.test(l.trim()));
  if (i < 0) return `${description.trim()}\n\nChapters\n${ch}`;
  let j = i + 1;
  while (j < lines.length && /^\d+:\d{2}(?::\d{2})?\s/.test(lines[j].trim())) j++;
  return [...lines.slice(0, i + 1), ...ch.split('\n'), ...lines.slice(j)].join('\n').trim();
}
