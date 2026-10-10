/**
 * Empresa emisora de la cotización: la razón social / RUC con que sale el PDF.
 * Las empresas se gestionan en Configuración › Empresas emisoras.
 *
 * `actual` es la empresa que ya tiene la versión: si se eliminó después, se
 * sigue ofreciendo (marcada) para no perderla al editar otros campos.
 */
export function etiquetaEmpresa(e) {
  return `${e.razon_social} — RUC ${e.ruc}`;
}

/** Empresa que el formulario propone por defecto. */
export function empresaPredeterminada(empresas) {
  return empresas.find(e => e.es_predeterminada) || empresas[0] || null;
}

export default function SelectorEmpresaEmisora({ empresas, value, onChange, actual = null }) {
  const actualEliminada = actual && !empresas.some(e => e.id === actual.id);
  if (empresas.length === 0 && !actualEliminada) return null;
  return (
    <div>
      <label className="label">Empresa emisora *</label>
      <select className="select" required value={value} onChange={e => onChange(e.target.value)}>
        {actualEliminada && (
          <option value={actual.id}>{etiquetaEmpresa(actual)} (eliminada)</option>
        )}
        {empresas.map(e => (
          <option key={e.id} value={e.id}>
            {etiquetaEmpresa(e)}{e.es_predeterminada ? ' · predeterminada' : ''}
          </option>
        ))}
      </select>
      <p className="text-[11px] text-carbon-400 mt-1">
        Razón social, RUC, dirección y contacto con que se emite el PDF. Se gestionan en Configuración › Empresas emisoras.
      </p>
    </div>
  );
}
