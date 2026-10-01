import { useRef, useState } from 'react';
import BarraProgresoCarga from '../common/BarraProgresoCarga.jsx';
import { FileLink } from '../common/FilePreview.jsx';
import { useToast } from '../common/Toast.jsx';
import { formatFechaHora } from '../../utils/formatters.js';
import {
  TIPOS_DOCUMENTO_FACTURA,
  TIPO_DOCUMENTO_FACTURA_INICIAL,
  TIPO_DOCUMENTO_FACTURA_OTRO,
  etiquetaTipoDocumentoFactura,
  rotuloCortoDocumentoFactura
} from '../../utils/catalogosDocumentoFactura.js';

/**
 * Piezas para los DOCUMENTOS ADICIONALES de una factura: los que acompañan al
 * comprobante (constancia de detracción, de retención, de pago, XML/CDR…).
 *
 *  - AgregarDocumentoFactura: elige el tipo, sube uno o varios archivos y avisa
 *    al llamador con los registros de tbl_archivos creados.
 *  - ListaDocumentosFactura: lista los documentos con su tipo y permite quitarlos.
 *  - DocumentosAdicionalesBorrador: las dos anteriores para el formulario de
 *    emisión, cuando la factura todavía no existe (los ids viajan en el payload).
 *  - ChipsDocumentosFactura: comprobante + documentos como chips con vista previa.
 *  - CeldaDocumentosFactura: los chips y el botón "+ Documento" de las tablas.
 */

/**
 * Selector de tipo + descripción + botón de adjuntar.
 *
 * Props:
 *   carga             — instancia de useCargaArchivos (el padre la usa para
 *                       bloquear su botón de guardar mientras se sube)
 *   onArchivosSubidos — async (archivos, { tipo_documento, descripcion }) => void
 *   disabled
 */
export function AgregarDocumentoFactura({ carga, onArchivosSubidos, disabled = false }) {
  const toast = useToast();
  const inputRef = useRef(null);
  const [tipo, setTipo] = useState(TIPO_DOCUMENTO_FACTURA_INICIAL);
  const [descripcion, setDescripcion] = useState('');
  const esOtro = tipo === TIPO_DOCUMENTO_FACTURA_OTRO;

  const seleccionar = async (e) => {
    const files = Array.from(e.target.files || []);
    e.target.value = '';
    if (files.length === 0) return;
    // "Otro" no dice nada por sí solo: sin descripción no se sabría qué es.
    if (esOtro && !descripcion.trim()) {
      toast.error('Describe el documento cuando el tipo es «Otro»');
      return;
    }
    try {
      const subidos = await carga.subirVarios(files, 'facturas');
      await onArchivosSubidos(subidos, { tipo_documento: tipo, descripcion: descripcion.trim() || null });
      setDescripcion('');
    } catch (err) {
      if (!err?.cancelado) toast.error(err.response?.data?.error || 'Error al subir el documento');
    }
  };

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-1 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] gap-2">
        <select className="select" value={tipo} onChange={e => setTipo(e.target.value)} disabled={disabled || carga.subiendo}>
          {TIPOS_DOCUMENTO_FACTURA.map(t => <option key={t.codigo} value={t.codigo}>{t.etiqueta}</option>)}
        </select>
        <input
          className="input"
          maxLength={200}
          value={descripcion}
          onChange={e => setDescripcion(e.target.value)}
          placeholder={esOtro ? 'Descripción del documento *' : 'Descripción (opcional)'}
          disabled={disabled || carga.subiendo}
        />
        <input ref={inputRef} type="file" multiple className="hidden" onChange={seleccionar} />
        <button
          type="button"
          className="btn-secondary text-xs whitespace-nowrap"
          onClick={() => inputRef.current?.click()}
          disabled={disabled || carga.subiendo}
        >
          {carga.subiendo ? 'Subiendo…' : '+ Adjuntar archivo'}
        </button>
      </div>
      <BarraProgresoCarga carga={carga} />
    </div>
  );
}

/**
 * Lista de documentos adicionales.
 *
 * Props:
 *   documentos — [{ id?, tipo_documento, descripcion, archivo, date_time_registration? }]
 *   onQuitar   — (documento, indice) => void; sin él la lista es de solo lectura
 *   quitandoId — id del documento que se está quitando (deshabilita su botón)
 */
