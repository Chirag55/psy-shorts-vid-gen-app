import { useStudio } from '@/store';
import { backfillReport, runDueChecks, watchFinished, type ReleaseWatch, type UploadState } from '@/core/publishVerify';
import { getKey, setKey } from './keys';
import { ensureFreshToken, fetchChannel, fetchVideoStates, listAllUploadIds } from './youtube';
import { cancelNotification, notifyAt, notifyNow } from './notifications';

/** Uploads checked first in a backfill, in this order. */
export const BACKFILL_FIRST = ['ctvzHXK_IuQ', 'JpQpI8gAyYU'];

/** The owner's access token, or null when not signed in. */
async function ownerToken(): Promise<string | null> {
  const [stored, clientId] = await Promise.all([getKey('youtubeTokens'), getKey('youtubeClientId')]);
  if (!stored || !clientId) return null;
  const tokens = await ensureFreshToken(clientId, JSON.parse(stored));
  await setKey('youtubeTokens', JSON.stringify(tokens));
  return tokens.accessToken;
}

/** Starts watching a scheduled upload and sets a reminder for just after it goes public. */
export async function watchScheduledRelease(input: {
  videoId: string;
  title: string;
  projectId?: string;
  publicAt: Date;
}): Promise<void> {
  const cfg = useStudio.getState().channelConfig.verification;
  const reminderId = await notifyAt(
    new Date(input.publicAt.getTime() + (cfg.statusCheckMinutes + 1) * 60000),
    `Is "${input.title}" live?`,
    'Tap to check it went public and is being served.',
    { videoId: input.videoId },
  );
  const watch: ReleaseWatch = {
    videoId: input.videoId,
    title: input.title,
    ...(input.projectId ? { projectId: input.projectId } : {}),
    publicAt: input.publicAt.toISOString(),
    done: [],
    alerts: [],
    ...(reminderId ? { reminderId } : {}),
  };
  useStudio.getState().watchRelease(watch);
}

async function doChecks(now: Date): Promise<{ checked: number; alerts: number; skipped?: string }> {
  const state = useStudio.getState();
  const cfg = state.channelConfig.verification;
  const due = (Object.values(state.releaseWatch) as ReleaseWatch[]).filter(
    (w) => !watchFinished(w) && now.getTime() - new Date(w.publicAt).getTime() >= cfg.statusCheckMinutes * 60000,
  );
  if (!due.length) return { checked: 0, alerts: 0 };
  let token: string | null;
  try {
    token = await ownerToken();
  } catch {
    token = null;
  }
  if (!token) return { checked: 0, alerts: 0, skipped: 'Not signed in to YouTube.' };
  const states = new Map(
    (await fetchVideoStates(token, due.map((w) => w.videoId))).map((s) => [s.videoId, s as unknown as UploadState]),
  );
  let alerts = 0;
  for (const w of due) {
    const s: UploadState =
      states.get(w.videoId) ??
      ({ videoId: w.videoId, title: w.title as string, uploadStatus: 'deleted', viewCount: 0 } as UploadState);
    const next = runDueChecks(w, s, now, cfg);
    const fresh = next.done.filter((stage) => !w.done.includes(stage));
    const newAlerts = next.alerts.filter((a) => fresh.includes(a.stage));
    for (const a of newAlerts) await notifyNow(a.title, a.body, { videoId: w.videoId });
    alerts += newAlerts.length;
    if (fresh.includes('status')) await cancelNotification(w.reminderId as string | undefined);
    useStudio.getState().updateReleaseWatch(w.videoId, {
      ...next,
      reminderId: fresh.includes('status') ? undefined : w.reminderId,
    });
  }
  return { checked: due.length, alerts };
}

let inflight: Promise<{ checked: number; alerts: number; skipped?: string }> | undefined;

/** Runs the due checks on watched releases; concurrent calls share one run. */
export function runReleaseChecks(now: Date = new Date()) {
  if (inflight == null) {
    inflight = doChecks(now).finally(() => {
      inflight = undefined;
    });
  }
  return inflight;
}

/** Every upload on the channel that isn't live and on schedule. */
export async function backfillReleases(now: Date = new Date()) {
  const token = await ownerToken();
  if (!token) throw new Error('Sign in to YouTube in Settings first: the check needs the owner view.');
  const channel = await fetchChannel({ kind: 'oauth', accessToken: token });
  const ids = await listAllUploadIds(token, channel.uploadsPlaylistId);
  const order = [...BACKFILL_FIRST.filter((id) => ids.includes(id)), ...ids.filter((id) => !BACKFILL_FIRST.includes(id))];
  const states = await fetchVideoStates(token, order);
  return {
    rows: backfillReport(states as unknown as UploadState[], now, useStudio.getState().channelConfig.verification, BACKFILL_FIRST),
    scanned: states.length,
  };
}

/** Owner-view states for badges; empty when signed out or on any failure. */
export async function fetchStatesForBadges(ids: string[]) {
  if (!ids.length) return [];
  try {
    const token = await ownerToken();
    if (!token) return [];
    return await fetchVideoStates(token, ids);
  } catch {
    return [];
  }
}
