import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import nodePath from 'node:path';
import { checkSurfaceSize, makeRasterSurface, MAX_SURFACE_PIXELS } from '../skiaSurface';

describe('checkSurfaceSize', () => {
  it('accepts an ordinary caption band', () => {
    assert.equal(checkSurfaceSize(1080, 170).ok, true);
  });

  it('rejects a zero dimension, which makes Skia return null', () => {
    const result = checkSurfaceSize(1080, 0);
    assert.equal(result.ok, false);
    assert.match(result.reason ?? '', /no area/);
  });

  it('rejects a negative dimension', () => {
    assert.equal(checkSurfaceSize(-10, 100).ok, false);
  });

  it('rejects NaN rather than passing it to native code', () => {
    assert.equal(checkSurfaceSize(Number.NaN, 100).ok, false);
  });

  it('rejects a size that would exhaust memory', () => {
    const side = Math.ceil(Math.sqrt(MAX_SURFACE_PIXELS)) + 100;
    const result = checkSurfaceSize(side, side);
    assert.equal(result.ok, false);
    assert.match(result.reason ?? '', /MB/);
  });
});

describe('makeRasterSurface', () => {
  it('uses the CPU factory, never the GPU one', () => {
    const calls: string[] = [];
    const skia = {
      Surface: {
        Make: (w: number, h: number) => {
          calls.push(`Make(${w},${h})`);
          return { id: 'raster' };
        },
        MakeOffscreen: () => {
          calls.push('MakeOffscreen');
          return { id: 'gpu' };
        },
      },
    };
    const surface = makeRasterSurface<{ id: string }>(skia, 720, 113);
    assert.equal(surface.id, 'raster');
    assert.deepEqual(calls, ['Make(720,113)']);
  });

  it('rounds fractional sizes, which Skia will not accept', () => {
    const seen: number[] = [];
    const skia = {
      Surface: {
        Make: (w: number, h: number) => {
          seen.push(w, h);
          return {};
        },
      },
    };
    makeRasterSurface(skia, 720.4, 113.6);
    assert.deepEqual(seen, [720, 114]);
  });

  it('throws a readable error when Skia returns null', () => {
    const skia = { Surface: { Make: () => null } };
    assert.throws(() => makeRasterSurface(skia, 720, 113), /could not allocate/i);
  });

  it('throws before allocating when the size is impossible', () => {
    let called = false;
    const skia = {
      Surface: {
        Make: () => {
          called = true;
          return {};
        },
      },
    };
    assert.throws(() => makeRasterSurface(skia, 0, 113));
    assert.equal(called, false, 'Skia must not be called with a bad size');
  });
});

/**
 * A GPU offscreen surface on Android ties a backend texture's lifetime to the
 * EGL context and deletes it asynchronously. Creating one per caption frame
 * killed the app outright, with no catchable error. Nothing here draws to the
 * screen, so nothing here needs the GPU — and a comment saying so is not
 * enforcement.
 */
describe('no GPU surfaces anywhere in the app', () => {
  const srcRoot = nodePath.resolve(import.meta.dirname, '../..');

  const walk = (dir: string): string[] =>
    fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
      const full = nodePath.join(dir, entry.name);
      if (entry.isDirectory()) return entry.name === '__tests__' ? [] : walk(full);
      return /\.tsx?$/.test(entry.name) ? [full] : [];
    });

  it('never calls Surface.MakeOffscreen', () => {
    const offenders = walk(srcRoot)
      .filter((file) => nodePath.basename(file) !== 'skiaSurface.ts')
      .filter((file) => /Surface\s*\.\s*MakeOffscreen/.test(fs.readFileSync(file, 'utf8')))
      .map((file) => nodePath.relative(srcRoot, file));

    assert.deepEqual(offenders, [], `GPU surface used in: ${offenders.join(', ')}`);
  });
});
