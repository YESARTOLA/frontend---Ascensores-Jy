import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { serviciosService } from '../services';
import PageHeader from '../components/common/PageHeader.jsx';
import Loader from '../components/common/Loader.jsx';
import EmptyState from '../components/common/EmptyState.jsx';
import Modal from '../components/common/Modal.jsx';
import { FileLink } from '../components/common/FilePreview.jsx';
import Pagination, { usePaginatedList } from '../components/common/Pagination.jsx';
import { useToast } from '../components/common/Toast.jsx';
import { badgeEstado, formatFecha, formatMonto, codigosAscensores, resumenAscensores } from '../utils/formatters.js';
import { useAuth } from '../features/auth/AuthContext.jsx';

export default function ServiciosRealizados() {
  const [openDetalle, setOpenDetalle] = useState(null);
  const toast = useToast();
  const { puedeVerPrecio, esSuperAdmin, esAdmin, esContabilidad, esTecnico } = useAuth();
  const puedeRevisar = esSuperAdmin || esAdmin || esContabilidad;
  const verCobroFactura = !esTecnico;

  const { data, loading, total, page, pageSize, totalPages, setPage, setPageSize, recargar } =
    usePaginatedList(serviciosService.realizadosPaginate, {}, { initialPageSize: 25 });
  const cargar = recargar;

  const revisar = async (id) => {
    const obs = prompt('Observaciones de la revisión (opcional):') || '';
    try {
      await serviciosService.revisar(id, obs);
      toast.success('Servicio revisado');
      cargar();
    } catch (err) { toast.error(err.response?.data?.error || 'Error'); }
  };

  return (
    <>
      <PageHeader title="Servicios realizados" subtitle={`${total.toLocaleString('es-PE')} servicio(s) finalizado(s)`} />
      <div className="card">
        {loading ? <Loader /> : data.length === 0 ? <EmptyState title="Sin servicios realizados" /> : (
          <div className="overflow-x-auto scroll-thin">
            <table className="table-base">
              <thead><tr>
                <th className="table-th">Fecha</th><th className="table-th">Código</th>
                <th className="table-th">Cliente / Ascensor</th><th className="table-th">Tipo</th>
                <th className="table-th">Técnicos</th><th className="table-th">Resp. doc</th>
                <th className="table-th text-center">Guía</th>
                <th className="table-th text-center">Evid.</th>
                <th className="table-th text-center">Checklist</th>
                <th className="table-th">Admin.</th>
                {verCobroFactura && <th className="table-th">Cobro</th>}
                {verCobroFactura && <th className="table-th">Factura</th>}
                {puedeVerPrecio && <th className="table-th text-right">Precio</th>}
                <th className="table-th text-right">Acciones</th>
              </tr></thead>
              <tbody className="divide-y divide-slate-100">
                {data.map(r => {
                  const docu = r.servicio?.asignaciones?.find(a => a.responsable_documentacion === 1);
                  const guias = r.servicio?.guias || [];
                  const evidencias = r.servicio?.evidencias || [];
                  return (
                    <tr key={r.id} className="table-row-hover">
                      <td className="table-td text-xs">{formatFecha(r.fecha_realizacion)}</td>
                      <td className="table-td"><Link to={`/servicios/${r.id_servicio}`} className="font-mono text-xs text-brand-700">{r.servicio?.codigo}</Link></td>
                      <td className="table-td text-xs"><div>{r.servicio?.cliente?.nombre}</div><div className="font-mono text-slate-500" title={codigosAscensores(r.servicio).join(', ')}>{resumenAscensores(r.servicio)}</div></td>
                      <td className="table-td text-xs">{r.servicio?.tipo_servicio?.nombre}</td>
                      <td className="table-td text-xs">{r.servicio?.asignaciones?.map(a => a.tecnico?.nombre).join(', ') || '—'}</td>
                      <td className="table-td text-xs">{docu?.tecnico?.nombre || '—'}</td>
                      <td className="table-td text-center text-xs">
                        {guias.length > 0
                          ? (guias[0].archivo ? <FileLink archivo={guias[0].archivo}>{guias.length}</FileLink> : guias.length)
                          : <span className="text-rose-500">0</span>}
                      </td>
                      <td className="table-td text-center text-xs">{evidencias.length}</td>
                      <td className="table-td text-center text-xs">
                        {r.servicio?.checklists?.[0]?.estado_checklist
                          ? <span className={badgeEstado(r.servicio.checklists[0].estado_checklist)}>{r.servicio.checklists[0].estado_checklist}</span>
                          : '—'}
                      </td>
                      <td className="table-td"><span className={badgeEstado(r.estado_administrativo)}>{r.estado_administrativo}</span></td>
                      {verCobroFactura && <td className="table-td"><span className={badgeEstado(r.estado_cobro)}>{r.estado_cobro}</span></td>}
                      {verCobroFactura && <td className="table-td"><span className={badgeEstado(r.estado_facturacion)}>{r.estado_facturacion}</span></td>}
                      {puedeVerPrecio && <td className="table-td text-right font-mono">{formatMonto(r.servicio?.precio_interno, r.servicio?.moneda)}</td>}
                      <td className="table-td text-right whitespace-nowrap space-x-2">
                        {(r.observaciones_tecnicas || r.descargo_tecnico) && (
                          <button onClick={() => setOpenDetalle(r)} className="text-brand-700 text-xs hover:underline">Notas</button>
                        )}
                        {puedeRevisar && r.servicio?.estado_servicio === 'En revisión administrativa' && (
                          <button onClick={() => revisar(r.id_servicio)} className="text-emerald-700 text-xs hover:underline">Revisar</button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        {!loading && data.length > 0 && (
          <Pagination page={page} pageSize={pageSize} total={total} totalPages={totalPages}
            onPage={setPage} onPageSize={setPageSize} />
        )}
      </div>

      <Modal open={!!openDetalle} onClose={() => setOpenDetalle(null)} title={`Notas técnicas · ${openDetalle?.servicio?.codigo || ''}`}>
        <div className="space-y-3 text-sm">
          {openDetalle?.observaciones_tecnicas && (
            <div>
              <p className="text-xs uppercase tracking-wider text-slate-400 mb-1">Observaciones técnicas</p>
              <p className="text-slate-700 whitespace-pre-line">{openDetalle.observaciones_tecnicas}</p>
            </div>
          )}
          {openDetalle?.descargo_tecnico && (
            <div>
              <p className="text-xs uppercase tracking-wider text-slate-400 mb-1">Descargo técnico</p>
              <p className="text-slate-700 whitespace-pre-line">{openDetalle.descargo_tecnico}</p>
            </div>
          )}
        </div>
      </Modal>
    </>
  );
}
