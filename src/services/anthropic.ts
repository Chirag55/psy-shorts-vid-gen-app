import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import type { z } from 'zod';
import { layer2Prompt, parseLayer2Response, type Layer2Item, type Layer2Label } from '@/core/researchLayer2';
import { DEFAULT_CLIP_BUDGET } from '@/core/shots';
import {
  describeValidationError,
  FillBlanksSchema,
  LongScriptSchema,
  RelevanceLabelsSchema,
  ShortScriptSchema,
  TitleCheckSchema,
  TopicIdeasSchema,
} from '@/core/scriptSchemas';
import {
  longFormInstruction,
  shortFormInstruction,
  titleCheckInstruction,
  topicIdeasInstruction,
  type PromptEntry,
  type ShortStructure,
} from '@/core/prompts';
import { toLongScript, toShortScript } from '@/core/scriptMapping';
import { describeAllFailed, describeExhausted, ScriptProviderError, summariseKinds, type FailureKind, type GeminiFailure } from '@/core/retry';
import type { TitleRuleConfig } from '@/core/titleRules';
import type { LongScript, ShortScript } from '@/core/types';
import type { TopicIdea } from './gemini';

/**
 * Script generation via the Claude API, with structured outputs so the
 * response is schema-valid by construction. On capacity failures the next
 * model in the list is tried.
 */

export { describeValidationError };

export const DEFAULT_ANTHROPIC_MODEL = 'claude-opus-5';

/** Models worth offering. Anything else can be typed in Settings by hand. */
export const ANTHROPIC_MODELS = [
  { id: 'claude-opus-5', label: 'Opus 5', blurb: 'Most capable — best scripts' },
  { id: 'claude-sonnet-5', label: 'Sonnet 5', blurb: 'Faster and cheaper' },
  { id: 'claude-haiku-4-5', label: 'Haiku 4.5', blurb: 'Cheapest, least nuanced' },
];

export class AnthropicError extends ScriptProviderError {
  constructor(message: string, kind: FailureKind = 'other') {
    super(message, kind, 'anthropic');
    this.name = 'AnthropicError';
  }
}

interface AnthropicOptions {
  apiKey: string;
  model?: string;
  signal?: AbortSignal;
  onNotice?: (text: string) => void;
}

function client(apiKey: string): Anthropic {
  return new Anthropic({ apiKey, dangerouslyAllowBrowser: true });
}

/** SDK error → failure kind; null for errors that are not API failures (rethrown as they are). */
export function classifyAnthropicError(e: unknown): FailureKind | null {
  if (e instanceof Anthropic.APIUserAbortError) return null;
  if (e instanceof Anthropic.APIConnectionError) return 'network';
  if (e instanceof Anthropic.AuthenticationError || e instanceof Anthropic.PermissionDeniedError) return 'auth';
  if (e instanceof Anthropic.RateLimitError) return 'rate-minute';
  if (e instanceof Anthropic.NotFoundError) return 'unavailable';
  if (e instanceof Anthropic.InternalServerError) return 'overloaded';
  if (e instanceof Anthropic.BadRequestError) return /credit balance/i.test(e.message) ? 'quota-day' : 'bad-request';
  if (e instanceof Anthropic.APIError) return 'other';
  return null;
}

function claudeModelOrder(first: string): string[] {
  return [first, ...ANTHROPIC_MODELS.map((m) => m.id).filter((id) => id !== first)];
}

async function parseOnce<S extends z.ZodType>(opts: AnthropicOptions, model: string, instruction: string, schema: S): Promise<z.infer<S>> {
  const message = await client(opts.apiKey).messages.parse(
    {
      model,
      max_tokens: 16000,
      thinking: { type: 'adaptive' },
      messages: [{ role: 'user', content: instruction }],
      output_config: { format: zodOutputFormat(schema) },
    } as any,
    { signal: opts.signal },
  );
  const m = message as any;
  if (m.stop_reason === 'refusal') {
    const category = m.stop_details?.category ? ` (${m.stop_details.category})` : '';
    throw new AnthropicError(`Claude declined this topic${category}. Try rewording it.`, 'bad-request');
  }
  if (!m.parsed_output) {
    throw new AnthropicError(
      m.stop_reason === 'max_tokens' ? 'Claude ran out of room before finishing the script. Try again.' : 'Claude returned no parseable script. Try again.',
    );
  }
  return m.parsed_output;
}

