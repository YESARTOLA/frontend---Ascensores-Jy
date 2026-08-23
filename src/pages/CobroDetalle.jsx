import { Fragment, useEffect, useMemo, useState } from 'react';
import { useParams, Link, useNavigate, useLocation } from 'react-router-dom';
import { cobrosService, archivosService, facturasService, cuentasBancariasService } from '../services';
import PageHeader from '../components/common/PageHeader.jsx';
import Loader from '../components/common/Loader.jsx';
import Modal from '../components/common/Modal.jsx';
import ConfirmarEliminacion from '../components/common/ConfirmarEliminacion.jsx';
import { FileLink } from '../components/common/FilePreview.jsx';
import { useToast } from '../components/common/Toast.jsx';
import { useAuth } from '../features/auth/AuthContext.jsx';
import { badgeEstado, formatFecha, formatFechaHora, formatMonto, hoyISO, addMonthsYMD, toYMDLima } from '../utils/formatters.js';
import { TIPOS_COMPROBANTE, ejemploNumeroComprobante, tipoComprobanteSugerido } from '../utils/catalogosComprobante.js';
import {
  ESTADO_FACTURA_ENVIADA,
  esFacturaActiva,
  puedeMarcarseEnviada
} from '../utils/estadoFactura.js';

/**
 * Una cuota está blindada (no puede modificarse) si ya tiene cualquier monto
 * pagado o si tiene una factura activa asociada. Es la misma regla que valida
 * el backend en cobrosController.actualizarPlanCuotas.
 */
function cuotaEstaBlindada(cu) {
  if (!cu) return false;
  if (Number(cu.monto_pagado || 0) > 0) return true;
  if (Array.isArray(cu.facturas) && cu.facturas.some(esFacturaActiva)) return true;
  return false;
}

