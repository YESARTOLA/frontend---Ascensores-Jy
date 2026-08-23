/**
 * Catálogo único de TIPOS DE COMPROBANTE de venta.
 * Espejo de backend/utils/catalogosComprobante.js — mantener en sincronía.
 *
 * En Perú el comprobante depende de quién recibe: Factura para contribuyentes
 * con RUC, Boleta para consumidor final con DNI. Esa correspondencia solo
 * SUGIERE el tipo al emitir (`tipoComprobanteSugerido`); quien emite puede
 * cambiarlo, y el backend no lo valida contra el documento del cliente.
 */
export const TIPO_COMPROBANTE_FACTURA = 'Factura';
export const TIPO_COMPROBANTE_BOLETA = 'Boleta';

export const TIPOS_COMPROBANTE = [
  { codigo: TIPO_COMPROBANTE_FACTURA, etiqueta: 'Factura', serie_prefijo: 'F', documento: 'RUC' },
  { codigo: TIPO_COMPROBANTE_BOLETA,  etiqueta: 'Boleta',  serie_prefijo: 'B', documento: 'DNI' }
];

export const TIPOS_COMPROBANTE_CODIGOS = TIPOS_COMPROBANTE.map(t => t.codigo);

// El histórico anterior a esta funcionalidad son todas facturas.
export const TIPO_COMPROBANTE_POR_DEFECTO = TIPO_COMPROBANTE_FACTURA;

/** Etiqueta legible de un comprobante ya emitido (tolera filas sin el campo). */
export function etiquetaTipoComprobante(tipo) {
  const t = TIPOS_COMPROBANTE.find(x => x.codigo === tipo);
  return t ? t.etiqueta : TIPO_COMPROBANTE_POR_DEFECTO;
}

/** Placeholder del número según el tipo: "F001-000123" / "B001-000123". */
export function ejemploNumeroComprobante(tipo) {
  const t = TIPOS_COMPROBANTE.find(x => x.codigo === tipo) || TIPOS_COMPROBANTE[0];
  return `${t.serie_prefijo}001-000XXX`;
}

/**
 * Tipo que corresponde por el documento del receptor. Solo sugerencia inicial
 * del formulario de emisión.
 */
export function tipoComprobanteSugerido(tipoDocumento) {
  return String(tipoDocumento || '').toUpperCase() === 'DNI'
    ? TIPO_COMPROBANTE_BOLETA
    : TIPO_COMPROBANTE_FACTURA;
}
