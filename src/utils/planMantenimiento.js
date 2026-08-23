/**
 * Economía de un plan de mantenimiento — espejo en cliente de `totalesDelPlan`
 * (backend/utils/planMantenimientoMensual.js).
 *
 * Los MESES GRATUITOS se prestan pero no se cobran, así que el total del
 * contrato NO es `monto_mensual × duración`:
 *
 *     total = monto_mensual × (duración − meses gratuitos)
 *
 * Ej.: 24 meses a S/ 3.000 con 2 gratuitos → 22 × 3.000 = S/ 66.000.
 *
 * Se usa para previsualizar el importe mientras se arma el plan; el backend
 * sigue siendo la autoridad y devuelve sus propios `totales` en el detalle.
 */

/**
 * @param {object} plan  { monto_mensual, duracion_meses,
 *                         cantidad_mantenimientos_gratuitos, tipo_plan, moneda }
 * @returns {{meses:number, meses_gratuitos:number, meses_facturables:number,
 *           monto_mensual:number, total:number, moneda:string|null}}
 */
export function totalesDelPlan(plan) {
  const meses = plan?.tipo_plan === 'eventual' ? 1 : Number(plan?.duracion_meses || 0);
  // El cupo nunca puede exceder la duración (acortar el plan podría dejarlo por
  // encima de los meses que quedan).
  const gratuitos = Math.min(Math.max(0, Number(plan?.cantidad_mantenimientos_gratuitos || 0)), meses);
  const facturables = Math.max(0, meses - gratuitos);
  const mensual = Number(plan?.monto_mensual || 0);
  return {
    meses,
    meses_gratuitos: gratuitos,
    meses_facturables: facturables,
    monto_mensual: mensual,
    total: Math.round(mensual * facturables * 100) / 100,
    moneda: plan?.moneda || null
  };
}
