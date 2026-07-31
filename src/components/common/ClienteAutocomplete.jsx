import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { usePopupAnclado } from '../../utils/usePopupAnclado.js';

/**
 * Combobox de cliente con búsqueda por texto. Reemplaza `<select>` cuando la
 * lista es larga: al escribir, filtra por nombre / RUC / teléfono y muestra
 * los resultados en un panel posicionado bajo el input.
 *
 * Props:
 *   clientes      — array [{ id, nombre, numero_documento?, telefono? }]
 *   value         — id del cliente seleccionado (number | string) o '' para vacío
 *   onChange(id)  — callback con el id elegido (string) o '' al limpiar
 *   placeholder   — texto del input cuando no hay selección
 *   allowEmpty    — si true, ofrece un item "— Todos —" al inicio (para filtros)
 *   emptyLabel    — texto del item vacío (default "— Todos —")
 *   required      — agrega aria-required y resalta visualmente al vaciar
 *   id            — id del input HTML
 */
export default function ClienteAutocomplete({
  clientes = [],
  value,
  onChange,
  placeholder = 'Escriba para buscar…',
  allowEmpty = false,
  emptyLabel = '— Todos —',
  required = false,
  disabled = false,
  id
}) {
  // El cliente se identifica por su razón social / nombre.
  const labelDe = (c) => c?.nombre || '';
  const [query, setQuery] = useState('');
  const [abierto, setAbierto] = useState(false);
  const [focusIdx, setFocusIdx] = useState(0);
  const inputRef = useRef(null);
  const contenedorRef = useRef(null);
  const popupRef = useRef(null);

  // Sincronizar query con el cliente seleccionado externamente (value externo manda)
  const clienteSel = useMemo(
    () => clientes.find(c => String(c.id) === String(value)) || null,
    [clientes, value]
  );
  useEffect(() => {
    if (!abierto) setQuery(clienteSel ? labelDe(clienteSel) : '');
  }, [clienteSel, abierto]);

  // Cerrar al hacer click fuera (el panel vive en un portal, hay que excluirlo).
  useEffect(() => {
    if (!abierto) return;
    const handler = (e) => {
      const dentroInput = contenedorRef.current && contenedorRef.current.contains(e.target);
      const dentroPanel = popupRef.current && popupRef.current.contains(e.target);
      if (!dentroInput && !dentroPanel) {
        setAbierto(false);
        setQuery(clienteSel ? labelDe(clienteSel) : '');
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [abierto, clienteSel]);

  const opciones = useMemo(() => {
    const q = query.trim().toLowerCase();
    const fuente = !q
      ? clientes
      : clientes.filter(c => {
          // Además de nombre / RUC / teléfono, se busca por nombre de edificio u
          // obra (cuando el cliente viene enriquecido con `edificios: [nombres]`).
          const edificios = Array.isArray(c.edificios) ? c.edificios : [];
          const campos = [c.nombre, c.numero_documento, c.telefono, ...edificios].filter(Boolean);
          return campos.some(s => String(s).toLowerCase().includes(q));
        });
    const limitado = fuente.slice(0, 50);
    if (allowEmpty) return [{ id: '', __empty: true, nombre: emptyLabel }, ...limitado];
    return limitado;
  }, [clientes, query, allowEmpty, emptyLabel]);

  // El panel se portalea a document.body: dentro de una `.card` (backdrop-blur)
  // quedaría detrás de la tarjeta siguiente. Se reposiciona al cambiar la lista.
  const pos = usePopupAnclado(abierto, contenedorRef, popupRef, [opciones.length]);

  const seleccionar = (op) => {
    onChange(op.__empty ? '' : String(op.id));
    setQuery(op.__empty ? '' : labelDe(op));
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
      setQuery(clienteSel ? labelDe(clienteSel) : '');
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
        {!disabled && (query || clienteSel) && (
          <button
            type="button"
            onClick={limpiar}
            aria-label="Limpiar"
            className="absolute right-2 top-1/2 -translate-y-1/2 text-carbon-400 hover:text-carbon-700 text-base leading-none"
            tabIndex={-1}
          >×</button>
        )}
      </div>
      {abierto && opciones.length > 0 && createPortal(
        <ul
          role="listbox"
          ref={popupRef}
          style={{ position: 'fixed', top: pos.top, left: pos.left, width: pos.width }}
          className="z-[60] max-h-64 overflow-y-auto rounded-lg bg-white shadow-panel ring-1 ring-carbon-200 py-1 scroll-thin"
        >
          {opciones.map((op, idx) => (
            <li
              key={op.__empty ? '__empty' : op.id}
              role="option"
              aria-selected={idx === focusIdx}
              onMouseDown={(e) => { e.preventDefault(); seleccionar(op); }}
              onMouseEnter={() => setFocusIdx(idx)}
              className={`px-3 py-1.5 cursor-pointer text-sm ${idx === focusIdx ? 'bg-brand-50 text-brand-800' : 'text-carbon-800 hover:bg-ivory-50'}`}
            >
              {op.__empty ? (
                <span className="italic text-carbon-500">{op.nombre}</span>
              ) : (
                <>
                  <div className="font-medium">{labelDe(op)}</div>
                  {(() => {
                    const txt = [op.numero_documento, op.telefono].filter(Boolean).join(' · ');
                    return txt ? <div className="text-xs text-carbon-500">{txt}</div> : null;
                  })()}
                  {(() => {
                    // Si el match vino por nombre de edificio, mostrarlo para que
                    // el usuario entienda por qué apareció ese cliente.
                    const q = query.trim().toLowerCase();
                    const edifs = Array.isArray(op.edificios)
                      ? op.edificios.filter(n => q && String(n).toLowerCase().includes(q))
                      : [];
                    return edifs.length > 0
                      ? <div className="text-xs text-brand-600">🏢 {edifs.join(' · ')}</div>
                      : null;
                  })()}
                </>
              )}
            </li>
          ))}
        </ul>,
        document.body
      )}
      {abierto && opciones.length === 0 && createPortal(
        <div
          ref={popupRef}
          style={{ position: 'fixed', top: pos.top, left: pos.left, width: pos.width }}
          className="z-[60] rounded-lg bg-white shadow-panel ring-1 ring-carbon-200 px-3 py-2 text-sm text-carbon-500">
          Sin coincidencias
        </div>,
        document.body
      )}
    </div>
  );
}
