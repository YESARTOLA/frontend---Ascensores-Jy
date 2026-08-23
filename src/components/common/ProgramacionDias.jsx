import { useEffect, useMemo, useRef, useState } from 'react';
import {
  fechasDesdeTramos, tramosDesdeFechas, contarDias, resumenProgramacion, errorDeTramos,
  addDiasYMD, diaSemanaYMD, esDomingo, tieneDomingos, MAX_DIAS_PROGRAMADOS
} from '../../utils/programacion.js';
import { hoyISO, addMonthsYMD } from '../../utils/formatters.js';

/**
 * Editor de los DÍAS DE TRABAJO de un servicio: una tira lineal de días donde se
 * marcan directamente las fechas.
 *
 * El trabajo puede ocupar un rango (10–14 de agosto), fechas sueltas (10, 15 y
 * 20) o cualquier combinación: por eso la unidad de selección es el DÍA suelto y
 * los rangos salen de marcar varios seguidos. Interacción:
 *   - clic sobre un día        → lo marca o lo desmarca;
 *   - arrastrar con el ratón   → pinta el rango completo (marca o desmarca según
 *                                el estado del día donde arrancó el arrastre);
 *   - Shift + clic             → marca desde el último día tocado hasta este.
 * El técnico verá en su calendario solo los días marcados.
 *
 * Los DOMINGOS vienen bloqueados: no se programa trabajo en domingo (la misma
 * regla que asume el plazo de cierre en el backend). Un rango que los cruce los
 * salta en vez de cortarse. La casilla "Incluir domingos" levanta el bloqueo
 * para el caso excepcional, y se activa sola si la programación que se está
 * editando ya traía alguno, para que se pueda quitar.
 *
 * Es un componente controlado y su contrato NO cambia con la forma de la UI: el
 * padre guarda TRAMOS `{ desde, hasta }` y los manda al backend en `dias` (ver
 * utils/programacion → payloadDias). La tira los expande a días y los vuelve a
 * agrupar al emitir, así que rangos y días sueltos conviven sin caso especial.
 *
 * Props:
 *   - tramos: [{ desde, hasta }]
 *   - onChange: (tramos) => void
 *   - min: 'YYYY-MM-DD' primer día seleccionable (opcional)
 *   - disabled, label, ayuda
 */

const INICIALES_SEMANA = ['D', 'L', 'M', 'M', 'J', 'V', 'S'];
// Meses visibles a cada lado del mes ancla: permite arrastrar un rango que cruza
// de un mes al siguiente sin tener que cambiar de vista a mitad de gesto.
const MESES_ALREDEDOR = 1;

const mesDe = (ymd) => String(ymd || '').slice(0, 7);
const primerDiaDelMes = (ymd) => `${mesDe(ymd)}-01`;

function ultimoDiaDelMes(ymd) {
  const [y, m] = mesDe(ymd).split('-').map(Number);
  const dia = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return `${mesDe(ymd)}-${String(dia).padStart(2, '0')}`;
}

const FMT_MES = new Intl.DateTimeFormat('es-PE', { month: 'long', year: 'numeric', timeZone: 'UTC' });
const FMT_MES_CORTO = new Intl.DateTimeFormat('es-PE', { month: 'short', timeZone: 'UTC' });
// Solo la primera letra en mayúscula: el `capitalize` de CSS afectaría a todas
// las palabras y dejaría "Agosto De 2026".
const capitalizar = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);
const nombreMes = (ymd, corto = false) =>
  capitalizar((corto ? FMT_MES_CORTO : FMT_MES)
    .format(new Date(`${primerDiaDelMes(ymd)}T00:00:00.000Z`))
    .replace('.', ''));

/** Todos los días entre dos fechas, inclusive, en orden. */
function rangoDeDias(a, b) {
  const [desde, hasta] = a <= b ? [a, b] : [b, a];
  const dias = [];
  let cur = desde;
  while (cur && cur <= hasta) { dias.push(cur); cur = addDiasYMD(cur, 1); }
  return dias;
}

