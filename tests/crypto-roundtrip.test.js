import { test } from 'node:test';
import assert from 'node:assert/strict';
import { encryptText, decryptText, deriveKekFromPassphrase, wrapKey, unwrapKey, generateKey }
  from '../public/js/crypto.js';

test('encryptText / decryptText roundtrip', async () => {
  const key = await generateKey();
  const { ciphertext } = await encryptText('hallo welt', key);
  const back = await decryptText(ciphertext, key);
  assert.equal(back, 'hallo welt');
});

test('passphrase: wrap + unwrap', async () => {
  const key = await generateKey();
  const rawKey = new Uint8Array(await crypto.subtle.exportKey('raw', key));
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const kek = await deriveKekFromPassphrase('topsecret', salt);
  const wrapped = wrapKey(rawKey, kek);
  const unwrapped = unwrapKey(wrapped, kek);
  assert.deepEqual(unwrapped, rawKey);
});

test('wrong passphrase yields wrong key (decrypt fails)', async () => {
  const key = await generateKey();
  const rawKey = new Uint8Array(await crypto.subtle.exportKey('raw', key));
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const goodKek = await deriveKekFromPassphrase('right', salt);
  const badKek = await deriveKekFromPassphrase('wrong', salt);
  const wrapped = wrapKey(rawKey, goodKek);
  const unwrapped = unwrapKey(wrapped, badKek);
  const { ciphertext } = await encryptText('secret', key);
  await assert.rejects(async () => {
    const badKey = await crypto.subtle.importKey('raw', unwrapped,
      { name: 'AES-GCM' }, false, ['decrypt']);
    await decryptText(ciphertext, badKey);
  });
});
