import { NavLink } from 'react-router-dom';
import { useAuth } from '../../features/auth/AuthContext.jsx';

/**
 * Navegación inferior de móvil. Es el índice real de la app en el teléfono: el
 * dedo llega abajo, no arriba.
 *
 * `onMas` abre el drawer lateral con el menú completo. Sin ese acceso, los
 * módulos que no caben en la barra (Emergencias, Correctivos, Mantenimientos…)
 * solo se alcanzaban por el botón hamburguesa del Topbar, en la esquina
 * opuesta a donde está la mano.
 */
export default function MobileNav({ onMas }) {
  const { rol, accesoProyectos, accesoServicios } = useAuth();

  // El ítem Proyectos apunta a /servicios (módulo Proyectos): solo se muestra si
  // el usuario tiene ese ámbito, para no redirigir a un admin acotado a Servicios.
  let items = [
    { to: '/', label: 'Inicio', icon: 'home' },
    ...(accesoProyectos ? [{ to: '/servicios', label: 'Proyectos', icon: 'briefcase' }] : []),
    { to: '/calendario', label: 'Agenda', icon: 'calendar' },
    { to: '/clientes', label: 'Clientes', icon: 'users' }
  ];
  if (rol === 'tecnico') {
    // El día del técnico: lo de hoy, la agenda, lo que ya cerró y sus avisos.
    // El resto de sus módulos (emergencias, correctivos, mantenimientos) entra
    // por "Más", que despliega el menú completo.
    items = [
      { to: '/', label: 'Inicio', icon: 'home' },
      { to: '/panel-tecnico', label: 'Mis servicios', icon: 'wrench' },
      { to: '/calendario', label: 'Agenda', icon: 'calendar' },
      { to: '/servicios-realizados', label: 'Historial', icon: 'check' }
    ];
  } else if (rol === 'coordinador') {
    items = [
      { to: '/', label: 'Inicio', icon: 'home' },
      { to: '/asignaciones', label: 'Asignaciones', icon: 'briefcase' },
      { to: '/calendario', label: 'Agenda', icon: 'calendar' },
      { to: '/recordatorios', label: 'Recordatorios', icon: 'doc' }
    ];
  } else if (rol === 'contabilidad') {
    items = [
      { to: '/', label: 'Inicio', icon: 'home' },
      { to: '/cobros', label: 'Cobros', icon: 'money' },
      { to: '/facturas', label: 'Facturas', icon: 'doc' },
      { to: '/clientes', label: 'Clientes', icon: 'users' }
    ];
  }

  const visibles = items.slice(0, 4);
  // Los roles acotados (vendedora / central de ventas) no tienen menú que
  // desplegar: para ellos el botón "Más" sobra.
  const conMas = !!onMas && !['vendedora', 'central_ventas'].includes(rol);
  const columnas = visibles.length + (conMas ? 1 : 0);

  return (
    <nav className="lg:hidden fixed bottom-0 left-0 right-0 z-30 px-3 pt-2
                    [padding-bottom:calc(0.5rem+env(safe-area-inset-bottom,0px))]">
      <div className="relative rounded-2xl bg-white/90 backdrop-blur-xl ring-1 ring-carbon-200/70 shadow-panel overflow-hidden">
        <div className="absolute top-0 left-0 right-0 h-px hairline-top" />
        <div className="grid gap-0.5 px-1.5 py-1.5"
             style={{ gridTemplateColumns: `repeat(${columnas}, minmax(0, 1fr))` }}>
          {visibles.map(it => (
            <NavLink key={it.to} to={it.to} end={it.to === '/'}
              className={({ isActive }) =>
                'group relative flex flex-col items-center justify-center gap-0.5 min-h-[52px] py-1.5 rounded-xl text-[10px] font-semibold transition '
                + (isActive
                  ? 'text-ember-700 bg-ember-50/80 ring-1 ring-ember-200'
                  : 'text-carbon-500 active:bg-carbon-100/70')}>
              {({ isActive }) => (
                <>
                  <Icon name={it.icon} active={isActive} />
                  <span className="leading-tight text-center px-0.5 truncate w-full">{it.label}</span>
                  {isActive && (
                    <span className="absolute bottom-0.5 left-1/2 -translate-x-1/2 h-0.5 w-6 rounded-full bg-gradient-to-r from-ember-500 to-brand-500" />
                  )}
                </>
              )}
            </NavLink>
          ))}
          {conMas && (
            <button type="button" onClick={onMas} aria-label="Abrir menú completo"
              className="group relative flex flex-col items-center justify-center gap-0.5 min-h-[52px] py-1.5 rounded-xl
                         text-[10px] font-semibold text-carbon-500 active:bg-carbon-100/70 transition">
              <Icon name="mas" active={false} />
              <span className="leading-tight">Más</span>
            </button>
          )}
        </div>
      </div>
    </nav>
  );
}

function Icon({ name, active }) {
  const common = {
    width: 21, height: 21, viewBox: '0 0 24 24', fill: 'none',
    stroke: 'currentColor', strokeWidth: active ? 2.3 : 2,
    strokeLinecap: 'round', strokeLinejoin: 'round',
    className: 'transition-transform group-active:scale-90'
  };
  if (name === 'home')      return (<svg {...common}><path d="M3 12L12 3l9 9" /><path d="M5 10v10h14V10" /></svg>);
  if (name === 'briefcase') return (<svg {...common}><rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/></svg>);
  if (name === 'calendar')  return (<svg {...common}><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>);
  if (name === 'users')     return (<svg {...common}><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/></svg>);
  if (name === 'money')     return (<svg {...common}><rect x="2" y="6" width="20" height="12" rx="2"/><circle cx="12" cy="12" r="3"/></svg>);
  if (name === 'doc')       return (<svg {...common}><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>);
  if (name === 'wrench')    return (<svg {...common}><path d="M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18l3 3 6.3-6.3a4 4 0 0 0 5.4-5.4l-2.3 2.3-2-2 2.3-2.3z"/></svg>);
  if (name === 'check')     return (<svg {...common}><path d="M21 11.5V19a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h9"/><polyline points="9 11 12 14 22 4"/></svg>);
  if (name === 'mas')       return (<svg {...common}><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="18" x2="21" y2="18"/></svg>);
  return null;
}
