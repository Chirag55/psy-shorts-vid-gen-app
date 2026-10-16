import { evaluateRun } from './relevance';
import { previousRate, type KeywordHistory } from './researchHistory';
import { cacheKey } from './researchLayer2';
import { normalizeTitle } from './titleSimilarity';

export interface ReplayContext {
  filters: any;
  lists: any;
  excludeChannelIds: string[];
  layer2Cache?: Record<string, { key: string; label: any; confidence: number }>;
  keywordHistory?: KeywordHistory;
  seenBefore?: Set<string>;
  appVersion?: string;
  configHash?: string;
}

/** Re-scores a saved run with today's rules, offline, for no quota. */
export function replayRun(run: any, ctx: ReplayContext): any {
  const scanned =
    run.scanned ??
    run.outliers.map((o: any) => ({
      videoId: o.videoId,
      channelId: o.channelId,
      channelTitle: o.channelTitle,
      title: o.title,
      publishedAt: o.publishedAt,
      durationSec: o.durationSec,
      views: o.views,
      likes: o.likes,
      comments: o.comments,
      thumbnailUrl: o.thumbnailUrl,
      keywords: o.keywords,
    }));
  const channelSubs = run.channelSubs ?? Object.fromEntries(run.outliers.map((o: any) => [o.channelId, o.subs]));
  const notes: string[] = [];
  let layer2: any;
  if (run.layer2Labels) {
    layer2 = { status: run.quality?.layer2?.status ?? 'run', labels: run.layer2Labels };
  } else {
    const labels: Record<string, { label: any; confidence: number }> = {};
    for (const v of scanned) {
      const cached = ctx.layer2Cache?.[v.videoId];
      if (cached && cached.key === cacheKey(normalizeTitle(v.title) as any)) {
        labels[v.videoId] = { label: cached.label, confidence: cached.confidence };
      }
    }
    const fromCache = Object.keys(labels).length;
    layer2 = { status: fromCache ? 'partial' : 'not run', labels, fromCache };
    notes.push(
      fromCache
        ? `That run predates layer 2: ${fromCache} of its Shorts had cached labels; the rest were judged by layer 1 only.`
        : 'That run predates layer 2 and no labels are cached for it, so layer 1 alone filtered it.',
    );
  }
  const searched: string[] = run.keywordStats.filter((k: any) => k.searched).map((k: any) => k.keyword);
  const keywordPrevious = ctx.keywordHistory
    ? Object.fromEntries(
        searched.map((kw) => [
          kw,
          previousRate(ctx.keywordHistory as KeywordHistory, kw, run.startedAt, [run.id, run.replayOf ?? '']),
        ]),
      )
    : undefined;
  const result: any = evaluateRun({
    scanned,
    scannedCount: run.videosSeen,
    channelSubs,
    channelRecent: run.channelRecent,
    filters: ctx.filters,
    lists: ctx.lists,
    excludeChannelIds: ctx.excludeChannelIds,
    seen: ctx.seenBefore ?? new Set(run.outliers.filter((o: any) => !o.isNew).map((o: any) => o.videoId)),
    now: new Date(run.finishedAt ?? run.startedAt),
    keywordFound: Object.fromEntries(run.keywordStats.filter((k: any) => k.searched).map((k: any) => [k.keyword, k.found])),
    keywordPrevious,
    layer2,
  } as any);
  const thumbs = new Map<string, string>(run.outliers.map((o: any) => [o.videoId, o.thumbnailUrl]));
  for (const o of result.outliers) o.thumbnailUrl = o.thumbnailUrl || thumbs.get(o.videoId) || '';
  return {
    ...run,
    id: `${run.id}-rescored-${Date.now()}`,
    replayOf: run.id,
    unitsUsed: 0,
    outliers: result.outliers,
    filteredOut: result.filteredOut,
    keywordStats: run.keywordStats.map((k: any) => {
      const fresh = result.keywordStats.find((x: any) => x.keyword === k.keyword);
      if (!fresh) return k;
      return { ...fresh, ...(k.error ? { error: k.error } : {}), ...(k.error ? { lowResults: undefined } : {}) };
    }),
    quality: result.quality,
    notes: [
      `Re-scored offline from the run of ${run.startedAt.slice(0, 10)} (0 quota units).${
        run.scanned
          ? ''
          : ` That run stored only its ${run.outliers.length} outliers, so those were re-scored; junk rates are among them, not among everything found.`
      }`,
      ...notes,
      ...result.notes,
    ],
    appVersion: ctx.appVersion ?? run.appVersion,
    configHash: ctx.configHash ?? run.configHash,
    layer2Labels: layer2.labels,
    qualifiedIds: result.qualifiedIds,
    filters: { ...ctx.filters, passes: run.filters.passes ?? ['A'] },
    scanned,
    channelSubs,
  };
}

/** Before and after, in four lines. */
export function replaySummary(before: any, after: any): string {
  const beforeCount = before.quality?.finalOutliers ?? before.outliers.length;
  const afterCount = after.quality?.finalOutliers ?? after.outliers.length;
  const pct = (n: number) => `${((n / Math.max(1, before.videosSeen)) * 100).toFixed(1)}%`;
  const top = after.outliers.slice(0, 25);
  const good = top.filter((o: any) => o.relevance?.status !== 'drop' && o.durationSec <= 60).length;
  return [
    `Before: ${beforeCount} outliers (${pct(beforeCount)} of ${before.videosSeen} scanned).`,
    `After: ${afterCount} outliers (${pct(afterCount)}), ${after.outliers.length} shown after the per-channel and duplicate limits.`,
    `Top 25 after: ${top.length} rows, ${good} relevant and 60 s or less; ${after.filteredOut?.length ?? 0} filtered out with a reason.`,
    `Layer 2: ${after.quality?.layer2?.status ?? 'not run'}; breakout: ${
      after.quality?.breakoutChannels ? `${after.quality.breakoutChannels} channels` : 'not available'
    }.`,
  ].join('\n');
}
