import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { facturasService, clientesService } from '../services';
import PageHeader from '../components/common/PageHeader.jsx';
import Loader from '../components/common/Loader.jsx';
import EmptyState from '../components/common/EmptyState.jsx';
import Pagination, { usePaginatedList } from '../components/common/Pagination.jsx';
import DateRangePicker from '../components/common/DateRangePicker.jsx';
import FiltroMoneda, { etiquetaDeMoneda } from '../components/common/FiltroMoneda.jsx';
import { FileLink, descargarArchivo } from '../components/common/FilePreview.jsx';
import Modal from '../components/common/Modal.jsx';
import EditarFacturaModal from '../components/facturas/EditarFacturaModal.jsx';
import { CeldaDocumentosFactura, ListaDocumentosFactura, archivosComprobanteDe, documentosAdicionalesDe } from '../components/facturas/DocumentosFactura.jsx';
import { ListaNumerosOperacion, textoNumerosOperacion } from '../components/facturas/NumerosOperacion.jsx';
import ClienteAutocomplete from '../components/common/ClienteAutocomplete.jsx';
import { useToast } from '../components/common/Toast.jsx';
import { useAuth } from '../features/auth/AuthContext.jsx';
import { useMonedas } from '../hooks/useMonedas.js';
import { badgeEstado, formatFecha, formatMonto, hoyISO } from '../utils/formatters.js';
import { ESTADOS_FACTURA, ESTADO_FACTURA_SIN, ESTADO_FACTURA_ENVIADA, esFacturaActiva } from '../utils/estadoFactura.js';
import { TIPOS_COMPROBANTE, etiquetaTipoComprobante } from '../utils/catalogosComprobante.js';
import { exportarExcelTabla, exportarPDFTabla } from '../utils/exportTabla.js';
import { etiquetaMoneda, FORMATO_EXCEL } from '../utils/excelNumeros.js';
import CardMetricaDoble from '../components/common/CardMetricaDoble.jsx';
import FechaServicioCelda, { AYUDA_FECHA_SERVICIO, textoRangoFecha } from '../components/common/FechaServicioCelda.jsx';

// Mismos parámetros de fecha que Contabilidad. `desde`/`hasta` = rango de
// "Fecha comprobante" (emisión); `servicio_*` = "Fecha servicio" (la
// programación) y `registro_*` = "Fecha registro" (OT o aprobación del
// correctivo) de los servicios que cubre la factura; `aprobacion_*` = fecha de
// aprobación de la cotización del servicio facturado.
const FILTROS_INICIALES = {
  q: '', id_cliente: '', estado_factura: '', tipo_comprobante: '', cobertura: '', tipo_categoria: '',
  situacion: '', moneda: '', desde: '', hasta: '',
  servicio_desde: '', servicio_hasta: '', registro_desde: '', registro_hasta: '',
  aprobacion_desde: '', aprobacion_hasta: '',
  // Orden por defecto: serie y N° de factura, ascendente. Es el orden con el que
  // administración lleva el registro; el correlativo interno (#) sigue
  // disponible como columna ordenable.
  sort: 'numero_factura', dir: 'asc'
};

// Las dos situaciones que resume la cabecera. Esta lista es a la vez las
// TARJETAS del resumen y los BOTONES de filtro rápido: una sola definición
// (título, ayuda y tono) para que lo que se cuenta y lo que se filtra se
// describan igual.
//
// `value` viaja al backend como `situacion` y allí se resuelve con el MISMO
// análisis con el que se calculan los indicadores (facturasController.listar),
// así que pulsar un botón deja en la tabla exactamente las facturas que su
// tarjeta cuenta. `clave` es la del resumen que envía el backend.
const SITUACIONES = [
  {
    value: 'facturado',
    clave: 'facturado',
    titulo: 'Facturado',
    ayuda: 'Facturas que cumplen los filtros, con su importe emitido. No cuenta las anuladas.',
    tono: 'green',
    btnOn: 'bg-emerald-100 text-emerald-900 ring-emerald-300',
    btnOff: 'bg-white text-emerald-700 ring-emerald-200 hover:bg-emerald-50'
  },
  {
    value: 'pendiente_cobro',
    clave: 'pendiente',
    titulo: 'Pendiente de cobro',
    ayuda: 'De esas mismas facturas, las que aún tienen saldo por cobrar y cuánto falta.',
    nota: 'Del total facturado, lo que falta cobrar.',
    tono: 'amber',
    btnOn: 'bg-amber-100 text-amber-900 ring-amber-300',
    btnOff: 'bg-white text-amber-700 ring-amber-200 hover:bg-amber-50'
  }
];

// Tipo de servicio facturado (espejo del filtro de Cobros).
const TIPOS_SERVICIO = [
  { value: 'preventivo', label: 'Preventivo (mantenimiento)' },
  { value: 'correctivo', label: 'Correctivo' },
  { value: 'proyecto', label: 'Proyecto' }
];

