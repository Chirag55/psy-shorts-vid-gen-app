import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  base64ToBytes,
  detectFontFormat,
  detectImageFormat,
  guardFontBytes,
  guardImageBytes,
  planDecodeSize,
} from '../binaryGuards';

const bytes = (...values: number[]) => new Uint8Array(values);
const padded = (header: number[], length = 32) => {
  const out = new Uint8Array(length);
  out.set(header);
  return out;
};

describe('detectFontFormat', () => {
  it('recognises a TrueType header', () => {
    assert.equal(detectFontFormat(padded([0x00, 0x01, 0x00, 0x00])), 'truetype');
  });

  it('recognises an OpenType/CFF header', () => {
    assert.equal(detectFontFormat(padded([0x4f, 0x54, 0x54, 0x4f])), 'opentype');
  });

  it('recognises WOFF, which FreeType cannot load', () => {
    assert.equal(detectFontFormat(padded([0x77, 0x4f, 0x46, 0x46])), 'woff');
  });

  it('rejects arbitrary data rather than letting it reach FreeType', () => {
    assert.equal(detectFontFormat(padded([0x12, 0x34, 0x56, 0x78])), 'unknown');
  });

  it('treats a truncated buffer as unknown', () => {
    assert.equal(detectFontFormat(bytes(0x00, 0x01)), 'unknown');
  });
});

describe('guardFontBytes', () => {
  const valid = padded([0x00, 0x01, 0x00, 0x00], 100);

  it('passes a valid font', () => {
    assert.equal(guardFontBytes(valid).ok, true);
  });

  it('catches empty data, which is what a failed URI load yields', () => {
    const result = guardFontBytes(new Uint8Array(0));
    assert.equal(result.ok, false);
    assert.match(result.reason ?? '', /empty/);
  });

  it('catches null', () => {
    assert.equal(guardFontBytes(null).ok, false);
  });

  it('catches a truncated font by length', () => {
    const result = guardFontBytes(valid, 200);
    assert.equal(result.ok, false);
    assert.match(result.reason ?? '', /truncated/);
  });

  it('accepts a font whose length matches', () => {
    assert.equal(guardFontBytes(valid, 100).ok, true);
  });

  it('explains WOFF rather than crashing on it', () => {
    const result = guardFontBytes(padded([0x77, 0x4f, 0x46, 0x46], 100));
    assert.equal(result.ok, false);
    assert.match(result.reason ?? '', /WOFF/);
  });
});

describe('detectImageFormat', () => {
  it('recognises PNG', () => {
    assert.equal(detectImageFormat(padded([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])), 'png');
  });

  it('recognises JPEG', () => {
    assert.equal(detectImageFormat(padded([0xff, 0xd8, 0xff, 0xe0])), 'jpeg');
  });

  it('recognises WebP, which needs the marker at offset 8', () => {
    const webp = new Uint8Array(32);
    webp.set([0x52, 0x49, 0x46, 0x46], 0);
    webp.set([0x57, 0x45, 0x42, 0x50], 8);
    assert.equal(detectImageFormat(webp), 'webp');
  });

  it('does not mistake a bare RIFF container for WebP', () => {
    assert.equal(detectImageFormat(padded([0x52, 0x49, 0x46, 0x46])), 'unknown');
  });

  it('rejects arbitrary data', () => {
    assert.equal(detectImageFormat(padded([0x00, 0x00, 0x00, 0x00])), 'unknown');
  });
});

describe('guardImageBytes', () => {
  it('passes a PNG', () => {
    assert.equal(guardImageBytes(padded([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])).ok, true);
  });

  it('catches empty data with an actionable reason', () => {
    const result = guardImageBytes(new Uint8Array(0));
    assert.equal(result.ok, false);
    assert.match(result.reason ?? '', /empty/);
  });

  it('tells the user what to do about an unrecognised file', () => {
    const result = guardImageBytes(padded([0x01, 0x02, 0x03, 0x04]));
    assert.equal(result.ok, false);
    assert.match(result.reason ?? '', /PNG/);
  });
});

describe('planDecodeSize', () => {
  it('leaves a small image alone', () => {
    const plan = planDecodeSize(600, 600);
    assert.equal(plan.wasDownscaled, false);
    assert.equal(plan.targetWidth, 600);
  });

  it('scales an oversized image under the ceiling', () => {
    const plan = planDecodeSize(4000, 3000, 4_000_000);
    assert.equal(plan.wasDownscaled, true);
    assert.ok(plan.targetWidth * plan.targetHeight <= 4_000_000);
  });

  it('preserves aspect ratio', () => {
    const plan = planDecodeSize(4000, 2000, 1_000_000);
    const sourceRatio = 4000 / 2000;
    const targetRatio = plan.targetWidth / plan.targetHeight;
    assert.ok(Math.abs(sourceRatio - targetRatio) < 0.01);
  });

  it('never produces a zero dimension', () => {
    const plan = planDecodeSize(10_000, 1, 100);
    assert.ok(plan.targetWidth >= 1);
    assert.ok(plan.targetHeight >= 1);
  });

  it('handles a zero-area image without dividing by zero', () => {
    assert.equal(planDecodeSize(0, 0).wasDownscaled, false);
  });
});

describe('base64ToBytes', () => {
  it('decodes a known string', () => {
    assert.deepEqual(Array.from(base64ToBytes('SGVsbG8=')), [72, 101, 108, 108, 111]);
  });

  it('round-trips arbitrary bytes', () => {
    const original = Uint8Array.from({ length: 256 }, (_, i) => i);
    const encoded = Buffer.from(original).toString('base64');
    assert.deepEqual(Array.from(base64ToBytes(encoded)), Array.from(original));
  });

  it('ignores line breaks, which a wrapped literal contains', () => {
    assert.deepEqual(Array.from(base64ToBytes('SGVs\nbG8=')), [72, 101, 108, 108, 111]);
  });

  it('returns an empty array for an empty string', () => {
    assert.equal(base64ToBytes('').length, 0);
  });

  it('handles every padding case', () => {
    assert.deepEqual(Array.from(base64ToBytes('QQ==')), [65]);
    assert.deepEqual(Array.from(base64ToBytes('QUI=')), [65, 66]);
    assert.deepEqual(Array.from(base64ToBytes('QUJD')), [65, 66, 67]);
  });
});
