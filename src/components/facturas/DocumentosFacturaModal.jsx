import { useCallback, useEffect, useRef, useState } from 'react';
import { facturasService } from '../../services';
import Modal from '../common/Modal.jsx';
import Loader from '../common/Loader.jsx';
import BarraProgresoCarga from '../common/BarraProgresoCarga.jsx';
import { FileLink } from '../common/FilePreview.jsx';
import { useToast } from '../common/Toast.jsx';
import useCargaArchivos from '../../hooks/useCargaArchivos.js';
import { AgregarDocumentoFactura, ListaDocumentosFactura } from './DocumentosFactura.jsx';

/**
 * Documentos de una factura ya registrada: su comprobante y los documentos de
 * soporte que la acompañan (constancia de detracción, de retención, de pago,
 * XML/CDR…). Estos suelen llegar después de emitirla, por eso se gestionan aquí
 * y no solo en el formulario de emisión.
 *
 * El comprobante solo puede adjuntarse si la factura se registró sin él; no se
 * reemplaza (pudo enviarse ya al cliente con ese archivo).
 *
 * Props:
 *   open, onClose — control del modal
 *   factura       — { id, numero_factura } de la factura
 *   onCambio      — callback tras cada cambio, para que la tabla recargue
 */
export default function DocumentosFacturaModal({ open, onClose, factura, onCambio }) {
  const toast = useToast();
  const idFactura = factura?.id;
  const [comprobante, setComprobante] = useState(null);
  const [documentos, setDocumentos] = useState([]);
  const [max, setMax] = useState(null);
  const [cargando, setCargando] = useState(false);
  const [quitandoId, setQuitandoId] = useState(null);
  const carga = useCargaArchivos();
  const cargaComprobante = useCargaArchivos();
  const inputComprobanteRef = useRef(null);

  const aplicar = (r) => {
    setComprobante(r?.data?.comprobante || null);
    setDocumentos(r?.data?.documentos || []);
    if (r?.meta?.max != null) setMax(r.meta.max);
  };

  const cargar = useCallback(() => {
    if (!open || !idFactura) return;
    setCargando(true);
    facturasService.listarDocumentos(idFactura)
      .then(aplicar)
      .catch(() => { aplicar(null); toast.error('No se pudieron cargar los documentos'); })
      .finally(() => setCargando(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, idFactura]);

  useEffect(cargar, [cargar]);

  const ocupado = carga.subiendo || cargaComprobante.subiendo;
  const alTope = max != null && documentos.length >= max;

  // Un error (p. ej. el tope de documentos, que valida el backend) se propaga a
  // AgregarDocumentoFactura, que lo muestra y conserva lo escrito.
  const agregar = async (archivos, datos) => {
    aplicar(await facturasService.agregarDocumentos(
      idFactura,
      archivos.map(a => ({ id_archivo: a.id, ...datos }))
    ));
    toast.success(archivos.length === 1 ? 'Documento agregado' : `${archivos.length} documentos agregados`);
    onCambio?.();
  };

  const quitar = async (doc) => {
    if (!confirm(`¿Quitar el documento «${doc.archivo?.nombre_original || doc.tipo_documento}» de la factura?`)) return;
    setQuitandoId(doc.id);
    try {
      aplicar(await facturasService.eliminarDocumento(idFactura, doc.id));
      toast.success('Documento quitado');
      onCambio?.();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Error al quitar el documento');
    } finally {
      setQuitandoId(null);
    }
  };

  const adjuntarComprobante = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      const archivo = await cargaComprobante.subirUno(file, 'facturas');
      aplicar(await facturasService.adjuntarComprobante(idFactura, archivo.id));
      toast.success('Comprobante adjuntado');
      onCambio?.();
    } catch (err) {
      if (!err?.cancelado) toast.error(err.response?.data?.error || 'Error al adjuntar el comprobante');
    }
  };

  return (
    <Modal
      open={open}
      onClose={ocupado ? () => {} : onClose}
      title={`Documentos · ${factura?.numero_factura || ''}`}
      footer={<button type="button" className="btn-secondary" onClick={onClose} disabled={ocupado}>Cerrar</button>}
    >
      {cargando ? <Loader /> : (
        <div className="space-y-5">
          <section>
            <h4 className="label">Comprobante</h4>
            {comprobante ? (
              <FileLink archivo={comprobante} className="text-brand-700 hover:underline text-sm">
                {comprobante.nombre_original || 'Ver comprobante'}
              </FileLink>
            ) : (
              <div className="flex flex-wrap items-center gap-3">
                <span className="text-sm text-slate-400">Sin comprobante adjunto</span>
                <input ref={inputComprobanteRef} type="file" className="hidden" onChange={adjuntarComprobante} />
                <button
                  type="button"
                  className="btn-secondary text-xs"
                  onClick={() => inputComprobanteRef.current?.click()}
                  disabled={ocupado}
                >
                  {cargaComprobante.subiendo ? 'Subiendo…' : '+ Adjuntar comprobante'}
                </button>
              </div>
            )}
            <BarraProgresoCarga carga={cargaComprobante} className="mt-2" />
          </section>

          <section className="border-t border-slate-100 pt-4 space-y-3">
            <div>
              <h4 className="label">Documentos adicionales · {documentos.length}</h4>
              <p className="text-xs text-slate-500">
                Constancia de detracción, de retención, de pago, XML/CDR de SUNAT, guía de remisión…
              </p>
            </div>
            {documentos.length === 0
              ? <p className="text-sm text-slate-400">Sin documentos adicionales.</p>
              : <ListaDocumentosFactura documentos={documentos} onQuitar={quitar} quitandoId={quitandoId} />}
            {alTope
              ? <p className="text-xs text-amber-700">Límite de {max} documentos alcanzado.</p>
              : <AgregarDocumentoFactura carga={carga} onArchivosSubidos={agregar} disabled={cargaComprobante.subiendo} />}
          </section>
        </div>
      )}
    </Modal>
  );
}
