/**
 * Lista de ascensores con checkbox y monto editable por ascensor. Componente
 * presentacional controlado: el estado (mapa `seleccion`) y los handlers viven
 * en el formulario padre (ver utils/ascensoresSeleccion.js). Compartido por
 * "Nuevo servicio/proyecto" y "Nuevo plan de mantenimiento".
 *
 * Props:
 *   - ascensores: lista de ascensores elegibles (ya filtrada por cliente)
 *   - seleccion:  { [id]: { monto, manual } }
 *   - onToggle(id), onMonto(id, valor)
 *   - disabled:   solo lectura (p. ej. al editar un plan)
 *   - sinClienteHint / sinAscensoresHint: textos cuando no aplica
 *   - hayCliente: si ya se eligió cliente (para mostrar el hint correcto)
 */
export default function AscensoresChecklist({
  ascensores,
  seleccion,
  onToggle,
  onMonto,
  disabled = false,
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
    <div className="rounded-lg ring-1 ring-slate-200 divide-y divide-slate-100 max-h-64 overflow-y-auto scroll-thin">
      {ascensores.map(a => {
        const sel = seleccion[a.id];
        const marcado = !!sel;
        return (
          <label key={a.id} className={`flex items-center gap-3 p-2.5 ${disabled ? 'cursor-default' : 'cursor-pointer'} ${marcado ? 'bg-brand-50/60' : 'bg-white'}`}>
            <input type="checkbox" checked={marcado} disabled={disabled} onChange={() => onToggle(a.id)} />
            <div className="flex-1 min-w-0">
              <div className="font-mono text-sm text-slate-800">{a.codigo}</div>
              <div className="text-xs text-slate-500 truncate">{a.ubicacion || a.tipo || '—'}</div>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-xs text-slate-500">S/</span>
              <input
                type="number"
                step="0.01"
                min="0"
                className="input w-28 text-right font-mono"
                value={sel?.monto || ''}
                onChange={e => onMonto(a.id, e.target.value)}
                disabled={!marcado || disabled}
                placeholder="0.00"
              />
              {sel?.manual && <span className="text-[10px] uppercase tracking-wider text-amber-700">manual</span>}
            </div>
          </label>
        );
      })}
    </div>
  );
}
