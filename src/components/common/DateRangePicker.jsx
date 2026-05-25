import { useEffect, useMemo, useRef, useState } from 'react';
import { formatFecha, hoyISO } from '../../utils/formatters.js';

/**
 * Selector de rango de fechas con UN solo calendario. El primer click fija la
 * fecha de inicio; el segundo, la de fin (si es anterior al inicio se invierten).
 * Sin dependencias: la grilla se arma manualmente, igual que los calendarios de
 * Cobros/Calendario. Trabaja en espacio de "fecha pura" (YYYY-MM-DD), sin husos.
 *
 * Props:
 *   - desde, hasta: 'YYYY-MM-DD' | '' (controlado desde el padre)
 *   - onChange: ({ desde, hasta }) => void
 *   - placeholder, className
 */
const DIAS_SEMANA = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];

// 'YYYY-MM-DD' a partir de los componentes locales del Date (sin conversión TZ).
function ymd(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

// 'YYYY-MM-DD' a Date local (medianoche local), o null.
function parseYMD(s) {
  if (!s) return null;
  const [y, m, d] = s.split('-').map(Number);
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d);
}

// Grilla de 6 semanas (lunes a domingo) que cubre el mes de `date`.
function diasDelCalendario(date) {
  const inicioMes = new Date(date.getFullYear(), date.getMonth(), 1);
  const finMes = new Date(date.getFullYear(), date.getMonth() + 1, 0);
  const dias = [];
  const inicioGrid = new Date(inicioMes);
  inicioGrid.setDate(inicioMes.getDate() - ((inicioMes.getDay() + 6) % 7));
  const finGrid = new Date(finMes);
  finGrid.setDate(finMes.getDate() + (7 - (finMes.getDay() === 0 ? 7 : finMes.getDay())));
  const cur = new Date(inicioGrid);
  while (cur <= finGrid) {
    dias.push(new Date(cur));
    cur.setDate(cur.getDate() + 1);
  }
  return dias;
}

export default function DateRangePicker({
  desde = '',
  hasta = '',
  onChange,
  placeholder = 'Rango de fechas',
  className = ''
}) {
  const [abierto, setAbierto] = useState(false);
  const [cursor, setCursor] = useState(() => parseYMD(desde) || parseYMD(hasta) || new Date());
  const contRef = useRef(null);

  // Cerrar al hacer click fuera.
  useEffect(() => {
    const onDocClick = (e) => {
      if (contRef.current && !contRef.current.contains(e.target)) setAbierto(false);
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, []);

  // Al abrir, posicionar el calendario sobre el inicio del rango (o el mes actual).
  useEffect(() => {
    if (abierto) setCursor(parseYMD(desde) || parseYMD(hasta) || new Date());
  }, [abierto]); // eslint-disable-line react-hooks/exhaustive-deps

  const dias = useMemo(() => diasDelCalendario(cursor), [cursor]);
  const hoyKey = hoyISO();
  const mesCursor = cursor.getMonth();
  const mesLabel = new Intl.DateTimeFormat('es-PE', { month: 'long', year: 'numeric' }).format(cursor);

  const seleccionarDia = (d) => {
    const key = ymd(d);
    // Sin inicio, o rango ya completo → empezar uno nuevo.
    if (!desde || (desde && hasta)) {
      onChange?.({ desde: key, hasta: '' });
      return;
    }
    // Hay inicio y falta fin → fijar fin (invirtiendo si quedó antes del inicio).
    if (key < desde) onChange?.({ desde: key, hasta: desde });
    else onChange?.({ desde, hasta: key });
    setAbierto(false);
  };

  const limpiar = (e) => {
    e.stopPropagation();
    onChange?.({ desde: '', hasta: '' });
  };

  const etiqueta = desde && hasta
    ? `${formatFecha(desde)} → ${formatFecha(hasta)}`
    : desde
      ? `Desde ${formatFecha(desde)}`
      : hasta
        ? `Hasta ${formatFecha(hasta)}`
        : '';

  return (
    <div ref={contRef} className={`relative ${className}`}>
      <button
        type="button"
        onClick={() => setAbierto(a => !a)}
        className="input pr-8 text-left w-full truncate"
        title={etiqueta || placeholder}
      >
        {etiqueta || <span className="text-slate-400">{placeholder}</span>}
      </button>
      {(desde || hasta) && (
        <button
          type="button"
          onClick={limpiar}
          className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700"
          aria-label="Limpiar rango"
        >×</button>
      )}

      {abierto && (
        <div className="absolute z-30 mt-1 w-72 rounded-lg border border-slate-200 bg-white shadow-lg p-3">
          <div className="flex items-center justify-between mb-2">
            <button type="button" onClick={() => setCursor(c => new Date(c.getFullYear(), c.getMonth() - 1, 1))}
              className="h-7 w-7 rounded-md border border-slate-200 text-slate-600 hover:bg-slate-50" aria-label="Mes anterior">‹</button>
            <span className="text-sm font-medium capitalize">{mesLabel}</span>
            <button type="button" onClick={() => setCursor(c => new Date(c.getFullYear(), c.getMonth() + 1, 1))}
              className="h-7 w-7 rounded-md border border-slate-200 text-slate-600 hover:bg-slate-50" aria-label="Mes siguiente">›</button>
          </div>

          <div className="grid grid-cols-7 text-[10px] uppercase font-semibold text-slate-400 mb-1">
            {DIAS_SEMANA.map(d => <div key={d} className="text-center py-1">{d}</div>)}
          </div>
          <div className="grid grid-cols-7 gap-0.5">
            {dias.map((d, i) => {
              const key = ymd(d);
              const esOtroMes = d.getMonth() !== mesCursor;
              const esHoy = key === hoyKey;
              const esInicio = key === desde;
              const esFin = key === hasta;
              const enRango = desde && hasta && key > desde && key < hasta;
              const extremo = esInicio || esFin;
              return (
                <button
                  type="button"
                  key={i}
                  onClick={() => seleccionarDia(d)}
                  className={[
                    'h-8 text-xs rounded-md transition focus:outline-none focus:ring-2 focus:ring-brand-300',
                    extremo ? 'bg-brand-600 text-white font-semibold'
                      : enRango ? 'bg-brand-100 text-brand-700'
                        : esOtroMes ? 'text-slate-300 hover:bg-slate-50'
                          : 'text-slate-700 hover:bg-slate-100',
                    esHoy && !extremo ? 'ring-1 ring-brand-300' : ''
                  ].join(' ')}
                >
                  {d.getDate()}
                </button>
              );
            })}
          </div>

          <div className="flex items-center justify-between mt-3 pt-2 border-t border-slate-100">
            <span className="text-[11px] text-slate-500">
              {!desde ? 'Elige la fecha de inicio' : !hasta ? 'Elige la fecha de fin' : etiqueta}
            </span>
            <div className="flex gap-2">
              {(desde || hasta) && (
                <button type="button" onClick={limpiar} className="text-xs text-slate-500 hover:underline">Limpiar</button>
              )}
              <button type="button" onClick={() => setAbierto(false)} className="text-xs text-brand-700 hover:underline">Cerrar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
