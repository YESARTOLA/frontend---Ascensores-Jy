import { useEffect, useState } from 'react';
import { tiposServicioService, tecnicosService } from '../services';
import PageHeader from '../components/common/PageHeader.jsx';
import Loader from '../components/common/Loader.jsx';
import Modal from '../components/common/Modal.jsx';
import { useToast } from '../components/common/Toast.jsx';
import { useAuth } from '../features/auth/AuthContext.jsx';

const CATEGORIAS = ['Instalación', 'Proyecto', 'Reparación', 'Mantenimiento preventivo', 'Mantenimiento correctivo', 'Emergencia', 'Revisión', 'Inspección'];

// Módulos operativos a los que el tipo puede estar vinculado. Si se deja
// vacío, el servicio creado solo vive en tbl_servicios_proyectos (formulario
// estándar). Si se elige uno, el formulario de crear servicio pide los datos
// específicos y se crea la fila correspondiente en el módulo destino.
const MODULOS = [
  { codigo: '', etiqueta: '— Ninguno (estándar) —' },
  { codigo: 'emergencia', etiqueta: 'Emergencias' },
  { codigo: 'correctivo', etiqueta: 'Correctivos' },
  { codigo: 'mantenimiento', etiqueta: 'Mantenimientos' },
  { codigo: 'atencion_rapida', etiqueta: 'Atención Rápida' }
];
const MODULO_LABEL = Object.fromEntries(MODULOS.map(m => [m.codigo, m.etiqueta]));

const inicial = { nombre: '', categoria: 'Mantenimiento preventivo', modulo_asociado: '', descripcion: '' };

