# SharePassword Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a self-hosted one-time-secret tool (`secret.bytexx.de`) with browser-side end-to-end encryption, co-hosted on the existing Passbolt server, using Node.js + Fastify + MariaDB.

**Architecture:** Browser does AES-256-GCM encryption via Web Crypto API; key lives only in URL fragment (`#…`). Fastify backend (systemd, port 3000 localhost) stores ciphertext + metadata in MariaDB schema `sharepassword`; expired rows are deleted by a MariaDB Event Scheduler. nginx terminates TLS as a separate vhost — no impact on Passbolt.

**Tech Stack:** Node.js 20+, Fastify 4, `@fastify/rate-limit`, `@fastify/static`, `mysql2`, `nodemailer`, `dotenv`, native Web Crypto API (browser + Node 20). Vanilla JS frontend, no build step. Tests with `node:test` (built-in) + `supertest`-style via `app.inject()`.

**Spec:** [../specs/2026-06-02-sharepassword-design.md](../specs/2026-06-02-sharepassword-design.md)

---

## File Structure

```
package.json                              # deps + scripts
.env.example                              # template for /opt/sharepassword/.env
.gitignore                                # (exists)
README.md                                 # quick-start + project pointers

server.js                                 # Fastify bootstrap, port binding

lib/
  config.js                               # env loading + validation, exports CONFIG
  db.js                                   # mysql2 pool, query helpers
  crypto-utils.js                         # token gen, IP-hash
  mailer.js                               # nodemailer wrapper, async fire-and-forget

routes/
  secret.js                               # all /api/secret/* routes
  pages.js                                # /, /s/:token, /impressum, /datenschutz

public/
  index.html                              # create page (German default)
  s.html                                  # view page
  impressum.html
  datenschutz.html
  css/style.css
  js/
    crypto.js                             # browser AES-GCM + PBKDF2 utilities
    create.js                             # create-page logic
    view.js                               # view-page logic
    i18n.js                               # language loader + apply
  img/logo.svg                            # placeholder, can be replaced later

i18n/
  de.json                                 # German strings
  en.json                                 # English strings

sql/
  001-init.sql                            # schema + events (no GRANT)
  002-grants.sql.example                  # template; real one created on server

deploy/
  systemd/sharepassword.service
  nginx/secret.bytexx.de.conf
  logrotate.d/sharepassword

tests/
  api.test.js                             # API routes via app.inject()
  crypto-roundtrip.test.js                # crypto.js works in Node webcrypto
  rate-limit.test.js                      # 429 path
  brute-force.test.js                     # passphrase attempt lock
```

---

## Task 1: Project bootstrap

**Files:**
- Create: `package.json`
- Create: `.env.example`
- Create: `README.md`

- [ ] **Step 1: Create `package.json`**

```json
{
  "name": "sharepassword",
  "version": "0.1.0",
  "description": "Self-hosted one-time-secret tool (BYTEXX)",
  "private": true,
  "type": "module",
  "engines": { "node": ">=20" },
  "scripts": {
    "start": "node server.js",
    "test": "node --test --test-reporter=spec tests/"
  },
  "dependencies": {
    "@fastify/rate-limit": "^9.1.0",
    "@fastify/static": "^7.0.4",
    "dotenv": "^16.4.5",
    "fastify": "^4.28.1",
    "mysql2": "^3.11.0",
    "nodemailer": "^6.9.14"
  }
}
```

- [ ] **Step 2: Create `.env.example`**

```ini
NODE_ENV=production
PORT=3000
BIND=127.0.0.1

DB_HOST=127.0.0.1
DB_PORT=3306
DB_NAME=sharepassword
DB_USER=sharepass
DB_PASS=changeme

SMTP_HOST=mail.bytexx.de
SMTP_PORT=587
SMTP_USER=
SMTP_PASS=
SMTP_FROM=noreply@bytexx.de

# 64-Zeichen-Random, NIEMALS wechseln nach Init.
# Erzeugen: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
IP_HASH_PEPPER=changeme

BASE_URL=https://secret.bytexx.de
DEFAULT_LANGUAGE=de
```

- [ ] **Step 3: Create `README.md`**

```markdown
# SharePassword

Selbst-gehostetes One-Time-Secret-Tool. E2E-Verschlüsselung im Browser.

- **Domain:** `secret.bytexx.de`
- **Stack:** Node.js + Fastify + MariaDB, kein Build-Step
- **Doku:** [CLAUDE.md](CLAUDE.md), [docs/](docs/)
- **Design-Spec:** [docs/superpowers/specs/2026-06-02-sharepassword-design.md](docs/superpowers/specs/2026-06-02-sharepassword-design.md)
- **Implementierungsplan:** [docs/superpowers/plans/2026-06-02-sharepassword-implementation.md](docs/superpowers/plans/2026-06-02-sharepassword-implementation.md)

## Lokal entwickeln

```bash
npm install
cp .env.example .env       # Werte ausfüllen
# MariaDB-Schema einspielen (siehe docs/installation.md)
npm start
```

## Tests

```bash
npm test
```
\```

- [ ] **Step 4: Install dependencies**

Run: `npm install`
Expected: dependencies in `node_modules/`, `package-lock.json` created.

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json .env.example README.md
git commit -m "chore: project bootstrap (deps, env template, README)"
```

---

## Task 2: Configuration loader

**Files:**
- Create: `lib/config.js`
- Test: `tests/config.test.js`

- [ ] **Step 1: Write the failing test**

`tests/config.test.js`:
```javascript
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/config.test.js`
Expected: FAIL with "Cannot find module './lib/config.js'".

- [ ] **Step 3: Create `lib/config.js`**

```javascript
import 'dotenv/config';

const REQUIRED = [
  'PORT', 'BIND',
  'DB_HOST', 'DB_PORT', 'DB_NAME', 'DB_USER', 'DB_PASS',
  'SMTP_HOST', 'SMTP_PORT', 'SMTP_FROM',
  'IP_HASH_PEPPER', 'BASE_URL', 'DEFAULT_LANGUAGE'
];

export function loadConfig() {
  const missing = REQUIRED.filter(k => !process.env[k]);
  if (missing.length) {
    throw new Error(`missing required env: ${missing.join(', ')}`);
  }
  if (process.env.IP_HASH_PEPPER.length < 32) {
    throw new Error('IP_HASH_PEPPER must be at least 32 chars');
  }
  return {
    env: process.env.NODE_ENV || 'development',
    port: parseInt(process.env.PORT, 10),
    bind: process.env.BIND,
    db: {
      host: process.env.DB_HOST,
      port: parseInt(process.env.DB_PORT, 10),
      name: process.env.DB_NAME,
      user: process.env.DB_USER,
      pass: process.env.DB_PASS
    },
    smtp: {
      host: process.env.SMTP_HOST,
      port: parseInt(process.env.SMTP_PORT, 10),
      user: process.env.SMTP_USER || null,
      pass: process.env.SMTP_PASS || null,
      from: process.env.SMTP_FROM
    },
    ipHashPepper: process.env.IP_HASH_PEPPER,
    baseUrl: process.env.BASE_URL,
    defaultLanguage: process.env.DEFAULT_LANGUAGE,
    expirePresets: [3600, 86400, 604800, 2592000],
    maxBodyBytes: 7 * 1024 * 1024,
    bruteWindowSec: 15 * 60,
    bruteMaxAttempts: 5
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/config.test.js`
Expected: 2 tests pass.

- [ ] **Step 5: Commit**

```bash
git add lib/config.js tests/config.test.js
git commit -m "feat(config): env-driven config loader with validation"
```

---

## Task 3: Database schema

**Files:**
- Create: `sql/001-init.sql`
- Create: `sql/002-grants.sql.example`

- [ ] **Step 1: Create `sql/001-init.sql`**

