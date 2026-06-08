import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  grupos as gruposApi,
  unidades as unidadesApi,
  actividades as actividadesApi,
  inscripciones as inscripcionesApi,
  alumnos as alumnosApi,
  dashboard as dashboardApi,
  tiposActividad as tiposActividadApi
} from '../api/endpoints'
import { PageHeader } from '../components/layout/Layout'
import {
  Card, Badge, Btn, Input, PonderacionBar, CalDisplay, StatCard,
  Modal, EmptyState, Spinner, ErrorMsg, Toast, SearchInput, Select, ConfirmDialog
} from '../components/ui'
import { Plus, Lock, Trash2, ChevronRight, ChevronDown, ClipboardList, AlertTriangle, Users, UserPlus, UserMinus, GraduationCap, BarChart2, CheckCircle, XCircle, FileDown, UploadCloud, Clock, Gift, FileText, BookOpen, Layers, Beaker, MessageSquare, User, CheckSquare, Info } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { generarReporteAcademico } from '../utils/reportGenerator'

export default function GrupoDetalle() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { isDocente, isAdmin } = useAuth()

  const [grupo, setGrupo] = useState(null)
  const [unidades, setUnidades] = useState([])
  const [expanded, setExpanded] = useState(null)
  const [actsByUnidad, setActs] = useState({})
  const [loading, setLoading] = useState(true)
  const [toast, setToast] = useState(null)
  const [modalAct, setModalAct] = useState(null)
  const [modalCerrar, setModalC] = useState(null)
  const [modalFinalizar, setModalF] = useState(false)
  const [statsFinal, setStatsF] = useState(null) // used for the Modal
  const [statsGrupo, setStatsGrupo] = useState(null) // used for display
  const [pendientes, setPendientes] = useState([])
  const [saving, setSaving] = useState(false)
  const [verificando, setVerif] = useState(false)
  const [error, setError] = useState(null)

  // Inscripciones
  const [inscripciones, setInscripciones] = useState([])
  const [todosAlumnos, setTodosAlumnos] = useState([])
  const [showAlumnos, setShowAlumnos] = useState(false)
  const [modalInscribir, setModalInscribir] = useState(false)
  const [confirmBaja, setConfirmBaja] = useState(null)  // inscripcion obj
  const [alumnoSearch, setAlumnoSearch] = useState('')
  const [alumnoSelId, setAlumnoSelId] = useState('')
  const [savingInsc, setSavingInsc] = useState(false)
  const [errorInsc, setErrorInsc] = useState(null)

  // Importacion CSV
  const [modalImport, setModalImport] = useState(false)
  const [importFile, setImportFile] = useState(null)
  const [importResult, setImportResult] = useState(null)
  const [confirmEliminarAct, setConfirmEliminarAct] = useState(null) // { actividadId, unidadId }

  // Resultados por unidad
  const [modalResUnidad, setModalResUnidad] = useState(null) // unidad obj
  const [resUnidad, setResUnidad] = useState([])
  const [loadingRes, setLoadingRes] = useState(false)
  const [modalBonus, setModalBonus] = useState(null) // { insc, unidad_id }
  const [bonusForm, setBonusForm] = useState({ monto: '', justificacion: '' })

  // Formularios
  const [tiposActividad, setTiposActividad] = useState([])
  const [formAct, setFormA] = useState({
    tipo_catalogo_id: '',
    descripcion: '',
    ponderacion: ''
  })

  // Cargar tipos desde el catálogo
  useEffect(() => {
    tiposActividadApi.listar().then(res => {
      setTiposActividad(res.data);
    })
  }, [])

  function notify(message, type = 'success') {
    setToast({ message, type })
    setTimeout(() => setToast(null), 3500)
  }

  async function cargar() {
    try {
      const [g, u, insc, stat] = await Promise.all([
        gruposApi.obtener(id),
        unidadesApi.listar(id),
        inscripcionesApi.listar(id),
        gruposApi.estadisticas(id).then(r => r.data).catch(() => null)
      ])
      setGrupo(g.data)
      setUnidades(u.data)
      setInscripciones(insc.data)
      setStatsGrupo(stat)
    } catch (err) {
      console.error(err)
      notify('Error al cargar datos del grupo', 'error')
    } finally {
      setLoading(false)
    }
  }

  async function cargarTodosAlumnos() {
    if (todosAlumnos.length > 0) return
    const r = await alumnosApi.listar()
    setTodosAlumnos(r.data.filter(a => a.activo))
  }

  useEffect(() => { cargar() }, [id])

  async function cargarActividades(unidadId) {
    const r = await actividadesApi.listar(unidadId)
    setActs(prev => ({ ...prev, [unidadId]: r.data }))
  }

  function toggleUnidad(unidadId) {
    const next = expanded === unidadId ? null : unidadId
    setExpanded(next)
    if (next && !actsByUnidad[next]) cargarActividades(next)
  }

  async function verResultadosUnidad(unidad) {
    setModalResUnidad(unidad)
    setLoadingRes(true)
    try {
      const r = await gruposApi.resultadosUnidades(id)
      const filtrados = r.data.filter(row => row.unidad_id === unidad.id)
      setResUnidad(filtrados)
    } catch {
      setResUnidad([])
    } finally {
      setLoadingRes(false)
    }
  }

  async function aplicarBonus(e) {
    e.preventDefault()
    setSaving(true)
    try {
      await gruposApi.bonusUnidad(id, {
        inscripcion_id: modalBonus.insc.inscripcion_id,
        unidad_id: modalBonus.unidad_id,
        monto: parseFloat(bonusForm.monto),
        justificacion: bonusForm.justificacion || null,
      })
      notify('Bonus aplicado correctamente')
      setModalBonus(null)
      setBonusForm({ monto: '', justificacion: '' })
      // Recargar resultados de la unidad
      await verResultadosUnidad(modalResUnidad)
    } catch (err) {
      notify(err?.response?.data?.detail?.mensaje ?? 'Error al aplicar bonus', 'error')
    } finally {
      setSaving(false)
    }
  }

  async function crearActividad(e) {
    e.preventDefault()
    setError(null)
    setSaving(true)
    // Validación de fechas
    if (formAct.fecha_apertura && formAct.fecha_cierre) {
      const now = new Date()
      const apertura = new Date(formAct.fecha_apertura)
      const cierre = new Date(formAct.fecha_cierre)
      const minStart = new Date(now.getTime() - 1000 * 60 * 5) // 5 minutos de gracia

      if (apertura < minStart) {
        setError({ response: { data: { detail: { mensaje: 'La fecha de apertura no puede ser anterior a la hora actual.' } } } })
        setSaving(false)
        return
      }
      if (cierre <= apertura) {
        setError({ response: { data: { detail: { mensaje: 'La fecha de cierre debe ser posterior a la fecha de apertura.' } } } })
        setSaving(false)
        return
      }
    }

    try {
      await actividadesApi.crear(modalAct, {
        tipo_catalogo_id: parseInt(formAct.tipo_catalogo_id),
        descripcion: formAct.descripcion || null,
        ponderacion: parseFloat(formAct.ponderacion)
      })
      setModalAct(null)
      setFormA({ tipo_catalogo_id: '', descripcion: '', ponderacion: '' })
      await cargarActividades(modalAct)
      await cargar() // refrescar suma ponderaciones
      notify('Actividad agregada')
    } catch (err) {
      setError(err)
    } finally {
      setSaving(false)
    }
  }

  async function eliminarActividad() {
    const { actividadId, unidadId } = confirmEliminarAct
    setSaving(true)
    try {
      const r = await actividadesApi.eliminar(actividadId)
      if (r.data.advertencia) notify(r.data.advertencia, 'warning')
      else notify('Actividad eliminada')
      await cargarActividades(unidadId)
      await cargar()
      setConfirmEliminarAct(null)
    } catch (err) {
      notify(err?.response?.data?.detail?.mensaje ?? 'Error al eliminar', 'error')
    } finally {
      setSaving(false)
    }
  }

  async function clickCerrarUnidad(unidad) {
    setVerif(true)
    try {
      const r = await unidadesApi.capturaPendiente(unidad.id)
      setPendientes(r.data || [])
      setModalC(unidad)
    } catch (err) {
      notify('Error al verificar capturas pendientes', 'error')
    } finally {
      setVerif(false)
    }
  }

  async function cerrarUnidad(unidad, forzar) {
    setSaving(true)
    try {
      await unidadesApi.cerrar(unidad.id, { forzar_nulos: forzar })
      setModalC(null)
      await cargar()
      notify(`Unidad ${unidad.nombre} cerrada. Resultados calculados.`)
    } catch (err) {
      notify(err?.response?.data?.detail?.mensaje ?? 'Error al cerrar', 'error')
    } finally {
      setSaving(false)
    }
  }



  async function inscribirAlumno() {
    if (!alumnoSelId) return
    setSavingInsc(true); setErrorInsc(null)
    try {
      await inscripcionesApi.crear(id, { alumno_id: alumnoSelId })

      const totalInscritosAhora = inscritos.length + 1
      if (grupo.capacidad_minima && totalInscritosAhora > grupo.capacidad_minima) {
        const exceso = totalInscritosAhora - grupo.capacidad_minima
        notify(`Alumno inscrito. Aviso: Has superado el límite de capacidad del aula en ${exceso} alumno(s).`, 'warning')
      } else {
        notify('Alumno inscrito correctamente')
      }

      setModalInscribir(false)
      setAlumnoSelId('')
      setAlumnoSearch('')
      await cargar()
    } catch (err) {
      setErrorInsc(err)
    } finally {
      setSavingInsc(false)
    }
  }

  async function darBaja(inscripcion) {
    setSavingInsc(true)
    try {
      await inscripcionesApi.baja(inscripcion.id)
      setConfirmBaja(null)
      await cargar()
      notify(`${inscripcion.alumno_nombre} dado de baja del grupo`)
    } catch (err) {
      notify(err?.response?.data?.detail?.mensaje ?? 'Error al dar de baja', 'error')
    } finally {
      setSavingInsc(false)
    }
  }

  async function handleImportCSV(e) {
    e.preventDefault()
    if (!importFile) return
    setSavingInsc(true)
    setErrorInsc(null)
    setImportResult(null)
    try {
      const res = await inscripcionesApi.importarCSV(id, importFile)
      setImportResult(res.data)
      await cargar()

      const totalInscritosAhora = inscritos.length + res.data.insertados
      if (grupo.capacidad_minima && totalInscritosAhora > grupo.capacidad_minima) {
        const exceso = totalInscritosAhora - grupo.capacidad_minima
        notify(`Importación finalizada. Aviso: Límite de capacidad superado en ${exceso} alumno(s).`, 'warning')
      } else {
        notify('Importación finalizada')
      }
    } catch (err) {
      setErrorInsc(err?.response?.data?.detail?.mensaje ?? err?.response?.data?.detail ?? 'Error en la importación')
    } finally {
      setSavingInsc(false)
    }
  }

  async function clickFinalizarMateria() {
    setSaving(true)
    try {
      const r = await gruposApi.estadisticas(id)
      setStatsF(r.data)
      setModalF(true)
    } catch (err) {
      notify('Error al obtener estadísticas previas', 'error')
    } finally {
      setSaving(false)
    }
  }

  async function preCerrarMateria() {
    if (!confirm('¿Desea pre-cerrar la materia? Esto permitirá aplicar bonus de materia y ajustes finales (overrides) antes del sellado definitivo.')) return
    setSaving(true)
    try {
      await gruposApi.preCerrar(id)
      await cargar()
      notify('Grupo en estado PRE-CIERRE. Ya puede aplicar Bonus de Materia y Ajustes Finales.')
    } catch (err) {
      notify(err?.response?.data?.detail?.mensaje ?? 'Error al pre-cerrar', 'error')
    } finally {
      setSaving(false)
    }
  }

  async function finalizarMateria() {
    setSaving(true)
    try {
      await gruposApi.finalizar(id)
      setModalF(false)
      await cargar()
      notify('Materia finalizada (SELLADA). Los resultados son ahora definitivos e inmutables.')
    } catch (err) {
      notify(err?.response?.data?.detail?.mensaje ?? 'Error al finalizar', 'error')
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <Spinner />
  if (!grupo) return <div className="p-8 text-red-500">Grupo no encontrado</div>

  const todasCerradas = unidades.length > 0 && unidades.every(u => u.estado !== 'EDICION')
  const puedeEditar = (isAdmin || isDocente) && (grupo.estado === 'ACTIVO' || grupo.estado === 'PRECIERRE')
  const puedeGestionarAlumnos = isAdmin

  const inscritos = inscripciones.filter(i => i.estado === 'ACTIVA')
  const alumnosInscritos = new Set(inscritos.map(i => i.alumno_id))
  const normalize = (s) => s ? s.normalize('NFD').replace(/[\u0300-\u036f]/g, "").toLowerCase() : ""

  const alumnosDisponibles = todosAlumnos.filter(a => {
    if (alumnosInscritos.has(a.id)) return false
    const search = normalize(alumnoSearch).trim()
    if (!search) return true
    const fullName = normalize([a.nombre, a.apellido_pat, a.apellido_mat].filter(Boolean).join(' '))
    const matricula = normalize(a.matricula)
    return fullName.includes(search) || matricula.includes(search)
  })

  return (
    <div>
      <PageHeader
        breadcrumb={['Grupos', grupo.nombre]}
        title={grupo.nombre}
        subtitle={`Docente: ${grupo.docente_nombre || 'No asignado'} · Estado: ${grupo.estado}`}
        actions={
          <div className="flex gap-2">
            {(isAdmin || isDocente) && (
              <Btn variant="white-gold" size="md" onClick={() => navigate(`/grupos/${id}/resultados`)}>
                <ClipboardList size={16} /> Resultados
              </Btn>
            )}
            {isDocente && (
              <>
                {grupo.estado === 'ACTIVO' && todasCerradas && (
                  <Btn variant="primary" size="sm" onClick={preCerrarMateria} loading={saving}>
                    <Clock size={14} className="mr-1" /> Pre-cerrar materia
                  </Btn>
                )}
                {grupo.estado === 'PRECIERRE' && (
                  <Btn size="md" onClick={clickFinalizarMateria} loading={verificando}>
                    <GraduationCap size={14} className="mr-1" /> Finalizar Materia
                  </Btn>
                )}
              </>
            )}
          </div>
        }
      />

      <div className="p-8 space-y-4">

        {statsGrupo && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
            <StatCard
              label={grupo.estado === 'FINALIZADO' ? 'Promedio Final' : 'Promedio Parcial'}
              value={statsGrupo.promedio_grupo ?? '--'}
              icon={BarChart2}
              color="white"
            />
            <StatCard
              label="Total Alumnos"
              value={statsGrupo.total_alumnos ?? inscripciones.length}
              icon={Users}
              color="white"
            />
            <StatCard
              label={`Aprobados ${grupo.estado === 'ACTIVO' ? 'Proyectados' : ''}`}
              value={statsGrupo.aprobados ?? '--'}
              icon={CheckCircle}
              color="white"
            />
            <StatCard
              label={`Reprobados ${grupo.estado === 'ACTIVO' ? 'Proyectados' : ''}`}
              value={statsGrupo.reprobados ?? '--'}
              icon={XCircle}
              color="white"
            />
          </div>
        )}

        <Card className="overflow-hidden">
          <div
            className="flex items-center justify-between px-5 py-4 cursor-pointer hover:bg-slate-50/50 transition-colors"
            onClick={() => setShowAlumnos(v => !v)}
          >
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-emerald-50 flex items-center justify-center">
                <Users size={16} className="text-emerald-600" />
              </div>
              <div>
                <p className="text-sm font-semibold text-slate-900">Alumnos inscritos</p>
                <p className="text-xs text-slate-400">{inscritos.length} activos · {inscripciones.filter(i => i.estado === 'BAJA').length} bajas</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {puedeGestionarAlumnos && grupo.estado === 'ACTIVO' && (
                <>
                  <div className="flex gap-2">
                    <Btn
                      size="sm" variant="secondary"
                      onClick={e => {
                        e.stopPropagation();
                        setModalImport(true);
                        setErrorInsc(null);
                        setImportResult(null)
                      }}
                    >
                      <UploadCloud size={13} /> Carga masiva
                    </Btn>
                    <Btn
                      size="sm" variant="secondary"
                      onClick={e => {
                        e.stopPropagation()
                        cargarTodosAlumnos()
                        setModalInscribir(true)
                        setErrorInsc(null)
                      }}
                    >
                      <UserPlus size={13} /> Inscribir alumno
                    </Btn>
                  </div>
                </>
              )}
              <ChevronRight size={16} className={`text-slate-400 transition-transform ${showAlumnos ? 'rotate-90' : ''}`} />
            </div>
          </div>

          {showAlumnos && (
            <div className="border-t border-slate-100 px-5 pb-4 pt-3">
              {inscripciones.length === 0 ? (
                <EmptyState
                  icon={GraduationCap}
                  title="Sin alumnos inscritos"
                  description="Usa el botón 'Inscribir alumno' para agregar alumnos a este grupo."
                />
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-xs text-slate-500 border-b border-slate-100">
                      <th className="text-left pb-2 font-medium">Alumno</th>
                      <th className="text-left pb-2 font-medium w-28">No. Control</th>
                      <th className="text-left pb-2 font-medium w-24">Estado</th>
                      {puedeGestionarAlumnos && grupo.estado === 'ACTIVO' && <th className="w-10" />}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {inscripciones.map(i => (
                      <tr key={i.id} className="group">
                        <td className="py-2.5 font-medium text-slate-800 flex items-center gap-2">
                          <span className={i.estado === 'BAJA' ? 'text-slate-400 line-through' : ''}>
                            {i.alumno_nombre}
                          </span>
                        </td>
                        <td className="py-2.5 font-mono text-xs text-slate-500 bg-slate-50 rounded px-2">{i.alumno_matricula}</td>
                        <td className="py-2.5"><Badge estado={i.estado === 'ACTIVA' ? 'ACTIVA' : 'BAJA'} /></td>
                        {puedeGestionarAlumnos && grupo.estado === 'ACTIVO' && (
                          <td className="py-2.5 text-right">
                            {i.estado === 'ACTIVA' && (
                              <button
                                onClick={() => setConfirmBaja(i)}
                                className="opacity-0 group-hover:opacity-100 p-1.5 rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50 transition-all"
                                title="Dar de baja"
                              >
                                <UserMinus size={14} />
                              </button>
                            )}
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}
        </Card>
        {unidades.length === 0 && (
          <EmptyState
            icon={ClipboardList}
            title="Sin unidades"
            description="Las unidades se crean automáticamente según la plantilla de la materia al crear el grupo."
          />
        )}

        {unidades.map(u => {
          console.log('Unidad:', u.nombre, 'Suma Ponderaciones:', u.suma_ponderaciones);
          const acts = actsByUnidad[u.id] ?? []
          const isOpen = expanded === u.id
          const suma = u.suma_ponderaciones ?? 0
          const completa = u.estructura_completa ?? false
          const cerrada = u.estado !== 'EDICION'

          return (
            <Card key={u.id} className="overflow-hidden">
              {/* Header de la unidad */}
              <div
                className="flex items-center gap-4 px-5 py-4 cursor-pointer hover:bg-gray-50/50 transition-colors"
                onClick={() => toggleUnidad(u.id)}
              >
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-sm font-bold
                  ${cerrada ? 'bg-gray-100 text-gray-500' : 'bg-primary-50 text-primary-700'}`}>
                  {u.numero}
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-gray-900 text-sm">{u.nombre}</span>
                    <Badge estado={u.estado} />
                    {!completa && !cerrada && (
                      <span className="inline-flex items-center gap-1 text-xs text-warning-500">
                        <AlertTriangle size={11} /> {suma.toFixed(1)}%
                      </span>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  {/* Botón capturar calificaciones - Solo Docente */}
                  {(() => {
                    const esUnidadAnteriorAbierta = unidades.some(prev => prev.numero < u.numero && prev.estado === 'EDICION');
                    return (
                      completa && !cerrada && isDocente && !esUnidadAnteriorAbierta && (
                        <Btn
                          size="sm"
                          variant="secondary"
                          onClick={e => { e.stopPropagation(); navigate(`/grupos/${id}/calificaciones/${u.id}`) }}
                        >
                          Capturar
                        </Btn>
                      )
                    );
                  })()}
                  {/* Botón cerrar unidad - Solo Docente */}
                  {(() => {
                    const esUnidadAnteriorAbierta = unidades.some(prev => prev.numero < u.numero && prev.estado === 'EDICION');
                    return (
                      completa && !cerrada && isDocente && !esUnidadAnteriorAbierta && (
                        <Btn
                          size="sm"
                          variant="primary"
                          onClick={e => { e.stopPropagation(); clickCerrarUnidad(u) }}
                          loading={verificando}
                        >
                          <Lock size={12} /> Cerrar
                        </Btn>
                      )
                    );
                  })()}
                  {/* Botón ver resultados unidad (solo cerradas) */}
                  {cerrada && (isAdmin || isDocente) && (
                    <Btn
                      size="sm"
                      variant="ghost"
                      onClick={e => { e.stopPropagation(); verResultadosUnidad(u) }}
                    >
                      <BarChart2 size={13} /> Resultados
                    </Btn>
                  )}
                  <ChevronRight
                    size={16}
                    className={`text-gray-400 transition-transform ${isOpen ? 'rotate-90' : ''}`}
                  />
                </div>
              </div>

              {/* Cuerpo expandible */}
              {isOpen && (
                <div className="border-t border-gray-100 px-5 pb-5 pt-4 space-y-4">

                  {/* Barra de ponderaciones */}
                  {!cerrada && <PonderacionBar suma={suma} />}

                  {/* Tabla de actividades */}
                  {acts.length > 0 ? (
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-xs text-gray-500 border-b border-gray-100">
                          <th className="text-left pb-2 font-medium">Actividad</th>
                          <th className="text-right pb-2 font-medium w-28">Ponderación</th>
                          {puedeEditar && !cerrada && <th className="w-16" />}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-50">
                        {acts.map(a => (
                          <tr key={a.id} className="group">
                            <td className="py-2.5">
                              <div className="flex flex-col">
                                <div className="flex items-center gap-2">
                                  <div className="bg-slate-100 px-3 py-1 rounded-lg">
                                    <p className="font-black text-slate-800 text-sm uppercase tracking-tight">
                                      {a.tipo_nombre || 'Sin Tipo'}
                                    </p>
                                  </div>
                                </div>
                                {a.descripcion && <p className="text-xs text-slate-500 mt-1.5">{a.descripcion}</p>}
                                {a.fecha_cierre && (
                                  <span className="text-[10px] text-slate-400 mt-1">Cierre: {new Date(a.fecha_cierre).toLocaleString()}</span>
                                )}
                              </div>
                            </td>
                            <td className="py-2.5 text-right">
                              <span className="font-semibold text-primary-700">{a.ponderacion}%</span>
                            </td>
                            {isDocente && !isAdmin && !cerrada && (
                              <td className="py-2.5 text-right">
                                <button
                                  onClick={() => setConfirmEliminarAct({ actividadId: a.id, unidadId: u.id })}
                                  className="opacity-0 group-hover:opacity-100 p-1.5 rounded text-gray-400 hover:text-danger-500 transition-all"
                                >
                                  <Trash2 size={14} />
                                </button>
                              </td>
                            )}
                          </tr>
                        ))}
                      </tbody>
                      {!cerrada && (
                        <tfoot>
                          <tr className="border-t border-gray-200">
                            <td className="pt-2 text-xs font-semibold text-gray-600">Total</td>
                            <td className={`pt-2 text-right text-xs font-bold ${completa ? 'text-success-500' : 'text-warning-500'}`}>
                              {suma.toFixed(1)}%
                            </td>
                            {puedeEditar && !cerrada && <td />}
                          </tr>
                        </tfoot>
                      )}
                    </table>
                  ) : (
                    <p className="text-sm text-gray-400 text-center py-4">
                      Sin actividades definidas
                    </p>
                  )}

                  {/* Botón agregar actividad - Solo Docente (No Admin) */}
                  {isDocente && !isAdmin && !cerrada && suma < 100 && (
                    <Btn
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        const acts = actsByUnidad[u.id] ?? []
                        const nextOrden = acts.length > 0 ? Math.max(...acts.map(a => a.orden)) + 1 : 1
                        setFormA(f => ({ ...f, orden: nextOrden }))
                        setModalAct(u.id)
                        setError(null)
                      }}
                    >
                      <Plus size={20} /> Agregar actividad
                    </Btn>

                  )}
                </div>
              )}
            </Card>
          )
        })}
      </div>


      <Modal open={!!modalAct} onClose={() => { setModalAct(null); setError(null) }} title="Nueva Actividad">
        {modalAct && (() => {
          const u = unidades.find(u => u.id === modalAct)
          const suma = u?.suma_ponderaciones ?? 0
          const restante = (100 - suma).toFixed(1)
          return (
            <form onSubmit={crearActividad} className="space-y-4">
              {error && <ErrorMsg error={error} />}
              <div className="bg-primary-50 rounded-lg p-3">
                <PonderacionBar suma={suma} />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Select
                  label="Tipo de actividad"
                  value={formAct.tipo_catalogo_id}
                  onChange={e => setFormA(f => ({ ...f, tipo_catalogo_id: e.target.value }))}
                  required
                >
                  <option value="">Seleccione tipo...</option>
                  {Array.isArray(tiposActividad) && tiposActividad.map(t => (
                    <option key={t.id} value={t.id}>
                      {t.nombre}
                    </option>
                  ))}
                </Select>

                <Input
                  label={`Ponderación (máx: ${restante}%)`}
                  type="number" step="0.01" min="0.01" max={restante}
                  placeholder={restante}
                  value={formAct.ponderacion}
                  onChange={e => setFormA(f => ({ ...f, ponderacion: e.target.value }))}
                  required
                />
              </div>

              <Input
                label="Descripción / Tema"
                placeholder="Ej: Ensayo de la Revolución, Quiz de Fracciones..."
                value={formAct.descripcion}
                onChange={e => setFormA(f => ({ ...f, descripcion: e.target.value }))}
              />

              <div className="flex gap-2 justify-end pt-2">
                <Btn variant="secondary" onClick={() => setModalAct(null)}>Cancelar</Btn>
                <Btn type="submit" loading={saving}>Agregar</Btn>
              </div>
            </form>
          )
        })()}
      </Modal>

      <Modal open={!!modalCerrar} onClose={() => setModalC(null)} title="Cerrar Unidad">
        {modalCerrar && (
          <div className="space-y-4">
            {error && <ErrorMsg error={error} />}
            <div className="bg-warning-50 border border-warning-500/20 rounded-lg p-4">
              <p className="text-sm font-medium text-warning-700 flex items-center gap-2">
                <AlertTriangle size={16} /> Esta acción es permanente
              </p>
              <p className="text-xs text-warning-700 mt-1">
                Al cerrar la unidad <strong>{modalCerrar.nombre}</strong> se calculará y guardará
                el resultado de cada alumno. Solo el administrador podrá modificar calificaciones después.
              </p>
            </div>

            {pendientes.length > 0 ? (
              <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                <p className="text-sm text-red-700 font-semibold mb-2">Bloqueo: Existen {pendientes.length} capturas pendientes. Registra un 0 explícito si el alumno no entregó.</p>
                <div className="max-h-32 overflow-y-auto mb-4 bg-white p-2 rounded border border-red-100 text-xs text-red-600 space-y-1">
                  {pendientes.map((p, i) => (
                    <p key={i}>• {p.alumno} — <strong>{p.actividad}</strong></p>
                  ))}
                </div>
                <div className="flex gap-2 justify-end">
                  <Btn variant="secondary" onClick={() => setModalC(null)}>Entendido</Btn>
                </div>
              </div>
            ) : (
              <>
                <p className="text-sm text-gray-600">
                  ¿Proceder con el cierre de la unidad?
                </p>
                <div className="flex flex-col gap-2">
                  <Btn variant="danger" onClick={() => cerrarUnidad(modalCerrar, false)} loading={saving}>
                    Cerrar unidad y registrar calificaciones
                  </Btn>
                  <Btn variant="secondary" onClick={() => setModalC(null)} disabled={saving}>
                    Cancelar
                  </Btn>
                </div>
              </>
            )}
          </div>
        )}
      </Modal>

      <Modal open={modalFinalizar} onClose={() => setModalF(false)} title="Finalizar Materia">
        <div className="space-y-4">
          <div className="bg-success-50 border border-success-500/20 rounded-lg p-4">
            <p className="text-am font-medium text-success-700 flex items-center gap-2">
              <Lock size={16} /> Sello Definitivo de Auditoría
            </p>
            <p className="text-xs text-success-700 mt-1">
              Está a punto de <strong>Finalizar (Sellar)</strong> la materia. Esta acción es <strong>IRREVERSIBLE</strong> y bloquea cualquier cambio posterior en Bonus de Materia o Ajustes (Overrides). Los resultados se vuelven inmutables para auditoría.
            </p>
          </div>

          {statsFinal && (
            <div className="grid grid-cols-2 gap-3 text-center mb-2">
              <div className="bg-gray-50 border border-gray-100 rounded-lg p-3">
                <p className="text-xs text-gray-400 font-semibold uppercase">Promedio</p>
                <p className="text-xl font-bold text-primary-600">{statsFinal.promedio_grupo ?? '--'}</p>
              </div>
              <div className="bg-gray-50 border border-gray-100 rounded-lg p-3">
                <p className="text-xs text-gray-400 font-semibold uppercase">Total Alumnos</p>
                <p className="text-xl font-bold text-gray-700">{statsFinal.total_alumnos}</p>
              </div>
              <div className="bg-success-50 border border-success-100 rounded-lg p-3">
                <p className="text-xs text-success-600/70 font-semibold uppercase">Aprobados</p>
                <p className="text-xl font-bold text-success-700">{statsFinal.aprobados}</p>
              </div>
              <div className="bg-red-50 border border-red-100 rounded-lg p-3">
                <p className="text-xs text-red-600/70 font-semibold uppercase">Reprobados</p>
                <p className="text-xl font-bold text-red-700">{statsFinal.reprobados}</p>
              </div>
            </div>
          )}

          <div className="flex gap-2 justify-end pt-2 border-t border-gray-100">
            <Btn variant="secondary" onClick={() => setModalF(false)} disabled={saving}>Cancelar</Btn>
            <Btn variant="success" onClick={finalizarMateria} loading={saving}>Aprobar cierre de materia</Btn>
          </div>
        </div>
      </Modal>

      <Modal
        open={modalInscribir}
        onClose={() => { setModalInscribir(false); setAlumnoSearch(''); setAlumnoSelId('') }}
        title="Inscribir alumno"
        subtitle={`Grupo: ${grupo.nombre}`}
        footer={
          <div className="flex gap-2 justify-end">
            <Btn variant="secondary" onClick={() => { setModalInscribir(false); setAlumnoSearch(''); setAlumnoSelId('') }}>Cancelar</Btn>
            <Btn onClick={inscribirAlumno} loading={savingInsc} disabled={!alumnoSelId}>
              <UserPlus size={13} /> Inscribir
            </Btn>
          </div>
        }
      >
        <div className="space-y-4">
          {errorInsc && <ErrorMsg error={errorInsc} />}

          {grupo.capacidad_minima > 0 && (
            <div className={`p-3 rounded-xl text-xs flex items-center justify-between ${inscritos.length >= grupo.capacidad_minima ? 'bg-amber-50 text-amber-800 border border-amber-200' : 'bg-slate-50 text-slate-600'}`}>
              <div>
                <p className="font-semibold">Capacidad del aula: {grupo.capacidad_minima}</p>
                <p>Inscritos actualmente: {inscritos.length}</p>
              </div>
              {inscritos.length >= grupo.capacidad_minima && (
                <div className="flex items-center gap-1.5 text-amber-700 font-bold bg-amber-100 px-2 py-1 rounded-lg">
                  <AlertTriangle size={14} /> Límite superado
                </div>
              )}
            </div>
          )}

          <SearchInput
            value={alumnoSearch}
            onChange={v => { setAlumnoSearch(v); setAlumnoSelId('') }}
            placeholder="Buscar por nombre o No. Control..."
          />
          <div className="max-h-64 overflow-y-auto divide-y divide-slate-50 rounded-xl border border-slate-100">
            {alumnosDisponibles.length === 0 ? (
              <p className="text-sm text-slate-400 text-center py-6">
                {alumnoSearch ? 'Sin resultados' : 'Todos los alumnos activos ya están inscritos'}
              </p>
            ) : alumnosDisponibles.map(a => (
              <button
                key={a.id}
                onClick={() => setAlumnoSelId(a.id)}
                className={`w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-slate-50 transition-colors
                  ${alumnoSelId === a.id ? 'bg-brand-50 border-l-2 border-brand-500' : ''}`}
              >
                <div className="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center text-xs font-bold text-slate-600 flex-shrink-0">
                  {a.nombre.charAt(0)}{a.apellido_pat.charAt(0)}
                </div>
                <div>
                  <p className="text-sm font-semibold text-slate-800">{a.nombre} {a.apellido_pat} {a.apellido_mat}</p>
                  <p className="text-xs text-slate-500 font-mono">No. Control: {a.num_control} {a.matricula && `${a.matricula}`}</p>
                </div>
              </button>
            ))}
          </div>
        </div>
      </Modal>

      <Modal open={modalImport} onClose={() => setModalImport(false)} title="Inscribir Masivo CSV"
        footer={<div className="flex gap-2 justify-end"><Btn variant="secondary" onClick={() => setModalImport(false)}>Cerrar</Btn><Btn form="fiInsc" type="submit" loading={savingInsc}>Importar CSV</Btn></div>}
      >
        <form id="fiInsc" onSubmit={handleImportCSV} className="space-y-4">
          {errorInsc && <ErrorMsg error={typeof errorInsc === 'string' ? errorInsc : JSON.stringify(errorInsc)} />}

          {grupo.capacidad_minima > 0 && (
            <div className={`p-3 rounded-xl text-xs flex items-center justify-between ${inscritos.length >= grupo.capacidad_minima ? 'bg-amber-50 text-amber-800 border border-amber-200' : 'bg-slate-50 text-slate-600'}`}>
              <div>
                <p className="font-semibold">Capacidad del aula: {grupo.capacidad_minima}</p>
                <p>Inscritos actualmente: {inscritos.length}</p>
              </div>
              {inscritos.length >= grupo.capacidad_minima && (
                <div className="flex items-center gap-1.5 text-amber-700 font-bold bg-amber-100 px-2 py-1 rounded-lg">
                  <AlertTriangle size={14} /> Límite superado
                </div>
              )}
            </div>
          )}

          <div className="bg-slate-50 p-3 rounded-lg text-sm text-slate-700">
            <p className="font-bold mb-1">Formato CSV esperado:</p>
            <p className="font-mono text-xs">Debe contener: <strong>num_control</strong></p>
          </div>

          <div>
            <label className="block text-sm font-semibold mb-2">Archivo CSV</label>
            <input type="file" accept=".csv" onChange={e => setImportFile(e.target.files[0])} required className="w-full form-input" />
          </div>

          {importResult && (
            <div className="bg-emerald-50 text-emerald-800 p-3 rounded-lg text-sm">
              <p className="font-bold">Resultado de importación:</p>
              <ul className="list-disc list-inside mt-1">
                <li>Inscritos: {importResult.insertados}</li>
                <li>Omitidos (Ya inscritos): {importResult.omitidos}</li>
                <li>Errores: {importResult.errores?.length || 0}</li>
              </ul>
              {importResult.errores?.length > 0 && (
                <div className="mt-2 p-2 bg-red-50 text-red-800 rounded max-h-32 overflow-auto text-xs font-mono">
                  {importResult.errores.map((e, idx) => (
                    <div key={idx} className="mb-1 border-b border-red-200 pb-1">
                      Fila {e.fila}: {e.error}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </form>
      </Modal>

      <ConfirmDialog
        open={!!confirmBaja}
        title="Confirmar baja"
        message={`¿Estás seguro que deseas dar de baja a ${confirmBaja?.alumno_nombre}?`}
        confirmText="Dar de baja"
        onConfirm={() => darBaja(confirmBaja)}
        onClose={() => setConfirmBaja(null)}
        loading={savingInsc}
      />

      <ConfirmDialog
        open={!!confirmEliminarAct}
        title="Eliminar actividad"
        message="¿Estás seguro de que deseas eliminar esta actividad? Si tiene calificaciones registradas, se realizará una baja lógica."
        confirmText="Eliminar"
        onConfirm={eliminarActividad}
        onClose={() => setConfirmEliminarAct(null)}
        loading={saving}
        variant="danger"
      />

      {/* Toast */}
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}


      <Modal
        open={!!modalResUnidad}
        onClose={() => setModalResUnidad(null)}
        title={modalResUnidad ? `Resultados — ${modalResUnidad.nombre}` : ''}
        subtitle={`Unidad ${modalResUnidad?.numero ?? ''}`}
        size="xl"
        footer={
          resUnidad.length > 0 ? (
            <div className="flex justify-end">
              <Btn
                variant="secondary"
                onClick={() => {
                  const vals = resUnidad.map(r => Number(r.resultado || 0));
                  const sortedVals = [...vals].sort((a, b) => a - b);
                  let med = 0;
                  if (sortedVals.length > 0) {
                    const mid = Math.floor(sortedVals.length / 2);
                    med = sortedVals.length % 2 !== 0 ? sortedVals[mid] : (sortedVals[mid - 1] + sortedVals[mid]) / 2;
                  }

                  const avg = vals.reduce((a, b) => a + b, 0) / (vals.length || 1);
                  const variance = vals.reduce((a, b) => a + Math.pow(b - avg, 2), 0) / (vals.length || 1);
                  const stdDev = Math.sqrt(variance);

                  generarReporteAcademico(
                    {
                      total_alumnos: resUnidad.length,
                      aprobados: resUnidad.filter(r => r.resultado >= 70).length,
                      reprobados: resUnidad.filter(r => r.resultado < 70).length,
                      promedio_grupo: avg.toFixed(2),
                      mediana: med,
                      desviacion_estandar: stdDev
                    },
                    resUnidad.map(r => ({
                      matricula: r.matricula,
                      alumno: r.alumno,
                      resultado_final: r.resultado,
                      bonus_unidad: r.bonus_unidad,
                      justificacion: r.justificacion,
                      estatus: r.resultado >= 70 ? 'APROBADO' : 'REPROBADO'
                    })),
                    {
                      nombre_archivo: `${grupo.materia}_U${modalResUnidad?.numero}_${grupo.nombre}.pdf`,
                      titulo_reporte: `Reporte de Unidad ${modalResUnidad?.numero} — ${modalResUnidad?.nombre}`
                    }
                  );
                  notify('Reporte generado exitosamente')
                }}
              >
                <FileDown size={18} className="mr-2" />
                Descargar Reporte Unidad
              </Btn>
            </div>
          ) : null
        }
      >
        {loadingRes ? <Spinner /> : (
          resUnidad.length === 0 ? (
            <EmptyState icon={BarChart2} title="Sin resultados" description="No hay resultados registrados para esta unidad." />
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-100">
                <tr>
                  <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase">Alumno</th>
                  <th className="text-center px-3 py-3 text-xs font-semibold text-gray-500 uppercase w-28">Promedio</th>
                  <th className="text-center px-3 py-3 text-xs font-semibold text-gray-500 uppercase w-24">Bonus</th>
                  <th className="text-center px-3 py-3 text-xs font-semibold text-gray-500 uppercase w-28">Resultado</th>
                  {isDocente && modalResUnidad?.estado === 'EDICION' && <th className="w-12" />}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {resUnidad.map(r => (
                  <tr key={r.inscripcion_id} className="hover:bg-gray-50/50 transition-colors">
                    <td className="px-5 py-3">
                      <p className="font-medium text-gray-900">{r.alumno}</p>
                      <p className="text-xs text-gray-400">{r.matricula}</p>
                    </td>
                    <td className="px-3 py-3 text-center">
                      <CalDisplay valor={r.promedio_parcial} size="sm" />
                    </td>
                    <td className="px-3 py-3 text-center">
                      {r.bonus_unidad > 0
                        ? <span className="text-xs font-semibold text-emerald-500">+{r.bonus_unidad}</span>
                        : <span className="text-xs text-gray-300">—</span>
                      }
                    </td>
                    <td className="px-3 py-3 text-center">
                      <CalDisplay valor={r.resultado} size="md" />
                    </td>
                    {isDocente && modalResUnidad?.estado === 'EDICION' && (
                      <td className="px-3 py-3 text-right">
                        <button
                          onClick={() => {
                            setModalBonus({ insc: r, unidad_id: modalResUnidad?.id });
                            setBonusForm({ monto: r.bonus_unidad || '', justificacion: '' });
                          }}
                          className="p-1.5 rounded-lg text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 transition-all"
                          title="Asignar bonus"
                        >
                          <Gift size={16} />
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          )
        )}
      </Modal>

      <Modal open={!!modalBonus} onClose={() => setModalBonus(null)} title="Bonus de Unidad">
        {modalBonus && (
          <form onSubmit={aplicarBonus} className="space-y-4">
            <p className="text-sm text-slate-600">
              Alumno: <strong>{modalBonus.insc.alumno}</strong>
            </p>
            <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-3">
              <p className="text-xs text-emerald-700 font-medium">
                El bonus se suma al promedio parcial de la unidad, con tope máximo de {grupo?.calificacion_maxima ?? 100}.
              </p>
            </div>
            <Input
              label="Monto del bonus"
              type="number" min="0" step="0.01"
              value={bonusForm.monto}
              onChange={e => setBonusForm(f => ({ ...f, monto: e.target.value }))}
              required
            />
            <Input
              label="Justificación (opcional)"
              value={bonusForm.justificacion}
              onChange={e => setBonusForm(f => ({ ...f, justificacion: e.target.value }))}
              placeholder="Motivo del bonus..."
            />
            <div className="flex gap-2 justify-end">
              <Btn variant="secondary" onClick={() => setModalBonus(null)}>Cancelar</Btn>
              <Btn type="submit" variant="success" loading={saving}>Aplicar bonus</Btn>
            </div>
          </form>
        )}
      </Modal>
    </div>
  )
}
