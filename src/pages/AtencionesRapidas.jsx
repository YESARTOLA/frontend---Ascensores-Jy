import { useEffect, useRef, useState } from 'react';
import { atencionesRapidasService, clientesService, ascensoresService, tiposServicioService } from '../services';
import PageHeader from '../components/common/PageHeader.jsx';
import Loader from '../components/common/Loader.jsx';
import Modal from '../components/common/Modal.jsx';
import EmptyState from '../components/common/EmptyState.jsx';
import Pagination, { usePaginatedList } from '../components/common/Pagination.jsx';
import { useToast } from '../components/common/Toast.jsx';
import { useAuth } from '../features/auth/AuthContext.jsx';
import ClienteAutocomplete from '../components/common/ClienteAutocomplete.jsx';
import { badgeEstado, formatFechaHora, hoyISO, sanearTelefono, formatTelefono, labelNombreEdificio } from '../utils/formatters.js';
import { esAtencionRapidaConvertida } from '../utils/estadoServicio.js';

const FORM_ID = 'form-atencion-rapida';
const inicial = { nombre_contacto: '', telefono: '', mensaje_rapido: '', tipo_solicitud: '', nivel_urgencia: 'media' };
const inicialConv = { id_cliente: '', id_ascensor: '', id_tipo_servicio: '', tipo_conversion: 'servicio', fecha_programada: hoyISO(), hora_programada: '09:00', precio_interno: '', moneda: 'PEN' };

export default function AtencionesRapidas() {
  const [clientes, setClientes] = useState([]);
  const [tiposCliente, setTiposCliente] = useState([]);
  const [ascensores, setAscensores] = useState([]);
  const [tipos, setTipos] = useState([]);
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

  const { data, loading, total, page, pageSize, totalPages, setPage, setPageSize, recargar } =
    usePaginatedList(atencionesRapidasService.paginate, {}, { initialPageSize: 25 });

  useEffect(() => {
    Promise.all([clientesService.list(), ascensoresService.list(), tiposServicioService.list()])
      .then(([c, a, t]) => { setClientes(c); setAscensores(a); setTipos(t); });
    clientesService.tipos().then(setTiposCliente).catch(() => setTiposCliente([]));
  }, []);
  const ascensoresF = convForm.id_cliente ? ascensores.filter(a => String(a.id_cliente) === String(convForm.id_cliente)) : ascensores;
  const labelCampoCliente = labelNombreEdificio(
    clientes.find(c => String(c.id) === String(convForm.id_cliente)),
    tiposCliente
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
    try { await atencionesRapidasService.convertir(openConv.id, convForm); toast.success('Convertido'); setOpenConv(null); setConvForm(inicialConv); recargar(); }
    catch (err) { toast.error(err.response?.data?.error || 'Error'); }
  };

  return (
    <>
      <PageHeader title="Atención rápida" subtitle={`${data.length} atención(es)`} actions={puedeCrear && <button onClick={abrirNuevo} className="btn-primary">+ Nueva atención</button>} />
      <div className="card">
        {loading ? <Loader /> : data.length === 0 ? <EmptyState title="Sin atenciones rápidas" /> : (
          <div className="overflow-x-auto scroll-thin">
            <table className="table-base">
              <thead><tr>
                <th className="table-th">Contacto</th><th className="table-th">Mensaje</th>
                <th className="table-th">Tipo</th><th className="table-th">Urgencia</th>
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
                    <td className="table-td"><span className={a.nivel_urgencia === 'alta' ? 'badge-red' : a.nivel_urgencia === 'media' ? 'badge-amber' : 'badge-gray'}>{a.nivel_urgencia}</span></td>
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
          <div><label className="label">Urgencia</label><select className="select" value={form.nivel_urgencia} onChange={e => setForm(f => ({ ...f, nivel_urgencia: e.target.value }))}><option>alta</option><option>media</option><option>baja</option></select></div>
        </form>
      </Modal>

      <Modal open={!!openConv} onClose={() => setOpenConv(null)} title={`Convertir: ${openConv?.nombre_contacto}`} size="lg"
        footer={<><button className="btn-secondary" onClick={() => setOpenConv(null)}>Cancelar</button><button className="btn-primary" onClick={convertir}>Convertir</button></>}>
        <form onSubmit={(e) => { e.preventDefault(); convertir(); }} className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div><label className="label">Tipo de conversión</label><select className="select" value={convForm.tipo_conversion} onChange={e => setConvForm(f => ({ ...f, tipo_conversion: e.target.value }))}><option value="servicio">Servicio</option><option value="emergencia">Emergencia</option></select></div>
          <div><label className="label">Tipo de servicio *</label><select className="select" required value={convForm.id_tipo_servicio} onChange={e => setConvForm(f => ({ ...f, id_tipo_servicio: e.target.value }))}><option value="">—</option>{tipos.map(t => <option key={t.id} value={t.id}>{t.nombre}</option>)}</select></div>
          <div>
            <label className="label">{labelCampoCliente} *</label>
            <ClienteAutocomplete
              clientes={clientes}
              value={convForm.id_cliente}
              onChange={(id) => setConvForm(f => ({ ...f, id_cliente: id, id_ascensor: '' }))}
              usarNombreEdificio
              required
              placeholder="Escriba para buscar por nombre de edificio / obra…"
            />
          </div>
          <div><label className="label">Ascensor *</label><select className="select" required value={convForm.id_ascensor} onChange={e => setConvForm(f => ({ ...f, id_ascensor: e.target.value }))}><option value="">—</option>{ascensoresF.map(a => <option key={a.id} value={a.id}>{a.codigo}</option>)}</select></div>
          <div><label className="label">Fecha</label><input type="date" className="input" value={convForm.fecha_programada} onChange={e => setConvForm(f => ({ ...f, fecha_programada: e.target.value }))} /></div>
          <div><label className="label">Hora</label><input type="time" className="input" value={convForm.hora_programada} onChange={e => setConvForm(f => ({ ...f, hora_programada: e.target.value }))} /></div>
          {puedeVerPrecio && <div className="sm:col-span-2"><label className="label">Precio (S/) *</label><input type="number" step="0.01" required className="input" value={convForm.precio_interno} onChange={e => setConvForm(f => ({ ...f, precio_interno: e.target.value }))} /></div>}
        </form>
      </Modal>
    </>
  );
}
