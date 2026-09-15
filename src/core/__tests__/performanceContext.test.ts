import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildPerformanceContext, summarisePerformance } from '../performanceContext';
import type { UploadedVideo } from '../youtubeLibrary';

const NOW = new Date('2026-09-15T12:00:00Z');
const OLD = '2026-08-01T12:00:00Z';

function video(partial: Partial<UploadedVideo> & { title: string; viewCount: number }): UploadedVideo {
  return {
    videoId: partial.title.replace(/\s/g, ''),
    description: '',
    publishedAt: OLD,
    thumbnailUrl: '',
    durationSeconds: 45,
    likeCount: 0,
    commentCount: 0,
    privacyStatus: 'public',
    ...partial,
  };
}

const sample = [
  video({ title: 'A', viewCount: 100 }),
  video({ title: 'B', viewCount: 500 }),
  video({ title: 'C', viewCount: 900 }),
  video({ title: 'D', viewCount: 300 }),
  video({ title: 'E', viewCount: 700 }),
];

describe('summarisePerformance', () => {
  it('ranks the best performers first', () => {
    const s = summarisePerformance(sample, { now: NOW, sampleLimit: 2 });
    assert.deepEqual(s.topPerformers.map((v) => v.title), ['C', 'E']);
  });

  it('computes the median view count', () => {
    const s = summarisePerformance(sample, { now: NOW });
    assert.equal(s.medianViews, 500);
  });

  it('averages the middle pair for an even sample', () => {
    const s = summarisePerformance(sample.slice(0, 4), { now: NOW });
    assert.equal(s.medianViews, 400);
  });

  it('excludes videos published in the last two days, which have not had time to perform', () => {
    const withFresh = [...sample, video({ title: 'Fresh', viewCount: 2, publishedAt: '2026-09-15T06:00:00Z' })];
    const s = summarisePerformance(withFresh, { now: NOW });
    assert.equal(s.sampleSize, 5);
    assert.ok(!s.topPerformers.some((v) => v.title === 'Fresh'));
  });

  it('excludes private and unlisted videos', () => {
    const withPrivate = [...sample, video({ title: 'Hidden', viewCount: 9999, privacyStatus: 'private' })];
    const s = summarisePerformance(withPrivate, { now: NOW });
    assert.ok(!s.topPerformers.some((v) => v.title === 'Hidden'));
  });

  it('filters to Shorts when asked', () => {
    const mixed = [...sample, video({ title: 'LongOne', viewCount: 5000, durationSeconds: 600 })];
    const s = summarisePerformance(mixed, { now: NOW, shortsOnly: true });
    assert.ok(!s.topPerformers.some((v) => v.title === 'LongOne'));
  });

  it('returns an empty summary for no eligible videos', () => {
    const s = summarisePerformance([], { now: NOW });
    assert.equal(s.sampleSize, 0);
    assert.deepEqual(s.topPerformers, []);
  });

  it('omits weak performers unless the sample is big enough to be meaningful', () => {
    const s = summarisePerformance(sample, { now: NOW, sampleLimit: 5 });
    assert.deepEqual(s.weakPerformers, []);
  });
});

describe('buildPerformanceContext', () => {
  it('produces guidance from a large enough sample', () => {
    const context = buildPerformanceContext(summarisePerformance(sample, { now: NOW }));
    assert.match(context, /CHANNEL PERFORMANCE/);
    assert.match(context, /"C"/);
  });

  it('stays silent when there is too little data to generalise from', () => {
    const tiny = summarisePerformance(sample.slice(0, 2), { now: NOW });
    assert.equal(buildPerformanceContext(tiny), '');
  });

  it('tells the model not to copy, only to learn the shape', () => {
    const context = buildPerformanceContext(summarisePerformance(sample, { now: NOW }));
    assert.match(context, /Do not copy phrasing/);
  });

  it('returns empty for an empty summary', () => {
    assert.equal(buildPerformanceContext({ sampleSize: 0, medianViews: 0, topPerformers: [], weakPerformers: [] }), '');
  });
});
