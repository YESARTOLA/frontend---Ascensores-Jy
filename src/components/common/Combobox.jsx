import { useEffect, useMemo, useRef, useState } from 'react';

/**
 * Combobox simple: input + dropdown buscable. Sin dependencias.
 *
 * Props:
 *   - options: [{ value, label, sublabel? }]
 *   - value: valor seleccionado (mismo tipo que option.value)
 *   - onChange: (value) => void  — null cuando se limpia
 *   - placeholder: string
 *   - emptyLabel: string mostrado en el dropdown cuando no hay coincidencias
 *   - className: clases adicionales para el contenedor
 */
export default function Combobox({
  options = [],
  value = null,
  onChange,
  placeholder = 'Selecciona…',
  emptyLabel = 'Sin coincidencias',
  className = ''
}) {
  const [abierto, setAbierto] = useState(false);
  const [texto, setTexto] = useState('');
  const [resaltado, setResaltado] = useState(-1);
  const contRef = useRef(null);
  const inputRef = useRef(null);

  const seleccionada = useMemo(
    () => options.find(o => String(o.value) === String(value)) || null,
    [options, value]
  );

  // Sincronizar texto del input cuando el value cambia desde afuera o el dropdown se cierra
  useEffect(() => {
    if (!abierto) {
      setTexto(seleccionada ? seleccionada.label : '');
    }
  }, [seleccionada, abierto]);

  // Cerrar al hacer click fuera
  useEffect(() => {
    const onDocClick = (e) => {
      if (contRef.current && !contRef.current.contains(e.target)) {
        setAbierto(false);
      }
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, []);

  const filtradas = useMemo(() => {
    const q = texto.trim().toLowerCase();
    if (!q || (seleccionada && texto === seleccionada.label)) return options;
    return options.filter(o =>
      o.label.toLowerCase().includes(q) ||
      (o.sublabel && o.sublabel.toLowerCase().includes(q))
    );
  }, [options, texto, seleccionada]);

  const seleccionar = (opt) => {
    onChange?.(opt ? opt.value : null);
    setTexto(opt ? opt.label : '');
    setAbierto(false);
    setResaltado(-1);
  };

  const limpiar = (e) => {
    e.stopPropagation();
    onChange?.(null);
    setTexto('');
    setResaltado(-1);
    inputRef.current?.focus();
  };

  const onKeyDown = (e) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (!abierto) setAbierto(true);
      setResaltado(r => Math.min(filtradas.length - 1, r + 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setResaltado(r => Math.max(0, r - 1));
    } else if (e.key === 'Enter') {
      if (abierto && resaltado >= 0 && filtradas[resaltado]) {
        e.preventDefault();
        seleccionar(filtradas[resaltado]);
      }
    } else if (e.key === 'Escape') {
      setAbierto(false);
    }
  };

  return (
    <div ref={contRef} className={`relative ${className}`}>
      <div className="relative">
        <input
          ref={inputRef}
          type="text"
          className="input pr-8"
          value={texto}
          placeholder={placeholder}
          onFocus={() => { setAbierto(true); setTexto(''); }}
          onChange={e => { setTexto(e.target.value); setAbierto(true); setResaltado(-1); }}
          onKeyDown={onKeyDown}
        />
        {seleccionada && (
          <button
            type="button"
            onClick={limpiar}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700"
            aria-label="Limpiar selección"
          >×</button>
        )}
      </div>
      {abierto && (
        <ul className="absolute z-30 mt-1 max-h-64 w-full overflow-auto rounded-md border border-slate-200 bg-white shadow-lg">
          {filtradas.length === 0 ? (
            <li className="px-3 py-2 text-sm text-slate-500">{emptyLabel}</li>
          ) : filtradas.map((o, i) => (
            <li
              key={o.value}
              onMouseDown={(e) => { e.preventDefault(); seleccionar(o); }}
              onMouseEnter={() => setResaltado(i)}
              className={`px-3 py-2 text-sm cursor-pointer ${i === resaltado ? 'bg-brand-50 text-brand-700' : 'hover:bg-slate-50'}`}
            >
              <div className="truncate">{o.label}</div>
              {o.sublabel && <div className="text-xs text-slate-500 truncate">{o.sublabel}</div>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
