import { createContext, useCallback, useContext, useState } from 'react';

const ToastContext = createContext(null);

const ICONS = {
  success: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
  ),
  error: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9"/><line x1="12" y1="8" x2="12" y2="13"/><circle cx="12" cy="16" r="0.5"/></svg>
  ),
  info: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9"/><line x1="12" y1="11" x2="12" y2="16"/><circle cx="12" cy="8" r="0.5"/></svg>
  ),
  warn: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><circle cx="12" cy="17" r="0.5"/></svg>
  )
};

export function ToastProvider({ children }) {
  const [items, setItems] = useState([]);

  const push = useCallback((toast) => {
    const id = Date.now() + Math.random();
    const duration = toast.duration || 3500;
    setItems((arr) => [...arr, { id, duration, ...toast }]);
    setTimeout(() => {
      setItems((arr) => arr.filter(x => x.id !== id));
    }, duration);
  }, []);

  const api = {
    success: (msg) => push({ type: 'success', msg }),
    error:   (msg) => push({ type: 'error',   msg, duration: 5000 }),
    info:    (msg) => push({ type: 'info',    msg }),
    warn:    (msg) => push({ type: 'warn',    msg })
  };

  const tone = {
    success: {
      bg: 'bg-white ring-emerald-200',
      icon: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
      bar: 'bg-emerald-500',
      text: 'text-emerald-900'
    },
    error: {
      bg: 'bg-white ring-rose-200',
      icon: 'bg-rose-50 text-rose-700 ring-rose-200',
      bar: 'bg-rose-500',
      text: 'text-rose-900'
    },
    info: {
      bg: 'bg-white ring-brand-200',
      icon: 'bg-brand-50 text-brand-700 ring-brand-200',
      bar: 'bg-brand-500',
      text: 'text-brand-900'
    },
    warn: {
      bg: 'bg-white ring-ember-200',
      icon: 'bg-ember-50 text-ember-700 ring-ember-200',
      bar: 'bg-ember-500',
      text: 'text-ember-900'
    }
  };

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div className="fixed top-4 right-4 z-[100] flex flex-col gap-2 max-w-sm w-[calc(100%-2rem)] sm:w-[24rem] pointer-events-none">
        {items.map(t => {
          const c = tone[t.type];
          return (
            <div key={t.id}
                 className={`relative overflow-hidden pointer-events-auto rounded-xl ${c.bg} ring-1 shadow-panel animate-toast-in`}>
              {/* halo cromático */}
              <div className="pointer-events-none absolute -top-12 -right-12 h-32 w-32 rounded-full opacity-30"
                   style={{ background: t.type === 'success' ? 'radial-gradient(circle, #10b981, transparent 70%)'
                                       : t.type === 'error'   ? 'radial-gradient(circle, #e11d48, transparent 70%)'
                                       : t.type === 'warn'    ? 'radial-gradient(circle, #e8853a, transparent 70%)'
                                                              : 'radial-gradient(circle, #4d8093, transparent 70%)' }} />

              <div className="relative flex items-start gap-3 px-3.5 py-3">
                <span className={`grid place-items-center h-7 w-7 rounded-lg ring-1 shrink-0 ${c.icon}`}>{ICONS[t.type]}</span>
                <p className={`text-[13px] font-medium leading-snug ${c.text}`}>{t.msg}</p>
              </div>

              {/* barra de progreso */}
              <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-carbon-100/60">
                <div className={`h-full ${c.bar} origin-left`}
                     style={{
                       animation: `progress ${t.duration}ms linear forwards`
                     }} />
              </div>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

export const useToast = () => useContext(ToastContext);
