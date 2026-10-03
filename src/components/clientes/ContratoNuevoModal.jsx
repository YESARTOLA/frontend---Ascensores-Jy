import { useEffect, useMemo, useState } from 'react';
import { clientesService } from '../../services';
import Modal from '../common/Modal.jsx';
import { useToast } from '../common/Toast.jsx';
import { useAuth } from '../../features/auth/AuthContext.jsx';
import { FileLink } from '../common/FilePreview.jsx';
import BarraProgresoCarga from '../common/BarraProgresoCarga.jsx';
import useCargaArchivos from '../../hooks/useCargaArchivos.js';
import { formatFecha } from '../../utils/formatters.js';
import { AREAS_CLIENTE, ETIQUETA_AREA, areasDelCliente } from '../../utils/areasCliente.js';

const soloFecha = (v) => (v ? String(v).substring(0, 10) : '');

// Un cliente es de una sola área: el contrato nuevo se registra en la suya (y
// solo si el usuario la gestiona), tenga o no contrato. Un cliente antiguo sin
// área ni contrato, en cualquiera de las del usuario.
function areasRenovables(cliente, areasDisponibles) {
  const delCliente = areasDelCliente(cliente);
  return delCliente.length ? areasDisponibles.filter(a => delCliente.includes(a)) : areasDisponibles;
}

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
    () => AREAS_CLIENTE.filter(a => (a === 'servicio' ? accesoServicios : accesoProyectos)),
    [accesoServicios, accesoProyectos]
  );

  const [area, setArea] = useState(areasDisponibles[0] || 'servicio');
  const [inicio, setInicio] = useState('');
  const [fin, setFin] = useState('');
  const [observaciones, setObservaciones] = useState('');
  const [archivo, setArchivo] = useState(null);   // { id, nombre_original, … } recién subido
  const carga = useCargaArchivos();
  const subiendo = carga.subiendo;
  const [guardando, setGuardando] = useState(false);

  // Al abrir: campos en blanco y área = la del cliente.
  useEffect(() => {
    if (!cliente) return;
    setArea(areasRenovables(cliente, areasDisponibles)[0] || areasDisponibles[0] || 'servicio');
    setInicio('');
    setFin('');
    setObservaciones('');
    setArchivo(null);
  }, [cliente, areasDisponibles]);

  if (!cliente) return null;

  const areas = areasRenovables(cliente, areasDisponibles);
  // Cliente de un área que este usuario no gestiona (lo ve por tener registros
  // de la suya): su contrato lo registra esa área.
  if (areas.length === 0) {
    return (
      <Modal open onClose={onClose} title="Registrar contrato nuevo" size="md"
        footer={<button className="btn-secondary" onClick={onClose}>Cerrar</button>}>
        <div className="space-y-4">
          <div className="text-sm text-slate-600">
            Cliente: <span className="font-semibold text-slate-800">{cliente.nombre}</span>
          </div>
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
            Este cliente es del Área de {ETIQUETA_AREA[areasDelCliente(cliente)[0]]}: su contrato lo registra esa área.
          </div>
        </div>
      </Modal>
    );
  }

  const actualInicio = cliente[`contrato_${area}_inicio`];
  const actualFin = cliente[`contrato_${area}_fin`];
  const actualArchivo = cliente[`archivo_contrato_${area}`];
  const tieneActual = !!(actualInicio && actualFin);

  const subirArchivo = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      const arch = await carga.subirUno(file, 'contratos');
      setArchivo(arch);
      toast.success('Contrato adjuntado');
    } catch (err) {
      if (!err?.cancelado) toast.error('Error al adjuntar el contrato');
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

        {areas.length > 1 ? (
          <div>
            <label className="label">Área del contrato</label>
            <select className="select" value={area} onChange={e => setArea(e.target.value)}>
              {areas.map(a => <option key={a} value={a}>{ETIQUETA_AREA[a]}</option>)}
            </select>
          </div>
        ) : areasDisponibles.length > 1 && (
          <div className="text-sm text-slate-600">
            Área: <span className="font-semibold text-slate-800">{ETIQUETA_AREA[area]}</span>
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
              </div>
              <BarraProgresoCarga carga={carga} className="mt-2" />
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
