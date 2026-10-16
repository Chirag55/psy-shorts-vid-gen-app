import { ANDROID_KEY_HEADERS } from '@/core/androidIdentity';
import { BREAKOUT, QUOTA_COST, SHORTS_MAX_SEC } from '@/core/researchConfig';
import { classifyResearchFailure, type ResearchFailureKind } from '@/core/researchFailure';
import { evaluateRun, relevanceOf, type KeywordStat, type ScannedVideo } from '@/core/relevance';
import { runLayer2, type Layer2Cache, type Layer2Item, type Layer2Label } from '@/core/researchLayer2';
import { normalizeTitle } from '@/core/titleSimilarity';
import { recentShorts } from '@/core/outliers';
import { parseIso8601Duration, pickThumbnail } from '@/core/youtubeLibrary';

const API = 'https://www.googleapis.com/youtube/v3';

/** A research failure the whole run cannot recover from. */
export class ResearchError extends Error {
  kind: ResearchFailureKind;
  constructor(message: string, kind: ResearchFailureKind) {
    super(message);
    this.kind = kind;
  }
}

/** Ends the run early but keeps what was gathered. */
class RunStop extends Error {
  status: string;
  constructor(status: string, message: string) {
    super(message);
    this.status = status;
  }
}

export interface ResearchQuota {
  canSpend: (units: number) => boolean;
  charge: (units: number) => void;
  refund: (units: number) => void;
}

interface CallContext {
  apiKey: string;
  quota: ResearchQuota;
  signal?: AbortSignal;
  sleep?: (ms: number) => Promise<void>;
}

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
const num = (v: unknown) => (v && Number.isFinite(Number(v)) ? Number(v) : 0);

/** One API call: charges quota, retries busy errors with backoff, stops on cancel or cap. */
async function call(path: string, params: Record<string, string>, cost: number, ctx: CallContext): Promise<any> {
  const sleep = ctx.sleep ?? defaultSleep;
  let attempt = 0;
  for (;;) {
    if (ctx.signal?.aborted) throw new RunStop('cancelled', 'Stopped by you.');
    if (!ctx.quota.canSpend(cost)) {
      throw new RunStop('partial_quota', "Today's research cap was reached, so the run stopped early.");
    }
    ctx.quota.charge(cost);
    let res: Response;
    try {
      res = await fetch(`${API}/${path}?${new URLSearchParams({ ...params, key: ctx.apiKey }).toString()}`, {
        headers: ANDROID_KEY_HEADERS,
        signal: ctx.signal,
      });
    } catch {
      ctx.quota.refund(cost);
      if (ctx.signal?.aborted) throw new RunStop('cancelled', 'Stopped by you.');
      throw new ResearchError('No connection to YouTube. Check the internet and try again.', 'offline');
    }
    if (res.ok) return await res.json();
    const failure = classifyResearchFailure(res.status, await res.text().catch(() => ''));
    if (failure.kind === 'quota') throw new RunStop('partial_quota', failure.message);
    if (failure.kind === 'retry' && attempt < 3) {
      await sleep(1000 * 2 ** attempt);
      attempt++;
      continue;
    }
    throw new ResearchError(failure.message, failure.kind);
  }
}

/** Runs `fn` over items with at most `concurrency` at once; the first error stops new work and is thrown. */
async function pool<T>(items: T[], concurrency: number, fn: (item: T, index: number) => Promise<void>): Promise<void> {
  let next = 0;
  let error: unknown = null;
  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, async () => {
      while (next < items.length && error === null) {
        const i = next++;
        try {
          await fn(items[i], i);
        } catch (e) {
          if (error === null) error = e;
        }
      }
    }),
  );
  if (error !== null) throw error;
}

function lowResultNotes(stats: (KeywordStat & { error?: string })[]): string[] {
  const low = stats.filter((s) => s.lowResults && !s.error);
  if (!low.length) return [];
  return [
    `Fewer than 50 results with no error: ${low.map((s) => `"${s.keyword}" (${s.found})`).join(', ')}. Consider rephrasing.`,
  ];
}

/** Checks an API key with a 1-unit call. */
export async function testYouTubeKey(apiKey: string): Promise<{ ok: boolean; message?: string }> {
  let res: Response;
  try {
    res = await fetch(`${API}/videos?${new URLSearchParams({ part: 'id', id: 'jNQXAC9IVRw', key: apiKey }).toString()}`, {
      headers: ANDROID_KEY_HEADERS,
    });
  } catch {
    return { ok: false, message: 'No connection to YouTube. Check the internet and try again.' };
  }
  if (res.ok) return { ok: true };
  const result: { ok: boolean; message?: string } = { ok: false };
  result.message = classifyResearchFailure(res.status, await res.text().catch(() => '')).message;
  return result;
}

