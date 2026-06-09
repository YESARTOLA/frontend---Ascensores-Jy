import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { facturasService, clientesService } from '../services';
import PageHeader from '../components/common/PageHeader.jsx';
import Loader from '../components/common/Loader.jsx';
import EmptyState from '../components/common/EmptyState.jsx';
import Pagination, { usePaginatedList } from '../components/common/Pagination.jsx';
import DateRangePicker from '../components/common/DateRangePicker.jsx';
import { FileLink } from '../components/common/FilePreview.jsx';
import { useToast } from '../components/common/Toast.jsx';
import { badgeEstado, formatFecha, formatMonto, hoyISO } from '../utils/formatters.js';
import { ESTADOS_FACTURA, ESTADO_FACTURA_SIN } from '../utils/estadoFactura.js';
import { exportarExcelTabla, exportarPDFTabla } from '../utils/exportTabla.js';

const FILTROS_INICIALES = {
  q: '', id_cliente: '', estado_factura: '', cobertura: '', desde: '', hasta: '',
  // Orden por defecto: correlativo (id) ascendente → el 1 arriba.
  sort: 'correlativo', dir: 'asc'
};

// Columnas del export (espejo de la tabla, sin la columna de archivo).
const COLUMNAS_EXPORT = [
  { header: '#', get: (_f, i) => i + 1 },
  { header: 'Número', get: f => f.numero_factura },
  { header: 'Cliente', get: f => f.cliente?.nombre },
  { header: 'Servicio', get: f => f.servicio?.codigo },
  { header: 'Emisión', get: f => formatFecha(f.fecha_emision) },
  { header: 'Monto', align: 'right', get: f => formatMonto(f.monto) },
  { header: 'Cobertura', get: f => (f.id_cuota ? `Cuota N° ${f.cuota?.numero_cuota ?? '?'}` : 'General') },
  { header: 'Estado', badge: true, get: f => f.estado_factura }
];

// 'Sin factura' es el estado de facturación a nivel servicio; una fila de factura
// nunca lo tiene, así que se excluye del filtro para no ofrecer una opción vacía.
const ESTADOS_FILTRO = ESTADOS_FACTURA.filter(e => e !== ESTADO_FACTURA_SIN);

// Encabezado de columna ordenable.
function ThSort({ label, col, sort, dir, onSort, align = 'left' }) {
  const activo = sort === col;
  return (
    <th
      className={`table-th cursor-pointer select-none whitespace-nowrap ${align === 'right' ? 'text-right' : ''}`}
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
  const toast = useToast();

  const { data, loading, total, page, pageSize, totalPages, setPage, setPageSize } =
    usePaginatedList(facturasService.paginate, filtros, { initialPageSize: 25 });

  useEffect(() => { clientesService.list().then(setClientes).catch(() => setClientes([])); }, []);

  const setF = (k, v) => setFiltros(f => ({ ...f, [k]: v }));

  // Descripción legible de los filtros activos, para la cabecera del export.
  const filtrosLegibles = () => {
    const p = [];
    if (filtros.q) p.push(`Búsqueda: ${filtros.q}`);
    if (filtros.id_cliente) p.push(`Cliente: ${clientes.find(c => String(c.id) === String(filtros.id_cliente))?.nombre || filtros.id_cliente}`);
    if (filtros.estado_factura) p.push(`Estado: ${filtros.estado_factura}`);
    if (filtros.cobertura) p.push(`Cobertura: ${filtros.cobertura === 'cuota' ? 'Por cuota' : 'General'}`);
    if (filtros.desde) p.push(`Emisión desde: ${filtros.desde}`);
    if (filtros.hasta) p.push(`Emisión hasta: ${filtros.hasta}`);
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
            <button onClick={() => exportar('excel')} className="btn-secondary" disabled={exportando || total === 0}>Exportar Excel</button>
            <button onClick={() => exportar('pdf')} className="btn-primary" disabled={exportando || total === 0}>Exportar PDF</button>
          </>
        }
      />

      <div className="card mb-4">
        <div className="p-4 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
          <input className="input lg:col-span-2"
            placeholder="Buscar por número, cliente o código de servicio…"
            value={filtros.q}
            onChange={e => setF('q', e.target.value)} />
          <select className="select" value={filtros.id_cliente} onChange={e => setF('id_cliente', e.target.value)}>
            <option value="">Todos los clientes</option>
            {clientes.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
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
          <DateRangePicker
            desde={filtros.desde}
            hasta={filtros.hasta}
            onChange={({ desde, hasta }) => setFiltros(f => ({ ...f, desde, hasta }))}
            placeholder="Rango de emisión"
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
                  <ThSort label="Número" {...propsTh('numero_factura')} />
                  <ThSort label="Cliente" {...propsTh('cliente')} />
                  <ThSort label="Servicio" {...propsTh('servicio')} />
                  <ThSort label="Emisión" {...propsTh('fecha_emision')} />
                  <ThSort label="Monto" {...propsTh('monto', 'right')} />
                  <ThSort label="Cobertura" {...propsTh('cobertura')} />
                  <ThSort label="Estado" {...propsTh('estado_factura')} />
                  <th className="table-th">Archivo</th>
                </tr></thead>
                <tbody className="divide-y divide-slate-100">
                  {data.map((f, i) => (
                    <tr key={f.id} className="table-row-hover">
                      <td className="table-td text-xs font-mono text-slate-500">{(page - 1) * pageSize + i + 1}</td>
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
