import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { serviciosService, facturasService, clientesService, cobrosService } from '../services';
import CuotasNoFacturadas from '../components/cobros/CuotasNoFacturadas.jsx';
import PageHeader from '../components/common/PageHeader.jsx';
import Loader from '../components/common/Loader.jsx';
import EmptyState from '../components/common/EmptyState.jsx';
import Modal from '../components/common/Modal.jsx';
import Pagination, { usePaginatedList } from '../components/common/Pagination.jsx';
import DateRangePicker from '../components/common/DateRangePicker.jsx';
import FiltroMoneda, { etiquetaDeMoneda } from '../components/common/FiltroMoneda.jsx';
import OtModal from '../components/common/OtModal.jsx';
import CardMetrica from '../components/common/CardMetrica.jsx';
import { useToast } from '../components/common/Toast.jsx';
import { ArchivosFacturaBorrador, DocumentosAdicionalesBorrador, aPayloadDocumentos, idsArchivosFactura } from '../components/facturas/DocumentosFactura.jsx';
import { CampoNumerosOperacion, limpiarNumerosOperacion } from '../components/facturas/NumerosOperacion.jsx';
import useCargaArchivos from '../hooks/useCargaArchivos.js';
import { useAuth } from '../features/auth/AuthContext.jsx';
import { useMonedas } from '../hooks/useMonedas.js';
import { badgeEstado, formatFecha, formatMonto, codigosAscensores, resumenAscensores, nombreEdificioDeAscensores, hoyISO } from '../utils/formatters.js';
import { ESTADOS_COBRO } from '../utils/estadoCobro.js';
import { esFacturaActiva } from '../utils/estadoFactura.js';
import { TIPOS_COMPROBANTE, ejemploNumeroComprobante, tipoComprobanteSugerido } from '../utils/catalogosComprobante.js';
import { exportarExcelTabla, exportarPDFTabla } from '../utils/exportTabla.js';
import { etiquetaMoneda } from '../utils/excelNumeros.js';
import { precioMensualDelPlan } from '../utils/planMantenimiento.js';

// `desde`/`hasta` = rango de "Fecha servicio"; `registro_*` = "Fecha registro"
// (de la OT); `comprobante_*` = "Fecha comprobante"; `monto_min`/`monto_max` =
// rango de la columna "Total".
const FILTROS_INICIALES = {
  q: '', tipo_categoria: '', situacion: '', estado_cobro: '',
  grupo_facturacion: '', moneda: '', desde: '', hasta: '',
  registro_desde: '', registro_hasta: '', comprobante_desde: '', comprobante_hasta: '',
  aprobacion_desde: '', aprobacion_hasta: '', monto_min: '', monto_max: ''
};

// Los dos grupos que resume Contabilidad. Esta lista es a la vez las TARJETAS
// del encabezado y los BOTONES de filtro: una sola definición (título, criterio
// y tono) para que lo que se cuenta y lo que se filtra se describan igual.
//
// `value` viaja al backend como `grupo_facturacion`. Allí la situación de cada
// servicio (backend/utils/situacionFacturacion.js) decide a la vez qué cuenta y
// suma cada tarjeta, qué deja en la tabla cada botón y los importes de las
// columnas "Facturado" / "Por facturar": pulsar un botón deja exactamente los
// servicios que su tarjeta cuenta. Un servicio facturado en parte está en los
// dos grupos, cada uno con su importe. `value` coincide además con la clave del
// resumen y con el campo de importe de `r.facturacion`.
const GRUPOS_FACTURACION = [
  {
    value: 'por_facturar',
    titulo: 'Por facturar',
    ayuda: 'Importe que falta facturar: el total de los servicios sin comprobante; en los facturados por cuotas, las cuotas que aún no tienen factura (lo mismo que lista «Cuotas por facturar»); y en los facturados en general por una parte, la diferencia hasta el total. Un servicio facturado en parte cuenta aquí solo por su saldo. No cuenta los marcados «Sin factura» ni los gratuitos.',
    nota: (parciales) => `Incluye ${parciales} facturado(s) en parte: aquí solo su saldo por facturar.`,
    tono: 'amber',
    btnOn: 'bg-amber-100 text-amber-900 ring-amber-300',
    btnOff: 'bg-white text-amber-700 ring-amber-200 hover:bg-amber-50',
    columna: 'bg-amber-50/70'
  },
  {
    value: 'facturado',
    titulo: 'Facturado',
    ayuda: 'Importe ya facturado: la suma de los comprobantes vigentes (no anulados). Incluye los servicios facturados en parte, por lo ya emitido.',
    nota: (parciales) => `Incluye ${parciales} facturado(s) en parte: aquí solo lo ya emitido.`,
    tono: 'green',
    btnOn: 'bg-emerald-100 text-emerald-900 ring-emerald-300',
    btnOff: 'bg-white text-emerald-700 ring-emerald-200 hover:bg-emerald-50',
    columna: 'bg-emerald-50/70'
  }
];

// Opciones del filtro de situación de pago (espejo de la columna "Situación").
// No hay "Sin cobro": los gratuitos no se listan en Contabilidad (con_monto).
const SITUACIONES = [
  { value: 'cancelado', label: 'Cancelado' },
  { value: 'pendiente', label: 'Pendiente' }
];

// Opciones del filtro por tipo de servicio. El value viaja al backend, que lo
// mapea a modulo_asociado / tipo_registro.
const TIPOS_CATEGORIA = [
  { value: 'correctivo', label: 'Correctivo' },
  { value: 'preventivo', label: 'Preventivo (mantenimiento)' },
  { value: 'proyecto', label: 'Proyecto' }
];

// Estados de cobro que se consideran "Cancelado" (pagado). El resto es "Pendiente".
const COBRO_CANCELADO = ['Pagado', 'Cerrado'];

// Estados administrativos PREVIOS a la aprobación: mientras el servicio operativo
// esté en cualquiera de ellos no es elegible para Contabilidad. Espejo de
// backend/utils/elegibilidadContable.js (ESTADOS_ADMIN_NO_HABILITA).
const ESTADOS_ADMIN_NO_HABILITA = ['En ejecución', 'Pendiente revisión', 'Observado', 'Rechazado'];