interface ResearchVideo {
  videoId: string;
  channelId: string;
  channelTitle: string;
  title: string;
  publishedAt: string;
  durationSec: number;
  views: number;
  likes: number;
  comments: number;
  thumbnailUrl: string;
}

interface ChannelInfo {
  channelId: string;
  title: string;
  subs: number | null;
  country?: string;
  uploadsPlaylistId: string;
}

export interface ResearchOptions {
  apiKey: string;
  keywords: string[];
  profile: { id: string; name: string };
  filters: {
    windowDays: number;
    minViews: number;
    maxSubs: number | null;
    minSubRatio: number;
    minBreakout: number;
    maxDurationSec: number;
    minDurationSec: number;
    regionCode?: string;
  };
  lists: { entityBlocklist: string[]; nicheTerms: string[]; podcastTerms: string[] };
  excludeChannelIds: string[];
  seenVideoIds: Set<string>;
  keywordPrevious?: Record<string, number>;
  quota: ResearchQuota;
  signal?: AbortSignal;
  sleep?: (ms: number) => Promise<void>;
  now?: () => Date;
  onProgress?: (stage: string, done: number, total: number) => void;
  classify?: (batch: Layer2Item[]) => Promise<Map<string, Layer2Label>>;
  layer2Cache?: Layer2Cache;
  onLayer2Labels?: (fresh: Layer2Cache) => void;
  channelCache?: Record<string, { recent: { videoId: string; views: number }[]; at: string }>;
  onChannelRecent?: (updates: Record<string, { recent: { videoId: string; views: number }[]; at: string }>) => void;
  appVersion?: string;
  configHash?: string;
}

