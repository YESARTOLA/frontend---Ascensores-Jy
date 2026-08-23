/**
 * Programación de los días de trabajo de un servicio (correctivo, emergencia,
 * mantenimiento o atención rápida).
 *
 * El trabajo no siempre ocupa días corridos: puede ser un RANGO (10–14 de
 * agosto), FECHAS SUELTAS (10, 15 y 20 de agosto) o cualquier combinación de
 * ambos. En el formulario eso se edita como una lista de TRAMOS
 * `{ desde, hasta }` (un día suelto es un tramo con desde === hasta); al backend
 * se envía esa misma lista en el campo `dias`, y él la expande a la grilla de
 * días que verá el técnico en su calendario.
 *
 * Espejo de `backend/utils/programacionDias.js`. Todo se opera en "fecha pura"
 * ('YYYY-MM-DD'), sin husos.
 */

import { formatFecha, toYMDLima } from './formatters.js';

/** Techo de seguridad, igual que en el backend. */
export const MAX_DIAS_PROGRAMADOS = 366;

/** Suma `n` días a un 'YYYY-MM-DD' (aritmética de calendario en UTC puro). */
export function addDiasYMD(ymd, n) {
  if (!ymd) return '';
  const d = new Date(`${String(ymd).substring(0, 10)}T00:00:00.000Z`);
  if (isNaN(d.getTime())) return '';
  d.setUTCDate(d.getUTCDate() + Number(n || 0));
  return d.toISOString().slice(0, 10);
}

/** Días de calendario entre dos 'YYYY-MM-DD' (b - a). */
export function diasEntreYMD(a, b) {
  if (!a || !b) return 0;
  const da = new Date(`${a}T00:00:00.000Z`).getTime();
  const db = new Date(`${b}T00:00:00.000Z`).getTime();
  if (isNaN(da) || isNaN(db)) return 0;
  return Math.round((db - da) / 86400000);
}

/**
 * Día de la semana de un 'YYYY-MM-DD' (0 = domingo), sin desfase de huso.
 */
export const diaSemanaYMD = (ymd) =>
  new Date(`${String(ymd || '').slice(0, 10)}T00:00:00.000Z`).getUTCDay();

/**
 * Los domingos NO se programan: es la regla de operación de la empresa y por eso
 * el selector de días los bloquea por defecto (ver ProgramacionDias, que deja
 * habilitarlos puntualmente). El backend no la impone —una programación con
 * domingo sigue siendo válida— para que la excepción, cuando el coordinador la
 * decide, no choque contra el servidor.
 */
export const esDomingo = (ymd) => diaSemanaYMD(ymd) === 0;

/** true si alguna de las fechas cae en domingo. */
export const tieneDomingos = (fechas) => (fechas || []).some(esDomingo);

/** Un tramo nuevo de un solo día. */
export const tramoDeUnDia = (fecha = '') => ({ desde: fecha, hasta: fecha });

/** true si el tramo cubre más de un día (es un rango). */
export const esRango = (t) => !!t && !!t.desde && !!t.hasta && t.hasta !== t.desde;

/** Fechas 'YYYY-MM-DD' ordenadas y sin repetir que cubren los tramos. */
export function fechasDesdeTramos(tramos) {
  const set = new Set();
  for (const t of tramos || []) {
    const desde = t?.desde ? String(t.desde).substring(0, 10) : '';
    if (!desde) continue;
    const hasta = t?.hasta ? String(t.hasta).substring(0, 10) : desde;
    if (hasta < desde) continue;
    let cur = desde;
    while (cur && cur <= hasta) {
      set.add(cur);
      if (set.size > MAX_DIAS_PROGRAMADOS) return [...set].sort();
      cur = addDiasYMD(cur, 1);
    }
  }
  return [...set].sort();
}

/** Agrupa fechas en tramos consecutivos. Inversa de `fechasDesdeTramos`. */
export function tramosDesdeFechas(fechas) {
  const orden = [...new Set((fechas || []).map(f => toYMDLima(f)).filter(Boolean))].sort();
  const tramos = [];
  for (const f of orden) {
    const ultimo = tramos[tramos.length - 1];
    if (ultimo && addDiasYMD(ultimo.hasta, 1) === f) ultimo.hasta = f;
    else tramos.push({ desde: f, hasta: f });
  }
  return tramos;
}

