import { useEffect, useMemo, useRef, useState } from 'react';
import { atencionesRapidasService, clientesService, ascensoresService, tiposServicioService, usuariosService } from '../services';
import PageHeader from '../components/common/PageHeader.jsx';
import Loader from '../components/common/Loader.jsx';
import Modal from '../components/common/Modal.jsx';
import EmptyState from '../components/common/EmptyState.jsx';
import Pagination, { usePaginatedList } from '../components/common/Pagination.jsx';
import { useToast } from '../components/common/Toast.jsx';
import { useAuth } from '../features/auth/AuthContext.jsx';
import ClienteAutocomplete from '../components/common/ClienteAutocomplete.jsx';
import { badgeEstado, formatFechaHora, hoyISO, sanearTelefono, formatTelefono } from '../utils/formatters.js';
import { esAtencionRapidaConvertida, ESTADOS_ATENCION_RAPIDA } from '../utils/estadoServicio.js';
import { esAscensorServiciable } from '../utils/ascensoresSeleccion.js';
import ProgramacionDias from '../components/common/ProgramacionDias.jsx';
import { tramoDeUnDia, fechasDesdeTramos, payloadDias, errorDeTramos } from '../utils/programacion.js';

const FORM_ID = 'form-atencion-rapida';
// SSoT de niveles de urgencia del módulo: alimenta tanto el filtro como el
// <select> del formulario. "seguimiento" es un estado de baja prioridad para
// casos que solo requieren acompañamiento, no atención inmediata.
const NIVELES_URGENCIA = ['alta', 'media', 'baja', 'seguimiento'];
const badgeUrgencia = (n) =>
  n === 'alta' ? 'badge-red' : n === 'media' ? 'badge-amber' : n === 'seguimiento' ? 'badge-blue' : 'badge-gray';
const inicial = { nombre_contacto: '', telefono: '', mensaje_rapido: '', tipo_solicitud: '', id_responsable_usuario: '', nivel_urgencia: 'media' };
// `tramos` = días de trabajo del servicio que se genera al convertir: rangos
// { desde, hasta } y/o días sueltos (desde === hasta), combinables.
const inicialConv = { id_cliente: '', id_ascensor: '', id_tipo_servicio: '', id_subtipo_servicio: '', tramos: [tramoDeUnDia(hoyISO())], hora_programada: '09:00', precio_interno: '', moneda: 'PEN' };

