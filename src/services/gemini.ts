import { DEFAULT_CLIP_BUDGET } from '@/core/shots';
import { layer2Prompt, parseLayer2Response, type Layer2Item, type Layer2Label } from '@/core/researchLayer2';
import {
  FILL_BLANKS_SCHEMA,
  LONGFORM_RESPONSE_SCHEMA,
  RELEVANCE_LABELS_SCHEMA,
  SHORTFORM_RESPONSE_SCHEMA,
  TITLE_CHECK_SCHEMA,
  TOPIC_IDEAS_SCHEMA,
} from '@/core/schemas';
import {
  longFormInstruction,
  shortFormInstruction,
  titleCheckInstruction,
  topicIdeasInstruction,
  type PromptEntry,
  type ShortStructure,
} from '@/core/prompts';
import { toLongScript, toShortScript } from '@/core/scriptMapping';
import {
  classifyGeminiFailure,
  describeAllFailed,
  describeExhausted,
  nextStep,
  planModelOrder,
  ScriptProviderError,
  summariseKinds,
  type FailureKind,
  type GeminiFailure,
} from '@/core/retry';
import {
  describeValidationError,
  FillBlanksSchema,
  LongScriptSchema,
  RelevanceLabelsSchema,
  ShortScriptSchema,
  TitleCheckSchema,
  TopicIdeasSchema,
} from '@/core/scriptSchemas';
import type { TitleRuleConfig } from '@/core/titleRules';
import type { LongScript, ShortScript } from '@/core/types';
import type { z } from 'zod';

const API_BASE = 'https://generativelanguage.googleapis.com/v1beta';

/** Google retires model ids; Settings lists live ones. This alias always resolves. */
export const DEFAULT_GEMINI_MODEL = 'gemini-flash-latest';

/** Used when the model list cannot be loaded. */
const FALLBACK_MODELS = ['gemini-flash-latest', 'gemini-flash-lite-latest', 'gemini-2.5-flash', 'gemini-2.5-flash-lite'];
const MODEL_LIST_TTL_MS = 30 * 60 * 1000;

export class GeminiError extends ScriptProviderError {
  constructor(message: string, kind: FailureKind = 'other') {
    super(message, kind, 'gemini');
    this.name = 'GeminiError';
  }
}

export interface GenerateOptions {
  apiKey: string;
  model?: string;
  signal?: AbortSignal;
  /** Short progress lines ("gemini-2.5-flash is busy — retrying in 2s…"). */
  onNotice?: (text: string) => void;
}

type CallResult = { ok: true; text: string } | { ok: false; failure: GeminiFailure };

