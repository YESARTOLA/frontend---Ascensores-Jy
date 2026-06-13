import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { correctivosService, clientesService, ascensoresService, tecnicosService } from '../services';
import PageHeader from '../components/common/PageHeader.jsx';
import Loader from '../components/common/Loader.jsx';
import Modal from '../components/common/Modal.jsx';
import ConfirmarEliminacion from '../components/common/ConfirmarEliminacion.jsx';
import EmptyState from '../components/common/EmptyState.jsx';
import Pagination, { usePaginatedList } from '../components/common/Pagination.jsx';
import { useToast } from '../components/common/Toast.jsx';
import { useAuth } from '../features/auth/AuthContext.jsx';
import ClienteAutocomplete from '../components/common/ClienteAutocomplete.jsx';
import { badgeEstado, formatFechaHora, nombreCliente, nombreEdificio } from '../utils/formatters.js';
import { esServicioEditable, ESTADOS_CORRECTIVO, esCorrectivoCerrado } from '../utils/estadoServicio.js';
import { actualizarFilaAsignacion, validarConsistenciaAsignaciones, tecnicosDisponiblesPara } from '../utils/asignaciones.js';

const ROLES_ASIG = ['Responsable principal', 'Apoyo técnico', 'Especialista', 'Supervisor técnico'];
const TIPOS_ITEM = ['Herramienta', 'Material', 'Equipo', 'Repuesto', 'Otro'];
const UNIDADES = ['Unidad', 'Metro', 'Caja', 'Bolsa', 'Litro', 'Juego', 'Otro'];
const NIVELES = ['alta', 'media', 'baja'];
const ESTADOS_FILTRO_CORRECTIVO = ['', ...ESTADOS_CORRECTIVO];
const FORM_ID = 'form-correctivo';

const inicial = {
  id_cliente: '', id_ascensor: '', falla: '',
  nivel_urgencia: 'media', precio_interno: '', sin_cobro: false, observaciones: ''
};

function badgeUrgencia(n) {
  if (n === 'alta') return 'badge-red';
  if (n === 'media') return 'badge-amber';
  return 'badge-gray';
}

