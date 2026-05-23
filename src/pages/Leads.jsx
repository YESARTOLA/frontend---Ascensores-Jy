import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { leadsService, clientesService, ascensoresService, tiposServicioService } from '../services';
import PageHeader from '../components/common/PageHeader.jsx';
import Loader from '../components/common/Loader.jsx';
import Modal from '../components/common/Modal.jsx';
import EmptyState from '../components/common/EmptyState.jsx';
import Pagination, { usePaginatedList } from '../components/common/Pagination.jsx';
import { useToast } from '../components/common/Toast.jsx';
import { useAuth } from '../features/auth/AuthContext.jsx';
import { badgeEstado, hoyISO, formatFechaHora, sanearTelefono, formatTelefono } from '../utils/formatters.js';

const inicial = { nombre_contacto: '', telefono: '', canal: 'WhatsApp', id_tipo_servicio_solicitado: '', cliente_existente: false, id_cliente: '', observaciones: '' };
const inicialConvertir = { id_cliente: '', id_ascensor: '', id_tipo_servicio: '', fecha_programada: hoyISO(), hora_programada: '09:00', precio_interno: '', moneda: 'PEN', titulo: '', descripcion: '' };

export default function Leads() {
  const [clientes, setClientes] = useState([]);
  const [ascensores, setAscensores] = useState([]);
  const [tipos, setTipos] = useState([]);
  const [open, setOpen] = useState(false);
  const [openConv, setOpenConv] = useState(null);
  const [form, setForm] = useState(inicial);
  const [convForm, setConvForm] = useState(inicialConvertir);
  const toast = useToast();
  const navigate = useNavigate();
  const { esSuperAdmin, esAdmin, esCoordinador, puedeVerPrecio } = useAuth();
  const puedeCrear = esSuperAdmin || esAdmin || esCoordinador;
  const puedeConvertir = esSuperAdmin || esAdmin;
  const puedeCotizar = esSuperAdmin || esAdmin;

  const { data, loading, total, page, pageSize, totalPages, setPage, setPageSize, recargar } =
    usePaginatedList(leadsService.paginate, {}, { initialPageSize: 25 });
  const cargar = recargar;
  useEffect(() => {
    Promise.all([clientesService.list(), ascensoresService.list(), tiposServicioService.list()])
      .then(([c, a, t]) => { setClientes(c); setAscensores(a); setTipos(t); });
  }, []);

  const ascensoresF = convForm.id_cliente ? ascensores.filter(a => String(a.id_cliente) === String(convForm.id_cliente)) : ascensores;

  const guardar = async (e) => {
    e.preventDefault();
    try { await leadsService.create(form); toast.success('Lead creado'); setOpen(false); setForm(inicial); cargar(); }
    catch (err) { toast.error(err.response?.data?.error || 'Error'); }
  };

  const convertir = async () => {
    try {
      await leadsService.convertir(openConv.id, convForm);
      toast.success('Lead convertido a servicio'); setOpenConv(null); setConvForm(inicialConvertir); cargar();
    } catch (err) { toast.error(err.response?.data?.error || 'Error'); }
  };

  return (
    <>
      <PageHeader title="Leads" subtitle={`${data.length} lead(s)`} actions={puedeCrear && <button onClick={() => setOpen(true)} className="btn-primary">+ Nuevo lead</button>} />
      <div className="card">
        {loading ? <Loader /> : data.length === 0 ? <EmptyState title="Sin leads" /> : (
          <div className="overflow-x-auto scroll-thin">
            <table className="table-base">
              <thead><tr>
                <th className="table-th">Contacto</th><th className="table-th">Canal</th>
                <th className="table-th">Servicio solicitado</th><th className="table-th">Cliente</th>
                <th className="table-th">Estado</th><th className="table-th">Registrado</th>
                <th className="table-th">Registrado por</th><th className="table-th">Rol</th>
                <th className="table-th text-right">Acciones</th>
              </tr></thead>
              <tbody className="divide-y divide-slate-100">
                {data.map(l => (
                  <tr key={l.id} className="table-row-hover">
                    <td className="table-td"><div className="text-sm">{l.nombre_contacto}</div><div className="text-xs text-slate-500 font-mono">{formatTelefono(l.telefono)}</div></td>
                    <td className="table-td text-xs"><span className="badge-blue">{l.canal || '—'}</span></td>
                    <td className="table-td text-xs">{l.tipo_servicio?.nombre || '—'}</td>
                    <td className="table-td text-xs">{l.cliente?.nombre || '—'}</td>
                    <td className="table-td"><span className={badgeEstado(l.estado_lead)}>{l.estado_lead}</span></td>
                    <td className="table-td text-xs">{formatFechaHora(l.date_time_registration)}</td>
                    <td className="table-td text-xs">{l.usuario_registrador?.nombres || '—'}</td>
                    <td className="table-td text-xs">
                      {l.rol_nombre_registrador || l.rol_codigo_registrador
                        ? <span className="badge-violet">{l.rol_nombre_registrador || l.rol_codigo_registrador}</span>
                        : <span className="text-slate-400">—</span>}
                    </td>
                    <td className="table-td text-right">
                      <div className="flex flex-wrap gap-2 justify-end text-xs">
                        {puedeCotizar && !['ganado', 'convertido', 'perdido'].includes(l.estado_lead) && l.id_cliente && (
                          <button
                            onClick={() => navigate(`/cotizaciones?nuevo=1&id_lead=${l.id}&id_cliente=${l.id_cliente}${l.id_tipo_servicio_solicitado ? `&id_tipo_servicio=${l.id_tipo_servicio_solicitado}` : ''}`)}
                            className="text-brand-700 hover:underline">
                            Cotizar
                          </button>
                        )}
                        {puedeConvertir && l.estado_lead !== 'convertido' && l.estado_lead !== 'ganado' && (
                          <button onClick={() => { setOpenConv(l); setConvForm({ ...inicialConvertir, id_cliente: l.id_cliente || '', id_tipo_servicio: l.id_tipo_servicio_solicitado || '' }); }} className="text-emerald-700 hover:underline">Convertir directo</button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {!loading && data.length > 0 && (
          <Pagination page={page} pageSize={pageSize} total={total} totalPages={totalPages}
            onPage={setPage} onPageSize={setPageSize} />
        )}
      </div>

      <Modal open={open} onClose={() => setOpen(false)} title="Nuevo lead"
        footer={<><button className="btn-secondary" onClick={() => setOpen(false)}>Cancelar</button><button className="btn-primary" onClick={guardar}>Guardar</button></>}>
        <form onSubmit={guardar} className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="sm:col-span-2"><label className="label">Nombre del contacto *</label><input className="input" required value={form.nombre_contacto} onChange={e => setForm(f => ({ ...f, nombre_contacto: e.target.value }))} /></div>
          <div><label className="label">Teléfono *</label><input
            className="input" required
            type="tel" inputMode="numeric" autoComplete="tel"
            placeholder="9XX XXX XXX"
            pattern="9\d{2} \d{3} \d{3}"
            title="Celular peruano: 9 dígitos comenzando con 9"
            value={formatTelefono(form.telefono)}
            onChange={e => setForm(f => ({ ...f, telefono: sanearTelefono(e.target.value) }))}
          /></div>
          <div><label className="label">Canal</label><select className="select" value={form.canal} onChange={e => setForm(f => ({ ...f, canal: e.target.value }))}><option>WhatsApp</option><option>Llamada</option><option>Web</option><option>Email</option><option>Referido</option></select></div>
          <div><label className="label">Tipo de servicio solicitado</label><select className="select" value={form.id_tipo_servicio_solicitado} onChange={e => setForm(f => ({ ...f, id_tipo_servicio_solicitado: e.target.value }))}><option value="">—</option>{tipos.map(t => <option key={t.id} value={t.id}>{t.nombre}</option>)}</select></div>
          <div><label className="label">¿Cliente existente?</label><select className="select" value={form.cliente_existente ? '1' : '0'} onChange={e => setForm(f => ({ ...f, cliente_existente: e.target.value === '1' }))}><option value="0">No</option><option value="1">Sí</option></select></div>
          {form.cliente_existente && <div><label className="label">Cliente asociado</label><select className="select" value={form.id_cliente} onChange={e => setForm(f => ({ ...f, id_cliente: e.target.value }))}><option value="">—</option>{clientes.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}</select></div>}
          <div className="sm:col-span-2"><label className="label">Observaciones</label><textarea className="textarea" rows="2" value={form.observaciones} onChange={e => setForm(f => ({ ...f, observaciones: e.target.value }))} /></div>
        </form>
      </Modal>

      <Modal open={!!openConv} onClose={() => setOpenConv(null)} title={`Convertir lead: ${openConv?.nombre_contacto}`} size="lg"
        footer={<><button className="btn-secondary" onClick={() => setOpenConv(null)}>Cancelar</button><button className="btn-primary" onClick={convertir}>Convertir</button></>}>
        <form onSubmit={(e) => { e.preventDefault(); convertir(); }} className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="label">Cliente *</label>
            <select className="select" required value={convForm.id_cliente} onChange={e => setConvForm(f => ({ ...f, id_cliente: e.target.value, id_ascensor: '' }))}><option value="">—</option>{clientes.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}</select>
          </div>
          <div>
            <label className="label">Ascensor *</label>
            <select className="select" required value={convForm.id_ascensor} onChange={e => setConvForm(f => ({ ...f, id_ascensor: e.target.value }))}><option value="">—</option>{ascensoresF.map(a => <option key={a.id} value={a.id}>{a.codigo}</option>)}</select>
          </div>
          <div>
            <label className="label">Tipo de servicio *</label>
            <select className="select" required value={convForm.id_tipo_servicio} onChange={e => setConvForm(f => ({ ...f, id_tipo_servicio: e.target.value }))}><option value="">—</option>{tipos.map(t => <option key={t.id} value={t.id}>{t.nombre}</option>)}</select>
          </div>
          <div><label className="label">Fecha programada *</label><input type="date" required className="input" value={convForm.fecha_programada} onChange={e => setConvForm(f => ({ ...f, fecha_programada: e.target.value }))} /></div>
          <div><label className="label">Hora</label><input type="time" className="input" value={convForm.hora_programada} onChange={e => setConvForm(f => ({ ...f, hora_programada: e.target.value }))} /></div>
          {puedeVerPrecio && <div><label className="label">Precio (S/) *</label><input type="number" step="0.01" required className="input" value={convForm.precio_interno} onChange={e => setConvForm(f => ({ ...f, precio_interno: e.target.value }))} /></div>}
          <div className="sm:col-span-2"><label className="label">Título</label><input className="input" value={convForm.titulo} onChange={e => setConvForm(f => ({ ...f, titulo: e.target.value }))} /></div>
          <div className="sm:col-span-2"><label className="label">Descripción</label><textarea className="textarea" rows="2" value={convForm.descripcion} onChange={e => setConvForm(f => ({ ...f, descripcion: e.target.value }))} /></div>
        </form>
      </Modal>
    </>
  );
}
