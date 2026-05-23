import Modal from './Modal.jsx';
import { FileLink, useFilePreview } from './FilePreview.jsx';
import { assetUrl } from '../../services/apiClient';

/**
 * Modal de Orden de Trabajo (OT).
 * Muestra el número de OT y el documento adjunto cargado por el técnico al
 * finalizar el servicio. Se usa desde Contabilidad y Gestión de cobros.
 */
export default function OtModal({ open, onClose, numero, archivo }) {
  const filePreview = useFilePreview();
  const ruta = archivo?.ruta_almacenamiento;
  const esImagen = (archivo?.mime_type || '').startsWith('image/');

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Orden de Trabajo"
      size="md"
      footer={<button type="button" onClick={onClose} className="btn-secondary">Cerrar</button>}
    >
      <div className="space-y-4">
        <div>
          <div className="text-[10px] uppercase tracking-wider text-slate-400">Número de OT</div>
          <div className="font-mono text-base text-slate-800">{numero || '—'}</div>
        </div>
        <div>
          <div className="text-[10px] uppercase tracking-wider text-slate-400 mb-1">Documento</div>
          {!archivo ? (
            <p className="text-sm text-slate-500">Sin documento adjunto.</p>
          ) : esImagen ? (
            <button
              type="button"
              onClick={() => filePreview.open(archivo)}
              className="block w-full rounded-md overflow-hidden ring-1 ring-slate-200 hover:ring-brand-400 transition"
            >
              <img
                src={assetUrl(ruta)}
                alt={archivo.nombre_original}
                className="w-full max-h-96 object-contain bg-slate-50"
              />
            </button>
          ) : (
            <FileLink archivo={archivo} className="btn-secondary inline-flex items-center gap-2 text-sm">
              Ver documento
            </FileLink>
          )}
        </div>
      </div>
    </Modal>
  );
}
