import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { formatFecha } from './formatters.js';

const BRAND = {
  teal:       '#4d8093',
  tealDark:   '#283e49',
  tealMid:    '#365867',
  tealLight:  '#94b8c5',
  ember:      '#e8853a',
  emberDark:  '#ad5826',
  emberLight: '#f0b357',
  ivory:      '#fdfaf5',
  ivoryMid:   '#f9f3e8',
  carbon:     '#1a1812',
  carbonMid:  '#564f3f',
  carbonLow:  '#928773',
  paper:      '#ffffff',
  hairline:   '#ece8df'
};

const CHART_PALETTE = [
  BRAND.teal, BRAND.ember, BRAND.tealMid, BRAND.emberDark,
  BRAND.tealLight, BRAND.emberLight, BRAND.carbonMid, BRAND.tealDark
];

const BADGE_COLORS = {
  green:  { bg: '#d1fae5', text: '#065f46' },
  blue:   { bg: '#dbeafe', text: '#1e40af' },
  amber:  { bg: '#fef3c7', text: '#92400e' },
  red:    { bg: '#fee2e2', text: '#9f1239' },
  violet: { bg: '#ede9fe', text: '#5b21b6' },
  gray:   { bg: '#f1f5f9', text: '#334155' }
};

const PAGE = { W: 210, H: 297, MARGIN: 14, HEADER_BOTTOM: 20, FOOTER_TOP: 14 };
const LOGO_URL = '/logo-jy.jpg';

let _logoPromise = null;
function cargarLogo() {
  if (_logoPromise) return _logoPromise;
  _logoPromise = fetch(LOGO_URL)
    .then(r => r.ok ? r.blob() : null)
    .then(blob => blob ? new Promise((resolve, reject) => {
      const fr = new FileReader();
      fr.onload = () => resolve(fr.result);
      fr.onerror = reject;
      fr.readAsDataURL(blob);
    }) : null)
    .catch(() => null);
  return _logoPromise;
}

function hexToRgb(hex) {
  const h = hex.replace('#', '');
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}
const setFill   = (doc, hex) => doc.setFillColor(...hexToRgb(hex));
const setStroke = (doc, hex) => doc.setDrawColor(...hexToRgb(hex));
const setText   = (doc, hex) => doc.setTextColor(...hexToRgb(hex));

function clipText(doc, txt, maxW) {
  const s = String(txt ?? '');
  if (doc.getTextWidth(s) <= maxW) return s;
  let lo = 0, hi = s.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (doc.getTextWidth(s.slice(0, mid) + '…') <= maxW) lo = mid + 1; else hi = mid;
  }
  return s.slice(0, Math.max(0, lo - 1)) + '…';
}

function dibujarSector(doc, cx, cy, r, angStart, angEnd) {
  const steps = Math.max(8, Math.ceil(Math.abs(angEnd - angStart) / (Math.PI / 36)));
  const pts = [];
  let prevX = r * Math.sin(angStart);
  let prevY = -r * Math.cos(angStart);
  pts.push([prevX, prevY]);
  for (let i = 1; i <= steps; i++) {
    const t = angStart + ((angEnd - angStart) * i) / steps;
    const curX = r * Math.sin(t);
    const curY = -r * Math.cos(t);
    pts.push([curX - prevX, curY - prevY]);
    prevX = curX;
    prevY = curY;
  }
  pts.push([-prevX, -prevY]);
  doc.lines(pts, cx, cy, [1, 1], 'F', true);
}

function dibujarPieChart(doc, x, y, ancho, alto, cfg) {
  const titulo = cfg.title;
  const datos = (cfg.data || []).filter(d => d && d.value > 0);
  const total = datos.reduce((s, d) => s + d.value, 0);

  setText(doc, BRAND.tealDark);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.text(titulo, x, y + 4);

  if (total === 0) {
    setText(doc, BRAND.carbonLow);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.text('Sin datos suficientes', x, y + 12);
    return;
  }

  const r = Math.min(22, (alto - 12) / 2);
  const cx = x + r + 2;
  const cy = y + 10 + r;

  let acc = 0;
  datos.forEach((d, i) => {
    const start = (acc / total) * Math.PI * 2;
    acc += d.value;
    const end = (acc / total) * Math.PI * 2;
    setFill(doc, CHART_PALETTE[i % CHART_PALETTE.length]);
    if (datos.length === 1) {
      doc.circle(cx, cy, r, 'F');
    } else {
      dibujarSector(doc, cx, cy, r, start, end);
    }
  });

  setFill(doc, BRAND.paper);
  doc.circle(cx, cy, r * 0.45, 'F');
  setText(doc, BRAND.tealDark);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.text(String(datos.length), cx, cy + 1, { align: 'center' });
  setText(doc, BRAND.carbonLow);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6);
  doc.text('categorías', cx, cy + 5, { align: 'center' });

  const legX = cx + r + 6;
  const legW = (x + ancho) - legX;
  let legY = y + 9;
  doc.setFontSize(7.5);
  datos.slice(0, 6).forEach((d, i) => {
    setFill(doc, CHART_PALETTE[i % CHART_PALETTE.length]);
    doc.roundedRect(legX, legY - 2, 2.5, 2.5, 0.4, 0.4, 'F');
    setText(doc, BRAND.carbon);
    doc.setFont('helvetica', 'normal');
    const pct = Math.round((d.value / total) * 100);
    const valor = cfg.formatValue ? cfg.formatValue(d.value) : String(d.value);
    const meta = `${valor} · ${pct}%`;
    const metaW = doc.getTextWidth(meta);
    const labelMax = Math.max(20, legW - 4 - metaW - 2);
    doc.text(clipText(doc, d.label, labelMax), legX + 4, legY);
    setText(doc, BRAND.carbonMid);
    doc.text(meta, legX + legW - 1, legY, { align: 'right' });
    legY += 4.2;
  });
  if (datos.length > 6) {
    setText(doc, BRAND.carbonLow);
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(7);
    doc.text(`+${datos.length - 6} categorías más`, legX, legY + 1);
  }
}

