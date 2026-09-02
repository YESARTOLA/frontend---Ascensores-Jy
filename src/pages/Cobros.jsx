import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { cobrosService, clientesService, tiposServicioService, cuentasBancariasService } from '../services';
import PageHeader from '../components/common/PageHeader.jsx';
import Loader from '../components/common/Loader.jsx';
import EmptyState from '../components/common/EmptyState.jsx';
import Modal from '../components/common/Modal.jsx';
import OtModal from '../components/common/OtModal.jsx';
import Combobox from '../components/common/Combobox.jsx';
import DateRangePicker from '../components/common/DateRangePicker.jsx';
import Pagination, { usePaginatedList } from '../components/common/Pagination.jsx';
import CardMetrica from '../components/common/CardMetrica.jsx';
import CuotasNoFacturadas from '../components/cobros/CuotasNoFacturadas.jsx';
import { useToast } from '../components/common/Toast.jsx';
import { badgeEstado, formatFecha, formatMonto, hoyISO } from '../utils/formatters.js';
import { exportarExcelTabla, exportarPDFTabla } from '../utils/exportTabla.js';
import { etiquetaMoneda, FORMATO_EXCEL } from '../utils/excelNumeros.js';

// Opciones del filtro por tipo de servicio (el value viaja al backend).
const TIPOS_CATEGORIA = [
  { value: 'correctivo', label: 'Correctivo' },
  { value: 'preventivo', label: 'Preventivo (mantenimiento)' },
  { value: 'proyecto', label: 'Proyecto' }
];

// Opciones del filtro de situación de cobro.
const SITUACIONES_COBRO = [
  { value: 'pendiente', label: 'Pendiente' },
  { value: 'cancelado', label: 'Cancelado' },
  { value: 'parcial', label: 'Parcial' },
  { value: 'vencido', label: 'Vencido' }
];

// Documento del cliente: "RUC 20..." / "DNI 4..." o '—'.
const docCliente = (c) => {
  const cl = c.cliente;
  if (!cl?.numero_documento) return '—';
  return `${cl.tipo_documento || ''} ${cl.numero_documento}`.trim();
};

// Fecha del servicio: fecha de realización si existe, si no la programada.
const fechaServicio = (c) => c.servicio?.servicio_realizado?.fecha_realizacion || c.servicio?.fecha_programada || null;

// Nombre del edificio a partir de los ascensores del servicio o del plan.
const nombreEdificio = (c) => {
  const asc = c.servicio?.ascensores || c.mantenimiento_plan?.ascensores || [];
  return asc.map(a => a.ascensor?.edificio?.nombre).find(Boolean) || '—';
};

// Tipo de servicio legible (servicio directo o plan de mantenimiento).
const tipoServicioLabel = (c) => c.servicio?.tipo_servicio?.nombre || c.mantenimiento_plan?.tipo_servicio?.nombre || '—';

// Factura activa más reciente del cobro (para fecha de emisión y N° de serie).
const facturaReciente = (c) => {
  const facturas = (c.facturas || []).filter(f => f.estado !== 0);
  if (!facturas.length) return null;
  return facturas.reduce((max, f) => ((f.fecha_emision || '') > (max.fecha_emision || '') ? f : max), facturas[0]);
};

// Serie y número de la factura tal como se emitió (formato "F001-000123").
const serieFactura = (f) => (f?.numero_factura ? String(f.numero_factura) : '—');

// Cuentas donde se registraron los abonos, en una línea ("BCP ahorros: S/ 100").
const cuentasAbonoTexto = (c) => (
  Array.isArray(c.abonos_por_cuenta) && c.abonos_por_cuenta.length > 0
    ? c.abonos_por_cuenta.map(a => `${a.label}: ${formatMonto(a.total, c.moneda)}`).join(' · ')
    : ''
);

// Columnas del export (espejo de la tabla, sin la columna de acciones). El orden
// sigue el "orden de registro" definido por administración: fecha de servicio →
// emisión → factura → cliente → edificio → tipo y servicio → montos → estado; las
// columnas de seguimiento (cuotas, vencimiento, mora) van al final.
// Moneda del cobro (por defecto soles, igual que el resto del módulo).
const monedaDe = (c) => c.moneda || 'PEN';

