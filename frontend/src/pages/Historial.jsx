import { useState, useEffect } from 'react'
import { PageHeader } from '../components/layout/Layout'
import { Spinner, EmptyState } from '../components/ui'
import { FileText, ChevronDown, ChevronUp, BookOpen } from 'lucide-react'
import { inscripciones, resultados, periodos as periodosApi } from '../api/endpoints'

export default function Historial() {
  const [grupos, setGrupos] = useState([])
  const [loading, setLoading] = useState(true)
  const [periodos, setPeriodos] = useState([])
  const [expanded, setExpanded] = useState(null)
  const [desglose, setDesglose] = useState(null)

  useEffect(() => {
    Promise.all([
      periodosApi.listar(),
      inscripciones.misGrupos()
    ]).then(([resP, resG]) => {
      setPeriodos(resP.data)
      setGrupos(resG.data)
    }).catch(() => { })
      .finally(() => setLoading(false))
  }, [])

  const toggleExpand = async (inscId) => {
    if (expanded === inscId) { setExpanded(null); setDesglose(null); return }
    setExpanded(inscId); setDesglose(null)
    try { const r = await resultados.desglose(inscId); setDesglose(r.data) } catch (e) { setDesglose({ error: true }) }
  }

  if (loading) return <Spinner />

  // Agrupar por periodo
  const gruposPorPeriodo = periodos.map(p => ({
    ...p,
    grupos: grupos.filter(g => g.periodo_id === p.id)
  })).filter(p => p.grupos.length > 0)

  const todosConCalifGeneral = grupos.length > 0 && grupos.every(g => g.resultado_final > 0)
  const promedioGeneral = todosConCalifGeneral
    ? grupos.reduce((acc, g) => acc + g.resultado_final, 0) / grupos.length
    : null

  return (
    <div>
      <PageHeader title="Kárdex" subtitle="Resultados por periodo" icon={FileText} />

      <div className="px-8 py-6 space-y-6">
        {gruposPorPeriodo.length === 0 ? (
          <EmptyState icon={FileText} title="Sin historial" description="No tienes materias cursadas registradas." />
        ) : (
          <>
            {/* Promedio General en el Body */}
            <div className="flex items-center justify-between bg-indigo-50 border border-indigo-100 rounded-2xl px-6 py-5 shadow-sm">
              <div>
                <p className="text-xs font-black text-indigo-400 uppercase tracking-widest mb-1">Promedio General</p>
                <p className="text-sm text-indigo-500 font-medium">
                  {todosConCalifGeneral ? 'Todas las materias calificadas' : 'Pendiente de cierre completo'}
                </p>
              </div>
              {promedioGeneral !== null ? (
                <span className={`text-4xl font-black tabular-nums tracking-tighter ${promedioGeneral >= 70 ? 'text-emerald-600' : 'text-rose-500'}`}>
                  {promedioGeneral.toFixed(1)}
                </span>
              ) : (
                <span className="text-2xl font-bold text-slate-400">Pendiente</span>
              )}
            </div>

            {gruposPorPeriodo.map((periodo) => (
              <div key={periodo.id} className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
                <div className="px-6 py-4 bg-slate-50/80 border-b border-slate-100 flex justify-between items-center">
                  <h3 className="font-bold text-slate-800">{periodo.nombre} <span className="text-slate-400 font-medium text-xs ml-1">({periodo.codigo})</span></h3>
                  {periodo.activo && <span className="text-[10px] font-black text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded uppercase tracking-wider">Actual</span>}
                </div>
                <div className="divide-y divide-slate-50">
                  {periodo.grupos.map(g => (
                    <div key={g.inscripcion_id || g.id}>
                      <button onClick={() => toggleExpand(g.inscripcion_id)} className="w-full flex items-center justify-between px-6 py-4 hover:bg-slate-50/50 transition">
                        <div className="flex items-center gap-3">
                          <BookOpen size={18} className="text-brand-400" />
                          <div className="text-left">
                            <p className="font-semibold text-slate-800">{g.materia || g.nombre}</p>
                            <p className="text-xs text-slate-400">{g.nombre_grupo || g.grupo_nombre}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-4">
                          <span className={`text-lg font-black ${(g.resultado_final || 0) >= 70 ? 'text-emerald-600' : (g.resultado_final || 0) > 0 ? 'text-rose-500' : 'text-slate-300'}`}>
                            {g.resultado_final > 0 ? g.resultado_final.toFixed(1) : '—'}
                          </span>
                          {expanded === g.inscripcion_id ? <ChevronUp size={18} className="text-slate-400" /> : <ChevronDown size={18} className="text-slate-400" />}
                        </div>
                      </button>
                      {expanded === g.inscripcion_id && desglose && !desglose.error && (
                        <div className="px-6 pb-4">
                          <div className="bg-slate-50 rounded-xl p-4 space-y-2">
                            {desglose.unidades?.map((u, i) => (
                              <div key={i} className="flex items-center justify-between text-sm">
                                <span className="text-slate-600">Unidad {u.numero}: {u.nombre}</span>
                                <span className="font-semibold text-slate-800">
                                  {u.resultado_final != null ? u.resultado_final.toFixed(1) : (u.resultado_unidad != null ? u.resultado_unidad.toFixed(1) : '—')}
                                </span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>

                {/* Promedio del Periodo */}
                {(() => {
                  const todosConCalif = periodo.grupos.every(g => g.resultado_final > 0)
                  const promPeriodo = todosConCalif
                    ? periodo.grupos.reduce((acc, g) => acc + g.resultado_final, 0) / periodo.grupos.length
                    : null

                  return (
                    <div className="px-6 py-4 border-t border-slate-100 bg-slate-50/40 flex items-center justify-between">
                      <span className="text-xs font-bold text-slate-400 uppercase tracking-widest">Promedio del Periodo</span>
                      {promPeriodo !== null ? (
                        <span className={`text-xl font-black tabular-nums ${promPeriodo >= 70 ? 'text-emerald-600' : 'text-rose-500'}`}>
                          {promPeriodo.toFixed(1)}
                        </span>
                      ) : (
                        <span className="text-sm font-bold text-slate-400">Pendiente</span>
                      )}
                    </div>
                  )
                })()}
              </div>
            ))}
          </>
        )}
      </div>
    </div>
  )
}
