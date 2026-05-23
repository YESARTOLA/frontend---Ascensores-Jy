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

apiClient.interceptors.response.use(
  (r) => r,
  (err) => {
    if (err.response?.status === 401) {
      localStorage.removeItem('ajy_token');
      localStorage.removeItem('ajy_user');
      if (location.pathname !== '/login') location.href = '/login';
    }
    return Promise.reject(err);
  }
);

export default apiClient;