// Servicio de plan del modelo mensual (sin cobro propio): el comprobante no es
// del servicio sino del PLAN — uno por mes, contra la cuota del cobro del plan.
// No es un "no facturable": se emite en la pestaña "Cuotas por facturar" de esta misma
// página (misma bandeja y mismo POST /facturas que Gestión de cobros y que el
// detalle del plan en Mantenimientos).
//
// Un servicio de plan legacy CON cobro propio (modelo anterior) sí factura por
// servicio — sigue las reglas normales de motivoNoFacturable (espejo del backend).
const facturaPorCuotaDelPlan = (r) => !!(r.servicio?.id_mantenimiento_plan && !r.servicio?.cobro);

// ¿Se puede emitir la factura GENERAL del servicio desde esta pantalla?
// Espejo en el front de las validaciones de facturasController.crear, para no
// ofrecer un botón que el backend va a rechazar. El backend sigue siendo la
// autoridad: aquí solo se decide si mostrar la acción.
//
// Queda fuera (se factura en la pestaña "Cuotas por facturar" o no se factura):
//   · mantenimientos de un PLAN → una sola factura por MES contra la cuota del
//     plan, por el monto mensual pactado (facturaPorCuotaDelPlan);
//   · servicios marcados "Sin factura" (requiere_factura = 0) y los gratuitos;
//   · servicios aún no aprobados por la revisión administrativa;
//   · cobros que ya facturan POR CUOTA (la emisión va en "Cuotas por facturar");
//   · servicios ya facturados por su total.
// Una facturación general PARCIAL (p. ej. una primera factura por una parte del
// total) no bloquea: la fila sigue ofreciendo «Facturar» por lo que falta, y así
// hasta completar el total con una segunda, tercera… factura.
function motivoNoFacturable(r) {
  const s = r.servicio;
  if (!s) return 'Sin servicio asociado';
  if (s.estado_servicio === 'Cancelado') return 'Servicio cancelado';
  if (s.sin_cobro === 1) return 'Servicio sin cobro (gratuito)';
  if (facturaPorCuotaDelPlan(r)) {
    // `facturacion_plan` lo arma el backend (utils/facturacionServiciosPlan.js):
    // el mes del plan en que cae el servicio, su cuota y la factura que lo cubre.
    const fp = r.facturacion_plan;
    if (fp?.factura) return `Facturado con la factura mensual del plan: ${fp.factura.numero_factura}`;
    if (fp && !fp.id_cuota) return 'El mes de este mantenimiento aún no está aprobado: se aprueba desde el detalle del plan (Mantenimientos)';
    return 'Pertenece a un plan: se factura una sola vez al mes, contra la cuota del plan';
  }
  // Un servicio de plan que llega aquí es legacy con cobro propio: su marca
  // "Sin factura" es la de todo servicio de plan y no lo bloquea (espejo del
  // backend, facturasController.crear).
  if (s.requiere_factura === 0 && !s.id_mantenimiento_plan) return 'Marcado como "Sin factura"';
  if (!s.id_cotizacion && ESTADOS_ADMIN_NO_HABILITA.includes(r.estado_administrativo)) {
    return 'Aún no aprobado por la revisión administrativa';
  }
  const { facturas, restante } = situacionGeneral(r);
  if (facturas.some(f => f.id_cuota != null)) return 'Este cobro factura por cuota';
  if (facturas.length > 0 && restante <= 0) {
    return `Facturado por el total: ${facturas.map(f => f.numero_factura).join(', ')}`;
  }
  return null;
}

// ¿El comprobante que le falta a esta fila se emite contra una CUOTA? Dos casos:
// el mantenimiento de un plan (factura mensual del plan) y el cobro que ya viene
// facturando por cuota. En ambos la emisión vive en la pestaña "Cuotas por facturar" de
// esta misma página, así que la fila ofrece el salto en vez de un texto muerto.
// Se consulta DESPUÉS de motivoNoFacturable para respetar sus precedencias: un
// servicio cancelado o gratuito sigue sin ofrecer acción.
// En un plan, solo si el mes ya está aprobado (tiene cuota) y aún no se facturó:
// si no, la bandeja no tendría nada que emitir para este mantenimiento.
const facturaEnBandejaDeCuotas = (r) => {
  if (facturaPorCuotaDelPlan(r)) {
    const fp = r.facturacion_plan;
    return !fp || (!!fp.id_cuota && !fp.factura);
  }
  return (r.servicio?.cobro?.facturas || []).filter(esFacturaActiva).some(f => f.id_cuota != null);
};

// Qué acción ofrece la columna "Acciones": emitir la factura general aquí mismo,
// saltar a la bandeja de cuotas, o nada (con el motivo como tooltip).
function accionFacturar(r) {
  const motivo = motivoNoFacturable(r);
  if (!motivo) return { tipo: 'emitir' };
  if (facturaEnBandejaDeCuotas(r)) {
    const esPlan = facturaPorCuotaDelPlan(r);
    return {
      tipo: 'bandeja',
      etiqueta: esPlan ? 'Facturar mes' : 'Facturar cuota',
      ayuda: esPlan
        ? 'Los mantenimientos de un plan se facturan una sola vez al mes, contra la cuota del plan. Abre «Cuotas por facturar» con las cuotas de este cliente.'
        : 'Este cobro factura por cuota. Abre «Cuotas por facturar» con las cuotas de este cliente.'
    };
  }
  return { tipo: 'bloqueado', motivo };
}

// Total cobrable del servicio: manda el monto del cobro; sin cobro creado, el
// precio del servicio (mismo criterio que usa el backend para validar).
const totalCobrable = (r) => Number(r.servicio?.cobro?.monto_total ?? r.servicio?.precio_interno ?? 0);

const aCentimos = (n) => Math.round(Number(n || 0) * 100) / 100;