function dibujarBarChart(doc, x, y, ancho, alto, cfg) {
  const titulo = cfg.title;
  const datos = cfg.data || [];
  const max = Math.max(...datos.map(d => Number(d.value) || 0), 0);

  setText(doc, BRAND.tealDark);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.text(titulo, x, y + 4);

  if (max === 0) {
    setText(doc, BRAND.carbonLow);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.text('Sin datos suficientes', x, y + 12);
    return;
  }

  const items = datos.slice(0, 6);
  const filaH = Math.min(7, (alto - 10) / Math.max(items.length, 1));
  let curY = y + 9;
  doc.setFontSize(7.5);

  items.forEach((d, i) => {
    const valor = cfg.formatValue ? cfg.formatValue(d.value) : String(d.value);
    const metaW = doc.getTextWidth(valor);
    const labelMax = Math.max(20, ancho * 0.55);

    setText(doc, BRAND.carbon);
    doc.setFont('helvetica', 'normal');
    doc.text(clipText(doc, d.label, labelMax), x, curY);

    setText(doc, BRAND.carbonMid);
    doc.text(valor, x + ancho, curY, { align: 'right' });

    const barY = curY + 1.2;
    const barH = 2.6;
    setFill(doc, BRAND.hairline);
    doc.roundedRect(x, barY, ancho, barH, 1, 1, 'F');
    const w = (Number(d.value) || 0) / max * ancho;
    setFill(doc, CHART_PALETTE[i % CHART_PALETTE.length]);
    if (w >= 1) doc.roundedRect(x, barY, w, barH, 1, 1, 'F');

    curY += filaH;
  });
}

function dibujarAnalisis(doc, x, y, ancho, items) {
  setText(doc, BRAND.tealDark);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.text('Hallazgos clave', x, y);

  doc.setFontSize(8.5);
  let curY = y + 5;
  const colAncho = (ancho - 4) / 2;
  const mitad = Math.ceil(items.length / 2);
  const cols = [items.slice(0, mitad), items.slice(mitad)];

  cols.forEach((col, ci) => {
    const cx = x + ci * (colAncho + 4);
    let cy = curY;
    col.forEach(it => {
      setText(doc, BRAND.ember);
      doc.setFont('helvetica', 'bold');
      doc.text('▸', cx, cy);
      setText(doc, BRAND.carbon);
      doc.setFont('helvetica', 'normal');
      const lineas = doc.splitTextToSize(String(it), colAncho - 4);
      doc.text(lineas, cx + 3, cy);
      cy += lineas.length * 3.6 + 1.4;
    });
  });
}

function dibujarBloqueAnalitico(doc, yStart, analitica) {
  const ancho = PAGE.W - PAGE.MARGIN * 2;
  let y = yStart;

  setText(doc, BRAND.emberDark);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.text('RESUMEN ANALÍTICO', PAGE.MARGIN, y);
  setStroke(doc, BRAND.ember);
  doc.setLineWidth(0.4);
  doc.line(PAGE.MARGIN, y + 1.6, PAGE.MARGIN + 30, y + 1.6);

  y += 5;
  const colW = (ancho - 6) / 2;
  const colH = 55;

  if (analitica.pie) {
    dibujarPieChart(doc, PAGE.MARGIN, y, colW, colH, analitica.pie);
  }
  if (analitica.bar) {
    dibujarBarChart(doc, PAGE.MARGIN + colW + 6, y, colW, colH, analitica.bar);
  }
  y += colH + 2;

  if (analitica.analisis && analitica.analisis.length > 0) {
    dibujarAnalisis(doc, PAGE.MARGIN, y, ancho, analitica.analisis);
    const filas = Math.ceil(analitica.analisis.length / 2);
    y += 5 + filas * 5.2;
  }
  return y + 2;
}

function clasificarBadgeDesdeDOM(td) {
  if (!td || td.nodeType !== 1) return null;
  const badge = td.querySelector('[class*="badge-"]');
  if (!badge) return null;
  const cls = [...badge.classList].find(c => c.startsWith('badge-'));
  if (!cls) return null;
  const kind = cls.replace('badge-', '');
  return BADGE_COLORS[kind] ? kind : null;
}

function esCeldaRowVencido(td) {
  return td?.parentElement?.classList?.contains('row-vencido') || false;
}

function esColumnaDerecha(th) {
  return th?.classList?.contains('text-right') || false;
}

