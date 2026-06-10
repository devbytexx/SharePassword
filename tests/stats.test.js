import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setupTestEnv } from './helpers.js';

setupTestEnv();
process.env.SP_NO_DB = '1';          // erzwingt Memory-Storage für diese Datei

const mem = await import('../lib/storage-memory.js');
const { buildApp } = await import('../app.js');

test('getCounters startet bei 0, incrementCounter zählt hoch', async () => {
  mem._reset();
  assert.deepEqual(await mem.getCounters(), { created: 0, viewed: 0 });
  await mem.incrementCounter('created');
  await mem.incrementCounter('created');
  await mem.incrementCounter('viewed');
  assert.deepEqual(await mem.getCounters(), { created: 2, viewed: 1 });
});

test('unbekannter Counter-Name wird ignoriert (kein neuer Key)', async () => {
  mem._reset();
  await mem.incrementCounter('bogus');
  assert.deepEqual(await mem.getCounters(), { created: 0, viewed: 0 });
});

test('GET /api/stats liefert created/viewed als Zahlen', async () => {
  mem._reset();
  const app = await buildApp({ skipMailer: true });
  const res = await app.inject({ method: 'GET', url: '/api/stats' });
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.json(), { created: 0, viewed: 0 });
  await app.close();
});

test('Erstellen erhöht created, Burn erhöht viewed', async () => {
  mem._reset();
  const app = await buildApp({ skipMailer: true });

  const create = await app.inject({
    method: 'POST', url: '/api/secret',
    payload: {
      ciphertext: Buffer.from('hi').toString('base64'),
      expiresIn: 3600, burnAfterRead: true, hasPassphrase: false,
      passphraseSalt: null, notifyEmail: null, senderHint: null
    }
  });
  assert.equal(create.statusCode, 200);
  const token = create.json().token;

  let stats = (await app.inject({ method: 'GET', url: '/api/stats' })).json();
  assert.equal(stats.created, 1);
  assert.equal(stats.viewed, 0);

  const burn = await app.inject({ method: 'POST', url: `/api/secret/${token}/burn` });
  assert.equal(burn.statusCode, 204);

  stats = (await app.inject({ method: 'GET', url: '/api/stats' })).json();
  assert.equal(stats.created, 1);
  assert.equal(stats.viewed, 1);

  await app.close();
});
