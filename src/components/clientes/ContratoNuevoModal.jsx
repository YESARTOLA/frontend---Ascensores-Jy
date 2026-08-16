import { useEffect, useMemo, useState } from 'react';
import { archivosService, clientesService } from '../../services';
import Modal from '../common/Modal.jsx';
import { useToast } from '../common/Toast.jsx';
import { useAuth } from '../../features/auth/AuthContext.jsx';
import { FileLink } from '../common/FilePreview.jsx';
import { formatFecha } from '../../utils/formatters.js';

const ETIQUETA_AREA = { servicio: 'Servicios', proyecto: 'Proyectos' };

const soloFecha = (v) => (v ? String(v).substring(0, 10) : '');

/**
 * Registrar un CONTRATO NUEVO para un área del cliente (renovación).
 *
 * El contrato vigente del área deja de serlo: sus fechas quedan en el historial
 * y el cliente pasa a tener la nueva vigencia. El documento no se historiza —
 * el PDF nuevo reemplaza al anterior; si no se adjunta ninguno, se conserva el
 * que ya estaba.
 *
 * Props:
 *   cliente  — cliente a renovar (necesita las fechas y archivos de contrato). Si
 *              es null el modal está cerrado.
 *   onClose  — cerrar sin guardar
 *   onSaved  — (clienteActualizado) tras registrar el contrato
 */
export default function ContratoNuevoModal({ cliente, onClose, onSaved }) {
  const toast = useToast();
  const { accesoServicios, accesoProyectos } = useAuth();
  const areasDisponibles = useMemo(
    () => ['servicio', 'proyecto'].filter(a => (a === 'servicio' ? accesoServicios : accesoProyectos)),
    [accesoServicios, accesoProyectos]
  );

  const [area, setArea] = useState(areasDisponibles[0] || 'servicio');
  const [inicio, setInicio] = useState('');
  const [fin, setFin] = useState('');
  const [observaciones, setObservaciones] = useState('');
  const [archivo, setArchivo] = useState(null);   // { id, nombre_original, … } recién subido
  const [subiendo, setSubiendo] = useState(false);
  const [guardando, setGuardando] = useState(false);

  // Al abrir: campos en blanco y área preseleccionada = la que ya tiene contrato
  // registrado (la que se renueva en la práctica), si el usuario la puede ver.
  useEffect(() => {
    if (!cliente) return;
    const conContrato = areasDisponibles.find(a => cliente[`contrato_${a}_inicio`] && cliente[`contrato_${a}_fin`]);
    setArea(conContrato || areasDisponibles[0] || 'servicio');
    setInicio('');
    setFin('');
    setObservaciones('');
    setArchivo(null);
  }, [cliente, areasDisponibles]);

  if (!cliente) return null;

  const actualInicio = cliente[`contrato_${area}_inicio`];
  const actualFin = cliente[`contrato_${area}_fin`];
  const actualArchivo = cliente[`archivo_contrato_${area}`];
  const tieneActual = !!(actualInicio && actualFin);

  const subirArchivo = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setSubiendo(true);
    try {
      const fd = new FormData();
      fd.append('archivo', file);
      const arch = await archivosService.upload(fd, 'contratos');
      setArchivo(arch);
      toast.success('Contrato adjuntado');
    } catch {
      toast.error('Error al adjuntar el contrato');
    } finally {
      setSubiendo(false);
      e.target.value = '';
    }
  };

  const guardar = async () => {
    if (!inicio || !fin) return toast.error('Indique el inicio y el fin de la nueva vigencia');
    if (fin < inicio) return toast.error('La fecha fin no puede ser anterior al inicio');
    setGuardando(true);
    try {
      const actualizado = await clientesService.registrarContrato(cliente.id, {
        area,
        fecha_inicio: inicio,
        fecha_fin: fin,
        id_archivo: archivo?.id ?? null,
        observaciones: observaciones || null
      });
      toast.success(`Contrato de ${ETIQUETA_AREA[area]} registrado`);
      onSaved?.(actualizado);
    } catch (err) {
      toast.error(err?.response?.data?.error || 'Error al registrar el contrato');
    } finally {
      setGuardando(false);
    }
  };

  return (
    <Modal open={!!cliente} onClose={onClose} title="Registrar contrato nuevo" size="md"
      footer={
        <>
          <button className="btn-secondary" onClick={onClose} disabled={guardando}>Cancelar</button>
          <button className="btn-primary" onClick={guardar} disabled={guardando || subiendo}>
            {guardando ? 'Registrando…' : 'Registrar contrato'}
          </button>
        </>
      }>
      <div className="space-y-4">
        <div className="text-sm text-slate-600">
          Cliente: <span className="font-semibold text-slate-800">{cliente.nombre}</span>
        </div>

        {areasDisponibles.length > 1 && (
          <div>
            <label className="label">Área del contrato</label>
            <select className="select" value={area} onChange={e => setArea(e.target.value)}>
              {areasDisponibles.map(a => <option key={a} value={a}>{ETIQUETA_AREA[a]}</option>)}
            </select>
          </div>
        )}

        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
          {tieneActual ? (
            <>
              <div>
                Contrato actual de {ETIQUETA_AREA[area]}:{' '}
                <span className="font-semibold">{formatFecha(actualInicio)} → {formatFecha(actualFin)}</span>
              </div>
              <div className="mt-1">
                Al registrar el nuevo dejará de estar vigente y quedará solo en el historial del cliente.
              </div>
            </>
          ) : (
            <div>El área de {ETIQUETA_AREA[area]} no tiene contrato registrado: este será el primero.</div>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="label">Inicio de vigencia</label>
            <input type="date" className="input" value={inicio} onChange={e => setInicio(e.target.value)} />
          </div>
          <div>
            <label className="label">Fin de vigencia</label>
            <input type="date" className="input" value={fin} min={inicio || undefined}
              onChange={e => setFin(e.target.value)} />
          </div>
        </div>

        <div>
          <label className="label">Contrato firmado (PDF)</label>
          {archivo ? (
            <div className="flex items-center justify-between gap-2 text-sm">
              <FileLink archivo={archivo} className="text-brand-700 hover:underline truncate">
                📎 {archivo.nombre_original}
              </FileLink>
              <button type="button" onClick={() => setArchivo(null)} className="text-xs text-red-600 hover:underline">Quitar</button>
            </div>
          ) : (
            <>
              <div className="flex items-center gap-2">
                <input type="file" accept=".pdf,image/*" onChange={subirArchivo} disabled={subiendo} className="input flex-1" />
                {subiendo && <span className="text-xs text-slate-500">Subiendo…</span>}
              </div>
              <p className="text-[11px] text-slate-500 mt-1">
                {actualArchivo
                  ? <>Reemplaza al documento actual (<span className="font-medium">{actualArchivo.nombre_original}</span>). Si no adjunta uno, se conserva ese.</>
                  : 'Opcional: puede adjuntarlo después desde la edición del cliente.'}
              </p>
            </>
          )}
        </div>

        <div>
          <label className="label">Observaciones del contrato anterior</label>
          <textarea className="input" rows={2} value={observaciones}
            onChange={e => setObservaciones(e.target.value)}
            placeholder="Motivo de la renovación, cambios acordados…" />
        </div>
      </div>
    </Modal>
  );
}
