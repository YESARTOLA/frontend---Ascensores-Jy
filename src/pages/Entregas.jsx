import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { entregasService, serviciosService } from '../services';
import PageHeader from '../components/common/PageHeader.jsx';
import Loader from '../components/common/Loader.jsx';
import Modal from '../components/common/Modal.jsx';
import EmptyState from '../components/common/EmptyState.jsx';
import Pagination, { usePaginatedList } from '../components/common/Pagination.jsx';
import { useToast } from '../components/common/Toast.jsx';
import CampoDocumentosEntrega, {
  ArchivosEntrega, documentosFormDeEntrega, payloadDocumentosEntrega
} from '../components/entregas/DocumentosEntrega.jsx';
import useCargaArchivos from '../hooks/useCargaArchivos.js';
import { useAuth } from '../features/auth/AuthContext.jsx';
import { badgeEstado, formatFecha, formatFechaHora, hoyISO, toYMDLima } from '../utils/formatters.js';
import { estaServicioFinalizado } from '../utils/estadoServicio.js';

const TIPOS = ['Entrega parcial', 'Entrega final', 'Entrega documental', 'Entrega técnica'];
const ESTADOS = ['Pendiente', 'Entregada', 'Observada', 'Aprobada'];
const inicial = () => ({ id_servicio: '', tipo_entrega: 'Entrega final', fecha_entrega: hoyISO(), descripcion: '', documentos: [], estado_entrega: 'Entregada' });

