import { COMPETITORS } from './competitors';
import { titleTokens } from './originality';

/** Channels the outlier watch follows at most. */
export const MAX_CHANNELS = 20;
/** The YouTube Data API units the weekly scan may spend. */
export const WEEKLY_QUOTA = 2000;
export const MAX_DISCOVERY_CALLS = 10;
export const MAX_SUGGESTIONS = 20;
export const UNITS_PER_CHANNEL = 3;
export const UNITS_PER_SEARCH = 100;
/** Channels to start the list from. */
export const SEEDS = [
  { name: 'Psych2Go', handle: '@psych2go', note: 'Animated long-form, numbered "signs"' },
  { name: 'Practical Psychology', handle: '@PracticalPsychology', note: 'Whiteboard explainers' },
  { name: 'Psych Hub', handle: '@psychhub', note: 'Animated and talking-head' },
  { name: 'BrainCraft', handle: '@BrainCraft', note: 'Short research-grounded explainers' },
  { name: 'Darkful Mind', handle: '@DarkfulMind', note: 'Shorts-heavy dark psychology' },
];

export interface WatchedChannel {
  id: string;
  name: string;
  addedAt: string;
  source: string;
}

const norm = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '');

export function playbookChannels(now: Date): WatchedChannel[] {
  return COMPETITORS.map((c) => ({ id: c.id, name: c.name, addedAt: now.toISOString(), source: 'playbook' }));
}

/** A channel lookup settles itself only when there is one candidate and its name matches. */
export function decideResolution<C extends { name: string }>(
  query: string,
  candidates: C[],
): { kind: 'resolved'; channel: C } | { kind: 'pick'; candidates: C[] } {
  const exact = candidates.filter((c) => norm(c.name) === norm(query));
  if (candidates.length === 1 && exact.length === 1) return { kind: 'resolved', channel: exact[0] };
  return { kind: 'pick', candidates };
}

export function addChannel<C extends { id: string; name: string }>(list: C[], channel: C): { list: C[]; error?: string } {
  if (list.some((c) => c.id === channel.id)) return { list, error: `${channel.name} is already on the list.` };
  if (list.length >= MAX_CHANNELS) return { list, error: `The list holds ${MAX_CHANNELS} channels: remove one first.` };
  return { list: [...list, channel] };
}

/** A channel id, an @handle (bare or in a URL), or a name to search for. */
export function parseChannelInput(input: string): { kind: 'id' | 'handle' | 'name'; value: string } {
  const t = input.trim();
  const id = /(UC[\w-]{22})/.exec(t);
  if (id) return { kind: 'id', value: id[1] };
  const handle = /youtube\.com\/(@[\w.-]+)/i.exec(t) ?? /^(@[\w.-]+)$/.exec(t);
  if (handle) return { kind: 'handle', value: handle[1] };
  return { kind: 'name', value: t };
}

export function weeklyUnits(channels: number, searches: number, extraChannels = 0): number {
  return channels * UNITS_PER_CHANNEL + searches * UNITS_PER_SEARCH + extraChannels * UNITS_PER_CHANNEL;
}

/** Searches the weekly quota leaves room for after the channel scans. */
export function discoveryBudget(channels: number, extraChannels = 0): number {
  return Math.max(
    0,
    Math.min(MAX_DISCOVERY_CALLS, Math.floor((WEEKLY_QUOTA - weeklyUnits(channels, 0, extraChannels)) / UNITS_PER_SEARCH)),
  );
}

export function discoveryQuery(title: string): string {
  return titleTokens(title).slice(0, 4).join(' ');
}

/** The next searches in rotation from the titles, and where the rotation stops. */
export function discoveryQueries(titles: string[], cursor: number, max: number): { queries: string[]; cursor: number } {
  const seen = new Set<string>();
  const all = titles.map(discoveryQuery).filter((q) => {
    if (!q || seen.has(q)) return false;
    seen.add(q);
    return true;
  });
  if (!all.length || max <= 0) return { queries: [], cursor };
  const queries = Array.from({ length: Math.min(max, all.length) }, (_, i) => all[(cursor + i) % all.length]);
  return { queries, cursor: (cursor + queries.length) % all.length };
}

export interface ChannelSuggestion {
  id: string;
  video: { score: number; [key: string]: unknown };
  [key: string]: unknown;
}

/** New and kept suggestions merged, each channel once at its best video, skipping followed and dismissed ones. */
export function mergeSuggestions<S extends ChannelSuggestion>(
  fresh: S[],
  existing: S[],
  channels: { id: string }[],
  dismissed: string[],
): S[] {
  const skip = new Set([...channels.map((c) => c.id), ...dismissed]);
  const best = new Map<string, S>();
  for (const s of [...existing, ...fresh]) {
    if (skip.has(s.id)) continue;
    const prev = best.get(s.id);
    if (!prev || s.video.score > prev.video.score) best.set(s.id, s);
  }
  return [...best.values()].sort((a, b) => b.video.score - a.video.score).slice(0, MAX_SUGGESTIONS);
}

/** Cached competitor titles with their channel names. */
export function titleCache(
  videos: { title: string; videoId: string; channelId: string }[] | null | undefined,
  channels: { id: string; name: string }[] | null | undefined,
) {
  const names = new Map((channels ?? []).map((c) => [c.id, c.name]));
  return (videos ?? []).map((v) => ({
    title: v.title,
    videoId: v.videoId,
    ...(names.get(v.channelId) ? { channel: names.get(v.channelId) } : {}),
  }));
}
