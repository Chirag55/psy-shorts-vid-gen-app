import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import type { z } from 'zod';
import {
  describeValidationError,
  LongScriptSchema,
  ShortScriptSchema,
  TopicIdeasSchema,
} from '@/core/scriptSchemas';
import {
  longFormInstruction,
  shortFormInstruction,
  topicIdeasInstruction,
  type ShortStructure,
} from '@/core/prompts';
import { withStyleLock } from '@/core/styleLock';
import { moveForChapter } from '@/core/kenburns';
import type { LongScript, ShortScript } from '@/core/types';
import type { TopicIdea } from './gemini';

/**
 * Script generation via the Claude API.
 *
 * Structured outputs are used rather than "reply with JSON" prompting, so the
 * response is schema-valid by construction instead of by hope — which is what
 * makes a second provider safe to swap in behind the same interface.
 */

export const DEFAULT_ANTHROPIC_MODEL = 'claude-opus-5';

/** Models worth offering. Anything else can be typed in Settings by hand. */
export const ANTHROPIC_MODELS = [
  { id: 'claude-opus-5', label: 'Opus 5', blurb: 'Most capable — best scripts' },
  { id: 'claude-sonnet-5', label: 'Sonnet 5', blurb: 'Faster and cheaper' },
  { id: 'claude-haiku-4-5', label: 'Haiku 4.5', blurb: 'Cheapest, least nuanced' },
] as const;

export class AnthropicError extends Error {}

function client(apiKey: string): Anthropic {
  // The key lives in the Android keystore and is read per call. dangerouslyAllowBrowser
  // is required because the SDK treats React Native as a browser-like environment;
  // there is no server to proxy through in an on-device app, which is the same
  // trade already made for Gemini and ElevenLabs.
  return new Anthropic({ apiKey, dangerouslyAllowBrowser: true });
}

interface GenerateOptions {
  apiKey: string;
  model?: string;
  signal?: AbortSignal;
}

async function parseWith<S extends z.ZodType>(
  opts: GenerateOptions,
  instruction: string,
  schema: S
): Promise<z.infer<S>> {
  try {
    const response = await client(opts.apiKey).messages.parse(
      {
        model: opts.model || DEFAULT_ANTHROPIC_MODEL,
        max_tokens: 16000,
        thinking: { type: 'adaptive' },
        messages: [{ role: 'user', content: instruction }],
        output_config: { format: zodOutputFormat(schema) },
      },
      { signal: opts.signal }
    );

    if (response.stop_reason === 'refusal') {
      throw new AnthropicError(
        `Claude declined this topic${response.stop_details?.category ? ` (${response.stop_details.category})` : ''}. Try rewording it.`
      );
    }

    const parsed = response.parsed_output;
    if (!parsed) {
      throw new AnthropicError('Claude returned no parseable script. Try again.');
    }
    return parsed as z.infer<S>;
  } catch (error) {
    if (error instanceof AnthropicError) throw error;
    if (error instanceof Anthropic.AuthenticationError) {
      throw new AnthropicError('That Anthropic API key was rejected.');
    }
    if (error instanceof Anthropic.RateLimitError) {
      throw new AnthropicError('Rate limited by Anthropic. Wait a moment and retry.');
    }
    if (error instanceof Anthropic.NotFoundError) {
      throw new AnthropicError(
        `Model "${opts.model || DEFAULT_ANTHROPIC_MODEL}" is not available on this key. Pick another in Settings.`
      );
    }
    if (error instanceof Anthropic.APIError) {
      throw new AnthropicError(`Anthropic ${error.status}: ${error.message}`);
    }
    throw error;
  }
}

export async function generateShortScript(
  opts: GenerateOptions,
  topic: string,
  category: string,
  recentArchetypes: string[] = [],
  performanceContext = '',
  structure: ShortStructure = 'single'
): Promise<ShortScript> {
  const raw = await parseWith(
    opts,
    shortFormInstruction(topic, category, recentArchetypes, structure) + performanceContext,
    ShortScriptSchema
  );

  return {
    mode: 'short',
    title: raw.title,
    hookLine: raw.hookLine,
    characterDescription: raw.characterDescription,
    archetype: raw.archetype,
    hashtags: raw.hashtags ?? [],
    beats: raw.beats.map((b) => ({ ...b, clipPrompt: withStyleLock(b.clipPrompt) })),
  };
}

export async function generateLongScript(
  opts: GenerateOptions,
  topic: string,
  category: string,
  chapterCount = 4,
  recentArchetypes: string[] = [],
  performanceContext = ''
): Promise<LongScript> {
  const raw = await parseWith(
    opts,
    longFormInstruction(topic, category, chapterCount, recentArchetypes) + performanceContext,
    LongScriptSchema
  );

  return {
    mode: 'long',
    title: raw.title,
    coldOpen: raw.coldOpen,
    characterDescription: raw.characterDescription,
    archetype: raw.archetype,
    closingSynthesis: raw.closingSynthesis,
    tags: raw.tags ?? [],
    chapters: raw.chapters.map((c, i) => ({
      ...c,
      index: i + 1,
      kenBurns: moveForChapter(i),
      heroA: withStyleLock(c.heroA),
      heroB: withStyleLock(c.heroB),
      stillPrompt: withStyleLock(c.stillPrompt),
    })),
  };
}

export async function generateTopicIdeas(
  opts: GenerateOptions,
  category: string,
  count: number,
  existing: string[],
  performanceContext = ''
): Promise<TopicIdea[]> {
  const raw = await parseWith(
    opts,
    topicIdeasInstruction(category, count, existing) + performanceContext,
    TopicIdeasSchema
  );
  return raw.topics;
}

/** Cheap credential probe for the Settings screen. */
export async function verifyAnthropicKey(apiKey: string): Promise<boolean> {
  try {
    await client(apiKey).models.list({ limit: 1 });
    return true;
  } catch {
    return false;
  }
}

/** Live model list, so a retired id never silently breaks generation. */
export async function listAnthropicModels(apiKey: string): Promise<Array<{ id: string; label: string }>> {
  const page = await client(apiKey).models.list({ limit: 50 });
  return page.data.map((m) => ({ id: m.id, label: m.display_name ?? m.id }));
}

export { describeValidationError };
