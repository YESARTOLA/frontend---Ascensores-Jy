import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { formatFecha, hoyISO } from '../../utils/formatters.js';

/**
 * Selector de rango de fechas con UN solo calendario. El primer click fija la
 * fecha de inicio; el segundo, la de fin (si es anterior al inicio se invierten).
 * Sin dependencias: la grilla se arma manualmente, igual que los calendarios de
 * Cobros/Calendario. Trabaja en espacio de "fecha pura" (YYYY-MM-DD), sin husos.
 *
 * Dos formas de elegir, en el mismo control:
 *   · por DÍAS  → vista de calendario (inicio y fin a mano);
 *   · por MES   → click en el nombre del mes para abrir la rejilla de meses del
 *                 año; al elegir uno, el rango queda del día 1 al último día de
 *                 ese mes. Es el caso habitual al cerrar un periodo, y a mano
 *                 obliga a acertar el último día (28/29/30/31).
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

// Etiquetas cortas de los meses, para la rejilla de selección por mes.
const MESES_CORTOS = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

// Primer y último día de un mes, en 'YYYY-MM-DD'. El último día se obtiene con
// el día 0 del mes siguiente, que resuelve solo los meses de 28/29/30/31.
function rangoDelMes(anio, mes) {
  return { desde: ymd(new Date(anio, mes, 1)), hasta: ymd(new Date(anio, mes + 1, 0)) };
}

// ¿El rango seleccionado es exactamente este mes completo?
function esMesCompleto(desde, hasta, anio, mes) {
  const r = rangoDelMes(anio, mes);
  return desde === r.desde && hasta === r.hasta;
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
  // 'dias' = calendario del mes; 'meses' = rejilla para elegir un mes entero.
  const [vista, setVista] = useState('dias');
  const [cursor, setCursor] = useState(() => parseYMD(desde) || parseYMD(hasta) || new Date());
  const contRef = useRef(null);
  const popupRef = useRef(null);

  // El popup se renderiza en un portal (document.body) con posición fija para
  // que quede SIEMPRE delante y no lo recorte el stacking-context de las cards
  // (que usan backdrop-blur). Posición calculada bajo el botón y acotada al viewport.
  const POPUP_W = 288; // = w-72
  const POPUP_H = 372; // alto aproximado del calendario
  const [pos, setPos] = useState({ top: 0, left: 0 });

  const posicionar = () => {
    const el = contRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    let left = Math.min(r.left, window.innerWidth - POPUP_W - 8);
    left = Math.max(8, left);
    let top = r.bottom + 4;
    // Si no cabe hacia abajo, abrir hacia arriba del botón.
    if (top + POPUP_H > window.innerHeight - 8) {
      const arriba = r.top - POPUP_H - 4;
      top = arriba >= 8 ? arriba : Math.max(8, window.innerHeight - POPUP_H - 8);
    }
    setPos({ top, left });
  };

  // Cerrar al hacer click fuera (contemplando el popup portaleado).
  useEffect(() => {
    const onDocClick = (e) => {
      const dentroBoton = contRef.current && contRef.current.contains(e.target);
      const dentroPopup = popupRef.current && popupRef.current.contains(e.target);
      if (!dentroBoton && !dentroPopup) setAbierto(false);
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, []);

  // Al abrir: posicionar el calendario sobre el inicio del rango y calcular su ubicación.
  useLayoutEffect(() => {
    if (abierto) { setCursor(parseYMD(desde) || parseYMD(hasta) || new Date()); setVista('dias'); posicionar(); }
  }, [abierto]); // eslint-disable-line react-hooks/exhaustive-deps

  // Reposicionar mientras está abierto si cambia el scroll o el tamaño de ventana.
  useEffect(() => {
    if (!abierto) return;
    const h = () => posicionar();
    window.addEventListener('resize', h);
    window.addEventListener('scroll', h, true);
    return () => { window.removeEventListener('resize', h); window.removeEventListener('scroll', h, true); };
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

  // Elegir un mes fija el rango completo de ese mes y cierra: es una selección
  // terminada, no el primer extremo de un rango a medio hacer.
  // El año va explícito: quien llama desde un atajo ("Este mes") no puede
  // apoyarse en `cursor`, que todavía tiene el valor previo al setCursor.
  const seleccionarMes = (mes, anio = cursor.getFullYear()) => {
    onChange?.(rangoDelMes(anio, mes));
    setCursor(new Date(anio, mes, 1));
    setVista('dias');
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

      {abierto && createPortal(
        <div
          ref={popupRef}
          style={{ position: 'fixed', top: pos.top, left: pos.left, width: POPUP_W }}
          className="z-50 rounded-lg border border-slate-200 bg-white shadow-lg p-3"
        >
          {/* En vista de días las flechas mueven de mes; en la de meses, de año. */}
          <div className="flex items-center justify-between mb-2">
            <button type="button"
              onClick={() => setCursor(c => (vista === 'meses'
                ? new Date(c.getFullYear() - 1, c.getMonth(), 1)
                : new Date(c.getFullYear(), c.getMonth() - 1, 1)))}
              className="h-7 w-7 rounded-md border border-slate-200 text-slate-600 hover:bg-slate-50"
              aria-label={vista === 'meses' ? 'Año anterior' : 'Mes anterior'}>‹</button>
            {/* El título abre/cierra la rejilla de meses: un click y el rango es
                el mes entero, sin tener que acertar el último día a mano. */}
            <button type="button"
              onClick={() => setVista(v => (v === 'dias' ? 'meses' : 'dias'))}
              className="text-sm font-medium capitalize px-2 py-0.5 rounded-md hover:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-brand-300"
              title={vista === 'dias' ? 'Elegir un mes completo' : 'Volver al calendario'}>
              {vista === 'meses' ? cursor.getFullYear() : mesLabel}
            </button>
            <button type="button"
              onClick={() => setCursor(c => (vista === 'meses'
                ? new Date(c.getFullYear() + 1, c.getMonth(), 1)
                : new Date(c.getFullYear(), c.getMonth() + 1, 1)))}
              className="h-7 w-7 rounded-md border border-slate-200 text-slate-600 hover:bg-slate-50"
              aria-label={vista === 'meses' ? 'Año siguiente' : 'Mes siguiente'}>›</button>
          </div>

          {vista === 'meses' ? (
            <div className="grid grid-cols-3 gap-1.5 py-1">
              {MESES_CORTOS.map((etiqueta, mes) => {
                const seleccionado = esMesCompleto(desde, hasta, cursor.getFullYear(), mes);
                return (
                  <button
                    type="button"
                    key={etiqueta}
                    onClick={() => seleccionarMes(mes)}
                    className={[
                      'h-10 text-xs rounded-md transition focus:outline-none focus:ring-2 focus:ring-brand-300',
                      seleccionado ? 'bg-brand-600 text-white font-semibold' : 'text-slate-700 hover:bg-slate-100'
                    ].join(' ')}
                  >
                    {etiqueta}
                  </button>
                );
              })}
            </div>
          ) : (
          <>
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
          </>
          )}

          <div className="flex items-center justify-between mt-3 pt-2 border-t border-slate-100">
            <span className="text-[11px] text-slate-500">
              {vista === 'meses'
                ? 'Elige un mes completo'
                : !desde ? 'Elige la fecha de inicio' : !hasta ? 'Elige la fecha de fin' : etiqueta}
            </span>
            <div className="flex gap-2">
              <button type="button"
                onClick={() => { const h = new Date(); seleccionarMes(h.getMonth(), h.getFullYear()); }}
                className="text-xs text-slate-500 hover:underline">Este mes</button>
              {(desde || hasta) && (
                <button type="button" onClick={limpiar} className="text-xs text-slate-500 hover:underline">Limpiar</button>
              )}
              <button type="button" onClick={() => setAbierto(false)} className="text-xs text-brand-700 hover:underline">Cerrar</button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
