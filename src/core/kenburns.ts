import type { KenBurnsMove } from './types';

/**
 * Ken Burns pan/zoom filters — spec §6.4.
 *
 * A connective still fills whatever chapter voiceover the two hero clips do not
 * cover. Animating it stops the chapter turning into a static frame for 10+
 * seconds, which is the fatigue trap the three-beat visual architecture exists
 * to avoid.
 */

const FPS = 24;

export function kenBurnsFilter(move: KenBurnsMove, durationSeconds: number, width: number, height: number): string {
  const frames = Math.max(1, Math.round(durationSeconds * FPS));
  const size = `${width}x${height}`;
  const centre = `x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)'`;

  switch (move) {
    case 'zoom_in':
      return `zoompan=z='min(zoom+0.0015,1.25)':d=${frames}:${centre}:s=${size}:fps=${FPS}`;
    case 'zoom_out':
      return `zoompan=z='max(1.25-0.0015*on,1.0)':d=${frames}:${centre}:s=${size}:fps=${FPS}`;
    case 'pan_right':
      return `zoompan=z=1.15:x='if(lte(on,1),0,min(x+1.5,iw-iw/zoom))':y='ih/2-(ih/zoom/2)':d=${frames}:s=${size}:fps=${FPS}`;
    case 'pan_left':
      return `zoompan=z=1.15:x='if(lte(on,1),iw-iw/zoom,max(x-1.5,0))':y='ih/2-(ih/zoom/2)':d=${frames}:s=${size}:fps=${FPS}`;
  }
}

/**
 * Duration_Still = max(Duration_Audio - (Duration_HeroA + Duration_HeroB), 2.0)
 *
 * The 2s floor matters: if the hero clips already overrun the voiceover the
 * still would otherwise get a zero or negative duration and FFmpeg would fail
 * the whole chapter.
 */
export function connectiveStillDuration(audioDuration: number, heroADuration: number, heroBDuration: number): number {
  return Math.max(audioDuration - (heroADuration + heroBDuration), 2.0);
}

/** Rotates through the four moves so consecutive chapters never repeat one. */
export function moveForChapter(index: number): KenBurnsMove {
  const moves: KenBurnsMove[] = ['zoom_in', 'pan_right', 'zoom_out', 'pan_left'];
  return moves[Math.abs(index) % moves.length];
}

/**
 * Video tempo correction — PTS = (T_audio / T_video) * PTS.
 *
 * Only the video is ever retimed. The desktop spec also allows nudging audio
 * with `atempo`, but that inverts the sync principle the whole pipeline rests
 * on — audio duration determines video pacing, not the other way round — and
 * retiming narration audibly changes its delivery.
 *
 * Not applied when the drift is under a percent: that costs a re-encode for no
 * visible gain.
 */
export function setptsFactor(audioDuration: number, videoDuration: number): number | null {
  if (videoDuration <= 0 || audioDuration <= 0) return null;
  const factor = audioDuration / videoDuration;
  if (Math.abs(factor - 1) < 0.01) return null;
  // Keep the correction subtle; beyond this the motion reads as slow-mo or fast-forward.
  return Math.min(1.35, Math.max(0.75, factor));
}
