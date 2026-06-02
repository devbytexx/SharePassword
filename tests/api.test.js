import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dbAvailable, setupTestEnv, resetDb } from './helpers.js';

setupTestEnv();
const { buildApp } = await import('../app.js');
const { getPool, closePool } = await import('../lib/db.js');

test('POST /api/secret creates a secret and returns base64url token', { skip: !dbAvailable() }, async () => {
  const app = await buildApp();
  await resetDb(getPool());

  const res = await app.inject({
    method: 'POST', url: '/api/secret',
    payload: {
      ciphertext: Buffer.from('hello world').toString('base64'),
      expiresIn: 3600,
      burnAfterRead: true,
      hasPassphrase: false,
      passphraseSalt: null,
      notifyEmail: null,
      senderHint: 'Unit-Test'
    }
  });
  assert.equal(res.statusCode, 200);
  const body = res.json();
  assert.match(body.token, /^[A-Za-z0-9_-]{22}$/);
  assert.equal(typeof body.expiresAt, 'number');

  await app.close();
  await closePool();
});

test('POST /api/secret rejects invalid expiresIn', { skip: !dbAvailable() }, async () => {
  const app = await buildApp();
  const res = await app.inject({
    method: 'POST', url: '/api/secret',
    payload: {
      ciphertext: Buffer.from('x').toString('base64'),
      expiresIn: 12345,
      burnAfterRead: true, hasPassphrase: false,
      passphraseSalt: null, notifyEmail: null, senderHint: null
    }
  });
  assert.equal(res.statusCode, 400);
  await app.close();
  await closePool();
});
