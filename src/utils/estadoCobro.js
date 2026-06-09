// Catálogo único de estados de cobro (columna estado_cobro de tbl_cobros y
// tbl_servicios_realizados). Fuente única para poblar filtros en los módulos
// de Gestión de cobros y Contabilidad — evita duplicar la lista.
export const ESTADOS_COBRO = [
  'Pendiente de iniciar',
  'En gestión',
  'Parcialmente pagado',
  'Vencido',
  'En mora',
  'Pagado',
  'Cerrado',
  'Incobrable',
  'Sin cobro'
];
