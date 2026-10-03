import { useEffect, useMemo, useState } from 'react';
import Modal from '../common/Modal.jsx';
import { useToast } from '../common/Toast.jsx';
import { useAuth } from '../../features/auth/AuthContext.jsx';
import {
  recordatoriosService, serviciosService, correctivosService, emergenciasService, mantenimientosService, cobrosService
} from '../../services';
import { nowDateTimeLocalLima, isoToDateTimeLocalLima, dateTimeLocalLimaToISO } from '../../utils/formatters.js';

export const PRIORIDADES = [
  { value: 'alta', label: 'Alta', cls: 'text-rose-700 bg-rose-50 border-rose-200' },
  { value: 'media', label: 'Media', cls: 'text-amber-700 bg-amber-50 border-amber-200' },
  { value: 'baja', label: 'Baja', cls: 'text-slate-600 bg-slate-50 border-slate-200' }
];

// Tipos de proceso que se pueden vincular (opcionalmente) a un recordatorio
// manual. El recordatorio conserva su tipo 'manual'; esto solo enlaza el proceso.
const TIPOS_PROCESO = [
  { value: 'servicio', label: 'Servicio / Proyecto' },
  { value: 'correctivo', label: 'Correctivo' },
  { value: 'emergencia', label: 'Emergencia' },
  { value: 'mantenimiento', label: 'Mantenimiento' },
  // Vincular un cobro exige listarlos: solo para roles con visibilidad
  // financiera (al resto la API de cobros le responde 403).
  { value: 'cobro', label: 'Cobro', finanzas: true }
];

// Fuente de datos por tipo de proceso (cada servicio devuelve un array).
const CARGA_PROCESO = {
  servicio: () => serviciosService.list(),
  correctivo: () => correctivosService.list(),
  emergencia: () => emergenciasService.list(),
  mantenimiento: () => mantenimientosService.list(),
  cobro: () => cobrosService.list()
};

