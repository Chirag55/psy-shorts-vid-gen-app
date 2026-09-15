/**
 * Credential hygiene helpers.
 *
 * Pure on purpose: they live here rather than beside the keystore wrapper so
 * they can be tested directly, without dragging in expo-secure-store and the
 * whole React Native module graph.
 */

/**
 * Strips what a mobile paste tends to smuggle in.
 *
 * Copying a key on a phone frequently carries a trailing newline, a
 * non-breaking space, or a zero-width character from the source page. None of
 * them are visible in the input field, and all of them make the server reject
 * an otherwise perfectly good key — which reads as "my key is wrong" when it
 * isn't. API keys never legitimately contain whitespace.
 */
export function sanitiseKey(value: string): string {
  return value
    .replace(/[\s\u00a0\u1680\u2000-\u200f\u2028\u2029\u202f\u205f\u3000\ufeff]/g, '')
    // Control characters cannot appear in a key but can survive a paste.
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f\u007f]/g, '');
}

/** Describes anything removed, so a silently-fixed paste is still visible. */
export function describeSanitisation(original: string, cleaned: string): string | null {
  if (original === cleaned) return null;
  const removed = original.length - cleaned.length;
  return `Removed ${removed} invisible or whitespace character${removed === 1 ? '' : 's'} from the pasted key.`;
}