// Facturación GENERAL del servicio (comprobantes sin cuota): se puede hacer en
// varias emisiones, así que el botón «Facturar» y el modal necesitan saber qué
// comprobantes vigentes hay, cuánto suman y cuánto FALTA. Manda `r.facturacion`,
// que arma el backend con la regla única (utils/situacionFacturacion.js): son
// los mismos importes de las columnas "Facturado" / "Por facturar" y los que
// valida POST /facturas. Si no viene, se calcula igual a partir de las facturas
// del cobro.
const situacionGeneral = (r) => {
  const fx = r.facturacion;
  if (fx) return { facturas: fx.facturas || [], facturado: fx.facturado, restante: fx.por_facturar };
  const facturas = (r.servicio?.cobro?.facturas || []).filter(esFacturaActiva);
  const facturado = aCentimos(facturas.reduce((acc, f) => acc + Number(f.monto || 0), 0));
  return { facturas, facturado, restante: aCentimos(Math.max(0, totalCobrable(r) - facturado)) };
};

// Visita de plan (precioMensualDelPlan): se muestra el monto del plan, marcado
// como mensual para no confundirlo con el total de esa fila.
//
// En el export va como TEXTO, sin valor numérico: el mismo mes aparece en tantas
// filas como visitas tenga, y sumarlo multiplicaría el importe real del plan.

// Documento del cliente: "RUC 20..." / "DNI 4..." o '—' si no hay número.
const docCliente = (r) => {
  const c = r.servicio?.cliente;
  if (!c?.numero_documento) return '—';
  return `${c.tipo_documento || ''} ${c.numero_documento}`.trim();
};

// "Fecha registro" y "Fecha comprobante": las calcula el backend
// (utils/fechasContables.js), con el mismo criterio que sus filtros por rango.
// Registro: cuándo se registró la OT del servicio. Comprobante: emisión de la
// factura vigente más reciente del cobro o, en un mantenimiento de plan, la
// de la factura de su mes. null = sin OT / sin comprobante.
const fechaRegistro = (r) => r.fecha_registro || null;
const fechaComprobante = (r) => r.fecha_comprobante || null;

// "Fecha servicio": la calcula el backend (utils/fechaServicioContable.js). Es
// la fecha en que se realizó el servicio, igual para todo tipo: el inicio real
// de su ejecución (columna "Inicio" de los módulos operativos). null = aún no
// se inició.
const fechaServicio = (r) => r.fecha_servicio || null;

// Tooltip de la celda.
const tituloFechaServicio = (r) => {
  if (!r.fecha_servicio) return undefined;
  const titulo = 'Fecha de ejecución (inicio del servicio)';
  const programada = r.servicio?.fecha_programada;
  return programada ? `${titulo} · programado para el ${formatFecha(programada)}` : titulo;
};
const SIN_FECHA_SERVICIO = '— (sin iniciar)';

// Listado de Contabilidad: el rango de fechas se aplica sobre "Fecha servicio"
// (rango_fecha=servicio), no sobre la fecha de realización. Y solo trae
// servicios con importe (con_monto): los gratuitos y los de S/ 0.00 no tienen
// nada que cobrar ni facturar (backend/utils/montoACobrar.js).
const listarRealizados = (params) => serviciosService.realizadosPaginate({ ...params, rango_fecha: 'servicio', con_monto: 1 });

// Tipo de servicio legible (nombre del subtipo).
const tipoServicioLabel = (r) => r.servicio?.tipo_servicio?.nombre || '—';

// Situación de pago: Cancelado (pagado) | Pendiente.
const situacionPago = (r) => (COBRO_CANCELADO.includes(r.estado_cobro) ? 'Cancelado' : 'Pendiente');

// Moneda del servicio (por defecto soles, como el resto del módulo).
const monedaDe = (r) => r.servicio?.moneda || 'PEN';

// "Facturado" / "Por facturar" de la fila: los calcula el backend
// (utils/situacionFacturacion.js) con la misma regla que suman las tarjetas y
// que aplica el filtro por grupo. Solo llega a los roles con finanzas.
const etiquetaCuotas = (nums) => (nums.length === 1
  ? `cuota ${nums[0]}`
  : `cuotas ${nums.slice(0, -1).join(', ')} y ${nums[nums.length - 1]}`);
const etiquetaComprobante = (f) => `${f.numero_factura}${f.numero_cuota ? ` · cuota ${f.numero_cuota}` : ''}`;
// Detalle bajo el importe: qué comprobantes lo forman o qué cuotas faltan.
const detalleFacturacion = (fx, campo) => {
  if (campo === 'facturado') return fx.facturas.map(etiquetaComprobante);
  if (fx.de_plan) return ['cuota del mes · plan'];
  return fx.cuotas_por_facturar.length ? [etiquetaCuotas(fx.cuotas_por_facturar)] : [];
};
// Export: el importe del mes de un plan va como texto, sin número, por la misma
// razón que la columna "Total" (se repite en cada visita del mes).
const importeExport = (campo) => ({
  header: campo === 'facturado' ? 'Facturado' : 'Por facturar',
  align: 'right',
  get: r => {
    const fx = r.facturacion;
    if (!fx || !(fx[campo] > 0)) return '';
    return `${formatMonto(fx[campo], fx.moneda)}${fx.de_plan ? ' (mes del plan)' : ''}`;
  },
  num: r => {
    const fx = r.facturacion;
    return fx && !fx.de_plan ? Number(fx[campo] || 0) : null;
  }
});

