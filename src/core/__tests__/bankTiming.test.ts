import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { isKeyword, parseShotTime, retimeShots, retimeSubtitles, subtitleFrames } from '../bankTiming';
import { parseSubtitles } from '../viralBatch';

const cues = parseSubtitles([
  '0.0-0.8 | ...called you AMAZING,',
  '0.8-1.8 | and five SECONDS later,',
  '1.8-2.9 | they owned your WEEKEND.',
  '3.0-4.0 | Here are three SIGNS',
]).cues;
// 15 words spoken at 0.5 s each.
const words = Array.from({ length: 15 }, (_, i) => ({ start: i * 0.5, end: i * 0.5 + 0.4 }));

describe('bank timing', () => {
  it('reads shot times', () => {
    assert.deepEqual(parseShotTime('MF031-C1 0.0-3.0'), { id: 'MF031-C1', start: 0, end: 3 });
    assert.equal(parseShotTime('MF031-C1 3.0'), null);
  });

  it('times each subtitle block from its first spoken word', () => {
    const out = retimeSubtitles(cues, words, 7.6);
    assert.deepEqual(
      out.map((c) => [c.start, c.end]),
      [
        [0, 1.5],
        [1.5, 3.5],
        [3.5, 5.5],
        [5.5, 7.6],
      ],
    );
  });

  it('moves the cuts onto the words they were planned on', () => {
    const shots = [
      { id: 'A', start: 0, end: 3 },
      { id: 'B', start: 3, end: 4 },
    ];
    const kept = retimeShots(shots, cues, words, 7.6, { keepFirstCut: true });
    assert.deepEqual(
      kept.map((s) => [s.id, s.start, s.end]),
      [
        ['A', 0, 5.5],
        ['B', 5.5, 7.6],
      ],
    );
    // Without keepFirstCut the first cut is held in 2.0 to 2.5 s.
    const held = retimeShots(shots, cues, words, 7.6);
    assert.equal(held[0].end, 2.5);
  });

  it('never makes a shot shorter than 0.8 s', () => {
    const shots = [
      { id: 'A', start: 0, end: 0.2 },
      { id: 'B', start: 0.2, end: 0.4 },
      { id: 'C', start: 0.4, end: 4 },
    ];
    const out = retimeShots(shots, cues, words, 7.6, { keepFirstCut: true });
    for (const s of out) assert.ok(s.end - s.start >= 0.8 - 1e-9, `${s.id} ${s.end - s.start}`);
  });

  it('highlights the capitalised keyword', () => {
    assert.ok(isKeyword('AMAZING,'));
    assert.ok(!isKeyword('Here'));
    assert.ok(!isKeyword('I'));
    const f = subtitleFrames(retimeSubtitles(cues, words, 7.6))[0];
    assert.deepEqual(
      f.tokens.map((t) => t.active),
      [false, false, true],
    );
  });
});
