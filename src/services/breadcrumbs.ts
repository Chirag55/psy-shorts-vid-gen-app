import { Directory, File, Paths } from 'expo-file-system';

/**
 * A durable trail of what the app was about to do.
 *
 * A native crash takes the whole process down: no JavaScript error, no stack, no
 * chance for an error boundary to run. Nothing in memory survives, so the only
 * way to learn anything is to have written it to disk *before* the risky call.
 *
 * Each breadcrumb is flushed immediately. On the next launch the app reads the
 * trail back: if the last entry has no matching completion, that is where the
 * process died.
 */

const FILE_NAME = 'breadcrumbs.log';
const MAX_ENTRIES = 60;

export interface Breadcrumb {
  at: number;
  label: string;
  /** False until the matching `finish` lands — an unfinished tail marks the crash. */
  finished: boolean;
}

function trailFile(): File {
  const dir = new Directory(Paths.document, 'diagnostics');
  if (!dir.exists) dir.create({ intermediates: true });
  return new File(dir, FILE_NAME);
}

function readAll(): Breadcrumb[] {
  try {
    const file = trailFile();
    if (!file.exists) return [];
    const parsed = JSON.parse(file.textSync()) as Breadcrumb[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeAll(entries: Breadcrumb[]): void {
  try {
    const file = trailFile();
    if (file.exists) file.delete();
    file.create({ intermediates: true, overwrite: true });
    file.write(JSON.stringify(entries.slice(-MAX_ENTRIES)));
  } catch {
    // Diagnostics must never be the reason something fails.
  }
}

/**
 * Records that a risky step is starting, and returns a function to call when it
 * survived. Writing happens synchronously — an async write would still be
 * queued when the process dies.
 */
export function mark(label: string): () => void {
  const entries = readAll();
  entries.push({ at: Date.now(), label, finished: false });
  writeAll(entries);

  const index = Math.min(entries.length, MAX_ENTRIES) - 1;

  return () => {
    const current = readAll();
    if (current[index]?.label === label) {
      current[index].finished = true;
      writeAll(current);
    }
  };
}

/** Runs `fn` inside a breadcrumb, marking it finished only if it returns. */
export async function traced<T>(label: string, fn: () => Promise<T>): Promise<T> {
  const done = mark(label);
  const result = await fn();
  done();
  return result;
}

export interface CrashReport {
  /** The step that was in flight when the process died. */
  lastUnfinished: Breadcrumb;
  /** Steps that completed before it, most recent last. */
  precedingCompleted: string[];
}

/**
 * Looks for evidence of a previous hard crash.
 *
 * An unfinished entry that is not the one currently running means the process
 * was killed during it — the signature of a native crash rather than a handled
 * error.
 */
export function findPreviousCrash(): CrashReport | null {
  const entries = readAll();
  if (!entries.length) return null;

  const lastUnfinishedIndex = entries.map((e) => e.finished).lastIndexOf(false);
  if (lastUnfinishedIndex === -1) return null;

  return {
    lastUnfinished: entries[lastUnfinishedIndex],
    precedingCompleted: entries
      .slice(Math.max(0, lastUnfinishedIndex - 5), lastUnfinishedIndex)
      .filter((e) => e.finished)
      .map((e) => e.label),
  };
}

/** Clears the trail once a crash has been reported, so it is not shown twice. */
export function clearTrail(): void {
  try {
    const file = trailFile();
    if (file.exists) file.delete();
  } catch {
    // Nothing to do.
  }
}

/** Human-readable summary for the crash notice. */
export function describeCrash(report: CrashReport): string {
  const when = new Date(report.lastUnfinished.at).toLocaleString();
  const preceding = report.precedingCompleted.length
    ? `\n\nSteps that completed first:\n${report.precedingCompleted.map((s) => `• ${s}`).join('\n')}`
    : '';

  return `The app closed unexpectedly during:\n\n${report.lastUnfinished.label}\n\n${when}${preceding}`;
}
