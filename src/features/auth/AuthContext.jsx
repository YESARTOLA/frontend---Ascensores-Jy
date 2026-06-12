import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { authService } from '../../services';
import { tieneAcceso } from './alcance.js';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    try { return JSON.parse(localStorage.getItem('ajy_user') || 'null'); } catch { return null; }
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem('ajy_token');
    if (!token) { setLoading(false); return; }
    authService.me()
      .then(({ usuario }) => {
        if (usuario) {
          setUser(usuario);
          localStorage.setItem('ajy_user', JSON.stringify(usuario));
        }
      })
      .catch(() => {
        localStorage.removeItem('ajy_token');
        localStorage.removeItem('ajy_user');
        setUser(null);
      })
      .finally(() => setLoading(false));
  }, []);

  const login = async (correo, contrasena) => {
    const r = await authService.login(correo, contrasena);
    localStorage.setItem('ajy_token', r.token);
    localStorage.setItem('ajy_user', JSON.stringify(r.usuario));
    setUser(r.usuario);
    return r;
  };

  const logout = async () => {
    try { await authService.logout(); } catch {}
    localStorage.removeItem('ajy_token');
    localStorage.removeItem('ajy_user');
    setUser(null);
  };

  const rol = user?.rol_codigo;
  const value = useMemo(() => ({
    user, loading, login, logout, rol,
    esSuperAdmin: rol === 'super_admin',
    esAdmin: rol === 'admin',
    esCoordinador: rol === 'coordinador',
    esTecnico: rol === 'tecnico',
    esContabilidad: rol === 'contabilidad',
    esVendedora: rol === 'vendedora',
    puedeVerPrecio: ['super_admin', 'admin', 'contabilidad'].includes(rol),
    // Ámbito (Servicios/Proyectos) del usuario. Roles sin alcance → ambos true.
    accesoServicios: tieneAcceso(user, 'servicios'),
    accesoProyectos: tieneAcceso(user, 'proyectos')
  }), [user, loading, rol]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);
