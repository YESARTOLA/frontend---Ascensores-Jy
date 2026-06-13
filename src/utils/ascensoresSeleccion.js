/**
 * Lógica compartida de selección de ascensores con reparto de precio, usada por
 * "Nuevo servicio/proyecto" y "Nuevo plan de mantenimiento". El estado vive en el
 * formulario del padre como un mapa:
 *
 *   ascensores_seleccion = { [id_ascensor]: { monto: '0.00', manual: false } }
 *
 * Todas las funciones son puras: reciben el mapa y devuelven uno nuevo, sin
 * mutar. SSoT del reparto: no debe duplicarse en cada página.
 */

/**
 * Reparte `total` entre `n` ascensores en partes iguales al centavo; el último
 * absorbe el sobrante para que la suma cuadre. Devuelve strings con 2 decimales.
 */
export function repartirParejo(total, n) {
  if (n === 0) return [];
  const totalCentavos = Math.round(Number(total || 0) * 100);
  const base = Math.floor(totalCentavos / n);
  const sobra = totalCentavos - base * n;
  return Array.from({ length: n }, (_, i) => ((base + (i === n - 1 ? sobra : 0)) / 100).toFixed(2));
}

/** Suma (number) de los montos del mapa de selección. */
export function sumaMontos(seleccion) {
  return Object.values(seleccion || {}).reduce((acc, s) => acc + Number(s?.monto || 0), 0);
}

/**
 * Marca/desmarca un ascensor. Al cambiar la cantidad, si ningún monto fue
 * editado manualmente, reparte parejo el `precioTotal` entre los seleccionados.
 */
export function toggleAscensor(seleccion, idAsc, precioTotal) {
  const sel = { ...seleccion };
  if (sel[idAsc]) delete sel[idAsc];
  else sel[idAsc] = { monto: '0.00', manual: false };
  const ids = Object.keys(sel);
  const algunoManual = ids.some(k => sel[k].manual);
  if (!algunoManual && Number(precioTotal || 0) > 0) {
    const montos = repartirParejo(precioTotal, ids.length);
    ids.forEach((k, i) => { sel[k] = { ...sel[k], monto: montos[i] }; });
  }
  return sel;
}

/** Edita manualmente el monto de un ascensor (marca `manual`). */
export function cambiarMonto(seleccion, idAsc, valor) {
  return { ...seleccion, [idAsc]: { monto: valor, manual: true } };
}

/**
 * Aplica el reparto parejo del `precioTotal` cuando ningún monto es manual.
 * Devuelve el mapa sin cambios si hay montos manuales o no hay seleccionados.
 */
export function repartirSegunTotal(seleccion, precioTotal) {
  const sel = { ...seleccion };
  const ids = Object.keys(sel);
  const algunoManual = ids.some(k => sel[k].manual);
  if (ids.length === 0 || algunoManual) return sel;
  const montos = repartirParejo(precioTotal, ids.length);
  ids.forEach((k, i) => { sel[k] = { ...sel[k], monto: montos[i] }; });
  return sel;
}

/** Reparte parejo a la fuerza (botón "Repartir parejo"), reseteando `manual`. */
export function repartirForzado(seleccion, precioTotal) {
  const sel = { ...seleccion };
  const ids = Object.keys(sel);
  if (ids.length === 0) return sel;
  const montos = repartirParejo(precioTotal, ids.length);
  ids.forEach((k, i) => { sel[k] = { monto: montos[i], manual: false }; });
  return sel;
}
