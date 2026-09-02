import MapaUbicacion from '../common/MapaUbicacion.jsx';
import SeccionColapsable from '../common/SeccionColapsable.jsx';
import { coordsDe, linkGoogleMaps } from '../../utils/mapa.js';
import { formatFecha, badgeEstado } from '../../utils/formatters.js';
import { useClasificaciones } from '../../hooks/useClasificaciones.js';

/**
 * Ficha técnica de un ascensor: lo que el técnico necesita saber del equipo
 * antes de subir a la obra (marca, modelo, capacidad, pisos, cuarto de
 * máquinas, contacto en sitio) y cómo llegar.
 *
 * Vive aquí y no dentro de la pantalla de Ascensores porque se muestra en dos
 * sitios: el historial del ascensor y el detalle del servicio, donde la
 * consultan el técnico asignado y el coordinador. Es la misma ficha en ambos —
 * si se duplicara, uno de los dos se quedaría atrás al añadir un campo.
 *
 * Props:
 *   - ascensor: con su `edificio` incluido
 *   - mostrarMapa: incrusta el mini-mapa además del enlace a Google Maps. El
 *     detalle del servicio lo desactiva porque ya tiene un mapa en su card de
 *     datos y no tiene sentido repetirlo por cada ascensor.
 *   - titulo: encabezado de la tarjeta
 *   - colapsable: convierte la tarjeta en una sección plegable. El detalle del
 *     servicio la activa porque puede mostrar una ficha POR ascensor, y en
 *     móvil tres fichas seguidas son metros de scroll entre el checklist y las
 *     evidencias. El historial del ascensor la deja fija: allí es el contenido.
 *   - className
 */
export default function FichaTecnicaAscensor({
  ascensor,
  mostrarMapa = true,
  titulo = 'Ficha técnica',
  colapsable = false,
  className = 'card'
}) {
  const clasificaciones = useClasificaciones();
  if (!ascensor) return null;

  const clasificacion = ascensor.clasificacion
    ? clasificaciones.find(c => c.codigo === ascensor.clasificacion)
    : null;
  const edificio = ascensor.edificio;
  const coords = coordsDe(edificio);
  const direccion = [edificio?.direccion, edificio?.distrito].filter(Boolean).join(' · ');

  const campos = (
    <div className="card-body grid grid-cols-2 gap-3 text-sm">
        <Info label="Estado" value={
          ascensor.estado_operativo
            ? <span className={badgeEstado(ascensor.estado_operativo)}>{ascensor.estado_operativo}</span>
            : null
        } />
        <Info label="Tipo" value={ascensor.tipo} />
        <Info label="Marca" value={ascensor.marca} />
        <Info label="Modelo" value={ascensor.modelo} />
        <Info label="Capacidad" value={ascensor.capacidad} />
        <Info label="Pisos" value={ascensor.pisos} />
        <Info label="Año" value={ascensor.anio_aproximado} />
        <Info label="Próx. mantenimiento" value={formatFecha(ascensor.proximo_mantenimiento)} />
        {clasificacion && (
          <Info label="Clasificación" cols={2} value={
            <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold ring-1 ${clasificacion.color}`}>
              {clasificacion.etiqueta}
            </span>
          } />
        )}
        <Info label="Ubicación en el edificio" value={ascensor.ubicacion} cols={2} />

        {/* Datos de sitio: lo primero que busca el técnico al llegar. */}
        <Info label="Cuarto de máquinas" value={
          ascensor.cuarto_maquinas
            ? <span className={ascensor.cuarto_maquinas === 'Si' ? 'badge-green' : 'badge-gray'}>
                {ascensor.cuarto_maquinas === 'Si' ? 'Sí' : 'No'}
              </span>
            : null
        } />
        <Info label="Contacto en sitio" value={
          (ascensor.contacto_nombre || ascensor.contacto_telefono)
            ? <div className="space-y-0.5">
                {ascensor.contacto_nombre && <div>{ascensor.contacto_nombre}</div>}
                {ascensor.contacto_telefono && (
                  <a href={`tel:${ascensor.contacto_telefono}`} className="text-brand-700 hover:underline font-mono text-xs">
                    {ascensor.contacto_telefono}
                  </a>
                )}
              </div>
            : null
        } />
        {ascensor.observaciones && <Info label="Observaciones" value={ascensor.observaciones} cols={2} />}

        <div className="col-span-2 border-t border-slate-100 pt-3 mt-1">
          <div className="flex items-center justify-between gap-2 mb-2">
            <div className="text-[10px] uppercase tracking-wider text-slate-400">
              Ubicación del edificio{edificio?.nombre ? ` · ${edificio.nombre}` : ''}
            </div>
            {coords && (
              <a
                href={linkGoogleMaps(coords)}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-brand-700 hover:underline font-medium whitespace-nowrap"
              >
                📍 Abrir en Google Maps ↗
              </a>
            )}
          </div>
          {direccion && <div className="text-sm text-slate-800 mb-2">{direccion}</div>}
          {coords ? (
            mostrarMapa && <MapaUbicacion valor={edificio} alto="200px" mostrarLinkMaps={false} />
          ) : (
            <div className="rounded-lg ring-1 ring-slate-200 bg-slate-50 p-3 text-xs text-slate-500">
              Ubicación no registrada para este edificio.
            </div>
          )}
        </div>
    </div>
  );

  if (colapsable) {
    return (
      <SeccionColapsable
        titulo={titulo}
        className={className === 'card' ? '' : className}
        cuerpo={false}
        resumen={<span className="font-mono text-xs text-brand-700">{ascensor.codigo}</span>}>
        {campos}
      </SeccionColapsable>
    );
  }

  return (
    <div className={className}>
      <div className="card-header">
        <h3 className="card-title">{titulo}</h3>
        <span className="font-mono text-xs text-brand-700">{ascensor.codigo}</span>
      </div>
      {campos}
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
