import { formatFecha } from '../../utils/formatters.js';

/**
 * Columna "Fecha servicio" de Contabilidad y de Gestión de cobros.
 *
 * Arriba, la fecha de PROGRAMACIÓN del servicio (la que filtra el rango "Fecha
 * de servicio"); debajo, más pequeña, la de EJECUCIÓN (inicio real del trabajo),
 * solo si ya se ejecutó. Las dos las calcula el backend con el mismo criterio
 * (utils/fechaServicioContable.js): `fecha_programacion` y `fecha_ejecucion`.
 *
 * Props:
 *   - programacion  fecha programada (día puro) o null
 *   - ejecucion     inicio real o null (aún sin ejecutar)
 *   - vacio         texto cuando no hay fecha de programación
 */
export const AYUDA_FECHA_SERVICIO = 'Fecha de programación del servicio; debajo, la de ejecución (inicio real), si ya se ejecutó';

export const textoFechaEjecucion = (ejecucion) => (ejecucion ? `Ejec. ${formatFecha(ejecucion)}` : '');

export default function FechaServicioCelda({ programacion, ejecucion, vacio = '— (sin programar)' }) {
  return (
    <>
      {programacion
        ? <span className="whitespace-nowrap" title="Fecha de programación">{formatFecha(programacion)}</span>
        : <span className="text-slate-400 italic whitespace-nowrap">{vacio}</span>}
      {ejecucion && (
        <span className="block text-[10px] text-slate-500 whitespace-nowrap mt-0.5" title="Fecha de ejecución (inicio real del servicio)">
          {textoFechaEjecucion(ejecucion)}
        </span>
      )}
    </>
  );
}
