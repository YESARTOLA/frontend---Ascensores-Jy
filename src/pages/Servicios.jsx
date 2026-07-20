import { useEffect, useMemo, useState, useCallback, useRef } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { serviciosService, clientesService, ascensoresService, tiposServicioService, edificiosService } from '../services';
import PageHeader from '../components/common/PageHeader.jsx';
import Loader from '../components/common/Loader.jsx';
import Modal from '../components/common/Modal.jsx';
import EmptyState from '../components/common/EmptyState.jsx';
import Pagination, { usePaginatedList } from '../components/common/Pagination.jsx';
import { useToast } from '../components/common/Toast.jsx';
import { useAuth } from '../features/auth/AuthContext.jsx';
import ClienteAutocomplete from '../components/common/ClienteAutocomplete.jsx';
import { badgeEstado, formatFecha, formatMonto, hoyISO, toYMDLima, nombreEdificioDeAscensores } from '../utils/formatters.js';
import { ESTADOS_SERVICIO, esServicioEditable } from '../utils/estadoServicio.js';
import { esAscensorServiciable } from '../utils/ascensoresSeleccion.js';

const ESTADOS_FILTRO = ['', ...ESTADOS_SERVICIO];
const FORM_ID = 'form-servicio';

// Fila de ascensor del proyecto: existente (id_ascensor) o nuevo a instalar
// (ascensor_nuevo en un edificio del cliente). Misma forma que en Cotizaciones,
// para homogeneizar la creación de proyectos con y sin cotización.
const ascensorFilaVacia = () => ({
  modo: 'existente',
  id_ascensor: '',
  ascensor_nuevo: { id_edificio: '', ubicacion: '', pisos: '', capacidad: '', marca: '', modelo: '', descripcion: '' }
});

// Reparte un precio total en partes iguales al centavo entre n ascensores; el
// último absorbe el sobrante (espejo de repartirParejo del backend). Solo se usa
// al EDITAR, para mandar un monto por ascensor que sume exactamente el total.
function repartirPrecio(total, n) {
  if (!n || n <= 0) return [];
  const cents = Math.round(Number(total || 0) * 100);
  const base = Math.floor(cents / n);
  return Array.from({ length: n }, (_, i) => (base + (i === n - 1 ? cents - base * n : 0)) / 100);
}

// Módulo Proyectos: aquí solo se crean/listan registros de tipo PROYECTO. La
// clasificación (tipo_registro='proyecto') la deriva el backend del subtipo
// seleccionado (cuyo padre es de categoría funcional PROYECTOS).
const inicial = {
  id_tipo_servicio: '', id_cliente: '',
  ascensores: [ascensorFilaVacia()],
  titulo: '', descripcion: '',
  fecha_programada: hoyISO(), hora_programada: '09:00', duracion_dias: 1, prioridad: 'media',
  precio_interno: '', moneda: 'PEN', observaciones: '',
  es_borrador: false
};

function listarCodigosAscensores(servicio) {
  return (servicio?.ascensores || [])
    .map(a => a.ascensor?.codigo)
    .filter(Boolean);
}

// Filas de ascensor válidas (existente con id o nuevo con edificio).
function filasAscensorValidas(form) {
  return (form.ascensores || []).filter(a =>
    (a.modo === 'existente' && a.id_ascensor) ||
    (a.modo === 'nuevo' && a.ascensor_nuevo?.id_edificio)
  );
}

// Payload para CREAR: precio global + ascensores existentes y/o nuevos (el
// backend crea los nuevos como "Por instalar" y reparte el precio).
function formToPayloadCrear(form) {
  const ascensores = filasAscensorValidas(form).map(a => a.modo === 'existente'
    ? { id_ascensor: Number(a.id_ascensor) }
    : {
        ascensor_nuevo: {
          id_edificio: Number(a.ascensor_nuevo.id_edificio),
          ubicacion: a.ascensor_nuevo.ubicacion || null,
          pisos: a.ascensor_nuevo.pisos ? Number(a.ascensor_nuevo.pisos) : null,
          capacidad: a.ascensor_nuevo.capacidad || null,
          marca: a.ascensor_nuevo.marca || null,
          modelo: a.ascensor_nuevo.modelo || null,
          descripcion: a.ascensor_nuevo.descripcion || null
        }
      });
  return {
    id_tipo_servicio: form.id_tipo_servicio,
    id_cliente: form.id_cliente,
    titulo: form.titulo, descripcion: form.descripcion,
    fecha_programada: form.fecha_programada, hora_programada: form.hora_programada,
    duracion_dias: Math.max(1, parseInt(form.duracion_dias, 10) || 1),
    prioridad: form.prioridad,
    precio_interno: Number(form.precio_interno), moneda: form.moneda,
    observaciones: form.observaciones, es_borrador: form.es_borrador,
    ascensores
  };
}

