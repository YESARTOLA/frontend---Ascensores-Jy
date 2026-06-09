import { useMemo } from 'react';
import { sanearTelefono, formatTelefono } from '../../utils/formatters.js';

// Formulario compartido de datos del lead: lo usan el alta ("Nuevo lead") y la
// edición de datos importantes. La cascada de ubicación (departamento →
// provincia → distrito) se deriva en memoria del catálogo plano de ubigeo.
export const leadFormInicial = {
  nombre_contacto: '', telefono: '', correo: '', canal: 'WhatsApp',
  departamento: '', provincia: '', codigo_ubigeo: '', id_tipo_ascensor: '',
  razon_social: '', ruc: '', nombre_proyecto: '',
  id_tipo_servicio_solicitado: '', cliente_existente: false, id_cliente: '', id_vendedor: '', observaciones: ''
};

// Mapea un lead existente (con relaciones) a la forma del formulario.
export function leadAFormulario(l) {
  return {
    nombre_contacto: l.nombre_contacto || '',
    telefono: l.telefono || '',
    correo: l.correo || '',
    canal: l.canal || 'WhatsApp',
    departamento: l.ubigeo?.departamento || '',
    provincia: l.ubigeo?.provincia || '',
    codigo_ubigeo: l.codigo_ubigeo || '',
    id_tipo_ascensor: l.id_tipo_ascensor || '',
    razon_social: l.razon_social || '',
    ruc: l.ruc || '',
    nombre_proyecto: l.nombre_proyecto || '',
    id_tipo_servicio_solicitado: l.id_tipo_servicio_solicitado || '',
    cliente_existente: l.cliente_existente === 1,
    id_cliente: l.id_cliente || '',
    id_vendedor: l.id_vendedor || '',
    observaciones: l.observaciones || ''
  };
}

export default function LeadForm({ formId, value, onChange, onSubmit, ubigeo, tiposAscensor, tiposServicio, usuarios, clientes }) {
  const set = (parche) => onChange({ ...value, ...parche });

  const departamentos = useMemo(() => [...new Set(ubigeo.map(u => u.departamento))], [ubigeo]);
  const provincias = useMemo(
    () => [...new Set(ubigeo.filter(u => u.departamento === value.departamento).map(u => u.provincia))],
    [ubigeo, value.departamento]
  );
  const distritos = useMemo(
    () => ubigeo.filter(u => u.departamento === value.departamento && u.provincia === value.provincia),
    [ubigeo, value.departamento, value.provincia]
  );

  return (
    <form id={formId} onSubmit={onSubmit} className="grid grid-cols-1 sm:grid-cols-2 gap-4">
      <div className="sm:col-span-2"><label className="label">Nombre del contacto *</label><input className="input" required value={value.nombre_contacto} onChange={e => set({ nombre_contacto: e.target.value })} /></div>
      <div><label className="label">Teléfono *</label><input
        className="input" required
        type="tel" inputMode="numeric" autoComplete="tel"
        placeholder="9XX XXX XXX"
        pattern="9\d{2} \d{3} \d{3}"
        title="Celular peruano: 9 dígitos comenzando con 9"
        value={formatTelefono(value.telefono)}
        onChange={e => set({ telefono: sanearTelefono(e.target.value) })}
      /></div>
      <div><label className="label">Correo</label><input
        className="input" type="email" autoComplete="email"
        placeholder="contacto@empresa.com"
        value={value.correo} onChange={e => set({ correo: e.target.value })}
      /></div>
      <div><label className="label">Canal</label><select className="select" value={value.canal} onChange={e => set({ canal: e.target.value })}><option>WhatsApp</option><option>Llamada</option><option>Web</option><option>Email</option><option>Referido</option></select></div>
      {/* Ubicación del proyecto: cascada oficial de ubigeo INEI */}
      <div><label className="label">Departamento *</label><select className="select" required value={value.departamento} onChange={e => set({ departamento: e.target.value, provincia: '', codigo_ubigeo: '' })}><option value="">—</option>{departamentos.map(d => <option key={d} value={d}>{d}</option>)}</select></div>
      <div><label className="label">Provincia *</label><select className="select" required disabled={!value.departamento} value={value.provincia} onChange={e => set({ provincia: e.target.value, codigo_ubigeo: '' })}><option value="">—</option>{provincias.map(p => <option key={p} value={p}>{p}</option>)}</select></div>
      <div><label className="label">Distrito *</label><select className="select" required disabled={!value.provincia} value={value.codigo_ubigeo} onChange={e => set({ codigo_ubigeo: e.target.value })}><option value="">—</option>{distritos.map(d => <option key={d.codigo} value={d.codigo}>{d.distrito}</option>)}</select></div>
      <div><label className="label">Tipo de ascensor *</label><select className="select" required value={value.id_tipo_ascensor} onChange={e => set({ id_tipo_ascensor: e.target.value })}><option value="">—</option>{tiposAscensor.map(t => <option key={t.id} value={t.id}>{t.nombre}</option>)}</select></div>
      <div className="sm:col-span-2"><label className="label">Nombre del proyecto</label><input className="input" value={value.nombre_proyecto} onChange={e => set({ nombre_proyecto: e.target.value })} /></div>
      <div><label className="label">Tipo de servicio solicitado</label><select className="select" value={value.id_tipo_servicio_solicitado} onChange={e => set({ id_tipo_servicio_solicitado: e.target.value })}><option value="">—</option>{tiposServicio.map(t => <option key={t.id} value={t.id}>{t.nombre}</option>)}</select></div>
      <div><label className="label">Vendedor</label><select className="select" value={value.id_vendedor} onChange={e => set({ id_vendedor: e.target.value })}><option value="">—</option>{usuarios.map(u => <option key={u.id} value={u.id}>{u.nombres}</option>)}</select></div>
      <div><label className="label">¿Cliente existente?</label><select className="select" value={value.cliente_existente ? '1' : '0'} onChange={e => set({ cliente_existente: e.target.value === '1' })}><option value="0">No</option><option value="1">Sí</option></select></div>
      {value.cliente_existente && <div><label className="label">Cliente asociado</label><select className="select" value={value.id_cliente} onChange={e => set({ id_cliente: e.target.value })}><option value="">—</option>{clientes.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}</select></div>}
      {/* Empresa del prospecto: si el lead se vincula a un cliente existente,
          la razón social y el RUC ya viven en ese cliente. */}
      {!value.cliente_existente && <>
        <div><label className="label">Razón social</label><input className="input" value={value.razon_social} onChange={e => set({ razon_social: e.target.value })} /></div>
        <div><label className="label">RUC</label><input
          className="input" inputMode="numeric" maxLength="11"
          pattern="\d{11}" title="RUC de 11 dígitos numéricos"
          value={value.ruc} onChange={e => set({ ruc: e.target.value.replace(/\D/g, '') })}
        /></div>
      </>}
      <div className="sm:col-span-2"><label className="label">Observaciones</label><textarea className="textarea" rows="2" value={value.observaciones} onChange={e => set({ observaciones: e.target.value })} /></div>
    </form>
  );
}
