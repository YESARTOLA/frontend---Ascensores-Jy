import api, { assetUrl } from './apiClient';

export { assetUrl };

export const authService = {
  login: (correo, contrasena) => api.post('/auth/login', { correo, contrasena }).then(r => r.data),
  me: () => api.get('/auth/me').then(r => r.data),
  logout: () => api.post('/auth/logout').then(r => r.data),
  cambiarContrasena: (contrasena_actual, contrasena_nueva) =>
    api.post('/auth/change-password', { contrasena_actual, contrasena_nueva }).then(r => r.data)
};

const crud = (path) => ({
  list: (params) => api.get(path, { params }).then(r => r.data?.data ?? r.data),
  get: (id) => api.get(`${path}/${id}`).then(r => r.data?.data ?? r.data),
  create: (data) => api.post(path, data).then(r => r.data?.data ?? r.data),
  update: (id, data) => api.put(`${path}/${id}`, data).then(r => r.data?.data ?? r.data),
  setEstado: (id, estado) => api.patch(`${path}/${id}/estado`, { estado }).then(r => r.data?.data ?? r.data)
});

export const clientesService = {
  ...crud('/clientes'),
  paginate: (params) => api.get('/clientes', { params }).then(r => r.data),
  vista360: (id) => api.get(`/clientes/${id}/360`).then(r => r.data?.data ?? r.data),
  exportar: (params, formato = 'excel') =>
    api.get('/clientes/exportar', { params: { ...params, formato }, responseType: 'blob' }),
  tiposAscensor: () => api.get('/clientes/tipos-ascensor').then(r => r.data?.data ?? r.data),
  clasificaciones: () => api.get('/clientes/clasificaciones').then(r => r.data?.data ?? r.data),
  // Detecta un cliente activo por RUC/DNI (devuelve el cliente o null) para
  // vincularlo en la conversión de leads en vez de crear un duplicado.
  porDocumento: (numero) => api.get(`/clientes/por-documento/${encodeURIComponent(numero)}`).then(r => r.data?.data ?? r.data)
};

// Edificios u obras de un cliente (ubicación física que agrupa ascensores).
export const edificiosService = {
  list: (params) => api.get('/edificios', { params }).then(r => r.data?.data ?? r.data),
  get: (id) => api.get(`/edificios/${id}`).then(r => r.data?.data ?? r.data),
  create: (d) => api.post('/edificios', d).then(r => r.data?.data ?? r.data),
  update: (id, d) => api.put(`/edificios/${id}`, d).then(r => r.data?.data ?? r.data),
  // estado 0 = eliminación lógica en cascada; estado 1 = reactivar.
  setEstado: (id, estado) => api.patch(`/edificios/${id}/estado`, { estado }).then(r => r.data?.data ?? r.data),
  // Vista previa de lo que arrastra la eliminación (alimenta la doble confirmación).
  impactoEliminacion: (id) => api.get(`/edificios/${id}/impacto-eliminacion`).then(r => r.data?.data ?? r.data),
  // Elimina/reactiva todos los edificios de un cliente (solo Super Admin).
  setEstadoCliente: (idCliente, estado) => api.patch(`/edificios/cliente/${idCliente}/estado`, { estado }).then(r => r.data?.data ?? r.data),
  tipos: () => api.get('/edificios/tipos').then(r => r.data?.data ?? r.data),
  distritos: () => api.get('/edificios/distritos').then(r => r.data?.data ?? r.data)
};

export const ascensoresService = {
  ...crud('/ascensores'),
  paginate: (params) => api.get('/ascensores', { params }).then(r => r.data),
  historial: (id) => api.get(`/ascensores/${id}/historial`).then(r => r.data?.data ?? r.data),
  // Guarda el precio de UN subtipo sin tocar el resto del catálogo del ascensor
  // (a diferencia de `update`, que reemplaza el arreglo `precios` completo).
  // Devuelve { id_ascensor, precios } con el catálogo vigente ya actualizado.
  guardarPrecio: (id, { id_tipo_servicio, precio, moneda }) =>
    api.put(`/ascensores/${id}/precios`, { id_tipo_servicio, precio, moneda }).then(r => r.data?.data ?? r.data)
};

