import { useState } from 'react';

/**
 * Caja de filtros de una pantalla de listado.
 *
 * En escritorio se comporta como siempre: la rejilla de campos, visible. En
 * móvil arranca plegada tras un botón, porque seis selects apilados ocupaban
 * una pantalla entera y empujaban los resultados —lo que el usuario vino a
 * ver— fuera del primer scroll. El botón indica cuántos filtros hay activos,
 * así que plegado nunca se pierde de vista que la lista está filtrada.
 *
 * Props:
 *  - activos: nº de filtros con valor (para la insignia y para abrir de inicio).
 *  - onLimpiar: si se pasa, muestra "Limpiar" junto al botón en móvil.
 *  - children: la rejilla de campos, tal cual estaba.
 */
export default function PanelFiltros({ activos = 0, onLimpiar, children, className = '' }) {
  // Si ya hay filtros puestos (p. ej. al volver a la pantalla y recuperarlos
  // del almacenamiento), se abre para que se vean sin tener que buscarlos.
  const [abierto, setAbierto] = useState(activos > 0);

  return (
    <div className={`card mb-4 ${className}`}>
      {/* Cabecera solo de móvil */}
      <div className="md:hidden flex items-center gap-2 px-3 py-2">
        <button
          type="button"
          onClick={() => setAbierto(a => !a)}
          aria-expanded={abierto}
          className="flex-1 inline-flex items-center gap-2 min-h-[44px] px-2 rounded-lg text-sm font-semibold text-carbon-700 active:bg-carbon-100/70 transition">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
          </svg>
          Filtros
          {activos > 0 && (
            <span className="inline-grid place-items-center min-w-[20px] h-5 px-1.5 rounded-full bg-ember-500 text-white text-[10px] font-bold">
              {activos}
            </span>
          )}
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4"
               strokeLinecap="round" strokeLinejoin="round"
               className={`ml-auto text-carbon-400 transition-transform ${abierto ? 'rotate-180' : ''}`}>
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </button>
        {activos > 0 && onLimpiar && (
          <button type="button" onClick={onLimpiar}
                  className="min-h-[44px] px-2 text-xs font-semibold text-brand-700 active:opacity-60">
            Limpiar
          </button>
        )}
      </div>

      {/* Campos: plegables en móvil, siempre visibles a partir de `md`. */}
      <div className={`${abierto ? 'block' : 'hidden'} md:block border-t border-carbon-100/80 md:border-t-0`}>
        {children}
      </div>
    </div>
  );
}
