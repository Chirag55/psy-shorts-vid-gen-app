import type { LongScript, ShortScript } from '@/core/types';
import type { ShortStructure } from '@/core/prompts';
import * as gemini from './gemini';
import * as anthropic from './anthropic';
import { getKey } from './keys';
import type { TopicIdea } from './gemini';

/**
 * One interface over both script providers, so every screen calls the same
 * function and the choice lives in Settings rather than in each call site.
 */

export type ProviderId = 'gemini' | 'anthropic';

export interface ProviderInfo {
  id: ProviderId;
  label: string;
  blurb: string;
  keyName: 'gemini' | 'anthropic';
}

export const PROVIDERS: ProviderInfo[] = [
  {
    id: 'gemini',
    label: 'Gemini',
    blurb: 'Google. Also powers Imagen stills.',
    keyName: 'gemini',
  },
  {
    id: 'anthropic',
    label: 'Claude',
    blurb: 'Anthropic. Strong at tone and narrative structure.',
    keyName: 'anthropic',
  },
];

export class NoProviderKeyError extends Error {}

interface Ctx {
  provider: ProviderId;
  /** Short-form shape: one tactic in depth, or three enumerated. */
  structure?: ShortStructure;
  model?: string;
  signal?: AbortSignal;
  /** Channel performance summary appended to the prompt, when available. */
  performanceContext?: string;
}

async function keyFor(provider: ProviderId): Promise<string> {
  const key = await getKey(provider === 'anthropic' ? 'anthropic' : 'gemini');
  if (!key) {
    throw new NoProviderKeyError(
      provider === 'anthropic'
        ? 'No Anthropic API key set. Add one in Settings, or switch the provider to Gemini.'
        : 'No Gemini API key set. Add one in Settings, or switch the provider to Claude.'
    );
  }
  return key;
}

export async function generateShortScript(
  ctx: Ctx,
  topic: string,
  category: string,
  recentArchetypes: string[]
): Promise<ShortScript> {
  const apiKey = await keyFor(ctx.provider);
  const perf = ctx.performanceContext ?? '';

  const structure = ctx.structure ?? 'single';

  return ctx.provider === 'anthropic'
    ? anthropic.generateShortScript({ apiKey, model: ctx.model, signal: ctx.signal }, topic, category, recentArchetypes, perf, structure)
    : gemini.generateShortScript({ apiKey, model: ctx.model, signal: ctx.signal }, topic, category, recentArchetypes, perf, structure);
}

export async function generateLongScript(
  ctx: Ctx,
  topic: string,
  category: string,
  chapterCount: number,
  recentArchetypes: string[]
): Promise<LongScript> {
  const apiKey = await keyFor(ctx.provider);
  const perf = ctx.performanceContext ?? '';

  return ctx.provider === 'anthropic'
    ? anthropic.generateLongScript({ apiKey, model: ctx.model, signal: ctx.signal }, topic, category, chapterCount, recentArchetypes, perf)
    : gemini.generateLongScript({ apiKey, model: ctx.model, signal: ctx.signal }, topic, category, chapterCount, recentArchetypes, perf);
}

export async function generateTopicIdeas(
  ctx: Ctx,
  category: string,
  count: number,
  existing: string[]
): Promise<TopicIdea[]> {
  const apiKey = await keyFor(ctx.provider);
  const perf = ctx.performanceContext ?? '';

  return ctx.provider === 'anthropic'
    ? anthropic.generateTopicIdeas({ apiKey, model: ctx.model, signal: ctx.signal }, category, count, existing, perf)
    : gemini.generateTopicIdeas({ apiKey, model: ctx.model, signal: ctx.signal }, category, count, existing, perf);
}

/** Live model list for whichever provider is selected. */
export async function listModels(provider: ProviderId): Promise<Array<{ id: string; label: string }>> {
  const apiKey = await keyFor(provider);
  return provider === 'anthropic' ? anthropic.listAnthropicModels(apiKey) : gemini.listGeminiModels(apiKey);
}

export const DEFAULT_MODELS: Record<ProviderId, string> = {
  gemini: gemini.DEFAULT_GEMINI_MODEL,
  anthropic: anthropic.DEFAULT_ANTHROPIC_MODEL,
};

export type { TopicIdea };
export type { ShortStructure };