function dibujarPortada(doc, ctx) {
  const { titulo, subtitulo, fechaHora, filtros, logo } = ctx;

  setFill(doc, BRAND.ivory);
  doc.rect(0, 0, PAGE.W, PAGE.H, 'F');

  doc.setGState(new doc.GState({ opacity: 0.22 }));
  setFill(doc, BRAND.ember);
  doc.circle(28, 42, 70, 'F');
  setFill(doc, BRAND.teal);
  doc.circle(186, 230, 80, 'F');
  doc.setGState(new doc.GState({ opacity: 0.16 }));
  setFill(doc, BRAND.tealLight);
  doc.circle(190, 50, 38, 'F');
  setFill(doc, BRAND.emberLight);
  doc.circle(30, 250, 50, 'F');
  doc.setGState(new doc.GState({ opacity: 1 }));

  setStroke(doc, BRAND.tealDark);
  doc.setLineWidth(0.4);
  doc.line(PAGE.MARGIN, 18, PAGE.W - PAGE.MARGIN, 18);

  setText(doc, BRAND.tealDark);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.text('ASCENSORES JY S.A.C', PAGE.MARGIN, 14);
  setText(doc, BRAND.emberDark);
  doc.setFont('helvetica', 'normal');
  doc.text('Reporte ejecutivo', PAGE.W - PAGE.MARGIN, 14, { align: 'right' });

  if (logo) {
    const lh = 56;
    const lw = lh;
    setFill(doc, BRAND.paper);
    doc.roundedRect((PAGE.W - lw) / 2 - 4, 78, lw + 8, lh + 8, 4, 4, 'F');
    doc.addImage(logo, 'JPEG', (PAGE.W - lw) / 2, 82, lw, lh, undefined, 'FAST');
  }

  setText(doc, BRAND.emberDark);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.text('REPORTE', PAGE.W / 2, 160, { align: 'center', charSpace: 2 });

  setText(doc, BRAND.tealDark);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(26);
  const titLineas = doc.splitTextToSize(titulo, PAGE.W - 40);
  doc.text(titLineas, PAGE.W / 2, 172, { align: 'center' });

  setStroke(doc, BRAND.ember);
  doc.setLineWidth(1);
  const titH = titLineas.length * 9;
  doc.line(PAGE.W / 2 - 18, 176 + titH, PAGE.W / 2 + 18, 176 + titH);

  setText(doc, BRAND.carbonMid);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(11);
  doc.text(subtitulo || 'Análisis operativo y financiero', PAGE.W / 2, 184 + titH, { align: 'center' });

  const metaY = 215;
  const metaH = filtros.length ? 38 : 20;
  setFill(doc, BRAND.paper);
  setStroke(doc, BRAND.hairline);
  doc.setLineWidth(0.3);
  doc.roundedRect(PAGE.MARGIN + 8, metaY, PAGE.W - PAGE.MARGIN * 2 - 16, metaH, 2.5, 2.5, 'FD');

  setText(doc, BRAND.emberDark);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.text('GENERADO', PAGE.MARGIN + 12, metaY + 7);
  setText(doc, BRAND.carbon);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.text(fechaHora, PAGE.MARGIN + 12, metaY + 13);

  if (filtros.length) {
    setText(doc, BRAND.emberDark);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    doc.text('FILTROS APLICADOS', PAGE.MARGIN + 12, metaY + 22);
    setText(doc, BRAND.carbon);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    const filtTxt = filtros.join('   ·   ');
    const lineas = doc.splitTextToSize(filtTxt, PAGE.W - PAGE.MARGIN * 2 - 28);
    doc.text(lineas.slice(0, 2), PAGE.MARGIN + 12, metaY + 28);
  }

  setStroke(doc, BRAND.hairline);
  doc.setLineWidth(0.2);
  doc.line(PAGE.MARGIN, PAGE.H - 14, PAGE.W - PAGE.MARGIN, PAGE.H - 14);
  setText(doc, BRAND.carbonLow);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.text('Ascensores Jy S.A.C  ·  Sistema ERP', PAGE.MARGIN, PAGE.H - 8);
  doc.text(fechaHora, PAGE.W - PAGE.MARGIN, PAGE.H - 8, { align: 'right' });
}

function dibujarHeaderInterno(doc, ctx, pageNumber) {
  if (pageNumber < 2) return;
  if (ctx.logo) {
    doc.addImage(ctx.logo, 'JPEG', PAGE.MARGIN, 5.5, 14, 7, undefined, 'FAST');
  }
  setText(doc, BRAND.tealDark);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.text(ctx.titulo, PAGE.MARGIN + 18, 10, { align: 'left', baseline: 'middle' });
  setText(doc, BRAND.carbonLow);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.text(ctx.fechaHora, PAGE.W - PAGE.MARGIN, 10, { align: 'right', baseline: 'middle' });
  setStroke(doc, BRAND.ember);
  doc.setLineWidth(0.4);
  doc.line(PAGE.MARGIN, 14, PAGE.W - PAGE.MARGIN, 14);
}

