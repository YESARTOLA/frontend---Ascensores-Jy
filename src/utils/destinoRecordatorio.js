/**
 * A dónde lleva una notificación / recordatorio al hacer clic.
 *
 * Punto único: lo consumen la campana del Topbar, el bloque del Dashboard y la
 * página de Recordatorios. Antes cada uno tenía su propia copia y las tres
 * mandaban las alertas de emergencia y de mantenimiento al MÓDULO, obligando a
 * buscar el registro a mano.
 *
 * El orden importa: se resuelve al destino más específico posible.
 *   1. El servicio vinculado, si lo hay.
 *   2. Emergencia → SU servicio. Toda emergencia genera uno al registrarse, así
 *      que este es el destino real de sus alertas, no el listado.
 *   3. Cobro (también el de una cuota, que cuelga del mismo cobro).
 *   4. Plan de mantenimiento → el listado con el plan abierto (`?plan=`).
 *   5. Emergencia sin servicio → el módulo. Caso teórico: hoy no existe ninguna,
 *      pero si la hubiera, el listado es lo más cerca que se puede llegar.
 */
export function destinoRecordatorio(r) {
  if (!r) return '/recordatorios';
  if (r.servicio?.id) return `/servicios/${r.servicio.id}`;
  if (r.emergencia?.servicio?.id) return `/servicios/${r.emergencia.servicio.id}`;
  if (r.cobro?.id) return `/cobros/${r.cobro.id}`;
  if (r.mantenimiento_plan?.id) return `/mantenimientos?plan=${r.mantenimiento_plan.id}`;
  if (r.emergencia?.id) return '/emergencias';
  return '/recordatorios';
}

/**
 * Etiqueta de ese destino ("Servicio SRV-2026-000012"), para las vistas que
 * muestran el vínculo como texto además del enlace.
 */
export function etiquetaDestinoRecordatorio(r) {
  if (!r) return null;
  if (r.servicio?.id) return `Servicio ${r.servicio.codigo || ''}`.trim();
  if (r.emergencia?.servicio?.id) {
    return `Servicio ${r.emergencia.servicio.codigo || ''}`.trim() + ' · Emergencia';
  }
  if (r.cobro?.id) return `Cobro #${r.cobro.id}`;
  if (r.mantenimiento_plan?.id) return `Plan de mantenimiento #${r.mantenimiento_plan.id}`;
  if (r.emergencia?.id) return 'Emergencia';
  return null;
}
