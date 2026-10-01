/**
 * Catálogo de TIPOS DE DOCUMENTO que acompañan a una factura, además de su
 * comprobante: constancia de detracción, de retención, de pago, XML/CDR…
 * Espejo de backend/utils/documentosFactura.js — mantener en sincronía los
 * códigos. `corto` es solo de la UI: rotula los chips de las tablas.
 */
export const TIPO_DOCUMENTO_FACTURA_OTRO = 'Otro';

export const TIPOS_DOCUMENTO_FACTURA = [
  { codigo: 'Constancia de detracción', etiqueta: 'Constancia de detracción', corto: 'Detracción' },
  { codigo: 'Constancia de retención',  etiqueta: 'Constancia de retención',  corto: 'Retención' },
  { codigo: 'Constancia de pago',       etiqueta: 'Constancia de pago',       corto: 'Pago' },
  { codigo: 'XML / CDR',                etiqueta: 'XML / CDR (SUNAT)',        corto: 'XML/CDR' },
  { codigo: 'Guía de remisión',         etiqueta: 'Guía de remisión',         corto: 'Guía' },
  { codigo: 'Orden de compra',          etiqueta: 'Orden de compra',          corto: 'O. compra' },
  { codigo: TIPO_DOCUMENTO_FACTURA_OTRO, etiqueta: 'Otro',                    corto: 'Otro' }
];

/** Tipo con el que arranca el selector: el caso más frecuente. */
export const TIPO_DOCUMENTO_FACTURA_INICIAL = TIPOS_DOCUMENTO_FACTURA[0].codigo;

/** Etiqueta legible de un documento ya registrado (tolera códigos fuera del catálogo). */
export function etiquetaTipoDocumentoFactura(tipo) {
  return TIPOS_DOCUMENTO_FACTURA.find(t => t.codigo === tipo)?.etiqueta || tipo || TIPO_DOCUMENTO_FACTURA_OTRO;
}

/**
 * Rótulo breve de un documento para un chip. "Otro" no dice nada por sí solo:
 * se rotula con el inicio de su descripción.
 */
export function rotuloCortoDocumentoFactura(doc) {
  if (doc?.tipo_documento === TIPO_DOCUMENTO_FACTURA_OTRO && doc.descripcion) {
    return doc.descripcion.length > 18 ? `${doc.descripcion.slice(0, 17)}…` : doc.descripcion;
  }
  return TIPOS_DOCUMENTO_FACTURA.find(t => t.codigo === doc?.tipo_documento)?.corto
    || doc?.tipo_documento || TIPO_DOCUMENTO_FACTURA_OTRO;
}
