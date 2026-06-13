import { useEffect, useMemo, useRef, useState } from 'react';

/**
 * Combobox de edificio / obra con búsqueda por texto. Reemplaza al par
 * "elija cliente → elija edificio": al escribir, filtra por nombre del edificio,
 * distrito, tipo o razón social del cliente, y muestra el cliente como dato
 * secundario para dar contexto. Lo que devuelve es el `id` del edificio.
 *
 * Props:
 *   edificios     — array [{ id, nombre, tipo?, distrito?, cliente?: { nombre } }]
 *   value         — id del edificio seleccionado (number | string) o '' para vacío
 *   onChange(id)  — callback con el id elegido (string) o '' al limpiar
 *   placeholder   — texto del input cuando no hay selección
 *   required      — agrega aria-required
 *   id            — id del input HTML
 */
export default function EdificioAutocomplete({
  edificios = [],
  value,
  onChange,
  placeholder = 'Escriba para buscar el edificio…',
  required = false,
  disabled = false,
  id
}) {
  const labelDe = (e) => (e ? `${e.nombre}${e.tipo ? ` · ${e.tipo}` : ''}` : '');
  const [query, setQuery] = useState('');
  const [abierto, setAbierto] = useState(false);
  const [focusIdx, setFocusIdx] = useState(0);
  const inputRef = useRef(null);
  const contenedorRef = useRef(null);

  // Sincronizar query con el edificio seleccionado externamente (value externo manda)
  const edificioSel = useMemo(
    () => edificios.find(e => String(e.id) === String(value)) || null,
    [edificios, value]
  );
  useEffect(() => {
    if (!abierto) setQuery(edificioSel ? labelDe(edificioSel) : '');
  }, [edificioSel, abierto]);

  // Cerrar al hacer click fuera
  useEffect(() => {
    if (!abierto) return;
    const handler = (e) => {
      if (contenedorRef.current && !contenedorRef.current.contains(e.target)) {
        setAbierto(false);
        setQuery(edificioSel ? labelDe(edificioSel) : '');
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [abierto, edificioSel]);

  const opciones = useMemo(() => {
    const q = query.trim().toLowerCase();
    const fuente = !q
      ? edificios
      : edificios.filter(e => {
          const campos = [e.nombre, e.tipo, e.distrito, e.cliente?.nombre].filter(Boolean);
          return campos.some(s => String(s).toLowerCase().includes(q));
        });
    return fuente.slice(0, 50);
  }, [edificios, query]);

  const seleccionar = (op) => {
    onChange(String(op.id));
    setQuery(labelDe(op));
    setAbierto(false);
    setFocusIdx(0);
    inputRef.current?.blur();
  };

  const onKeyDown = (e) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setAbierto(true);
      setFocusIdx(i => Math.min(i + 1, opciones.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setFocusIdx(i => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      if (abierto && opciones[focusIdx]) {
        e.preventDefault();
        seleccionar(opciones[focusIdx]);
      }
    } else if (e.key === 'Escape') {
      setAbierto(false);
      setQuery(edificioSel ? labelDe(edificioSel) : '');
    }
  };

  const limpiar = () => {
    onChange('');
    setQuery('');
    setAbierto(false);
    inputRef.current?.focus();
  };

  return (
    <div ref={contenedorRef} className="relative">
      <div className="relative">
        <input
          id={id}
          ref={inputRef}
          type="text"
          className="input pr-8"
          role="combobox"
          aria-expanded={abierto}
          aria-required={required}
          disabled={disabled}
          autoComplete="off"
          placeholder={placeholder}
          value={query}
          onFocus={() => { if (!disabled) { setAbierto(true); setFocusIdx(0); } }}
          onChange={e => { if (!disabled) { setQuery(e.target.value); setAbierto(true); setFocusIdx(0); } }}
          onKeyDown={onKeyDown}
        />
        {!disabled && (query || edificioSel) && (
          <button
            type="button"
            onClick={limpiar}
            aria-label="Limpiar"
            className="absolute right-2 top-1/2 -translate-y-1/2 text-carbon-400 hover:text-carbon-700 text-base leading-none"
            tabIndex={-1}
          >×</button>
        )}
      </div>
      {abierto && opciones.length > 0 && (
        <ul
          role="listbox"
          className="absolute z-20 mt-1 left-0 right-0 max-h-64 overflow-y-auto rounded-lg bg-white shadow-panel ring-1 ring-carbon-200 py-1 scroll-thin"
        >
          {opciones.map((op, idx) => (
            <li
              key={op.id}
              role="option"
              aria-selected={idx === focusIdx}
              onMouseDown={(e) => { e.preventDefault(); seleccionar(op); }}
              onMouseEnter={() => setFocusIdx(idx)}
              className={`px-3 py-1.5 cursor-pointer text-sm ${idx === focusIdx ? 'bg-brand-50 text-brand-800' : 'text-carbon-800 hover:bg-ivory-50'}`}
            >
              <div className="font-medium">{labelDe(op)}</div>
              {(() => {
                const txt = [op.cliente?.nombre, op.distrito].filter(Boolean).join(' · ');
                return txt ? <div className="text-xs text-carbon-500">{txt}</div> : null;
              })()}
            </li>
          ))}
        </ul>
      )}
      {abierto && opciones.length === 0 && (
        <div className="absolute z-20 mt-1 left-0 right-0 rounded-lg bg-white shadow-panel ring-1 ring-carbon-200 px-3 py-2 text-sm text-carbon-500">
          Sin coincidencias
        </div>
      )}
    </div>
  );
}
