import type { FFmpegSession, Log } from '@wokcito/ffmpeg-kit-react-native';
import { toFsPath } from './workspace';

/**
 * FFmpegKit is loaded lazily, never at import time.
 *
 * Its module body instantiates a NativeEventEmitter in a static class field,
 * which runs the moment the module is required. It is a legacy (non-Turbo)
 * native module, so under the New Architecture that construction is the kind of
 * thing that can throw while the JS bundle is still being evaluated — before
 * React mounts, before any error boundary exists, which presents as the app
 * failing to launch at all with nothing to show for it.
 *
 * Deferring the require moves any such failure to the moment a render actually
 * starts, where it surfaces as a normal, readable error on the Assembly screen
 * and the rest of the app keeps working.
 */
type FFmpegKitModule = typeof import('@wokcito/ffmpeg-kit-react-native');

let cachedKit: FFmpegKitModule | null = null;

function kit(): FFmpegKitModule {
  if (!cachedKit) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      cachedKit = require('@wokcito/ffmpeg-kit-react-native') as FFmpegKitModule;
    } catch (error) {
      throw new FFmpegError(
        'The FFmpeg native module could not be loaded. Reinstall the app; if it persists the build is missing its native libraries.',
        error instanceof Error ? error.message : String(error)
      );
    }
  }
  return cachedKit;
}

/** True when FFmpeg can be loaded — lets the UI warn before a long render. */
export function isFFmpegAvailable(): boolean {
  try {
    return typeof kit().FFmpegKit?.executeWithArgumentsAsync === 'function';
  } catch {
    return false;
  }
}

/**
 * Typed wrapper over FFmpegKit.
 *
 * Everything that shells out to FFmpeg goes through `run`, so log handling,
 * completion detection and failure reporting behave identically everywhere.
 */

export class FFmpegError extends Error {
  constructor(message: string, readonly logs: string) {
    super(message);
    this.name = 'FFmpegError';
  }
}

export type LogSink = (lines: string[]) => void;

/** How often buffered log lines are handed to the UI. */
const LOG_FLUSH_MS = 300;
/** Hard ceiling on a single render, after which the session is abandoned. */
const SESSION_TIMEOUT_MS = 30 * 60 * 1000;

export interface RunOptions {
  onLog?: LogSink;
  signal?: AbortSignal;
}

/**
 * Runs FFmpeg to completion.
 *
 * FFmpeg emits log lines faster than React can render them — a 1080p encode
 * produces thousands per minute. Lines are buffered natively-cheaply here and
 * flushed on an interval, so the UI does a few updates per second instead of
 * thousands, which is the difference between a live log and an ANR.
 */
export async function run(args: string[], options: RunOptions = {}): Promise<void> {
  const buffer: string[] = [];
  let timer: ReturnType<typeof setInterval> | undefined;

  const flush = () => {
    if (!buffer.length || !options.onLog) return;
    options.onLog(buffer.splice(0, buffer.length));
  };

  if (options.onLog) timer = setInterval(flush, LOG_FLUSH_MS);

  try {
    const session = await new Promise<FFmpegSession>((resolve, reject) => {
      let settled = false;

      const timeout = setTimeout(() => {
        if (settled) return;
        settled = true;
        void kit().FFmpegKit.cancel();
        reject(new FFmpegError('FFmpeg exceeded the 30 minute limit and was stopped.', buffer.join('\n')));
      }, SESSION_TIMEOUT_MS);

      const onAbort = () => {
        if (settled) return;
        void kit().FFmpegKit.cancel();
      };
      options.signal?.addEventListener('abort', onAbort, { once: true });

      kit().FFmpegKit.executeWithArgumentsAsync(
        args,
        (completed) => {
          if (settled) return;
          settled = true;
          clearTimeout(timeout);
          options.signal?.removeEventListener('abort', onAbort);
          resolve(completed);
        },
        (log: Log) => {
          const message = log?.getMessage?.();
          if (!message) return;
          // Bound the buffer: a runaway session must not grow memory without limit.
          if (buffer.length < 400) buffer.push(message.trimEnd());
        }
      ).catch((error) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        reject(error);
      });
    });

    const returnCode = await session.getReturnCode();
    const { ReturnCode } = kit();
    if (!ReturnCode.isSuccess(returnCode)) {
      const logs = await session.getAllLogsAsString(2000).catch(() => buffer.join('\n'));
      throw new FFmpegError(
        ReturnCode.isCancel(returnCode) ? 'Render cancelled.' : `FFmpeg exited with code ${returnCode.getValue()}.`,
        logs
      );
    }
  } finally {
    if (timer) clearInterval(timer);
    flush();
  }
}

export async function cancelAll(): Promise<void> {
  await kit().FFmpegKit.cancel();
}

/** Media duration in seconds. Returns 0 for anything unreadable. */
export async function probeDuration(uri: string): Promise<number> {
  try {
    const session = await kit().FFprobeKit.executeWithArguments([
      '-v', 'error',
      '-show_entries', 'format=duration',
      '-of', 'default=noprint_wrappers=1:nokey=1',
      toFsPath(uri),
    ]);
    const output = (await session.getOutput()) ?? '';
    const value = Number.parseFloat(output.trim());
    return Number.isFinite(value) && value > 0 ? value : 0;
  } catch {
    return 0;
  }
}
