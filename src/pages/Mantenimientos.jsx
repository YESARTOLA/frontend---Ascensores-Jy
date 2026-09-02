import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { mantenimientosService, clientesService, ascensoresService, tiposServicioService, facturasService, archivosService } from '../services';
import PageHeader from '../components/common/PageHeader.jsx';
import Loader from '../components/common/Loader.jsx';
import Modal from '../components/common/Modal.jsx';
import ConfirmarEliminacion from '../components/common/ConfirmarEliminacion.jsx';
import EmptyState from '../components/common/EmptyState.jsx';
import Pagination, { usePaginatedList } from '../components/common/Pagination.jsx';
import { ListaMovil, FilaMovil, AccionFila } from '../components/common/ListaMovil.jsx';
import PanelFiltros from '../components/common/PanelFiltros.jsx';
import DateRangePicker from '../components/common/DateRangePicker.jsx';
import { useToast } from '../components/common/Toast.jsx';
import ClienteAutocomplete from '../components/common/ClienteAutocomplete.jsx';
import AscensoresFrecuenciaChecklist from '../components/common/AscensoresFrecuenciaChecklist.jsx';
import CronogramaPlan from '../components/mantenimientos/CronogramaPlan.jsx';
import { esAscensorServiciable } from '../utils/ascensoresSeleccion.js';
import { visitasEnMeses, etiquetaVisitas } from '../utils/frecuenciaPlan.js';
import { totalesDelPlan } from '../utils/planMantenimiento.js';
import { badgeEstado, formatFecha, formatFechaHora, formatMonto, formatDiasEjecucion, hoyISO, toYMDLima, nombreCliente, nombreEdificio } from '../utils/formatters.js';
import { TIPOS_COMPROBANTE, ejemploNumeroComprobante, tipoComprobanteSugerido } from '../utils/catalogosComprobante.js';
import { useAuth } from '../features/auth/AuthContext.jsx';
import { generarReportePorClientePDF } from '../utils/pdfReport.js';
import { etiquetaProgramacion } from '../utils/programacion.js';

const FORM_ID = 'form-nuevo-plan-mantenimiento';

