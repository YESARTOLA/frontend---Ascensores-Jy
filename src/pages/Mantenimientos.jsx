import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { mantenimientosService, clientesService, ascensoresService, tiposServicioService } from '../services';
import PageHeader from '../components/common/PageHeader.jsx';
import Loader from '../components/common/Loader.jsx';
import Modal from '../components/common/Modal.jsx';
import ConfirmarEliminacion from '../components/common/ConfirmarEliminacion.jsx';
import EmptyState from '../components/common/EmptyState.jsx';
import Pagination, { usePaginatedList } from '../components/common/Pagination.jsx';
import DateRangePicker from '../components/common/DateRangePicker.jsx';
import { useToast } from '../components/common/Toast.jsx';
import ClienteAutocomplete from '../components/common/ClienteAutocomplete.jsx';
import AscensoresChecklist from '../components/common/AscensoresChecklist.jsx';
import { sumaMontos, precioConfigurado, esAscensorServiciable } from '../utils/ascensoresSeleccion.js';
import { badgeEstado, formatFecha, formatFechaHora, formatMonto, formatDiasEjecucion, hoyISO, toYMDLima, nombreCliente, nombreEdificio } from '../utils/formatters.js';
import { useAuth } from '../features/auth/AuthContext.jsx';
import { generarReportePorClientePDF } from '../utils/pdfReport.js';

const FORM_ID = 'form-nuevo-plan-mantenimiento';

const inicial = {
  id_cliente: '', ascensores_seleccion: {}, id_tipo_servicio: '', tipo_plan: 'continuo',
  frecuencia: 'mensual', frecuencia_dias_custom: '', cantidad_mantenimientos: '12',
  cantidad_mantenimientos_gratuitos: '0',
  fecha_inicio: hoyISO(), hora_programada: '09:00',
  observaciones: ''
};

// Resume los ascensores de un plan (junction) para listas/detalle: nombre del
// edificio/obra (del primero con dato, cae a la razón social) y los ascensores.
function resumenAscensoresPlan(plan) {
  const ascs = (plan?.ascensores || []).map(a => a.ascensor).filter(Boolean);
  const edificio = ascs.map(a => nombreEdificio(a.edificio)).find(Boolean) || nombreCliente(plan?.cliente) || '—';
  return { edificio, ascensores: ascs };
}

