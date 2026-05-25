import { useEffect, useMemo } from 'react';
import { formatMonto } from '../../utils/formatters.js';

/**
 * Editor del plan de cuotas informativo de una cotización.
 *
 * Props:
 *   value:    { tiene_cuotas, saldo_variable, modo, count, fecha_inicial, frecuencia,
 *               plan: [{numero_cuota, fecha_vencimiento, monto, observacion}] }
 *   onChange: (next) => void
 *   total:    number — monto total de la versión, contra el que se valida la suma
 *   moneda:   string
 *
 * Modos:
 *   - "adelanto"      → 2 cuotas (Adelanto + Saldo). UI dedicada con monto/fecha/comentario
 *                       por cuota; el saldo se deriva = total − adelanto.
 *   - "iguales"       → generador automático (N cuotas iguales con frecuencia).
 *   - "personalizadas"→ N filas vacías que el usuario edita a mano.
 *
 * IMPORTANTE: este editor SOLO planifica las cuotas pendientes — NO registra ningún
 * pago. Tras aprobar la cotización, las cuotas nacen en estado "Pendiente" en
 * Gestión de Cobros, y el abono se registra desde allí al recibirse el dinero.
 *
 * saldo_variable: si está activo, una vez aprobada la cotización el saldo
 * posterior a las cuotas pagadas/facturadas puede ser redistribuido o
 * recalculado en monto desde el módulo de cobros (ej. obras con adelanto
 * fijo y saldo final renegociable).
 */

const FRECUENCIAS = [
  { valor: 'semanal',   label: 'Semanal',   dias: 7 },
  { valor: 'quincenal', label: 'Quincenal', dias: 15 },
  { valor: 'mensual',   label: 'Mensual',   meses: 1 },
  { valor: 'bimestral', label: 'Bimestral', meses: 2 },
  { valor: 'trimestral',label: 'Trimestral',meses: 3 }
];

// El plan siempre se guarda en montos; el porcentaje es solo un modo de
// captura. El "100%" representa el total de la cotización (dinámico vía prop).
const PORCENTAJE_TOTAL = 100;
const TOLERANCIA_SUMA = 0.01;

function round2(n) { return Math.round((Number(n) + Number.EPSILON) * 100) / 100; }

// Conversión monto ↔ porcentaje contra un total dado. Con total 0 el
// porcentaje no está definido, así que devuelve 0 para evitar NaN/Infinity.
function montoAPorcentaje(monto, total) {
  return total > 0 ? round2((Number(monto) || 0) / total * PORCENTAJE_TOTAL) : 0;
}
function porcentajeAMonto(pct, total) {
  return round2((Number(pct) || 0) / PORCENTAJE_TOTAL * total);
}

function sumarFrecuencia(fechaISO, frecuencia, pasos) {
  const cfg = FRECUENCIAS.find(f => f.valor === frecuencia) || FRECUENCIAS[2];
  const [y, m, d] = fechaISO.split('-').map(Number);
  const base = new Date(Date.UTC(y, m - 1, d));
  if (cfg.dias) base.setUTCDate(base.getUTCDate() + cfg.dias * pasos);
  else base.setUTCMonth(base.getUTCMonth() + cfg.meses * pasos);
  return base.toISOString().slice(0, 10);
}

function nuevaCuotaVacia(idx) {
  return { numero_cuota: idx + 1, fecha_vencimiento: '', monto: 0, observacion: '' };
}

export function planCuotasInicial() {
  return {
    tiene_cuotas: false,
    saldo_variable: false,
    modo: 'adelanto',
    modo_captura: 'monto', // 'monto' | 'porcentaje' (solo afecta la captura)
    count: 2,
    fecha_inicial: '',
    frecuencia: 'mensual',
    plan: []
  };
}

