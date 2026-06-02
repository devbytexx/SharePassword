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
    bruteMaxAttempts: 5,
    dailyMaxPerIp: 24,
    // Cloudflare Turnstile — wenn beide Werte gesetzt, ist Captcha aktiv.
    turnstileSiteKey: process.env.CF_TURNSTILE_SITE_KEY || null,
    turnstileSecret:  process.env.CF_TURNSTILE_SECRET   || null
  };
}
