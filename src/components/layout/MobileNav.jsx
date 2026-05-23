import { NavLink } from 'react-router-dom';
import { useAuth } from '../../features/auth/AuthContext.jsx';

export default function MobileNav() {
  const { rol } = useAuth();

  let items = [
    { to: '/', label: 'Inicio', icon: 'home' },
    { to: '/servicios', label: 'Servicios', icon: 'briefcase' },
    { to: '/calendario', label: 'Agenda', icon: 'calendar' },
    { to: '/clientes', label: 'Clientes', icon: 'users' }
  ];
  if (rol === 'tecnico') {
    items = [
      { to: '/', label: 'Inicio', icon: 'home' },
      { to: '/panel-tecnico', label: 'Mis servicios', icon: 'briefcase' },
      { to: '/calendario', label: 'Agenda', icon: 'calendar' }
    ];
  } else if (rol === 'contabilidad') {
    items = [
      { to: '/', label: 'Inicio', icon: 'home' },
      { to: '/cobros', label: 'Cobros', icon: 'money' },
      { to: '/facturas', label: 'Facturas', icon: 'doc' },
      { to: '/clientes', label: 'Clientes', icon: 'users' }
    ];
  }

  return (
    <nav className="lg:hidden fixed bottom-3 left-3 right-3 z-30">
      <div className="relative rounded-2xl bg-white/85 backdrop-blur-xl ring-1 ring-carbon-200/70 shadow-panel overflow-hidden">
        <div className="absolute top-0 left-0 right-0 h-px hairline-top" />
        <div className={`grid gap-1 px-1.5 py-1.5`}
             style={{ gridTemplateColumns: `repeat(${Math.min(items.length, 4)}, minmax(0, 1fr))` }}>
          {items.slice(0, 4).map(it => (
            <NavLink key={it.to} to={it.to} end={it.to === '/'}
              className={({ isActive }) =>
                'group relative flex flex-col items-center gap-0.5 py-2 rounded-xl text-[10.5px] font-semibold transition '
                + (isActive
                  ? 'text-ember-700 bg-ember-50/80 ring-1 ring-ember-200'
                  : 'text-carbon-500 hover:text-carbon-800')}>
              {({ isActive }) => (
                <>
                  <Icon name={it.icon} active={isActive} />
                  <span>{it.label}</span>
                  {isActive && (
                    <span className="absolute -bottom-0.5 left-1/2 -translate-x-1/2 h-0.5 w-6 rounded-full bg-gradient-to-r from-ember-500 to-brand-500" />
                  )}
                </>
              )}
            </NavLink>
          ))}
        </div>
      </div>
    </nav>
  );
}

function Icon({ name, active }) {
  const common = {
    width: 20, height: 20, viewBox: '0 0 24 24', fill: 'none',
    stroke: 'currentColor', strokeWidth: active ? 2.2 : 2,
    strokeLinecap: 'round', strokeLinejoin: 'round',
    className: 'transition-transform group-active:scale-90'
  };
  if (name === 'home')      return (<svg {...common}><path d="M3 12L12 3l9 9" /><path d="M5 10v10h14V10" /></svg>);
  if (name === 'briefcase') return (<svg {...common}><rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/></svg>);
  if (name === 'calendar')  return (<svg {...common}><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>);
  if (name === 'users')     return (<svg {...common}><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/></svg>);
  if (name === 'money')     return (<svg {...common}><rect x="2" y="6" width="20" height="12" rx="2"/><circle cx="12" cy="12" r="3"/></svg>);
  if (name === 'doc')       return (<svg {...common}><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>);
  return null;
}