// Normaliza cada registro a { value, label } para el select. `value` es el id
// que se enviará en el campo de vínculo correspondiente (para correctivos es el
// id del servicio vinculado, porque el recordatorio enlaza por id_servicio).
const NORMALIZA_PROCESO = {
  servicio: s => ({ value: String(s.id), label: `${s.codigo || `SRV-${s.id}`}${s.cliente?.nombre ? ` · ${s.cliente.nombre}` : (s.titulo ? ` · ${s.titulo}` : '')}` }),
  correctivo: c => (c.servicio?.id ? { value: String(c.servicio.id), label: `${c.servicio.codigo || `#${c.id}`}${c.falla ? ` · ${c.falla.slice(0, 40)}` : ''}` } : null),
  emergencia: e => ({ value: String(e.id), label: `${e.servicio?.codigo || `#${e.id}`}${e.motivo ? ` · ${e.motivo.slice(0, 40)}` : ''}` }),
  mantenimiento: p => ({ value: String(p.id), label: `${p.cliente?.nombre || 'Plan'} · Plan #${p.id}` }),
  cobro: co => ({ value: String(co.id), label: `Cobro #${co.id}${co.cliente?.nombre ? ` · ${co.cliente.nombre}` : ''}` })
};

async function cargarListaProceso(tipo) {
  const fn = CARGA_PROCESO[tipo];
  if (!fn) return [];
  const arr = await fn();
  return (Array.isArray(arr) ? arr : []).map(NORMALIZA_PROCESO[tipo]).filter(o => o && o.value);
}

// A partir de un recordatorio, deduce el tipo/id de proceso vinculado para
// precargar el selector (correctivo y servicio comparten id_servicio → 'servicio').
function procesoDeRecordatorio(r) {
  if (r.id_emergencia) return { proceso_tipo: 'emergencia', proceso_id: String(r.id_emergencia) };
  if (r.id_mantenimiento_plan) return { proceso_tipo: 'mantenimiento', proceso_id: String(r.id_mantenimiento_plan) };
  if (r.id_cobro) return { proceso_tipo: 'cobro', proceso_id: String(r.id_cobro) };
  if (r.id_servicio) return { proceso_tipo: 'servicio', proceso_id: String(r.id_servicio) };
  return { proceso_tipo: '', proceso_id: '' };
}

function formInicial(idUsuario) {
  // Por defecto: hoy a las 09:00 hora Lima (no depende del huso del navegador).
  // Si las 09:00 ya pasaron, se usa el momento actual: la fecha de un
  // recordatorio no puede ser anterior a ahora.
  const ahora = nowDateTimeLocalLima();
  const nueve = `${ahora.slice(0, 10)}T09:00`;
  return {
    titulo: '',
    descripcion: '',
    fecha_recordatorio: nueve >= ahora ? nueve : ahora,
    prioridad: 'media',
    id_usuario_destino: String(idUsuario || ''),
    proceso_tipo: '',
    proceso_id: ''
  };
}

function formDeRecordatorio(r, idUsuario) {
  return {
    titulo: r.titulo,
    descripcion: r.descripcion || '',
    // Mostrar el instante guardado en hora de Lima, no en UTC ni en el huso del navegador.
    fecha_recordatorio: isoToDateTimeLocalLima(r.fecha_recordatorio),
    prioridad: r.prioridad,
    id_usuario_destino: String(r.id_usuario_destino || idUsuario || ''),
    ...procesoDeRecordatorio(r)
  };
}

/**
 * Alta y edición de un recordatorio manual.
 *
 * El recordatorio es de una persona: quien lo registra o aquella para quien lo
 * registra (campo «Para»). Solo esa persona lo verá en su módulo de
 * Recordatorios, su campana y su calendario.
 *
 * Props:
 *   - open, onClose, onSaved(recordatorio)
 *   - recordatorio: el que se edita, o null para uno nuevo.
 *   - procesoFijo: { id_servicio, etiqueta } cuando se abre desde la vista de un
 *     servicio o proyecto; el vínculo queda fijo y no se muestra el selector.
 */
export default function RecordatorioFormModal({ open, onClose, onSaved, recordatorio = null, procesoFijo = null }) {
  const { user, puedeVerPrecio } = useAuth();
  const toast = useToast();
  const tiposProceso = useMemo(() => TIPOS_PROCESO.filter(t => !t.finanzas || puedeVerPrecio), [puedeVerPrecio]);
  const [form, setForm] = useState(() => formInicial(user?.id));
  const [saving, setSaving] = useState(false);
  const [destinatarios, setDestinatarios] = useState(null); // null = aún sin cargar
  const [procesosCache, setProcesosCache] = useState({}); // { [tipo]: [{value,label}] }
  const [procesoLoading, setProcesoLoading] = useState(false);

  // Cada apertura parte del recordatorio a editar o de un formulario limpio.
  useEffect(() => {
    if (!open) return;
    setForm(recordatorio ? formDeRecordatorio(recordatorio, user?.id) : formInicial(user?.id));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, recordatorio]);

  // Personas a quienes se puede registrar: se piden una vez, al primer uso.
  useEffect(() => {
    if (!open || destinatarios) return;
    recordatoriosService.destinatarios()
      .then(list => setDestinatarios(Array.isArray(list) ? list : []))
      .catch(() => setDestinatarios([]));
  }, [open, destinatarios]);

  // Carga perezosa de la lista de procesos cuando se elige un tipo.
  const procesoTipoSel = open && !procesoFijo ? form.proceso_tipo : '';
  useEffect(() => {
    if (!procesoTipoSel || procesosCache[procesoTipoSel]) return;
    let cancel = false;
    setProcesoLoading(true);
    cargarListaProceso(procesoTipoSel)
      .then(opts => { if (!cancel) setProcesosCache(c => ({ ...c, [procesoTipoSel]: opts })); })
      .catch(() => { if (!cancel) setProcesosCache(c => ({ ...c, [procesoTipoSel]: [] })); })
      .finally(() => { if (!cancel) setProcesoLoading(false); });
    return () => { cancel = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [procesoTipoSel]);

  const setF = (k, v) => setForm(f => ({ ...f, [k]: v }));

  // Opciones de «Para»: primero uno mismo; si el dueño actual ya no está activo,
  // se conserva como opción para no cambiarlo sin querer al editar.
  const otrosUsuarios = (destinatarios || []).filter(u => u.id !== user?.id);
  const destinoHuerfano = recordatorio?.usuario_destino
    && recordatorio.usuario_destino.id !== user?.id
    && !otrosUsuarios.some(u => u.id === recordatorio.usuario_destino.id)
    ? recordatorio.usuario_destino : null;
  const nombreDestino = (id) => (destinatarios || []).find(u => String(u.id) === String(id))?.nombres
    || (destinoHuerfano && String(destinoHuerfano.id) === String(id) ? destinoHuerfano.nombres : '');
  const paraOtro = form.id_usuario_destino && form.id_usuario_destino !== String(user?.id);

  const guardar = async () => {
    if (!form.titulo || !form.fecha_recordatorio) {
      return toast.error('Título y fecha son obligatorios');
    }
    // La fecha no puede ser anterior al momento actual (hora Lima). Ambos valores
    // están en el mismo formato/huso, así que la comparación de strings equivale
    // a la cronológica, con granularidad de minuto (la del input datetime-local).
    if (form.fecha_recordatorio < nowDateTimeLocalLima()) {
      return toast.error('La fecha no puede ser anterior al momento actual');
    }
    setSaving(true);
    try {
      // El proceso vinculado (opcional) se traduce al campo de id correspondiente.
      // El recordatorio SIEMPRE se guarda como 'manual' aunque se vincule un proceso.
      const { proceso_tipo, proceso_id, id_usuario_destino, ...rest } = form;
      const vinculo = { id_servicio: null, id_emergencia: null, id_mantenimiento_plan: null, id_cobro: null };
      if (procesoFijo) {
        vinculo.id_servicio = procesoFijo.id_servicio;
      } else if (proceso_id) {
        const pid = Number(proceso_id);
        if (proceso_tipo === 'servicio' || proceso_tipo === 'correctivo') vinculo.id_servicio = pid;
        else if (proceso_tipo === 'emergencia') vinculo.id_emergencia = pid;
        else if (proceso_tipo === 'mantenimiento') vinculo.id_mantenimiento_plan = pid;
        else if (proceso_tipo === 'cobro') vinculo.id_cobro = pid;
      }
      const payload = {
        ...rest,
        ...vinculo,
        id_usuario_destino: id_usuario_destino ? Number(id_usuario_destino) : null,
        tipo: 'manual',
        // El input datetime-local entrega "YYYY-MM-DDTHH:mm" sin TZ; anclarlo a
        // Lima para que el instante guardado coincida con la hora del usuario.
        fecha_recordatorio: dateTimeLocalLimaToISO(rest.fecha_recordatorio)
      };
      const guardado = recordatorio
        ? await recordatoriosService.update(recordatorio.id, payload)
        : await recordatoriosService.create(payload);
      const para = paraOtro ? ` para ${nombreDestino(id_usuario_destino) || 'otra persona'}` : '';
      toast.success(recordatorio ? `Recordatorio actualizado${para}` : `Recordatorio registrado${para}`);
      onSaved?.(guardado);
    } catch (e) {
      toast.error(e.response?.data?.error || 'Error al guardar');
    } finally { setSaving(false); }
  };

  return (
    <Modal open={open} onClose={onClose}
      title={recordatorio ? 'Editar recordatorio' : 'Nuevo recordatorio'}
      footer={
        <>
          <button onClick={onClose} className="btn-secondary">Cancelar</button>
          <button onClick={guardar} disabled={saving} className="btn-primary">{saving ? 'Guardando…' : 'Guardar'}</button>
        </>
      }>
      {open && (
        <div className="space-y-3">
          <div>
            <label className="label">Título *</label>
            <input className="input" value={form.titulo} onChange={e => setF('titulo', e.target.value)} />
          </div>
          <div>
            <label className="label">Descripción</label>
            <textarea className="textarea" rows="3" value={form.descripcion} onChange={e => setF('descripcion', e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Fecha y hora *</label>
              <input type="datetime-local" className="input" min={nowDateTimeLocalLima()} value={form.fecha_recordatorio} onChange={e => setF('fecha_recordatorio', e.target.value)} />
            </div>
            <div>
              <label className="label">Prioridad</label>
              <select className="select" value={form.prioridad} onChange={e => setF('prioridad', e.target.value)}>
                {PRIORIDADES.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label className="label">Para</label>
            <select className="select" value={form.id_usuario_destino} onChange={e => setF('id_usuario_destino', e.target.value)}
              disabled={destinatarios === null}>
              <option value={String(user?.id || '')}>Para mí{user?.nombres ? ` (${user.nombres})` : ''}</option>
              {destinoHuerfano && <option value={String(destinoHuerfano.id)}>{destinoHuerfano.nombres}</option>}
              {otrosUsuarios.map(u => (
                <option key={u.id} value={String(u.id)}>{u.nombres}{u.rol?.nombre ? ` · ${u.rol.nombre}` : ''}</option>
              ))}
            </select>
            <p className="text-xs text-slate-500 mt-1">
              {paraOtro
                ? 'Le aparecerá en su módulo de Recordatorios. Tú lo verás en «Registrados para otros».'
                : 'Te aparecerá en tu módulo de Recordatorios.'}
            </p>
          </div>
          <div className="border-t border-slate-100 pt-3">
            <label className="label">{procesoFijo ? 'Vinculado a' : 'Proceso vinculado (opcional)'}</label>
            {procesoFijo ? (
              <div className="text-sm font-medium text-slate-700">{procesoFijo.etiqueta}</div>
            ) : (
              <>
                <div className="grid grid-cols-2 gap-3">
                  <select className="select" value={form.proceso_tipo}
                    onChange={e => setForm(f => ({ ...f, proceso_tipo: e.target.value, proceso_id: '' }))}>
                    <option value="">— Sin vincular —</option>
                    {tiposProceso.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                  </select>
                  <select className="select" value={form.proceso_id}
                    disabled={!form.proceso_tipo || procesoLoading}
                    onChange={e => setF('proceso_id', e.target.value)}>
                    <option value="">{procesoLoading ? 'Cargando…' : (form.proceso_tipo ? '— Seleccione —' : '—')}</option>
                    {(procesosCache[form.proceso_tipo] || []).map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </div>
                <p className="text-xs text-slate-500 mt-1">El recordatorio se mantiene de tipo <b>Manual</b>; vincular un proceso es opcional.</p>
              </>
            )}
          </div>
        </div>
      )}
    </Modal>
  );
}
