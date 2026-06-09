import { useState } from 'react';
import { archivosService } from '../../services';
import { useToast } from '../common/Toast.jsx';
import { FileLink } from '../common/FilePreview.jsx';
import { sanearTelefono, formatTelefono } from '../../utils/formatters.js';

/**
 * Formulario completo de cliente (alta/edición), reutilizable desde cualquier
 * página (Clientes, conversión de Leads, etc.). Es controlado: el estado vive
 * en la página (`value`/`onChange`) y al enviar valida y entrega el payload
 * listo para clientesService.create/update vía `onSubmit(payload)`.
 *
 * Props:
 *   formId          — id del <form>, para botones submit externos (footer de Modal)
 *   value           — estado del formulario (usar clienteFormInicial como base)
 *   onChange        — setter del estado (estilo setForm)
 *   onSubmit        — callback con el payload ya construido y validado
 *   clasificaciones — catálogo de clasificaciones ({ codigo, etiqueta })
 *   tiposServicio   — catálogo de tipos de servicio (grilla de precios)
 *
 * La ubicación física (tipo Edificio/Obra, dirección, distrito, mapa) ya no vive
 * en el cliente: se gestiona en los edificios del cliente (ver EdificioForm).
 */

export const clienteFormInicial = {
  tipo_documento: 'RUC', numero_documento: '', nombre: '', observaciones: '',
  contacto_principal_nombre: '', contacto_principal_correo: '', contacto_principal_telefono: '',
  contacto_cobranzas_nombre: '', contacto_cobranzas_correo: '', contacto_cobranzas_telefono: '',
  contacto_admin_nombre: '', contacto_admin_correo: '', contacto_admin_telefono: '',
  contrato_inicio: '', contrato_fin: '',
  clasificacion: '',
  id_archivo_contrato: null,
  archivo_contrato: null,
  archivos: [], // [{ id_archivo, descripcion, orden, archivo: { id, nombre_original, ruta_almacenamiento, mime_type } }]
  precios: [] // [{ id_tipo_servicio, precio, moneda }]
};

/** Mapea un cliente del backend al estado del formulario (modo edición). */
export function clienteToForm(c, archivos = [], precios = []) {
  return {
    tipo_documento: c.tipo_documento, numero_documento: c.numero_documento || '',
    nombre: c.nombre,
    contacto_principal_nombre: c.contacto_principal_nombre || '',
    contacto_principal_correo: c.contacto_principal_correo || '',
    contacto_principal_telefono: sanearTelefono(c.contacto_principal_telefono || ''),
    contacto_cobranzas_nombre: c.contacto_cobranzas_nombre || '',
    contacto_cobranzas_correo: c.contacto_cobranzas_correo || '',
    contacto_cobranzas_telefono: sanearTelefono(c.contacto_cobranzas_telefono || ''),
    contacto_admin_nombre: c.contacto_admin_nombre || '',
    contacto_admin_correo: c.contacto_admin_correo || '',
    contacto_admin_telefono: sanearTelefono(c.contacto_admin_telefono || ''),
    observaciones: c.observaciones || '',
    contrato_inicio: c.contrato_inicio ? c.contrato_inicio.substring(0, 10) : '',
    contrato_fin: c.contrato_fin ? c.contrato_fin.substring(0, 10) : '',
    clasificacion: c.clasificacion || '',
    id_archivo_contrato: c.id_archivo_contrato || null,
    archivo_contrato: c.archivo_contrato || null,
    archivos,
    precios: precios.map(p => ({
      id_tipo_servicio: p.id_tipo_servicio,
      precio: p.precio !== undefined && p.precio !== null ? String(p.precio) : '',
      moneda: p.moneda || 'PEN'
    }))
  };
}

