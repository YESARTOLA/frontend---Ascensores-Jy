import { useEffect, useState } from 'react';
import { edificiosService } from '../../services';
import { formatMonto } from '../../utils/formatters.js';

/**
 * Descripción del modal de doble confirmación al eliminar un edificio / obra.
 *
 * Consulta al backend el impacto REAL de la eliminación (mismo cálculo que
 * ejecuta la cascada) y lo pinta como dos listas: lo que se elimina y lo que
 * sobrevive por pertenecer también a otro edificio. Así el usuario ve la
 * magnitud exacta antes de escribir la palabra clave, en vez de un texto fijo.
 *
 * Se monta al abrirse el modal (Modal no renderiza sus hijos si está cerrado),
 * de modo que los conteos siempre son frescos.
 */
export default function ImpactoEliminacionEdificio({ edificio }) {
  const [impacto, setImpacto] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!edificio?.id) return;
    let vigente = true;
    setImpacto(null);
    setError(null);
    edificiosService.impactoEliminacion(edificio.id)
      .then(d => { if (vigente) setImpacto(d); })
      .catch(err => {
        if (vigente) setError(err.response?.data?.error || 'No se pudo calcular el impacto');
      });
    return () => { vigente = false; };
  }, [edificio?.id]);

  const elim = impacto?.se_eliminan;
  const compartidos = impacto?.compartidos_con_otro_edificio;

  // Solo se listan las filas con contenido: un modal lleno de ceros es ruido.
  const lineas = elim ? [
    ['ascensores', elim.ascensores, 'ascensor', 'ascensores'],
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
        Se eliminará <span className="font-semibold">{edificio?.nombre}</span> y todo lo que
        depende de él. Es una baja lógica: no se borra físicamente de la base de datos, queda
        auditada y solo el Super Admin puede verla y reactivarla.
      </p>

      {error && <p className="font-medium">{error}</p>}
      {!impacto && !error && <p className="italic opacity-80">Calculando el impacto…</p>}

      {impacto && (
        <>
          {lineas.length === 0 ? (
            <p>Este edificio no tiene nada asociado: solo se eliminará el registro.</p>
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
              seguirán vivos porque también cubren ascensores de otro edificio
              {compartidos.servicios_recalculados > 0
                && `; a ${compartidos.servicios_recalculados} se le recalculará el precio`}.
            </p>
          )}
        </>
      )}
    </div>
  );
}
