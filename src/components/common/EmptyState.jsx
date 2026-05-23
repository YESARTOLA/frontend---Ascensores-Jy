export default function EmptyState({ title = 'Sin registros', subtitle, action }) {
  return (
    <div className="relative p-12 text-center overflow-hidden">
      {/* halo decorativo */}
      <div className="pointer-events-none absolute -top-10 left-1/2 -translate-x-1/2 h-48 w-48 rounded-full"
           style={{ background: 'radial-gradient(circle, rgba(232,133,58,0.10), transparent 70%)' }} />

      <div className="relative mx-auto h-16 w-16 rounded-2xl ring-1 ring-carbon-200/80 bg-white/80 backdrop-blur-sm grid place-items-center shadow-card">
        <div className="chevs text-brand-600">
          <svg width="14" height="8" viewBox="0 0 14 8" fill="none">
            <path d="M1 7L7 1L13 7" stroke="#e8853a" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
          <svg width="14" height="8" viewBox="0 0 14 8" fill="none">
            <path d="M1 1L7 7L13 1" stroke="#4d8093" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </div>
      </div>

      <h3 className="mt-4 font-display text-[16px] font-bold text-carbon-800 tracking-tight">{title}</h3>
      {subtitle && <p className="text-[13px] text-carbon-500 mt-1.5 max-w-sm mx-auto text-pretty">{subtitle}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}
