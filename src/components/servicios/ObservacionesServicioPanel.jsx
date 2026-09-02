import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { serviciosService, archivosService } from '../../services';
import { useAuth } from '../../features/auth/AuthContext.jsx';
import { useToast } from '../common/Toast.jsx';
import { FileLink } from '../common/FilePreview.jsx';
import { formatFechaHora } from '../../utils/formatters.js';
import { esServicioPostRevision } from '../../utils/estadoServicio.js';
import { DESTINATARIOS_ALERTA, etiquetasDestinatarios } from '../../utils/destinatariosAlerta.js';

/**
 * Bloque embebible en la vista detalle de un servicio.
 *
 * - Lista las observaciones técnicas (más recientes primero).
 * - Si el usuario es un técnico asignado al servicio (o admin/super_admin),
 *   muestra el formulario para registrar una nueva (texto + foto opcional).
 * - Si el usuario es coordinador/admin/super_admin, ofrece "Marcar atendida".
 * - Si el usuario es admin/super_admin, permite seleccionar observaciones aún no
 *   cotizadas y jalarlas a una cotización nueva (cada una entra como un ítem con
 *   su foto). Las ya cotizadas muestran el código y no son seleccionables.
 *
 * Cualquier rol con acceso al detalle del servicio puede ver la lista.
 *
 * Props:
 *   idServicio          — id del servicio
 *   tecnicosAsignados   — array de asignaciones [{id_tecnico, estado}] del servicio
 *   estadoServicio      — estado_servicio actual; cierra el formulario cuando
 *                         entra en revisión administrativa o más allá
 */
