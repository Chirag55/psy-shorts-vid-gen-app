import { channelOutliers, type CompetitorOutlier } from '@/core/competitors';
import {
  decideResolution,
  discoveryBudget,
  discoveryQueries,
  mergeSuggestions,
  parseChannelInput,
  playbookChannels,
  weeklyUnits,
  MAX_SUGGESTIONS,
  WEEKLY_QUOTA,
  type ChannelSuggestion,
  type WatchedChannel,
} from '@/core/discovery';
import { OUTLIER_SCORE, watchChannel } from '@/core/formatDna';
import { useStudio } from '@/store';
import { getKey } from './keys';
import { fetchChannel, fetchUploadsPage, lookupChannel, searchChannels, searchTopicChannels, type ChannelRef } from './youtube';

async function requireKey(): Promise<string> {
  const key = await getKey('youtubeApiKey');
  if (!key) throw new Error('Add a YouTube Data API key in Settings: competitor channels are read as public data.');
  return key;
}

/** The watched channels: the user's list, or the playbook's until they edit it. */
export function registryChannels(): WatchedChannel[] {
  return useStudio.getState().weekly.channels ?? playbookChannels(new Date());
}

/** Reads every watched channel's recent uploads and stores the outliers and the title data. */
export async function runCompetitorScan(now: Date = new Date()) {
  const key = await requireKey();
  const channels = registryChannels();
  const units = weeklyUnits(channels.length, 0);
  if (units > WEEKLY_QUOTA) {
    throw new Error(`${channels.length} channels would use ${units} quota units; the weekly limit is ${WEEKLY_QUOTA}.`);
  }
  const rows: CompetitorOutlier[] = [];
  const videos: any[] = [];
  const errors: string[] = [];
  for (const ch of channels) {
    const auth = { kind: 'apiKey' as const, apiKey: key, channelId: ch.id };
    try {
      const channel = await fetchChannel(auth);
      const page = await fetchUploadsPage(auth, channel.uploadsPlaylistId, undefined, 50);
      rows.push(
        ...channelOutliers(
          { id: ch.id, name: ch.name },
          page.videos.map((v) => ({
            videoId: v.videoId,
            title: v.title,
            views: v.viewCount,
            durationSeconds: v.durationSeconds,
            publishedAt: v.publishedAt,
          })),
          now,
        ),
      );
      videos.push(...watchChannel(ch.id, page.videos));
    } catch (e) {
      errors.push(`${ch.name}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  // Keep the last good scan when every channel failed.
  if (rows.length || !errors.length) useStudio.getState().setCompetitors(rows, now.toISOString());
  if (videos.length) useStudio.getState().setCompetitorVideos(videos, now.toISOString());
  return { rows, errors, units };
}

/** Channels matching a pasted id, @handle, link or name. */
export async function findChannel(input: string): Promise<ChannelRef[]> {
  const key = await requireKey();
  const parsed = parseChannelInput(input);
  if (!parsed.value) return [];
  if (parsed.kind === 'id') return lookupChannel(key, { id: parsed.value });
  if (parsed.kind === 'handle') return lookupChannel(key, { handle: parsed.value });
  return searchChannels(key, parsed.value);
}

/** A playbook seed resolved by its handle, else by name search. */
export async function resolveSeed(seed: { name: string; handle?: string }) {
  const key = await requireKey();
  const byHandle = await lookupChannel(key, { handle: seed.handle });
  const first = decideResolution(seed.name, byHandle);
  if (first.kind === 'resolved') return first;
  const byName = await searchChannels(key, seed.name);
  return decideResolution(seed.name, byName.length ? byName : byHandle);
}

/**
 * Searches this week's share of topic queries for channels not yet followed,
 * keeps those with a recent outlier, and merges them into the suggestions.
 */
export async function runDiscovery(titles: string[], now: Date = new Date()) {
  const key = await requireKey();
  const state = useStudio.getState();
  const channels = registryChannels();
  const budget = discoveryBudget(channels.length);
  const { queries, cursor } = discoveryQueries(titles, state.weekly.discoveryCursor ?? 0, budget);
  const known = new Set([
    ...channels.map((c) => c.id),
    ...(state.weekly.suggestedDismissed ?? []),
    ...(state.weekly.suggested ?? []).map((s) => s.id),
  ]);
  const since = new Date(now.getTime() - 7776000000).toISOString();
  const found = new Map<string, ChannelRef>();
  const errors: string[] = [];
  for (const q of queries) {
    try {
      for (const r of await searchTopicChannels(key, q, since)) {
        if (!known.has(r.id) && found.size < MAX_SUGGESTIONS) found.set(r.id, r);
      }
    } catch (e) {
      errors.push(`"${q}": ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  const candidates: ChannelSuggestion[] = [];
  for (const ch of found.values()) {
    const auth = { kind: 'apiKey' as const, apiKey: key, channelId: ch.id };
    try {
      const channel = await fetchChannel(auth);
      const page = await fetchUploadsPage(auth, channel.uploadsPlaylistId, undefined, 25);
      const best = watchChannel(ch.id, page.videos)
        .filter((v) => v.score >= OUTLIER_SCORE)
        .sort((a, b) => b.score - a.score)[0];
      if (best) {
        candidates.push({
          id: ch.id,
          name: ch.name,
          video: { videoId: best.videoId, title: best.title, score: best.score },
          at: now.toISOString(),
        });
      }
    } catch (e) {
      errors.push(`${ch.name}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  const suggested = mergeSuggestions(
    state.weekly.suggested ?? [],
    candidates,
    channels,
    state.weekly.suggestedDismissed ?? [],
  );
  useStudio.getState().setSuggested(suggested, now.toISOString(), cursor);
  return { suggested, searches: queries.length, errors };
}
