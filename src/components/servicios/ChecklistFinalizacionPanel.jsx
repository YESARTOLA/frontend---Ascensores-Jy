import { useEffect, useMemo, useRef, useState } from 'react';
import { serviciosService, archivosService, assetUrl } from '../../services';
import { useToast } from '../common/Toast.jsx';
import { coordsDe, linkGoogleMaps, formatCoords } from '../../utils/mapa.js';
import { formatFecha, toYMDLima, hoyISO } from '../../utils/formatters.js';

/**
 * Panel del checklist de finalización PROGRESIVO. Se muestra mientras el
 * servicio está "En curso": el técnico responsable marca cada ítem (Sí/No/N/A
 * + nota) y, cuando marca "Sí", adjunta al menos una foto. En móvil el botón
 * abre la cámara y se capturan coordenadas GPS (best-effort) para verificar la
 * ubicación. El estado de completitud se reporta al padre vía `onResumen` para
 * habilitar/deshabilitar el botón Finalizar.
 */
export default function ChecklistFinalizacionPanel({ idServicio, dias = [], esMultidia = false, onResumen }) {
  const toast = useToast();
  const [data, setData] = useState(null);     // { categoria, plantilla, respuestas, puede_editar, plantilla_vacia }
  const [cargando, setCargando] = useState(true);
  const [diaActivo, setDiaActivo] = useState('');
  const [subiendo, setSubiendo] = useState(null); // id_item con subida en curso
  const guardandoNota = useRef({});

  const cargar = async () => {
    try {
      const d = await serviciosService.obtenerFinalizacion(idServicio);
      setData(d);
    } catch {
      setData(null);
    } finally {
      setCargando(false);
    }
  };
  useEffect(() => { cargar(); /* eslint-disable-next-line */ }, [idServicio]);

  // Día activo por defecto: el día cuya fecha es hoy; si no, el último.
  useEffect(() => {
    if (!esMultidia || dias.length === 0 || diaActivo) return;
    const hoy = hoyISO();
    const deHoy = dias.find(d => toYMDLima(d.fecha) === hoy);
    setDiaActivo(String((deHoy || dias[dias.length - 1]).id));
  }, [esMultidia, dias, diaActivo]);

  const items = data?.plantilla?.items || [];
  const respuestas = data?.respuestas || {};
  const puedeEditar = !!data?.puede_editar;

  // Completitud: todos respondidos + cada "Sí" con ≥1 foto.
  const resumen = useMemo(() => {
    const total = items.length;
    let respondidos = 0;
    let faltanFotos = 0;
    for (const it of items) {
      const r = respuestas[it.id];
      if (r && r.respuesta) respondidos++;
      if (r && r.respuesta === 'si' && (!r.fotos || r.fotos.length === 0)) faltanFotos++;
    }
    const completo = total > 0 && respondidos === total && faltanFotos === 0;
    return { total, respondidos, faltanFotos, completo };
  }, [items, respuestas]);

  useEffect(() => {
    if (data) onResumen?.({ ...resumen, plantillaVacia: !!data.plantilla_vacia });
  }, [resumen, data]); // eslint-disable-line

  const setRespuestaLocal = (idItem, parcial) => {
    setData(prev => ({
      ...prev,
      respuestas: { ...prev.respuestas, [idItem]: { ...(prev.respuestas[idItem] || { fotos: [] }), ...parcial } }
    }));
  };

  const elegirRespuesta = async (it, valor) => {
    const actual = respuestas[it.id] || {};
    if (actual.respuesta === valor) return;
    setRespuestaLocal(it.id, { respuesta: valor });
    try {
      const r = await serviciosService.guardarRespuestaChecklist(idServicio, it.id, { respuesta: valor, nota: actual.nota || null });
      setRespuestaLocal(it.id, { id: r.id, respuesta: r.respuesta, nota: r.nota || '', fotos: (r.fotos || []).map(mapFoto) });
    } catch (err) {
      toast.error(err.response?.data?.error || 'No se pudo guardar la respuesta');
      cargar();
    }
  };

  const guardarNota = async (it, nota) => {
    const actual = respuestas[it.id];
    if (!actual?.respuesta) return; // sin respuesta no hay nada que persistir aún
    if (guardandoNota.current[it.id]) return;
    guardandoNota.current[it.id] = true;
    try {
      await serviciosService.guardarRespuestaChecklist(idServicio, it.id, { respuesta: actual.respuesta, nota: nota || null });
    } catch (err) {
      toast.error(err.response?.data?.error || 'No se pudo guardar la nota');
    } finally {
      guardandoNota.current[it.id] = false;
    }
  };

  const capturarUbicacion = () => new Promise(resolve => {
    if (!navigator.geolocation) return resolve(null);
    navigator.geolocation.getCurrentPosition(
      pos => resolve({ latitud: pos.coords.latitude, longitud: pos.coords.longitude }),
      () => resolve(null),
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 0 }
    );
  });

  const agregarFoto = async (it, e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setSubiendo(it.id);
    try {
      const coords = await capturarUbicacion();
      const fd = new FormData(); fd.append('archivo', file);
      const arch = await archivosService.upload(fd, 'evidencias');
      const payload = { id_archivo: arch.id };
      if (esMultidia && diaActivo) payload.id_dia = Number(diaActivo);
      if (coords) { payload.latitud = coords.latitud; payload.longitud = coords.longitud; }
      const foto = await serviciosService.agregarFotoChecklist(idServicio, it.id, payload);
      setData(prev => {
        const r = prev.respuestas[it.id] || { fotos: [] };
        return { ...prev, respuestas: { ...prev.respuestas, [it.id]: { ...r, fotos: [...(r.fotos || []), mapFoto(foto)] } } };
      });
      toast.success(coords ? 'Foto agregada' : 'Foto agregada — sin ubicación GPS');
    } catch (err) {
      toast.error(err.response?.data?.error || 'No se pudo agregar la foto');
    } finally {
      setSubiendo(null);
    }
  };

  const quitarFoto = async (it, idFoto) => {
    try {
      await serviciosService.eliminarFotoChecklist(idServicio, idFoto);
      setData(prev => {
        const r = prev.respuestas[it.id];
        if (!r) return prev;
        return { ...prev, respuestas: { ...prev.respuestas, [it.id]: { ...r, fotos: (r.fotos || []).filter(f => f.id !== idFoto) } } };
      });
    } catch (err) {
      toast.error(err.response?.data?.error || 'No se pudo quitar la foto');
    }
  };

  if (cargando) return null;
  if (!data || data.plantilla_vacia) {
    return (
      <div className="card lg:col-span-3">
        <div className="card-header"><h3 className="card-title">Checklist de finalización</h3></div>
        <div className="card-body text-sm text-slate-600 bg-slate-50/60">
          Esta categoría no tiene una plantilla de checklist configurada. El checklist de finalización es
          <strong> opcional</strong>: puedes finalizar el servicio sin él. Si deseas usarlo, un administrador
          puede configurarlo en <strong>Configuración → Checklist de finalización</strong>.
        </div>
      </div>
    );
  }

  // Agrupar por "grupo" preservando el orden.
  const grupos = [];
  let gActual = null;
  for (const it of items) {
    const clave = it.grupo || '__sin_grupo__';
    if (grupos.length === 0 || grupos[grupos.length - 1].titulo !== clave) {
      grupos.push({ titulo: clave, items: [it] });
    } else {
      grupos[grupos.length - 1].items.push(it);
    }
    gActual = clave;
  }

  return (
    <div className="card lg:col-span-3">
      <div className="card-header flex-wrap gap-2">
        <h3 className="card-title">
          Checklist de finalización
          <span className="ml-2 text-xs font-normal text-slate-500">
            {resumen.respondidos}/{resumen.total} respondidos
            {resumen.faltanFotos > 0 && <span className="text-rose-600"> · faltan fotos en {resumen.faltanFotos}</span>}
            {resumen.completo && <span className="text-emerald-600"> · completo ✓</span>}
          </span>
        </h3>
        {esMultidia && puedeEditar && dias.length > 0 && (
          <label className="text-xs text-slate-600 flex items-center gap-2 w-full sm:w-auto">
            <span className="shrink-0">Día de la foto:</span>
            <select className="input-compacto !w-auto flex-1 sm:flex-none" value={diaActivo} onChange={e => setDiaActivo(e.target.value)}>
              {dias.map(d => <option key={d.id} value={d.id}>Día {d.orden} · {formatFecha(d.fecha)}</option>)}
            </select>
          </label>
        )}
      </div>
      <div className="card-body space-y-4">
        {!puedeEditar && (
          <p className="text-xs text-slate-500">Vista de solo lectura. Solo el técnico responsable de documentación puede completar este checklist.</p>
        )}
        {grupos.map((g, gi) => (
          <div key={gi} className="space-y-2">
            {g.titulo !== '__sin_grupo__' && (
              <div className="text-xs uppercase tracking-wider text-slate-500 font-semibold pt-1">{g.titulo}</div>
            )}
            {g.items.map(it => {
              const r = respuestas[it.id] || { respuesta: '', nota: '', fotos: [] };
              const esSi = r.respuesta === 'si';
              const faltaFoto = esSi && (!r.fotos || r.fotos.length === 0);
              return (
                <div key={it.id} className={`rounded-lg ring-1 p-3 bg-white ${faltaFoto ? 'ring-rose-200' : 'ring-slate-200'}`}>
                  {/* En móvil la pregunta ocupa el ancho y las respuestas van
                      debajo como tres botones grandes; los radios de 13px eran
                      imposibles de acertar con el dedo (y con guantes, peor).
                      A partir de `sm` vuelve el layout de una sola línea. */}
                  <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2 sm:gap-3 mb-2">
                    <p className="text-sm text-slate-800 flex-1">{it.texto}</p>
                    <div className="flex items-stretch gap-2 sm:shrink-0 sm:w-auto">
                      {[['si', 'Sí'], ['no', 'No'], ['na', 'N/A']].map(([val, lbl]) => {
                        const activo = r.respuesta === val;
                        const tono = activo
                          ? (val === 'si' ? 'segmento-si' : val === 'no' ? 'segmento-no' : 'segmento-na')
                          : '';
                        return (
                          <label key={val}
                            className={`segmento sm:flex-none sm:min-w-[54px] ${tono} ${puedeEditar ? '' : 'opacity-60 pointer-events-none'}`}>
                            <input type="radio" name={`r-${it.id}`} value={val} disabled={!puedeEditar}
                              className="sr-only"
                              checked={activo}
                              onChange={() => elegirRespuesta(it, val)} />
                            {lbl}
                          </label>
                        );
                      })}
                    </div>
                  </div>

                  <input className="input-compacto" placeholder="Nota (opcional)"
                    defaultValue={r.nota}
                    disabled={!puedeEditar || !r.respuesta}
                    onBlur={e => guardarNota(it, e.target.value)} />

                  {esSi && (
                    <div className="mt-2">
                      <div className="flex items-center gap-2 flex-wrap">
                        {puedeEditar && (
                          <label className={`btn-secondary cursor-pointer text-xs w-full sm:w-auto ${subiendo === it.id ? 'opacity-50 pointer-events-none' : ''}`}>
                            📷 Agregar foto
                            <input type="file" className="hidden" accept="image/*" capture="environment"
                              onChange={e => agregarFoto(it, e)} />
                          </label>
                        )}
                        {subiendo === it.id && <span className="text-xs text-slate-500">Subiendo…</span>}
                        {faltaFoto && subiendo !== it.id && (
                          <span className="text-xs text-rose-600">Requiere al menos una foto</span>
                        )}
                      </div>
                      {(r.fotos || []).length > 0 && (
                        <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-2 mt-2">
                          {r.fotos.map(f => {
                            const coords = coordsDe(f);
                            return (
                              <div key={f.id} className="relative group rounded-md overflow-hidden ring-1 ring-slate-200 bg-slate-50">
                                <div className="aspect-square">
                                  {f.archivo?.ruta_almacenamiento
                                    ? <img src={assetUrl(f.archivo.ruta_almacenamiento)} alt="Evidencia del ítem" className="w-full h-full object-cover" />
                                    : <div className="w-full h-full grid place-items-center text-[10px] text-slate-400">Sin archivo</div>}
                                </div>
                                <div className="px-1 py-0.5 text-[10px] leading-tight">
                                  {coords
                                    ? <a href={linkGoogleMaps(coords)} target="_blank" rel="noreferrer" className="text-brand-700 hover:underline">📍 {formatCoords(coords)}</a>
                                    : <span className="text-slate-400">Sin ubicación</span>}
                                </div>
                                {/* Visible siempre en táctil: no hay `hover` en un
                                    teléfono, así que con `opacity-0 group-hover`
                                    la papelera nunca aparecía y no se podía
                                    borrar una foto mal tomada desde la obra. */}
                                {puedeEditar && (
                                  <button type="button" onClick={() => quitarFoto(it, f.id)}
                                    aria-label="Quitar foto"
                                    className="absolute top-1 right-1 h-7 w-7 rounded-full bg-rose-600/90 text-white text-xs grid place-items-center shadow
                                               opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition active:scale-90">
                                    ✕
                                  </button>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

function mapFoto(f) {
  return { id: f.id, id_archivo: f.id_archivo, archivo: f.archivo, latitud: f.latitud, longitud: f.longitud, id_dia: f.id_dia };
}
