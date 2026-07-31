import { useEffect, useRef, useState } from 'react';
import { useParams, useNavigate, useLocation, Link } from 'react-router-dom';
import { serviciosService, tecnicosService, checklistService, archivosService, evidenciasGuiasService, entregasService, assetUrl } from '../services';
import PageHeader from '../components/common/PageHeader.jsx';
import Loader from '../components/common/Loader.jsx';
import Modal from '../components/common/Modal.jsx';
import { FileLink, useFilePreview } from '../components/common/FilePreview.jsx';
import { useToast } from '../components/common/Toast.jsx';
import { useAuth } from '../features/auth/AuthContext.jsx';
import { badgeEstado, formatFecha, formatFechaHora, formatMonto, hoyISO, toYMDLima, codigosAscensores, resumenAscensores, nombreCliente } from '../utils/formatters.js';
import { actualizarFilaAsignacion, validarConsistenciaAsignaciones, tecnicosDisponiblesPara } from '../utils/asignaciones.js';
import {
  estaServicioFinalizado,
  esServicioEditable,
  esServicioPostRevision,
  ESTADO_SERVICIO_FINALIZADO_TECNICO,
  ESTADO_SERVICIO_FINALIZADO_OBSERVADO
} from '../utils/estadoServicio.js';
import { ESTADOS_GUIA, ESTADO_GUIA_OBSERVADA, estadoGuiaSegunArchivo } from '../utils/estadoGuia.js';
import ObservacionesServicioPanel from '../components/servicios/ObservacionesServicioPanel.jsx';
import ChecklistFinalizacionPanel from '../components/servicios/ChecklistFinalizacionPanel.jsx';
import MapaUbicacion from '../components/common/MapaUbicacion.jsx';
import { coordsDe, linkGoogleMaps } from '../utils/mapa.js';

const ROLES_ASIG = ['Responsable principal', 'Apoyo técnico', 'Especialista', 'Supervisor técnico'];
const TIPOS_ITEM = ['Herramienta', 'Material', 'Equipo', 'Repuesto', 'Otro'];
const UNIDADES = ['Unidad', 'Metro', 'Caja', 'Bolsa', 'Litro', 'Juego', 'Otro'];
const TIPOS_EVIDENCIA = ['Foto', 'Video', 'Documento', 'Otro'];
const TIPOS_ENTREGA = ['Entrega parcial', 'Entrega final', 'Entrega documental', 'Entrega técnica'];
const ESTADOS_ENTREGA = ['Pendiente', 'Entregada', 'Observada', 'Aprobada'];

// Tarjeta de una foto de evidencia (secciones "Antes"/"Despues"). El comentario se
// edita en línea y se registra DESPUÉS de subir la imagen; se puede eliminar mientras
// el servicio no esté finalizado (`puedeGestionar`).
function EvidenciaFotoCard({ ev, puedeGestionar, esMultidia, dias, filePreview, onEliminar, onGuardarComentario }) {
  const [comentario, setComentario] = useState(ev.descripcion || '');
  const [guardando, setGuardando] = useState(false);
  const ruta = ev.archivo?.ruta_almacenamiento;
  const mime = ev.archivo?.mime_type || '';
  const esImagen = mime.startsWith('image/');
  const esVideo = mime.startsWith('video/');
  const url = ruta ? assetUrl(ruta) : null;
  const cambiado = (comentario || '').trim() !== (ev.descripcion || '').trim();
  const diaEv = esMultidia && ev.id_dia ? dias.find(x => x.id === ev.id_dia) : null;

  const guardar = async () => {
    setGuardando(true);
    try { await onGuardarComentario(ev.id, comentario); }
    finally { setGuardando(false); }
  };

  return (
    <div className="rounded-lg ring-1 ring-slate-100 overflow-hidden bg-white text-sm">
      <div className="relative aspect-square bg-slate-50">
        {url && esImagen ? (
          <button type="button" onClick={() => filePreview.open(ev.archivo)} className="block w-full h-full">
            <img src={url} alt={ev.descripcion || ev.archivo.nombre_original} className="w-full h-full object-cover hover:scale-105 transition" />
          </button>
        ) : url && esVideo ? (
          <button type="button" onClick={() => filePreview.open(ev.archivo)} className="relative block w-full h-full group" aria-label="Reproducir video">
            <video src={url} preload="metadata" muted playsInline className="w-full h-full object-cover bg-black" />
            <span className="absolute inset-0 grid place-items-center bg-black/30 group-hover:bg-black/40 transition">
              <span className="grid place-items-center h-12 w-12 rounded-full bg-white/90 text-slate-900 shadow-lg">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z" /></svg>
              </span>
            </span>
          </button>
        ) : url ? (
          <FileLink archivo={ev.archivo} className="w-full h-full grid place-items-center text-xs text-brand-700 hover:underline">
            {ev.tipo_evidencia}<br />Ver archivo
          </FileLink>
        ) : (
          <div className="w-full h-full grid place-items-center text-xs text-slate-400">Sin archivo</div>
        )}
        {puedeGestionar && (
          <button onClick={() => onEliminar(ev.id)}
                  className="absolute top-1 right-1 h-7 w-7 rounded-full bg-rose-600/90 text-white text-xs grid place-items-center hover:bg-rose-700 shadow"
                  title="Eliminar foto">
            ✕
          </button>
        )}
      </div>
      <div className="p-2 space-y-1">
        <div className="text-xs text-slate-500">{formatFechaHora(ev.fecha_carga)}</div>
        <div className="text-xs text-slate-700 truncate">{ev.tecnico?.nombre}</div>
        {diaEv && <span className="badge-blue mt-0.5 inline-block">Día {diaEv.orden}</span>}
        {puedeGestionar ? (
          <div className="pt-0.5">
            <textarea
              className="input text-xs min-h-[52px] resize-y"
              placeholder="Escribe un comentario…"
              value={comentario}
              onChange={e => setComentario(e.target.value)}
            />
            {cambiado && (
              <div className="flex justify-end gap-2 mt-1">
                <button type="button" className="text-xs text-slate-500 hover:underline"
                        onClick={() => setComentario(ev.descripcion || '')} disabled={guardando}>
                  Cancelar
                </button>
                <button type="button" className="btn-primary text-xs py-1 px-2"
                        onClick={guardar} disabled={guardando}>
                  {guardando ? 'Guardando…' : 'Guardar comentario'}
                </button>
              </div>
            )}
          </div>
        ) : (
          ev.descripcion && <div className="text-xs text-slate-600 break-words whitespace-pre-wrap">{ev.descripcion}</div>
        )}
      </div>
    </div>
  );
}

// Configuración del modal de revisión administrativa (aprobar / observar / rechazar).
// Centraliza copy, obligatoriedad del motivo, estilo del botón y la tematización
// visual (banner/icono) por resultado, alineada a la línea gráfica del app
// (emerald = aprobar, ember = observar, rose = rechazar). `intro` se reutiliza como
// la consecuencia mostrada en el banner: una sola fuente de verdad, sin duplicar copy.
// Las clases del tema se escriben literales para que el JIT de Tailwind las emita.
const REVISION_META = {
  aprobado: {
    titulo: 'Aprobar revisión',
    intro: 'El servicio cumple y queda habilitado para cobro. Las observaciones son opcionales y se guardan en el historial.',
    labelObs: 'Observaciones de la revisión',
    obligatorio: false,
    btnLabel: 'Aprobar',
    btnClass: 'btn-primary',
    placeholder: 'Comentario opcional para el historial…',
    tema: {
      banner: 'bg-emerald-50 ring-emerald-200/70',
      iconWrap: 'bg-emerald-100 text-emerald-700',
      titulo: 'text-emerald-900',
      texto: 'text-emerald-700/90',
      asterisco: 'text-emerald-600'
    },
    icono: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" /><polyline points="22 4 12 14.01 9 11.01" />
      </svg>
    )
  },
  observado: {
    titulo: 'Observar servicio',
    intro: 'Vuelve a corrección con el técnico, que deberá subsanar tus observaciones y reenviarlo a revisión.',
    labelObs: 'Motivo de la observación',
    obligatorio: true,
    btnLabel: 'Observar',
    btnClass: 'btn-secondary !text-ember-700 !border-ember-300 !bg-ember-50',
    placeholder: 'Detalla qué debe corregirse…',
    tema: {
      banner: 'bg-ember-50 ring-ember-200/70',
      iconWrap: 'bg-ember-100 text-ember-700',
      titulo: 'text-ember-900',
      texto: 'text-ember-700/90',
      asterisco: 'text-ember-600'
    },
    icono: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" /><line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" />
      </svg>
    )
  },
  rechazado: {
    titulo: 'Rechazar servicio',
    intro: 'El servicio se rechaza y vuelve a corrección. El motivo queda registrado en el historial.',
    labelObs: 'Motivo del rechazo',
    obligatorio: true,
    btnLabel: 'Rechazar',
    btnClass: 'btn-danger',
    placeholder: 'Explica por qué se rechaza el servicio…',
    tema: {
      banner: 'bg-rose-50 ring-rose-200/70',
      iconWrap: 'bg-rose-100 text-rose-700',
      titulo: 'text-rose-900',
      texto: 'text-rose-700/90',
      asterisco: 'text-rose-600'
    },
    icono: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10" /><line x1="15" y1="9" x2="9" y2="15" /><line x1="9" y1="9" x2="15" y2="15" />
      </svg>
    )
  }
};

