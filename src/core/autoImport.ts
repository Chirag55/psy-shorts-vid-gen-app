/**
 * Auto-import of the bundled topic bank: re-run only when the bank text or
 * the accepted conditional Shorts change. Rebuilt from 6.1.13.
 */
import { importReport } from './importReport';
import { fnv1a } from './researchLayer2';
import { parseBankMarkdown, planImport, type ImportPlan } from './topicBank';

export interface AutoImportRecord {
  hash: string;
  at: number;
  lines: string[];
  conditional: ImportPlan['conditional'];
  rejected: string[];
  seen: boolean;
}

export function bankHash(md: string): string {
  return fnv1a(md.replace(/\r\n/g, '\n'));
}

/** The import to apply, or null when this bank and these answers were already imported. */
export function planAutoImport(
  md: string,
  bank: any[],
  bankMeta: any,
  previous: AutoImportRecord | null | undefined,
  accepted: string[],
  now: number,
  neutralTerms: string[] = [],
): { plan: ImportPlan; record: AutoImportRecord } | null {
  const hash = `${fnv1a(md.replace(/\r\n/g, '\n'))}:${[...accepted].sort().join(',')}`;
  if (previous && previous.hash === hash) return null;
  const parsed = parseBankMarkdown(md, now);
  const plan = planImport(bank, parsed, bankMeta, now, { accept: accepted });
  const report = importReport(parsed, plan, { neutralTerms });
  return {
    plan,
    record: {
      hash,
      at: now,
      lines: report.lines,
      conditional: plan.conditional,
      rejected: plan.rejected.map((r) => r.reason),
      seen: false,
    },
  };
}
