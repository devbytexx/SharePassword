import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dbAvailable, setupTestEnv, resetDb } from './helpers.js';

setupTestEnv();
const { buildApp } = await import('../app.js');
const { getPool, closePool } = await import('../lib/db.js');

test('POST /api/secret rate-limits after 10/min', { skip: !dbAvailable() }, async () => {
  const app = await buildApp();
  await resetDb(getPool());

  const payload = {
    ciphertext: Buffer.from('x').toString('base64'),
    expiresIn: 3600, burnAfterRead: true, hasPassphrase: false,
    passphraseSalt: null, notifyEmail: null, senderHint: null
  };
  let last;
  for (let i = 0; i < 11; i++) {
    last = await app.inject({ method: 'POST', url: '/api/secret', payload,
      remoteAddress: '203.0.113.10' });
  }
  assert.equal(last.statusCode, 429);
  await app.close(); await closePool();
});
