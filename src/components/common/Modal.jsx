import { useEffect } from 'react';
import { createPortal } from 'react-dom';

// `banner`: contenido fijo bajo la cabecera, FUERA del área que scrollea. Para
// avisos que no pueden perderse de vista aunque el formulario sea largo.
export default function Modal({ open, onClose, title, children, footer, banner, size = 'md' }) {
  useEffect(() => {
    if (!open) return;
    const handler = (e) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', handler);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', handler);
      document.body.style.overflow = '';
    };
  }, [open, onClose]);

  if (!open) return null;
  const widths = { sm: 'max-w-md', md: 'max-w-2xl', lg: 'max-w-4xl', xl: 'max-w-6xl' };

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="absolute inset-0 bg-carbon-900/40 backdrop-blur-md animate-fade-in" />

      <div className={`relative w-full ${widths[size]} sm:rounded-2xl rounded-t-3xl max-h-[95vh] flex flex-col
                       bg-ivory-50 ring-1 ring-carbon-200/70 shadow-panel overflow-hidden animate-modal-in`}>
        {/* hairline arriba */}
        <div className="absolute top-0 left-0 right-0 h-px hairline-top" />
        {/* halo decorativo cabecera */}
        <div className="pointer-events-none absolute -top-20 -right-20 h-56 w-56 rounded-full"
             style={{ background: 'radial-gradient(circle, rgba(232,133,58,0.18), transparent 70%)' }} />
        <div className="pointer-events-none absolute -top-16 -left-20 h-56 w-56 rounded-full"
             style={{ background: 'radial-gradient(circle, rgba(77,128,147,0.18), transparent 70%)' }} />
        <div className="pointer-events-none absolute inset-0 bg-noise opacity-25 mix-blend-multiply" />

        <div className="relative px-5 sm:px-6 py-4 border-b border-carbon-100/80 flex items-center justify-between gap-3 bg-white/60 backdrop-blur-sm">
          <h3 className="font-display text-[15px] sm:text-[17px] font-bold text-carbon-900 tracking-tight">{title}</h3>
          <button onClick={onClose}
                  className="grid place-items-center h-8 w-8 rounded-lg text-carbon-500 hover:text-carbon-900 hover:bg-carbon-100 transition"
                  aria-label="Cerrar">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>

        {banner && (
          <div className="relative px-5 sm:px-6 py-3 border-b border-carbon-100/80 bg-white/60 backdrop-blur-sm">
            {banner}
          </div>
        )}

        <div className="relative p-5 sm:p-6 overflow-y-auto scroll-thin grow bg-white/60 backdrop-blur-sm">
          {children}
        </div>

        {footer && (
          <div className="relative px-5 sm:px-6 py-3.5 border-t border-carbon-100/80 bg-ivory-100/60 backdrop-blur-sm flex flex-wrap justify-end gap-2">
            {footer}
          </div>
        )}
      </div>
    </div>,
    document.body
  );
}
