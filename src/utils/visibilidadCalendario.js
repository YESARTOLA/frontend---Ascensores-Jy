// Visibilidad del calendario por rol — espejo de backend/utils/visibilidadCalendario.js.
// Mantener ambos en sincronía.

export const VISIBILIDAD_POR_ROL = {
  super_admin:  { operativos: 'todos',     tipos_recordatorio: ['servicio', 'mantenimiento', 'emergencia', 'cobro', 'observacion', 'observacion_alerta', 'cotizacion_urgente', 'servicio_finalizado_revisar', 'servicio_finalizado_facturar', 'servicio_finalizado_aviso'] },
  admin:        { operativos: 'todos',     tipos_recordatorio: ['servicio', 'mantenimiento', 'emergencia', 'observacion', 'observacion_alerta', 'cotizacion_urgente', 'servicio_finalizado_revisar', 'servicio_finalizado_facturar', 'servicio_finalizado_aviso'] },
  coordinador:  { operativos: 'todos',     tipos_recordatorio: ['servicio', 'mantenimiento', 'emergencia', 'observacion', 'cotizacion_urgente', 'servicio_finalizado_revisar'] },
  tecnico:      { operativos: 'asignados', tipos_recordatorio: ['servicio', 'mantenimiento', 'emergencia'] },
  contabilidad: { operativos: 'todos',     tipos_recordatorio: ['cobro', 'observacion_alerta', 'servicio_finalizado_facturar'] },
  // La Vendedora ve TODA la agenda operativa (solo lectura) para validar la
  // disponibilidad de los técnicos al programar; sin recordatorios.
  vendedora:    { operativos: 'todos',     tipos_recordatorio: [] }
};

// Catálogo único de tipos de evento para los selects y la leyenda.
// `value` coincide con `tbl_calendario_eventos.tipo_evento` y con
// `tbl_recordatorios.tipo`. El color es el fallback cuando el evento no trae
// uno propio (los eventos suelen traer su color desde la BD).
// Paleta de 12 tonos elegidos para ser distinguibles entre sí (sin duplicados ni
// pares casi iguales). Cada tipo tiene un matiz propio bien separado en el
// espectro; es la fuente única de color del calendario (ver colorPorTipo).
export const CATALOGO_TIPOS_EVENTO = [
  { value: 'servicio',           label: 'Servicio',           label_plural: 'servicios',            color: '#0ea5e9', dominio: 'operativo' },   // celeste
  { value: 'proyecto',           label: 'Proyecto',           label_plural: 'proyectos',            color: '#1d4ed8', dominio: 'operativo' },   // azul
  { value: 'mantenimiento',      label: 'Mantenimiento',      label_plural: 'mantenimientos',       color: '#16a34a', dominio: 'operativo' },   // verde
  { value: 'emergencia',         label: 'Emergencia',         label_plural: 'emergencias',          color: '#dc2626', dominio: 'operativo' },   // rojo
  { value: 'correctivo',         label: 'Correctivo',         label_plural: 'correctivos',          color: '#f59e0b', dominio: 'operativo' },   // ámbar
  { value: 'cobro',              label: 'Cobro',              label_plural: 'cobros',               color: '#9333ea', dominio: 'recordatorio' }, // púrpura
  { value: 'observacion',        label: 'Observación',        label_plural: 'observaciones',        color: '#0d9488', dominio: 'recordatorio' }, // turquesa
  { value: 'observacion_alerta', label: 'Alerta de observación', label_plural: 'alertas de observación', color: '#e11d48', dominio: 'recordatorio' }, // rosa-rojo
  { value: 'cotizacion_urgente', label: 'Cotización urgente', label_plural: 'cotizaciones urgentes', color: '#c026d3', dominio: 'recordatorio' }, // fucsia
  { value: 'servicio_finalizado_revisar',  label: 'Revisar servicio',  label_plural: 'revisiones de servicio',   color: '#65a30d', dominio: 'recordatorio' }, // lima
  { value: 'servicio_finalizado_facturar', label: 'Facturar servicio', label_plural: 'facturaciones pendientes', color: '#4f46e5', dominio: 'recordatorio' }, // índigo
  { value: 'servicio_finalizado_aviso',    label: 'Servicio finalizado', label_plural: 'servicios finalizados',  color: '#475569', dominio: 'recordatorio' }  // gris pizarra
];

const COLOR_FALLBACK = '#0ea5e9';

function reglas(rol) {
  return VISIBILIDAD_POR_ROL[rol];
}

export function incluyeOperativos(rol) {
  const r = reglas(rol);
  return !!r && r.operativos !== 'ninguno';
}

export function soloOperativosAsignados(rol) {
  return reglas(rol)?.operativos === 'asignados';
}

export function tiposRecordatorioPermitidos(rol) {
  return reglas(rol)?.tipos_recordatorio || [];
}

// Tipos de evento visibles para el rol: los operativos si el rol ve operativos,
// más cualquier tipo de "recordatorio puro" (cobro, observacion) que esté
// autorizado en `tipos_recordatorio`. Devuelve la lista con `value` y `label`
// lista para alimentar el <select> de filtro y la leyenda.
export function tiposEventoVisibles(rol) {
  if (!reglas(rol)) return [];
  const verOperativos = incluyeOperativos(rol);
  const tiposRec = tiposRecordatorioPermitidos(rol);
  return CATALOGO_TIPOS_EVENTO.filter(t => {
    if (t.dominio === 'operativo') return verOperativos;
    return tiposRec.includes(t.value);
  });
}

// Leyenda de colores: solo los tipos que el rol puede ver.
export function leyendaVisible(rol) {
  return tiposEventoVisibles(rol).map(t => ({ color: t.color, label: t.label }));
}

// El selector de tipo solo tiene sentido cuando hay más de un tipo visible.
export function muestraFiltroTipo(rol) {
  return tiposEventoVisibles(rol).length > 1;
}

// El selector de técnico solo tiene sentido para roles que ven eventos
// operativos (servicios). Para contabilidad, técnicos no aplica.
export function muestraFiltroTecnico(rol) {
  return incluyeOperativos(rol);
}

// El selector de cliente se muestra siempre que el rol vea algo: tanto los
// recordatorios de cobro como los servicios operativos están ligados a un cliente.
export function muestraFiltroCliente(rol) {
  return !!reglas(rol);
}

export function colorPorTipo(tipo) {
  return CATALOGO_TIPOS_EVENTO.find(t => t.value === tipo)?.color || COLOR_FALLBACK;
}

// Etiqueta legible del tipo de evento (el "módulo" donde se creó: Emergencia,
// Correctivo, Mantenimiento, Servicio, Proyecto…). Fuente única: el catálogo.
export function etiquetaTipoEvento(tipo) {
  return CATALOGO_TIPOS_EVENTO.find(t => t.value === tipo)?.label || 'Servicio';
}

// Subtítulo del PageHeader: enumera en plural los tipos visibles para el rol,
// construido desde `tiposEventoVisibles` para mantenerse coherente con el resto
// de la UI sin hardcodear combinaciones.
export function subtituloCalendario(rol) {
  const tipos = tiposEventoVisibles(rol);
  if (tipos.length === 0) return '';
  const etiquetas = tipos.map(t => t.label_plural);
  if (etiquetas.length === 1) return capitalizar(etiquetas[0]);
  const ultima = etiquetas[etiquetas.length - 1];
  const previas = etiquetas.slice(0, -1).join(', ');
  return capitalizar(`${previas} y ${ultima}`);
}

function capitalizar(s) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