/** Searches the keywords, reads videos and channels, labels with layer 2, reads breakout, then scores. */
export async function runOutlierResearch(opts: ResearchOptions, runId: string) {
  const now = opts.now ?? (() => new Date());
  const startedAt = now().toISOString();
  const notes: string[] = [];
  let unitsUsed = 0;
  const quota: ResearchQuota = {
    canSpend: opts.quota.canSpend,
    charge(units) {
      unitsUsed += units;
      opts.quota.charge(units);
    },
    refund(units) {
      unitsUsed -= units;
      opts.quota.refund(units);
    },
  };
  const ctx: CallContext = { apiKey: opts.apiKey, quota, signal: opts.signal, sleep: opts.sleep };
  const hits = new Map<string, Set<string>>();
  const keywordStats: (KeywordStat | { keyword: string; searched: boolean; found: number; outliers: number; error?: string })[] =
    opts.keywords.map((keyword) => ({ keyword, searched: false, found: 0, outliers: 0 }));
  const videos = new Map<string, ResearchVideo>();
  const channels = new Map<string, ChannelInfo>();
  const channelRecent: Record<string, { videoId: string; views: number }[]> = {};
  let status = 'complete';
  let keywordsSearched = 0;
  let layer2: { status: any; labels: Record<string, Layer2Label>; fromCache?: number; error?: string } = {
    status: 'off',
    labels: {},
  };
  const excluded = new Set(opts.excludeChannelIds.filter(Boolean));
  const relevance = (v: ResearchVideo) => {
    const { titleClean, hashtags } = normalizeTitle(v.title);
    return relevanceOf({ ...v, keywords: [] } as unknown as ScannedVideo, titleClean, hashtags, {
      lists: opts.lists,
      filters: opts.filters,
      layer2: layer2 as any,
    } as any);
  };
  try {
    const publishedAfter = new Date(now().getTime() - opts.filters.windowDays * 86400000)
      .toISOString()
      .replace(/\.\d+Z$/, 'Z');
    let searched = 0;
    await pool(opts.keywords, 4, async (keyword, i) => {
      try {
        opts.onProgress?.(`Searching "${keyword}"`, searched, opts.keywords.length);
        const data = await call(
          'search',
          {
            part: 'snippet',
            type: 'video',
            q: keyword,
            order: 'viewCount',
            publishedAfter,
            videoDuration: 'short',
            maxResults: '50',
            relevanceLanguage: 'en',
            safeSearch: 'none',
            ...(opts.filters.regionCode ? { regionCode: opts.filters.regionCode } : {}),
          },
          QUOTA_COST.search,
          ctx,
        );
        const ids: string[] = (data.items ?? []).map((it: any) => it.id?.videoId).filter(Boolean);
        for (const id of ids) {
          if (!hits.has(id)) hits.set(id, new Set());
          hits.get(id)!.add(keyword);
        }
        keywordStats[i].searched = true;
        keywordStats[i].found = ids.length;
        keywordsSearched++;
      } catch (e) {
        if (e instanceof RunStop) throw e;
        if (e instanceof ResearchError && ['key', 'notEnabled', 'restricted', 'offline'].includes(e.kind)) throw e;
        (keywordStats[i] as any).error = e instanceof Error ? e.message : String(e);
        notes.push(`Search "${keyword}" failed: ${(keywordStats[i] as any).error}`);
      } finally {
        searched++;
      }
    });

    const ids = [...hits.keys()];
    for (let i = 0; i < ids.length; i += 50) {
      opts.onProgress?.('Reading video stats', i, ids.length);
      const data = await call(
        'videos',
        { part: 'snippet,contentDetails,statistics', id: ids.slice(i, i + 50).join(','), maxResults: '50' },
        QUOTA_COST.videos,
        ctx,
      );
      for (const it of data.items ?? []) {
        const durationSec = parseIso8601Duration(it.contentDetails?.duration ?? '');
        if (durationSec <= 0 || durationSec > SHORTS_MAX_SEC) continue;
        videos.set(it.id, {
          videoId: it.id,
          channelId: it.snippet?.channelId ?? '',
          channelTitle: it.snippet?.channelTitle ?? '',
          title: it.snippet?.title ?? '',
          publishedAt: it.snippet?.publishedAt ?? '',
          durationSec,
          views: num(it.statistics?.viewCount),
          likes: num(it.statistics?.likeCount),
          comments: num(it.statistics?.commentCount),
          thumbnailUrl: pickThumbnail(it.snippet?.thumbnails),
        });
      }
    }

    const candidates = [...videos.values()].filter(
      (v) => v.views >= opts.filters.minViews && !excluded.has(v.channelId) && relevance(v).status !== 'drop',
    );
    if (opts.classify && candidates.length) {
      opts.onProgress?.('Checking relevance (layer 2)', 0, candidates.length);
      const items = candidates.map((v) => ({ videoId: v.videoId, ...normalizeTitle(v.title) }));
      const res = await runLayer2(items, opts.classify, opts.layer2Cache ?? {}, now(), (done, total) =>
        opts.onProgress?.('Checking relevance (layer 2)', done, total),
      );
      const fromCache = items.filter((it) => !res.fresh[it.videoId] && res.labels[it.videoId]).length;
      layer2 = { status: res.status, labels: res.labels, fromCache, ...(res.error ? { error: res.error } : {}) };
      if (Object.keys(res.fresh).length) opts.onLayer2Labels?.(res.fresh);
    } else if (opts.classify) {
      layer2 = { status: 'run', labels: {} };
    }

    const channelIds = [
      ...new Set(
        [...videos.values()]
          .filter((v) => v.views >= opts.filters.minViews && !excluded.has(v.channelId))
          .filter((v) => relevance(v).status !== 'drop')
          .map((v) => v.channelId),
      ),
    ].filter(Boolean);
    for (let j = 0; j < channelIds.length; j += 50) {
      opts.onProgress?.('Reading channel sizes', j, channelIds.length);
      const data = await call(
        'channels',
        { part: 'snippet,statistics,contentDetails', id: channelIds.slice(j, j + 50).join(','), maxResults: '50' },
        QUOTA_COST.channels,
        ctx,
      );
      for (const c of data.items ?? []) {
        channels.set(c.id, {
          channelId: c.id,
          title: c.snippet?.title ?? '',
          subs: c.statistics?.hiddenSubscriberCount ? null : num(c.statistics?.subscriberCount),
          country: c.snippet?.country,
          uploadsPlaylistId: c.contentDetails?.relatedPlaylists?.uploads ?? `UU${c.id.slice(2)}`,
        });
      }
    }

    // Breakout: each channel's usual views, cached for a few days.
    const fresh = (entry?: { at: string }) =>
      entry && now().getTime() - new Date(entry.at).getTime() < BREAKOUT.cacheDays * 86400000;
    const best = new Map<string, number>();
    for (const v of videos.values()) {
      const ch = channels.get(v.channelId);
      if (!ch) continue;
      if (v.views < opts.filters.minViews) continue;
      if (relevance(v).status === 'drop') continue;
      if (opts.filters.maxSubs !== null && ch.subs !== null && ch.subs > opts.filters.maxSubs) continue;
      best.set(v.channelId, Math.max(best.get(v.channelId) ?? 0, v.views));
    }
    const ordered = [...best.entries()].sort((a, b) => b[1] - a[1]).map(([id]) => id);
    const toFetch: string[] = [];
    for (const id of ordered) {
      const cached = opts.channelCache?.[id];
      if (fresh(cached)) channelRecent[id] = cached!.recent;
      else if (toFetch.length < BREAKOUT.maxChannels) toFetch.push(id);
    }
    if (ordered.length > Object.keys(channelRecent).length + toFetch.length) {
      notes.push(
        `Breakout was read for ${BREAKOUT.maxChannels} new channels at most; ${ordered.length - Object.keys(channelRecent).length - toFetch.length} more were left without it.`,
      );
    }
    const updates: Record<string, { recent: { videoId: string; views: number }[]; at: string }> = {};
    let read = 0;
    try {
      await pool(toFetch, 4, async (id) => {
        opts.onProgress?.("Reading channels' recent Shorts", read, toFetch.length);
        const pl = await call(
          'playlistItems',
          { part: 'contentDetails', playlistId: channels.get(id)!.uploadsPlaylistId, maxResults: '50' },
          QUOTA_COST.playlistItems,
          ctx,
        );
        const recentIds: string[] = (pl.items ?? []).map((it: any) => it.contentDetails?.videoId).filter(Boolean);
        if (!recentIds.length) {
          channelRecent[id] = [];
          updates[id] = { recent: [], at: now().toISOString() };
        } else {
          const vs = await call(
            'videos',
            { part: 'contentDetails,statistics', id: recentIds.join(','), maxResults: '50' },
            QUOTA_COST.videos,
            ctx,
          );
          const recent = recentShorts(
            recentIds,
            (vs.items ?? []).map((it: any) => ({
              videoId: it.id,
              durationSec: parseIso8601Duration(it.contentDetails?.duration ?? ''),
              views: num(it.statistics?.viewCount),
            })),
          );
          channelRecent[id] = recent;
          updates[id] = { recent, at: now().toISOString() };
        }
        read++;
      });
    } finally {
      if (Object.keys(updates).length) opts.onChannelRecent?.(updates);
    }
  } catch (e) {
    if (e instanceof RunStop) {
      status = e.status;
      notes.push(e.message);
    } else {
      status = 'failed';
      notes.push(e instanceof Error ? e.message : String(e));
    }
  }

  opts.onProgress?.('Scoring', 1, 1);
  const scanned = [...videos.values()].map((v) => ({
    ...v,
    thumbnailUrl: '',
    keywords: [...(hits.get(v.videoId) ?? [])],
  })) as ScannedVideo[];
  const channelSubs = Object.fromEntries([...channels.values()].map((c) => [c.channelId, c.subs]));
  const result = evaluateRun({
    scanned,
    scannedCount: videos.size,
    channelSubs,
    filters: opts.filters,
    lists: opts.lists,
    excludeChannelIds: opts.excludeChannelIds,
    seen: opts.seenVideoIds,
    now: now(),
    keywordFound: Object.fromEntries(keywordStats.filter((s) => s.searched).map((s) => [s.keyword, s.found])),
    keywordPrevious: opts.keywordPrevious,
    channelRecent,
    layer2: layer2 as any,
  });
  for (const o of result.outliers) o.thumbnailUrl = videos.get(o.videoId)?.thumbnailUrl ?? '';
  const byKeyword = new Map(result.keywordStats.map((s) => [s.keyword, s]));
  return {
    id: runId,
    profileId: opts.profile.id,
    profileName: opts.profile.name,
    startedAt,
    finishedAt: now().toISOString(),
    status,
    unitsUsed,
    keywordsSearched,
    videosSeen: videos.size,
    outliers: result.outliers,
    keywordStats: keywordStats.map((s) => byKeyword.get(s.keyword) ?? s),
    notes: [...notes, ...lowResultNotes(result.keywordStats), ...result.notes],
    filters: { ...opts.filters, passes: ['A'] },
    filteredOut: result.filteredOut,
    quality: result.quality,
    scanned,
    channelSubs,
    channelRecent,
    layer2Labels: layer2?.labels ?? {},
    qualifiedIds: result.qualifiedIds,
    ...(opts.appVersion ? { appVersion: opts.appVersion } : {}),
    ...(opts.configHash ? { configHash: opts.configHash } : {}),
  };
}
