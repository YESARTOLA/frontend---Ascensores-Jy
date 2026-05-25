// Catálogo único de estados del lead. Espejo de backend/utils/estadoLead.js.
//
// Consulta  → inicial al registrar.
// Pendiente → intermedio (manual).
// Cotizado  → automático al crear una cotización del lead.
// Ingresado → automático al convertir/aprobar el lead en un servicio.

export const ESTADO_LEAD_CONSULTA = 'Consulta';
export const ESTADO_LEAD_PENDIENTE = 'Pendiente';
export const ESTADO_LEAD_COTIZADO = 'Cotizado';
export const ESTADO_LEAD_INGRESADO = 'Ingresado';

export const ESTADOS_LEAD = [
  ESTADO_LEAD_CONSULTA,
  ESTADO_LEAD_PENDIENTE,
  ESTADO_LEAD_COTIZADO,
  ESTADO_LEAD_INGRESADO
];

export function esEstadoLeadValido(estado) {
  return ESTADOS_LEAD.includes(estado);
}
