import { useEffect, useState } from 'react';
import { tecnicosService } from '../../services';
import RangeCalendar from './RangeCalendar.jsx';

// Claves que agregan estos filtros al estado de filtros de la pantalla.
export const FILTROS_EJECUCION_VACIOS = { id_tecnico: '', inicio_desde: '', inicio_hasta: '' };

/**
 * Cuántos filtros hay activos (para PanelFiltros). El rango de inicio cuenta
 * como UN filtro aunque viaje en dos claves.
 */
export function contarFiltrosActivos(filtros) {
  const { inicio_desde, inicio_hasta, ...resto } = filtros;
  return Object.values(resto).filter(Boolean).length + (inicio_desde || inicio_hasta ? 1 : 0);
}

/**
 * Filtros comunes de Emergencias y Correctivos: fecha de INICIO DE EJECUCIÓN
 * (rango en un solo calendario; la primera vez que el servicio pasó a
 * "En curso") y técnico asignado. Los resuelve el backend con
 * utils/filtrosAtencion.js. Son dos celdas de la rejilla del PanelFiltros.
 *
 * El selector solo ofrece usuarios con rol Técnico: la plantilla de técnicos
 * también tiene fichas sin usuario o de otros roles, que no se filtran aquí.
 */
export default function FiltrosEjecucionTecnico({ filtros, setFiltros }) {
  const [tecnicos, setTecnicos] = useState([]);
  useEffect(() => {
    tecnicosService.list({ solo_usuarios_tecnico: 1 }).then(setTecnicos).catch(() => setTecnicos([]));
  }, []);
  const ordenados = [...tecnicos].sort((a, b) => (a.nombre || '').localeCompare(b.nombre || '', 'es'));
  return (
    <>
      <RangeCalendar
        desde={filtros.inicio_desde || ''}
        hasta={filtros.inicio_hasta || ''}
        placeholder="Inicio de ejecución"
        prefijo="Inicio"
        onChange={({ desde, hasta }) => setFiltros(f => ({ ...f, inicio_desde: desde, inicio_hasta: hasta }))}
      />
      <select className="select" value={filtros.id_tecnico || ''}
        onChange={e => setFiltros(f => ({ ...f, id_tecnico: e.target.value }))}>
        <option value="">Todos los técnicos</option>
        {ordenados.map(t => <option key={t.id} value={t.id}>{t.nombre}</option>)}
      </select>
    </>
  );
}
