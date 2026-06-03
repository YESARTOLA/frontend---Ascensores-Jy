import { useEffect, useState } from 'react';
import { Link, useLocation, useParams } from 'react-router-dom';
import { ascensoresService } from '../services';
import PageHeader from '../components/common/PageHeader.jsx';
import Loader from '../components/common/Loader.jsx';
import { FileLink } from '../components/common/FilePreview.jsx';
import { useToast } from '../components/common/Toast.jsx';
import { formatFecha, formatFechaHora, badgeEstado, formatMonto, hoyISO, nombreEdificioCliente } from '../utils/formatters.js';
import { generarFichaAscensorPDF } from '../utils/pdfReport.js';
import { useAuth } from '../features/auth/AuthContext.jsx';
import MapaUbicacion from '../components/common/MapaUbicacion.jsx';
import { coordsDe, linkGoogleMaps } from '../utils/mapa.js';

export default function AscensorHistorial() {
  const { id } = useParams();
  const location = useLocation();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [exportandoPdf, setExportandoPdf] = useState(false);
  const { puedeVerPrecio } = useAuth();
  const toast = useToast();
  const backTo = location.state?.from || '/ascensores';
  const backLabel = location.state?.fromLabel ? `← ${location.state.fromLabel}` : '← Ascensores';

  useEffect(() => {
    ascensoresService.historial(id).then(setData).finally(() => setLoading(false));
  }, [id]);

  if (loading) return <Loader />;
  if (!data) return <p>Ascensor no encontrado</p>;

  const { ascensor, servicios, emergencias, mantenimientos, entregas, facturas, guias, evidencias, historial } = data;

  const exportarPdf = async () => {
    if (exportandoPdf) return;
    setExportandoPdf(true);
    try {
      const fechaHora = formatFechaHora(new Date());
      const codigoSeguro = String(ascensor.codigo || 'ascensor').replace(/[^\w-]+/g, '_');
      const fechaArchivo = hoyISO();
      await generarFichaAscensorPDF({
        ascensor,
        fechaHora,
        nombreArchivo: `Ficha_${codigoSeguro}_${fechaArchivo}.pdf`
      });
      toast.success('PDF descargado');
    } catch (err) {
      console.error(err);
      toast.error('Error al generar el PDF');
    } finally {
      setExportandoPdf(false);
    }
  };

  return (
    <>
      <PageHeader title={`Ascensor ${ascensor.codigo}`}
        subtitle={`${ascensor.tipo} · ${ascensor.marca} ${ascensor.modelo} · ${nombreEdificioCliente(ascensor.cliente)}`}
        actions={
          <>
            <button onClick={exportarPdf} disabled={exportandoPdf} className="btn-primary">
              {exportandoPdf ? 'Generando…' : 'Exportar PDF'}
            </button>
            <Link to={backTo} className="btn-secondary">{backLabel}</Link>
          </>
        } />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <div className="card">
          <div className="card-header"><h3 className="card-title">Ficha técnica</h3></div>
          <div className="card-body grid grid-cols-2 gap-3 text-sm">
            <Info label="Código" value={<span className="font-mono">{ascensor.codigo}</span>} />
            <Info label="Estado" value={<span className={badgeEstado(ascensor.estado_operativo)}>{ascensor.estado_operativo}</span>} />
            <Info label="Tipo" value={ascensor.tipo} />
            <Info label="Marca" value={ascensor.marca} />
            <Info label="Modelo" value={ascensor.modelo} />
            <Info label="Capacidad" value={ascensor.capacidad} />
            <Info label="Pisos" value={ascensor.pisos} />
            <Info label="Año" value={ascensor.anio_aproximado} />
            <Info label="Ubicación" value={ascensor.ubicacion} cols={2} />
            <Info label="Próx. mantenimiento" value={formatFecha(ascensor.proximo_mantenimiento)} cols={2} />
            <Info label="Observaciones" value={ascensor.observaciones || '—'} cols={2} />
            <div className="col-span-2 border-t border-slate-100 pt-3 mt-1">
              <div className="flex items-center justify-between gap-2 mb-2">
                <div className="text-[10px] uppercase tracking-wider text-slate-400">Ubicación del cliente</div>
                {coordsDe(ascensor.cliente) && (
                  <a
                    href={linkGoogleMaps(coordsDe(ascensor.cliente))}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-brand-700 hover:underline font-medium"
                  >
                    📍 Abrir en Google Maps ↗
                  </a>
                )}
              </div>
              {(ascensor.cliente?.direccion || ascensor.cliente?.distrito) && (
                <div className="text-sm text-slate-800 mb-2">
                  {[ascensor.cliente?.direccion, ascensor.cliente?.distrito].filter(Boolean).join(' · ')}
                </div>
              )}
              {coordsDe(ascensor.cliente) ? (
                <MapaUbicacion valor={ascensor.cliente} alto="200px" mostrarLinkMaps={false} />
              ) : (
                <div className="rounded-lg ring-1 ring-slate-200 bg-slate-50 p-3 text-xs text-slate-500">
                  Ubicación no registrada para este cliente.
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="card lg:col-span-2">
          <div className="card-header"><h3 className="card-title">Servicios ({servicios.length})</h3></div>
          <div className="overflow-x-auto scroll-thin">
            <table className="table-base">
              <thead><tr>
                <th className="table-th">Código</th><th className="table-th">Tipo</th>
                <th className="table-th">Fecha</th><th className="table-th">Técnicos</th>
                <th className="table-th">Estado</th>{puedeVerPrecio && <th className="table-th text-right">Precio</th>}
              </tr></thead>
              <tbody className="divide-y divide-slate-100">
                {servicios.length === 0 && <tr><td colSpan="6" className="table-td text-center text-slate-400 py-4">Sin servicios</td></tr>}
                {servicios.map(s => (
                  <tr key={s.id} className="table-row-hover">
                    <td className="table-td"><Link to={`/servicios/${s.id}`} className="font-mono text-xs text-brand-700">{s.codigo}</Link></td>
                    <td className="table-td text-xs">{s.tipo_servicio?.nombre}</td>
                    <td className="table-td text-xs">{formatFecha(s.fecha_programada)}</td>
                    <td className="table-td text-xs">{s.asignaciones?.map(a => a.tecnico?.nombre).join(', ') || '—'}</td>
                    <td className="table-td"><span className={badgeEstado(s.estado_servicio)}>{s.estado_servicio}</span></td>
                    {puedeVerPrecio && <td className="table-td text-right font-mono">{formatMonto(s.precio_interno, s.moneda)}</td>}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <Bloque titulo={`Emergencias (${emergencias.length})`} vacio="Sin emergencias" count={emergencias.length}>
          <ul className="space-y-2 max-h-64 overflow-y-auto scroll-thin">
            {emergencias.map(e => (
              <li key={e.id} className="text-xs border-l-2 border-rose-200 pl-2">
                <div className="text-slate-700">{e.motivo}</div>
                <div className="text-slate-400 flex items-center justify-between mt-0.5">
                  <span>{formatFechaHora(e.fecha_reporte)} · {e.nivel_urgencia}</span>
                  <span className={badgeEstado(e.estado_emergencia)}>{e.estado_emergencia}</span>
                </div>
                {e.servicio?.codigo && <span className="font-mono text-slate-500">{e.servicio.codigo}</span>}
              </li>
            ))}
          </ul>
        </Bloque>

        <Bloque titulo={`Mantenimientos (${mantenimientos.length})`} vacio="Sin planes" count={mantenimientos.length}>
          <ul className="space-y-2 max-h-64 overflow-y-auto scroll-thin">
            {mantenimientos.map(m => (
              <li key={m.id} className="text-xs border-l-2 border-emerald-200 pl-2">
                <div className="text-slate-700">{m.tipo_servicio?.nombre}</div>
                <div className="text-slate-400">{m.tipo_plan === 'eventual' ? 'Eventual' : `${m.frecuencia} (${m.tipo_plan})`} · Inicio {formatFecha(m.fecha_inicio)}</div>
                <span className={badgeEstado(m.estado_plan)}>{m.estado_plan}</span>
              </li>
            ))}
          </ul>
        </Bloque>

        <Bloque titulo={`Entregas (${entregas.length})`} vacio="Sin entregas" count={entregas.length}>
          <ul className="space-y-2 max-h-64 overflow-y-auto scroll-thin">
            {entregas.map(en => (
              <li key={en.id} className="text-xs">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-mono text-slate-500">{en.servicio?.codigo}</span>
                  <span className={badgeEstado(en.estado_entrega)}>{en.estado_entrega}</span>
                </div>
                <div className="text-slate-700">{en.tipo_entrega}</div>
                <div className="text-slate-400">{formatFecha(en.fecha_entrega)}</div>
                {en.archivo && <FileLink archivo={en.archivo}>Ver</FileLink>}
              </li>
            ))}
          </ul>
        </Bloque>

        <Bloque titulo={`Facturas (${facturas.length})`} vacio="Sin facturas" count={facturas.length}>
          <ul className="space-y-2 max-h-64 overflow-y-auto scroll-thin">
            {facturas.map(f => (
              <li key={f.id} className="text-xs">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-mono">{f.numero_factura}</span>
                  <span className={badgeEstado(f.estado_factura)}>{f.estado_factura}</span>
                </div>
                <div className="text-slate-500 flex items-center justify-between">
                  <span>{f.servicio?.codigo} · {formatFecha(f.fecha_emision)}</span>
                  <span className="font-mono">{formatMonto(f.monto)}</span>
                </div>
                {f.archivo && <FileLink archivo={f.archivo}>Ver</FileLink>}
              </li>
            ))}
          </ul>
        </Bloque>

        <Bloque titulo={`Guías (${guias.length})`} vacio="Sin guías" count={guias.length}>
          <ul className="space-y-2 max-h-64 overflow-y-auto scroll-thin">
            {guias.map(g => (
              <li key={g.id} className="text-xs">
                <div className="font-medium">Guía {g.codigo_guia || '—'} · <span className="font-mono text-slate-500">{g.servicio?.codigo}</span></div>
                <div className="text-slate-400">{formatFechaHora(g.fecha_carga)} · {g.tecnico?.nombre}</div>
                {g.archivo && <FileLink archivo={g.archivo}>Ver archivo</FileLink>}
              </li>
            ))}
          </ul>
        </Bloque>

        <Bloque titulo={`Evidencias (${evidencias.length})`} vacio="Sin evidencias" count={evidencias.length}>
          <ul className="space-y-2 max-h-64 overflow-y-auto scroll-thin">
            {evidencias.map(ev => (
              <li key={ev.id} className="text-xs">
                <div className="font-medium">{ev.tipo_evidencia} · <span className="font-mono text-slate-500">{ev.servicio?.codigo}</span></div>
                <div className="text-slate-400">{formatFechaHora(ev.fecha_carga)} · {ev.tecnico?.nombre}</div>
                {ev.descripcion && <p className="text-slate-600">{ev.descripcion}</p>}
                {ev.archivo && <FileLink archivo={ev.archivo}>Ver archivo</FileLink>}
              </li>
            ))}
          </ul>
        </Bloque>

        <div className="card lg:col-span-3">
          <div className="card-header"><h3 className="card-title">Línea de tiempo</h3></div>
          <ol className="card-body space-y-3 max-h-96 overflow-y-auto scroll-thin">
            {historial.length === 0 && <p className="text-sm text-slate-500">Sin eventos</p>}
            {historial.map(h => (
              <li key={h.id} className="flex gap-3 text-sm">
                <span className="h-2 w-2 rounded-full bg-brand-400 mt-1.5 shrink-0" />
                <div className="flex-1">
                  <div className="text-slate-700">{h.descripcion}</div>
                  <div className="text-xs text-slate-400">{formatFechaHora(h.fecha_evento)} · {h.tipo_evento}</div>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </>
  );
}

function Bloque({ titulo, vacio, children, count }) {
  return (
    <div className="card">
      <div className="card-header"><h3 className="card-title">{titulo}</h3></div>
      <div className="card-body">
        {(count === 0) ? <p className="text-sm text-slate-500">{vacio}</p> : children}
      </div>
    </div>
  );
}

function Info({ label, value, cols = 1 }) {
  return (
    <div className={cols === 2 ? 'col-span-2' : ''}>
      <div className="text-[10px] uppercase tracking-wider text-slate-400">{label}</div>
      <div className="text-slate-800 text-sm">{value || '—'}</div>
    </div>
  );
}
