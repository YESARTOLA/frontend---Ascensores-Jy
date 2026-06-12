import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { useAuth } from './features/auth/AuthContext.jsx';
import { tieneAcceso } from './features/auth/alcance.js';

function RequireRole({ allow, children }) {
  const { rol } = useAuth();
  if (!allow.includes(rol)) return <Navigate to="/" replace />;
  return children;
}

// Confina a un Administrador/Coordinador acotado a su ámbito ('servicios' |
// 'proyectos'). Los roles sin alcance siempre pasan. El backend hace el
// filtrado real; esto evita el acceso por URL a módulos fuera del ámbito.
function RequireAlcance({ ambito, children }) {
  const { user } = useAuth();
  if (!tieneAcceso(user, ambito)) return <Navigate to="/" replace />;
  return children;
}

// La Vendedora solo opera Leads y consulta el Calendario (solo lectura, para
// validar disponibilidad de técnicos). Este guard la confina a esas rutas:
// cualquier otra (incluido el Dashboard y las rutas sin RequireRole) la redirige,
// garantizando el aislamiento también por URL, no solo por menú.
const RUTAS_VENDEDORA = ['/leads', '/calendario'];
function VendedoraGate({ children }) {
  const { esVendedora } = useAuth();
  const { pathname } = useLocation();
  const permitida = RUTAS_VENDEDORA.some(p => pathname === p || pathname.startsWith(p + '/'));
  if (esVendedora && !permitida) return <Navigate to="/leads" replace />;
  return children;
}
import AppLayout from './components/layout/AppLayout.jsx';
import RequireAuth from './routes/RequireAuth.jsx';
import Logo from './components/common/Logo.jsx';
import Login from './pages/Login.jsx';
import Dashboard from './pages/Dashboard.jsx';
import Clientes from './pages/Clientes.jsx';
import Cliente360 from './pages/Cliente360.jsx';
import Ascensores from './pages/Ascensores.jsx';
import AscensorHistorial from './pages/AscensorHistorial.jsx';
import Tecnicos from './pages/Tecnicos.jsx';
import TiposServicio from './pages/TiposServicio.jsx';
import TiposAscensor from './pages/TiposAscensor.jsx';
import Servicios from './pages/Servicios.jsx';
import ServicioDetalle from './pages/ServicioDetalle.jsx';
import PanelTecnico from './pages/PanelTecnico.jsx';
import Asignaciones from './pages/Asignaciones.jsx';
import ServiciosRealizados from './pages/ServiciosRealizados.jsx';
import Cobros from './pages/Cobros.jsx';
import CobroDetalle from './pages/CobroDetalle.jsx';
import Facturas from './pages/Facturas.jsx';
import Emergencias from './pages/Emergencias.jsx';
import Correctivos from './pages/Correctivos.jsx';
import Mantenimientos from './pages/Mantenimientos.jsx';
import Leads from './pages/Leads.jsx';
import AtencionesRapidas from './pages/AtencionesRapidas.jsx';
import Calendario from './pages/Calendario.jsx';
import Recordatorios from './pages/Recordatorios.jsx';
import Contabilidad from './pages/Contabilidad.jsx';
import Reportes from './pages/Reportes.jsx';
import Usuarios from './pages/Usuarios.jsx';
import Auditoria from './pages/Auditoria.jsx';
import Entregas from './pages/Entregas.jsx';
import Cotizaciones from './pages/Cotizaciones.jsx';
import CotizacionDetalle from './pages/CotizacionDetalle.jsx';
import Configuracion from './pages/Configuracion.jsx';

