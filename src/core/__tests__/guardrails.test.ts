import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { checkVoiceQuota, countWords, estimateDuration, validateScript } from '../guardrails';
import type { LongScript, ShortScript } from '../types';

/** Builds a three-beat short whose narration is exactly `words` words long. */
const shortScript = (words: number): ShortScript => ({
  mode: 'short',
  title: 'T',
  hookLine: 'H',
  characterDescription: 'c',
  archetype: 'a',
  hashtags: [],
  beats: [
    { kind: 'hook', text: Array(Math.max(1, words - 2)).fill('word').join(' '), clipPrompt: 'p' },
    { kind: 'mechanism', text: 'x', clipPrompt: 'p' },
    { kind: 'reframe', text: 'y', clipPrompt: 'p' },
  ],
});

describe('countWords', () => {
  it('ignores runs of whitespace', () => {
    assert.equal(countWords('  a   b \n c '), 3);
  });

  it('counts an empty string as zero', () => {
    assert.equal(countWords('   '), 0);
  });
});

describe('estimateDuration', () => {
  it('converts words to seconds at the channel cadence', () => {
    assert.equal(estimateDuration(Array(24).fill('w').join(' ')), 10);
  });
});

describe('validateScript — shorts', () => {
  it('passes a script inside the word band', () => {
    const issues = validateScript(shortScript(60));
    assert.equal(issues.filter((i) => i.severity === 'error').length, 0);
  });

  it('errors past the hard cap of 72 words', () => {
    const issues = validateScript(shortScript(80));
    assert.ok(issues.some((i) => i.severity === 'error' && /hard cap/.test(i.message)));
  });

  it('warns between the target and the hard cap', () => {
    const issues = validateScript(shortScript(71));
    assert.ok(issues.some((i) => i.severity === 'warning'));
    assert.equal(issues.filter((i) => i.severity === 'error').length, 0);
  });

  it('errors when the three-beat structure is broken', () => {
    const script = shortScript(60);
    script.beats = script.beats.slice(0, 2);
    assert.ok(validateScript(script).some((i) => /3 beats/.test(i.message)));
  });
});

describe('validateScript — long form', () => {
  const longScript = (words: number, closing: string): LongScript => ({
    mode: 'long',
    title: 'T',
    coldOpen: Array(words).fill('word').join(' '),
    characterDescription: 'c',
    archetype: 'a',
    closingSynthesis: closing,
    tags: [],
    chapters: [],
  });

  it('warns when the catchphrase is missing', () => {
    const issues = validateScript(longScript(500, 'The end.'));
    assert.ok(issues.some((i) => /catchphrase/.test(i.message)));
  });

  it('accepts a script that carries the catchphrase', () => {
    const issues = validateScript(longScript(500, 'Stay curious, keep your eyes wide.'));
    assert.equal(issues.filter((i) => /catchphrase/.test(i.message)).length, 0);
  });

  it('errors past the 700-word cap', () => {
    const issues = validateScript(longScript(800, 'Stay curious'));
    assert.ok(issues.some((i) => i.severity === 'error'));
  });
});

describe('checkVoiceQuota', () => {
  it('allows a synthesis that stays under the ceiling', () => {
    const check = checkVoiceQuota('a'.repeat(500), 1000, 10_000);
    assert.equal(check.allowed, true);
  });

  it('blocks a synthesis that would cross the 9,000 character ceiling', () => {
    const check = checkVoiceQuota('a'.repeat(500), 8_800, 10_000);
    assert.equal(check.allowed, false);
    assert.match(check.reason ?? '', /safety ceiling/);
  });

  it('scales the ceiling to 90% on a larger plan', () => {
    const check = checkVoiceQuota('a', 0, 100_000);
    assert.equal(check.ceiling, 9_000);
  });

  it('never reports negative remaining characters', () => {
    const check = checkVoiceQuota('a', 12_000, 10_000);
    assert.equal(check.remainingChars, 0);
  });
});
