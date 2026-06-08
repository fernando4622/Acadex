import { useState, useEffect } from 'react'
import { useParams } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { misActividades as api, inscripciones as inscApi, resultados as resApi } from '../api/endpoints'
import { PageHeader } from '../components/layout/Layout'
import { Card, Spinner, Badge, CalDisplay, EmptyState, Modal, Select } from '../components/ui'
import { Calendar, Clock, BookOpen, FileText, Layers, Beaker, MessageSquare, User, CheckSquare, ClipboardList, ChevronRight } from 'lucide-react'

const TIPO_CONFIG = {
  EXAMEN: { gradient: 'from-rose-500 to-pink-600', shadow: 'shadow-rose-100', ring: 'ring-rose-100', icon: FileText, color: 'text-rose-500' },
  TAREA: { gradient: 'from-amber-500 to-orange-500', shadow: 'shadow-amber-100', ring: 'ring-amber-100', icon: BookOpen, color: 'text-amber-500' },
  PROYECTO: { gradient: 'from-violet-500 to-purple-600', shadow: 'shadow-violet-100', ring: 'ring-violet-100', icon: Layers, color: 'text-violet-500' },
  PRACTICA_LAB: { gradient: 'from-cyan-500 to-teal-500', shadow: 'shadow-cyan-100', ring: 'ring-cyan-100', icon: Beaker, color: 'text-cyan-500' },
  FORO: { gradient: 'from-sky-500 to-blue-500', shadow: 'shadow-sky-100', ring: 'ring-sky-100', icon: MessageSquare, color: 'text-sky-500' },
  PARTICIPACION: { gradient: 'from-emerald-500 to-green-500', shadow: 'shadow-emerald-100', ring: 'ring-emerald-100', icon: User, color: 'text-emerald-500' },
  ASISTENCIA: { gradient: 'from-indigo-500 to-blue-600', shadow: 'shadow-indigo-100', ring: 'ring-indigo-100', icon: CheckSquare, color: 'text-indigo-500' },
}

const DEFAULT_CFG = { gradient: 'from-slate-400 to-slate-500', shadow: 'shadow-slate-100', ring: 'ring-slate-100', icon: ClipboardList, color: 'text-slate-500' }

const TIPO_LABEL = {
  EXAMEN: 'Examen', TAREA: 'Tarea', PROYECTO: 'Proyecto',
  PRACTICA_LAB: 'Práctica Lab', FORO: 'Foro',
  PARTICIPACION: 'Participación', ASISTENCIA: 'Asistencia',
}

