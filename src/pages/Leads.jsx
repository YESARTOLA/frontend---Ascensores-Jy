import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { leadsService, clientesService, edificiosService, ascensoresService, tiposServicioService, tiposAscensorService, ubigeoService, usuariosService, archivosService } from '../services';
import PageHeader from '../components/common/PageHeader.jsx';
import Loader from '../components/common/Loader.jsx';
import Modal from '../components/common/Modal.jsx';
import EmptyState from '../components/common/EmptyState.jsx';
import Pagination, { usePaginatedList } from '../components/common/Pagination.jsx';
import PadreTabs from '../components/common/PadreTabs.jsx';
import { useToast } from '../components/common/Toast.jsx';
import { useAuth } from '../features/auth/AuthContext.jsx';
import { FileLink } from '../components/common/FilePreview.jsx';
import { badgeEstado, hoyISO, formatFechaHora, sanearTelefono, formatTelefono, nombreEdificio, nombreCliente } from '../utils/formatters.js';
import { ESTADOS_LEAD, ESTADO_LEAD_COTIZADO, ESTADO_LEAD_INGRESADO, ESTADO_LEAD_DESCARTADO } from '../utils/estadoLead.js';
import ClienteForm, { clienteFormInicial } from '../components/clientes/ClienteForm.jsx';
import EdificioForm, { edificioFormInicial } from '../components/edificios/EdificioForm.jsx';
import AscensorForm, { ascensorFormInicial } from '../components/ascensores/AscensorForm.jsx';
import LeadForm, { leadFormInicial, leadAFormulario } from '../components/leads/LeadForm.jsx';

const inicialConvertir = { id_cliente: '', id_ascensor: '', id_tipo_servicio: '', fecha_programada: hoyISO(), hora_programada: '09:00', precio_interno: '', moneda: 'PEN', titulo: '', descripcion: '' };

