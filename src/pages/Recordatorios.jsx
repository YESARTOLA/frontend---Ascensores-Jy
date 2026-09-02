import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { recordatoriosService, clientesService, serviciosService, correctivosService, emergenciasService, mantenimientosService, cobrosService } from '../services';
import PageHeader from '../components/common/PageHeader.jsx';
import Loader from '../components/common/Loader.jsx';
import EmptyState from '../components/common/EmptyState.jsx';
import Modal from '../components/common/Modal.jsx';
import Pagination, { usePaginatedList } from '../components/common/Pagination.jsx';
import CalendarioControles from '../components/common/CalendarioControles.jsx';
import CalendarioMes from '../components/common/CalendarioMes.jsx';
import PanelFiltros from '../components/common/PanelFiltros.jsx';
import SeccionColapsable from '../components/common/SeccionColapsable.jsx';
import { useToast } from '../components/common/Toast.jsx';
import { formatFechaHora, nowDateTimeLocalLima, isoToDateTimeLocalLima, dateTimeLocalLimaToISO } from '../utils/formatters.js';
import { CATALOGO_TIPOS_EVENTO, colorPorTipo } from '../utils/visibilidadCalendario.js';
import { rangoMes, ymdLima, mesLabelLima, mesLabelCortoLima, fmtDiaLargo, fechaLima } from '../utils/calendarioFechas.js';
import { estaServicioFinalizado } from '../utils/estadoServicio.js';
import { useAuth } from '../features/auth/AuthContext.jsx';
import { destinoRecordatorio, etiquetaDestinoRecordatorio } from '../utils/destinoRecordatorio.js';

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

// Tipos disponibles para filtrar/etiquetar recordatorios. Se deriva del catálogo
// central (espejado con backend) para que cualquier `tipo` nuevo en BD se
// pinte automáticamente sin hardcodear listas aquí. Incluye 'manual' (creado por
// el usuario). Se excluye 'servicio': ese tipo genérico es redundante con los
// módulos específicos (emergencia, correctivo, mantenimiento, atención rápida),
// que ya son servicios, y sus recordatorios ya no se muestran.
const TIPOS = CATALOGO_TIPOS_EVENTO
  .filter(t => t.value !== 'servicio')
  .map(t => ({ value: t.value, label: t.label, color: t.color }));

// Tipos de proceso que se pueden vincular (opcionalmente) a un recordatorio
// manual. El recordatorio conserva su tipo 'manual'; esto solo enlaza el proceso.
const TIPOS_PROCESO = [
  { value: 'servicio', label: 'Servicio / Proyecto' },
  { value: 'correctivo', label: 'Correctivo' },
  { value: 'emergencia', label: 'Emergencia' },
  { value: 'mantenimiento', label: 'Mantenimiento' },
  // Vincular un cobro exige listarlos: solo para roles con visibilidad
  // financiera (al resto la API de cobros le responde 403).
  { value: 'cobro', label: 'Cobro', finanzas: true }
];

// Fuente de datos por tipo de proceso (cada servicio devuelve un array).
const CARGA_PROCESO = {
  servicio: () => serviciosService.list(),
  correctivo: () => correctivosService.list(),
  emergencia: () => emergenciasService.list(),
  mantenimiento: () => mantenimientosService.list(),
  cobro: () => cobrosService.list()
};