async function callModel(opts: GenerateOptions, model: string, instruction: string, schema: unknown): Promise<CallResult> {
  let res: Response;
  try {
    res = await fetch(`${API_BASE}/models/${model}:generateContent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': opts.apiKey },
      signal: opts.signal,
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: instruction }] }],
        generationConfig: { temperature: 0.7, topP: 0.95, responseMimeType: 'application/json', responseSchema: schema },
      }),
    });
  } catch (e) {
    if (opts.signal?.aborted) throw e;
    return { ok: false, failure: classifyGeminiFailure(0) };
  }
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    return { ok: false, failure: classifyGeminiFailure(res.status, body) };
  }
  return { ok: true, text: await res.text() };
}

const modelCache = new Map<string, { ids: string[]; at: number }>();

async function availableModelIds(apiKey: string): Promise<string[]> {
  const cached = modelCache.get(apiKey);
  if (cached && Date.now() - cached.at < MODEL_LIST_TTL_MS) return cached.ids;
  try {
    const ids = (await listGeminiModels(apiKey)).map((m) => m.id);
    modelCache.set(apiKey, { ids, at: Date.now() });
    return ids;
  } catch {
    return FALLBACK_MODELS;
  }
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new Error('Cancelled.'));
      return;
    }
    const onAbort = () => {
      clearTimeout(timer);
      reject(new Error('Cancelled.'));
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

function failureLabel(kind: FailureKind): string {
  if (kind === 'quota-day') return 'is out of quota for today';
  if (kind === 'rate-minute') return 'hit its per-minute limit';
  return kind === 'overloaded' ? 'is overloaded' : 'is unavailable';
}

/**
 * One structured generation. Transient failures are retried on the same model;
 * capacity failures move down the key's model list (planned once, lazily).
 */
async function generateJson<T>(opts: GenerateOptions, instruction: string, schema: unknown, parse: (value: unknown) => T): Promise<T> {
  const requested = opts.model || DEFAULT_GEMINI_MODEL;
  let models = [requested];
  let planned = false;
  const attempts: { model: string; failure: GeminiFailure }[] = [];
  for (let i = 0; i < models.length; i++) {
    const model = models[i];
    for (let tries = 0; ; tries++) {
      const res = await callModel(opts, model, instruction, schema);
      if (res.ok) {
        if (model !== requested) opts.onNotice?.(`Written with ${model} — ${requested} was unavailable.`);
        return parseGenerated(res.text, parse);
      }
      const failure = res.failure;
      const step = nextStep(failure, tries);
      if (step.action === 'stop') {
        const message =
          failure.kind === 'bad-request'
            ? `Gemini rejected the request${failure.detail ? `: ${failure.detail}` : '.'}`
            : describeExhausted(failure.kind, 'Gemini', []);
        throw new GeminiError(message, failure.kind);
      }
      if (step.action === 'retry-same') {
        opts.onNotice?.(`${model} is busy — retrying in ${Math.ceil(step.waitMs / 1000)}s…`);
        await sleep(step.waitMs, opts.signal);
        continue;
      }
      attempts.push({ model, failure });
      if (!planned) {
        planned = true;
        models = planModelOrder(requested, await availableModelIds(opts.apiKey));
      }
      if (i + 1 < models.length) opts.onNotice?.(`${model} ${failureLabel(failure.kind)} — trying ${models[i + 1]}…`);
      break;
    }
  }
  throw new GeminiError(describeAllFailed('Gemini', attempts), summariseKinds(attempts.map((a) => a.failure.kind)));
}

function parseGenerated<T>(body: string, parse: (value: unknown) => T): T {
  const json = JSON.parse(body);
  const text: string | undefined = json?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) {
    const reason = json?.candidates?.[0]?.finishReason ?? json?.promptFeedback?.blockReason;
    throw new GeminiError(reason ? `Gemini returned no content (${reason}).` : 'Gemini returned an empty response.');
  }
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    throw new GeminiError('Gemini returned malformed JSON despite the response schema.');
  }
  return parse(value);
}

function validator<S extends z.ZodTypeAny>(schema: S): (value: unknown) => z.infer<S> {
  return (value) => {
    const r = schema.safeParse(value);
    if (!r.success) throw new GeminiError(describeValidationError(r.error), 'other');
    return r.data;
  };
}

export async function listGeminiModels(apiKey: string): Promise<Array<{ id: string; label: string }>> {
  const res = await fetch(`${API_BASE}/models?pageSize=200`, { headers: { 'x-goog-api-key': apiKey } });
  if (!res.ok) throw new GeminiError(`Could not list models (${res.status}). Check the API key.`);
  const json = await res.json();
  const models: any[] = json.models ?? [];
  return models
    .filter((m) => m.supportedGenerationMethods?.includes('generateContent'))
    .map((m) => ({ id: (m.name ?? '').replace(/^models\//, ''), label: m.displayName ?? (m.name ?? '').replace(/^models\//, '') }))
    .filter((m) => m.id && !m.id.includes('embedding') && !m.id.includes('aqa'))
    .sort((a, b) => b.id.localeCompare(a.id, undefined, { numeric: true }));
}

export async function generateShortScript(
  opts: GenerateOptions,
  topic: string,
  category: string,
  recentArchetypes: string[] = [],
  extraPrompt = '',
  structure: ShortStructure | string = 'single',
  clipBudget: number = DEFAULT_CLIP_BUDGET,
  entry?: PromptEntry & { id?: string; tag_line?: string },
  titles?: TitleRuleConfig,
): Promise<ShortScript> {
  const raw = await generateJson(
    opts,
    shortFormInstruction(topic, category, recentArchetypes, structure, clipBudget, entry, titles) + extraPrompt,
    SHORTFORM_RESPONSE_SCHEMA,
    validator(ShortScriptSchema),
  );
  return toShortScript(raw, structure, entry);
}

export async function generateLongScript(
  opts: GenerateOptions,
  topic: string,
  category: string,
  chapters = 4,
  recentArchetypes: string[] = [],
  extraPrompt = '',
  structure = 'standard',
  entry?: PromptEntry & { id?: string },
): Promise<LongScript> {
  const raw = await generateJson(
    opts,
    longFormInstruction(topic, category, chapters, recentArchetypes, structure, entry) + extraPrompt,
    LONGFORM_RESPONSE_SCHEMA,
    validator(LongScriptSchema),
  );
  return toLongScript(raw, structure, entry);
}

/** A free-form structured call (shot planning) with the same fallback behaviour. */
export async function planVisuals<T = unknown>(opts: GenerateOptions, instruction: string, schema: unknown): Promise<T> {
  return generateJson(opts, instruction, schema, (v) => v as T);
}

export interface TopicIdea {
  topic: string;
  category: string;
  angle: string;
}

export async function generateTopicIdeas(
  opts: GenerateOptions,
  category: string,
  count: number,
  existing: string[],
  extraPrompt = '',
  priority?: string[],
): Promise<TopicIdea[]> {
  const res = await generateJson(
    opts,
    topicIdeasInstruction(category, count, existing, priority) + extraPrompt,
    TOPIC_IDEAS_SCHEMA,
    validator(TopicIdeasSchema),
  );
  return res.topics;
}

export async function verifyGeminiKey(apiKey: string): Promise<boolean> {
  try {
    const res = await fetch(`${API_BASE}/models`, { headers: { 'x-goog-api-key': apiKey } });
    return res.ok;
  } catch {
    return false;
  }
}

/** Research layer 2 labels for a batch of candidate Shorts. */
export async function classifyRelevance(opts: GenerateOptions, items: Layer2Item[]): Promise<Map<string, Layer2Label>> {
  const json = await generateJson(opts, layer2Prompt(items), RELEVANCE_LABELS_SCHEMA, validator(RelevanceLabelsSchema));
  return parseLayer2Response(json, items);
}

export async function fillBlanks(opts: GenerateOptions, instruction: string): Promise<z.infer<typeof FillBlanksSchema>> {
  return generateJson(opts, instruction, FILL_BLANKS_SCHEMA, validator(FillBlanksSchema));
}

export async function checkTitle(opts: GenerateOptions, title: string): Promise<z.infer<typeof TitleCheckSchema>> {
  return generateJson(opts, titleCheckInstruction(title), TITLE_CHECK_SCHEMA, validator(TitleCheckSchema));
}
