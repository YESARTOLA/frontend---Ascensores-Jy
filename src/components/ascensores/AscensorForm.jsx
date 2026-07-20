import { useState, useEffect } from 'react';
import EdificioAutocomplete from '../common/EdificioAutocomplete.jsx';
import { edificiosService } from '../../services';
import { useMonedas } from '../../hooks/useMonedas.js';

/**
 * Formulario de ascensor (alta/edición), reutilizable desde cualquier página
 * (Ascensores, conversión de Leads, etc.). Es controlado: el estado vive en la
 * página (`value`/`onChange`) y `onSubmit` se dispara con el form ya validado
 * por los `required` nativos.
 *
 * El ascensor pertenece a un EDIFICIO. Se busca el edificio directamente (por
 * nombre, distrito o razón social del cliente); lo que se guarda es
 * `id_edificio`.
 *
 * Props:
 *   formId          — id del <form>, para botones submit externos (footer de Modal)
 *   value           — estado del formulario (usar ascensorFormInicial como base)
 *   onChange        — setter del estado (estilo setForm)
 *   onSubmit        — callback al enviar (sin argumentos; la página lee su estado)
 *   tipos           — catálogo de tipos de ascensor
 *   tiposServicio   — catálogo de tipos de servicio (grilla de precios por subtipo)
 *   edificioFijo    — si true, el edificio viene predefinido (value.id_edificio)
 *                     y se muestra como solo lectura (ej. wizard de conversión)
 *   edificioNombre  — texto a mostrar cuando edificioFijo
 *
 * Los precios de servicio se configuran aquí, por ascensor: el mismo servicio
 * puede costar distinto según el ascensor. Antes vivían a nivel de cliente.
 */

export const ascensorFormInicial = {
  id_edificio: '', codigo: '', ubicacion: '', tipo: '', marca: '', modelo: '',
  capacidad: '', pisos: '', anio_aproximado: '', estado_operativo: 'Operativo',
  proximo_mantenimiento: '', observaciones: '',
  precios: [] // [{ id_tipo_servicio, precio, moneda }]
};

/** Mapea un ascensor del backend al estado del formulario (modo edición). */
export function ascensorToForm(a) {
  return {
    id_edificio: a.id_edificio ?? '',
    codigo: a.codigo || '',
    ubicacion: a.ubicacion || '',
    tipo: a.tipo || '',
    marca: a.marca || '',
    modelo: a.modelo || '',
    capacidad: a.capacidad || '',
    pisos: a.pisos ?? '',
    anio_aproximado: a.anio_aproximado ?? '',
    estado_operativo: a.estado_operativo || 'Operativo',
    proximo_mantenimiento: a.proximo_mantenimiento ? String(a.proximo_mantenimiento).substring(0, 10) : '',
    observaciones: a.observaciones || '',
    precios: (a.precios || []).map(p => ({
      id_tipo_servicio: p.id_tipo_servicio,
      precio: p.precio !== undefined && p.precio !== null ? String(p.precio) : '',
      // La columna es NOT NULL con default en la base: no necesita fallback local.
      moneda: p.moneda
    }))
  };
}

export const ESTADOS_OPERATIVOS_ASCENSOR = ['Operativo', 'En observación', 'Fuera de servicio', 'Por instalar', 'En instalación', 'Instalación cancelada', 'En reparación', 'Inactivo'];

