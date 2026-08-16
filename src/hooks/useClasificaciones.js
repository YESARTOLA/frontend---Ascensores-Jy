import { useEffect, useState } from 'react';
import { clientesService } from '../services';

/**
 * Catálogo de clasificaciones del backend (utils/catalogosClientes). Lo comparten
 * el cliente y el ascensor: ambos clasifican con los mismos códigos, así que hay
 * un único catálogo y un único endpoint (/clientes/clasificaciones).
 *
 * El catálogo es estable durante la sesión, así que la promesa se memoiza a
 * nivel de módulo: N formularios montados a la vez hacen UNA sola petición.
 */
let promesaCatalogo = null;

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

/**
 * @returns {{codigo:string, etiqueta:string, color:string}[]} clasificaciones
 *          disponibles (arreglo vacío mientras carga).
 */
export function useClasificaciones() {
  const [clasificaciones, setClasificaciones] = useState([]);
  useEffect(() => {
    let vivo = true;
    cargarClasificaciones().then(c => { if (vivo) setClasificaciones(c); });
    return () => { vivo = false; };
  }, []);
  return clasificaciones;
}
