/**
 * Tabs por "Tipo padre" de servicio (Servicios, Proyectos, …), generados
 * dinámicamente desde el catálogo de tipos. Un tab "Todos" al inicio y,
 * opcionalmente, "Sin clasificar" al final (registros sin tipo asignado).
 *
 * El valor del tab activo se maneja como string:
 *   '' → Todos · '<id>' → ese padre · 'sin' → Sin clasificar.
 * Lo consume el filtro server-side de cada módulo (Leads / Cotizaciones).
 *
 * Props:
 *   padres: tipos padre activos (cada uno { id, nombre }).
 *   value: tab activo ('' | '<id>' | 'sin').
 *   onChange: (claveTab) => void.
 *   incluyeSinClasificar: agrega el tab "Sin clasificar" (default false).
 */
export default function PadreTabs({ padres = [], value = '', onChange, incluyeSinClasificar = false }) {
  const tabs = [
    { key: '', label: 'Todos' },
    ...padres.map(p => ({ key: String(p.id), label: p.nombre })),
    ...(incluyeSinClasificar ? [{ key: 'sin', label: 'Sin clasificar' }] : [])
  ];

  return (
    <div className="flex flex-wrap gap-1 mb-4 border-b border-slate-200">
      {tabs.map(t => {
        const activo = String(value) === t.key;
        return (
          <button
            key={t.key || 'todos'}
            type="button"
            onClick={() => onChange(t.key)}
            className={`px-3 py-2 text-sm font-medium border-b-2 -mb-px transition ${
              activo
                ? 'border-brand-600 text-brand-700'
                : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
          >
            {t.label}
          </button>
        );
      })}
    </div>
  );
}
