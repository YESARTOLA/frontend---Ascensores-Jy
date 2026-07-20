// Catálogo único del filtro por estado de baja lógica (`estado` 1/0) que usan
// los listados restringidos al Super Admin.
//
// Espejo de backend/utils/filtroEstadoRegistro.js — mantener ambos en sincronía.
// El código viaja tal cual como query param `estado`; la etiqueta es lo que se
// pinta en el select.

export const FILTRO_ESTADO_ACTIVOS = 'activos';
export const FILTRO_ESTADO_INACTIVOS = 'inactivos';
export const FILTRO_ESTADO_TODOS = 'todos';

export const FILTROS_ESTADO_REGISTRO = [
  { codigo: FILTRO_ESTADO_ACTIVOS, etiqueta: 'Estado: activos' },
  { codigo: FILTRO_ESTADO_INACTIVOS, etiqueta: 'Estado: eliminados' },
  { codigo: FILTRO_ESTADO_TODOS, etiqueta: 'Estado: todos' }
];
