import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { firstWordTrim, hookCardText } from '../hooks';
import { hookHitFilters } from '../renderRules';
import { FIRST_BEAT_CU, SHORT_LIGHT, shortShotPrompt } from '../shotPrompts';

const shot = {
  id: 'MF031-C1',
  kind: 'clip*',
  size: 'CU',
  setting: 'a sunlit glass office corridor in bright afternoon light',
  action: "Leo's smile as he hands Nora the files",
  move: 'slow push-in',
};

describe('A10 hook frame', () => {
  it('trims the voice head so the first word starts at 0:00', () => {
    assert.equal(firstWordTrim([{ word: 'They', start: 0.21, end: 0.4 }] as any, 0.18), 0.21);
    assert.equal(firstWordTrim([], 0.19), 0.19);
    assert.equal(firstWordTrim([{ word: 'x', start: 2, end: 2.2 }] as any, 0), 0.6);
  });

  it('layers a limited bass hit under the voice', () => {
    const f = hookHitFilters('aloud', 'ahit');
    assert.ok(f[0].startsWith("aevalsrc='"));
    assert.ok(f[1].includes('[aloud][ahit_hit]amix') && f[1].includes('alimiter') && f[1].endsWith('[ahit]'));
  });

  it('puts hook_text on frame 1 even when the POV hook was being tested', () => {
    assert.equal(
      hookCardText({ bankV2: { testHook: 'pov', hookText: 'THE FAKE PRAISE TRAP', hookTextPov: 'POV: a trap' } }),
      'THE FAKE PRAISE TRAP',
    );
  });

  it('opens on an extreme close-up with the thriller lighting', () => {
    const p = shortShotPrompt(shot, { first: true });
    assert.ok(p.includes(FIRST_BEAT_CU.charAt(0).toUpperCase() + FIRST_BEAT_CU.slice(1)));
    assert.ok(p.includes(SHORT_LIGHT));
    assert.ok(p.includes('a dim glass office corridor in dim afternoon light'));
    assert.ok(!shortShotPrompt(shot, {}).includes(FIRST_BEAT_CU));
  });
});
