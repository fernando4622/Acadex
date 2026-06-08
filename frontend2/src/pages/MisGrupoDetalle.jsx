import { useState, useEffect, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { misActividades as api, inscripciones as inscApi, resultados as resApi, entregas as entregasApi } from '../api/endpoints'
import { PageHeader } from '../components/layout/Layout'
import { Card, Spinner, Badge, CalDisplay, EmptyState, Modal, Btn, Toast, Select } from '../components/ui'
import { Calendar, Clock, CheckCircle2, XCircle, BookOpen, UploadCloud, ChevronRight, FileText, Layers, Beaker, MessageSquare, User, CheckSquare, ClipboardList } from 'lucide-react'

const TIPO_CONFIG = {
  EXAMEN: { dot: 'bg-rose-500', gradient: 'from-rose-500 to-pink-600', shadow: 'shadow-rose-100', ring: 'ring-rose-100', icon: FileText, color: 'text-rose-500' },
  TAREA: { dot: 'bg-amber-500', gradient: 'from-amber-500 to-orange-500', shadow: 'shadow-amber-100', ring: 'ring-amber-100', icon: BookOpen, color: 'text-amber-500' },
  PROYECTO: { dot: 'bg-violet-500', gradient: 'from-violet-500 to-purple-600', shadow: 'shadow-violet-100', ring: 'ring-violet-100', icon: Layers, color: 'text-violet-500' },
  PRACTICA_LAB: { dot: 'bg-cyan-500', gradient: 'from-cyan-500 to-teal-500', shadow: 'shadow-cyan-100', ring: 'ring-cyan-100', icon: Beaker, color: 'text-cyan-500' },
  FORO: { dot: 'bg-sky-500', gradient: 'from-sky-500 to-blue-500', shadow: 'shadow-sky-100', ring: 'ring-sky-100', icon: MessageSquare, color: 'text-sky-500' },
  PARTICIPACION: { dot: 'bg-emerald-500', gradient: 'from-emerald-500 to-green-500', shadow: 'shadow-emerald-100', ring: 'ring-emerald-100', icon: User, color: 'text-emerald-500' },
  ASISTENCIA: { dot: 'bg-indigo-500', gradient: 'from-indigo-500 to-blue-600', shadow: 'shadow-indigo-100', ring: 'ring-indigo-100', icon: CheckSquare, color: 'text-indigo-500' },
}

// Keep legacy aliases
const TIPO_DOT = Object.fromEntries(Object.entries(TIPO_CONFIG).map(([k, v]) => [k, v.dot]))
const TIPO_LABEL = {
  EXAMEN: 'Examen', TAREA: 'Tarea', PROYECTO: 'Proyecto',
  PRACTICA_LAB: 'Práctica Lab', FORO: 'Foro',
  PARTICIPACION: 'Participación', ASISTENCIA: 'Asistencia',
}

const PLAZO_BADGE = {
  ABIERTA: { label: 'Abierta', className: 'bg-emerald-100 text-emerald-700' },
  EN_PLAZO: { label: 'En Plazo', className: 'bg-indigo-100 text-indigo-700' },
  CERRADA: { label: 'Cerrada', className: 'bg-slate-100 text-slate-500' },
}

function fmtFecha(iso) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('es-MX', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit'
  })
}

