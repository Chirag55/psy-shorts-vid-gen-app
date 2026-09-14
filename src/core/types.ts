/** Domain model shared across the generation → assembly → publish pipeline. */

export type Mode = 'short' | 'long';

export type BeatKind = 'hook' | 'mechanism' | 'reframe';

/** Where a chapter sits in the long-form timeline. Index 99 is the outro, per the spec's upload API. */
export type ChapterIndex = number;

export interface ClipPrompt {
  /** 'a' = Hero Clip A (hook action), 'b' = Hero Clip B (mechanism escalation). */
  slot: 'a' | 'b';
  prompt: string;
}

export interface Chapter {
  /** 0 = cold open, 1..N = body chapters, 99 = closing synthesis. */
  index: ChapterIndex;
  title: string;
  /** Re-engagement beat that opens the chapter. */
  miniHook: string;
  /** The psychological dynamic being explained. */
  mechanism: string;
  /** Actionable boundary or mental shift that closes the chapter. */
  microReframe: string;
  /** miniHook + mechanism + microReframe — what actually gets spoken. */
  narration: string;
  heroA: string;
  heroB: string;
  stillPrompt: string;
  kenBurns: KenBurnsMove;
}

export type KenBurnsMove = 'zoom_in' | 'zoom_out' | 'pan_left' | 'pan_right';

export interface ShortBeat {
  kind: BeatKind;
  /** The spoken line for this beat. */
  text: string;
  /** Veo prompt for the ~10s continuous hero clip covering this beat. */
  clipPrompt: string;
}

export interface ShortScript {
  mode: 'short';
  title: string;
  hookLine: string;
  beats: ShortBeat[];
  /** Wardrobe + setting, restated in clips 2 and 3 to hold continuity. */
  characterDescription: string;
  archetype: string;
  hashtags: string[];
}

export interface LongScript {
  mode: 'long';
  title: string;
  coldOpen: string;
  chapters: Chapter[];
  closingSynthesis: string;
  characterDescription: string;
  archetype: string;
  tags: string[];
}

export type ScriptBody = ShortScript | LongScript;

/** Per-asset readiness, mirroring the desktop studio's status badges. */
export interface AssetState {
  /** Absolute file:// uri of an imported or generated video clip. */
  clips: Record<string, string>;
  /** Absolute file:// uri of generated still images, keyed by chapter index. */
  stills: Record<string, string>;
  /** Absolute file:// uri of chapter voiceovers, keyed by chapter index. */
  audio: Record<string, string>;
  /** Word-level alignment per chapter, derived from ElevenLabs char timestamps. */
  alignment: Record<string, WordTiming[]>;
  /** Rendered per-chapter MP4 segments. */
  segments: Record<string, string>;
  finalVideo?: string;
  thumbnail?: string;
  youtubeVideoId?: string;
}

export interface WordTiming {
  word: string;
  start: number;
  end: number;
}

export interface Project {
  id: string;
  slug: string;
  mode: Mode;
  topic: string;
  category: string;
  createdAt: number;
  updatedAt: number;
  script: ScriptBody;
  assets: AssetState;
  /** Voice id used for synthesis, so a re-synth stays consistent. */
  voiceId: string;
  publish: PublishMeta;
}

export interface PublishMeta {
  title: string;
  description: string;
  tags: string;
  privacyStatus: 'private' | 'unlisted' | 'public';
}

export interface TopicBankEntry {
  id: string;
  topic: string;
  category: string;
  used: boolean;
  usedAt?: number;
}
