import type { Shot } from './shots';
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

export type KenBurnsMove = 'zoom_in' | 'zoom_out' | 'pan_left' | 'pan_right' | 'tilt_up' | 'tilt_down';

export interface ShortBeat {
  kind: BeatKind;
  /** The spoken line for this beat. */
  text: string;
  /** Veo prompt for the ~10s continuous hero clip covering this beat (legacy, pre shot lists). */
  clipPrompt?: string;
  /** On-screen card for this beat ("1. THEY MIRROR YOU"). */
  cardText?: string;
  shots?: Shot[];
}

export interface ShortScript {
  mode: 'short';
  title: string;
  /** Short structure: the classic three beats, a rapid list, a list, or a test/quiz. */
  structure?: string;
  /** Word target set by the bank entry (overrides the structure's default window). */
  wordTarget?: number;
  /** Bank entry this script came from; assigned scripts skip the free-writing checks. */
  bankEntryId?: string;
  /** Set when the narration was supplied verbatim (e.g. from the bank) rather than written by a model. */
  scriptSource?: string;
  tactic?: string;
  hookText?: string;
  hookTextPov?: string;
  hookCard?: string;
  loopBridge?: string;
  ctaQuestion?: string;
  stimulus?: { card?: StimulusCard; description?: string; holdSeconds?: number } | null;
  titleOptions?: string[];
  tagLine?: string;
  /** Who found the effect and when; goes in the description, never spoken. */
  sourceLine?: string;
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
  structure?: string;
  wordTarget?: number;
  bankEntryId?: string;
  ctaQuestion?: string;
  tactics?: string[];
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
  /** How the final video was rendered (sizes, durations, warnings). */
  renderInfo?: Record<string, unknown>;
  thumbnail?: string;
  youtubeVideoId?: string;
  /** When the video went live (ms), for the similarity window. */
  publishedAt?: number;
  /** The scheduled publish time (ISO), when the upload is private until then. */
  scheduledFor?: string;
}

export interface WordTiming {
  word: string;
  start: number;
  end: number;
}

export interface ReviewStamp {
  scriptHash: string;
  reviewer: string;
  at: string;
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
  /** The topic-bank entry this project was made from (e.g. "D69"). */
  bankEntryId?: string;
  review?: ReviewStamp;
  /** The source cited when the project was not made from the bank. */
  source?: string;
  /** Published despite a near-copy title, with the reason given. */
  originalityOverride?: { reason: string; at: string };
  /** Set when a new bank discarded this project's stale voice and render. */
  bankReset?: { at: number };
  /** Style profile and render options the Short was made with. */
  style?: { profile?: 'P' | 'C'; captionMode?: string; music?: string; endingMode?: string; [key: string]: any };
  /** Flow credit ledger: clip tries and clips swapped for stills. */
  flow?: { tries: Record<string, number>; stills: string[] };
  /** Virality audits and post-publish snapshots. */
  virality?: { snapshots?: { h48?: any; d7?: any }; hookShell?: string; [key: string]: any };
  /** YouTube Studio's stayed-to-watch figure, entered by hand. */
  stayedToWatch?: { percent: number; at: string };
  /** Which hook the Short went out with in the A/B test. */
  hookVariant?: string;
  /** Fields added after 1.9 that screens read without a declared shape. */
  [key: string]: any;
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

export interface StimulusItem {
  text: string;
  color: string;
  size: 's' | 'm' | 'l' | 'xl';
  x: number;
  y: number;
}

/** A test Short's stimulus, laid out for the app to draw on a 9:16 card. */
export interface StimulusCard {
  background: string;
  frame: 'triangle' | 'box' | 'none';
  items: StimulusItem[];
}
