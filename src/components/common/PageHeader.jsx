/**
 * Cabecera de página.
 *
 * En móvil las `actions` NO se apilan: se convierten en una tira deslizable
 * horizontal (`.barra-acciones`), sangrada hasta los bordes de la pantalla. Con
 * `flex-wrap` una pantalla como el detalle del servicio —que llega a ofrecer
 * ocho botones— empujaba el contenido real media pantalla hacia abajo; ahora
 * ocupa siempre una sola fila y el resto se alcanza deslizando.
 */
export default function PageHeader({ title, subtitle, actions, eyebrow }) {
  return (
    <div className="relative mb-5 sm:mb-7">
      {/* hairline superior gradient */}
      <div className="absolute -top-1 left-0 right-0 h-px hairline-top opacity-60" />

      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3 pt-3">
        <div className="min-w-0">
          {eyebrow ? (
            <p className="inline-flex items-center gap-2 text-[10px] uppercase tracking-[0.25em] font-bold text-ember-700 mb-1.5">
              <span className="h-px w-6 bg-ember-500" /> {eyebrow}
            </p>
          ) : (
            <p className="hidden sm:inline-flex items-center gap-2 text-[10px] uppercase tracking-[0.25em] font-bold text-brand-700 mb-1.5">
              <span className="chevs">
                <svg width="9" height="5" viewBox="0 0 9 5" fill="none"><path d="M1 4L4.5 1L8 4" stroke="#e8853a" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/></svg>
                <svg width="9" height="5" viewBox="0 0 9 5" fill="none"><path d="M1 1L4.5 4L8 1" stroke="#4d8093" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/></svg>
              </span>
              ERP · Ascensores Jy
            </p>
          )}
          <h1 className="font-display text-[1.35rem] sm:text-[2rem] leading-tight font-bold tracking-tight text-carbon-900 text-balance break-words">
            {title}
          </h1>
          {subtitle && (
            <p className="text-[12.5px] sm:text-[13.5px] text-carbon-500 mt-1 sm:mt-1.5 text-pretty break-words">{subtitle}</p>
          )}
        </div>
        {actions && (
          <>
            {/* Móvil: tira deslizable a sangre, sin desbordar la página. */}
            <div className="sm:hidden -mx-4 px-4">
              <div className="barra-acciones py-0.5">{actions}</div>
            </div>
            {/* Escritorio: el comportamiento de siempre. */}
            <div className="hidden sm:flex flex-wrap items-center gap-2 shrink-0 animate-rise-sm">
              {actions}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
