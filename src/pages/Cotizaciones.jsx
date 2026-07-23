import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  cotizacionesService,
  clientesService,
  edificiosService,
  ascensoresService,
  tiposServicioService,
  configuracionService,
  cuentasBancariasService,
  archivosService,
  assetUrl
} from '../services';
import PageHeader from '../components/common/PageHeader.jsx';
import Loader from '../components/common/Loader.jsx';
import Modal from '../components/common/Modal.jsx';
import ConfirmarEliminacion from '../components/common/ConfirmarEliminacion.jsx';
import EmptyState from '../components/common/EmptyState.jsx';
import Pagination, { usePaginatedList } from '../components/common/Pagination.jsx';
import PadreTabs from '../components/common/PadreTabs.jsx';
import { useToast } from '../components/common/Toast.jsx';
import { useAuth } from '../features/auth/AuthContext.jsx';
import ClienteAutocomplete from '../components/common/ClienteAutocomplete.jsx';
import { badgeEstado, formatFecha, formatMonto, hoyISO, addDaysYMD, nombreEdificioDeAscensores } from '../utils/formatters.js';
import { usePersistentState } from '../utils/usePersistentState.js';
import CuotasEditor, { planCuotasInicial, planCuotasDesdeServidor, planParaPayload } from '../components/cotizaciones/CuotasEditor.jsx';
import { ESTADO_GLOBAL_ANULADO } from '../utils/estadoCotizacion.js';

// La LISTA de estados del filtro no se declara aquí: se pide al backend
// (/cotizaciones/catalogos), que es quien los escribe. Duplicarla en un literal
// fue lo que dejó el filtro ofreciendo valores que la BD no tenía.

const itemVacio = () => ({
  descripcion: '',
  cantidad: 1,
  unidad: 'Unidad',
  precio_unitario: 0,
  descuento_porcentaje: 0,
  // Foto del ítem (obligatoria en correctivos). `archivo` es el objeto subido
  // para previsualizar; `id_archivo` es lo que se envía al backend.
  id_archivo: null,
  archivo: null
});

const ascensorVacio = (modo = 'existente') => ({
  modo, // 'existente' | 'nuevo'
  id_ascensor: '',
  // Un ascensor nuevo se instala en un edificio del cliente (id_edificio).
  ascensor_nuevo: { id_edificio: '', ubicacion: '', pisos: '', capacidad: '', marca: '', modelo: '', descripcion: '' }
});

const formInicial = (preset = {}) => ({
  id_cliente: preset.id_cliente || '',
  id_lead: preset.id_lead || null,
  ascensores: [ascensorVacio()],
  // id_tipo_servicio = PADRE; id_subtipo_servicio = subtipo elegido dentro del padre.
  // El preset (p.ej. desde un lead) trae el subtipo solicitado.
  id_tipo_servicio: '',
  id_subtipo_servicio: preset.id_subtipo_servicio || preset.id_tipo_servicio || '',
  descripcion: '',
  fecha_validez: '',
  moneda: 'PEN',
  observaciones: '',
  sin_igv: false,
  // Ids de las cuentas bancarias a adjuntar en el PDF. Por defecto se marcan
  // todas las activas al abrir el modal.
  cuentas_pdf: [],
  items: [itemVacio()],
  cuotas: planCuotasInicial(),
  archivos: [],
  // Observaciones técnicas de origen (si la cotización se jaló desde el panel de
  // un servicio). Se mandan al crear para que el backend las marque como
  // cotizadas dentro de la misma transacción.
  ids_observaciones: preset.ids_observaciones || [],
  // Cotización de "cobro sobre servicio existente" (emergencia ya atendida). Si
  // viene id_emergencia, el backend fija el servicio y al aprobar NO crea servicio
  // nuevo: solo genera el cobro. `_codigo_servicio_cobro` es solo para el aviso.
  id_emergencia: preset.id_emergencia || null,
  id_servicio_cobro: preset.id_servicio_cobro || null,
  _codigo_servicio_cobro: preset._codigo_servicio_cobro || null
});

function round2(n) {
  return Math.round((Number(n) + Number.EPSILON) * 100) / 100;
}

// Código(s) del/los ascensor(es) de una cotización. Los existentes traen `codigo`;
// los que la cotización describe como "nuevos" (a instalar) aún no tienen código,
// se cuentan aparte para mostrarlos como "N nuevo(s)".
function ascensoresCotizacion(c) {
  const rows = c?.ascensores || [];
  const codigos = rows.map(a => a.ascensor?.codigo).filter(Boolean);
  const nuevos = rows.filter(a => !a.ascensor && a.ascensor_nuevo).length;
  return { codigos, nuevos };
}

function calcImporte(it) {
  const cant = Number(it.cantidad) || 0;
  const pu = Number(it.precio_unitario) || 0;
  const desc = Number(it.descuento_porcentaje) || 0;
  return round2(cant * pu * (1 - desc / 100));
}

