import * as AuthSession from 'expo-auth-session';
import { File, UploadType } from 'expo-file-system';
import { parseIso8601Duration, pickThumbnail, type UploadedVideo } from '@/core/youtubeLibrary';

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
];

export class YouTubeError extends Error {}

export interface StoredTokens {
  accessToken: string;
  refreshToken?: string;
  /** Epoch milliseconds. */
  expiresAt: number;
}

/** Android OAuth clients use a reverse-DNS redirect rather than a loopback URI. */
export function redirectUri(androidClientId: string): string {
  const reversed = androidClientId.split('.').reverse().join('.');
  return `${reversed}:/oauthredirect`;
}

export async function authorize(androidClientId: string): Promise<StoredTokens> {
  const redirect = redirectUri(androidClientId);

  const request = new AuthSession.AuthRequest({
    clientId: androidClientId,
    scopes: YOUTUBE_SCOPES,
    redirectUri: redirect,
    responseType: AuthSession.ResponseType.Code,
    usePKCE: true,
    extraParams: { access_type: 'offline', prompt: 'consent' },
  });

  const result = await request.promptAsync(DISCOVERY);

  if (result.type !== 'success' || !result.params.code) {
    throw new YouTubeError(
      result.type === 'error' ? String(result.params.error_description ?? result.params.error) : 'Sign-in was cancelled.'
    );
  }

  const token = await AuthSession.exchangeCodeAsync(
    {
      clientId: androidClientId,
      code: result.params.code,
      redirectUri: redirect,
      extraParams: { code_verifier: request.codeVerifier ?? '' },
    },
    DISCOVERY
  );

  return {
    accessToken: token.accessToken,
    refreshToken: token.refreshToken,
    expiresAt: Date.now() + (token.expiresIn ?? 3600) * 1000,
  };
}

/** Refreshes 60s early so a long upload cannot start on a token that expires mid-flight. */
export async function ensureFreshToken(androidClientId: string, tokens: StoredTokens): Promise<StoredTokens> {
  if (Date.now() < tokens.expiresAt - 60_000) return tokens;
  if (!tokens.refreshToken) throw new YouTubeError('Session expired and there is no refresh token. Sign in again.');

  const refreshed = await AuthSession.refreshAsync(
    { clientId: androidClientId, refreshToken: tokens.refreshToken },
    DISCOVERY
  );

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
  onProgress?: (fraction: number) => void
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
          tags: meta.tags.slice(0, 30),
          categoryId: meta.categoryId ?? '27', // Education
        },
        status: { privacyStatus: meta.privacyStatus, selfDeclaredMadeForKids: false },
      }),
    }
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

/** Attaches a custom thumbnail. Requires a channel verified for custom thumbnails. */
export async function setThumbnail(accessToken: string, videoId: string, imageUri: string): Promise<void> {
  const file = new File(imageUri);
  if (!file.exists) throw new YouTubeError('Thumbnail file is missing.');

  const result = await file.upload(
    `https://www.googleapis.com/upload/youtube/v3/thumbnails/set?videoId=${encodeURIComponent(videoId)}`,
    {
      httpMethod: 'POST',
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'image/png' },
      uploadType: UploadType.BINARY_CONTENT,
    }
  );

  if (result.status < 200 || result.status >= 300) {
    throw new YouTubeError(
      `Thumbnail rejected (${result.status}). Custom thumbnails need a verified channel.`
    );
  }
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
 *
 * Both are supported because they suit different moments: an API key is two
 * minutes of setup to start browsing, OAuth is required before publishing
 * anyway.
 */
export type YouTubeAuth =
  | { kind: 'oauth'; accessToken: string }
  | { kind: 'apiKey'; apiKey: string; channelId: string };

async function api<T>(auth: YouTubeAuth, path: string, params: Record<string, string>): Promise<T> {
  const query = new URLSearchParams(
    auth.kind === 'apiKey' ? { ...params, key: auth.apiKey } : params
  ).toString();

  const res = await fetch(`${API}/${path}?${query}`, {
    headers: auth.kind === 'oauth' ? { Authorization: `Bearer ${auth.accessToken}` } : {},
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => '');

    if (res.status === 403 && detail.includes('quotaExceeded')) {
      throw new YouTubeError('YouTube API quota exhausted for today. It resets at midnight Pacific.');
    }
    if (res.status === 403 && auth.kind === 'apiKey') {
      throw new YouTubeError(
        'YouTube rejected the API key. Check that the YouTube Data API v3 is enabled for it, and that any key restrictions allow this app.'
      );
    }
    throw new YouTubeError(`YouTube ${res.status}: ${detail.slice(0, 300) || res.statusText}`);
  }
  return (await res.json()) as T;
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

/**
 * Resolves the signed-in channel and its uploads playlist.
 *
 * Every upload a channel has ever made lives in one auto-maintained playlist,
 * and paging that is far cheaper in quota than search.list — 1 unit per page
 * against 100 per search.
 */
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
    // An API key has no notion of "me", so the channel must be named outright.
    ...(auth.kind === 'oauth' ? { mine: 'true' } : { id: auth.channelId }),
  });

  const channel = data.items?.[0];
  if (!channel) {
    throw new YouTubeError(
      auth.kind === 'oauth'
        ? 'This Google account has no YouTube channel.'
        : 'No channel found for that ID. It should look like UCxxxxxxxxxxxxxxxxxxxxxx.'
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

/**
 * Fetches one page of uploads with full details.
 *
 * playlistItems.list gives ids and snippets but neither duration nor stats, so
 * a single batched videos.list follows — one call for the whole page rather than
 * one per video, which matters against a 10,000 unit daily quota.
 */
export async function fetchUploadsPage(
  auth: YouTubeAuth,
  uploadsPlaylistId: string,
  pageToken?: string,
  pageSize = 25
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

  const details = await api<{
    items?: Array<{
      id: string;
      snippet?: {
        title?: string;
        description?: string;
        publishedAt?: string;
        thumbnails?: Record<string, { url?: string }>;
      };
      contentDetails?: { duration?: string };
      statistics?: { viewCount?: string; likeCount?: string; commentCount?: string };
      status?: { privacyStatus?: string };
    }>;
  }>(auth, 'videos', {
    // `status` is only meaningful with OAuth; an API key sees public videos only.
    part: 'snippet,contentDetails,statistics,status',
    id: ids.join(','),
  });

  const videos: UploadedVideo[] = (details.items ?? []).map((item) => ({
    videoId: item.id,
    title: item.snippet?.title ?? '(untitled)',
    description: item.snippet?.description ?? '',
    publishedAt: item.snippet?.publishedAt ?? '',
    thumbnailUrl: pickThumbnail(item.snippet?.thumbnails),
    durationSeconds: parseIso8601Duration(item.contentDetails?.duration ?? ''),
    viewCount: Number(item.statistics?.viewCount ?? 0),
    likeCount: Number(item.statistics?.likeCount ?? 0),
    commentCount: Number(item.statistics?.commentCount ?? 0),
    privacyStatus: item.status?.privacyStatus ?? 'public',
  }));

  // videos.list does not guarantee the order ids were passed in, so restore the
  // playlist's newest-first ordering.
  const order = new Map(ids.map((id, i) => [id, i]));
  videos.sort((a, b) => (order.get(a.videoId) ?? 0) - (order.get(b.videoId) ?? 0));

  return { videos, nextPageToken: playlist.nextPageToken };
}
