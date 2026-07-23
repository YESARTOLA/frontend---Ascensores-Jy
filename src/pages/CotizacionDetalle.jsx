import { useEffect, useMemo, useState } from 'react';
import { useParams, Link, useNavigate, useLocation } from 'react-router-dom';
import {
  cotizacionesService,
  configuracionService,
  archivosService,
  cuentasBancariasService,
  assetUrl
} from '../services';
import PageHeader from '../components/common/PageHeader.jsx';
import Loader from '../components/common/Loader.jsx';
import Modal from '../components/common/Modal.jsx';
import ConfirmarEliminacion from '../components/common/ConfirmarEliminacion.jsx';
import { useToast } from '../components/common/Toast.jsx';
import { useAuth } from '../features/auth/AuthContext.jsx';
import { badgeEstado, formatFecha, formatFechaHora, formatMonto, hoyISO, nombreEdificioDeAscensores } from '../utils/formatters.js';
import {
  ESTADO_VERSION_COTIZADO, ESTADO_VERSION_APROBADO, ESTADO_VERSION_RECHAZADO,
  ESTADO_GLOBAL_COTIZADO, ESTADO_GLOBAL_TERMINADO, ESTADO_GLOBAL_ANULADO,
  ESTADOS_GLOBALES_SERVICIO_EN_MARCHA
} from '../utils/estadoCotizacion.js';
import CuotasEditor, { planCuotasDesdeServidor, planParaPayload } from '../components/cotizaciones/CuotasEditor.jsx';

const itemVacio = () => ({
  descripcion: '',
  cantidad: 1,
  unidad: 'Unidad',
  precio_unitario: 0,
  descuento_porcentaje: 0,
  id_archivo: null,
  archivo: null
});

// Etiqueta legible de cada acción auditada que puede aparecer en la línea de
// tiempo de una cotización. Si llega una acción no mapeada se muestra tal cual.
const ACCION_LABEL = {
  CREATE: 'Creó la cotización',
  UPDATE: 'Editó la versión',
  NEW_VERSION: 'Creó una nueva versión',
  APPROVE: 'Aprobó la cotización',
  RE_APPROVE: 'Re-aprobó la cotización',
  REJECT: 'Rechazó la versión',
  REOPEN: 'Reabrió la cotización',
  DELETE: 'Eliminó la cotización'
};

function round2(n) {
  return Math.round((Number(n) + Number.EPSILON) * 100) / 100;
}

// Resuelve la selección de cuentas a precargar en un form a partir de la
// versión: si tiene selección explícita (array) se respeta; si es legacy
// (null/no-array) se marcan todas las cuentas activas, como hace la creación.
function cuentasPreseleccionadas(version, cuentas) {
  return Array.isArray(version?.cuentas_pdf)
    ? version.cuentas_pdf
    : cuentas.map(c => c.id);
}

// Selector de cuentas bancarias (checkboxes) compartido por el form de edición
// y el modal de aprobación. `seleccion` = array de ids; `onToggle(id, marcada)`.
function SelectorCuentas({ cuentas, seleccion, onToggle }) {
  if (!cuentas.length) return null;
  return (
    <div>
      <label className="label">Cuentas bancarias en el PDF</label>
      <p className="text-[11px] text-carbon-500 mb-2">
        Se imprimirán en el PDF solo las cuentas marcadas. Se gestionan en Configuración › Cuentas bancarias.
      </p>
      <div className="space-y-1.5">
        {cuentas.map(c => {
          const marcada = seleccion.includes(c.id);
          return (
            <label key={c.id} className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={marcada}
                onChange={e => onToggle(c.id, e.target.checked)} />
              <span className="text-sm">
                <span className="font-medium text-carbon-800">{c.banco}</span>{' '}
                <span className="text-xs text-carbon-500">({c.moneda})</span>
                <span className="text-xs text-carbon-500"> · {c.tipo_cuenta} · {c.numero_cuenta}</span>
              </span>
            </label>
          );
        })}
      </div>
      {seleccion.length === 0 && (
        <p className="text-[11px] text-amber-600 mt-1">
          Ninguna cuenta seleccionada: el PDF no incluirá la sección de datos para pago.
        </p>
      )}
    </div>
  );
}

function calcImporte(it) {
  const cant = Number(it.cantidad) || 0;
  const pu = Number(it.precio_unitario) || 0;
  const desc = Number(it.descuento_porcentaje) || 0;
  return round2(cant * pu * (1 - desc / 100));
}

