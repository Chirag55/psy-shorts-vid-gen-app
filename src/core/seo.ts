import { fitTags, tagsLength } from './seoMeta';
import { utf8Length } from './metadataUpdate';

/** Tags every video carries. */
export const BASE_TAGS = ['psychology', 'psychology facts', 'human behavior', 'human psychology', 'the mind files'];
export const BRAND_TAG = 'the mind files';
export const SHORT_CHANNEL_LINE = 'Subscribe to The Mind Files for a new psychology Short every day.';
export const LONG_CHANNEL_LINE =
  'Subscribe to The Mind Files for daily psychology Shorts and a new deep dive every two weeks.';

const STOP_WORDS = new Set([
  'the', 'a', 'an', 'of', 'to', 'and', 'or', 'in', 'on', 'for', 'with', 'why', 'how', 'what', 'you', 'your', 'are', 'is',
  'it', 'its', 'that', 'this', 'they', 'them', 'their', 'who', 'do', 'does', 'be', 'from', 'by', 'at', 'as',
]);
/** Words too broad to show a title is about a topic. */
const GENERIC_WORDS = new Set([
  'psychology', 'psychological', 'facts', 'human', 'behavior', 'behaviour', 'people', 'principle', 'effect', 'bias',
]);
/** Tags that name a field, not a topic. */
const BROAD_TAGS = new Set([
  'persuasion psychology', 'cognitive bias', 'manipulation tactics', 'dark psychology', 'influence', 'body language',
  'nonverbal communication', 'reading people', 'psychological facts', 'human psychology facts', 'social psychology',
  'social skills', 'communication skills', 'marketing psychology', 'relationship psychology',
]);
const HASHTAG_LINE = /^(#[\p{L}\p{N}_]+\s*)+$/u;

const words = (s: string) => s.toLowerCase().match(/[a-z0-9']+/g) ?? [];
const content = (ws: string[]) => ws.filter((w) => w.length >= 4 && !STOP_WORDS.has(w));
function significant(ws: string[]): string[] {
  const all = content(ws);
  const specific = all.filter((w) => !GENERIC_WORDS.has(w));
  return specific.length ? specific : all;
}
const sentence = (s: string) => {
  const t = s.trim().replace(/\s+/g, ' ');
  return t && !/[.!?]$/.test(t) ? `${t}.` : t;
};
const lowerFirst = (s: string) => (s ? s.charAt(0).toLowerCase() + s.slice(1) : s);

/** Whether the text is about the keyword: its words, or their stems. */
function mentions(text: string, keyword: string): boolean {
  const key = significant(words(keyword));
  if (!key.length) return text.toLowerCase().includes(keyword.toLowerCase());
  const have = new Set(content(words(text)));
  return key.some((k) => have.has(k) || [...have].some((w) => w.startsWith(k.slice(0, 5))));
}

export function hashtag(s: string): string {
  return `#${s.toLowerCase().replace(/[^a-z0-9]/g, '')}`;
}

export function hashtagsIn(text: string): string[] {
  return text.match(/(^|\s)#[\p{L}\p{N}_]+/gu)?.map((t) => t.trim()) ?? [];
}

/** The topic hashtag for a keyword, from its first two content words when it is long. */
function topicHashtag(keyword: string): string {
  const ws = words(keyword).filter((w) => !STOP_WORDS.has(w));
  return `#${(ws.length > 3 ? ws.slice(0, 2) : ws).join('').toLowerCase().replace(/[^a-z0-9]/g, '')}`;
}

/** The keyword a video is about: its tactic, or its most specific tag the text talks about. */
export function focusKeyword(x: { tactic?: string; tags?: string[]; text?: string }): string | undefined {
  const tactic = x.tactic?.trim();
  if (tactic) return tactic.toLowerCase();
  const base = new Set(BASE_TAGS);
  let candidates = (x.tags ?? [])
    .map((t) => t.trim().toLowerCase())
    .filter((t) => t && !base.has(t) && !/^(shorts?|psychology)$/.test(t));
  const text = (x.text ?? '').toLowerCase();
  const specific = candidates.filter((t) => !BROAD_TAGS.has(t));
  if (specific.length) candidates = specific;
  return (
    (text && (candidates.find((t) => text.includes(t)) || candidates.find((t) => mentions(text, t)))) || candidates[0]
  );
}

export interface SeoCheck {
  id: string;
  label: string;
  weight: number;
  ok: boolean;
  detail: string;
}

export interface SeoMeta {
  title: string;
  description: string;
  tags: string[];
}

/** Scores a video's title, description and tags against what search and the Shorts feed need. */
export function auditSeo(
  meta: SeoMeta,
  opts: { mode: 'short' | 'long'; keyword?: string; deepDiveUrl?: string },
): { score: number; checks: SeoCheck[] } {
  const title = meta.title.trim();
  const desc = meta.description.trim();
  const tags = meta.tags.map((t) => t.trim()).filter(Boolean);
  const kw = opts.keyword;
  const checks: SeoCheck[] = [];
  const add = (id: string, label: string, weight: number, ok: boolean, detail: string) =>
    checks.push({ id, label, weight, ok, detail });

  const titleTags = title.match(/#[\p{L}\p{N}_]+/gu) ?? [];
  const bare = [...title.replace(/\s*#[\p{L}\p{N}_]+/gu, '').trim()].length;
  const full = [...title].length;
  add(
    'title-length',
    'Title length',
    10,
    bare >= 20 && bare <= 70 && full <= 100,
    bare < 20
      ? `${bare} characters — too short to say what the video is about.`
      : bare > 70
        ? `${bare} characters — search results cut titles off after about 70.`
        : full > 100
          ? `${full} characters with its hashtags; 100 at most.`
          : `${full} characters.`,
  );
  const short = opts.mode === 'short';
  const titleTagsOk = short ? titleTags.length <= 3 : titleTags.length === 0;
  add(
    'title-hashtags',
    short ? 'At most 3 hashtags in the title' : 'No hashtags in the title',
    5,
    titleTagsOk,
    titleTagsOk
      ? 'Clean.'
      : short
        ? `${titleTags.length} hashtags; #shorts and two topical ones at most.`
        : "Hashtags belong on the description's last line.",
  );
  add('title-symbols', 'No < or > in the title', 5, !/[<>]/.test(title), /[<>]/.test(title) ? 'YouTube rejects < and >.' : 'Clean.');
  if (kw) {
    const inTitle = mentions(title, kw);
    const inLead = mentions(desc.slice(0, 150), kw);
    add(
      'title-keyword',
      'Title points at the topic',
      5,
      inTitle || inLead,
      inTitle
        ? `Mentions "${kw}".`
        : inLead
          ? `The title is a curiosity title; the description's first lines name "${kw}".`
          : `Neither the title nor the description's first lines mention "${kw}".`,
    );
  }

  const descTags = hashtagsIn(desc);
  const body = desc
    .split('\n')
    .filter((l) => l.trim() && !HASHTAG_LINE.test(l.trim()))
    .join(' ');
  add(
    'desc-body',
    'Description says what the video is about',
    10,
    body.length >= 120,
    body.length >= 120
      ? `${body.length} characters of text.`
      : `Only ${body.length} characters of text besides hashtags — write two or three sentences in the words people search.`,
  );
  if (kw) {
    const lead = mentions(desc.slice(0, 150), kw);
    add(
      'desc-keyword',
      'Keyword in the first line',
      10,
      lead,
      lead ? `"${kw}" is in what search shows.` : `Search shows about the first 150 characters; "${kw}" isn't in them.`,
    );
  }
  const lastLine = desc.split('\n').pop()?.trim() ?? '';
  const ownLine = HASHTAG_LINE.test(lastLine);
  const inRange = descTags.length >= 2 && descTags.length <= 5;
  add(
    'desc-hashtags',
    '2–5 hashtags on the last line',
    10,
    inRange && ownLine && descTags.length <= 15,
    !descTags.length
      ? 'No hashtags.'
      : descTags.length > 15
        ? `${descTags.length} hashtags — over 15 and YouTube ignores all of them.`
        : !inRange
          ? `${descTags.length} hashtags — use 2 to 5; the first three show above the title.`
          : ownLine
            ? descTags.join(' ')
            : 'Hashtags are not on their own last line.',
  );
  if (!short) {
    const marks = desc.match(/^\d{1,2}:\d{2}(:\d{2})?\s+\S/gm) ?? [];
    const chaptersOk = marks.length >= 3 && /^0:00\s/m.test(desc);
    add(
      'desc-chapters',
      'Chapters from 0:00',
      5,
      chaptersOk,
      chaptersOk ? `${marks.length} chapters.` : 'List at least three chapters, the first at 0:00, so YouTube shows them.',
    );
    const count = desc
      .split('\n')
      .filter((l) => l.trim() && !HASHTAG_LINE.test(l.trim()) && !/^\d{1,2}:\d{2}(:\d{2})?\s/.test(l.trim()))
      .join(' ')
      .split(/\s+/)
      .filter(Boolean).length;
    const wordsOk = count >= 150 && count <= 300;
    add(
      'desc-words',
      '150 to 300 words',
      0,
      wordsOk,
      wordsOk ? `${count} words.` : `${count} words; a long-form description runs 150 to 300 (CR-88E).`,
    );
  } else {
    const hasShorts = descTags.some((t) => t.toLowerCase() === '#shorts');
    add('desc-shorts', '#shorts hashtag', 5, hasShorts, hasShorts ? 'Present.' : 'Add #shorts to the hashtag line.');
  }
  const channel = /subscribe|the mind files/i.test(desc);
  add(
    'desc-channel',
    'Channel line',
    5,
    channel,
    channel ? 'Names the channel or asks viewers to subscribe.' : 'Add the channel line that asks viewers to subscribe.',
  );
  const bytes = utf8Length(desc);
  const placeholder = /\{[A-Z_]+\}/.test(desc);
  add(
    'desc-limits',
    "Within YouTube's limits",
    10,
    bytes <= 5000 && !/[<>]/.test(desc) && !placeholder,
    bytes > 5000
      ? `${bytes} bytes; the limit is 5,000.`
      : placeholder
        ? 'A {PLACEHOLDER} is still in the text.'
        : /[<>]/.test(desc)
          ? 'YouTube rejects < and >.'
          : `${bytes} of 5,000 bytes.`,
  );
  add(
    'tags-count',
    'At least 5 tags',
    10,
    tags.length >= 5,
    tags.length >= 5
      ? `${tags.length} tags.`
      : !tags.length
        ? 'No tags at all.'
        : `Only ${tags.length} tag${tags.length === 1 ? '' : 's'}.`,
  );
  if (kw) {
    const tagged = tags.some((t) => t.toLowerCase().includes(kw.toLowerCase()) || mentions(t, kw));
    add('tags-keyword', 'Keyword tag', 5, tagged, tagged ? 'Tagged.' : `Add "${kw}" as a tag.`);
  }
  const branded = tags.some((t) => t.toLowerCase() === BRAND_TAG);
  add(
    'tags-brand',
    'Channel tag',
    5,
    branded,
    branded ? '"the mind files" is tagged.' : 'Add "the mind files" so your videos suggest each other.',
  );
  const length = tagsLength(tags);
  add('tags-limit', 'Tags within 500 characters', 5, length <= 500, `${length} of 500 characters.`);
  if (short && opts.deepDiveUrl) {
    const linked = desc.includes(opts.deepDiveUrl) || desc.includes(opts.deepDiveUrl.split('v=').pop() ?? '\0');
    add(
      'desc-deep-dive',
      'Links the related deep dive',
      5,
      linked,
      linked ? 'Linked.' : 'A deep dive on this topic is live — link it.',
    );
  }
  const total = checks.reduce((n, c) => n + c.weight, 0);
  const got = checks.reduce((n, c) => n + (c.ok ? c.weight : 0), 0);
  return { score: total ? Math.round((got / total) * 100) : 0, checks };
}

export interface SeoInput {
  title: string;
  keyword: string;
  mode: 'short' | 'long';
  concept?: string;
  hook?: string;
  chapters?: string;
  relatedShorts?: { title: string; url: string }[];
  ctaQuestion?: string;
  tagLine?: string;
  deepDive?: { title: string; url: string };
  extraTags?: string[];
}

/** A description, tags and pinned comment written from the video's own facts. */
export function generateSeo(input: SeoInput): { description: string; tags: string[]; pinnedComment: string } {
  const kw = input.keyword.trim().toLowerCase();
  const concept = input.concept?.trim();
  const about = concept ? lowerFirst(concept.replace(/[.]$/, '')) : kw;
  const lines = [`${input.title.replace(/[.?!]$/, '')}: the psychology of ${about}.`];
  const topicTag = topicHashtag(kw);
  const hashtags = [
    ...new Set(
      input.mode !== 'short'
        ? ['#psychology', topicTag, '#psychologyfacts']
        : ['#psychology', topicTag, '#psychologyfacts', '#shorts'],
    ),
  ];
  if (input.hook) lines.push(sentence(input.hook));
  if (input.mode === 'long' && input.chapters) lines.push('', input.chapters.trim());
  if (input.mode === 'long' && input.relatedShorts?.length) {
    lines.push('', 'Related Shorts:', ...input.relatedShorts.map((s) => `${s.title}: ${s.url}`));
  }
  const cta = input.ctaQuestion?.trim();
  if (cta || input.tagLine) {
    lines.push('');
    if (cta) lines.push(input.mode === 'long' ? `${cta.replace(/[?]?$/, '?')} Tell me in the comments.` : cta);
    if (input.tagLine && input.mode === 'short') lines.push(input.tagLine.trim());
  }
  lines.push('', input.mode !== 'short' ? LONG_CHANNEL_LINE : SHORT_CHANNEL_LINE);
  if (input.mode === 'short' && input.deepDive) {
    lines.push(`▶ Full breakdown: ${input.deepDive.title} → ${input.deepDive.url}`);
  }
  lines.push('', hashtags.join(' '));
  const titleWords = words(input.title).join(' ');
  const tags = fitTags([
    kw,
    ...(kw.split(' ').length <= 3 ? [`${kw} psychology`] : []),
    ...(titleWords.length <= 60 ? [titleWords] : []),
    ...(input.extraTags ?? []).map((t) => t.replace(/^#/, '').trim().toLowerCase()),
    ...BASE_TAGS,
  ]);
  return {
    description: lines.join('\n').replace(/\n{3,}/g, '\n\n').trim(),
    tags,
    pinnedComment: cta ?? `What's your take on ${kw}?`,
  };
}

/** Puts back what an audit flags, keeping the writer's own text. */
export function repairSeo(
  meta: SeoMeta,
  opts: { mode: 'short' | 'long'; keyword?: string; deepDive?: { title: string; url: string } },
): SeoMeta {
  const lines = meta.description.trim().split('\n');
  const last = lines[lines.length - 1]?.trim() ?? '';
  const body = (HASHTAG_LINE.test(last) ? lines.slice(0, -1) : lines).join('\n').trim();
  const existing = hashtagsIn(meta.description).map((t) => t.toLowerCase());
  const all = [
    ...new Set([
      '#psychology',
      ...(opts.keyword ? [topicHashtag(opts.keyword)] : []),
      ...existing,
      ...(opts.mode === 'short' ? ['#shorts'] : []),
    ]),
  ];
  const picked = all.filter((t, i, arr) => i < 4 || t === '#shorts' || arr.length <= 5).slice(0, 5);
  const out = [body];
  if (!/subscribe|the mind files/i.test(body)) out.push('', opts.mode !== 'short' ? LONG_CHANNEL_LINE : SHORT_CHANNEL_LINE);
  if (opts.mode === 'short' && opts.deepDive && !body.includes(opts.deepDive.url)) {
    out.push(`▶ Full breakdown: ${opts.deepDive.title} → ${opts.deepDive.url}`);
  }
  out.push('', picked.join(' '));
  return {
    title: meta.title,
    description: out.join('\n').replace(/\n{3,}/g, '\n\n').trim(),
    tags: fitTags([...(opts.keyword ? [opts.keyword, `${opts.keyword} psychology`] : []), ...meta.tags, ...BASE_TAGS]),
  };
}
