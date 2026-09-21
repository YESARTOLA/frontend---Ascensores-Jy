import { useCallback, useRef, useState } from 'react';
import { archivosService } from '../services';

/**
 * Subida de adjuntos con progreso real, para no dejar al usuario esperando a
 * ciegas cuando sube un video o un PDF pesado desde la obra.
 *
 * No hay límite de peso en ningún lado del circuito: lo que hay es información —
 * qué archivo va, cuánto lleva, cuánto falta y si algo falló.
 *
 * Uso típico:
 *
 *   const carga = useCargaArchivos();
 *   ...
 *   await carga.subirVarios(files, 'evidencias', {
 *     onArchivoSubido: async (archivo, file) => { await crearEvidencia(archivo.id); }
 *   });
 *   ...
 *   <BarraProgresoCarga carga={carga} />
 *
 * El progreso que se muestra es el de la transferencia navegador → servidor,
 * que es el tramo lento y el único medible desde el cliente. Cuando llega al
 * 100 % la petición sigue viva mientras el backend escribe en el storage: esa
 * espera se comunica como fase "procesando" en vez de dejar la barra congelada
 * en 100 % sin explicación.
 */

/** Bytes → "12,4 MB" */
export function formatBytes(bytes) {
  const n = Number(bytes);
  if (!Number.isFinite(n) || n <= 0) return '0 B';
  const unidades = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.min(Math.floor(Math.log(n) / Math.log(1024)), unidades.length - 1);
  const valor = n / Math.pow(1024, i);
  return `${valor.toFixed(i === 0 ? 0 : valor >= 100 ? 0 : 1).replace('.', ',')} ${unidades[i]}`;
}

/** Segundos → "2 min 10 s" / "45 s" */
export function formatDuracion(segundos) {
  const s = Math.max(0, Math.round(segundos));
  if (s < 60) return `${s} s`;
  const min = Math.floor(s / 60);
  const resto = s % 60;
  if (min < 60) return resto ? `${min} min ${resto} s` : `${min} min`;
  const h = Math.floor(min / 60);
  return `${h} h ${min % 60} min`;
}

const ESTADO_INICIAL = null;

export default function useCargaArchivos() {
  const [progreso, setProgreso] = useState(ESTADO_INICIAL);
  const abortRef = useRef(null);
  // Muestra de bytes/tiempo para estimar velocidad sin que dé saltos bruscos.
  const marcaRef = useRef(null);

  const limpiar = useCallback(() => {
    setProgreso(ESTADO_INICIAL);
    marcaRef.current = null;
  }, []);

  const cancelar = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  /**
   * Sube una lista de archivos, uno detrás de otro.
   *
   * @param {File[]} archivos
   * @param {string} tipo carpeta destino ('evidencias', 'guias', 'ot'…)
   * @param {object} opciones
   *   onArchivoSubido(archivo, file, indice) — se ejecuta tras subir cada uno
   *     (por ejemplo, para crear la evidencia que lo referencia). Mientras corre
   *     la barra muestra la fase "registrando".
   * @returns {Promise<Array>} los registros de tbl_archivos creados
   */
  const subirVarios = useCallback(async (archivos, tipo, opciones = {}) => {
    const lista = Array.from(archivos || []);
    if (lista.length === 0) return [];

    const bytesTotales = lista.reduce((acc, f) => acc + (f.size || 0), 0);
    let bytesPrevios = 0; // bytes ya confirmados de los archivos anteriores
    const subidos = [];

    const controller = new AbortController();
    abortRef.current = controller;
    marcaRef.current = { t: Date.now(), bytes: 0 };

    try {
      for (let i = 0; i < lista.length; i++) {
        const file = lista[i];
        const base = {
          indice: i + 1,
          total: lista.length,
          nombre: file.name,
          bytesArchivo: file.size || 0,
          bytesTotales,
          error: null
        };
        setProgreso({
          ...base,
          fase: 'subiendo',
          pct: 0,
          pctTotal: bytesTotales ? Math.round((bytesPrevios / bytesTotales) * 100) : 0,
          cargados: 0,
          velocidad: null,
          restanteSeg: null
        });

        const fd = new FormData();
        fd.append('archivo', file);

        // eslint-disable-next-line no-await-in-loop
        const archivo = await archivosService.upload(fd, tipo, {
          signal: controller.signal,
          onUploadProgress: (ev) => {
            const cargados = ev.loaded || 0;
            const totalArchivo = ev.total || file.size || 0;
            const pct = totalArchivo ? Math.min(100, Math.round((cargados / totalArchivo) * 100)) : 0;

            // Velocidad media móvil sobre la última muestra (mín. 500 ms para
            // que el número no baile en cada evento).
            let velocidad = null;
            let restanteSeg = null;
            const marca = marcaRef.current;
            const ahora = Date.now();
            const acumulado = bytesPrevios + cargados;
            if (marca && ahora - marca.t >= 500) {
              velocidad = ((acumulado - marca.bytes) * 1000) / (ahora - marca.t);
              marcaRef.current = { t: ahora, bytes: acumulado, velocidad };
            } else if (marca?.velocidad) {
              velocidad = marca.velocidad;
            }
            if (velocidad > 0 && bytesTotales) {
              restanteSeg = (bytesTotales - acumulado) / velocidad;
            }

            setProgreso(p => (p ? {
              ...p,
              fase: pct >= 100 ? 'procesando' : 'subiendo',
              pct,
              pctTotal: bytesTotales ? Math.min(100, Math.round((acumulado / bytesTotales) * 100)) : pct,
              cargados,
              velocidad,
              restanteSeg
            } : p));
          }
        });

        subidos.push(archivo);

        if (opciones.onArchivoSubido) {
          setProgreso(p => (p ? { ...p, fase: 'registrando', pct: 100 } : p));
          // eslint-disable-next-line no-await-in-loop
          await opciones.onArchivoSubido(archivo, file, i);
        }

        bytesPrevios += file.size || 0;
      }

      limpiar();
      return subidos;
    } catch (err) {
      const cancelado = controller.signal.aborted
        || err?.code === 'ERR_CANCELED'
        || err?.name === 'CanceledError';
      if (cancelado) {
        limpiar();
        const e = new Error('Carga cancelada');
        e.cancelado = true;
        throw e;
      }
      // El error se deja visible en la barra (además del toast del llamador):
      // el usuario tiene que ver QUÉ archivo falló, no solo que "hubo un error".
      setProgreso(p => (p ? {
        ...p,
        fase: 'error',
        error: err?.response?.data?.error || err?.message || 'No se pudo completar la carga'
      } : p));
      throw err;
    } finally {
      abortRef.current = null;
    }
  }, [limpiar]);

  /** Atajo para un único archivo: devuelve el registro creado. */
  const subirUno = useCallback(async (file, tipo, opciones = {}) => {
    const [archivo] = await subirVarios([file], tipo, opciones);
    return archivo;
  }, [subirVarios]);

  return {
    progreso,
    subiendo: !!progreso && progreso.fase !== 'error',
    subirUno,
    subirVarios,
    cancelar,
    limpiar
  };
}