// RUC / DNI del cliente, tal como se busca y se muestra.
const docCliente = (cliente) => {
  if (!cliente?.numero_documento) return '';
  return `${cliente.tipo_documento || ''} ${cliente.numero_documento}`.trim();
};

// Nombre del edificio / obra facturado. Sale de los ascensores del servicio o,
// si la factura es de una cuota de plan (sin servicio), de los del plan. Mismo
// criterio que en Gestión de cobros.
const nombreEdificio = (f) => {
  const ascs = f.servicio?.ascensores?.length ? f.servicio.ascensores : (f.mantenimiento_plan?.ascensores || []);
  return ascs.map(a => a.ascensor?.edificio?.nombre).find(Boolean) || '';
};

// La factura no guarda moneda: la hereda del cobro y, si no lo hay, del servicio.
const monedaDe = (f) => f.cobro?.moneda || f.servicio?.moneda || 'PEN';

// Categoría legible del servicio facturado (misma clasificación que el filtro).
const etiquetaTipoServicio = (f) => {
  if (!f.servicio) return f.mantenimiento_plan ? 'Preventivo' : '';
  if (f.servicio.tipo_registro === 'proyecto') return 'Proyecto';
  const modulo = f.servicio.tipo_servicio?.modulo_asociado;
  if (modulo === 'correctivo') return 'Correctivo';
  if (modulo === 'mantenimiento') return 'Preventivo';
  return f.servicio.tipo_servicio?.nombre || '';
};

// Fechas de la factura que vienen de los servicios que cubre, calculadas en el
// backend (utils/fechasContables.js) con el mismo criterio que Contabilidad y
// que sus filtros:
//   - fecha_servicio   = programación (la que filtra); fecha_ejecucion = inicio real;
//   - fecha_registro   = OT o, en un correctivo sin OT, aprobación de su cotización.
// Una factura de plan cubre los mantenimientos de su mes: si caen en días
// distintos, cada una es un rango (`<campo>_hasta` = la última).
const textoRangoFechas = (f, campo) => textoRangoFecha(f[campo], f[`${campo}_hasta`]);

// Tooltip de "Fecha registro": de dónde sale (igual que en Contabilidad).
const tituloFechaRegistro = (f) => {
  if (!f.fecha_registro) return undefined;
  return f.fecha_registro_origen === 'aprobacion'
    ? 'Aprobación de la cotización (aún sin OT)'
    : f.fecha_registro_origen === 'ot' ? 'Registro de la OT' : undefined;
};

// Columnas del export (espejo de la tabla, sin la columna de archivo). `num`
// hace que Excel reciba números (sumables) en vez de texto; "Moneda" permite
// filtrar y totalizar soles y dólares por separado. La fecha de servicio va en
// dos columnas, como en el export de Contabilidad.
const COLUMNAS_EXPORT = [
  { header: '#', get: (_f, i) => i + 1, num: (_f, i) => i + 1, formato: FORMATO_EXCEL.entero },
  { header: 'Fecha servicio', get: f => textoRangoFechas(f, 'fecha_servicio') },
  { header: 'Fecha ejecución', get: f => textoRangoFechas(f, 'fecha_ejecucion') },
  { header: 'Fecha registro', get: f => textoRangoFechas(f, 'fecha_registro') },
  { header: 'Fecha comprobante', get: f => formatFecha(f.fecha_emision) },
  { header: 'Serie y N° de factura', get: f => f.numero_factura },
  { header: 'Comprobante', get: f => etiquetaTipoComprobante(f.tipo_comprobante) },
  { header: 'Cliente', get: f => f.cliente?.nombre },
  { header: 'RUC / DNI', get: f => docCliente(f.cliente) },
  { header: 'Edificio', get: f => nombreEdificio(f) },
  { header: 'Servicio', get: f => f.servicio?.codigo },
  { header: 'Tipo de servicio', get: f => etiquetaTipoServicio(f) },
  { header: 'Moneda', get: f => etiquetaMoneda(monedaDe(f)) },
  { header: 'Monto', align: 'right', get: f => formatMonto(f.monto, monedaDe(f)), num: f => Number(f.monto) },
  { header: 'Cobertura', get: f => (f.id_cuota ? `Cuota N° ${f.cuota?.numero_cuota ?? '?'}` : 'General') },
  { header: 'N° de operación', get: f => textoNumerosOperacion(f.numeros_operacion) },
  { header: 'Estado', badge: true, get: f => f.estado_factura }
];

// 'Sin factura' es el estado de facturación a nivel servicio; una fila de factura
// nunca lo tiene, así que se excluye del filtro para no ofrecer una opción vacía.
const ESTADOS_FILTRO = ESTADOS_FACTURA.filter(e => e !== ESTADO_FACTURA_SIN);

// Columnas de fecha: encabezado en dos líneas y menos relleno lateral, para que
// ocupen solo lo que mide la fecha y el espacio quede para Cliente.
const TH_FECHA = '!px-2';
const TD_FECHA = 'table-td text-xs !px-2';
// Encabezado en dos líneas ("Fecha" / "servicio"). Va dentro de un span para
// que el salto funcione también dentro del flex del encabezado ordenable.
const EtiquetaFecha = ({ children }) => <span className="block leading-tight">Fecha<br />{children}</span>;

