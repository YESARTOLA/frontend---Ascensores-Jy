import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { mantenimientosService, clientesService, ascensoresService, tiposServicioService } from '../services';
import PageHeader from '../components/common/PageHeader.jsx';
import Loader from '../components/common/Loader.jsx';
import Modal from '../components/common/Modal.jsx';
import EmptyState from '../components/common/EmptyState.jsx';
import Pagination, { usePaginatedList } from '../components/common/Pagination.jsx';
import DateRangePicker from '../components/common/DateRangePicker.jsx';
import { useToast } from '../components/common/Toast.jsx';
import ClienteAutocomplete from '../components/common/ClienteAutocomplete.jsx';
import { badgeEstado, formatFecha, formatFechaHora, formatMonto, formatDiasEjecucion, hoyISO, toYMDLima, nombreEdificioCliente, labelNombreEdificio } from '../utils/formatters.js';
import { useAuth } from '../features/auth/AuthContext.jsx';
import { generarReportePorClientePDF } from '../utils/pdfReport.js';

const FORM_ID = 'form-nuevo-plan-mantenimiento';

const inicial = {
  id_cliente: '', id_ascensor: '', id_tipo_servicio: '', tipo_plan: 'continuo',
  frecuencia: 'mensual', frecuencia_dias_custom: '', cantidad_mantenimientos: '12',
  cantidad_mantenimientos_gratuitos: '0',
  fecha_inicio: hoyISO(), hora_programada: '09:00',
  observaciones: ''
};

