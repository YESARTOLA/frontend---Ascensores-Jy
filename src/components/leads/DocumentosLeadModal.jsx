import { useCallback, useEffect, useRef, useState } from 'react';
import { leadsService, archivosService } from '../../services';
import Modal from '../common/Modal.jsx';
import Loader from '../common/Loader.jsx';
import EmptyState from '../common/EmptyState.jsx';
import { useToast } from '../common/Toast.jsx';
import { useFilePreview, descargarArchivo } from '../common/FilePreview.jsx';
import { assetUrl } from '../../services/apiClient.js';
import { formatFechaHora } from '../../utils/formatters.js';

/**
 * Documentos libres del lead: la CENTRAL DE VENTAS los sube durante la etapa
 * comercial (PDF, imágenes, videos, Office, planos…) y la VENDEDORA asignada
 * los consulta y descarga desde su lead.
 *
 * Al convertir el lead en cliente/servicio los documentos NO se copian ni se
 * mueven: se quedan en el lead, que sigue consultable como "Ingresado".
 *
 * Quién puede subir/eliminar lo decide el backend (`meta.puede_gestionar`); la
 * prop `puedeGestionar` es solo el valor optimista mientras carga la lista.
 *
 * Props:
 *   open, onClose   — control del modal
 *   lead            — lead abierto (id + nombre_contacto para el título)
 *   puedeGestionar  — estimación por rol del padre (la manda el backend)
 *   onCambio        — callback tras subir/eliminar, para que la tabla recargue
 */

const EXTENSION = (nombre) => (nombre || '').split('.').pop()?.toUpperCase() || 'ARCHIVO';

function formatTamano(bytes) {
  if (!Number.isFinite(bytes) || bytes <= 0) return null;
  const unidades = ['B', 'KB', 'MB', 'GB'];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), unidades.length - 1);
  const valor = bytes / Math.pow(1024, i);
  return `${valor >= 10 || i === 0 ? Math.round(valor) : valor.toFixed(1)} ${unidades[i]}`;
}

