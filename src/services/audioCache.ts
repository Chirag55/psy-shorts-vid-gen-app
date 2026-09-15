import * as Crypto from 'expo-crypto';
import { Directory, File, Paths } from 'expo-file-system';
import type { WordTiming } from '@/core/types';

/**
 * Permanent cache of synthesised audio, keyed by content hash.
 *
 * ElevenLabs bills per character on every call, whether or not you keep what
 * comes back. Re-synthesising a chapter you already paid for — after a failed
 * render, a re-import, or simply tapping twice — is the easiest way to burn a
 * monthly allowance on nothing. Identical text in the same voice therefore
 * resolves from disk and costs zero.
 *
 * The cache lives outside any project directory so deleting a project never
 * throws away paid audio.
 */

const CACHE_DIR = 'audio-cache';

export interface CachedAudio {
  audioUri: string;
  words: WordTiming[];
  /** True when this came from disk, meaning no characters were spent. */
  fromCache: boolean;
}

function cacheDir(): Directory {
  const dir = new Directory(Paths.document, CACHE_DIR);
  if (!dir.exists) dir.create({ intermediates: true });
  return dir;
}

/**
 * Identity of a synthesis request. Every input that changes the audio is in the
 * key, so a voice or model change correctly misses rather than returning the
 * wrong take.
 */
export async function cacheKey(input: {
  text: string;
  voiceId: string;
  modelId: string;
}): Promise<string> {
  const canonical = JSON.stringify({
    text: input.text.trim(),
    voiceId: input.voiceId,
    modelId: input.modelId,
  });
  return Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, canonical);
}

export function lookup(key: string): CachedAudio | null {
  const audio = new File(cacheDir(), `${key}.mp3`);
  const words = new File(cacheDir(), `${key}.words.json`);
  if (!audio.exists || !words.exists) return null;

  try {
    const parsed = JSON.parse(words.textSync()) as WordTiming[];
    if (!Array.isArray(parsed)) return null;
    return { audioUri: audio.uri, words: parsed, fromCache: true };
  } catch {
    // A corrupt sidecar must not make the cache unusable; treat as a miss.
    return null;
  }
}

/**
 * Persists paid audio immediately.
 *
 * Called the moment a response arrives, before alignment is parsed or anything
 * else that could throw — once characters are spent the bytes must survive any
 * later failure.
 */
export function storeAudio(key: string, base64: string): string {
  const file = new File(cacheDir(), `${key}.mp3`);
  if (file.exists) file.delete();
  file.create({ intermediates: true, overwrite: true });
  file.write(base64, { encoding: 'base64' });
  return file.uri;
}

export function storeWords(key: string, words: WordTiming[]): void {
  const file = new File(cacheDir(), `${key}.words.json`);
  if (file.exists) file.delete();
  file.create({ intermediates: true, overwrite: true });
  file.write(JSON.stringify(words));
}

/** Copies cached audio into a project so the workspace layout stays intact. */
export async function materialise(key: string, target: File): Promise<string> {
  const source = new File(cacheDir(), `${key}.mp3`);
  if (!source.exists) throw new Error('Cached audio is missing.');
  if (target.exists) target.delete();
  await source.copy(target);
  return target.uri;
}

export interface CacheStats {
  entries: number;
  bytes: number;
  /** Characters this cache has saved paying for, given the texts it holds. */
  charactersSaved: number;
}

export function stats(): CacheStats {
  const dir = cacheDir();
  if (!dir.exists) return { entries: 0, bytes: 0, charactersSaved: 0 };

  let entries = 0;
  let bytes = 0;
  let charactersSaved = 0;

  for (const item of dir.list()) {
    if (!(item instanceof File)) continue;
    bytes += item.size ?? 0;
    if (item.name.endsWith('.mp3')) entries++;
    if (item.name.endsWith('.words.json')) {
      try {
        const words = JSON.parse(item.textSync()) as WordTiming[];
        charactersSaved += words.reduce((sum, w) => sum + w.word.length + 1, 0);
      } catch {
        // Ignore unreadable sidecars in the tally.
      }
    }
  }

  return { entries, bytes, charactersSaved };
}

export function clear(): void {
  const dir = new Directory(Paths.document, CACHE_DIR);
  if (dir.exists) dir.delete();
}
