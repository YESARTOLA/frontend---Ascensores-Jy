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
import { badgeEstado, formatFecha, nombreEdificio, nombreCliente } from '../utils/formatters.js';
import AscensorForm, { ascensorFormInicial } from '../components/ascensores/AscensorForm.jsx';

export default function Ascensores() {
  const [clientes, setClientes] = useState([]);
  const [tipos, setTipos] = useState([]);
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(ascensorFormInicial);
  const [editId, setEditId] = useState(null);
  // Cliente del edificio al editar, para precargar la lista de edificios del form.
  const [editCliente, setEditCliente] = useState('');
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
    setForm({ ...ascensorFormInicial, tipo: tipos[0]?.nombre || '' });
    setEditId(null);
    setEditCliente('');
    setOpen(true);
  };
  const abrirEdit = (a) => {
    setForm({
      id_edificio: a.id_edificio, codigo: a.codigo, ubicacion: a.ubicacion || '', tipo: a.tipo || '',
      marca: a.marca || '', modelo: a.modelo || '', capacidad: a.capacidad || '',
      pisos: a.pisos || '', anio_aproximado: a.anio_aproximado || '',
      estado_operativo: a.estado_operativo, proximo_mantenimiento: a.proximo_mantenimiento ? a.proximo_mantenimiento.substring(0, 10) : '',
      observaciones: a.observaciones || ''
    });
    setEditCliente(a.edificio?.cliente?.id ? String(a.edificio.cliente.id) : '');
    setEditId(a.id);
    setOpen(true);
  };

  const guardar = async () => {
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
                  <th className="table-th">Código</th><th className="table-th">Edificio / Obra</th>
                  <th className="table-th">Tipo / Marca</th><th className="table-th">Ubicación</th>
                  <th className="table-th">Estado</th><th className="table-th">Próx. mantenimiento</th>
                  <th className="table-th text-right">Acciones</th>
                </tr></thead>
                <tbody className="divide-y divide-slate-100">
                  {data.map(a => (
                    <tr key={a.id} className="table-row-hover">
                      <td className="table-td"><Link to={`/ascensores/${a.id}`} className="font-mono text-brand-700 hover:underline">{a.codigo}</Link></td>
                      <td className="table-td"><div>{nombreEdificio(a.edificio) || '—'}</div><div className="text-xs text-slate-500">{nombreCliente(a.edificio?.cliente)}</div></td>
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
                    <div className="text-sm text-slate-700 truncate">{nombreEdificio(a.edificio)}<span className="text-slate-400"> · {nombreCliente(a.edificio?.cliente)}</span></div>
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
        footer={<><button className="btn-secondary" onClick={() => setOpen(false)}>Cancelar</button><button className="btn-primary" type="submit" form="ascensor-form">Guardar</button></>}>
        <AscensorForm
          formId="ascensor-form"
          value={form}
          onChange={setForm}
          onSubmit={guardar}
          clientes={clientes}
          tipos={tipos}
          clienteInicial={editCliente}
        />
      </Modal>
    </>
  );
}
