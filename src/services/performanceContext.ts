import { buildPerformanceContext, summarisePerformance } from '@/core/performance';
import { hookContext, retentionVideos } from '@/core/retention';
import { describeTitleChanges } from '@/core/metadataUpdate';
import { titleRulesPrompt } from '@/core/titleRules';
import { avoidBlock } from '@/core/weeklyReview';
import { patternHint, patternTable, topPatterns } from '@/core/formatDna';
import { hookLogRows, stayedFeedback } from '@/core/hookLog';
import { getKey, setKey } from './keys';
import {
  ensureFreshToken,
  fetchChannel,
  fetchUploadsPage,
  type StoredTokens,
  type YouTubeAuth,
} from './youtube';
import { refreshAnalytics } from './youtubeAnalytics';
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

/** Title shapes winning among watched channels, for the planner. */
function patternBlock(videos: any[] | undefined, shortsOnly: boolean): string {
  const hint = patternHint(topPatterns(patternTable(videos ?? []), shortsOnly ? 'short' : 'long'));
  return hint ? `\n\n${hint}\n` : '';
}

/** The best and worst opening lines by percentage viewed. */
function hookBlock(projects: any[]): string {
  const hint = hookContext(retentionVideos(projects, 'short'));
  return hint ? `\n\n${hint}\n` : '';
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
    const analytics = useStudio.getState().analytics;

    // Analytics refresh in the background; this prompt uses what is stored.
    if (auth.kind === 'oauth') {
      refreshAnalytics(auth.accessToken, page.videos, analytics)
        .then((fresh) => {
          if (Object.keys(fresh).length) useStudio.getState().mergeAnalytics(fresh);
        })
        .catch(() => {});
    }

    const summary = summarisePerformance(page.videos, { shortsOnly, analytics });
    const views = Object.fromEntries(page.videos.map((v) => [v.videoId, v.viewCount]));
    const state = useStudio.getState();
    return (
      buildPerformanceContext(summary, shortsOnly ? 8 : 4, titleRulesPrompt(state.channelConfig.titles)) +
      (shortsOnly ? stayedFeedback(hookLogRows(useStudio.getState().projects, Date.now())) : '') +
      describeTitleChanges(useStudio.getState().metadataLog, views) +
      avoidBlock(useStudio.getState().weekly.avoid) +
      hookBlock(useStudio.getState().projects) +
      patternBlock(useStudio.getState().weekly.competitorVideos, shortsOnly)
    );
  } catch {
    return '';
  }
}
