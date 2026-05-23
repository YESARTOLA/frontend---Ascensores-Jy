/**
 * Helpers para coordenadas geográficas y enlace a Google Maps.
 *
 * El backend persiste lat/lng como Decimal(10,7); en el frontend llegan como
 * string (Prisma serializa Decimal a string) o como number cuando vienen de
 * formularios. `toNumeroSeguro` normaliza ambos casos.
 */

export function toNumeroSeguro(v) {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

export function tieneCoordenadas(obj) {
  if (!obj) return false;
  const lat = toNumeroSeguro(obj.latitud ?? obj.lat);
  const lng = toNumeroSeguro(obj.longitud ?? obj.lng);
  if (lat === null || lng === null) return false;
  if (lat < -90 || lat > 90) return false;
  if (lng < -180 || lng > 180) return false;
  return true;
}

export function coordsDe(obj) {
  if (!tieneCoordenadas(obj)) return null;
  return {
    lat: toNumeroSeguro(obj.latitud ?? obj.lat),
    lng: toNumeroSeguro(obj.longitud ?? obj.lng)
  };
}

/**
 * URL universal de Google Maps. Funciona en navegador desktop y abre la app
 * nativa en Android/iOS (Google detecta el user-agent y redirige).
 */
export function linkGoogleMaps({ lat, lng }) {
  return `https://www.google.com/maps?q=${lat},${lng}`;
}

export function formatCoords({ lat, lng }, decimales = 5) {
  return `${lat.toFixed(decimales)}, ${lng.toFixed(decimales)}`;
}