export default function Entregas() {
  const [servicios, setServicios] = useState([]);
  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState(null);
  const [form, setForm] = useState(inicial);
  const [filtros, setFiltros] = useState({ tipo_entrega: '', estado_entrega: '', id_servicio: '' });
  const toast = useToast();
  const carga = useCargaArchivos();
  const { esSuperAdmin, esAdmin } = useAuth();
  const puedeCrear = esSuperAdmin || esAdmin;

  const { data, loading, total, page, pageSize, totalPages, setPage, setPageSize, recargar } =
    usePaginatedList(entregasService.paginate, filtros, { initialPageSize: 25 });
  const cargar = recargar;
  const filtrados = data;

  useEffect(() => {
    serviciosService.list().then(setServicios).catch(() => setServicios([]));
  }, []);

  const abrirNueva = () => { setForm(inicial()); setEditId(null); setOpen(true); };
  const abrirEditar = (e) => {
    setForm({
      id_servicio: e.id_servicio,
      tipo_entrega: e.tipo_entrega,
      fecha_entrega: e.fecha_entrega ? toYMDLima(e.fecha_entrega) : hoyISO(),
      descripcion: e.descripcion || '',
      documentos: documentosFormDeEntrega(e),
      estado_entrega: e.estado_entrega
    });
    setEditId(e.id);
    setOpen(true);
  };

  // Los documentos se suben en lote al elegirlos (CampoDocumentosEntrega) y al
  // guardar solo viajan sus ids.
  const setDocumentos = (actualizar) => setForm(f => ({ ...f, documentos: actualizar(f.documentos) }));

  const serviciosActivos = servicios.filter(s => !estaServicioFinalizado(s.estado_servicio));

  const guardar = async () => {
    if (!form.id_servicio || !form.tipo_entrega || !form.fecha_entrega) return toast.error('Servicio, tipo y fecha son obligatorios');
    if (!editId) {
      const srv = servicios.find(s => String(s.id) === String(form.id_servicio));
      if (srv && estaServicioFinalizado(srv.estado_servicio)) {
        return toast.error(`El servicio está ${srv.estado_servicio}: no se puede registrar entregas`);
      }
    }
    if (carga.subiendo) return toast.error('Espere a que terminen de subir los documentos');
    const { documentos, ...datos } = form;
    const payload = { ...datos, ...payloadDocumentosEntrega(documentos) };
    try {
      if (editId) await entregasService.update(editId, payload);
      else await entregasService.create(payload);
      toast.success('Entrega guardada'); setOpen(false); cargar();
    } catch (err) { toast.error(err.response?.data?.error || 'Error'); }
  };

  return (
    <>
      <PageHeader title="Entregas" subtitle={`${total.toLocaleString('es-PE')} entrega(s)`} actions={puedeCrear && <button onClick={abrirNueva} className="btn-primary">+ Nueva entrega</button>} />

      <div className="card mb-4">
        <div className="p-4 grid grid-cols-1 sm:grid-cols-4 gap-3">
          <div>
            <label className="label">Servicio</label>
            <select className="select" value={filtros.id_servicio} onChange={e => setFiltros(f => ({ ...f, id_servicio: e.target.value }))}>
              <option value="">Todos</option>
              {servicios.map(s => <option key={s.id} value={s.id}>{s.codigo}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Tipo</label>
            <select className="select" value={filtros.tipo_entrega} onChange={e => setFiltros(f => ({ ...f, tipo_entrega: e.target.value }))}>
              <option value="">Todos</option>
              {TIPOS.map(t => <option key={t}>{t}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Estado</label>
            <select className="select" value={filtros.estado_entrega} onChange={e => setFiltros(f => ({ ...f, estado_entrega: e.target.value }))}>
              <option value="">Todos</option>
              {ESTADOS.map(s => <option key={s}>{s}</option>)}
            </select>
          </div>
          <div className="flex items-end"><button onClick={() => setFiltros({ tipo_entrega: '', estado_entrega: '', id_servicio: '' })} className="btn-secondary w-full">Limpiar</button></div>
        </div>
      </div>

      <div className="card">
        {loading ? <Loader /> : filtrados.length === 0 ? <EmptyState title="Sin entregas" /> : (
          <div className="overflow-x-auto scroll-thin">
            <table className="table-base">
              <thead><tr>
                <th className="table-th">Fecha</th><th className="table-th">Servicio</th>
                <th className="table-th">Cliente</th><th className="table-th">Tipo</th>
                <th className="table-th">Descripción</th><th className="table-th">Estado</th>
                <th className="table-th">Documentos</th><th className="table-th">Registro</th>
                <th className="table-th text-right">Acciones</th>
              </tr></thead>
              <tbody className="divide-y divide-slate-100">
                {filtrados.map(e => (
                  <tr key={e.id} className="table-row-hover">
                    <td className="table-td text-xs">{formatFecha(e.fecha_entrega)}</td>
                    <td className="table-td"><Link to={`/servicios/${e.id_servicio}`} className="font-mono text-xs text-brand-700 hover:underline">{e.servicio?.codigo}</Link></td>
                    <td className="table-td text-xs">{e.servicio?.cliente?.nombre}</td>
                    <td className="table-td text-xs"><span className="badge-blue">{e.tipo_entrega}</span></td>
                    <td className="table-td text-xs max-w-xs truncate">{e.descripcion || '—'}</td>
                    <td className="table-td"><span className={badgeEstado(e.estado_entrega)}>{e.estado_entrega}</span></td>
                    <td className="table-td"><ArchivosEntrega entrega={e} /></td>
                    <td className="table-td text-xs text-slate-500">{formatFechaHora(e.date_time_registration)}</td>
                    <td className="table-td text-right">
                      {puedeCrear && <button onClick={() => abrirEditar(e)} className="text-brand-700 text-xs hover:underline">Editar</button>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {!loading && filtrados.length > 0 && (
          <Pagination page={page} pageSize={pageSize} total={total} totalPages={totalPages}
            onPage={setPage} onPageSize={setPageSize} />
        )}
      </div>

      <Modal open={open} onClose={() => !carga.subiendo && setOpen(false)} title={editId ? 'Editar entrega' : 'Nueva entrega'} size="lg"
        footer={<><button className="btn-secondary" onClick={() => setOpen(false)} disabled={carga.subiendo}>Cancelar</button><button className="btn-primary" onClick={guardar} disabled={carga.subiendo}>Guardar</button></>}>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="label">Servicio *</label>
            <select className="select" required value={form.id_servicio} onChange={e => setForm(f => ({ ...f, id_servicio: e.target.value }))} disabled={!!editId}>
              <option value="">— Seleccione —</option>
              {(editId ? servicios : serviciosActivos).map(s => <option key={s.id} value={s.id}>{s.codigo} · {s.titulo}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Tipo *</label>
            <select className="select" value={form.tipo_entrega} onChange={e => setForm(f => ({ ...f, tipo_entrega: e.target.value }))}>
              {TIPOS.map(t => <option key={t}>{t}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Fecha *</label>
            <input type="date" className="input" value={form.fecha_entrega} onChange={e => setForm(f => ({ ...f, fecha_entrega: e.target.value }))} />
          </div>
          <div>
            <label className="label">Estado</label>
            <select className="select" value={form.estado_entrega} onChange={e => setForm(f => ({ ...f, estado_entrega: e.target.value }))}>
              {ESTADOS.map(s => <option key={s}>{s}</option>)}
            </select>
          </div>
          <div className="sm:col-span-2">
            <label className="label">Descripción</label>
            <textarea className="textarea" rows="3" value={form.descripcion} onChange={e => setForm(f => ({ ...f, descripcion: e.target.value }))} />
          </div>
          <div className="sm:col-span-2">
            <label className="label">Documentos</label>
            <CampoDocumentosEntrega documentos={form.documentos} setDocumentos={setDocumentos} carga={carga} />
          </div>
        </div>
      </Modal>
    </>
  );
}
