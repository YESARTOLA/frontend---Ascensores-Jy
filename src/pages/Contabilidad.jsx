import { useState } from 'react';
import { Link } from 'react-router-dom';
import { serviciosService, facturasService, archivosService } from '../services';
import PageHeader from '../components/common/PageHeader.jsx';
import Loader from '../components/common/Loader.jsx';
import EmptyState from '../components/common/EmptyState.jsx';
import Modal from '../components/common/Modal.jsx';
import Pagination, { usePaginatedList } from '../components/common/Pagination.jsx';
import DateRangePicker from '../components/common/DateRangePicker.jsx';
import OtModal from '../components/common/OtModal.jsx';
import CardMetrica from '../components/common/CardMetrica.jsx';
import { useToast } from '../components/common/Toast.jsx';
import { useAuth } from '../features/auth/AuthContext.jsx';
import { badgeEstado, formatFecha, formatMonto, codigosAscensores, resumenAscensores, nombreEdificioDeAscensores, hoyISO } from '../utils/formatters.js';
import { ESTADOS_COBRO } from '../utils/estadoCobro.js';
import { ESTADOS_FACTURACION, esFacturaActiva } from '../utils/estadoFactura.js';
import { TIPOS_COMPROBANTE, ejemploNumeroComprobante, tipoComprobanteSugerido } from '../utils/catalogosComprobante.js';
import { exportarExcelTabla, exportarPDFTabla } from '../utils/exportTabla.js';

const FILTROS_INICIALES = {
  q: '', tipo_categoria: '', situacion: '', estado_cobro: '', estado_facturacion: '', desde: '', hasta: ''
};

// Opciones del filtro de situación de pago (espejo de la columna "Situación").
const SITUACIONES = [
  { value: 'cancelado', label: 'Cancelado' },
  { value: 'pendiente', label: 'Pendiente' },
  { value: 'sin_cobro', label: 'Sin cobro' }
];

// Opciones del filtro por tipo de servicio. El value viaja al backend, que lo
// mapea a modulo_asociado / tipo_registro.
const TIPOS_CATEGORIA = [
  { value: 'correctivo', label: 'Correctivo' },
  { value: 'preventivo', label: 'Preventivo (mantenimiento)' },
  { value: 'proyecto', label: 'Proyecto' }
];

// Estados de cobro que se consideran "Cancelado" (pagado). El resto es "Pendiente".
const COBRO_CANCELADO = ['Pagado', 'Cerrado'];

const EN_EJECUCION = 'En ejecución';

// Estados administrativos PREVIOS a la aprobación: mientras el servicio operativo
// esté en cualquiera de ellos no es elegible para Contabilidad. Espejo de
// backend/utils/elegibilidadContable.js (ESTADOS_ADMIN_NO_HABILITA).
const ESTADOS_ADMIN_NO_HABILITA = ['En ejecución', 'Pendiente revisión', 'Observado', 'Rechazado'];

// ¿Se puede emitir la factura GENERAL del servicio desde esta pantalla?
// Espejo en el front de las validaciones de facturasController.crear, para no
// ofrecer un botón que el backend va a rechazar. El backend sigue siendo la
// autoridad: aquí solo se decide si mostrar la acción.
//
// Queda fuera (se factura en otro sitio o no se factura):
//   · mantenimientos de un PLAN → una sola factura por MES, desde el cobro
//     del plan (Cobros → Por facturar), por el monto mensual pactado;
//   · servicios marcados "Sin factura" (requiere_factura = 0) y los gratuitos;
//   · servicios aún no aprobados por la revisión administrativa;
//   · cobros que ya facturan POR CUOTA (la emisión va en Cobros → Por facturar);
//   · servicios que ya tienen su factura general emitida.
function motivoNoFacturable(r) {
  const s = r.servicio;
  if (!s) return 'Sin servicio asociado';
  if (s.id_mantenimiento_plan) return 'Pertenece a un plan: se factura una vez al mes, desde el cobro del plan';
  if (s.estado_servicio === 'Cancelado') return 'Servicio cancelado';
  if (s.sin_cobro === 1) return 'Servicio sin cobro (gratuito)';
  if (s.requiere_factura === 0) return 'Marcado como "Sin factura"';
  if (!s.id_cotizacion && ESTADOS_ADMIN_NO_HABILITA.includes(r.estado_administrativo)) {
    return 'Aún no aprobado por la revisión administrativa';
  }
  const facturas = (s.cobro?.facturas || []).filter(esFacturaActiva);
  if (facturas.some(f => f.id_cuota != null)) return 'Este cobro factura por cuota: emita desde Cobros → Por facturar';
  if (facturas.some(f => f.id_cuota == null)) return 'Ya tiene factura emitida';
  return null;
}

