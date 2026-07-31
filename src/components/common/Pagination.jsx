import { useEffect, useMemo, useState } from 'react';

/**
 * Hook reutilizable para listas paginadas server-side.
 *
 * Espera que `fetcher({ page, pageSize, ...filtros })` devuelva el cuerpo
 * crudo del backend (ej. r.data?.data ?? r.data ya desempaquetado por el service):
 *   - paginado:    { data, total, page, pageSize, totalPages }
 *   - sin paginar: [...]   (array directo)
 *
 * Estado expuesto:
 *   data, total, totalPages, page, pageSize, loading, setPage, setPageSize, recargar.
 */
export function usePaginatedList(fetcher, filtros = {}, opts = {}) {
  const { initialPageSize = 25, deps = [] } = opts;
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(initialPageSize);
  const [data, setData] = useState([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [version, setVersion] = useState(0);

  const filtrosKey = JSON.stringify(filtros);

  useEffect(() => {
    let cancel = false;
    setLoading(true);
    Promise.resolve(fetcher({ page, pageSize, ...filtros }))
      .then(res => {
        if (cancel) return;
        if (Array.isArray(res)) {
          setData(res);
          setTotal(res.length);
          setTotalPages(1);
        } else if (res && Array.isArray(res.data)) {
          setData(res.data);
          setTotal(res.total ?? res.data.length);
          setTotalPages(res.totalPages ?? 1);
        } else {
          setData([]); setTotal(0); setTotalPages(1);
        }
      })
      .catch(() => { if (!cancel) { setData([]); setTotal(0); setTotalPages(1); } })
      .finally(() => { if (!cancel) setLoading(false); });
    return () => { cancel = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, pageSize, filtrosKey, version, ...deps]);

  // Si cambian los filtros, volver a la primera página
  useEffect(() => { setPage(1); }, [filtrosKey]);

  return {
    data, total, totalPages, page, pageSize, loading,
    setPage, setPageSize,
    recargar: () => setVersion(v => v + 1)
  };
}

/**
 * Controles de paginación. Se renderiza al pie de la tabla/lista.
 */
export default function Pagination({ page, pageSize, total, totalPages, onPage, onPageSize, pageSizes = [10, 25, 50, 100], className = '' }) {
  // El useMemo va antes de cualquier return: si el early return quedara arriba,
  // pasar de 0 a N resultados sin desmontar cambiaría el número de hooks
  // entre renders y React abortaría.
  const paginas = useMemo(() => {
    const arr = [];
    const max = totalPages;
    if (max <= 7) {
      for (let i = 1; i <= max; i++) arr.push(i);
      return arr;
    }
    arr.push(1);
    if (page > 4) arr.push('…');
    const inicio = Math.max(2, page - 2);
    const fin = Math.min(max - 1, page + 2);
    for (let i = inicio; i <= fin; i++) arr.push(i);
    if (page < max - 3) arr.push('…');
    arr.push(max);
    return arr;
  }, [page, totalPages]);

  if (total === 0) return null;
  const desde = (page - 1) * pageSize + 1;
  const hasta = Math.min(page * pageSize, total);

  return (
    <div className={`flex flex-col sm:flex-row items-center justify-between gap-3 px-3 py-3 border-t border-slate-100 ${className}`}>
      <div className="text-xs text-slate-500">
        <span className="font-medium text-slate-700">{desde.toLocaleString('es-PE')}</span>–
        <span className="font-medium text-slate-700">{hasta.toLocaleString('es-PE')}</span> de{' '}
        <span className="font-medium text-slate-700">{total.toLocaleString('es-PE')}</span>
      </div>
      <div className="flex items-center gap-3">
        {onPageSize && (
          <label className="text-xs text-slate-500 flex items-center gap-1.5">
            <span className="hidden sm:inline">por página</span>
            <select value={pageSize} onChange={e => onPageSize(Number(e.target.value))}
                    className="text-xs border border-slate-200 rounded px-1.5 py-0.5 bg-white">
              {pageSizes.map(n => <option key={n} value={n}>{n}</option>)}
            </select>
          </label>
        )}
        <nav className="inline-flex items-center gap-0.5">
          <button onClick={() => onPage(Math.max(1, page - 1))} disabled={page <= 1}
                  className="h-7 px-2 rounded-md text-xs border border-slate-200 bg-white hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed"
                  aria-label="Anterior">‹</button>
          {paginas.map((p, i) => (
            p === '…'
              ? <span key={`e${i}`} className="px-1.5 text-xs text-slate-400">…</span>
              : <button key={p} onClick={() => onPage(p)}
                        className={`h-7 min-w-[28px] px-2 rounded-md text-xs border ${p === page ? 'bg-brand-600 text-white border-brand-600' : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'}`}>
                  {p}
                </button>
          ))}
          <button onClick={() => onPage(Math.min(totalPages, page + 1))} disabled={page >= totalPages}
                  className="h-7 px-2 rounded-md text-xs border border-slate-200 bg-white hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed"
                  aria-label="Siguiente">›</button>
        </nav>
      </div>
    </div>
  );
}
