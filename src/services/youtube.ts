import * as AuthSession from 'expo-auth-session';
import { File, UploadType } from 'expo-file-system';
import { AUTH_CONSENT_PARAMS, AUTH_EXTRA_PARAMS, SIGN_IN_EXPIRED_MESSAGE, isRevokedGrant, redirectUriFor } from '@/core/oauth';
import { clearKey } from './keys';
import { parseIso8601Duration, pickThumbnail, type UploadedVideo } from '@/core/youtubeLibrary';
import { THUMBNAIL_MAX_BYTES, describeThumbnailFailure, thumbnailContentType } from '@/core/thumbnailUpload';
import { fitTags } from '@/core/seoMeta';
import { ANDROID_KEY_HEADERS } from '@/core/androidIdentity';

/**
 * YouTube Data API v3 publishing, driven entirely from the device.
 *
 * Uses the OAuth installed-app flow with PKCE. That flow issues no client
 * secret, which is what makes on-device publishing safe: there is no
 * high-privilege credential in the APK for anyone to extract.
 */

const DISCOVERY: AuthSession.DiscoveryDocument = {
  authorizationEndpoint: 'https://accounts.google.com/o/oauth2/v2/auth',
  tokenEndpoint: 'https://oauth2.googleapis.com/token',
  revocationEndpoint: 'https://oauth2.googleapis.com/revoke',
};

export const YOUTUBE_SCOPES = [
  'https://www.googleapis.com/auth/youtube.upload',
  'https://www.googleapis.com/auth/youtube',
  'https://www.googleapis.com/auth/yt-analytics.readonly',
  'https://www.googleapis.com/auth/youtube.force-ssl',
];

export class YouTubeError extends Error {}

/** The refresh token is gone; the user has to sign in again. */
export class SignInExpiredError extends YouTubeError {
  constructor(message: string = SIGN_IN_EXPIRED_MESSAGE) {
    super(message);
  }
}

const SCHEME_HELP =
  'open your Android OAuth client in Google Cloud Console, go to Advanced Settings and turn on "Custom URI scheme". Google disables it by default and sign-in cannot work without it.';

export interface StoredTokens {
  accessToken: string;
  refreshToken?: string;
  /** Epoch milliseconds. */
  expiresAt: number;
}

/** Android OAuth clients use a reverse-DNS redirect rather than a loopback URI. */
export function redirectUri(androidClientId: string): string {
  return redirectUriFor(androidClientId);
}

function describeAuthFailure(result: AuthSession.AuthSessionResult): string {
  if (result.type === 'error') {
    const message = String(result.params?.error_description ?? result.params?.error ?? '');
    if (/custom uri scheme/i.test(message)) return SCHEME_HELP;
    if (message) return message;
  }
  return `Sign-in did not complete.\n\nIf the browser showed "Error 400: invalid_request", ${SCHEME_HELP}`;
}

async function requestTokens(androidClientId: string, extraParams: Record<string, string>): Promise<StoredTokens> {
  const redirect = redirectUri(androidClientId);
  const request = new AuthSession.AuthRequest({
    clientId: androidClientId,
    scopes: YOUTUBE_SCOPES,
    redirectUri: redirect,
    responseType: AuthSession.ResponseType.Code,
    usePKCE: true,
    extraParams: { ...extraParams },
  });
  const result = await request.promptAsync(DISCOVERY);
  if (result.type !== 'success' || !result.params.code) throw new YouTubeError(describeAuthFailure(result));
  const token = await AuthSession.exchangeCodeAsync(
    {
      clientId: androidClientId,
      code: result.params.code,
      redirectUri: redirect,
      extraParams: { code_verifier: request.codeVerifier ?? '' },
    },
    DISCOVERY,
  );
  return {
    accessToken: token.accessToken,
    refreshToken: token.refreshToken,
    expiresAt: Date.now() + (token.expiresIn ?? 3600) * 1000,
  };
}