export const tecnicosService = {
  ...crud('/tecnicos'),
  paginate: (params) => api.get('/tecnicos', { params }).then(r => r.data)
};

export const tiposAscensorService = {
  list: (params) => api.get('/tipos-ascensor', { params }).then(r => r.data?.data ?? r.data),
  create: (d) => api.post('/tipos-ascensor', d).then(r => r.data?.data ?? r.data),
  update: (id, d) => api.put(`/tipos-ascensor/${id}`, d).then(r => r.data?.data ?? r.data),
  setEstado: (id, estado) => api.patch(`/tipos-ascensor/${id}/estado`, { estado }).then(r => r.data?.data ?? r.data)
};

export const ubigeoService = {
  // Catálogo oficial INEI (departamento/provincia/distrito); se carga una vez
  // y la cascada se arma en memoria.
  list: () => api.get('/ubigeo').then(r => r.data?.data ?? r.data)
};

export const tiposServicioService = {
  list: (params) => api.get('/tipos-servicio', { params }).then(r => r.data?.data ?? r.data),
  catalogos: () => api.get('/tipos-servicio/catalogos').then(r => r.data?.data ?? r.data),
  create: (d) => api.post('/tipos-servicio', d).then(r => r.data?.data ?? r.data),
  update: (id, d) => api.put(`/tipos-servicio/${id}`, d).then(r => r.data?.data ?? r.data),
  setEstado: (id, estado) => api.patch(`/tipos-servicio/${id}/estado`, { estado }).then(r => r.data?.data ?? r.data),
  remove: (id) => api.delete(`/tipos-servicio/${id}`).then(r => r.data),
  listarTecnicos: (id) => api.get(`/tipos-servicio/${id}/tecnicos`).then(r => r.data?.data ?? r.data),
  vincularTecnico: (id, id_tecnico) => api.post(`/tipos-servicio/${id}/tecnicos`, { id_tecnico }).then(r => r.data),
  desvincularTecnico: (id, id_tecnico) => api.delete(`/tipos-servicio/${id}/tecnicos/${id_tecnico}`).then(r => r.data)
};

