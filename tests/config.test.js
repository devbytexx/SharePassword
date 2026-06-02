import { test } from 'node:test';
import assert from 'node:assert/strict';

test('loadConfig throws when required env missing', async () => {
  const orig = { ...process.env };
  for (const k of ['DB_PASS', 'IP_HASH_PEPPER']) delete process.env[k];
  process.env.NODE_ENV = 'production';
  const { loadConfig } = await import('../lib/config.js');
  assert.throws(() => loadConfig(), /missing required env/i);
  process.env = orig;
});

test('loadConfig returns parsed config when env complete', async () => {
  process.env.NODE_ENV = 'test';
  process.env.PORT = '3000';
  process.env.BIND = '127.0.0.1';
  process.env.DB_HOST = '127.0.0.1';
  process.env.DB_PORT = '3306';
  process.env.DB_NAME = 'sharepassword';
  process.env.DB_USER = 'sharepass';
  process.env.DB_PASS = 'x';
  process.env.SMTP_HOST = 'mail';
  process.env.SMTP_PORT = '587';
  process.env.SMTP_USER = 'u';
  process.env.SMTP_PASS = 'p';
  process.env.SMTP_FROM = 'noreply@bytexx.de';
  process.env.IP_HASH_PEPPER = 'a'.repeat(64);
  process.env.BASE_URL = 'https://secret.bytexx.de';
  process.env.DEFAULT_LANGUAGE = 'de';
  const { loadConfig } = await import('../lib/config.js?cachebust=1');
  const cfg = loadConfig();
  assert.equal(cfg.port, 3000);
  assert.equal(cfg.db.name, 'sharepassword');
  assert.equal(cfg.ipHashPepper.length, 64);
});