// Normaliza cada registro a { value, label } para el select. `value` es el id
// que se enviará en el campo de vínculo correspondiente (para correctivos es el
// id del servicio vinculado, porque el recordatorio enlaza por id_servicio).
const NORMALIZA_PROCESO = {
  servicio: s => ({ value: String(s.id), label: `${s.codigo || `SRV-${s.id}`}${s.cliente?.nombre ? ` · ${s.cliente.nombre}` : (s.titulo ? ` · ${s.titulo}` : '')}` }),
  correctivo: c => (c.servicio?.id ? { value: String(c.servicio.id), label: `${c.servicio.codigo || `#${c.id}`}${c.falla ? ` · ${c.falla.slice(0, 40)}` : ''}` } : null),
  emergencia: e => ({ value: String(e.id), label: `${e.servicio?.codigo || `#${e.id}`}${e.motivo ? ` · ${e.motivo.slice(0, 40)}` : ''}` }),
  mantenimiento: p => ({ value: String(p.id), label: `${p.cliente?.nombre || 'Plan'} · Plan #${p.id}` }),
  cobro: co => ({ value: String(co.id), label: `Cobro #${co.id}${co.cliente?.nombre ? ` · ${co.cliente.nombre}` : ''}` })
};

async function cargarListaProceso(tipo) {
  const fn = CARGA_PROCESO[tipo];
  if (!fn) return [];
  const arr = await fn();
  return (Array.isArray(arr) ? arr : []).map(NORMALIZA_PROCESO[tipo]).filter(o => o && o.value);
}

// A partir de un recordatorio, deduce el tipo/id de proceso vinculado para
// precargar el selector (correctivo y servicio comparten id_servicio → 'servicio').
function procesoDeRecordatorio(r) {
  if (r.id_emergencia) return { proceso_tipo: 'emergencia', proceso_id: String(r.id_emergencia) };
  if (r.id_mantenimiento_plan) return { proceso_tipo: 'mantenimiento', proceso_id: String(r.id_mantenimiento_plan) };
  if (r.id_cobro) return { proceso_tipo: 'cobro', proceso_id: String(r.id_cobro) };
  if (r.id_servicio) return { proceso_tipo: 'servicio', proceso_id: String(r.id_servicio) };
  return { proceso_tipo: '', proceso_id: '' };
}

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
    prioridad: 'media',
    proceso_tipo: '',
    proceso_id: ''
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

// Destino y etiqueta salen del mismo sitio que la campana y el dashboard
// (utils/destinoRecordatorio.js), para que las tres vistas lleven al mismo lado.
function vinculoEntidad(r) {
  const label = etiquetaDestinoRecordatorio(r);
  if (!label) return null;
  return { to: destinoRecordatorio(r), label };
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
  const { puedeVerPrecio } = useAuth();
  const tiposProceso = useMemo(() => TIPOS_PROCESO.filter(t => !t.finanzas || puedeVerPrecio), [puedeVerPrecio]);
  const [filtros, setFiltros] = useState({ tipo: '', estado_recordatorio: 'pendiente', prioridad: '', id_cliente: '', q: '' });
  const [clientes, setClientes] = useState([]);
  const [modalForm, setModalForm] = useState(null); // null | { form, editId? }
  const [saving, setSaving] = useState(false);
  const [procesosCache, setProcesosCache] = useState({}); // { [tipo]: [{value,label}] }
  const [procesoLoading, setProcesoLoading] = useState(false);
  const toast = useToast();

  // Carga perezosa de la lista de procesos cuando se elige un tipo en el modal.
  const procesoTipoSel = modalForm?.form?.proceso_tipo || '';
  useEffect(() => {
    if (!procesoTipoSel || procesosCache[procesoTipoSel]) return;
    let cancel = false;
    setProcesoLoading(true);
    cargarListaProceso(procesoTipoSel)
      .then(opts => { if (!cancel) setProcesosCache(c => ({ ...c, [procesoTipoSel]: opts })); })
      .catch(() => { if (!cancel) setProcesosCache(c => ({ ...c, [procesoTipoSel]: [] })); })
      .finally(() => { if (!cancel) setProcesoLoading(false); });
    return () => { cancel = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [procesoTipoSel]);

  const { data, loading, total, page, pageSize, totalPages, setPage, setPageSize, recargar } =
    usePaginatedList(recordatoriosService.paginate, filtros, { initialPageSize: 25 });
  const cargar = recargar;

  // Vista Lista (por defecto) vs. vista Mes, reutilizando el calendario visual.
  const [modoLista, setModoLista] = useState(true);
  const [cursor, setCursor] = useState(new Date());
  const [eventosMes, setEventosMes] = useState([]);
  const [diaSel, setDiaSel] = useState(null);
  // En la vista Lista, el botón "Hoy" lleva el grupo de recordatorios de hoy al
  // inicio (por defecto se muestran primero los Vencidos).
  const [hoyPrimero, setHoyPrimero] = useState(false);

  useEffect(() => { clientesService.list().then(setClientes).catch(() => setClientes([])); }, []);

  // La vista Mes trae TODOS los recordatorios del mes (sin `page` el backend no
  // pagina, tope 500), aplicando los mismos filtros que la Lista.
  const recargarMes = () => {
    const { desde, hasta } = rangoMes(cursor);
    return recordatoriosService.list({ ...filtros, desde, hasta })
      .then(r => setEventosMes((Array.isArray(r) ? r : []).filter(ev => !recordatorioOcultoEnMes(ev))))
      .catch(() => setEventosMes([]));
  };
  useEffect(() => { if (!modoLista) recargarMes(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [modoLista, cursor, filtros]);

  // Refresca la vista activa tras crear/atender/descartar/etc.
  const refrescar = () => { cargar(); if (!modoLista) recargarMes(); };

  // La búsqueda (q) y el resto de filtros se resuelven en el servidor; la
  // agrupación por fecha se aplica a la página actual (el backend ordena por
  // fecha_recordatorio asc, así los grupos se mantienen coherentes entre páginas).
  const grupos = useMemo(() => agruparPorFecha(data), [data]);

  // Orden de los grupos en la vista Lista. Con "Hoy" activo, el grupo de hoy va
  // primero; el resto conserva su orden (sort estable). Por defecto: Vencidos primero.
  const gruposOrdenados = useMemo(() => {
    const entries = Object.entries(grupos);
    if (!hoyPrimero) return entries;
    return [...entries].sort((a, b) => (a[0] === 'Hoy' ? -1 : b[0] === 'Hoy' ? 1 : 0));
  }, [grupos, hoyPrimero]);

  const colorRecordatorio = (r) => r.color || TIPOS.find(x => x.value === r.tipo)?.color || colorPorTipo(r.tipo);
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

  const abrirNuevo = () => setModalForm({ form: formInicial() });
  const abrirEdicion = (r) => setModalForm({
    editId: r.id,
    form: {
      titulo: r.titulo,
      descripcion: r.descripcion || '',
      tipo: r.tipo,
      // Mostrar el instante guardado en hora de Lima, no en UTC ni en el huso del navegador.
      fecha_recordatorio: isoToDateTimeLocalLima(r.fecha_recordatorio),
      prioridad: r.prioridad,
      ...procesoDeRecordatorio(r)
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
      // El proceso vinculado (opcional) se traduce al campo de id correspondiente.
      // El recordatorio SIEMPRE se guarda como 'manual' aunque se vincule un proceso.
      const { proceso_tipo, proceso_id, ...rest } = modalForm.form;
      const vinculo = { id_servicio: null, id_emergencia: null, id_mantenimiento_plan: null, id_cobro: null };
      if (proceso_id) {
        const pid = Number(proceso_id);
        if (proceso_tipo === 'servicio' || proceso_tipo === 'correctivo') vinculo.id_servicio = pid;
        else if (proceso_tipo === 'emergencia') vinculo.id_emergencia = pid;
        else if (proceso_tipo === 'mantenimiento') vinculo.id_mantenimiento_plan = pid;
        else if (proceso_tipo === 'cobro') vinculo.id_cobro = pid;
      }
      const payload = {
        ...rest,
        ...vinculo,
        tipo: 'manual',
        fecha_recordatorio: dateTimeLocalLimaToISO(rest.fecha_recordatorio)
      };
      if (modalForm.editId) {
        await recordatoriosService.update(modalForm.editId, payload);
        toast.success('Recordatorio actualizado');
      } else {
        await recordatoriosService.create(payload);
        toast.success('Recordatorio creado');
      }
      cerrarModal();
      refrescar();
    } catch (e) {
      toast.error(e.response?.data?.error || 'Error al guardar');
    } finally { setSaving(false); }
  };

  // Abrir el registro vinculado cuenta como leer la notificación: se marca al
  // vuelo (optimista) para que el contador de la campana baje sin recargar.
  const marcarLeidoAlAbrir = (r) => {
    if (r.fecha_lectura) return;
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

  // Fila de un recordatorio, reutilizada por la vista Lista y por el modal del día (vista Mes).
  const filaRecordatorio = (r) => {
    const link = vinculoEntidad(r);
    return (
      // En móvil las acciones bajan a una fila propia bajo el texto: apiladas a
      // la derecha, sobre una columna de 60px, el título quedaba estrujado y los
      // enlaces salían uno debajo de otro sin ancho para tocarlos.
      <li key={r.id} className="p-4 flex flex-col sm:flex-row items-stretch sm:items-start gap-2 sm:gap-3">
        <div className="flex items-start gap-3 flex-1 min-w-0">
        <div className="h-3 w-3 mt-1.5 rounded-full shrink-0" style={{ background: colorRecordatorio(r) }} />
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
            {link && (
              <Link to={link.to} onClick={() => marcarLeidoAlAbrir(r)} className="text-brand-700 hover:underline">
                {link.label}
              </Link>
            )}
            {!r.fecha_lectura && (
              <span className="text-[10px] font-semibold text-brand-700 uppercase tracking-wider">Sin leer</span>
            )}
          </div>
          {r.notas_seguimiento && (
            <div className="text-xs text-slate-600 mt-2 p-2 bg-slate-50 rounded">{r.notas_seguimiento}</div>
          )}
        </div>
        </div>
        <div className="flex flex-row flex-wrap sm:flex-col gap-x-4 gap-y-1 shrink-0 pl-6 sm:pl-0
                        [&>button]:min-h-[36px] sm:[&>button]:min-h-0">
          {r.estado_recordatorio === 'pendiente' && (
            <>
              <button onClick={() => atender(r)} className="text-xs font-semibold text-emerald-700 hover:underline">Atender</button>
              <button onClick={() => descartar(r)} className="text-xs font-semibold text-slate-500 hover:underline">Descartar</button>
              {r.origen === 'manual' && <button onClick={() => abrirEdicion(r)} className="text-xs font-semibold text-brand-700 hover:underline">Editar</button>}
            </>
          )}
          {r.estado_recordatorio !== 'pendiente' && (
            <button onClick={() => reactivar(r)} className="text-xs font-semibold text-brand-700 hover:underline">Reactivar</button>
          )}
          {r.origen === 'manual' && <button onClick={() => eliminar(r)} className="text-xs font-semibold text-rose-700 hover:underline">Eliminar</button>}
        </div>
      </li>
    );
  };

  return (
    <>
      <PageHeader title="Recordatorios" subtitle="Seguimiento de programaciones y pendientes"
        actions={
          <>
            <CalendarioControles
              modoLista={modoLista}
              onToggleModo={() => setModoLista(v => !v)}
              onHoy={() => { setCursor(new Date()); if (modoLista) setHoyPrimero(true); }}
              onPrev={() => setCursor(c => { const d = new Date(c); d.setMonth(d.getMonth() - 1); return d; })}
              onNext={() => setCursor(c => { const d = new Date(c); d.setMonth(d.getMonth() + 1); return d; })}
              mesLabel={mesLabel}
              mesLabelCorto={mesLabelCorto}
            />
            <button onClick={abrirNuevo} className="btn-primary">+ Nuevo recordatorio</button>
          </>
        } />

      <PanelFiltros
        activos={[filtros.q, filtros.tipo, filtros.prioridad, filtros.id_cliente].filter(Boolean).length
                 + (filtros.estado_recordatorio !== 'pendiente' ? 1 : 0)}
        onLimpiar={() => setFiltros({ tipo: '', estado_recordatorio: 'pendiente', prioridad: '', id_cliente: '', q: '' })}>
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
        <div className="space-y-4">
          {/* Cada grupo se pliega. En móvil llegan abiertos "Vencidos" y "Hoy"
              —lo que hay que atender— y plegados los futuros, que de otro modo
              empujan lo urgente fuera de la primera pantalla. */}
          {gruposOrdenados.map(([titulo, items]) => items.length === 0 ? null : (
            <SeccionColapsable
              key={titulo}
              titulo={titulo}
              cuerpo={false}
              inicialMovil={titulo === 'Vencidos' || titulo === 'Hoy' ? 'abierta' : 'cerrada'}
              resumen={
                <span className={titulo === 'Vencidos' ? 'badge-red' : titulo === 'Hoy' ? 'badge-amber' : 'badge-gray'}>
                  {items.length}
                </span>
              }>
              <ul className="divide-y divide-slate-100">
                {items.map(filaRecordatorio)}
              </ul>
            </SeccionColapsable>
          ))}
          <div className="card">
            <Pagination page={page} pageSize={pageSize} total={total} totalPages={totalPages}
              onPage={setPage} onPageSize={setPageSize} />
          </div>
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
          <ul className="divide-y divide-slate-100">{eventosDelDia.map(filaRecordatorio)}</ul>
        )}
      </Modal>

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
            <div className="border-t border-slate-100 pt-3">
              <label className="label">Proceso vinculado (opcional)</label>
              <div className="grid grid-cols-2 gap-3">
                <select className="select" value={modalForm.form.proceso_tipo}
                  onChange={e => setModalForm(m => ({ ...m, form: { ...m.form, proceso_tipo: e.target.value, proceso_id: '' } }))}>
                  <option value="">— Sin vincular —</option>
                  {tiposProceso.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                </select>
                <select className="select" value={modalForm.form.proceso_id}
                  disabled={!modalForm.form.proceso_tipo || procesoLoading}
                  onChange={e => setModalForm(m => ({ ...m, form: { ...m.form, proceso_id: e.target.value } }))}>
                  <option value="">{procesoLoading ? 'Cargando…' : (modalForm.form.proceso_tipo ? '— Seleccione —' : '—')}</option>
                  {(procesosCache[modalForm.form.proceso_tipo] || []).map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </div>
              <p className="text-xs text-slate-500 mt-1">El recordatorio se mantiene de tipo <b>Manual</b>; vincular un proceso es opcional.</p>
            </div>
          </div>
        )}
      </Modal>
    </>
  );
}
