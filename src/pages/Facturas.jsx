import { Link } from 'react-router-dom';
import { facturasService } from '../services';
import PageHeader from '../components/common/PageHeader.jsx';
import Loader from '../components/common/Loader.jsx';
import EmptyState from '../components/common/EmptyState.jsx';
import Pagination, { usePaginatedList } from '../components/common/Pagination.jsx';
import { FileLink } from '../components/common/FilePreview.jsx';
import { badgeEstado, formatFecha, formatMonto } from '../utils/formatters.js';

export default function Facturas() {
  const { data, loading, total, page, pageSize, totalPages, setPage, setPageSize } =
    usePaginatedList(facturasService.paginate, {}, { initialPageSize: 25 });
  return (
    <>
      <PageHeader title="Facturas" subtitle={`${total.toLocaleString('es-PE')} factura(s)`} />
      <div className="card">
        {loading ? <Loader /> : data.length === 0 ? <EmptyState title="Sin facturas" /> : (
          <>
            <div className="overflow-x-auto scroll-thin">
              <table className="table-base">
                <thead><tr>
                  <th className="table-th">Número</th><th className="table-th">Cliente</th>
                  <th className="table-th">Servicio</th><th className="table-th">Emisión</th>
                  <th className="table-th text-right">Monto</th>
                  <th className="table-th">Cobertura</th>
                  <th className="table-th">Estado</th><th className="table-th">Archivo</th>
                </tr></thead>
                <tbody className="divide-y divide-slate-100">
                  {data.map(f => (
                    <tr key={f.id} className="table-row-hover">
                      <td className="table-td font-mono text-xs">{f.numero_factura}</td>
                      <td className="table-td text-sm">{f.cliente?.nombre}</td>
                      <td className="table-td"><Link to={`/servicios/${f.servicio?.id}`} className="font-mono text-xs text-brand-700">{f.servicio?.codigo}</Link></td>
                      <td className="table-td text-xs">{formatFecha(f.fecha_emision)}</td>
                      <td className="table-td text-right font-mono">{formatMonto(f.monto)}</td>
                      <td className="table-td text-xs">
                        {f.id_cuota
                          ? <span className="badge-blue">Cuota N° {f.cuota?.numero_cuota ?? '?'}</span>
                          : <span className="badge-violet">General</span>}
                      </td>
                      <td className="table-td"><span className={badgeEstado(f.estado_factura)}>{f.estado_factura}</span></td>
                      <td className="table-td">{f.archivo ? <FileLink archivo={f.archivo} className="text-brand-700 text-xs hover:underline">Ver</FileLink> : '—'}</td>
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
    </>
  );
}
