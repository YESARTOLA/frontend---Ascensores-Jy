import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { serviciosService } from '../services';
import PageHeader from '../components/common/PageHeader.jsx';
import Loader from '../components/common/Loader.jsx';
import EmptyState from '../components/common/EmptyState.jsx';
import { useAuth } from '../features/auth/AuthContext.jsx';
import { badgeEstado, formatFecha, resumenAscensores, toYMDLima } from '../utils/formatters.js';
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

export default function PanelTecnico() {
  const [servicios, setServicios] = useState([]);
  const [realizados, setRealizados] = useState([]);
  const [loading, setLoading] = useState(true);
  // Bloque visible en móvil. En escritorio se muestran todos a la vez: en el
  // teléfono, cuatro listas apiladas obligaban a un scroll interminable para
  // llegar a "Pendientes", así que se navegan por pestañas.
  // `null` = aún no ha elegido nada: se abre solo el primer bloque con trabajo.
  const [bloqueMovil, setBloqueMovil] = useState(null);
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

  // Definición única de los bloques: la comparten las pestañas de móvil, las
  // tarjetas de conteo y las secciones de escritorio, para que nunca se
  // desincronicen los números con lo que se lista debajo.
  const BLOQUES = [
    { key: 'curso',      titulo: 'En curso',           corto: 'En curso',   items: grupos.enCurso,    tono: 'violet' },
    { key: 'hoy',        titulo: 'Hoy',                corto: 'Hoy',        items: grupos.hoyServ,    tono: 'brand'  },
    { key: 'proximos',   titulo: 'Próximos (7 días)',  corto: 'Próximos',   items: grupos.proximos,   tono: 'amber'  },
    { key: 'pendientes', titulo: 'Pendientes',         corto: 'Pendientes', items: grupos.pendientes, tono: 'slate'  }
  ];
  // Sin elección previa, abre "Hoy"; y si hoy no hay nada programado, el primer
  // bloque que sí tenga trabajo, para no recibir al técnico con un vacío cuando
  // en realidad tiene servicios en curso o pendientes.
  const bloqueActivo = BLOQUES.find(b => b.key === bloqueMovil)
    || (grupos.hoyServ.length > 0 ? BLOQUES[1] : BLOQUES.find(b => b.items.length > 0))
    || BLOQUES[1];

  return (
    <>
      <PageHeader title="Mis servicios" subtitle="Panel del técnico" />

      {/* Conteos. En móvil son además los accesos a cada bloque: tocar el número
          filtra la lista de abajo, sin necesidad de recorrer la página. */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 sm:gap-3 mb-4 sm:mb-5">
        {BLOQUES.map(b => (
          <Stat
            key={b.key}
            label={b.corto}
            value={b.items.length}
            accent={b.tono}
            activo={bloqueActivo.key === b.key}
            onClick={() => setBloqueMovil(b.key)}
          />
        ))}
      </div>

      {/* ---------- MÓVIL: un bloque a la vez ---------- */}
      <div className="lg:hidden space-y-4">
        <div className="card overflow-hidden">
          <div className="card-header">
            <h3 className="card-title">{bloqueActivo.titulo} · {bloqueActivo.items.length}</h3>
          </div>
          {bloqueActivo.items.length === 0
            ? <EmptyState title="Sin servicios" subtitle="Nada en este grupo por ahora." />
            : (
              <div className="p-3 space-y-3">
                {bloqueActivo.items.map(s => <Tarjeta key={s.id} s={s} />)}
              </div>
            )}
        </div>
        <HistorialReciente realizados={realizados} />
      </div>

      {/* ---------- ESCRITORIO: todos los bloques ---------- */}
      <div className="hidden lg:block space-y-6">
        {BLOQUES.map(b => <Bloque key={b.key} titulo={b.titulo} items={b.items} />)}
        <HistorialReciente realizados={realizados} />
      </div>
    </>
  );
}

function Stat({ label, value, accent, activo, onClick }) {
  const accents = {
    brand:  'bg-brand-50 text-brand-700',
    amber:  'bg-amber-50 text-amber-700',
    violet: 'bg-violet-50 text-violet-700',
    slate:  'bg-carbon-100 text-carbon-700',
    green:  'bg-emerald-50 text-emerald-700'
  };
  return (
    <button
      type="button"
      onClick={onClick}
      className={`card p-3 sm:p-4 flex flex-col gap-1 text-left transition active:scale-[0.98]
                  lg:pointer-events-none
                  ${activo ? 'ring-2 ring-ember-400 lg:ring-1 lg:ring-carbon-100' : ''}`}>
      <span className={`text-[9.5px] sm:text-[10px] uppercase tracking-wider font-bold ${accents[accent]} px-1.5 sm:px-2 py-0.5 rounded inline-block w-fit`}>{label}</span>
      <span className="text-xl sm:text-2xl font-semibold text-carbon-900 tabular-nums">{value}</span>
    </button>
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

function HistorialReciente({ realizados }) {
  return (
    <div className="card">
      <div className="card-header"><h3 className="card-title">Historial reciente</h3></div>
      <div className="card-body">
        {realizados.length === 0 ? <p className="text-sm text-carbon-500">Sin servicios finalizados</p> : (
          <ul className="divide-y divide-carbon-100/80 -my-1">
            {realizados.slice(0, 20).map(r => (
              <li key={r.id}>
                <Link to={`/servicios/${r.id_servicio}`}
                      className="flex items-start gap-3 py-2.5 text-sm active:bg-ember-50/50 -mx-2 px-2 rounded-lg transition">
                  {/* En móvil la fecha y el código van uno debajo del otro: en una
                      sola línea con el cliente no cabían y se cortaba el nombre. */}
                  <div className="shrink-0 w-[74px] sm:w-auto sm:flex sm:items-start sm:gap-3">
                    <span className="block text-[11px] text-carbon-500 sm:w-24">{formatFecha(r.fecha_realizacion)}</span>
                    <span className="block font-mono text-[11px] text-brand-700 sm:w-32">{r.servicio?.codigo}</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-carbon-700 truncate">{r.servicio?.cliente?.nombre}</div>
                    <div className="text-xs text-carbon-500 truncate">{resumenAscensores(r.servicio)} · {r.servicio?.tipo_servicio?.nombre}</div>
                  </div>
                  <span className={`${badgeEstado(r.estado_cobro)} shrink-0`}>{r.estado_cobro}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

/**
 * Tarjeta de un servicio asignado. Es la unidad de trabajo del técnico en obra:
 * a qué voy, dónde es, cuándo, y los dos atajos que se usan con el teléfono en
 * la mano —llamar al contacto en sitio y abrir la ruta en Maps— accesibles sin
 * entrar al detalle. Ambos van fuera del <Link> para que no abran el servicio.
 */
function Tarjeta({ s, resaltar }) {
  // La ubicación física la da el edificio de los ascensores del servicio.
  const ascensores = (s.ascensores || []).map(a => a.ascensor).filter(Boolean);
  const edificioServicio = ascensores.map(a => a.edificio).find(Boolean);
  const coords = coordsDe(edificioServicio);
  // Contacto en sitio: el del servicio manda; si no lo tiene, el de la ficha del
  // ascensor (mismo criterio que el detalle del servicio).
  const telefono = s.contacto_telefono || ascensores.find(a => a.contacto_telefono)?.contacto_telefono || null;
  const dias = diasProgramados(s);

  return (
    <div className={`relative rounded-xl ring-1 bg-white transition
                     ${resaltar ? 'ring-amber-300' : 'ring-carbon-100'}`}>
      <Link to={`/servicios/${s.id}`}
            className="block p-4 rounded-xl active:bg-ember-50/40 hover:shadow-lifted hover:ring-brand-200 transition">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="font-mono text-[11px] text-brand-700">{s.codigo}</div>
            <div className="font-semibold text-carbon-900 text-sm mt-0.5 line-clamp-2 break-words">{s.titulo}</div>
          </div>
          <span className={`${badgeEstado(s.estado_servicio)} shrink-0`}>{s.estado_servicio}</span>
        </div>

        <div className="mt-2 text-xs text-carbon-500 break-words">
          {s.cliente?.nombre}{edificioServicio?.nombre ? ` · ${edificioServicio.nombre}` : ''}
        </div>
        {(edificioServicio?.direccion || edificioServicio?.distrito) && (
          <div className="text-[11px] text-carbon-500 break-words">
            {[edificioServicio?.direccion, edificioServicio?.distrito].filter(Boolean).join(' · ')}
          </div>
        )}
        <div className="text-xs text-carbon-500 font-mono mt-0.5 break-words"
             title={ascensores.map(a => `${a.codigo} · ${a.ubicacion || ''}`).join('\n')}>
          {resumenAscensores(s)}
        </div>

        <div className="mt-2 text-xs font-medium text-carbon-600"
             title={dias.length > 1 ? resumenProgramacion(dias) : undefined}>
          {dias.length > 1
            ? `${dias.length} días · ${resumenProgramacion(dias)}`
            : `${formatFecha(s.fecha_programada)} ${s.hora_programada || ''}`.trim()}
        </div>
      </Link>

      {/* Atajos de obra. Botones grandes, a un dedo de distancia. */}
      {(coords || telefono) && (
        <div className="flex gap-2 px-3 pb-3 -mt-1">
          {telefono && (
            <a href={`tel:${telefono}`}
               className="flex-1 inline-flex items-center justify-center gap-1.5 min-h-[40px] rounded-lg
                          ring-1 ring-emerald-200 bg-emerald-50 text-emerald-800 text-xs font-semibold
                          active:scale-[0.98] transition">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.9.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92z"/>
              </svg>
              Llamar
            </a>
          )}
          {coords && (
            <a href={linkGoogleMaps(coords)} target="_blank" rel="noopener noreferrer"
               className="flex-1 inline-flex items-center justify-center gap-1.5 min-h-[40px] rounded-lg
                          ring-1 ring-brand-200 bg-brand-50 text-brand-800 text-xs font-semibold
                          active:scale-[0.98] transition">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/>
              </svg>
              Cómo llegar
            </a>
          )}
        </div>
      )}
    </div>
  );
}
