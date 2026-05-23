import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { clientesService } from '../services';
import Loader from '../components/common/Loader.jsx';
import PageHeader from '../components/common/PageHeader.jsx';
import { FileLink, useFilePreview } from '../components/common/FilePreview.jsx';
import { useAuth } from '../features/auth/AuthContext.jsx';
import { formatFecha, formatFechaHora, formatMonto, badgeEstado, codigosAscensores, resumenAscensores, formatTelefono } from '../utils/formatters.js';
import MapaUbicacion from '../components/common/MapaUbicacion.jsx';
import { coordsDe } from '../utils/mapa.js';

const ESTADOS_PENDIENTE = ['Borrador', 'Pendiente', 'Asignado', 'Checklist de salida pendiente', 'Listo para salida'];
const ESTADOS_CURSO = ['En camino', 'En curso'];
const ESTADOS_FIN = ['Finalizado por técnico', 'Finalizado observado', 'En revisión administrativa', 'A gestión de cobro', 'En cobro', 'Cobrado parcial', 'Cobrado total', 'Facturado', 'Cerrado'];

export default function Cliente360() {
  const { id } = useParams();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [clasificaciones, setClasificaciones] = useState([]);
  const { puedeVerPrecio } = useAuth();
  const { open: abrirPreview } = useFilePreview();

  useEffect(() => {
    clientesService.vista360(id).then(setData).finally(() => setLoading(false));
    clientesService.clasificaciones().then(setClasificaciones).catch(() => setClasificaciones([]));
  }, [id]);

  const clasificacionActual = useMemo(
    () => (data?.clasificacion ? clasificaciones.find(c => c.codigo === data.clasificacion) : null),
    [clasificaciones, data?.clasificacion]
  );

  const grupos = useMemo(() => {
    if (!data?.servicios) return { pendientes: [], curso: [], finalizados: [] };
    return {
      pendientes: data.servicios.filter(s => ESTADOS_PENDIENTE.includes(s.estado_servicio)),
      curso: data.servicios.filter(s => ESTADOS_CURSO.includes(s.estado_servicio)),
      finalizados: data.servicios.filter(s => ESTADOS_FIN.includes(s.estado_servicio))
    };
  }, [data]);

  if (loading) return <Loader />;
  if (!data) return <p className="text-slate-500">Cliente no encontrado</p>;

  return (
    <>
      <PageHeader
        title={
          <span className="inline-flex items-center gap-2 flex-wrap">
            <span>{data.nombre}</span>
            {clasificacionActual && (
              <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold ring-1 ${clasificacionActual.color}`}>
                {clasificacionActual.etiqueta}
              </span>
            )}
          </span>
        }
        subtitle={[data.nombre_edificio, `${data.tipo_documento} ${data.numero_documento || ''}`, data.distrito].filter(Boolean).join(' · ')}
        actions={<Link to="/clientes" className="btn-secondary">← Clientes</Link>} />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <div className="card lg:col-span-1">
          <div className="card-header"><h3 className="card-title">Datos generales</h3></div>
          <div className="card-body grid grid-cols-2 gap-3 text-sm">
            {data.nombre_edificio && <Info label="Edificio" value={data.nombre_edificio} cols={2} />}
            <Info label="Teléfono" value={formatTelefono(data.telefono) || '—'} />
            <Info label="WhatsApp" value={formatTelefono(data.whatsapp) || '—'} />
            <Info label="Correo" value={data.correo || '—'} />
            <Info label="Distrito" value={data.distrito || '—'} />
            <Info label="Dirección" value={data.direccion || '—'} cols={2} />
            <Info label="Inicio contrato" value={formatFecha(data.contrato_inicio)} />
            <Info label="Fin contrato" value={formatFecha(data.contrato_fin)} />
            <Info
              label="Contrato firmado"
              cols={2}
              value={data.archivo_contrato
                ? <FileLink archivo={data.archivo_contrato} className="text-brand-700 hover:underline text-sm break-all inline-flex items-center gap-1">
                    📎 {data.archivo_contrato.nombre_original}
                  </FileLink>
                : '—'}
            />
            <Info label="Registro" value={formatFechaHora(data.date_time_registration)} cols={2} />
            <div className="col-span-2">
              <div className="text-[10px] uppercase tracking-wider text-slate-400 mb-1">Ubicación</div>
              {coordsDe(data) ? (
                <MapaUbicacion valor={data} alto="220px" />
              ) : (
                <div className="rounded-lg ring-1 ring-slate-200 bg-slate-50 p-3 text-xs text-slate-500">
                  Ubicación no registrada. Edita el cliente para fijarla en el mapa.
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="card lg:col-span-2">
          <div className="card-header"><h3 className="card-title">Contactos</h3></div>
          <div className="card-body grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm">
            {[
              { etiqueta: 'Principal',      key: 'principal' },
              { etiqueta: 'Cobranzas',      key: 'cobranzas' },
              { etiqueta: 'Administrativo', key: 'admin' }
            ].map(({ etiqueta, key }) => {
              const nombre = data[`contacto_${key}_nombre`];
              const correo = data[`contacto_${key}_correo`];
              const tel = data[`contacto_${key}_telefono`];
              const hay = nombre || correo || tel;
              return (
                <div key={key} className="rounded-lg ring-1 ring-slate-100 p-3">
                  <div className="text-[10px] uppercase tracking-wider text-slate-400 mb-1">{etiqueta}</div>
                  {hay ? (
                    <div className="space-y-0.5">
                      {nombre && <div className="font-medium text-slate-800">{nombre}</div>}
                      {correo && <div className="text-xs text-slate-600 break-all">{correo}</div>}
                      {tel && <div className="text-xs text-slate-600 font-mono">{formatTelefono(tel)}</div>}
                    </div>
                  ) : <div className="text-xs text-slate-400">—</div>}
                </div>
              );
            })}
          </div>
        </div>

        {data.archivos?.length > 0 && (
          <div className="card lg:col-span-3">
            <div className="card-header"><h3 className="card-title">Archivos del cliente ({data.archivos.length})</h3></div>
            <div className="card-body grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
              {data.archivos.map(a => (
                <button
                  key={a.id}
                  type="button"
                  onClick={() => abrirPreview(a.archivo)}
                  className="text-left flex items-start gap-2 rounded-md ring-1 ring-slate-100 hover:ring-brand-200 p-2.5 transition"
                >
                  <span className="text-lg leading-none">📎</span>
                  <div className="min-w-0 flex-1">
                    <div className="text-sm text-brand-700 truncate" title={a.archivo?.nombre_original}>{a.archivo?.nombre_original}</div>
                    {a.descripcion && <div className="text-xs text-slate-500 truncate">{a.descripcion}</div>}
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="card lg:col-span-2">
          <div className="card-header"><h3 className="card-title">Ascensores ({data.ascensores?.length || 0})</h3></div>
          <div className="card-body grid sm:grid-cols-2 gap-3">
            {data.ascensores?.length === 0 && <p className="text-sm text-slate-500">Sin ascensores registrados</p>}
            {data.ascensores?.map(a => (
              <Link key={a.id} to={`/ascensores/${a.id}`} state={{ from: `/clientes/${id}`, fromLabel: data.nombre }} className="block rounded-lg ring-1 ring-slate-100 hover:ring-brand-200 p-3 transition">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="font-mono text-xs text-slate-500">{a.codigo}</div>
                    <div className="font-medium text-slate-800 text-sm mt-0.5">{a.tipo} · {a.marca} {a.modelo}</div>
                    <div className="text-xs text-slate-500 mt-0.5">{a.ubicacion}</div>
                  </div>
                  <span className={badgeEstado(a.estado_operativo)}>{a.estado_operativo}</span>
                </div>
              </Link>
            ))}
          </div>
        </div>

        <SeccionServicios titulo="Servicios pendientes" data={grupos.pendientes} accent="amber" puedeVerPrecio={puedeVerPrecio} />
        <SeccionServicios titulo="En curso" data={grupos.curso} accent="violet" puedeVerPrecio={puedeVerPrecio} />
        <SeccionServicios titulo="Finalizados" data={grupos.finalizados} accent="green" puedeVerPrecio={puedeVerPrecio} />

        {puedeVerPrecio && (
          <div className="card lg:col-span-3">
            <div className="card-header"><h3 className="card-title">Cotizaciones ({data.cotizaciones?.length || 0})</h3></div>
            <div className="card-body">
              {!data.cotizaciones?.length ? <p className="text-sm text-slate-500">Sin cotizaciones</p> : (
                <div className="overflow-x-auto scroll-thin">
                  <table className="table-base">
                    <thead><tr>
                      <th className="table-th">Código</th>
                      <th className="table-th">Tipo</th>
                      <th className="table-th">Última versión</th>
                      <th className="table-th">Validez</th>
                      <th className="table-th text-right">Monto</th>
                      <th className="table-th">Estado versión</th>
                      <th className="table-th">Estado global</th>
                    </tr></thead>
                    <tbody className="divide-y divide-slate-100">
                      {data.cotizaciones.map(c => {
                        const v = c.versiones?.[0];
                        return (
                          <tr key={c.id} className="table-row-hover">
                            <td className="table-td"><Link to={`/cotizaciones/${c.id}`} className="font-mono text-brand-700 hover:underline">{c.codigo}</Link></td>
                            <td className="table-td text-xs">{c.tipo_servicio?.nombre || '—'}</td>
                            <td className="table-td">v{v?.numero_version || c.version_activa}</td>
                            <td className="table-td text-xs">{formatFecha(v?.fecha_validez)}</td>
                            <td className="table-td text-right font-mono text-xs">{formatMonto(v?.monto_total, v?.moneda)}</td>
                            <td className="table-td"><span className={badgeEstado(v?.estado_version)}>{v?.estado_version || '—'}</span></td>
                            <td className="table-td"><span className={badgeEstado(c.estado_global)}>{c.estado_global}</span></td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}

        <div className="card lg:col-span-2">
          <div className="card-header"><h3 className="card-title">Emergencias ({data.emergencias?.length || 0})</h3></div>
          <div className="card-body">
            {!data.emergencias?.length ? <p className="text-sm text-slate-500">Sin emergencias</p> : (
              <ul className="space-y-2 max-h-64 overflow-y-auto scroll-thin">
                {data.emergencias.map(e => (
                  <li key={e.id} className="text-xs flex items-start gap-3 border-l-2 border-rose-200 pl-2">
                    <span className="font-mono text-slate-500 shrink-0">{e.ascensor?.codigo}</span>
                    <div className="flex-1">
                      <div className="text-slate-700">{e.motivo}</div>
                      <div className="text-slate-400">{formatFechaHora(e.fecha_reporte)} · {e.nivel_urgencia}</div>
                    </div>
                    <span className={badgeEstado(e.estado_emergencia)}>{e.estado_emergencia}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        <div className="card lg:col-span-1">
          <div className="card-header"><h3 className="card-title">Mantenimientos ({data.mantenimientos?.length || 0})</h3></div>
          <div className="card-body">
            {!data.mantenimientos?.length ? <p className="text-sm text-slate-500">Sin planes</p> : (
              <ul className="space-y-2">
                {data.mantenimientos.map(m => (
                  <li key={m.id} className="text-xs">
                    <div className="text-slate-700">{m.ascensor?.codigo} · {m.tipo_servicio?.nombre}</div>
                    <div className="text-slate-400">{m.tipo_plan === 'eventual' ? 'Eventual' : `${m.frecuencia} (${m.tipo_plan})`} · <span className={badgeEstado(m.estado_plan)}>{m.estado_plan}</span></div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        <div className="card lg:col-span-2">
          <div className="card-header"><h3 className="card-title">Entregas ({data.entregas?.length || 0})</h3></div>
          <div className="card-body">
            {!data.entregas?.length ? <p className="text-sm text-slate-500">Sin entregas</p> : (
              <div className="overflow-x-auto scroll-thin">
                <table className="table-base">
                  <thead><tr>
                    <th className="table-th">Fecha</th><th className="table-th">Servicio</th>
                    <th className="table-th">Tipo</th><th className="table-th">Estado</th>
                    <th className="table-th">Archivo</th>
                  </tr></thead>
                  <tbody className="divide-y divide-slate-100">
                    {data.entregas.map(en => (
                      <tr key={en.id}>
                        <td className="table-td text-xs">{formatFecha(en.fecha_entrega)}</td>
                        <td className="table-td font-mono text-xs">{en.servicio?.codigo}</td>
                        <td className="table-td text-xs">{en.tipo_entrega}</td>
                        <td className="table-td"><span className={badgeEstado(en.estado_entrega)}>{en.estado_entrega}</span></td>
                        <td className="table-td">{en.archivo ? <FileLink archivo={en.archivo} className="text-brand-700 text-xs hover:underline">Ver</FileLink> : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

        <div className="card lg:col-span-1">
          <div className="card-header"><h3 className="card-title">Facturas ({data.facturas?.length || 0})</h3></div>
          <div className="card-body">
            {!data.facturas?.length ? <p className="text-sm text-slate-500">Sin facturas</p> : (
              <ul className="space-y-2 max-h-72 overflow-y-auto scroll-thin">
                {data.facturas.map(f => (
                  <li key={f.id} className="text-xs">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-mono">{f.numero_factura}</span>
                      <span className={badgeEstado(f.estado_factura)}>{f.estado_factura}</span>
                    </div>
                    <div className="text-slate-500 flex items-center justify-between mt-0.5">
                      <span>{f.servicio?.codigo} · {formatFecha(f.fecha_emision)}</span>
                      <span className="font-mono">{formatMonto(f.monto)}</span>
                    </div>
                    {f.archivo && <FileLink archivo={f.archivo}>Ver archivo</FileLink>}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        {puedeVerPrecio && (
          <div className="card lg:col-span-2">
            <div className="card-header"><h3 className="card-title">Cobros ({data.cobros?.length || 0})</h3></div>
            <div className="overflow-x-auto scroll-thin">
              <table className="table-base">
                <thead><tr>
                  <th className="table-th">Servicio</th>
                  <th className="table-th">Monto</th>
                  <th className="table-th">Abonado</th>
                  <th className="table-th">Saldo</th>
                  <th className="table-th">Estado</th>
                </tr></thead>
                <tbody className="divide-y divide-slate-100">
                  {data.cobros?.length === 0 && <tr><td colSpan="5" className="table-td text-center text-slate-400 py-6">Sin cobros</td></tr>}
                  {data.cobros?.map(c => (
                    <tr key={c.id} className="table-row-hover">
                      <td className="table-td"><Link to={`/cobros/${c.id}`} className="text-brand-700 hover:underline text-xs">Ver</Link></td>
                      <td className="table-td font-mono">{formatMonto(c.monto_total, c.moneda)}</td>
                      <td className="table-td font-mono text-emerald-700">{formatMonto(c.total_abonado, c.moneda)}</td>
                      <td className="table-td font-mono text-rose-700">{formatMonto(c.saldo_pendiente, c.moneda)}</td>
                      <td className="table-td"><span className={badgeEstado(c.estado_cobro)}>{c.estado_cobro}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        <div className="card lg:col-span-1">
          <div className="card-header"><h3 className="card-title">Documentos ({data.documentos?.length || 0})</h3></div>
          <div className="card-body">
            {!data.documentos?.length ? <p className="text-sm text-slate-500">Sin documentos</p> : (
              <ul className="space-y-2 max-h-72 overflow-y-auto scroll-thin">
                {data.documentos.map(d => (
                  <li key={d.id} className="text-xs">
                    <FileLink archivo={d} className="text-brand-700 hover:underline truncate block text-left">{d.nombre_original}</FileLink>
                    <div className="text-slate-400">{formatFechaHora(d.fecha_subida)} · {d.mime_type}</div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        <div className="card lg:col-span-3">
          <div className="card-header"><h3 className="card-title">Historial reciente</h3></div>
          <ul className="card-body space-y-3 max-h-96 overflow-y-auto scroll-thin">
            {data.historial?.length === 0 && <p className="text-sm text-slate-500">Sin eventos</p>}
            {data.historial?.map(h => (
              <li key={h.id} className="flex gap-3 text-sm">
                <span className="h-2 w-2 rounded-full bg-brand-400 mt-1.5 shrink-0" />
                <div className="min-w-0">
                  <div className="text-slate-700">{h.descripcion}</div>
                  <div className="text-xs text-slate-400">{formatFechaHora(h.fecha_evento)} · {h.tipo_evento}</div>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </>
  );
}

function SeccionServicios({ titulo, data, accent, puedeVerPrecio }) {
  const colors = { amber: 'border-amber-300', violet: 'border-violet-300', green: 'border-emerald-300' };
  return (
    <div className="card lg:col-span-3">
      <div className={`card-header border-l-4 ${colors[accent] || 'border-slate-300'}`}>
        <h3 className="card-title">{titulo} ({data.length})</h3>
      </div>
      {data.length === 0 ? (
        <div className="card-body text-sm text-slate-500">Sin servicios en esta categoría</div>
      ) : (
        <div className="overflow-x-auto scroll-thin">
          <table className="table-base">
            <thead><tr>
              <th className="table-th">Código</th>
              <th className="table-th">Título</th>
              <th className="table-th">Ascensor</th>
              <th className="table-th">Tipo</th>
              <th className="table-th">Fecha</th>
              <th className="table-th">Técnicos</th>
              <th className="table-th">Estado</th>
              {puedeVerPrecio && <th className="table-th text-right">Precio</th>}
            </tr></thead>
            <tbody className="divide-y divide-slate-100">
              {data.map(s => (
                <tr key={s.id} className="table-row-hover">
                  <td className="table-td"><Link to={`/servicios/${s.id}`} className="font-mono text-xs text-brand-700 hover:underline">{s.codigo}</Link></td>
                  <td className="table-td">{s.titulo}</td>
                  <td className="table-td font-mono text-xs" title={codigosAscensores(s).join(', ')}>{resumenAscensores(s)}</td>
                  <td className="table-td text-xs">{s.tipo_servicio?.nombre}</td>
                  <td className="table-td text-xs">{formatFecha(s.fecha_programada)} {s.hora_programada || ''}</td>
                  <td className="table-td text-xs">{s.asignaciones?.map(a => a.tecnico?.nombre).join(', ') || '—'}</td>
                  <td className="table-td"><span className={badgeEstado(s.estado_servicio)}>{s.estado_servicio}</span></td>
                  {puedeVerPrecio && <td className="table-td text-right font-mono">{formatMonto(s.precio_interno, s.moneda)}</td>}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function Info({ label, value, cols = 1 }) {
  return (
    <div className={`min-w-0 ${cols === 2 ? 'col-span-2' : ''}`}>
      <div className="text-[10px] uppercase tracking-wider text-slate-400">{label}</div>
      <div className="text-slate-800 text-sm break-words [overflow-wrap:anywhere]">{value}</div>
    </div>
  );
}
