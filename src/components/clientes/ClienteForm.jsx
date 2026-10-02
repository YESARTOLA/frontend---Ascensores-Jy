import { useState } from 'react';
import { useToast } from '../common/Toast.jsx';
import Modal from '../common/Modal.jsx';
import BarraProgresoCarga from '../common/BarraProgresoCarga.jsx';
import useCargaArchivos from '../../hooks/useCargaArchivos.js';
import { useClasificaciones } from '../../hooks/useClasificaciones.js';
import { useAuth } from '../../features/auth/AuthContext.jsx';
import { FileLink } from '../common/FilePreview.jsx';
import ClasificacionesPanel from './ClasificacionesPanel.jsx';
import { sanearTelefono, formatTelefono } from '../../utils/formatters.js';
import { aplicaAAreas } from '../../utils/clasificacionesCliente.js';
import { AREAS_CLIENTE, ETIQUETA_AREA, otraArea } from '../../utils/areasCliente.js';

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
 *
 * Orden de llenado: primero el ÁREA del cliente (Servicios o Proyectos: una
 * sola, y de ella depende qué usuarios lo ven) y luego la CLASIFICACIÓN, que se
 * ofrece filtrada por esa área: hay clasificaciones solo de Servicios y otras
 * solo de Proyectos. El catálogo de
 * clasificaciones es gestionable (useClasificaciones) y super_admin/admin lo
 * editan desde aquí mismo ("Gestionar").
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
  // Área del cliente (UI, no se envía tal cual): 'servicio' o 'proyecto', nunca
  // las dos. Es lo PRIMERO que se elige: decide qué contrato y documentación se
  // piden y qué clasificaciones se ofrecen. Arranca vacía para que se elija a
  // conciencia.
  area: '',
  // Solo al editar (UI): áreas con datos que el cliente ya tenía al abrirlo.
  areasRegistradas: [],
  // Contrato de servicio del área del cliente (fechas + documento firmado). Hay
  // un juego de campos por área, pero solo se llena el de la elegida.
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
  // Al editar, el área es la que ya tiene datos (contrato o adjuntos). Si tiene
  // las dos (cliente de cuando existía la opción «Ambas») queda sin elegir: hay
  // que decidir a cuál pertenece.
  const conData = AREAS_CLIENTE.filter(a =>
    c[`contrato_${a}_inicio`] || c[`contrato_${a}_fin`] || c[`id_archivo_contrato_${a}`] || porArea(a).length > 0);
  return {
    area: conData.length === 1 ? conData[0] : '',
    areasRegistradas: conData,
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

export default function ClienteForm({ formId, value, onChange, onSubmit }) {
  const toast = useToast();
  const { accesoServicios, accesoProyectos, esSuperAdmin, esAdmin } = useAuth();
  const clasificaciones = useClasificaciones();
  const puedeGestionarClasificaciones = esSuperAdmin || esAdmin;
  const [gestionandoClasificaciones, setGestionandoClasificaciones] = useState(false);
  // Una carga por área y por tipo de adjunto: cada una lleva su propia barra de
  // progreso, así subir el contrato de Servicio no pisa la de Proyecto.
  const cargasContrato = { servicio: useCargaArchivos(), proyecto: useCargaArchivos() };
  const cargasAdjuntos = { servicio: useCargaArchivos(), proyecto: useCargaArchivos() };

  // Claves del contrato en el estado del form, por área.
  const kContrato = (area) => ({
    inicio: `contrato_${area}_inicio`,
    fin: `contrato_${area}_fin`,
    idArchivo: `id_archivo_contrato_${area}`,
    archivo: `archivo_contrato_${area}`
  });

  const puedeArea = (area) => area === 'servicio' ? accesoServicios : accesoProyectos;
  // Áreas que el usuario puede gestionar (por ámbito).
  const areasDisponibles = AREAS_CLIENTE.filter(puedeArea);
  const registradas = value.areasRegistradas || [];
  // Al editar: cliente de un área que este usuario no gestiona (lo ve porque
  // tiene registros de la suya). Puede corregir sus datos generales, pero el
  // contrato y la documentación son de la otra área.
  const areaAjena = areasDisponibles.length === 1 && registradas.length > 0 && !registradas.includes(areasDisponibles[0]);
  // Área del cliente. Si el usuario solo gestiona una, es esa sin tener que
  // elegirla; si gestiona las dos y aún no eligió, el resto espera.
  const area = areaAjena ? null
    : areasDisponibles.length === 1 ? areasDisponibles[0]
      : (areasDisponibles.includes(value.area) ? value.area : null);
  // Áreas que deciden qué clasificaciones aplican.
  const areasCliente = area ? [area] : (areaAjena ? registradas : []);
  const hayArea = areasCliente.length > 0;
  // Avisos al editar, para quien gestiona las dos áreas: cliente antiguo con
  // las dos, o cliente que se está cambiando de área.
  const eraDeDosAreas = areasDisponibles.length > 1 && registradas.length > 1;
  const cambiaDeArea = areasDisponibles.length > 1 && registradas.length === 1 && !!area && area !== registradas[0];

  const elegirArea = (nueva) => onChange(f => {
    if (f.area === nueva) return f;
    const anterior = otraArea(nueva);
    const kN = kContrato(nueva);
    const kA = kContrato(anterior);
    const cambios = { area: nueva };
    // Un cliente tiene un solo contrato: lo ya cargado pasa a la nueva área,
    // salvo que esta ya tenga el suyo (cliente antiguo con las dos áreas).
    if (!f[kN.inicio] && !f[kN.fin] && !f[kN.idArchivo]) {
      Object.assign(cambios, {
        [kN.inicio]: f[kA.inicio], [kN.fin]: f[kA.fin], [kN.idArchivo]: f[kA.idArchivo], [kN.archivo]: f[kA.archivo],
        [kA.inicio]: '', [kA.fin]: '', [kA.idArchivo]: null, [kA.archivo]: null
      });
    }
    // Los adjuntos también acompañan al cliente a su nueva área.
    cambios[campoArea(nueva)] = [...(f[campoArea(nueva)] || []), ...(f[campoArea(anterior)] || [])];
    cambios[campoArea(anterior)] = [];
    // La clasificación elegida puede no aplicar a la nueva área: se limpia.
    const actual = clasificaciones.find(c => c.codigo === f.clasificacion);
    if (f.clasificacion && !(actual && aplicaAAreas(actual, [nueva]))) cambios.clasificacion = '';
    return { ...f, ...cambios };
  });

  // Clasificaciones que se ofrecen: activas y del área del cliente. La que
  // ya tiene (al editar) se mantiene visible aunque hoy no cumpla, para no
  // reclasificarlo sin querer; el backend tampoco la revalida si no cambia.
  const clasificacionActual = clasificaciones.find(c => c.codigo === value.clasificacion);
  const opcionesClasificacion = clasificaciones.filter(c =>
    (c.activo && aplicaAAreas(c, areasCliente)) || c.codigo === value.clasificacion);
  const notaClasificacion = (c) => (!c.activo ? ' (desactivada)'
    : !aplicaAAreas(c, areasCliente) ? ' (no aplica a esta área)' : '');

  const subirContrato = (area) => async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      const arch = await cargasContrato[area].subirUno(file, 'contratos');
      const k = kContrato(area);
      onChange(f => ({ ...f, [k.idArchivo]: arch.id, [k.archivo]: arch }));
      toast.success('Contrato adjuntado');
    } catch (err) {
      if (!err?.cancelado) toast.error('Error al adjuntar el contrato');
    }
  };

  const quitarContrato = (area) => {
    const k = kContrato(area);
    onChange(f => ({ ...f, [k.idArchivo]: null, [k.archivo]: null }));
  };

  const subirAdjuntos = (area) => async (e) => {
    const files = Array.from(e.target.files || []);
    e.target.value = '';
    if (files.length === 0) return;
    const campo = campoArea(area);
    let cargados = 0;
    try {
      // Cada adjunto se agrega al formulario en cuanto termina de subir: si la
      // tanda se corta a medias, lo ya subido no se pierde.
      await cargasAdjuntos[area].subirVarios(files, 'clientes', {
        onArchivoSubido: (arch) => {
          cargados += 1;
          onChange(f => ({ ...f, [campo]: [...(f[campo] || []), { id_archivo: arch.id, descripcion: '', archivo: arch }] }));
        }
      });
      toast.success(`${cargados} adjunto(s) cargado(s)`);
    } catch (err) {
      if (!err?.cancelado) toast.error('Error al adjuntar archivo(s)');
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
    if (!hayArea) {
      toast.error('Primero elige el área del cliente: Servicios o Proyectos.');
      return;
    }
    // El contrato (inicio + fin) del área del cliente es obligatorio. El backend
    // revalida.
    if (area && !(value[`contrato_${area}_inicio`] && value[`contrato_${area}_fin`])) {
      toast.error(`Registre el contrato (inicio y fin) del Área de ${ETIQUETA_AREA[area]}.`);
      return;
    }
    const payload = { ...value };
    delete payload.area; // campos de UI, no se persisten
    delete payload.areasRegistradas;
    for (const a of AREAS_CLIENTE) {
      const k = kContrato(a);
      delete payload[k.archivo]; // solo se manda el id del archivo, no el objeto
      if (a === area) {
        payload[k.inicio] = value[k.inicio] || null;
        payload[k.fin] = value[k.fin] || null;
        payload[k.idArchivo] = value[k.idArchivo] || null;
        payload[`archivos_${a}`] = mapArchivos(value[`archivos_${a}`]);
      } else if (area && puedeArea(a)) {
        // La otra área se manda vacía: el cliente es de una sola. Si estaba en
        // ella, su contrato y adjuntos ya pasaron a la elegida (elegirArea).
        payload[k.inicio] = null;
        payload[k.fin] = null;
        payload[k.idArchivo] = null;
        payload[`archivos_${a}`] = [];
      } else {
        // Área que este usuario no gestiona: no se manda y el backend conserva
        // sus datos porque no llegan en el body.
        delete payload[k.inicio];
        delete payload[k.fin];
        delete payload[k.idArchivo];
        delete payload[`archivos_${a}`];
      }
    }
    onSubmit(payload);
  };

  // Sección completa del área del cliente (Servicios / Proyectos): contrato
  // (fechas + documento firmado) y sus archivos adjuntos, clasificados por área.
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
              <input type="file" accept=".pdf,image/*" onChange={subirContrato(area)} disabled={cargasContrato[area].subiendo} className="input flex-1" />
            </div>
          )}
          <BarraProgresoCarga carga={cargasContrato[area]} className="mt-2" />
        </div>
        <div className="border-t border-slate-200 pt-3">
          <div className="flex items-center justify-between mb-2">
            <label className="label !mb-0">Archivos adjuntos</label>
            <label className="btn-ghost text-xs !py-1.5 !px-3 cursor-pointer">
              {cargasAdjuntos[area].subiendo ? 'Subiendo…' : '+ Subir archivo(s)'}
              <input type="file" multiple className="hidden" accept=".pdf,image/*,.doc,.docx,.xls,.xlsx"
                disabled={cargasAdjuntos[area].subiendo} onChange={subirAdjuntos(area)} />
            </label>
          </div>
          <BarraProgresoCarga carga={cargasAdjuntos[area]} className="mb-2" />
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
    <>
    <form id={formId} onSubmit={enviar} className="grid grid-cols-1 sm:grid-cols-2 gap-4">
      {/* 1) Área y 2) clasificación, ANTES que el resto: el área decide qué
          contrato y documentación se piden y qué clasificaciones aplican. */}
      <div className="sm:col-span-2 rounded-lg ring-1 ring-slate-200 bg-slate-50/60 p-4 space-y-4">
        <div>
          <label className="label">1. ¿Para qué área es este cliente? *</label>
          {areaAjena ? (
            <div className="text-sm font-medium text-slate-800">Área de {ETIQUETA_AREA[registradas[0]]}</div>
          ) : areasDisponibles.length > 1 ? (
            <div className="inline-flex rounded-lg ring-1 ring-slate-300 overflow-hidden">
              {AREAS_CLIENTE.map((a, i) => (
                <button key={a} type="button" onClick={() => elegirArea(a)} aria-pressed={area === a}
                  className={`px-4 py-1.5 text-sm ${i > 0 ? 'border-l border-slate-300' : ''} ${area === a ? 'bg-brand-600 text-white' : 'bg-white text-slate-700 hover:bg-slate-50'}`}>
                  Área de {ETIQUETA_AREA[a]}
                </button>
              ))}
            </div>
          ) : (
            <div className="text-sm font-medium text-slate-800">
              {area ? `Área de ${ETIQUETA_AREA[area]}` : 'No tienes áreas asignadas para registrar clientes.'}
            </div>
          )}
          <p className="text-[11px] text-slate-500 mt-1">
            Un cliente es de Servicios o de Proyectos, no de ambas: solo lo ven los usuarios de su área. Define qué contrato y documentación se registran y qué clasificaciones puede tener.
          </p>
          {areaAjena && (
            <p className="text-[11px] text-amber-700 mt-1">
              Este cliente es del Área de {ETIQUETA_AREA[registradas[0]]}: puedes actualizar sus datos generales, pero su contrato y documentación los gestiona esa área.
            </p>
          )}
          {eraDeDosAreas && (
            <p className="text-[11px] text-amber-700 mt-1">
              Este cliente tenía contrato en las dos áreas. Elige a cuál pertenece: al guardar se conserva el contrato de esa área, se quita el de la otra y todos los adjuntos quedan en la elegida.
            </p>
          )}
          {cambiaDeArea && (
            <p className="text-[11px] text-amber-700 mt-1">
              Este cliente era del Área de {ETIQUETA_AREA[registradas[0]]}. Al guardar pasa al Área de {ETIQUETA_AREA[area]} con su contrato y sus adjuntos.
            </p>
          )}
        </div>
        <div>
          <div className="flex items-center justify-between gap-2 mb-1">
            <label className="label !mb-0">2. Clasificación</label>
            {puedeGestionarClasificaciones && (
              <button type="button" onClick={() => setGestionandoClasificaciones(true)}
                className="text-xs text-brand-700 hover:underline">
                Gestionar clasificaciones
              </button>
            )}
          </div>
          <select className="select" value={value.clasificacion} disabled={!hayArea}
            onChange={e => onChange(f => ({ ...f, clasificacion: e.target.value }))}>
            <option value="">{hayArea ? '— Sin clasificar —' : 'Primero elige el área'}</option>
            {opcionesClasificacion.map(c => (
              <option key={c.codigo} value={c.codigo}>{c.etiqueta}{notaClasificacion(c)}</option>
            ))}
          </select>
          <p className="text-[11px] text-slate-500 mt-1">
            {!hayArea
              ? 'Las clasificaciones dependen del área: hay unas solo de Servicios y otras solo de Proyectos.'
              : `Se muestran las clasificaciones de ${ETIQUETA_AREA[areasCliente[0]]}. Etiqueta informativa para reportes y filtros; no afecta el flujo.`}
            {clasificacionActual && hayArea && !aplicaAAreas(clasificacionActual, areasCliente) && (
              <span className="block text-amber-700">La clasificación actual no corresponde a esta área; elige otra si la vas a cambiar.</span>
            )}
          </p>
        </div>
      </div>

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
      {!hayArea && (
        <p className="sm:col-span-2 text-xs text-slate-500 rounded-lg border border-dashed border-slate-300 px-3 py-2">
          El contrato y la documentación se piden después de elegir el área (paso 1).
        </p>
      )}
      {area && seccionArea(area, `Contrato y documentación · Área de ${ETIQUETA_AREA[area]}`)}
      <div className="sm:col-span-2">
        <label className="label">Observaciones</label>
        <textarea className="textarea" rows="3" value={value.observaciones} onChange={e => onChange(f => ({ ...f, observaciones: e.target.value }))} />
      </div>
    </form>

    {/* Fuera del <form> del cliente: el panel tiene su propio formulario. */}
    <Modal
      open={gestionandoClasificaciones}
      onClose={() => setGestionandoClasificaciones(false)}
      title="Clasificaciones de cliente"
      size="lg"
      footer={<button type="button" className="btn-secondary" onClick={() => setGestionandoClasificaciones(false)}>Volver al cliente</button>}
    >
      <ClasificacionesPanel />
    </Modal>
    </>
  );
}
