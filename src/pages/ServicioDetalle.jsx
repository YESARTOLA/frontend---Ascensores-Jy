import { useEffect, useRef, useState } from 'react';
import { useParams, useNavigate, useLocation, Link } from 'react-router-dom';
import { serviciosService, tecnicosService, archivosService, evidenciasGuiasService, entregasService, assetUrl } from '../services';
import PageHeader from '../components/common/PageHeader.jsx';
import Loader from '../components/common/Loader.jsx';
import Modal from '../components/common/Modal.jsx';
import { FileLink, useFilePreview } from '../components/common/FilePreview.jsx';
import { useToast } from '../components/common/Toast.jsx';
import { useAuth } from '../features/auth/AuthContext.jsx';
import { badgeEstado, formatFecha, formatFechaHora, formatMonto, hoyISO, codigosAscensores, resumenAscensores, nombreCliente } from '../utils/formatters.js';
import { actualizarFilaAsignacion, validarConsistenciaAsignaciones, tecnicosDisponiblesPara } from '../utils/asignaciones.js';
import {
  estaServicioFinalizado,
  esServicioEditable,
  esServicioPostRevision,
  ESTADO_SERVICIO_EN_CURSO,
  ESTADO_SERVICIO_FINALIZADO
} from '../utils/estadoServicio.js';
import { ESTADOS_GUIA, ESTADO_GUIA_OBSERVADA, ESTADO_GUIA_ADJUNTA, estadoGuiaSegunArchivo } from '../utils/estadoGuia.js';
import ObservacionesServicioPanel from '../components/servicios/ObservacionesServicioPanel.jsx';
import ChecklistFinalizacionPanel from '../components/servicios/ChecklistFinalizacionPanel.jsx';
import InformePreviewModal from '../components/servicios/InformePreviewModal.jsx';
import MapaUbicacion from '../components/common/MapaUbicacion.jsx';
import FichaTecnicaAscensor from '../components/ascensores/FichaTecnicaAscensor.jsx';
import { coordsDe, linkGoogleMaps } from '../utils/mapa.js';
import ProgramacionDias from '../components/common/ProgramacionDias.jsx';
import {
  tramoDeUnDia, tramosDeServicio, payloadDias, errorDeTramos, resumenProgramacion
} from '../utils/programacion.js';

const ROLES_ASIG = ['Responsable principal', 'Apoyo técnico', 'Especialista', 'Supervisor técnico'];
const TIPOS_EVIDENCIA = ['Foto', 'Video', 'Documento', 'Otro'];

