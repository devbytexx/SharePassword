import {
  insertSecret, getSecret, deleteSecret,
  logAttempt, countRecentAttempts
} from '../lib/storage.js';
import { generateToken, hashIp, tokenToBase64Url, base64UrlToToken }
  from '../lib/crypto-utils.js';
import { sendBurnMail } from '../lib/mailer.js';
import * as quota from '../lib/quota.js';
import { verifyToken as verifyTurnstile } from '../lib/turnstile.js';

const createSchema = {
  body: {
    type: 'object',
    required: ['ciphertext', 'expiresIn', 'burnAfterRead', 'hasPassphrase'],
    additionalProperties: false,
    properties: {
      ciphertext:     { type: 'string', minLength: 1, maxLength: 48 * 1024 * 1024 },
      expiresIn:      { type: 'integer', enum: [3600, 10800, 43200, 86400, 604800, 1209600] },
      burnAfterRead:  { type: 'boolean' },
      hasPassphrase:  { type: 'boolean' },
      passphraseSalt: { type: ['string', 'null'] },
      notifyEmail:    { type: ['string', 'null'], maxLength: 255, pattern: '^[^@\\s]+@[^@\\s]+\\.[^@\\s]+$' },
      senderHint:     { type: ['string', 'null'], maxLength: 120 },
      honeypot:       { type: 'string', maxLength: 255 },
      turnstileToken: { type: ['string', 'null'], maxLength: 2048 }
    }
  }
};

quota.startCleanup();

export default async function secretRoutes(app) {
  const cfg = app.config;

  app.post('/api/secret', {
    schema: createSchema,
    config: { rateLimit: { max: 10, timeWindow: '1 minute' } }
  }, async (req, reply) => {
    const b = req.body;

    // Honeypot: echte Nutzer sehen das Feld nicht. Wenn gefüllt → Bot.
    if (b.honeypot && b.honeypot.trim() !== '') {
      req.log.warn('honeypot triggered');
      return reply.code(400).send({ error: 'honeypot' });
    }

    // Tageslimit pro IP (HMAC-Hash als Schlüssel, kein Klartext gespeichert)
    const ipHashHex = hashIp(req.ip || 'unknown', cfg.ipHashPepper).toString('hex');
    const q = quota.check(ipHashHex);
    if (!q.allowed) {
      return reply.code(429).send({ error: 'daily_limit', retryAfter: 86400 });
    }

    // Cloudflare Turnstile — nur wenn aktiviert (Secret in .env)
    if (cfg.turnstileSecret) {
      const tv = await verifyTurnstile(b.turnstileToken, cfg.turnstileSecret, req.ip);
      if (!tv.success) {
        req.log.warn({ reason: tv.reason }, 'turnstile rejected');
        return reply.code(403).send({ error: 'turnstile_failed' });
      }
    }

    if (b.hasPassphrase && !b.passphraseSalt) {
      return reply.code(400).send({ error: 'passphraseSalt required when hasPassphrase' });
    }

    const ciphertext = Buffer.from(b.ciphertext, 'base64');
    if (ciphertext.length === 0) return reply.code(400).send({ error: 'empty ciphertext' });
    // 25 MB Dateien werden durch Base64 (Datei→JSON) + Verschlüsselung zu
    // ~33 MB Ciphertext. 36 MB lässt etwas Reserve für Text. Muss zur
    // Client-Grenze (25 MB Dateien) und zum Schema-maxLength oben passen.
    if (ciphertext.length > 36 * 1024 * 1024) {
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

    quota.increment(ipHashHex);

    return {
      token: tokenToBase64Url(token),
      expiresAt: Math.floor(expiresAt.getTime() / 1000)
    };
  });

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

  app.get('/api/secret/:token', {
    schema: tokenParamSchema,
    config: { rateLimit: { max: 30, timeWindow: '1 minute' } }
  }, async (req, reply) => {
    const tokenBuf = parseToken(req.params.token);
    if (!tokenBuf) return reply.code(400).send({ error: 'invalid_token' });

    // Lock check before fetch: brute_log only contains rows from /attempt,
    // which require knowledge of the token. Fresh unknown tokens cannot be
    // locked, so this order does not leak existence to a new attacker.
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
      expiresAt: Math.floor(row.expires_at.getTime() / 1000)
    };
  });

  app.post('/api/secret/:token/burn', { schema: tokenParamSchema }, async (req, reply) => {
    const tokenBuf = parseToken(req.params.token);
    if (!tokenBuf) return reply.code(400).send({ error: 'invalid_token' });

    const row = await getSecret(tokenBuf);
    const deleted = await deleteSecret(tokenBuf);

    if (deleted && row && row.notify_email) {
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

  app.post('/api/secret/:token/attempt', {
    schema: tokenParamSchema,
    config: { rateLimit: { max: 20, timeWindow: '1 minute' } }
  }, async (req, reply) => {
    const tokenBuf = parseToken(req.params.token);
    if (!tokenBuf) return reply.code(400).send({ error: 'invalid_token' });
    const ipHash = hashIp(req.ip || 'unknown', cfg.ipHashPepper);
    await logAttempt(tokenBuf, ipHash);
    return reply.code(204).send();
  });
}
