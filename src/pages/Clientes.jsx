import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { clientesService, edificiosService, configuracionService, tiposServicioService } from '../services';
import PageHeader from '../components/common/PageHeader.jsx';
import Loader from '../components/common/Loader.jsx';
import Modal from '../components/common/Modal.jsx';
import EmptyState from '../components/common/EmptyState.jsx';
import Pagination, { usePaginatedList } from '../components/common/Pagination.jsx';
import { useToast } from '../components/common/Toast.jsx';
import { useAuth } from '../features/auth/AuthContext.jsx';
import { FileLink } from '../components/common/FilePreview.jsx';
import { formatFecha, hoyISO, formatTelefono } from '../utils/formatters.js';
import ClienteForm, { clienteFormInicial, clienteToForm } from '../components/clientes/ClienteForm.jsx';

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
  const [form, setForm] = useState(clienteFormInicial);
  const [editId, setEditId] = useState(null);
  const [saving, setSaving] = useState(false);
  const [exportando, setExportando] = useState(false);
  // Cliente seleccionado para inactivar/reactivar todos sus edificios (solo SA).
  const [clienteEdificios, setClienteEdificios] = useState(null);
  const [cambiandoEdificios, setCambiandoEdificios] = useState(false);
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

  // Los distritos para el filtro provienen de los edificios (la ubicación vive
  // ahí ahora), no del cliente.
  const cargarDistritos = () => {
    edificiosService.distritos().then(setDistritos).catch(() => {});
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

  const abrirNuevo = () => { setForm(clienteFormInicial); setEditId(null); setOpen(true); };
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
    setForm(clienteToForm(c, archivos, precios));
    setEditId(c.id);
    setOpen(true);
  };

  const guardar = async (payload) => {
    if (saving) return;
    setSaving(true);
    try {
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

  // Inactiva/reactiva en bloque todos los edificios del cliente (solo SA).
  const cambiarEstadoEdificios = async (estado) => {
    if (!clienteEdificios || cambiandoEdificios) return;
    setCambiandoEdificios(true);
    try {
      const { afectados } = await edificiosService.setEstadoCliente(clienteEdificios.id, estado);
      toast.success(afectados > 0
        ? `${afectados} edificio(s) ${estado === 0 ? 'inactivado(s)' : 'reactivado(s)'}`
        : 'No había edificios para cambiar');
      setClienteEdificios(null);
      cargar();
    } catch (err) {
      toast.error(err.response?.data?.error || 'No se pudo cambiar el estado de los edificios');
    } finally {
      setCambiandoEdificios(false);
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
            placeholder="Buscar por nombre, edificio, RUC, teléfono…"
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
                  <th className="table-th">Teléfono</th>
                  <th className="table-th">Edificios</th>
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
                          {c.contacto_principal_nombre && <div className="text-xs text-slate-500">{c.contacto_principal_nombre}</div>}
                        </td>
                        <td className="table-td"><span className="text-xs">{c.tipo_documento}</span> <span className="font-mono">{c.numero_documento || '—'}</span></td>
                        <td className="table-td font-mono text-xs">{formatTelefono(c.telefono)}</td>
                        <td className="table-td">{c._count?.edificios ?? 0}</td>
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
                          {esSuperAdmin && (c._count?.edificios ?? 0) > 0 && (
                            <button onClick={() => setClienteEdificios(c)} className="text-slate-600 hover:underline text-xs">Edificios</button>
                          )}
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
                      <div className="text-xs text-slate-500">{c.tipo_documento} {c.numero_documento || ''}</div>
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
                        {esSuperAdmin && (c._count?.edificios ?? 0) > 0 && (
                          <button onClick={() => setClienteEdificios(c)} className="text-xs text-slate-600">Edificios</button>
                        )}
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
        <ClienteForm
          formId="cliente-form"
          value={form}
          onChange={setForm}
          onSubmit={guardar}
          clasificaciones={clasificaciones}
          tiposServicio={tiposServicio}
        />
      </Modal>

      <Modal open={!!clienteEdificios} onClose={() => setClienteEdificios(null)} title="Edificios del cliente" size="sm"
        footer={
          <>
            <button className="btn-secondary" onClick={() => setClienteEdificios(null)} disabled={cambiandoEdificios}>Cerrar</button>
            <button className="btn-primary" onClick={() => cambiarEstadoEdificios(1)} disabled={cambiandoEdificios}>Reactivar todos</button>
            <button className="btn-danger" onClick={() => cambiarEstadoEdificios(0)} disabled={cambiandoEdificios}>Inactivar todos</button>
          </>
        }>
        <p className="text-sm text-slate-600">
          Acción exclusiva del Super Admin sobre <span className="font-semibold text-slate-800">{clienteEdificios?.nombre}</span>.
          Al inactivar todos sus edificios dejarán de verse para los demás roles, junto con sus ascensores, servicios y proyectos;
          solo el Super Admin seguirá viéndolos. No se elimina nada y puedes reactivarlos cuando quieras.
        </p>
      </Modal>
    </>
  );
}
