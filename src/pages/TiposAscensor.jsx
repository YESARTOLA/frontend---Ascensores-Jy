import { useEffect, useState } from 'react';
import { tiposAscensorService } from '../services';
import PageHeader from '../components/common/PageHeader.jsx';
import Loader from '../components/common/Loader.jsx';
import EmptyState from '../components/common/EmptyState.jsx';
import Modal from '../components/common/Modal.jsx';
import { useToast } from '../components/common/Toast.jsx';
import { useAuth } from '../features/auth/AuthContext.jsx';

const inicial = { nombre: '', descripcion: '', orden: 0 };

export default function TiposAscensor() {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(inicial);
  const [editId, setEditId] = useState(null);
  const [guardando, setGuardando] = useState(false);
  const toast = useToast();
  const { esSuperAdmin, esAdmin } = useAuth();
  const puedeEditar = esSuperAdmin || esAdmin;

  const cargar = async () => {
    setLoading(true);
    try {
      const tipos = await tiposAscensorService.list({ incluir_inactivos: 1 });
      setData(tipos);
    } catch (err) {
      toast.error(err.response?.data?.error || 'Error al cargar tipos');
    } finally { setLoading(false); }
  };
  useEffect(() => { cargar(); }, []);

  const abrirNuevo = () => { setForm(inicial); setEditId(null); setOpen(true); };
  const abrirEdit = (t) => {
    setForm({ nombre: t.nombre, descripcion: t.descripcion || '', orden: t.orden ?? 0 });
    setEditId(t.id);
    setOpen(true);
  };

  const guardar = async (e) => {
    e.preventDefault();
    if (guardando) return;
    setGuardando(true);
    try {
      const payload = {
        nombre: form.nombre.trim(),
        descripcion: form.descripcion.trim() || null,
        orden: Number(form.orden) || 0
      };
      if (editId) await tiposAscensorService.update(editId, payload);
      else await tiposAscensorService.create(payload);
      toast.success('Tipo guardado');
      setOpen(false);
      cargar();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Error al guardar');
    } finally { setGuardando(false); }
  };

  const alternarEstado = async (t) => {
    try {
      await tiposAscensorService.setEstado(t.id, t.estado === 1 ? 0 : 1);
      toast.success(t.estado === 1 ? 'Tipo desactivado' : 'Tipo activado');
      cargar();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Error al cambiar estado');
    }
  };

  return (
    <>
      <PageHeader
        title="Tipos de ascensor"
        subtitle={`${data.length} tipo(s)`}
        actions={puedeEditar && <button onClick={abrirNuevo} className="btn-primary">+ Nuevo tipo</button>}
      />
      <div className="card">
        {loading ? <Loader /> : data.length === 0 ? (
          <EmptyState title="Sin tipos" subtitle="Aún no hay tipos de ascensor registrados." action={puedeEditar && <button onClick={abrirNuevo} className="btn-primary">Crear tipo</button>} />
        ) : (
          <div className="overflow-x-auto scroll-thin">
            <table className="table-base">
              <thead><tr>
                <th className="table-th">Nombre</th>
                <th className="table-th">Descripción</th>
                <th className="table-th text-center">Orden</th>
                <th className="table-th text-center">Estado</th>
                <th className="table-th text-right">Acciones</th>
              </tr></thead>
              <tbody className="divide-y divide-slate-100">
                {data.map(t => (
                  <tr key={t.id} className={`table-row-hover ${t.estado === 0 ? 'opacity-60' : ''}`}>
                    <td className="table-td font-medium">{t.nombre}</td>
                    <td className="table-td text-xs text-slate-500">{t.descripcion || '—'}</td>
                    <td className="table-td text-center text-xs">{t.orden ?? 0}</td>
                    <td className="table-td text-center">
                      <span className={t.estado === 1 ? 'badge-green' : 'badge-gray'}>
                        {t.estado === 1 ? 'Activo' : 'Inactivo'}
                      </span>
                    </td>
                    <td className="table-td text-right space-x-3 whitespace-nowrap">
                      {puedeEditar && (
                        <>
                          <button onClick={() => abrirEdit(t)} className="text-xs text-brand-700 hover:underline">Editar</button>
                          <button onClick={() => alternarEstado(t)} className={`text-xs hover:underline ${t.estado === 1 ? 'text-rose-600' : 'text-emerald-700'}`}>
                            {t.estado === 1 ? 'Desactivar' : 'Activar'}
                          </button>
                        </>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={editId ? 'Editar tipo de ascensor' : 'Nuevo tipo de ascensor'}
        footer={
          <>
            <button type="button" className="btn-secondary" onClick={() => setOpen(false)}>Cancelar</button>
            <button type="submit" form="form-tipo-ascensor" className="btn-primary" disabled={guardando}>
              {guardando ? 'Guardando…' : 'Guardar'}
            </button>
          </>
        }
      >
        <form id="form-tipo-ascensor" onSubmit={guardar} className="grid gap-4">
          <div>
            <label className="label">Nombre *</label>
            <input
              className="input"
              required
              maxLength={50}
              value={form.nombre}
              onChange={e => setForm(f => ({ ...f, nombre: e.target.value }))}
              placeholder="Ej. Pasajeros"
            />
          </div>
          <div>
            <label className="label">Descripción</label>
            <textarea
              className="textarea"
              rows="2"
              value={form.descripcion}
              onChange={e => setForm(f => ({ ...f, descripcion: e.target.value }))}
            />
          </div>
          <div>
            <label className="label">Orden (menor primero)</label>
            <input
              type="number"
              className="input"
              value={form.orden}
              onChange={e => setForm(f => ({ ...f, orden: e.target.value }))}
            />
          </div>
        </form>
      </Modal>
    </>
  );
}