function dibujarFooterPagina(doc, ctx, pageNumber, totalPaginas) {
  setStroke(doc, BRAND.hairline);
  doc.setLineWidth(0.2);
  doc.line(PAGE.MARGIN, PAGE.H - 11, PAGE.W - PAGE.MARGIN, PAGE.H - 11);
  setText(doc, BRAND.carbonLow);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.text(`${ctx.titulo}  ·  Ascensores Jy S.A.C`, PAGE.MARGIN, PAGE.H - 6);
  doc.text(`Página ${pageNumber} de ${totalPaginas}`, PAGE.W - PAGE.MARGIN, PAGE.H - 6, { align: 'right' });
}

function dibujarTabla(doc, ctx, tablaEl, yStart) {
  const ths = [...(tablaEl.querySelectorAll('thead th'))];
  const alineDerecha = ths.map(esColumnaDerecha);

  autoTable(doc, {
    html: tablaEl,
    startY: yStart,
    theme: 'grid',
    margin: { left: PAGE.MARGIN, right: PAGE.MARGIN, top: PAGE.HEADER_BOTTOM, bottom: PAGE.FOOTER_TOP },
    styles: {
      font: 'helvetica',
      fontSize: 8,
      cellPadding: 2.2,
      textColor: hexToRgb(BRAND.carbon),
      lineColor: hexToRgb(BRAND.hairline),
      lineWidth: 0.1,
      overflow: 'linebreak',
      valign: 'middle'
    },
    headStyles: {
      fillColor: hexToRgb(BRAND.tealDark),
      textColor: hexToRgb(BRAND.ivory),
      fontStyle: 'bold',
      fontSize: 8.2,
      halign: 'left',
      cellPadding: 3
    },
    alternateRowStyles: {
      fillColor: hexToRgb(BRAND.ivoryMid)
    },
    didParseCell: (data) => {
      if (data.section === 'body') {
        const td = data.cell.raw;
        if (esCeldaRowVencido(td)) {
          data.cell.styles.fillColor = hexToRgb('#fde7e7');
          data.cell.styles.textColor = hexToRgb('#9f1239');
        }
        const kind = clasificarBadgeDesdeDOM(td);
        if (kind) {
          const c = BADGE_COLORS[kind];
          data.cell.styles.fillColor = hexToRgb(c.bg);
          data.cell.styles.textColor = hexToRgb(c.text);
          data.cell.styles.fontStyle = 'bold';
          data.cell.styles.halign = 'center';
        } else if (alineDerecha[data.column.index]) {
          data.cell.styles.halign = 'right';
          data.cell.styles.font = 'courier';
          data.cell.styles.fontStyle = 'normal';
        }
      } else if (data.section === 'head') {
        if (alineDerecha[data.column.index]) data.cell.styles.halign = 'right';
      }
    },
    didDrawPage: (data) => {
      dibujarHeaderInterno(doc, ctx, data.pageNumber);
    }
  });
}

/**
 * Reporte agrupado por cliente con carátula corporativa.
 *
 * Recibe `grupos: [{ cliente, planes, programaciones }]` y para cada cliente
 * dibuja una sección con: cabecera del cliente, tabla de planes activos y
 * tabla de programaciones (autoTable por sección, con header/footer por
 * página). Reutiliza la portada/header/footer estándar del módulo.
 */
