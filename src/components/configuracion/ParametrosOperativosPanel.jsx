import { useEffect, useState } from 'react';
import { useToast } from '../common/Toast.jsx';
import { configuracionService } from '../../services';
import { useAuth } from '../../features/auth/AuthContext.jsx';

/**
 * Parámetros operativos editables desde Configuración.
 *
 * Hoy expone el plazo de cierre del servicio (SERVICIO_CIERRE_PLAZO_DIAS): los
 * días calendario que tiene el técnico, desde el último día programado, para
 * registrar el cierre. Vencido el plazo el técnico queda bloqueado y el super
 * administrador debe habilitar el cierre de ese servicio desde su detalle.
 *
 * Solo el super administrador edita; el resto lo ve en modo lectura.
 */
const PARAMETROS = [
  {
    clave: 'SERVICIO_CIERRE_PLAZO_DIAS',
    etiqueta: 'Plazo de cierre del servicio (días)',
    ayuda: 'Días calendario que tiene el técnico, contados desde el último día programado del servicio, para registrar el cierre. '
      + 'Pasado el plazo solo puede cerrar si el super administrador habilita ese servicio. '
      + 'La alerta de cotización urgente del calendario se agenda siempre en la fecha programada del servicio, no en la fecha real de cierre.',
    tipo: 'number',
    min: 0,
    max: 365
  }
];

export default function ParametrosOperativosPanel() {
  const toast = useToast();
  const { esSuperAdmin } = useAuth();
  const [valores, setValores] = useState({});
  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(null); // clave que se está guardando

  useEffect(() => {
    let vivo = true;
    Promise.all(PARAMETROS.map(p => configuracionService.get(p.clave).catch(() => null)))
      .then(res => {
        if (!vivo) return;
        const mapa = {};
        res.forEach((r, i) => { mapa[PARAMETROS[i].clave] = r?.valor ?? ''; });
        setValores(mapa);
      })
      .finally(() => { if (vivo) setCargando(false); });
    return () => { vivo = false; };
  }, []);

  const guardar = async (p) => {
    const valor = String(valores[p.clave] ?? '').trim();
    if (p.tipo === 'number') {
      const n = Number(valor);
      if (!Number.isFinite(n) || n < p.min || n > p.max) {
        return toast.error(`${p.etiqueta}: ingresa un número entre ${p.min} y ${p.max}`);
      }
    }
    setGuardando(p.clave);
    try {
      await configuracionService.update(p.clave, valor);
      toast.success('Parámetro actualizado');
    } catch (err) {
      toast.error(err.response?.data?.error || 'Error al guardar el parámetro');
    } finally {
      setGuardando(null);
    }
  };

  if (cargando) return <div className="text-sm text-carbon-500">Cargando parámetros…</div>;

  return (
    <div className="space-y-4">
      {PARAMETROS.map(p => (
        <div key={p.clave}>
          <label className="label">{p.etiqueta}</label>
          <div className="flex items-start gap-2">
            <input
              type={p.tipo === 'number' ? 'number' : 'text'}
              min={p.min}
              max={p.max}
              className="input w-32"
              disabled={!esSuperAdmin}
              value={valores[p.clave] ?? ''}
              onChange={e => setValores(v => ({ ...v, [p.clave]: e.target.value }))}
            />
            {esSuperAdmin && (
              <button type="button" onClick={() => guardar(p)} disabled={guardando === p.clave}
                className="btn-primary disabled:opacity-50">
                {guardando === p.clave ? 'Guardando…' : 'Guardar'}
              </button>
            )}
          </div>
          <p className="text-[11px] text-carbon-500 mt-1 max-w-3xl">{p.ayuda}</p>
          {!esSuperAdmin && (
            <p className="text-[11px] text-carbon-400 mt-1">Solo el super administrador puede modificar este parámetro.</p>
          )}
        </div>
      ))}
    </div>
  );
}
