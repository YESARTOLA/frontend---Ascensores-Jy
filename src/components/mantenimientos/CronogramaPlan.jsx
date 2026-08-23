import { useMemo, useState } from 'react';

/**
 * CRONOGRAMA DE UN PLAN DE MANTENIMIENTO
 *
 * El dato que gobierna la operación no es "qué fechas tiene cada ascensor" sino
 * "qué días hay que ir y a cuántos ascensores": cuando varios coinciden en la
 * misma fecha es UNA salida que los atiende a todos. Con una lista plana de
 * chips por ascensor esa coincidencia es invisible — hay que cruzar las filas
 * de fechas a ojo.
 *
 * Por eso la vista por defecto es la AGENDA: un CARD POR MES dispuesto en
 * rejilla, y dentro una línea por día con los ascensores que tocan. La rejilla
 * importa: en banda completa, doce meses obligaban a un scroll larguísimo con
 * la mitad derecha vacía; en cards caben hasta tres por fila.
 *
 * La vista POR ASCENSOR se conserva para revisar la serie de uno solo
 * (¿cada cuánto le toca?).
 *
 * Props:
 *   - programacion: respuesta de GET /mantenimientos/:id/programacion
 *   - seleccion:    { [id_visita]: true }
 *   - onToggle(idVisita)      alterna una visita
 *   - onToggleVarias(ids[])   alterna un día completo (todas o ninguna)
 *   - puedeEditar:  habilita la selección
 */

const DIAS = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];
const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

/** 'YYYY-MM-DD' → partes de calendario, en UTC puro (son días, no instantes). */
function partes(ymd) {
  const d = new Date(`${String(ymd).substring(0, 10)}T00:00:00.000Z`);
  return {
    dia: d.getUTCDate(),
    mes: MESES[d.getUTCMonth()],
    anio: d.getUTCFullYear(),
    semana: DIAS[d.getUTCDay()],
    esFinde: d.getUTCDay() === 0 || d.getUTCDay() === 6
  };
}

/**
 * Prefijo común de los códigos de ascensor, cortado en el último separador.
 *
 * Los códigos de un mismo edificio comparten casi todo ("UNI-NAC-CHO-MP-2",
 * "UNI-NAC-CHO-PS-1"): repetirlo en cada chip gasta justo el ancho que
 * necesitan los días para caber en una línea. Se extrae una vez, se muestra en
 * la cabecera, y los chips quedan con la parte que de verdad distingue.
 *
 * Devuelve '' si no hay ganancia real (menos de 2 ascensores o prefijo corto).
 */
function prefijoComun(codigos) {
  const lista = codigos.filter(Boolean);
  if (lista.length < 2) return '';
  let i = 0;
  while (i < lista[0].length && lista.every(c => c[i] === lista[0][i])) i++;
  const corte = lista[0].slice(0, i).lastIndexOf('-');
  if (corte < 3) return '';
  const pref = lista[0].slice(0, corte + 1);
  // Solo compensa si deja un sufijo legible en todos.
  return lista.every(c => c.slice(pref.length).length >= 2) ? pref : '';
}

/** Estado visual de una visita. El orden importa: omitida gana sobre el resto. */
function estadoVisita(v) {
  if (v.activo === 0) return 'omitida';
  if (v.realizada) return 'realizada';
  if (v.materializada) return 'creada';
  return 'pendiente';
}

const ESTILO_CHIP = {
  omitida:   'border-carbon-200 bg-carbon-50 text-carbon-400 line-through',
  realizada: 'border-emerald-300 bg-emerald-50 text-emerald-800',
  creada:    'border-brand-300 bg-brand-50 text-brand-800',
  pendiente: 'border-carbon-200 bg-white text-carbon-700'
};

const ESTILO_PUNTO = {
  omitida:   'bg-carbon-300',
  realizada: 'bg-emerald-500',
  creada:    'bg-brand-500',
  pendiente: 'bg-carbon-300'
};

