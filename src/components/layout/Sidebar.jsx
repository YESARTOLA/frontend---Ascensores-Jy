import { NavLink } from 'react-router-dom';
import { useAuth } from '../../features/auth/AuthContext.jsx';
import Logo from '../common/Logo.jsx';

const ICONS = {
  dashboard: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="3" width="7" height="7" rx="1.5" /><rect x="3" y="14" width="7" height="7" rx="1.5" /><rect x="14" y="14" width="7" height="7" rx="1.5" /></svg>
  ),
  users: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /></svg>
  ),
  elevator: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="5" y="3" width="14" height="18" rx="2" /><path d="M9 8l3-3 3 3M9 16l3 3 3-3" /></svg>
  ),
  briefcase: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="7" width="20" height="14" rx="2" /><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" /></svg>
  ),
  list: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="8" y1="6" x2="21" y2="6" /><line x1="8" y1="12" x2="21" y2="12" /><line x1="8" y1="18" x2="21" y2="18" /><circle cx="4" cy="6" r="1" /><circle cx="4" cy="12" r="1" /><circle cx="4" cy="18" r="1" /></svg>
  ),
  check: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
  ),
  money: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="6" width="20" height="12" rx="2" /><circle cx="12" cy="12" r="3" /></svg>
  ),
  alert: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" /><line x1="12" y1="9" x2="12" y2="13" /><circle cx="12" cy="17" r="0.5" /></svg>
  ),
  calendar: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" /></svg>
  ),
  doc: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /><line x1="8" y1="13" x2="16" y2="13" /><line x1="8" y1="17" x2="16" y2="17" /></svg>
  ),
  bolt: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>
  ),
  bell: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/></svg>
  ),
  receipt: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 2v20l3-2 3 2 3-2 3 2 3-2 1 2V2"/><line x1="8" y1="8" x2="16" y2="8"/><line x1="8" y1="12" x2="16" y2="12"/><line x1="8" y1="16" x2="12" y2="16"/></svg>
  ),
  wrench: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18l3 3 6.3-6.3a4 4 0 0 0 5.4-5.4l-2.3 2.3-2-2 2.3-2.3z"/></svg>
  ),
  cog: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
  )
};

function Link({ to, icon, label, onClose }) {
  return (
    <NavLink
      to={to}
      onClick={onClose}
      className={({ isActive }) => 'sidebar-link group' + (isActive ? ' sidebar-link-active' : '')}
      end
    >
      <span className="grid place-items-center h-7 w-7 rounded-lg ring-1 ring-transparent group-hover:ring-carbon-200 group-hover:bg-white transition">
        {icon}
      </span>
      <span className="truncate">{label}</span>
    </NavLink>
  );
}

export default function Sidebar({ open, onClose }) {
  const { rol, accesoServicios, accesoProyectos } = useAuth();
  const visibleFor = (...roles) => roles.includes(rol);
  const alcance = { accesoServicios, accesoProyectos };

  return (
    <>
      {/* Drawer móvil */}
      <div className={`fixed inset-0 z-40 lg:hidden transition ${open ? 'pointer-events-auto' : 'pointer-events-none'}`}>
        <div className={`absolute inset-0 bg-carbon-900/35 backdrop-blur-[2px] transition-opacity duration-300 ${open ? 'opacity-100' : 'opacity-0'}`} onClick={onClose} />
        <aside className={`absolute inset-y-0 left-0 w-72 shadow-panel transform transition-transform duration-300 ease-out ${open ? 'translate-x-0' : '-translate-x-full'} flex flex-col`}>
          <SidebarSurface>
            <Header />
            <Nav onClose={onClose} visibleFor={visibleFor} rol={rol} {...alcance} />
            <Footer />
          </SidebarSurface>
        </aside>
      </div>

      {/* Sidebar fija escritorio */}
      <aside className="hidden lg:flex fixed inset-y-0 left-0 w-64 z-30 flex-col">
        <SidebarSurface>
          <Header />
          <Nav visibleFor={visibleFor} rol={rol} {...alcance} />
          <Footer />
        </SidebarSurface>
      </aside>
    </>
  );
}

