// Catálogo de estados del servicio y predicados asociados.
//
// Espejo de backend/utils/estadoServicio.js — mantener ambos en sincronía.

// Estados nominados que se referencian explícitamente desde la lógica de
// negocio (transiciones de cierre, regularización de guías).
export const ESTADO_SERVICIO_FINALIZADO_TECNICO = 'Finalizado por técnico';
export const ESTADO_SERVICIO_FINALIZADO_OBSERVADO = 'Finalizado observado';

export const ESTADOS_SERVICIO = [
  'Borrador',
  'Pendiente',
  'Asignado',
  'Checklist de salida pendiente',
  'Listo para salida',
  'En camino',
  'En curso',
  ESTADO_SERVICIO_FINALIZADO_TECNICO,
  ESTADO_SERVICIO_FINALIZADO_OBSERVADO,
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
  'Pendiente',
  'Asignado',
  'Checklist de salida pendiente',
  'Listo para salida'
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
// Distinto de `estaServicioFinalizado` porque "Finalizado por técnico" y
// "Finalizado observado" sí permiten todavía gestionar/regularizar guías.
export function esServicioPostRevision(estadoServicio) {
  return ESTADOS_POST_EJECUCION.includes(estadoServicio);
}

// Catálogos de estados de los registros asociados a un servicio. Sirven para
// poblar selects de filtro y para predicados (p.ej. "está cerrado").
export const ESTADOS_EMERGENCIA = ['Reportada', 'En atención', 'Resuelto', 'Cerrada'];
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
