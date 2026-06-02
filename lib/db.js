import mysql from 'mysql2/promise';

let pool = null;

export function initPool(config) {
  if (pool) throw new Error('db pool already initialized; call closePool first');
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
  return Number(rows[0].n);
}
