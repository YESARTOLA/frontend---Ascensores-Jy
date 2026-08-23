import { useEffect, useState } from 'react';
import { leadsService } from '../../services';

// Aviso de prospecto ya registrado. Consulta /leads/duplicados mientras se
// llena el formulario y muestra CON QUIÉN choca cada dato, para que el usuario
// abra el lead o el cliente que ya existe en vez de duplicarlo.
//
// Se monta como `banner` del Modal: queda fijo bajo la cabecera, fuera del área
// que scrollea, porque un aviso que bloquea el guardado no puede quedar al pie
// de un formulario largo.
//
// Es solo informativo: quien bloquea el guardado es el backend (409), que
// vuelve a comprobarlo con los datos definitivos.

// Espera antes de consultar: evita una llamada por cada tecla.
const RETARDO_MS = 500;

// Un mismo registro puede chocar por varios campos a la vez (p. ej. mismo
// teléfono y mismo nombre): se agrupa por lead/cliente y se listan sus campos.
function agrupar(coincidencias) {
  const mapa = new Map();
  for (const c of coincidencias) {
    const clave = `${c.origen}-${c.id}`;
    if (!mapa.has(clave)) mapa.set(clave, { ...c, campos: [] });
    mapa.get(clave).campos.push(c.campo_etiqueta);
  }
  return [...mapa.values()];
}

// Al EDITAR solo se comprueban los datos que la edición cambia: un lead que ya
// coincidía con otro registro (cartera histórica, o el cliente creado al
// convertirlo) debe poder seguir corrigiéndose. Es el mismo criterio que aplica
// el backend al guardar.
const sinCambiar = (actual, original) =>
  original !== undefined && String(actual ?? '').trim() === String(original ?? '').trim();

export default function AvisoDuplicados({ telefono, nombre, razonSocial, documento, excluirId, original, onCambio }) {
  const [coincidencias, setCoincidencias] = useState([]);
  const orig = original || {};
  // Un campo que no cambió no se consulta: se manda vacío.
  const aConsultar = {
    telefono: sinCambiar(telefono, orig.telefono) ? '' : (telefono || ''),
    nombre: sinCambiar(nombre, orig.nombre) ? '' : (nombre || ''),
    razonSocial: sinCambiar(razonSocial, orig.razonSocial) ? '' : (razonSocial || ''),
    documento: sinCambiar(documento, orig.documento) ? '' : (documento || '')
  };

  useEffect(() => {
    const { telefono, nombre, razonSocial, documento } = aConsultar;
    const hayAlgoQueBuscar = [telefono, nombre, razonSocial, documento].some(v => (v || '').trim().length >= 3);
    if (!hayAlgoQueBuscar) {
      setCoincidencias([]);
      onCambio?.([]);
      return;
    }
    let vigente = true;
    const t = setTimeout(() => {
      leadsService.duplicados({
        telefono: telefono || '', nombre: nombre || '',
        razon_social: razonSocial || '', documento: documento || '',
        ...(excluirId ? { excluir_id: excluirId } : {})
      })
        .then(r => { if (vigente) { setCoincidencias(r || []); onCambio?.(r || []); } })
        // Un fallo de red aquí no debe estorbar: el backend igual bloquea al guardar.
        .catch(() => { if (vigente) { setCoincidencias([]); onCambio?.([]); } });
    }, RETARDO_MS);
    return () => { vigente = false; clearTimeout(t); };
    // onCambio se omite a propósito: cambia en cada render del padre.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aConsultar.telefono, aConsultar.nombre, aConsultar.razonSocial, aConsultar.documento, excluirId]);

  if (coincidencias.length === 0) return null;
  const grupos = agrupar(coincidencias);

  return (
    <div className="rounded-lg border border-rose-300 bg-rose-50 p-3" role="alert">
      <div className="flex items-start gap-2.5">
        <svg className="h-5 w-5 shrink-0 text-rose-600 mt-px" viewBox="0 0 24 24" fill="none"
             stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
          <path d="M12 9v4" /><path d="M12 17h.01" />
          <path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" />
        </svg>
        <div className="min-w-0">
          <p className="text-sm font-bold text-rose-800">
            Este prospecto ya está registrado — no se puede guardar
          </p>
          {/* La lista se acota en alto: con muchas coincidencias la banda no
              debe empujar el formulario fuera de la pantalla. */}
          <ul className="mt-1.5 space-y-1 max-h-28 overflow-y-auto scroll-thin pr-1">
            {grupos.map(g => (
              <li key={`${g.origen}-${g.id}`} className="text-xs text-slate-700">
                <span className="font-semibold">
                  {g.origen === 'lead' ? 'Lead' : 'Cliente'} #{g.id} · {g.nombre || 'Sin nombre'}
                </span>
                {g.detalle && <span className="text-slate-500"> ({g.detalle})</span>}
                <span className="text-rose-700"> — coincide en {[...new Set(g.campos)].join(' y ')}</span>
              </li>
            ))}
          </ul>
          <p className="text-[11px] text-slate-500 mt-1.5">
            Trabaje ese registro desde la lista. Si de verdad es otro prospecto, corrija el dato que coincide.
          </p>
        </div>
      </div>
    </div>
  );
}
