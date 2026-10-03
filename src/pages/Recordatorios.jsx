import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { recordatoriosService, clientesService } from '../services';
import PageHeader from '../components/common/PageHeader.jsx';
import Loader from '../components/common/Loader.jsx';
import EmptyState from '../components/common/EmptyState.jsx';
import Modal from '../components/common/Modal.jsx';
import Pagination, { usePaginatedList } from '../components/common/Pagination.jsx';
import CalendarioControles from '../components/common/CalendarioControles.jsx';
import CalendarioMes from '../components/common/CalendarioMes.jsx';
import PanelFiltros from '../components/common/PanelFiltros.jsx';
import DateRangePicker from '../components/common/DateRangePicker.jsx';
import { useToast } from '../components/common/Toast.jsx';
import { formatFechaHora, hoyISO } from '../utils/formatters.js';
import { CATALOGO_TIPOS_EVENTO, colorPorTipo, tiposRecordatorioVisibles } from '../utils/visibilidadCalendario.js';
import { rangoMes, ymdLima, mesLabelLima, mesLabelCortoLima, fmtDiaLargo, fechaLima } from '../utils/calendarioFechas.js';
import { estaServicioFinalizado } from '../utils/estadoServicio.js';
import { useAuth } from '../features/auth/AuthContext.jsx';
import { destinoRecordatorio, etiquetaDestinoRecordatorio } from '../utils/destinoRecordatorio.js';
import RecordatorioFormModal, { PRIORIDADES } from '../components/recordatorios/RecordatorioFormModal.jsx';

// Tipos que SOLO informan que un servicio/proyecto terminó (sin acción pendiente).
const TIPOS_AVISO_FINALIZADO = new Set(['servicio_finalizado_aviso']);

// En la vista de Mes se ocultan únicamente los recordatorios que solo avisan que
// el servicio/proyecto ya finalizó (no hay nada que hacer con ellos). Los demás
// recordatorios ligados a un servicio finalizado —revisar servicio, facturar,
// cotización urgente, observaciones, etc.— SÍ se muestran, porque avisan que un
// paso del flujo está pendiente o que alguien debe intervenir.
const recordatorioOcultoEnMes = (r) =>
  TIPOS_AVISO_FINALIZADO.has(r.tipo) && (
    estaServicioFinalizado(r.servicio?.estado_servicio) ||
    estaServicioFinalizado(r.emergencia?.servicio?.estado_servicio)
  );

const ESTADOS = [
  { value: 'pendiente', label: 'Pendientes' },
  { value: 'atendido', label: 'Atendidos' },
  { value: 'descartado', label: 'Descartados' }
];

const BADGE_ESTADO = {
  pendiente: { cls: 'badge-amber', label: 'Pendiente' },
  atendido: { cls: 'badge-green', label: 'Atendido' },
  descartado: { cls: 'badge-gray', label: 'Descartado' }
};

// Bandeja: la agenda propia (lo registrado para uno + lo que el rol le deja ver)
// o los recordatorios que uno registró para otra persona.
const VISTAS = [
  { value: '', label: 'Mis recordatorios' },
  { value: 'enviados', label: 'Registrados para otros' }
];

const FILTROS_INICIALES = {
  vista: '', q: '', estado_recordatorio: 'pendiente', tipo: '', prioridad: '', id_cliente: '', desde: '', hasta: ''
};

function badgeTipo(tipo) {
  if (!tipo) return null;
  const t = CATALOGO_TIPOS_EVENTO.find(x => x.value === tipo);
  const label = t?.label || tipo;
  const color = t?.color || colorPorTipo(tipo);
  return <span className="px-1.5 py-0.5 rounded text-[10px] font-medium whitespace-nowrap" style={{ background: `${color}22`, color }}>{label}</span>;
}

function badgePrioridad(p) {
  const x = PRIORIDADES.find(o => o.value === p);
  return x ? <span className={`px-1.5 py-0.5 rounded text-[10px] border ${x.cls}`}>{x.label}</span> : null;
}

// Destino y etiqueta salen del mismo sitio que la campana y el dashboard
// (utils/destinoRecordatorio.js), para que las tres vistas lleven al mismo lado.
function vinculoEntidad(r) {
  const label = etiquetaDestinoRecordatorio(r);
  if (!label) return null;
  return { to: destinoRecordatorio(r), label };
}

// Aviso de plazo de un pendiente: vencido (antes de hoy) o de hoy, en hora Lima.
function avisoPlazo(r, hoy) {
  if (r.estado_recordatorio !== 'pendiente') return null;
  const dia = ymdLima(new Date(r.fecha_recordatorio));
  if (dia < hoy) return <span className="badge-red">Vencido</span>;
  if (dia === hoy) return <span className="badge-amber">Hoy</span>;
  return null;
}