export const serviciosService = {
  list: (params) => api.get('/servicios', { params }).then(r => r.data?.data ?? r.data),
  paginate: (params) => api.get('/servicios', { params }).then(r => r.data),
  get: (id) => api.get(`/servicios/${id}`).then(r => r.data?.data ?? r.data),
  create: (d) => api.post('/servicios', d).then(r => r.data?.data ?? r.data),
  update: (id, d) => api.put(`/servicios/${id}`, d).then(r => r.data?.data ?? r.data),
  // Cambiar la duración (días) de un servicio ya programado, incluso En curso.
  // El backend puede responder 409 { requiere_confirmacion } si se recortan días
  // con evidencia; reenviar con { confirmar: true }.
  cambiarDuracion: (id, payload) => api.patch(`/servicios/${id}/duracion`, payload).then(r => r.data),
  setEstado: (id, estado_servicio) => api.patch(`/servicios/${id}/estado`, { estado_servicio }).then(r => r.data?.data ?? r.data),
  setRequiereFactura: (id, requiere_factura) => api.patch(`/servicios/${id}/requiere-factura`, { requiere_factura }).then(r => r.data?.data ?? r.data),
  asignar: (id, payload) => api.post(`/servicios/${id}/asignar`, payload).then(r => r.data),
  iniciar: (id, accion) => api.post(`/servicios/${id}/iniciar`, { accion }).then(r => r.data),
  finalizar: (id, payload) => api.post(`/servicios/${id}/finalizar`, payload).then(r => r.data),
  cancelar: (id, motivo) => api.post(`/servicios/${id}/cancelar`, { motivo }).then(r => r.data),
  remove: (id) => api.delete(`/servicios/${id}`).then(r => r.data),
  promover: (id) => api.post(`/servicios/${id}/promover`).then(r => r.data),
  revisar: (id, payload) => api.post(`/servicios/${id}/revisar`, payload).then(r => r.data),
  realizados: () => api.get('/servicios/realizados').then(r => r.data?.data ?? r.data),
  realizadosPaginate: (params) => api.get('/servicios/realizados', { params }).then(r => r.data),
  observaciones: (idServicio) => api.get(`/servicios/${idServicio}/observaciones`).then(r => r.data?.data ?? r.data),
  crearObservacion: (idServicio, payload) => api.post(`/servicios/${idServicio}/observaciones`, payload).then(r => r.data?.data ?? r.data),
  atenderObservacion: (id) => api.patch(`/servicios/observaciones/${id}/atender`).then(r => r.data?.data ?? r.data),
  eliminarObservacion: (id) => api.delete(`/servicios/observaciones/${id}`).then(r => r.data),
  // Checklist de finalización (progresivo: se llena durante "En curso")
  obtenerFinalizacion: (idServicio) => api.get(`/servicios/${idServicio}/finalizacion`).then(r => r.data?.data ?? r.data),
  guardarRespuestaChecklist: (idServicio, idItem, payload) => api.patch(`/servicios/${idServicio}/finalizacion/items/${idItem}`, payload).then(r => r.data?.data ?? r.data),
  agregarFotoChecklist: (idServicio, idItem, payload) => api.post(`/servicios/${idServicio}/finalizacion/items/${idItem}/fotos`, payload).then(r => r.data?.data ?? r.data),
  eliminarFotoChecklist: (idServicio, idFoto) => api.delete(`/servicios/${idServicio}/finalizacion/fotos/${idFoto}`).then(r => r.data),
  // Genera el informe PDF a partir del checklist ya completado (al cerrar).
  generarInformeFinalizacion: (idServicio) => api.post(`/servicios/${idServicio}/finalizacion`).then(r => r.data?.data ?? r.data),
  // Guías de salida (gestión por coordinador/admin/super_admin/técnico responsable).
  crearGuia: (idServicio, payload) => api.post(`/servicios/${idServicio}/guias`, payload).then(r => r.data?.data ?? r.data),
  actualizarGuia: (idServicio, idGuia, payload) => api.put(`/servicios/${idServicio}/guias/${idGuia}`, payload).then(r => r.data?.data ?? r.data),
  eliminarGuia: (idServicio, idGuia) => api.delete(`/servicios/${idServicio}/guias/${idGuia}`).then(r => r.data)
};

export const checklistService = {
  porServicio: (idServicio) => api.get(`/checklists/por-servicio/${idServicio}`).then(r => r.data?.data ?? r.data),
  addItem: (idChecklist, data) => api.post(`/checklists/${idChecklist}/items`, data).then(r => r.data?.data ?? r.data),
  updateItem: (id, data) => api.put(`/checklists/items/${id}`, data).then(r => r.data?.data ?? r.data),
  deleteItem: (id) => api.delete(`/checklists/items/${id}`).then(r => r.data),
  completar: (idChecklist) => api.post(`/checklists/${idChecklist}/completar`).then(r => r.data)
};

export const cobrosService = {
  list: (params) => api.get('/cobros', { params }).then(r => r.data?.data ?? r.data),
  paginate: (params) => api.get('/cobros', { params }).then(r => r.data),
  get: (id) => api.get(`/cobros/${id}`).then(r => r.data?.data ?? r.data),
  setPlanCuotas: (id, payload) => api.put(`/cobros/${id}/plan-cuotas`, payload).then(r => r.data),
  registrarPago: (id, payload) => api.post(`/cobros/${id}/pagos`, payload).then(r => r.data),
  recordatorio: (id) => api.post(`/cobros/${id}/recordatorio`).then(r => r.data?.data ?? r.data),
  cerrar: (id) => api.patch(`/cobros/${id}/cerrar`).then(r => r.data),
  cuotasCalendario: (params) => api.get('/cobros/cuotas-calendario', { params }).then(r => r.data?.data ?? r.data),
  proyectos: () => api.get('/cobros/proyectos').then(r => r.data?.data ?? r.data),
  remove: (id) => api.delete(`/cobros/${id}`).then(r => r.data)
};

