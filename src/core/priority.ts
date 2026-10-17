import { PRIORITY_TACTICS } from './prompts';
import { mergePriority, rankTactics, rankingIsStale, type TacticRow } from './priorities';
import { useStudio } from '../store';

/** The tactics to favour now: the cached ranking, or a fresh one from the channel's Shorts. */
export function currentPriority(now: Date = new Date()): string[] {
  const state = useStudio.getState();
  if (state.tacticRanking && !rankingIsStale(state.tacticRanking, now)) {
    return mergePriority(state.tacticRanking.tactics, PRIORITY_TACTICS);
  }
  const rows = state.projects.flatMap((p): TacticRow[] => {
    const id = p.assets.youtubeVideoId;
    const tactic = p.mode === 'short' ? (p.script as any).tactic : undefined;
    const stats = id ? state.analytics[id] : undefined;
    if (!tactic || !stats) return [];
    return [{ tactic, subscribersGained: stats.subscribersGained, publishedAt: p.assets.publishedAt ?? p.updatedAt }];
  });
  const ranked = rankTactics(rows, now);
  if (ranked.length) state.setTacticRanking({ at: now.getTime(), tactics: ranked });
  return mergePriority(ranked, PRIORITY_TACTICS);
}
