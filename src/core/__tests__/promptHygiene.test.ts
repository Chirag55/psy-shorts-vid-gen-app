import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { auditVisualPrompt, mentionsMascot, stripMascotFromPrompt } from '../promptHygiene';

describe('mentionsMascot', () => {
  it('spots the mascot by name', () => {
    assert.equal(mentionsMascot('Professor Hoot watches from a shelf'), true);
  });

  it('spots a bare owl', () => {
    assert.equal(mentionsMascot('a small owl perched nearby'), true);
  });

  it('does not fire on unrelated words containing the letters', () => {
    assert.equal(mentionsMascot('a bowl of soup on the counter'), false);
    assert.equal(mentionsMascot('she howled with laughter'), false);
  });

  it('is case insensitive', () => {
    assert.equal(mentionsMascot('An OWL in the corner'), true);
  });
});

describe('stripMascotFromPrompt', () => {
  it('drops only the offending clause', () => {
    const cleaned = stripMascotFromPrompt(
      'A woman checks her phone, a small owl watches from the shelf, warm kitchen lighting'
    );
    assert.equal(cleaned, 'A woman checks her phone, warm kitchen lighting');
  });

  it('leaves a clean prompt untouched', () => {
    const prompt = 'A man crosses his arms, rain on the window, cinematic lighting';
    assert.equal(stripMascotFromPrompt(prompt), prompt);
  });

  it('preserves the style lock, which sits in its own clauses', () => {
    const prompt =
      'A woman pauses, Professor Hoot nods knowingly, modern 2D editorial animation, silent video';
    const cleaned = stripMascotFromPrompt(prompt);
    assert.ok(cleaned.includes('modern 2D editorial animation'));
    assert.ok(cleaned.includes('silent video'));
    assert.ok(!cleaned.includes('Hoot'));
  });

  it('returns the original rather than an empty prompt when every clause mentions it', () => {
    const prompt = 'an owl, Professor Hoot';
    assert.equal(stripMascotFromPrompt(prompt), prompt);
  });
});

describe('auditVisualPrompt', () => {
  it('reports when it changed something', () => {
    const audit = auditVisualPrompt('A kitchen scene, an owl on the counter');
    assert.equal(audit.wasStripped, true);
  });

  it('reports when it did not', () => {
    assert.equal(auditVisualPrompt('A kitchen scene, steam rising').wasStripped, false);
  });
});
