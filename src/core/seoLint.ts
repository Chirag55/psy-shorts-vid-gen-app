import { lfDescription, withRealChapters } from './longformPlan';
import { sentences } from './bankV2';
import { hookUnit } from './authenticity';
import { fitTags } from './seoMeta';

export const FULL_FILE_PREFIX = '▶ Full file:';
export const FULL_FILE_PLACEHOLDER = `${FULL_FILE_PREFIX} coming soon`;
export const FULL_BREAKDOWN_PREFIX = 'Full breakdown:';
export const HOOT_LINE = "Professor Hoot decodes one mind trick a day. Subscribe so you're never the one being played.";
/** Wording that marks an unfinished description line. */
export const PLACEHOLDER_WORDING = /\bcoming soon\b|\bTBD\b|\blink in (the )?(description|comments?)\b|\bto be announced\b/i;

const STOP_WORDS = new Set([
  'the', 'a', 'an', 'of', 'and', 'or', 'to', 'in', 'on', 'for', 'with', 'your', 'you', 'why', 'how', 'what', 'effect', 'psychology',
]);
/** Tags too broad to be worth a slot. */
const GENERIC_TAGS = [
  'persuasion & influence',
  'manipulation & defense',
  'cognitive bias',
  'body language & social',
  'persuasion',
  'influence',
  'manipulation',
  'defense',
  'body language',
];
const PILLAR_TAGS: Record<string, string[]> = {
  'Persuasion & Influence': ['persuasion techniques', 'how persuasion works', 'psychology of influence'],
  'Manipulation & Defense': ['dark psychology', 'signs of manipulation', 'how to spot manipulation'],
  'Cognitive Bias': ['cognitive biases examples', 'thinking errors', 'why your brain does this'],
  'Body Language & Social': ['body language psychology', 'reading people', 'social psychology'],
};

export const TITLE_HASHTAGS_MAX = 3;
export const TITLE_TOTAL_MAX = 100;
/** Hashtags a title may use; others close to these are flagged as typos. */
export const KNOWN_TITLE_HASHTAGS = [
  'shorts', 'psychology', 'psychologyfacts', 'darkpsychology', 'relationships', 'dating', 'love', 'mindset', 'selfimprovement',
  'manipulation', 'cognitivebias', 'bodylanguage', 'persuasion', 'communication', 'mentalhealth', 'humanbehavior', 'facts',
  'didyouknow', 'viral',
];
export const SHORT_TAGS = { min: 8, max: 12 };
export const LONG_HASHTAGS = 5;
export const SHORT_HASHTAGS = 5;
const PILLAR_HASHTAG: Record<string, string> = {
  'Persuasion & Influence': 'persuasion',
  'Manipulation & Defense': 'manipulation',
  'Cognitive Bias': 'cognitivebias',
  'Body Language & Social': 'bodylanguage',
};
const LONG_EXTRA_HASHTAGS = ['psychologyfacts', 'selfimprovement', 'humanbehavior'];
export const LONG_DISCLAIMER =
  'Disclaimer: This video is for education only and is not professional advice. If you are struggling, please reach out to a licensed professional.';

const HASHTAG = /#[\p{L}\p{N}_]+/gu;
const LINE_HASHTAG = /(^|\s)#[\p{L}\p{N}_]+/gu;
const CHAPTER_PREFIX = /^(\d+\.|(myth|real|signal|button) \d+ [—–-])\s*/i;

function editDistance(a: string, b: string): number {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
  }
  return d[a.length][b.length];
}

/** A title without its hashtags. */
export function titleText(title: string): string {
  return title.replace(/\s*#[\p{L}\p{N}_]+/gu, '').replace(/\s+/g, ' ').trim();
}

function listOf(items: string[]): string {
  return items.length <= 1 ? items.join('') : `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}

/** Hashtags one or two letters off a known one. */
export function hashtagTypos(text: string, known: string[] = KNOWN_TITLE_HASHTAGS): { tag: string; meant: string }[] {
  return (text.match(HASHTAG) ?? []).flatMap((tag) => {
    const lower = tag.slice(1).toLowerCase();
    if (known.includes(lower)) return [];
    const meant = known.find((k) => k.length >= 5 && Math.abs(k.length - lower.length) <= 2 && editDistance(lower, k) <= 2);
    return meant ? [{ tag, meant: `#${meant}` }] : [];
  });
}

/** "Author (Year)" from a source line. */
function researcher(source: string): string {
  const m = /^(.*?\(\d{4}\))/.exec(source.trim());
  return (m ? m[1] : source.split(',')[0]).trim();
}

