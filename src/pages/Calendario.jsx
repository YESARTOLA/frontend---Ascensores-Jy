import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { calendarioService, clientesService, tecnicosService, mantenimientosService } from '../services';
import PageHeader from '../components/common/PageHeader.jsx';
import Loader from '../components/common/Loader.jsx';
import EmptyState from '../components/common/EmptyState.jsx';
import Modal from '../components/common/Modal.jsx';
import { useToast } from '../components/common/Toast.jsx';
import { useAuth } from '../features/auth/AuthContext.jsx';
import { formatFechaHora, formatHora, badgeEstado, codigosAscensores } from '../utils/formatters.js';
import {
  tiposEventoVisibles,
  leyendaVisible,
  muestraFiltroTipo,
  muestraFiltroTecnico,
  muestraFiltroCliente,
  colorPorTipo,
  subtituloCalendario
} from '../utils/visibilidadCalendario.js';

const TZ = 'America/Lima';
const OFFSET_LIMA = '-05:00';
const fmtDiaLargo = new Intl.DateTimeFormat('es-PE', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: TZ });

/**
 * "YYYY-MM-DD" del cursor interpretado como día de Lima. cursor es un Date
 * (instante absoluto); lo formateamos en Lima para tener un YMD estable
 * independiente de la TZ del navegador.
 */
function ymdLima(d) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit'
  }).format(d);
}

/** Convierte "YYYY-MM-DD" + hora opcional a un instante anclado a Lima. */
function fechaLima(ymd, hm = '00:00:00.000') {
  return new Date(`${ymd}T${hm}${OFFSET_LIMA}`);
}

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
 * Rango "desde/hasta" del mes que contiene al cursor, expresado como instantes
 * anclados a Lima — independiente de la TZ del navegador.
 */
function rangoMes(cursor) {
  const [y, m] = ymdLima(cursor).split('-').map(Number);
  const inicio = fechaLima(`${y}-${String(m).padStart(2, '0')}-01`, '00:00:00.000');
  // último día del mes en Lima: usar Date.UTC para conocer el último día numérico,
  // luego anclar a Lima TZ con offset fijo (-05:00, sin DST).
  const ultimoDia = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const fin = fechaLima(`${y}-${String(m).padStart(2, '0')}-${String(ultimoDia).padStart(2, '0')}`, '23:59:59.999');
  return { desde: inicio.toISOString(), hasta: fin.toISOString() };
}

/**
 * Días del grid del calendario (lunes a domingo, 6 filas). Cada celda es un
 * objeto { ymd: "YYYY-MM-DD", dia: 1..31, mes: 1..12, anio } con el día Lima.
 * No depende de la TZ del navegador.
 */
function diasDelCalendario(cursor) {
  const [yC, mC] = ymdLima(cursor).split('-').map(Number);
  // Trabajamos sobre Date.UTC con día puro: cualquier cálculo de días aquí
  // es seguro porque las horas siempre quedan en 00:00 UTC.
  const inicioMes = new Date(Date.UTC(yC, mC - 1, 1));
  const finMes = new Date(Date.UTC(yC, mC, 0));
  // Lunes como primer día: ((getUTCDay() + 6) % 7) da 0..6 desde lunes.
  const offsetInicio = (inicioMes.getUTCDay() + 6) % 7;
  const inicioGrid = new Date(Date.UTC(yC, mC - 1, 1 - offsetInicio));
  const diaFinSemana = finMes.getUTCDay();
  const offsetFin = diaFinSemana === 0 ? 0 : 7 - diaFinSemana;
  const finGrid = new Date(Date.UTC(yC, mC, offsetFin));
  const dias = [];
  for (let t = inicioGrid.getTime(); t <= finGrid.getTime(); t += 86400000) {
    const d = new Date(t);
    const y = d.getUTCFullYear();
    const m = d.getUTCMonth() + 1;
    const dia = d.getUTCDate();
    dias.push({
      ymd: `${y}-${String(m).padStart(2, '0')}-${String(dia).padStart(2, '0')}`,
      dia,
      mes: m,
      anio: y
    });
  }
  return dias;
}

