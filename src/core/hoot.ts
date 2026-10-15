/**
 * Professor Hoot, the channel mascot. The app draws him (overlay, scene-cut
 * moments, cards and thumbnails); he is never written into a visual prompt.
 */
export const HOOT_POSES = [
  'idle', 'happy', 'surprised', 'glance', 'talk', 'blink', 'wave', 'thinking',
  'pointing', 'skeptical', 'worried', 'serious', 'shocked', 'confused', 'file', 'idea',
] as const;

export type HootPose = (typeof HOOT_POSES)[number];

export function isHootPose(v: unknown): v is HootPose {
  return typeof v === 'string' && (HOOT_POSES as readonly string[]).includes(v);
}

export const HOOT_VERSION = '2.0.0';

/** Normalised point of the sprite that sits on the placement anchor (his feet). */
export const HOOT_ANCHOR = { x: 0.5, y: 0.894 };

export const HOOT_PLACEMENT = {
  short: { widthRatio: 0.2, marginRatio: 0.04, bottomSafeRatio: 0.27 },
  long: { widthRatio: 0.16, marginRatio: 0.02, bottomSafeRatio: 0 },
};

export const LIP_FLAP = { frames: ['idle', 'talk'] as HootPose[], holdMs: 90, rmsThresholdDb: -32 };
export const BLINK = { holdMs: 120, intervalS: [3, 5] as [number, number] };
export const EXPRESSION_HOLD_MS = 1200;

export type ShortFormatCode = 'STUDY' | 'SCEN' | 'TACTIC' | 'MYTH' | 'LIST' | 'DEFENSE';

export const FORMAT_POSES: Record<ShortFormatCode, { hook: HootPose; reveal: HootPose; itemMarker?: HootPose }> = {
  STUDY: { hook: 'surprised', reveal: 'shocked' },
  SCEN: { hook: 'thinking', reveal: 'happy' },
  TACTIC: { hook: 'skeptical', reveal: 'pointing' },
  MYTH: { hook: 'confused', reveal: 'shocked' },
  LIST: { hook: 'pointing', reveal: 'glance', itemMarker: 'glance' },
  DEFENSE: { hook: 'worried', reveal: 'idea' },
};

export const LONGFORM_POSES = { intro: 'file' as HootPose, chapterCard: 'file' as HootPose };

/** A Manipulation & Defense tactic reveal is played straight. */
export function revealPose(format: ShortFormatCode, category?: string): HootPose {
  if (format === 'TACTIC' && category === 'Manipulation & Defense') return 'serious';
  return FORMAT_POSES[format].reveal;
}

export function endingPose(beat: string): HootPose | null {
  return beat === 'SIGNOFF' ? 'wave' : null;
}

/** Reads a "Hoot (pose)" cue out of a script line. */
export function poseNamedIn(text: string): HootPose | undefined {
  const name = /\bhoot\s*\(\s*([a-z]+)\s*\)/i.exec(text)?.[1]?.toLowerCase();
  return isHootPose(name) ? name : undefined;
}
