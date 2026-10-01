import { useState } from 'react';
import { assetUrl } from '../../services';
import { formatMonto } from '../../utils/formatters.js';
import { useToast } from '../common/Toast.jsx';
import BarraProgresoCarga from '../common/BarraProgresoCarga.jsx';

/**
 * Editor de los ítems de una cotización. Lo comparten el alta ("Nueva
 * cotización") y la edición de una versión en Cotizado (detalle).
 *
 * El orden de la lista ES el orden de la cotización: al guardar, cada ítem
 * viaja con `orden` = su posición (ver `itemsParaPayload`) y el detalle, el PDF
 * y el servicio generado los listan por ese campo. Por eso cada fila puede
 * moverse arriba/abajo (▲ ▼) e insertar un ítem nuevo justo debajo (+).
 *
 * Props:
 *   items:       ítems con la forma de `itemVacio`
 *   setItems:    recibe un updater (arr => nuevoArr), como un setState
 *   moneda:      para pintar el importe de cada fila
 *   cargaFoto:   instancia de useCargaArchivos del padre, que la usa para
 *                bloquear el guardado mientras una foto sigue subiendo
 *   placeholder: texto de la descripción vacía
 *   tituloFoto:  tooltip del enlace "+ Foto"
 */

// Clave estable de cada fila, solo de UI (no viaja al backend). Hace falta
// porque las filas se insertan y se reordenan: con el índice como `key`, una
// foto que termina de subir después de mover la fila caería en otro ítem.
let secuenciaClave = 0;
const nuevaClave = () => `item-${++secuenciaClave}`;

export const itemVacio = () => ({
  _key: nuevaClave(),
  descripcion: '',
  cantidad: 1,
  unidad: 'Unidad',
  precio_unitario: 0,
  descuento_porcentaje: 0,
  // Foto del ítem (opcional al cotizar; obligatoria al aprobar). `archivo` es el
  // objeto subido para previsualizar; `id_archivo` es lo que se envía al backend.
  id_archivo: null,
  archivo: null
});

// Ítem guardado de una versión → forma del editor (duplicar / editar versión).
export const itemDesdeServidor = (it) => ({
  _key: nuevaClave(),
  descripcion: it.descripcion || '',
  cantidad: Number(it.cantidad) || 1,
  unidad: it.unidad || 'Unidad',
  precio_unitario: Number(it.precio_unitario) || 0,
  descuento_porcentaje: Number(it.descuento_porcentaje) || 0,
  id_archivo: it.id_archivo || null,
  archivo: it.archivo || null
});

// Ítems a enviar: se descartan las filas sin descripción y el `orden` sale de
// la posición en la lista, que es lo que el usuario ordenó en pantalla.
export const itemsParaPayload = (items) => items
  .filter(it => it.descripcion.trim())
  .map((it, i) => ({
    orden: i + 1,
    descripcion: it.descripcion,
    cantidad: Number(it.cantidad) || 1,
    unidad: it.unidad || 'Unidad',
    precio_unitario: Number(it.precio_unitario) || 0,
    descuento_porcentaje: Number(it.descuento_porcentaje) || 0,
    id_archivo: it.id_archivo || null
  }));

function round2(n) {
  return Math.round((Number(n) + Number.EPSILON) * 100) / 100;
}

export function calcImporte(it) {
  const cant = Number(it.cantidad) || 0;
  const pu = Number(it.precio_unitario) || 0;
  const desc = Number(it.descuento_porcentaje) || 0;
  return round2(cant * pu * (1 - desc / 100));
}

const BOTON_MOVER = 'text-[10px] leading-none px-1 hover:text-brand-700 disabled:opacity-25 disabled:pointer-events-none';