```sql
-- SharePassword schema. Idempotent. Run as DB admin.
CREATE DATABASE IF NOT EXISTS sharepassword
  CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

USE sharepassword;

CREATE TABLE IF NOT EXISTS secrets (
  token              VARBINARY(16)    NOT NULL PRIMARY KEY,
  ciphertext         LONGBLOB         NOT NULL,
  burn_after_read    TINYINT(1)       NOT NULL DEFAULT 1,
  has_passphrase     TINYINT(1)       NOT NULL DEFAULT 0,
  passphrase_salt    VARBINARY(16)    NULL,
  notify_email       VARCHAR(255)     NULL,
  sender_hint        VARCHAR(120)     NULL,
  expires_at         DATETIME         NOT NULL,
  created_at         DATETIME         NOT NULL DEFAULT CURRENT_TIMESTAMP,
  size_bytes         INT UNSIGNED     NOT NULL,
  INDEX idx_expires (expires_at)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS brute_log (
  token              VARBINARY(16)    NOT NULL,
  ip_hash            BINARY(32)       NOT NULL,
  attempt_at         DATETIME         NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_token_time (token, attempt_at)
) ENGINE=InnoDB;

SET GLOBAL event_scheduler = ON;

DROP EVENT IF EXISTS purge_expired_secrets;
CREATE EVENT purge_expired_secrets
  ON SCHEDULE EVERY 1 MINUTE
  DO
    DELETE FROM secrets WHERE expires_at < NOW();

DROP EVENT IF EXISTS purge_brute_log;
CREATE EVENT purge_brute_log
  ON SCHEDULE EVERY 1 HOUR
  DO
    DELETE FROM brute_log WHERE attempt_at < NOW() - INTERVAL 24 HOUR;
```

- [ ] **Step 2: Create `sql/002-grants.sql.example`**

```sql
-- Template. On the server, copy to sql/002-grants.sql with the real password
-- generated via: openssl rand -base64 32
CREATE USER IF NOT EXISTS 'sharepass'@'localhost'
  IDENTIFIED BY 'REPLACE_ME_WITH_GENERATED_PASSWORD';
GRANT SELECT, INSERT, UPDATE, DELETE ON sharepassword.*
  TO 'sharepass'@'localhost';
FLUSH PRIVILEGES;
```

- [ ] **Step 3: Commit**

```bash
git add sql/
git commit -m "feat(db): schema, events, grants template"
```

---

## Task 4: Database access layer

**Files:**
- Create: `lib/db.js`

> Note: pure DB-layer tests would need a live MariaDB. We integrate-test via the API in Task 12. Keep this layer thin so the API tests cover it.

- [ ] **Step 1: Create `lib/db.js`**

```javascript
import mysql from 'mysql2/promise';

let pool = null;

export function initPool(config) {
  pool = mysql.createPool({
    host: config.db.host,
    port: config.db.port,
    database: config.db.name,
    user: config.db.user,
    password: config.db.pass,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
    dateStrings: false
  });
  return pool;
}

export function getPool() {
  if (!pool) throw new Error('db pool not initialized');
  return pool;
}

export async function closePool() {
  if (pool) { await pool.end(); pool = null; }
}

// --- secrets ---

export async function insertSecret(row) {
  const sql = `INSERT INTO secrets
    (token, ciphertext, burn_after_read, has_passphrase, passphrase_salt,
     notify_email, sender_hint, expires_at, size_bytes)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`;
  await getPool().execute(sql, [
    row.token, row.ciphertext, row.burnAfterRead ? 1 : 0,
    row.hasPassphrase ? 1 : 0, row.passphraseSalt,
    row.notifyEmail, row.senderHint, row.expiresAt, row.sizeBytes
  ]);
}

export async function getSecret(token) {
  const [rows] = await getPool().execute(
    `SELECT token, ciphertext, burn_after_read, has_passphrase,
            passphrase_salt, notify_email, sender_hint, expires_at
       FROM secrets WHERE token = ? AND expires_at >= NOW()`,
    [token]
  );
  return rows[0] || null;
}

export async function deleteSecret(token) {
  const [res] = await getPool().execute(
    `DELETE FROM secrets WHERE token = ?`,
    [token]
  );
  return res.affectedRows > 0;
}

// --- brute_log ---

export async function logAttempt(token, ipHash) {
  await getPool().execute(
    `INSERT INTO brute_log (token, ip_hash) VALUES (?, ?)`,
    [token, ipHash]
  );
}

export async function countRecentAttempts(token, windowSec) {
  const [rows] = await getPool().execute(
    `SELECT COUNT(*) AS n FROM brute_log
       WHERE token = ? AND attempt_at >= NOW() - INTERVAL ? SECOND`,
    [token, windowSec]
  );
  return rows[0].n;
}
```

- [ ] **Step 2: Commit**

```bash
git add lib/db.js
git commit -m "feat(db): mysql2 pool + secret/brute_log helpers"
```

---

## Task 5: Server-side crypto utilities

**Files:**
- Create: `lib/crypto-utils.js`
- Test: `tests/crypto-utils.test.js`

- [ ] **Step 1: Write the failing test**

`tests/crypto-utils.test.js`:
```javascript
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateToken, hashIp } from '../lib/crypto-utils.js';

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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/crypto-utils.test.js`
Expected: FAIL "Cannot find module './lib/crypto-utils.js'".

- [ ] **Step 3: Create `lib/crypto-utils.js`**

```javascript
import { randomBytes, createHash } from 'node:crypto';

export function generateToken() {
  return randomBytes(16);
}

export function hashIp(ip, pepper) {
  return createHash('sha256').update(`${pepper}|${ip}`).digest();
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/crypto-utils.test.js`
Expected: 3 tests pass.

- [ ] **Step 5: Commit**

```bash
git add lib/crypto-utils.js tests/crypto-utils.test.js
git commit -m "feat(crypto): server token generator + IP hash"
```

---

## Task 6: Mailer (stub-friendly)

**Files:**
- Create: `lib/mailer.js`
- Test: `tests/mailer.test.js`

- [ ] **Step 1: Write the failing test**

`tests/mailer.test.js`:
```javascript
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildBurnMail } from '../lib/mailer.js';

test('buildBurnMail produces sane subject and text without leaking sensitive data', () => {
  const m = buildBurnMail({
    to: 'sender@firma.de',
    from: 'noreply@bytexx.de',
    senderHint: 'Zugangsdaten Kunde X',
    ipHashHex: 'deadbeef'.repeat(8),
    when: new Date('2026-06-02T10:00:00Z')
  });
  assert.equal(m.to, 'sender@firma.de');
  assert.equal(m.from, 'noreply@bytexx.de');
  assert.match(m.subject, /abgerufen/i);
  assert.match(m.text, /Zugangsdaten Kunde X/);
  assert.match(m.text, /deadbeef/);
  assert.doesNotMatch(m.text, /token/i);   // no token leaked
  assert.doesNotMatch(m.text, /https?:/);  // no link leaked
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/mailer.test.js`
Expected: FAIL "Cannot find module".

- [ ] **Step 3: Create `lib/mailer.js`**

```javascript
import nodemailer from 'nodemailer';

let transporter = null;

export function initMailer(smtp) {
  transporter = nodemailer.createTransport({
    host: smtp.host,
    port: smtp.port,
    secure: smtp.port === 465,
    auth: (smtp.user && smtp.pass) ? { user: smtp.user, pass: smtp.pass } : undefined
  });
  return transporter;
}

export function buildBurnMail({ to, from, senderHint, ipHashHex, when }) {
  const ts = when.toISOString().replace('T', ' ').replace(/\..+/, ' UTC');
  const hintLine = senderHint ? `Hinweis des Absenders: ${senderHint}\n` : '';
  return {
    to, from,
    subject: 'SharePassword: Ihr Geheimnis wurde abgerufen',
    text:
`Hallo,

Ihr Geheimnis wurde abgerufen.

Zeit: ${ts}
${hintLine}IP-Hash (zur Korrelation, nicht zur Identifikation): ${ipHashHex.slice(0, 16)}…

Diese Nachricht enthaelt aus Sicherheitsgruenden weder den Inhalt
noch den Link des abgerufenen Geheimnisses.

-- 
secret.bytexx.de
`
  };
}

export async function sendBurnMail(opts) {
  if (!transporter) throw new Error('mailer not initialized');
  const mail = buildBurnMail(opts);
  // Fire-and-forget at call site; here we await for testability.
  return transporter.sendMail(mail);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/mailer.test.js`
Expected: 1 test passes.

- [ ] **Step 5: Commit**

```bash
git add lib/mailer.js tests/mailer.test.js
git commit -m "feat(mailer): burn-notification mail builder + nodemailer wrapper"
```

---

## Task 7: Fastify app factory + health endpoint

**Files:**
- Create: `app.js`
- Create: `server.js`
- Test: `tests/app.test.js`

> We split `app.js` (testable Fastify factory) from `server.js` (the listen call). This lets tests use `app.inject()` without binding to a port.

- [ ] **Step 1: Write the failing test**

