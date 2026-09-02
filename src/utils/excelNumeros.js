/**
 * Celdas NUMÉRICAS para las exportaciones a Excel del frontend.
 *
 * Las exportaciones se generan como `.xls` HTML (una <table> con la plantilla de
 * Office). Por defecto Excel importa cada celda como TEXTO, así que un importe
 * escrito "S/ 1,234.56" no suma: `SUMA()` devuelve 0. Este módulo convierte esas
 * celdas en números reales:
 *
 *   · `x:num="1234.56"`  → valor numérico explícito, en formato invariante
 *                          (punto decimal), independiente de la configuración
 *                          regional del Excel que abra el archivo;
 *   · `mso-number-format` → máscara de presentación (#,##0.00), para que el
 *                          número se vea con sus dos decimales y separador de
 *                          miles.
 *
 * El símbolo de moneda NO va dentro del número: la divisa viaja en su propia
 * columna ("Soles" / "Dólares"), que es lo que permite filtrar y totalizar cada
 * moneda por separado sin mezclar importes de distinta divisa en una misma suma.
 * Además evita que la máscara necesite comillas, que el parser HTML de Excel
 * trata de forma inconsistente.
 *
 * Hay dos vías para marcar una celda como numérica:
 *   1. explícita  — `marcarCeldaNumerica(td, valor, formato)` o, en JSX,
 *                   `<td {...celdaNumerica(valor, formato)}>`;
 *   2. automática — `numeroDeTexto()` reconoce importes con símbolo de moneda y
 *                   porcentajes ya formateados. Es deliberadamente conservadora:
 *                   NO convierte números "pelados" porque en estas tablas suelen
 *                   ser RUC/DNI, números de comprobante, OT o códigos, donde
 *                   volverlos número perdería los ceros a la izquierda o los
 *                   pasaría a notación científica.
 */

// Máscaras de presentación (sintaxis de formato de número de Excel).
export const FORMATO_EXCEL = {
  entero: '#,##0',
  decimal: '#,##0.00',
  porcentaje: '0.0%'
};

// Atributos con los que se marca una celda antes de serializarla a Excel.
export const ATTR_NUM = 'data-excel-num';
export const ATTR_FMT = 'data-excel-fmt';

/**
 * Etiqueta legible de la moneda, para la columna filtrable del export
 * ("Soles" / "Dólares" son valores estables y únicos en el autofiltro).
 */
export function etiquetaMoneda(moneda) {
  const cod = String(moneda || '').toUpperCase();
  if (cod === 'USD') return 'Dólares';
  if (cod === 'PEN') return 'Soles';
  return '';
}

/**
 * Escapa una máscara para incrustarla en `style="mso-number-format:'…'"`.
 * Excel exige que todo carácter no alfanumérico vaya precedido de `\`.
 */
export function escaparFormatoMso(formato) {
  return String(formato).replace(/[^0-9a-zA-Z]/g, c => `\\${c}`);
}

// Símbolos/códigos de moneda que produce `formatMonto` (Intl es-PE) o el backend.
const RE_MONEDA_PEN = /^(S\/\.?|PEN)$/i;
const RE_MONEDA_USD = /^(US\$|USD|\$)$/i;
// "S/ 1,234.56" · "-US$ 80.00" · "$ 1,234.56" · "(S/ 90.00)" para negativos.
const RE_MONTO = /^(-?)\s*(S\/\.?|US\$|USD|PEN|\$)\s*(-?)\s*([\d.,]+)$/i;
const RE_PORCENTAJE = /^(-?[\d.,]+)\s*%$/;

/**
 * Normaliza el texto de una celda. `\s` de JavaScript ya cubre el espacio duro
 * (U+00A0) y el estrecho (U+202F) con los que Intl separa el símbolo de moneda.
 */
function limpiar(texto) {
  return String(texto ?? '').replace(/\s+/g, ' ').trim();
}

