import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { continuationPrefix, hasStyleLock, STYLE_LOCK, withStyleLock } from '../styleLock';
import { slugify, datedSlug } from '../slug';
import { ytTimestamp } from '../timestamps';

describe('withStyleLock', () => {
  it('appends the lock to a bare prompt', () => {
    assert.ok(withStyleLock('A woman checks her phone').endsWith(STYLE_LOCK));
  });

  it('is idempotent', () => {
    const once = withStyleLock('A scene');
    assert.equal(withStyleLock(once), once);
  });

  it('strips a trailing comma before appending', () => {
    assert.ok(!withStyleLock('A scene,').includes(',,'));
  });

  it('matches case-insensitively when detecting an existing lock', () => {
    assert.ok(hasStyleLock(`Scene, ${STYLE_LOCK.toUpperCase()}`));
  });
});

describe('continuationPrefix', () => {
  it('restates the character so Veo holds continuity', () => {
    const prefix = continuationPrefix('in a charcoal hoodie at a kitchen table');
    assert.match(prefix, /^Continuation of previous clip: The exact same character /);
    assert.match(prefix, /charcoal hoodie/);
  });
});

describe('slugify', () => {
  it('lowercases and hyphenates', () => {
    assert.equal(slugify('Why Your Brain Panics'), 'why-your-brain-panics');
  });

  it('strips punctuation and collapses separators', () => {
    assert.equal(slugify('Left  on --- read?!'), 'left-on-read');
  });

  it('falls back rather than returning an empty slug', () => {
    assert.equal(slugify('!!!'), 'untitled');
  });

  it('prefixes the date', () => {
    assert.match(datedSlug('A Title', new Date('2026-03-04T00:00:00Z')), /^2026-03-04-a-title$/);
  });
});

describe('ytTimestamp', () => {
  it('uses M:SS below an hour', () => {
    assert.equal(ytTimestamp(75), '1:15');
  });

  it('uses H:MM:SS past an hour', () => {
    assert.equal(ytTimestamp(3675), '1:01:15');
  });

  it('starts chapter lists at 0:00', () => {
    assert.equal(ytTimestamp(0), '0:00');
  });
});