export async function generarReportePorClientePDF(opciones) {
  const {
    titulo,
    subtitulo,
    fechaHora,
    filtros = [],
    grupos = [],
    nombreArchivo
  } = opciones;

  const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'landscape', compress: true });
  const logo = await cargarLogo();
  const ctx = { titulo, subtitulo, fechaHora, filtros, logo };
  const PAGE_LAND = { W: 297, H: 210, MARGIN: 14 };
  const anchoLand = PAGE_LAND.W - PAGE_LAND.MARGIN * 2;

  // Portada (mantiene dimensiones A4 vertical estándar del módulo)
  // Para portada redibujamos en orientación retrato temporal.
  // jspdf no permite cambiar orientación dentro del mismo doc fácilmente,
  // así que la portada se dibuja en landscape pero con mismo layout corporativo.
  dibujarPortadaLandscape(doc, ctx, PAGE_LAND);

  // Header/footer en cada página interna
  function paginaInterna(yInicio = 22) {
    doc.addPage();
    dibujarHeaderInterno(doc, ctx, doc.internal.getNumberOfPages());
    return yInicio;
  }

  if (grupos.length === 0) {
    paginaInterna();
    setText(doc, BRAND.carbonLow);
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(11);
    doc.text('Sin clientes que reportar para los filtros seleccionados.', PAGE_LAND.MARGIN, 30);
  }

  grupos.forEach((grupo, idx) => {
    let y = paginaInterna(22);

    // Cabecera del cliente
    setText(doc, BRAND.tealDark);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(14);
    doc.text(grupo.cliente?.nombre || `Cliente ${idx + 1}`, PAGE_LAND.MARGIN, y);
    y += 5.5;

    const docCli = [grupo.cliente?.tipo_documento, grupo.cliente?.numero_documento].filter(Boolean).join(' ');
    const subPartes = [docCli, grupo.cliente?.nombre_edificio, grupo.cliente?.distrito, grupo.cliente?.telefono].filter(Boolean);
    if (subPartes.length > 0) {
      setText(doc, BRAND.carbonMid);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8.5);
      doc.text(subPartes.join('   ·   '), PAGE_LAND.MARGIN, y);
      y += 4.5;
    }

    setText(doc, BRAND.emberDark);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.text(`${grupo.planes.length} plan(es) activo(s)  ·  ${grupo.programaciones.length} programación(es)`, PAGE_LAND.MARGIN, y);
    y += 4;

    // Tabla de planes
    if (grupo.planes.length > 0) {
      setText(doc, BRAND.emberDark);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8);
      doc.text('PLANES ACTIVOS POR ASCENSOR', PAGE_LAND.MARGIN, y);
      setStroke(doc, BRAND.ember);
      doc.setLineWidth(0.4);
      doc.line(PAGE_LAND.MARGIN, y + 1.6, PAGE_LAND.MARGIN + 60, y + 1.6);
      y += 4;

      autoTable(doc, {
        startY: y,
        margin: { left: PAGE_LAND.MARGIN, right: PAGE_LAND.MARGIN, top: 20, bottom: 14 },
        theme: 'grid',
        head: [['Ascensor', 'Ubicación', 'Tipo servicio', 'Modalidad', 'Frecuencia', 'Cantidad', 'Ejecutados', 'Inicio', 'Precio', 'Estado']],
        body: grupo.planes.map(p => [
          p.ascensor?.codigo || '',
          p.ascensor?.ubicacion || '—',
          p.tipo_servicio?.nombre || '',
          (p.tipo_plan || '').charAt(0).toUpperCase() + (p.tipo_plan || '').slice(1),
          labelFrecuencia(p),
          p.cantidad_mantenimientos != null ? String(p.cantidad_mantenimientos) : 'Indef.',
          String(p.mantenimientos_ejecutados_total || 0),
          fmtFecha(p.fecha_inicio),
          fmtPrecio(p.precio, p.moneda),
          p.estado_plan || ''
        ]),
        styles: estiloTablaBase(),
        headStyles: estiloTablaHead(),
        alternateRowStyles: { fillColor: hexToRgb(BRAND.ivoryMid) },
        didDrawPage: (data) => dibujarHeaderInterno(doc, ctx, data.pageNumber)
      });
      y = doc.lastAutoTable.finalY + 6;
    }

    // Tabla de programaciones
    setText(doc, BRAND.emberDark);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.text('PROGRAMACIONES', PAGE_LAND.MARGIN, y);
    setStroke(doc, BRAND.ember);
    doc.setLineWidth(0.4);
    doc.line(PAGE_LAND.MARGIN, y + 1.6, PAGE_LAND.MARGIN + 60, y + 1.6);
    y += 4;

    if (grupo.programaciones.length === 0) {
      setText(doc, BRAND.carbonLow);
      doc.setFont('helvetica', 'italic');
      doc.setFontSize(9);
      doc.text('Sin programaciones para los filtros seleccionados.', PAGE_LAND.MARGIN, y + 4);
    } else {
      autoTable(doc, {
        startY: y,
        margin: { left: PAGE_LAND.MARGIN, right: PAGE_LAND.MARGIN, top: 20, bottom: 14 },
        theme: 'grid',
        head: [['Fecha', 'Ascensor', 'Ubicación', 'Tipo servicio', 'Origen', 'Estado', 'Inicio real', 'Fin real', 'Días', 'Gratis', 'Servicio']],
        body: grupo.programaciones.map(p => [
          fmtFecha(p.fecha_programada),
          p.ascensor_codigo || '',
          p.ascensor_ubicacion || '—',
          p.tipo_servicio || '',
          origenInstancia(p),
          p.estado_ejecucion || '',
          fmtFechaHora(p.fecha_inicio_real),
          fmtFechaHora(p.fecha_fin_real),
          p.dias_ejecucion ?? '',
          p.es_mantenimiento_gratuito ? 'Sí' : '',
          p.codigo_servicio || ''
        ]),
        styles: estiloTablaBase(),
        headStyles: estiloTablaHead(),
        alternateRowStyles: { fillColor: hexToRgb(BRAND.ivoryMid) },
        didParseCell: (data) => {
          if (data.section === 'body') {
            const estado = data.column.index === 5 ? String(data.cell.raw || '').toLowerCase() : '';
            if (estado === 'realizado') { data.cell.styles.fillColor = hexToRgb('#d1fae5'); data.cell.styles.textColor = hexToRgb('#065f46'); data.cell.styles.fontStyle = 'bold'; }
            else if (estado === 'en curso') { data.cell.styles.fillColor = hexToRgb('#dbeafe'); data.cell.styles.textColor = hexToRgb('#1e40af'); data.cell.styles.fontStyle = 'bold'; }
            else if (estado === 'pendiente') { data.cell.styles.fillColor = hexToRgb('#fef3c7'); data.cell.styles.textColor = hexToRgb('#92400e'); data.cell.styles.fontStyle = 'bold'; }
            else if (estado === 'cancelado') { data.cell.styles.fillColor = hexToRgb('#fee2e2'); data.cell.styles.textColor = hexToRgb('#9f1239'); data.cell.styles.fontStyle = 'bold'; }
            else if (estado === 'proyectado') { data.cell.styles.fillColor = hexToRgb('#ede9fe'); data.cell.styles.textColor = hexToRgb('#5b21b6'); data.cell.styles.fontStyle = 'bold'; }
          }
        },
        didDrawPage: (data) => dibujarHeaderInterno(doc, ctx, data.pageNumber)
      });
    }
  });

  // Footers
  const total = doc.internal.getNumberOfPages();
  for (let p = 2; p <= total; p++) {
    doc.setPage(p);
    dibujarFooterPaginaLandscape(doc, ctx, p, total, PAGE_LAND);
  }

  doc.save(nombreArchivo);
}