export default function AscensorForm({
  formId, value, onChange, onSubmit,
  tipos = [], tiposServicio = [], edificioFijo = false, edificioNombre = ''
}) {
  const [edificios, setEdificios] = useState([]);
  // Edificio actualmente asignado al ascensor (se trae por id para poder
  // mostrarlo aunque esté INACTIVO — la lista de búsqueda solo trae activos).
  const [edificioActual, setEdificioActual] = useState(null);

  const monedas = useMonedas();
  const precios = value.precios || [];
  const agregarPrecio = () => onChange(f => ({
    ...f, precios: [...(f.precios || []), { id_tipo_servicio: '', precio: '', moneda: monedas[0]?.codigo || '' }]
  }));
  const cambiarPrecio = (idx, key, val) => onChange(f => ({
    ...f, precios: (f.precios || []).map((p, i) => i === idx ? { ...p, [key]: val } : p)
  }));
  const quitarPrecio = (idx) => onChange(f => ({
    ...f, precios: (f.precios || []).filter((_, i) => i !== idx)
  }));
  // Solo se asignan precios a SUBTIPOS (los tipos padre no son cotizables).
  const subtiposServicio = tiposServicio.filter(t => !t.es_padre);
  const tiposDisponibles = (idx) => {
    const usados = new Set(precios.map((p, i) => i !== idx ? Number(p.id_tipo_servicio) : null).filter(Boolean));
    return subtiposServicio.filter(t => !usados.has(t.id));
  };

  // Catálogo de edificios activos (con su cliente) para la búsqueda directa.
  useEffect(() => {
    if (edificioFijo) { setEdificios([]); return; }
    let vivo = true;
    edificiosService.list().then(d => { if (vivo) setEdificios(d || []); }).catch(() => { if (vivo) setEdificios([]); });
    return () => { vivo = false; };
  }, [edificioFijo]);

  // Traer el edificio asignado (por id) para poder mostrarlo en el buscador y
  // conocer su estado — clave cuando el edificio está inactivo (no aparece en la
  // lista de activos).
  useEffect(() => {
    if (edificioFijo || !value.id_edificio) { setEdificioActual(null); return; }
    let vivo = true;
    edificiosService.get(value.id_edificio)
      .then(e => { if (vivo) setEdificioActual(e || null); })
      .catch(() => { if (vivo) setEdificioActual(null); });
    return () => { vivo = false; };
  }, [edificioFijo, value.id_edificio]);

  // Lista para el buscador: activos + el edificio actual (aunque esté inactivo).
  const edificiosParaBuscar = (edificioActual && !edificios.some(e => String(e.id) === String(edificioActual.id)))
    ? [edificioActual, ...edificios]
    : edificios;

  // Si el edificio asignado está inactivo, el ascensor solo puede quedar 'Inactivo'.
  const edificioInactivo = edificioActual && String(edificioActual.id) === String(value.id_edificio) && edificioActual.estado === 0;
  useEffect(() => {
    if (edificioInactivo && value.estado_operativo !== 'Inactivo') {
      onChange(f => ({ ...f, estado_operativo: 'Inactivo' }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [edificioInactivo]);

  const enviar = (e) => { e.preventDefault(); onSubmit(); };

  return (
    <form id={formId} onSubmit={enviar} className="grid grid-cols-1 sm:grid-cols-2 gap-4">
      {edificioFijo ? (
        <div className="sm:col-span-2">
          <label className="label">Edificio / Obra *</label>
          <input className="input" value={edificioNombre || `Edificio #${value.id_edificio}`} disabled />
        </div>
      ) : (
        <div className="sm:col-span-2">
          <label className="label">Edificio / Obra *</label>
          <EdificioAutocomplete
            edificios={edificiosParaBuscar}
            value={value.id_edificio}
            onChange={(id) => onChange(f => ({ ...f, id_edificio: id }))}
            required
            placeholder="Escriba para buscar el edificio (nombre, distrito o cliente)…"
          />
          {edificioInactivo && (
            <p className="mt-1 text-xs text-amber-600">Este edificio / obra está inactivo: el ascensor solo puede quedar en estado Inactivo.</p>
          )}
          {/* Espejo oculto para que el submit nativo exija un edificio elegido. */}
          <input
            tabIndex={-1}
            aria-hidden="true"
            required
            value={value.id_edificio}
            onChange={() => {}}
            className="sr-only"
          />
        </div>
      )}
      <div>
        <label className="label">Código único *</label>
        <input className="input" required value={value.codigo} onChange={e => onChange(f => ({ ...f, codigo: e.target.value }))} placeholder="ASC-JY-XXX" />
      </div>
      <div>
        <label className="label">Tipo</label>
        <select className="select" value={value.tipo} onChange={e => onChange(f => ({ ...f, tipo: e.target.value }))}>
          <option value="">— Seleccione —</option>
          {tipos.map(t => <option key={t.id} value={t.nombre}>{t.nombre}</option>)}
          {value.tipo && !tipos.some(t => t.nombre === value.tipo) && (
            <option value={value.tipo}>{value.tipo} (inactivo)</option>
          )}
        </select>
      </div>
      <div>
        <label className="label">Estado</label>
        <select className="select" value={edificioInactivo ? 'Inactivo' : value.estado_operativo}
          disabled={edificioInactivo}
          onChange={e => onChange(f => ({ ...f, estado_operativo: e.target.value }))}>
          {(edificioInactivo ? ['Inactivo'] : ESTADOS_OPERATIVOS_ASCENSOR).map(t => <option key={t}>{t}</option>)}
        </select>
      </div>
      <div><label className="label">Marca</label><input className="input" value={value.marca} onChange={e => onChange(f => ({ ...f, marca: e.target.value }))} /></div>
      <div><label className="label">Modelo</label><input className="input" value={value.modelo} onChange={e => onChange(f => ({ ...f, modelo: e.target.value }))} /></div>
      <div><label className="label">Capacidad</label><input className="input" value={value.capacidad} onChange={e => onChange(f => ({ ...f, capacidad: e.target.value }))} placeholder="8 personas / 1500 kg" /></div>
      <div><label className="label">Pisos</label><input type="number" className="input" value={value.pisos} onChange={e => onChange(f => ({ ...f, pisos: e.target.value }))} /></div>
      <div><label className="label">Año aproximado</label><input type="number" className="input" value={value.anio_aproximado} onChange={e => onChange(f => ({ ...f, anio_aproximado: e.target.value }))} /></div>
      <div><label className="label">Próximo mantenimiento</label><input type="date" className="input" value={value.proximo_mantenimiento} onChange={e => onChange(f => ({ ...f, proximo_mantenimiento: e.target.value }))} /></div>
      <div className="sm:col-span-2"><label className="label">Ubicación específica (piso / zona)</label><input className="input" value={value.ubicacion} onChange={e => onChange(f => ({ ...f, ubicacion: e.target.value }))} /></div>
      <div className="sm:col-span-2"><label className="label">Observaciones</label><textarea className="textarea" rows="3" value={value.observaciones} onChange={e => onChange(f => ({ ...f, observaciones: e.target.value }))} /></div>
      <div className="sm:col-span-2 border border-slate-200 rounded-lg p-3 bg-slate-50/40">
        <div className="flex items-center justify-between mb-2">
          <label className="label !mb-0">Precios por subtipo de servicio</label>
          <button type="button" onClick={agregarPrecio} className="btn-ghost text-xs !py-1.5 !px-3"
            disabled={subtiposServicio.length === 0 || precios.length >= subtiposServicio.length}>
            + Agregar precio
          </button>
        </div>
        {precios.length === 0 ? (
          <p className="text-xs text-slate-500">
            Configure el precio de este ascensor para cada subtipo de servicio. Es obligatorio para poder crear planes de mantenimiento o servicios sobre él.
          </p>
        ) : (
          <ul className="space-y-2">
            {precios.map((p, idx) => (
              <li key={idx} className="grid grid-cols-12 gap-2 items-center bg-white rounded-md ring-1 ring-slate-200 px-2.5 py-2">
                <select className="select col-span-6 !py-1.5 text-sm" required
                  value={p.id_tipo_servicio}
                  onChange={e => cambiarPrecio(idx, 'id_tipo_servicio', e.target.value)}>
                  <option value="">— Selecciona subtipo —</option>
                  {tiposDisponibles(idx).map(t => (
                    <option key={t.id} value={t.id}>{t.nombre}</option>
                  ))}
                  {/* Preserva el subtipo ya elegido aunque haya quedado fuera del filtro */}
                  {p.id_tipo_servicio && !tiposDisponibles(idx).some(t => t.id === Number(p.id_tipo_servicio)) && (
                    <option value={p.id_tipo_servicio}>
                      {tiposServicio.find(t => t.id === Number(p.id_tipo_servicio))?.nombre || `Subtipo #${p.id_tipo_servicio}`}
                    </option>
                  )}
                </select>
                <input className="input col-span-3 !py-1.5 text-sm font-mono" type="number" step="0.01" min="0"
                  placeholder="0.00" required
                  value={p.precio} onChange={e => cambiarPrecio(idx, 'precio', e.target.value)} />
                <select className="select col-span-2 !py-1.5 text-sm" value={p.moneda}
                  onChange={e => cambiarPrecio(idx, 'moneda', e.target.value)}>
                  {monedas.map(m => <option key={m.codigo} value={m.codigo}>{m.codigo}</option>)}
                </select>
                <button type="button" onClick={() => quitarPrecio(idx)}
                  className="col-span-1 text-red-600 hover:underline text-xs">Quitar</button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </form>
  );
}
