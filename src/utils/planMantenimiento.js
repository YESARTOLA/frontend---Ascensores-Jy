/**
 * Economía de un plan de mantenimiento — espejo en cliente de `totalesDelPlan`
 * (backend/utils/planMantenimientoMensual.js).
 *
 * El monto mensual es el precio de UN MES CON MANTENIMIENTO (la frecuencia
 * mensual es la referencia): solo se cobran los meses en que cae alguna visita,
 * y una sola vez aunque caigan varias. Los MESES GRATUITOS (los primeros N del
 * plan) se prestan pero no se cobran:
 *
 *     total = monto_mensual × (meses con mantenimiento fuera del cupo gratuito)
 *
 * Ej.: 12 meses trimestral a S/ 200 → meses 1, 4, 7, 10 → 4 × 200 = S/ 800.
 *      24 meses mensual a S/ 3.000 con 2 gratuitos → 22 × 3.000 = S/ 66.000.
 *
 * Se usa para previsualizar el importe mientras se arma el plan; el backend
 * sigue siendo la autoridad y devuelve sus propios `totales` en el detalle.
 *
 * Un plan con precio POR ASCENSOR (modo_precio = 'por_ascensor') cobra en cada
 * mes la suma de los ascensores que se atienden en él según su frecuencia, así
 * que su total suma el importe de cada mes facturable (`montosPorMes`).
 */

// Formas de cobro del plan (espejo de backend/utils/planMantenimientoMensual.js).
export const MODO_PRECIO_MENSUAL = 'mensual';
export const MODO_PRECIO_POR_ASCENSOR = 'por_ascensor';

const round2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;

/**
 * Importe de un mes según los ascensores que se facturan — espejo de
 * `montoDelMes` del backend:
 *   · 'mensual': el monto mensual; al excluir ascensores, la parte proporcional
 *     de los que quedan (3 ascensores, S/ 900, se quita uno → S/ 600);
 *   · 'por_ascensor': la suma del precio de los facturados.
 *
 * @param {object} args { modo, montoMensual, precios: Map<id,precio>,
 *                        idsDelMes: number[], idsFacturados?: number[]|null }
 */
export function montoDelMes({ modo, montoMensual, precios, idsDelMes, idsFacturados = null }) {
  const delMes = [...new Set((idsDelMes || []).map(Number))];
  const marcados = idsFacturados == null ? null : new Set(idsFacturados.map(Number));
  const facturados = marcados ? delMes.filter(id => marcados.has(id)) : delMes;
  if (modo === MODO_PRECIO_POR_ASCENSOR) {
    return round2(facturados.reduce((acc, id) => acc + Number(precios?.get(id) || 0), 0));
  }
  const mensual = round2(montoMensual || 0);
  if (delMes.length === 0 || facturados.length === delMes.length) return mensual;
  return round2(mensual * facturados.length / delMes.length);
}

/**
 * Importe previsto de cada mes de un plan 'por_ascensor' mientras se arma:
 * suma el precio de cada ascensor en los meses en que le toca visita.
 *
 * @param {Array<{precio:number, meses:Set<number>}>} ascensores
 * @returns {Map<number, number>} numero_mes → importe
 */
export function montosPorMesPorAscensor(ascensores) {
  const salida = new Map();
  for (const a of ascensores || []) {
    for (const m of a.meses || []) salida.set(m, round2((salida.get(m) || 0) + Number(a.precio || 0)));
  }
  return salida;
}

/**
 * @param {object} plan  { monto_mensual, duracion_meses,
 *                         cantidad_mantenimientos_gratuitos, tipo_plan, moneda }
 * @param {Iterable<number>} mesesConMantenimiento  Meses (1-based) con alguna
 *        visita; ver utils/frecuenciaPlan.js#mesesConVisita.
 * @param {Map<number,number>} [montosPorMes]  Importe de cada mes (solo planes
 *        'por_ascensor').
 * @returns {{meses:number, meses_con_mantenimiento:number, meses_gratuitos:number,
 *           meses_facturables:number, monto_mensual:number, total:number,
 *           moneda:string|null}}
 */
export function totalesDelPlan(plan, mesesConMantenimiento, montosPorMes = null) {
  const meses = plan?.tipo_plan === 'eventual' ? 1 : Number(plan?.duracion_meses || 0);
  // El cupo nunca puede exceder la duración (acortar el plan podría dejarlo por
  // encima de los meses que quedan).
  const gratuitos = Math.min(Math.max(0, Number(plan?.cantidad_mantenimientos_gratuitos || 0)), meses);
  const conMantenimiento = new Set([...(mesesConMantenimiento || [])].map(Number));
  const porAscensor = plan?.modo_precio === MODO_PRECIO_POR_ASCENSOR;
  let conteoConMant = 0;
  let facturables = 0;
  let sumaMeses = 0;
  for (let m = 1; m <= meses; m++) {
    if (!conMantenimiento.has(m)) continue;
    conteoConMant += 1;
    if (m > gratuitos) {
      facturables += 1;
      if (porAscensor) sumaMeses += Number(montosPorMes?.get(m) || 0);
    }
  }
  const mensual = Number(plan?.monto_mensual || 0);
  return {
    meses,
    meses_con_mantenimiento: conteoConMant,
    meses_gratuitos: gratuitos,
    meses_facturables: facturables,
    monto_mensual: mensual,
    total: porAscensor ? round2(sumaMeses) : Math.round(mensual * facturables * 100) / 100,
    moneda: plan?.moneda || null
  };
}

/**
 * Precio de una visita de plan. El servicio no tiene precio propio: nace con
 * precio_interno = 0 porque el importe pactado es el monto MENSUAL del plan,
 * que se cobra una vez por mes con mantenimiento, sin importar cuántas visitas
 * caigan en él (una sola factura al mes).
 * Mostrar ese 0 hacía leer la visita como gratuita.
 *
 * Devuelve null si el servicio no es de plan, si trae precio propio (planes del
 * modelo anterior) o si el monto vino anulado por falta de permiso financiero.
 *
 * @param {object} servicio  { id_mantenimiento_plan, precio_interno, moneda,
 *                             mantenimiento_plan: { monto_mensual, moneda } }
 * @returns {{monto:number, moneda:string}|null}
 */
export function precioMensualDelPlan(servicio) {
  if (!servicio?.id_mantenimiento_plan || Number(servicio.precio_interno || 0) !== 0) return null;
  const monto = servicio.mantenimiento_plan?.monto_mensual;
  if (monto == null) return null;
  return { monto: Number(monto), moneda: servicio.mantenimiento_plan.moneda || servicio.moneda };
}
