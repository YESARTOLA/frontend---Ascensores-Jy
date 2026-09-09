/**
 * Selector "Moneda (todas)" de las barras de filtro de Contabilidad, Gestión de
 * cobros y Facturas.
 *
 * Los tres módulos manejan una cartera mixta (PEN y USD) y por eso nunca suman
 * las dos divisas en un mismo total: los resúmenes de la cabecera muestran un
 * importe POR MONEDA. Este filtro es la otra mitad de esa decisión — deja la
 * pantalla entera (tabla, indicadores y exportación) en una sola moneda, que es
 * lo que permite leer un total como cifra única y llevarlo a Excel sumado.
 *
 * El catálogo lo trae la página con `useMonedas()`, el mismo que necesita para
 * describir el filtro en la cabecera de las exportaciones, así que llega por
 * prop en vez de pedirse otra vez aquí.
 *
 * @param {{codigo:string, etiqueta:string}[]} monedas catálogo del backend
 * @param {string} value código seleccionado ('' = todas)
 * @param {(codigo:string) => void} onChange
 */
export default function FiltroMoneda({ monedas, value, onChange, className = '' }) {
  // El catálogo llega por red: mientras no esté (o si la petición falló) el
  // select solo podría ofrecer "todas", que no filtra nada. Se deshabilita para
  // que se lea como "aún no disponible" y no como un desplegable roto.
  const sinCatalogo = !monedas?.length;
  return (
    <select
      className={`select ${className}`.trim()}
      aria-label="Filtrar por moneda"
      title={sinCatalogo ? 'Catálogo de monedas no disponible' : 'Ver solo los importes de una moneda'}
      value={value}
      disabled={sinCatalogo}
      onChange={e => onChange(e.target.value)}
    >
      <option value="">Moneda (todas)</option>
      {(monedas || []).map(m => <option key={m.codigo} value={m.codigo}>{m.etiqueta}</option>)}
    </select>
  );
}

/**
 * Nombre legible de una moneda para la cabecera de las exportaciones
 * ("Soles (PEN)"). Si el catálogo aún no cargó devuelve el código, que sigue
 * siendo información correcta.
 */
export function etiquetaDeMoneda(monedas, codigo) {
  return (monedas || []).find(m => m.codigo === codigo)?.etiqueta || codigo;
}
