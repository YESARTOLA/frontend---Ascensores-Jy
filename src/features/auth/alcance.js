/**
 * SSoT de ALCANCE en el frontend (espejo de backend/utils/alcanceUsuario.js).
 *
 * Los roles Administrador y Coordinador pueden estar acotados a los ámbitos
 * Servicios y/o Proyectos mediante los flags `acceso_servicios` /
 * `acceso_proyectos` del usuario. El resto de roles no se acota.
 *
 * Se usa para ocultar módulos en el menú y bloquear rutas; el backend aplica el
 * filtrado real de datos.
 */

// Único lugar donde se define qué roles tienen alcance configurable.
export const ROLES_CON_ALCANCE = ['admin', 'coordinador'];

// Ámbito de la UI → flag del usuario.
const FLAG_POR_AMBITO = { servicios: 'acceso_servicios', proyectos: 'acceso_proyectos' };

export function esRolConAlcance(rol) {
  return ROLES_CON_ALCANCE.includes(rol);
}

/**
 * ¿El usuario tiene acceso al ámbito indicado ('servicios' | 'proyectos')?
 * - Roles sin alcance → siempre true.
 * - Flag ausente (sesión previa a esta función) → true, para no bloquear.
 */
export function tieneAcceso(user, ambito) {
  if (!user) return false;
  if (!esRolConAlcance(user.rol_codigo)) return true;
  return Number(user[FLAG_POR_AMBITO[ambito]]) !== 0;
}
