import { useEffect, useMemo, useState, useCallback, useRef } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { serviciosService, clientesService, ascensoresService, tiposServicioService } from '../services';
import PageHeader from '../components/common/PageHeader.jsx';
import Loader from '../components/common/Loader.jsx';
import Modal from '../components/common/Modal.jsx';
import EmptyState from '../components/common/EmptyState.jsx';
import Pagination, { usePaginatedList } from '../components/common/Pagination.jsx';
import { useToast } from '../components/common/Toast.jsx';
import { useAuth } from '../features/auth/AuthContext.jsx';
import { badgeEstado, formatFecha, formatMonto, hoyISO, toYMDLima } from '../utils/formatters.js';
import { ESTADOS_SERVICIO, esServicioEditable } from '../utils/estadoServicio.js';

const ESTADOS_FILTRO = ['', ...ESTADOS_SERVICIO];
const TOLERANCIA_SUMA = 0.01;
const FORM_ID = 'form-servicio';

const inicial = {
  tipo_registro: 'servicio',
  id_tipo_servicio: '', id_cliente: '',
  ascensores_seleccion: {}, // { [id_ascensor]: { monto: string, manual: bool } }
  titulo: '', descripcion: '',
  fecha_programada: hoyISO(), hora_programada: '09:00', prioridad: 'media',
  precio_interno: '', moneda: 'PEN', observaciones: '',
  es_borrador: false,
  // Campos extra según modulo_asociado del tipo elegido. Solo se envían los
  // del módulo activo; el backend ignora el resto.
  motivo: '', falla: '', nivel_urgencia: '',
  tipo_plan: 'ciclico', frecuencia: 'mensual', frecuencia_dias_custom: '',
  cantidad_mantenimientos: '', cantidad_mantenimientos_gratuitos: 0,
  fecha_inicio_plan: '',
  nombre_contacto: '', telefono: '', mensaje_rapido: '', tipo_solicitud: ''
};

function listarCodigosAscensores(servicio) {
  return (servicio?.ascensores || [])
    .map(a => a.ascensor?.codigo)
    .filter(Boolean);
}

function repartirParejo(total, n) {
  if (n === 0) return [];
  const totalCentavos = Math.round(Number(total || 0) * 100);
  const base = Math.floor(totalCentavos / n);
  const sobra = totalCentavos - base * n;
  return Array.from({ length: n }, (_, i) => ((base + (i === n - 1 ? sobra : 0)) / 100).toFixed(2));
}

function formToPayload(form, ascensoresSeleccionados, modulo) {
  const base = {
    tipo_registro: form.tipo_registro,
    id_tipo_servicio: form.id_tipo_servicio,
    id_cliente: form.id_cliente,
    titulo: form.titulo, descripcion: form.descripcion,
    fecha_programada: form.fecha_programada, hora_programada: form.hora_programada,
    prioridad: form.prioridad,
    precio_interno: form.precio_interno, moneda: form.moneda,
    observaciones: form.observaciones, es_borrador: form.es_borrador,
    ascensores: ascensoresSeleccionados.map(a => ({
      id_ascensor: a.id,
      monto: Number(form.ascensores_seleccion[a.id]?.monto || 0)
    }))
  };
  if (modulo === 'emergencia') {
    base.motivo = form.motivo || form.descripcion || form.titulo;
    base.nivel_urgencia = form.nivel_urgencia || 'alta';
  } else if (modulo === 'correctivo') {
    base.falla = form.falla || form.descripcion || form.titulo;
    base.nivel_urgencia = form.nivel_urgencia || 'media';
  } else if (modulo === 'mantenimiento') {
    base.tipo_plan = form.tipo_plan;
    base.frecuencia = form.tipo_plan === 'eventual' ? null : form.frecuencia;
    if (form.frecuencia === 'personalizada' && form.frecuencia_dias_custom) {
      base.frecuencia_dias_custom = Number(form.frecuencia_dias_custom);
    }
    if (form.cantidad_mantenimientos) {
      base.cantidad_mantenimientos = Number(form.cantidad_mantenimientos);
    }
    base.cantidad_mantenimientos_gratuitos = Number(form.cantidad_mantenimientos_gratuitos) || 0;
    base.fecha_inicio_plan = form.fecha_inicio_plan || form.fecha_programada;
  } else if (modulo === 'atencion_rapida') {
    base.nombre_contacto = form.nombre_contacto;
    base.telefono = form.telefono;
    base.mensaje_rapido = form.mensaje_rapido || null;
    base.tipo_solicitud = form.tipo_solicitud || null;
    base.nivel_urgencia = form.nivel_urgencia || 'media';
  }
  return base;
}