export default function MisGrupoDetalle() {
  const { user } = useAuth()
  const { inscripcionId } = useParams()
  const navigate = useNavigate()

  const [grupoInfo, setGrupoInfo] = useState(null)
  const [desglose, setDesglose] = useState(null)
  const [actividades, setActividades] = useState([])
  const [loading, setLoading] = useState(true)
  const [filtroTipo, setFiltroTipo] = useState('TODOS')
  const [activeTab, setActiveTab] = useState('actividades')

  // Modal de Detalle/Entrega
  const [modalAct, setModalAct] = useState({ open: false, data: null })
  const [fileToUpload, setFileToUpload] = useState(null)
  const [toast, setToast] = useState(null)
  const [uploading, setUploading] = useState(false)
  const [historial, setHistorial] = useState([])
  const [loadingHistorial, setLoadingHistorial] = useState(false)
  const fileInputRef = useRef(null)

  async function cargarDatos() {
    try {
      const [actsRes, desgRes, misGruposRes] = await Promise.all([
        api.porInscripcion(inscripcionId),
        resApi.desglose(inscripcionId).catch(() => ({ data: null })), // Handle pending smoothly
        inscApi.misGrupos()
      ])

      setActividades(actsRes.data || [])

      let desgData = desgRes.data
      if (desgData && desgData.unidades) {
        for (let u of desgData.unidades) {
          if (u.estado === 'EDICION') {
            try {
              const din = await resApi.dinamico(inscripcionId, u.unidad_id)
              u.resultado_unidad = din.data.resultado_final
              u.desglose_actividades = din.data.desglose || []
              u.bonus_unidad = din.data.bonus_aplicado
              u.es_simulacion = true
            } catch (e) { }
          }
        }
      }
      setDesglose(desgData)

      const gInfo = misGruposRes.data.find(g => g.inscripcion_id === inscripcionId)
      setGrupoInfo(gInfo)

    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (inscripcionId) cargarDatos()
  }, [inscripcionId])

  const handleFileChange = (e) => {
    if (e.target.files && e.target.files[0]) {
      setFileToUpload(e.target.files[0])
    }
  }

  const handleSubirArchivo = async (e) => {
    e.preventDefault()
    if (!fileToUpload) return

    setUploading(true)
    try {
      await entregasApi.subir(modalAct.data.actividad_id, fileToUpload)
      setToast({ message: '¡Actividad entregada correctamente!', type: 'success' })
      setFileToUpload(null)
      // Recargar datos y el historial de este modal
      cargarDatos()
      fetchHistorial(modalAct.data.actividad_id)
    } catch (err) {
      console.error(err)
      const msg = err.response?.data?.detail?.mensaje || 'Error al subir el archivo'
      setToast({ message: msg, type: 'error' })
    } finally {
      setUploading(false)
      setTimeout(() => setToast(null), 3000)
    }
  }

  const fetchHistorial = async (actId) => {
    try {
      setLoadingHistorial(true)
      const res = await entregasApi.misEntregas(actId)
      setHistorial(res.data || [])
    } catch (e) {
      console.error("Error al cargar historial")
    } finally {
      setLoadingHistorial(false)
    }
  }

  const handleOpenModal = (a) => {
    setModalAct({ open: true, data: a })
    setHistorial([])
    if (['TAREA', 'PROYECTO', 'PRACTICA_LAB'].includes(a.tipo_actividad)) {
      fetchHistorial(a.actividad_id)
    }
  }



  const tipos = ['TODOS', ...Object.keys(TIPO_LABEL)]
  const actsFiltradas = filtroTipo === 'TODOS'
    ? actividades
    : actividades.filter(a => a.tipo_actividad === filtroTipo)

  // Agrupar por unidad
  const porUnidad = actsFiltradas.reduce((acc, a) => {
    const key = a.unidad_nombre || `Unidad ${a.unidad_numero}`
    if (!acc[key]) acc[key] = []
    acc[key].push(a)
    return acc
  }, {})

  if (loading) return <Spinner />

  return (
    <div className="bg-slate-50/50 min-h-screen pb-20">
      <div className="bg-white border-b border-slate-200">
        <PageHeader
          title={grupoInfo?.materia || "Detalle del Grupo"}
          subtitle={grupoInfo ? `${grupoInfo.nombre} — Prof. ${grupoInfo.docente}` : ''}
          breadcrumb={['Mis Grupos', grupoInfo?.materia || 'Detalle']}
        />

        <div className="px-8 mt-4">
          <div className="flex gap-6 border-b border-slate-200">
            <button
              onClick={() => setActiveTab('actividades')}
              className={`pb-4 text-sm font-bold border-b-2 transition-colors ${activeTab === 'actividades' ? 'text-indigo-600 border-indigo-600' : 'text-slate-500 border-transparent hover:text-slate-800'}`}
            >
              Planeación de Actividades
            </button>
            <button
              onClick={() => setActiveTab('calificaciones')}
              className={`pb-4 text-sm font-bold border-b-2 transition-colors ${activeTab === 'calificaciones' ? 'text-indigo-600 border-indigo-600' : 'text-slate-500 border-transparent hover:text-slate-800'}`}
            >
              Mis Calificaciones
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-5xl mx-auto p-8 space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-700">

        {activeTab === 'actividades' && (
          <div>
            {/* Filtros y Lista */}
            <div className="space-y-4">
              <div className="flex items-center justify-end">
                <div className="w-full sm:w-72">
                  <Select
                    label="Filtrar por tipo"
                    value={filtroTipo}
                    onChange={e => setFiltroTipo(e.target.value)}
                  >
                    {tipos.map(t => (
                      <option key={t} value={t}>
                        {t === 'TODOS' ? 'Todas las actividades' : TIPO_LABEL[t]}
                      </option>
                    ))}
                  </Select>
                </div>
              </div>

              {Object.keys(porUnidad).length === 0 ? (
                <Card className="p-16 rounded-[2rem] text-center bg-white shadow-sm border-slate-100/50">
                  <div className="inline-flex p-5 bg-slate-50 rounded-full mb-4">
                    <Calendar className="text-slate-300" size={32} />
                  </div>
                  <p className="text-slate-500 font-medium max-w-xs mx-auto">No hay actividades programadas para este filtro en la materia seleccionada.</p>
                </Card>
              ) : (
                <div className="space-y-8">
                  {Object.entries(porUnidad).map(([unidad, acts]) => (
                    <div key={unidad} className="space-y-3">
                      <h3 className="text-sm font-black text-slate-500 uppercase tracking-widest pl-4">
                        {unidad}
                      </h3>
                      <div className="grid gap-3">
                        {acts.map((a, idx) => {
                          const cfg = TIPO_CONFIG[a.tipo_actividad] || { gradient: 'from-slate-400 to-slate-500', shadow: 'shadow-slate-100', ring: 'ring-slate-100', icon: '📄' }
                          const entregada = a.estado_entrega === 'ENTREGADA'
                          const hasGrade = a.calificacion !== null && a.calificacion !== undefined
                          const isPass = hasGrade && a.calificacion >= 70
                          return (
                            <div
                              key={a.actividad_id}
                              className="group relative bg-white rounded-2xl border border-slate-100 overflow-hidden transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg"
                            >
                              <div className={`absolute top-0 left-0 w-1.5 h-full bg-gradient-to-b ${cfg.gradient}`} />
                              <div className="pl-6 pr-5 py-5">
                                <div className="flex items-center justify-between mb-3">
                                  <div className="flex items-center gap-2.5">
                                    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-white text-[10px] font-black uppercase tracking-wider bg-gradient-to-r ${cfg.gradient} shadow-sm`}>
                                      {(() => {
                                        const Icon = cfg.icon || ClipboardList
                                        return <Icon size={12} className="text-white" />
                                      })()}
                                      {TIPO_LABEL[a.tipo_actividad] || a.tipo_actividad}
                                    </span>
                                    <span className="text-[11px] font-black text-slate-400 bg-slate-100 px-2 py-0.5 rounded-md">
                                      {a.ponderacion}%
                                    </span>
                                  </div>
                                  {hasGrade ? (
                                    <div className={`px-3 py-1 rounded-xl font-black tabular-nums text-sm shadow-sm ${isPass ? 'bg-emerald-50 text-emerald-600 ring-1 ring-emerald-200' : 'bg-rose-50 text-rose-500 ring-1 ring-rose-200'}`}>
                                      {a.calificacion.toFixed(2)}
                                    </div>
                                  ) : (
                                    <span className="text-[11px] text-slate-300 font-bold bg-slate-50 px-2.5 py-1 rounded-lg">—</span>
                                  )}
                                </div>
                                <h4 className="text-[15px] font-black text-slate-800 leading-snug tracking-tight group-hover:text-indigo-600 transition-colors line-clamp-2">
                                  {a.descripcion || (TIPO_LABEL[a.tipo_actividad] + ' ' + (idx + 1))}
                                </h4>
                                <div className="flex items-center gap-3 mt-4 pt-3.5 border-t border-slate-100">
                                  <Clock size={12} className="text-slate-300" />
                                  <span className="text-[11px] font-semibold text-slate-400 flex-1">
                                    {fmtFecha(a.fecha_cierre)}
                                  </span>
                                  <button
                                    onClick={() => handleOpenModal(a)}
                                    className={`inline-flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest px-3.5 py-1.5 rounded-xl transition-all ${entregada
                                      ? 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                                      : `bg-gradient-to-r ${cfg.gradient} text-white shadow-sm hover:shadow-md`
                                      }`}
                                  >
                                    {entregada ? 'Ver Entrega' : 'Entregar'}
                                    <ChevronRight size={12} />
                                  </button>
                                </div>
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Tab: Calificaciones */}
        {activeTab === 'calificaciones' && desglose && (
          <div className="space-y-4">
            {/* Unidades */}
            {desglose.unidades?.length > 0
              ? (() => {
                const sinNingunaNotaCapturada = desglose.unidades.every(u =>
                  (u.resultado_unidad === null || u.resultado_unidad === undefined) &&
                  (!u.desglose_actividades || u.desglose_actividades.every(a => a.calificacion === null || a.calificacion === undefined))
                )
                if (sinNingunaNotaCapturada) {
                  return (
                    <EmptyState
                      icon={BookOpen}
                      title="Sin calificaciones registradas"
                      description={`Las calificaciones aparecerán aquí conforme el docente las capture. La materia tiene ${desglose.unidades.length} unidad(es) por evaluar.`}
                    />
                  )
                }
                const sortedU = [...desglose.unidades].sort((a, b) => a.numero - b.numero)
                const firstEditIdx = sortedU.findIndex(u => u.estado === 'EDICION')
                const visU = firstEditIdx === -1 ? sortedU : sortedU.slice(0, firstEditIdx + 1)

                return visU.map(u => (
                  <div key={u.unidad_id} className="rounded-xl border border-slate-100 overflow-hidden bg-white shadow-sm">
                    <div className="flex items-center justify-between px-5 py-4 bg-slate-50/50 border-b border-slate-100">
                      <div className="flex items-center gap-3">
                        <span className="w-8 h-8 rounded-full bg-indigo-100 text-indigo-700 text-sm font-black flex items-center justify-center">
                          {u.numero}
                        </span>
                        <div>
                          <span className="text-sm font-bold text-slate-800">{u.nombre}</span>
                          <div className="mt-0.5"><Badge estado={u.estado} /></div>
                        </div>
                      </div>
                      <div className="text-right">
                        {u.bonus_unidad > 0 && (
                          <p className="text-[10px] text-emerald-600 font-bold uppercase mb-0.5">+{u.bonus_unidad} bonus final</p>
                        )}
                        {u.resultado_unidad !== null && u.resultado_unidad !== undefined && (u.resultado_unidad > 0 || u.desglose_actividades?.some(a => a.calificacion !== null && a.calificacion !== undefined)) ? (
                          <div className="flex flex-col items-end mt-1">
                            <p className="text-xs uppercase font-bold text-slate-400 leading-none mb-1">
                              {u.es_simulacion ? "Nota de unidad" :
                                u.desglose_actividades?.some(a => a.calificacion === null || a.calificacion === undefined)
                                  ? "Nota parcial"
                                  : "Nota de unidad"}
                            </p>
                            {u.es_simulacion ? (
                              <span className="inline-flex items-center gap-1 px-3 py-1 rounded-lg bg-slate-50 text-slate-500 text-xs font-bold border border-slate-100 shadow-inner mt-1">
                                <Clock size={14} className="text-slate-400" /> Pendiente
                              </span>
                            ) : (
                              <CalDisplay valor={u.resultado_unidad} size="sm" />
                            )}
                          </div>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-3 py-1 rounded-lg bg-slate-50 text-slate-500 text-xs font-bold border border-slate-100 shadow-inner">
                            <Clock size={14} className="text-slate-400" /> Pendiente
                          </span>
                        )}
                      </div>
                    </div>

                    {Array.isArray(u.desglose_actividades) && u.desglose_actividades.length > 0 && (
                      <div className="px-5 py-4">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          {u.desglose_actividades.map((a, i) => (
                            <div key={i} className="flex flex-col sm:flex-row sm:items-center justify-between p-3 rounded-xl min-w-0" style={{ backgroundColor: a.calificacion === null ? '#f8fafc' : '#ffffff', border: '1px solid #f1f5f9' }}>
                              <div className="flex-1 min-w-0 mb-2 sm:mb-0">
                                <p className="text-xs font-bold text-slate-700 truncate">{a.actividad || 'Actividad'}</p>
                                <p className="text-[10px] text-slate-400 font-semibold uppercase">{a.ponderacion}% • Contrib: {a.contribucion?.toFixed(1) ?? '--'}</p>
                              </div>
                              <div className="flex items-center sm:justify-end gap-2">
                                {a.estado_entrega === 'NP' ? (
                                  <span className="text-xs font-bold text-rose-500 bg-rose-50 px-2 py-0.5 rounded">NP</span>
                                ) : a.estado_entrega === 'EXENTO' ? (
                                  <span className="text-xs font-bold text-blue-500 bg-blue-50 px-2 py-0.5 rounded">Exento</span>
                                ) : a.calificacion !== null && a.calificacion !== undefined ? (
                                  <span className={`text-sm font-black ${a.calificacion >= 70 ? 'text-emerald-600' : 'text-rose-500'}`}>{parseFloat(a.calificacion).toFixed(1)}</span>
                                ) : (
                                  <span className="text-xs font-bold text-slate-300">--</span>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                ))
              })()
              : (
                <EmptyState icon={BookOpen} title="Sin calificaciones aún" />
              )
            }
          </div>
        )}

        {/* Modal de Detalle de Actividad */}
        <Modal
          open={modalAct.open}
          onClose={() => { setModalAct({ open: false, data: null }); setFileToUpload(null); }}
          title={TIPO_LABEL[modalAct.data?.tipo_actividad] || 'Detalle de Actividad'}
        >
          {modalAct.data && (
            <div className="space-y-6">
              <div className="space-y-2">
                <p className="text-xs font-black text-slate-500 uppercase tracking-widest px-1">Descripción / Instrucciones</p>
                <div className="bg-slate-50 p-4 rounded-2xl text-base text-slate-600 leading-relaxed border border-slate-100 min-h-[100px]">
                  {modalAct.data.descripcion || 'Sin instrucciones adicionales proporcionadas por el docente.'}
                </div>
              </div>

              <div className="pt-4 border-t border-slate-100 space-y-6">

                {/* Entrega Realizada & Historial */}
                {['TAREA', 'PROYECTO', 'PRACTICA_LAB'].includes(modalAct.data.tipo_actividad) && historial.length > 0 && (
                  <div className="space-y-3">
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-1">Archivos Entregados</p>
                    <div className="bg-white border border-slate-100 rounded-2xl overflow-hidden divide-y divide-slate-50">
                      {historial.map((h, i) => (
                        <div key={h.id} className="p-3 flex items-center justify-between group hover:bg-slate-50 transition-colors">
                          <div className="flex items-center gap-3 min-w-0">
                            <div className="w-8 h-8 rounded-lg bg-indigo-50 text-indigo-500 flex items-center justify-center flex-shrink-0">
                              <BookOpen size={16} />
                            </div>
                            <div className="min-w-0">
                              <p className="text-xs font-bold text-slate-700 truncate">{h.nombre_original}</p>
                              <p className="text-[10px] text-slate-400">Versión {h.version} · {new Date(h.ts_servidor).toLocaleString()}</p>
                            </div>
                          </div>
                          {i === 0 && (
                            <Badge className="bg-emerald-100 text-emerald-600 border-none text-[9px] font-black uppercase">Actual</Badge>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Estado de Calificación */}
                {modalAct.data.calificacion !== null && (
                  <div className="bg-emerald-50 p-4 rounded-2xl border border-emerald-100 flex items-center justify-between shadow-sm shadow-emerald-100/50">
                    <div className="flex items-center gap-3">
                      <div className="p-2 bg-emerald-100 rounded-lg text-emerald-600">
                        <CheckCircle2 size={20} />
                      </div>
                      <div>
                        <p className="text-sm font-black text-emerald-800 uppercase tracking-tight">Actividad Calificada</p>
                        <p className="text-xs text-emerald-600 font-bold">Tu docente ha registrado tu nota.</p>
                      </div>
                    </div>
                    <div className="text-center">
                      <p className="text-[10px] font-black text-emerald-400 uppercase mb-0.5">Resultado</p>
                      <p className="text-3xl font-black text-emerald-600 tracking-tighter leading-none">
                        {modalAct.data.calificacion?.toFixed(1)}
                      </p>
                    </div>
                  </div>
                )}

                {/* Lógica de Subida o Mensajes por Tipo */}
                {modalAct.data.estatus_plazo === 'CERRADA' ? (
                  <div className="bg-slate-100 p-4 rounded-2xl text-center border border-slate-200">
                    <Clock size={20} className="mx-auto text-slate-400 mb-1" />
                    <p className="text-sm font-bold text-slate-500">El plazo de entrega ha finalizado.</p>
                  </div>
                ) : ['TAREA', 'PROYECTO', 'PRACTICA_LAB'].includes(modalAct.data.tipo_actividad) ? (
                  <div className="space-y-4">
                    <div className="border-2 border-dashed border-slate-200 rounded-2xl p-6 bg-slate-50 relative transition-all hover:bg-slate-100 hover:border-indigo-300">
                      <input type="file" className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" onChange={handleFileChange} />
                      <div className="text-center">
                        <UploadCloud size={32} className="mx-auto text-slate-300 mb-2" />
                        {fileToUpload ? (
                          <p className="text-xs font-black text-indigo-600">{fileToUpload.name}</p>
                        ) : (
                          <p className="text-xs font-bold text-slate-400">
                            {modalAct.data.estado_entrega === 'ENTREGADA' ? '¿Quieres actualizar tu entrega? Arrastra o selecciona otro archivo' : 'Haz clic o arrastra un archivo para entregar'}
                          </p>
                        )}
                      </div>
                    </div>
                    <Btn
                      className="w-full py-4 font-black uppercase tracking-widest text-xs shadow-xl shadow-indigo-100"
                      disabled={!fileToUpload || uploading}
                      loading={uploading}
                      onClick={handleSubirArchivo}
                    >
                      {modalAct.data.estado_entrega === 'ENTREGADA' ? 'Actualizar Entrega' : 'Enviar Actividad'}
                    </Btn>
                  </div>
                ) : (
                  <div className="bg-indigo-50 p-5 rounded-2xl border border-indigo-100 flex gap-4">
                    <div className="p-2 bg-indigo-100 rounded-xl text-indigo-600 h-fit">
                      <Calendar size={20} />
                    </div>
                    <div>
                      <p className="text-sm font-black text-indigo-900 uppercase tracking-tight">Actividad de {TIPO_LABEL[modalAct.data.tipo_actividad]}</p>
                      <p className="text-xs text-indigo-700 leading-relaxed font-medium mt-1">
                        Esta actividad no requiere subir archivos. Tu docente registrará tu {modalAct.data.tipo_actividad.toLowerCase()} directamente en clase o en la plataforma.
                      </p>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </Modal>
      </div>
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
    </div>
  )
}
