import { useEffect, useMemo, useState } from 'react';
import Modal from '../common/Modal.jsx';
import Loader from '../common/Loader.jsx';
import { serviciosService, assetUrl } from '../../services';
import { formatFecha, formatFechaHora } from '../../utils/formatters.js';
import { useToast } from '../common/Toast.jsx';

/**
 * Previsualización del informe de finalización ANTES de emitir el PDF.
 *
 * El técnico ve el informe tal como va a salir y puede corregir a mano los
 * textos: la nota de cada actividad, el comentario de cada fotografía y las
 * observaciones técnicas. Lo que corrige se guarda en su sitio de origen al
 * generar —no como una copia dentro del PDF—, de modo que el informe y la ficha
 * del servicio siguen contando lo mismo.
 *
 * Cada fotografía se identifica por su COMENTARIO y su FECHA de registro. El
 * nombre del archivo no se muestra: es un dato del almacenamiento
 * ("IMG_20260823.jpg"), no información del trabajo.
 *
 * Props:
 *   - open, onClose
 *   - idServicio
 *   - onConfirmar: (textos) => Promise — recibe solo lo que cambió
 *   - generando: bloquea el botón mientras se emite el PDF
 */

const LABEL_RESPUESTA = { si: 'Sí', no: 'No', na: 'N/A' };
const CLASE_RESPUESTA = { si: 'badge-green', no: 'badge-red', na: 'badge-gray' };

