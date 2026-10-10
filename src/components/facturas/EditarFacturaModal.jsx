import { useCallback, useEffect, useRef, useState } from 'react';
import { facturasService } from '../../services';
import Modal from '../common/Modal.jsx';
import Loader from '../common/Loader.jsx';
import BarraProgresoCarga from '../common/BarraProgresoCarga.jsx';
import { FileLink } from '../common/FilePreview.jsx';
import { useToast } from '../common/Toast.jsx';
import useCargaArchivos from '../../hooks/useCargaArchivos.js';
import { AgregarDocumentoFactura } from './DocumentosFactura.jsx';
import { formatFecha, formatFechaHora, formatMonto } from '../../utils/formatters.js';
import { TIPOS_COMPROBANTE, ejemploNumeroComprobante } from '../../utils/catalogosComprobante.js';
import {
  TIPOS_DOCUMENTO_FACTURA,
  TIPO_DOCUMENTO_FACTURA_OTRO,
  etiquetaTipoDocumentoFactura
} from '../../utils/catalogosDocumentoFactura.js';
import { ESTADO_FACTURA_ANULADA, ESTADO_FACTURA_EMITIDA, ESTADO_FACTURA_ENVIADA } from '../../utils/estadoFactura.js';

// Estados que se eligen al editar. Anular tiene su propia acción (pide motivo).
const ESTADOS_EDITABLES = [ESTADO_FACTURA_EMITIDA, ESTADO_FACTURA_ENVIADA];

// Datos de la factura → valores del formulario (todo como texto, para comparar).
const formDesde = (f) => ({
  tipo_comprobante: f.tipo_comprobante || TIPOS_COMPROBANTE[0].codigo,
  numero_factura: f.numero_factura || '',
  fecha_emision: f.fecha_emision ? String(f.fecha_emision).slice(0, 10) : '',
  monto: f.monto != null ? Number(f.monto).toFixed(2) : '',
  id_cuota: f.id_cuota ? String(f.id_cuota) : '',
  estado_factura: f.estado_factura || ESTADO_FACTURA_EMITIDA
});

/**
 * Edición TOTAL de una factura ya registrada:
 *  - Datos: tipo de comprobante, número, fecha de emisión, monto, cobertura
 *    (general o una cuota) y estado. Se guardan juntos con «Guardar cambios».
 *  - Comprobante: adjuntar, reemplazar o quitar el archivo.
 *  - Documentos adicionales (constancia de detracción, de pago, XML/CDR…):
 *    agregar, cambiar tipo y descripción, reemplazar el archivo o quitarlos.
 *    Cada acción sobre un archivo se guarda en el momento.
 *
 * Las reglas (cobertura, monto de la cuota, factura anulada) las valida el
 * backend; aquí solo se anticipan para no ofrecer opciones que va a rechazar.
 *
 * Props:
 *   open, onClose — control del modal
 *   factura       — { id, numero_factura } de la factura
 *   onCambio      — callback tras cada cambio guardado, para que la tabla recargue
 */
