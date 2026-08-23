import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../features/auth/AuthContext.jsx';
import { dashboardService, recordatoriosService } from '../services';
import Loader from '../components/common/Loader.jsx';
import PageHeader from '../components/common/PageHeader.jsx';
import { formatMonto, badgeEstado, formatFechaHora } from '../utils/formatters.js';
import { destinoRecordatorio } from '../utils/destinoRecordatorio.js';

/* =========================================================
   Estilos de KPI por "tono". Cada uno con su gradiente de
   fondo, color de icono, halo decorativo y barrita inferior.
   ========================================================= */
const TONES = {
  brand:  { ring: 'ring-brand-200/60',   icon: 'text-white bg-gradient-to-br from-brand-500 to-brand-700',
            bar: 'from-brand-300 to-brand-600',  halo: 'rgba(77,128,147,0.18)' },
  ember:  { ring: 'ring-ember-200/60',   icon: 'text-white bg-gradient-to-br from-ember-400 to-ember-700',
            bar: 'from-ember-300 to-ember-600',  halo: 'rgba(232,133,58,0.22)' },
  green:  { ring: 'ring-emerald-200/60', icon: 'text-white bg-gradient-to-br from-emerald-400 to-emerald-600',
            bar: 'from-emerald-300 to-emerald-600', halo: 'rgba(16,185,129,0.16)' },
  red:    { ring: 'ring-rose-200/60',    icon: 'text-white bg-gradient-to-br from-rose-400 to-rose-600',
            bar: 'from-rose-300 to-rose-600',   halo: 'rgba(225,29,72,0.16)' },
  amber:  { ring: 'ring-ember-200/60',   icon: 'text-white bg-gradient-to-br from-amber-400 to-amber-600',
            bar: 'from-amber-300 to-amber-600', halo: 'rgba(245,158,11,0.16)' },
  violet: { ring: 'ring-violet-200/60',  icon: 'text-white bg-gradient-to-br from-violet-400 to-violet-600',
            bar: 'from-violet-300 to-violet-600', halo: 'rgba(139,92,246,0.16)' },
  slate:  { ring: 'ring-carbon-200/60',  icon: 'text-white bg-gradient-to-br from-carbon-500 to-carbon-700',
            bar: 'from-carbon-300 to-carbon-500', halo: 'rgba(86,79,63,0.14)' }
};

function Sparkline({ tone = 'brand' }) {
  // sparkline decorativo determinístico
  const path = 'M0 18 L8 14 L16 16 L24 10 L32 12 L40 6 L48 9 L56 4';
  const stroke = tone === 'ember' ? '#e8853a'
    : tone === 'green' ? '#10b981'
    : tone === 'red' ? '#e11d48'
    : tone === 'violet' ? '#8b5cf6'
    : tone === 'amber' ? '#f59e0b'
    : tone === 'slate' ? '#928773'
    : '#4d8093';
  return (
    <svg width="56" height="24" viewBox="0 0 56 24" fill="none" className="opacity-70">
      <path d={path} stroke={stroke} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
      <circle cx="56" cy="4" r="2" fill={stroke}/>
    </svg>
  );
}

function KpiCard({ label, value, tone = 'brand', sub, icon, delay = 0, href }) {
  const t = TONES[tone] || TONES.brand;
  const Wrap = href ? Link : 'div';
  const wrapProps = href ? { to: href } : {};
  return (
    <Wrap {...wrapProps}
      className={`group relative overflow-hidden rounded-2xl bg-white/85 backdrop-blur-sm ring-1 ${t.ring}
                  shadow-card hover:shadow-lifted hover:-translate-y-0.5 transition
                  px-4 py-4 flex items-start gap-3 animate-rise-sm`}
      style={{ animationDelay: `${delay}ms` }}
    >
      {/* halo */}
      <span className="pointer-events-none absolute -top-10 -right-10 h-32 w-32 rounded-full opacity-70 group-hover:opacity-100 transition"
            style={{ background: `radial-gradient(circle, ${t.halo}, transparent 70%)` }} />
      {/* grano */}
      <span className="pointer-events-none absolute inset-0 bg-noise opacity-20 mix-blend-multiply" />

      {/* Ícono a la izquierda de todo */}
      <div className="relative shrink-0">
        <div className={`h-11 w-11 rounded-xl ${t.icon} grid place-items-center shadow-card`}>{icon}</div>
      </div>

      {/* Columna derecha: título arriba (a todo el ancho de esta zona), número + sparkline debajo */}
      <div className="relative min-w-0 flex-1 flex flex-col gap-2">
        <p className="text-[10.5px] uppercase tracking-[0.15em] font-bold text-carbon-500 leading-tight truncate">{label}</p>
        <div className="flex items-end gap-3">
          <div className="min-w-0 flex-1">
            <p className="font-display text-[1.75rem] leading-none font-bold text-carbon-900 tabular-nums">{value}</p>
            {sub && <p className="text-[11px] text-carbon-500 mt-1.5 truncate">{sub}</p>}
          </div>
          <div className="hidden sm:block shrink-0 mb-0.5">
            <Sparkline tone={tone} />
          </div>
        </div>
      </div>
      {/* barra inferior */}
      <span className={`pointer-events-none absolute left-3 right-3 bottom-0 h-0.5 rounded-full bg-gradient-to-r ${t.bar} opacity-60 group-hover:opacity-100 transition`} />
    </Wrap>
  );
}

