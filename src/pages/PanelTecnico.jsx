import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { serviciosService } from '../services';
import PageHeader from '../components/common/PageHeader.jsx';
import Loader from '../components/common/Loader.jsx';
import EmptyState from '../components/common/EmptyState.jsx';
import { useAuth } from '../features/auth/AuthContext.jsx';
import { badgeEstado, formatFecha, formatFechaHora, resumenAscensores } from '../utils/formatters.js';
import { coordsDe, linkGoogleMaps } from '../utils/mapa.js';

const ESTADOS_ACTIVOS = ['Asignado', 'Checklist de salida pendiente', 'Listo para salida', 'En camino', 'En curso'];
const ESTADOS_FINALIZADOS = ['Finalizado por técnico', 'Finalizado observado', 'En revisión administrativa', 'A gestión de cobro', 'En cobro', 'Cobrado parcial', 'Cobrado total', 'Facturado', 'Cerrado'];

export default function PanelTecnico() {
  const [servicios, setServicios] = useState([]);
  const [realizados, setRealizados] = useState([]);
  const [loading, setLoading] = useState(true);
  const { user } = useAuth();

  useEffect(() => {
    Promise.all([
      serviciosService.list(),
      serviciosService.realizados()
    ]).then(([s, r]) => {
      setServicios(s);
      setRealizados(r);
    }).finally(() => setLoading(false));
  }, []);

  const grupos = useMemo(() => {
    const hoy = new Date();
    hoy.setHours(0, 0, 0, 0);
    const en7Dias = new Date(hoy); en7Dias.setDate(hoy.getDate() + 7);

    const enCurso = servicios.filter(s => ['En camino', 'En curso'].includes(s.estado_servicio));
    const checklistPendiente = servicios.filter(s => s.estado_servicio === 'Checklist de salida pendiente' &&
      s.asignaciones?.some(a => a.id_tecnico === user.id_tecnico && a.responsable_checklist === 1));
    const hoyServ = servicios.filter(s => {
      const f = new Date(s.fecha_programada); f.setHours(0, 0, 0, 0);
      return f.getTime() === hoy.getTime() && ESTADOS_ACTIVOS.includes(s.estado_servicio);
    });
    const proximos = servicios.filter(s => {
      const f = new Date(s.fecha_programada); f.setHours(0, 0, 0, 0);
      return f > hoy && f <= en7Dias && ESTADOS_ACTIVOS.includes(s.estado_servicio);
    });
    const pendientes = servicios.filter(s => ['Pendiente', 'Asignado', 'Listo para salida'].includes(s.estado_servicio) && !hoyServ.includes(s) && !proximos.includes(s));

    return { enCurso, checklistPendiente, hoyServ, proximos, pendientes };
  }, [servicios, user]);

  if (loading) return <Loader />;

  return (
    <>
      <PageHeader title="Mis servicios" subtitle="Panel del técnico" />

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
        <Stat label="En curso" value={grupos.enCurso.length} accent="violet" />
        <Stat label="Hoy" value={grupos.hoyServ.length} accent="brand" />
        <Stat label="Checklist pend." value={grupos.checklistPendiente.length} accent="amber" />
        <Stat label="Finalizados" value={realizados.length} accent="green" />
      </div>

      <div className="space-y-6">
        {grupos.checklistPendiente.length > 0 && (
          <div className="card border-l-4 border-amber-400">
            <div className="card-header"><h3 className="card-title text-amber-700">⚠ Checklist pendiente de llenar · {grupos.checklistPendiente.length}</h3></div>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3 p-4">
              {grupos.checklistPendiente.map(s => <Tarjeta key={s.id} s={s} resaltar />)}
            </div>
          </div>
        )}
        <Bloque titulo="En curso" items={grupos.enCurso} />
        <Bloque titulo="Hoy" items={grupos.hoyServ} />
        <Bloque titulo="Próximos (7 días)" items={grupos.proximos} />
        <Bloque titulo="Pendientes" items={grupos.pendientes} />

        <div className="card">
          <div className="card-header"><h3 className="card-title">Historial reciente</h3></div>
          <div className="card-body">
            {realizados.length === 0 ? <p className="text-sm text-slate-500">Sin servicios finalizados</p> : (
              <ul className="divide-y divide-slate-100">
                {realizados.slice(0, 20).map(r => (
                  <li key={r.id} className="py-2 flex items-start gap-3 text-sm">
                    <span className="text-xs text-slate-500 shrink-0 w-24">{formatFecha(r.fecha_realizacion)}</span>
                    <Link to={`/servicios/${r.id_servicio}`} className="font-mono text-xs text-brand-700 hover:underline shrink-0 w-32">{r.servicio?.codigo}</Link>
                    <div className="flex-1 min-w-0">
                      <div className="text-slate-700 truncate">{r.servicio?.cliente?.nombre} · {resumenAscensores(r.servicio)}</div>
                      <div className="text-xs text-slate-500 truncate">{r.servicio?.tipo_servicio?.nombre}</div>
                    </div>
                    <span className={badgeEstado(r.estado_cobro)}>{r.estado_cobro}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
    </>
  );
}

function Stat({ label, value, accent }) {
  const accents = {
    brand: 'bg-brand-50 text-brand-700',
    amber: 'bg-amber-50 text-amber-700',
    violet: 'bg-violet-50 text-violet-700',
    green: 'bg-emerald-50 text-emerald-700'
  };
  return (
    <div className="card p-4 flex flex-col gap-1">
      <span className={`text-[10px] uppercase tracking-wider font-semibold ${accents[accent]} px-2 py-0.5 rounded inline-block w-fit`}>{label}</span>
      <span className="text-2xl font-semibold text-slate-900">{value}</span>
    </div>
  );
}

function Bloque({ titulo, items }) {
  if (items.length === 0) {
    return (
      <div className="card">
        <div className="card-header"><h3 className="card-title">{titulo}</h3></div>
        <EmptyState title="Sin servicios" />
      </div>
    );
  }
  return (
    <div className="card">
      <div className="card-header"><h3 className="card-title">{titulo} · {items.length}</h3></div>
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3 p-4">
        {items.map(s => <Tarjeta key={s.id} s={s} />)}
      </div>
    </div>
  );
}

function Tarjeta({ s, resaltar }) {
  const coords = coordsDe(s.cliente);
  return (
    <Link to={`/servicios/${s.id}`} className={`relative rounded-lg ring-1 hover:shadow-soft transition p-4 bg-white ${resaltar ? 'ring-amber-300 hover:ring-amber-400' : 'ring-slate-100 hover:ring-brand-200'}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="font-mono text-xs text-brand-700">{s.codigo}</div>
          <div className="font-medium text-slate-800 text-sm mt-0.5 line-clamp-2">{s.titulo}</div>
        </div>
        <span className={badgeEstado(s.estado_servicio)}>{s.estado_servicio}</span>
      </div>
      <div className="mt-2 text-xs text-slate-500 truncate">{s.cliente?.nombre}</div>
      {(s.cliente?.direccion || s.cliente?.distrito) && (
        <div className="text-[11px] text-slate-500 truncate">
          {[s.cliente?.direccion, s.cliente?.distrito].filter(Boolean).join(' · ')}
        </div>
      )}
      <div className="text-xs text-slate-500 truncate font-mono" title={(s.ascensores || []).map(a => `${a.ascensor?.codigo} · ${a.ascensor?.ubicacion || ''}`).join('\n')}>{resumenAscensores(s)}</div>
      <div className="mt-2 flex items-center justify-between gap-2">
        <div className="text-xs text-slate-400">{formatFecha(s.fecha_programada)} {s.hora_programada || ''}</div>
        {coords && (
          <a
            href={linkGoogleMaps(coords)}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded ring-1 ring-brand-200 text-brand-700 hover:bg-brand-50"
            title="Abrir en Google Maps"
          >
            📍 Maps
          </a>
        )}
      </div>
    </Link>
  );
}
