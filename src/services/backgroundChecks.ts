import * as BackgroundTask from 'expo-background-task';
import * as TaskManager from 'expo-task-manager';
import { useStudio } from '@/store';
import { runReleaseChecks } from './releaseWatch';
import { runFunnelUpdates } from './funnelUpdates';
import { refreshYppIfStale } from './ypp';
import { runWeeklyReviewIfDue } from './weeklyReview';

const TASK = 'mindfiles-release-checks';

/** Resolves once the persisted store has loaded (a background launch starts cold). */
function hydrated(): Promise<void> {
  if (useStudio.getState().hydrated) return Promise.resolve();
  return new Promise((resolve) => {
    const unsubscribe = useStudio.subscribe((s) => {
      if (s.hydrated) {
        unsubscribe();
        resolve();
      }
    });
  });
}

TaskManager.defineTask(TASK, async () => {
  try {
    await hydrated();
    await runReleaseChecks();
    await runFunnelUpdates().catch(() => 0);
    await refreshYppIfStale();
    await runWeeklyReviewIfDue();
    return BackgroundTask.BackgroundTaskResult.Success;
  } catch {
    return BackgroundTask.BackgroundTaskResult.Failed;
  }
});

/** Registers the periodic release, funnel, YPP and weekly-review checks (Android runs them about every 15 minutes at best). */
export async function registerBackgroundChecks(): Promise<void> {
  try {
    const status = await BackgroundTask.getStatusAsync();
    if (status !== BackgroundTask.BackgroundTaskStatus.Available) return;
    if (!(await TaskManager.isTaskRegisteredAsync(TASK))) {
      await BackgroundTask.registerTaskAsync(TASK, { minimumInterval: 15 });
    }
  } catch {
    // Background checks are best-effort; the app runs the same checks when opened.
  }
}
