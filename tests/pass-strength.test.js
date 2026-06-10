import { test } from 'node:test';
import assert from 'node:assert/strict';
import { passphraseStrength } from '../public/js/pass-strength.js';

test('leere Eingabe ist "empty"', () => {
  assert.equal(passphraseStrength('').level, 'empty');
  assert.equal(passphraseStrength(null).level, 'empty');
});

test('kurze, einförmige Passphrase ist "weak"', () => {
  assert.equal(passphraseStrength('hallo').level, 'weak');
  assert.equal(passphraseStrength('12345678').level, 'weak');
});

test('mittellange, gemischte Passphrase ist "medium"', () => {
  assert.equal(passphraseStrength('Hallo123').level, 'medium');
});

test('lange, hoch-entropische Passphrase ist "strong"', () => {
  // entspricht dem 12-Zeichen-Vorschlag aus dem Generator
  assert.equal(passphraseStrength('Kf7$mWq2!pXz').level, 'strong');
});

test('liefert eine Bit-Schätzung mit', () => {
  const r = passphraseStrength('hallo');
  assert.ok(typeof r.bits === 'number' && r.bits > 0);
  assert.ok(passphraseStrength('Kf7$mWq2!pXz').bits > r.bits);
});
