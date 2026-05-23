/**
 * Helpers de formato anclados a America/Lima (UTC-5, sin DST).
 *
 * Reglas:
 *  - Las columnas `@db.Date` de Prisma se serializan como "YYYY-MM-DDT00:00:00.000Z"
 *    (medianoche UTC). NO deben convertirse a Lima TZ (desplazaría -5h al día anterior).
 *    formatFecha detecta este caso y formatea literal.
 *  - Las columnas `@db.Timestamptz(6)` (audit, fecha_recordatorio, fecha_carga, etc.)
 *    son instantes absolutos. Se formatean con timeZone America/Lima para mostrar la
 *    hora local real del registro.
 */
const TZ = 'America/Lima';
const OFFSET = '-05:00';

// "YYYY-MM-DD" o "YYYY-MM-DDT00:00:00(.0+)?Z?" → ['YYYY','MM','DD'] | null
function partesFechaSimple(v) {
  if (typeof v !== 'string') return null;
  const m = v.match(/^(\d{4})-(\d{2})-(\d{2})(?:T00:00:00(?:\.0+)?Z?)?$/);
  return m ? [m[1], m[2], m[3]] : null;
}

export function formatFecha(dateLike) {
  if (!dateLike) return '—';
  // Fecha pura (Prisma @db.Date o "YYYY-MM-DD"): formatear sin conversión de TZ
  // para no desplazarla un día atrás al pasar de medianoche UTC a Lima.
  const partes = partesFechaSimple(dateLike);
  if (partes) return `${partes[2]}/${partes[1]}/${partes[0]}`;
  const d = new Date(dateLike);
  if (isNaN(d)) return '—';
  return new Intl.DateTimeFormat('es-PE', {
    timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit'
  }).format(d);
}

export function formatFechaHora(dateLike) {
  if (!dateLike) return '—';
  const d = new Date(dateLike);
  if (isNaN(d)) return '—';
  return new Intl.DateTimeFormat('es-PE', {
    timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false
  }).format(d);
}

export function formatHora(dateLike) {
  if (!dateLike) return '—';
  const d = new Date(dateLike);
  if (isNaN(d)) return '—';
  return new Intl.DateTimeFormat('es-PE', {
    timeZone: TZ, hour: '2-digit', minute: '2-digit', hour12: false
  }).format(d);
}

export function formatMonto(n, moneda = 'PEN') {
  if (n === null || n === undefined || n === '') return '—';
  const num = Number(n);
  if (isNaN(num)) return '—';
  try {
    return new Intl.NumberFormat('es-PE', { style: 'currency', currency: moneda, minimumFractionDigits: 2 }).format(num);
  } catch {
    return `S/ ${num.toFixed(2)}`;
  }
}

/**
 * "YYYY-MM-DD" del día actual en hora de Lima, independiente del huso del navegador.
 * Usa Intl.DateTimeFormat porque process.env.TZ del navegador no aplica.
 */
export function hoyISO() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit'
  }).format(new Date());
}

/**
 * "YYYY-MM-DDTHH:mm" actual en hora de Lima — para prellenar inputs datetime-local.
 */
export function nowDateTimeLocalLima() {
  const ahora = new Date();
  const ymd = new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit'
  }).format(ahora);
  const hm = new Intl.DateTimeFormat('en-GB', {
    timeZone: TZ, hour: '2-digit', minute: '2-digit', hour12: false
  }).format(ahora);
  return `${ymd}T${hm}`;
}

/**
 * Instante ISO (UTC) → "YYYY-MM-DDTHH:mm" en hora de Lima.
 * Necesario para mostrar correctamente el valor en <input type="datetime-local">
 * al editar un recordatorio existente, sin depender del huso del navegador.
 */
export function isoToDateTimeLocalLima(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d)) return '';
  const ymd = new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit'
  }).format(d);
  const hm = new Intl.DateTimeFormat('en-GB', {
    timeZone: TZ, hour: '2-digit', minute: '2-digit', hour12: false
  }).format(d);
  return `${ymd}T${hm}`;
}

/**
 * "YYYY-MM-DDTHH:mm" (interpretado como hora de Lima) → ISO UTC del mismo instante.
 * Robusto al huso del navegador del usuario: siempre ancla el valor a Lima.
 */
export function dateTimeLocalLimaToISO(s) {
  if (!s) return null;
  const v = String(s).trim();
  if (!v) return null;
  // Si ya trae designador de TZ, respetar.
  if (/[zZ]$|[+-]\d{2}:?\d{2}$/.test(v)) return new Date(v).toISOString();
  // "YYYY-MM-DDTHH:mm" o "YYYY-MM-DDTHH:mm:ss" → forzar offset Lima
  const completo = v.length === 16 ? `${v}:00.000` : (v.length === 19 ? `${v}.000` : v);
  return new Date(`${completo}${OFFSET}`).toISOString();
}

/**
 * Suma `n` días a una fecha "YYYY-MM-DD" trabajando en UTC para evitar drift
 * por TZ del navegador. Si `ymd` no se provee, parte de hoy en Lima.
 * Lima no observa DST, así que sumar días en UTC equivale a sumar días en Lima.
 */