export default function ItemsCotizacionEditor({
  items, setItems, moneda, cargaFoto,
  placeholder = 'Descripción del item', tituloFoto = 'Subir foto del ítem'
}) {
  const toast = useToast();
  // Fila recién creada: su descripción toma el foco al montarse.
  const [enfocar, setEnfocar] = useState(null);

  const cambiar = (key, campo, val) =>
    setItems(arr => arr.map(it => it._key === key ? { ...it, [campo]: val } : it));
  const agregar = () => {
    const nuevo = itemVacio();
    setItems(arr => [...arr, nuevo]);
    setEnfocar(nuevo._key);
  };
  const insertarDebajo = (key) => {
    const nuevo = itemVacio();
    setItems(arr => {
      const i = arr.findIndex(it => it._key === key);
      return [...arr.slice(0, i + 1), nuevo, ...arr.slice(i + 1)];
    });
    setEnfocar(nuevo._key);
  };
  const mover = (key, delta) => setItems(arr => {
    const i = arr.findIndex(it => it._key === key);
    const j = i + delta;
    if (i < 0 || j < 0 || j >= arr.length) return arr;
    const copia = [...arr];
    [copia[i], copia[j]] = [copia[j], copia[i]];
    return copia;
  });
  const quitar = (key) => setItems(arr => arr.filter(it => it._key !== key));

  const subirFoto = async (key, e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      const arch = await cargaFoto.subirUno(file, 'cotizaciones');
      setItems(arr => arr.map(it => it._key === key ? { ...it, id_archivo: arch.id, archivo: arch } : it));
    } catch (err) {
      if (!err?.cancelado) toast.error('Error al subir la foto del ítem');
    }
  };
  const quitarFoto = (key) =>
    setItems(arr => arr.map(it => it._key === key ? { ...it, id_archivo: null, archivo: null } : it));

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <label className="label !mb-0">Items</label>
        <button type="button" onClick={agregar} className="btn-ghost text-xs !py-1.5 !px-3">+ Agregar item</button>
      </div>
      <div className="hidden sm:flex gap-2 pb-1.5 mb-1 border-b border-carbon-100 text-[10px] font-semibold uppercase tracking-wider text-carbon-500">
        <div className="w-7 shrink-0 text-center">#</div>
        <div className="flex-1 grid grid-cols-12 gap-2">
          <div className="col-span-4">Descripción</div>
          <div className="col-span-1 text-right">Cant.</div>
          <div className="col-span-1">Unidad</div>
          <div className="col-span-2 text-right">P. unitario</div>
          <div className="col-span-1 text-right">% dscto</div>
          <div className="col-span-1 text-right">Importe</div>
          <div className="col-span-1 text-center">Foto</div>
          <div className="col-span-1"></div>
        </div>
      </div>
      <div className="space-y-2">
        {items.map((it, idx) => (
          <div key={it._key} className="flex gap-2 items-start">
            {/* Posición del ítem y flechas para reordenarlo. */}
            <div className="w-7 shrink-0 flex flex-col items-center text-carbon-400">
              <button type="button" onClick={() => mover(it._key, -1)} disabled={idx === 0}
                className={BOTON_MOVER} title="Subir ítem" aria-label={`Subir ítem ${idx + 1}`}>▲</button>
              <span className="text-[11px] font-semibold text-carbon-500 tabular-nums py-0.5">{idx + 1}</span>
              <button type="button" onClick={() => mover(it._key, 1)} disabled={idx === items.length - 1}
                className={BOTON_MOVER} title="Bajar ítem" aria-label={`Bajar ítem ${idx + 1}`}>▼</button>
            </div>
            <div className="flex-1 min-w-0 grid grid-cols-12 gap-2 items-start">
              <textarea className="textarea col-span-12 sm:col-span-4" rows="1" placeholder={placeholder}
                autoFocus={it._key === enfocar}
                value={it.descripcion} onChange={e => cambiar(it._key, 'descripcion', e.target.value)} />
              <input type="number" step="0.01" className="input col-span-3 sm:col-span-1" placeholder="Cant."
                value={it.cantidad} onChange={e => cambiar(it._key, 'cantidad', e.target.value)} />
              <input className="input col-span-3 sm:col-span-1" placeholder="Unidad"
                value={it.unidad} onChange={e => cambiar(it._key, 'unidad', e.target.value)} />
              <input type="number" step="0.01" className="input col-span-3 sm:col-span-2" placeholder="P. unitario"
                value={it.precio_unitario} onChange={e => cambiar(it._key, 'precio_unitario', e.target.value)} />
              <input type="number" step="0.01" className="input col-span-3 sm:col-span-1" placeholder="% dscto"
                value={it.descuento_porcentaje} onChange={e => cambiar(it._key, 'descuento_porcentaje', e.target.value)} />
              <div className="col-span-8 sm:col-span-1 text-right text-sm font-medium pt-2">
                {formatMonto(calcImporte(it), moneda)}
              </div>
              <div className="col-span-2 sm:col-span-1 flex items-center justify-center pt-1">
                {it.archivo ? (
                  <img src={assetUrl(it.archivo.ruta_almacenamiento)} alt="foto ítem"
                    onClick={() => quitarFoto(it._key)} title="Clic para quitar la foto"
                    className="h-9 w-9 object-cover rounded ring-1 ring-slate-200 cursor-pointer" />
                ) : (
                  <label className="text-[11px] cursor-pointer hover:underline text-brand-700" title={tituloFoto}>
                    + Foto
                    <input type="file" accept="image/*" className="hidden" disabled={cargaFoto.subiendo} onChange={e => subirFoto(it._key, e)} />
                  </label>
                )}
              </div>
              <div className="col-span-2 sm:col-span-1 flex items-center justify-end gap-2 pt-1.5">
                <button type="button" onClick={() => insertarDebajo(it._key)}
                  className="text-carbon-400 hover:text-brand-700 text-lg leading-none"
                  title="Insertar un ítem debajo" aria-label={`Insertar un ítem debajo del ${idx + 1}`}>+</button>
                <button type="button" onClick={() => quitar(it._key)}
                  className="text-carbon-400 hover:text-red-600 text-lg leading-none"
                  title="Quitar ítem" aria-label={`Quitar ítem ${idx + 1}`}>×</button>
              </div>
            </div>
          </div>
        ))}
      </div>
      {items.length > 1 && (
        <p className="text-[11px] text-carbon-400 mt-2">
          El orden de la lista es el de la cotización y el PDF: ▲ ▼ mueven el ítem y + inserta uno nuevo debajo.
        </p>
      )}
      <BarraProgresoCarga carga={cargaFoto} className="mt-2" />
    </div>
  );
}
