import { useState } from 'react';
import { archivosService } from '../../services';
import { useToast } from '../common/Toast.jsx';
import { useAuth } from '../../features/auth/AuthContext.jsx';
import { FileLink } from '../common/FilePreview.jsx';
import { sanearTelefono, formatTelefono } from '../../utils/formatters.js';

// Campo del form (estado) para cada área de adjuntos.
const campoArea = (area) => area === 'proyecto' ? 'archivos_proyecto' : 'archivos_servicio';

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
 *
 * Los precios de servicio ya no se gestionan aquí: se configuran por ascensor
 * (ver AscensorForm), porque el mismo servicio puede costar distinto por ascensor.
 *
 * La ubicación física (tipo Edificio/Obra, dirección, distrito, mapa) ya no vive
 * en el cliente: se gestiona en los edificios del cliente (ver EdificioForm).
 */

export const clienteFormInicial = {
  tipo_documento: 'RUC', numero_documento: '', nombre: '', observaciones: '',
  contacto_principal_nombre: '', contacto_principal_correo: '', contacto_principal_telefono: '',
  contacto_cobranzas_nombre: '', contacto_cobranzas_correo: '', contacto_cobranzas_telefono: '',
  contacto_admin_nombre: '', contacto_admin_correo: '', contacto_admin_telefono: '',
  clasificacion: '',
  // Áreas cuyos datos de contrato/documentación se registran (UI, no se envía tal
  // cual): Servicios, Proyectos o ambas. Evita cargar el formulario sin motivo.
  areasSeleccionadas: ['servicio'],
  // Contrato de servicio POR ÁREA (fechas + documento firmado). Debe llenarse al
  // menos un área (Servicios o Proyectos); se pueden llenar ambas.
  contrato_servicio_inicio: '', contrato_servicio_fin: '',
  id_archivo_contrato_servicio: null, archivo_contrato_servicio: null,
  contrato_proyecto_inicio: '', contrato_proyecto_fin: '',
  id_archivo_contrato_proyecto: null, archivo_contrato_proyecto: null,
  // Adjuntos clasificados por área (una área no ve los de la otra).
  archivos_servicio: [], // [{ id_archivo, descripcion, orden, archivo }]
  archivos_proyecto: []
};

/** Mapea un cliente del backend al estado del formulario (modo edición). */
export function clienteToForm(c, archivos = []) {
  const porArea = (area) => (archivos || []).filter(a => (a.area || 'servicio') === area);
  // Al editar, se preseleccionan las áreas que ya tienen datos (contrato o adjuntos).
  const conData = ['servicio', 'proyecto'].filter(a =>
    c[`contrato_${a}_inicio`] || c[`contrato_${a}_fin`] || c[`id_archivo_contrato_${a}`] || porArea(a).length > 0);
  return {
    areasSeleccionadas: conData.length ? conData : ['servicio'],
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
    clasificacion: c.clasificacion || '',
    contrato_servicio_inicio: c.contrato_servicio_inicio ? c.contrato_servicio_inicio.substring(0, 10) : '',
    contrato_servicio_fin: c.contrato_servicio_fin ? c.contrato_servicio_fin.substring(0, 10) : '',
    id_archivo_contrato_servicio: c.id_archivo_contrato_servicio || null,
    archivo_contrato_servicio: c.archivo_contrato_servicio || null,
    contrato_proyecto_inicio: c.contrato_proyecto_inicio ? c.contrato_proyecto_inicio.substring(0, 10) : '',
    contrato_proyecto_fin: c.contrato_proyecto_fin ? c.contrato_proyecto_fin.substring(0, 10) : '',
    id_archivo_contrato_proyecto: c.id_archivo_contrato_proyecto || null,
    archivo_contrato_proyecto: c.archivo_contrato_proyecto || null,
    archivos_servicio: porArea('servicio'),
    archivos_proyecto: porArea('proyecto')
  };
}