export default function TiposServicio() {
  const [data, setData] = useState([]);
  const [tecnicos, setTecnicos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(inicial);
  const [editId, setEditId] = useState(null);
  const [openTecs, setOpenTecs] = useState(null);
  const [nuevoTec, setNuevoTec] = useState('');
  const toast = useToast();
  const { esSuperAdmin, esAdmin } = useAuth();
  const puedeEditar = esSuperAdmin || esAdmin;

  const cargar = async () => {
    setLoading(true);
    try {
      const [tipos, tecs] = await Promise.all([tiposServicioService.list(), tecnicosService.list()]);
      setData(tipos); setTecnicos(tecs);
    } finally { setLoading(false); }
  };
  useEffect(() => { cargar(); }, []);

  const guardar = async (e) => {
    e.preventDefault();
    try {
      if (editId) await tiposServicioService.update(editId, form);
      else await tiposServicioService.create(form);
      toast.success('Tipo guardado'); setOpen(false); cargar();
    } catch (err) { toast.error(err.response?.data?.error || 'Error'); }
  };

  const vincular = async () => {
    if (!nuevoTec) return;
    try {
      await tiposServicioService.vincularTecnico(openTecs.id, Number(nuevoTec));
      setNuevoTec('');
      toast.success('Técnico vinculado');
      const tipos = await tiposServicioService.list();
      setData(tipos);
      setOpenTecs(tipos.find(t => t.id === openTecs.id) || null);
    } catch (err) { toast.error(err.response?.data?.error || 'Error'); }
  };

  const desvincular = async (id_tec) => {
    try {
      await tiposServicioService.desvincularTecnico(openTecs.id, id_tec);
      toast.success('Técnico desvinculado');
      const tipos = await tiposServicioService.list();
      setData(tipos);
      setOpenTecs(tipos.find(t => t.id === openTecs.id) || null);
    } catch (err) { toast.error(err.response?.data?.error || 'Error'); }
  };

  return (
    <>
      <PageHeader title="Tipos de servicio" subtitle={`${data.length} tipo(s)`} actions={puedeEditar && <button onClick={() => { setForm(inicial); setEditId(null); setOpen(true); }} className="btn-primary">+ Nuevo</button>} />
      {loading ? <Loader /> : (
        <div className="card">
          <table className="table-base">
            <thead><tr><th className="table-th">Nombre</th><th className="table-th">Categoría</th><th className="table-th">Módulo asociado</th><th className="table-th">Técnicos habilitados</th><th className="table-th">Descripción</th><th className="table-th text-right">Acciones</th></tr></thead>
            <tbody className="divide-y divide-slate-100">
              {data.map(t => (
                <tr key={t.id} className="table-row-hover">
                  <td className="table-td font-medium">{t.nombre}</td>
                  <td className="table-td"><span className="badge-blue">{t.categoria}</span></td>
                  <td className="table-td text-xs">
                    {t.modulo_asociado
                      ? <span className="badge-violet">{MODULO_LABEL[t.modulo_asociado] || t.modulo_asociado}</span>
                      : <span className="text-slate-400">— Estándar —</span>}
                  </td>
                  <td className="table-td text-xs">{(t.tecnicos || []).map(rt => rt.tecnico?.nombre).join(', ') || <span className="text-slate-400">—</span>}</td>
                  <td className="table-td text-xs text-slate-500">{t.descripcion || '—'}</td>
                  <td className="table-td text-right space-x-3 whitespace-nowrap">
                    {puedeEditar && <button onClick={() => setOpenTecs(t)} className="text-xs text-emerald-700 hover:underline">Técnicos</button>}
                    {puedeEditar && <button onClick={() => { setForm({ nombre: t.nombre, categoria: t.categoria, modulo_asociado: t.modulo_asociado || '', descripcion: t.descripcion || '' }); setEditId(t.id); setOpen(true); }} className="text-xs text-brand-700 hover:underline">Editar</button>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Modal open={open} onClose={() => setOpen(false)} title={editId ? 'Editar tipo' : 'Nuevo tipo'}
        footer={<><button className="btn-secondary" onClick={() => setOpen(false)}>Cancelar</button><button className="btn-primary" onClick={guardar}>Guardar</button></>}>
        <form onSubmit={guardar} className="grid gap-4">
          <div><label className="label">Nombre *</label><input className="input" required value={form.nombre} onChange={e => setForm(f => ({ ...f, nombre: e.target.value }))} /></div>
          <div><label className="label">Categoría *</label><select className="select" value={form.categoria} onChange={e => setForm(f => ({ ...f, categoria: e.target.value }))}>{CATEGORIAS.map(c => <option key={c}>{c}</option>)}</select></div>
          <div>
            <label className="label">Módulo asociado</label>
            <select className="select" value={form.modulo_asociado} onChange={e => setForm(f => ({ ...f, modulo_asociado: e.target.value }))}>
              {MODULOS.map(m => <option key={m.codigo || 'ninguno'} value={m.codigo}>{m.etiqueta}</option>)}
            </select>
            <p className="text-[11px] text-slate-500 mt-0.5">
              {form.modulo_asociado
                ? `Al crear un servicio con este tipo se generará también una fila en ${MODULO_LABEL[form.modulo_asociado]}.`
                : 'Sin módulo: el servicio solo vive en la lista general (formulario estándar).'}
            </p>
          </div>
          <div><label className="label">Descripción</label><textarea className="textarea" rows="3" value={form.descripcion} onChange={e => setForm(f => ({ ...f, descripcion: e.target.value }))} /></div>
        </form>
      </Modal>

      <Modal open={!!openTecs} onClose={() => setOpenTecs(null)} title={`Técnicos habilitados · ${openTecs?.nombre || ''}`}
        footer={<button className="btn-secondary" onClick={() => setOpenTecs(null)}>Cerrar</button>}>
        <div className="space-y-4">
          <div className="flex items-end gap-2">
            <div className="flex-1">
              <label className="label">Vincular técnico</label>
              <select className="select" value={nuevoTec} onChange={e => setNuevoTec(e.target.value)}>
                <option value="">— Seleccione —</option>
                {tecnicos.filter(t => !(openTecs?.tecnicos || []).some(rt => rt.tecnico?.id === t.id)).map(t => <option key={t.id} value={t.id}>{t.nombre}</option>)}
              </select>
            </div>
            <button onClick={vincular} className="btn-primary">Agregar</button>
          </div>
          <ul className="divide-y divide-slate-100">
            {(openTecs?.tecnicos || []).length === 0 && <li className="text-sm text-slate-500 py-3">Sin técnicos vinculados (todos pueden tomar este tipo).</li>}
            {(openTecs?.tecnicos || []).map(rt => (
              <li key={rt.id} className="flex items-center justify-between py-2">
                <span className="text-sm">{rt.tecnico?.nombre}</span>
                <button onClick={() => desvincular(rt.tecnico.id)} className="text-xs text-rose-600 hover:underline">Quitar</button>
              </li>
            ))}
          </ul>
        </div>
      </Modal>
    </>
  );
}
