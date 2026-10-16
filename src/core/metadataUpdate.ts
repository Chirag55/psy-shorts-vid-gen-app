import { tagsLength } from './seoMeta';

/** A video's current snippet as YouTube returns it. */
export interface VideoSnippet {
  channelId: string;
  title: string;
  description?: string;
  tags?: string[];
  categoryId?: string;
  defaultLanguage?: string;
  defaultAudioLanguage?: string;
}

export interface MetadataUpdate {
  videoId: string;
  /** null keeps the current title. */
  title: string | null;
  description: string;
  tags: string[];
  manual: { relatedVideo?: string; pinnedComment?: string };
}

export interface MetadataFile {
  channelId: string;
  generated?: string;
  notes?: string;
  updates: MetadataUpdate[];
}

export interface RejectedUpdate {
  videoId?: string;
  reason: string;
}

const isText = (v: unknown): v is string => typeof v === 'string';

/** Bytes a string takes as UTF-8, which is how YouTube counts the description. */
export function utf8Length(s: string): number {
  let n = 0;
  for (const ch of s) {
    const cp = ch.codePointAt(0) ?? 0;
    n += cp < 128 ? 1 : cp < 2048 ? 2 : cp < 65536 ? 3 : 4;
  }
  return n;
}

/** Reads a metadata update file, keeping the good updates and saying why the rest were dropped. */
export function parseMetadataFile(text: string): { file?: MetadataFile; error?: string; rejected: RejectedUpdate[] } {
  try {
    const data = JSON.parse(text);
    if (!data || typeof data !== 'object' || !Array.isArray(data.updates)) {
      return { error: 'The file needs an "updates" list — is it a metadata update file?', rejected: [] };
    }
    if (!(isText(data.channel_id) && data.channel_id.trim())) {
      return { error: 'The file needs a "channel_id", so videos from another channel are never touched.', rejected: [] };
    }
    const updates: MetadataUpdate[] = [];
    const rejected: RejectedUpdate[] = [];
    const seen = new Set<string>();
    for (const [i, raw] of (data.updates as any[]).entries()) {
      const u = raw ?? {};
      const videoId = isText(u.video_id) ? u.video_id.trim() : '';
      if (!videoId) {
        rejected.push({ reason: `update ${i + 1} has no video_id` });
        continue;
      }
      if (seen.has(videoId)) {
        rejected.push({ videoId, reason: 'listed twice; only the first is used' });
        continue;
      }
      if (u.title !== null && u.title !== undefined && !isText(u.title)) {
        rejected.push({ videoId, reason: '"title" must be text or null' });
        continue;
      }
      if (!isText(u.description)) {
        rejected.push({ videoId, reason: 'needs a "description"' });
        continue;
      }
      if (!Array.isArray(u.tags) || !u.tags.every(isText)) {
        rejected.push({ videoId, reason: '"tags" must be a list of text' });
        continue;
      }
      seen.add(videoId);
      const manual = u.manual ?? {};
      updates.push({
        videoId,
        title: isText(u.title) ? u.title : null,
        description: u.description,
        tags: (u.tags as string[]).map((t) => t.trim()).filter(Boolean),
        manual: {
          ...(isText(manual.related_video) && manual.related_video.trim() ? { relatedVideo: manual.related_video.trim() } : {}),
          ...(isText(manual.pinned_comment) && manual.pinned_comment.trim()
            ? { pinnedComment: manual.pinned_comment.trim() }
            : {}),
        },
      });
    }
    return {
      file: {
        channelId: data.channel_id.trim(),
        ...(isText(data.generated) ? { generated: data.generated } : {}),
        ...(isText(data.notes) ? { notes: data.notes } : {}),
        updates,
      },
      rejected,
    };
  } catch {
    return { error: 'This is not a JSON file.', rejected: [] };
  }
}

/** What YouTube would refuse in an update. */
export function validateUpdate(u: { title: string | null; description: string; tags: string[] }): string[] {
  const problems: string[] = [];
  if (u.title !== null) {
    const t = u.title.trim();
    if (!t.length) problems.push('The new title is empty.');
    if ([...t].length > 100) problems.push(`The new title is ${[...t].length} characters; YouTube allows 100.`);
    if (/[<>]/.test(t)) problems.push('The new title contains < or >, which YouTube rejects.');
  }
  const bytes = utf8Length(u.description);
  if (5000 < bytes) problems.push(`The description is ${bytes} bytes; YouTube allows 5,000.`);
  if (/[<>]/.test(u.description)) problems.push('The description contains < or >, which YouTube rejects.');
  const tags = tagsLength(u.tags);
  if (tags > 500) {
    problems.push(`The tags come to ${tags} characters (YouTube counts quotes around tags with spaces); the limit is 500.`);
  }
  if (u.tags.some((t) => /[<>]/.test(t))) problems.push('A tag contains < or >, which YouTube rejects.');
  return problems;
}

/** The snippet fields an update writes back, so nothing else is lost. */
export function writableSnippet(s: VideoSnippet) {
  return {
    title: s.title,
    description: s.description ?? '',
    tags: s.tags ?? [],
    categoryId: s.categoryId,
    ...(s.defaultLanguage ? { defaultLanguage: s.defaultLanguage } : {}),
    ...(s.defaultAudioLanguage ? { defaultAudioLanguage: s.defaultAudioLanguage } : {}),
  };
}

