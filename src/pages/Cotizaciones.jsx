import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  cotizacionesService,
  clientesService,
  edificiosService,
  ascensoresService,
  tiposServicioService,
  configuracionService,
  archivosService,
  assetUrl
} from '../services';
import PageHeader from '../components/common/PageHeader.jsx';
import Loader from '../components/common/Loader.jsx';
import Modal from '../components/common/Modal.jsx';
import EmptyState from '../components/common/EmptyState.jsx';
import Pagination, { usePaginatedList } from '../components/common/Pagination.jsx';
import { useToast } from '../components/common/Toast.jsx';
import { useAuth } from '../features/auth/AuthContext.jsx';
import ClienteAutocomplete from '../components/common/ClienteAutocomplete.jsx';
import { badgeEstado, formatFecha, formatMonto, hoyISO, addDaysYMD } from '../utils/formatters.js';
import CuotasEditor, { planCuotasInicial, planParaPayload } from '../components/cotizaciones/CuotasEditor.jsx';

const ESTADOS_GLOBALES = ['', 'Cotizado', 'Aceptado', 'Ejecución', 'Pendiente', 'Terminado'];

const itemVacio = () => ({
  descripcion: '',
  cantidad: 1,
  unidad: 'Unidad',
  precio_unitario: 0,
  descuento_porcentaje: 0
});

const ascensorVacio = (modo = 'existente') => ({
  modo, // 'existente' | 'nuevo'
  id_ascensor: '',
  // Un ascensor nuevo se instala en un edificio del cliente (id_edificio).
  ascensor_nuevo: { id_edificio: '', ubicacion: '', pisos: '', capacidad: '', marca: '', modelo: '', descripcion: '' }
});

const formInicial = (preset = {}) => ({
  id_cliente: preset.id_cliente || '',
  id_lead: preset.id_lead || null,
  ascensores: [ascensorVacio()],
  id_tipo_servicio: preset.id_tipo_servicio || '',
  descripcion: '',
  fecha_validez: '',
  moneda: 'PEN',
  observaciones: '',
  items: [itemVacio()],
  cuotas: planCuotasInicial(),
  archivos: []
});

function round2(n) {
  return Math.round((Number(n) + Number.EPSILON) * 100) / 100;
}

function calcImporte(it) {
  const cant = Number(it.cantidad) || 0;
  const pu = Number(it.precio_unitario) || 0;
  const desc = Number(it.descuento_porcentaje) || 0;
  return round2(cant * pu * (1 - desc / 100));
}

