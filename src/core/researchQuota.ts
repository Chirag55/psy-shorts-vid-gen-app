import { BREAKOUT, QUOTA_COST } from './researchConfig';

/**
 * YouTube Data API quota bookkeeping. Google resets the daily quota at
 * midnight US Pacific, so the ledger is keyed by the Pacific date.
 */

export interface QuotaLedger {
  ptDate: string;
  unitsUsed: number;
}

/** 7 during US daylight time (second Sunday of March to first Sunday of November), else 8. */
export function pacificOffsetHours(at: Date): number {
  const y = at.getUTCFullYear();
  const marchFirst = new Date(Date.UTC(y, 2, 1)).getUTCDay();
  const dstStart = Date.UTC(y, 2, 1 + ((7 - marchFirst) % 7) + 7) + 10 * 3600_000;
  const novFirst = new Date(Date.UTC(y, 10, 1)).getUTCDay();
  const dstEnd = Date.UTC(y, 10, 1 + ((7 - novFirst) % 7)) + 9 * 3600_000;
  const t = at.getTime();
  return t >= dstStart && t < dstEnd ? 7 : 8;
}

export function pacificDate(at: Date = new Date()): string {
  return new Date(at.getTime() - pacificOffsetHours(at) * 3600_000).toISOString().slice(0, 10);
}

export function currentLedger(ledger: QuotaLedger | null | undefined, at: Date = new Date()): QuotaLedger {
  const d = pacificDate(at);
  return !ledger || ledger.ptDate !== d ? { ptDate: d, unitsUsed: 0 } : ledger;
}

export function remainingUnits(ledger: QuotaLedger | null | undefined, cap: number, at: Date = new Date()): number {
  return Math.max(0, cap - currentLedger(ledger, at).unitsUsed);
}

/** Search per keyword, video and channel lookups per 50 results, and the breakout scan. */
export function estimateRunUnits(keywords: number): number {
  const pages = Math.ceil((keywords * 50) / 50);
  return (
    keywords * QUOTA_COST.search +
    pages * QUOTA_COST.videos +
    pages * QUOTA_COST.channels +
    BREAKOUT.maxChannels * (QUOTA_COST.playlistItems + QUOTA_COST.videos)
  );
}
