import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { calendarioService, clientesService, tecnicosService, mantenimientosService } from '../services';
import PageHeader from '../components/common/PageHeader.jsx';
import Loader from '../components/common/Loader.jsx';
import EmptyState from '../components/common/EmptyState.jsx';
import Modal from '../components/common/Modal.jsx';
import ProgramacionDias from '../components/common/ProgramacionDias.jsx';
import { tramoDeUnDia, fechasDesdeTramos, payloadDias, errorDeTramos } from '../utils/programacion.js';
import { useToast } from '../components/common/Toast.jsx';
import { useAuth } from '../features/auth/AuthContext.jsx';
import { formatFecha, formatFechaHora, formatHora, badgeEstado, codigosAscensores } from '../utils/formatters.js';
import {
  tiposEventoVisibles,
  leyendaVisible,
  muestraFiltroTipo,
  muestraFiltroTecnico,
  muestraFiltroCliente,
  colorPorTipo,
  subtituloCalendario
} from '../utils/visibilidadCalendario.js';
import { TZ, fmtDiaLargo, ymdLima, fechaLima, rangoMes, mesLabelLima } from '../utils/calendarioFechas.js';
import { usePersistentState } from '../utils/usePersistentState.js';
import CalendarioControles from '../components/common/CalendarioControles.jsx';
import CalendarioMes from '../components/common/CalendarioMes.jsx';

const ESTADOS_EVENTO = [
  { value: '', label: 'Todos' },
  { value: 'programado', label: 'Programado' },
  { value: 'finalizado', label: 'Finalizado' },
  { value: 'cancelado', label: 'Cancelado' }
];

const filtrosIniciales = { q: '', tipo_evento: '', estado_evento: '', id_cliente: '', id_tecnico: '' };

// Coincide con códigos correlativos tipo "SRV-2026-000035", "COT-2026-000004", etc.
// Quita el código y los separadores que lo acompañan (–, -, espacios).
const RE_CODIGO_CORRELATIVO = /\b[A-Z]{2,6}-\d{4}-\d{2,8}\b\s*[–-]?\s*/g;
function tituloSinCorrelativo(e) {
  const base = e.servicio?.titulo || e.titulo || '';
  const limpio = base.replace(RE_CODIGO_CORRELATIVO, '').trim();
  return limpio || base.trim() || '—';
}

/**
 * Ubicación del evento para mostrar en el calendario: nombre del edificio y
 * código(s) del/los ascensor(es), tomados del servicio, del plan de mantenimiento
 * o de la emergencia vinculada. Devuelve `null` si no hay ascensor asociado.
 */
function ubicacionEvento(e) {
  let ascs = [];
  if (e.servicio?.ascensores?.length) ascs = e.servicio.ascensores.map(a => a.ascensor).filter(Boolean);
  else if (e.mantenimiento_plan?.ascensores?.length) ascs = e.mantenimiento_plan.ascensores.map(a => a.ascensor).filter(Boolean);
  else if (e.emergencia?.ascensor) ascs = [e.emergencia.ascensor];
  if (!ascs.length) return null;
  const edificio = ascs.map(a => a.edificio?.nombre).find(Boolean) || null;
  const codigos = ascs.map(a => a.codigo).filter(Boolean).join(', ');
  return [edificio, codigos].filter(Boolean).join(' · ') || null;
}

