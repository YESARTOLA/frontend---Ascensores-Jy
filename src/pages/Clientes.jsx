import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { clientesService, archivosService, configuracionService, tiposServicioService } from '../services';
import PageHeader from '../components/common/PageHeader.jsx';
import Loader from '../components/common/Loader.jsx';
import Modal from '../components/common/Modal.jsx';
import EmptyState from '../components/common/EmptyState.jsx';
import Pagination, { usePaginatedList } from '../components/common/Pagination.jsx';
import { useToast } from '../components/common/Toast.jsx';
import { useAuth } from '../features/auth/AuthContext.jsx';
import { FileLink } from '../components/common/FilePreview.jsx';
import { formatFecha, hoyISO, sanearTelefono, formatTelefono } from '../utils/formatters.js';
import MapaUbicacion from '../components/common/MapaUbicacion.jsx';
import { toNumeroSeguro } from '../utils/mapa.js';

const estadosContrato = (diasAviso) => [
  { value: '', label: 'Todos los contratos' },
  { value: 'vigente', label: 'Vigentes' },
  { value: 'por_vencer', label: `Por vencer (${diasAviso} días)` },
  { value: 'vencido', label: 'Vencidos' },
  { value: 'sin_contrato', label: 'Sin contrato' }
];

const CON_CONTRATO = [
  { value: '', label: 'Contrato adjunto: todos' },
  { value: '1', label: 'Con contrato adjunto' },
  { value: '0', label: 'Sin contrato adjunto' }
];

const inicial = {
  tipo_documento: 'RUC', numero_documento: '', nombre: '', nombre_edificio: '',
  telefono: '', whatsapp: '',
  correo: '', direccion: '', distrito: '', observaciones: '',
  contacto_principal_nombre: '', contacto_principal_correo: '', contacto_principal_telefono: '',
  contacto_cobranzas_nombre: '', contacto_cobranzas_correo: '', contacto_cobranzas_telefono: '',
  contacto_admin_nombre: '', contacto_admin_correo: '', contacto_admin_telefono: '',
  contrato_inicio: '', contrato_fin: '',
  clasificacion: '',
  latitud: null,
  longitud: null,
  id_archivo_contrato: null,
  archivo_contrato: null,
  archivos: [], // [{ id_archivo, descripcion, orden, archivo: { id, nombre_original, ruta_almacenamiento, mime_type } }]
  precios: [] // [{ id_tipo_servicio, precio, moneda }]
};

function estadoContratoBadge(c, diasAviso) {
  if (!c.contrato_inicio || !c.contrato_fin) return { texto: 'Sin contrato', clase: 'bg-slate-100 text-slate-600' };
  const hoy = hoyISO();
  const fin = String(c.contrato_fin).slice(0, 10);
  const inicio = String(c.contrato_inicio).slice(0, 10);
  if (fin < hoy) return { texto: 'Vencido', clase: 'bg-red-100 text-red-700' };
  if (inicio > hoy) return { texto: 'Pendiente', clase: 'bg-slate-100 text-slate-600' };
  const dHoy = new Date(hoy + 'T00:00:00.000Z');
  const dFin = new Date(fin + 'T00:00:00.000Z');
  const dias = Math.round((dFin - dHoy) / 86400000);
  if (dias <= diasAviso) return { texto: `Por vencer (${dias}d)`, clase: 'bg-amber-100 text-amber-700' };
  return { texto: 'Vigente', clase: 'bg-emerald-100 text-emerald-700' };
}

