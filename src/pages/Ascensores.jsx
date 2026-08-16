import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ascensoresService, tiposAscensorService, tiposServicioService, edificiosService } from '../services';
import PageHeader from '../components/common/PageHeader.jsx';
import Loader from '../components/common/Loader.jsx';
import Modal from '../components/common/Modal.jsx';
import ConfirmarEliminacion from '../components/common/ConfirmarEliminacion.jsx';
import EmptyState from '../components/common/EmptyState.jsx';
import Pagination, { usePaginatedList } from '../components/common/Pagination.jsx';
import { useToast } from '../components/common/Toast.jsx';
import { useAuth } from '../features/auth/AuthContext.jsx';
import { badgeEstado, hoyISO, nombreEdificio, nombreCliente } from '../utils/formatters.js';
import AscensorForm, { ascensorFormInicial, ascensorToForm, ESTADOS_OPERATIVOS_ASCENSOR } from '../components/ascensores/AscensorForm.jsx';
import { useClasificaciones } from '../hooks/useClasificaciones.js';

const FILTROS_INICIALES = { q: '', id_edificio: '', tipo: '', estado_operativo: '', clasificacion: '', estado: '1', sort: '', dir: 'asc' };

// Registro del ascensor: activo o dado de baja (`estado` 1/0). Es distinto del
// estado operativo, que describe su situación en campo.
const ESTADO_REGISTRO = [
  { value: '1', label: 'Activos' },
  { value: '0', label: 'Inactivos' },
  { value: 'todos', label: 'Activos e inactivos' }
];