function SidebarSurface({ children }) {
  return (
    <div className="relative h-full flex flex-col bg-white/85 backdrop-blur-xl ring-1 ring-carbon-100 overflow-hidden">
      {/* franja superior gradient */}
      <div className="absolute top-0 left-0 right-0 h-px hairline-top" />
      {/* halo decorativo */}
      <div className="pointer-events-none absolute -top-24 -left-20 h-64 w-64 rounded-full"
           style={{ background: 'radial-gradient(circle, rgba(232,133,58,0.10), transparent 70%)' }} />
      <div className="pointer-events-none absolute bottom-0 -right-20 h-64 w-64 rounded-full"
           style={{ background: 'radial-gradient(circle, rgba(77,128,147,0.10), transparent 70%)' }} />
      {/* grano sutil */}
      <div className="pointer-events-none absolute inset-0 bg-noise opacity-30 mix-blend-multiply" />
      <div className="relative flex-1 flex flex-col min-h-0">{children}</div>
    </div>
  );
}

function Header() {
  return (
    <div className="px-5 pt-5 pb-4 border-b border-carbon-100/80">
      <div className="flex items-center gap-3">
        <Logo size={42} className="shrink-0" />
        <div className="leading-tight min-w-0">
          <div className="font-display font-bold text-carbon-900 text-[15px] truncate">Ascensores Jy</div>
          <div className="flex items-center gap-1.5 text-[9.5px] uppercase tracking-[0.22em] text-carbon-500 mt-0.5">
            <span className="inline-block h-1 w-1 rounded-full bg-emerald-500 animate-pulse" />
            ERP · Operativo
          </div>
        </div>
      </div>
    </div>
  );
}