`tests/app.test.js`:
```javascript
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildApp } from '../app.js';

test('GET /api/health returns ok', async () => {
  const app = await buildApp({ skipDb: true, skipMailer: true });
  const res = await app.inject({ method: 'GET', url: '/api/health' });
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.json(), { status: 'ok' });
  await app.close();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/app.test.js`
Expected: FAIL "Cannot find module '../app.js'".

- [ ] **Step 3: Create `app.js`**

```javascript
import Fastify from 'fastify';
import { loadConfig } from './lib/config.js';
import { initPool } from './lib/db.js';
import { initMailer } from './lib/mailer.js';

export async function buildApp(opts = {}) {
  const config = loadConfig();
  const app = Fastify({
    logger: { level: opts.logLevel || 'info' },
    bodyLimit: config.maxBodyBytes,
    trustProxy: true
  });

  app.decorate('config', config);

  if (!opts.skipDb) initPool(config);
  if (!opts.skipMailer) initMailer(config.smtp);

  app.get('/api/health', async () => ({ status: 'ok' }));

  return app;
}
```

- [ ] **Step 4: Create `server.js`**

```javascript
import { buildApp } from './app.js';

const app = await buildApp();

try {
  await app.listen({ port: app.config.port, host: app.config.bind });
  app.log.info(`SharePassword listening on ${app.config.bind}:${app.config.port}`);
} catch (err) {
  app.log.error(err);
  process.exit(1);
}

for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, async () => {
    app.log.info(`received ${sig}, shutting down`);
    await app.close();
    process.exit(0);
  });
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm test -- tests/app.test.js`
Expected: 1 test passes.

- [ ] **Step 6: Commit**

```bash
git add app.js server.js tests/app.test.js
git commit -m "feat(app): Fastify factory + health endpoint + listen wrapper"
```

---

## Task 8: POST /api/secret (create)

**Files:**
- Create: `routes/secret.js`
- Modify: `app.js` (register route)
- Test: `tests/api.test.js`

> From this task on we need a real DB. Tests use a dedicated test schema; if none is configured, tests should skip with a clear message. For local dev: create a MariaDB user/db named `sharepassword_test` mirroring the prod schema.

- [ ] **Step 1: Add test-skip helper**

Create `tests/helpers.js`:
```javascript
import { spawnSync } from 'node:child_process';

export function dbAvailable() {
  // Allow opting out / in via env, default: check via a quick TCP ping using node net.
  return process.env.SP_TEST_DB === '1';
}

export function setupTestEnv() {
  process.env.NODE_ENV = 'test';
  process.env.PORT = '0';
  process.env.BIND = '127.0.0.1';
  process.env.DB_HOST = process.env.DB_HOST || '127.0.0.1';
  process.env.DB_PORT = process.env.DB_PORT || '3306';
  process.env.DB_NAME = process.env.DB_NAME || 'sharepassword_test';
  process.env.DB_USER = process.env.DB_USER || 'sharepass_test';
  process.env.DB_PASS = process.env.DB_PASS || 'sharepass_test';
  process.env.SMTP_HOST = 'localhost';
  process.env.SMTP_PORT = '2525';
  process.env.SMTP_USER = '';
  process.env.SMTP_PASS = '';
  process.env.SMTP_FROM = 'noreply@test';
  process.env.IP_HASH_PEPPER = 'p'.repeat(64);
  process.env.BASE_URL = 'http://localhost:3000';
  process.env.DEFAULT_LANGUAGE = 'de';
}

export async function resetDb(pool) {
  await pool.execute('DELETE FROM secrets');
  await pool.execute('DELETE FROM brute_log');
}
```

- [ ] **Step 2: Write the failing test**

`tests/api.test.js`:
```javascript
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
      expiresIn: 12345,                    // not in preset list
      burnAfterRead: true, hasPassphrase: false,
      passphraseSalt: null, notifyEmail: null, senderHint: null
    }
  });
  assert.equal(res.statusCode, 400);
  await app.close();
  await closePool();
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `SP_TEST_DB=1 npm test -- tests/api.test.js` (on a system with the test DB)
Expected: FAIL on 404 (route not registered).

- [ ] **Step 4: Create `routes/secret.js`**

```javascript
import {
  insertSecret, getSecret, deleteSecret,
  logAttempt, countRecentAttempts
} from '../lib/db.js';
import { generateToken, hashIp, tokenToBase64Url, base64UrlToToken }
  from '../lib/crypto-utils.js';

const createSchema = {
  body: {
    type: 'object',
    required: ['ciphertext', 'expiresIn', 'burnAfterRead', 'hasPassphrase'],
    additionalProperties: false,
    properties: {
      ciphertext:     { type: 'string', minLength: 1, maxLength: 10 * 1024 * 1024 },
      expiresIn:      { type: 'integer', enum: [3600, 86400, 604800, 2592000] },
      burnAfterRead:  { type: 'boolean' },
      hasPassphrase:  { type: 'boolean' },
      passphraseSalt: { type: ['string', 'null'] },
      notifyEmail:    { type: ['string', 'null'], maxLength: 255, pattern: '^[^@\\s]+@[^@\\s]+\\.[^@\\s]+$' },
      senderHint:     { type: ['string', 'null'], maxLength: 120 }
    }
  }
};

export default async function secretRoutes(app) {
  const cfg = app.config;

  app.post('/api/secret', { schema: createSchema }, async (req, reply) => {
    const b = req.body;

    if (b.hasPassphrase && !b.passphraseSalt) {
      return reply.code(400).send({ error: 'passphraseSalt required when hasPassphrase' });
    }

    const ciphertext = Buffer.from(b.ciphertext, 'base64');
    if (ciphertext.length === 0) return reply.code(400).send({ error: 'empty ciphertext' });
    if (ciphertext.length > 5 * 1024 * 1024 + 1024) {
      return reply.code(413).send({ error: 'ciphertext too large' });
    }

    let salt = null;
    if (b.hasPassphrase) {
      salt = Buffer.from(b.passphraseSalt, 'base64');
      if (salt.length !== 16) return reply.code(400).send({ error: 'salt must be 16 bytes' });
    }

    const token = generateToken();
    const expiresAt = new Date(Date.now() + b.expiresIn * 1000);

    await insertSecret({
      token,
      ciphertext,
      burnAfterRead: b.burnAfterRead,
      hasPassphrase: b.hasPassphrase,
      passphraseSalt: salt,
      notifyEmail: b.notifyEmail || null,
      senderHint: b.senderHint || null,
      expiresAt,
      sizeBytes: ciphertext.length
    });

    return {
      token: tokenToBase64Url(token),
      expiresAt: Math.floor(expiresAt.getTime() / 1000)
    };
  });
}
```

- [ ] **Step 5: Register route in `app.js`**

Modify `app.js` — add after the health route:
```javascript
import secretRoutes from './routes/secret.js';
// ...
await app.register(secretRoutes);
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `SP_TEST_DB=1 npm test -- tests/api.test.js`
Expected: 2 tests pass.

- [ ] **Step 7: Commit**

```bash
git add routes/secret.js app.js tests/api.test.js tests/helpers.js
git commit -m "feat(api): POST /api/secret with validation"
```

---

## Task 9: GET /api/secret/:token

**Files:**
- Modify: `routes/secret.js`
- Modify: `tests/api.test.js`

- [ ] **Step 1: Add the failing test**

Append to `tests/api.test.js`:
```javascript
test('GET /api/secret/:token returns ciphertext + meta', { skip: !dbAvailable() }, async () => {
  const app = await buildApp();
  await resetDb(getPool());

  const create = await app.inject({
    method: 'POST', url: '/api/secret',
    payload: {
      ciphertext: Buffer.from('hello').toString('base64'),
      expiresIn: 3600, burnAfterRead: true, hasPassphrase: false,
      passphraseSalt: null, notifyEmail: null, senderHint: 'Hi'
    }
  });
  const token = create.json().token;

  const get = await app.inject({ method: 'GET', url: `/api/secret/${token}` });
  assert.equal(get.statusCode, 200);
  const body = get.json();
  assert.equal(Buffer.from(body.ciphertext, 'base64').toString(), 'hello');
  assert.equal(body.hasPassphrase, false);
  assert.equal(body.passphraseSalt, null);
  assert.equal(body.senderHint, 'Hi');
  assert.equal(body.burnAfterRead, true);

  await app.close(); await closePool();
});

test('GET /api/secret/:token returns 404 for unknown token', { skip: !dbAvailable() }, async () => {
  const app = await buildApp();
  const fake = 'A'.repeat(22);
  const res = await app.inject({ method: 'GET', url: `/api/secret/${fake}` });
  assert.equal(res.statusCode, 404);
  await app.close(); await closePool();
});

test('GET /api/secret/:token rejects invalid token format', { skip: !dbAvailable() }, async () => {
  const app = await buildApp();
  const res = await app.inject({ method: 'GET', url: `/api/secret/short` });
  assert.equal(res.statusCode, 400);
  await app.close(); await closePool();
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `SP_TEST_DB=1 npm test -- tests/api.test.js`
Expected: FAIL on the new 3 tests (route returns 404 for everything because route doesn't exist).

- [ ] **Step 3: Add the GET handler in `routes/secret.js`**

Add inside `secretRoutes`, after the POST:
```javascript
const tokenParamSchema = {
  params: {
    type: 'object',
    required: ['token'],
    properties: { token: { type: 'string', pattern: '^[A-Za-z0-9_-]{22}$' } }
  }
};