export function mergeSnippet(current: VideoSnippet, update: { title: string | null; description: string; tags: string[] }) {
  return {
    ...writableSnippet(current),
    title: update.title !== null && update.title.trim() ? update.title.trim() : current.title,
    description: update.description,
    tags: update.tags,
  };
}

export interface PlannedUpdate {
  update: MetadataUpdate;
  current?: VideoSnippet;
  issues: string[];
  changes: { title: boolean; description: boolean; tags: boolean };
  normalized: string[];
}

/** Each update checked against the video as it is now. */
export function planUpdates(
  file: MetadataFile,
  current: Record<string, VideoSnippet | undefined>,
  normalize?: (u: MetadataUpdate) => { update: MetadataUpdate; changes: string[] },
): PlannedUpdate[] {
  return file.updates.map((u) => {
    const n = normalize ? normalize(u) : { update: u, changes: [] };
    const update = n.update;
    const cur = current[update.videoId];
    const issues = validateUpdate(update);
    if (!cur) {
      issues.unshift('YouTube has no video with this id that this account can see.');
      return { update, issues, changes: { title: false, description: false, tags: false }, normalized: n.changes };
    }
    if (cur.channelId !== file.channelId) {
      issues.unshift(`This video belongs to another channel (${cur.channelId}), not ${file.channelId}.`);
    }
    if (!cur.categoryId) issues.push('YouTube returned no category for this video, and an update needs one.');
    const merged = mergeSnippet(cur, update);
    const changes = {
      title: merged.title !== cur.title,
      description: merged.description !== (cur.description ?? ''),
      tags: JSON.stringify(merged.tags) !== JSON.stringify(cur.tags ?? []),
    };
    if (!changes.title && !changes.description && !changes.tags) issues.push('Already up to date — nothing would change.');
    return { update, current: cur, issues, changes, normalized: n.changes };
  });
}

export type UpdateFailureKind = 'quota' | 'permissions' | 'auth' | 'notFound' | 'forbidden' | 'invalid' | 'other';

/** A failed videos.update, in words. */
export function classifyUpdateFailure(status: number, body: string): { kind: UpdateFailureKind; message: string } {
  let reason = '';
  let message = '';
  try {
    const j = JSON.parse(body);
    reason = j.error?.errors?.[0]?.reason ?? '';
    message = j.error?.errors?.[0]?.message ?? j.error?.message ?? '';
  } catch {
    // Not JSON; classify by status alone.
  }
  if (reason === 'quotaExceeded' || reason === 'dailyLimitExceeded' || reason === 'rateLimitExceeded') {
    return { kind: 'quota', message: "YouTube's daily API quota is used up. It resets at midnight Pacific time." };
  }
  if (reason === 'insufficientPermissions' || reason === 'ACCESS_TOKEN_SCOPE_INSUFFICIENT') {
    return {
      kind: 'permissions',
      message: 'The YouTube sign-in does not allow editing videos. Sign in again and approve every permission.',
    };
  }
  if (status === 401) return { kind: 'auth', message: 'The YouTube sign-in has expired. Sign in again.' };
  if (status === 404 || reason === 'videoNotFound') return { kind: 'notFound', message: 'YouTube cannot find this video.' };
  if (status === 403) return { kind: 'forbidden', message: `YouTube refused the change${message ? `: ${message}` : '.'}` };
  if (status === 400) return { kind: 'invalid', message: `YouTube rejected the values${message ? `: ${message}` : '.'}` };
  return { kind: 'other', message: `YouTube error ${status}${message ? `: ${message}` : ''}` };
}

export interface TitleChange {
  videoId: string;
  oldTitle: string;
  newTitle: string;
  at: string;
  viewsAtChange?: number;
}

/** A prompt note on retitled videos and what the new title has done since. */
export function describeTitleChanges(
  changes: TitleChange[],
  views: Record<string, number | undefined>,
  now: Date = new Date(),
): string {
  const changed = changes.filter((c) => c.oldTitle !== c.newTitle);
  if (!changed.length) return '';
  const latest = new Map<string, TitleChange>();
  for (const c of changed) {
    const seen = latest.get(c.videoId);
    if (!seen || seen.at < c.at) latest.set(c.videoId, c);
  }
  const lines = [...latest.values()]
    .sort((a, b) => (a.at < b.at ? 1 : -1))
    .slice(0, 15)
    .map((c) => {
      const days = Math.max(0, Math.floor((now.getTime() - new Date(c.at).getTime()) / 86400000));
      const s = days === 1 ? '' : 's';
      const current = views[c.videoId];
      const since =
        c.viewsAtChange === undefined || current === undefined
          ? `; changed ${days} day${s} ago`
          : `; ${Math.max(0, current - c.viewsAtChange).toLocaleString('en-US')} views in the ${days} day${s} since, after ${c.viewsAtChange.toLocaleString('en-US')} before`;
      return `- "${c.newTitle}" (was "${c.oldTitle}"${since})`;
    });
  return `\n\nTITLE CHANGES — these videos were retitled. Views before a change were earned by the old title, so judge the new one only on views since. A new title that has not lifted views is one to avoid:\n${lines.join('\n')}`;
}
