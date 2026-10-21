import { useRef } from 'react';
import BarraProgresoCarga from './BarraProgresoCarga.jsx';
import { FileLink } from './FilePreview.jsx';
import { formatBytes } from '../../hooks/useCargaArchivos.js';

/**
 * Campo de UN archivo adjunto en un formulario (comprobante de un abono,
 * archivo de una factura…).
 *
 * El archivo se sube al elegirlo y el formulario solo guarda su id, así que el
 * input nativo vuelve a decir "Sin archivos seleccionados" aunque la carga haya
 * ido bien. Por eso, una vez subido, el input se reemplaza por el archivo en sí:
 * su nombre (abre la vista previa), su peso y las acciones Cambiar / Quitar.
 *
 * Props:
 *   archivo  — registro de tbl_archivos devuelto por la subida, o null
 *   onChange — handler del input file (el mismo que recibía el <input>)
 *   onQuitar — () => void; sin él no se ofrece quitar
 *   carga    — instancia de useCargaArchivos (progreso y bloqueo mientras sube)
 */
export default function ArchivoAdjunto({ archivo, onChange, onQuitar, carga }) {
  const inputRef = useRef(null);
  const subiendo = !!carga?.subiendo;

  return (
    <div>
      {archivo ? (
        <div className="flex items-center gap-3 rounded-lg ring-1 ring-slate-200 bg-white px-3 py-2">
          <svg className="shrink-0 text-brand-600" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" />
          </svg>
          <div className="min-w-0 flex-1">
            <FileLink archivo={archivo} className="text-brand-700 hover:underline text-sm truncate block max-w-full text-left">
              {archivo.nombre_original || 'Ver archivo'}
            </FileLink>
            <div className="text-[11px] text-emerald-600">
              ✓ Adjuntado{archivo.tamano_bytes ? ` · ${formatBytes(archivo.tamano_bytes)}` : ''}
            </div>
          </div>
          <FileLink archivo={archivo} className="btn-secondary text-xs px-3 py-1 shrink-0">Ver</FileLink>
          <button
            type="button"
            className="text-xs text-slate-600 hover:text-brand-700 hover:underline shrink-0 disabled:opacity-40"
            onClick={() => inputRef.current?.click()}
            disabled={subiendo}
          >
            {subiendo ? 'Subiendo…' : 'Cambiar'}
          </button>
          {onQuitar && (
            <button
              type="button"
              className="text-slate-400 hover:text-rose-600 text-lg leading-none shrink-0 disabled:opacity-40"
              onClick={onQuitar}
              disabled={subiendo}
              title="Quitar archivo"
              aria-label={`Quitar ${archivo.nombre_original || 'archivo'}`}
            >×</button>
          )}
          <input ref={inputRef} type="file" className="hidden" onChange={onChange} />
        </div>
      ) : (
        <input type="file" className="input" onChange={onChange} disabled={subiendo} />
      )}
      <BarraProgresoCarga carga={carga} className="mt-2" />
    </div>
  );
}
