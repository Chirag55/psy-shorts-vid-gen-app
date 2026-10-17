import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';

import { useStudio } from '@/store';
import {
  afterJob,
  newQueue,
  PACE_MS,
  promptsFile,
  remaining,
  RETRY_AFTER_MS,
  stillJobs,
  type StillQueue,
} from '@/core/stillQueue';
import { getKey } from './keys';
import { generateStill } from './imagen';

/** One controller per project with a queue running. */
const running = new Map<string, AbortController>();

export function isQueueRunning(projectId: string): boolean {
  return running.has(projectId);
}

function wait(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (signal.aborted) {
      resolve();
      return;
    }
    const timer = setTimeout(resolve, ms);
    signal.addEventListener(
      'abort',
      () => {
        clearTimeout(timer);
        resolve();
      },
      { once: true },
    );
  });
}

function visualsOf(projectId: string) {
  const project = useStudio.getState().projects.find((p) => p.id === projectId);
  const visuals: any[] =
    project?.script.mode !== 'long' ? [] : (project.script as any).chapters.flatMap((c: any) => c.visuals ?? []);
  return { project, visuals };
}

/**
 * Makes a long video's stills one at a time, paced under the per-minute limit,
 * retrying each failure once. Resumes a queue left part-way.
 */
export async function startStillQueue(projectId: string): Promise<StillQueue | undefined> {
  if (running.has(projectId)) return useStudio.getState().stillQueues[projectId];
  const { project, visuals } = visualsOf(projectId);
  if (!project) return undefined;
  const apiKey = await getKey('gemini');
  const set = (q: StillQueue) => useStudio.getState().setStillQueue(projectId, q);
  if (!apiKey) {
    const base = useStudio.getState().stillQueues[projectId] ?? newQueue(projectId, [], Date.now());
    const blocked: StillQueue = { ...base, status: 'blocked', message: 'Add the Gemini key in Settings first.', updatedAt: Date.now() };
    set(blocked);
    return blocked;
  }
  const controller = new AbortController();
  running.set(projectId, controller);
  const model = useStudio.getState().settings.imageModel;
  const jobs = stillJobs(visuals, project.assets.stills);
  const existing: StillQueue | undefined = useStudio.getState().stillQueues[projectId];
  let queue: StillQueue =
    existing && existing.status !== 'done' && remaining(existing).length
      ? { ...existing, status: 'running', message: undefined }
      : { ...newQueue(projectId, jobs, Date.now()), status: 'running' };
  queue.keys = queue.keys.filter((k) => {
    const p = useStudio.getState().projects.find((x) => x.id === projectId);
    return !p?.assets.stills[k];
  });
  set(queue);

  const step = async (key: string): Promise<0 | 1 | undefined> => {
    if (controller.signal.aborted) return 0;
    const job = jobs.find((j) => j.key === key);
    if (!job) return 1;
    for (const second of [false, true]) {
      try {
        const uri = await generateStill({
          apiKey,
          prompt: job.prompt,
          slug: project.slug,
          key,
          aspectRatio: '16:9',
          model,
          signal: controller.signal,
        });
        useStudio.getState().setStill(projectId, key, uri);
        queue = afterJob(queue, key, { ok: true }, Date.now());
        break;
      } catch (e) {
        if (controller.signal.aborted) break;
        queue = afterJob(queue, key, { ok: false, message: e instanceof Error ? e.message : String(e), second }, Date.now());
        if (queue.status === 'blocked' || second) break;
        set(queue);
        await wait(RETRY_AFTER_MS, controller.signal);
      }
    }
    set(queue);
    if (queue.status === 'blocked' || controller.signal.aborted) return 0;
    await wait(PACE_MS, controller.signal);
    return undefined;
  };

  try {
    for (const key of remaining(queue)) {
      if ((await step(key)) === 0) break;
    }
  } finally {
    running.delete(projectId);
    if (queue.status === 'running') {
      queue = {
        ...queue,
        status: controller.signal.aborted ? 'stopped' : remaining(queue).length ? 'stopped' : 'done',
        updatedAt: Date.now(),
      };
    }
    set(queue);
  }
  return queue;
}

export function stopStillQueue(projectId: string): void {
  running.get(projectId)?.abort();
}

/** Shares the numbered still prompts for making them by hand. */
export async function exportStillPrompts(projectId: string): Promise<void> {
  const { project, visuals } = visualsOf(projectId);
  if (!project) throw new Error('Project not found.');
  const { fileName, text } = promptsFile(visuals, project.slug);
  const file = new File(Paths.cache, fileName);
  file.create({ overwrite: true });
  file.write(text);
  if (!(await Sharing.isAvailableAsync())) throw new Error('Sharing is not available on this device.');
  await Sharing.shareAsync(file.uri, { mimeType: 'text/plain', dialogTitle: 'Export the still prompts' });
}
