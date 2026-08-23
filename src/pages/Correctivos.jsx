import { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { correctivosService, clientesService, ascensoresService, tecnicosService, serviciosService } from '../services';
import PageHeader from '../components/common/PageHeader.jsx';
import Loader from '../components/common/Loader.jsx';
import Modal from '../components/common/Modal.jsx';
import ConfirmarEliminacion from '../components/common/ConfirmarEliminacion.jsx';
import EmptyState from '../components/common/EmptyState.jsx';
import Pagination, { usePaginatedList } from '../components/common/Pagination.jsx';
import { useToast } from '../components/common/Toast.jsx';
import { useAuth } from '../features/auth/AuthContext.jsx';
import ClienteAutocomplete from '../components/common/ClienteAutocomplete.jsx';
import { badgeEstado, formatFecha, formatFechaHora, hoyISO, nombreCliente, nombreEdificio } from '../utils/formatters.js';
import { esAscensorServiciable } from '../utils/ascensoresSeleccion.js';
import ProgramacionDias from '../components/common/ProgramacionDias.jsx';
import {
  tramoDeUnDia, tramosDeServicio, fechasDesdeTramos, payloadDias, errorDeTramos, etiquetaProgramacion
} from '../utils/programacion.js';

// Duración de trabajo entre inicio y término reales, en formato compacto (ej. "1h 25m").
function formatDuracion(inicio, fin) {
  if (!inicio || !fin) return '—';
  const ms = new Date(fin).getTime() - new Date(inicio).getTime();
  if (!Number.isFinite(ms) || ms < 0) return '—';
  const min = Math.round(ms / 60000);
  const d = Math.floor(min / 1440);
  const h = Math.floor((min % 1440) / 60);
  const m = min % 60;
  const partes = [];
  if (d) partes.push(`${d}d`);
  if (h) partes.push(`${h}h`);
  if (m || partes.length === 0) partes.push(`${m}m`);
  return partes.join(' ');
}
import { esServicioEditable, ESTADOS_CORRECTIVO, esCorrectivoCerrado } from '../utils/estadoServicio.js';
import { actualizarFilaAsignacion, validarConsistenciaAsignaciones, tecnicosDisponiblesPara } from '../utils/asignaciones.js';

const ROLES_ASIG = ['Responsable principal', 'Apoyo técnico', 'Especialista', 'Supervisor técnico'];
const NIVELES = ['alta', 'media', 'baja'];
const ESTADOS_FILTRO_CORRECTIVO = ['', ...ESTADOS_CORRECTIVO];
const FORM_ID = 'form-correctivo';

const inicial = {
  id_cliente: '', id_ascensor: '', falla: '',
  nivel_urgencia: 'media',
  // Días de trabajo: lista de tramos { desde, hasta }. Un día suelto es un tramo
  // con desde === hasta; un rango, uno con hasta posterior. Se pueden combinar.
  tramos: [], hora_programada: '', fecha_estimada_entrega: '',
  precio_interno: '', sin_cobro: false,
  // Los correctivos se facturan por defecto (editable antes de guardar).
  requiere_factura: true, observaciones: ''
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

  // Cambia la marca con/sin factura del servicio en cualquier momento (hasta que
  // exista una factura emitida; el backend rechaza si ya la hay).
  const toggleRequiereFactura = async (c) => {
    if (!c.servicio) return;
    try {
      await serviciosService.setRequiereFactura(c.servicio.id, c.servicio.requiere_factura === 0);
      cargar();
    } catch (e) {
      toast.error(e.response?.data?.error || 'No se pudo cambiar la marca de facturación');
    }
  };

  useEffect(() => {
    Promise.all([clientesService.list(), ascensoresService.list(), tecnicosService.list()])
      .then(([c, a, t]) => { setClientes(c); setAscensores(a); setTecnicos(t); })
      .catch(() => {});
  }, []);

  const labelCampoCliente = 'Cliente';

  const ascensoresFiltrados = (form.id_cliente
    ? ascensores.filter(a => String(a.edificio?.cliente?.id) === String(form.id_cliente))
    : ascensores
  ).filter(esAscensorServiciable);

  const agregarTec = () => setAsignaciones(a => [...a, { id_tecnico: '', rol_asignacion: 'Apoyo técnico', responsable_principal: false, responsable_documentacion: false }]);
  const quitarTec = (idx) => setAsignaciones(a => a.filter((_, i) => i !== idx));
  const cambiarTec = (idx, key, val) => setAsignaciones(a => actualizarFilaAsignacion(a, idx, key, val));


  const abrirNuevo = () => {
    setEditando(null);
    // Quien no gestiona precios (Coordinador) solo registra correctivos
    // gratuitos: el alta arranca ya marcada y sin factura, coherente con lo que
    // impone el backend.
    setForm({
      ...inicial,
      tramos: [tramoDeUnDia(hoyISO())],
      sin_cobro: !puedeVerPrecio,
      requiere_factura: puedeVerPrecio ? inicial.requiere_factura : false
    });
    setAsignaciones([]);
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
      tramos: tramosDeServicio(c.servicio),
      hora_programada: c.servicio?.hora_programada || '',
      fecha_estimada_entrega: c.servicio?.fecha_estimada_entrega ? String(c.servicio.fecha_estimada_entrega).slice(0, 10) : '',
      precio_interno: c.servicio?.precio_interno != null ? String(c.servicio.precio_interno) : '',
      sin_cobro: c.servicio?.sin_cobro === 1,
      requiere_factura: c.servicio?.requiere_factura === 1,
      observaciones: c.observaciones || ''
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
    correctivosService.get(Number(editId))
      .then(c => { abrirEditar(c); limpiarParam(); })
      .catch(err => { toast.error(err.response?.data?.error || 'Correctivo no encontrado'); limpiarParam(); });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, puedeEditar]);

  const cerrarModal = () => {
    if (savingRef.current) return;
    setOpen(false);
    setEditando(null);
    setForm(inicial);
    setAsignaciones([]);
  };

  const guardar = async (e) => {
    if (e?.preventDefault) e.preventDefault();
    if (savingRef.current) return;
    if (!editando) {
      const consistencia = validarConsistenciaAsignaciones(asignaciones);
      if (!consistencia.ok) return toast.error(consistencia.error);
    }
    const errorProgramacion = errorDeTramos(form.tramos);
    if (errorProgramacion) return toast.error(errorProgramacion);
    // La fecha programada del servicio es siempre el PRIMER día de trabajo.
    const primerDia = fechasDesdeTramos(form.tramos)[0];
    savingRef.current = true;
    setSaving(true);
    try {
      if (editando) {
        const payload = {
          id_cliente: form.id_cliente,
          id_ascensor: form.id_ascensor,
          falla: form.falla,
          nivel_urgencia: form.nivel_urgencia,
          dias: payloadDias(form.tramos),
          fecha_programada: primerDia,
          hora_programada: form.hora_programada,
          fecha_estimada_entrega: form.fecha_estimada_entrega,
          observaciones: form.observaciones,
          sin_cobro: form.sin_cobro,
          requiere_factura: form.sin_cobro ? false : form.requiere_factura,
          precio_interno: form.sin_cobro ? 0 : form.precio_interno
        };
        await correctivosService.update(editando, payload);
        toast.success('Correctivo actualizado');
      } else {
        const { tramos, ...resto } = form;
        const payload = {
          ...resto,
          dias: payloadDias(tramos),
          fecha_programada: primerDia,
          precio_interno: form.sin_cobro ? 0 : form.precio_interno,
          requiere_factura: form.sin_cobro ? false : form.requiere_factura,
          tecnicos: asignaciones,
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
          <input className="input sm:col-span-2" placeholder="Buscar por edificio, cliente, ascensor, código o motivo…"
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
                  <th className="table-th">Motivo</th>
                  <th className="table-th">Fecha programada</th>
                  <th className="table-th">Fecha estimada término</th>
                  <th className="table-th">Estado</th>
                  <th className="table-th">Urgencia</th>
                  <th className="table-th">Servicio</th>
                  <th className="table-th">Ejecución</th>
                  <th className="table-th">Técnico</th>
                  <th className="table-th">Inicio</th>
                  <th className="table-th">Término</th>
                  <th className="table-th">Días</th>
                  <th className="table-th">Observaciones</th>
                  <th className="table-th text-right">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {data.map(c => {
                  const ej = c.ejecucion || {};
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
                    <td className="table-td text-xs" title={etiquetaProgramacion(c.servicio).detalle}>{etiquetaProgramacion(c.servicio).texto}</td>
                    <td className="table-td text-xs">{c.servicio?.fecha_estimada_entrega ? formatFecha(c.servicio.fecha_estimada_entrega) : '—'}</td>
                    <td className="table-td"><span className={`badge ${badgeEstado(c.estado_correctivo)}`}>{c.estado_correctivo}</span></td>
                    <td className="table-td"><span className={`badge ${badgeUrgencia(c.nivel_urgencia)}`}>{c.nivel_urgencia}</span></td>
                    <td className="table-td">
                      {c.servicio ? (
                        <div className="flex items-center gap-2">
                          <Link to={`/servicios/${c.servicio.id}`} className="font-mono text-xs text-brand-700">{c.servicio.codigo}</Link>
                          {/* Distintivo del correctivo gratuito: lo ven todos los
                              roles, no solo los financieros. */}
                          {c.servicio.sin_cobro === 1 && <span className="badge-amber text-[10px]" title="Correctivo sin costo para el cliente">Gratuito</span>}
                          {/* Un correctivo gratuito no se puede facturar: el
                              toggle se apaga (el backend también lo rechaza). */}
                          {puedeEditar && c.servicio.sin_cobro !== 1 ? (
                            <button type="button" onClick={() => toggleRequiereFactura(c)}
                              title="Clic para cambiar entre con / sin factura"
                              className={`text-[10px] cursor-pointer hover:ring-1 hover:ring-brand-300 ${c.servicio.requiere_factura === 0 ? 'badge-gray' : 'badge-blue'}`}>
                              {c.servicio.requiere_factura === 0 ? 'Sin factura' : 'Con factura'}
                            </button>
                          ) : c.servicio.sin_cobro === 1 ? (
                            <span className="badge-gray text-[10px]" title="No se factura: el correctivo es gratuito">Sin factura</span>
                          ) : (
                            c.servicio.requiere_factura === 0
                              ? <span className="badge-gray text-[10px]">Sin factura</span>
                              : <span className="badge-blue text-[10px]">Con factura</span>
                          )}
                        </div>
                      ) : '—'}
                    </td>
                    <td className="table-td"><span className={badgeEstado(ej.estado_ejecucion)}>{ej.estado_ejecucion || '—'}</span></td>
                    <td className="table-td text-xs">{(c.servicio?.asignaciones || []).map(a => a.tecnico?.nombre).filter(Boolean).join(', ') || '—'}</td>
                    <td className="table-td text-xs">{ej.fecha_inicio_real ? formatFechaHora(ej.fecha_inicio_real) : '—'}</td>
                    <td className="table-td text-xs">{ej.fecha_fin_real ? formatFechaHora(ej.fecha_fin_real) : '—'}</td>
                    <td className="table-td text-xs">{formatDuracion(ej.fecha_inicio_real, ej.fecha_fin_real)}</td>
                    <td className="table-td text-xs text-slate-600 max-w-[16rem]">
                      {c.observaciones || <span className="text-slate-400">—</span>}
                    </td>
                    <td className="table-td text-right whitespace-nowrap">
                      {c.servicio && (
                        <Link to={`/servicios/${c.servicio.id}`} className="text-brand-700 text-xs hover:underline">Ver detalle</Link>
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
                Editar aquí sincroniza también el servicio vinculado (cliente, ascensor, precio, prioridad y descripción). Los técnicos se gestionan desde el servicio.
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
              <label className="label">Motivo *</label>
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
            {/* Gratuito / sin costo. Para quien NO gestiona precios (Coordinador)
                queda marcado y bloqueado: solo puede registrar correctivos
                gratuitos, porque no maneja importes y no puede comprometer un
                cobro. El backend impone la misma regla, no basta con la UI. */}
            <div>
              <label className="label">Cobertura</label>
              <label className={`flex items-center gap-2 h-[42px] px-3 rounded-lg ring-1 ${puedeVerPrecio ? 'cursor-pointer' : 'cursor-not-allowed'} ${form.sin_cobro ? 'ring-ember-300 bg-ember-50' : 'ring-slate-200 bg-slate-50'}`}>
                <input type="checkbox" checked={form.sin_cobro} disabled={!puedeVerPrecio}
                  onChange={e => setForm(f => ({
                    ...f,
                    sin_cobro: e.target.checked,
                    precio_interno: e.target.checked ? '' : f.precio_interno,
                    // Gratuito ⇒ sin factura: no se factura lo que no se cobra.
                    requiere_factura: e.target.checked ? false : f.requiere_factura
                  }))} />
                <span className="text-sm text-slate-700">
                  {puedeVerPrecio ? 'Gratuito / sin costo (cliente con cobertura)' : 'Gratuito: no se le cobra al cliente'}
                </span>
              </label>
              {!puedeVerPrecio && (
                <p className="text-[11px] text-ember-700 mt-0.5">
                  Su rol registra correctivos siempre gratuitos. Se avisará a administración,
                  que podrá convertirlo en cobrable desde el servicio.
                </p>
              )}
            </div>
            {puedeVerPrecio && !form.sin_cobro && (
              <div>
                <label className="label">Precio interno (S/) *</label>
                <input type="number" step="0.01" className="input" required value={form.precio_interno}
                  onChange={e => setForm(f => ({ ...f, precio_interno: e.target.value }))} />
              </div>
            )}
            {/* Un correctivo gratuito no se factura: la opción se apaga y se
                bloquea en vez de ofrecer una combinación incoherente. */}
            <div>
              <label className="label">Facturación</label>
              <label className={`flex items-center gap-2 h-[42px] px-3 rounded-lg ring-1 ring-slate-200 ${form.sin_cobro ? 'bg-slate-100 cursor-not-allowed' : 'bg-slate-50 cursor-pointer'}`}>
                <input type="checkbox" checked={!form.sin_cobro && form.requiere_factura} disabled={form.sin_cobro}
                  onChange={e => setForm(f => ({ ...f, requiere_factura: e.target.checked }))} />
                <span className={`text-sm ${form.sin_cobro ? 'text-slate-400' : 'text-slate-700'}`}>
                  {form.sin_cobro ? 'Sin factura (es gratuito)' : 'Requiere factura'}
                </span>
              </label>
            </div>
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

      <ConfirmarEliminacion
        open={!!aEliminar}
        onClose={() => setAEliminar(null)}
        titulo="Eliminar correctivo"
        palabraClave={aEliminar?.servicio?.codigo || 'ELIMINAR'}
        descripcion={
          aEliminar?.servicio
            ? `Se dará de baja el correctivo y su servicio vinculado ${aEliminar.servicio.codigo}, incluyendo asignaciones, evidencias, cobro, eventos de calendario y recordatorios. Esta acción revierte todo el flujo.`
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
