import { useToast } from '../common/Toast.jsx';
import MapaUbicacion from '../common/MapaUbicacion.jsx';
import { toNumeroSeguro } from '../../utils/mapa.js';

/**
 * Formulario de edificio u obra (alta/edición). Controlado: el estado vive en la
 * página (`value`/`onChange`) y al enviar valida y entrega el payload vía
 * `onSubmit(payload)`. El edificio es la ubicación física de un cliente y
 * agrupa ascensores.
 *
 * Props:
 *   formId    — id del <form>
 *   value     — estado (usar edificioFormInicial como base)
 *   onChange  — setter (estilo setForm)
 *   onSubmit  — callback con el payload validado
 *   tipos     — catálogo TIPOS_EDIFICIO ({ codigo, etiqueta, nombre_label, direccion_label })
 *   distritos — catálogo de distritos (autocomplete)
 */

export const edificioFormInicial = {
  tipo: 'Edificio', nombre: '', direccion: '', distrito: '',
  latitud: null, longitud: null, observaciones: ''
};

/** Mapea un edificio del backend al estado del formulario (modo edición). */
export function edificioToForm(e) {
  return {
    tipo: e.tipo || 'Edificio',
    nombre: e.nombre || '',
    direccion: e.direccion || '',
    distrito: e.distrito || '',
    latitud: toNumeroSeguro(e.latitud),
    longitud: toNumeroSeguro(e.longitud),
    observaciones: e.observaciones || ''
  };
}

export default function EdificioForm({ formId, value, onChange, onSubmit, tipos = [], distritos = [] }) {
  const toast = useToast();
  // Etiquetas dinámicas según el tipo (Edificio/Obra), desde el catálogo backend.
  const tipoSel = tipos.find(t => t.codigo === value.tipo);
  const labelNombre = tipoSel?.nombre_label || 'Nombre del edificio';
  const labelDireccion = tipoSel?.direccion_label || 'Dirección del edificio';
  const listaDistritosId = `${formId}-distritos`;

  const enviar = (e) => {
    e.preventDefault();
    if (value.latitud === null || value.longitud === null) {
      toast.error('Selecciona la ubicación haciendo click en el mapa');
      return;
    }
    onSubmit({ ...value });
  };

  return (
    <form id={formId} onSubmit={enviar} className="grid grid-cols-1 sm:grid-cols-2 gap-4">
      <div>
        <label className="label">Tipo *</label>
        <select className="select" required value={value.tipo}
          onChange={e => onChange(f => ({ ...f, tipo: e.target.value }))}>
          {tipos.map(t => <option key={t.codigo} value={t.codigo}>{t.etiqueta}</option>)}
        </select>
      </div>
      <div>
        <label className="label">Distrito *</label>
        <input className="input" required list={listaDistritosId} value={value.distrito}
          onChange={e => onChange(f => ({ ...f, distrito: e.target.value }))}
          placeholder="Ej. Surco, Miraflores…" />
        <datalist id={listaDistritosId}>
          {distritos.map(d => <option key={d} value={d} />)}
        </datalist>
      </div>
      <div className="sm:col-span-2">
        <label className="label">{labelNombre} *</label>
        <input className="input" required value={value.nombre}
          onChange={e => onChange(f => ({ ...f, nombre: e.target.value }))} />
      </div>
      <div className="sm:col-span-2">
        <label className="label">{labelDireccion}</label>
        <input className="input" value={value.direccion}
          onChange={e => onChange(f => ({ ...f, direccion: e.target.value }))} />
      </div>
      <div className="sm:col-span-2 border border-slate-200 rounded-lg p-3 bg-slate-50/40">
        <div className="flex items-center justify-between gap-2 mb-2">
          <label className="label mb-0">Ubicación en mapa *</label>
          {(value.latitud !== null && value.longitud !== null) && (
            <button type="button" className="text-xs text-slate-600 hover:text-rose-600"
              onClick={() => onChange(f => ({ ...f, latitud: null, longitud: null }))}>
              Limpiar ubicación
            </button>
          )}
        </div>
        <p className="text-[11px] text-slate-500 mb-2">
          Haz click en el punto exacto. Esta ubicación la verá el técnico para guiarse con Google Maps.
        </p>
        <MapaUbicacion
          editable
          valor={{ latitud: value.latitud, longitud: value.longitud }}
          onCambio={({ lat, lng }) => onChange(f => ({ ...f, latitud: lat, longitud: lng }))}
          alto="300px"
        />
      </div>
      <div className="sm:col-span-2">
        <label className="label">Observaciones</label>
        <textarea className="textarea" rows="2" value={value.observaciones}
          onChange={e => onChange(f => ({ ...f, observaciones: e.target.value }))} />
      </div>
    </form>
  );
}
