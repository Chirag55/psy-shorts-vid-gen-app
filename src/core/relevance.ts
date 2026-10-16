import { DIVERSITY, KEYWORD_LABELS, KEYWORD_LOW_RESULTS, LOOP_RANK_FACTOR, OUTLIER_RATE_CAP } from './researchConfig';
import { isKept, layer2Reason, type Layer2Label } from './researchLayer2';
import { checkRelevance, type RelevanceResult } from './relevanceChecks';
import { flagsFor, isOutlier, recentMedianExcluding, scoreVideo, type ScoredVideo } from './outliers';
import { comparisonTokens, normalizeTitle, tokenSetSimilarity } from './titleSimilarity';

export interface ScannedVideo {
  videoId: string;
  channelId: string;
  channelTitle: string;
  title: string;
  publishedAt: string;
  durationSec: number;
  views: number;
  likes: number;
  comments: number;
  keywords: string[];
  [key: string]: unknown;
}

export interface ResearchRunInput {
  scanned: ScannedVideo[];
  scannedCount: number;
  excludeChannelIds: string[];
  lists: { entityBlocklist: string[]; nicheTerms: string[]; podcastTerms: string[] };
  filters: {
    windowDays: number;
    minViews: number;
    maxSubs: number | null;
    minSubRatio: number;
    minBreakout: number;
    maxDurationSec: number;
    minDurationSec: number;
  };
  layer2?: { status: 'run' | 'partial' | 'failed'; labels: Record<string, Layer2Label>; fromCache?: number; error?: string };
  channelSubs: Record<string, number | null>;
  channelRecent?: Record<string, { videoId: string; views: number }[]>;
  now: Date;
  seen: Set<string>;
  keywordFound: Record<string, number>;
  keywordPrevious?: Record<string, number>;
}

export type KeywordLabel = 'Strong' | 'Rephrase' | 'Keep' | 'Drop suggested' | 'Watch';

export interface KeywordStat {
  keyword: string;
  searched: true;
  found: number;
  outliers: number;
  hitRate: number;
  junkRate: number;
  topJunk?: string;
  label: KeywordLabel;
  lowResults?: true;
}

export type OutlierRow = ScannedVideo &
  ScoredVideo & {
    titleClean: string;
    hashtags: string[];
    relevance: RelevanceResult;
    flags: string[];
    isNew: boolean;
    duplicates?: number;
    moreFromChannel?: number;
  };

/** How a search keyword is doing: strong, worth rephrasing, keep, watch, or drop. */
function keywordLabel(hitRate: number, junkRate: number, previous?: number): KeywordLabel {
  if (hitRate >= KEYWORD_LABELS.strong) return 'Strong';
  if (junkRate > KEYWORD_LABELS.rephraseJunkRate) return 'Rephrase';
  if (hitRate >= KEYWORD_LABELS.keep) return 'Keep';
  return previous !== undefined && previous < KEYWORD_LABELS.keep ? 'Drop suggested' : 'Watch';
}

/** Layer 1 checks, then length, then the layer 2 label. */
function relevanceOf(v: ScannedVideo, titleClean: string, hashtags: string[], run: ResearchRunInput): RelevanceResult {
  const r = checkRelevance({ titleClean, hashtags }, v.channelTitle, run.lists);
  if (r.status === 'drop') return r;
  if (v.durationSec > run.filters.maxDurationSec) {
    return {
      status: 'drop',
      reason: `Long Short (${Math.round(v.durationSec)} s, over ${run.filters.maxDurationSec} s)`,
      group: 'Long Short',
    };
  }
  const l2 = run.layer2;
  if (l2 && (l2.status === 'run' || l2.status === 'partial') && v.views >= run.filters.minViews) {
    const label = l2.labels[v.videoId];
    if (label && !isKept(label)) return { status: 'drop', reason: layer2Reason(label), group: label.label };
    if (!label && l2.status === 'run') return { status: 'drop', reason: 'Layer 2: no label', group: 'Layer 2' };
  }
  return r;
}

