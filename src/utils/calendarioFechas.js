/**
 * Helpers de fecha del calendario, anclados a la zona horaria de Lima e
 * independientes del huso del navegador. Extraídos de Calendario.jsx para poder
 * reutilizar el mismo grid de mes en otras pantallas (Recordatorios, etc.).
 */

export const TZ = 'America/Lima';
export const OFFSET_LIMA = '-05:00';

export const fmtDiaLargo = new Intl.DateTimeFormat('es-PE', {
  weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: TZ
});

/** Etiqueta "mes año" del cursor (ej. "julio 2026"), en zona Lima. */
export function mesLabelLima(cursor) {
  return new Intl.DateTimeFormat('es-PE', { month: 'long', year: 'numeric', timeZone: TZ }).format(cursor);
}

/**
 * Igual que `mesLabelLima` pero con el mes abreviado ("set. 2026"). Lo usa la
 * barra de navegación del calendario en móvil, donde "Setiembre De 2026" no
 * cabe entre las dos flechas y se cortaba a mitad de palabra.
 */
export function mesLabelCortoLima(cursor) {
  return new Intl.DateTimeFormat('es-PE', { month: 'short', year: 'numeric', timeZone: TZ }).format(cursor);
}

/**
 * "YYYY-MM-DD" del cursor interpretado como día de Lima. cursor es un Date
 * (instante absoluto); lo formateamos en Lima para tener un YMD estable
 * independiente de la TZ del navegador.
 */
export function ymdLima(d) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit'
  }).format(d);
}

/** Convierte "YYYY-MM-DD" + hora opcional a un instante anclado a Lima. */
export function fechaLima(ymd, hm = '00:00:00.000') {
  return new Date(`${ymd}T${hm}${OFFSET_LIMA}`);
}

/**
 * Rango "desde/hasta" del mes que contiene al cursor, expresado como instantes
 * anclados a Lima — independiente de la TZ del navegador.
 */
export function rangoMes(cursor) {
  const [y, m] = ymdLima(cursor).split('-').map(Number);
  const inicio = fechaLima(`${y}-${String(m).padStart(2, '0')}-01`, '00:00:00.000');
  // último día del mes en Lima: usar Date.UTC para conocer el último día numérico,
  // luego anclar a Lima TZ con offset fijo (-05:00, sin DST).
  const ultimoDia = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const fin = fechaLima(`${y}-${String(m).padStart(2, '0')}-${String(ultimoDia).padStart(2, '0')}`, '23:59:59.999');
  return { desde: inicio.toISOString(), hasta: fin.toISOString() };
}

/**
 * Días del grid del calendario (lunes a domingo, 6 filas). Cada celda es un
 * objeto { ymd: "YYYY-MM-DD", dia: 1..31, mes: 1..12, anio } con el día Lima.
 * No depende de la TZ del navegador.
 */
export function diasDelCalendario(cursor) {
  const [yC, mC] = ymdLima(cursor).split('-').map(Number);
  // Trabajamos sobre Date.UTC con día puro: cualquier cálculo de días aquí
  // es seguro porque las horas siempre quedan en 00:00 UTC.
  const inicioMes = new Date(Date.UTC(yC, mC - 1, 1));
  const finMes = new Date(Date.UTC(yC, mC, 0));
  // Lunes como primer día: ((getUTCDay() + 6) % 7) da 0..6 desde lunes.
  const offsetInicio = (inicioMes.getUTCDay() + 6) % 7;
  const inicioGrid = new Date(Date.UTC(yC, mC - 1, 1 - offsetInicio));
  const diaFinSemana = finMes.getUTCDay();
  const offsetFin = diaFinSemana === 0 ? 0 : 7 - diaFinSemana;
  const finGrid = new Date(Date.UTC(yC, mC, offsetFin));
  const dias = [];
  for (let t = inicioGrid.getTime(); t <= finGrid.getTime(); t += 86400000) {
    const d = new Date(t);
    const y = d.getUTCFullYear();
    const m = d.getUTCMonth() + 1;
    const dia = d.getUTCDate();
    dias.push({
      ymd: `${y}-${String(m).padStart(2, '0')}-${String(dia).padStart(2, '0')}`,
      dia,
      mes: m,
      anio: y
    });
  }
  return dias;
}
