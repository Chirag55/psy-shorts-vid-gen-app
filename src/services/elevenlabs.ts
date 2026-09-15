import { alignmentToWords, type ElevenLabsAlignment } from '@/core/alignment';
import type { WordTiming } from '@/core/types';
import { bucketFile, writeBase64, writeText } from './workspace';

const API_BASE = 'https://api.elevenlabs.io/v1';

export class ElevenLabsError extends Error {}

/** Voice roster from the spec, plus one alternate. */
export const VOICES = [
  { id: 'bIHbv24MWmeRgasZH58o', name: 'Will', blurb: 'Warm, engaging — free-tier default' },
  { id: 'pNInz6obpgDQGcFmaJgB', name: 'Adam', blurb: 'Deep, authoritative narration' },
  { id: 'JBFqnCBsd6RMkjVDRZzb', name: 'George', blurb: 'Articulate British documentary' },
  { id: '21m00Tcm4TlvDq8ikWAM', name: 'Rachel', blurb: 'Clear, neutral, even-paced' },
] as const;

export const DEFAULT_VOICE_ID = VOICES[0].id;

export interface Subscription {
  tier: string;
  characterCount: number;
  characterLimit: number;
  remaining: number;
  percentUsed: number;
  nextResetUnix: number | null;
}

export async function fetchSubscription(apiKey: string): Promise<Subscription> {
  const res = await fetch(`${API_BASE}/user/subscription`, { headers: { 'xi-api-key': apiKey } });
  if (!res.ok) {
    throw new ElevenLabsError(`Could not read quota (${res.status}). Check the API key.`);
  }
  const d = await res.json();
  const used = d.character_count ?? 0;
  const limit = d.character_limit ?? 0;
  return {
    tier: d.tier ?? 'unknown',
    characterCount: used,
    characterLimit: limit,
    remaining: Math.max(0, limit - used),
    percentUsed: limit > 0 ? (used / limit) * 100 : 0,
    nextResetUnix: d.next_character_count_reset_unix ?? null,
  };
}

export interface SynthesisResult {
  audioUri: string;
  alignmentUri: string;
  words: WordTiming[];
  duration: number;
  charactersUsed: number;
}

interface SynthesiseOptions {
  apiKey: string;
  voiceId: string;
  text: string;
  slug: string;
  /** Chapter key: '0' cold open, '1'..'n' chapters, '99' outro, 'short' for a short. */
  key: string;
  modelId?: string;
  signal?: AbortSignal;
}

/**
 * Synthesises one chapter and persists both the MP3 and its word alignment.
 *
 * Uses the `/with-timestamps` endpoint so alignment comes back in the same call
 * — a separate forced-alignment pass would double the character spend.
 */
export async function synthesiseChapter(opts: SynthesiseOptions): Promise<SynthesisResult> {
  const res = await fetch(`${API_BASE}/text-to-speech/${opts.voiceId}/with-timestamps`, {
    method: 'POST',
    headers: { 'xi-api-key': opts.apiKey, 'Content-Type': 'application/json' },
    signal: opts.signal,
    body: JSON.stringify({
      text: opts.text,
      model_id: opts.modelId ?? 'eleven_multilingual_v2',
      voice_settings: {
        stability: 0.5,
        similarity_boost: 0.75,
        style: 0.0,
        use_speaker_boost: true,
      },
    }),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new ElevenLabsError(`Synthesis failed (${res.status}): ${detail.slice(0, 300) || res.statusText}`);
  }

  const payload = await res.json();
  const audioBase64: string | undefined = payload?.audio_base64;
  const alignment: ElevenLabsAlignment | undefined =
    payload?.normalized_alignment ?? payload?.alignment;

  if (!audioBase64 || !alignment) {
    throw new ElevenLabsError('Response was missing audio or alignment data.');
  }

  const words = alignmentToWords(alignment);
  const audioFile = writeBase64(bucketFile('audio', opts.slug, `ch_${opts.key}.mp3`), audioBase64);
  const alignmentFile = writeText(
    bucketFile('audio', opts.slug, `ch_${opts.key}.words.json`),
    JSON.stringify(words, null, 2)
  );

  return {
    audioUri: audioFile.uri,
    alignmentUri: alignmentFile.uri,
    words,
    duration: words.length ? words[words.length - 1].end : 0,
    charactersUsed: opts.text.length,
  };
}

export interface KeyCheck {
  ok: boolean;
  /** Why it failed, when it did — worth showing rather than a bare rejection. */
  reason?: string;
}

/**
 * Probes a key across several endpoints.
 *
 * ElevenLabs keys can be scoped: a key with only `text_to_speech` permission is
 * perfectly able to narrate but gets 401 from `/v1/user`. Checking that one
 * endpoint and calling the key invalid was wrong — it rejected working keys.
 * Any endpoint answering proves the credential itself is good.
 */
export async function verifyElevenLabsKey(apiKey: string): Promise<KeyCheck> {
  const probes = ['/voices', '/user/subscription', '/user', '/models'];
  let lastStatus = 0;

  for (const path of probes) {
    try {
      const res = await fetch(`${API_BASE}${path}`, { headers: { 'xi-api-key': apiKey } });
      if (res.ok) return { ok: true };

      lastStatus = res.status;
      // 401/403 on one scoped endpoint says nothing about the key overall, so
      // keep probing; only a hard auth failure everywhere is conclusive.
      if (res.status !== 401 && res.status !== 403) break;
    } catch {
      return { ok: false, reason: 'No network connection to ElevenLabs.' };
    }
  }

  if (lastStatus === 401) return { ok: false, reason: 'ElevenLabs rejected the key (401).' };
  if (lastStatus === 403) {
    return {
      ok: false,
      reason: 'The key authenticated but has no permissions this app can read. It may still work for synthesis.',
    };
  }
  return { ok: false, reason: `ElevenLabs returned ${lastStatus || 'no response'}.` };
}