/** Signs in; asks for consent again if Google didn't hand over a refresh token the first time. */
export async function authorize(androidClientId: string): Promise<StoredTokens> {
  const first = await requestTokens(androidClientId, AUTH_EXTRA_PARAMS);
  if (first.refreshToken) return first;
  const second = await requestTokens(androidClientId, AUTH_CONSENT_PARAMS);
  if (!second.refreshToken) {
    throw new YouTubeError(
      'Google did not return a refresh token, so this sign-in would stop working in an hour. Remove this app at myaccount.google.com/permissions and sign in again.',
    );
  }
  return second;
}

/** Refreshes 60s early so a long upload cannot start on a token that expires mid-flight. */
export async function ensureFreshToken(androidClientId: string, tokens: StoredTokens): Promise<StoredTokens> {
  if (Date.now() < tokens.expiresAt - 60_000) return tokens;
  if (!tokens.refreshToken) throw new SignInExpiredError();
  let refreshed: AuthSession.TokenResponse;
  try {
    refreshed = await AuthSession.refreshAsync(
      { clientId: androidClientId, refreshToken: tokens.refreshToken },
      DISCOVERY,
    );
  } catch (e) {
    if (!isRevokedGrant(e)) throw e;
    await clearKey('youtubeTokens').catch(() => undefined);
    throw new SignInExpiredError();
  }
  return {
    accessToken: refreshed.accessToken,
    refreshToken: refreshed.refreshToken ?? tokens.refreshToken,
    expiresAt: Date.now() + (refreshed.expiresIn ?? 3600) * 1000,
  };
}

export interface UploadMeta {
  title: string;
  description: string;
  tags: string[];
  privacyStatus: 'private' | 'unlisted' | 'public';
  categoryId?: string;
  /** Uploads private and lets YouTube publish at this ISO time. */
  publishAt?: string;
  containsSyntheticMedia?: boolean;
}

/**
 * Resumable upload. Step one registers the metadata and gets a session URL;
 * step two streams the file to it. Resumable is the right mode on mobile even
 * for one shot — a dropped connection on a 40MB render is otherwise a full retry.
 */
export async function uploadVideo(
  accessToken: string,
  videoUri: string,
  meta: UploadMeta,
  onProgress?: (fraction: number) => void,
): Promise<string> {
  const file = new File(videoUri);
  if (!file.exists) throw new YouTubeError('Rendered video is missing from the workspace.');
  const size = file.size ?? 0;

  const initRes = await fetch(
    'https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status',
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        'X-Upload-Content-Length': String(size),
        'X-Upload-Content-Type': 'video/mp4',
      },
      body: JSON.stringify({
        snippet: {
          title: meta.title.slice(0, 100),
          description: meta.description.slice(0, 5000),
          tags: fitTags(meta.tags),
          categoryId: meta.categoryId ?? '27', // Education
        },
        status: {
          ...(meta.publishAt
            ? { privacyStatus: 'private', publishAt: meta.publishAt }
            : { privacyStatus: meta.privacyStatus }),
          selfDeclaredMadeForKids: false,
          containsSyntheticMedia: meta.containsSyntheticMedia === true,
        },
      }),
    },
  );

  if (!initRes.ok) {
    const detail = await initRes.text().catch(() => '');
    throw new YouTubeError(`Could not start the upload (${initRes.status}): ${detail.slice(0, 300)}`);
  }

  const sessionUrl = initRes.headers.get('location');
  if (!sessionUrl) throw new YouTubeError('YouTube did not return an upload session URL.');

  const task = file.createUploadTask(sessionUrl, {
    httpMethod: 'PUT',
    headers: { 'Content-Type': 'video/mp4' },
    uploadType: UploadType.BINARY_CONTENT,
  });

  const subscription = onProgress
    ? task.addListener('progress', ({ bytesSent, totalBytes }) => {
        const expected = totalBytes || size;
        if (expected > 0) onProgress(Math.min(1, bytesSent / expected));
      })
    : undefined;

  let result;
  try {
    result = await task.uploadAsync();
  } finally {
    subscription?.remove();
    task.release();
  }

  if (result.status < 200 || result.status >= 300) {
    throw new YouTubeError(`Upload failed (${result.status}): ${String(result.body).slice(0, 300)}`);
  }

  try {
    const body = JSON.parse(String(result.body));
    if (!body?.id) throw new Error();
    return body.id as string;
  } catch {
    throw new YouTubeError('Upload finished but YouTube did not return a video id.');
  }
}

