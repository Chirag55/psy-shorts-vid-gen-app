import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { connectiveStillDuration, kenBurnsFilter, moveForChapter, setptsFactor } from '../kenburns';

describe('connectiveStillDuration', () => {
  it('fills the audio the hero clips do not cover', () => {
    assert.equal(connectiveStillDuration(30, 9, 9), 12);
  });

  it('floors at two seconds when the hero clips overrun the audio', () => {
    assert.equal(connectiveStillDuration(15, 9, 9), 2);
  });

  it('never returns a negative duration', () => {
    assert.ok(connectiveStillDuration(1, 20, 20) >= 2);
  });
});

describe('kenBurnsFilter', () => {
  it('converts duration to frames at 24fps', () => {
    assert.match(kenBurnsFilter('zoom_in', 10, 1920, 1080), /d=240/);
  });

  it('targets the requested output size', () => {
    assert.match(kenBurnsFilter('pan_left', 5, 1080, 1920), /s=1080x1920/);
  });

  it('emits a distinct expression per move', () => {
    const moves = ['zoom_in', 'zoom_out', 'pan_left', 'pan_right'] as const;
    const filters = new Set(moves.map((m) => kenBurnsFilter(m, 5, 1920, 1080)));
    assert.equal(filters.size, 4);
  });

  it('clamps a zero duration to at least one frame', () => {
    assert.match(kenBurnsFilter('zoom_in', 0, 1920, 1080), /d=1/);
  });
});

describe('setptsFactor', () => {
  it('returns null for drift under one percent', () => {
    assert.equal(setptsFactor(10, 10.05), null);
  });

  it('stretches video to a longer audio track', () => {
    assert.equal(setptsFactor(12, 10), 1.2);
  });

  it('clamps an extreme correction to a watchable range', () => {
    assert.equal(setptsFactor(100, 10), 1.35);
    assert.equal(setptsFactor(1, 10), 0.75);
  });

  it('returns null for unusable durations', () => {
    assert.equal(setptsFactor(10, 0), null);
    assert.equal(setptsFactor(0, 10), null);
  });
});

describe('moveForChapter', () => {
  it('never repeats a move on consecutive chapters', () => {
    for (let i = 0; i < 8; i++) {
      assert.notEqual(moveForChapter(i), moveForChapter(i + 1));
    }
  });
});
