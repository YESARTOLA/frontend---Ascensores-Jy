import { useCallback, useEffect, useRef, useState } from 'react';
import { emergenciasService, archivosService } from '../../services';
import Modal from '../common/Modal.jsx';
import Loader from '../common/Loader.jsx';
import EmptyState from '../common/EmptyState.jsx';
import { useToast } from '../common/Toast.jsx';
import { useFilePreview } from '../common/FilePreview.jsx';
import { assetUrl } from '../../services/apiClient.js';
import { formatFechaHora } from '../../utils/formatters.js';

/**
 * Fotos y videos de contexto de una emergencia: los carga quien la reporta para
 * que el TÉCNICO asignado los revise antes de salir a campo.
 *
 * Funciona en dos modos:
 *
 *  - Persistido (`idEmergencia` presente): lee, sube y elimina contra el
 *    backend. Es el que abre el chip de la columna "Adjuntos".
 *  - Borrador (`idEmergencia` nulo): la emergencia todavía no existe, así que
 *    los archivos se suben al storage —ya quedan en tbl_archivos— y sus ids se
 *    devuelven al formulario vía `onChangeBorrador` para que viajen en el
 *    payload de creación.
 *
 * Props:
 *   open, onClose        — control del modal
 *   idEmergencia         — id, o null en modo borrador
 *   puedeGestionar       — si el rol puede adjuntar/eliminar (solo lectura si no)
 *   borrador             — array de adjuntos en modo borrador
 *   onChangeBorrador     — setter del array en modo borrador
 *   onCambio             — callback tras persistir, para que la tabla recargue
 */
