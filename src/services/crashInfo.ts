import { NativeModules, Platform, TurboModuleRegistry } from 'react-native';
import type { TurboModule } from 'react-native';

/**
 * Android's own record of why previous processes of this app ended.
 *
 * When the process dies from native code or is reclaimed by the system, nothing
 * in JavaScript runs — no error, no stack, no chance to write anything down.
 * Reconstructing the cause from what the app was doing cannot tell a segfault
 * apart from an out-of-memory kill, and those need opposite fixes. Android has
 * kept the real answer since API 30 and this reads it.
 */

export interface ExitRecord {
  reasonCode: number;
  /** Plain-language reason, e.g. "Native crash (segfault in C++)". */
  reason: string;
  description: string;
  /** Milliseconds since the epoch. */
  timestamp: number;
  status: number;
  pssKb: number;
  rssKb: number;
  importance: number;
  /** Tombstone or ANR trace, when Android captured one. Truncated. */
  trace: string;
}

interface CrashInfoNative extends TurboModule {
  getExitReasons(limit: number): Promise<ExitRecord[]>;
  getLastJavaCrash(): Promise<string>;
  clearLastJavaCrash(): Promise<boolean>;
}

function nativeModule(): CrashInfoNative | null {
  if (Platform.OS !== 'android') return null;
  try {
    const turbo = TurboModuleRegistry.get<CrashInfoNative>('CrashInfo');
    if (turbo) return turbo;
  } catch {
    // Fall through to the legacy registry.
  }
  try {
    return (NativeModules as Record<string, CrashInfoNative | undefined>).CrashInfo ?? null;
  } catch {
    return null;
  }
}

/** Reasons that mean the app died rather than being closed. */
const ABNORMAL = new Set([
  1, // ANR
  2, // CRASH (Java)
  3, // CRASH_NATIVE
  4, // DEPENDENCY_DIED
  5, // OTHER
  6, // LOW_MEMORY  (see note below)
  9, // SIGNALED
  13, // EXCESSIVE_RESOURCE_USAGE
]);

/**
 * The constants above are the platform's, restated here because the JavaScript
 * side has no access to `ApplicationExitInfo`. Only the codes that mean an
 * unexpected death are listed; a normal exit or a user-initiated stop is not
 * worth reporting.
 */
export async function recentExits(limit = 5): Promise<ExitRecord[]> {
  const module = nativeModule();
  if (!module) return [];
  try {
    const records = await module.getExitReasons(limit);
    return Array.isArray(records) ? records : [];
  } catch {
    return [];
  }
}

/** The most recent abnormal exit, if there is one. */
export async function lastAbnormalExit(): Promise<ExitRecord | null> {
  const records = await recentExits(6);
  return records.find((r) => ABNORMAL.has(r.reasonCode)) ?? null;
}

export function describeExit(record: ExitRecord): string {
  const when = new Date(record.timestamp).toLocaleString();
  const memory = record.rssKb > 0 ? `\nMemory in use: ${(record.rssKb / 1024).toFixed(0)}MB` : '';
  const detail = record.description ? `\nSystem note: ${record.description}` : '';
  const trace = record.trace ? `\n\nTrace:\n${record.trace.slice(0, 1200)}` : '';
  return `Android reports: ${record.reason}\n${when}${memory}${detail}${trace}`;
}

/** Whether this build can read exit reasons at all. */
export function isAvailable(): boolean {
  return nativeModule() !== null;
}

/**
 * The stack trace of the last uncaught Java/Kotlin exception.
 *
 * Android's exit record names a Java crash but carries no trace for one, so the
 * app installs its own default uncaught-exception handler and writes the trace
 * to disk before dying. This reads it back.
 */
export async function lastJavaCrash(): Promise<string> {
  const module = nativeModule();
  if (!module) return '';
  try {
    return (await module.getLastJavaCrash()) ?? '';
  } catch {
    return '';
  }
}

export async function clearJavaCrash(): Promise<void> {
  const module = nativeModule();
  if (!module) return;
  try {
    await module.clearLastJavaCrash();
  } catch {
    // Nothing to do.
  }
}
