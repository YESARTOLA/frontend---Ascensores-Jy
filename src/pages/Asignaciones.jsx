import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { serviciosService } from '../services';
import PageHeader from '../components/common/PageHeader.jsx';
import Loader from '../components/common/Loader.jsx';
import EmptyState from '../components/common/EmptyState.jsx';
import { useToast } from '../components/common/Toast.jsx';
import { useAuth } from '../features/auth/AuthContext.jsx';
import { badgeEstado, formatFecha, codigosAscensores, resumenAscensores } from '../utils/formatters.js';

const ESTADOS_ACTIVOS = ['Borrador', 'Pendiente', 'Asignado', 'Checklist de salida pendiente', 'Listo para salida', 'En camino', 'En curso'];

export default function Asignaciones() {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filtros, setFiltros] = useState({ estado_servicio: '', origen: '', prioridad: '' });
  const toast = useToast();
  const { esSuperAdmin, esAdmin, esCoordinador } = useAuth();
  const puedeGestionar = esSuperAdmin || esAdmin || esCoordinador;
  const puedeCancelar = esSuperAdmin || esAdmin;

  const cargar = async () => {
    setLoading(true);
    try {
      const list = await serviciosService.list();
      setData(list.filter(s => ESTADOS_ACTIVOS.includes(s.estado_servicio)));
    } finally { setLoading(false); }
  };
  useEffect(() => { cargar(); }, []);

  const filtrados = data.filter(s =>
    (!filtros.estado_servicio || s.estado_servicio === filtros.estado_servicio) &&
    (!filtros.origen || s.origen === filtros.origen) &&
    (!filtros.prioridad || s.prioridad === filtros.prioridad)
  );

  const accion = async (id, fn, mensaje, confirmacion) => {
    if (confirmacion && !confirm(confirmacion)) return;
    try { await fn(); toast.success(mensaje); cargar(); }
    catch (err) { toast.error(err.response?.data?.error || 'Error'); }
  };

  return (
    <>
      <PageHeader title="Asignaciones" subtitle={`${filtrados.length} servicio(s) en gestión`} />

      <div className="card mb-4">
        <div className="p-4 grid grid-cols-1 sm:grid-cols-4 gap-3">
          <div>
            <label className="label">Estado</label>
            <select className="select" value={filtros.estado_servicio} onChange={e => setFiltros(f => ({ ...f, estado_servicio: e.target.value }))}>
              <option value="">Todos los activos</option>
              {ESTADOS_ACTIVOS.map(s => <option key={s}>{s}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Origen</label>
            <select className="select" value={filtros.origen} onChange={e => setFiltros(f => ({ ...f, origen: e.target.value }))}>
              <option value="">Todos</option>
              <option value="directo">Directo</option>
              <option value="lead">Lead</option>
              <option value="atencion_rapida">Atención rápida</option>
              <option value="emergencia">Emergencia</option>
              <option value="mantenimiento">Mantenimiento</option>
            </select>
          </div>
          <div>
            <label className="label">Prioridad</label>
            <select className="select" value={filtros.prioridad} onChange={e => setFiltros(f => ({ ...f, prioridad: e.target.value }))}>
              <option value="">Todas</option>
              <option value="alta">Alta</option>
              <option value="media">Media</option>
              <option value="baja">Baja</option>
            </select>
          </div>
          <div className="flex items-end"><button onClick={() => setFiltros({ estado_servicio: '', origen: '', prioridad: '' })} className="btn-secondary w-full">Limpiar</button></div>
        </div>
      </div>

      <div className="card">
        {loading ? <Loader /> : filtrados.length === 0 ? <EmptyState title="Sin asignaciones" /> : (
          <div className="overflow-x-auto scroll-thin">
            <table className="table-base">
              <thead><tr>
                <th className="table-th">Servicio</th><th className="table-th">Cliente / Ascensor</th>
                <th className="table-th">Técnicos</th><th className="table-th">Resp. doc / chk</th>
                <th className="table-th">Fecha / hora</th>
                <th className="table-th text-center">Prioridad</th>
                <th className="table-th text-center">Origen</th>
                <th className="table-th text-center">Checklist</th>
                <th className="table-th">Estado</th>
                <th className="table-th text-right">Acciones</th>
              </tr></thead>
              <tbody className="divide-y divide-slate-100">
                {filtrados.map(s => {
                  const docu = s.asignaciones?.find(a => a.responsable_documentacion === 1);
                  const chk = s.asignaciones?.find(a => a.responsable_checklist === 1);
                  const checklist = s.checklists?.[0] || null;
                  const itemsCount = (checklist?.items || []).filter(i => i.estado === 1).length;
                  const checklistEstado = checklist?.estado_checklist || (s.estado_servicio === 'Asignado' ? 'Sin items' : '—');
                  return (
                    <tr key={s.id} className="table-row-hover">
                      <td className="table-td">
                        <Link to={`/servicios/${s.id}`} className="font-mono text-xs text-brand-700 hover:underline">{s.codigo}</Link>
                        <div className="text-xs text-slate-500 truncate max-w-[200px]">{s.titulo}</div>
                      </td>
                      <td className="table-td text-xs"><div>{s.cliente?.nombre}</div><div className="font-mono text-slate-500" title={codigosAscensores(s).join(', ')}>{resumenAscensores(s)}</div></td>
                      <td className="table-td text-xs">{s.asignaciones?.map(a => a.tecnico?.nombre).join(', ') || <span className="text-rose-500">Sin asignar</span>}</td>
                      <td className="table-td text-xs">
                        <div>{docu?.tecnico?.nombre || '—'}</div>
                        <div className="text-slate-500">{chk?.tecnico?.nombre || '—'}</div>
                      </td>
                      <td className="table-td text-xs">{formatFecha(s.fecha_programada)} {s.hora_programada || ''}</td>
                      <td className="table-td text-center text-xs">{s.prioridad}</td>
                      <td className="table-td text-center text-xs">{s.origen}</td>
                      <td className="table-td text-center text-xs">
                        <div>{checklistEstado}</div>
                        {itemsCount > 0 && <div className="text-slate-500">{itemsCount} ítems</div>}
                      </td>
                      <td className="table-td"><span className={badgeEstado(s.estado_servicio)}>{s.estado_servicio}</span></td>
                      <td className="table-td text-right whitespace-nowrap">
                        <div className="flex justify-end gap-1 flex-wrap">
                          {s.estado_servicio === 'Borrador' && puedeGestionar && (
                            <button onClick={() => accion(s.id, () => serviciosService.promover(s.id), 'Borrador promovido', '¿Promover borrador?')} className="text-emerald-700 text-xs hover:underline">Promover</button>
                          )}
                          {s.estado_servicio === 'Listo para salida' && (
                            <button onClick={() => accion(s.id, () => serviciosService.iniciar(s.id, 'en_camino'), 'En camino')} className="text-brand-700 text-xs hover:underline">En camino</button>
                          )}
                          {['Listo para salida', 'En camino'].includes(s.estado_servicio) && (
                            <button onClick={() => accion(s.id, () => serviciosService.iniciar(s.id, 'iniciar_servicio'), 'En curso')} className="text-brand-700 text-xs hover:underline">En curso</button>
                          )}
                          {puedeCancelar && (
                            <button onClick={() => {
                              const motivo = prompt('Motivo de cancelación:');
                              if (motivo) accion(s.id, () => serviciosService.cancelar(s.id, motivo), 'Cancelado');
                            }} className="text-rose-600 text-xs hover:underline">Cancelar</button>
                          )}
                          <Link to={`/servicios/${s.id}`} className="text-slate-600 text-xs hover:underline">Gestionar</Link>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