export function addDaysYMD(ymd, n) {
  const base = ymd ? (partesFechaSimple(ymd) || partesFechaSimple(String(ymd).substring(0, 10))) : null;
  const [y, m, d] = base ? base.map(Number) : hoyISO().split('-').map(Number);
  const t = Date.UTC(y, m - 1, d) + Number(n) * 86400000;
  const f = new Date(t);
  return `${f.getUTCFullYear()}-${String(f.getUTCMonth() + 1).padStart(2, '0')}-${String(f.getUTCDate()).padStart(2, '0')}`;
}

/**
 * Suma `n` meses a una fecha "YYYY-MM-DD" preservando el día (Lima).
 * Si el mes destino no tiene ese día (ej. 31 ene → feb), cae al último día del mes.
 * No usa Date para evitar drift por TZ del navegador.
 */
export function addMonthsYMD(ymd, n) {
  if (!ymd) return ymd;
  const partes = partesFechaSimple(ymd) || partesFechaSimple(String(ymd).substring(0, 10));
  if (!partes) return ymd;
  let [y, m, d] = partes.map(Number);
  const offset = m - 1 + n;
  const yNuevo = y + Math.floor(offset / 12);
  const mNuevo = ((offset % 12) + 12) % 12 + 1; // 1..12
  const ultimoDia = new Date(Date.UTC(yNuevo, mNuevo, 0)).getUTCDate();
  const dNuevo = Math.min(d, ultimoDia);
  return `${yNuevo}-${String(mNuevo).padStart(2, '0')}-${String(dNuevo).padStart(2, '0')}`;
}

/**
 * Extrae "YYYY-MM-DD" en hora de Lima de un valor cualquiera (ISO, Date, "YYYY-MM-DD").
 * Útil para inicializar <input type="date"> a partir de datos del backend.
 */
export function toYMDLima(dateLike) {
  if (!dateLike) return '';
  const partes = partesFechaSimple(dateLike);
  if (partes) return `${partes[0]}-${partes[1]}-${partes[2]}`;
  const d = new Date(dateLike);
  if (isNaN(d)) return '';
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit'
  }).format(d);
}

/**
 * Devuelve los códigos de ascensores del servicio (relación M-N).
 * Acepta cualquier entidad que tenga `.ascensores: [{ ascensor: { codigo } }]`.
 */
export function codigosAscensores(servicio) {
  if (!servicio?.ascensores) return [];
  return servicio.ascensores.map(a => a.ascensor?.codigo).filter(Boolean);
}

/**
 * Resumen visual: si hay 1 ascensor, devuelve su código; si hay N>1, devuelve
 * "PRIMERO (+N-1)"; si hay 0, devuelve "—". Útil para tablas/listas.
 */
export function resumenAscensores(servicio) {
  const codigos = codigosAscensores(servicio);
  if (codigos.length === 0) return '—';
  if (codigos.length === 1) return codigos[0];
  return `${codigos[0]} (+${codigos.length - 1})`;
}

export function badgeEstado(estado) {
  const e = (estado || '').toLowerCase();
  if (
    e.includes('finaliz') || e.includes('pagad') || e.includes('cerrad') ||
    e.includes('realizad') || e === 'aprobado' || e === 'terminado'
  ) return 'badge-green';
  if (
    e.includes('curso') || e.includes('camino') || e.includes('asignad') ||
    e.includes('emisión') || e.includes('emitid') || e === 'aceptado' ||
    e === 'ejecución'
  ) return 'badge-blue';
  if (e.includes('pendien') || e.includes('checklist') || e === 'cotizado') return 'badge-amber';
  if (
    e.includes('mora') || e.includes('vencid') || e.includes('cancel') ||
    e.includes('fuera') || e === 'rechazado'
  ) return 'badge-red';
  if (e.includes('observ')) return 'badge-violet';
  return 'badge-gray';
}

export function formatDiasEjecucion(d) {
  if (d === null || d === undefined || d === '') return '—';
  const n = Number(d);
  if (!Number.isFinite(n)) return '—';
  if (n < 1) return `${(n * 24).toFixed(1)} h`;
  return `${n.toFixed(1)} d`;
}

/**
 * Normaliza entrada de un campo de teléfono peruano (celular):
 * - Solo dígitos, primer dígito obligatorio 9, máximo 9 dígitos.
 * - Tolerante a pegado: descarta caracteres no numéricos y dígitos iniciales
 *   que no sean 9 (ej. "+51 987 654 321" → "987654321").
 * Devuelve string de hasta 9 dígitos. Guardar tal cual en el form state;
 * usar formatTelefono al pasar al input para mostrar con espacios.
 */
export function sanearTelefono(value) {
  const d = String(value || '').replace(/\D/g, '');
  let i = 0;
  while (i < d.length && d[i] !== '9') i++;
  return d.slice(i, i + 9);
}

/**
 * Formatea para mostrar: agrupa de a 3 dígitos separados por espacio.
 * "987654321" → "987 654 321". Acepta valores parciales/legacy y solo agrupa
 * los dígitos que tenga.
 */
export function formatTelefono(value) {
  if (value === null || value === undefined) return '';
  const d = String(value).replace(/\D/g, '');
  if (!d) return '';
  if (d.length <= 3) return d;
  if (d.length <= 6) return `${d.slice(0, 3)} ${d.slice(3)}`;
  return `${d.slice(0, 3)} ${d.slice(3, 6)} ${d.slice(6, 9)}`;
}