export default function ClienteForm({
  formId, value, onChange, onSubmit,
  clasificaciones = []
}) {
  const toast = useToast();
  const { accesoServicios, accesoProyectos } = useAuth();
  const [subiendoContrato, setSubiendoContrato] = useState({ servicio: false, proyecto: false });
  const [subiendoAdjuntos, setSubiendoAdjuntos] = useState({ servicio: false, proyecto: false });

  // Claves del contrato en el estado del form, por área.
  const kContrato = (area) => ({
    inicio: `contrato_${area}_inicio`,
    fin: `contrato_${area}_fin`,
    idArchivo: `id_archivo_contrato_${area}`,
    archivo: `archivo_contrato_${area}`
  });

  const puedeArea = (area) => area === 'servicio' ? accesoServicios : accesoProyectos;
  // Áreas que el usuario puede gestionar (por ámbito).
  const areasDisponibles = ['servicio', 'proyecto'].filter(puedeArea);
  // Áreas activas = intersección de lo elegido con lo disponible; si queda vacío,
  // se muestran todas las disponibles (evita ocultar todo por un estado inválido).
  const elegidas = areasDisponibles.filter(a => (value.areasSeleccionadas || []).includes(a));
  const areasActivas = elegidas.length ? elegidas : areasDisponibles;
  // Modo del selector de 3 botones.
  const modo = areasActivas.length >= 2 ? 'ambos' : areasActivas[0];
  const setModo = (m) => onChange(f => ({ ...f, areasSeleccionadas: m === 'ambos' ? ['servicio', 'proyecto'] : [m] }));

  const subirContrato = (area) => async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setSubiendoContrato(s => ({ ...s, [area]: true }));
    try {
      const fd = new FormData();
      fd.append('archivo', file);
      const arch = await archivosService.upload(fd, 'contratos');
      const k = kContrato(area);
      onChange(f => ({ ...f, [k.idArchivo]: arch.id, [k.archivo]: arch }));
      toast.success('Contrato adjuntado');
    } catch {
      toast.error('Error al adjuntar el contrato');
    } finally {
      setSubiendoContrato(s => ({ ...s, [area]: false }));
      e.target.value = '';
    }
  };

  const quitarContrato = (area) => {
    const k = kContrato(area);
    onChange(f => ({ ...f, [k.idArchivo]: null, [k.archivo]: null }));
  };

  const subirAdjuntos = (area) => async (e) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;
    setSubiendoAdjuntos(s => ({ ...s, [area]: true }));
    try {
      const nuevos = [];
      for (const file of files) {
        const fd = new FormData();
        fd.append('archivo', file);
        const arch = await archivosService.upload(fd, 'clientes');
        nuevos.push({ id_archivo: arch.id, descripcion: '', archivo: arch });
      }
      const campo = campoArea(area);
      onChange(f => ({ ...f, [campo]: [...(f[campo] || []), ...nuevos] }));
      toast.success(`${nuevos.length} adjunto(s) cargado(s)`);
    } catch {
      toast.error('Error al adjuntar archivo(s)');
    } finally {
      setSubiendoAdjuntos(s => ({ ...s, [area]: false }));
      e.target.value = '';
    }
  };
  const cambiarDescripcionAdjunto = (area, idx, valor) => {
    const campo = campoArea(area);
    onChange(f => ({ ...f, [campo]: f[campo].map((a, i) => i === idx ? { ...a, descripcion: valor } : a) }));
  };
  const quitarAdjunto = (area, idx) => {
    const campo = campoArea(area);
    onChange(f => ({ ...f, [campo]: f[campo].filter((_, i) => i !== idx) }));
  };

  const mapArchivos = (arr) => (arr || []).map((a, i) => ({
    id_archivo: a.id_archivo, descripcion: a.descripcion || null, orden: i + 1
  }));

  const enviar = (e) => {
    e.preventDefault();
    // Validación de "al menos un área con contrato completo" (inicio + fin), solo
    // sobre las áreas ACTIVAS (elegidas y disponibles). El backend revalida.
    const completa = (area) => areasActivas.includes(area) && value[`contrato_${area}_inicio`] && value[`contrato_${area}_fin`];
    if (!areasActivas.some(completa)) {
      toast.error('Registre el contrato (inicio y fin) de al menos un área.');
      return;
    }
    const payload = { ...value };
    delete payload.areasSeleccionadas; // campo de UI, no se persiste
    // Solo se envían las áreas ACTIVAS. Las no elegidas no se mandan: al editar,
    // el backend conserva sus datos (no los borra) porque no llegan en el body.
    for (const area of ['servicio', 'proyecto']) {
      const k = kContrato(area);
      delete payload[k.archivo]; // solo se manda el id del archivo, no el objeto
      if (areasActivas.includes(area)) {
        payload[k.inicio] = value[k.inicio] || null;
        payload[k.fin] = value[k.fin] || null;
        payload[k.idArchivo] = value[k.idArchivo] || null;
        payload[`archivos_${area}`] = mapArchivos(value[`archivos_${area}`]);
      } else {
        delete payload[k.inicio];
        delete payload[k.fin];
        delete payload[k.idArchivo];
        delete payload[`archivos_${area}`];
      }
    }
    onSubmit(payload);
  };

  // Sección completa de un área (Servicios / Proyectos): contrato (fechas +
  // documento firmado) y sus archivos adjuntos. Se renderiza una por cada área
  // que el usuario puede ver; todo queda clasificado y aislado por área.
  const seccionArea = (area, titulo) => {
    const k = kContrato(area);
    const archivoContrato = value[k.archivo];
    const campo = campoArea(area);
    const lista = value[campo] || [];
    return (
      <div className="sm:col-span-2 border border-slate-300 rounded-lg p-4 bg-white space-y-3">
        <div className="text-sm font-semibold text-slate-800">{titulo}</div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="label">Inicio contrato</label>
            <input type="date" className="input" value={value[k.inicio]}
              onChange={e => onChange(f => ({ ...f, [k.inicio]: e.target.value }))} />
          </div>
          <div>
            <label className="label">Fin contrato</label>
            <input type="date" className="input" value={value[k.fin]} min={value[k.inicio] || undefined}
              onChange={e => onChange(f => ({ ...f, [k.fin]: e.target.value }))} />
          </div>
        </div>
        <div>
          <label className="label">Contrato firmado</label>
          {archivoContrato ? (
            <div className="flex items-center justify-between gap-2 text-sm">
              <FileLink archivo={archivoContrato} className="text-brand-700 hover:underline truncate">
                📎 {archivoContrato.nombre_original}
              </FileLink>
              <button type="button" onClick={() => quitarContrato(area)} className="text-xs text-red-600 hover:underline">Quitar</button>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <input type="file" accept=".pdf,image/*" onChange={subirContrato(area)} disabled={subiendoContrato[area]} className="input flex-1" />
              {subiendoContrato[area] && <span className="text-xs text-slate-500">Subiendo…</span>}
            </div>
          )}
        </div>
        <div className="border-t border-slate-200 pt-3">
          <div className="flex items-center justify-between mb-2">
            <label className="label !mb-0">Archivos adjuntos</label>
            <label className="btn-ghost text-xs !py-1.5 !px-3 cursor-pointer">
              {subiendoAdjuntos[area] ? 'Subiendo…' : '+ Subir archivo(s)'}
              <input type="file" multiple className="hidden" accept=".pdf,image/*,.doc,.docx,.xls,.xlsx"
                disabled={subiendoAdjuntos[area]} onChange={subirAdjuntos(area)} />
            </label>
          </div>
          {lista.length === 0 ? (
            <p className="text-xs text-slate-500">PDF, imágenes u otros documentos del área. Sin límite.</p>
          ) : (
            <ul className="space-y-2">
              {lista.map((a, idx) => (
                <li key={idx} className="flex items-center gap-2 bg-slate-50 rounded-md ring-1 ring-slate-200 px-2.5 py-1.5">
                  <FileLink archivo={a.archivo}
                    className="text-brand-700 hover:underline text-xs truncate min-w-0 flex-1 text-left"
                    title={a.archivo?.nombre_original}>
                    📎 {a.archivo?.nombre_original || `Archivo #${a.id_archivo}`}
                  </FileLink>
                  <input className="input !py-1 !text-xs flex-1 min-w-0" placeholder="Descripción (opcional)"
                    value={a.descripcion || ''} onChange={e => cambiarDescripcionAdjunto(area, idx, e.target.value)} />
                  <button type="button" onClick={() => quitarAdjunto(area, idx)}
                    className="text-red-600 hover:underline text-xs whitespace-nowrap">Quitar</button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    );
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
      {areasDisponibles.length > 1 && (
        <div className="sm:col-span-2">
          <label className="label">¿Qué datos de contrato y documentación se registrarán?</label>
          <div className="inline-flex rounded-lg ring-1 ring-slate-300 overflow-hidden">
            {[{ v: 'servicio', t: 'Área de Servicios' }, { v: 'proyecto', t: 'Área de Proyectos' }, { v: 'ambos', t: 'Ambas' }].map((o, i) => (
              <button key={o.v} type="button" onClick={() => setModo(o.v)}
                className={`px-4 py-1.5 text-sm ${i > 0 ? 'border-l border-slate-300' : ''} ${modo === o.v ? 'bg-brand-600 text-white' : 'bg-white text-slate-700 hover:bg-slate-50'}`}>
                {o.t}
              </button>
            ))}
          </div>
          <p className="text-[11px] text-slate-500 mt-1">Selecciona el área con la que este cliente trabajará (o ambas). Solo se pedirán los datos del área elegida. Debes registrar el contrato (inicio y fin) de al menos un área.</p>
        </div>
      )}
      {areasActivas.includes('servicio') && seccionArea('servicio', 'Área de Servicios')}
      {areasActivas.includes('proyecto') && seccionArea('proyecto', 'Área de Proyectos')}
      <div className="sm:col-span-2">
        <label className="label">Observaciones</label>
        <textarea className="textarea" rows="3" value={value.observaciones} onChange={e => onChange(f => ({ ...f, observaciones: e.target.value }))} />
      </div>
    </form>
  );
}
