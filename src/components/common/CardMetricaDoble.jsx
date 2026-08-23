import { formatMonto } from '../../utils/formatters.js';
import { TONOS } from './CardMetrica.jsx';

/**
 * Dos indicadores relacionados dentro de UNA sola tarjeta, separados por un
 * divisor. Se usa cuando las dos cifras se leen juntas —"de esto que facturé,
 * esto es lo que falta cobrar"— y partirlas en dos tarjetas independientes
 * rompería esa lectura.
 *
 * Cada mitad es la misma métrica que pinta `CardMetrica` (cantidad + importes
 * por moneda) y comparte su paleta, así que ambos componentes se ven como una
 * familia. Los importes van desglosados POR MONEDA y no se suman entre sí: la
 * cartera mezcla PEN y USD y un total combinado sería un número falso.
 *
 * Props:
 *   - titulo    etiqueta de la tarjeta completa (opcional)
 *   - metricas  exactamente dos: { titulo, ayuda, cantidad, unidad, montos, tono, nota }
 */
export default function CardMetricaDoble({ titulo, metricas = [] }) {
  return (
    <div className="card">
      {titulo && (
        <div className="px-4 pt-3 text-[10px] uppercase tracking-[0.18em] font-bold text-carbon-400">
          {titulo}
        </div>
      )}
      <div className="grid grid-cols-1 sm:grid-cols-2 divide-y sm:divide-y-0 sm:divide-x divide-carbon-100">
        {metricas.map((m, i) => {
          const t = TONOS[m.tono] || TONOS.brand;
          return (
            <div key={i} className="p-4">
              <div className={`text-[10px] uppercase tracking-[0.18em] font-bold ${t.texto}`} title={m.ayuda}>
                {m.titulo}
              </div>
              <div className="mt-1 flex items-baseline gap-2">
                <span className={`text-3xl font-bold tabular-nums ${t.valor}`}>
                  {Number(m.cantidad || 0).toLocaleString('es-PE')}
                </span>
                <span className={`text-xs ${t.texto}`}>{m.unidad || 'registro(s)'}</span>
              </div>
              <div className="mt-2 space-y-0.5">
                {(m.montos || []).length === 0
                  ? <div className={`font-mono text-sm ${t.valor}`}>{formatMonto(0)}</div>
                  : m.montos.map(x => (
                      <div key={x.moneda} className={`font-mono text-sm ${t.valor}`}>
                        {formatMonto(x.total, x.moneda)}
                      </div>
                    ))}
              </div>
              {m.nota && <div className={`mt-1.5 text-[11px] leading-snug ${t.texto} opacity-80`}>{m.nota}</div>}
            </div>
          );
        })}
      </div>
    </div>
  );
}
