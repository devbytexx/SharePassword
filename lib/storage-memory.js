// In-Memory-Storage als DB-Ersatz für lokale Entwicklung.
// Wird aktiviert über SP_NO_DB=1. Gleiches Interface wie lib/db.js,
// damit routes/secret.js den Unterschied nicht sieht.
//
// Daten leben nur im RAM dieses Prozesses — Restart = Reset.
// NICHT für Produktion gedacht.

let secrets = new Map();   // tokenHex -> row object
let bruteLog = [];         // { tokenHex, ipHashHex, attemptAt: Date }

function toHex(buf) {
  return Buffer.isBuffer(buf) ? buf.toString('hex') : buf;
}

export function initPool(_config) {
  // no-op; memory storage doesn't need init
  return { _memory: true };
}

export function getPool() {
  return { _memory: true };
}

export async function closePool() {
  secrets.clear();
  bruteLog = [];
}

// Für Tests: harter Reset
export function _reset() {
  secrets = new Map();
  bruteLog = [];
}

// --- secrets ---

export async function insertSecret(row) {
  const key = toHex(row.token);
  secrets.set(key, {
    token: row.token,
    ciphertext: row.ciphertext,
    burn_after_read: row.burnAfterRead ? 1 : 0,
    has_passphrase: row.hasPassphrase ? 1 : 0,
    passphrase_salt: row.passphraseSalt,
    notify_email: row.notifyEmail,
    sender_hint: row.senderHint,
    expires_at: row.expiresAt instanceof Date ? row.expiresAt : new Date(row.expiresAt),
    size_bytes: row.sizeBytes
  });
}

export async function getSecret(token) {
  const key = toHex(token);
  const row = secrets.get(key);
  if (!row) return null;
  if (row.expires_at < new Date()) {
    secrets.delete(key);
    return null;
  }
  return row;
}

export async function deleteSecret(token) {
  const key = toHex(token);
  return secrets.delete(key);
}

// --- brute_log ---

export async function logAttempt(token, ipHash) {
  bruteLog.push({
    tokenHex: toHex(token),
    ipHashHex: toHex(ipHash),
    attemptAt: new Date()
  });
}

export async function countRecentAttempts(token, windowSec) {
  const cutoff = new Date(Date.now() - windowSec * 1000);
  const key = toHex(token);
  return bruteLog.filter(e => e.tokenHex === key && e.attemptAt >= cutoff).length;
}
