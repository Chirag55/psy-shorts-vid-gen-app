import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { classifyGeminiFailure, describeExhausted, nextStep, parseRetryDelay, planModelOrder, summariseKinds } from '../retry';

describe('classifyGeminiFailure', () => {
  it('reads a daily quota violation', () => {
    const body = JSON.stringify({ error: { message: 'Quota exceeded', details: [{ violations: [{ quotaId: 'GenerateRequestsPerDayPerProject', quotaValue: '50' }] }, { retryDelay: '12s' }] } });
    const f = classifyGeminiFailure(429, body);
    assert.equal(f.kind, 'quota-day');
    assert.equal(f.limit, 50);
    assert.equal(f.retryAfterMs, 12000);
  });
  it('treats limit 0 as unavailable on this key', () => {
    const body = JSON.stringify({ error: { message: 'limit: 0', details: [] } });
    assert.equal(classifyGeminiFailure(429, body).kind, 'unavailable');
  });
  it('maps statuses', () => {
    assert.equal(classifyGeminiFailure(0).kind, 'network');
    assert.equal(classifyGeminiFailure(503).kind, 'overloaded');
    assert.equal(classifyGeminiFailure(403).kind, 'auth');
  });
});

describe('nextStep', () => {
  it('stops on auth, moves on for a used-up quota', () => {
    assert.deepEqual(nextStep({ kind: 'auth', status: 401 }, 0), { action: 'stop' });
    assert.deepEqual(nextStep({ kind: 'quota-day', status: 429 }, 0), { action: 'next-model' });
  });
  it('waits out a short rate limit once', () => {
    assert.deepEqual(nextStep({ kind: 'rate-minute', status: 429, retryAfterMs: 5000 }, 0), { action: 'retry-same', waitMs: 5000 });
    assert.deepEqual(nextStep({ kind: 'rate-minute', status: 429, retryAfterMs: 5000 }, 1), { action: 'next-model' });
  });
  it('backs off on overload', () => {
    assert.deepEqual(nextStep({ kind: 'overloaded', status: 503 }, 1), { action: 'retry-same', waitMs: 3000 });
  });
});

describe('planModelOrder', () => {
  it('puts the preferred model first and drops non-text models', () => {
    const order = planModelOrder('gemini-2.5-pro', ['gemini-2.5-flash', 'gemini-2.5-flash-lite', 'veo-3', 'gemini-embedding-001', 'gemini-flash-latest']);
    assert.deepEqual(order, ['gemini-2.5-pro', 'gemini-flash-latest', 'gemini-2.5-flash', 'gemini-2.5-flash-lite']);
  });
});

describe('messages', () => {
  it('summarises mixed kinds', () => {
    assert.equal(summariseKinds(['auth', 'overloaded']), 'overloaded');
    assert.equal(parseRetryDelay('800ms'), 800);
  });
  it('explains a used-up day', () => {
    assert.match(describeExhausted('quota-day', 'Gemini', ['a']), /midnight US Pacific/);
  });
});
