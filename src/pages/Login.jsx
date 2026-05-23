import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../features/auth/AuthContext.jsx';
import { useToast } from '../components/common/Toast.jsx';
import Logo from '../components/common/Logo.jsx';

const DEMO = [
  { correo: 'superadmin@ascensoresjy.com', rol: 'Super Admin', tint: 'from-brand-500 to-brand-700' },
  { correo: 'admin@ascensoresjy.com',      rol: 'Administrador', tint: 'from-brand-400 to-brand-600' },
  { correo: 'coordinador@ascensoresjy.com',rol: 'Coordinador',   tint: 'from-ember-400 to-ember-600' },
  { correo: 'contabilidad@ascensoresjy.com',rol: 'Contabilidad', tint: 'from-emerald-400 to-emerald-600' },
  { correo: 'carlos@ascensoresjy.com',     rol: 'Técnico',       tint: 'from-violet-400 to-violet-600' }
];

function LogoMark({ size = 184 }) {
  return (
    <div className="relative">
      {/* halo cromático suave (ámbar + teal) detrás del logo, escalado al doble */}
      <div
        className="pointer-events-none absolute -inset-10 rounded-[2.5rem] blur-2xl opacity-80"
        aria-hidden="true"
        style={{
          background:
            'radial-gradient(60% 60% at 30% 35%, rgba(232,133,58,0.55), transparent 70%),' +
            'radial-gradient(55% 55% at 75% 70%, rgba(77,128,147,0.45), transparent 70%)'
        }}
      />
      {/* logo + shine sweep encapsulado por overflow-hidden */}
      <div className="relative">
        <Logo size={size} className="shadow-lifted ring-ember-200/80" />
        <div
          className="pointer-events-none absolute inset-0 overflow-hidden"
          style={{ borderRadius: '0.65rem' }}
          aria-hidden="true"
        >
          <span
            className="absolute -inset-y-4 -inset-x-12 animate-shine"
            style={{
              background:
                'linear-gradient(105deg, transparent 38%, rgba(255,255,255,0.65) 50%, transparent 62%)'
            }}
          />
        </div>
      </div>
    </div>
  );
}

function ElevatorScene() {
  // Escena animada: shaft con cabina que sube/baja entre 3 niveles (versión luminosa)
  return (
    <div className="relative w-[260px] h-[340px] mx-auto select-none">
      {/* Glow detrás */}
      <div className="absolute inset-0 blur-3xl opacity-70"
           style={{ background: 'radial-gradient(circle at 50% 50%, rgba(232,133,58,0.40), transparent 60%)' }} />

      {/* Edificio: cristal blanco semitranslúcido */}
      <div className="relative h-full w-full rounded-[28px] overflow-hidden ring-1 ring-carbon-200/70 shadow-panel"
           style={{
             background: 'linear-gradient(180deg, rgba(255,255,255,0.85), rgba(253,250,245,0.75))',
             backdropFilter: 'blur(8px)'
           }}>
        {/* Líneas de pisos */}
        {[20, 50, 80].map((pct) => (
          <div key={pct} className="absolute left-0 right-0 h-px"
               style={{ top: `${pct}%`, background: 'linear-gradient(90deg, transparent, rgba(77,128,147,0.35), transparent)' }} />
        ))}

        {/* Etiquetas de piso */}
        {[
          { p: '20%', l: '3F' },
          { p: '50%', l: '2F' },
          { p: '80%', l: '1F' }
        ].map(f => (
          <div key={f.l} className="absolute right-3 -translate-y-1/2 text-[10px] font-mono font-bold tracking-wider text-brand-700"
               style={{ top: f.p }}>{f.l}</div>
        ))}

        {/* Rieles laterales */}
        <div className="absolute top-4 bottom-4 left-[44px] w-px bg-brand-200/70" />
        <div className="absolute top-4 bottom-4 right-[44px] w-px bg-brand-200/70" />

        {/* Shaft / cabina */}
        <div className="absolute left-1/2 -translate-x-1/2 top-1/2 -translate-y-1/2">
          <div className="relative">
            {/* haz de luz arriba */}
            <div className="absolute left-1/2 -translate-x-1/2 -top-44 w-[2px] h-44"
                 style={{ background: 'linear-gradient(180deg, transparent, rgba(232,133,58,0.85))' }} />

            {/* cabina */}
            <div
              className="relative h-24 w-32 rounded-xl shadow-ember ring-1 ring-ember-400/60 overflow-hidden"
              style={{
                background: 'linear-gradient(180deg, #ffffff 0%, #fae8cd 45%, #e8853a 100%)',
                animation: 'elev-up 5.6s ease-in-out infinite'
              }}>
              {/* puerta vertical */}
              <div className="absolute inset-y-1 left-1/2 w-px bg-carbon-700/40" />
              {/* indicador */}
              <div className="absolute top-1.5 left-1/2 -translate-x-1/2 flex items-center gap-1">
                <span className="block h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                <span className="font-mono text-[9px] font-bold text-carbon-800">JY</span>
              </div>
              {/* chevrons interno */}
              <div className="absolute bottom-2 left-1/2 -translate-x-1/2 chevs">
                <svg width="10" height="6" viewBox="0 0 10 6" fill="none"><path d="M1 5L5 1L9 5" stroke="#283e49" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
                <svg width="10" height="6" viewBox="0 0 10 6" fill="none"><path d="M1 1L5 5L9 1" stroke="#283e49" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
              </div>
            </div>
          </div>
        </div>

        {/* puntos flotantes */}
        {Array.from({ length: 12 }).map((_, i) => (
          <span key={i}
                className="absolute h-1 w-1 rounded-full bg-brand-400/40 animate-float"
                style={{
                  left: `${(i * 37) % 100}%`,
                  top: `${(i * 53) % 100}%`,
                  animationDelay: `${i * 0.35}s`,
                  animationDuration: `${5 + (i % 4)}s`
                }} />
        ))}
      </div>
    </div>
  );
}

