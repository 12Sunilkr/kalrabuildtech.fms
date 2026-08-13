/**
 * Debounced SQLite (sql.js) persistence — batches rapid writes into one disk flush.
 * Reduces main-thread blocking from repeated full DB exports.
 */

let persistTimer = null;
let hasPendingChanges = false;
let lastFlushAt = 0;

const DEFAULT_DELAY_MS = Number(process.env.DB_PERSIST_DELAY_MS || (process.env.NODE_ENV === 'production' ? 10000 : 1000));

export function createDebouncedPersist(exportFn, writeFn, delayMs = DEFAULT_DELAY_MS) {
  const flush = () => {
    if (!hasPendingChanges) return;
    hasPendingChanges = false;
    persistTimer = null;
    try {
      const data = exportFn();
      writeFn(data);
      lastFlushAt = Date.now();
    } catch (e) {
      console.error('[dbPersist] Failed to export or write database:', e);
    }
  };

  const schedule = () => {
    hasPendingChanges = true;
    if (persistTimer) clearTimeout(persistTimer);
    persistTimer = setTimeout(flush, delayMs);
  };

  const flushNow = () => {
    if (persistTimer) {
      clearTimeout(persistTimer);
      persistTimer = null;
    }
    hasPendingChanges = true;
    flush();
  };

  const shutdown = () => {
    if (persistTimer || hasPendingChanges) flushNow();
  };

  return { schedule, flushNow, shutdown, getLastFlushAt: () => lastFlushAt };
}
