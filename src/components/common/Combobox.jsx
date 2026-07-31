import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { usePopupAnclado } from '../../utils/usePopupAnclado.js';

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
 *   - libre: modo "buscador con sugerencias". El `value` ES el texto escrito y
 *     `onChange` se dispara en cada tecla, así el padre puede seguir buscando por
 *     texto libre; las opciones quedan como atajo (al elegir una, se escribe su
 *     `value` en el buscador). Se limpia con '' en vez de null.
 */
export default function Combobox({
  options = [],
  value = null,
  onChange,
  placeholder = 'Selecciona…',
  emptyLabel = 'Sin coincidencias',
  className = '',
  libre = false
}) {
  const [abierto, setAbierto] = useState(false);
  const [texto, setTexto] = useState('');
  const [resaltado, setResaltado] = useState(-1);
  const contRef = useRef(null);
  const inputRef = useRef(null);
  const popupRef = useRef(null);

  const seleccionada = useMemo(
    () => options.find(o => String(o.value) === String(value)) || null,
    [options, value]
  );

  // En modo libre el input es controlado por el padre (el value ES el texto); en
  // modo selección se sincroniza con la opción elegida al cerrar el dropdown.
  const textoInput = libre ? (value ?? '') : texto;

  useEffect(() => {
    if (libre) return;
    if (!abierto) {
      setTexto(seleccionada ? seleccionada.label : '');
    }
  }, [seleccionada, abierto, libre]);

  // Cerrar al hacer click fuera (el panel vive en un portal, hay que excluirlo).
  useEffect(() => {
    const onDocClick = (e) => {
      const dentroInput = contRef.current && contRef.current.contains(e.target);
      const dentroPanel = popupRef.current && popupRef.current.contains(e.target);
      if (!dentroInput && !dentroPanel) setAbierto(false);
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, []);

  const filtradas = useMemo(() => {
    const q = String(textoInput).trim().toLowerCase();
    if (!q || (!libre && seleccionada && texto === seleccionada.label)) return options;
    return options.filter(o =>
      o.label.toLowerCase().includes(q) ||
      (o.sublabel && o.sublabel.toLowerCase().includes(q))
    );
  }, [options, textoInput, texto, seleccionada, libre]);

  // El panel se portalea a document.body: dentro de una `.card` (backdrop-blur)
  // quedaría detrás de la tarjeta siguiente. Se reposiciona al cambiar la lista.
  const pos = usePopupAnclado(abierto, contRef, popupRef, [filtradas.length]);

  const seleccionar = (opt) => {
    onChange?.(opt ? opt.value : (libre ? '' : null));
    setTexto(opt ? opt.label : '');
    setAbierto(false);
    setResaltado(-1);
  };

  const limpiar = (e) => {
    e.stopPropagation();
    onChange?.(libre ? '' : null);
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
          value={textoInput}
          placeholder={placeholder}
          onFocus={() => { setAbierto(true); if (!libre) setTexto(''); }}
          onChange={e => {
            if (libre) onChange?.(e.target.value);
            else setTexto(e.target.value);
            setAbierto(true);
            setResaltado(-1);
          }}
          onKeyDown={onKeyDown}
        />
        {(libre ? String(textoInput).length > 0 : !!seleccionada) && (
          <button
            type="button"
            onClick={limpiar}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700"
            aria-label="Limpiar selección"
          >×</button>
        )}
      </div>
      {abierto && createPortal(
        <ul
          ref={popupRef}
          style={{ position: 'fixed', top: pos.top, left: pos.left, width: pos.width }}
          className="z-[60] max-h-64 overflow-auto rounded-md border border-slate-200 bg-white shadow-lg">
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
        </ul>,
        document.body
      )}
    </div>
  );
}