export default function Login() {
  const [form, setForm] = useState({ correo: '', contrasena: '' });
  const [loading, setLoading] = useState(false);
  const [showPwd, setShowPwd] = useState(false);
  const { login } = useAuth();
  const nav = useNavigate();
  const toast = useToast();

  const submit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      await login(form.correo, form.contrasena);
      toast.success('Bienvenido(a)');
      nav('/');
    } catch (err) {
      toast.error(err.response?.data?.error || 'Error al iniciar sesión');
    } finally { setLoading(false); }
  };

  const fillDemo = (correo) => setForm({ correo, contrasena: 'admin123' });

  return (
    <div className="min-h-full grid lg:grid-cols-[1.05fr_1fr]">

      {/* ====== HERO IZQUIERDA ====== */}
      <div className="relative hidden lg:flex overflow-hidden">
        {/* fondo: marfil cálido con mesh teal+ámbar (luminoso, sin negro) */}
        <div className="absolute inset-0"
             style={{
               background:
                 'linear-gradient(150deg, #fdfaf5 0%, #f9f3e8 30%, #fae8cd 60%, #f1e5cd 100%)'
             }} />
        {/* mesh principal */}
        <div className="absolute inset-0"
             style={{
               background:
                 'radial-gradient(at 18% 22%, rgba(77,128,147,0.42) 0px, transparent 55%),' +
                 'radial-gradient(at 82% 8%, rgba(232,133,58,0.42) 0px, transparent 50%),' +
                 'radial-gradient(at 76% 92%, rgba(77,128,147,0.30) 0px, transparent 55%),' +
                 'radial-gradient(at 6% 90%, rgba(232,133,58,0.32) 0px, transparent 50%)'
             }} />
        <div className="absolute inset-0 bg-grid-soft bg-grid-32 opacity-[0.10]" />
        <div className="absolute inset-0 bg-noise opacity-25 mix-blend-multiply" />

        {/* halo ámbar grande superior */}
        <div className="absolute -top-32 -right-32 h-[28rem] w-[28rem] rounded-full"
             style={{ background: 'radial-gradient(circle, rgba(232,133,58,0.55), transparent 60%)' }} />
        {/* halo teal inferior */}
        <div className="absolute -bottom-40 -left-20 h-[30rem] w-[30rem] rounded-full"
             style={{ background: 'radial-gradient(circle, rgba(77,128,147,0.45), transparent 60%)' }} />

        {/* contenido */}
        <div className="relative z-10 flex flex-col justify-between w-full p-12 xl:p-16 text-carbon-900">
          {/* header: logo + texto apilados, centrados horizontalmente */}
          <div className="flex flex-col items-center text-center gap-4 animate-rise">
            <LogoMark />
            <div className="leading-tight">
              <div className="font-display text-[1.85rem] xl:text-[2.05rem] font-bold tracking-tight text-carbon-900">Ascensores Jy</div>
              <div className="text-[11px] uppercase tracking-[0.32em] text-carbon-500 mt-1.5">S.A.C · ERP Operativo</div>
            </div>
          </div>

          {/* centro: escena + headline */}
          <div className="grid grid-cols-[auto_1fr] items-center gap-10 -mt-4">
            <ElevatorScene />

            <div className="max-w-md animate-rise" style={{ animationDelay: '.12s' }}>
              <span className="inline-flex items-center gap-2 rounded-full bg-white/80 ring-1 ring-ember-200 px-3 py-1 text-[10px] uppercase tracking-[0.22em] font-bold text-ember-700 shadow-card">
                <span className="h-1.5 w-1.5 rounded-full bg-ember-500 animate-pulse" />
                Operación en tiempo real
              </span>
              <h1 className="mt-5 font-display text-[2.6rem] xl:text-[3rem] leading-[1.02] font-bold text-balance text-carbon-900">
                El sistema que <span className="italic text-gradient">eleva</span> cada servicio.
              </h1>
              <p className="mt-4 text-[15px] text-carbon-600 leading-relaxed text-pretty">
                Clientes, ascensores, técnicos, checklist, evidencias, cobros y facturación
                trabajando juntos —de la cotización al cierre— en una sola plataforma.
              </p>
            </div>
          </div>

          {/* bullets + pie */}
          <div className="space-y-6">
            <ul className="grid grid-cols-2 gap-3 max-w-2xl">
              {[
                ['🛠', 'Multi técnico con responsable documental'],
                ['📋', 'Checklist de salida obligatorio'],
                ['💸', 'Cobros con mora + recordatorio WhatsApp'],
                ['🏢', 'Historial 360 por cliente y ascensor']
              ].map(([ico, txt], i) => (
                <li key={txt}
                    className="group flex items-start gap-3 rounded-xl bg-white/75 ring-1 ring-carbon-200/70 backdrop-blur-sm px-3 py-2.5 shadow-card hover:shadow-lifted hover:-translate-y-0.5 transition animate-rise-sm"
                    style={{ animationDelay: `${.25 + i * .07}s` }}>
                  <span className="grid place-items-center h-7 w-7 rounded-lg bg-ember-100 ring-1 ring-ember-300/60 text-sm shrink-0">{ico}</span>
                  <span className="text-[13px] text-carbon-700 font-medium leading-tight">{txt}</span>
                </li>
              ))}
            </ul>

            <div className="flex items-center justify-between text-[11px] text-carbon-500">
              <span>© Ascensores Jy · {new Date().getFullYear()}</span>
              <span className="flex items-center gap-2">
                <span className="font-mono font-semibold text-carbon-700">SLA 99.9%</span>
                <span className="h-1 w-1 rounded-full bg-carbon-300" />
                <span>Lima · Perú</span>
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* ====== FORMULARIO DERECHA ====== */}
      <div className="relative flex items-center justify-center p-6 sm:p-10 bg-ivory-50">
        {/* decoración fondo derecha */}
        <div className="pointer-events-none absolute inset-0 bg-grid-soft bg-grid-24 opacity-[0.06]" />
        <div className="pointer-events-none absolute -top-24 -right-24 h-80 w-80 rounded-full"
             style={{ background: 'radial-gradient(circle, rgba(232,133,58,0.18), transparent 70%)' }} />
        <div className="pointer-events-none absolute -bottom-32 -left-24 h-80 w-80 rounded-full"
             style={{ background: 'radial-gradient(circle, rgba(77,128,147,0.18), transparent 70%)' }} />

        <div className="relative w-full max-w-md animate-rise">
          {/* logo móvil: logo arriba, texto debajo, centrado */}
          <div className="mb-8 lg:hidden flex flex-col items-center text-center gap-5">
            <div className="relative">
              <div className="pointer-events-none absolute -inset-8 rounded-[2rem] blur-2xl opacity-80"
                   style={{ background: 'radial-gradient(60% 60% at 35% 35%, rgba(232,133,58,0.55), transparent 70%), radial-gradient(55% 55% at 75% 70%, rgba(77,128,147,0.45), transparent 70%)' }} />
              <Logo size={152} className="relative shadow-lifted ring-ember-200/80" />
            </div>
            <div>
              <div className="font-display text-[1.35rem] font-bold tracking-tight text-carbon-900">Ascensores Jy</div>
              <div className="text-[10.5px] uppercase tracking-[0.3em] text-carbon-500 mt-1">S.A.C · ERP Operativo</div>
            </div>
          </div>

          <p className="inline-flex items-center gap-2 text-[10px] uppercase tracking-[0.25em] font-bold text-ember-700">
            <span className="h-px w-6 bg-ember-500" /> Bienvenido de vuelta
          </p>
          <h2 className="mt-2 font-display text-3xl sm:text-[2.2rem] font-bold tracking-tight text-carbon-900">
            Inicia sesión
          </h2>
          <p className="text-[14px] text-carbon-500 mt-1">Usa tu correo corporativo para continuar.</p>

          <form onSubmit={submit} className="mt-7 space-y-4">
            <div>
              <label className="label">Correo electrónico</label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-carbon-400">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/></svg>
                </span>
                <input
                  type="email" autoComplete="username" required value={form.correo}
                  onChange={e => setForm(f => ({ ...f, correo: e.target.value }))}
                  className="input pl-9" placeholder="usuario@ascensoresjy.com" />
              </div>
            </div>
            <div>
              <label className="label">Contraseña</label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-carbon-400">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
                </span>
                <input
                  type={showPwd ? 'text' : 'password'} autoComplete="current-password" required value={form.contrasena}
                  onChange={e => setForm(f => ({ ...f, contrasena: e.target.value }))}
                  className="input pl-9 pr-12" placeholder="••••••••" />
                <button type="button" onClick={() => setShowPwd(s => !s)}
                        className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] font-bold uppercase tracking-wider text-brand-700 hover:text-brand-900 px-2 py-1 rounded-md hover:bg-brand-50">
                  {showPwd ? 'Ocultar' : 'Ver'}
                </button>
              </div>
            </div>

            <button disabled={loading} className="btn-primary w-full py-2.5 text-[14px] group">
              {loading ? (
                <>
                  <span className="h-4 w-4 rounded-full border-2 border-white/70 border-t-transparent animate-spin" />
                  Ingresando…
                </>
              ) : (
                <>
                  Iniciar sesión
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
                       className="transition-transform group-hover:translate-x-1"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>
                </>
              )}
            </button>
          </form>

          <div className="mt-8 pt-6 border-t border-carbon-200/70">
            <p className="flex items-center justify-between text-[10px] uppercase tracking-[0.2em] font-bold text-carbon-500 mb-3">
              <span>Usuarios demo</span>
              <span className="font-mono normal-case tracking-normal text-carbon-400">contraseña <span className="px-1.5 py-0.5 rounded bg-carbon-100 text-carbon-700">admin123</span></span>
            </p>
            <div className="grid gap-1.5">
              {DEMO.map((u, i) => (
                <button key={u.correo} type="button" onClick={() => fillDemo(u.correo)}
                        className="group text-left flex items-center gap-3 px-3 py-2 rounded-xl ring-1 ring-carbon-200/70 bg-white/70 hover:bg-white hover:ring-ember-300 hover:shadow-card transition animate-rise-sm"
                        style={{ animationDelay: `${.2 + i * .04}s` }}>
                  <span className={`h-7 w-7 shrink-0 rounded-lg bg-gradient-to-br ${u.tint} grid place-items-center text-white text-[10px] font-bold`}>
                    {u.rol.split(' ').map(w => w[0]).slice(0,2).join('')}
                  </span>
                  <span className="flex-1 min-w-0">
                    <span className="block font-mono text-[12px] text-carbon-800 truncate">{u.correo}</span>
                    <span className="block text-[11px] text-carbon-500">{u.rol}</span>
                  </span>
                  <span className="text-[10px] uppercase tracking-wider text-brand-700 opacity-0 group-hover:opacity-100 transition">Usar →</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
