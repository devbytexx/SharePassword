// Pro-IP-Tageslimit. Verhindert Bulk-Spam ohne legit User zu nerven.
//
// In-Memory-Implementierung: Map(ipHashHex -> { count, dayKey }). Reset bei
// Tageswechsel. Reicht für single-instance. Bei Multi-Instance via Redis/DB
// ersetzen.

const MAX_PER_DAY = 24;
const buckets = new Map();

function dayKey() {
  // UTC-Datum als YYYY-MM-DD — Tageswechsel um 00:00 UTC
  const d = new Date();
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
}

export function check(ipHashHex) {
  const dk = dayKey();
  const e = buckets.get(ipHashHex);
  if (!e || e.dayKey !== dk) return { allowed: true, remaining: MAX_PER_DAY };
  return { allowed: e.count < MAX_PER_DAY, remaining: Math.max(0, MAX_PER_DAY - e.count) };
}

export function increment(ipHashHex) {
  const dk = dayKey();
  const e = buckets.get(ipHashHex);
  if (!e || e.dayKey !== dk) {
    buckets.set(ipHashHex, { count: 1, dayKey: dk });
  } else {
    e.count += 1;
  }
}

// Periodischer Cleanup alter Tage (vermeidet Memory-Leak bei vielen IPs)
let cleanupTimer = null;
export function startCleanup(intervalMs = 60 * 60 * 1000) {
  if (cleanupTimer) return;
  cleanupTimer = setInterval(() => {
    const dk = dayKey();
    for (const [k, v] of buckets) {
      if (v.dayKey !== dk) buckets.delete(k);
    }
  }, intervalMs).unref();   // .unref(): Cleanup hält Prozess nicht am Leben
}

// Testbarkeit
export function _reset() { buckets.clear(); }
export const MAX = MAX_PER_DAY;
