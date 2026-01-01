import path from 'path';
import { pathToFileURL } from 'url';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', '');

  return {
    server: {
      port: 3000,
      host: '0.0.0.0',
      // Proxy API calls to the backend to keep same-origin requests during dev
      proxy: {
        '/api': {
          target: 'http://127.0.0.1:4001',
          changeOrigin: true,
          secure: false,
          ws: true
        }
      },

      allowedHosts: [
        'kbt.kalrabuildtech.com'
      ],
    },

    preview: {
      allowedHosts: [
        "kbt.kalrabuildtech.com"   // <-- add your deploy domain here
      ]
    },

    plugins: [
      react(),
      // Embeds the Express API into the Vite dev server so /api is served by the project itself in dev
      {
        name: 'embed-express-api',
        async configureServer(server) {
          // Safe embedding flow: expose a fallback 503 response for /api until the app is ready
          let expressApp = null;
          try {
            process.env.VITE_EMBEDDED = '1';
            const mod = await import(pathToFileURL(path.resolve(process.cwd(), 'server/index.js')).href);
            expressApp = mod && (mod.default || mod.app);
            if (expressApp) {
              console.log('embed-express-api: Express app imported, mounting to Vite');
            } else {
              console.warn('embed-express-api: could not import express app, API will respond 503 until ready');
            }
          } catch (err) {
            console.error('embed-express-api: import failed', err && (err.stack || err.message || err));
          }

          // Middleware wrapper that returns 503 until expressApp is available
          server.middlewares.use((req, res, next) => {
            if (!req.url.startsWith('/api')) return next();
            if (!expressApp) {
              res.setHeader('Content-Type', 'application/json');
              res.statusCode = 503;
              return res.end(JSON.stringify({ message: 'API not ready' }));
            }
            return expressApp(req, res, next);
          });

          // If app becomes available later (e.g., hot reload of server/index.js), re-import
          server.watcher.on('change', async (file) => {
            if (file.endsWith('server/index.js') || file.endsWith('server/index.ts')) {
              try {
                const m = await import(pathToFileURL(path.resolve(process.cwd(), 'server/index.js')).href + '?t=' + Date.now());
                expressApp = m && (m.default || m.app);
                console.log('embed-express-api: reloaded embedded express app');
              } catch (err) {
                console.error('embed-express-api: reload failed', err && (err.stack || err.message || err));
              }
            }
          });

          console.log('Embedded Express API middleware installed');
        }
      }
    ],

    define: {
      'process.env.API_KEY': JSON.stringify(env.GEMINI_API_KEY),
      'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY),
    },

    resolve: {
      alias: {
        '@': path.resolve('.'),
      }
    }
  };
});
