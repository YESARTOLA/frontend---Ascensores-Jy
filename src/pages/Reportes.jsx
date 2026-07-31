import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { reportesService, clientesService, tecnicosService, tiposServicioService, ascensoresService, cuentasBancariasService } from '../services';
import PageHeader from '../components/common/PageHeader.jsx';
import Loader from '../components/common/Loader.jsx';
import EmptyState from '../components/common/EmptyState.jsx';
import Pagination from '../components/common/Pagination.jsx';
import RangeCalendar from '../components/common/RangeCalendar.jsx';
import { useToast } from '../components/common/Toast.jsx';
import { useAuth } from '../features/auth/AuthContext.jsx';
import { formatFecha, formatFechaHora, formatMonto, badgeEstado, codigosAscensores, resumenAscensores, hoyISO } from '../utils/formatters.js';
import { generarReportePDF } from '../utils/pdfReport.js';
import { esFacturado } from '../utils/estadoFactura.js';
import { ESTADOS_EMERGENCIA } from '../utils/estadoServicio.js';

// Categoría agrupa los reportes operativos por entidad del negocio. El selector
// superior actúa como filtro de la lista de tabs. "todos" muestra todos.
const CATEGORIAS = [
  { codigo: 'todos',           label: 'Todos' },
  { codigo: 'mantenimientos',  label: 'Mantenimientos' },
  { codigo: 'emergencias',     label: 'Emergencias' },
  { codigo: 'correctivos',     label: 'Correctivos' },
  { codigo: 'leads',           label: 'Leads' },
  { codigo: 'atencion_rapida', label: 'Atención rápida' }
];

const ESTADOS_CORRECTIVO = ['Reportado', 'En atención', 'Resuelto', 'Cancelado'];
const ESTADOS_ATENCION = ['nueva', 'en_proceso', 'convertida', 'descartada'];

const TABS = [
  { key: 'Operativos', codigo: 'operativos', filtros: ['desde', 'hasta', 'id_cliente', 'id_tecnico', 'id_ascensor', 'id_tipo_servicio', 'estado_servicio'] },
  { key: 'Servicios finalizados', codigo: 'servicios_finalizados', filtros: ['desde', 'hasta', 'id_cliente', 'id_tecnico', 'id_tipo_servicio'] },
  { key: 'Emergencias atendidas', codigo: 'emergencias_atendidas', categoria: 'emergencias', filtros: ['desde', 'hasta', 'id_cliente', 'estado_emergencia', 'nivel_urgencia'] },
  { key: 'Correctivos', codigo: 'correctivos', categoria: 'correctivos', filtros: ['desde', 'hasta', 'id_cliente', 'estado_correctivo', 'nivel_urgencia'] },
  { key: 'Mant. cumplidos', codigo: 'mantenimientos_cumplidos', categoria: 'mantenimientos', filtros: ['desde', 'hasta', 'id_cliente', 'id_ascensor'] },
  { key: 'Mant. vencidos', codigo: 'mantenimientos_vencidos', categoria: 'mantenimientos', filtros: [] },
  { key: 'Mant. por cliente', codigo: 'mantenimientos_por_cliente', categoria: 'mantenimientos', filtros: [] },
  { key: 'Mant. sin servicio', codigo: 'mantenimientos_sin_servicio', categoria: 'mantenimientos', filtros: ['desde', 'hasta'] },
  { key: 'Pendientes de cobro', codigo: 'pendientes_cobro', filtros: ['id_cliente'] },
  { key: 'Cobros vencidos', codigo: 'cobros_vencidos', filtros: ['id_cliente'] },
  { key: 'Mora por cliente', codigo: 'mora_cliente', filtros: [] },
  { key: 'Abonos', codigo: 'abonos', filtros: ['desde', 'hasta'] },
  { key: 'Ingresos por banco', codigo: 'ingresos_por_banco', filtros: ['desde', 'hasta', 'id_cuenta_bancaria', 'banco', 'moneda'] },
  { key: 'Facturados', codigo: 'facturados', filtros: [] },
  { key: 'No facturados', codigo: 'no_facturados', filtros: [] },
  { key: 'Cobros (general)', codigo: 'cobros', filtros: [] },
  { key: 'Productividad técnicos', codigo: 'tecnicos', filtros: [] },
  { key: 'Leads', codigo: 'leads', categoria: 'leads', filtros: [] },
  { key: 'Atención rápida', codigo: 'atenciones_rapidas', categoria: 'atencion_rapida', filtros: ['desde', 'hasta', 'id_cliente', 'estado_atencion', 'nivel_urgencia'] },
  { key: 'Ascensores', codigo: 'ascensores', filtros: [] },
  { key: 'Hist. téc. ascensor', codigo: 'historial_tecnico_ascensor', filtros: ['id_ascensor'] },
  // Exclusivo del Super Admin: estado de los edificios por cliente (activos vs inactivos).
  { key: 'Edificios por cliente', codigo: 'clientes_estado_edificios', filtros: [], soloSA: true }
];

const ESTADOS_SERVICIO = [
  'Borrador', 'Pendiente', 'Asignado', 'Checklist de salida pendiente', 'Listo para salida',
  'En camino', 'En curso', 'Finalizado por técnico', 'Finalizado observado', 'En revisión administrativa',
  'A gestión de cobro', 'En cobro', 'Cobrado parcial', 'Cobrado total', 'Facturado', 'Cerrado', 'Cancelado'
];

function fetcher(codigo, params) {
  switch (codigo) {
    case 'operativos': return reportesService.operativos(params);
    case 'servicios_finalizados': return reportesService.serviciosFinalizados(params);
    case 'emergencias_atendidas': return reportesService.emergenciasAtendidas(params);
    case 'correctivos': return reportesService.correctivos(params);
    case 'atenciones_rapidas': return reportesService.atencionesRapidas(params);
    case 'mantenimientos_cumplidos': return reportesService.mantenimientosCumplidos(params);
    case 'mantenimientos_vencidos': return reportesService.mantenimientosVencidos(params);
    case 'mantenimientos_por_cliente': return reportesService.mantenimientosPorCliente(params);
    case 'mantenimientos_sin_servicio': return reportesService.mantenimientosProgramadosSinServicio(params);
    case 'pendientes_cobro': return reportesService.pendientesDeCobro(params);
    case 'cobros_vencidos': return reportesService.cobrosVencidos(params);
    case 'mora_cliente': return reportesService.moraPorCliente();
    case 'abonos': return reportesService.abonosRegistrados(params);
    case 'ingresos_por_banco': return reportesService.ingresosPorBanco(params);
    case 'facturados': return reportesService.facturados({ facturados: 1 });
    case 'no_facturados': return reportesService.facturados({ facturados: 0 });
    case 'cobros': return reportesService.cobros();
    case 'tecnicos': return reportesService.tecnicos();
    case 'leads': return reportesService.leads();
    case 'ascensores': return reportesService.ascensores();
    case 'historial_tecnico_ascensor': return params.id_ascensor ? reportesService.historialTecnicoAscensor(params) : Promise.resolve(null);
    case 'clientes_estado_edificios': return reportesService.clientesEstadoEdificios();
    default: return Promise.resolve([]);
  }
}

