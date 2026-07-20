import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ascensoresService, tiposAscensorService, tiposServicioService, edificiosService } from '../services';
import PageHeader from '../components/common/PageHeader.jsx';
import Loader from '../components/common/Loader.jsx';
import Modal from '../components/common/Modal.jsx';
import ConfirmarEliminacion from '../components/common/ConfirmarEliminacion.jsx';
import EmptyState from '../components/common/EmptyState.jsx';
import Pagination, { usePaginatedList } from '../components/common/Pagination.jsx';
import { useToast } from '../components/common/Toast.jsx';
import { useAuth } from '../features/auth/AuthContext.jsx';
import { badgeEstado, formatFecha, nombreEdificio, nombreCliente } from '../utils/formatters.js';
import AscensorForm, { ascensorFormInicial, ascensorToForm, ESTADOS_OPERATIVOS_ASCENSOR } from '../components/ascensores/AscensorForm.jsx';

const FILTROS_INICIALES = { q: '', id_edificio: '', tipo: '', estado_operativo: '', sort: '', dir: 'asc' };

export default function Ascensores() {
  const [tipos, setTipos] = useState([]);
  const [tiposServicio, setTiposServicio] = useState([]);
  const [edificios, setEdificios] = useState([]);
  const [filtros, setFiltros] = useState(FILTROS_INICIALES);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(ascensorFormInicial);
  const [editId, setEditId] = useState(null);
  // Confirmación de baja lógica (PATCH /ascensores/:id/estado → solo super_admin y admin).
  const [aEliminar, setAEliminar] = useState(null);
  const toast = useToast();
  const { esSuperAdmin, esAdmin, esCoordinador } = useAuth();
  const puedeEditar = esSuperAdmin || esAdmin || esCoordinador;
  const puedeEliminar = esSuperAdmin || esAdmin;

  const { data, loading, total, page, pageSize, totalPages, setPage, setPageSize, recargar } =
    usePaginatedList(ascensoresService.paginate, filtros, { initialPageSize: 25 });
  useEffect(() => {
    tiposAscensorService.list().then(setTipos).catch(() => setTipos([]));
    tiposServicioService.list().then(setTiposServicio).catch(() => setTiposServicio([]));
    edificiosService.list().then(setEdificios).catch(() => setEdificios([]));
  }, []);
  const setF = (k, v) => setFiltros(f => ({ ...f, [k]: v }));
  const hayFiltros = filtros.q || filtros.id_edificio || filtros.tipo || filtros.estado_operativo;

  // Ordenamiento por columna: clic en la cabecera alterna asc/desc.
  const ordenarPor = (campo) => setFiltros(f => ({
    ...f, sort: campo, dir: f.sort === campo && f.dir === 'asc' ? 'desc' : 'asc'
  }));
  const indicadorOrden = (campo) => filtros.sort === campo ? (filtros.dir === 'asc' ? ' ▲' : ' ▼') : '';
  const cargar = recargar;

  const abrirNuevo = () => {
    setForm({ ...ascensorFormInicial, tipo: tipos[0]?.nombre || '' });
    setEditId(null);
    setOpen(true);
  };
  const abrirEdit = async (a) => {
    // El listado ya incluye precios; si faltara, se piden del detalle.
    let full = a;
    if (!Array.isArray(a.precios)) {
      try { full = await ascensoresService.get(a.id); } catch { /* usa la fila */ }
    }
    setForm(ascensorToForm(full));
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

  // Baja lógica del ascensor: estado = 0 (Inactivo) + cascada sobre sus planes.
  const eliminar = async () => {
    if (!aEliminar) return;
    try {
      await ascensoresService.setEstado(aEliminar.id, 0);
      toast.success('Ascensor eliminado (inactivo)');
      setAEliminar(null);
      cargar();
    } catch (err) { toast.error(err.response?.data?.error || 'No se pudo eliminar el ascensor'); }
  };

  return (
    <>
      <PageHeader title="Ascensores" subtitle={`${total} registro(s)`} actions={
        <>
          <input className="input max-w-xs" placeholder="Buscar código, marca, ubicación…" value={filtros.q} onChange={e => setF('q', e.target.value)} />
          {puedeEditar && <button onClick={abrirNuevo} className="btn-primary">+ Nuevo ascensor</button>}
        </>
      } />

      <div className="card mb-4">
        <div className="p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <div>
            <label className="label">Edificio / Obra</label>
            <select className="select" value={filtros.id_edificio} onChange={e => setF('id_edificio', e.target.value)}>
              <option value="">Todos los edificios</option>
              {edificios.map(ed => (
                <option key={ed.id} value={ed.id}>{nombreEdificio(ed)}{ed.cliente?.nombre ? ` · ${ed.cliente.nombre}` : ''}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Tipo</label>
            <select className="select" value={filtros.tipo} onChange={e => setF('tipo', e.target.value)}>
              <option value="">Todos los tipos</option>
              {tipos.map(t => <option key={t.id} value={t.nombre}>{t.nombre}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Estado</label>
            <select className="select" value={filtros.estado_operativo} onChange={e => setF('estado_operativo', e.target.value)}>
              <option value="">Todos los estados</option>
              {/* 'Inactivo' equivale a baja lógica (estado 0): esos no salen en este listado. */}
              {ESTADOS_OPERATIVOS_ASCENSOR.filter(s => s !== 'Inactivo').map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div className="flex items-end">
            <button onClick={() => setFiltros(FILTROS_INICIALES)} className="btn-secondary w-full" disabled={!hayFiltros}>Limpiar</button>
          </div>
        </div>
      </div>

      <div className="card">
        {loading ? <Loader /> : data.length === 0 ? (
          <EmptyState title="Sin ascensores" action={puedeEditar && <button onClick={abrirNuevo} className="btn-primary">Crear ascensor</button>} />
        ) : (
          <>
            <div className="hidden md:block overflow-x-auto scroll-thin">
              <table className="table-base">
                <thead><tr>
                  {[
                    { campo: 'codigo', label: 'Código' },
                    { campo: 'edificio', label: 'Edificio / Obra' },
                    { campo: 'tipo', label: 'Tipo / Marca' },
                    { campo: 'ubicacion', label: 'Ubicación' },
                    { campo: 'estado', label: 'Estado' },
                    { campo: 'proximo_mantenimiento', label: 'Próx. mantenimiento' }
                  ].map(c => (
                    <th key={c.campo} className="table-th">
                      <button type="button" onClick={() => ordenarPor(c.campo)}
                        className="inline-flex items-center hover:text-brand-700"
                        title="Ordenar por esta columna">
                        {c.label}<span className="text-brand-600">{indicadorOrden(c.campo)}</span>
                      </button>
                    </th>
                  ))}
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
                        {puedeEliminar && <button onClick={() => setAEliminar(a)} className="text-rose-600 text-xs">Eliminar</button>}
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
                    <div className="mt-2 flex items-center gap-3">
                      {puedeEditar && <button onClick={() => abrirEdit(a)} className="text-xs text-slate-600">Editar</button>}
                      {puedeEliminar && <button onClick={() => setAEliminar(a)} className="text-xs text-rose-600">Eliminar</button>}
                    </div>
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
          tipos={tipos}
          tiposServicio={tiposServicio}
        />
      </Modal>

      <ConfirmarEliminacion
        open={!!aEliminar}
        onClose={() => setAEliminar(null)}
        titulo="Eliminar ascensor (baja lógica)"
        palabraClave="ELIMINAR"
        textoBoton="Eliminar ascensor"
        onConfirmar={eliminar}
        descripcion={
          <div className="space-y-1.5">
            <p>Al eliminar <span className="font-semibold">{aEliminar?.codigo}</span> se dará de baja lógica (no se borra físicamente). Esto implica:</p>
            <ul className="list-disc list-inside space-y-1">
              <li>Pasa a estado <span className="font-semibold">Inactivo</span> y desaparece de este listado y de la selección para servicios y planes.</li>
              <li>Se cancelan sus planes de mantenimiento; se conserva el historial ya ejecutado o cobrado.</li>
              <li>Seguirás viéndolo, marcado como Inactivo, en la <span className="font-semibold">página del cliente (Ver 360)</span>, desde donde podrás reactivarlo editándolo.</li>
            </ul>
          </div>
        }
      />
    </>
  );
}