export const facturasService = {
  list: (params) => api.get('/facturas', { params }).then(r => r.data?.data ?? r.data),
  paginate: (params) => api.get('/facturas', { params }).then(r => r.data),
  get: (id) => api.get(`/facturas/${id}`).then(r => r.data?.data ?? r.data),
  create: (d) => api.post('/facturas', d).then(r => r.data?.data ?? r.data),
  cambiarEstado: (id, estado_factura) =>
    api.patch(`/facturas/${id}/estado`, { estado_factura }).then(r => r.data?.data ?? r.data),
  remove: (id) => api.delete(`/facturas/${id}`).then(r => r.data)
};

export const emergenciasService = {
  list: (params) => api.get('/emergencias', { params }).then(r => r.data?.data ?? r.data),
  paginate: (params) => api.get('/emergencias', { params }).then(r => r.data),
  get: (id) => api.get(`/emergencias/${id}`).then(r => r.data?.data ?? r.data),
  create: (d) => api.post('/emergencias', d).then(r => r.data?.data ?? r.data),
  update: (id, d) => api.put(`/emergencias/${id}`, d).then(r => r.data?.data ?? r.data),
  remove: (id) => api.delete(`/emergencias/${id}`).then(r => r.data),
  // Adjuntos de contexto (fotos/videos de la falla) que revisa el técnico asignado.
  // `listarArchivos` devuelve la respuesta completa porque el backend acompaña
  // los datos con meta.max y meta.puede_gestionar.
  listarArchivos: (id) => api.get(`/emergencias/${id}/archivos`).then(r => r.data),
  agregarArchivos: (id, archivos) => api.post(`/emergencias/${id}/archivos`, { archivos }).then(r => r.data?.data ?? r.data),
  eliminarArchivo: (id, idVinculo) => api.delete(`/emergencias/${id}/archivos/${idVinculo}`).then(r => r.data)
};

export const correctivosService = {
  list: (params) => api.get('/correctivos', { params }).then(r => r.data?.data ?? r.data),
  paginate: (params) => api.get('/correctivos', { params }).then(r => r.data),
  get: (id) => api.get(`/correctivos/${id}`).then(r => r.data?.data ?? r.data),
  create: (d) => api.post('/correctivos', d).then(r => r.data?.data ?? r.data),
  update: (id, d) => api.put(`/correctivos/${id}`, d).then(r => r.data?.data ?? r.data),
  remove: (id) => api.delete(`/correctivos/${id}`).then(r => r.data)
};

export const mantenimientosService = {
  list: (params) => api.get('/mantenimientos', { params }).then(r => r.data?.data ?? r.data),
  paginate: (params) => api.get('/mantenimientos', { params }).then(r => r.data),
  create: (d) => api.post('/mantenimientos', d).then(r => r.data?.data ?? r.data),
  update: (id, d) => api.put(`/mantenimientos/${id}`, d).then(r => r.data?.data ?? r.data),
  frecuencias: () => api.get('/mantenimientos/frecuencias').then(r => r.data?.data ?? r.data),
  materializarEvento: (idEvento, body) => api.post(`/mantenimientos/eventos/${idEvento}/crear-servicio`, body || {}).then(r => r.data?.data ?? r.data),
  instancias: (params) => api.get('/mantenimientos/instancias', { params }).then(r => r.data?.data ?? r.data),
  exportar: (params, formato = 'excel') =>
    api.get('/mantenimientos/exportar', { params: { ...params, formato }, responseType: 'blob' }),
  exportarDatos: (params) =>
    api.get('/mantenimientos/exportar', { params: { ...params, formato: 'json' } }).then(r => r.data?.data ?? r.data),
  // Preview del borrado en cascada: alimenta el modal de confirmación.
  impactoEliminacion: (id) => api.get(`/mantenimientos/${id}/impacto-eliminacion`).then(r => r.data?.data ?? r.data),
  remove: (id) => api.delete(`/mantenimientos/${id}`).then(r => r.data)
};