// Helpers locales del nuevo reporte
function labelFrecuencia(plan) {
  if (!plan) return '';
  if (plan.tipo_plan === 'eventual') return 'Eventual';
  const codigos = {
    diaria: 'Diaria', semanal: 'Semanal', quincenal: 'Quincenal',
    mensual: 'Mensual', bimestral: 'Bimestral', trimestral: 'Trimestral',
    semestral: 'Semestral', anual: 'Anual', custom: 'Personalizada'
  };
  let etiqueta = codigos[plan.frecuencia] || plan.frecuencia || '';
  if (plan.frecuencia === 'custom' && plan.frecuencia_dias_custom) {
    etiqueta += ` (${plan.frecuencia_dias_custom} días)`;
  }
  return etiqueta;
}
function fmtFecha(d) { return d ? formatFecha(d) : ''; }
function fmtFechaHora(d) {
  if (!d) return '';
  const dt = new Date(d);
  return `${formatFecha(dt)} ${String(dt.getHours()).padStart(2, '0')}:${String(dt.getMinutes()).padStart(2, '0')}`;
}
function fmtPrecio(monto, moneda) {
  if (monto == null) return '';
  const simbolo = moneda === 'USD' ? '$' : 'S/';
  return `${simbolo} ${Number(monto).toFixed(2)}`;
}
function origenInstancia(p) {
  if (p.tipo_instancia === 'servicio') return 'Servicio';
  if (p.tipo_instancia === 'evento_futuro') return 'Evento';
  if (p.tipo_instancia === 'proyeccion') return 'Proyectado';
  return '—';
}
function estiloTablaBase() {
  return {
    font: 'helvetica',
    fontSize: 7.5,
    cellPadding: 1.8,
    textColor: hexToRgb(BRAND.carbon),
    lineColor: hexToRgb(BRAND.hairline),
    lineWidth: 0.1,
    overflow: 'linebreak',
    valign: 'middle'
  };
}
function estiloTablaHead() {
  return {
    fillColor: hexToRgb(BRAND.tealDark),
    textColor: hexToRgb(BRAND.ivory),
    fontStyle: 'bold',
    fontSize: 7.8,
    halign: 'left',
    cellPadding: 2.4
  };
}

// Portada landscape (mismo diseño corporativo adaptado a 297×210mm)
function dibujarPortadaLandscape(doc, ctx, PG) {
  const { titulo, subtitulo, fechaHora, filtros, logo } = ctx;

  setFill(doc, BRAND.ivory);
  doc.rect(0, 0, PG.W, PG.H, 'F');

  doc.setGState(new doc.GState({ opacity: 0.22 }));
  setFill(doc, BRAND.ember);
  doc.circle(40, 35, 70, 'F');
  setFill(doc, BRAND.teal);
  doc.circle(260, 175, 70, 'F');
  doc.setGState(new doc.GState({ opacity: 0.16 }));
  setFill(doc, BRAND.tealLight);
  doc.circle(265, 40, 32, 'F');
  setFill(doc, BRAND.emberLight);
  doc.circle(45, 180, 42, 'F');
  doc.setGState(new doc.GState({ opacity: 1 }));

  setStroke(doc, BRAND.tealDark);
  doc.setLineWidth(0.4);
  doc.line(PG.MARGIN, 18, PG.W - PG.MARGIN, 18);

  setText(doc, BRAND.tealDark);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.text('ASCENSORES JY S.A.C', PG.MARGIN, 14);
  setText(doc, BRAND.emberDark);
  doc.setFont('helvetica', 'normal');
  doc.text('Reporte por cliente', PG.W - PG.MARGIN, 14, { align: 'right' });

  if (logo) {
    const lh = 44;
    const lw = lh;
    setFill(doc, BRAND.paper);
    doc.roundedRect((PG.W - lw) / 2 - 4, 38, lw + 8, lh + 8, 4, 4, 'F');
    doc.addImage(logo, 'JPEG', (PG.W - lw) / 2, 42, lw, lh, undefined, 'FAST');
  }

  setText(doc, BRAND.emberDark);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.text('REPORTE', PG.W / 2, 100, { align: 'center', charSpace: 2 });

  setText(doc, BRAND.tealDark);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(22);
  const titLineas = doc.splitTextToSize(titulo, PG.W - 60);
  doc.text(titLineas, PG.W / 2, 112, { align: 'center' });

  setStroke(doc, BRAND.ember);
  doc.setLineWidth(1);
  const titH = titLineas.length * 8;
  doc.line(PG.W / 2 - 18, 116 + titH, PG.W / 2 + 18, 116 + titH);

  setText(doc, BRAND.carbonMid);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(11);
  doc.text(subtitulo || 'Programaciones agrupadas por cliente', PG.W / 2, 124 + titH, { align: 'center' });

  const metaY = 150;
  const metaH = filtros.length ? 38 : 20;
  setFill(doc, BRAND.paper);
  setStroke(doc, BRAND.hairline);
  doc.setLineWidth(0.3);
  doc.roundedRect(PG.MARGIN + 30, metaY, PG.W - PG.MARGIN * 2 - 60, metaH, 2.5, 2.5, 'FD');

  setText(doc, BRAND.emberDark);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.text('GENERADO', PG.MARGIN + 34, metaY + 7);
  setText(doc, BRAND.carbon);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.text(fechaHora, PG.MARGIN + 34, metaY + 13);

  if (filtros.length) {
    setText(doc, BRAND.emberDark);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    doc.text('FILTROS APLICADOS', PG.MARGIN + 34, metaY + 22);
    setText(doc, BRAND.carbon);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    const filtTxt = filtros.join('   ·   ');
    const lineas = doc.splitTextToSize(filtTxt, PG.W - PG.MARGIN * 2 - 76);
    doc.text(lineas.slice(0, 2), PG.MARGIN + 34, metaY + 28);
  }

  setStroke(doc, BRAND.hairline);
  doc.setLineWidth(0.2);
  doc.line(PG.MARGIN, PG.H - 14, PG.W - PG.MARGIN, PG.H - 14);
  setText(doc, BRAND.carbonLow);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.text('Ascensores Jy S.A.C  ·  Sistema ERP', PG.MARGIN, PG.H - 8);
  doc.text(fechaHora, PG.W - PG.MARGIN, PG.H - 8, { align: 'right' });
}

