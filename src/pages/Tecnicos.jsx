import { useEffect, useState } from 'react';
import { tecnicosService } from '../services';
import PageHeader from '../components/common/PageHeader.jsx';
import Loader from '../components/common/Loader.jsx';
import Modal from '../components/common/Modal.jsx';
import EmptyState from '../components/common/EmptyState.jsx';
import Pagination, { usePaginatedList } from '../components/common/Pagination.jsx';
import { useToast } from '../components/common/Toast.jsx';
import { useAuth } from '../features/auth/AuthContext.jsx';
import { badgeEstado, sanearTelefono, formatTelefono } from '../utils/formatters.js';

const inicial = { nombre: '', telefono: '', documento: '', especialidades: '', estado_operativo: 'Disponible', observaciones: '' };
const ESTADOS = ['Disponible', 'Ocupado', 'En servicio', 'Inactivo', 'Suspendido'];

const VISTA_KEY = 'tecnicos.vista';

export default function Tecnicos() {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(inicial);
  const [editId, setEditId] = useState(null);
  const [q, setQ] = useState('');
  const [filtroEstado, setFiltroEstado] = useState('');
  const [vista, setVista] = useState(() => localStorage.getItem(VISTA_KEY) || 'cards');
  const toast = useToast();
  const { esSuperAdmin, esAdmin } = useAuth();
  const puedeEditar = esSuperAdmin || esAdmin;

  // Filtros resueltos en el servidor (el backend de /tecnicos soporta q y
  // estado_operativo). Sin ?page= el endpoint sigue devolviendo todo para los
  // selects de otras pantallas; aquí paginamos.
  const { data, loading, total, page, pageSize, totalPages, setPage, setPageSize, recargar } =
    usePaginatedList(tecnicosService.paginate, { q, estado_operativo: filtroEstado }, { initialPageSize: 25 });
  const cargar = recargar;

  useEffect(() => { localStorage.setItem(VISTA_KEY, vista); }, [vista]);

  const abrirNuevo = () => { setForm(inicial); setEditId(null); setOpen(true); };
  const abrirEdit = (t) => {
    setForm({
      nombre: t.nombre, telefono: sanearTelefono(t.telefono || ''), documento: t.documento || '',
      especialidades: t.especialidades || '', estado_operativo: t.estado_operativo,
      observaciones: t.observaciones || ''
    });
    setEditId(t.id); setOpen(true);
  };

  const guardar = async (e) => {
    e.preventDefault();
    if (saving) return;
    setSaving(true);
    try {
      if (editId) await tecnicosService.update(editId, form);
      else await tecnicosService.create(form);
      toast.success('Técnico guardado'); setOpen(false); cargar();
    } catch (err) { toast.error(err.response?.data?.error || 'Error'); }
    finally { setSaving(false); }
  };

  const iniciales = (nombre) => nombre.split(' ').map(p => p[0]).slice(0, 2).join('').toUpperCase();

  const ToggleVista = (
    <div className="inline-flex rounded-lg border border-slate-200 bg-white overflow-hidden">
      <button
        onClick={() => setVista('cards')}
        title="Vista de tarjetas"
        className={`px-2.5 py-1.5 text-xs font-medium transition ${vista === 'cards' ? 'bg-brand-50 text-brand-700' : 'text-slate-500 hover:bg-slate-50'}`}
        aria-pressed={vista === 'cards'}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="inline -mt-0.5 mr-1">
          <rect x="3" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="3" width="7" height="7" rx="1.5" />
          <rect x="3" y="14" width="7" height="7" rx="1.5" /><rect x="14" y="14" width="7" height="7" rx="1.5" />
        </svg>
        Tarjetas
      </button>
      <button
        onClick={() => setVista('lista')}
        title="Vista de lista"
        className={`px-2.5 py-1.5 text-xs font-medium transition border-l border-slate-200 ${vista === 'lista' ? 'bg-brand-50 text-brand-700' : 'text-slate-500 hover:bg-slate-50'}`}
        aria-pressed={vista === 'lista'}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="inline -mt-0.5 mr-1">
          <line x1="8" y1="6" x2="21" y2="6" /><line x1="8" y1="12" x2="21" y2="12" /><line x1="8" y1="18" x2="21" y2="18" />
          <circle cx="4" cy="6" r="1" /><circle cx="4" cy="12" r="1" /><circle cx="4" cy="18" r="1" />
        </svg>
        Lista
      </button>
    </div>
  );

  return (
    <>
      <PageHeader title="Técnicos" subtitle={`${total} técnico(s)`}
        actions={
          <>
            {ToggleVista}
            {puedeEditar && <button onClick={abrirNuevo} className="btn-primary">+ Nuevo técnico</button>}
          </>
        } />

      <div className="card mb-4">
        <div className="p-3 grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="sm:col-span-2">
            <label className="label">Buscar</label>
            <input className="input" placeholder="Nombre, teléfono, documento, especialidad…" value={q} onChange={e => setQ(e.target.value)} />
          </div>
          <div>
            <label className="label">Estado operativo</label>
            <select className="select" value={filtroEstado} onChange={e => setFiltroEstado(e.target.value)}>
              <option value="">Todos</option>
              {ESTADOS.map(s => <option key={s}>{s}</option>)}
            </select>
          </div>
        </div>
      </div>

      {loading ? <Loader /> : data.length === 0 ? (
        <div className="card"><EmptyState title="Sin técnicos" subtitle={q || filtroEstado ? 'Ningún técnico coincide con los filtros' : 'Aún no hay técnicos registrados'} /></div>
      ) : vista === 'cards' ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {data.map(t => (
            <div key={t.id} className="card p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  <div className="h-10 w-10 rounded-full bg-brand-100 text-brand-700 grid place-items-center font-semibold shrink-0">{iniciales(t.nombre)}</div>
                  <div className="min-w-0 flex-1">
                    <div className="font-medium text-slate-800 truncate" title={t.nombre}>{t.nombre}</div>
                    <div className="text-xs text-slate-500 font-mono truncate">{formatTelefono(t.telefono) || '—'}</div>
                  </div>
                </div>
                <span className={`${badgeEstado(t.estado_operativo)} shrink-0 whitespace-nowrap`}>{t.estado_operativo}</span>
              </div>
              {t.especialidades && <p className="text-xs text-slate-500 mt-3">{t.especialidades}</p>}
              {puedeEditar && <button onClick={() => abrirEdit(t)} className="mt-3 text-xs text-brand-700 font-medium hover:underline">Editar</button>}
            </div>
          ))}
        </div>
      ) : (
        // Vista lista (tabla)
        <div className="card">
          <div className="overflow-x-auto scroll-thin">
            <table className="table-base">
              <thead>
                <tr>
                  <th className="table-th">Técnico</th>
                  <th className="table-th">Teléfono</th>
                  <th className="table-th">Documento</th>
                  <th className="table-th">Especialidades</th>
                  <th className="table-th">Estado</th>
                  {puedeEditar && <th className="table-th text-right">Acciones</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {data.map(t => (
                  <tr key={t.id} className="table-row-hover">
                    <td className="table-td">
                      <div className="flex items-center gap-2.5">
                        <div className="h-8 w-8 rounded-full bg-brand-100 text-brand-700 grid place-items-center text-xs font-semibold shrink-0">{iniciales(t.nombre)}</div>
                        <div className="min-w-0">
                          <div className="font-medium text-slate-800 text-sm">{t.nombre}</div>
                          {t.observaciones && <div className="text-xs text-slate-500 truncate max-w-xs" title={t.observaciones}>{t.observaciones}</div>}
                        </div>
                      </div>
                    </td>
                    <td className="table-td font-mono text-xs">{formatTelefono(t.telefono) || '—'}</td>
                    <td className="table-td font-mono text-xs">{t.documento || '—'}</td>
                    <td className="table-td text-xs text-slate-600 max-w-md truncate" title={t.especialidades}>{t.especialidades || '—'}</td>
                    <td className="table-td"><span className={badgeEstado(t.estado_operativo)}>{t.estado_operativo}</span></td>
                    {puedeEditar && (
                      <td className="table-td text-right">
                        <button onClick={() => abrirEdit(t)} className="text-xs text-brand-700 hover:underline">Editar</button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {!loading && data.length > 0 && (
        <div className="card mt-4">
          <Pagination page={page} pageSize={pageSize} total={total} totalPages={totalPages}
            onPage={setPage} onPageSize={setPageSize} />
        </div>
      )}

      <Modal open={open} onClose={() => !saving && setOpen(false)} title={editId ? 'Editar técnico' : 'Nuevo técnico'}
        footer={<><button type="button" className="btn-secondary" onClick={() => setOpen(false)} disabled={saving}>Cancelar</button><button type="submit" form="form-tecnico" className="btn-primary" disabled={saving}>{saving ? 'Guardando…' : 'Guardar'}</button></>}>
        <form id="form-tecnico" onSubmit={guardar} className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="sm:col-span-2"><label className="label">Nombre *</label><input className="input" required value={form.nombre} onChange={e => setForm(f => ({ ...f, nombre: e.target.value }))} /></div>
          <div><label className="label">Teléfono</label><input
            className="input"
            type="tel" inputMode="numeric" autoComplete="tel"
            placeholder="9XX XXX XXX"
            pattern="9\d{2} \d{3} \d{3}"
            title="Celular peruano: 9 dígitos comenzando con 9"
            value={formatTelefono(form.telefono)}
            onChange={e => setForm(f => ({ ...f, telefono: sanearTelefono(e.target.value) }))}
          /></div>
          <div><label className="label">Documento</label><input className="input" value={form.documento} onChange={e => setForm(f => ({ ...f, documento: e.target.value }))} /></div>
          <div className="sm:col-span-2"><label className="label">Especialidades</label><textarea className="textarea" rows="2" value={form.especialidades} onChange={e => setForm(f => ({ ...f, especialidades: e.target.value }))} /></div>
          <div><label className="label">Estado</label>
            <select className="select" value={form.estado_operativo} onChange={e => setForm(f => ({ ...f, estado_operativo: e.target.value }))}>
              {ESTADOS.map(s => <option key={s}>{s}</option>)}
            </select>
          </div>
          <div className="sm:col-span-2"><label className="label">Observaciones</label><textarea className="textarea" rows="2" value={form.observaciones} onChange={e => setForm(f => ({ ...f, observaciones: e.target.value }))} /></div>
        </form>
      </Modal>
    </>
  );
}
