import { longFormCues, toSrt } from '@/core/captionsFile';
import { playlistTitlesFor } from '@/core/playlists';
import type { Project } from '@/core/types';
import { useStudio } from '@/store';
import { addToPlaylist, findOrCreatePlaylist, insertCaption } from './youtube';

/**
 * After a long-form upload: the caption track, then the playlists. Each step is
 * recorded on the project so a retry only does what is still missing.
 */
export async function finishLongUpload(
  token: string,
  project: Project,
  videoId: string,
  durations?: Record<string, number>,
): Promise<{ done: string[]; errors: string[] }> {
  const done: string[] = [];
  const errors: string[] = [];
  const { updateProject } = useStudio.getState();
  const script: any = project.script;

  if (!project.captionsUploaded) {
    const cues = longFormCues(script, project.assets.alignment as any, durations);
    if (!cues.length) {
      errors.push('Captions: there is no voice timing to build them from. Synthesise the voice first.');
    } else {
      try {
        await insertCaption(token, videoId, toSrt(cues));
        updateProject(project.id, { captionsUploaded: true });
        done.push(`captions (${cues.length} lines)`);
      } catch (e) {
        errors.push(e instanceof Error ? e.message : String(e));
      }
    }
  }

  const titles = playlistTitlesFor(
    script.bankV2?.formatType,
    script.bankV2?.pillar,
    useStudio.getState().settings.playlistNames,
  );
  const added = [...(project.playlistsAdded ?? [])];
  for (const title of titles.filter((t) => !added.includes(t))) {
    try {
      const playlistId = await findOrCreatePlaylist(token, title);
      await addToPlaylist(token, playlistId, videoId);
      added.push(title);
      done.push(`playlist "${title}"`);
    } catch (e) {
      errors.push(e instanceof Error ? e.message : String(e));
    }
  }
  if (added.length !== (project.playlistsAdded ?? []).length) {
    updateProject(project.id, { playlistsAdded: added });
  }
  return { done, errors };
}

/** True when a published long-form video still lacks its captions or a playlist. */
export function longUploadPending(project: Project): boolean {
  if (project.mode !== 'long' || !project.assets.youtubeVideoId) return false;
  const script: any = project.script;
  const titles = playlistTitlesFor(
    script.bankV2?.formatType,
    script.bankV2?.pillar,
    useStudio.getState().settings.playlistNames,
  );
  return !project.captionsUploaded || titles.some((t) => !(project.playlistsAdded ?? []).includes(t));
}