// Columnas del export (espejo de la tabla, sin la columna de acciones).
// Los importes llevan `num`: en Excel son celdas numéricas sumables, y la
// columna "Moneda" permite filtrar/segmentar soles y dólares por separado.
const COLUMNAS_EXPORT = [
  { header: 'Fecha servicio', get: r => { const f = fechaServicio(r); return f ? formatFecha(f) : ''; } },
  { header: 'Fecha registro', get: r => { const f = fechaRegistro(r); return f ? formatFecha(f) : ''; } },
  { header: 'Fecha comprobante', get: r => { const f = fechaComprobante(r); return f ? formatFecha(f) : ''; } },
  { header: 'Código', get: r => r.servicio?.codigo },
  { header: 'DNI / RUC', get: r => (docCliente(r) === '—' ? '' : docCliente(r)) },
  { header: 'Razón social', get: r => r.servicio?.cliente?.nombre },
  { header: 'Edificio', get: r => nombreEdificioDeAscensores(r.servicio) },
  { header: 'Ascensor', get: r => resumenAscensores(r.servicio) },
  { header: 'Tipo de servicio', get: r => tipoServicioLabel(r) },
  { header: 'Moneda', get: r => etiquetaMoneda(monedaDe(r)) },
  {
    header: 'Total',
    align: 'right',
    get: r => {
      const plan = precioMensualDelPlan(r.servicio);
      if (plan) return `${formatMonto(plan.monto, plan.moneda)} al mes (plan)`;
      return formatMonto(r.servicio?.precio_interno, monedaDe(r));
    },
    // El monto del plan no entra como número: se repite en cada visita del mes.
    num: r => (precioMensualDelPlan(r.servicio) ? null : Number(r.servicio?.precio_interno))
  },
  importeExport('facturado'),
  { header: 'Comprobantes', get: r => (r.facturacion?.facturas || []).map(etiquetaComprobante).join(', ') },
  importeExport('por_facturar'),
  { header: 'Estado cobro', badge: true, get: r => r.estado_cobro },
  { header: 'Situación', badge: true, get: r => situacionPago(r) }
];