// Iconos del botón flotante de acción principal (solo móvil).
const ICONO_CHECK = (
  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
);
const ICONO_USUARIO = (
  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><circle cx="9" cy="7" r="4"/><path d="M3 21v-2a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4v2"/><line x1="19" y1="8" x2="19" y2="14"/><line x1="22" y1="11" x2="16" y2="11"/></svg>
);
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
  // Previsualización del informe: el técnico revisa y corrige los textos antes
  // de que se emita el PDF.
  const [openInforme, setOpenInforme] = useState(false);
  // Orden de trabajo del servicio (sección propia, junto a la guía de salida).
  const [otForm, setOtForm] = useState({ numero_ot: '', id_archivo: null });
  const [subiendoOtServicio, setSubiendoOtServicio] = useState(false);
  const [guardandoOt, setGuardandoOt] = useState(false);
  // Programación que se decide junto con los técnicos (técnico + fecha = Asignado).
  const [asignarProgramacion, setAsignarProgramacion] = useState({ tramos: [], hora_programada: '' });
  const [finalizarForm, setFinalizarForm] = useState({ observaciones_tecnicas: '', descargo_tecnico: '', codigo_guia: '', id_archivo_guia: null, finalizar_observado: false });
  const [subiendoMomento, setSubiendoMomento] = useState(null); // 'Antes' | 'Despues' | null (sección que está subiendo fotos)
  const [guardandoFinalizar, setGuardandoFinalizar] = useState(false);
  const filePreview = useFilePreview();
  const [entregaForm, setEntregaForm] = useState({ tipo_entrega: 'Entrega final', fecha_entrega: hoyISO(), descripcion: '', id_archivo: null, estado_entrega: 'Entregada' });
  const [evidenciaForm, setEvidenciaForm] = useState({ tipo_evidencia: 'Foto', descripcion: '', id_archivo: null, id_dia: '' });
  const [subiendoEvidenciaArchivo, setSubiendoEvidenciaArchivo] = useState(false);
  // Modal único de programación: días de trabajo (rangos y/o fechas sueltas) + hora.
  const [openProgramacion, setOpenProgramacion] = useState(false);
  const [programacionForm, setProgramacionForm] = useState({ tramos: [], hora_programada: '' });
  const [guardandoProgramacion, setGuardandoProgramacion] = useState(false);
  // Habilitación del cierre fuera de plazo (solo super admin).
  const [habilitandoCierre, setHabilitandoCierre] = useState(false);
  // Datos de apoyo que carga el coordinador en el card "Datos": contacto en
  // sitio (nombre + teléfono) y si el edificio tiene cuarto de máquinas.
  const [openDatos, setOpenDatos] = useState(false);
  const [datosForm, setDatosForm] = useState({ contacto_nombre: '', contacto_telefono: '', cuarto_maquinas: '' });
  const [guardandoDatos, setGuardandoDatos] = useState(false);
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

  // Devuelve el servicio recién traído para que quien la llame pueda decidir con
  // el estado REAL (el `s` del closure todavía es el anterior).
  const cargar = async () => {
    setLoading(true);
    try {
      const fresco = await serviciosService.get(id);
      setS(fresco);
      return fresco;
    } finally { setLoading(false); }
  };
  useEffect(() => {
    cargar();
    tecnicosService.list().then(setTecnicos);
  }, [id]);

  // Habilita / revoca el cierre de un servicio cuyo plazo venció (solo super admin).
  const cambiarHabilitacionCierre = async (habilitar) => {
    if (habilitandoCierre) return;
    setHabilitandoCierre(true);
    try {
      await serviciosService.habilitarCierre(id, habilitar);
      toast.success(habilitar
        ? 'Cierre habilitado: el técnico ya puede registrar el cierre de este servicio'
        : 'Habilitación revocada');
      await cargar();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Error al cambiar la habilitación');
    } finally {
      setHabilitandoCierre(false);
    }
  };

  if (loading || !s) return <Loader />;

  const puedeAsignar = (esSuperAdmin || esAdmin || esCoordinador)
    && s.estado_servicio !== 'Borrador'
    && !estaServicioFinalizado(s.estado_servicio);
  // Plazo del técnico para registrar el cierre (calculado por el backend a partir
  // de la fecha programada y del parámetro SERVICIO_CIERRE_PLAZO_DIAS).
  const plazoCierre = s.plazo_cierre || null;
  // Vencido el plazo, el técnico no puede cerrar hasta que el super admin habilite
  // ESE servicio. Admin y super admin cierran siempre.
  const cierreBloqueadoTecnico = !!plazoCierre && !plazoCierre.puede_cerrar_tecnico;
  const puedeFinalizar = s.estado_servicio === 'En curso' && (esSuperAdmin || esAdmin ||
    (esTecnico && !cierreBloqueadoTecnico
      && s.asignaciones?.some(a => a.id_tecnico === user.id_tecnico && (a.responsable_documentacion || s.asignaciones.length === 1))));
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
  const tieneOt = !!(s.numero_ot || s.archivo_ot);
  // Misma regla que las guías: coordinación/admin siempre, y el técnico
  // responsable documental del servicio. Se congela tras la revisión.
  const puedeGestionarOt = (esSuperAdmin || esAdmin || esCoordinador || esTecnicoResponsable)
    && !esServicioPostRevision(s.estado_servicio);
  // Cierre sin guía: la deuda documental vive en la GUÍA, no en un estado aparte.
  const finalizadoSinGuia = s.estado_servicio === ESTADO_SERVICIO_FINALIZADO
    && (s.guias || []).every(g => g.estado_guia === ESTADO_GUIA_OBSERVADA || !g.id_archivo);
  const guiasBloqueadasPorEstado = esServicioPostRevision(s.estado_servicio);
  const puedeGestionarGuias = (esSuperAdmin || esAdmin || esCoordinador || esTecnicoResponsable) && !guiasBloqueadasPorEstado;
  // Gestión del expediente que dejó el técnico (evidencias, guías,
  // observaciones, informe): coordinación corrige lo cargado en obra hasta la
  // revisión administrativa. Espejo de backend/utils/registrosTecnico.js.
  const gestionaRegistrosTecnico = (esSuperAdmin || esAdmin || esCoordinador)
    && !esServicioPostRevision(s.estado_servicio);
  const puedeEliminarGuia = gestionaRegistrosTecnico;

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
  // Estados en los que se pueden (re)programar los días de trabajo. Incluye el
  // borrador —guarda sus días sin salir aún en la agenda— y llega hasta En curso:
  // los días ya trabajados se conservan con su evidencia.
  const ESTADOS_DURACION_EDITABLE = ['Borrador', 'Pendiente', 'Asignado', ESTADO_SERVICIO_EN_CURSO];
  // El técnico sube evidencia desde que el servicio está asignado: ese registro
  // es, además, lo que enciende "En curso".
  const puedeSubirEvidenciaDia = gestionaRegistrosTecnico
    || (esTecnico && ['Asignado', ESTADO_SERVICIO_EN_CURSO].includes(s.estado_servicio));
  // Programar / reprogramar los días de trabajo. Vale también con el servicio ya
  // En curso: los días ya trabajados se conservan con su evidencia.
  const puedeProgramar = (esSuperAdmin || esAdmin)
    && ESTADOS_DURACION_EDITABLE.includes(s.estado_servicio);

  // El coordinador (además de admin/super_admin) mantiene los datos de apoyo del
  // servicio mientras no esté cancelado: son información para el técnico, no
  // tocan precios, fechas ni estados.
  const puedeEditarDatosContacto = (esSuperAdmin || esAdmin || esCoordinador) && s.estado_servicio !== 'Cancelado';

  // Datos de sitio (contacto y cuarto de máquinas). El servicio los hereda de la
  // ficha del ascensor al crearse; si este servicio nació antes de que el
  // ascensor los tuviera —o antes de que existieran—, se muestra el de la ficha
  // marcado como tal, para que el técnico nunca se quede sin el dato.
  const ascensoresServicio = (s.ascensores || []).map(sa => sa.ascensor).filter(Boolean);
  const datoSitio = (campo) => {
    if (s[campo]) return { valor: s[campo], desdeAscensor: false };
    const fuente = ascensoresServicio.find(a => a[campo]);
    return fuente ? { valor: fuente[campo], desdeAscensor: true } : { valor: null, desdeAscensor: false };
  };
  const sitioContactoNombre = datoSitio('contacto_nombre');
  const sitioContactoTelefono = datoSitio('contacto_telefono');
  const sitioCuartoMaquinas = datoSitio('cuarto_maquinas');
  // Observaciones registradas en la ficha del ascensor: acompañan al técnico en
  // el servicio (son las que dejó quien registró el ascensor).
  const observacionesAscensores = ascensoresServicio
    .filter(a => a.observaciones)
    .map(a => ({ id: a.id, codigo: a.codigo, observaciones: a.observaciones }));
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
      responsable_documentacion: !!a.responsable_documentacion
    })) || []);
    const tramos = tramosDeServicio(s);
    setAsignarProgramacion({
      tramos: tramos.length > 0 ? tramos : [tramoDeUnDia(hoyISO())],
      hora_programada: s.hora_programada || ''
    });
    setOpenAsignar(true);
  };

  const agregarTec = () => setAsignaciones(a => [...a, { id_tecnico: '', rol_asignacion: 'Apoyo técnico', responsable_principal: false, responsable_documentacion: false }]);
  const quitarTec = (idx) => setAsignaciones(a => a.filter((_, i) => i !== idx));
  const cambiarTec = (idx, key, val) => setAsignaciones(a => actualizarFilaAsignacion(a, idx, key, val));


  const guardarAsignacion = async () => {
    const consistencia = validarConsistenciaAsignaciones(asignaciones, { requerirAlMenosUno: true });
    if (!consistencia.ok) return toast.error(consistencia.error);
    try {
      const errorProgramacion = errorDeTramos(asignarProgramacion.tramos);
      if (errorProgramacion) return toast.error(errorProgramacion);
      const r = await serviciosService.asignar(id, {
        tecnicos: asignaciones,
        dias: payloadDias(asignarProgramacion.tramos),
        hora_programada: asignarProgramacion.hora_programada || null
      });
      toast.success(r?.falta_programar
        ? 'Técnicos guardados. Falta programar los días para que quede Asignado.'
        : 'Técnicos asignados y días programados');
      setOpenAsignar(false);
      cargar();
    } catch (err) { toast.error(err.response?.data?.error || 'Error'); }
  };

  // --- Orden de trabajo -----------------------------------------------------
  const subirArchivoOtServicio = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    const fd = new FormData(); fd.append('archivo', file);
    setSubiendoOtServicio(true);
    try {
      const arch = await archivosService.upload(fd, 'ot');
      setOtForm(f => ({ ...f, id_archivo: arch.id }));
    } catch { toast.error('No se pudo subir el documento de la OT'); }
    finally { setSubiendoOtServicio(false); }
  };

  const guardarOt = async () => {
    if (guardandoOt) return;
    setGuardandoOt(true);
    try {
      await serviciosService.guardarOt(id, {
        numero_ot: otForm.numero_ot.trim(),
        id_archivo: otForm.id_archivo
      });
      toast.success('Orden de trabajo registrada');
      setOtForm({ numero_ot: '', id_archivo: null });
      cargar();
    } catch (err) {
      toast.error(err.response?.data?.error || 'No se pudo registrar la OT');
    } finally { setGuardandoOt(false); }
  };

  const quitarOt = async () => {
    if (!window.confirm('¿Quitar la OT registrada? Podrás volver a subirla.')) return;
    try {
      await serviciosService.eliminarOt(id);
      toast.success('OT retirada');
      cargar();
    } catch (err) { toast.error(err.response?.data?.error || 'No se pudo quitar la OT'); }
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

  // El cierre no vuelve a pedir nada: las fotos, la guía y la OT se registran
  // durante el servicio, en sus propias secciones. Aquí todos los campos son
  // opcionales; lo único que se sigue exigiendo al técnico es tener la OT
  // cargada, porque es el documento que arrastra el circuito administrativo.
  const requiereOt = esTecnico && !(esSuperAdmin || esAdmin);
  const otOk = !requiereOt || tieneOt;

  // Finalizar abre primero la PREVISUALIZACIÓN del informe: el técnico revisa lo
  // que va a salir y corrige los textos. El PDF se emite al confirmar allí.
  const iniciarFinalizacion = () => setOpenInforme(true);

  const generarInformeYContinuar = async (textos) => {
    if (generandoInforme) return;
    setGenerandoInforme(true);
    try {
      await serviciosService.generarInformeFinalizacion(id, { textos });
      const fresco = await cargar();
      // Otro usuario (o el propio técnico desde su equipo) pudo finalizarlo
      // mientras esta pantalla estaba abierta: no se abre el modal de cierre.
      if (estaServicioFinalizado(fresco?.estado_servicio)) {
        toast.error(`El servicio ya fue finalizado (${fresco.estado_servicio})`);
        setOpenInforme(false);
        return;
      }
      setOpenInforme(false);
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
    if (!otOk) { toast.error('Registre la OT en su sección antes de finalizar'); return; }
    setGuardandoFinalizar(true);
    try {
      await serviciosService.finalizar(id, {
        ...finalizarForm,
      });
      toast.success('Servicio finalizado');
      setOpenFinalizar(false);
      setEvidenciasFinalizar([]);
      setArchivoOtFinalizar(null);
      setFinalizarForm({ observaciones_tecnicas: '', descargo_tecnico: '', codigo_guia: '', id_archivo_guia: null, finalizar_observado: false });
      cargar();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Error');
      // 409 = el servicio ya lo finalizó otro usuario (o esta misma pantalla
      // quedó desactualizada). Se cierra el modal y se recarga para que el
      // estado real se refleje y el botón "Finalizar" desaparezca.
      if (err.response?.status === 409) {
        setOpenFinalizar(false);
        cargar();
      }
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

  // Programar / reprogramar los DÍAS DE TRABAJO. Un trabajo puede ocupar un rango
  // de fechas, días sueltos (10, 15 y 20) o una combinación de ambos; el técnico
  // solo verá esos días en su calendario. Los servicios aprobados desde una
  // cotización nacen sin fecha: aquí se define por primera vez.
  const abrirProgramacion = () => {
    const tramos = tramosDeServicio(s);
    setProgramacionForm({
      tramos: tramos.length > 0 ? tramos : [tramoDeUnDia(hoyISO())],
      hora_programada: s.hora_programada || ''
    });
    setOpenProgramacion(true);
  };

  const guardarProgramacion = async (confirmar = false) => {
    const error = errorDeTramos(programacionForm.tramos);
    if (error) return toast.error(error);
    if (guardandoProgramacion) return;
    setGuardandoProgramacion(true);
    try {
      await serviciosService.cambiarProgramacion(id, {
        dias: payloadDias(programacionForm.tramos),
        hora_programada: programacionForm.hora_programada || null,
        confirmar
      });
      toast.success('Programación actualizada');
      setOpenProgramacion(false);
      cargar();
    } catch (err) {
      const data = err.response?.data;
      // Quitar días ya trabajados exige confirmación explícita del usuario.
      if (err.response?.status === 409 && data?.requiere_confirmacion) {
        const lista = (data.dias_con_evidencia || []).map(d => `Día ${d.orden}`).join(', ');
        if (window.confirm(`La nueva programación dará de baja días que ya tienen evidencia (${lista}). La evidencia se conserva, pero esos días salen de la agenda. ¿Continuar?`)) {
          setGuardandoProgramacion(false);
          return guardarProgramacion(true);
        }
      } else {
        toast.error(data?.error || 'Error al guardar la programación');
      }
    } finally {
      setGuardandoProgramacion(false);
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

  // Acción que el usuario ha venido a hacer en esta pantalla, según su rol y el
  // estado del servicio. Solo se usa para el botón flotante de móvil: en la
  // cabecera siguen apareciendo todas, esta es un atajo, no un recorte.
  const accionPrincipalMovil =
      puedeFinalizar ? { texto: 'Finalizar', onClick: iniciarFinalizacion, icono: ICONO_CHECK }
    : puedeRevisar   ? { texto: 'Revisar',   onClick: () => abrirRevisar('aprobado'), icono: ICONO_CHECK }
    : puedePromover  ? { texto: 'Promover',  onClick: promover, icono: ICONO_CHECK }
    : (puedeAsignar && !s.asignaciones?.length)
                     ? { texto: 'Asignar',   onClick: iniciarAsignar, icono: ICONO_USUARIO }
    : null;

  return (
    <>
      <PageHeader title={`${s.codigo} · ${s.titulo}`}
        subtitle={`${nombreCliente(s.cliente)} · ${resumenAscensores(s)} · ${s.tipo_servicio?.nombre}`}
        actions={
          <>
            <button type="button" onClick={volver} className="btn-secondary">← Volver</button>
            {puedeEditarServicio && <button type="button" onClick={() => navigate(`/servicios?edit=${s.id}`)} className="btn-secondary">Editar</button>}
            {puedeProgramar && (
              <button type="button" onClick={abrirProgramacion} className={s.fecha_programada ? 'btn-secondary' : 'btn-primary'}>
                {s.fecha_programada ? `Reprogramar (${dias.length || s.duracion_dias || 1} día${(dias.length || s.duracion_dias || 1) > 1 ? 's' : ''})` : 'Programar días'}
              </button>
            )}
            {esMantenimientoDePlan && (esSuperAdmin || esAdmin) && (
              <Link to="/mantenimientos" className="btn-secondary">Ver plan</Link>
            )}
            {puedePromover && <button onClick={promover} className="btn-primary">Promover borrador</button>}
            {puedeAsignar && <button onClick={iniciarAsignar} className="btn-secondary">Asignar y programar</button>}
            {puedeFinalizar && (
              <button
                onClick={iniciarFinalizacion}
                title="Se abre la previsualización del informe para revisarlo antes de emitirlo"
                className="btn-primary">
                Finalizar
              </button>
            )}
            {puedeRevisar && <button onClick={() => abrirRevisar('aprobado')} className="btn-primary">Aprobar revisión</button>}
            {puedeRevisar && <button onClick={() => abrirRevisar('observado')} className="btn-secondary !text-ember-700 !border-ember-200">Observar</button>}
            {puedeRevisar && <button onClick={() => abrirRevisar('rechazado')} className="btn-secondary !text-rose-700 !border-rose-200">Rechazar</button>}
            {puedeGestionarEntregas && <button onClick={() => setOpenEntrega(true)} className="btn-secondary">+ Entrega</button>}
            {(esSuperAdmin || esAdmin) && !['Cerrado', 'Cancelado'].includes(s.estado_servicio) && <button onClick={cancelar} className="btn-danger">Cancelar</button>}
          </>
        } />

      {/* Plazo de cierre vencido: el técnico queda bloqueado hasta que el super
          administrador habilite el cierre de este servicio. La alerta de
          cotización urgente se agenda igual en la fecha PROGRAMADA, no en la de
          cierre, para que nunca caiga en domingo. */}
      {plazoCierre?.vencido && s.estado_servicio === 'En curso' && (
        <div className={`card mb-5 border-l-4 ${plazoCierre.habilitado ? 'border-l-emerald-500' : 'border-l-amber-500'}`}>
          <div className="card-body flex flex-wrap items-center justify-between gap-3">
            <div className="text-sm">
              <div className="font-medium text-carbon-800">
                {plazoCierre.habilitado
                  ? 'Cierre fuera de plazo habilitado'
                  : `Plazo de cierre vencido hace ${plazoCierre.dias_vencido} día(s)`}
              </div>
              <div className="text-xs text-carbon-500 mt-0.5">
                El técnico tenía hasta el {formatFecha(plazoCierre.fecha_limite)} ({plazoCierre.plazo_dias} día(s) desde la fecha programada).
                {plazoCierre.habilitado
                  ? ' El super administrador habilitó el cierre: el permiso se consume al finalizar el servicio.'
                  : ' Solo el super administrador puede habilitar el cierre de este servicio.'}
              </div>
            </div>
            {esSuperAdmin && (
              <button
                type="button"
                onClick={() => cambiarHabilitacionCierre(!plazoCierre.habilitado)}
                disabled={habilitandoCierre}
                className={`${plazoCierre.habilitado ? 'btn-secondary' : 'btn-primary'} disabled:opacity-50`}>
                {habilitandoCierre
                  ? 'Guardando…'
                  : plazoCierre.habilitado ? 'Revocar habilitación' : 'Habilitar cierre'}
              </button>
            )}
          </div>
        </div>
      )}

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
              {/* Distintivo del cierre sin guía: mismo estado "Finalizado", pero
                  reconocible de un vistazo y completable desde la tarjeta de guías. */}
              {finalizadoSinGuia && (
                <span className="badge-amber" title="Se finalizó sin guía de salida. Cárgala en la tarjeta «Guía de salida» para completarlo.">
                  Sin guía
                </span>
              )}
              {s.estado_servicio === ESTADO_SERVICIO_FINALIZADO && !tieneOt && (
                <span className="badge-amber" title="Se finalizó sin orden de trabajo.">Sin OT</span>
              )}
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
            <Info label="Días de trabajo" value={dias.length > 0
              ? <span title={resumenProgramacion(dias.map(d => d.fecha))}>
                  {`${dias.length} día${dias.length > 1 ? 's' : ''}`}
                  <span className="block text-[11px] text-slate-500">{resumenProgramacion(dias.map(d => d.fecha))}</span>
                </span>
              : `${s.duracion_dias || 1} día${(s.duracion_dias || 1) > 1 ? 's' : ''}`} />
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
              (sitioContactoNombre.valor || sitioContactoTelefono.valor)
                ? <div className="space-y-0.5">
                    {sitioContactoNombre.valor && <div>{sitioContactoNombre.valor}</div>}
                    {sitioContactoTelefono.valor && (
                      <a href={`tel:${sitioContactoTelefono.valor}`} className="text-brand-700 hover:underline font-mono text-xs">
                        {sitioContactoTelefono.valor}
                      </a>
                    )}
                    {(sitioContactoNombre.desdeAscensor || sitioContactoTelefono.desdeAscensor) && (
                      <div className="text-[10px] text-slate-400">De la ficha del ascensor</div>
                    )}
                    <AccionDato onClick={iniciarEditarDatos} habilitado={puedeEditarDatosContacto} texto="Editar" />
                  </div>
                : <AccionDato onClick={iniciarEditarDatos} habilitado={puedeEditarDatosContacto} texto="+ Agregar" />
            } />
            <Info label="Cuarto de máquinas" value={
              sitioCuartoMaquinas.valor
                ? <div className="space-y-0.5">
                    <div>
                      <span className={sitioCuartoMaquinas.valor === 'Si' ? 'badge-green' : 'badge-gray'}>
                        {sitioCuartoMaquinas.valor === 'Si' ? 'Sí' : 'No'}
                      </span>
                    </div>
                    {sitioCuartoMaquinas.desdeAscensor && (
                      <div className="text-[10px] text-slate-400">De la ficha del ascensor</div>
                    )}
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
            {/* Observaciones registradas en la ficha del ascensor: el técnico las
                necesita en sitio tanto como las del servicio. */}
            {observacionesAscensores.length > 0 && (
              <Info label="Observaciones del ascensor" cols={2} value={
                <div className="space-y-1">
                  {observacionesAscensores.map(a => (
                    <div key={a.id}>
                      {observacionesAscensores.length > 1 && (
                        <span className="font-mono text-xs text-slate-500 mr-1">{a.codigo}:</span>
                      )}
                      {a.observaciones}
                    </div>
                  ))}
                </div>
              } />
            )}
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
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* FICHA TÉCNICA de cada ascensor del servicio: marca, modelo, capacidad,
            cuarto de máquinas, contacto en sitio y cómo llegar. Es lo que el
            técnico necesita antes de subir a la obra y lo que el coordinador
            consulta al programar, sin tener que salir a la pantalla de
            Ascensores (a la que además el técnico no entra). Es el mismo
            componente que usa el historial del ascensor. */}
        {(s.ascensores || []).filter(sa => sa.ascensor).map(sa => (
          <FichaTecnicaAscensor
            key={sa.ascensor.id}
            ascensor={sa.ascensor}
            titulo={`Ficha técnica · ${sa.ascensor.codigo}`}
            // El mini-mapa ya está en la card de datos del servicio; aquí basta
            // con la dirección y el acceso directo a Google Maps.
            mostrarMapa={false}
            className="card" />
        ))}

        {/* Adjuntos de la cotización de origen: SOLO para roles con visibilidad
            financiera. Son el expediente comercial del acuerdo (cotización
            firmada, orden de compra, presupuestos); el Coordinador y el técnico
            reciben únicamente el alcance del trabajo —los ítems y sus fotos, en
            el bloque siguiente—. El backend ya se los envía vacío: esto solo
            evita pintar una tarjeta sin contenido. */}
        {(() => {
          if (!puedeVerPrecio) return null;
          const visibles = (s.cotizacion?.archivos || []).filter(a => a.archivo);
          const esImagen = a => (a.archivo.mime_type || '').startsWith('image/');
          if (visibles.length === 0) return null;
          return (
            <div className="card lg:col-span-3">
              <div className="card-header">
                <h3 className="card-title">Adjuntos de la cotización · {visibles.length}</h3>
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

        {/* Antecedentes del EQUIPO: otros correctivos del mismo ascensor. Solo
            aparece en servicios correctivos, que es cuando el historial de
            fallas del equipo es lo que orienta el diagnóstico. El backend lo
            adjunta ya aplanado en `historial_correctivos_ascensor`. */}
        {Array.isArray(s.historial_correctivos_ascensor) && (() => {
          const previos = s.historial_correctivos_ascensor;
          const codigoAscensor = s.correctivo?.id_ascensor
            ? (s.ascensores || []).find(sa => sa.ascensor?.id === s.correctivo.id_ascensor)?.ascensor?.codigo
            : null;
          return (
            <div className="card lg:col-span-3">
              <div className="card-header">
                <h3 className="card-title">
                  Historial de correctivos de este ascensor
                  {codigoAscensor && <span className="ml-2 font-mono text-xs text-slate-500">{codigoAscensor}</span>}
                  <span className="ml-2 text-xs text-slate-500 font-normal">· {previos.length}</span>
                </h3>
              </div>
              <div className="card-body">
                {previos.length === 0 ? (
                  <p className="text-sm text-slate-500">
                    Es el primer correctivo registrado para este ascensor.
                  </p>
                ) : (
                  <>
                    <p className="text-xs text-slate-500 mb-3">
                      Fallas reportadas antes en el mismo equipo y lo que se hizo en cada una.
                    </p>
                    <ul className="space-y-2">
                      {previos.map(c => (
                        <li key={c.id} className="rounded-lg ring-1 ring-slate-100 p-3">
                          <div className="flex flex-wrap items-center gap-2 text-xs">
                            <span className="text-slate-500">
                              {formatFecha(c.fecha_realizacion || c.fecha_reporte)}
                            </span>
                            {c.codigo && (
                              // El técnico solo abre los servicios donde está
                              // asignado: para el resto se muestra el código sin enlace.
                              esTecnico
                                ? <span className="font-mono text-slate-700">{c.codigo}</span>
                                : <Link to={`/servicios/${c.id_servicio}`} className="font-mono text-brand-700 hover:underline">{c.codigo}</Link>
                            )}
                            <span className={badgeEstado(c.estado_correctivo)}>{c.estado_correctivo}</span>
                            {c.nivel_urgencia && (
                              <span className={`text-[10px] ${c.nivel_urgencia === 'alta' ? 'badge-red' : 'badge-amber'}`}>{c.nivel_urgencia}</span>
                            )}
                            {c.tecnicos.length > 0 && (
                              <span className="text-slate-400 truncate">· {c.tecnicos.join(', ')}</span>
                            )}
                          </div>
                          <div className="text-sm text-slate-800 mt-1 break-words">
                            <span className="text-slate-400 text-xs uppercase tracking-wide">Falla: </span>
                            {c.falla || '—'}
                          </div>
                          {c.descargo_tecnico && (
                            <div className="text-xs text-slate-600 mt-1 break-words">
                              <span className="text-slate-400 uppercase tracking-wide">Descargo: </span>
                              {c.descargo_tecnico}
                            </div>
                          )}
                          {c.observaciones_tecnicas && (
                            <div className="text-xs text-slate-600 mt-1 break-words">
                              <span className="text-slate-400 uppercase tracking-wide">Observaciones: </span>
                              {c.observaciones_tecnicas}
                            </div>
                          )}
                        </li>
                      ))}
                    </ul>
                  </>
                )}
              </div>
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

        {/* ORDEN DE TRABAJO. Junto a la guía de salida y con el mismo peso: es el
            documento que el técnico trae firmado de la obra. Se sube aquí, durante
            la ejecución, y de aquí lo toman el cierre, Contabilidad y los cobros. */}
        <div className="card">
          <div className="card-header">
            <h3 className="card-title">Orden de trabajo</h3>
            {tieneOt
              ? <span className="badge-green">Registrada</span>
              : <span className="badge-amber">Pendiente</span>}
          </div>
          <div className="card-body space-y-3">
            {tieneOt ? (
              <>
                <div>
                  <div className="text-[10px] uppercase tracking-wider text-slate-400">N° OT</div>
                  <div className="font-mono text-sm text-slate-800">{s.numero_ot || '—'}</div>
                </div>
                {s.archivo_ot && (() => {
                  const arch = s.archivo_ot;
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
                {s.ot_subida_en && (
                  <p className="text-[11px] text-slate-400">Registrada el {formatFechaHora(s.ot_subida_en)}</p>
                )}
                {puedeGestionarOt && (
                  <button type="button" onClick={quitarOt} className="text-xs text-rose-600 hover:underline">
                    Quitar OT y volver a subirla
                  </button>
                )}
              </>
            ) : (
              <p className="text-sm text-slate-500">
                Aún no se ha registrado la orden de trabajo.
                {esTecnico && ' Es obligatoria para poder finalizar el servicio.'}
              </p>
            )}

            {puedeGestionarOt && !tieneOt && (
              <div className="space-y-2 border-t border-slate-100 pt-3">
                <div>
                  <label className="label">N° de OT *</label>
                  <input className="input" value={otForm.numero_ot} placeholder="Ej. OT-2026-0123"
                    onChange={e => setOtForm(f => ({ ...f, numero_ot: e.target.value }))} />
                </div>
                <div>
                  <label className="label">Documento de la OT *</label>
                  <input type="file" className="input" accept="image/*,.pdf"
                    disabled={subiendoOtServicio} onChange={subirArchivoOtServicio} />
                  {subiendoOtServicio && <p className="text-xs text-slate-500 mt-1">Subiendo…</p>}
                  {otForm.id_archivo && !subiendoOtServicio && (
                    <p className="text-xs text-emerald-700 mt-1">✓ Documento cargado</p>
                  )}
                </div>
                <button type="button" onClick={guardarOt}
                  disabled={guardandoOt || !otForm.numero_ot.trim() || !otForm.id_archivo}
                  className="btn-primary text-xs disabled:opacity-50 disabled:cursor-not-allowed">
                  {guardandoOt ? 'Guardando…' : 'Registrar OT'}
                </button>
              </div>
            )}
          </div>
        </div>

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
          // El técnico sube mientras ejecuta; coordinación y administración
          // pueden además corregir después, hasta la revisión administrativa.
          const puedeGestionar = gestionaRegistrosTecnico
            || (esTecnico && !estaServicioFinalizado(s.estado_servicio));
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
                <>
                <div className="hidden sm:block overflow-x-auto scroll-thin">
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
                {/* Móvil: las cinco columnas no caben sin arrastrar; cada entrega
                    pasa a ser una tarjeta con la misma información y el mismo
                    acceso al archivo. */}
                <ul className="sm:hidden space-y-2.5">
                  {s.entregas.map(en => (
                    <li key={en.id} className="rounded-lg ring-1 ring-slate-200 p-3">
                      <div className="flex items-start justify-between gap-2 flex-wrap">
                        <span className="badge-blue">{en.tipo_entrega}</span>
                        <span className={badgeEstado(en.estado_entrega)}>{en.estado_entrega}</span>
                      </div>
                      <div className="text-xs text-slate-500 mt-1.5">{formatFecha(en.fecha_entrega)}</div>
                      {en.descripcion && <p className="text-sm text-slate-800 mt-1 break-words">{en.descripcion}</p>}
                      {en.archivo && (
                        <FileLink archivo={en.archivo} className="text-brand-700 text-xs hover:underline mt-1.5 inline-block">
                          📎 Ver archivo
                        </FileLink>
                      )}
                    </li>
                  ))}
                </ul>
                </>
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

      <Modal open={openAsignar} onClose={() => setOpenAsignar(false)} title="Asignar técnicos y programar" size="xl"
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
                  <th className="table-th"></th>
                </tr></thead>
                <tbody className="divide-y divide-slate-100">
                  {asignaciones.length === 0 && <tr><td colSpan="5" className="table-td text-center text-slate-400 py-4">Agregue técnicos</td></tr>}
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
                      <td className="table-td text-right"><button onClick={() => quitarTec(idx)} className="text-rose-600 text-xs">Quitar</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="border-t border-slate-100 pt-4">
            {/* Un servicio queda "Asignado" cuando tiene técnico Y fecha: por eso
                la programación se decide aquí mismo y no en otra pantalla. */}
            <ProgramacionDias
              tramos={asignarProgramacion.tramos}
              onChange={tramos => setAsignarProgramacion(f => ({ ...f, tramos }))}
              ayuda="El servicio pasa a «Asignado» cuando tiene técnico y días programados. Rango, días sueltos o ambos." />
            <div className="mt-3 w-40">
              <label className="label">Hora</label>
              <input type="time" className="input" value={asignarProgramacion.hora_programada}
                onChange={e => setAsignarProgramacion(f => ({ ...f, hora_programada: e.target.value }))} />
            </div>
          </div>
        </div>
      </Modal>

      <InformePreviewModal
        open={openInforme}
        onClose={() => setOpenInforme(false)}
        idServicio={id}
        generando={generandoInforme}
        onConfirmar={generarInformeYContinuar} />

      <Modal open={openFinalizar} onClose={() => !guardandoFinalizar && setOpenFinalizar(false)} title="Finalizar servicio" size="lg"
        footer={<>
          <button type="button" className="btn-secondary" onClick={() => setOpenFinalizar(false)} disabled={guardandoFinalizar}>Cancelar</button>
          <button type="submit" form="form-finalizar" className="btn-primary" disabled={guardandoFinalizar || !otOk}>
            {guardandoFinalizar ? 'Finalizando…' : 'Finalizar'}
          </button>
        </>}>
        <form id="form-finalizar" onSubmit={finalizar} className="space-y-4">
          <div><label className="label">Observaciones técnicas</label><textarea className="textarea" rows="3" value={finalizarForm.observaciones_tecnicas} onChange={e => setFinalizarForm(f => ({ ...f, observaciones_tecnicas: e.target.value }))} /></div>
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

          {/* La OT ya no se adjunta al cerrar: se registra en su propia sección,
              junto a la guía. Aquí solo se refleja si está o si falta. */}
          <div className="border-t border-slate-100 pt-4">
            <label className="label">Orden de trabajo</label>
            {tieneOt ? (
              <p className="text-xs text-emerald-700">
                ✓ OT <span className="font-mono">{s.numero_ot}</span> registrada.
              </p>
            ) : (
              <p className={`text-xs ${requiereOt ? 'text-rose-600' : 'text-amber-700'}`}>
                Todavía no hay OT registrada.{requiereOt && ' Como técnico, debe registrarla en la sección "Orden de trabajo" antes de finalizar.'}
              </p>
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

      <Modal open={openProgramacion} onClose={() => !guardandoProgramacion && setOpenProgramacion(false)}
        title={s.fecha_programada ? 'Reprogramar días de trabajo' : 'Programar días de trabajo'}
        size="lg"
        footer={<>
          <button className="btn-secondary" onClick={() => setOpenProgramacion(false)} disabled={guardandoProgramacion}>Cancelar</button>
          <button className="btn-primary" onClick={() => guardarProgramacion(false)} disabled={guardandoProgramacion}>Guardar</button>
        </>}>
        <div className="space-y-4">
          <p className="text-xs text-carbon-500">
            Define qué días se ejecutará el trabajo. Puede ser un rango de fechas, días
            sueltos (por ejemplo el 10, el 15 y el 20) o una combinación de ambos. Al
            guardar, esos días —y solo esos— aparecen en el calendario del técnico.
          </p>
          <ProgramacionDias
            tramos={programacionForm.tramos}
            disabled={guardandoProgramacion}
            onChange={tramos => setProgramacionForm(f => ({ ...f, tramos }))} />
          <div className="w-40">
            <label className="label">Hora</label>
            <input type="time" className="input" value={programacionForm.hora_programada}
              disabled={guardandoProgramacion}
              onChange={e => setProgramacionForm(f => ({ ...f, hora_programada: e.target.value }))} />
          </div>
          <p className="text-[11px] text-carbon-500">
            Los días ya trabajados conservan su evidencia. Si la nueva programación deja
            fuera alguno que ya la tiene, se pedirá confirmación.
          </p>
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
          {/* El cierre sin guía dejó de ser un estado del servicio: ahora vive
              en el estado de la GUÍA (ver utils/estadoServicio.js). */}
          <p className="text-[11px] text-slate-500">
            Un servicio cerrado sin guía la deja en <strong>{ESTADO_GUIA_OBSERVADA}</strong>.
            Al cargar el archivo pasa a <strong>{ESTADO_GUIA_ADJUNTA}</strong> y queda regularizada.
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
            El técnico asignado se gestiona desde <strong>Asignar y programar</strong> y se muestra en este mismo card.
          </p>
        </form>
      </Modal>

      {/* ACCIÓN PRINCIPAL EN MÓVIL.
          Esta pantalla es larguísima: checklist, dos galerías de evidencias,
          observaciones, historial… Después de documentar el trabajo, el técnico
          tenía que volver hasta el encabezado para pulsar "Finalizar". El botón
          flotante lo deja siempre a mano, por encima de la nav inferior. En
          escritorio no aparece: allí la cabecera está a la vista. */}
      {accionPrincipalMovil && (
        <div className="lg:hidden fixed right-4 z-30 [bottom:calc(5.75rem+env(safe-area-inset-bottom,0px))]">
          <button
            type="button"
            onClick={accionPrincipalMovil.onClick}
            className="btn-primary !rounded-full !px-5 shadow-lifted animate-rise-sm">
            {accionPrincipalMovil.icono}
            {accionPrincipalMovil.texto}
          </button>
        </div>
      )}
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