/**
 * Convierte "1,234.56" (formato es-PE: coma de miles, punto decimal) a Number.
 * Devuelve null si la cadena no es un número bien formado.
 */
function aNumero(cuerpo) {
  const limpio = cuerpo.replace(/,/g, '');
  if (!/^\d+(\.\d+)?$/.test(limpio)) return null;
  const n = Number(limpio);
  return Number.isFinite(n) ? n : null;
}

/**
 * Reconoce importes y porcentajes ya formateados y devuelve el valor numérico,
 * su máscara de Excel y la moneda detectada. `null` si el texto no es ninguno
 * de los dos.
 * @returns {{valor:number, formato:string, moneda:string|null}|null}
 */
export function numeroDeTexto(texto) {
  let t = limpiar(texto);
  if (!t) return null;

  // Negativo entre paréntesis, convención contable: (S/ 90.00).
  let negativoParentesis = false;
  if (t.startsWith('(') && t.endsWith(')')) {
    negativoParentesis = true;
    t = t.slice(1, -1).trim();
  }

  const monto = RE_MONTO.exec(t);
  if (monto) {
    const [, signoIzq, simbolo, signoDer, cuerpo] = monto;
    const valor = aNumero(cuerpo);
    if (valor === null) return null;
    const negativo = negativoParentesis || signoIzq === '-' || signoDer === '-';
    const moneda = RE_MONEDA_USD.test(simbolo) ? 'USD' : (RE_MONEDA_PEN.test(simbolo) ? 'PEN' : null);
    return { valor: negativo ? -valor : valor, formato: FORMATO_EXCEL.decimal, moneda };
  }

  const pct = RE_PORCENTAJE.exec(t);
  if (pct) {
    const negativo = pct[1].startsWith('-');
    const valor = aNumero(pct[1].replace(/^-/, ''));
    if (valor === null) return null;
    // Excel guarda los porcentajes como fracción: 45.5% → 0.455.
    return { valor: (negativo ? -valor : valor) / 100, formato: FORMATO_EXCEL.porcentaje, moneda: null };
  }

  return null;
}

/**
 * Marca un <td> como numérico para la exportación. El texto visible no se toca
 * (lo siguen usando la pantalla y el PDF); solo se anota el valor crudo.
 */
export function marcarCeldaNumerica(td, valor, formato = FORMATO_EXCEL.decimal) {
  const n = Number(valor);
  if (valor === null || valor === undefined || valor === '' || !Number.isFinite(n)) return false;
  td.setAttribute(ATTR_NUM, String(n));
  td.setAttribute(ATTR_FMT, formato);
  return true;
}

/**
 * Props de celda numérica para usar en JSX: <td {...celdaNumerica(v)}>.
 * Devuelve `{}` cuando el valor no es numérico, para no ensuciar el DOM.
 */
export function celdaNumerica(valor, formato = FORMATO_EXCEL.decimal) {
  const n = Number(valor);
  if (valor === null || valor === undefined || valor === '' || !Number.isFinite(n)) return {};
  return { [ATTR_NUM]: String(n), [ATTR_FMT]: formato };
}

/**
 * Deja una tabla lista para Excel: en cada celda numérica escribe el valor
 * crudo y su máscara. Trabaja sobre el nodo recibido, así que hay que pasarle
 * un CLON cuando la tabla original se sigue usando (pantalla o PDF).
 *
 * @param {HTMLTableElement} tabla clon de la tabla a serializar
 * @returns {HTMLTableElement} la misma tabla, con las celdas ya convertidas
 */
