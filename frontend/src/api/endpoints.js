import client from './client'

export const auth = {
  login: (body) => client.post('/auth/login', body),
  crearUsuario: (body) => client.post('/auth/usuarios', body),
}

function uploadCSV(url, file) {
  const fd = new FormData()
  fd.append('archivo', file)
  return client.post(url, fd, { headers: { 'Content-Type': 'multipart/form-data' } })
}

export const alumnos = {
  listar: () => client.get('/alumnos'),
  obtener: (id) => client.get(`/alumnos/${id}`),
  crear: (body) => client.post('/alumnos', body),
  actualizar: (id, body) => client.patch(`/alumnos/${id}`, body),
  cambiarEstado: (id, payload) => client.put(`/alumnos/${id}/estado`, payload),
  kardex: (id) => client.get(`/alumnos/${id}/kardex`),
  kardexDetallado: (id) => client.get(`/alumnos/${id}/kardex-detallado`),
  previewCSV: (file) => uploadCSV('/importar/alumnos/preview', file),
  confirmarCSV: (file) => uploadCSV('/importar/alumnos/confirmar', file),
  miPerfil: () => client.get('/alumnos/me/perfil'),
  miAvance: () => client.get('/alumnos/me/avance'),
  historial: (id) => client.get(`/alumnos/${id}/analytics`),
}

export const docentes = {
  listar: () => client.get('/docentes'),
  obtener: (id) => client.get(`/docentes/${id}`),
  crear: (body) => client.post('/docentes', body),
  actualizar: (id, body) => client.put(`/docentes/${id}`, body),
  resetPassword: (id, body) => client.post(`/docentes/${id}/reset-password`, body),
  crearAcceso: (id, body) => client.post(`/docentes/${id}/crear-acceso`, body),
  grupos: (id) => client.get(`/docentes/${id}/grupos`),
  historial: (id) => client.get(`/docentes/${id}/analytics`),
  miKardex: () => client.get('/docentes/me/kardex'),
}

export const materias = {
  listar: () => client.get('/materias'),
  crear: (body) => client.post('/materias', body),
  actualizar: (id, body) => client.put(`/materias/${id}`, body),
  eliminar: (id) => client.delete(`/materias/${id}`),
  reactivar: (id) => client.post(`/materias/${id}/reactivar`),
  unidades: (materiaId) => client.get(`/materias/${materiaId}/unidades`),
  crearUnidad: (materiaId, body) => client.post(`/materias/${materiaId}/unidades`, body),
  actualizarUnidad: (materiaId, uid, body) => client.put(`/materias/${materiaId}/unidades/${uid}`, body),
  eliminarUnidad: (materiaId, uid) => client.delete(`/materias/${materiaId}/unidades/${uid}`),
  historial: (id) => client.get(`/materias/${id}/analytics`),
}

export const periodos = {
  listar: () => client.get('/periodos'),
  obtener: (id) => client.get(`/periodos/${id}`),
  activo: () => client.get('/periodos/activo'),
  crear: (body) => client.post('/periodos', body),
  actualizar: (id, body) => client.put(`/periodos/${id}`, body),
  activar: (id, body) => client.post(`/periodos/${id}/activar`, body),
  cerrar: (id) => client.post(`/periodos/${id}/cerrar`),
  eliminar: (id) => client.delete(`/periodos/${id}`),
}

export const grupos = {
  listar: () => client.get('/grupos'),
  obtener: (id) => client.get(`/grupos/${id}`),
  crear: (body) => client.post('/grupos', body),
  horario: (id) => client.get(`/grupos/${id}/horario`),
  alumnos: (id) => client.get(`/grupos/${id}/alumnos`),
  finalizar: (id) => client.post(`/grupos/${id}/finalizar`),
  preCerrar: (id) => client.post(`/grupos/${id}/pre-cerrar`),
  resultados: (id) => client.get(`/grupos/${id}/resultados`),
  estadisticas: (id) => client.get(`/grupos/${id}/resultados/estadisticas`),
  resultadosUnidades: (id) => client.get(`/grupos/${id}/resultados/unidades`),
  bonusUnidad: (id, body) => client.post(`/grupos/${id}/bonus/unidad`, body),
  bonusMateria: (id, body) => client.post(`/grupos/${id}/bonus/materia`, body),
  override: (id, body) => client.post(`/grupos/${id}/override`, body),
  eliminar: (id) => client.delete(`/grupos/${id}`),
}

