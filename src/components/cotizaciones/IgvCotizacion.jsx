import { useId } from 'react';
import { formatMonto } from '../../utils/formatters.js';
import { MODOS_IGV, MODO_IGV_INCLUIDO, MODO_IGV_SIN } from '../../utils/igvCotizacion.js';

/**
 * Selector de la condición de IGV de una cotización (más IGV / IGV incluido /
 * sin IGV). Lo comparten "Nueva cotización" y la edición de una versión.
 */
export function SelectorModoIgv({ value, onChange }) {
  const nombre = useId();
  return (
    <div className="flex flex-wrap items-center justify-end gap-x-4 gap-y-1 text-sm text-carbon-700" role="radiogroup" aria-label="IGV">
      <span className="text-xs font-semibold uppercase tracking-wider text-carbon-500">IGV</span>
      {MODOS_IGV.map(m => (
        <label key={m.valor} className="inline-flex items-center gap-1.5 cursor-pointer" title={m.ayuda}>
          <input type="radio" name={nombre} value={m.valor} checked={value === m.valor}
            onChange={() => onChange(m.valor)} />
          {m.etiqueta}
        </label>
      ))}
    </div>
  );
}

/**
 * Bloque Subtotal / IGV / TOTAL. Con IGV incluido el subtotal es la base SIN
 * IGV (menor que la suma de los ítems), así que se rotula y se aclara.
 */
export function ResumenTotales({ modo, subtotal, igv, total, igvTasa, moneda, className = '' }) {
  const incluido = modo === MODO_IGV_INCLUIDO;
  return (
    <div className={`grid grid-cols-2 gap-1 text-sm ${className}`}>
      <div className="text-right text-carbon-600">{incluido ? 'Subtotal sin IGV' : 'Subtotal'}</div>
      <div className="text-right font-medium">{formatMonto(subtotal, moneda)}</div>
      {modo === MODO_IGV_SIN ? (
        <div className="col-span-2 text-right text-xs text-carbon-500">Precios sin IGV</div>
      ) : (
        <>
          <div className="text-right text-carbon-600">IGV ({Math.round((Number(igvTasa) || 0) * 100)}%)</div>
          <div className="text-right font-medium">{formatMonto(igv, moneda)}</div>
        </>
      )}
      <div className="text-right text-brand-700 font-bold">TOTAL</div>
      <div className="text-right text-brand-700 font-bold text-base">{formatMonto(total, moneda)}</div>
      {incluido && (
        <div className="col-span-2 text-right text-xs text-carbon-500">Los precios incluyen IGV</div>
      )}
    </div>
  );
}
