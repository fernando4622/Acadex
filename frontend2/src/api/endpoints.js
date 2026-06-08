// Endpoints API - Sistema de Calificaciones
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
  miPerfil: () => client.get('/alumnos/me/perfil'),
  miAvance: () => client.get('/alumnos/me/avance'),
  previewCSV: (file) => uploadCSV('/alumnos/importar/preview', file),
  confirmarCSV: (file) => uploadCSV('/alumnos/importar/confirmar', file),
  historial: (id) => client.get(`/alumnos/${id}/analytics`),
}

export const docentes = {
  listar: () => client.get('/docentes'),
  obtener: (id) => client.get(`/docentes/${id}`),
  crear: (body) => client.post('/docentes', body),
  actualizar: (id, body) => client.put(`/docentes/${id}`, body),
  resetPassword: (id, body) => client.post(`/docentes/${id}/reset-password`, body),
  crearAcceso: (id, body) => client.post(`/docentes/${id}/crear-acceso`, body),
  historial: (id) => client.get(`/docentes/${id}/analytics`),
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
  activo: () => client.get('/periodos/activo'),
  crear: (body) => client.post('/periodos', body),
  actualizar: (id, body) => client.put(`/periodos/${id}`, body),
  activar: (id) => client.post(`/periodos/${id}/activar`, {}),

  cerrar: (id) => client.post(`/periodos/${id}/cerrar`),
}

export const grupos = {
  listar: () => client.get('/grupos'),
  obtener: (id) => client.get(`/grupos/${id}`),
  crear: (body) => client.post('/grupos', body),
  resultados: (id) => client.get(`/grupos/${id}/resultados`),
  eliminar: (id) => client.delete(`/grupos/${id}`),
  alumnos: (id) => client.get(`/grupos/${id}/alumnos`),
  estadisticas: (id) => client.get(`/grupos/${id}/estadisticas`),
  resultadosUnidades: (id) => client.get(`/grupos/${id}/resultados-unidades`),
  bonusUnidad: (id, body) => client.post(`/grupos/${id}/bonus-unidad`, body),
  bonusMateria: (id, body) => client.post(`/grupos/${id}/bonus-materia`, body),
  override: (id, body) => client.post(`/grupos/${id}/override`, body),
  preCerrar: (id) => client.post(`/grupos/${id}/pre-cerrar`),
  finalizar: (id) => client.post(`/grupos/${id}/finalizar`),
}

export const inscripciones = {
  listar: (grupoId) => client.get(`/grupos/${grupoId}/inscripciones`),
  crear: (grupoId, body) => client.post(`/grupos/${grupoId}/inscripciones`, body),
  baja: (id) => client.delete(`/inscripciones/${id}`),

  misGrupos: () => client.get('/mis-grupos'),
}


export const unidades = {
  listar: (grupoId) => client.get(`/grupos/${grupoId}/unidades`),
  capturaPendiente: (id) => client.get(`/unidades/${id}/captura-pendiente`),
}

export const actividades = {
  listar: (unidadId) => client.get(`/unidades/${unidadId}/actividades`),
  crear: (unidadId, body) => client.post(`/unidades/${unidadId}/actividades`, body),
  actualizar: (id, body) => client.patch(`/actividades/${id}`, body),
  eliminar: (id) => client.delete(`/actividades/${id}`),
}

export const tiposActividad = {
  listar: () => client.get('/tipos-actividad'),
  crear: (body) => client.post('/tipos-actividad', body),
  actualizar: (id, body) => client.patch(`/tipos-actividad/${id}`, body),
}

export const misActividades = {
  porInscripcion: (inscId) => client.get(`/mis-actividades/${inscId}`),
}

export const calificaciones = {
  listar: (actividadId) => client.get(`/actividades/${actividadId}/calificaciones`),
  bulk: (actividadId, body) => client.post(`/actividades/${actividadId}/calificaciones/bulk`, body),
}

export const analytics = {
  docentesAprobacion: (periodoId) => client.get('/analytics/docentes-aprobacion', { params: { periodo_id: periodoId } }),
  mejoresAlumnos: (periodoId) => client.get('/analytics/mejores-alumnos', { params: { periodo_id: periodoId } }),
  desercion: (periodoId) => client.get('/analytics/desercion', { params: { periodo_id: periodoId } }),
  reprobacionHistorica: () => client.get('/analytics/reprobacion-historica'),
}

export const importar = {
  alumnos: (file) => uploadCSV('/importar/alumnos', file),
  materias: (file) => uploadCSV('/importar/materias', file),
  previewDocentes: (file) => uploadCSV('/importar/docentes/preview', file),
  confirmarDocentes: (file) => uploadCSV('/importar/docentes/confirmar', file),
  previewMaterias: (file) => uploadCSV('/importar/materias/preview', file),
  confirmarMaterias: (file) => uploadCSV('/importar/materias/confirmar', file),
}

export const dashboard = {
  admin: () => client.get('/dashboard/admin'),
  docente: () => client.get('/dashboard/docente'),
  alumno: () => client.get('/dashboard/alumno'),
  detalle: (params) => client.get('/dashboard/reporte-detallado', { params }),
}

export const carreras = {
  listar: () => client.get('/carreras'),
  crear: (body) => client.post('/carreras', body),
  actualizar: (id, body) => client.put(`/carreras/${id}`, body),
}

export const auditoria = {
  listar: (params) => client.get('/auditoria', { params }),
  tablas: () => client.get('/auditoria/tablas-disponibles'),
}

export const usuarios = {
  listar: () => client.get('/usuarios'),
  asignarRol: (body) => client.post('/usuarios/asignar-rol', body),
  removerRol: (body) => client.delete('/usuarios/remover-rol', { data: body }),
  toggleActivo: (id) => client.patch(`/usuarios/${id}/toggle-activo`),
}


export const resultados = {
  desglose: (inscId) => client.get(`/inscripciones/${inscId}/desglose`),
  dinamico: (inscId, uId) => client.get(`/inscripciones/${inscId}/resultado-dinamico/${uId}`),
}

export const notificaciones = {
  listar: () => client.get('/notificaciones/mis-notificaciones'),
  noLeidas: () => client.get('/notificaciones/no-leidas/count'),
}

export const entregas = {
  resumen: (actividadId) => client.get(`/entregas/${actividadId}/resumen`),
  entregasAlumno: (actividadId, inscId) => client.get(`/entregas/${actividadId}/alumno/${inscId}`),
  misEntregas: (actividadId) => client.get(`/entregas/${actividadId}/mis-entregas`),
  descargar: (entregaId) => client.get(`/entregas/descargar/${entregaId}`, { responseType: 'blob' }),
  subir: (actividadId, file) => {
    const fd = new FormData()
    fd.append('archivo', file)
    return client.post(`/entregas/${actividadId}`, fd, { headers: { 'Content-Type': 'multipart/form-data' } })
  }
}
