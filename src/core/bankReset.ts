import type { Project } from './types';

/**
 * When a new topic bank replaces the old one, in-progress (unpublished) projects for
 * entries that were rewritten lose their stale voice and render so they get remade.
 */
export function resetProjectsForBank(projects: Project[], changedIds: Iterable<string>, at: number): { projects: Project[]; reset: Project[] } {
  const changed = new Set(changedIds);
  const reset: Project[] = [];
  const next = projects.map((p) => {
    if (!p.bankEntryId || !changed.has(p.bankEntryId) || p.assets.youtubeVideoId) return p;
    const q: Project = {
      ...p,
      review: undefined,
      bankReset: { at },
      assets: { ...p.assets, audio: {}, alignment: {}, segments: {}, finalVideo: undefined, renderInfo: undefined },
    };
    reset.push(q);
    return q;
  });
  return { projects: next, reset };
}

export function resetLines(reset: Project[]): string[] {
  return reset.map((p) => `${p.bankEntryId}: "${p.publish.title || p.script.title}" was in progress; its old voice and render were discarded. Make it again from the bank.`);
}