function parseToken(s) {
  try { return base64UrlToToken(s); } catch { return null; }
}

app.get('/api/secret/:token', { schema: tokenParamSchema }, async (req, reply) => {
  const tokenBuf = parseToken(req.params.token);
  if (!tokenBuf) return reply.code(400).send({ error: 'invalid_token' });

  // Brute-force lock check (applies when passphrase is in play; harmless otherwise)
  const attempts = await countRecentAttempts(tokenBuf, cfg.bruteWindowSec);
  if (attempts >= cfg.bruteMaxAttempts) {
    return reply.code(423).send({ error: 'locked', retryAfter: cfg.bruteWindowSec });
  }

  const row = await getSecret(tokenBuf);
  if (!row) return reply.code(404).send({ error: 'not_found_or_expired' });

  return {
    ciphertext: row.ciphertext.toString('base64'),
    hasPassphrase: !!row.has_passphrase,
    passphraseSalt: row.passphrase_salt ? row.passphrase_salt.toString('base64') : null,
    senderHint: row.sender_hint,
    burnAfterRead: !!row.burn_after_read,
    expiresAt: Math.floor(new Date(row.expires_at).getTime() / 1000)
  };
});
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `SP_TEST_DB=1 npm test -- tests/api.test.js`
Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add routes/secret.js tests/api.test.js
git commit -m "feat(api): GET /api/secret/:token with brute-force lock check"
```

---

## Task 10: POST /api/secret/:token/burn (+ mail trigger)

**Files:**
- Modify: `routes/secret.js`
- Modify: `tests/api.test.js`

- [ ] **Step 1: Add the failing test**

Append to `tests/api.test.js`:
```javascript
test('POST /api/secret/:token/burn deletes secret', { skip: !dbAvailable() }, async () => {
  const app = await buildApp();
  await resetDb(getPool());

  const create = await app.inject({
    method: 'POST', url: '/api/secret',
    payload: {
      ciphertext: Buffer.from('zap').toString('base64'),
      expiresIn: 3600, burnAfterRead: true, hasPassphrase: false,
      passphraseSalt: null, notifyEmail: null, senderHint: null
    }
  });
  const token = create.json().token;

  const burn = await app.inject({ method: 'POST', url: `/api/secret/${token}/burn` });
  assert.equal(burn.statusCode, 204);

  const after = await app.inject({ method: 'GET', url: `/api/secret/${token}` });
  assert.equal(after.statusCode, 404);

  await app.close(); await closePool();
});

test('POST /api/secret/:token/burn is idempotent (204 even if already gone)', { skip: !dbAvailable() }, async () => {
  const app = await buildApp();
  const fake = 'A'.repeat(22);
  const res = await app.inject({ method: 'POST', url: `/api/secret/${fake}/burn` });
  assert.equal(res.statusCode, 204);
  await app.close(); await closePool();
});
```

- [ ] **Step 2: Add the burn route in `routes/secret.js`**

```javascript
import { sendBurnMail } from '../lib/mailer.js';
// ... inside secretRoutes:

app.post('/api/secret/:token/burn', { schema: tokenParamSchema }, async (req, reply) => {
  const tokenBuf = parseToken(req.params.token);
  if (!tokenBuf) return reply.code(400).send({ error: 'invalid_token' });

  // Fetch first so we still have email/hint for the notification
  const row = await getSecret(tokenBuf);
  const deleted = await deleteSecret(tokenBuf);

  if (deleted && row && row.notify_email) {
    // Fire-and-forget
    const ipHash = hashIp(req.ip || 'unknown', cfg.ipHashPepper);
    sendBurnMail({
      to: row.notify_email,
      from: cfg.smtp.from,
      senderHint: row.sender_hint,
      ipHashHex: ipHash.toString('hex'),
      when: new Date()
    }).catch(err => req.log.error({ err }, 'burn mail failed'));
  }

  return reply.code(204).send();
});
```

- [ ] **Step 3: Run tests to verify they pass**

Run: `SP_TEST_DB=1 npm test -- tests/api.test.js`
Expected: all tests pass (mail send may fail in test env, logged but non-fatal — and `notify_email` is null in the tests, so no mail is even attempted).

- [ ] **Step 4: Commit**

```bash
git add routes/secret.js tests/api.test.js
git commit -m "feat(api): POST /:token/burn with async mail notification"
```

---

## Task 11: POST /api/secret/:token/attempt (brute-force log)

**Files:**
- Modify: `routes/secret.js`
- Create: `tests/brute-force.test.js`

- [ ] **Step 1: Write the failing test**

`tests/brute-force.test.js`:
```javascript
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
  // Now GET should be locked
  const locked = await app.inject({ method: 'GET', url: `/api/secret/${token}` });
  assert.equal(locked.statusCode, 423);

  await app.close(); await closePool();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `SP_TEST_DB=1 npm test -- tests/brute-force.test.js`
Expected: FAIL — route not registered.

- [ ] **Step 3: Add the attempt route**

In `routes/secret.js`:
```javascript
app.post('/api/secret/:token/attempt', { schema: tokenParamSchema }, async (req, reply) => {
  const tokenBuf = parseToken(req.params.token);
  if (!tokenBuf) return reply.code(400).send({ error: 'invalid_token' });
  const ipHash = hashIp(req.ip || 'unknown', cfg.ipHashPepper);
  await logAttempt(tokenBuf, ipHash);
  return reply.code(204).send();
});
```

- [ ] **Step 4: Run test to verify it passes**

Run: `SP_TEST_DB=1 npm test -- tests/brute-force.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add routes/secret.js tests/brute-force.test.js
git commit -m "feat(api): POST /:token/attempt + brute-force token lock"
```

---

## Task 12: Rate limiting

**Files:**
- Modify: `app.js`
- Create: `tests/rate-limit.test.js`

- [ ] **Step 1: Write the failing test**

`tests/rate-limit.test.js`:
```javascript
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `SP_TEST_DB=1 npm test -- tests/rate-limit.test.js`
Expected: FAIL — eleventh call returns 200 (no rate limit yet).

- [ ] **Step 3: Register rate-limit in `app.js`**

```javascript
import rateLimit from '@fastify/rate-limit';
// inside buildApp, BEFORE registering routes:
await app.register(rateLimit, { global: false });
```

In `routes/secret.js`, decorate routes:
```javascript
app.post('/api/secret', {
  schema: createSchema,
  config: { rateLimit: { max: 10, timeWindow: '1 minute' } }
}, async (req, reply) => { /* ... */ });

app.get('/api/secret/:token', {
  schema: tokenParamSchema,
  config: { rateLimit: { max: 30, timeWindow: '1 minute' } }
}, async (req, reply) => { /* ... */ });

app.post('/api/secret/:token/attempt', {
  schema: tokenParamSchema,
  config: { rateLimit: { max: 20, timeWindow: '1 minute' } }
}, async (req, reply) => { /* ... */ });
```

- [ ] **Step 4: Run test to verify it passes**

Run: `SP_TEST_DB=1 npm test -- tests/rate-limit.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app.js routes/secret.js tests/rate-limit.test.js
git commit -m "feat(api): rate-limit POST/GET/attempt endpoints"
```

---

## Task 13: Static file serving + page routes

**Files:**
- Create: `routes/pages.js`
- Modify: `app.js`
- Create: `public/index.html` (skeleton)
- Create: `public/s.html` (skeleton)
- Create: `public/impressum.html`
- Create: `public/datenschutz.html`
- Create: `public/css/style.css` (empty)
- Create: `public/js/i18n.js` (empty)

- [ ] **Step 1: Create skeleton HTML files**

`public/index.html`:
```html
<!doctype html>
<html lang="de">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>SharePassword – BYTEXX</title>
  <link rel="stylesheet" href="/css/style.css">