export function ListaDocumentosFactura({ documentos, onQuitar, quitandoId = null }) {
  if (!documentos?.length) return null;
  return (
    <ul className="divide-y divide-slate-100 rounded-lg ring-1 ring-slate-200 bg-white">
      {documentos.map((d, idx) => (
        <li key={d.id ?? `borrador-${idx}`} className="flex items-center gap-3 px-3 py-2 text-sm">
          <span className="badge-blue text-[10px] shrink-0">{etiquetaTipoDocumentoFactura(d.tipo_documento)}</span>
          <div className="min-w-0 flex-1">
            {d.archivo
              ? <FileLink archivo={d.archivo} className="text-brand-700 hover:underline text-xs truncate block max-w-full text-left">
                  {d.archivo.nombre_original}
                </FileLink>
              : <span className="text-xs text-slate-400">Archivo no disponible</span>}
            {(d.descripcion || d.date_time_registration) && (
              <div className="text-[11px] text-slate-500 truncate">
                {d.descripcion}
                {d.descripcion && d.date_time_registration ? ' · ' : ''}
                {d.date_time_registration ? formatFechaHora(d.date_time_registration) : ''}
              </div>
            )}
          </div>
          {onQuitar && (
            <button
              type="button"
              onClick={() => onQuitar(d, idx)}
              disabled={quitandoId != null && quitandoId === d.id}
              className="text-slate-400 hover:text-rose-600 text-lg leading-none disabled:opacity-40"
              title="Quitar documento"
              aria-label={`Quitar ${d.archivo?.nombre_original || 'documento'}`}
            >×</button>
          )}
        </li>
      ))}
    </ul>
  );
}

/**
 * Documentos adicionales en el formulario de EMISIÓN: la factura aún no existe,
 * así que los archivos se suben al storage y sus ids viajan en el payload de
 * creación como `documentos: [{ id_archivo, tipo_documento, descripcion }]`
 * (ver `aPayloadDocumentos`).
 *
 * Props: value, onChange, carga (useCargaArchivos del padre)
 */
export function DocumentosAdicionalesBorrador({ value = [], onChange, carga }) {
  return (
    <div>
      <label className="label">Documentos adicionales</label>
      <p className="text-xs text-slate-500 mb-2">
        Opcional. Constancia de detracción, de retención, de pago, XML/CDR… También pueden agregarse después, desde la factura.
      </p>
      <AgregarDocumentoFactura
        carga={carga}
        onArchivosSubidos={async (archivos, datos) => {
          onChange([...value, ...archivos.map(a => ({ id_archivo: a.id, archivo: a, ...datos }))]);
        }}
      />
      {value.length > 0 && (
        <div className="mt-2">
          <ListaDocumentosFactura documentos={value} onQuitar={(_, idx) => onChange(value.filter((__, i) => i !== idx))} />
        </div>
      )}
    </div>
  );
}

/** Borrador → payload de `facturasService.create`. */
export function aPayloadDocumentos(borrador) {
  return (borrador || []).map(d => ({
    id_archivo: d.id_archivo,
    tipo_documento: d.tipo_documento,
    descripcion: d.descripcion
  }));
}

const CHIP = 'inline-flex items-center rounded-md px-2 py-0.5 text-[11px] font-medium ring-1 transition whitespace-nowrap';

/**
 * Todos los documentos de una factura como chips: el comprobante primero
 * ("Factura" / "Boleta") y luego cada documento adicional rotulado por su tipo.
 * Un clic abre la vista previa del archivo. Solo lectura: lo usan las tablas y
 * las fichas (Cliente 360, historial del ascensor).
 */
export function ChipsDocumentosFactura({ factura }) {
  const documentos = factura.documentos || [];
  if (!factura.archivo && documentos.length === 0) return null;
  return (
    <>
      {factura.archivo && (
        <FileLink
          archivo={factura.archivo}
          title={`Comprobante · ${factura.archivo.nombre_original || ''}`}
          className={`${CHIP} bg-brand-50 text-brand-700 ring-brand-200 hover:bg-brand-100`}
        >
          {factura.tipo_comprobante || 'Factura'}
        </FileLink>
      )}
      {documentos.map(d => d.archivo && (
        <FileLink
          key={d.id}
          archivo={d.archivo}
          title={[etiquetaTipoDocumentoFactura(d.tipo_documento), d.descripcion, d.archivo.nombre_original].filter(Boolean).join(' · ')}
          className={`${CHIP} bg-white text-slate-700 ring-slate-200 hover:bg-slate-50 hover:text-brand-700`}
        >
          {rotuloCortoDocumentoFactura(d)}
        </FileLink>
      ))}
    </>
  );
}

/**
 * Celda "Documentos" de las tablas de facturas: los chips de vista previa y el
 * botón para agregar (o quitar) documentos.
 */
export function CeldaDocumentosFactura({ factura, onAbrir }) {
  const sinNada = !factura.archivo && !(factura.documentos?.length);
  return (
    <div className="flex flex-wrap items-center gap-1.5 max-w-[22rem]">
      <ChipsDocumentosFactura factura={factura} />
      {sinNada && <span className="text-slate-400 text-xs">Sin archivos</span>}
      <button
        type="button"
        onClick={onAbrir}
        title="Agregar o quitar documentos: constancia de detracción, de pago, XML/CDR…"
        className={`${CHIP} ring-0 border border-dashed border-slate-300 text-slate-600 hover:border-brand-400 hover:text-brand-700 hover:bg-brand-50`}
      >
        + Documento
      </button>
    </div>
  );
}