export default function App() {
  const { user, loading } = useAuth();
  if (loading) {
    return (
      <div className="relative h-full grid place-items-center overflow-hidden">
        <div className="absolute inset-0 bg-ivory-50" />
        <div className="absolute inset-0 bg-mesh-warm opacity-60" />
        <div className="absolute inset-0 bg-noise opacity-30 mix-blend-multiply" />
        <div className="relative flex flex-col items-center gap-5 animate-fade-in">
          {/* logo flotante con halo */}
          <div className="relative">
            <div className="pointer-events-none absolute -inset-6 rounded-full blur-2xl"
                 style={{ background: 'radial-gradient(circle, rgba(232,133,58,0.30), transparent 70%)' }} />
            <Logo size={84} className="animate-float relative" />
          </div>
          <div className="text-center">
            <p className="font-display font-bold text-carbon-800 text-lg">Ascensores Jy</p>
            <p className="flex items-center justify-center gap-2 text-[11px] uppercase tracking-[0.25em] text-carbon-500 mt-1.5">
              <span className="chevs">
                <svg width="9" height="5" viewBox="0 0 9 5" fill="none"><path d="M1 4L4.5 1L8 4" stroke="#e8853a" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
                <svg width="9" height="5" viewBox="0 0 9 5" fill="none"><path d="M1 1L4.5 4L8 1" stroke="#4d8093" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
              </span>
              Cargando sesión…
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <Routes>
      <Route path="/login" element={user ? <Navigate to="/" replace /> : <Login />} />
      <Route element={<RequireAuth><VendedoraGate><AppLayout /></VendedoraGate></RequireAuth>}>
        <Route path="/" element={<Dashboard />} />
        <Route path="/clientes" element={<RequireRole allow={['super_admin','admin','contabilidad','coordinador']}><Clientes /></RequireRole>} />
        <Route path="/clientes/:id" element={<RequireRole allow={['super_admin','admin','contabilidad','coordinador']}><Cliente360 /></RequireRole>} />
        <Route path="/ascensores" element={<RequireRole allow={['super_admin','admin','contabilidad','coordinador']}><Ascensores /></RequireRole>} />
        <Route path="/ascensores/:id" element={<RequireRole allow={['super_admin','admin','contabilidad','coordinador']}><AscensorHistorial /></RequireRole>} />
        <Route path="/tecnicos" element={<Tecnicos />} />
        <Route path="/tipos-servicio" element={<TiposServicio />} />
        <Route path="/tipos-ascensor" element={<TiposAscensor />} />
        <Route path="/cotizaciones" element={<RequireRole allow={['super_admin','admin','contabilidad']}><Cotizaciones /></RequireRole>} />
        <Route path="/cotizaciones/:id" element={<RequireRole allow={['super_admin','admin','contabilidad']}><CotizacionDetalle /></RequireRole>} />
        <Route path="/servicios" element={<RequireRole allow={['super_admin','admin','contabilidad','tecnico','coordinador']}><RequireAlcance ambito="proyectos"><Servicios /></RequireAlcance></RequireRole>} />
        <Route path="/servicios/:id" element={<ServicioDetalle />} />
        <Route path="/panel-tecnico" element={<PanelTecnico />} />
        <Route path="/asignaciones" element={<Asignaciones />} />
        <Route path="/servicios-realizados" element={<ServiciosRealizados />} />
        <Route path="/entregas" element={<Entregas />} />
        <Route path="/cobros" element={<Cobros />} />
        <Route path="/cobros/:id" element={<CobroDetalle />} />
        <Route path="/facturas" element={<Facturas />} />
        <Route path="/emergencias" element={<RequireAlcance ambito="servicios"><Emergencias /></RequireAlcance>} />
        <Route path="/correctivos" element={<RequireAlcance ambito="servicios"><Correctivos /></RequireAlcance>} />
        <Route path="/mantenimientos" element={<RequireAlcance ambito="servicios"><Mantenimientos /></RequireAlcance>} />
        <Route path="/leads" element={<RequireRole allow={['super_admin','admin','vendedora','coordinador']}><Leads /></RequireRole>} />
        <Route path="/atenciones-rapidas" element={<RequireAlcance ambito="servicios"><AtencionesRapidas /></RequireAlcance>} />
        <Route path="/calendario" element={<Calendario />} />
        <Route path="/recordatorios" element={<Recordatorios />} />
        <Route path="/contabilidad" element={<Contabilidad />} />
        <Route path="/reportes" element={<RequireRole allow={['super_admin','admin','coordinador','contabilidad']}><Reportes /></RequireRole>} />
        <Route path="/usuarios" element={<Usuarios />} />
        <Route path="/configuracion" element={<RequireRole allow={['super_admin','admin','contabilidad']}><Configuracion /></RequireRole>} />
        <Route path="/auditoria" element={<Auditoria />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