export default function Ascensores() {
  const [tipos, setTipos] = useState([]);
  const [tiposServicio, setTiposServicio] = useState([]);
  const [edificios, setEdificios] = useState([]);
  const [filtros, setFiltros] = useState(FILTROS_INICIALES);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(ascensorFormInicial);
  const [editId, setEditId] = useState(null);
  // Confirmación de baja lógica (PATCH /ascensores/:id/estado → solo super_admin y admin).
  const [aInactivar, setAInactivar] = useState(null);
  const [reactivando, setReactivando] = useState(null);
  const [exportando, setExportando] = useState(null);
  const clasificaciones = useClasificaciones();
  const clasificacionByCodigo = useMemo(
    () => Object.fromEntries(clasificaciones.map(c => [c.codigo, c])),
    [clasificaciones]
  );
  // Catálogo Edificio/Obra: da etiqueta y color al badge de la columna "Tipo de
  // edificio" (el ascensor lo hereda del edificio al que está asignado).
  const [tiposEdificio, setTiposEdificio] = useState([]);
  const tipoEdificioByCodigo = useMemo(
    () => Object.fromEntries(tiposEdificio.map(t => [t.codigo, t])),
    [tiposEdificio]
  );
  const toast = useToast();
  const { esSuperAdmin, esAdmin, esCoordinador } = useAuth();
  const puedeEditar = esSuperAdmin || esAdmin || esCoordinador;
  const puedeEliminar = esSuperAdmin || esAdmin;

  const { data, loading, total, page, pageSize, totalPages, setPage, setPageSize, recargar } =
    usePaginatedList(ascensoresService.paginate, filtros, { initialPageSize: 25 });
  useEffect(() => {
    tiposAscensorService.list().then(setTipos).catch(() => setTipos([]));
    tiposServicioService.list().then(setTiposServicio).catch(() => setTiposServicio([]));
    edificiosService.list().then(setEdificios).catch(() => setEdificios([]));
    edificiosService.tipos().then(setTiposEdificio).catch(() => setTiposEdificio([]));
  }, []);
  const setF = (k, v) => setFiltros(f => ({ ...f, [k]: v }));
  const hayFiltros = filtros.q || filtros.id_edificio || filtros.tipo || filtros.estado_operativo
    || filtros.clasificacion || filtros.estado !== FILTROS_INICIALES.estado;

  // Ordenamiento por columna: clic en la cabecera alterna asc/desc.
  const ordenarPor = (campo) => setFiltros(f => ({
    ...f, sort: campo, dir: f.sort === campo && f.dir === 'asc' ? 'desc' : 'asc'
  }));
  const indicadorOrden = (campo) => filtros.sort === campo ? (filtros.dir === 'asc' ? ' ▲' : ' ▼') : '';
  const cargar = recargar;

  const abrirNuevo = () => {
    setForm({ ...ascensorFormInicial, tipo: tipos[0]?.nombre || '' });
    setEditId(null);
    setOpen(true);
  };
  const abrirEdit = async (a) => {
    // El listado ya incluye precios; si faltara, se piden del detalle.
    let full = a;
    if (!Array.isArray(a.precios)) {
      try { full = await ascensoresService.get(a.id); } catch { /* usa la fila */ }
    }
    setForm(ascensorToForm(full));
    setEditId(a.id);
    setOpen(true);
  };

  const guardar = async () => {
    try {
      if (editId) await ascensoresService.update(editId, form);
      else await ascensoresService.create(form);
      toast.success('Ascensor guardado');
      setOpen(false); cargar();
    } catch (err) { toast.error(err.response?.data?.error || 'Error al guardar'); }
  };

  // Baja lógica del ascensor: estado = 0 (Inactivo) + cascada sobre sus planes.
  const inactivar = async () => {
    if (!aInactivar) return;
    try {
      await ascensoresService.setEstado(aInactivar.id, 0);
      toast.success(`${aInactivar.codigo} quedó Inactivo`);
      setAInactivar(null);
      cargar();
    } catch (err) { toast.error(err.response?.data?.error || 'No se pudo inactivar el ascensor'); }
  };

  // Alta lógica: vuelve a estado = 1 y sale del estado operativo 'Inactivo'. Los
  // planes cancelados por la baja NO se reactivan solos (se crean de nuevo).
  const reactivar = async (a) => {
    if (reactivando) return;
    setReactivando(a.id);
    try {
      await ascensoresService.setEstado(a.id, 1);
      toast.success(`${a.codigo} reactivado (Operativo)`);
      cargar();
    } catch (err) {
      toast.error(err.response?.data?.error || 'No se pudo reactivar el ascensor');
    } finally {
      setReactivando(null);
    }
  };

  const exportar = async (formato) => {
    if (exportando) return;
    setExportando(formato);
    try {
      const blob = await ascensoresService.exportar(filtros, formato).then(r => r.data);
      const ext = formato === 'pdf' ? 'pdf' : 'xlsx';
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `ascensores-${hoyISO()}.${ext}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast.success(`Exportación ${ext.toUpperCase()} lista`);
    } catch (err) {
      // El backend puede devolver el error como blob — intentamos parsearlo
      let msg = 'Error al exportar';
      if (err.response?.data instanceof Blob) {
        try { msg = JSON.parse(await err.response.data.text()).error || msg; } catch {}
      } else if (err.response?.data?.error) {
        msg = err.response.data.error;
      }
      toast.error(msg);
    } finally {
      setExportando(null);
    }
  };

  return (
    <>
      <PageHeader title="Ascensores" subtitle={`${total} registro(s)`} actions={
        <>
          <input className="input max-w-xs" placeholder="Buscar código, marca, ubicación…" value={filtros.q} onChange={e => setF('q', e.target.value)} />
          {/* Exporta lo que hay en pantalla: mismos filtros, sin límite de página. */}
          <button onClick={() => exportar('excel')} disabled={!!exportando} className="btn-ghost">
            {exportando === 'excel' ? 'Generando…' : 'Excel'}
          </button>
          <button onClick={() => exportar('pdf')} disabled={!!exportando} className="btn-ghost">
            {exportando === 'pdf' ? 'Generando…' : 'PDF'}
          </button>
          {puedeEditar && <button onClick={abrirNuevo} className="btn-primary">+ Nuevo ascensor</button>}
        </>
      } />

      <div className="card mb-4">
        <div className="p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-3">
          <div>
            <label className="label">Edificio / Obra</label>
            <select className="select" value={filtros.id_edificio} onChange={e => setF('id_edificio', e.target.value)}>
              <option value="">Todos los edificios</option>
              {edificios.map(ed => (
                <option key={ed.id} value={ed.id}>{nombreEdificio(ed)}{ed.cliente?.nombre ? ` · ${ed.cliente.nombre}` : ''}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Tipo</label>
            <select className="select" value={filtros.tipo} onChange={e => setF('tipo', e.target.value)}>
              <option value="">Todos los tipos</option>
              {tipos.map(t => <option key={t.id} value={t.nombre}>{t.nombre}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Clasificación</label>
            <select className="select" value={filtros.clasificacion} onChange={e => setF('clasificacion', e.target.value)}>
              <option value="">Todas las clasificaciones</option>
              {clasificaciones.map(c => <option key={c.codigo} value={c.codigo}>{c.etiqueta}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Estado operativo</label>
            <select className="select" value={filtros.estado_operativo} onChange={e => setF('estado_operativo', e.target.value)}>
              <option value="">Todos los estados</option>
              {/* 'Inactivo' acompaña a la baja lógica: se filtra con "Registro". */}
              {ESTADOS_OPERATIVOS_ASCENSOR.filter(s => s !== 'Inactivo').map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Registro</label>
            <select className="select" value={filtros.estado} onChange={e => setF('estado', e.target.value)}>
              {ESTADO_REGISTRO.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
          <div className="flex items-end">
            <button onClick={() => setFiltros(FILTROS_INICIALES)} className="btn-secondary w-full" disabled={!hayFiltros}>Limpiar</button>
          </div>
        </div>
      </div>

      <div className="card">
        {loading ? <Loader /> : data.length === 0 ? (
          <EmptyState title="Sin ascensores" action={puedeEditar && <button onClick={abrirNuevo} className="btn-primary">Crear ascensor</button>} />
        ) : (
          <>
            <div className="hidden md:block overflow-x-auto scroll-thin">
              <table className="table-base">
                <thead><tr>
                  {[
                    { campo: 'codigo', label: 'Código' },
                    { campo: 'edificio', label: 'Edificio / Obra' },
                    { campo: 'tipo_edificio', label: 'Tipo de edificio' },
                    { campo: 'tipo', label: 'Tipo / Marca' },
                    { campo: 'distrito', label: 'Distrito' },
                    { campo: 'clasificacion', label: 'Clasificación' },
                    { campo: 'estado', label: 'Estado' }
                  ].map(c => (
                    <th key={c.campo} className="table-th">
                      <button type="button" onClick={() => ordenarPor(c.campo)}
                        className="inline-flex items-center hover:text-brand-700"
                        title="Ordenar por esta columna">
                        {c.label}<span className="text-brand-600">{indicadorOrden(c.campo)}</span>
                      </button>
                    </th>
                  ))}
                  <th className="table-th text-right">Acciones</th>
                </tr></thead>
                <tbody className="divide-y divide-slate-100">
                  {data.map(a => (
                    <tr key={a.id} className="table-row-hover">
                      <td className="table-td"><Link to={`/ascensores/${a.id}`} className="font-mono text-brand-700 hover:underline">{a.codigo}</Link></td>
                      <td className="table-td"><div>{nombreEdificio(a.edificio) || '—'}</div><div className="text-xs text-slate-500">{nombreCliente(a.edificio?.cliente)}</div></td>
                      <td className="table-td">
                        {a.edificio?.tipo ? (
                          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold ring-1 ${tipoEdificioByCodigo[a.edificio.tipo]?.color || 'bg-slate-100 text-slate-800 ring-slate-200'}`}>
                            {tipoEdificioByCodigo[a.edificio.tipo]?.etiqueta || a.edificio.tipo}
                          </span>
                        ) : <span className="text-slate-400 text-xs">—</span>}
                      </td>
                      <td className="table-td text-xs"><div>{a.tipo}</div><div className="text-slate-500">{a.marca} {a.modelo}</div></td>
                      <td className="table-td text-xs">{a.edificio?.distrito || '—'}</td>
                      <td className="table-td">
                        {a.clasificacion && clasificacionByCodigo[a.clasificacion] ? (
                          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold ring-1 ${clasificacionByCodigo[a.clasificacion].color}`}>
                            {clasificacionByCodigo[a.clasificacion].etiqueta}
                          </span>
                        ) : <span className="text-slate-400 text-xs">—</span>}
                      </td>
                      <td className="table-td"><span className={badgeEstado(a.estado_operativo)}>{a.estado_operativo}</span></td>
                      <td className="table-td text-right space-x-2">
                        <Link to={`/ascensores/${a.id}`} className="text-brand-700 hover:underline text-xs">Historial</Link>
                        {puedeEditar && <button onClick={() => abrirEdit(a)} className="text-slate-600 text-xs">Editar</button>}
                        {puedeEliminar && (a.estado === 0
                          ? <button onClick={() => reactivar(a)} disabled={reactivando === a.id} className="text-emerald-700 text-xs disabled:opacity-50">
                              {reactivando === a.id ? 'Reactivando…' : 'Reactivar'}
                            </button>
                          : <button onClick={() => setAInactivar(a)} className="text-rose-600 text-xs">Marcar como Inactivo</button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="md:hidden divide-y divide-slate-100">
              {data.map(a => (
                <div key={a.id} className="p-4 flex items-start gap-3">
                  <div className="h-10 w-10 rounded-lg bg-brand-50 text-brand-700 grid place-items-center text-xs font-mono">{a.codigo.substring(-3) || 'A'}</div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <Link to={`/ascensores/${a.id}`} className="font-mono text-sm text-brand-700">{a.codigo}</Link>
                      <span className={badgeEstado(a.estado_operativo)}>{a.estado_operativo}</span>
                    </div>
                    <div className="text-sm text-slate-700 truncate">{nombreEdificio(a.edificio)}<span className="text-slate-400"> · {nombreCliente(a.edificio?.cliente)}</span></div>
                    <div className="text-xs text-slate-500">{a.tipo} · {a.marca} {a.modelo}</div>
                    <div className="text-xs text-slate-500">
                      {tipoEdificioByCodigo[a.edificio?.tipo]?.etiqueta || a.edificio?.tipo || '—'}
                      {a.edificio?.distrito && <span> · {a.edificio.distrito}</span>}
                    </div>
                    {a.clasificacion && clasificacionByCodigo[a.clasificacion] && (
                      <span className={`mt-1 inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold ring-1 ${clasificacionByCodigo[a.clasificacion].color}`}>
                        {clasificacionByCodigo[a.clasificacion].etiqueta}
                      </span>
                    )}
                    <div className="mt-2 flex items-center gap-3">
                      {puedeEditar && <button onClick={() => abrirEdit(a)} className="text-xs text-slate-600">Editar</button>}
                      {puedeEliminar && (a.estado === 0
                        ? <button onClick={() => reactivar(a)} disabled={reactivando === a.id} className="text-xs text-emerald-700 disabled:opacity-50">
                            {reactivando === a.id ? 'Reactivando…' : 'Reactivar'}
                          </button>
                        : <button onClick={() => setAInactivar(a)} className="text-xs text-rose-600">Marcar como Inactivo</button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
            <Pagination page={page} pageSize={pageSize} total={total} totalPages={totalPages}
              onPage={setPage} onPageSize={setPageSize} />
          </>
        )}
      </div>

      <Modal open={open} onClose={() => setOpen(false)} title={editId ? 'Editar ascensor' : 'Nuevo ascensor'} size="lg"
        footer={<><button className="btn-secondary" onClick={() => setOpen(false)}>Cancelar</button><button className="btn-primary" type="submit" form="ascensor-form">Guardar</button></>}>
        <AscensorForm
          formId="ascensor-form"
          value={form}
          onChange={setForm}
          onSubmit={guardar}
          tipos={tipos}
          tiposServicio={tiposServicio}
        />
      </Modal>

      <ConfirmarEliminacion
        open={!!aInactivar}
        onClose={() => setAInactivar(null)}
        titulo="Marcar ascensor como Inactivo"
        palabraClave="INACTIVO"
        textoBoton="Marcar como Inactivo"
        onConfirmar={inactivar}
        descripcion={
          <div className="space-y-1.5">
            <p>Al marcar <span className="font-semibold">{aInactivar?.codigo}</span> como Inactivo se da de baja lógica (no se borra físicamente). Esto implica:</p>
            <ul className="list-disc list-inside space-y-1">
              <li>Pasa a estado <span className="font-semibold">Inactivo</span> y sale de la selección para servicios y planes.</li>
              <li>Se cancelan sus planes de mantenimiento; se conserva el historial ya ejecutado o cobrado.</li>
              <li>Seguirá visible aquí filtrando por <span className="font-semibold">Registro: Inactivos</span>, y también en la página del cliente (Ver 360). Puedes reactivarlo desde el botón <span className="font-semibold">Reactivar</span>, pero sus planes cancelados no se recuperan solos.</li>
            </ul>
          </div>
        }
      />
    </>
  );
}
