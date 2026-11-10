import { useEffect, useRef } from 'react';

/**
 * N° de operación de los pagos de una factura (transferencia, depósito, Yape…).
 * Una factura puede cobrarse en varios pagos, así que es una LISTA
 * (tbl_facturas.numeros_operacion). Limpieza espejo de
 * backend/utils/numerosOperacion.js.
 */

export const MAX_LARGO_NUMERO_OPERACION = 60;

/** Lista para guardar: recortados, sin vacíos y sin repetidos. */
export function limpiarNumerosOperacion(lista) {
  const vistos = new Set();
  const out = [];
  for (const v of lista || []) {
    const numero = String(v ?? '').trim();
    if (!numero) continue;
    const clave = numero.toUpperCase();
    if (vistos.has(clave)) continue;
    vistos.add(clave);
    out.push(numero);
  }
  return out;
}

/** Valor inicial del campo a partir de lo guardado: siempre al menos una fila. */
export function numerosOperacionForm(guardados) {
  const lista = Array.isArray(guardados) ? guardados.filter(Boolean) : [];
  return lista.length ? lista : [''];
}

/** Texto plano (exportes): los números separados por coma. */
export function textoNumerosOperacion(numeros) {
  return (numeros || []).filter(Boolean).join(', ');
}

/**
 * Campo editable: una fila por N° de operación, con «+ Agregar otro» para los
 * pagos siguientes. Enter en una fila abre la siguiente.
 *
 * Props: value (string[]), onChange (string[] => void), disabled
 */
export function CampoNumerosOperacion({ value, onChange, disabled = false }) {
  const filas = value?.length ? value : [''];
  const refs = useRef([]);
  const enfocar = useRef(null); // índice a enfocar tras agregar una fila

  useEffect(() => {
    if (enfocar.current === null) return;
    refs.current[enfocar.current]?.focus();
    enfocar.current = null;
  });

  const cambiar = (idx, v) => onChange(filas.map((x, i) => (i === idx ? v : x)));
  const agregar = () => {
    enfocar.current = filas.length;
    onChange([...filas, '']);
  };
  const quitar = (idx) => {
    const resto = filas.filter((_, i) => i !== idx);
    onChange(resto.length ? resto : ['']);
  };
  const alPresionar = (e, idx) => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    // Enter en la última fila con texto abre otra; en las demás, salta a la siguiente.
    if (idx === filas.length - 1) {
      if (filas[idx].trim()) agregar();
    } else {
      refs.current[idx + 1]?.focus();
    }
  };

  return (
    <div>
      <label className="label">N° de operación</label>
      <p className="text-xs text-slate-500 mb-2">
        Del pago de la factura (transferencia, depósito…). Si se pagó en varias partes, agrega un N° por cada pago.
      </p>
      <div className="space-y-2">
        {filas.map((v, idx) => (
          <div key={idx} className="flex items-center gap-2">
            <span className="text-[11px] text-slate-400 w-5 text-right shrink-0">{idx + 1}.</span>
            <input
              ref={el => { refs.current[idx] = el; }}
              className="input font-mono flex-1"
              maxLength={MAX_LARGO_NUMERO_OPERACION}
              value={v}
              onChange={e => cambiar(idx, e.target.value)}
              onKeyDown={e => alPresionar(e, idx)}
              placeholder="Ej. 00123456"
              disabled={disabled}
              aria-label={`N° de operación ${idx + 1}`}
            />
            {(filas.length > 1 || v) && (
              <button
                type="button"
                className="text-slate-400 hover:text-rose-600 text-lg leading-none shrink-0 disabled:opacity-40"
                onClick={() => quitar(idx)}
                disabled={disabled}
                title="Quitar este N° de operación"
                aria-label={`Quitar N° de operación ${idx + 1}`}
              >×</button>
            )}
          </div>
        ))}
      </div>
      <button
        type="button"
        className="mt-2 text-xs text-brand-700 hover:underline disabled:opacity-40"
        onClick={agregar}
        disabled={disabled}
      >
        + Agregar otro N° de operación
      </button>
    </div>
  );
}

/**
 * Solo lectura (tablas y detalle): un número por línea, o «—» si no hay.
 */
export function ListaNumerosOperacion({ numeros, className = 'text-xs' }) {
  const lista = (numeros || []).filter(Boolean);
  if (lista.length === 0) return <span className="text-slate-400">—</span>;
  return (
    <ul className={`font-mono space-y-0.5 ${className}`}>
      {lista.map((n, i) => <li key={`${n}-${i}`} className="whitespace-nowrap">{n}</li>)}
    </ul>
  );
}
