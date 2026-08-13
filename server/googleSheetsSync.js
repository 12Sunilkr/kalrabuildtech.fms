// server/googleSheetsSync.js
import https from 'https';

const WEBHOOK_URL = process.env.GOOGLE_SHEETS_WEBHOOK_URL || 'https://script.google.com/macros/s/AKfycbxUFz1rzJT1P6YTKKfBWHlA7I-4-2U3AAI8mrIUTsDRe9xdCkqWALkKySs5jGnyfVi7/exec';

let isSyncing = false;
let insecureTlsWarningShown = false;
let lastPayloadHash = '';
let lastSyncAt = 0;

const SYNC_ENABLED = process.env.GOOGLE_SHEETS_SYNC !== '0';
const MAX_ROWS_PER_TABLE = Number(process.env.GOOGLE_SHEETS_MAX_ROWS || 5000);
const SKIP_TABLES = new Set(
  (process.env.GOOGLE_SHEETS_SKIP_TABLES || 'kv,site_photos').split(',').map((s) => s.trim()).filter(Boolean)
);

function hashPayload(payload) {
  return JSON.stringify(payload).length + ':' + Object.keys(payload).sort().join(',');
}

const INSECURE_TLS_FALLBACK_CODES = new Set([
  'UNABLE_TO_VERIFY_LEAF_SIGNATURE',
  'SELF_SIGNED_CERT_IN_CHAIN',
  'CERT_HAS_EXPIRED',
  'UNABLE_TO_GET_ISSUER_CERT_LOCALLY',
]);

function shouldRetryWithInsecureTls(error) {
  const code = error?.cause?.code || error?.code;
  return INSECURE_TLS_FALLBACK_CODES.has(code);
}

async function postSheetsPayload(payload, allowInsecureTls = false) {
  const body = JSON.stringify(payload);
  if (!allowInsecureTls) {
    return fetch(WEBHOOK_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'text/plain;charset=utf-8', // Google Apps Script handles text/plain without CORS preflight
      },
      body
    });
  }

  // Built-in HTTPS fallback without external dependencies.
  return new Promise((resolve, reject) => {
    const req = https.request(WEBHOOK_URL, {
      method: 'POST',
      rejectUnauthorized: false,
      headers: {
        'Content-Type': 'text/plain;charset=utf-8',
        'Content-Length': Buffer.byteLength(body),
      },
    }, (res) => {
      // Drain response stream so socket closes cleanly.
      res.on('data', () => { });
      res.on('end', () => resolve({ status: res.statusCode || 0 }));
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

export async function syncToGoogleSheets(db) {
  if (isSyncing) return;

  // Skip syncing if database hasn't changed since the last successful sync
  if (global.dbChanged === false && lastSyncAt > 0) {
    return;
  }

  isSyncing = true;
  try {
    const payload = {};

    // Dynamically get all tables in the database (excluding internal sqlite tables)
    const tableStmt = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'");
    const tables = [];
    while (tableStmt.step()) {
      tables.push(tableStmt.get()[0]);
    }
    tableStmt.free();

    for (const table of tables) {
      if (SKIP_TABLES.has(table)) continue;
      try {
        const stmt = db.prepare(`SELECT * FROM ${table}`);
        const rows = [];
        let columns = [];

        let rowCount = 0;
        while (stmt.step()) {
          if (rowCount >= MAX_ROWS_PER_TABLE) break;
          rowCount++;
          if (columns.length === 0) columns = stmt.getColumnNames();
          const row = stmt.get().map(val => {
            // Google Sheets has a strict 50,000 character limit per cell
            if (typeof val === 'string' && val.length > 45000) {
              return val.substring(0, 45000) + '... [TRUNCATED]';
            }
            return val;
          });
          rows.push(row);
        }
        stmt.free();

        if (columns.length > 0) {
          payload[table] = [columns, ...rows];
        } else {
          payload[table] = [];
        }
      } catch (e) {
        console.warn(`Could not read table ${table} for sync`, e.message);
      }
    }

    if (Object.keys(payload).length > 0) {
      const payloadHash = hashPayload(payload);
      if (payloadHash === lastPayloadHash && Date.now() - lastSyncAt < 60000) {
        return;
      }
      let response;
      try {
        response = await postSheetsPayload(payload, false);
      } catch (err) {
        if (!shouldRetryWithInsecureTls(err)) throw err;
        if (!insecureTlsWarningShown) {
          insecureTlsWarningShown = true;
          console.warn(
            'Google Sheets sync TLS verification failed; retrying with insecure TLS fallback. ' +
            'Recommended: run Node with --use-system-ca to avoid this fallback.'
          );
        }
        response = await postSheetsPayload(payload, true);
      }
      lastPayloadHash = payloadHash;
      lastSyncAt = Date.now();
      global.dbChanged = false; // Reset the database change flag upon successful sync
      console.log('Successfully synced data to Google Sheets. Status:', response.status);
    }
  } catch (error) {
    console.error('Failed to sync to Google Sheets:', error);
  } finally {
    isSyncing = false;
  }
}

export function startPeriodicSync(dbOrGetDb, intervalMs = 300000) { // Default 5 minutes
  if (!SYNC_ENABLED) {
    console.log('Google Sheets sync disabled (GOOGLE_SHEETS_SYNC=0)');
    return;
  }
  console.log(`Starting periodic Google Sheets sync every ${intervalMs}ms`);

  const run = () => {
    const activeDb = typeof dbOrGetDb === 'function' ? dbOrGetDb() : dbOrGetDb;
    if (!activeDb) return;
    syncToGoogleSheets(activeDb).catch((e) => {
      console.error('Google Sheets sync error', e && (e.message || e));
    });
  };

  // Initial sync after startup (delayed so server is ready)
  setTimeout(run, 15000);

  setInterval(run, intervalMs);
}
