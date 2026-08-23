import { useState } from 'react';
import { precioConfigurado } from '../../utils/ascensoresSeleccion.js';
import { formatMonto, nombreEdificio } from '../../utils/formatters.js';
import { useMonedas } from '../../hooks/useMonedas.js';

/**
 * Lista de ascensores con checkbox y su precio configurado para el subtipo de
 * servicio elegido. El precio no se reparte: cada ascensor aporta el suyo
 * (tbl_ascensores_precios). Un ascensor sin precio para el subtipo no es
 * seleccionable hasta que se le configure uno.
 *
 * Componente presentacional controlado: el estado (mapa `seleccion`) y los
 * handlers viven en el formulario padre. Compartido por "Nuevo servicio/proyecto"
 * y "Nuevo plan de mantenimiento".
 *
 * Props:
 *   - ascensores: lista de ascensores elegibles (ya filtrada por cliente), con `.precios`
 *   - seleccion:  { [id]: { monto } }
 *   - idTipoServicio: subtipo elegido (define el precio de cada ascensor)
 *   - onToggle(id, cfg): marca/desmarca; cfg = { precio, moneda } o null
 *   - disabled:   solo lectura (p. ej. al editar un plan)
 *   - hayCliente: si ya se eligió cliente (para mostrar el hint correcto)
 *   - single:     selección de UN solo ascensor (radio). Usado por el plan de
 *                 mantenimiento, que es de un único ascensor.
 *   - onGuardarPrecio(idAscensor, { precio, moneda }): OPCIONAL. Al pasarlo se
 *                 habilita la edición inline del precio en la propia fila. Debe
 *                 persistir el precio y devolver una promesa; el padre es quien
 *                 refresca el ascensor en su estado. Sin esta prop el componente
 *                 se comporta como una lista de solo lectura.
 */