export function planCuotasDesdeServidor(version) {
  if (!version?.tiene_cuotas || !Array.isArray(version.plan_cuotas)) {
    return planCuotasInicial();
  }
  // 2 cuotas se interpreta como adelanto+saldo (UI más clara). N!=2 cae en personalizadas.
  const modo = version.plan_cuotas.length === 2 ? 'adelanto' : 'personalizadas';
  return {
    tiene_cuotas: true,
    saldo_variable: Boolean(version.saldo_variable),
    modo,
    modo_captura: 'monto', // el servidor solo guarda montos; se captura en montos al reabrir
    count: version.plan_cuotas.length,
    fecha_inicial: version.plan_cuotas[0]?.fecha_vencimiento || '',
    frecuencia: 'mensual',
    plan: version.plan_cuotas.map(c => ({
      numero_cuota: c.numero_cuota,
      fecha_vencimiento: String(c.fecha_vencimiento).slice(0, 10),
      monto: Number(c.monto),
      observacion: typeof c.observacion === 'string' ? c.observacion : ''
    }))
  };
}

export default function CuotasEditor({ value, onChange, total, moneda }) {
  const v = value;
  const set = (patch) => onChange({ ...v, ...patch });
  const setPlan = (plan) => onChange({ ...v, plan });

  const totalNum = Number(total || 0);

  // Mantener plan[1].monto sincronizado con (total − plan[0].monto) en modo adelanto.
  // Evita que cambiar items del total deje el saldo desfasado en estado interno.
  useEffect(() => {
    if (v.modo !== 'adelanto' || !Array.isArray(v.plan) || v.plan.length < 2) return;
    const montoAdel = Number(v.plan[0]?.monto) || 0;
    const montoSaldo = round2(totalNum - montoAdel);
    if (Math.abs(montoSaldo - (Number(v.plan[1]?.monto) || 0)) > 0.001) {
      const next = [...v.plan];
      next[1] = { ...next[1], monto: montoSaldo, numero_cuota: 2 };
      setPlan(next);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [v.modo, totalNum, v.plan?.[0]?.monto]);

  const esPorcentaje = v.modo_captura === 'porcentaje';

  const sumaPlan = useMemo(() => {
    if (v.modo === 'adelanto') return totalNum; // suma derivada
    return round2((v.plan || []).reduce((a, c) => a + (Number(c.monto) || 0), 0));
  }, [v.plan, v.modo, totalNum]);
  const diferencia = round2(sumaPlan - totalNum);
  const cuadra = Math.abs(diferencia) <= TOLERANCIA_SUMA;

  // Equivalentes en porcentaje (para la vista en modo captura por %).
  const sumaPorcentaje = montoAPorcentaje(sumaPlan, totalNum);
  const diferenciaPorcentaje = round2(sumaPorcentaje - PORCENTAJE_TOTAL);

  const cambiarModo = (modo) => {
    if (modo === 'adelanto') {
      const plan = Array.isArray(v.plan) ? [...v.plan] : [];
      while (plan.length < 2) plan.push(nuevaCuotaVacia(plan.length));
      if (plan.length > 2) plan.length = 2;
      plan.forEach((c, i) => { c.numero_cuota = i + 1; });
      // Sincronizar saldo respecto al total actual
      plan[1] = { ...plan[1], monto: round2(totalNum - (Number(plan[0]?.monto) || 0)) };
      onChange({ ...v, modo, plan });
    } else {
      onChange({ ...v, modo });
    }
  };

  // ── Generadores existentes (iguales / personalizadas) ──────────────────────
  const generarCronograma = () => {
    if (!v.fecha_inicial) return;
    const n = Math.max(2, Number(v.count) || 2);
    const montoUnit = round2(totalNum / n);
    const acumulado = round2(montoUnit * (n - 1));
    const ultima = round2(totalNum - acumulado);
    const plan = Array.from({ length: n }, (_, i) => ({
      numero_cuota: i + 1,
      fecha_vencimiento: i === 0 ? v.fecha_inicial : sumarFrecuencia(v.fecha_inicial, v.frecuencia, i),
      monto: i === n - 1 ? ultima : montoUnit,
      observacion: v.plan[i]?.observacion || ''
    }));
    setPlan(plan);
  };

  const generarVaciasPersonalizadas = () => {
    const n = Math.max(2, Number(v.count) || 2);
    setPlan(Array.from({ length: n }, (_, i) => nuevaCuotaVacia(i)));
  };

  const cambiarCuota = (idx, key, val) => {
    setPlan(v.plan.map((c, i) => i === idx ? { ...c, [key]: key === 'monto' ? Number(val) : val } : c));
  };

  const agregarCuota = () => {
    setPlan([...v.plan, nuevaCuotaVacia(v.plan.length)]);
  };

  const quitarCuota = (idx) => {
    const next = v.plan.filter((_, i) => i !== idx).map((c, i) => ({ ...c, numero_cuota: i + 1 }));
    setPlan(next);
  };

  // ── Handlers del modo "adelanto" ───────────────────────────────────────────
  const ensurePlanAdelanto = (plan) => {
    while (plan.length < 2) plan.push(nuevaCuotaVacia(plan.length));
    plan.forEach((c, i) => { c.numero_cuota = i + 1; });
    return plan;
  };

  const cambiarAdelanto = (key, val) => {
    const plan = ensurePlanAdelanto(Array.isArray(v.plan) ? [...v.plan] : []);
    if (key === 'monto') {
      const m = Number(val) || 0;
      plan[0] = { ...plan[0], monto: m };
      plan[1] = { ...plan[1], monto: round2(totalNum - m) };
    } else if (key === 'fecha') {
      plan[0] = { ...plan[0], fecha_vencimiento: val };
    } else if (key === 'observacion') {
      plan[0] = { ...plan[0], observacion: val };
    }
    setPlan(plan);
  };

  const cambiarSaldo = (key, val) => {
    const plan = ensurePlanAdelanto(Array.isArray(v.plan) ? [...v.plan] : []);
    if (key === 'fecha') {
      plan[1] = { ...plan[1], fecha_vencimiento: val };
    } else if (key === 'observacion') {
      plan[1] = { ...plan[1], observacion: val };
    }
    setPlan(plan);
  };

  // Lectura segura para el modo adelanto
  const adelanto = v.modo === 'adelanto' ? (v.plan?.[0] || {}) : null;
  const saldoCuota = v.modo === 'adelanto' ? (v.plan?.[1] || {}) : null;
  const montoSaldoMostrado = v.modo === 'adelanto'
    ? round2(totalNum - (Number(adelanto?.monto) || 0))
    : 0;

  return (
    <div className="border border-carbon-100 rounded-lg p-3 bg-ivory-50/40 space-y-3">
      <label className="inline-flex items-center gap-2 text-sm font-medium text-carbon-800">
        <input type="checkbox" checked={v.tiene_cuotas}
          onChange={e => set({ tiene_cuotas: e.target.checked })} />
        Esta cotización se paga en cuotas
      </label>

      {v.tiene_cuotas && (
        <>
          <div className="text-xs text-carbon-700 bg-sky-50/60 ring-1 ring-sky-200 rounded-md p-2 flex gap-2">
            <span aria-hidden="true" className="text-sky-600 shrink-0 font-semibold">i</span>
            <span>
              Aquí solo planificas las cuotas pendientes.{' '}
              <span className="font-semibold">No se registra ningún pago en este paso.</span>{' '}
              El adelanto y el saldo quedan pendientes en Gestión de cobros y se cobran al recibirse el dinero.
            </span>
          </div>

          <div className="flex gap-4 text-sm flex-wrap">
            <label className="inline-flex items-center gap-1.5">
              <input type="radio" name="cuotas_modo" checked={v.modo === 'adelanto'}
                onChange={() => cambiarModo('adelanto')} />
              Adelanto + saldo
            </label>
            <label className="inline-flex items-center gap-1.5">
              <input type="radio" name="cuotas_modo" checked={v.modo === 'iguales'}
                onChange={() => cambiarModo('iguales')} />
              Iguales (auto)
            </label>
            <label className="inline-flex items-center gap-1.5">
              <input type="radio" name="cuotas_modo" checked={v.modo === 'personalizadas'}
                onChange={() => cambiarModo('personalizadas')} />
              Personalizadas
            </label>
          </div>

          {v.modo !== 'iguales' && (
            <div className="flex items-center gap-3 text-sm flex-wrap">
              <span className="text-xs font-medium text-carbon-600">Capturar montos por:</span>
              <label className="inline-flex items-center gap-1.5">
                <input type="radio" name="cuotas_modo_captura" checked={v.modo_captura === 'monto'}
                  onChange={() => set({ modo_captura: 'monto' })} />
                Monto fijo
              </label>
              <label className="inline-flex items-center gap-1.5">
                <input type="radio" name="cuotas_modo_captura" checked={esPorcentaje}
                  onChange={() => set({ modo_captura: 'porcentaje' })} />
                Porcentaje (%)
              </label>
              {esPorcentaje && (
                <span className="text-[11px] text-carbon-500">El total de las cuotas debe sumar 100% del total de la cotización.</span>
              )}
            </div>
          )}

          <label className="flex items-start gap-2 text-sm text-carbon-700 bg-amber-50/40 ring-1 ring-amber-200 rounded-md p-2">
            <input type="checkbox" className="mt-0.5"
              checked={Boolean(v.saldo_variable)}
              onChange={e => set({ saldo_variable: e.target.checked })} />
            <span>
              <span className="font-medium text-carbon-800">Saldo posterior al adelanto es variable</span>
              <span className="block text-xs text-carbon-500">
                Una vez aprobada, las cuotas pendientes (no pagadas ni facturadas) podrán
                redistribuirse y su suma podrá subir o bajar desde Cobros (ej. obras con
                alcance que ajusta durante la ejecución). Las cuotas blindadas (pagadas o
                facturadas) quedan inmutables.
              </span>
            </span>
          </label>

          {v.modo === 'adelanto' && (
            <div className="space-y-3">
              <div className="border border-carbon-100 rounded-md p-3 bg-white space-y-2">
                <div className="text-[11px] uppercase tracking-wider text-carbon-500 font-semibold">Adelanto · Cuota 1</div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <div>
                    <label className="label">{esPorcentaje ? '% del adelanto *' : 'Monto del adelanto *'}</label>
                    {esPorcentaje ? (
                      <>
                        <input
                          type="number" step="0.01" min="0" max={PORCENTAJE_TOTAL} className="input"
                          value={montoAPorcentaje(adelanto?.monto, totalNum) || ''}
                          onChange={e => cambiarAdelanto('monto', porcentajeAMonto(e.target.value, totalNum))} />
                        <p className="text-[11px] text-carbon-500 mt-0.5">= {formatMonto(round2(Number(adelanto?.monto) || 0), moneda)}</p>
                      </>
                    ) : (
                      <input
                        type="number" step="0.01" min="0" className="input"
                        value={adelanto?.monto ?? ''}
                        onChange={e => cambiarAdelanto('monto', e.target.value)} />
                    )}
                  </div>
                  <div>
                    <label className="label">Fecha esperada *</label>
                    <input
                      type="date" className="input"
                      value={adelanto?.fecha_vencimiento || ''}
                      onChange={e => cambiarAdelanto('fecha', e.target.value)} />
                  </div>
                </div>
                <div>
                  <label className="label">Comentario (opcional)</label>
                  <input
                    type="text" maxLength={200} className="input"
                    placeholder="Ej.: a confirmar al firmar la cotización"
                    value={adelanto?.observacion || ''}
                    onChange={e => cambiarAdelanto('observacion', e.target.value)} />
                </div>
              </div>

              <div className="border border-carbon-100 rounded-md p-3 bg-white space-y-2">
                <div className="text-[11px] uppercase tracking-wider text-carbon-500 font-semibold">Saldo · Cuota 2</div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <div>
                    <label className="label">{esPorcentaje ? '% del saldo' : 'Monto del saldo'}</label>
                    <input
                      type="text" readOnly className="input bg-carbon-50/60 cursor-not-allowed"
                      title="Calculado automáticamente: Total − Adelanto"
                      value={esPorcentaje
                        ? `${montoAPorcentaje(montoSaldoMostrado, totalNum)}%`
                        : formatMonto(montoSaldoMostrado, moneda)} />
                    {esPorcentaje && (
                      <p className="text-[11px] text-carbon-500 mt-0.5">= {formatMonto(montoSaldoMostrado, moneda)}</p>
                    )}
                  </div>
                  <div>
                    <label className="label">Fecha esperada *</label>
                    <input
                      type="date" className="input"
                      value={saldoCuota?.fecha_vencimiento || ''}
                      onChange={e => cambiarSaldo('fecha', e.target.value)} />
                  </div>
                </div>
                <div>
                  <label className="label">Comentario (opcional)</label>
                  <input
                    type="text" maxLength={200} className="input"
                    placeholder="Ej.: Saldo a coordinar al finalizar el servicio"
                    value={saldoCuota?.observacion || ''}
                    onChange={e => cambiarSaldo('observacion', e.target.value)} />
                </div>
              </div>
            </div>
          )}

          {v.modo === 'iguales' && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 items-end">
              <div>
                <label className="label">N° de cuotas</label>
                <input type="number" min="2" step="1" className="input"
                  value={v.count} onChange={e => set({ count: e.target.value })} />
              </div>
              <div>
                <label className="label">Primera cuota</label>
                <input type="date" className="input"
                  value={v.fecha_inicial} onChange={e => set({ fecha_inicial: e.target.value })} />
              </div>
              <div>
                <label className="label">Frecuencia</label>
                <select className="select" value={v.frecuencia} onChange={e => set({ frecuencia: e.target.value })}>
                  {FRECUENCIAS.map(f => <option key={f.valor} value={f.valor}>{f.label}</option>)}
                </select>
              </div>
              <button type="button" onClick={generarCronograma}
                disabled={!v.fecha_inicial || !(totalNum > 0)}
                className="btn-primary text-xs !py-2 disabled:opacity-50">Generar cronograma</button>
            </div>
          )}

          {v.modo === 'personalizadas' && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 items-end">
              <div>
                <label className="label">N° de cuotas</label>
                <input type="number" min="2" step="1" className="input"
                  value={v.count} onChange={e => set({ count: e.target.value })} />
              </div>
              <button type="button" onClick={generarVaciasPersonalizadas}
                className="btn-ghost text-xs !py-2">Crear filas vacías</button>
            </div>
          )}

          {v.modo !== 'adelanto' && v.plan.length > 0 && (
            <>
              <div className="hidden sm:grid grid-cols-12 gap-2 px-1 text-[10px] font-semibold uppercase tracking-wider text-carbon-500 border-b border-carbon-100 pb-1">
                <div className="col-span-2">Cuota</div>
                <div className="col-span-3">Vencimiento</div>
                <div className="col-span-3">Observación</div>
                <div className="col-span-3 text-right">{esPorcentaje ? 'Porcentaje (%)' : 'Monto'}</div>
                <div className="col-span-1"></div>
              </div>
              <div className="space-y-2">
                {v.plan.map((c, idx) => (
                  <div key={idx} className="grid grid-cols-12 gap-2 items-center">
                    <div className="col-span-2 font-medium text-sm">Cuota {c.numero_cuota}</div>
                    <input type="date" className="input col-span-3"
                      value={c.fecha_vencimiento}
                      onChange={e => cambiarCuota(idx, 'fecha_vencimiento', e.target.value)} />
                    <input type="text" className="input col-span-3" maxLength={200}
                      placeholder="Opcional"
                      value={c.observacion || ''}
                      onChange={e => cambiarCuota(idx, 'observacion', e.target.value)} />
                    <div className="col-span-3">
                      {esPorcentaje ? (
                        <>
                          <input type="number" step="0.01" min="0" max={PORCENTAJE_TOTAL} className="input text-right w-full"
                            value={montoAPorcentaje(c.monto, totalNum) || ''}
                            onChange={e => cambiarCuota(idx, 'monto', porcentajeAMonto(e.target.value, totalNum))} />
                          <p className="text-[11px] text-carbon-500 text-right mt-0.5">= {formatMonto(round2(Number(c.monto) || 0), moneda)}</p>
                        </>
                      ) : (
                        <input type="number" step="0.01" min="0" className="input text-right w-full"
                          value={c.monto}
                          onChange={e => cambiarCuota(idx, 'monto', e.target.value)} />
                      )}
                    </div>
                    <button type="button" onClick={() => quitarCuota(idx)}
                      className="col-span-1 text-carbon-400 hover:text-red-600 text-lg leading-none">×</button>
                  </div>
                ))}
              </div>
              <div className="flex items-center justify-between text-sm pt-2 border-t border-carbon-100">
                <button type="button" onClick={agregarCuota} className="btn-ghost text-xs !py-1.5 !px-3">+ Agregar cuota</button>
                <div className="text-right">
                  <div className="text-xs text-carbon-500">
                    {esPorcentaje ? 'Suma % / 100%' : 'Suma cuotas / Total cotización'}
                  </div>
                  <div className={`font-bold ${cuadra ? 'text-emerald-700' : 'text-red-600'}`}>
                    {esPorcentaje
                      ? `${sumaPorcentaje}% / ${PORCENTAJE_TOTAL}%`
                      : `${formatMonto(sumaPlan, moneda)} / ${formatMonto(totalNum, moneda)}`}
                  </div>
                  {!cuadra && (
                    <div className="text-xs text-red-600">
                      {esPorcentaje
                        ? `Diferencia: ${diferenciaPorcentaje}%`
                        : `Diferencia: ${formatMonto(diferencia, moneda)}`}
                    </div>
                  )}
                </div>
              </div>
            </>
          )}

          {v.modo === 'adelanto' && (
            <div className="flex items-center justify-end text-sm pt-2 border-t border-carbon-100">
              <div className="text-right">
                <div className="text-xs text-carbon-500">
                  {esPorcentaje ? 'Adelanto + Saldo / 100%' : 'Adelanto + Saldo / Total cotización'}
                </div>
                <div className="font-bold text-emerald-700">
                  {esPorcentaje
                    ? `${sumaPorcentaje}% / ${PORCENTAJE_TOTAL}%`
                    : `${formatMonto(sumaPlan, moneda)} / ${formatMonto(totalNum, moneda)}`}
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

/**
 * Devuelve el payload listo para enviar al backend, o lanza Error si el
 * plan está habilitado pero inválido.
 *
 * En modo "adelanto" el monto del saldo se deriva del total: el state
 * interno puede estar desfasado momentáneamente, pero el payload siempre
 * recomputa para garantizar que Σ cuotas == total.
 */
export function planParaPayload(value, total) {
  if (!value?.tiene_cuotas) {
    return { tiene_cuotas: false, plan_cuotas: null, saldo_variable: false };
  }

  const totalNum = round2(Number(total) || 0);

  if (value.modo === 'adelanto') {
    const a = value.plan?.[0] || {};
    const s = value.plan?.[1] || {};
    const montoAdelanto = round2(Number(a.monto) || 0);
    const montoSaldo = round2(totalNum - montoAdelanto);
    if (!(montoAdelanto > 0)) {
      throw new Error('El monto del adelanto debe ser mayor a 0');
    }
    if (!(montoSaldo > 0)) {
      throw new Error('El adelanto no puede ser igual o mayor al total de la cotización');
    }
    if (!a.fecha_vencimiento) {
      throw new Error('Falta la fecha esperada del adelanto');
    }
    if (!s.fecha_vencimiento) {
      throw new Error('Falta la fecha esperada del saldo');
    }
    const plan = [
      {
        numero_cuota: 1,
        fecha_vencimiento: a.fecha_vencimiento,
        monto: montoAdelanto,
        observacion: typeof a.observacion === 'string' ? a.observacion.trim().slice(0, 200) : ''
      },
      {
        numero_cuota: 2,
        fecha_vencimiento: s.fecha_vencimiento,
        monto: montoSaldo,
        observacion: typeof s.observacion === 'string' ? s.observacion.trim().slice(0, 200) : ''
      }
    ];
    return {
      tiene_cuotas: true,
      plan_cuotas: plan,
      saldo_variable: Boolean(value.saldo_variable)
    };
  }

  if (!Array.isArray(value.plan) || value.plan.length < 2) {
    throw new Error('Define al menos 2 cuotas');
  }
  const limpio = value.plan.map((c, i) => ({
    numero_cuota: i + 1,
    fecha_vencimiento: c.fecha_vencimiento,
    monto: round2(c.monto),
    observacion: typeof c.observacion === 'string' ? c.observacion.trim().slice(0, 200) : ''
  }));
  const suma = round2(limpio.reduce((a, c) => a + c.monto, 0));
  if (Math.abs(suma - totalNum) > TOLERANCIA_SUMA) {
    throw new Error(`La suma de cuotas (${suma.toFixed(2)}) no coincide con el total (${totalNum.toFixed(2)})`);
  }
  for (const c of limpio) {
    if (!c.fecha_vencimiento) throw new Error(`Cuota ${c.numero_cuota}: falta fecha de vencimiento`);
    if (!(c.monto > 0)) throw new Error(`Cuota ${c.numero_cuota}: monto debe ser mayor a 0`);
  }
  return { tiene_cuotas: true, plan_cuotas: limpio, saldo_variable: Boolean(value.saldo_variable) };
}
