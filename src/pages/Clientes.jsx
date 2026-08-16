import { Fragment, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { clientesService, edificiosService, configuracionService } from '../services';
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
import ContratoNuevoModal from '../components/clientes/ContratoNuevoModal.jsx';

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

// Área cuyos datos de contrato y documentación registra el cliente (la misma
// pregunta del formulario de alta). Es inclusivo: "Área de Servicios" también
// devuelve a los clientes que registran las dos áreas.
const AREA_CONTRATO = [
  { value: '', label: 'Todas las áreas' },
  { value: 'servicio', label: 'Área de Servicios' },
  { value: 'proyecto', label: 'Área de Proyectos' },
  { value: 'ambos', label: 'Ambas áreas' }
];

// Teléfono mostrado en el listado: el del contacto principal, con el teléfono
// general del cliente como respaldo cuando el contacto no tiene uno cargado.
const telefonoContacto = (c) =>
  formatTelefono(c.contacto_principal_telefono) || formatTelefono(c.telefono);

function estadoContratoBadge(inicio, fin, diasAviso) {
  if (!inicio || !fin) return { texto: 'Sin contrato', clase: 'bg-slate-100 text-slate-600' };
  const hoy = hoyISO();
  const f = String(fin).slice(0, 10);
  const i = String(inicio).slice(0, 10);
  if (f < hoy) return { texto: 'Vencido', clase: 'bg-red-100 text-red-700' };
  if (i > hoy) return { texto: 'Pendiente', clase: 'bg-slate-100 text-slate-600' };
  const dHoy = new Date(hoy + 'T00:00:00.000Z');
  const dFin = new Date(f + 'T00:00:00.000Z');
  const dias = Math.round((dFin - dHoy) / 86400000);
  if (dias <= diasAviso) return { texto: 'Por vencer', sub: `${dias}d`, clase: 'bg-amber-100 text-amber-700' };
  return { texto: 'Vigente', clase: 'bg-emerald-100 text-emerald-700' };
}

const AREAS_CONTRATO_LABEL = { servicio: 'Servicios', proyecto: 'Proyectos' };

// Señala de forma discreta por qué entró el cliente en los resultados cuando la
// coincidencia no fue por sus propios datos sino por un edificio/obra o por un
// ascensor suyo (el backend los devuelve en `*_coincidentes` al buscar).
function Coincidencias({ cliente }) {
  const edificios = cliente.edificios_coincidentes || [];
  const ascensores = cliente.ascensores_coincidentes || [];
  if (edificios.length === 0 && ascensores.length === 0) return null;

  const chip = (texto, key) => (
    <span key={key} className="font-semibold text-amber-700 bg-amber-50 rounded px-1 py-0.5">{texto}</span>
  );
  const linea = (etiqueta, items, render) => {
    if (items.length === 0) return null;
    return (
      <div className="text-[11px] text-slate-400 mt-0.5 leading-tight">
        <span className="italic">{etiqueta}:</span>{' '}
        {items.slice(0, 2).map((it, i) => (
          <Fragment key={it.id}>{i > 0 && ', '}{chip(render(it), it.id)}</Fragment>
        ))}
        {items.length > 2 && <span className="italic"> +{items.length - 2} más</span>}
      </div>
    );
  };

  return (
    <>
      {linea('Coincide', edificios, e => e.nombre)}
      {linea('Ascensor', ascensores, a => [a.codigo, a.edificio].filter(Boolean).join(' · '))}
    </>
  );
}

export default function Clientes() {
  const [filtros, setFiltros] = useState({ q: '', distrito: '', tipo_ascensor: '', clasificacion: '', estado_contrato: '', con_contrato: '', area_contrato: '' });
  const [clasificaciones, setClasificaciones] = useState([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(clienteFormInicial);
  const [editId, setEditId] = useState(null);
  const [saving, setSaving] = useState(false);
  const [exportando, setExportando] = useState(false);
  // Cliente seleccionado para inactivar/reactivar todos sus edificios (solo SA).
  const [clienteEdificios, setClienteEdificios] = useState(null);
  // Cliente al que se le registra un contrato nuevo (renovación).
  const [clienteContrato, setClienteContrato] = useState(null);
  const [cambiandoEdificios, setCambiandoEdificios] = useState(false);
  const [diasAviso, setDiasAviso] = useState(30);
  const [distritos, setDistritos] = useState([]);
  const [tiposAscensor, setTiposAscensor] = useState([]);
  const toast = useToast();
  const { esSuperAdmin, esAdmin, esCoordinador, esContabilidad, accesoServicios, accesoProyectos } = useAuth();
  const puedeEditar = esSuperAdmin || esAdmin || esCoordinador || esContabilidad;

  // Áreas de contrato visibles según el ámbito del usuario (Servicios/Proyectos).
  const areasContrato = ['servicio', 'proyecto'].filter(a => a === 'servicio' ? accesoServicios : accesoProyectos);

  // Resumen de contrato por área para el listado (badge + fechas + PDF).
  const renderContratoCell = (c) => (
    <div className="space-y-1">
      {areasContrato.map(area => {
        const inicio = c[`contrato_${area}_inicio`];
        const fin = c[`contrato_${area}_fin`];
        const arch = c[`archivo_contrato_${area}`];
        const badge = estadoContratoBadge(inicio, fin, diasAviso);
        return (
          <div key={area} className="flex flex-wrap items-center gap-1.5 text-xs">
            <span className="text-slate-400 w-[68px] shrink-0">{AREAS_CONTRATO_LABEL[area]}</span>
            <span className={`badge ${badge.clase} whitespace-nowrap`}>{badge.texto}{badge.sub ? ` · ${badge.sub}` : ''}</span>
            {(inicio || fin) && <span className="text-slate-500 whitespace-nowrap">{formatFecha(inicio)} → {formatFecha(fin)}</span>}
            {arch && <FileLink archivo={arch} className="text-brand-700 hover:underline">PDF</FileLink>}
          </div>
        );
      })}
    </div>
  );

  useEffect(() => {
    configuracionService.get('CLIENTES_DIAS_AVISO_VENCIMIENTO_CONTRATO')
      .then(r => setDiasAviso(Number(r.valor) || 30))
      .catch(() => {});
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
    // El listado no trae archivos; los pedimos del detalle.
    let archivos = Array.isArray(c.archivos) ? c.archivos : [];
    if (archivos.length === 0) {
      try {
        const full = await clientesService.get(c.id);
        archivos = Array.isArray(full?.archivos) ? full.archivos : [];
      } catch { /* si falla, seguimos con lo que haya */ }
    }
    setForm(clienteToForm(c, archivos));
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
            placeholder="Buscar por nombre, RUC, teléfono, edificio/obra o ascensor…"
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
          {/* Solo tiene sentido para quien ve las dos áreas: un usuario acotado
              ya recibe únicamente los clientes de la suya. */}
          {accesoServicios && accesoProyectos && (
            <select className="select lg:col-span-2" value={filtros.area_contrato}
              onChange={e => setFiltros(f => ({ ...f, area_contrato: e.target.value }))}>
              {AREA_CONTRATO.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          )}
          <select className={`select sm:col-span-2 ${accesoServicios && accesoProyectos ? 'lg:col-span-2' : 'lg:col-span-4'}`}
            value={filtros.con_contrato}
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
                  <th className="table-th">Edificios</th>
                  {areasContrato.map(area => {
                    const et = areasContrato.length > 1 ? ` (${AREAS_CONTRATO_LABEL[area]})` : '';
                    return (
                      <Fragment key={area}>
                        <th className="table-th">Inicio contrato{et}</th>
                        <th className="table-th">Fin contrato{et}</th>
                        <th className="table-th">Estado contrato{et}</th>
                        <th className="table-th">Contrato{et}</th>
                      </Fragment>
                    );
                  })}
                  <th className="table-th">Registrado por</th>
                  <th className="table-th text-right">Acciones</th>
                </tr></thead>
                <tbody className="divide-y divide-slate-100">
                  {data.map(c => {
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
                        <td className="table-td">
                          <div>{c._count?.edificios ?? 0}</div>
                          <Coincidencias cliente={c} />
                        </td>
                        {areasContrato.map(area => {
                          const inicio = c[`contrato_${area}_inicio`];
                          const fin = c[`contrato_${area}_fin`];
                          const arch = c[`archivo_contrato_${area}`];
                          const badge = estadoContratoBadge(inicio, fin, diasAviso);
                          return (
                            <Fragment key={area}>
                              <td className="table-td text-xs">{formatFecha(inicio)}</td>
                              <td className="table-td text-xs">{formatFecha(fin)}</td>
                              <td className="table-td">
                                <div className="flex flex-col items-start gap-0.5">
                                  <span className={`badge ${badge.clase} whitespace-nowrap`}>{badge.texto}</span>
                                  {badge.sub && <span className="text-[11px] font-semibold text-amber-700">Faltan {badge.sub}</span>}
                                </div>
                              </td>
                              <td className="table-td">
                                {arch
                                  ? <FileLink archivo={arch} className="text-brand-700 hover:underline text-xs">Ver PDF</FileLink>
                                  : <span className="text-slate-400 text-xs">—</span>}
                              </td>
                            </Fragment>
                          );
                        })}
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
                          {puedeEditar && (
                            <button onClick={() => setClienteContrato(c)} className="text-slate-600 hover:underline text-xs">Contrato nuevo</button>
                          )}
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
                return (
                  <div key={c.id} className="p-4 flex items-start gap-3">
                    <div className="h-9 w-9 rounded-full bg-brand-50 text-brand-700 grid place-items-center font-semibold text-sm shrink-0">{c.nombre[0]}</div>
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-slate-800 truncate">{c.nombre}</div>
                      <div className="text-xs text-slate-500">{c.tipo_documento} {c.numero_documento || ''}</div>
                      <div className="text-xs text-slate-500 mt-0.5 font-mono">{telefonoContacto(c)}</div>
                      <Coincidencias cliente={c} />
                      <div className="mt-1.5">{renderContratoCell(c)}</div>
                      {c.clasificacion && clasificacionByCodigo[c.clasificacion] && (
                        <div className="mt-1">
                          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold ring-1 ${clasificacionByCodigo[c.clasificacion].color}`}>
                            {clasificacionByCodigo[c.clasificacion].etiqueta}
                          </span>
                        </div>
                      )}
                      <div className="mt-2 flex gap-3">
                        <Link to={`/clientes/${c.id}`} className="text-xs text-brand-700 font-medium">Ver 360 →</Link>
                        {puedeEditar && <button onClick={() => abrirEdit(c)} className="text-xs text-slate-600">Editar</button>}
                        {puedeEditar && <button onClick={() => setClienteContrato(c)} className="text-xs text-slate-600">Contrato nuevo</button>}
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
        />
      </Modal>

      <ContratoNuevoModal
        cliente={clienteContrato}
        onClose={() => setClienteContrato(null)}
        onSaved={() => { setClienteContrato(null); cargar(); }}
      />

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