export const leadsService = {
  list: (params) => api.get('/leads', { params }).then(r => r.data?.data ?? r.data),
  paginate: (params) => api.get('/leads', { params }).then(r => r.data),
  create: (d) => api.post('/leads', d).then(r => r.data?.data ?? r.data),
  update: (id, d) => api.put(`/leads/${id}`, d).then(r => r.data?.data ?? r.data),
  historial: (id) => api.get(`/leads/${id}/historial`).then(r => r.data?.data ?? r.data),
  cambiarEstado: (id, estado_lead, motivo_descarte) => api.patch(`/leads/${id}/estado`, { estado_lead, motivo_descarte }).then(r => r.data?.data ?? r.data),
  vendedores: () => api.get('/leads/vendedores').then(r => r.data?.data ?? r.data),
  convertir: (id, payload) => api.post(`/leads/${id}/convertir`, payload).then(r => r.data?.data ?? r.data),
  cotizaciones: (id) => api.get(`/leads/${id}/cotizaciones`).then(r => r.data?.data ?? r.data),
  subirCotizacion: (id, id_archivo) => api.post(`/leads/${id}/cotizaciones`, { id_archivo }).then(r => r.data?.data ?? r.data)
};

export const atencionesRapidasService = {
  list: (params) => api.get('/atenciones-rapidas', { params }).then(r => r.data?.data ?? r.data),
  paginate: (params) => api.get('/atenciones-rapidas', { params }).then(r => r.data),
  create: (d) => api.post('/atenciones-rapidas', d).then(r => r.data?.data ?? r.data),
  update: (id, d) => api.put(`/atenciones-rapidas/${id}`, d).then(r => r.data?.data ?? r.data),
  convertir: (id, payload) => api.post(`/atenciones-rapidas/${id}/convertir`, payload).then(r => r.data?.data ?? r.data)
};

export const calendarioService = {
  list: (params) => api.get('/calendario', { params }).then(r => r.data?.data ?? r.data)
};

export const dashboardService = {
  resumen: () => api.get('/dashboard').then(r => r.data?.data ?? r.data)
};

export const reportesService = {
  operativos: (params) => api.get('/reportes/operativos', { params }).then(r => r.data?.data ?? r.data),
  cobros: (params) => api.get('/reportes/cobros', { params }).then(r => r.data?.data ?? r.data),
  tecnicos: () => api.get('/reportes/tecnicos').then(r => r.data?.data ?? r.data),
  leads: () => api.get('/reportes/leads').then(r => r.data?.data ?? r.data),
  ascensores: () => api.get('/reportes/ascensores').then(r => r.data?.data ?? r.data),
  mantenimientosVencidos: () => api.get('/reportes/mantenimientos-vencidos').then(r => r.data?.data ?? r.data),
  mantenimientosCumplidos: (params) => api.get('/reportes/mantenimientos-cumplidos', { params }).then(r => r.data?.data ?? r.data),
  moraPorCliente: () => api.get('/reportes/mora-por-cliente').then(r => r.data?.data ?? r.data),
  facturados: (params) => api.get('/reportes/facturados', { params }).then(r => r.data?.data ?? r.data),
  abonosRegistrados: (params) => api.get('/reportes/abonos-registrados', { params }).then(r => r.data?.data ?? r.data),
  emergenciasAtendidas: (params) => api.get('/reportes/emergencias-atendidas', { params }).then(r => r.data?.data ?? r.data),
  correctivos: (params) => api.get('/reportes/correctivos', { params }).then(r => r.data?.data ?? r.data),
  atencionesRapidas: (params) => api.get('/reportes/atenciones-rapidas', { params }).then(r => r.data?.data ?? r.data),
  serviciosFinalizados: (params) => api.get('/reportes/servicios-finalizados', { params }).then(r => r.data?.data ?? r.data),
  pendientesDeCobro: (params) => api.get('/reportes/pendientes-de-cobro', { params }).then(r => r.data?.data ?? r.data),
  cobrosVencidos: (params) => api.get('/reportes/cobros-vencidos', { params }).then(r => r.data?.data ?? r.data),
  historialTecnicoAscensor: (params) => api.get('/reportes/historial-tecnico-ascensor', { params }).then(r => r.data?.data ?? r.data),
  mantenimientosPorCliente: (params) => api.get('/reportes/mantenimientos-por-cliente', { params }).then(r => r.data?.data ?? r.data),
  mantenimientosProgramadosSinServicio: (params) => api.get('/reportes/mantenimientos-programados-sin-servicio', { params }).then(r => r.data?.data ?? r.data),
  ingresosPorBanco: (params) => api.get('/reportes/ingresos-por-banco', { params }).then(r => r.data?.data ?? r.data),
  clientesEstadoEdificios: () => api.get('/reportes/clientes-estado-edificios').then(r => r.data?.data ?? r.data)
};

