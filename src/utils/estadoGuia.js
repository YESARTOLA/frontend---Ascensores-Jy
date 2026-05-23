// Catálogo único de estados de la guía de salida.
// Espejo de backend/utils/estadoGuia.js — mantener ambos en sincronía.

export const ESTADO_GUIA_PENDIENTE = 'Pendiente';
export const ESTADO_GUIA_ADJUNTA = 'Adjunta';
export const ESTADO_GUIA_OBSERVADA = 'Observada';

export const ESTADOS_GUIA = [
  ESTADO_GUIA_PENDIENTE,
  ESTADO_GUIA_ADJUNTA,
  ESTADO_GUIA_OBSERVADA
];

export function estadoGuiaSegunArchivo(idArchivo) {
  return idArchivo ? ESTADO_GUIA_ADJUNTA : ESTADO_GUIA_OBSERVADA;
}

export function esEstadoGuiaValido(estado) {
  return ESTADOS_GUIA.includes(estado);
}
