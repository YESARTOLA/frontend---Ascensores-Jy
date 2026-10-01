import { useEffect, useState } from 'react';
import { clientesService } from '../services';

/**
 * Catálogo de clasificaciones de cliente (tbl_clasificaciones_cliente, ver
 * backend/utils/clasificacionesCliente.js). Lo comparten el cliente y el
 * ascensor: ambos clasifican con los mismos códigos, así que hay un único
 * catálogo y un único endpoint (/clientes/clasificaciones).
 *
 * Trae activas E inactivas (`activo`): los badges de quien ya está clasificado
 * deben verse aunque la clasificación se desactive; los selectores ofrecen solo
 * las activas.
 *
 * La promesa se memoiza a nivel de módulo: N componentes montados a la vez
 * hacen UNA sola petición. Como el catálogo se gestiona desde la app,
 * `recargarClasificaciones()` lo vuelve a pedir y avisa a todos los componentes
 * montados, para que el cambio se vea al instante en formularios y tablas.
 */
let promesaCatalogo = null;
const suscriptores = new Set();

function cargarClasificaciones() {
  if (!promesaCatalogo) {
    promesaCatalogo = clientesService.clasificaciones()
      .then(c => c || [])
      // Un fallo de red no debe dejar el catálogo cacheado en vacío para siempre:
      // se limpia para que el próximo montaje reintente.
      .catch(() => { promesaCatalogo = null; return []; });
  }
  return promesaCatalogo;
}

/** Invalida el catálogo y actualiza a todos los componentes que lo usan. */
export async function recargarClasificaciones() {
  promesaCatalogo = null;
  const catalogo = await cargarClasificaciones();
  suscriptores.forEach(fn => fn(catalogo));
  return catalogo;
}

/**
 * @returns {{id:number, codigo:string, etiqueta:string, area:string,
 *            color:string, color_clave:string, activo:boolean}[]}
 *          catálogo completo (arreglo vacío mientras carga).
 */
export function useClasificaciones() {
  const [clasificaciones, setClasificaciones] = useState([]);
  useEffect(() => {
    let vivo = true;
    const actualizar = (c) => { if (vivo) setClasificaciones(c); };
    suscriptores.add(actualizar);
    cargarClasificaciones().then(actualizar);
    return () => { vivo = false; suscriptores.delete(actualizar); };
  }, []);
  return clasificaciones;
}
