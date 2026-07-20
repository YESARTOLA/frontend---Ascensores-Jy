import { useEffect, useState } from 'react';
import Modal from './Modal';

/**
 * Modal de doble confirmación para eliminaciones de alto impacto / mucho flujo.
 *
 * No basta con un click: el usuario debe ESCRIBIR la palabra clave (por defecto
 * el código del registro, p. ej. "SRV-2026-000123", o "ELIMINAR") para habilitar
 * el botón destructivo. Solo entonces se ejecuta `onConfirmar`.
 *
 * Props:
 *  - open, onClose
 *  - titulo            Título del modal
 *  - descripcion       Texto/nodo que explica qué se revierte en cascada
 *  - palabraClave      Token exacto que se debe escribir (default 'ELIMINAR')
 *  - etiquetaPalabra   Cómo nombrar el token en la instrucción (default 'ELIMINAR')
 *  - textoBoton        Texto del botón destructivo
 *  - onConfirmar       async () => {}  — la acción de borrado
 *  - deshabilitado     Bloquea el botón destructivo aunque la palabra sea correcta
 *                      (p. ej. mientras se carga el resumen de impacto)
 */
export default function ConfirmarEliminacion({
  open,
  onClose,
  titulo = 'Confirmar eliminación',
  descripcion,
  palabraClave = 'ELIMINAR',
  etiquetaPalabra,
  textoBoton = 'Eliminar definitivamente',
  deshabilitado = false,
  onConfirmar
}) {
  const [texto, setTexto] = useState('');
  const [cargando, setCargando] = useState(false);

  // Reiniciar el input cada vez que se abre/cierra.
  useEffect(() => {
    if (!open) { setTexto(''); setCargando(false); }
  }, [open]);

  const objetivo = String(palabraClave || '').trim();
  const etiqueta = etiquetaPalabra || objetivo;
  const habilitado = texto.trim().toUpperCase() === objetivo.toUpperCase()
    && objetivo.length > 0 && !deshabilitado;

  const confirmar = async () => {
    if (!habilitado || cargando) return;
    try {
      setCargando(true);
      await onConfirmar();
    } finally {
      setCargando(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={cargando ? () => {} : onClose}
      title={titulo}
      size="sm"
      footer={
        <>
          <button type="button" onClick={onClose} disabled={cargando}
                  className="btn-ghost text-sm disabled:opacity-50">
            Cancelar
          </button>
          <button type="button" onClick={confirmar} disabled={!habilitado || cargando}
                  className="inline-flex items-center gap-2 rounded-lg bg-rose-600 px-4 py-2 text-sm font-semibold text-white
                             hover:bg-rose-700 disabled:opacity-40 disabled:cursor-not-allowed transition">
            {cargando ? 'Eliminando…' : textoBoton}
          </button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">
          {descripcion || 'Esta acción dará de baja el registro y revertirá en cascada todo lo que generó. Queda auditada y es recuperable por soporte, pero desaparece de la operación.'}
        </div>
        <div>
          <label className="block text-xs font-medium text-carbon-600 mb-1">
            Para confirmar, escribe <span className="font-mono font-bold text-carbon-900">{etiqueta}</span>
          </label>
          <input
            type="text"
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') confirmar(); }}
            autoFocus
            autoComplete="off"
            spellCheck={false}
            placeholder={etiqueta}
            className="w-full rounded-lg border border-carbon-200 px-3 py-2 text-sm font-mono
                       focus:outline-none focus:ring-2 focus:ring-rose-400"
          />
        </div>
      </div>
    </Modal>
  );
}
