import { useCallback, useEffect, useLayoutEffect, useState } from 'react';

/**
 * Calcula la posición (fixed) de un panel flotante anclado a un elemento.
 *
 * Por qué existe: las tarjetas (`.card`) usan `backdrop-blur`, que crea un
 * stacking context propio. Un dropdown `absolute` dentro de la tarjeta de
 * filtros queda SIEMPRE por detrás de la tarjeta siguiente (la de la tabla),
 * por más z-index que se le ponga: compite dentro de su tarjeta, no fuera.
 * La solución es sacar el panel a un portal en `document.body` con posición
 * fija; este hook entrega esa posición. Mismo patrón que `DateRangePicker`.
 *
 * @param {boolean} abierto     — si el panel está visible
 * @param {object}  anclaRef    — ref al elemento bajo el que se abre (da x/ancho)
 * @param {object}  popupRef    — ref al panel; se mide para decidir si abre hacia arriba
 * @param {array}   deps        — recalcular cuando cambie el contenido del panel
 * @returns {{ top: number, left: number, width: number }}
 */
export function usePopupAnclado(abierto, anclaRef, popupRef, deps = []) {
  const [pos, setPos] = useState({ top: 0, left: 0, width: 0 });

  const posicionar = useCallback(() => {
    const ancla = anclaRef?.current;
    if (!ancla) return;
    const r = ancla.getBoundingClientRect();
    const alto = popupRef?.current?.offsetHeight || 264;
    const width = r.width;
    const left = Math.max(8, Math.min(r.left, window.innerWidth - width - 8));
    let top = r.bottom + 4;
    // Si no cabe hacia abajo, abrir hacia arriba del ancla.
    if (top + alto > window.innerHeight - 8) {
      const arriba = r.top - alto - 4;
      top = arriba >= 8 ? arriba : Math.max(8, window.innerHeight - alto - 8);
    }
    setPos({ top, left, width });
  }, [anclaRef, popupRef]);

  // Antes del paint, para que no se vea el panel en una posición previa.
  useLayoutEffect(() => {
    if (abierto) posicionar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [abierto, ...deps]);

  // Mientras está abierto, seguir al ancla si la página hace scroll o cambia de tamaño.
  useEffect(() => {
    if (!abierto) return;
    const h = () => posicionar();
    window.addEventListener('resize', h);
    window.addEventListener('scroll', h, true);
    return () => { window.removeEventListener('resize', h); window.removeEventListener('scroll', h, true); };
  }, [abierto, posicionar]);

  return pos;
}
