import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { edificiosService } from '../services';
import PageHeader from '../components/common/PageHeader.jsx';
import Loader from '../components/common/Loader.jsx';
import Modal from '../components/common/Modal.jsx';
import EmptyState from '../components/common/EmptyState.jsx';
import Pagination from '../components/common/Pagination.jsx';
import { useToast } from '../components/common/Toast.jsx';
import { useAuth } from '../features/auth/AuthContext.jsx';
import { nombreCliente } from '../utils/formatters.js';
import EdificioForm, { edificioToForm } from '../components/edificios/EdificioForm.jsx';

/**
 * Módulo Edificios / Obras: vista global de todas las ubicaciones físicas
 * (edificios u obras) registradas, sin importar el cliente. Permite buscar,
 * filtrar por tipo y distrito, editar y desactivar. La creación se mantiene
 * dentro de cada Cliente (Cliente360) para garantizar el vínculo con el cliente.
 */
export default function Edificios() {
  const [edificios, setEdificios] = useState([]);
  const [loading, setLoading] = useState(true);
  const [tipos, setTipos] = useState([]);
  const [distritos, setDistritos] = useState([]);

  // Filtros
  const [q, setQ] = useState('');
  const [tipo, setTipo] = useState('');
  const [distrito, setDistrito] = useState('');
  const [servicios, setServicios] = useState('');   // '' | 'con' | 'sin'
  const [proyectos, setProyectos] = useState('');   // '' | 'con' | 'sin'

  // Paginación (cliente)
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  // Modal de edición
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(null);
  const [editId, setEditId] = useState(null);

  // Confirmación de desactivación
  const [aDesactivar, setADesactivar] = useState(null);

  const toast = useToast();
  const { esSuperAdmin, esAdmin, esCoordinador } = useAuth();
  const puedeEditar = esSuperAdmin || esAdmin || esCoordinador;

  const cargar = () => {
    setLoading(true);
    edificiosService.list()
      .then(d => setEdificios(d || []))
      .catch(() => setEdificios([]))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    cargar();
    edificiosService.tipos().then(setTipos).catch(() => setTipos([]));
    edificiosService.distritos().then(setDistritos).catch(() => setDistritos([]));
  }, []);

  // Lista filtrada. Texto: nombre / cliente / distrito / dirección / tipo de
  // ascensores. Filtros: tipo, distrito, presencia de servicios y de proyectos.
  const filtrados = useMemo(() => {
    const texto = q.trim().toLowerCase();
    return edificios.filter(ed => {
      if (tipo && ed.tipo !== tipo) return false;
      if (distrito && ed.distrito !== distrito) return false;
      if (servicios === 'con' && !ed.tiene_servicios) return false;
      if (servicios === 'sin' && ed.tiene_servicios) return false;
      if (proyectos === 'con' && !ed.tiene_proyectos) return false;
      if (proyectos === 'sin' && ed.tiene_proyectos) return false;
      if (!texto) return true;
      const campos = [ed.nombre, ed.distrito, ed.direccion, ed.cliente?.nombre, ...(ed.tipos_ascensores || [])].filter(Boolean);
      return campos.some(s => String(s).toLowerCase().includes(texto));
    });
  }, [edificios, q, tipo, distrito, servicios, proyectos]);

  // Volver a la primera página cuando cambian filtros o el tamaño de página.
  useEffect(() => { setPage(1); }, [q, tipo, distrito, servicios, proyectos, pageSize]);

  const total = filtrados.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const pagina = useMemo(
    () => filtrados.slice((page - 1) * pageSize, page * pageSize),
    [filtrados, page, pageSize]
  );

  const abrirEditar = (ed) => { setForm(edificioToForm(ed)); setEditId(ed.id); setOpen(true); };

  const guardar = async (payload) => {
    try {
      await edificiosService.update(editId, payload);
      toast.success('Edificio guardado');
      setOpen(false);
      cargar();
      edificiosService.distritos().then(setDistritos).catch(() => {});
    } catch (err) {
      toast.error(err.response?.data?.error || 'Error al guardar');
    }
  };

  const desactivar = async () => {
    if (!aDesactivar) return;
    try {
      await edificiosService.setEstado(aDesactivar.id, 0);
      toast.success('Edificio desactivado');
      setADesactivar(null);
      cargar();
    } catch (err) {
      toast.error(err.response?.data?.error || 'No se pudo desactivar el edificio');
    }
  };

  const hayFiltros = q || tipo || distrito || servicios || proyectos;
  const limpiarFiltros = () => { setQ(''); setTipo(''); setDistrito(''); setServicios(''); setProyectos(''); };

  // Color del badge según el catálogo de tipos (SSoT backend), sin hardcodear.
  const colorTipo = (cod) =>
    tipos.find(t => t.codigo === cod)?.color || 'bg-slate-100 text-slate-600 ring-slate-200';

  return (
    <>
      <PageHeader title="Edificios / Obras" subtitle={`${total} registro(s)`} />

      <div className="card">
        <div className="flex flex-wrap items-center gap-2 px-3 pt-3">
          <input className="input flex-1 min-w-[260px] sm:max-w-xl" placeholder="Buscar edificio, cliente, distrito, tipo de ascensor…"
            value={q} onChange={e => setQ(e.target.value)} />
          <select className="select max-w-[170px]" value={tipo} onChange={e => setTipo(e.target.value)}>
            <option value="">Todos los tipos</option>
            {tipos.map(t => <option key={t.codigo} value={t.codigo}>{t.etiqueta}</option>)}
          </select>
          <select className="select max-w-[190px]" value={distrito} onChange={e => setDistrito(e.target.value)}>
            <option value="">Todos los distritos</option>
            {distritos.map(d => <option key={d} value={d}>{d}</option>)}
          </select>
          <select className="select max-w-[160px]" value={servicios} onChange={e => setServicios(e.target.value)}>
            <option value="">Servicios: todos</option>
            <option value="con">Con servicios</option>
            <option value="sin">Sin servicios</option>
          </select>
          <select className="select max-w-[160px]" value={proyectos} onChange={e => setProyectos(e.target.value)}>
            <option value="">Proyectos: todos</option>
            <option value="con">Con proyectos</option>
            <option value="sin">Sin proyectos</option>
          </select>
          {hayFiltros && (
            <button className="text-xs text-slate-500 hover:text-slate-800" onClick={limpiarFiltros}>
              Limpiar filtros
            </button>
          )}
        </div>

        {loading ? <Loader /> : total === 0 ? (
          <EmptyState title={hayFiltros ? 'Sin coincidencias' : 'Sin edificios'}
            subtitle={hayFiltros ? 'Ajusta la búsqueda o los filtros.' : 'Los edificios se crean desde el detalle de cada cliente.'} />
        ) : (
          <>
            <div className="hidden md:block overflow-x-auto scroll-thin">
              <table className="table-base">
                <thead><tr>
                  <th className="table-th">Nombre</th><th className="table-th">Tipo</th>
                  <th className="table-th">Cliente</th><th className="table-th">Distrito</th>
                  <th className="table-th">Ascensores</th>
                  <th className="table-th">Actividad</th>
                  <th className="table-th text-right">Acciones</th>
                </tr></thead>
                <tbody className="divide-y divide-slate-100">
                  {pagina.map(ed => (
                    <tr key={ed.id} className="table-row-hover">
                      <td className="table-td">
                        <div className="font-medium text-slate-800">{ed.nombre}</div>
                        {ed.direccion && <div className="text-xs text-slate-500">{ed.direccion}</div>}
                      </td>
                      <td className="table-td">
                        <span className={`text-[10px] px-2 py-0.5 rounded-full ring-1 ${colorTipo(ed.tipo)}`}>{ed.tipo}</span>
                      </td>
                      <td className="table-td">
                        {ed.cliente?.id
                          ? <Link to={`/clientes/${ed.cliente.id}`} className="text-brand-700 hover:underline">{nombreCliente(ed.cliente)}</Link>
                          : <span className="text-slate-400">—</span>}
                      </td>
                      <td className="table-td text-xs">{ed.distrito || '—'}</td>
                      <td className="table-td text-xs">
                        <span className="font-medium text-slate-700">{ed._count?.ascensores ?? 0}</span>
                        {ed.tipos_ascensores?.length > 0 && <div className="text-slate-500">{ed.tipos_ascensores.join(', ')}</div>}
                      </td>
                      <td className="table-td"><BadgesActividad ed={ed} /></td>
                      <td className="table-td text-right space-x-2">
                        {ed.cliente?.id && <Link to={`/clientes/${ed.cliente.id}`} className="text-brand-700 hover:underline text-xs">Ver cliente</Link>}
                        {puedeEditar && <button onClick={() => abrirEditar(ed)} className="text-slate-600 text-xs">Editar</button>}
                        {puedeEditar && <button onClick={() => setADesactivar(ed)} className="text-rose-600 text-xs">Desactivar</button>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="md:hidden divide-y divide-slate-100">
              {pagina.map(ed => (
                <div key={ed.id} className="p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold text-slate-800">{ed.nombre}</span>
                        <span className={`text-[10px] px-2 py-0.5 rounded-full ring-1 ${colorTipo(ed.tipo)}`}>{ed.tipo}</span>
                      </div>
                      {ed.cliente?.id && (
                        <Link to={`/clientes/${ed.cliente.id}`} className="text-xs text-brand-700 hover:underline">{nombreCliente(ed.cliente)}</Link>
                      )}
                      <div className="text-xs text-slate-500">{[ed.direccion, ed.distrito].filter(Boolean).join(' · ') || '—'}</div>
                      <div className="text-xs text-slate-500 mt-0.5">
                        {ed._count?.ascensores ?? 0} ascensor(es)
                        {ed.tipos_ascensores?.length > 0 && ` · ${ed.tipos_ascensores.join(', ')}`}
                      </div>
                      <div className="mt-1"><BadgesActividad ed={ed} /></div>
                    </div>
                    {puedeEditar && (
                      <div className="flex flex-col items-end gap-1 shrink-0 text-xs">
                        <button onClick={() => abrirEditar(ed)} className="text-slate-600">Editar</button>
                        <button onClick={() => setADesactivar(ed)} className="text-rose-600">Desactivar</button>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>

            <Pagination page={page} pageSize={pageSize} total={total} totalPages={totalPages}
              onPage={setPage} onPageSize={setPageSize} />
          </>
        )}
      </div>

      <Modal open={open} onClose={() => setOpen(false)} title="Editar edificio / obra" size="lg"
        footer={<><button className="btn-secondary" onClick={() => setOpen(false)}>Cancelar</button><button className="btn-primary" type="submit" form="edificio-form">Guardar</button></>}>
        {form && (
          <EdificioForm formId="edificio-form" value={form} onChange={setForm} onSubmit={guardar}
            tipos={tipos} distritos={distritos} />
        )}
      </Modal>

      <Modal open={!!aDesactivar} onClose={() => setADesactivar(null)} title="Desactivar edificio / obra" size="sm"
        footer={<><button className="btn-secondary" onClick={() => setADesactivar(null)}>Cancelar</button><button className="btn-danger" onClick={desactivar}>Desactivar</button></>}>
        <p className="text-sm text-slate-600">
          ¿Desactivar <span className="font-semibold text-slate-800">{aDesactivar?.nombre}</span>?
          Dejará de aparecer en la operación. No es posible si tiene ascensores activos.
        </p>
      </Modal>
    </>
  );
}

/** Pills que indican si el edificio participa en servicios y/o proyectos. */
function BadgesActividad({ ed }) {
  if (!ed.tiene_servicios && !ed.tiene_proyectos) return <span className="text-xs text-slate-400">—</span>;
  return (
    <div className="flex flex-wrap gap-1">
      {ed.tiene_servicios && (
        <span className="text-[10px] px-2 py-0.5 rounded-full ring-1 bg-emerald-50 text-emerald-700 ring-emerald-200">Servicios</span>
      )}
      {ed.tiene_proyectos && (
        <span className="text-[10px] px-2 py-0.5 rounded-full ring-1 bg-indigo-50 text-indigo-700 ring-indigo-200">Proyectos</span>
      )}
    </div>
  );
}
