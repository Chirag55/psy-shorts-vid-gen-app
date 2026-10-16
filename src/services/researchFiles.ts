import { Directory, File, Paths } from 'expo-file-system';
import { RETENTION_DAYS } from '@/core/researchConfig';
import { buildReportMarkdown } from '@/core/researchReport';

/** The research folder (or a folder in it), created on first use. */
function dir(...sub: string[]): Directory {
  const d = new Directory(Paths.document, 'research', ...sub);
  if (!d.exists) d.create({ intermediates: true });
  return d;
}

/** Saves a run as JSON and its report as Markdown; same-day reports are numbered. */
export function saveRun(run: any): { runUri: string; reportUri: string } {
  const json = new File(dir('runs'), `${run.id}.json`);
  json.create({ overwrite: true });
  json.write(JSON.stringify(run));
  const day = run.startedAt.slice(0, 10);
  let report = new File(dir(), `outlier-report-${run.profileId}-${day}.md`);
  for (let n = 2; report.exists; n++) report = new File(dir(), `outlier-report-${run.profileId}-${day}-${n}.md`);
  report.create();
  report.write(buildReportMarkdown(run));
  return { runUri: json.uri, reportUri: report.uri };
}

export function loadRun(uri: string): any | null {
  try {
    const f = new File(uri);
    return f.exists ? JSON.parse(f.textSync()) : null;
  } catch {
    return null;
  }
}

export function deleteRunFiles(entry: { runUri?: string; reportUri?: string }): void {
  for (const uri of [entry.runUri, entry.reportUri]) {
    if (!uri) continue;
    try {
      const f = new File(uri);
      if (f.exists) f.delete();
    } catch {
      // Already gone.
    }
  }
}

export function isExpired(startedAt: string, now: Date = new Date()): boolean {
  return now.getTime() - new Date(startedAt).getTime() > RETENTION_DAYS * 86400000;
}

export function clearResearchFiles(): void {
  try {
    const d = new Directory(Paths.document, 'research');
    if (d.exists) d.delete();
  } catch {
    // Nothing to clear.
  }
}
