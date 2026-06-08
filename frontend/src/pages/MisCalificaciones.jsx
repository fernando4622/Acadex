import { useState, useEffect } from 'react'
import { inscripciones as inscApi, periodos as periodosApi, alumnos as alumnosApi } from '../api/endpoints'
import { PageHeader } from '../components/layout/Layout'
import { Card, Badge, CalDisplay, Spinner, EmptyState, Btn } from '../components/ui'
import { BookOpen, GraduationCap, ChevronDown, ChevronUp, FileDown, LayoutGrid, List, CheckCircle2 } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { jsPDF } from 'jspdf'
import 'jspdf-autotable'

export default function MisCalificaciones() {
  const { user } = useAuth()
  const [grupos, setGrupos] = useState([])
  const [periodos, setPeriodos] = useState([])
  const [loading, setLoading] = useState(true)
  const [expandedPeriodos, setExpandedPeriodos] = useState({})
  const [tab, setTab] = useState('historial') // 'historial' | 'mapa'
  const [avance, setAvance] = useState(null)
  const [loadingAvance, setLoadingAvance] = useState(false)

  useEffect(() => {
    loadHistorial()
  }, [])

  const loadHistorial = async () => {
    setLoading(true)
    try {
      const [resPeriodos, resGrupos] = await Promise.all([
        periodosApi.listar(),
        inscApi.misGrupos()
      ])
      setPeriodos(resPeriodos.data)
      setGrupos(resGrupos.data)
      const activo = resPeriodos.data.find(p => p.estado === 'activo')
      if (activo) setExpandedPeriodos({ [activo.id]: true })
      else if (resPeriodos.data.length > 0) setExpandedPeriodos({ [resPeriodos.data[0].id]: true })
    } catch (err) { console.error(err) }
    finally { setLoading(false) }
  }

  const loadAvance = async () => {
    setLoadingAvance(true)
    try {
      const res = await alumnosApi.miAvance()
      setAvance(res.data)
    } catch (err) { console.error(err) }
    finally { setLoadingAvance(false) }
  }

  useEffect(() => {
    if (tab === 'mapa' && !avance) {
      loadAvance()
    }
  }, [tab])

  const togglePeriodo = (id) => {
    setExpandedPeriodos(prev => ({ ...prev, [id]: !prev[id] }))
  }

  const exportBoletaPDF = (periodoObj, gruposPeriodo) => {
    const doc = new jsPDF()

    // Header
    doc.setFontSize(20)
    doc.setTextColor(30, 58, 138) // Indigo-900
    doc.text('Boleta de Calificaciones', 14, 22)

    doc.setFontSize(11)
    doc.setTextColor(71, 85, 105) // Slate-600
    doc.text(`Estudiante: ${user.nombre} ${user.apellido_pat || ''}${user.apellido_mat ? ` ${user.apellido_mat}` : ''}`, 14, 32)
    doc.text(`Periodo: ${periodoObj.nombre} (${periodoObj.codigo})`, 14, 38)

    const promedioGral = (gruposPeriodo.reduce((acc, g) => acc + (g.resultado_final || 0), 0) / gruposPeriodo.filter(g => g.resultado_final !== null && g.resultado_final !== undefined).length) || 0
    doc.text(`Promedio del Periodo: ${promedioGral.toFixed(2)}`, 14, 44)

    // Table
    const tableData = gruposPeriodo.map((g, i) => [
      (i + 1).toString(),
      g.materia,
      g.docente,
      g.resultado_final !== null && g.resultado_final !== undefined ? g.resultado_final.toFixed(1) : '--',
      g.estado
    ])

    doc.autoTable({
      startY: 50,
      head: [['#', 'Materia', 'Docente', 'Calificación', 'Estado']],
      body: tableData,
      theme: 'grid',
      styles: { fontSize: 10, cellPadding: 3 },
      headStyles: { fillColor: [67, 56, 202], textColor: 255 }, // Indigo-700
      columnStyles: { 3: { halign: 'center' }, 4: { halign: 'center' } }
    })

    // Footer
    const finalY = doc.lastAutoTable.finalY || 50
    doc.setFontSize(9)
    doc.setTextColor(148, 163, 184) // Slate-400
    doc.text(`Reporte generado el ${new Date().toLocaleDateString()} a las ${new Date().toLocaleTimeString()} por Sistema de Calificaciones.`, 14, finalY + 15)

    doc.save(`Boleta_${periodoObj.codigo.replace(/\s+/g, '_')}.pdf`)
  }

  if (loading) return <Spinner />

  const gruposPorPeriodo = periodos.map(p => ({
    ...p,
    grupos: grupos.filter(g => g.periodo_id === p.id)
  })).filter(p => p.grupos.length > 0)


  return (
    <div className="bg-slate-50/50 min-h-screen pb-20">
      <div className="bg-white border-b border-slate-200">
        <PageHeader
          title="Mi Historial Académico"
          subtitle="Consulta tu progreso por cada materia inscrita"
        />
      </div>

      <div className="max-w-[1400px] mx-auto p-8 space-y-6">
        {/* Tabs */}
        <div className="flex bg-slate-100 p-1 rounded-2xl w-fit">
          <button
            onClick={() => setTab('historial')}
            className={`px-6 py-2.5 rounded-xl text-sm font-bold transition-all flex items-center gap-2 ${tab === 'historial' ? 'bg-white text-brand-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
          >
            <List size={18} /> Historial por Periodo
          </button>
          <button
            onClick={() => setTab('mapa')}
            className={`px-6 py-2.5 rounded-xl text-sm font-bold transition-all flex items-center gap-2 ${tab === 'mapa' ? 'bg-white text-brand-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
          >
            <LayoutGrid size={18} /> Avance Reticular
          </button>
        </div>

        {tab === 'historial' ? (
          gruposPorPeriodo.length === 0 ? (
            <EmptyState icon={GraduationCap} title="Sin registro histórico" description="No tienes materias cursadas o inscritas todavía." />
          ) : (
            <div className="space-y-6">
              {gruposPorPeriodo.map(periodo => (
                <div key={periodo.id} className="bg-white rounded-[2rem] border border-slate-100 shadow-sm overflow-hidden transition-all duration-300">
                  <div
                    className="px-6 py-5 flex items-center justify-between cursor-pointer hover:bg-slate-50 transition-colors"
                    onClick={() => togglePeriodo(periodo.id)}
                  >
                    <div className="flex items-center gap-4">
                      <div className="w-10 h-10 rounded-2xl bg-indigo-50 flex items-center justify-center shrink-0">
                        <GraduationCap size={20} className="text-indigo-600" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <h2 className="text-lg font-bold text-slate-800">{periodo.nombre} <span className="text-slate-400 font-medium text-sm ml-1">({periodo.codigo})</span></h2>
                          {periodo.activo && <span className="px-2 py-0.5 rounded-md text-[10px] font-black uppercase text-emerald-600 bg-emerald-50 tracking-widest border border-emerald-100">Actual</span>}
                        </div>
                        <p className="text-xs font-semibold text-slate-400 mt-1">{periodo.grupos.length} materias inscritas</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-4">
                      {(() => {
                        const gruposConPromedio = periodo.grupos.filter(g => g.estado === 'CERRADA' || g.estado === 'FINALIZADO' || (g.resultado_final !== null && g.resultado_final > 0))
                        const todosActivos = periodo.grupos.every(g => g.estado !== 'CERRADA' && g.estado !== 'FINALIZADO' && (!g.resultado_final || g.resultado_final === 0))

                        if (todosActivos) {
                          return (
                            <div className="hidden sm:block text-right pr-4 border-r border-slate-200">
                              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-0.5">Promedio</p>
                              <span className="text-sm font-bold text-slate-400">Pendiente</span>
                            </div>
                          )
                        }

                        const promedioGral = (gruposConPromedio.reduce((acc, g) => acc + (g.resultado_final || 0), 0) / gruposConPromedio.length) || 0
                        return (
                          <div className="hidden sm:block text-right pr-4 border-r border-slate-200">
                            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-0.5">Promedio</p>
                            <span className="text-xl font-black text-slate-800 tabular-nums">
                              {gruposConPromedio.length > 0 ? promedioGral.toFixed(1) : '--'}
                            </span>
                          </div>
                        )
                      })()}
                      <div className="p-2 text-slate-400">
                        {expandedPeriodos[periodo.id] ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
                      </div>
                    </div>
                  </div>

                  {expandedPeriodos[periodo.id] && (
                    <div className="border-t border-slate-100 p-6 bg-slate-50/50">
                      <div className="flex justify-end mb-4">
                        <Btn variant="secondary" size="sm" onClick={() => exportBoletaPDF(periodo, periodo.grupos)}>
                          <FileDown size={16} /> Descargar Boleta
                        </Btn>
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {periodo.grupos.map(g => {
                          const isPendiente = g.estado !== 'CERRADA' && g.estado !== 'FINALIZADO' && (!g.resultado_final || g.resultado_final === 0)

                          return (
                            <div key={g.inscripcion_id} className="bg-white rounded-2xl p-5 border border-slate-100 shadow-sm hover:border-indigo-100 hover:shadow-md transition-all">
                              <div className="flex items-start justify-between mb-4">
                                <div>
                                  <h3 className="font-bold text-slate-800 leading-tight pr-4">{g.materia}</h3>
                                  <p className="text-xs font-medium text-slate-400 mt-1 uppercase">{g.nombre}</p>
                                </div>
                                <Badge estado={g.estado} />
                              </div>

                              <div className="flex items-center justify-between mt-auto">
                                <div>
                                  <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mb-0.5">Resultado</p>
                                  {isPendiente ? (
                                    <div className="flex items-baseline gap-1.5 mt-1">
                                      <span className="text-lg font-bold text-slate-400">Pendiente</span>
                                    </div>
                                  ) : g.resultado_final !== null && g.resultado_final !== undefined ? (
                                    <div className="flex items-baseline gap-1.5">
                                      <span className={`text-3xl font-black tabular-nums tracking-tighter ${g.resultado_final >= 70 ? 'text-emerald-500' : 'text-rose-500'}`}>{g.resultado_final.toFixed(1)}</span>
                                      <span className="text-sm font-bold text-slate-300">/ {g.calificacion_maxima}</span>
                                    </div>
                                  ) : (
                                    <div className="flex items-baseline gap-1.5">
                                      <span className="text-2xl font-black text-slate-300">--</span>
                                    </div>
                                  )}
                                </div>
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )
        ) : (
          /* Vista de Mapa Reticular */
          <div className="space-y-6">
            {loadingAvance ? (
              <Spinner />
            ) : !avance || !avance.plan_id ? (
              <EmptyState
                icon={BookOpen}
                title="Sin Plan de Estudios"
                description="No tienes un plan de estudios asignado. Contacta a administración."
              />
            ) : (
              <div className="space-y-8">
                {/* Header Mapa */}
                <div className="bg-gradient-to-r from-brand-600 to-indigo-700 rounded-[2.5rem] p-8 text-white shadow-xl shadow-indigo-100 relative overflow-hidden">
                  <div className="absolute top-0 right-0 w-64 h-64 bg-white/10 rounded-full -translate-y-32 translate-x-32 blur-3xl" />
                  <div className="relative">
                    <p className="text-indigo-100 text-lg font-black uppercase tracking-[0.2em] mb-2">Plan de Estudios</p>
                    <h2 className="text-3xl font-black">{avance.plan_nombre}</h2>
                    <div className="flex gap-6 mt-6">
                      <div className="bg-white/10 backdrop-blur-md rounded-2xl px-5 py-3 border border-white/10">
                        <p className="text-[10px] font-bold text-indigo-100 uppercase tracking-widest mb-1">Materias Totales</p>
                        <p className="text-xl font-black">{avance.materias.length}</p>
                      </div>
                      <div className="bg-white/10 backdrop-blur-md rounded-2xl px-5 py-3 border border-white/10">
                        <p className="text-[10px] font-bold text-indigo-100 uppercase tracking-widest mb-1">Aprobadas</p>
                        <p className="text-2xl font-black text-white">
                          {avance.materias.filter(m => m.estado_academico === 'APROBADA').length}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Grid del Mapa */}
                <div className="overflow-x-auto pb-8 custom-scrollbar">
                  <div className="flex gap-4 min-w-max">
                    {Array.from({ length: Math.max(...avance.materias.map(m => m.semestre), 0) }).map((_, i) => {
                      const sem = i + 1
                      const materiasSem = avance.materias.filter(m => m.semestre === sem).sort((a, b) => a.orden - b.orden)

                      return (
                        <div key={sem} className="w-52 flex-shrink-0 space-y-4">
                          <div className="text-center py-3 bg-white rounded-2xl border border-slate-100 shadow-sm">
                            <p className="text-xs font-black text-slate-800 uppercase tracking-widest">Semestre {sem}</p>
                          </div>

                          <div className="space-y-3">
                            {materiasSem.map(m => {
                              const isAprobada = m.estado_academico === 'APROBADA'
                              const isReprobada = m.estado_academico === 'REPROBADA'
                              const isCursando = m.estado_academico === 'CURSANDO'
                              const isNoCursada = m.estado_academico === 'NO_CURSADA'

                              // Colores dinámicos premium
                              let colorClass = "bg-white text-slate-600 border-slate-100"
                              let badgeClass = "bg-slate-50 text-slate-400"

                              if (isAprobada) {
                                colorClass = "bg-emerald-500 text-white border-emerald-400 shadow-lg shadow-emerald-100"
                                badgeClass = "bg-white/20 text-white"
                              } else if (isReprobada) {
                                colorClass = "bg-rose-500 text-white border-rose-400 shadow-lg shadow-rose-100"
                                badgeClass = "bg-white/20 text-white"
                              } else if (isCursando) {
                                colorClass = "bg-blue-600 text-white border-indigo-400 shadow-lg shadow-indigo-100 animate-pulse-subtle"
                                badgeClass = "bg-white/20 text-white"
                              } else if (isNoCursada) {
                                colorClass = "bg-slate-50 text-slate-500 border-slate-100"
                                badgeClass = "bg-slate-200/50 text-slate-500"
                              }

                              return (
                                <div
                                  key={m.id}
                                  className={`p-4 rounded-2xl border transition-all h-[140px] flex flex-col justify-between group relative overflow-hidden ${colorClass}`}
                                >
                                  {/* Background accent */}
                                  {isAprobada && <div className="absolute top-0 right-0 p-2 text-white/30"><CheckCircle2 size={40} strokeWidth={3} /></div>}

                                  <div className="relative">
                                    <p className={`text-[10px] font-black uppercase tracking-wider mb-1 opacity-80`}>{m.clave}</p>
                                    <h4 className="text-[11px] font-extrabold leading-tight uppercase line-clamp-3">
                                      {m.materia_nombre}
                                    </h4>
                                  </div>

                                  <div className="relative flex items-end justify-between mt-2">
                                    <div className={`px-2 py-0.5 rounded-md text-[9px] font-black uppercase tracking-tighter ${badgeClass}`}>
                                      {m.creditos} CR
                                    </div>
                                    <div className="text-right">
                                      <p className="text-[9px] font-bold uppercase opacity-70">
                                        {isAprobada ? 'Aprobada' : isReprobada ? 'Reprobada' : isCursando ? 'Cursando' : ''}
                                      </p>
                                      <p className="text-lg font-black tabular-nums leading-none">
                                        {isNoCursada ? '' : (m.calificacion !== null ? m.calificacion.toFixed(2) : '--')}
                                      </p>
                                    </div>
                                  </div>
                                </div>
                              )
                            })}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