export default function Cotizaciones() {
  const [clientes, setClientes] = useState([]);
  const [ascensores, setAscensores] = useState([]);
  const [edificiosCliente, setEdificiosCliente] = useState([]);
  const [tipos, setTipos] = useState([]);
  const [igvTasa, setIgvTasa] = useState(0.18);
  const [validezDefaultDias, setValidezDefaultDias] = useState(15);
  const [filtros, setFiltros] = useState({ q: '', estado_global: '', id_cliente: '', id_tipo_servicio: '', desde: '', hasta: '' });
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(formInicial);
  const [saving, setSaving] = useState(false);
  const [subiendoAdjuntos, setSubiendoAdjuntos] = useState(false);
  const { esSuperAdmin, esAdmin } = useAuth();
  const puedeCrear = esSuperAdmin || esAdmin;
  const toast = useToast();

  const [searchParams, setSearchParams] = useSearchParams();

  const { data, loading, total, page, pageSize, totalPages, setPage, setPageSize, recargar } =
    usePaginatedList(cotizacionesService.paginate, filtros, { initialPageSize: 25 });

  // Abre modal automáticamente si llega ?nuevo=1, con preselección del lead/cliente.
  useEffect(() => {
    if (searchParams.get('nuevo') === '1' && puedeCrear) {
      setForm({
        ...formInicial({
          id_cliente: searchParams.get('id_cliente') || '',
          id_lead: searchParams.get('id_lead') ? Number(searchParams.get('id_lead')) : null,
          id_tipo_servicio: searchParams.get('id_tipo_servicio') || ''
        }),
        fecha_validez: addDaysYMD(null, validezDefaultDias)
      });
      setOpen(true);
      // limpia los params para que recargar la página no reabra el modal
      const next = new URLSearchParams(searchParams);
      ['nuevo', 'id_cliente', 'id_lead', 'id_tipo_servicio'].forEach(k => next.delete(k));
      setSearchParams(next, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, puedeCrear, validezDefaultDias]);

  useEffect(() => {
    Promise.all([
      clientesService.list(),
      ascensoresService.list(),
      tiposServicioService.list(),
      configuracionService.get('IGV_RATE').catch(() => ({ valor: 0.18 })),
      configuracionService.get('COTIZACION_VALIDEZ_DIAS').catch(() => ({ valor: 15 }))
    ]).then(([cs, as, ts, igv, val]) => {
      setClientes(cs);
      setAscensores(as);
      setTipos(ts);
      setIgvTasa(Number(igv.valor) || 0.18);
      setValidezDefaultDias(Number(val.valor) || 15);
    });
  }, []);

  const abrirModal = () => {
    setForm({ ...formInicial(), fecha_validez: addDaysYMD(null, validezDefaultDias) });
    setOpen(true);
  };

  const ascensoresDelCliente = form.id_cliente
    ? ascensores.filter(a => String(a.edificio?.cliente?.id) === String(form.id_cliente))
    : [];

  // Edificios del cliente elegido (para colocar ascensores nuevos).
  useEffect(() => {
    if (!form.id_cliente) { setEdificiosCliente([]); return; }
    let vivo = true;
    edificiosService.list({ id_cliente: form.id_cliente }).then(d => { if (vivo) setEdificiosCliente(d || []); }).catch(() => { if (vivo) setEdificiosCliente([]); });
    return () => { vivo = false; };
  }, [form.id_cliente]);

  const cambiarItem = (idx, key, val) => {
    setForm(f => ({
      ...f,
      items: f.items.map((it, i) => i === idx ? { ...it, [key]: val } : it)
    }));
  };
  const agregarItem = () => setForm(f => ({ ...f, items: [...f.items, itemVacio()] }));
  const quitarItem = (idx) => setForm(f => ({ ...f, items: f.items.filter((_, i) => i !== idx) }));

  const cambiarAscensor = (idx, key, val) => {
    setForm(f => ({
      ...f,
      ascensores: f.ascensores.map((a, i) => i === idx ? { ...a, [key]: val } : a)
    }));
  };
  const cambiarAscensorNuevo = (idx, key, val) => {
    setForm(f => ({
      ...f,
      ascensores: f.ascensores.map((a, i) => i === idx
        ? { ...a, ascensor_nuevo: { ...a.ascensor_nuevo, [key]: val } }
        : a)
    }));
  };
  const agregarAscensor = () => setForm(f => ({ ...f, ascensores: [...f.ascensores, ascensorVacio()] }));
  const quitarAscensor = (idx) => setForm(f => ({
    ...f,
    ascensores: f.ascensores.length > 1 ? f.ascensores.filter((_, i) => i !== idx) : f.ascensores
  }));

  const subirAdjuntos = async (e) => {
    const files = Array.from(e.target.files || []);
    e.target.value = '';
    if (files.length === 0) return;
    setSubiendoAdjuntos(true);
    try {
      const nuevos = [];
      for (const file of files) {
        const fd = new FormData();
        fd.append('archivo', file);
        const arch = await archivosService.upload(fd, 'cotizaciones');
        nuevos.push(arch);
      }
      setForm(f => ({ ...f, archivos: [...f.archivos, ...nuevos] }));
      toast.success(`${nuevos.length} archivo(s) adjuntado(s)`);
    } catch {
      toast.error('Error al adjuntar archivo(s)');
    } finally {
      setSubiendoAdjuntos(false);
    }
  };
  const quitarAdjunto = (idArchivo) => {
    setForm(f => ({ ...f, archivos: f.archivos.filter(a => a.id !== idArchivo) }));
  };

  const subtotal = round2(form.items.reduce((acc, it) => acc + calcImporte(it), 0));
  const igvCalc = round2(subtotal * igvTasa);
  const totalCalc = round2(subtotal + igvCalc);

  const guardar = async (e) => {
    e.preventDefault();
    if (saving) return;
    if (!form.id_cliente) return toast.error('Selecciona un cliente');
    if (!form.id_tipo_servicio) return toast.error('Selecciona un tipo de servicio');
    if (!form.fecha_validez) return toast.error('Fecha de validez obligatoria');
    if (!form.ascensores.length) return toast.error('Agrega al menos un ascensor');
    for (let i = 0; i < form.ascensores.length; i++) {
      const a = form.ascensores[i];
      if (a.modo === 'existente' && !a.id_ascensor) {
        return toast.error(`Ascensor #${i + 1}: selecciona uno o cámbialo a "Nuevo (instalación)"`);
      }
      if (a.modo === 'nuevo' && !a.ascensor_nuevo.id_edificio) {
        return toast.error(`Ascensor #${i + 1}: elige el edificio donde se instala`);
      }
      if (a.modo === 'nuevo' && !a.ascensor_nuevo.ubicacion && !a.ascensor_nuevo.descripcion) {
        return toast.error(`Ascensor #${i + 1}: describe el ascensor nuevo (ubicación o descripción)`);
      }
    }
    if (form.items.length === 0 || form.items.every(it => !it.descripcion.trim())) {
      return toast.error('Agrega al menos un item con descripción');
    }

    let payloadCuotas;
    try {
      payloadCuotas = planParaPayload(form.cuotas, totalCalc);
    } catch (err) {
      return toast.error(err.message);
    }

    setSaving(true);
    try {
      await cotizacionesService.create({
        id_cliente: Number(form.id_cliente),
        id_lead: form.id_lead || null,
        ascensores: form.ascensores.map((a, idx) => ({
          orden: idx + 1,
          id_ascensor: a.modo === 'existente' ? Number(a.id_ascensor) : null,
          ascensor_nuevo: a.modo === 'nuevo' ? {
            id_edificio: Number(a.ascensor_nuevo.id_edificio),
            ubicacion: a.ascensor_nuevo.ubicacion || null,
            pisos: a.ascensor_nuevo.pisos ? Number(a.ascensor_nuevo.pisos) : null,
            capacidad: a.ascensor_nuevo.capacidad || null,
            marca: a.ascensor_nuevo.marca || null,
            modelo: a.ascensor_nuevo.modelo || null,
            descripcion: a.ascensor_nuevo.descripcion || null
          } : null
        })),
        id_tipo_servicio: Number(form.id_tipo_servicio),
        descripcion: form.descripcion || null,
        fecha_validez: form.fecha_validez,
        moneda: form.moneda,
        observaciones: form.observaciones || null,
        items: form.items
          .filter(it => it.descripcion.trim())
          .map((it, i) => ({
            orden: i + 1,
            descripcion: it.descripcion,
            cantidad: Number(it.cantidad) || 1,
            unidad: it.unidad || 'Unidad',
            precio_unitario: Number(it.precio_unitario) || 0,
            descuento_porcentaje: Number(it.descuento_porcentaje) || 0
          })),
        tiene_cuotas: payloadCuotas.tiene_cuotas,
        plan_cuotas: payloadCuotas.plan_cuotas,
        saldo_variable: payloadCuotas.saldo_variable,
        archivos: form.archivos.map(a => a.id)
      });
      toast.success('Cotización creada');
      setOpen(false);
      recargar();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Error al crear cotización');
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <PageHeader
        title="Cotizaciones"
        subtitle={`${total} registro(s)`}
        actions={
          <div className="flex flex-wrap gap-2">
            {puedeCrear && (
              <button onClick={abrirModal} className="btn-primary">+ Nueva cotización</button>
            )}
          </div>
        }
      />

      <div className="card mb-4">
        <div className="p-4 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-7 gap-2">
          <input className="input col-span-2" placeholder="Buscar por código, cliente, tipo de ascensor o servicio…" value={filtros.q}
            onChange={e => setFiltros(f => ({ ...f, q: e.target.value }))} />
          <select className="select" value={filtros.estado_global} onChange={e => setFiltros(f => ({ ...f, estado_global: e.target.value }))}>
            {ESTADOS_GLOBALES.map(s => <option key={s} value={s}>{s || 'Todos los estados'}</option>)}
          </select>
          <ClienteAutocomplete
            clientes={clientes}
            value={filtros.id_cliente}
            onChange={id => setFiltros(f => ({ ...f, id_cliente: id }))}
            placeholder="Cliente (buscar…)"
            allowEmpty
            emptyLabel="Todos los clientes"
          />
          <select className="select" value={filtros.id_tipo_servicio} onChange={e => setFiltros(f => ({ ...f, id_tipo_servicio: e.target.value }))}>
            <option value="">Todos los tipos</option>
            {tipos.map(t => <option key={t.id} value={t.id}>{t.nombre}</option>)}
          </select>
          <input type="date" className="input" value={filtros.desde} onChange={e => setFiltros(f => ({ ...f, desde: e.target.value }))} />
          <input type="date" className="input" value={filtros.hasta} onChange={e => setFiltros(f => ({ ...f, hasta: e.target.value }))} />
        </div>
      </div>

      <div className="card">
        {loading ? <Loader /> : data.length === 0 ? <EmptyState title="Sin cotizaciones" /> : (
          <>
            <div className="hidden md:block overflow-x-auto scroll-thin">
              <table className="table-base">
                <thead>
                  <tr>
                    <th className="table-th">Código</th>
                    <th className="table-th">Cliente</th>
                    <th className="table-th">Tipo</th>
                    <th className="table-th">Versión</th>
                    <th className="table-th">Validez</th>
                    <th className="table-th text-right">Monto</th>
                    <th className="table-th">Estado versión</th>
                    <th className="table-th">Estado global</th>
                    <th className="table-th">Servicio</th>
                    <th className="table-th text-right">Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {data.map(c => {
                    const v = c.versiones?.[0];
                    return (
                      <tr key={c.id} className="table-row-hover">
                        <td className="table-td"><Link to={`/cotizaciones/${c.id}`} className="font-mono text-brand-700 hover:underline">{c.codigo}</Link></td>
                        <td className="table-td">{c.cliente?.nombre || '—'}</td>
                        <td className="table-td">{c.tipo_servicio?.nombre || '—'}</td>
                        <td className="table-td">v{v?.numero_version || c.version_activa}</td>
                        <td className="table-td">{formatFecha(v?.fecha_validez)}</td>
                        <td className="table-td text-right">{formatMonto(v?.monto_total, v?.moneda)}</td>
                        <td className="table-td"><span className={`badge ${badgeEstado(v?.estado_version)}`}>{v?.estado_version || '—'}</span></td>
                        <td className="table-td"><span className={`badge ${badgeEstado(c.estado_global)}`}>{c.estado_global}</span></td>
                        <td className="table-td">
                          {c.servicios?.length > 0 ? (
                            <div className="flex flex-col gap-1">
                              {c.servicios.map(s => (
                                <div key={s.id} className="flex items-center gap-1.5">
                                  <Link to={`/servicios/${s.id}`} className="font-mono text-xs text-brand-700 hover:underline">{s.codigo}</Link>
                                  <span className={`badge ${badgeEstado(s.estado_servicio)}`}>{s.estado_servicio}</span>
                                </div>
                              ))}
                            </div>
                          ) : <span className="text-carbon-400">—</span>}
                        </td>
                        <td className="table-td text-right">
                          <Link to={`/cotizaciones/${c.id}`} className="btn-ghost text-xs !py-1.5 !px-3">Abrir</Link>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="md:hidden divide-y divide-carbon-100">
              {data.map(c => {
                const v = c.versiones?.[0];
                return (
                  <Link to={`/cotizaciones/${c.id}`} key={c.id} className="block p-4 hover:bg-ivory-50">
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-mono text-sm text-brand-700">{c.codigo}</span>
                      <span className={`badge ${badgeEstado(c.estado_global)}`}>{c.estado_global}</span>
                    </div>
                    <div className="text-sm text-carbon-800 font-medium">{c.cliente?.nombre}</div>
                    <div className="text-xs text-carbon-500 mt-0.5">{c.tipo_servicio?.nombre} • v{v?.numero_version}</div>
                    <div className="mt-1.5 flex justify-between text-xs">
                      <span className={`badge ${badgeEstado(v?.estado_version)}`}>{v?.estado_version}</span>
                      <span className="font-medium">{formatMonto(v?.monto_total, v?.moneda)}</span>
                    </div>
                    {c.servicios?.length > 0 && (
                      <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-xs">
                        <span className="text-carbon-500">Servicio:</span>
                        {c.servicios.map(s => (
                          <span key={s.id} className="inline-flex items-center gap-1">
                            <span className="font-mono text-brand-700">{s.codigo}</span>
                            <span className={`badge ${badgeEstado(s.estado_servicio)}`}>{s.estado_servicio}</span>
                          </span>
                        ))}
                      </div>
                    )}
                  </Link>
                );
              })}
            </div>

            <Pagination page={page} pageSize={pageSize} total={total} totalPages={totalPages}
              onPage={setPage} onPageSize={setPageSize} />
          </>
        )}
      </div>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Nueva cotización"
        size="xl"
        footer={
          <>
            <button onClick={() => setOpen(false)} className="btn-ghost">Cancelar</button>
            <button type="submit" form="form-cotizacion" disabled={saving} className="btn-primary">
              {saving ? 'Guardando…' : 'Crear cotización'}
            </button>
          </>
        }
      >
        <form id="form-cotizacion" onSubmit={guardar} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="label">Cliente *</label>
              <ClienteAutocomplete
                clientes={clientes}
                value={form.id_cliente}
                onChange={id => setForm(f => ({
                  ...f,
                  id_cliente: id,
                  // El selector "existente" filtra por cliente; al cambiarlo, los ids
                  // previos quedan inválidos. Mantenemos la cantidad de filas y su modo
                  // para no perder lo que el usuario empezó a escribir en "nuevo".
                  ascensores: f.ascensores.map(a => a.modo === 'existente' ? { ...a, id_ascensor: '' } : a)
                }))}
                placeholder="Buscar cliente por nombre, RUC o teléfono…"
                required
              />
            </div>
            <div>
              <label className="label">Tipo de servicio *</label>
              <select className="select" value={form.id_tipo_servicio}
                onChange={e => setForm(f => ({ ...f, id_tipo_servicio: e.target.value }))}>
                <option value="">— Selecciona —</option>
                {tipos.map(t => <option key={t.id} value={t.id}>{t.nombre}</option>)}
              </select>
            </div>
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <label className="label !mb-0">Ascensores *</label>
              <button type="button" onClick={agregarAscensor} className="btn-ghost text-xs !py-1.5 !px-3">
                + Agregar ascensor
              </button>
            </div>
            {form.ascensores.map((a, idx) => (
              <div key={idx} className="border border-carbon-200 rounded-lg p-3 space-y-2 bg-ivory-50/40">
                <div className="flex items-center justify-between">
                  <div className="text-xs font-semibold text-carbon-700">Ascensor #{idx + 1}</div>
                  <div className="flex items-center gap-3 text-xs">
                    <label className="inline-flex items-center gap-1.5">
                      <input type="radio" name={`ascensor_modo_${idx}`} checked={a.modo === 'existente'}
                        onChange={() => cambiarAscensor(idx, 'modo', 'existente')} />
                      Existente
                    </label>
                    <label className="inline-flex items-center gap-1.5">
                      <input type="radio" name={`ascensor_modo_${idx}`} checked={a.modo === 'nuevo'}
                        onChange={() => cambiarAscensor(idx, 'modo', 'nuevo')} />
                      Nuevo (instalación)
                    </label>
                    {form.ascensores.length > 1 && (
                      <button type="button" onClick={() => quitarAscensor(idx)}
                        className="text-carbon-400 hover:text-red-600 text-base leading-none ml-1" title="Eliminar ascensor">×</button>
                    )}
                  </div>
                </div>
                {a.modo === 'existente' ? (
                  <select className="select" value={a.id_ascensor}
                    disabled={!form.id_cliente}
                    onChange={e => cambiarAscensor(idx, 'id_ascensor', e.target.value)}>
                    <option value="">
                      {!form.id_cliente
                        ? '— Selecciona un cliente primero —'
                        : ascensoresDelCliente.length === 0
                          ? '— Este cliente no tiene ascensores registrados —'
                          : '— Selecciona ascensor —'}
                    </option>
                    {ascensoresDelCliente.map(x => <option key={x.id} value={x.id}>{x.codigo} — {x.ubicacion || ''}</option>)}
                  </select>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <select className="select sm:col-span-2" required disabled={!form.id_cliente}
                      value={a.ascensor_nuevo.id_edificio}
                      onChange={e => cambiarAscensorNuevo(idx, 'id_edificio', e.target.value)}>
                      <option value="">{form.id_cliente ? (edificiosCliente.length ? '— Edificio / obra donde se instala —' : 'Este cliente no tiene edificios; créalo en su ficha') : '— Selecciona un cliente primero —'}</option>
                      {edificiosCliente.map(ed => <option key={ed.id} value={ed.id}>{ed.nombre}{ed.tipo ? ` · ${ed.tipo}` : ''}</option>)}
                    </select>
                    <input className="input" placeholder="Ubicación (piso / zona)" value={a.ascensor_nuevo.ubicacion}
                      onChange={e => cambiarAscensorNuevo(idx, 'ubicacion', e.target.value)} />
                    <input className="input" type="number" placeholder="Pisos" value={a.ascensor_nuevo.pisos}
                      onChange={e => cambiarAscensorNuevo(idx, 'pisos', e.target.value)} />
                    <input className="input" placeholder="Capacidad (kg / personas)" value={a.ascensor_nuevo.capacidad}
                      onChange={e => cambiarAscensorNuevo(idx, 'capacidad', e.target.value)} />
                    <input className="input" placeholder="Marca esperada" value={a.ascensor_nuevo.marca}
                      onChange={e => cambiarAscensorNuevo(idx, 'marca', e.target.value)} />
                    <textarea className="textarea sm:col-span-2" rows="2" placeholder="Descripción / observaciones"
                      value={a.ascensor_nuevo.descripcion}
                      onChange={e => cambiarAscensorNuevo(idx, 'descripcion', e.target.value)} />
                  </div>
                )}
              </div>
            ))}
          </div>

          <div>
            <label className="label">Descripción</label>
            <textarea className="textarea" rows="2" value={form.descripcion}
              onChange={e => setForm(f => ({ ...f, descripcion: e.target.value }))} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Validez (fecha) *</label>
              <input type="date" className="input" value={form.fecha_validez}
                onChange={e => setForm(f => ({ ...f, fecha_validez: e.target.value }))} />
            </div>
            <div>
              <label className="label">Moneda</label>
              <select className="select" value={form.moneda} onChange={e => setForm(f => ({ ...f, moneda: e.target.value }))}>
                <option value="PEN">PEN (S/)</option>
                <option value="USD">USD ($)</option>
              </select>
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="label !mb-0">Items</label>
              <button type="button" onClick={agregarItem} className="btn-ghost text-xs !py-1.5 !px-3">+ Agregar item</button>
            </div>
            <div className="hidden sm:grid grid-cols-12 gap-2 px-1 pb-1.5 mb-1 border-b border-carbon-100 text-[10px] font-semibold uppercase tracking-wider text-carbon-500">
              <div className="col-span-5">Descripción</div>
              <div className="col-span-1 text-right">Cant.</div>
              <div className="col-span-1">Unidad</div>
              <div className="col-span-2 text-right">P. unitario</div>
              <div className="col-span-1 text-right">% dscto</div>
              <div className="col-span-1 text-right">Importe</div>
              <div className="col-span-1"></div>
            </div>
            <div className="space-y-2">
              {form.items.map((it, idx) => (
                <div key={idx} className="grid grid-cols-12 gap-2 items-start">
                  <textarea className="textarea col-span-12 sm:col-span-5" rows="1" placeholder="Descripción del item"
                    value={it.descripcion} onChange={e => cambiarItem(idx, 'descripcion', e.target.value)} />
                  <input type="number" step="0.01" className="input col-span-3 sm:col-span-1" placeholder="Cant."
                    value={it.cantidad} onChange={e => cambiarItem(idx, 'cantidad', e.target.value)} />
                  <input className="input col-span-3 sm:col-span-1" placeholder="Unidad"
                    value={it.unidad} onChange={e => cambiarItem(idx, 'unidad', e.target.value)} />
                  <input type="number" step="0.01" className="input col-span-3 sm:col-span-2" placeholder="P. unitario"
                    value={it.precio_unitario} onChange={e => cambiarItem(idx, 'precio_unitario', e.target.value)} />
                  <input type="number" step="0.01" className="input col-span-2 sm:col-span-1" placeholder="% dscto"
                    value={it.descuento_porcentaje} onChange={e => cambiarItem(idx, 'descuento_porcentaje', e.target.value)} />
                  <div className="col-span-9 sm:col-span-1 text-right text-sm font-medium pt-2">
                    {formatMonto(calcImporte(it), form.moneda)}
                  </div>
                  <button type="button" onClick={() => quitarItem(idx)}
                    className="col-span-1 text-carbon-400 hover:text-red-600 text-lg leading-none">×</button>
                </div>
              ))}
            </div>
          </div>

          <div className="border-t border-carbon-100 pt-3 grid grid-cols-2 gap-1 text-sm">
            <div className="text-right text-carbon-600">Subtotal</div>
            <div className="text-right font-medium">{formatMonto(subtotal, form.moneda)}</div>
            <div className="text-right text-carbon-600">IGV ({Math.round(igvTasa * 100)}%)</div>
            <div className="text-right font-medium">{formatMonto(igvCalc, form.moneda)}</div>
            <div className="text-right text-brand-700 font-bold">TOTAL</div>
            <div className="text-right text-brand-700 font-bold text-base">{formatMonto(totalCalc, form.moneda)}</div>
          </div>

          <CuotasEditor
            value={form.cuotas}
            onChange={cuotas => setForm(f => ({ ...f, cuotas }))}
            total={totalCalc}
            moneda={form.moneda}
          />

          <div>
            <label className="label">Observaciones internas</label>
            <textarea className="textarea" rows="2" value={form.observaciones}
              onChange={e => setForm(f => ({ ...f, observaciones: e.target.value }))} />
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="label !mb-0">Adjuntos</label>
              <label className={`btn-ghost text-xs !py-1.5 !px-3 cursor-pointer ${subiendoAdjuntos ? 'opacity-50 pointer-events-none' : ''}`}>
                {subiendoAdjuntos ? 'Subiendo…' : '+ Agregar archivos'}
                <input type="file" multiple className="hidden" onChange={subirAdjuntos} disabled={subiendoAdjuntos} />
              </label>
            </div>
            {form.archivos.length === 0 ? (
              <div className="text-xs text-carbon-400 italic">Sin adjuntos</div>
            ) : (
              <ul className="space-y-1">
                {form.archivos.map(a => (
                  <li key={a.id} className="flex items-center justify-between text-sm bg-ivory-50 border border-carbon-100 rounded px-2 py-1">
                    <a href={assetUrl(a.ruta_almacenamiento)} target="_blank" rel="noreferrer"
                       className="text-brand-700 hover:underline truncate" title={a.nombre_original}>
                      {a.nombre_original}
                    </a>
                    <button type="button" onClick={() => quitarAdjunto(a.id)}
                      className="text-carbon-400 hover:text-red-600 text-lg leading-none ml-2">×</button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </form>
      </Modal>
    </>
  );
}