export default function ObservacionesServicioPanel({ idServicio, tecnicosAsignados, estadoServicio }) {
  const { user, esSuperAdmin, esAdmin, esCoordinador, esTecnico } = useAuth();
  const toast = useToast();
  const [items, setItems] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [texto, setTexto] = useState('');
  const [archivo, setArchivo] = useState(null);
  // Destinatarios elegidos para la alerta. Vacío = no se alerta a nadie.
  const [destinatarios, setDestinatarios] = useState([]);
  const generaAlerta = destinatarios.length > 0;
  const [subiendo, setSubiendo] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const guardandoRef = useRef(false);
  const [atendiendoId, setAtendiendoId] = useState(null);
  // Edición en línea de una observación ya registrada.
  const [editandoId, setEditandoId] = useState(null);
  const [textoEdicion, setTextoEdicion] = useState('');
  const [guardandoEdicion, setGuardandoEdicion] = useState(false);
  const [eliminandoId, setEliminandoId] = useState(null);
  // Observaciones marcadas para jalar a una cotización nueva.
  const [seleccionadas, setSeleccionadas] = useState([]);
  const navigate = useNavigate();

  const esAdminUI = esSuperAdmin || esAdmin;
  // Coordinación revisa y corrige lo que el técnico dejó anotado, con el mismo
  // corte que el backend: hasta la revisión administrativa.
  const tecnicoAsignado = esTecnico && Array.isArray(tecnicosAsignados)
    && tecnicosAsignados.some(a => a.estado === 1 && a.id_tecnico === user?.id_tecnico);
  const bloqueadoPorEstado = esServicioPostRevision(estadoServicio);
  const gestionaRegistros = (esSuperAdmin || esAdmin || esCoordinador) && !bloqueadoPorEstado;
  const puedeRegistrar = ((esSuperAdmin || esAdmin || esCoordinador) || tecnicoAsignado) && !bloqueadoPorEstado;
  const puedeAtender = esSuperAdmin || esAdmin || esCoordinador;

  const cargar = () => {
    if (!idServicio) return;
    setCargando(true);
    serviciosService.observaciones(idServicio)
      .then(setItems)
      .catch(() => setItems([]))
      .finally(() => setCargando(false));
  };

  useEffect(cargar, [idServicio]);

  const subirArchivo = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setSubiendo(true);
    try {
      const fd = new FormData();
      fd.append('archivo', file);
      const arch = await archivosService.upload(fd, 'observaciones');
      setArchivo(arch);
      toast.success('Adjunto cargado');
    } catch {
      toast.error('Error al subir el adjunto');
    } finally {
      setSubiendo(false);
      e.target.value = '';
    }
  };

  const quitarArchivo = () => setArchivo(null);

  const guardar = async (e) => {
    e.preventDefault();
    if (guardandoRef.current) return;
    if (!texto.trim()) return toast.error('El texto es obligatorio');
    guardandoRef.current = true;
    setGuardando(true);
    try {
      await serviciosService.crearObservacion(idServicio, {
        texto: texto.trim(),
        id_archivo: archivo?.id || null,
        genera_alerta: generaAlerta,
        destinatarios_alerta: destinatarios
      });
      toast.success(generaAlerta
        ? `Observación registrada — alerta enviada a ${etiquetasDestinatarios(destinatarios).join(', ')}`
        : 'Observación registrada');
      setTexto('');
      setArchivo(null);
      setDestinatarios([]);
      cargar();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Error al registrar la observación');
    } finally {
      guardandoRef.current = false;
      setGuardando(false);
    }
  };

  const abrirEdicion = (obs) => { setEditandoId(obs.id); setTextoEdicion(obs.texto || ''); };
  const cerrarEdicion = () => { setEditandoId(null); setTextoEdicion(''); };

  const guardarEdicion = async (obs) => {
    const texto = textoEdicion.trim();
    if (!texto) return toast.error('El texto es obligatorio');
    setGuardandoEdicion(true);
    try {
      await serviciosService.actualizarObservacion(obs.id, { texto });
      toast.success('Observación actualizada');
      cerrarEdicion();
      cargar();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Error al actualizar la observación');
    } finally {
      setGuardandoEdicion(false);
    }
  };

  const eliminarObs = async (obs) => {
    if (!confirm('¿Eliminar esta observación técnica?')) return;
    setEliminandoId(obs.id);
    try {
      await serviciosService.eliminarObservacion(obs.id);
      toast.success('Observación eliminada');
      cargar();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Error al eliminar la observación');
    } finally {
      setEliminandoId(null);
    }
  };

  const atender = async (obs) => {
    if (atendiendoId) return;
    setAtendiendoId(obs.id);
    try {
      await serviciosService.atenderObservacion(obs.id);
      toast.success('Observación marcada como atendida');
      cargar();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Error al atender');
    } finally {
      setAtendiendoId(null);
    }
  };

  const alternarSeleccion = (id) =>
    setSeleccionadas(s => (s.includes(id) ? s.filter(x => x !== id) : [...s, id]));

  // Lleva las observaciones marcadas al formulario de cotización nueva, que las
  // resuelve contra el backend. El vínculo se graba recién al guardar allí.
  const cotizarSeleccionadas = () => {
    if (seleccionadas.length === 0) return;
    navigate(`/cotizaciones?nuevo=1&observaciones=${seleccionadas.join(',')}`);
  };

  const pendientes = items.filter(o => o.atendida === 0).length;
  // Solo se puede cotizar lo que aún no está vinculado a una cotización.
  const cotizables = items.filter(o => !o.id_cotizacion);
  const puedeCotizar = esAdminUI && cotizables.length > 0;
  const sinFotoSeleccionadas = items.filter(o => seleccionadas.includes(o.id) && !o.id_archivo).length;

  return (
    <div className="card">
      <div className="card-header flex items-center justify-between gap-2">
        <h3 className="card-title">
          Observaciones técnicas
          {items.length > 0 && (
            <span className="ml-2 inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-orange-100 text-orange-800 ring-1 ring-orange-200">
              {pendientes} pendiente{pendientes === 1 ? '' : 's'} · {items.length} total
            </span>
          )}
        </h3>
      </div>
      <div className="card-body space-y-4">
        {puedeRegistrar && (
          <form onSubmit={guardar} className="rounded-lg ring-1 ring-slate-200 bg-slate-50/40 p-3 space-y-2">
            <label className="label">Registrar observación detectada durante el mantenimiento</label>
            <textarea className="textarea" rows="3" maxLength={5000}
              placeholder="Describe lo encontrado (ej. cable suelto en cuarto de máquinas, ruido al freno…)"
              value={texto}
              onChange={e => setTexto(e.target.value)} />
            {/* En móvil los dos botones ocupan el ancho completo y se apilan: la
                observación se escribe en obra, con una sola mano. */}
            <div className="flex flex-col sm:flex-row sm:flex-wrap sm:items-center gap-2">
              <label className="btn-ghost !ring-1 !ring-carbon-200 text-xs !py-2 !px-3 cursor-pointer w-full sm:w-auto">
                {subiendo ? 'Subiendo…' : (archivo ? '📎 Reemplazar foto' : '📷 Adjuntar foto')}
                <input type="file" className="hidden" accept="image/*,application/pdf" capture="environment"
                  disabled={subiendo || guardando} onChange={subirArchivo} />
              </label>
              {archivo && (
                <div className="flex items-center gap-2 min-w-0 max-w-full">
                  <FileLink archivo={archivo} className="text-xs text-brand-700 hover:underline truncate min-w-0">
                    {archivo.nombre_original}
                  </FileLink>
                  <button type="button" onClick={quitarArchivo} className="text-xs text-red-600 hover:underline shrink-0 min-h-[36px]">Quitar</button>
                </div>
              )}
              <button type="submit" className="btn-primary sm:ml-auto text-xs !py-2 !px-3 w-full sm:w-auto" disabled={guardando || subiendo}>
                {guardando ? 'Guardando…' : 'Registrar observación'}
              </button>
            </div>
            {/* Destinatarios de la alerta: sin ninguno marcado, la observación
                queda registrada sin avisar a nadie. */}
            <div className={`rounded-md p-2.5 ring-1 transition ${generaAlerta ? 'bg-rose-50 ring-rose-300' : 'bg-white ring-slate-200'}`}>
              <div className={`text-xs font-medium ${generaAlerta ? 'text-rose-800' : 'text-slate-700'}`}>
                🔔 Enviar alerta a
              </div>
              <div className="text-[11px] text-slate-500 leading-snug mt-0.5">
                Marca a quién avisar si la observación requiere atención. Sin marcar nada, queda registrada sin alertar.
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 mt-2">
                {DESTINATARIOS_ALERTA.map(d => {
                  const marcado = destinatarios.includes(d.codigo);
                  return (
                    <label key={d.codigo}
                      className={`flex items-start gap-2 rounded-md px-2 py-1.5 ring-1 cursor-pointer transition text-xs ${marcado ? 'bg-white ring-rose-300' : 'bg-white/60 ring-slate-200 hover:ring-rose-200'}`}>
                      <input
                        type="checkbox"
                        className="mt-0.5"
                        checked={marcado}
                        onChange={e => setDestinatarios(prev => (
                          e.target.checked ? [...prev, d.codigo] : prev.filter(c => c !== d.codigo)
                        ))}
                      />
                      <span className="leading-snug">
                        <span className={`font-medium ${marcado ? 'text-rose-800' : 'text-slate-700'}`}>{d.etiqueta}</span>
                        <span className="block text-[10px] text-slate-500">{d.ayuda}</span>
                      </span>
                    </label>
                  );
                })}
              </div>
            </div>
          </form>
        )}

        {cargando ? (
          <p className="text-sm text-slate-500">Cargando observaciones…</p>
        ) : items.length === 0 ? (
          <p className="text-sm text-slate-500">
            {puedeRegistrar ? 'Aún no hay observaciones. Registra la primera con el formulario.' : 'Sin observaciones registradas.'}
          </p>
        ) : (
          <>
          {puedeCotizar && (
            <div className="flex flex-wrap items-center gap-2 rounded-lg ring-1 ring-brand-200 bg-brand-50/40 p-2.5">
              <span className="text-xs text-slate-600">
                {seleccionadas.length === 0
                  ? 'Marca observaciones para cotizarlas: cada una entra como un ítem con su foto.'
                  : `${seleccionadas.length} seleccionada${seleccionadas.length === 1 ? '' : 's'}`}
              </span>
              {sinFotoSeleccionadas > 0 && (
                <span className="text-[11px] text-amber-700">
                  · {sinFotoSeleccionadas} sin foto: en cotizaciones de correctivo la foto por ítem es obligatoria,
                  tendrás que subirla en el formulario.
                </span>
              )}
              <button type="button" onClick={cotizarSeleccionadas} disabled={seleccionadas.length === 0}
                className="btn-primary ml-auto text-xs !py-1.5 !px-3 disabled:opacity-40 disabled:cursor-not-allowed">
                Cotizar seleccionadas ({seleccionadas.length})
              </button>
            </div>
          )}
          <ul className="space-y-3">
            {items.map(o => (
              <li key={o.id} className={`rounded-lg ring-1 p-3 ${o.atendida ? 'bg-emerald-50/30 ring-emerald-200' : 'bg-orange-50/30 ring-orange-200'}`}>
                {/* En móvil las acciones bajan a su propia fila: junto a los
                    badges dejaban la columna de texto en unos pocos píxeles. */}
                <div className="flex flex-col sm:flex-row items-stretch sm:items-start justify-between gap-2 sm:gap-3 mb-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    {esAdminUI && !o.id_cotizacion && (
                      <input type="checkbox" checked={seleccionadas.includes(o.id)}
                        onChange={() => alternarSeleccion(o.id)}
                        aria-label={`Seleccionar observación ${o.id} para cotizar`} />
                    )}
                    {o.cotizacion && esTecnico && (
                      // El técnico no accede a la cotización: badge sin código ni enlace.
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold ring-1 bg-brand-100 text-brand-800 ring-brand-200"
                        title="Esta observación ya fue cotizada">
                        Cotizada
                      </span>
                    )}
                    {o.cotizacion && !esTecnico && (
                      <Link to={`/cotizaciones/${o.cotizacion.id}`}
                        className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold ring-1 bg-brand-100 text-brand-800 ring-brand-200 hover:underline"
                        title="Esta observación ya fue jalada a una cotización">
                        Cotizada · {o.cotizacion.codigo}
                      </Link>
                    )}
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold ring-1 ${o.atendida ? 'bg-emerald-100 text-emerald-800 ring-emerald-200' : 'bg-orange-100 text-orange-800 ring-orange-200'}`}>
                      {o.atendida ? 'Atendida' : 'Pendiente'}
                    </span>
                    {o.genera_alerta === 1 && (() => {
                      // Las observaciones anteriores a poder elegir no guardan
                      // destinatarios: entonces la alerta fue a todos.
                      const a = etiquetasDestinatarios(o.destinatarios_alerta);
                      const detalle = a.length ? `Alerta enviada a ${a.join(', ')}` : 'Se envió alerta a todas las áreas';
                      return (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold ring-1 bg-rose-100 text-rose-800 ring-rose-200" title={detalle}>
                          🔔 {a.length ? `Alerta · ${a.join(' · ')}` : 'Alerta enviada'}
                        </span>
                      );
                    })()}
                    <span className="text-xs text-slate-600">
                      {o.registrada_por_usuario?.nombres || 'Sin autor'}
                      {o.registrada_por_usuario?.rol?.nombre ? ` · ${o.registrada_por_usuario.rol.nombre}` : ''}
                    </span>
                    <span className="text-xs text-slate-400">{formatFechaHora(o.date_time_registration)}</span>
                  </div>
                  <div className="flex items-center gap-3 sm:gap-2 shrink-0 order-last sm:order-none">
                    {!o.atendida && puedeAtender && (
                      <button type="button" onClick={() => atender(o)} disabled={atendiendoId === o.id}
                        className="btn-secondary text-xs !py-1.5 !px-3 whitespace-nowrap">
                        {atendiendoId === o.id ? 'Atendiendo…' : 'Marcar atendida'}
                      </button>
                    )}
                    {gestionaRegistros && editandoId !== o.id && (
                      <>
                        <button type="button" onClick={() => abrirEdicion(o)}
                          className="text-xs font-semibold text-brand-700 hover:underline whitespace-nowrap min-h-[36px] sm:min-h-0">Editar</button>
                        <button type="button" onClick={() => eliminarObs(o)} disabled={eliminandoId === o.id}
                          className="text-xs font-semibold text-rose-700 hover:underline whitespace-nowrap min-h-[36px] sm:min-h-0">
                          {eliminandoId === o.id ? 'Eliminando…' : 'Eliminar'}
                        </button>
                      </>
                    )}
                  </div>
                </div>
                {editandoId === o.id ? (
                  <div className="space-y-2">
                    <textarea className="textarea w-full text-sm" rows="3" value={textoEdicion}
                      onChange={e => setTextoEdicion(e.target.value)} disabled={guardandoEdicion} />
                    <div className="flex gap-2">
                      <button type="button" onClick={() => guardarEdicion(o)} disabled={guardandoEdicion}
                        className="btn-primary text-xs !py-1 !px-3">
                        {guardandoEdicion ? 'Guardando…' : 'Guardar'}
                      </button>
                      <button type="button" onClick={cerrarEdicion} disabled={guardandoEdicion}
                        className="btn-secondary text-xs !py-1 !px-3">Cancelar</button>
                    </div>
                  </div>
                ) : (
                  <p className="text-sm text-slate-800 whitespace-pre-wrap break-words">{o.texto}</p>
                )}
                {o.archivo && (
                  <div className="mt-2 min-w-0">
                    <FileLink archivo={o.archivo} className="text-xs text-brand-700 hover:underline inline-flex items-center gap-1 max-w-full align-bottom">
                      <span className="shrink-0">📎</span>
                      <span className="truncate min-w-0">{o.archivo.nombre_original}</span>
                    </FileLink>
                  </div>
                )}
                {o.atendida === 1 && (
                  <div className="mt-2 text-xs text-emerald-700">
                    Atendida por <span className="font-medium">{o.atendida_por_usuario?.nombres || '—'}</span>
                    {o.fecha_atendida && <> · {formatFechaHora(o.fecha_atendida)}</>}
                  </div>
                )}
              </li>
            ))}
          </ul>
          </>
        )}
      </div>
    </div>
  );
}
