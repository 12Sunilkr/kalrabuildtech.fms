import fs from 'fs';

/**
 * Debounced SQLite (sql.js) persistence — batches rapid writes into one disk flush.
 * Reduces main-thread blocking from repeated full DB exports.
 */

let persistTimer = null;
let hasPendingChanges = false;
let lastFlushAt = 0;

const DEFAULT_DELAY_MS = Number(process.env.DB_PERSIST_DELAY_MS || (process.env.NODE_ENV === 'production' ? 10000 : 1000));

/**
 * Safely writes a file to disk on Windows/Linux by attempting an atomic rename,
 * falling back to copy+unlink if rename fails (e.g. EPERM / EBUSY file locking on Windows).
 */
export function safeWriteFileSync(filePath, buff) {
  const tmpFilePath = filePath + '.tmp';
  try {
    fs.writeFileSync(tmpFilePath, buff);
    try {
      fs.renameSync(tmpFilePath, filePath);
    } catch (renameErr) {
      if (
        renameErr &&
        (renameErr.code === 'EPERM' ||
          renameErr.code === 'EBUSY' ||
          renameErr.code === 'EACCES' ||
          renameErr.code === 'EXDEV')
      ) {
        // Fallback for Windows file lock preventing atomic renameSync over existing file
        fs.copyFileSync(tmpFilePath, filePath);
        try {
          fs.unlinkSync(tmpFilePath);
        } catch (_) {
          /* ignore tmp cleanup error */
        }
      } else {
        throw renameErr;
      }
    }
  } catch (err) {
    // Direct write fallback if temp file or copy failed
    try {
      fs.writeFileSync(filePath, buff);
      if (fs.existsSync(tmpFilePath)) {
        try {
          fs.unlinkSync(tmpFilePath);
        } catch (_) {
          /* ignore cleanup error */
        }
      }
    } catch (directWriteErr) {
      console.error(`[safeWriteFileSync] Failed to write ${filePath}:`, directWriteErr);
      throw directWriteErr;
    }
  }
}

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

