import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildCaptionFrames, isBlank } from '../captions';
import type { WordTiming } from '../types';

const words: WordTiming[] = [
  { word: 'Why', start: 0.0, end: 0.4 },
  { word: 'does', start: 0.45, end: 0.9 },
  { word: 'this', start: 0.95, end: 1.3 },
  { word: 'happen', start: 1.35, end: 1.9 },
];

describe('buildCaptionFrames — short form', () => {
  const frames = buildCaptionFrames(words, { phraseSize: 4, highlightActiveWord: true });

  it('emits one frame per word', () => {
    assert.equal(frames.filter((f) => !isBlank(f)).length, words.length);
  });

  it('marks exactly one token active per frame', () => {
    for (const frame of frames.filter((f) => !isBlank(f))) {
      assert.equal(frame.tokens.filter((t) => t.active).length, 1);
    }
  });

  it('advances the active token through the phrase', () => {
    const visible = frames.filter((f) => !isBlank(f));
    visible.forEach((frame, i) => {
      assert.equal(frame.tokens.findIndex((t) => t.active), i);
    });
  });

  it('shows the whole phrase in every frame, not just the active word', () => {
    assert.equal(frames.filter((f) => !isBlank(f))[0].tokens.length, words.length);
  });

  it('produces a gapless timeline', () => {
    for (let i = 1; i < frames.length; i++) {
      assert.equal(frames[i].start, frames[i - 1].end, `gap before frame ${i}`);
    }
  });

  it('never overlaps frames', () => {
    for (const frame of frames) assert.ok(frame.end >= frame.start);
  });

  it('covers through the last word', () => {
    assert.equal(frames[frames.length - 1].end, 1.9);
  });
});

describe('buildCaptionFrames — long form', () => {
  it('emits one static frame per phrase with nothing highlighted', () => {
    const frames = buildCaptionFrames(words, { phraseSize: 2, highlightActiveWord: false });
    const visible = frames.filter((f) => !isBlank(f));
    assert.equal(visible.length, 2);
    for (const frame of visible) {
      assert.equal(frame.tokens.filter((t) => t.active).length, 0);
    }
  });
});

describe('buildCaptionFrames — edge cases', () => {
  it('returns nothing for no words', () => {
    assert.deepEqual(buildCaptionFrames([]), []);
  });

  it('inserts a blank frame for leading silence', () => {
    const frames = buildCaptionFrames([{ word: 'late', start: 3, end: 3.5 }]);
    assert.ok(isBlank(frames[0]));
    assert.equal(frames[0].start, 0);
    assert.equal(frames[0].end, 3);
  });

  it('inserts a blank frame across a mid-track pause', () => {
    const frames = buildCaptionFrames(
      [
        { word: 'one', start: 0, end: 0.5 },
        { word: 'two', start: 5, end: 5.5 },
      ],
      { phraseSize: 1 }
    );
    assert.ok(frames.some((f) => isBlank(f) && f.start === 0.5 && f.end === 5));
  });

  it('merges sub-threshold frames instead of strobing', () => {
    const rapid: WordTiming[] = [
      { word: 'a', start: 0, end: 0.01 },
      { word: 'b', start: 0.01, end: 0.02 },
      { word: 'c', start: 0.02, end: 1.0 },
    ];
    const frames = buildCaptionFrames(rapid, { minFrameDuration: 0.06 });
    for (const frame of frames) {
      assert.ok(frame.end - frame.start >= 0.05, 'no frame should be too short to see');
    }
  });

  it('clamps overlapping input rather than desyncing later captions', () => {
    const overlapping: WordTiming[] = [
      { word: 'one', start: 0, end: 2 },
      { word: 'two', start: 1, end: 3 },
    ];
    const frames = buildCaptionFrames(overlapping, { phraseSize: 1 });
    for (let i = 1; i < frames.length; i++) {
      assert.ok(frames[i].start >= frames[i - 1].end - 1e-9);
    }
  });
});
