/**
 * Cluster de botones para conmutar entre vista Lista y vista Mes, más la
 * navegación de mes (Hoy / ← / →) con la etiqueta del mes en curso. Es el mismo
 * control visual usado en Calendario, extraído para reutilizarlo en Recordatorios.
 */
export default function CalendarioControles({ modoLista, onToggleModo, onHoy, onPrev, onNext, mesLabel }) {
  return (
    <>
      <button onClick={onToggleModo} className="btn-secondary">{modoLista ? 'Vista mes' : 'Vista lista'}</button>
      <button onClick={onHoy} className="btn-secondary">Hoy</button>
      <button onClick={onPrev} className="btn-secondary">←</button>
      <span className="px-3 text-sm font-medium capitalize w-40 text-center">{mesLabel}</span>
      <button onClick={onNext} className="btn-secondary">→</button>
    </>
  );
}
