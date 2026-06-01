/**
 * Debounced SQLite (sql.js) persistence — batches rapid writes into one disk flush.
 * Reduces main-thread blocking from repeated full DB exports.
 */

let persistTimer = null;
let pendingExport = null;
let lastFlushAt = 0;

const DEFAULT_DELAY_MS = Number(process.env.DB_PERSIST_DELAY_MS || (process.env.NODE_ENV === 'production' ? 10000 : 1000));

export function createDebouncedPersist(exportFn, writeFn, delayMs = DEFAULT_DELAY_MS) {
  const flush = () => {
    if (!pendingExport) return;
    const data = pendingExport;
    pendingExport = null;
    persistTimer = null;
    writeFn(data);
    lastFlushAt = Date.now();
  };

  const schedule = () => {
    pendingExport = exportFn();
    if (persistTimer) clearTimeout(persistTimer);
    persistTimer = setTimeout(flush, delayMs);
  };

  const flushNow = () => {
    if (persistTimer) {
      clearTimeout(persistTimer);
      persistTimer = null;
    }
    pendingExport = exportFn();
    flush();
  };

  const shutdown = () => {
    if (persistTimer || pendingExport) flushNow();
  };

  return { schedule, flushNow, shutdown, getLastFlushAt: () => lastFlushAt };
}
