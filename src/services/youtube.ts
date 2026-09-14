import * as AuthSession from 'expo-auth-session';
import { File, UploadType } from 'expo-file-system';

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
