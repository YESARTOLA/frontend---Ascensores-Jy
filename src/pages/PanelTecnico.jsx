import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { serviciosService } from '../services';
import PageHeader from '../components/common/PageHeader.jsx';
import Loader from '../components/common/Loader.jsx';
import EmptyState from '../components/common/EmptyState.jsx';
import { useAuth } from '../features/auth/AuthContext.jsx';
import { badgeEstado, formatFecha, formatFechaHora, resumenAscensores, toYMDLima } from '../utils/formatters.js';
import { coordsDe, linkGoogleMaps } from '../utils/mapa.js';
import { addDiasYMD, resumenProgramacion } from '../utils/programacion.js';

/**
 * Días programados de un servicio, en 'YYYY-MM-DD'. Un trabajo puede ocupar días
 * NO corridos (10, 15 y 20): `fecha_programada` solo marca el primero, así que
 * la agrupación del panel se hace sobre la grilla `dias`. Sin grilla (datos
 * previos) se cae a la fecha programada.
 */
function diasProgramados(s) {
  const dias = (s?.dias || []).map(d => toYMDLima(d.fecha)).filter(Boolean);
  if (dias.length > 0) return dias;
  const f = toYMDLima(s?.fecha_programada);
  return f ? [f] : [];
}

const ESTADOS_ACTIVOS = ['Asignado', 'En curso'];
const ESTADOS_FINALIZADOS = ['Finalizado', 'En revisión administrativa', 'A gestión de cobro', 'En cobro', 'Cobrado parcial', 'Cobrado total', 'Facturado', 'Cerrado'];

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
    const hoy = toYMDLima(new Date());
    const en7Dias = addDiasYMD(hoy, 7);

    const enCurso = servicios.filter(s => s.estado_servicio === 'En curso');
    // "Hoy" / "Próximos" miran TODOS los días programados, no solo el primero:
    // un trabajo del 10, 15 y 20 debe aparecer los tres días.
    const hoyServ = servicios.filter(s =>
      ESTADOS_ACTIVOS.includes(s.estado_servicio) && diasProgramados(s).includes(hoy));
    const proximos = servicios.filter(s =>
      ESTADOS_ACTIVOS.includes(s.estado_servicio)
      && !hoyServ.includes(s)
      && diasProgramados(s).some(f => f > hoy && f <= en7Dias));
    const pendientes = servicios.filter(s => ['Pendiente', 'Asignado'].includes(s.estado_servicio) && !hoyServ.includes(s) && !proximos.includes(s));

    return { enCurso, hoyServ, proximos, pendientes };
  }, [servicios, user]);

  if (loading) return <Loader />;

  return (
    <>
      <PageHeader title="Mis servicios" subtitle="Panel del técnico" />

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
        <Stat label="En curso" value={grupos.enCurso.length} accent="violet" />
        <Stat label="Hoy" value={grupos.hoyServ.length} accent="brand" />
        <Stat label="Próximos 7 días" value={grupos.proximos.length} accent="amber" />
        <Stat label="Finalizados" value={realizados.length} accent="green" />
      </div>

      <div className="space-y-6">
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
  // La ubicación física la da el edificio de los ascensores del servicio.
  const edificioServicio = (s.ascensores || []).map(a => a.ascensor?.edificio).find(Boolean);
  const coords = coordsDe(edificioServicio);
  return (
    <Link to={`/servicios/${s.id}`} className={`relative rounded-lg ring-1 hover:shadow-soft transition p-4 bg-white ${resaltar ? 'ring-amber-300 hover:ring-amber-400' : 'ring-slate-100 hover:ring-brand-200'}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="font-mono text-xs text-brand-700">{s.codigo}</div>
          <div className="font-medium text-slate-800 text-sm mt-0.5 line-clamp-2">{s.titulo}</div>
        </div>
        <span className={badgeEstado(s.estado_servicio)}>{s.estado_servicio}</span>
      </div>
      <div className="mt-2 text-xs text-slate-500 truncate">{s.cliente?.nombre}{edificioServicio?.nombre ? ` · ${edificioServicio.nombre}` : ''}</div>
      {(edificioServicio?.direccion || edificioServicio?.distrito) && (
        <div className="text-[11px] text-slate-500 truncate">
          {[edificioServicio?.direccion, edificioServicio?.distrito].filter(Boolean).join(' · ')}
        </div>
      )}
      <div className="text-xs text-slate-500 truncate font-mono" title={(s.ascensores || []).map(a => `${a.ascensor?.codigo} · ${a.ascensor?.ubicacion || ''}`).join('\n')}>{resumenAscensores(s)}</div>
      <div className="mt-2 flex items-center justify-between gap-2">
        <div className="text-xs text-slate-400 truncate" title={diasProgramados(s).length > 1 ? resumenProgramacion(diasProgramados(s)) : undefined}>
          {diasProgramados(s).length > 1
            ? `${diasProgramados(s).length} días · ${resumenProgramacion(diasProgramados(s))}`
            : `${formatFecha(s.fecha_programada)} ${s.hora_programada || ''}`}
        </div>
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