export const inscripciones = {
  listar: (grupoId) => client.get(`/grupos/${grupoId}/inscripciones`),
  crear: (grupoId, body) => client.post(`/grupos/${grupoId}/inscripciones`, body),
  importarCSV: (grupoId, file) => {
    const fd = new FormData()
    fd.append('archivo', file)
    return client.post(`/grupos/${grupoId}/importar-csv`, fd, { headers: { 'Content-Type': 'multipart/form-data' } })
  },
  baja: (id) => client.delete(`/inscripciones/${id}`),
  misGrupos: () => client.get('/mis-grupos'),
}

export const unidades = {
  listar: (grupoId) => client.get(`/grupos/${grupoId}/unidades`),
  cerrar: (id, body) => client.post(`/unidades/${id}/cerrar`, body),
  capturaPendiente: (id) => client.get(`/unidades/${id}/captura-pendiente`),
}

export const actividades = {
  listar: (unidadId) => client.get(`/unidades/${unidadId}/actividades`),
  crear: (unidadId, body) => client.post(`/unidades/${unidadId}/actividades`, body),
  actualizar: (id, body) => client.patch(`/actividades/${id}`, body),
  eliminar: (id) => client.delete(`/actividades/${id}`),
  publicar: (id) => client.post(`/actividades/${id}/publicar`),
  publicarUnidad: (unidadId) => client.post(`/unidades/${unidadId}/publicar`),
}

export const calificaciones = {
  listar: (actividadId) => client.get(`/actividades/${actividadId}/calificaciones`),
  registrar: (actividadId, body) => client.post(`/actividades/${actividadId}/calificaciones`, body),
  bulk: (actividadId, body) => client.post(`/actividades/${actividadId}/calificaciones/bulk`, body),
  actualizar: (actividadId, body) => client.patch(`/actividades/${actividadId}/calificaciones`, body),
}

export const resultados = {
  desglose: (inscripcionId) => client.get(`/inscripciones/${inscripcionId}/desglose`),
  actividades: (inscripcionId, unidadId) => client.get(`/inscripciones/${inscripcionId}/actividades/${unidadId}`),
  dinamico: (inscripcionId, unidadId) => client.get(`/inscripciones/${inscripcionId}/resultado-dinamico/${unidadId}`),
}

export const entregas = {
  subir: (actividadId, file) => {
    const fd = new FormData()
    fd.append('archivo', file)
    return client.post(`/entregas/${actividadId}`, fd, { headers: { 'Content-Type': 'multipart/form-data' } })
  },
  misEntregas: (actividadId) => client.get(`/entregas/${actividadId}/mis-entregas`),
  entregasAlumno: (actividadId, inscId) => client.get(`/entregas/${actividadId}/alumno/${inscId}`),
  resumen: (actividadId) => client.get(`/entregas/${actividadId}/resumen`),
  descargar: (entregaId) => client.get(`/entregas/descargar/${entregaId}`, { responseType: 'blob' }),
}

export const analytics = {
  comparativaMaterias: (periodoA, periodoB) => client.get('/analytics/comparativa-materias', { params: { periodo_a: periodoA, periodo_b: periodoB } }),
  docentesAprobacion: (periodoId) => client.get('/analytics/docentes-aprobacion', { params: { periodo_id: periodoId } }),
  mejoresAlumnos: (periodoId) => client.get('/analytics/mejores-alumnos', { params: { periodo_id: periodoId } }),
  desercion: (periodoId) => client.get('/analytics/desercion', { params: { periodo_id: periodoId } }),
  reprobacionHistorica: () => client.get('/analytics/reprobacion-historica'),
}

export const tiposActividad = {
  listar: () => client.get('/tipos-actividad'),
  crear: (body) => client.post('/tipos-actividad', null, { params: body }),
  actualizar: (id, body) => client.put(`/tipos-actividad/${id}`, null, { params: body }),
  eliminar: (id) => client.delete(`/tipos-actividad/${id}`),
}

export const notificaciones = {
  listar: () => client.get('/notificaciones/mis-notificaciones'),
  noLeidas: () => client.get('/notificaciones/no-leidas/count'),
  marcarLeida: (id) => client.put(`/notificaciones/${id}/leer`),
  marcarTodasLeidas: () => client.put('/notificaciones/marcar-todas-leidas'),
}