export default function MisGrupoDetalle() {
  const { user } = useAuth()
  const { inscripcionId } = useParams()

  const [grupoInfo, setGrupoInfo] = useState(null)
  const [desglose, setDesglose] = useState(null)
  const [actividades, setActividades] = useState([])
  const [loading, setLoading] = useState(true)
  const [filtroTipo, setFiltroTipo] = useState('TODOS')
  const [activeTab, setActiveTab] = useState('actividades')
  const [modalAct, setModalAct] = useState({ open: false, data: null })

  async function cargarDatos() {
    try {
      const [actsRes, desgRes, misGruposRes] = await Promise.all([
        api.porInscripcion(inscripcionId),
        resApi.desglose(inscripcionId).catch(() => ({ data: null })),
        inscApi.misGrupos()
      ])

      setActividades(actsRes.data || [])

      let desgData = desgRes.data
      if (desgData?.unidades) {
        for (let u of desgData.unidades) {
          if (u.estado === 'EDICION') {
            try {
              const din = await resApi.dinamico(inscripcionId, u.unidad_id)
              u.resultado_unidad = din.data.resultado_final
              u.desglose_actividades = din.data.desglose || []
              u.bonus_unidad = din.data.bonus_aplicado
              u.es_simulacion = true
            } catch (e) { /* aún sin calificaciones */ }
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

  const tipos = ['TODOS', ...Object.keys(TIPO_LABEL)]
  const actsFiltradas = filtroTipo === 'TODOS'
    ? actividades
    : actividades.filter(a => a.tipo_actividad === filtroTipo)

  // Agrupar por unidad (mostrando número + nombre)
  const porUnidad = actsFiltradas.reduce((acc, a) => {
    const label = a.unidad_numero
      ? `Unidad ${a.unidad_numero}${a.unidad_nombre ? ` — ${a.unidad_nombre}` : ''}`
      : (a.unidad_nombre || 'Sin unidad')
    if (!acc[label]) acc[label] = { acts: [], numero: a.unidad_numero ?? 999 }
    acc[label].acts.push(a)
    return acc
  }, {})

  // Ordenar entradas por número de unidad
  const unidadesOrdenadas = Object.entries(porUnidad).sort(([, a], [, b]) => a.numero - b.numero)

  if (loading) return <Spinner />

  return (
    <div className="bg-slate-50/50 min-h-screen pb-20">
      {/* Header */}
      <div className="bg-white border-b border-slate-200">
        <PageHeader
          title={grupoInfo?.materia || 'Detalle del Grupo'}
          subtitle={grupoInfo ? `${grupoInfo.nombre} — Prof. ${grupoInfo.docente}` : ''}
          breadcrumb={['Mis Grupos', grupoInfo?.materia || 'Detalle']}
        />

        <div className="px-8 mt-4">
          <div className="flex gap-6 border-b border-slate-200">
            {[
              { key: 'actividades', label: 'Planeación de Actividades' },
              { key: 'calificaciones', label: 'Calificaciones' },
            ].map(tab => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`pb-4 text-[15px] font-black border-b-[3px] transition-colors ${activeTab === tab.key
                  ? 'text-brand-600 border-brand-600'
                  : 'text-slate-400 border-transparent hover:text-slate-700'
                  }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="max-w-5xl mx-auto p-8 space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-700">

        {activeTab === 'actividades' && (
          <div className="space-y-4">
            {/* Filtro por tipo */}
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

            {unidadesOrdenadas.length === 0 ? (
              <Card className="p-16 rounded-[2rem] text-center bg-white shadow-sm border-slate-100/50">
                <div className="inline-flex p-5 bg-slate-50 rounded-full mb-4">
                  <Calendar className="text-slate-300" size={32} />
                </div>
                <p className="text-slate-500 font-medium max-w-xs mx-auto">
                  No hay actividades programadas para este filtro.
                </p>
              </Card>
            ) : (
              <div className="space-y-8">
                {unidadesOrdenadas.map(([label, { acts }]) => (
                  <div key={label} className="space-y-3">
                    {/* Encabezado de unidad con su número */}
                    <h3 className="text-[13px] font-black text-brand-600 uppercase tracking-widest pl-4">
                      {label}
                    </h3>

                    <div className="grid gap-3">
                      {acts.map((a, idx) => {
                        const cfg = TIPO_CONFIG[a.tipo_actividad] ?? DEFAULT_CFG
                        const Icon = cfg.icon
                        const hasGrade = a.calificacion !== null && a.calificacion !== undefined
                        const isPass = hasGrade && a.calificacion >= 70

                        return (
                          <div
                            key={a.actividad_id}
                            className="group relative bg-white rounded-2xl border border-slate-100 overflow-hidden transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg"
                          >
                            {/* Borde izquierdo de color oscuro */}
                            <div className="absolute top-0 left-0 w-1.5 h-full bg-brand-800" />

                            <div className="pl-6 pr-5 py-5">
                              <div className="flex items-center justify-between mb-3">
                                {/* Badge tipo + ponderación */}
                                <div className="flex items-center gap-2.5">
                                  <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-white text-[11px] font-black uppercase tracking-wider bg-brand-800 shadow-sm">
                                    <Icon size={14} className="text-white" />
                                    {TIPO_LABEL[String(a.tipo_actividad || '').toUpperCase()] || a.tipo_actividad}
                                  </span>
                                  <span className="text-xs font-black text-slate-500 bg-slate-100 px-2.5 py-1 rounded-md">
                                    {a.ponderacion}%
                                  </span>
                                </div>

                                {/* Calificación */}
                                {hasGrade ? (
                                  <div className={`px-4 py-1.5 rounded-xl font-black tabular-nums text-[15px] shadow-sm ${isPass
                                    ? 'bg-emerald-50 text-emerald-600 ring-1 ring-emerald-200'
                                    : 'bg-rose-50 text-rose-500 ring-1 ring-rose-200'
                                    }`}>
                                    {a.calificacion.toFixed(2)}
                                  </div>
                                ) : (
                                  <span className="text-xs text-slate-300 font-bold bg-slate-50 px-3 py-1.5 rounded-lg">—</span>
                                )}
                              </div>

                              {/* Descripción */}
                              <h4 className="text-[17px] font-black text-slate-800 leading-snug tracking-tight group-hover:text-brand-600 transition-colors line-clamp-2">
                                {a.descripcion || `${TIPO_LABEL[String(a.tipo_actividad || '').toUpperCase()] || 'Actividad'} ${idx + 1}`}
                              </h4>

                              {/* Footer de la tarjeta */}
                              <div className="flex items-center gap-3 mt-4 pt-3.5 border-t border-slate-100">
                                <span className="text-xs font-semibold text-slate-500 flex-1">
                                  Unidad {a.unidad_numero ?? '—'} · {a.unidad_nombre ?? ''}
                                </span>
                                <button
                                  onClick={() => setModalAct({ open: true, data: a })}
                                  className="inline-flex items-center gap-1.5 text-[11px] font-black uppercase tracking-widest px-4 py-2 rounded-xl transition-all bg-brand-600 hover:bg-brand-700 text-white shadow-sm hover:shadow-md"
                                >
                                  Ver Detalle
                                  <ChevronRight size={14} />
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
        )}

        {activeTab === 'calificaciones' && desglose && (
          <div className="space-y-4">
            {desglose.unidades?.length > 0
              ? (() => {
                const sinNota = desglose.unidades.every(u =>
                  (u.resultado_unidad === null || u.resultado_unidad === undefined) &&
                  (!u.desglose_actividades || u.desglose_actividades.every(a => a.calificacion === null || a.calificacion === undefined))
                )
                if (sinNota) {
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
                    {/* Header de unidad */}
                    <div className="flex items-center justify-between px-5 py-4 bg-slate-50/50 border-b border-slate-100">
                      <div className="flex items-center gap-3">
                        <span className="w-8 h-8 rounded-full bg-brand-50 text-brand-600 text-[15px] font-black flex items-center justify-center">
                          {u.numero}
                        </span>
                        <div>
                          <span className="text-[15px] font-bold text-slate-800">{u.nombre}</span>
                          <div className="mt-0.5"><Badge estado={u.estado} /></div>
                        </div>
                      </div>

                      <div className="text-right">
                        {u.bonus_unidad > 0 && (
                          <p className="text-xs text-emerald-600 font-bold uppercase mb-0.5">
                            +{u.bonus_unidad} bonus final
                          </p>
                        )}
                        {u.resultado_unidad !== null && u.resultado_unidad !== undefined &&
                          (u.resultado_unidad > 0 || (Array.isArray(u.desglose_actividades) && u.desglose_actividades.some(a => a.calificacion !== null && a.calificacion !== undefined)))
                          ? (
                            <div className="flex flex-col items-end mt-1">
                              <p className="text-[13px] uppercase font-bold text-slate-400 leading-none mb-1">
                                {u.es_simulacion
                                  ? 'Nota de unidad'
                                  : (Array.isArray(u.desglose_actividades) && u.desglose_actividades.some(a => a.calificacion === null || a.calificacion === undefined))
                                    ? 'Nota parcial'
                                    : 'Nota de unidad'}
                              </p>
                              {u.es_simulacion ? (
                                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-slate-50 text-slate-500 text-[13px] font-bold border border-slate-100 shadow-inner mt-1">
                                  <Clock size={16} className="text-slate-400" /> Pendiente
                                </span>
                              ) : (
                                <CalDisplay valor={u.resultado_unidad} size="sm" />
                              )}
                            </div>
                          ) : (
                            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-slate-50 text-slate-500 text-[13px] font-bold border border-slate-100 shadow-inner">
                              <Clock size={16} className="text-slate-400" /> Pendiente
                            </span>
                          )
                        }
                      </div>
                    </div>

                    {/* Desglose de actividades */}
                    {Array.isArray(u.desglose_actividades) && u.desglose_actividades.length > 0 && (
                      <div className="px-5 py-4">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          {u.desglose_actividades.map((a, i) => (
                            <div
                              key={i}
                              className="flex flex-col sm:flex-row sm:items-center justify-between p-3 rounded-xl min-w-0"
                              style={{ backgroundColor: a.calificacion === null ? '#f8fafc' : '#ffffff', border: '1px solid #f1f5f9' }}
                            >
                              <div className="flex-1 min-w-0 mb-2 sm:mb-0">
                                <p className="text-[13px] font-bold text-slate-700 truncate">{a.actividad || 'Actividad'}</p>
                                <p className="text-xs text-slate-400 font-semibold uppercase">
                                  {a.ponderacion}% · Contrib: {a.contribucion?.toFixed(1) ?? '--'}
                                </p>
                              </div>
                              <div className="flex items-center sm:justify-end gap-2">
                                {a.estado_entrega === 'NP' ? (
                                  <span className="text-[13px] font-bold text-rose-500 bg-rose-50 px-2.5 py-0.5 rounded">NP</span>
                                ) : a.estado_entrega === 'EXENTO' ? (
                                  <span className="text-[13px] font-bold text-blue-500 bg-blue-50 px-2.5 py-0.5 rounded">Exento</span>
                                ) : a.calificacion !== null && a.calificacion !== undefined ? (
                                  <span className={`text-[15px] font-black ${a.calificacion >= 70 ? 'text-emerald-600' : 'text-rose-500'}`}>
                                    {parseFloat(a.calificacion).toFixed(1)}
                                  </span>
                                ) : (
                                  <span className="text-[13px] font-bold text-slate-300">--</span>
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
              : <EmptyState icon={BookOpen} title="Sin calificaciones aún" />
            }
          </div>
        )}

        <Modal
          open={modalAct.open}
          onClose={() => setModalAct({ open: false, data: null })}
          title={TIPO_LABEL[modalAct.data?.tipo_actividad] || 'Detalle de Actividad'}
        >
          {modalAct.data && (
            <div className="space-y-6">
              {/* Descripción */}
              <div className="space-y-2">
                <p className="text-[13px] font-black text-brand-600 uppercase tracking-widest px-1">
                  Descripción / Instrucciones
                </p>
                <div className="bg-slate-50 p-4 rounded-2xl text-[15px] text-slate-600 leading-relaxed border border-slate-100 min-h-[100px]">
                  {modalAct.data.descripcion || 'Sin instrucciones adicionales proporcionadas por el docente.'}
                </div>
              </div>

              <div className="pt-4 border-t border-slate-100 space-y-4">
                {/* Unidad */}
                <div className="flex items-center gap-3 text-[15px] text-slate-600">
                  <BookOpen size={18} className="text-slate-400 shrink-0" />
                  <span className="font-semibold">
                    Unidad {modalAct.data.unidad_numero ?? '—'}
                    {modalAct.data.unidad_nombre ? ` — ${modalAct.data.unidad_nombre}` : ''}
                  </span>
                </div>

                {/* Info del tipo de actividad */}
                <div className="bg-indigo-50 p-5 rounded-2xl border border-indigo-100 flex gap-4">
                  <div className="p-2 bg-indigo-100 rounded-xl text-indigo-600 h-fit">
                    <Calendar size={20} />
                  </div>
                  <div>
                    <p className="text-sm font-black text-indigo-900 uppercase tracking-tight">
                      Actividad de {TIPO_LABEL[modalAct.data.tipo_actividad] || modalAct.data.tipo_actividad}
                    </p>
                    <p className="text-xs text-indigo-700 leading-relaxed font-medium mt-1">
                      Tu docente registrará tu calificación directamente en la plataforma.
                    </p>
                  </div>
                </div>
                {/* Calificación obtenida */}
                {modalAct.data.calificacion !== null && modalAct.data.calificacion !== undefined && (
                  <div className="bg-emerald-50 p-4 rounded-2xl border border-emerald-100 flex items-center justify-between shadow-sm shadow-emerald-100/50">
                    <div className="flex items-center gap-3">
                      <div className="p-2 bg-emerald-100 rounded-lg text-emerald-600">
                        <BookOpen size={20} />
                      </div>
                      <div>
                        <p className="text-[15px] font-black text-emerald-800 uppercase tracking-tight">Actividad Calificada</p>
                        <p className="text-[13px] text-emerald-600 font-bold">Tu docente ha registrado tu nota.</p>
                      </div>
                    </div>
                    <div className="text-center">
                      <p className="text-[11px] font-black text-emerald-500 uppercase mb-0.5">Resultado</p>
                      <p className="text-[32px] font-black text-emerald-600 tracking-tighter leading-none">
                        {modalAct.data.calificacion?.toFixed(1)}
                      </p>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </Modal>
      </div>
    </div>
  )
}