export default function InformePreviewModal({ open, onClose, idServicio, onConfirmar, generando = false }) {
  const [datos, setDatos] = useState(null);
  const [cargando, setCargando] = useState(false);
  // Solo los textos que el técnico tocó: lo que no está aquí no se reescribe.
  const [editados, setEditados] = useState({ items: {}, evidencias: {}, observaciones: {} });
  const toast = useToast();

  useEffect(() => {
    if (!open || !idServicio) return;
    let cancelado = false;
    setCargando(true);
    setEditados({ items: {}, evidencias: {}, observaciones: {} });
    serviciosService.previsualizarInforme(idServicio)
      .then(d => { if (!cancelado) setDatos(d); })
      .catch(err => {
        if (cancelado) return;
        toast.error(err.response?.data?.error || 'No se pudo cargar la previsualización');
        onClose?.();
      })
      .finally(() => { if (!cancelado) setCargando(false); });
    return () => { cancelado = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, idServicio]);

  const editable = !!datos?.editable;
  const valorItem = (it) => editados.items[it.id_item] ?? it.nota ?? '';
  const valorFoto = (f) => editados.evidencias[f.id] ?? f.comentario ?? '';
  const valorObs = (o) => editados.observaciones[o.id] ?? o.texto ?? '';

  const setTexto = (grupo, id, valor) =>
    setEditados(prev => ({ ...prev, [grupo]: { ...prev[grupo], [id]: valor } }));

  const totalCambios = useMemo(
    () => Object.values(editados).reduce((acc, g) => acc + Object.keys(g).length, 0),
    [editados]
  );

  // Solo se envían los textos de las fotos que son evidencia: las imágenes que
  // vienen de una observación se corrigen en su propio bloque, más abajo.
  const textosParaEnviar = () => ({
    items: editados.items,
    evidencias: Object.fromEntries(
      Object.entries(editados.evidencias).filter(([id]) =>
        (datos?.fotos || []).some(f => String(f.id) === String(id) && f.origen === 'evidencia'))
    ),
    observaciones: editados.observaciones
  });

  const itemsConContenido = (datos?.items || []).filter(it => it.respuesta || it.nota || it.fotos.length > 0);

  return (
    <Modal
      open={open}
      onClose={() => !generando && onClose?.()}
      title="Informe de finalización · previsualización"
      size="xl"
      footer={<>
        <button className="btn-secondary" onClick={onClose} disabled={generando}>Cancelar</button>
        <button className="btn-primary" disabled={generando || cargando}
          onClick={() => onConfirmar?.(textosParaEnviar())}>
          {generando ? 'Generando…' : 'Generar informe y continuar'}
        </button>
      </>}>

      {cargando ? <Loader /> : !datos ? null : datos.sin_checklist ? (
        <p className="text-sm text-slate-600">
          Este tipo de servicio no tiene checklist de finalización configurado, así que no se
          emite informe. Puedes continuar con el cierre.
        </p>
      ) : (
        <div className="space-y-5">
          <p className="text-xs text-carbon-500">
            Así saldrá el informe. Puedes corregir los textos aquí mismo; los cambios se guardan
            en el servicio al generar.
            {!editable && ' Este servicio ya está finalizado: el informe es solo de lectura.'}
          </p>

          {/* Cabecera del informe */}
          <div className="rounded-lg ring-1 ring-carbon-200 bg-ivory-50/60 p-4 grid grid-cols-2 sm:grid-cols-3 gap-3 text-sm">
            <Dato label="Servicio" valor={<span className="font-mono">{datos.servicio.codigo}</span>} />
            <Dato label="Cliente" valor={datos.servicio.cliente} />
            <Dato label="Edificio" valor={datos.servicio.edificio} />
            <Dato label="Tipo" valor={datos.servicio.tipo_servicio} />
            <Dato label="Ascensores" valor={datos.servicio.ascensores.join(', ')} />
            <Dato label="Técnicos" valor={datos.servicio.tecnicos.join(', ')} />
          </div>

          {/* Actividades realizadas */}
          <section>
            <h4 className="text-[11px] uppercase tracking-[0.18em] font-bold text-ember-700 mb-2">
              Actividades realizadas
            </h4>
            {itemsConContenido.length === 0 ? (
              <p className="text-xs text-slate-500 italic">Sin actividades registradas.</p>
            ) : (
              <div className="space-y-3">
                {itemsConContenido.map(it => (
                  <div key={it.id_item} className="rounded-lg ring-1 ring-carbon-100 p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="text-sm text-carbon-800">
                        {it.grupo && <span className="text-[10px] uppercase tracking-wider text-carbon-400 block">{it.grupo}</span>}
                        {it.texto}
                      </div>
                      {it.respuesta && (
                        <span className={`${CLASE_RESPUESTA[it.respuesta] || 'badge-gray'} shrink-0`}>
                          {LABEL_RESPUESTA[it.respuesta] || it.respuesta}
                        </span>
                      )}
                    </div>
                    <textarea
                      className="textarea mt-2 text-sm" rows="2" disabled={!editable}
                      placeholder="Nota de la actividad (opcional)"
                      value={valorItem(it)}
                      onChange={e => setTexto('items', it.id_item, e.target.value)} />
                    {it.fotos.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-2">
                        {it.fotos.map(f => (
                          <Miniatura key={f.id} archivo={f.archivo} pie={f.dia ? `Día ${f.dia}` : null} />
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* Observaciones técnicas */}
          {datos.observaciones.length > 0 && (
            <section>
              <h4 className="text-[11px] uppercase tracking-[0.18em] font-bold text-ember-700 mb-2">
                Observaciones técnicas
              </h4>
              <div className="space-y-2">
                {datos.observaciones.map(o => (
                  <div key={o.id} className="rounded-lg ring-1 ring-carbon-100 p-3">
                    <textarea
                      className="textarea text-sm" rows="2" disabled={!editable}
                      value={valorObs(o)}
                      onChange={e => setTexto('observaciones', o.id, e.target.value)} />
                    <div className="text-[11px] text-carbon-400 mt-1">
                      Registrada el {formatFechaHora(o.fecha)}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Registros fotográficos: comentario + fecha, sin nombre de archivo */}
          <section>
            <h4 className="text-[11px] uppercase tracking-[0.18em] font-bold text-ember-700 mb-2">
              Registros fotográficos · {datos.fotos.length}
            </h4>
            {datos.fotos.length === 0 ? (
              <p className="text-xs text-slate-500 italic">No hay fotografías adjuntas.</p>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {datos.fotos.map(f => (
                  <div key={`${f.origen}-${f.id}`} className="rounded-lg ring-1 ring-carbon-100 overflow-hidden">
                    <Miniatura archivo={f.archivo} alto="h-40" />
                    <div className="p-2 space-y-1">
                      <textarea
                        className="textarea text-xs" rows="2"
                        disabled={!editable || f.origen === 'observacion'}
                        placeholder={f.origen === 'observacion' ? 'Se edita en Observaciones técnicas' : 'Comentario de la foto'}
                        value={valorFoto(f)}
                        onChange={e => setTexto('evidencias', f.id, e.target.value)} />
                      <div className="text-[11px] text-carbon-400">
                        {formatFecha(f.fecha)}{f.dia ? ` · Día ${f.dia}` : ''}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          {totalCambios > 0 && (
            <p className="text-[11px] text-brand-700">
              {totalCambios} texto{totalCambios > 1 ? 's' : ''} corregido{totalCambios > 1 ? 's' : ''}; se guardarán al generar el informe.
            </p>
          )}
        </div>
      )}
    </Modal>
  );
}

function Dato({ label, valor }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider text-carbon-400">{label}</div>
      <div className="text-carbon-800">{valor || '—'}</div>
    </div>
  );
}

function Miniatura({ archivo, pie, alto = 'h-24' }) {
  if (!archivo?.ruta_almacenamiento) return null;
  const esImagen = (archivo.mime_type || '').startsWith('image/');
  if (!esImagen) {
    return <div className={`${alto} w-full grid place-items-center bg-carbon-50 text-[11px] text-carbon-400`}>Documento</div>;
  }
  return (
    <div className="relative">
      {/* Sin `alt` con el nombre del archivo: el informe no lo muestra en ningún sitio. */}
      <img src={assetUrl(archivo.ruta_almacenamiento)} alt="" className={`${alto} w-full object-cover`} />
      {pie && (
        <span className="absolute bottom-1 left-1 text-[10px] bg-black/60 text-white rounded px-1.5 py-0.5">{pie}</span>
      )}
    </div>
  );
}