export const auditoriaService = {
  list: (params) => api.get('/auditoria', { params }).then(r => r.data?.data ?? r.data),
  paginate: (params) => api.get('/auditoria', { params }).then(r => r.data)
};

export const recordatoriosService = {
  list: (params) => api.get('/recordatorios', { params }).then(r => r.data?.data ?? r.data),
  paginate: (params) => api.get('/recordatorios', { params }).then(r => r.data),
  get: (id) => api.get(`/recordatorios/${id}`).then(r => r.data?.data ?? r.data),
  create: (d) => api.post('/recordatorios', d).then(r => r.data?.data ?? r.data),
  update: (id, d) => api.put(`/recordatorios/${id}`, d).then(r => r.data?.data ?? r.data),
  atender: (id, notas) => api.patch(`/recordatorios/${id}/atender`, notas ? { notas_seguimiento: notas } : {}).then(r => r.data?.data ?? r.data),
  pendiente: (id) => api.patch(`/recordatorios/${id}/pendiente`).then(r => r.data?.data ?? r.data),
  descartar: (id) => api.patch(`/recordatorios/${id}/descartar`).then(r => r.data?.data ?? r.data),
  leer: (id) => api.patch(`/recordatorios/${id}/leer`).then(r => r.data?.data ?? r.data),
  leerTodos: () => api.patch('/recordatorios/leer-todos').then(r => r.data?.data ?? r.data),
  remove: (id) => api.delete(`/recordatorios/${id}`).then(r => r.data),
  contadores: () => api.get('/recordatorios/contadores').then(r => r.data?.data ?? r.data),
  proximos: (limit = 10) => api.get('/recordatorios/proximos', { params: { limit } }).then(r => r.data?.data ?? r.data)
};

export const usuariosService = {
  list: (params) => api.get('/usuarios', { params }).then(r => r.data?.data ?? r.data),
  paginate: (params) => api.get('/usuarios', { params }).then(r => r.data),
  create: (d) => api.post('/usuarios', d).then(r => r.data?.data ?? r.data),
  update: (id, d) => api.put(`/usuarios/${id}`, d).then(r => r.data?.data ?? r.data),
  setEstado: (id, estado) => api.patch(`/usuarios/${id}/estado`, { estado }).then(r => r.data),
  roles: () => api.get('/usuarios/roles').then(r => r.data?.data ?? r.data),
  permisos: () => api.get('/usuarios/permisos').then(r => r.data?.data ?? r.data)
};

export const archivosService = {
  // tipo: 'guias' | 'evidencias' | 'comprobantes' | 'facturas' | 'entregas' | 'cotizaciones' | 'contratos' | 'ot' | 'documents'
  // Si no se especifica, el backend lo archiva en /uploads/documents/YYYY/MM.
  // Reconstruimos el FormData garantizando que el campo `tipo` viaja antes del archivo
  // para que multer lo lea al decidir la carpeta destino.
  // Los uploads desactivan el timeout global (30s) porque videos en conexiones lentas
  // pueden tardar varios minutos; el límite real lo pone el server/Railway, no axios.
  upload: (formData, tipo, opciones = {}) => {
    const fd = new FormData();
    if (tipo) fd.append('tipo', tipo);
    for (const [k, v] of formData.entries()) fd.append(k, v);
    return api.post('/archivos', fd, {
      headers: { 'Content-Type': 'multipart/form-data' },
      timeout: 0,
      onUploadProgress: opciones.onUploadProgress
    }).then(r => r.data?.data ?? r.data);
  }
};

export const evidenciasGuiasService = {
  subirEvidencia: (idServicio, payload) => api.post(`/servicios/${idServicio}/evidencias`, payload).then(r => r.data?.data ?? r.data),
  listarEvidencias: (idServicio) => api.get(`/servicios/${idServicio}/evidencias`).then(r => r.data?.data ?? r.data),
  eliminarEvidencia: (id) => api.delete(`/evidencias/${id}`).then(r => r.data)
};

