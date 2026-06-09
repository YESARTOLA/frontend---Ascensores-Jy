import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { serviciosService, clientesService } from '../services';
import PageHeader from '../components/common/PageHeader.jsx';
import Loader from '../components/common/Loader.jsx';
import EmptyState from '../components/common/EmptyState.jsx';
import Pagination, { usePaginatedList } from '../components/common/Pagination.jsx';
import DateRangePicker from '../components/common/DateRangePicker.jsx';
import OtModal from '../components/common/OtModal.jsx';
import { useToast } from '../components/common/Toast.jsx';
import { badgeEstado, formatFecha, formatMonto, codigosAscensores, resumenAscensores, hoyISO } from '../utils/formatters.js';
import { ESTADOS_COBRO } from '../utils/estadoCobro.js';
import { ESTADOS_FACTURACION } from '../utils/estadoFactura.js';
import { exportarExcelTabla, exportarPDFTabla } from '../utils/exportTabla.js';

const FILTROS_INICIALES = {
  q: '', id_cliente: '', estado_cobro: '', estado_facturacion: '', desde: '', hasta: ''
};

const EN_EJECUCION = 'En ejecución';

// Indica si el servicio realizado es gratuito / sin cobro (presentación de
// precio y estado de cobro distinta, alineada con la tabla).
const esGratuito = (r) => r.servicio?.sin_cobro === 1;

// Columnas del export (espejo de la tabla, sin la columna de acciones).
const COLUMNAS_EXPORT = [
  { header: 'Fecha', get: r => (r.estado_administrativo === EN_EJECUCION ? '' : formatFecha(r.fecha_realizacion)) },
  { header: 'Código', get: r => r.servicio?.codigo },
  { header: 'Cliente', get: r => r.servicio?.cliente?.nombre },
  { header: 'Ascensor', get: r => resumenAscensores(r.servicio) },
  { header: 'Etapa', badge: true, get: r => r.estado_administrativo || '' },
  { header: 'Precio', align: 'right', get: r => (esGratuito(r) ? 'Sin costo' : formatMonto(r.servicio?.precio_interno, r.servicio?.moneda)) },
  { header: 'Estado cobro', badge: true, get: r => (esGratuito(r) ? 'Sin cobro' : r.estado_cobro) },
  { header: 'Estado factura', badge: true, get: r => r.estado_facturacion }
];

export default function Contabilidad() {
  const [filtros, setFiltros] = useState(FILTROS_INICIALES);
  const [clientes, setClientes] = useState([]);
  const [exportando, setExportando] = useState(false);
  const [otAbierta, setOtAbierta] = useState(null); // { numero, archivo } | null
  const toast = useToast();

  const { data, loading, total, page, pageSize, totalPages, setPage, setPageSize } =
    usePaginatedList(serviciosService.realizadosPaginate, filtros, { initialPageSize: 25 });

  useEffect(() => { clientesService.list().then(setClientes).catch(() => setClientes([])); }, []);

  const setF = (k, v) => setFiltros(f => ({ ...f, [k]: v }));

  // Descripción legible de los filtros activos, para la cabecera del export.
  const filtrosLegibles = () => {
    const p = [];
    if (filtros.q) p.push(`Búsqueda: ${filtros.q}`);
    if (filtros.id_cliente) p.push(`Cliente: ${clientes.find(c => String(c.id) === String(filtros.id_cliente))?.nombre || filtros.id_cliente}`);
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

      <div className="card mb-4">
        <div className="p-4 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
          <input className="input lg:col-span-2"
            placeholder="Buscar por código de servicio o cliente…"
            value={filtros.q}
            onChange={e => setF('q', e.target.value)} />
          <select className="select" value={filtros.id_cliente} onChange={e => setF('id_cliente', e.target.value)}>
            <option value="">Todos los clientes</option>
            {clientes.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
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
                  <th className="table-th">Fecha</th><th className="table-th">Código</th>
                  <th className="table-th">Cliente / Ascensor</th>
                  <th className="table-th">Etapa</th>
                  <th className="table-th">OT</th>
                  <th className="table-th text-right">Precio</th>
                  <th className="table-th">Estado cobro</th><th className="table-th">Estado factura</th>
                  <th className="table-th text-right">Acciones</th>
                </tr></thead>
                <tbody className="divide-y divide-slate-100">
                  {data.map((r, idx) => {
                    const tieneOt = !!(r.numero_ot || r.archivo_ot);
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
                        <td className="table-td text-xs"><div>{r.servicio?.cliente?.nombre}</div><div className="font-mono text-slate-500" title={codigosAscensores(r.servicio).join(', ')}>{resumenAscensores(r.servicio)}</div></td>
                        <td className="table-td">
                          <span className={badgeEstado(r.estado_administrativo)}>{r.estado_administrativo || '—'}</span>
                        </td>
                        <td className="table-td">
                          {tieneOt ? (
                            <button
                              type="button"
                              onClick={() => setOtAbierta({ numero: r.numero_ot, archivo: r.archivo_ot })}
                              className="inline-flex items-center gap-1 text-brand-700 text-xs hover:underline font-mono"
                              title="Ver OT"
                            >
                              📄 {r.numero_ot || 'OT'}
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
                        <td className="table-td text-right space-x-3 whitespace-nowrap">
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

      <OtModal
        open={otAbierta !== null}
        onClose={() => setOtAbierta(null)}
        numero={otAbierta?.numero}
        archivo={otAbierta?.archivo}
      />
    </>
  );
}
