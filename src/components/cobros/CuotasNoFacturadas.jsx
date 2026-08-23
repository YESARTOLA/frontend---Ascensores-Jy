import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { cobrosService, facturasService, archivosService } from '../../services';
import Loader from '../common/Loader.jsx';
import EmptyState from '../common/EmptyState.jsx';
import Combobox from '../common/Combobox.jsx';
import Modal from '../common/Modal.jsx';
import Pagination from '../common/Pagination.jsx';
import { useToast } from '../common/Toast.jsx';
import { formatFecha, formatFechaHora, formatMonto, hoyISO } from '../../utils/formatters.js';
import { TIPOS_COMPROBANTE, ejemploNumeroComprobante, tipoComprobanteSugerido } from '../../utils/catalogosComprobante.js';
import { exportarExcelTabla, exportarPDFTabla } from '../../utils/exportTabla.js';

// Espejo de las opciones del filtro por tipo de servicio de Cobros.jsx.
const TIPOS_CATEGORIA = [
  { value: 'correctivo', label: 'Correctivo' },
  { value: 'preventivo', label: 'Preventivo (mantenimiento)' },
  { value: 'proyecto', label: 'Proyecto' }
];

const TZ = 'America/Lima';

// Estado visual de la cuota respecto de hoy (pagada / vencida / próxima /
// pendiente). Mismo criterio de colores que el calendario de cobros.
function estadoCuota(cu, hoyKey) {
  if (cu.estado_cuota === 'Pagada' || Number(cu.monto_pagado) >= Number(cu.monto)) {
    return { texto: 'Pagada', color: '#22c55e' };
  }
  const venc = new Date(cu.fecha_vencimiento).toLocaleDateString('en-CA', { timeZone: TZ });
  if (venc < hoyKey) return { texto: 'Vencida', color: '#ef4444' };
  const diasDif = Math.floor((new Date(cu.fecha_vencimiento) - new Date(hoyKey)) / 86400000);
  if (diasDif <= 7) return { texto: 'Próxima', color: '#f59e0b' };
  if (Number(cu.monto_pagado) > 0) return { texto: 'Parcial', color: '#3b82f6' };
  return { texto: 'Pendiente', color: '#3b82f6' };
}

const docCliente = (f) => {
  if (!f.cliente?.numero_documento) return '—';
  return `${f.cliente.tipo_documento || ''} ${f.cliente.numero_documento}`.trim();
};

// Las cuotas de un plan de mantenimiento son MESES del plan; el resto son
// cuotas correlativas del cobro. La etiqueta refleja cuál es cuál.
const etiquetaCuota = (f) =>
  f.detalle_mensual?.etiqueta || `${f.numero_cuota}/${f.cobro?.numero_cuotas ?? '?'}`;

const proyectoTitulo = (f) =>
  f.servicio?.titulo || (f.mantenimiento_plan ? 'Plan de mantenimiento' : '—');

const FILTROS_INIT = {
  q: '', id_cliente: '', id_proyecto: '', tipo_categoria: '',
  fecha_desde: '', fecha_hasta: '', orden: '', direccion: ''
};

// Columnas del export (espejo de la tabla).
const COLUMNAS_EXPORT = [
  { header: 'Cliente', get: f => f.cliente?.nombre },
  { header: 'DNI / RUC', get: f => (docCliente(f) === '—' ? '' : docCliente(f)) },
  { header: 'Edificio', get: f => f.edificio || '' },
  { header: 'Proyecto', get: f => (proyectoTitulo(f) === '—' ? '' : proyectoTitulo(f)) },
  { header: 'Servicio', get: f => f.servicio?.codigo || '' },
  { header: 'Tipo de servicio', get: f => f.tipo_servicio || '' },
  { header: 'Cuota', get: f => etiquetaCuota(f) },
  { header: 'Fecha de vencimiento', get: f => (f.fecha_vencimiento ? formatFecha(f.fecha_vencimiento) : '') },
  { header: 'Fecha de registro', get: f => (f.fecha_registro ? formatFecha(f.fecha_registro) : '') },
  { header: 'Monto cuota', align: 'right', get: f => formatMonto(f.monto, f.cobro?.moneda) },
  { header: 'Pagado', align: 'right', get: f => (Number(f.monto_pagado) > 0 ? formatMonto(f.monto_pagado, f.cobro?.moneda) : '') },
  { header: 'Estado', badge: true, get: f => estadoCuota(f, hoyISO()).texto }
];

