import { useEffect, useState } from 'react';
import { ascensoresService } from '../../services';
import { formatMonto } from '../../utils/formatters.js';

/**
 * Descripción del modal de doble confirmación al eliminar un ascensor.
 *
 * Igual que ImpactoEliminacionEdificio: consulta al backend el impacto REAL
 * (mismo cálculo que ejecuta la cascada) para que el usuario vea la magnitud
 * exacta antes de escribir la palabra clave. Se monta al abrirse el modal, así
 * que los conteos siempre son frescos.
 */
export default function ImpactoEliminacionAscensor({ ascensor }) {
  const [impacto, setImpacto] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!ascensor?.id) return;
    let vigente = true;
    setImpacto(null);
    setError(null);
    ascensoresService.impactoEliminacion(ascensor.id)
      .then(d => { if (vigente) setImpacto(d); })
      .catch(err => {
        if (vigente) setError(err.response?.data?.error || 'No se pudo calcular el impacto');
      });
    return () => { vigente = false; };
  }, [ascensor?.id]);

  const elim = impacto?.se_eliminan;
  const compartidos = impacto?.compartidos_con_otro_ascensor;

  // Solo se listan las filas con contenido: un modal lleno de ceros es ruido.
  const lineas = elim ? [
    ['planes', elim.planes, 'plan de mantenimiento', 'planes de mantenimiento'],
    ['servicios', elim.servicios, 'servicio / proyecto', 'servicios / proyectos'],
    ['emergencias', elim.emergencias, 'emergencia', 'emergencias'],
    ['correctivos', elim.correctivos, 'correctivo', 'correctivos'],
    ['atenciones', elim.atenciones_rapidas, 'atención rápida', 'atenciones rápidas'],
    ['cobros', elim.cobros, 'cobro', 'cobros'],
    ['pagos', elim.pagos, 'pago registrado', 'pagos registrados'],
    ['facturas', elim.facturas, 'factura', 'facturas']
  ].filter(([, n]) => n > 0) : [];

  return (
    <div className="space-y-2">
      <p>
        Se eliminará <span className="font-semibold">{ascensor?.codigo}</span> y todo lo que
        depende solo de él, aunque ya esté ejecutado o cobrado. Es una baja lógica: queda
        auditada y solo el Super Admin puede verlo y reactivarlo. Si el ascensor solo dejó
        de operar, usa <span className="font-semibold">Marcar como Inactivo</span>, que
        conserva su historial.
      </p>

      {error && <p className="font-medium">{error}</p>}
      {!impacto && !error && <p className="italic opacity-80">Calculando el impacto…</p>}

      {impacto && (
        <>
          {lineas.length === 0 ? (
            <p>Este ascensor no tiene nada asociado: solo se eliminará el registro.</p>
          ) : (
            <>
              <p className="font-semibold">Se eliminará en cascada:</p>
              <ul className="list-disc list-inside space-y-0.5">
                {lineas.map(([clave, n, singular, plural]) => (
                  <li key={clave}><span className="font-semibold">{n}</span> {n === 1 ? singular : plural}</li>
                ))}
              </ul>
            </>
          )}

          {elim.monto_abonado > 0 && (
            <p className="font-semibold">
              Atención: desaparecerán {formatMonto(elim.monto_abonado)} ya abonados por el
              cliente. Los reportes de ingresos dejarán de contabilizarlos.
            </p>
          )}

          {(compartidos.servicios_recalculados > 0 || compartidos.servicios_intactos > 0) && (
            <p>
              {compartidos.servicios_recalculados + compartidos.servicios_intactos} servicio(s)
              seguirán vivos porque también cubren otros ascensores
              {compartidos.servicios_recalculados > 0
                && `; a ${compartidos.servicios_recalculados} se le quitará este ascensor y se recalculará el precio`}.
            </p>
          )}
        </>
      )}
    </div>
  );
}
