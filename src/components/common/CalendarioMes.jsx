import { diasDelCalendario, fechaLima, ymdLima, fmtDiaLargo } from '../../utils/calendarioFechas.js';

const DIAS_SEMANA = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];

// Geometría de las filas de semana (px). El header aloja el número de día; cada
// carril es una franja donde se dibuja un evento como barra continua.
const HEADER_H = 24;
const LANE_H = 34;
const MAX_LANES = 3;      // carriles visibles antes de resumir en "+N más"
const OVERFLOW_H = 16;
const ROW_H = HEADER_H + MAX_LANES * LANE_H + OVERFLOW_H;

/**
 * Reparte las barras de una semana en carriles (filas) evitando solapes: dos
 * eventos que comparten alguna columna no pueden ir en el mismo carril, de modo
 * que un evento multi-día ocupe SIEMPRE la misma altura a lo largo de los días
 * que abarca y se lea como una única barra continua.
 */
function asignarCarriles(barras) {
  const ordenadas = [...barras].sort(
    (a, b) => a.startCol - b.startCol
      || (b.endCol - b.startCol) - (a.endCol - a.startCol)
      || a.seq - b.seq
  );
  const carriles = []; // carriles[i] = [{startCol, endCol}]
  for (const b of ordenadas) {
    let lane = 0;
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const ocupados = carriles[lane] || [];
      const choca = ocupados.some(o => !(b.endCol < o.startCol || b.startCol > o.endCol));
      if (!choca) { (carriles[lane] ||= []).push(b); b.lane = lane; break; }
      lane++;
    }
  }
  return ordenadas;
}

/**
 * Construye, para una semana (7 días), las barras de sus eventos. Cada evento
 * aparece ya expandido día a día en `itemsPorDia`, así que basta con detectar en
 * qué columnas de la semana aparece cada id para conocer su tramo [startCol, endCol].
 */
function barrasDeSemana(week, itemsPorDia) {
  const porId = new Map();
  let seq = 0;
  week.forEach((d, col) => {
    (itemsPorDia[d.ymd] || []).forEach(it => {
      const cur = porId.get(it.id);
      if (!cur) porId.set(it.id, { id: it.id, startCol: col, endCol: col, startItem: it, endItem: it, seq: seq++ });
      else { cur.endCol = col; cur.endItem = it; }
    });
  });
  return asignarCarriles([...porId.values()]);
}

/**
 * Grid de mes reutilizable (lunes a domingo). Los eventos se dibujan como barras
 * continuas alineadas por carril; un evento con rango de varios días ocupa una
 * sola barra que abarca todas sus columnas dentro de la semana.
 *
 * @param {Date}   cursor       Mes a mostrar (cualquier día dentro del mes).
 * @param {object} itemsPorDia  Mapa "YYYY-MM-DD" → [{ id, color, titulo, subtitulo?, title?, continuaAntes?, continuaDespues? }].
 * @param {(dia)=>void} onSelectDay  Callback al clickear un día; recibe { ymd, dia, mes, anio }.
 */
export default function CalendarioMes({ cursor, itemsPorDia = {}, onSelectDay }) {
  const dias = diasDelCalendario(cursor);
  const hoyStr = ymdLima(new Date());
  const mesCursor = Number(ymdLima(cursor).split('-')[1]);

  const semanas = [];
  for (let i = 0; i < dias.length; i += 7) semanas.push(dias.slice(i, i + 7));

  return (
    <div className="card overflow-hidden">
      <div className="grid grid-cols-7 bg-slate-50 text-[11px] uppercase font-semibold text-slate-500 border-b border-slate-200">
        {DIAS_SEMANA.map(d => <div key={d} className="px-2 py-2 text-center">{d}</div>)}
      </div>

      {semanas.map((week, wIdx) => {
        const barras = barrasDeSemana(week, itemsPorDia);
        const visibles = barras.filter(b => b.lane < MAX_LANES);
        // Conteo de barras ocultas por columna, para el indicador "+N más".
        const overflow = Array(7).fill(0);
        barras.filter(b => b.lane >= MAX_LANES).forEach(b => {
          for (let c = b.startCol; c <= b.endCol; c++) overflow[c] += 1;
        });

        return (
          <div key={wIdx} className="relative grid grid-cols-7" style={{ minHeight: ROW_H }}>
            {/* Celdas de día (fondo, número y clic) */}
            {week.map((d, col) => {
              const esHoy = d.ymd === hoyStr;
              const esOtroMes = d.mes !== mesCursor;
              const diaLabel = fechaLima(d.ymd);
              return (
                <button
                  type="button"
                  key={col}
                  onClick={() => onSelectDay?.(d)}
                  aria-label={`Ver ${fmtDiaLargo.format(diaLabel)}`}
                  style={{ minHeight: ROW_H }}
                  className={`relative border-b border-r border-slate-100 text-xs text-left w-full cursor-pointer transition focus:outline-none focus:ring-2 focus:ring-inset focus:ring-brand-300 ${esOtroMes ? 'bg-slate-50/50 text-slate-400 hover:bg-slate-100/70' : 'bg-white hover:bg-slate-50'}`}
                >
                  <div className="px-1.5 pt-1.5">
                    <div className={`text-right ${esHoy ? 'inline-block float-right bg-brand-600 text-white rounded-full h-6 w-6 leading-6 text-center font-semibold' : ''}`}>{d.dia}</div>
                  </div>
                  {overflow[col] > 0 && (
                    <div className="absolute px-1.5 text-[10px] text-slate-500" style={{ top: HEADER_H + MAX_LANES * LANE_H }}>
                      +{overflow[col]} más
                    </div>
                  )}
                </button>
              );
            })}

            {/* Capa de barras (no intercepta clics: caen en la celda de debajo) */}
            <div className="absolute inset-0 pointer-events-none">
              {visibles.map(b => {
                const it = b.startItem;
                const leftOpen = Boolean(b.startItem.continuaAntes);
                const rightOpen = Boolean(b.endItem.continuaDespues);
                const span = b.endCol - b.startCol + 1;
                return (
                  <div
                    key={b.id}
                    className="absolute"
                    style={{
                      left: `${(b.startCol / 7) * 100}%`,
                      width: `${(span / 7) * 100}%`,
                      top: HEADER_H + b.lane * LANE_H,
                      height: LANE_H - 4
                    }}
                  >
                    <div
                      className={`h-full flex text-white text-[10px] leading-tight overflow-hidden ${leftOpen ? 'rounded-l-none ml-0' : 'rounded-l ml-0.5'} ${rightOpen ? 'rounded-r-none mr-0' : 'rounded-r mr-0.5'}`}
                      style={{ backgroundColor: it.color }}
                      title={it.title}
                    >
                      {/* Un segmento por día del tramo: repite los datos en cada
                          celda de la barra, no solo en el día de inicio. */}
                      {Array.from({ length: span }).map((_, i) => (
                        <div key={i} className="flex-1 min-w-0 px-1.5 pt-0.5 pb-1 overflow-hidden border-l border-white/25 first:border-l-0">
                          <div className="truncate font-medium">
                            {i === 0 && leftOpen && <span className="opacity-80">‹ </span>}
                            {it.titulo}
                            {i === span - 1 && rightOpen && <span className="opacity-80"> ›</span>}
                          </div>
                          {it.subtitulo && <div className="truncate text-[9px] opacity-90">{it.subtitulo}</div>}
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