// Total cobrable del servicio: manda el monto del cobro; sin cobro creado, el
// precio del servicio (mismo criterio que usa el backend para validar).
const totalCobrable = (r) => Number(r.servicio?.cobro?.monto_total ?? r.servicio?.precio_interno ?? 0);

// Indica si el servicio realizado es gratuito / sin cobro (presentación de
// precio y estado de cobro distinta, alineada con la tabla).
const esGratuito = (r) => r.servicio?.sin_cobro === 1;

// Documento del cliente: "RUC 20..." / "DNI 4..." o '—' si no hay número.
const docCliente = (r) => {
  const c = r.servicio?.cliente;
  if (!c?.numero_documento) return '—';
  return `${c.tipo_documento || ''} ${c.numero_documento}`.trim();
};

// Fecha de emisión del comprobante: la factura activa más reciente del cobro.
const fechaComprobante = (r) => {
  const facturas = (r.servicio?.cobro?.facturas || []).filter(f => f.estado !== 0 && f.fecha_emision);
  if (!facturas.length) return null;
  return facturas.reduce((max, f) => (f.fecha_emision > max ? f.fecha_emision : max), facturas[0].fecha_emision);
};

// Tipo de servicio legible (nombre del subtipo).
const tipoServicioLabel = (r) => r.servicio?.tipo_servicio?.nombre || '—';

// Situación de pago: Sin cobro (gratuito) | Cancelado (pagado) | Pendiente.
const situacionPago = (r) => {
  if (esGratuito(r)) return 'Sin cobro';
  return COBRO_CANCELADO.includes(r.estado_cobro) ? 'Cancelado' : 'Pendiente';
};

// Columnas del export (espejo de la tabla, sin la columna de acciones).
const COLUMNAS_EXPORT = [
  { header: 'Fecha servicio', get: r => (r.estado_administrativo === EN_EJECUCION ? '' : formatFecha(r.fecha_realizacion)) },
  { header: 'Fecha comprobante', get: r => { const f = fechaComprobante(r); return f ? formatFecha(f) : ''; } },
  { header: 'Código', get: r => r.servicio?.codigo },
  { header: 'DNI / RUC', get: r => (docCliente(r) === '—' ? '' : docCliente(r)) },
  { header: 'Razón social', get: r => r.servicio?.cliente?.nombre },
  { header: 'Edificio', get: r => nombreEdificioDeAscensores(r.servicio) },
  { header: 'Ascensor', get: r => resumenAscensores(r.servicio) },
  { header: 'Tipo de servicio', get: r => tipoServicioLabel(r) },
  { header: 'Etapa', badge: true, get: r => r.estado_administrativo || '' },
  { header: 'Moneda', get: r => r.servicio?.moneda || '' },
  { header: 'Total', align: 'right', get: r => (esGratuito(r) ? 'Sin costo' : formatMonto(r.servicio?.precio_interno, r.servicio?.moneda)) },
  { header: 'Estado cobro', badge: true, get: r => (esGratuito(r) ? 'Sin cobro' : r.estado_cobro) },
  { header: 'Estado factura', badge: true, get: r => r.estado_facturacion },
  { header: 'Situación', badge: true, get: r => situacionPago(r) }
];

