import { useEffect, useRef, useState } from 'react';
import { useToast } from '../common/Toast.jsx';
import { cuentasBancariasService } from '../../services';

const formVacio = (catalogos) => ({
  nombre: '',
  banco: '',
  tipo_cuenta: catalogos?.tipos_cuenta?.[0]?.codigo || '',
  moneda: catalogos?.monedas?.[0]?.codigo || '',
  numero_cuenta: '',
  cci: '',
  titular: '',
  orden: 0
});

export default function CuentasBancariasPanel() {
  const toast = useToast();
  const [catalogos, setCatalogos] = useState({ tipos_cuenta: [], monedas: [] });
  const [cuentas, setCuentas] = useState([]);
  const [cargando, setCargando] = useState(false);
  const [editandoId, setEditandoId] = useState(null);
  const [form, setForm] = useState(formVacio({}));
  const [guardando, setGuardando] = useState(false);
  const guardandoRef = useRef(false);

  const recargar = async () => {
    setCargando(true);
    try {
      const data = await cuentasBancariasService.list();
      setCuentas(data);
    } finally {
      setCargando(false);
    }
  };

  useEffect(() => {
    cuentasBancariasService.catalogos().then(c => {
      setCatalogos(c);
      setForm(f => ({ ...formVacio(c), ...f, tipo_cuenta: f.tipo_cuenta || c.tipos_cuenta?.[0]?.codigo || '', moneda: f.moneda || c.monedas?.[0]?.codigo || '' }));
    });
    recargar();
  }, []);

  const empezarNueva = () => {
    setEditandoId(null);
    setForm(formVacio(catalogos));
  };

  const empezarEditar = (cuenta) => {
    setEditandoId(cuenta.id);
    setForm({
      nombre: cuenta.nombre || '',
      banco: cuenta.banco,
      tipo_cuenta: cuenta.tipo_cuenta,
      moneda: cuenta.moneda,
      numero_cuenta: cuenta.numero_cuenta,
      cci: cuenta.cci || '',
      titular: cuenta.titular,
      orden: cuenta.orden ?? 0
    });
  };

  const guardar = async (e) => {
    e.preventDefault();
    if (guardandoRef.current) return;
    guardandoRef.current = true;
    setGuardando(true);
    try {
      const payload = {
        ...form,
        nombre: form.nombre?.trim(),
        orden: Number(form.orden) || 0,
        cci: form.cci?.trim() || null
      };
      if (editandoId) {
        await cuentasBancariasService.update(editandoId, payload);
        toast.success('Cuenta actualizada');
      } else {
        await cuentasBancariasService.create(payload);
        toast.success('Cuenta agregada');
      }
      empezarNueva();
      await recargar();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Error al guardar la cuenta');
    } finally {
      guardandoRef.current = false;
      setGuardando(false);
    }
  };

  const eliminar = async (cuenta) => {
    if (!window.confirm(`¿Eliminar la cuenta "${cuenta.nombre}" (${cuenta.banco} · ${cuenta.numero_cuenta})?`)) return;
    try {
      await cuentasBancariasService.remove(cuenta.id);
      toast.success('Cuenta eliminada');
      if (editandoId === cuenta.id) empezarNueva();
      await recargar();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Error al eliminar');
    }
  };

  return (
    <div className="space-y-5">
      <p className="text-xs text-carbon-500">
        Estas cuentas aparecerán en el selector al registrar un pago y en la última página de los PDF de cotización.
      </p>

      <form onSubmit={guardar} className="grid grid-cols-1 sm:grid-cols-2 gap-3 border-b border-carbon-100 pb-4">
        <div className="sm:col-span-2 flex items-center justify-between">
          <h4 className="text-sm font-semibold text-carbon-700">
            {editandoId ? 'Editar cuenta' : 'Nueva cuenta'}
          </h4>
          {editandoId && (
            <button type="button" className="text-xs text-carbon-500 hover:text-carbon-800" onClick={empezarNueva}>
              Cancelar edición
            </button>
          )}
        </div>

        <div className="sm:col-span-2">
          <label className="label">Nombre de la cuenta *</label>
          <input className="input" required maxLength={120} placeholder="Ej. Cuenta principal BCP soles"
            value={form.nombre}
            onChange={e => setForm(f => ({ ...f, nombre: e.target.value }))} />
        </div>
        <div>
          <label className="label">Banco *</label>
          <input className="input" required value={form.banco}
            onChange={e => setForm(f => ({ ...f, banco: e.target.value }))} />
        </div>
        <div>
          <label className="label">Tipo de cuenta *</label>
          <select className="select" required value={form.tipo_cuenta}
            onChange={e => setForm(f => ({ ...f, tipo_cuenta: e.target.value }))}>
            {catalogos.tipos_cuenta.map(t => <option key={t.codigo} value={t.codigo}>{t.etiqueta}</option>)}
          </select>
        </div>
        <div>
          <label className="label">Moneda *</label>
          <select className="select" required value={form.moneda}
            onChange={e => setForm(f => ({ ...f, moneda: e.target.value }))}>
            {catalogos.monedas.map(m => <option key={m.codigo} value={m.codigo}>{m.etiqueta}</option>)}
          </select>
        </div>
        <div>
          <label className="label">Orden de aparición</label>
          <input type="number" step="1" className="input" value={form.orden}
            onChange={e => setForm(f => ({ ...f, orden: e.target.value }))} />
        </div>
        <div>
          <label className="label">Número de cuenta *</label>
          <input className="input" required value={form.numero_cuenta}
            onChange={e => setForm(f => ({ ...f, numero_cuenta: e.target.value }))} />
        </div>
        <div>
          <label className="label">CCI</label>
          <input className="input" value={form.cci}
            onChange={e => setForm(f => ({ ...f, cci: e.target.value }))} />
        </div>
        <div className="sm:col-span-2">
          <label className="label">Titular *</label>
          <input className="input" required value={form.titular}
            onChange={e => setForm(f => ({ ...f, titular: e.target.value }))} />
        </div>

        <div className="sm:col-span-2 flex justify-end">
          <button type="submit" className="btn-primary" disabled={guardando}>
            {guardando ? 'Guardando…' : (editandoId ? 'Actualizar cuenta' : 'Agregar cuenta')}
          </button>
        </div>
      </form>

      <div>
        <h4 className="text-sm font-semibold text-carbon-700 mb-2">Cuentas registradas</h4>
        {cargando ? (
          <div className="text-sm text-carbon-500">Cargando…</div>
        ) : cuentas.length === 0 ? (
          <div className="text-sm text-carbon-500">Aún no hay cuentas registradas.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="table-base">
              <thead>
                <tr>
                  <th className="table-th text-center">Orden</th>
                  <th className="table-th">Nombre</th>
                  <th className="table-th">Banco</th>
                  <th className="table-th">Tipo / Moneda</th>
                  <th className="table-th">N° de cuenta</th>
                  <th className="table-th">CCI</th>
                  <th className="table-th">Titular</th>
                  <th className="table-th text-right">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-carbon-100">
                {cuentas.map(c => (
                  <tr key={c.id} className="table-row-hover">
                    <td className="table-td text-xs text-center">{c.orden}</td>
                    <td className="table-td text-xs font-medium">{c.nombre}</td>
                    <td className="table-td text-xs">{c.banco}</td>
                    <td className="table-td text-xs">{c.tipo_cuenta} · {c.moneda}</td>
                    <td className="table-td text-xs font-mono">{c.numero_cuenta}</td>
                    <td className="table-td text-xs font-mono">{c.cci || '—'}</td>
                    <td className="table-td text-xs">{c.titular}</td>
                    <td className="table-td text-right whitespace-nowrap">
                      <button type="button" onClick={() => empezarEditar(c)}
                        className="btn-ghost text-xs !py-1 !px-2 mr-1">Editar</button>
                      <button type="button" onClick={() => eliminar(c)}
                        className="text-xs text-red-600 hover:underline">Eliminar</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
