import { randomBytes, createHmac } from 'node:crypto';

export function generateToken() {
  return randomBytes(16);
}

export function hashIp(ip, pepper) {
  return createHmac('sha256', pepper).update(ip).digest();
}

export function tokenToBase64Url(buf) {
  return buf.toString('base64')
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function base64UrlToToken(s) {
  const pad = s.length % 4 === 0 ? '' : '='.repeat(4 - (s.length % 4));
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/') + pad;
  const buf = Buffer.from(b64, 'base64');
  if (buf.length !== 16) throw new Error('invalid token length');
  return buf;
}