/** "This video breaks down …: a, b and c. It draws on research by …" for a long-form description. */
export function breaksDownParagraph(e: any): string {
  const middle = e.chapters.slice(1, -1);
  const numbered = middle.filter((c: any) => CHAPTER_PREFIX.test(c.title));
  const items = (numbered.length >= 3 ? numbered : middle)
    .filter((c: any) => !/^why\b/i.test(c.title))
    .map((c: any) => {
      const kind = /^(myth|real|signal)\b/i.exec(c.title)?.[1].toLowerCase();
      const tag = kind === 'signal' ? 'real' : kind;
      const name = c.title.replace(CHAPTER_PREFIX, '').trim();
      const text = /^[A-Z]{2,}\b/.test(name) ? name : name.charAt(0).toLowerCase() + name.slice(1);
      return text ? `${text}${tag ? ` (${tag})` : ''}` : '';
    })
    .filter(Boolean);
  const researchers = e.sources.filter((s: string) => /\(\d{4}\)/.test(s)).map(researcher);
  const effect = e.effect ?? e.title.replace(/\s*\(.*\)\s*$/, '');
  const intro = sentences(e.chapters[0]?.narration ?? '');
  const promise = intro.find((s) => /^(in the next|by the end|you'll (see|learn|discover))\b/i.test(s)) ?? intro[0] ?? '';
  return [
    `This video breaks down ${effect}${items.length ? `: ${listOf(items)}` : ''}.`,
    researchers.length ? `It draws on research by ${listOf(researchers)}.` : '',
    promise,
  ]
    .filter(Boolean)
    .join(' ');
}

export function fullBreakdownLine(link: { title: string; url: string }): string {
  return `${FULL_BREAKDOWN_PREFIX} ${link.title} ${link.url}`;
}

/** Whether a description already links its long-form. */
export function hasLongformLink(text: string): boolean {
  return text.includes(FULL_BREAKDOWN_PREFIX) || /▶ Full file: (?!coming soon)/.test(text);
}

const cleanHashtag = (t: string) => `#${t.replace(/^#/, '').replace(/[^\p{L}\p{N}]+/gu, '').toLowerCase()}`;
const ownHashtag = (t: string) => t.length > 1 && !['#psychology', '#shorts', '#psychologyfacts'].includes(t);
const rawHashtags = (e: any): string[] => (e.hashtags?.length ? e.hashtags : e.effect ? [e.effect] : []);

/** A Short's description hashtags: #psychology, up to three of its own, #shorts. */
export function v2Hashtags(e: any): string[] {
  const own = [...new Set(rawHashtags(e).map(cleanHashtag).filter(ownHashtag))];
  return ['#psychology', ...own.slice(0, 3), '#shorts'];
}

/** The entry's own hashtags, cleaned and without the channel-wide ones. */
export function ownHashtags(e: any): string[] {
  return [...new Set(rawHashtags(e).map(cleanHashtag).filter(ownHashtag))];
}

/** The title with up to three hashtags, dropping hashtags until it fits TITLE_TOTAL_MAX. */
export function withTitleHashtags(title: string, e: any): string {
  const base = titleText(title);
  const existing = (title.match(HASHTAG) ?? []).map((t) => t.toLowerCase());
  const own = [...new Set(rawHashtags(e).map(cleanHashtag).filter(ownHashtag))];
  const pool = ['#psychologyfacts', ...own];
  const tags = [...new Set(['#shorts', ...existing.filter((t) => t !== '#shorts'), ...pool])].slice(0, TITLE_HASHTAGS_MAX);
  while (tags.length && `${base} ${tags.join(' ')}`.length > TITLE_TOTAL_MAX) tags.pop();
  return [base, ...tags].join(' ');
}

/** A Short's tags: bank tags, title phrases and effect variants first, then the pillar's core tags. */
export function v2Tags(e: any, extra: string[] = []): string[] {
  const effect = (e.effect ?? '').trim().toLowerCase();
  const base = [...(e.tags ?? []), ...(e.long_tail ?? [])].map((t: string) => t.trim().toLowerCase());
  const words = effect
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, ' ')
    .split(/[\s-]+/)
    .filter((w: string) => w.length >= 4 && !STOP_WORDS.has(w));
  const extraHits = extra.map((t) => t.trim().toLowerCase()).filter((t) => t && words.some((w: string) => t.includes(w)));
  const titleTag = (t: string) =>
    t
      .split('|')[0]
      .replace(/\([^)]*\)/g, ' ')
      .replace(/#\S+/g, ' ')
      .replace(/[^A-Za-z0-9'\s-]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .toLowerCase();
  const primary = [
    ...base,
    ...(e.title ? [titleTag(e.title)] : []),
    ...(e.title_alt ? [titleTag(e.title_alt)] : []),
    ...(effect
      ? [`${effect} explained`, `${effect} examples`, `${effect} psychology`, `what is ${effect}`, `${effect} in real life`]
      : []),
    ...extraHits,
    ...(PILLAR_TAGS[e.pillar] ?? []),
  ];
  const secondary = [...(effect ? [effect] : []), 'psychology facts', 'the mind files'];
  const titles = new Set([e.title, e.title_alt].filter(Boolean).map((t: string) => t.toLowerCase().trim()));
  const ok = (t: string) => t.length > 2 && !GENERIC_TAGS.includes(t) && !titles.has(t);
  const seen = new Set<string>();
  const fresh = (t: string) => {
    if (!ok(t) || seen.has(t)) return false;
    seen.add(t);
    return true;
  };
  const picked = primary.filter(fresh);
  const room = SHORT_TAGS.max - secondary.filter(ok).length;
  return fitTags([...picked.slice(0, room), ...secondary.filter(fresh)].slice(0, SHORT_TAGS.max));
}

/** The first question in a text, if it's short enough to close on. */
export function endQuestionOf(text?: string | null): string | undefined {
  const first = (text ?? '').replace(/\s+/g, ' ').trim().split(/(?<=\?)\s/)[0] ?? '';
  return first.endsWith('?') && first.split(' ').length <= 12 ? first : undefined;
}

/** The narration's takeaway: its last full sentence that isn't a label or a lead-in. */
export function soWhatLine(narration: string): string {
  const all = sentences(narration).filter((s) => /[.!?]["”’']?$/.test(s.trim()));
  const pool = all.length > 1 ? all.slice(1) : all;
  const good = pool.filter((s) => s.split(/\s+/).length >= 5 && !/^\S+:/.test(s) && !/^(it's|that's|so)\b.*:/i.test(s));
  const list = good.length ? good : pool;
  return (list[list.length - 1] ?? '').trim();
}

export function sourceLineOf(e: any): string {
  return `Source: ${e.source_line?.trim().replace(/^based on\s+/i, '') || e.source}`;
}

/** The bank's full Short description, with the long-form link added before its source line. */
export function bankShortDescription(e: any, link?: { title: string; url: string }): string | undefined {
  const full = e.description_full?.trim();
  if (!full) return undefined;
  if (!link || hasLongformLink(full)) return full;
  const line = fullBreakdownLine(link);
  const source = e.source_line?.trim().replace(/^based on\s+/i, '');
  const at = [
    full.search(/^Source:/m),
    source ? full.indexOf(source) : -1,
    full.search(/^New psychology Shorts/m),
    full.lastIndexOf('\n\n#') + 2,
  ].find((i) => i > 0);
  if (!at) return `${full}\n\n${line}`;
  return `${full.slice(0, at)}${line}\n\n${full.slice(at)}`;
}

/** A v2 Short's description: hook and takeaway, pinned line, channel line, source, hashtags. */
export function v2ShortDescription(e: any, link?: { title: string; url: string }): string {
  let first = e.description_line?.trim();
  if (!first) {
    const all = sentences(e.narration);
    const unit = hookUnit(all);
    const parts = unit.length === 1 && unit[0].split(/\s+/).length < 6 && all[1] ? [unit[0], all[1]] : unit;
    first = parts.join(' ').trim();
  }
  const takeaway = soWhatLine(e.narration);
  const second = takeaway && takeaway !== first ? takeaway : '';
  const pinned = e.pinned_comment?.trim().split('\n')[0] ?? '';
  return [
    [first, second].filter(Boolean).join('\n'),
    pinned,
    [HOOT_LINE, ...(link ? [fullBreakdownLine(link)] : [])].join('\n'),
    sourceLineOf(e),
    ['#psychology', ...ownHashtags(e).slice(0, 3), '#shorts'].join(' '),
  ]
    .filter(Boolean)
    .join('\n\n');
}

/** The description with the long-form link in place of the placeholder or under the channel line; null if not possible. */
export function addFullBreakdownLine(description: string, link: { title: string; url: string }): string | null {
  const line = fullBreakdownLine(link);
  if (description.includes(FULL_FILE_PLACEHOLDER)) return description.replace(FULL_FILE_PLACEHOLDER, line);
  if (hasLongformLink(description)) return null;
  if (!description.includes(HOOT_LINE)) return null;
  return description.replace(HOOT_LINE, `${HOOT_LINE}\n${line}`);
}

/** The best-performing Shorts to list under a long-form. */
export function relevantShorts<T extends { views?: number; order: number }>(shorts: T[], n = 2): T[] {
  return [...shorts].sort((a, b) => (b.views ?? -1) - (a.views ?? -1) || a.order - b.order).slice(0, n);
}

/** A long-form's description hashtags, up to LONG_HASHTAGS. */
export function v2LongHashtags(e: any): string[] {
  const out: string[] = [];
  const add = (t: string) => {
    const tag = `#${t.replace(/^#/, '').replace(/\s+/g, '').toLowerCase()}`;
    if (!out.includes(tag) && out.length < LONG_HASHTAGS) out.push(tag);
  };
  ['psychology', PILLAR_HASHTAG[e.pillar], ...(e.hashtags ?? []), ...LONG_EXTRA_HASHTAGS].filter(Boolean).forEach(add);
  return out;
}

/** A v2 long-form's description from its bank fields and links. */
export function v2LongDescription(
  e: any,
  ctx: {
    chapters?: string;
    next?: { title: string; url: string };
    shorts?: { title: string; url: string }[];
  } = {},
): string {
  if (e.description) return withRealChapters(e.description, ctx.chapters);
  if (e.description_body && e.description_intro && e.evidence_lines?.length) {
    return lfDescription(
      {
        line1: e.description_intro,
        body: e.description_body,
        evidence: e.evidence_lines,
        care: e.care_line,
        firstTag: e.tags?.[0] ?? '',
      },
      ctx.chapters ?? '',
    );
  }
  const lines: string[] = [e.title, '', ...(e.description_intro ? [e.description_intro, ''] : []), breaksDownParagraph(e), ''];
  if (ctx.chapters?.trim()) lines.push('CHAPTERS', ctx.chapters.trim(), '');
  if (ctx.next) lines.push('NEXT VIDEO', `${ctx.next.title}: ${ctx.next.url}`, '');
  if (e.comment_question) lines.push(e.comment_question, '');
  if (e.care_line) lines.push(e.care_line, '');
  if (ctx.shorts?.length) lines.push('WATCH NEXT', ...ctx.shorts.map((s) => `${s.title}: ${s.url}`), '');
  lines.push(
    v2LongHashtags(e).join(' '),
    '',
    '---',
    'Research referenced:',
    ...e.sources.map((s: string) => `- ${s}`),
    '---',
    LONG_DISCLAIMER,
  );
  return lines.join('\n');
}

/** Title and description rule breaks (CR-43, CR-56, CR-65, CR-80A, CR-80C). */
export function metadataProblems(meta: { title: string; description: string }, kind: 'short' | 'long' = 'short'): string[] {
  const out: string[] = [];
  const title = meta.title.trim();
  const text = titleText(title);
  if (text.length > 70) out.push(`The title is ${text.length} characters before its hashtags; 70 or fewer (CR-80A).`);
  if (title.length > TITLE_TOTAL_MAX) {
    out.push(
      `The title is ${title.length} characters with its hashtags; ${TITLE_TOTAL_MAX} or fewer: drop hashtags before shortening the title (CR-80A).`,
    );
  }
  for (const t of hashtagTypos(title)) out.push(`The title has "${t.tag}": did you mean ${t.meant}? (CR-80A)`);
  const caps = text.split(/\s+/).filter((w) => /[A-Z]{2,}/.test(w) && w === w.toUpperCase() && /[A-Z]/.test(w));
  if (caps.length > 2) out.push(`${caps.length} words are in capitals (${caps.join(' ')}); keep it to 2 (CR-56).`);
  const titleTags = title.match(HASHTAG) ?? [];
  if (titleTags.length > TITLE_HASHTAGS_MAX) {
    out.push(`The title has ${titleTags.length} hashtags (${titleTags.join(' ')}); ${TITLE_HASHTAGS_MAX} at most (CR-80A).`);
  }
  const placeholder = PLACEHOLDER_WORDING.exec(meta.description)?.[0];
  if (placeholder) {
    out.push(
      `The description says "${placeholder}"; never publish a placeholder: leave the line out until there is something to say (CR-80C).`,
    );
  }
  const lines = meta.description.trim().split('\n');
  const all = meta.description.match(LINE_HASHTAG) ?? [];
  const long = kind === 'long';
  const max = long ? LONG_HASHTAGS : SHORT_HASHTAGS;
  if (all.length > max) out.push(`The description has ${all.length} hashtags; ${max} at most (${long ? 'CR-65' : 'CR-43'}).`);
  const count = (l: string) => (l.match(LINE_HASHTAG) ?? []).length;
  if (all.length) {
    if (!long) {
      if (count(lines[lines.length - 1] ?? '') !== all.length) {
        out.push('Put the hashtags together on the last line of the description (CR-56).');
      }
    } else if (!lines.some((l) => count(l) === all.length)) {
      out.push('Put the hashtags together on one line (CR-65).');
    }
  }
  return out;
}
