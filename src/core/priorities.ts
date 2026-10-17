/** A tactic needs this many Shorts before its average counts. */
export const MIN_SHORTS_PER_TACTIC = 2;
/** Only Shorts published in this window are ranked. */
export const RANKING_WINDOW_DAYS = 90;
/** How often the ranking is recomputed. */
export const RERANK_EVERY_DAYS = 30;

const DAY_MS = 86400000;

export interface TacticRow {
  tactic: string;
  subscribersGained: number;
  publishedAt: number;
}

export interface TacticRanking {
  at: number;
  tactics: string[];
}

function normalise(tactic: string): string {
  return tactic.trim().toLowerCase();
}

/** Tactics ordered by average subscribers gained per Short, over the last 90 days. */
export function rankTactics(rows: TacticRow[], now: Date = new Date()): string[] {
  const cutoff = now.getTime() - RANKING_WINDOW_DAYS * DAY_MS;
  const byTactic = new Map<string, { name: string; subs: number[] }>();
  for (const row of rows) {
    if (!row.tactic.trim() || row.publishedAt < cutoff) continue;
    const key = normalise(row.tactic);
    let entry = byTactic.get(key);
    if (entry == null) {
      entry = { name: row.tactic.trim(), subs: [] };
      byTactic.set(key, entry);
    }
    entry.subs.push(row.subscribersGained);
  }
  return [...byTactic.values()]
    .filter((t) => t.subs.length >= MIN_SHORTS_PER_TACTIC)
    .map((t) => ({ name: t.name, avg: t.subs.reduce((a, b) => a + b, 0) / t.subs.length }))
    .sort((a, b) => b.avg - a.avg)
    .map((t) => t.name);
}

/** The ranked tactics first, topped up from the fallback list, without repeats. */
export function mergePriority(ranked: string[], fallback: string[], max = 5): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const tactic of [...ranked, ...fallback]) {
    const key = normalise(tactic);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(tactic);
    if (out.length >= max) break;
  }
  return out;
}

export function rankingIsStale(ranking: TacticRanking | null | undefined, now: Date = new Date()): boolean {
  return !ranking || now.getTime() - ranking.at >= RERANK_EVERY_DAYS * DAY_MS;
}
