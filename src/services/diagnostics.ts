import * as Application from 'expo-application';
import { Platform } from 'react-native';
import {
  describeCrash,
  findPreviousCrash,
  formatTrail,
  readTrail,
  type CrashReport,
} from './breadcrumbs';
import { describeExit, lastAbnormalExit, isAvailable, type ExitRecord } from './crashInfo';

/**
 * Assembles everything known about a previous crash into one report.
 *
 * Three sources, because no one of them is sufficient. The breadcrumb trail
 * says what the app was doing. Android's exit record says how the process
 * actually ended — a native segfault and a low-memory kill look identical from
 * inside the app and need opposite fixes. The build version says which fix was
 * actually running, which the last round could not establish.
 */

export interface Diagnosis {
  version: string;
  crash: CrashReport | null;
  exit: ExitRecord | null;
  /** Full text, suitable for the clipboard. */
  report: string;
  /** Short text for the dialog body. */
  summary: string;
}

export function buildVersion(): string {
  const version = Application.nativeApplicationVersion ?? 'unknown';
  const build = Application.nativeBuildVersion ?? '?';
  return `${version} (build ${build})`;
}

export async function diagnosePreviousRun(): Promise<Diagnosis | null> {
  const crash = safely(() => findPreviousCrash(), null);
  const exit = await lastAbnormalExit();

  // Nothing to say: no unfinished step and no abnormal exit recorded.
  if (!crash && !exit) return null;

  const version = buildVersion();
  const trail = safely(() => formatTrail(readTrail()), '(trail unavailable)');

  const parts: string[] = [`The Mind Files Studio ${version}`, `Android ${Platform.Version}`, ''];

  if (exit) {
    parts.push(describeExit(exit), '');
  } else if (isAvailable()) {
    parts.push('Android has no abnormal exit on record for this app.', '');
  }

  if (crash) {
    parts.push(describeCrash(crash), '');
  }

  parts.push('Full step trail:', trail);

  const summary = [
    `Version ${version}`,
    '',
    crash ? describeCrash(crash) : 'The app did not finish a step it had started.',
    exit ? `\n${exit.reason}` : '',
  ]
    .filter(Boolean)
    .join('\n');

  return { version, crash, exit, report: parts.join('\n'), summary };
}

function safely<T>(fn: () => T, fallback: T): T {
  try {
    return fn();
  } catch {
    return fallback;
  }
}
