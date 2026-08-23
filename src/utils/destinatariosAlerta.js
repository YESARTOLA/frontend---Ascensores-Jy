/**
 * Destinatarios de la ALERTA de una observación técnica.
 * Espejo de backend/utils/destinatariosAlerta.js — mantener en sincronía.
 *
 * El técnico elige a quién avisar. `detalle: false` significa que ese
 * destinatario recibe solo el aviso de que el servicio tiene una observación,
 * sin el comentario ni la imagen (es el caso de contabilidad, que por regla del
 * negocio no accede al detalle técnico).
 */
export const DESTINATARIOS_ALERTA = [
  { codigo: 'administracion', etiqueta: 'Administración',  ayuda: 'Recibe la alerta con el detalle', detalle: true },
  { codigo: 'coordinacion',   etiqueta: 'Oficina técnica', ayuda: 'Coordinación · con el detalle',   detalle: true },
  { codigo: 'cotizacion',     etiqueta: 'Cotización',      ayuda: 'Vendedora · con el detalle, para cotizar el hallazgo', detalle: true },
  { codigo: 'contabilidad',   etiqueta: 'Contabilidad',    ayuda: 'Solo el aviso, sin el comentario ni la imagen', detalle: false }
];

export const DESTINATARIOS_CODIGOS = DESTINATARIOS_ALERTA.map(d => d.codigo);

/** Etiquetas legibles de una lista de códigos (para mostrar en la observación). */
export function etiquetasDestinatarios(codigos) {
  const lista = Array.isArray(codigos)
    ? codigos
    : String(codigos || '').split(',').map(s => s.trim()).filter(Boolean);
  return lista
    .map(c => DESTINATARIOS_ALERTA.find(d => d.codigo === c)?.etiqueta)
    .filter(Boolean);
}
