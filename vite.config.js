import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

// Backend caído un instante (nodemon lo reinicia con cada cambio de código): Vite
// respondería un 500 vacío, indistinguible de un error real de la API. Se
// responde 503 con un mensaje, y la cabecera indica si la petición llegó a
// salir hacia el backend, para que apiClient sepa si es seguro reintentarla.
// Este manejador va antes que el de Vite, que solo deja el error en su consola.
function backendNoDisponible(proxy) {
  proxy.on('error', (err, _req, res) => {
    if (!res || !('req' in res) || res.headersSent || res.writableEnded) return;
    res.writeHead(503, {
      'Content-Type': 'application/json; charset=utf-8',
      'X-Backend-No-Disponible': err.code === 'ECONNREFUSED' ? 'sin-conexion' : 'interrumpido'
    });
    res.end(JSON.stringify({ error: 'El servidor se está reiniciando. Intenta de nuevo en unos segundos.' }));
  });
}

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
        '/api': { target: apiTarget, changeOrigin: true, configure: backendNoDisponible },
        '/uploads': { target: apiTarget, changeOrigin: true }
      }
    },
    preview: { port: 3003, strictPort: true },
    build: { outDir: 'dist', sourcemap: false }
  };
});
