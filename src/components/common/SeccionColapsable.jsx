import { useState } from 'react';
import { useEsMovil } from '../../hooks/useMediaQuery.js';

/**
 * Tarjeta con cabecera plegable.
 *
 * El detalle de un servicio apila una docena de tarjetas: en el teléfono son
 * casi cinco mil píxeles de scroll para llegar del encabezado al historial.
 * Plegando lo que no se usa en obra, el técnico ve el índice completo de la
 * pantalla en una pantalla y abre solo lo que necesita.
 *
 * El estado inicial se decide por tamaño, no por gusto: en móvil se abren solo
 * las secciones con las que se trabaja (datos del sitio, checklist, evidencias)
 * y en escritorio —donde el espacio sobra y hay tres columnas— todo sigue
 * abierto como antes. La primera interacción del usuario manda sobre ambos.
 *
 * `resumen` es lo que sigue viéndose con la sección plegada: un contador, un
 * badge de "Sin OT". Sin él, plegar escondería información que se leía de un
 * vistazo, que es justo lo que no se quiere.
 *
 * Props:
 *  - titulo            : texto de la cabecera.
 *  - resumen           : nodo junto al título, visible también plegada.
 *  - acciones          : nodo a la derecha; solo se muestra con la sección abierta.
 *  - inicialMovil      : 'abierta' | 'cerrada'  (por defecto 'cerrada')
 *  - inicialEscritorio : 'abierta' | 'cerrada'  (por defecto 'abierta')
 *  - cuerpo            : false para que el contenido NO lleve el padding de
 *                        `.card-body` (listas y tablas que ya traen el suyo).
 *  - variante          : 'card' (tarjeta propia) o 'plano' (bloque separado por
 *                        una línea, para apilar dentro de un modal o de otra
 *                        tarjeta, donde una card anidada se vería como un error).
 */
export default function SeccionColapsable({
  titulo,
  resumen,
  acciones,
  children,
  inicialMovil = 'cerrada',
  inicialEscritorio = 'abierta',
  cuerpo = true,
  variante = 'card',
  className = ''
}) {
  const esMovil = useEsMovil();
  // `null` = el usuario aún no ha tocado nada: manda el valor por tamaño.
  const [abiertaUsuario, setAbiertaUsuario] = useState(null);
  const porDefecto = (esMovil ? inicialMovil : inicialEscritorio) === 'abierta';
  const abierta = abiertaUsuario ?? porDefecto;
  const plano = variante === 'plano';

  return (
    <div className={`${plano ? 'border-t border-slate-100 pt-2' : 'card'} ${className}`}>
      {/* En móvil el título y las acciones van en FILAS distintas.
          Compartiendo fila, el título (que puede encogerse) cedía todo su ancho
          a los botones y acababa partido palabra por palabra —"Evidencias" / "·"
          / "Antes"— con los botones montados encima. A partir de `sm` vuelven a
          la misma línea, donde sí caben. */}
      <div className={plano
        ? 'flex flex-col sm:flex-row sm:flex-wrap sm:items-center sm:justify-between gap-2 py-1'
        : 'px-4 sm:px-5 py-3.5 sm:py-4 border-b border-carbon-100/80 flex flex-col sm:flex-row sm:flex-wrap sm:items-center sm:justify-between gap-2 sm:gap-3'}>
        <button
          type="button"
          onClick={() => setAbiertaUsuario(!abierta)}
          aria-expanded={abierta}
          // `flex-wrap` interno: con un título largo y dos badges de resumen, el
          // resumen baja a una segunda línea en vez de recortar el título, que
          // es lo que hace útil la cabecera cuando la sección está plegada.
          className="flex flex-wrap items-center gap-x-2 gap-y-1 w-full sm:w-auto sm:flex-1 min-w-0 text-left min-h-[32px] rounded-lg -mx-1 px-1 transition active:bg-carbon-100/60">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6"
               strokeLinecap="round" strokeLinejoin="round"
               className={`shrink-0 text-carbon-400 transition-transform duration-200 ${abierta ? 'rotate-90' : ''}`}>
            <polyline points="9 18 15 12 9 6" />
          </svg>
          {plano
            ? <h4 className="font-medium text-slate-800 text-sm min-w-0">{titulo}</h4>
            : <h3 className="card-title min-w-0">{titulo}</h3>}
          {resumen && <span className="shrink-0 flex flex-wrap items-center gap-1.5">{resumen}</span>}
        </button>
        {/* Las acciones desaparecen con la sección plegada: pertenecen a lo que
            hay dentro, y dejarlas sueltas invita a tocarlas sin ver el contexto. */}
        {abierta && acciones && (
          <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">{acciones}</div>
        )}
      </div>
      {/* Se OCULTA, no se desmonta: así no se pierde un comentario a medio
          escribir ni se repiten las peticiones de los paneles que cargan solos. */}
      <div className={`${abierta ? '' : 'hidden'} ${cuerpo ? (plano ? 'pt-2' : 'card-body') : ''}`}>
        {children}
      </div>
    </div>
  );
}
