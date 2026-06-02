// Browser AES-256-GCM + PBKDF2. Runs in Node 20 too (globalThis.crypto).

export async function generateKey() {
  return crypto.subtle.generateKey(
    { name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']
  );
}

export async function encryptText(plaintext, key) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const data = new TextEncoder().encode(plaintext);
  const ct = new Uint8Array(await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv }, key, data
  ));
  const out = new Uint8Array(iv.length + ct.length);
  out.set(iv, 0); out.set(ct, iv.length);
  return { ciphertext: out };
}

export async function decryptText(ciphertext, key) {
  const iv = ciphertext.slice(0, 12);
  const ct = ciphertext.slice(12);
  const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ct);
  return new TextDecoder().decode(pt);
}

export async function encryptBytes(bytes, key) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv }, key, bytes
  ));
  const out = new Uint8Array(iv.length + ct.length);
  out.set(iv, 0); out.set(ct, iv.length);
  return out;
}

export async function decryptBytes(ciphertext, key) {
  const iv = ciphertext.slice(0, 12);
  const ct = ciphertext.slice(12);
  return new Uint8Array(await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv }, key, ct
  ));
}

export async function deriveKekFromPassphrase(passphrase, saltBytes) {
  const base = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(passphrase),
    { name: 'PBKDF2' }, false, ['deriveBits']
  );
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt: saltBytes, iterations: 600000, hash: 'SHA-256' },
    base, 256
  );
  return new Uint8Array(bits);
}

export function wrapKey(rawKey, kek) {
  if (rawKey.length !== kek.length) throw new Error('length mismatch');
  const out = new Uint8Array(rawKey.length);
  for (let i = 0; i < rawKey.length; i++) out[i] = rawKey[i] ^ kek[i];
  return out;
}

export const unwrapKey = wrapKey;

export function bytesToBase64Url(bytes) {
  let bin = ''; for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
export function base64UrlToBytes(s) {
  const pad = s.length % 4 === 0 ? '' : '='.repeat(4 - (s.length % 4));
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/') + pad;
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
export function bytesToBase64(bytes) {
  let bin = ''; for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}
export function base64ToBytes(s) {
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
