/** Per-keyword outlier hit rates across research runs, newest first, ten per keyword. */

export interface HistoryEntry {
  runId: string;
  at: string;
  rate: number;
}

export type KeywordHistory = Record<string, HistoryEntry[]>;

const MAX_PER_KEYWORD = 10;

export function normalizeHistory(raw: unknown): KeywordHistory {
  const out: KeywordHistory = {};
  if (!raw || typeof raw !== 'object') return out;
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (!Array.isArray(v)) continue;
    const list = v.filter((e) => !!e && typeof e === 'object' && typeof e.runId === 'string' && typeof e.rate === 'number');
    if (list.length) out[k] = list;
  }
  return out;
}

export function recordRun(history: KeywordHistory, runId: string, at: string, rates: Record<string, number>): KeywordHistory {
  const out: KeywordHistory = { ...history };
  for (const [kw, rate] of Object.entries(rates)) {
    const list = out[kw] ?? [];
    out[kw] = [{ runId, at, rate }, ...list.filter((e) => e.runId !== runId)]
      .sort((a, b) => b.at.localeCompare(a.at))
      .slice(0, MAX_PER_KEYWORD);
  }
  return out;
}

interface RunLike {
  id: string;
  startedAt: string;
  status: string;
  replayOf?: string;
  keywordStats: { keyword: string; searched?: boolean; hitRate?: number; found?: number; outliers?: number }[];
}

/** Rebuilds history from stored runs (complete or quota-partial, never replays). */
export function historyFromRuns(runs: RunLike[]): KeywordHistory {
  let h: KeywordHistory = {};
  for (const run of runs) {
    if (run.replayOf || !['complete', 'partial_quota'].includes(run.status)) continue;
    const rates = Object.fromEntries(
      run.keywordStats
        .filter((s) => s.searched)
        .map((s) => [s.keyword, s.hitRate ?? (s.found ? (s.outliers ?? 0) / s.found : 0)]),
    );
    h = recordRun(h, run.id, run.startedAt, rates);
  }
  return h;
}

export function mergeHistories(a: KeywordHistory, b: KeywordHistory): KeywordHistory {
  let out = a;
  for (const [kw, list] of Object.entries(b)) {
    for (const e of list) out = recordRun(out, e.runId, e.at, { [kw]: e.rate });
  }
  return out;
}

/** The keyword's rate in the latest earlier run, ignoring the given runs. */
export function previousRate(history: KeywordHistory, keyword: string, before: string, excludeRunIds: string[]): number | undefined {
  return (history[keyword] ?? []).find((e) => !excludeRunIds.includes(e.runId) && e.at < before)?.rate;
}

/** Keywords whose latest rate clears `minRate`, best first. */
export function workingKeywords(history: KeywordHistory, minRate: number): string[] {
  return Object.entries(history)
    .map(([keyword, list]) => ({ keyword, rate: list[0]?.rate ?? 0 }))
    .filter((r) => r.rate >= minRate)
    .sort((a, b) => b.rate - a.rate)
    .map((r) => r.keyword);
}
