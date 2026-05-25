import { useEffect, useRef, useState } from 'react';
import { DayPicker } from 'react-day-picker';
import { es } from 'date-fns/locale';
import 'react-day-picker/style.css';

// Color de acento del calendario, alineado con el teal de marca (brand-600)
// usado en el resto de la UI. Se inyecta como variable CSS de react-day-picker.
const ACCENT = '#4d8093';

const pad2 = (n) => String(n).padStart(2, '0');

// Date -> "YYYY-MM-DD" usando las partes locales (sin desfase de huso): el
// usuario elige un día calendario, no un instante.
function dateToYMD(d) {
  if (!d) return '';
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

// "YYYY-MM-DD" -> Date local a medianoche (sin desfase de huso).
function ymdToDate(s) {
  if (!s) return undefined;
  const [y, m, d] = String(s).slice(0, 10).split('-').map(Number);
  if (!y || !m || !d) return undefined;
  return new Date(y, m - 1, d);
}

// "YYYY-MM-DD" -> "DD/MM/YYYY" para mostrar (no usa Date, evita drift de TZ).
function ymdLegible(s) {
  if (!s) return '';
  const [y, m, d] = String(s).slice(0, 10).split('-');
  return `${d}/${m}/${y}`;
}

/**
 * Selector de rango de fechas con UN SOLO calendario: el primer clic fija el
 * inicio y el segundo el fin. Controlado por las props `desde`/`hasta`
 * ("YYYY-MM-DD" o ''), notifica cambios vía `onChange({ desde, hasta })`.
 */
export default function RangeCalendar({ desde, hasta, onChange, placeholder = 'Rango de fechas' }) {
  const [abierto, setAbierto] = useState(false);
  const contenedorRef = useRef(null);

  useEffect(() => {
    if (!abierto) return;
    const alClickFuera = (e) => {
      if (contenedorRef.current && !contenedorRef.current.contains(e.target)) setAbierto(false);
    };
    document.addEventListener('mousedown', alClickFuera);
    return () => document.removeEventListener('mousedown', alClickFuera);
  }, [abierto]);

  const seleccionado = (desde || hasta)
    ? { from: ymdToDate(desde), to: ymdToDate(hasta) }
    : undefined;

  const alSeleccionar = (rango) => {
    onChange({ desde: dateToYMD(rango?.from), hasta: dateToYMD(rango?.to) });
  };

  const etiqueta = desde || hasta
    ? `${ymdLegible(desde) || '…'} – ${ymdLegible(hasta) || '…'}`
    : placeholder;

  return (
    <div className="relative" ref={contenedorRef}>
      <button type="button" onClick={() => setAbierto(o => !o)}
        className="input flex items-center justify-between gap-2 w-full text-left">
        <span className={desde || hasta ? 'text-slate-800' : 'text-slate-400'}>{etiqueta}</span>
        <span className="text-slate-400 shrink-0">📅</span>
      </button>

      {abierto && (
        <div className="absolute z-30 mt-1 rounded-lg bg-white shadow-lg ring-1 ring-slate-200 p-2"
          style={{ '--rdp-accent-color': ACCENT, '--rdp-accent-background-color': `${ACCENT}1a` }}>
          <DayPicker
            mode="range"
            locale={es}
            numberOfMonths={1}
            selected={seleccionado}
            onSelect={alSeleccionar}
            captionLayout="dropdown"
            startMonth={new Date(2020, 0)}
            endMonth={new Date(2035, 11)}
          />
          <div className="flex justify-between items-center px-2 pb-1">
            <button type="button"
              onClick={() => { onChange({ desde: '', hasta: '' }); }}
              className="text-xs text-slate-500 hover:underline">Limpiar</button>
            <button type="button"
              onClick={() => setAbierto(false)}
              className="btn-primary text-xs !py-1 !px-3">Listo</button>
          </div>
        </div>
      )}
    </div>
  );
}