async function parseWith<S extends z.ZodType>(opts: AnthropicOptions, instruction: string, schema: S): Promise<z.infer<S>> {
  const requested = opts.model || DEFAULT_ANTHROPIC_MODEL;
  const models = claudeModelOrder(requested);
  const attempts: { model: string; failure: GeminiFailure }[] = [];
  for (let i = 0; i < models.length; i++) {
    const model = models[i];
    try {
      const out = await parseOnce(opts, model, instruction, schema);
      if (model !== requested) opts.onNotice?.(`Written with ${model} — ${requested} was unavailable.`);
      return out;
    } catch (e) {
      if (e instanceof AnthropicError) throw e;
      const kind = classifyAnthropicError(e);
      if (kind === null) throw e;
      const status = e instanceof Anthropic.APIError ? (e.status ?? 0) : 0;
      attempts.push({ model, failure: { kind, status } });
      if (kind === 'auth') throw new AnthropicError(describeExhausted('auth', 'Claude', []), 'auth');
      if (kind === 'bad-request' || kind === 'other') {
        const code = e instanceof Anthropic.APIError ? (e.status ?? '') : '';
        throw new AnthropicError(`Anthropic ${code}: ${(e as Error).message}`.trim(), kind);
      }
      if (kind === 'quota-day') throw new AnthropicError('The Anthropic account is out of credit. Top it up, or switch the provider to Gemini.', kind);
      if (i + 1 < models.length) opts.onNotice?.(`${model} is ${kind === 'unavailable' ? 'unavailable' : 'busy'} — trying ${models[i + 1]}…`);
    }
  }
  throw new AnthropicError(describeAllFailed('Claude', attempts), summariseKinds(attempts.map((a) => a.failure.kind)));
}

export async function generateShortScript(
  opts: AnthropicOptions,
  topic: string,
  category: string,
  recentArchetypes: string[] = [],
  extraPrompt = '',
  structure: ShortStructure | string = 'single',
  clipBudget: number = DEFAULT_CLIP_BUDGET,
  entry?: PromptEntry & { id?: string; tag_line?: string },
  titles?: TitleRuleConfig,
): Promise<ShortScript> {
  const raw = await parseWith(
    opts,
    shortFormInstruction(topic, category, recentArchetypes, structure, clipBudget, entry, titles) + extraPrompt,
    ShortScriptSchema,
  );
  return toShortScript(raw, structure, entry);
}

export async function generateLongScript(
  opts: AnthropicOptions,
  topic: string,
  category: string,
  chapters = 4,
  recentArchetypes: string[] = [],
  extraPrompt = '',
  structure = 'standard',
  entry?: PromptEntry & { id?: string },
): Promise<LongScript> {
  const raw = await parseWith(opts, longFormInstruction(topic, category, chapters, recentArchetypes, structure, entry) + extraPrompt, LongScriptSchema);
  return toLongScript(raw, structure, entry);
}

export async function planVisuals<S extends z.ZodType>(opts: AnthropicOptions, instruction: string, schema: S): Promise<z.infer<S>> {
  return parseWith(opts, instruction, schema);
}

export async function generateTopicIdeas(
  opts: AnthropicOptions,
  category: string,
  count: number,
  existing: string[],
  extraPrompt = '',
  priority?: string[],
): Promise<TopicIdea[]> {
  const res = await parseWith(opts, topicIdeasInstruction(category, count, existing, priority) + extraPrompt, TopicIdeasSchema);
  return res.topics;
}

export async function verifyAnthropicKey(apiKey: string): Promise<boolean> {
  try {
    await client(apiKey).models.list({ limit: 1 });
    return true;
  } catch {
    return false;
  }
}

export async function listAnthropicModels(apiKey: string): Promise<Array<{ id: string; label: string }>> {
  const page = await client(apiKey).models.list({ limit: 50 });
  return page.data.map((m) => ({ id: m.id, label: m.display_name ?? m.id }));
}

export async function classifyRelevance(opts: AnthropicOptions, items: Layer2Item[]): Promise<Map<string, Layer2Label>> {
  const json = await parseWith(opts, layer2Prompt(items), RelevanceLabelsSchema);
  return parseLayer2Response(json, items);
}

export async function fillBlanks(opts: AnthropicOptions, instruction: string): Promise<z.infer<typeof FillBlanksSchema>> {
  return parseWith(opts, instruction, FillBlanksSchema);
}

export async function checkTitle(opts: AnthropicOptions, title: string): Promise<z.infer<typeof TitleCheckSchema>> {
  return parseWith(opts, titleCheckInstruction(title), TitleCheckSchema);
}