export default function ProgramacionDias({
  tramos = [],
  onChange,
  min,
  disabled = false,
  label = 'Días de trabajo',
  ayuda = 'Clic en un día para programarlo o quitarlo · arrastra para marcar varios seguidos · Shift + clic para llegar hasta un día lejano.'
}) {
  const fechas = useMemo(() => new Set(fechasDesdeTramos(tramos)), [tramos]);
  const total = useMemo(() => contarDias(tramos), [tramos]);
  const resumen = useMemo(() => resumenProgramacion(tramos), [tramos]);
  const error = useMemo(() => errorDeTramos(tramos), [tramos]);
  const hoy = useMemo(() => hoyISO(), []);

  // Mes en el centro de la tira. Arranca en el primer día ya programado (para
  // que al reprogramar se vea lo que hay) o en el mes en curso.
  const [ancla, setAncla] = useState(() => mesDe([...fechas].sort()[0] || min || hoy));
  // Gesto de arrastre en curso: desde qué día arrancó, si pinta o borra y hasta
  // dónde va el puntero (para previsualizar el rango antes de soltar). Se
  // duplica en una ref porque el gesto se cierra desde listeners globales y hay
  // que poder consumirlo una sola vez, sin depender del ciclo de render.
  const [arrastre, setArrastre] = useState(null);
  const arrastreRef = useRef(null);
  // Domingos bloqueados salvo que la programación que llega ya traiga alguno
  // (datos anteriores a la regla, o una excepción que alguien concedió): en ese
  // caso se abre el bloqueo para poder editarlos o quitarlos.
  const [incluirDomingos, setIncluirDomingos] = useState(() => tieneDomingos([...fechas]));
  // Último día tocado: ancla de los Shift + clic.
  const ultimoRef = useRef(null);
  const tiraRef = useRef(null);

  const dias = useMemo(() => {
    const desde = primerDiaDelMes(addMonthsYMD(`${ancla}-01`, -MESES_ALREDEDOR));
    const hasta = ultimoDiaDelMes(addMonthsYMD(`${ancla}-01`, MESES_ALREDEDOR));
    return rangoDeDias(desde, hasta);
  }, [ancla]);

  // Encuadre de la tira. Al abrirla se busca el primer día ya programado (o el
  // día de hoy) y se deja a la vista con un poco de aire: si el trabajo empieza
  // el 23 no sirve de nada aterrizar en el 1. Después, cada cambio de mes lleva
  // su día 1 al borde izquierdo.
  // Mientras se esté en el mes de partida el encuadre apunta al día concreto;
  // en cuanto el usuario navega a otro mes, al día 1 de ese mes. (No sirve una
  // bandera de "primer render": StrictMode monta dos veces y la consumiría.)
  const anclaInicialRef = useRef(ancla);
  useEffect(() => {
    const cont = tiraRef.current;
    if (!cont) return;
    if (ancla === anclaInicialRef.current) {
      const dentroDeVentana = hoy >= dias[0] && hoy <= dias[dias.length - 1];
      const objetivo = [...fechas].sort()[0] || (dentroDeVentana ? hoy : null);
      const celda = objetivo && cont.querySelector(`[data-ymd="${objetivo}"]`);
      if (celda) {
        // Un par de celdas de aire a la izquierda para no dejarlo pegado al borde.
        cont.scrollLeft = Math.max(0, celda.offsetLeft - cont.offsetLeft - 96);
        return;
      }
    }
    const inicioMes = cont.querySelector(`[data-inicio-mes="${ancla}"]`);
    if (inicioMes) cont.scrollLeft = inicioMes.offsetLeft - cont.offsetLeft;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ancla, dias]);

  // Soltar el ratón fuera de la tira también cierra el gesto: sin esto el
  // arrastre quedaría "pegado" y el siguiente movimiento seguiría pintando.
  useEffect(() => {
    if (!arrastre) return;
    const fin = () => aplicarArrastre();
    window.addEventListener('pointerup', fin);
    window.addEventListener('pointercancel', fin);
    return () => {
      window.removeEventListener('pointerup', fin);
      window.removeEventListener('pointercancel', fin);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [arrastre]);

  // Si la programación cargada trae domingos (o los inyecta el padre), se abre el
  // bloqueo: de lo contrario quedarían marcados y sin poder quitarse.
  useEffect(() => {
    if (!incluirDomingos && tieneDomingos([...fechas])) setIncluirDomingos(true);
  }, [fechas, incluirDomingos]);

  const emitir = (siguiente) => {
    if (disabled) return;
    onChange?.(tramosDesdeFechas([...siguiente]));
  };

  /**
   * Al levantar el bloqueo no se toca nada; al volver a ponerlo se quitan los
   * domingos ya programados, que es lo que el usuario acaba de pedir (el resumen
   * de abajo refleja el cambio al instante).
   */
  const cambiarIncluirDomingos = (activo) => {
    setIncluirDomingos(activo);
    if (!activo) {
      const sinDomingos = [...fechas].filter(f => !esDomingo(f));
      if (sinDomingos.length !== fechas.size) emitir(new Set(sinDomingos));
    }
  };

  const bloqueado = (ymd) =>
    disabled || (min && ymd < min) || (!incluirDomingos && esDomingo(ymd));

  /** Marca (o desmarca) una lista de días de una sola vez. */
  const aplicar = (lista, marcar) => {
    const siguiente = new Set(fechas);
    for (const f of lista) {
      if (bloqueado(f)) continue;
      if (marcar) siguiente.add(f); else siguiente.delete(f);
    }
    // Tope de seguridad (el backend rechaza más): se descarta el gesto entero
    // en vez de recortarlo a medias, que dejaría una programación sorpresa.
    if (marcar && siguiente.size > MAX_DIAS_PROGRAMADOS) return;
    emitir(siguiente);
  };

  const alPulsar = (e, ymd) => {
    if (bloqueado(ymd)) return;
    // Shift + clic: completa el rango desde el último día tocado. Es el atajo
    // para "del 10 al 20" sin arrastrar por toda la tira.
    if (e.shiftKey && ultimoRef.current) {
      aplicar(rangoDeDias(ultimoRef.current, ymd), true);
      ultimoRef.current = ymd;
      return;
    }
    // Con ratón se abre un gesto de arrastre; el toggle se aplica al soltar
    // (aunque no se mueva). En táctil el arrastre horizontal es el scroll de la
    // tira, así que ahí el toque simplemente alterna el día.
    if (e.pointerType === 'mouse') {
      const gesto = { desde: ymd, hasta: ymd, marcar: !fechas.has(ymd) };
      arrastreRef.current = gesto;
      setArrastre(gesto);
    } else {
      aplicar([ymd], !fechas.has(ymd));
      ultimoRef.current = ymd;
    }
  };

  const alEntrar = (ymd) => {
    const a = arrastreRef.current;
    if (!a || a.hasta === ymd) return;
    const gesto = { ...a, hasta: ymd };
    arrastreRef.current = gesto;
    setArrastre(gesto);
  };

  // Cierra el gesto y lo aplica. Idempotente: el `pointerup` llega tanto por el
  // contenedor como por el listener global y solo el primero encuentra el gesto.
  const aplicarArrastre = () => {
    const a = arrastreRef.current;
    arrastreRef.current = null;
    setArrastre(null);
    if (!a) return;
    aplicar(rangoDeDias(a.desde, a.hasta), a.marcar);
    ultimoRef.current = a.hasta;
  };

  // Días que el gesto en curso va a marcar o desmarcar, para pintarlos ya.
  const enGesto = useMemo(
    () => (arrastre ? new Set(rangoDeDias(arrastre.desde, arrastre.hasta)) : null),
    [arrastre]
  );

  const estadoDe = (ymd) => {
    if (enGesto?.has(ymd)) return arrastre.marcar ? 'previo-marcar' : 'previo-quitar';
    return fechas.has(ymd) ? 'marcado' : 'libre';
  };

  const CLASES = {
    marcado: 'bg-brand-500 text-white ring-brand-600 hover:bg-brand-600',
    'previo-marcar': 'bg-brand-300 text-white ring-brand-400',
    'previo-quitar': 'bg-carbon-100 text-carbon-400 ring-carbon-200 line-through',
    libre: 'bg-white text-carbon-700 ring-carbon-200 hover:ring-brand-300 hover:bg-brand-50'
  };

  return (
    <div className="space-y-2">
      <div className="flex items-baseline justify-between gap-2">
        <label className="label mb-0">{label} *</label>
        <div className="flex items-center gap-3">
          {total > 0 && !disabled && (
            <button type="button" onClick={() => emitir(new Set())}
              className="text-[11px] text-carbon-500 hover:text-rose-600 underline">Limpiar</button>
          )}
          <span className="text-xs text-carbon-500">
            {total > 0 ? `${total} día${total > 1 ? 's' : ''} programado${total > 1 ? 's' : ''}` : 'Sin días'}
          </span>
        </div>
      </div>

      <div className="rounded-lg ring-1 ring-carbon-200 bg-ivory-50/60 p-2">
        <div className="flex items-center justify-between gap-2 px-1 pb-2">
          <button type="button" aria-label="Mes anterior" disabled={disabled}
            onClick={() => setAncla(mesDe(addMonthsYMD(`${ancla}-01`, -1)))}
            className="h-7 w-7 grid place-items-center rounded-md text-carbon-500 hover:bg-carbon-100 disabled:opacity-40">‹</button>
          <span className="text-xs font-medium text-carbon-700">{nombreMes(`${ancla}-01`)}</span>
          <button type="button" aria-label="Mes siguiente" disabled={disabled}
            onClick={() => setAncla(mesDe(addMonthsYMD(`${ancla}-01`, 1)))}
            className="h-7 w-7 grid place-items-center rounded-md text-carbon-500 hover:bg-carbon-100 disabled:opacity-40">›</button>
        </div>

        <div
          ref={tiraRef}
          onPointerUp={aplicarArrastre}
          className="flex gap-1 overflow-x-auto pb-1 select-none"
          style={{ scrollbarWidth: 'thin' }}>
          {dias.map(ymd => {
            const dia = Number(ymd.slice(8));
            const esUno = dia === 1;
            const dow = diaSemanaYMD(ymd);
            const estado = estadoDe(ymd);
            const noSeleccionable = bloqueado(ymd);
            // Un domingo bloqueado no es un "error": se marca en gris con rayado
            // sutil y su propio tooltip, distinto de un día fuera de plazo.
            const domingoBloqueado = !incluirDomingos && esDomingo(ymd);
            return (
              <div key={ymd} className="flex items-stretch gap-1 shrink-0"
                {...(esUno ? { 'data-inicio-mes': mesDe(ymd) } : {})}>
                {esUno && (
                  // Separador de mes: ubica al usuario cuando la tira cruza de un
                  // mes al siguiente sin cortar el carril de días.
                  <div className="flex items-end pb-1 pl-1 pr-0.5 text-[10px] uppercase tracking-wide text-carbon-400 border-l border-carbon-200">
                    {nombreMes(ymd, true)}
                  </div>
                )}
                <button
                  type="button"
                  data-ymd={ymd}
                  disabled={noSeleccionable}
                  aria-pressed={fechas.has(ymd)}
                  aria-label={`${dia} de ${nombreMes(ymd).toLocaleLowerCase('es')}${domingoBloqueado ? ' (domingo, no se programa)' : ''}`}
                  title={domingoBloqueado ? 'Los domingos no se programan. Marca "Incluir domingos" si es una excepción.' : undefined}
                  onPointerDown={e => alPulsar(e, ymd)}
                  onPointerEnter={() => alEntrar(ymd)}
                  className={`w-11 shrink-0 rounded-lg ring-1 py-1.5 transition
                    ${domingoBloqueado ? 'bg-carbon-100/70 text-carbon-400 ring-carbon-200' : CLASES[estado]}
                    ${noSeleccionable ? 'cursor-not-allowed' : 'cursor-pointer'}
                    ${noSeleccionable && !domingoBloqueado ? 'opacity-40' : ''}
                    ${ymd === hoy ? 'ring-2 ring-ember-400' : ''}`}>
                  <span className={`block text-[10px] leading-none ${estado === 'marcado' || estado === 'previo-marcar' ? 'text-white/80' : dow === 0 ? 'text-rose-400' : 'text-carbon-400'}`}>
                    {INICIALES_SEMANA[dow]}
                  </span>
                  <span className="block text-sm font-medium leading-tight mt-0.5">{dia}</span>
                </button>
              </div>
            );
          })}
        </div>
      </div>

      {error
        ? <p className="text-[11px] text-rose-600">{error}</p>
        : <p className="text-[11px] text-carbon-600">Se trabajará el {resumen}.</p>}

      <label className={`flex items-center gap-2 text-[11px] w-fit ${disabled ? 'text-carbon-400' : 'text-carbon-600 cursor-pointer'}`}>
        <input type="checkbox" className="accent-brand-500" disabled={disabled}
          checked={incluirDomingos}
          onChange={e => cambiarIncluirDomingos(e.target.checked)} />
        <span>Incluir domingos <span className="text-carbon-400">(normalmente no se trabaja)</span></span>
      </label>

      <p className="text-[11px] text-carbon-400">
        {ayuda}{incluirDomingos ? '' : ' Los domingos están bloqueados: un rango que los cruce los salta.'}
      </p>
    </div>
  );
}
