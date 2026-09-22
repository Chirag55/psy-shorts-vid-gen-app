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
const PROGRESS_FILE = 'progress.log';
const MAX_ENTRIES = 60;

export interface Breadcrumb {
  /**
   * Identity of this entry, independent of its position.
   *
   * Position is not usable: the trail is capped, so writing a new entry can
   * shift every older one down by one. Matching on a remembered index meant a
   * completion silently landed on the wrong entry — or on none — leaving
   * finished work recorded as unfinished and reported as a crash that never
   * happened.
   */
  id: number;
  at: number;
  label: string;
  /** False until the matching `finish` lands — an unfinished tail marks the crash. */
  finished: boolean;
}

function diagnosticsDir(): Directory {
  const dir = new Directory(Paths.document, 'diagnostics');
  if (!dir.exists) dir.create({ intermediates: true });
  return dir;
}

function trailFile(): File {
  return new File(diagnosticsDir(), FILE_NAME);
}

/**
 * Position inside a long-running step.
 *
 * A breadcrumb marks a whole step, but "drawing 70 caption frames" is not a
 * precise enough place to die. Appending one trail entry per frame would mean
 * re-serialising the whole log seventy times, so the position is kept in its
 * own small file that is simply overwritten. Cheap enough for the inner loop,
 * and it narrows a crash from a step to an iteration.
 */
let progressFile: File | null = null;

export function noteProgress(detail: string): void {
  try {
    // The handle is cached and the file overwritten in place. This is called
    // once per caption frame, so the directory checks and the delete/create
    // cycle a fresh handle would do are worth avoiding.
    if (!progressFile) {
      progressFile = new File(diagnosticsDir(), PROGRESS_FILE);
      progressFile.create({ intermediates: true, overwrite: true });
    }
    progressFile.write(detail);
  } catch {
    // Diagnostics must never be the reason something fails.
  }
}

function readProgress(): string | null {
  try {
    const file = new File(diagnosticsDir(), PROGRESS_FILE);
    if (!file.exists) return null;
    const text = file.textSync().trim();
    return text.length ? text : null;
  } catch {
    return null;
  }
}

export function clearProgress(): void {
  try {
    progressFile = null;
    const file = new File(diagnosticsDir(), PROGRESS_FILE);
    if (file.exists) file.delete();
  } catch {
    // Nothing to do.
  }
}

function readAll(): Breadcrumb[] {
  try {
    const file = trailFile();
    if (!file.exists) return [];
    const parsed = JSON.parse(file.textSync()) as Breadcrumb[];
    if (!Array.isArray(parsed)) return [];
    // A trail left by an older build has no ids. Give them ones that cannot
    // collide with this run's, so they are still reportable but never matched.
    return parsed.map((e, i) => (typeof e.id === 'number' ? e : { ...e, id: -1 - i }));
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

let nextId = Date.now();

/**
 * Records that a risky step is starting, and returns a function to call when it
 * survived. Writing happens synchronously — an async write would still be
 * queued when the process dies.
 */
export function mark(label: string): () => void {
  const id = nextId++;
  const entries = readAll();
  entries.push({ id, at: Date.now(), label, finished: false });
  writeAll(entries);

  let settled = false;

  return () => {
    // Calling the finish function twice must not rewrite the trail, and must
    // never resurrect an entry that truncation has already dropped.
    if (settled) return;
    settled = true;

    const current = readAll();
    const entry = current.find((e) => e.id === id);
    if (entry && !entry.finished) {
      entry.finished = true;
      writeAll(current);
    }
  };
}

/**
 * Runs `fn` inside a breadcrumb.
 *
 * The entry is closed whether `fn` returns or throws, because a thrown error is
 * proof the process survived — that is an ordinary failure with a message, not
 * the silent death this trail exists to catch. Leaving it open would report a
 * handled error as a crash.
 */
export async function traced<T>(label: string, fn: () => Promise<T>): Promise<T> {
  const done = mark(label);
  try {
    return await fn();
  } finally {
    done();
  }
}

export interface CrashReport {
  /** The step that was in flight when the process died. */
  lastUnfinished: Breadcrumb;
  /** Steps that completed before it, most recent last. */
  precedingCompleted: string[];
  /** How far into that step it had got, when the step reports its position. */
  progress?: string;
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
    progress: readProgress() ?? undefined,
  };
}

/**
 * The whole trail, oldest first.
 *
 * `describeCrash` deliberately summarises, but a summary that filters to
 * completed steps hides the unfinished ones — which are the only interesting
 * entries when diagnosing a death. This is what gets copied to the clipboard.
 */
export function readTrail(): Breadcrumb[] {
  return readAll();
}

/** Renders the full trail as text, marking where each step got to. */
export function formatTrail(entries: Breadcrumb[]): string {
  if (!entries.length) return '(no steps recorded)';
  return entries
    .map((e) => {
      const time = new Date(e.at).toLocaleTimeString();
      return `${e.finished ? 'ok  ' : 'DIED'} ${time}  ${e.label}`;
    })
    .join('\n');
}

/** Clears the trail once a crash has been reported, so it is not shown twice. */
export function clearTrail(): void {
  try {
    const file = trailFile();
    if (file.exists) file.delete();
  } catch {
    // Nothing to do.
  }
  clearProgress();
}

/** Human-readable summary for the crash notice. */
export function describeCrash(report: CrashReport): string {
  const when = new Date(report.lastUnfinished.at).toLocaleString();
  const preceding = report.precedingCompleted.length
    ? `\n\nSteps that completed first:\n${report.precedingCompleted.map((s) => `• ${s}`).join('\n')}`
    : '';

  const progress = report.progress ? `\n\nReached: ${report.progress}` : '';

  return `The app closed unexpectedly during:\n\n${report.lastUnfinished.label}${progress}\n\n${when}${preceding}`;
}