</head>
<body>
  <main id="create-app"></main>
  <script type="module" src="/js/create.js"></script>
</body>
</html>
```

`public/s.html`:
```html
<!doctype html>
<html lang="de">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>SharePassword – Geheimnis anzeigen</title>
  <link rel="stylesheet" href="/css/style.css">
</head>
<body>
  <main id="view-app"></main>
  <script type="module" src="/js/view.js"></script>
</body>
</html>
```

`public/impressum.html`:
```html
<!doctype html>
<html lang="de">
<head>
  <meta charset="utf-8"><title>Impressum</title>
  <link rel="stylesheet" href="/css/style.css">
</head>
<body>
  <main>
    <h1>Impressum</h1>
    <p>BYTEXX IT<br>info@bytexx.de</p>
    <!-- Vollständigen Text vor Go-Live einsetzen. -->
    <p><a href="/">Zurück</a></p>
  </main>
</body>
</html>
```

`public/datenschutz.html`:
```html
<!doctype html>
<html lang="de">
<head>
  <meta charset="utf-8"><title>Datenschutz</title>
  <link rel="stylesheet" href="/css/style.css">
</head>
<body>
  <main>
    <h1>Datenschutz</h1>
    <p>SharePassword speichert nur den verschlüsselten Inhalt; der
       Schlüssel verlässt Ihren Browser nie. IP-Adressen werden ausschließlich
       gehasht zur Missbrauchserkennung verarbeitet. Mehr Details vor Go-Live.</p>
    <p><a href="/">Zurück</a></p>
  </main>
</body>
</html>
```

- [ ] **Step 2: Create empty placeholder files**

```bash
mkdir -p public/css public/js public/img
: > public/css/style.css
: > public/js/i18n.js
```

- [ ] **Step 3: Create `routes/pages.js`**

```javascript
export default async function pageRoutes(app) {
  // /s/<token> serves the view page; token is read from URL by JS
  app.get('/s/:token', async (req, reply) => {
    return reply.type('text/html').sendFile('s.html');
  });
}
```

- [ ] **Step 4: Wire @fastify/static + page routes in `app.js`**

```javascript
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import fastifyStatic from '@fastify/static';
import pageRoutes from './routes/pages.js';
// ...
const __dirname = path.dirname(fileURLToPath(import.meta.url));
await app.register(fastifyStatic, {
  root: path.join(__dirname, 'public'),
  prefix: '/',
  index: 'index.html'
});
await app.register(pageRoutes);
```

- [ ] **Step 5: Smoke-test manually**

Run: `npm start` (with a real DB + .env). In another shell:
```bash
curl -I http://127.0.0.1:3000/
curl -I http://127.0.0.1:3000/s/AAAAAAAAAAAAAAAAAAAAAA
```
Expected: both 200.

- [ ] **Step 6: Commit**

```bash
git add routes/pages.js app.js public/
git commit -m "feat(static): page routes + skeleton HTML"
```

---

## Task 14: Browser crypto module

**Files:**
- Create: `public/js/crypto.js`
- Test: `tests/crypto-roundtrip.test.js`

> `crypto.js` is plain ES-Module browser code that ALSO runs in Node 20+ because Node exposes the same Web Crypto API at `globalThis.crypto`. We test it with Node's built-in `node:test`.

- [ ] **Step 1: Write the failing test**

`tests/crypto-roundtrip.test.js`:
```javascript
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/crypto-roundtrip.test.js`
Expected: FAIL "Cannot find module".

- [ ] **Step 3: Create `public/js/crypto.js`**

```javascript
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

export const unwrapKey = wrapKey; // XOR is symmetric

// --- base64url helpers ---
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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- tests/crypto-roundtrip.test.js`
Expected: 3 tests pass.

- [ ] **Step 5: Commit**

```bash
git add public/js/crypto.js tests/crypto-roundtrip.test.js
git commit -m "feat(crypto): browser AES-GCM + PBKDF2 module (Node-testable)"
```

---

## Task 15: i18n

**Files:**
- Create: `i18n/de.json`
- Create: `i18n/en.json`
- Create: `public/js/i18n.js` (replace empty)
- Modify: `app.js` (serve i18n directory)

- [ ] **Step 1: Create `i18n/de.json`**

```json
{
  "create.title": "Geheimnis sicher teilen",
  "create.lead": "Verschlüsseln Sie Text oder eine Datei direkt im Browser. Der Schlüssel verlässt diesen Browser nie.",
  "create.placeholder": "Was möchten Sie teilen?",
  "create.fileLabel": "Datei (optional, max. 5 MB)",
  "create.expiresLabel": "Ablauf",
  "create.expires.1h": "1 Stunde",
  "create.expires.1d": "1 Tag",
  "create.expires.7d": "1 Woche",
  "create.expires.30d": "30 Tage",
  "create.burnLabel": "Nach erstem Abruf löschen",
  "create.advancedToggle": "Erweiterte Optionen",
  "create.passphraseLabel": "Passphrase (optional)",
  "create.notifyLabel": "Benachrichtigungs-E-Mail (optional)",
  "create.hintLabel": "Hinweis für den Empfänger (sichtbar vor Entschlüsselung)",
  "create.submit": "Link erzeugen",
  "create.resultTitle": "Fertig — Link kopieren und teilen",
  "create.copy": "Link kopieren",
  "create.copied": "Kopiert!",
  "create.expiresAt": "Gültig bis",
  "view.title": "Geheimnis anzeigen",
  "view.passphrasePrompt": "Dieses Geheimnis ist mit einer Passphrase geschützt.",
  "view.passphraseLabel": "Passphrase",
  "view.submit": "Anzeigen",
  "view.burnedNote": "Dieses Geheimnis wurde gelöscht und kann nicht erneut abgerufen werden.",
  "view.fileDownload": "Datei herunterladen",
  "view.error.notFound": "Geheimnis nicht gefunden oder abgelaufen.",
  "view.error.locked": "Zu viele Fehlversuche. Bitte später erneut versuchen.",
  "view.error.wrongPassphrase": "Falsche Passphrase oder beschädigte Daten.",
  "view.error.network": "Netzwerkfehler.",
  "footer.impressum": "Impressum",
  "footer.datenschutz": "Datenschutz",
  "footer.lang": "EN"
}
```

- [ ] **Step 2: Create `i18n/en.json`**

```json
{
  "create.title": "Share a secret securely",
  "create.lead": "Encrypt text or a file directly in your browser. The key never leaves this browser.",
  "create.placeholder": "What do you want to share?",
  "create.fileLabel": "File (optional, max 5 MB)",
  "create.expiresLabel": "Expiry",
  "create.expires.1h": "1 hour",
  "create.expires.1d": "1 day",
  "create.expires.7d": "1 week",
  "create.expires.30d": "30 days",
  "create.burnLabel": "Delete after first view",
  "create.advancedToggle": "Advanced options",
  "create.passphraseLabel": "Passphrase (optional)",
  "create.notifyLabel": "Notification email (optional)",
  "create.hintLabel": "Hint for the recipient (visible before decryption)",
  "create.submit": "Create link",
  "create.resultTitle": "Done — copy the link and share",
  "create.copy": "Copy link",
  "create.copied": "Copied!",
  "create.expiresAt": "Valid until",
  "view.title": "View secret",
  "view.passphrasePrompt": "This secret is protected by a passphrase.",
  "view.passphraseLabel": "Passphrase",
  "view.submit": "Show",
  "view.burnedNote": "This secret has been deleted and cannot be retrieved again.",
  "view.fileDownload": "Download file",
  "view.error.notFound": "Secret not found or expired.",
  "view.error.locked": "Too many failed attempts. Try again later.",
  "view.error.wrongPassphrase": "Wrong passphrase or corrupted data.",
  "view.error.network": "Network error.",
  "footer.impressum": "Imprint",
  "footer.datenschutz": "Privacy",
  "footer.lang": "DE"
}
```

- [ ] **Step 3: Create `public/js/i18n.js`**

```javascript
const LANG_KEY = 'sp.lang';

