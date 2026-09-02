import { useEffect, useState } from 'react';

/**
 * Media query REACTIVA. Reemplaza los `window.innerWidth < 768` sueltos, que se
 * evalúan una sola vez por render y no reaccionan al rotar el teléfono ni al
 * redimensionar la ventana: la vista se quedaba en modo escritorio hasta que
 * algo más forzaba un re-render.
 */
export function useMediaQuery(query) {
  const [coincide, setCoincide] = useState(
    () => typeof window !== 'undefined' && window.matchMedia(query).matches
  );

  useEffect(() => {
    const mql = window.matchMedia(query);
    const alCambiar = (e) => setCoincide(e.matches);
    setCoincide(mql.matches);
    // Safari < 14 solo tiene addListener.
    if (mql.addEventListener) {
      mql.addEventListener('change', alCambiar);
      return () => mql.removeEventListener('change', alCambiar);
    }
    mql.addListener(alCambiar);
    return () => mql.removeListener(alCambiar);
  }, [query]);

  return coincide;
}

/**
 * `true` por debajo del breakpoint `md` de Tailwind (768px): el mismo corte que
 * usan las clases `md:hidden` / `hidden md:block` de las listas, para que la
 * lógica de JS y la de CSS nunca discrepen.
 */
export const useEsMovil = () => useMediaQuery('(max-width: 767px)');

/** `true` por debajo de `lg` (1024px): tablet y teléfono, donde no hay sidebar fija. */
export const useEsCompacto = () => useMediaQuery('(max-width: 1023px)');
