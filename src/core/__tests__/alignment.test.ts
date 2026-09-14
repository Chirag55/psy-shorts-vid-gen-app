import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { alignmentToWords, groupIntoPhrases } from '../alignment';

/** Builds a synthetic character stream, one character every 0.1s. */
function stream(text: string) {
  const characters = [...text];
  return {
    characters,
    character_start_times_seconds: characters.map((_, i) => i * 0.1),
    character_end_times_seconds: characters.map((_, i) => (i + 1) * 0.1),
  };
}

describe('alignmentToWords', () => {
  it('splits a character stream into word boundaries', () => {
    const words = alignmentToWords(stream('Why does it'));
    assert.deepEqual(words.map((w) => w.word), ['Why', 'does', 'it']);
  });

  it('starts a word at its first character and ends at its last', () => {
    const words = alignmentToWords(stream('ab cd'));
    assert.equal(words[0].start, 0);
    assert.equal(words[0].end, 0.2);
    assert.equal(words[1].start, 0.3);
    assert.equal(words[1].end, 0.5);
  });

  it('flushes a trailing word with no terminating whitespace', () => {
    const words = alignmentToWords(stream('one two'));
    assert.equal(words.length, 2);
    assert.equal(words[1].word, 'two');
  });

  it('collapses runs of whitespace instead of emitting empty words', () => {
    const words = alignmentToWords(stream('a   b'));
    assert.deepEqual(words.map((w) => w.word), ['a', 'b']);
  });

  it('returns nothing for an empty alignment', () => {
    assert.deepEqual(alignmentToWords(stream('')), []);
  });

  it('ignores trailing timing arrays that are shorter than the character array', () => {
    const s = stream('abc def');
    s.character_end_times_seconds = s.character_end_times_seconds.slice(0, 3);
    const words = alignmentToWords(s);
    assert.deepEqual(words.map((w) => w.word), ['abc']);
  });
});

describe('groupIntoPhrases', () => {
  const words = 'one two three four five six'
    .split(' ')
    .map((word, i) => ({ word, start: i, end: i + 1 }));

  it('chunks at the requested size', () => {
    const phrases = groupIntoPhrases(words, 3);
    assert.equal(phrases.length, 2);
    assert.equal(phrases[0].length, 3);
  });

  it('breaks early on sentence-final punctuation', () => {
    const punctuated = [
      { word: 'Stop.', start: 0, end: 1 },
      { word: 'Then', start: 1, end: 2 },
      { word: 'go', start: 2, end: 3 },
    ];
    const phrases = groupIntoPhrases(punctuated, 4);
    assert.equal(phrases.length, 2);
    assert.deepEqual(phrases[0].map((w) => w.word), ['Stop.']);
  });

  it('keeps a short trailing remainder', () => {
    const phrases = groupIntoPhrases(words, 4);
    assert.equal(phrases.length, 2);
    assert.equal(phrases[1].length, 2);
  });
});
