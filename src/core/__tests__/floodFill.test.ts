import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { assessTransparency, clearConnectedBackground } from '../floodFill';

/** Builds an RGBA buffer from a grid where `#` is dark and `.` is white. */
function grid(rows: string[]): { pixels: Uint8Array; width: number; height: number } {
  const height = rows.length;
  const width = rows[0].length;
  const pixels = new Uint8Array(width * height * 4);

  rows.forEach((row, y) => {
    [...row].forEach((cell, x) => {
      const p = (y * width + x) * 4;
      const value = cell === '#' ? 0 : 255;
      pixels[p] = value;
      pixels[p + 1] = value;
      pixels[p + 2] = value;
      pixels[p + 3] = 255;
    });
  });

  return { pixels, width, height };
}

const alphaAt = (pixels: Uint8Array, width: number, x: number, y: number) =>
  pixels[(y * width + x) * 4 + 3];

describe('clearConnectedBackground', () => {
  it('clears white that touches the border', () => {
    const { pixels, width, height } = grid([
      '.....',
      '.###.',
      '.###.',
      '.....',
    ]);
    clearConnectedBackground(pixels, width, height, { featherEdges: false });
    assert.equal(alphaAt(pixels, width, 0, 0), 0);
    assert.equal(alphaAt(pixels, width, 4, 3), 0);
  });

  it('keeps the subject opaque', () => {
    const { pixels, width, height } = grid([
      '.....',
      '.###.',
      '.###.',
      '.....',
    ]);
    clearConnectedBackground(pixels, width, height, { featherEdges: false });
    assert.equal(alphaAt(pixels, width, 2, 1), 255);
  });

  /**
   * The case that matters: this mascot's eyes are white and fully enclosed by
   * dark outline. A colour key removes them; a border flood fill must not.
   */
  it('preserves white fully enclosed by the subject — the eyes', () => {
    const { pixels, width, height } = grid([
      '.......',
      '.#####.',
      '.#.#.#.',
      '.#####.',
      '.......',
    ]);
    clearConnectedBackground(pixels, width, height, { featherEdges: false });

    assert.equal(alphaAt(pixels, width, 2, 2), 255, 'left eye must survive');
    assert.equal(alphaAt(pixels, width, 4, 2), 255, 'right eye must survive');
    assert.equal(alphaAt(pixels, width, 0, 0), 0, 'border background must go');
  });

  it('clears background that reaches the border through a gap', () => {
    const { pixels, width, height } = grid([
      '.......',
      '.#####.',
      '.#...#.',
      '.#.####',
      '.......',
    ]);
    clearConnectedBackground(pixels, width, height, { featherEdges: false });
    // The interior connects to the outside via the gap at the right edge of row 3.
    assert.equal(alphaAt(pixels, width, 3, 2), 0);
  });

  it('reports how many pixels it cleared', () => {
    const { pixels, width, height } = grid(['...', '.#.', '...']);
    const cleared = clearConnectedBackground(pixels, width, height, { featherEdges: false });
    assert.equal(cleared, 8);
  });

  it('clears nothing when the border is already dark', () => {
    const { pixels, width, height } = grid(['###', '###', '###']);
    assert.equal(clearConnectedBackground(pixels, width, height, { featherEdges: false }), 0);
  });

  it('respects a stricter threshold', () => {
    const { pixels, width, height } = grid(['...', '.#.', '...']);
    // Mid-grey background at a threshold above it should not be cleared.
    for (let i = 0; i < width * height; i++) {
      if (pixels[i * 4] === 255) {
        pixels[i * 4] = 200;
        pixels[i * 4 + 1] = 200;
        pixels[i * 4 + 2] = 200;
      }
    }
    assert.equal(clearConnectedBackground(pixels, width, height, { threshold: 230, featherEdges: false }), 0);
    assert.ok(clearConnectedBackground(pixels, width, height, { threshold: 190, featherEdges: false }) > 0);
  });

  it('softens the boundary when feathering is on', () => {
    const { pixels, width, height } = grid([
      '.....',
      '.###.',
      '.###.',
      '.....',
    ]);
    clearConnectedBackground(pixels, width, height);
    // Every subject pixel here touches cleared background, so all are halved.
    assert.equal(alphaAt(pixels, width, 2, 1), 128);
  });

  it('handles a single-pixel image without crashing', () => {
    const { pixels, width, height } = grid(['.']);
    assert.equal(clearConnectedBackground(pixels, width, height, { featherEdges: false }), 1);
  });

  it('returns 0 for an empty buffer rather than throwing', () => {
    assert.equal(clearConnectedBackground(new Uint8Array(0), 0, 0), 0);
  });

  it('does not overrun on a truncated buffer', () => {
    assert.equal(clearConnectedBackground(new Uint8Array(4), 10, 10), 0);
  });
});

describe('assessTransparency', () => {
  it('warns when nothing was removed', () => {
    assert.match(assessTransparency(0, 100).warning ?? '', /No background was removed/);
  });

  it('warns when almost everything was removed', () => {
    assert.match(assessTransparency(99, 100).warning ?? '', /entire image/);
  });

  it('warns when barely anything was removed', () => {
    assert.match(assessTransparency(1, 100).warning ?? '', /Very little/);
  });

  it('stays quiet for a normal result', () => {
    assert.equal(assessTransparency(40, 100).warning, undefined);
  });

  it('reports the cleared fraction', () => {
    assert.equal(assessTransparency(25, 100).clearedFraction, 0.25);
  });

  it('does not divide by zero', () => {
    assert.equal(assessTransparency(0, 0).clearedFraction, 0);
  });
});
