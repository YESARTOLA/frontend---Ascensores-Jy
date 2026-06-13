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
import MapaUbicacion from '../components/common/MapaUbicacion.jsx';
import { coordsDe, linkGoogleMaps } from '../utils/mapa.js';

const ROLES_ASIG = ['Responsable principal', 'Apoyo técnico', 'Especialista', 'Supervisor técnico'];
const TIPOS_ITEM = ['Herramienta', 'Material', 'Equipo', 'Repuesto', 'Otro'];
const UNIDADES = ['Unidad', 'Metro', 'Caja', 'Bolsa', 'Litro', 'Juego', 'Otro'];
const TIPOS_EVIDENCIA = ['Foto', 'Video', 'Documento', 'Otro'];
const TIPOS_ENTREGA = ['Entrega parcial', 'Entrega final', 'Entrega documental', 'Entrega técnica'];
const ESTADOS_ENTREGA = ['Pendiente', 'Entregada', 'Observada', 'Aprobada'];

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
  const [openChecklist, setOpenChecklist] = useState(false);
  const [plantillaCheck, setPlantillaCheck] = useState(null);
  const [respuestasCheck, setRespuestasCheck] = useState({});
  const [guardandoCheck, setGuardandoCheck] = useState(false);
  const guardandoCheckRef = useRef(false);
  const [openEntrega, setOpenEntrega] = useState(false);
  const [openEvidencia, setOpenEvidencia] = useState(false);
  const [asignaciones, setAsignaciones] = useState([]);
  const [items, setItems] = useState([]);
  const [finalizarForm, setFinalizarForm] = useState({ observaciones_tecnicas: '', descargo_tecnico: '', codigo_guia: '', id_archivo_guia: null, finalizar_observado: false, numero_ot: '', id_archivo_ot: null });
  const [archivoOtFinalizar, setArchivoOtFinalizar] = useState(null); // { id, nombre_original, ruta_almacenamiento, mime_type }
  const [subiendoOt, setSubiendoOt] = useState(false);
  const [evidenciasFinalizar, setEvidenciasFinalizar] = useState([]); // [{ id, nombre_original, ruta_almacenamiento, mime_type }]
  const [subiendoEvidencia, setSubiendoEvidencia] = useState(false);
  const [guardandoFinalizar, setGuardandoFinalizar] = useState(false);
  const filePreview = useFilePreview();
  const [entregaForm, setEntregaForm] = useState({ tipo_entrega: 'Entrega final', fecha_entrega: hoyISO(), descripcion: '', id_archivo: null, estado_entrega: 'Entregada' });
  const [evidenciaForm, setEvidenciaForm] = useState({ tipo_evidencia: 'Foto', descripcion: '', id_archivo: null });
  const [subiendoEvidenciaArchivo, setSubiendoEvidenciaArchivo] = useState(false);
  const [openProgramar, setOpenProgramar] = useState(false);
  const [programarForm, setProgramarForm] = useState({ fecha_programada: '', hora_programada: '' });
  const [guardandoProgramar, setGuardandoProgramar] = useState(false);
  const [openGuia, setOpenGuia] = useState(false);
  const [guiaEditando, setGuiaEditando] = useState(null); // null = modo crear; objeto guía = modo editar
  const [guiaForm, setGuiaForm] = useState({ codigo_guia: '', id_archivo: null, archivo: null, observaciones_tecnicas: '', estado_guia: ESTADO_GUIA_OBSERVADA });
  const [subiendoArchivoGuia, setSubiendoArchivoGuia] = useState(false);
  const [guardandoGuia, setGuardandoGuia] = useState(false);
  const guardandoGuiaRef = useRef(false);
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
  const puedeEditarServicio = (esSuperAdmin || esAdmin) && esServicioEditable(s.estado_servicio);
  const esTecnicoResponsable = esTecnico && s.asignaciones?.some(a =>
    a.id_tecnico === user.id_tecnico && (a.responsable_documentacion || s.asignaciones.length === 1));
  const guiasBloqueadasPorEstado = esServicioPostRevision(s.estado_servicio);
  const puedeGestionarGuias = (esSuperAdmin || esAdmin || esCoordinador || esTecnicoResponsable) && !guiasBloqueadasPorEstado;
  const puedeEliminarGuia = (esSuperAdmin || esAdmin) && !guiasBloqueadasPorEstado;
  const checklist = s.checklists?.[0];

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
    // Si ya hay un checklist con PDF generado, saltar el paso de checklist y
    // abrir directo el modal de "Finalizar" (datos: guía, OT, evidencias).
    if (s.finalizacion_checklist?.id_archivo_pdf) {
      setOpenFinalizar(true);
      return;
    }
    try {
      const { plantilla, categoria } = await serviciosService.obtenerPlantillaFinalizacion(id);
      setPlantillaCheck({ categoria, plantilla });
      // Inicializar respuestas en blanco (sin valor) para forzar elección.
      const init = {};
      (plantilla.items || []).forEach(it => { init[it.id] = { respuesta: '', nota: '' }; });
      setRespuestasCheck(init);
      setOpenChecklist(true);
    } catch (err) {
      toast.error(err.response?.data?.error || 'No se pudo cargar la plantilla de checklist');
    }
  };

  const setRespuesta = (idItem, key, val) => {
    setRespuestasCheck(prev => ({ ...prev, [idItem]: { ...prev[idItem], [key]: val } }));
  };

  const guardarChecklistFin = async (e) => {
    if (e?.preventDefault) e.preventDefault();
    if (guardandoCheckRef.current) return;
    const items = plantillaCheck?.plantilla?.items || [];
    for (const it of items) {
      const r = respuestasCheck[it.id];
      if (!r || !r.respuesta) {
        toast.error(`Falta responder: "${it.texto}"`);
        return;
      }
    }
    guardandoCheckRef.current = true;
    setGuardandoCheck(true);
    try {
      const payload = {
        respuestas: items.map(it => ({
          id_item: it.id,
          respuesta: respuestasCheck[it.id].respuesta,
          nota: respuestasCheck[it.id].nota?.trim() || null
        }))
      };
      await serviciosService.guardarFinalizacion(id, payload);
      toast.success('Checklist completado. Continúe con la guía y evidencias.');
      setOpenChecklist(false);
      await cargar();
      setOpenFinalizar(true);
    } catch (err) {
      toast.error(err.response?.data?.error || 'Error al guardar el checklist');
    } finally {
      guardandoCheckRef.current = false;
      setGuardandoCheck(false);
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

  const guardarEvidencia = async () => {
    if (!evidenciaForm.id_archivo) return toast.error('Adjunte un archivo');
    try {
      await evidenciasGuiasService.subirEvidencia(id, evidenciaForm);
      toast.success('Evidencia agregada');
      setOpenEvidencia(false);
      setEvidenciaForm({ tipo_evidencia: 'Foto', descripcion: '', id_archivo: null });
      cargar();
    } catch (err) { toast.error(err.response?.data?.error || 'Error'); }
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

  const revisar = async (resultado = 'aprobado') => {
    const pedirMotivo = resultado !== 'aprobado';
    const observaciones = prompt(
      pedirMotivo ? 'Motivo (obligatorio para observar/rechazar):' : 'Observaciones de la revisión (opcional):'
    );
    if (pedirMotivo && !String(observaciones || '').trim()) {
      return toast.error('Debe indicar el motivo al observar o rechazar');
    }
    try {
      await serviciosService.revisar(id, { resultado, observaciones: observaciones || '' });
      toast.success(
        resultado === 'aprobado' ? 'Servicio aprobado y habilitado para cobro'
        : resultado === 'observado' ? 'Servicio observado y devuelto a corrección'
        : 'Servicio rechazado y devuelto a corrección'
      );
      cargar();
    } catch (err) { toast.error(err.response?.data?.error || 'Error'); }
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
            {puedeEditarServicio && <button type="button" onClick={abrirProgramar} className={s.fecha_programada ? 'btn-secondary' : 'btn-primary'}>{s.fecha_programada ? 'Reprogramar' : 'Programar fecha'}</button>}
            {puedePromover && <button onClick={promover} className="btn-primary">Promover borrador</button>}
            {puedeAsignar && <button onClick={iniciarAsignar} className="btn-secondary">Asignar / Checklist</button>}
            {puedeIniciar && s.estado_servicio === 'Listo para salida' && <button onClick={() => iniciarAccion('en_camino')} className="btn-secondary">En camino</button>}
            {puedeIniciar && ['Listo para salida', 'En camino'].includes(s.estado_servicio) && <button onClick={() => iniciarAccion('iniciar_servicio')} className="btn-primary">Iniciar servicio</button>}
            {puedeFinalizar && <button onClick={iniciarFinalizacion} className="btn-primary">Finalizar</button>}
            {puedeRevisar && <button onClick={() => revisar('aprobado')} className="btn-primary">Aprobar revisión</button>}
            {puedeRevisar && <button onClick={() => revisar('observado')} className="btn-secondary !text-amber-700 !border-amber-200">Observar</button>}
            {puedeRevisar && <button onClick={() => revisar('rechazado')} className="btn-secondary !text-rose-700 !border-rose-200">Rechazar</button>}
            {puedeGestionarEntregas && <button onClick={() => setOpenEntrega(true)} className="btn-secondary">+ Entrega</button>}
            {(esSuperAdmin || esAdmin) && !['Cerrado', 'Cancelado'].includes(s.estado_servicio) && <button onClick={cancelar} className="btn-danger">Cancelar</button>}
          </>
        } />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <div className="card">
          <div className="card-header"><h3 className="card-title">Datos</h3><span className={badgeEstado(s.estado_servicio)}>{s.estado_servicio}</span></div>
          <div className="card-body grid grid-cols-2 gap-3 text-sm">
            <Info label="Tipo" value={s.tipo_registro} />
            <Info label="Origen" value={
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
            } />
            <Info label="Fecha programada" value={s.fecha_programada
              ? `${formatFecha(s.fecha_programada)} ${s.hora_programada || ''}`.trim()
              : <span className="text-amber-600">Sin programar</span>} />
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

        <div className="card lg:col-span-2">
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
        </div>

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

        <div className="card lg:col-span-3">
          <div className="card-header">
            <h3 className="card-title">Evidencias del trabajo · {s.evidencias?.length || 0}</h3>
            {(esTecnico || esSuperAdmin || esAdmin) && !estaServicioFinalizado(s.estado_servicio) && (
              <button onClick={() => setOpenEvidencia(true)} className="btn-secondary">+ Evidencia</button>
            )}
          </div>
          <div className="card-body">
            {!s.evidencias?.length ? <p className="text-sm text-slate-500">Sin evidencias registradas.</p> : (
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
                {s.evidencias.map(ev => {
                  const ruta = ev.archivo?.ruta_almacenamiento;
                  const mime = ev.archivo?.mime_type || '';
                  const esImagen = mime.startsWith('image/');
                  const esVideo = mime.startsWith('video/');
                  const url = ruta ? assetUrl(ruta) : null;
                  return (
                    <div key={ev.id} className="rounded-lg ring-1 ring-slate-100 overflow-hidden bg-white text-sm">
                      <div className="relative aspect-square bg-slate-50">
                        {url && esImagen ? (
                          <button type="button" onClick={() => filePreview.open(ev.archivo)} className="block w-full h-full">
                            <img src={url} alt={ev.descripcion || ev.archivo.nombre_original} className="w-full h-full object-cover hover:scale-105 transition" />
                          </button>
                        ) : url && esVideo ? (
                          <button type="button" onClick={() => filePreview.open(ev.archivo)} className="relative block w-full h-full group" aria-label="Reproducir video">
                            <video
                              src={url}
                              preload="metadata"
                              muted
                              playsInline
                              className="w-full h-full object-cover bg-black"
                            />
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
                        {(esSuperAdmin || esAdmin) && !estaServicioFinalizado(s.estado_servicio) && (
                          <button onClick={() => eliminarEvidencia(ev.id)}
                                  className="absolute top-1 right-1 h-7 w-7 rounded-full bg-rose-600/90 text-white text-xs grid place-items-center hover:bg-rose-700 shadow">
                            ✕
                          </button>
                        )}
                      </div>
                      <div className="p-2">
                        <div className="text-xs text-slate-500">{formatFechaHora(ev.fecha_carga)}</div>
                        <div className="text-xs text-slate-700 truncate">{ev.tecnico?.nombre}</div>
                        {ev.descripcion && <div className="text-xs text-slate-600 truncate" title={ev.descripcion}>{ev.descripcion}</div>}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

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

        <ObservacionesServicioPanel idServicio={s.id} tecnicosAsignados={s.asignaciones} estadoServicio={s.estado_servicio} />

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

      <Modal open={openChecklist} onClose={() => !guardandoCheck && setOpenChecklist(false)}
        title={`Checklist de finalización · ${plantillaCheck?.categoria ? plantillaCheck.categoria.charAt(0).toUpperCase() + plantillaCheck.categoria.slice(1) : ''}`}
        size="lg"
        footer={<>
          <button type="button" className="btn-secondary" onClick={() => setOpenChecklist(false)} disabled={guardandoCheck}>Cancelar</button>
          <button type="submit" form="form-checklist-fin" className="btn-primary" disabled={guardandoCheck}>
            {guardandoCheck ? 'Generando informe…' : 'Guardar checklist y continuar'}
          </button>
        </>}>
        {plantillaCheck && (
          <form id="form-checklist-fin" onSubmit={guardarChecklistFin} className="space-y-4">
            <p className="text-xs text-slate-500">
              Marca cada ítem según lo encontrado. Al guardar se genera el informe PDF del servicio
              y podrás continuar con la guía / OT / evidencias.
            </p>
            {(() => {
              const items = plantillaCheck.plantilla?.items || [];
              const grupos = [];
              let grupoActual = null;
              items.forEach(it => {
                if (it.grupo && it.grupo !== grupoActual) {
                  grupos.push({ titulo: it.grupo, items: [it] });
                  grupoActual = it.grupo;
                } else if (it.grupo === grupoActual && grupos.length > 0) {
                  grupos[grupos.length - 1].items.push(it);
                } else {
                  if (grupos.length === 0 || grupos[grupos.length - 1].titulo !== '__sin_grupo__') {
                    grupos.push({ titulo: '__sin_grupo__', items: [it] });
                  } else {
                    grupos[grupos.length - 1].items.push(it);
                  }
                  grupoActual = null;
                }
              });
              return grupos.map((g, gi) => (
                <div key={gi} className="space-y-2">
                  {g.titulo !== '__sin_grupo__' && (
                    <div className="text-xs uppercase tracking-wider text-slate-500 font-semibold pt-2">{g.titulo}</div>
                  )}
                  {g.items.map(it => {
                    const r = respuestasCheck[it.id] || { respuesta: '', nota: '' };
                    return (
                      <div key={it.id} className="rounded-lg ring-1 ring-slate-200 p-3 bg-white">
                        <div className="flex items-start justify-between gap-3 mb-2">
                          <p className="text-sm text-slate-800 flex-1">{it.texto}</p>
                          <div className="flex items-center gap-3 text-xs shrink-0">
                            {[['si', 'Sí'], ['no', 'No'], ['na', 'N/A']].map(([val, lbl]) => (
                              <label key={val} className="inline-flex items-center gap-1 cursor-pointer">
                                <input type="radio" name={`r-${it.id}`} value={val}
                                  checked={r.respuesta === val}
                                  onChange={() => setRespuesta(it.id, 'respuesta', val)} />
                                <span className={r.respuesta === val
                                  ? val === 'si' ? 'font-semibold text-emerald-700'
                                  : val === 'no' ? 'font-semibold text-red-700'
                                  : 'font-semibold text-slate-700'
                                  : 'text-slate-600'}>{lbl}</span>
                              </label>
                            ))}
                          </div>
                        </div>
                        <input className="input !py-1 !text-xs" placeholder="Nota (opcional)"
                          value={r.nota}
                          onChange={e => setRespuesta(it.id, 'nota', e.target.value)} />
                      </div>
                    );
                  })}
                </div>
              ));
            })()}
          </form>
        )}
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

    </>
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
