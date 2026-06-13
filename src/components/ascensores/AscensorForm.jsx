import { useState, useEffect } from 'react';
import EdificioAutocomplete from '../common/EdificioAutocomplete.jsx';
import { edificiosService } from '../../services';

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
 *   edificioFijo    — si true, el edificio viene predefinido (value.id_edificio)
 *                     y se muestra como solo lectura (ej. wizard de conversión)
 *   edificioNombre  — texto a mostrar cuando edificioFijo
 */

export const ascensorFormInicial = {
  id_edificio: '', codigo: '', ubicacion: '', tipo: '', marca: '', modelo: '',
  capacidad: '', pisos: '', anio_aproximado: '', estado_operativo: 'Operativo',
  proximo_mantenimiento: '', observaciones: ''
};

export const ESTADOS_OPERATIVOS_ASCENSOR = ['Operativo', 'En observación', 'Fuera de servicio', 'En instalación', 'En reparación', 'Inactivo'];

export default function AscensorForm({
  formId, value, onChange, onSubmit,
  tipos = [], edificioFijo = false, edificioNombre = ''
}) {
  const [edificios, setEdificios] = useState([]);

  // Catálogo de edificios activos (con su cliente) para la búsqueda directa.
  useEffect(() => {
    if (edificioFijo) { setEdificios([]); return; }
    let vivo = true;
    edificiosService.list().then(d => { if (vivo) setEdificios(d || []); }).catch(() => { if (vivo) setEdificios([]); });
    return () => { vivo = false; };
  }, [edificioFijo]);

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
            edificios={edificios}
            value={value.id_edificio}
            onChange={(id) => onChange(f => ({ ...f, id_edificio: id }))}
            required
            placeholder="Escriba para buscar el edificio (nombre, distrito o cliente)…"
          />
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
        <select className="select" value={value.estado_operativo} onChange={e => onChange(f => ({ ...f, estado_operativo: e.target.value }))}>
          {ESTADOS_OPERATIVOS_ASCENSOR.map(t => <option key={t}>{t}</option>)}
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
    </form>
  );
}
