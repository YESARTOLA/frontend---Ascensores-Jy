import { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { emergenciasService, clientesService, ascensoresService, tecnicosService, serviciosService } from '../services';
import PageHeader from '../components/common/PageHeader.jsx';
import Loader from '../components/common/Loader.jsx';
import Modal from '../components/common/Modal.jsx';
import ConfirmarEliminacion from '../components/common/ConfirmarEliminacion.jsx';
import EmptyState from '../components/common/EmptyState.jsx';
import Pagination, { usePaginatedList } from '../components/common/Pagination.jsx';
import { useToast } from '../components/common/Toast.jsx';
import { useAuth } from '../features/auth/AuthContext.jsx';
import ClienteAutocomplete from '../components/common/ClienteAutocomplete.jsx';
import AdjuntosEmergenciaModal from '../components/emergencias/AdjuntosEmergenciaModal.jsx';
import { badgeEstado, formatFecha, formatFechaHora, hoyISO, nombreCliente, nombreEdificio } from '../utils/formatters.js';
import { esAscensorServiciable } from '../utils/ascensoresSeleccion.js';
import { esServicioEditable, esEmergenciaCerrada, ESTADOS_EMERGENCIA } from '../utils/estadoServicio.js';

const NIVELES_URGENCIA = ['alta', 'media', 'baja'];
import { actualizarFilaAsignacion, validarConsistenciaAsignaciones, tecnicosDisponiblesPara } from '../utils/asignaciones.js';

const ROLES_ASIG = ['Responsable principal', 'Apoyo técnico', 'Especialista', 'Supervisor técnico'];
const TIPOS_ITEM = ['Herramienta', 'Material', 'Equipo', 'Repuesto', 'Otro'];
const UNIDADES = ['Unidad', 'Metro', 'Caja', 'Bolsa', 'Litro', 'Juego', 'Otro'];
const FORM_ID = 'form-emergencia';

// requiere_factura por defecto en false: las emergencias nacen "sin factura" (editable).
const inicial = { id_cliente: '', id_ascensor: '', motivo: '', nivel_urgencia: 'alta', fecha_programada: '', hora_programada: '', fecha_estimada_entrega: '', precio_interno: '', sin_cobro: false, requiere_factura: false, observaciones: '' };

export default function Emergencias() {
  const [clientes, setClientes] = useState([]);
  const [ascensores, setAscensores] = useState([]);
  const [tecnicos, setTecnicos] = useState([]);
  const [open, setOpen] = useState(false);
  const [editando, setEditando] = useState(null);
  const [form, setForm] = useState(inicial);
  const [asignaciones, setAsignaciones] = useState([]);
  const [items, setItems] = useState([]);
  // Emergencia cuyo modal de adjuntos está abierto desde la tabla.
  const [adjuntosDe, setAdjuntosDe] = useState(null);
  // Adjuntos cargados durante la CREACIÓN: la emergencia aún no existe, así que
  // se guardan aquí y viajan como ids en el payload de create.
  const [adjuntosBorrador, setAdjuntosBorrador] = useState([]);
  const [adjuntosBorradorAbierto, setAdjuntosBorradorAbierto] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const guardandoRef = useRef(false);
  const toast = useToast();
  const { esSuperAdmin, esAdmin, esCoordinador, puedeVerPrecio } = useAuth();
  const puedeCrear = esSuperAdmin || esAdmin || esCoordinador;
  const puedeEditar = esSuperAdmin || esAdmin || esCoordinador;
  // Eliminar una emergencia (y su servicio vinculado) queda restringido al superadministrador.
  const puedeEliminar = esSuperAdmin;

  const [filtros, setFiltros] = useState({ q: '', estado_emergencia: '', nivel_urgencia: '' });
  const { data, loading, total, page, pageSize, totalPages, setPage, setPageSize, recargar } =
    usePaginatedList(emergenciasService.paginate, filtros, { initialPageSize: 25 });
  const cargar = recargar;

  // Cambia la marca con/sin factura del servicio en cualquier momento (hasta que
  // exista una factura emitida; el backend rechaza si ya la hay).
  const toggleRequiereFactura = async (e) => {
    if (!e.servicio) return;
    try {
      await serviciosService.setRequiereFactura(e.servicio.id, e.servicio.requiere_factura === 0);
      cargar();
    } catch (err) {
      toast.error(err.response?.data?.error || 'No se pudo cambiar la marca de facturación');
    }
  };

  useEffect(() => {
    Promise.all([clientesService.list(), ascensoresService.list(), tecnicosService.list()])
      .then(([c, a, t]) => { setClientes(c); setAscensores(a); setTecnicos(t); })
      .catch(() => {});
  }, []);

  const ascensoresFiltrados = (form.id_cliente ? ascensores.filter(a => String(a.edificio?.cliente?.id) === String(form.id_cliente)) : ascensores).filter(esAscensorServiciable);
  const labelCampoCliente = 'Cliente';

  const agregarTec = () => setAsignaciones(a => [...a, { id_tecnico: '', rol_asignacion: 'Apoyo técnico', responsable_principal: false, responsable_documentacion: false, responsable_checklist: false }]);
  const quitarTec = (idx) => setAsignaciones(a => a.filter((_, i) => i !== idx));
  const cambiarTec = (idx, key, val) => setAsignaciones(a => actualizarFilaAsignacion(a, idx, key, val));

  const agregarItem = () => setItems(i => [...i, { tipo_item: 'Herramienta', nombre: '', cantidad: 1, unidad: 'Unidad', observaciones: '' }]);
  const cambiarItem = (idx, key, val) => setItems(i => i.map((x, j) => j === idx ? { ...x, [key]: val } : x));
  const quitarItem = (idx) => setItems(i => i.filter((_, j) => j !== idx));

  const abrirNuevo = () => {
    setEditando(null);
    setForm({ ...inicial, fecha_programada: hoyISO() });
    setAsignaciones([]);
    setItems([]);
    setAdjuntosBorrador([]);
    setOpen(true);
  };

  const abrirEditar = (em) => {
    if (esEmergenciaCerrada(em.estado_emergencia)) {
      toast.error('La emergencia ya está cerrada y no se puede editar.');
      return;
    }
    if (em.servicio && !esServicioEditable(em.servicio.estado_servicio)) {
      toast.error(`El servicio asociado está en "${em.servicio.estado_servicio}" y no admite cambios.`);
      return;
    }
    setEditando(em.id);
    setForm({
      id_cliente: String(em.id_cliente || ''),
      id_ascensor: String(em.id_ascensor || ''),
      motivo: em.motivo || '',
      nivel_urgencia: em.nivel_urgencia || 'alta',
      fecha_programada: em.servicio?.fecha_programada ? String(em.servicio.fecha_programada).slice(0, 10) : '',
      hora_programada: em.servicio?.hora_programada || '',
      fecha_estimada_entrega: em.servicio?.fecha_estimada_entrega ? String(em.servicio.fecha_estimada_entrega).slice(0, 10) : '',
      precio_interno: em.servicio?.precio_interno != null ? String(em.servicio.precio_interno) : '',
      sin_cobro: em.servicio?.sin_cobro === 1,
      requiere_factura: em.servicio?.requiere_factura === 1,
      observaciones: em.observaciones || ''
    });
    setAsignaciones([]);
    setItems([]);
    setOpen(true);
  };

  // Soporte ?edit=ID en la URL (ej. desde ServicioDetalle → botón Editar).
  // Reutiliza el mismo modal de edición que el botón Editar del listado.
  const [searchParams, setSearchParams] = useSearchParams();
  useEffect(() => {
    const editId = searchParams.get('edit');
    if (!editId || !puedeEditar) return;
    const limpiarParam = () => {
      const next = new URLSearchParams(searchParams);
      next.delete('edit');
      setSearchParams(next, { replace: true });
    };
    emergenciasService.get(Number(editId))
      .then(em => { abrirEditar(em); limpiarParam(); })
      .catch(err => { toast.error(err.response?.data?.error || 'Emergencia no encontrada'); limpiarParam(); });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, puedeEditar]);

  const [aEliminar, setAEliminar] = useState(null);
  const eliminar = async () => {
    try {
      await emergenciasService.remove(aEliminar.id);
      toast.success('Emergencia eliminada');
      setAEliminar(null);
      cargar();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Error al eliminar');
    }
  };

  const cerrarModal = () => {
    if (guardandoRef.current) return;
    setOpen(false);
    setEditando(null);
    setForm(inicial);
    setAsignaciones([]);
    setItems([]);
    setAdjuntosBorrador([]);
    setAdjuntosBorradorAbierto(false);
  };

  const guardar = async (e) => {
    if (e?.preventDefault) e.preventDefault();
    if (guardandoRef.current) return;
    if (!editando) {
      const consistencia = validarConsistenciaAsignaciones(asignaciones);
      if (!consistencia.ok) return toast.error(consistencia.error);
    }
    guardandoRef.current = true;
    setGuardando(true);
    try {
      if (editando) {
        // Edición: solo metadatos del registro + datos del servicio vinculado.
        // Técnicos y checklist se gestionan desde el servicio.
        const payload = {
          id_cliente: form.id_cliente,
          id_ascensor: form.id_ascensor,
          motivo: form.motivo,
          nivel_urgencia: form.nivel_urgencia,
          fecha_programada: form.fecha_programada,
          hora_programada: form.hora_programada,
          fecha_estimada_entrega: form.fecha_estimada_entrega,
          observaciones: form.observaciones,
          sin_cobro: form.sin_cobro,
          requiere_factura: form.requiere_factura,
          precio_interno: form.sin_cobro ? 0 : form.precio_interno
        };
        await emergenciasService.update(editando, payload);
        toast.success('Emergencia actualizada');
      } else {
        const payload = {
          ...form,
          precio_interno: form.sin_cobro ? 0 : form.precio_interno,
          tecnicos: asignaciones,
          items_checklist: items,
          archivos: adjuntosBorrador.map((a, i) => ({ id_archivo: a.id_archivo, orden: i + 1 }))
        };
        await emergenciasService.create(payload);
        toast.success('Emergencia registrada');
      }
      guardandoRef.current = false;
      cerrarModal();
      cargar();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Error');
    } finally {
      setGuardando(false);
      guardandoRef.current = false;
    }
  };

  return (
    <>
      <PageHeader title="Emergencias" subtitle={`${total} emergencia(s)`} actions={puedeCrear && <button onClick={abrirNuevo} className="btn-danger">+ Nueva emergencia</button>} />

      <div className="card mb-4">
        <div className="p-4 grid grid-cols-1 sm:grid-cols-4 gap-2">
          <input className="input sm:col-span-2" placeholder="Buscar por edificio, cliente, ascensor, código o motivo…"
            value={filtros.q} onChange={e => setFiltros(f => ({ ...f, q: e.target.value }))} />
          <select className="select" value={filtros.estado_emergencia}
            onChange={e => setFiltros(f => ({ ...f, estado_emergencia: e.target.value }))}>
            <option value="">Todos los estados</option>
            {ESTADOS_EMERGENCIA.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
          <select className="select" value={filtros.nivel_urgencia}
            onChange={e => setFiltros(f => ({ ...f, nivel_urgencia: e.target.value }))}>
            <option value="">Todas las urgencias</option>
            {NIVELES_URGENCIA.map(n => <option key={n} value={n}>{n}</option>)}
          </select>
        </div>
      </div>

      <div className="card">
        {loading ? <Loader /> : data.length === 0 ? <EmptyState title="Sin emergencias" /> : (
          <div className="overflow-x-auto scroll-thin">
            <table className="table-base">
              <thead><tr>
                <th className="table-th">Reportada</th>
                <th className="table-th">Edificio-Obra / Ascensor</th>
                <th className="table-th">Motivo</th>
                <th className="table-th">Fecha programada</th>
                <th className="table-th">Fecha estimada término</th>
                <th className="table-th">Estado</th>
                <th className="table-th">Urgencia</th>
                <th className="table-th">Servicio</th>
                <th className="table-th">Ejecución</th>
                <th className="table-th">Técnico</th>
                <th className="table-th">Observaciones</th>
                <th className="table-th">Adjuntos</th>
                <th className="table-th text-right">Acciones</th>
              </tr></thead>
              <tbody className="divide-y divide-slate-100">
                {data.map(e => {
                  const ej = e.ejecucion || {};
                  const editable = puedeEditar
                    && !esEmergenciaCerrada(e.estado_emergencia)
                    && (!e.servicio || esServicioEditable(e.servicio.estado_servicio));
                  return (
                  <tr key={e.id} className="table-row-hover">
                    <td className="table-td text-xs">{formatFechaHora(e.fecha_reporte)}</td>
                    <td className="table-td text-xs"><div>{nombreEdificio(e.ascensor?.edificio) || nombreCliente(e.cliente)}</div><div className="font-mono text-slate-500">{e.ascensor?.codigo}</div></td>
                    <td className="table-td text-sm">{e.motivo}</td>
                    <td className="table-td text-xs">{e.servicio?.fecha_programada ? `${formatFecha(e.servicio.fecha_programada)}${e.servicio.hora_programada ? ` ${e.servicio.hora_programada}` : ''}` : '—'}</td>
                    <td className="table-td text-xs">{e.servicio?.fecha_estimada_entrega ? formatFecha(e.servicio.fecha_estimada_entrega) : '—'}</td>
                    <td className="table-td"><span className={badgeEstado(e.estado_emergencia)}>{e.estado_emergencia}</span></td>
                    <td className="table-td"><span className={e.nivel_urgencia === 'alta' ? 'badge-red' : 'badge-amber'}>{e.nivel_urgencia}</span></td>
                    <td className="table-td">
                      {e.servicio ? (
                        <div className="flex items-center gap-2">
                          <Link to={`/servicios/${e.servicio.id}`} className="font-mono text-xs text-brand-700">{e.servicio.codigo}</Link>
                          {e.servicio.sin_cobro === 1 && <span className="badge-green text-[10px]">Sin costo</span>}
                          {puedeEditar ? (
                            <button type="button" onClick={() => toggleRequiereFactura(e)}
                              title="Clic para cambiar entre con / sin factura"
                              className={`text-[10px] cursor-pointer hover:ring-1 hover:ring-brand-300 ${e.servicio.requiere_factura === 0 ? 'badge-gray' : 'badge-blue'}`}>
                              {e.servicio.requiere_factura === 0 ? 'Sin factura' : 'Con factura'}
                            </button>
                          ) : (
                            e.servicio.requiere_factura === 0
                              ? <span className="badge-gray text-[10px]">Sin factura</span>
                              : <span className="badge-blue text-[10px]">Con factura</span>
                          )}
                        </div>
                      ) : '—'}
                    </td>
                    <td className="table-td"><span className={badgeEstado(ej.estado_ejecucion)}>{ej.estado_ejecucion || '—'}</span></td>
                    <td className="table-td text-xs">{(e.servicio?.asignaciones || []).map(a => a.tecnico?.nombre).filter(Boolean).join(', ') || '—'}</td>
                    <td className="table-td text-xs text-slate-600 max-w-[16rem]">
                      {e.observaciones || <span className="text-slate-400">—</span>}
                    </td>
                    <td className="table-td text-xs">
                      <button
                        type="button"
                        onClick={() => setAdjuntosDe(e)}
                        title="Ver fotos y videos de la emergencia"
                        className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] ring-1 transition ${
                          (e._count?.archivos || 0) > 0
                            ? 'bg-brand-50 text-brand-700 ring-brand-200 hover:bg-brand-100'
                            : 'text-slate-400 ring-slate-200 hover:bg-slate-50'
                        }`}
                      >
                        <span aria-hidden="true">📎</span>
                        {e._count?.archivos || 0}
                      </button>
                    </td>
                    <td className="table-td text-right whitespace-nowrap">
                      {e.servicio && (
                        <Link to={`/servicios/${e.servicio.id}`} className="text-brand-700 text-xs hover:underline">Ver detalle</Link>
                      )}
                      {editable && (
                        <>
                          {e.servicio && <span className="text-slate-300 mx-1.5">·</span>}
                          <button type="button" onClick={() => abrirEditar(e)} className="text-brand-700 text-xs hover:underline">Editar</button>
                        </>
                      )}
                      {puedeEliminar && (
                        <>
                          {(e.servicio || editable) && <span className="text-slate-300 mx-1.5">·</span>}
                          <button type="button" onClick={() => setAEliminar(e)} className="text-rose-600 text-xs hover:underline">Eliminar</button>
                        </>
                      )}
                      {!e.servicio && !editable && !puedeEliminar && <span className="text-slate-400 text-xs">—</span>}
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

      <Modal open={open} onClose={cerrarModal} title={editando ? 'Editar emergencia' : 'Nueva emergencia'} size="xl"
        footer={<>
          <button type="button" className="btn-secondary" onClick={cerrarModal} disabled={guardando}>Cancelar</button>
          <button type="submit" form={FORM_ID} className="btn-danger" disabled={guardando}>
            {guardando
              ? (editando ? 'Guardando…' : 'Registrando…')
              : (editando ? 'Guardar cambios' : 'Registrar')}
          </button>
        </>}>
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
              <select className="select" required value={form.id_ascensor} onChange={e => setForm(f => ({ ...f, id_ascensor: e.target.value }))}>
                <option value="">— Seleccione —</option>
                {ascensoresFiltrados.map(a => <option key={a.id} value={a.id}>{a.codigo} {a.ubicacion ? `· ${a.ubicacion}` : ''}</option>)}
              </select>
            </div>
            <div className="sm:col-span-2"><label className="label">Motivo *</label><textarea className="textarea" required rows="2" value={form.motivo} onChange={e => setForm(f => ({ ...f, motivo: e.target.value }))} /></div>
            <div><label className="label">Nivel de urgencia</label><select className="select" value={form.nivel_urgencia} onChange={e => setForm(f => ({ ...f, nivel_urgencia: e.target.value }))}><option>alta</option><option>media</option><option>baja</option></select></div>
            <div>
              <label className="label">Fecha programada *</label>
              <input type="date" className="input" required value={form.fecha_programada}
                onChange={e => setForm(f => ({ ...f, fecha_programada: e.target.value, fecha_estimada_entrega: f.fecha_estimada_entrega && f.fecha_estimada_entrega < e.target.value ? '' : f.fecha_estimada_entrega }))} />
            </div>
            <div>
              <label className="label">Hora programada</label>
              <input type="time" className="input" value={form.hora_programada}
                onChange={e => setForm(f => ({ ...f, hora_programada: e.target.value }))} />
            </div>
            <div className="sm:col-span-2">
              <label className="label">Fecha estimada de término</label>
              <input type="date" className="input" value={form.fecha_estimada_entrega} min={form.fecha_programada || undefined}
                onChange={e => setForm(f => ({ ...f, fecha_estimada_entrega: e.target.value }))} />
              <p className="text-xs text-slate-500 mt-1">Opcional. Si el servicio ocupará varios días, indica el término estimado; si se deja vacío, se agenda solo el día programado.</p>
            </div>
            {puedeVerPrecio && (
              <div>
                <label className="label">Cobertura</label>
                <label className="flex items-center gap-2 h-[42px] px-3 rounded-lg ring-1 ring-slate-200 bg-slate-50 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={form.sin_cobro}
                    onChange={e => setForm(f => ({ ...f, sin_cobro: e.target.checked, precio_interno: e.target.checked ? '' : f.precio_interno }))}
                  />
                  <span className="text-sm text-slate-700">Sin costo (cliente con cobertura)</span>
                </label>
              </div>
            )}
            {puedeVerPrecio && !form.sin_cobro && <div><label className="label">Precio interno (S/) *</label><input type="number" step="0.01" className="input" required value={form.precio_interno} onChange={e => setForm(f => ({ ...f, precio_interno: e.target.value }))} /></div>}
            <div>
              <label className="label">Facturación</label>
              <label className="flex items-center gap-2 h-[42px] px-3 rounded-lg ring-1 ring-slate-200 bg-slate-50 cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.requiere_factura}
                  onChange={e => setForm(f => ({ ...f, requiere_factura: e.target.checked }))}
                />
                <span className="text-sm text-slate-700">Requiere factura</span>
              </label>
            </div>
            <div className="sm:col-span-2"><label className="label">Observaciones</label><textarea className="textarea" rows="2" value={form.observaciones} onChange={e => setForm(f => ({ ...f, observaciones: e.target.value }))} /></div>
          </form>

          {!editando && (
            <>
              <div className="border-t border-slate-100 pt-4">
                <div className="flex items-center justify-between mb-2">
                  <h4 className="font-medium text-slate-800">Fotos y videos (opcional)</h4>
                  <button type="button" onClick={() => setAdjuntosBorradorAbierto(true)} className="btn-secondary text-xs">
                    {adjuntosBorrador.length > 0 ? `Gestionar (${adjuntosBorrador.length})` : '+ Agregar adjuntos'}
                  </button>
                </div>
                <p className="text-xs text-slate-500">
                  {adjuntosBorrador.length === 0
                    ? 'Adjunta fotos o videos de la falla para que el técnico asignado los revise antes de salir a campo.'
                    : `${adjuntosBorrador.length} archivo(s) listo(s) para vincularse al registrar.`}
                </p>
              </div>

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
                              <select className="select" value={a.id_tecnico} onChange={e => cambiarTec(idx, 'id_tecnico', Number(e.target.value))}>
                                <option value="">— Seleccione —</option>
                                {tecnicosDisponiblesPara(asignaciones, tecnicos, idx).map(t => <option key={t.id} value={t.id}>{t.nombre}</option>)}
                              </select>
                            </td>
                            <td className="table-td">
                              <select className="select" value={a.rol_asignacion} onChange={e => cambiarTec(idx, 'rol_asignacion', e.target.value)}>
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

      {/* Adjuntos de una emergencia ya existente (chip de la tabla). */}
      <AdjuntosEmergenciaModal
        open={!!adjuntosDe}
        onClose={() => setAdjuntosDe(null)}
        idEmergencia={adjuntosDe?.id}
        puedeGestionar={puedeEditar}
        onCambio={cargar}
      />

      {/* Adjuntos en borrador durante la creación (aún no hay id de emergencia). */}
      <AdjuntosEmergenciaModal
        open={adjuntosBorradorAbierto}
        onClose={() => setAdjuntosBorradorAbierto(false)}
        idEmergencia={null}
        puedeGestionar={puedeCrear}
        borrador={adjuntosBorrador}
        onChangeBorrador={setAdjuntosBorrador}
      />

      <ConfirmarEliminacion
        open={!!aEliminar}
        onClose={() => setAEliminar(null)}
        titulo="Eliminar emergencia"
        palabraClave={aEliminar?.servicio?.codigo || 'ELIMINAR'}
        descripcion={
          aEliminar?.servicio
            ? `Se dará de baja la emergencia y su servicio vinculado ${aEliminar.servicio.codigo}, incluyendo asignaciones, checklist, evidencias, cobro, eventos de calendario y recordatorios. Esta acción revierte todo el flujo.`
            : 'Se dará de baja la emergencia y todo lo que generó en cascada.'
        }
        onConfirmar={eliminar}
      />
    </>
  );
}