/** Tramos de la programación vigente de un servicio (su grilla de días). */
export function tramosDeServicio(servicio) {
  const dias = (servicio?.dias || []).filter(d => d?.estado !== 0);
  if (dias.length > 0) return tramosDesdeFechas(dias.map(d => d.fecha));
  if (servicio?.fecha_programada) {
    const inicio = toYMDLima(servicio.fecha_programada);
    const n = Math.max(1, Number(servicio.duracion_dias) || 1);
    return tramosDesdeFechas(Array.from({ length: n }, (_, i) => addDiasYMD(inicio, i)));
  }
  return [];
}

/**
 * Primer problema que impide guardar la programación, o null si es válida.
 * Se usa para bloquear el submit con un mensaje concreto.
 */
export function errorDeTramos(tramos) {
  const lista = tramos || [];
  if (lista.length === 0) return 'Seleccione al menos un día de trabajo';
  for (const t of lista) {
    if (!t?.desde) return 'Complete la fecha de todos los tramos';
    if (esRango(t) && !t.hasta) return 'Complete la fecha de fin de los rangos';
    if (t.hasta && t.hasta < t.desde) return `El rango ${formatFecha(t.desde)} → ${formatFecha(t.hasta)} termina antes de empezar`;
  }
  const total = fechasDesdeTramos(lista).length;
  if (total === 0) return 'Seleccione al menos un día de trabajo';
  if (total > MAX_DIAS_PROGRAMADOS) return `La programación no puede superar ${MAX_DIAS_PROGRAMADOS} días`;
  return null;
}

/** Cantidad de días de trabajo que cubren los tramos (sin contar repetidos). */
export const contarDias = (tramos) => fechasDesdeTramos(tramos).length;

/**
 * Resumen legible de la programación: "10/08/2026, 14/08/2026 al 16/08/2026 y
 * 20/08/2026". Los tramos se normalizan antes (fechas repetidas o rangos que se
 * tocan se funden), así que el texto refleja lo que realmente se va a guardar.
 */
export function resumenProgramacion(tramos) {
  const partes = tramosDesdeFechas(fechasDesdeTramos(tramos)).map(t => (
    t.desde === t.hasta ? formatFecha(t.desde) : `${formatFecha(t.desde)} al ${formatFecha(t.hasta)}`
  ));
  if (partes.length === 0) return '';
  if (partes.length === 1) return partes[0];
  return `${partes.slice(0, -1).join(', ')} y ${partes[partes.length - 1]}`;
}

/**
 * Payload `dias` para el backend. Devuelve undefined cuando no hay nada que
 * enviar, para que el campo se omita y el servidor conserve lo que ya tenía.
 */
export function payloadDias(tramos) {
  const lista = tramosDesdeFechas(fechasDesdeTramos(tramos));
  return lista.length > 0 ? lista : undefined;
}

/**
 * Días programados de un servicio en 'YYYY-MM-DD'. Un trabajo puede ocupar días
 * NO corridos (10, 15 y 20): `fecha_programada` solo marca el primero, así que
 * la fuente es la grilla `dias`. Sin grilla (datos previos, o consultas que no
 * la traen) se cae a la fecha programada.
 */
export function diasProgramados(servicio) {
  const dias = (servicio?.dias || []).filter(d => d?.estado !== 0).map(d => toYMDLima(d.fecha)).filter(Boolean);
  if (dias.length > 0) return [...new Set(dias)].sort();
  const f = toYMDLima(servicio?.fecha_programada);
  return f ? [f] : [];
}

/**
 * Etiqueta compacta de la programación para celdas de tabla: la fecha con su
 * hora si es un solo día, o "primer día · N días" si son varios. `detalle` es el
 * desglose completo, pensado para el `title` de la celda.
 * @returns {{ texto: string, detalle: string, dias: number }}
 */
export function etiquetaProgramacion(servicio) {
  const dias = diasProgramados(servicio);
  if (dias.length === 0) return { texto: '—', detalle: '', dias: 0 };
  const hora = servicio?.hora_programada ? ` ${servicio.hora_programada}` : '';
  const detalle = resumenProgramacion(dias);
  if (dias.length === 1) return { texto: `${formatFecha(dias[0])}${hora}`, detalle, dias: 1 };
  return { texto: `${formatFecha(dias[0])} · ${dias.length} días`, detalle, dias: dias.length };
}