export default function Correctivos() {
  const [clientes, setClientes] = useState([]);
  const [ascensores, setAscensores] = useState([]);
  const [tecnicos, setTecnicos] = useState([]);
  const [filtros, setFiltros] = useState({ q: '', estado_correctivo: '', nivel_urgencia: '' });
  const [open, setOpen] = useState(false);
  const [editando, setEditando] = useState(null);
  const [form, setForm] = useState(inicial);
  const [asignaciones, setAsignaciones] = useState([]);
  const [items, setItems] = useState([]);
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  const toast = useToast();
  const { esSuperAdmin, esAdmin, esCoordinador, puedeVerPrecio } = useAuth();
  const puedeCrear = esSuperAdmin || esAdmin || esCoordinador;
  const puedeEditar = esSuperAdmin || esAdmin || esCoordinador;
  const puedeEliminar = esSuperAdmin;
  const [aEliminar, setAEliminar] = useState(null);

  const { data, loading, total, page, pageSize, totalPages, setPage, setPageSize, recargar } =
    usePaginatedList(correctivosService.paginate, filtros, { initialPageSize: 25 });
  const cargar = recargar;

  useEffect(() => {
    Promise.all([clientesService.list(), ascensoresService.list(), tecnicosService.list()])
      .then(([c, a, t]) => { setClientes(c); setAscensores(a); setTecnicos(t); })
      .catch(() => {});
  }, []);

  const labelCampoCliente = 'Cliente';

  const ascensoresFiltrados = form.id_cliente
    ? ascensores.filter(a => String(a.edificio?.cliente?.id) === String(form.id_cliente))
    : ascensores;

  const agregarTec = () => setAsignaciones(a => [...a, { id_tecnico: '', rol_asignacion: 'Apoyo técnico', responsable_principal: false, responsable_documentacion: false, responsable_checklist: false }]);
  const quitarTec = (idx) => setAsignaciones(a => a.filter((_, i) => i !== idx));
  const cambiarTec = (idx, key, val) => setAsignaciones(a => actualizarFilaAsignacion(a, idx, key, val));

  const agregarItem = () => setItems(i => [...i, { tipo_item: 'Herramienta', nombre: '', cantidad: 1, unidad: 'Unidad', observaciones: '' }]);
  const cambiarItem = (idx, key, val) => setItems(i => i.map((x, j) => j === idx ? { ...x, [key]: val } : x));
  const quitarItem = (idx) => setItems(i => i.filter((_, j) => j !== idx));

  const abrirNuevo = () => {
    setEditando(null);
    setForm(inicial);
    setAsignaciones([]);
    setItems([]);
    setOpen(true);
  };

  const abrirEditar = (c) => {
    if (esCorrectivoCerrado(c.estado_correctivo)) {
      toast.error('El correctivo ya está cerrado y no se puede editar.');
      return;
    }
    if (c.servicio && !esServicioEditable(c.servicio.estado_servicio)) {
      toast.error(`El servicio asociado está en "${c.servicio.estado_servicio}" y no admite cambios.`);
      return;
    }
    setEditando(c.id);
    setForm({
      id_cliente: String(c.id_cliente || ''),
      id_ascensor: String(c.id_ascensor || ''),
      falla: c.falla || '',
      nivel_urgencia: c.nivel_urgencia || 'media',
      precio_interno: c.servicio?.precio_interno != null ? String(c.servicio.precio_interno) : '',
      sin_cobro: c.servicio?.sin_cobro === 1,
      observaciones: c.observaciones || ''
    });
    setAsignaciones([]);
    setItems([]);
    setOpen(true);
  };

  const cerrarModal = () => {
    if (savingRef.current) return;
    setOpen(false);
    setEditando(null);
    setForm(inicial);
    setAsignaciones([]);
    setItems([]);
  };

  const guardar = async (e) => {
    if (e?.preventDefault) e.preventDefault();
    if (savingRef.current) return;
    if (!editando) {
      const consistencia = validarConsistenciaAsignaciones(asignaciones);
      if (!consistencia.ok) return toast.error(consistencia.error);
    }
    savingRef.current = true;
    setSaving(true);
    try {
      if (editando) {
        const payload = {
          id_cliente: form.id_cliente,
          id_ascensor: form.id_ascensor,
          falla: form.falla,
          nivel_urgencia: form.nivel_urgencia,
          observaciones: form.observaciones,
          sin_cobro: form.sin_cobro,
          precio_interno: form.sin_cobro ? 0 : form.precio_interno
        };
        await correctivosService.update(editando, payload);
        toast.success('Correctivo actualizado');
      } else {
        const payload = {
          ...form,
          precio_interno: form.sin_cobro ? 0 : form.precio_interno,
          tecnicos: asignaciones,
          items_checklist: items
        };
        await correctivosService.create(payload);
        toast.success('Correctivo registrado');
      }
      savingRef.current = false;
      cerrarModal();
      cargar();
    } catch (err) {
      toast.error(err.response?.data?.error || (editando ? 'Error al actualizar correctivo' : 'Error al registrar correctivo'));
    } finally {
      setSaving(false);
      savingRef.current = false;
    }
  };

  return (
    <>
      <PageHeader
        title="Correctivos"
        subtitle={`${total} correctivo(s)`}
        actions={puedeCrear && <button onClick={abrirNuevo} className="btn-primary">+ Nuevo correctivo</button>}
      />

      <div className="card mb-4">
        <div className="p-4 grid grid-cols-1 sm:grid-cols-4 gap-2">
          <input className="input sm:col-span-2" placeholder="Buscar por edificio, cliente, ascensor, código o falla…"
            value={filtros.q} onChange={e => setFiltros(f => ({ ...f, q: e.target.value }))} />
          <select className="select" value={filtros.estado_correctivo}
            onChange={e => setFiltros(f => ({ ...f, estado_correctivo: e.target.value }))}>
            {ESTADOS_FILTRO_CORRECTIVO.map(s => <option key={s} value={s}>{s || 'Todos los estados'}</option>)}
          </select>
          <select className="select" value={filtros.nivel_urgencia}
            onChange={e => setFiltros(f => ({ ...f, nivel_urgencia: e.target.value }))}>
            <option value="">Todas las urgencias</option>
            {NIVELES.map(n => <option key={n} value={n}>{n}</option>)}
          </select>
        </div>
      </div>

      <div className="card">
        {loading ? <Loader /> : data.length === 0 ? <EmptyState title="Sin correctivos" /> : (
          <div className="overflow-x-auto scroll-thin">
            <table className="table-base">
              <thead>
                <tr>
                  <th className="table-th">Reportado</th>
                  <th className="table-th">Edificio-Obra / Ascensor</th>
                  <th className="table-th">Falla</th>
                  <th className="table-th">Urgencia</th>
                  <th className="table-th">Servicio</th>
                  <th className="table-th">Estado</th>
                  <th className="table-th text-right">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {data.map(c => {
                  const editable = puedeEditar
                    && !esCorrectivoCerrado(c.estado_correctivo)
                    && (!c.servicio || esServicioEditable(c.servicio.estado_servicio));
                  return (
                  <tr key={c.id} className="table-row-hover">
                    <td className="table-td text-xs">{formatFechaHora(c.fecha_reporte)}</td>
                    <td className="table-td text-xs">
                      <div>{nombreEdificio(c.ascensor?.edificio) || nombreCliente(c.cliente)}</div>
                      <div className="font-mono text-slate-500">{c.ascensor?.codigo}</div>
                    </td>
                    <td className="table-td text-sm">{c.falla}</td>
                    <td className="table-td"><span className={`badge ${badgeUrgencia(c.nivel_urgencia)}`}>{c.nivel_urgencia}</span></td>
                    <td className="table-td">
                      {c.servicio ? (
                        <div className="flex items-center gap-2">
                          <Link to={`/servicios/${c.servicio.id}`} className="font-mono text-xs text-brand-700">{c.servicio.codigo}</Link>
                          {c.servicio.sin_cobro === 1 && <span className="badge-green text-[10px]">Sin costo</span>}
                        </div>
                      ) : '—'}
                    </td>
                    <td className="table-td"><span className={`badge ${badgeEstado(c.estado_correctivo)}`}>{c.estado_correctivo}</span></td>
                    <td className="table-td text-right whitespace-nowrap">
                      {c.servicio && (
                        <Link to={`/servicios/${c.servicio.id}`} className="text-brand-700 text-xs hover:underline">Ver</Link>
                      )}
                      {editable && (
                        <>
                          {c.servicio && <span className="text-slate-300 mx-1.5">·</span>}
                          <button type="button" onClick={() => abrirEditar(c)} className="text-brand-700 text-xs hover:underline">Editar</button>
                        </>
                      )}
                      {puedeEliminar && (
                        <>
                          {(c.servicio || editable) && <span className="text-slate-300 mx-1.5">·</span>}
                          <button type="button" onClick={() => setAEliminar(c)} className="text-rose-600 text-xs hover:underline">Eliminar</button>
                        </>
                      )}
                      {!c.servicio && !editable && !puedeEliminar && <span className="text-slate-400 text-xs">—</span>}
                    </td>
                  </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        {!loading && data.length > 0 && (
          <Pagination page={page} pageSize={pageSize} total={total} totalPages={totalPages}
            onPage={setPage} onPageSize={setPageSize} />
        )}
      </div>

      <Modal open={open} onClose={cerrarModal} title={editando ? 'Editar correctivo' : 'Nuevo correctivo'} size="xl"
        footer={
          <>
            <button type="button" className="btn-secondary" onClick={cerrarModal} disabled={saving}>Cancelar</button>
            <button className="btn-primary" type="submit" form={FORM_ID} disabled={saving}>
              {saving
                ? (editando ? 'Guardando…' : 'Registrando…')
                : (editando ? 'Guardar cambios' : 'Registrar')}
            </button>
          </>
        }
      >
        <div className="space-y-5">
          <form id={FORM_ID} onSubmit={guardar} className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {editando && (
              <div className="sm:col-span-2 rounded-lg border border-amber-200 bg-amber-50 text-amber-900 text-xs p-3">
                Editar aquí sincroniza también el servicio vinculado (cliente, ascensor, precio, prioridad y descripción). Técnicos y checklist se gestionan desde el servicio.
              </div>
            )}
            <div>
              <label className="label">{labelCampoCliente} *</label>
              <ClienteAutocomplete
                clientes={clientes}
                value={form.id_cliente}
                onChange={(id) => setForm(f => ({ ...f, id_cliente: id, id_ascensor: '' }))}
                required
                placeholder="Escriba para buscar por nombre de edificio / obra…"
              />
            </div>
            <div>
              <label className="label">Ascensor *</label>
              <select className="select" required value={form.id_ascensor}
                onChange={e => setForm(f => ({ ...f, id_ascensor: e.target.value }))}>
                <option value="">— Seleccione —</option>
                {ascensoresFiltrados.map(a => <option key={a.id} value={a.id}>{a.codigo} {a.ubicacion ? `· ${a.ubicacion}` : ''}</option>)}
              </select>
            </div>
            <div className="sm:col-span-2">
              <label className="label">Descripción de la falla *</label>
              <textarea className="textarea" required rows="2" value={form.falla}
                onChange={e => setForm(f => ({ ...f, falla: e.target.value }))}
                placeholder="Detalle el problema detectado en el ascensor" />
            </div>
            <div>
              <label className="label">Nivel de urgencia</label>
              <select className="select" value={form.nivel_urgencia}
                onChange={e => setForm(f => ({ ...f, nivel_urgencia: e.target.value }))}>
                {NIVELES.map(n => <option key={n}>{n}</option>)}
              </select>
            </div>
            {puedeVerPrecio && (
              <div>
                <label className="label">Cobertura</label>
                <label className="flex items-center gap-2 h-[42px] px-3 rounded-lg ring-1 ring-slate-200 bg-slate-50 cursor-pointer">
                  <input type="checkbox" checked={form.sin_cobro}
                    onChange={e => setForm(f => ({ ...f, sin_cobro: e.target.checked, precio_interno: e.target.checked ? '' : f.precio_interno }))} />
                  <span className="text-sm text-slate-700">Sin costo (cliente con cobertura)</span>
                </label>
              </div>
            )}
            {puedeVerPrecio && !form.sin_cobro && (
              <div>
                <label className="label">Precio interno (S/) *</label>
                <input type="number" step="0.01" className="input" required value={form.precio_interno}
                  onChange={e => setForm(f => ({ ...f, precio_interno: e.target.value }))} />
              </div>
            )}
            <div className="sm:col-span-2">
              <label className="label">Observaciones</label>
              <textarea className="textarea" rows="2" value={form.observaciones}
                onChange={e => setForm(f => ({ ...f, observaciones: e.target.value }))} />
            </div>
          </form>

          {!editando && (
            <>
              <div className="border-t border-slate-100 pt-4">
                <div className="flex items-center justify-between mb-2">
                  <h4 className="font-medium text-slate-800">Técnicos asignados (opcional)</h4>
                  <button type="button" onClick={agregarTec} className="btn-secondary text-xs">+ Agregar técnico</button>
                </div>
                {asignaciones.length === 0 && <p className="text-xs text-slate-500">Sin técnicos. Se podrán asignar después desde el detalle del servicio.</p>}
                {asignaciones.length > 0 && (
                  <div className="overflow-x-auto scroll-thin">
                    <table className="table-base">
                      <thead><tr>
                        <th className="table-th">Técnico</th><th className="table-th">Rol</th>
                        <th className="table-th text-center">Principal</th>
                        <th className="table-th text-center">Documental</th>
                        <th className="table-th text-center">Checklist</th>
                        <th className="table-th"></th>
                      </tr></thead>
                      <tbody className="divide-y divide-slate-100">
                        {asignaciones.map((a, idx) => (
                          <tr key={idx}>
                            <td className="table-td">
                              <select className="select" value={a.id_tecnico}
                                onChange={e => cambiarTec(idx, 'id_tecnico', Number(e.target.value))}>
                                <option value="">— Seleccione —</option>
                                {tecnicosDisponiblesPara(asignaciones, tecnicos, idx).map(t => <option key={t.id} value={t.id}>{t.nombre}</option>)}
                              </select>
                            </td>
                            <td className="table-td">
                              <select className="select" value={a.rol_asignacion}
                                onChange={e => cambiarTec(idx, 'rol_asignacion', e.target.value)}>
                                {ROLES_ASIG.map(r => <option key={r}>{r}</option>)}
                              </select>
                            </td>
                            <td className="table-td text-center"><input type="checkbox" checked={a.responsable_principal} onChange={e => cambiarTec(idx, 'responsable_principal', e.target.checked)} /></td>
                            <td className="table-td text-center"><input type="checkbox" checked={a.responsable_documentacion} onChange={e => cambiarTec(idx, 'responsable_documentacion', e.target.checked)} /></td>
                            <td className="table-td text-center"><input type="checkbox" checked={a.responsable_checklist} onChange={e => cambiarTec(idx, 'responsable_checklist', e.target.checked)} /></td>
                            <td className="table-td text-right"><button type="button" onClick={() => quitarTec(idx)} className="text-rose-600 text-xs">Quitar</button></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {asignaciones.length > 0 && (
                <div className="border-t border-slate-100 pt-4">
                  <div className="flex items-center justify-between mb-2">
                    <h4 className="font-medium text-slate-800">Checklist de salida (opcional)</h4>
                    <button type="button" onClick={agregarItem} className="btn-secondary text-xs">+ Agregar ítem</button>
                  </div>
                  {items.length === 0 && <p className="text-xs text-slate-500">Sin ítems. Podrá editarse después.</p>}
                  {items.length > 0 && (
                    <div className="overflow-x-auto scroll-thin">
                      <table className="table-base">
                        <thead><tr>
                          <th className="table-th">Tipo</th><th className="table-th">Ítem</th>
                          <th className="table-th">Cantidad</th><th className="table-th">Unidad</th>
                          <th className="table-th">Observación</th><th className="table-th"></th>
                        </tr></thead>
                        <tbody className="divide-y divide-slate-100">
                          {items.map((it, idx) => (
                            <tr key={idx}>
                              <td className="table-td"><select className="select" value={it.tipo_item} onChange={e => cambiarItem(idx, 'tipo_item', e.target.value)}>{TIPOS_ITEM.map(t => <option key={t}>{t}</option>)}</select></td>
                              <td className="table-td"><input className="input" value={it.nombre} onChange={e => cambiarItem(idx, 'nombre', e.target.value)} placeholder="Nombre" /></td>
                              <td className="table-td"><input type="number" step="0.01" className="input" value={it.cantidad} onChange={e => cambiarItem(idx, 'cantidad', e.target.value)} /></td>
                              <td className="table-td"><select className="select" value={it.unidad} onChange={e => cambiarItem(idx, 'unidad', e.target.value)}>{UNIDADES.map(u => <option key={u}>{u}</option>)}</select></td>
                              <td className="table-td"><input className="input" value={it.observaciones} onChange={e => cambiarItem(idx, 'observaciones', e.target.value)} /></td>
                              <td className="table-td text-right"><button type="button" onClick={() => quitarItem(idx)} className="text-rose-600 text-xs">Quitar</button></td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </Modal>

      <ConfirmarEliminacion
        open={!!aEliminar}
        onClose={() => setAEliminar(null)}
        titulo="Eliminar correctivo"
        palabraClave={aEliminar?.servicio?.codigo || 'ELIMINAR'}
        descripcion={
          aEliminar?.servicio
            ? `Se dará de baja el correctivo y su servicio vinculado ${aEliminar.servicio.codigo}, incluyendo asignaciones, checklist, evidencias, cobro, eventos de calendario y recordatorios. Esta acción revierte todo el flujo.`
            : 'Se dará de baja el correctivo y todo lo que generó en cascada.'
        }
        onConfirmar={async () => {
          try {
            await correctivosService.remove(aEliminar.id);
            toast.success('Correctivo eliminado');
            setAEliminar(null);
            cargar();
          } catch (err) {
            toast.error(err.response?.data?.error || 'Error al eliminar correctivo');
          }
        }}
      />
    </>
  );
}
