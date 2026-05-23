import { useEffect, useRef, useState } from 'react';
import { configuracionService } from '../../services';
import { coordsDe, linkGoogleMaps, formatCoords } from '../../utils/mapa.js';

/**
 * Carga Leaflet (CSS + JS) desde CDN una sola vez por sesión. Lazy-load real:
 * no pesa en el bundle. Resuelve cuando `window.L` está disponible.
 *
 * NOTA: tiles OpenStreetMap requieren internet (igual que la mayoría del ERP).
 */
const LEAFLET_VERSION = '1.9.4';
let leafletPromise = null;
function cargarLeaflet() {
  if (typeof window === 'undefined') return Promise.reject(new Error('SSR'));
  if (window.L) return Promise.resolve(window.L);
  if (leafletPromise) return leafletPromise;
  leafletPromise = new Promise((resolve, reject) => {
    const css = document.createElement('link');
    css.rel = 'stylesheet';
    css.href = `https://unpkg.com/leaflet@${LEAFLET_VERSION}/dist/leaflet.css`;
    document.head.appendChild(css);
    const js = document.createElement('script');
    js.src = `https://unpkg.com/leaflet@${LEAFLET_VERSION}/dist/leaflet.js`;
    js.async = true;
    js.onload = () => resolve(window.L);
    js.onerror = () => {
      leafletPromise = null;
      reject(new Error('No se pudo cargar Leaflet'));
    };
    document.head.appendChild(js);
  });
  return leafletPromise;
}

/**
 * Cache en memoria de los defaults del mapa (centro y zoom) durante la sesión.
 * Evita pedirlos al backend cada vez que se monta el componente.
 */
let defaultsPromise = null;
function cargarDefaultsMapa() {
  if (defaultsPromise) return defaultsPromise;
  defaultsPromise = Promise.all([
    configuracionService.get('MAPA_CENTRO_LAT'),
    configuracionService.get('MAPA_CENTRO_LNG'),
    configuracionService.get('MAPA_ZOOM_DEFAULT')
  ]).then(([lat, lng, zoom]) => ({
    lat: Number(lat.valor),
    lng: Number(lng.valor),
    zoom: Number(zoom.valor)
  })).catch((err) => {
    defaultsPromise = null;
    throw err;
  });
  return defaultsPromise;
}

/**
 * Mapa Leaflet con un único marcador. Click en el mapa (modo editable) coloca
 * o mueve el pin. En readonly solo muestra el pin si hay coords.
 *
 * Props:
 *   valor      { latitud, longitud } | null     — pin actual
 *   onCambio   (coords) => void                 — solo en modo editable
 *   editable   boolean                          — habilita click-to-place
 *   alto       string (CSS, default '280px')    — altura del mapa
 *   className  string opcional                  — clase para el wrapper
 *   mostrarLinkMaps boolean (default true)      — pie con coords + link
 */
export default function MapaUbicacion({
  valor,
  onCambio,
  editable = false,
  alto = '280px',
  className = '',
  mostrarLinkMaps = true
}) {
  const contenedorRef = useRef(null);
  const mapaRef = useRef(null);
  const marcadorRef = useRef(null);
  const onCambioRef = useRef(onCambio);
  const [error, setError] = useState(null);
  const coordsActuales = coordsDe(valor);

  useEffect(() => { onCambioRef.current = onCambio; }, [onCambio]);

  // Inicialización (montaje único)
  useEffect(() => {
    let cancelado = false;
    Promise.all([cargarLeaflet(), cargarDefaultsMapa()])
      .then(([L, defaults]) => {
        if (cancelado || !contenedorRef.current) return;
        const inicio = coordsActuales || { lat: defaults.lat, lng: defaults.lng };
        const mapa = L.map(contenedorRef.current, {
          center: [inicio.lat, inicio.lng],
          zoom: coordsActuales ? 16 : defaults.zoom,
          scrollWheelZoom: true
        });
        L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
          maxZoom: 19,
          attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        }).addTo(mapa);
        mapaRef.current = mapa;

        if (coordsActuales) {
          marcadorRef.current = L.marker([coordsActuales.lat, coordsActuales.lng]).addTo(mapa);
        }

        if (editable) {
          mapa.on('click', (e) => {
            const { lat, lng } = e.latlng;
            if (marcadorRef.current) {
              marcadorRef.current.setLatLng([lat, lng]);
            } else {
              marcadorRef.current = L.marker([lat, lng]).addTo(mapa);
            }
            if (onCambioRef.current) onCambioRef.current({ lat, lng });
          });
          // El mapa puede iniciar con tamaño 0 si el modal aún no calculó su
          // ancho; invalidateSize fuerza un recalculo cuando el contenedor
          // termina de renderizar.
          setTimeout(() => mapa.invalidateSize(), 50);
        }
      })
      .catch((err) => {
        if (!cancelado) setError(err.message || 'Error cargando mapa');
      });

    return () => {
      cancelado = true;
      if (mapaRef.current) {
        mapaRef.current.remove();
        mapaRef.current = null;
        marcadorRef.current = null;
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Sincronizar el marcador cuando cambian las coords desde fuera (ej. al
  // limpiar la ubicación con un botón, o cuando llega el cliente del backend
  // después del primer render).
  useEffect(() => {
    if (!mapaRef.current) return;
    const L = window.L;
    if (!L) return;
    if (coordsActuales) {
      if (marcadorRef.current) {
        marcadorRef.current.setLatLng([coordsActuales.lat, coordsActuales.lng]);
      } else {
        marcadorRef.current = L.marker([coordsActuales.lat, coordsActuales.lng]).addTo(mapaRef.current);
      }
      mapaRef.current.setView([coordsActuales.lat, coordsActuales.lng], Math.max(mapaRef.current.getZoom(), 15));
    } else if (marcadorRef.current) {
      mapaRef.current.removeLayer(marcadorRef.current);
      marcadorRef.current = null;
    }
  }, [coordsActuales?.lat, coordsActuales?.lng]);

  if (error) {
    return (
      <div className={`rounded-lg ring-1 ring-rose-200 bg-rose-50 p-3 text-xs text-rose-700 ${className}`}>
        ⚠ {error}
      </div>
    );
  }

  return (
    <div className={className}>
      <div
        ref={contenedorRef}
        style={{ height: alto, width: '100%' }}
        className="rounded-lg ring-1 ring-slate-200 overflow-hidden"
      />
      {mostrarLinkMaps && coordsActuales && (
        <div className="mt-2 flex items-center justify-between gap-2 text-xs text-slate-600">
          <span className="font-mono">📍 {formatCoords(coordsActuales)}</span>
          <a
            href={linkGoogleMaps(coordsActuales)}
            target="_blank"
            rel="noopener noreferrer"
            className="text-brand-700 hover:underline font-medium"
          >
            Abrir en Google Maps ↗
          </a>
        </div>
      )}
      {editable && !coordsActuales && (
        <p className="mt-2 text-xs text-slate-500">Haz click en el mapa para fijar la ubicación del cliente.</p>
      )}
    </div>
  );
}