// Encabezado de columna ordenable.
function ThSort({ label, col, sort, dir, onSort, align = 'left', className = '' }) {
  const activo = sort === col;
  return (
    <th
      className={`table-th cursor-pointer select-none whitespace-nowrap ${align === 'right' ? 'text-right' : ''} ${className}`}
      onClick={() => onSort(col)}
      title="Ordenar por esta columna"
    >
      <span className={`inline-flex items-center gap-1 ${align === 'right' ? 'flex-row-reverse' : ''}`}>
        {label}
        <span className={`text-[10px] ${activo ? 'text-brand-600' : 'text-slate-300'}`}>
          {activo ? (dir === 'asc' ? '▲' : '▼') : '↕'}
        </span>
      </span>
    </th>
  );
}

export default function Facturas() {
  const [filtros, setFiltros] = useState(FILTROS_INICIALES);
  const [clientes, setClientes] = useState([]);
  const [exportando, setExportando] = useState(false);
  // Anulación: deja la factura como constancia y libera el servicio/cuota para
  // emitir una nueva (que se emite desde el cobro, donde vive el formulario).
  const [facturaAAnular, setFacturaAAnular] = useState(null);
  const [motivoAnulacion, setMotivoAnulacion] = useState('');
  const [anulando, setAnulando] = useState(false);
  // Detalle de la factura (se abre desde su número) con descarga del comprobante.
  const [facturaDetalle, setFacturaDetalle] = useState(null);
  // Factura en edición: datos, comprobante y documentos (constancias, XML/CDR…).
  const [facturaEditar, setFacturaEditar] = useState(null);

  // El listado no incluye el desglose mensual de las facturas de plan (lo
  // arma el endpoint de detalle desde el cronograma). Se abre el modal al
  // instante con lo que ya se tiene y se completa al llegar la respuesta.
  const abrirDetalleFactura = (f) => {
    setFacturaDetalle(f);
    facturasService.get(f.id)
      .then(completa => setFacturaDetalle(prev => (prev && prev.id === f.id ? { ...prev, ...completa } : prev)))
      .catch(() => {});
  };
  const toast = useToast();
  // Catálogo de monedas: alimenta el filtro y nombra la divisa elegida en la
  // cabecera del export.
  const monedas = useMonedas();
  const { esSuperAdmin, esAdmin, esContabilidad } = useAuth();
  const puedeAnular = esSuperAdmin || esAdmin || esContabilidad;

  const { data, loading, total, page, pageSize, totalPages, setPage, setPageSize, recargar, meta } =
    usePaginatedList(facturasService.paginate, filtros, { initialPageSize: 25 });
  // Resumen del conjunto filtrado COMPLETO (no solo de la página visible). Lo
  // calcula el backend con el mismo `where` que la tabla y viaja junto al
  // listado, así que se recalcula solo cada vez que cambian los filtros.
  const resumen = meta?.resumen_facturas;

  const anularFactura = async () => {
    if (!facturaAAnular) return;
    if (!motivoAnulacion.trim()) return toast.error('Indica el motivo de la anulación');
    setAnulando(true);
    try {
      await facturasService.anular(facturaAAnular.id, motivoAnulacion.trim());
      toast.success(`Factura ${facturaAAnular.numero_factura} anulada. Emite la nueva desde el cobro.`);
      setFacturaAAnular(null);
      recargar();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Error al anular la factura');
    } finally {
      setAnulando(false);
    }
  };

  useEffect(() => { clientesService.list().then(setClientes).catch(() => setClientes([])); }, []);

  const setF = (k, v) => setFiltros(f => ({ ...f, [k]: v }));

  // Descripción legible de los filtros activos, para la cabecera del export.
  const filtrosLegibles = () => {
    const p = [];
    if (filtros.q) p.push(`Búsqueda: ${filtros.q}`);
    if (filtros.id_cliente) p.push(`Cliente: ${clientes.find(c => String(c.id) === String(filtros.id_cliente))?.nombre || filtros.id_cliente}`);
    if (filtros.estado_factura) p.push(`Estado: ${filtros.estado_factura}`);
    if (filtros.tipo_comprobante) p.push(`Comprobante: ${filtros.tipo_comprobante}`);
    if (filtros.tipo_categoria) p.push(`Tipo de servicio: ${TIPOS_SERVICIO.find(t => t.value === filtros.tipo_categoria)?.label || filtros.tipo_categoria}`);
    if (filtros.situacion) p.push(`Situación: ${SITUACIONES.find(x => x.value === filtros.situacion)?.titulo || filtros.situacion}`);
    if (filtros.cobertura) p.push(`Cobertura: ${filtros.cobertura === 'cuota' ? 'Por cuota' : 'General'}`);
    if (filtros.moneda) p.push(`Moneda: ${etiquetaDeMoneda(monedas, filtros.moneda)}`);
    if (filtros.servicio_desde) p.push(`Fecha servicio desde: ${filtros.servicio_desde}`);
    if (filtros.servicio_hasta) p.push(`Fecha servicio hasta: ${filtros.servicio_hasta}`);
    if (filtros.registro_desde) p.push(`Fecha registro desde: ${filtros.registro_desde}`);
    if (filtros.registro_hasta) p.push(`Fecha registro hasta: ${filtros.registro_hasta}`);
    if (filtros.desde) p.push(`Fecha comprobante desde: ${filtros.desde}`);
    if (filtros.hasta) p.push(`Fecha comprobante hasta: ${filtros.hasta}`);
    if (filtros.aprobacion_desde) p.push(`Aprobación cotización desde: ${filtros.aprobacion_desde}`);
    if (filtros.aprobacion_hasta) p.push(`Aprobación cotización hasta: ${filtros.aprobacion_hasta}`);
    return p;
  };

  // Trae el set COMPLETO según filtros activos (sin `page`) y exporta.
  const exportar = async (formato) => {
    try {
      setExportando(true);
      const resp = await facturasService.paginate({ ...filtros });
      const filas = Array.isArray(resp) ? resp : (resp?.data || []);
      if (!filas.length) { toast.error('No hay datos para exportar'); return; }
      const opts = {
        titulo: 'Facturas',
        subtitulo: 'Listado filtrado',
        columnas: COLUMNAS_EXPORT,
        filas,
        filtros: filtrosLegibles(),
        archivo: `facturas_${hoyISO()}.${formato === 'pdf' ? 'pdf' : 'xls'}`
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

  // Click en encabezado: si ya ordena por esa columna, alterna dirección;
  // si no, ordena por ella en ascendente.
  const ordenarPor = (col) => setFiltros(f => ({
    ...f,
    sort: col,
    dir: f.sort === col && f.dir === 'asc' ? 'desc' : 'asc'
  }));

  const propsTh = (col, align) => ({ col, align, sort: filtros.sort, dir: filtros.dir, onSort: ordenarPor });

  return (
    <>
      <PageHeader title="Facturas" subtitle={`${total.toLocaleString('es-PE')} factura(s)`}
        actions={
          <>
            {/* Filtro rápido por situación: el mismo criterio de las tarjetas
                del resumen. Es un interruptor — volver a pulsarlo lo quita. */}
            <div className="flex items-center gap-2 sm:mr-2" role="group" aria-label="Filtrar por situación">
              {SITUACIONES.map(sit => {
                const activo = filtros.situacion === sit.value;
                return (
                  <button
                    key={sit.value}
                    type="button"
                    aria-pressed={activo}
                    title={activo ? `Quitar el filtro «${sit.titulo}»` : sit.ayuda}
                    onClick={() => setF('situacion', activo ? '' : sit.value)}
                    className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium ring-1 transition ${activo ? sit.btnOn : sit.btnOff}`}
                  >
                    {sit.titulo}
                    {activo && <span aria-hidden="true" className="text-xs opacity-70">✕</span>}
                  </button>
                );
              })}
            </div>
            <button onClick={() => exportar('excel')} className="btn-secondary" disabled={exportando || total === 0}>Exportar Excel</button>
            <button onClick={() => exportar('pdf')} className="btn-primary" disabled={exportando || total === 0}>Exportar PDF</button>
          </>
        }
      />

      {resumen && (
        <div className="mb-4">
          <CardMetricaDoble
            titulo="Resumen del filtro actual"
            metricas={SITUACIONES.map(sit => ({
              titulo: sit.titulo,
              ayuda: sit.ayuda,
              cantidad: resumen[sit.clave]?.cantidad,
              montos: resumen[sit.clave]?.montos,
              unidad: 'factura(s)',
              tono: sit.tono,
              nota: sit.nota
            }))}
          />
        </div>
      )}

      <div className="card mb-4">
        <div className="p-4 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
          <input className="input lg:col-span-2"
            placeholder="Buscar por número, N° de operación, RUC/DNI, cliente, edificio o código de servicio…"
            value={filtros.q}
            onChange={e => setF('q', e.target.value)} />
          {/* Desplegable buscable de clientes registrados (filtra por nombre,
              RUC/DNI o teléfono) en lugar de un select con toda la cartera. */}
          <ClienteAutocomplete
            clientes={clientes}
            value={filtros.id_cliente}
            onChange={id => setF('id_cliente', id)}
            placeholder="Cliente (buscar…)"
            allowEmpty
            emptyLabel="Todos los clientes"
          />
          <select className="select" value={filtros.tipo_categoria} onChange={e => setF('tipo_categoria', e.target.value)}>
            <option value="">Todo tipo de servicio</option>
            {TIPOS_SERVICIO.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
          <select className="select" value={filtros.tipo_comprobante} onChange={e => setF('tipo_comprobante', e.target.value)}>
            <option value="">Todo comprobante</option>
            {TIPOS_COMPROBANTE.map(t => <option key={t.codigo} value={t.codigo}>{t.etiqueta}</option>)}
          </select>
          <select className="select" value={filtros.estado_factura} onChange={e => setF('estado_factura', e.target.value)}>
            <option value="">Todos los estados</option>
            {ESTADOS_FILTRO.map(e => <option key={e} value={e}>{e}</option>)}
          </select>
          <select className="select" value={filtros.cobertura} onChange={e => setF('cobertura', e.target.value)}>
            <option value="">Toda cobertura</option>
            <option value="general">General</option>
            <option value="cuota">Por cuota</option>
          </select>
          {/* La factura no guarda moneda: la hereda del cobro y, si no lo tiene,
              del servicio (igual que la columna «Moneda» del export). El backend
              filtra con esa misma regla. */}
          <FiltroMoneda monedas={monedas} value={filtros.moneda} onChange={v => setF('moneda', v)} />
          <DateRangePicker
            desde={filtros.servicio_desde}
            hasta={filtros.servicio_hasta}
            onChange={({ desde, hasta }) => setFiltros(f => ({ ...f, servicio_desde: desde, servicio_hasta: hasta }))}
            placeholder="Fecha de servicio (rango)"
          />
          <DateRangePicker
            desde={filtros.registro_desde}
            hasta={filtros.registro_hasta}
            onChange={({ desde, hasta }) => setFiltros(f => ({ ...f, registro_desde: desde, registro_hasta: hasta }))}
            placeholder="Fecha de registro (rango)"
          />
          <DateRangePicker
            desde={filtros.desde}
            hasta={filtros.hasta}
            onChange={({ desde, hasta }) => setFiltros(f => ({ ...f, desde, hasta }))}
            placeholder="Fecha de comprobante (rango)"
          />
          {/* Rango por FECHA DE APROBACIÓN de la cotización del servicio
              facturado, como en Contabilidad. Las facturas sin cotización
              detrás —planes de mantenimiento, servicios directos— no tienen
              esa fecha y no aparecen mientras el rango esté puesto. */}
          <DateRangePicker
            desde={filtros.aprobacion_desde}
            hasta={filtros.aprobacion_hasta}
            onChange={({ desde, hasta }) => setFiltros(f => ({ ...f, aprobacion_desde: desde, aprobacion_hasta: hasta }))}
            placeholder="Aprobación de cotización (rango)"
          />
          <button onClick={() => setFiltros(FILTROS_INICIALES)} className="btn-secondary lg:col-span-6">Limpiar filtros</button>
        </div>
      </div>

      <div className="card">
        {loading ? <Loader /> : data.length === 0 ? <EmptyState title="Sin facturas" subtitle="Ninguna factura coincide con los filtros." /> : (
          <>
            <div className="overflow-x-auto scroll-thin">
              <table className="table-base">
                <thead><tr>
                  <ThSort label="#" {...propsTh('correlativo')} />
                  {/* Fechas del servicio facturado (mismo criterio que
                      Contabilidad): no son columnas de la factura, por eso no ordenan. */}
                  <th className={`table-th ${TH_FECHA}`} title={AYUDA_FECHA_SERVICIO}><EtiquetaFecha>servicio</EtiquetaFecha></th>
                  <th className={`table-th ${TH_FECHA}`} title="Fecha en que se registró la OT del servicio facturado. En un correctivo sin OT, la aprobación de su cotización"><EtiquetaFecha>registro</EtiquetaFecha></th>
                  <ThSort label={<EtiquetaFecha>comprobante</EtiquetaFecha>} className={TH_FECHA} {...propsTh('fecha_emision')} />
                  <ThSort label="Serie y N° de factura" {...propsTh('numero_factura')} />
                  <ThSort label="Cliente" {...propsTh('cliente')} />
                  {/* El edificio cuelga de los ascensores del servicio o del
                      plan, no de la factura: se muestra pero no ordena. */}
                  <th className="table-th">Edificio</th>
                  <ThSort label="Servicio" {...propsTh('servicio')} />
                  {/* Categoría del servicio facturado. No ordena: se deriva de
                      tres cosas (tipo_registro del servicio, módulo de su
                      subtipo, y si la factura es de un plan sin servicio), así
                      que no hay una columna única por la que ordenarla. Para
                      acotar por ella está el filtro "Todo tipo de servicio". */}
                  <th className="table-th whitespace-nowrap">Tipo de servicio</th>
                  <ThSort label="Monto" {...propsTh('monto', 'right')} />
                  <ThSort label="Cobertura" {...propsTh('cobertura')} />
                  {/* Lista (un pago, un N°): no ordena. Se busca desde el buscador. */}
                  <th className="table-th whitespace-nowrap">N° de operación</th>
                  <ThSort label="Estado" {...propsTh('estado_factura')} />
                  <th className="table-th">Documentos</th>
                  <th className="table-th text-right">Acciones</th>
                </tr></thead>
                <tbody className="divide-y divide-slate-100">
                  {data.map((f, i) => (
                    <tr key={f.id} className="table-row-hover">
                      <td className="table-td text-xs font-mono text-slate-500">{(page - 1) * pageSize + i + 1}</td>
                      <td className={TD_FECHA}>
                        <FechaServicioCelda
                          programacion={f.fecha_servicio}
                          programacionHasta={f.fecha_servicio_hasta}
                          ejecucion={f.fecha_ejecucion}
                          ejecucionHasta={f.fecha_ejecucion_hasta}
                          vacio={(f.servicios_fechas || []).length ? '— (sin programar)' : '—'}
                          title={detalleFechasServicios(f)} />
                      </td>
                      <td className={TD_FECHA}><CeldaFechaRegistro factura={f} /></td>
                      <td className={`${TD_FECHA} whitespace-nowrap`}>{formatFecha(f.fecha_emision)}</td>
                      <td className="table-td">
                        {/* El número (serie y correlativo) abre el detalle de la
                            factura, desde donde se descarga el comprobante. */}
                        <button
                          type="button"
                          onClick={() => abrirDetalleFactura(f)}
                          className="font-mono text-xs text-brand-700 hover:underline"
                          title="Ver detalle del comprobante"
                        >{f.numero_factura}</button>
                        {/* Tipo de comprobante bajo el número: es lo que
                            distingue una factura de una boleta a simple vista. */}
                        <div className="text-[11px] text-slate-500">{etiquetaTipoComprobante(f.tipo_comprobante)}</div>
                      </td>
                      <td className="table-td text-sm">
                        {/* Ancho mínimo: la razón social se lee en dos líneas
                            como mucho, en vez de una palabra por renglón. */}
                        <div className="min-w-[15rem]">
                          {f.cliente?.nombre}
                          {docCliente(f.cliente) && <div className="text-[11px] text-slate-500 font-mono">{docCliente(f.cliente)}</div>}
                        </div>
                      </td>
                      <td className="table-td text-xs">{nombreEdificio(f) || '—'}</td>
                      <td className="table-td">
                        {f.servicio
                          ? <Link to={`/servicios/${f.servicio.id}`} className="font-mono text-xs text-brand-700">{f.servicio.codigo}</Link>
                          : <span className="badge-blue text-[10px]">Plan de mant.{f.mantenimiento_plan ? ` #${f.mantenimiento_plan.id}` : ''}</span>}
                      </td>
                      <td className="table-td text-xs whitespace-nowrap">{etiquetaTipoServicio(f) || '—'}</td>
                      <td className="table-td text-right font-mono whitespace-nowrap">{formatMonto(f.monto, monedaDe(f))}</td>
                      <td className="table-td text-xs">
                        {f.id_cuota
                          ? <span className="badge-blue">Cuota N° {f.cuota?.numero_cuota ?? '?'}</span>
                          : <span className="badge-violet">General</span>}
                      </td>
                      <td className="table-td"><ListaNumerosOperacion numeros={f.numeros_operacion} /></td>
                      <td className="table-td"><span className={badgeEstado(f.estado_factura)}>{f.estado_factura}</span></td>
                      <td className="table-td"><CeldaDocumentosFactura factura={f} onAbrir={() => setFacturaEditar(f)} /></td>
                      <td className="table-td text-right whitespace-nowrap">
                        {puedeAnular && (
                          <>
                            <button
                              type="button"
                              onClick={() => setFacturaEditar(f)}
                              className="text-brand-700 text-xs hover:underline"
                              title="Editar los datos, el comprobante y los documentos de la factura"
                            >Editar</button>
                            <span className="text-slate-300 mx-1.5">·</span>
                          </>
                        )}
                        {esFacturaActiva(f)
                          ? (puedeAnular
                              ? <button
                                  type="button"
                                  onClick={() => { setMotivoAnulacion(''); setFacturaAAnular(f); }}
                                  className="text-ember-700 text-xs hover:underline"
                                  title="Anular esta factura para poder emitir una nueva"
                                >Anular</button>
                              : <span className="text-slate-300">—</span>)
                          // Anulada: el servicio/cuota quedó libre; la nueva factura
                          // se emite desde el cobro, que es donde vive el formulario.
                          : f.id_cobro
                            ? <Link to={`/cobros/${f.id_cobro}`} className="text-brand-700 text-xs hover:underline">Emitir nueva</Link>
                            : <span className="text-slate-300">—</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination page={page} pageSize={pageSize} total={total} totalPages={totalPages}
              onPage={setPage} onPageSize={setPageSize} />
          </>
        )}
      </div>

      {/* Detalle de la factura: se abre desde su número (serie y correlativo) y
          permite ver o descargar el comprobante adjunto. */}
      <Modal
        open={!!facturaDetalle}
        onClose={() => setFacturaDetalle(null)}
        title={`Factura ${facturaDetalle?.numero_factura || ''}`}
        footer={<>
          <button type="button" className="btn-secondary" onClick={() => setFacturaDetalle(null)}>Cerrar</button>
          {facturaDetalle?.archivo && (
            <button type="button" className="btn-primary" onClick={() => descargarArchivo(facturaDetalle.archivo)}>
              Descargar comprobante
            </button>
          )}
        </>}>
        {facturaDetalle && (
          <div className="grid grid-cols-2 gap-3 text-sm">
            <Dato label="Número (serie y correlativo)" value={
              <>
                <span className="font-mono">{facturaDetalle.numero_factura}</span>
                <div className="text-[11px] text-slate-500">{etiquetaTipoComprobante(facturaDetalle.tipo_comprobante)}</div>
              </>
            } />
            <Dato label="Estado" value={<span className={badgeEstado(facturaDetalle.estado_factura)}>{facturaDetalle.estado_factura}</span>} />
            <Dato label="Cliente" value={facturaDetalle.cliente?.nombre} cols={2} />
            <Dato label="RUC / DNI" value={docCliente(facturaDetalle.cliente) || '—'} />
            <Dato label="Tipo de servicio" value={etiquetaTipoServicio(facturaDetalle) || '—'} />
            <Dato label="Servicio" value={
              facturaDetalle.servicio
                ? <Link to={`/servicios/${facturaDetalle.servicio.id}`} className="font-mono text-brand-700 hover:underline">{facturaDetalle.servicio.codigo}</Link>
                : <span className="badge-blue text-[10px]">Plan de mant.{facturaDetalle.mantenimiento_plan ? ` #${facturaDetalle.mantenimiento_plan.id}` : ''}</span>
            } />
            <Dato label="Cobro" value={
              facturaDetalle.id_cobro
                ? <Link to={`/cobros/${facturaDetalle.id_cobro}`} className="text-brand-700 hover:underline">Ver cobro</Link>
                : '—'
            } />
            <Dato label="Fecha de comprobante" value={formatFecha(facturaDetalle.fecha_emision)} />
            <Dato label="Fecha de servicio (programación)" value={textoRangoFechas(facturaDetalle, 'fecha_servicio') || '—'} />
            <Dato label="Fecha de ejecución" value={textoRangoFechas(facturaDetalle, 'fecha_ejecucion') || 'Sin ejecutar'} />
            <Dato label="Fecha de registro" value={textoRangoFechas(facturaDetalle, 'fecha_registro') || '— (sin OT)'} />
            <Dato label="Monto" value={<span className="font-mono">{formatMonto(facturaDetalle.monto, monedaDe(facturaDetalle))}</span>} />
            <Dato label="Cobertura" value={
              facturaDetalle.id_cuota
                ? <span className="badge-blue">Cuota N° {facturaDetalle.cuota?.numero_cuota ?? '?'}</span>
                : <span className="badge-violet">General</span>
            } />
            <Dato label="N° de operación" cols={2} value={<ListaNumerosOperacion numeros={facturaDetalle.numeros_operacion} className="text-sm" />} />
            <Dato label={`Archivos de la factura · ${archivosComprobanteDe(facturaDetalle).length}`} cols={2} value={
              archivosComprobanteDe(facturaDetalle).length
                ? (
                  <ul className="space-y-0.5">
                    {archivosComprobanteDe(facturaDetalle).map(a => (
                      <li key={a.id}>
                        <FileLink archivo={a} className="text-brand-700 hover:underline">
                          {a.nombre_original || 'Ver comprobante'}
                        </FileLink>
                      </li>
                    ))}
                  </ul>
                )
                : <span className="text-slate-400">Sin comprobante adjunto</span>
            } />
            <div className="col-span-2">
              <div className="flex items-center justify-between gap-2 mb-1">
                <div className="text-[10px] uppercase tracking-wider text-slate-400">
                  Documentos adicionales · {documentosAdicionalesDe(facturaDetalle).length}
                </div>
                <button
                  type="button"
                  className="text-brand-700 text-xs hover:underline"
                  onClick={() => { setFacturaEditar(facturaDetalle); setFacturaDetalle(null); }}
                >Editar factura</button>
              </div>
              {documentosAdicionalesDe(facturaDetalle).length
                ? <ListaDocumentosFactura documentos={documentosAdicionalesDe(facturaDetalle)} />
                : <span className="text-sm text-slate-400">Sin documentos adicionales</span>}
            </div>
            {facturaDetalle.detalle_mensual && (
              <div className="col-span-2 rounded-lg ring-1 ring-slate-200 bg-slate-50 p-3">
                <div className="text-[10px] uppercase tracking-wide text-slate-500 mb-1">
                  Mantenimientos facturados · {facturaDetalle.detalle_mensual.etiqueta} ·{' '}
                  {formatFecha(facturaDetalle.detalle_mensual.desde)} → {formatFecha(facturaDetalle.detalle_mensual.hasta)}
                </div>
                {facturaDetalle.detalle_mensual.detalle.length === 0 ? (
                  <p className="text-xs text-slate-500">Sin mantenimientos programados este mes.</p>
                ) : (
                  <ul className="text-xs space-y-0.5">
                    {facturaDetalle.detalle_mensual.detalle.map(d => (
                      <li key={d.id_ascensor} className="flex items-start justify-between gap-3">
                        <span className="font-mono text-slate-800">
                          {d.codigo} <span className="font-sans text-slate-500">× {d.visitas}</span>
                          {d.edificio && <span className="font-sans text-slate-400"> · {d.edificio}</span>}
                        </span>
                        <span className="text-slate-600 text-right">
                          {d.fechas.map(x => (
                            <span key={x.id_programacion} className={x.realizada ? 'text-emerald-700' : ''}>
                              {formatFecha(x.fecha)}{x.codigo_servicio ? ` (${x.codigo_servicio})` : ''}{' '}
                            </span>
                          ))}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
                <p className="text-[10px] text-slate-500 mt-1">
                  El importe del mes es fijo: no varía con el número de mantenimientos realizados.
                </p>
              </div>
            )}
          </div>
        )}
      </Modal>

      <EditarFacturaModal
        open={!!facturaEditar}
        onClose={() => setFacturaEditar(null)}
        factura={facturaEditar}
        onCambio={recargar}
      />

      {/* Anular factura: no la borra (queda como constancia con estado 'Anulada')
          y deja libre el servicio o la cuota para emitir una nueva. */}
      <Modal
        open={!!facturaAAnular}
        onClose={() => !anulando && setFacturaAAnular(null)}
        title="Anular factura"
        footer={<>
          <button type="button" className="btn-secondary" onClick={() => setFacturaAAnular(null)} disabled={anulando}>Cancelar</button>
          <button type="button" className="btn-danger" onClick={anularFactura} disabled={anulando}>
            {anulando ? 'Anulando…' : 'Anular factura'}
          </button>
        </>}>
        <div className="space-y-3 text-sm">
          <p>
            Se anulará la factura <span className="font-mono font-semibold">{facturaAAnular?.numero_factura}</span> de{' '}
            <strong>{facturaAAnular?.cliente?.nombre}</strong>
            {facturaAAnular?.id_cuota
              ? <> (cuota N° {facturaAAnular?.cuota?.numero_cuota ?? '?'})</>
              : <> (cobertura general)</>}
            {facturaAAnular?.estado_factura === ESTADO_FACTURA_ENVIADA && <>, que ya figura como <strong>Enviada</strong> al cliente</>}.
          </p>
          <p className="text-slate-600">
            La factura se conserva como constancia con estado <span className="badge-gray">Anulada</span> y
            {facturaAAnular?.id_cuota ? ' esa cuota' : ' el servicio'} vuelve a quedar disponible para emitir una nueva
            {facturaAAnular?.id_cobro ? <> desde el <Link to={`/cobros/${facturaAAnular.id_cobro}`} className="text-brand-700 underline">cobro</Link></> : null}.
            La anulación no se puede revertir.
          </p>
          <div>
            <label className="label">Motivo de la anulación *</label>
            <textarea
              className="textarea"
              rows={3}
              value={motivoAnulacion}
              onChange={e => setMotivoAnulacion(e.target.value)}
              placeholder="Ej.: error en el RUC del cliente, monto incorrecto, nota de crédito emitida…"
            />
            <p className="text-[11px] text-slate-500 mt-1">Queda registrado en la auditoría junto con el usuario y la fecha.</p>
          </div>
        </div>
      </Modal>
    </>
  );
}

// Tooltip de "Fecha servicio" cuando la factura cubre varios servicios (factura
// de plan): la programación y la ejecución de cada uno.
function detalleFechasServicios(factura) {
  const lista = factura.servicios_fechas || [];
  if (lista.length <= 1) return undefined;
  return lista.map(s => {
    const prog = s.fecha_servicio ? formatFecha(s.fecha_servicio) : 'sin programar';
    return `${s.codigo}: ${prog}${s.fecha_ejecucion ? ` · ejec. ${formatFecha(s.fecha_ejecucion)}` : ''}`;
  }).join('\n');
}

// Celda de "Fecha registro" (mismos textos que Contabilidad). Si la factura
// cubre varios servicios, da el rango y el tooltip detalla la de cada uno.
function CeldaFechaRegistro({ factura }) {
  const lista = factura.servicios_fechas || [];
  const title = lista.length > 1
    ? lista.map(s => `${s.codigo}: ${s.fecha_registro ? formatFecha(s.fecha_registro) : 'sin OT'}`).join('\n')
    : tituloFechaRegistro(factura);
  if (!factura.fecha_registro) {
    return <span className="text-slate-400 italic whitespace-nowrap" title={title}>{lista.length ? '— (sin OT)' : '—'}</span>;
  }
  const desde = formatFecha(factura.fecha_registro);
  const hasta = factura.fecha_registro_hasta ? formatFecha(factura.fecha_registro_hasta) : desde;
  return (
    <span className="block whitespace-nowrap" title={title}>
      {desde}
      {hasta !== desde && <span className="block text-[11px] text-slate-500">al {hasta}</span>}
    </span>
  );
}

// Par etiqueta/valor del detalle de factura.
function Dato({ label, value, cols = 1 }) {
  return (
    <div className={cols === 2 ? 'col-span-2' : ''}>
      <div className="text-[10px] uppercase tracking-wider text-slate-400">{label}</div>
      <div className="text-slate-800">{value || '—'}</div>
    </div>
  );
}