export default function CuotasNoFacturadas({ clientes = [], proyectos = [] }) {
  const [filtros, setFiltros] = useState(FILTROS_INIT);
  const [data, setData] = useState([]);
  const [resumen, setResumen] = useState(null);
  const [loading, setLoading] = useState(true);
  const [exportando, setExportando] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [version, setVersion] = useState(0);
  // Facturación directa desde la fila: cuota en curso + estado del formulario.
  const [facturarCuota, setFacturarCuota] = useState(null);
  const [factura, setFactura] = useState({ numero_factura: '', fecha_emision: hoyISO(), id_archivo: null });
  const [guardandoFactura, setGuardandoFactura] = useState(false);
  const toast = useToast();

  const filtrosKey = JSON.stringify(filtros);
  const hoyKey = new Date().toLocaleDateString('en-CA', { timeZone: TZ });

  useEffect(() => {
    let cancel = false;
    setLoading(true);
    cobrosService.cuotasNoFacturadas({ page, pageSize, ...filtros })
      .then(res => {
        if (cancel) return;
        setData(Array.isArray(res?.data) ? res.data : []);
        setTotal(res?.total ?? res?.data?.length ?? 0);
        setTotalPages(res?.totalPages ?? 1);
        setResumen(res?.resumen ?? null);
      })
      .catch(() => { if (!cancel) { setData([]); setTotal(0); setTotalPages(1); setResumen(null); } })
      .finally(() => { if (!cancel) setLoading(false); });
    return () => { cancel = true; };
  }, [page, pageSize, filtrosKey, version]);

  // Al cambiar filtros, volver a la primera página.
  useEffect(() => { setPage(1); }, [filtrosKey]);

  const setF = (k, v) => setFiltros(f => ({ ...f, [k]: v }));
  const limpiar = () => setFiltros(FILTROS_INIT);

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

  const filtrosLegibles = () => {
    const p = [];
    if (filtros.q) p.push(`Búsqueda: ${filtros.q}`);
    if (filtros.id_cliente) p.push(`Cliente: ${clientes.find(c => String(c.id) === String(filtros.id_cliente))?.nombre || filtros.id_cliente}`);
    if (filtros.id_proyecto) p.push(`Proyecto: ${proyectos.find(pr => String(pr.id) === String(filtros.id_proyecto))?.titulo || filtros.id_proyecto}`);
    if (filtros.tipo_categoria) p.push(`Tipo de servicio: ${TIPOS_CATEGORIA.find(t => t.value === filtros.tipo_categoria)?.label || filtros.tipo_categoria}`);
    if (filtros.fecha_desde) p.push(`Venc. desde: ${filtros.fecha_desde}`);
    if (filtros.fecha_hasta) p.push(`Venc. hasta: ${filtros.fecha_hasta}`);
    return p;
  };

  // Trae el set COMPLETO (sin page) según filtros activos y exporta.
  const exportar = async (formato) => {
    try {
      setExportando(true);
      const resp = await cobrosService.cuotasNoFacturadas({ ...filtros });
      const filas = Array.isArray(resp) ? resp : (resp?.data || []);
      if (!filas.length) { toast.error('No hay datos para exportar'); return; }
      const opts = {
        titulo: 'Cuotas por facturar',
        subtitulo: 'Cuotas pendientes de facturación',
        columnas: COLUMNAS_EXPORT,
        filas,
        filtros: filtrosLegibles(),
        archivo: `cuotas_por_facturar_${hoyISO()}.${formato === 'pdf' ? 'pdf' : 'xls'}`
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

  const recargar = () => setVersion(v => v + 1);

  // Abre el modal de factura por-cuota precargado para la cuota de la fila.
  const abrirFacturar = (f) => {
    setFactura({
      numero_factura: '',
      // Sugerencia por el documento del cliente (RUC → Factura, DNI → Boleta).
      tipo_comprobante: tipoComprobanteSugerido(f.cliente?.tipo_documento),
      fecha_emision: hoyISO(),
      id_archivo: null
    });
    setFacturarCuota(f);
  };

  const subirArchivoFactura = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const fd = new FormData(); fd.append('archivo', file);
    try {
      const r = await archivosService.upload(fd, 'facturas');
      setFactura(f => ({ ...f, id_archivo: r.id }));
      toast.success('Archivo cargado');
    } catch { toast.error('Error subiendo archivo'); }
  };

  // Emite una factura POR CUOTA directamente. El monto lo fija el backend =
  // monto de la cuota; se envía id_servicio o id_mantenimiento_plan según el
  // origen del cobro. Al terminar, refresca la lista (la cuota desaparece).
  const guardarFactura = async () => {
    if (guardandoFactura || !facturarCuota) return;
    if (!factura.numero_factura.trim()) return toast.error('Número de comprobante obligatorio');
    const cu = facturarCuota;
    const payload = {
      numero_factura: factura.numero_factura.trim(),
      tipo_comprobante: factura.tipo_comprobante,
      fecha_emision: factura.fecha_emision,
      monto: Number(cu.monto),
      id_cuota: cu.id,
      id_archivo: factura.id_archivo
    };
    if (cu.servicio?.id) payload.id_servicio = cu.servicio.id;
    else if (cu.mantenimiento_plan?.id) payload.id_mantenimiento_plan = cu.mantenimiento_plan.id;
    else return toast.error('La cuota no tiene servicio ni plan asociado');

    setGuardandoFactura(true);
    try {
      await facturasService.create(payload);
      toast.success(`Cuota N° ${cu.numero_cuota} facturada`);
      setFacturarCuota(null);
      recargar();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Error al facturar la cuota');
    } finally {
      setGuardandoFactura(false);
    }
  };

  return (
    <>
      {/* Resumen */}
      {resumen && (
        <div className="card mb-4">
          <div className="p-4 grid grid-cols-2 sm:grid-cols-4 gap-4">
            <Resumen label="Cuotas por facturar" value={resumen.total_cuotas} />
            <Resumen label="Monto a facturar" value={formatMonto(resumen.total_monto)} cls="text-brand-700" />
            <Resumen label="Saldo por cobrar" value={formatMonto(resumen.total_por_cobrar)} cls="text-rose-700" />
            <div className="col-span-2 sm:col-span-1 flex items-end justify-end gap-2">
              <button onClick={() => exportar('excel')} className="btn-secondary text-xs" disabled={exportando || data.length === 0}>Excel</button>
              <button onClick={() => exportar('pdf')} className="btn-primary text-xs" disabled={exportando || data.length === 0}>PDF</button>
            </div>
          </div>
        </div>
      )}

      {/* Filtros — z-20 para que el desplegable del combobox de proyectos no
          quede tapado por la tarjeta de la tabla (cada .card crea su propio
          contexto de apilamiento por el backdrop-blur). */}
      <div className="card mb-4 relative z-20">
        <div className="p-4 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
          <input className="input col-span-2 sm:col-span-3 lg:col-span-2" placeholder="Buscar cliente, servicio o RUC/DNI…" value={filtros.q} onChange={e => setF('q', e.target.value)} />
          <select className="select" value={filtros.id_cliente} onChange={e => setF('id_cliente', e.target.value)}>
            <option value="">Todos los clientes</option>
            {clientes.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
          </select>
          <select className="select" value={filtros.tipo_categoria} onChange={e => setF('tipo_categoria', e.target.value)}>
            <option value="">Tipo de servicio (todos)</option>
            {TIPOS_CATEGORIA.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
          <Combobox
            className="col-span-2 sm:col-span-2 lg:col-span-2"
            options={opcionesProyectos}
            value={filtros.id_proyecto || null}
            onChange={v => setF('id_proyecto', v ?? '')}
            placeholder="Todos los proyectos"
            emptyLabel="Sin proyectos que coincidan"
          />
          <input type="date" className="input" title="Vencimiento desde" value={filtros.fecha_desde} onChange={e => setF('fecha_desde', e.target.value)} />
          <input type="date" className="input" title="Vencimiento hasta" value={filtros.fecha_hasta} onChange={e => setF('fecha_hasta', e.target.value)} />
          <button onClick={limpiar} className="btn-secondary col-span-2 sm:col-span-1">Limpiar</button>
        </div>
      </div>

      {loading ? (
        <div className="card"><Loader /></div>
      ) : data.length === 0 ? (
        <div className="card"><EmptyState title="Sin cuotas por facturar" subtitle="Todas las cuotas de los cobros activos ya tienen factura, o no hay cuotas que coincidan con los filtros." /></div>
      ) : (
        <>
          {/* Tabla (desktop) */}
          <div className="card hidden md:block">
            <div className="overflow-x-auto scroll-thin">
              <table className="table-base">
                <thead><tr>
                  <ThOrden col="cliente" filtros={filtros} ordenarPor={ordenarPor}>Cliente</ThOrden>
                  <th className="table-th">DNI / RUC</th>
                  <th className="table-th">Edificio</th>
                  <ThOrden col="proyecto" filtros={filtros} ordenarPor={ordenarPor}>Proyecto</ThOrden>
                  <ThOrden col="servicio" filtros={filtros} ordenarPor={ordenarPor}>Servicio</ThOrden>
                  <th className="table-th">Tipo de servicio</th>
                  <ThOrden col="cuota" filtros={filtros} ordenarPor={ordenarPor} align="center">Cuota</ThOrden>
                  <ThOrden col="vencimiento" filtros={filtros} ordenarPor={ordenarPor}>Fecha de vencimiento</ThOrden>
                  <th className="table-th">Fecha de registro</th>
                  <ThOrden col="monto" filtros={filtros} ordenarPor={ordenarPor} align="right">Monto cuota</ThOrden>
                  <th className="table-th text-right">Pagado</th>
                  <th className="table-th">Estado</th>
                  <th className="table-th text-right">Acciones</th>
                </tr></thead>
                <tbody className="divide-y divide-slate-100">
                  {data.map(f => {
                    const est = estadoCuota(f, hoyKey);
                    return (
                      <tr key={f.id} className="table-row-hover">
                        <td className="table-td text-sm">{f.cliente?.nombre}</td>
                        <td className="table-td text-xs font-mono whitespace-nowrap">{docCliente(f)}</td>
                        <td className="table-td text-xs">{f.edificio || <span className="text-slate-400">—</span>}</td>
                        <td className="table-td text-sm">
                          <div className="truncate max-w-[220px]" title={proyectoTitulo(f)}>{proyectoTitulo(f)}</div>
                          {f.facturacion_parcial && (
                            <div className="text-[10px] text-amber-600">Facturación por cuota en curso</div>
                          )}
                        </td>
                        <td className="table-td whitespace-nowrap">
                          {f.servicio ? (
                            <Link to={`/servicios/${f.servicio.id}`} className="font-mono text-xs text-brand-700 hover:underline">{f.servicio.codigo}</Link>
                          ) : (
                            <span className="badge-blue text-[10px]">Plan de mantenimiento{f.mantenimiento_plan ? ` #${f.mantenimiento_plan.id}` : ''}</span>
                          )}
                        </td>
                        <td className="table-td text-xs">{f.tipo_servicio || <span className="text-slate-400">—</span>}</td>
                        <td className="table-td text-center text-xs whitespace-nowrap">{etiquetaCuota(f)}</td>
                        <td className="table-td text-xs whitespace-nowrap">{formatFecha(f.fecha_vencimiento)}</td>
                        <td className="table-td text-xs whitespace-nowrap text-slate-500">{f.fecha_registro ? formatFechaHora(f.fecha_registro) : '—'}</td>
                        <td className="table-td text-right font-mono">{formatMonto(f.monto, f.cobro?.moneda)}</td>
                        <td className="table-td text-right font-mono text-emerald-700">{Number(f.monto_pagado) > 0 ? formatMonto(f.monto_pagado, f.cobro?.moneda) : <span className="text-slate-400">—</span>}</td>
                        <td className="table-td">
                          <span className="text-xs px-2 py-0.5 rounded-full whitespace-nowrap" style={{ backgroundColor: `${est.color}22`, color: est.color }}>{est.texto}</span>
                        </td>
                        <td className="table-td text-right whitespace-nowrap space-x-2">
                          <button type="button" onClick={() => abrirFacturar(f)} className="btn-primary text-xs !py-1 !px-2.5">Facturar</button>
                          <Link to={`/cobros/${f.cobro?.id}`} className="text-brand-700 text-xs hover:underline">Ver cobro</Link>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Cards (móvil) */}
          <div className="md:hidden grid gap-3">
            {data.map(f => {
              const est = estadoCuota(f, hoyKey);
              return (
                <div key={f.id} className="card p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="font-medium text-sm truncate">{f.cliente?.nombre}</div>
                      <div className="text-[11px] text-slate-500 font-mono">{docCliente(f)}</div>
                      {f.edificio && <div className="text-[11px] text-slate-500 truncate">{f.edificio}</div>}
                      <div className="text-xs text-slate-700 truncate">{proyectoTitulo(f)}</div>
                      {f.servicio ? (
                        <Link to={`/servicios/${f.servicio.id}`} className="font-mono text-xs text-brand-700 hover:underline">{f.servicio.codigo}</Link>
                      ) : (
                        <span className="badge-blue text-[10px]">Plan de mantenimiento{f.mantenimiento_plan ? ` #${f.mantenimiento_plan.id}` : ''}</span>
                      )}
                    </div>
                    <span className="text-xs px-2 py-0.5 rounded-full shrink-0" style={{ backgroundColor: `${est.color}22`, color: est.color }}>{est.texto}</span>
                  </div>
                  <div className="grid grid-cols-3 gap-2 mt-3 text-xs">
                    <Mini label={f.detalle_mensual ? "Mes" : "Cuota"} value={etiquetaCuota(f)} />
                    <Mini label="Vencimiento" value={formatFecha(f.fecha_vencimiento)} />
                    <Mini label="Monto" value={formatMonto(f.monto, f.cobro?.moneda)} />
                    <Mini label="Registrada" value={f.fecha_registro ? formatFecha(f.fecha_registro) : '—'} />
                    {Number(f.monto_pagado) > 0 && <Mini label="Pagado" value={formatMonto(f.monto_pagado, f.cobro?.moneda)} cls="text-emerald-700" />}
                    {f.tipo_servicio && <Mini label="Tipo" value={f.tipo_servicio} />}
                  </div>
                  <div className="mt-3 flex gap-2">
                    <button type="button" onClick={() => abrirFacturar(f)} className="btn-primary text-xs flex-1">Facturar</button>
                    <Link to={`/cobros/${f.cobro?.id}`} className="btn-secondary text-xs flex-1 text-center">Ver cobro</Link>
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
      )}

      {/* Modal facturar cuota (factura por cuota, directa desde la fila) */}
      <Modal
        open={facturarCuota !== null}
        onClose={() => !guardandoFactura && setFacturarCuota(null)}
        title={facturarCuota ? `Facturar cuota N° ${facturarCuota.numero_cuota}` : 'Facturar cuota'}
        footer={
          <>
            <button className="btn-secondary" onClick={() => setFacturarCuota(null)} disabled={guardandoFactura}>Cancelar</button>
            <button className="btn-primary" onClick={guardarFactura} disabled={guardandoFactura}>{guardandoFactura ? 'Facturando…' : 'Facturar'}</button>
          </>
        }
      >
        {facturarCuota && (
          <div className="space-y-4">
            <div className="rounded-md bg-slate-50 ring-1 ring-slate-200 px-3 py-2 text-xs text-slate-600 space-y-0.5">
              <div><span className="text-slate-400">Cliente:</span> <span className="text-slate-800 font-medium">{facturarCuota.cliente?.nombre}</span></div>
              <div>
                <span className="text-slate-400">{facturarCuota.servicio ? 'Servicio' : 'Plan'}:</span>{' '}
                <span className="font-mono text-slate-800">{facturarCuota.servicio?.codigo || `Plan de mantenimiento${facturarCuota.mantenimiento_plan ? ` #${facturarCuota.mantenimiento_plan.id}` : ''}`}</span>
              </div>
              <div>
                <span className="text-slate-400">{facturarCuota.detalle_mensual ? 'Mes:' : 'Cuota:'}</span>{' '}
                {etiquetaCuota(facturarCuota)} · vence {formatFecha(facturarCuota.fecha_vencimiento)}
              </div>
              {facturarCuota.detalle_mensual && (
                <div className="mt-2 rounded-md ring-1 ring-slate-200 bg-white p-2">
                  <div className="text-[10px] uppercase tracking-wide text-slate-500 mb-1">
                    Mantenimientos del mes ({facturarCuota.detalle_mensual.total_visitas})
                  </div>
                  {facturarCuota.detalle_mensual.detalle.length === 0 ? (
                    <p className="text-slate-500">Sin mantenimientos programados este mes.</p>
                  ) : (
                    <ul className="space-y-0.5">
                      {facturarCuota.detalle_mensual.detalle.map(d => (
                        <li key={d.id_ascensor} className="flex items-start justify-between gap-2">
                          <span className="font-mono">{d.codigo} <span className="font-sans text-slate-500">× {d.visitas}</span></span>
                          <span className="text-slate-500 text-right">{d.fechas.map(x => formatFecha(x.fecha)).join(', ')}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                  <p className="text-[10px] text-slate-500 mt-1">El importe del mes es fijo y no varía con estos mantenimientos.</p>
                </div>
              )}
              {facturarCuota.facturacion_parcial && (
                <div className="text-amber-600">Este cobro ya factura por cuota.</div>
              )}
            </div>
            <div>
              <label className="label">Tipo de comprobante *</label>
              <select className="select" value={factura.tipo_comprobante}
                onChange={e => setFactura(f => ({ ...f, tipo_comprobante: e.target.value }))}>
                {TIPOS_COMPROBANTE.map(t => <option key={t.codigo} value={t.codigo}>{t.etiqueta}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Número de comprobante *</label>
              <input className="input" value={factura.numero_factura} onChange={e => setFactura(f => ({ ...f, numero_factura: e.target.value }))} placeholder={ejemploNumeroComprobante(factura.tipo_comprobante)} />
            </div>
            <div>
              <label className="label">Fecha de emisión *</label>
              <input type="date" className="input" value={factura.fecha_emision} onChange={e => setFactura(f => ({ ...f, fecha_emision: e.target.value }))} />
            </div>
            <div>
              <label className="label">Monto</label>
              <input className="input bg-slate-100 cursor-not-allowed" value={formatMonto(facturarCuota.monto, facturarCuota.cobro?.moneda)} readOnly />
              <p className="text-xs text-slate-500 mt-1">Fijado por el monto de la cuota.</p>
            </div>
            <div>
              <label className="label">Archivo de factura</label>
              <input type="file" className="input" onChange={subirArchivoFactura} />
              {factura.id_archivo && <p className="text-xs text-emerald-600 mt-1">✓ Archivo cargado</p>}
            </div>
          </div>
        )}
      </Modal>
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

function Resumen({ label, value, cls = '' }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider text-slate-400">{label}</div>
      <div className={`text-lg font-semibold ${cls}`}>{value}</div>
    </div>
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