export default function Leads() {
  const [clientes, setClientes] = useState([]);
  const [ascensores, setAscensores] = useState([]);
  const [tipos, setTipos] = useState([]);
  const [tiposAscensor, setTiposAscensor] = useState([]);
  const [ubigeo, setUbigeo] = useState([]);
  const [usuarios, setUsuarios] = useState([]);
  const [vendedores, setVendedores] = useState([]);
  // Filtros de la lista (server-side): buscador libre + vendedor + ubicación.
  const [filtros, setFiltros] = useState({ q: '', id_vendedor: '', provincia: '', codigo_ubigeo: '', id_padre: '' });
  const [open, setOpen] = useState(false);
  const [openConv, setOpenConv] = useState(null);
  const [openDescartar, setOpenDescartar] = useState(null);
  const [motivoDescarte, setMotivoDescarte] = useState('');
  const [openEdit, setOpenEdit] = useState(null);
  const [editForm, setEditForm] = useState(leadFormInicial);
  const [openHist, setOpenHist] = useState(null);
  const [historial, setHistorial] = useState(null);
  // Detalle del lead: observaciones, cotizaciones adjuntas y motivo de descarte.
  const [openDetalle, setOpenDetalle] = useState(null);
  const [detalleCots, setDetalleCots] = useState(null); // null = cargando
  // Adjuntar cotización en PDF (versionada). Se abre al pasar a "Cotizado" o
  // desde el detalle para registrar una nueva versión.
  const [openCotizacion, setOpenCotizacion] = useState(null);
  const [cotArchivo, setCotArchivo] = useState(null);
  const [cotVersionSiguiente, setCotVersionSiguiente] = useState(null);
  const [subiendoCot, setSubiendoCot] = useState(false);
  const [form, setForm] = useState(leadFormInicial);
  const [convForm, setConvForm] = useState(inicialConvertir);
  // Wizard de conversión: con cliente existente es un solo paso ('servicio');
  // con cliente nuevo encadena 'cliente' → 'edificio' → 'ascensor' → 'servicio'.
  const [convMode, setConvMode] = useState('existente');
  const [convStep, setConvStep] = useState('servicio');
  const [convGuardando, setConvGuardando] = useState(false);
  const [nuevoCliente, setNuevoCliente] = useState(null);
  const [nuevoEdificio, setNuevoEdificio] = useState(null);
  const [clienteForm, setClienteForm] = useState(clienteFormInicial);
  const [edConvForm, setEdConvForm] = useState(edificioFormInicial);
  const [ascForm, setAscForm] = useState(ascensorFormInicial);
  // Catálogos que solo usa el wizard (se cargan al abrir la conversión).
  const [catalogosConv, setCatalogosConv] = useState(null);
  const toast = useToast();
  const navigate = useNavigate();
  const { esSuperAdmin, esAdmin, esCoordinador, puedeVerPrecio } = useAuth();
  const puedeCrear = esSuperAdmin || esAdmin || esCoordinador;
  const puedeConvertir = esSuperAdmin || esAdmin;
  const puedeCotizar = esSuperAdmin || esAdmin;

  const { data, loading, total, page, pageSize, totalPages, setPage, setPageSize, recargar } =
    usePaginatedList(leadsService.paginate, filtros, { initialPageSize: 25 });
  const cargar = recargar;
  useEffect(() => {
    // Cada catálogo se aplica de forma independiente: si uno falla (p. ej.
    // /usuarios es solo para super_admin y devuelve 403 a admin/coordinador),
    // los demás dropdowns siguen funcionando en vez de quedar todos vacíos.
    const aplicar = (setter) => (r) => { if (r.status === 'fulfilled') setter(r.value); };
    Promise.allSettled([
      clientesService.list(), ascensoresService.list(), tiposServicioService.list(),
      tiposAscensorService.list(), ubigeoService.list(), usuariosService.list(), leadsService.vendedores()
    ]).then(([c, a, t, ta, ub, u, v]) => {
      aplicar(setClientes)(c); aplicar(setAscensores)(a); aplicar(setTipos)(t);
      aplicar(setTiposAscensor)(ta); aplicar(setUbigeo)(ub); aplicar(setUsuarios)(u);
      aplicar(setVendedores)(v);
    });
  }, []);

  // Cascada del filtro de ubicación: provincias distintas del catálogo ubigeo y
  // distritos de la provincia elegida (se derivan en memoria, sin pedir datos).
  const provinciasFiltro = useMemo(() => [...new Set(ubigeo.map(u => u.provincia))].sort(), [ubigeo]);
  const distritosFiltro = useMemo(
    () => filtros.provincia ? ubigeo.filter(u => u.provincia === filtros.provincia) : [],
    [ubigeo, filtros.provincia]
  );

  const ascensoresF = convForm.id_cliente ? ascensores.filter(a => String(a.edificio?.cliente?.id) === String(convForm.id_cliente)) : ascensores;

  const guardar = async (e) => {
    e.preventDefault();
    try { await leadsService.create(form); toast.success('Lead creado'); setOpen(false); setForm(leadFormInicial); cargar(); }
    catch (err) { toast.error(err.response?.data?.error || 'Error'); }
  };

  // Edición de datos importantes: máximo ediciones_max guardados con cambios
  // (lo controla el backend); super_admin edita sin límite.
  const puedeEditarLead = (l) => esSuperAdmin || (l.ediciones ?? 0) < l.ediciones_max;

  const abrirEditar = (l) => {
    setOpenEdit(l);
    setEditForm(leadAFormulario(l));
  };

  const guardarEdicion = async (e) => {
    e.preventDefault();
    try {
      await leadsService.update(openEdit.id, editForm);
      toast.success('Lead actualizado'); setOpenEdit(null); cargar();
    } catch (err) { toast.error(err.response?.data?.error || 'Error'); }
  };

  // Trazabilidad de ediciones (solo super_admin).
  const abrirHistorial = async (l) => {
    setOpenHist(l); setHistorial(null);
    try { setHistorial(await leadsService.historial(l.id)); }
    catch (err) { toast.error(err.response?.data?.error || 'Error al cargar el historial'); setOpenHist(null); }
  };

  const abrirConvertir = (l) => {
    setOpenConv(l);
    setConvMode('existente');
    setConvStep('servicio');
    setNuevoCliente(null);
    setConvForm({ ...inicialConvertir, id_cliente: l.id_cliente || '', id_tipo_servicio: l.id_tipo_servicio_solicitado || '' });
    setNuevoEdificio(null);
    // Pre-carga del alta de cliente con los datos del lead: empresa del
    // prospecto (razón social + RUC) y datos de contacto.
    setClienteForm({
      ...clienteFormInicial,
      nombre: l.razon_social || l.nombre_contacto || '',
      numero_documento: l.ruc || '',
      contacto_principal_nombre: l.nombre_contacto || '',
      contacto_principal_correo: l.correo || '',
      contacto_principal_telefono: sanearTelefono(l.telefono || '')
    });
    // Pre-carga del edificio con la ubicación del lead (proyecto + distrito).
    setEdConvForm({
      ...edificioFormInicial,
      nombre: l.nombre_proyecto || l.razon_social || l.nombre_contacto || '',
      distrito: l.ubigeo?.distrito || ''
    });
    setAscForm(ascensorFormInicial);
    if (!catalogosConv) {
      Promise.all([edificiosService.distritos(), clientesService.clasificaciones(), edificiosService.tipos(), tiposAscensorService.list()])
        .then(([distritos, clasificaciones, tiposEdificio, tiposAscensor]) =>
          setCatalogosConv({ distritos, clasificaciones, tiposEdificio, tiposAscensor }))
        .catch(() => {});
    }
  };

  const cerrarConvertir = () => {
    setOpenConv(null);
    setConvForm(inicialConvertir);
    setConvMode('existente');
    setConvStep('servicio');
    setNuevoCliente(null);
    setNuevoEdificio(null);
    setClienteForm(clienteFormInicial);
    setEdConvForm(edificioFormInicial);
    setAscForm(ascensorFormInicial);
  };

  const cambiarModoConv = (modo) => {
    // Una vez creado el cliente nuevo ya no se puede retroceder de modo.
    if (nuevoCliente || modo === convMode) return;
    setConvMode(modo);
    setConvStep(modo === 'nuevo' ? 'cliente' : 'servicio');
  };

  // Paso 1 (cliente nuevo): crea el cliente real vía POST /clientes. Si el
  // usuario abandona después, el cliente persiste y puede usarse como existente.
  const crearClienteConv = async (payload) => {
    if (convGuardando) return;
    setConvGuardando(true);
    try {
      const cliente = await clientesService.create(payload);
      setNuevoCliente(cliente);
      setClientes(prev => [...prev, cliente]);
      setConvForm(f => ({ ...f, id_cliente: String(cliente.id), id_ascensor: '' }));
      toast.success('Cliente creado');
      setConvStep('edificio');
    } catch (err) { toast.error(err.response?.data?.error || 'Error al crear el cliente'); }
    finally { setConvGuardando(false); }
  };

  // Paso 2 (cliente nuevo): crea el edificio del cliente recién creado.
  const crearEdificioConv = async (payload) => {
    if (convGuardando) return;
    setConvGuardando(true);
    try {
      const edificio = await edificiosService.create({ ...payload, id_cliente: Number(nuevoCliente.id) });
      setNuevoEdificio(edificio);
      setAscForm(f => ({ ...f, id_edificio: String(edificio.id), tipo: openConv?.tipo_ascensor?.nombre || catalogosConv?.tiposAscensor?.[0]?.nombre || '' }));
      toast.success('Edificio creado');
      setConvStep('ascensor');
    } catch (err) { toast.error(err.response?.data?.error || 'Error al crear el edificio'); }
    finally { setConvGuardando(false); }
  };

  // Paso 3 (cliente nuevo): crea el ascensor en el edificio recién creado.
  const crearAscensorConv = async () => {
    if (convGuardando) return;
    setConvGuardando(true);
    try {
      const asc = await ascensoresService.create(ascForm);
      setAscensores(prev => [...prev, asc]);
      setConvForm(f => ({ ...f, id_ascensor: String(asc.id) }));
      toast.success('Ascensor creado');
      setConvStep('servicio');
    } catch (err) { toast.error(err.response?.data?.error || 'Error al crear el ascensor'); }
    finally { setConvGuardando(false); }
  };

  const convertir = async () => {
    if (convGuardando) return;
    setConvGuardando(true);
    try {
      await leadsService.convertir(openConv.id, convForm);
      toast.success('Lead convertido a servicio'); cerrarConvertir(); cargar();
    } catch (err) { toast.error(err.response?.data?.error || 'Error'); }
    finally { setConvGuardando(false); }
  };

  const cambiarEstado = async (lead, estado_lead) => {
    if (estado_lead === lead.estado_lead) return;
    // Descartar requiere motivo: se pide en un modal antes de llamar al backend.
    if (estado_lead === ESTADO_LEAD_DESCARTADO) {
      setMotivoDescarte('');
      setOpenDescartar(lead);
      return;
    }
    // Cotizar requiere el PDF de la cotización: el estado lo fija el backend
    // al registrar la versión, no este endpoint.
    if (estado_lead === ESTADO_LEAD_COTIZADO) {
      abrirAdjuntarCotizacion(lead);
      return;
    }
    try {
      await leadsService.cambiarEstado(lead.id, estado_lead);
      toast.success('Estado actualizado'); cargar();
    } catch (err) { toast.error(err.response?.data?.error || 'Error'); }
  };

  const abrirDetalle = (l) => {
    setOpenDetalle(l);
    setDetalleCots(null);
    leadsService.cotizaciones(l.id).then(setDetalleCots).catch(() => setDetalleCots([]));
  };

  const abrirAdjuntarCotizacion = (l) => {
    setOpenCotizacion(l);
    setCotArchivo(null);
    setCotVersionSiguiente(null);
    leadsService.cotizaciones(l.id)
      .then(cots => setCotVersionSiguiente((cots[0]?.version || 0) + 1))
      .catch(() => setCotVersionSiguiente(1));
  };

  const adjuntarCotizacion = async (e) => {
    e.preventDefault();
    if (subiendoCot) return;
    if (!cotArchivo) { toast.error('Selecciona el PDF de la cotización'); return; }
    if (!/pdf$/i.test(cotArchivo.type) && !/\.pdf$/i.test(cotArchivo.name)) {
      toast.error('La cotización debe ser un archivo PDF');
      return;
    }
    setSubiendoCot(true);
    try {
      const fd = new FormData();
      fd.append('archivo', cotArchivo);
      const arch = await archivosService.upload(fd, 'cotizaciones');
      const cot = await leadsService.subirCotizacion(openCotizacion.id, arch.id);
      toast.success(`Cotización adjuntada (versión ${cot.version})`);
      // Si el detalle del mismo lead está abierto, refrescar su lista y estado.
      if (openDetalle?.id === openCotizacion.id) {
        leadsService.cotizaciones(openDetalle.id).then(setDetalleCots).catch(() => {});
        setOpenDetalle(prev => prev && prev.estado_lead !== ESTADO_LEAD_INGRESADO
          ? { ...prev, estado_lead: ESTADO_LEAD_COTIZADO }
          : prev);
      }
      setOpenCotizacion(null);
      setCotArchivo(null);
      cargar();
    } catch (err) { toast.error(err.response?.data?.error || 'Error al adjuntar la cotización'); }
    finally { setSubiendoCot(false); }
  };

  const descartar = async () => {
    if (!motivoDescarte.trim()) { toast.error('El motivo de descarte es obligatorio'); return; }
    try {
      await leadsService.cambiarEstado(openDescartar.id, ESTADO_LEAD_DESCARTADO, motivoDescarte.trim());
      toast.success('Lead descartado'); setOpenDescartar(null); setMotivoDescarte(''); cargar();
    } catch (err) { toast.error(err.response?.data?.error || 'Error'); }
  };

  return (
    <>
      <PageHeader title="Leads" subtitle={`${total} lead(s)`} actions={puedeCrear && <button onClick={() => setOpen(true)} className="btn-primary">+ Nuevo lead</button>} />

      <PadreTabs
        padres={tipos.filter(t => t.es_padre)}
        value={filtros.id_padre}
        onChange={k => setFiltros(f => ({ ...f, id_padre: k }))}
        incluyeSinClasificar
      />

      <div className="card mb-4">
        <div className="p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
          <input
            className="input lg:col-span-2"
            placeholder="Buscar por proyecto, contacto, empresa, RUC, cliente…"
            value={filtros.q}
            onChange={e => setFiltros(f => ({ ...f, q: e.target.value }))}
          />
          <select className="select" value={filtros.id_vendedor}
            onChange={e => setFiltros(f => ({ ...f, id_vendedor: e.target.value }))}>
            <option value="">Todos los vendedores</option>
            {vendedores.map(v => <option key={v.id} value={v.id}>{v.nombres}</option>)}
          </select>
          <select className="select" value={filtros.provincia}
            onChange={e => setFiltros(f => ({ ...f, provincia: e.target.value, codigo_ubigeo: '' }))}>
            <option value="">Todas las provincias</option>
            {provinciasFiltro.map(p => <option key={p} value={p}>{p}</option>)}
          </select>
          <select className="select lg:col-span-3" value={filtros.codigo_ubigeo} disabled={!filtros.provincia}
            onChange={e => setFiltros(f => ({ ...f, codigo_ubigeo: e.target.value }))}>
            <option value="">{filtros.provincia ? 'Todos los distritos' : 'Elige una provincia primero'}</option>
            {distritosFiltro.map(d => <option key={d.codigo} value={d.codigo}>{d.distrito}</option>)}
          </select>
          <button type="button" className="btn-secondary"
            onClick={() => setFiltros(f => ({ q: '', id_vendedor: '', provincia: '', codigo_ubigeo: '', id_padre: f.id_padre }))}>
            Limpiar filtros
          </button>
        </div>
      </div>

      <div className="card">
        {loading ? <Loader /> : data.length === 0 ? <EmptyState title="Sin leads" /> : (
          <div className="overflow-x-auto scroll-thin">
            <table className="table-base">
              <thead><tr>
                <th className="table-th">Contacto</th><th className="table-th">Proyecto</th>
                <th className="table-th">Ubicación</th><th className="table-th">Canal</th>
                <th className="table-th">Servicio solicitado</th><th className="table-th">Cliente</th>
                <th className="table-th">Vendedor</th>
                <th className="table-th">Estado</th><th className="table-th">Registrado</th>
                <th className="table-th">Registrado por</th><th className="table-th">Rol</th>
                <th className="table-th text-right">Acciones</th>
              </tr></thead>
              <tbody className="divide-y divide-slate-100">
                {data.map(l => (
                  <tr key={l.id} className="table-row-hover">
                    <td className="table-td"><div className="text-sm">{l.nombre_contacto}</div><div className="text-xs text-slate-500 font-mono">{formatTelefono(l.telefono)}</div>{l.correo && <div className="text-xs text-slate-500">{l.correo}</div>}</td>
                    <td className="table-td text-xs">{l.nombre_proyecto || '—'}{l.tipo_ascensor && <div className="text-slate-500">{l.tipo_ascensor.nombre}</div>}</td>
                    <td className="table-td text-xs">{l.ubigeo ? <span title={`${l.ubigeo.distrito}, ${l.ubigeo.provincia}, ${l.ubigeo.departamento}`}>{l.ubigeo.distrito}</span> : '—'}</td>
                    <td className="table-td text-xs"><span className="badge-blue">{l.canal || '—'}</span></td>
                    <td className="table-td text-xs">{l.tipo_servicio?.nombre || '—'}</td>
                    <td className="table-td text-xs">{l.cliente?.nombre || '—'}</td>
                    <td className="table-td text-xs">{l.vendedor?.nombres || '—'}</td>
                    <td className="table-td">
                      {puedeCrear ? (
                        <select
                          className="select text-xs !py-1"
                          value={l.estado_lead}
                          onChange={e => cambiarEstado(l, e.target.value)}
                        >
                          {ESTADOS_LEAD.map(s => <option key={s} value={s}>{s}</option>)}
                        </select>
                      ) : (
                        <span className={badgeEstado(l.estado_lead)}>{l.estado_lead}</span>
                      )}
                      {l.estado_lead === ESTADO_LEAD_DESCARTADO && l.motivo_descarte && (
                        <div className="text-xs text-rose-600 mt-1 max-w-[200px] truncate" title={l.motivo_descarte}>
                          {l.motivo_descarte}
                        </div>
                      )}
                    </td>
                    <td className="table-td text-xs">{formatFechaHora(l.date_time_registration)}</td>
                    <td className="table-td text-xs">{l.usuario_registrador?.nombres || '—'}</td>
                    <td className="table-td text-xs">
                      {l.rol_nombre_registrador || l.rol_codigo_registrador
                        ? <span className="badge-violet">{l.rol_nombre_registrador || l.rol_codigo_registrador}</span>
                        : <span className="text-slate-400">—</span>}
                    </td>
                    <td className="table-td text-right">
                      <div className="flex flex-wrap gap-2 justify-end text-xs">
                        <button onClick={() => abrirDetalle(l)} className="text-sky-700 hover:underline">Detalle</button>
                        {puedeCrear && (puedeEditarLead(l) ? (
                          <button onClick={() => abrirEditar(l)} className="text-slate-700 hover:underline">Editar</button>
                        ) : (
                          <span className="text-slate-400" title={`Este lead ya alcanzó el máximo de ${l.ediciones_max} ediciones`}>
                            {l.ediciones}/{l.ediciones_max} ediciones
                          </span>
                        ))}
                        {esSuperAdmin && (
                          <button onClick={() => abrirHistorial(l)} className="text-violet-700 hover:underline">Historial</button>
                        )}
                        {puedeCotizar && l.estado_lead !== ESTADO_LEAD_INGRESADO && l.estado_lead !== ESTADO_LEAD_DESCARTADO && l.id_cliente && (
                          <button
                            onClick={() => navigate(`/cotizaciones?nuevo=1&id_lead=${l.id}&id_cliente=${l.id_cliente}${l.id_tipo_servicio_solicitado ? `&id_tipo_servicio=${l.id_tipo_servicio_solicitado}` : ''}`)}
                            className="text-brand-700 hover:underline">
                            Cotizar
                          </button>
                        )}
                        {puedeConvertir && l.estado_lead !== ESTADO_LEAD_INGRESADO && l.estado_lead !== ESTADO_LEAD_DESCARTADO && (
                          <button onClick={() => abrirConvertir(l)} className="text-emerald-700 hover:underline">Convertir directo</button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {!loading && data.length > 0 && (
          <Pagination page={page} pageSize={pageSize} total={total} totalPages={totalPages}
            onPage={setPage} onPageSize={setPageSize} />
        )}
      </div>

      <Modal open={open} onClose={() => setOpen(false)} title="Nuevo lead"
        footer={<><button className="btn-secondary" onClick={() => setOpen(false)}>Cancelar</button><button className="btn-primary" type="submit" form="lead-form">Guardar</button></>}>
        <LeadForm formId="lead-form" value={form} onChange={setForm} onSubmit={guardar}
          ubigeo={ubigeo} tiposAscensor={tiposAscensor} tiposServicio={tipos} usuarios={usuarios} clientes={clientes} />
      </Modal>

      <Modal open={!!openEdit} onClose={() => setOpenEdit(null)} title={`Editar lead: ${openEdit?.nombre_contacto}`}
        footer={<><button className="btn-secondary" onClick={() => setOpenEdit(null)}>Cancelar</button><button className="btn-primary" type="submit" form="lead-edit-form">Guardar cambios</button></>}>
        {openEdit && (
          <>
            <p className="text-xs text-slate-500 mb-4">
              {esSuperAdmin
                ? `Ediciones realizadas: ${openEdit.ediciones} (sin límite para superadministrador)`
                : `Ediciones: ${openEdit.ediciones}/${openEdit.ediciones_max} — al guardar cambios se consume 1`}
            </p>
            <LeadForm formId="lead-edit-form" value={editForm} onChange={setEditForm} onSubmit={guardarEdicion}
              ubigeo={ubigeo} tiposAscensor={tiposAscensor} tiposServicio={tipos} usuarios={usuarios} clientes={clientes} />
          </>
        )}
      </Modal>

      <Modal open={!!openHist} onClose={() => setOpenHist(null)} title={`Historial de ediciones: ${openHist?.nombre_contacto}`} size="lg"
        footer={<button className="btn-secondary" onClick={() => setOpenHist(null)}>Cerrar</button>}>
        {historial === null ? <Loader /> : historial.length === 0 ? (
          <EmptyState title="Sin ediciones registradas" />
        ) : (
          <div className="space-y-4">
            {historial.map(ev => (
              <div key={ev.id} className="border border-slate-200 rounded-lg p-3">
                <div className="flex items-center justify-between text-xs text-slate-500 mb-2">
                  <span className="font-medium text-slate-700">{ev.usuario || '—'}</span>
                  <span>{formatFechaHora(ev.fecha)}</span>
                </div>
                <table className="w-full text-xs">
                  <thead><tr className="text-left text-slate-500">
                    <th className="py-1 pr-2 font-medium">Campo</th>
                    <th className="py-1 pr-2 font-medium">Antes</th>
                    <th className="py-1 font-medium">Después</th>
                  </tr></thead>
                  <tbody className="divide-y divide-slate-100">
                    {[...new Set([...Object.keys(ev.anterior), ...Object.keys(ev.nuevo)])].map(campo => (
                      <tr key={campo}>
                        <td className="py-1 pr-2 text-slate-600">{campo}</td>
                        <td className="py-1 pr-2 text-rose-700">{ev.anterior[campo] ?? '—'}</td>
                        <td className="py-1 text-emerald-700">{ev.nuevo[campo] ?? '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ))}
          </div>
        )}
      </Modal>

      <Modal open={!!openDetalle} onClose={() => setOpenDetalle(null)} title={`Detalle del lead: ${openDetalle?.nombre_contacto}`} size="lg"
        footer={<button className="btn-secondary" onClick={() => setOpenDetalle(null)}>Cerrar</button>}>
        {openDetalle && (
          <div className="space-y-4">
            {/* Datos de contacto y estado */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
              <div>
                <div className="text-xs text-slate-500">Contacto</div>
                <div className="text-slate-800">{openDetalle.nombre_contacto}</div>
                <div className="text-xs text-slate-500 font-mono">{formatTelefono(openDetalle.telefono)}</div>
                {openDetalle.correo && <div className="text-xs text-slate-500">{openDetalle.correo}</div>}
              </div>
              <div>
                <div className="text-xs text-slate-500">Estado</div>
                <span className={badgeEstado(openDetalle.estado_lead)}>{openDetalle.estado_lead}</span>
              </div>
              {openDetalle.nombre_proyecto && (
                <div>
                  <div className="text-xs text-slate-500">Proyecto</div>
                  <div className="text-slate-800">{openDetalle.nombre_proyecto}</div>
                </div>
              )}
              {openDetalle.ubigeo && (
                <div>
                  <div className="text-xs text-slate-500">Ubicación</div>
                  <div className="text-slate-800">{openDetalle.ubigeo.distrito}, {openDetalle.ubigeo.provincia}, {openDetalle.ubigeo.departamento}</div>
                </div>
              )}
            </div>

            {/* Motivo de descarte */}
            {openDetalle.estado_lead === ESTADO_LEAD_DESCARTADO && (
              <div className="border border-rose-200 rounded-lg p-3 bg-rose-50/50">
                <div className="text-xs font-semibold text-rose-700 mb-1">Motivo de descarte</div>
                <p className="text-sm text-rose-800 whitespace-pre-wrap">{openDetalle.motivo_descarte || '—'}</p>
              </div>
            )}

            {/* Observaciones */}
            <div className="border border-slate-200 rounded-lg p-3 bg-slate-50/40">
              <div className="text-xs font-semibold text-slate-700 mb-1">Observaciones</div>
              <p className="text-sm text-slate-700 whitespace-pre-wrap">{openDetalle.observaciones || 'Sin observaciones registradas.'}</p>
            </div>

            {/* Cotizaciones adjuntas (versiones) */}
            {(openDetalle.estado_lead === ESTADO_LEAD_COTIZADO || (detalleCots?.length ?? 0) > 0) && (
              <div className="border border-slate-200 rounded-lg p-3 bg-slate-50/40">
                <div className="flex items-center justify-between mb-2">
                  <div className="text-xs font-semibold text-slate-700">Cotizaciones adjuntas</div>
                  {puedeCrear && openDetalle.estado_lead !== ESTADO_LEAD_DESCARTADO && (
                    <button type="button" onClick={() => abrirAdjuntarCotizacion(openDetalle)}
                      className="btn-ghost text-xs !py-1.5 !px-3">
                      + Nueva versión
                    </button>
                  )}
                </div>
                {detalleCots === null ? <Loader /> : detalleCots.length === 0 ? (
                  <p className="text-xs text-slate-500">Aún no se adjuntó ningún PDF de cotización.</p>
                ) : (
                  <ul className="space-y-2">
                    {detalleCots.map(c => (
                      <li key={c.id} className="flex items-center gap-3 bg-white rounded-md ring-1 ring-slate-200 px-3 py-2">
                        <span className="badge-blue shrink-0">v{c.version}</span>
                        <FileLink archivo={c.archivo} className="text-brand-700 hover:underline text-sm truncate min-w-0 flex-1 text-left"
                          title={c.archivo?.nombre_original}>
                          📄 {c.archivo?.nombre_original || `Cotización v${c.version}`}
                        </FileLink>
                        <div className="text-right shrink-0">
                          <div className="text-xs text-slate-500">{formatFechaHora(c.date_time_registration)}</div>
                          {c.usuario_registrador?.nombres && <div className="text-[11px] text-slate-400">{c.usuario_registrador.nombres}</div>}
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </div>
        )}
      </Modal>

      <Modal open={!!openCotizacion} onClose={() => setOpenCotizacion(null)} title={`Adjuntar cotización: ${openCotizacion?.nombre_contacto}`}
        footer={<>
          <button className="btn-secondary" onClick={() => setOpenCotizacion(null)} disabled={subiendoCot}>Cancelar</button>
          <button className="btn-primary" type="submit" form="lead-cotizacion-form" disabled={subiendoCot}>
            {subiendoCot ? 'Subiendo…' : 'Adjuntar cotización'}
          </button>
        </>}>
        <form id="lead-cotizacion-form" onSubmit={adjuntarCotizacion} className="space-y-3">
          <p className="text-xs text-slate-500">
            Se registrará como <span className="font-semibold text-slate-700">versión {cotVersionSiguiente ?? '…'}</span>
            {openCotizacion && openCotizacion.estado_lead !== ESTADO_LEAD_COTIZADO && openCotizacion.estado_lead !== ESTADO_LEAD_INGRESADO &&
              <> y el lead pasará a estado <span className="font-semibold text-slate-700">Cotizado</span></>}.
          </p>
          <div>
            <label className="label">PDF de la cotización *</label>
            <input type="file" required accept="application/pdf,.pdf" className="input"
              onChange={e => setCotArchivo(e.target.files?.[0] || null)} />
          </div>
        </form>
      </Modal>

      <Modal open={!!openDescartar} onClose={() => setOpenDescartar(null)} title={`Descartar lead: ${openDescartar?.nombre_contacto}`}
        footer={<><button className="btn-secondary" onClick={() => setOpenDescartar(null)}>Cancelar</button><button className="btn-primary" onClick={descartar}>Descartar</button></>}>
        <form onSubmit={(e) => { e.preventDefault(); descartar(); }}>
          <label className="label">Motivo de descarte *</label>
          <textarea className="textarea" rows="3" required autoFocus
            placeholder="Ej.: No respondió, eligió otra empresa, precio fuera de presupuesto…"
            value={motivoDescarte} onChange={e => setMotivoDescarte(e.target.value)} />
          <p className="text-xs text-slate-500 mt-2">El lead puede reactivarse luego cambiándolo a otro estado; al reactivarlo, el motivo se elimina.</p>
        </form>
      </Modal>

      <Modal open={!!openConv} onClose={cerrarConvertir} title={`Convertir lead: ${openConv?.nombre_contacto}`} size="lg"
        footer={<>
          <button className="btn-secondary" onClick={cerrarConvertir} disabled={convGuardando}>Cancelar</button>
          {convMode === 'nuevo' && convStep === 'cliente' && (
            <button className="btn-primary" type="submit" form="conv-cliente-form" disabled={convGuardando}>
              {convGuardando ? 'Creando…' : 'Crear cliente y continuar'}
            </button>
          )}
          {convMode === 'nuevo' && convStep === 'edificio' && (
            <button className="btn-primary" type="submit" form="conv-edificio-form" disabled={convGuardando}>
              {convGuardando ? 'Creando…' : 'Crear edificio y continuar'}
            </button>
          )}
          {convMode === 'nuevo' && convStep === 'ascensor' && (
            <button className="btn-primary" type="submit" form="conv-ascensor-form" disabled={convGuardando}>
              {convGuardando ? 'Creando…' : 'Crear ascensor y continuar'}
            </button>
          )}
          {convStep === 'servicio' && (
            <button className="btn-primary" type="submit" form="conv-servicio-form" disabled={convGuardando}>
              {convGuardando ? 'Convirtiendo…' : 'Convertir'}
            </button>
          )}
        </>}>
        {/* Selector de origen del cliente */}
        <div className="mb-4">
          <div className="inline-flex rounded-lg ring-1 ring-slate-200 overflow-hidden">
            {[
              { modo: 'existente', etiqueta: 'Cliente existente' },
              { modo: 'nuevo', etiqueta: 'Crear cliente nuevo' }
            ].map(({ modo, etiqueta }) => (
              <button key={modo} type="button"
                onClick={() => cambiarModoConv(modo)}
                disabled={!!nuevoCliente}
                className={`px-4 py-2 text-sm font-medium transition ${convMode === modo
                  ? 'bg-brand-600 text-white'
                  : 'bg-white text-slate-600 hover:bg-slate-50'} ${nuevoCliente ? 'opacity-60 cursor-not-allowed' : ''}`}>
                {etiqueta}
              </button>
            ))}
          </div>
          {convMode === 'nuevo' && (
            <p className="text-xs text-slate-500 mt-2">
              {convStep === 'cliente' && 'Paso 1 de 4 — Datos del nuevo cliente'}
              {convStep === 'edificio' && 'Paso 2 de 4 — Edificio u obra del cliente'}
              {convStep === 'ascensor' && 'Paso 3 de 4 — Ascensor del edificio'}
              {convStep === 'servicio' && 'Paso 4 de 4 — Datos del servicio'}
            </p>
          )}
        </div>

        {convMode === 'nuevo' && convStep === 'cliente' && (
          <ClienteForm
            formId="conv-cliente-form"
            value={clienteForm}
            onChange={setClienteForm}
            onSubmit={crearClienteConv}
            clasificaciones={catalogosConv?.clasificaciones || []}
            tiposServicio={tipos}
          />
        )}

        {convMode === 'nuevo' && convStep === 'edificio' && (
          <EdificioForm
            formId="conv-edificio-form"
            value={edConvForm}
            onChange={setEdConvForm}
            onSubmit={crearEdificioConv}
            tipos={catalogosConv?.tiposEdificio || []}
            distritos={catalogosConv?.distritos || []}
          />
        )}

        {convMode === 'nuevo' && convStep === 'ascensor' && (
          <AscensorForm
            formId="conv-ascensor-form"
            value={ascForm}
            onChange={setAscForm}
            onSubmit={crearAscensorConv}
            tipos={catalogosConv?.tiposAscensor || []}
            edificioFijo
            edificioNombre={nuevoEdificio?.nombre}
          />
        )}

        {convStep === 'servicio' && (
          <form id="conv-servicio-form" onSubmit={(e) => { e.preventDefault(); convertir(); }} className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {convMode === 'nuevo' ? (
              <div className="sm:col-span-2 border border-emerald-200 rounded-lg p-3 bg-emerald-50/50 text-sm text-slate-700">
                <span className="font-medium">Cliente:</span> {nombreCliente(nuevoCliente)}
                <span className="mx-2 text-slate-300">·</span>
                <span className="font-medium">Edificio:</span> {nombreEdificio(nuevoEdificio)}
                <span className="mx-2 text-slate-300">·</span>
                <span className="font-medium">Ascensor:</span> <span className="font-mono">{ascForm.codigo}</span>
              </div>
            ) : (
              <>
                <div>
                  <label className="label">Cliente *</label>
                  <select className="select" required value={convForm.id_cliente} onChange={e => setConvForm(f => ({ ...f, id_cliente: e.target.value, id_ascensor: '' }))}><option value="">—</option>{clientes.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}</select>
                </div>
                <div>
                  <label className="label">Ascensor *</label>
                  <select className="select" required value={convForm.id_ascensor} onChange={e => setConvForm(f => ({ ...f, id_ascensor: e.target.value }))}><option value="">—</option>{ascensoresF.map(a => <option key={a.id} value={a.id}>{a.codigo}</option>)}</select>
                </div>
              </>
            )}
            <div>
              <label className="label">Subtipo de servicio *</label>
              <select className="select" required value={convForm.id_tipo_servicio} onChange={e => setConvForm(f => ({ ...f, id_tipo_servicio: e.target.value }))}>
                <option value="">—</option>
                {tipos.filter(t => !t.es_padre).map(t => <option key={t.id} value={t.id}>{t.padre?.nombre ? `${t.padre.nombre} · ` : ''}{t.nombre}</option>)}
              </select>
              <p className="text-[11px] text-slate-500 mt-0.5">El subtipo define si se convierte en Proyecto o en un servicio operativo (Emergencias/Correctivos/Mantenimientos/Atención rápida).</p>
            </div>
            <div><label className="label">Fecha programada *</label><input type="date" required className="input" value={convForm.fecha_programada} onChange={e => setConvForm(f => ({ ...f, fecha_programada: e.target.value }))} /></div>
            <div><label className="label">Hora</label><input type="time" className="input" value={convForm.hora_programada} onChange={e => setConvForm(f => ({ ...f, hora_programada: e.target.value }))} /></div>
            {puedeVerPrecio && <div><label className="label">Precio (S/) *</label><input type="number" step="0.01" required className="input" value={convForm.precio_interno} onChange={e => setConvForm(f => ({ ...f, precio_interno: e.target.value }))} /></div>}
            <div className="sm:col-span-2"><label className="label">Título</label><input className="input" value={convForm.titulo} onChange={e => setConvForm(f => ({ ...f, titulo: e.target.value }))} /></div>
            <div className="sm:col-span-2"><label className="label">Descripción</label><textarea className="textarea" rows="2" value={convForm.descripcion} onChange={e => setConvForm(f => ({ ...f, descripcion: e.target.value }))} /></div>
          </form>
        )}
      </Modal>
    </>
  );
}
