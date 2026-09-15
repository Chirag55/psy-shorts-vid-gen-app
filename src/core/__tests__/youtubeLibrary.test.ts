import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  formatCount,
  formatDuration,
  formatPublished,
  isLikelyShort,
  parseIso8601Duration,
  pickThumbnail,
  SHORTS_MAX_SECONDS,
} from '../youtubeLibrary';

describe('parseIso8601Duration', () => {
  it('parses minutes and seconds', () => {
    assert.equal(parseIso8601Duration('PT1M30S'), 90);
  });

  it('parses seconds alone', () => {
    assert.equal(parseIso8601Duration('PT45S'), 45);
  });

  it('parses hours', () => {
    assert.equal(parseIso8601Duration('PT1H2M3S'), 3723);
  });

  it('parses days, which long livestream archives use', () => {
    assert.equal(parseIso8601Duration('P1DT2H'), 93600);
  });

  it('parses fractional seconds', () => {
    assert.equal(parseIso8601Duration('PT1.5S'), 1.5);
  });

  it('returns 0 rather than NaN for junk, so sorting cannot break', () => {
    assert.equal(parseIso8601Duration('nonsense'), 0);
    assert.equal(parseIso8601Duration(''), 0);
  });
});

describe('isLikelyShort', () => {
  it('counts a 60 second video', () => {
    assert.equal(isLikelyShort({ durationSeconds: 60 }), true);
  });

  it('counts up to the three minute ceiling', () => {
    assert.equal(isLikelyShort({ durationSeconds: SHORTS_MAX_SECONDS }), true);
  });

  it('excludes anything past the ceiling', () => {
    assert.equal(isLikelyShort({ durationSeconds: SHORTS_MAX_SECONDS + 1 }), false);
  });

  it('excludes an unknown duration instead of guessing', () => {
    assert.equal(isLikelyShort({ durationSeconds: 0 }), false);
  });
});

describe('formatCount', () => {
  it('leaves small numbers alone', () => {
    assert.equal(formatCount(0), '0');
    assert.equal(formatCount(999), '999');
  });

  it('abbreviates thousands with one decimal below 10K', () => {
    assert.equal(formatCount(1200), '1.2K');
    assert.equal(formatCount(12_000), '12K');
  });

  it('drops a trailing .0', () => {
    assert.equal(formatCount(2000), '2K');
    assert.equal(formatCount(3_000_000), '3M');
  });

  it('abbreviates millions', () => {
    assert.equal(formatCount(1_500_000), '1.5M');
  });

  it('handles junk without emitting NaN', () => {
    assert.equal(formatCount(Number.NaN), '0');
    assert.equal(formatCount(-5), '0');
  });
});

describe('formatDuration', () => {
  it('uses M:SS', () => {
    assert.equal(formatDuration(75), '1:15');
  });

  it('pads seconds', () => {
    assert.equal(formatDuration(65), '1:05');
  });

  it('uses H:MM:SS past an hour', () => {
    assert.equal(formatDuration(3675), '1:01:15');
  });
});

describe('formatPublished', () => {
  const now = new Date('2026-09-15T12:00:00Z');

  it('reports minutes', () => {
    assert.equal(formatPublished('2026-09-15T11:30:00Z', now), '30 minutes ago');
  });

  it('singularises', () => {
    assert.equal(formatPublished('2026-09-14T12:00:00Z', now), '1 day ago');
  });

  it('reports months', () => {
    assert.equal(formatPublished('2026-07-15T12:00:00Z', now), '2 months ago');
  });

  it('handles a moment ago', () => {
    assert.equal(formatPublished('2026-09-15T11:59:30Z', now), 'just now');
  });

  it('returns empty for an unparseable date', () => {
    assert.equal(formatPublished('not-a-date', now), '');
  });
});

describe('pickThumbnail', () => {
  it('prefers the highest resolution available', () => {
    const url = pickThumbnail({
      default: { url: 'd' },
      high: { url: 'h' },
      maxres: { url: 'm' },
    });
    assert.equal(url, 'm');
  });

  it('falls down the ladder when the best is absent', () => {
    assert.equal(pickThumbnail({ default: { url: 'd' }, medium: { url: 'm' } }), 'm');
  });

  it('returns empty when there is nothing', () => {
    assert.equal(pickThumbnail(undefined), '');
    assert.equal(pickThumbnail({}), '');
  });
});