function Nav({ onClose, visibleFor, rol, accesoServicios, accesoProyectos }) {
  // La Vendedora solo opera Leads y consulta el Calendario (solo lectura): su
  // menú se reduce a esas dos entradas.
  if (rol === 'vendedora') {
    return (
      <nav className="px-3 py-4 flex-1 overflow-y-auto scroll-thin">
        <Section label="Comercial" />
        <Link to="/leads" icon={ICONS.briefcase} label="Leads" onClose={onClose} />
        <Link to="/calendario" icon={ICONS.calendar} label="Calendario" onClose={onClose} />
      </nav>
    );
  }
  return (
    <nav className="px-3 py-4 flex-1 overflow-y-auto scroll-thin">
      <Section label="Operación" />
      <Link to="/" icon={ICONS.dashboard} label="Dashboard" onClose={onClose} />
      {visibleFor('super_admin', 'admin', 'contabilidad', 'coordinador') && (
        <Link to="/clientes" icon={ICONS.users} label="Clientes" onClose={onClose} />
      )}
      {visibleFor('super_admin', 'admin', 'contabilidad', 'coordinador') && (
        <Link to="/ascensores" icon={ICONS.elevator} label="Ascensores" onClose={onClose} />
      )}
      {visibleFor('super_admin', 'admin', 'coordinador') && (
        <Link to="/tecnicos" icon={ICONS.users} label="Técnicos" onClose={onClose} />
      )}
      {visibleFor('super_admin', 'admin') && (
        <Link to="/tipos-servicio" icon={ICONS.list} label="Tipos de servicio" onClose={onClose} />
      )}
      {visibleFor('super_admin', 'admin') && (
        <Link to="/tipos-ascensor" icon={ICONS.list} label="Tipos de ascensor" onClose={onClose} />
      )}
      {visibleFor('super_admin', 'admin', 'contabilidad') && (
        <Link to="/cotizaciones" icon={ICONS.receipt} label="Cotizaciones" onClose={onClose} />
      )}
      {visibleFor('super_admin', 'admin', 'contabilidad', 'tecnico', 'coordinador') && accesoProyectos && (
        <Link to="/servicios" icon={ICONS.briefcase} label="Proyectos" onClose={onClose} />
      )}
      {visibleFor('super_admin', 'admin', 'coordinador') && (
        <Link to="/asignaciones" icon={ICONS.list} label="Asignaciones" onClose={onClose} />
      )}
      {visibleFor('tecnico') && (
        <Link to="/panel-tecnico" icon={ICONS.check} label="Panel técnico" onClose={onClose} />
      )}
      <Link to="/calendario" icon={ICONS.calendar} label="Calendario" onClose={onClose} />
      <Link to="/recordatorios" icon={ICONS.bell} label="Recordatorios" onClose={onClose} />

      <Section label="Atención" />
      {accesoServicios && (
        <Link to="/emergencias" icon={ICONS.alert} label="Emergencias" onClose={onClose} />
      )}
      {visibleFor('super_admin', 'admin', 'coordinador', 'contabilidad', 'tecnico') && accesoServicios && (
        <Link to="/correctivos" icon={ICONS.wrench} label="Correctivos" onClose={onClose} />
      )}
      {visibleFor('super_admin', 'admin', 'coordinador', 'contabilidad', 'tecnico') && accesoServicios && (
        <Link to="/mantenimientos" icon={ICONS.bolt} label="Mantenimientos" onClose={onClose} />
      )}
      {visibleFor('super_admin', 'admin', 'coordinador') && accesoServicios && (
        <Link to="/atenciones-rapidas" icon={ICONS.doc} label="Atención rápida" onClose={onClose} />
      )}
      {visibleFor('super_admin', 'admin', 'coordinador') && (
        <Link to="/leads" icon={ICONS.briefcase} label="Leads" onClose={onClose} />
      )}

      <Section label="Cierre y cobro" />
      <Link to="/servicios-realizados" icon={ICONS.check} label="Servicios realizados" onClose={onClose} />
      {visibleFor('super_admin', 'admin', 'coordinador', 'contabilidad') && (
        <Link to="/entregas" icon={ICONS.doc} label="Entregas" onClose={onClose} />
      )}
      {visibleFor('super_admin', 'admin', 'contabilidad') && (
        <Link to="/contabilidad" icon={ICONS.money} label="Contabilidad" onClose={onClose} />
      )}
      {visibleFor('super_admin', 'admin', 'contabilidad') && (
        <Link to="/cobros" icon={ICONS.money} label="Gestión de cobros" onClose={onClose} />
      )}
      {visibleFor('super_admin', 'admin', 'contabilidad') && (
        <Link to="/facturas" icon={ICONS.doc} label="Facturas" onClose={onClose} />
      )}

      {visibleFor('super_admin', 'admin', 'coordinador', 'contabilidad') && (
        <>
          <Section label="Análisis" />
          <Link to="/reportes" icon={ICONS.list} label="Reportes" onClose={onClose} />
        </>
      )}

      {visibleFor('super_admin', 'admin', 'contabilidad') && (
        <Section label="Administración" />
      )}
      {visibleFor('super_admin') && (
        <Link to="/usuarios" icon={ICONS.users} label="Usuarios" onClose={onClose} />
      )}
      {visibleFor('super_admin', 'admin', 'contabilidad') && (
        <Link to="/configuracion" icon={ICONS.cog} label="Configuración" onClose={onClose} />
      )}
      {visibleFor('super_admin', 'admin') && (
        <Link to="/auditoria" icon={ICONS.doc} label="Auditoría" onClose={onClose} />
      )}
    </nav>
  );
}

function Footer() {
  return (
    <div className="relative px-4 py-3 border-t border-carbon-100/80">
      <div className="flex items-center justify-between text-[10px] uppercase tracking-[0.18em] text-carbon-400">
        <span className="font-mono normal-case tracking-normal text-carbon-500">v1.0</span>
        <span className="flex items-center gap-1.5">
          <span className="chevs">
            <svg width="9" height="5" viewBox="0 0 9 5" fill="none"><path d="M1 4L4.5 1L8 4" stroke="#e8853a" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/></svg>
            <svg width="9" height="5" viewBox="0 0 9 5" fill="none"><path d="M1 1L4.5 4L8 1" stroke="#4d8093" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/></svg>
          </span>
          en línea
        </span>
      </div>
    </div>
  );
}

function Section({ label }) {
  return (
    <p className="flex items-center gap-2 pt-4 pb-2 px-3 text-[10px] uppercase tracking-[0.22em] font-bold text-carbon-400">
      {label}
      <span className="flex-1 h-px bg-gradient-to-r from-carbon-200 to-transparent" />
    </p>
  );
}
