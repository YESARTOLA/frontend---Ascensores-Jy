import { formatBytes, formatDuracion } from '../../hooks/useCargaArchivos.js';

/**
 * Barra de progreso de una carga de adjuntos. Se alimenta del hook
 * `useCargaArchivos` y responde a las tres preguntas que se hace quien sube un
 * video pesado desde la obra: qué se está subiendo, cuánto falta y si falló.
 *
 * Props:
 *   carga       — lo que devuelve useCargaArchivos() (usa `carga.progreso`)
 *   progreso    — alternativa a `carga` si se maneja el estado por fuera
 *   onCancelar  — si se pasa, aparece el botón "Cancelar" (por defecto usa carga.cancelar)
 *   className   — clases extra del contenedor
 */
export default function BarraProgresoCarga({ carga, progreso, onCancelar, className = '' }) {
  const p = progreso ?? carga?.progreso;
  if (!p) return null;

  const esError = p.fase === 'error';
  const variosArchivos = p.total > 1;
  // Con varios archivos la barra sigue el avance de la tanda completa; con uno
  // solo, el del archivo (que es lo mismo, pero sin inducir a confusión).
  const pctBarra = variosArchivos ? p.pctTotal : p.pct;

  const etiquetaFase = esError ? 'Error en la carga'
    : p.fase === 'registrando' ? 'Registrando el adjunto…'
    : p.fase === 'procesando' ? 'Guardando en el servidor…'
    : 'Subiendo…';

  const cancelar = onCancelar ?? carga?.cancelar;
  const puedeCancelar = !esError && !!cancelar && p.fase === 'subiendo';

  return (
    <div
      className={`rounded-lg p-3 ring-1 ${esError ? 'ring-rose-200 bg-rose-50' : 'ring-slate-200 bg-slate-50'} ${className}`}
      role="status"
      aria-live="polite"
    >
      <div className="flex items-center justify-between gap-2 text-xs">
        <span className={`truncate min-w-0 ${esError ? 'text-rose-800' : 'text-slate-700'}`} title={p.nombre}>
          {variosArchivos && <span className="text-slate-400 mr-1">{p.indice}/{p.total}</span>}
          {p.nombre}
        </span>
        <span className={`font-mono shrink-0 ${esError ? 'text-rose-700' : 'text-slate-600'}`}>
          {esError ? '—' : `${pctBarra}%`}
        </span>
      </div>

      <div className="h-1.5 rounded-full bg-slate-200 overflow-hidden mt-1.5">
        <div
          className={`h-full transition-all duration-200 ${esError ? 'bg-rose-500' : p.fase === 'subiendo' ? 'bg-brand-600' : 'bg-brand-600 animate-pulse'}`}
          style={{ width: `${esError ? 100 : Math.max(pctBarra, 2)}%` }}
        />
      </div>

      <div className="flex items-center justify-between gap-2 mt-1.5 text-[11px]">
        <span className={esError ? 'text-rose-700' : 'text-slate-500'}>
          {esError ? p.error : etiquetaFase}
        </span>
        {!esError && (
          <span className="text-slate-400 shrink-0 tabular-nums">
            {formatBytes(p.cargados)} / {formatBytes(p.bytesArchivo)}
            {p.restanteSeg != null && p.fase === 'subiendo' && ` · faltan ${formatDuracion(p.restanteSeg)}`}
          </span>
        )}
      </div>

      {(puedeCancelar || esError) && (
        <div className="flex justify-end mt-1.5">
          {esError ? (
            <button type="button" className="text-[11px] text-rose-700 hover:underline" onClick={() => carga?.limpiar?.()}>
              Descartar aviso
            </button>
          ) : (
            <button type="button" className="text-[11px] text-slate-500 hover:underline" onClick={cancelar}>
              Cancelar
            </button>
          )}
        </div>
      )}
    </div>
  );
}
