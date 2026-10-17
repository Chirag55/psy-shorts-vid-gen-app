import { pinnedCommentOf } from '@/core/pinnedComment';
import type { Project } from '@/core/types';
import { useStudio } from '@/store';
import { postComment } from './youtube';

/** Posts the bank's comment under the uploaded video once; YouTube's API can't pin it, so that stays manual. */
export async function postPinnedComment(
  token: string,
  project: Project,
  videoId: string,
): Promise<{ posted: boolean; error?: string }> {
  const text = pinnedCommentOf(project.script);
  if (!text || project.commentPosted) return { posted: false };
  try {
    await postComment(token, videoId, text);
    useStudio.getState().updateProject(project.id, { commentPosted: true });
    return { posted: true };
  } catch (e) {
    return { posted: false, error: e instanceof Error ? e.message : String(e) };
  }
}
