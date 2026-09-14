import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { emotionFor, longFormMascotWindows, shortFormMascotWindows } from '../mascot';

describe('emotionFor', () => {
  it('reads surprise cues', () => {
    assert.equal(emotionFor('Why does this happen instantly?', 'mechanism'), 'surprised');
  });

  it('reads thinking cues', () => {
    assert.equal(emotionFor('Because your cortex floods with dopamine', 'hook'), 'thinking');
  });

  it('reads knowing cues', () => {
    assert.equal(emotionFor('Remember: that boundary is your power', 'hook'), 'knowing');
  });

  it('falls back to the beat default when no cue words appear', () => {
    assert.equal(emotionFor('A quiet ordinary sentence', 'reframe'), 'knowing');
    assert.equal(emotionFor('A quiet ordinary sentence', 'hook'), 'surprised');
  });

  it('falls back to the beat default when two cue sets tie', () => {
    // "why" scores surprise, "brain" scores thinking — one each.
    assert.equal(emotionFor('why brain', 'reframe'), 'knowing');
  });
});

describe('longFormMascotWindows', () => {
  it('shows Hoot at the head and tail but never mid-chapter', () => {
    const windows = longFormMascotWindows(50, 'Why does this shock you', 'Remember your power');
    assert.equal(windows.length, 2);
    assert.equal(windows[0].start, 0);
    assert.equal(windows[0].end, 3.5);
    assert.equal(windows[1].end, 50);
    assert.ok(windows[1].start > windows[0].end, 'the mechanism must be left uncovered');
  });

  it('picks the emotion from the text of each window', () => {
    const windows = longFormMascotWindows(50, 'Why does this shock you', 'Remember your power');
    assert.equal(windows[0].emotion, 'surprised');
    assert.equal(windows[1].emotion, 'knowing');
  });

  it('collapses to a single window on a very short chapter', () => {
    const windows = longFormMascotWindows(2, 'hook', 'reframe');
    assert.ok(windows.length <= 1);
  });

  it('emits nothing at all for a negligible chapter', () => {
    assert.deepEqual(longFormMascotWindows(0.5, 'hook', 'reframe'), []);
  });
});

describe('shortFormMascotWindows', () => {
  it('emits one window per beat, spanning that beat', () => {
    const windows = shortFormMascotWindows([
      { kind: 'hook', text: 'Why does this happen', start: 0, end: 4 },
      { kind: 'mechanism', text: 'Because your brain reacts', start: 4, end: 18 },
      { kind: 'reframe', text: 'Remember your power', start: 18, end: 26 },
    ]);
    assert.equal(windows.length, 3);
    assert.deepEqual(
      windows.map((w) => [w.start, w.end]),
      [[0, 4], [4, 18], [18, 26]]
    );
  });

  it('gives each beat the expression its own text implies', () => {
    const windows = shortFormMascotWindows([
      { kind: 'hook', text: 'Why does this happen', start: 0, end: 4 },
      { kind: 'mechanism', text: 'Because your brain reacts', start: 4, end: 18 },
      { kind: 'reframe', text: 'Remember your power', start: 18, end: 26 },
    ]);
    assert.deepEqual(windows.map((w) => w.emotion), ['surprised', 'thinking', 'knowing']);
  });
});