export default function AtencionesRapidas() {
  const [clientes, setClientes] = useState([]);
  const [ascensores, setAscensores] = useState([]);
  const [tipos, setTipos] = useState([]);
  const [usuarios, setUsuarios] = useState([]);
  const [open, setOpen] = useState(false);
  const [editando, setEditando] = useState(null);
  const [openConv, setOpenConv] = useState(null);
  const [form, setForm] = useState(inicial);
  const [convForm, setConvForm] = useState(inicialConv);
  const [guardando, setGuardando] = useState(false);
  const guardandoRef = useRef(false);
  const toast = useToast();
  const { esSuperAdmin, esAdmin, esCoordinador, puedeVerPrecio } = useAuth();
  const puedeCrear = esSuperAdmin || esAdmin || esCoordinador;
  const puedeEditar = esSuperAdmin || esAdmin || esCoordinador;

  const [filtros, setFiltros] = useState({ q: '', estado_atencion: '', nivel_urgencia: '', id_responsable_usuario: '' });
  const { data, loading, total, page, pageSize, totalPages, setPage, setPageSize, recargar } =
    usePaginatedList(atencionesRapidasService.paginate, filtros, { initialPageSize: 25 });

  useEffect(() => {
    // Cada catálogo se aplica por separado: si uno falla, los demás selectores
    // siguen poblados en vez de quedar todos vacíos. Los usuarios se piden al
    // catálogo (/usuarios/catalogo) y no a /usuarios, que es solo super_admin y
    // dejaba el selector de Responsable sin opciones para admin y coordinador.
    const aplicar = (setter) => (r) => { if (r.status === 'fulfilled') setter(Array.isArray(r.value) ? r.value : []); };
    Promise.allSettled([
      clientesService.list(), ascensoresService.list(), tiposServicioService.list(), usuariosService.catalogo()
    ]).then(([c, a, t, u]) => {
      aplicar(setClientes)(c); aplicar(setAscensores)(a); aplicar(setTipos)(t); aplicar(setUsuarios)(u);
    });
  }, []);
  // Responsable ya asignado que no está en el catálogo (usuario dado de baja).
  const responsableFueraDelCatalogo = !!form.id_responsable_usuario
    && !usuarios.some(u => String(u.id) === String(form.id_responsable_usuario));
  const ascensoresF = (convForm.id_cliente ? ascensores.filter(a => String(a.edificio?.cliente?.id) === String(convForm.id_cliente)) : ascensores).filter(esAscensorServiciable);
  const labelCampoCliente = 'Cliente';
  // Jerarquía padre → subtipo para la conversión (el subtipo define el módulo destino).
  const padresConv = useMemo(() => tipos.filter(t => t.es_padre), [tipos]);
  const subtiposConv = useMemo(
    () => tipos.filter(t => !t.es_padre && String(t.id_padre) === String(convForm.id_tipo_servicio)),
    [tipos, convForm.id_tipo_servicio]
  );

  const abrirNuevo = () => {
    setEditando(null);
    setForm(inicial);
    setOpen(true);
  };

  const abrirEditar = (a) => {
    if (esAtencionRapidaConvertida(a.estado_atencion)) {
      toast.error('La atención ya fue convertida en servicio y no se puede editar.');
      return;
    }
    setEditando(a.id);
    setForm({
      nombre_contacto: a.nombre_contacto || '',
      telefono: a.telefono || '',
      mensaje_rapido: a.mensaje_rapido || '',
      tipo_solicitud: a.tipo_solicitud || '',
      id_responsable_usuario: a.id_responsable_usuario ? String(a.id_responsable_usuario) : '',
      nivel_urgencia: a.nivel_urgencia || 'media'
    });
    setOpen(true);
  };

  const cerrarModal = () => {
    if (guardandoRef.current) return;
    setOpen(false);
    setEditando(null);
    setForm(inicial);
  };

  const guardar = async (e) => {
    e.preventDefault();
    if (guardandoRef.current) return;
    guardandoRef.current = true;
    setGuardando(true);
    try {
      if (editando) {
        await atencionesRapidasService.update(editando, form);
        toast.success('Atención actualizada');
      } else {
        await atencionesRapidasService.create(form);
        toast.success('Atención registrada');
      }
      cerrarModal();
      recargar();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Error');
    } finally {
      setGuardando(false);
      guardandoRef.current = false;
    }
  };

  const convertir = async () => {
    const errorProgramacion = errorDeTramos(convForm.tramos);
    if (errorProgramacion) return toast.error(errorProgramacion);
    const { tramos, ...resto } = convForm;
    // La fecha programada del servicio es siempre el PRIMER día de trabajo.
    const payload = { ...resto, dias: payloadDias(tramos), fecha_programada: fechasDesdeTramos(tramos)[0] };
    try { await atencionesRapidasService.convertir(openConv.id, payload); toast.success('Convertido'); setOpenConv(null); setConvForm(inicialConv); recargar(); }
    catch (err) { toast.error(err.response?.data?.error || 'Error'); }
  };

  return (
    <>
      <PageHeader title="Atención rápida" subtitle={`${total} atención(es)`} actions={puedeCrear && <button onClick={abrirNuevo} className="btn-primary">+ Nueva atención</button>} />
      <div className="card mb-4">
        <div className="p-4 grid grid-cols-1 sm:grid-cols-5 gap-2">
          <input className="input sm:col-span-2" placeholder="Buscar por contacto, teléfono, responsable, cliente, edificio o mensaje…"
            value={filtros.q} onChange={e => setFiltros(f => ({ ...f, q: e.target.value }))} />
          <select className="select" value={filtros.estado_atencion}
            onChange={e => setFiltros(f => ({ ...f, estado_atencion: e.target.value }))}>
            <option value="">Todos los estados</option>
            {ESTADOS_ATENCION_RAPIDA.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
          <select className="select" value={filtros.nivel_urgencia}
            onChange={e => setFiltros(f => ({ ...f, nivel_urgencia: e.target.value }))}>
            <option value="">Todas las urgencias</option>
            {NIVELES_URGENCIA.map(n => <option key={n} value={n}>{n}</option>)}
          </select>
          <select className="select" value={filtros.id_responsable_usuario}
            onChange={e => setFiltros(f => ({ ...f, id_responsable_usuario: e.target.value }))}>
            <option value="">Todos los responsables</option>
            {usuarios.map(u => <option key={u.id} value={u.id}>{u.nombres}</option>)}
          </select>
        </div>
      </div>
      <div className="card">
        {loading ? <Loader /> : data.length === 0 ? <EmptyState title="Sin atenciones rápidas" /> : (
          <div className="overflow-x-auto scroll-thin">
            <table className="table-base">
              <thead><tr>
                <th className="table-th">Contacto</th><th className="table-th">Mensaje</th>
                <th className="table-th">Tipo</th><th className="table-th">Responsable</th><th className="table-th">Urgencia</th>
                <th className="table-th">Estado</th><th className="table-th">Registrada</th>
                <th className="table-th text-right">Acciones</th>
              </tr></thead>
              <tbody className="divide-y divide-slate-100">
                {data.map(a => {
                  const editable = puedeEditar && !esAtencionRapidaConvertida(a.estado_atencion);
                  return (
                  <tr key={a.id} className="table-row-hover">
                    <td className="table-td"><div className="text-sm">{a.nombre_contacto}</div><div className="text-xs font-mono text-slate-500">{formatTelefono(a.telefono)}</div></td>
                    <td className="table-td text-xs max-w-xs truncate">{a.mensaje_rapido}</td>
                    <td className="table-td text-xs">{a.tipo_solicitud || '—'}</td>
                    <td className="table-td text-xs">{a.responsable_usuario?.nombres || a.responsable || '—'}</td>
                    <td className="table-td"><span className={badgeUrgencia(a.nivel_urgencia)}>{a.nivel_urgencia}</span></td>
                    <td className="table-td"><span className={badgeEstado(a.estado_atencion)}>{a.estado_atencion}</span></td>
                    <td className="table-td text-xs">{formatFechaHora(a.date_time_registration)}</td>
                    <td className="table-td text-right whitespace-nowrap">
                      {editable && (
                        <>
                          <button type="button" onClick={() => abrirEditar(a)} className="text-brand-700 text-xs hover:underline">Editar</button>
                          <span className="text-slate-300 mx-1.5">·</span>
                          <button type="button" onClick={() => { setOpenConv(a); setConvForm({ ...inicialConv, id_cliente: a.id_cliente || '', id_ascensor: a.id_ascensor || '' }); }} className="text-emerald-700 text-xs hover:underline">Convertir</button>
                        </>
                      )}
                      {!editable && <span className="text-slate-400 text-xs">—</span>}
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

      <Modal open={open} onClose={cerrarModal} title={editando ? 'Editar atención rápida' : 'Nueva atención rápida'}
        footer={<>
          <button type="button" className="btn-secondary" onClick={cerrarModal} disabled={guardando}>Cancelar</button>
          <button type="submit" form={FORM_ID} className="btn-primary" disabled={guardando}>
            {guardando ? 'Guardando…' : (editando ? 'Guardar cambios' : 'Guardar')}
          </button>
        </>}>
        <form id={FORM_ID} onSubmit={guardar} className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div><label className="label">Contacto *</label><input className="input" required value={form.nombre_contacto} onChange={e => setForm(f => ({ ...f, nombre_contacto: e.target.value }))} /></div>
          <div><label className="label">Teléfono *</label><input
            className="input" required
            type="tel" inputMode="numeric" autoComplete="tel"
            placeholder="9XX XXX XXX"
            pattern="9\d{2} \d{3} \d{3}"
            title="Celular peruano: 9 dígitos comenzando con 9"
            value={formatTelefono(form.telefono)}
            onChange={e => setForm(f => ({ ...f, telefono: sanearTelefono(e.target.value) }))}
          /></div>
          <div className="sm:col-span-2"><label className="label">Mensaje rápido</label><textarea className="textarea" rows="2" value={form.mensaje_rapido} onChange={e => setForm(f => ({ ...f, mensaje_rapido: e.target.value }))} /></div>
          <div><label className="label">Tipo de solicitud</label><input className="input" value={form.tipo_solicitud} onChange={e => setForm(f => ({ ...f, tipo_solicitud: e.target.value }))} /></div>
          <div>
            <label className="label">Responsable</label>
            <select className="select" value={form.id_responsable_usuario}
              onChange={e => setForm(f => ({ ...f, id_responsable_usuario: e.target.value }))}>
              <option value="">— Sin asignar —</option>
              {usuarios.map(u => <option key={u.id} value={u.id}>{u.nombres}{u.rol?.nombre ? ` · ${u.rol.nombre}` : ''}</option>)}
              {/* El catálogo solo trae usuarios activos: si la atención ya tenía
                  asignado uno dado de baja, se conserva para no borrarlo al editar. */}
              {responsableFueraDelCatalogo && (
                <option value={form.id_responsable_usuario}>Usuario #{form.id_responsable_usuario} (inactivo)</option>
              )}
            </select>
          </div>
          <div><label className="label">Urgencia</label><select className="select" value={form.nivel_urgencia} onChange={e => setForm(f => ({ ...f, nivel_urgencia: e.target.value }))}>{NIVELES_URGENCIA.map(n => <option key={n} value={n}>{n}</option>)}</select></div>
        </form>
      </Modal>

      <Modal open={!!openConv} onClose={() => setOpenConv(null)} title={`Convertir: ${openConv?.nombre_contacto}`} size="lg"
        footer={<><button className="btn-secondary" onClick={() => setOpenConv(null)}>Cancelar</button><button className="btn-primary" onClick={convertir}>Convertir</button></>}>
        <form onSubmit={(e) => { e.preventDefault(); convertir(); }} className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div><label className="label">Tipo de servicio (padre) *</label><select className="select" required value={convForm.id_tipo_servicio} onChange={e => setConvForm(f => ({ ...f, id_tipo_servicio: e.target.value, id_subtipo_servicio: '' }))}><option value="">—</option>{padresConv.map(t => <option key={t.id} value={t.id}>{t.nombre}</option>)}</select></div>
          <div><label className="label">Subtipo *</label><select className="select" required value={convForm.id_subtipo_servicio} disabled={!convForm.id_tipo_servicio} onChange={e => setConvForm(f => ({ ...f, id_subtipo_servicio: e.target.value }))}><option value="">{convForm.id_tipo_servicio ? '—' : 'Elige el padre'}</option>{subtiposConv.map(t => <option key={t.id} value={t.id}>{t.nombre}</option>)}</select></div>
          <div>
            <label className="label">{labelCampoCliente} *</label>
            <ClienteAutocomplete
              clientes={clientes}
              value={convForm.id_cliente}
              onChange={(id) => setConvForm(f => ({ ...f, id_cliente: id, id_ascensor: '' }))}
              required
              placeholder="Escriba para buscar por nombre de edificio / obra…"
            />
          </div>
          <div><label className="label">Ascensor *</label><select className="select" required value={convForm.id_ascensor} onChange={e => setConvForm(f => ({ ...f, id_ascensor: e.target.value }))}><option value="">—</option>{ascensoresF.map(a => <option key={a.id} value={a.id}>{a.codigo}</option>)}</select></div>
          <div className="sm:col-span-2">
            <ProgramacionDias tramos={convForm.tramos} onChange={tramos => setConvForm(f => ({ ...f, tramos }))} />
          </div>
          <div><label className="label">Hora</label><input type="time" className="input" value={convForm.hora_programada} onChange={e => setConvForm(f => ({ ...f, hora_programada: e.target.value }))} /></div>
          {puedeVerPrecio && <div className="sm:col-span-2"><label className="label">Precio (S/) *</label><input type="number" step="0.01" required className="input" value={convForm.precio_interno} onChange={e => setConvForm(f => ({ ...f, precio_interno: e.target.value }))} /></div>}
        </form>
      </Modal>
    </>
  );
}
