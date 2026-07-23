import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../features/auth/AuthContext.jsx';
import Modal from '../common/Modal.jsx';
import { useToast } from '../common/Toast.jsx';
import { authService, recordatoriosService } from '../../services';
import { formatFechaHora } from '../../utils/formatters.js';

function destinoRecordatorio(r) {
  if (r.servicio?.id) return `/servicios/${r.servicio.id}`;
  if (r.cobro?.id) return `/cobros/${r.cobro.id}`;
  if (r.emergencia) return '/emergencias';
  if (r.mantenimiento_plan) return '/mantenimientos';
  return '/recordatorios';
}

const ROL_LABEL = {
  super_admin: 'Super Admin',
  admin: 'Administrador',
  coordinador: 'Coordinador',
  tecnico: 'Técnico',
  contabilidad: 'Contabilidad'
};

const ROL_TINT = {
  super_admin:  'from-brand-500 to-brand-700',
  admin:        'from-brand-400 to-brand-600',
  coordinador:  'from-ember-400 to-ember-600',
  tecnico:      'from-violet-400 to-violet-600',
  contabilidad: 'from-emerald-400 to-emerald-600'
};

export default function Topbar({ onMenu }) {
  const { user, logout } = useAuth();
  const [open, setOpen] = useState(false);
  const [openPwd, setOpenPwd] = useState(false);
  const [openBell, setOpenBell] = useState(false);
  const [pwd, setPwd] = useState({ actual: '', nueva: '', confirmar: '' });
  const [contRec, setContRec] = useState({ pendientes: 0, vencidos: 0, hoy: 0, proximos7: 0, no_leidos: 0 });
  const [proxRec, setProxRec] = useState([]);
  const toast = useToast();
  const alertaIdsVistosRef = useRef(null); // Set<number> con ids de alertas observación ya notificadas

  const recargarContadores = () => {
    recordatoriosService.contadores().then(setContRec).catch(() => {});
  };

  useEffect(() => {
    let cancel = false;
    const cargar = () => {
      recordatoriosService.contadores().then(r => { if (!cancel) setContRec(r); }).catch(() => {});
    };
    cargar();
    const id = setInterval(cargar, 60000);
    return () => { cancel = true; clearInterval(id); };
  }, []);

  // Popup: detecta alertas de observación técnica nuevas (no leídas) y dispara un
  // toast persistente. `proximos` ya viene filtrado por la matriz de visibilidad,
  // así que cada rol recibe solo lo suyo: administración/vendedora/coordinador ven
  // 'observacion_alerta' (con detalle) y contabilidad ve 'observacion_facturar'
  // (solo aviso, su descripción no incluye el comentario). Se inicializa con las
  // alertas ya pendientes para no spamear al primer login.
  useEffect(() => {
    let cancel = false;
    const revisar = async () => {
      try {
        const lista = await recordatoriosService.proximos(20);
        if (cancel) return;
        const alertas = (lista || []).filter(r =>
          ['observacion_alerta', 'observacion_facturar'].includes(r.tipo) && !r.fecha_lectura && r.estado_recordatorio === 'pendiente'
        );
        if (alertaIdsVistosRef.current === null) {
          // Primera carga: registrar lo existente sin notificar.
          alertaIdsVistosRef.current = new Set(alertas.map(a => a.id));
          return;
        }
        const nuevas = alertas.filter(a => !alertaIdsVistosRef.current.has(a.id));
        nuevas.forEach(a => {
          alertaIdsVistosRef.current.add(a.id);
          const detalle = a.descripcion ? ` — ${a.descripcion}` : '';
          toast.error(`🔔 ${a.titulo}${detalle}`);
        });
      } catch { /* silencio */ }
    };
    revisar();
    const id = setInterval(revisar, 60000);
    return () => { cancel = true; clearInterval(id); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (openBell) {
      recordatoriosService.proximos(8).then(setProxRec).catch(() => setProxRec([]));
    }
  }, [openBell]);

  const handleClickNotificacion = (r) => {
    setOpenBell(false);
    if (!r.fecha_lectura) {
      // optimista: marcar leído en UI inmediato + petición fire-and-forget
      setProxRec(prev => prev.map(x => x.id === r.id ? { ...x, fecha_lectura: new Date().toISOString() } : x));
      setContRec(c => ({ ...c, no_leidos: Math.max(0, (c.no_leidos || 0) - 1) }));
      recordatoriosService.leer(r.id).then(recargarContadores).catch(() => recargarContadores());
    }
  };

  const handleLeerTodos = async () => {
    try {
      await recordatoriosService.leerTodos();
      setProxRec(prev => prev.map(x => x.fecha_lectura ? x : { ...x, fecha_lectura: new Date().toISOString() }));
      recargarContadores();
    } catch { recargarContadores(); }
  };
  const initials = (user?.nombres || '?').split(' ').map(p => p[0]).slice(0, 2).join('').toUpperCase();
  const tint = ROL_TINT[user?.rol_codigo] || 'from-brand-400 to-brand-600';

  const cambiarPwd = async () => {
    if (pwd.nueva !== pwd.confirmar) return toast.error('Las contraseñas no coinciden');
    if (pwd.nueva.length < 6) return toast.error('La nueva contraseña debe tener al menos 6 caracteres');
    try {
      await authService.cambiarContrasena(pwd.actual, pwd.nueva);
      toast.success('Contraseña actualizada');
      setOpenPwd(false);
      setPwd({ actual: '', nueva: '', confirmar: '' });
    } catch (err) {
      toast.error(err.response?.data?.error || 'Error');
    }
  };

  const now = new Intl.DateTimeFormat('es-PE', { timeZone: 'America/Lima', weekday: 'long', day: '2-digit', month: 'short' }).format(new Date());

  return (
    <header className="sticky top-0 z-20 bg-ivory-50/85 backdrop-blur-xl border-b border-carbon-100/80">
      {/* hairline arriba */}
      <div className="absolute top-0 left-0 right-0 h-px hairline-top" />

      <div className="px-4 sm:px-6 lg:px-8 h-14 flex items-center gap-3">
        <button onClick={onMenu}
                className="lg:hidden -ml-2 grid place-items-center h-9 w-9 rounded-lg ring-1 ring-carbon-200 bg-white/70 hover:bg-white text-carbon-700"
                aria-label="Abrir menú">
          <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="3" y1="6" x2="17" y2="6"/><line x1="3" y1="11" x2="17" y2="11"/><line x1="3" y1="16" x2="17" y2="16"/></svg>
        </button>

        {/* fecha contextual */}
        <div className="hidden sm:flex items-center gap-2 text-[12px] text-carbon-500">
          <span className="chevs">
            <svg width="9" height="5" viewBox="0 0 9 5" fill="none"><path d="M1 4L4.5 1L8 4" stroke="#e8853a" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/></svg>
            <svg width="9" height="5" viewBox="0 0 9 5" fill="none"><path d="M1 1L4.5 4L8 1" stroke="#4d8093" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/></svg>
          </span>
          <span className="capitalize font-medium text-carbon-700">{now}</span>
          <span className="text-carbon-300">·</span>
          <span className="font-mono">Lima · Perú</span>
        </div>

        <div className="flex-1" />

        {/* badge SLA decorativo */}
        <div className="hidden md:inline-flex items-center gap-2 rounded-full bg-emerald-50/70 ring-1 ring-emerald-200/70 px-2.5 py-1 text-[10.5px] font-bold uppercase tracking-wider text-emerald-700">
          <span className="relative grid place-items-center h-1.5 w-1.5">
            <span className="absolute inset-0 rounded-full bg-emerald-400 animate-pulse-ring" />
            <span className="relative h-1.5 w-1.5 rounded-full bg-emerald-500" />
          </span>
          Sistema operativo
        </div>

        {/* campana recordatorios */}
        <div className="relative">
          <button onClick={() => setOpenBell(o => !o)}
                  aria-label="Recordatorios"
                  className="relative grid place-items-center h-9 w-9 rounded-lg ring-1 ring-carbon-200 bg-white/70 hover:bg-white text-carbon-700 transition">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/>
              <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/>
            </svg>
            {contRec.no_leidos > 0 && (
              <span className={`absolute -top-1 -right-1 min-w-[18px] h-[18px] rounded-full px-1 text-[10px] font-bold grid place-items-center text-white ${contRec.vencidos > 0 ? 'bg-rose-600' : 'bg-brand-600'}`}>
                {contRec.no_leidos > 99 ? '99+' : contRec.no_leidos}
              </span>
            )}
          </button>
          {openBell && (
            <div className="absolute right-0 mt-2 w-80 rounded-xl bg-white shadow-panel ring-1 ring-carbon-100 z-30 origin-top-right animate-rise-sm overflow-hidden">
              <div className="px-4 py-3 border-b border-carbon-100/80 flex items-center justify-between">
                <div>
                  <div className="text-[13px] font-semibold text-carbon-900">
                    Recordatorios
                    {contRec.no_leidos > 0 && <span className="ml-2 text-[10px] font-bold text-brand-700">{contRec.no_leidos} sin leer</span>}
                  </div>
                  <div className="text-[11px] text-carbon-500">
                    {contRec.vencidos > 0 && <span className="text-rose-700 font-medium">{contRec.vencidos} vencidos · </span>}
                    {contRec.hoy} hoy · {contRec.proximos7} esta semana
                  </div>
                </div>
                <div className="flex flex-col items-end gap-0.5">
                  <Link to="/recordatorios" onClick={() => setOpenBell(false)} className="text-[11px] text-brand-700 hover:underline">Ver todos</Link>
                  {contRec.no_leidos > 0 && (
                    <button onClick={handleLeerTodos} className="text-[10px] text-carbon-500 hover:text-brand-700 hover:underline">Marcar todos leídos</button>
                  )}
                </div>
              </div>
              <div className="max-h-96 overflow-y-auto">
                {proxRec.length === 0 ? (
                  <div className="px-4 py-6 text-center text-xs text-carbon-500">Sin recordatorios pendientes</div>
                ) : (
                  <ul className="divide-y divide-carbon-100">
                    {proxRec.map(r => {
                      const fStr = new Date(r.fecha_recordatorio).toLocaleDateString('en-CA', { timeZone: 'America/Lima' });
                      const hoyStr = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Lima' });
                      const vencido = fStr < hoyStr;
                      const destino = destinoRecordatorio(r);
                      const noLeido = !r.fecha_lectura;
                      return (
                        <li key={r.id} className={noLeido ? 'bg-brand-50/30' : ''}>
                          <Link to={destino}
                                onClick={() => handleClickNotificacion(r)}
                                className="block px-4 py-2.5 hover:bg-brand-50/80 active:bg-brand-100/60 transition cursor-pointer focus:outline-none focus:bg-brand-50/80">
                            <div className="flex items-start gap-2">
                              {noLeido
                                ? <span className="h-2 w-2 mt-1.5 rounded-full shrink-0 ring-2 ring-brand-300/50" style={{ background: r.color || '#8b5cf6' }} />
                                : <span className="h-2 w-2 mt-1.5 rounded-full shrink-0 opacity-50" style={{ background: r.color || '#8b5cf6' }} />}
                              <div className="flex-1 min-w-0">
                                <div className={`text-[12.5px] truncate ${noLeido ? 'font-semibold text-carbon-900' : 'font-normal text-carbon-600'}`}>{r.titulo}</div>
                                <div className={`text-[10.5px] ${vencido ? (noLeido ? 'text-rose-700 font-medium' : 'text-rose-500') : (noLeido ? 'text-carbon-500' : 'text-carbon-400')}`}>
                                  {formatFechaHora(r.fecha_recordatorio)} · {r.tipo}
                                </div>
                              </div>
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-carbon-300 shrink-0 mt-0.5">
                                <polyline points="9 18 15 12 9 6"/>
                              </svg>
                            </div>
                          </Link>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            </div>
          )}
        </div>

        {/* menú usuario */}
        <div className="relative">
          <button onClick={() => setOpen(o => !o)}
                  className="group flex items-center gap-2.5 rounded-full pl-1 pr-3 py-1 bg-white/70 ring-1 ring-carbon-200 hover:ring-brand-300 hover:bg-white transition shadow-card">
            <span className={`relative h-8 w-8 rounded-full bg-gradient-to-br ${tint} grid place-items-center text-white text-[12px] font-bold shadow-inset`}>
              {initials}
            </span>
            <span className="hidden sm:flex flex-col text-left leading-tight">
              <span className="text-[12.5px] font-semibold text-carbon-900">{user?.nombres}</span>
              <span className="text-[10px] uppercase tracking-wider text-carbon-500">{ROL_LABEL[user?.rol_codigo] || user?.rol}</span>
            </span>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
                 className={`text-carbon-400 transition-transform ${open ? 'rotate-180' : ''}`}>
              <polyline points="6 9 12 15 18 9"/>
            </svg>
          </button>

          {open && (
            <div className="absolute right-0 mt-2 w-64 rounded-xl bg-white shadow-panel ring-1 ring-carbon-100 py-1.5 z-30 origin-top-right animate-rise-sm overflow-hidden">
              <div className="px-4 py-3 border-b border-carbon-100/80 relative">
                <div className="absolute inset-0 bg-mesh-warm opacity-30 pointer-events-none" />
                <div className="relative flex items-center gap-3">
                  <span className={`h-10 w-10 rounded-xl bg-gradient-to-br ${tint} grid place-items-center text-white text-sm font-bold shadow-card`}>
                    {initials}
                  </span>
                  <div className="min-w-0">
                    <div className="text-[13px] font-semibold text-carbon-900 truncate">{user?.nombres}</div>
                    <div className="text-[11px] text-carbon-500 truncate">{user?.correo}</div>
                  </div>
                </div>
              </div>
              <button onClick={() => { setOpen(false); setOpenPwd(true); }}
                      className="w-full text-left px-4 py-2.5 text-[13px] text-carbon-700 hover:bg-ember-50/60 hover:text-ember-700 flex items-center gap-2.5 transition">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
                Cambiar contraseña
              </button>
              <button onClick={() => { setOpen(false); logout(); }}
                      className="w-full text-left px-4 py-2.5 text-[13px] text-rose-700 hover:bg-rose-50 flex items-center gap-2.5 transition">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
                Cerrar sesión
              </button>
            </div>
          )}
        </div>
      </div>

      <Modal open={openPwd} onClose={() => setOpenPwd(false)} title="Cambiar contraseña"
        footer={<><button className="btn-secondary" onClick={() => setOpenPwd(false)}>Cancelar</button><button className="btn-primary" onClick={cambiarPwd}>Guardar</button></>}>
        <form onSubmit={(e) => { e.preventDefault(); cambiarPwd(); }} className="space-y-4">
          <div><label className="label">Contraseña actual</label><input type="password" className="input" value={pwd.actual} onChange={e => setPwd(p => ({ ...p, actual: e.target.value }))} /></div>
          <div><label className="label">Nueva contraseña</label><input type="password" className="input" value={pwd.nueva} onChange={e => setPwd(p => ({ ...p, nueva: e.target.value }))} /></div>
          <div><label className="label">Confirmar nueva contraseña</label><input type="password" className="input" value={pwd.confirmar} onChange={e => setPwd(p => ({ ...p, confirmar: e.target.value }))} /></div>
        </form>
      </Modal>
    </header>
  );
}
