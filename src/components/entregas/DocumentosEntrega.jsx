import CampoArchivosMultiples from '../common/CampoArchivosMultiples.jsx';
import { FileLink } from '../common/FilePreview.jsx';

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
 * Campo "Documentos" del formulario de entrega: el campo de varios archivos
 * (components/common/CampoArchivosMultiples.jsx) con los textos de entregas.
 * La entrega se guarda con el botón del formulario.
 *
 * Props:
 *   documentos     — lista de documentosFormDeEntrega / los recién subidos
 *   setDocumentos  — recibe una función (lista anterior → lista nueva)
 *   carga          — instancia de useCargaArchivos (el padre bloquea "Guardar" mientras sube)
 */
export default function CampoDocumentosEntrega({ documentos, setDocumentos, carga }) {
  return (
    <CampoArchivosMultiples
      archivos={documentos}
      setArchivos={setDocumentos}
      carga={carga}
      carpeta="entregas"
      singular="documento"
      plural="documentos"
      textoBoton="📎 Seleccionar documentos"
    />
  );
}