// Payload para EDITAR: al editar solo se manejan ascensores existentes; el precio
// global se reparte en partes iguales entre ellos (el backend valida que sume).
function formToPayloadEditar(form) {
  const ids = filasAscensorValidas(form)
    .filter(a => a.modo === 'existente')
    .map(a => Number(a.id_ascensor));
  const montos = repartirPrecio(form.precio_interno, ids.length);
  return {
    id_tipo_servicio: form.id_tipo_servicio,
    id_cliente: form.id_cliente,
    titulo: form.titulo, descripcion: form.descripcion,
    fecha_programada: form.fecha_programada, hora_programada: form.hora_programada,
    prioridad: form.prioridad,
    precio_interno: Number(form.precio_interno), moneda: form.moneda,
    observaciones: form.observaciones,
    ascensores: ids.map((id, i) => ({ id_ascensor: id, monto: montos[i] }))
  };
}

function servicioToForm(s) {
  // Al editar, cada ascensor asociado se muestra como fila "existente".
  const filas = (s.ascensores || [])
    .filter(sa => sa.ascensor && sa.estado !== 0)
    .map(sa => ({ ...ascensorFilaVacia(), modo: 'existente', id_ascensor: String(sa.ascensor.id) }));
  return {
    id_tipo_servicio: String(s.id_tipo_servicio || ''),
    id_cliente: String(s.id_cliente || ''),
    ascensores: filas.length ? filas : [ascensorFilaVacia()],
    titulo: s.titulo || '',
    descripcion: s.descripcion || '',
    fecha_programada: toYMDLima(s.fecha_programada) || hoyISO(),
    hora_programada: s.hora_programada || '09:00',
    duracion_dias: s.duracion_dias || 1,
    prioridad: s.prioridad || 'media',
    precio_interno: s.precio_interno != null ? String(s.precio_interno) : '',
    moneda: s.moneda || 'PEN',
    observaciones: s.observaciones || '',
    es_borrador: s.estado_servicio === 'Borrador'
  };
}