export default function AscensoresChecklist({
  ascensores,
  seleccion,
  idTipoServicio,
  onToggle,
  disabled = false,
  hayCliente = true,
  single = false,
  onGuardarPrecio,
  sinClienteHint = 'Seleccione primero un cliente.',
  sinAscensoresHint = 'Este cliente no tiene ascensores registrados.'
}) {
  const monedas = useMonedas();
  // Fila en edición y su borrador. Solo una a la vez: editar otra descarta la anterior.
  const [editandoId, setEditandoId] = useState(null);
  const [borrador, setBorrador] = useState({ precio: '', moneda: '' });
  const [guardando, setGuardando] = useState(false);
  const [errorPrecio, setErrorPrecio] = useState('');

  const puedeEditarPrecio = typeof onGuardarPrecio === 'function' && !disabled;

  const abrirEditor = (idAscensor, cfg) => {
    setEditandoId(idAscensor);
    setBorrador({
      precio: cfg ? String(cfg.precio) : '',
      moneda: cfg?.moneda || monedas[0]?.codigo || ''
    });
    setErrorPrecio('');
  };

  const cerrarEditor = () => {
    setEditandoId(null);
    setBorrador({ precio: '', moneda: '' });
    setErrorPrecio('');
  };

  const guardar = async (idAscensor) => {
    const precio = Number(borrador.precio);
    if (!Number.isFinite(precio) || precio < 0) {
      setErrorPrecio('Ingrese un precio válido (0 o mayor).');
      return;
    }
    setGuardando(true);
    setErrorPrecio('');
    try {
      await onGuardarPrecio(idAscensor, { precio, moneda: borrador.moneda });
      cerrarEditor();
    } catch (e) {
      setErrorPrecio(e?.response?.data?.error || 'No se pudo guardar el precio.');
    } finally {
      setGuardando(false);
    }
  };

  if (!hayCliente) {
    return <div className="rounded-lg border border-slate-200 bg-slate-50 text-slate-500 text-xs p-3">{sinClienteHint}</div>;
  }
  if (!idTipoServicio) {
    return <div className="rounded-lg border border-slate-200 bg-slate-50 text-slate-500 text-xs p-3">Seleccione primero el subtipo de servicio para ver el precio de cada ascensor.</div>;
  }
  if (!ascensores || ascensores.length === 0) {
    return <div className="rounded-lg border border-slate-200 bg-slate-50 text-slate-500 text-xs p-3">{sinAscensoresHint}</div>;
  }

  return (
    <div className="rounded-lg ring-1 ring-slate-200 divide-y divide-slate-100 max-h-64 overflow-y-auto scroll-thin">
      {ascensores.map(a => {
        const sel = seleccion[a.id];
        const marcado = !!sel;
        const cfg = precioConfigurado(a, idTipoServicio);
        const sinPrecio = !cfg;
        // Sin precio configurado y sin forma de configurarlo aquí, la fila no se
        // puede seleccionar: el backend rechazaría el plan de todos modos.
        const bloqueado = disabled || (sinPrecio && !puedeEditarPrecio);
        const editando = editandoId === a.id;

        return (
          <div key={a.id} className={marcado ? 'bg-brand-50/60' : sinPrecio ? 'bg-slate-50/60' : 'bg-white'}>
            <div className="flex items-center gap-3 p-2.5">
              <input
                type={single ? 'radio' : 'checkbox'}
                name={single ? 'ascensor-unico' : undefined}
                className={bloqueado || sinPrecio ? 'cursor-default' : 'cursor-pointer'}
                checked={marcado}
                disabled={bloqueado || sinPrecio}
                onChange={() => onToggle(a.id, cfg)}
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
              <div className="text-right flex items-center gap-2 shrink-0">
                {sinPrecio ? (
                  <span className="text-[11px] text-amber-700">Sin precio para este subtipo</span>
                ) : cfg.precio == null ? (
                  // Rol sin visibilidad financiera: se confirma que el ascensor
                  // está tarifado (por eso es elegible) pero no se muestra cuánto.
                  <span className="text-[11px] text-emerald-700">Precio configurado</span>
                ) : (
                  <span className="font-mono text-sm text-slate-800">{formatMonto(cfg.precio, cfg.moneda)}</span>
                )}
                {puedeEditarPrecio && !editando && (
                  <button
                    type="button"
                    onClick={() => abrirEditor(a.id, cfg)}
                    className="text-[11px] text-brand-600 hover:text-brand-700 hover:underline"
                  >
                    {sinPrecio ? 'Configurar' : 'Editar'}
                  </button>
                )}
              </div>
            </div>

            {editando && (
              <div className="px-2.5 pb-2.5 pl-9 space-y-1.5">
                <div className="flex items-center gap-2">
                  <select
                    value={borrador.moneda}
                    onChange={e => setBorrador(b => ({ ...b, moneda: e.target.value }))}
                    disabled={guardando}
                    className="rounded-md border border-slate-300 text-xs px-2 py-1"
                  >
                    {monedas.map(m => <option key={m.codigo} value={m.codigo}>{m.codigo}</option>)}
                  </select>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    autoFocus
                    value={borrador.precio}
                    onChange={e => setBorrador(b => ({ ...b, precio: e.target.value }))}
                    disabled={guardando}
                    placeholder="0.00"
                    className="w-28 rounded-md border border-slate-300 text-sm font-mono px-2 py-1"
                  />
                  <button
                    type="button"
                    onClick={() => guardar(a.id)}
                    disabled={guardando || monedas.length === 0}
                    className="rounded-md bg-brand-600 text-white text-xs px-2.5 py-1 disabled:opacity-50"
                  >
                    {guardando ? 'Guardando…' : 'Guardar'}
                  </button>
                  <button
                    type="button"
                    onClick={cerrarEditor}
                    disabled={guardando}
                    className="text-xs text-slate-500 hover:text-slate-700 px-1"
                  >
                    Cancelar
                  </button>
                </div>
                <p className="text-[11px] text-slate-500">
                  Se guarda en la ficha del ascensor: cambia su tarifa para este subtipo en los próximos planes y servicios.
                </p>
                {errorPrecio && <p className="text-[11px] text-rose-600">{errorPrecio}</p>}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