export default function ServicioDetalle() {
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const volver = () => {
    if (location.key && location.key !== 'default') {
      navigate(-1);
    } else {
      navigate('/servicios');
    }
  };
  const [s, setS] = useState(null);
  const [loading, setLoading] = useState(true);
  const [tecnicos, setTecnicos] = useState([]);
  const [openAsignar, setOpenAsignar] = useState(false);
  const [openFinalizar, setOpenFinalizar] = useState(false);
  const [checklistResumen, setChecklistResumen] = useState({ completo: false });
  const [generandoInforme, setGenerandoInforme] = useState(false);
  const [openEntrega, setOpenEntrega] = useState(false);
  const [openEvidencia, setOpenEvidencia] = useState(false);
  const [asignaciones, setAsignaciones] = useState([]);
  const [items, setItems] = useState([]);
  const [finalizarForm, setFinalizarForm] = useState({ observaciones_tecnicas: '', descargo_tecnico: '', codigo_guia: '', id_archivo_guia: null, finalizar_observado: false, numero_ot: '', id_archivo_ot: null });
  const [archivoOtFinalizar, setArchivoOtFinalizar] = useState(null); // { id, nombre_original, ruta_almacenamiento, mime_type }
  const [subiendoOt, setSubiendoOt] = useState(false);
  const [evidenciasFinalizar, setEvidenciasFinalizar] = useState([]); // [{ id, nombre_original, ruta_almacenamiento, mime_type }]
  const [subiendoEvidencia, setSubiendoEvidencia] = useState(false);
  const [subiendoMomento, setSubiendoMomento] = useState(null); // 'Antes' | 'Despues' | null (sección que está subiendo fotos)
  const [guardandoFinalizar, setGuardandoFinalizar] = useState(false);
  const filePreview = useFilePreview();
  const [entregaForm, setEntregaForm] = useState({ tipo_entrega: 'Entrega final', fecha_entrega: hoyISO(), descripcion: '', id_archivo: null, estado_entrega: 'Entregada' });
  const [evidenciaForm, setEvidenciaForm] = useState({ tipo_evidencia: 'Foto', descripcion: '', id_archivo: null, id_dia: '' });
  const [subiendoEvidenciaArchivo, setSubiendoEvidenciaArchivo] = useState(false);
  const [openDuracion, setOpenDuracion] = useState(false);
  const [duracionForm, setDuracionForm] = useState(1);
  const [guardandoDuracion, setGuardandoDuracion] = useState(false);
  // Datos de apoyo que carga el coordinador en el card "Datos": contacto en
  // sitio (nombre + teléfono) y si el edificio tiene cuarto de máquinas.
  const [openDatos, setOpenDatos] = useState(false);
  const [datosForm, setDatosForm] = useState({ contacto_nombre: '', contacto_telefono: '', cuarto_maquinas: '' });
  const [guardandoDatos, setGuardandoDatos] = useState(false);
  const [openProgramar, setOpenProgramar] = useState(false);
  const [programarForm, setProgramarForm] = useState({ fecha_programada: '', hora_programada: '' });
  const [guardandoProgramar, setGuardandoProgramar] = useState(false);
  const [openGuia, setOpenGuia] = useState(false);
  const [guiaEditando, setGuiaEditando] = useState(null); // null = modo crear; objeto guía = modo editar
  const [guiaForm, setGuiaForm] = useState({ codigo_guia: '', id_archivo: null, archivo: null, observaciones_tecnicas: '', estado_guia: ESTADO_GUIA_OBSERVADA });
  const [subiendoArchivoGuia, setSubiendoArchivoGuia] = useState(false);
  const [guardandoGuia, setGuardandoGuia] = useState(false);
  const guardandoGuiaRef = useRef(false);
  const [openRevisar, setOpenRevisar] = useState(false);
  const [revisarResultado, setRevisarResultado] = useState('aprobado'); // aprobado | observado | rechazado
  const [revisarObs, setRevisarObs] = useState('');
  const [guardandoRevisar, setGuardandoRevisar] = useState(false);
  const toast = useToast();
  const { user, esSuperAdmin, esAdmin, esCoordinador, esTecnico, puedeVerPrecio } = useAuth();

  const cargar = async () => {
    setLoading(true);
    try {
      setS(await serviciosService.get(id));
    } finally { setLoading(false); }
  };
  useEffect(() => {
    cargar();
    tecnicosService.list().then(setTecnicos);
  }, [id]);

  if (loading || !s) return <Loader />;

  const puedeAsignar = (esSuperAdmin || esAdmin || esCoordinador)
    && s.estado_servicio !== 'Borrador'
    && !estaServicioFinalizado(s.estado_servicio);
  const puedeIniciar = (esSuperAdmin || esAdmin || (esTecnico && s.asignaciones?.some(a => a.id_tecnico === user.id_tecnico))) &&
    ['Asignado', 'Checklist de salida pendiente', 'Listo para salida', 'En camino'].includes(s.estado_servicio);
  const puedeFinalizar = s.estado_servicio === 'En curso' && (esSuperAdmin || esAdmin ||
    (esTecnico && s.asignaciones?.some(a => a.id_tecnico === user.id_tecnico && (a.responsable_documentacion || s.asignaciones.length === 1))));
  const puedeRevisar = s.estado_servicio === 'En revisión administrativa' && (esSuperAdmin || esAdmin || user.rol_codigo === 'contabilidad');
  const puedePromover = s.estado_servicio === 'Borrador' && (esSuperAdmin || esAdmin || esCoordinador);
  const puedeGestionarEntregas = (esSuperAdmin || esAdmin) && !estaServicioFinalizado(s.estado_servicio);
  // Los mantenimientos generados por un PLAN no se editan desde el formulario de
  // Proyectos: ese modal solo ofrece subtipos de Proyectos y guardar reclasificaría
  // el registro (el backend deriva `tipo_registro` del subtipo). Su precio se
  // corrige desde el plan (Mantenimientos → detalle → Precio) y la fecha con
  // "Reprogramar".
  const esMantenimientoDePlan = !!s.id_mantenimiento_plan;
  // Reprogramar sí aplica a los mantenimientos del plan (mueve la fecha de esa
  // ocurrencia); la edición libre del formulario de Proyectos, no.
  const puedeReprogramar = (esSuperAdmin || esAdmin) && esServicioEditable(s.estado_servicio);
  const puedeEditarServicio = puedeReprogramar && !esMantenimientoDePlan;
  const esTecnicoResponsable = esTecnico && s.asignaciones?.some(a =>
    a.id_tecnico === user.id_tecnico && (a.responsable_documentacion || s.asignaciones.length === 1));
  const guiasBloqueadasPorEstado = esServicioPostRevision(s.estado_servicio);
  const puedeGestionarGuias = (esSuperAdmin || esAdmin || esCoordinador || esTecnicoResponsable) && !guiasBloqueadasPorEstado;
  const puedeEliminarGuia = (esSuperAdmin || esAdmin) && !guiasBloqueadasPorEstado;
  const checklist = s.checklists?.[0];

  // Servicios multidía: la grilla de días y la evidencia esperada por día.
  const dias = s.dias || [];
  const esMultidia = (s.duracion_dias || 1) > 1;
  // Evidencias "generales" del servicio: las que NO son foto de un ítem del
  // checklist de finalización (id_respuesta). Las fotos por ítem se ven y se
  // gestionan en el panel del checklist, no en la tarjeta de evidencias.
  const evidenciasGenerales = (s.evidencias || []).filter(ev => !ev.id_respuesta);
  // Secciones "Antes" / "Despues" de la tarjeta de evidencias. Las evidencias sin
  // momento (legado / cierre / fotos por día) se muestran junto a las de "Despues".
  const evidenciasAntes = evidenciasGenerales.filter(ev => ev.momento === 'Antes');
  const evidenciasDespues = evidenciasGenerales.filter(ev => ev.momento !== 'Antes');
  const evidenciasPorDia = evidenciasGenerales.reduce((acc, ev) => {
    if (ev.id_dia) acc[ev.id_dia] = (acc[ev.id_dia] || 0) + 1;
    return acc;
  }, {});
  const ESTADOS_DURACION_EDITABLE = ['Pendiente', 'Asignado', 'Checklist de salida pendiente', 'Listo para salida', 'En camino', 'En curso'];
  const puedeSubirEvidenciaDia = (esTecnico || esSuperAdmin || esAdmin)
    && ['En camino', 'En curso'].includes(s.estado_servicio);
  const puedeEditarDuracion = (esSuperAdmin || esAdmin) && !!s.fecha_programada
    && ESTADOS_DURACION_EDITABLE.includes(s.estado_servicio);

  // El coordinador (además de admin/super_admin) mantiene los datos de apoyo del
  // servicio mientras no esté cancelado: son información para el técnico, no
  // tocan precios, fechas ni estados.
  const puedeEditarDatosContacto = (esSuperAdmin || esAdmin || esCoordinador) && s.estado_servicio !== 'Cancelado';
  // Técnicos asignados al servicio, con el responsable principal primero.
  const tecnicosAsignados = [...(s.asignaciones || [])].sort(
    (a, b) => (b.responsable_principal || 0) - (a.responsable_principal || 0)
  );

  const iniciarEditarDatos = () => {
    setDatosForm({
      contacto_nombre: s.contacto_nombre || '',
      contacto_telefono: s.contacto_telefono || '',
      cuarto_maquinas: s.cuarto_maquinas || ''
    });
    setOpenDatos(true);
  };

  const guardarDatos = async (e) => {
    e?.preventDefault?.();
    setGuardandoDatos(true);
    try {
      await serviciosService.setDatosContacto(id, {
        contacto_nombre: datosForm.contacto_nombre.trim(),
        contacto_telefono: datosForm.contacto_telefono.trim(),
        cuarto_maquinas: datosForm.cuarto_maquinas
      });
      toast.success('Datos guardados');
      setOpenDatos(false);
      cargar();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Error al guardar los datos');
    } finally { setGuardandoDatos(false); }
  };

  const iniciarAsignar = () => {
    setAsignaciones(s.asignaciones?.map(a => ({
      id_tecnico: a.id_tecnico,
      rol_asignacion: a.rol_asignacion,
      responsable_principal: !!a.responsable_principal,
      responsable_documentacion: !!a.responsable_documentacion,
      responsable_checklist: !!a.responsable_checklist
    })) || []);
    setItems(checklist?.items?.map(it => ({ id: it.id, tipo_item: it.tipo_item, nombre: it.nombre, cantidad: it.cantidad, unidad: it.unidad, observaciones: it.observaciones || '' })) || []);
    setOpenAsignar(true);
  };

  const agregarTec = () => setAsignaciones(a => [...a, { id_tecnico: '', rol_asignacion: 'Apoyo técnico', responsable_principal: false, responsable_documentacion: false, responsable_checklist: false }]);
  const quitarTec = (idx) => setAsignaciones(a => a.filter((_, i) => i !== idx));
  const cambiarTec = (idx, key, val) => setAsignaciones(a => actualizarFilaAsignacion(a, idx, key, val));

  const agregarItem = () => setItems(i => [...i, { tipo_item: 'Herramienta', nombre: '', cantidad: 1, unidad: 'Unidad', observaciones: '' }]);
  const cambiarItem = (idx, key, val) => setItems(i => i.map((x, j) => j === idx ? { ...x, [key]: val } : x));
  const quitarItem = (idx) => setItems(i => i.filter((_, j) => j !== idx));

  const guardarAsignacion = async () => {
    const consistencia = validarConsistenciaAsignaciones(asignaciones, { requerirAlMenosUno: true });
    if (!consistencia.ok) return toast.error(consistencia.error);
    try {
      await serviciosService.asignar(id, { tecnicos: asignaciones, items_checklist: items });
      toast.success('Asignación guardada');
      setOpenAsignar(false);
      cargar();
    } catch (err) { toast.error(err.response?.data?.error || 'Error'); }
  };

  const toggleItemChecklist = async (item) => {
    if (estaServicioFinalizado(s.estado_servicio)) {
      return toast.error(`El servicio está ${s.estado_servicio}: no se pueden modificar los ítems del checklist`);
    }
    const nuevo = item.estado_item === 'Completo' ? 'Pendiente' : 'Completo';
    try {
      await checklistService.updateItem(item.id, { estado_item: nuevo });
      toast.success(`Ítem marcado como ${nuevo}`);
      cargar();
    } catch (err) { toast.error(err.response?.data?.error || 'Error'); }
  };

  const iniciarAccion = async (accion) => {
    try { await serviciosService.iniciar(id, accion); toast.success('Estado actualizado'); cargar(); }
    catch (err) { toast.error(err.response?.data?.error || 'Error'); }
  };

  const subirArchivoYAsignarGuia = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = ''; // permitir reseleccionar el mismo archivo
    if (!file) return;
    const fd = new FormData(); fd.append('archivo', file);
    try {
      const arch = await archivosService.upload(fd, 'guias');
      setFinalizarForm(f => ({ ...f, id_archivo_guia: arch.id }));
      toast.success('Guía subida');
    } catch (err) { toast.error('Error al subir archivo'); }
  };

  const agregarEvidenciasFinalizar = async (e) => {
    const files = Array.from(e.target.files || []);
    e.target.value = '';
    if (files.length === 0) return;
    setSubiendoEvidencia(true);
    try {
      for (const file of files) {
        const fd = new FormData(); fd.append('archivo', file);
        const arch = await archivosService.upload(fd, 'evidencias');
        setEvidenciasFinalizar(prev => [...prev, arch]);
      }
      toast.success(files.length > 1 ? `${files.length} evidencias subidas` : 'Evidencia subida');
    } catch (err) {
      toast.error('Error al subir evidencia');
    } finally {
      setSubiendoEvidencia(false);
    }
  };

  const quitarEvidenciaFinalizar = (idArchivo) => {
    setEvidenciasFinalizar(prev => prev.filter(e => e.id !== idArchivo));
  };

  const requiereCierreCompleto = esTecnico && !(esSuperAdmin || esAdmin);
  const requiereEvidencias = requiereCierreCompleto;
  const requiereOt = requiereCierreCompleto;
  const evidenciasOk = !requiereEvidencias || evidenciasFinalizar.length > 0;
  const otOk = !requiereOt || (finalizarForm.numero_ot.trim() !== '' && !!finalizarForm.id_archivo_ot);

  const subirArchivoOt = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setSubiendoOt(true);
    try {
      const fd = new FormData(); fd.append('archivo', file);
      const arch = await archivosService.upload(fd, 'ot');
      setArchivoOtFinalizar(arch);
      setFinalizarForm(f => ({ ...f, id_archivo_ot: arch.id }));
      toast.success('OT subida');
    } catch {
      toast.error('Error al subir OT');
    } finally {
      setSubiendoOt(false);
    }
  };
  const quitarArchivoOt = () => {
    setArchivoOtFinalizar(null);
    setFinalizarForm(f => ({ ...f, id_archivo_ot: null }));
  };

  const iniciarFinalizacion = async () => {
    // El checklist se completa progresivamente en el panel (estado "En curso").
    // Al pulsar Finalizar se genera el informe PDF a partir de lo persistido y,
    // si está completo, se abre el modal de cierre (guía / OT / evidencias).
    if (generandoInforme) return;
    setGenerandoInforme(true);
    try {
      await serviciosService.generarInformeFinalizacion(id);
      await cargar();
      setOpenFinalizar(true);
    } catch (err) {
      toast.error(err.response?.data?.error || 'No se pudo generar el informe de finalización');
    } finally {
      setGenerandoInforme(false);
    }
  };

  const finalizar = async (e) => {
    if (e?.preventDefault) e.preventDefault();
    if (guardandoFinalizar) return;
    if (!evidenciasOk) { toast.error('Debe adjuntar al menos una foto de evidencia'); return; }
    if (!otOk) { toast.error('Debe adjuntar la OT (número y documento)'); return; }
    setGuardandoFinalizar(true);
    try {
      await serviciosService.finalizar(id, {
        ...finalizarForm,
        id_archivos_evidencias: evidenciasFinalizar.map(ev => ev.id)
      });
      toast.success('Servicio finalizado');
      setOpenFinalizar(false);
      setEvidenciasFinalizar([]);
      setArchivoOtFinalizar(null);
      setFinalizarForm({ observaciones_tecnicas: '', descargo_tecnico: '', codigo_guia: '', id_archivo_guia: null, finalizar_observado: false, numero_ot: '', id_archivo_ot: null });
      cargar();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Error');
    } finally {
      setGuardandoFinalizar(false);
    }
  };

  const subirArchivoEvidencia = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setSubiendoEvidenciaArchivo(true);
    try {
      const fd = new FormData(); fd.append('archivo', file);
      const arch = await archivosService.upload(fd, 'evidencias');
      // Auto-clasificar el tipo de evidencia según el mime del archivo subido.
      const mime = file.type || '';
      const tipoDetectado = mime.startsWith('video/') ? 'Video'
        : mime.startsWith('image/') ? 'Foto'
        : (mime === 'application/pdf' ? 'Documento' : null);
      setEvidenciaForm(f => ({
        ...f,
        id_archivo: arch.id,
        descripcion: f.descripcion || file.name,
        tipo_evidencia: tipoDetectado || f.tipo_evidencia
      }));
      toast.success('Archivo cargado');
    } catch (err) {
      const msg = err?.response?.data?.error || err?.message || 'Error al subir';
      toast.error(msg);
    } finally {
      setSubiendoEvidenciaArchivo(false);
    }
  };

  // Abre el modal de evidencia. Si se pasa un día (servicios multidía) la
  // evidencia queda ligada a ese día; sin día, es evidencia general del servicio.
  const abrirEvidenciaDia = (dia = null) => {
    setEvidenciaForm({ tipo_evidencia: 'Foto', descripcion: '', id_archivo: null, id_dia: dia ? dia.id : '' });
    setOpenEvidencia(true);
  };

  const guardarEvidencia = async () => {
    if (!evidenciaForm.id_archivo) return toast.error('Adjunte un archivo');
    try {
      await evidenciasGuiasService.subirEvidencia(id, evidenciaForm);
      toast.success('Evidencia agregada');
      setOpenEvidencia(false);
      setEvidenciaForm({ tipo_evidencia: 'Foto', descripcion: '', id_archivo: null, id_dia: '' });
      cargar();
    } catch (err) { toast.error(err.response?.data?.error || 'Error'); }
  };

  // Adjunta fotos de forma masiva a una sección ("Antes"/"Despues"): sube cada
  // archivo y crea su evidencia con ese momento. El comentario se registra luego,
  // ya en la tarjeta (guardarComentarioEvidencia).
  const agregarFotosMomento = async (e, momento) => {
    const files = Array.from(e.target.files || []);
    e.target.value = '';
    if (files.length === 0) return;
    setSubiendoMomento(momento);
    try {
      for (const file of files) {
        const fd = new FormData(); fd.append('archivo', file);
        const arch = await archivosService.upload(fd, 'evidencias');
        const mime = file.type || '';
        const tipo = mime.startsWith('video/') ? 'Video'
          : mime.startsWith('image/') ? 'Foto'
          : (mime === 'application/pdf' ? 'Documento' : 'Otro');
        await evidenciasGuiasService.subirEvidencia(id, {
          tipo_evidencia: tipo, descripcion: '', id_archivo: arch.id, momento
        });
      }
      toast.success(files.length > 1 ? `${files.length} fotos subidas` : 'Foto subida');
      cargar();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Error al subir fotos');
    } finally {
      setSubiendoMomento(null);
    }
  };

  const guardarComentarioEvidencia = async (idEvidencia, comentario) => {
    try {
      await evidenciasGuiasService.actualizarEvidencia(idEvidencia, { descripcion: comentario });
      toast.success('Comentario guardado');
      cargar();
    } catch (err) { toast.error(err.response?.data?.error || 'Error al guardar comentario'); }
  };

  const eliminarEvidencia = async (idEvidencia) => {
    if (estaServicioFinalizado(s.estado_servicio)) {
      return toast.error(`El servicio está ${s.estado_servicio}: no se puede eliminar evidencias`);
    }
    if (!confirm('¿Eliminar esta evidencia?')) return;
    try {
      await evidenciasGuiasService.eliminarEvidencia(idEvidencia);
      toast.success('Evidencia eliminada');
      cargar();
    } catch (err) { toast.error(err.response?.data?.error || 'Error'); }
  };

  const cancelar = async () => {
    const motivo = prompt('Motivo de cancelación:');
    if (!motivo) return;
    try { await serviciosService.cancelar(id, motivo); toast.success('Servicio cancelado'); cargar(); }
    catch (err) { toast.error(err.response?.data?.error || 'Error'); }
  };

  const abrirGuiaNueva = () => {
    setGuiaEditando(null);
    setGuiaForm({ codigo_guia: '', id_archivo: null, archivo: null, observaciones_tecnicas: '', estado_guia: ESTADO_GUIA_OBSERVADA });
    setOpenGuia(true);
  };
  const abrirGuiaEditar = (g) => {
    setGuiaEditando(g);
    setGuiaForm({
      codigo_guia: g.codigo_guia || '',
      id_archivo: g.archivo?.id || g.id_archivo || null,
      archivo: g.archivo || null,
      observaciones_tecnicas: g.observaciones_tecnicas || '',
      estado_guia: g.estado_guia || estadoGuiaSegunArchivo(g.id_archivo)
    });
    setOpenGuia(true);
  };
  const subirArchivoGuiaForm = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setSubiendoArchivoGuia(true);
    try {
      const fd = new FormData(); fd.append('archivo', file);
      const arch = await archivosService.upload(fd, 'guias');
      setGuiaForm(f => ({
        ...f,
        id_archivo: arch.id,
        archivo: arch,
        // Si el usuario aún no ha tocado manualmente estado_guia, ajustarlo según
        // la presencia del archivo (Observada → Adjunta al cargar archivo).
        estado_guia: f.estado_guia === ESTADO_GUIA_OBSERVADA ? estadoGuiaSegunArchivo(arch.id) : f.estado_guia
      }));
      toast.success('Archivo cargado');
    } catch {
      toast.error('Error al subir archivo');
    } finally {
      setSubiendoArchivoGuia(false);
    }
  };
  const quitarArchivoGuia = () => setGuiaForm(f => ({ ...f, id_archivo: null, archivo: null }));
  const guardarGuia = async (e) => {
    if (e?.preventDefault) e.preventDefault();
    if (guardandoGuiaRef.current) return;
    const codigo = (guiaForm.codigo_guia || '').trim();
    const obs = (guiaForm.observaciones_tecnicas || '').trim();
    if (!guiaForm.id_archivo && !codigo && !obs) {
      toast.error('Ingrese al menos código, archivo u observaciones');
      return;
    }
    guardandoGuiaRef.current = true;
    setGuardandoGuia(true);
    try {
      const payload = {
        codigo_guia: codigo,
        id_archivo: guiaForm.id_archivo,
        observaciones_tecnicas: obs,
        estado_guia: guiaForm.estado_guia
      };
      if (guiaEditando) {
        await serviciosService.actualizarGuia(id, guiaEditando.id, payload);
        toast.success('Guía actualizada');
      } else {
        await serviciosService.crearGuia(id, payload);
        toast.success('Guía registrada');
      }
      setOpenGuia(false);
      setGuiaEditando(null);
      cargar();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Error');
    } finally {
      guardandoGuiaRef.current = false;
      setGuardandoGuia(false);
    }
  };
  const eliminarGuia = async (idGuia) => {
    if (!confirm('¿Eliminar esta guía? Esta acción no se puede deshacer desde la UI.')) return;
    try {
      await serviciosService.eliminarGuia(id, idGuia);
      toast.success('Guía eliminada');
      cargar();
    } catch (err) { toast.error(err.response?.data?.error || 'Error'); }
  };

  const promover = async () => {
    if (!confirm('¿Promover este borrador a Pendiente?')) return;
    try { await serviciosService.promover(id); toast.success('Servicio promovido'); cargar(); }
    catch (err) { toast.error(err.response?.data?.error || 'Error'); }
  };

  // Abre el modal de revisión administrativa con el resultado preseleccionado.
  const abrirRevisar = (resultado = 'aprobado') => {
    setRevisarResultado(resultado);
    setRevisarObs('');
    setOpenRevisar(true);
  };

  const confirmarRevisar = async () => {
    const meta = REVISION_META[revisarResultado];
    if (meta.obligatorio && !revisarObs.trim()) {
      return toast.error('Debe indicar el motivo al observar o rechazar');
    }
    if (guardandoRevisar) return;
    setGuardandoRevisar(true);
    try {
      await serviciosService.revisar(id, { resultado: revisarResultado, observaciones: revisarObs.trim() });
      toast.success(
        revisarResultado === 'aprobado' ? 'Servicio aprobado y habilitado para cobro'
        : revisarResultado === 'observado' ? 'Servicio observado y devuelto a corrección'
        : 'Servicio rechazado y devuelto a corrección'
      );
      setOpenRevisar(false);
      cargar();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Error');
    } finally {
      setGuardandoRevisar(false);
    }
  };

  // Registrar/editar la fecha de programación cuando el servicio llega al área.
  // Los servicios aprobados desde una cotización nacen sin fecha; aquí se define.
  const abrirProgramar = () => {
    setProgramarForm({
      fecha_programada: s.fecha_programada ? toYMDLima(s.fecha_programada) : hoyISO(),
      hora_programada: s.hora_programada || ''
    });
    setOpenProgramar(true);
  };

  const guardarProgramacion = async () => {
    if (!programarForm.fecha_programada) return toast.error('La fecha es obligatoria');
    if (guardandoProgramar) return;
    setGuardandoProgramar(true);
    try {
      await serviciosService.update(id, {
        fecha_programada: programarForm.fecha_programada,
        hora_programada: programarForm.hora_programada || null
      });
      toast.success('Fecha de programación registrada');
      setOpenProgramar(false);
      cargar();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Error al programar');
    } finally {
      setGuardandoProgramar(false);
    }
  };

  // Editar la duración (días) de un servicio ya programado, incluso En curso.
  const abrirDuracion = () => { setDuracionForm(s.duracion_dias || 1); setOpenDuracion(true); };
  const guardarDuracion = async (confirmar = false) => {
    const diasN = Math.max(1, parseInt(duracionForm, 10) || 0);
    if (!diasN) return toast.error('Duración inválida (mínimo 1 día)');
    if (guardandoDuracion) return;
    setGuardandoDuracion(true);
    try {
      await serviciosService.cambiarDuracion(id, { duracion_dias: diasN, confirmar });
      toast.success('Duración actualizada');
      setOpenDuracion(false);
      cargar();
    } catch (err) {
      const data = err.response?.data;
      if (err.response?.status === 409 && data?.requiere_confirmacion) {
        const lista = (data.dias_con_evidencia || []).map(d => `Día ${d.orden}`).join(', ');
        if (window.confirm(`Reducir la duración dará de baja días que ya tienen evidencia (${lista}). La evidencia se conserva, pero esos días salen de la agenda. ¿Continuar?`)) {
          setGuardandoDuracion(false);
          return guardarDuracion(true);
        }
      } else {
        toast.error(data?.error || 'Error al cambiar la duración');
      }
    } finally {
      setGuardandoDuracion(false);
    }
  };

  const subirArchivoEntrega = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const fd = new FormData(); fd.append('archivo', file);
    try { const r = await archivosService.upload(fd, 'entregas'); setEntregaForm(f => ({ ...f, id_archivo: r.id })); toast.success('Archivo cargado'); }
    catch { toast.error('Error al subir'); }
  };

  const guardarEntrega = async () => {
    if (!entregaForm.tipo_entrega || !entregaForm.fecha_entrega) return toast.error('Tipo y fecha son obligatorios');
    try {
      await entregasService.create({ id_servicio: id, ...entregaForm });
      toast.success('Entrega registrada');
      setOpenEntrega(false);
      setEntregaForm({ tipo_entrega: 'Entrega final', fecha_entrega: hoyISO(), descripcion: '', id_archivo: null, estado_entrega: 'Entregada' });
      cargar();
    } catch (err) { toast.error(err.response?.data?.error || 'Error'); }
  };

  return (
    <>
      <PageHeader title={`${s.codigo} · ${s.titulo}`}
        subtitle={`${nombreCliente(s.cliente)} · ${resumenAscensores(s)} · ${s.tipo_servicio?.nombre}`}
        actions={
          <>
            <button type="button" onClick={volver} className="btn-secondary">← Volver</button>
            {puedeEditarServicio && <button type="button" onClick={() => navigate(`/servicios?edit=${s.id}`)} className="btn-secondary">Editar</button>}
            {puedeReprogramar && <button type="button" onClick={abrirProgramar} className={s.fecha_programada ? 'btn-secondary' : 'btn-primary'}>{s.fecha_programada ? 'Reprogramar' : 'Programar fecha'}</button>}
            {esMantenimientoDePlan && (esSuperAdmin || esAdmin) && (
              <Link to="/mantenimientos" className="btn-secondary">Ver plan</Link>
            )}
            {puedeEditarDuracion && <button type="button" onClick={abrirDuracion} className="btn-secondary">Duración ({s.duracion_dias || 1} día{(s.duracion_dias || 1) > 1 ? 's' : ''})</button>}
            {puedePromover && <button onClick={promover} className="btn-primary">Promover borrador</button>}
            {puedeAsignar && <button onClick={iniciarAsignar} className="btn-secondary">Asignar / Checklist</button>}
            {puedeIniciar && s.estado_servicio === 'Listo para salida' && <button onClick={() => iniciarAccion('en_camino')} className="btn-secondary">En camino</button>}
            {puedeIniciar && ['Listo para salida', 'En camino'].includes(s.estado_servicio) && <button onClick={() => iniciarAccion('iniciar_servicio')} className="btn-primary">Iniciar servicio</button>}
            {puedeFinalizar && (
              <button
                onClick={iniciarFinalizacion}
                disabled={generandoInforme}
                title="El checklist de finalización es opcional; puedes finalizar sin completarlo"
                className="btn-primary disabled:opacity-50 disabled:cursor-not-allowed">
                {generandoInforme ? 'Generando informe…' : 'Finalizar'}
              </button>
            )}
            {puedeRevisar && <button onClick={() => abrirRevisar('aprobado')} className="btn-primary">Aprobar revisión</button>}
            {puedeRevisar && <button onClick={() => abrirRevisar('observado')} className="btn-secondary !text-ember-700 !border-ember-200">Observar</button>}
            {puedeRevisar && <button onClick={() => abrirRevisar('rechazado')} className="btn-secondary !text-rose-700 !border-rose-200">Rechazar</button>}
            {puedeGestionarEntregas && <button onClick={() => setOpenEntrega(true)} className="btn-secondary">+ Entrega</button>}
            {(esSuperAdmin || esAdmin) && !['Cerrado', 'Cancelado'].includes(s.estado_servicio) && <button onClick={cancelar} className="btn-danger">Cancelar</button>}
          </>
        } />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <div className="card">
          <div className="card-header">
            <h3 className="card-title">Datos</h3>
            <div className="flex items-center gap-2">
              {puedeEditarDatosContacto && (
                <button onClick={iniciarEditarDatos} className="btn-secondary !py-1 !px-2.5 !text-xs inline-flex items-center gap-1"
                  title="Contacto en sitio y cuarto de máquinas">
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 20h9" /><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
                  </svg>
                  Editar datos
                </button>
              )}
              <span className={badgeEstado(s.estado_servicio)}>{s.estado_servicio}</span>
            </div>
          </div>
          <div className="card-body grid grid-cols-2 gap-3 text-sm">
            <Info label="Tipo" value={s.tipo_registro} />
            {/* El técnico no ve nada de la cotización: ni el código, ni el enlace,
                ni la mención del origen. Solo ve los ítems y las fotos (más abajo). */}
            {!(esTecnico && s.cotizacion) && <Info label="Origen" value={
              s.cotizacion
                ? <Link to={`/cotizaciones/${s.cotizacion.id}`} className="text-brand-700 hover:underline font-mono">
                    {s.cotizacion.codigo}
                  </Link>
                : s.mantenimiento_plan
                  ? <span className="inline-flex items-center gap-1">
                      <span className="text-slate-800">Plan #{s.mantenimiento_plan.id}</span>
                      <span className="text-xs text-slate-500">· {s.mantenimiento_plan.tipo_plan}</span>
                      {s.es_mantenimiento_gratuito === 1 && <span className="badge-green text-[10px]">Gratuito</span>}
                    </span>
                  : s.emergencia
                    ? <span className="inline-flex items-center gap-1">
                        <span className="text-slate-800 capitalize">Emergencia</span>
                        <span className={`text-[10px] ${s.emergencia.nivel_urgencia === 'alta' ? 'badge-red' : 'badge-amber'}`}>{s.emergencia.nivel_urgencia}</span>
                      </span>
                    : s.correctivo
                      ? <span className="inline-flex items-center gap-1">
                          <span className="text-slate-800 capitalize">Correctivo</span>
                          <span className={`text-[10px] ${s.correctivo.nivel_urgencia === 'alta' ? 'badge-red' : s.correctivo.nivel_urgencia === 'media' ? 'badge-amber' : 'badge-gray'}`}>{s.correctivo.nivel_urgencia}</span>
                        </span>
                      : <span className="capitalize">{s.origen}</span>
            } />}
            <Info label="Fecha programada" value={s.fecha_programada
              ? `${formatFecha(s.fecha_programada)} ${s.hora_programada || ''}`.trim()
              : <span className="text-amber-600">Sin programar</span>} />
            <Info label="Duración" value={`${s.duracion_dias || 1} día${(s.duracion_dias || 1) > 1 ? 's' : ''}`} />
            <Info label="Prioridad" value={s.prioridad} />
            <Info label="Cliente" value={esTecnico
              ? <span className="text-slate-800">{nombreCliente(s.cliente)}</span>
              : <Link to={`/clientes/${s.cliente?.id}`} className="text-brand-700 hover:underline">{nombreCliente(s.cliente)}</Link>} cols={2} />
            <Info label={`Ascensores · ${(s.ascensores || []).length}`} value={
              (s.ascensores || []).length === 0
                ? '—'
                : <div className="space-y-1">
                    {s.ascensores.map(sa => (
                      <div key={sa.id} className="flex items-baseline justify-between gap-3">
                        {esTecnico
                          ? <span className="font-mono text-slate-800">{sa.ascensor?.codigo}</span>
                          : <Link to={`/ascensores/${sa.ascensor?.id}`} className="font-mono text-brand-700 hover:underline">{sa.ascensor?.codigo}</Link>}
                        <span className="text-xs text-slate-500 truncate flex-1">{sa.ascensor?.ubicacion || ''}</span>
                        {puedeVerPrecio && <span className="font-mono text-xs">{formatMonto(sa.monto, sa.moneda || s.moneda)}</span>}
                      </div>
                    ))}
                  </div>
            } cols={2} />
            {puedeVerPrecio && <Info label="Precio total" value={
              s.sin_cobro === 1
                ? <span className="badge-green">{s.es_mantenimiento_gratuito === 1 ? 'Sin costo (mantenimiento gratuito)' : 'Sin costo (cliente con cobertura)'}</span>
                : <span className="font-mono">{formatMonto(s.precio_interno, s.moneda)}</span>
            } cols={2} />}
            <Info label="Contacto" value={
              (s.contacto_nombre || s.contacto_telefono)
                ? <div className="space-y-0.5">
                    {s.contacto_nombre && <div>{s.contacto_nombre}</div>}
                    {s.contacto_telefono && (
                      <a href={`tel:${s.contacto_telefono}`} className="text-brand-700 hover:underline font-mono text-xs">
                        {s.contacto_telefono}
                      </a>
                    )}
                    <AccionDato onClick={iniciarEditarDatos} habilitado={puedeEditarDatosContacto} texto="Editar" />
                  </div>
                : <AccionDato onClick={iniciarEditarDatos} habilitado={puedeEditarDatosContacto} texto="+ Agregar" />
            } />
            <Info label="Cuarto de máquinas" value={
              s.cuarto_maquinas
                ? <div className="space-y-0.5">
                    <div>
                      <span className={s.cuarto_maquinas === 'Si' ? 'badge-green' : 'badge-gray'}>
                        {s.cuarto_maquinas === 'Si' ? 'Sí' : 'No'}
                      </span>
                    </div>
                    <AccionDato onClick={iniciarEditarDatos} habilitado={puedeEditarDatosContacto} texto="Editar" />
                  </div>
                : <AccionDato onClick={iniciarEditarDatos} habilitado={puedeEditarDatosContacto} texto="+ Agregar" />
            } />
            <Info label={tecnicosAsignados.length > 1 ? `Técnicos asignados · ${tecnicosAsignados.length}` : 'Técnico asignado'} value={
              tecnicosAsignados.length === 0
                ? <span className="inline-flex items-center gap-2">
                    <span className="text-amber-600">Sin asignar</span>
                    {puedeAsignar && (
                      <button onClick={iniciarAsignar} className="text-xs text-brand-700 hover:underline font-medium">
                        Asignar técnico
                      </button>
                    )}
                  </span>
                : <div className="space-y-0.5">
                    {tecnicosAsignados.map(a => (
                      <div key={a.id} className="flex items-center gap-2">
                        <span>{a.tecnico?.nombre}</span>
                        {a.responsable_principal === 1 && <span className="badge-blue text-[10px]">Principal</span>}
                      </div>
                    ))}
                    {puedeAsignar && (
                      <button onClick={iniciarAsignar} className="text-xs text-brand-700 hover:underline font-medium">
                        Cambiar asignación
                      </button>
                    )}
                  </div>
            } cols={2} />
            <Info label="Descripción" value={s.descripcion || '—'} cols={2} />
            <Info label="Observaciones" value={s.observaciones || '—'} cols={2} />
            <UbicacionCliente edificio={(s.ascensores || []).map(a => a.ascensor?.edificio).find(Boolean)} />
          </div>
        </div>

        <div className="card lg:col-span-2">
          <div className="card-header"><h3 className="card-title">Asignaciones · {s.asignaciones?.length || 0} técnico(s)</h3></div>
          <div className="card-body">
            {s.asignaciones?.length === 0 ? <p className="text-sm text-slate-500">Sin técnicos asignados</p> : (
              <div className="grid sm:grid-cols-2 gap-3">
                {s.asignaciones?.map(a => (
                  <div key={a.id} className="rounded-lg ring-1 ring-slate-100 p-3 flex items-center gap-3">
                    <div className="h-9 w-9 rounded-full bg-brand-100 text-brand-700 grid place-items-center font-semibold text-sm">{a.tecnico?.nombre?.split(' ').map(p => p[0]).slice(0, 2).join('')}</div>
                    <div className="min-w-0 flex-1">
                      <div className="font-medium text-sm">{a.tecnico?.nombre}</div>
                      <div className="text-xs text-slate-500">{a.rol_asignacion}</div>
                      <div className="flex flex-wrap gap-1 mt-1">
                        {a.responsable_principal === 1 && <span className="badge-blue">Principal</span>}
                        {a.responsable_documentacion === 1 && <span className="badge-violet">Documental</span>}
                        {a.responsable_checklist === 1 && <span className="badge-amber">Checklist</span>}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Adjuntos de la cotización de origen. El técnico no accede a la
            cotización, pero sí necesita ver las fotos que se adjuntaron ahí
            (a él se le muestran solo imágenes, no documentos). */}
        {(() => {
          const adjuntos = (s.cotizacion?.archivos || []).filter(a => a.archivo);
          const esImagen = a => (a.archivo.mime_type || '').startsWith('image/');
          const visibles = esTecnico ? adjuntos.filter(esImagen) : adjuntos;
          if (visibles.length === 0) return null;
          return (
            <div className="card lg:col-span-3">
              <div className="card-header">
                <h3 className="card-title">{esTecnico ? 'Fotos de referencia' : 'Adjuntos de la cotización'} · {visibles.length}</h3>
              </div>
              <div className="card-body">
                <div className="flex flex-wrap gap-3">
                  {visibles.map(a => esImagen(a)
                    ? <a key={a.id} href={assetUrl(a.archivo.ruta_almacenamiento)} target="_blank" rel="noreferrer"
                         title={a.archivo.nombre_original} className="shrink-0">
                        <img src={assetUrl(a.archivo.ruta_almacenamiento)} alt={a.archivo.nombre_original}
                             className="h-28 w-28 object-cover rounded ring-1 ring-slate-200 hover:ring-brand-300" />
                      </a>
                    : <a key={a.id} href={assetUrl(a.archivo.ruta_almacenamiento)} target="_blank" rel="noreferrer"
                         title={a.archivo.nombre_original}
                         className="text-xs text-brand-700 hover:underline rounded ring-1 ring-slate-200 px-3 py-2 max-w-[14rem] truncate">
                        {a.archivo.nombre_original}
                      </a>
                  )}
                </div>
              </div>
            </div>
          );
        })()}

        {/* Ítems de la cotización de origen con su foto. El backend ya los envía
            (precios sanitizados para el técnico); aquí el técnico asignado ve la
            foto de referencia por cada ítem del servicio. */}
        {(() => {
          const cotOrigen = s.cotizacion;
          const ver = cotOrigen?.versiones?.find(v => v.numero_version === cotOrigen.version_activa)
            || cotOrigen?.versiones?.[cotOrigen.versiones.length - 1];
          const itemsCot = ver?.items || [];
          if (itemsCot.length === 0) return null;
          return (
            <div className="card lg:col-span-3">
              <div className="card-header">
                <h3 className="card-title">{esTecnico ? 'Ítems a atender' : 'Ítems de la cotización'} · {itemsCot.length}</h3>
                {!esTecnico && cotOrigen?.codigo && <span className="text-xs text-slate-500 font-mono">{cotOrigen.codigo}</span>}
              </div>
              <div className="card-body">
                <p className="text-xs text-slate-500 mb-3">{esTecnico ? 'Trabajo a realizar y la foto de referencia de cada ítem.' : 'Detalle de lo cotizado y la foto de referencia de cada ítem.'}</p>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {itemsCot.map(it => (
                    <div key={it.id} className="rounded-lg ring-1 ring-slate-100 p-3 flex gap-3">
                      {it.archivo
                        ? <a href={assetUrl(it.archivo.ruta_almacenamiento)} target="_blank" rel="noreferrer" title="Ver foto" className="shrink-0">
                            <img src={assetUrl(it.archivo.ruta_almacenamiento)} alt="foto" className="h-16 w-16 object-cover rounded ring-1 ring-slate-200 hover:ring-brand-300" />
                          </a>
                        : <span className="shrink-0 h-16 w-16 rounded ring-1 ring-slate-200 bg-slate-50 grid place-items-center text-slate-300 text-[11px] text-center">Sin foto</span>}
                      <div className="min-w-0 flex-1">
                        <div className="text-sm text-slate-800 break-words">{it.descripcion || '—'}</div>
                        <div className="text-xs text-slate-500 mt-1">{Number(it.cantidad)} {it.unidad}</div>
                        {puedeVerPrecio && it.importe != null && <div className="text-xs font-mono text-slate-600 mt-0.5">{formatMonto(it.importe, ver.moneda || s.moneda)}</div>}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          );
        })()}

        {checklist && (() => {
          const itemsCk = checklist.items || [];
          const totalCk = itemsCk.length;
          const hechosCk = itemsCk.filter(it => it.estado_item === 'Completo').length;
          const servicioBloqueado = estaServicioFinalizado(s.estado_servicio);
          const checklistBloqueado = servicioBloqueado || ['Aprobado', 'Observado'].includes(checklist.estado_checklist);
          const puedeMarcarChecklist = !checklistBloqueado && (
            esSuperAdmin || esAdmin || esCoordinador ||
            (esTecnico && s.asignaciones?.some(a => a.id_tecnico === user.id_tecnico))
          );
          return (
          <div className="card lg:col-span-3">
            <div className="card-header">
              <h3 className="card-title">
                Checklist de salida · <span className={badgeEstado(checklist.estado_checklist)}>{checklist.estado_checklist}</span>
                {totalCk > 0 && <span className="ml-2 text-xs text-slate-500 font-normal">· {hechosCk} / {totalCk} completos</span>}
              </h3>
            </div>
            <div className="overflow-x-auto scroll-thin">
              <table className="table-base">
                <thead><tr>
                  <th className="table-th">Tipo</th><th className="table-th">Ítem</th>
                  <th className="table-th">Cantidad</th><th className="table-th">Observación</th>
                  <th className="table-th">Estado</th>
                  {puedeMarcarChecklist && <th className="table-th text-right">Acciones</th>}
                </tr></thead>
                <tbody className="divide-y divide-slate-100">
                  {totalCk === 0 && <tr><td colSpan={puedeMarcarChecklist ? 6 : 5} className="table-td text-center text-slate-400 py-4">Sin ítems</td></tr>}
                  {itemsCk.map(it => {
                    const completo = it.estado_item === 'Completo';
                    return (
                      <tr key={it.id}>
                        <td className="table-td text-xs">{it.tipo_item}</td>
                        <td className="table-td">{it.nombre}</td>
                        <td className="table-td font-mono text-xs">{Number(it.cantidad)} {it.unidad}</td>
                        <td className="table-td text-xs">{it.observaciones || '—'}</td>
                        <td className="table-td"><span className={badgeEstado(it.estado_item)}>{it.estado_item}</span></td>
                        {puedeMarcarChecklist && (
                          <td className="table-td text-right">
                            <button
                              onClick={() => toggleItemChecklist(it)}
                              className={completo
                                ? 'text-xs text-slate-500 hover:text-slate-700 hover:underline'
                                : 'text-xs text-emerald-700 hover:underline font-medium'}
                            >
                              {completo ? '↺ Marcar pendiente' : '✓ Marcar completo'}
                            </button>
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {totalCk > 0 && hechosCk < totalCk && (
              <div className="px-4 py-2.5 border-t border-slate-100 text-xs text-slate-500">
                Marca cada ítem como completo. Cuando todos estén completos, el checklist pasa automáticamente a <strong>Completo</strong> y el servicio a <strong>Listo para salida</strong>.
              </div>
            )}
          </div>
          );
        })()}

        {/* La guía de salida no aplica al técnico: solo presenta evidencias y la OT
            (evita confundir la guía con la Orden de Trabajo). */}
        {!esTecnico && <div className="card lg:col-span-2">
          <div className="card-header">
            <h3 className="card-title">Guía de salida</h3>
            {puedeGestionarGuias && (
              <button onClick={abrirGuiaNueva} className="btn-secondary">+ Agregar guía</button>
            )}
          </div>
          <div className="card-body grid sm:grid-cols-2 gap-3">
            {!s.guias?.length && <p className="text-sm text-slate-500">Aún no se ha registrado guía de salida.</p>}
            {s.guias?.map(g => (
              <div key={g.id} className="rounded-lg ring-1 ring-slate-100 p-3 text-sm">
                <div className="flex items-center justify-between gap-2">
                  <div className="font-medium">Guía {g.codigo_guia || '—'}</div>
                  <div className="flex items-center gap-2">
                    <span className={badgeEstado(g.estado_guia)}>{g.estado_guia}</span>
                    {puedeGestionarGuias && (
                      <button type="button" onClick={() => abrirGuiaEditar(g)}
                              className="text-xs text-slate-500 hover:text-brand-700" title="Editar guía" aria-label="Editar guía">
                        ✎
                      </button>
                    )}
                    {puedeEliminarGuia && (
                      <button type="button" onClick={() => eliminarGuia(g.id)}
                              className="text-xs text-slate-400 hover:text-rose-600" title="Eliminar guía" aria-label="Eliminar guía">
                        ✕
                      </button>
                    )}
                  </div>
                </div>
                <div className="text-xs text-slate-500 mt-1">{formatFechaHora(g.fecha_carga)} · {g.tecnico?.nombre}</div>
                {g.archivo && (() => {
                  const esImagen = (g.archivo.mime_type || '').startsWith('image/');
                  return esImagen ? (
                    <button type="button" onClick={() => filePreview.open(g.archivo)}
                            className="block mt-2 w-full max-w-xs rounded-md overflow-hidden ring-1 ring-slate-200 hover:ring-brand-400 transition">
                      <img src={assetUrl(g.archivo.ruta_almacenamiento)} alt={g.archivo.nombre_original} className="w-full h-32 object-cover" />
                    </button>
                  ) : (
                    <FileLink archivo={g.archivo} className="text-brand-700 text-xs hover:underline mt-1 inline-block">Ver archivo</FileLink>
                  );
                })()}
                {g.observaciones_tecnicas && <p className="text-xs text-slate-600 mt-1">{g.observaciones_tecnicas}</p>}
              </div>
            ))}
          </div>
        </div>}

        {(s.servicio_realizado?.numero_ot || s.servicio_realizado?.archivo_ot) && (
          <div className="card">
            <div className="card-header">
              <h3 className="card-title">Orden de Trabajo</h3>
            </div>
            <div className="card-body space-y-3">
              <div>
                <div className="text-[10px] uppercase tracking-wider text-slate-400">N° OT</div>
                <div className="font-mono text-sm text-slate-800">{s.servicio_realizado?.numero_ot || '—'}</div>
              </div>
              {s.servicio_realizado?.archivo_ot && (() => {
                const arch = s.servicio_realizado.archivo_ot;
                const esImagen = (arch.mime_type || '').startsWith('image/');
                return esImagen ? (
                  <button type="button" onClick={() => filePreview.open(arch)}
                          className="block w-full max-w-xs rounded-md overflow-hidden ring-1 ring-slate-200 hover:ring-brand-400 transition">
                    <img src={assetUrl(arch.ruta_almacenamiento)} alt={arch.nombre_original} className="w-full h-40 object-cover" />
                  </button>
                ) : (
                  <FileLink archivo={arch} className="text-brand-700 text-xs hover:underline inline-block">Ver documento</FileLink>
                );
              })()}
            </div>
          </div>
        )}

        {esMultidia && (
          <div className="card lg:col-span-3">
            <div className="card-header">
              <h3 className="card-title">Días del servicio · {dias.length}</h3>
              <span className="text-xs text-slate-500">Se espera 1 evidencia por día</span>
            </div>
            <div className="card-body">
              {dias.length === 0 ? (
                <p className="text-sm text-slate-500">Aún no se han generado los días. Programe la fecha del servicio.</p>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {dias.map(d => {
                    const n = evidenciasPorDia[d.id] || 0;
                    const completo = n > 0;
                    return (
                      <div key={d.id} className={`rounded-lg ring-1 p-3 flex items-center justify-between gap-3 ${completo ? 'ring-emerald-200 bg-emerald-50/40' : 'ring-slate-200'}`}>
                        <div className="min-w-0">
                          <div className="font-medium text-sm">Día {d.orden} <span className="text-slate-400">/ {s.duracion_dias}</span></div>
                          <div className="text-xs text-slate-500">{formatFecha(d.fecha)}</div>
                          <div className="mt-1">
                            {completo
                              ? <span className="badge-green">✓ {n} evidencia{n > 1 ? 's' : ''}</span>
                              : <span className="badge-amber">Sin evidencia</span>}
                          </div>
                        </div>
                        {puedeSubirEvidenciaDia && (
                          <button type="button" onClick={() => abrirEvidenciaDia(d)} className="btn-secondary text-xs whitespace-nowrap">+ Evidencia</button>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}

        {s.estado_servicio === 'En curso' && (esSuperAdmin || esAdmin || esTecnicoResponsable) && (
          <ChecklistFinalizacionPanel
            idServicio={s.id}
            dias={dias}
            esMultidia={esMultidia}
            onResumen={setChecklistResumen}
          />
        )}

        {[
          { key: 'Antes', titulo: 'Antes', lista: evidenciasAntes },
          { key: 'Despues', titulo: 'Después', lista: evidenciasDespues },
        ].map(sec => {
          const puedeGestionar = (esTecnico || esSuperAdmin || esAdmin) && !estaServicioFinalizado(s.estado_servicio);
          const subiendoEsta = subiendoMomento === sec.key;
          return (
            <div key={sec.key} className="card lg:col-span-3">
              <div className="card-header">
                <h3 className="card-title">Evidencias del trabajo · {sec.titulo} · {sec.lista.length}</h3>
                {puedeGestionar && (
                  <div className="flex flex-wrap gap-2">
                    <label className={`btn-secondary cursor-pointer text-xs ${subiendoEsta ? 'opacity-50 pointer-events-none' : ''}`}>
                      📷 Tomar foto
                      <input type="file" className="hidden" accept="image/*" capture="environment" onChange={e => agregarFotosMomento(e, sec.key)} />
                    </label>
                    <label className={`btn-secondary cursor-pointer text-xs ${subiendoEsta ? 'opacity-50 pointer-events-none' : ''}`}>
                      📎 Adjuntar fotos
                      <input type="file" className="hidden" accept="image/*" multiple onChange={e => agregarFotosMomento(e, sec.key)} />
                    </label>
                    {subiendoEsta && <span className="text-xs text-slate-500 self-center">Subiendo…</span>}
                  </div>
                )}
              </div>
              <div className="card-body">
                {!sec.lista.length ? (
                  <p className="text-sm text-slate-500">Sin evidencias registradas.</p>
                ) : (
                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
                    {sec.lista.map(ev => (
                      <EvidenciaFotoCard
                        key={ev.id}
                        ev={ev}
                        puedeGestionar={puedeGestionar}
                        esMultidia={esMultidia}
                        dias={dias}
                        filePreview={filePreview}
                        onEliminar={eliminarEvidencia}
                        onGuardarComentario={guardarComentarioEvidencia}
                      />
                    ))}
                  </div>
                )}
              </div>
            </div>
          );
        })}

        {s.entregas?.length > 0 || puedeGestionarEntregas ? (
          <div className="card lg:col-span-3">
            <div className="card-header">
              <h3 className="card-title">Entregas · {s.entregas?.length || 0}</h3>
              {puedeGestionarEntregas && <button onClick={() => setOpenEntrega(true)} className="btn-secondary">+ Nueva entrega</button>}
            </div>
            <div className="card-body">
              {!s.entregas?.length ? <p className="text-sm text-slate-500">Sin entregas registradas</p> : (
                <div className="overflow-x-auto scroll-thin">
                  <table className="table-base">
                    <thead><tr>
                      <th className="table-th">Fecha</th><th className="table-th">Tipo</th>
                      <th className="table-th">Descripción</th><th className="table-th">Estado</th>
                      <th className="table-th">Archivo</th>
                    </tr></thead>
                    <tbody className="divide-y divide-slate-100">
                      {s.entregas.map(en => (
                        <tr key={en.id}>
                          <td className="table-td text-xs">{formatFecha(en.fecha_entrega)}</td>
                          <td className="table-td"><span className="badge-blue">{en.tipo_entrega}</span></td>
                          <td className="table-td text-xs">{en.descripcion || '—'}</td>
                          <td className="table-td"><span className={badgeEstado(en.estado_entrega)}>{en.estado_entrega}</span></td>
                          <td className="table-td">{en.archivo ? <FileLink archivo={en.archivo} className="text-brand-700 text-xs hover:underline">Ver</FileLink> : '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        ) : null}

        {/* Contabilidad no ve las observaciones técnicas (ni comentario ni imagen):
            solo recibe el aviso de facturación por la campana/recordatorios. */}
        {user?.rol_codigo !== 'contabilidad' && (
          <ObservacionesServicioPanel idServicio={s.id} tecnicosAsignados={s.asignaciones} estadoServicio={s.estado_servicio} />
        )}

        {s.finalizacion_checklist?.archivo_pdf && (
          <div className="card">
            <div className="card-header flex items-center justify-between">
              <h3 className="card-title">Informe de finalización</h3>
              <FileLink archivo={s.finalizacion_checklist.archivo_pdf} className="text-brand-700 hover:underline text-sm inline-flex items-center gap-1">
                📄 Ver / descargar PDF
              </FileLink>
            </div>
            <div className="card-body text-xs text-slate-500">
              Generado el {formatFechaHora(s.finalizacion_checklist.date_time_registration)} a partir del checklist de finalización.
            </div>
          </div>
        )}

        <div className="card">
          <div className="card-header"><h3 className="card-title">Historial</h3></div>
          <ol className="card-body space-y-3 max-h-96 overflow-y-auto scroll-thin">
            {s.historial_estados?.length === 0 && <p className="text-sm text-slate-500">Sin cambios</p>}
            {s.historial_estados?.map(h => (
              <li key={h.id} className="flex gap-3 text-sm">
                <span className="h-2 w-2 rounded-full bg-brand-400 mt-1.5 shrink-0" />
                <div>
                  <div className="text-slate-700">{h.estado_anterior || '—'} → <span className="font-medium">{h.estado_nuevo}</span></div>
                  <div className="text-xs text-slate-400">{formatFechaHora(h.fecha_cambio)}</div>
                  {h.observaciones && <div className="text-xs text-slate-500 mt-0.5">{h.observaciones}</div>}
                </div>
              </li>
            ))}
          </ol>
        </div>
      </div>

      <Modal open={openAsignar} onClose={() => setOpenAsignar(false)} title="Asignación multi técnico + Checklist de salida" size="xl"
        footer={<><button className="btn-secondary" onClick={() => setOpenAsignar(false)}>Cancelar</button><button className="btn-primary" onClick={guardarAsignacion}>Guardar</button></>}>

        <div className="space-y-4">
          <div>
            <div className="flex items-center justify-between mb-2">
              <h4 className="font-medium text-slate-800">Técnicos asignados</h4>
              <button onClick={agregarTec} className="btn-secondary text-xs">+ Agregar técnico</button>
            </div>
            <div className="overflow-x-auto scroll-thin">
              <table className="table-base">
                <thead><tr>
                  <th className="table-th">Técnico</th><th className="table-th">Rol</th>
                  <th className="table-th text-center">Principal</th>
                  <th className="table-th text-center">Documental</th>
                  <th className="table-th text-center">Checklist</th>
                  <th className="table-th"></th>
                </tr></thead>
                <tbody className="divide-y divide-slate-100">
                  {asignaciones.length === 0 && <tr><td colSpan="6" className="table-td text-center text-slate-400 py-4">Agregue técnicos</td></tr>}
                  {asignaciones.map((a, idx) => (
                    <tr key={idx}>
                      <td className="table-td">
                        <select className="select" value={a.id_tecnico} onChange={e => cambiarTec(idx, 'id_tecnico', Number(e.target.value))}>
                          <option value="">— Seleccione —</option>
                          {tecnicosDisponiblesPara(asignaciones, tecnicos, idx).map(t => <option key={t.id} value={t.id}>{t.nombre}</option>)}
                        </select>
                      </td>
                      <td className="table-td">
                        <select className="select" value={a.rol_asignacion} onChange={e => cambiarTec(idx, 'rol_asignacion', e.target.value)}>
                          {ROLES_ASIG.map(r => <option key={r}>{r}</option>)}
                        </select>
                      </td>
                      <td className="table-td text-center"><input type="checkbox" checked={a.responsable_principal} onChange={e => cambiarTec(idx, 'responsable_principal', e.target.checked)} /></td>
                      <td className="table-td text-center"><input type="checkbox" checked={a.responsable_documentacion} onChange={e => cambiarTec(idx, 'responsable_documentacion', e.target.checked)} /></td>
                      <td className="table-td text-center"><input type="checkbox" checked={a.responsable_checklist} onChange={e => cambiarTec(idx, 'responsable_checklist', e.target.checked)} /></td>
                      <td className="table-td text-right"><button onClick={() => quitarTec(idx)} className="text-rose-600 text-xs">Quitar</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="border-t border-slate-100 pt-4">
            <div className="flex items-center justify-between mb-2">
              <h4 className="font-medium text-slate-800">Checklist de salida</h4>
              <button onClick={agregarItem} className="btn-secondary text-xs">+ Agregar ítem</button>
            </div>
            <div className="overflow-x-auto scroll-thin">
              <table className="table-base">
                <thead><tr>
                  <th className="table-th">Tipo</th><th className="table-th">Ítem</th>
                  <th className="table-th">Cantidad</th><th className="table-th">Unidad</th>
                  <th className="table-th">Observación</th><th className="table-th"></th>
                </tr></thead>
                <tbody className="divide-y divide-slate-100">
                  {items.length === 0 && <tr><td colSpan="6" className="table-td text-center text-slate-400 py-4">Sin ítems</td></tr>}
                  {items.map((it, idx) => (
                    <tr key={idx}>
                      <td className="table-td"><select className="select" value={it.tipo_item} onChange={e => cambiarItem(idx, 'tipo_item', e.target.value)}>{TIPOS_ITEM.map(t => <option key={t}>{t}</option>)}</select></td>
                      <td className="table-td"><input className="input" value={it.nombre} onChange={e => cambiarItem(idx, 'nombre', e.target.value)} placeholder="Nombre" /></td>
                      <td className="table-td"><input type="number" step="0.01" className="input" value={it.cantidad} onChange={e => cambiarItem(idx, 'cantidad', e.target.value)} /></td>
                      <td className="table-td"><select className="select" value={it.unidad} onChange={e => cambiarItem(idx, 'unidad', e.target.value)}>{UNIDADES.map(u => <option key={u}>{u}</option>)}</select></td>
                      <td className="table-td"><input className="input" value={it.observaciones} onChange={e => cambiarItem(idx, 'observaciones', e.target.value)} /></td>
                      <td className="table-td text-right"><button onClick={() => quitarItem(idx)} className="text-rose-600 text-xs">Quitar</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </Modal>

      <Modal open={openFinalizar} onClose={() => !guardandoFinalizar && setOpenFinalizar(false)} title="Finalizar servicio" size="lg"
        footer={<>
          <button type="button" className="btn-secondary" onClick={() => setOpenFinalizar(false)} disabled={guardandoFinalizar}>Cancelar</button>
          <button type="submit" form="form-finalizar" className="btn-primary" disabled={guardandoFinalizar || subiendoEvidencia || subiendoOt || !evidenciasOk || !otOk}>
            {guardandoFinalizar ? 'Finalizando…' : 'Finalizar'}
          </button>
        </>}>
        <form id="form-finalizar" onSubmit={finalizar} className="space-y-4">
          <div><label className="label">Observaciones técnicas *</label><textarea className="textarea" rows="3" required value={finalizarForm.observaciones_tecnicas} onChange={e => setFinalizarForm(f => ({ ...f, observaciones_tecnicas: e.target.value }))} /></div>
          <div><label className="label">Descargo técnico</label><textarea className="textarea" rows="2" value={finalizarForm.descargo_tecnico} onChange={e => setFinalizarForm(f => ({ ...f, descargo_tecnico: e.target.value }))} /></div>

          {/* El técnico no carga guía de salida (solo evidencias y OT): se ocultaba
              para no confundirla con la Orden de Trabajo. */}
          {!esTecnico && (
          <div className="border-t border-slate-100 pt-4 space-y-2">
            <label className="label">Guía de salida</label>
            <input className="input" placeholder="Código de guía" value={finalizarForm.codigo_guia} onChange={e => setFinalizarForm(f => ({ ...f, codigo_guia: e.target.value }))} />
            <div className="flex flex-wrap gap-2">
              <label className="btn-secondary cursor-pointer text-xs">
                📷 Tomar foto
                <input type="file" className="hidden" accept="image/*" capture="environment" onChange={subirArchivoYAsignarGuia} />
              </label>
              <label className="btn-secondary cursor-pointer text-xs">
                📎 Adjuntar archivo
                <input type="file" className="hidden" accept="image/*,application/pdf" onChange={subirArchivoYAsignarGuia} />
              </label>
              {finalizarForm.id_archivo_guia && (
                <span className="inline-flex items-center gap-2 text-xs text-emerald-700 bg-emerald-50 ring-1 ring-emerald-200 rounded-md px-2 py-1">
                  ✓ Guía cargada
                  <button type="button" onClick={() => setFinalizarForm(f => ({ ...f, id_archivo_guia: null }))} className="text-emerald-900 hover:underline">Quitar</button>
                </span>
              )}
            </div>
          </div>
          )}

          <div className="border-t border-slate-100 pt-4 space-y-2">
            <label className="label">
              Orden de Trabajo (OT) {requiereOt && <span className="text-rose-600">*</span>}
            </label>
            <input
              className="input"
              placeholder="Número de OT"
              value={finalizarForm.numero_ot}
              onChange={e => setFinalizarForm(f => ({ ...f, numero_ot: e.target.value }))}
            />
            <div className="flex flex-wrap gap-2">
              <label className={`btn-secondary cursor-pointer text-xs ${subiendoOt ? 'opacity-50 pointer-events-none' : ''}`}>
                📷 Tomar foto
                <input type="file" className="hidden" accept="image/*" capture="environment" onChange={subirArchivoOt} />
              </label>
              <label className={`btn-secondary cursor-pointer text-xs ${subiendoOt ? 'opacity-50 pointer-events-none' : ''}`}>
                📎 Adjuntar archivo
                <input type="file" className="hidden" accept="image/*,application/pdf" onChange={subirArchivoOt} />
              </label>
              {subiendoOt && <span className="text-xs text-slate-500 self-center">Subiendo…</span>}
              {finalizarForm.id_archivo_ot && !subiendoOt && (
                <span className="inline-flex items-center gap-2 text-xs text-emerald-700 bg-emerald-50 ring-1 ring-emerald-200 rounded-md px-2 py-1">
                  ✓ OT cargada
                  <button type="button" onClick={quitarArchivoOt} className="text-emerald-900 hover:underline">Quitar</button>
                </span>
              )}
            </div>
            {requiereOt && !otOk && (
              <p className="text-xs text-rose-600">Como técnico, debe ingresar el número de OT y adjuntar el documento para finalizar.</p>
            )}
          </div>

          <div className="border-t border-slate-100 pt-4 space-y-2">
            <div className="flex items-center justify-between">
              <label className="label mb-0">
                Evidencias del trabajo terminado {requiereEvidencias && <span className="text-rose-600">*</span>}
              </label>
              <span className="text-xs text-slate-500">{evidenciasFinalizar.length} foto(s)</span>
            </div>
            <div className="flex flex-wrap gap-2">
              <label className={`btn-secondary cursor-pointer text-xs ${subiendoEvidencia ? 'opacity-50 pointer-events-none' : ''}`}>
                📷 Tomar foto
                <input type="file" className="hidden" accept="image/*" capture="environment" onChange={agregarEvidenciasFinalizar} />
              </label>
              <label className={`btn-secondary cursor-pointer text-xs ${subiendoEvidencia ? 'opacity-50 pointer-events-none' : ''}`}>
                📎 Adjuntar fotos
                <input type="file" className="hidden" accept="image/*" multiple onChange={agregarEvidenciasFinalizar} />
              </label>
              {subiendoEvidencia && <span className="text-xs text-slate-500 self-center">Subiendo…</span>}
            </div>
            {evidenciasFinalizar.length > 0 && (
              <div className="grid grid-cols-3 sm:grid-cols-4 gap-2 mt-2">
                {evidenciasFinalizar.map(ev => (
                  <div key={ev.id} className="relative group rounded-md overflow-hidden ring-1 ring-slate-200 aspect-square bg-slate-50">
                    <img src={assetUrl(ev.ruta_almacenamiento)} alt={ev.nombre_original} className="w-full h-full object-cover" />
                    <button type="button" onClick={() => quitarEvidenciaFinalizar(ev.id)}
                            className="absolute top-1 right-1 h-6 w-6 rounded-full bg-rose-600 text-white text-xs grid place-items-center opacity-0 group-hover:opacity-100 transition">
                      ✕
                    </button>
                  </div>
                ))}
              </div>
            )}
            {requiereEvidencias && evidenciasFinalizar.length === 0 && (
              <p className="text-xs text-rose-600">Como técnico, debe adjuntar al menos 1 foto del trabajo terminado para finalizar.</p>
            )}
          </div>

          {(esSuperAdmin || esAdmin) && !finalizarForm.id_archivo_guia && (
            <label className="flex items-center gap-2 text-sm text-amber-700 bg-amber-50 ring-1 ring-amber-200 rounded-md p-3">
              <input type="checkbox" checked={finalizarForm.finalizar_observado} onChange={e => setFinalizarForm(f => ({ ...f, finalizar_observado: e.target.checked }))} />
              <span>Finalizar como <strong>observado</strong> (sin guía) — requiere permiso Admin/Super Admin.</span>
            </label>
          )}
          <p className="text-xs text-slate-500">Al finalizar, se generará servicio realizado y pasará a <strong>En revisión administrativa</strong>. Admin/Contabilidad debe revisar para enviar a gestión de cobros.</p>
        </form>
      </Modal>

      <Modal open={openProgramar} onClose={() => !guardandoProgramar && setOpenProgramar(false)}
        title={s.fecha_programada ? 'Reprogramar servicio' : 'Programar fecha del servicio'} size="sm"
        footer={<>
          <button className="btn-secondary" onClick={() => setOpenProgramar(false)} disabled={guardandoProgramar}>Cancelar</button>
          <button className="btn-primary" onClick={guardarProgramacion} disabled={guardandoProgramar}>Guardar</button>
        </>}>
        <div className="space-y-3">
          <p className="text-xs text-carbon-500">
            Registra cuándo se ejecutará el servicio. Al guardar, aparece en el calendario operativo.
          </p>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Fecha *</label>
              <input type="date" className="input" value={programarForm.fecha_programada}
                onChange={e => setProgramarForm(f => ({ ...f, fecha_programada: e.target.value }))} required />
            </div>
            <div>
              <label className="label">Hora</label>
              <input type="time" className="input" value={programarForm.hora_programada}
                onChange={e => setProgramarForm(f => ({ ...f, hora_programada: e.target.value }))} />
            </div>
          </div>
        </div>
      </Modal>

      <Modal open={openDuracion} onClose={() => !guardandoDuracion && setOpenDuracion(false)}
        title="Duración del servicio" size="sm"
        footer={<>
          <button className="btn-secondary" onClick={() => setOpenDuracion(false)} disabled={guardandoDuracion}>Cancelar</button>
          <button className="btn-primary" onClick={() => guardarDuracion(false)} disabled={guardandoDuracion}>Guardar</button>
        </>}>
        <div className="space-y-3">
          <p className="text-xs text-slate-500">
            Días corridos que dura el trabajo, desde la fecha programada. Se regeneran
            los días de la agenda conservando los ya trabajados con su evidencia.
          </p>
          <div>
            <label className="label">Duración (días) *</label>
            <input type="number" min="1" step="1" className="input" value={duracionForm}
              onChange={e => setDuracionForm(e.target.value)} />
          </div>
          {Number(duracionForm) < (s.duracion_dias || 1) && (
            <p className="text-[11px] text-amber-700">
              Vas a reducir la duración. Si algún día eliminado ya tiene evidencia, se pedirá confirmación.
            </p>
          )}
        </div>
      </Modal>

      <Modal open={openRevisar} onClose={() => !guardandoRevisar && setOpenRevisar(false)}
        title={REVISION_META[revisarResultado].titulo} size="sm"
        footer={<>
          <button className="btn-secondary" onClick={() => setOpenRevisar(false)} disabled={guardandoRevisar}>Cancelar</button>
          <button className={REVISION_META[revisarResultado].btnClass} onClick={confirmarRevisar} disabled={guardandoRevisar}>
            {guardandoRevisar ? 'Guardando…' : REVISION_META[revisarResultado].btnLabel}
          </button>
        </>}>
        {(() => {
          const meta = REVISION_META[revisarResultado];
          return (
            <div className="space-y-4">
              {/* Banner tematizado por resultado: icono + consecuencia */}
              <div className={`flex items-start gap-3 rounded-xl ring-1 px-3.5 py-3 ${meta.tema.banner}`}>
                <span className={`grid place-items-center h-9 w-9 shrink-0 rounded-lg ${meta.tema.iconWrap}`}>
                  {meta.icono}
                </span>
                <div className="min-w-0">
                  <p className={`font-display text-sm font-semibold tracking-tight ${meta.tema.titulo}`}>{meta.titulo}</p>
                  <p className={`text-xs mt-0.5 ${meta.tema.texto}`}>{meta.intro}</p>
                </div>
              </div>

              {/* Servicio en revisión */}
              <div className="flex flex-wrap items-center gap-2">
                <span className="badge-gray">{s.codigo}</span>
                <span className="text-sm text-carbon-700 truncate">{s.titulo}</span>
              </div>

              <div>
                <label className="label">
                  {meta.labelObs}{meta.obligatorio && <span className={meta.tema.asterisco}> *</span>}
                </label>
                <textarea className="textarea" rows="4" value={revisarObs}
                  onChange={e => setRevisarObs(e.target.value)}
                  placeholder={meta.placeholder} autoFocus />
              </div>
            </div>
          );
        })()}
      </Modal>

      <Modal open={openEntrega} onClose={() => setOpenEntrega(false)} title="Nueva entrega" size="lg"
        footer={<><button className="btn-secondary" onClick={() => setOpenEntrega(false)}>Cancelar</button><button className="btn-primary" onClick={guardarEntrega}>Guardar</button></>}>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="label">Tipo *</label>
            <select className="select" value={entregaForm.tipo_entrega} onChange={e => setEntregaForm(f => ({ ...f, tipo_entrega: e.target.value }))}>
              {TIPOS_ENTREGA.map(t => <option key={t}>{t}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Fecha *</label>
            <input type="date" className="input" value={entregaForm.fecha_entrega} onChange={e => setEntregaForm(f => ({ ...f, fecha_entrega: e.target.value }))} />
          </div>
          <div className="sm:col-span-2">
            <label className="label">Estado</label>
            <select className="select" value={entregaForm.estado_entrega} onChange={e => setEntregaForm(f => ({ ...f, estado_entrega: e.target.value }))}>
              {ESTADOS_ENTREGA.map(s => <option key={s}>{s}</option>)}
            </select>
          </div>
          <div className="sm:col-span-2">
            <label className="label">Descripción</label>
            <textarea className="textarea" rows="3" value={entregaForm.descripcion} onChange={e => setEntregaForm(f => ({ ...f, descripcion: e.target.value }))} />
          </div>
          <div className="sm:col-span-2">
            <label className="label">Archivo</label>
            <input type="file" className="input" onChange={subirArchivoEntrega} />
            {entregaForm.id_archivo && <p className="text-xs text-emerald-600 mt-1">Archivo cargado</p>}
          </div>
        </div>
      </Modal>

      <Modal open={openEvidencia} onClose={() => !subiendoEvidenciaArchivo && setOpenEvidencia(false)} title="Nueva evidencia"
        footer={<>
          <button type="button" className="btn-secondary" onClick={() => setOpenEvidencia(false)} disabled={subiendoEvidenciaArchivo}>Cancelar</button>
          <button type="submit" form="form-evidencia" className="btn-primary" disabled={subiendoEvidenciaArchivo}>Guardar</button>
        </>}>
        <form id="form-evidencia" onSubmit={(e) => { e.preventDefault(); guardarEvidencia(); }} className="space-y-4">
          {esMultidia && (
            <div>
              <label className="label">Día del servicio</label>
              <select className="select" value={evidenciaForm.id_dia}
                onChange={e => setEvidenciaForm(f => ({ ...f, id_dia: e.target.value }))}>
                <option value="">Sin día específico</option>
                {dias.map(d => <option key={d.id} value={d.id}>Día {d.orden} · {formatFecha(d.fecha)}</option>)}
              </select>
            </div>
          )}
          <div>
            <label className="label">Tipo *</label>
            <select className="select" value={evidenciaForm.tipo_evidencia} onChange={e => setEvidenciaForm(f => ({ ...f, tipo_evidencia: e.target.value }))}>
              {TIPOS_EVIDENCIA.map(t => <option key={t}>{t}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Descripción</label>
            <input className="input" value={evidenciaForm.descripcion} onChange={e => setEvidenciaForm(f => ({ ...f, descripcion: e.target.value }))} />
          </div>
          <div>
            <label className="label">Archivo *</label>
            <div className="flex flex-wrap gap-2">
              <label className={`btn-secondary cursor-pointer text-xs ${subiendoEvidenciaArchivo ? 'opacity-50 pointer-events-none' : ''}`}>
                📷 Tomar foto
                <input type="file" className="hidden" accept="image/*" capture="environment" onChange={subirArchivoEvidencia} />
              </label>
              <label className={`btn-secondary cursor-pointer text-xs ${subiendoEvidenciaArchivo ? 'opacity-50 pointer-events-none' : ''}`}>
                🎥 Grabar video
                <input type="file" className="hidden" accept="video/*" capture="environment" onChange={subirArchivoEvidencia} />
              </label>
              <label className={`btn-secondary cursor-pointer text-xs ${subiendoEvidenciaArchivo ? 'opacity-50 pointer-events-none' : ''}`}>
                📎 Adjuntar
                <input type="file" className="hidden" accept="image/*,video/*,application/pdf" onChange={subirArchivoEvidencia} />
              </label>
              {subiendoEvidenciaArchivo && <span className="text-xs text-slate-500 self-center">Subiendo…</span>}
              {!subiendoEvidenciaArchivo && evidenciaForm.id_archivo && <span className="text-xs text-emerald-700 self-center">✓ Archivo cargado</span>}
            </div>
            <p className="text-[11px] text-slate-500 mt-1">Se permiten fotos, videos y PDFs. Tamaño máximo configurado por el servidor.</p>
          </div>
        </form>
      </Modal>

      <Modal
        open={openGuia}
        onClose={() => !guardandoGuia && setOpenGuia(false)}
        title={guiaEditando ? 'Editar guía de salida' : 'Agregar guía de salida'}
        size="md"
        footer={(
          <>
            <button type="button" className="btn-secondary" onClick={() => setOpenGuia(false)} disabled={guardandoGuia}>
              Cancelar
            </button>
            <button type="submit" form="form-guia" className="btn-primary" disabled={guardandoGuia || subiendoArchivoGuia}>
              {guardandoGuia ? 'Guardando…' : (guiaEditando ? 'Guardar cambios' : 'Registrar guía')}
            </button>
          </>
        )}
      >
        <form id="form-guia" onSubmit={guardarGuia} className="space-y-3">
          <div>
            <label className="label">Código de guía</label>
            <input
              className="input"
              placeholder="Ej. 001-12345"
              value={guiaForm.codigo_guia}
              onChange={e => setGuiaForm(f => ({ ...f, codigo_guia: e.target.value }))}
            />
          </div>
          <div>
            <label className="label">Archivo (foto o PDF)</label>
            <div className="flex flex-wrap items-center gap-2">
              <label className="btn-secondary cursor-pointer text-xs">
                📷 Tomar foto
                <input type="file" className="hidden" accept="image/*" capture="environment" onChange={subirArchivoGuiaForm} />
              </label>
              <label className="btn-secondary cursor-pointer text-xs">
                📎 Adjuntar archivo
                <input type="file" className="hidden" accept="image/*,application/pdf" onChange={subirArchivoGuiaForm} />
              </label>
              {subiendoArchivoGuia && <span className="text-xs text-slate-500">Subiendo…</span>}
              {!subiendoArchivoGuia && guiaForm.id_archivo && (
                <span className="inline-flex items-center gap-2 text-xs text-emerald-700 bg-emerald-50 ring-1 ring-emerald-200 rounded-md px-2 py-1">
                  ✓ Archivo cargado
                  {guiaForm.archivo && (
                    <button type="button" onClick={() => filePreview.open(guiaForm.archivo)} className="text-emerald-900 hover:underline">
                      Ver
                    </button>
                  )}
                  <button type="button" onClick={quitarArchivoGuia} className="text-emerald-900 hover:underline">
                    Quitar
                  </button>
                </span>
              )}
            </div>
          </div>
          <div>
            <label className="label">Observaciones técnicas</label>
            <textarea
              className="input min-h-[80px]"
              placeholder="Notas u observaciones de la guía"
              value={guiaForm.observaciones_tecnicas}
              onChange={e => setGuiaForm(f => ({ ...f, observaciones_tecnicas: e.target.value }))}
            />
          </div>
          <div>
            <label className="label">Estado</label>
            <select
              className="input"
              value={guiaForm.estado_guia}
              onChange={e => setGuiaForm(f => ({ ...f, estado_guia: e.target.value }))}
            >
              {ESTADOS_GUIA.map(es => <option key={es} value={es}>{es}</option>)}
            </select>
          </div>
          <p className="text-[11px] text-slate-500">
            Si el servicio está marcado como <strong>{ESTADO_SERVICIO_FINALIZADO_OBSERVADO}</strong> y carga el archivo de guía,
            el servicio se regularizará automáticamente a <strong>{ESTADO_SERVICIO_FINALIZADO_TECNICO}</strong>.
          </p>
        </form>
      </Modal>

      {/* Datos de apoyo que carga el coordinador para el técnico: a quién
          contactar en sitio y si el edificio tiene cuarto de máquinas. */}
      <Modal open={openDatos} onClose={() => setOpenDatos(false)} title="Datos del servicio"
        footer={<>
          <button className="btn-secondary" onClick={() => setOpenDatos(false)} disabled={guardandoDatos}>Cancelar</button>
          <button className="btn-primary" onClick={guardarDatos} disabled={guardandoDatos}>
            {guardandoDatos ? 'Guardando…' : 'Guardar'}
          </button>
        </>}>
        <form onSubmit={guardarDatos} className="space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="label">Nombre de contacto</label>
              <input className="input" maxLength={150} placeholder="Ej. Juan Pérez (conserje)"
                value={datosForm.contacto_nombre}
                onChange={e => setDatosForm(f => ({ ...f, contacto_nombre: e.target.value }))} />
            </div>
            <div>
              <label className="label">Teléfono de contacto</label>
              <input className="input" maxLength={30} placeholder="Ej. 999 888 777"
                value={datosForm.contacto_telefono}
                onChange={e => setDatosForm(f => ({ ...f, contacto_telefono: e.target.value }))} />
            </div>
          </div>
          <div>
            <label className="label">Cuarto de máquinas</label>
            <select className="select" value={datosForm.cuarto_maquinas}
              onChange={e => setDatosForm(f => ({ ...f, cuarto_maquinas: e.target.value }))}>
              <option value="">— Sin definir —</option>
              <option value="Si">Sí</option>
              <option value="No">No</option>
            </select>
          </div>
          <p className="text-[11px] text-slate-500">
            El técnico asignado se gestiona desde <strong>Asignar / Checklist</strong> y se muestra en este mismo card.
          </p>
        </form>
      </Modal>

    </>
  );
}

/**
 * Atajo al modal de datos desde el propio campo del card "Datos": "+ Agregar"
 * cuando está vacío y "Editar" cuando ya tiene valor, para no depender de que
 * el usuario descubra el botón de la cabecera. Sin permiso de edición, un campo
 * vacío se ve como el guion habitual y uno lleno no muestra acción.
 */
function AccionDato({ onClick, habilitado, texto }) {
  if (!habilitado) return texto === 'Editar' ? null : '—';
  return (
    <button onClick={onClick} className="text-xs text-brand-700 hover:underline font-medium">
      {texto}
    </button>
  );
}

function Info({ label, value, cols = 1 }) {
  return (
    <div className={`min-w-0 ${cols === 2 ? 'col-span-2' : ''}`}>
      <div className="text-[10px] uppercase tracking-wider text-slate-400">{label}</div>
      <div className="text-slate-800 text-sm whitespace-pre-wrap break-words [overflow-wrap:anywhere]">{value || '—'}</div>
    </div>
  );
}

/**
 * Bloque "Ubicación" embebido en el card de Datos del servicio. Pensado
 * principalmente para el técnico: dirección textual + mini-mapa read-only
 * + botón directo a Google Maps. Si el cliente fue creado antes de que el
 * mapa fuera obligatorio, muestra solo el texto disponible y la nota.
 */
function UbicacionCliente({ edificio }) {
  if (!edificio) return null;
  const coords = coordsDe(edificio);
  const direccionPartes = [edificio.direccion, edificio.distrito].filter(Boolean);
  const direccionTexto = direccionPartes.join(' · ') || 'Sin dirección registrada';
  return (
    <div className="col-span-2 border-t border-slate-100 pt-3 mt-1">
      <div className="flex items-center justify-between gap-2 mb-2">
        <div className="text-[10px] uppercase tracking-wider text-slate-400">Ubicación</div>
        {coords && (
          <a
            href={linkGoogleMaps(coords)}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-brand-700 hover:underline font-medium"
          >
            📍 Abrir en Google Maps ↗
          </a>
        )}
      </div>
      <div className="text-sm text-slate-800 mb-2">{direccionTexto}</div>
      {coords ? (
        <MapaUbicacion
          valor={edificio}
          alto="220px"
          mostrarLinkMaps={false}
        />
      ) : (
        <div className="rounded-lg ring-1 ring-slate-200 bg-slate-50 p-3 text-xs text-slate-500">
          Ubicación no registrada en el mapa para este edificio.
        </div>
      )}
    </div>
  );
}
