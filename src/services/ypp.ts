import { useStudio } from '@/store';
import { readYppSnapshot, snapshotStale, type YppSnapshot } from '@/core/ypp';
import { getKey, setKey } from './keys';
import { ensureFreshToken, fetchChannel } from './youtube';
import { AnalyticsError, report } from './youtubeAnalytics';

async function ownerToken(): Promise<string> {
  const [stored, clientId] = await Promise.all([getKey('youtubeTokens'), getKey('youtubeClientId')]);
  if (!stored || !clientId) {
    throw new Error('Sign in to YouTube in Settings first: the dashboard reads your own channel.');
  }
  const tokens = await ensureFreshToken(clientId, JSON.parse(stored));
  await setKey('youtubeTokens', JSON.stringify(tokens));
  return tokens.accessToken;
}

/** Reads the monetisation-progress snapshot from the owner's analytics and stores it. */
export async function refreshYpp(now: Date = new Date()): Promise<YppSnapshot> {
  const token = await ownerToken();
  const channel = await fetchChannel({ kind: 'oauth', accessToken: token });
  const snapshot = await readYppSnapshot(
    (params) => report(token, params),
    channel.subscriberCount,
    now,
    (e) => e instanceof AnalyticsError && (e.kind === 'reauth' || e.kind === 'enable-api'),
  );
  useStudio.getState().setYppSnapshot(snapshot);
  return snapshot;
}

/** Refreshes at most once a day, quietly. */
export async function refreshYppIfStale(now: Date = new Date()): Promise<void> {
  try {
    if (!snapshotStale(useStudio.getState().ypp.snapshot, now)) return;
    await refreshYpp(now);
  } catch {
    // The dashboard shows the last snapshot and its age.
  }
}