function dibujarFooterPaginaLandscape(doc, ctx, pageNumber, totalPaginas, PG) {
  setStroke(doc, BRAND.hairline);
  doc.setLineWidth(0.2);
  doc.line(PG.MARGIN, PG.H - 11, PG.W - PG.MARGIN, PG.H - 11);
  setText(doc, BRAND.carbonLow);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.text(`${ctx.titulo}  ·  Ascensores Jy S.A.C`, PG.MARGIN, PG.H - 6);
  doc.text(`Página ${pageNumber} de ${totalPaginas}`, PG.W - PG.MARGIN, PG.H - 6, { align: 'right' });
}

export async function generarReportePDF(opciones) {
  const {
    titulo,
    subtitulo,
    fechaHora,
    filtros = [],
    analitica = null,
    tablaEl,
    nombreArchivo
  } = opciones;

  const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait', compress: true });
  const logo = await cargarLogo();
  const ctx = { titulo, subtitulo, fechaHora, filtros, logo };

  dibujarPortada(doc, ctx);

  doc.addPage();
  dibujarHeaderInterno(doc, ctx, 2);
  let cursorY = 22;

  if (analitica && (analitica.pie || analitica.bar || (analitica.analisis && analitica.analisis.length))) {
    cursorY = dibujarBloqueAnalitico(doc, cursorY, analitica);
  }

  if (tablaEl) {
    dibujarTabla(doc, ctx, tablaEl, cursorY + 2);
  }

  const total = doc.internal.getNumberOfPages();
  for (let p = 2; p <= total; p++) {
    doc.setPage(p);
    dibujarFooterPagina(doc, ctx, p, total);
  }

  doc.save(nombreArchivo);
}

function clasificarBadgePorEstado(estado) {
  const e = String(estado || '').toLowerCase();
  if (e.includes('finaliz') || e.includes('pagad') || e.includes('cerrad')) return 'green';
  if (e.includes('curso') || e.includes('camino') || e.includes('asignad') || e.includes('emisión') || e.includes('emitid')) return 'blue';
  if (e.includes('pendien') || e.includes('checklist')) return 'amber';
  if (e.includes('mora') || e.includes('vencid') || e.includes('cancel') || e.includes('fuera')) return 'red';
  if (e.includes('observ')) return 'violet';
  return 'gray';
}

function dibujarSeccionTitulo(doc, y, titulo) {
  setText(doc, BRAND.emberDark);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.text(titulo, PAGE.MARGIN, y);
  setStroke(doc, BRAND.ember);
  doc.setLineWidth(0.4);
  doc.line(PAGE.MARGIN, y + 1.6, PAGE.MARGIN + 30, y + 1.6);
  return y + 6;
}

function dibujarTarjetaIdentificacion(doc, yStart, ascensor) {
  const ancho = PAGE.W - PAGE.MARGIN * 2;
  const alto = 32;
  const x = PAGE.MARGIN;

  setFill(doc, BRAND.paper);
  setStroke(doc, BRAND.hairline);
  doc.setLineWidth(0.3);
  doc.roundedRect(x, yStart, ancho, alto, 2.5, 2.5, 'FD');

  setFill(doc, BRAND.tealDark);
  doc.rect(x, yStart, 2.8, alto, 'F');

  const colIzqW = ancho * 0.58;

  setText(doc, BRAND.carbonLow);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7);
  doc.text('CÓDIGO', x + 8, yStart + 7);

  setText(doc, BRAND.tealDark);
  doc.setFont('courier', 'bold');
  doc.setFontSize(20);
  doc.text(clipText(doc, String(ascensor.codigo || '—'), colIzqW - 8), x + 8, yStart + 17);

  setText(doc, BRAND.carbonLow);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7);
  doc.text('CLIENTE', x + 8, yStart + 23);

  setText(doc, BRAND.carbon);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.text(clipText(doc, ascensor.cliente?.nombre || '—', colIzqW - 8), x + 8, yStart + 28);

  const estado = ascensor.estado_operativo || '—';
  const kind = clasificarBadgePorEstado(estado);
  const c = BADGE_COLORS[kind] || BADGE_COLORS.gray;

  setText(doc, BRAND.carbonLow);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7);
  doc.text('ESTADO OPERATIVO', x + ancho - 8, yStart + 7, { align: 'right' });

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  const txtW = doc.getTextWidth(estado);
  const badgeW = Math.max(txtW + 10, 36);
  const badgeH = 9;
  const badgeX = x + ancho - badgeW - 8;
  const badgeY = yStart + 11;
  setFill(doc, c.bg);
  doc.roundedRect(badgeX, badgeY, badgeW, badgeH, 2, 2, 'F');
  setText(doc, c.text);
  doc.text(estado, badgeX + badgeW / 2, badgeY + badgeH / 2 + 0.8, { align: 'center', baseline: 'middle' });

  return yStart + alto + 5;
}

