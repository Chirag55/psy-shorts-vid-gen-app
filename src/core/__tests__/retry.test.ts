import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { backoffDelay, describeTransient, isTransient, withRetry } from '../retry';

const noSleep = async () => {};

describe('isTransient', () => {
  it('retries overload and rate limiting', () => {
    for (const status of [429, 500, 502, 503, 504]) {
      assert.equal(isTransient(status), true, `${status} should retry`);
    }
  });

  it('does not retry a bad key or a missing model', () => {
    for (const status of [400, 401, 403, 404]) {
      assert.equal(isTransient(status), false, `${status} should not retry`);
    }
  });
});

describe('backoffDelay', () => {
  it('grows with each attempt', () => {
    const plan = { attempts: 4, baseDelayMs: 1000 };
    assert.ok(backoffDelay(2, plan) > backoffDelay(0, plan));
  });

  it('stays under the ceiling', () => {
    const plan = { attempts: 10, baseDelayMs: 1000 };
    assert.ok(backoffDelay(9, plan) <= 15_000);
  });

  it('adds jitter so parallel retries do not resynchronise', () => {
    const plan = { attempts: 4, baseDelayMs: 1000 };
    const samples = new Set(Array.from({ length: 20 }, () => backoffDelay(1, plan)));
    assert.ok(samples.size > 1);
  });
});

describe('withRetry', () => {
  it('returns immediately on success', async () => {
    let calls = 0;
    const result = await withRetry(async () => {
      calls++;
      return { value: 'ok', status: 200, retryable: false };
    }, { attempts: 4, baseDelayMs: 1 }, noSleep);

    assert.equal(result.value, 'ok');
    assert.equal(calls, 1);
  });

  it('retries a transient failure then succeeds', async () => {
    let calls = 0;
    const result = await withRetry(async () => {
      calls++;
      return calls < 3
        ? { status: 503, retryable: true }
        : { value: 'recovered', status: 200, retryable: false };
    }, { attempts: 4, baseDelayMs: 1 }, noSleep);

    assert.equal(result.value, 'recovered');
    assert.equal(calls, 3);
  });

  it('gives up after the planned attempts', async () => {
    let calls = 0;
    const result = await withRetry(async () => {
      calls++;
      return { status: 503, retryable: true };
    }, { attempts: 3, baseDelayMs: 1 }, noSleep);

    assert.equal(calls, 3);
    assert.equal(result.value, undefined);
    assert.equal(result.status, 503);
  });

  it('stops immediately on a non-retryable status', async () => {
    let calls = 0;
    const result = await withRetry(async () => {
      calls++;
      return { status: 404, retryable: false };
    }, { attempts: 4, baseDelayMs: 1 }, noSleep);

    assert.equal(calls, 1, 'a missing model must not be retried four times');
    assert.equal(result.status, 404);
  });
});

describe('describeTransient', () => {
  it('explains an overload as the provider’s problem', () => {
    assert.match(describeTransient(503, 'Gemini'), /overloaded/);
    assert.match(describeTransient(503, 'Gemini'), /their side, not yours/);
  });

  it('explains rate limiting', () => {
    assert.match(describeTransient(429, 'Gemini'), /rate limiting/);
  });

  it('names the provider', () => {
    assert.match(describeTransient(500, 'Anthropic'), /Anthropic/);
  });
});