export default function CobroDetalle() {
  const { id } = useParams();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [openAbono, setOpenAbono] = useState(false);
  const [openCuotas, setOpenCuotas] = useState(false);
  const [openFactura, setOpenFactura] = useState(false);
  const [guardandoCuotas, setGuardandoCuotas] = useState(false);
  const [abono, setAbono] = useState({ monto: '', fecha_pago: hoyISO(), metodo_pago: '', id_cuenta_bancaria: '', observaciones: '', id_archivo_comprobante: null });
  const [metodosPago, setMetodosPago] = useState([]);
  const [cuentasBancarias, setCuentasBancarias] = useState([]);
  // cuotas[i].id presente = blindada (pagada/facturada). Sin id = nueva editable.
  const [cuotas, setCuotas] = useState({ numero_cuotas: 1, fecha_proximo_abono: hoyISO(), cuotas: [] });
  const [factura, setFactura] = useState({ numero_factura: '', tipo_comprobante: TIPOS_COMPROBANTE[0].codigo, fecha_emision: hoyISO(), monto: '', id_archivo: null, modo: 'general', id_cuota: '' });
  const [guardandoFactura, setGuardandoFactura] = useState(false);
  const toast = useToast();
  const { esSuperAdmin, esAdmin, esContabilidad } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [openEliminar, setOpenEliminar] = useState(false);
  const [facturaAEliminar, setFacturaAEliminar] = useState(null);
  // Anulación de factura: la factura queda como constancia (estado 'Anulada') y
  // el servicio/cuota vuelve a admitir la emisión de una nueva.
  const [facturaAAnular, setFacturaAAnular] = useState(null);
  const [motivoAnulacion, setMotivoAnulacion] = useState('');
  const [anulando, setAnulando] = useState(false);
  const puedeAnularFacturas = esSuperAdmin || esAdmin || esContabilidad;

  const cargar = async () => { setLoading(true); try { setData(await cobrosService.get(id)); } finally { setLoading(false); } };
  useEffect(() => { cargar(); }, [id]);

  // Cada vez que se abre el modal de cuotas (o cambia el cobro), prepoblar
  // con las cuotas actuales. Las blindadas (pagadas o facturadas) preservan
  // su id y quedan deshabilitadas; las demás se pueden editar libremente.
  useEffect(() => {
    if (!openCuotas || !data) return;
    const cuotasActuales = Array.isArray(data.cuotas) ? data.cuotas : [];
    const cuotasUI = cuotasActuales
      .slice()
      .sort((a, b) => a.numero_cuota - b.numero_cuota)
      .map(c => ({
        id: c.id,
        numero_cuota: c.numero_cuota,
        fecha_vencimiento: String(c.fecha_vencimiento).slice(0, 10),
        monto: Number(c.monto).toFixed(2),
        blindada: cuotaEstaBlindada(c)
      }));
    const primeraNoBlind = cuotasUI.find(c => !c.blindada)?.fecha_vencimiento;
    const fallback = data.fecha_proximo_abono ? toYMDLima(data.fecha_proximo_abono) : hoyISO();
    setCuotas({
      numero_cuotas: cuotasUI.length || 1,
      fecha_proximo_abono: primeraNoBlind || fallback,
      cuotas: cuotasUI
    });
  }, [openCuotas, data]);

  useEffect(() => {
    cuentasBancariasService.catalogos()
      .then(c => {
        const metodos = c?.metodos_pago || [];
        setMetodosPago(metodos);
        setAbono(a => a.metodo_pago ? a : { ...a, metodo_pago: metodos[0]?.codigo || '' });
      })
      .catch(() => {});
    cuentasBancariasService.list()
      .then(setCuentasBancarias)
      .catch(() => {});
  }, []);

  const metodoActual = useMemo(
    () => metodosPago.find(m => m.codigo === abono.metodo_pago) || null,
    [metodosPago, abono.metodo_pago]
  );
  const requiereCuenta = !!metodoActual?.requiere_cuenta;

  if (loading || !data) return <Loader />;

  const subirComprobante = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const fd = new FormData(); fd.append('archivo', file);
    try { const r = await archivosService.upload(fd, 'comprobantes'); setAbono(a => ({ ...a, id_archivo_comprobante: r.id })); toast.success('Comprobante cargado'); }
    catch (err) { toast.error('Error al subir'); }
  };

  const registrar = async () => {
    if (!abono.monto || Number(abono.monto) <= 0) return toast.error('Monto inválido');
    if (requiereCuenta && !abono.id_cuenta_bancaria) {
      return toast.error(`El método "${abono.metodo_pago}" requiere seleccionar una cuenta bancaria`);
    }
    try {
      const payload = {
        ...abono,
        id_cuenta_bancaria: abono.id_cuenta_bancaria ? Number(abono.id_cuenta_bancaria) : null
      };
      await cobrosService.registrarPago(id, payload);
      toast.success('Abono registrado'); setOpenAbono(false);
      setAbono({ monto: '', fecha_pago: hoyISO(), metodo_pago: metodosPago[0]?.codigo || '', id_cuenta_bancaria: '', observaciones: '', id_archivo_comprobante: null });
      cargar();
    } catch (err) { toast.error(err.response?.data?.error || 'Error'); }
  };

  // Atajo "Pagar cuota": abre el modal de abono con el saldo de esa cuota
  // precargado en `monto`. No fuerza nada en el backend — el `registrarPago`
  // existente sigue aplicando los abonos en orden FIFO; el botón solo evita
  // que contabilidad tenga que mirar la cuota y tipear el saldo a mano.
  const pagarCuota = (cu) => {
    const saldo = Math.max(0, Number(cu.monto || 0) - Number(cu.monto_pagado || 0));
    setAbono(a => ({
      ...a,
      monto: saldo > 0 ? saldo.toFixed(2) : '',
      fecha_pago: hoyISO(),
      id_archivo_comprobante: null,
      observaciones: ''
    }));
    setOpenAbono(true);
  };

  const blindadasModal = cuotas.cuotas.filter(c => c.blindada);
  const noBlindadasModal = cuotas.cuotas.filter(c => !c.blindada);
  const sumaBlindadas = blindadasModal.reduce((acc, c) => acc + Number(c.monto || 0), 0);

  /**
   * Genera/regenera el bloque NO blindado.
   * - saldo_variable=false: distribuye (monto_total - sumaBlindadas) entre N cuotas nuevas.
   * - saldo_variable=true: el usuario decide el monto total del saldo posterior
   *   con el input "monto_restante"; aquí lo distribuimos en N cuotas iguales.
   */
  const generarCuotas = () => {
    const monto = data.saldo_variable
      ? Number(cuotas.monto_restante || 0)
      : Math.max(0, Number(data.monto_total) - sumaBlindadas);
    const n = Math.max(1, Number(cuotas.numero_cuotas) || 1);
    const inicioYMD = toYMDLima(cuotas.fecha_proximo_abono) || hoyISO();
    const totalCents = Math.round(monto * 100);
    const baseCents = Math.floor(totalCents / n);
    const nuevas = [];
    for (let i = 1; i <= n; i++) {
      const cents = i === n ? totalCents - baseCents * (n - 1) : baseCents;
      nuevas.push({
        numero_cuota: blindadasModal.length + i,
        fecha_vencimiento: addMonthsYMD(inicioYMD, i - 1),
        monto: (cents / 100).toFixed(2),
        blindada: false
      });
    }
    setCuotas(c => ({ ...c, cuotas: [...blindadasModal, ...nuevas] }));
  };

  const sumaCuotasActual = cuotas.cuotas.reduce((acc, c) => acc + Number(c.monto || 0), 0);
  const objetivoCuotas = data?.saldo_variable
    ? sumaCuotasActual // en modo variable no hay objetivo fijo; se valida ≥ blindadas
    : Number(data?.monto_total || 0);
  const diferenciaCuotas = sumaCuotasActual - objetivoCuotas;
  const sumaCuotasOk = data?.saldo_variable
    ? sumaCuotasActual + 0.01 >= sumaBlindadas && cuotas.cuotas.length > 0
    : cuotas.cuotas.length > 0 && Math.abs(diferenciaCuotas) <= 0.01;

  const guardarCuotas = async () => {
    if (guardandoCuotas) return;
    if (!sumaCuotasOk) {
      if (data.saldo_variable) {
        return toast.error(`La suma (S/ ${sumaCuotasActual.toFixed(2)}) no puede ser menor a lo ya comprometido (S/ ${sumaBlindadas.toFixed(2)})`);
      }
      return toast.error(`La suma de las cuotas (S/ ${sumaCuotasActual.toFixed(2)}) debe ser exactamente S/ ${objetivoCuotas.toFixed(2)}`);
    }
    setGuardandoCuotas(true);
    try {
      // Enviar id solo si la cuota ya existía (blindadas + cualquier no
      // blindada que viniera del servidor). Las nuevas no llevan id.
      const payload = {
        numero_cuotas: cuotas.cuotas.length,
        fecha_proximo_abono: cuotas.fecha_proximo_abono,
        cuotas: cuotas.cuotas.map((c, i) => ({
          id: c.id || undefined,
          numero_cuota: i + 1,
          fecha_vencimiento: c.fecha_vencimiento,
          monto: Number(c.monto)
        }))
      };
      await cobrosService.setPlanCuotas(id, payload);
      toast.success('Plan de cuotas guardado');
      setOpenCuotas(false);
      cargar();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Error');
    } finally {
      setGuardandoCuotas(false);
    }
  };

  const cerrar = async () => {
    if (!confirm('¿Cerrar definitivamente este cobro?')) return;
    try { await cobrosService.cerrar(id); toast.success('Cobro cerrado'); cargar(); }
    catch (err) { toast.error(err.response?.data?.error || 'Error'); }
  };

  const recordar = async () => {
    try { const r = await cobrosService.recordatorio(id); window.open(r.url, '_blank'); toast.success('WhatsApp abierto'); }
    catch (err) { toast.error(err.response?.data?.error || 'Error'); }
  };

  const subirArchivoFactura = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const fd = new FormData(); fd.append('archivo', file);
    try { const r = await archivosService.upload(fd, 'facturas'); setFactura(f => ({ ...f, id_archivo: r.id })); toast.success('Archivo cargado'); }
    catch { toast.error('Error subiendo archivo'); }
  };
  const facturasActivas = (data.facturas || []).filter(esFacturaActiva);
  // Cobro de un PLAN de mantenimiento: cada cuota es un MES del plan y se
  // paga una sola vez, por el monto mensual pactado. Su desglose de
  // mantenimientos llega en `detalle_mensual` de cada cuota.
  const esPlanMensual = !!data.id_mantenimiento_plan;
  // Un correctivo marcado "Con factura" (requiere_factura=1) no admite abonos
  // hasta que exista una factura del servicio (general o por cuota).
  const tieneFacturaServicio = facturasActivas.length > 0
    || (data.cuotas || []).some(cu => Array.isArray(cu.facturas) && cu.facturas.some(esFacturaActiva));
  const esCorrectivo = data.servicio?.tipo_servicio?.modulo_asociado === 'correctivo'
    || data.servicio?.origen === 'correctivo';
  const bloquearAbonoPorFactura = esCorrectivo
    && data.servicio?.requiere_factura === 1 && !tieneFacturaServicio;
  const hayFacturaGeneral = facturasActivas.some(f => f.id_cuota === null);
  const hayFacturaPorCuota = facturasActivas.some(f => f.id_cuota !== null);
  const cuotasNoFacturadas = (data.cuotas || []).filter(c => !facturasActivas.some(f => f.id_cuota === c.id));
  const facturaPorCuotaIndex = new Map(facturasActivas.filter(f => f.id_cuota !== null).map(f => [f.id_cuota, f]));

  const abrirModalFactura = () => {
    if (hayFacturaGeneral) {
      toast.error('Este servicio ya tiene una factura general. Anúlela antes de emitir otra.');
      return;
    }
    const modoInicial = hayFacturaPorCuota ? 'por_cuota' : 'general';
    const primeraCuotaLibre = cuotasNoFacturadas[0];
    if (modoInicial === 'por_cuota' && !primeraCuotaLibre) {
      toast.error('Todas las cuotas ya están facturadas.');
      return;
    }
    setFactura({
      numero_factura: '',
      // Sugerencia por el documento del cliente (RUC → Factura, DNI → Boleta).
      tipo_comprobante: tipoComprobanteSugerido(data.cliente?.tipo_documento),
      fecha_emision: hoyISO(),
      monto: modoInicial === 'general'
        ? Number(data.monto_total).toFixed(2)
        : Number(primeraCuotaLibre?.monto || 0).toFixed(2),
      id_archivo: null,
      modo: modoInicial,
      id_cuota: modoInicial === 'por_cuota' ? String(primeraCuotaLibre.id) : ''
    });
    setOpenFactura(true);
  };
  const cambiarModoFactura = (modo) => {
    if (modo === 'general' && hayFacturaPorCuota) return;
    if (modo === 'por_cuota' && hayFacturaGeneral) return;
    if (modo === 'por_cuota') {
      const primera = cuotasNoFacturadas[0];
      if (!primera) { toast.error('No quedan cuotas sin facturar'); return; }
      setFactura(f => ({ ...f, modo, id_cuota: String(primera.id), monto: Number(primera.monto).toFixed(2) }));
    } else {
      setFactura(f => ({ ...f, modo, id_cuota: '', monto: Number(data.monto_total).toFixed(2) }));
    }
  };
  const cambiarCuotaFactura = (idCuota) => {
    const cuota = (data.cuotas || []).find(c => String(c.id) === String(idCuota));
    setFactura(f => ({ ...f, id_cuota: idCuota, monto: cuota ? Number(cuota.monto).toFixed(2) : f.monto }));
  };
  const sumaFacturasPorCuotaPrevia = facturasActivas
    .filter(f => f.id_cuota !== null)
    .reduce((acc, f) => acc + Number(f.monto), 0);
  const restanteServicio = Math.max(0, Number(data.monto_total) - sumaFacturasPorCuotaPrevia);

  const abrirAnular = (f) => { setMotivoAnulacion(''); setFacturaAAnular(f); };

  const anularFactura = async () => {
    if (!facturaAAnular) return;
    if (!motivoAnulacion.trim()) return toast.error('Indica el motivo de la anulación');
    setAnulando(true);
    try {
      await facturasService.anular(facturaAAnular.id, motivoAnulacion.trim());
      toast.success(`Factura ${facturaAAnular.numero_factura} anulada. Ya puedes emitir una nueva.`);
      setFacturaAAnular(null);
      cargar();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Error al anular la factura');
    } finally {
      setAnulando(false);
    }
  };

  const marcarFacturaEnviada = async (factura) => {
    if (!puedeMarcarseEnviada(factura.estado_factura)) return;
    if (!confirm(`¿Confirmar que la factura ${factura.numero_factura} ya fue enviada al cliente?`)) return;
    try {
      await facturasService.cambiarEstado(factura.id, ESTADO_FACTURA_ENVIADA);
      toast.success(`Factura ${factura.numero_factura} marcada como enviada`);
      cargar();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Error al actualizar la factura');
    }
  };

  const crearFactura = async () => {
    if (guardandoFactura) return;
    if (!factura.numero_factura) return toast.error('Número de comprobante obligatorio');
    if (factura.monto === '' || Number(factura.monto) < 0) return toast.error('Monto inválido');
    if (factura.modo === 'por_cuota' && !factura.id_cuota) return toast.error('Seleccione la cuota a facturar');
    if (factura.modo === 'por_cuota' && Number(factura.monto) > restanteServicio + 0.01) {
      return toast.error(`El monto excede el restante por facturar (S/ ${restanteServicio.toFixed(2)})`);
    }
    setGuardandoFactura(true);
    try {
      const payload = {
        id_servicio: data.servicio.id,
        numero_factura: factura.numero_factura,
        tipo_comprobante: factura.tipo_comprobante,
        fecha_emision: factura.fecha_emision,
        monto: factura.monto,
        id_archivo: factura.id_archivo,
        id_cuota: factura.modo === 'por_cuota' ? Number(factura.id_cuota) : null
      };
      await facturasService.create(payload);
      toast.success('Factura registrada'); setOpenFactura(false); cargar();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Error');
    } finally {
      setGuardandoFactura(false);
    }
  };

  return (
    <>
      <PageHeader title={
        <span className="inline-flex items-center gap-2">
          Cobro {data.servicio?.codigo}
          {data.saldo_variable && (
            <span className="badge-amber text-[10px]" title="Saldo posterior al adelanto es variable: cuotas pagadas/facturadas quedan blindadas, el resto puede redistribuirse y la suma puede ajustarse">
              Saldo variable
            </span>
          )}
        </span>
      } subtitle={`${data.cliente?.nombre}`}
        actions={
          <>
            <Link to={location.state?.from || '/cobros'} className="btn-secondary">{location.state?.fromLabel ? `← ${location.state.fromLabel}` : '← Cobros'}</Link>
            {data.estado_cobro !== 'Cerrado' && !esPlanMensual && (
              <button onClick={() => setOpenCuotas(true)} className="btn-secondary">Plan de cuotas</button>
            )}
            {esPlanMensual && (
              <Link to={`/mantenimientos`} className="btn-secondary" title="Las cuotas de un plan son sus meses: se aprueban desde el plan">
                Ver plan
              </Link>
            )}
            {Number(data.saldo_pendiente) > 0 && (
              <button onClick={() => setOpenAbono(true)} disabled={bloquearAbonoPorFactura}
                title={bloquearAbonoPorFactura ? 'Este correctivo requiere factura: agrega una factura al cobro antes de registrar abonos.' : undefined}
                className="btn-primary disabled:opacity-50 disabled:cursor-not-allowed">+ Registrar abono</button>
            )}
            {Number(data.saldo_pendiente) > 0 && <button onClick={recordar} className="btn-secondary">Recordatorio WhatsApp</button>}
            {Number(data.saldo_pendiente) === 0 && data.estado_cobro !== 'Cerrado' && <button onClick={cerrar} className="btn-primary">Cerrar cobro</button>}
            <button onClick={abrirModalFactura} className="btn-secondary">+ Factura</button>
            {esSuperAdmin && <button onClick={() => setOpenEliminar(true)} className="btn-secondary !text-rose-600 !border-rose-200 hover:!bg-rose-50">Eliminar cobro</button>}
          </>
        } />

      {data.estado_cobro !== 'Cerrado' && bloquearAbonoPorFactura && (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <span>
            <strong>Requiere factura para registrar abonos.</strong> Este correctivo está marcado como “Con factura”: agrega una factura al cobro antes de poder registrar abonos.
          </span>
          <button onClick={abrirModalFactura} className="btn-secondary shrink-0">+ Factura</button>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <div className="card lg:col-span-1">
          <div className="card-header"><h3 className="card-title">Resumen</h3><span className={badgeEstado(data.estado_cobro)}>{data.estado_cobro}</span></div>
          <div className="card-body grid grid-cols-2 gap-3 text-sm">
            <Info label="Cliente" value={data.cliente?.nombre} cols={2} />
            <Info label="Servicio" value={<Link to={`/servicios/${data.servicio?.id}`} className="text-brand-700 hover:underline font-mono">{data.servicio?.codigo}</Link>} cols={2} />
            <Info label="Precio total" value={<span className="font-mono">{formatMonto(data.monto_total, data.moneda)}</span>} />
            <Info label="Abonado" value={<span className="font-mono text-emerald-700">{formatMonto(data.total_abonado, data.moneda)}</span>} />
            <Info label="Saldo" value={<span className="font-mono font-medium text-rose-700">{formatMonto(data.saldo_pendiente, data.moneda)}</span>} />
            <Info label="Cuotas P/T" value={`${data.cuotas_pagadas} / ${data.numero_cuotas}`} />
            <Info label="Próximo abono" value={formatFecha(data.fecha_proximo_abono)} />
            <Info label="Días para próx." value={data.dias_proximo ?? '—'} />
            <Info label="Días de mora" value={<span className={data.dias_mora > 0 ? 'text-rose-700 font-semibold' : ''}>{data.dias_mora || '—'}</span>} />
            <Info label="Último abono" value={formatFecha(data.fecha_ultimo_abono)} />
          </div>
        </div>

        <div className="card lg:col-span-2">
          <div className="card-header"><h3 className="card-title">Abonos · {data.pagos?.length || 0}</h3></div>
          <div className="overflow-x-auto scroll-thin">
            <table className="table-base">
              <thead><tr>
                <th className="table-th">#</th><th className="table-th">Fecha</th>
                <th className="table-th">Método</th><th className="table-th">Cuenta</th>
                <th className="table-th text-right">Monto</th>
                <th className="table-th">Comprobante</th><th className="table-th">Notas</th>
              </tr></thead>
              <tbody className="divide-y divide-slate-100">
                {data.pagos?.length === 0 && <tr><td colSpan="7" className="table-td text-center text-slate-400 py-6">Sin abonos</td></tr>}
                {data.pagos?.map(p => (
                  <tr key={p.id}>
                    <td className="table-td font-mono text-xs">{p.numero_abono}</td>
                    <td className="table-td text-xs">{formatFecha(p.fecha_pago)}</td>
                    <td className="table-td text-xs">{p.metodo_pago}</td>
                    <td className="table-td text-xs">
                      {p.cuenta_bancaria
                        ? (
                          <div className="leading-tight">
                            <div className="font-semibold text-slate-800">{p.cuenta_bancaria.nombre}</div>
                            <div className="text-[11px] text-slate-500">{p.cuenta_bancaria.banco}</div>
                          </div>
                        )
                        : <span className="text-slate-400">—</span>}
                    </td>
                    <td className="table-td text-right font-mono text-emerald-700">{formatMonto(p.monto, data.moneda)}</td>
                    <td className="table-td">{p.archivo ? <FileLink archivo={p.archivo} className="text-brand-700 text-xs hover:underline">Ver</FileLink> : '—'}</td>
                    <td className="table-td text-xs">{p.observaciones || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {data.aprobacion_cotizacion && (data.aprobacion_cotizacion.observaciones || (data.aprobacion_cotizacion.plan_cuotas || []).some(c => c.observacion)) && (
          <div className="card lg:col-span-3">
            <div className="card-header">
              <h3 className="card-title">Comentarios de aprobación</h3>
              <span className="text-[11px] text-slate-500">
                {data.aprobacion_cotizacion.codigo_cotizacion} · v{data.aprobacion_cotizacion.numero_version}
                {data.aprobacion_cotizacion.fecha_aprobacion ? ` · ${formatFecha(data.aprobacion_cotizacion.fecha_aprobacion)}` : ''}
              </span>
            </div>
            <div className="card-body space-y-3 text-sm">
              {data.aprobacion_cotizacion.observaciones && (
                <div>
                  <div className="text-[11px] uppercase tracking-wider text-slate-500 mb-1">Comentario general</div>
                  <p className="text-slate-700 whitespace-pre-line border-l-2 border-brand-200 pl-3">{data.aprobacion_cotizacion.observaciones}</p>
                </div>
              )}
              {(data.aprobacion_cotizacion.plan_cuotas || []).filter(c => c.observacion).length > 0 && (
                <div>
                  <div className="text-[11px] uppercase tracking-wider text-slate-500 mb-1">Comentarios por cuota</div>
                  <ul className="space-y-1">
                    {(data.aprobacion_cotizacion.plan_cuotas || []).filter(c => c.observacion).map(c => (
                      <li key={c.numero_cuota} className="text-xs flex gap-2">
                        <span className="font-mono text-slate-500 shrink-0">Cuota {c.numero_cuota}:</span>
                        <span className="text-slate-700 whitespace-pre-line">{c.observacion}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </div>
        )}

        {data.cuotas?.length > 0 && (
          <div className="card lg:col-span-3">
            <div className="card-header flex items-center justify-between gap-3">
              <h3 className="card-title">{esPlanMensual ? 'Meses del plan' : 'Cuotas'}</h3>
              {esPlanMensual && (
                <span className="text-[11px] text-slate-500">
                  Un solo pago por mes, por el monto mensual pactado. El detalle lista los mantenimientos cubiertos.
                </span>
              )}
            </div>
            <table className="table-base">
              <thead><tr>
                <th className="table-th">N°</th><th className="table-th">Vencimiento</th>
                <th className="table-th text-right">Monto</th><th className="table-th text-right">Pagado</th>
                <th className="table-th">Estado</th><th className="table-th">Fecha pago</th>
                <th className="table-th">Factura</th>
                <th className="table-th">Comentario aprobado</th>
                <th className="table-th text-right">Acción</th>
              </tr></thead>
              <tbody className="divide-y divide-slate-100">
                {(() => {
                  // Una cotización aprobada en modo "Adelanto + saldo" (plan de
                  // 2 cuotas) implica que la cuota 1 funciona como adelanto
                  // requerido para iniciar el servicio. Solo es etiqueta
                  // informativa: no cambia montos ni flujo de pagos.
                  const planAprobado = data.aprobacion_cotizacion?.plan_cuotas;
                  const esAdelantoRequerido = Array.isArray(planAprobado) && planAprobado.length === 2;
                  return data.cuotas.map(c => {
                    const fac = facturaPorCuotaIndex.get(c.id);
                    const saldoCuota = Math.max(0, Number(c.monto || 0) - Number(c.monto_pagado || 0));
                    const tieneSaldo = saldoCuota > 0.005;
                    const comentarioAprobado = (data.aprobacion_cotizacion?.plan_cuotas || [])
                      .find(pc => Number(pc.numero_cuota) === Number(c.numero_cuota))?.observacion || '';
                    const mostrarPendienteAdelanto = esAdelantoRequerido
                      && Number(c.numero_cuota) === 1
                      && c.estado_cuota === 'Pendiente';
                    const estadoLabel = mostrarPendienteAdelanto ? 'Pendiente de adelanto' : c.estado_cuota;
                    // Detalle del mes que factura esta cuota. Solo lo traen
                    // los cobros de plan de mantenimiento.
                    const det = c.detalle_mensual || null;
                    return (
                    <Fragment key={c.id}>
                    <tr>
                      <td className="table-td">
                        {det ? <span title={det.etiqueta}>{det.etiqueta}</span> : c.numero_cuota}
                      </td>
                      <td className="table-td text-xs">{formatFecha(c.fecha_vencimiento)}</td>
                      <td className="table-td text-right font-mono">{formatMonto(c.monto, data.moneda)}</td>
                      <td className="table-td text-right font-mono">{formatMonto(c.monto_pagado, data.moneda)}</td>
                      <td className="table-td">
                        <span
                          className={badgeEstado(estadoLabel)}
                          title={mostrarPendienteAdelanto ? 'Esta cuota debe pagarse como adelanto para iniciar el servicio' : undefined}
                        >{estadoLabel}</span>
                      </td>
                      <td className="table-td text-xs">{formatFecha(c.fecha_pago)}</td>
                      <td className="table-td text-xs">
                        {fac
                          ? <span className="font-mono text-brand-700">{fac.numero_factura}</span>
                          : hayFacturaGeneral
                            ? <span className="text-slate-400 italic">cubierta por general</span>
                            : <span className="text-slate-400">—</span>}
                      </td>
                      <td className="table-td text-xs max-w-xs">
                        {comentarioAprobado
                          ? <span className="text-slate-700 whitespace-pre-line" title={comentarioAprobado}>{comentarioAprobado}</span>
                          : <span className="text-slate-300">—</span>}
                      </td>
                      <td className="table-td text-right">
                        {tieneSaldo
                          ? (
                            <button
                              type="button"
                              onClick={() => pagarCuota(c)}
                              className="btn-primary text-xs !py-1 !px-2.5"
                              title={`Prellena el abono con S/ ${saldoCuota.toFixed(2)} (los pagos se aplican en orden FIFO a las cuotas pendientes)`}
                            >
                              Pagar
                            </button>
                          )
                          : <span className="text-slate-300">—</span>}
                      </td>
                    </tr>
                    {det && (
                      <tr className="bg-slate-50/70">
                        <td className="table-td" colSpan={9}>
                          <div className="text-xs space-y-1">
                            <div className="text-[10px] uppercase tracking-wide text-slate-500">
                              {det.etiqueta} · {formatFecha(det.desde)} → {formatFecha(det.hasta)} · {det.total_visitas} mantenimiento(s)
                            </div>
                            {det.detalle.length === 0 ? (
                              <p className="text-slate-500">Sin mantenimientos programados este mes.</p>
                            ) : (
                              <ul className="space-y-0.5">
                                {det.detalle.map(d => (
                                  <li key={d.id_ascensor} className="flex items-start justify-between gap-3">
                                    <span className="font-mono text-slate-800">
                                      {d.codigo} <span className="font-sans text-slate-500">× {d.visitas}</span>
                                      {d.edificio && <span className="font-sans text-slate-400"> · {d.edificio}</span>}
                                    </span>
                                    <span className="text-slate-600 text-right">
                                      {d.fechas.map(x => (
                                        <span key={x.id_programacion} className={x.realizada ? 'text-emerald-700' : ''}>
                                          {formatFecha(x.fecha)}{x.codigo_servicio ? ` (${x.codigo_servicio})` : ''}{' '}
                                        </span>
                                      ))}
                                    </span>
                                  </li>
                                ))}
                              </ul>
                            )}
                          </div>
                        </td>
                      </tr>
                    )}
                    </Fragment>
                  );
                  });
                })()}
              </tbody>
            </table>
          </div>
        )}

        {data.facturas?.length > 0 && (
          <div className="card lg:col-span-3">
            <div className="card-header"><h3 className="card-title">Facturas</h3></div>
            <table className="table-base">
              <thead><tr>
                <th className="table-th">Número</th>
                <th className="table-th">Emisión</th>
                <th className="table-th text-right">Monto</th>
                <th className="table-th">Cobertura</th>
                <th className="table-th">Estado</th>
                <th className="table-th">Archivo</th>
                <th className="table-th text-right">Acción</th>
              </tr></thead>
              <tbody className="divide-y divide-slate-100">
                {data.facturas.map(f => (
                  <tr key={f.id}>
                    <td className="table-td font-mono text-xs">{f.numero_factura}</td>
                    <td className="table-td text-xs">{formatFecha(f.fecha_emision)}</td>
                    <td className="table-td text-right font-mono">{formatMonto(f.monto, data.moneda)}</td>
                    <td className="table-td text-xs">
                      {f.id_cuota
                        ? <span className="badge-blue">Cuota N° {f.cuota?.numero_cuota ?? '?'}</span>
                        : <span className="badge-violet">General</span>}
                    </td>
                    <td className="table-td"><span className={badgeEstado(f.estado_factura)}>{f.estado_factura}</span></td>
                    <td className="table-td">{f.archivo ? <FileLink archivo={f.archivo} className="text-brand-700 text-xs hover:underline">Ver</FileLink> : '—'}</td>
                    <td className="table-td text-right">
                      {!esFacturaActiva(f) ? (
                        <span className="text-slate-400 text-xs">Anulada</span>
                      ) : puedeMarcarseEnviada(f.estado_factura) ? (
                        <button
                          type="button"
                          onClick={() => marcarFacturaEnviada(f)}
                          className="btn-primary text-xs !py-1 !px-2.5"
                          title="Marcar la factura como enviada al cliente"
                        >
                          Factura enviada
                        </button>
                      ) : f.estado_factura === ESTADO_FACTURA_ENVIADA ? (
                        <span className="text-emerald-700 text-xs font-medium">✓ Enviada</span>
                      ) : (
                        <span className="text-slate-300">—</span>
                      )}
                      {puedeAnularFacturas && esFacturaActiva(f) && (
                        <>
                          <span className="text-slate-300 mx-1.5">·</span>
                          <button
                            type="button"
                            onClick={() => abrirAnular(f)}
                            className="text-ember-700 text-xs hover:underline"
                            title="Anular esta factura para poder emitir una nueva"
                          >Anular</button>
                        </>
                      )}
                      {esSuperAdmin && (
                        <>
                          <span className="text-slate-300 mx-1.5">·</span>
                          <button type="button" onClick={() => setFacturaAEliminar(f)} className="text-rose-600 text-xs hover:underline">Eliminar</button>
                        </>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {data.recordatorios?.length > 0 && (
          <div className="card lg:col-span-3">
            <div className="card-header"><h3 className="card-title">Recordatorios enviados</h3></div>
            <ul className="card-body space-y-2 max-h-72 overflow-y-auto scroll-thin">
              {data.recordatorios.map(r => (
                <li key={r.id} className="text-xs text-slate-600 border-l-2 border-emerald-200 pl-3">
                  <div className="text-slate-400">{formatFechaHora(r.fecha_envio)} · {r.canal}</div>
                  <div className="mt-0.5 whitespace-pre-line">{r.mensaje}</div>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {/* Modal abono */}
      <Modal open={openAbono} onClose={() => setOpenAbono(false)} title="Registrar abono"
        footer={<><button className="btn-secondary" onClick={() => setOpenAbono(false)}>Cancelar</button><button className="btn-primary" onClick={registrar}>Registrar</button></>}>
        <div className="space-y-4">
          <div><label className="label">Monto *</label><input type="number" step="0.01" className="input" value={abono.monto} onChange={e => setAbono(a => ({ ...a, monto: e.target.value }))} placeholder={`Saldo: ${data.saldo_pendiente}`} /></div>
          <div><label className="label">Fecha *</label><input type="date" className="input" value={abono.fecha_pago} onChange={e => setAbono(a => ({ ...a, fecha_pago: e.target.value }))} /></div>
          <div><label className="label">Método</label><select className="select" value={abono.metodo_pago} onChange={e => setAbono(a => ({ ...a, metodo_pago: e.target.value, id_cuenta_bancaria: '' }))}>{metodosPago.map(m => <option key={m.codigo} value={m.codigo}>{m.etiqueta}</option>)}</select></div>
          {requiereCuenta && (
            <div>
              <label className="label">Cuenta de destino *</label>
              <select
                className="select"
                required
                value={abono.id_cuenta_bancaria}
                onChange={e => setAbono(a => ({ ...a, id_cuenta_bancaria: e.target.value }))}
                disabled={cuentasBancarias.length === 0}
              >
                <option value="">— Seleccione cuenta —</option>
                {cuentasBancarias.map(c => (
                  <option key={c.id} value={c.id}>
                    {c.nombre} · {c.banco} · {c.numero_cuenta} ({c.moneda})
                  </option>
                ))}
              </select>
              {cuentasBancarias.length === 0 && (
                <p className="mt-1 text-[11px] text-rose-600">No hay cuentas bancarias registradas. Configúrelas en Configuración.</p>
              )}
            </div>
          )}
          <div><label className="label">Comprobante</label><input type="file" className="input" onChange={subirComprobante} /></div>
          <div><label className="label">Observaciones</label><textarea className="textarea" rows="2" value={abono.observaciones} onChange={e => setAbono(a => ({ ...a, observaciones: e.target.value }))} /></div>
        </div>
      </Modal>

      {/* Modal cuotas */}
      <Modal open={openCuotas} onClose={() => !guardandoCuotas && setOpenCuotas(false)} title="Plan de cuotas"
        footer={<><button className="btn-secondary" onClick={() => setOpenCuotas(false)} disabled={guardandoCuotas}>Cancelar</button><button className="btn-primary" onClick={guardarCuotas} disabled={guardandoCuotas || !sumaCuotasOk}>{guardandoCuotas ? 'Guardando…' : 'Guardar'}</button></>}>
        <div className="space-y-4">
          {data.saldo_variable ? (
            <div className="rounded-md bg-amber-50 ring-1 ring-amber-200 text-amber-800 px-3 py-2 text-xs">
              <span className="font-semibold">Saldo variable.</span> Las cuotas pagadas o facturadas
              quedan blindadas. El resto se puede redistribuir y la suma total puede subir o bajar
              (mínimo: lo ya comprometido S/ {sumaBlindadas.toFixed(2)}).
            </div>
          ) : (
            <div className="rounded-md bg-slate-50 ring-1 ring-slate-200 text-slate-700 px-3 py-2 text-xs">
              Las cuotas pagadas o facturadas quedan blindadas. El resto se puede redistribuir,
              pero la suma debe ser exactamente <span className="font-mono">S/ {Number(data.monto_total).toFixed(2)}</span>.
            </div>
          )}

          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="label">Cuotas nuevas a generar</label>
              <input type="number" min="1" className="input" value={cuotas.numero_cuotas}
                onChange={e => setCuotas(c => ({ ...c, numero_cuotas: e.target.value }))} />
            </div>
            <div>
              <label className="label">Fecha 1ra nueva</label>
              <input type="date" className="input" value={cuotas.fecha_proximo_abono}
                onChange={e => setCuotas(c => ({ ...c, fecha_proximo_abono: e.target.value }))} />
            </div>
            {data.saldo_variable && (
              <div>
                <label className="label">Monto del saldo restante</label>
                <input type="number" step="0.01" min="0" className="input"
                  value={cuotas.monto_restante ?? (Number(data.monto_total) - sumaBlindadas).toFixed(2)}
                  onChange={e => setCuotas(c => ({ ...c, monto_restante: e.target.value }))} />
              </div>
            )}
          </div>
          <button onClick={generarCuotas} className="btn-secondary w-full">Regenerar cuotas pendientes (mensual)</button>
          {cuotas.cuotas.length > 0 && (
            <>
              <table className="table-base">
                <thead><tr><th className="table-th">N°</th><th className="table-th">Vencimiento</th><th className="table-th">Monto</th><th className="table-th"></th></tr></thead>
                <tbody>
                  {cuotas.cuotas.map((c, idx) => (
                    <tr key={c.id ?? `nueva-${idx}`}>
                      <td className="table-td">
                        {c.numero_cuota}
                        {c.blindada && <span className="ml-2 text-[10px] text-amber-700">🔒 blindada</span>}
                      </td>
                      <td className="table-td">
                        <input type="date" className="input"
                          value={c.fecha_vencimiento}
                          disabled={c.blindada}
                          onChange={e => setCuotas(s => ({ ...s, cuotas: s.cuotas.map((x, i) => i === idx ? { ...x, fecha_vencimiento: e.target.value } : x) }))} />
                      </td>
                      <td className="table-td">
                        <input type="number" step="0.01" className="input"
                          value={c.monto}
                          disabled={c.blindada}
                          onChange={e => setCuotas(s => ({ ...s, cuotas: s.cuotas.map((x, i) => i === idx ? { ...x, monto: e.target.value } : x) }))} />
                      </td>
                      <td className="table-td text-right">
                        {!c.blindada && (
                          <button type="button" onClick={() => setCuotas(s => ({ ...s, cuotas: s.cuotas.filter((_, i) => i !== idx) }))}
                            className="text-slate-400 hover:text-rose-600 text-lg leading-none">×</button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {data.saldo_variable ? (
                <div className={`flex items-center justify-between rounded-lg px-3 py-2 text-sm ring-1 ${sumaCuotasOk ? 'bg-emerald-50 ring-emerald-200 text-emerald-800' : 'bg-rose-50 ring-rose-200 text-rose-800'}`}>
                  <span>Suma total: <span className="font-mono font-semibold">S/ {sumaCuotasActual.toFixed(2)}</span> · Mín. comprometido: <span className="font-mono font-semibold">S/ {sumaBlindadas.toFixed(2)}</span></span>
                  {sumaCuotasOk
                    ? <span className="text-xs font-medium">✓ válido</span>
                    : <span className="text-xs font-medium">Falta S/ {(sumaBlindadas - sumaCuotasActual).toFixed(2)}</span>}
                </div>
              ) : (
                <div className={`flex items-center justify-between rounded-lg px-3 py-2 text-sm ring-1 ${sumaCuotasOk ? 'bg-emerald-50 ring-emerald-200 text-emerald-800' : 'bg-rose-50 ring-rose-200 text-rose-800'}`}>
                  <span>Suma cuotas: <span className="font-mono font-semibold">S/ {sumaCuotasActual.toFixed(2)}</span> · Objetivo: <span className="font-mono font-semibold">S/ {objetivoCuotas.toFixed(2)}</span></span>
                  {sumaCuotasOk
                    ? <span className="text-xs font-medium">✓ coincide</span>
                    : <span className="text-xs font-medium">Diferencia: S/ {diferenciaCuotas.toFixed(2)}</span>}
                </div>
              )}
            </>
          )}
        </div>
      </Modal>

      {/* Modal factura */}
      <Modal open={openFactura} onClose={() => !guardandoFactura && setOpenFactura(false)} title="Registrar comprobante"
        footer={<><button className="btn-secondary" onClick={() => setOpenFactura(false)} disabled={guardandoFactura}>Cancelar</button><button className="btn-primary" onClick={crearFactura} disabled={guardandoFactura}>{guardandoFactura ? 'Registrando…' : 'Registrar'}</button></>}>
        <div className="space-y-4">
          <div>
            <label className="label">Alcance del comprobante</label>
            <div className="grid grid-cols-2 gap-2">
              <label className={`flex items-start gap-2 p-3 rounded-lg ring-1 cursor-pointer text-sm ${factura.modo === 'general' ? 'ring-brand-500 bg-brand-50' : 'ring-slate-200 bg-slate-50'} ${hayFacturaPorCuota ? 'opacity-50 cursor-not-allowed' : ''}`}>
                <input type="radio" className="mt-1" checked={factura.modo === 'general'} onChange={() => cambiarModoFactura('general')} disabled={hayFacturaPorCuota} />
                <div>
                  <div className="font-medium text-slate-800">General</div>
                  <div className="text-xs text-slate-500">Una factura por todo el servicio</div>
                </div>
              </label>
              <label className={`flex items-start gap-2 p-3 rounded-lg ring-1 cursor-pointer text-sm ${factura.modo === 'por_cuota' ? 'ring-brand-500 bg-brand-50' : 'ring-slate-200 bg-slate-50'} ${hayFacturaGeneral || (data.cuotas || []).length === 0 ? 'opacity-50 cursor-not-allowed' : ''}`}>
                <input type="radio" className="mt-1" checked={factura.modo === 'por_cuota'} onChange={() => cambiarModoFactura('por_cuota')} disabled={hayFacturaGeneral || (data.cuotas || []).length === 0} />
                <div>
                  <div className="font-medium text-slate-800">Por cuota</div>
                  <div className="text-xs text-slate-500">Una factura por cada cuota del plan</div>
                </div>
              </label>
            </div>
            {hayFacturaPorCuota && <p className="text-xs text-amber-700 mt-1">Ya hay facturas por cuota. No puede emitirse factura general.</p>}
            {hayFacturaGeneral && <p className="text-xs text-amber-700 mt-1">Ya hay factura general. No puede emitirse factura por cuota.</p>}
            {(data.cuotas || []).length === 0 && !hayFacturaPorCuota && <p className="text-xs text-slate-500 mt-1">Defina un plan de cuotas para habilitar la facturación por cuota.</p>}
          </div>

          {factura.modo === 'por_cuota' && (
            <div>
              <label className="label">Cuota a facturar *</label>
              <select className="select" value={factura.id_cuota} onChange={e => cambiarCuotaFactura(e.target.value)}>
                {cuotasNoFacturadas.length === 0 && <option value="">— Todas las cuotas ya facturadas —</option>}
                {cuotasNoFacturadas.map(c => (
                  <option key={c.id} value={c.id}>
                    Cuota N° {c.numero_cuota} · vence {formatFecha(c.fecha_vencimiento)} · S/ {Number(c.monto).toFixed(2)}
                  </option>
                ))}
              </select>
              <p className="text-xs text-slate-500 mt-1">
                Facturado previo: <span className="font-mono">S/ {sumaFacturasPorCuotaPrevia.toFixed(2)}</span> · Restante por facturar: <span className="font-mono">S/ {restanteServicio.toFixed(2)}</span>
              </p>
            </div>
          )}

          <div>
            <label className="label">Tipo de comprobante *</label>
            <select className="select" value={factura.tipo_comprobante}
              onChange={e => setFactura(f => ({ ...f, tipo_comprobante: e.target.value }))}>
              {TIPOS_COMPROBANTE.map(t => <option key={t.codigo} value={t.codigo}>{t.etiqueta}</option>)}
            </select>
          </div>
          <div><label className="label">Número de comprobante *</label><input className="input" value={factura.numero_factura} onChange={e => setFactura(f => ({ ...f, numero_factura: e.target.value }))} placeholder={ejemploNumeroComprobante(factura.tipo_comprobante)} /></div>
          <div><label className="label">Fecha emisión *</label><input type="date" className="input" value={factura.fecha_emision} onChange={e => setFactura(f => ({ ...f, fecha_emision: e.target.value }))} /></div>
          <div>
            <label className="label">Monto *</label>
            <input
              type="number"
              step="0.01"
              min="0"
              className={`input ${factura.modo === 'por_cuota' ? 'bg-slate-100 cursor-not-allowed' : ''}`}
              value={factura.monto}
              onChange={e => setFactura(f => ({ ...f, monto: e.target.value }))}
              readOnly={factura.modo === 'por_cuota'}
            />
            {factura.modo === 'por_cuota' && <p className="text-xs text-slate-500 mt-1">Fijado por el monto de la cuota seleccionada.</p>}
          </div>
          <div><label className="label">Archivo del comprobante</label><input type="file" className="input" onChange={subirArchivoFactura} /></div>
        </div>
      </Modal>

      <ConfirmarEliminacion
        open={openEliminar}
        onClose={() => setOpenEliminar(false)}
        titulo="Eliminar cobro"
        palabraClave={data.servicio?.codigo || 'ELIMINAR'}
        descripcion={
          <>
            Se dará de baja el cobro completo del servicio <span className="font-mono font-semibold">{data.servicio?.codigo}</span>:
            cuotas, abonos, recordatorios y facturas asociadas. El servicio quedará como <strong>Sin cobro</strong>.
            {Number(data.total_abonado) > 0 && (
              <> <br /><strong className="text-rose-700">Atención:</strong> este cobro tiene {formatMonto(data.total_abonado, data.moneda)} ya abonados que se perderán del registro.</>
            )}
          </>
        }
        onConfirmar={async () => {
          try {
            await cobrosService.remove(id);
            toast.success('Cobro eliminado');
            setOpenEliminar(false);
            navigate('/cobros');
          } catch (err) {
            toast.error(err.response?.data?.error || 'Error al eliminar cobro');
          }
        }}
      />

      <ConfirmarEliminacion
        open={!!facturaAEliminar}
        onClose={() => setFacturaAEliminar(null)}
        titulo="Eliminar factura"
        palabraClave={facturaAEliminar?.numero_factura || 'ELIMINAR'}
        descripcion={
          <>
            Se dará de baja la factura <span className="font-mono font-semibold">{facturaAEliminar?.numero_factura}</span>
            {facturaAEliminar?.estado_factura === ESTADO_FACTURA_ENVIADA && <> (que ya figura como <strong>Enviada</strong> al cliente)</>}.
            Se recalculará el estado de facturación del servicio y se eliminará su PDF. Acción auditada y recuperable.
          </>
        }
        onConfirmar={async () => {
          try {
            await facturasService.remove(facturaAEliminar.id);
            toast.success('Factura eliminada');
            setFacturaAEliminar(null);
            cargar();
          } catch (err) {
            toast.error(err.response?.data?.error || 'Error al eliminar factura');
          }
        }}
      />

      {/* Anular factura: no la borra (queda como constancia con estado 'Anulada')
          y deja libre el servicio o la cuota para emitir una nueva. */}
      <Modal
        open={!!facturaAAnular}
        onClose={() => !anulando && setFacturaAAnular(null)}
        title="Anular factura"
        footer={<>
          <button type="button" className="btn-secondary" onClick={() => setFacturaAAnular(null)} disabled={anulando}>Cancelar</button>
          <button type="button" className="btn-danger" onClick={anularFactura} disabled={anulando}>
            {anulando ? 'Anulando…' : 'Anular factura'}
          </button>
        </>}>
        <div className="space-y-3 text-sm">
          <p>
            Se anulará la factura <span className="font-mono font-semibold">{facturaAAnular?.numero_factura}</span>
            {facturaAAnular?.id_cuota
              ? <> de la <strong>cuota N° {facturaAAnular?.cuota?.numero_cuota ?? '?'}</strong></>
              : <> (cobertura <strong>general</strong>)</>}
            {facturaAAnular?.estado_factura === ESTADO_FACTURA_ENVIADA && <>, que ya figura como <strong>Enviada</strong> al cliente</>}.
          </p>
          <p className="text-slate-600">
            La factura se conserva como constancia con estado <span className="badge-gray">Anulada</span> y
            {facturaAAnular?.id_cuota ? ' esa cuota' : ' el servicio'} vuelve a quedar disponible para emitir una nueva factura.
            La anulación no se puede revertir.
          </p>
          <div>
            <label className="label">Motivo de la anulación *</label>
            <textarea
              className="textarea"
              rows={3}
              value={motivoAnulacion}
              onChange={e => setMotivoAnulacion(e.target.value)}
              placeholder="Ej.: error en el RUC del cliente, monto incorrecto, nota de crédito emitida…"
            />
            <p className="text-[11px] text-slate-500 mt-1">Queda registrado en la auditoría junto con el usuario y la fecha.</p>
          </div>
        </div>
      </Modal>
    </>
  );
}

function Info({ label, value, cols = 1 }) {
  return (
    <div className={cols === 2 ? 'col-span-2' : ''}>
      <div className="text-[10px] uppercase tracking-wider text-slate-400">{label}</div>
      <div className="text-slate-800 text-sm">{value || '—'}</div>
    </div>
  );
}
