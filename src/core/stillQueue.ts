/** What one generated still costs on the paid image tier. */
export const STILL_COST_USD = 0.039;
/** Gap between image requests, to stay under the per-minute limit. */
export const PACE_MS = 7500;
/** Wait before the one retry of a failed still. */
export const RETRY_AFTER_MS = 15000;

export interface StillShot {
  key: string;
  kind: string;
  prompt?: string;
  reuse?: unknown;
  text: string;
}

export interface StillJob {
  key: string;
  prompt: string;
}

export type StillQueueStatus = 'idle' | 'running' | 'paused' | 'blocked' | 'done';

export interface StillQueue {
  projectId: string;
  keys: string[];
  done: string[];
  failed: Record<string, string>;
  status: StillQueueStatus;
  message?: string;
  updatedAt: number;
}

export type StillFailureKind = 'auth' | 'unavailable' | 'quota' | 'other';

/** Stills still to make: new pictures with a prompt and no file yet. */
export function stillJobs(shots: StillShot[], done: Record<string, string | undefined>): StillJob[] {
  return shots
    .filter((s) => s.kind === 'still' && !s.reuse && s.prompt && !done[s.key])
    .map((s) => ({ key: s.key, prompt: s.prompt as string }));
}

export function costLine(n: number): string {
  const cost = Math.round(n * STILL_COST_USD * 100) / 100;
  return `${n} still${n === 1 ? '' : 's'} = about $${cost.toFixed(2)}`;
}

export function newQueue(projectId: string, jobs: StillJob[], at: number): StillQueue {
  return { projectId, keys: jobs.map((j) => j.key), done: [], failed: {}, status: 'idle', updatedAt: at };
}

export function remaining(q: StillQueue): string[] {
  return q.keys.filter((k) => !q.done.includes(k) && !q.failed[k]);
}

/** Failures that stop the whole queue, as against a single picture. */
export function failureKind(message: string): StillFailureKind {
  if (/key was rejected|check it in Settings/i.test(message)) return 'auth';
  if (/not included in the free tier|limit of 0|is not available on this key|Load image models/i.test(message)) {
    return 'unavailable';
  }
  if (/free image quota|resets at midnight|quota/i.test(message)) return 'quota';
  return 'other';
}

/** The queue after one job: a success, a first failure (retried), a second failure, or a blocking error. */
export function afterJob(
  q: StillQueue,
  key: string,
  result: { ok: boolean; message?: string; second?: boolean },
  at: number,
): StillQueue {
  if (result.ok) {
    const done = [...q.done, key];
    const left = q.keys.filter((k) => !done.includes(k) && !q.failed[k]);
    const failedCount = Object.keys(q.failed).length;
    const finished = failedCount
      ? `${done.length} made, ${failedCount} could not be made: ${Object.values(q.failed)[0]}`
      : 'All the pictures are made';
    return {
      ...q,
      done,
      status: left.length ? q.status : 'done',
      message: left.length ? `${done.length} of ${q.keys.length} made` : finished,
      updatedAt: at,
    };
  }
  const message = result.message ?? '';
  if (failureKind(message) !== 'other') return { ...q, status: 'blocked', message, updatedAt: at };
  if (!result.second) return { ...q, updatedAt: at };
  const failed = { ...q.failed, [key]: message };
  const left = q.keys.filter((k) => !q.done.includes(k) && !failed[k]);
  return {
    ...q,
    failed,
    status: left.length ? q.status : 'done',
    message: left.length ? q.message : `${Object.keys(failed).length} could not be made: ${message}`,
    updatedAt: at,
  };
}

/** The prompts to make the stills by hand, numbered in import order. */
export function promptsFile(shots: StillShot[], slug: string): { fileName: string; text: string } {
  const stills = shots.filter((s) => s.kind === 'still' && !s.reuse);
  const width = String(stills.length).length < 2 ? 2 : String(stills.length).length;
  const name = (i: number) => `${String(i + 1).padStart(width, '0')}.png`;
  const blocks = stills.map(
    (s, i) => `${name(i)}\n${s.prompt}\n(covers: ${s.text.slice(0, 90)}${s.text.length > 90 ? '…' : ''})`,
  );
  const head =
    `${stills.length} stills for ${slug}. Make them in this order and save each under the filename above it; then use "Import the next ... in order" in the app, picking them in the same order.\n` +
    'Every moment that reuses a picture is covered by it with its own zoom or pan: nothing else is to be made.';
  return { fileName: `${slug}-still-prompts.txt`, text: `${head}\n\n${blocks.join('\n\n')}\n` };
}
