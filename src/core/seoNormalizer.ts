import { fitTags } from './seoMeta';
import { BASE_TAGS, BRAND_TAG, LONG_CHANNEL_LINE, SHORT_CHANNEL_LINE } from './seo';

/**
 * Puts a description and tags into the channel's house shape: the keyword in
 * the first lines, the channel line, then one line of hashtags, within
 * YouTube's limits. Records what it changed.
 */

export const CHANNEL_LINES = { short: SHORT_CHANNEL_LINE, long: LONG_CHANNEL_LINE };
export const DESCRIPTION_BYTE_LIMIT = 5000;
export const HASHTAGS = { min: 2, max: 5 };
export const MIN_TAGS = 5;
const SEARCH_PREVIEW_CHARS = 150;
const DEFAULT_HASHTAGS = ['#psychology', '#mindfiles'];
const HASHTAG_LINE = /^(#[\p{L}\p{N}_]+\s*)+$/u;
const FULL_FILE = '▶ Full file:';

export interface NormalizeOptions {
  mode: 'short' | 'long';
  keyword?: string;
  channelLine?: string;
  bankHashtags?: string[];
  suggestedHashtags?: string[];
  bankTags?: string[];
  suggestedTags?: string[];
}

const utf8Length = (s: string) => new TextEncoder().encode(s).length;
const capitalise = (s: string) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);

function asHashtag(t: string): string {
  const s = t
    .replace(/^#+/, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}_]/gu, '');
  return s ? `#${s}` : '';
}

function unique(list: string[]): string[] {
  const seen = new Set<string>();
  return list.filter((t) => {
    const k = t.toLowerCase();
    if (!t || seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

function mentionsKeyword(text: string, keyword: string): boolean {
  const norm = (s: string) =>
    s
      .toLowerCase()
      .replace(/[-–—]/g, ' ')
      .replace(/\s+/g, ' ');
  return norm(text).includes(norm(keyword));
}

/** The hashtags for the last line: the description's own first, #shorts third on a Short. */
function hashtagLine(found: string[], opts: NormalizeOptions): string[] {
  const tags = unique(
    [...found, ...(opts.bankHashtags ?? []), ...DEFAULT_HASHTAGS, ...(opts.suggestedHashtags ?? [])].map(asHashtag),
  ).filter((t) => t !== '#shorts');
  if (opts.mode !== 'long') {
    const out = tags.slice(0, HASHTAGS.max - 1);
    out.splice(Math.min(2, out.length), 0, '#shorts');
    return out;
  }
  return tags.slice(0, HASHTAGS.max);
}

function normalizeDescription(text: string, opts: NormalizeOptions, changes: string[]): string {
  const channel = opts.channelLine ?? CHANNEL_LINES[opts.mode];
  const body: string[] = [];
  const found: string[] = [];
  for (const line of text.replace(/\r/g, '').split('\n')) {
    if (HASHTAG_LINE.test(line.trim())) found.push(...(line.trim().match(/#[\p{L}\p{N}_]+/gu) ?? []));
    else body.push(line.trimEnd());
  }
  const channelAt = body.findIndex((l) => l.trim() === channel);
  if (channelAt >= 0) body.splice(channelAt, 1);
  const cleaned = body.join('\n').replace(/\n{3,}/g, '\n\n').trim();
  let main = cleaned;
  if (opts.keyword && cleaned && !mentionsKeyword(cleaned.slice(0, SEARCH_PREVIEW_CHARS), opts.keyword)) {
    const lines = cleaned.split('\n');
    lines.splice(lines[0]?.startsWith(FULL_FILE) ? 2 : 1, 0, `${capitalise(opts.keyword)}, explained with the research behind it.`);
    main = lines.join('\n');
    changes.push('keyword line');
  }
  const hasChannel = channelAt >= 0 || /\bsubscribe\b/i.test(main);
  if (!hasChannel) changes.push('channel line');
  const hashtags = hashtagLine(found, opts);
  const had = new Set(found.map((t) => t.toLowerCase()));
  const added = hashtags.filter((t) => !had.has(t));
  if (added.length) changes.push(`hashtags ${added.join(' ')}`);
  const channelPart = (!hasChannel || channelAt >= 0 ? [channel] : []).join('\n');
  const tagLine = hashtags.join(' ');
  const assemble = (b: string) => [b, channelPart, tagLine].filter(Boolean).join('\n\n');
  let out = assemble(main);
  if (utf8Length(out) > DESCRIPTION_BYTE_LIMIT) {
    const lines = main.split('\n');
    while (lines.length > 1 && utf8Length(assemble(lines.join('\n'))) > DESCRIPTION_BYTE_LIMIT) lines.pop();
    let t = lines.join('\n').trimEnd();
    while (t.length && utf8Length(assemble(t)) > DESCRIPTION_BYTE_LIMIT) t = t.slice(0, -1);
    out = assemble(t.trimEnd());
    changes.push('trimmed to 5,000 bytes');
  }
  return out;
}

function normalizeTags(tags: string[], opts: NormalizeOptions, changes: string[]): string[] {
  const clean = (t: string) =>
    t
      .replace(/^#/, '')
      .replace(/[<>]/g, '')
      .trim();
  const keyword = opts.keyword ? clean(opts.keyword).toLowerCase() : '';
  const own = tags.map(clean);
  let out = unique([...[keyword, BRAND_TAG].filter(Boolean), ...own, ...(opts.bankTags ?? []).map(clean)]);
  const extras = [...(opts.suggestedTags ?? []).map(clean), ...(keyword ? [`${keyword} psychology`] : []), ...BASE_TAGS];
  for (const t of extras) {
    if (out.length >= MIN_TAGS) break;
    out = unique([...out, t]);
  }
  if (opts.mode === 'short') out = out.slice(0, 12);
  out = fitTags(out);
  const had = new Set(own.map((t) => t.toLowerCase()));
  const added = out.filter((t) => !had.has(t.toLowerCase()));
  if (added.length) {
    changes.push(`tags ${added.slice(0, 3).join(', ')}${added.length > 3 ? ` +${added.length - 3}` : ''}`);
  }
  return out;
}

export function normalizeSeo(
  meta: { title: string; description: string; tags: string[] },
  opts: NormalizeOptions,
): { meta: { title: string; description: string; tags: string[] }; changes: string[] } {
  const changes: string[] = [];
  const description = normalizeDescription(meta.description, opts, changes);
  const tags = normalizeTags(meta.tags, opts, changes);
  return { meta: { title: meta.title, description, tags }, changes };
}

/** A metadata update put into the house shape; a #shorts description marks it a Short. */
export function normalizeUpdate<T extends { description: string; tags: string[] }>(u: T): { update: T; changes: string[] } {
  const opts: NormalizeOptions = { mode: /#shorts\b/i.test(u.description) ? 'short' : 'long', keyword: u.tags[0] };
  const changes: string[] = [];
  const description = normalizeDescription(u.description, opts, changes);
  const tags = normalizeTags(u.tags, opts, changes);
  return { update: { ...u, description, tags }, changes };
}
