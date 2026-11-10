import { useRef, useState } from 'react';
import BarraProgresoCarga from './BarraProgresoCarga.jsx';
import { FileLink } from './FilePreview.jsx';
import { useToast } from './Toast.jsx';
import { formatBytes } from '../../hooks/useCargaArchivos.js';

/**
 * Campo de VARIOS archivos de un formulario que se guarda de una vez (los
 * documentos de una entrega, los archivos de una factura…). Se eligen —o se
 * arrastran— todos a la vez y se suben uno tras otro con su barra de progreso.
 * Cada uno entra a la lista en cuanto termina: si la tanda se corta a medias,
 * lo ya subido queda en la lista. Sin límite de cantidad.
 *
 * Props:
 *   archivos     — lista [{ id?, id_archivo, archivo }]
 *   setArchivos  — recibe una función (lista anterior → lista nueva)
 *   carga        — instancia de useCargaArchivos (el padre bloquea "Guardar" mientras sube)
 *   carpeta      — carpeta de almacenamiento ('entregas', 'facturas'…)
 *   singular / plural — cómo nombrar cada elemento ('documento' / 'documentos')
 *   textoBoton   — rótulo del botón de selección
 */
export default function CampoArchivosMultiples({
  archivos,
  setArchivos,
  carga,
  carpeta,
  singular = 'archivo',
  plural = 'archivos',
  textoBoton = '📎 Seleccionar archivos'
}) {
  const toast = useToast();
  const inputRef = useRef(null);
  const [arrastrando, setArrastrando] = useState(false);
  const subiendo = !!carga?.subiendo;
  const Singular = singular.charAt(0).toUpperCase() + singular.slice(1);

  const subir = async (files) => {
    const lista = Array.from(files || []);
    if (lista.length === 0 || subiendo) return;
    try {
      await carga.subirVarios(lista, carpeta, {
        onArchivoSubido: (archivo) => {
          setArchivos(prev => [...prev, { id_archivo: archivo.id, archivo }]);
        }
      });
      toast.success(lista.length === 1 ? `${Singular} cargado` : `${lista.length} ${plural} cargados`);
    } catch (err) {
      if (!err?.cancelado) toast.error(err.response?.data?.error || `Error al subir los ${plural}`);
    }
  };

  const seleccionar = (e) => {
    const files = Array.from(e.target.files || []);
    e.target.value = '';
    subir(files);
  };

  const soltar = (e) => {
    e.preventDefault();
    setArrastrando(false);
    subir(e.dataTransfer?.files);
  };

  const quitar = (idx) => setArchivos(prev => prev.filter((_, i) => i !== idx));

  return (
    <div>
      <div
        onDragOver={(e) => { e.preventDefault(); if (!subiendo) setArrastrando(true); }}
        onDragLeave={() => setArrastrando(false)}
        onDrop={soltar}
        className={`rounded-lg border-2 border-dashed px-4 py-4 text-center transition ${arrastrando ? 'border-brand-500 bg-brand-50' : 'border-slate-300 bg-slate-50'}`}
      >
        <input ref={inputRef} type="file" multiple className="hidden" onChange={seleccionar} />
        <button
          type="button"
          className="btn-secondary text-xs"
          onClick={() => inputRef.current?.click()}
          disabled={subiendo}
        >
          {subiendo ? 'Subiendo…' : textoBoton}
        </button>
        <p className="text-xs text-slate-500 mt-2">
          Puede elegir varios a la vez (Ctrl o Shift, o Ctrl + A en la carpeta) o arrastrarlos aquí.
        </p>
      </div>

      <BarraProgresoCarga carga={carga} className="mt-2" />

      {archivos.length > 0 && (
        <div className="mt-2">
          <div className="text-xs text-slate-500 mb-1">
            {archivos.length === 1 ? `1 ${singular}` : `${archivos.length} ${plural}`}
          </div>
          <ul className="divide-y divide-slate-100 rounded-lg ring-1 ring-slate-200 bg-white max-h-64 overflow-y-auto scroll-thin">
            {archivos.map((d, idx) => (
              <li key={d.id ? `v${d.id}` : `a${d.id_archivo}-${idx}`} className="flex items-center gap-2 px-3 py-1.5">
                <div className="min-w-0 flex-1">
                  <FileLink archivo={d.archivo} className="text-brand-700 hover:underline text-xs truncate block max-w-full text-left">
                    {d.archivo?.nombre_original || 'Ver archivo'}
                  </FileLink>
                  {d.archivo?.tamano_bytes ? (
                    <div className="text-[11px] text-slate-400">{formatBytes(d.archivo.tamano_bytes)}</div>
                  ) : null}
                </div>
                <button
                  type="button"
                  className="text-slate-400 hover:text-rose-600 text-lg leading-none shrink-0 disabled:opacity-40"
                  onClick={() => quitar(idx)}
                  disabled={subiendo}
                  title={`Quitar ${singular}`}
                  aria-label={`Quitar ${d.archivo?.nombre_original || singular}`}
                >×</button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
