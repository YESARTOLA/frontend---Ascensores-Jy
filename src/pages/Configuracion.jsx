import PageHeader from '../components/common/PageHeader.jsx';
import CuentasBancariasPanel from '../components/configuracion/CuentasBancariasPanel.jsx';
import ChecklistPlantillasPanel from '../components/configuracion/ChecklistPlantillasPanel.jsx';
import ParametrosOperativosPanel from '../components/configuracion/ParametrosOperativosPanel.jsx';

export default function Configuracion() {
  return (
    <>
      <PageHeader
        title="Configuración"
        subtitle="Parámetros y catálogos del sistema"
        eyebrow="Configuración"
      />
      <div className="card mb-5">
        <div className="card-header">
          <h3 className="card-title">Parámetros operativos</h3>
        </div>
        <div className="card-body">
          <ParametrosOperativosPanel />
        </div>
      </div>
      <div className="card">
        <div className="card-header">
          <h3 className="card-title">Cuentas bancarias</h3>
        </div>
        <div className="card-body">
          <CuentasBancariasPanel />
        </div>
      </div>
      <div className="card mt-5">
        <div className="card-header">
          <h3 className="card-title">Checklist de finalización de servicio</h3>
        </div>
        <div className="card-body">
          <ChecklistPlantillasPanel />
        </div>
      </div>
    </>
  );
}
