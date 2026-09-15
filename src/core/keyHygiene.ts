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

/**
 * Characters used to mask a secret in a web UI.
 *
 * These matter because they survive whitespace sanitising: a key copied from a
 * dashboard that shows it masked looks plausible, pastes cleanly, and then gets
 * rejected with no clue why.
 */
const MASK_CHARACTERS = /[•·∙●…*]/;

export interface KeyShape {
  length: number;
  /** True when the value contains bullet/asterisk/ellipsis masking. */
  looksMasked: boolean;
  /** True when it matches a known shape for this provider. */
  looksValid: boolean;
  /** Plain-language summary, safe to display — never contains the key. */
  summary: string;
}

/**
 * Describes a key without revealing it.
 *
 * The point is to answer "why does this key work elsewhere but not here" with
 * evidence rather than guesswork: length and shape are usually enough to show
 * that the two are not the same string.
 */
export function describeElevenLabsKey(value: string): KeyShape {
  const key = sanitiseKey(value);
  const length = key.length;
  const looksMasked = MASK_CHARACTERS.test(key);

  // Two shapes are in circulation: the current `sk_` prefixed keys, and older
  // bare hex keys still valid on long-standing accounts.
  const isPrefixed = /^sk_[0-9a-f]{40,}$/i.test(key);
  const isLegacyHex = /^[0-9a-f]{32}$/i.test(key);
  const looksValid = isPrefixed || isLegacyHex;

  let summary: string;
  if (!length) {
    summary = 'No key entered.';
  } else if (looksMasked) {
    summary =
      `The key contains masking characters (• or *), so what was copied is the hidden display ` +
      `version rather than the real value. ElevenLabs only reveals a key once, when it is created — ` +
      `after that the dashboard shows it masked. Create a new key and copy it immediately.`;
  } else if (isPrefixed) {
    summary = `Looks like a current ElevenLabs key (sk_ prefix, ${length} characters).`;
  } else if (isLegacyHex) {
    summary = `Looks like a legacy ElevenLabs key (${length} hex characters).`;
  } else if (key.startsWith('sk_')) {
    summary =
      `Has the sk_ prefix but is ${length} characters, which is shorter than expected — ` +
      `it may have been truncated when copied.`;
  } else if (key.startsWith('AIza') || key.startsWith('AQ.')) {
    summary = `This looks like a Google API key, not an ElevenLabs one. Check the fields are not swapped.`;
  } else if (key.startsWith('sk-ant')) {
    summary = `This looks like an Anthropic key, not an ElevenLabs one. Check the fields are not swapped.`;
  } else {
    summary = `${length} characters, but not a shape ElevenLabs normally issues.`;
  }

  return { length, looksMasked, looksValid, summary };
}