export default function CronogramaPlan({
  programacion,
  seleccion = {},
  onToggle,
  onToggleVarias,
  puedeEditar = false
}) {
  const [vista, setVista] = useState('agenda');       // 'agenda' | 'ascensor'
  const [filtroAsc, setFiltroAsc] = useState('');
  const [soloConjuntas, setSoloConjuntas] = useState(false);

  const ascensores = programacion?.ascensores || [];
  const prefijo = useMemo(() => prefijoComun(ascensores.map(a => a.codigo)), [ascensores]);
  const corto = (codigo) => (prefijo && codigo?.startsWith(prefijo) ? codigo.slice(prefijo.length) : codigo);

  // Índice mes → día → visitas. Base de la agenda y del conteo de coincidencias.
  const meses = useMemo(() => {
    const porMes = new Map();
    for (const a of ascensores) {
      for (const v of a.visitas) {
        if (!porMes.has(v.numero_mes)) porMes.set(v.numero_mes, new Map());
        const dias = porMes.get(v.numero_mes);
        if (!dias.has(v.fecha)) dias.set(v.fecha, []);
        dias.get(v.fecha).push({ ...v, codigo: a.codigo, id_ascensor: a.id_ascensor });
      }
    }
    return [...porMes.entries()]
      .sort((x, y) => x[0] - y[0])
      .map(([numero_mes, dias]) => {
        const fechas = [...dias.entries()]
          .sort((x, y) => (x[0] < y[0] ? -1 : 1))
          .map(([fecha, visitas]) => {
            // "Conjunta" = varios ascensores DISTINTOS el mismo día, contando
            // solo las vigentes: si se omitieron, ya no se comparte viaje.
            const vigentes = visitas.filter(v => v.activo === 1);
            const distintos = new Set(vigentes.map(v => v.id_ascensor)).size;
            return { fecha, visitas, conjunta: distintos > 1, cuantos: distintos };
          });
        return { numero_mes, fechas };
      });
  }, [ascensores]);

  const resumen = useMemo(() => {
    const dias = meses.flatMap(m => m.fechas);
    return {
      visitas: dias.reduce((n, d) => n + d.visitas.filter(v => v.activo === 1).length, 0),
      dias: dias.filter(d => d.visitas.some(v => v.activo === 1)).length,
      conjuntas: dias.filter(d => d.conjunta).length,
      omitidas: dias.reduce((n, d) => n + d.visitas.filter(v => v.activo === 0).length, 0)
    };
  }, [meses]);

  if (!programacion || ascensores.length === 0) {
    return <p className="text-xs text-carbon-500">Este plan aún no tiene programación generada.</p>;
  }

  const visible = (v) => !filtroAsc || String(v.id_ascensor) === String(filtroAsc);

  /** Chip de un ascensor dentro de un día. */
  const Chip = ({ v }) => {
    const est = estadoVisita(v);
    const sel = !!seleccion[v.id];
    return (
      <button
        type="button"
        disabled={!puedeEditar}
        onClick={() => puedeEditar && onToggle(v.id)}
        title={[
          `${v.codigo} · visita ${v.ordinal}`,
          v.codigo_servicio ? `Servicio ${v.codigo_servicio} (${v.estado_servicio})` : 'Sin servicio creado',
          v.activo === 0 ? `Omitida${v.motivo_omision ? `: ${v.motivo_omision}` : ''}` : ''
        ].filter(Boolean).join('\n')}
        className={`inline-flex items-center gap-1 rounded border pl-1 pr-1.5 py-0.5 text-[10px] font-mono leading-tight transition ${ESTILO_CHIP[est]} ${
          sel ? 'ring-2 ring-brand-500' : ''
        } ${puedeEditar ? 'cursor-pointer hover:border-brand-400' : 'cursor-default'}`}
      >
        <span className={`inline-block w-1 h-1 rounded-full shrink-0 ${ESTILO_PUNTO[est]}`} />
        {corto(v.codigo)}
      </button>
    );
  };

  return (
    <div className="space-y-2.5">
      {/* Barra de control: resumen + vista + filtros ---------------------- */}
      <div className="flex flex-wrap items-center gap-2 justify-between">
        <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs text-carbon-600">
          <span><strong className="text-carbon-900 tabular-nums">{resumen.visitas}</strong> mantenimientos</span>
          <span className="text-carbon-300">·</span>
          <span><strong className="text-carbon-900 tabular-nums">{resumen.dias}</strong> días de salida</span>
          {resumen.conjuntas > 0 && (
            <>
              <span className="text-carbon-300">·</span>
              <span className="inline-flex items-center gap-1 text-ember-700">
                <span className="inline-block w-1.5 h-1.5 rounded-full bg-ember-500" />
                <strong className="tabular-nums">{resumen.conjuntas}</strong> conjuntas
              </span>
            </>
          )}
          {resumen.omitidas > 0 && (
            <>
              <span className="text-carbon-300">·</span>
              <span className="text-carbon-500">{resumen.omitidas} omitido(s)</span>
            </>
          )}
        </div>

        <div className="flex items-center gap-2">
          <div className="inline-flex rounded-lg ring-1 ring-carbon-200 bg-white p-0.5">
            {[['agenda', 'Agenda'], ['ascensor', 'Por ascensor']].map(([v, etiqueta]) => (
              <button
                key={v}
                type="button"
                onClick={() => setVista(v)}
                className={`px-2.5 py-1 text-[11px] rounded-md transition whitespace-nowrap ${
                  vista === v ? 'bg-brand-500 text-white font-medium' : 'text-carbon-600 hover:bg-carbon-50'
                }`}
              >{etiqueta}</button>
            ))}
          </div>

          {ascensores.length > 1 && (
            <select className="select !py-1 text-xs" value={filtroAsc} onChange={e => setFiltroAsc(e.target.value)}>
              <option value="">Todos</option>
              {ascensores.map(a => <option key={a.id_ascensor} value={a.id_ascensor}>{a.codigo}</option>)}
            </select>
          )}

          {vista === 'agenda' && resumen.conjuntas > 0 && (
            <label className="inline-flex items-center gap-1.5 text-[11px] text-carbon-600 cursor-pointer select-none whitespace-nowrap">
              <input type="checkbox" checked={soloConjuntas} onChange={e => setSoloConjuntas(e.target.checked)} />
              Solo conjuntas
            </label>
          )}
        </div>
      </div>

      {/* Sin este aviso, los códigos abreviados confunden. */}
      {prefijo && (
        <p className="text-[10px] text-carbon-500">
          Códigos abreviados: todos empiezan por <span className="font-mono text-carbon-700">{prefijo}</span>
        </p>
      )}

      {/* ------------------------- AGENDA (cards) ------------------------- */}
      {vista === 'agenda' && (
        <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
          {meses.map(mes => {
            const fechas = mes.fechas
              .filter(f => !soloConjuntas || f.conjunta)
              .filter(f => f.visitas.some(visible));
            if (fechas.length === 0) return null;
            const p = partes(fechas[0].fecha);
            const conjuntasMes = fechas.filter(f => f.conjunta).length;
            return (
              <div key={mes.numero_mes} className="rounded-lg ring-1 ring-carbon-200 bg-white overflow-hidden">
                <div className="flex items-baseline justify-between gap-1 px-2 py-1.5 bg-carbon-50/80 border-b border-carbon-100">
                  <span className="text-[11px] font-semibold text-carbon-800 truncate">
                    Mes {mes.numero_mes}
                    <span className="font-normal text-carbon-500"> · {p.mes} {p.anio}</span>
                  </span>
                  <span className="text-[10px] text-carbon-500 tabular-nums shrink-0">
                    {conjuntasMes > 0 && <span className="text-ember-600 mr-1">●{conjuntasMes}</span>}
                    {fechas.length}d
                  </span>
                </div>

                <ul className="divide-y divide-carbon-100">
                  {fechas.map(f => {
                    const fp = partes(f.fecha);
                    const delDia = f.visitas.filter(visible);
                    const ids = delDia.map(v => v.id);
                    const todasSel = ids.length > 0 && ids.every(id => seleccion[id]);
                    return (
                      <li
                        key={f.fecha}
                        className={`flex items-center gap-1.5 py-1 pr-1.5 pl-1 border-l-[3px] ${
                          f.conjunta ? 'border-l-ember-400 bg-ember-50/50' : 'border-l-transparent'
                        }`}
                      >
                        {/* Fecha compacta en UNA línea: día + día de semana. */}
                        <button
                          type="button"
                          disabled={!puedeEditar}
                          onClick={() => puedeEditar && onToggleVarias(ids)}
                          title={puedeEditar ? 'Seleccionar el día completo' : undefined}
                          className={`shrink-0 flex items-baseline gap-1 rounded px-1 py-0.5 transition ${
                            todasSel ? 'ring-2 ring-brand-500 bg-brand-50' : ''
                          } ${puedeEditar ? 'cursor-pointer hover:bg-carbon-100' : 'cursor-default'}`}
                        >
                          <span className={`text-[13px] font-semibold leading-none tabular-nums ${
                            fp.esFinde ? 'text-ember-600' : 'text-carbon-900'
                          }`}>{String(fp.dia).padStart(2, '0')}</span>
                          <span className="text-[9px] uppercase text-carbon-400 leading-none">{fp.semana}</span>
                        </button>

                        {/* Sustituye a la línea entera "Visita conjunta · N
                            ascensores", que gastaba un renglón por día. */}
                        {f.conjunta && (
                          <span
                            className="shrink-0 text-[9px] font-bold text-ember-700 tabular-nums"
                            title={`${f.cuantos} ascensores el mismo día — una sola salida`}
                          >×{f.cuantos}</span>
                        )}

                        <div className="flex flex-wrap gap-1 min-w-0">
                          {delDia.map(v => <Chip key={v.id} v={v} />)}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </div>
            );
          })}
        </div>
      )}

      {/* -------------------------- POR ASCENSOR --------------------------- */}
      {vista === 'ascensor' && (
        <div className="space-y-2">
          {ascensores
            .filter(a => !filtroAsc || String(a.id_ascensor) === String(filtroAsc))
            .map(a => (
              <div key={a.id_ascensor} className="rounded-lg ring-1 ring-carbon-200 overflow-hidden">
                <div className="flex items-center justify-between gap-2 px-2 py-1.5 bg-carbon-50/80 border-b border-carbon-100 flex-wrap">
                  <div className="text-xs">
                    <span className="font-mono text-carbon-900">{a.codigo}</span>
                    {a.edificio && <span className="text-[11px] text-carbon-500"> · {a.edificio}</span>}
                  </div>
                  <div className="text-[10px] text-carbon-600 flex items-center gap-1.5">
                    <span className="badge-blue !text-[10px] !py-0">{a.etiqueta_frecuencia}</span>
                    <span className="tabular-nums">{a.activas} programado(s)</span>
                    {a.omitidas > 0 && <span className="text-ember-700 tabular-nums">· {a.omitidas} omitido(s)</span>}
                  </div>
                </div>
                <div className="p-1.5 flex flex-wrap gap-1">
                  {a.visitas.map(v => {
                    const est = estadoVisita(v);
                    const sel = !!seleccion[v.id];
                    const fp = partes(v.fecha);
                    return (
                      <button
                        key={v.id}
                        type="button"
                        disabled={!puedeEditar}
                        onClick={() => puedeEditar && onToggle(v.id)}
                        title={[
                          `Mes ${v.numero_mes} · visita ${v.ordinal}`,
                          v.codigo_servicio ? `Servicio ${v.codigo_servicio} (${v.estado_servicio})` : 'Sin servicio creado',
                          v.activo === 0 ? `Omitida${v.motivo_omision ? `: ${v.motivo_omision}` : ''}` : ''
                        ].filter(Boolean).join('\n')}
                        className={`inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[10px] font-mono leading-tight transition ${ESTILO_CHIP[est]} ${
                          sel ? 'ring-2 ring-brand-500' : ''
                        } ${puedeEditar ? 'cursor-pointer hover:border-brand-400' : 'cursor-default'}`}
                      >
                        <span className={`inline-block w-1 h-1 rounded-full ${ESTILO_PUNTO[est]}`} />
                        <span className={fp.esFinde ? 'text-ember-600' : ''}>
                          {String(fp.dia).padStart(2, '0')} {fp.mes}
                        </span>
                        <span className="opacity-50">{String(fp.anio).slice(2)}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
        </div>
      )}

      {/* Leyenda. Los separadores son explícitos: con solo gap, los ítems que
          empiezan por un punto de color se leían pegados al texto anterior. */}
      <div className="flex flex-wrap items-center text-[10px] text-carbon-500 leading-relaxed">
        {[
          <span key="r" className="inline-flex items-center gap-1">
            <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-500" />realizado
          </span>,
          <span key="c" className="inline-flex items-center gap-1">
            <span className="inline-block w-1.5 h-1.5 rounded-full bg-brand-500" />servicio creado
          </span>,
          <span key="p" className="inline-flex items-center gap-1">
            <span className="inline-block w-1.5 h-1.5 rounded-full bg-carbon-300" />pendiente
          </span>,
          <span key="o" className="line-through text-carbon-400">omitido</span>,
          <span key="j" className="inline-flex items-center gap-1 text-ember-700">
            <span className="inline-block w-1.5 h-1.5 rounded-full bg-ember-500" />×N = visita conjunta
          </span>,
          <span key="f" className="text-ember-600">día naranja = fin de semana</span>,
          ...(puedeEditar
            ? [<span key="s">clic en el día = jornada completa</span>]
            : [])
        ].map((item, i) => (
          <span key={i} className="inline-flex items-center">
            {i > 0 && <span className="mx-1.5 text-carbon-300">·</span>}
            {item}
          </span>
        ))}
      </div>
    </div>
  );
}
