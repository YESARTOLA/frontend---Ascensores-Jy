import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const apiTarget = env.VITE_API_PROXY || 'http://localhost:4003';
  return {
    plugins: [react()],
    server: {
      port: 3003,
      strictPort: true,
      host: true,
      proxy: {
        '/api': { target: apiTarget, changeOrigin: true },
        '/uploads': { target: apiTarget, changeOrigin: true }
      }
    },
    preview: { port: 3003, strictPort: true },
    build: { outDir: 'dist', sourcemap: false }
  };
});
