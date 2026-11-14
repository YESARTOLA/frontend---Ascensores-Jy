import { formatFecha } from '../../utils/formatters.js';

/**
 * Columna "Fecha servicio" de Contabilidad, Facturas y Gestión de cobros.
 *
 * Arriba, la fecha de PROGRAMACIÓN del servicio (la que filtra el rango "Fecha
 * de servicio"); debajo, más pequeña, la de EJECUCIÓN (inicio real del trabajo),
 * solo si ya se ejecutó. Las dos las calcula el backend con el mismo criterio
 * (utils/fechaServicioContable.js): `fecha_programacion` y `fecha_ejecucion`.
 *
 * Una factura de plan cubre varios mantenimientos: entonces cada fecha puede
 * ser un rango (primera → última), que se muestra como "al dd/mm/aaaa" debajo.
 *
 * Props:
 *   - programacion       fecha programada (día puro) o null
 *   - programacionHasta  última fecha programada, si es un rango
 *   - ejecucion          inicio real o null (aún sin ejecutar)
 *   - ejecucionHasta     último inicio real, si es un rango
 *   - vacio              texto cuando no hay fecha de programación
 *   - title              tooltip de la celda (p. ej. el detalle por servicio)
 */
export const AYUDA_FECHA_SERVICIO = 'Fecha de programación del servicio; debajo, la de ejecución (inicio real), si ya se ejecutó';

export const textoFechaEjecucion = (ejecucion) => (ejecucion ? `Ejec. ${formatFecha(ejecucion)}` : '');

// "dd/mm/aaaa al dd/mm/aaaa", o la fecha sola si el rango es de un día.
export const textoRangoFecha = (desde, hasta) => {
  if (!desde) return '';
  const a = formatFecha(desde);
  const b = hasta ? formatFecha(hasta) : a;
  return b !== a ? `${a} al ${b}` : a;
};

// Segunda fecha de un rango, o null si coincide con la primera (mismo día).
const finDeRango = (desde, hasta) => {
  if (!desde || !hasta) return null;
  const b = formatFecha(hasta);
  return b !== formatFecha(desde) ? b : null;
};

export default function FechaServicioCelda({
  programacion, programacionHasta, ejecucion, ejecucionHasta, vacio = '— (sin programar)', title
}) {
  const progHasta = finDeRango(programacion, programacionHasta);
  const ejecHasta = finDeRango(ejecucion, ejecucionHasta);
  return (
    <span className="block" title={title}>
      {programacion
        ? <span className="block whitespace-nowrap" title={title ? undefined : 'Fecha de programación'}>{formatFecha(programacion)}</span>
        : <span className="block text-slate-400 italic whitespace-nowrap">{vacio}</span>}
      {progHasta && <span className="block text-[11px] text-slate-500 whitespace-nowrap">al {progHasta}</span>}
      {ejecucion && (
        <span className="block text-[10px] text-slate-500 whitespace-nowrap mt-0.5" title={title ? undefined : 'Fecha de ejecución (inicio real del servicio)'}>
          {textoFechaEjecucion(ejecucion)}
          {ejecHasta && <span className="block">al {ejecHasta}</span>}
        </span>
      )}
    </span>
  );
}
