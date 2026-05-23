import { useState } from 'react';
import { Link } from 'react-router-dom';
import { serviciosService } from '../services';
import PageHeader from '../components/common/PageHeader.jsx';
import Loader from '../components/common/Loader.jsx';
import EmptyState from '../components/common/EmptyState.jsx';
import Pagination, { usePaginatedList } from '../components/common/Pagination.jsx';
import OtModal from '../components/common/OtModal.jsx';
import { badgeEstado, formatFecha, formatMonto, codigosAscensores, resumenAscensores } from '../utils/formatters.js';

export default function Contabilidad() {
  const { data, loading, total, page, pageSize, totalPages, setPage, setPageSize } =
    usePaginatedList(serviciosService.realizadosPaginate, {}, { initialPageSize: 25 });
  const [otAbierta, setOtAbierta] = useState(null); // { numero, archivo } | null

  return (
    <>
      <PageHeader title="Contabilidad" subtitle={`${total.toLocaleString('es-PE')} servicio(s) realizado(s)`} />
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
                    const enEjecucion = r.estado_administrativo === 'En ejecución';
                    // Servicios gratuitos / con cobertura: no se les crea cobro, así que
                    // el precio interno (referencial) y el estado_cobro almacenado pueden
                    // quedar "Pendiente de iniciar" por datos legacy. Sobreescribimos la
                    // presentación para que contabilidad los identifique al instante.
                    const esGratuito = r.servicio?.sin_cobro === 1;
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
                          {esGratuito && (
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
                          {esGratuito
                            ? <span className="text-emerald-700">Sin costo</span>
                            : formatMonto(r.servicio?.precio_interno, r.servicio?.moneda)}
                        </td>
                        <td className="table-td">
                          {esGratuito
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