export default function Cotizaciones() {
  const [clientes, setClientes] = useState([]);
  const [ascensores, setAscensores] = useState([]);
  const [edificiosCliente, setEdificiosCliente] = useState([]);
  const [tipos, setTipos] = useState([]);
  const [cuentas, setCuentas] = useState([]);
  const [igvTasa, setIgvTasa] = useState(0.18);
  const [validezDefaultDias, setValidezDefaultDias] = useState(15);
  // Filtros persistidos: siguen activos al abrir una cotización y volver.
  const [filtros, setFiltros] = usePersistentState('cotizaciones:filtros', { q: '', estado_global: '', id_cliente: '', id_tipo_servicio: '', desde: '', hasta: '', incluir_anuladas: '' });
  // Estados posibles según el backend (SSoT). Se cargan una vez al montar.
  const [estadosGlobales, setEstadosGlobales] = useState([]);
  // Filtros "virtuales" (p.ej. 'Aprobadas' = todas las aceptadas, incluidas las
  // que ya pasaron a ejecución). También vienen del backend para no duplicarlos.
  const [filtrosGlobales, setFiltrosGlobales] = useState([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(formInicial);
  // Código de la cotización origen cuando el modal se abre en modo "duplicar".
  const [duplicandoDe, setDuplicandoDe] = useState(null);
  const [saving, setSaving] = useState(false);
  const [subiendoAdjuntos, setSubiendoAdjuntos] = useState(false);
  const { esSuperAdmin, esAdmin, accesoServicios, accesoProyectos } = useAuth();
  const puedeCrear = esSuperAdmin || esAdmin;
  const [aEliminar, setAEliminar] = useState(null);
  const toast = useToast();

  const [searchParams, setSearchParams] = useSearchParams();

  const { data, loading, total, page, pageSize, totalPages, setPage, setPageSize, recargar } =
    usePaginatedList(cotizacionesService.paginate, filtros, { initialPageSize: 25 });

  // Abre modal automáticamente si llega ?nuevo=1, con preselección del lead/cliente.
  // Si además viene ?observaciones=, lo maneja el efecto de abajo (que necesita
  // resolverlas contra el backend antes de armar el formulario).
  useEffect(() => {
    if (searchParams.get('observaciones') || searchParams.get('emergencia')) return;
    if (searchParams.get('nuevo') === '1' && puedeCrear) {
      setForm({
        ...formInicial({
          id_cliente: searchParams.get('id_cliente') || '',
          id_lead: searchParams.get('id_lead') ? Number(searchParams.get('id_lead')) : null,
          id_tipo_servicio: searchParams.get('id_tipo_servicio') || ''
        }),
        fecha_validez: addDaysYMD(null, validezDefaultDias),
        cuentas_pdf: cuentas.map(c => c.id)
      });
      setOpen(true);
      // limpia los params para que recargar la página no reabra el modal
      const next = new URLSearchParams(searchParams);
      ['nuevo', 'id_cliente', 'id_lead', 'id_tipo_servicio'].forEach(k => next.delete(k));
      setSearchParams(next, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, puedeCrear, validezDefaultDias]);

  // Abre el modal prellenado desde observaciones técnicas (?observaciones=1,2,3),
  // jaladas desde el panel de observaciones de un servicio. El backend resuelve
  // cliente, ascensores del servicio origen y un ítem (texto + foto) por
  // observación. El subtipo lo elige el admin: la observación no lo guarda.
  useEffect(() => {
    const idsParam = searchParams.get('observaciones');
    if (!idsParam || !puedeCrear) return;
    const ids = idsParam.split(',').map(Number).filter(n => Number.isInteger(n) && n > 0);
    if (ids.length === 0) return;

    // Limpia los params de entrada: el prellenado ocurre una sola vez.
    const next = new URLSearchParams(searchParams);
    ['nuevo', 'observaciones'].forEach(k => next.delete(k));
    setSearchParams(next, { replace: true });

    cotizacionesService.desdeObservaciones(ids)
      .then(prefill => {
        setForm({
          ...formInicial({
            id_cliente: String(prefill.id_cliente || ''),
            ids_observaciones: prefill.items.map(it => it.id_observacion)
          }),
          fecha_validez: addDaysYMD(null, validezDefaultDias),
          cuentas_pdf: cuentas.map(c => c.id),
          // Si el servicio cubre un solo ascensor se preselecciona; con varios se
          // deja vacío para que el admin elija cuál se cotiza.
          ascensores: prefill.ascensores.length === 1
            ? [{ ...ascensorVacio(), id_ascensor: String(prefill.ascensores[0].id) }]
            : [ascensorVacio()],
          descripcion: `Observaciones técnicas del servicio ${prefill.codigo_servicio}`,
          items: prefill.items.map(it => ({
            ...itemVacio(),
            descripcion: it.descripcion,
            id_archivo: it.id_archivo,
            archivo: it.archivo
          }))
        });
        setOpen(true);
        if (prefill.ascensores.length > 1) {
          toast.info('El servicio cubre varios ascensores: elige cuál se cotiza.');
        }
      })
      .catch(err => toast.error(err.response?.data?.error || 'No se pudo preparar la cotización'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, puedeCrear, validezDefaultDias]);

  // Abre el modal prellenado desde una emergencia ya atendida (?emergencia=ID).
  // El backend valida que el servicio de la emergencia esté finalizado y sin cobro
  // con movimiento, y devuelve cliente, ascensor, subtipo y un ítem (motivo+foto).
  // Al aprobar se generará un cobro SIN crear un servicio nuevo.
  useEffect(() => {
    const emId = searchParams.get('emergencia');
    if (!emId || !puedeCrear) return;
    const idEmergencia = Number(emId);
    if (!Number.isInteger(idEmergencia) || idEmergencia <= 0) return;

    const next = new URLSearchParams(searchParams);
    ['nuevo', 'emergencia'].forEach(k => next.delete(k));
    setSearchParams(next, { replace: true });

    cotizacionesService.desdeEmergencia(idEmergencia)
      .then(prefill => {
        setForm({
          ...formInicial({
            id_cliente: String(prefill.id_cliente || ''),
            id_emergencia: prefill.id_emergencia,
            id_servicio_cobro: prefill.id_servicio_cobro,
            _codigo_servicio_cobro: prefill.codigo_servicio
          }),
          // Subtipo (y su padre) heredados del servicio de la emergencia.
          id_tipo_servicio: prefill.id_tipo_servicio ? String(prefill.id_tipo_servicio) : '',
          id_subtipo_servicio: prefill.id_subtipo_servicio ? String(prefill.id_subtipo_servicio) : '',
          fecha_validez: addDaysYMD(null, validezDefaultDias),
          moneda: prefill.moneda || 'PEN',
          cuentas_pdf: cuentas.map(c => c.id),
          ascensores: prefill.ascensor
            ? [{ ...ascensorVacio(), id_ascensor: String(prefill.ascensor.id) }]
            : [ascensorVacio()],
          descripcion: `Cobro de emergencia — servicio ${prefill.codigo_servicio}`,
          items: [{
            ...itemVacio(),
            descripcion: prefill.item?.descripcion || '',
            id_archivo: prefill.item?.id_archivo || null,
            archivo: prefill.item?.archivo || null
          }]
        });
        setOpen(true);
      })
      .catch(err => toast.error(err.response?.data?.error || 'No se pudo preparar la cotización de la emergencia'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, puedeCrear, validezDefaultDias]);

  // Abre el modal en modo "duplicar" si llega ?duplicar=ID (p.ej. desde el detalle).
  useEffect(() => {
    const dupId = searchParams.get('duplicar');
    if (dupId && puedeCrear) {
      duplicar(Number(dupId));
      const next = new URLSearchParams(searchParams);
      next.delete('duplicar');
      setSearchParams(next, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, puedeCrear, validezDefaultDias]);

  useEffect(() => {
    Promise.all([
      clientesService.list(),
      ascensoresService.list(),
      tiposServicioService.list(),
      configuracionService.get('IGV_RATE').catch(() => ({ valor: 0.18 })),
      configuracionService.get('COTIZACION_VALIDEZ_DIAS').catch(() => ({ valor: 15 })),
      cuentasBancariasService.list().catch(() => []),
      cotizacionesService.catalogos().catch(() => ({ estados_globales: [], filtros_globales: [] }))
    ]).then(([cs, as, ts, igv, val, ctas, cat]) => {
      setClientes(cs);
      setAscensores(as);
      setTipos(ts);
      setIgvTasa(Number(igv.valor) || 0.18);
      setValidezDefaultDias(Number(val.valor) || 15);
      setCuentas(Array.isArray(ctas) ? ctas : []);
      setEstadosGlobales(cat?.estados_globales || []);
      setFiltrosGlobales(cat?.filtros_globales || []);
    });
  }, []);

  const abrirModal = () => {
    setDuplicandoDe(null);
    setForm({ ...formInicial(), fecha_validez: addDaysYMD(null, validezDefaultDias), cuentas_pdf: cuentas.map(c => c.id) });
    setOpen(true);
  };

  const cerrarModal = () => {
    setOpen(false);
    setDuplicandoDe(null);
  };

  // Mapea una cotización (con su versión activa e items) a la forma del
  // formulario de "Nueva cotización", para duplicarla. Todo queda editable.
  const cotizacionAFormulario = (cot) => {
    const v = (cot.versiones || []).find(x => x.numero_version === cot.version_activa) || (cot.versiones || [])[0] || {};
    return {
      ...formInicial(),
      id_cliente: cot.id_cliente ? String(cot.id_cliente) : '',
      id_lead: null,
      id_tipo_servicio: cot.tipo_servicio?.id ? String(cot.tipo_servicio.id) : '',
      id_subtipo_servicio: cot.subtipo_servicio?.id ? String(cot.subtipo_servicio.id) : '',
      descripcion: cot.descripcion || '',
      moneda: v.moneda || 'PEN',
      observaciones: v.observaciones || '',
      sin_igv: !!v.sin_igv,
      // Si la original tenía selección de cuentas la copiamos; si era legacy
      // (null) marcamos todas las activas, igual que una cotización nueva.
      cuentas_pdf: Array.isArray(v.cuentas_pdf) ? v.cuentas_pdf : cuentas.map(c => c.id),
      // Validez nueva (la original suele estar vencida) y sin adjuntos.
      fecha_validez: addDaysYMD(null, validezDefaultDias),
      archivos: [],
      ascensores: (cot.ascensores || []).length
        ? cot.ascensores.map(a => a.id_ascensor
            ? { modo: 'existente', id_ascensor: String(a.id_ascensor), ascensor_nuevo: ascensorVacio().ascensor_nuevo }
            : {
                modo: 'nuevo', id_ascensor: '',
                ascensor_nuevo: {
                  id_edificio: a.ascensor_nuevo?.id_edificio ? String(a.ascensor_nuevo.id_edificio) : '',
                  ubicacion: a.ascensor_nuevo?.ubicacion || '',
                  pisos: a.ascensor_nuevo?.pisos != null ? String(a.ascensor_nuevo.pisos) : '',
                  capacidad: a.ascensor_nuevo?.capacidad || '',
                  marca: a.ascensor_nuevo?.marca || '',
                  modelo: a.ascensor_nuevo?.modelo || '',
                  descripcion: a.ascensor_nuevo?.descripcion || ''
                }
              })
        : [ascensorVacio()],
      items: (v.items || []).length
        ? v.items.map(it => ({
            descripcion: it.descripcion || '',
            cantidad: Number(it.cantidad) || 1,
            unidad: it.unidad || 'Unidad',
            precio_unitario: Number(it.precio_unitario) || 0,
            descuento_porcentaje: Number(it.descuento_porcentaje) || 0,
            id_archivo: it.id_archivo || null,
            archivo: it.archivo || null
          }))
        : [itemVacio()],
      cuotas: planCuotasDesdeServidor(v)
    };
  };

  const duplicar = async (id) => {
    try {
      const cot = await cotizacionesService.get(id);
      setForm(cotizacionAFormulario(cot));
      setDuplicandoDe(cot.codigo || null);
      setOpen(true);
    } catch (err) {
      toast.error(err.response?.data?.error || 'No se pudo cargar la cotización a duplicar');
    }
  };

  // Jerarquía de tipos: padres y subtipos del padre seleccionado en el form.
  // Solo los tipos padre del/los ámbito(s) del usuario: un rol de área cotiza
  // únicamente en su categoría funcional (Servicios/Proyectos).
  const padresTipo = useMemo(
    () => tipos.filter(t => t.es_padre && (t.categoria_funcional === 'PROYECTOS' ? accesoProyectos : accesoServicios)),
    [tipos, accesoServicios, accesoProyectos]
  );
  const subtiposDelPadre = useMemo(
    () => tipos.filter(t => !t.es_padre && String(t.id_padre) === String(form.id_tipo_servicio)),
    [tipos, form.id_tipo_servicio]
  );

  // Si llega un subtipo preseleccionado (p.ej. desde un lead) y aún no se resolvió
  // su padre, derivarlo del catálogo una vez cargado.
  useEffect(() => {
    if (!form.id_subtipo_servicio || form.id_tipo_servicio) return;
    const sub = tipos.find(t => String(t.id) === String(form.id_subtipo_servicio));
    if (sub?.id_padre) setForm(f => ({ ...f, id_tipo_servicio: String(sub.id_padre) }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tipos, form.id_subtipo_servicio]);

  const ascensoresDelCliente = form.id_cliente
    ? ascensores.filter(a => String(a.edificio?.cliente?.id) === String(form.id_cliente))
    : [];

  // Subtipo elegido: en correctivos la foto de cada ítem es obligatoria.
  const subtipoSel = tipos.find(t => String(t.id) === String(form.id_subtipo_servicio));
  const esCorrectivo = subtipoSel?.modulo_asociado === 'correctivo';
  // Los servicios operativos (con módulo: correctivo/emergencia/mantenimiento/…)
  // se cotizan para un solo ascensor. Los Proyectos (sin módulo) admiten varios.
  const esServicioUnAscensor = !!subtipoSel?.modulo_asociado;

  // Al elegir subtipo: si es un servicio operativo, recorta a un solo ascensor.
  const cambiarSubtipoCot = (id) => {
    const sub = tipos.find(t => String(t.id) === String(id));
    const unAsc = !!sub?.modulo_asociado;
    setForm(f => ({
      ...f,
      id_subtipo_servicio: id,
      ascensores: unAsc && f.ascensores.length > 1 ? [f.ascensores[0]] : f.ascensores
    }));
  };

  // Edificios del cliente elegido (para colocar ascensores nuevos).
  useEffect(() => {
    if (!form.id_cliente) { setEdificiosCliente([]); return; }
    let vivo = true;
    edificiosService.list({ id_cliente: form.id_cliente }).then(d => { if (vivo) setEdificiosCliente(d || []); }).catch(() => { if (vivo) setEdificiosCliente([]); });
    return () => { vivo = false; };
  }, [form.id_cliente]);

  const cambiarItem = (idx, key, val) => {
    setForm(f => ({
      ...f,
      items: f.items.map((it, i) => i === idx ? { ...it, [key]: val } : it)
    }));
  };
  const agregarItem = () => setForm(f => ({ ...f, items: [...f.items, itemVacio()] }));
  const quitarItem = (idx) => setForm(f => ({ ...f, items: f.items.filter((_, i) => i !== idx) }));

  const subirFotoItem = async (idx, e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      const fd = new FormData();
      fd.append('archivo', file);
      const arch = await archivosService.upload(fd, 'cotizaciones');
      setForm(f => ({ ...f, items: f.items.map((it, i) => i === idx ? { ...it, id_archivo: arch.id, archivo: arch } : it) }));
    } catch {
      toast.error('Error al subir la foto del ítem');
    }
  };
  const quitarFotoItem = (idx) => setForm(f => ({ ...f, items: f.items.map((it, i) => i === idx ? { ...it, id_archivo: null, archivo: null } : it) }));

  const cambiarAscensor = (idx, key, val) => {
    setForm(f => ({
      ...f,
      ascensores: f.ascensores.map((a, i) => i === idx ? { ...a, [key]: val } : a)
    }));
  };
  const cambiarAscensorNuevo = (idx, key, val) => {
    setForm(f => ({
      ...f,
      ascensores: f.ascensores.map((a, i) => i === idx
        ? { ...a, ascensor_nuevo: { ...a.ascensor_nuevo, [key]: val } }
        : a)
    }));
  };
  const agregarAscensor = () => setForm(f => ({ ...f, ascensores: [...f.ascensores, ascensorVacio()] }));
  const quitarAscensor = (idx) => setForm(f => ({
    ...f,
    ascensores: f.ascensores.length > 1 ? f.ascensores.filter((_, i) => i !== idx) : f.ascensores
  }));

  const subirAdjuntos = async (e) => {
    const files = Array.from(e.target.files || []);
    e.target.value = '';
    if (files.length === 0) return;
    setSubiendoAdjuntos(true);
    try {
      const nuevos = [];
      for (const file of files) {
        const fd = new FormData();
        fd.append('archivo', file);
        const arch = await archivosService.upload(fd, 'cotizaciones');
        nuevos.push(arch);
      }
      setForm(f => ({ ...f, archivos: [...f.archivos, ...nuevos] }));
      toast.success(`${nuevos.length} archivo(s) adjuntado(s)`);
    } catch {
      toast.error('Error al adjuntar archivo(s)');
    } finally {
      setSubiendoAdjuntos(false);
    }
  };
  const quitarAdjunto = (idArchivo) => {
    setForm(f => ({ ...f, archivos: f.archivos.filter(a => a.id !== idArchivo) }));
  };

  const subtotal = round2(form.items.reduce((acc, it) => acc + calcImporte(it), 0));
  const igvCalc = form.sin_igv ? 0 : round2(subtotal * igvTasa);
  const totalCalc = round2(subtotal + igvCalc);

  const guardar = async (e) => {
    e.preventDefault();
    if (saving) return;
    if (!form.id_cliente) return toast.error('Selecciona un cliente');
    if (!form.id_tipo_servicio) return toast.error('Selecciona un tipo de servicio (padre)');
    if (!form.id_subtipo_servicio) return toast.error('Selecciona un subtipo de servicio');
    if (!form.fecha_validez) return toast.error('Fecha de validez obligatoria');
    if (!form.ascensores.length) return toast.error('Agrega al menos un ascensor');
    if (esServicioUnAscensor && form.ascensores.length > 1) {
      return toast.error('Un servicio (correctivo, emergencia o mantenimiento) se cotiza para un solo ascensor.');
    }
    for (let i = 0; i < form.ascensores.length; i++) {
      const a = form.ascensores[i];
      if (a.modo === 'existente' && !a.id_ascensor) {
        return toast.error(`Ascensor #${i + 1}: selecciona uno o cámbialo a "Nuevo (instalación)"`);
      }
      if (a.modo === 'nuevo' && !a.ascensor_nuevo.id_edificio) {
        return toast.error(`Ascensor #${i + 1}: elige el edificio donde se instala`);
      }
      if (a.modo === 'nuevo' && !a.ascensor_nuevo.ubicacion && !a.ascensor_nuevo.descripcion) {
        return toast.error(`Ascensor #${i + 1}: describe el ascensor nuevo (ubicación o descripción)`);
      }
    }
    if (form.items.length === 0 || form.items.every(it => !it.descripcion.trim())) {
      return toast.error('Agrega al menos un item con descripción');
    }
    // En correctivos, cada ítem con descripción debe tener foto.
    if (esCorrectivo && form.items.some(it => it.descripcion.trim() && !it.id_archivo)) {
      return toast.error('En una cotización de correctivo, cada ítem debe incluir una foto.');
    }

    let payloadCuotas;
    try {
      payloadCuotas = planParaPayload(form.cuotas, totalCalc);
    } catch (err) {
      return toast.error(err.message);
    }

    setSaving(true);
    try {
      await cotizacionesService.create({
        id_cliente: Number(form.id_cliente),
        id_lead: form.id_lead || null,
        ascensores: form.ascensores.map((a, idx) => ({
          orden: idx + 1,
          id_ascensor: a.modo === 'existente' ? Number(a.id_ascensor) : null,
          ascensor_nuevo: a.modo === 'nuevo' ? {
            id_edificio: Number(a.ascensor_nuevo.id_edificio),
            ubicacion: a.ascensor_nuevo.ubicacion || null,
            pisos: a.ascensor_nuevo.pisos ? Number(a.ascensor_nuevo.pisos) : null,
            capacidad: a.ascensor_nuevo.capacidad || null,
            marca: a.ascensor_nuevo.marca || null,
            modelo: a.ascensor_nuevo.modelo || null,
            descripcion: a.ascensor_nuevo.descripcion || null
          } : null
        })),
        id_tipo_servicio: Number(form.id_tipo_servicio),
        id_subtipo_servicio: Number(form.id_subtipo_servicio),
        descripcion: form.descripcion || null,
        fecha_validez: form.fecha_validez,
        moneda: form.moneda,
        observaciones: form.observaciones || null,
        sin_igv: form.sin_igv,
        cuentas_pdf: form.cuentas_pdf,
        items: form.items
          .filter(it => it.descripcion.trim())
          .map((it, i) => ({
            orden: i + 1,
            descripcion: it.descripcion,
            cantidad: Number(it.cantidad) || 1,
            unidad: it.unidad || 'Unidad',
            precio_unitario: Number(it.precio_unitario) || 0,
            descuento_porcentaje: Number(it.descuento_porcentaje) || 0,
            id_archivo: it.id_archivo || null
          })),
        tiene_cuotas: payloadCuotas.tiene_cuotas,
        plan_cuotas: payloadCuotas.plan_cuotas,
        saldo_variable: payloadCuotas.saldo_variable,
        archivos: form.archivos.map(a => a.id),
        ids_observaciones: form.ids_observaciones,
        // Emergencia de origen: el backend fija id_servicio_cobro (cobro sobre
        // servicio existente, sin crear servicio nuevo al aprobar).
        id_emergencia: form.id_emergencia || null
      });
      toast.success('Cotización creada');
      setOpen(false);
      setDuplicandoDe(null);
      recargar();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Error al crear cotización');
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <PageHeader
        title="Cotizaciones"
        subtitle={`${total} registro(s)`}
        actions={
          <div className="flex flex-wrap gap-2">
            {puedeCrear && (
              <button onClick={abrirModal} className="btn-primary">+ Nueva cotización</button>
            )}
          </div>
        }
      />

      <PadreTabs
        padres={padresTipo}
        value={filtros.id_tipo_servicio}
        onChange={k => setFiltros(f => ({ ...f, id_tipo_servicio: k }))}
      />

      <div className="card mb-4">
        <div className="p-4 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
          <input className="input col-span-2" placeholder="Buscar por código, edificio/obra, cliente, tipo de ascensor o servicio…" value={filtros.q}
            onChange={e => setFiltros(f => ({ ...f, q: e.target.value }))} />
          <select className="select" value={filtros.estado_global} onChange={e => setFiltros(f => ({ ...f, estado_global: e.target.value }))}>
            <option value="">Todos los estados</option>
            {estadosGlobales.flatMap(s => [
              <option key={s} value={s}>{s}</option>,
              // Inserta cada filtro virtual justo después del estado real al que
              // acompaña (p.ej. 'Aceptadas (incluye ejecución)' tras 'Aceptado').
              ...filtrosGlobales
                .filter(f => f.despues_de === s)
                .map(f => <option key={f.valor} value={f.valor}>{f.etiqueta}</option>)
            ])}
          </select>
          <ClienteAutocomplete
            clientes={clientes}
            value={filtros.id_cliente}
            onChange={id => setFiltros(f => ({ ...f, id_cliente: id }))}
            placeholder="Cliente (buscar…)"
            allowEmpty
            emptyLabel="Todos los clientes"
          />
          <input type="date" className="input" value={filtros.desde} onChange={e => setFiltros(f => ({ ...f, desde: e.target.value }))} />
          <input type="date" className="input" value={filtros.hasta} onChange={e => setFiltros(f => ({ ...f, hasta: e.target.value }))} />
          <label className="flex items-center gap-2 text-sm text-slate-600 cursor-pointer col-span-2 sm:col-span-1">
            <input
              type="checkbox"
              checked={filtros.incluir_anuladas === '1'}
              onChange={e => setFiltros(f => ({ ...f, incluir_anuladas: e.target.checked ? '1' : '' }))}
            />
            Mostrar anuladas
          </label>
        </div>
      </div>

      <div className="card">
        {loading ? <Loader /> : data.length === 0 ? <EmptyState title="Sin cotizaciones" /> : (
          <>
            <div className="hidden md:block overflow-x-auto scroll-thin">
              <table className="table-base">
                <thead>
                  <tr>
                    <th className="table-th">Código</th>
                    <th className="table-th">Cliente</th>
                    <th className="table-th">Ascensor(es)</th>
                    <th className="table-th">Tipo</th>
                    <th className="table-th">Versión</th>
                    <th className="table-th">Validez</th>
                    <th className="table-th text-right">Monto</th>
                    <th className="table-th">Estado versión</th>
                    <th className="table-th">Estado global</th>
                    <th className="table-th">Servicio</th>
                    <th className="table-th text-right">Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {data.map(c => {
                    const v = c.versiones?.[0];
                    return (
                      <tr key={c.id} className="table-row-hover">
                        <td className="table-td"><Link to={`/cotizaciones/${c.id}`} className="font-mono text-brand-700 hover:underline">{c.codigo}</Link></td>
                        <td className="table-td">{nombreEdificioDeAscensores(c) || '—'}</td>
                        <td className="table-td">
                          {(() => {
                            const { codigos, nuevos } = ascensoresCotizacion(c);
                            if (codigos.length === 0 && nuevos === 0) return <span className="text-carbon-400">—</span>;
                            return (
                              <div className="flex flex-wrap items-center gap-1">
                                {codigos.length > 0 && <span className="font-mono text-xs text-carbon-700">{codigos.join(', ')}</span>}
                                {nuevos > 0 && <span className="badge badge-amber text-[10px]">{nuevos} nuevo{nuevos > 1 ? 's' : ''}</span>}
                              </div>
                            );
                          })()}
                        </td>
                        <td className="table-td">{c.subtipo_servicio?.nombre || c.tipo_servicio?.nombre || '—'}</td>
                        <td className="table-td">v{v?.numero_version || c.version_activa}</td>
                        <td className="table-td">{formatFecha(v?.fecha_validez)}</td>
                        <td className="table-td text-right">{formatMonto(v?.monto_total, v?.moneda)}</td>
                        <td className="table-td"><span className={`badge ${badgeEstado(v?.estado_version)}`}>{v?.estado_version || '—'}</span></td>
                        <td className="table-td"><span className={`badge ${badgeEstado(c.estado_global)}`}>{c.estado_global}</span></td>
                        <td className="table-td">
                          {c.servicios?.length > 0 ? (
                            <div className="flex flex-col gap-1">
                              {c.servicios.map(s => (
                                <div key={s.id} className="flex items-center gap-1.5">
                                  <Link to={`/servicios/${s.id}`} className="font-mono text-xs text-brand-700 hover:underline">{s.codigo}</Link>
                                  <span className={`badge ${badgeEstado(s.estado_servicio)}`}>{s.estado_servicio}</span>
                                </div>
                              ))}
                            </div>
                          ) : <span className="text-carbon-400">—</span>}
                        </td>
                        <td className="table-td text-right whitespace-nowrap">
                          {puedeCrear && (
                            <button onClick={() => duplicar(c.id)} className="btn-ghost text-xs !py-1.5 !px-3 mr-1">Duplicar</button>
                          )}
                          <Link to={`/cotizaciones/${c.id}`} className="btn-ghost text-xs !py-1.5 !px-3">Abrir</Link>
                          {esSuperAdmin && c.estado_global !== ESTADO_GLOBAL_ANULADO && (
                            <button onClick={() => setAEliminar(c)} className="btn-ghost text-xs !py-1.5 !px-3 ml-1 !text-rose-600">Eliminar</button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="md:hidden divide-y divide-carbon-100">
              {data.map(c => {
                const v = c.versiones?.[0];
                return (
                  <Link to={`/cotizaciones/${c.id}`} key={c.id} className="block p-4 hover:bg-ivory-50">
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-mono text-sm text-brand-700">{c.codigo}</span>
                      <span className={`badge ${badgeEstado(c.estado_global)}`}>{c.estado_global}</span>
                    </div>
                    <div className="text-sm text-carbon-800 font-medium">{nombreEdificioDeAscensores(c)}</div>
                    {(() => {
                      const { codigos, nuevos } = ascensoresCotizacion(c);
                      if (codigos.length === 0 && nuevos === 0) return null;
                      return (
                        <div className="text-xs text-carbon-500 mt-0.5 flex flex-wrap items-center gap-1">
                          {codigos.length > 0 && <span className="font-mono text-carbon-600">{codigos.join(', ')}</span>}
                          {nuevos > 0 && <span className="badge badge-amber text-[10px]">{nuevos} nuevo{nuevos > 1 ? 's' : ''}</span>}
                        </div>
                      );
                    })()}
                    <div className="text-xs text-carbon-500 mt-0.5">{c.subtipo_servicio?.nombre || c.tipo_servicio?.nombre} • v{v?.numero_version}</div>
                    <div className="mt-1.5 flex justify-between text-xs">
                      <span className={`badge ${badgeEstado(v?.estado_version)}`}>{v?.estado_version}</span>
                      <span className="font-medium">{formatMonto(v?.monto_total, v?.moneda)}</span>
                    </div>
                    {c.servicios?.length > 0 && (
                      <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-xs">
                        <span className="text-carbon-500">Servicio:</span>
                        {c.servicios.map(s => (
                          <span key={s.id} className="inline-flex items-center gap-1">
                            <span className="font-mono text-brand-700">{s.codigo}</span>
                            <span className={`badge ${badgeEstado(s.estado_servicio)}`}>{s.estado_servicio}</span>
                          </span>
                        ))}
                      </div>
                    )}
                  </Link>
                );
              })}
            </div>

            <Pagination page={page} pageSize={pageSize} total={total} totalPages={totalPages}
              onPage={setPage} onPageSize={setPageSize} />
          </>
        )}
      </div>

      <Modal
        open={open}
        onClose={cerrarModal}
        title={duplicandoDe ? `Nueva cotización (duplicada de ${duplicandoDe})` : 'Nueva cotización'}
        size="xl"
        footer={
          <>
            <button onClick={cerrarModal} className="btn-ghost">Cancelar</button>
            <button type="submit" form="form-cotizacion" disabled={saving} className="btn-primary">
              {saving ? 'Guardando…' : 'Crear cotización'}
            </button>
          </>
        }
      >
        <form id="form-cotizacion" onSubmit={guardar} className="space-y-4">
          {form.id_servicio_cobro && (
            <div className="rounded-md bg-amber-50 ring-1 ring-amber-200 p-3 text-xs text-amber-800">
              <span className="font-semibold">Cobro de emergencia.</span>{' '}
              Al aprobar <span className="font-semibold">no se creará un servicio nuevo</span>: se generará el cobro
              sobre el servicio existente{form._codigo_servicio_cobro ? ` ${form._codigo_servicio_cobro}` : ''} y quedará facturable.
            </div>
          )}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="label">Cliente *</label>
              <ClienteAutocomplete
                clientes={clientes}
                value={form.id_cliente}
                onChange={id => setForm(f => ({
                  ...f,
                  id_cliente: id,
                  // El selector "existente" filtra por cliente; al cambiarlo, los ids
                  // previos quedan inválidos. Mantenemos la cantidad de filas y su modo
                  // para no perder lo que el usuario empezó a escribir en "nuevo".
                  ascensores: f.ascensores.map(a => a.modo === 'existente' ? { ...a, id_ascensor: '' } : a)
                }))}
                placeholder="Buscar cliente por nombre, RUC o teléfono…"
                required
              />
            </div>
            <div>
              <label className="label">Tipo de servicio (padre) *</label>
              <select className="select" value={form.id_tipo_servicio}
                onChange={e => setForm(f => ({ ...f, id_tipo_servicio: e.target.value, id_subtipo_servicio: '' }))}>
                <option value="">— Selecciona —</option>
                {padresTipo.map(t => <option key={t.id} value={t.id}>{t.nombre} ({t.categoria_funcional === 'PROYECTOS' ? 'Proyectos' : 'Servicios'})</option>)}
              </select>
            </div>
            <div>
              <label className="label">Subtipo *</label>
              <select className="select" value={form.id_subtipo_servicio}
                onChange={e => cambiarSubtipoCot(e.target.value)}
                disabled={!form.id_tipo_servicio}>
                <option value="">{form.id_tipo_servicio ? '— Selecciona —' : 'Elige primero el tipo padre'}</option>
                {subtiposDelPadre.map(t => <option key={t.id} value={t.id}>{t.nombre}</option>)}
              </select>
            </div>
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <label className="label !mb-0">{esServicioUnAscensor ? 'Ascensor *' : 'Ascensores *'}</label>
              {!esServicioUnAscensor && (
                <button type="button" onClick={agregarAscensor} className="btn-ghost text-xs !py-1.5 !px-3">
                  + Agregar ascensor
                </button>
              )}
            </div>
            {esServicioUnAscensor && (
              <p className="text-[11px] text-carbon-500 -mt-1">Los servicios (correctivo, emergencia, mantenimiento) se cotizan para un solo ascensor. Para otro ascensor, cree una cotización aparte.</p>
            )}
            {form.ascensores.map((a, idx) => (
              <div key={idx} className="border border-carbon-200 rounded-lg p-3 space-y-2 bg-ivory-50/40">
                <div className="flex items-center justify-between">
                  <div className="text-xs font-semibold text-carbon-700">Ascensor #{idx + 1}</div>
                  <div className="flex items-center gap-3 text-xs">
                    <label className="inline-flex items-center gap-1.5">
                      <input type="radio" name={`ascensor_modo_${idx}`} checked={a.modo === 'existente'}
                        onChange={() => cambiarAscensor(idx, 'modo', 'existente')} />
                      Existente
                    </label>
                    <label className="inline-flex items-center gap-1.5">
                      <input type="radio" name={`ascensor_modo_${idx}`} checked={a.modo === 'nuevo'}
                        onChange={() => cambiarAscensor(idx, 'modo', 'nuevo')} />
                      Nuevo (instalación)
                    </label>
                    {form.ascensores.length > 1 && (
                      <button type="button" onClick={() => quitarAscensor(idx)}
                        className="text-carbon-400 hover:text-red-600 text-base leading-none ml-1" title="Eliminar ascensor">×</button>
                    )}
                  </div>
                </div>
                {a.modo === 'existente' ? (
                  <select className="select" value={a.id_ascensor}
                    disabled={!form.id_cliente}
                    onChange={e => cambiarAscensor(idx, 'id_ascensor', e.target.value)}>
                    <option value="">
                      {!form.id_cliente
                        ? '— Selecciona un cliente primero —'
                        : ascensoresDelCliente.length === 0
                          ? '— Este cliente no tiene ascensores registrados —'
                          : '— Selecciona ascensor —'}
                    </option>
                    {ascensoresDelCliente.map(x => (
                      <option key={x.id} value={x.id}>
                        {x.codigo}{x.edificio?.nombre ? ` — ${x.edificio.nombre}` : ''}{x.ubicacion ? ` · ${x.ubicacion}` : ''}
                      </option>
                    ))}
                  </select>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <select className="select sm:col-span-2" required disabled={!form.id_cliente}
                      value={a.ascensor_nuevo.id_edificio}
                      onChange={e => cambiarAscensorNuevo(idx, 'id_edificio', e.target.value)}>
                      <option value="">{form.id_cliente ? (edificiosCliente.length ? '— Edificio / obra donde se instala —' : 'Este cliente no tiene edificios; créalo en su ficha') : '— Selecciona un cliente primero —'}</option>
                      {edificiosCliente.map(ed => <option key={ed.id} value={ed.id}>{ed.nombre}{ed.tipo ? ` · ${ed.tipo}` : ''}</option>)}
                    </select>
                    <input className="input" placeholder="Ubicación (piso / zona)" value={a.ascensor_nuevo.ubicacion}
                      onChange={e => cambiarAscensorNuevo(idx, 'ubicacion', e.target.value)} />
                    <input className="input" type="number" placeholder="Pisos" value={a.ascensor_nuevo.pisos}
                      onChange={e => cambiarAscensorNuevo(idx, 'pisos', e.target.value)} />
                    <input className="input" placeholder="Capacidad (kg / personas)" value={a.ascensor_nuevo.capacidad}
                      onChange={e => cambiarAscensorNuevo(idx, 'capacidad', e.target.value)} />
                    <input className="input" placeholder="Marca esperada" value={a.ascensor_nuevo.marca}
                      onChange={e => cambiarAscensorNuevo(idx, 'marca', e.target.value)} />
                    <textarea className="textarea sm:col-span-2" rows="2" placeholder="Descripción / observaciones"
                      value={a.ascensor_nuevo.descripcion}
                      onChange={e => cambiarAscensorNuevo(idx, 'descripcion', e.target.value)} />
                  </div>
                )}
              </div>
            ))}
          </div>

          <div>
            <label className="label">Descripción</label>
            <textarea className="textarea" rows="2" value={form.descripcion}
              onChange={e => setForm(f => ({ ...f, descripcion: e.target.value }))} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Validez (fecha) *</label>
              <input type="date" className="input" value={form.fecha_validez}
                onChange={e => setForm(f => ({ ...f, fecha_validez: e.target.value }))} />
            </div>
            <div>
              <label className="label">Moneda</label>
              <select className="select" value={form.moneda} onChange={e => setForm(f => ({ ...f, moneda: e.target.value }))}>
                <option value="PEN">PEN (S/)</option>
                <option value="USD">USD ($)</option>
              </select>
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="label !mb-0">Items</label>
              <button type="button" onClick={agregarItem} className="btn-ghost text-xs !py-1.5 !px-3">+ Agregar item</button>
            </div>
            <div className="hidden sm:grid grid-cols-12 gap-2 px-1 pb-1.5 mb-1 border-b border-carbon-100 text-[10px] font-semibold uppercase tracking-wider text-carbon-500">
              <div className="col-span-4">Descripción</div>
              <div className="col-span-1 text-right">Cant.</div>
              <div className="col-span-1">Unidad</div>
              <div className="col-span-2 text-right">P. unitario</div>
              <div className="col-span-1 text-right">% dscto</div>
              <div className="col-span-1 text-right">Importe</div>
              <div className="col-span-1 text-center">Foto{esCorrectivo && <span className="text-rose-600"> *</span>}</div>
              <div className="col-span-1"></div>
            </div>
            <div className="space-y-2">
              {form.items.map((it, idx) => (
                <div key={idx} className="grid grid-cols-12 gap-2 items-start">
                  <textarea className="textarea col-span-12 sm:col-span-4" rows="1" placeholder="Descripción del item"
                    value={it.descripcion} onChange={e => cambiarItem(idx, 'descripcion', e.target.value)} />
                  <input type="number" step="0.01" className="input col-span-3 sm:col-span-1" placeholder="Cant."
                    value={it.cantidad} onChange={e => cambiarItem(idx, 'cantidad', e.target.value)} />
                  <input className="input col-span-3 sm:col-span-1" placeholder="Unidad"
                    value={it.unidad} onChange={e => cambiarItem(idx, 'unidad', e.target.value)} />
                  <input type="number" step="0.01" className="input col-span-3 sm:col-span-2" placeholder="P. unitario"
                    value={it.precio_unitario} onChange={e => cambiarItem(idx, 'precio_unitario', e.target.value)} />
                  <input type="number" step="0.01" className="input col-span-2 sm:col-span-1" placeholder="% dscto"
                    value={it.descuento_porcentaje} onChange={e => cambiarItem(idx, 'descuento_porcentaje', e.target.value)} />
                  <div className="col-span-9 sm:col-span-1 text-right text-sm font-medium pt-2">
                    {formatMonto(calcImporte(it), form.moneda)}
                  </div>
                  <div className="col-span-2 sm:col-span-1 flex items-center justify-center pt-1">
                    {it.archivo ? (
                      <img src={assetUrl(it.archivo.ruta_almacenamiento)} alt="foto ítem"
                        onClick={() => quitarFotoItem(idx)} title="Clic para quitar la foto"
                        className="h-9 w-9 object-cover rounded ring-1 ring-slate-200 cursor-pointer" />
                    ) : (
                      <label className={`text-[11px] cursor-pointer hover:underline ${esCorrectivo ? 'text-rose-600' : 'text-brand-700'}`}
                        title="Subir foto del ítem">
                        + Foto
                        <input type="file" accept="image/*" className="hidden" onChange={e => subirFotoItem(idx, e)} />
                      </label>
                    )}
                  </div>
                  <button type="button" onClick={() => quitarItem(idx)}
                    className="col-span-1 text-carbon-400 hover:text-red-600 text-lg leading-none">×</button>
                </div>
              ))}
            </div>
          </div>

          <div className="flex items-center justify-end">
            <label className="inline-flex items-center gap-2 text-sm text-carbon-700 cursor-pointer">
              <input type="checkbox" checked={form.sin_igv}
                onChange={e => setForm(f => ({ ...f, sin_igv: e.target.checked }))} />
              Cotizar sin IGV
            </label>
          </div>
          <div className="border-t border-carbon-100 pt-3 grid grid-cols-2 gap-1 text-sm">
            <div className="text-right text-carbon-600">Subtotal</div>
            <div className="text-right font-medium">{formatMonto(subtotal, form.moneda)}</div>
            {form.sin_igv ? (
              <div className="col-span-2 text-right text-xs text-carbon-500">Precios sin IGV</div>
            ) : (
              <>
                <div className="text-right text-carbon-600">IGV ({Math.round(igvTasa * 100)}%)</div>
                <div className="text-right font-medium">{formatMonto(igvCalc, form.moneda)}</div>
              </>
            )}
            <div className="text-right text-brand-700 font-bold">TOTAL</div>
            <div className="text-right text-brand-700 font-bold text-base">{formatMonto(totalCalc, form.moneda)}</div>
          </div>

          <CuotasEditor
            value={form.cuotas}
            onChange={cuotas => setForm(f => ({ ...f, cuotas }))}
            total={totalCalc}
            moneda={form.moneda}
          />

          {cuentas.length > 0 && (
            <div>
              <label className="label">Cuentas bancarias en el PDF</label>
              <p className="text-[11px] text-slate-500 mb-2">Se imprimirán en el PDF solo las cuentas marcadas. Se gestionan en Configuración › Cuentas bancarias.</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {cuentas.map(c => {
                  const marcada = form.cuentas_pdf.includes(c.id);
                  return (
                    <label key={c.id} className={`flex items-start gap-2 rounded-lg ring-1 p-2.5 cursor-pointer text-sm ${marcada ? 'ring-brand-300 bg-brand-50/40' : 'ring-slate-200'}`}>
                      <input type="checkbox" className="mt-0.5" checked={marcada}
                        onChange={e => setForm(f => ({
                          ...f,
                          cuentas_pdf: e.target.checked
                            ? [...f.cuentas_pdf, c.id]
                            : f.cuentas_pdf.filter(id => id !== c.id)
                        }))} />
                      <div className="min-w-0">
                        <div className="font-medium text-slate-800">{c.banco} <span className="text-xs text-slate-500">({c.moneda})</span></div>
                        <div className="text-xs text-slate-500 truncate">{c.tipo_cuenta} · {c.numero_cuenta}</div>
                        <div className="text-xs text-slate-400 truncate">{c.titular}</div>
                      </div>
                    </label>
                  );
                })}
              </div>
              {form.cuentas_pdf.length === 0 && (
                <p className="text-[11px] text-amber-600 mt-1">Ninguna cuenta seleccionada: el PDF no incluirá la sección de datos para pago.</p>
              )}
            </div>
          )}

          <div>
            <label className="label">Observaciones internas</label>
            <textarea className="textarea" rows="2" value={form.observaciones}
              onChange={e => setForm(f => ({ ...f, observaciones: e.target.value }))} />
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="label !mb-0">Adjuntos</label>
              <label className={`btn-ghost text-xs !py-1.5 !px-3 cursor-pointer ${subiendoAdjuntos ? 'opacity-50 pointer-events-none' : ''}`}>
                {subiendoAdjuntos ? 'Subiendo…' : '+ Agregar archivos'}
                <input type="file" multiple className="hidden" onChange={subirAdjuntos} disabled={subiendoAdjuntos} />
              </label>
            </div>
            {form.archivos.length === 0 ? (
              <div className="text-xs text-carbon-400 italic">Sin adjuntos</div>
            ) : (
              <ul className="space-y-1">
                {form.archivos.map(a => (
                  <li key={a.id} className="flex items-center justify-between text-sm bg-ivory-50 border border-carbon-100 rounded px-2 py-1">
                    <a href={assetUrl(a.ruta_almacenamiento)} target="_blank" rel="noreferrer"
                       className="text-brand-700 hover:underline truncate" title={a.nombre_original}>
                      {a.nombre_original}
                    </a>
                    <button type="button" onClick={() => quitarAdjunto(a.id)}
                      className="text-carbon-400 hover:text-red-600 text-lg leading-none ml-2">×</button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </form>
      </Modal>

      <ConfirmarEliminacion
        open={!!aEliminar}
        onClose={() => setAEliminar(null)}
        titulo="Eliminar cotización"
        palabraClave={aEliminar?.codigo || 'ELIMINAR'}
        descripcion={
          <>
            La cotización <span className="font-mono font-semibold">{aEliminar?.codigo}</span> pasará a estado Anulado y se conservará
            visible en el listado como historial (con sus versiones, ítems y adjuntos intactos). Si ya generó un servicio, ese servicio se
            anulará (queda Cancelado con sus datos asociados). Acción auditada.
          </>
        }
        onConfirmar={async () => {
          try {
            await cotizacionesService.remove(aEliminar.id);
            toast.success('Cotización eliminada');
            setAEliminar(null);
            recargar();
          } catch (err) {
            toast.error(err.response?.data?.error || 'Error al eliminar cotización');
          }
        }}
      />
    </>
  );
}
