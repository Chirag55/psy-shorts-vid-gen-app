import { bucketFile, writeBase64 } from './workspace';

/**
 * Connective still generation.
 *
 * Two different Google endpoints can make an image, and which one a key can use
 * varies:
 *
 *  - **Imagen** (`imagen-*`) via `:predict` — the dedicated image model, but not
 *    enabled on every key, which is why `imagen-3.0-generate-002` returns a bare
 *    404 saying "not supported for predict".
 *  - **Gemini image models** (`gemini-*-image*`) via `:generateContent`, which
 *    return inline image data and are available far more widely.
 *
 * The call shape is picked from the model name so either can be selected in
 * Settings without the caller caring.
 */

const API_BASE = 'https://generativelanguage.googleapis.com/v1beta';

/**
 * Gemini's image model rather than Imagen: it is available on ordinary keys,
 * where Imagen usually is not.
 */
export const DEFAULT_IMAGE_MODEL = 'gemini-2.5-flash-image';

export class ImagenError extends Error {}

export interface GenerateStillOptions {
  apiKey: string;
  prompt: string;
  slug: string;
  /** Chapter key the still belongs to. */
  key: string;
  aspectRatio?: '16:9' | '9:16' | '1:1';
  model?: string;
  signal?: AbortSignal;
}

function isImagenModel(model: string): boolean {
  return model.toLowerCase().includes('imagen');
}

function notFoundMessage(model: string): string {
  return (
    `The image model "${model}" is not available on this key. ` +
    'Open Settings and use "Load image models" to see what your key can actually call. ' +
    'Imagen models in particular are often not enabled, while the Gemini image models usually are.'
  );
}

async function generateViaImagen(opts: GenerateStillOptions, model: string): Promise<string> {
  const res = await fetch(`${API_BASE}/models/${model}:predict`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': opts.apiKey },
    signal: opts.signal,
    body: JSON.stringify({
      instances: [{ prompt: opts.prompt }],
      parameters: {
        sampleCount: 1,
        aspectRatio: opts.aspectRatio ?? '16:9',
        personGeneration: 'allow_adult',
      },
    }),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    if (res.status === 404) throw new ImagenError(notFoundMessage(model));
    throw new ImagenError(`Imagen ${res.status}: ${detail.slice(0, 300) || res.statusText}`);
  }

  const payload = await res.json();
  const base64: string | undefined =
    payload?.predictions?.[0]?.bytesBase64Encoded ?? payload?.predictions?.[0]?.image?.bytesBase64Encoded;

  if (!base64) throw new ImagenError('Imagen returned no image data.');
  return base64;
}

async function generateViaGemini(opts: GenerateStillOptions, model: string): Promise<string> {
  // Aspect ratio is not a parameter here, so it is asked for in the prompt.
  const orientation =
    opts.aspectRatio === '9:16'
      ? 'Vertical 9:16 composition.'
      : opts.aspectRatio === '1:1'
        ? 'Square 1:1 composition.'
        : 'Widescreen 16:9 composition.';

  const res = await fetch(`${API_BASE}/models/${model}:generateContent`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': opts.apiKey },
    signal: opts.signal,
    body: JSON.stringify({
      contents: [{ role: 'user', parts: [{ text: `${opts.prompt}\n\n${orientation}` }] }],
      generationConfig: { responseModalities: ['IMAGE'] },
    }),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    if (res.status === 404) throw new ImagenError(notFoundMessage(model));
    throw new ImagenError(`Image generation ${res.status}: ${detail.slice(0, 300) || res.statusText}`);
  }

  const payload = await res.json();
  const parts: Array<{ inlineData?: { data?: string }; inline_data?: { data?: string } }> =
    payload?.candidates?.[0]?.content?.parts ?? [];

  for (const part of parts) {
    const data = part.inlineData?.data ?? part.inline_data?.data;
    if (data) return data;
  }

  const reason = payload?.candidates?.[0]?.finishReason;
  throw new ImagenError(
    reason
      ? `No image came back (${reason}). The prompt may have been blocked — try rewording it.`
      : 'No image data in the response.'
  );
}

export async function generateStill(opts: GenerateStillOptions): Promise<string> {
  const model = opts.model?.trim() || DEFAULT_IMAGE_MODEL;

  const base64 = isImagenModel(model)
    ? await generateViaImagen(opts, model)
    : await generateViaGemini(opts, model);

  const file = writeBase64(bucketFile('stills', opts.slug, `ch_${opts.key}_still.png`), base64);
  return file.uri;
}

/** Models this key can use for images, for the picker in Settings. */
export async function listImageModels(apiKey: string): Promise<Array<{ id: string; label: string }>> {
  const res = await fetch(`${API_BASE}/models?pageSize=200`, {
    headers: { 'x-goog-api-key': apiKey },
  });
  if (!res.ok) throw new ImagenError(`Could not list models (${res.status}). Check the API key.`);

  const data = (await res.json()) as {
    models?: Array<{ name?: string; displayName?: string; supportedGenerationMethods?: string[] }>;
  };

  return (data.models ?? [])
    .map((m) => ({
      id: (m.name ?? '').replace(/^models\//, ''),
      label: m.displayName ?? (m.name ?? '').replace(/^models\//, ''),
      methods: m.supportedGenerationMethods ?? [],
    }))
    // Imagen exposes `predict`; Gemini's image models are named for it.
    .filter((m) => m.id && (m.methods.includes('predict') || /image/i.test(m.id)))
    .filter((m) => !/embedding|aqa/i.test(m.id))
    .map(({ id, label }) => ({ id, label }))
    .sort((a, b) => b.id.localeCompare(a.id, undefined, { numeric: true }));
}
