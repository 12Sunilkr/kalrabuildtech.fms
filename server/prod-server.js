// Production host: serves built SPA from `dist` and mounts the API (embedded)
process.env.VITE_EMBEDDED = '1';

import express from 'express';
import path from 'path';
import fs from 'fs';
import compression from 'compression';
import initSqlJs from 'sql.js';

// Must import the API app dynamically so VITE_EMBEDDED is set before server/index.js evaluates.
const apiApp = (await import('./index.js')).default;

const host = express();

// Enable Gzip compression
host.use(compression());

// Mount API first
host.use(apiApp);

// Optional one-time demo user cleanup (run by setting RUN_DEMO_CLEANUP=1)
if (process.env.RUN_DEMO_CLEANUP === '1') {
  (async () => {
    try {
      const dbFile = path.resolve(process.cwd(), 'server', 'database.sqlite');
      if (!fs.existsSync(dbFile)) {
        console.warn('RUN_DEMO_CLEANUP: database file not found, skipping cleanup');
        return;
      }
      const SQL = await initSqlJs();
      const buff = fs.readFileSync(dbFile);
      const db = new SQL.Database(new Uint8Array(buff));

      db.run('BEGIN TRANSACTION');
      // Remove tasks referencing numeric user ids 3 and 4
      try { db.run("DELETE FROM tasks WHERE assigned_to IN (3,4) OR assigned_by IN (3,4)"); } catch (e) { /* ignore */ }
      // Remove tasks referencing employee ids E-001/E-002
      try { db.run("DELETE FROM tasks WHERE assignedTo IN ('E-001','E-002') OR assignedBy IN ('E-001','E-002')"); } catch (e) { /* ignore */ }
      // Remove the users and employee records
      try { db.run('DELETE FROM users WHERE id IN (3,4)'); } catch (e) { /* ignore */ }
      try { db.run("DELETE FROM employees WHERE id IN ('E-001','E-002')"); } catch (e) { /* ignore */ }
      db.run('COMMIT');

      fs.writeFileSync(dbFile, Buffer.from(db.export()));
      console.log('RUN_DEMO_CLEANUP: completed cleanup of demo users and related tasks');
    } catch (err) {
      console.error('RUN_DEMO_CLEANUP failed', err && (err.stack || err.message || err));
    }
  })();
}

// Serve static built files with browser caching (1 year for immutable assets)
const staticRoot = path.resolve(process.cwd(), 'dist');
host.use(express.static(staticRoot, {
  maxAge: '1y',
  setHeaders: (res, path) => {
    if (path.endsWith('.html')) {
      // Don't cache index.html
      res.setHeader('Cache-Control', 'no-cache');
    }
  }
}));

// SPA fallback
host.get('*', (req, res) => {
  res.sendFile(path.join(staticRoot, 'index.html'));
});

const port = process.env.PORT || 3000;
const server = host.listen(port, '0.0.0.0', () => {
  console.log(`Production server (static + API) listening on http://0.0.0.0:${port}`);
});
server.keepAliveTimeout = 65000;
server.headersTimeout = 66000;
server.on('error', (err) => {
  console.error('Production server error', err && (err.stack || err.message || err));
  if (err && err.code === 'EADDRINUSE') {
    console.error(`EADDRINUSE: Port ${port} already in use. On Windows run: netstat -ano | findstr :${port} and then taskkill /PID <pid> /F to free it.`);
    process.exit(1);
  }
});