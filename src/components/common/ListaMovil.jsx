import { Link } from 'react-router-dom';

/**
 * Listas de móvil: lo que sustituye a una tabla cuando la pantalla no da para
 * columnas.
 *
 * Las tablas operativas de esta app tienen entre 10 y 15 columnas. En un
 * teléfono eso obligaba a arrastrar horizontalmente para leer una sola fila, y
 * a perder de vista la primera columna (el código) justo cuando se necesitaba.
 * Aquí cada registro es una tarjeta tocable con la misma información, ordenada
 * por importancia: identidad arriba, estado a la derecha, el resto como pares
 * etiqueta/valor.
 *
 * Va SIEMPRE en pareja con la tabla, no en su lugar:
 *     <div className="hidden md:block …"><table…/></div>
 *     <ListaMovil> … </ListaMovil>
 * para que el escritorio conserve la tabla y ninguna vista pierda datos.
 *
 * `hasta` marca dónde deja de usarse la tarjeta y aparece la tabla, y debe
 * coincidir con el prefijo del contenedor de la tabla:
 *   - 'md'  (por defecto): tablas de hasta ~10 columnas, cómodas ya en tablet.
 *   - 'lg': tablas de 15 columnas —Correctivos, Servicios realizados—, que a
 *     820px seguirían obligando a arrastrar media pantalla para leer una fila.
 */
export function ListaMovil({ children, hasta = 'md', className = '' }) {
  // Clases literales: el escáner de Tailwind no ve las construidas por plantilla.
  const oculta = hasta === 'lg' ? 'lg:hidden' : 'md:hidden';
  return (
    <div className={`${oculta} divide-y divide-carbon-100/80 ${className}`}>
      {children}
    </div>
  );
}

/**
 * Una fila.
 *
 * Props:
 *  - to / onClick : destino de la fila entera (toda la tarjeta es el target).
 *  - codigo       : identificador monoespaciado de la primera línea.
 *  - titulo       : texto principal.
 *  - subtitulo    : contexto (cliente · edificio · ascensor).
 *  - badge        : nodo alineado arriba a la derecha (normalmente el estado).
 *  - chips        : nodos bajo el título (urgencia, «gratuito», «sin factura»…).
 *  - datos        : [[etiqueta, valor], …] — las columnas restantes de la tabla.
 *                   Los pares con valor nulo/vacío se omiten.
 *  - acciones     : botones al pie, FUERA del área tocable de la fila.
 *  - destacado    : realza el borde (p. ej. urgencia alta o vencido).
 */
export function FilaMovil({
  to, onClick, codigo, titulo, subtitulo, badge, chips, datos = [], acciones, destacado = false
}) {
  const cuerpo = (
    <>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          {codigo && <div className="font-mono text-[11px] text-brand-700">{codigo}</div>}
          {titulo && <div className="font-semibold text-carbon-900 text-sm leading-snug mt-0.5 break-words">{titulo}</div>}
          {subtitulo && <div className="text-xs text-carbon-500 mt-0.5 break-words">{subtitulo}</div>}
        </div>
        {badge && <div className="shrink-0">{badge}</div>}
      </div>

      {chips && <div className="flex flex-wrap items-center gap-1.5 mt-2">{chips}</div>}

      {datos.length > 0 && (
        <dl className="mt-2.5 space-y-1">
          {datos
            // Se omite también el guion de "sin dato": en una tabla ocupa una
            // celda que ya existe, pero en la tarjeta añadiría una fila entera
            // para no decir nada.
            .filter(([, valor]) => valor !== null && valor !== undefined && valor !== '' && valor !== '—')
            .map(([etiqueta, valor]) => (
              <div key={etiqueta} className="dato-movil">
                <dt>{etiqueta}</dt>
                <dd>{valor}</dd>
              </div>
            ))}
        </dl>
      )}
    </>
  );

  const clase = `fila-movil ${destacado ? 'border-l-2 border-l-rose-400' : ''}`;

  return (
    <div className={destacado ? 'bg-rose-50/30' : ''}>
      {to ? (
        <Link to={to} className={clase}>{cuerpo}</Link>
      ) : onClick ? (
        <button type="button" onClick={onClick} className={clase}>{cuerpo}</button>
      ) : (
        <div className="px-4 py-3.5">{cuerpo}</div>
      )}
      {acciones && (
        <div className="px-4 pb-3 -mt-1 flex flex-wrap items-center gap-x-4 gap-y-1.5">
          {acciones}
        </div>
      )}
    </div>
  );
}

/**
 * Acción secundaria de una fila móvil: texto, pero con alto táctil suficiente
 * para acertarle con el dedo sin ampliar visualmente la tarjeta.
 */
export function AccionFila({ children, onClick, to, tono = 'brand', ...resto }) {
  const color = tono === 'rose' ? 'text-rose-600' : tono === 'emerald' ? 'text-emerald-700' : 'text-brand-700';
  const clase = `inline-flex items-center min-h-[36px] text-xs font-semibold ${color} active:opacity-60`;
  if (to) return <Link to={to} className={clase} {...resto}>{children}</Link>;
  return <button type="button" onClick={onClick} className={clase} {...resto}>{children}</button>;
}
