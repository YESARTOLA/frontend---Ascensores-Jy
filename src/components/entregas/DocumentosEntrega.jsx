import { useRef, useState } from 'react';
import BarraProgresoCarga from '../common/BarraProgresoCarga.jsx';
import { FileLink } from '../common/FilePreview.jsx';
import { useToast } from '../common/Toast.jsx';
import { formatBytes } from '../../hooks/useCargaArchivos.js';

/**
 * Documentos de una entrega. Una entrega lleva tantos como haga falta (actas,
 * planos, manuales, certificados…); las registradas antes de admitir varios
 * tienen su único archivo en `entrega.archivo`, que se muestra primero.
 * Backend: utils/documentosEntrega.js.
 */

/** Archivos de una entrega (el de antes y sus documentos), sin repetir. */
export function documentosDeEntrega(entrega) {
  const vistos = new Set();
  return [entrega?.archivo, ...(entrega?.documentos || []).map(d => d.archivo)]
    .filter(a => a && !vistos.has(a.id) && vistos.add(a.id));
}

/**
 * Lista del formulario a partir de una entrega guardada. Cada ítem es
 * { id?, id_archivo, archivo, legado? }: `id` es el vínculo ya guardado y
 * `legado` marca el archivo único de una entrega antigua.
 */
export function documentosFormDeEntrega(entrega) {
  const lista = [];
  if (entrega?.archivo) lista.push({ id_archivo: entrega.archivo.id, archivo: entrega.archivo, legado: true });
  for (const d of entrega?.documentos || []) {
    lista.push({ id: d.id, id_archivo: d.id_archivo, archivo: d.archivo });
  }
  return lista;
}

/**
 * Payload de los documentos para crear o corregir la entrega: `id_archivo` es
 * el archivo de una entrega antigua (null si se quitó) y `documentos` la lista
 * completa que debe quedar (los guardados por su `id`, los nuevos por su
 * `id_archivo`).
 */
export function payloadDocumentosEntrega(lista) {
  const legado = lista.find(d => d.legado);
  return {
    id_archivo: legado ? legado.id_archivo : null,
    documentos: lista.filter(d => !d.legado).map(d => (d.id ? { id: d.id } : { id_archivo: d.id_archivo }))
  };
}

/** Celda de tablas y listas: "Ver" con uno, el desplegable con todos si son varios. */
export function ArchivosEntrega({ entrega, className = 'text-brand-700 text-xs hover:underline' }) {
  const docs = documentosDeEntrega(entrega);
  if (docs.length === 0) return '—';
  if (docs.length === 1) return <FileLink archivo={docs[0]} className={className}>Ver</FileLink>;
  return (
    <details className="text-xs">
      <summary className="cursor-pointer text-brand-700 hover:underline select-none">{docs.length} documentos</summary>
      <ul className="mt-1 space-y-0.5 max-h-48 overflow-y-auto scroll-thin">
        {docs.map(a => (
          <li key={a.id}>
            <FileLink archivo={a} className="text-brand-700 hover:underline truncate block max-w-[16rem] text-left">
              {a.nombre_original || 'Ver archivo'}
            </FileLink>
          </li>
        ))}
      </ul>
    </details>
  );
}

/**
 * Campo "Documentos" del formulario de entrega. Se eligen —o se arrastran—
 * todos a la vez y se suben uno tras otro con su barra de progreso. Cada uno
 * entra a la lista en cuanto termina: si la tanda se corta a medias, lo ya
 * subido queda en la lista. La entrega se guarda con el botón del formulario.
 *
 * Props:
 *   documentos     — lista de documentosFormDeEntrega / los recién subidos
 *   setDocumentos  — recibe una función (lista anterior → lista nueva)
 *   carga          — instancia de useCargaArchivos (el padre bloquea "Guardar" mientras sube)
 */
export default function CampoDocumentosEntrega({ documentos, setDocumentos, carga }) {
  const toast = useToast();
  const inputRef = useRef(null);
  const [arrastrando, setArrastrando] = useState(false);
  const subiendo = !!carga?.subiendo;

  const subir = async (files) => {
    const lista = Array.from(files || []);
    if (lista.length === 0 || subiendo) return;
    try {
      await carga.subirVarios(lista, 'entregas', {
        onArchivoSubido: (archivo) => {
          setDocumentos(prev => [...prev, { id_archivo: archivo.id, archivo }]);
        }
      });
      toast.success(lista.length === 1 ? 'Documento cargado' : `${lista.length} documentos cargados`);
    } catch (err) {
      if (!err?.cancelado) toast.error(err.response?.data?.error || 'Error al subir los documentos');
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

  const quitar = (idx) => setDocumentos(prev => prev.filter((_, i) => i !== idx));

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
          {subiendo ? 'Subiendo…' : '📎 Seleccionar documentos'}
        </button>
        <p className="text-xs text-slate-500 mt-2">
          Puede elegir varios a la vez (Ctrl o Shift, o Ctrl + A en la carpeta) o arrastrarlos aquí.
        </p>
      </div>

      <BarraProgresoCarga carga={carga} className="mt-2" />

      {documentos.length > 0 && (
        <div className="mt-2">
          <div className="text-xs text-slate-500 mb-1">
            {documentos.length === 1 ? '1 documento' : `${documentos.length} documentos`}
          </div>
          <ul className="divide-y divide-slate-100 rounded-lg ring-1 ring-slate-200 bg-white max-h-64 overflow-y-auto scroll-thin">
            {documentos.map((d, idx) => (
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
                  title="Quitar documento"
                  aria-label={`Quitar ${d.archivo?.nombre_original || 'documento'}`}
                >×</button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
