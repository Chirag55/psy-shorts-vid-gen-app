import * as SecureStore from 'expo-secure-store';

export { describeSanitisation, sanitiseKey } from '@/core/keyHygiene';

/**
 * API credentials live in the Android keystore via SecureStore, never in
 * AsyncStorage and never in the bundle. Keys entered on this device stay on it.
 */

export type KeyName =
  | 'gemini'
  | 'anthropic'
  | 'elevenlabs'
  | 'youtubeApiKey'
  | 'youtubeClientId'
  | 'youtubeTokens';

const PREFIX = 'mindfiles.';

export async function getKey(name: KeyName): Promise<string | null> {
  try {
    return await SecureStore.getItemAsync(PREFIX + name);
  } catch {
    return null;
  }
}

export async function setKey(name: KeyName, value: string): Promise<void> {
  if (!value) {
    await SecureStore.deleteItemAsync(PREFIX + name).catch(() => undefined);
    return;
  }
  await SecureStore.setItemAsync(PREFIX + name, value);
}

export async function clearKey(name: KeyName): Promise<void> {
  await SecureStore.deleteItemAsync(PREFIX + name).catch(() => undefined);
}

/** Masks a key for display — enough to recognise it, not enough to leak it. */
export function maskKey(value: string | null | undefined): string {
  if (!value) return 'not set';
  if (value.length <= 8) return '••••';
  return `${value.slice(0, 4)}••••${value.slice(-4)}`;
}
