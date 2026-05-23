import { useEffect, useMemo, useState } from 'react';
import { usuariosService, tecnicosService } from '../services';
import PageHeader from '../components/common/PageHeader.jsx';
import Loader from '../components/common/Loader.jsx';
import Modal from '../components/common/Modal.jsx';
import { useToast } from '../components/common/Toast.jsx';
import { formatFecha, sanearTelefono, formatTelefono } from '../utils/formatters.js';

const inicial = { nombres: '', correo: '', contrasena: '', id_rol: '', id_tecnico: '', telefono: '' };

export default function Usuarios() {
  const [data, setData] = useState([]);
  const [roles, setRoles] = useState([]);
  const [tecnicos, setTecnicos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(inicial);
  const [editId, setEditId] = useState(null);
  const [credenciales, setCredenciales] = useState(null); // { correo, contrasena } tras crear nuevo usuario
  const toast = useToast();

  const copiar = async (texto, etiqueta) => {
    try {
      await navigator.clipboard.writeText(texto);
      toast.success(`${etiqueta} copiado`);
    } catch {
      toast.error('No se pudo copiar al portapapeles');
    }
  };

  // El campo "Técnico vinculado" solo aplica para el rol con codigo='tecnico'.
  // Usar el codigo (identificador estable en tbl_roles) en lugar del nombre.
  const esRolTecnico = useMemo(() => {
    const r = roles.find(r => String(r.id) === String(form.id_rol));
    return r?.codigo === 'tecnico';
  }, [roles, form.id_rol]);

  const cambiarRol = (idRol) => {
    setForm(f => {
      const nuevoRol = roles.find(r => String(r.id) === String(idRol));
      const sigueSiendoTecnico = nuevoRol?.codigo === 'tecnico';
      return {
        ...f,
        id_rol: idRol,
        id_tecnico: sigueSiendoTecnico ? f.id_tecnico : ''
      };
    });
  };

  const cargar = async () => {
    setLoading(true);
    try {
      const [u, r, t] = await Promise.all([usuariosService.list(), usuariosService.roles(), tecnicosService.list()]);
      setData(u); setRoles(r); setTecnicos(t);
    } finally { setLoading(false); }
  };
  useEffect(() => { cargar(); }, []);

  const abrirEdit = (u) => {
    setForm({
      nombres: u.nombres, correo: u.correo, contrasena: '',
      id_rol: u.id_rol, id_tecnico: u.id_tecnico || '', telefono: sanearTelefono(u.telefono || '')
    });
    setEditId(u.id);
    setOpen(true);
  };

  const guardar = async (e) => {
    e.preventDefault();
    try {
      const payload = { ...form };
      if (editId && !payload.contrasena) delete payload.contrasena;
      const esCreacion = !editId;
      const credencialesCreadas = esCreacion ? { correo: payload.correo, contrasena: payload.contrasena } : null;
      if (editId) await usuariosService.update(editId, payload);
      else await usuariosService.create(payload);
      toast.success('Usuario guardado');
      setOpen(false);
      setForm(inicial);
      cargar();
      if (credencialesCreadas) setCredenciales(credencialesCreadas);
    } catch (err) { toast.error(err.response?.data?.error || 'Error'); }
  };

  return (
    <>
      <PageHeader title="Usuarios" subtitle={`${data.length} usuario(s)`}
        actions={<button onClick={() => { setForm(inicial); setEditId(null); setOpen(true); }} className="btn-primary">+ Nuevo usuario</button>} />
      <div className="card">
        {loading ? <Loader /> : (
          <div className="overflow-x-auto scroll-thin">
            <table className="table-base">
              <thead><tr>
                <th className="table-th">Nombre</th><th className="table-th">Correo</th>
                <th className="table-th">Rol</th><th className="table-th">Técnico</th>
                <th className="table-th">Último login</th><th className="table-th">Estado</th>
                <th className="table-th text-right">Acciones</th>
              </tr></thead>
              <tbody className="divide-y divide-slate-100">
                {data.map(u => (
                  <tr key={u.id} className="table-row-hover">
                    <td className="table-td font-medium text-sm">{u.nombres}</td>
                    <td className="table-td text-xs font-mono">{u.correo}</td>
                    <td className="table-td text-xs">{u.rol?.nombre}</td>
                    <td className="table-td text-xs">{u.tecnico?.nombre || '—'}</td>
                    <td className="table-td text-xs">{formatFecha(u.ultimo_login) || '—'}</td>
                    <td className="table-td"><span className={u.estado === 1 ? 'badge-green' : 'badge-gray'}>{u.estado === 1 ? 'Activo' : 'Inactivo'}</span></td>
                    <td className="table-td text-right"><button onClick={() => abrirEdit(u)} className="text-xs text-brand-700">Editar</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <Modal open={open} onClose={() => setOpen(false)} title={editId ? 'Editar usuario' : 'Nuevo usuario'}
        footer={<><button className="btn-secondary" onClick={() => setOpen(false)}>Cancelar</button><button className="btn-primary" onClick={guardar}>Guardar</button></>}>
        <form onSubmit={guardar} className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="sm:col-span-2"><label className="label">Nombre completo *</label><input className="input" required value={form.nombres} onChange={e => setForm(f => ({ ...f, nombres: e.target.value }))} /></div>
          <div><label className="label">Correo *</label><input type="email" className="input" required value={form.correo} onChange={e => setForm(f => ({ ...f, correo: e.target.value }))} /></div>
          <div><label className="label">{editId ? 'Nueva contraseña (opcional)' : 'Contraseña *'}</label><input type="password" className="input" required={!editId} value={form.contrasena} onChange={e => setForm(f => ({ ...f, contrasena: e.target.value }))} /></div>
          <div><label className="label">Rol *</label><select className="select" required value={form.id_rol} onChange={e => cambiarRol(e.target.value)}><option value="">—</option>{roles.map(r => <option key={r.id} value={r.id}>{r.nombre}</option>)}</select></div>
          {esRolTecnico && (
            <div><label className="label">Técnico vinculado</label><select className="select" value={form.id_tecnico} onChange={e => setForm(f => ({ ...f, id_tecnico: e.target.value }))}><option value="">—</option>{tecnicos.map(t => <option key={t.id} value={t.id}>{t.nombre}</option>)}</select></div>
          )}
          <div><label className="label">Teléfono</label><input
            className="input"
            type="tel" inputMode="numeric" autoComplete="tel"
            placeholder="9XX XXX XXX"
            pattern="9\d{2} \d{3} \d{3}"
            title="Celular peruano: 9 dígitos comenzando con 9"
            value={formatTelefono(form.telefono)}
            onChange={e => setForm(f => ({ ...f, telefono: sanearTelefono(e.target.value) }))}
          /></div>
        </form>
      </Modal>

      <Modal
        open={credenciales !== null}
        onClose={() => setCredenciales(null)}
        title="Credenciales del nuevo usuario"
        size="sm"
        footer={<>
          <button
            type="button"
            className="btn-secondary"
            onClick={() => credenciales && copiar(`${credenciales.correo}\n${credenciales.contrasena}`, 'Credenciales')}
          >Copiar ambos</button>
          <button type="button" className="btn-primary" onClick={() => setCredenciales(null)}>Listo</button>
        </>}
      >
        {credenciales && (
          <div className="space-y-4">
            <p className="text-xs text-slate-500">
              Guarda o comparte estas credenciales ahora. Por seguridad la contraseña no se podrá volver a ver luego de cerrar esta ventana.
            </p>
            <div>
              <label className="label">Correo</label>
              <div className="flex gap-2">
                <input className="input flex-1 font-mono text-sm" readOnly value={credenciales.correo} onFocus={e => e.target.select()} />
                <button type="button" className="btn-secondary text-xs" onClick={() => copiar(credenciales.correo, 'Correo')}>Copiar</button>
              </div>
            </div>
            <div>
              <label className="label">Contraseña</label>
              <div className="flex gap-2">
                <input className="input flex-1 font-mono text-sm" readOnly value={credenciales.contrasena} onFocus={e => e.target.select()} />
                <button type="button" className="btn-secondary text-xs" onClick={() => copiar(credenciales.contrasena, 'Contraseña')}>Copiar</button>
              </div>
            </div>
          </div>
        )}
      </Modal>
    </>
  );
}
