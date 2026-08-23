import { formatMonto } from '../../utils/formatters.js';

/**
 * Indicador de cabecera: una cantidad de registros y su importe.
 *
 * Los importes llegan desglosados POR MONEDA (`[{ moneda, total }]`) y se pintan
 * uno debajo de otro en vez de sumarse: la cartera mezcla PEN y USD, así que un
 * único total combinándolos sería un número falso.
 *
 * Props:
 *   - titulo   texto de la etiqueta superior
 *   - ayuda    detalle del criterio (tooltip); explica QUÉ se está contando
 *   - cantidad número de registros
 *   - unidad   sustantivo de lo que se cuenta ("servicio(s)", "cobro(s)"…)
 *   - montos   [{ moneda, total }] — vacío pinta un cero en la moneda por defecto
 *   - tono     clave de TONOS
 *   - nota     aclaración corta bajo los importes, cuando el criterio del monto
 *              no es obvio a partir de la cantidad
 */
export const TONOS = {
  amber:  { caja: 'bg-amber-50 ring-amber-200',     texto: 'text-amber-700',   valor: 'text-amber-900' },
  green:  { caja: 'bg-emerald-50 ring-emerald-200', texto: 'text-emerald-700', valor: 'text-emerald-900' },
  brand:  { caja: 'bg-brand-50 ring-brand-200',     texto: 'text-brand-700',   valor: 'text-brand-900' },
  red:    { caja: 'bg-rose-50 ring-rose-200',       texto: 'text-rose-700',    valor: 'text-rose-900' }
};

export default function CardMetrica({ titulo, ayuda, cantidad = 0, unidad = 'registro(s)', montos = [], tono = 'amber', nota }) {
  const t = TONOS[tono] || TONOS.amber;
  return (
    <div className={`rounded-xl ring-1 p-4 ${t.caja}`}>
      <div className={`text-[10px] uppercase tracking-[0.18em] font-bold ${t.texto}`} title={ayuda}>{titulo}</div>
      <div className="mt-1 flex items-baseline gap-2">
        <span className={`text-3xl font-bold tabular-nums ${t.valor}`}>{Number(cantidad || 0).toLocaleString('es-PE')}</span>
        <span className={`text-xs ${t.texto}`}>{unidad}</span>
      </div>
      <div className="mt-2 space-y-0.5">
        {montos.length === 0
          ? <div className={`font-mono text-sm ${t.valor}`}>{formatMonto(0)}</div>
          : montos.map(m => (
              <div key={m.moneda} className={`font-mono text-sm ${t.valor}`}>{formatMonto(m.total, m.moneda)}</div>
            ))}
      </div>
      {nota && <div className={`mt-1.5 text-[11px] leading-snug ${t.texto} opacity-80`}>{nota}</div>}
    </div>
  );
}