export default function Clientes() {
  const [filtros, setFiltros] = useState({ q: '', distrito: '', tipo_ascensor: '', clasificacion: '', estado_contrato: '', con_contrato: '' });
  const [clasificaciones, setClasificaciones] = useState([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(inicial);
  const [editId, setEditId] = useState(null);
  const [saving, setSaving] = useState(false);
  const [exportando, setExportando] = useState(false);
  const [subiendoContrato, setSubiendoContrato] = useState(false);
  const [diasAviso, setDiasAviso] = useState(30);
  const [distritos, setDistritos] = useState([]);
  const [tiposAscensor, setTiposAscensor] = useState([]);
  const [tiposServicio, setTiposServicio] = useState([]);
  const toast = useToast();
  const { esSuperAdmin, esAdmin, esCoordinador, esContabilidad } = useAuth();
  const puedeEditar = esSuperAdmin || esAdmin || esCoordinador || esContabilidad;

  useEffect(() => {
    configuracionService.get('CLIENTES_DIAS_AVISO_VENCIMIENTO_CONTRATO')
      .then(r => setDiasAviso(Number(r.valor) || 30))
      .catch(() => {});
    tiposServicioService.list().then(setTiposServicio).catch(() => setTiposServicio([]));
  }, []);

  const opcionesEstadoContrato = useMemo(() => estadosContrato(diasAviso), [diasAviso]);

  const { data, loading, total, page, pageSize, totalPages, setPage, setPageSize, recargar } =
    usePaginatedList(clientesService.paginate, filtros, { initialPageSize: 25 });

  const cargarDistritos = () => {
    clientesService.distritos().then(setDistritos).catch(() => {});
  };
  const cargarTiposAscensor = () => {
    clientesService.tiposAscensor().then(setTiposAscensor).catch(() => {});
  };
  const cargarClasificaciones = () => {
    clientesService.clasificaciones().then(setClasificaciones).catch(() => setClasificaciones([]));
  };
  useEffect(() => { cargarDistritos(); cargarTiposAscensor(); cargarClasificaciones(); }, []);

  const cargar = () => { recargar(); cargarDistritos(); cargarTiposAscensor(); };

  // Lookup rápido para badges
  const clasificacionByCodigo = useMemo(
    () => Object.fromEntries(clasificaciones.map(c => [c.codigo, c])),
    [clasificaciones]
  );

  const abrirNuevo = () => { setForm(inicial); setEditId(null); setOpen(true); };
  const abrirEdit = async (c) => {
    // El listado no trae archivos ni precios; los pedimos del detalle.
    let archivos = Array.isArray(c.archivos) ? c.archivos : [];
    let precios = Array.isArray(c.precios) ? c.precios : [];
    if (archivos.length === 0 || precios.length === 0) {
      try {
        const full = await clientesService.get(c.id);
        if (archivos.length === 0) archivos = Array.isArray(full?.archivos) ? full.archivos : [];
        if (precios.length === 0) precios = Array.isArray(full?.precios) ? full.precios : [];
      } catch { /* si falla, seguimos con lo que haya */ }
    }
    const preciosNorm = precios.map(p => ({
      id_tipo_servicio: p.id_tipo_servicio,
      precio: p.precio !== undefined && p.precio !== null ? String(p.precio) : '',
      moneda: p.moneda || 'PEN'
    }));
    setForm({
      tipo_documento: c.tipo_documento, numero_documento: c.numero_documento || '',
      nombre: c.nombre, nombre_edificio: c.nombre_edificio || '',
      telefono: sanearTelefono(c.telefono), whatsapp: sanearTelefono(c.whatsapp || ''), correo: c.correo || '',
      direccion: c.direccion || '', distrito: c.distrito || '',
      contacto_principal_nombre: c.contacto_principal_nombre || '',
      contacto_principal_correo: c.contacto_principal_correo || '',
      contacto_principal_telefono: sanearTelefono(c.contacto_principal_telefono || ''),
      contacto_cobranzas_nombre: c.contacto_cobranzas_nombre || '',
      contacto_cobranzas_correo: c.contacto_cobranzas_correo || '',
      contacto_cobranzas_telefono: sanearTelefono(c.contacto_cobranzas_telefono || ''),
      contacto_admin_nombre: c.contacto_admin_nombre || '',
      contacto_admin_correo: c.contacto_admin_correo || '',
      contacto_admin_telefono: sanearTelefono(c.contacto_admin_telefono || ''),
      observaciones: c.observaciones || '',
      contrato_inicio: c.contrato_inicio ? c.contrato_inicio.substring(0, 10) : '',
      contrato_fin: c.contrato_fin ? c.contrato_fin.substring(0, 10) : '',
      clasificacion: c.clasificacion || '',
      latitud: toNumeroSeguro(c.latitud),
      longitud: toNumeroSeguro(c.longitud),
      id_archivo_contrato: c.id_archivo_contrato || null,
      archivo_contrato: c.archivo_contrato || null,
      archivos,
      precios: preciosNorm
    });
    setEditId(c.id);
    setOpen(true);
  };

  const subirContrato = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setSubiendoContrato(true);
    try {
      const fd = new FormData();
      fd.append('archivo', file);
      const arch = await archivosService.upload(fd, 'contratos');
      setForm(f => ({ ...f, id_archivo_contrato: arch.id, archivo_contrato: arch }));
      toast.success('Contrato adjuntado');
    } catch {
      toast.error('Error al adjuntar el contrato');
    } finally {
      setSubiendoContrato(false);
    }
  };

  const quitarContrato = () => {
    setForm(f => ({ ...f, id_archivo_contrato: null, archivo_contrato: null }));
  };

  const [subiendoAdjuntos, setSubiendoAdjuntos] = useState(false);
  const subirAdjuntos = async (e) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;
    setSubiendoAdjuntos(true);
    try {
      const nuevos = [];
      for (const file of files) {
        const fd = new FormData();
        fd.append('archivo', file);
        const arch = await archivosService.upload(fd, 'clientes');
        nuevos.push({ id_archivo: arch.id, descripcion: '', archivo: arch });
      }
      setForm(f => ({ ...f, archivos: [...f.archivos, ...nuevos] }));
      toast.success(`${nuevos.length} adjunto(s) cargado(s)`);
    } catch (err) {
      toast.error('Error al adjuntar archivo(s)');
    } finally {
      setSubiendoAdjuntos(false);
      e.target.value = '';
    }
  };
  const cambiarDescripcionAdjunto = (idx, valor) => {
    setForm(f => ({
      ...f,
      archivos: f.archivos.map((a, i) => i === idx ? { ...a, descripcion: valor } : a)
    }));
  };
  const quitarAdjunto = (idx) => {
    setForm(f => ({ ...f, archivos: f.archivos.filter((_, i) => i !== idx) }));
  };

  const agregarPrecio = () => setForm(f => ({
    ...f,
    precios: [...f.precios, { id_tipo_servicio: '', precio: '', moneda: 'PEN' }]
  }));
  const cambiarPrecio = (idx, key, val) => {
    setForm(f => ({
      ...f,
      precios: f.precios.map((p, i) => i === idx ? { ...p, [key]: val } : p)
    }));
  };
  const quitarPrecio = (idx) => {
    setForm(f => ({ ...f, precios: f.precios.filter((_, i) => i !== idx) }));
  };
  // Tipos disponibles para agregar (excluye los ya elegidos en otras filas).
  const tiposDisponibles = (idx) => {
    const usados = new Set(form.precios.map((p, i) => i !== idx ? Number(p.id_tipo_servicio) : null).filter(Boolean));
    return tiposServicio.filter(t => !usados.has(t.id));
  };

  const guardar = async (e) => {
    e.preventDefault();
    if (saving) return;
    if (form.latitud === null || form.longitud === null) {
      toast.error('Selecciona la ubicación del cliente haciendo click en el mapa');
      return;
    }
    setSaving(true);
    try {
      const payload = {
        ...form,
        latitud: form.latitud,
        longitud: form.longitud,
        id_archivo_contrato: form.id_archivo_contrato,
        archivos: form.archivos.map((a, i) => ({
          id_archivo: a.id_archivo,
          descripcion: a.descripcion || null,
          orden: i + 1
        })),
        precios: form.precios
          .filter(p => p.id_tipo_servicio && p.precio !== '' && p.precio !== null)
          .map(p => ({
            id_tipo_servicio: Number(p.id_tipo_servicio),
            precio: Number(p.precio),
            moneda: p.moneda || 'PEN'
          }))
      };
      delete payload.archivo_contrato;
      if (editId) await clientesService.update(editId, payload);
      else await clientesService.create(payload);
      toast.success('Cliente guardado');
      setOpen(false);
      cargar();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Error al guardar');
    } finally {
      setSaving(false);
    }
  };

  const exportar = async (formato) => {
    if (exportando) return;
    setExportando(formato);
    try {
      const blob = await clientesService.exportar(filtros, formato).then(r => r.data);
      const ext = formato === 'pdf' ? 'pdf' : 'xlsx';
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `clientes-${hoyISO()}.${ext}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast.success(`Exportación ${ext.toUpperCase()} lista`);
    } catch (err) {
      // El backend puede devolver el error como blob — intentamos parsearlo
      let msg = 'Error al exportar';
      if (err.response?.data instanceof Blob) {
        try { msg = JSON.parse(await err.response.data.text()).error || msg; } catch {}
      } else if (err.response?.data?.error) {
        msg = err.response.data.error;
      }
      toast.error(msg);
    } finally {
      setExportando(false);
    }
  };

  return (
    <>
      <PageHeader title="Clientes" subtitle={`${total} cliente(s)`}
        actions={
          <>
            <button onClick={() => exportar('excel')} disabled={!!exportando} className="btn-ghost">
              {exportando === 'excel' ? 'Generando…' : 'Exportar Excel'}
            </button>
            <button onClick={() => exportar('pdf')} disabled={!!exportando} className="btn-ghost">
              {exportando === 'pdf' ? 'Generando…' : 'Exportar PDF'}
            </button>
            {puedeEditar && <button onClick={abrirNuevo} className="btn-primary">+ Nuevo cliente</button>}
          </>
        }
      />

      <div className="card mb-4">
        <div className="p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2">
          <input
            className="input lg:col-span-2"
            placeholder="Buscar por nombre, RUC, teléfono…"
            value={filtros.q}
            onChange={e => setFiltros(f => ({ ...f, q: e.target.value }))}
          />
          <select className="select" value={filtros.distrito}
            onChange={e => setFiltros(f => ({ ...f, distrito: e.target.value }))}>
            <option value="">Todos los distritos</option>
            {distritos.map(d => <option key={d} value={d}>{d}</option>)}
          </select>
          <select className="select" value={filtros.tipo_ascensor}
            onChange={e => setFiltros(f => ({ ...f, tipo_ascensor: e.target.value }))}>
            <option value="">Todos los tipos de ascensor</option>
            {tiposAscensor.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
          <select className="select" value={filtros.estado_contrato}
            onChange={e => setFiltros(f => ({ ...f, estado_contrato: e.target.value }))}>
            {opcionesEstadoContrato.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
          <select className="select" value={filtros.clasificacion}
            onChange={e => setFiltros(f => ({ ...f, clasificacion: e.target.value }))}>
            <option value="">Todas las clasificaciones</option>
            {clasificaciones.map(c => <option key={c.codigo} value={c.codigo}>{c.etiqueta}</option>)}
          </select>
          <select className="select sm:col-span-2 lg:col-span-4" value={filtros.con_contrato}
            onChange={e => setFiltros(f => ({ ...f, con_contrato: e.target.value }))}>
            {CON_CONTRATO.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>
      </div>

      <div className="card">
        {loading ? <Loader /> : data.length === 0 ? (
          <EmptyState title="Sin clientes" subtitle="Crea tu primer cliente para empezar."
            action={puedeEditar && <button onClick={abrirNuevo} className="btn-primary">Crear cliente</button>} />
        ) : (
          <>
            {/* Tabla escritorio */}
            <div className="hidden md:block overflow-x-auto scroll-thin">
              <table className="table-base">
                <thead><tr>
                  <th className="table-th">Cliente</th>
                  <th className="table-th">Documento</th>
                  <th className="table-th">Distrito</th>
                  <th className="table-th">Teléfono</th>
                  <th className="table-th">Ascensores</th>
                  <th className="table-th">Inicio contrato</th>
                  <th className="table-th">Fin contrato</th>
                  <th className="table-th">Estado contrato</th>
                  <th className="table-th">Contrato</th>
                  <th className="table-th">Registrado por</th>
                  <th className="table-th text-right">Acciones</th>
                </tr></thead>
                <tbody className="divide-y divide-slate-100">
                  {data.map(c => {
                    const badge = estadoContratoBadge(c, diasAviso);
                    return (
                      <tr key={c.id} className="table-row-hover">
                        <td className="table-td">
                          <div className="flex items-center gap-2 flex-wrap">
                            <div className="font-medium text-slate-800">{c.nombre}</div>
                            {c.clasificacion && clasificacionByCodigo[c.clasificacion] && (
                              <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold ring-1 ${clasificacionByCodigo[c.clasificacion].color}`}>
                                {clasificacionByCodigo[c.clasificacion].etiqueta}
                              </span>
                            )}
                          </div>
                          {c.nombre_edificio && <div className="text-xs text-carbon-600">{c.nombre_edificio}</div>}
                          {c.contacto_principal_nombre && <div className="text-xs text-slate-500">{c.contacto_principal_nombre}</div>}
                        </td>
                        <td className="table-td"><span className="text-xs">{c.tipo_documento}</span> <span className="font-mono">{c.numero_documento || '—'}</span></td>
                        <td className="table-td">{c.distrito || '—'}</td>
                        <td className="table-td font-mono text-xs">{formatTelefono(c.telefono)}</td>
                        <td className="table-td">{c._count?.ascensores ?? 0}</td>
                        <td className="table-td text-xs">{formatFecha(c.contrato_inicio)}</td>
                        <td className="table-td text-xs">{formatFecha(c.contrato_fin)}</td>
                        <td className="table-td">
                          <span className={`badge ${badge.clase}`}>{badge.texto}</span>
                        </td>
                        <td className="table-td">
                          {c.archivo_contrato
                            ? <FileLink archivo={c.archivo_contrato} className="text-brand-700 hover:underline text-xs">Ver PDF</FileLink>
                            : <span className="text-slate-400 text-xs">—</span>}
                        </td>
                        <td className="table-td">
                          {c.usuario_registrador ? (
                            <>
                              <div className="text-sm text-slate-800">{c.usuario_registrador.nombres}</div>
                              <div className="text-xs text-slate-500">{c.usuario_registrador.rol?.nombre || '—'}</div>
                            </>
                          ) : <span className="text-slate-400 text-xs">—</span>}
                        </td>
                        <td className="table-td text-right space-x-2 whitespace-nowrap">
                          <Link to={`/clientes/${c.id}`} className="text-brand-700 hover:underline text-xs font-medium">Ver 360</Link>
                          {puedeEditar && <button onClick={() => abrirEdit(c)} className="text-slate-600 hover:underline text-xs">Editar</button>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {/* Cards móvil */}
            <div className="md:hidden divide-y divide-slate-100">
              {data.map(c => {
                const badge = estadoContratoBadge(c, diasAviso);
                return (
                  <div key={c.id} className="p-4 flex items-start gap-3">
                    <div className="h-9 w-9 rounded-full bg-brand-50 text-brand-700 grid place-items-center font-semibold text-sm shrink-0">{c.nombre[0]}</div>
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-slate-800 truncate">{c.nombre}</div>
                      <div className="text-xs text-slate-500">{c.tipo_documento} {c.numero_documento || ''} · {c.distrito || '—'}</div>
                      <div className="text-xs text-slate-500 mt-0.5 font-mono">{formatTelefono(c.telefono)}</div>
                      {(c.contrato_inicio || c.contrato_fin) && (
                        <div className="text-xs text-slate-500 mt-0.5">
                          Contrato: <span className="text-slate-700">{formatFecha(c.contrato_inicio)} → {formatFecha(c.contrato_fin)}</span>
                        </div>
                      )}
                      <div className="mt-1 flex items-center gap-2 flex-wrap">
                        <span className={`badge ${badge.clase}`}>{badge.texto}</span>
                        {c.clasificacion && clasificacionByCodigo[c.clasificacion] && (
                          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold ring-1 ${clasificacionByCodigo[c.clasificacion].color}`}>
                            {clasificacionByCodigo[c.clasificacion].etiqueta}
                          </span>
                        )}
                        {c.archivo_contrato && (
                          <FileLink archivo={c.archivo_contrato} className="text-xs text-brand-700">Ver contrato</FileLink>
                        )}
                      </div>
                      <div className="mt-2 flex gap-3">
                        <Link to={`/clientes/${c.id}`} className="text-xs text-brand-700 font-medium">Ver 360 →</Link>
                        {puedeEditar && <button onClick={() => abrirEdit(c)} className="text-xs text-slate-600">Editar</button>}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
            <Pagination page={page} pageSize={pageSize} total={total} totalPages={totalPages}
              onPage={setPage} onPageSize={setPageSize} />
          </>
        )}
      </div>

      <Modal open={open} onClose={() => setOpen(false)} title={editId ? 'Editar cliente' : 'Nuevo cliente'} size="lg"
        footer={
          <>
            <button className="btn-secondary" onClick={() => setOpen(false)} disabled={saving}>Cancelar</button>
            <button className="btn-primary" type="submit" form="cliente-form" disabled={saving}>{saving ? 'Guardando…' : 'Guardar'}</button>
          </>
        }>
        <form id="cliente-form" onSubmit={guardar} className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="sm:col-span-2">
            <label className="label">Nombre del edificio</label>
            <input className="input" value={form.nombre_edificio}
              placeholder="Ej. Edificio Las Palmeras"
              onChange={e => setForm(f => ({ ...f, nombre_edificio: e.target.value }))} />
          </div>
          <div className="sm:col-span-2">
            <label className="label">Razón social / Nombre *</label>
            <input className="input" required value={form.nombre} onChange={e => setForm(f => ({ ...f, nombre: e.target.value }))} />
          </div>
          <div>
            <label className="label">Tipo de documento</label>
            <select className="select" value={form.tipo_documento} onChange={e => setForm(f => ({ ...f, tipo_documento: e.target.value }))}>
              <option>RUC</option><option>DNI</option><option>CE</option>
            </select>
          </div>
          <div>
            <label className="label">Número de documento</label>
            <input className="input" value={form.numero_documento} onChange={e => setForm(f => ({ ...f, numero_documento: e.target.value }))} />
          </div>
          <div>
            <label className="label">Teléfono *</label>
            <input
              className="input" required
              type="tel" inputMode="numeric" autoComplete="tel"
              placeholder="9XX XXX XXX"
              pattern="9\d{2} \d{3} \d{3}"
              title="Celular peruano: 9 dígitos comenzando con 9"
              value={formatTelefono(form.telefono)}
              onChange={e => setForm(f => ({ ...f, telefono: sanearTelefono(e.target.value) }))}
            />
          </div>
          <div>
            <label className="label">WhatsApp</label>
            <input
              className="input"
              type="tel" inputMode="numeric" autoComplete="tel"
              placeholder="9XX XXX XXX"
              pattern="9\d{2} \d{3} \d{3}"
              title="Celular peruano: 9 dígitos comenzando con 9"
              value={formatTelefono(form.whatsapp)}
              onChange={e => setForm(f => ({ ...f, whatsapp: sanearTelefono(e.target.value) }))}
            />
          </div>
          <div className="sm:col-span-2">
            <label className="label">Correo</label>
            <input type="email" className="input" value={form.correo} onChange={e => setForm(f => ({ ...f, correo: e.target.value }))} />
          </div>
          <div className="sm:col-span-2">
            <label className="label">Dirección</label>
            <input className="input" value={form.direccion} onChange={e => setForm(f => ({ ...f, direccion: e.target.value }))} />
          </div>
          <div>
            <label className="label">Distrito *</label>
            <input
              className="input"
              required
              list="lista-distritos"
              value={form.distrito}
              onChange={e => setForm(f => ({ ...f, distrito: e.target.value }))}
              placeholder="Ej. Surco, Miraflores…"
            />
            <datalist id="lista-distritos">
              {distritos.map(d => <option key={d} value={d} />)}
            </datalist>
          </div>
          <div>
            <label className="label">Clasificación</label>
            <select className="select" value={form.clasificacion}
              onChange={e => setForm(f => ({ ...f, clasificacion: e.target.value }))}>
              <option value="">— Sin clasificar —</option>
              {clasificaciones.map(c => <option key={c.codigo} value={c.codigo}>{c.etiqueta}</option>)}
            </select>
            <p className="text-[11px] text-slate-500 mt-1">Etiqueta informativa para reportes y filtros. No afecta el flujo.</p>
          </div>
          <div className="sm:col-span-2 border border-slate-200 rounded-lg p-3 bg-slate-50/40">
            <div className="flex items-center justify-between gap-2 mb-2">
              <label className="label mb-0">Ubicación en mapa *</label>
              {(form.latitud !== null && form.longitud !== null) && (
                <button
                  type="button"
                  className="text-xs text-slate-600 hover:text-rose-600"
                  onClick={() => setForm(f => ({ ...f, latitud: null, longitud: null }))}
                >
                  Limpiar ubicación
                </button>
              )}
            </div>
            <p className="text-[11px] text-slate-500 mb-2">
              Haz click en el punto exacto donde está el cliente. Esta ubicación la verá el técnico para guiarse con Google Maps.
            </p>
            <MapaUbicacion
              editable
              valor={{ latitud: form.latitud, longitud: form.longitud }}
              onCambio={({ lat, lng }) => setForm(f => ({ ...f, latitud: lat, longitud: lng }))}
              alto="300px"
            />
          </div>
          <div className="sm:col-span-2 grid grid-cols-1 gap-3">
            {[
              { key: 'principal',   etiqueta: 'Contacto principal' },
              { key: 'cobranzas',   etiqueta: 'Contacto de cobranzas' },
              { key: 'admin',       etiqueta: 'Contacto administrativo' }
            ].map(({ key, etiqueta }) => {
              const kNombre = `contacto_${key}_nombre`;
              const kCorreo = `contacto_${key}_correo`;
              const kTel    = `contacto_${key}_telefono`;
              return (
                <div key={key} className="border border-slate-200 rounded-lg p-3 bg-slate-50/40">
                  <div className="text-xs font-semibold text-slate-700 mb-2">{etiqueta}</div>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                    <input className="input" placeholder="Nombre" value={form[kNombre]}
                      onChange={e => setForm(f => ({ ...f, [kNombre]: e.target.value }))} />
                    <input className="input" type="email" placeholder="Correo" value={form[kCorreo]}
                      onChange={e => setForm(f => ({ ...f, [kCorreo]: e.target.value }))} />
                    <input className="input" type="tel" inputMode="numeric" placeholder="Teléfono"
                      value={formatTelefono(form[kTel])}
                      onChange={e => setForm(f => ({ ...f, [kTel]: sanearTelefono(e.target.value) }))} />
                  </div>
                </div>
              );
            })}
          </div>
          <div>
            <label className="label">Inicio contrato de servicio *</label>
            <input type="date" className="input" required value={form.contrato_inicio}
              onChange={e => setForm(f => ({ ...f, contrato_inicio: e.target.value }))} />
          </div>
          <div>
            <label className="label">Fin contrato de servicio *</label>
            <input type="date" className="input" required value={form.contrato_fin}
              min={form.contrato_inicio || undefined}
              onChange={e => setForm(f => ({ ...f, contrato_fin: e.target.value }))} />
          </div>
          <div className="sm:col-span-2 border border-slate-200 rounded-lg p-3 bg-slate-50">
            <label className="label">Contrato firmado</label>
            {form.archivo_contrato ? (
              <div className="flex items-center justify-between gap-2 text-sm">
                <FileLink archivo={form.archivo_contrato} className="text-brand-700 hover:underline truncate">
                  📎 {form.archivo_contrato.nombre_original}
                </FileLink>
                <button type="button" onClick={quitarContrato} className="text-xs text-red-600 hover:underline">
                  Quitar
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <input type="file" accept=".pdf,image/*"
                  onChange={subirContrato} disabled={subiendoContrato}
                  className="input flex-1" />
                {subiendoContrato && <span className="text-xs text-slate-500">Subiendo…</span>}
              </div>
            )}
            <p className="text-xs text-slate-500 mt-1">
              PDF o imagen. Las fechas de inicio y fin del contrato son obligatorias y se mostrarán en la tabla principal.
            </p>
          </div>
          <div className="sm:col-span-2 border border-slate-200 rounded-lg p-3 bg-slate-50/40">
            <div className="flex items-center justify-between mb-2">
              <label className="label !mb-0">Archivos adjuntos</label>
              <label className="btn-ghost text-xs !py-1.5 !px-3 cursor-pointer">
                {subiendoAdjuntos ? 'Subiendo…' : '+ Subir archivo(s)'}
                <input type="file" multiple className="hidden" accept=".pdf,image/*,.doc,.docx,.xls,.xlsx"
                  disabled={subiendoAdjuntos} onChange={subirAdjuntos} />
              </label>
            </div>
            {form.archivos.length === 0 ? (
              <p className="text-xs text-slate-500">PDF, imágenes u otros documentos del cliente. Sin límite.</p>
            ) : (
              <ul className="space-y-2">
                {form.archivos.map((a, idx) => (
                  <li key={idx} className="flex items-center gap-2 bg-white rounded-md ring-1 ring-slate-200 px-2.5 py-1.5">
                    <FileLink archivo={a.archivo}
                      className="text-brand-700 hover:underline text-xs truncate min-w-0 flex-1 text-left"
                      title={a.archivo?.nombre_original}>
                      📎 {a.archivo?.nombre_original || `Archivo #${a.id_archivo}`}
                    </FileLink>
                    <input className="input !py-1 !text-xs flex-1 min-w-0" placeholder="Descripción (opcional)"
                      value={a.descripcion || ''} onChange={e => cambiarDescripcionAdjunto(idx, e.target.value)} />
                    <button type="button" onClick={() => quitarAdjunto(idx)}
                      className="text-red-600 hover:underline text-xs whitespace-nowrap">Quitar</button>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div className="sm:col-span-2 border border-slate-200 rounded-lg p-3 bg-slate-50/40">
            <div className="flex items-center justify-between mb-2">
              <label className="label !mb-0">Precios por tipo de servicio</label>
              <button type="button" onClick={agregarPrecio} className="btn-ghost text-xs !py-1.5 !px-3"
                disabled={tiposServicio.length === 0 || form.precios.length >= tiposServicio.length}>
                + Agregar precio
              </button>
            </div>
            {form.precios.length === 0 ? (
              <p className="text-xs text-slate-500">
                Configure el precio del cliente para cada tipo de servicio. Se usará como default editable al crear mantenimientos.
              </p>
            ) : (
              <ul className="space-y-2">
                {form.precios.map((p, idx) => (
                  <li key={idx} className="grid grid-cols-12 gap-2 items-center bg-white rounded-md ring-1 ring-slate-200 px-2.5 py-2">
                    <select className="select col-span-6 !py-1.5 text-sm" required
                      value={p.id_tipo_servicio}
                      onChange={e => cambiarPrecio(idx, 'id_tipo_servicio', e.target.value)}>
                      <option value="">— Selecciona tipo —</option>
                      {tiposDisponibles(idx).map(t => (
                        <option key={t.id} value={t.id}>{t.nombre}</option>
                      ))}
                      {/* Preserva el tipo ya elegido aunque haya quedado fuera del filtro */}
                      {p.id_tipo_servicio && !tiposDisponibles(idx).some(t => t.id === Number(p.id_tipo_servicio)) && (
                        <option value={p.id_tipo_servicio}>
                          {tiposServicio.find(t => t.id === Number(p.id_tipo_servicio))?.nombre || `Tipo #${p.id_tipo_servicio}`}
                        </option>
                      )}
                    </select>
                    <input className="input col-span-3 !py-1.5 text-sm font-mono" type="number" step="0.01" min="0"
                      placeholder="0.00" required
                      value={p.precio} onChange={e => cambiarPrecio(idx, 'precio', e.target.value)} />
                    <select className="select col-span-2 !py-1.5 text-sm" value={p.moneda}
                      onChange={e => cambiarPrecio(idx, 'moneda', e.target.value)}>
                      <option value="PEN">PEN</option>
                      <option value="USD">USD</option>
                    </select>
                    <button type="button" onClick={() => quitarPrecio(idx)}
                      className="col-span-1 text-red-600 hover:underline text-xs">Quitar</button>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div className="sm:col-span-2">
            <label className="label">Observaciones</label>
            <textarea className="textarea" rows="3" value={form.observaciones} onChange={e => setForm(f => ({ ...f, observaciones: e.target.value }))} />
          </div>
        </form>
      </Modal>
    </>
  );
}
