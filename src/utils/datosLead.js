// Documento y referencia de pago del lead. Espejo de backend/utils/datosLead.js.
//
// El prospecto puede ser una EMPRESA (RUC, 11 dígitos) o una PERSONA NATURAL
// (DNI, 8). El número viaja en el campo `ruc` del formulario en los dos casos
// —es el nombre histórico de la columna— y `tipo_documento` dice cuál es.

export const TIPO_DOC_RUC = 'RUC';
export const TIPO_DOC_DNI = 'DNI';

// Etiqueta comercial de cada tipo: el usuario elige "quién es", no el documento.
export const TIPOS_DOCUMENTO = [
  { valor: TIPO_DOC_RUC, etiqueta: 'Empresa (RUC)', documento: 'RUC', longitud: 11 },
  { valor: TIPO_DOC_DNI, etiqueta: 'Persona natural (DNI)', documento: 'DNI', longitud: 8 }
];

export const tipoDocumentoDe = (valor) =>
  TIPOS_DOCUMENTO.find(t => t.valor === valor) || TIPOS_DOCUMENTO[0];

export const BUEN_PAGADOR_SIN_CALIFICAR = 'Sin calificar';
export const BUEN_PAGADOR_SI = 'Buen pagador';
export const BUEN_PAGADOR_NO = 'No es buen pagador';

export const ESTADOS_BUEN_PAGADOR = [
  BUEN_PAGADOR_SIN_CALIFICAR,
  BUEN_PAGADOR_SI,
  BUEN_PAGADOR_NO
];

// Badge de la referencia de pago en la lista de leads (mismas clases que el
// resto de badges del sistema).
export function badgeBuenPagador(valor) {
  if (valor === BUEN_PAGADOR_SI) return 'badge-green';
  if (valor === BUEN_PAGADOR_NO) return 'badge-red';
  return 'badge-gray';
}