export default function Recordatorios() {
  const { user, rol } = useAuth();
  // El filtro de Tipo solo ofrece lo que este rol puede llegar a ver.
  const tiposFiltro = useMemo(() => tiposRecordatorioVisibles(rol), [rol]);
  const [filtros, setFiltros] = useState(FILTROS_INICIALES);
  const [clientes, setClientes] = useState([]);
  // null = cerrado; { recordatorio } = abierto (recordatorio null → alta).
  const [modalForm, setModalForm] = useState(null);
  const toast = useToast();
  const enviados = filtros.vista === 'enviados';

  const { data, loading, total, page, pageSize, totalPages, setPage, setPageSize, recargar } =
    usePaginatedList(recordatoriosService.paginate, filtros, { initialPageSize: 25 });

  // Vista Tabla (por defecto) vs. vista Mes, reutilizando el calendario visual.
  const [modoLista, setModoLista] = useState(true);
  const [cursor, setCursor] = useState(new Date());
  const [eventosMes, setEventosMes] = useState([]);
  const [diaSel, setDiaSel] = useState(null);

  useEffect(() => { clientesService.list().then(setClientes).catch(() => setClientes([])); }, []);

  // La vista Mes trae TODOS los recordatorios del mes (sin `page` el backend no
  // pagina, tope 500), aplicando los mismos filtros que la tabla salvo el rango
  // de fechas, que en esta vista lo marca el mes.
  const recargarMes = () => {
    const { desde, hasta } = rangoMes(cursor);
    return recordatoriosService.list({ ...filtros, desde, hasta })
      .then(r => setEventosMes((Array.isArray(r) ? r : []).filter(ev => !recordatorioOcultoEnMes(ev))))
      .catch(() => setEventosMes([]));
  };
  useEffect(() => { if (!modoLista) recargarMes(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [modoLista, cursor, filtros]);

  // Refresca la vista activa tras crear/atender/descartar/etc.
  const refrescar = () => { recargar(); if (!modoLista) recargarMes(); };

  const colorRecordatorio = (r) => r.color || CATALOGO_TIPOS_EVENTO.find(x => x.value === r.tipo)?.color || colorPorTipo(r.tipo);
  const itemsPorDia = useMemo(() => {
    const m = {};
    eventosMes.forEach(r => {
      const ymd = ymdLima(new Date(r.fecha_recordatorio));
      (m[ymd] ||= []).push({
        id: r.id,
        color: colorRecordatorio(r),
        titulo: r.titulo,
        subtitulo: vinculoEntidad(r)?.label || undefined,
        title: r.titulo
      });
    });
    return m;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventosMes]);
  const mesLabel = mesLabelLima(cursor);
  const mesLabelCorto = mesLabelCortoLima(cursor);
  const eventosDelDia = useMemo(
    () => (diaSel ? eventosMes.filter(r => ymdLima(new Date(r.fecha_recordatorio)) === diaSel.ymd) : []),
    [diaSel, eventosMes]
  );

  const setF = (k, v) => setFiltros(p => ({ ...p, [k]: v }));

  // «Hoy»: en la tabla acota el rango al día de hoy; en el mes vuelve al actual.
  const irAHoy = () => {
    setCursor(new Date());
    if (modoLista) { const hoy = hoyISO(); setFiltros(f => ({ ...f, desde: hoy, hasta: hoy })); }
  };

  // Un recordatorio es «mío» si es automático (lo rige mi rol) o va dirigido a
  // mí. Los registrados para otra persona solo se editan o eliminan: atenderlos
  // o leerlos le toca a su dueño.
  const esMio = (r) => r.id_usuario_destino == null || r.id_usuario_destino === user?.id;

  // Abrir el registro vinculado cuenta como leer la notificación: se marca al
  // vuelo (optimista) para que el contador de la campana baje sin recargar.
  const marcarLeidoAlAbrir = (r) => {
    if (r.fecha_lectura || !esMio(r)) return;
    recordatoriosService.leer(r.id).catch(() => {});
  };

  const atender = async (r) => {
    try {
      await recordatoriosService.atender(r.id);
      toast.success('Marcado como atendido');
      refrescar();
    } catch (e) { toast.error(e.response?.data?.error || 'Error'); }
  };

  const descartar = async (r) => {
    if (!confirm('¿Descartar este recordatorio?')) return;
    try {
      await recordatoriosService.descartar(r.id);
      toast.success('Descartado');
      refrescar();
    } catch (e) { toast.error(e.response?.data?.error || 'Error'); }
  };

  const reactivar = async (r) => {
    try {
      await recordatoriosService.pendiente(r.id);
      toast.success('Reactivado');
      refrescar();
    } catch (e) { toast.error(e.response?.data?.error || 'Error'); }
  };

  const eliminar = async (r) => {
    if (!confirm('¿Eliminar este recordatorio?')) return;
    try {
      await recordatoriosService.remove(r.id);
      toast.success('Eliminado');
      refrescar();
    } catch (e) { toast.error(e.response?.data?.error || 'Error'); }
  };

  // Acciones de un recordatorio, compartidas por la tabla y el modal del día.
  const acciones = (r) => {
    const pendiente = r.estado_recordatorio === 'pendiente';
    const manual = r.origen === 'manual';
    return (
      <>
        {pendiente && esMio(r) && (
          <>
            <button onClick={() => atender(r)} className="text-xs font-semibold text-emerald-700 hover:underline">Atender</button>
            <button onClick={() => descartar(r)} className="text-xs font-semibold text-slate-500 hover:underline">Descartar</button>
          </>
        )}
        {pendiente && manual && <button onClick={() => setModalForm({ recordatorio: r })} className="text-xs font-semibold text-brand-700 hover:underline">Editar</button>}
        {!pendiente && esMio(r) && <button onClick={() => reactivar(r)} className="text-xs font-semibold text-brand-700 hover:underline">Reactivar</button>}
        {manual && <button onClick={() => eliminar(r)} className="text-xs font-semibold text-rose-700 hover:underline">Eliminar</button>}
      </>
    );
  };

  const enlaceVinculo = (r) => {
    const link = vinculoEntidad(r);
    if (!link) return <span className="text-slate-400">—</span>;
    return <Link to={link.to} onClick={() => marcarLeidoAlAbrir(r)} className="text-brand-700 hover:underline">{link.label}</Link>;
  };

  // En «Mis recordatorios», de quién viene; en «Registrados para otros», para quién es.
  const persona = (r) => {
    if (enviados) return r.usuario_destino?.nombres || '—';
    if (r.origen === 'auto') return <span className="text-slate-400">Automático</span>;
    if (r.registrado_por?.id === user?.id) return 'Yo';
    return r.registrado_por?.nombres || '—';
  };

  const hoy = hoyISO();

  const filaTabla = (r) => (
    <tr key={r.id} className="table-row-hover align-top">
      <td className="table-td text-xs whitespace-nowrap">
        <div>{formatFechaHora(r.fecha_recordatorio)}</div>
        <div className="mt-1">{avisoPlazo(r, hoy)}</div>
      </td>
      <td className="table-td min-w-[240px]">
        <div className="flex items-start gap-2">
          <span className="h-2.5 w-2.5 mt-1.5 rounded-full shrink-0" style={{ background: colorRecordatorio(r) }} />
          <div className="min-w-0">
            <div className="font-medium text-slate-800 text-sm">
              {r.titulo}
              {!r.fecha_lectura && esMio(r) && r.estado_recordatorio === 'pendiente' && (
                <span className="ml-2 text-[10px] font-semibold text-brand-700 uppercase tracking-wider">Sin leer</span>
              )}
            </div>
            {r.descripcion && <div className="text-xs text-slate-600 mt-0.5">{r.descripcion}</div>}
            {r.notas_seguimiento && <div className="text-xs text-slate-600 mt-1 p-2 bg-slate-50 rounded">{r.notas_seguimiento}</div>}
          </div>
        </div>
      </td>
      <td className="table-td">{badgeTipo(r.tipo)}</td>
      <td className="table-td">{badgePrioridad(r.prioridad)}</td>
      <td className="table-td text-xs">{enlaceVinculo(r)}</td>
      <td className="table-td text-xs">{persona(r)}</td>
      <td className="table-td">
        <span className={BADGE_ESTADO[r.estado_recordatorio]?.cls || 'badge-gray'}>
          {BADGE_ESTADO[r.estado_recordatorio]?.label || r.estado_recordatorio}
        </span>
      </td>
      <td className="table-td">
        <div className="flex flex-wrap justify-end gap-x-3 gap-y-1">{acciones(r)}</div>
      </td>
    </tr>
  );

  // Fila compacta para el modal del día (vista Mes), donde no cabe la tabla.
  const filaDia = (r) => (
    <li key={r.id} className="py-3 flex flex-col gap-1.5">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ background: colorRecordatorio(r) }} />
        <span className="font-medium text-slate-800 text-sm">{r.titulo}</span>
        {badgeTipo(r.tipo)}
        {badgePrioridad(r.prioridad)}
      </div>
      {r.descripcion && <div className="text-xs text-slate-600">{r.descripcion}</div>}
      <div className="text-xs text-slate-500 flex items-center gap-3 flex-wrap">
        <span>{formatFechaHora(r.fecha_recordatorio)}</span>
        {vinculoEntidad(r) && enlaceVinculo(r)}
        {enviados && r.usuario_destino && <span>Para {r.usuario_destino.nombres}</span>}
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1">{acciones(r)}</div>
    </li>
  );

  const activos = Object.entries(filtros)
    .filter(([k, v]) => v !== FILTROS_INICIALES[k] && k !== 'hasta')
    .length;

  return (
    <>
      <PageHeader title="Recordatorios" subtitle="Seguimiento de programaciones y pendientes"
        actions={
          <>
            <CalendarioControles
              modoLista={modoLista}
              etiquetaLista="Vista tabla"
              onToggleModo={() => setModoLista(v => !v)}
              onHoy={irAHoy}
              onPrev={() => setCursor(c => { const d = new Date(c); d.setMonth(d.getMonth() - 1); return d; })}
              onNext={() => setCursor(c => { const d = new Date(c); d.setMonth(d.getMonth() + 1); return d; })}
              mesLabel={mesLabel}
              mesLabelCorto={mesLabelCorto}
            />
            <button onClick={() => setModalForm({ recordatorio: null })} className="btn-primary">+ Nuevo recordatorio</button>
          </>
        } />

      <PanelFiltros activos={activos} onLimpiar={() => setFiltros(FILTROS_INICIALES)}>
        <div className="p-3 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <div>
            <label className="label">Mostrar</label>
            <select className="select" value={filtros.vista} onChange={e => setF('vista', e.target.value)}>
              {VISTAS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Buscar</label>
            <input className="input" placeholder="Título, cliente…" value={filtros.q} onChange={e => setF('q', e.target.value)} />
          </div>
          <div>
            <label className="label">Fechas</label>
            {/* En la vista Mes el rango lo marca el mes que se está viendo. */}
            <DateRangePicker
              desde={filtros.desde}
              hasta={filtros.hasta}
              onChange={({ desde, hasta }) => setFiltros(f => ({ ...f, desde, hasta }))}
              placeholder="Desde – hasta"
            />
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
              {tiposFiltro.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
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
      </PanelFiltros>

      {!modoLista ? (
        // Igual que en el Calendario: la cuadrícula del mes necesita siete
        // columnas legibles, así que en pantallas estrechas se desplaza dentro
        // de su caja en vez de comprimirse hasta ser ilegible.
        <div className="overflow-x-auto scroll-thin -mx-4 px-4 sm:mx-0 sm:px-0">
          <div className="min-w-[620px] sm:min-w-0">
            <CalendarioMes cursor={cursor} itemsPorDia={itemsPorDia} onSelectDay={setDiaSel} />
          </div>
        </div>
      ) : loading ? <Loader /> : data.length === 0 ? (
        <div className="card"><EmptyState title="Sin recordatorios" subtitle="No hay recordatorios con los filtros aplicados" /></div>
      ) : (
        // El backend entrega del más reciente al más antiguo.
        <div className="card">
          <div className="overflow-x-auto scroll-thin">
            <table className="table-base">
              <thead><tr>
                <th className="table-th">Fecha</th>
                <th className="table-th">Recordatorio</th>
                <th className="table-th">Tipo</th>
                <th className="table-th">Prioridad</th>
                <th className="table-th">Vinculado a</th>
                <th className="table-th">{enviados ? 'Para' : 'Registrado por'}</th>
                <th className="table-th">Estado</th>
                <th className="table-th text-right">Acciones</th>
              </tr></thead>
              <tbody className="divide-y divide-slate-100">
                {data.map(filaTabla)}
              </tbody>
            </table>
          </div>
          <Pagination page={page} pageSize={pageSize} total={total} totalPages={totalPages}
            onPage={setPage} onPageSize={setPageSize} />
        </div>
      )}

      <Modal
        open={diaSel !== null}
        onClose={() => setDiaSel(null)}
        title={diaSel ? fmtDiaLargo.format(fechaLima(diaSel.ymd)) : ''}
        size="md"
        footer={<button type="button" onClick={() => setDiaSel(null)} className="btn-secondary">Cerrar</button>}
      >
        {eventosDelDia.length === 0 ? (
          <p className="text-sm text-slate-500">Sin recordatorios para este día.</p>
        ) : (
          <ul className="divide-y divide-slate-100">{eventosDelDia.map(filaDia)}</ul>
        )}
      </Modal>

      <RecordatorioFormModal
        open={modalForm !== null}
        recordatorio={modalForm?.recordatorio || null}
        onClose={() => setModalForm(null)}
        onSaved={() => { setModalForm(null); refrescar(); }}
      />
    </>
  );
}