// Columnas del export. Los importes llevan `num` para que Excel los reciba como
// números (sumables) y "Moneda" permite filtrar soles / dólares por separado.
const COLUMNAS_EXPORT = [
  { header: 'Fecha de servicio', get: c => { const f = fechaServicio(c); return f ? formatFecha(f) : ''; } },
  { header: 'Fecha de emisión', get: c => { const f = facturaReciente(c); return f?.fecha_emision ? formatFecha(f.fecha_emision) : ''; } },
  { header: 'Serie y N° factura', get: c => { const f = facturaReciente(c); return f ? serieFactura(f) : ''; } },
  { header: 'RUC / DNI', get: c => (docCliente(c) === '—' ? '' : docCliente(c)) },
  { header: 'Razón social', get: c => c.cliente?.nombre },
  { header: 'Edificio', get: c => (nombreEdificio(c) === '—' ? '' : nombreEdificio(c)) },
  { header: 'Tipo de servicio', get: c => (tipoServicioLabel(c) === '—' ? '' : tipoServicioLabel(c)) },
  { header: 'Servicio / Cotización', get: c => [c.servicio?.codigo, c.servicio?.cotizacion?.codigo].filter(Boolean).join(' · ') },
  { header: 'OT', get: c => c.servicio?.numero_ot || '' },
  { header: 'Moneda', get: c => etiquetaMoneda(monedaDe(c)) },
  { header: 'Monto facturado', align: 'right', get: c => formatMonto(c.monto_total, monedaDe(c)), num: c => Number(c.monto_total) },
  { header: 'Abonos realizados', align: 'right', get: c => formatMonto(c.total_abonado, monedaDe(c)), num: c => Number(c.total_abonado) },
  { header: 'Saldo pendiente', align: 'right', get: c => formatMonto(c.saldo_pendiente, monedaDe(c)), num: c => Number(c.saldo_pendiente) },
  { header: 'Cuenta del abono', get: c => cuentasAbonoTexto(c) },
  { header: 'Estado de cobranza', badge: true, get: c => c.estado_cobro },
  { header: 'Cuotas (P/T)', get: c => `${c.cuotas_pagadas}/${c.numero_cuotas}` },
  { header: 'Cuotas pagadas', align: 'right', get: c => c.cuotas_pagadas, num: c => Number(c.cuotas_pagadas), formato: FORMATO_EXCEL.entero },
  { header: 'Cuotas totales', align: 'right', get: c => c.numero_cuotas, num: c => Number(c.numero_cuotas), formato: FORMATO_EXCEL.entero },
  { header: 'Fecha de vencimiento', get: c => formatFecha(c.fecha_proximo_abono) },
  { header: 'Días de mora', align: 'right', get: c => (c.dias_mora > 0 ? c.dias_mora : ''), num: c => (c.dias_mora > 0 ? Number(c.dias_mora) : null), formato: FORMATO_EXCEL.entero }
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
  const [tipos, setTipos] = useState([]);
  const [proyectos, setProyectos] = useState([]);
  const [cuentas, setCuentas] = useState([]); // cuentas bancarias (banco + N° cuenta)
  const [filtros, setFiltros] = useState({
    q: '', situacion_cobro: '', por_cobrar: '', tipo_categoria: '', id_cuenta_bancaria: '',
    id_tipo_servicio: '', id_proyecto: '',
    monto_min: '', monto_max: '',
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

  const { data, loading, total, page, pageSize, totalPages, setPage, setPageSize, recargar, meta } =
    usePaginatedList(cobrosService.paginate, filtros, { initialPageSize: 25 });
  // Indicadores de cobranza del recorte filtrado completo (no solo de la página
  // visible). Los calcula el backend con los mismos filtros, así que se
  // recalculan solos en cada cambio de filtro.
  const resumen = meta?.resumen_cobranza;
  // Filtro "Por cobrar" del encabezado: espejo del contador "Pendientes a cobrar".
  const porCobrarActivo = filtros.por_cobrar === '1';

  useEffect(() => {
    Promise.all([
      clientesService.list().catch(() => []),
      tiposServicioService.list().catch(() => []),
      cobrosService.proyectos().catch(() => []),
      cuentasBancariasService.list().catch(() => [])
    ]).then(([c, ts, p, cb]) => {
      setClientes(c); setTipos(ts); setProyectos(p);
      setCuentas(Array.isArray(cb) ? cb : []);
    });
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
    if (filtros.situacion_cobro) p.push(`Situación: ${SITUACIONES_COBRO.find(s => s.value === filtros.situacion_cobro)?.label || filtros.situacion_cobro}`);
    if (filtros.por_cobrar === '1') p.push('Solo por cobrar (con saldo pendiente)');
    if (filtros.tipo_categoria) p.push(`Tipo de servicio: ${TIPOS_CATEGORIA.find(t => t.value === filtros.tipo_categoria)?.label || filtros.tipo_categoria}`);
    if (filtros.id_cuenta_bancaria) {
      const cu = cuentas.find(x => String(x.id) === String(filtros.id_cuenta_bancaria));
      p.push(`Cuenta: ${cu ? `${cu.banco} · ${cu.numero_cuenta}` : filtros.id_cuenta_bancaria}`);
    }
    if (filtros.id_proyecto) p.push(`Proyecto: ${proyectos.find(pr => String(pr.id) === String(filtros.id_proyecto))?.titulo || filtros.id_proyecto}`);
    if (filtros.id_tipo_servicio) p.push(`Tipo: ${tipos.find(t => String(t.id) === String(filtros.id_tipo_servicio))?.nombre || filtros.id_tipo_servicio}`);
    if (filtros.monto_min) p.push(`Monto desde: ${filtros.monto_min}`);
    if (filtros.monto_max) p.push(`Monto hasta: ${filtros.monto_max}`);
    if (filtros.fecha_proximo_desde) p.push(`Venc. desde: ${filtros.fecha_proximo_desde}`);
    if (filtros.fecha_proximo_hasta) p.push(`Venc. hasta: ${filtros.fecha_proximo_hasta}`);
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
    q: '', situacion_cobro: '', por_cobrar: '', tipo_categoria: '', id_cuenta_bancaria: '',
    id_tipo_servicio: '', id_proyecto: '',
    monto_min: '', monto_max: '',
    fecha_proximo_desde: '', fecha_proximo_hasta: '',
    orden: '', direccion: ''
  });

  // Ciclo de ordenamiento por columna: asc → desc → sin orden.
  const ordenarPor = (col) => setFiltros(f => {
    if (f.orden !== col) return { ...f, orden: col, direccion: 'asc' };
    if (f.direccion === 'asc') return { ...f, orden: col, direccion: 'desc' };
    return { ...f, orden: '', direccion: '' };
  });

  // Sugerencias del buscador: los clientes. El valor es su NOMBRE porque el
  // buscador manda texto libre (`q`), no un id.
  const opcionesClientes = useMemo(() => clientes.map(c => ({
    value: c.nombre,
    label: c.nombre,
    sublabel: [c.tipo_documento, c.numero_documento].filter(Boolean).join(' ')
  })), [clientes]);

  // Cuentas bancarias: se identifica cada una por su número de cuenta.
  const opcionesCuentas = useMemo(() => cuentas.map(cu => ({
    value: cu.id,
    label: `${cu.banco} · ${cu.numero_cuenta}`,
    sublabel: [cu.nombre, cu.tipo_cuenta, cu.moneda].filter(Boolean).join(' · ')
  })), [cuentas]);

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
          : vistaModo === 'no-facturadas'
            ? 'Cuotas pendientes de facturación con su fecha registrada'
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
            <button
              onClick={() => setVistaModo('no-facturadas')}
              className={vistaModo === 'no-facturadas' ? 'btn-primary' : 'btn-secondary'}
            >Por facturar</button>
            {/* Filtro rápido, no una vista: deja en la tabla los cobros que aún
                tienen saldo — los mismos que cuenta la tarjeta "Pendientes a
                cobrar" (backend: estaPorCobrar). Va en ámbar para no confundirlo
                con los selectores de vista de al lado, y es un interruptor:
                volver a pulsarlo lo quita. Si se activa desde el calendario o
                desde "Por facturar", devuelve a la tabla, que es lo que filtra. */}
            <button
              type="button"
              aria-pressed={porCobrarActivo}
              title={porCobrarActivo
                ? 'Quitar el filtro «Por cobrar»'
                : 'Ver solo los cobros con saldo pendiente (los que cuenta «Pendientes a cobrar»)'}
              onClick={() => {
                setF('por_cobrar', porCobrarActivo ? '' : '1');
                if (!porCobrarActivo) setVistaModo('tabla');
              }}
              className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium ring-1 transition ${
                porCobrarActivo
                  ? 'bg-amber-100 text-amber-900 ring-amber-300'
                  : 'bg-white text-amber-700 ring-amber-200 hover:bg-amber-50'
              }`}
            >
              Por cobrar
              {porCobrarActivo && <span aria-hidden="true" className="text-xs opacity-70">✕</span>}
            </button>
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

      {vistaModo === 'tabla' && resumen && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4 mb-4">
          <CardMetrica
            titulo="Cobrados"
            ayuda="Dinero efectivamente recibido en los cobros del filtro, incluidos los abonos parciales de cobros que siguen abiertos. La cantidad son los cobros ya saldados por completo."
            cantidad={resumen.cobrados?.cantidad}
            montos={resumen.cobrados?.montos}
            unidad="cobro(s) saldado(s)"
            tono="green"
            nota="Incluye abonos parciales de cobros aún abiertos."
          />
          <CardMetrica
            titulo="Pendientes a cobrar"
            ayuda="Saldo que falta cobrar en los cobros del filtro, y cuántos siguen abiertos."
            cantidad={resumen.pendientes?.cantidad}
            montos={resumen.pendientes?.montos}
            unidad="cobro(s) abierto(s)"
            tono="amber"
            nota="Saldo pendiente; junto al cobrado suma la cartera facturada."
          />
        </div>
      )}

      {vistaModo === 'tabla' && (
        <div className="card mb-4 relative z-20">
          <div className="p-4 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
            {/* Buscador: combobox con los clientes como sugerencia, pero el texto
                escrito sigue yendo tal cual al backend (busca cliente, servicio,
                RUC/DNI y N° de factura). Reemplaza al select "Todos los clientes". */}
            <Combobox
              className="col-span-2 sm:col-span-3 lg:col-span-2"
              libre
              options={opcionesClientes}
              value={filtros.q}
              onChange={v => setF('q', v ?? '')}
              placeholder="Buscar cliente, edificio, servicio, RUC/DNI o N° de factura…"
              emptyLabel="Sin clientes que coincidan (se buscará el texto igual)"
            />
            <select className="select" value={filtros.situacion_cobro} onChange={e => setF('situacion_cobro', e.target.value)}>
              <option value="">Estado de cobro (todos)</option>
              {SITUACIONES_COBRO.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
            </select>
            <Combobox
              className="col-span-2 sm:col-span-2 lg:col-span-2"
              options={opcionesProyectos}
              value={filtros.id_proyecto || null}
              onChange={v => setF('id_proyecto', v ?? '')}
              placeholder="Todos los proyectos"
              emptyLabel="Sin proyectos que coincidan"
            />
            <select className="select" value={filtros.id_tipo_servicio} onChange={e => setF('id_tipo_servicio', e.target.value)}>
              <option value="">Todos los tipos</option>
              {tipos.map(t => <option key={t.id} value={t.id}>{t.nombre}</option>)}
            </select>
            <select className="select" value={filtros.tipo_categoria} onChange={e => setF('tipo_categoria', e.target.value)}>
              <option value="">Tipo de servicio (todos)</option>
              {TIPOS_CATEGORIA.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
            {/* Cuentas bancarias: se elige la CUENTA (banco + N° de cuenta), no el
                banco suelto, para distinguir dos cuentas del mismo banco. */}
            <Combobox
              options={opcionesCuentas}
              value={filtros.id_cuenta_bancaria || null}
              onChange={v => setF('id_cuenta_bancaria', v ?? '')}
              placeholder="Todas las cuentas"
              emptyLabel="Sin cuentas que coincidan"
            />
            {/* Rango de vencimiento: un único calendario elige inicio y fin. */}
            <DateRangePicker
              desde={filtros.fecha_proximo_desde}
              hasta={filtros.fecha_proximo_hasta}
              onChange={({ desde, hasta }) => setFiltros(f => ({ ...f, fecha_proximo_desde: desde, fecha_proximo_hasta: hasta }))}
              placeholder="Vencimiento (rango)"
            />
            <div className="flex gap-2">
              <input type="number" min="0" step="0.01" className="input" placeholder="Monto desde"
                value={filtros.monto_min} onChange={e => setF('monto_min', e.target.value)} />
              <input type="number" min="0" step="0.01" className="input" placeholder="Monto hasta"
                value={filtros.monto_max} onChange={e => setF('monto_max', e.target.value)} />
            </div>
            <button onClick={limpiar} className="btn-secondary col-span-2 sm:col-span-1">Limpiar</button>
          </div>
        </div>
      )}

      {vistaModo === 'no-facturadas' ? (
        <CuotasNoFacturadas clientes={clientes} proyectos={proyectos} />
      ) : vistaModo === 'tabla' ? (
        loading ? <div className="card"><Loader /></div> : data.length === 0 ? <div className="card"><EmptyState title="Sin cobros" /></div> : (
          <>
            {/* Vista tabla (desktop) */}
            <div className="card hidden md:block">
              <div className="overflow-x-auto scroll-thin">
                <table className="table-base">
                  {/* Orden de registro definido por administración: fecha de
                      servicio → emisión → factura → cliente → obra → servicio →
                      montos → cuenta del abono → estado. Las columnas de
                      seguimiento (cuotas, vencimiento, mora) cierran la tabla. */}
                  <thead><tr>
                    <th className="table-th">Fecha de servicio</th>
                    <th className="table-th">Fecha de emisión</th>
                    <ThOrden col="factura" filtros={filtros} ordenarPor={ordenarPor}>Serie y N° factura</ThOrden>
                    <th className="table-th">RUC / DNI</th>
                    <ThOrden col="cliente" filtros={filtros} ordenarPor={ordenarPor}>Razón social</ThOrden>
                    <th className="table-th">Edificio</th>
                    <th className="table-th">Tipo de servicio</th>
                    <ThOrden col="servicio" filtros={filtros} ordenarPor={ordenarPor}>Servicio / Cotización</ThOrden>
                    <ThOrden col="ot" filtros={filtros} ordenarPor={ordenarPor}>OT</ThOrden>
                    <ThOrden col="precio" filtros={filtros} ordenarPor={ordenarPor} align="right">Monto facturado</ThOrden>
                    <ThOrden col="abonos" filtros={filtros} ordenarPor={ordenarPor} align="right">Abonos realizados</ThOrden>
                    <ThOrden col="saldo" filtros={filtros} ordenarPor={ordenarPor} align="right">Saldo pendiente</ThOrden>
                    <th className="table-th">Cuenta del abono</th>
                    <ThOrden col="estado" filtros={filtros} ordenarPor={ordenarPor}>Estado de cobranza</ThOrden>
                    <ThOrden col="cuotas" filtros={filtros} ordenarPor={ordenarPor} align="center">Cuotas (P/T)</ThOrden>
                    <ThOrden col="proximo" filtros={filtros} ordenarPor={ordenarPor}>Fecha de vencimiento</ThOrden>
                    <ThOrden col="mora" filtros={filtros} ordenarPor={ordenarPor} align="center">Mora</ThOrden>
                    <th className="table-th text-right">Acciones</th>
                  </tr></thead>
                  <tbody className="divide-y divide-slate-100">
                    {data.map(c => {
                      // La OT vive en el servicio (antes se copiaba al registro de realizado).
                      const ot = { numero: c.servicio?.numero_ot, archivo: c.servicio?.archivo_ot };
                      const tieneOt = !!(ot.numero || ot.archivo);
                      return (
                      <tr key={c.id} className={`table-row-hover ${c.vencido ? 'row-vencido' : ''}`}>
                        <td className="table-td text-xs">{(() => { const f = fechaServicio(c); return f ? formatFecha(f) : <span className="text-slate-400">—</span>; })()}</td>
                        <td className="table-td text-xs">{(() => { const f = facturaReciente(c); return f?.fecha_emision ? formatFecha(f.fecha_emision) : <span className="text-slate-400">—</span>; })()}</td>
                        <td className="table-td text-xs font-mono whitespace-nowrap">{(() => { const f = facturaReciente(c); return f ? serieFactura(f) : <span className="text-slate-400">—</span>; })()}</td>
                        <td className="table-td text-xs font-mono whitespace-nowrap">{docCliente(c)}</td>
                        <td className="table-td text-sm">{c.cliente?.nombre}</td>
                        <td className="table-td text-xs">{nombreEdificio(c)}</td>
                        <td className="table-td text-xs">{tipoServicioLabel(c)}</td>
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
                              onClick={() => setOtAbierta(ot)}
                              className="inline-flex items-center gap-1 text-brand-700 text-xs hover:underline font-mono"
                              title="Ver OT"
                            >
                              📄 {ot.numero || 'OT'}
                            </button>
                          ) : (
                            <span className="text-slate-400 text-xs">—</span>
                          )}
                        </td>
                        <td className="table-td text-right font-mono">{formatMonto(c.monto_total, c.moneda)}</td>
                        <td className="table-td text-right font-mono text-emerald-700">{formatMonto(c.total_abonado, c.moneda)}</td>
                        <td className="table-td text-right font-mono font-medium text-rose-700">{formatMonto(c.saldo_pendiente, c.moneda)}</td>
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
                        <td className="table-td"><span className={badgeEstado(c.estado_cobro)}>{c.estado_cobro}</span></td>
                        <td className="table-td text-center text-xs">{c.cuotas_pagadas}/{c.numero_cuotas}</td>
                        <td className="table-td text-xs">{formatFecha(c.fecha_proximo_abono)}</td>
                        <td className="table-td text-center text-xs">{c.dias_mora > 0 ? <span className="text-rose-700 font-semibold">{c.dias_mora}</span> : '—'}</td>
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
                // La OT vive en el servicio (antes se copiaba al registro de realizado).
                const ot = { numero: c.servicio?.numero_ot, archivo: c.servicio?.archivo_ot };
                const tieneOt = !!(ot.numero || ot.archivo);
                return (
                <div key={c.id} className={`card p-4 ${c.vencido ? 'ring-2 ring-rose-200' : ''}`}>
                  {/* Mismo orden de registro que la tabla de escritorio. */}
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="text-[11px] text-slate-500">
                        {(() => { const f = fechaServicio(c); return f ? `Servicio ${formatFecha(f)}` : 'Servicio sin fecha'; })()}
                        {(() => { const f = facturaReciente(c); return f?.fecha_emision ? ` · Emisión ${formatFecha(f.fecha_emision)}` : ''; })()}
                      </div>
                      {(() => { const f = facturaReciente(c); return f ? (
                        <div className="text-[11px] text-slate-600 font-mono">{serieFactura(f)}</div>
                      ) : null; })()}
                      <div className="text-[11px] text-slate-500 font-mono">{docCliente(c)}</div>
                      <div className="font-medium text-sm truncate">{c.cliente?.nombre}</div>
                      {nombreEdificio(c) !== '—' && (
                        <div className="text-[11px] text-slate-500 truncate">{nombreEdificio(c)}</div>
                      )}
                      {tipoServicioLabel(c) !== '—' && (
                        <div className="text-[11px] text-slate-500 truncate">{tipoServicioLabel(c)}</div>
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
                    <Mini label="Monto facturado" value={formatMonto(c.monto_total, c.moneda)} />
                    <Mini label="Abonos" value={formatMonto(c.total_abonado, c.moneda)} cls="text-emerald-700" />
                    <Mini label="Saldo" value={formatMonto(c.saldo_pendiente, c.moneda)} cls="text-rose-700" />
                  </div>
                  {Array.isArray(c.abonos_por_cuenta) && c.abonos_por_cuenta.length > 0 && (
                    <div className="mt-3">
                      <div className="text-[10px] uppercase tracking-wider text-slate-400 mb-1">Cuenta del abono</div>
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
                  <div className="grid grid-cols-3 gap-2 mt-3 text-xs">
                    <Mini label="Cuotas" value={`${c.cuotas_pagadas}/${c.numero_cuotas}`} />
                    <Mini label="Vencimiento" value={formatFecha(c.fecha_proximo_abono)} />
                    <Mini label="Mora" value={c.dias_mora > 0 ? `${c.dias_mora}d` : '—'} cls={c.dias_mora > 0 ? 'text-rose-700' : ''} />
                  </div>
                  <div className="mt-3 flex gap-2">
                    <Link to={`/cobros/${c.id}`} className="btn-secondary text-xs flex-1 text-center">Gestionar</Link>
                    {tieneOt && (
                      <button
                        type="button"
                        onClick={() => setOtAbierta(ot)}
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
