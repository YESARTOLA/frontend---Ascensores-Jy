import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { assetUrl } from '../../services/apiClient';

/**
 * Sistema global de preview de archivos.
 * Todos los archivos/imágenes adjuntos del aplicativo se abren en este modal,
 * SIN salir de la SPA y por encima de cualquier otro modal (z-[100]).
 */

const FilePreviewCtx = createContext({ open: () => {}, close: () => {} });
export const useFilePreview = () => useContext(FilePreviewCtx);

function detectarTipo(nombre, mime) {
  const ext = (nombre || '').split('.').pop()?.toLowerCase() || '';
  if ((mime || '').startsWith('image/') || ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'bmp', 'avif', 'ico', 'tiff'].includes(ext)) return 'imagen';
  if (mime === 'application/pdf' || ext === 'pdf') return 'pdf';
  if ((mime || '').startsWith('video/') || ['mp4', 'webm', 'mov', 'mkv', 'avi'].includes(ext)) return 'video';
  if ((mime || '').startsWith('audio/') || ['mp3', 'wav', 'ogg', 'm4a', 'flac', 'aac'].includes(ext)) return 'audio';
  if (['txt', 'json', 'log', 'csv', 'md', 'xml', 'html', 'js', 'css'].includes(ext)) return 'texto';
  if (['doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'odt', 'ods'].includes(ext)) return 'oficina';
  if (['zip', 'rar', '7z', 'tar', 'gz'].includes(ext)) return 'comprimido';
  return 'otro';
}

function iconoTipo(tipo) {
  const stroke = { imagen: '#0ea5e9', pdf: '#ef4444', video: '#8b5cf6', audio: '#10b981', texto: '#64748b', oficina: '#2563eb', comprimido: '#f59e0b', otro: '#64748b' }[tipo] || '#64748b';
  return (
    <svg width="56" height="56" viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
    </svg>
  );
}

/**
 * Descarga directa de un archivo del backend, sin abrir el preview.
 * Acepta el objeto del backend ({ruta_almacenamiento, nombre_original}) o
 * {url, name}. Para archivos grandes no se pasa por un blob: el backend
 * responde a `?download=1&n=<filename>` con una URL firmada que fuerza la
 * descarga (Content-Disposition: attachment).
 */
export function descargarArchivo(archivo) {
  if (!archivo) return;
  const url = archivo.url || (archivo.ruta_almacenamiento ? assetUrl(archivo.ruta_almacenamiento) : null);
  if (!url) return;
  const name = archivo.name || archivo.nombre_original || 'archivo';
  const sep = url.includes('?') ? '&' : '?';
  const a = document.createElement('a');
  a.href = `${url}${sep}download=1&n=${encodeURIComponent(name)}`;
  a.download = name;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
}

function PreviewModal({ file, onClose }) {
  const [imgZoom, setImgZoom] = useState(false);

  useEffect(() => {
    if (!file) return;
    setImgZoom(false);
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [file, onClose]);

  if (!file) return null;
  const { url, name, mime } = file;
  const tipo = detectarTipo(name, mime);

  const descargar = () => descargarArchivo({ url, name });

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/80 backdrop-blur-sm animate-fade-in" />

      {/* Toolbar */}
      <div className="absolute top-0 left-0 right-0 z-10 flex items-center justify-between px-4 sm:px-6 py-3 bg-gradient-to-b from-black/60 to-transparent">
        <div className="min-w-0 flex items-center gap-3 text-white">
          <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-white/15 backdrop-blur-sm text-[10.5px] uppercase tracking-wider font-semibold">
            {tipo === 'otro' ? 'archivo' : tipo}
          </span>
          <span className="text-sm font-medium truncate">{name || 'Archivo'}</span>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button onClick={descargar}
                  className="inline-flex items-center gap-1.5 h-9 px-3 rounded-lg bg-white/15 hover:bg-white/25 text-white text-xs font-medium transition"
                  title="Descargar">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" />
            </svg>
            <span className="hidden sm:inline">Descargar</span>
          </button>
          <button onClick={onClose}
                  className="grid place-items-center h-9 w-9 rounded-lg bg-white/15 hover:bg-white/25 text-white transition"
                  aria-label="Cerrar">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
      </div>

      {/* Contenido */}
      <div className="relative z-0 w-full h-full max-w-[1400px] max-h-[calc(100vh-32px)] flex items-center justify-center p-4 sm:p-12 animate-modal-in">
        <div className="w-full h-full flex items-center justify-center">
          {tipo === 'imagen' && (
            <img
              src={url}
              alt={name}
              onClick={() => setImgZoom(z => !z)}
              className={`${imgZoom ? 'max-w-none max-h-none cursor-zoom-out' : 'max-w-full max-h-full cursor-zoom-in'} object-contain rounded-lg shadow-2xl transition-transform select-none`}
              draggable={false}
            />
          )}
          {tipo === 'pdf' && (
            <iframe
              src={url}
              title={name}
              className="w-full h-full rounded-lg bg-white shadow-2xl"
            />
          )}
          {tipo === 'video' && (
            <video
              src={url}
              controls
              playsInline
              preload="metadata"
              controlsList="nodownload"
              className="max-w-full max-h-full rounded-lg shadow-2xl bg-black"
            />
          )}
          {tipo === 'audio' && (
            <div className="w-full max-w-xl bg-white/95 rounded-2xl p-6 shadow-2xl">
              <div className="text-sm font-medium text-slate-800 mb-3 truncate">{name}</div>
              <audio src={url} controls autoPlay className="w-full" />
            </div>
          )}
          {tipo === 'texto' && (
            <iframe src={url} title={name} className="w-full h-full rounded-lg bg-white shadow-2xl" />
          )}
          {(tipo === 'oficina' || tipo === 'comprimido' || tipo === 'otro') && (
            <div className="bg-white/95 rounded-2xl p-8 max-w-md text-center shadow-2xl">
              <div className="grid place-items-center mb-4">{iconoTipo(tipo)}</div>
              <div className="font-medium text-slate-800 truncate" title={name}>{name || 'Archivo'}</div>
              <div className="text-xs text-slate-500 mt-1 mb-5">
                {tipo === 'oficina' && 'Documento de Office — descárgalo para abrirlo.'}
                {tipo === 'comprimido' && 'Archivo comprimido — descárgalo para extraerlo.'}
                {tipo === 'otro' && 'Tipo de archivo no previsualizable directamente.'}
              </div>
              <button onClick={descargar}
                      className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-brand-600 hover:bg-brand-700 text-white text-sm font-medium transition">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" />
                </svg>
                Descargar
              </button>
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}

export function FilePreviewProvider({ children }) {
  const [file, setFile] = useState(null);
  const open = useCallback((f) => {
    if (!f) return;
    // Acepta {url, name, mime} o {ruta_almacenamiento, nombre_original, mime_type}
    const normalized = {
      url: f.url || (f.ruta_almacenamiento ? assetUrl(f.ruta_almacenamiento) : null),
      name: f.name || f.nombre_original || 'Archivo',
      mime: f.mime || f.mime_type || null
    };
    if (!normalized.url) return;
    setFile(normalized);
  }, []);
  const close = useCallback(() => setFile(null), []);

  return (
    <FilePreviewCtx.Provider value={{ open, close }}>
      {children}
      <PreviewModal file={file} onClose={close} />
    </FilePreviewCtx.Provider>
  );
}

/**
 * Reemplazo drop-in de `<a href={assetUrl(...)} target="_blank">Ver</a>`.
 * Acepta `archivo` (objeto del backend con ruta_almacenamiento/nombre_original/mime_type)
 * o props sueltas `src`/`name`/`mime`.
 */
export function FileLink({ archivo, src, name, mime, className, children, title }) {
  const { open } = useFilePreview();
  const url = src || (archivo?.ruta_almacenamiento ? assetUrl(archivo.ruta_almacenamiento) : null);
  const filename = name || archivo?.nombre_original || '';
  const mimeT = mime || archivo?.mime_type || null;
  if (!url) return null;
  return (
    <button
      type="button"
      title={title || filename}
      onClick={(e) => { e.preventDefault(); e.stopPropagation(); open({ url, name: filename, mime: mimeT }); }}
      className={className || 'text-brand-700 hover:underline cursor-pointer inline-flex items-center gap-1'}
    >
      {children || 'Ver'}
    </button>
  );
}