export function currentLang(defaultLang = 'de') {
  return localStorage.getItem(LANG_KEY) || defaultLang;
}

export function setLang(lang) {
  localStorage.setItem(LANG_KEY, lang);
  location.reload();
}

export async function loadStrings(lang) {
  const res = await fetch(`/i18n/${lang}.json`);
  if (!res.ok) throw new Error('i18n load failed');
  return res.json();
}

export function apply(strings, root = document) {
  for (const el of root.querySelectorAll('[data-i18n]')) {
    const k = el.getAttribute('data-i18n');
    if (strings[k]) el.textContent = strings[k];
  }
  for (const el of root.querySelectorAll('[data-i18n-placeholder]')) {
    const k = el.getAttribute('data-i18n-placeholder');
    if (strings[k]) el.placeholder = strings[k];
  }
}
```

- [ ] **Step 4: Serve `/i18n` in `app.js`**

```javascript
await app.register(fastifyStatic, {
  root: path.join(__dirname, 'i18n'),
  prefix: '/i18n/',
  decorateReply: false
});
```

- [ ] **Step 5: Smoke-test**

```bash
npm start
curl -s http://127.0.0.1:3000/i18n/de.json | head -c 100
```
Expected: JSON starts.

- [ ] **Step 6: Commit**

```bash
git add i18n/ public/js/i18n.js app.js
git commit -m "feat(i18n): German/English string tables + loader"
```

---

## Task 16: Create page UI (frontend)

**Files:**
- Modify: `public/index.html` (full markup)
- Create: `public/js/create.js`
- Modify: `public/css/style.css`

- [ ] **Step 1: Replace `public/index.html` with full markup**

```html
<!doctype html>
<html lang="de">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>SharePassword – BYTEXX</title>
  <link rel="stylesheet" href="/css/style.css">
</head>
<body>
  <header class="site-header">
    <a href="/" class="brand">BYTEXX SharePassword</a>
    <button id="lang-toggle" class="lang-toggle" data-i18n="footer.lang">EN</button>
  </header>

  <main class="page">
    <h1 data-i18n="create.title">Geheimnis sicher teilen</h1>
    <p class="lead" data-i18n="create.lead"></p>

    <form id="create-form">
      <label class="field">
        <textarea id="plaintext" rows="6" required
                  data-i18n-placeholder="create.placeholder"></textarea>
      </label>

      <label class="field">
        <span data-i18n="create.fileLabel">Datei</span>
        <input type="file" id="file">
      </label>

      <label class="field">
        <span data-i18n="create.expiresLabel">Ablauf</span>
        <select id="expires">
          <option value="3600"   data-i18n="create.expires.1h">1 Stunde</option>
          <option value="86400"  data-i18n="create.expires.1d">1 Tag</option>
          <option value="604800" data-i18n="create.expires.7d" selected>1 Woche</option>
          <option value="2592000" data-i18n="create.expires.30d">30 Tage</option>
        </select>
      </label>

      <label class="field checkbox">
        <input type="checkbox" id="burn" checked>
        <span data-i18n="create.burnLabel">Nach erstem Abruf löschen</span>
      </label>

      <details class="advanced">
        <summary data-i18n="create.advancedToggle">Erweiterte Optionen</summary>
        <label class="field">
          <span data-i18n="create.passphraseLabel">Passphrase</span>
          <input type="password" id="passphrase" autocomplete="new-password">
        </label>
        <label class="field">
          <span data-i18n="create.notifyLabel">Benachrichtigungs-E-Mail</span>
          <input type="email" id="notify-email">
        </label>
        <label class="field">
          <span data-i18n="create.hintLabel">Hinweis für den Empfänger</span>
          <input type="text" id="sender-hint" maxlength="120">
        </label>
      </details>

      <button type="submit" class="btn-primary" data-i18n="create.submit">Link erzeugen</button>
    </form>

    <section id="result" hidden>
      <h2 data-i18n="create.resultTitle">Fertig</h2>
      <div class="result-link">
        <input id="result-url" type="text" readonly>
        <button id="copy-btn" type="button" data-i18n="create.copy">Kopieren</button>
      </div>
      <p class="muted">
        <span data-i18n="create.expiresAt">Gültig bis</span>: <span id="result-expires"></span>
      </p>
    </section>
  </main>

  <footer class="site-footer">
    <a href="/impressum" data-i18n="footer.impressum">Impressum</a>
    <a href="/datenschutz" data-i18n="footer.datenschutz">Datenschutz</a>
  </footer>

  <script type="module" src="/js/create.js"></script>
</body>
</html>
```

- [ ] **Step 2: Create `public/js/create.js`**

```javascript
import { currentLang, setLang, loadStrings, apply } from '/js/i18n.js';
import {
  generateKey, encryptBytes, deriveKekFromPassphrase, wrapKey,
  bytesToBase64Url, bytesToBase64
} from '/js/crypto.js';

const MAX_FILE_BYTES = 5 * 1024 * 1024;

(async () => {
  const lang = currentLang();
  const strings = await loadStrings(lang);
  apply(strings);

  document.getElementById('lang-toggle').addEventListener('click', () => {
    setLang(lang === 'de' ? 'en' : 'de');
  });

  document.getElementById('create-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = e.target.querySelector('button[type=submit]');
    btn.disabled = true;
    try {
      await handleSubmit(strings);
    } catch (err) {
      console.error(err);
      alert(err.message || String(err));
    } finally {
      btn.disabled = false;
    }
  });
})();

