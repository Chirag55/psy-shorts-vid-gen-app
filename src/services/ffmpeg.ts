import { FFmpegKit, FFprobeKit, ReturnCode } from 'react-native-ffmpeg-kit';
import { toFsPath } from './workspace';

/**
 * Thin, typed wrapper over FFmpegKit.
 *
 * Everything that shells out to FFmpeg goes through `run`, so log capture,
 * cancellation and failure reporting behave the same everywhere.
 */

export class FFmpegError extends Error {
  constructor(message: string, readonly logs: string) {
    super(message);
  }
}

export type LogSink = (line: string) => void;

export async function run(args: string[], onLog?: LogSink): Promise<void> {
  const session = await FFmpegKit.executeWithArgumentsAsync(args, undefined, (log) => {
    const message = typeof log?.getMessage === 'function' ? log.getMessage() : String(log);
    if (message) onLog?.(message.trimEnd());
  });

  // executeWithArgumentsAsync resolves when the session is created, not when it
  // finishes, so wait for a terminal state before reading the return code.
  await waitForCompletion(session);

  const returnCode = await session.getReturnCode();
  if (!ReturnCode.isSuccess(returnCode)) {
    const logs = await session.getAllLogsAsString(2000).catch(() => '');
    const cancelled = ReturnCode.isCancel(returnCode);
    throw new FFmpegError(
      cancelled ? 'Render cancelled.' : `FFmpeg exited with code ${returnCode.getValue()}.`,
      logs
    );
  }
}

async function waitForCompletion(session: { getState: () => Promise<unknown> }): Promise<void> {
  // Poll rather than relying on the complete callback — the callback is not
  // guaranteed to fire if the session fails during argument parsing.
  for (let i = 0; i < 6000; i++) {
    const state = String(await session.getState());
    if (state === 'COMPLETED' || state === 'FAILED' || state === '3' || state === '4') return;
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new FFmpegError('FFmpeg timed out after 10 minutes.', '');
}

export async function cancelAll(): Promise<void> {
  await FFmpegKit.cancel();
}

/** Media duration in seconds. Returns 0 for anything unreadable. */
export async function probeDuration(uri: string): Promise<number> {
  const path = toFsPath(uri);
  const session = await FFprobeKit.executeWithArguments([
    '-v', 'error',
    '-show_entries', 'format=duration',
    '-of', 'default=noprint_wrappers=1:nokey=1',
    path,
  ]);
  const output = (await session.getOutput().catch(() => '')) ?? '';
  const value = Number.parseFloat(output.trim());
  return Number.isFinite(value) ? value : 0;
}

/**
 * Escapes a path for use *inside* a filter_complex argument.
 * Colons separate filter options and backslashes are the escape character, so
 * both have to be neutralised or the graph fails to parse.
 */
export function escapeFilterPath(path: string): string {
  return path.replace(/\\/g, '\\\\').replace(/:/g, '\\:').replace(/'/g, "\\'").replace(/,/g, '\\,');
}
