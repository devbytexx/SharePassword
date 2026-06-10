// Storage-Facade: wählt zwischen MariaDB (Produktion) und In-Memory (Dev).
// Aktivierung via SP_NO_DB=1.

const useMemory = process.env.SP_NO_DB === '1';

const impl = useMemory
  ? await import('./storage-memory.js')
  : await import('./db.js');

export const initPool = impl.initPool;
export const getPool = impl.getPool;
export const closePool = impl.closePool;
export const insertSecret = impl.insertSecret;
export const getSecret = impl.getSecret;
export const deleteSecret = impl.deleteSecret;
export const logAttempt = impl.logAttempt;
export const countRecentAttempts = impl.countRecentAttempts;
export const incrementCounter = impl.incrementCounter;
export const getCounters = impl.getCounters;

export const isMemoryMode = useMemory;