function dibujarCampo(doc, x, y, w, label, value) {
  setText(doc, BRAND.carbonLow);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7);
  doc.text(String(label).toUpperCase(), x, y);

  setText(doc, BRAND.carbon);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  const txt = (value === null || value === undefined || value === '') ? '—' : String(value);
  doc.text(clipText(doc, txt, w), x, y + 5);

  setStroke(doc, BRAND.hairline);
  doc.setLineWidth(0.2);
  doc.line(x, y + 9, x + w, y + 9);
}

function dibujarGrillaCampos(doc, yStart, campos) {
  const ancho = PAGE.W - PAGE.MARGIN * 2;
  const gap = 6;
  const filaAlto = 13;
  const colW = (ancho - gap) / 2;
  let y = yStart;
  let xCol = 0;

  for (const campo of campos) {
    const span = campo.span || 1;
    if (span === 2) {
      if (xCol === 1) { y += filaAlto; xCol = 0; }
      dibujarCampo(doc, PAGE.MARGIN, y, ancho, campo.label, campo.value);
      y += filaAlto;
    } else {
      const x = PAGE.MARGIN + xCol * (colW + gap);
      dibujarCampo(doc, x, y, colW, campo.label, campo.value);
      xCol += 1;
      if (xCol >= 2) { xCol = 0; y += filaAlto; }
    }
  }
  if (xCol > 0) y += filaAlto;
  return y + 2;
}

function dibujarTarjetaObservaciones(doc, yStart, observaciones) {
  const ancho = PAGE.W - PAGE.MARGIN * 2;
  const x = PAGE.MARGIN;
  const txt = String(observaciones || '').trim() || 'Sin observaciones registradas.';

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  const lineas = doc.splitTextToSize(txt, ancho - 8);
  const alto = Math.max(20, lineas.length * 4.6 + 8);

  setFill(doc, BRAND.ivoryMid);
  setStroke(doc, BRAND.hairline);
  doc.setLineWidth(0.3);
  doc.roundedRect(x, yStart, ancho, alto, 2.5, 2.5, 'FD');

  setText(doc, BRAND.carbon);
  doc.text(lineas, x + 4, yStart + 6);

  return yStart + alto + 4;
}

export async function generarFichaAscensorPDF(opciones) {
  const { ascensor, fechaHora, nombreArchivo } = opciones;

  const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait', compress: true });
  const logo = await cargarLogo();
  const titulo = `Ficha técnica · ${ascensor.codigo || ''}`.trim();
  const subtitulo = [ascensor.tipo, ascensor.marca, ascensor.modelo].filter(Boolean).join(' · ')
    || ascensor.cliente?.nombre
    || 'Ascensor';
  const ctx = { titulo, subtitulo, fechaHora, filtros: [], logo };

  dibujarPortada(doc, ctx);

  doc.addPage();
  dibujarHeaderInterno(doc, ctx, 2);
  let y = 22;

  y = dibujarSeccionTitulo(doc, y, 'IDENTIFICACIÓN');
  y = dibujarTarjetaIdentificacion(doc, y, ascensor);

  y = dibujarSeccionTitulo(doc, y, 'DATOS TÉCNICOS');
  y = dibujarGrillaCampos(doc, y, [
    { label: 'Tipo', value: ascensor.tipo },
    { label: 'Marca', value: ascensor.marca },
    { label: 'Modelo', value: ascensor.modelo },
    { label: 'Capacidad', value: ascensor.capacidad },
    { label: 'Pisos', value: ascensor.pisos },
    { label: 'Año aproximado', value: ascensor.anio_aproximado },
    { label: 'Ubicación', value: ascensor.ubicacion, span: 2 },
    { label: 'Próximo mantenimiento', value: formatFecha(ascensor.proximo_mantenimiento), span: 2 }
  ]);

  y = dibujarSeccionTitulo(doc, y, 'OBSERVACIONES');
  dibujarTarjetaObservaciones(doc, y, ascensor.observaciones);

  const total = doc.internal.getNumberOfPages();
  for (let p = 2; p <= total; p++) {
    doc.setPage(p);
    dibujarFooterPagina(doc, ctx, p, total);
  }

  doc.save(nombreArchivo);
}
