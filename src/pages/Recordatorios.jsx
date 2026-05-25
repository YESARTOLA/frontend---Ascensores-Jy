import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { recordatoriosService, clientesService } from '../services';
import PageHeader from '../components/common/PageHeader.jsx';
import Loader from '../components/common/Loader.jsx';
import EmptyState from '../components/common/EmptyState.jsx';
import Modal from '../components/common/Modal.jsx';
import Pagination, { usePaginatedList } from '../components/common/Pagination.jsx';
import { useToast } from '../components/common/Toast.jsx';
import { formatFechaHora, nowDateTimeLocalLima, isoToDateTimeLocalLima, dateTimeLocalLimaToISO } from '../utils/formatters.js';
import { CATALOGO_TIPOS_EVENTO, colorPorTipo } from '../utils/visibilidadCalendario.js';

// Tipos disponibles para crear/etiquetar recordatorios. Se deriva del catálogo
// central (espejado con backend) para que cualquier `tipo` nuevo en BD se
// pinte automáticamente sin hardcodear listas aquí.
//   - 'manual' lo agregamos al frente porque es un tipo creado por usuarios
//     (no aparece en CATALOGO_TIPOS_EVENTO porque no es un evento de calendario).
//   - Para el resto se toman los de dominio 'operativo' (servicio, mantenimiento,
//     emergencia, etc.) y 'recordatorio' (cobro, observacion, alertas, etc.).
const TIPOS = [
  { value: 'manual', label: 'Manual', color: '#8b5cf6' },
  ...CATALOGO_TIPOS_EVENTO.map(t => ({ value: t.value, label: t.label, color: t.color }))
];

const PRIORIDADES = [
  { value: 'alta', label: 'Alta', cls: 'text-rose-700 bg-rose-50 border-rose-200' },
  { value: 'media', label: 'Media', cls: 'text-amber-700 bg-amber-50 border-amber-200' },
  { value: 'baja', label: 'Baja', cls: 'text-slate-600 bg-slate-50 border-slate-200' }
];

const ESTADOS = [
  { value: 'pendiente', label: 'Pendientes' },
  { value: 'atendido', label: 'Atendidos' },
  { value: 'descartado', label: 'Descartados' }
];

function formInicial() {
  // Por defecto: hoy a las 09:00 hora Lima (no depende del huso del navegador).
  // Si las 09:00 ya pasaron, se usa el momento actual: la fecha de un
  // recordatorio no puede ser anterior a ahora.
  const ahora = nowDateTimeLocalLima();
  const nueve = `${ahora.slice(0, 10)}T09:00`;
  return {
    titulo: '',
    descripcion: '',
    tipo: 'manual',
    fecha_recordatorio: nueve >= ahora ? nueve : ahora,
    prioridad: 'media'
  };
}

function badgeTipo(tipo) {
  if (!tipo) return null;
  const t = TIPOS.find(x => x.value === tipo);
  const label = t?.label || tipo;
  const color = t?.color || colorPorTipo(tipo);
  return <span className="px-1.5 py-0.5 rounded text-[10px] font-medium" style={{ background: `${color}22`, color }}>{label}</span>;
}

function badgePrioridad(p) {
  const x = PRIORIDADES.find(o => o.value === p);
  return x ? <span className={`px-1.5 py-0.5 rounded text-[10px] border ${x.cls}`}>{x.label}</span> : null;
}

function vinculoEntidad(r) {
  if (r.servicio) return { to: `/servicios/${r.servicio.id}`, label: `Servicio ${r.servicio.codigo || ''}` };
  if (r.cobro) return { to: `/cobros/${r.cobro.id}`, label: `Cobro #${r.cobro.id}` };
  if (r.emergencia) return { to: `/emergencias`, label: `Emergencia` };
  if (r.mantenimiento_plan) return { to: `/mantenimientos`, label: `Plan mantenimiento` };
  return null;
}

function agruparPorFecha(items) {
  const fmtYMD = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Lima', year: 'numeric', month: '2-digit', day: '2-digit'
  });
  const hoy = fmtYMD.format(new Date());
  const grupos = { Vencidos: [], Hoy: [], 'Próximos 7 días': [], 'Más adelante': [] };
  const limite7Str = fmtYMD.format(new Date(Date.now() + 7 * 86400000));
  items.forEach(r => {
    const fStr = fmtYMD.format(new Date(r.fecha_recordatorio));
    if (r.estado_recordatorio !== 'pendiente') return grupos['Más adelante'].push(r);
    if (fStr < hoy) grupos.Vencidos.push(r);
    else if (fStr === hoy) grupos.Hoy.push(r);
    else if (fStr <= limite7Str) grupos['Próximos 7 días'].push(r);
    else grupos['Más adelante'].push(r);
  });
  return grupos;
}

