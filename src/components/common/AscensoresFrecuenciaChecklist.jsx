import { nombreEdificio } from '../../utils/formatters.js';
import { etiquetaVisitas } from '../../utils/frecuenciaPlan.js';

/**
 * Selección de los ascensores de un PLAN DE MANTENIMIENTO, cada uno con SU
 * PROPIA frecuencia. Un mismo plan puede llevar un ascensor mensual, otro
 * trimestral y otro quincenal; el número de visitas de cada uno sale de cruzar
 * su frecuencia con la duración del plan en meses.
 *
 * A diferencia de `AscensoresChecklist` (servicios y proyectos), el precio no
 * sale del catálogo: por defecto el plan se cobra por un monto global mensual,
 * así que un ascensor sin tarifa configurada sí es seleccionable. En un plan
 * con precio POR ASCENSOR (`conPrecio`) cada fila marcada pide su precio: lo
 * que se cobra por ese ascensor en cada mes en que se le atiende.
 *
 * Componente presentacional controlado: el estado vive en el formulario padre.
 *
 * Props:
 *   - ascensores:  lista de ascensores elegibles (ya filtrada por cliente)
 *   - seleccion:   { [id]: { frecuencia, frecuencia_dias_custom } }
 *   - frecuencias: catálogo del backend [{ codigo, etiqueta, unidad, por_mes, cada_meses }]
 *   - duracionMeses: meses del plan (para anticipar el nº de visitas)
 *   - onToggle(id): marca/desmarca el ascensor
 *   - onCambiarFrecuencia(id, parcial): actualiza { frecuencia } o { frecuencia_dias_custom }
 *   - disabled:    solo lectura total
 *   - soloFrecuencia: el conjunto de ascensores es inmutable (edición de un plan
 *                 ya creado) pero SÍ se puede corregir la frecuencia de cada uno
 *   - hayCliente:  si ya se eligió cliente (para el hint correcto)
 *   - conPrecio:   muestra el precio de cada ascensor marcado (`seleccion[id].monto`)
 *   - onCambiarPrecio(id, valor): actualiza el precio del ascensor
 *   - simboloMoneda: prefijo del campo de precio ("S/", "$")
 */
export default function AscensoresFrecuenciaChecklist({
  ascensores,
  seleccion,
  frecuencias = [],
  duracionMeses,
  onToggle,
  onCambiarFrecuencia,
  disabled = false,
  soloFrecuencia = false,
  hayCliente = true,
  conPrecio = false,
  onCambiarPrecio,
  simboloMoneda = '',
  sinClienteHint = 'Seleccione primero un cliente.',
  sinAscensoresHint = 'Este cliente no tiene ascensores registrados.'
}) {
  if (!hayCliente) {
    return <div className="rounded-lg border border-slate-200 bg-slate-50 text-slate-500 text-xs p-3">{sinClienteHint}</div>;
  }
  if (!ascensores || ascensores.length === 0) {
    return <div className="rounded-lg border border-slate-200 bg-slate-50 text-slate-500 text-xs p-3">{sinAscensoresHint}</div>;
  }

  return (
    <div className="rounded-lg ring-1 ring-slate-200 divide-y divide-slate-100 max-h-72 overflow-y-auto scroll-thin">
      {ascensores.map(a => {
        const sel = seleccion[a.id];
        const marcado = !!sel;
        const frec = frecuencias.find(f => f.codigo === sel?.frecuencia) || null;
        const esCustom = frec?.unidad === 'custom';

        return (
          <div key={a.id} className={marcado ? 'bg-brand-50/60' : 'bg-white'}>
            <div className="flex items-center gap-3 p-2.5">
              <input
                type="checkbox"
                className={disabled || soloFrecuencia ? 'cursor-default' : 'cursor-pointer'}
                checked={marcado}
                disabled={disabled || soloFrecuencia}
                onChange={() => onToggle(a.id)}
              />
              <div className="flex-1 min-w-0">
                <div className="flex items-baseline gap-2 min-w-0">
                  <span className="font-mono text-sm text-slate-800 shrink-0">{a.codigo}</span>
                  {nombreEdificio(a.edificio) && (
                    <span className="text-xs text-slate-400 truncate">· {nombreEdificio(a.edificio)}</span>
                  )}
                </div>
                <div className="text-xs text-slate-500 truncate">{a.ubicacion || a.tipo || '—'}</div>
              </div>

              {marcado && (
                <div className="flex items-center gap-2 shrink-0">
                  <select
                    className="rounded-md border border-slate-300 text-xs px-2 py-1"
                    value={sel.frecuencia || ''}
                    disabled={disabled}
                    onChange={e => onCambiarFrecuencia(a.id, { frecuencia: e.target.value })}
                    aria-label={`Frecuencia de ${a.codigo}`}
                  >
                    {frecuencias.map(f => <option key={f.codigo} value={f.codigo}>{f.etiqueta}</option>)}
                  </select>
                  {esCustom && (
                    <input
                      type="number"
                      min="1"
                      step="1"
                      className="w-16 rounded-md border border-slate-300 text-xs px-2 py-1"
                      value={sel.frecuencia_dias_custom || ''}
                      disabled={disabled}
                      placeholder="días"
                      onChange={e => onCambiarFrecuencia(a.id, { frecuencia_dias_custom: e.target.value })}
                      aria-label={`Días entre mantenimientos de ${a.codigo}`}
                    />
                  )}
                  <span className="text-[11px] text-slate-600 w-20 text-right tabular-nums">
                    {etiquetaVisitas(frec, duracionMeses, sel.frecuencia_dias_custom)}
                  </span>
                </div>
              )}
            </div>
            {/* Precio del ascensor: en su propia línea para que la fila no se
                desborde en móvil con frecuencia + días + visitas + precio. */}
            {marcado && conPrecio && (
              <div className="flex items-center justify-end gap-2 px-2.5 pb-2.5 -mt-1">
                <label htmlFor={`precio-asc-${a.id}`} className="text-[11px] text-slate-500">
                  Precio por mes atendido
                </label>
                <div className="flex items-center rounded-md border border-slate-300 bg-white overflow-hidden">
                  {simboloMoneda && <span className="px-2 text-xs text-slate-500 bg-slate-50 border-r border-slate-200">{simboloMoneda}</span>}
                  <input
                    id={`precio-asc-${a.id}`}
                    type="number"
                    min="0"
                    step="0.01"
                    required
                    className="w-28 text-xs px-2 py-1 text-right font-mono outline-none"
                    value={sel.monto ?? ''}
                    disabled={disabled}
                    placeholder="0.00"
                    onChange={e => onCambiarPrecio?.(a.id, e.target.value)}
                    aria-label={`Precio de ${a.codigo}`}
                  />
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
