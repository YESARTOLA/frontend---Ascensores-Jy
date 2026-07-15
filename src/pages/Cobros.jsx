import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { cobrosService, clientesService, tecnicosService, tiposServicioService } from '../services';
import PageHeader from '../components/common/PageHeader.jsx';
import Loader from '../components/common/Loader.jsx';
import EmptyState from '../components/common/EmptyState.jsx';
import Modal from '../components/common/Modal.jsx';
import OtModal from '../components/common/OtModal.jsx';
import Combobox from '../components/common/Combobox.jsx';
import Pagination, { usePaginatedList } from '../components/common/Pagination.jsx';
import { useToast } from '../components/common/Toast.jsx';
import { badgeEstado, formatFecha, formatMonto, hoyISO } from '../utils/formatters.js';
import { exportarExcelTabla, exportarPDFTabla } from '../utils/exportTabla.js';
import { ESTADOS_COBRO } from '../utils/estadoCobro.js';

// Columnas del export (espejo de la tabla, sin OT, abonos-por-cuenta ni acciones).
const COLUMNAS_EXPORT = [
  { header: 'Cliente', get: c => c.cliente?.nombre },
  { header: 'Proyecto', get: c => c.servicio?.titulo },
  { header: 'Servicio', get: c => c.servicio?.codigo },
  { header: 'Precio total', align: 'right', get: c => formatMonto(c.monto_total, c.moneda) },
  { header: 'Abonos', align: 'right', get: c => formatMonto(c.total_abonado, c.moneda) },
  { header: 'Saldo', align: 'right', get: c => formatMonto(c.saldo_pendiente, c.moneda) },
  { header: 'Cuotas (P/T)', get: c => `${c.cuotas_pagadas}/${c.numero_cuotas}` },
  { header: 'Próximo abono', get: c => formatFecha(c.fecha_proximo_abono) },
  { header: 'Mora', align: 'right', get: c => (c.dias_mora > 0 ? c.dias_mora : '') },
  { header: 'Estado', badge: true, get: c => c.estado_cobro }
];

const TZ = 'America/Lima';
const fmtDiaLargo = new Intl.DateTimeFormat('es-PE', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: TZ });

function rangoMes(date) {
  const inicio = new Date(date.getFullYear(), date.getMonth(), 1);
  const fin = new Date(date.getFullYear(), date.getMonth() + 1, 0, 23, 59, 59);
  return { desde: inicio.toISOString(), hasta: fin.toISOString() };
}

function diasDelCalendario(date) {
  const inicioMes = new Date(date.getFullYear(), date.getMonth(), 1);
  const finMes = new Date(date.getFullYear(), date.getMonth() + 1, 0);
  const dias = [];
  const inicioGrid = new Date(inicioMes);
  inicioGrid.setDate(inicioMes.getDate() - ((inicioMes.getDay() + 6) % 7));
  const finGrid = new Date(finMes);
  finGrid.setDate(finMes.getDate() + (7 - (finMes.getDay() === 0 ? 7 : finMes.getDay())));
  let cur = new Date(inicioGrid);
  while (cur <= finGrid) {
    dias.push(new Date(cur));
    cur.setDate(cur.getDate() + 1);
  }
  return dias;
}

function colorCuota(cu, hoyKey) {
  if (cu.estado_cuota === 'Pagada' || Number(cu.monto_pagado) >= Number(cu.monto)) return '#22c55e'; // verde
  const venc = new Date(cu.fecha_vencimiento).toLocaleDateString('en-CA', { timeZone: TZ });
  if (venc < hoyKey) return '#ef4444'; // rojo (vencida)
  const diasDif = Math.floor((new Date(cu.fecha_vencimiento) - new Date(hoyKey)) / 86400000);
  if (diasDif <= 7) return '#f59e0b'; // ámbar (próxima)
  return '#3b82f6'; // azul (pendiente)
}

function estadoCuotaCalc(cu, hoyKey) {
  if (cu.estado_cuota === 'Pagada' || Number(cu.monto_pagado) >= Number(cu.monto)) return 'Pagada';
  const venc = new Date(cu.fecha_vencimiento).toLocaleDateString('en-CA', { timeZone: TZ });
  if (venc < hoyKey) return 'Vencida';
  const diasDif = Math.floor((new Date(cu.fecha_vencimiento) - new Date(hoyKey)) / 86400000);
  if (diasDif <= 7) return 'Próxima';
  return 'Pendiente';
}

