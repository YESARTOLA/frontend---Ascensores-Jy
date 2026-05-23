import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ascensoresService, clientesService, tiposAscensorService } from '../services';
import PageHeader from '../components/common/PageHeader.jsx';
import Loader from '../components/common/Loader.jsx';
import Modal from '../components/common/Modal.jsx';
import EmptyState from '../components/common/EmptyState.jsx';
import Pagination, { usePaginatedList } from '../components/common/Pagination.jsx';
import { useToast } from '../components/common/Toast.jsx';
import { useAuth } from '../features/auth/AuthContext.jsx';
import { badgeEstado, formatFecha } from '../utils/formatters.js';

const inicial = {
  id_cliente: '', codigo: '', ubicacion: '', tipo: '', marca: '', modelo: '',
  capacidad: '', pisos: '', anio_aproximado: '', estado_operativo: 'Operativo',
  proximo_mantenimiento: '', observaciones: ''
};

const ESTADOS_OP = ['Operativo', 'En observación', 'Fuera de servicio', 'En instalación', 'En reparación', 'Inactivo'];

export default function Ascensores() {
  const [clientes, setClientes] = useState([]);
  const [tipos, setTipos] = useState([]);
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(inicial);
  const [editId, setEditId] = useState(null);
  const toast = useToast();
  const { esSuperAdmin, esAdmin, esCoordinador } = useAuth();
  const puedeEditar = esSuperAdmin || esAdmin || esCoordinador;

  const { data, loading, total, page, pageSize, totalPages, setPage, setPageSize, recargar } =
    usePaginatedList(ascensoresService.paginate, { q }, { initialPageSize: 25 });
  useEffect(() => {
    clientesService.list().then(setClientes).catch(() => setClientes([]));
    tiposAscensorService.list().then(setTipos).catch(() => setTipos([]));
  }, []);
  const cargar = recargar;

  const abrirNuevo = () => {
    setForm({ ...inicial, tipo: tipos[0]?.nombre || '' });
    setEditId(null);
    setOpen(true);
  };
  const abrirEdit = (a) => {
    setForm({
      id_cliente: a.id_cliente, codigo: a.codigo, ubicacion: a.ubicacion || '', tipo: a.tipo || '',
      marca: a.marca || '', modelo: a.modelo || '', capacidad: a.capacidad || '',
      pisos: a.pisos || '', anio_aproximado: a.anio_aproximado || '',
      estado_operativo: a.estado_operativo, proximo_mantenimiento: a.proximo_mantenimiento ? a.proximo_mantenimiento.substring(0, 10) : '',
      observaciones: a.observaciones || ''
    });
    setEditId(a.id);
    setOpen(true);
  };

  const guardar = async (e) => {
    e.preventDefault();
    try {
      if (editId) await ascensoresService.update(editId, form);
      else await ascensoresService.create(form);
      toast.success('Ascensor guardado');
      setOpen(false); cargar();
    } catch (err) { toast.error(err.response?.data?.error || 'Error al guardar'); }
  };

  return (
    <>
      <PageHeader title="Ascensores" subtitle={`${data.length} registro(s)`} actions={
        <>
          <input className="input max-w-xs" placeholder="Buscar código, marca, ubicación…" value={q} onChange={e => setQ(e.target.value)} />
          {puedeEditar && <button onClick={abrirNuevo} className="btn-primary">+ Nuevo ascensor</button>}
        </>
      } />

      <div className="card">
        {loading ? <Loader /> : data.length === 0 ? (
          <EmptyState title="Sin ascensores" action={puedeEditar && <button onClick={abrirNuevo} className="btn-primary">Crear ascensor</button>} />
        ) : (
          <>
            <div className="hidden md:block overflow-x-auto scroll-thin">
              <table className="table-base">
                <thead><tr>
                  <th className="table-th">Código</th><th className="table-th">Cliente</th>
                  <th className="table-th">Tipo / Marca</th><th className="table-th">Ubicación</th>
                  <th className="table-th">Estado</th><th className="table-th">Próx. mantenimiento</th>
                  <th className="table-th text-right">Acciones</th>
                </tr></thead>
                <tbody className="divide-y divide-slate-100">
                  {data.map(a => (
                    <tr key={a.id} className="table-row-hover">
                      <td className="table-td"><Link to={`/ascensores/${a.id}`} className="font-mono text-brand-700 hover:underline">{a.codigo}</Link></td>
                      <td className="table-td">{a.cliente?.nombre}</td>
                      <td className="table-td text-xs"><div>{a.tipo}</div><div className="text-slate-500">{a.marca} {a.modelo}</div></td>
                      <td className="table-td text-xs">{a.ubicacion || '—'}</td>
                      <td className="table-td"><span className={badgeEstado(a.estado_operativo)}>{a.estado_operativo}</span></td>
                      <td className="table-td text-xs">{formatFecha(a.proximo_mantenimiento)}</td>
                      <td className="table-td text-right space-x-2">
                        <Link to={`/ascensores/${a.id}`} className="text-brand-700 hover:underline text-xs">Historial</Link>
                        {puedeEditar && <button onClick={() => abrirEdit(a)} className="text-slate-600 text-xs">Editar</button>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="md:hidden divide-y divide-slate-100">
              {data.map(a => (
                <div key={a.id} className="p-4 flex items-start gap-3">
                  <div className="h-10 w-10 rounded-lg bg-brand-50 text-brand-700 grid place-items-center text-xs font-mono">{a.codigo.substring(-3) || 'A'}</div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <Link to={`/ascensores/${a.id}`} className="font-mono text-sm text-brand-700">{a.codigo}</Link>
                      <span className={badgeEstado(a.estado_operativo)}>{a.estado_operativo}</span>
                    </div>
                    <div className="text-sm text-slate-700 truncate">{a.cliente?.nombre}</div>
                    <div className="text-xs text-slate-500">{a.tipo} · {a.marca} {a.modelo}</div>
                    <div className="text-xs text-slate-500">{a.ubicacion}</div>
                    {puedeEditar && <button onClick={() => abrirEdit(a)} className="text-xs text-slate-600 mt-2">Editar</button>}
                  </div>
                </div>
              ))}
            </div>
            <Pagination page={page} pageSize={pageSize} total={total} totalPages={totalPages}
              onPage={setPage} onPageSize={setPageSize} />
          </>
        )}
      </div>

      <Modal open={open} onClose={() => setOpen(false)} title={editId ? 'Editar ascensor' : 'Nuevo ascensor'} size="lg"
        footer={<><button className="btn-secondary" onClick={() => setOpen(false)}>Cancelar</button><button className="btn-primary" onClick={guardar}>Guardar</button></>}>
        <form onSubmit={guardar} className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="label">Cliente *</label>
            <select className="select" required value={form.id_cliente} onChange={e => setForm(f => ({ ...f, id_cliente: e.target.value }))}>
              <option value="">— Seleccione —</option>
              {clientes.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Código único *</label>
            <input className="input" required value={form.codigo} onChange={e => setForm(f => ({ ...f, codigo: e.target.value }))} placeholder="ASC-JY-XXX" />
          </div>
          <div>
            <label className="label">Tipo</label>
            <select className="select" value={form.tipo} onChange={e => setForm(f => ({ ...f, tipo: e.target.value }))}>
              <option value="">— Seleccione —</option>
              {tipos.map(t => <option key={t.id} value={t.nombre}>{t.nombre}</option>)}
              {form.tipo && !tipos.some(t => t.nombre === form.tipo) && (
                <option value={form.tipo}>{form.tipo} (inactivo)</option>
              )}
            </select>
          </div>
          <div>
            <label className="label">Estado</label>
            <select className="select" value={form.estado_operativo} onChange={e => setForm(f => ({ ...f, estado_operativo: e.target.value }))}>
              {ESTADOS_OP.map(t => <option key={t}>{t}</option>)}
            </select>
          </div>
          <div><label className="label">Marca</label><input className="input" value={form.marca} onChange={e => setForm(f => ({ ...f, marca: e.target.value }))} /></div>
          <div><label className="label">Modelo</label><input className="input" value={form.modelo} onChange={e => setForm(f => ({ ...f, modelo: e.target.value }))} /></div>
          <div><label className="label">Capacidad</label><input className="input" value={form.capacidad} onChange={e => setForm(f => ({ ...f, capacidad: e.target.value }))} placeholder="8 personas / 1500 kg" /></div>
          <div><label className="label">Pisos</label><input type="number" className="input" value={form.pisos} onChange={e => setForm(f => ({ ...f, pisos: e.target.value }))} /></div>
          <div><label className="label">Año aproximado</label><input type="number" className="input" value={form.anio_aproximado} onChange={e => setForm(f => ({ ...f, anio_aproximado: e.target.value }))} /></div>
          <div><label className="label">Próximo mantenimiento</label><input type="date" className="input" value={form.proximo_mantenimiento} onChange={e => setForm(f => ({ ...f, proximo_mantenimiento: e.target.value }))} /></div>
          <div className="sm:col-span-2"><label className="label">Ubicación específica</label><input className="input" value={form.ubicacion} onChange={e => setForm(f => ({ ...f, ubicacion: e.target.value }))} /></div>
          <div className="sm:col-span-2"><label className="label">Observaciones</label><textarea className="textarea" rows="3" value={form.observaciones} onChange={e => setForm(f => ({ ...f, observaciones: e.target.value }))} /></div>
        </form>
      </Modal>
    </>
  );
}
