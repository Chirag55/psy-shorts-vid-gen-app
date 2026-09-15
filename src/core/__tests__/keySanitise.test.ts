import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { describeElevenLabsKey, describeSanitisation, sanitiseKey } from '../keyHygiene';

/** Built from escapes so the test file itself stays free of literal controls. */
const NBSP = String.fromCharCode(0x00a0);
const ZERO_WIDTH = String.fromCharCode(0x200b);
const BOM = String.fromCharCode(0xfeff);
const CONTROL = String.fromCharCode(0x01) + String.fromCharCode(0x1f);

describe('sanitiseKey', () => {
  it('leaves a clean key untouched', () => {
    assert.equal(sanitiseKey('sk_abc123DEF456'), 'sk_abc123DEF456');
  });

  it('strips the trailing newline a paste usually carries', () => {
    assert.equal(sanitiseKey('sk_abc123\n'), 'sk_abc123');
  });

  it('strips surrounding spaces', () => {
    assert.equal(sanitiseKey('  sk_abc123  '), 'sk_abc123');
  });

  it('strips a non-breaking space copied from a web page', () => {
    assert.equal(sanitiseKey(`sk_abc${NBSP}123`), 'sk_abc123');
  });

  it('strips zero-width characters, which are invisible in the input field', () => {
    assert.equal(sanitiseKey(`sk_${ZERO_WIDTH}abc${BOM}123`), 'sk_abc123');
  });

  it('strips control characters', () => {
    assert.equal(sanitiseKey(`sk_abc${CONTROL}123`), 'sk_abc123');
  });

  it('strips interior whitespace, which no API key legitimately contains', () => {
    assert.equal(sanitiseKey('sk_abc 123'), 'sk_abc123');
  });
});

describe('describeSanitisation', () => {
  it('says nothing when the key was already clean', () => {
    assert.equal(describeSanitisation('sk_abc', 'sk_abc'), null);
  });

  it('reports how many characters were removed', () => {
    assert.match(describeSanitisation('sk_abc\n', 'sk_abc') ?? '', /Removed 1 invisible/);
  });

  it('pluralises correctly', () => {
    assert.match(
      describeSanitisation('  sk_abc  ', 'sk_abc') ?? '',
      /Removed 4 invisible or whitespace characters/
    );
  });
});

describe('describeElevenLabsKey', () => {
  const current = `sk_${'a1b2c3d4'.repeat(6)}`;

  it('recognises a current sk_ key', () => {
    const shape = describeElevenLabsKey(current);
    assert.equal(shape.looksValid, true);
    assert.equal(shape.looksMasked, false);
  });

  it('recognises a legacy 32-character hex key', () => {
    assert.equal(describeElevenLabsKey('a'.repeat(32)).looksValid, true);
  });

  it('flags a key copied while masked, which whitespace stripping cannot fix', () => {
    const shape = describeElevenLabsKey('sk_a1b2••••f9e8');
    assert.equal(shape.looksMasked, true);
    assert.equal(shape.looksValid, false);
    assert.match(shape.summary, /only reveals a key once/);
  });

  it('flags asterisk masking too', () => {
    assert.equal(describeElevenLabsKey('sk_a1b2****f9e8').looksMasked, true);
  });

  it('spots a truncated sk_ key', () => {
    const shape = describeElevenLabsKey('sk_a1b2c3');
    assert.equal(shape.looksValid, false);
    assert.match(shape.summary, /truncated/);
  });

  it('spots a Google key pasted into the wrong field', () => {
    assert.match(describeElevenLabsKey('AIzaSyAbc123').summary, /Google API key/);
  });

  it('spots an Anthropic key pasted into the wrong field', () => {
    assert.match(describeElevenLabsKey('sk-ant-api03-xyz').summary, /Anthropic key/);
  });

  it('reports an empty field plainly', () => {
    assert.match(describeElevenLabsKey('').summary, /No key entered/);
  });

  it('never echoes the key itself', () => {
    assert.ok(!describeElevenLabsKey(current).summary.includes(current));
  });
});