export const entregasService = {
  list: (params) => api.get('/entregas', { params }).then(r => r.data?.data ?? r.data),
  paginate: (params) => api.get('/entregas', { params }).then(r => r.data),
  create: (d) => api.post('/entregas', d).then(r => r.data?.data ?? r.data),
  update: (id, d) => api.put(`/entregas/${id}`, d).then(r => r.data?.data ?? r.data)
};

export const cotizacionesService = {
  list: (params) => api.get('/cotizaciones', { params }).then(r => r.data?.data ?? r.data),
  paginate: (params) => api.get('/cotizaciones', { params }).then(r => r.data),
  exportar: (params, formato = 'excel') =>
    api.get('/cotizaciones/exportar', { params: { ...params, formato }, responseType: 'blob' }),
  // Catálogos de estado (global y de versión) que alimentan el filtro.
  catalogos: () => api.get('/cotizaciones/catalogos').then(r => r.data?.data ?? r.data),
  get: (id) => api.get(`/cotizaciones/${id}`).then(r => r.data?.data ?? r.data),
  historial: (id) => api.get(`/cotizaciones/${id}/historial`).then(r => r.data?.data ?? r.data),
  // Prellenado desde observaciones técnicas: devuelve cliente, ascensores del
  // servicio origen y un ítem (texto + foto) por observación.
  desdeObservaciones: (ids) =>
    api.get('/cotizaciones/desde-observaciones', { params: { ids: ids.join(',') } }).then(r => r.data?.data ?? r.data),
  create: (d) => api.post('/cotizaciones', d).then(r => r.data?.data ?? r.data),
  updateCabecera: (id, d) => api.put(`/cotizaciones/${id}`, d).then(r => r.data?.data ?? r.data),
  updateVersion: (id, v, d) => api.put(`/cotizaciones/${id}/versiones/${v}`, d).then(r => r.data?.data ?? r.data),
  nuevaVersion: (id, motivo_cambio) => api.post(`/cotizaciones/${id}/versiones`, { motivo_cambio }).then(r => r.data?.data ?? r.data),
  aprobar: (id, v, payload) => api.post(`/cotizaciones/${id}/versiones/${v}/aprobar`, payload || {}).then(r => r.data?.data ?? r.data),
  rechazar: (id, v, motivo_rechazo) => api.post(`/cotizaciones/${id}/versiones/${v}/rechazar`, { motivo_rechazo }).then(r => r.data?.data ?? r.data),
  reabrir: (id, motivo) => api.post(`/cotizaciones/${id}/reabrir`, { motivo }).then(r => r.data?.data ?? r.data),
  remove: (id) => api.delete(`/cotizaciones/${id}`).then(r => r.data),
  pdf: (id, v) => api.get(`/cotizaciones/${id}/versiones/${v}/pdf`).then(r => r.data?.data ?? r.data),
  attachArchivo: (id, id_archivo) => api.post(`/cotizaciones/${id}/archivos`, { id_archivo }).then(r => r.data?.data ?? r.data),
  removeArchivo: (id, idAdjunto) => api.delete(`/cotizaciones/${id}/archivos/${idAdjunto}`).then(r => r.data)
};

export const configuracionService = {
  list: () => api.get('/configuracion').then(r => r.data?.data ?? r.data),
  get: (clave) => api.get(`/configuracion/${clave}`).then(r => r.data?.data ?? r.data),
  update: (clave, valor) => api.put(`/configuracion/${clave}`, { valor }).then(r => r.data?.data ?? r.data)
};

export const cuentasBancariasService = {
  list: () => api.get('/cuentas-bancarias').then(r => r.data?.data ?? r.data),
  catalogos: () => api.get('/cuentas-bancarias/catalogos').then(r => r.data?.data ?? r.data),
  create: (d) => api.post('/cuentas-bancarias', d).then(r => r.data?.data ?? r.data),
  update: (id, d) => api.put(`/cuentas-bancarias/${id}`, d).then(r => r.data?.data ?? r.data),
  remove: (id) => api.delete(`/cuentas-bancarias/${id}`).then(r => r.data)
};
