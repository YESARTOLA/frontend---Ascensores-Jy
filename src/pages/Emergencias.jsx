import { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { emergenciasService, clientesService, ascensoresService, tecnicosService } from '../services';
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
import { esServicioEditable, esEmergenciaCerrada, estaServicioFinalizado, ESTADOS_EMERGENCIA } from '../utils/estadoServicio.js';
import ProgramacionDias from '../components/common/ProgramacionDias.jsx';
import {
  tramoDeUnDia, tramosDeServicio, fechasDesdeTramos, payloadDias, errorDeTramos, etiquetaProgramacion
} from '../utils/programacion.js';

const NIVELES_URGENCIA = ['alta', 'media', 'baja'];
import { actualizarFilaAsignacion, validarConsistenciaAsignaciones, tecnicosDisponiblesPara } from '../utils/asignaciones.js';

const ROLES_ASIG = ['Responsable principal', 'Apoyo técnico', 'Especialista', 'Supervisor técnico'];
const FORM_ID = 'form-emergencia';

// Sin campos de cobro ni de factura: la emergencia nace sin costo y sin factura
// (lo fija el backend); ajustarlo es cosa del servicio vinculado.
// `tramos` son los días de trabajo: lista de { desde, hasta }. Un día suelto es
// un tramo con desde === hasta; un rango, uno con hasta posterior. Se combinan.
// Sin campos económicos: la emergencia se registra siempre sin costo (el
// backend la crea en 0 y marcada `sin_cobro`).
const inicial = { id_cliente: '', id_ascensor: '', motivo: '', nivel_urgencia: 'alta', tramos: [], hora_programada: '', fecha_estimada_entrega: '', observaciones: '' };

export default function Emergencias() {
  const [clientes, setClientes] = useState([]);
  const [ascensores, setAscensores] = useState([]);
  const [tecnicos, setTecnicos] = useState([]);
  const [open, setOpen] = useState(false);
  const [editando, setEditando] = useState(null);
  const [form, setForm] = useState(inicial);
  const [asignaciones, setAsignaciones] = useState([]);
  // Emergencia cuyo modal de adjuntos está abierto desde la tabla.
  const [adjuntosDe, setAdjuntosDe] = useState(null);
  // Adjuntos cargados durante la CREACIÓN: la emergencia aún no existe, así que
  // se guardan aquí y viajan como ids en el payload de create.
  const [adjuntosBorrador, setAdjuntosBorrador] = useState([]);
  const [adjuntosBorradorAbierto, setAdjuntosBorradorAbierto] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const guardandoRef = useRef(false);
  const toast = useToast();
  const { esSuperAdmin, esAdmin, esCoordinador } = useAuth();
  const puedeCrear = esSuperAdmin || esAdmin || esCoordinador;
  const puedeEditar = esSuperAdmin || esAdmin || esCoordinador;
  // Eliminar una emergencia (y su servicio vinculado) queda restringido al superadministrador.
  const puedeEliminar = esSuperAdmin;

  const [filtros, setFiltros] = useState({ q: '', estado_emergencia: '', nivel_urgencia: '' });
  const { data, loading, total, page, pageSize, totalPages, setPage, setPageSize, recargar } =
    usePaginatedList(emergenciasService.paginate, filtros, { initialPageSize: 25 });
  const cargar = recargar;

  useEffect(() => {
    Promise.all([clientesService.list(), ascensoresService.list(), tecnicosService.list()])
      .then(([c, a, t]) => { setClientes(c); setAscensores(a); setTecnicos(t); })
      .catch(() => {});
  }, []);

  const ascensoresFiltrados = (form.id_cliente ? ascensores.filter(a => String(a.edificio?.cliente?.id) === String(form.id_cliente)) : ascensores).filter(esAscensorServiciable);
  const labelCampoCliente = 'Cliente';

  const agregarTec = () => setAsignaciones(a => [...a, { id_tecnico: '', rol_asignacion: 'Apoyo técnico', responsable_principal: false, responsable_documentacion: false }]);
  const quitarTec = (idx) => setAsignaciones(a => a.filter((_, i) => i !== idx));
  const cambiarTec = (idx, key, val) => setAsignaciones(a => actualizarFilaAsignacion(a, idx, key, val));


  const abrirNuevo = () => {
    setEditando(null);
    setForm({ ...inicial, tramos: [tramoDeUnDia(hoyISO())] });
    setAsignaciones([]);
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
      tramos: tramosDeServicio(em.servicio),
      hora_programada: em.servicio?.hora_programada || '',
      fecha_estimada_entrega: em.servicio?.fecha_estimada_entrega ? String(em.servicio.fecha_estimada_entrega).slice(0, 10) : '',
      observaciones: em.observaciones || ''
    });
    setAsignaciones([]);
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
    const errorProgramacion = errorDeTramos(form.tramos);
    if (errorProgramacion) return toast.error(errorProgramacion);
    // La fecha programada del servicio es siempre el PRIMER día de trabajo.
    const primerDia = fechasDesdeTramos(form.tramos)[0];
    guardandoRef.current = true;
    setGuardando(true);
    try {
      if (editando) {
        // Edición: solo metadatos del registro + datos del servicio vinculado.
        // Los técnicos se gestionan desde el servicio.
        const payload = {
          id_cliente: form.id_cliente,
          id_ascensor: form.id_ascensor,
          motivo: form.motivo,
          nivel_urgencia: form.nivel_urgencia,
          dias: payloadDias(form.tramos),
          fecha_programada: primerDia,
          hora_programada: form.hora_programada,
          fecha_estimada_entrega: form.fecha_estimada_entrega,
          observaciones: form.observaciones
          // Nada económico viaja desde aquí (`sin_cobro`, `precio_interno`,
          // `requiere_factura`): la emergencia se registra sin costo y sin
          // factura; si alguna vez debe cobrarse, se ajusta desde el servicio.
        };
        await emergenciasService.update(editando, payload);
        toast.success('Emergencia actualizada');
      } else {
        const { tramos, ...resto } = form;
        const payload = {
          ...resto,
          dias: payloadDias(tramos),
          fecha_programada: primerDia,
          tecnicos: asignaciones,
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
                <th className="table-th">Servicio</th>
                <th className="table-th">Técnico</th>
                <th className="table-th">Adjuntos</th>
                <th className="table-th text-right">Acciones</th>
              </tr></thead>
              <tbody className="divide-y divide-slate-100">
                {data.map(e => {
                  const editable = puedeEditar
                    && !esEmergenciaCerrada(e.estado_emergencia)
                    && (!e.servicio || esServicioEditable(e.servicio.estado_servicio));
                  // Cotizable (cobro sobre servicio existente): solo admin, con el
                  // servicio ya finalizado y aún no ligado a una cotización.
                  const cotizable = (esSuperAdmin || esAdmin)
                    && e.servicio
                    && estaServicioFinalizado(e.servicio.estado_servicio)
                    && !e.servicio.id_cotizacion;
                  return (
                  <tr key={e.id} className="table-row-hover">
                    <td className="table-td text-xs">{formatFechaHora(e.fecha_reporte)}</td>
                    <td className="table-td text-xs"><div>{nombreEdificio(e.ascensor?.edificio) || nombreCliente(e.cliente)}</div><div className="font-mono text-slate-500">{e.ascensor?.codigo}</div></td>
                    <td className="table-td text-sm">{e.motivo}</td>
                    <td className="table-td text-xs" title={etiquetaProgramacion(e.servicio).detalle}>{etiquetaProgramacion(e.servicio).texto}</td>
                    <td className="table-td text-xs">{e.servicio?.fecha_estimada_entrega ? formatFecha(e.servicio.fecha_estimada_entrega) : '—'}</td>
                    <td className="table-td"><span className={badgeEstado(e.estado_emergencia)}>{e.estado_emergencia}</span></td>
                    <td className="table-td">
                      {e.servicio
                        ? <Link to={`/servicios/${e.servicio.id}`} className="font-mono text-xs text-brand-700">{e.servicio.codigo}</Link>
                        : '—'}
                    </td>
                    <td className="table-td text-xs">{(e.servicio?.asignaciones || []).map(a => a.tecnico?.nombre).filter(Boolean).join(', ') || '—'}</td>
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
                      {cotizable && (
                        <>
                          <span className="text-slate-300 mx-1.5">·</span>
                          <Link to={`/cotizaciones?nuevo=1&emergencia=${e.id}`}
                            title="Crear una cotización de cobro con los datos de esta emergencia (no crea un servicio nuevo)"
                            className="text-brand-700 text-xs hover:underline">Cotizar</Link>
                        </>
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
                Editar aquí sincroniza también el servicio vinculado (cliente, ascensor, prioridad y descripción). Los técnicos y el dato económico se gestionan desde el servicio.
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
            <div className="sm:col-span-2">
              <ProgramacionDias
                tramos={form.tramos}
                onChange={tramos => setForm(f => ({
                  ...f,
                  tramos,
                  // El término estimado nunca puede quedar antes del primer día.
                  fecha_estimada_entrega: f.fecha_estimada_entrega && f.fecha_estimada_entrega < (fechasDesdeTramos(tramos)[0] || '')
                    ? '' : f.fecha_estimada_entrega
                }))} />
            </div>
            <div>
              <label className="label">Hora programada</label>
              <input type="time" className="input" value={form.hora_programada}
                onChange={e => setForm(f => ({ ...f, hora_programada: e.target.value }))} />
              <p className="text-xs text-slate-500 mt-1">Se aplica a todos los días programados.</p>
            </div>
            <div>
              <label className="label">Fecha estimada de término</label>
              <input type="date" className="input" value={form.fecha_estimada_entrega} min={fechasDesdeTramos(form.tramos)[0] || undefined}
                onChange={e => setForm(f => ({ ...f, fecha_estimada_entrega: e.target.value }))} />
              <p className="text-xs text-slate-500 mt-1">Opcional: fecha comprometida de entrega del trabajo. No cambia los días programados.</p>
            </div>
            {/* La emergencia no se cobra, así que tampoco se factura: ni precio
                ni facturación se piden aquí. El servicio nace en 0, sin costo y
                sin factura; si un caso concreto sí debe cobrarse, ambas cosas se
                habilitan desde el servicio vinculado. */}
            <div className="sm:col-span-2">
              <label className="label">Cobertura y facturación</label>
              <div className="flex flex-wrap items-center gap-2 px-3 py-2.5 rounded-lg ring-1 ring-emerald-200 bg-emerald-50/60">
                <span className="badge-green text-[10px]">Sin costo</span>
                <span className="badge-gray text-[10px]">Sin factura</span>
                <span className="text-xs text-slate-600">
                  La emergencia se registra sin cobro; al no cobrarse, tampoco se factura.
                </span>
              </div>
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
                            <td className="table-td text-right"><button type="button" onClick={() => quitarTec(idx)} className="text-rose-600 text-xs">Quitar</button></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

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
            ? `Se dará de baja la emergencia y su servicio vinculado ${aEliminar.servicio.codigo}, incluyendo asignaciones, evidencias, cobro, eventos de calendario y recordatorios. Esta acción revierte todo el flujo.`
            : 'Se dará de baja la emergencia y todo lo que generó en cascada.'
        }
        onConfirmar={eliminar}
      />
    </>
  );
}