export default function CotizacionDetalle() {
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const [cot, setCot] = useState(null);
  const [historial, setHistorial] = useState([]);
  const [loading, setLoading] = useState(true);
  const [igvTasa, setIgvTasa] = useState(0.18);
  const [verActivaNum, setVerActivaNum] = useState(null);
  const [tab, setTab] = useState('items'); // items | versiones | historial | adjuntos | pdf

  // Edición de items mientras la versión está en Cotizado
  const [editandoItems, setEditandoItems] = useState(false);
  const [itemsForm, setItemsForm] = useState([]);
  const [fechaValidezForm, setFechaValidezForm] = useState('');
  const [observForm, setObservForm] = useState('');
  const [cuotasForm, setCuotasForm] = useState(planCuotasDesdeServidor(null));
  const [saving, setSaving] = useState(false);

  // Cuentas bancarias disponibles (para el selector de PDF) + selección editada
  // en el form de edición y en el modal de aprobación.
  const [cuentas, setCuentas] = useState([]);
  const [cuentasForm, setCuentasForm] = useState([]);
  const [cuentasAprob, setCuentasAprob] = useState([]);

  // Modales
  const [openNuevaVersion, setOpenNuevaVersion] = useState(false);
  const [motivoCambio, setMotivoCambio] = useState('');
  const [openRechazo, setOpenRechazo] = useState(false);
  const [motivoRechazo, setMotivoRechazo] = useState('');
  const [openAprobar, setOpenAprobar] = useState(false);
  const [aprobarForm, setAprobarForm] = useState({
    // La fecha/hora de programación y la prioridad ya NO se registran al aprobar:
    // el servicio nace sin programar y el área las define luego desde su detalle.
    observaciones: '', id_archivo_respaldo: null,
    // Campos extra según categoría del tipo_servicio:
    motivo: '', falla: '', nivel_urgencia: '',
    tipo_plan: 'continuo', frecuencia: 'mensual', frecuencia_dias_custom: '',
    cantidad_mantenimientos: '', cantidad_mantenimientos_gratuitos: 0,
    fecha_inicio_plan: hoyISO()
  });
  const [archivoRespaldo, setArchivoRespaldo] = useState(null);
  const [subiendoRespaldo, setSubiendoRespaldo] = useState(false);
  // Foto obligatoria por ítem al aprobar: id del ítem cuya foto se está subiendo.
  const [subiendoFotoItemId, setSubiendoFotoItemId] = useState(null);

  // Reapertura
  const [openReabrir, setOpenReabrir] = useState(false);
  const [motivoReapertura, setMotivoReapertura] = useState('');
  const [reabriendo, setReabriendo] = useState(false);

  // PDF
  const [pdfUrl, setPdfUrl] = useState(null);
  const [generandoPdf, setGenerandoPdf] = useState(false);

  // Adjuntos
  const [subiendoAdjuntos, setSubiendoAdjuntos] = useState(false);

  const toast = useToast();
  const { esSuperAdmin, esAdmin } = useAuth();
  const puedeEditar = esSuperAdmin || esAdmin;
  const [openEliminar, setOpenEliminar] = useState(false);
  const [eliminando, setEliminando] = useState(false);

  const eliminarCotizacion = async () => {
    if (eliminando) return;
    setEliminando(true);
    try {
      await cotizacionesService.remove(id);
      toast.success('Cotización eliminada');
      setOpenEliminar(false);
      navigate('/cotizaciones');
    } catch (e) {
      toast.error(e.response?.data?.error || 'No se pudo eliminar la cotización');
    } finally {
      setEliminando(false);
    }
  };

  const cargar = async () => {
    setLoading(true);
    try {
      const [c, h] = await Promise.all([
        cotizacionesService.get(id),
        cotizacionesService.historial(id).catch(() => [])
      ]);
      setCot(c);
      setHistorial(Array.isArray(h) ? h : []);
      const va = c.versiones?.find(v => v.numero_version === c.version_activa) || c.versiones?.[c.versiones.length - 1];
      setVerActivaNum(va?.numero_version || null);
    } finally { setLoading(false); }
  };
  useEffect(() => { cargar(); }, [id]);

  useEffect(() => {
    configuracionService.get('IGV_RATE')
      .catch(() => ({ valor: 0.18 }))
      .then(igv => setIgvTasa(Number(igv.valor) || 0.18));
  }, []);

  useEffect(() => {
    cuentasBancariasService.list()
      .then(cs => setCuentas(Array.isArray(cs) ? cs : []))
      .catch(() => setCuentas([]));
  }, []);

  const versionActiva = useMemo(() => {
    if (!cot || !verActivaNum) return null;
    return cot.versiones.find(v => v.numero_version === verActivaNum);
  }, [cot, verActivaNum]);

  const totalesEdit = useMemo(() => {
    const sub = round2(itemsForm.reduce((acc, it) => acc + calcImporte(it), 0));
    // Una versión sin IGV no afecta el subtotal (igv = 0). Respetarlo aquí para
    // que el total —y la validación del plan de cuotas— coincida con el backend.
    const igvC = versionActiva?.sin_igv ? 0 : round2(sub * igvTasa);
    return { subtotal: sub, igv: igvC, total: round2(sub + igvC) };
  }, [itemsForm, igvTasa, versionActiva?.sin_igv]);

  if (loading) return <Loader />;
  if (!cot) return <div className="p-6 text-center text-carbon-500">Cotización no encontrada</div>;
  if (!versionActiva) return <div className="p-6 text-center text-carbon-500">Sin versiones</div>;

  // Versión todavía en proceso: editable y susceptible de aprobar/rechazar.
  const versionEditable = versionActiva.estado_version === ESTADO_VERSION_COTIZADO;
  // Cotización todavía decidible: si tiene una versión en Cotizado se puede
  // aprobar/rechazar — aplica tanto al primer ciclo (Cotizado global) como a
  // renegociaciones post-aprobación (Aceptado/Ejecución/Pendiente con nueva
  // versión en Cotizado). Solo bloquea si ya está Terminado.
  const cotizacionDecidible = cot.estado_global !== ESTADO_GLOBAL_TERMINADO && cot.estado_global !== ESTADO_GLOBAL_ANULADO;
  const cotizacionAnulada = cot.estado_global === ESTADO_GLOBAL_ANULADO;
  // Cotización con servicio en marcha (Aceptado/Ejecución/Pendiente): permite
  // reabrir para renegociar las cuotas pendientes.
  const cotizacionReabrible = ESTADOS_GLOBALES_SERVICIO_EN_MARCHA.includes(cot.estado_global);
  // Flujo de renegociación en dos pasos sobre una cotización aprobada:
  //   1) "Reabrir para renegociar" registra un evento REOPEN en auditoría.
  //   2) recién entonces se habilita "Nueva versión" para clonar la aprobada.
  // `reabierta` es verdadero mientras la versión activa siga Aprobada y exista un
  // REOPEN posterior a SU aprobación. Anclar a `fecha_aprobacion` aísla cada
  // ciclo: al crear la nueva versión, la activa pasa a Cotizado y esto vuelve a
  // false; al re-aprobarla, un nuevo ciclo exige reabrir otra vez.
  const reabierta = versionActiva.estado_version === ESTADO_VERSION_APROBADO && (() => {
    const aprob = versionActiva.fecha_aprobacion ? new Date(versionActiva.fecha_aprobacion).getTime() : 0;
    return historial.some(ev => ev.accion === 'REOPEN' && new Date(ev.fecha_evento).getTime() >= aprob);
  })();
  const servicioGen = cot.servicios?.[0];
  // Al aprobar, cada ítem debe llevar foto (el técnico la ve en el servicio).
  const faltanFotosItems = (versionActiva.items || []).some(it => !it.id_archivo);

  const iniciarEdicion = () => {
    setItemsForm(versionActiva.items.map(it => ({
      descripcion: it.descripcion,
      cantidad: Number(it.cantidad),
      unidad: it.unidad,
      precio_unitario: Number(it.precio_unitario),
      descuento_porcentaje: Number(it.descuento_porcentaje),
      id_archivo: it.id_archivo || null,
      archivo: it.archivo || null
    })));
    setFechaValidezForm(String(versionActiva.fecha_validez).slice(0, 10));
    setObservForm(versionActiva.observaciones || '');
    setCuotasForm(planCuotasDesdeServidor(versionActiva));
    setCuentasForm(cuentasPreseleccionadas(versionActiva, cuentas));
    setEditandoItems(true);
    setTab('items');
  };

  const guardarItems = async () => {
    if (saving) return;
    let payloadCuotas;
    try {
      payloadCuotas = planParaPayload(cuotasForm, totalesEdit.total);
    } catch (err) {
      return toast.error(err.message);
    }
    setSaving(true);
    try {
      await cotizacionesService.updateVersion(id, versionActiva.numero_version, {
        items: itemsForm.filter(it => it.descripcion.trim()).map((it, i) => ({
          orden: i + 1,
          descripcion: it.descripcion,
          cantidad: Number(it.cantidad) || 1,
          unidad: it.unidad || 'Unidad',
          precio_unitario: Number(it.precio_unitario) || 0,
          descuento_porcentaje: Number(it.descuento_porcentaje) || 0,
          id_archivo: it.id_archivo || null
        })),
        fecha_validez: fechaValidezForm,
        observaciones: observForm,
        tiene_cuotas: payloadCuotas.tiene_cuotas,
        plan_cuotas: payloadCuotas.plan_cuotas,
        saldo_variable: payloadCuotas.saldo_variable,
        cuentas_pdf: cuentasForm
      });
      toast.success('Versión actualizada');
      setEditandoItems(false);
      cargar();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Error al guardar');
    } finally {
      setSaving(false);
    }
  };

  const crearNuevaVersion = async (e) => {
    e.preventDefault();
    if (!motivoCambio.trim()) return toast.error('Motivo obligatorio');
    try {
      await cotizacionesService.nuevaVersion(id, motivoCambio);
      toast.success('Nueva versión creada en Cotizado');
      setOpenNuevaVersion(false);
      setMotivoCambio('');
      cargar();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Error al crear versión');
    }
  };

  const rechazarVersion = async (e) => {
    e.preventDefault();
    if (!motivoRechazo.trim()) return toast.error('Motivo obligatorio');
    try {
      await cotizacionesService.rechazar(id, versionActiva.numero_version, motivoRechazo);
      toast.success('Versión rechazada');
      setOpenRechazo(false);
      setMotivoRechazo('');
      cargar();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Error al rechazar');
    }
  };

  // Sube la foto de un ítem desde el modal de aprobación y la persiste de
  // inmediato reenviando todos los ítems de la versión (que sigue en Cotizado),
  // para que la validación de aprobación del backend la reconozca. Luego recarga.
  const subirFotoItemAprobacion = async (item, e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || subiendoFotoItemId != null) return;
    setSubiendoFotoItemId(item.id);
    try {
      const fd = new FormData();
      fd.append('archivo', file);
      const arch = await archivosService.upload(fd, 'cotizaciones');
      await cotizacionesService.updateVersion(id, versionActiva.numero_version, {
        items: versionActiva.items.map(it => ({
          orden: it.orden,
          descripcion: it.descripcion,
          cantidad: Number(it.cantidad) || 1,
          unidad: it.unidad || 'Unidad',
          precio_unitario: Number(it.precio_unitario) || 0,
          descuento_porcentaje: Number(it.descuento_porcentaje) || 0,
          id_archivo: it.id === item.id ? arch.id : (it.id_archivo || null)
        }))
      });
      toast.success('Foto agregada al ítem');
      await cargar();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Error al subir la foto del ítem');
    } finally {
      setSubiendoFotoItemId(null);
    }
  };

  const aprobarVersion = async (e) => {
    e.preventDefault();
    if ((versionActiva.items || []).some(it => !it.id_archivo)) {
      return toast.error('Cada ítem debe tener una foto antes de aprobar.');
    }
    try {
      // El módulo destino lo define el SUBTIPO de la cotización (SSoT), no la
      // categoría libre (eliminada). Si el padre es Proyectos, modulo = null.
      const modulo = cot?.subtipo_servicio?.modulo_asociado || null;
      // Sin fecha/hora/prioridad: el servicio nace sin programar y el área los
      // registra después desde el detalle del servicio ("Programar fecha").
      const payload = {
        observaciones: aprobarForm.observaciones || null,
        id_archivo_respaldo: aprobarForm.id_archivo_respaldo,
        // Cuentas bancarias a utilizar (opcional): precargadas desde la selección
        // guardada y ajustables en el modal. Se persisten en la versión al aprobar.
        cuentas_pdf: cuentasAprob
      };
      if (modulo === 'emergencia') {
        payload.motivo = aprobarForm.motivo;
        payload.nivel_urgencia = aprobarForm.nivel_urgencia || 'alta';
      } else if (modulo === 'correctivo') {
        payload.falla = aprobarForm.falla;
        payload.nivel_urgencia = aprobarForm.nivel_urgencia || 'media';
      } else if (modulo === 'mantenimiento') {
        payload.tipo_plan = aprobarForm.tipo_plan;
        payload.frecuencia = aprobarForm.tipo_plan === 'eventual' ? null : aprobarForm.frecuencia;
        if (aprobarForm.frecuencia === 'personalizada' && aprobarForm.frecuencia_dias_custom) {
          payload.frecuencia_dias_custom = Number(aprobarForm.frecuencia_dias_custom);
        }
        if (aprobarForm.cantidad_mantenimientos) {
          payload.cantidad_mantenimientos = Number(aprobarForm.cantidad_mantenimientos);
        }
        payload.cantidad_mantenimientos_gratuitos = Number(aprobarForm.cantidad_mantenimientos_gratuitos) || 0;
        payload.fecha_inicio_plan = aprobarForm.fecha_inicio_plan || null;
      }
      const r = await cotizacionesService.aprobar(id, versionActiva.numero_version, payload);
      toast.success(`Aprobada. Servicio ${r.codigo_servicio} creado.`);
      setOpenAprobar(false);
      cargar();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Error al aprobar');
    }
  };

  const confirmarReabrir = async () => {
    if (reabriendo) return;
    const motivo = motivoReapertura.trim();
    if (!motivo) return toast.error('Indica el motivo de la reapertura');
    setReabriendo(true);
    try {
      const r = await cotizacionesService.reabrir(id, motivo);
      toast.success(`Cotización reabierta · ${r.cuotas_pendientes} cuota(s) pendiente(s), saldo S/ ${Number(r.saldo_pendiente).toFixed(2)}`);
      setOpenReabrir(false);
      setMotivoReapertura('');
      cargar();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Error al reabrir');
    } finally {
      setReabriendo(false);
    }
  };

  const subirRespaldo = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setSubiendoRespaldo(true);
    try {
      const fd = new FormData();
      fd.append('archivo', file);
      const arch = await archivosService.upload(fd, 'cotizaciones');
      setArchivoRespaldo(arch);
      setAprobarForm(f => ({ ...f, id_archivo_respaldo: arch.id }));
      toast.success('Archivo de respaldo subido');
    } catch {
      toast.error('Error al subir archivo');
    } finally {
      setSubiendoRespaldo(false);
    }
  };

  const generarPdf = async () => {
    setGenerandoPdf(true);
    try {
      const r = await cotizacionesService.pdf(id, versionActiva.numero_version);
      setPdfUrl(r.url);
      setTab('pdf');
      toast.success('PDF generado');
      cargar();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Error al generar PDF');
    } finally {
      setGenerandoPdf(false);
    }
  };

  const verPdfExistente = () => {
    if (versionActiva.archivo_pdf?.ruta_almacenamiento) {
      setPdfUrl(assetUrl(versionActiva.archivo_pdf.ruta_almacenamiento));
      setTab('pdf');
    }
  };

  const subirAdjuntos = async (e) => {
    const files = Array.from(e.target.files || []);
    e.target.value = '';
    if (files.length === 0) return;
    setSubiendoAdjuntos(true);
    try {
      let agregados = 0;
      for (const file of files) {
        const fd = new FormData();
        fd.append('archivo', file);
        const arch = await archivosService.upload(fd, 'cotizaciones');
        await cotizacionesService.attachArchivo(id, arch.id);
        agregados++;
      }
      toast.success(`${agregados} archivo(s) adjuntado(s)`);
      cargar();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Error al adjuntar archivo(s)');
    } finally {
      setSubiendoAdjuntos(false);
    }
  };
  const quitarAdjunto = async (idAdjunto) => {
    if (!confirm('¿Eliminar este adjunto?')) return;
    try {
      await cotizacionesService.removeArchivo(id, idAdjunto);
      toast.success('Adjunto eliminado');
      cargar();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Error al eliminar adjunto');
    }
  };

  return (
    <>
      <PageHeader
        title={cot.codigo}
        subtitle={`${cot.cliente?.nombre} • ${cot.subtipo_servicio?.nombre || cot.tipo_servicio?.nombre || ''}`}
        actions={
          <div className="flex flex-wrap gap-2">
            <Link to={location.state?.from || '/cotizaciones'} className="btn-secondary text-xs !py-1.5 !px-3">
              {location.state?.fromLabel ? `← ${location.state.fromLabel}` : '← Cotizaciones'}
            </Link>
            {puedeEditar && (
              <button onClick={() => navigate(`/cotizaciones?duplicar=${cot.id}`)} className="btn-ghost text-xs !py-1.5 !px-3" title="Crea una cotización nueva precargada con estos datos">Duplicar</button>
            )}
            {puedeEditar && cotizacionDecidible && versionEditable && !editandoItems && (
              <button onClick={iniciarEdicion} className="btn-ghost text-xs !py-1.5 !px-3">Editar items</button>
            )}
            {puedeEditar && cotizacionDecidible && versionEditable && (
              <>
                <button onClick={() => { setCuentasAprob(cuentasPreseleccionadas(versionActiva, cuentas)); setOpenAprobar(true); }} className="btn-primary text-xs !py-1.5 !px-3">Aprobar</button>
                <button onClick={() => setOpenRechazo(true)} className="btn-ghost text-xs !py-1.5 !px-3">Rechazar</button>
              </>
            )}
            {/* "Nueva versión" solo cuando hay algo que re-versionar SIN un servicio
                vivo de por medio: una versión Rechazada (renegociación previa a
                aprobar), una cotización aprobada YA reabierta (paso 2 del flujo), o
                una aprobada cuyo servicio se canceló (estado_global vuelve a
                Cotizado). Tras aprobar, queda oculto hasta reabrir. */}
            {puedeEditar && cot.estado_global !== ESTADO_GLOBAL_TERMINADO &&
              (versionActiva.estado_version === ESTADO_VERSION_RECHAZADO
                || (versionActiva.estado_version === ESTADO_VERSION_APROBADO
                    && (reabierta || cot.estado_global === ESTADO_GLOBAL_COTIZADO))) && (
              <button onClick={() => setOpenNuevaVersion(true)} className="btn-primary text-xs !py-1.5 !px-3" title="Crea una versión nueva en Cotizado para renegociar términos">
                + Nueva versión
              </button>
            )}
            {versionActiva.archivo_pdf
              ? <button onClick={verPdfExistente} className="btn-ghost text-xs !py-1.5 !px-3">Ver PDF</button>
              : null}
            <button onClick={generarPdf} disabled={generandoPdf} className="btn-ghost text-xs !py-1.5 !px-3">
              {generandoPdf ? 'Generando…' : (versionActiva.archivo_pdf ? 'Regenerar PDF' : 'Generar PDF')}
            </button>
            {/* "Reabrir" es el paso 1: solo sobre una aprobada con servicio vivo y
                que todavía no fue reabierta. Al reabrir, este botón se reemplaza por
                "Nueva versión" (reabierta = true). */}
            {puedeEditar && cotizacionReabrible && versionActiva.estado_version === ESTADO_VERSION_APROBADO && !reabierta && (
              <button onClick={() => setOpenReabrir(true)} className="btn-secondary text-xs !py-1.5 !px-3" title="Reabrir para renegociar términos con el cliente">
                Reabrir para renegociar
              </button>
            )}
            {esSuperAdmin && !cotizacionAnulada && (
              <button onClick={() => setOpenEliminar(true)} className="btn-danger text-xs !py-1.5 !px-3" title="Anula la cotización (queda como historial) y sus servicios generados">
                Eliminar
              </button>
            )}
          </div>
        }
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Header info */}
        <div className="card p-4 lg:col-span-2 space-y-3">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-bold text-carbon-900">{nombreEdificioDeAscensores(cot)}</h2>
              {cot.descripcion && <p className="text-sm text-carbon-600 mt-1">{cot.descripcion}</p>}
            </div>
            <div className="flex flex-col items-end gap-1">
              <span className={`badge ${badgeEstado(cot.estado_global)}`}>{cot.estado_global}</span>
              <span className={`badge ${badgeEstado(versionActiva.estado_version)}`}>v{versionActiva.numero_version} — {versionActiva.estado_version}</span>
            </div>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm pt-2 border-t border-carbon-100">
            <div>
              <div className="text-xs text-carbon-500">Cliente</div>
              <div className="font-medium">{cot.cliente?.nombre || '—'}</div>
            </div>
            <div>
              <div className="text-xs text-carbon-500">
                {cot.ascensores?.length > 1 ? `Ascensores (${cot.ascensores.length})` : 'Ascensor'}
              </div>
              {cot.ascensores?.length > 0 ? (
                <div className="space-y-0.5">
                  {cot.ascensores.map(a => (
                    <div key={a.id} className="text-sm">
                      {a.ascensor
                        ? <span className="font-medium">{a.ascensor.codigo}</span>
                        : <span className="text-amber-700">Por instalar{a.ascensor_nuevo?.ubicacion ? ` · ${a.ascensor_nuevo.ubicacion}` : ''}</span>}
                    </div>
                  ))}
                </div>
              ) : <div className="text-carbon-400">—</div>}
            </div>
            <div>
              <div className="text-xs text-carbon-500">Validez</div>
              <div className="font-medium">{formatFecha(versionActiva.fecha_validez)}</div>
            </div>
            <div>
              <div className="text-xs text-carbon-500">Total</div>
              <div className="font-bold text-brand-700">{formatMonto(versionActiva.monto_total, versionActiva.moneda)}</div>
            </div>
          </div>
          {servicioGen && (
            <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-3 text-sm flex items-center justify-between">
              <div>
                <div className="text-xs text-emerald-700 uppercase tracking-wide">Servicio generado</div>
                <Link to={`/servicios/${servicioGen.id}`} className="font-mono text-emerald-800 hover:underline">{servicioGen.codigo}</Link>
                <span className="ml-2 text-emerald-700">{servicioGen.estado_servicio}</span>
              </div>
              <Link to={`/servicios/${servicioGen.id}`} className="btn-ghost text-xs !py-1.5 !px-3">Abrir servicio</Link>
            </div>
          )}
        </div>

        {/* Lista de versiones */}
        <div className="card p-4">
          <div className="text-sm font-bold text-carbon-700 mb-2">Versiones</div>
          <div className="space-y-1.5">
            {cot.versiones.map(v => (
              <button key={v.id} onClick={() => setVerActivaNum(v.numero_version)}
                className={`w-full text-left px-3 py-2 rounded-md border text-sm transition ${v.numero_version === verActivaNum
                  ? 'border-brand-300 bg-brand-50' : 'border-carbon-100 hover:bg-ivory-50'}`}>
                <div className="flex items-center justify-between">
                  <span className="font-medium">v{v.numero_version}</span>
                  <span className={`badge text-xs ${badgeEstado(v.estado_version)}`}>{v.estado_version}</span>
                </div>
                <div className="flex justify-between text-xs text-carbon-500 mt-0.5">
                  <span>Validez {formatFecha(v.fecha_validez)}</span>
                  <span>{formatMonto(v.monto_total, v.moneda)}</span>
                </div>
                {v.motivo_cambio && <div className="text-xs text-carbon-400 italic mt-1 line-clamp-2">"{v.motivo_cambio}"</div>}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="mt-4 card">
        <div className="border-b border-carbon-100 flex overflow-x-auto">
          {[
            ['items', 'Items'],
            ['versiones', 'Historial de versiones'],
            ['historial', `Historial${historial.length ? ` (${historial.length})` : ''}`],
            ['adjuntos', `Adjuntos${cot.archivos?.length ? ` (${cot.archivos.length})` : ''}`],
            ['pdf', 'PDF']
          ].map(([k, l]) => (
            <button key={k} onClick={() => setTab(k)}
              className={`px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition ${tab === k
                ? 'border-brand-600 text-brand-700' : 'border-transparent text-carbon-500 hover:text-carbon-800'}`}>
              {l}
            </button>
          ))}
        </div>

        {tab === 'items' && (
          <div className="p-4">
            {editandoItems ? (
              <ItemsEditor
                items={itemsForm}
                setItems={setItemsForm}
                fechaValidez={fechaValidezForm}
                setFechaValidez={setFechaValidezForm}
                observ={observForm}
                setObserv={setObservForm}
                cuotas={cuotasForm}
                setCuotas={setCuotasForm}
                cuentas={cuentas}
                cuentasSel={cuentasForm}
                setCuentasSel={setCuentasForm}
                igvTasa={igvTasa}
                totales={totalesEdit}
                moneda={versionActiva.moneda}
                onCancel={() => setEditandoItems(false)}
                onSave={guardarItems}
                saving={saving}
              />
            ) : (
              <ItemsView version={versionActiva} igvTasa={igvTasa} />
            )}
          </div>
        )}

        {tab === 'versiones' && (
          <div className="p-4">
            <ul className="space-y-3">
              {cot.versiones.map(v => (
                <li key={v.id} className="border border-carbon-100 rounded-lg p-3">
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-bold">v{v.numero_version}</span>
                    <span className={`badge ${badgeEstado(v.estado_version)}`}>{v.estado_version}</span>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs text-carbon-600">
                    <div>Validez: {formatFecha(v.fecha_validez)}</div>
                    <div>Enviada: {v.fecha_envio ? formatFecha(v.fecha_envio) : '—'}</div>
                    <div>Aprobada: {v.fecha_aprobacion ? formatFechaHora(v.fecha_aprobacion) : '—'}</div>
                    <div>Total: {formatMonto(v.monto_total, v.moneda)}</div>
                  </div>
                  <div className="mt-2 pt-2 border-t border-carbon-50 grid grid-cols-1 sm:grid-cols-3 gap-1 text-xs">
                    <div className="text-carbon-500">
                      Creada por <span className="font-medium text-carbon-700">{v.creado_por?.nombres || '—'}</span>
                      {v.date_time_registration && <span className="text-carbon-400"> · {formatFechaHora(v.date_time_registration)}</span>}
                    </div>
                    {v.fecha_aprobacion && (
                      <div className="text-emerald-700">
                        Aprobada por <span className="font-medium">{v.aprobada_por_usuario?.nombres || '—'}</span>
                        <span className="text-emerald-600"> · {formatFechaHora(v.fecha_aprobacion)}</span>
                      </div>
                    )}
                    {v.fecha_rechazo && (
                      <div className="text-red-600">
                        Rechazada por <span className="font-medium">{v.rechazada_por_usuario?.nombres || '—'}</span>
                        <span className="text-red-500"> · {formatFechaHora(v.fecha_rechazo)}</span>
                      </div>
                    )}
                  </div>
                  {v.motivo_cambio && <div className="mt-2 text-xs text-carbon-500 italic">Motivo de cambio: "{v.motivo_cambio}"</div>}
                  {v.motivo_rechazo && <div className="mt-1 text-xs text-red-600">Motivo de rechazo: "{v.motivo_rechazo}"</div>}
                </li>
              ))}
            </ul>
          </div>
        )}

        {tab === 'historial' && (
          <div className="p-4">
            {historial.length === 0 ? (
              <div className="text-center py-8 text-carbon-400 italic">Aún no hay eventos registrados</div>
            ) : (
              <ul className="space-y-2">
                {historial.map(ev => (
                  <li key={ev.id} className="flex items-start justify-between gap-3 border border-carbon-100 rounded-lg p-3">
                    <div className="min-w-0">
                      <div className="text-sm text-carbon-800">
                        <span className="font-medium">{ACCION_LABEL[ev.accion] || ev.accion}</span>
                        {ev.numero_version != null && <span className="text-carbon-500"> · v{ev.numero_version}</span>}
                      </div>
                      <div className="mt-0.5 text-xs text-carbon-500 flex flex-wrap items-center gap-x-2 gap-y-0.5">
                        {ev.usuario ? (
                          <>
                            <span className="text-carbon-700 font-medium">{ev.usuario.nombres}</span>
                            {ev.usuario.rol?.nombre && <span className="badge-gray text-[10px]">{ev.usuario.rol.nombre}</span>}
                          </>
                        ) : (
                          <span>Usuario desconocido</span>
                        )}
                      </div>
                      {ev.motivo && <div className="mt-1 text-xs text-carbon-500 italic line-clamp-2">"{ev.motivo}"</div>}
                    </div>
                    <div className="text-xs text-carbon-400 whitespace-nowrap">{formatFechaHora(ev.fecha_evento)}</div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        {tab === 'adjuntos' && (
          <div className="p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div className="text-sm text-carbon-600">
                {cot.archivos?.length || 0} archivo(s) adjunto(s) a la cotización
              </div>
              {puedeEditar && (
                <label className={`btn-primary text-sm cursor-pointer ${subiendoAdjuntos ? 'opacity-50 pointer-events-none' : ''}`}>
                  {subiendoAdjuntos ? 'Subiendo…' : '+ Agregar archivos'}
                  <input type="file" multiple className="hidden" onChange={subirAdjuntos} disabled={subiendoAdjuntos} />
                </label>
              )}
            </div>
            {(!cot.archivos || cot.archivos.length === 0) ? (
              <div className="text-center py-8 text-carbon-400 italic">Sin adjuntos</div>
            ) : (
              <ul className="space-y-1">
                {cot.archivos.map(adj => (
                  <li key={adj.id} className="flex items-center justify-between bg-ivory-50 border border-carbon-100 rounded px-3 py-2">
                    <a href={assetUrl(adj.archivo.ruta_almacenamiento)} target="_blank" rel="noreferrer"
                       className="text-brand-700 hover:underline truncate" title={adj.archivo.nombre_original}>
                      {adj.archivo.nombre_original}
                    </a>
                    {puedeEditar && (
                      <button type="button" onClick={() => quitarAdjunto(adj.id)}
                        className="text-carbon-400 hover:text-red-600 text-lg leading-none ml-3">×</button>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        {tab === 'pdf' && (
          <div className="p-4">
            {pdfUrl ? (
              <iframe src={pdfUrl} className="w-full" style={{ height: '70vh' }} title="PDF cotización" />
            ) : versionActiva.archivo_pdf ? (
              <iframe src={assetUrl(versionActiva.archivo_pdf.ruta_almacenamiento)} className="w-full" style={{ height: '70vh' }} title="PDF cotización" />
            ) : (
              <div className="text-center py-12 text-carbon-500">
                <p>Aún no hay PDF generado para esta versión.</p>
                <button onClick={generarPdf} disabled={generandoPdf} className="btn-primary mt-3">
                  {generandoPdf ? 'Generando…' : 'Generar PDF'}
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Modal nueva versión */}
      <Modal
        open={openNuevaVersion}
        onClose={() => setOpenNuevaVersion(false)}
        title="Crear nueva versión"
        size="sm"
        footer={<>
          <button onClick={() => setOpenNuevaVersion(false)} className="btn-ghost">Cancelar</button>
          <button type="submit" form="form-nueva-version" className="btn-primary">Crear</button>
        </>}
      >
        <form id="form-nueva-version" onSubmit={crearNuevaVersion}>
          <p className="text-sm text-carbon-600 mb-3">
            Se clonarán los items de la versión actual. Podrás editarlos en la nueva versión.
          </p>
          <label className="label">Motivo del cambio *</label>
          <textarea className="textarea" rows="3" value={motivoCambio}
            onChange={e => setMotivoCambio(e.target.value)} placeholder="Ej: cliente pidió ajustar precio del equipo principal" />
        </form>
      </Modal>

      {/* Modal reabrir cotización */}
      <Modal
        open={openReabrir}
        onClose={() => !reabriendo && setOpenReabrir(false)}
        title="Reabrir cotización para renegociar"
        size="sm"
        footer={<>
          <button onClick={() => setOpenReabrir(false)} className="btn-ghost" disabled={reabriendo}>Cancelar</button>
          <button onClick={confirmarReabrir} className="btn-primary" disabled={reabriendo}>
            {reabriendo ? 'Reabriendo…' : 'Reabrir'}
          </button>
        </>}
      >
        <div className="space-y-3">
          <div className="rounded-md bg-amber-50 ring-1 ring-amber-200 text-amber-800 p-3 text-xs space-y-1">
            <p className="font-semibold">¿Qué ocurre al reabrir?</p>
            <ul className="list-disc list-inside space-y-0.5">
              <li>Se habilita crear una nueva versión sobre la cotización vigente; la versión aprobada queda como histórico.</li>
              <li>Podrás crear una <strong>nueva versión</strong> (clonando la aprobada) y editar precios, items y plan de cuotas.</li>
              <li>Las cuotas <strong>ya pagadas o facturadas</strong> quedan blindadas (no se pueden modificar).</li>
              <li>Al aprobar la nueva versión, se actualiza el servicio y el cobro existentes (no se crean nuevos).</li>
              <li>El motivo queda registrado en auditoría con tu usuario, rol, fecha y hora.</li>
            </ul>
          </div>
          <div>
            <label className="label">Motivo de la reapertura *</label>
            <textarea className="textarea" rows="3" value={motivoReapertura}
              onChange={e => setMotivoReapertura(e.target.value)}
              placeholder="Ej: cliente solicita renegociar plan de pagos por cambio de cronograma de obra"
              disabled={reabriendo} />
          </div>
        </div>
      </Modal>

      {/* Modal rechazo */}
      <Modal
        open={openRechazo}
        onClose={() => setOpenRechazo(false)}
        title="Rechazar cotización"
        size="sm"
        footer={<>
          <button onClick={() => setOpenRechazo(false)} className="btn-ghost">Cancelar</button>
          <button type="submit" form="form-rechazo" className="btn-primary">Confirmar rechazo</button>
        </>}
      >
        <form id="form-rechazo" onSubmit={rechazarVersion}>
          <label className="label">Motivo del rechazo *</label>
          <textarea className="textarea" rows="3" value={motivoRechazo}
            onChange={e => setMotivoRechazo(e.target.value)} />
        </form>
      </Modal>

      {/* Modal aprobar */}
      <Modal
        open={openAprobar}
        onClose={() => setOpenAprobar(false)}
        title="Aprobar cotización y generar servicio"
        size="md"
        footer={<>
          <button onClick={() => setOpenAprobar(false)} className="btn-ghost">Cancelar</button>
          <button type="submit" form="form-aprobar" className="btn-primary" disabled={faltanFotosItems || subiendoFotoItemId != null}
            title={faltanFotosItems ? 'Sube la foto de cada ítem antes de aprobar' : undefined}>
            Confirmar aprobación
          </button>
        </>}
      >
        <form id="form-aprobar" onSubmit={aprobarVersion} className="space-y-3">
          {cot.id_servicio_cobro && (
            <div className="rounded-md bg-amber-50 ring-1 ring-amber-200 p-3 text-xs text-amber-800">
              <span className="font-semibold">Cobro sobre servicio existente.</span> Al aprobar
              <span className="font-semibold"> no se creará un servicio nuevo</span>: se generará el cobro
              sobre el servicio ya existente (emergencia atendida) y quedará facturable.
            </div>
          )}
          {(() => {
            if (cot.id_servicio_cobro) {
              return (
                <div className="text-sm text-carbon-700">
                  Al aprobar se generará:
                  <ul className="list-disc list-inside text-xs text-carbon-600 mt-1">
                    <li>
                      El cobro en gestión de cobros
                      {versionActiva.tiene_cuotas && Array.isArray(versionActiva.plan_cuotas) && versionActiva.plan_cuotas.length > 0
                        ? ` con ${versionActiva.plan_cuotas.length} cuota(s) según el plan definido`
                        : ' con una sola cuota por el total'}
                      {versionActiva.saldo_variable && ' · saldo variable habilitado'}
                    </li>
                    <li>El servicio existente quedará facturable (requiere factura).</li>
                  </ul>
                </div>
              );
            }
            const modulo = cot?.subtipo_servicio?.modulo_asociado || null;
            const nAsc = cot.ascensores?.length || 1;
            const moduloDestino = modulo === 'emergencia' ? 'Emergencias'
              : modulo === 'correctivo' ? 'Correctivos'
              : modulo === 'mantenimiento' ? 'Mantenimientos'
              : modulo === 'atencion_rapida' ? 'Atención rápida'
              : null;
            return (
              <div className="text-sm text-carbon-700">
                Al aprobar se creará automáticamente:
                <ul className="list-disc list-inside text-xs text-carbon-600 mt-1">
                  <li>El servicio en estado Pendiente con precio {formatMonto(versionActiva.monto_total, versionActiva.moneda)} <span className="text-carbon-500">(sin fecha de programación: se registra luego desde el detalle del servicio)</span></li>
                  <li>
                    El cobro en gestión de cobros
                    {versionActiva.tiene_cuotas && Array.isArray(versionActiva.plan_cuotas) && versionActiva.plan_cuotas.length > 0
                      ? ` con ${versionActiva.plan_cuotas.length} cuota(s) según el plan definido`
                      : ' con una sola cuota por el total'}
                    {versionActiva.saldo_variable && ' · saldo variable habilitado'}
                  </li>
                  {moduloDestino && (
                    <li>
                      {nAsc > 1 ? `${nAsc} registros` : '1 registro'} en el módulo <strong>{moduloDestino}</strong>
                      {nAsc > 1 ? ' (uno por cada ascensor)' : ''}
                    </li>
                  )}
                  {cot.ascensores?.some(a => !a.ascensor) && <li>Los ascensores marcados como "nuevos" se crearán en el sistema (estado "Por instalar")</li>}
                  {cot.id_lead && <li>El lead asociado pasará a estado "Ingresado"</li>}
                </ul>
              </div>
            );
          })()}
          {/* Fotos obligatorias por ítem: al aprobar, cada ítem debe llevar su
              foto porque el técnico asignado la verá en el servicio generado.
              La foto es opcional al crear la cotización pero se exige aquí. */}
          {(() => {
            const items = versionActiva.items || [];
            if (items.length === 0) return null;
            const completas = !faltanFotosItems;
            return (
              <div className={`rounded-md p-3 space-y-2 ring-1 ${completas ? 'bg-emerald-50 ring-emerald-200' : 'bg-rose-50 ring-rose-200'}`}>
                <div className={`text-xs font-semibold ${completas ? 'text-emerald-800' : 'text-rose-800'}`}>
                  Fotos de los ítems {completas ? '✓ completas' : '(obligatorias para aprobar)'}
                </div>
                <p className="text-[11px] text-carbon-600">
                  Cada ítem debe tener una foto: el técnico asignado la verá por cada ítem en el servicio.
                  {' '}{completas ? 'Todos los ítems tienen foto.' : `Faltan ${items.filter(it => !it.id_archivo).length} de ${items.length}.`}
                </p>
                <ul className="space-y-1.5">
                  {items.map(it => (
                    <li key={it.id} className="flex items-center gap-2 text-xs">
                      {it.archivo
                        ? <a href={assetUrl(it.archivo.ruta_almacenamiento)} target="_blank" rel="noreferrer" title="Ver foto">
                            <img src={assetUrl(it.archivo.ruta_almacenamiento)} alt="foto" className="h-9 w-9 object-cover rounded ring-1 ring-slate-200" />
                          </a>
                        : <span className="h-9 w-9 rounded ring-1 ring-rose-200 bg-white grid place-items-center text-rose-400">—</span>}
                      <span className="flex-1 truncate text-carbon-700">{it.descripcion || '(sin descripción)'}</span>
                      <label className={`cursor-pointer text-[11px] px-2 py-1 rounded ring-1 whitespace-nowrap ${it.id_archivo ? 'text-carbon-500 ring-slate-200 hover:bg-slate-50' : 'text-rose-600 ring-rose-300 hover:bg-rose-100'} ${subiendoFotoItemId != null ? 'opacity-50 pointer-events-none' : ''}`}>
                        {subiendoFotoItemId === it.id ? 'Subiendo…' : (it.id_archivo ? 'Cambiar' : '+ Foto')}
                        <input type="file" accept="image/*" className="hidden" disabled={subiendoFotoItemId != null}
                          onChange={e => subirFotoItemAprobacion(it, e)} />
                      </label>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })()}

          {/* La fecha de programación se registra después, cuando el servicio
              llega al área correspondiente (detalle del servicio → "Programar
              fecha"). Por eso ya no se piden fecha/hora/prioridad al aprobar. */}

          {(() => {
            // En cobro sobre servicio existente NO se replica en ningún módulo:
            // no se piden datos de emergencia/correctivo/plan.
            if (cot.id_servicio_cobro) return null;
            const modulo = cot?.subtipo_servicio?.modulo_asociado || null;
            if (modulo === 'emergencia') {
              return (
                <div className="rounded-md bg-rose-50 ring-1 ring-rose-200 p-3 space-y-2">
                  <div className="text-xs font-semibold text-rose-800">Datos para el módulo Emergencias</div>
                  <div>
                    <label className="label">Motivo *</label>
                    <textarea className="textarea" rows="2" required
                      value={aprobarForm.motivo}
                      placeholder={cot.descripcion || 'Describe el motivo de la emergencia'}
                      onChange={e => setAprobarForm(f => ({ ...f, motivo: e.target.value }))} />
                  </div>
                  <div>
                    <label className="label">Nivel de urgencia</label>
                    <select className="select" value={aprobarForm.nivel_urgencia || 'alta'}
                      onChange={e => setAprobarForm(f => ({ ...f, nivel_urgencia: e.target.value }))}>
                      <option value="alta">Alta</option>
                      <option value="media">Media</option>
                      <option value="baja">Baja</option>
                    </select>
                  </div>
                </div>
              );
            }
            if (modulo === 'correctivo') {
              return (
                <div className="rounded-md bg-amber-50 ring-1 ring-amber-200 p-3 space-y-2">
                  <div className="text-xs font-semibold text-amber-800">Datos para el módulo Correctivos</div>
                  <div>
                    <label className="label">Motivo *</label>
                    <textarea className="textarea" rows="2" required
                      value={aprobarForm.falla}
                      placeholder={cot.descripcion || 'Describe el motivo a corregir'}
                      onChange={e => setAprobarForm(f => ({ ...f, falla: e.target.value }))} />
                  </div>
                  <div>
                    <label className="label">Nivel de urgencia</label>
                    <select className="select" value={aprobarForm.nivel_urgencia || 'media'}
                      onChange={e => setAprobarForm(f => ({ ...f, nivel_urgencia: e.target.value }))}>
                      <option value="alta">Alta</option>
                      <option value="media">Media</option>
                      <option value="baja">Baja</option>
                    </select>
                  </div>
                </div>
              );
            }
            if (modulo === 'mantenimiento') {
              return (
                <div className="rounded-md bg-emerald-50 ring-1 ring-emerald-200 p-3 space-y-2">
                  <div className="text-xs font-semibold text-emerald-800">Datos del plan de mantenimiento</div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="label">Tipo de plan</label>
                      <select className="select" value={aprobarForm.tipo_plan}
                        onChange={e => setAprobarForm(f => ({ ...f, tipo_plan: e.target.value }))}>
                        <option value="continuo">Continuo</option>
                        <option value="eventual">Eventual</option>
                      </select>
                    </div>
                    {aprobarForm.tipo_plan !== 'eventual' && (
                      <div>
                        <label className="label">Frecuencia</label>
                        <select className="select" value={aprobarForm.frecuencia}
                          onChange={e => setAprobarForm(f => ({ ...f, frecuencia: e.target.value }))}>
                          <option value="mensual">Mensual</option>
                          <option value="bimestral">Bimestral</option>
                          <option value="trimestral">Trimestral</option>
                          <option value="semestral">Semestral</option>
                          <option value="anual">Anual</option>
                          <option value="personalizada">Personalizada (días)</option>
                        </select>
                      </div>
                    )}
                  </div>
                  {aprobarForm.tipo_plan !== 'eventual' && aprobarForm.frecuencia === 'personalizada' && (
                    <div>
                      <label className="label">Frecuencia en días *</label>
                      <input type="number" min="1" className="input"
                        value={aprobarForm.frecuencia_dias_custom}
                        onChange={e => setAprobarForm(f => ({ ...f, frecuencia_dias_custom: e.target.value }))} />
                    </div>
                  )}
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="label">Cantidad de mantenimientos</label>
                      <input type="number" min="1" className="input"
                        value={aprobarForm.cantidad_mantenimientos}
                        placeholder="opcional (sin tope)"
                        onChange={e => setAprobarForm(f => ({ ...f, cantidad_mantenimientos: e.target.value }))} />
                    </div>
                    <div>
                      <label className="label">Cupo gratuitos inicial</label>
                      <input type="number" min="0" className="input"
                        value={aprobarForm.cantidad_mantenimientos_gratuitos}
                        onChange={e => setAprobarForm(f => ({ ...f, cantidad_mantenimientos_gratuitos: e.target.value }))} />
                    </div>
                  </div>
                  <div>
                    <label className="label">Fecha de inicio del plan</label>
                    <input type="date" className="input"
                      value={aprobarForm.fecha_inicio_plan}
                      onChange={e => setAprobarForm(f => ({ ...f, fecha_inicio_plan: e.target.value }))} />
                    <p className="text-[11px] text-carbon-500 mt-0.5">Define desde cuándo se calcula el cronograma. Si lo dejas vacío usa la fecha de aprobación (hoy).</p>
                  </div>
                  {(cot.ascensores?.length || 0) > 1 && (
                    <p className="text-[11px] text-emerald-700">Se crearán {cot.ascensores.length} planes independientes (uno por ascensor) con los mismos parámetros.</p>
                  )}
                </div>
              );
            }
            return null;
          })()}

          <div>
            <label className="label">Observaciones para el servicio</label>
            <textarea className="textarea" rows="2" value={aprobarForm.observaciones}
              onChange={e => setAprobarForm(f => ({ ...f, observaciones: e.target.value }))} />
          </div>
          <div>
            <label className="label">Archivo de respaldo (opcional)</label>
            <input type="file" className="input" onChange={subirRespaldo} disabled={subiendoRespaldo} />
            {archivoRespaldo && <div className="text-xs text-emerald-600 mt-1">✓ {archivoRespaldo.nombre_original}</div>}
          </div>

          {/* Cuentas bancarias a utilizar: opcional, precargadas desde la
              selección guardada de la versión y ajustables antes de aprobar. */}
          <SelectorCuentas
            cuentas={cuentas}
            seleccion={cuentasAprob}
            onToggle={(idc, marcada) => setCuentasAprob(sel =>
              marcada ? [...sel, idc] : sel.filter(x => x !== idc))}
          />
        </form>
      </Modal>

      <ConfirmarEliminacion
        open={openEliminar}
        onClose={() => !eliminando && setOpenEliminar(false)}
        titulo="Eliminar cotización"
        palabraClave={cot.codigo || 'ELIMINAR'}
        textoBoton={eliminando ? 'Eliminando…' : 'Eliminar definitivamente'}
        descripcion={
          <>
            La cotización pasará a estado <strong>Anulado</strong> y se conservará visible en el listado como historial (con sus versiones, ítems y adjuntos intactos).
            {cot.estado_global !== ESTADO_GLOBAL_COTIZADO && (
              <> <strong>El servicio generado por esta cotización se anulará</strong> (queda Cancelado y se dan de baja sus cobros, asignaciones y demás datos asociados).</>
            )}
            {' '}Acción auditada.
          </>
        }
        onConfirmar={eliminarCotizacion}
      />
    </>
  );
}

function ItemsView({ version, igvTasa }) {
  return (
    <>
      <div className="overflow-x-auto">
        <table className="table-base">
          <thead>
            <tr>
              <th className="table-th w-10">#</th>
              <th className="table-th w-16">Foto</th>
              <th className="table-th">Descripción</th>
              <th className="table-th text-right w-24">Cant.</th>
              <th className="table-th w-24">Unidad</th>
              <th className="table-th text-right w-28">P. Unit.</th>
              <th className="table-th text-right w-20">% dscto</th>
              <th className="table-th text-right w-28">Importe</th>
            </tr>
          </thead>
          <tbody>
            {version.items.map((it, i) => (
              <tr key={it.id} className="table-row-hover">
                <td className="table-td">{i + 1}</td>
                <td className="table-td">
                  {it.archivo
                    ? <a href={assetUrl(it.archivo.ruta_almacenamiento)} target="_blank" rel="noreferrer" title="Ver foto">
                        <img src={assetUrl(it.archivo.ruta_almacenamiento)} alt="foto" className="h-10 w-10 object-cover rounded ring-1 ring-slate-200 hover:ring-brand-300" />
                      </a>
                    : <span className="text-slate-400 text-xs">—</span>}
                </td>
                <td className="table-td">{it.descripcion}</td>
                <td className="table-td text-right">{Number(it.cantidad).toFixed(2)}</td>
                <td className="table-td">{it.unidad}</td>
                <td className="table-td text-right">{formatMonto(it.precio_unitario, version.moneda)}</td>
                <td className="table-td text-right">{Number(it.descuento_porcentaje).toFixed(2)}%</td>
                <td className="table-td text-right font-medium">{formatMonto(it.importe, version.moneda)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-1 max-w-xs ml-auto text-sm">
        <div className="text-right text-carbon-600">Subtotal</div>
        <div className="text-right font-medium">{formatMonto(version.subtotal, version.moneda)}</div>
        {version.sin_igv ? (
          <div className="col-span-2 text-right text-xs text-carbon-500">Precios sin IGV</div>
        ) : (
          <>
            <div className="text-right text-carbon-600">IGV ({Math.round((Number(version.igv_tasa) || igvTasa) * 100)}%)</div>
            <div className="text-right font-medium">{formatMonto(version.igv, version.moneda)}</div>
          </>
        )}
        <div className="text-right text-brand-700 font-bold">TOTAL</div>
        <div className="text-right text-brand-700 font-bold">{formatMonto(version.monto_total, version.moneda)}</div>
      </div>

      {version.tiene_cuotas && Array.isArray(version.plan_cuotas) && version.plan_cuotas.length > 0 && (
        <div className="mt-5 border-t border-carbon-100 pt-3">
          <div className="flex items-center justify-between mb-2">
            <div className="text-xs text-carbon-500 uppercase font-semibold">Plan de pagos (referencial)</div>
            {version.saldo_variable && (
              <span className="badge-amber text-[10px]" title="El saldo no comprometido podrá ajustarse desde Cobros tras la aprobación">
                Saldo variable
              </span>
            )}
          </div>
          <table className="table-base">
            <thead>
              <tr>
                <th className="table-th w-24">Cuota</th>
                <th className="table-th w-40">Vencimiento</th>
                <th className="table-th">Observación</th>
                <th className="table-th text-right w-32">Monto</th>
              </tr>
            </thead>
            <tbody>
              {version.plan_cuotas.map(c => (
                <tr key={c.numero_cuota} className="table-row-hover">
                  <td className="table-td font-medium">Cuota {c.numero_cuota}</td>
                  <td className="table-td">{formatFecha(c.fecha_vencimiento)}</td>
                  <td className="table-td text-carbon-700">{c.observacion || <span className="text-carbon-300">—</span>}</td>
                  <td className="table-td text-right font-medium">{formatMonto(c.monto, version.moneda)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {version.observaciones && (
        <div className="mt-4 p-3 bg-ivory-50 rounded text-sm">
          <div className="text-xs text-carbon-500 uppercase mb-1">Observaciones</div>
          <div>{version.observaciones}</div>
        </div>
      )}
    </>
  );
}

function ItemsEditor({ items, setItems, fechaValidez, setFechaValidez, observ, setObserv, cuotas, setCuotas, cuentas, cuentasSel, setCuentasSel, igvTasa, totales, moneda, onCancel, onSave, saving }) {
  const toast = useToast();
  const cambiar = (idx, key, val) => setItems(arr => arr.map((it, i) => i === idx ? { ...it, [key]: val } : it));
  const agregar = () => setItems(arr => [...arr, itemVacio()]);
  const quitar = (idx) => setItems(arr => arr.filter((_, i) => i !== idx));
  const subirFoto = async (idx, e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      const fd = new FormData();
      fd.append('archivo', file);
      const arch = await archivosService.upload(fd, 'cotizaciones');
      setItems(arr => arr.map((it, i) => i === idx ? { ...it, id_archivo: arch.id, archivo: arch } : it));
    } catch {
      toast.error('Error al subir la foto del ítem');
    }
  };
  const quitarFoto = (idx) => setItems(arr => arr.map((it, i) => i === idx ? { ...it, id_archivo: null, archivo: null } : it));

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="label">Fecha de validez</label>
          <input type="date" className="input" value={fechaValidez} onChange={e => setFechaValidez(e.target.value)} />
        </div>
      </div>
      <div className="flex items-center justify-between">
        <label className="label !mb-0">Items</label>
        <button type="button" onClick={agregar} className="btn-ghost text-xs !py-1.5 !px-3">+ Agregar item</button>
      </div>
      <div className="hidden sm:grid grid-cols-12 gap-2 px-1 pb-1.5 mb-1 border-b border-carbon-100 text-[10px] font-semibold uppercase tracking-wider text-carbon-500">
        <div className="col-span-4">Descripción</div>
        <div className="col-span-1 text-right">Cant.</div>
        <div className="col-span-1">Unidad</div>
        <div className="col-span-2 text-right">P. unitario</div>
        <div className="col-span-1 text-right">% dscto</div>
        <div className="col-span-1 text-right">Importe</div>
        <div className="col-span-1 text-center">Foto</div>
        <div className="col-span-1"></div>
      </div>
      <div className="space-y-2">
        {items.map((it, idx) => (
          <div key={idx} className="grid grid-cols-12 gap-2 items-start">
            <textarea className="textarea col-span-12 sm:col-span-4" rows="1" placeholder="Descripción"
              value={it.descripcion} onChange={e => cambiar(idx, 'descripcion', e.target.value)} />
            <input type="number" step="0.01" className="input col-span-3 sm:col-span-1" placeholder="Cant."
              value={it.cantidad} onChange={e => cambiar(idx, 'cantidad', e.target.value)} />
            <input className="input col-span-3 sm:col-span-1" placeholder="Unidad"
              value={it.unidad} onChange={e => cambiar(idx, 'unidad', e.target.value)} />
            <input type="number" step="0.01" className="input col-span-3 sm:col-span-2" placeholder="P. unitario"
              value={it.precio_unitario} onChange={e => cambiar(idx, 'precio_unitario', e.target.value)} />
            <input type="number" step="0.01" className="input col-span-2 sm:col-span-1" placeholder="% dscto"
              value={it.descuento_porcentaje} onChange={e => cambiar(idx, 'descuento_porcentaje', e.target.value)} />
            <div className="col-span-9 sm:col-span-1 text-right text-sm font-medium pt-2">
              {formatMonto(calcImporte(it), moneda)}
            </div>
            <div className="col-span-2 sm:col-span-1 flex items-center justify-center pt-1">
              {it.archivo ? (
                <img src={assetUrl(it.archivo.ruta_almacenamiento)} alt="foto ítem"
                  onClick={() => quitarFoto(idx)} title="Clic para quitar la foto"
                  className="h-9 w-9 object-cover rounded ring-1 ring-slate-200 cursor-pointer" />
              ) : (
                <label className="text-[11px] cursor-pointer hover:underline text-brand-700" title="Subir foto del ítem">
                  + Foto
                  <input type="file" accept="image/*" className="hidden" onChange={e => subirFoto(idx, e)} />
                </label>
              )}
            </div>
            <button type="button" onClick={() => quitar(idx)}
              className="col-span-1 text-carbon-400 hover:text-red-600 text-lg leading-none">×</button>
          </div>
        ))}
      </div>
      <div className="border-t border-carbon-100 pt-3 grid grid-cols-2 gap-1 max-w-xs ml-auto text-sm">
        <div className="text-right text-carbon-600">Subtotal</div>
        <div className="text-right font-medium">{formatMonto(totales.subtotal, moneda)}</div>
        <div className="text-right text-carbon-600">IGV ({Math.round(igvTasa * 100)}%)</div>
        <div className="text-right font-medium">{formatMonto(totales.igv, moneda)}</div>
        <div className="text-right text-brand-700 font-bold">TOTAL</div>
        <div className="text-right text-brand-700 font-bold">{formatMonto(totales.total, moneda)}</div>
      </div>

      <CuotasEditor
        value={cuotas}
        onChange={setCuotas}
        total={totales.total}
        moneda={moneda}
      />

      <div>
        <label className="label">Observaciones</label>
        <textarea className="textarea" rows="2" value={observ} onChange={e => setObserv(e.target.value)} />
      </div>

      <SelectorCuentas
        cuentas={cuentas}
        seleccion={cuentasSel}
        onToggle={(idc, marcada) => setCuentasSel(sel =>
          marcada ? [...sel, idc] : sel.filter(x => x !== idc))}
      />

      <div className="flex justify-end gap-2">
        <button onClick={onCancel} type="button" className="btn-ghost">Cancelar</button>
        <button onClick={onSave} type="button" disabled={saving} className="btn-primary">
          {saving ? 'Guardando…' : 'Guardar cambios'}
        </button>
      </div>
    </div>
  );
}
