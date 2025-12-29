import path from 'path';
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
      }
    },

    preview: {
      allowedHosts: [
        "fmsproject-v2.onrender.com"   // <-- add your deploy domain here
      ]
    },

    plugins: [react()],

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