export default function Recordatorios() {
  const [filtros, setFiltros] = useState({ tipo: '', estado_recordatorio: 'pendiente', prioridad: '', id_cliente: '', q: '' });
  const [clientes, setClientes] = useState([]);
  const [modalForm, setModalForm] = useState(null); // null | { form, editId? }
  const [saving, setSaving] = useState(false);
  const toast = useToast();

  const { data, loading, total, page, pageSize, totalPages, setPage, setPageSize, recargar } =
    usePaginatedList(recordatoriosService.paginate, filtros, { initialPageSize: 25 });
  const cargar = recargar;

  useEffect(() => { clientesService.list().then(setClientes).catch(() => setClientes([])); }, []);

  // La búsqueda (q) y el resto de filtros se resuelven en el servidor; la
  // agrupación por fecha se aplica a la página actual (el backend ordena por
  // fecha_recordatorio asc, así los grupos se mantienen coherentes entre páginas).
  const grupos = useMemo(() => agruparPorFecha(data), [data]);

  const setF = (k, v) => setFiltros(p => ({ ...p, [k]: v }));

  const abrirNuevo = () => setModalForm({ form: formInicial() });
  const abrirEdicion = (r) => setModalForm({
    editId: r.id,
    form: {
      titulo: r.titulo,
      descripcion: r.descripcion || '',
      tipo: r.tipo,
      // Mostrar el instante guardado en hora de Lima, no en UTC ni en el huso del navegador.
      fecha_recordatorio: isoToDateTimeLocalLima(r.fecha_recordatorio),
      prioridad: r.prioridad
    }
  });
  const cerrarModal = () => setModalForm(null);

  const guardar = async () => {
    if (!modalForm.form.titulo || !modalForm.form.fecha_recordatorio) {
      return toast.error('Título y fecha son obligatorios');
    }
    // La fecha no puede ser anterior al momento actual (hora Lima). Ambos valores
    // están en el mismo formato/huso, así que la comparación de strings equivale
    // a la cronológica, con granularidad de minuto (la del input datetime-local).
    if (modalForm.form.fecha_recordatorio < nowDateTimeLocalLima()) {
      return toast.error('La fecha no puede ser anterior al momento actual');
    }
    setSaving(true);
    try {
      // El input datetime-local entrega "YYYY-MM-DDTHH:mm" sin TZ; anclarlo a Lima
      // antes de enviar para que el instante guardado coincida con la hora local del usuario.
      const payload = { ...modalForm.form, fecha_recordatorio: dateTimeLocalLimaToISO(modalForm.form.fecha_recordatorio) };
      if (modalForm.editId) {
        await recordatoriosService.update(modalForm.editId, payload);
        toast.success('Recordatorio actualizado');
      } else {
        await recordatoriosService.create(payload);
        toast.success('Recordatorio creado');
      }
      cerrarModal();
      cargar();
    } catch (e) {
      toast.error(e.response?.data?.error || 'Error al guardar');
    } finally { setSaving(false); }
  };

  const atender = async (r) => {
    try {
      await recordatoriosService.atender(r.id);
      toast.success('Marcado como atendido');
      cargar();
    } catch (e) { toast.error(e.response?.data?.error || 'Error'); }
  };

  const descartar = async (r) => {
    if (!confirm('¿Descartar este recordatorio?')) return;
    try {
      await recordatoriosService.descartar(r.id);
      toast.success('Descartado');
      cargar();
    } catch (e) { toast.error(e.response?.data?.error || 'Error'); }
  };

  const reactivar = async (r) => {
    try {
      await recordatoriosService.pendiente(r.id);
      toast.success('Reactivado');
      cargar();
    } catch (e) { toast.error(e.response?.data?.error || 'Error'); }
  };

  const eliminar = async (r) => {
    if (!confirm('¿Eliminar este recordatorio?')) return;
    try {
      await recordatoriosService.remove(r.id);
      toast.success('Eliminado');
      cargar();
    } catch (e) { toast.error(e.response?.data?.error || 'Error'); }
  };

  return (
    <>
      <PageHeader title="Recordatorios" subtitle="Seguimiento de programaciones y pendientes"
        actions={<button onClick={abrirNuevo} className="btn-primary">+ Nuevo recordatorio</button>} />

      <div className="card mb-4">
        <div className="p-3 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
          <div>
            <label className="label">Buscar</label>
            <input className="input" placeholder="Título, cliente…" value={filtros.q} onChange={e => setF('q', e.target.value)} />
          </div>
          <div>
            <label className="label">Estado</label>
            <select className="select" value={filtros.estado_recordatorio} onChange={e => setF('estado_recordatorio', e.target.value)}>
              <option value="">Todos</option>
              {ESTADOS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Tipo</label>
            <select className="select" value={filtros.tipo} onChange={e => setF('tipo', e.target.value)}>
              <option value="">Todos</option>
              {TIPOS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Prioridad</label>
            <select className="select" value={filtros.prioridad} onChange={e => setF('prioridad', e.target.value)}>
              <option value="">Todas</option>
              {PRIORIDADES.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Cliente</label>
            <select className="select" value={filtros.id_cliente} onChange={e => setF('id_cliente', e.target.value)}>
              <option value="">Todos</option>
              {clientes.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
            </select>
          </div>
        </div>
      </div>

      {loading ? <Loader /> : data.length === 0 ? (
        <div className="card"><EmptyState title="Sin recordatorios" subtitle="No hay recordatorios con los filtros aplicados" /></div>
      ) : (
        <div className="space-y-4">
          {Object.entries(grupos).map(([titulo, items]) => items.length === 0 ? null : (
            <div key={titulo} className="card">
              <div className="px-4 py-2 border-b border-slate-100 flex items-center justify-between">
                <h3 className={`font-semibold text-sm ${titulo === 'Vencidos' ? 'text-rose-700' : titulo === 'Hoy' ? 'text-amber-700' : 'text-slate-700'}`}>
                  {titulo}
                </h3>
                <span className="text-xs text-slate-500">{items.length}</span>
              </div>
              <ul className="divide-y divide-slate-100">
                {items.map(r => {
                  const link = vinculoEntidad(r);
                  return (
                    <li key={r.id} className="p-4 flex items-start gap-3">
                      <div className="h-3 w-3 mt-1.5 rounded-full shrink-0" style={{ background: r.color || '#8b5cf6' }} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-medium text-slate-800 text-sm">{r.titulo}</span>
                          {badgeTipo(r.tipo)}
                          {badgePrioridad(r.prioridad)}
                          {r.origen === 'auto' && <span className="text-[10px] text-slate-400 uppercase tracking-wider">auto</span>}
                        </div>
                        {r.descripcion && <div className="text-xs text-slate-600 mt-0.5">{r.descripcion}</div>}
                        <div className="text-xs text-slate-500 mt-1 flex items-center gap-3 flex-wrap">
                          <span>{formatFechaHora(r.fecha_recordatorio)}</span>
                          {link && <Link to={link.to} className="text-brand-700 hover:underline">{link.label}</Link>}
                        </div>
                        {r.notas_seguimiento && (
                          <div className="text-xs text-slate-600 mt-2 p-2 bg-slate-50 rounded">{r.notas_seguimiento}</div>
                        )}
                      </div>
                      <div className="flex flex-col gap-1 shrink-0">
                        {r.estado_recordatorio === 'pendiente' && (
                          <>
                            <button onClick={() => atender(r)} className="text-xs text-emerald-700 hover:underline">Atender</button>
                            <button onClick={() => descartar(r)} className="text-xs text-slate-500 hover:underline">Descartar</button>
                            {r.origen === 'manual' && <button onClick={() => abrirEdicion(r)} className="text-xs text-brand-700 hover:underline">Editar</button>}
                          </>
                        )}
                        {r.estado_recordatorio !== 'pendiente' && (
                          <button onClick={() => reactivar(r)} className="text-xs text-brand-700 hover:underline">Reactivar</button>
                        )}
                        {r.origen === 'manual' && <button onClick={() => eliminar(r)} className="text-xs text-rose-700 hover:underline">Eliminar</button>}
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
          <div className="card">
            <Pagination page={page} pageSize={pageSize} total={total} totalPages={totalPages}
              onPage={setPage} onPageSize={setPageSize} />
          </div>
        </div>
      )}

      <Modal open={modalForm !== null} onClose={cerrarModal}
        title={modalForm?.editId ? 'Editar recordatorio' : 'Nuevo recordatorio'}
        footer={
          <>
            <button onClick={cerrarModal} className="btn-secondary">Cancelar</button>
            <button onClick={guardar} disabled={saving} className="btn-primary">{saving ? 'Guardando…' : 'Guardar'}</button>
          </>
        }>
        {modalForm && (
          <div className="space-y-3">
            <div>
              <label className="label">Título *</label>
              <input className="input" value={modalForm.form.titulo} onChange={e => setModalForm(m => ({ ...m, form: { ...m.form, titulo: e.target.value } }))} />
            </div>
            <div>
              <label className="label">Descripción</label>
              <textarea className="textarea" rows="3" value={modalForm.form.descripcion} onChange={e => setModalForm(m => ({ ...m, form: { ...m.form, descripcion: e.target.value } }))} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label">Fecha y hora *</label>
                <input type="datetime-local" className="input" min={nowDateTimeLocalLima()} value={modalForm.form.fecha_recordatorio} onChange={e => setModalForm(m => ({ ...m, form: { ...m.form, fecha_recordatorio: e.target.value } }))} />
              </div>
              <div>
                <label className="label">Prioridad</label>
                <select className="select" value={modalForm.form.prioridad} onChange={e => setModalForm(m => ({ ...m, form: { ...m.form, prioridad: e.target.value } }))}>
                  {PRIORIDADES.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </div>
            </div>
          </div>
        )}
      </Modal>
    </>
  );
}
