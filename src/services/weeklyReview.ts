import { useStudio } from '@/store';
import { weeklyReview, weeklyRunDue, type ReviewVideo } from '@/core/weeklyReview';
import { getKey, setKey } from './keys';
import { ensureFreshToken, fetchChannel, fetchUploadsPage } from './youtube';
import { refreshAnalytics } from './youtubeAnalytics';
import { runCompetitorScan, runDiscovery } from './competitors';
import { takeDueSnapshots } from './retention';

/** Longest upload the review counts as a Short. */
const SHORT_MAX_SECONDS = 180;

/**
 * Reviews last week's public Shorts against the channel median, stores the
 * report and its avoid list, and files its sequel and long-form ideas as topics.
 */
export async function runWeeklyReview(now: Date = new Date()) {
  const [stored, clientId] = await Promise.all([getKey('youtubeTokens'), getKey('youtubeClientId')]);
  if (!stored || !clientId) throw new Error('Sign in to YouTube in Settings first: the review reads your own analytics.');
  const tokens = await ensureFreshToken(clientId, JSON.parse(stored));
  await setKey('youtubeTokens', JSON.stringify(tokens));
  const auth = { kind: 'oauth' as const, accessToken: tokens.accessToken };
  const channel = await fetchChannel(auth);
  const page = await fetchUploadsPage(auth, channel.uploadsPlaylistId, undefined, 50);
  const shorts = page.videos.filter(
    (v) => v.durationSeconds > 0 && v.durationSeconds <= SHORT_MAX_SECONDS && v.privacyStatus === 'public',
  );
  try {
    const fresh = await refreshAnalytics(tokens.accessToken, shorts, useStudio.getState().analytics, now);
    if (Object.keys(fresh).length) useStudio.getState().mergeAnalytics(fresh);
  } catch {
    // The review works from views alone when analytics are unavailable.
  }
  try {
    await takeDueSnapshots(now);
  } catch {
    // Snapshots are a bonus here.
  }
  const state = useStudio.getState();
  const byVideo = new Map(
    state.projects.filter((p) => p.assets.youtubeVideoId).map((p) => [p.assets.youtubeVideoId as string, p]),
  );
  const rows: ReviewVideo[] = shorts.map((v) => {
    const p = byVideo.get(v.videoId);
    const script: any = p?.mode === 'short' ? p.script : undefined;
    const a = state.analytics[v.videoId];
    const viewedRate = state.weekly.viewedRates[v.videoId];
    return {
      videoId: v.videoId,
      title: v.title,
      hook: script?.beats[0]?.text ?? '',
      publishedAt: v.publishedAt,
      views: v.viewCount,
      ...(a ? { averageViewPercentage: a.averageViewPercentage, subscribersGained: a.subscribersGained } : {}),
      ...(viewedRate === undefined ? {} : { viewedRate }),
      ...(script?.bankV2
        ? { pillar: script.bankV2.pillar, ...(script.bankV2.effect ? { effect: script.bankV2.effect } : {}) }
        : {}),
    };
  });
  const report = weeklyReview(rows, now, state.channelConfig.schedule);
  state.addTopics([
    ...report.sequelIdeas.map((topic: string) => ({ topic, category: 'Sequel idea (weekly review)' })),
    ...report.longformCandidates.map((topic: string) => ({ topic, category: 'Long-form candidate (weekly review)' })),
  ]);
  state.setWeeklyReport(report);
  return report;
}

/** Runs the review once a week, then the competitor scan and discovery when they are six days old. */
export async function runWeeklyReviewIfDue(now: Date = new Date()): Promise<void> {
  const state = useStudio.getState();
  if (!weeklyRunDue(state.weekly.lastWeek, now, state.channelConfig.schedule)) return;
  try {
    await runWeeklyReview(now);
  } catch {
    // The Weekly screen shows the last report and lets the user retry.
  }
  const at = useStudio.getState().weekly.competitorsAt;
  if (at && now.getTime() - new Date(at).getTime() < 518400000) return;
  try {
    await runCompetitorScan(now);
    await runDiscovery(
      useStudio.getState().bank.map((e) => e.title),
      now,
    );
  } catch {
    // Retried next launch.
  }
}
