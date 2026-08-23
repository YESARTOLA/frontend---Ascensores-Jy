/**
 * Lógica compartida de selección de ascensores, usada por "Nuevo servicio/proyecto"
 * y "Nuevo plan de mantenimiento". El estado vive en el formulario del padre como
 * un mapa:
 *
 *   ascensores_seleccion = { [id_ascensor]: { monto } }
 *
 * El precio ya no se reparte: cada ascensor aporta su precio configurado para el
 * subtipo (tbl_ascensores_precios). El total es la suma de los seleccionados.
 */

/** Suma (number) de los montos del mapa de selección. */
export function sumaMontos(seleccion) {
  return Object.values(seleccion || {}).reduce((acc, s) => acc + Number(s?.monto || 0), 0);
}

/**
 * Estado(s) operativo(s) de ascensor que NO admiten servicios. Un ascensor con
 * la instalación cancelada no está físicamente instalado, así que no es elegible
 * para correctivos, emergencias, mantenimientos ni ningún otro servicio.
 */
export const ESTADOS_ASCENSOR_NO_SERVICIABLE = ['Instalación cancelada'];

/** True si el ascensor puede recibir servicios. */
export function esAscensorServiciable(a) {
  return !ESTADOS_ASCENSOR_NO_SERVICIABLE.includes(a?.estado_operativo);
}

/**
 * Precio configurado de un ascensor para un subtipo de servicio, leído de su
 * catálogo (`ascensor.precios`). Devuelve `{ precio, moneda }` o null si el
 * ascensor no tiene precio para ese subtipo. SSoT del modelo de precios por
 * ascensor.
 *
 * A los roles sin visibilidad financiera el backend les envía la fila SIN el
 * importe: entonces `precio` viene en null y solo se sabe que hay un precio
 * configurado y en qué moneda. Eso basta para elegir el ascensor; el monto real
 * lo resuelve el backend al guardar.
 */
export function precioConfigurado(ascensor, idTipoServicio) {
  if (!idTipoServicio) return null;
  const p = (ascensor?.precios || []).find(x => Number(x.id_tipo_servicio) === Number(idTipoServicio));
  if (!p) return null;
  return { precio: p.precio == null ? null : Number(p.precio), moneda: p.moneda || 'PEN' };
}