export default function Calendario() {
  const [cursor, setCursor] = useState(new Date());
  const [eventos, setEventos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modoLista, setModoLista] = useState(false);
  const [diaSeleccionado, setDiaSeleccionado] = useState(null);
  // Filtros persistidos: siguen activos al abrir un servicio/proyecto y volver.
  const [filtros, setFiltros] = usePersistentState('calendario:filtros', filtrosIniciales);
  const [clientes, setClientes] = useState([]);
  const [tecnicos, setTecnicos] = useState([]);
  const [materializandoId, setMaterializandoId] = useState(null);
  const [materializarEv, setMaterializarEv] = useState(null); // evento a materializar
  const [materializarForm, setMaterializarForm] = useState({ fecha: '', hora: '', precio: '', moneda: 'PEN' });
  const toast = useToast();
  const { esSuperAdmin, esAdmin, esCoordinador, esVendedora, puedeVerPrecio, rol } = useAuth();
  const puedeMaterializar = esSuperAdmin || esAdmin || esCoordinador;
  // La Vendedora consulta la agenda en modo lectura: NO navega al detalle del
  // servicio/proyecto (solo valida disponibilidad de técnicos).
  const puedeAbrirServicio = !esVendedora;

  const tiposOpciones = useMemo(
    () => [{ value: '', label: 'Todos' }, ...tiposEventoVisibles(rol).map(t => ({ value: t.value, label: t.label }))],
    [rol]
  );
  const leyendaColores = useMemo(() => leyendaVisible(rol), [rol]);
  const verFiltroTipo = useMemo(() => muestraFiltroTipo(rol), [rol]);
  const verFiltroTecnico = useMemo(() => muestraFiltroTecnico(rol), [rol]);
  const verFiltroCliente = useMemo(() => muestraFiltroCliente(rol), [rol]);
  const subtituloHeader = useMemo(() => subtituloCalendario(rol), [rol]);

  const recargarEventos = () => {
    setLoading(true);
    const { desde, hasta } = rangoMes(cursor);
    return calendarioService.list({ desde, hasta }).then(setEventos).finally(() => setLoading(false));
  };

  useEffect(() => { recargarEventos(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [cursor]);

  /**
   * Abre el modal de "Crear servicio desde evento" con la info del plan
   * precargada y el precio default = suma de los montos por ascensor del plan
   * (cada monto es el precio configurado del ascensor para el subtipo).
   */
  const abrirMaterializar = (e) => {
    const plan = e?.mantenimiento_plan;
    const ascs = (plan?.ascensores || []).filter(a => a.estado !== 0);
    const total = ascs.reduce((acc, a) => acc + Number(a.monto || 0), 0);
    setMaterializarEv(e);
    setMaterializarForm({
      // Días de trabajo de ESTA ocurrencia: arranca en el día del evento y admite
      // rangos y/o fechas sueltas si el mantenimiento ocupará más de un día.
      tramos: [tramoDeUnDia(ymdLima(new Date(e.fecha_inicio)))],
      hora: plan?.hora_programada || new Intl.DateTimeFormat('en-GB', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(e.fecha_inicio)),
      precio: ascs.length ? total.toFixed(2) : '',
      moneda: ascs[0]?.moneda || 'PEN'
    });
  };
  const cerrarMaterializar = () => setMaterializarEv(null);

  const confirmarMaterializar = async (e) => {
    e.preventDefault();
    if (materializandoId || !materializarEv) return;
    const errorProgramacion = errorDeTramos(materializarForm.tramos);
    if (errorProgramacion) return toast.error(errorProgramacion);
    setMaterializandoId(materializarEv.id);
    try {
      await mantenimientosService.materializarEvento(materializarEv.id, {
        // Sin visibilidad de precios no se manda importe: el backend conserva el
        // monto pactado del plan (mandar 0 lo pisaría).
        ...(puedeVerPrecio ? { precio: Number(materializarForm.precio), moneda: materializarForm.moneda } : {}),
        dias: payloadDias(materializarForm.tramos),
        fecha_programada: fechasDesdeTramos(materializarForm.tramos)[0],
        hora_programada: materializarForm.hora
      });
      toast.success('Servicio creado');
      cerrarMaterializar();
      setDiaSeleccionado(null);
      await recargarEventos();
    } catch (err) {
      toast.error(err.response?.data?.error || 'No se pudo crear el servicio');
    } finally {
      setMaterializandoId(null);
    }
  };

  useEffect(() => {
    Promise.all([
      clientesService.list().catch(() => []),
      tecnicosService.list().catch(() => [])
    ]).then(([c, t]) => { setClientes(c); setTecnicos(t); });
  }, []);

  const setF = (k, v) => setFiltros(p => ({ ...p, [k]: v }));
  const limpiarFiltros = () => setFiltros(filtrosIniciales);
  const hayFiltros = Object.values(filtros).some(v => v !== '');

  const eventosFiltrados = useMemo(() => {
    return eventos.filter(e => {
      if (filtros.tipo_evento && e.tipo_evento !== filtros.tipo_evento) return false;
      if (filtros.estado_evento && e.estado_evento !== filtros.estado_evento) return false;
      if (filtros.id_cliente && String(e.servicio?.id_cliente) !== String(filtros.id_cliente)) return false;
      if (filtros.id_tecnico) {
        const tecs = e.servicio?.asignaciones || [];
        if (!tecs.some(a => String(a.id_tecnico) === String(filtros.id_tecnico) && a.estado === 1)) return false;
      }
      if (filtros.q) {
        const q = filtros.q.toLowerCase();
        const hay = [
          e.titulo,
          e.servicio?.codigo,
          e.servicio?.cliente?.nombre,
          ...codigosAscensores(e.servicio),
          e.servicio?.tipo_servicio?.nombre
        ].some(s => (s || '').toString().toLowerCase().includes(q));
        if (!hay) return false;
      }
      return true;
    });
  }, [eventos, filtros]);

  const eventosPorDia = useMemo(() => {
    const m = {};
    const empujar = (key, e) => { (m[key] ||= []).push(e); };
    eventosFiltrados.forEach(e => {
      const inicioKey = new Date(e.fecha_inicio).toLocaleDateString('en-CA', { timeZone: TZ });
      // Un evento con fecha_fin posterior (p. ej. correctivo/emergencia con fecha
      // estimada de término) ocupa TODOS los días del rango [inicio, fin], no solo
      // el de inicio, para reflejar su duración en el calendario.
      let finKey = inicioKey;
      if (e.fecha_fin) {
        const k = new Date(e.fecha_fin).toLocaleDateString('en-CA', { timeZone: TZ });
        if (k > inicioKey) finKey = k;
      }
      if (finKey === inicioKey) { empujar(inicioKey, e); return; }
      // Recorrer día a día anclado a UTC (días de calendario puros, sin desfase TZ).
      let cur = new Date(`${inicioKey}T00:00:00Z`);
      const fin = new Date(`${finKey}T00:00:00Z`);
      let guarda = 0;
      while (cur <= fin && guarda < 366) {
        empujar(cur.toISOString().slice(0, 10), e);
        cur = new Date(cur.getTime() + 86400000);
        guarda++;
      }
    });
    return m;
  }, [eventosFiltrados]);

  // Chips para el grid de mes (componente CalendarioMes): un evento → { color, título, ubicación }.
  const itemsPorDia = useMemo(() => {
    const m = {};
    for (const [ymd, evs] of Object.entries(eventosPorDia)) {
      m[ymd] = evs.map(e => {
        const titulo = tituloSinCorrelativo(e);
        const ubic = ubicacionEvento(e);
        // Rango del evento (para eventos multi-día con fecha estimada de término):
        // marca si viene de días anteriores o continúa en días posteriores para
        // dibujar el chip como un tramo continuo.
        const inicioKey = new Date(e.fecha_inicio).toLocaleDateString('en-CA', { timeZone: TZ });
        let finKey = inicioKey;
        if (e.fecha_fin) {
          const k = new Date(e.fecha_fin).toLocaleDateString('en-CA', { timeZone: TZ });
          if (k > inicioKey) finKey = k;
        }
        const multiDia = finKey > inicioKey;
        const rangoTxt = multiDia
          ? ` (${formatFecha(e.fecha_inicio)} → ${formatFecha(e.fecha_fin)})`
          : '';
        return {
          id: e.id,
          color: colorPorTipo(e.tipo_evento),
          titulo,
          subtitulo: ubic || undefined,
          title: [titulo, ubic].filter(Boolean).join(' — ') + rangoTxt,
          continuaAntes: multiDia && ymd > inicioKey,
          continuaDespues: multiDia && ymd < finKey
        };
      });
    }
    return m;
  }, [eventosPorDia]);

  const mesLabel = mesLabelLima(cursor);

  const diaSelKey = diaSeleccionado?.ymd || null;
  const eventosDelDia = useMemo(() => {
    if (!diaSelKey) return [];
    return (eventosPorDia[diaSelKey] || [])
      .slice()
      .sort((a, b) => new Date(a.fecha_inicio) - new Date(b.fecha_inicio));
  }, [diaSelKey, eventosPorDia]);
  const cerrarModal = () => setDiaSeleccionado(null);

  return (
    <>
      <PageHeader title="Calendario" subtitle={subtituloHeader}
        actions={
          <CalendarioControles
            modoLista={modoLista}
            onToggleModo={() => setModoLista(v => !v)}
            onHoy={() => setCursor(new Date())}
            onPrev={() => setCursor(c => { const d = new Date(c); d.setMonth(d.getMonth() - 1); return d; })}
            onNext={() => setCursor(c => { const d = new Date(c); d.setMonth(d.getMonth() + 1); return d; })}
            mesLabel={mesLabel}
          />
        } />

      <div className="card mb-4">
        <div className="p-3 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
          <div>
            <label className="label">Buscar</label>
            <input className="input" placeholder="Título, código, cliente…" value={filtros.q} onChange={e => setF('q', e.target.value)} />
          </div>
          {verFiltroTipo && (
            <div>
              <label className="label">Tipo</label>
              <select className="select" value={filtros.tipo_evento} onChange={e => setF('tipo_evento', e.target.value)}>
                {tiposOpciones.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
          )}
          <div>
            <label className="label">Estado</label>
            <select className="select" value={filtros.estado_evento} onChange={e => setF('estado_evento', e.target.value)}>
              {ESTADOS_EVENTO.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
          {verFiltroCliente && (
            <div>
              <label className="label">Cliente</label>
              <select className="select" value={filtros.id_cliente} onChange={e => setF('id_cliente', e.target.value)}>
                <option value="">Todos</option>
                {clientes.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
              </select>
            </div>
          )}
          {verFiltroTecnico && (
            <div>
              <label className="label">Técnico</label>
              <select className="select" value={filtros.id_tecnico} onChange={e => setF('id_tecnico', e.target.value)}>
                <option value="">Todos</option>
                {tecnicos.map(t => <option key={t.id} value={t.id}>{t.nombre}</option>)}
              </select>
            </div>
          )}
        </div>
        {hayFiltros && (
          <div className="px-3 pb-3 flex items-center justify-between text-xs text-slate-500">
            <span>{eventosFiltrados.length} de {eventos.length} eventos</span>
            <button onClick={limpiarFiltros} className="text-brand-700 hover:underline">Limpiar filtros</button>
          </div>
        )}
      </div>

      {leyendaColores.length > 0 && (
        <div className="card mb-3 p-3 flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-slate-600">
          {leyendaColores.map(l => (
            <span key={l.label} className="inline-flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: l.color }} />
              {l.label}
            </span>
          ))}
        </div>
      )}

      {loading ? <Loader /> : eventosFiltrados.length === 0 ? (
        <div className="card"><EmptyState title={hayFiltros ? 'Sin eventos con esos filtros' : 'Sin eventos este mes'} /></div>
      ) : modoLista || window.innerWidth < 768 ? (
        <div className="card">
          <ul className="divide-y divide-slate-100">
            {eventosFiltrados.map(e => {
              const titulo = tituloSinCorrelativo(e);
              const contenido = (
                <>
                  <div className="font-medium text-slate-800 text-sm truncate">{titulo}</div>
                  <div className="text-xs text-slate-500">{formatFechaHora(e.fecha_inicio)} · {e.tipo_evento}</div>
                  {ubicacionEvento(e) && <div className="text-xs text-slate-500 truncate">📍 {ubicacionEvento(e)}</div>}
                </>
              );
              return (
                <li key={e.id} className="p-3 sm:p-4 flex items-start gap-3">
                  <div className="h-2 w-2 mt-2 rounded-full" style={{ backgroundColor: colorPorTipo(e.tipo_evento) }} />
                  <div className="flex-1 min-w-0">
                    {e.servicio && puedeAbrirServicio
                      ? <Link to={`/servicios/${e.servicio.id}`} className="block hover:bg-slate-50/60 rounded">{contenido}</Link>
                      : contenido}
                  </div>
                  <span className={badgeEstado(e.estado_evento)}>{e.estado_evento}</span>
                </li>
              );
            })}
          </ul>
        </div>
      ) : (
        <CalendarioMes cursor={cursor} itemsPorDia={itemsPorDia} onSelectDay={setDiaSeleccionado} />
      )}

      <Modal
        open={diaSeleccionado !== null}
        onClose={cerrarModal}
        title={diaSeleccionado ? fmtDiaLargo.format(fechaLima(diaSeleccionado.ymd)) : ''}
        size="md"
        footer={<button type="button" onClick={cerrarModal} className="btn-secondary">Cerrar</button>}
      >
        {eventosDelDia.length === 0 ? (
          <EmptyState title="Sin eventos este día" subtitle={`No hay ${subtituloHeader.toLowerCase()} programados.`} />
        ) : (
          <ul className="divide-y divide-slate-100">
            {eventosDelDia.map(e => {
              const esProgramacionMantenimientoSinServicio =
                !e.es_recordatorio
                && e.tipo_evento === 'mantenimiento'
                && !e.servicio
                && Boolean(e.id_mantenimiento_plan);
              const titulo = tituloSinCorrelativo(e);
              return (
                <li key={e.id} className="py-3 flex items-start gap-3">
                  <div className="h-2 w-2 mt-2 rounded-full shrink-0" style={{ backgroundColor: colorPorTipo(e.tipo_evento) }} />
                  <div className="flex-1 min-w-0">
                    {e.servicio && puedeAbrirServicio ? (
                      <Link
                        to={`/servicios/${e.servicio.id}`}
                        onClick={cerrarModal}
                        className="font-medium text-slate-800 text-sm hover:text-brand-700 hover:underline"
                      >
                        {titulo}
                      </Link>
                    ) : (
                      <div className="font-medium text-slate-800 text-sm">{titulo}</div>
                    )}
                    <div className="text-xs text-slate-500">{formatHora(e.fecha_inicio)} · {e.tipo_evento}</div>
                    {ubicacionEvento(e) && <div className="text-xs text-slate-500">📍 {ubicacionEvento(e)}</div>}
                    {esProgramacionMantenimientoSinServicio && puedeMaterializar && (
                      <button
                        type="button"
                        onClick={() => abrirMaterializar(e)}
                        disabled={materializandoId === e.id}
                        className="mt-1 text-xs text-brand-700 hover:underline disabled:opacity-60"
                      >
                        {materializandoId === e.id ? 'Creando servicio…' : '+ Crear servicio'}
                      </button>
                    )}
                  </div>
                  <span className={badgeEstado(e.estado_evento)}>{e.estado_evento}</span>
                </li>
              );
            })}
          </ul>
        )}
      </Modal>

      <Modal
        open={!!materializarEv}
        onClose={cerrarMaterializar}
        title="Crear servicio de mantenimiento"
        size="md"
        footer={<>
          <button type="button" onClick={cerrarMaterializar} className="btn-secondary" disabled={!!materializandoId}>Cancelar</button>
          <button type="submit" form="form-materializar" className="btn-primary" disabled={!!materializandoId}>
            {materializandoId ? 'Creando…' : 'Crear servicio'}
          </button>
        </>}
      >
        {materializarEv && (() => {
          const plan = materializarEv.mantenimiento_plan;
          const filaActual = plan?.cliente?.precios?.find(p => p.id_tipo_servicio === plan?.id_tipo_servicio);
          return (
            <form id="form-materializar" onSubmit={confirmarMaterializar} className="space-y-4">
              <div className="grid grid-cols-2 gap-3 text-sm bg-slate-50 ring-1 ring-slate-100 rounded-lg p-3">
                <div>
                  <div className="text-[10px] uppercase tracking-wider text-slate-400">Cliente</div>
                  <div className="text-slate-800 font-medium">{plan?.cliente?.nombre || '—'}</div>
                </div>
                <div>
                  <div className="text-[10px] uppercase tracking-wider text-slate-400">Ascensores</div>
                  <div className="text-slate-800 font-mono">{(plan?.ascensores || []).map(a => a.ascensor?.codigo).filter(Boolean).join(', ') || '—'}</div>
                </div>
                <div className="col-span-2">
                  <div className="text-[10px] uppercase tracking-wider text-slate-400">Tipo de servicio</div>
                  <div className="text-slate-800">{plan?.tipo_servicio?.nombre || '—'}</div>
                </div>
              </div>
              <ProgramacionDias
                tramos={materializarForm.tramos}
                onChange={tramos => setMaterializarForm(f => ({ ...f, tramos }))}
                ayuda="Rango de fechas, días sueltos o ambos. Solo esos días entran en el calendario del técnico." />
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">Hora</label>
                  <input type="time" className="input"
                    value={materializarForm.hora}
                    onChange={e => setMaterializarForm(f => ({ ...f, hora: e.target.value }))} />
                </div>
                {puedeVerPrecio && (
                  <>
                    <div>
                      <label className="label">Precio *</label>
                      <input type="number" step="0.01" min="0" className="input font-mono" required
                        value={materializarForm.precio}
                        onChange={e => setMaterializarForm(f => ({ ...f, precio: e.target.value }))} />
                      {!filaActual && (
                        <p className="text-xs text-amber-700 mt-1">
                          El cliente no tiene precio configurado para este tipo de servicio. Ingréselo manualmente.
                        </p>
                      )}
                    </div>
                    <div>
                      <label className="label">Moneda</label>
                      <select className="select" value={materializarForm.moneda}
                        onChange={e => setMaterializarForm(f => ({ ...f, moneda: e.target.value }))}>
                        <option value="PEN">PEN (S/)</option>
                        <option value="USD">USD ($)</option>
                      </select>
                    </div>
                  </>
                )}
              </div>
              <p className="text-xs text-slate-500">
                Al confirmar se crea un servicio en estado "Pendiente" y se enlaza con este evento del calendario. Los días programados modifican solo esta instancia; los demás eventos del plan no se mueven.
              </p>
            </form>
          );
        })()}
      </Modal>
    </>
  );
}