export default function Contabilidad() {
  const [filtros, setFiltros] = useState(FILTROS_INICIALES);
  const [exportando, setExportando] = useState(false);
  const [otAbierta, setOtAbierta] = useState(null); // { numero, archivo } | null
  // Emisión de la factura del servicio sin salir de Contabilidad.
  const [facturando, setFacturando] = useState(null); // fila en el modal | null
  const [factura, setFactura] = useState({
    numero_factura: '', tipo_comprobante: TIPOS_COMPROBANTE[0].codigo,
    fecha_emision: hoyISO(), monto: '', id_archivo: null
  });
  const [guardandoFactura, setGuardandoFactura] = useState(false);
  const toast = useToast();
  const { esSuperAdmin, esAdmin, esContabilidad } = useAuth();
  // Mismos roles que admite la ruta de facturas en el backend.
  const puedeFacturar = esSuperAdmin || esAdmin || esContabilidad;

  const { data, loading, total, page, pageSize, totalPages, setPage, setPageSize, recargar, meta } =
    usePaginatedList(serviciosService.realizadosPaginate, filtros, { initialPageSize: 25 });
  // Resumen de facturación del conjunto filtrado completo (no solo de la página
  // visible). Lo calcula el backend con el mismo `where` que la tabla y solo lo
  // envía a los roles con visibilidad financiera.
  const resumen = meta?.resumen_facturacion;

  const setF = (k, v) => setFiltros(f => ({ ...f, [k]: v }));

  // Descripción legible de los filtros activos, para la cabecera del export.
  const filtrosLegibles = () => {
    const p = [];
    if (filtros.q) p.push(`Búsqueda: ${filtros.q}`);
    if (filtros.tipo_categoria) p.push(`Tipo de servicio: ${TIPOS_CATEGORIA.find(t => t.value === filtros.tipo_categoria)?.label || filtros.tipo_categoria}`);
    if (filtros.situacion) p.push(`Situación: ${SITUACIONES.find(s => s.value === filtros.situacion)?.label || filtros.situacion}`);
    if (filtros.estado_cobro) p.push(`Estado cobro: ${filtros.estado_cobro}`);
    if (filtros.estado_facturacion) p.push(`Estado factura: ${filtros.estado_facturacion}`);
    if (filtros.desde) p.push(`Realización desde: ${filtros.desde}`);
    if (filtros.hasta) p.push(`Realización hasta: ${filtros.hasta}`);
    return p;
  };

  // Trae el set COMPLETO según filtros activos (sin `page`) y exporta.
  const exportar = async (formato) => {
    try {
      setExportando(true);
      const resp = await serviciosService.realizadosPaginate({ ...filtros });
      const filas = Array.isArray(resp) ? resp : (resp?.data || []);
      if (!filas.length) { toast.error('No hay datos para exportar'); return; }
      const opts = {
        titulo: 'Contabilidad',
        subtitulo: 'Servicios realizados (filtrado)',
        columnas: COLUMNAS_EXPORT,
        filas,
        filtros: filtrosLegibles(),
        archivo: `contabilidad_${hoyISO()}.${formato === 'pdf' ? 'pdf' : 'xls'}`
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

  // --- Emisión de factura desde la propia tabla -----------------------------

  const abrirFacturar = (r) => {
    setFactura({
      numero_factura: '',
      // Sugerencia por el documento del cliente (RUC → Factura, DNI → Boleta).
      // Es solo el valor inicial: el selector queda editable.
      tipo_comprobante: tipoComprobanteSugerido(r.servicio?.cliente?.tipo_documento),
      fecha_emision: hoyISO(),
      monto: totalCobrable(r).toFixed(2),
      id_archivo: null
    });
    setFacturando(r);
  };

  const cerrarFacturar = () => {
    if (guardandoFactura) return;
    setFacturando(null);
  };

  const subirArchivoFactura = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const fd = new FormData();
    fd.append('archivo', file);
    try {
      const r = await archivosService.upload(fd, 'facturas');
      setFactura(f => ({ ...f, id_archivo: r.id }));
      toast.success('Archivo cargado');
    } catch {
      toast.error('Error subiendo el archivo');
    }
  };

  const emitirFactura = async () => {
    if (!facturando || guardandoFactura) return;
    if (!factura.numero_factura.trim()) return toast.error('Número de comprobante obligatorio');
    if (!factura.fecha_emision) return toast.error('Fecha de emisión obligatoria');
    const monto = Number(factura.monto);
    if (!Number.isFinite(monto) || monto < 0) return toast.error('Monto inválido');
    const tope = totalCobrable(facturando);
    if (tope > 0 && monto - tope > 0.01) {
      return toast.error(`El monto no puede exceder el total del servicio (${formatMonto(tope, facturando.servicio?.moneda)})`);
    }
    setGuardandoFactura(true);
    try {
      await facturasService.create({
        id_servicio: facturando.id_servicio,
        numero_factura: factura.numero_factura.trim(),
        tipo_comprobante: factura.tipo_comprobante,
        fecha_emision: factura.fecha_emision,
        monto,
        id_archivo: factura.id_archivo
      });
      toast.success(`Factura ${factura.numero_factura.trim()} emitida`);
      setFacturando(null);
      recargar();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Error al emitir la factura');
    } finally {
      setGuardandoFactura(false);
    }
  };

  return (
    <>
      <PageHeader title="Contabilidad" subtitle={`${total.toLocaleString('es-PE')} servicio(s) realizado(s)`}
        actions={
          <>
            <button onClick={() => exportar('excel')} className="btn-secondary" disabled={exportando || total === 0}>Exportar Excel</button>
            <button onClick={() => exportar('pdf')} className="btn-primary" disabled={exportando || total === 0}>Exportar PDF</button>
          </>
        }
      />

      {resumen && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4 mb-4">
          <CardMetrica
            titulo="Por facturar"
            ayuda="Servicios que requieren comprobante y aún no lo tienen emitido por completo (incluye los parcialmente facturados). No cuenta los marcados «Sin factura» ni los gratuitos."
            cantidad={resumen.por_facturar?.cantidad}
            montos={resumen.por_facturar?.montos}
            unidad="servicio(s)"
            tono="amber"
          />
          <CardMetrica
            titulo="Facturado"
            ayuda="Servicios con la emisión completa (Facturado o Enviada)."
            cantidad={resumen.facturado?.cantidad}
            montos={resumen.facturado?.montos}
            unidad="servicio(s)"
            tono="green"
          />
        </div>
      )}

      <div className="card mb-4">
        <div className="p-4 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
          <input className="input lg:col-span-2"
            placeholder="Buscar por código, RUC/DNI, cliente, edificio o código de ascensor…"
            value={filtros.q}
            onChange={e => setF('q', e.target.value)} />
          <select className="select" value={filtros.tipo_categoria} onChange={e => setF('tipo_categoria', e.target.value)}>
            <option value="">Tipo de servicio (todos)</option>
            {TIPOS_CATEGORIA.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
          <select className="select" value={filtros.situacion} onChange={e => setF('situacion', e.target.value)}>
            <option value="">Situación (todas)</option>
            {SITUACIONES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select>
          <select className="select" value={filtros.estado_cobro} onChange={e => setF('estado_cobro', e.target.value)}>
            <option value="">Estado cobro (todos)</option>
            {ESTADOS_COBRO.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
          <select className="select" value={filtros.estado_facturacion} onChange={e => setF('estado_facturacion', e.target.value)}>
            <option value="">Estado factura (todos)</option>
            {ESTADOS_FACTURACION.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
          <DateRangePicker
            desde={filtros.desde}
            hasta={filtros.hasta}
            onChange={({ desde, hasta }) => setFiltros(f => ({ ...f, desde, hasta }))}
            placeholder="Rango de realización"
          />
          <button onClick={() => setFiltros(FILTROS_INICIALES)} className="btn-secondary lg:col-span-6">Limpiar filtros</button>
        </div>
      </div>

      <div className="card">
        {loading ? <Loader /> : data.length === 0 ? <EmptyState title="Sin servicios" /> : (
          <>
            <div className="overflow-x-auto scroll-thin">
              <table className="table-base">
                <thead><tr>
                  <th className="table-th">Fecha servicio</th>
                  <th className="table-th">Fecha comprobante</th>
                  <th className="table-th">Código</th>
                  <th className="table-th">DNI / RUC</th>
                  <th className="table-th">Razón social</th>
                  <th className="table-th">Edificio</th>
                  <th className="table-th">Tipo de servicio</th>
                  <th className="table-th">Etapa</th>
                  <th className="table-th">OT</th>
                  <th className="table-th text-right">Total</th>
                  <th className="table-th">Estado cobro</th><th className="table-th">Estado factura</th>
                  <th className="table-th">Situación</th>
                  <th className="table-th text-right">Acciones</th>
                </tr></thead>
                <tbody className="divide-y divide-slate-100">
                  {data.map((r, idx) => {
                    // La OT vive en el servicio (antes se copiaba al registro de realizado).
                    const ot = { numero: r.servicio?.numero_ot, archivo: r.servicio?.archivo_ot };
                    const tieneOt = !!(ot.numero || ot.archivo);
                    const enEjecucion = r.estado_administrativo === EN_EJECUCION;
                    // Servicios gratuitos / con cobertura: no se les crea cobro, así que
                    // el precio interno (referencial) y el estado_cobro almacenado pueden
                    // quedar "Pendiente de iniciar" por datos legacy. Sobreescribimos la
                    // presentación para que contabilidad los identifique al instante.
                    const gratuito = esGratuito(r);
                    const esMantenimientoGratuito = r.servicio?.es_mantenimiento_gratuito === 1;
                    return (
                      <tr key={r.id ?? `row-${idx}`} className="table-row-hover">
                        <td className="table-td text-xs">
                          {enEjecucion
                            ? <span className="text-slate-400 italic">— (sin ejecutar)</span>
                            : formatFecha(r.fecha_realizacion)}
                        </td>
                        <td className="table-td text-xs">
                          {(() => { const f = fechaComprobante(r); return f ? formatFecha(f) : <span className="text-slate-400">—</span>; })()}
                        </td>
                        <td className="table-td">
                          <Link to={`/servicios/${r.id_servicio}`} className="font-mono text-xs text-brand-700">{r.servicio?.codigo}</Link>
                          {gratuito && (
                            <div className="mt-0.5">
                              <span className="badge-green text-[10px]">
                                {esMantenimientoGratuito ? 'Mant. gratuito' : 'Sin cobro'}
                              </span>
                            </div>
                          )}
                        </td>
                        <td className="table-td text-xs font-mono whitespace-nowrap">{docCliente(r)}</td>
                        <td className="table-td text-xs">{r.servicio?.cliente?.nombre || '—'}</td>
                        <td className="table-td text-xs">
                          <div>{nombreEdificioDeAscensores(r.servicio) || '—'}</div>
                          <div className="font-mono text-slate-500" title={codigosAscensores(r.servicio).join(', ')}>{resumenAscensores(r.servicio)}</div>
                        </td>
                        <td className="table-td text-xs">{tipoServicioLabel(r)}</td>
                        <td className="table-td">
                          <span className={badgeEstado(r.estado_administrativo)}>{r.estado_administrativo || '—'}</span>
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
                        <td className="table-td text-right font-mono">
                          {gratuito
                            ? <span className="text-emerald-700">Sin costo</span>
                            : formatMonto(r.servicio?.precio_interno, r.servicio?.moneda)}
                        </td>
                        <td className="table-td">
                          {gratuito
                            ? <span className={badgeEstado('Sin cobro')}>Sin cobro</span>
                            : <span className={badgeEstado(r.estado_cobro)}>{r.estado_cobro}</span>}
                        </td>
                        <td className="table-td"><span className={badgeEstado(r.estado_facturacion)}>{r.estado_facturacion}</span></td>
                        <td className="table-td">
                          {(() => { const sit = situacionPago(r); return <span className={badgeEstado(sit === 'Cancelado' ? 'Pagado' : sit === 'Pendiente' ? 'Pendiente de iniciar' : 'Sin cobro')}>{sit}</span>; })()}
                        </td>
                        <td className="table-td text-right space-x-3 whitespace-nowrap">
                          {puedeFacturar && (motivoNoFacturable(r)
                            ? <span className="text-slate-300 text-xs cursor-help" title={motivoNoFacturable(r)}>Facturar</span>
                            : <button type="button" onClick={() => abrirFacturar(r)}
                                className="text-emerald-700 text-xs font-medium hover:underline">Facturar</button>
                          )}
                          {r.servicio?.cobro && <Link to={`/cobros/${r.servicio.cobro.id}`} className="text-brand-700 text-xs">Ir a cobro</Link>}
                          <Link to={`/servicios/${r.id_servicio}`} className="text-slate-600 text-xs">Detalle</Link>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <Pagination page={page} pageSize={pageSize} total={total} totalPages={totalPages}
              onPage={setPage} onPageSize={setPageSize} />
          </>
        )}
      </div>

      <Modal open={!!facturando} onClose={cerrarFacturar} title="Emitir comprobante" size="sm"
        footer={<>
          <button type="button" className="btn-secondary" onClick={cerrarFacturar} disabled={guardandoFactura}>Cancelar</button>
          <button type="button" className="btn-primary" onClick={emitirFactura} disabled={guardandoFactura}>
            {guardandoFactura ? 'Emitiendo…' : 'Emitir comprobante'}
          </button>
        </>}>
        {facturando && (
          <div className="space-y-3 text-sm">
            <div className="rounded-lg bg-slate-50 ring-1 ring-slate-200 p-3 text-xs space-y-1">
              <div><span className="text-slate-400">Cliente:</span> {facturando.servicio?.cliente?.nombre || '—'}</div>
              <div>
                <span className="text-slate-400">Servicio:</span>{' '}
                <span className="font-mono text-slate-800">{facturando.servicio?.codigo}</span>
                {' · '}{tipoServicioLabel(facturando)}
              </div>
              <div><span className="text-slate-400">Edificio:</span> {nombreEdificioDeAscensores(facturando.servicio) || '—'}</div>
              <div>
                <span className="text-slate-400">Total del servicio:</span>{' '}
                <span className="font-mono">{formatMonto(totalCobrable(facturando), facturando.servicio?.moneda)}</span>
              </div>
            </div>
            <div>
              <label className="label">Tipo de comprobante *</label>
              <select className="select" value={factura.tipo_comprobante}
                onChange={e => setFactura(f => ({ ...f, tipo_comprobante: e.target.value }))}>
                {TIPOS_COMPROBANTE.map(t => <option key={t.codigo} value={t.codigo}>{t.etiqueta}</option>)}
              </select>
              <p className="text-xs text-slate-500 mt-1">
                Sugerido por el documento del cliente ({docCliente(facturando)}); puede cambiarse.
              </p>
            </div>
            <div>
              <label className="label">Número de comprobante *</label>
              <input className="input" placeholder={ejemploNumeroComprobante(factura.tipo_comprobante)}
                value={factura.numero_factura}
                onChange={e => setFactura(f => ({ ...f, numero_factura: e.target.value }))} />
            </div>
            <div>
              <label className="label">Fecha de emisión *</label>
              <input type="date" className="input" value={factura.fecha_emision}
                onChange={e => setFactura(f => ({ ...f, fecha_emision: e.target.value }))} />
            </div>
            <div>
              <label className="label">Monto *</label>
              <input type="number" min="0" step="0.01" className="input text-right font-mono" value={factura.monto}
                onChange={e => setFactura(f => ({ ...f, monto: e.target.value }))} />
              <p className="text-xs text-slate-500 mt-1">
                Precargado con el total del servicio. Puede reducirse (factura parcial), nunca excederlo.
              </p>
            </div>
            <div>
              <label className="label">Archivo del comprobante</label>
              <input type="file" className="input" onChange={subirArchivoFactura} />
              {factura.id_archivo && <p className="text-xs text-emerald-600 mt-1">✓ Archivo cargado</p>}
            </div>
          </div>
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
