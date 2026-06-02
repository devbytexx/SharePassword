import { test } from 'node:test';
import assert from 'node:assert/strict';

process.env.NODE_ENV = 'test';
process.env.PORT = '0';
process.env.BIND = '127.0.0.1';
process.env.DB_HOST = '127.0.0.1';
process.env.DB_PORT = '3306';
process.env.DB_NAME = 'sharepassword_test';
process.env.DB_USER = 'sharepass_test';
process.env.DB_PASS = 'x';
process.env.SMTP_HOST = 'localhost';
process.env.SMTP_PORT = '2525';
process.env.SMTP_USER = '';
process.env.SMTP_PASS = '';
process.env.SMTP_FROM = 'noreply@test';
process.env.IP_HASH_PEPPER = 'p'.repeat(64);
process.env.BASE_URL = 'http://localhost:3000';
process.env.DEFAULT_LANGUAGE = 'de';

const { buildApp } = await import('../app.js');

test('GET /api/health returns ok', async () => {
  const app = await buildApp({ skipDb: true, skipMailer: true });
  const res = await app.inject({ method: 'GET', url: '/api/health' });
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.json(), { status: 'ok' });
  await app.close();
});
