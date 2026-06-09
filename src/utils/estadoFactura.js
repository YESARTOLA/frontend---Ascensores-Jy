// Catálogo único de estados de facturación.
// Espejo de backend/utils/estadoFactura.js — mantener ambos en sincronía.

export const ESTADO_FACTURA_SIN = 'Sin factura';
export const ESTADO_FACTURA_PENDIENTE = 'Pendiente de emitir';
export const ESTADO_FACTURA_EMITIDA = 'Emitida';
export const ESTADO_FACTURA_ENVIADA = 'Enviada';
export const ESTADO_FACTURA_ADJUNTA = 'Adjunta';
export const ESTADO_FACTURA_OBSERVADA = 'Observada';
export const ESTADO_FACTURA_ANULADA = 'Anulada';

export const ESTADOS_FACTURA = [
  ESTADO_FACTURA_SIN,
  ESTADO_FACTURA_PENDIENTE,
  ESTADO_FACTURA_EMITIDA,
  ESTADO_FACTURA_ENVIADA,
  ESTADO_FACTURA_ADJUNTA,
  ESTADO_FACTURA_OBSERVADA,
  ESTADO_FACTURA_ANULADA
];

export const ESTADO_FACTURACION_SIN = 'Sin factura';
export const ESTADO_FACTURACION_PENDIENTE = 'Pendiente de emitir';
export const ESTADO_FACTURACION_PARCIAL = 'Parcialmente facturado';
export const ESTADO_FACTURACION_FACTURADO = 'Facturado';
export const ESTADO_FACTURACION_ENVIADA = 'Enviada';

export const ESTADOS_FACTURACION_COMPLETA = [
  ESTADO_FACTURACION_FACTURADO,
  ESTADO_FACTURACION_ENVIADA
];

// Dominio completo de la facturación a nivel servicio (columna estado_facturacion),
// usado para poblar filtros.
export const ESTADOS_FACTURACION = [
  ESTADO_FACTURACION_SIN,
  ESTADO_FACTURACION_PENDIENTE,
  ESTADO_FACTURACION_PARCIAL,
  ESTADO_FACTURACION_FACTURADO,
  ESTADO_FACTURACION_ENVIADA
];

export function esFacturaActiva(factura) {
  if (!factura) return false;
  if (factura.estado !== undefined && factura.estado !== 1) return false;
  return factura.estado_factura !== ESTADO_FACTURA_ANULADA;
}

export function esFacturado(estadoFacturacion) {
  return ESTADOS_FACTURACION_COMPLETA.includes(estadoFacturacion);
}

// Estados de la factura individual que permiten transicionar manualmente
// a 'Enviada' desde la pantalla Gestionar del cobro.
export const ESTADOS_FACTURA_ENVIABLES = [
  ESTADO_FACTURA_EMITIDA,
  ESTADO_FACTURA_ADJUNTA,
  ESTADO_FACTURA_OBSERVADA
];

export function puedeMarcarseEnviada(estadoFactura) {
  return ESTADOS_FACTURA_ENVIABLES.includes(estadoFactura);
}
