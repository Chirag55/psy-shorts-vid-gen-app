/**
 * Checks a published video's state after release: blocked, still processing,
 * not public, stuck at zero views, or well under the channel's usual.
 */

const MINUTE = 60000;

export type Badge = 'Restricted' | 'Processing' | 'Scheduled' | 'Private' | 'Unlisted' | 'Stuck' | 'Public';
export type WatchStage = 'status' | 'zeroViews' | 'underperform';

export interface UploadState {
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

export interface WatchConfig {
  statusCheckMinutes: number;
  zeroViewsMinutes: number;
  underperformMinutes: number;
  underperformRatio: number;
}

export interface WatchAlert {
  stage: WatchStage;
  level: 'danger' | 'warn' | 'info';
  title: string;
  body: string;
}

export interface ReleaseWatch {
  videoId: string;
  publicAt: string;
  done: WatchStage[];
  lastChecked?: string;
  badge?: Badge;
  alerts: WatchAlert[];
  [key: string]: unknown;
}

export function studioLink(videoId: string): string {
  return `https://studio.youtube.com/video/${videoId}/edit`;
}

const blocked = (s: UploadState) =>
  Boolean(s.rejectionReason || s.failureReason || s.regionRestricted) ||
  s.uploadStatus === 'rejected' ||
  s.uploadStatus === 'failed' ||
  s.uploadStatus === 'deleted' ||
  s.processingStatus === 'failed';

const processing = (s: UploadState) =>
  (s.uploadStatus !== undefined && s.uploadStatus !== 'processed') ||
  (s.processingStatus !== undefined && s.processingStatus !== 'succeeded' && s.processingStatus !== 'terminated');

export function badgeFor(s: UploadState, now: Date, cfg: WatchConfig, publicAt?: Date): Badge {
  if (blocked(s)) return 'Restricted';
  if (processing(s)) return 'Processing';
  if (s.privacyStatus === 'private') return s.publishAt && new Date(s.publishAt) > now ? 'Scheduled' : 'Private';
  if (s.privacyStatus === 'unlisted') return 'Unlisted';
  const since = publicAt ?? (s.publishedAt ? new Date(s.publishedAt) : undefined);
  if (s.viewCount === 0 && since && now.getTime() - since.getTime() >= cfg.zeroViewsMinutes * MINUTE) return 'Stuck';
  return 'Public';
}

export function blockedReason(s: UploadState): string {
  if (s.rejectionReason) return `Rejected: ${s.rejectionReason}.`;
  if (s.failureReason) return `Upload failed: ${s.failureReason}.`;
  if (s.processingStatus === 'failed') return 'Processing failed.';
  if (s.uploadStatus && ['rejected', 'failed', 'deleted'].includes(s.uploadStatus)) return `Upload status: ${s.uploadStatus}.`;
  if (s.regionRestricted) return 'Blocked or allowed only in some countries (region restriction).';
  return '';
}

/** The checks whose time has come and which haven't run yet. */
export function dueStages(watch: ReleaseWatch, now: Date, cfg: WatchConfig): WatchStage[] {
  const minutes = (now.getTime() - new Date(watch.publicAt).getTime()) / MINUTE;
  const out: WatchStage[] = [];
  if (minutes >= cfg.statusCheckMinutes && !watch.done.includes('status')) out.push('status');
  if (minutes >= cfg.zeroViewsMinutes && !watch.done.includes('zeroViews')) out.push('zeroViews');
  if (minutes >= cfg.underperformMinutes && !watch.done.includes('underperform')) out.push('underperform');
  return out;
}

export function checkStage(stage: WatchStage, s: UploadState, cfg: WatchConfig, median?: number): WatchAlert[] {
  const checks = `Open Studio → Content → "${s.title}" → Checks: ${studioLink(s.videoId)}`;
  if (stage === 'status') {
    const out: WatchAlert[] = [];
    if (blocked(s)) {
      out.push({ stage, level: 'danger', title: `Blocked: ${s.title}`, body: `${blockedReason(s)} ${checks}` });
    } else if (processing(s)) {
      out.push({
        stage,
        level: 'warn',
        title: `Still processing: ${s.title}`,
        body: `YouTube hasn't finished processing it (${s.processingStatus ?? s.uploadStatus}). Check again shortly; if it stays like this, ${checks}`,
      });
    }
    if (s.privacyStatus !== 'public') {
      out.push({
        stage,
        level: 'danger',
        title: `Not public yet: ${s.title}`,
        body: `It is ${s.privacyStatus ?? 'not public'}${s.publishAt ? `, scheduled for ${s.publishAt}` : ''}. Check the schedule in Studio: ${studioLink(s.videoId)}`,
      });
    }
    return out;
  }
  if (stage === 'zeroViews') {
    if (s.privacyStatus !== 'public' || s.viewCount !== 0) return [];
    return [
      {
        stage,
        level: 'danger',
        title: `0 views after ${Math.round(cfg.zeroViewsMinutes / 60)}h: ${s.title}`,
        body: `It's public but not being served. ${checks} and Restrictions. Don't delete or re-upload it.`,
      },
    ];
  }
  if (median !== undefined && median > 0 && s.privacyStatus === 'public' && s.viewCount < median * cfg.underperformRatio) {
    return [
      {
        stage,
        level: 'info',
        title: `Underperforming: ${s.title}`,
        body: `${s.viewCount} views at ${Math.round(cfg.underperformMinutes / 60)}h against a channel median of ${Math.round(median)}. Note it for learning; don't delete it.`,
      },
    ];
  }
  return [];
}

/** Runs the checks that are due and records them on the watch. */
export function runDueChecks(
  watch: ReleaseWatch,
  s: UploadState,
  now: Date,
  cfg: WatchConfig,
  median?: number,
): ReleaseWatch {
  const stages = dueStages(watch, now, cfg);
  const alerts = stages.flatMap((stage) => checkStage(stage, s, cfg, median));
  return {
    ...watch,
    done: [...watch.done, ...stages],
    lastChecked: now.toISOString(),
    badge: badgeFor(s, now, cfg, new Date(watch.publicAt)),
    alerts: stages.length ? alerts : watch.alerts,
  };
}

export function watchFinished(watch: { done: string[] }): boolean {
  return ['status', 'zeroViews', 'underperform'].every((s) => watch.done.includes(s));
}

/** Every upload that isn't live and on schedule, with why. */
export function backfillReport(states: UploadState[], now: Date, cfg: WatchConfig, order: string[] = []) {
  const rows: { videoId: string; title: string; badge: Badge; reason: string }[] = [];
  for (const s of states) {
    const badge = badgeFor(s, now, cfg);
    if (badge === 'Public' || badge === 'Scheduled') continue;
    const reason =
      badge === 'Restricted'
        ? blockedReason(s)
        : badge === 'Processing'
          ? `Still processing (${s.processingStatus ?? s.uploadStatus}).`
          : badge === 'Stuck'
            ? `Public with 0 views. Open Studio → Content → Checks / Restrictions: ${studioLink(s.videoId)}`
            : badge === 'Private'
              ? 'Private with no publish time: it will never go public on its own.'
              : 'Unlisted: only people with the link can see it.';
    rows.push({ videoId: s.videoId, title: s.title, badge, reason });
  }
  const rank = (id: string) => (order.includes(id) ? order.indexOf(id) : order.length);
  return rows.sort((a, b) => rank(a.videoId) - rank(b.videoId));
}

/** An uploaded video's state as the checks read it. */
export function stateOfUpload(v: {
  videoId: string;
  title: string;
  privacyStatus?: string;
  scheduledFor?: string;
  publishedAt?: string;
  uploadStatus?: string;
  failureReason?: string;
  rejectionReason?: string;
  processingStatus?: string;
  regionRestricted?: boolean;
  viewCount: number;
}): UploadState {
  return {
    videoId: v.videoId,
    title: v.title,
    privacyStatus: v.privacyStatus,
    ...(v.scheduledFor ? { publishAt: v.scheduledFor } : {}),
    ...(v.publishedAt ? { publishedAt: v.publishedAt } : {}),
    ...(v.uploadStatus ? { uploadStatus: v.uploadStatus } : {}),
    ...(v.failureReason ? { failureReason: v.failureReason } : {}),
    ...(v.rejectionReason ? { rejectionReason: v.rejectionReason } : {}),
    ...(v.processingStatus ? { processingStatus: v.processingStatus } : {}),
    ...(v.regionRestricted ? { regionRestricted: true } : {}),
    viewCount: v.viewCount,
  };
}