export default function ClienteForm({
  formId, value, onChange, onSubmit,
  clasificaciones = [], tiposServicio = []
}) {
  const toast = useToast();
  const [subiendoContrato, setSubiendoContrato] = useState(false);
  const [subiendoAdjuntos, setSubiendoAdjuntos] = useState(false);

  const subirContrato = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setSubiendoContrato(true);
    try {
      const fd = new FormData();
      fd.append('archivo', file);
      const arch = await archivosService.upload(fd, 'contratos');
      onChange(f => ({ ...f, id_archivo_contrato: arch.id, archivo_contrato: arch }));
      toast.success('Contrato adjuntado');
    } catch {
      toast.error('Error al adjuntar el contrato');
    } finally {
      setSubiendoContrato(false);
    }
  };

  const quitarContrato = () => {
    onChange(f => ({ ...f, id_archivo_contrato: null, archivo_contrato: null }));
  };

  const subirAdjuntos = async (e) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;
    setSubiendoAdjuntos(true);
    try {
      const nuevos = [];
      for (const file of files) {
        const fd = new FormData();
        fd.append('archivo', file);
        const arch = await archivosService.upload(fd, 'clientes');
        nuevos.push({ id_archivo: arch.id, descripcion: '', archivo: arch });
      }
      onChange(f => ({ ...f, archivos: [...f.archivos, ...nuevos] }));
      toast.success(`${nuevos.length} adjunto(s) cargado(s)`);
    } catch {
      toast.error('Error al adjuntar archivo(s)');
    } finally {
      setSubiendoAdjuntos(false);
      e.target.value = '';
    }
  };
  const cambiarDescripcionAdjunto = (idx, valor) => {
    onChange(f => ({
      ...f,
      archivos: f.archivos.map((a, i) => i === idx ? { ...a, descripcion: valor } : a)
    }));
  };
  const quitarAdjunto = (idx) => {
    onChange(f => ({ ...f, archivos: f.archivos.filter((_, i) => i !== idx) }));
  };

  const agregarPrecio = () => onChange(f => ({
    ...f,
    precios: [...f.precios, { id_tipo_servicio: '', precio: '', moneda: 'PEN' }]
  }));
  const cambiarPrecio = (idx, key, val) => {
    onChange(f => ({
      ...f,
      precios: f.precios.map((p, i) => i === idx ? { ...p, [key]: val } : p)
    }));
  };
  const quitarPrecio = (idx) => {
    onChange(f => ({ ...f, precios: f.precios.filter((_, i) => i !== idx) }));
  };
  // Tipos disponibles para agregar (excluye los ya elegidos en otras filas).
  const tiposDisponibles = (idx) => {
    const usados = new Set(value.precios.map((p, i) => i !== idx ? Number(p.id_tipo_servicio) : null).filter(Boolean));
    return tiposServicio.filter(t => !usados.has(t.id));
  };

  const enviar = (e) => {
    e.preventDefault();
    const payload = {
      ...value,
      id_archivo_contrato: value.id_archivo_contrato,
      archivos: value.archivos.map((a, i) => ({
        id_archivo: a.id_archivo,
        descripcion: a.descripcion || null,
        orden: i + 1
      })),
      precios: value.precios
        .filter(p => p.id_tipo_servicio && p.precio !== '' && p.precio !== null)
        .map(p => ({
          id_tipo_servicio: Number(p.id_tipo_servicio),
          precio: Number(p.precio),
          moneda: p.moneda || 'PEN'
        }))
    };
    delete payload.archivo_contrato;
    onSubmit(payload);
  };

  return (
    <form id={formId} onSubmit={enviar} className="grid grid-cols-1 sm:grid-cols-2 gap-4">
      <div className="sm:col-span-2">
        <label className="label">Razón social / Nombre *</label>
        <input className="input" required value={value.nombre} onChange={e => onChange(f => ({ ...f, nombre: e.target.value }))} />
      </div>
      <div>
        <label className="label">Tipo de documento</label>
        <select className="select" value={value.tipo_documento} onChange={e => onChange(f => ({ ...f, tipo_documento: e.target.value }))}>
          <option>RUC</option><option>DNI</option><option>CE</option>
        </select>
      </div>
      <div>
        <label className="label">Número de documento</label>
        <input className="input" value={value.numero_documento} onChange={e => onChange(f => ({ ...f, numero_documento: e.target.value }))} />
      </div>
      <div className="sm:col-span-2">
        <label className="label">Clasificación</label>
        <select className="select" value={value.clasificacion}
          onChange={e => onChange(f => ({ ...f, clasificacion: e.target.value }))}>
          <option value="">— Sin clasificar —</option>
          {clasificaciones.map(c => <option key={c.codigo} value={c.codigo}>{c.etiqueta}</option>)}
        </select>
        <p className="text-[11px] text-slate-500 mt-1">Etiqueta informativa para reportes y filtros. No afecta el flujo.</p>
      </div>
      <p className="sm:col-span-2 text-[11px] text-slate-500 -mt-1">La ubicación (edificios u obras con su mapa) se registra después, desde la ficha del cliente.</p>
      <div className="sm:col-span-2 grid grid-cols-1 gap-3">
        {[
          { key: 'principal',   etiqueta: 'Contacto principal' },
          { key: 'cobranzas',   etiqueta: 'Contacto de cobranzas' },
          { key: 'admin',       etiqueta: 'Contacto administrativo' }
        ].map(({ key, etiqueta }) => {
          const kNombre = `contacto_${key}_nombre`;
          const kCorreo = `contacto_${key}_correo`;
          const kTel    = `contacto_${key}_telefono`;
          return (
            <div key={key} className="border border-slate-200 rounded-lg p-3 bg-slate-50/40">
              <div className="text-xs font-semibold text-slate-700 mb-2">{etiqueta}</div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                <input className="input" placeholder="Nombre" value={value[kNombre]}
                  onChange={e => onChange(f => ({ ...f, [kNombre]: e.target.value }))} />
                <input className="input" type="email" placeholder="Correo" value={value[kCorreo]}
                  onChange={e => onChange(f => ({ ...f, [kCorreo]: e.target.value }))} />
                <input className="input" type="tel" inputMode="numeric" placeholder="Teléfono"
                  value={formatTelefono(value[kTel])}
                  onChange={e => onChange(f => ({ ...f, [kTel]: sanearTelefono(e.target.value) }))} />
              </div>
            </div>
          );
        })}
      </div>
      <div>
        <label className="label">Inicio contrato de servicio *</label>
        <input type="date" className="input" required value={value.contrato_inicio}
          onChange={e => onChange(f => ({ ...f, contrato_inicio: e.target.value }))} />
      </div>
      <div>
        <label className="label">Fin contrato de servicio *</label>
        <input type="date" className="input" required value={value.contrato_fin}
          min={value.contrato_inicio || undefined}
          onChange={e => onChange(f => ({ ...f, contrato_fin: e.target.value }))} />
      </div>
      <div className="sm:col-span-2 border border-slate-200 rounded-lg p-3 bg-slate-50">
        <label className="label">Contrato firmado</label>
        {value.archivo_contrato ? (
          <div className="flex items-center justify-between gap-2 text-sm">
            <FileLink archivo={value.archivo_contrato} className="text-brand-700 hover:underline truncate">
              📎 {value.archivo_contrato.nombre_original}
            </FileLink>
            <button type="button" onClick={quitarContrato} className="text-xs text-red-600 hover:underline">
              Quitar
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <input type="file" accept=".pdf,image/*"
              onChange={subirContrato} disabled={subiendoContrato}
              className="input flex-1" />
            {subiendoContrato && <span className="text-xs text-slate-500">Subiendo…</span>}
          </div>
        )}
        <p className="text-xs text-slate-500 mt-1">
          PDF o imagen. Las fechas de inicio y fin del contrato son obligatorias y se mostrarán en la tabla principal.
        </p>
      </div>
      <div className="sm:col-span-2 border border-slate-200 rounded-lg p-3 bg-slate-50/40">
        <div className="flex items-center justify-between mb-2">
          <label className="label !mb-0">Archivos adjuntos</label>
          <label className="btn-ghost text-xs !py-1.5 !px-3 cursor-pointer">
            {subiendoAdjuntos ? 'Subiendo…' : '+ Subir archivo(s)'}
            <input type="file" multiple className="hidden" accept=".pdf,image/*,.doc,.docx,.xls,.xlsx"
              disabled={subiendoAdjuntos} onChange={subirAdjuntos} />
          </label>
        </div>
        {value.archivos.length === 0 ? (
          <p className="text-xs text-slate-500">PDF, imágenes u otros documentos del cliente. Sin límite.</p>
        ) : (
          <ul className="space-y-2">
            {value.archivos.map((a, idx) => (
              <li key={idx} className="flex items-center gap-2 bg-white rounded-md ring-1 ring-slate-200 px-2.5 py-1.5">
                <FileLink archivo={a.archivo}
                  className="text-brand-700 hover:underline text-xs truncate min-w-0 flex-1 text-left"
                  title={a.archivo?.nombre_original}>
                  📎 {a.archivo?.nombre_original || `Archivo #${a.id_archivo}`}
                </FileLink>
                <input className="input !py-1 !text-xs flex-1 min-w-0" placeholder="Descripción (opcional)"
                  value={a.descripcion || ''} onChange={e => cambiarDescripcionAdjunto(idx, e.target.value)} />
                <button type="button" onClick={() => quitarAdjunto(idx)}
                  className="text-red-600 hover:underline text-xs whitespace-nowrap">Quitar</button>
              </li>
            ))}
          </ul>
        )}
      </div>
      <div className="sm:col-span-2 border border-slate-200 rounded-lg p-3 bg-slate-50/40">
        <div className="flex items-center justify-between mb-2">
          <label className="label !mb-0">Precios por tipo de servicio</label>
          <button type="button" onClick={agregarPrecio} className="btn-ghost text-xs !py-1.5 !px-3"
            disabled={tiposServicio.length === 0 || value.precios.length >= tiposServicio.length}>
            + Agregar precio
          </button>
        </div>
        {value.precios.length === 0 ? (
          <p className="text-xs text-slate-500">
            Configure el precio del cliente para cada tipo de servicio. Se usará como default editable al crear mantenimientos.
          </p>
        ) : (
          <ul className="space-y-2">
            {value.precios.map((p, idx) => (
              <li key={idx} className="grid grid-cols-12 gap-2 items-center bg-white rounded-md ring-1 ring-slate-200 px-2.5 py-2">
                <select className="select col-span-6 !py-1.5 text-sm" required
                  value={p.id_tipo_servicio}
                  onChange={e => cambiarPrecio(idx, 'id_tipo_servicio', e.target.value)}>
                  <option value="">— Selecciona tipo —</option>
                  {tiposDisponibles(idx).map(t => (
                    <option key={t.id} value={t.id}>{t.nombre}</option>
                  ))}
                  {/* Preserva el tipo ya elegido aunque haya quedado fuera del filtro */}
                  {p.id_tipo_servicio && !tiposDisponibles(idx).some(t => t.id === Number(p.id_tipo_servicio)) && (
                    <option value={p.id_tipo_servicio}>
                      {tiposServicio.find(t => t.id === Number(p.id_tipo_servicio))?.nombre || `Tipo #${p.id_tipo_servicio}`}
                    </option>
                  )}
                </select>
                <input className="input col-span-3 !py-1.5 text-sm font-mono" type="number" step="0.01" min="0"
                  placeholder="0.00" required
                  value={p.precio} onChange={e => cambiarPrecio(idx, 'precio', e.target.value)} />
                <select className="select col-span-2 !py-1.5 text-sm" value={p.moneda}
                  onChange={e => cambiarPrecio(idx, 'moneda', e.target.value)}>
                  <option value="PEN">PEN</option>
                  <option value="USD">USD</option>
                </select>
                <button type="button" onClick={() => quitarPrecio(idx)}
                  className="col-span-1 text-red-600 hover:underline text-xs">Quitar</button>
              </li>
            ))}
          </ul>
        )}
      </div>
      <div className="sm:col-span-2">
        <label className="label">Observaciones</label>
        <textarea className="textarea" rows="3" value={value.observaciones} onChange={e => onChange(f => ({ ...f, observaciones: e.target.value }))} />
      </div>
    </form>
  );
}
