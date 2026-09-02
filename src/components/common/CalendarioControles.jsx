/**
 * Cluster de botones para conmutar entre vista Lista y vista Mes, más la
 * navegación de mes (Hoy / ← / →) con la etiqueta del mes en curso. Es el mismo
 * control visual usado en Calendario, extraído para reutilizarlo en Recordatorios.
 *
 * En móvil las flechas son cuadradas (target de 44px) y el mes se muestra
 * abreviado ("set. 2026"): cinco controles con "Setiembre De 2026" entero no
 * caben en una tira de 360px y la etiqueta se cortaba a mitad de palabra.
 * `mesLabelCorto` es opcional; sin él se usa la etiqueta larga en ambos tamaños.
 */
export default function CalendarioControles({ modoLista, onToggleModo, onHoy, onPrev, onNext, mesLabel, mesLabelCorto }) {
  return (
    <>
      <button onClick={onToggleModo} className="btn-secondary whitespace-nowrap">{modoLista ? 'Vista mes' : 'Vista lista'}</button>
      <button onClick={onHoy} className="btn-secondary">Hoy</button>
      <button onClick={onPrev} className="btn-secondary !px-3" aria-label="Mes anterior">←</button>
      <span className="px-1 sm:px-3 text-sm font-medium capitalize text-center whitespace-nowrap">
        <span className="sm:hidden">{mesLabelCorto || mesLabel}</span>
        <span className="hidden sm:inline-block w-40">{mesLabel}</span>
      </span>
      <button onClick={onNext} className="btn-secondary !px-3" aria-label="Mes siguiente">→</button>
    </>
  );
}
