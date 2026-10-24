// Dev host: runs the API (embedded) and Vite in middleware mode on a single process/port (default 3000)
process.env.VITE_EMBEDDED = '1';
process.env.DEV_SERVER_HOST = '1';

import express from 'express';
import { createServer as createViteServer } from 'vite';
import { execSync } from 'child_process';

// Automatically free ports 3000 & 24678 on Windows if occupied by orphaned processes
function freePorts(ports = [3000, 24678]) {
  if (process.platform === 'win32') {
    try {
      const portList = ports.join(',');
      const ps = `Get-NetTCPConnection -LocalPort ${portList} -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess -Unique | Where-Object { $_ -ne ${process.pid} } | ForEach-Object { Stop-Process -Id $_ -Force -ErrorAction SilentlyContinue }`;
      execSync(`powershell -NoProfile -Command "${ps}"`, { stdio: 'ignore' });
    } catch (e) {}
  }
}

freePorts([3000, 24678]);

// Dynamic import ensures process.env.VITE_EMBEDDED is set before server/index.js executes
const { default: apiApp } = await import('./index.js');

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
  let attempts = 0;
  while (attempts < 3) {
    try {
      await new Promise((resolve, reject) => {
        const server = host.listen(port, '0.0.0.0', () => {
          console.log(`Dev server (Vite + API) listening on http://0.0.0.0:${port}`);
          console.log('API routes available under the same origin (e.g. /api/health)');
          resolve();
        });
        server.on('error', (err) => {
          if (err && err.code === 'EADDRINUSE') {
            freePorts([port, 24678]);
            reject(err);
          } else {
            console.error('Dev server error', err && (err.stack || err.message || err));
            reject(err);
          }
        });
      });
      break;
    } catch (err) {
      attempts++;
      if (attempts >= 3) {
        console.error(`Dev server error: Port ${port} could not be bound after retries.`);
        process.exit(1);
      }
      await new Promise(r => setTimeout(r, 600));
    }
  }
}

start().catch(err => {
  console.error('Failed to start embedded dev server', err && (err.stack || err.message || err));
  process.exit(1);
});