import { useEffect, useState } from 'react';

/**
 * Estado de React que se persiste en `sessionStorage` bajo `key`. Sirve para que
 * los filtros/búsqueda de un listado sigan activos cuando el usuario abre un
 * registro y regresa (sea con el botón "atrás" del navegador o con un enlace de
 * vuelta al listado, que remonta la página y perdería el useState normal).
 *
 * Vive mientras dure la pestaña (sessionStorage), no entre sesiones distintas.
 * `initial` puede ser un valor o una función perezosa. Si lo guardado no se puede
 * parsear, cae al inicial sin romper.
 *
 * Nota: para no perder claves nuevas si el shape del estado cambia entre
 * versiones, cuando el valor guardado y el inicial son objetos planos se hace un
 * merge superficial (inicial como base, guardado encima).
 */
export function usePersistentState(key, initial) {
  const [value, setValue] = useState(() => {
    const base = typeof initial === 'function' ? initial() : initial;
    try {
      const saved = sessionStorage.getItem(key);
      if (saved == null) return base;
      const parsed = JSON.parse(saved);
      if (base && parsed && typeof base === 'object' && typeof parsed === 'object'
        && !Array.isArray(base) && !Array.isArray(parsed)) {
        return { ...base, ...parsed };
      }
      return parsed;
    } catch {
      return base;
    }
  });

  useEffect(() => {
    try {
      sessionStorage.setItem(key, JSON.stringify(value));
    } catch { /* almacenamiento lleno/no disponible: se ignora */ }
  }, [key, value]);

  return [value, setValue];
}