export default function Mantenimientos() {
  const [tabActiva, setTabActiva] = useState('mantenimientos'); // 'mantenimientos' | 'planes'
  const [clientes, setClientes] = useState([]);
  const [ascensores, setAscensores] = useState([]);
  const [tipos, setTipos] = useState([]);
  const [frecuencias, setFrecuencias] = useState([]);
  const [open, setOpen] = useState(false);
  const [editando, setEditando] = useState(null);
  const [form, setForm] = useState(inicial);
  const [guardando, setGuardando] = useState(false);
  const guardandoRef = useRef(false);
  const [filtroInst, setFiltroInst] = useState({ q: '', id_cliente: '', id_ascensor: '', estado_ejecucion: '', desde: '', hasta: '' });
  const [filtroPlanes, setFiltroPlanes] = useState({ q: '' });
  const [planDetalle, setPlanDetalle] = useState(null);
  const [instanciasPlan, setInstanciasPlan] = useState([]);
  const [cargandoInstanciasPlan, setCargandoInstanciasPlan] = useState(false);
  // Facturación por periodo del plan (una factura + un pago por el total de cada
  // ocurrencia). `periodos` = { id_cobro, periodos: [...] } | null.
  const [periodos, setPeriodos] = useState(null);
  const [cargandoPeriodos, setCargandoPeriodos] = useState(false);
  const [forzando, setForzando] = useState(null);   // periodo en el modal de forzar
  const [modoForzar, setModoForzar] = useState('total');
  const [aprobandoPeriodo, setAprobandoPeriodo] = useState(false);
  const [editandoGratuitos, setEditandoGratuitos] = useState(false);
  const [nuevoCupoGratuitos, setNuevoCupoGratuitos] = useState('');
  const [guardandoGratuitos, setGuardandoGratuitos] = useState(false);
  // Edición del precio del plan: por ascensor (desglose) o global (el total se
  // reparte proporcional al desglose vigente, lo hace el backend).
  const [editandoPrecios, setEditandoPrecios] = useState(false);
  const [modoPrecio, setModoPrecio] = useState('ascensor'); // 'ascensor' | 'total'
  const [preciosForm, setPreciosForm] = useState({});       // id_ascensor → monto (string)
  const [precioTotalForm, setPrecioTotalForm] = useState('');
  const [guardandoPrecios, setGuardandoPrecios] = useState(false);
  // Edición del precio de UNA ocurrencia (mantenimiento de un ascensor en una
  // fecha), sin tocar el precio pactado del plan.
  const [precioInstancia, setPrecioInstancia] = useState(null); // instancia en edición
  const [montoInstancia, setMontoInstancia] = useState('');
  const [guardandoPrecioInst, setGuardandoPrecioInst] = useState(false);
  const [openExportar, setOpenExportar] = useState(false);
  const [exportForm, setExportForm] = useState({ ids_cliente: [], ids_ascensor: [], estado_ejecucion: '', desde: '', hasta: '', formato: 'excel' });
  const [exportando, setExportando] = useState(false);
  const toast = useToast();
  const { esSuperAdmin, esAdmin, esCoordinador, esContabilidad, puedeVerPrecio } = useAuth();
  const puedeCrear = esSuperAdmin || esAdmin || esCoordinador;
  const puedeExportar = esSuperAdmin || esAdmin || esCoordinador || esContabilidad;
  const puedeEditarPlan = esSuperAdmin || esAdmin;
  const puedeEliminarPlan = esSuperAdmin;
  const [planAEliminar, setPlanAEliminar] = useState(null);
  // Impacto del borrado en cascada, consultado al abrir el modal de confirmación.
  // null = aún cargando; el objeto trae los conteos reales que se van a dar de baja.
  const [impactoEliminacion, setImpactoEliminacion] = useState(null);

  useEffect(() => {
    if (!planAEliminar) { setImpactoEliminacion(null); return; }
    let vigente = true;
    mantenimientosService.impactoEliminacion(planAEliminar.id)
      .then(r => { if (vigente) setImpactoEliminacion(r); })
      // Si el preview falla se sigue permitiendo borrar: el DELETE es la fuente
      // de verdad y el modal cae al aviso genérico.
      .catch(() => { if (vigente) setImpactoEliminacion({ error: true }); });
    return () => { vigente = false; };
  }, [planAEliminar]);

  const { data, loading, total, page, pageSize, totalPages, setPage, setPageSize, recargar } =
    usePaginatedList(mantenimientosService.paginate, filtroPlanes, { initialPageSize: 25 });
  const cargar = recargar;
  useEffect(() => {
    Promise.all([
      clientesService.list(),
      ascensoresService.list(),
      tiposServicioService.list(),
      mantenimientosService.frecuencias()
    ]).then(([c, a, t, f]) => { setClientes(c); setAscensores(a); setTipos(t); setFrecuencias(f); });
  }, []);

  // Solo los filtros con valor viajan al backend: un filtro vacío no debe
  // formar parte de la clave que dispara la recarga ni llegar como `?q=`.
  const filtrosInstServidor = useMemo(() => {
    const params = {};
    if (filtroInst.q) params.q = filtroInst.q;
    if (filtroInst.id_cliente) params.id_cliente = filtroInst.id_cliente;
    if (filtroInst.id_ascensor) params.id_ascensor = filtroInst.id_ascensor;
    if (filtroInst.estado_ejecucion) params.estado_ejecucion = filtroInst.estado_ejecucion;
    if (filtroInst.desde) params.desde = filtroInst.desde;
    if (filtroInst.hasta) params.hasta = filtroInst.hasta;
    return params;
  }, [filtroInst]);

  const {
    data: instancias, loading: cargandoInstancias, total: totalInstancias,
    page: pageInst, pageSize: pageSizeInst, totalPages: totalPagesInst,
    setPage: setPageInst, setPageSize: setPageSizeInst, recargar: recargarInstancias
  } = usePaginatedList(mantenimientosService.instanciasPaginate, filtrosInstServidor, { initialPageSize: 25 });

  const ascensoresFiltroInst = filtroInst.id_cliente
    ? ascensores.filter(a => String(a.edificio?.cliente?.id) === String(filtroInst.id_cliente))
    : ascensores;

  const ascensoresF = (form.id_cliente ? ascensores.filter(a => String(a.edificio?.cliente?.id) === String(form.id_cliente)) : ascensores).filter(esAscensorServiciable);
  const labelCampoCliente = 'Cliente';
  // Solo subtipos vinculados al módulo Mantenimientos pueden tener plan.
  const tiposF = tipos.filter(t => !t.es_padre && t.modulo_asociado === 'mantenimiento');
  const esContinuo = form.tipo_plan === 'continuo';
  const frecuenciaSeleccionada = frecuencias.find(f => f.codigo === form.frecuencia);
  const esFrecuenciaCustom = frecuenciaSeleccionada?.unidad === 'custom';
  const tipoSeleccionado = tipos.find(t => String(t.id) === String(form.id_tipo_servicio));
  const esTipoPreventivo = !!tipoSeleccionado?.es_preventivo;
  const cupoMaximoGratuitos = esContinuo ? Number(form.cantidad_mantenimientos || 0) : 1;

  // El precio del plan se compone desde los ascensores: cada uno aporta su precio
  // configurado para el subtipo (tbl_ascensores_precios). Ya no se reparte un
  // total del catálogo del cliente.
  const ascensoresSeleccionados = ascensoresF.filter(a => form.ascensores_seleccion[a.id]);
  const sumaActual = sumaMontos(form.ascensores_seleccion);
  // La moneda sale del precio configurado del ascensor elegido. No hay fallback
  // porque el bloque de precio solo se renderiza con un ascensor seleccionado.
  const monedaSel = ascensoresSeleccionados[0]
    && precioConfigurado(ascensoresSeleccionados[0], form.id_tipo_servicio)?.moneda;
  const sumaOk = ascensoresSeleccionados.length > 0;

  // Al cambiar el subtipo, el precio de cada ascensor cambia; se limpia la
  // selección para forzar re-elegir con los precios del nuevo subtipo.
  const cambiarSubtipoPlan = (id_tipo_servicio) =>
    setForm(f => ({ ...f, id_tipo_servicio, ascensores_seleccion: {} }));

  // Selecciona/deselecciona un ascensor del plan. Un plan puede cubrir VARIOS
  // ascensores (varios edificios): cada uno aporta su precio y el periodo factura
  // la suma de todos. Alterna cada ascensor de forma acumulativa (no radio).
  const toggleAscensorPlan = (idAsc, cfg) =>
    setForm(f => {
      const sel = { ...f.ascensores_seleccion };
      if (sel[idAsc]) { delete sel[idAsc]; return { ...f, ascensores_seleccion: sel }; }
      if (!cfg) return f;
      sel[idAsc] = { monto: Number(cfg.precio).toFixed(2) };
      return { ...f, ascensores_seleccion: sel };
    });

  // Alta/edición del precio del ascensor para el subtipo elegido, sin salir del
  // modal. Persiste en el catálogo del ascensor (tbl_ascensores_precios), que es
  // donde vive el precio; el backend lo vuelve a leer de ahí al crear el plan.
  const guardarPrecioAscensor = async (idAscensor, { precio, moneda }) => {
    const r = await ascensoresService.guardarPrecio(idAscensor, {
      id_tipo_servicio: form.id_tipo_servicio,
      precio,
      moneda
    });
    // El backend devuelve el catálogo vigente completo del ascensor: se reemplaza
    // en el listado local para no recargar todos los ascensores.
    setAscensores(prev => prev.map(a => (a.id === idAscensor ? { ...a, precios: r.precios } : a)));
    // Configurarle el precio lo deja ya elegido con el monto vigente, sin un clic
    // extra. Multi-ascensor: se AÑADE a la selección (merge), no la reemplaza.
    setForm(f => ({ ...f, ascensores_seleccion: { ...f.ascensores_seleccion, [idAscensor]: { monto: Number(precio).toFixed(2) } } }));
    toast.success('Precio guardado en el ascensor');
  };

  const abrirNuevo = () => {
    setEditando(null);
    setForm(inicial);
    setOpen(true);
  };

  const abrirEditar = (plan) => {
    setEditando(plan.id);
    const seleccion = {};
    (plan.ascensores || []).forEach(pa => {
      if (pa.ascensor) seleccion[pa.ascensor.id] = { monto: Number(pa.monto || 0).toFixed(2), manual: true };
    });
    setForm({
      id_cliente: String(plan.id_cliente || ''),
      ascensores_seleccion: seleccion,
      id_tipo_servicio: String(plan.id_tipo_servicio || ''),
      tipo_plan: plan.tipo_plan || 'continuo',
      frecuencia: plan.frecuencia || 'mensual',
      frecuencia_dias_custom: plan.frecuencia_dias_custom != null ? String(plan.frecuencia_dias_custom) : '',
      cantidad_mantenimientos: plan.cantidad_mantenimientos != null ? String(plan.cantidad_mantenimientos) : '12',
      cantidad_mantenimientos_gratuitos: plan.cantidad_mantenimientos_gratuitos != null ? String(plan.cantidad_mantenimientos_gratuitos) : '0',
      fecha_inicio: toYMDLima(plan.fecha_inicio) || hoyISO(),
      hora_programada: plan.hora_programada || '09:00',
      observaciones: plan.observaciones || ''
    });
    setOpen(true);
  };

  const cerrarModal = () => {
    if (guardandoRef.current) return;
    setOpen(false);
    setEditando(null);
    setForm(inicial);
  };

  const guardar = async (e) => {
    e.preventDefault();
    if (guardandoRef.current) return;
    if (!editando) {
      if (!form.id_tipo_servicio) return toast.error('Seleccione el subtipo de servicio');
      if (ascensoresSeleccionados.length === 0) return toast.error('Seleccione al menos un ascensor con precio configurado');
      // Moneda homogénea: el periodo se factura en un único cobro/cuota (suma de
      // todos los ascensores), que tiene una sola moneda.
      const monedasSel = new Set(ascensoresSeleccionados.map(a => precioConfigurado(a, form.id_tipo_servicio)?.moneda).filter(Boolean));
      if (monedasSel.size > 1) return toast.error('Todos los ascensores del plan deben usar la misma moneda');
    }
    guardandoRef.current = true;
    setGuardando(true);
    try {
      const payload = {
        id_tipo_servicio: form.id_tipo_servicio,
        tipo_plan: form.tipo_plan,
        fecha_inicio: form.fecha_inicio,
        hora_programada: form.hora_programada,
        observaciones: form.observaciones,
        cantidad_mantenimientos_gratuitos: esTipoPreventivo
          ? Number(form.cantidad_mantenimientos_gratuitos || 0)
          : 0
      };
      // Cliente/ascensores solo se mandan en creación (inmutables en edición)
      if (!editando) {
        payload.id_cliente = form.id_cliente;
        payload.ascensores = ascensoresSeleccionados.map(a => ({
          id_ascensor: a.id,
          monto: Number(form.ascensores_seleccion[a.id]?.monto || 0)
        }));
      }
      if (esContinuo) {
        payload.frecuencia = form.frecuencia;
        payload.cantidad_mantenimientos = Number(form.cantidad_mantenimientos);
        if (esFrecuenciaCustom) payload.frecuencia_dias_custom = Number(form.frecuencia_dias_custom);
      }
      if (editando) {
        await mantenimientosService.update(editando, payload);
        toast.success('Plan actualizado');
      } else {
        await mantenimientosService.create(payload);
        toast.success('Plan creado');
      }
      guardandoRef.current = false;
      cerrarModal();
      cargar();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Error');
    } finally {
      setGuardando(false);
      guardandoRef.current = false;
    }
  };

  const labelFrecuencia = (m) => {
    if (m.tipo_plan === 'eventual') return '—';
    const fr = frecuencias.find(f => f.codigo === m.frecuencia);
    return fr ? fr.etiqueta : (m.frecuencia || '');
  };

  const abrirDetallePlan = (plan) => {
    setPlanDetalle(plan);
    setInstanciasPlan([]);
    setEditandoGratuitos(false);
    setCargandoInstanciasPlan(true);
    mantenimientosService.instancias({ id_plan: plan.id })
      .then(setInstanciasPlan)
      .catch(() => setInstanciasPlan([]))
      .finally(() => setCargandoInstanciasPlan(false));
    setPeriodos(null);
    setCargandoPeriodos(true);
    mantenimientosService.periodos(plan.id)
      .then(setPeriodos)
      .catch(() => setPeriodos(null))
      .finally(() => setCargandoPeriodos(false));
  };

  const recargarPeriodos = () => {
    if (!planDetalle) return;
    setCargandoPeriodos(true);
    mantenimientosService.periodos(planDetalle.id)
      .then(setPeriodos)
      .catch(() => {})
      .finally(() => setCargandoPeriodos(false));
  };

  // Aprueba un periodo (normal si está completo; forzado con total/equivalente si
  // faltan mantenimientos). Al aprobar se crea la cuota del periodo en el cobro
  // del plan y queda lista para facturar.
  const aprobarPeriodoUI = async (p, { forzar = false, modo } = {}) => {
    if (aprobandoPeriodo || !planDetalle) return;
    setAprobandoPeriodo(true);
    try {
      await mantenimientosService.aprobarPeriodo(planDetalle.id, { fecha_ocurrencia: p.fecha, forzar, modo });
      toast.success('Periodo aprobado y listo para facturar');
      setForzando(null);
      recargarPeriodos();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Error al aprobar el periodo');
    } finally {
      setAprobandoPeriodo(false);
    }
  };

  const ajustarPeriodoUI = async (p) => {
    if (!planDetalle) return;
    try {
      await mantenimientosService.ajustarPeriodo(planDetalle.id, { fecha_ocurrencia: p.fecha });
      toast.success('Monto del periodo ajustado al total');
      recargarPeriodos();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Error al ajustar el periodo');
    }
  };

  const cerrarDetallePlan = () => {
    setPlanDetalle(null);
    setInstanciasPlan([]);
    setEditandoGratuitos(false);
    setEditandoPrecios(false);
    setPrecioInstancia(null);
    setPeriodos(null);
    setForzando(null);
  };

  const recargarInstanciasPlan = () => {
    if (!planDetalle) return;
    setCargandoInstanciasPlan(true);
    mantenimientosService.instancias({ id_plan: planDetalle.id })
      .then(setInstanciasPlan)
      .catch(() => {})
      .finally(() => setCargandoInstanciasPlan(false));
  };

  // --- Precio del plan (por ascensor y/o global) ---------------------------

  const iniciarEdicionPrecios = () => {
    const filas = planDetalle?.ascensores || [];
    const map = {};
    filas.forEach(pa => { if (pa.ascensor) map[pa.ascensor.id] = Number(pa.monto || 0).toFixed(2); });
    setPreciosForm(map);
    setPrecioTotalForm(filas.reduce((a, pa) => a + Number(pa.monto || 0), 0).toFixed(2));
    setModoPrecio('ascensor');
    setEditandoPrecios(true);
  };

  const totalPreciosForm = Object.values(preciosForm).reduce((a, v) => a + (Number(v) || 0), 0);

  const guardarPrecios = async () => {
    if (!planDetalle || guardandoPrecios) return;
    let payload;
    if (modoPrecio === 'total') {
      const total = Number(precioTotalForm);
      if (!Number.isFinite(total) || total < 0) return toast.error('Precio total inválido');
      payload = { precio_total: total };
    } else {
      const filas = (planDetalle.ascensores || []).filter(pa => pa.ascensor);
      const items = filas.map(pa => ({ id_ascensor: pa.ascensor.id, monto: Number(preciosForm[pa.ascensor.id]) }));
      if (items.some(it => !Number.isFinite(it.monto) || it.monto < 0)) {
        return toast.error('Todos los montos deben ser números mayores o iguales a 0');
      }
      payload = { ascensores: items };
    }
    setGuardandoPrecios(true);
    try {
      const r = await mantenimientosService.actualizarPrecios(planDetalle.id, payload);
      // Refresca el desglose en el detalle abierto sin recargar todo el modal.
      const porAscensor = new Map((r.ascensores || []).map(a => [a.id_ascensor, a.monto]));
      setPlanDetalle(p => p ? {
        ...p,
        ascensores: (p.ascensores || []).map(pa => porAscensor.has(pa.id_ascensor)
          ? { ...pa, monto: porAscensor.get(pa.id_ascensor) }
          : pa)
      } : p);
      setEditandoPrecios(false);
      toast.success(
        r.servicios_actualizados > 0
          ? `Precios actualizados (${r.servicios_actualizados} mantenimiento(s) pendiente(s) al nuevo precio)`
          : 'Precios actualizados'
      );
      if (r.periodos_bloqueados > 0) {
        toast.info(`${r.periodos_bloqueados} periodo(s) ya aprobado(s) conservan su monto facturado`);
      }
      recargarPeriodos();
      recargarInstanciasPlan();
      cargar();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Error al actualizar los precios');
    } finally {
      setGuardandoPrecios(false);
    }
  };

  // --- Precio de una ocurrencia concreta ----------------------------------

  const abrirPrecioInstancia = (it) => {
    setPrecioInstancia(it);
    setMontoInstancia(Number(it.precio_interno || 0).toFixed(2));
  };

  const guardarPrecioInstancia = async () => {
    if (!precioInstancia || guardandoPrecioInst) return;
    const monto = Number(montoInstancia);
    if (!Number.isFinite(monto) || monto < 0) return toast.error('Monto inválido');
    setGuardandoPrecioInst(true);
    try {
      await mantenimientosService.actualizarPrecioServicio(precioInstancia.id_servicio, { monto });
      toast.success('Precio del mantenimiento actualizado');
      setPrecioInstancia(null);
      recargarInstanciasPlan();
      recargarPeriodos();
      // La pestaña de instancias mantiene su propia página cargada aunque no
      // esté visible, así que se refresca siempre para no dejarla desfasada.
      recargarInstancias();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Error al actualizar el precio');
    } finally {
      setGuardandoPrecioInst(false);
    }
  };

  const iniciarEdicionGratuitos = () => {
    setNuevoCupoGratuitos(String(planDetalle?.cantidad_mantenimientos_gratuitos ?? 0));
    setEditandoGratuitos(true);
  };

  const guardarCupoGratuitos = async () => {
    if (!planDetalle || guardandoGratuitos) return;
    const valor = Number(nuevoCupoGratuitos);
    const ejecutados = Number(planDetalle.mantenimientos_gratuitos_ejecutados || 0);
    const cantTotal = Number(planDetalle.cantidad_mantenimientos || 1);
    if (!Number.isInteger(valor) || valor < 0) {
      return toast.error('Debe ser un entero mayor o igual a 0');
    }
    if (valor < ejecutados) {
      return toast.error(`No puede ser menor que los ${ejecutados} mantenimientos gratuitos ya ejecutados`);
    }
    if (planDetalle.tipo_plan === 'continuo' && valor > cantTotal) {
      return toast.error(`No puede ser mayor que la cantidad total (${cantTotal})`);
    }
    if (planDetalle.tipo_plan === 'eventual' && valor > 1) {
      return toast.error('Un plan eventual admite máximo 1 mantenimiento gratuito');
    }
    setGuardandoGratuitos(true);
    try {
      const actualizado = await mantenimientosService.update(planDetalle.id, {
        cantidad_mantenimientos_gratuitos: valor
      });
      toast.success('Cupo gratuito actualizado');
      setPlanDetalle(p => p ? { ...p, ...actualizado, tipo_servicio: p.tipo_servicio, cliente: p.cliente, ascensor: p.ascensor } : p);
      setEditandoGratuitos(false);
      cargar();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Error al actualizar');
    } finally {
      setGuardandoGratuitos(false);
    }
  };

  const subtitle = tabActiva === 'planes'
    ? `${total} plan(es)`
    : `${totalInstancias} mantenimiento(s)`;

  const ascensoresExportFiltrados = exportForm.ids_cliente.length > 0
    ? ascensores.filter(a => exportForm.ids_cliente.includes(String(a.edificio?.cliente?.id)))
    : ascensores;

  const abrirExportar = () => {
    setExportForm({
      // Prefill con el filtro de la pestaña activa
      ids_cliente: filtroInst.id_cliente ? [String(filtroInst.id_cliente)] : [],
      ids_ascensor: filtroInst.id_ascensor ? [String(filtroInst.id_ascensor)] : [],
      estado_ejecucion: filtroInst.estado_ejecucion || '',
      desde: '', hasta: '',
      formato: 'excel'
    });
    setOpenExportar(true);
  };

  const cerrarExportar = () => {
    if (exportando) return;
    setOpenExportar(false);
  };

  const toggleExportCliente = (id) => {
    const idStr = String(id);
    setExportForm(f => {
      const ids_cliente = f.ids_cliente.includes(idStr)
        ? f.ids_cliente.filter(x => x !== idStr)
        : [...f.ids_cliente, idStr];
      // Si saca un cliente, quitar ascensores que ya no aplican
      const ascValidos = ids_cliente.length === 0
        ? f.ids_ascensor
        : f.ids_ascensor.filter(a => ascensores.find(x => String(x.id) === a && ids_cliente.includes(String(x.id_cliente))));
      return { ...f, ids_cliente, ids_ascensor: ascValidos };
    });
  };

  const toggleExportAscensor = (id) => {
    const idStr = String(id);
    setExportForm(f => ({
      ...f,
      ids_ascensor: f.ids_ascensor.includes(idStr)
        ? f.ids_ascensor.filter(x => x !== idStr)
        : [...f.ids_ascensor, idStr]
    }));
  };

  const ejecutarExport = async (e) => {
    if (e?.preventDefault) e.preventDefault();
    if (exportando) return;
    setExportando(true);
    try {
      const params = {};
      if (exportForm.ids_cliente.length > 0) params.ids_cliente = exportForm.ids_cliente.join(',');
      if (exportForm.ids_ascensor.length > 0) params.ids_ascensor = exportForm.ids_ascensor.join(',');
      if (exportForm.estado_ejecucion) params.estado_ejecucion = exportForm.estado_ejecucion;
      if (exportForm.desde) params.desde = exportForm.desde;
      if (exportForm.hasta) params.hasta = exportForm.hasta;
      const stamp = new Date().toISOString().slice(0, 10);

      if (exportForm.formato === 'pdf') {
        // El PDF se genera en el cliente con la portada corporativa
        const datos = await mantenimientosService.exportarDatos(params);
        const filtrosTxt = [];
        if (exportForm.ids_cliente.length > 0) {
          const nombres = exportForm.ids_cliente.map(id => nombreCliente(clientes.find(c => String(c.id) === id))).filter(Boolean);
          filtrosTxt.push(`Clientes: ${nombres.length <= 3 ? nombres.join(', ') : `${nombres.length} seleccionados`}`);
        } else filtrosTxt.push('Todos los clientes');
        if (exportForm.ids_ascensor.length > 0) {
          const codigos = exportForm.ids_ascensor.map(id => ascensores.find(a => String(a.id) === id)?.codigo).filter(Boolean);
          filtrosTxt.push(`Ascensores: ${codigos.length <= 4 ? codigos.join(', ') : `${codigos.length} seleccionados`}`);
        }
        if (exportForm.estado_ejecucion) filtrosTxt.push(`Estado: ${exportForm.estado_ejecucion}`);
        if (exportForm.desde || exportForm.hasta) filtrosTxt.push(`Periodo: ${exportForm.desde || '—'} → ${exportForm.hasta || '—'}`);

        await generarReportePorClientePDF({
          titulo: 'Programaciones de mantenimiento',
          subtitulo: 'Reporte agrupado por cliente',
          fechaHora: new Date().toLocaleString('es-PE', { dateStyle: 'long', timeStyle: 'short' }),
          filtros: filtrosTxt,
          grupos: datos.grupos || [],
          nombreArchivo: `mantenimientos-${stamp}.pdf`
        });
      } else {
        const resp = await mantenimientosService.exportar(params, exportForm.formato);
        const url = URL.createObjectURL(resp.data);
        const a = document.createElement('a');
        a.href = url;
        a.download = `mantenimientos-${stamp}.xlsx`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
      }
      setOpenExportar(false);
      toast.success('Reporte generado');
    } catch (err) {
      // Si el backend devolvió error JSON pero estamos en modo blob, parsearlo
      let msg = 'Error al exportar';
      if (err.response?.data instanceof Blob) {
        try { msg = JSON.parse(await err.response.data.text()).error || msg; } catch { /* binario corrupto */ }
      } else {
        msg = err.response?.data?.error || msg;
      }
      toast.error(msg);
    } finally {
      setExportando(false);
    }
  };

  return (
    <>
      <PageHeader
        title="Mantenimientos"
        subtitle={subtitle}
        actions={
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => setTabActiva('mantenimientos')}
              className={tabActiva === 'mantenimientos' ? 'btn-primary' : 'btn-secondary'}
            >Mantenimientos</button>
            <button
              onClick={() => setTabActiva('planes')}
              className={tabActiva === 'planes' ? 'btn-primary' : 'btn-secondary'}
            >Planes</button>
            {puedeExportar && <button onClick={abrirExportar} className="btn-secondary">Exportar</button>}
            {puedeCrear && <button onClick={abrirNuevo} className="btn-primary">+ Nuevo plan</button>}
          </div>
        }
      />

      {tabActiva === 'mantenimientos' ? (
        <>
          <div className="card mb-4">
            <div className="p-4 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
              <input className="input lg:col-span-2"
                placeholder="Buscar por cliente, código o tipo de ascensor o código de servicio…"
                value={filtroInst.q}
                onChange={e => setFiltroInst(f => ({ ...f, q: e.target.value }))} />
              <select className="select" value={filtroInst.id_cliente}
                onChange={e => setFiltroInst(f => ({ ...f, id_cliente: e.target.value, id_ascensor: '' }))}>
                <option value="">Todos los clientes</option>
                {clientes.map(c => <option key={c.id} value={c.id}>{nombreCliente(c)}</option>)}
              </select>
              <select className="select" value={filtroInst.id_ascensor}
                onChange={e => setFiltroInst(f => ({ ...f, id_ascensor: e.target.value }))}>
                <option value="">Todos los ascensores</option>
                {ascensoresFiltroInst.map(a => <option key={a.id} value={a.id}>{a.codigo} {a.ubicacion ? `· ${a.ubicacion}` : ''}</option>)}
              </select>
              <select className="select" value={filtroInst.estado_ejecucion}
                onChange={e => setFiltroInst(f => ({ ...f, estado_ejecucion: e.target.value }))}>
                <option value="">Todos los estados</option>
                <option value="Pendiente">Pendiente</option>
                <option value="En curso">En curso</option>
                <option value="Realizado">Realizado</option>
                <option value="Cancelado">Cancelado</option>
              </select>
              <DateRangePicker
                desde={filtroInst.desde}
                hasta={filtroInst.hasta}
                onChange={({ desde, hasta }) => setFiltroInst(f => ({ ...f, desde, hasta }))}
                placeholder="Rango de fechas (programada)"
              />
              <button
                onClick={() => setFiltroInst({ q: '', id_cliente: '', id_ascensor: '', estado_ejecucion: '', desde: '', hasta: '' })}
                className="btn-secondary lg:col-span-6"
              >Limpiar filtros</button>
            </div>
          </div>

          <div className="card">
            {cargandoInstancias ? <Loader /> : instancias.length === 0 ? <EmptyState title="Sin mantenimientos" subtitle="Crea un plan o ajusta los filtros." /> : (
              <>
              <div className="overflow-x-auto scroll-thin">
                <table className="table-base">
                  <thead><tr>
                    <th className="table-th">Edificio-Obra / Ascensor</th>
                    <th className="table-th">Tipo</th>
                    <th className="table-th">Servicio</th>
                    <th className="table-th">Técnico</th>
                    <th className="table-th">Programada</th>
                    <th className="table-th">Inicio</th>
                    <th className="table-th">Término</th>
                    <th className="table-th text-center">Días</th>
                    <th className="table-th">Estado</th>
                    <th className="table-th text-right">Acciones</th>
                  </tr></thead>
                  <tbody className="divide-y divide-slate-100">
                    {instancias.map(it => (
                      <tr key={`${it.tipo_instancia}-${it.id_servicio || it.id_evento}`} className="table-row-hover">
                        <td className="table-td text-xs">
                          <div>{it.cliente_nombre || '—'}</div>
                          <div className="font-mono text-slate-500">{it.ascensor_codigo || '—'}</div>
                        </td>
                        <td className="table-td text-xs">
                          {it.tipo_servicio || '—'}
                          {it.es_mantenimiento_gratuito && <span className="ml-1 badge-green text-[10px]">Gratis</span>}
                        </td>
                        <td className="table-td text-xs">
                          {it.codigo_servicio ? (
                            <Link to={`/servicios/${it.id_servicio}`} className="font-mono text-brand-700 hover:underline">{it.codigo_servicio}</Link>
                          ) : <span className="text-slate-400">no creado</span>}
                        </td>
                        <td className="table-td text-xs">{it.tecnicos || '—'}</td>
                        <td className="table-td text-xs">{formatFecha(it.fecha_programada)}</td>
                        <td className="table-td text-xs">{formatFechaHora(it.fecha_inicio_real)}</td>
                        <td className="table-td text-xs">{formatFechaHora(it.fecha_fin_real)}</td>
                        <td className="table-td text-xs text-center font-mono">{formatDiasEjecucion(it.dias_ejecucion)}</td>
                        <td className="table-td"><span className={badgeEstado(it.estado_ejecucion)}>{it.estado_ejecucion}</span></td>
                        <td className="table-td text-right">
                          {it.id_servicio ? (
                            <Link to={`/servicios/${it.id_servicio}`} className="text-brand-700 text-xs hover:underline">Ver detalle</Link>
                          ) : <span className="text-slate-400 text-xs" title="Programado a futuro: aún no se ha creado el servicio">—</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <Pagination page={pageInst} pageSize={pageSizeInst} total={totalInstancias} totalPages={totalPagesInst}
                onPage={setPageInst} onPageSize={setPageSizeInst} />
              </>
            )}
          </div>
        </>
      ) : (
        <>
        <div className="card mb-4">
          <div className="p-4 grid grid-cols-1 sm:grid-cols-3 gap-2">
            <input className="input sm:col-span-2"
              placeholder="Buscar por edificio/obra, cliente, código o tipo de ascensor o código de servicio…"
              value={filtroPlanes.q}
              onChange={e => setFiltroPlanes({ q: e.target.value })} />
            <button
              onClick={() => setFiltroPlanes({ q: '' })}
              className="btn-secondary"
            >Limpiar</button>
          </div>
        </div>
        <div className="card">
          {loading ? <Loader /> : data.length === 0 ? <EmptyState title="Sin planes" /> : (
            <div className="overflow-x-auto scroll-thin">
              <table className="table-base">
                <thead><tr>
                  <th className="table-th">Edificio-Obra / Ascensor</th><th className="table-th">Tipo</th>
                  <th className="table-th">Frecuencia</th><th className="table-th">Próx. fecha</th>
                  <th className="table-th text-center">Gratis</th>
                  <th className="table-th text-center">Ejecutados</th>
                  <th className="table-th">Estado</th>
                  <th className="table-th text-right">Acciones</th>
                </tr></thead>
                <tbody className="divide-y divide-slate-100">
                  {data.map(m => {
                    const aplicaGratuitos = !!m.tipo_servicio?.es_preventivo && Number(m.cantidad_mantenimientos_gratuitos || 0) > 0;
                    const totalPlan = m.tipo_plan === 'eventual'
                      ? 1
                      : (m.cantidad_mantenimientos != null ? Number(m.cantidad_mantenimientos) : null);
                    const ejecutadosTotal = Number(m.mantenimientos_ejecutados_total || 0);
                    const resumenAsc = resumenAscensoresPlan(m);
                    const codigosAsc = resumenAsc.ascensores.map(a => a.codigo).filter(Boolean);
                    return (
                      <tr key={m.id} className="table-row-hover">
                        <td className="table-td text-xs"><div>{resumenAsc.edificio}</div><div className="font-mono text-slate-500">{codigosAsc.length ? codigosAsc.join(', ') : '—'}</div></td>
                        <td className="table-td text-xs">{m.tipo_servicio?.nombre}</td>
                        <td className="table-td text-xs">{labelFrecuencia(m)} ({m.tipo_plan})</td>
                        <td className="table-td text-xs">{formatFecha(m.fecha_inicio)} {m.hora_programada || ''}</td>
                        <td className="table-td text-xs text-center">{aplicaGratuitos ? m.cantidad_mantenimientos_gratuitos : '—'}</td>
                        <td className="table-td text-xs text-center font-mono">
                          {totalPlan != null ? `${ejecutadosTotal}/${totalPlan}` : '—'}
                        </td>
                        <td className="table-td"><span className={badgeEstado(m.estado_plan)}>{m.estado_plan}</span></td>
                        <td className="table-td text-right whitespace-nowrap">
                          <button type="button" onClick={() => abrirDetallePlan(m)} className="text-brand-700 text-xs hover:underline">Ver detalle</button>
                          {puedeCrear && (
                            <>
                              <span className="text-slate-300 mx-1.5">·</span>
                              <button type="button" onClick={() => abrirEditar(m)} className="text-brand-700 text-xs hover:underline">Editar</button>
                            </>
                          )}
                          {puedeEliminarPlan && (
                            <>
                              <span className="text-slate-300 mx-1.5">·</span>
                              <button type="button" onClick={() => setPlanAEliminar(m)} className="text-rose-600 text-xs hover:underline">Eliminar</button>
                            </>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          {!loading && data.length > 0 && (
            <Pagination page={page} pageSize={pageSize} total={total} totalPages={totalPages}
              onPage={setPage} onPageSize={setPageSize} />
          )}
        </div>
        </>
      )}

      <Modal open={!!planDetalle} onClose={cerrarDetallePlan} title="Detalle del plan de mantenimiento" size="xl"
        footer={<button type="button" className="btn-secondary" onClick={cerrarDetallePlan}>Cerrar</button>}>
        {planDetalle && (() => {
          const ejecutados = instanciasPlan.filter(i => i.estado_ejecucion === 'Realizado').length;
          const pendientes = instanciasPlan.filter(i => i.estado_ejecucion === 'Pendiente').length;
          const enCurso = instanciasPlan.filter(i => i.estado_ejecucion === 'En curso').length;
          return (
            <div className="space-y-5">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3 text-sm">
                <div>
                  <div className="text-xs uppercase tracking-wide text-slate-500">Cliente</div>
                  <div className="text-slate-800">{nombreCliente(planDetalle.cliente) || '—'}</div>
                </div>
                <div>
                  <div className="text-xs uppercase tracking-wide text-slate-500 flex items-center gap-2">
                    Ascensores
                    {puedeVerPrecio && puedeEditarPlan && !editandoPrecios && (planDetalle.ascensores || []).length > 0 && (
                      <button type="button" onClick={iniciarEdicionPrecios}
                        className="text-[10px] text-brand-700 hover:underline normal-case tracking-normal">
                        Editar precios
                      </button>
                    )}
                  </div>
                  {(planDetalle.ascensores || []).length === 0 ? (
                    <div className="text-slate-800">—</div>
                  ) : editandoPrecios ? (
                    <div className="mt-1 space-y-2">
                      <div className="flex gap-3 text-[11px]">
                        <label className="inline-flex items-center gap-1 cursor-pointer">
                          <input type="radio" name="modo-precio-plan" checked={modoPrecio === 'ascensor'}
                            onChange={() => setModoPrecio('ascensor')} disabled={guardandoPrecios} />
                          Por ascensor
                        </label>
                        <label className="inline-flex items-center gap-1 cursor-pointer">
                          <input type="radio" name="modo-precio-plan" checked={modoPrecio === 'total'}
                            onChange={() => setModoPrecio('total')} disabled={guardandoPrecios} />
                          Total global
                        </label>
                      </div>
                      {modoPrecio === 'ascensor' ? (
                        <>
                          <ul className="space-y-1">
                            {planDetalle.ascensores.filter(pa => pa.ascensor).map(pa => (
                              <li key={pa.id} className="flex items-center justify-between gap-2">
                                <span className="font-mono text-xs">{pa.ascensor.codigo}</span>
                                <input type="number" min="0" step="0.01"
                                  className="input w-28 text-right font-mono !py-1"
                                  value={preciosForm[pa.ascensor.id] ?? ''}
                                  disabled={guardandoPrecios}
                                  onChange={e => setPreciosForm(f => ({ ...f, [pa.ascensor.id]: e.target.value }))} />
                              </li>
                            ))}
                          </ul>
                          <div className="flex items-center justify-between text-xs border-t border-slate-100 pt-1">
                            <span className="text-slate-500">Total por periodo</span>
                            <strong className="font-mono">{formatMonto(totalPreciosForm, planDetalle.ascensores[0]?.moneda)}</strong>
                          </div>
                        </>
                      ) : (
                        <div className="space-y-1">
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-xs text-slate-600">Total por periodo</span>
                            <input type="number" min="0" step="0.01"
                              className="input w-32 text-right font-mono !py-1"
                              value={precioTotalForm}
                              disabled={guardandoPrecios}
                              onChange={e => setPrecioTotalForm(e.target.value)} />
                          </div>
                          <p className="text-[10px] text-slate-500">
                            Se reparte entre los {planDetalle.ascensores.length} ascensores respetando la proporción de sus montos actuales.
                          </p>
                        </div>
                      )}
                      <div className="flex items-center gap-2 pt-1">
                        <button type="button" onClick={guardarPrecios} disabled={guardandoPrecios}
                          className="btn-primary text-xs !py-1 !px-2">
                          {guardandoPrecios ? 'Guardando…' : 'Guardar'}
                        </button>
                        <button type="button" onClick={() => setEditandoPrecios(false)} disabled={guardandoPrecios}
                          className="btn-secondary text-xs !py-1 !px-2">Cancelar</button>
                      </div>
                      <p className="text-[10px] text-slate-500">
                        Aplica a las próximas ocurrencias y a los mantenimientos pendientes cuyo periodo aún no se aprobó para facturar.
                      </p>
                    </div>
                  ) : (
                    <ul className="text-slate-800 space-y-0.5">
                      {planDetalle.ascensores.map(pa => (
                        <li key={pa.id} className="flex items-center justify-between gap-3">
                          <span className="font-mono">
                            {pa.ascensor?.codigo}
                            {pa.ascensor?.ubicacion && <span className="text-slate-500 font-sans"> · {pa.ascensor.ubicacion}</span>}
                          </span>
                          {puedeVerPrecio && <span className="font-mono text-slate-600">{formatMonto(pa.monto, pa.moneda)}</span>}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
                <div>
                  <div className="text-xs uppercase tracking-wide text-slate-500">Tipo de servicio</div>
                  <div className="text-slate-800">
                    {planDetalle.tipo_servicio?.nombre || '—'}
                    {planDetalle.tipo_servicio?.es_preventivo && <span className="ml-2 badge-green text-[10px]">Preventivo</span>}
                  </div>
                </div>
                <div>
                  <div className="text-xs uppercase tracking-wide text-slate-500">Estado del plan</div>
                  <div><span className={badgeEstado(planDetalle.estado_plan)}>{planDetalle.estado_plan}</span></div>
                </div>
                <div>
                  <div className="text-xs uppercase tracking-wide text-slate-500">Tipo de plan</div>
                  <div className="text-slate-800 capitalize">{planDetalle.tipo_plan}</div>
                </div>
                <div>
                  <div className="text-xs uppercase tracking-wide text-slate-500">Frecuencia</div>
                  <div className="text-slate-800">
                    {labelFrecuencia(planDetalle)}
                    {planDetalle.frecuencia === 'custom' && planDetalle.frecuencia_dias_custom &&
                      <span className="text-slate-500"> ({planDetalle.frecuencia_dias_custom} días)</span>}
                  </div>
                </div>
                <div>
                  <div className="text-xs uppercase tracking-wide text-slate-500">Fecha inicio</div>
                  <div className="text-slate-800">{formatFecha(planDetalle.fecha_inicio)} {planDetalle.hora_programada || ''}</div>
                </div>
                <div>
                  <div className="text-xs uppercase tracking-wide text-slate-500">Cantidad de mantenimientos</div>
                  <div className="text-slate-800 font-mono">{planDetalle.cantidad_mantenimientos ?? '—'}</div>
                </div>
                {!!planDetalle.tipo_servicio?.es_preventivo && (
                  <div>
                    <div className="text-xs uppercase tracking-wide text-slate-500 flex items-center gap-2">
                      Mantenimientos gratuitos
                      {puedeEditarPlan && !editandoGratuitos && (
                        <button type="button" onClick={iniciarEdicionGratuitos}
                          className="text-[10px] text-brand-700 hover:underline normal-case tracking-normal">
                          Editar
                        </button>
                      )}
                    </div>
                    {editandoGratuitos ? (
                      <div className="mt-1 flex items-center gap-2">
                        <input type="number" min="0"
                          max={planDetalle.tipo_plan === 'eventual' ? 1 : (planDetalle.cantidad_mantenimientos || 1)}
                          step="1"
                          className="input w-24 text-center font-mono"
                          value={nuevoCupoGratuitos}
                          onChange={e => setNuevoCupoGratuitos(e.target.value)}
                          disabled={guardandoGratuitos} />
                        <button type="button" onClick={guardarCupoGratuitos} disabled={guardandoGratuitos}
                          className="btn-primary text-xs !py-1 !px-2">
                          {guardandoGratuitos ? 'Guardando…' : 'Guardar'}
                        </button>
                        <button type="button" onClick={() => setEditandoGratuitos(false)} disabled={guardandoGratuitos}
                          className="btn-secondary text-xs !py-1 !px-2">
                          Cancelar
                        </button>
                      </div>
                    ) : (
                      <div className="text-slate-800 font-mono">
                        {planDetalle.mantenimientos_gratuitos_ejecutados || 0} / {planDetalle.cantidad_mantenimientos_gratuitos || 0}
                      </div>
                    )}
                    {puedeEditarPlan && !editandoGratuitos && (
                      <p className="text-[10px] text-slate-500 mt-1">
                        Aumentar el cupo marca como gratuitos a los próximos mantenimientos registrados.
                      </p>
                    )}
                  </div>
                )}
                {planDetalle.observaciones && (
                  <div className="sm:col-span-2">
                    <div className="text-xs uppercase tracking-wide text-slate-500">Observaciones</div>
                    <div className="text-slate-800 whitespace-pre-wrap">{planDetalle.observaciones}</div>
                  </div>
                )}
              </div>

              {puedeVerPrecio && (
                <div className="border-t border-slate-100 pt-4">
                  <div className="flex items-center justify-between mb-3">
                    <h4 className="font-medium text-slate-800">Periodos / Facturación</h4>
                    <span className="text-[11px] text-slate-500 text-right">Una factura y un pago por el total de todos los ascensores de cada periodo.</span>
                  </div>
                  {cargandoPeriodos ? <Loader /> : !periodos || (periodos.periodos || []).length === 0 ? (
                    <p className="text-xs text-slate-500">Sin periodos aún.</p>
                  ) : !periodos.id_cobro ? (
                    <p className="text-xs text-amber-600">Este plan usa el modelo anterior (cobro por servicio); no admite facturación por periodo.</p>
                  ) : (
                    <div className="overflow-x-auto scroll-thin">
                      <table className="table-base">
                        <thead><tr>
                          <th className="table-th">#</th>
                          <th className="table-th">Fecha</th>
                          <th className="table-th text-center">Realizados</th>
                          <th className="table-th text-right">Total</th>
                          <th className="table-th">Estado</th>
                          <th className="table-th text-right">Acciones</th>
                        </tr></thead>
                        <tbody className="divide-y divide-slate-100">
                          {periodos.periodos.map(p => (
                            <tr key={p.ordinal} className="table-row-hover">
                              <td className="table-td font-mono">{p.ordinal}</td>
                              <td className="table-td">{formatFecha(p.fecha)}</td>
                              <td className="table-td text-center font-mono">{p.done}/{p.total_servicios}</td>
                              <td className="table-td text-right font-mono">
                                {p.es_gratuito ? <span className="badge-green">Gratuito</span> : formatMonto(p.total_monto, p.moneda)}
                              </td>
                              <td className="table-td"><span className={badgeEstado(p.estado_periodo)}>{p.estado_periodo}</span></td>
                              <td className="table-td text-right whitespace-nowrap">
                                {puedeEditarPlan && !p.cuota && p.completo && (
                                  <button type="button" onClick={() => aprobarPeriodoUI(p)} disabled={aprobandoPeriodo}
                                    className="btn-primary text-xs !py-1 !px-2">Aprobar y facturar</button>
                                )}
                                {puedeEditarPlan && !p.cuota && !p.completo && (
                                  <button type="button" onClick={() => { setForzando(p); setModoForzar('total'); }}
                                    className="btn-secondary text-xs !py-1 !px-2">Forzar cierre</button>
                                )}
                                {puedeEditarPlan && p.cuota && p.estado_periodo === 'aprobado' && !p.es_gratuito && p.cuota.monto < p.total_monto && (
                                  <button type="button" onClick={() => ajustarPeriodoUI(p)}
                                    className="btn-secondary text-xs !py-1 !px-2">Ajustar al total</button>
                                )}
                                {p.cuota && <span className="text-[11px] text-slate-400 ml-1">cuota #{p.cuota.numero_cuota}</span>}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}

              <div className="border-t border-slate-100 pt-4">
                <div className="flex items-center justify-between mb-3">
                  <h4 className="font-medium text-slate-800">Mantenimientos del plan</h4>
                  {!cargandoInstanciasPlan && instanciasPlan.length > 0 && (
                    <div className="flex gap-2 text-[11px]">
                      <span className="badge-green">Realizados: {ejecutados}</span>
                      {enCurso > 0 && <span className="badge-amber">En curso: {enCurso}</span>}
                      <span className="badge-gray">Pendientes: {pendientes}</span>
                    </div>
                  )}
                </div>
                {cargandoInstanciasPlan ? <Loader /> : instanciasPlan.length === 0 ? (
                  <p className="text-xs text-slate-500">Sin mantenimientos registrados.</p>
                ) : (
                  <div className="overflow-x-auto scroll-thin">
                    <table className="table-base">
                      <thead><tr>
                        <th className="table-th">Servicio</th>
                        <th className="table-th">Programada</th>
                        <th className="table-th">Inicio</th>
                        <th className="table-th">Término</th>
                        <th className="table-th text-center">Días</th>
                        {puedeVerPrecio && <th className="table-th text-right">Precio</th>}
                        <th className="table-th">Estado</th>
                        <th className="table-th text-right">Acciones</th>
                      </tr></thead>
                      <tbody className="divide-y divide-slate-100">
                        {instanciasPlan.map(it => (
                          <tr key={`${it.tipo_instancia}-${it.id_servicio || it.id_evento}`} className="table-row-hover">
                            <td className="table-td text-xs">
                              {it.codigo_servicio ? (
                                <Link to={`/servicios/${it.id_servicio}`} className="font-mono text-brand-700 hover:underline">{it.codigo_servicio}</Link>
                              ) : <span className="text-slate-400">no creado</span>}
                              {it.es_mantenimiento_gratuito && <span className="ml-1 badge-green text-[10px]">Gratis</span>}
                            </td>
                            <td className="table-td text-xs">{formatFecha(it.fecha_programada)}</td>
                            <td className="table-td text-xs">{formatFechaHora(it.fecha_inicio_real)}</td>
                            <td className="table-td text-xs">{formatFechaHora(it.fecha_fin_real)}</td>
                            <td className="table-td text-xs text-center font-mono">{formatDiasEjecucion(it.dias_ejecucion)}</td>
                            {puedeVerPrecio && (
                              <td className="table-td text-xs text-right font-mono">
                                {it.es_mantenimiento_gratuito
                                  ? <span className="text-slate-400">—</span>
                                  : (it.id_servicio ? formatMonto(it.precio_interno, it.moneda) : <span className="text-slate-400">—</span>)}
                              </td>
                            )}
                            <td className="table-td"><span className={badgeEstado(it.estado_ejecucion)}>{it.estado_ejecucion}</span></td>
                            <td className="table-td text-right whitespace-nowrap">
                              {it.id_servicio ? (
                                <>
                                  <Link to={`/servicios/${it.id_servicio}`} className="text-brand-700 text-xs hover:underline">Ver</Link>
                                  {/* El precio de una ocurrencia se corrige aquí: el módulo Proyectos
                                      no aplica a los mantenimientos de un plan. El backend rechaza el
                                      cambio si ya salió a campo o si su periodo fue aprobado. */}
                                  {puedeVerPrecio && puedeEditarPlan && !it.es_mantenimiento_gratuito && it.estado_ejecucion === 'Pendiente' && (
                                    <>
                                      <span className="text-slate-300 mx-1.5">·</span>
                                      <button type="button" onClick={() => abrirPrecioInstancia(it)}
                                        className="text-brand-700 text-xs hover:underline">Precio</button>
                                    </>
                                  )}
                                </>
                              ) : <span className="text-slate-400 text-xs">—</span>}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          );
        })()}
      </Modal>

      <Modal open={!!precioInstancia} onClose={() => setPrecioInstancia(null)} title="Precio del mantenimiento" size="sm"
        footer={<>
          <button type="button" className="btn-secondary" onClick={() => setPrecioInstancia(null)} disabled={guardandoPrecioInst}>Cancelar</button>
          <button type="button" className="btn-primary" onClick={guardarPrecioInstancia} disabled={guardandoPrecioInst}>
            {guardandoPrecioInst ? 'Guardando…' : 'Guardar'}
          </button>
        </>}>
        {precioInstancia && (
          <div className="space-y-3 text-sm">
            <div className="text-xs text-slate-600">
              <div><span className="font-mono">{precioInstancia.codigo_servicio}</span> · {precioInstancia.ascensor_codigo}</div>
              <div>Programado: {formatFecha(precioInstancia.fecha_programada)}</div>
            </div>
            <div>
              <label className="label">Precio de esta ocurrencia</label>
              <input type="number" min="0" step="0.01" className="input text-right font-mono"
                value={montoInstancia} disabled={guardandoPrecioInst}
                onChange={e => setMontoInstancia(e.target.value)} />
            </div>
            <p className="text-[11px] text-slate-500">
              Solo afecta a este mantenimiento: el precio pactado del plan y el resto de ocurrencias no cambian.
              El total del periodo se recalcula con este monto.
            </p>
          </div>
        )}
      </Modal>

      <Modal open={!!forzando} onClose={() => setForzando(null)} title="Forzar cierre del periodo" size="md">
        {forzando && (
          <div className="space-y-4 text-sm">
            <p className="text-slate-700">
              El periodo <strong>#{forzando.ordinal}</strong> ({formatFecha(forzando.fecha)}) tiene{' '}
              <strong>{forzando.done} de {forzando.total_servicios}</strong> mantenimientos realizados. Elija por cuánto facturarlo:
            </p>
            <div className="space-y-2">
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="radio" name="modo-forzar" checked={modoForzar === 'total'} onChange={() => setModoForzar('total')} />
                <span>Total del periodo — <strong className="font-mono">{formatMonto(forzando.total_monto, forzando.moneda)}</strong></span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="radio" name="modo-forzar" checked={modoForzar === 'equivalente'} onChange={() => setModoForzar('equivalente')} />
                <span>
                  Equivalente proporcional ({forzando.done}/{forzando.total_servicios}) —{' '}
                  <strong className="font-mono">
                    {formatMonto(forzando.total_servicios > 0 ? Math.round(forzando.total_monto * forzando.done / forzando.total_servicios * 100) / 100 : 0, forzando.moneda)}
                  </strong>
                </span>
              </label>
            </div>
            <p className="text-[11px] text-slate-500">
              Se genera una sola cuota por este periodo; un único pago continúa el flujo. Si luego se completa el mantenimiento faltante podrás ajustar el monto al total.
            </p>
            <div className="flex justify-end gap-2">
              <button type="button" className="btn-secondary" onClick={() => setForzando(null)}>Cancelar</button>
              <button type="button" className="btn-primary" disabled={aprobandoPeriodo}
                onClick={() => aprobarPeriodoUI(forzando, { forzar: true, modo: modoForzar })}>
                {aprobandoPeriodo ? 'Aprobando…' : 'Aprobar forzado'}
              </button>
            </div>
          </div>
        )}
      </Modal>

      <Modal open={open} onClose={cerrarModal} title={editando ? 'Editar plan de mantenimiento' : 'Nuevo plan de mantenimiento'}
        footer={
          <>
            <button type="button" className="btn-secondary" onClick={cerrarModal} disabled={guardando}>Cancelar</button>
            <button type="submit" form={FORM_ID} className="btn-primary" disabled={guardando || (!editando && !sumaOk)}>
              {guardando
                ? (editando ? 'Guardando…' : 'Creando…')
                : (editando ? 'Guardar cambios' : 'Crear')}
            </button>
          </>
        }>
        <form id={FORM_ID} onSubmit={guardar} className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {editando && (
            <div className="sm:col-span-2 rounded-lg border border-amber-200 bg-amber-50 text-amber-900 text-xs p-3">
              Cliente y ascensores del plan son inmutables. Los cambios <strong>solo afectan a los mantenimientos futuros no materializados</strong>; los servicios ya creados conservan sus datos originales.
            </div>
          )}
          <div>
            <label className="label">{labelCampoCliente} *</label>
            <ClienteAutocomplete
              clientes={clientes}
              value={form.id_cliente}
              onChange={(id) => setForm(f => ({ ...f, id_cliente: id, ascensores_seleccion: {} }))}
              required
              disabled={!!editando}
              placeholder="Escriba para buscar por nombre de edificio / obra…"
            />
          </div>
          <div>
            <label className="label">Tipo de servicio *</label>
            <select className="select" required value={form.id_tipo_servicio} onChange={e => cambiarSubtipoPlan(e.target.value)} disabled={!!editando}><option value="">—</option>{tiposF.map(t => <option key={t.id} value={t.id}>{t.nombre}</option>)}</select>
          </div>
          <div className="sm:col-span-2">
            <label className="label">Ascensores *</label>
            <p className="text-[11px] text-slate-500 -mt-1 mb-1.5">Un plan puede cubrir varios ascensores (incluso de distintos edificios). Cada periodo se factura por la suma de todos, en una sola factura y un solo pago. Todos deben usar la misma moneda.</p>
            <AscensoresChecklist
              ascensores={ascensoresF}
              seleccion={form.ascensores_seleccion}
              idTipoServicio={form.id_tipo_servicio}
              onToggle={toggleAscensorPlan}
              disabled={!!editando}
              single={false}
              hayCliente={!!form.id_cliente}
              onGuardarPrecio={puedeCrear && puedeVerPrecio ? guardarPrecioAscensor : undefined}
            />
            {puedeVerPrecio && ascensoresSeleccionados.length > 0 && (
              <div className="mt-2 rounded-lg ring-1 ring-slate-200 bg-slate-50 p-3 text-sm flex flex-wrap items-center gap-3">
                <span className="text-slate-600">{ascensoresSeleccionados.length} ascensor(es) · total por periodo:</span>
                <strong className="font-mono text-slate-900 ml-auto">{formatMonto(sumaActual, monedaSel)}</strong>
              </div>
            )}
          </div>
          <div>
            <label className="label">Tipo de plan *</label>
            <select className="select" value={form.tipo_plan} onChange={e => setForm(f => ({ ...f, tipo_plan: e.target.value }))}>
              <option value="continuo">Continuo</option>
              <option value="eventual">Eventual</option>
            </select>
          </div>

          {esContinuo && (
            <>
              <div>
                <label className="label">Frecuencia *</label>
                <select className="select" required value={form.frecuencia} onChange={e => setForm(f => ({ ...f, frecuencia: e.target.value }))}>
                  {frecuencias.map(fr => <option key={fr.codigo} value={fr.codigo}>{fr.etiqueta}</option>)}
                </select>
              </div>
              {esFrecuenciaCustom && (
                <div>
                  <label className="label">Días entre mantenimientos *</label>
                  <input type="number" min="1" step="1" className="input" required
                    value={form.frecuencia_dias_custom}
                    onChange={e => setForm(f => ({ ...f, frecuencia_dias_custom: e.target.value }))} />
                </div>
              )}
              <div>
                <label className="label">Cantidad de mantenimientos *</label>
                <input type="number" min="1" step="1" className="input" required
                  value={form.cantidad_mantenimientos}
                  onChange={e => setForm(f => ({ ...f, cantidad_mantenimientos: e.target.value }))} />
              </div>
            </>
          )}

          {esTipoPreventivo && (
            <div>
              <label className="label">Mantenimientos gratuitos</label>
              <input
                type="number" min="0" max={cupoMaximoGratuitos} step="1" className="input"
                value={form.cantidad_mantenimientos_gratuitos}
                onChange={e => setForm(f => ({ ...f, cantidad_mantenimientos_gratuitos: e.target.value }))}
              />
              <p className="text-xs text-slate-500 mt-1">
                Los primeros N mantenimientos no generan cobro. Máx: {cupoMaximoGratuitos}.
              </p>
            </div>
          )}

          <div><label className="label">Fecha inicio *</label><input type="date" className="input" required value={form.fecha_inicio} onChange={e => setForm(f => ({ ...f, fecha_inicio: e.target.value }))} /></div>
          <div><label className="label">Hora</label><input type="time" className="input" value={form.hora_programada} onChange={e => setForm(f => ({ ...f, hora_programada: e.target.value }))} /></div>
          <div className="sm:col-span-2 text-xs text-slate-500 bg-slate-50 ring-1 ring-slate-200 rounded-md px-3 py-2">
            El precio del mantenimiento es el que tiene configurado el ascensor para este subtipo de servicio. Si falta o cambió, edítelo desde la misma lista de arriba: se guarda en la ficha del ascensor.
          </div>
          <div className="sm:col-span-2"><label className="label">Observaciones</label><textarea className="textarea" rows="2" value={form.observaciones} onChange={e => setForm(f => ({ ...f, observaciones: e.target.value }))} /></div>
        </form>
      </Modal>

      <Modal open={openExportar} onClose={cerrarExportar} title="Exportar programaciones de mantenimiento" size="lg"
        footer={<>
          <button type="button" className="btn-secondary" onClick={cerrarExportar} disabled={exportando}>Cancelar</button>
          <button type="submit" form="form-exportar-mantenimientos" className="btn-primary" disabled={exportando}>
            {exportando ? 'Generando…' : `Descargar ${exportForm.formato.toUpperCase()}`}
          </button>
        </>}>
        <form id="form-exportar-mantenimientos" onSubmit={ejecutarExport} className="space-y-4">
          <div>
            <label className="label flex items-center justify-between">
              <span>Clientes</span>
              <span className="text-xs font-normal text-slate-500">
                {exportForm.ids_cliente.length === 0 ? 'Todos' : `${exportForm.ids_cliente.length} seleccionado(s)`}
              </span>
            </label>
            <div className="rounded-lg ring-1 ring-slate-200 max-h-48 overflow-y-auto scroll-thin divide-y divide-slate-100">
              {clientes.length === 0 ? (
                <div className="p-3 text-xs text-slate-500">Sin clientes</div>
              ) : clientes.map(c => {
                const marcado = exportForm.ids_cliente.includes(String(c.id));
                return (
                  <label key={c.id} className={`flex items-center gap-2 p-2 cursor-pointer text-sm ${marcado ? 'bg-brand-50/60' : 'bg-white'}`}>
                    <input type="checkbox" checked={marcado} onChange={() => toggleExportCliente(c.id)} />
                    <span className="flex-1 truncate">{nombreCliente(c)}</span>
                  </label>
                );
              })}
            </div>
            <p className="text-xs text-slate-500 mt-1">Vacío = todos los clientes.</p>
          </div>

          <div>
            <label className="label flex items-center justify-between">
              <span>Ascensores</span>
              <span className="text-xs font-normal text-slate-500">
                {exportForm.ids_ascensor.length === 0 ? 'Todos' : `${exportForm.ids_ascensor.length} seleccionado(s)`}
              </span>
            </label>
            <div className="rounded-lg ring-1 ring-slate-200 max-h-48 overflow-y-auto scroll-thin divide-y divide-slate-100">
              {ascensoresExportFiltrados.length === 0 ? (
                <div className="p-3 text-xs text-slate-500">
                  {exportForm.ids_cliente.length === 0 ? 'Sin ascensores' : 'Los clientes seleccionados no tienen ascensores'}
                </div>
              ) : ascensoresExportFiltrados.map(a => {
                const marcado = exportForm.ids_ascensor.includes(String(a.id));
                return (
                  <label key={a.id} className={`flex items-center gap-2 p-2 cursor-pointer text-sm ${marcado ? 'bg-brand-50/60' : 'bg-white'}`}>
                    <input type="checkbox" checked={marcado} onChange={() => toggleExportAscensor(a.id)} />
                    <div className="flex-1 min-w-0">
                      <div className="font-mono text-xs">{a.codigo}</div>
                      <div className="text-xs text-slate-500 truncate">{a.edificio?.nombre || nombreCliente(a.edificio?.cliente) || '—'}{a.ubicacion ? ` · ${a.ubicacion}` : ''}</div>
                    </div>
                  </label>
                );
              })}
            </div>
            <p className="text-xs text-slate-500 mt-1">Vacío = todos los ascensores de los clientes elegidos.</p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="label">Estado ejecución</label>
              <select className="select" value={exportForm.estado_ejecucion}
                onChange={e => setExportForm(f => ({ ...f, estado_ejecucion: e.target.value }))}>
                <option value="">Todos</option>
                <option value="Pendiente">Pendiente</option>
                <option value="En curso">En curso</option>
                <option value="Realizado">Realizado</option>
                <option value="Cancelado">Cancelado</option>
              </select>
            </div>
            <div>
              <label className="label">Desde</label>
              <input type="date" className="input" value={exportForm.desde}
                onChange={e => setExportForm(f => ({ ...f, desde: e.target.value }))} />
            </div>
            <div>
              <label className="label">Hasta</label>
              <input type="date" className="input" value={exportForm.hasta}
                onChange={e => setExportForm(f => ({ ...f, hasta: e.target.value }))} />
            </div>
          </div>

          <div>
            <label className="label">Formato</label>
            <div className="flex gap-3">
              <label className={`flex-1 flex items-center gap-2 p-3 rounded-lg ring-1 cursor-pointer ${exportForm.formato === 'excel' ? 'ring-brand-500 bg-brand-50/60' : 'ring-slate-200 bg-white'}`}>
                <input type="radio" name="formato" value="excel" checked={exportForm.formato === 'excel'}
                  onChange={() => setExportForm(f => ({ ...f, formato: 'excel' }))} />
                <span className="text-sm">Excel <span className="text-xs text-slate-500">(una hoja por cliente + resumen)</span></span>
              </label>
              <label className={`flex-1 flex items-center gap-2 p-3 rounded-lg ring-1 cursor-pointer ${exportForm.formato === 'pdf' ? 'ring-brand-500 bg-brand-50/60' : 'ring-slate-200 bg-white'}`}>
                <input type="radio" name="formato" value="pdf" checked={exportForm.formato === 'pdf'}
                  onChange={() => setExportForm(f => ({ ...f, formato: 'pdf' }))} />
                <span className="text-sm">PDF <span className="text-xs text-slate-500">(una sección por cliente)</span></span>
              </label>
            </div>
          </div>
        </form>
      </Modal>

      <ConfirmarEliminacion
        open={!!planAEliminar}
        onClose={() => setPlanAEliminar(null)}
        titulo="Eliminar plan de mantenimiento"
        palabraClave="ELIMINAR"
        deshabilitado={!impactoEliminacion}
        descripcion={
          <div className="space-y-2">
            <p>
              Se dará de baja el plan y <strong>TODO</strong> lo que generó, sin excepción:
              mantenimientos —incluidos los ya ejecutados—, cobros, abonos y facturas.
              Acción auditada y recuperable (los archivos se conservan).
            </p>
            {!impactoEliminacion && <p className="text-xs opacity-70">Calculando el impacto…</p>}
            {impactoEliminacion?.error && (
              <p className="text-xs opacity-70">No se pudo calcular el impacto; se borrará igual en cascada.</p>
            )}
            {impactoEliminacion && !impactoEliminacion.error && (
              <ul className="list-disc pl-4 text-xs space-y-0.5">
                <li>
                  <strong>{impactoEliminacion.servicios.total}</strong> mantenimientos
                  {' '}(<strong>{impactoEliminacion.servicios.ejecutados}</strong> ya ejecutados,
                  {' '}{impactoEliminacion.servicios.pendientes} pendientes)
                </li>
                {impactoEliminacion.cobros.total_abonado > 0 && (
                  <li className="font-semibold">
                    {formatMonto(impactoEliminacion.cobros.total_abonado, impactoEliminacion.cobros.moneda || undefined)}
                    {' '}ya cobrados en {impactoEliminacion.cobros.pagos} abonos — dejarán de figurar en los reportes contables
                  </li>
                )}
                {impactoEliminacion.cobros.facturas > 0 && (
                  <li>{impactoEliminacion.cobros.facturas} facturas emitidas</li>
                )}
                {impactoEliminacion.eventos.futuros > 0 && (
                  <li>{impactoEliminacion.eventos.futuros} eventos futuros programados</li>
                )}
              </ul>
            )}
          </div>
        }
        onConfirmar={async () => {
          try {
            await mantenimientosService.remove(planAEliminar.id);
            toast.success('Plan eliminado');
            setPlanAEliminar(null);
            cargar();
          } catch (err) {
            toast.error(err.response?.data?.error || 'Error al eliminar plan');
          }
        }}
      />
    </>
  );
}