function servicioToForm(s) {
  const ascensores_seleccion = {};
  (s.ascensores || []).forEach(sa => {
    if (sa.ascensor && sa.estado !== 0) {
      ascensores_seleccion[sa.ascensor.id] = {
        monto: Number(sa.monto || 0).toFixed(2),
        manual: true
      };
    }
  });
  return {
    tipo_registro: s.tipo_registro || 'servicio',
    id_tipo_servicio: String(s.id_tipo_servicio || ''),
    id_cliente: String(s.id_cliente || ''),
    ascensores_seleccion,
    titulo: s.titulo || '',
    descripcion: s.descripcion || '',
    fecha_programada: toYMDLima(s.fecha_programada) || hoyISO(),
    hora_programada: s.hora_programada || '09:00',
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
  const [tipos, setTipos] = useState([]);
  const [preciosCliente, setPreciosCliente] = useState([]);
  const [filtros, setFiltros] = useState({ q: '', estado_servicio: '', tipo_registro: '', id_tipo_servicio: '', desde: '', hasta: '' });
  const [open, setOpen] = useState(false);
  const [editando, setEditando] = useState(null); // null = crear, id = editar
  const [form, setForm] = useState(inicial);
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  const { esSuperAdmin, esAdmin, puedeVerPrecio } = useAuth();
  const puedeCrear = esSuperAdmin || esAdmin;
  const puedeEditar = esSuperAdmin || esAdmin;
  const toast = useToast();

  const { data, loading, total, page, pageSize, totalPages, setPage, setPageSize, recargar } =
    usePaginatedList(serviciosService.paginate, filtros, { initialPageSize: 25 });

  useEffect(() => {
    Promise.all([clientesService.list(), ascensoresService.list(), tiposServicioService.list()])
      .then(([cs, as, ts]) => { setClientes(cs); setAscensores(as); setTipos(ts); });
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
      ? ascensores.filter(a => String(a.id_cliente) === String(form.id_cliente))
      : [],
    [ascensores, form.id_cliente]
  );

  const ascensoresSeleccionados = useMemo(
    () => ascensoresFiltrados.filter(a => form.ascensores_seleccion[a.id]),
    [ascensoresFiltrados, form.ascensores_seleccion]
  );

  // Tipo elegido y su módulo asociado (null = formulario estándar).
  const tipoSeleccionado = useMemo(
    () => tipos.find(t => String(t.id) === String(form.id_tipo_servicio)) || null,
    [tipos, form.id_tipo_servicio]
  );
  const moduloAsociado = tipoSeleccionado?.modulo_asociado || null;

  const sumaActual = useMemo(
    () => ascensoresSeleccionados.reduce((acc, a) => acc + Number(form.ascensores_seleccion[a.id]?.monto || 0), 0),
    [ascensoresSeleccionados, form.ascensores_seleccion]
  );

  const precio = Number(form.precio_interno || 0);
  const diferenciaSuma = sumaActual - precio;
  const sumaOk = ascensoresSeleccionados.length > 0 && Math.abs(diferenciaSuma) <= TOLERANCIA_SUMA;

  const cambiarCliente = (id_cliente) => {
    setForm(f => ({ ...f, id_cliente, ascensores_seleccion: {} }));
  };

  // Cargar el catálogo de precios del cliente seleccionado para usarlo como
  // default al elegir el tipo de servicio en "Nuevo servicio". En modo edición
  // se conserva el precio guardado del registro.
  useEffect(() => {
    if (!form.id_cliente) { setPreciosCliente([]); return; }
    let cancelado = false;
    clientesService.get(form.id_cliente)
      .then(c => { if (!cancelado) setPreciosCliente(c?.precios || []); })
      .catch(() => { if (!cancelado) setPreciosCliente([]); });
    return () => { cancelado = true; };
  }, [form.id_cliente]);

  // Precio configurado en el catálogo del cliente para el tipo actual.
  const precioConfigurado = useMemo(() => {
    if (!form.id_cliente || !form.id_tipo_servicio) return null;
    return preciosCliente.find(p => String(p.id_tipo_servicio) === String(form.id_tipo_servicio)) || null;
  }, [preciosCliente, form.id_cliente, form.id_tipo_servicio]);

  // Auto-aplica el precio del catálogo en modo creación cuando (cliente, tipo)
  // están seleccionados y existe configuración. No corre en edición para no
  // sobrescribir lo ya pactado.
  useEffect(() => {
    if (editando) return;
    if (!precioConfigurado) return;
    const valor = Number(precioConfigurado.precio || 0).toFixed(2);
    const moneda = precioConfigurado.moneda || 'PEN';
    setForm(f => {
      if (f.precio_interno === valor && f.moneda === moneda) return f;
      const sel = { ...f.ascensores_seleccion };
      const ids = Object.keys(sel);
      const algunoManual = ids.some(k => sel[k].manual);
      if (ids.length > 0 && !algunoManual) {
        const montos = repartirParejo(valor, ids.length);
        ids.forEach((k, i) => { sel[k] = { ...sel[k], monto: montos[i] }; });
      }
      return { ...f, precio_interno: valor, moneda, ascensores_seleccion: sel };
    });
  }, [precioConfigurado, editando]);

  const precioCoincideCatalogo = precioConfigurado &&
    Math.abs(Number(form.precio_interno || 0) - Number(precioConfigurado.precio || 0)) < 0.01;

  const toggleAscensor = (idAsc) => {
    setForm(f => {
      const sel = { ...f.ascensores_seleccion };
      if (sel[idAsc]) delete sel[idAsc];
      else sel[idAsc] = { monto: '0.00', manual: false };
      const ids = Object.keys(sel);
      const algunoManual = ids.some(k => sel[k].manual);
      if (!algunoManual && Number(f.precio_interno || 0) > 0) {
        const montos = repartirParejo(f.precio_interno, ids.length);
        ids.forEach((k, i) => { sel[k] = { ...sel[k], monto: montos[i] }; });
      }
      return { ...f, ascensores_seleccion: sel };
    });
  };

  const cambiarMontoAscensor = (idAsc, valor) => {
    setForm(f => ({
      ...f,
      ascensores_seleccion: {
        ...f.ascensores_seleccion,
        [idAsc]: { monto: valor, manual: true }
      }
    }));
  };

  const cambiarPrecioTotal = (valor) => {
    setForm(f => {
      const sel = { ...f.ascensores_seleccion };
      const ids = Object.keys(sel);
      const algunoManual = ids.some(k => sel[k].manual);
      if (ids.length > 0 && !algunoManual) {
        const montos = repartirParejo(valor, ids.length);
        ids.forEach((k, i) => { sel[k] = { ...sel[k], monto: montos[i] }; });
      }
      return { ...f, precio_interno: valor, ascensores_seleccion: sel };
    });
  };

  const repartirAhora = () => {
    setForm(f => {
      const sel = { ...f.ascensores_seleccion };
      const ids = Object.keys(sel);
      if (ids.length === 0) return f;
      const montos = repartirParejo(f.precio_interno, ids.length);
      ids.forEach((k, i) => { sel[k] = { monto: montos[i], manual: false }; });
      return { ...f, ascensores_seleccion: sel };
    });
  };

  const guardar = async (e) => {
    e.preventDefault();
    if (savingRef.current) return;
    if (!form.id_cliente) { toast.error('Seleccione un cliente'); return; }
    if (ascensoresSeleccionados.length === 0) { toast.error('Seleccione al menos un ascensor'); return; }
    if (!sumaOk) { toast.error(`La suma por ascensor (S/ ${sumaActual.toFixed(2)}) no coincide con el precio total (S/ ${precio.toFixed(2)})`); return; }
    savingRef.current = true;
    setSaving(true);
    try {
      const payload = formToPayload(form, ascensoresSeleccionados, editando ? null : moduloAsociado);
      if (editando) {
        await serviciosService.update(editando, payload);
        toast.success('Servicio actualizado');
      } else {
        await serviciosService.create(payload);
        toast.success('Servicio creado');
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

  const esEdicion = !!editando;
  const tituloModal = esEdicion ? 'Editar servicio / proyecto' : 'Nuevo servicio / proyecto';
  const labelGuardar = saving
    ? (esEdicion ? 'Guardando…' : 'Creando…')
    : (esEdicion ? 'Guardar cambios' : 'Crear');

  return (
    <>
      <PageHeader title="Servicios / Proyectos" subtitle={`${data.length} registro(s)`} actions={
        puedeCrear && <button onClick={abrirNuevo} className="btn-primary">+ Nuevo servicio</button>
      } />

      <div className="card mb-4">
        <div className="p-4 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-7 gap-2">
          <input className="input col-span-2" placeholder="Buscar por código, título, cliente, tipo de ascensor o cotización…" value={filtros.q} onChange={e => setFiltros(f => ({ ...f, q: e.target.value }))} />
          <select className="select" value={filtros.estado_servicio} onChange={e => setFiltros(f => ({ ...f, estado_servicio: e.target.value }))}>
            {ESTADOS_FILTRO.map(s => <option key={s} value={s}>{s || 'Todos los estados'}</option>)}
          </select>
          <select className="select" value={filtros.tipo_registro} onChange={e => setFiltros(f => ({ ...f, tipo_registro: e.target.value }))}>
            <option value="">Servicio y proyecto</option>
            <option value="servicio">Solo servicios</option>
            <option value="proyecto">Solo proyectos</option>
          </select>
          <select className="select" value={filtros.id_tipo_servicio} onChange={e => setFiltros(f => ({ ...f, id_tipo_servicio: e.target.value }))}>
            <option value="">Todos los tipos</option>
            {tipos.map(t => <option key={t.id} value={t.id}>{t.nombre}</option>)}
          </select>
          <input type="date" className="input" value={filtros.desde} onChange={e => setFiltros(f => ({ ...f, desde: e.target.value }))} />
          <input type="date" className="input" value={filtros.hasta} onChange={e => setFiltros(f => ({ ...f, hasta: e.target.value }))} />
        </div>
      </div>

      <div className="card">
        {loading ? <Loader /> : data.length === 0 ? <EmptyState title="Sin servicios" /> : (
          <>
            <div className="hidden md:block overflow-x-auto scroll-thin">
              <table className="table-base">
                <thead><tr>
                  <th className="table-th">Código</th><th className="table-th">Tipo</th>
                  <th className="table-th">Cliente / Ascensores</th><th className="table-th">Tipo servicio</th>
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
                        <td className="table-td text-xs">{s.tipo_registro}</td>
                        <td className="table-td">
                          <div className="text-sm">{s.cliente?.nombre}</div>
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
                          <div className="text-xs text-slate-500 mt-0.5">{s.cliente?.nombre} · {ascResumen}</div>
                        </div>
                        <span className={badgeEstado(s.estado_servicio)}>{s.estado_servicio}</span>
                      </div>
                      <div className="mt-2 text-xs text-slate-500 flex items-center justify-between">
                        <span>{formatFecha(s.fecha_programada)} {s.hora_programada || ''}</span>
                        {puedeVerPrecio && <span className="font-mono">{formatMonto(s.precio_interno, s.moneda)}</span>}
                      </div>
                    </Link>
                    {editable && (
                      <div className="mt-2 text-right">
                        <button
                          type="button"
                          onClick={() => abrirEditar(s)}
                          className="text-brand-700 text-xs hover:underline"
                        >Editar</button>
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
        footer={<><button type="button" className="btn-secondary" onClick={cerrar} disabled={saving}>Cancelar</button><button type="submit" form={FORM_ID} className="btn-primary" disabled={saving || !sumaOk}>{labelGuardar}</button></>}>
        {!esEdicion && !moduloAsociado && (
          <div className="mb-3 rounded-lg border border-amber-200 bg-amber-50 text-amber-900 text-xs p-3 flex items-start gap-2">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="shrink-0 mt-0.5"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="13"/><circle cx="12" cy="16.5" r="0.5"/></svg>
            <div>
              Para trabajos planificados es preferible iniciar con una <Link to="/cotizaciones" className="font-semibold underline">cotización</Link>; al aprobarse se generará el servicio automáticamente con su monto y trazabilidad comercial.
              Crea aquí solo servicios de emergencia, mantenimiento del plan o atención rápida.
            </div>
          </div>
        )}
        <form id={FORM_ID} onSubmit={guardar} className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="label">Tipo de registro</label>
            <select className="select" value={form.tipo_registro} onChange={e => setForm(f => ({ ...f, tipo_registro: e.target.value }))}>
              <option value="servicio">Servicio</option><option value="proyecto">Proyecto</option>
            </select>
          </div>
          <div>
            <label className="label">Tipo de servicio *</label>
            <select className="select" required value={form.id_tipo_servicio} onChange={e => setForm(f => ({ ...f, id_tipo_servicio: e.target.value }))}>
              <option value="">— Seleccione —</option>
              {tipos.map(t => <option key={t.id} value={t.id}>{t.nombre}</option>)}
            </select>
          </div>
          <div className="sm:col-span-2">
            <label className="label">Cliente *</label>
            <select className="select" required value={form.id_cliente} onChange={e => cambiarCliente(e.target.value)}>
              <option value="">— Seleccione —</option>
              {clientes.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
            </select>
          </div>

          <div className="sm:col-span-2">
            <label className="label">Ascensores *</label>
            {!form.id_cliente ? (
              <div className="rounded-lg border border-slate-200 bg-slate-50 text-slate-500 text-xs p-3">Seleccione primero un cliente.</div>
            ) : ascensoresFiltrados.length === 0 ? (
              <div className="rounded-lg border border-slate-200 bg-slate-50 text-slate-500 text-xs p-3">Este cliente no tiene ascensores registrados.</div>
            ) : (
              <div className="rounded-lg ring-1 ring-slate-200 divide-y divide-slate-100 max-h-64 overflow-y-auto scroll-thin">
                {ascensoresFiltrados.map(a => {
                  const sel = form.ascensores_seleccion[a.id];
                  const marcado = !!sel;
                  return (
                    <label key={a.id} className={`flex items-center gap-3 p-2.5 cursor-pointer ${marcado ? 'bg-brand-50/60' : 'bg-white'}`}>
                      <input type="checkbox" checked={marcado} onChange={() => toggleAscensor(a.id)} />
                      <div className="flex-1 min-w-0">
                        <div className="font-mono text-sm text-slate-800">{a.codigo}</div>
                        <div className="text-xs text-slate-500 truncate">{a.ubicacion || a.tipo || '—'}</div>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs text-slate-500">S/</span>
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          className="input w-28 text-right font-mono"
                          value={sel?.monto || ''}
                          onChange={e => cambiarMontoAscensor(a.id, e.target.value)}
                          disabled={!marcado}
                          placeholder="0.00"
                        />
                        {sel?.manual && <span className="text-[10px] uppercase tracking-wider text-amber-700">manual</span>}
                      </div>
                    </label>
                  );
                })}
              </div>
            )}
          </div>

          <div className="sm:col-span-2"><label className="label">Título *</label><input className="input" required value={form.titulo} onChange={e => setForm(f => ({ ...f, titulo: e.target.value }))} /></div>
          <div className="sm:col-span-2"><label className="label">Descripción</label><textarea className="textarea" rows="2" value={form.descripcion} onChange={e => setForm(f => ({ ...f, descripcion: e.target.value }))} /></div>
          <div><label className="label">Fecha *</label><input type="date" className="input" required value={form.fecha_programada} onChange={e => setForm(f => ({ ...f, fecha_programada: e.target.value }))} /></div>
          <div><label className="label">Hora</label><input type="time" className="input" value={form.hora_programada} onChange={e => setForm(f => ({ ...f, hora_programada: e.target.value }))} /></div>
          <div>
            <label className="label">Prioridad</label>
            <select className="select" value={form.prioridad} onChange={e => setForm(f => ({ ...f, prioridad: e.target.value }))}>
              <option value="baja">Baja</option><option value="media">Media</option><option value="alta">Alta</option>
            </select>
          </div>
          <div>
            <label className="label">Precio total (S/) *</label>
            <input type="number" step="0.01" className="input" required value={form.precio_interno} onChange={e => cambiarPrecioTotal(e.target.value)} />
            {precioConfigurado && (
              <div className="mt-1 text-[11px] flex items-center gap-2">
                {precioCoincideCatalogo ? (
                  <span className="text-emerald-700">✓ Precio aplicado del catálogo del cliente</span>
                ) : (
                  <>
                    <span className="text-slate-500">
                      Catálogo del cliente: <span className="font-mono">{formatMonto(precioConfigurado.precio, precioConfigurado.moneda)}</span>
                    </span>
                    <button
                      type="button"
                      onClick={() => cambiarPrecioTotal(Number(precioConfigurado.precio || 0).toFixed(2))}
                      className="text-brand-700 hover:underline"
                    >
                      Aplicar
                    </button>
                  </>
                )}
              </div>
            )}
          </div>
          <div>
            <label className="label">Moneda</label>
            <select className="select" value={form.moneda} onChange={e => setForm(f => ({ ...f, moneda: e.target.value }))}>
              <option value="PEN">PEN (S/)</option><option value="USD">USD ($)</option>
            </select>
          </div>

          <div className="sm:col-span-2 rounded-lg ring-1 ring-slate-200 bg-slate-50 p-3 text-xs flex flex-wrap items-center gap-3">
            <span className="text-slate-600">Ascensores seleccionados: <strong>{ascensoresSeleccionados.length}</strong></span>
            <span className="text-slate-600">Suma actual: <strong className="font-mono">S/ {sumaActual.toFixed(2)}</strong></span>
            {ascensoresSeleccionados.length > 0 && (
              sumaOk ? <span className="text-emerald-700">✓ coincide con el precio total</span>
              : <span className="text-rose-700">{diferenciaSuma > 0 ? `Sobran S/ ${diferenciaSuma.toFixed(2)}` : `Faltan S/ ${(-diferenciaSuma).toFixed(2)}`}</span>
            )}
            <button type="button" onClick={repartirAhora} className="btn-secondary text-xs ml-auto" disabled={ascensoresSeleccionados.length === 0 || !form.precio_interno}>Repartir parejo</button>
          </div>

          {!editando && moduloAsociado === 'emergencia' && (
            <div className="sm:col-span-2 rounded-md bg-rose-50 ring-1 ring-rose-200 p-3 space-y-2">
              <div className="text-xs font-semibold text-rose-800">Datos para el módulo Emergencias</div>
              <div>
                <label className="label">Motivo *</label>
                <textarea className="textarea" rows="2" required value={form.motivo}
                  placeholder="Describe el motivo de la emergencia"
                  onChange={e => setForm(f => ({ ...f, motivo: e.target.value }))} />
              </div>
              <div>
                <label className="label">Nivel de urgencia</label>
                <select className="select" value={form.nivel_urgencia || 'alta'}
                  onChange={e => setForm(f => ({ ...f, nivel_urgencia: e.target.value }))}>
                  <option value="alta">Alta</option><option value="media">Media</option><option value="baja">Baja</option>
                </select>
              </div>
            </div>
          )}

          {!editando && moduloAsociado === 'correctivo' && (
            <div className="sm:col-span-2 rounded-md bg-amber-50 ring-1 ring-amber-200 p-3 space-y-2">
              <div className="text-xs font-semibold text-amber-800">Datos para el módulo Correctivos</div>
              <div>
                <label className="label">Descripción de la falla *</label>
                <textarea className="textarea" rows="2" required value={form.falla}
                  placeholder="Describe la falla a corregir"
                  onChange={e => setForm(f => ({ ...f, falla: e.target.value }))} />
              </div>
              <div>
                <label className="label">Nivel de urgencia</label>
                <select className="select" value={form.nivel_urgencia || 'media'}
                  onChange={e => setForm(f => ({ ...f, nivel_urgencia: e.target.value }))}>
                  <option value="alta">Alta</option><option value="media">Media</option><option value="baja">Baja</option>
                </select>
              </div>
            </div>
          )}

          {!editando && moduloAsociado === 'mantenimiento' && (
            <div className="sm:col-span-2 rounded-md bg-emerald-50 ring-1 ring-emerald-200 p-3 space-y-2">
              <div className="text-xs font-semibold text-emerald-800">Datos del plan de mantenimiento</div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">Tipo de plan</label>
                  <select className="select" value={form.tipo_plan}
                    onChange={e => setForm(f => ({ ...f, tipo_plan: e.target.value }))}>
                    <option value="ciclico">Cíclico</option>
                    <option value="continuo">Continuo</option>
                    <option value="eventual">Eventual</option>
                  </select>
                </div>
                {form.tipo_plan !== 'eventual' && (
                  <div>
                    <label className="label">Frecuencia</label>
                    <select className="select" value={form.frecuencia}
                      onChange={e => setForm(f => ({ ...f, frecuencia: e.target.value }))}>
                      <option value="mensual">Mensual</option>
                      <option value="bimestral">Bimestral</option>
                      <option value="trimestral">Trimestral</option>
                      <option value="semestral">Semestral</option>
                      <option value="anual">Anual</option>
                      <option value="personalizada">Personalizada (días)</option>
                    </select>
                  </div>
                )}
              </div>
              {form.tipo_plan !== 'eventual' && form.frecuencia === 'personalizada' && (
                <div>
                  <label className="label">Frecuencia en días *</label>
                  <input type="number" min="1" className="input" value={form.frecuencia_dias_custom}
                    onChange={e => setForm(f => ({ ...f, frecuencia_dias_custom: e.target.value }))} />
                </div>
              )}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">Cantidad de mantenimientos</label>
                  <input type="number" min="1" className="input" value={form.cantidad_mantenimientos}
                    placeholder="opcional (sin tope)"
                    onChange={e => setForm(f => ({ ...f, cantidad_mantenimientos: e.target.value }))} />
                </div>
                <div>
                  <label className="label">Cupo gratuitos inicial</label>
                  <input type="number" min="0" className="input" value={form.cantidad_mantenimientos_gratuitos}
                    onChange={e => setForm(f => ({ ...f, cantidad_mantenimientos_gratuitos: e.target.value }))} />
                </div>
              </div>
              <div>
                <label className="label">Fecha de inicio del plan</label>
                <input type="date" className="input" value={form.fecha_inicio_plan}
                  placeholder={form.fecha_programada}
                  onChange={e => setForm(f => ({ ...f, fecha_inicio_plan: e.target.value }))} />
                <p className="text-[11px] text-slate-500 mt-0.5">Si lo dejas vacío usa la fecha programada del servicio.</p>
              </div>
              {ascensoresSeleccionados.length > 1 && (
                <p className="text-[11px] text-emerald-700">Se crearán {ascensoresSeleccionados.length} planes independientes (uno por ascensor) con los mismos parámetros.</p>
              )}
            </div>
          )}

          {!editando && moduloAsociado === 'atencion_rapida' && (
            <div className="sm:col-span-2 rounded-md bg-sky-50 ring-1 ring-sky-200 p-3 space-y-2">
              <div className="text-xs font-semibold text-sky-800">Datos para el módulo Atención Rápida</div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">Nombre de contacto *</label>
                  <input className="input" required value={form.nombre_contacto}
                    onChange={e => setForm(f => ({ ...f, nombre_contacto: e.target.value }))} />
                </div>
                <div>
                  <label className="label">Teléfono *</label>
                  <input className="input" required value={form.telefono}
                    onChange={e => setForm(f => ({ ...f, telefono: e.target.value }))} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">Tipo de solicitud</label>
                  <input className="input" value={form.tipo_solicitud}
                    placeholder="Consulta, queja, etc."
                    onChange={e => setForm(f => ({ ...f, tipo_solicitud: e.target.value }))} />
                </div>
                <div>
                  <label className="label">Nivel de urgencia</label>
                  <select className="select" value={form.nivel_urgencia || 'media'}
                    onChange={e => setForm(f => ({ ...f, nivel_urgencia: e.target.value }))}>
                    <option value="alta">Alta</option><option value="media">Media</option><option value="baja">Baja</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="label">Mensaje rápido</label>
                <textarea className="textarea" rows="2" value={form.mensaje_rapido}
                  onChange={e => setForm(f => ({ ...f, mensaje_rapido: e.target.value }))} />
              </div>
            </div>
          )}

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