async function handleSubmit(strings) {
  const text = document.getElementById('plaintext').value;
  const file = document.getElementById('file').files[0] || null;
  const expiresIn = parseInt(document.getElementById('expires').value, 10);
  const burn = document.getElementById('burn').checked;
  const passphrase = document.getElementById('passphrase').value;
  const notifyEmail = document.getElementById('notify-email').value.trim() || null;
  const senderHint = document.getElementById('sender-hint').value.trim() || null;

  let filePayload = null;
  if (file) {
    if (file.size > MAX_FILE_BYTES) {
      alert('Datei zu groß (max. 5 MB).');
      return;
    }
    const buf = new Uint8Array(await file.arrayBuffer());
    filePayload = { name: file.name, type: file.type, data: bytesToBase64(buf) };
  }

  const payload = JSON.stringify({ text, file: filePayload });
  const payloadBytes = new TextEncoder().encode(payload);

  const key = await generateKey();
  const ciphertext = await encryptBytes(payloadBytes, key);

  // If passphrase, wrap key
  let keyForUrl;
  let passphraseSaltB64 = null;
  if (passphrase) {
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const kek = await deriveKekFromPassphrase(passphrase, salt);
    const rawKey = new Uint8Array(await crypto.subtle.exportKey('raw', key));
    const wrapped = wrapKey(rawKey, kek);
    keyForUrl = wrapped;
    passphraseSaltB64 = bytesToBase64(salt);
  } else {
    keyForUrl = new Uint8Array(await crypto.subtle.exportKey('raw', key));
  }

  const body = {
    ciphertext: bytesToBase64(ciphertext),
    expiresIn,
    burnAfterRead: burn,
    hasPassphrase: !!passphrase,
    passphraseSalt: passphraseSaltB64,
    notifyEmail,
    senderHint
  };

  const res = await fetch('/api/secret', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  if (!res.ok) {
    if (res.status === 429) throw new Error('Rate-Limit erreicht. Bitte später erneut.');
    throw new Error(`Fehler ${res.status}`);
  }
  const { token, expiresAt } = await res.json();

  const url = `${location.origin}/s/${token}#${bytesToBase64Url(keyForUrl)}`;
  document.getElementById('result-url').value = url;
  document.getElementById('result-expires').textContent =
    new Date(expiresAt * 1000).toLocaleString();
  document.getElementById('result').hidden = false;

  document.getElementById('copy-btn').onclick = async () => {
    await navigator.clipboard.writeText(url);
    document.getElementById('copy-btn').textContent = strings['create.copied'] || 'OK';
  };
}
```

- [ ] **Step 3: Add basic CSS in `public/css/style.css`**

```css
:root {
  --bg: #f7f7f8;
  --fg: #1a1a1a;
  --muted: #6a6a6a;
  --accent: #2563eb;
  --border: #d4d4d8;
  --card: #ffffff;
}
@media (prefers-color-scheme: dark) {
  :root {
    --bg: #18181b; --fg: #f4f4f5; --muted: #a1a1aa;
    --border: #3f3f46; --card: #27272a;
  }
}
* { box-sizing: border-box; }
body {
  margin: 0; font-family: system-ui, sans-serif;
  background: var(--bg); color: var(--fg);
  display: flex; flex-direction: column; min-height: 100vh;
}
.site-header, .site-footer {
  display: flex; justify-content: space-between; align-items: center;
  padding: 0.75rem 1.5rem; background: var(--card);
  border-bottom: 1px solid var(--border);
}
.site-footer { border-top: 1px solid var(--border); border-bottom: none; gap: 1rem; justify-content: center; font-size: 0.9rem; }
.site-footer a { color: var(--muted); }
.brand { font-weight: 600; color: var(--fg); text-decoration: none; }
.lang-toggle { background: none; border: 1px solid var(--border); color: var(--fg); padding: 0.25rem 0.5rem; border-radius: 4px; cursor: pointer; }
.page { max-width: 640px; width: 100%; margin: 2rem auto; padding: 0 1.5rem; flex: 1; }
.page h1 { margin-top: 0; }
.lead { color: var(--muted); }
.field { display: block; margin-bottom: 1rem; }
.field span { display: block; margin-bottom: 0.25rem; font-size: 0.9rem; }
.field.checkbox { display: flex; align-items: center; gap: 0.5rem; }
textarea, input[type=text], input[type=email], input[type=password], select {
  width: 100%; padding: 0.5rem; border: 1px solid var(--border);
  border-radius: 4px; background: var(--card); color: var(--fg); font: inherit;
}
.advanced { margin-bottom: 1rem; padding: 0.75rem 1rem; border: 1px solid var(--border); border-radius: 4px; background: var(--card); }
.btn-primary {
  background: var(--accent); color: white; border: none;
  padding: 0.6rem 1.2rem; border-radius: 4px; cursor: pointer; font: inherit;
}
.btn-primary:disabled { opacity: 0.5; cursor: not-allowed; }
.result-link { display: flex; gap: 0.5rem; }
.result-link input { flex: 1; }
.muted { color: var(--muted); }
```

- [ ] **Step 4: Manual smoke test**

```bash
npm start
```
Open `http://127.0.0.1:3000/`. Type "test", hit "Link erzeugen". Verify a URL appears with `#...` fragment.

- [ ] **Step 5: Commit**

```bash
git add public/index.html public/js/create.js public/css/style.css
git commit -m "feat(ui): create page with E2E encryption flow"
```

---

## Task 17: View page UI (frontend)

**Files:**
- Modify: `public/s.html`
- Create: `public/js/view.js`

- [ ] **Step 1: Replace `public/s.html` with full markup**

```html
<!doctype html>
<html lang="de">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>SharePassword – Geheimnis anzeigen</title>
  <link rel="stylesheet" href="/css/style.css">
</head>
<body>
  <header class="site-header">
    <a href="/" class="brand">BYTEXX SharePassword</a>
    <button id="lang-toggle" class="lang-toggle" data-i18n="footer.lang">EN</button>
  </header>

  <main class="page">
    <h1 data-i18n="view.title">Geheimnis anzeigen</h1>
    <p id="sender-hint" class="muted" hidden></p>

    <section id="passphrase-section" hidden>
      <p data-i18n="view.passphrasePrompt"></p>
      <label class="field">
        <span data-i18n="view.passphraseLabel">Passphrase</span>
        <input type="password" id="passphrase" autocomplete="off">
      </label>
    </section>

    <button id="show-btn" class="btn-primary" data-i18n="view.submit">Anzeigen</button>

    <section id="result" hidden>
      <pre id="plaintext"></pre>
      <p id="file-section" hidden>
        <a id="file-link" download data-i18n="view.fileDownload">Datei herunterladen</a>
      </p>
      <p class="muted" data-i18n="view.burnedNote"></p>
    </section>

    <p id="error" class="error" hidden></p>
  </main>

  <footer class="site-footer">
    <a href="/impressum" data-i18n="footer.impressum">Impressum</a>
    <a href="/datenschutz" data-i18n="footer.datenschutz">Datenschutz</a>
  </footer>

  <script type="module" src="/js/view.js"></script>
</body>
</html>
```

- [ ] **Step 2: Create `public/js/view.js`**

```javascript
import { currentLang, setLang, loadStrings, apply } from '/js/i18n.js';
import {
  decryptBytes, deriveKekFromPassphrase, unwrapKey,
  base64UrlToBytes, base64ToBytes
} from '/js/crypto.js';

let strings = {};
let meta = null;
let keyMaterial = null;

(async () => {
  const lang = currentLang();
  strings = await loadStrings(lang);
  apply(strings);

  document.getElementById('lang-toggle').addEventListener('click', () => {
    setLang(lang === 'de' ? 'en' : 'de');
  });

  const token = location.pathname.split('/').pop();
  const frag = location.hash.slice(1);
  if (!token || !frag) {
    showError(strings['view.error.notFound']); return;
  }
  keyMaterial = base64UrlToBytes(frag);

  try {
    const res = await fetch(`/api/secret/${token}`);
    if (res.status === 404) { showError(strings['view.error.notFound']); return; }
    if (res.status === 423) { showError(strings['view.error.locked']); return; }
    if (!res.ok) { showError(strings['view.error.network']); return; }
    meta = await res.json();
  } catch {
    showError(strings['view.error.network']); return;
  }

  if (meta.senderHint) {
    const e = document.getElementById('sender-hint');
    e.textContent = meta.senderHint; e.hidden = false;
  }
  if (meta.hasPassphrase) {
    document.getElementById('passphrase-section').hidden = false;
  }

  document.getElementById('show-btn').addEventListener('click', () => onShow(token));
})();

async function onShow(token) {
  try {
    let rawKey = keyMaterial;
    if (meta.hasPassphrase) {
      const pass = document.getElementById('passphrase').value;
      if (!pass) return;
      const salt = base64ToBytes(meta.passphraseSalt);
      const kek = await deriveKekFromPassphrase(pass, salt);
      rawKey = unwrapKey(keyMaterial, kek);
    }
    const cryptoKey = await crypto.subtle.importKey(
      'raw', rawKey, { name: 'AES-GCM' }, false, ['decrypt']
    );
    const ct = base64ToBytes(meta.ciphertext);
    let plaintextBytes;
    try {
      plaintextBytes = await decryptBytes(ct, cryptoKey);
    } catch {
      // wrong passphrase or tampered data → record attempt
      fetch(`/api/secret/${token}/attempt`, { method: 'POST' }).catch(() => {});
      showError(strings['view.error.wrongPassphrase']); return;
    }
    const json = JSON.parse(new TextDecoder().decode(plaintextBytes));
    render(json);

    // Trigger burn if applicable
    if (meta.burnAfterRead) {
      fetch(`/api/secret/${token}/burn`, { method: 'POST' }).catch(() => {});
    }
  } catch (err) {
    console.error(err);
    showError(String(err));
  }
}

function render(json) {
  document.getElementById('plaintext').textContent = json.text || '';
  if (json.file) {
    const link = document.getElementById('file-link');
    const bytes = base64ToBytes(json.file.data);
    const blob = new Blob([bytes], { type: json.file.type || 'application/octet-stream' });
    link.href = URL.createObjectURL(blob);
    link.download = json.file.name || 'download';
    document.getElementById('file-section').hidden = false;
  }
  document.getElementById('result').hidden = false;
  document.getElementById('show-btn').hidden = true;
  document.getElementById('passphrase-section').hidden = true;
}

function showError(msg) {
  const e = document.getElementById('error');
  e.textContent = msg; e.hidden = false;
  document.getElementById('show-btn').hidden = true;
}
```

- [ ] **Step 3: Add error style**

Append to `public/css/style.css`:
```css
.error { color: #b91c1c; margin-top: 1rem; }
pre#plaintext { white-space: pre-wrap; word-wrap: break-word;
  background: var(--card); padding: 1rem; border-radius: 4px; border: 1px solid var(--border); }
```

- [ ] **Step 4: End-to-end smoke test**

```bash
npm start
```
1. Open `/`, create a secret with text "hallo".
2. Copy the URL, open it in a private window.
3. Verify "hallo" is shown.
4. Reload the same URL — must show "not found" (burn worked).
5. Repeat with a passphrase; wrong passphrase must show an error.

- [ ] **Step 5: Commit**

```bash
git add public/s.html public/js/view.js public/css/style.css
git commit -m "feat(ui): view page with E2E decryption + passphrase flow"
```

---

## Task 18: Deployment files

**Files:**
- Create: `deploy/systemd/sharepassword.service`
- Create: `deploy/nginx/secret.bytexx.de.conf`
- Create: `deploy/logrotate.d/sharepassword`

- [ ] **Step 1: Create systemd unit**

`deploy/systemd/sharepassword.service`:
```ini
[Unit]
Description=SharePassword Service
After=network.target mariadb.service
Wants=mariadb.service

[Service]
Type=simple
User=sharepass
Group=sharepass
WorkingDirectory=/opt/sharepassword/app
EnvironmentFile=/opt/sharepassword/.env
ExecStart=/usr/bin/node /opt/sharepassword/app/server.js
Restart=on-failure
RestartSec=5
StandardOutput=append:/var/log/sharepassword/access.log
StandardError=append:/var/log/sharepassword/error.log

NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=true
ReadWritePaths=/var/log/sharepassword

[Install]
WantedBy=multi-user.target
```

- [ ] **Step 2: Create nginx vhost**

`deploy/nginx/secret.bytexx.de.conf`:
```nginx
server {
    listen 443 ssl http2;
    server_name secret.bytexx.de;

    ssl_certificate     /etc/letsencrypt/live/secret.bytexx.de/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/secret.bytexx.de/privkey.pem;
    include /etc/letsencrypt/options-ssl-nginx.conf;

    add_header Strict-Transport-Security "max-age=63072000; includeSubDomains" always;
    add_header X-Frame-Options DENY always;
    add_header X-Content-Type-Options nosniff always;
    add_header Referrer-Policy "no-referrer" always;
    add_header Content-Security-Policy "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'" always;
    add_header Permissions-Policy "geolocation=(), microphone=(), camera=()" always;

    client_max_body_size 7m;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $remote_addr;
        proxy_set_header X-Forwarded-Proto https;
    }
}

server {
    listen 80;
    server_name secret.bytexx.de;
    return 301 https://$host$request_uri;
}
```

- [ ] **Step 3: Create logrotate**

`deploy/logrotate.d/sharepassword`:
```
/var/log/sharepassword/*.log {
    daily
    rotate 14
    missingok
    compress
    delaycompress
    notifempty
    create 0640 sharepass sharepass
    sharedscripts
    postrotate
        systemctl reload sharepassword 2>/dev/null || true
    endscript
}
```

- [ ] **Step 4: Commit**

```bash
git add deploy/
git commit -m "feat(deploy): systemd unit, nginx vhost, logrotate config"
```

---

## Task 19: Installation runbook — fill in concrete steps

**Files:**
- Modify: `docs/installation.md`

- [ ] **Step 1: Replace `docs/installation.md` with concrete commands**

```markdown
# Installation — Disaster Recovery

Schritt-für-Schritt auf einem Debian-Server mit nginx + MariaDB + certbot.

## 0. Voraussetzungen

- DNS A-Record `secret.bytexx.de` → Server-IP gesetzt (TTL ≤ 1h für Erst-Setup)
- Port 3000 frei: `ss -tlnp | grep ':3000'` → keine Ausgabe
- Node.js ≥ 20 installiert: `node -v`
- SMTP-Zugang zu `mail.bytexx.de` bekannt

## 1. Node.js (falls fehlt)

```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs
node -v   # erwartet v20.x
```

## 2. Linux-User + Verzeichnisse

```bash
sudo useradd --system --home /opt/sharepassword --shell /usr/sbin/nologin sharepass
sudo mkdir -p /opt/sharepassword /var/log/sharepassword
sudo chown -R sharepass:sharepass /opt/sharepassword /var/log/sharepassword
```

## 3. Repo deployen

```bash
sudo -u sharepass git clone <repo-url> /opt/sharepassword/app
cd /opt/sharepassword/app
sudo -u sharepass npm ci --omit=dev
```

## 4. MariaDB

```bash
# Schema + Events
sudo mariadb < /opt/sharepassword/app/sql/001-init.sql

# Grant — Passwort generieren
PASS=$(openssl rand -base64 32)
echo "DB-Passwort: $PASS"   # gleich in .env eintragen
sudo mariadb -e "CREATE USER IF NOT EXISTS 'sharepass'@'localhost' IDENTIFIED BY '$PASS';
                 GRANT SELECT, INSERT, UPDATE, DELETE ON sharepassword.* TO 'sharepass'@'localhost';
                 FLUSH PRIVILEGES;"

# Event Scheduler permanent aktivieren
sudo sed -i '/\[mysqld\]/a event_scheduler=ON' /etc/mysql/mariadb.conf.d/50-server.cnf
sudo systemctl restart mariadb
```

## 5. .env

```bash
sudo -u sharepass cp /opt/sharepassword/app/.env.example /opt/sharepassword/.env
sudo chmod 0600 /opt/sharepassword/.env
sudo nano /opt/sharepassword/.env
# Werte eintragen — DB_PASS (oben), SMTP_*, IP_HASH_PEPPER (siehe Kommentar im File)
```

## 6. systemd

```bash
sudo cp /opt/sharepassword/app/deploy/systemd/sharepassword.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now sharepassword
sudo systemctl status sharepassword
curl -fsS http://127.0.0.1:3000/api/health   # erwartet {"status":"ok"}
```

## 7. TLS

```bash
sudo certbot certonly --nginx -d secret.bytexx.de
```

## 8. nginx

```bash
sudo cp /opt/sharepassword/app/deploy/nginx/secret.bytexx.de.conf /etc/nginx/sites-available/
sudo ln -s /etc/nginx/sites-available/secret.bytexx.de.conf /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
curl -I https://secret.bytexx.de/   # erwartet 200, gültiges Zert
```

## 9. logrotate

```bash
sudo cp /opt/sharepassword/app/deploy/logrotate.d/sharepassword /etc/logrotate.d/
sudo logrotate --debug /etc/logrotate.d/sharepassword
```

## 10. Backup-Skript anpassen

Im bestehenden Server-Backup-Skript (oder neu anlegen): mysqldump für `sharepassword` MUSS die `secrets`-Tabelle ausschließen.

```bash
mysqldump --ignore-table=sharepassword.secrets sharepassword > /backup/sharepassword-$(date +%F).sql
```

## 11. Funktions-Smoke-Test

1. Browser → `https://secret.bytexx.de/` → Seite lädt
2. Text eingeben, Link erzeugen
3. Link in privatem Tab öffnen → Text wird gezeigt
4. Link nochmal öffnen → "nicht gefunden" (Burn funktioniert)
5. SSL Labs: `https://www.ssllabs.com/ssltest/analyze.html?d=secret.bytexx.de` → Rating A oder besser
\```

- [ ] **Step 2: Commit**

```bash
git add docs/installation.md
git commit -m "docs(install): concrete step-by-step runbook"
```

---

## Task 20: Final integration check

- [ ] **Step 1: Run full test suite (without DB)**

```bash
npm test
```
Expected: `config`, `crypto-utils`, `mailer`, `app`, `crypto-roundtrip` all pass. API/brute-force/rate-limit tests skip with "SP_TEST_DB not set".

- [ ] **Step 2: If a local MariaDB test setup exists, run with DB**

```bash
SP_TEST_DB=1 npm test
```
Expected: all tests pass.

- [ ] **Step 3: Manual end-to-end on dev**

1. `npm start`
2. Create secret (text only) → open in new tab → see text → reload → 404
3. Create secret with file → open → download file → file matches
4. Create with passphrase → open with wrong passphrase 5× → 6th try returns "locked"
5. Create with notifyEmail → open → check that mailer was called (look at logs)

- [ ] **Step 4: Update CLAUDE.md status**

In `CLAUDE.md`, mark "Implementierung" done:
```markdown
- [x] Design-Spec geschrieben und freigegeben
- [x] Implementierungs-Plan
- [x] Implementierung
- [ ] Deployment auf Passbolt-Server
```

- [ ] **Step 5: Final commit**

```bash
git add CLAUDE.md
git commit -m "docs: mark implementation complete"
```

---

## Done

The application is now ready to deploy. Follow `docs/installation.md` on the Passbolt server.

**Open follow-ups (out of plan scope, see Spec §13):**
- Real SMTP credentials in `.env` on the server
- Logo + accent color
- Full Impressum + Datenschutz text from Bytexx legal template
- Backup script update (`--ignore-table=sharepassword.secrets`)
