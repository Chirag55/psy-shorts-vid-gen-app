/**
 * Format checks run before any buffer is handed to a native decoder.
 *
 * This exists because of a specific failure mode. Skia's loaders do not throw
 * when they cannot read something — they hand back empty or partial data, and
 * the next call passes it to FreeType or an image decoder, which segfaults. The
 * process dies with no JavaScript error and no stack, so there is nothing to
 * diagnose from.
 *
 * Validating the header first turns that silent native crash into an ordinary
 * error message naming the file. Cheap insurance: a few bytes compared against
 * known magic numbers.
 */

/** Longest header any check below needs. */
const MAX_HEADER = 12;

function startsWith(bytes: Uint8Array, signature: number[], offset = 0): boolean {
  if (bytes.length < offset + signature.length) return false;
  return signature.every((byte, i) => bytes[offset + i] === byte);
}

export type FontFormat = 'truetype' | 'opentype' | 'woff' | 'unknown';

/**
 * Identifies a font buffer from its magic number.
 *
 * WOFF is recognised so it can be rejected with a useful message rather than
 * crashing FreeType, which does not accept it.
 */
export function detectFontFormat(bytes: Uint8Array): FontFormat {
  if (bytes.length < 4) return 'unknown';

  // 0x00010000 — TrueType outlines.
  if (startsWith(bytes, [0x00, 0x01, 0x00, 0x00])) return 'truetype';
  // 'true' — legacy Apple TrueType.
  if (startsWith(bytes, [0x74, 0x72, 0x75, 0x65])) return 'truetype';
  // 'ttcf' — TrueType collection.
  if (startsWith(bytes, [0x74, 0x74, 0x63, 0x66])) return 'truetype';
  // 'OTTO' — CFF outlines.
  if (startsWith(bytes, [0x4f, 0x54, 0x54, 0x4f])) return 'opentype';
  // 'wOFF' / 'wOF2'.
  if (startsWith(bytes, [0x77, 0x4f, 0x46, 0x46])) return 'woff';
  if (startsWith(bytes, [0x77, 0x4f, 0x46, 0x32])) return 'woff';

  return 'unknown';
}

export type ImageFormat = 'png' | 'jpeg' | 'webp' | 'gif' | 'unknown';

export function detectImageFormat(bytes: Uint8Array): ImageFormat {
  if (bytes.length < MAX_HEADER) return 'unknown';

  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return 'png';
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) return 'jpeg';
  // 'RIFF' .... 'WEBP'
  if (startsWith(bytes, [0x52, 0x49, 0x46, 0x46]) && startsWith(bytes, [0x57, 0x45, 0x42, 0x50], 8)) {
    return 'webp';
  }
  if (startsWith(bytes, [0x47, 0x49, 0x46, 0x38])) return 'gif';

  return 'unknown';
}

export interface GuardResult {
  ok: boolean;
  reason?: string;
}

/** Gate a font buffer before it reaches FreeType. */
export function guardFontBytes(bytes: Uint8Array | null | undefined, expectedLength?: number): GuardResult {
  if (!bytes || bytes.length === 0) {
    return { ok: false, reason: 'The font data came back empty.' };
  }
  if (expectedLength !== undefined && bytes.length !== expectedLength) {
    return {
      ok: false,
      reason: `The font decoded to ${bytes.length} bytes but should be ${expectedLength}. It was truncated.`,
    };
  }

  const format = detectFontFormat(bytes);
  if (format === 'woff') {
    return { ok: false, reason: 'WOFF fonts are not supported here — a TTF or OTF is needed.' };
  }
  if (format === 'unknown') {
    return { ok: false, reason: 'That data is not a font. Its header does not match any known font format.' };
  }

  return { ok: true };
}

/** Gate an image buffer before it reaches the native image decoder. */
export function guardImageBytes(bytes: Uint8Array | null | undefined): GuardResult {
  if (!bytes || bytes.length === 0) {
    return { ok: false, reason: 'The image data came back empty — the file may be unreadable from this location.' };
  }

  const format = detectImageFormat(bytes);
  if (format === 'unknown') {
    return {
      ok: false,
      reason: 'That file is not a PNG, JPEG, WebP or GIF. Export the mascot as a PNG and import it again.',
    };
  }

  return { ok: true };
}

/**
 * Largest image worth decoding for an overlay.
 *
 * Decoding is one cost; `readPixels` then materialises width*height*4 bytes in
 * JavaScript, and the flood fill allocates two more arrays over the same pixel
 * count. A 12-megapixel photo turns into well over 100 MB before anything is
 * drawn.
 */
export const MAX_DECODE_PIXELS = 4_000_000;

export interface SizeVerdict {
  /** Scale to apply before use; 1 when the image is already small enough. */
  scale: number;
  targetWidth: number;
  targetHeight: number;
  wasDownscaled: boolean;
}

/** Works out a safe working size, preserving aspect ratio. */
export function planDecodeSize(width: number, height: number, maxPixels = MAX_DECODE_PIXELS): SizeVerdict {
  const pixels = width * height;
  if (pixels <= maxPixels || pixels === 0) {
    return { scale: 1, targetWidth: width, targetHeight: height, wasDownscaled: false };
  }

  const scale = Math.sqrt(maxPixels / pixels);
  return {
    scale,
    targetWidth: Math.max(1, Math.floor(width * scale)),
    targetHeight: Math.max(1, Math.floor(height * scale)),
    wasDownscaled: true,
  };
}

const BASE64_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

const BASE64_LOOKUP = (() => {
  const table = new Int16Array(256).fill(-1);
  for (let i = 0; i < BASE64_ALPHABET.length; i++) {
    table[BASE64_ALPHABET.charCodeAt(i)] = i;
  }
  return table;
})();

/**
 * Decodes base64 to bytes without depending on `atob` or `Buffer`.
 *
 * Neither is reliably present across React Native runtimes, and the point of
 * decoding here rather than letting Skia do it is to hold the bytes in
 * JavaScript long enough to check their header. Unknown characters (whitespace,
 * line breaks) are skipped rather than treated as data.
 */
export function base64ToBytes(base64: string): Uint8Array {
  let significant = 0;
  for (let i = 0; i < base64.length; i++) {
    if (BASE64_LOOKUP[base64.charCodeAt(i)] !== -1) significant++;
  }

  const bytes = new Uint8Array(Math.floor((significant * 3) / 4));
  let accumulator = 0;
  let bitsHeld = 0;
  let out = 0;

  for (let i = 0; i < base64.length; i++) {
    const value = BASE64_LOOKUP[base64.charCodeAt(i)];
    if (value === -1) continue;

    accumulator = (accumulator << 6) | value;
    bitsHeld += 6;

    if (bitsHeld >= 8) {
      bitsHeld -= 8;
      bytes[out++] = (accumulator >> bitsHeld) & 0xff;
    }
  }

  return out === bytes.length ? bytes : bytes.subarray(0, out);
}
