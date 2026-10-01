/**
 * Reglas de presentación de las clasificaciones de cliente.
 * Espejo de backend/utils/clasificacionesCliente.js (paleta y `aplicaAAreas`) —
 * mantener en sincronía. Las clases de la paleta deben estar en el safelist de
 * tailwind.config.js porque también llegan como strings desde la API.
 */

export const AREA_CLASIFICACION_AMBAS = 'ambos';

/** Áreas a las que puede aplicar una clasificación, para el selector de gestión. */
export const AREAS_CLASIFICACION = [
  { valor: 'servicio', etiqueta: 'Solo Servicios' },
  { valor: 'proyecto', etiqueta: 'Solo Proyectos' },
  { valor: AREA_CLASIFICACION_AMBAS, etiqueta: 'Servicios y Proyectos' }
];

export function etiquetaAreaClasificacion(area) {
  return AREAS_CLASIFICACION.find(a => a.valor === area)?.etiqueta || area;
}

/** Paleta del badge: la clave es lo que se guarda. */
export const COLORES_CLASIFICACION = [
  { clave: 'violeta', etiqueta: 'Violeta', clases: 'bg-violet-100 text-violet-800 ring-violet-200' },
  { clave: 'celeste', etiqueta: 'Celeste', clases: 'bg-sky-100 text-sky-800 ring-sky-200' },
  { clave: 'naranja', etiqueta: 'Naranja', clases: 'bg-ember-100 text-ember-800 ring-ember-200' },
  { clave: 'verde',   etiqueta: 'Verde',   clases: 'bg-emerald-100 text-emerald-800 ring-emerald-200' },
  { clave: 'ambar',   etiqueta: 'Ámbar',   clases: 'bg-amber-100 text-amber-800 ring-amber-200' },
  { clave: 'rosa',    etiqueta: 'Rosa',    clases: 'bg-rose-100 text-rose-800 ring-rose-200' },
  { clave: 'indigo',  etiqueta: 'Índigo',  clases: 'bg-indigo-100 text-indigo-800 ring-indigo-200' },
  { clave: 'gris',    etiqueta: 'Gris',    clases: 'bg-slate-100 text-slate-700 ring-slate-200' }
];

/**
 * ¿La clasificación aplica a un cliente con estas áreas ('servicio' |
 * 'proyecto')? Un cliente de ambas áreas admite cualquiera; uno de una sola,
 * las de su área y las de ambas. Mismo criterio que valida el backend.
 */
export function aplicaAAreas(clasificacion, areas) {
  if (!clasificacion || clasificacion.area === AREA_CLASIFICACION_AMBAS) return true;
  return (areas || []).includes(clasificacion.area);
}
