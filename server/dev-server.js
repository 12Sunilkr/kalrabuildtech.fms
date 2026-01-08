// Dev host: runs the API (embedded) and Vite in middleware mode on a single process/port (default 3000)
process.env.VITE_EMBEDDED = '1';

import express from 'express';
import { createServer as createViteServer } from 'vite';
import apiApp from './index.js';

const host = express();

async function start() {
  // Mount API first so /api/* routes are handled by the API app
  host.use(apiApp);

  // Create Vite dev server in middleware mode
  const vite = await createViteServer({
    server: { middlewareMode: true }
  });

  // Use Vite's middleware for serving static assets + HMR
  host.use(vite.middlewares);

  const port = process.env.PORT || 3000;
  const server = host.listen(port, '0.0.0.0', () => {
    console.log(`Dev server (Vite + API) listening on http://0.0.0.0:${port}`);
    console.log('API routes available under the same origin (e.g. /api/health)');
  });
  server.on('error', (err) => {
    console.error('Dev server error', err && (err.stack || err.message || err));
    if (err && err.code === 'EADDRINUSE') {
      console.error(`EADDRINUSE: Port ${port} already in use. Run ` +
        `netstat -ano | findstr :${port} and then taskkill /PID <pid> /F to free it.`);
      process.exit(1);
    }
  });
}

start().catch(err => {
  console.error('Failed to start embedded dev server', err && (err.stack || err.message || err));
  process.exit(1);
});