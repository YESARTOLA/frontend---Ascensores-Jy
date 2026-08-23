import { useState } from 'react';
import { Link } from 'react-router-dom';
import { assetUrl } from '../../services';
import PageHeader from '../common/PageHeader.jsx';
import { badgeEstado, formatFecha, nombreEdificioDeAscensores } from '../../utils/formatters.js';

/**
 * Vista de una cotización para roles SIN visibilidad financiera (Coordinador).
 *
 * Muestra ÚNICAMENTE el ALCANCE de lo cotizado: los ítems con su foto, que es
 * lo que hace falta para coordinar y ejecutar el trabajo. No hay precios
 * unitarios, descuentos, importes, subtotal, IGV, total, plan de cuotas,
 * cuentas bancarias, PDF ni NINGÚN archivo adjunto de la cotización —tampoco
 * los que son imágenes—: esos adjuntos son el expediente comercial del acuerdo
 * (cotización firmada, orden de compra, presupuestos). El backend directamente
 * no los envía (utils/visibilidadFinanzas.js → cotizacionSinFinanzas), así que
 * aquí no hay nada que ocultar y nada puede colarse por un condicional olvidado.
 *
 * Se entra por el código de cotización del servicio, no por el módulo: el
 * listado de Cotizaciones sigue fuera del alcance del rol.
 */
