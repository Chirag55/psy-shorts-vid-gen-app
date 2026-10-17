import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { emotionFor } from '../mascot';

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
