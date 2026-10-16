import type { LongScript, ShortScript } from '@/core/types';
import type { ShortStructure } from '@/core/prompts';
import type { TitleRuleConfig } from '@/core/titleRules';
import type { Layer2Item } from '@/core/researchLayer2';
import { DEFAULT_CLIP_BUDGET } from '@/core/shots';
import { isLegacy } from '@/core/topicBank';
import * as planner from '@/core/shotPlanner';
import type { ShortStyle } from '@/core/styleProfiles';
import * as gemini from './gemini';
import * as anthropic from './anthropic';
import { getKey } from './keys';
import { runWithProviderFallback, type RunOptions } from './providerFallback';
import type { TopicIdea } from './gemini';

/**
 * One interface over both script providers, so every screen calls the same
 * function and the choice lives in Settings rather than in each call site.
 * A provider out of capacity hands the call to the other one when its key is set.
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

export interface Ctx {
  provider: ProviderId;
  /** Short-form shape: one tactic in depth, or three enumerated. */
  structure?: ShortStructure;
  /** Long-form shape. */
  longStructure?: string;
  model?: string;
  /** The model to ask when the call falls back to the other provider. */
  fallbackModel?: string;
  signal?: AbortSignal;
  onNotice?: (message: string) => void;
  /** Channel performance summary appended to the prompt, when available. */
  performanceContext?: string;
  clipBudget?: number;
  /** The bank entry this script is assigned from. */
  assignment?: any;
  titleConfig?: TitleRuleConfig;
  priority?: string[];
  style?: Partial<ShortStyle>;
}

async function keyFor(provider: ProviderId): Promise<string> {
  const key = await getKey(provider === 'anthropic' ? 'anthropic' : 'gemini');
  if (!key) {
    throw new NoProviderKeyError(
      provider === 'anthropic'
        ? 'No Anthropic API key set. Add one in Settings, or switch the provider to Gemini.'
        : 'No Gemini API key set. Add one in Settings, or switch the provider to Claude.',
    );
  }
  return key;
}

const peekKey = (provider: ProviderId) => getKey(provider);

function withFallback<T>(ctx: Ctx, run: (provider: ProviderId, opts: RunOptions) => Promise<T>): Promise<T> {
  return runWithProviderFallback(ctx, keyFor, peekKey, run);
}

export async function generateShortScript(
  ctx: Ctx,
  topic: string,
  category: string,
  recentArchetypes: string[],
): Promise<ShortScript> {
  const perf = ctx.performanceContext ?? '';
  const structure = ctx.structure ?? 'single';
  const clipBudget = ctx.clipBudget ?? DEFAULT_CLIP_BUDGET;
  const entry = ctx.assignment?.kind === 'short' && isLegacy(ctx.assignment) ? ctx.assignment : undefined;
  return withFallback(ctx, (provider, o) =>
    provider !== 'anthropic'
      ? gemini.generateShortScript(o, topic, category, recentArchetypes, perf, structure, clipBudget, entry, ctx.titleConfig)
      : anthropic.generateShortScript(o, topic, category, recentArchetypes, perf, structure, clipBudget, entry, ctx.titleConfig),
  );
}

export async function generateLongScript(
  ctx: Ctx,
  topic: string,
  category: string,
  chapterCount: number,
  recentArchetypes: string[],
): Promise<LongScript> {
  const perf = ctx.performanceContext ?? '';
  const entry = ctx.assignment?.kind === 'long' && isLegacy(ctx.assignment) ? ctx.assignment : undefined;
  return withFallback(ctx, (provider, o) =>
    provider !== 'anthropic'
      ? gemini.generateLongScript(o, topic, category, chapterCount, recentArchetypes, perf, ctx.longStructure, entry)
      : anthropic.generateLongScript(o, topic, category, chapterCount, recentArchetypes, perf, ctx.longStructure, entry),
  );
}

/** Plans the pictures for a bank entry's locked script, with the model when asked, on the phone otherwise. */
export async function planBankedScript(
  ctx: Ctx,
  entry: any,
  recentArchetypes: string[],
  useAi: boolean,
): Promise<ShortScript | LongScript> {
  const short = entry.kind === 'short';
  const call = useAi
    ? (instruction: string) =>
        withFallback(ctx, (provider, o) =>
          provider !== 'anthropic'
            ? gemini.planVisuals(o, instruction, short ? planner.SHORT_PLAN_RESPONSE_SCHEMA : planner.LONG_PLAN_RESPONSE_SCHEMA)
            : anthropic.planVisuals(o, instruction, short ? planner.ShortPlanSchema : planner.LongPlanSchema),
        )
    : undefined;
  return planner.planBankedScript(entry, {
    call,
    recentArchetypes,
    clipBudget: ctx.clipBudget ?? DEFAULT_CLIP_BUDGET,
    style: ctx.style,
    onNotice: ctx.onNotice,
    signal: ctx.signal,
  });
}

export async function generateTopicIdeas(
  ctx: Ctx,
  category: string,
  count: number,
  existing: string[],
): Promise<TopicIdea[]> {
  const perf = ctx.performanceContext ?? '';
  return withFallback(ctx, (provider, o) =>
    provider !== 'anthropic'
      ? gemini.generateTopicIdeas(o, category, count, existing, perf, ctx.priority)
      : anthropic.generateTopicIdeas(o, category, count, existing, perf, ctx.priority),
  );
}

/** Fills a fill-sheet's blanks. */
export async function fillSheetBlanks(ctx: Ctx, instruction: string) {
  const result = await withFallback(ctx, (provider, o) =>
    provider !== 'anthropic' ? gemini.fillBlanks(o, instruction) : anthropic.fillBlanks(o, instruction),
  );
  return result.rows;
}

export async function checkTitleGrammar(ctx: Ctx, title: string) {
  return withFallback(ctx, (provider, o) =>
    provider !== 'anthropic' ? gemini.checkTitle(o, title) : anthropic.checkTitle(o, title),
  );
}

export async function classifyRelevance(ctx: Ctx, items: Layer2Item[]) {
  return withFallback(ctx, (provider, o) =>
    provider !== 'anthropic' ? gemini.classifyRelevance(o, items) : anthropic.classifyRelevance(o, items),
  );
}

/** Live model list for whichever provider is selected. */
export async function listModels(provider: ProviderId): Promise<Array<{ id: string; label: string }>> {
  const apiKey = await keyFor(provider);
  return provider !== 'anthropic' ? gemini.listGeminiModels(apiKey) : anthropic.listAnthropicModels(apiKey);
}

export const DEFAULT_MODELS: Record<ProviderId, string> = {
  gemini: gemini.DEFAULT_GEMINI_MODEL,
  anthropic: anthropic.DEFAULT_ANTHROPIC_MODEL,
};

export type { TopicIdea };
export type { ShortStructure };
