import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dbAvailable, setupTestEnv, resetDb } from './helpers.js';

setupTestEnv();
const { buildApp } = await import('../app.js');
const { getPool, closePool } = await import('../lib/db.js');

test('5 attempts lock the token', { skip: !dbAvailable() }, async () => {
  const app = await buildApp();
  await resetDb(getPool());

  const c = await app.inject({
    method: 'POST', url: '/api/secret',
    payload: {
      ciphertext: Buffer.from('secret').toString('base64'),
      expiresIn: 3600, burnAfterRead: false, hasPassphrase: true,
      passphraseSalt: Buffer.alloc(16).toString('base64'),
      notifyEmail: null, senderHint: null
    }
  });
  const token = c.json().token;

  for (let i = 0; i < 5; i++) {
    const r = await app.inject({ method: 'POST', url: `/api/secret/${token}/attempt` });
    assert.equal(r.statusCode, 204);
  }
  const locked = await app.inject({ method: 'GET', url: `/api/secret/${token}` });
  assert.equal(locked.statusCode, 423);

  await app.close(); await closePool();
});
