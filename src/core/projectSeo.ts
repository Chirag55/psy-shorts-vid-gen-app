import { bankUploadMeta } from './seoMeta';
import { tacticFromConcept } from './bankScript';
import { focusKeyword, generateSeo, repairSeo, type SeoInput } from './seo';
import { normalizeSeo } from './seoNormalizer';
import { buildChapterTimestamps } from './timestamps';
import { isLegacy, isV2 } from './topicBank';
import {
  SHORT_TAGS,
  bankShortDescription,
  sourceLineOf,
  v2LongDescription,
  v2ShortDescription,
  v2Tags,
  withTitleHashtags,
} from './seoLint';

export interface SeoContext {
  live?: { title: string; description: string; tags: string[] };
  project?: any;
  bankEntry?: any;
  bank?: any[];
  durations?: Record<string, number>;
  shortUrl?: (videoId: string) => string;
  mode: 'short' | 'long';
  deepDive?: { title: string; url: string };
  feederShorts?: any;
  nextVideo?: any;
  longform?: { title: string; url: string };
  researchKeywords?: string[];
}

/** What the SEO generator needs, from a project and its bank entry. */
export function seoInputForProject(project: any, opts: Partial<SeoContext> = {}): SeoInput {
  const entry = opts.bankEntry;
  const script = project.script;
  if (project.mode !== 'short') {
    const shortUrl = opts.shortUrl ?? ((id: string) => `https://www.youtube.com/shorts/${id}`);
    const related =
      entry?.kind === 'long' && isLegacy(entry)
        ? ((entry.related_shorts ?? []) as string[])
            .map((id) => opts.bank?.find((e) => e.id === id))
            .filter((e) => Boolean(e && e.status === 'published' && e.videoId))
            .map((e) => ({ title: e.title, url: shortUrl(e.videoId) }))
        : [];
    const keyword =
      script.title
        .replace(/^the psychology of\s+/i, '')
        .replace(/^\d+\s+/, '')
        .replace(/\s*\(.*\)\s*$/, '')
        .toLowerCase()
        .replace(/[^a-z0-9' ]/g, '')
        .trim() || (script.tactics?.[0] ?? script.title).toLowerCase();
    return {
      mode: 'long',
      title: script.title,
      keyword,
      hook: script.coldOpen,
      ctaQuestion: script.ctaQuestion,
      chapters: buildChapterTimestamps(script, opts.durations),
      relatedShorts: related,
      extraTags: [
        ...((script.tactics ?? []) as string[])
          .map((t) => tacticFromConcept(t).toLowerCase())
          .filter((t) => t.split(' ').length <= 4),
        ...script.tags,
      ],
    };
  }
  const concept = entry?.kind === 'short' && isLegacy(entry) ? entry.concept : undefined;
  const keyword = (script.tactic || (concept ? tacticFromConcept(concept) : '') || script.title).toLowerCase();
  return {
    mode: 'short',
    title: script.title,
    keyword,
    hook: script.hookLine,
    concept,
    ctaQuestion: script.ctaQuestion,
    tagLine: script.tagLine,
    deepDive: opts.deepDive,
    extraTags: script.hashtags,
  };
}

/** The title, description and tags to propose: the bank's, generated from the project, or the live ones repaired. */
export function proposeSeo(x: SeoContext) {
  const title = x.live?.title ?? x.project?.script.title ?? '';
  const v2 = x.bankEntry && isV2(x.bankEntry) ? x.bankEntry : undefined;
  let proposal: any;
  if (v2) {
    const description =
      v2.kind !== 'short'
        ? v2LongDescription(v2, {
            chapters: x.project?.mode === 'long' ? buildChapterTimestamps(x.project.script, x.durations) : undefined,
            shorts: x.feederShorts,
            next: x.nextVideo,
          } as any)
        : (bankShortDescription(v2, x.longform) ?? v2ShortDescription(v2, x.longform));
    const bankTags =
      v2.kind === 'short' && v2.title_final && v2.tags && v2.tags.length >= SHORT_TAGS.min && v2.tags.length <= SHORT_TAGS.max
        ? v2.tags
        : undefined;
    const tags = bankTags ?? v2Tags(v2, x.researchKeywords);
    const t =
      x.live?.title ?? (v2.kind !== 'short' ? v2.title : v2.title_final?.trim() || withTitleHashtags(v2.title, v2));
    proposal = { title: t, description, tags, keyword: (v2.effect ?? v2.title).toLowerCase(), source: 'bank' };
  } else {
    const legacySeo = x.bankEntry && isLegacy(x.bankEntry) ? x.bankEntry.seo : undefined;
    const meta = legacySeo
      ? bankUploadMeta(x.bankEntry, {
          script: x.project?.mode === 'long' ? x.project.script : undefined,
          durations: x.durations,
          bank: x.bank,
          shortUrl: x.shortUrl,
        } as any)
      : undefined;
    if (meta) {
      proposal = {
        title,
        description: meta.description,
        tags: meta.tags,
        pinnedComment: meta.pinnedComment,
        keyword: focusKeyword({ tags: meta.tags, text: `${title}\n${meta.description.slice(0, 150)}` }),
        source: 'bank',
      };
    } else if (x.project) {
      const input = seoInputForProject(x.project, x);
      const generated = generateSeo(input);
      const sourceLine = x.project.mode === 'short' ? x.project.script.sourceLine : undefined;
      proposal = {
        title,
        ...generated,
        ...(sourceLine
          ? { description: `${generated.description}\n\n${sourceLineOf({ source: '', source_line: sourceLine })}` }
          : {}),
        keyword: input.keyword,
        source: 'generated',
      };
    } else {
      const live = x.live ?? { title, description: '', tags: [] };
      const keyword = focusKeyword({ tags: live.tags, text: `${live.title}\n${live.description.slice(0, 150)}` });
      proposal = { ...repairSeo(live, { mode: x.mode, keyword, deepDive: x.deepDive }), keyword, source: 'repaired' };
    }
  }
  const entry = x.bankEntry && isV2(x.bankEntry) ? x.bankEntry : undefined;
  if (entry?.kind === 'short' && entry.title_final && entry.description_full && proposal.source === 'bank') {
    return { ...proposal, normalized: [] as string[] };
  }
  const result = normalizeSeo(proposal, {
    mode: x.mode,
    keyword: proposal.keyword,
    bankHashtags: entry?.hashtags,
    bankTags: entry?.tags,
    suggestedTags: x.researchKeywords,
  });
  return { ...proposal, ...result.meta, normalized: result.changes };
}