const Icons = {
  pending: <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>,
  check:   <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>,
  alert:   <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><circle cx="12" cy="17" r="0.5"/></svg>,
  money:   <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="6" width="20" height="12" rx="2"/><circle cx="12" cy="12" r="3"/></svg>,
  users:   <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="9" cy="7" r="4"/><path d="M3 21v-2a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4v2"/></svg>,
  cal:     <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>,
  doc:     <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>,
  bolt:    <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>
};

export default function Dashboard() {
  const { user, rol, esTecnico, esContabilidad, esCoordinador } = useAuth();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [recCont, setRecCont] = useState({ pendientes: 0, vencidos: 0, hoy: 0, proximos7: 0 });
  const [recProx, setRecProx] = useState([]);

  useEffect(() => {
    dashboardService.resumen()
      .then(setData)
      .finally(() => setLoading(false));
    recordatoriosService.contadores().then(setRecCont).catch(() => {});
    recordatoriosService.proximos(5).then(setRecProx).catch(() => {});
  }, []);

  if (loading) return <Loader />;
  if (!data) return null;

  const nombreCorto = user?.nombres?.split(' ')[0] || '';
  const horaActual = new Date().getHours();
  const saludo = horaActual < 12 ? 'Buenos días' : horaActual < 19 ? 'Buenas tardes' : 'Buenas noches';

  return (
    <>
      <PageHeader
        eyebrow={`${saludo} ·  ${new Intl.DateTimeFormat('es-PE', { timeZone: 'America/Lima', weekday: 'long', day: '2-digit', month: 'long' }).format(new Date())}`}
        title={<>Hola, <span className="text-gradient">{nombreCorto}</span></>}
        subtitle="Resumen operativo en tiempo real · acceso rápido a tu agenda y métricas clave."
      />

      {(recCont.pendientes > 0 || recCont.vencidos > 0) && (
        <div className="card mb-5 relative overflow-hidden animate-rise" style={{ animationDelay: '.05s' }}>
          <div className="pointer-events-none absolute -top-12 -right-12 h-40 w-40 rounded-full"
               style={{ background: 'radial-gradient(circle, rgba(139,92,246,0.16), transparent 70%)' }} />
          <div className="card-header relative flex items-center justify-between">
            <div className="flex items-center gap-2">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-violet-600">
                <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/>
              </svg>
              <h3 className="font-semibold text-slate-800 text-sm">Recordatorios</h3>
            </div>
            <Link to="/recordatorios" className="text-xs text-brand-700 hover:underline">Ver todos →</Link>
          </div>
          <div className="p-4 grid grid-cols-2 sm:grid-cols-4 gap-3">
            <Link to="/recordatorios?estado=pendiente" className="rounded-lg bg-rose-50 border border-rose-100 p-3 hover:bg-rose-100 transition">
              <div className="text-[10px] uppercase tracking-wider text-rose-600 font-semibold">Vencidos</div>
              <div className="text-2xl font-bold text-rose-700">{recCont.vencidos}</div>
            </Link>
            <div className="rounded-lg bg-amber-50 border border-amber-100 p-3">
              <div className="text-[10px] uppercase tracking-wider text-amber-600 font-semibold">Hoy</div>
              <div className="text-2xl font-bold text-amber-700">{recCont.hoy}</div>
            </div>
            <div className="rounded-lg bg-slate-50 border border-slate-100 p-3">
              <div className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold">Próximos 7d</div>
              <div className="text-2xl font-bold text-slate-700">{recCont.proximos7}</div>
            </div>
            <div className="rounded-lg bg-brand-50 border border-brand-100 p-3">
              <div className="text-[10px] uppercase tracking-wider text-brand-700 font-semibold">Pendientes</div>
              <div className="text-2xl font-bold text-brand-800">{recCont.pendientes}</div>
            </div>
          </div>
          {recProx.length > 0 && (
            <div className="px-4 pb-4">
              <ul className="space-y-0.5">
                {recProx.map(r => {
                  const destino = destinoRecordatorio(r);
                  const noLeido = !r.fecha_lectura;
                  const onClick = () => {
                    if (!noLeido) return;
                    setRecProx(prev => prev.map(x => x.id === r.id ? { ...x, fecha_lectura: new Date().toISOString() } : x));
                    setRecCont(c => ({ ...c, no_leidos: Math.max(0, (c.no_leidos || 0) - 1) }));
                    recordatoriosService.leer(r.id).catch(() => {});
                  };
                  return (
                    <li key={r.id}>
                      <Link to={destino} onClick={onClick}
                            className={`flex items-center gap-2 text-xs px-2 py-1.5 rounded hover:bg-brand-50/60 transition group ${noLeido ? 'bg-brand-50/30' : ''}`}>
                        <span className={`h-2 w-2 rounded-full shrink-0 ${noLeido ? 'ring-2 ring-brand-300/50' : 'opacity-50'}`} style={{ background: r.color || '#8b5cf6' }} />
                        <span className={`truncate ${noLeido ? 'font-semibold text-slate-900' : 'font-normal text-slate-600'} group-hover:text-brand-700`}>{r.titulo}</span>
                        <span className="text-slate-500 ml-auto whitespace-nowrap">{formatFechaHora(r.fecha_recordatorio)}</span>
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-slate-300 group-hover:text-brand-500 shrink-0">
                          <polyline points="9 18 15 12 9 6"/>
                        </svg>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
        </div>
      )}

      {esTecnico ? (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
          <KpiCard label="Hoy"              value={data.tecnico?.misHoy || 0}              tone="brand"  icon={Icons.cal}     delay={0} href="/panel-tecnico" />
          <KpiCard label="Pendientes"       value={data.tecnico?.misPendientes || 0}       tone="amber"  icon={Icons.pending} delay={60} href="/panel-tecnico" />
          <KpiCard label="En curso"         value={data.tecnico?.misEnCurso || 0}          tone="violet" icon={Icons.check}   delay={120} href="/panel-tecnico" />
          <KpiCard label="Finalizados sem." value={data.tecnico?.misFinalizadosSemana || 0} tone="green" icon={Icons.check}   delay={180} href="/panel-tecnico" />
        </div>
      ) : esCoordinador ? (
        <>
          <div className="grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-3 sm:gap-4">
            <KpiCard label="Agenda hoy"           value={data.coordinador?.agendaHoy?.length || 0} tone="brand"  icon={Icons.cal}     delay={0}   href="/calendario" />
            <KpiCard label="Emergencias activas"  value={data.emergenciasActivas}                  tone="red"    icon={Icons.alert}   delay={60}  href="/emergencias" />
            <KpiCard label="Servicios pendientes" value={data.pendientes}                          tone="amber"  icon={Icons.pending} delay={120} href="/asignaciones" />
            <KpiCard label="Técnicos disponibles" value={data.tecnicosDisponibles}                 tone="slate"  icon={Icons.users}   delay={180} href="/tecnicos" />
            <KpiCard label="Mant. activos"        value={data.mantenimientosProximos}              tone="violet" icon={Icons.cal}     delay={240} href="/mantenimientos" />
          </div>

          <div className="card mt-5 relative overflow-hidden animate-rise" style={{ animationDelay: '.3s' }}>
            <div className="pointer-events-none absolute -top-16 -right-16 h-48 w-48 rounded-full"
                 style={{ background: 'radial-gradient(circle, rgba(232,133,58,0.10), transparent 70%)' }} />
            <div className="card-header relative">
              <h3 className="card-title flex items-center gap-2">
                <span className="chevs">
                  <svg width="9" height="5" viewBox="0 0 9 5" fill="none"><path d="M1 4L4.5 1L8 4" stroke="#e8853a" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
                  <svg width="9" height="5" viewBox="0 0 9 5" fill="none"><path d="M1 1L4.5 4L8 1" stroke="#4d8093" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
                </span>
                Agenda de hoy
              </h3>
              <Link to="/calendario" className="text-[12px] font-semibold text-brand-700 hover:text-brand-900 hover:underline">Ver calendario →</Link>
            </div>
            <div className="card-body relative">
              {!data.coordinador?.agendaHoy?.length ? (
                <p className="text-sm text-carbon-500">Sin servicios programados para hoy</p>
              ) : (
                <ul className="divide-y divide-carbon-100/80">
                  {data.coordinador.agendaHoy.map((s, i) => (
                    <li key={s.id}
                        className="py-2.5 flex items-center gap-3 text-sm hover:bg-ember-50/30 -mx-2 px-2 rounded-lg transition animate-rise-sm"
                        style={{ animationDelay: `${i * 40}ms` }}>
                      <span className="font-mono text-[11px] font-bold text-carbon-700 bg-ivory-100 ring-1 ring-carbon-200/60 rounded-md px-1.5 py-0.5 shrink-0 w-14 text-center">
                        {s.hora_programada || '—:—'}
                      </span>
                      <Link to={`/servicios/${s.id}`} className="font-mono text-[11px] text-brand-700 hover:underline shrink-0 w-32">{s.codigo}</Link>
                      <div className="flex-1 min-w-0">
                        <div className="font-semibold text-carbon-900 truncate">{s.titulo}</div>
                        <div className="text-[12px] text-carbon-500 truncate">{s.cliente} · {(s.ascensores || []).join(', ') || '—'} {s.tecnicos.length > 0 ? `· ${s.tecnicos.join(', ')}` : ''}</div>
                      </div>
                      <span className={badgeEstado(s.estado_servicio)}>{s.estado_servicio}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </>
      ) : (
        <>
          <div className="grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-3 sm:gap-4">
            <KpiCard label="Pendientes"           value={data.pendientes}          tone="amber"  icon={Icons.pending} delay={0}   href="/servicios" />
            <KpiCard label="Asignados"            value={data.asignados}           tone="brand"  icon={Icons.users}   delay={50}  href="/asignaciones" />
            <KpiCard label="En curso"             value={data.enCurso}             tone="violet" icon={Icons.check}   delay={100} href="/servicios" />
            <KpiCard label="Finalizados"          value={data.finalizados}         tone="green"  icon={Icons.check}   delay={150} href="/servicios-realizados" />
            <KpiCard label="Emergencias activas"  value={data.emergenciasActivas}  tone="red"    icon={Icons.alert}   delay={200} href="/emergencias" />
            <KpiCard label="Técnicos disponibles" value={data.tecnicosDisponibles} tone="slate"  icon={Icons.users}   delay={250} href="/tecnicos" />
          </div>
          <div className="grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-3 sm:gap-4 mt-3 sm:mt-4">
            <KpiCard label="Proyectos activos"    value={data.proyectosActivos}       tone="brand"  icon={Icons.briefcase || Icons.check} delay={290} href="/servicios" />
            <KpiCard label="Mant. activos"        value={data.mantenimientosProximos} tone="brand"  icon={Icons.cal}   delay={300} href="/mantenimientos" />
            <KpiCard label="Leads del mes"        value={data.leadsMes}               tone="violet" icon={Icons.users} delay={340} href="/leads" />
            <KpiCard label="Cobros vencidos"      value={data.cobrosVencidos}         tone="red"    icon={Icons.money} delay={380} href="/cobros" />
            <KpiCard label="En mora"              value={data.cobrosMora}             tone="red"    icon={Icons.money} delay={420} href="/cobros" />
            <KpiCard label="Pendientes de cobro"  value={data.cobrosPendientes}       tone="amber"  icon={Icons.money} delay={460} href="/cobros" />
          </div>
          {(esContabilidad || rol === 'admin' || rol === 'super_admin') && (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4 mt-3 sm:mt-4">
              <KpiCard label="Total abonado del mes" value={formatMonto(data.totalAbonadoMes)} tone="green" icon={Icons.money}   delay={520} href="/cobros" />
              <KpiCard label="Sin facturar"          value={data.sinFactura}                   tone="amber" icon={Icons.pending} delay={560} href="/facturas" />
              <KpiCard label="Facturados"            value={data.facturados}                   tone="green" icon={Icons.check}   delay={600} href="/facturas" />
            </div>
          )}
        </>
      )}

      {/* Footer hairline decorativo */}
      <div className="mt-10 flex items-center gap-3 text-[10px] uppercase tracking-[0.22em] font-bold text-carbon-400">
        <span className="chevs">
          <svg width="9" height="5" viewBox="0 0 9 5" fill="none"><path d="M1 4L4.5 1L8 4" stroke="#e8853a" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/></svg>
          <svg width="9" height="5" viewBox="0 0 9 5" fill="none"><path d="M1 1L4.5 4L8 1" stroke="#4d8093" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/></svg>
        </span>
        Ascensores Jy S.A.C
        <span className="flex-1 h-px bg-gradient-to-r from-carbon-200 via-carbon-100 to-transparent" />
        <span className="font-mono normal-case tracking-normal text-carbon-500">{new Date().getFullYear()}</span>
      </div>
    </>
  );
}
