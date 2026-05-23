export default function Loader({ inline, label = 'Cargando…' }) {
  if (inline) {
    return (
      <span className="inline-flex items-center gap-2 text-[13px] text-carbon-500">
        <span className="relative grid place-items-center h-4 w-4">
          <span className="absolute inset-0 rounded-full border-2 border-brand-500/30" />
          <span className="absolute inset-0 rounded-full border-2 border-transparent border-t-ember-500 animate-spin" />
        </span>
        {label}
      </span>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center py-14 gap-4 animate-fade-in">
      {/* Mini escena ascensor */}
      <div className="relative h-20 w-12 rounded-xl ring-1 ring-carbon-200/80 bg-white/70 backdrop-blur-sm overflow-hidden shadow-card">
        <div className="absolute top-3 left-0 right-0 h-px bg-carbon-200" />
        <div className="absolute bottom-3 left-0 right-0 h-px bg-carbon-200" />
        <div
          className="absolute left-1.5 right-1.5 top-1/2 -translate-y-1/2 h-6 rounded-md shadow-sm ring-1 ring-ember-400/40"
          style={{
            background: 'linear-gradient(180deg, #fff, #fae8cd 50%, #e8853a)',
            animation: 'elev-up 2.4s ease-in-out infinite'
          }} />
      </div>

      <div className="flex items-center gap-2 text-[12px] uppercase tracking-[0.25em] font-bold text-carbon-500">
        <span className="chevs">
          <svg width="9" height="5" viewBox="0 0 9 5" fill="none"><path d="M1 4L4.5 1L8 4" stroke="#e8853a" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
          <svg width="9" height="5" viewBox="0 0 9 5" fill="none"><path d="M1 1L4.5 4L8 1" stroke="#4d8093" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
        </span>
        {label}
      </div>
    </div>
  );
}
