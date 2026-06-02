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
      ciphertext:     { type: 'string', minLength: 1, maxLength: 7 * 1024 * 1024 },
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
