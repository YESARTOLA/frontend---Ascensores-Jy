import { useEffect, useState } from 'react';
import { cuentasBancariasService } from '../services';

/**
 * Catálogo de monedas del backend (utils/catalogosBancarios). SSoT única: ningún
 * formulario debe listar códigos de moneda literales, para que agregar o quitar
 * una moneda sea un cambio en un solo archivo del backend.
 *
 * El catálogo es estable durante la sesión, así que la promesa se memoiza a
 * nivel de módulo: N formularios montados a la vez hacen UNA sola petición.
 */
let promesaCatalogo = null;

function cargarMonedas() {
  if (!promesaCatalogo) {
    promesaCatalogo = cuentasBancariasService.catalogos()
      .then(c => c?.monedas || [])
      // Un fallo de red no debe dejar el catálogo cacheado en vacío para siempre:
      // se limpia para que el próximo montaje reintente.
      .catch(() => { promesaCatalogo = null; return []; });
  }
  return promesaCatalogo;
}

/**
 * @returns {{codigo:string, etiqueta:string, simbolo:string}[]} monedas disponibles
 *          (arreglo vacío mientras carga).
 */
export function useMonedas() {
  const [monedas, setMonedas] = useState([]);
  useEffect(() => {
    let vivo = true;
    cargarMonedas().then(m => { if (vivo) setMonedas(m); });
    return () => { vivo = false; };
  }, []);
  return monedas;
}
