import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { serviciosService, clientesService } from '../services';
import PageHeader from '../components/common/PageHeader.jsx';
import Loader from '../components/common/Loader.jsx';
import EmptyState from '../components/common/EmptyState.jsx';
import Modal from '../components/common/Modal.jsx';
import DateRangePicker from '../components/common/DateRangePicker.jsx';
import { FileLink } from '../components/common/FilePreview.jsx';
import Pagination, { usePaginatedList } from '../components/common/Pagination.jsx';
import { ListaMovil, FilaMovil, AccionFila } from '../components/common/ListaMovil.jsx';
import PanelFiltros from '../components/common/PanelFiltros.jsx';
import { useToast } from '../components/common/Toast.jsx';
import { badgeEstado, formatFecha, formatMonto, codigosAscensores, resumenAscensores } from '../utils/formatters.js';
import { ESTADOS_COBRO } from '../utils/estadoCobro.js';
import { ESTADOS_FACTURACION } from '../utils/estadoFactura.js';
import { useAuth } from '../features/auth/AuthContext.jsx';

const FILTROS_INICIALES = { q: '', id_cliente: '', estado_cobro: '', estado_facturacion: '', desde: '', hasta: '' };

export default function ServiciosRealizados() {
  const [openDetalle, setOpenDetalle] = useState(null);
  const [filtros, setFiltros] = useState(FILTROS_INICIALES);
  const [clientes, setClientes] = useState([]);
  const toast = useToast();
  const { puedeVerPrecio, esSuperAdmin, esAdmin, esContabilidad, esCoordinador, esTecnico } = useAuth();
  // Corrección del informe que dejó el técnico. Coordinación y administración
  // pueden arreglarlo hasta la revisión administrativa; el backend aplica el
  // corte real (utils/registrosTecnico.js), aquí solo se ofrece la acción.
  const [editandoNotas, setEditandoNotas] = useState(false);
  const [notasForm, setNotasForm] = useState({ observaciones_tecnicas: '', descargo_tecnico: '' });
  const [guardandoNotas, setGuardandoNotas] = useState(false);
  const gestionaRegistros = esSuperAdmin || esAdmin || esCoordinador;
  const puedeRevisar = esSuperAdmin || esAdmin || esContabilidad;
  const verCobroFactura = !esTecnico;

  const { data, loading, total, page, pageSize, totalPages, setPage, setPageSize, recargar } =
    usePaginatedList(serviciosService.realizadosPaginate, filtros, { initialPageSize: 25 });
  const cargar = recargar;

  const abrirEdicionNotas = () => {
    setNotasForm({
      observaciones_tecnicas: openDetalle?.observaciones_tecnicas || '',
      descargo_tecnico: openDetalle?.descargo_tecnico || ''
    });
    setEditandoNotas(true);
  };

  const guardarNotas = async () => {
    if (!openDetalle || guardandoNotas) return;
    setGuardandoNotas(true);
    try {
      const r = await serviciosService.actualizarInformeTecnico(openDetalle.id_servicio, {
        observaciones_tecnicas: notasForm.observaciones_tecnicas,
        descargo_tecnico: notasForm.descargo_tecnico
      });
      // El modal sigue abierto: se refresca con lo guardado y se recarga la tabla.
      setOpenDetalle(prev => (prev ? { ...prev, ...r } : prev));
      setEditandoNotas(false);
      toast.success('Notas técnicas actualizadas');
      recargar();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Error al actualizar las notas');
    } finally {
      setGuardandoNotas(false);
    }
  };

  const setF = (k, v) => setFiltros(f => ({ ...f, [k]: v }));

  // El filtro por cliente se ofrece solo a roles que ya ven datos de cobro/factura;
  // el técnico (acceso restringido a Clientes) filtra por búsqueda libre y fecha.
  useEffect(() => {
    if (!verCobroFactura) return;
    clientesService.list().then(setClientes).catch(() => setClientes([]));
  }, [verCobroFactura]);

  // Modal de revisión administrativa: aprobar / observar / rechazar + motivo.
  const [revisarEv, setRevisarEv] = useState(null); // servicio realizado en revisión
  const [revisando, setRevisando] = useState(false);

  const enviarRevision = async (resultado, observaciones) => {
    if (!revisarEv) return;
    setRevisando(true);
    try {
      await serviciosService.revisar(revisarEv.id_servicio, { resultado, observaciones });
      toast.success(
        resultado === 'aprobado' ? 'Servicio aprobado y habilitado para cobro'
        : resultado === 'observado' ? 'Servicio observado y devuelto a corrección'
        : 'Servicio rechazado y devuelto a corrección'
      );
      setRevisarEv(null);
      cargar();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Error al revisar');
    } finally {
      setRevisando(false);
    }
  };

  return (
    <>
      <PageHeader title="Servicios realizados" subtitle={`${total.toLocaleString('es-PE')} servicio(s) finalizado(s)`} />

      <PanelFiltros
        activos={Object.values(filtros).filter(Boolean).length}
        onLimpiar={() => setFiltros(FILTROS_INICIALES)}>
        <div className="p-3 sm:p-4 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
          <input className="input col-span-2"
            placeholder="Buscar por código de servicio o cliente…"
            value={filtros.q}
            onChange={e => setF('q', e.target.value)} />
          {verCobroFactura && (
            <select className="select" value={filtros.id_cliente} onChange={e => setF('id_cliente', e.target.value)}>
              <option value="">Todos los clientes</option>
              {clientes.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
            </select>
          )}
          {verCobroFactura && (
            <select className="select" value={filtros.estado_cobro} onChange={e => setF('estado_cobro', e.target.value)}>
              <option value="">Estado cobro (todos)</option>
              {ESTADOS_COBRO.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          )}
          {verCobroFactura && (
            <select className="select" value={filtros.estado_facturacion} onChange={e => setF('estado_facturacion', e.target.value)}>
              <option value="">Estado factura (todos)</option>
              {ESTADOS_FACTURACION.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          )}
          <DateRangePicker
            desde={filtros.desde}
            hasta={filtros.hasta}
            onChange={({ desde, hasta }) => setFiltros(f => ({ ...f, desde, hasta }))}
            placeholder="Rango de realización"
          />
          <button onClick={() => setFiltros(FILTROS_INICIALES)} className="btn-secondary col-span-2 sm:col-span-3 lg:col-span-6">Limpiar filtros</button>
        </div>
      </PanelFiltros>

      <div className="card">
        {loading ? <Loader /> : data.length === 0 ? <EmptyState title="Sin servicios realizados" /> : (
          <>
          <div className="hidden lg:block overflow-x-auto scroll-thin">
            <table className="table-base">
              <thead><tr>
                <th className="table-th">Fecha</th><th className="table-th">Código</th>
                <th className="table-th">Origen</th>
                <th className="table-th">Cliente / Ascensor</th><th className="table-th">Tipo</th>
                <th className="table-th">Técnicos</th><th className="table-th">Resp. doc</th>
                <th className="table-th text-center">Guía</th>
                <th className="table-th text-center">Evid.</th>
                <th className="table-th text-center">Checklist</th>
                <th className="table-th">Admin.</th>
                {verCobroFactura && <th className="table-th">Cobro</th>}
                {verCobroFactura && <th className="table-th">Factura</th>}
                {puedeVerPrecio && <th className="table-th text-right">Precio</th>}
                <th className="table-th text-right">Acciones</th>
              </tr></thead>
              <tbody className="divide-y divide-slate-100">
                {data.map(r => {
                  const docu = r.servicio?.asignaciones?.find(a => a.responsable_documentacion === 1);
                  const guias = r.servicio?.guias || [];
                  const evidencias = r.servicio?.evidencias || [];
                  return (
                    <tr key={r.id} className="table-row-hover">
                      <td className="table-td text-xs">{formatFecha(r.fecha_realizacion)}</td>
                      <td className="table-td"><Link to={`/servicios/${r.id_servicio}`} className="font-mono text-xs text-brand-700">{r.servicio?.codigo}</Link></td>
                      <td className="table-td text-xs">
                        {r.servicio?.id_cotizacion
                          ? <span className="badge-violet text-[10px]">Cotización</span>
                          : <span className="badge-gray text-[10px]">Operativo</span>}
                      </td>
                      <td className="table-td text-xs"><div>{r.servicio?.cliente?.nombre}</div><div className="font-mono text-slate-500" title={codigosAscensores(r.servicio).join(', ')}>{resumenAscensores(r.servicio)}</div></td>
                      <td className="table-td text-xs">{r.servicio?.tipo_servicio?.nombre}</td>
                      <td className="table-td text-xs">{r.servicio?.asignaciones?.map(a => a.tecnico?.nombre).join(', ') || '—'}</td>
                      <td className="table-td text-xs">{docu?.tecnico?.nombre || '—'}</td>
                      <td className="table-td text-center text-xs">
                        {guias.length > 0
                          ? (guias[0].archivo ? <FileLink archivo={guias[0].archivo}>{guias.length}</FileLink> : guias.length)
                          : <span className="text-rose-500">0</span>}
                      </td>
                      <td className="table-td text-center text-xs">{evidencias.length}</td>
                      <td className="table-td text-center text-xs">
                        {r.servicio?.checklists?.[0]?.estado_checklist
                          ? <span className={badgeEstado(r.servicio.checklists[0].estado_checklist)}>{r.servicio.checklists[0].estado_checklist}</span>
                          : '—'}
                      </td>
                      <td className="table-td"><span className={badgeEstado(r.estado_administrativo)}>{r.estado_administrativo}</span></td>
                      {verCobroFactura && <td className="table-td"><span className={badgeEstado(r.estado_cobro)}>{r.estado_cobro}</span></td>}
                      {verCobroFactura && <td className="table-td"><span className={badgeEstado(r.estado_facturacion)}>{r.estado_facturacion}</span></td>}
                      {puedeVerPrecio && <td className="table-td text-right font-mono">{formatMonto(r.servicio?.precio_interno, r.servicio?.moneda)}</td>}
                      <td className="table-td text-right whitespace-nowrap space-x-2">
                        {(r.observaciones_tecnicas || r.descargo_tecnico) && (
                          <button onClick={() => setOpenDetalle(r)} className="text-brand-700 text-xs hover:underline">Notas</button>
                        )}
                        {puedeRevisar && r.servicio?.estado_servicio === 'En revisión administrativa' && (
                          <button onClick={() => setRevisarEv(r)} className="text-emerald-700 text-xs hover:underline">Revisar</button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* MÓVIL. El técnico consulta aquí lo que ya cerró: qué entregó, si la
              guía subió y en qué punto administrativo está. Los indicadores que
              en la tabla son columnas numéricas (guía / evidencias / checklist)
              se convierten en chips legibles de un vistazo. */}
          <ListaMovil hasta="lg">
            {data.map(r => {
              const docu = r.servicio?.asignaciones?.find(a => a.responsable_documentacion === 1);
              const guias = r.servicio?.guias || [];
              const evidencias = r.servicio?.evidencias || [];
              const checklist = r.servicio?.checklists?.[0]?.estado_checklist;
              const tieneNotas = r.observaciones_tecnicas || r.descargo_tecnico;
              return (
                <FilaMovil
                  key={r.id}
                  to={`/servicios/${r.id_servicio}`}
                  codigo={r.servicio?.codigo}
                  titulo={r.servicio?.cliente?.nombre}
                  subtitulo={[resumenAscensores(r.servicio), r.servicio?.tipo_servicio?.nombre].filter(Boolean).join(' · ')}
                  badge={<span className={badgeEstado(r.estado_administrativo)}>{r.estado_administrativo}</span>}
                  chips={
                    <>
                      {r.servicio?.id_cotizacion
                        ? <span className="badge-violet text-[10px]">Cotización</span>
                        : <span className="badge-gray text-[10px]">Operativo</span>}
                      <span className={`text-[10px] ${guias.length > 0 ? 'badge-green' : 'badge-red'}`}>
                        {guias.length > 0 ? `Guía · ${guias.length}` : 'Sin guía'}
                      </span>
                      <span className="badge-gray text-[10px]">Evid. {evidencias.length}</span>
                      {checklist && <span className={badgeEstado(checklist)}>{checklist}</span>}
                      {verCobroFactura && r.estado_cobro && <span className={badgeEstado(r.estado_cobro)}>{r.estado_cobro}</span>}
                      {verCobroFactura && r.estado_facturacion && <span className={badgeEstado(r.estado_facturacion)}>{r.estado_facturacion}</span>}
                    </>
                  }
                  datos={[
                    ['Realizado', formatFecha(r.fecha_realizacion)],
                    ['Técnicos', r.servicio?.asignaciones?.map(a => a.tecnico?.nombre).join(', ') || null],
                    ['Resp. documental', docu?.tecnico?.nombre || null],
                    ...(puedeVerPrecio ? [['Precio', formatMonto(r.servicio?.precio_interno, r.servicio?.moneda)]] : [])
                  ]}
                  acciones={(tieneNotas || (puedeRevisar && r.servicio?.estado_servicio === 'En revisión administrativa') || (guias[0]?.archivo)) && (
                    <>
                      {tieneNotas && <AccionFila onClick={() => setOpenDetalle(r)}>Ver notas técnicas</AccionFila>}
                      {guias[0]?.archivo && (
                        <FileLink archivo={guias[0].archivo} className="inline-flex items-center min-h-[36px] text-xs font-semibold text-brand-700">
                          Ver guía
                        </FileLink>
                      )}
                      {puedeRevisar && r.servicio?.estado_servicio === 'En revisión administrativa' && (
                        <AccionFila tono="emerald" onClick={() => setRevisarEv(r)}>Revisar</AccionFila>
                      )}
                    </>
                  )}
                />
              );
            })}
          </ListaMovil>
          </>
        )}
        {!loading && data.length > 0 && (
          <Pagination page={page} pageSize={pageSize} total={total} totalPages={totalPages}
            onPage={setPage} onPageSize={setPageSize} />
        )}
      </div>

      <Modal
        open={!!openDetalle}
        onClose={() => { setOpenDetalle(null); setEditandoNotas(false); }}
        title={`Notas técnicas · ${openDetalle?.servicio?.codigo || ''}`}
        footer={gestionaRegistros ? (
          editandoNotas ? (
            <>
              <button className="btn-secondary" onClick={() => setEditandoNotas(false)} disabled={guardandoNotas}>Cancelar</button>
              <button className="btn-primary" onClick={guardarNotas} disabled={guardandoNotas}>
                {guardandoNotas ? 'Guardando…' : 'Guardar'}
              </button>
            </>
          ) : (
            <button className="btn-secondary" onClick={abrirEdicionNotas}>Editar notas</button>
          )
        ) : undefined}
      >
        <div className="space-y-3 text-sm">
          {editandoNotas ? (
            <>
              <div>
                <label className="label">Observaciones técnicas</label>
                <textarea className="textarea w-full" rows="4" value={notasForm.observaciones_tecnicas}
                  onChange={e => setNotasForm(f => ({ ...f, observaciones_tecnicas: e.target.value }))}
                  disabled={guardandoNotas} />
              </div>
              <div>
                <label className="label">Descargo técnico</label>
                <textarea className="textarea w-full" rows="4" value={notasForm.descargo_tecnico}
                  onChange={e => setNotasForm(f => ({ ...f, descargo_tecnico: e.target.value }))}
                  disabled={guardandoNotas} />
              </div>
              <p className="text-xs text-slate-500">
                Corrige lo que el técnico registró al cerrar. Solo es posible mientras el servicio no haya pasado la revisión administrativa.
              </p>
            </>
          ) : (
            <>
              {openDetalle?.observaciones_tecnicas && (
                <div>
                  <p className="text-xs uppercase tracking-wider text-slate-400 mb-1">Observaciones técnicas</p>
                  <p className="text-slate-700 whitespace-pre-line">{openDetalle.observaciones_tecnicas}</p>
                </div>
              )}
              {openDetalle?.descargo_tecnico && (
                <div>
                  <p className="text-xs uppercase tracking-wider text-slate-400 mb-1">Descargo técnico</p>
                  <p className="text-slate-700 whitespace-pre-line">{openDetalle.descargo_tecnico}</p>
                </div>
              )}
              {!openDetalle?.observaciones_tecnicas && !openDetalle?.descargo_tecnico && (
                <p className="text-slate-500">El técnico no dejó notas al cerrar el servicio.</p>
              )}
            </>
          )}
        </div>
      </Modal>

      <ModalRevision
        servicio={revisarEv}
        cargando={revisando}
        onClose={() => !revisando && setRevisarEv(null)}
        onEnviar={enviarRevision}
      />
    </>
  );
}

/**
 * Modal de revisión administrativa: aprobar (habilita Contabilidad), observar o
 * rechazar (devuelve el servicio a corrección). Observar/Rechazar exigen motivo.
 */
function ModalRevision({ servicio, cargando, onClose, onEnviar }) {
  const [motivo, setMotivo] = useState('');
  useEffect(() => { if (!servicio) setMotivo(''); }, [servicio]);
  if (!servicio) return null;
  const motivoRequerido = motivo.trim().length === 0;
  return (
    <Modal open={!!servicio} onClose={onClose} title={`Revisión administrativa · ${servicio.servicio?.codigo || ''}`} size="sm">
      <div className="space-y-4">
        <p className="text-sm text-slate-600">
          Aprueba el servicio para habilitarlo en Contabilidad, u observa/rechaza para devolverlo al técnico a corrección.
        </p>
        <div>
          <label className="label">Motivo / observaciones {' '}
            <span className="text-xs text-slate-400">(obligatorio si observa o rechaza)</span>
          </label>
          <textarea className="textarea" rows="3" value={motivo}
            onChange={e => setMotivo(e.target.value)}
            placeholder="Detalle de la revisión…" />
        </div>
        <div className="flex flex-wrap gap-2 justify-end">
          <button type="button" disabled={cargando || motivoRequerido}
            onClick={() => onEnviar('rechazado', motivo)}
            className="inline-flex items-center rounded-lg bg-rose-600 px-3 py-2 text-sm font-semibold text-white hover:bg-rose-700 disabled:opacity-40">
            Rechazar
          </button>
          <button type="button" disabled={cargando || motivoRequerido}
            onClick={() => onEnviar('observado', motivo)}
            className="inline-flex items-center rounded-lg bg-amber-500 px-3 py-2 text-sm font-semibold text-white hover:bg-amber-600 disabled:opacity-40">
            Observar
          </button>
          <button type="button" disabled={cargando}
            onClick={() => onEnviar('aprobado', motivo)}
            className="inline-flex items-center rounded-lg bg-emerald-600 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50">
            {cargando ? 'Procesando…' : 'Aprobar'}
          </button>
        </div>
      </div>
    </Modal>
  );
}
