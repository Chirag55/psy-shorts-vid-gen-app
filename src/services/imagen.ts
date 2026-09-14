import { bucketFile, writeBase64 } from './workspace';

/**
 * Connective still generation via the Imagen REST API.
 *
 * Stills are the cost lever the whole system leans on: a chapter needs three
 * visual beats, and generating the third as a still plus a Ken Burns move costs
 * a fraction of a third Veo clip.
 */

const API_BASE = 'https://generativelanguage.googleapis.com/v1beta';
const DEFAULT_MODEL = 'imagen-3.0-generate-002';

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

export async function generateStill(opts: GenerateStillOptions): Promise<string> {
  const model = opts.model ?? DEFAULT_MODEL;

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
    throw new ImagenError(`Imagen ${res.status}: ${detail.slice(0, 300) || res.statusText}`);
  }

  const payload = await res.json();
  const base64: string | undefined =
    payload?.predictions?.[0]?.bytesBase64Encoded ?? payload?.predictions?.[0]?.image?.bytesBase64Encoded;

  if (!base64) throw new ImagenError('Imagen returned no image data.');

  const file = writeBase64(bucketFile('stills', opts.slug, `ch_${opts.key}_still.png`), base64);
  return file.uri;
}
