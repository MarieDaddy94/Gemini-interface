
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, (process as any).cwd(), '');
  
  return {
    plugins: [react()],
    // Use relative base path for Electron compatibility
    base: './',
    resolve: {
      alias: {
        "@": path.resolve((process as any).cwd(), "./src"),
      },
    },
    server: {
      port: 5173,
      proxy: {
        // Proxy API requests to the Express backend
        '/api': {
          target: env.VITE_API_BASE_URL || 'http://localhost:4000',
          changeOrigin: true,
          secure: false,
        },
        // Proxy WebSocket connections for market data
        '/ws': {
          target: (env.VITE_API_BASE_URL || 'http://localhost:4000').replace(/^http/, 'ws'),
          ws: true,
          changeOrigin: true,
        },
      },
    },
    build: {
      outDir: 'dist',
      sourcemap: mode === 'development',
    },
    define: {
      // Polyfill process.env for some older libraries if needed
      'process.env': process.env,
    },
  };
});