export function prepararTablaExcel(tabla) {
  tabla.querySelectorAll('td').forEach(td => {
    const marcado = td.getAttribute(ATTR_NUM);
    let valor = null;
    let formato = td.getAttribute(ATTR_FMT) || FORMATO_EXCEL.decimal;

    if (marcado !== null && marcado !== '') {
      const n = Number(marcado);
      if (Number.isFinite(n)) valor = n;
    } else {
      // Auto-detección: importes y porcentajes ya formateados en la celda.
      const detectado = numeroDeTexto(td.textContent);
      if (detectado) {
        valor = detectado.valor;
        formato = detectado.formato;
      }
    }

    td.removeAttribute(ATTR_NUM);
    td.removeAttribute(ATTR_FMT);
    if (valor === null) return;

    // Valor invariante para Excel + máscara de presentación. El contenido de
    // texto se reemplaza por el número plano: es el respaldo para las hojas de
    // cálculo que ignoran `x:num` (LibreOffice, Google Sheets).
    td.setAttribute('x:num', String(valor));
    const estilo = (td.getAttribute('style') || '').replace(/text-align\s*:[^;]*;?/gi, '');
    td.setAttribute('style', `${estilo ? `${estilo};` : ''}mso-number-format:'${escaparFormatoMso(formato)}';text-align:right`);
    td.textContent = String(valor);
  });
  return tabla;
}

/**
 * Añade al final de la tabla una columna con la moneda de cada fila, deducida
 * del símbolo de sus importes ("S/ 1,234.56" → Soles). Es lo que permite
 * filtrar y totalizar soles y dólares por separado, ya que el importe viaja a
 * Excel como número puro, sin símbolo.
 *
 * Es para tablas serializadas DESDE EL DOM (Reportes), donde no hay una
 * definición de columnas donde declararla. Hay que llamarla ANTES de
 * `prepararTablaExcel`, que sustituye el importe formateado por el número puro.
 *
 * No toca la tabla si:
 *   · ya tiene una columna con ese título (hay reportes que la traen de serie),
 *   · no hay ningún importe con moneda reconocible, o
 *   · la tabla no es regular (encabezado múltiple, `colspan`, filas de distinto
 *     ancho): insertar una celda ahí descuadraría las columnas.
 *
 * @param {HTMLTableElement} tabla clon de la tabla a serializar
 * @returns {boolean} si se añadió la columna
 */
export function insertarColumnaMoneda(tabla, titulo = 'Moneda') {
  const filasCabecera = tabla.tHead ? [...tabla.tHead.rows] : [];
  if (filasCabecera.length !== 1) return false;
  const cabecera = filasCabecera[0];
  const columnas = cabecera.cells.length;
  if (!columnas) return false;
  if ([...cabecera.cells].some(c => c.colSpan > 1)) return false;
  const yaEsta = [...cabecera.cells].some(c => c.textContent.trim().toLowerCase() === titulo.toLowerCase());
  if (yaEsta) return false;

  const filas = [...tabla.tBodies].flatMap(tb => [...tb.rows]);
  if (!filas.length) return false;
  if (filas.some(f => f.cells.length !== columnas || [...f.cells].some(c => c.colSpan > 1))) return false;

  const monedas = filas.map(fila => {
    for (const celda of fila.cells) {
      const detectado = numeroDeTexto(celda.textContent);
      if (detectado?.moneda) return detectado.moneda;
    }
    return null;
  });
  if (!monedas.some(Boolean)) return false;

  const th = cabecera.cells[columnas - 1].cloneNode(false);
  th.removeAttribute('style');
  th.textContent = titulo;
  cabecera.appendChild(th);

  filas.forEach((fila, i) => {
    const td = fila.cells[fila.cells.length - 1].cloneNode(false);
    td.removeAttribute('style');
    td.removeAttribute(ATTR_NUM);
    td.removeAttribute(ATTR_FMT);
    td.textContent = etiquetaMoneda(monedas[i]);
    fila.appendChild(td);
  });
  return true;
}

/** Atajo: HTML listo para Excel a partir de una tabla del DOM (no la modifica). */
export function tablaHTMLParaExcel(tabla) {
  return prepararTablaExcel(tabla.cloneNode(true)).outerHTML;
}