/** UTF-8 bytes in a string, which is how YouTube counts the description limit. */
function utf8Length(text: string): number {
  let n = 0;
  for (const ch of text) {
    const cp = ch.codePointAt(0) ?? 0;
    n += cp < 0x80 ? 1 : cp < 0x800 ? 2 : cp < 0x10000 ? 3 : 4;
  }
  return n;
}

/** Rewrites a video's description, keeping the rest of its snippet. */
export async function editDescription(
  accessToken: string,
  videoId: string,
  edit: (description: string) => string | null,
): Promise<'changed' | 'unchanged'> {
  const headers = { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' };
  const res = await fetch(`https://www.googleapis.com/youtube/v3/videos?part=snippet&id=${encodeURIComponent(videoId)}`, {
    headers,
  });
  if (!res.ok) throw new YouTubeError(`Could not read video ${videoId} (${res.status}).`);
  const data = await res.json();
  const snippet = data.items?.[0]?.snippet;
  if (!snippet) throw new YouTubeError(`Video ${videoId} was not found on this channel.`);
  const current = String(snippet.description ?? '');
  const next = edit(current);
  if (next === null || next === current) return 'unchanged';
  if (utf8Length(next) > 5000) {
    throw new YouTubeError(
      `The description of ${videoId} is too long to add the link. Shorten it in YouTube Studio and try again.`,
    );
  }
  const put = await fetch('https://www.googleapis.com/youtube/v3/videos?part=snippet', {
    method: 'PUT',
    headers,
    body: JSON.stringify({
      id: videoId,
      snippet: {
        title: snippet.title,
        categoryId: snippet.categoryId,
        tags: snippet.tags,
        defaultLanguage: snippet.defaultLanguage,
        defaultAudioLanguage: snippet.defaultAudioLanguage,
        description: next,
      },
    }),
  });
  if (put.ok) return 'changed';
  const detail = await put.text().catch(() => '');
  throw new YouTubeError(`Could not update ${videoId} (${put.status}): ${detail.slice(0, 200)}`);
}

/** Adds a line to the end of a description unless it's already there. */
export async function appendToDescription(
  accessToken: string,
  videoId: string,
  line: string,
): Promise<'added' | 'already'> {
  const result = await editDescription(accessToken, videoId, (d) => (d.includes(line) ? null : `${d.trimEnd()}\n\n${line}`));
  return result === 'changed' ? 'added' : 'already';
}

/** Attaches a custom thumbnail. Requires a channel verified for custom thumbnails. */
export async function setThumbnail(accessToken: string, videoId: string, imageUri: string): Promise<void> {
  const file = new File(imageUri);
  if (!file.exists) throw new YouTubeError('Thumbnail file is missing. Draw it again on the Thumbnail screen.');
  if (file.size > THUMBNAIL_MAX_BYTES) {
    throw new YouTubeError(
      `The thumbnail is ${(file.size / 1024 / 1024).toFixed(1)} MB; YouTube's limit is 2 MB. Draw it again.`,
    );
  }
  const result = await file.upload(
    `https://www.googleapis.com/upload/youtube/v3/thumbnails/set?videoId=${encodeURIComponent(videoId)}`,
    {
      httpMethod: 'POST',
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': thumbnailContentType(imageUri) },
      uploadType: UploadType.BINARY_CONTENT,
    },
  );
  if (result.status >= 200 && result.status < 300) return;
  throw new YouTubeError(describeThumbnailFailure(result.status, result.body ?? ''));
}

export function watchUrl(videoId: string): string {
  return `https://www.youtube.com/watch?v=${videoId}`;
}

export function shortsUrl(videoId: string): string {
  return `https://www.youtube.com/shorts/${videoId}`;
}

const API = 'https://www.googleapis.com/youtube/v3';

/**
 * Two ways to read the channel:
 *
 *  - An **API key** — no sign-in, but only public data, and the channel has to
 *    be identified explicitly because there is no "me".
 *  - **OAuth** — sees unlisted and private uploads and knows which channel is
 *    yours, but needs the consent flow.
 */
export type YouTubeAuth =
  | { kind: 'oauth'; accessToken: string }
  | { kind: 'apiKey'; apiKey: string; channelId: string };

const keyAuth = (apiKey: string): YouTubeAuth => ({ kind: 'apiKey', apiKey, channelId: '' });

async function api<T>(auth: YouTubeAuth, path: string, params: Record<string, string>): Promise<T> {
  const query = new URLSearchParams(auth.kind === 'apiKey' ? { ...params, key: auth.apiKey } : params).toString();
  const res = await fetch(`${API}/${path}?${query}`, {
    headers: auth.kind !== 'oauth' ? ANDROID_KEY_HEADERS : { Authorization: `Bearer ${auth.accessToken}` },
  });
  if (res.ok) return (await res.json()) as T;
  const detail = await res.text().catch(() => '');
  if (res.status === 403 && detail.includes('quotaExceeded')) {
    throw new YouTubeError('YouTube API quota exhausted for today. It resets at midnight Pacific.');
  }
  if (res.status === 403 && auth.kind === 'apiKey') {
    throw new YouTubeError(
      'YouTube rejected the API key. Check that the YouTube Data API v3 is enabled for it, and that any key restrictions allow this app.',
    );
  }
  throw new YouTubeError(`YouTube ${res.status}: ${detail.slice(0, 300) || res.statusText}`);
}

/** The error to throw for a failed write, in plain words for the common causes. */
async function writeFailure(res: Response, what: string): Promise<YouTubeError> {
  const detail = await res.text().catch(() => '');
  let reason = '';
  try {
    reason = JSON.parse(detail).error?.errors?.[0]?.reason ?? '';
  } catch {
    // Not JSON.
  }
  if (res.status === 403 && /insufficient|forbidden/i.test(reason || detail)) {
    return new YouTubeError(
      `${what}: this sign-in doesn't allow it yet. Sign in to YouTube again in Settings (the app now asks for caption access too), then retry.`,
    );
  }
  if (res.status === 403 && /quota/i.test(reason)) {
    return new YouTubeError(`${what}: today's YouTube API quota is used up. Retry tomorrow.`);
  }
  return new YouTubeError(`${what} failed (${res.status}${reason ? `, ${reason}` : ''}).`);
}

export interface ChannelSummary {
  channelId: string;
  title: string;
  uploadsPlaylistId: string;
  subscriberCount: number;
  videoCount: number;
  viewCount: number;
  thumbnailUrl: string;
}

/** Resolves the channel and its uploads playlist (1 quota unit per page, against 100 per search). */
export async function fetchChannel(auth: YouTubeAuth): Promise<ChannelSummary> {
  const data = await api<{
    items?: Array<{
      id: string;
      snippet?: { title?: string; thumbnails?: Record<string, { url?: string }> };
      contentDetails?: { relatedPlaylists?: { uploads?: string } };
      statistics?: { subscriberCount?: string; videoCount?: string; viewCount?: string };
    }>;
  }>(auth, 'channels', {
    part: 'snippet,contentDetails,statistics',
    ...(auth.kind === 'oauth' ? { mine: 'true' } : { id: auth.channelId }),
  });
  const channel = data.items?.[0];
  if (!channel) {
    throw new YouTubeError(
      auth.kind === 'oauth'
        ? 'This Google account has no YouTube channel.'
        : 'No channel found for that ID. It should look like UCxxxxxxxxxxxxxxxxxxxxxx.',
    );
  }
  const uploads = channel.contentDetails?.relatedPlaylists?.uploads;
  if (!uploads) throw new YouTubeError('Could not find the channel uploads playlist.');
  return {
    channelId: channel.id,
    title: channel.snippet?.title ?? 'My channel',
    uploadsPlaylistId: uploads,
    subscriberCount: Number(channel.statistics?.subscriberCount ?? 0),
    videoCount: Number(channel.statistics?.videoCount ?? 0),
    viewCount: Number(channel.statistics?.viewCount ?? 0),
    thumbnailUrl: pickThumbnail(channel.snippet?.thumbnails),
  };
}

export interface UploadsPage {
  videos: UploadedVideo[];
  nextPageToken?: string;
}

interface VideoItem {
  id: string;
  snippet?: {
    title?: string;
    description?: string;
    tags?: string[];
    publishedAt?: string;
    thumbnails?: Record<string, { url?: string }>;
  };
  contentDetails?: { duration?: string; regionRestriction?: unknown };
  statistics?: { viewCount?: string; likeCount?: string; commentCount?: string };
  status?: {
    privacyStatus?: string;
    publishAt?: string;
    uploadStatus?: string;
    failureReason?: string;
    rejectionReason?: string;
  };
  processingDetails?: { processingStatus?: string };
}

/** Status fields worth showing when YouTube didn't take an upload as-is. */
function statusFields(item: VideoItem) {
  return {
    ...(item.status?.publishAt ? { scheduledFor: item.status.publishAt } : {}),
    ...(item.status?.uploadStatus ? { uploadStatus: item.status.uploadStatus } : {}),
    ...(item.status?.failureReason ? { failureReason: item.status.failureReason } : {}),
    ...(item.status?.rejectionReason ? { rejectionReason: item.status.rejectionReason } : {}),
    ...(item.processingDetails?.processingStatus ? { processingStatus: item.processingDetails.processingStatus } : {}),
    ...(item.contentDetails?.regionRestriction ? { regionRestricted: true } : {}),
  };
}

/** One page of uploads with full details: playlistItems for ids, then one batched videos.list. */
export async function fetchUploadsPage(
  auth: YouTubeAuth,
  uploadsPlaylistId: string,
  pageToken?: string,
  pageSize = 25,
): Promise<UploadsPage> {
  const playlist = await api<{
    nextPageToken?: string;
    items?: Array<{ contentDetails?: { videoId?: string } }>;
  }>(auth, 'playlistItems', {
    part: 'contentDetails',
    playlistId: uploadsPlaylistId,
    maxResults: String(pageSize),
    ...(pageToken ? { pageToken } : {}),
  });
  const ids = (playlist.items ?? [])
    .map((item) => item.contentDetails?.videoId)
    .filter((id): id is string => Boolean(id));
  if (!ids.length) return { videos: [], nextPageToken: playlist.nextPageToken };
  const details = await api<{ items?: VideoItem[] }>(auth, 'videos', {
    // processingDetails is owner-only; an API key sees public videos only.
    part:
      auth.kind === 'oauth'
        ? 'snippet,contentDetails,statistics,status,processingDetails'
        : 'snippet,contentDetails,statistics,status',
    id: ids.join(','),
  });
  const videos: UploadedVideo[] = (details.items ?? []).map((item) => ({
    videoId: item.id,
    title: item.snippet?.title ?? '(untitled)',
    description: item.snippet?.description ?? '',
    ...(item.snippet?.tags ? { tags: item.snippet.tags } : {}),
    publishedAt: item.snippet?.publishedAt ?? '',
    thumbnailUrl: pickThumbnail(item.snippet?.thumbnails),
    durationSeconds: parseIso8601Duration(item.contentDetails?.duration ?? ''),
    viewCount: Number(item.statistics?.viewCount ?? 0),
    likeCount: Number(item.statistics?.likeCount ?? 0),
    commentCount: Number(item.statistics?.commentCount ?? 0),
    privacyStatus: item.status?.privacyStatus ?? 'public',
    ...statusFields(item),
  }));
  // videos.list does not keep the order ids were passed in; restore newest-first.
  const order = new Map(ids.map((id, i) => [id, i]));
  videos.sort((a, b) => (order.get(a.videoId) ?? 0) - (order.get(b.videoId) ?? 0));
  return { videos, nextPageToken: playlist.nextPageToken };
}

export interface VideoState {
  videoId: string;
  title: string;
  privacyStatus?: string;
  publishAt?: string;
  publishedAt?: string;
  uploadStatus?: string;
  failureReason?: string;
  rejectionReason?: string;
  processingStatus?: string;
  regionRestricted?: boolean;
  viewCount: number;
}

/** Live status of the given uploads, 50 per call. */
export async function fetchVideoStates(accessToken: string, ids: string[]): Promise<VideoState[]> {
  const out: VideoState[] = [];
  for (let i = 0; i < ids.length; i += 50) {
    const data = await api<{ items?: VideoItem[] }>({ kind: 'oauth', accessToken }, 'videos', {
      part: 'snippet,status,processingDetails,statistics,contentDetails',
      id: ids.slice(i, i + 50).join(','),
    });
    for (const item of data.items ?? []) {
      out.push({
        videoId: item.id,
        title: item.snippet?.title ?? item.id,
        ...(item.status?.privacyStatus ? { privacyStatus: item.status.privacyStatus } : {}),
        ...(item.status?.publishAt ? { publishAt: item.status.publishAt } : {}),
        ...(item.snippet?.publishedAt ? { publishedAt: item.snippet.publishedAt } : {}),
        ...(item.status?.uploadStatus ? { uploadStatus: item.status.uploadStatus } : {}),
        ...(item.status?.failureReason ? { failureReason: item.status.failureReason } : {}),
        ...(item.status?.rejectionReason ? { rejectionReason: item.status.rejectionReason } : {}),
        ...(item.processingDetails?.processingStatus ? { processingStatus: item.processingDetails.processingStatus } : {}),
        ...(item.contentDetails?.regionRestriction ? { regionRestricted: true } : {}),
        viewCount: Number(item.statistics?.viewCount ?? 0),
      });
    }
  }
  return out;
}

/** Every video id in the uploads playlist, up to `max`. */
export async function listAllUploadIds(accessToken: string, playlistId: string, max = 500): Promise<string[]> {
  const ids: string[] = [];
  let pageToken: string | undefined;
  do {
    const data = await api<{ nextPageToken?: string; items?: Array<{ contentDetails?: { videoId?: string } }> }>(
      { kind: 'oauth', accessToken },
      'playlistItems',
      { part: 'contentDetails', playlistId, maxResults: '50', ...(pageToken ? { pageToken } : {}) },
    );
    for (const item of data.items ?? []) if (item.contentDetails?.videoId) ids.push(item.contentDetails.videoId);
    pageToken = data.nextPageToken;
  } while (pageToken && ids.length < max);
  return ids;
}

/** Uploads a caption track (SRT) as a multipart request. */
export async function insertCaption(
  accessToken: string,
  videoId: string,
  srt: string,
  language = 'en',
  name = 'English',
): Promise<void> {
  const boundary = `mindfiles${Date.now().toString(36)}`;
  const body =
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n` +
    JSON.stringify({ snippet: { videoId, language, name, isDraft: false } }) +
    `\r\n--${boundary}\r\nContent-Type: application/octet-stream\r\n\r\n${srt}\r\n--${boundary}--`;
  const res = await fetch('https://www.googleapis.com/upload/youtube/v3/captions?uploadType=multipart&part=snippet', {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': `multipart/related; boundary=${boundary}` },
    body,
  });
  if (!res.ok) throw await writeFailure(res, 'Captions');
}

export async function postComment(accessToken: string, videoId: string, text: string): Promise<void> {
  const res = await fetch(`${API}/commentThreads?part=snippet`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ snippet: { videoId, topLevelComment: { snippet: { textOriginal: text } } } }),
  });
  if (!res.ok) throw await writeFailure(res, 'Posting the comment');
}

/** The id of the channel's playlist with this title, creating it (public) if there isn't one. */
export async function findOrCreatePlaylist(accessToken: string, title: string): Promise<string> {
  const headers = { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' };
  let pageToken: string | undefined;
  do {
    const url = `${API}/playlists?part=snippet&mine=true&maxResults=50${pageToken ? `&pageToken=${pageToken}` : ''}`;
    const res = await fetch(url, { headers });
    if (!res.ok) throw await writeFailure(res, 'Reading your playlists');
    const data = await res.json();
    const found = data.items?.find((p: any) => p.snippet?.title?.trim() === title.trim());
    if (found) return found.id;
    pageToken = data.nextPageToken;
  } while (pageToken);
  const res = await fetch(`${API}/playlists?part=snippet,status`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ snippet: { title }, status: { privacyStatus: 'public' } }),
  });
  if (!res.ok) throw await writeFailure(res, `Creating the playlist "${title}"`);
  return (await res.json()).id;
}

export async function addToPlaylist(accessToken: string, playlistId: string, videoId: string): Promise<void> {
  const res = await fetch(`${API}/playlistItems?part=snippet`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ snippet: { playlistId, resourceId: { kind: 'youtube#video', videoId } } }),
  });
  if (!res.ok) throw await writeFailure(res, 'Adding to the playlist');
}

export interface ChannelRef {
  id: string;
  name: string;
  handle?: string;
}

/** A channel by id or @handle, with an API key. */
export async function lookupChannel(apiKey: string, query: { id?: string; handle?: string }): Promise<ChannelRef[]> {
  const data = await api<{ items?: Array<{ id: string; snippet?: { title?: string; customUrl?: string } }> }>(
    keyAuth(apiKey),
    'channels',
    { part: 'snippet', ...(query.id ? { id: query.id } : { forHandle: (query.handle ?? '').replace(/^@?/, '@') }) },
  );
  return (data.items ?? []).map((c) => ({
    id: c.id,
    name: c.snippet?.title ?? c.id,
    ...(c.snippet?.customUrl ? { handle: c.snippet.customUrl } : {}),
  }));
}

/** Channels matching a name. */
export async function searchChannels(apiKey: string, q: string, max = 5): Promise<ChannelRef[]> {
  const data = await api<{ items?: Array<{ snippet?: { channelId?: string; channelTitle?: string; title?: string } }> }>(
    keyAuth(apiKey),
    'search',
    { part: 'snippet', type: 'channel', q, maxResults: String(max) },
  );
  return (data.items ?? []).flatMap((i) =>
    i.snippet?.channelId
      ? [{ id: i.snippet.channelId, name: i.snippet.channelTitle ?? i.snippet.title ?? i.snippet.channelId }]
      : [],
  );
}

/** Channels behind the most-viewed recent videos on a topic. */
export async function searchTopicChannels(
  apiKey: string,
  q: string,
  publishedAfter: string,
  max = 25,
): Promise<ChannelRef[]> {
  const seen = new Set<string>();
  const data = await api<{ items?: Array<{ snippet?: { channelId?: string; channelTitle?: string } }> }>(
    keyAuth(apiKey),
    'search',
    { part: 'snippet', type: 'video', q, order: 'viewCount', publishedAfter, maxResults: String(max) },
  );
  return (data.items ?? []).flatMap((i) => {
    const id = i.snippet?.channelId;
    if (!id || seen.has(id)) return [];
    seen.add(id);
    return [{ id, name: i.snippet?.channelTitle ?? id }];
  });
}