export default function Reportes() {
  const [categoria, setCategoria] = useState('todos');
  const [tab, setTab] = useState(TABS[0]);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [filtros, setFiltros] = useState({});
  const [clientes, setClientes] = useState([]);
  const [tecnicos, setTecnicos] = useState([]);
  const [tipos, setTipos] = useState([]);
  const [ascensores, setAscensores] = useState([]);
  const [cuentasBancarias, setCuentasBancarias] = useState([]);
  const toast = useToast();
  const { puedeVerPrecio, esSuperAdmin } = useAuth();
  // Pestañas visibles según rol (algunas, como el estado de edificios, son SA-only).
  const tabsVisibles = useMemo(() => TABS.filter(t => !t.soloSA || esSuperAdmin), [esSuperAdmin]);

  useEffect(() => {
    Promise.all([
      clientesService.list().catch(() => []),
      tecnicosService.list().catch(() => []),
      tiposServicioService.list().catch(() => []),
      ascensoresService.list().catch(() => []),
      cuentasBancariasService.list().catch(() => [])
    ]).then(([c, t, ts, a, cb]) => { setClientes(c); setTecnicos(t); setTipos(ts); setAscensores(a); setCuentasBancarias(cb); });
  }, []);

  const bancosUnicos = useMemo(
    () => Array.from(new Set((cuentasBancarias || []).map(c => c.banco).filter(Boolean))).sort(),
    [cuentasBancarias]
  );
  const monedasUnicas = useMemo(
    () => Array.from(new Set((cuentasBancarias || []).map(c => c.moneda).filter(Boolean))).sort(),
    [cuentasBancarias]
  );

  useEffect(() => {
    setLoading(true);
    setData(null);
    fetcher(tab.codigo, filtros).then(setData).catch(() => setData([])).finally(() => setLoading(false));
  }, [tab, JSON.stringify(filtros)]);

  const limpiarFiltros = () => setFiltros({});
  useEffect(() => { limpiarFiltros(); }, [tab.codigo]);

  // Cambiar de tab limpia los datos de inmediato para evitar un render
  // transitorio con la data del tab anterior (cada reporte tiene otro shape).
  const seleccionarTab = (t) => { setData(null); setTab(t); };

  // Paginación de la tabla. Es de cliente a propósito: la analítica y las
  // exportaciones necesitan el dataset completo (totales, top-N, series por
  // mes), así que el reporte se sigue trayendo entero y lo que se recorta es
  // solo lo que se pinta. Evita montar miles de <tr> de golpe.
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  useEffect(() => { setPage(1); }, [tab.codigo, JSON.stringify(filtros), pageSize]);

  // Mientras se exporta, la tabla se renderiza completa: tanto el Excel como el
  // PDF se construyen leyendo el <table> del DOM, y una tabla paginada haría
  // que se exportara únicamente la página visible.
  const [exportandoTabla, setExportandoTabla] = useState(false);

  const esListaPaginable = Array.isArray(data);
  const totalFilas = esListaPaginable ? data.length : 0;
  const totalPages = Math.max(1, Math.ceil(totalFilas / pageSize));
  const datosTabla = useMemo(() => {
    if (!esListaPaginable || exportandoTabla) return data;
    return data.slice((page - 1) * pageSize, page * pageSize);
  }, [data, esListaPaginable, exportandoTabla, page, pageSize]);

  const printRef = useRef(null);

  /**
   * Ejecuta `fn` con la tabla completa montada en el DOM. `flushSync` fuerza el
   * re-render antes de leerla, porque `fn` inspecciona el DOM de forma síncrona.
   */
  const conTablaCompleta = async (fn) => {
    flushSync(() => setExportandoTabla(true));
    try {
      return await fn();
    } finally {
      setExportandoTabla(false);
    }
  };

  const hayDatos = () => {
    if (tab.codigo === 'leads') return !!data?.leads?.length;
    if (tab.codigo === 'historial_tecnico_ascensor') return !!data;
    if (tab.codigo === 'ingresos_por_banco') return Array.isArray(data?.grupos) && data.grupos.length > 0;
    return Array.isArray(data) && data.length > 0;
  };

  const tablaHTMLDeDOM = () => {
    const tabla = printRef.current?.querySelector('table');
    if (!tabla) return null;
    const clon = tabla.cloneNode(true);
    clon.querySelectorAll('.row-vencido').forEach(tr => tr.setAttribute('style', 'background:#fef2f2'));
    clon.querySelectorAll('[class*="badge-"]').forEach(el => el.setAttribute('style', 'padding:1px 6px;border-radius:4px;font-size:10px;border:1px solid #cbd5e1'));
    return clon.outerHTML;
  };

  const resumenAnaliticoTexto = () => {
    if (!Array.isArray(data) && tab.codigo !== 'leads' && tab.codigo !== 'ingresos_por_banco') return [];
    const cfg = buildAnalitica(tab.codigo, data, puedeVerPrecio);
    return cfg?.analisis || [];
  };

  const fechaHora = () => new Date().toLocaleString('es-PE', { timeZone: 'America/Lima' });

  const filtrosLegibles = () => {
    const partes = [];
    if (filtros.desde) partes.push(`Desde: ${filtros.desde}`);
    if (filtros.hasta) partes.push(`Hasta: ${filtros.hasta}`);
    if (filtros.id_cliente) partes.push(`Cliente: ${clientes.find(c => String(c.id) === String(filtros.id_cliente))?.nombre || filtros.id_cliente}`);
    if (filtros.id_tecnico) partes.push(`Técnico: ${tecnicos.find(t => String(t.id) === String(filtros.id_tecnico))?.nombre || filtros.id_tecnico}`);
    if (filtros.id_ascensor) partes.push(`Ascensor: ${ascensores.find(a => String(a.id) === String(filtros.id_ascensor))?.codigo || filtros.id_ascensor}`);
    if (filtros.id_tipo_servicio) partes.push(`Tipo: ${tipos.find(t => String(t.id) === String(filtros.id_tipo_servicio))?.nombre || filtros.id_tipo_servicio}`);
    if (filtros.estado_servicio) partes.push(`Estado: ${filtros.estado_servicio}`);
    if (filtros.estado_emergencia) partes.push(`Estado emerg.: ${filtros.estado_emergencia}`);
    if (filtros.nivel_urgencia) partes.push(`Urgencia: ${filtros.nivel_urgencia}`);
    if (filtros.id_cuenta_bancaria) {
      const cb = cuentasBancarias.find(c => String(c.id) === String(filtros.id_cuenta_bancaria));
      partes.push(`Cuenta: ${cb ? `${cb.banco} · ${cb.nombre}` : filtros.id_cuenta_bancaria}`);
    }
    if (filtros.banco) partes.push(`Banco: ${filtros.banco}`);
    if (filtros.moneda) partes.push(`Moneda: ${filtros.moneda}`);
    return partes;
  };

  const exportarExcel = () => {
    if (!hayDatos()) return toast.error('No hay datos para exportar');
    return conTablaCompleta(() => {
    const tablaHTML = tablaHTMLDeDOM();
    if (!tablaHTML) return toast.error('No se encontró la tabla');
    const analisis = resumenAnaliticoTexto();
    const filtrosTxt = filtrosLegibles();
    const html = `
<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40">
<head>
<meta charset="UTF-8">
<style>
  table{border-collapse:collapse;font-family:Arial,sans-serif;font-size:11px}
  th{background:#1e293b;color:#fff;padding:6px 8px;text-align:left;border:1px solid #475569}
  td{padding:5px 8px;border:1px solid #cbd5e1}
  .titulo{font-size:16px;font-weight:bold;color:#0f172a}
  .meta{font-size:11px;color:#475569}
  .h{font-weight:bold;background:#f1f5f9}
</style>
</head>
<body>
<div class="titulo">${tab.key}</div>
<div class="meta">Generado: ${fechaHora()}</div>
${filtrosTxt.length ? `<div class="meta">Filtros: ${filtrosTxt.join(' · ')}</div>` : ''}
<br/>
${tablaHTML}
${analisis.length ? `<br/><div class="h">Resumen analítico</div><ul>${analisis.map(a => `<li>${a}</li>`).join('')}</ul>` : ''}
</body>
</html>`.trim();
    const blob = new Blob([new Uint8Array([0xEF, 0xBB, 0xBF]), html], { type: 'application/vnd.ms-excel;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `reporte_${tab.codigo}_${hoyISO()}.xls`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success('Excel descargado');
    });
  };

  const exportarPDF = async () => {
    if (!hayDatos()) return toast.error('No hay datos para exportar');
    return conTablaCompleta(async () => {
    const tablaEl = printRef.current?.querySelector('table');
    if (!tablaEl) return toast.error('No se encontró la tabla');
    const analitica = Array.isArray(data) || tab.codigo === 'leads' || tab.codigo === 'ingresos_por_banco'
      ? buildAnalitica(tab.codigo, data, puedeVerPrecio)
      : null;
    try {
      await generarReportePDF({
        titulo: tab.key,
        subtitulo: 'Análisis operativo y financiero',
        fechaHora: fechaHora(),
        filtros: filtrosLegibles(),
        analitica,
        tablaEl,
        nombreArchivo: `Reporte_${tab.codigo}_${hoyISO()}.pdf`
      });
      toast.success('PDF descargado');
    } catch (err) {
      console.error(err);
      toast.error('Error al generar el PDF');
    }
    });
  };

  const setF = (k, v) => setFiltros(p => ({ ...p, [k]: v || undefined }));

  return (
    <>
      <PageHeader title="Reportes" subtitle="Análisis operativo y financiero"
        actions={
          <>
            <button onClick={exportarExcel} className="btn-secondary" disabled={!hayDatos()}>Exportar Excel</button>
            <button onClick={exportarPDF} className="btn-primary" disabled={!hayDatos()}>Exportar PDF</button>
          </>
        } />

      <div className="card mb-2">
        <div className="px-2 py-2 flex gap-1 overflow-x-auto scroll-thin">
          {CATEGORIAS.map(c => (
            <button
              key={c.codigo}
              onClick={() => {
                setCategoria(c.codigo);
                const visibles = c.codigo === 'todos' ? tabsVisibles : tabsVisibles.filter(t => t.categoria === c.codigo);
                if (visibles.length > 0 && !visibles.some(t => t.codigo === tab.codigo)) {
                  seleccionarTab(visibles[0]);
                }
              }}
              className={`px-3 py-1.5 text-xs uppercase tracking-wide font-semibold rounded-md whitespace-nowrap ${categoria === c.codigo ? 'bg-brand-600 text-white' : 'text-slate-500 hover:bg-slate-100'}`}>
              {c.label}
            </button>
          ))}
        </div>
      </div>

      <div className="card mb-4">
        <div className="px-2 py-2 flex gap-1 overflow-x-auto scroll-thin">
          {tabsVisibles
            .filter(t => categoria === 'todos' || t.categoria === categoria)
            .map(t => (
              <button key={t.codigo} onClick={() => seleccionarTab(t)}
                className={`px-3 py-1.5 text-sm rounded-md whitespace-nowrap ${tab.codigo === t.codigo ? 'bg-brand-50 text-brand-700 font-medium' : 'text-slate-600 hover:bg-slate-100'}`}>
                {t.key}
              </button>
            ))}
        </div>
      </div>

      {tab.filtros.length > 0 && (
        <div className="card mb-4">
          <div className="p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {tab.filtros.includes('desde') && (
              <div><label className="label">Desde</label><input type="date" className="input" value={filtros.desde || ''} onChange={e => setF('desde', e.target.value)} /></div>
            )}
            {tab.filtros.includes('hasta') && (
              <div><label className="label">Hasta</label><input type="date" className="input" value={filtros.hasta || ''} onChange={e => setF('hasta', e.target.value)} /></div>
            )}
            {tab.filtros.includes('id_cliente') && (
              <div>
                <label className="label">Cliente</label>
                <select className="select" value={filtros.id_cliente || ''} onChange={e => setF('id_cliente', e.target.value)}>
                  <option value="">Todos</option>
                  {clientes.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
                </select>
              </div>
            )}
            {tab.filtros.includes('id_tecnico') && (
              <div>
                <label className="label">Técnico</label>
                <select className="select" value={filtros.id_tecnico || ''} onChange={e => setF('id_tecnico', e.target.value)}>
                  <option value="">Todos</option>
                  {tecnicos.map(t => <option key={t.id} value={t.id}>{t.nombre}</option>)}
                </select>
              </div>
            )}
            {tab.filtros.includes('id_ascensor') && (
              <div>
                <label className="label">Ascensor {tab.codigo === 'historial_tecnico_ascensor' ? '*' : ''}</label>
                <select className="select" value={filtros.id_ascensor || ''} onChange={e => setF('id_ascensor', e.target.value)}>
                  <option value="">Todos</option>
                  {ascensores.map(a => <option key={a.id} value={a.id}>{a.codigo}</option>)}
                </select>
              </div>
            )}
            {tab.filtros.includes('id_tipo_servicio') && (
              <div>
                <label className="label">Tipo de servicio</label>
                <select className="select" value={filtros.id_tipo_servicio || ''} onChange={e => setF('id_tipo_servicio', e.target.value)}>
                  <option value="">Todos</option>
                  {tipos.map(t => <option key={t.id} value={t.id}>{t.nombre}</option>)}
                </select>
              </div>
            )}
            {tab.filtros.includes('estado_servicio') && (
              <div>
                <label className="label">Estado</label>
                <select className="select" value={filtros.estado_servicio || ''} onChange={e => setF('estado_servicio', e.target.value)}>
                  <option value="">Todos</option>
                  {ESTADOS_SERVICIO.map(s => <option key={s}>{s}</option>)}
                </select>
              </div>
            )}
            {tab.filtros.includes('estado_emergencia') && (
              <div>
                <label className="label">Estado emergencia</label>
                <select className="select" value={filtros.estado_emergencia || ''} onChange={e => setF('estado_emergencia', e.target.value)}>
                  <option value="">Todos</option>
                  {ESTADOS_EMERGENCIA.map(s => <option key={s}>{s}</option>)}
                </select>
              </div>
            )}
            {tab.filtros.includes('estado_correctivo') && (
              <div>
                <label className="label">Estado correctivo</label>
                <select className="select" value={filtros.estado_correctivo || ''} onChange={e => setF('estado_correctivo', e.target.value)}>
                  <option value="">Todos</option>
                  {ESTADOS_CORRECTIVO.map(s => <option key={s}>{s}</option>)}
                </select>
              </div>
            )}
            {tab.filtros.includes('estado_atencion') && (
              <div>
                <label className="label">Estado atención</label>
                <select className="select" value={filtros.estado_atencion || ''} onChange={e => setF('estado_atencion', e.target.value)}>
                  <option value="">Todos</option>
                  {ESTADOS_ATENCION.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
            )}
            {tab.filtros.includes('nivel_urgencia') && (
              <div>
                <label className="label">Urgencia</label>
                <select className="select" value={filtros.nivel_urgencia || ''} onChange={e => setF('nivel_urgencia', e.target.value)}>
                  <option value="">Todas</option>
                  <option>alta</option><option>media</option><option>baja</option>
                </select>
              </div>
            )}
            {tab.filtros.includes('id_cuenta_bancaria') && (
              <div>
                <label className="label">Cuenta bancaria</label>
                <select className="select" value={filtros.id_cuenta_bancaria || ''} onChange={e => setF('id_cuenta_bancaria', e.target.value)}>
                  <option value="">Todas</option>
                  {cuentasBancarias.map(c => (
                    <option key={c.id} value={c.id}>{c.banco} · {c.nombre} ({c.moneda})</option>
                  ))}
                </select>
              </div>
            )}
            {tab.filtros.includes('banco') && (
              <div>
                <label className="label">Banco</label>
                <select className="select" value={filtros.banco || ''} onChange={e => setF('banco', e.target.value)} disabled={!!filtros.id_cuenta_bancaria}>
                  <option value="">Todos</option>
                  {bancosUnicos.map(b => <option key={b} value={b}>{b}</option>)}
                </select>
              </div>
            )}
            {tab.filtros.includes('moneda') && (
              <div>
                <label className="label">Moneda</label>
                <select className="select" value={filtros.moneda || ''} onChange={e => setF('moneda', e.target.value)} disabled={!!filtros.id_cuenta_bancaria}>
                  <option value="">Todas</option>
                  {monedasUnicas.map(m => <option key={m} value={m}>{m}</option>)}
                </select>
              </div>
            )}
            <div className="flex items-end"><button onClick={limpiarFiltros} className="btn-secondary w-full">Limpiar filtros</button></div>
          </div>
        </div>
      )}

      {tab.codigo === 'mantenimientos_vencidos' && (
        // Rango de fechas (inicio y fin en un mismo calendario) para acotar los
        // vencidos por su fecha programada. z-20 por el popover (ver nota abajo).
        <div className="card mb-4 relative z-20">
          <div className="p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <div className="lg:col-span-2">
              <label className="label">Rango de fechas (programadas)</label>
              <RangeCalendar
                desde={filtros.desde || ''}
                hasta={filtros.hasta || ''}
                onChange={({ desde, hasta }) => setFiltros(p => ({ ...p, desde: desde || undefined, hasta: hasta || undefined }))}
              />
            </div>
            <div className="flex items-end"><button onClick={limpiarFiltros} className="btn-secondary w-full">Limpiar filtros</button></div>
          </div>
        </div>
      )}

      {tab.codigo === 'mantenimientos_por_cliente' && (
        // z-20: cada .card crea su propio contexto de apilado (backdrop-blur),
        // así que elevamos el de filtros para que el popover del calendario
        // quede por encima de la tabla (card hermana posterior).
        <div className="card mb-4 relative z-20">
          <div className="p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <div>
              <label className="label">Cliente</label>
              <select className="select" value={filtros.id_cliente || ''} onChange={e => setF('id_cliente', e.target.value)}>
                <option value="">Todos</option>
                {clientes.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Rango de fechas (programadas)</label>
              <RangeCalendar
                desde={filtros.desde || ''}
                hasta={filtros.hasta || ''}
                onChange={({ desde, hasta }) => setFiltros(p => ({ ...p, desde: desde || undefined, hasta: hasta || undefined }))}
              />
            </div>
            <div className="flex items-end"><button onClick={limpiarFiltros} className="btn-secondary w-full">Limpiar filtros</button></div>
          </div>
        </div>
      )}

      <div ref={printRef}>
      {!loading && tab.codigo !== 'historial_tecnico_ascensor' && (
        (Array.isArray(data) && data.length > 0)
        || (tab.codigo === 'leads' && data?.leads?.length > 0)
        || (tab.codigo === 'ingresos_por_banco' && data?.grupos?.length > 0)
      ) && (
        <div className="card mb-4">
          <BloqueAnalitica codigo={tab.codigo} data={data} puedeVerPrecio={puedeVerPrecio} />
        </div>
      )}

      <div className="card">
        {loading ? <Loader /> : (
          <div className="overflow-x-auto scroll-thin">
            {tab.codigo === 'operativos' && Array.isArray(data) && <TablaOperativos data={datosTabla} puedeVerPrecio={puedeVerPrecio} />}
            {tab.codigo === 'servicios_finalizados' && Array.isArray(data) && <TablaServiciosFinalizados data={datosTabla} puedeVerPrecio={puedeVerPrecio} />}
            {tab.codigo === 'emergencias_atendidas' && Array.isArray(data) && <TablaEmergencias data={datosTabla} />}
            {tab.codigo === 'correctivos' && Array.isArray(data) && <TablaCorrectivos data={datosTabla} />}
            {tab.codigo === 'atenciones_rapidas' && Array.isArray(data) && <TablaAtencionesRapidas data={datosTabla} />}
            {tab.codigo === 'mantenimientos_cumplidos' && Array.isArray(data) && <TablaMantenimientosCumplidos data={datosTabla} puedeVerPrecio={puedeVerPrecio} />}
            {tab.codigo === 'mantenimientos_vencidos' && Array.isArray(data) && <TablaMantVencidos data={datosTabla} />}
            {tab.codigo === 'mantenimientos_por_cliente' && Array.isArray(data) && <TablaMantPorCliente data={datosTabla} />}
            {tab.codigo === 'mantenimientos_sin_servicio' && Array.isArray(data) && <TablaMantSinServicio data={datosTabla} puedeVerPrecio={puedeVerPrecio} />}
            {tab.codigo === 'pendientes_cobro' && Array.isArray(data) && <TablaPendientesCobro data={datosTabla} />}
            {tab.codigo === 'cobros_vencidos' && Array.isArray(data) && <TablaCobrosVencidos data={datosTabla} />}
            {tab.codigo === 'mora_cliente' && Array.isArray(data) && <TablaMora data={datosTabla} />}
            {tab.codigo === 'abonos' && Array.isArray(data) && <TablaAbonos data={datosTabla} />}
            {tab.codigo === 'ingresos_por_banco' && data?.grupos && <TablaIngresosPorBanco data={data} />}
            {(tab.codigo === 'facturados' || tab.codigo === 'no_facturados') && Array.isArray(data) && <TablaFact data={datosTabla} puedeVerPrecio={puedeVerPrecio} />}
            {tab.codigo === 'cobros' && Array.isArray(data) && <TablaCobros data={datosTabla} />}
            {tab.codigo === 'tecnicos' && Array.isArray(data) && <TablaTecnicos data={datosTabla} />}
            {tab.codigo === 'leads' && data?.leads && <BloqueLeads data={data} />}
            {tab.codigo === 'ascensores' && Array.isArray(data) && <TablaAscensores data={datosTabla} />}
            {tab.codigo === 'clientes_estado_edificios' && Array.isArray(data) && <TablaClientesEstadoEdificios data={datosTabla} />}
            {tab.codigo === 'historial_tecnico_ascensor' && (
              !filtros.id_ascensor
                ? <EmptyState title="Seleccione un ascensor" subtitle="Use el filtro para ver el historial técnico" />
                : data ? <HistorialAscensor data={data} puedeVerPrecio={puedeVerPrecio} /> : <EmptyState title="Sin datos" />
            )}
          </div>
        )}
        {/* Oculto durante la exportación: ahí la tabla se pinta completa. */}
        {!loading && esListaPaginable && !exportandoTabla && (
          <Pagination page={page} pageSize={pageSize} total={totalFilas} totalPages={totalPages}
            onPage={setPage} onPageSize={setPageSize} />
        )}
      </div>
      </div>

    </>
  );
}

function TablaOperativos({ data, puedeVerPrecio }) {
  if (data.length === 0) return <EmptyState title="Sin registros" />;
  return (
    <table className="table-base">
      <thead><tr>
        <th className="table-th">Código</th><th className="table-th">Cliente</th>
        <th className="table-th">Ascensor</th><th className="table-th">Tipo</th>
        <th className="table-th">Fecha</th><th className="table-th">Técnicos</th>
        <th className="table-th">Estado</th>
        {puedeVerPrecio && <th className="table-th text-right">Precio</th>}
        {puedeVerPrecio && <th className="table-th text-right">Cobrado</th>}
        {puedeVerPrecio && <th className="table-th text-right">Falta pagar</th>}
      </tr></thead>
      <tbody className="divide-y divide-slate-100">
        {data.map((s, idx) => (
          <tr key={s.id ?? `row-${idx}`}>
            <td className="table-td font-mono text-xs">{s.codigo}</td>
            <td className="table-td text-xs">{s.cliente?.nombre}</td>
            <td className="table-td font-mono text-xs" title={codigosAscensores(s).join(', ')}>{resumenAscensores(s)}</td>
            <td className="table-td text-xs">{s.tipo_servicio?.nombre}</td>
            <td className="table-td text-xs">{formatFecha(s.fecha_programada)}</td>
            <td className="table-td text-xs">{s.asignaciones?.map(a => a.tecnico?.nombre).join(', ') || '—'}</td>
            <td className="table-td"><span className={badgeEstado(s.estado_servicio)}>{s.estado_servicio}</span></td>
            {puedeVerPrecio && <td className="table-td text-right font-mono">{formatMonto(s.precio_interno, s.moneda)}</td>}
            {puedeVerPrecio && <td className="table-td text-right font-mono">{s.cobro ? formatMonto(s.cobro.total_abonado, s.cobro.moneda || s.moneda) : '—'}</td>}
            {puedeVerPrecio && <td className="table-td text-right font-mono">{s.cobro ? formatMonto(s.cobro.saldo_pendiente, s.cobro.moneda || s.moneda) : '—'}</td>}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function TablaServiciosFinalizados({ data, puedeVerPrecio }) {
  if (data.length === 0) return <EmptyState title="Sin servicios finalizados" />;
  return (
    <table className="table-base">
      <thead><tr>
        <th className="table-th">Realización</th><th className="table-th">Código</th>
        <th className="table-th">Cliente / Ascensor</th><th className="table-th">Tipo</th>
        <th className="table-th">Técnicos</th><th className="table-th">Estado admin</th>
        <th className="table-th">Cobro</th><th className="table-th">Factura</th>
        {puedeVerPrecio && <th className="table-th text-right">Precio</th>}
      </tr></thead>
      <tbody className="divide-y divide-slate-100">
        {data.map((r, idx) => (
          <tr key={r.id ?? `row-${idx}`}>
            <td className="table-td text-xs">{formatFecha(r.fecha_realizacion)}</td>
            <td className="table-td font-mono text-xs">{r.servicio?.codigo}</td>
            <td className="table-td text-xs"><div>{r.servicio?.cliente?.nombre}</div><div className="font-mono text-slate-500" title={codigosAscensores(r.servicio).join(', ')}>{resumenAscensores(r.servicio)}</div></td>
            <td className="table-td text-xs">{r.servicio?.tipo_servicio?.nombre}</td>
            <td className="table-td text-xs">{r.servicio?.asignaciones?.map(a => a.tecnico?.nombre).join(', ') || '—'}</td>
            <td className="table-td"><span className={badgeEstado(r.estado_administrativo)}>{r.estado_administrativo}</span></td>
            <td className="table-td"><span className={badgeEstado(r.estado_cobro)}>{r.estado_cobro}</span></td>
            <td className="table-td"><span className={badgeEstado(r.estado_facturacion)}>{r.estado_facturacion}</span></td>
            {puedeVerPrecio && <td className="table-td text-right font-mono">{formatMonto(r.servicio?.precio_interno, r.servicio?.moneda)}</td>}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function TablaEmergencias({ data }) {
  if (data.length === 0) return <EmptyState title="Sin emergencias" />;
  return (
    <table className="table-base">
      <thead><tr>
        <th className="table-th">Reportada</th><th className="table-th">Cliente</th>
        <th className="table-th">Ascensor</th><th className="table-th">Motivo</th>
        <th className="table-th">Urgencia</th><th className="table-th">Estado</th>
        <th className="table-th">Servicio</th><th className="table-th">Técnicos</th>
      </tr></thead>
      <tbody className="divide-y divide-slate-100">
        {data.map((e, idx) => (
          <tr key={e.id ?? `row-${idx}`}>
            <td className="table-td text-xs">{formatFechaHora(e.fecha_reporte)}</td>
            <td className="table-td text-xs">{e.cliente?.nombre}</td>
            <td className="table-td font-mono text-xs">{e.ascensor?.codigo}</td>
            <td className="table-td text-xs max-w-xs truncate">{e.motivo}</td>
            <td className="table-td"><span className={e.nivel_urgencia === 'alta' ? 'badge-red' : 'badge-amber'}>{e.nivel_urgencia}</span></td>
            <td className="table-td"><span className={badgeEstado(e.estado_emergencia)}>{e.estado_emergencia}</span></td>
            <td className="table-td font-mono text-xs">{e.servicio?.codigo || '—'}</td>
            <td className="table-td text-xs">{e.servicio?.asignaciones?.map(a => a.tecnico?.nombre).join(', ') || '—'}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function TablaCorrectivos({ data }) {
  if (data.length === 0) return <EmptyState title="Sin correctivos" />;
  return (
    <table className="table-base">
      <thead><tr>
        <th className="table-th">Reportado</th><th className="table-th">Cliente</th>
        <th className="table-th">Ascensor</th><th className="table-th">Motivo</th>
        <th className="table-th">Urgencia</th><th className="table-th">Estado</th>
        <th className="table-th">Servicio</th><th className="table-th">Técnicos</th>
      </tr></thead>
      <tbody className="divide-y divide-slate-100">
        {data.map((c, idx) => (
          <tr key={c.id ?? `row-${idx}`}>
            <td className="table-td text-xs">{formatFechaHora(c.fecha_reporte)}</td>
            <td className="table-td text-xs">{c.cliente?.nombre}</td>
            <td className="table-td font-mono text-xs">{c.ascensor?.codigo}</td>
            <td className="table-td text-xs max-w-xs truncate" title={c.falla}>{c.falla}</td>
            <td className="table-td"><span className={c.nivel_urgencia === 'alta' ? 'badge-red' : 'badge-amber'}>{c.nivel_urgencia}</span></td>
            <td className="table-td"><span className={badgeEstado(c.estado_correctivo)}>{c.estado_correctivo}</span></td>
            <td className="table-td font-mono text-xs">{c.servicio?.codigo || '—'}</td>
            <td className="table-td text-xs">{c.servicio?.asignaciones?.map(a => a.tecnico?.nombre).join(', ') || '—'}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function TablaAtencionesRapidas({ data }) {
  if (data.length === 0) return <EmptyState title="Sin atenciones rápidas" />;
  return (
    <table className="table-base">
      <thead><tr>
        <th className="table-th">Recibida</th><th className="table-th">Contacto</th>
        <th className="table-th">Teléfono</th><th className="table-th">Cliente</th>
        <th className="table-th">Ascensor</th><th className="table-th">Tipo solicitud</th>
        <th className="table-th">Urgencia</th><th className="table-th">Estado</th>
        <th className="table-th">Servicio</th>
      </tr></thead>
      <tbody className="divide-y divide-slate-100">
        {data.map((a, idx) => (
          <tr key={a.id ?? `row-${idx}`}>
            <td className="table-td text-xs">{formatFechaHora(a.date_time_registration)}</td>
            <td className="table-td text-xs">{a.nombre_contacto}</td>
            <td className="table-td font-mono text-xs">{a.telefono}</td>
            <td className="table-td text-xs">{a.cliente?.nombre || '—'}</td>
            <td className="table-td font-mono text-xs">{a.ascensor?.codigo || '—'}</td>
            <td className="table-td text-xs">{a.tipo_solicitud || '—'}</td>
            <td className="table-td"><span className={a.nivel_urgencia === 'alta' ? 'badge-red' : 'badge-amber'}>{a.nivel_urgencia}</span></td>
            <td className="table-td"><span className={badgeEstado(a.estado_atencion)}>{a.estado_atencion}</span></td>
            <td className="table-td font-mono text-xs">{a.id_servicio_convertido ? `#${a.id_servicio_convertido}` : '—'}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function TablaMantenimientosCumplidos({ data, puedeVerPrecio }) {
  if (data.length === 0) return <EmptyState title="Sin mantenimientos cumplidos" />;
  return (
    <table className="table-base">
      <thead><tr>
        <th className="table-th">Código</th><th className="table-th">Cliente</th>
        <th className="table-th">Ascensor</th><th className="table-th">Tipo</th>
        <th className="table-th">Fecha programada</th><th className="table-th">Frecuencia</th>
        <th className="table-th">Estado</th>{puedeVerPrecio && <th className="table-th text-right">Precio</th>}
      </tr></thead>
      <tbody className="divide-y divide-slate-100">
        {data.map((s, idx) => (
          <tr key={s.id ?? `row-${idx}`}>
            <td className="table-td font-mono text-xs">{s.codigo}</td>
            <td className="table-td text-xs">{s.cliente?.nombre}</td>
            <td className="table-td font-mono text-xs" title={codigosAscensores(s).join(', ')}>{resumenAscensores(s)}</td>
            <td className="table-td text-xs">{s.tipo_servicio?.nombre}</td>
            <td className="table-td text-xs">{formatFecha(s.fecha_programada)}</td>
            <td className="table-td text-xs">{s.mantenimiento_plan?.tipo_plan === 'eventual' ? 'Eventual' : (s.mantenimiento_plan?.frecuencia || '—')}</td>
            <td className="table-td"><span className={badgeEstado(s.estado_servicio)}>{s.estado_servicio}</span></td>
            {puedeVerPrecio && <td className="table-td text-right font-mono">{formatMonto(s.precio_interno, s.moneda)}</td>}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function TablaMantVencidos({ data }) {
  if (data.length === 0) return <EmptyState title="Sin mantenimientos vencidos" />;
  return (
    <table className="table-base">
      <thead><tr><th className="table-th">Código</th><th className="table-th">Cliente</th><th className="table-th">Ascensor</th><th className="table-th">Fecha programada</th><th className="table-th">Estado</th></tr></thead>
      <tbody className="divide-y divide-slate-100">
        {data.map((s, idx) => (
          <tr key={s.id ?? `row-${idx}`} className="row-vencido">
            <td className="table-td font-mono text-xs">{s.codigo}</td>
            <td className="table-td text-xs">{s.cliente?.nombre}</td>
            <td className="table-td font-mono text-xs" title={codigosAscensores(s).join(', ')}>{resumenAscensores(s)}</td>
            <td className="table-td text-xs">{formatFecha(s.fecha_programada)}</td>
            <td className="table-td"><span className={badgeEstado(s.estado_servicio)}>{s.estado_servicio}</span></td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function TablaMantPorCliente({ data }) {
  const [expandido, setExpandido] = useState(() => new Set());

  // Al cambiar el dataset (p. ej. al filtrar por cliente): si queda un solo
  // cliente se expande automáticamente; si hay varios, todos colapsados.
  useEffect(() => {
    setExpandido(data.length === 1 ? new Set([data[0].id_cliente]) : new Set());
  }, [data]);

  if (data.length === 0) return <EmptyState title="Sin planes de mantenimiento" subtitle="Ajuste el cliente o el rango de fechas." />;

  const toggle = (id) => setExpandido(prev => {
    const n = new Set(prev);
    if (n.has(id)) n.delete(id); else n.add(id);
    return n;
  });

  const etiquetaPlan = (plan) => plan.tipo_plan === 'eventual'
    ? 'Eventual'
    : `${plan.frecuencia || '—'} (continuo)`;

  return (
    <table className="table-base">
      <thead><tr>
        <th className="table-th">Cliente / Plan</th>
        <th className="table-th text-center">Programados</th>
        <th className="table-th text-center">Realizados</th>
        <th className="table-th text-center">Faltan</th>
        <th className="table-th text-center">En curso</th>
        <th className="table-th text-center">Cancelados</th>
        <th className="table-th text-center">Gratuitos</th>
      </tr></thead>
      <tbody className="divide-y divide-slate-100">
        {data.map((cli, idx) => {
          const abierto = expandido.has(cli.id_cliente);
          return (
            <Fragment key={`${cli.id_cliente ?? cli.cliente_nombre}-${idx}`}>
              <tr className="bg-slate-50 cursor-pointer table-row-hover" onClick={() => toggle(cli.id_cliente)}>
                <td className="table-td text-xs font-medium text-slate-800">
                  <span className="inline-block w-4 text-slate-400">{abierto ? '▾' : '▸'}</span>
                  {cli.cliente_nombre}
                  <span className="ml-2 font-normal text-slate-400">{cli.planes_total} plan(es)</span>
                </td>
                <td className="table-td text-center font-mono text-xs">{cli.programados}</td>
                <td className="table-td text-center font-mono text-xs text-emerald-700">{cli.realizados}</td>
                <td className="table-td text-center font-mono text-xs text-amber-700">{cli.faltan}</td>
                <td className="table-td text-center font-mono text-xs">{cli.en_curso}</td>
                <td className="table-td text-center font-mono text-xs text-slate-500">{cli.cancelados}</td>
                <td className="table-td text-center text-xs text-slate-400">—</td>
              </tr>
              {(cli.planes || []).map(plan => (
                <tr key={`${cli.id_cliente}-${plan.id_plan}`} className={abierto ? '' : 'hidden'}>
                  <td className="table-td text-xs pl-8">
                    <div className="font-mono text-slate-700">{plan.ascensor_codigo || '—'}</div>
                    <div className="text-slate-500">
                      {plan.tipo_servicio || '—'} · {etiquetaPlan(plan)}
                      {plan.ascensor_ubicacion ? ` · ${plan.ascensor_ubicacion}` : ''}
                    </div>
                  </td>
                  <td className="table-td text-center font-mono text-xs">{plan.programados}</td>
                  <td className="table-td text-center font-mono text-xs text-emerald-700">{plan.realizados}</td>
                  <td className="table-td text-center font-mono text-xs text-amber-700">{plan.faltan}</td>
                  <td className="table-td text-center font-mono text-xs">{plan.en_curso}</td>
                  <td className="table-td text-center font-mono text-xs text-slate-500">{plan.cancelados}</td>
                  <td className="table-td text-center font-mono text-xs">{plan.gratuitos_ejecutados}/{plan.gratuitos_cupo}</td>
                </tr>
              ))}
            </Fragment>
          );
        })}
      </tbody>
    </table>
  );
}

function TablaMantSinServicio({ data, puedeVerPrecio }) {
  if (data.length === 0) return <EmptyState title="Sin mantenimientos programados sin servicio" subtitle="Todos los eventos programados ya tienen servicio creado." />;
  return (
    <table className="table-base">
      <thead><tr>
        <th className="table-th">Fecha programada</th>
        <th className="table-th">Cliente</th>
        <th className="table-th">Ascensor</th>
        <th className="table-th">Tipo de servicio</th>
        <th className="table-th">Plan</th>
        {puedeVerPrecio && <th className="table-th text-right">Precio</th>}
        <th className="table-th text-center">Estado</th>
      </tr></thead>
      <tbody className="divide-y divide-slate-100">
        {data.map((e, idx) => (
          <tr key={`${e.id_evento ?? 'sin'}-${idx}`} className={e.vencido ? 'row-vencido' : ''}>
            <td className="table-td text-xs">{formatFecha(e.fecha_programada)}</td>
            <td className="table-td text-xs">{e.cliente?.nombre || '—'}</td>
            <td className="table-td text-xs">
              <div className="font-mono">{e.ascensor?.codigo || '—'}</div>
              {e.ascensor?.ubicacion && <div className="text-slate-500">{e.ascensor.ubicacion}</div>}
            </td>
            <td className="table-td text-xs">{e.tipo_servicio?.nombre || '—'}</td>
            <td className="table-td text-xs capitalize">{e.tipo_plan || '—'}{e.frecuencia ? ` · ${e.frecuencia}` : ''}</td>
            {puedeVerPrecio && <td className="table-td text-right font-mono text-xs">{formatMonto(e.precio, e.moneda)}</td>}
            <td className="table-td text-center text-xs">
              {e.vencido
                ? <span className="badge-red text-[10px]">Vencido sin crear</span>
                : <span className="badge-amber text-[10px]">Programado</span>}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function TablaPendientesCobro({ data }) {
  if (data.length === 0) return <EmptyState title="Sin pendientes de cobro" />;
  return (
    <table className="table-base">
      <thead><tr>
        <th className="table-th">Cliente</th><th className="table-th">Servicio</th>
        <th className="table-th">Tipo</th><th className="table-th text-right">Monto</th>
        <th className="table-th text-right">Saldo</th><th className="table-th">Estado cobro</th>
      </tr></thead>
      <tbody className="divide-y divide-slate-100">
        {data.map((c, idx) => (
          <tr key={c.id ?? `row-${idx}`}>
            <td className="table-td text-xs">{c.cliente?.nombre}</td>
            <td className="table-td font-mono text-xs">{c.servicio?.codigo}</td>
            <td className="table-td text-xs">{c.servicio?.tipo_servicio?.nombre || '—'}</td>
            <td className="table-td text-right font-mono">{formatMonto(c.monto_total, c.moneda)}</td>
            <td className="table-td text-right font-mono text-rose-700">{formatMonto(c.saldo_pendiente, c.moneda)}</td>
            <td className="table-td"><span className={badgeEstado(c.estado_cobro)}>{c.estado_cobro}</span></td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function TablaCobrosVencidos({ data }) {
  if (data.length === 0) return <EmptyState title="Sin cobros vencidos" />;
  return (
    <table className="table-base">
      <thead><tr>
        <th className="table-th">Cliente</th><th className="table-th">Servicio</th>
        <th className="table-th">Vencimiento</th><th className="table-th text-center">Días vencido</th>
        <th className="table-th text-right">Saldo</th><th className="table-th">Estado</th>
      </tr></thead>
      <tbody className="divide-y divide-slate-100">
        {data.map((c, idx) => (
          <tr key={c.id ?? `row-${idx}`} className={c.en_mora ? 'row-vencido' : ''}>
            <td className="table-td text-xs">{c.cliente?.nombre}</td>
            <td className="table-td font-mono text-xs">{c.servicio?.codigo}</td>
            <td className="table-td text-xs">{formatFecha(c.fecha_proximo_abono)}</td>
            <td className="table-td text-center"><span className={c.en_mora ? 'text-rose-700 font-semibold' : 'text-amber-700'}>{c.dias_vencido}</span></td>
            <td className="table-td text-right font-mono text-rose-700">{formatMonto(c.saldo_pendiente, c.moneda)}</td>
            <td className="table-td">{c.en_mora ? <span className="badge-red">En mora</span> : <span className="badge-amber">Vencido</span>}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function TablaCobros({ data }) {
  if (data.length === 0) return <EmptyState title="Sin cobros" />;
  return (
    <table className="table-base">
      <thead><tr><th className="table-th">Cliente</th><th className="table-th">Servicio</th><th className="table-th text-right">Total</th><th className="table-th text-right">Abonado</th><th className="table-th text-right">Saldo</th><th className="table-th">Estado</th></tr></thead>
      <tbody className="divide-y divide-slate-100">
        {data.map((c, idx) => (
          <tr key={c.id ?? `row-${idx}`}>
            <td className="table-td text-xs">{c.cliente?.nombre}</td>
            <td className="table-td font-mono text-xs">{c.servicio?.codigo}</td>
            <td className="table-td text-right font-mono">{formatMonto(c.monto_total, c.moneda)}</td>
            <td className="table-td text-right font-mono text-emerald-700">{formatMonto(c.total_abonado, c.moneda)}</td>
            <td className="table-td text-right font-mono text-rose-700">{formatMonto(c.saldo_pendiente, c.moneda)}</td>
            <td className="table-td"><span className={badgeEstado(c.estado_cobro)}>{c.estado_cobro}</span></td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function TablaMora({ data }) {
  if (data.length === 0) return <EmptyState title="Sin clientes en mora" />;
  return (
    <table className="table-base">
      <thead><tr><th className="table-th">Cliente</th><th className="table-th text-center">Casos</th><th className="table-th text-right">Saldo total</th><th className="table-th">Detalle</th></tr></thead>
      <tbody className="divide-y divide-slate-100">
        {data.map((g, idx) => (
          <tr key={idx}>
            <td className="table-td">{g.cliente?.nombre}</td>
            <td className="table-td text-center">{g.casos}</td>
            <td className="table-td text-right font-mono font-medium text-rose-700">{formatMonto(g.total_saldo)}</td>
            <td className="table-td text-xs">{(g.servicios || []).map(s => `${s.codigo} (${formatMonto(s.saldo)})`).join(' · ')}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function TablaFact({ data, puedeVerPrecio }) {
  if (data.length === 0) return <EmptyState title="Sin registros" />;
  return (
    <table className="table-base">
      <thead><tr><th className="table-th">Código</th><th className="table-th">Cliente</th><th className="table-th">Fecha</th>{puedeVerPrecio && <th className="table-th text-right">Precio</th>}<th className="table-th">Estado factura</th></tr></thead>
      <tbody className="divide-y divide-slate-100">
        {data.map((r, i) => (
          <tr key={r.id != null ? `r-${r.id}-${i}` : `idx-${i}`}>
            <td className="table-td font-mono text-xs">{r.servicio?.codigo}</td>
            <td className="table-td text-xs">{r.servicio?.cliente?.nombre}</td>
            <td className="table-td text-xs">{formatFecha(r.fecha_realizacion)}</td>
            {puedeVerPrecio && <td className="table-td text-right font-mono">{formatMonto(r.servicio?.precio_interno, r.servicio?.moneda)}</td>}
            <td className="table-td"><span className={badgeEstado(r.estado_facturacion)}>{r.estado_facturacion}</span></td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function TablaAbonos({ data }) {
  if (data.length === 0) return <EmptyState title="Sin abonos" />;
  return (
    <table className="table-base">
      <thead><tr><th className="table-th">Fecha</th><th className="table-th">Cliente</th><th className="table-th">Servicio</th><th className="table-th">Método</th><th className="table-th text-right">Monto</th></tr></thead>
      <tbody className="divide-y divide-slate-100">
        {data.map((p, idx) => (
          <tr key={p.id ?? `row-${idx}`}>
            <td className="table-td text-xs">{formatFecha(p.fecha_pago)}</td>
            <td className="table-td text-xs">{p.cobro?.cliente?.nombre}</td>
            <td className="table-td font-mono text-xs">{p.cobro?.servicio?.codigo}</td>
            <td className="table-td text-xs">{p.metodo_pago}</td>
            <td className="table-td text-right font-mono text-emerald-700">{formatMonto(p.monto)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function TablaIngresosPorBanco({ data }) {
  const grupos = data?.grupos || [];
  if (grupos.length === 0) return <EmptyState title="Sin ingresos en el rango seleccionado" />;
  return (
    <table className="table-base">
      <thead><tr>
        <th className="table-th">Banco / Cuenta</th>
        <th className="table-th">Tipo</th>
        <th className="table-th">N° Cuenta</th>
        <th className="table-th">Titular</th>
        <th className="table-th text-center">Moneda</th>
        <th className="table-th text-center">Pagos</th>
        <th className="table-th text-right">Total recibido</th>
        <th className="table-th">Detalle</th>
      </tr></thead>
      <tbody className="divide-y divide-slate-100">
        {grupos.map((g, idx) => (
          <tr key={g.id_cuenta != null ? `c-${g.id_cuenta}` : `s-${g.metodo_pago}-${idx}`} className={g.id_cuenta == null ? 'bg-slate-50/60' : ''}>
            <td className="table-td text-xs">
              <div className="font-medium text-slate-800">{g.etiqueta}</div>
            </td>
            <td className="table-td text-xs">{g.tipo_cuenta || '—'}</td>
            <td className="table-td font-mono text-xs">{g.numero_cuenta || '—'}{g.cci ? <div className="text-slate-400 text-[10px]">CCI: {g.cci}</div> : null}</td>
            <td className="table-td text-xs">{g.titular || '—'}</td>
            <td className="table-td text-center text-xs">{g.moneda || '—'}</td>
            <td className="table-td text-center font-mono text-xs">{g.cantidad_pagos}</td>
            <td className="table-td text-right font-mono font-semibold text-emerald-700">{formatMonto(g.total, g.moneda || 'PEN')}</td>
            <td className="table-td text-xs">
              <details>
                <summary className="cursor-pointer text-brand-600 hover:underline">Ver pagos ({g.pagos.length})</summary>
                <table className="mt-2 w-full">
                  <thead><tr className="text-[10px] text-slate-500">
                    <th className="text-left py-1">Fecha</th>
                    <th className="text-left py-1">Cliente</th>
                    <th className="text-left py-1">Servicio</th>
                    <th className="text-left py-1">Método</th>
                    <th className="text-right py-1">Monto</th>
                  </tr></thead>
                  <tbody>
                    {g.pagos.map(p => (
                      <tr key={p.id} className="border-t border-slate-100">
                        <td className="py-1 text-[11px]">{formatFecha(p.fecha_pago)}</td>
                        <td className="py-1 text-[11px]">{p.cliente?.nombre || '—'}</td>
                        <td className="py-1 font-mono text-[11px]">{p.servicio?.codigo || '—'}</td>
                        <td className="py-1 text-[11px]">{p.metodo_pago}</td>
                        <td className="py-1 text-right font-mono text-[11px] text-emerald-700">{formatMonto(p.monto, g.moneda || 'PEN')}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </details>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function TablaTecnicos({ data }) {
  if (data.length === 0) return <EmptyState title="Sin técnicos" />;
  return (
    <table className="table-base">
      <thead><tr><th className="table-th">Técnico</th><th className="table-th">Estado</th><th className="table-th text-center">Asignados</th><th className="table-th text-center">En curso</th><th className="table-th text-center">Finalizados</th></tr></thead>
      <tbody className="divide-y divide-slate-100">
        {data.map((t, idx) => (
          <tr key={t.id ?? `row-${idx}`}>
            <td className="table-td">{t.nombre}</td>
            <td className="table-td"><span className={badgeEstado(t.estado_operativo)}>{t.estado_operativo}</span></td>
            <td className="table-td text-center">{t.asignados}</td>
            <td className="table-td text-center">{t.enCurso}</td>
            <td className="table-td text-center">{t.finalizados}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function BloqueLeads({ data }) {
  return (
    <>
      <div className="p-4 grid grid-cols-2 sm:grid-cols-4 gap-3 border-b border-slate-100">
        <Card label="Total" value={data.total} />
        <Card label="Convertidos" value={data.convertidos} />
        <Card label="Descartados" value={data.descartados} />
        {Object.entries(data.porCanal || {}).slice(0, 1).map(([k, v]) => <Card key={k} label={k} value={v} />)}
      </div>
      <table className="table-base">
        <thead><tr><th className="table-th">Contacto</th><th className="table-th">Canal</th><th className="table-th">Estado</th></tr></thead>
        <tbody className="divide-y divide-slate-100">
          {data.leads.map((l, idx) => (
            <tr key={l.id ?? `row-${idx}`}>
              <td className="table-td text-xs">{l.nombre_contacto}</td>
              <td className="table-td text-xs">{l.canal}</td>
              <td className="table-td"><span className={badgeEstado(l.estado_lead)}>{l.estado_lead}</span></td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}

function TablaAscensores({ data }) {
  if (data.length === 0) return <EmptyState title="Sin ascensores" />;
  return (
    <table className="table-base">
      <thead><tr><th className="table-th">Código</th><th className="table-th">Cliente</th><th className="table-th">Estado</th><th className="table-th text-center">Servicios</th><th className="table-th text-center">Emergencias</th></tr></thead>
      <tbody className="divide-y divide-slate-100">
        {data.map((a, idx) => (
          <tr key={a.id ?? `row-${idx}`}>
            <td className="table-td font-mono text-xs">{a.codigo}</td>
            <td className="table-td text-xs">{a.cliente?.nombre}</td>
            <td className="table-td"><span className={badgeEstado(a.estado_operativo)}>{a.estado_operativo}</span></td>
            <td className="table-td text-center">{a._count?.servicios || 0}</td>
            <td className="table-td text-center">{a._count?.emergencias || 0}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

// Etiqueta + color por grupo de estado de edificios (alineado con el backend).
const GRUPO_EDIFICIOS_META = {
  activos: { label: 'Con edificios activos', clase: 'bg-emerald-100 text-emerald-700' },
  inactivos: { label: 'Con edificios inactivos', clase: 'bg-rose-100 text-rose-700' },
  mixto: { label: 'Mixto', clase: 'bg-amber-100 text-amber-700' },
  sin_edificios: { label: 'Sin edificios', clase: 'bg-slate-100 text-slate-600' }
};

function TablaClientesEstadoEdificios({ data }) {
  if (data.length === 0) return <EmptyState title="Sin clientes" />;
  return (
    <table className="table-base">
      <thead><tr>
        <th className="table-th">Cliente</th>
        <th className="table-th">Estado</th>
        <th className="table-th text-center">Activos</th>
        <th className="table-th text-center">Inactivos</th>
        <th className="table-th text-center">Total</th>
      </tr></thead>
      <tbody className="divide-y divide-slate-100">
        {data.map((r, idx) => {
          const meta = GRUPO_EDIFICIOS_META[r.grupo] || GRUPO_EDIFICIOS_META.sin_edificios;
          return (
            <tr key={r.cliente?.id ?? `row-${idx}`}>
              <td className="table-td">{r.cliente?.nombre}</td>
              <td className="table-td"><span className={`badge ${meta.clase}`}>{meta.label}</span></td>
              <td className="table-td text-center text-emerald-700">{r.activos}</td>
              <td className="table-td text-center text-rose-700">{r.inactivos}</td>
              <td className="table-td text-center font-medium">{r.total}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function HistorialAscensor({ data, puedeVerPrecio }) {
  const { ascensor, servicios, emergencias, mantenimientos, eventos } = data;
  return (
    <div className="p-4 space-y-5">
      <div className="grid sm:grid-cols-2 gap-3">
        <Card label="Ascensor" value={ascensor.codigo} />
        <Card label="Cliente" value={ascensor.cliente?.nombre} />
        <Card label="Tipo" value={`${ascensor.tipo || '—'} · ${ascensor.marca || ''} ${ascensor.modelo || ''}`} />
        <Card label="Estado" value={ascensor.estado_operativo} />
      </div>

      <div>
        <h4 className="font-medium text-slate-800 mb-2">Servicios ({servicios.length})</h4>
        <table className="table-base">
          <thead><tr>
            <th className="table-th">Código</th><th className="table-th">Tipo</th>
            <th className="table-th">Fecha</th><th className="table-th">Técnicos</th>
            <th className="table-th">Estado</th><th className="table-th text-center">Guías</th>
            <th className="table-th text-center">Evid.</th>
            {puedeVerPrecio && <th className="table-th text-right">Precio</th>}
          </tr></thead>
          <tbody className="divide-y divide-slate-100">
            {servicios.length === 0 && <tr><td colSpan="8" className="table-td text-center text-slate-400 py-4">Sin servicios</td></tr>}
            {servicios.map((s, idx) => (
              <tr key={s.id ?? `row-${idx}`}>
                <td className="table-td font-mono text-xs">{s.codigo}</td>
                <td className="table-td text-xs">{s.tipo_servicio?.nombre}</td>
                <td className="table-td text-xs">{formatFecha(s.fecha_programada)}</td>
                <td className="table-td text-xs">{s.asignaciones?.map(a => a.tecnico?.nombre).join(', ') || '—'}</td>
                <td className="table-td"><span className={badgeEstado(s.estado_servicio)}>{s.estado_servicio}</span></td>
                <td className="table-td text-center">{s.guias?.length || 0}</td>
                <td className="table-td text-center">{s.evidencias?.length || 0}</td>
                {puedeVerPrecio && <td className="table-td text-right font-mono">{formatMonto(s.precio_interno, s.moneda)}</td>}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div>
        <h4 className="font-medium text-slate-800 mb-2">Emergencias ({emergencias.length})</h4>
        {emergencias.length === 0 ? <p className="text-sm text-slate-500">Sin emergencias</p> : (
          <ul className="space-y-1 text-sm">
            {emergencias.map((e, idx) => <li key={e.id ?? `row-${idx}`} className="text-xs text-slate-600">{formatFechaHora(e.fecha_reporte)} · {e.motivo} <span className={badgeEstado(e.estado_emergencia)}>{e.estado_emergencia}</span></li>)}
          </ul>
        )}
      </div>

      <div>
        <h4 className="font-medium text-slate-800 mb-2">Mantenimientos ({mantenimientos.length})</h4>
        {mantenimientos.length === 0 ? <p className="text-sm text-slate-500">Sin planes</p> : (
          <ul className="space-y-1 text-sm">
            {mantenimientos.map((m, idx) => <li key={m.id ?? `row-${idx}`} className="text-xs text-slate-600">{m.tipo_plan === 'eventual' ? 'Eventual' : `${m.frecuencia} (${m.tipo_plan})`} · Próximo: {formatFecha(m.fecha_inicio)} · <span className={badgeEstado(m.estado_plan)}>{m.estado_plan}</span></li>)}
          </ul>
        )}
      </div>

      <div>
        <h4 className="font-medium text-slate-800 mb-2">Línea de tiempo ({eventos.length})</h4>
        <ol className="space-y-1 max-h-72 overflow-y-auto scroll-thin">
          {eventos.map((h, idx) => (
            <li key={h.id ?? `row-${idx}`} className="flex gap-3 text-xs">
              <span className="h-2 w-2 rounded-full bg-brand-400 mt-1.5 shrink-0" />
              <div>
                <div className="text-slate-700">{h.descripcion}</div>
                <div className="text-slate-400">{formatFechaHora(h.fecha_evento)} · {h.tipo_evento}</div>
              </div>
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}

function Card({ label, value }) {
  return (
    <div className="rounded-lg bg-slate-50 p-3">
      <div className="text-[10px] uppercase tracking-wider text-slate-500">{label}</div>
      <div className="text-xl font-semibold text-slate-800">{value}</div>
    </div>
  );
}

// Paleta de marca (teal + ember + carbon) — alineada 1:1 con la exportación PDF
const CHART_COLORS = ['#4d8093', '#e8853a', '#365867', '#ad5826', '#94b8c5', '#f0b357', '#564f3f', '#283e49'];
const MESES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

function groupCount(arr, keyFn) {
  const m = new Map();
  arr.forEach(it => {
    const k = keyFn(it);
    if (k === null || k === undefined || k === '') return;
    m.set(k, (m.get(k) || 0) + 1);
  });
  return [...m.entries()].map(([label, value]) => ({ label: String(label), value }));
}

function groupSum(arr, keyFn, valFn) {
  const m = new Map();
  arr.forEach(it => {
    const k = keyFn(it);
    if (k === null || k === undefined || k === '') return;
    const v = Number(valFn(it)) || 0;
    m.set(k, (m.get(k) || 0) + v);
  });
  return [...m.entries()].map(([label, value]) => ({ label: String(label), value }));
}

function topN(items, n = 5) {
  return [...items].sort((a, b) => b.value - a.value).slice(0, n);
}

function ultimosMeses(arr, dateFn, valFn, n = 6) {
  const now = new Date();
  const buckets = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    buckets.push({ key: `${d.getFullYear()}-${d.getMonth()}`, label: `${MESES[d.getMonth()]} ${String(d.getFullYear()).slice(-2)}`, value: 0 });
  }
  const idx = new Map(buckets.map((b, i) => [b.key, i]));
  arr.forEach(it => {
    const raw = dateFn(it);
    if (!raw) return;
    const d = new Date(raw);
    if (isNaN(d)) return;
    const k = `${d.getFullYear()}-${d.getMonth()}`;
    if (idx.has(k)) buckets[idx.get(k)].value += valFn ? Number(valFn(it)) || 0 : 1;
  });
  return buckets.map(b => ({ label: b.label, value: b.value }));
}

function PieChart({ data, title, formatValue }) {
  const total = data.reduce((s, d) => s + d.value, 0);
  const fmt = formatValue || (v => v);
  if (total === 0) return (
    <div>
      <h5 className="text-sm font-medium text-slate-700 mb-2">{title}</h5>
      <p className="text-xs text-slate-400">Sin datos suficientes</p>
    </div>
  );
  let acc = 0;
  const cx = 90, cy = 90, r = 80;
  return (
    <div>
      <h5 className="text-sm font-medium text-slate-700 mb-3">{title}</h5>
      <div className="flex items-center gap-4 flex-wrap">
        <svg viewBox="0 0 180 180" width="180" height="180" className="shrink-0">
          {data.length === 1 ? (
            <circle cx={cx} cy={cy} r={r} fill={CHART_COLORS[0]} />
          ) : data.map((d, i) => {
            if (d.value === 0) return null;
            const start = (acc / total) * Math.PI * 2;
            acc += d.value;
            const end = (acc / total) * Math.PI * 2;
            const x1 = cx + r * Math.sin(start);
            const y1 = cy - r * Math.cos(start);
            const x2 = cx + r * Math.sin(end);
            const y2 = cy - r * Math.cos(end);
            const large = (end - start) > Math.PI ? 1 : 0;
            const color = CHART_COLORS[i % CHART_COLORS.length];
            return <path key={i} d={`M${cx},${cy} L${x1},${y1} A${r},${r} 0 ${large},1 ${x2},${y2} Z`} fill={color} />;
          })}
          <circle cx={cx} cy={cy} r={32} fill="white" />
          <text x={cx} y={cy - 2} textAnchor="middle" className="fill-slate-700" style={{ fontSize: 14, fontWeight: 600 }}>{data.length}</text>
          <text x={cx} y={cy + 12} textAnchor="middle" className="fill-slate-400" style={{ fontSize: 9 }}>categorías</text>
        </svg>
        <ul className="text-xs space-y-1 min-w-0 flex-1">
          {data.map((d, i) => (
            <li key={i} className="flex items-center gap-2">
              <span className="inline-block w-3 h-3 rounded shrink-0" style={{ background: CHART_COLORS[i % CHART_COLORS.length] }} />
              <span className="text-slate-700 truncate">{d.label}</span>
              <span className="text-slate-500 font-mono ml-auto whitespace-nowrap">{fmt(d.value)} · {Math.round(d.value / total * 100)}%</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function BarChart({ data, title, formatValue }) {
  const max = Math.max(...data.map(d => d.value), 0);
  const fmt = formatValue || (v => v);
  if (max === 0) return (
    <div>
      <h5 className="text-sm font-medium text-slate-700 mb-2">{title}</h5>
      <p className="text-xs text-slate-400">Sin datos suficientes</p>
    </div>
  );
  return (
    <div>
      <h5 className="text-sm font-medium text-slate-700 mb-3">{title}</h5>
      <ul className="space-y-2">
        {data.map((d, i) => (
          <li key={i}>
            <div className="flex justify-between text-xs mb-0.5">
              <span className="text-slate-700 truncate max-w-[60%]" title={d.label}>{d.label}</span>
              <span className="text-slate-600 font-mono">{fmt(d.value)}</span>
            </div>
            <div className="h-2.5 bg-slate-100 rounded overflow-hidden">
              <div className="h-full rounded transition-all" style={{ width: `${(d.value / max) * 100}%`, background: CHART_COLORS[i % CHART_COLORS.length] }} />
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

function AnalisisLista({ items, title = 'Análisis' }) {
  if (!items || items.length === 0) return null;
  return (
    <div>
      <h5 className="text-sm font-medium text-slate-700 mb-3">{title}</h5>
      <ul className="text-xs space-y-1.5">
        {items.map((it, i) => (
          <li key={i} className="flex gap-2">
            <span className="text-brand-500 shrink-0">▸</span>
            <span className="text-slate-700">{it}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function BloqueAnalitica({ codigo, data, puedeVerPrecio }) {
  const cfg = useMemo(() => buildAnalitica(codigo, data, puedeVerPrecio), [codigo, data, puedeVerPrecio]);
  if (!cfg) return null;
  return (
    <div className="p-4">
      <div className="text-xs uppercase tracking-wider text-slate-500 mb-3">Resumen analítico</div>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {cfg.pie ? <PieChart {...cfg.pie} /> : <div />}
        {cfg.bar ? <BarChart {...cfg.bar} /> : <div />}
        <AnalisisLista items={cfg.analisis} />
      </div>
    </div>
  );
}

function pct(n, total) {
  return total > 0 ? Math.round((n / total) * 100) : 0;
}

function buildAnalitica(codigo, data, puedeVerPrecio) {
  if (codigo === 'operativos') {
    const total = data.length;
    const porEstado = topN(groupCount(data, s => s.estado_servicio || 'Sin estado'), 8);
    const porCliente = topN(groupCount(data, s => s.cliente?.nombre || 'Sin cliente'), 5);
    const porTipo = topN(groupCount(data, s => s.tipo_servicio?.nombre || 'Sin tipo'), 1);
    const finalizados = data.filter(s => /finaliz|cerrad|cobrad|facturad/i.test(s.estado_servicio || '')).length;
    const cancelados = data.filter(s => /cancel/i.test(s.estado_servicio || '')).length;
    const monto = puedeVerPrecio ? data.reduce((s, x) => s + (Number(x.precio_interno) || 0), 0) : null;
    // Totales financieros desde el cobro (misma fuente que Gestión de cobros).
    const cobrado = puedeVerPrecio ? data.reduce((s, x) => s + (Number(x.cobro?.total_abonado) || 0), 0) : null;
    const porCobrar = puedeVerPrecio ? data.reduce((s, x) => s + (Number(x.cobro?.saldo_pendiente) || 0), 0) : null;
    return {
      pie: { title: 'Servicios por estado', data: porEstado },
      bar: { title: 'Top 5 clientes (cantidad)', data: porCliente },
      analisis: [
        `Total de servicios: ${total}`,
        porTipo[0] ? `Tipo más frecuente: ${porTipo[0].label} (${porTipo[0].value})` : null,
        porCliente[0] ? `Cliente con más servicios: ${porCliente[0].label} (${porCliente[0].value})` : null,
        `Finalizados: ${finalizados} (${pct(finalizados, total)}%)`,
        cancelados > 0 ? `Cancelados: ${cancelados} (${pct(cancelados, total)}%)` : null,
        monto !== null ? `Monto acumulado: ${formatMonto(monto)}` : null,
        cobrado !== null ? `Total cobrado: ${formatMonto(cobrado)}` : null,
        porCobrar !== null ? `Total por cobrar: ${formatMonto(porCobrar)}` : null
      ].filter(Boolean)
    };
  }

  if (codigo === 'servicios_finalizados') {
    const total = data.length;
    const porFact = groupCount(data, r => r.estado_facturacion || 'Sin estado');
    const porMes = ultimosMeses(data, r => r.fecha_realizacion);
    const facturados = data.filter(r => esFacturado(r.estado_facturacion)).length;
    const monto = puedeVerPrecio ? data.reduce((s, r) => s + (Number(r.servicio?.precio_interno) || 0), 0) : null;
    const mesPico = [...porMes].sort((a, b) => b.value - a.value)[0];
    const porTipo = topN(groupCount(data, r => r.servicio?.tipo_servicio?.nombre || 'Sin tipo'), 1);
    return {
      pie: { title: 'Estado de facturación', data: porFact },
      bar: { title: 'Servicios por mes (últimos 6)', data: porMes },
      analisis: [
        `Total finalizados: ${total}`,
        `Facturados: ${facturados} (${pct(facturados, total)}%)`,
        mesPico && mesPico.value > 0 ? `Mes pico: ${mesPico.label} (${mesPico.value} servicios)` : null,
        porTipo[0] ? `Tipo predominante: ${porTipo[0].label}` : null,
        monto !== null ? `Monto total: ${formatMonto(monto)}` : null
      ].filter(Boolean)
    };
  }

  if (codigo === 'emergencias_atendidas') {
    const total = data.length;
    const porEstado = groupCount(data, e => e.estado_emergencia || 'Sin estado');
    const porUrg = groupCount(data, e => e.nivel_urgencia || 'Sin urgencia');
    const alta = data.filter(e => e.nivel_urgencia === 'alta').length;
    const atendidas = data.filter(e => /atend|cerrad/i.test(e.estado_emergencia || '')).length;
    const porCliente = topN(groupCount(data, e => e.cliente?.nombre || 'Sin cliente'), 1);
    return {
      pie: { title: 'Emergencias por estado', data: porEstado },
      bar: { title: 'Por nivel de urgencia', data: porUrg },
      analisis: [
        `Total emergencias: ${total}`,
        `Urgencia alta: ${alta} (${pct(alta, total)}%)`,
        `Atendidas/cerradas: ${atendidas} (${pct(atendidas, total)}%)`,
        porCliente[0] ? `Cliente con más reportes: ${porCliente[0].label} (${porCliente[0].value})` : null
      ].filter(Boolean)
    };
  }

  if (codigo === 'mantenimientos_cumplidos') {
    const total = data.length;
    const keyFrec = s => s.mantenimiento_plan?.tipo_plan === 'eventual'
      ? 'Eventual'
      : (s.mantenimiento_plan?.frecuencia || 'Sin frecuencia');
    const porFrec = groupCount(data, keyFrec);
    const porCliente = topN(groupCount(data, s => s.cliente?.nombre || 'Sin cliente'), 5);
    const monto = puedeVerPrecio ? data.reduce((s, x) => s + (Number(x.precio_interno) || 0), 0) : null;
    // Cuánto se facturó por cada frecuencia de mantenimiento (suma del monto de
    // los mantenimientos cumplidos, agrupados por su frecuencia de plan).
    const facturadoPorFrec = puedeVerPrecio
      ? topN(groupSum(data, keyFrec, s => s.precio_interno), 12)
      : null;
    return {
      pie: { title: 'Por frecuencia de plan (cantidad)', data: porFrec },
      bar: facturadoPorFrec
        ? { title: 'Facturado por frecuencia', data: facturadoPorFrec, formatValue: v => formatMonto(v) }
        : { title: 'Top 5 clientes', data: porCliente },
      analisis: [
        `Total mantenimientos: ${total}`,
        porCliente[0] ? `Cliente líder: ${porCliente[0].label} (${porCliente[0].value})` : null,
        porFrec[0] ? `Frecuencia más común: ${porFrec[0].label}` : null,
        monto !== null ? `Monto facturado total: ${formatMonto(monto)}` : null,
        // Desglose explícito del facturado por cada frecuencia.
        ...(facturadoPorFrec || []).map(f => `Facturado ${f.label}: ${formatMonto(f.value)}`)
      ].filter(Boolean)
    };
  }

  if (codigo === 'mantenimientos_vencidos') {
    const total = data.length;
    const porCliente = topN(groupCount(data, s => s.cliente?.nombre || 'Sin cliente'), 6);
    const porAscensor = topN(groupCount(data, s => codigosAscensores(s).join(', ') || 'Sin ascensor'), 5);
    return {
      pie: { title: 'Vencidos por cliente', data: porCliente },
      bar: { title: 'Top ascensores con más vencidos', data: porAscensor },
      analisis: [
        `Total vencidos: ${total}`,
        porCliente[0] ? `Cliente con mayor pendiente: ${porCliente[0].label} (${porCliente[0].value} vencidos)` : null,
        porAscensor[0] ? `Ascensor crítico: ${porAscensor[0].label} (${porAscensor[0].value})` : null,
        total > 10 ? 'Alerta: nivel alto de mantenimientos vencidos' : null
      ].filter(Boolean)
    };
  }

  if (codigo === 'pendientes_cobro') {
    const total = data.length;
    const porEstado = groupCount(data, c => c.estado_cobro || 'Sin estado');
    const porCliente = topN(groupSum(data, c => c.cliente?.nombre || 'Sin cliente', c => c.saldo_pendiente), 5);
    const saldoTotal = data.reduce((s, c) => s + (Number(c.saldo_pendiente) || 0), 0);
    const monto = data.reduce((s, c) => s + (Number(c.monto_total) || 0), 0);
    return {
      pie: { title: 'Por estado de cobro', data: porEstado },
      bar: { title: 'Top 5 clientes por saldo', data: porCliente, formatValue: v => formatMonto(v) },
      analisis: [
        `Total cobros pendientes: ${total}`,
        `Saldo pendiente total: ${formatMonto(saldoTotal)}`,
        `Monto facturado total: ${formatMonto(monto)}`,
        porCliente[0] ? `Mayor deudor: ${porCliente[0].label} (${formatMonto(porCliente[0].value)})` : null,
        `Cobrado: ${formatMonto(monto - saldoTotal)} (${pct(monto - saldoTotal, monto)}%)`
      ].filter(Boolean)
    };
  }

  if (codigo === 'cobros_vencidos') {
    const total = data.length;
    const enMora = data.filter(c => c.en_mora).length;
    const distribucion = [
      { label: 'En mora', value: enMora },
      { label: 'Vencido', value: total - enMora }
    ];
    const porCliente = topN(groupSum(data, c => c.cliente?.nombre || 'Sin cliente', c => c.saldo_pendiente), 5);
    const saldoTotal = data.reduce((s, c) => s + (Number(c.saldo_pendiente) || 0), 0);
    const promedioDias = total > 0 ? Math.round(data.reduce((s, c) => s + (Number(c.dias_vencido) || 0), 0) / total) : 0;
    const maxDias = data.reduce((mx, c) => Math.max(mx, Number(c.dias_vencido) || 0), 0);
    return {
      pie: { title: 'Mora vs vencidos', data: distribucion },
      bar: { title: 'Top 5 clientes por saldo vencido', data: porCliente, formatValue: v => formatMonto(v) },
      analisis: [
        `Total cobros vencidos: ${total}`,
        `En mora: ${enMora} (${pct(enMora, total)}%)`,
        `Saldo vencido total: ${formatMonto(saldoTotal)}`,
        `Días promedio de atraso: ${promedioDias}`,
        `Atraso máximo: ${maxDias} días`,
        porCliente[0] ? `Mayor saldo vencido: ${porCliente[0].label} (${formatMonto(porCliente[0].value)})` : null
      ].filter(Boolean)
    };
  }

  if (codigo === 'mora_cliente') {
    const total = data.length;
    const saldoTotal = data.reduce((s, g) => s + (Number(g.total_saldo) || 0), 0);
    const casosTotal = data.reduce((s, g) => s + (Number(g.casos) || 0), 0);
    const top = topN(data.map(g => ({ label: g.cliente?.nombre || 'Sin nombre', value: Number(g.total_saldo) || 0 })), 5);
    const casosPie = topN(data.map(g => ({ label: g.cliente?.nombre || 'Sin nombre', value: Number(g.casos) || 0 })), 6);
    return {
      pie: { title: 'Casos por cliente', data: casosPie },
      bar: { title: 'Top 5 clientes por saldo en mora', data: top, formatValue: v => formatMonto(v) },
      analisis: [
        `Clientes en mora: ${total}`,
        `Saldo total en mora: ${formatMonto(saldoTotal)}`,
        `Casos acumulados: ${casosTotal}`,
        top[0] ? `Cliente crítico: ${top[0].label} (${formatMonto(top[0].value)})` : null,
        total > 0 ? `Saldo promedio por cliente: ${formatMonto(saldoTotal / total)}` : null
      ].filter(Boolean)
    };
  }

  if (codigo === 'abonos') {
    const total = data.length;
    const porMetodo = groupCount(data, p => p.metodo_pago || 'Sin método');
    const porMes = ultimosMeses(data, p => p.fecha_pago, p => p.monto);
    const montoTotal = data.reduce((s, p) => s + (Number(p.monto) || 0), 0);
    const metodoPrincipal = [...porMetodo].sort((a, b) => b.value - a.value)[0];
    return {
      pie: { title: 'Abonos por método de pago', data: porMetodo },
      bar: { title: 'Monto cobrado por mes (S/)', data: porMes, formatValue: v => formatMonto(v) },
      analisis: [
        `Total de abonos: ${total}`,
        `Monto cobrado total: ${formatMonto(montoTotal)}`,
        metodoPrincipal ? `Método principal: ${metodoPrincipal.label} (${metodoPrincipal.value} pagos)` : null,
        total > 0 ? `Ticket promedio: ${formatMonto(montoTotal / total)}` : null
      ].filter(Boolean)
    };
  }

  if (codigo === 'facturados' || codigo === 'no_facturados') {
    const total = data.length;
    const porEstado = groupCount(data, r => r.estado_facturacion || 'Sin estado');
    const porCliente = topN(groupCount(data, r => r.servicio?.cliente?.nombre || 'Sin cliente'), 5);
    const monto = puedeVerPrecio ? data.reduce((s, r) => s + (Number(r.servicio?.precio_interno) || 0), 0) : null;
    return {
      pie: { title: 'Por estado de facturación', data: porEstado },
      bar: { title: 'Top 5 clientes', data: porCliente },
      analisis: [
        `Total registros: ${total}`,
        porCliente[0] ? `Cliente principal: ${porCliente[0].label} (${porCliente[0].value})` : null,
        monto !== null ? `Monto total: ${formatMonto(monto)}` : null
      ].filter(Boolean)
    };
  }

  if (codigo === 'cobros') {
    const total = data.length;
    const porEstado = groupCount(data, c => c.estado_cobro || 'Sin estado');
    const porCliente = topN(groupSum(data, c => c.cliente?.nombre || 'Sin cliente', c => c.saldo_pendiente), 5);
    const montoTotal = data.reduce((s, c) => s + (Number(c.monto_total) || 0), 0);
    const abonadoTotal = data.reduce((s, c) => s + (Number(c.total_abonado) || 0), 0);
    const saldoTotal = data.reduce((s, c) => s + (Number(c.saldo_pendiente) || 0), 0);
    return {
      pie: { title: 'Por estado de cobro', data: porEstado },
      bar: { title: 'Top 5 clientes por saldo', data: porCliente, formatValue: v => formatMonto(v) },
      analisis: [
        `Total cobros: ${total}`,
        `Monto total: ${formatMonto(montoTotal)}`,
        `Total abonado: ${formatMonto(abonadoTotal)} (${pct(abonadoTotal, montoTotal)}%)`,
        `Saldo pendiente: ${formatMonto(saldoTotal)}`,
        porCliente[0] ? `Mayor saldo: ${porCliente[0].label} (${formatMonto(porCliente[0].value)})` : null
      ].filter(Boolean)
    };
  }

  if (codigo === 'tecnicos') {
    const total = data.length;
    const porEstado = groupCount(data, t => t.estado_operativo || 'Sin estado');
    const topProd = topN(data.map(t => ({ label: t.nombre, value: Number(t.finalizados) || 0 })), 5);
    const totalFin = data.reduce((s, t) => s + (Number(t.finalizados) || 0), 0);
    const totalCurso = data.reduce((s, t) => s + (Number(t.enCurso) || 0), 0);
    const totalAsig = data.reduce((s, t) => s + (Number(t.asignados) || 0), 0);
    return {
      pie: { title: 'Técnicos por estado operativo', data: porEstado },
      bar: { title: 'Top 5 técnicos por finalizados', data: topProd },
      analisis: [
        `Total técnicos: ${total}`,
        `Servicios finalizados (acumulado): ${totalFin}`,
        `En curso ahora: ${totalCurso}`,
        `Asignados pendientes: ${totalAsig}`,
        topProd[0] && topProd[0].value > 0 ? `Más productivo: ${topProd[0].label} (${topProd[0].value} finalizados)` : null
      ].filter(Boolean)
    };
  }

  if (codigo === 'leads') {
    const total = data.total || data.leads?.length || 0;
    const convertidos = data.convertidos || 0;
    const descartados = data.descartados || 0;
    const porCanal = Object.entries(data.porCanal || {}).map(([label, value]) => ({ label, value: Number(value) || 0 }));
    const porEstado = groupCount(data.leads || [], l => l.estado_lead || 'Sin estado');
    const topCanal = [...porCanal].sort((a, b) => b.value - a.value)[0];
    const enSeguimiento = total - convertidos - descartados;
    return {
      pie: { title: 'Leads por estado', data: porEstado },
      bar: { title: 'Leads por canal', data: topN(porCanal, 6) },
      analisis: [
        `Total leads: ${total}`,
        `Convertidos: ${convertidos} (${pct(convertidos, total)}%)`,
        descartados > 0 ? `Descartados: ${descartados} (${pct(descartados, total)}%)` : null,
        topCanal ? `Canal principal: ${topCanal.label} (${topCanal.value})` : null,
        enSeguimiento > 0 ? `En seguimiento: ${enSeguimiento}` : null
      ].filter(Boolean)
    };
  }

  if (codigo === 'ingresos_por_banco') {
    const grupos = data?.grupos || [];
    const totalesPorMoneda = data?.totales_por_moneda || {};
    const cuentasReales = grupos.filter(g => g.id_cuenta != null);
    const sinCuenta = grupos.filter(g => g.id_cuenta == null);
    const cantidadPagos = grupos.reduce((s, g) => s + (g.cantidad_pagos || 0), 0);
    const monedaPrincipal = Object.entries(totalesPorMoneda).sort((a, b) => b[1] - a[1])[0]?.[0] || 'PEN';
    const pieData = grupos.map(g => ({ label: g.etiqueta, value: Number(g.total) || 0 }));
    const porBanco = groupSum(cuentasReales, g => g.banco || 'Sin banco', g => g.total);
    const top = topN([...cuentasReales].map(g => ({ label: g.etiqueta, value: Number(g.total) || 0 })), 1)[0];
    const analisisMonedas = Object.entries(totalesPorMoneda).map(([m, v]) => `Total ${m === 'SIN_MONEDA' ? 'sin moneda' : m}: ${formatMonto(v, m === 'SIN_MONEDA' ? 'PEN' : m)}`);
    return {
      pie: { title: 'Distribución por cuenta', data: pieData, formatValue: v => formatMonto(v, monedaPrincipal) },
      bar: { title: 'Ingresos por banco', data: topN(porBanco, 6), formatValue: v => formatMonto(v, monedaPrincipal) },
      analisis: [
        `Cuentas con movimiento: ${cuentasReales.length}`,
        sinCuenta.length > 0 ? `Grupos sin cuenta (efectivo/otro): ${sinCuenta.length}` : null,
        `Pagos registrados: ${cantidadPagos}`,
        ...analisisMonedas,
        top ? `Cuenta líder: ${top.label} (${formatMonto(top.value, monedaPrincipal)})` : null
      ].filter(Boolean)
    };
  }

  if (codigo === 'ascensores') {
    const total = data.length;
    const porEstado = groupCount(data, a => a.estado_operativo || 'Sin estado');
    const topServ = topN(data.map(a => ({ label: a.codigo, value: a._count?.servicios || 0 })), 5);
    const operativos = data.filter(a => /operativo|activo/i.test(a.estado_operativo || '')).length;
    const totalEmerg = data.reduce((s, a) => s + (a._count?.emergencias || 0), 0);
    return {
      pie: { title: 'Ascensores por estado', data: porEstado },
      bar: { title: 'Top 5 ascensores por servicios', data: topServ },
      analisis: [
        `Total ascensores: ${total}`,
        `Operativos: ${operativos} (${pct(operativos, total)}%)`,
        topServ[0] && topServ[0].value > 0 ? `Más atendido: ${topServ[0].label} (${topServ[0].value} servicios)` : null,
        `Emergencias acumuladas: ${totalEmerg}`
      ].filter(Boolean)
    };
  }

  if (codigo === 'clientes_estado_edificios') {
    const total = data.length;
    const cuenta = (g) => data.filter(r => r.grupo === g).length;
    const distribucion = Object.entries(GRUPO_EDIFICIOS_META)
      .map(([g, meta]) => ({ label: meta.label, value: cuenta(g) }))
      .filter(x => x.value > 0);
    const conActivos = cuenta('activos');
    const conInactivos = cuenta('inactivos');
    const mixto = cuenta('mixto');
    const sinEdificios = cuenta('sin_edificios');
    return {
      pie: { title: 'Clientes por estado de edificios', data: distribucion },
      bar: { title: 'Clientes por estado de edificios', data: distribucion },
      analisis: [
        `Total de clientes: ${total}`,
        `Con edificios activos: ${conActivos} (${pct(conActivos, total)}%)`,
        `Con edificios inactivos: ${conInactivos} (${pct(conInactivos, total)}%)`,
        mixto > 0 ? `Mixto (activos e inactivos): ${mixto} (${pct(mixto, total)}%)` : null,
        sinEdificios > 0 ? `Sin edificios: ${sinEdificios} (${pct(sinEdificios, total)}%)` : null
      ].filter(Boolean)
    };
  }

  return null;
}