export default function Servicios() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [clientes, setClientes] = useState([]);
  const [ascensores, setAscensores] = useState([]);
  const [edificios, setEdificios] = useState([]);
  const [tipos, setTipos] = useState([]);
  // Módulo Proyectos: el backend filtra por tipo_registro='proyecto' (fuente de
  // verdad), nunca se mezclan servicios operativos en este listado.
  const [filtros, setFiltros] = useState({ q: '', estado_servicio: '', tipo_registro: 'proyecto', id_tipo_servicio: '', desde: '', hasta: '' });
  const [open, setOpen] = useState(false);
  const [editando, setEditando] = useState(null); // null = crear, id = editar
  const [form, setForm] = useState(inicial);
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  const { esSuperAdmin, esAdmin, puedeVerPrecio } = useAuth();
  const puedeCrear = esSuperAdmin || esAdmin;
  const puedeEditar = esSuperAdmin || esAdmin;
  // Eliminar un proyecto queda restringido al superadministrador.
  const puedeEliminar = esSuperAdmin;
  const toast = useToast();

  const { data, loading, total, page, pageSize, totalPages, setPage, setPageSize, recargar } =
    usePaginatedList(serviciosService.paginate, filtros, { initialPageSize: 25 });

  useEffect(() => {
    Promise.all([clientesService.list(), ascensoresService.list(), tiposServicioService.list(), edificiosService.list()])
      .then(([cs, as, ts, eds]) => { setClientes(cs); setAscensores(as); setTipos(ts); setEdificios(eds); });
  }, []);

  const cargar = recargar;

  const abrirNuevo = useCallback(() => {
    setEditando(null);
    setForm(inicial);
    setOpen(true);
  }, []);

  const abrirEditar = useCallback(async (servicio) => {
    if (!puedeEditar) return;
    if (!esServicioEditable(servicio.estado_servicio)) {
      toast.error(`No se puede editar un servicio en estado "${servicio.estado_servicio}".`);
      return;
    }
    try {
      // Recargar versión fresca y completa (con todos los ascensores activos)
      const completo = await serviciosService.get(servicio.id);
      setEditando(completo.id);
      setForm(servicioToForm(completo));
      setOpen(true);
    } catch (err) {
      toast.error(err.response?.data?.error || 'No se pudo cargar el servicio');
    }
  }, [puedeEditar, toast]);

  // Soporte ?edit=ID en la URL (ej. desde ServicioDetalle.jsx)
  useEffect(() => {
    const editId = searchParams.get('edit');
    if (!editId || !puedeEditar) return;
    serviciosService.get(Number(editId)).then(completo => {
      if (!esServicioEditable(completo.estado_servicio)) {
        toast.error(`No se puede editar un servicio en estado "${completo.estado_servicio}".`);
        const next = new URLSearchParams(searchParams);
        next.delete('edit');
        setSearchParams(next, { replace: true });
        return;
      }
      setEditando(completo.id);
      setForm(servicioToForm(completo));
      setOpen(true);
    }).catch(err => {
      toast.error(err.response?.data?.error || 'Servicio no encontrado');
      const next = new URLSearchParams(searchParams);
      next.delete('edit');
      setSearchParams(next, { replace: true });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams.get('edit'), puedeEditar]);

  const cerrar = useCallback(() => {
    if (savingRef.current) return;
    setOpen(false);
    setEditando(null);
    setForm(inicial);
    if (searchParams.get('edit')) {
      const next = new URLSearchParams(searchParams);
      next.delete('edit');
      setSearchParams(next, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  const ascensoresFiltrados = useMemo(
    () => form.id_cliente
      ? ascensores.filter(a => String(a.edificio?.cliente?.id) === String(form.id_cliente) && esAscensorServiciable(a))
      : [],
    [ascensores, form.id_cliente]
  );

  // Edificios del cliente elegido (para instalar un ascensor nuevo).
  const edificiosCliente = useMemo(
    () => form.id_cliente ? edificios.filter(e => String(e.id_cliente) === String(form.id_cliente)) : [],
    [edificios, form.id_cliente]
  );

  // Subtipos seleccionables en el módulo Proyectos: solo subtipos cuyo padre es
  // de categoría funcional PROYECTOS (descriptivos). No se ofrecen subtipos de
  // Servicios operativos: esos se gestionan desde sus propios módulos.
  const subtiposProyecto = useMemo(
    () => tipos.filter(t => !t.es_padre && t.categoria_funcional === 'PROYECTOS'),
    [tipos]
  );

  // El proyecto se guarda con UN precio global (lo pone el usuario) que cubre a
  // uno o varios ascensores. Válido si hay al menos un ascensor y precio >= 0.
  const filasValidas = filasAscensorValidas(form);
  const precioValido = form.precio_interno !== '' && Number(form.precio_interno) >= 0;
  const formOk = filasValidas.length > 0 && precioValido;

  const cambiarCliente = (id_cliente) => {
    // Cambiar de cliente invalida los ascensores/edificios ya elegidos.
    setForm(f => ({ ...f, id_cliente, ascensores: [ascensorFilaVacia()] }));
  };

  const cambiarSubtipo = (id_tipo_servicio) => {
    setForm(f => ({ ...f, id_tipo_servicio }));
  };

  const labelCampoCliente = 'Cliente';

  // Handlers de las filas de ascensor (existente / nuevo).
  const agregarAscensor = () => setForm(f => ({ ...f, ascensores: [...f.ascensores, ascensorFilaVacia()] }));
  const quitarAscensor = (idx) => setForm(f => ({
    ...f,
    ascensores: f.ascensores.length > 1 ? f.ascensores.filter((_, i) => i !== idx) : f.ascensores
  }));
  const cambiarAscensor = (idx, key, val) => setForm(f => ({
    ...f,
    ascensores: f.ascensores.map((a, i) => i === idx ? { ...a, [key]: val } : a)
  }));
  const cambiarAscensorNuevo = (idx, key, val) => setForm(f => ({
    ...f,
    ascensores: f.ascensores.map((a, i) => i === idx ? { ...a, ascensor_nuevo: { ...a.ascensor_nuevo, [key]: val } } : a)
  }));

  const guardar = async (e) => {
    e.preventDefault();
    if (savingRef.current) return;
    if (!form.id_cliente) { toast.error('Seleccione un cliente'); return; }
    if (!form.id_tipo_servicio) { toast.error('Seleccione el subtipo de servicio'); return; }
    if (filasValidas.length === 0) { toast.error('Indique al menos un ascensor (existente o nuevo)'); return; }
    if (!precioValido) { toast.error('Ingrese el precio del proyecto'); return; }
    savingRef.current = true;
    setSaving(true);
    try {
      if (editando) {
        await serviciosService.update(editando, formToPayloadEditar(form));
        toast.success('Proyecto actualizado');
      } else {
        await serviciosService.create(formToPayloadCrear(form));
        toast.success('Proyecto creado');
      }
      savingRef.current = false;
      cerrar();
      cargar();
    } catch (err) {
      toast.error(err.response?.data?.error || (editando ? 'Error al actualizar' : 'Error al crear'));
    } finally {
      setSaving(false);
      savingRef.current = false;
    }
  };

  const eliminar = async (s) => {
    if (!window.confirm(`¿Eliminar el proyecto ${s.codigo}${s.titulo ? ` — ${s.titulo}` : ''}? Se dará de baja junto con su evento de calendario y folder contable.`)) return;
    try {
      await serviciosService.remove(s.id);
      toast.success('Proyecto eliminado');
      cargar();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Error al eliminar');
    }
  };

  const esEdicion = !!editando;
  const tituloModal = esEdicion ? 'Editar proyecto' : 'Nuevo proyecto';
  const labelGuardar = saving
    ? (esEdicion ? 'Guardando…' : 'Creando…')
    : (esEdicion ? 'Guardar cambios' : 'Crear');

  return (
    <>
      <PageHeader title="Proyectos" subtitle={`${data.length} proyecto(s)`} actions={
        puedeCrear && <button onClick={abrirNuevo} className="btn-primary">+ Nuevo proyecto</button>
      } />

      <div className="card mb-4">
        <div className="p-4 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
          <input className="input col-span-2" placeholder="Buscar por código, título, cliente, edificio/obra, tipo de ascensor o cotización…" value={filtros.q} onChange={e => setFiltros(f => ({ ...f, q: e.target.value }))} />
          <select className="select" value={filtros.estado_servicio} onChange={e => setFiltros(f => ({ ...f, estado_servicio: e.target.value }))}>
            {ESTADOS_FILTRO.map(s => <option key={s} value={s}>{s || 'Todos los estados'}</option>)}
          </select>
          <select className="select" value={filtros.id_tipo_servicio} onChange={e => setFiltros(f => ({ ...f, id_tipo_servicio: e.target.value }))}>
            <option value="">Todos los subtipos</option>
            {subtiposProyecto.map(t => <option key={t.id} value={t.id}>{t.nombre}</option>)}
          </select>
          <input type="date" className="input" value={filtros.desde} onChange={e => setFiltros(f => ({ ...f, desde: e.target.value }))} />
          <input type="date" className="input" value={filtros.hasta} onChange={e => setFiltros(f => ({ ...f, hasta: e.target.value }))} />
        </div>
      </div>

      <div className="card">
        {loading ? <Loader /> : data.length === 0 ? <EmptyState title="Sin proyectos" /> : (
          <>
            <div className="hidden md:block overflow-x-auto scroll-thin">
              <table className="table-base">
                <thead><tr>
                  <th className="table-th">Código</th><th className="table-th">Título</th><th className="table-th">Tipo</th>
                  <th className="table-th">Edificio-Obra / Ascensores</th><th className="table-th">Tipo servicio</th>
                  <th className="table-th">Fecha</th><th className="table-th">Técnicos</th>
                  <th className="table-th">Estado</th>{puedeVerPrecio && <th className="table-th text-right">Precio</th>}
                  <th className="table-th text-right">Acciones</th>
                </tr></thead>
                <tbody className="divide-y divide-slate-100">
                  {data.map(s => {
                    const codigos = listarCodigosAscensores(s);
                    const ascResumen = codigos.length === 0 ? '—'
                      : codigos.length === 1 ? codigos[0]
                      : `${codigos[0]} (+${codigos.length - 1})`;
                    const editable = puedeEditar && esServicioEditable(s.estado_servicio);
                    return (
                      <tr key={s.id} className="table-row-hover">
                        <td className="table-td"><Link to={`/servicios/${s.id}`} className="font-mono text-xs text-brand-700 hover:underline">{s.codigo}</Link></td>
                        <td className="table-td text-sm max-w-[240px] truncate" title={s.titulo || ''}>{s.titulo || '—'}</td>
                        <td className="table-td text-xs">{s.tipo_registro}</td>
                        <td className="table-td">
                          <div className="text-sm">{nombreEdificioDeAscensores(s) || '—'}</div>
                          <div className="text-xs text-slate-500 font-mono" title={codigos.join(', ')}>{ascResumen}</div>
                        </td>
                        <td className="table-td text-xs">{s.tipo_servicio?.nombre}</td>
                        <td className="table-td text-xs">{formatFecha(s.fecha_programada)} {s.hora_programada || ''}</td>
                        <td className="table-td text-xs">{s.asignaciones?.length > 0 ? s.asignaciones.map(a => a.tecnico?.nombre).join(', ') : <span className="text-rose-500">Sin asignar</span>}</td>
                        <td className="table-td"><span className={badgeEstado(s.estado_servicio)}>{s.estado_servicio}</span></td>
                        {puedeVerPrecio && <td className="table-td text-right font-mono text-sm">{formatMonto(s.precio_interno, s.moneda)}</td>}
                        <td className="table-td text-right whitespace-nowrap">
                          <Link to={`/servicios/${s.id}`} className="text-brand-700 text-xs hover:underline">Ver</Link>
                          {editable && (
                            <>
                              <span className="text-slate-300 mx-1.5">·</span>
                              <button
                                type="button"
                                onClick={() => abrirEditar(s)}
                                className="text-brand-700 text-xs hover:underline"
                              >Editar</button>
                            </>
                          )}
                          {puedeEliminar && (
                            <>
                              <span className="text-slate-300 mx-1.5">·</span>
                              <button
                                type="button"
                                onClick={() => eliminar(s)}
                                className="text-rose-600 text-xs hover:underline"
                              >Eliminar</button>
                            </>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="md:hidden divide-y divide-slate-100">
              {data.map(s => {
                const codigos = listarCodigosAscensores(s);
                const ascResumen = codigos.length === 0 ? '—'
                  : codigos.length === 1 ? codigos[0]
                  : `${codigos[0]} (+${codigos.length - 1})`;
                const editable = puedeEditar && esServicioEditable(s.estado_servicio);
                return (
                  <div key={s.id} className="p-4">
                    <Link to={`/servicios/${s.id}`} className="block hover:bg-slate-50/70 transition -m-2 p-2 rounded">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <div className="font-mono text-xs text-brand-700">{s.codigo}</div>
                          <div className="font-medium text-slate-800 text-sm mt-0.5">{s.titulo}</div>
                          <div className="text-xs text-slate-500 mt-0.5">{nombreEdificioDeAscensores(s)} · {ascResumen}</div>
                        </div>
                        <span className={badgeEstado(s.estado_servicio)}>{s.estado_servicio}</span>
                      </div>
                      <div className="mt-2 text-xs text-slate-500 flex items-center justify-between">
                        <span>{formatFecha(s.fecha_programada)} {s.hora_programada || ''}</span>
                        {puedeVerPrecio && <span className="font-mono">{formatMonto(s.precio_interno, s.moneda)}</span>}
                      </div>
                    </Link>
                    {(editable || puedeEliminar) && (
                      <div className="mt-2 text-right space-x-3">
                        {editable && (
                          <button
                            type="button"
                            onClick={() => abrirEditar(s)}
                            className="text-brand-700 text-xs hover:underline"
                          >Editar</button>
                        )}
                        {puedeEliminar && (
                          <button
                            type="button"
                            onClick={() => eliminar(s)}
                            className="text-rose-600 text-xs hover:underline"
                          >Eliminar</button>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
            <Pagination page={page} pageSize={pageSize} total={total} totalPages={totalPages}
              onPage={setPage} onPageSize={setPageSize} />
          </>
        )}
      </div>

      <Modal open={open} onClose={cerrar} title={tituloModal} size="lg"
        footer={<><button type="button" className="btn-secondary" onClick={cerrar} disabled={saving}>Cancelar</button><button type="submit" form={FORM_ID} className="btn-primary" disabled={saving || !formOk}>{labelGuardar}</button></>}>
        {!esEdicion && (
          <div className="mb-3 rounded-lg border border-amber-200 bg-amber-50 text-amber-900 text-xs p-3 flex items-start gap-2">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="shrink-0 mt-0.5"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="13"/><circle cx="12" cy="16.5" r="0.5"/></svg>
            <div>
              Para proyectos con trazabilidad comercial es preferible iniciar con una <Link to="/cotizaciones" className="font-semibold underline">cotización</Link>; al aprobarse se generará el proyecto automáticamente con su monto. Los servicios operativos (emergencias, correctivos, mantenimientos, atención rápida) se gestionan desde sus propios módulos.
            </div>
          </div>
        )}
        <form id={FORM_ID} onSubmit={guardar} className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="sm:col-span-2">
            <label className="label">Subtipo de proyecto *</label>
            <select className="select" required value={form.id_tipo_servicio} onChange={e => cambiarSubtipo(e.target.value)}>
              <option value="">— Seleccione —</option>
              {subtiposProyecto.map(t => <option key={t.id} value={t.id}>{t.padre?.nombre ? `${t.padre.nombre} · ` : ''}{t.nombre}</option>)}
            </select>
            {subtiposProyecto.length === 0 && (
              <p className="text-[11px] text-amber-700 mt-0.5">No hay subtipos de Proyectos. Créelos en <Link to="/tipos-servicio" className="underline">Tipos de servicio</Link>.</p>
            )}
          </div>
          <div className="sm:col-span-2">
            <label className="label">{labelCampoCliente} *</label>
            <ClienteAutocomplete
              clientes={clientes}
              value={form.id_cliente}
              onChange={cambiarCliente}
              required
              placeholder="Escriba para buscar por nombre de edificio / obra…"
            />
          </div>

          <div className="sm:col-span-2">
            <div className="flex items-center justify-between">
              <label className="label">Ascensores *</label>
              {!esEdicion && <button type="button" onClick={agregarAscensor} className="text-xs text-brand-700 hover:underline" disabled={!form.id_cliente}>+ Agregar ascensor</button>}
            </div>
            {!form.id_cliente ? (
              <div className="rounded-lg border border-slate-200 bg-slate-50 text-slate-500 text-xs p-3">Seleccione primero un cliente.</div>
            ) : (
              <div className="space-y-3">
                {form.ascensores.map((a, idx) => (
                  <div key={idx} className="rounded-lg ring-1 ring-slate-200 p-3 space-y-2">
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-4 text-xs">
                        <label className="inline-flex items-center gap-1.5 cursor-pointer">
                          <input type="radio" name={`asc_modo_${idx}`} checked={a.modo === 'existente'}
                            onChange={() => cambiarAscensor(idx, 'modo', 'existente')} disabled={esEdicion} />
                          Ascensor existente
                        </label>
                        <label className={`inline-flex items-center gap-1.5 ${esEdicion ? 'opacity-40 cursor-default' : 'cursor-pointer'}`}>
                          <input type="radio" name={`asc_modo_${idx}`} checked={a.modo === 'nuevo'}
                            onChange={() => cambiarAscensor(idx, 'modo', 'nuevo')} disabled={esEdicion} />
                          Nuevo (a instalar)
                        </label>
                      </div>
                      {!esEdicion && form.ascensores.length > 1 && (
                        <button type="button" onClick={() => quitarAscensor(idx)} className="text-xs text-rose-600 hover:underline shrink-0">Quitar</button>
                      )}
                    </div>

                    {a.modo === 'existente' ? (
                      <select className="select" value={a.id_ascensor} onChange={e => cambiarAscensor(idx, 'id_ascensor', e.target.value)}>
                        <option value="">— Seleccione un ascensor —</option>
                        {ascensoresFiltrados.map(as => (
                          <option key={as.id} value={as.id}>{as.codigo}{as.edificio?.nombre ? ` · ${as.edificio.nombre}` : ''}{as.ubicacion ? ` · ${as.ubicacion}` : ''}</option>
                        ))}
                      </select>
                    ) : (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        <select className="select sm:col-span-2" value={a.ascensor_nuevo.id_edificio} onChange={e => cambiarAscensorNuevo(idx, 'id_edificio', e.target.value)}>
                          <option value="">— Edificio / obra donde se instalará —</option>
                          {edificiosCliente.map(ed => <option key={ed.id} value={ed.id}>{ed.nombre}{ed.distrito ? ` · ${ed.distrito}` : ''}</option>)}
                        </select>
                        <input className="input" placeholder="Ubicación (piso / zona)" value={a.ascensor_nuevo.ubicacion} onChange={e => cambiarAscensorNuevo(idx, 'ubicacion', e.target.value)} />
                        <input className="input" type="number" placeholder="Pisos" value={a.ascensor_nuevo.pisos} onChange={e => cambiarAscensorNuevo(idx, 'pisos', e.target.value)} />
                        <input className="input" placeholder="Capacidad (kg / personas)" value={a.ascensor_nuevo.capacidad} onChange={e => cambiarAscensorNuevo(idx, 'capacidad', e.target.value)} />
                        <input className="input" placeholder="Marca" value={a.ascensor_nuevo.marca} onChange={e => cambiarAscensorNuevo(idx, 'marca', e.target.value)} />
                        <input className="input" placeholder="Modelo" value={a.ascensor_nuevo.modelo} onChange={e => cambiarAscensorNuevo(idx, 'modelo', e.target.value)} />
                        <input className="input sm:col-span-2" placeholder="Descripción" value={a.ascensor_nuevo.descripcion} onChange={e => cambiarAscensorNuevo(idx, 'descripcion', e.target.value)} />
                      </div>
                    )}
                  </div>
                ))}
                {esEdicion && <p className="text-[11px] text-slate-500">Para instalar un ascensor nuevo, créalo desde un proyecto nuevo o una cotización.</p>}
              </div>
            )}
          </div>

          <div className="sm:col-span-2"><label className="label">Título *</label><input className="input" required value={form.titulo} onChange={e => setForm(f => ({ ...f, titulo: e.target.value }))} /></div>
          <div className="sm:col-span-2"><label className="label">Descripción</label><textarea className="textarea" rows="2" value={form.descripcion} onChange={e => setForm(f => ({ ...f, descripcion: e.target.value }))} /></div>
          <div><label className="label">Fecha *</label><input type="date" className="input" required value={form.fecha_programada} onChange={e => setForm(f => ({ ...f, fecha_programada: e.target.value }))} /></div>
          <div><label className="label">Hora</label><input type="time" className="input" value={form.hora_programada} onChange={e => setForm(f => ({ ...f, hora_programada: e.target.value }))} /></div>
          <div>
            <label className="label">Duración (días)</label>
            <input type="number" min="1" step="1" className="input" value={form.duracion_dias}
              onChange={e => setForm(f => ({ ...f, duracion_dias: e.target.value }))} />
            <p className="text-[11px] text-slate-500 mt-0.5">
              {Number(form.duracion_dias) > 1
                ? `Días corridos desde la fecha. El técnico verá ${form.duracion_dias} días en su agenda y subirá evidencia cada día.`
                : 'Un solo día.'}
            </p>
          </div>
          <div>
            <label className="label">Prioridad</label>
            <select className="select" value={form.prioridad} onChange={e => setForm(f => ({ ...f, prioridad: e.target.value }))}>
              <option value="baja">Baja</option><option value="media">Media</option><option value="alta">Alta</option>
            </select>
          </div>
          <div>
            <label className="label">Precio del proyecto *</label>
            <div className="flex gap-2">
              <select className="select w-24" value={form.moneda} onChange={e => setForm(f => ({ ...f, moneda: e.target.value }))}>
                <option value="PEN">PEN</option><option value="USD">USD</option>
              </select>
              <input className="input flex-1" type="number" step="0.01" min="0" required placeholder="0.00"
                value={form.precio_interno} onChange={e => setForm(f => ({ ...f, precio_interno: e.target.value }))} />
            </div>
            <p className="text-[11px] text-slate-500 mt-1">Precio global del proyecto; cubre {filasValidas.length || 1} ascensor(es).</p>
          </div>
          <div className="hidden sm:block" />

          <div className="sm:col-span-2"><label className="label">Observaciones</label><textarea className="textarea" rows="2" value={form.observaciones} onChange={e => setForm(f => ({ ...f, observaciones: e.target.value }))} /></div>
          {!esEdicion && (
            <div className="sm:col-span-2">
              <label className="flex items-center gap-2 text-sm text-slate-700 bg-slate-50 ring-1 ring-slate-200 rounded-md p-3 cursor-pointer">
                <input type="checkbox" checked={form.es_borrador} onChange={e => setForm(f => ({ ...f, es_borrador: e.target.checked }))} />
                <span>Guardar como <strong>Borrador</strong> — no se programa en calendario ni se notifica hasta promoverlo.</span>
              </label>
            </div>
          )}
        </form>
      </Modal>
    </>
  );
}