export default function Cobros() {
  const [vistaModo, setVistaModo] = useState('tabla'); // 'tabla' | 'calendario'
  const [clientes, setClientes] = useState([]);
  const [tecnicos, setTecnicos] = useState([]);
  const [tipos, setTipos] = useState([]);
  const [proyectos, setProyectos] = useState([]);
  const [filtros, setFiltros] = useState({
    q: '', estado_cobro: '', vencidos: '', en_mora: '', pagados: '', pendientes: '',
    id_cliente: '', id_tecnico: '', id_tipo_servicio: '', id_proyecto: '',
    fecha_proximo_desde: '', fecha_proximo_hasta: '',
    orden: '', direccion: ''
  });
  // Calendario
  const [cursor, setCursor] = useState(new Date());
  const [cuotasMes, setCuotasMes] = useState([]);
  const [cargandoCalendario, setCargandoCalendario] = useState(false);
  const [diaSeleccionado, setDiaSeleccionado] = useState(null);
  const [otAbierta, setOtAbierta] = useState(null); // { numero, archivo } | null
  const [exportando, setExportando] = useState(false);
  const toast = useToast();

  const { data, loading, total, page, pageSize, totalPages, setPage, setPageSize, recargar } =
    usePaginatedList(cobrosService.paginate, filtros, { initialPageSize: 25 });

  useEffect(() => {
    Promise.all([
      clientesService.list().catch(() => []),
      tecnicosService.list().catch(() => []),
      tiposServicioService.list().catch(() => []),
      cobrosService.proyectos().catch(() => [])
    ]).then(([c, t, ts, p]) => { setClientes(c); setTecnicos(t); setTipos(ts); setProyectos(p); });
  }, []);

  const cargar = recargar;

  // Refresca la lista cuando el usuario vuelve a la pestaña/ventana. La
  // aprobación de una cotización crea el cobro de forma asíncrona desde
  // otro módulo (o incluso otra pestaña); sin este refresh la página
  // quedaba mostrando datos viejos hasta navegar y volver. Reaccionamos
  // tanto a `focus` (cambio de ventana) como a `visibilitychange` (cambio
  // de tab dentro del mismo browser) para cubrir ambos casos.
  useEffect(() => {
    const refrescar = () => {
      if (document.visibilityState === 'visible') recargar();
    };
    window.addEventListener('focus', refrescar);
    document.addEventListener('visibilitychange', refrescar);
    return () => {
      window.removeEventListener('focus', refrescar);
      document.removeEventListener('visibilitychange', refrescar);
    };
  }, [recargar]);

  // Fetch cuotas para el calendario cuando cambia cursor o se entra al modo
  useEffect(() => {
    if (vistaModo !== 'calendario') return;
    setCargandoCalendario(true);
    const { desde, hasta } = rangoMes(cursor);
    cobrosService.cuotasCalendario({ desde, hasta })
      .then(setCuotasMes)
      .catch(() => setCuotasMes([]))
      .finally(() => setCargandoCalendario(false));
  }, [vistaModo, cursor]);

  const recordar = async (id) => {
    try {
      const { url } = await cobrosService.recordatorio(id);
      window.open(url, '_blank');
      toast.success('WhatsApp abierto con recordatorio');
    } catch (err) { toast.error(err.response?.data?.error || 'Error'); }
  };

  // Descripción legible de los filtros activos, para la cabecera del export.
  const filtrosLegibles = () => {
    const p = [];
    if (filtros.q) p.push(`Búsqueda: ${filtros.q}`);
    if (filtros.estado_cobro) p.push(`Estado: ${filtros.estado_cobro}`);
    if (filtros.id_cliente) p.push(`Cliente: ${clientes.find(c => String(c.id) === String(filtros.id_cliente))?.nombre || filtros.id_cliente}`);
    if (filtros.id_proyecto) p.push(`Proyecto: ${proyectos.find(pr => String(pr.id) === String(filtros.id_proyecto))?.titulo || filtros.id_proyecto}`);
    if (filtros.id_tecnico) p.push(`Técnico: ${tecnicos.find(t => String(t.id) === String(filtros.id_tecnico))?.nombre || filtros.id_tecnico}`);
    if (filtros.id_tipo_servicio) p.push(`Tipo: ${tipos.find(t => String(t.id) === String(filtros.id_tipo_servicio))?.nombre || filtros.id_tipo_servicio}`);
    if (filtros.vencidos === '1') p.push('Solo vencidos');
    if (filtros.en_mora === '1') p.push('Solo en mora');
    if (filtros.pagados === '1') p.push('Solo pagados');
    if (filtros.pendientes === '1') p.push('Solo con saldo');
    if (filtros.fecha_proximo_desde) p.push(`Próx. desde: ${filtros.fecha_proximo_desde}`);
    if (filtros.fecha_proximo_hasta) p.push(`Próx. hasta: ${filtros.fecha_proximo_hasta}`);
    return p;
  };

  // Trae el set COMPLETO de cobros según filtros activos (sin `page`) y exporta.
  const exportar = async (formato) => {
    try {
      setExportando(true);
      const resp = await cobrosService.paginate({ ...filtros });
      const filas = Array.isArray(resp) ? resp : (resp?.data || []);
      if (!filas.length) { toast.error('No hay datos para exportar'); return; }
      const opts = {
        titulo: 'Gestión de cobros',
        subtitulo: 'Listado filtrado',
        columnas: COLUMNAS_EXPORT,
        filas,
        filtros: filtrosLegibles(),
        archivo: `cobros_${hoyISO()}.${formato === 'pdf' ? 'pdf' : 'xls'}`
      };
      if (formato === 'pdf') await exportarPDFTabla(opts);
      else exportarExcelTabla(opts);
      toast.success(formato === 'pdf' ? 'PDF descargado' : 'Excel descargado');
    } catch {
      toast.error('Error al exportar');
    } finally {
      setExportando(false);
    }
  };

  const setF = (k, v) => setFiltros(f => ({ ...f, [k]: v }));
  const limpiar = () => setFiltros({
    q: '', estado_cobro: '', vencidos: '', en_mora: '', pagados: '', pendientes: '',
    id_cliente: '', id_tecnico: '', id_tipo_servicio: '', id_proyecto: '',
    fecha_proximo_desde: '', fecha_proximo_hasta: '',
    orden: '', direccion: ''
  });

  // Ciclo de ordenamiento por columna: asc → desc → sin orden.
  const ordenarPor = (col) => setFiltros(f => {
    if (f.orden !== col) return { ...f, orden: col, direccion: 'asc' };
    if (f.direccion === 'asc') return { ...f, orden: col, direccion: 'desc' };
    return { ...f, orden: '', direccion: '' };
  });

  const opcionesProyectos = useMemo(() => proyectos.map(p => ({
    value: p.id,
    label: p.titulo || `Proyecto #${p.id}`,
    sublabel: [p.codigo, p.cliente_nombre, p.cantidad_ascensores > 1 ? `${p.cantidad_ascensores} ascensores` : null]
      .filter(Boolean).join(' · ')
  })), [proyectos]);

  // Helpers calendario
  const dias = useMemo(() => diasDelCalendario(cursor), [cursor]);
  const hoyKey = new Date().toLocaleDateString('en-CA', { timeZone: TZ });
  const cuotasPorDia = useMemo(() => {
    const m = {};
    for (const cu of cuotasMes) {
      const key = new Date(cu.fecha_vencimiento).toLocaleDateString('en-CA', { timeZone: TZ });
      m[key] ||= [];
      m[key].push(cu);
    }
    return m;
  }, [cuotasMes]);
  const mesLabel = new Intl.DateTimeFormat('es-PE', { month: 'long', year: 'numeric', timeZone: TZ }).format(cursor);
  const mesCursor = cursor.getMonth();
  const diaSelKey = diaSeleccionado ? diaSeleccionado.toLocaleDateString('en-CA', { timeZone: TZ }) : null;
  const cuotasDelDia = useMemo(() => {
    if (!diaSelKey) return [];
    return (cuotasPorDia[diaSelKey] || []).slice().sort((a, b) => Number(b.monto) - Number(a.monto));
  }, [diaSelKey, cuotasPorDia]);

  // Totales del mes (para subtítulo)
  const totalMes = useMemo(() => cuotasMes.reduce((acc, c) => acc + Number(c.monto || 0), 0), [cuotasMes]);
  const pendienteMes = useMemo(() => cuotasMes
    .filter(c => c.estado_cuota !== 'Pagada' && Number(c.monto_pagado) < Number(c.monto))
    .reduce((acc, c) => acc + (Number(c.monto) - Number(c.monto_pagado || 0)), 0), [cuotasMes]);

  return (
    <>
      <PageHeader
        title="Gestión de cobros"
        subtitle={vistaModo === 'calendario'
          ? `${cuotasMes.length} cuota(s) este mes · S/ ${totalMes.toFixed(2)} total · S/ ${pendienteMes.toFixed(2)} pendiente`
          : `${data.length} cobro(s)`}
        actions={
          <>
            <button
              onClick={() => setVistaModo('tabla')}
              className={vistaModo === 'tabla' ? 'btn-primary' : 'btn-secondary'}
            >Tabla</button>
            <button
              onClick={() => setVistaModo('calendario')}
              className={vistaModo === 'calendario' ? 'btn-primary' : 'btn-secondary'}
            >Calendario</button>
            {vistaModo === 'tabla' && (
              <>
                <button onClick={() => exportar('excel')} className="btn-secondary" disabled={exportando || data.length === 0}>Exportar Excel</button>
                <button onClick={() => exportar('pdf')} className="btn-primary" disabled={exportando || data.length === 0}>Exportar PDF</button>
              </>
            )}
            {vistaModo === 'calendario' && (
              <>
                <button onClick={() => setCursor(new Date())} className="btn-secondary">Hoy</button>
                <button onClick={() => setCursor(c => { const d = new Date(c); d.setMonth(d.getMonth() - 1); return d; })} className="btn-secondary">←</button>
                <span className="px-3 text-sm font-medium capitalize w-40 text-center">{mesLabel}</span>
                <button onClick={() => setCursor(c => { const d = new Date(c); d.setMonth(d.getMonth() + 1); return d; })} className="btn-secondary">→</button>
              </>
            )}
          </>
        }
      />

      {vistaModo === 'tabla' && (
        <div className="card mb-4">
          <div className="p-4 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
            <input className="input col-span-2 sm:col-span-3 lg:col-span-2" placeholder="Buscar cliente, servicio o título…" value={filtros.q} onChange={e => setF('q', e.target.value)} />
            <select className="select" value={filtros.estado_cobro} onChange={e => setF('estado_cobro', e.target.value)}>
              <option value="">Todos los estados</option>
              {ESTADOS_COBRO.map(s => <option key={s}>{s}</option>)}
            </select>
            <select className="select" value={filtros.id_cliente} onChange={e => setF('id_cliente', e.target.value)}>
              <option value="">Todos los clientes</option>
              {clientes.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
            </select>
            <Combobox
              className="col-span-2 sm:col-span-2 lg:col-span-2"
              options={opcionesProyectos}
              value={filtros.id_proyecto || null}
              onChange={v => setF('id_proyecto', v ?? '')}
              placeholder="Todos los proyectos"
              emptyLabel="Sin proyectos que coincidan"
            />
            <select className="select" value={filtros.id_tecnico} onChange={e => setF('id_tecnico', e.target.value)}>
              <option value="">Todos los técnicos</option>
              {tecnicos.map(t => <option key={t.id} value={t.id}>{t.nombre}</option>)}
            </select>
            <select className="select" value={filtros.id_tipo_servicio} onChange={e => setF('id_tipo_servicio', e.target.value)}>
              <option value="">Todos los tipos</option>
              {tipos.map(t => <option key={t.id} value={t.id}>{t.nombre}</option>)}
            </select>
            <select className="select" value={filtros.vencidos} onChange={e => setF('vencidos', e.target.value)}>
              <option value="">Vencimiento (todos)</option>
              <option value="1">Solo vencidos</option>
            </select>
            <select className="select" value={filtros.en_mora} onChange={e => setF('en_mora', e.target.value)}>
              <option value="">Mora (todos)</option>
              <option value="1">Solo en mora</option>
            </select>
            <select className="select" value={filtros.pagados} onChange={e => setF('pagados', e.target.value)}>
              <option value="">Pago (todos)</option>
              <option value="1">Solo pagados</option>
            </select>
            <select className="select" value={filtros.pendientes} onChange={e => setF('pendientes', e.target.value)}>
              <option value="">Saldo (todos)</option>
              <option value="1">Solo con saldo</option>
            </select>
            <input type="date" className="input" placeholder="Próx. desde" value={filtros.fecha_proximo_desde} onChange={e => setF('fecha_proximo_desde', e.target.value)} />
            <input type="date" className="input" placeholder="Próx. hasta" value={filtros.fecha_proximo_hasta} onChange={e => setF('fecha_proximo_hasta', e.target.value)} />
            <button onClick={limpiar} className="btn-secondary col-span-2 sm:col-span-1">Limpiar</button>
          </div>
        </div>
      )}

      {vistaModo === 'tabla' ? (
        loading ? <div className="card"><Loader /></div> : data.length === 0 ? <div className="card"><EmptyState title="Sin cobros" /></div> : (
          <>
            {/* Vista tabla (desktop) */}
            <div className="card hidden md:block">
              <div className="overflow-x-auto scroll-thin">
                <table className="table-base">
                  <thead><tr>
                    <ThOrden col="cliente" filtros={filtros} ordenarPor={ordenarPor}>Cliente</ThOrden>
                    <ThOrden col="proyecto" filtros={filtros} ordenarPor={ordenarPor}>Proyecto</ThOrden>
                    <ThOrden col="servicio" filtros={filtros} ordenarPor={ordenarPor}>Servicio</ThOrden>
                    <ThOrden col="ot" filtros={filtros} ordenarPor={ordenarPor}>OT</ThOrden>
                    <ThOrden col="precio" filtros={filtros} ordenarPor={ordenarPor} align="right">Precio total</ThOrden>
                    <ThOrden col="abonos" filtros={filtros} ordenarPor={ordenarPor} align="right">Abonos</ThOrden>
                    <th className="table-th">Abonos por cuenta</th>
                    <ThOrden col="cuotas" filtros={filtros} ordenarPor={ordenarPor} align="center">Cuotas (P/T)</ThOrden>
                    <ThOrden col="saldo" filtros={filtros} ordenarPor={ordenarPor} align="right">Saldo</ThOrden>
                    <ThOrden col="proximo" filtros={filtros} ordenarPor={ordenarPor}>Próximo abono</ThOrden>
                    <ThOrden col="mora" filtros={filtros} ordenarPor={ordenarPor} align="center">Mora</ThOrden>
                    <ThOrden col="estado" filtros={filtros} ordenarPor={ordenarPor}>Estado</ThOrden>
                    <th className="table-th text-right">Acciones</th>
                  </tr></thead>
                  <tbody className="divide-y divide-slate-100">
                    {data.map(c => {
                      const sr = c.servicio?.servicio_realizado;
                      const tieneOt = !!(sr?.numero_ot || sr?.archivo_ot);
                      const esPlan = !c.servicio && !!c.mantenimiento_plan;
                      const cantAsc = c.servicio?.ascensores?.length || c.mantenimiento_plan?.ascensores?.length || 0;
                      return (
                      <tr key={c.id} className={`table-row-hover ${c.vencido ? 'row-vencido' : ''}`}>
                        <td className="table-td text-sm">{c.cliente?.nombre}</td>
                        <td className="table-td text-sm">
                          <div className="truncate max-w-[220px]" title={c.servicio?.titulo || c.mantenimiento_plan?.tipo_servicio?.nombre || ''}>
                            {c.servicio?.titulo || (esPlan ? (c.mantenimiento_plan?.tipo_servicio?.nombre || 'Mantenimiento (plan)') : '—')}
                          </div>
                          {cantAsc > 1 && (
                            <div className="text-[10px] text-slate-500">{cantAsc} ascensores</div>
                          )}
                        </td>
                        <td className="table-td whitespace-nowrap min-w-[160px]">
                          {c.servicio ? (
                            <>
                              <Link to={`/servicios/${c.servicio.id}`} className="font-mono text-xs text-brand-700 hover:underline">{c.servicio.codigo}</Link>
                              {c.servicio.cotizacion && (
                                <div className="text-[10px] text-slate-500 mt-0.5">
                                  Cotización{' '}
                                  <Link
                                    to={`/cotizaciones/${c.servicio.cotizacion.id}`}
                                    className="font-mono text-brand-700 hover:underline"
                                  >
                                    {c.servicio.cotizacion.codigo}
                                  </Link>
                                </div>
                              )}
                            </>
                          ) : (
                            <span className="badge-blue text-[10px]">Plan de mantenimiento{c.mantenimiento_plan ? ` #${c.mantenimiento_plan.id}` : ''}</span>
                          )}
                        </td>
                        <td className="table-td">
                          {tieneOt ? (
                            <button
                              type="button"
                              onClick={() => setOtAbierta({ numero: sr.numero_ot, archivo: sr.archivo_ot })}
                              className="inline-flex items-center gap-1 text-brand-700 text-xs hover:underline font-mono"
                              title="Ver OT"
                            >
                              📄 {sr.numero_ot || 'OT'}
                            </button>
                          ) : (
                            <span className="text-slate-400 text-xs">—</span>
                          )}
                        </td>
                        <td className="table-td text-right font-mono">{formatMonto(c.monto_total, c.moneda)}</td>
                        <td className="table-td text-right font-mono text-emerald-700">{formatMonto(c.total_abonado, c.moneda)}</td>
                        <td className="table-td">
                          {Array.isArray(c.abonos_por_cuenta) && c.abonos_por_cuenta.length > 0 ? (
                            <ul className="space-y-0.5 min-w-[180px] max-w-[260px]">
                              {c.abonos_por_cuenta.map(a => (
                                <li key={a.key} className="flex items-center justify-between gap-2 text-xs">
                                  <span className="truncate text-slate-700" title={a.label}>{a.label}</span>
                                  <span className="font-mono text-emerald-700 shrink-0">{formatMonto(a.total, c.moneda)}</span>
                                </li>
                              ))}
                            </ul>
                          ) : (
                            <span className="text-slate-400 text-xs">—</span>
                          )}
                        </td>
                        <td className="table-td text-center text-xs">{c.cuotas_pagadas}/{c.numero_cuotas}</td>
                        <td className="table-td text-right font-mono font-medium text-rose-700">{formatMonto(c.saldo_pendiente, c.moneda)}</td>
                        <td className="table-td text-xs">{formatFecha(c.fecha_proximo_abono)}</td>
                        <td className="table-td text-center text-xs">{c.dias_mora > 0 ? <span className="text-rose-700 font-semibold">{c.dias_mora}</span> : '—'}</td>
                        <td className="table-td"><span className={badgeEstado(c.estado_cobro)}>{c.estado_cobro}</span></td>
                        <td className="table-td text-right space-x-2 whitespace-nowrap">
                          <Link to={`/cobros/${c.id}`} className="text-brand-700 text-xs hover:underline">Gestionar</Link>
                          {Number(c.saldo_pendiente) > 0 && (
                            <button onClick={() => recordar(c.id)} className="inline-flex items-center gap-1 text-emerald-600 text-xs hover:underline">WhatsApp</button>
                          )}
                        </td>
                      </tr>
                    );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Vista cards (móvil) */}
            <div className="md:hidden grid gap-3">
              {data.map(c => {
                const sr = c.servicio?.servicio_realizado;
                const tieneOt = !!(sr?.numero_ot || sr?.archivo_ot);
                return (
                <div key={c.id} className={`card p-4 ${c.vencido ? 'ring-2 ring-rose-200' : ''}`}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="font-medium text-sm truncate">{c.cliente?.nombre}</div>
                      {(c.servicio?.titulo || (!c.servicio && c.mantenimiento_plan)) && (
                        <div className="text-xs text-slate-700 truncate">{c.servicio?.titulo || c.mantenimiento_plan?.tipo_servicio?.nombre || 'Mantenimiento (plan)'}</div>
                      )}
                      {c.servicio ? (
                        <>
                          <Link to={`/servicios/${c.servicio.id}`} className="font-mono text-xs text-brand-700 hover:underline">{c.servicio.codigo}</Link>
                          {c.servicio.cotizacion && (
                            <div className="text-[10px] text-slate-500 mt-0.5">
                              Cotización{' '}
                              <Link
                                to={`/cotizaciones/${c.servicio.cotizacion.id}`}
                                className="font-mono text-brand-700 hover:underline"
                              >
                                {c.servicio.cotizacion.codigo}
                              </Link>
                            </div>
                          )}
                        </>
                      ) : (
                        <span className="badge-blue text-[10px]">Plan de mantenimiento{c.mantenimiento_plan ? ` #${c.mantenimiento_plan.id}` : ''}</span>
                      )}
                    </div>
                    <span className={badgeEstado(c.estado_cobro)}>{c.estado_cobro}</span>
                  </div>
                  <div className="grid grid-cols-3 gap-2 mt-3 text-xs">
                    <Mini label="Total" value={formatMonto(c.monto_total, c.moneda)} />
                    <Mini label="Abonado" value={formatMonto(c.total_abonado, c.moneda)} cls="text-emerald-700" />
                    <Mini label="Saldo" value={formatMonto(c.saldo_pendiente, c.moneda)} cls="text-rose-700" />
                    <Mini label="Cuotas" value={`${c.cuotas_pagadas}/${c.numero_cuotas}`} />
                    <Mini label="Próx. abono" value={formatFecha(c.fecha_proximo_abono)} />
                    <Mini label="Mora" value={c.dias_mora > 0 ? `${c.dias_mora}d` : '—'} cls={c.dias_mora > 0 ? 'text-rose-700' : ''} />
                  </div>
                  {Array.isArray(c.abonos_por_cuenta) && c.abonos_por_cuenta.length > 0 && (
                    <div className="mt-3">
                      <div className="text-[10px] uppercase tracking-wider text-slate-400 mb-1">Abonos por cuenta</div>
                      <ul className="space-y-0.5">
                        {c.abonos_por_cuenta.map(a => (
                          <li key={a.key} className="flex items-center justify-between gap-2 text-xs">
                            <span className="truncate text-slate-700" title={a.label}>{a.label}</span>
                            <span className="font-mono text-emerald-700 shrink-0">{formatMonto(a.total, c.moneda)}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  <div className="mt-3 flex gap-2">
                    <Link to={`/cobros/${c.id}`} className="btn-secondary text-xs flex-1 text-center">Gestionar</Link>
                    {tieneOt && (
                      <button
                        type="button"
                        onClick={() => setOtAbierta({ numero: sr.numero_ot, archivo: sr.archivo_ot })}
                        className="btn-secondary text-xs flex-1 text-brand-700"
                      >📄 OT</button>
                    )}
                    {Number(c.saldo_pendiente) > 0 && (
                      <button onClick={() => recordar(c.id)} className="btn-secondary text-xs flex-1 text-emerald-700">WhatsApp</button>
                    )}
                  </div>
                </div>
                );
              })}
            </div>
            <div className="card mt-0 -mt-px">
              <Pagination page={page} pageSize={pageSize} total={total} totalPages={totalPages}
                onPage={setPage} onPageSize={setPageSize} />
            </div>
          </>
        )
      ) : (
        // Vista calendario
        <>
          <div className="card mb-3 p-3 flex flex-wrap gap-3 text-xs text-slate-600">
            <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: '#22c55e' }} /> Pagada</span>
            <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: '#ef4444' }} /> Vencida</span>
            <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: '#f59e0b' }} /> Próxima (≤ 7 días)</span>
            <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: '#3b82f6' }} /> Pendiente</span>
          </div>
          {cargandoCalendario ? <div className="card"><Loader /></div> : cuotasMes.length === 0 ? (
            <div className="card"><EmptyState title="Sin cuotas este mes" subtitle="Ningún cobro tiene cuotas con vencimiento en el mes seleccionado." /></div>
          ) : (
            <div className="card overflow-hidden">
              <div className="grid grid-cols-7 bg-slate-50 text-[11px] uppercase font-semibold text-slate-500 border-b border-slate-200">
                {['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'].map(d => <div key={d} className="px-2 py-2 text-center">{d}</div>)}
              </div>
              <div className="grid grid-cols-7 grid-rows-6 min-h-[600px]">
                {dias.map((d, idx) => {
                  const key = d.toLocaleDateString('en-CA', { timeZone: TZ });
                  const esHoy = key === hoyKey;
                  const esOtroMes = d.getMonth() !== mesCursor;
                  const cuotas = cuotasPorDia[key] || [];
                  return (
                    <button
                      type="button"
                      key={idx}
                      onClick={() => cuotas.length > 0 && setDiaSeleccionado(d)}
                      aria-label={`Ver cuotas del ${fmtDiaLargo.format(d)}`}
                      className={`p-1.5 border-b border-r border-slate-100 text-xs text-left w-full transition focus:outline-none focus:ring-2 focus:ring-inset focus:ring-brand-300 ${esOtroMes ? 'bg-slate-50/50 text-slate-400 hover:bg-slate-100/70' : 'bg-white hover:bg-slate-50'} ${cuotas.length > 0 ? 'cursor-pointer' : 'cursor-default'}`}
                    >
                      <div className={`text-right ${esHoy ? 'inline-block bg-brand-600 text-white rounded-full h-6 w-6 leading-6 text-center font-semibold' : ''}`}>{d.getDate()}</div>
                      <div className="mt-1 space-y-0.5 max-h-24 overflow-hidden">
                        {cuotas.slice(0, 3).map(cu => (
                          <div key={cu.id} className="block truncate rounded px-1.5 py-0.5 text-white text-[10px]" style={{ backgroundColor: colorCuota(cu, hoyKey) }}>
                            {cu.cobro?.cliente?.nombre || 'Cliente'} · S/ {Number(cu.monto).toFixed(2)}
                          </div>
                        ))}
                        {cuotas.length > 3 && <div className="text-[10px] text-slate-500">+{cuotas.length - 3} más</div>}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </>
      )}

      <Modal
        open={diaSeleccionado !== null}
        onClose={() => setDiaSeleccionado(null)}
        title={diaSeleccionado ? fmtDiaLargo.format(diaSeleccionado) : ''}
        size="md"
        footer={<button type="button" onClick={() => setDiaSeleccionado(null)} className="btn-secondary">Cerrar</button>}
      >
        {cuotasDelDia.length === 0 ? (
          <EmptyState title="Sin cuotas este día" />
        ) : (
          <ul className="divide-y divide-slate-100">
            {cuotasDelDia.map(cu => {
              const estado = estadoCuotaCalc(cu, hoyKey);
              const color = colorCuota(cu, hoyKey);
              return (
                <li key={cu.id} className="py-3 flex items-start gap-3">
                  <div className="h-2 w-2 mt-2 rounded-full shrink-0" style={{ backgroundColor: color }} />
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-slate-800 text-sm">
                      {cu.cobro?.cliente?.nombre || 'Cliente'}
                      <span className="text-xs text-slate-500"> · Cuota {cu.numero_cuota}/{cu.cobro?.numero_cuotas || '?'}</span>
                    </div>
                    <div className="text-xs text-slate-500">
                      Servicio{' '}
                      <Link
                        to={`/cobros/${cu.cobro?.id}`}
                        onClick={() => setDiaSeleccionado(null)}
                        className="font-mono text-brand-700 hover:underline"
                      >
                        {cu.cobro?.servicio?.codigo}
                      </Link>
                      {' · '}<span className="font-mono">S/ {Number(cu.monto).toFixed(2)}</span>
                      {Number(cu.monto_pagado) > 0 && <span className="font-mono text-emerald-700"> · pagado S/ {Number(cu.monto_pagado).toFixed(2)}</span>}
                    </div>
                  </div>
                  <span className="text-xs px-2 py-0.5 rounded-full" style={{ backgroundColor: `${color}22`, color }}>{estado}</span>
                </li>
              );
            })}
          </ul>
        )}
      </Modal>

      <OtModal
        open={otAbierta !== null}
        onClose={() => setOtAbierta(null)}
        numero={otAbierta?.numero}
        archivo={otAbierta?.archivo}
      />
    </>
  );
}

function ThOrden({ col, filtros, ordenarPor, align = 'left', children }) {
  const activo = filtros.orden === col;
  const flecha = !activo ? '↕' : filtros.direccion === 'asc' ? '↑' : '↓';
  const alignCls = align === 'right' ? 'text-right' : align === 'center' ? 'text-center' : 'text-left';
  const justifyCls = align === 'right' ? 'justify-end' : align === 'center' ? 'justify-center' : 'justify-start';
  return (
    <th className={`table-th ${alignCls}`}>
      <button
        type="button"
        onClick={() => ordenarPor(col)}
        className={`inline-flex items-center gap-1 w-full ${justifyCls} hover:text-carbon-800 focus:outline-none ${activo ? 'text-carbon-800' : ''}`}
        aria-sort={!activo ? 'none' : filtros.direccion === 'asc' ? 'ascending' : 'descending'}
      >
        <span>{children}</span>
        <span className={`text-[10px] ${activo ? 'opacity-100' : 'opacity-40'}`}>{flecha}</span>
      </button>
    </th>
  );
}

function Mini({ label, value, cls = '' }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider text-slate-400">{label}</div>
      <div className={`font-mono ${cls}`}>{value}</div>
    </div>
  );
}