// Un plan se define por: sus ascensores (cada uno con SU frecuencia), la
// duración en MESES y un monto global MENSUAL — el único importe facturable.
const inicial = {
  id_cliente: '', ascensores_seleccion: {}, id_tipo_servicio: '', tipo_plan: 'continuo',
  frecuencia: 'mensual', frecuencia_dias_custom: '', duracion_meses: '12',
  monto_mensual: '', cantidad_mantenimientos_gratuitos: '0',
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
  // Facturación MES A MES del plan: una factura y un pago por mes, por el monto
  // mensual pactado. `periodos` = { id_cobro, monto_mensual, meses: [...] } | null.
  const [periodos, setPeriodos] = useState(null);
  const [cargandoPeriodos, setCargandoPeriodos] = useState(false);
  const [forzando, setForzando] = useState(null);   // mes en el modal de forzar
  const [aprobandoPeriodo, setAprobandoPeriodo] = useState(false);
  const [mesExpandido, setMesExpandido] = useState(null); // numero_mes con detalle abierto
  // Registro de la factura del MES aprobado sin salir del plan: mismo contrato
  // que Gestión de cobros → "Por facturar" (una factura por cuota del mes).
  const [facturandoMes, setFacturandoMes] = useState(null); // fila de `periodos.meses` con cuota | null
  const [facturaMes, setFacturaMes] = useState({ numero_factura: '', tipo_comprobante: TIPOS_COMPROBANTE[0].codigo, fecha_emision: hoyISO(), id_archivo: null });
  const [guardandoFacturaMes, setGuardandoFacturaMes] = useState(false);
  const [editandoGratuitos, setEditandoGratuitos] = useState(false);
  const [nuevoCupoGratuitos, setNuevoCupoGratuitos] = useState('');
  const [guardandoGratuitos, setGuardandoGratuitos] = useState(false);
  // Cronograma del plan: todas las fechas de cada ascensor, con las que se
  // pueden omitir (desactivar) las que no se ejecutarán.
  const [programacion, setProgramacion] = useState(null);
  const [cargandoProgramacion, setCargandoProgramacion] = useState(false);
  const [guardandoProgramacion, setGuardandoProgramacion] = useState(false);
  const [reconstruyendo, setReconstruyendo] = useState(false);
  const [visitasSel, setVisitasSel] = useState({});   // id_visita → true
  const [omitiendo, setOmitiendo] = useState(null);   // { ids, motivo } en el modal
  // Edición del monto mensual: el único precio del plan.
  const [editandoMonto, setEditandoMonto] = useState(false);
  const [montoMensualForm, setMontoMensualForm] = useState('');
  const [guardandoMonto, setGuardandoMonto] = useState(false);
  const [openExportar, setOpenExportar] = useState(false);
  const [exportForm, setExportForm] = useState({ ids_cliente: [], ids_ascensor: [], estado_ejecucion: '', desde: '', hasta: '', formato: 'excel' });
  const [exportando, setExportando] = useState(false);
  const toast = useToast();
  const { esSuperAdmin, esAdmin, esCoordinador, esContabilidad, puedeVerPrecio } = useAuth();
  const puedeCrear = esSuperAdmin || esAdmin || esCoordinador;
  const puedeExportar = esSuperAdmin || esAdmin || esCoordinador || esContabilidad;
  const puedeEditarPlan = esSuperAdmin || esAdmin;
  // Mismos roles que admite POST /facturas en el backend (facturasRoutes).
  const puedeFacturarPlan = esSuperAdmin || esAdmin || esContabilidad;
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
  // El cupo gratuito cuenta MESES del plan, no visitas sueltas: la unidad de
  // cobro es el mes.
  const cupoMaximoGratuitos = esContinuo ? Number(form.duracion_meses || 0) : 1;

  // El plan NO tiene precio por ascensor: se cobra un monto global mensual. De
  // cada ascensor solo interesa su frecuencia, que define cuántas visitas
  // recibirá a lo largo de la duración del plan.
  const ascensoresSeleccionados = ascensoresF.filter(a => form.ascensores_seleccion[a.id]);
  const seleccionOk = ascensoresSeleccionados.length > 0;
  // Economía prevista del plan: los meses gratuitos NO se cobran, así que el
  // total del contrato es `monto_mensual × (meses − gratuitos)`.
  const totalesForm = totalesDelPlan({
    monto_mensual: form.monto_mensual,
    duracion_meses: form.duracion_meses,
    cantidad_mantenimientos_gratuitos: esTipoPreventivo ? form.cantidad_mantenimientos_gratuitos : 0,
    tipo_plan: form.tipo_plan
  });

  // Total de visitas previsto del plan (suma de todos los ascensores). Es una
  // anticipación para el usuario: el cronograma real lo calcula el backend.
  const totalVisitasPrevistas = ascensoresSeleccionados.reduce((acc, a) => {
    const sel = form.ascensores_seleccion[a.id];
    const fr = frecuencias.find(f => f.codigo === sel?.frecuencia);
    return acc + (visitasEnMeses(fr, esContinuo ? form.duracion_meses : 1, sel?.frecuencia_dias_custom) || 0);
  }, 0);

  // Fechas del cronograma marcadas para omitir/reactivar en bloque.
  const idsVisitasSel = useMemo(
    () => Object.keys(visitasSel).filter(k => visitasSel[k]).map(Number),
    [visitasSel]
  );

  // Al cambiar el subtipo se limpia la selección: el subtipo define de qué
  // módulo es el plan y con él los ascensores elegibles.
  const cambiarSubtipoPlan = (id_tipo_servicio) =>
    setForm(f => ({ ...f, id_tipo_servicio, ascensores_seleccion: {} }));

  // Selecciona/deselecciona un ascensor del plan. Un plan puede cubrir VARIOS
  // ascensores (incluso de distintos edificios), cada uno con su propia
  // frecuencia; al marcarlo hereda la frecuencia por defecto del plan.
  const toggleAscensorPlan = (idAsc) =>
    setForm(f => {
      const sel = { ...f.ascensores_seleccion };
      if (sel[idAsc]) { delete sel[idAsc]; return { ...f, ascensores_seleccion: sel }; }
      sel[idAsc] = { frecuencia: f.frecuencia, frecuencia_dias_custom: f.frecuencia_dias_custom || '' };
      return { ...f, ascensores_seleccion: sel };
    });

  // Cambia la frecuencia (o los días de la personalizada) de UN ascensor.
  const cambiarFrecuenciaAscensor = (idAsc, parcial) =>
    setForm(f => ({
      ...f,
      ascensores_seleccion: {
        ...f.ascensores_seleccion,
        [idAsc]: { ...f.ascensores_seleccion[idAsc], ...parcial }
      }
    }));

  const abrirNuevo = () => {
    setEditando(null);
    setForm(inicial);
    setOpen(true);
  };

  const abrirEditar = (plan) => {
    setEditando(plan.id);
    // Se precarga el plan completo: sus ascensores marcados con la frecuencia
    // vigente de cada uno (o la del plan, en planes antiguos). Todo es editable.
    const seleccion = {};
    (plan.ascensores || []).forEach(pa => {
      if (!pa.ascensor) return;
      seleccion[pa.ascensor.id] = {
        frecuencia: pa.frecuencia || plan.frecuencia || 'mensual',
        frecuencia_dias_custom: (pa.frecuencia_dias_custom ?? plan.frecuencia_dias_custom) != null
          ? String(pa.frecuencia_dias_custom ?? plan.frecuencia_dias_custom)
          : ''
      };
    });
    setForm({
      id_cliente: String(plan.id_cliente || ''),
      ascensores_seleccion: seleccion,
      id_tipo_servicio: String(plan.id_tipo_servicio || ''),
      tipo_plan: plan.tipo_plan || 'continuo',
      frecuencia: plan.frecuencia || 'mensual',
      frecuencia_dias_custom: plan.frecuencia_dias_custom != null ? String(plan.frecuencia_dias_custom) : '',
      duracion_meses: plan.duracion_meses != null ? String(plan.duracion_meses) : '12',
      monto_mensual: plan.monto_mensual != null ? String(Number(plan.monto_mensual)) : '',
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
    // Mismas exigencias al crear y al editar: un plan siempre necesita subtipo,
    // al menos un ascensor y, si es continuo, su duración.
    if (!form.id_tipo_servicio) return toast.error('Seleccione el subtipo de servicio');
    if (ascensoresSeleccionados.length === 0) return toast.error('Seleccione al menos un ascensor');
    if (esContinuo && !(Number(form.duracion_meses) >= 1)) {
      return toast.error('Indique la duración del plan en meses');
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
        // Monto global mensual: el único importe facturable del plan. Se cobra
        // igual cada mes sin importar cuántos mantenimientos caigan en él.
        monto_mensual: Number(form.monto_mensual || 0),
        cantidad_mantenimientos_gratuitos: esTipoPreventivo
          ? Number(form.cantidad_mantenimientos_gratuitos || 0)
          : 0
      };
      // Ascensores del plan con la frecuencia de cada uno. Viaja igual al crear
      // y al editar: es el conjunto FINAL, así que el backend deduce qué entra y
      // qué sale (y rechaza quitar uno con mantenimientos ya ejecutados).
      const frecuenciasAsc = ascensoresSeleccionados.map(a => {
        const sel = form.ascensores_seleccion[a.id] || {};
        const fr = frecuencias.find(f => f.codigo === sel.frecuencia);
        return {
          id_ascensor: a.id,
          frecuencia: sel.frecuencia || form.frecuencia,
          ...(fr?.unidad === 'custom' ? { frecuencia_dias_custom: Number(sel.frecuencia_dias_custom) } : {})
        };
      });
      payload.id_cliente = form.id_cliente;
      payload.ascensores = frecuenciasAsc;
      if (esContinuo) {
        payload.frecuencia = form.frecuencia;
        payload.duracion_meses = Number(form.duracion_meses);
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

  // Frecuencias del plan: cada ascensor tiene la suya, así que la columna
  // resume las distintas ("Mensual, Trimestral") en vez de una sola.
  const labelFrecuencia = (m) => {
    if (m.tipo_plan === 'eventual') return '—';
    const etiqueta = (cod) => frecuencias.find(f => f.codigo === cod)?.etiqueta || cod;
    const propias = [...new Set(
      (m.ascensores || []).map(pa => pa.frecuencia).filter(Boolean)
    )];
    if (propias.length > 0) return propias.map(etiqueta).join(', ');
    return m.frecuencia ? etiqueta(m.frecuencia) : '';
  };

  // Soporte ?plan=ID en la URL: lo usan las notificaciones de un plan de
  // mantenimiento, que antes solo llevaban al listado y obligaban a buscarlo.
  // El plan se pide por id (no se busca en la página cargada, que puede no
  // contenerlo) y se abre su detalle; luego se limpia el parámetro para que
  // recargar la página no lo reabra.
  const [searchParams, setSearchParams] = useSearchParams();
  const planUrlAbiertoRef = useRef(null);
  useEffect(() => {
    const idPlan = searchParams.get('plan');
    if (!idPlan || planUrlAbiertoRef.current === idPlan) return;
    planUrlAbiertoRef.current = idPlan;
    mantenimientosService.list({ id: idPlan })
      .then(lista => {
        const plan = (Array.isArray(lista) ? lista : [])[0];
        if (plan) abrirDetallePlan(plan);
        else toast.error('El plan de la notificación ya no existe');
      })
      .catch(() => toast.error('No se pudo abrir el plan'))
      .finally(() => {
        const next = new URLSearchParams(searchParams);
        next.delete('plan');
        setSearchParams(next, { replace: true });
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

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
    setProgramacion(null);
    setCargandoProgramacion(true);
    mantenimientosService.programacion(plan.id)
      .then(setProgramacion)
      .catch(() => setProgramacion(null))
      .finally(() => setCargandoProgramacion(false));
  };

  const recargarPeriodos = () => {
    if (!planDetalle) return;
    setCargandoPeriodos(true);
    mantenimientosService.periodos(planDetalle.id)
      .then(setPeriodos)
      .catch(() => {})
      .finally(() => setCargandoPeriodos(false));
  };

  const recargarProgramacion = () => {
    if (!planDetalle) return;
    setCargandoProgramacion(true);
    mantenimientosService.programacion(planDetalle.id)
      .then(setProgramacion)
      .catch(() => {})
      .finally(() => setCargandoProgramacion(false));
  };

  // Aprueba un MES del plan: crea su cuota por el monto mensual pactado en el
  // cobro único del plan, lista para emitir UNA factura y recibir UN pago.
  // Un mes con mantenimientos pendientes requiere aprobación forzada, pero el
  // importe es el mismo: el monto mensual no varía con lo ejecutado.
  const aprobarPeriodoUI = async (p, { forzar = false } = {}) => {
    if (aprobandoPeriodo || !planDetalle) return;
    setAprobandoPeriodo(true);
    try {
      const r = await mantenimientosService.aprobarPeriodo(planDetalle.id, { numero_mes: p.numero_mes, forzar });
      toast.success(p.es_gratuito ? `${p.etiqueta} registrado` : `${p.etiqueta} aprobado y listo para facturar`);
      setForzando(null);
      recargarPeriodos();
      // El mes aprobado continúa con SU factura: se abre el registro de una vez
      // con la cuota recién creada (un mes gratuito no factura).
      if (!p.es_gratuito && r?.cuota && puedeFacturarPlan) {
        abrirFacturarMes({ ...p, cuota: { ...r.cuota, monto: Number(r.cuota.monto) } });
      }
    } catch (err) {
      toast.error(err.response?.data?.error || 'Error al aprobar el mes');
    } finally {
      setAprobandoPeriodo(false);
    }
  };

  // Abre el registro de la factura del mes aprobado (una factura por cuota,
  // mismo contrato que Gestión de cobros → "Por facturar").
  const abrirFacturarMes = (p) => {
    setFacturaMes({
      numero_factura: '',
      // Sugerencia por el documento del cliente (RUC → Factura, DNI → Boleta).
      tipo_comprobante: tipoComprobanteSugerido(planDetalle?.cliente?.tipo_documento),
      fecha_emision: hoyISO(),
      id_archivo: null
    });
    setFacturandoMes(p);
  };

  const subirArchivoFacturaMes = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const fd = new FormData(); fd.append('archivo', file);
    try {
      const r = await archivosService.upload(fd, 'facturas');
      setFacturaMes(f => ({ ...f, id_archivo: r.id }));
      toast.success('Archivo cargado');
    } catch { toast.error('Error subiendo archivo'); }
  };

  // Emite la factura del MES: contra la cuota del cobro único del plan. El
  // monto lo fija la cuota (el backend lo valida igual).
  const guardarFacturaMes = async () => {
    if (guardandoFacturaMes || !facturandoMes || !planDetalle) return;
    if (!facturaMes.numero_factura.trim()) return toast.error('Número de comprobante obligatorio');
    setGuardandoFacturaMes(true);
    try {
      await facturasService.create({
        numero_factura: facturaMes.numero_factura.trim(),
        tipo_comprobante: facturaMes.tipo_comprobante,
        fecha_emision: facturaMes.fecha_emision,
        monto: Number(facturandoMes.cuota?.monto ?? facturandoMes.monto),
        id_cuota: facturandoMes.cuota?.id,
        id_mantenimiento_plan: planDetalle.id,
        id_archivo: facturaMes.id_archivo
      });
      toast.success(`${facturandoMes.etiqueta} facturado`);
      setFacturandoMes(null);
      recargarPeriodos();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Error al registrar la factura del mes');
    } finally {
      setGuardandoFacturaMes(false);
    }
  };

  // Repara el cronograma de un plan que se quedó sin programación (planes
  // creados antes del modelo mensual). Engancha los servicios ya existentes, así
  // que el avance por mes y las visitas pendientes aparecen de inmediato.
  const reconstruirProgramacionUI = async () => {
    if (!planDetalle || reconstruyendo) return;
    setReconstruyendo(true);
    try {
      const r = await mantenimientosService.reconstruirProgramacion(planDetalle.id);
      toast.success(
        r.creadas > 0
          ? `Programación generada: ${r.creadas} fecha(s)${r.enganchadas ? ` · ${r.enganchadas} con mantenimiento ya realizado` : ''}`
          : 'La programación ya estaba completa'
      );
      recargarProgramacion();
      recargarPeriodos();
      recargarInstanciasPlan();
      recargarInstancias();
      cargar();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Error al generar la programación');
    } finally {
      setReconstruyendo(false);
    }
  };

  // Omite (o reactiva) fechas del cronograma. Omitir no cambia el monto mensual.
  const cambiarActivoVisitas = async (ids, activo, motivo) => {
    if (!planDetalle || guardandoProgramacion || ids.length === 0) return;
    setGuardandoProgramacion(true);
    try {
      const r = await mantenimientosService.cambiarActivoProgramacion(planDetalle.id, { ids, activo, motivo });
      toast.success(
        activo === 1
          ? `${r.actualizadas} fecha(s) reactivada(s)`
          : `${r.actualizadas} fecha(s) omitida(s)${r.servicios_dados_de_baja ? ` · ${r.servicios_dados_de_baja} mantenimiento(s) pendiente(s) dado(s) de baja` : ''}`
      );
      setOmitiendo(null);
      setVisitasSel({});
      recargarProgramacion();
      recargarPeriodos();
      recargarInstanciasPlan();
      recargarInstancias();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Error al actualizar la programación');
    } finally {
      setGuardandoProgramacion(false);
    }
  };

  const cerrarDetallePlan = () => {
    setPlanDetalle(null);
    setInstanciasPlan([]);
    setEditandoGratuitos(false);
    setEditandoMonto(false);
    setPeriodos(null);
    setProgramacion(null);
    setForzando(null);
    setFacturandoMes(null);
    setOmitiendo(null);
    setVisitasSel({});
    setMesExpandido(null);
  };

  const recargarInstanciasPlan = () => {
    if (!planDetalle) return;
    setCargandoInstanciasPlan(true);
    mantenimientosService.instancias({ id_plan: planDetalle.id })
      .then(setInstanciasPlan)
      .catch(() => {})
      .finally(() => setCargandoInstanciasPlan(false));
  };

  // --- Monto mensual: el único precio del plan -----------------------------

  const iniciarEdicionMonto = () => {
    setMontoMensualForm(planDetalle?.monto_mensual != null ? String(Number(planDetalle.monto_mensual)) : '');
    setEditandoMonto(true);
  };

  const guardarMontoMensual = async () => {
    if (!planDetalle || guardandoMonto) return;
    const monto = Number(montoMensualForm);
    if (!Number.isFinite(monto) || monto < 0) return toast.error('El monto mensual debe ser un número mayor o igual a 0');
    setGuardandoMonto(true);
    try {
      const r = await mantenimientosService.actualizarMontoMensual(planDetalle.id, { monto_mensual: monto });
      setPlanDetalle(p => (p ? { ...p, monto_mensual: r.monto_mensual, moneda: r.moneda } : p));
      setEditandoMonto(false);
      toast.success(
        r.cuotas_ajustadas > 0
          ? `Monto mensual actualizado (${r.cuotas_ajustadas} mes(es) pendiente(s) al nuevo importe)`
          : 'Monto mensual actualizado'
      );
      if (r.cuotas_bloqueadas > 0) {
        toast.info(`${r.cuotas_bloqueadas} mes(es) ya facturado(s) conservan su importe`);
      }
      recargarPeriodos();
      cargar();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Error al actualizar el monto mensual');
    } finally {
      setGuardandoMonto(false);
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
    const cantTotal = Number(planDetalle.duracion_meses || 1);
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
          <PanelFiltros
            activos={Object.values(filtroInst).filter(Boolean).length}
            onLimpiar={() => setFiltroInst({ q: '', id_cliente: '', id_ascensor: '', estado_ejecucion: '', desde: '', hasta: '' })}>
            <div className="p-3 sm:p-4 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
              <input className="input col-span-2"
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
                className="btn-secondary col-span-2 sm:col-span-3 lg:col-span-6"
              >Limpiar filtros</button>
            </div>
          </PanelFiltros>

          <div className="card">
            {cargandoInstancias ? <Loader /> : instancias.length === 0 ? <EmptyState title="Sin mantenimientos" subtitle="Crea un plan o ajusta los filtros." /> : (
              <>
              <div className="hidden md:block overflow-x-auto scroll-thin">
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
                        <td className="table-td text-xs" title={etiquetaProgramacion(it).detalle}>{etiquetaProgramacion(it).texto}</td>
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

              {/* MÓVIL. Cada mantenimiento programado como tarjeta: el técnico
                  ve dónde le toca, cuándo y en qué estado va, sin arrastrar
                  diez columnas de lado a lado. */}
              <ListaMovil>
                {instancias.map(it => (
                  <FilaMovil
                    key={`m-${it.tipo_instancia}-${it.id_servicio || it.id_evento}`}
                    to={it.id_servicio ? `/servicios/${it.id_servicio}` : undefined}
                    codigo={it.codigo_servicio || undefined}
                    titulo={it.cliente_nombre || '—'}
                    subtitulo={[it.ascensor_codigo, it.tipo_servicio].filter(Boolean).join(' · ')}
                    badge={<span className={badgeEstado(it.estado_ejecucion)}>{it.estado_ejecucion}</span>}
                    chips={
                      <>
                        {it.es_mantenimiento_gratuito && <span className="badge-green text-[10px]">Gratis</span>}
                        {!it.codigo_servicio && <span className="badge-gray text-[10px]">Servicio no creado</span>}
                      </>
                    }
                    datos={[
                      ['Programada', etiquetaProgramacion(it).texto],
                      ['Técnico', it.tecnicos || 'Sin asignar'],
                      ['Inicio', it.fecha_inicio_real ? formatFechaHora(it.fecha_inicio_real) : null],
                      ['Término', it.fecha_fin_real ? formatFechaHora(it.fecha_fin_real) : null],
                      ['Días', formatDiasEjecucion(it.dias_ejecucion)]
                    ]}
                    acciones={it.id_servicio
                      ? <AccionFila to={`/servicios/${it.id_servicio}`}>Ver detalle</AccionFila>
                      : null}
                  />
                ))}
              </ListaMovil>

              <Pagination page={pageInst} pageSize={pageSizeInst} total={totalInstancias} totalPages={totalPagesInst}
                onPage={setPageInst} onPageSize={setPageSizeInst} />
              </>
            )}
          </div>
        </>
      ) : (
        <>
        <PanelFiltros
          activos={filtroPlanes.q ? 1 : 0}
          onLimpiar={() => setFiltroPlanes({ q: '' })}>
          <div className="p-3 sm:p-4 grid grid-cols-1 sm:grid-cols-3 gap-2">
            <input className="input sm:col-span-2"
              placeholder="Buscar por edificio/obra, cliente, código o tipo de ascensor o código de servicio…"
              value={filtroPlanes.q}
              onChange={e => setFiltroPlanes({ q: e.target.value })} />
            <button
              onClick={() => setFiltroPlanes({ q: '' })}
              className="btn-secondary"
            >Limpiar</button>
          </div>
        </PanelFiltros>
        <div className="card">
          {loading ? <Loader /> : data.length === 0 ? <EmptyState title="Sin planes" /> : (
            <>
            <div className="hidden md:block overflow-x-auto scroll-thin">
              <table className="table-base">
                <thead><tr>
                  <th className="table-th">Edificio-Obra / Ascensor</th><th className="table-th">Tipo</th>
                  <th className="table-th">Frecuencia</th>
                  <th className="table-th text-center">Meses</th>
                  {puedeVerPrecio && <th className="table-th text-right">Monto mensual</th>}
                  <th className="table-th">Inicio</th>
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
                        <td className="table-td text-xs">{labelFrecuencia(m)} <span className="text-slate-400">({m.tipo_plan})</span></td>
                        <td className="table-td text-xs text-center font-mono">
                          {m.tipo_plan === 'eventual' ? '—' : (m.duracion_meses ?? '—')}
                        </td>
                        {puedeVerPrecio && (
                          <td className="table-td text-xs text-right font-mono">
                            {formatMonto(m.monto_mensual, m.moneda)}
                          </td>
                        )}
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

            {/* MÓVIL: el plan como tarjeta, con su avance de ejecución. */}
            <ListaMovil>
              {data.map(m => {
                const aplicaGratuitos = !!m.tipo_servicio?.es_preventivo && Number(m.cantidad_mantenimientos_gratuitos || 0) > 0;
                const totalPlan = m.tipo_plan === 'eventual'
                  ? 1
                  : (m.cantidad_mantenimientos != null ? Number(m.cantidad_mantenimientos) : null);
                const ejecutadosTotal = Number(m.mantenimientos_ejecutados_total || 0);
                const resumenAsc = resumenAscensoresPlan(m);
                const codigosAsc = resumenAsc.ascensores.map(a => a.codigo).filter(Boolean);
                return (
                  <FilaMovil
                    key={`p-${m.id}`}
                    onClick={() => abrirDetallePlan(m)}
                    titulo={resumenAsc.edificio}
                    subtitulo={[codigosAsc.join(', ') || null, m.tipo_servicio?.nombre].filter(Boolean).join(' · ')}
                    badge={<span className={badgeEstado(m.estado_plan)}>{m.estado_plan}</span>}
                    chips={
                      <>
                        <span className="badge-gray text-[10px]">{labelFrecuencia(m)} · {m.tipo_plan}</span>
                        {aplicaGratuitos && <span className="badge-green text-[10px]">{m.cantidad_mantenimientos_gratuitos} gratis</span>}
                      </>
                    }
                    datos={[
                      ['Inicio', `${formatFecha(m.fecha_inicio)} ${m.hora_programada || ''}`.trim()],
                      ['Meses', m.tipo_plan === 'eventual' ? null : (m.duracion_meses ?? null)],
                      ['Ejecutados', totalPlan != null ? `${ejecutadosTotal}/${totalPlan}` : null],
                      ...(puedeVerPrecio ? [['Monto mensual', formatMonto(m.monto_mensual, m.moneda)]] : [])
                    ]}
                    acciones={
                      <>
                        <AccionFila onClick={() => abrirDetallePlan(m)}>Ver detalle</AccionFila>
                        {puedeCrear && <AccionFila onClick={() => abrirEditar(m)}>Editar</AccionFila>}
                        {puedeEliminarPlan && <AccionFila tono="rose" onClick={() => setPlanAEliminar(m)}>Eliminar</AccionFila>}
                      </>
                    }
                  />
                );
              })}
            </ListaMovil>
            </>
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
                  <div className="text-xs uppercase tracking-wide text-slate-500">Ascensores y frecuencia</div>
                  {(planDetalle.ascensores || []).length === 0 ? (
                    <div className="text-slate-800">—</div>
                  ) : (
                    <ul className="text-slate-800 space-y-0.5">
                      {planDetalle.ascensores.map(pa => {
                        const codFrec = pa.frecuencia || planDetalle.frecuencia;
                        const etq = frecuencias.find(f => f.codigo === codFrec)?.etiqueta || codFrec || '—';
                        const dias = pa.frecuencia_dias_custom ?? planDetalle.frecuencia_dias_custom;
                        return (
                          <li key={pa.id} className="flex items-center justify-between gap-3">
                            <span className="font-mono">
                              {pa.ascensor?.codigo}
                              {pa.ascensor?.ubicacion && <span className="text-slate-500 font-sans"> · {pa.ascensor.ubicacion}</span>}
                            </span>
                            <span className="text-xs text-slate-600 shrink-0">
                              {etq}{codFrec === 'custom' && dias ? ` (${dias} d)` : ''}
                            </span>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </div>
                {puedeVerPrecio && (
                  <div>
                    <div className="text-xs uppercase tracking-wide text-slate-500 flex items-center gap-2">
                      Monto mensual
                      {puedeEditarPlan && !editandoMonto && (
                        <button type="button" onClick={iniciarEdicionMonto}
                          className="text-[10px] text-brand-700 hover:underline normal-case tracking-normal">
                          Editar
                        </button>
                      )}
                    </div>
                    {editandoMonto ? (
                      <div className="mt-1 space-y-2">
                        <input type="number" min="0" step="0.01"
                          className="input w-36 text-right font-mono !py-1"
                          value={montoMensualForm}
                          disabled={guardandoMonto}
                          onChange={e => setMontoMensualForm(e.target.value)} />
                        <div className="flex items-center gap-2">
                          <button type="button" onClick={guardarMontoMensual} disabled={guardandoMonto}
                            className="btn-primary text-xs !py-1 !px-2">
                            {guardandoMonto ? 'Guardando…' : 'Guardar'}
                          </button>
                          <button type="button" onClick={() => setEditandoMonto(false)} disabled={guardandoMonto}
                            className="btn-secondary text-xs !py-1 !px-2">Cancelar</button>
                        </div>
                        <p className="text-[10px] text-slate-500">
                          Rige para los meses aún no facturados. Los meses ya facturados o con pagos conservan su importe.
                        </p>
                      </div>
                    ) : (
                      <>
                        <div className="text-slate-800 font-mono text-base">
                          {formatMonto(planDetalle.monto_mensual, planDetalle.moneda)}<span className="text-xs text-slate-500 font-sans"> / mes</span>
                        </div>
                        {planDetalle.tipo_plan === 'continuo' && planDetalle.duracion_meses > 0 && (() => {
                          const tp = totalesDelPlan(planDetalle);
                          return (
                            <div className="text-[11px] text-slate-500">
                              Total del plan: {formatMonto(tp.total, planDetalle.moneda)}
                              {tp.meses_gratuitos > 0
                                ? ` (${tp.meses_facturables} de ${tp.meses} meses · ${tp.meses_gratuitos} gratuito(s))`
                                : ` (${tp.meses} meses)`}
                            </div>
                          );
                        })()}
                      </>
                    )}
                  </div>
                )}
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
                  <div className="text-xs uppercase tracking-wide text-slate-500">Duración</div>
                  <div className="text-slate-800">
                    {planDetalle.tipo_plan === 'eventual'
                      ? 'Eventual (una vez)'
                      : `${planDetalle.duracion_meses ?? '—'} mes(es)`}
                  </div>
                </div>
                <div>
                  <div className="text-xs uppercase tracking-wide text-slate-500">Fecha inicio</div>
                  <div className="text-slate-800">{formatFecha(planDetalle.fecha_inicio)} {planDetalle.hora_programada || ''}</div>
                </div>
                <div>
                  <div className="text-xs uppercase tracking-wide text-slate-500">Mantenimientos programados</div>
                  <div className="text-slate-800 font-mono">
                    {programacion ? `${programacion.total_activas} de ${programacion.total_visitas}` : (planDetalle.cantidad_mantenimientos ?? '—')}
                    {programacion && programacion.total_visitas > programacion.total_activas && (
                      <span className="text-xs text-amber-700 font-sans ml-1">
                        ({programacion.total_visitas - programacion.total_activas} omitido(s))
                      </span>
                    )}
                  </div>
                </div>
                {!!planDetalle.tipo_servicio?.es_preventivo && (
                  <div>
                    <div className="text-xs uppercase tracking-wide text-slate-500 flex items-center gap-2">
                      Meses gratuitos
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
                          max={planDetalle.tipo_plan === 'eventual' ? 1 : (planDetalle.duracion_meses || 1)}
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
                        El cupo cuenta MESES del plan: los primeros N meses no generan cobro.
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

              {/* CRONOGRAMA. La vista por defecto agrupa por DÍA, no por
                  ascensor: lo que decide la operación es a cuántos ascensores
                  se atiende en una misma salida. Ver components/mantenimientos/
                  CronogramaPlan.jsx. */}
              <div className="border-t border-slate-100 pt-4">
                <div className="flex items-center justify-between mb-3 gap-3 flex-wrap">
                  <h4 className="font-medium text-slate-800">Programación</h4>
                  {puedeCrear && idsVisitasSel.length > 0 && (
                    <div className="flex items-center gap-2">
                      <span className="text-[11px] text-carbon-500">
                        {idsVisitasSel.length} fecha(s) seleccionada(s)
                      </span>
                      <button type="button" disabled={guardandoProgramacion}
                        onClick={() => setOmitiendo({ ids: idsVisitasSel, motivo: '' })}
                        className="btn-secondary text-xs !py-1 !px-2">
                        Omitir
                      </button>
                      <button type="button" disabled={guardandoProgramacion}
                        onClick={() => cambiarActivoVisitas(idsVisitasSel, 1)}
                        className="btn-secondary text-xs !py-1 !px-2">
                        Reactivar
                      </button>
                      <button type="button" onClick={() => setVisitasSel({})}
                        className="text-[11px] text-carbon-500 hover:text-carbon-700 hover:underline">
                        Limpiar
                      </button>
                    </div>
                  )}
                </div>
                {/* Plan sin cronograma: son los creados antes del modelo mensual,
                    cuya programación nació vacía. Se ven "0 de 0", sus meses van
                    "0/0" y aquí abajo solo aparecen los servicios ya creados, sin
                    las visitas pendientes. Se repara desde este mismo botón. */}
                {!cargandoProgramacion && programacion && programacion.total_visitas === 0 && (
                  <div className="mb-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
                    <p className="font-medium">Este plan no tiene programación generada.</p>
                    <p className="mt-1">
                      Por eso no se ven las fechas ni los mantenimientos pendientes, y los meses figuran en 0/0.
                      Al generarla se crean las fechas de cada ascensor según su frecuencia y se enlazan los
                      mantenimientos que ya existen.
                    </p>
                    {puedeEditarPlan && (
                      <button type="button" onClick={reconstruirProgramacionUI} disabled={reconstruyendo}
                        className="btn-primary text-xs !py-1 !px-2 mt-2">
                        {reconstruyendo ? 'Generando…' : 'Generar programación'}
                      </button>
                    )}
                  </div>
                )}
                {cargandoProgramacion ? <Loader /> : (
                  <CronogramaPlan
                    programacion={programacion}
                    seleccion={visitasSel}
                    puedeEditar={puedeCrear}
                    onToggle={(id) => setVisitasSel(sel => {
                      const n = { ...sel };
                      if (n[id]) delete n[id]; else n[id] = true;
                      return n;
                    })}
                    onToggleVarias={(ids) => setVisitasSel(sel => {
                      const n = { ...sel };
                      const todas = ids.every(id => n[id]);
                      ids.forEach(id => { if (todas) delete n[id]; else n[id] = true; });
                      return n;
                    })}
                  />
                )}
              </div>


              {puedeVerPrecio && (
                <div className="border-t border-slate-100 pt-4">
                  <div className="flex items-center justify-between mb-3 gap-3">
                    <h4 className="font-medium text-slate-800">Facturación mensual</h4>
                    <div className="text-right">
                      <span className="text-[11px] text-slate-500 block">Un solo cobro y una sola factura por mes, con el detalle de todos los mantenimientos de ese mes.</span>
                      {periodos?.id_cobro && (
                        <Link to={`/cobros/${periodos.id_cobro}`} className="text-[11px] text-brand-700 hover:underline">
                          Ver cobro del plan (abonos y facturas) →
                        </Link>
                      )}
                    </div>
                  </div>
                  {cargandoPeriodos ? <Loader /> : !periodos || (periodos.meses || []).length === 0 ? (
                    <p className="text-xs text-slate-500">Sin meses aún.</p>
                  ) : !periodos.id_cobro ? (
                    <p className="text-xs text-amber-600">Este plan no tiene un cobro asociado; no admite facturación mensual.</p>
                  ) : (
                    <div className="overflow-x-auto scroll-thin">
                      <table className="table-base">
                        <thead><tr>
                          <th className="table-th">Mes</th>
                          <th className="table-th">Periodo</th>
                          <th className="table-th text-center">Realizados</th>
                          <th className="table-th text-right">Monto</th>
                          <th className="table-th">Estado</th>
                          <th className="table-th text-right">Acciones</th>
                        </tr></thead>
                        <tbody className="divide-y divide-slate-100">
                          {periodos.meses.map(p => (
                            <Fragment key={p.numero_mes}>
                              <tr className="table-row-hover">
                                <td className="table-td">
                                  <button type="button" onClick={() => setMesExpandido(m => (m === p.numero_mes ? null : p.numero_mes))}
                                    className="text-brand-700 hover:underline text-xs">
                                    {mesExpandido === p.numero_mes ? '▾' : '▸'} {p.etiqueta}
                                  </button>
                                </td>
                                <td className="table-td text-xs text-slate-500">{formatFecha(p.desde)} → {formatFecha(p.hasta)}</td>
                                <td className="table-td text-center font-mono">
                                  {p.realizadas}/{p.total_visitas}
                                  {p.omitidas > 0 && <span className="text-[10px] text-amber-700 ml-1">+{p.omitidas} om.</span>}
                                </td>
                                <td className="table-td text-right font-mono">
                                  {p.es_gratuito ? <span className="badge-green">Gratuito</span> : formatMonto(p.monto, p.moneda)}
                                </td>
                                <td className="table-td"><span className={badgeEstado(p.estado_periodo)}>{p.estado_periodo}</span></td>
                                <td className="table-td text-right whitespace-nowrap">
                                  {/* Un mes gratuito se registra pero no se factura: su cuota
                                      nace en 0 y saldada, y no entra a Gestión de cobros.
                                      Un plan no activo no aprueba meses nuevos (espejo del
                                      guard del backend); lo ya aprobado sigue su curso. */}
                                  {puedeEditarPlan && planDetalle.estado_plan === 'activo' && !p.cuota && p.completo && (
                                    <button type="button" onClick={() => aprobarPeriodoUI(p)} disabled={aprobandoPeriodo}
                                      className="btn-primary text-xs !py-1 !px-2">
                                      {p.es_gratuito ? 'Registrar mes' : 'Aprobar y facturar'}
                                    </button>
                                  )}
                                  {puedeEditarPlan && planDetalle.estado_plan === 'activo' && !p.cuota && !p.completo && (
                                    <button type="button" onClick={() => setForzando(p)}
                                      className="btn-secondary text-xs !py-1 !px-2">Aprobar igual</button>
                                  )}
                                  {/* Mes aprobado sin factura: el registro del comprobante se
                                      hace aquí mismo (equivale a Cobros → "Por facturar"). */}
                                  {puedeFacturarPlan && p.cuota && !p.es_gratuito && p.estado_periodo === 'aprobado' && (
                                    <button type="button" onClick={() => abrirFacturarMes(p)}
                                      className="btn-primary text-xs !py-1 !px-2">Registrar factura</button>
                                  )}
                                  {p.cuota && <span className="text-[11px] text-slate-400 ml-1">cuota #{p.cuota.numero_cuota}</span>}
                                </td>
                              </tr>
                              {mesExpandido === p.numero_mes && (
                                <tr className="bg-slate-50/70">
                                  <td className="table-td" colSpan={6}>
                                    {p.detalle.length === 0 ? (
                                      <p className="text-xs text-slate-500">Sin mantenimientos programados este mes.</p>
                                    ) : (
                                      <div className="text-xs space-y-1">
                                        <div className="text-slate-500 uppercase tracking-wide text-[10px]">
                                          {p.es_gratuito
                                            ? `Mes gratuito · ${p.total_visitas} mantenimiento(s) · no genera cobro`
                                            : `Detalle del cobro · ${p.total_visitas} mantenimiento(s) · importe fijo ${formatMonto(p.monto, p.moneda)}`}
                                        </div>
                                        <ul className="space-y-0.5">
                                          {p.detalle.map(d => (
                                            <li key={d.id_ascensor} className="flex items-start justify-between gap-3">
                                              <span className="font-mono text-slate-800">
                                                {d.codigo} <span className="text-slate-500 font-sans">× {d.visitas}</span>
                                                {d.edificio && <span className="text-slate-400 font-sans"> · {d.edificio}</span>}
                                              </span>
                                              <span className="text-slate-600 text-right">
                                                {d.fechas.map(x => (
                                                  <span key={x.id_programacion} className={x.realizada ? 'text-emerald-700' : ''}>
                                                    {formatFecha(x.fecha)}{x.codigo_servicio ? ` (${x.codigo_servicio})` : ''}{' '}
                                                  </span>
                                                ))}
                                              </span>
                                            </li>
                                          ))}
                                        </ul>
                                      </div>
                                    )}
                                  </td>
                                </tr>
                              )}
                            </Fragment>
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
                  <>
                  {/* Móvil: dentro de un modal, siete columnas ni siquiera son
                      arrastrables con comodidad; cada mantenimiento del plan se
                      presenta como una tarjeta con los mismos datos. */}
                  <ul className="md:hidden space-y-2">
                    {instanciasPlan.map(it => (
                      <li key={`mp-${it.tipo_instancia}-${it.id_servicio || it.id_evento}`}
                          className="rounded-lg ring-1 ring-slate-200 p-3">
                        <div className="flex items-start justify-between gap-2 flex-wrap">
                          <div className="min-w-0">
                            {it.codigo_servicio
                              ? <Link to={`/servicios/${it.id_servicio}`} className="font-mono text-xs text-brand-700 hover:underline">{it.codigo_servicio}</Link>
                              : <span className="text-xs text-slate-400">Servicio no creado</span>}
                            {it.es_mantenimiento_gratuito && <span className="ml-1 badge-green text-[10px]">Gratis</span>}
                          </div>
                          <span className={badgeEstado(it.estado_ejecucion)}>{it.estado_ejecucion}</span>
                        </div>
                        <dl className="mt-2 space-y-1">
                          <div className="dato-movil"><dt>Programada</dt><dd>{formatFecha(it.fecha_programada)}</dd></div>
                          {it.fecha_inicio_real && <div className="dato-movil"><dt>Inicio</dt><dd>{formatFechaHora(it.fecha_inicio_real)}</dd></div>}
                          {it.fecha_fin_real && <div className="dato-movil"><dt>Término</dt><dd>{formatFechaHora(it.fecha_fin_real)}</dd></div>}
                          {formatDiasEjecucion(it.dias_ejecucion) !== '—' && (
                            <div className="dato-movil"><dt>Días</dt><dd className="font-mono">{formatDiasEjecucion(it.dias_ejecucion)}</dd></div>
                          )}
                        </dl>
                        {it.id_servicio && (
                          <Link to={`/servicios/${it.id_servicio}`}
                                className="inline-flex items-center min-h-[36px] mt-1 text-xs font-semibold text-brand-700">
                            Ver detalle
                          </Link>
                        )}
                      </li>
                    ))}
                  </ul>
                  <div className="hidden md:block overflow-x-auto scroll-thin">
                    <table className="table-base">
                      <thead><tr>
                        <th className="table-th">Servicio</th>
                        <th className="table-th">Programada</th>
                        <th className="table-th">Inicio</th>
                        <th className="table-th">Término</th>
                        <th className="table-th text-center">Días</th>
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
                            <td className="table-td"><span className={badgeEstado(it.estado_ejecucion)}>{it.estado_ejecucion}</span></td>
                            <td className="table-td text-right whitespace-nowrap">
                              {it.id_servicio ? (
                                <>
                                  <Link to={`/servicios/${it.id_servicio}`} className="text-brand-700 text-xs hover:underline">Ver</Link>
                                </>
                              ) : <span className="text-slate-400 text-xs">—</span>}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  </>
                )}
              </div>
            </div>
          );
        })()}
      </Modal>

      {/* Omitir fechas del cronograma. El monto mensual NO cambia: es lo pactado. */}
      <Modal open={!!omitiendo} onClose={() => setOmitiendo(null)} title="Omitir fechas del plan" size="md">
        {omitiendo && (
          <div className="space-y-4 text-sm">
            <p className="text-slate-700">
              Se van a omitir <strong>{omitiendo.ids.length} fecha(s)</strong> del cronograma. Dejarán de programarse y no aparecerán
              en el detalle de su mes.
            </p>
            <div className="rounded-lg border border-amber-200 bg-amber-50 text-amber-900 text-xs p-3">
              El <strong>monto mensual no cambia</strong>: el mes se sigue cobrando por el importe pactado aunque se realicen menos mantenimientos.
              Si alguna fecha ya tiene un mantenimiento pendiente creado, se dará de baja; las que ya salieron a campo no se pueden omitir.
            </div>
            <div>
              <label className="label">Motivo (opcional)</label>
              <input className="input" value={omitiendo.motivo} disabled={guardandoProgramacion}
                placeholder="Ej.: acordado con el cliente"
                onChange={e => setOmitiendo(o => ({ ...o, motivo: e.target.value }))} />
            </div>
            <div className="flex justify-end gap-2">
              <button type="button" className="btn-secondary" onClick={() => setOmitiendo(null)} disabled={guardandoProgramacion}>Cancelar</button>
              <button type="button" className="btn-primary" disabled={guardandoProgramacion}
                onClick={() => cambiarActivoVisitas(omitiendo.ids, 0, omitiendo.motivo)}>
                {guardandoProgramacion ? 'Omitiendo…' : 'Omitir fechas'}
              </button>
            </div>
          </div>
        )}
      </Modal>

      <Modal open={!!forzando} onClose={() => setForzando(null)} title="Aprobar el mes con mantenimientos pendientes" size="md">
        {forzando && (
          <div className="space-y-4 text-sm">
            <p className="text-slate-700">
              <strong>{forzando.etiqueta}</strong> tiene{' '}
              <strong>{forzando.realizadas} de {forzando.total_visitas}</strong> mantenimientos realizados.
            </p>
            <div className="rounded-lg ring-1 ring-slate-200 bg-slate-50 p-3">
              <div className="flex items-center justify-between">
                <span className="text-slate-600">Importe del mes</span>
                <strong className="font-mono text-slate-900">
                  {forzando.es_gratuito ? 'Gratuito' : formatMonto(forzando.monto, forzando.moneda)}
                </strong>
              </div>
              <p className="text-[11px] text-slate-500 mt-1">
                {forzando.es_gratuito
                  ? 'Es un mes gratuito del plan: queda registrado en 0 y no pasa a cobro.'
                  : 'El monto mensual es fijo: no se prorratea por los mantenimientos pendientes.'}
              </p>
            </div>
            <p className="text-[11px] text-slate-500">
              {forzando.es_gratuito
                ? 'No se emite factura ni se abre gestión de cobros para este mes.'
                : 'Se genera una sola cuota por este mes; una factura y un pago continúan el flujo.'}
            </p>
            <div className="flex justify-end gap-2">
              <button type="button" className="btn-secondary" onClick={() => setForzando(null)}>Cancelar</button>
              <button type="button" className="btn-primary" disabled={aprobandoPeriodo}
                onClick={() => aprobarPeriodoUI(forzando, { forzar: true })}>
                {aprobandoPeriodo ? 'Aprobando…' : 'Aprobar el mes'}
              </button>
            </div>
          </div>
        )}
      </Modal>

      {/* Factura del MES aprobado: una factura por la cuota del cobro único del
          plan — el mismo contrato que Gestión de cobros → "Por facturar". */}
      <Modal
        open={!!facturandoMes}
        onClose={() => !guardandoFacturaMes && setFacturandoMes(null)}
        title={facturandoMes ? `Registrar factura · ${facturandoMes.etiqueta}` : 'Registrar factura'}
        size="sm"
        footer={
          <>
            <button type="button" className="btn-secondary" onClick={() => setFacturandoMes(null)} disabled={guardandoFacturaMes}>Ahora no</button>
            <button type="button" className="btn-primary" onClick={guardarFacturaMes} disabled={guardandoFacturaMes}>
              {guardandoFacturaMes ? 'Registrando…' : 'Registrar factura'}
            </button>
          </>
        }
      >
        {facturandoMes && (
          <div className="space-y-4 text-sm">
            <div className="rounded-md bg-slate-50 ring-1 ring-slate-200 px-3 py-2 text-xs text-slate-600 space-y-0.5">
              <div><span className="text-slate-400">Cliente:</span> <span className="text-slate-800 font-medium">{nombreCliente(planDetalle?.cliente)}</span></div>
              <div>
                <span className="text-slate-400">Mes:</span>{' '}
                {facturandoMes.etiqueta} · {formatFecha(facturandoMes.desde)} → {formatFecha(facturandoMes.hasta)}
              </div>
              <div>
                <span className="text-slate-400">Mantenimientos del mes:</span>{' '}
                {facturandoMes.realizadas}/{facturandoMes.total_visitas} realizados
              </div>
              <p className="text-[10px] text-slate-500 mt-1">El importe del mes es fijo (monto mensual pactado) y no varía con los mantenimientos.</p>
            </div>
            <div>
              <label className="label">Tipo de comprobante *</label>
              <select className="select" value={facturaMes.tipo_comprobante}
                onChange={e => setFacturaMes(f => ({ ...f, tipo_comprobante: e.target.value }))}>
                {TIPOS_COMPROBANTE.map(t => <option key={t.codigo} value={t.codigo}>{t.etiqueta}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Número de comprobante *</label>
              <input className="input" value={facturaMes.numero_factura}
                onChange={e => setFacturaMes(f => ({ ...f, numero_factura: e.target.value }))}
                placeholder={ejemploNumeroComprobante(facturaMes.tipo_comprobante)} />
            </div>
            <div>
              <label className="label">Fecha de emisión *</label>
              <input type="date" className="input" value={facturaMes.fecha_emision}
                onChange={e => setFacturaMes(f => ({ ...f, fecha_emision: e.target.value }))} />
            </div>
            <div>
              <label className="label">Monto</label>
              <input className="input bg-slate-100 cursor-not-allowed"
                value={formatMonto(Number(facturandoMes.cuota?.monto ?? facturandoMes.monto), facturandoMes.moneda)} readOnly />
              <p className="text-xs text-slate-500 mt-1">Fijado por la cuota del mes.</p>
            </div>
            <div>
              <label className="label">Archivo de factura</label>
              <input type="file" className="input" onChange={subirArchivoFacturaMes} />
              {facturaMes.id_archivo && <p className="text-xs text-emerald-600 mt-1">✓ Archivo cargado</p>}
            </div>
          </div>
        )}
      </Modal>

      <Modal open={open} onClose={cerrarModal} title={editando ? 'Editar plan de mantenimiento' : 'Nuevo plan de mantenimiento'}
        footer={
          <>
            <button type="button" className="btn-secondary" onClick={cerrarModal} disabled={guardando}>Cancelar</button>
            <button type="submit" form={FORM_ID} className="btn-primary" disabled={guardando || (!editando && !seleccionOk)}>
              {guardando
                ? (editando ? 'Guardando…' : 'Creando…')
                : (editando ? 'Guardar cambios' : 'Crear')}
            </button>
          </>
        }>
        <form id={FORM_ID} onSubmit={guardar} className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {editando && (
            <div className="sm:col-span-2 rounded-lg border border-amber-200 bg-amber-50 text-amber-900 text-xs p-3">
              Los cambios <strong>solo afectan a los mantenimientos futuros no materializados</strong>: los ya ejecutados o en curso conservan sus datos.
              Puede añadir o quitar ascensores (no se puede quitar uno con mantenimientos en curso o realizados) y cambiar el cliente
              mientras el plan no tenga mantenimientos ejecutados ni meses aprobados para cobro.
            </div>
          )}
          <div>
            <label className="label">{labelCampoCliente} *</label>
            <ClienteAutocomplete
              clientes={clientes}
              value={form.id_cliente}
              onChange={(id) => setForm(f => ({ ...f, id_cliente: id, ascensores_seleccion: {} }))}
              required
              placeholder="Escriba para buscar por nombre de edificio / obra…"
            />
          </div>
          <div>
            <label className="label">Tipo de servicio *</label>
            <select className="select" required value={form.id_tipo_servicio} onChange={e => cambiarSubtipoPlan(e.target.value)}><option value="">—</option>{tiposF.map(t => <option key={t.id} value={t.id}>{t.nombre}</option>)}</select>
          </div>
          <div className="sm:col-span-2">
            <label className="label">Ascensores y su frecuencia *</label>
            <p className="text-[11px] text-slate-500 -mt-1 mb-1.5">
              Un plan puede cubrir varios ascensores (incluso de distintos edificios) y <strong>cada uno puede tener su propia frecuencia</strong>. El cobro es único por mes, por el monto mensual pactado, con el detalle de todos los mantenimientos de ese mes.
            </p>
            <AscensoresFrecuenciaChecklist
              ascensores={ascensoresF}
              seleccion={form.ascensores_seleccion}
              frecuencias={frecuencias}
              duracionMeses={esContinuo ? form.duracion_meses : 1}
              onToggle={toggleAscensorPlan}
              onCambiarFrecuencia={cambiarFrecuenciaAscensor}
              hayCliente={!!form.id_cliente}
            />
            {ascensoresSeleccionados.length > 0 && (
              <div className="mt-2 rounded-lg ring-1 ring-slate-200 bg-slate-50 p-3 text-sm flex flex-wrap items-center gap-3">
                <span className="text-slate-600">
                  {ascensoresSeleccionados.length} ascensor(es) · {totalVisitasPrevistas} mantenimiento(s) en {esContinuo ? `${form.duracion_meses || 0} mes(es)` : '1 vez'}
                </span>
                {puedeVerPrecio && Number(form.monto_mensual) > 0 && esContinuo && (
                  <span className="ml-auto text-right">
                    <strong className="font-mono text-slate-900 block">
                      {formatMonto(totalesForm.monto_mensual, 'PEN')}/mes · total {formatMonto(totalesForm.total, 'PEN')}
                    </strong>
                    {totalesForm.meses_gratuitos > 0 && (
                      <span className="text-[11px] text-emerald-700">
                        {totalesForm.meses_facturables} mes(es) facturable(s) · {totalesForm.meses_gratuitos} gratuito(s)
                      </span>
                    )}
                  </span>
                )}
              </div>
            )}
            {!!editando && (
              <p className="text-[11px] text-amber-700 mt-1">
                Puede añadir o quitar ascensores y corregir la frecuencia de cada uno: el cronograma futuro se recalcula. Un ascensor con mantenimientos en curso o ya realizados no se puede quitar.
              </p>
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
                <label className="label">Duración del plan (meses) *</label>
                <input type="number" min="1" max="120" step="1" className="input" required
                  value={form.duracion_meses}
                  onChange={e => setForm(f => ({ ...f, duracion_meses: e.target.value }))} />
                <p className="text-xs text-slate-500 mt-1">
                  Cada ascensor recibirá tantos mantenimientos como resulte de cruzar su frecuencia con estos meses.
                </p>
              </div>
              <div>
                <label className="label">Frecuencia por defecto *</label>
                <select className="select" required value={form.frecuencia} onChange={e => setForm(f => ({ ...f, frecuencia: e.target.value }))}>
                  {frecuencias.map(fr => <option key={fr.codigo} value={fr.codigo}>{fr.etiqueta}</option>)}
                </select>
                <p className="text-xs text-slate-500 mt-1">
                  Es la que se propone al marcar un ascensor. Cada uno puede cambiarla arriba.
                </p>
              </div>
              {esFrecuenciaCustom && (
                <div>
                  <label className="label">Días entre mantenimientos (por defecto) *</label>
                  <input type="number" min="1" step="1" className="input" required
                    value={form.frecuencia_dias_custom}
                    onChange={e => setForm(f => ({ ...f, frecuencia_dias_custom: e.target.value }))} />
                </div>
              )}
            </>
          )}

          {puedeVerPrecio && (
            <div>
              <label className="label">Monto mensual *</label>
              <input type="number" min="0" step="0.01" className="input text-right font-mono"
                value={form.monto_mensual}
                onChange={e => setForm(f => ({ ...f, monto_mensual: e.target.value }))} />
              <p className="text-xs text-slate-500 mt-1">
                Importe global que se cobra <strong>cada mes</strong>, sin importar cuántos mantenimientos caigan en él.
              </p>
            </div>
          )}

          {esTipoPreventivo && (
            <div>
              <label className="label">Meses gratuitos</label>
              <input
                type="number" min="0" max={cupoMaximoGratuitos} step="1" className="input"
                value={form.cantidad_mantenimientos_gratuitos}
                onChange={e => setForm(f => ({ ...f, cantidad_mantenimientos_gratuitos: e.target.value }))}
              />
              <p className="text-xs text-slate-500 mt-1">
                Los primeros N meses no generan cobro. Máx: {cupoMaximoGratuitos}.
              </p>
            </div>
          )}

          <div><label className="label">Fecha inicio *</label><input type="date" className="input" required value={form.fecha_inicio} onChange={e => setForm(f => ({ ...f, fecha_inicio: e.target.value }))} /></div>
          <div><label className="label">Hora</label><input type="time" className="input" value={form.hora_programada} onChange={e => setForm(f => ({ ...f, hora_programada: e.target.value }))} /></div>
          <div className="sm:col-span-2 text-xs text-slate-500 bg-slate-50 ring-1 ring-slate-200 rounded-md px-3 py-2">
            Al guardar se genera el cronograma completo: todas las fechas de cada ascensor para los meses del plan. Podrá revisarlas y <strong>omitir</strong> las que no se ejecutarán desde el detalle del plan; el monto mensual no cambia por omitir fechas.
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
