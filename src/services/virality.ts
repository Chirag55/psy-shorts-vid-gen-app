import { auditLong, auditShort } from '@/core/virality';
import { longAuditInput, shortAuditInput } from '@/core/viralityInput';
import { pauseSeconds } from '@/core/screenplayPlan';
import type { ChannelConfig } from '@/core/channelConfig';
import type { Project } from '@/core/types';
import { detectSilences, probeDuration } from './ffmpeg';

/** Audits a Short from its rendered media: duration, silences, card and overlays. */
export async function auditShortProject(
  project: Project,
  ctx: { channelConfig: ChannelConfig; settings: { includeCaptions: boolean; includeMascot: boolean } },
) {
  const audio = project.assets.audio.short;
  const words = project.assets.alignment.short ?? [];
  const audioSeconds = audio ? await probeDuration(audio) : 0;
  const videoSeconds = project.assets.finalVideo ? await probeDuration(project.assets.finalVideo) : 0;
  const silences = audio ? await detectSilences(audio, ctx.channelConfig.hook.silenceThresholdDb, 0.2) : null;
  return auditShort(
    shortAuditInput(project, {
      durationSeconds: videoSeconds || audioSeconds || (words.length ? words[words.length - 1].end : 0),
      silences: silences ?? undefined,
      hookCardSeconds: ctx.channelConfig.hook.cardSeconds,
      captionsOn: ctx.settings.includeCaptions,
      mascotOn: ctx.settings.includeMascot,
    }),
  );
}

/** Audits a long video from each chapter's voiceover length plus its planned pauses. */
export async function auditLongProject(
  project: Project,
  ctx: { durations?: Record<string, number>; feederShorts: number },
) {
  const durations: Record<string, number> = { ...(ctx.durations ?? {}) };
  for (const ch of (project.script as any).chapters) {
    const key = String(ch.index);
    if (durations[key]) continue;
    const audio = project.assets.audio[key];
    const words = project.assets.alignment[key] ?? [];
    const probed = audio ? await probeDuration(audio) : 0;
    durations[key] = (probed || (words.length ? words[words.length - 1].end : 0)) + pauseSeconds(ch.cues);
  }
  return auditLong(longAuditInput(project, { durations, feederShorts: ctx.feederShorts }));
}
