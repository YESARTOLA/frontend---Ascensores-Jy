// Condición de IGV de una versión de cotización y cálculo de sus totales.
// Espejo de backend/utils/cotizacionCalculos.js (calcularTotalesVersion) —
// mantener ambos en sincronía: el backend recalcula al guardar, y el total que
// se muestra aquí es el que valida el plan de cuotas antes de enviarlo.
//
// En la BD son dos banderas de la versión (`sin_igv`, `igv_incluido`); en la UI
// es un solo selector con tres modos.

// Los precios registrados NO incluyen IGV: el IGV se suma (250 → 250 + 45 = 295).
export const MODO_IGV_MAS = 'mas_igv';
// Los precios registrados YA son finales: el IGV se desglosa sin aumentarlos
// (118 → 100 + 18 = 118).
export const MODO_IGV_INCLUIDO = 'igv_incluido';
// Sin IGV: el total es la suma de los importes.
export const MODO_IGV_SIN = 'sin_igv';

export const MODOS_IGV = [
  { valor: MODO_IGV_MAS, etiqueta: 'Más IGV', ayuda: 'El IGV se suma al precio registrado' },
  { valor: MODO_IGV_INCLUIDO, etiqueta: 'IGV incluido', ayuda: 'El precio registrado es el total final: el IGV se calcula dentro de él' },
  { valor: MODO_IGV_SIN, etiqueta: 'Sin IGV', ayuda: 'No se cobra IGV' }
];

export function modoIgvDeVersion(version) {
  if (version?.sin_igv) return MODO_IGV_SIN;
  if (version?.igv_incluido) return MODO_IGV_INCLUIDO;
  return MODO_IGV_MAS;
}

// Campos del payload de crear / editar versión.
export function camposModoIgv(modo) {
  return { sin_igv: modo === MODO_IGV_SIN, igv_incluido: modo === MODO_IGV_INCLUIDO };
}

function round2(n) {
  return Math.round((Number(n) + Number.EPSILON) * 100) / 100;
}

/**
 * @param {number[]} importes importe de cada ítem (ya con descuento)
 * @param {number}   igvTasa  p.ej. 0.18
 * @param {string}   modo     MODO_IGV_*
 * @returns {{ subtotal: number, igv: number, total: number }}
 */
export function calcularTotalesCotizacion(importes, igvTasa, modo) {
  const suma = round2(importes.reduce((acc, n) => acc + (Number(n) || 0), 0));
  const tasa = modo === MODO_IGV_SIN ? 0 : (Number(igvTasa) || 0);
  if (modo === MODO_IGV_INCLUIDO && tasa > 0) {
    const subtotal = round2(suma / (1 + tasa));
    return { subtotal, igv: round2(suma - subtotal), total: suma };
  }
  const igv = round2(suma * tasa);
  return { subtotal: suma, igv, total: round2(suma + igv) };
}
