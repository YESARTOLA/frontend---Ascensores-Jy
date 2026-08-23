import { nombreEdificio } from '../../utils/formatters.js';
import { etiquetaVisitas } from '../../utils/frecuenciaPlan.js';

/**
 * Selección de los ascensores de un PLAN DE MANTENIMIENTO, cada uno con SU
 * PROPIA frecuencia. Un mismo plan puede llevar un ascensor mensual, otro
 * trimestral y otro quincenal; el número de visitas de cada uno sale de cruzar
 * su frecuencia con la duración del plan en meses.
 *
 * A diferencia de `AscensoresChecklist` (servicios y proyectos), aquí NO hay
 * precio por ascensor: el plan se cobra por un monto global mensual. Por eso un
 * ascensor sin tarifa configurada sí es seleccionable.
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
          </div>
        );
      })}
    </div>
  );
}
