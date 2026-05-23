export default function PageHeader({ title, subtitle, actions, eyebrow }) {
  return (
    <div className="relative mb-6 sm:mb-7">
      {/* hairline superior gradient */}
      <div className="absolute -top-1 left-0 right-0 h-px hairline-top opacity-60" />

      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3 pt-3">
        <div className="min-w-0">
          {eyebrow ? (
            <p className="inline-flex items-center gap-2 text-[10px] uppercase tracking-[0.25em] font-bold text-ember-700 mb-1.5">
              <span className="h-px w-6 bg-ember-500" /> {eyebrow}
            </p>
          ) : (
            <p className="inline-flex items-center gap-2 text-[10px] uppercase tracking-[0.25em] font-bold text-brand-700 mb-1.5">
              <span className="chevs">
                <svg width="9" height="5" viewBox="0 0 9 5" fill="none"><path d="M1 4L4.5 1L8 4" stroke="#e8853a" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/></svg>
                <svg width="9" height="5" viewBox="0 0 9 5" fill="none"><path d="M1 1L4.5 4L8 1" stroke="#4d8093" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/></svg>
              </span>
              ERP · Ascensores Jy
            </p>
          )}
          <h1 className="font-display text-[1.6rem] sm:text-[2rem] leading-tight font-bold tracking-tight text-carbon-900 text-balance">
            {title}
          </h1>
          {subtitle && (
            <p className="text-[13.5px] text-carbon-500 mt-1.5 text-pretty">{subtitle}</p>
          )}
        </div>
        {actions && (
          <div className="flex flex-wrap items-center gap-2 shrink-0 animate-rise-sm">
            {actions}
          </div>
        )}
      </div>
    </div>
  );
}
