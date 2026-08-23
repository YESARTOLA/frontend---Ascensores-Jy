// Helpers compartidos para formularios de asignación de técnicos.
// Centraliza:
//  - Auto-desmarcado del 'responsable_principal' en las demás filas (regla: un solo principal por servicio).
//  - Validación de consistencia previa al submit (toast).
//
// Consumidores:
//  - ServicioDetalle.jsx (Asignar técnicos)
//  - Emergencias.jsx     (Nueva emergencia)
//  - Correctivos.jsx     (Nuevo correctivo)

export function actualizarFilaAsignacion(asignaciones, idx, key, val) {
  return asignaciones.map((fila, i) => {
    if (i === idx) return { ...fila, [key]: val };
    if (key === 'responsable_principal' && val) return { ...fila, responsable_principal: false };
    return fila;
  });
}

// Devuelve los técnicos seleccionables para la fila `idx`: todos los del catálogo
// EXCEPTO los que ya están elegidos en otras filas. La selección actual de la fila
// sigue visible para que el <select> pueda mostrarla.
export function tecnicosDisponiblesPara(asignaciones, catalogoTecnicos, idx) {
  const ocupados = new Set(
    asignaciones
      .map((a, i) => (i !== idx && a.id_tecnico ? Number(a.id_tecnico) : null))
      .filter(v => v !== null)
  );
  return catalogoTecnicos.filter(t => !ocupados.has(Number(t.id)));
}

export function validarConsistenciaAsignaciones(tecnicos, { requerirAlMenosUno = false } = {}) {
  if (!Array.isArray(tecnicos) || tecnicos.length === 0) {
    if (requerirAlMenosUno) return { ok: false, error: 'Agregue al menos un técnico' };
    return { ok: true };
  }
  if (tecnicos.some(t => !t.id_tecnico)) {
    return { ok: false, error: 'Seleccione técnico en todas las filas' };
  }
  const ids = tecnicos.map(t => Number(t.id_tecnico));
  if (new Set(ids).size !== ids.length) {
    return { ok: false, error: 'No puede asignar el mismo técnico más de una vez' };
  }
  if (tecnicos.length > 1 && !tecnicos.some(t => t.responsable_documentacion)) {
    return { ok: false, error: 'Si hay varios técnicos, marque un responsable documental' };
  }
  if (tecnicos.filter(t => t.responsable_principal).length > 1) {
    return { ok: false, error: 'Solo puede haber un técnico principal' };
  }
  return { ok: true };
}