export default function CotizacionSinFinanzas({ cot, version, verActivaNum, onVersion, volver, volverLabel, onVolver }) {
  const [tab, setTab] = useState('items');
  const servicioGen = cot.servicios?.[0];
  const items = version.items || [];

  return (
    <>
      <PageHeader
        title={cot.codigo}
        subtitle={`${cot.cliente?.nombre || ''} • ${cot.subtipo_servicio?.nombre || cot.tipo_servicio?.nombre || ''}`}
        actions={
          volver
            ? <Link to={volver} className="btn-secondary text-xs !py-1.5 !px-3">← {volverLabel || 'Volver'}</Link>
            : <button type="button" onClick={onVolver} className="btn-secondary text-xs !py-1.5 !px-3">← Volver</button>
        }
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="card p-4 lg:col-span-2 space-y-3">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-bold text-carbon-900">{nombreEdificioDeAscensores(cot)}</h2>
              {cot.descripcion && <p className="text-sm text-carbon-600 mt-1">{cot.descripcion}</p>}
            </div>
            <div className="flex flex-col items-end gap-1">
              <span className={`badge ${badgeEstado(cot.estado_global)}`}>{cot.estado_global}</span>
              <span className={`badge ${badgeEstado(version.estado_version)}`}>v{version.numero_version} — {version.estado_version}</span>
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-sm pt-2 border-t border-carbon-100">
            <div>
              <div className="text-xs text-carbon-500">Cliente</div>
              <div className="font-medium">{cot.cliente?.nombre || '—'}</div>
            </div>
            <div>
              <div className="text-xs text-carbon-500">
                {cot.ascensores?.length > 1 ? `Ascensores (${cot.ascensores.length})` : 'Ascensor'}
              </div>
              {cot.ascensores?.length > 0 ? (
                <div className="space-y-0.5">
                  {cot.ascensores.map(a => (
                    <div key={a.id} className="text-sm">
                      {a.ascensor
                        ? <span className="font-medium">{a.ascensor.codigo}</span>
                        : <span className="text-amber-700">Por instalar{a.ascensor_nuevo?.ubicacion ? ` · ${a.ascensor_nuevo.ubicacion}` : ''}</span>}
                    </div>
                  ))}
                </div>
              ) : <div className="text-carbon-400">—</div>}
            </div>
            <div>
              <div className="text-xs text-carbon-500">Enviada</div>
              <div>{version.fecha_envio ? formatFecha(version.fecha_envio) : '—'}</div>
            </div>
          </div>

          {servicioGen && (
            <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-3 text-sm flex items-center justify-between">
              <div>
                <div className="text-xs text-emerald-700 uppercase tracking-wide">Servicio generado</div>
                <Link to={`/servicios/${servicioGen.id}`} className="font-mono text-emerald-800 hover:underline">{servicioGen.codigo}</Link>
                <span className="ml-2 text-emerald-700">{servicioGen.estado_servicio}</span>
              </div>
              <Link to={`/servicios/${servicioGen.id}`} className="btn-ghost text-xs !py-1.5 !px-3">Abrir servicio</Link>
            </div>
          )}

          <div className="rounded-md bg-ivory-50 ring-1 ring-carbon-200 text-carbon-600 p-2.5 text-xs">
            Vista sin información económica: se muestran el alcance de lo cotizado y sus imágenes. Los importes los gestiona el área comercial.
          </div>
        </div>

        <div className="card p-4">
          <div className="text-sm font-bold text-carbon-700 mb-2">Versiones</div>
          <div className="space-y-1.5">
            {cot.versiones.map(v => (
              <button key={v.id} type="button" onClick={() => onVersion(v.numero_version)}
                className={`w-full text-left px-3 py-2 rounded-md border text-sm transition ${v.numero_version === verActivaNum
                  ? 'border-brand-300 bg-brand-50' : 'border-carbon-100 hover:bg-ivory-50'}`}>
                <div className="flex items-center justify-between">
                  <span className="font-medium">v{v.numero_version}</span>
                  <span className={`badge text-xs ${badgeEstado(v.estado_version)}`}>{v.estado_version}</span>
                </div>
                {v.motivo_cambio && <div className="text-xs text-carbon-400 italic mt-1 line-clamp-2">"{v.motivo_cambio}"</div>}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="mt-4 card">
        <div className="border-b border-carbon-100 flex overflow-x-auto">
          {[
            ['items', `Ítems${items.length ? ` (${items.length})` : ''}`]
          ].map(([k, l]) => (
            <button key={k} type="button" onClick={() => setTab(k)}
              className={`px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition ${tab === k
                ? 'border-brand-600 text-brand-700' : 'border-transparent text-carbon-500 hover:text-carbon-800'}`}>
              {l}
            </button>
          ))}
        </div>

        {tab === 'items' && (
          <div className="p-4">
            {items.length === 0 ? (
              <div className="text-center py-8 text-carbon-400 italic">Esta versión no tiene ítems</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="table-base">
                  <thead>
                    <tr>
                      <th className="table-th w-10">#</th>
                      <th className="table-th w-16">Foto</th>
                      <th className="table-th">Descripción</th>
                      <th className="table-th text-right w-24">Cant.</th>
                      <th className="table-th w-24">Unidad</th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((it, i) => (
                      <tr key={it.id} className="table-row-hover">
                        <td className="table-td">{i + 1}</td>
                        <td className="table-td">
                          {it.archivo
                            ? <a href={assetUrl(it.archivo.ruta_almacenamiento)} target="_blank" rel="noreferrer" title="Ver foto">
                                <img src={assetUrl(it.archivo.ruta_almacenamiento)} alt="foto"
                                     className="h-10 w-10 object-cover rounded ring-1 ring-slate-200 hover:ring-brand-300" />
                              </a>
                            : <span className="text-slate-400 text-xs">—</span>}
                        </td>
                        <td className="table-td">{it.descripcion}</td>
                        <td className="table-td text-right">{Number(it.cantidad).toFixed(2)}</td>
                        <td className="table-td">{it.unidad}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {version.garantia && (
              <div className="mt-4 p-3 bg-ivory-50 rounded text-sm">
                <div className="text-xs text-carbon-500 uppercase mb-1">Garantía</div>
                <div className="whitespace-pre-line">{version.garantia}</div>
              </div>
            )}
            {version.observaciones && (
              <div className="mt-4 p-3 bg-ivory-50 rounded text-sm">
                <div className="text-xs text-carbon-500 uppercase mb-1">Observaciones</div>
                <div>{version.observaciones}</div>
              </div>
            )}
          </div>
        )}

      </div>
    </>
  );
}
