import { Directory, File, Paths } from 'expo-file-system';

import {
  classifyUpdateFailure,
  mergeSnippet,
  writableSnippet,
  type MetadataUpdate,
  type UpdateFailureKind,
  type VideoSnippet,
} from '@/core/metadataUpdate';

const API = 'https://www.googleapis.com/youtube/v3';

export class MetadataUpdateError extends Error {
  kind: UpdateFailureKind;
  constructor(message: string, kind: UpdateFailureKind) {
    super(message);
    this.name = 'MetadataUpdateError';
    this.kind = kind;
  }
}

export interface LiveVideo {
  snippet: VideoSnippet;
  views?: number;
}

export interface AppliedChange {
  oldTitle: string;
  newTitle: string;
  viewsAtChange?: number;
}

async function failure(res: Response): Promise<MetadataUpdateError> {
  const body = await res.text().catch(() => '');
  const { kind, message } = classifyUpdateFailure(res.status, body);
  return new MetadataUpdateError(message, kind);
}

/** Current snippet and views for each id, 50 per request. */
export async function fetchLiveVideos(accessToken: string, ids: string[]): Promise<Record<string, LiveVideo>> {
  const out: Record<string, LiveVideo> = {};
  for (let i = 0; i < ids.length; i += 50) {
    const batch = ids.slice(i, i + 50);
    const res = await fetch(`${API}/videos?part=snippet,statistics&id=${batch.map(encodeURIComponent).join(',')}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) throw await failure(res);
    const json = await res.json();
    for (const item of json.items ?? []) {
      if (!item.snippet) continue;
      const views = Number(item.statistics?.viewCount);
      out[item.id] = { snippet: item.snippet, ...(Number.isFinite(views) ? { views } : {}) };
    }
  }
  return out;
}

async function putSnippet(accessToken: string, videoId: string, snippet: any): Promise<VideoSnippet> {
  const res = await fetch(`${API}/videos?part=snippet`, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ id: videoId, snippet }),
  });
  if (!res.ok) throw await failure(res);
  const json = await res.json();
  return json.snippet ?? { ...snippet, channelId: '' };
}

function backupDir(): Directory {
  const dir = new Directory(Paths.document, 'metadata_backups');
  if (!dir.exists) dir.create({ intermediates: true });
  return dir;
}

/** Keeps every pre-change snippet; the earliest one is the original. */
function saveBackup(videoId: string, snippet: VideoSnippet): void {
  const savedAt = new Date().toISOString();
  const stamp = savedAt.replace(/[-:.]/g, '');
  let file = new File(backupDir(), `${videoId}_${stamp}.json`);
  let n = 1;
  while (file.exists) {
    file = new File(backupDir(), `${videoId}_${stamp}_${n}.json`);
    n += 1;
  }
  file.create();
  file.write(JSON.stringify({ videoId, savedAt, snippet: writableSnippet(snippet) }, null, 2));
}

function originalBackup(videoId: string): { videoId: string; savedAt: string; snippet: any } | null {
  const escaped = videoId.replace(/[.*+?^${}()|[\]\\-]/g, '\\$&');
  const re = new RegExp(`^${escaped}_\\d{8}T\\d{9}Z(_\\d+)?\\.json$`);
  const files = backupDir()
    .list()
    .filter((f): f is File => f instanceof File && re.test(f.name))
    .sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  if (!files.length) return null;
  try {
    return JSON.parse(files[0].textSync());
  } catch {
    return null;
  }
}

export function hasBackup(videoId: string): boolean {
  try {
    return originalBackup(videoId) !== null;
  } catch {
    return false;
  }
}

/** Writes one update after checking the video is still this channel's; backs up first. */
export async function applyUpdate(accessToken: string, channelId: string, update: MetadataUpdate): Promise<AppliedChange> {
  const live = (await fetchLiveVideos(accessToken, [update.videoId]))[update.videoId];
  if (!live) throw new MetadataUpdateError('YouTube cannot find this video.', 'notFound');
  if (live.snippet.channelId !== channelId) {
    throw new MetadataUpdateError(`This video belongs to another channel (${live.snippet.channelId}).`, 'forbidden');
  }
  saveBackup(update.videoId, live.snippet);
  const next = mergeSnippet(live.snippet, update);
  await putSnippet(accessToken, update.videoId, next);
  return {
    oldTitle: live.snippet.title,
    newTitle: next.title,
    ...(live.views === undefined ? {} : { viewsAtChange: live.views }),
  };
}

/** Puts back the snippet saved before the first change. */
export async function revertVideo(accessToken: string, videoId: string): Promise<AppliedChange> {
  const backup = originalBackup(videoId);
  if (!backup) throw new MetadataUpdateError('There is no backup of this video on this phone.', 'other');
  const live = (await fetchLiveVideos(accessToken, [videoId]))[videoId];
  if (!live) throw new MetadataUpdateError('YouTube cannot find this video.', 'notFound');
  const restored = { ...writableSnippet(live.snippet), ...backup.snippet };
  await putSnippet(accessToken, videoId, restored);
  return {
    oldTitle: live.snippet.title,
    newTitle: restored.title,
    ...(live.views === undefined ? {} : { viewsAtChange: live.views }),
  };
}
