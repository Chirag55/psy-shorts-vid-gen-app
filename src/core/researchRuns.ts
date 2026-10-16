import { historyFromRuns, mergeHistories, normalizeHistory, type KeywordHistory } from './researchHistory';
import { loadRun } from '@/services/researchFiles';

/** The last 20 saved runs of a profile, oldest first; re-scored copies left out. */
function savedRuns(history: any[], profileId: string): any[] {
  return history
    .filter((r) => r.profileId === profileId && r.runUri && !r.id.includes('-rescored-'))
    .slice(0, 20)
    .map((r) => loadRun(r.runUri))
    .filter((r) => Boolean(r) && !r.replayOf)
    .sort((a, b) => a.startedAt.localeCompare(b.startedAt));
}

/** Keyword hit rates from the stored history and the saved runs together. */
export function keywordHistoryFor(stored: unknown, history: any[], profileId: string): KeywordHistory {
  return mergeHistories(normalizeHistory(stored), historyFromRuns(savedRuns(history, profileId)));
}

/** Every video a profile's earlier runs qualified, optionally only runs started before a time. */
export function seenBefore(history: any[], profileId: string, before?: string): Set<string> {
  const ids = new Set<string>();
  for (const run of savedRuns(history, profileId)) {
    if (before && run.startedAt >= before) continue;
    for (const id of (run.qualifiedIds ?? run.outliers.map((o: any) => o.videoId)) as string[]) ids.add(id);
  }
  return ids;
}
