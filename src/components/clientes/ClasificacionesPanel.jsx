import { useEffect, useState } from 'react';
import { clientesService } from '../../services';
import { useToast } from '../common/Toast.jsx';
import { useAuth } from '../../features/auth/AuthContext.jsx';
import { useClasificaciones, recargarClasificaciones } from '../../hooks/useClasificaciones.js';
import {
  AREAS_CLASIFICACION,
  AREA_CLASIFICACION_AMBAS,
  COLORES_CLASIFICACION,
  etiquetaAreaClasificacion
} from '../../utils/clasificacionesCliente.js';

const VACIO = { etiqueta: '', area: 'servicio', color: COLORES_CLASIFICACION[0].clave };

/** Badge de una clasificación (también lo usa la vista previa del formulario). */
export function BadgeClasificacion({ clasificacion, clases }) {
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold ring-1 ${clases || clasificacion?.color || ''}`}>
      {clasificacion?.etiqueta || 'Sin nombre'}
    </span>
  );
}

/**
 * Gestión del catálogo de clasificaciones de cliente: alta, edición (nombre,
 * área a la que aplica, color) y activación. El formulario va dentro del propio
 * panel —no en otro modal— para poder usarlo tal cual dentro del modal de
 * "Nuevo cliente" y en Configuración.
 *
 * Solo super_admin y admin editan (el backend lo exige); el resto lo ve.
 * Cada cambio recarga el catálogo compartido (useClasificaciones), así que los
 * selectores y badges abiertos se actualizan solos.
 */
export default function ClasificacionesPanel() {
  const toast = useToast();
  const { esSuperAdmin, esAdmin } = useAuth();
  const puedeGestionar = esSuperAdmin || esAdmin;
  const clasificaciones = useClasificaciones();
  const [cargado, setCargado] = useState(false);
  // null = sin formulario; { id?: number, ...VACIO } = creando / editando.
  const [form, setForm] = useState(null);
  const [guardando, setGuardando] = useState(false);
  const [cambiandoId, setCambiandoId] = useState(null);

  // Al abrir el panel se pide el catálogo de nuevo: trae el uso actualizado.
  useEffect(() => { recargarClasificaciones().finally(() => setCargado(true)); }, []);

  const colorDe = (clave) => COLORES_CLASIFICACION.find(c => c.clave === clave)?.clases;

  const guardar = async (e) => {
    e.preventDefault();
    // Abierto desde el formulario de cliente, el submit viajaría por el árbol de
    // React (los portales no lo cortan) hasta ese formulario y lo enviaría.
    e.stopPropagation();
    if (guardando) return;
    if (!form.etiqueta.trim()) return toast.error('Escribe el nombre de la clasificación');
    setGuardando(true);
    try {
      const payload = { etiqueta: form.etiqueta.trim(), area: form.area, color: form.color };
      if (form.id) await clientesService.actualizarClasificacion(form.id, payload);
      else await clientesService.crearClasificacion(payload);
      await recargarClasificaciones();
      toast.success(form.id ? 'Clasificación actualizada' : 'Clasificación creada');
      setForm(null);
    } catch (err) {
      toast.error(err.response?.data?.error || 'Error al guardar la clasificación');
    } finally {
      setGuardando(false);
    }
  };

  const alternarEstado = async (c) => {
    setCambiandoId(c.id);
    try {
      await clientesService.setEstadoClasificacion(c.id, c.activo ? 0 : 1);
      await recargarClasificaciones();
      toast.success(c.activo ? `«${c.etiqueta}» desactivada` : `«${c.etiqueta}» activada`);
    } catch (err) {
      toast.error(err.response?.data?.error || 'Error al cambiar el estado');
    } finally {
      setCambiandoId(null);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <p className="text-xs text-slate-500 max-w-xl">
          Cada clasificación indica a qué clientes aplica: solo a los del área de Servicios, solo a los de
          Proyectos, o a ambos. Al registrar un cliente solo se ofrecen las de su área. Desactivar una
          clasificación no se la quita a quien ya la tiene.
        </p>
        {puedeGestionar && !form && (
          <button type="button" className="btn-primary text-xs" onClick={() => setForm({ ...VACIO })}>
            + Nueva clasificación
          </button>
        )}
      </div>

      {form && (
        <form onSubmit={guardar} className="rounded-lg ring-1 ring-brand-200 bg-brand-50/40 p-4 space-y-3">
          <div className="text-sm font-semibold text-slate-800">
            {form.id ? 'Editar clasificación' : 'Nueva clasificación'}
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="label">Nombre *</label>
              <input className="input" maxLength={80} autoFocus value={form.etiqueta}
                onChange={e => setForm(f => ({ ...f, etiqueta: e.target.value }))} placeholder="Ej. Corporativo" />
            </div>
            <div>
              <label className="label">Aplica a *</label>
              <select className="select" value={form.area} onChange={e => setForm(f => ({ ...f, area: e.target.value }))}>
                {AREAS_CLASIFICACION.map(a => <option key={a.valor} value={a.valor}>{a.etiqueta}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label className="label">Color</label>
            <div className="flex flex-wrap gap-2">
              {COLORES_CLASIFICACION.map(c => (
                <button key={c.clave} type="button" onClick={() => setForm(f => ({ ...f, color: c.clave }))}
                  title={c.etiqueta} aria-pressed={form.color === c.clave}
                  className={`rounded-full p-0.5 transition ${form.color === c.clave ? 'ring-2 ring-brand-500' : 'ring-0 opacity-70 hover:opacity-100'}`}>
                  <span className={`block px-2.5 py-0.5 rounded-full text-[11px] font-semibold ring-1 ${c.clases}`}>{c.etiqueta}</span>
                </button>
              ))}
            </div>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
            <div className="text-xs text-slate-500 flex items-center gap-2">
              Vista previa: <BadgeClasificacion clasificacion={{ etiqueta: form.etiqueta.trim() }} clases={colorDe(form.color)} />
            </div>
            <div className="flex gap-2">
              <button type="button" className="btn-secondary text-xs" onClick={() => setForm(null)} disabled={guardando}>Cancelar</button>
              <button type="submit" className="btn-primary text-xs" disabled={guardando}>{guardando ? 'Guardando…' : 'Guardar'}</button>
            </div>
          </div>
        </form>
      )}

      {!cargado && clasificaciones.length === 0 ? (
        <p className="text-sm text-slate-400">Cargando…</p>
      ) : clasificaciones.length === 0 ? (
        <p className="text-sm text-slate-400">Aún no hay clasificaciones.</p>
      ) : (
        <div className="overflow-x-auto scroll-thin">
          <table className="table-base">
            <thead><tr>
              <th className="table-th">Clasificación</th>
              <th className="table-th">Aplica a</th>
              <th className="table-th">En uso</th>
              <th className="table-th text-center">Estado</th>
              {puedeGestionar && <th className="table-th text-right">Acciones</th>}
            </tr></thead>
            <tbody className="divide-y divide-slate-100">
              {clasificaciones.map(c => (
                <tr key={c.id} className={c.activo ? '' : 'opacity-60'}>
                  <td className="table-td"><BadgeClasificacion clasificacion={c} /></td>
                  <td className="table-td text-xs">
                    <span className={c.area === AREA_CLASIFICACION_AMBAS ? 'text-slate-600' : 'font-medium text-slate-800'}>
                      {etiquetaAreaClasificacion(c.area)}
                    </span>
                  </td>
                  <td className="table-td text-xs text-slate-500">
                    {c.clientes || 0} cliente(s){c.ascensores ? ` · ${c.ascensores} ascensor(es)` : ''}
                  </td>
                  <td className="table-td text-center">
                    <span className={c.activo ? 'badge-green' : 'badge-gray'}>{c.activo ? 'Activa' : 'Inactiva'}</span>
                  </td>
                  {puedeGestionar && (
                    <td className="table-td text-right whitespace-nowrap space-x-3">
                      <button type="button" className="text-xs text-brand-700 hover:underline"
                        onClick={() => setForm({ id: c.id, etiqueta: c.etiqueta, area: c.area, color: c.color_clave })}>
                        Editar
                      </button>
                      <button type="button" disabled={cambiandoId === c.id} onClick={() => alternarEstado(c)}
                        className={`text-xs hover:underline disabled:opacity-50 ${c.activo ? 'text-rose-600' : 'text-emerald-700'}`}>
                        {c.activo ? 'Desactivar' : 'Activar'}
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