export default function EditarFacturaModal({ open, onClose, factura, onCambio }) {
  const toast = useToast();
  const idFactura = factura?.id;
  const [cargando, setCargando] = useState(false);
  const [ctx, setCtx] = useState(null); // { factura, moneda, cuotas, otras_facturas }
  const [form, setForm] = useState(null);
  const [guardando, setGuardando] = useState(false);
  const [comprobante, setComprobante] = useState(null);
  const [documentos, setDocumentos] = useState([]);
  const [max, setMax] = useState(null);
  const [docOcupado, setDocOcupado] = useState(null); // id del documento con una acción en curso
  const carga = useCargaArchivos();             // documentos nuevos
  const cargaComprobante = useCargaArchivos();  // comprobante
  const cargaReemplazo = useCargaArchivos();    // archivo nuevo de un documento
  const inputComprobanteRef = useRef(null);

  const aplicarDocumentos = (r) => {
    setComprobante(r?.data?.comprobante || null);
    setDocumentos(r?.data?.documentos || []);
    if (r?.meta?.max != null) setMax(r.meta.max);
  };

  const cargar = useCallback(async () => {
    if (!open || !idFactura) return;
    setCargando(true);
    try {
      const [contexto, docs] = await Promise.all([
        facturasService.contextoEdicion(idFactura),
        facturasService.listarDocumentos(idFactura)
      ]);
      setCtx(contexto);
      setForm(formDesde(contexto.factura));
      aplicarDocumentos(docs);
    } catch (err) {
      setCtx(null);
      toast.error(err.response?.data?.error || 'No se pudo cargar la factura');
    } finally {
      setCargando(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, idFactura]);

  useEffect(() => { cargar(); }, [cargar]);
  // Al cerrar se olvida la factura: reabrir otra no debe mostrar la anterior.
  useEffect(() => {
    if (!open) { setCtx(null); setForm(null); }
  }, [open]);

  const ocupado = guardando || carga.subiendo || cargaComprobante.subiendo || cargaReemplazo.subiendo || docOcupado != null;
  const original = ctx ? formDesde(ctx.factura) : null;
  const cambios = form && original
    ? Object.fromEntries(Object.entries(form).filter(([k, v]) => v !== original[k]))
    : {};
  const hayCambios = Object.keys(cambios).length > 0;
  const anulada = ctx?.factura.estado_factura === ESTADO_FACTURA_ANULADA;
  const moneda = ctx?.moneda;
  const cuotas = ctx?.cuotas || [];
  const otras = ctx?.otras_facturas || [];
  const otraGeneral = otras.find(f => f.id_cuota === null);
  const hayOtrasPorCuota = otras.some(f => f.id_cuota !== null);
  const facturaDeCuota = (idCuota) => otras.find(f => f.id_cuota === idCuota);
  const cuotaElegida = cuotas.find(c => String(c.id) === form?.id_cuota) || null;
  const alTope = max != null && documentos.length >= max;

  const setCampo = (k, v) => setForm(f => ({ ...f, [k]: v }));
  // Factura de cuota: su monto es el de la cuota (regla del backend).
  const cambiarCobertura = (valor) => setForm(f => {
    const cuota = cuotas.find(c => String(c.id) === valor);
    return { ...f, id_cuota: valor, monto: cuota ? Number(cuota.monto).toFixed(2) : f.monto };
  });

  const cerrar = () => {
    if (ocupado) return;
    if (hayCambios && !confirm('Hay cambios sin guardar en los datos de la factura. ¿Cerrar sin guardarlos?')) return;
    onClose();
  };

  const avisarCambio = () => onCambio?.();

  const guardar = async () => {
    if (!hayCambios || ocupado) return;
    if (!form.numero_factura.trim()) return toast.error('El número de comprobante es obligatorio');
    if (!form.fecha_emision) return toast.error('La fecha de emisión es obligatoria');
    if (form.monto === '' || !(Number(form.monto) >= 0)) return toast.error('Monto inválido');
    const payload = { ...cambios };
    if ('id_cuota' in payload) payload.id_cuota = payload.id_cuota ? Number(payload.id_cuota) : null;
    setGuardando(true);
    try {
      await facturasService.update(idFactura, payload);
      toast.success('Factura actualizada');
      avisarCambio();
      // Relee lo guardado (y las opciones de cobertura) sin pasar por el Loader.
      const contexto = await facturasService.contextoEdicion(idFactura);
      setCtx(contexto);
      setForm(formDesde(contexto.factura));
    } catch (err) {
      toast.error(err.response?.data?.error || 'Error al guardar la factura');
    } finally {
      setGuardando(false);
    }
  };

  // ---- Comprobante ---------------------------------------------------------
  const subirComprobante = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (comprobante && !confirm(`Se reemplazará el comprobante «${comprobante.nombre_original || 'actual'}». El archivo anterior se eliminará. ¿Continuar?`)) return;
    try {
      const archivo = await cargaComprobante.subirUno(file, 'facturas');
      aplicarDocumentos(await facturasService.adjuntarComprobante(idFactura, archivo.id));
      toast.success(comprobante ? 'Comprobante reemplazado' : 'Comprobante adjuntado');
      avisarCambio();
    } catch (err) {
      if (!err?.cancelado) toast.error(err.response?.data?.error || 'Error al subir el comprobante');
    }
  };

  const quitarComprobante = async () => {
    if (!comprobante) return;
    if (!confirm(`¿Quitar el comprobante «${comprobante.nombre_original || ''}»? El archivo se eliminará.`)) return;
    setDocOcupado('comprobante');
    try {
      aplicarDocumentos(await facturasService.quitarComprobante(idFactura));
      toast.success('Comprobante quitado');
      avisarCambio();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Error al quitar el comprobante');
    } finally {
      setDocOcupado(null);
    }
  };

  // ---- Documentos adicionales ---------------------------------------------
  // Un error (p. ej. el tope de documentos) se propaga a AgregarDocumentoFactura,
  // que lo muestra y conserva lo escrito.
  const agregarDocumentos = async (archivos, datos) => {
    aplicarDocumentos(await facturasService.agregarDocumentos(
      idFactura,
      archivos.map(a => ({ id_archivo: a.id, ...datos }))
    ));
    toast.success(archivos.length === 1 ? 'Documento agregado' : `${archivos.length} documentos agregados`);
    avisarCambio();
  };

  // Devuelve true si se guardó (la fila sale del modo edición).
  const editarDocumento = async (doc, datos) => {
    setDocOcupado(doc.id);
    try {
      aplicarDocumentos(await facturasService.editarDocumento(idFactura, doc.id, datos));
      toast.success('Documento actualizado');
      avisarCambio();
      return true;
    } catch (err) {
      toast.error(err.response?.data?.error || 'Error al editar el documento');
      return false;
    } finally {
      setDocOcupado(null);
    }
  };

  const reemplazarArchivoDocumento = async (doc, file) => {
    if (!confirm(`Se reemplazará el archivo «${doc.archivo?.nombre_original || doc.tipo_documento}». El anterior se eliminará. ¿Continuar?`)) return;
    setDocOcupado(doc.id);
    try {
      const archivo = await cargaReemplazo.subirUno(file, 'facturas');
      aplicarDocumentos(await facturasService.editarDocumento(idFactura, doc.id, { id_archivo: archivo.id }));
      toast.success('Archivo reemplazado');
      avisarCambio();
    } catch (err) {
      if (!err?.cancelado) toast.error(err.response?.data?.error || 'Error al reemplazar el archivo');
    } finally {
      setDocOcupado(null);
    }
  };

  const quitarDocumento = async (doc) => {
    if (!confirm(`¿Quitar el documento «${doc.archivo?.nombre_original || doc.tipo_documento}» de la factura?`)) return;
    setDocOcupado(doc.id);
    try {
      aplicarDocumentos(await facturasService.eliminarDocumento(idFactura, doc.id));
      toast.success('Documento quitado');
      avisarCambio();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Error al quitar el documento');
    } finally {
      setDocOcupado(null);
    }
  };

  const etiquetaGeneral = ctx?.factura.es_plan ? 'General (todo el plan)' : 'General (todo el servicio)';
  // La cuota actual puede no figurar entre las vigentes (cuota dada de baja):
  // se ofrece igual para que el selector no mienta sobre lo guardado.
  const cuotaActualFuera = form?.id_cuota && original?.id_cuota === form.id_cuota && !cuotaElegida;

  return (
    <Modal
      open={open}
      onClose={cerrar}
      title={`Editar factura · ${ctx?.factura.numero_factura || factura?.numero_factura || ''}`}
      banner={anulada ? (
        <p className="text-xs text-amber-800">
          Factura <strong>anulada</strong>: puedes corregir sus datos y archivos, pero no su cobertura ni su estado.
        </p>
      ) : null}
      footer={<>
        <button type="button" className="btn-secondary" onClick={cerrar} disabled={ocupado}>Cerrar</button>
        <button type="button" className="btn-primary" onClick={guardar} disabled={!hayCambios || ocupado}>
          {guardando ? 'Guardando…' : 'Guardar cambios'}
        </button>
      </>}
    >
      {cargando ? <Loader /> : !ctx || !form ? (
        <p className="text-sm text-slate-500">No se pudo cargar la factura.</p>
      ) : (
        <div className="space-y-5">
          <section className="space-y-3">
            <h4 className="label">Datos del comprobante</h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="label">Tipo de comprobante *</label>
                <select className="select" value={form.tipo_comprobante} onChange={e => setCampo('tipo_comprobante', e.target.value)} disabled={ocupado}>
                  {TIPOS_COMPROBANTE.map(t => <option key={t.codigo} value={t.codigo}>{t.etiqueta}</option>)}
                </select>
              </div>
              <div>
                <label className="label">Número de comprobante *</label>
                <input
                  className="input font-mono"
                  maxLength={50}
                  value={form.numero_factura}
                  onChange={e => setCampo('numero_factura', e.target.value)}
                  placeholder={ejemploNumeroComprobante(form.tipo_comprobante)}
                  disabled={ocupado}
                />
              </div>
              <div>
                <label className="label">Fecha de emisión *</label>
                <input type="date" className="input" value={form.fecha_emision} onChange={e => setCampo('fecha_emision', e.target.value)} disabled={ocupado} />
              </div>
              <div>
                <label className="label">Estado</label>
                {anulada ? (
                  <div className="text-sm text-slate-500 py-2">Anulada</div>
                ) : (
                  <select className="select" value={form.estado_factura} onChange={e => setCampo('estado_factura', e.target.value)} disabled={ocupado}>
                    {[...new Set([...ESTADOS_EDITABLES, original.estado_factura])].map(e => <option key={e} value={e}>{e}</option>)}
                  </select>
                )}
              </div>
              <div className="sm:col-span-2">
                <label className="label">Cobertura</label>
                <select className="select" value={form.id_cuota} onChange={e => cambiarCobertura(e.target.value)} disabled={ocupado || anulada}>
                  <option value="" disabled={original.id_cuota !== '' && (!!otraGeneral || hayOtrasPorCuota)}>
                    {etiquetaGeneral}{otraGeneral ? ` · ya existe la ${otraGeneral.numero_factura}` : hayOtrasPorCuota ? ' · hay facturas por cuota' : ''}
                  </option>
                  {cuotaActualFuera && (
                    <option value={form.id_cuota}>Cuota N° {ctx.factura.numero_cuota ?? '?'} (ya no vigente)</option>
                  )}
                  {cuotas.map(c => {
                    const ocupadaPor = facturaDeCuota(c.id);
                    const esActual = original.id_cuota === String(c.id);
                    return (
                      <option key={c.id} value={String(c.id)} disabled={!esActual && (!!ocupadaPor || !!otraGeneral)}>
                        Cuota N° {c.numero_cuota} · vence {formatFecha(c.fecha_vencimiento)} · {formatMonto(c.monto, moneda)}
                        {ocupadaPor ? ` · facturada (${ocupadaPor.numero_factura})` : ''}
                      </option>
                    );
                  })}
                </select>
                {!anulada && otraGeneral && <p className="text-xs text-amber-700 mt-1">Ya hay otra factura general ({otraGeneral.numero_factura}): esta no puede pasar a cubrir una cuota.</p>}
              </div>
              <div className="sm:col-span-2">
                <label className="label">Monto *</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  className={`input font-mono ${cuotaElegida && !anulada ? 'bg-slate-100 cursor-not-allowed' : ''}`}
                  value={form.monto}
                  onChange={e => setCampo('monto', e.target.value)}
                  readOnly={!!cuotaElegida && !anulada}
                  disabled={ocupado}
                />
                {cuotaElegida && !anulada && <p className="text-xs text-slate-500 mt-1">Fijado por el monto de la cuota N° {cuotaElegida.numero_cuota}.</p>}
              </div>
            </div>
            {hayCambios && <p className="text-xs text-brand-700">Hay cambios sin guardar en los datos.</p>}
          </section>

          <section className="border-t border-slate-100 pt-4">
            <h4 className="label">Comprobante</h4>
            <div className="flex flex-wrap items-center gap-3">
              {comprobante ? (
                <FileLink archivo={comprobante} className="text-brand-700 hover:underline text-sm truncate max-w-full">
                  {comprobante.nombre_original || 'Ver comprobante'}
                </FileLink>
              ) : (
                <span className="text-sm text-slate-400">Sin comprobante adjunto</span>
              )}
              <input ref={inputComprobanteRef} type="file" className="hidden" onChange={subirComprobante} />
              <button type="button" className="btn-secondary text-xs" onClick={() => inputComprobanteRef.current?.click()} disabled={ocupado}>
                {cargaComprobante.subiendo ? 'Subiendo…' : comprobante ? 'Reemplazar archivo' : '+ Adjuntar comprobante'}
              </button>
              {comprobante && (
                <button type="button" className="text-rose-600 text-xs hover:underline disabled:opacity-40" onClick={quitarComprobante} disabled={ocupado}>
                  Quitar
                </button>
              )}
            </div>
            <BarraProgresoCarga carga={cargaComprobante} className="mt-2" />
          </section>

          <section className="border-t border-slate-100 pt-4 space-y-3">
            <div>
              <h4 className="label">Documentos adicionales · {documentos.length}</h4>
              <p className="text-xs text-slate-500">
                Constancia de detracción, de retención, de pago, XML/CDR de SUNAT, guía de remisión…
              </p>
            </div>
            {documentos.length === 0 ? (
              <p className="text-sm text-slate-400">Sin documentos adicionales.</p>
            ) : (
              <ul className="divide-y divide-slate-100 rounded-lg ring-1 ring-slate-200 bg-white">
                {documentos.map(doc => (
                  <DocumentoEditable
                    key={doc.id}
                    doc={doc}
                    ocupado={ocupado}
                    onGuardar={editarDocumento}
                    onReemplazar={reemplazarArchivoDocumento}
                    onQuitar={quitarDocumento}
                  />
                ))}
              </ul>
            )}
            <BarraProgresoCarga carga={cargaReemplazo} />
            {alTope
              ? <p className="text-xs text-amber-700">Límite de {max} documentos alcanzado.</p>
              : <AgregarDocumentoFactura carga={carga} onArchivosSubidos={agregarDocumentos} disabled={ocupado && !carga.subiendo} />}
          </section>
        </div>
      )}
    </Modal>
  );
}

/**
 * Fila de un documento adicional: lo muestra con sus acciones (editar tipo y
 * descripción, reemplazar el archivo, quitar) y, en modo edición, el formulario.
 */
function DocumentoEditable({ doc, ocupado, onGuardar, onReemplazar, onQuitar }) {
  const toast = useToast();
  const inputRef = useRef(null);
  const [editando, setEditando] = useState(false);
  const [tipo, setTipo] = useState(doc.tipo_documento);
  const [descripcion, setDescripcion] = useState(doc.descripcion || '');

  const abrirEdicion = () => {
    setTipo(doc.tipo_documento);
    setDescripcion(doc.descripcion || '');
    setEditando(true);
  };

  const guardar = async () => {
    // "Otro" no dice nada por sí solo: sin descripción no se sabría qué es.
    if (tipo === TIPO_DOCUMENTO_FACTURA_OTRO && !descripcion.trim()) {
      toast.error('Describe el documento cuando el tipo es «Otro»');
      return;
    }
    if (await onGuardar(doc, { tipo_documento: tipo, descripcion: descripcion.trim() || null })) setEditando(false);
  };

  const elegirArchivo = (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (file) onReemplazar(doc, file);
  };

  return (
    <li className="px-3 py-2 text-sm">
      {editando ? (
        <div className="grid grid-cols-1 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] gap-2 items-center">
          <select className="select" value={tipo} onChange={e => setTipo(e.target.value)} disabled={ocupado}>
            {TIPOS_DOCUMENTO_FACTURA.map(t => <option key={t.codigo} value={t.codigo}>{t.etiqueta}</option>)}
          </select>
          <input
            className="input"
            maxLength={200}
            value={descripcion}
            onChange={e => setDescripcion(e.target.value)}
            placeholder={tipo === TIPO_DOCUMENTO_FACTURA_OTRO ? 'Descripción del documento *' : 'Descripción (opcional)'}
            disabled={ocupado}
          />
          <div className="flex gap-2">
            <button type="button" className="btn-primary text-xs" onClick={guardar} disabled={ocupado}>Guardar</button>
            <button type="button" className="btn-secondary text-xs" onClick={() => setEditando(false)} disabled={ocupado}>Cancelar</button>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <span className="badge-blue text-[10px] shrink-0">{etiquetaTipoDocumentoFactura(doc.tipo_documento)}</span>
          <div className="min-w-0 flex-1">
            {doc.archivo
              ? <FileLink archivo={doc.archivo} className="text-brand-700 hover:underline text-xs truncate block max-w-full text-left">
                  {doc.archivo.nombre_original}
                </FileLink>
              : <span className="text-xs text-slate-400">Archivo no disponible</span>}
            {(doc.descripcion || doc.date_time_registration) && (
              <div className="text-[11px] text-slate-500 truncate">
                {doc.descripcion}
                {doc.descripcion && doc.date_time_registration ? ' · ' : ''}
                {doc.date_time_registration ? formatFechaHora(doc.date_time_registration) : ''}
              </div>
            )}
          </div>
          <div className="flex items-center gap-3 text-xs shrink-0">
            <button type="button" className="text-brand-700 hover:underline disabled:opacity-40" onClick={abrirEdicion} disabled={ocupado}>Editar</button>
            <button type="button" className="text-brand-700 hover:underline disabled:opacity-40" onClick={() => inputRef.current?.click()} disabled={ocupado}>Reemplazar</button>
            <button type="button" className="text-rose-600 hover:underline disabled:opacity-40" onClick={() => onQuitar(doc)} disabled={ocupado}>Quitar</button>
          </div>
        </div>
      )}
      <input ref={inputRef} type="file" className="hidden" onChange={elegirArchivo} />
    </li>
  );
}
