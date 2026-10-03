/**
 * Área del cliente: Servicios o Proyectos, nunca las dos.
 *
 * Espejo de backend/utils/catalogosClientes.js (AREAS_CLIENTE, ETIQUETA_AREA,
 * `areasPorContrato` y `areasDelCliente`) — mantener en sincronía. La clave de
 * cada área es la misma que el ámbito del usuario (acceso_servicios /
 * acceso_proyectos) y que el `tipo_registro` del servicio/proyecto: el usuario
 * de un área solo ve a los clientes de esa área.
 */

export const AREAS_CLIENTE = ['servicio', 'proyecto'];

export const ETIQUETA_AREA = { servicio: 'Servicios', proyecto: 'Proyectos' };

/** La otra área: un cliente es de una sola. */
export const otraArea = (area) => (area === 'proyecto' ? 'servicio' : 'proyecto');

/**
 * Áreas en las que el cliente tiene contrato registrado (inicio y fin). Lo
 * normal es una o ninguna (el contrato es opcional); dos solo en clientes
 * antiguos, de cuando existía la opción «Ambas».
 */
export function areasPorContrato(cliente) {
  if (!cliente) return [];
  return AREAS_CLIENTE.filter(a => cliente[`contrato_${a}_inicio`] && cliente[`contrato_${a}_fin`]);
}

/**
 * Áreas a las que pertenece el cliente: la elegida al registrarlo
 * (`cliente.area`) más la de su contrato. Coinciden salvo en los clientes
 * antiguos con contrato en las dos áreas, que aún no tienen área elegida.
 */
export function areasDelCliente(cliente) {
  if (!cliente) return [];
  const porContrato = areasPorContrato(cliente);
  return AREAS_CLIENTE.filter(a => a === cliente.area || porContrato.includes(a));
}
