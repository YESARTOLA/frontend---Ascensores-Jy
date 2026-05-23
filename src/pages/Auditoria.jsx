import { useState } from 'react';
import { auditoriaService } from '../services';
import PageHeader from '../components/common/PageHeader.jsx';
import Loader from '../components/common/Loader.jsx';
import EmptyState from '../components/common/EmptyState.jsx';
import Pagination, { usePaginatedList } from '../components/common/Pagination.jsx';
import { formatFechaHora } from '../utils/formatters.js';

export default function Auditoria() {
  const [filtros, setFiltros] = useState({ entidad: '', accion: '' });
  const { data, loading, total, page, pageSize, totalPages, setPage, setPageSize } =
    usePaginatedList(auditoriaService.paginate, filtros, { initialPageSize: 50 });

  return (
    <>
      <PageHeader title="Auditoría" subtitle={`${total.toLocaleString('es-PE')} evento(s)`}
        actions={
          <>
            <select className="select max-w-xs" value={filtros.entidad} onChange={e => setFiltros(f => ({ ...f, entidad: e.target.value }))}>
              <option value="">Todas las entidades</option>
              <option>tbl_clientes</option><option>tbl_ascensores</option><option>tbl_servicios_proyectos</option>
              <option>tbl_cobros</option><option>tbl_pagos</option><option>tbl_facturas</option><option>tbl_usuarios</option>
            </select>
            <select className="select max-w-xs" value={filtros.accion} onChange={e => setFiltros(f => ({ ...f, accion: e.target.value }))}>
              <option value="">Todas las acciones</option>
              <option>CREATE</option><option>UPDATE</option><option>STATUS_CHANGE</option><option>DELETE</option>
            </select>
          </>
        } />

      <div className="card">
        {loading ? <Loader /> : data.length === 0 ? <EmptyState title="Sin eventos" /> : (
          <>
            <ul className="divide-y divide-slate-100">
              {data.map((e, idx) => (
                <li key={e.id ?? `row-${idx}`} className="p-3 sm:p-4 text-sm">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <span className="badge-blue mr-2">{e.accion}</span>
                      <span className="text-slate-700">{e.entidad}</span>
                      {e.id_entidad && <span className="text-slate-400 ml-2 text-xs">#{e.id_entidad}</span>}
                    </div>
                    <div className="text-xs text-slate-400">{formatFechaHora(e.fecha_evento)}</div>
                  </div>
                  <div className="mt-1 text-xs text-slate-500 flex flex-wrap items-center gap-x-2 gap-y-0.5">
                    {e.usuario ? (
                      <>
                        <span className="text-slate-700 font-medium">{e.usuario.nombres}</span>
                        {e.usuario.rol?.nombre && <span className="badge-gray text-[10px]">{e.usuario.rol.nombre}</span>}
                      </>
                    ) : (
                      <span>Usuario #{e.id_usuario || '?'}</span>
                    )}
                    {e.ip && <span>· IP {e.ip}</span>}
                  </div>
                </li>
              ))}
            </ul>
            <Pagination page={page} pageSize={pageSize} total={total} totalPages={totalPages}
              onPage={setPage} onPageSize={setPageSize} />
          </>
        )}
      </div>
    </>
  );
}
