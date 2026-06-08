import { useState, useEffect } from 'react'
import { PageHeader } from '../components/layout/Layout'
import { Spinner, EmptyState, StatCard } from '../components/ui'
import { FileText, BookOpen, Users, TrendingUp, CheckCircle, ChevronDown, ChevronUp, BarChart2 } from 'lucide-react'
import { docentes as docentesApi } from '../api/endpoints'

export default function HistorialDocente() {
  const [grupos, setGrupos] = useState([])
  const [loading, setLoading] = useState(true)
  const [expandedPeriodo, setExpandedPeriodo] = useState(null)

  useEffect(() => {
    docentesApi.miKardex()
      .then(r => setGrupos(r.data))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  if (loading) return <Spinner />

  // Agrupar por periodo
  const periodoMap = {}
  grupos.forEach(g => {
    const key = g.periodo_id
    if (!periodoMap[key]) {
      periodoMap[key] = {
        id: g.periodo_id,
        nombre: g.periodo_nombre,
        codigo: g.periodo_codigo,
        activo: g.periodo_activo,
        grupos: []
      }
    }
    periodoMap[key].grupos.push(g)
  })
  const periodos = Object.values(periodoMap)

  // Stats globales
  const totalGrupos = grupos.length
  const totalAlumnos = grupos.reduce((s, g) => s + (g.total_alumnos || 0), 0)
  const gruposConPromedio = grupos.filter(g => g.promedio_grupo > 0)
  const promedioGlobal = gruposConPromedio.length
    ? (gruposConPromedio.reduce((s, g) => s + parseFloat(g.promedio_grupo), 0) / gruposConPromedio.length).toFixed(1)
    : '—'

  const estadoBadge = (estado) => {
    const map = {
      EDICION:    'bg-sky-50 text-sky-600 border-sky-100',
      PRECIERRE:  'bg-amber-50 text-amber-600 border-amber-100',
      FINALIZADO: 'bg-emerald-50 text-emerald-600 border-emerald-100',
    }
    return map[estado] || 'bg-slate-50 text-slate-500 border-slate-100'
  }

  return (
    <div className="min-h-screen bg-slate-50/30">
      <PageHeader
        title="Mi Historial Académico"
        subtitle="Grupos impartidos por periodo"
        icon={FileText}
        actions={
          <div className="flex gap-4">
            <div className="bg-white rounded-xl px-4 py-2 shadow-sm border border-slate-100 text-center">
              <p className="text-xs text-slate-400">Periodos</p>
              <p className="text-2xl font-black text-darkerBlue">{periodos.length}</p>
            </div>
            <div className="bg-white rounded-xl px-4 py-2 shadow-sm border border-slate-100 text-center">
              <p className="text-xs text-slate-400">Promedio General</p>
              <p className="text-2xl font-black text-brand-600">{promedioGlobal}</p>
            </div>
          </div>
        }
      />

      <div className="px-8 py-6 max-w-5xl mx-auto space-y-6">

        {/* Stats globales */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <StatCard label="Grupos Impartidos" value={totalGrupos} icon={BookOpen} color="institucional-dark" />
          <StatCard label="Alumnos Atendidos" value={totalAlumnos} icon={Users} color="institucional" />
          <StatCard label="Promedio General" value={promedioGlobal} icon={TrendingUp} color="institucional" />
        </div>

        {periodos.length === 0 ? (
          <EmptyState icon={FileText} title="Sin historial" description="Aún no tienes grupos registrados en el sistema." />
        ) : (
          periodos.map(periodo => (
            <div key={periodo.id} className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
              {/* Header periodo */}
              <button
                onClick={() => setExpandedPeriodo(expandedPeriodo === periodo.id ? null : periodo.id)}
                className="w-full flex items-center justify-between px-6 py-4 hover:bg-slate-50/60 transition"
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-darkerBlue flex items-center justify-center">
                    <BarChart2 size={18} className="text-yellow-400" />
                  </div>
                  <div className="text-left">
                    <div className="flex items-center gap-2">
                      <h3 className="font-bold text-slate-800">{periodo.nombre}</h3>
                      <span className="text-slate-400 font-medium text-xs">({periodo.codigo})</span>
                      {periodo.activo && (
                        <span className="text-[9px] font-black text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded uppercase tracking-wider">
                          Actual
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-slate-400 mt-0.5">
                      {periodo.grupos.length} {periodo.grupos.length === 1 ? 'grupo' : 'grupos'}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  {/* Mini stats del periodo */}
                  {(() => {
                    const gs = periodo.grupos
                    const prom = gs.filter(g => g.promedio_grupo > 0)
                    const p = prom.length
                      ? (prom.reduce((s, g) => s + parseFloat(g.promedio_grupo), 0) / prom.length).toFixed(1)
                      : '—'
                    return (
                      <div className="text-right hidden sm:block">
                        <p className="text-xs text-slate-400">Promedio del periodo</p>
                        <p className={`text-lg font-black ${parseFloat(p) >= 70 ? 'text-emerald-600' : parseFloat(p) > 0 ? 'text-red-500' : 'text-slate-300'}`}>{p}</p>
                      </div>
                    )
                  })()}
                  {expandedPeriodo === periodo.id
                    ? <ChevronUp size={18} className="text-slate-400" />
                    : <ChevronDown size={18} className="text-slate-400" />
                  }
                </div>
              </button>

              {expandedPeriodo === periodo.id && (
                <div className="border-t border-slate-100 divide-y divide-slate-50">
                  {periodo.grupos.map(g => (
                    <div key={g.grupo_id} className="px-6 py-4 hover:bg-slate-50/30 transition">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3 min-w-0">
                          <BookOpen size={16} className="text-brand-400 flex-shrink-0" />
                          <div className="min-w-0">
                            <p className="font-semibold text-slate-800 truncate">{g.materia}</p>
                            <p className="text-xs text-slate-400">
                              {g.grupo}
                              {g.letra_grupo ? ` — Grupo ${g.letra_grupo}` : ''}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-4 flex-shrink-0 ml-4">
                          {/* Estado */}
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-lg border ${estadoBadge(g.estado)}`}>
                            {g.estado}
                          </span>
                          {/* Alumnos */}
                          <div className="text-center hidden sm:block">
                            <p className="text-[9px] text-slate-400 uppercase font-bold">Alumnos</p>
                            <p className="text-sm font-black text-slate-700">{g.total_alumnos || 0}</p>
                          </div>
                          {/* Aprobados */}
                          {g.total_alumnos > 0 && (
                            <div className="text-center hidden md:block">
                              <p className="text-[9px] text-slate-400 uppercase font-bold">Aprobados</p>
                              <p className="text-sm font-black text-emerald-600">{g.aprobados || 0}/{g.total_alumnos}</p>
                            </div>
                          )}
                          {/* Promedio */}
                          <div className="text-right">
                            <p className="text-[9px] text-slate-400 uppercase font-bold">Promedio</p>
                            <p className={`text-lg font-black tabular-nums ${
                              (g.promedio_grupo || 0) >= 70 ? 'text-emerald-600'
                              : (g.promedio_grupo || 0) > 0 ? 'text-red-500'
                              : 'text-slate-300'
                            }`}>
                              {g.promedio_grupo ? parseFloat(g.promedio_grupo).toFixed(1) : '—'}
                            </p>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  )
}
