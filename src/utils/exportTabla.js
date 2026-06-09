/**
 * Motor de exportación genérico (Excel + PDF) a partir de un arreglo de datos
 * y una definición declarativa de columnas. Reutiliza el generador de PDF de
 * marca (`generarReportePDF`) y la misma plantilla `.xls` que el módulo de
 * Reportes, para que todos los módulos exporten con un look idéntico.
 *
 * Pensado para listas con paginación server-side: el módulo trae el set
 * completo filtrado (sin `page`) y se lo pasa a estas funciones; no depende del
 * DOM renderizado (que solo contiene la página visible).
 *
 * Definición de columna:
 *   { header: string, get: (row, index) => any, align?: 'right', badge?: boolean }
 *     - get:   extrae/formatea el valor de la fila (ya formateado: montos, fechas…).
 *              `index` es la posición 0-based dentro del set exportado (para "#").
 *     - align: 'right' alinea a la derecha (montos).
 *     - badge: renderiza el valor como insignia de estado (color por `badgeEstado`).
 */
import { generarReportePDF } from './pdfReport.js';
import { badgeEstado } from './formatters.js';

const TZ_LIMA = 'America/Lima';
const EXCEL_MIME = 'application/vnd.ms-excel;charset=utf-8';
const BOM_UTF8 = new Uint8Array([0xef, 0xbb, 0xbf]);
// Estilo inline de insignia para que Excel (que ignora clases Tailwind) la muestre.
const BADGE_INLINE_STYLE = 'padding:1px 6px;border-radius:4px;font-size:10px;border:1px solid #cbd5e1';
const PLACEHOLDER_VACIO = '—';

const fechaHoraLima = () => new Date().toLocaleString('es-PE', { timeZone: TZ_LIMA });

function textoCelda(valor) {
  return valor === null || valor === undefined || valor === '' ? PLACEHOLDER_VACIO : String(valor);
}

/**
 * Construye una <table class="table-base"> desprendida del DOM a partir de las
 * columnas y filas. Las clases (`text-right`, `badge-*`) son las que leen tanto
 * el serializador Excel como el dibujo de tabla del PDF.
 */
export function construirTablaExport(columnas, filas) {
  const table = document.createElement('table');
  table.className = 'table-base';

  const thead = document.createElement('thead');
  const trHead = document.createElement('tr');
  for (const col of columnas) {
    const th = document.createElement('th');
    th.className = 'table-th' + (col.align === 'right' ? ' text-right' : '');
    th.textContent = col.header;
    trHead.appendChild(th);
  }
  thead.appendChild(trHead);
  table.appendChild(thead);

  const tbody = document.createElement('tbody');
  filas.forEach((row, index) => {
    const tr = document.createElement('tr');
    for (const col of columnas) {
      const td = document.createElement('td');
      td.className = 'table-td' + (col.align === 'right' ? ' text-right' : '');
      const texto = textoCelda(col.get(row, index));
      if (col.badge) {
        const span = document.createElement('span');
        span.className = badgeEstado(texto);
        span.setAttribute('style', BADGE_INLINE_STYLE);
        span.textContent = texto;
        td.appendChild(span);
      } else {
        if (col.align === 'right') td.setAttribute('style', 'text-align:right');
        td.textContent = texto;
      }
      tr.appendChild(td);
    }
    tbody.appendChild(tr);
  });
  table.appendChild(tbody);
  return table;
}

// Misma plantilla `.xls` (HTML) que usa el módulo de Reportes.
function plantillaExcel(titulo, tablaHTML, filtros) {
  return `
<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40">
<head>
<meta charset="UTF-8">
<style>
  table{border-collapse:collapse;font-family:Arial,sans-serif;font-size:11px}
  th{background:#1e293b;color:#fff;padding:6px 8px;text-align:left;border:1px solid #475569}
  td{padding:5px 8px;border:1px solid #cbd5e1}
  .titulo{font-size:16px;font-weight:bold;color:#0f172a}
  .meta{font-size:11px;color:#475569}
</style>
</head>
<body>
<div class="titulo">${titulo}</div>
<div class="meta">Generado: ${fechaHoraLima()}</div>
${filtros.length ? `<div class="meta">Filtros: ${filtros.join(' · ')}</div>` : ''}
<br/>
${tablaHTML}
</body>
</html>`.trim();
}

function descargarBlob(blob, archivo) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = archivo;
  a.click();
  URL.revokeObjectURL(url);
}

/**
 * Exporta a Excel (.xls) la tabla construida a partir de columnas + filas.
 * @param {{titulo:string, columnas:Array, filas:Array, filtros?:string[], archivo:string}} opts
 */
export function exportarExcelTabla({ titulo, columnas, filas, filtros = [], archivo }) {
  const tabla = construirTablaExport(columnas, filas);
  const html = plantillaExcel(titulo, tabla.outerHTML, filtros);
  descargarBlob(new Blob([BOM_UTF8, html], { type: EXCEL_MIME }), archivo);
}

/**
 * Exporta a PDF de marca la tabla construida a partir de columnas + filas.
 * La tabla se monta fuera de pantalla mientras jsPDF/autoTable la procesan.
 * @param {{titulo:string, subtitulo?:string, columnas:Array, filas:Array, filtros?:string[], archivo:string}} opts
 */
export async function exportarPDFTabla({ titulo, subtitulo, columnas, filas, filtros = [], archivo }) {
  const tabla = construirTablaExport(columnas, filas);
  tabla.setAttribute('style', 'position:fixed;left:-99999px;top:0');
  document.body.appendChild(tabla);
  try {
    await generarReportePDF({
      titulo,
      subtitulo,
      fechaHora: fechaHoraLima(),
      filtros,
      tablaEl: tabla,
      nombreArchivo: archivo
    });
  } finally {
    tabla.remove();
  }
}
