import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { assTime, buildLongFormAss, buildShortFormAss } from '../ass';

const words = [
  { word: 'Why', start: 0, end: 0.4 },
  { word: 'does', start: 0.45, end: 0.9 },
  { word: 'this', start: 0.95, end: 1.3 },
];

describe('assTime', () => {
  it('formats sub-minute times', () => {
    assert.equal(assTime(1.2), '0:00:01.20');
  });

  it('formats past an hour', () => {
    assert.equal(assTime(3661.5), '1:01:01.50');
  });

  it('clamps negative input to zero', () => {
    assert.equal(assTime(-5), '0:00:00.00');
  });

  it('never emits 100 centiseconds when rounding up', () => {
    assert.equal(assTime(0.999), '0:00:00.99');
  });
});

describe('buildShortFormAss', () => {
  const ass = buildShortFormAss(words);

  it('uses the vertical Shorts canvas', () => {
    assert.match(ass, /PlayResX: 1080/);
    assert.match(ass, /PlayResY: 1920/);
  });

  it('emits one dialogue line per word', () => {
    const lines = ass.split('\n').filter((l) => l.startsWith('Dialogue:'));
    assert.equal(lines.length, words.length);
  });

  it('highlights exactly one word per line in neon yellow', () => {
    const line = ass.split('\n').find((l) => l.startsWith('Dialogue:'))!;
    assert.equal((line.match(/\\c&H0000FFFF&/g) ?? []).length, 1);
  });

  it('holds each line until the next word begins, leaving no gap', () => {
    const lines = ass.split('\n').filter((l) => l.startsWith('Dialogue:'));
    const firstEnd = lines[0].split(',')[2];
    assert.equal(firstEnd, assTime(words[1].start));
  });

  it('escapes braces so literal text cannot inject override tags', () => {
    const ass2 = buildShortFormAss([{ word: '{drop}', start: 0, end: 1 }]);
    assert.match(ass2, /\\\{drop\\\}/);
  });
});

describe('buildLongFormAss', () => {
  it('uses the widescreen canvas and the scrub-bar safe margin', () => {
    const ass = buildLongFormAss(words);
    assert.match(ass, /PlayResX: 1920/);
    assert.match(ass, /,140,1$/m);
  });

  it('emits one dialogue line per phrase, not per word', () => {
    const ass = buildLongFormAss(words, { phraseSize: 3 });
    const lines = ass.split('\n').filter((l) => l.startsWith('Dialogue:'));
    assert.equal(lines.length, 1);
  });
});
