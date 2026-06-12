import { useEffect, useMemo, useState } from 'react';
import { tiposServicioService, tecnicosService } from '../services';
import PageHeader from '../components/common/PageHeader.jsx';
import Loader from '../components/common/Loader.jsx';
import Modal from '../components/common/Modal.jsx';
import { useToast } from '../components/common/Toast.jsx';
import { useAuth } from '../features/auth/AuthContext.jsx';

const inicialPadre = { modo: 'padre', nombre: '', categoria_funcional: '', descripcion: '' };
const inicialSubtipo = { modo: 'subtipo', nombre: '', id_padre: '', modulo_asociado: '', descripcion: '' };

export default function TiposServicio() {
  const [data, setData] = useState([]);
  const [tecnicos, setTecnicos] = useState([]);
  const [catalogos, setCatalogos] = useState({ categorias_funcionales: [], modulos: [] });
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(inicialPadre);
  const [editId, setEditId] = useState(null);
  const [openTecs, setOpenTecs] = useState(null);
  const [nuevoTec, setNuevoTec] = useState('');
  const toast = useToast();
  const { esSuperAdmin } = useAuth();
  // Solo el superadministrador puede crear, editar o eliminar tipos de servicio.
  const puedeEditar = esSuperAdmin;

  const padres = useMemo(() => data.filter(t => t.es_padre), [data]);
  const subtiposPorPadre = useMemo(() => {
    const m = {};
    data.filter(t => !t.es_padre).forEach(s => { (m[s.id_padre] = m[s.id_padre] || []).push(s); });
    return m;
  }, [data]);
  const moduloLabel = useMemo(
    () => Object.fromEntries((catalogos.modulos || []).map(m => [m.value, m.label])),
    [catalogos]
  );
  const cfLabel = useMemo(
    () => Object.fromEntries((catalogos.categorias_funcionales || []).map(c => [c.value, c.label])),
    [catalogos]
  );

  // El padre seleccionado en el form de subtipo define si se exige módulo.
  const padreSel = useMemo(
    () => padres.find(p => p.id === Number(form.id_padre)) || null,
    [padres, form.id_padre]
  );
  const padreEsServicios = padreSel?.categoria_funcional === 'SERVICIOS';

  const cargar = async () => {
    setLoading(true);
    try {
      const [tipos, tecs, cat] = await Promise.all([
        tiposServicioService.list(),
        tecnicosService.list(),
        tiposServicioService.catalogos(),
      ]);
      setData(tipos);
      setTecnicos(tecs);
      setCatalogos(cat);
    } finally { setLoading(false); }
  };
  useEffect(() => { cargar(); }, []);

  const abrirNuevoPadre = () => {
    setForm({ ...inicialPadre, categoria_funcional: catalogos.categorias_funcionales?.[0]?.value || '' });
    setEditId(null); setOpen(true);
  };
  const abrirNuevoSubtipo = (idPadre = '') => {
    setForm({ ...inicialSubtipo, id_padre: idPadre });
    setEditId(null); setOpen(true);
  };
  const abrirEditar = (t) => {
    if (t.es_padre) {
      setForm({ modo: 'padre', nombre: t.nombre, categoria_funcional: t.categoria_funcional || '', descripcion: t.descripcion || '' });
    } else {
      setForm({ modo: 'subtipo', nombre: t.nombre, id_padre: t.id_padre, modulo_asociado: t.modulo_asociado || '', descripcion: t.descripcion || '' });
    }
    setEditId(t.id); setOpen(true);
  };

  const guardar = async (e) => {
    e?.preventDefault();
    try {
      const payload = form.modo === 'padre'
        ? { nombre: form.nombre, categoria_funcional: form.categoria_funcional, descripcion: form.descripcion }
        : {
            nombre: form.nombre,
            id_padre: Number(form.id_padre),
            // Solo se envía módulo cuando el padre es de categoría SERVICIOS.
            modulo_asociado: padreEsServicios ? form.modulo_asociado : '',
            descripcion: form.descripcion,
          };
      if (editId) await tiposServicioService.update(editId, payload);
      else await tiposServicioService.create(payload);
      toast.success('Tipo guardado'); setOpen(false); cargar();
    } catch (err) { toast.error(err.response?.data?.error || 'Error'); }
  };

  const eliminar = async (t) => {
    const etiqueta = t.es_padre ? 'tipo padre' : 'subtipo';
    if (!window.confirm(`¿Eliminar el ${etiqueta} “${t.nombre}”?`)) return;
    try {
      await tiposServicioService.remove(t.id);
      toast.success('Tipo eliminado'); cargar();
    } catch (err) { toast.error(err.response?.data?.error || 'Error al eliminar'); }
  };

  const refrescarTecs = async (idActual) => {
    const tipos = await tiposServicioService.list();
    setData(tipos);
    setOpenTecs(tipos.find(t => t.id === idActual) || null);
  };
  const vincular = async () => {
    if (!nuevoTec) return;
    try {
      await tiposServicioService.vincularTecnico(openTecs.id, Number(nuevoTec));
      setNuevoTec(''); toast.success('Técnico vinculado');
      await refrescarTecs(openTecs.id);
    } catch (err) { toast.error(err.response?.data?.error || 'Error'); }
  };
  const desvincular = async (id_tec) => {
    try {
      await tiposServicioService.desvincularTecnico(openTecs.id, id_tec);
      toast.success('Técnico desvinculado');
      await refrescarTecs(openTecs.id);
    } catch (err) { toast.error(err.response?.data?.error || 'Error'); }
  };

  return (
    <>
      <PageHeader
        title="Tipos de servicio"
        subtitle={`${padres.length} tipo(s) padre · ${data.length - padres.length} subtipo(s)`}
        actions={puedeEditar && (
          <div className="flex gap-2">
            <button onClick={abrirNuevoPadre} className="btn-secondary">+ Tipo padre</button>
            <button onClick={() => abrirNuevoSubtipo()} className="btn-primary" disabled={padres.length === 0}>+ Subtipo</button>
          </div>
        )}
      />
      {loading ? <Loader /> : (
        <div className="space-y-5">
          {padres.length === 0 && (
            <div className="card p-6 text-sm text-slate-500">
              No hay tipos padre. Cree primero un tipo padre y asígnele una categoría funcional (Servicios o Proyectos).
            </div>
          )}
          {padres.map(p => {
            const esServicios = p.categoria_funcional === 'SERVICIOS';
            const subs = subtiposPorPadre[p.id] || [];
            return (
              <div key={p.id} className="card overflow-hidden">
                <div className="flex items-center justify-between gap-3 px-4 py-3 bg-slate-50 border-b border-slate-100">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-slate-800">{p.nombre}</span>
                    <span className={esServicios ? 'badge-blue' : 'badge-violet'}>
                      {cfLabel[p.categoria_funcional] || p.categoria_funcional}
                    </span>
                    <span className="text-xs text-slate-400">{subs.length} subtipo(s)</span>
                  </div>
                  {puedeEditar && (
                    <div className="flex gap-3 text-xs whitespace-nowrap">
                      <button onClick={() => abrirNuevoSubtipo(p.id)} className="text-emerald-700 hover:underline">+ Subtipo</button>
                      <button onClick={() => abrirEditar(p)} className="text-brand-700 hover:underline">Editar padre</button>
                      <button onClick={() => eliminar(p)} className="text-rose-600 hover:underline">Eliminar</button>
                    </div>
                  )}
                </div>
                <table className="table-base">
                  <thead>
                    <tr>
                      <th className="table-th">Subtipo</th>
                      <th className="table-th">{esServicios ? 'Módulo operativo' : 'Tipo'}</th>
                      <th className="table-th">Técnicos habilitados</th>
                      <th className="table-th">Descripción</th>
                      <th className="table-th text-right">Acciones</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {subs.length === 0 && (
                      <tr><td colSpan={5} className="table-td text-sm text-slate-400">Sin subtipos. {puedeEditar && 'Agregue uno con “+ Subtipo”.'}</td></tr>
                    )}
                    {subs.map(t => (
                      <tr key={t.id} className="table-row-hover">
                        <td className="table-td font-medium">{t.nombre}</td>
                        <td className="table-td text-xs">
                          {esServicios
                            ? <span className="badge-violet">{moduloLabel[t.modulo_asociado] || t.modulo_asociado || '—'}</span>
                            : <span className="text-slate-400">Descriptivo (Proyecto)</span>}
                        </td>
                        <td className="table-td text-xs">{(t.tecnicos || []).map(rt => rt.tecnico?.nombre).join(', ') || <span className="text-slate-400">—</span>}</td>
                        <td className="table-td text-xs text-slate-500">{t.descripcion || '—'}</td>
                        <td className="table-td text-right space-x-3 whitespace-nowrap">
                          {puedeEditar && <button onClick={() => setOpenTecs(t)} className="text-xs text-emerald-700 hover:underline">Técnicos</button>}
                          {puedeEditar && <button onClick={() => abrirEditar(t)} className="text-xs text-brand-700 hover:underline">Editar</button>}
                          {puedeEditar && <button onClick={() => eliminar(t)} className="text-xs text-rose-600 hover:underline">Eliminar</button>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            );
          })}
        </div>
      )}

      <Modal open={open} onClose={() => setOpen(false)}
        title={`${editId ? 'Editar' : 'Nuevo'} ${form.modo === 'padre' ? 'tipo padre' : 'subtipo'}`}
        footer={<><button className="btn-secondary" onClick={() => setOpen(false)}>Cancelar</button><button className="btn-primary" onClick={guardar}>Guardar</button></>}>
        <form onSubmit={guardar} className="grid gap-4">
          <div><label className="label">Nombre *</label><input className="input" required value={form.nombre} onChange={e => setForm(f => ({ ...f, nombre: e.target.value }))} /></div>

          {form.modo === 'padre' ? (
            <div>
              <label className="label">Categoría funcional *</label>
              <select className="select" value={form.categoria_funcional} onChange={e => setForm(f => ({ ...f, categoria_funcional: e.target.value }))} required>
                <option value="">— Seleccione —</option>
                {catalogos.categorias_funcionales.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
              </select>
              <p className="text-[11px] text-slate-500 mt-0.5">
                Servicios → sus subtipos se vinculan a un módulo operativo. Proyectos → sus subtipos son descriptivos y todo se convierte en Proyecto.
              </p>
            </div>
          ) : (
            <>
              <div>
                <label className="label">Tipo padre *</label>
                <select className="select" value={form.id_padre} onChange={e => setForm(f => ({ ...f, id_padre: e.target.value, modulo_asociado: '' }))} required>
                  <option value="">— Seleccione —</option>
                  {padres.map(p => <option key={p.id} value={p.id}>{p.nombre} ({cfLabel[p.categoria_funcional] || p.categoria_funcional})</option>)}
                </select>
              </div>
              {padreEsServicios && (
                <div>
                  <label className="label">Módulo operativo *</label>
                  <select className="select" value={form.modulo_asociado} onChange={e => setForm(f => ({ ...f, modulo_asociado: e.target.value }))} required>
                    <option value="">— Seleccione —</option>
                    {catalogos.modulos.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
                  </select>
                  <p className="text-[11px] text-slate-500 mt-0.5">Determina en qué módulo (Emergencias/Correctivos/Mantenimientos/Atención rápida) se gestionan los servicios de este subtipo.</p>
                </div>
              )}
              {padreSel && !padreEsServicios && (
                <p className="text-[11px] text-slate-500">Este subtipo es descriptivo: cualquier registro se convierte y muestra como Proyecto.</p>
              )}
            </>
          )}

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
