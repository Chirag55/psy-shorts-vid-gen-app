import { bucketFile, writeBase64 } from './workspace';
import { finalisePrompt } from '@/core/styleLock';
import { classifyGeminiFailure } from '@/core/retry';

/**
 * Still generation through the Gemini API: Gemini image models via
 * generateContent, Imagen models via predict. A failure explains itself and
 * points at the always-available fallback (make the still in Flow, then Import).
 */

const API_BASE = 'https://generativelanguage.googleapis.com/v1beta';

export const DEFAULT_IMAGE_MODEL = 'gemini-2.5-flash-image';

export class ImagenError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ImagenError';
  }
}

export interface GenerateStillOptions {
  apiKey: string;
  prompt: string;
  slug: string;
  /** Chapter / shot key the still belongs to. */
  key: string;
  aspectRatio?: '16:9' | '9:16' | '1:1';
  model?: string;
  signal?: AbortSignal;
}

const IMPORT_HINT = 'Make the still in Flow (or any image app) and tap Import on this card instead.';

function isImagenModel(model: string): boolean {
  return model.toLowerCase().includes('imagen');
}

function describeImageFailure(model: string, status: number, body: string, what: string): string {
  if (status === 404) {
    return (
      `The image model "${model}" is not available on this key. ` +
      'Open Settings and use "Load image models" to see what your key can actually call. ' +
      'Imagen models in particular are often not enabled, while the Gemini image models usually are.'
    );
  }
  const f = classifyGeminiFailure(status, body);
  switch (f.kind) {
    case 'unavailable':
      return `Image generation with ${model} is not included in the free tier on this Gemini key (Google reports a limit of 0). ${IMPORT_HINT} Enabling billing on the key's Google Cloud project turns it on.`;
    case 'quota-day':
      return `Today's free image quota on this key is used up${f.limit !== undefined ? ` (limit ${f.limit}/day)` : ''}. It resets at midnight US Pacific. ${IMPORT_HINT}`;
    case 'rate-minute':
      return `The image model is rate-limiting this key right now. Wait a minute and try again, or: ${IMPORT_HINT}`;
    case 'overloaded':
      return `Google's image model is overloaded right now (HTTP ${status}). Try again shortly, or: ${IMPORT_HINT}`;
    case 'auth':
      return 'The Gemini key was rejected for image generation. Check it in Settings.';
    default:
      return `${what} ${status}: ${f.detail ?? (body.slice(0, 200) || 'request failed')}`;
  }
}

async function generateViaImagen(opts: GenerateStillOptions, model: string): Promise<string> {
  const res = await fetch(`${API_BASE}/models/${model}:predict`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': opts.apiKey },
    signal: opts.signal,
    body: JSON.stringify({
      instances: [{ prompt: opts.prompt }],
      parameters: { sampleCount: 1, aspectRatio: opts.aspectRatio ?? '16:9', personGeneration: 'allow_adult' },
    }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new ImagenError(describeImageFailure(model, res.status, body, 'Imagen'));
  }
  const json = await res.json();
  const b64 = json?.predictions?.[0]?.bytesBase64Encoded ?? json?.predictions?.[0]?.image?.bytesBase64Encoded;
  if (!b64) throw new ImagenError('Imagen returned no image data.');
  return b64;
}

async function generateViaGemini(opts: GenerateStillOptions, model: string): Promise<string> {
  const composition =
    opts.aspectRatio === '9:16' ? 'Vertical 9:16 composition.' : opts.aspectRatio === '1:1' ? 'Square 1:1 composition.' : 'Widescreen 16:9 composition.';
  const res = await fetch(`${API_BASE}/models/${model}:generateContent`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': opts.apiKey },
    signal: opts.signal,
    body: JSON.stringify({
      contents: [{ role: 'user', parts: [{ text: `${opts.prompt}\n\n${composition}` }] }],
      generationConfig: { responseModalities: ['IMAGE'] },
    }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new ImagenError(describeImageFailure(model, res.status, body, 'Image generation'));
  }
  const json = await res.json();
  const parts: any[] = json?.candidates?.[0]?.content?.parts ?? [];
  for (const p of parts) {
    const data = p.inlineData?.data ?? p.inline_data?.data;
    if (data) return data;
  }
  const reason = json?.candidates?.[0]?.finishReason;
  throw new ImagenError(reason ? `No image came back (${reason}). The prompt may have been blocked — try rewording it.` : 'No image data in the response.');
}

/** Generates a still, writes it into the project's stills bucket and returns its uri. */
export async function generateStill(opts: GenerateStillOptions): Promise<string> {
  const req = { ...opts, prompt: finalisePrompt(opts.prompt) };
  const model = opts.model?.trim() || DEFAULT_IMAGE_MODEL;
  const b64 = isImagenModel(model) ? await generateViaImagen(req, model) : await generateViaGemini(req, model);
  return writeBase64(bucketFile('stills', opts.slug, `ch_${opts.key}_still.png`), b64).uri;
}

export async function listImageModels(apiKey: string): Promise<Array<{ id: string; label: string }>> {
  const res = await fetch(`${API_BASE}/models?pageSize=200`, { headers: { 'x-goog-api-key': apiKey } });
  if (!res.ok) throw new ImagenError(`Could not list models (${res.status}). Check the API key.`);
  const json = await res.json();
  const models: any[] = json.models ?? [];
  return models
    .map((m) => ({
      id: (m.name ?? '').replace(/^models\//, ''),
      label: m.displayName ?? (m.name ?? '').replace(/^models\//, ''),
      methods: (m.supportedGenerationMethods ?? []) as string[],
    }))
    .filter((m) => m.id && (m.methods.includes('predict') || /image/i.test(m.id)))
    .filter((m) => !/embedding|aqa/i.test(m.id))
    .map((m) => ({ id: m.id, label: m.label }))
    .sort((a, b) => b.id.localeCompare(a.id, undefined, { numeric: true }));
}