/** Scores, filters and de-duplicates one research run's Shorts. */
export function evaluateRun(run: ResearchRunInput) {
  const excluded = new Set(run.excludeChannelIds.filter(Boolean));
  const items = run.scanned
    .filter((v) => !excluded.has(v.channelId))
    .map((v) => {
      const { titleClean, hashtags } = normalizeTitle(v.title);
      const relevance = relevanceOf(v, titleClean, hashtags, run);
      const subs = run.channelSubs[v.channelId];
      const recent = run.channelRecent?.[v.channelId];
      const median = recent ? recentMedianExcluding(recent, v.videoId) : null;
      const channel = subs !== undefined ? { channelId: v.channelId, title: v.channelTitle, subs, uploadsPlaylistId: '' } : undefined;
      return {
        video: v,
        titleClean,
        hashtags,
        relevance,
        metrics: scoreVideo(v, channel, run.now, median),
        fewShorts: Boolean(recent) && median === null,
      };
    });
  type Item = (typeof items)[number];
  const passed = items.filter((i) => i.relevance.status !== 'drop');
  const layer1Drop = (i: Item) =>
    i.relevance.status === 'drop' && i.relevance.group !== 'Long Short' && !i.relevance.reason.startsWith('Layer 2');
  const passedLayer1 = items.filter((i) => !layer1Drop(i)).length;
  const longShorts = items.filter((i) => i.relevance.status === 'drop' && i.relevance.group === 'Long Short').length;
  const qualifies = (i: Item, ratio: number) =>
    run.channelSubs[i.video.channelId] !== undefined && isOutlier(i.video, i.metrics, run.filters, run.now, ratio);
  let minSubRatio = run.filters.minSubRatio;
  let qualified = passed.filter((i) => qualifies(i, minSubRatio));
  const scanned = Math.max(1, run.scannedCount);
  let raised = false;
  while (
    run.scannedCount >= OUTLIER_RATE_CAP.minScanned &&
    qualified.length / scanned > OUTLIER_RATE_CAP.maxRate &&
    minSubRatio < OUTLIER_RATE_CAP.maxRatio
  ) {
    minSubRatio += OUTLIER_RATE_CAP.ratioStep;
    qualified = passed.filter((i) => qualifies(i, minSubRatio));
    raised = true;
  }
  const notes: string[] = [];
  if (raised) {
    notes.push(
      `More than ${OUTLIER_RATE_CAP.maxRate * 100}% of scanned Shorts qualified, so views ÷ subscribers was raised from ${run.filters.minSubRatio}× to ${minSubRatio}×.`,
    );
  }
  const ranked: OutlierRow[] = qualified
    .map((i) => {
      const flags = flagsFor(i.video, i.metrics, run.lists.nicheTerms, run.filters.minDurationSec, i.fewShorts);
      if (i.relevance.status === 'flag' && !flags.includes(i.relevance.reason)) flags.push(i.relevance.reason);
      const rankScore = flags.includes('Loop-inflated') ? i.metrics.rankScore * LOOP_RANK_FACTOR : i.metrics.rankScore;
      return {
        ...i.video,
        ...i.metrics,
        rankScore,
        titleClean: i.titleClean,
        hashtags: i.hashtags,
        relevance: i.relevance,
        flags,
        isNew: !run.seen.has(i.video.videoId),
      };
    })
    .sort((a, b) => b.rankScore - a.rankScore);
  const shown: OutlierRow[] = [];
  const shownTokens: Set<string>[] = [];
  const perChannel = new Map<string, OutlierRow[]>();
  for (const o of ranked) {
    const tokens = comparisonTokens(o.titleClean ?? o.title);
    const dup = shownTokens.findIndex((t) => tokenSetSimilarity(t, tokens) >= DIVERSITY.duplicateSimilarity);
    if (dup >= 0) {
      shown[dup].duplicates = (shown[dup].duplicates ?? 0) + 1;
      continue;
    }
    const list = perChannel.get(o.channelId) ?? [];
    if (list.length >= DIVERSITY.perChannel) {
      const last = list[list.length - 1];
      last.moreFromChannel = (last.moreFromChannel ?? 0) + 1;
      continue;
    }
    list.push(o);
    perChannel.set(o.channelId, list);
    shown.push(o);
    shownTokens.push(tokens);
  }
  const filteredOut = items
    .filter((i) => i.relevance.status === 'drop' && i.video.views >= run.filters.minViews)
    .sort((a, b) => b.video.views - a.video.views)
    .slice(0, 100)
    .map((i) => ({
      videoId: i.video.videoId,
      title: i.titleClean || i.video.title,
      channelTitle: i.video.channelTitle,
      views: i.video.views,
      reason: i.relevance.status === 'drop' ? i.relevance.reason : '',
      group: i.relevance.status === 'drop' ? i.relevance.group : '',
    }));
  const keywordStats: KeywordStat[] = Object.entries(run.keywordFound).map(([keyword, found]) => {
    const all = items.filter((i) => i.video.keywords.includes(keyword));
    const junk = all.filter((i) => i.relevance.status === 'drop');
    const groups = new Map<string, number>();
    for (const j of junk) {
      if (j.relevance.status === 'drop') groups.set(j.relevance.group, (groups.get(j.relevance.group) ?? 0) + 1);
    }
    const topJunk = [...groups.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
    const outliers = qualified.filter((i) => i.video.keywords.includes(keyword)).length;
    const hitRate = found ? outliers / found : 0;
    const junkRate = all.length ? junk.length / all.length : 0;
    const stat = {
      keyword,
      searched: true as const,
      found,
      outliers,
      hitRate,
      junkRate,
      ...(topJunk ? { topJunk } : {}),
    } as KeywordStat;
    stat.label = keywordLabel(hitRate, junkRate, run.keywordPrevious?.[keyword]);
    if (found < KEYWORD_LOW_RESULTS) stat.lowResults = true;
    return stat;
  });
  const l2 = run.layer2;
  const quality = {
    scanned: run.scannedCount,
    passedLayer1,
    passedLayer2: passed.length,
    finalOutliers: qualified.length,
    shown: shown.length,
    outlierRate: qualified.length / scanned,
    minSubRatio,
    raised,
    longShorts,
    layer2: l2
      ? {
          status: l2.status,
          labelled: Object.keys(l2.labels).length,
          kept: Object.values(l2.labels).filter(isKept).length,
          ...(l2.fromCache ? { fromCache: l2.fromCache } : {}),
          ...(l2.error ? { error: l2.error } : {}),
        }
      : { status: 'not run' as const, labelled: 0, kept: 0 },
    breakoutChannels: run.channelRecent ? Object.keys(run.channelRecent).length : 0,
  };
  if (l2?.status === 'failed') {
    notes.push(`Layer 2 (LLM) failed, so only layer 1 filtered this run: ${l2.error ?? 'unknown error'}.`);
  }
  if (l2?.status === 'partial') {
    notes.push(
      `Layer 2 (LLM) stopped part-way (${l2.error ?? 'unknown error'}); Shorts it didn't reach were judged by layer 1 only.`,
    );
  }
  return { outliers: shown, filteredOut, keywordStats, quality, notes, qualifiedIds: qualified.map((i) => i.video.videoId) };
}

export { keywordLabel, relevanceOf };