export default function Calendario() {
  const [cursor, setCursor] = useState(new Date());
  const [eventos, setEventos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modoLista, setModoLista] = useState(false);
  const [diaSeleccionado, setDiaSeleccionado] = useState(null);
  const [filtros, setFiltros] = useState(filtrosIniciales);
  const [clientes, setClientes] = useState([]);
  const [tecnicos, setTecnicos] = useState([]);
  const [materializandoId, setMaterializandoId] = useState(null);
  const [materializarEv, setMaterializarEv] = useState(null); // evento a materializar
  const [materializarForm, setMaterializarForm] = useState({ fecha: '', hora: '', precio: '', moneda: 'PEN' });
  const toast = useToast();
  const { esSuperAdmin, esAdmin, esCoordinador, esVendedora, rol } = useAuth();
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
   * precargada y el precio default tomado de tbl_clientes_precios para el
   * tipo de servicio del plan.
   */
  const abrirMaterializar = (e) => {
    const plan = e?.mantenimiento_plan;
    const precios = plan?.cliente?.precios || [];
    const precioCfg = precios.find(p => p.id_tipo_servicio === plan?.id_tipo_servicio);
    setMaterializarEv(e);
    setMaterializarForm({
      fecha: ymdLima(new Date(e.fecha_inicio)),
      hora: plan?.hora_programada || new Intl.DateTimeFormat('en-GB', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(e.fecha_inicio)),
      precio: precioCfg ? String(precioCfg.precio) : '',
      moneda: precioCfg?.moneda || 'PEN'
    });
  };
  const cerrarMaterializar = () => setMaterializarEv(null);

  const confirmarMaterializar = async (e) => {
    e.preventDefault();
    if (materializandoId || !materializarEv) return;
    setMaterializandoId(materializarEv.id);
    try {
      await mantenimientosService.materializarEvento(materializarEv.id, {
        precio: Number(materializarForm.precio),
        moneda: materializarForm.moneda,
        fecha_programada: materializarForm.fecha,
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

  const dias = useMemo(() => diasDelCalendario(cursor), [cursor]);
  const eventosPorDia = useMemo(() => {
    const m = {};
    eventosFiltrados.forEach(e => {
      const key = new Date(e.fecha_inicio).toLocaleDateString('en-CA', { timeZone: TZ });
      m[key] ||= [];
      m[key].push(e);
    });
    return m;
  }, [eventosFiltrados]);

  const mesLabel = new Intl.DateTimeFormat('es-PE', { month: 'long', year: 'numeric', timeZone: TZ }).format(cursor);
  const hoyStr = ymdLima(new Date());
  const mesCursor = Number(ymdLima(cursor).split('-')[1]);

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
          <>
            <button onClick={() => setModoLista(v => !v)} className="btn-secondary">{modoLista ? 'Vista mes' : 'Vista lista'}</button>
            <button onClick={() => setCursor(new Date())} className="btn-secondary">Hoy</button>
            <button onClick={() => setCursor(c => { const d = new Date(c); d.setMonth(d.getMonth() - 1); return d; })} className="btn-secondary">←</button>
            <span className="px-3 text-sm font-medium capitalize w-40 text-center">{mesLabel}</span>
            <button onClick={() => setCursor(c => { const d = new Date(c); d.setMonth(d.getMonth() + 1); return d; })} className="btn-secondary">→</button>
          </>
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
        <div className="card overflow-hidden">
          <div className="grid grid-cols-7 bg-slate-50 text-[11px] uppercase font-semibold text-slate-500 border-b border-slate-200">
            {['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'].map(d => <div key={d} className="px-2 py-2 text-center">{d}</div>)}
          </div>
          <div className="grid grid-cols-7 grid-rows-6 min-h-[600px]">
            {dias.map((d, idx) => {
              const esHoy = d.ymd === hoyStr;
              const esOtroMes = d.mes !== mesCursor;
              const evs = eventosPorDia[d.ymd] || [];
              const diaLabel = fechaLima(d.ymd);
              return (
                <button
                  type="button"
                  key={idx}
                  onClick={() => setDiaSeleccionado(d)}
                  aria-label={`Ver eventos del ${fmtDiaLargo.format(diaLabel)}`}
                  className={`p-1.5 border-b border-r border-slate-100 text-xs text-left w-full cursor-pointer transition focus:outline-none focus:ring-2 focus:ring-inset focus:ring-brand-300 ${esOtroMes ? 'bg-slate-50/50 text-slate-400 hover:bg-slate-100/70' : 'bg-white hover:bg-slate-50'}`}
                >
                  <div className={`text-right ${esHoy ? 'inline-block bg-brand-600 text-white rounded-full h-6 w-6 leading-6 text-center font-semibold' : ''}`}>{d.dia}</div>
                  <div className="mt-1 space-y-0.5 max-h-24 overflow-hidden">
                    {evs.slice(0, 3).map(e => (
                      <div key={e.id} className="block truncate rounded px-1.5 py-0.5 text-white text-[10px]" style={{ backgroundColor: colorPorTipo(e.tipo_evento) }}>
                        {tituloSinCorrelativo(e)}
                      </div>
                    ))}
                    {evs.length > 3 && <div className="text-[10px] text-slate-500">+{evs.length - 3} más</div>}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
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
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">Fecha *</label>
                  <input type="date" className="input" required
                    value={materializarForm.fecha}
                    onChange={e => setMaterializarForm(f => ({ ...f, fecha: e.target.value }))} />
                </div>
                <div>
                  <label className="label">Hora</label>
                  <input type="time" className="input"
                    value={materializarForm.hora}
                    onChange={e => setMaterializarForm(f => ({ ...f, hora: e.target.value }))} />
                </div>
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
              </div>
              <p className="text-xs text-slate-500">
                Al confirmar se crea un servicio en estado "Pendiente" y se enlaza con este evento del calendario. La fecha modifica solo esta instancia; los demás eventos del plan no se mueven.
              </p>
            </form>
          );
        })()}
      </Modal>
    </>
  );
}
