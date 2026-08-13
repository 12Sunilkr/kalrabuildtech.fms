import path from 'path';
import { pathToFileURL } from 'url';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', '');

  return {
    server: {
      port: 3000,
      host: '0.0.0.0',
      // Proxy all /api requests to backend during dev to match production API path.
      proxy: {
        '/api': {
          target: 'http://localhost:4001',
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

    build: {
      target: 'es2020',
      minify: 'esbuild',
      cssMinify: true,
      // ====================================
      // LOW RAM OPTIMIZATION
      // ====================================
      // Reduce memory usage during build
      reportCompressedSize: false, // Skip gzip compression check (saves RAM)
      terserOptions: {
        compress: {
          drop_console: true,
          drop_debugger: true,
        },
        mangle: true,
        output: {
          comments: false,
        }
      },
      // Ensure mixed CommonJS/ESM modules are transformed
      commonjsOptions: {
        transformMixedEsModules: true,
      },
      chunkSizeWarningLimit: 600,
      
      // ====================================
      // CHUNK SPLITTING FOR PRODUCTION
      // ====================================
      rollupOptions: {
        output: {
          // Split chunks for better caching and reduced memory during build
          manualChunks(id) {
            if (!id.includes('node_modules')) return;
            const normalizedId = id.replace(/\\/g, '/');
            
            // Separate large dependency chunks to reduce main bundle
            if (normalizedId.includes('lucide-react')) return 'icons';
            if (normalizedId.includes('recharts') || normalizedId.includes('d3-')) return 'charts';
            if (normalizedId.includes('date-fns')) return 'date-fns';
            if (normalizedId.includes('@google/generative-ai')) return 'genai';
            if (normalizedId.includes('axios')) return 'http';
            
            // Large vendor chunk for remaining deps
            return 'vendor';
          },
          // Asset file naming (immutable hashes for caching)
          assetFileNames: (assetInfo) => {
            const info = assetInfo.name.split('.');
            const ext = info[info.length - 1];
            if (/png|jpe?g|gif|svg|webp|ico/.test(ext)) {
              return `assets/images/[name]-[hash][extname]`;
            } else if (/woff|woff2|ttf|otf|eot/.test(ext)) {
              return `assets/fonts/[name]-[hash][extname]`;
            } else if (ext === 'css') {
              return `assets/css/[name]-[hash][extname]`;
            } else {
              return `assets/[name]-[hash][extname]`;
            }
          },
          chunkFileNames: `chunks/[name]-[hash].js`,
          entryFileNames: `[name]-[hash].js`,
        }
      }
    },

    // ====================================
    // DEPENDENCY OPTIMIZATION
    // ====================================
    optimizeDeps: {
      // Pre-bundle heavy dependencies to avoid runtime CJS/ESM issues
      include: ['lucide-react', 'react', 'react-dom', 'axios'],
      // Exclude large optional dependencies
      exclude: [],
      esbuildOptions: {
        // Use only essential plugins for faster esbuild
        loader: {
          '.js': 'jsx',
        },
      }
    },
    esbuild: {
      drop: mode === 'production' ? ['console', 'debugger'] : [],
    },

    plugins: [
      tailwindcss(),
      react(),
      // Embeds the Express API into the Vite dev server so /api is served by the project itself in dev
      {
        name: 'embed-express-api',
        async configureServer(server) {
          // Safe embedding flow: expose a fallback 503 response for /api until the app is ready
          let expressApp = null;
          try {
            process.env.VITE_EMBEDDED = '1';
            const mod = await import(pathToFileURL(path.resolve(process.cwd(), 'server/index.js')).href + '?t=' + Date.now());
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
            const normalizedFile = file.replace(/\\/g, '/');
            if (normalizedFile.endsWith('server/index.js') || normalizedFile.endsWith('server/index.ts')) {
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
