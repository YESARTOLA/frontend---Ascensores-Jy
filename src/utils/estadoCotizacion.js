// Catálogo único de estados de una COTIZACIÓN.
// Espejo de backend/utils/estadoCotizacion.js — mantener ambos en sincronía.
//
// Dos ejes independientes:
//   - `estado_version`: dónde está cada versión del documento comercial. Lo
//     mueve una acción explícita del usuario (aprobar / rechazar).
//   - `estado_global`: dónde está la cotización en el ciclo operativo. Es
//     DERIVADO del servicio asociado; el backend lo recalcula solo. El frontend
//     únicamente lo lee, nunca lo escribe.
//
// Para PINTAR la lista de opciones de un filtro, prefiere el endpoint
// `cotizacionesService.catalogos()`: viene del backend y no puede desalinearse.
// Estas constantes son para COMPARAR en lógica de render, donde no se puede
// esperar a una petición.

export const ESTADO_VERSION_COTIZADO = 'Cotizado';
export const ESTADO_VERSION_APROBADO = 'Aprobado';
export const ESTADO_VERSION_RECHAZADO = 'Rechazado';

export const ESTADOS_VERSION = [
  ESTADO_VERSION_COTIZADO,
  ESTADO_VERSION_APROBADO,
  ESTADO_VERSION_RECHAZADO
];

export const ESTADO_GLOBAL_COTIZADO = 'Cotizado';
export const ESTADO_GLOBAL_ACEPTADO = 'Aceptado';
export const ESTADO_GLOBAL_EJECUCION = 'Ejecución';
export const ESTADO_GLOBAL_PENDIENTE = 'Pendiente';
export const ESTADO_GLOBAL_TERMINADO = 'Terminado';
// Terminal: la cotización fue eliminada (baja lógica) pero se conserva visible
// en el listado como historial.
export const ESTADO_GLOBAL_ANULADO = 'Anulado';

export const ESTADOS_GLOBALES = [
  ESTADO_GLOBAL_COTIZADO,
  ESTADO_GLOBAL_ACEPTADO,
  ESTADO_GLOBAL_EJECUCION,
  ESTADO_GLOBAL_PENDIENTE,
  ESTADO_GLOBAL_TERMINADO,
  ESTADO_GLOBAL_ANULADO
];

// Filtro VIRTUAL del listado: agrupa todas las etapas posteriores a la
// aceptación bajo una sola opción del selector. No es un estado real de la BD;
// su traducción a estados reales la resuelve el backend. El valor que viaja en
// la query es 'Aprobadas'; la lista de opciones del selector se pide a
// `cotizacionesService.catalogos()` (campo `filtros_globales`), no se arma aquí.
// Espejo de backend/utils/estadoCotizacion.js.
export const FILTRO_GLOBAL_APROBADAS = 'Aprobadas';

// Estados del embudo ya aceptado. Con cualquiera de estos filtros (o con el
// virtual 'Aprobadas') el rango de fechas del listado NO filtra por fecha de
// creación sino por FECHA DE ACEPTACIÓN de la cotización: "aceptadas de agosto"
// son las que se aprobaron en agosto, estén hoy en ejecución o ya terminadas.
// Espejo de backend/utils/estadoCotizacion.js.
export const ESTADOS_GLOBALES_POST_ACEPTACION = [
  ESTADO_GLOBAL_ACEPTADO,
  ESTADO_GLOBAL_EJECUCION,
  ESTADO_GLOBAL_PENDIENTE,
  ESTADO_GLOBAL_TERMINADO
];

export function rangoEsPorFechaAceptacion(valorFiltroGlobal) {
  if (!valorFiltroGlobal) return false;
  return valorFiltroGlobal === FILTRO_GLOBAL_APROBADAS
    || ESTADOS_GLOBALES_POST_ACEPTACION.includes(valorFiltroGlobal);
}

// Estados en los que ya existe un servicio en marcha: la cotización se puede
// reabrir para renegociar las cuotas pendientes. Antes de 'Aceptado' no hay nada
// que renegociar; en 'Terminado' / 'Anulado' ya es tarde.
export const ESTADOS_GLOBALES_SERVICIO_EN_MARCHA = [
  ESTADO_GLOBAL_ACEPTADO,
  ESTADO_GLOBAL_EJECUCION,
  ESTADO_GLOBAL_PENDIENTE
];