export default function Mantenimientos() {
  const [tabActiva, setTabActiva] = useState('mantenimientos'); // 'mantenimientos' | 'planes'
  const [clientes, setClientes] = useState([]);
  const [tiposCliente, setTiposCliente] = useState([]);
  const [ascensores, setAscensores] = useState([]);
  const [tipos, setTipos] = useState([]);
  const [frecuencias, setFrecuencias] = useState([]);
  const [open, setOpen] = useState(false);
  const [editando, setEditando] = useState(null);
  const [form, setForm] = useState(inicial);
  const [guardando, setGuardando] = useState(false);
  const guardandoRef = useRef(false);
  const [instancias, setInstancias] = useState([]);
  const [cargandoInstancias, setCargandoInstancias] = useState(false);
  const [filtroInst, setFiltroInst] = useState({ q: '', id_cliente: '', id_ascensor: '', estado_ejecucion: '', desde: '', hasta: '' });
  const [filtroPlanes, setFiltroPlanes] = useState({ q: '' });
  const [planDetalle, setPlanDetalle] = useState(null);
  const [instanciasPlan, setInstanciasPlan] = useState([]);
  const [cargandoInstanciasPlan, setCargandoInstanciasPlan] = useState(false);
  const [editandoGratuitos, setEditandoGratuitos] = useState(false);
  const [nuevoCupoGratuitos, setNuevoCupoGratuitos] = useState('');
  const [guardandoGratuitos, setGuardandoGratuitos] = useState(false);
  const [openExportar, setOpenExportar] = useState(false);
  const [exportForm, setExportForm] = useState({ ids_cliente: [], ids_ascensor: [], estado_ejecucion: '', desde: '', hasta: '', formato: 'excel' });
  const [exportando, setExportando] = useState(false);
  const toast = useToast();
  const { esSuperAdmin, esAdmin, esCoordinador, esContabilidad, puedeVerPrecio } = useAuth();
  const puedeCrear = esSuperAdmin || esAdmin || esCoordinador;
  const puedeExportar = esSuperAdmin || esAdmin || esCoordinador || esContabilidad;
  const puedeEditarPlan = esSuperAdmin || esAdmin;

  const { data, loading, total, page, pageSize, totalPages, setPage, setPageSize, recargar } =
    usePaginatedList(mantenimientosService.paginate, filtroPlanes, { initialPageSize: 25 });
  const cargar = recargar;
  useEffect(() => {
    Promise.all([
      clientesService.list(),
      ascensoresService.list(),
      tiposServicioService.list(),
      mantenimientosService.frecuencias()
    ]).then(([c, a, t, f]) => { setClientes(c); setAscensores(a); setTipos(t); setFrecuencias(f); });
    clientesService.tipos().then(setTiposCliente).catch(() => setTiposCliente([]));
  }, []);

  const recargarInstancias = () => {
    setCargandoInstancias(true);
    const params = {};
    if (filtroInst.q) params.q = filtroInst.q;
    if (filtroInst.id_cliente) params.id_cliente = filtroInst.id_cliente;
    if (filtroInst.id_ascensor) params.id_ascensor = filtroInst.id_ascensor;
    if (filtroInst.estado_ejecucion) params.estado_ejecucion = filtroInst.estado_ejecucion;
    if (filtroInst.desde) params.desde = filtroInst.desde;
    if (filtroInst.hasta) params.hasta = filtroInst.hasta;
    mantenimientosService.instancias(params)
      .then(setInstancias)
      .catch(() => setInstancias([]))
      .finally(() => setCargandoInstancias(false));
  };

  useEffect(() => {
    if (tabActiva !== 'mantenimientos') return;
    recargarInstancias();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tabActiva, filtroInst.q, filtroInst.id_cliente, filtroInst.id_ascensor, filtroInst.estado_ejecucion, filtroInst.desde, filtroInst.hasta]);

  const ascensoresFiltroInst = filtroInst.id_cliente
    ? ascensores.filter(a => String(a.id_cliente) === String(filtroInst.id_cliente))
    : ascensores;

  const ascensoresF = form.id_cliente ? ascensores.filter(a => String(a.id_cliente) === String(form.id_cliente)) : ascensores;
  const labelCampoCliente = labelNombreEdificio(
    clientes.find(c => String(c.id) === String(form.id_cliente)),
    tiposCliente
  );
  const tiposF = tipos.filter(t => t.categoria.includes('Mantenimiento'));
  const esContinuo = form.tipo_plan === 'continuo';
  const frecuenciaSeleccionada = frecuencias.find(f => f.codigo === form.frecuencia);
  const esFrecuenciaCustom = frecuenciaSeleccionada?.unidad === 'custom';
  const tipoSeleccionado = tipos.find(t => String(t.id) === String(form.id_tipo_servicio));
  const esTipoPreventivo = !!tipoSeleccionado?.es_preventivo;
  const cupoMaximoGratuitos = esContinuo ? Number(form.cantidad_mantenimientos || 0) : 1;

  const abrirNuevo = () => {
    setEditando(null);
    setForm(inicial);
    setOpen(true);
  };

  const abrirEditar = (plan) => {
    setEditando(plan.id);
    setForm({
      id_cliente: String(plan.id_cliente || ''),
      id_ascensor: String(plan.id_ascensor || ''),
      id_tipo_servicio: String(plan.id_tipo_servicio || ''),
      tipo_plan: plan.tipo_plan || 'continuo',
      frecuencia: plan.frecuencia || 'mensual',
      frecuencia_dias_custom: plan.frecuencia_dias_custom != null ? String(plan.frecuencia_dias_custom) : '',
      cantidad_mantenimientos: plan.cantidad_mantenimientos != null ? String(plan.cantidad_mantenimientos) : '12',
      cantidad_mantenimientos_gratuitos: plan.cantidad_mantenimientos_gratuitos != null ? String(plan.cantidad_mantenimientos_gratuitos) : '0',
      fecha_inicio: toYMDLima(plan.fecha_inicio) || hoyISO(),
      hora_programada: plan.hora_programada || '09:00',
      observaciones: plan.observaciones || ''
    });
    setOpen(true);
  };

  const cerrarModal = () => {
    if (guardandoRef.current) return;
    setOpen(false);
    setEditando(null);
    setForm(inicial);
  };

  const guardar = async (e) => {
    e.preventDefault();
    if (guardandoRef.current) return;
    guardandoRef.current = true;
    setGuardando(true);
    try {
      const payload = {
        id_tipo_servicio: form.id_tipo_servicio,
        tipo_plan: form.tipo_plan,
        fecha_inicio: form.fecha_inicio,
        hora_programada: form.hora_programada,
        observaciones: form.observaciones,
        cantidad_mantenimientos_gratuitos: esTipoPreventivo
          ? Number(form.cantidad_mantenimientos_gratuitos || 0)
          : 0
      };
      // Cliente/ascensor solo se mandan en creación (inmutables en edición)
      if (!editando) {
        payload.id_cliente = form.id_cliente;
        payload.id_ascensor = form.id_ascensor;
      }
      if (esContinuo) {
        payload.frecuencia = form.frecuencia;
        payload.cantidad_mantenimientos = Number(form.cantidad_mantenimientos);
        if (esFrecuenciaCustom) payload.frecuencia_dias_custom = Number(form.frecuencia_dias_custom);
      }
      if (editando) {
        await mantenimientosService.update(editando, payload);
        toast.success('Plan actualizado');
      } else {
        await mantenimientosService.create(payload);
        toast.success('Plan creado');
      }
      guardandoRef.current = false;
      cerrarModal();
      cargar();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Error');
    } finally {
      setGuardando(false);
      guardandoRef.current = false;
    }
  };

  const labelFrecuencia = (m) => {
    if (m.tipo_plan === 'eventual') return '—';
    const fr = frecuencias.find(f => f.codigo === m.frecuencia);
    return fr ? fr.etiqueta : (m.frecuencia || '');
  };

  const abrirDetallePlan = (plan) => {
    setPlanDetalle(plan);
    setInstanciasPlan([]);
    setEditandoGratuitos(false);
    setCargandoInstanciasPlan(true);
    mantenimientosService.instancias({ id_plan: plan.id })
      .then(setInstanciasPlan)
      .catch(() => setInstanciasPlan([]))
      .finally(() => setCargandoInstanciasPlan(false));
  };

  const cerrarDetallePlan = () => {
    setPlanDetalle(null);
    setInstanciasPlan([]);
    setEditandoGratuitos(false);
  };

  const iniciarEdicionGratuitos = () => {
    setNuevoCupoGratuitos(String(planDetalle?.cantidad_mantenimientos_gratuitos ?? 0));
    setEditandoGratuitos(true);
  };

  const guardarCupoGratuitos = async () => {
    if (!planDetalle || guardandoGratuitos) return;
    const valor = Number(nuevoCupoGratuitos);
    const ejecutados = Number(planDetalle.mantenimientos_gratuitos_ejecutados || 0);
    const cantTotal = Number(planDetalle.cantidad_mantenimientos || 1);
    if (!Number.isInteger(valor) || valor < 0) {
      return toast.error('Debe ser un entero mayor o igual a 0');
    }
    if (valor < ejecutados) {
      return toast.error(`No puede ser menor que los ${ejecutados} mantenimientos gratuitos ya ejecutados`);
    }
    if (planDetalle.tipo_plan === 'continuo' && valor > cantTotal) {
      return toast.error(`No puede ser mayor que la cantidad total (${cantTotal})`);
    }
    if (planDetalle.tipo_plan === 'eventual' && valor > 1) {
      return toast.error('Un plan eventual admite máximo 1 mantenimiento gratuito');
    }
    setGuardandoGratuitos(true);
    try {
      const actualizado = await mantenimientosService.update(planDetalle.id, {
        cantidad_mantenimientos_gratuitos: valor
      });
      toast.success('Cupo gratuito actualizado');
      setPlanDetalle(p => p ? { ...p, ...actualizado, tipo_servicio: p.tipo_servicio, cliente: p.cliente, ascensor: p.ascensor } : p);
      setEditandoGratuitos(false);
      cargar();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Error al actualizar');
    } finally {
      setGuardandoGratuitos(false);
    }
  };

  const subtitle = tabActiva === 'planes'
    ? `${total} plan(es)`
    : `${instancias.length} mantenimiento(s)`;

  const ascensoresExportFiltrados = exportForm.ids_cliente.length > 0
    ? ascensores.filter(a => exportForm.ids_cliente.includes(String(a.id_cliente)))
    : ascensores;

  const abrirExportar = () => {
    setExportForm({
      // Prefill con el filtro de la pestaña activa
      ids_cliente: filtroInst.id_cliente ? [String(filtroInst.id_cliente)] : [],
      ids_ascensor: filtroInst.id_ascensor ? [String(filtroInst.id_ascensor)] : [],
      estado_ejecucion: filtroInst.estado_ejecucion || '',
      desde: '', hasta: '',
      formato: 'excel'
    });
    setOpenExportar(true);
  };

  const cerrarExportar = () => {
    if (exportando) return;
    setOpenExportar(false);
  };

  const toggleExportCliente = (id) => {
    const idStr = String(id);
    setExportForm(f => {
      const ids_cliente = f.ids_cliente.includes(idStr)
        ? f.ids_cliente.filter(x => x !== idStr)
        : [...f.ids_cliente, idStr];
      // Si saca un cliente, quitar ascensores que ya no aplican
      const ascValidos = ids_cliente.length === 0
        ? f.ids_ascensor
        : f.ids_ascensor.filter(a => ascensores.find(x => String(x.id) === a && ids_cliente.includes(String(x.id_cliente))));
      return { ...f, ids_cliente, ids_ascensor: ascValidos };
    });
  };

  const toggleExportAscensor = (id) => {
    const idStr = String(id);
    setExportForm(f => ({
      ...f,
      ids_ascensor: f.ids_ascensor.includes(idStr)
        ? f.ids_ascensor.filter(x => x !== idStr)
        : [...f.ids_ascensor, idStr]
    }));
  };

  const ejecutarExport = async (e) => {
    if (e?.preventDefault) e.preventDefault();
    if (exportando) return;
    setExportando(true);
    try {
      const params = {};
      if (exportForm.ids_cliente.length > 0) params.ids_cliente = exportForm.ids_cliente.join(',');
      if (exportForm.ids_ascensor.length > 0) params.ids_ascensor = exportForm.ids_ascensor.join(',');
      if (exportForm.estado_ejecucion) params.estado_ejecucion = exportForm.estado_ejecucion;
      if (exportForm.desde) params.desde = exportForm.desde;
      if (exportForm.hasta) params.hasta = exportForm.hasta;
      const stamp = new Date().toISOString().slice(0, 10);

      if (exportForm.formato === 'pdf') {
        // El PDF se genera en el cliente con la portada corporativa
        const datos = await mantenimientosService.exportarDatos(params);
        const filtrosTxt = [];
        if (exportForm.ids_cliente.length > 0) {
          const nombres = exportForm.ids_cliente.map(id => nombreEdificioCliente(clientes.find(c => String(c.id) === id))).filter(Boolean);
          filtrosTxt.push(`Clientes: ${nombres.length <= 3 ? nombres.join(', ') : `${nombres.length} seleccionados`}`);
        } else filtrosTxt.push('Todos los clientes');
        if (exportForm.ids_ascensor.length > 0) {
          const codigos = exportForm.ids_ascensor.map(id => ascensores.find(a => String(a.id) === id)?.codigo).filter(Boolean);
          filtrosTxt.push(`Ascensores: ${codigos.length <= 4 ? codigos.join(', ') : `${codigos.length} seleccionados`}`);
        }
        if (exportForm.estado_ejecucion) filtrosTxt.push(`Estado: ${exportForm.estado_ejecucion}`);
        if (exportForm.desde || exportForm.hasta) filtrosTxt.push(`Periodo: ${exportForm.desde || '—'} → ${exportForm.hasta || '—'}`);

        await generarReportePorClientePDF({
          titulo: 'Programaciones de mantenimiento',
          subtitulo: 'Reporte agrupado por cliente',
          fechaHora: new Date().toLocaleString('es-PE', { dateStyle: 'long', timeStyle: 'short' }),
          filtros: filtrosTxt,
          grupos: datos.grupos || [],
          nombreArchivo: `mantenimientos-${stamp}.pdf`
        });
      } else {
        const resp = await mantenimientosService.exportar(params, exportForm.formato);
        const url = URL.createObjectURL(resp.data);
        const a = document.createElement('a');
        a.href = url;
        a.download = `mantenimientos-${stamp}.xlsx`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
      }
      setOpenExportar(false);
      toast.success('Reporte generado');
    } catch (err) {
      // Si el backend devolvió error JSON pero estamos en modo blob, parsearlo
      let msg = 'Error al exportar';
      if (err.response?.data instanceof Blob) {
        try { msg = JSON.parse(await err.response.data.text()).error || msg; } catch { /* binario corrupto */ }
      } else {
        msg = err.response?.data?.error || msg;
      }
      toast.error(msg);
    } finally {
      setExportando(false);
    }
  };

  return (
    <>
      <PageHeader
        title="Mantenimientos"
        subtitle={subtitle}
        actions={
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => setTabActiva('mantenimientos')}
              className={tabActiva === 'mantenimientos' ? 'btn-primary' : 'btn-secondary'}
            >Mantenimientos</button>
            <button
              onClick={() => setTabActiva('planes')}
              className={tabActiva === 'planes' ? 'btn-primary' : 'btn-secondary'}
            >Planes</button>
            {puedeExportar && <button onClick={abrirExportar} className="btn-secondary">Exportar</button>}
            {puedeCrear && <button onClick={abrirNuevo} className="btn-primary">+ Nuevo plan</button>}
          </div>
        }
      />

      {tabActiva === 'mantenimientos' ? (
        <>
          <div className="card mb-4">
            <div className="p-4 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
              <input className="input lg:col-span-2"
                placeholder="Buscar por cliente, código o tipo de ascensor o código de servicio…"
                value={filtroInst.q}
                onChange={e => setFiltroInst(f => ({ ...f, q: e.target.value }))} />
              <select className="select" value={filtroInst.id_cliente}
                onChange={e => setFiltroInst(f => ({ ...f, id_cliente: e.target.value, id_ascensor: '' }))}>
                <option value="">Todos los clientes</option>
                {clientes.map(c => <option key={c.id} value={c.id}>{nombreEdificioCliente(c)}</option>)}
              </select>
              <select className="select" value={filtroInst.id_ascensor}
                onChange={e => setFiltroInst(f => ({ ...f, id_ascensor: e.target.value }))}>
                <option value="">Todos los ascensores</option>
                {ascensoresFiltroInst.map(a => <option key={a.id} value={a.id}>{a.codigo} {a.ubicacion ? `· ${a.ubicacion}` : ''}</option>)}
              </select>
              <select className="select" value={filtroInst.estado_ejecucion}
                onChange={e => setFiltroInst(f => ({ ...f, estado_ejecucion: e.target.value }))}>
                <option value="">Todos los estados</option>
                <option value="Pendiente">Pendiente</option>
                <option value="En curso">En curso</option>
                <option value="Realizado">Realizado</option>
                <option value="Cancelado">Cancelado</option>
              </select>
              <DateRangePicker
                desde={filtroInst.desde}
                hasta={filtroInst.hasta}
                onChange={({ desde, hasta }) => setFiltroInst(f => ({ ...f, desde, hasta }))}
                placeholder="Rango de fechas (programada)"
              />
              <button
                onClick={() => setFiltroInst({ q: '', id_cliente: '', id_ascensor: '', estado_ejecucion: '', desde: '', hasta: '' })}
                className="btn-secondary lg:col-span-6"
              >Limpiar filtros</button>
            </div>
          </div>

          <div className="card">
            {cargandoInstancias ? <Loader /> : instancias.length === 0 ? <EmptyState title="Sin mantenimientos" subtitle="Crea un plan o ajusta los filtros." /> : (
              <div className="overflow-x-auto scroll-thin">
                <table className="table-base">
                  <thead><tr>
                    <th className="table-th">Edificio-Obra / Ascensor</th>
                    <th className="table-th">Tipo</th>
                    <th className="table-th">Servicio</th>
                    <th className="table-th">Programada</th>
                    <th className="table-th">Inicio</th>
                    <th className="table-th">Término</th>
                    <th className="table-th text-center">Días</th>
                    <th className="table-th">Estado</th>
                    <th className="table-th text-right">Acciones</th>
                  </tr></thead>
                  <tbody className="divide-y divide-slate-100">
                    {instancias.map(it => (
                      <tr key={`${it.tipo_instancia}-${it.id_servicio || it.id_evento}`} className="table-row-hover">
                        <td className="table-td text-xs">
                          <div>{it.cliente_nombre || '—'}</div>
                          <div className="font-mono text-slate-500">{it.ascensor_codigo || '—'}</div>
                        </td>
                        <td className="table-td text-xs">
                          {it.tipo_servicio || '—'}
                          {it.es_mantenimiento_gratuito && <span className="ml-1 badge-green text-[10px]">Gratis</span>}
                        </td>
                        <td className="table-td text-xs">
                          {it.codigo_servicio ? (
                            <Link to={`/servicios/${it.id_servicio}`} className="font-mono text-brand-700 hover:underline">{it.codigo_servicio}</Link>
                          ) : <span className="text-slate-400">no creado</span>}
                        </td>
                        <td className="table-td text-xs">{formatFecha(it.fecha_programada)}</td>
                        <td className="table-td text-xs">{formatFechaHora(it.fecha_inicio_real)}</td>
                        <td className="table-td text-xs">{formatFechaHora(it.fecha_fin_real)}</td>
                        <td className="table-td text-xs text-center font-mono">{formatDiasEjecucion(it.dias_ejecucion)}</td>
                        <td className="table-td"><span className={badgeEstado(it.estado_ejecucion)}>{it.estado_ejecucion}</span></td>
                        <td className="table-td text-right">
                          {it.id_servicio ? (
                            <Link to={`/servicios/${it.id_servicio}`} className="text-brand-700 text-xs hover:underline">Ver detalle</Link>
                          ) : <span className="text-slate-400 text-xs" title="Programado a futuro: aún no se ha creado el servicio">—</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      ) : (
        <>
        <div className="card mb-4">
          <div className="p-4 grid grid-cols-1 sm:grid-cols-3 gap-2">
            <input className="input sm:col-span-2"
              placeholder="Buscar por cliente, código o tipo de ascensor o código de servicio…"
              value={filtroPlanes.q}
              onChange={e => setFiltroPlanes({ q: e.target.value })} />
            <button
              onClick={() => setFiltroPlanes({ q: '' })}
              className="btn-secondary"
            >Limpiar</button>
          </div>
        </div>
        <div className="card">
          {loading ? <Loader /> : data.length === 0 ? <EmptyState title="Sin planes" /> : (
            <div className="overflow-x-auto scroll-thin">
              <table className="table-base">
                <thead><tr>
                  <th className="table-th">Edificio-Obra / Ascensor</th><th className="table-th">Tipo</th>
                  <th className="table-th">Frecuencia</th><th className="table-th">Próx. fecha</th>
                  <th className="table-th text-center">Gratis</th>
                  <th className="table-th text-center">Ejecutados</th>
                  <th className="table-th">Estado</th>
                  <th className="table-th text-right">Acciones</th>
                </tr></thead>
                <tbody className="divide-y divide-slate-100">
                  {data.map(m => {
                    const aplicaGratuitos = !!m.tipo_servicio?.es_preventivo && Number(m.cantidad_mantenimientos_gratuitos || 0) > 0;
                    const totalPlan = m.tipo_plan === 'eventual'
                      ? 1
                      : (m.cantidad_mantenimientos != null ? Number(m.cantidad_mantenimientos) : null);
                    const ejecutadosTotal = Number(m.mantenimientos_ejecutados_total || 0);
                    return (
                      <tr key={m.id} className="table-row-hover">
                        <td className="table-td text-xs"><div>{nombreEdificioCliente(m.cliente)}</div><div className="font-mono text-slate-500">{m.ascensor?.codigo}</div></td>
                        <td className="table-td text-xs">{m.tipo_servicio?.nombre}</td>
                        <td className="table-td text-xs">{labelFrecuencia(m)} ({m.tipo_plan})</td>
                        <td className="table-td text-xs">{formatFecha(m.fecha_inicio)} {m.hora_programada || ''}</td>
                        <td className="table-td text-xs text-center">{aplicaGratuitos ? m.cantidad_mantenimientos_gratuitos : '—'}</td>
                        <td className="table-td text-xs text-center font-mono">
                          {totalPlan != null ? `${ejecutadosTotal}/${totalPlan}` : '—'}
                        </td>
                        <td className="table-td"><span className={badgeEstado(m.estado_plan)}>{m.estado_plan}</span></td>
                        <td className="table-td text-right whitespace-nowrap">
                          <button type="button" onClick={() => abrirDetallePlan(m)} className="text-brand-700 text-xs hover:underline">Ver detalle</button>
                          {puedeCrear && (
                            <>
                              <span className="text-slate-300 mx-1.5">·</span>
                              <button type="button" onClick={() => abrirEditar(m)} className="text-brand-700 text-xs hover:underline">Editar</button>
                            </>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          {!loading && data.length > 0 && (
            <Pagination page={page} pageSize={pageSize} total={total} totalPages={totalPages}
              onPage={setPage} onPageSize={setPageSize} />
          )}
        </div>
        </>
      )}

      <Modal open={!!planDetalle} onClose={cerrarDetallePlan} title="Detalle del plan de mantenimiento" size="xl"
        footer={<button type="button" className="btn-secondary" onClick={cerrarDetallePlan}>Cerrar</button>}>
        {planDetalle && (() => {
          const ejecutados = instanciasPlan.filter(i => i.estado_ejecucion === 'Realizado').length;
          const pendientes = instanciasPlan.filter(i => i.estado_ejecucion === 'Pendiente').length;
          const enCurso = instanciasPlan.filter(i => i.estado_ejecucion === 'En curso').length;
          return (
            <div className="space-y-5">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3 text-sm">
                <div>
                  <div className="text-xs uppercase tracking-wide text-slate-500">Cliente</div>
                  <div className="text-slate-800">{nombreEdificioCliente(planDetalle.cliente) || '—'}</div>
                </div>
                <div>
                  <div className="text-xs uppercase tracking-wide text-slate-500">Ascensor</div>
                  <div className="text-slate-800 font-mono">
                    {planDetalle.ascensor?.codigo || '—'}
                    {planDetalle.ascensor?.ubicacion && <span className="text-slate-500 font-sans"> · {planDetalle.ascensor.ubicacion}</span>}
                  </div>
                </div>
                <div>
                  <div className="text-xs uppercase tracking-wide text-slate-500">Tipo de servicio</div>
                  <div className="text-slate-800">
                    {planDetalle.tipo_servicio?.nombre || '—'}
                    {planDetalle.tipo_servicio?.es_preventivo && <span className="ml-2 badge-green text-[10px]">Preventivo</span>}
                  </div>
                </div>
                <div>
                  <div className="text-xs uppercase tracking-wide text-slate-500">Estado del plan</div>
                  <div><span className={badgeEstado(planDetalle.estado_plan)}>{planDetalle.estado_plan}</span></div>
                </div>
                <div>
                  <div className="text-xs uppercase tracking-wide text-slate-500">Tipo de plan</div>
                  <div className="text-slate-800 capitalize">{planDetalle.tipo_plan}</div>
                </div>
                <div>
                  <div className="text-xs uppercase tracking-wide text-slate-500">Frecuencia</div>
                  <div className="text-slate-800">
                    {labelFrecuencia(planDetalle)}
                    {planDetalle.frecuencia === 'custom' && planDetalle.frecuencia_dias_custom &&
                      <span className="text-slate-500"> ({planDetalle.frecuencia_dias_custom} días)</span>}
                  </div>
                </div>
                <div>
                  <div className="text-xs uppercase tracking-wide text-slate-500">Fecha inicio</div>
                  <div className="text-slate-800">{formatFecha(planDetalle.fecha_inicio)} {planDetalle.hora_programada || ''}</div>
                </div>
                <div>
                  <div className="text-xs uppercase tracking-wide text-slate-500">Cantidad de mantenimientos</div>
                  <div className="text-slate-800 font-mono">{planDetalle.cantidad_mantenimientos ?? '—'}</div>
                </div>
                {!!planDetalle.tipo_servicio?.es_preventivo && (
                  <div>
                    <div className="text-xs uppercase tracking-wide text-slate-500 flex items-center gap-2">
                      Mantenimientos gratuitos
                      {puedeEditarPlan && !editandoGratuitos && (
                        <button type="button" onClick={iniciarEdicionGratuitos}
                          className="text-[10px] text-brand-700 hover:underline normal-case tracking-normal">
                          Editar
                        </button>
                      )}
                    </div>
                    {editandoGratuitos ? (
                      <div className="mt-1 flex items-center gap-2">
                        <input type="number" min="0"
                          max={planDetalle.tipo_plan === 'eventual' ? 1 : (planDetalle.cantidad_mantenimientos || 1)}
                          step="1"
                          className="input w-24 text-center font-mono"
                          value={nuevoCupoGratuitos}
                          onChange={e => setNuevoCupoGratuitos(e.target.value)}
                          disabled={guardandoGratuitos} />
                        <button type="button" onClick={guardarCupoGratuitos} disabled={guardandoGratuitos}
                          className="btn-primary text-xs !py-1 !px-2">
                          {guardandoGratuitos ? 'Guardando…' : 'Guardar'}
                        </button>
                        <button type="button" onClick={() => setEditandoGratuitos(false)} disabled={guardandoGratuitos}
                          className="btn-secondary text-xs !py-1 !px-2">
                          Cancelar
                        </button>
                      </div>
                    ) : (
                      <div className="text-slate-800 font-mono">
                        {planDetalle.mantenimientos_gratuitos_ejecutados || 0} / {planDetalle.cantidad_mantenimientos_gratuitos || 0}
                      </div>
                    )}
                    {puedeEditarPlan && !editandoGratuitos && (
                      <p className="text-[10px] text-slate-500 mt-1">
                        Aumentar el cupo marca como gratuitos a los próximos mantenimientos registrados.
                      </p>
                    )}
                  </div>
                )}
                {planDetalle.observaciones && (
                  <div className="sm:col-span-2">
                    <div className="text-xs uppercase tracking-wide text-slate-500">Observaciones</div>
                    <div className="text-slate-800 whitespace-pre-wrap">{planDetalle.observaciones}</div>
                  </div>
                )}
              </div>

              <div className="border-t border-slate-100 pt-4">
                <div className="flex items-center justify-between mb-3">
                  <h4 className="font-medium text-slate-800">Mantenimientos del plan</h4>
                  {!cargandoInstanciasPlan && instanciasPlan.length > 0 && (
                    <div className="flex gap-2 text-[11px]">
                      <span className="badge-green">Realizados: {ejecutados}</span>
                      {enCurso > 0 && <span className="badge-amber">En curso: {enCurso}</span>}
                      <span className="badge-gray">Pendientes: {pendientes}</span>
                    </div>
                  )}
                </div>
                {cargandoInstanciasPlan ? <Loader /> : instanciasPlan.length === 0 ? (
                  <p className="text-xs text-slate-500">Sin mantenimientos registrados.</p>
                ) : (
                  <div className="overflow-x-auto scroll-thin">
                    <table className="table-base">
                      <thead><tr>
                        <th className="table-th">Servicio</th>
                        <th className="table-th">Programada</th>
                        <th className="table-th">Inicio</th>
                        <th className="table-th">Término</th>
                        <th className="table-th text-center">Días</th>
                        <th className="table-th">Estado</th>
                        <th className="table-th text-right">Acciones</th>
                      </tr></thead>
                      <tbody className="divide-y divide-slate-100">
                        {instanciasPlan.map(it => (
                          <tr key={`${it.tipo_instancia}-${it.id_servicio || it.id_evento}`} className="table-row-hover">
                            <td className="table-td text-xs">
                              {it.codigo_servicio ? (
                                <Link to={`/servicios/${it.id_servicio}`} className="font-mono text-brand-700 hover:underline">{it.codigo_servicio}</Link>
                              ) : <span className="text-slate-400">no creado</span>}
                              {it.es_mantenimiento_gratuito && <span className="ml-1 badge-green text-[10px]">Gratis</span>}
                            </td>
                            <td className="table-td text-xs">{formatFecha(it.fecha_programada)}</td>
                            <td className="table-td text-xs">{formatFechaHora(it.fecha_inicio_real)}</td>
                            <td className="table-td text-xs">{formatFechaHora(it.fecha_fin_real)}</td>
                            <td className="table-td text-xs text-center font-mono">{formatDiasEjecucion(it.dias_ejecucion)}</td>
                            <td className="table-td"><span className={badgeEstado(it.estado_ejecucion)}>{it.estado_ejecucion}</span></td>
                            <td className="table-td text-right">
                              {it.id_servicio ? (
                                <Link to={`/servicios/${it.id_servicio}`} className="text-brand-700 text-xs hover:underline">Ver</Link>
                              ) : <span className="text-slate-400 text-xs">—</span>}
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
        })()}
      </Modal>

      <Modal open={open} onClose={cerrarModal} title={editando ? 'Editar plan de mantenimiento' : 'Nuevo plan de mantenimiento'}
        footer={
          <>
            <button type="button" className="btn-secondary" onClick={cerrarModal} disabled={guardando}>Cancelar</button>
            <button type="submit" form={FORM_ID} className="btn-primary" disabled={guardando}>
              {guardando
                ? (editando ? 'Guardando…' : 'Creando…')
                : (editando ? 'Guardar cambios' : 'Crear')}
            </button>
          </>
        }>
        <form id={FORM_ID} onSubmit={guardar} className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {editando && (
            <div className="sm:col-span-2 rounded-lg border border-amber-200 bg-amber-50 text-amber-900 text-xs p-3">
              Cliente y ascensor del plan son inmutables. Los cambios <strong>solo afectan a los mantenimientos futuros no materializados</strong>; los servicios ya creados conservan sus datos originales.
            </div>
          )}
          <div>
            <label className="label">{labelCampoCliente} *</label>
            <ClienteAutocomplete
              clientes={clientes}
              value={form.id_cliente}
              onChange={(id) => setForm(f => ({ ...f, id_cliente: id, id_ascensor: '' }))}
              usarNombreEdificio
              required
              disabled={!!editando}
              placeholder="Escriba para buscar por nombre de edificio / obra…"
            />
          </div>
          <div>
            <label className="label">Ascensor *</label>
            <select className="select" required disabled={!!editando} value={form.id_ascensor} onChange={e => setForm(f => ({ ...f, id_ascensor: e.target.value }))}><option value="">—</option>{ascensoresF.map(a => <option key={a.id} value={a.id}>{a.codigo}</option>)}</select>
          </div>
          <div>
            <label className="label">Tipo de servicio *</label>
            <select className="select" required value={form.id_tipo_servicio} onChange={e => setForm(f => ({ ...f, id_tipo_servicio: e.target.value }))}><option value="">—</option>{tiposF.map(t => <option key={t.id} value={t.id}>{t.nombre}</option>)}</select>
          </div>
          <div>
            <label className="label">Tipo de plan *</label>
            <select className="select" value={form.tipo_plan} onChange={e => setForm(f => ({ ...f, tipo_plan: e.target.value }))}>
              <option value="continuo">Continuo</option>
              <option value="eventual">Eventual</option>
            </select>
          </div>

          {esContinuo && (
            <>
              <div>
                <label className="label">Frecuencia *</label>
                <select className="select" required value={form.frecuencia} onChange={e => setForm(f => ({ ...f, frecuencia: e.target.value }))}>
                  {frecuencias.map(fr => <option key={fr.codigo} value={fr.codigo}>{fr.etiqueta}</option>)}
                </select>
              </div>
              {esFrecuenciaCustom && (
                <div>
                  <label className="label">Días entre mantenimientos *</label>
                  <input type="number" min="1" step="1" className="input" required
                    value={form.frecuencia_dias_custom}
                    onChange={e => setForm(f => ({ ...f, frecuencia_dias_custom: e.target.value }))} />
                </div>
              )}
              <div>
                <label className="label">Cantidad de mantenimientos *</label>
                <input type="number" min="1" step="1" className="input" required
                  value={form.cantidad_mantenimientos}
                  onChange={e => setForm(f => ({ ...f, cantidad_mantenimientos: e.target.value }))} />
              </div>
            </>
          )}

          {esTipoPreventivo && (
            <div>
              <label className="label">Mantenimientos gratuitos</label>
              <input
                type="number" min="0" max={cupoMaximoGratuitos} step="1" className="input"
                value={form.cantidad_mantenimientos_gratuitos}
                onChange={e => setForm(f => ({ ...f, cantidad_mantenimientos_gratuitos: e.target.value }))}
              />
              <p className="text-xs text-slate-500 mt-1">
                Los primeros N mantenimientos no generan cobro. Máx: {cupoMaximoGratuitos}.
              </p>
            </div>
          )}

          <div><label className="label">Fecha inicio *</label><input type="date" className="input" required value={form.fecha_inicio} onChange={e => setForm(f => ({ ...f, fecha_inicio: e.target.value }))} /></div>
          <div><label className="label">Hora</label><input type="time" className="input" value={form.hora_programada} onChange={e => setForm(f => ({ ...f, hora_programada: e.target.value }))} /></div>
          <div className="sm:col-span-2 text-xs text-slate-500 bg-slate-50 ring-1 ring-slate-200 rounded-md px-3 py-2">
            El precio del mantenimiento se hereda de los precios configurados en el cliente (por tipo de servicio). Configúrelos en el módulo Clientes antes de crear el plan.
          </div>
          <div className="sm:col-span-2"><label className="label">Observaciones</label><textarea className="textarea" rows="2" value={form.observaciones} onChange={e => setForm(f => ({ ...f, observaciones: e.target.value }))} /></div>
        </form>
      </Modal>

      <Modal open={openExportar} onClose={cerrarExportar} title="Exportar programaciones de mantenimiento" size="lg"
        footer={<>
          <button type="button" className="btn-secondary" onClick={cerrarExportar} disabled={exportando}>Cancelar</button>
          <button type="submit" form="form-exportar-mantenimientos" className="btn-primary" disabled={exportando}>
            {exportando ? 'Generando…' : `Descargar ${exportForm.formato.toUpperCase()}`}
          </button>
        </>}>
        <form id="form-exportar-mantenimientos" onSubmit={ejecutarExport} className="space-y-4">
          <div>
            <label className="label flex items-center justify-between">
              <span>Clientes</span>
              <span className="text-xs font-normal text-slate-500">
                {exportForm.ids_cliente.length === 0 ? 'Todos' : `${exportForm.ids_cliente.length} seleccionado(s)`}
              </span>
            </label>
            <div className="rounded-lg ring-1 ring-slate-200 max-h-48 overflow-y-auto scroll-thin divide-y divide-slate-100">
              {clientes.length === 0 ? (
                <div className="p-3 text-xs text-slate-500">Sin clientes</div>
              ) : clientes.map(c => {
                const marcado = exportForm.ids_cliente.includes(String(c.id));
                return (
                  <label key={c.id} className={`flex items-center gap-2 p-2 cursor-pointer text-sm ${marcado ? 'bg-brand-50/60' : 'bg-white'}`}>
                    <input type="checkbox" checked={marcado} onChange={() => toggleExportCliente(c.id)} />
                    <span className="flex-1 truncate">{nombreEdificioCliente(c)}</span>
                  </label>
                );
              })}
            </div>
            <p className="text-xs text-slate-500 mt-1">Vacío = todos los clientes.</p>
          </div>

          <div>
            <label className="label flex items-center justify-between">
              <span>Ascensores</span>
              <span className="text-xs font-normal text-slate-500">
                {exportForm.ids_ascensor.length === 0 ? 'Todos' : `${exportForm.ids_ascensor.length} seleccionado(s)`}
              </span>
            </label>
            <div className="rounded-lg ring-1 ring-slate-200 max-h-48 overflow-y-auto scroll-thin divide-y divide-slate-100">
              {ascensoresExportFiltrados.length === 0 ? (
                <div className="p-3 text-xs text-slate-500">
                  {exportForm.ids_cliente.length === 0 ? 'Sin ascensores' : 'Los clientes seleccionados no tienen ascensores'}
                </div>
              ) : ascensoresExportFiltrados.map(a => {
                const marcado = exportForm.ids_ascensor.includes(String(a.id));
                const cliente = clientes.find(c => c.id === a.id_cliente);
                return (
                  <label key={a.id} className={`flex items-center gap-2 p-2 cursor-pointer text-sm ${marcado ? 'bg-brand-50/60' : 'bg-white'}`}>
                    <input type="checkbox" checked={marcado} onChange={() => toggleExportAscensor(a.id)} />
                    <div className="flex-1 min-w-0">
                      <div className="font-mono text-xs">{a.codigo}</div>
                      <div className="text-xs text-slate-500 truncate">{nombreEdificioCliente(cliente) || '—'}{a.ubicacion ? ` · ${a.ubicacion}` : ''}</div>
                    </div>
                  </label>
                );
              })}
            </div>
            <p className="text-xs text-slate-500 mt-1">Vacío = todos los ascensores de los clientes elegidos.</p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="label">Estado ejecución</label>
              <select className="select" value={exportForm.estado_ejecucion}
                onChange={e => setExportForm(f => ({ ...f, estado_ejecucion: e.target.value }))}>
                <option value="">Todos</option>
                <option value="Pendiente">Pendiente</option>
                <option value="En curso">En curso</option>
                <option value="Realizado">Realizado</option>
                <option value="Cancelado">Cancelado</option>
              </select>
            </div>
            <div>
              <label className="label">Desde</label>
              <input type="date" className="input" value={exportForm.desde}
                onChange={e => setExportForm(f => ({ ...f, desde: e.target.value }))} />
            </div>
            <div>
              <label className="label">Hasta</label>
              <input type="date" className="input" value={exportForm.hasta}
                onChange={e => setExportForm(f => ({ ...f, hasta: e.target.value }))} />
            </div>
          </div>

          <div>
            <label className="label">Formato</label>
            <div className="flex gap-3">
              <label className={`flex-1 flex items-center gap-2 p-3 rounded-lg ring-1 cursor-pointer ${exportForm.formato === 'excel' ? 'ring-brand-500 bg-brand-50/60' : 'ring-slate-200 bg-white'}`}>
                <input type="radio" name="formato" value="excel" checked={exportForm.formato === 'excel'}
                  onChange={() => setExportForm(f => ({ ...f, formato: 'excel' }))} />
                <span className="text-sm">Excel <span className="text-xs text-slate-500">(una hoja por cliente + resumen)</span></span>
              </label>
              <label className={`flex-1 flex items-center gap-2 p-3 rounded-lg ring-1 cursor-pointer ${exportForm.formato === 'pdf' ? 'ring-brand-500 bg-brand-50/60' : 'ring-slate-200 bg-white'}`}>
                <input type="radio" name="formato" value="pdf" checked={exportForm.formato === 'pdf'}
                  onChange={() => setExportForm(f => ({ ...f, formato: 'pdf' }))} />
                <span className="text-sm">PDF <span className="text-xs text-slate-500">(una sección por cliente)</span></span>
              </label>
            </div>
          </div>
        </form>
      </Modal>
    </>
  );
}