export const importar = {
  alumnos: (file) => uploadCSV('/importar/alumnos', file),
  previewAlumnos: (file) => uploadCSV('/importar/alumnos/preview', file),
  confirmarAlumnos: (file) => uploadCSV('/importar/alumnos/confirmar', file),
  docentes: (file) => uploadCSV('/importar/docentes', file),
  previewDocentes: (file) => uploadCSV('/importar/docentes/preview', file),
  confirmarDocentes: (file) => uploadCSV('/importar/docentes/confirmar', file),
  materias: (file) => uploadCSV('/importar/materias', file),
  previewMaterias: (file) => uploadCSV('/importar/materias/preview', file),
  confirmarMaterias: (file) => uploadCSV('/importar/materias', file),
  grupos: (file) => uploadCSV('/importar/grupos', file),
  previewGrupos: (file) => uploadCSV('/importar/grupos/preview', file),
  confirmarGrupos: (file) => uploadCSV('/importar/grupos', file),
  inscripciones: (file) => uploadCSV('/importar/inscripciones', file),
  previewInscripciones: (file) => uploadCSV('/importar/inscripciones/preview', file),
  confirmarInscripciones: (file) => uploadCSV('/importar/inscripciones', file),
}

export const dashboard = {
  admin: () => client.get('/dashboard/admin'),
  docente: () => client.get('/dashboard/docente'),
  alumno: () => client.get('/dashboard/alumno'),
  detalle: (params) => client.get('/dashboard/reporte-detallado', { params }),
  tiposActividad: () => client.get('/dashboard/tipos-actividad'),
}

export const auditoria = {
  listar: (params) => client.get('/auditoria', { params }),
  tablas: () => client.get('/auditoria/tablas-disponibles'),
}

export const misActividades = {
  porInscripcion: (inscripcionId) => client.get(`/mis-actividades/${inscripcionId}`),
}

export const carreras = {
  listar: () => client.get('/carreras'),
  crear: (body) => client.post('/carreras', body),
  actualizar: (id, body) => client.put(`/carreras/${id}`, body),
  planes: (id) => client.get(`/carreras/${id}/planes`),
}

export const planes = {
  listar: () => client.get('/planes'),
  listarPorCarrera: (id) => client.get(`/carreras/${id}/planes`),
  crear: (body) => client.post('/planes', body),
  materias: (planId) => client.get(`/planes/${planId}/materias`),
  listarTodasMaterias: () => client.get('/planes/materias/todas'),
  actualizarPosicion: (pmId, body) => client.patch(`/planes/materias/${pmId}/posicion`, body),
  vincularMateria: (materiaId, body) => client.post(`/materias/${materiaId}/vincular-plan`, body),
  desvincularMateria: (materiaId, planId) => client.delete(`/materias/${materiaId}/desvincular-plan/${planId}`),
  listarPrerrequisitos: (pmId) => client.get(`/planes/materias/${pmId}/prerrequisitos`),
  crearPrerrequisito: (pmId, body) => client.post(`/planes/materias/${pmId}/prerrequisitos`, body),
  eliminarPrerrequisito: (prId) => client.delete(`/planes/materias/prerrequisitos/${prId}`),
}
export const reportes = {
  // R1 — Boleta individual
  boleta: (alumnoId, periodoId) =>
    client.get(`/reportes/boleta/${alumnoId}`, { params: periodoId ? { periodo_id: periodoId } : {} }),

  // R2 — Calificaciones por grupo con parciales
  calificacionesGrupo: (grupoId) =>
    client.get(`/reportes/grupo/${grupoId}/calificaciones`),

  // R3 — Reporte por materia
  porMateria: (materiaId, periodoId) =>
    client.get('/reportes/por-materia', { params: { materia_id: materiaId, ...(periodoId ? { periodo_id: periodoId } : {}) } }),

  // R7 — Índice de reprobación unificado
  indiceReprobacion: (params) =>
    client.get('/reportes/indice-reprobacion', { params }),

  // R11 — Lista de reprobados
  reprobados: (params) =>
    client.get('/reportes/reprobados', { params }),

  // R12 — Riesgo académico
  riesgoAcademico: (periodoId, grupoId) =>
    client.get('/reportes/riesgo-academico', { params: { ...(periodoId ? { periodo_id: periodoId } : {}), ...(grupoId ? { grupo_id: grupoId } : {}) } }),

  // R13 — Estado de captura
  estadoCaptura: (periodoId) =>
    client.get('/reportes/estado-captura', { params: periodoId ? { periodo_id: periodoId } : {} }),

  // Catálogos auxiliares para filtros
  gruposPeriodo: (periodoId) =>
    client.get('/reportes/catalogos/grupos-periodo', { params: { periodo_id: periodoId } }),
}

export const administracion = {
  administradores: () => client.get('/administracion/administradores'),
  docentesNoAdmin: () => client.get('/administracion/docentes-no-admin'),
  crearAdministrador: (body) => client.post('/administracion/administradores', body),
  asignarAdmin: (body) => client.post('/administracion/asignar-admin', body),
}