export default function DocumentosLeadModal({ open, onClose, lead, puedeGestionar = false, onCambio }) {
  const toast = useToast();
  const { open: abrirPreview } = useFilePreview();
  const inputRef = useRef(null);

  const [items, setItems] = useState([]);
  const [cargando, setCargando] = useState(false);
  const [subiendo, setSubiendo] = useState(false);
  const [progreso, setProgreso] = useState(null);
  const [eliminandoId, setEliminandoId] = useState(null);
  const [max, setMax] = useState(null);
  // Cuando el backend deniega la gestión, manda sobre la prop optimista del padre.
  const [gestionable, setGestionable] = useState(puedeGestionar);

  const idLead = lead?.id;
  const alTope = max != null && items.length >= max;
  const soloLectura = !gestionable;

  const cargar = useCallback(() => {
    if (!open || !idLead) return;
    setCargando(true);
    leadsService.documentos(idLead)
      .then(r => {
        setItems(r?.data ?? []);
        if (r?.meta?.max != null) setMax(r.meta.max);
        if (r?.meta?.puede_gestionar != null) setGestionable(r.meta.puede_gestionar);
      })
      .catch(() => { setItems([]); toast.error('No se pudieron cargar los documentos'); })
      .finally(() => setCargando(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idLead, open]);

  useEffect(cargar, [cargar]);

  useEffect(() => { if (open) setGestionable(puedeGestionar); }, [open, puedeGestionar]);

  const seleccionar = async (e) => {
    const archivos = Array.from(e.target.files || []);
    e.target.value = '';
    if (archivos.length === 0) return;
    if (max != null && items.length + archivos.length > max) {
      return toast.error(`Máximo ${max} documentos por lead.`);
    }

    setSubiendo(true);
    const subidos = [];
    try {
      for (let i = 0; i < archivos.length; i++) {
        const file = archivos[i];
        setProgreso({ actual: i + 1, total: archivos.length, nombre: file.name, pct: 0 });
        const fd = new FormData();
        fd.append('archivo', file);
        const arch = await archivosService.upload(fd, 'leads', {
          onUploadProgress: (ev) => {
            if (!ev.total) return;
            setProgreso(p => (p ? { ...p, pct: Math.round((ev.loaded / ev.total) * 100) } : p));
          }
        });
        subidos.push(arch);
      }

      await leadsService.agregarDocumentos(
        idLead,
        subidos.map((a, i) => ({ id_archivo: a.id, orden: items.length + i + 1 }))
      );
      cargar();
      onCambio?.();
      toast.success(subidos.length === 1 ? 'Documento cargado' : `${subidos.length} documentos cargados`);
    } catch (err) {
      // Los ya subidos quedaron en el storage aunque falle el vínculo: se informa
      // en vez de fingir éxito parcial.
      toast.error(err.response?.data?.error || 'Error al subir los documentos');
      cargar();
    } finally {
      setSubiendo(false);
      setProgreso(null);
    }
  };

  const quitar = async (item) => {
    setEliminandoId(item.id);
    try {
      await leadsService.eliminarDocumento(idLead, item.id);
      toast.success('Documento eliminado');
      cargar();
      onCambio?.();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Error al eliminar el documento');
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
      title={`Documentos del lead${lead?.nombre_contacto ? `: ${lead.nombre_contacto}` : ''}`}
      size="lg"
      footer={
        <button type="button" className="btn-secondary" onClick={onClose} disabled={subiendo}>
          Cerrar
        </button>
      }
    >
      <div className="space-y-4">
        <p className="text-xs text-slate-500">
          {soloLectura
            ? 'Documentos cargados por la Central de ventas. Ábrelos para verlos o descárgalos.'
            : 'Cualquier documento del prospecto: PDF, imágenes, videos, Office, planos… La vendedora asignada podrá verlos y descargarlos.'}
          {' '}Al convertir el lead, estos documentos se quedan aquí.
        </p>

        {gestionable && (
          <div>
            <input ref={inputRef} type="file" multiple className="hidden" onChange={seleccionar} />
            <button
              type="button"
              className="btn-secondary text-xs"
              onClick={() => inputRef.current?.click()}
              disabled={subiendo || alTope}
            >
              {subiendo ? 'Subiendo…' : '+ Agregar documentos'}
            </button>
            {alTope && (
              <span className="ml-2 text-xs text-amber-700">Límite de {max} documentos alcanzado.</span>
            )}
          </div>
        )}

        {progreso && (
          <div className="rounded-lg ring-1 ring-slate-200 bg-slate-50 p-3">
            <div className="flex items-center justify-between text-xs text-slate-600 mb-1">
              <span className="truncate">{progreso.nombre} ({progreso.actual}/{progreso.total})</span>
              <span className="font-mono shrink-0 ml-2">{progreso.pct}%</span>
            </div>
            <div className="h-1.5 rounded-full bg-slate-200 overflow-hidden">
              <div className="h-full bg-brand-600 transition-all" style={{ width: `${progreso.pct}%` }} />
            </div>
          </div>
        )}

        {cargando ? <Loader /> : items.length === 0 ? (
          <EmptyState title="Sin documentos" />
        ) : (
          <ul className="space-y-2">
            {items.map(item => {
              const arch = item.archivo;
              if (!arch) return null;
              const esImagen = (arch.mime_type || '').startsWith('image/');
              const esVideo = (arch.mime_type || '').startsWith('video/');
              const url = assetUrl(arch.ruta_almacenamiento);
              const tamano = formatTamano(arch.tamano_bytes);
              return (
                <li key={item.id} className="flex items-center gap-3 bg-white rounded-lg ring-1 ring-slate-200 px-3 py-2">
                  <button
                    type="button"
                    onClick={() => verArchivo(arch)}
                    className="h-12 w-12 shrink-0 rounded-md overflow-hidden bg-slate-100 grid place-items-center"
                    title={arch.nombre_original}
                  >
                    {esImagen ? (
                      <img src={url} alt={arch.nombre_original} className="w-full h-full object-cover" loading="lazy" />
                    ) : esVideo ? (
                      <video src={url} preload="metadata" muted playsInline className="w-full h-full object-cover pointer-events-none" />
                    ) : (
                      <span className="text-[10px] font-semibold text-slate-500">{EXTENSION(arch.nombre_original)}</span>
                    )}
                  </button>

                  <div className="min-w-0 flex-1">
                    <button
                      type="button"
                      onClick={() => verArchivo(arch)}
                      className="block w-full text-left text-sm text-brand-700 hover:underline truncate"
                      title={arch.nombre_original}
                    >
                      {arch.nombre_original}
                    </button>
                    <div className="text-[11px] text-slate-500 truncate">
                      {[
                        tamano,
                        arch.fecha_subida ? formatFechaHora(arch.fecha_subida) : null,
                        item.usuario_registrador?.nombres
                      ].filter(Boolean).join(' · ')}
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    {/* Abre el visor global (FilePreview) por encima de este
                        modal: PDF, imagen, video, audio y texto se ven sin salir
                        de la pantalla; el resto ofrece la descarga. */}
                    <button
                      type="button"
                      onClick={() => verArchivo(arch)}
                      className="text-xs text-brand-700 hover:underline font-medium"
                      aria-label={`Ver ${arch.nombre_original}`}
                    >
                      Ver
                    </button>
                    <button
                      type="button"
                      onClick={() => descargarArchivo(arch)}
                      className="text-xs text-slate-600 hover:underline"
                    >
                      Descargar
                    </button>
                    {gestionable && (
                      <button
                        type="button"
                        onClick={() => quitar(item)}
                        disabled={eliminandoId === item.id}
                        className="text-xs text-rose-600 hover:underline disabled:opacity-50"
                        aria-label={`Eliminar ${arch.nombre_original}`}
                      >
                        {eliminandoId === item.id ? 'Eliminando…' : 'Eliminar'}
                      </button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </Modal>
  );
}
