import axios from 'axios';

const baseURL = import.meta.env.VITE_API_BASE || '/api';

// Base para servir archivos estáticos (uploads). Por defecto se deduce del API base:
//   VITE_API_BASE = "https://api.example.com/api"  →  assets = "https://api.example.com"
//   VITE_API_BASE = "/api"                          →  assets = ""
// Se puede forzar con VITE_ASSETS_BASE.
const assetsBase = (() => {
  const explicit = import.meta.env.VITE_ASSETS_BASE;
  if (explicit) return explicit.replace(/\/+$/, '');
  if (baseURL.startsWith('http')) return baseURL.replace(/\/api\/?$/, '');
  return '';
})();

/**
 * Construye una URL absoluta para un archivo subido por el backend.
 * Acepta rutas como "/uploads/documents/..." y deja intactas las URLs absolutas.
 */
export const assetUrl = (ruta) => {
  if (!ruta) return '';
  if (/^https?:\/\//i.test(ruta)) return ruta;
  const cleaned = ruta.startsWith('/') ? ruta : `/${ruta}`;
  return `${assetsBase}${cleaned}`;
};

const apiClient = axios.create({ baseURL, timeout: 30000 });

apiClient.interceptors.request.use((config) => {
  const token = localStorage.getItem('ajy_token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// Reintentos ante un backend momentáneamente caído: en desarrollo nodemon lo
// reinicia con cada cambio de código (ver backendNoDisponible en vite.config.js)
// y en producción puede coincidir con un redeploy. Solo se repite lo que es
// seguro repetir: cualquier petición que no llegó a salir hacia el backend, y
// las lecturas (GET) que se cortaron a medias.
const MAX_REINTENTOS = 5;
const ESPERA_REINTENTO_MS = 1000;

function debeReintentar(err) {
  const config = err.config;
  if (!config || (config.__reintentos || 0) >= MAX_REINTENTOS) return false;
  const res = err.response;
  if (res?.status === 503 && res.headers?.['x-backend-no-disponible'] === 'sin-conexion') return true;
  if ((config.method || 'get').toLowerCase() !== 'get') return false;
  // Sin respuesta: solo un corte de red, no un timeout ni una cancelación.
  if (!res) return err.code === 'ERR_NETWORK';
  return [502, 503, 504].includes(res.status);
}

apiClient.interceptors.response.use(
  (r) => r,
  async (err) => {
    if (debeReintentar(err)) {
      err.config.__reintentos = (err.config.__reintentos || 0) + 1;
      await new Promise(resolve => setTimeout(resolve, ESPERA_REINTENTO_MS));
      return apiClient(err.config);
    }
    if (err.response?.status === 401) {
      localStorage.removeItem('ajy_token');
      localStorage.removeItem('ajy_user');
      if (location.pathname !== '/login') location.href = '/login';
    }
    return Promise.reject(err);
  }
);

export default apiClient;
