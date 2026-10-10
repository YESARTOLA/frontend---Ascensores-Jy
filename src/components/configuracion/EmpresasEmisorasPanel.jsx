import { useEffect, useRef, useState } from 'react';
import { useToast } from '../common/Toast.jsx';
import { empresasEmisorasService } from '../../services';
import { useAuth } from '../../features/auth/AuthContext.jsx';

const formVacio = () => ({
  razon_social: '',
  ruc: '',
  direccion: '',
  telefono: '',
  correo: '',
  es_predeterminada: false
});

/**
 * Empresas emisoras: razones sociales (RUC, dirección, contacto) con las que se
 * puede emitir una cotización. Al crear la cotización se elige una; su PDF sale
 * con esos datos en la cabecera. La predeterminada viene marcada en el
 * formulario y la usan el resto de documentos (informes, exportaciones).
 *
 * Editan super administrador y administrador; el resto la ve en modo lectura.
 */
export default function EmpresasEmisorasPanel() {
  const toast = useToast();
  const { esSuperAdmin, esAdmin } = useAuth();
  const puedeGestionar = esSuperAdmin || esAdmin;
  const [empresas, setEmpresas] = useState([]);
  const [cargando, setCargando] = useState(false);
  const [editandoId, setEditandoId] = useState(null);
  const [form, setForm] = useState(formVacio);
  const [guardando, setGuardando] = useState(false);
  const guardandoRef = useRef(false);

  const recargar = async () => {
    setCargando(true);
    try {
      setEmpresas(await empresasEmisorasService.list());
    } finally {
      setCargando(false);
    }
  };

  useEffect(() => { recargar(); }, []);

  const empezarNueva = () => {
    setEditandoId(null);
    setForm(formVacio());
  };

  const empezarEditar = (empresa) => {
    setEditandoId(empresa.id);
    setForm({
      razon_social: empresa.razon_social,
      ruc: empresa.ruc,
      direccion: empresa.direccion || '',
      telefono: empresa.telefono || '',
      correo: empresa.correo || '',
      es_predeterminada: empresa.es_predeterminada
    });
  };

  const guardar = async (e) => {
    e.preventDefault();
    if (guardandoRef.current) return;
    guardandoRef.current = true;
    setGuardando(true);
    try {
      const payload = {
        razon_social: form.razon_social.trim(),
        ruc: form.ruc.trim(),
        direccion: form.direccion.trim() || null,
        telefono: form.telefono.trim() || null,
        correo: form.correo.trim() || null,
        es_predeterminada: form.es_predeterminada
      };
      if (editandoId) {
        await empresasEmisorasService.update(editandoId, payload);
        toast.success('Empresa actualizada');
      } else {
        await empresasEmisorasService.create(payload);
        toast.success('Empresa agregada');
      }
      empezarNueva();
      await recargar();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Error al guardar la empresa');
    } finally {
      guardandoRef.current = false;
      setGuardando(false);
    }
  };

  const marcarPredeterminada = async (empresa) => {
    try {
      await empresasEmisorasService.update(empresa.id, { es_predeterminada: true });
      toast.success(`${empresa.razon_social} es ahora la empresa predeterminada`);
      if (editandoId === empresa.id) setForm(f => ({ ...f, es_predeterminada: true }));
      await recargar();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Error al cambiar la predeterminada');
    }
  };

  const eliminar = async (empresa) => {
    if (!window.confirm(`¿Eliminar la empresa "${empresa.razon_social}" (RUC ${empresa.ruc})? Las cotizaciones ya emitidas con ella la conservan.`)) return;
    try {
      await empresasEmisorasService.remove(empresa.id);
      toast.success('Empresa eliminada');
      if (editandoId === empresa.id) empezarNueva();
      await recargar();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Error al eliminar');
    }
  };

  // La predeterminada no se desmarca desde su propio formulario: siempre debe
  // haber una, así que se cambia marcando otra.
  const editandoPredeterminada = editandoId != null
    && empresas.some(x => x.id === editandoId && x.es_predeterminada);

  return (
    <div className="space-y-5">
      <p className="text-xs text-carbon-500">
        Razones sociales con las que se puede emitir una cotización. Al crearla se elige una y el PDF sale con sus datos
        (razón social, RUC, dirección y contacto). La predeterminada viene seleccionada en el formulario y se usa en
        informes de servicio y exportaciones.
      </p>

      {puedeGestionar && (
        <form onSubmit={guardar} className="grid grid-cols-1 sm:grid-cols-2 gap-3 border-b border-carbon-100 pb-4">
          <div className="sm:col-span-2 flex items-center justify-between">
            <h4 className="text-sm font-semibold text-carbon-700">
              {editandoId ? 'Editar empresa' : 'Nueva empresa'}
            </h4>
            {editandoId && (
              <button type="button" className="text-xs text-carbon-500 hover:text-carbon-800" onClick={empezarNueva}>
                Cancelar edición
              </button>
            )}
          </div>

          <div>
            <label className="label">Razón social *</label>
            <input className="input" required maxLength={200} placeholder="Ej. Ascensores Jy S.A.C."
              value={form.razon_social}
              onChange={e => setForm(f => ({ ...f, razon_social: e.target.value }))} />
          </div>
          <div>
            <label className="label">RUC *</label>
            <input className="input font-mono" required inputMode="numeric" pattern="\d{11}" maxLength={11}
              title="11 dígitos" placeholder="11 dígitos"
              value={form.ruc}
              onChange={e => setForm(f => ({ ...f, ruc: e.target.value.replace(/\D/g, '') }))} />
          </div>
          <div className="sm:col-span-2">
            <label className="label">Dirección</label>
            <input className="input" placeholder="Dirección fiscal"
              value={form.direccion}
              onChange={e => setForm(f => ({ ...f, direccion: e.target.value }))} />
          </div>
          <div>
            <label className="label">Teléfono</label>
            <input className="input" maxLength={50}
              value={form.telefono}
              onChange={e => setForm(f => ({ ...f, telefono: e.target.value }))} />
          </div>
          <div>
            <label className="label">Correo</label>
            <input type="email" className="input" maxLength={120}
              value={form.correo}
              onChange={e => setForm(f => ({ ...f, correo: e.target.value }))} />
          </div>
          <label className="sm:col-span-2 inline-flex items-center gap-2 text-sm text-carbon-700">
            <input type="checkbox" checked={form.es_predeterminada} disabled={editandoPredeterminada}
              onChange={e => setForm(f => ({ ...f, es_predeterminada: e.target.checked }))} />
            Empresa predeterminada
            {editandoPredeterminada && (
              <span className="text-[11px] text-carbon-400">(para cambiarla, marca otra como predeterminada)</span>
            )}
          </label>

          <div className="sm:col-span-2 flex justify-end">
            <button type="submit" className="btn-primary" disabled={guardando}>
              {guardando ? 'Guardando…' : (editandoId ? 'Actualizar empresa' : 'Agregar empresa')}
            </button>
          </div>
        </form>
      )}

      <div>
        <h4 className="text-sm font-semibold text-carbon-700 mb-2">Empresas registradas</h4>
        {cargando ? (
          <div className="text-sm text-carbon-500">Cargando…</div>
        ) : empresas.length === 0 ? (
          <div className="text-sm text-carbon-500">Aún no hay empresas registradas.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="table-base">
              <thead>
                <tr>
                  <th className="table-th">Razón social</th>
                  <th className="table-th">RUC</th>
                  <th className="table-th">Dirección</th>
                  <th className="table-th">Contacto</th>
                  {puedeGestionar && <th className="table-th text-right">Acciones</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-carbon-100">
                {empresas.map(emp => (
                  <tr key={emp.id} className="table-row-hover">
                    <td className="table-td text-xs font-medium">
                      {emp.razon_social}
                      {emp.es_predeterminada && <span className="badge-green text-[10px] ml-2">Predeterminada</span>}
                    </td>
                    <td className="table-td text-xs font-mono">{emp.ruc}</td>
                    <td className="table-td text-xs">{emp.direccion || '—'}</td>
                    <td className="table-td text-xs">
                      {[emp.telefono, emp.correo].filter(Boolean).join(' · ') || '—'}
                    </td>
                    {puedeGestionar && (
                      <td className="table-td text-right whitespace-nowrap">
                        {!emp.es_predeterminada && (
                          <button type="button" onClick={() => marcarPredeterminada(emp)}
                            className="btn-ghost text-xs !py-1 !px-2 mr-1">Hacer predeterminada</button>
                        )}
                        <button type="button" onClick={() => empezarEditar(emp)}
                          className="btn-ghost text-xs !py-1 !px-2 mr-1">Editar</button>
                        {!emp.es_predeterminada && (
                          <button type="button" onClick={() => eliminar(emp)}
                            className="text-xs text-red-600 hover:underline">Eliminar</button>
                        )}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
