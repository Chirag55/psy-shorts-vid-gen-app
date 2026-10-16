import type { LongScript, WordTiming } from './types';
import { withRealChapters } from './longformPlan';
import { buildChapterTimestamps } from './timestamps';
import { isLegacy } from './topicBank';

/** YouTube's limit on the tags field, counting commas and quotes. */
export const TAGS_CHAR_LIMIT = 500;

/** Tags cleaned, de-duplicated and cut to fit the tags field. */
export function fitTags(tags: string[], limit: number = TAGS_CHAR_LIMIT): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  let used = 0;
  for (const raw of tags) {
    const tag = raw.replace(/[<>]/g, '').trim();
    const key = tag.toLowerCase();
    if (!tag || seen.has(key)) continue;
    const cost = tag.length + (/\s/.test(tag) ? 2 : 0) + (out.length ? 1 : 0);
    if (used + cost >= limit) break;
    out.push(tag);
    seen.add(key);
    used += cost;
  }
  return out;
}

/** How long the tags are as YouTube counts them. */
export function tagsLength(tags: string[]): number {
  return tags.reduce((n, t, i) => n + t.length + (/\s/.test(t) ? 2 : 0) + (i ? 1 : 0), 0);
}

/** Fills {CHAPTERS} and {RELATED_SHORTS}, dropping lines with placeholders left unfilled. */
export function fillSeoDescription(
  template: string,
  ctx: { chapters?: string; relatedShorts?: { title: string; url: string }[] } = {},
): string {
  const related = ctx.relatedShorts?.length
    ? ['Related Shorts:', ...ctx.relatedShorts.map((r) => `${r.title}: ${r.url}`)].join('\n')
    : '';
  return template
    .replace(/\{CHAPTERS\}/g, (ctx.chapters ?? '').trim())
    .replace(/\{RELATED_SHORTS\}/g, related)
    .split('\n')
    .filter((l) => !/\{[A-Z_]+\}/.test(l))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** Each chapter's voiced length, from its word alignment. */
export function alignmentDurations(alignment: Record<string, WordTiming[]>): Record<string, number> {
  return Object.fromEntries(
    Object.entries(alignment).map(([k, words]) => [k, words.length ? words[words.length - 1].end : 0]),
  );
}

/** Upload metadata straight from a legacy bank entry, or null when it has none. */
export function bankUploadMeta(
  entry: any,
  opts: {
    script?: LongScript;
    durations?: Record<string, number>;
    bank?: any[];
    shortUrl?: (videoId: string) => string;
  } = {},
): { description: string; tags: string[]; pinnedComment?: string } | null {
  if (!entry || !isLegacy(entry)) return null;
  if (entry.kind === 'long' && entry.description) {
    const chapters = opts.script ? buildChapterTimestamps(opts.script, opts.durations) : '';
    return {
      description: withRealChapters(entry.description, chapters),
      tags: fitTags(entry.tags ?? entry.seo?.tags ?? []),
      pinnedComment: entry.cta_question,
    };
  }
  const seo = entry.seo;
  if (!seo) return null;
  let ctx: { chapters?: string; relatedShorts?: { title: string; url: string }[] } = {};
  if (entry.kind === 'long') {
    const chapters = opts.script ? buildChapterTimestamps(opts.script, opts.durations) : '';
    const urlOf = opts.shortUrl ?? ((id: string) => `https://www.youtube.com/shorts/${id}`);
    const relatedShorts = (entry.related_shorts ?? [])
      .map((id: string) => opts.bank?.find((b) => b.id === id))
      .filter((b: any) => Boolean(b && b.status === 'published' && b.videoId))
      .map((b: any) => ({ title: b.title, url: urlOf(b.videoId) }));
    ctx = { chapters, relatedShorts };
  }
  return { description: fillSeoDescription(seo.description, ctx), tags: fitTags(seo.tags), pinnedComment: seo.pinned_comment };
}