export default function Contabilidad() {
  const [filtros, setFiltros] = useState(FILTROS_INICIALES);
  // Vista activa: la tabla de servicios realizados o la bandeja de cuotas
  // pendientes de facturar (planes de mantenimiento y cobros en cuotas). Las dos
  // emiten contra el mismo endpoint, así que toda la facturación se hace aquí
  // sin salir del módulo.
  const [vistaModo, setVistaModo] = useState('servicios'); // 'servicios' | 'por_facturar'
  // Catálogos de los filtros de la bandeja de cuotas (carga diferida: solo al
  // entrar por primera vez a esa vista).
  const [clientes, setClientes] = useState([]);
  const [proyectos, setProyectos] = useState([]);
  const [catalogosCargados, setCatalogosCargados] = useState(false);
  // Salto desde una fila de plan: filtros con los que abrir la bandeja + nonce
  // para que se reapliquen aunque se repita el mismo cliente.
  const [focoCuotas, setFocoCuotas] = useState(null); // { filtros, key } | null
  const [exportando, setExportando] = useState(false);
  const [otAbierta, setOtAbierta] = useState(null); // { numero, archivo } | null
  // Emisión de la factura del servicio sin salir de Contabilidad.
  const [facturando, setFacturando] = useState(null); // fila en el modal | null
  const [factura, setFactura] = useState({
    numero_factura: '', tipo_comprobante: TIPOS_COMPROBANTE[0].codigo,
    fecha_emision: hoyISO(), monto: '', archivos: [], numeros_operacion: [''], documentos: []
  });
  const [guardandoFactura, setGuardandoFactura] = useState(false);
  const toast = useToast();
  const cargaFactura = useCargaArchivos();     // archivos de la factura (comprobante)
  const cargaDocsFactura = useCargaArchivos(); // documentos adicionales de la factura
  // Catálogo de monedas: alimenta el filtro y nombra la divisa elegida en la
  // cabecera del export.
  const monedas = useMonedas();
  const { esSuperAdmin, esAdmin, esContabilidad } = useAuth();
  // Mismos roles que admite la ruta de facturas en el backend.
  const puedeFacturar = esSuperAdmin || esAdmin || esContabilidad;

  const { data, loading, total, page, pageSize, totalPages, setPage, setPageSize, recargar, meta } =
    usePaginatedList(listarRealizados, filtros, { initialPageSize: 25 });
  // Resumen de facturación del conjunto filtrado completo (no solo de la página
  // visible). Lo calcula el backend con el mismo `where` que la tabla y solo lo
  // envía a los roles con visibilidad financiera.
  const resumen = meta?.resumen_facturacion;

  const setF = (k, v) => setFiltros(f => ({ ...f, [k]: v }));

  // Catálogos de la bandeja de cuotas: se piden la primera vez que se abre esa
  // vista, no al cargar Contabilidad (la tabla de servicios no los usa).
  useEffect(() => {
    if (vistaModo !== 'por_facturar' || catalogosCargados) return;
    let cancel = false;
    Promise.all([
      clientesService.list().catch(() => []),
      cobrosService.proyectos().catch(() => [])
    ]).then(([c, p]) => {
      if (cancel) return;
      setClientes(Array.isArray(c) ? c : []);
      setProyectos(Array.isArray(p) ? p : []);
      setCatalogosCargados(true);
    });
    return () => { cancel = true; };
  }, [vistaModo, catalogosCargados]);

  // "Facturar mes" / "Facturar cuota": abre la bandeja de cuotas filtrada por el
  // cliente del servicio, que es donde vive ese comprobante. En los planes se
  // acota además a preventivo, que es el único tipo que factura por mes.
  const irACuotasDelPlan = (r) => {
    const idCliente = r.servicio?.cliente?.id;
    setFocoCuotas({
      filtros: {
        ...(facturaPorCuotaDelPlan(r) ? { tipo_categoria: 'preventivo' } : {}),
        ...(idCliente ? { id_cliente: String(idCliente) } : {})
      },
      key: Date.now()
    });
    setVistaModo('por_facturar');
  };

  // Descripción legible de los filtros activos, para la cabecera del export.
  const filtrosLegibles = () => {
    const p = [];
    if (filtros.q) p.push(`Búsqueda: ${filtros.q}`);
    if (filtros.tipo_categoria) p.push(`Tipo de servicio: ${TIPOS_CATEGORIA.find(t => t.value === filtros.tipo_categoria)?.label || filtros.tipo_categoria}`);
    if (filtros.situacion) p.push(`Situación: ${SITUACIONES.find(s => s.value === filtros.situacion)?.label || filtros.situacion}`);
    if (filtros.estado_cobro) p.push(`Estado cobro: ${filtros.estado_cobro}`);
    if (filtros.grupo_facturacion) p.push(`Facturación: ${GRUPOS_FACTURACION.find(g => g.value === filtros.grupo_facturacion)?.titulo || filtros.grupo_facturacion}`);
    if (filtros.moneda) p.push(`Moneda: ${etiquetaDeMoneda(monedas, filtros.moneda)}`);
    if (filtros.desde) p.push(`Fecha servicio desde: ${filtros.desde}`);
    if (filtros.hasta) p.push(`Fecha servicio hasta: ${filtros.hasta}`);
    if (filtros.registro_desde) p.push(`Fecha registro desde: ${filtros.registro_desde}`);
    if (filtros.registro_hasta) p.push(`Fecha registro hasta: ${filtros.registro_hasta}`);
    if (filtros.comprobante_desde) p.push(`Fecha comprobante desde: ${filtros.comprobante_desde}`);
    if (filtros.comprobante_hasta) p.push(`Fecha comprobante hasta: ${filtros.comprobante_hasta}`);
    if (filtros.aprobacion_desde) p.push(`Cotización aprobada desde: ${filtros.aprobacion_desde}`);
    if (filtros.aprobacion_hasta) p.push(`Cotización aprobada hasta: ${filtros.aprobacion_hasta}`);
    if (filtros.monto_min) p.push(`Monto desde: ${filtros.monto_min}`);
    if (filtros.monto_max) p.push(`Monto hasta: ${filtros.monto_max}`);
    return p;
  };

  // Trae el set COMPLETO según filtros activos (sin `page`) y exporta.
  const exportar = async (formato) => {
    try {
      setExportando(true);
      const resp = await listarRealizados({ ...filtros });
      const filas = Array.isArray(resp) ? resp : (resp?.data || []);
      if (!filas.length) { toast.error('No hay datos para exportar'); return; }
      const opts = {
        titulo: 'Contabilidad',
        subtitulo: 'Servicios realizados (filtrado)',
        columnas: COLUMNAS_EXPORT,
        filas,
        filtros: filtrosLegibles(),
        archivo: `contabilidad_${hoyISO()}.${formato === 'pdf' ? 'pdf' : 'xls'}`
      };
      if (formato === 'pdf') await exportarPDFTabla(opts);
      else exportarExcelTabla(opts);
      toast.success(formato === 'pdf' ? 'PDF descargado' : 'Excel descargado');
    } catch {
      toast.error('Error al exportar');
    } finally {
      setExportando(false);
    }
  };

  // --- Emisión de factura desde la propia tabla -----------------------------

  const abrirFacturar = (r) => {
    setFactura({
      numero_factura: '',
      // Sugerencia por el documento del cliente (RUC → Factura, DNI → Boleta).
      // Es solo el valor inicial: el selector queda editable.
      tipo_comprobante: tipoComprobanteSugerido(r.servicio?.cliente?.tipo_documento),
      fecha_emision: hoyISO(),
      // Lo que falta facturar: el total si aún no hay comprobante, o el saldo
      // tras una factura parcial.
      monto: situacionGeneral(r).restante.toFixed(2),
      archivos: [],
      numeros_operacion: [''],
      documentos: []
    });
    setFacturando(r);
  };

  const cerrarFacturar = () => {
    if (guardandoFactura) return;
    setFacturando(null);
  };

  const emitirFactura = async () => {
    if (!facturando || guardandoFactura) return;
    if (!factura.numero_factura.trim()) return toast.error('Número de comprobante obligatorio');
    if (!factura.fecha_emision) return toast.error('Fecha de emisión obligatoria');
    const monto = Number(factura.monto);
    if (!Number.isFinite(monto) || monto < 0) return toast.error('Monto inválido');
    // Tope: lo que falta facturar (el backend aplica la misma regla).
    const sg = situacionGeneral(facturando);
    if (sg.restante > 0 && monto - sg.restante > 0.01) {
      return toast.error(sg.facturas.length
        ? `El monto no puede exceder lo que falta facturar (${formatMonto(sg.restante, facturando.servicio?.moneda)}): ya se facturó ${formatMonto(sg.facturado, facturando.servicio?.moneda)} de ${formatMonto(totalCobrable(facturando), facturando.servicio?.moneda)}`
        : `El monto no puede exceder el total del servicio (${formatMonto(sg.restante, facturando.servicio?.moneda)})`);
    }
    setGuardandoFactura(true);
    try {
      await facturasService.create({
        id_servicio: facturando.id_servicio,
        numero_factura: factura.numero_factura.trim(),
        tipo_comprobante: factura.tipo_comprobante,
        fecha_emision: factura.fecha_emision,
        monto,
        archivos: idsArchivosFactura(factura.archivos),
        numeros_operacion: limpiarNumerosOperacion(factura.numeros_operacion),
        documentos: aPayloadDocumentos(factura.documentos)
      });
      toast.success(`Factura ${factura.numero_factura.trim()} emitida`);
      setFacturando(null);
      recargar();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Error al emitir la factura');
    } finally {
      setGuardandoFactura(false);
    }
  };

  return (
    <>
      <PageHeader title="Contabilidad"
        subtitle={vistaModo === 'por_facturar'
          ? 'Cuotas pendientes de facturación (planes de mantenimiento y cobros en cuotas)'
          : `${total.toLocaleString('es-PE')} servicio(s) realizado(s)`}
        actions={
          <>
            {/* Selector de vista. "Servicios" factura el comprobante del servicio;
                "Cuotas por facturar" es la bandeja de cuotas — la misma de
                Gestión de cobros → Por facturar — donde se emite la factura
                mensual de los planes. No confundir con el filtro "Por facturar"
                de la tabla de servicios (GRUPOS_FACTURACION). */}
            <div className="flex items-center gap-2 sm:mr-2" role="group" aria-label="Vista">
              <button
                type="button"
                onClick={() => setVistaModo('servicios')}
                className={vistaModo === 'servicios' ? 'btn-primary' : 'btn-secondary'}
              >Servicios</button>
              <button
                type="button"
                // Entrada "en limpio": se descarta el foco de un salto anterior
                // para no reabrir la bandeja filtrada por un cliente viejo.
                onClick={() => { setFocoCuotas(null); setVistaModo('por_facturar'); }}
                title="Cuotas que aún no tienen comprobante: la factura mensual de los planes de mantenimiento y la de los cobros en cuotas"
                className={vistaModo === 'por_facturar' ? 'btn-primary' : 'btn-secondary'}
              >Cuotas por facturar</button>
            </div>
            {/* El filtro por grupo y los exports son de la tabla de servicios;
                la bandeja de cuotas trae los suyos propios. */}
            {vistaModo === 'servicios' && (
              <>
                {/* Filtro rápido por grupo de facturación: el mismo criterio de las
                    tarjetas. Es un interruptor — volver a pulsarlo lo quita. */}
                <div className="flex items-center gap-2 sm:mr-2" role="group" aria-label="Filtrar por facturación">
                  {GRUPOS_FACTURACION.map(g => {
                    const activo = filtros.grupo_facturacion === g.value;
                    return (
                      <button
                        key={g.value}
                        type="button"
                        aria-pressed={activo}
                        title={activo ? `Quitar el filtro «${g.titulo}»` : g.ayuda}
                        onClick={() => setF('grupo_facturacion', activo ? '' : g.value)}
                        className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium ring-1 transition ${activo ? g.btnOn : g.btnOff}`}
                      >
                        {g.titulo}
                        {activo && <span aria-hidden="true" className="text-xs opacity-70">✕</span>}
                      </button>
                    );
                  })}
                </div>
                <button onClick={() => exportar('excel')} className="btn-secondary" disabled={exportando || total === 0}>Exportar Excel</button>
                <button onClick={() => exportar('pdf')} className="btn-primary" disabled={exportando || total === 0}>Exportar PDF</button>
              </>
            )}
          </>
        }
      />

      {vistaModo === 'servicios' && resumen && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4 mb-4">
          {GRUPOS_FACTURACION.map(g => (
            <CardMetrica
              key={g.value}
              titulo={g.titulo}
              ayuda={g.ayuda}
              cantidad={resumen[g.value]?.cantidad}
              montos={resumen[g.value]?.montos}
              unidad="servicio(s)"
              tono={g.tono}
              nota={resumen.parciales > 0 && resumen[g.value]?.cantidad > 0 ? g.nota(resumen.parciales) : undefined}
            />
          ))}
        </div>
      )}

      {vistaModo === 'servicios' && (
      <div className="card mb-4">
        <div className="p-4 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
          <input className="input lg:col-span-2"
            placeholder="Buscar por código, RUC/DNI, cliente, edificio o código de ascensor…"
            value={filtros.q}
            onChange={e => setF('q', e.target.value)} />
          <select className="select" value={filtros.tipo_categoria} onChange={e => setF('tipo_categoria', e.target.value)}>
            <option value="">Tipo de servicio (todos)</option>
            {TIPOS_CATEGORIA.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
          <select className="select" value={filtros.situacion} onChange={e => setF('situacion', e.target.value)}>
            <option value="">Situación (todas)</option>
            {SITUACIONES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select>
          <select className="select" value={filtros.estado_cobro} onChange={e => setF('estado_cobro', e.target.value)}>
            <option value="">Estado cobro (todos)</option>
            {ESTADOS_COBRO.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
          {/* Deja tabla, indicadores y export en una sola divisa: los importes
              de PEN y USD nunca se suman entre sí. */}
          <FiltroMoneda monedas={monedas} value={filtros.moneda} onChange={v => setF('moneda', v)} />
          <DateRangePicker
            desde={filtros.desde}
            hasta={filtros.hasta}
            onChange={({ desde, hasta }) => setFiltros(f => ({ ...f, desde, hasta }))}
            placeholder="Fecha de servicio (rango)"
          />
          <DateRangePicker
            desde={filtros.registro_desde}
            hasta={filtros.registro_hasta}
            onChange={({ desde, hasta }) => setFiltros(f => ({ ...f, registro_desde: desde, registro_hasta: hasta }))}
            placeholder="Fecha de registro (rango)"
          />
          <DateRangePicker
            desde={filtros.comprobante_desde}
            hasta={filtros.comprobante_hasta}
            onChange={({ desde, hasta }) => setFiltros(f => ({ ...f, comprobante_desde: desde, comprobante_hasta: hasta }))}
            placeholder="Fecha de comprobante (rango)"
          />
          {/* Rango por FECHA DE APROBACIÓN de la cotización del servicio (la que
              registra el módulo de Cotizaciones); se combina con el de fecha de
              servicio. Los servicios sin cotización —visitas de plan, directos—
              no tienen esa fecha y no aparecen mientras el rango esté puesto. */}
          <DateRangePicker
            desde={filtros.aprobacion_desde}
            hasta={filtros.aprobacion_hasta}
            onChange={({ desde, hasta }) => setFiltros(f => ({ ...f, aprobacion_desde: desde, aprobacion_hasta: hasta }))}
            placeholder="Aprobación de cotización (rango)"
          />
          {/* Rango de la columna "Total" (en las visitas de un plan, el monto
              mensual del plan). Sin moneda propia: para no comparar soles con
              dólares, se combina con el filtro de moneda. */}
          <div className="flex gap-2 col-span-2" title="Filtra por la columna «Total». En los mantenimientos de un plan, por el monto mensual del plan.">
            <input type="number" min="0" step="0.01" inputMode="decimal" className="input" placeholder="Monto desde"
              value={filtros.monto_min} onChange={e => setF('monto_min', e.target.value)} />
            <input type="number" min="0" step="0.01" inputMode="decimal" className="input" placeholder="Monto hasta"
              value={filtros.monto_max} onChange={e => setF('monto_max', e.target.value)} />
          </div>
          <button onClick={() => setFiltros(FILTROS_INICIALES)} className="btn-secondary lg:col-span-6">Limpiar filtros</button>
        </div>
      </div>
      )}

      {vistaModo === 'servicios' && (
      <div className="card">
        {loading ? <Loader /> : data.length === 0 ? <EmptyState title="Sin servicios" /> : (
          <>
            <div className="overflow-x-auto scroll-thin">
              <table className="table-base">
                <thead><tr>
                  <th className="table-th">Fecha servicio</th>
                  <th className="table-th" title="Fecha en que se registró la OT del servicio">Fecha registro</th>
                  <th className="table-th">Fecha comprobante</th>
                  <th className="table-th">Código</th>
                  <th className="table-th">DNI / RUC</th>
                  <th className="table-th">Razón social</th>
                  <th className="table-th">Edificio</th>
                  <th className="table-th">Tipo de servicio</th>
                  <th className="table-th">OT</th>
                  <th className="table-th text-right">Total</th>
                  {GRUPOS_FACTURACION.slice().reverse().map(g => (
                    <th key={g.value} title={g.ayuda}
                      className={`table-th text-right ${filtros.grupo_facturacion === g.value ? g.columna : ''}`}>{g.titulo}</th>
                  ))}
                  <th className="table-th">Estado cobro</th>
                  <th className="table-th">Situación</th>
                  <th className="table-th text-right">Acciones</th>
                </tr></thead>
                <tbody className="divide-y divide-slate-100">
                  {data.map((r, idx) => {
                    // La OT vive en el servicio (antes se copiaba al registro de realizado).
                    const ot = { numero: r.servicio?.numero_ot, archivo: r.servicio?.archivo_ot };
                    const tieneOt = !!(ot.numero || ot.archivo);
                    return (
                      <tr key={r.id ?? `row-${idx}`} className="table-row-hover">
                        <td className="table-td text-xs" title={tituloFechaServicio(r)}>
                          {(() => {
                            const f = fechaServicio(r);
                            return f ? formatFecha(f) : <span className="text-slate-400 italic">{SIN_FECHA_SERVICIO}</span>;
                          })()}
                        </td>
                        <td className="table-td text-xs">
                          {(() => { const f = fechaRegistro(r); return f ? formatFecha(f) : <span className="text-slate-400 italic">— (sin OT)</span>; })()}
                        </td>
                        <td className="table-td text-xs">
                          {(() => { const f = fechaComprobante(r); return f ? formatFecha(f) : <span className="text-slate-400">—</span>; })()}
                        </td>
                        <td className="table-td">
                          <Link to={`/servicios/${r.id_servicio}`} className="font-mono text-xs text-brand-700">{r.servicio?.codigo}</Link>
                        </td>
                        <td className="table-td text-xs font-mono whitespace-nowrap">{docCliente(r)}</td>
                        <td className="table-td text-xs">{r.servicio?.cliente?.nombre || '—'}</td>
                        <td className="table-td text-xs">
                          <div>{nombreEdificioDeAscensores(r.servicio) || '—'}</div>
                          <div className="font-mono text-slate-500" title={codigosAscensores(r.servicio).join(', ')}>{resumenAscensores(r.servicio)}</div>
                        </td>
                        <td className="table-td text-xs">{tipoServicioLabel(r)}</td>
                        <td className="table-td">
                          {tieneOt ? (
                            <button
                              type="button"
                              onClick={() => setOtAbierta(ot)}
                              className="inline-flex items-center gap-1 text-brand-700 text-xs hover:underline font-mono"
                              title="Ver OT"
                            >
                              📄 {ot.numero || 'OT'}
                            </button>
                          ) : (
                            <span className="text-slate-400 text-xs">—</span>
                          )}
                        </td>
                        <td className="table-td text-right font-mono">
                          {(() => {
                            // Visita de plan: el importe es el mensual del plan,
                            // no un total propio de esta fila.
                            const plan = precioMensualDelPlan(r.servicio);
                            if (!plan) return formatMonto(r.servicio?.precio_interno, r.servicio?.moneda);
                            return (
                              <span title="Importe mensual del plan: cubre todas las visitas del mes y se factura una sola vez">
                                {formatMonto(plan.monto, plan.moneda)}
                                <span className="block text-[10px] text-slate-400 font-sans">al mes · plan</span>
                              </span>
                            );
                          })()}
                        </td>
                        {/* Facturado y Por facturar: un servicio facturado en parte
                            muestra las dos cifras; el botón activo resalta la suya. */}
                        {GRUPOS_FACTURACION.slice().reverse().map(g => {
                          const fx = r.facturacion;
                          const importe = fx?.[g.value] || 0;
                          const detalle = fx && importe > 0 ? detalleFacturacion(fx, g.value) : [];
                          return (
                            <td key={g.value}
                              className={`table-td text-right font-mono whitespace-nowrap ${filtros.grupo_facturacion === g.value ? g.columna : ''}`}>
                              {importe > 0 ? (
                                <>
                                  <span className={g.value === 'facturado' ? 'text-emerald-800' : 'text-amber-800'}>
                                    {formatMonto(importe, fx.moneda)}
                                  </span>
                                  {detalle.map((d, i) => (
                                    <span key={`${i}-${d}`} className="block text-[10px] text-slate-400 font-sans">{d}</span>
                                  ))}
                                </>
                              ) : <span className="text-slate-300">—</span>}
                            </td>
                          );
                        })}
                        <td className="table-td">
                          <span className={badgeEstado(r.estado_cobro)}>{r.estado_cobro}</span>
                        </td>
                        <td className="table-td">
                          {(() => { const sit = situacionPago(r); return <span className={badgeEstado(sit === 'Cancelado' ? 'Pagado' : 'Pendiente de iniciar')}>{sit}</span>; })()}
                        </td>
                        <td className="table-td text-right space-x-3 whitespace-nowrap">
                          {puedeFacturar && (() => {
                            const acc = accionFacturar(r);
                            // Factura general del servicio: se emite en el modal de
                            // esta misma página.
                            if (acc.tipo === 'emitir') {
                              // Tras una factura parcial el botón sigue activo: emite
                              // el siguiente comprobante por lo que falta.
                              const sg = situacionGeneral(r);
                              const ayuda = sg.facturas.length
                                ? `Ya facturado ${formatMonto(sg.facturado, monedaDe(r))} · falta facturar ${formatMonto(sg.restante, monedaDe(r))}`
                                : undefined;
                              return <button type="button" onClick={() => abrirFacturar(r)} title={ayuda}
                                className="text-emerald-700 text-xs font-medium hover:underline">Facturar</button>;
                            }
                            // El comprobante que falta es de una CUOTA (mes del plan
                            // o cobro en cuotas): se salta a la bandeja "Cuotas por facturar"
                            // de esta página, ya filtrada por el cliente.
                            if (acc.tipo === 'bandeja') {
                              return <button type="button" onClick={() => irACuotasDelPlan(r)} title={acc.ayuda}
                                className="text-emerald-700 text-xs font-medium hover:underline">{acc.etiqueta}</button>;
                            }
                            return <span className="text-slate-300 text-xs cursor-help" title={acc.motivo}>Facturar</span>;
                          })()}
                          {/* Mantenimiento de plan: su cobro es el del plan. */}
                          {(() => {
                            const idCobro = r.servicio?.cobro?.id ?? r.facturacion_plan?.id_cobro;
                            return idCobro ? <Link to={`/cobros/${idCobro}`} className="text-brand-700 text-xs">Ir a cobro</Link> : null;
                          })()}
                          <Link to={`/servicios/${r.id_servicio}`} className="text-slate-600 text-xs">Detalle</Link>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <Pagination page={page} pageSize={pageSize} total={total} totalPages={totalPages}
              onPage={setPage} onPageSize={setPageSize} />
          </>
        )}
      </div>
      )}

      {/* Bandeja de cuotas por facturar: el MISMO componente que monta Gestión
          de cobros. La factura mensual de un plan de mantenimiento se emite aquí
          (contra la cuota del plan) sin salir de Contabilidad, con el mismo
          POST /facturas que usa el detalle del plan en Mantenimientos. Al emitir
          se refresca también la tabla de servicios y sus contadores. */}
      {vistaModo === 'por_facturar' && (
        <CuotasNoFacturadas
          clientes={clientes}
          proyectos={proyectos}
          filtrosIniciales={focoCuotas?.filtros || null}
          focoKey={focoCuotas?.key ?? null}
          onFacturaEmitida={recargar}
        />
      )}

      <Modal open={!!facturando} onClose={cerrarFacturar} title="Emitir comprobante" size="sm"
        footer={<>
          <button type="button" className="btn-secondary" onClick={cerrarFacturar} disabled={guardandoFactura}>Cancelar</button>
          <button type="button" className="btn-primary" onClick={emitirFactura} disabled={guardandoFactura || cargaFactura.subiendo || cargaDocsFactura.subiendo}>
            {guardandoFactura ? 'Emitiendo…' : 'Emitir comprobante'}
          </button>
        </>}>
        {facturando && (
          <div className="space-y-3 text-sm">
            <div className="rounded-lg bg-slate-50 ring-1 ring-slate-200 p-3 text-xs space-y-1">
              <div><span className="text-slate-400">Cliente:</span> {facturando.servicio?.cliente?.nombre || '—'}</div>
              <div>
                <span className="text-slate-400">Servicio:</span>{' '}
                <span className="font-mono text-slate-800">{facturando.servicio?.codigo}</span>
                {' · '}{tipoServicioLabel(facturando)}
              </div>
              <div><span className="text-slate-400">Edificio:</span> {nombreEdificioDeAscensores(facturando.servicio) || '—'}</div>
              <div>
                <span className="text-slate-400">Total del servicio:</span>{' '}
                <span className="font-mono">{formatMonto(totalCobrable(facturando), facturando.servicio?.moneda)}</span>
              </div>
              {/* Facturación en partes: lo ya emitido y lo que falta, con los
                  mismos importes de las columnas "Facturado" / "Por facturar". */}
              {(() => {
                const sg = situacionGeneral(facturando);
                if (!sg.facturas.length) return null;
                return (
                  <>
                    <div>
                      <span className="text-slate-400">Ya facturado:</span>{' '}
                      <span className="font-mono text-emerald-800">{formatMonto(sg.facturado, facturando.servicio?.moneda)}</span>
                      <span className="text-slate-500"> · {sg.facturas.map(f => f.numero_factura).join(', ')}</span>
                    </div>
                    <div>
                      <span className="text-slate-400">Falta facturar:</span>{' '}
                      <span className="font-mono text-amber-800">{formatMonto(sg.restante, facturando.servicio?.moneda)}</span>
                    </div>
                  </>
                );
              })()}
            </div>
            <div>
              <label className="label">Tipo de comprobante *</label>
              <select className="select" value={factura.tipo_comprobante}
                onChange={e => setFactura(f => ({ ...f, tipo_comprobante: e.target.value }))}>
                {TIPOS_COMPROBANTE.map(t => <option key={t.codigo} value={t.codigo}>{t.etiqueta}</option>)}
              </select>
              <p className="text-xs text-slate-500 mt-1">
                Sugerido por el documento del cliente ({docCliente(facturando)}); puede cambiarse.
              </p>
            </div>
            <div>
              <label className="label">Número de comprobante *</label>
              <input className="input" placeholder={ejemploNumeroComprobante(factura.tipo_comprobante)}
                value={factura.numero_factura}
                onChange={e => setFactura(f => ({ ...f, numero_factura: e.target.value }))} />
            </div>
            <div>
              <label className="label">Fecha de emisión *</label>
              <input type="date" className="input" value={factura.fecha_emision}
                onChange={e => setFactura(f => ({ ...f, fecha_emision: e.target.value }))} />
            </div>
            <div>
              <label className="label">Monto *</label>
              <input type="number" min="0" step="0.01" className="input text-right font-mono" value={factura.monto}
                onChange={e => setFactura(f => ({ ...f, monto: e.target.value }))} />
              <p className="text-xs text-slate-500 mt-1">
                Precargado con lo que falta facturar. Puede reducirse (factura parcial) y completarse
                después con otro comprobante; nunca excederlo.
              </p>
            </div>
            <CampoNumerosOperacion
              value={factura.numeros_operacion}
              onChange={numeros_operacion => setFactura(f => ({ ...f, numeros_operacion }))}
            />
            <ArchivosFacturaBorrador
              value={factura.archivos}
              setValue={fn => setFactura(f => ({ ...f, archivos: fn(f.archivos) }))}
              carga={cargaFactura}
            />
            <DocumentosAdicionalesBorrador
              value={factura.documentos}
              onChange={documentos => setFactura(f => ({ ...f, documentos }))}
              carga={cargaDocsFactura}
            />
          </div>
        )}
      </Modal>

      <OtModal
        open={otAbierta !== null}
        onClose={() => setOtAbierta(null)}
        numero={otAbierta?.numero}
        archivo={otAbierta?.archivo}
      />
    </>
  );
}