export default function AdjuntosEmergenciaModal({
  open, onClose, idEmergencia, puedeGestionar = false,
  borrador = [], onChangeBorrador, onCambio
}) {
  const toast = useToast();
  const { open: abrirPreview } = useFilePreview();
  const inputRef = useRef(null);

  const esBorrador = !idEmergencia;
  const [items, setItems] = useState([]);
  const [cargando, setCargando] = useState(false);
  const [subiendo, setSubiendo] = useState(false);
  const [progreso, setProgreso] = useState(null);
  const [eliminandoId, setEliminandoId] = useState(null);
  const [max, setMax] = useState(null);
  // Cuando el backend deniega la gestión, manda sobre la prop optimista del padre.
  const [gestionable, setGestionable] = useState(puedeGestionar);

  const listaVisible = esBorrador ? borrador : items;
  const alTope = max != null && listaVisible.length >= max;

  const cargar = useCallback(() => {
    if (esBorrador || !open) return;
    setCargando(true);
    emergenciasService.listarArchivos(idEmergencia)
      .then(r => {
        setItems(r?.data ?? []);
        if (r?.meta?.max != null) setMax(r.meta.max);
        if (r?.meta?.puede_gestionar != null) setGestionable(r.meta.puede_gestionar);
      })
      .catch(() => { setItems([]); toast.error('No se pudieron cargar los adjuntos'); })
      .finally(() => setCargando(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idEmergencia, esBorrador, open]);

  useEffect(cargar, [cargar]);

  useEffect(() => { if (esBorrador) setGestionable(puedeGestionar); }, [esBorrador, puedeGestionar]);

  const seleccionar = async (e) => {
    const archivos = Array.from(e.target.files || []);
    e.target.value = '';
    if (archivos.length === 0) return;
    if (max != null && listaVisible.length + archivos.length > max) {
      return toast.error(`Máximo ${max} adjuntos por emergencia.`);
    }

    setSubiendo(true);
    const subidos = [];
    try {
      for (let i = 0; i < archivos.length; i++) {
        const file = archivos[i];
        setProgreso({ actual: i + 1, total: archivos.length, nombre: file.name, pct: 0 });
        const fd = new FormData();
        fd.append('archivo', file);
        const arch = await archivosService.upload(fd, 'emergencias', {
          onUploadProgress: (ev) => {
            if (!ev.total) return;
            setProgreso(p => (p ? { ...p, pct: Math.round((ev.loaded / ev.total) * 100) } : p));
          }
        });
        subidos.push(arch);
      }

      if (esBorrador) {
        onChangeBorrador?.([
          ...borrador,
          ...subidos.map((a, i) => ({ id_archivo: a.id, orden: borrador.length + i + 1, archivo: a }))
        ]);
      } else {
        await emergenciasService.agregarArchivos(
          idEmergencia,
          subidos.map((a, i) => ({ id_archivo: a.id, orden: listaVisible.length + i + 1 }))
        );
        cargar();
        onCambio?.();
      }
      toast.success(subidos.length === 1 ? 'Adjunto cargado' : `${subidos.length} adjuntos cargados`);
    } catch (err) {
      // Los ya subidos quedaron en el storage aunque falle el vínculo: se informa
      // en vez de fingir éxito parcial.
      toast.error(err.response?.data?.error || 'Error al subir los adjuntos');
      if (!esBorrador) cargar();
    } finally {
      setSubiendo(false);
      setProgreso(null);
    }
  };

  const quitar = async (item, idx) => {
    if (esBorrador) {
      onChangeBorrador?.(borrador.filter((_, i) => i !== idx));
      return;
    }
    setEliminandoId(item.id);
    try {
      await emergenciasService.eliminarArchivo(idEmergencia, item.id);
      toast.success('Adjunto eliminado');
      cargar();
      onCambio?.();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Error al eliminar el adjunto');
    } finally {
      setEliminandoId(null);
    }
  };

  const verArchivo = (arch) => {
    if (!arch?.ruta_almacenamiento) return;
    abrirPreview({
      url: assetUrl(arch.ruta_almacenamiento),
      name: arch.nombre_original,
      mime: arch.mime_type
    });
  };

  return (
    <Modal
      open={open}
      onClose={subiendo ? () => {} : onClose}
      title="Adjuntos de la emergencia"
      size="lg"
      footer={
        <button type="button" className="btn-secondary" onClick={onClose} disabled={subiendo}>
          Cerrar
        </button>
      }
    >
      <div className="space-y-4">
        <p className="text-xs text-slate-500">
          Fotos y videos de la falla. El técnico asignado los verá desde su vista de la emergencia.
        </p>

        {gestionable && (
          <div>
            <input
              ref={inputRef}
              type="file"
              accept="image/*,video/*"
              multiple
              className="hidden"
              onChange={seleccionar}
            />
            <button
              type="button"
              className="btn-secondary text-xs"
              onClick={() => inputRef.current?.click()}
              disabled={subiendo || alTope}
            >
              {subiendo ? 'Subiendo…' : '+ Agregar fotos o videos'}
            </button>
            {alTope && (
              <span className="ml-2 text-xs text-amber-700">
                Límite de {max} adjuntos alcanzado.
              </span>
            )}
          </div>
        )}

        {progreso && (
          <div className="rounded-lg ring-1 ring-slate-200 bg-slate-50 p-3">
            <div className="flex items-center justify-between text-xs text-slate-600 mb-1">
              <span className="truncate">
                {progreso.nombre} ({progreso.actual}/{progreso.total})
              </span>
              <span className="font-mono shrink-0 ml-2">{progreso.pct}%</span>
            </div>
            <div className="h-1.5 rounded-full bg-slate-200 overflow-hidden">
              <div className="h-full bg-brand-600 transition-all" style={{ width: `${progreso.pct}%` }} />
            </div>
          </div>
        )}

        {cargando ? <Loader /> : listaVisible.length === 0 ? (
          <EmptyState title="Sin adjuntos" />
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
            {listaVisible.map((item, idx) => {
              const arch = item.archivo;
              if (!arch) return null;
              const esImagen = (arch.mime_type || '').startsWith('image/');
              const esVideo = (arch.mime_type || '').startsWith('video/');
              const url = assetUrl(arch.ruta_almacenamiento);
              return (
                <div key={item.id ?? `borrador-${idx}`} className="group relative rounded-lg ring-1 ring-slate-200 overflow-hidden bg-slate-50">
                  <button
                    type="button"
                    onClick={() => verArchivo(arch)}
                    className="block w-full aspect-square bg-slate-100"
                    title={arch.nombre_original}
                  >
                    {esImagen ? (
                      <img src={url} alt={arch.nombre_original} className="w-full h-full object-cover" loading="lazy" />
                    ) : esVideo ? (
                      <video src={url} preload="metadata" muted playsInline className="w-full h-full object-cover pointer-events-none" />
                    ) : (
                      <div className="w-full h-full grid place-items-center text-xs text-slate-500 px-2 text-center">
                        {arch.nombre_original}
                      </div>
                    )}
                  </button>

                  {esVideo && (
                    <span className="pointer-events-none absolute top-1.5 left-1.5 rounded bg-black/60 text-white text-[10px] px-1.5 py-0.5">
                      video
                    </span>
                  )}

                  {gestionable && (
                    <button
                      type="button"
                      onClick={() => quitar(item, idx)}
                      disabled={eliminandoId === item.id}
                      className="absolute top-1.5 right-1.5 h-6 w-6 grid place-items-center rounded-full bg-black/60 hover:bg-rose-600 text-white text-xs opacity-0 group-hover:opacity-100 focus:opacity-100 transition disabled:opacity-50"
                      title="Eliminar adjunto"
                      aria-label={`Eliminar ${arch.nombre_original}`}
                    >
                      ×
                    </button>
                  )}

                  <div className="px-2 py-1.5 border-t border-slate-100 bg-white">
                    <div className="text-[11px] text-slate-700 truncate" title={arch.nombre_original}>
                      {arch.nombre_original}
                    </div>
                    {arch.fecha_subida && (
                      <div className="text-[10px] text-slate-400">{formatFechaHora(arch.fecha_subida)}</div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </Modal>
  );
}
