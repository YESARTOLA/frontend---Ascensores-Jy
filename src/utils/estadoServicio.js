// Catálogo de estados del servicio y predicados asociados.
//
// Espejo de backend/utils/estadoServicio.js — mantener ambos en sincronía.

// Los cuatro estados del trabajo del técnico. El resto del catálogo es el
// circuito administrativo, que mueve contabilidad.
export const ESTADO_SERVICIO_PENDIENTE = 'Pendiente';
// Asignado = técnico Y fecha programada. Con solo una de las dos cosas el
// servicio se queda en Pendiente: no hay nada ejecutable en la agenda.
export const ESTADO_SERVICIO_ASIGNADO = 'Asignado';
// No se marca a mano: lo enciende el primer registro del técnico sobre el
// servicio (evidencia, guía, OT, observación o checklist de finalización).
export const ESTADO_SERVICIO_EN_CURSO = 'En curso';
// Cierre manual del trabajo de campo. Único: un cierre sin guía se reconoce por
// el estado de la GUÍA ("Observada"), no por un estado de servicio aparte.
export const ESTADO_SERVICIO_FINALIZADO = 'Finalizado';

export const ESTADOS_SERVICIO = [
  'Borrador',
  ESTADO_SERVICIO_PENDIENTE,
  ESTADO_SERVICIO_ASIGNADO,
  ESTADO_SERVICIO_EN_CURSO,
  ESTADO_SERVICIO_FINALIZADO,
  'En revisión administrativa',
  'A gestión de cobro',
  'En cobro',
  'Cobrado parcial',
  'Cobrado total',
  'Facturado',
  'Cerrado',
  'Cancelado'
];

// Estados pre-ejecución: el servicio aún no salió a campo. En estos estados se
// permite editar datos básicos (cliente, ascensores, precio, fecha, etc.) sin
// riesgo de romper historial, evidencias, guías, cobros o facturación.
export const ESTADOS_SERVICIO_EDITABLES = [
  'Borrador',
  ESTADO_SERVICIO_PENDIENTE,
  ESTADO_SERVICIO_ASIGNADO
];

// Estados "en gestión": el servicio está vivo en el flujo operativo, desde
// que se crea hasta que el técnico lo finaliza (antes de revisión/cobro). Es el
// universo que muestra la pantalla de Asignaciones.
export const ESTADOS_SERVICIO_EN_GESTION = [
  'Borrador',
  ESTADO_SERVICIO_PENDIENTE,
  ESTADO_SERVICIO_ASIGNADO,
  ESTADO_SERVICIO_EN_CURSO
];

// Estados post-ejecución (administrativo, contable o terminal). Mientras un
// servicio esté aquí — o en alguno que empiece por "Finalizado" — no se deben
// crear/modificar entregas, evidencias ni guías sobre él.
export const ESTADOS_POST_EJECUCION = [
  'En revisión administrativa',
  'A gestión de cobro',
  'En cobro',
  'Cobrado parcial',
  'Cobrado total',
  'Facturado',
  'Cerrado',
  'Cancelado'
];

export function estaServicioFinalizado(estadoServicio) {
  if (!estadoServicio) return false;
  if (estadoServicio.startsWith('Finalizado')) return true;
  return ESTADOS_POST_EJECUCION.includes(estadoServicio);
}

export function esServicioEditable(estadoServicio) {
  return ESTADOS_SERVICIO_EDITABLES.includes(estadoServicio);
}

// El servicio ya pasó por revisión administrativa o está en flujo posterior
// (cobro / facturación / cerrado / cancelado). Las guías de salida y sus
// observaciones técnicas no se deben crear/editar/eliminar a partir de aquí.
// Distinto de `estaServicioFinalizado` porque "Finalizado" sí permite todavía
// gestionar/regularizar la guía que faltó.
export function esServicioPostRevision(estadoServicio) {
  return ESTADOS_POST_EJECUCION.includes(estadoServicio);
}

// Catálogos de estados de los registros asociados a un servicio. Sirven para
// poblar selects de filtro y para predicados (p.ej. "está cerrado").
// Espejo de backend/utils/estadoServicio.js. El estado de la emergencia no se
// edita a mano: lo deriva el servicio que la atiende, así que esta lista es
// también el recorrido posible de ese ciclo.
export const ESTADOS_EMERGENCIA = ['Reportada', 'En atención', 'Atendida', 'Cerrada', 'Cancelada'];
export const ESTADOS_CORRECTIVO = ['Reportado', 'En atención', 'Resuelto', 'Cerrado'];
export const ESTADOS_ATENCION_RAPIDA = ['nueva', 'convertida', 'descartada'];

export function esEmergenciaCerrada(estado) {
  return estado === 'Cerrada';
}

export function esCorrectivoCerrado(estado) {
  return estado === 'Cerrado';
}

export function esAtencionRapidaConvertida(estado) {
  return estado === 'convertida';
}
