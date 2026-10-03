/**
 * Rendimiento de una frecuencia en meses de plan — espejo en cliente de
 * `visitasEnMeses` del backend (utils/frecuenciaMantenimiento.js).
 *
 * Solo se usa para ANTICIPAR en el formulario cuántas visitas generará cada
 * ascensor ("mensual × 12 meses = 12 visitas"). El cronograma real siempre lo
 * calcula el backend; aquí no se decide nada.
 *
 * Los metadatos (`por_mes`, `cada_meses`) vienen del propio catálogo del
 * backend vía GET /mantenimientos/frecuencias, así que no hay una segunda tabla
 * de frecuencias que mantener sincronizada.
 */

/**
 * @param {object} frecuencia  Entrada del catálogo { codigo, por_mes, cada_meses }
 * @param {number} meses       Duración del plan
 * @param {number} [diasCustom] Días entre visitas si la frecuencia es 'custom'
 * @returns {number|null} visitas previstas, o null si no se puede calcular
 */
export function visitasEnMeses(frecuencia, meses, diasCustom) {
  const m = Number(meses);
  if (!frecuencia || !Number.isInteger(m) || m < 1) return null;
  if (frecuencia.por_mes && !frecuencia.cada_meses) return frecuencia.por_mes * m;
  if (frecuencia.cada_meses) return Math.ceil(m / frecuencia.cada_meses);
  // Paso en días (diaria / personalizada): aproximación con el mes medio real.
  const paso = frecuencia.codigo === 'custom' ? Number(diasCustom) : 1;
  if (!Number.isInteger(paso) || paso <= 0) return null;
  return Math.ceil((m * 30.4375) / paso);
}

/**
 * Meses del plan (1-based) en que cae al menos una visita de esta frecuencia.
 * Son los meses que se cobran (ver utils/planMantenimiento.js#totalesDelPlan):
 * trimestral × 12 meses → {1, 4, 7, 10}. Anticipación para el formulario; el
 * backend calcula los reales sobre el cronograma.
 *
 * @returns {Set<number>}
 */
export function mesesConVisita(frecuencia, meses, diasCustom) {
  const m = Number(meses);
  const salida = new Set();
  if (!frecuencia || !Number.isInteger(m) || m < 1) return salida;
  if (frecuencia.cada_meses) {
    for (let i = 1; i <= m; i += frecuencia.cada_meses) salida.add(i);
    return salida;
  }
  if (frecuencia.por_mes) {
    for (let i = 1; i <= m; i++) salida.add(i);
    return salida;
  }
  // Paso en días (diaria / personalizada): con el mes medio real.
  const paso = frecuencia.codigo === 'custom' ? Number(diasCustom) : 1;
  if (!Number.isInteger(paso) || paso <= 0) return salida;
  const MES = 30.4375;
  for (let d = 0; d < m * MES; d += paso) salida.add(Math.floor(d / MES) + 1);
  return salida;
}

/** Texto corto del rendimiento: "12 visitas" / "24 visitas". */
export function etiquetaVisitas(frecuencia, meses, diasCustom) {
  const n = visitasEnMeses(frecuencia, meses, diasCustom);
  if (n == null) return '—';
  return `${n} ${n === 1 ? 'visita' : 'visitas'}`;
}
