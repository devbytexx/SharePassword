import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateToken, hashIp, tokenToBase64Url, base64UrlToToken } from '../lib/crypto-utils.js';

test('generateToken returns 16 random bytes as Buffer', () => {
  const t1 = generateToken();
  const t2 = generateToken();
  assert.equal(t1.length, 16);
  assert.equal(t2.length, 16);
  assert.notDeepEqual(t1, t2);
});

test('hashIp returns 32-byte Buffer and is deterministic with same pepper', () => {
  const h1 = hashIp('1.2.3.4', 'pepper-pepper-pepper-pepper-pepper');
  const h2 = hashIp('1.2.3.4', 'pepper-pepper-pepper-pepper-pepper');
  const h3 = hashIp('1.2.3.5', 'pepper-pepper-pepper-pepper-pepper');
  assert.equal(h1.length, 32);
  assert.deepEqual(h1, h2);
  assert.notDeepEqual(h1, h3);
});

test('hashIp output changes with different pepper', () => {
  const a = hashIp('1.2.3.4', 'pepper-a-pepper-a-pepper-a-pepper-a');
  const b = hashIp('1.2.3.4', 'pepper-b-pepper-b-pepper-b-pepper-b');
  assert.notDeepEqual(a, b);
});

test('base64url roundtrip preserves token bytes', () => {
  const t = generateToken();
  const s = tokenToBase64Url(t);
  assert.equal(s.length, 22);
  assert.match(s, /^[A-Za-z0-9_-]{22}$/);
  assert.deepEqual(base64UrlToToken(s), t);
});

test('base64UrlToToken rejects wrong-length input', () => {
  assert.throws(() => base64UrlToToken(''), /invalid token length/);
  assert.throws(() => base64UrlToToken('AAAA'), /invalid token length/);
  assert.throws(() => base64UrlToToken('A'.repeat(43)), /invalid token length/);
});
