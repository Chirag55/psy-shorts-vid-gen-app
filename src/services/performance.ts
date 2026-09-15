import { buildPerformanceContext, summarisePerformance } from '@/core/performanceContext';
import { getKey, setKey } from './keys';
import {
  ensureFreshToken,
  fetchChannel,
  fetchUploadsPage,
  type StoredTokens,
  type YouTubeAuth,
} from './youtube';
import { useStudio } from '@/store';

/**
 * Resolves whichever YouTube credential is available.
 *
 * OAuth first — it sees unlisted and private uploads too. An API key is the
 * no-sign-in fallback and needs the channel named explicitly.
 */
export async function resolveYouTubeAuth(): Promise<YouTubeAuth | null> {
  const [raw, clientId] = await Promise.all([getKey('youtubeTokens'), getKey('youtubeClientId')]);

  if (raw && clientId) {
    try {
      const fresh = await ensureFreshToken(clientId, JSON.parse(raw) as StoredTokens);
      await setKey('youtubeTokens', JSON.stringify(fresh));
      return { kind: 'oauth', accessToken: fresh.accessToken };
    } catch {
      // Expired refresh token — fall through to the API key rather than failing.
    }
  }

  const apiKey = await getKey('youtubeApiKey');
  const channelId = useStudio.getState().settings.youtubeChannelId;
  if (apiKey && channelId) return { kind: 'apiKey', apiKey, channelId };

  return null;
}

/**
 * Builds the channel-performance prompt suffix, or an empty string.
 *
 * Deliberately never throws: this is an enhancement to generation, and a
 * YouTube outage or an exhausted quota must not stop a script being written.
 */
export async function fetchPerformanceContext(shortsOnly: boolean): Promise<string> {
  try {
    if (!useStudio.getState().settings.usePerformanceContext) return '';

    const auth = await resolveYouTubeAuth();
    if (!auth) return '';

    const channel = await fetchChannel(auth);
    const page = await fetchUploadsPage(auth, channel.uploadsPlaylistId, undefined, 25);

    const summary = summarisePerformance(page.videos, { shortsOnly });
    return buildPerformanceContext(summary);
  } catch {
    return '';
  }
}
