import { useState, useEffect } from 'react'
import { PageHeader } from '../components/layout/Layout'
import { Card, StatCard, Spinner, EmptyState } from '../components/ui'
import { Map, AlertTriangle, Users, TrendingDown, ChevronRight, Search, Filter, Mail } from 'lucide-react'
import { ResponsivePie } from '@nivo/pie'
import { ResponsiveBar } from '@nivo/bar'
import { reportes as reportesApi, periodos as periodosApi } from '../api/endpoints'

const PALETTE = {
  high: '#f43f5e', // rose-500
  medium: '#f59e0b', // amber-500
  low: '#10b981', // emerald-500
  unknown: '#94a3b8' // slate-400
}

export default function MapaRiesgo() {
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [periodos, setPeriodos] = useState([])
  const [periodoId, setPeriodoId] = useState('')
  const [data, setData] = useState(null)

  useEffect(() => {
    periodosApi.listar().then(r => {
      setPeriodos(r.data)
      const activo = r.data.find(p => p.estado === 'activo')
      if (activo) setPeriodoId(activo.id)
    }).catch(() => {})
  }, [])

  useEffect(() => {
    if (!periodoId) return
    setLoading(true)
    reportesApi.riesgoAcademico(periodoId)
      .then(r => setData(r.data))
      .catch(e => console.error(e))
      .finally(() => setLoading(false))
  }, [periodoId])

  if (loading && !data) return <Spinner />

  const resumen = data?.resumen || { total_en_riesgo: 0, riesgo_alto: 0, riesgo_medio: 0, riesgo_bajo: 0, sin_datos: 0 }
  const alumnos = data?.alumnos || []
  
  const totalEvaluados = resumen.riesgo_alto + resumen.riesgo_medio + resumen.riesgo_bajo
  const tasaRiesgoAlto = totalEvaluados > 0 ? ((resumen.riesgo_alto / totalEvaluados) * 100).toFixed(1) : '0.0'

  const pieData = [
    { id: 'Alto Riesgo', label: 'Alto', value: resumen.riesgo_alto, color: PALETTE.high },
    { id: 'Riesgo Medio', label: 'Medio', value: resumen.riesgo_medio, color: PALETTE.medium },
    { id: 'Sin Riesgo', label: 'Bajo', value: resumen.riesgo_bajo, color: PALETTE.low },
    { id: 'Sin Datos', label: 'Sin Datos', value: resumen.sin_datos, color: PALETTE.unknown },
  ].filter(d => d.value > 0)

  // Agrupar alumnos en riesgo (ALTO/MEDIO) por materia para el gráfico de barras
  const materiasMap = {}
  alumnos.forEach(a => {
    if (a.nivel_riesgo === 'ALTO' || a.nivel_riesgo === 'MEDIO') {
      if (!materiasMap[a.materia]) {
        materiasMap[a.materia] = { materia: a.materia, Alto: 0, Medio: 0, total: 0 }
      }
      if (a.nivel_riesgo === 'ALTO') materiasMap[a.materia].Alto++
      if (a.nivel_riesgo === 'MEDIO') materiasMap[a.materia].Medio++
      materiasMap[a.materia].total++
    }
  })
  
  // Tomar el top 10 materias con más riesgo
  const barData = Object.values(materiasMap)
    .sort((a, b) => b.total - a.total)
    .slice(0, 10)

  const alumnosFiltrados = alumnos
    .filter(a => a.nivel_riesgo === 'ALTO' || a.nivel_riesgo === 'MEDIO')
    .filter(a => a.alumno.toLowerCase().includes(search.toLowerCase()) || a.no_control.includes(search))

  return (
    <div className="bg-slate-50/50 min-h-screen pb-20">
      <PageHeader 
        title="Mapa de Riesgo de Deserción" 
        subtitle="Identificación temprana de alumnos con bajo rendimiento"
        icon={Map}
        actions={
          <select 
            value={periodoId} 
            onChange={e => setPeriodoId(e.target.value ? Number(e.target.value) : '')}
            className="h-10 px-4 rounded-xl border-0 bg-white/10 text-white font-bold outline-none focus:ring-2 focus:ring-yellow-500/50"
          >
            {periodos.map(p => (
              <option key={p.id} value={p.id} className="text-slate-800">{p.codigo} {p.estado === 'activo' ? '(Actual)' : ''}</option>
            ))}
          </select>
        }
      />

      <div className="p-8 space-y-8 max-w-7xl mx-auto animate-in fade-in slide-in-from-bottom-4 duration-700">
        
        {/* KPIs */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <StatCard label="Alumnos en Riesgo Alto" value={resumen.riesgo_alto} icon={AlertTriangle} color="white" border="border-l-4 border-rose-500" />
          <StatCard label="Tasa de Riesgo Alto" value={`${tasaRiesgoAlto}%`} icon={TrendingDown} color="white" />
          <StatCard label="Total de Alumnos Analizados" value={totalEvaluados} icon={Users} color="white" />
        </div>

        {/* Gráficos */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          <Card className="p-8 rounded-[2.5rem] bg-white border-0 shadow-xl shadow-slate-200/50">
            <h3 className="text-sm font-black text-slate-800 uppercase tracking-widest mb-6">Distribución de Riesgo</h3>
            <div style={{ height: 300 }}>
              {pieData.length > 0 ? (
                <ResponsivePie
                  data={pieData}
                  margin={{ top: 20, right: 80, bottom: 20, left: 80 }}
                  innerRadius={0.7}
                  padAngle={2}
                  cornerRadius={12}
                  colors={d => d.data.color}
                  enableArcLabels={false}
                  arcLinkLabelsTextColor="#64748b"
                  arcLinkLabelsThickness={2}
                  arcLinkLabelsColor={{ from: 'color' }}
                />
              ) : (
                <EmptyState icon={Map} title="Sin datos de riesgo" description="No hay suficientes datos para graficar." />
              )}
            </div>
          </Card>

          <Card className="p-8 rounded-[2.5rem] bg-white border-0 shadow-xl shadow-slate-200/50">
            <h3 className="text-sm font-black text-slate-800 uppercase tracking-widest mb-6">Materias Críticas</h3>
            <div style={{ height: 300 }}>
              {barData.length > 0 ? (
                <ResponsiveBar
                  data={barData}
                  keys={['Alto', 'Medio']}
                  indexBy="materia"
                  margin={{ top: 10, right: 10, bottom: 40, left: 40 }}
                  padding={0.4}
                  colors={[PALETTE.high, PALETTE.medium]}
                  borderRadius={6}
                  axisLeft={{ tickSize: 0 }}
                  axisBottom={{ tickSize: 0, tickPadding: 10, renderTick: () => null }} // Ocultar labels muy largos abajo
                  enableGridY={false}
                  theme={{ fontFamily: 'inherit', fontSize: 11 }}
                  tooltip={({ id, value, indexValue }) => (
                    <div className="bg-white p-2 shadow rounded-lg border border-slate-100 text-xs font-bold text-slate-700">
                      {indexValue}: {value} en Riesgo {id}
                    </div>
                  )}
                />
              ) : (
                <EmptyState icon={Map} title="Sin materias críticas" description="No hay alumnos en riesgo." />
              )}
            </div>
          </Card>
        </div>

        {/* Tabla de Alumnos */}
        <Card className="rounded-[2.5rem] bg-white border-0 shadow-xl shadow-slate-200/50 overflow-hidden">
          <div className="p-6 border-b border-slate-50 flex flex-col md:flex-row md:items-center justify-between gap-4">
            <h3 className="text-sm font-black text-slate-800 uppercase tracking-widest flex items-center gap-2">
              Alumnos Prioritarios
              <span className="bg-rose-100 text-rose-600 px-2 py-0.5 rounded-full text-[10px]">{alumnosFiltrados.length}</span>
            </h3>
            <div className="flex gap-2">
                <div className="relative">
                    <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input 
                        type="text" 
                        placeholder="Buscar alumno..." 
                        className="pl-9 pr-4 py-2 bg-slate-50 border-0 rounded-xl text-xs font-bold text-slate-700 w-64 focus:ring-2 focus:ring-rose-500/20 outline-none"
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                    />
                </div>
            </div>
          </div>

          <div className="overflow-x-auto">
            {loading ? <div className="p-8"><Spinner /></div> : alumnosFiltrados.length === 0 ? (
              <div className="p-8"><EmptyState title="Sin alumnos" description="No hay alumnos prioritarios o que coincidan con la búsqueda." /></div>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50/50">
                    <th className="px-6 py-4 text-left text-[10px] font-black text-slate-400 uppercase tracking-widest">Alumno</th>
                    <th className="px-6 py-4 text-left text-[10px] font-black text-slate-400 uppercase tracking-widest">Nivel Riesgo</th>
                    <th className="px-6 py-4 text-left text-[10px] font-black text-slate-400 uppercase tracking-widest">Materia Crítica</th>
                    <th className="px-6 py-4 text-left text-[10px] font-black text-slate-400 uppercase tracking-widest">Grupo</th>
                    <th className="px-6 py-4 text-center text-[10px] font-black text-slate-400 uppercase tracking-widest">Promedio Est.</th>
                    <th className="px-6 py-4 text-center text-[10px] font-black text-slate-400 uppercase tracking-widest">Avance</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {alumnosFiltrados.map(a => (
                    <tr key={a.inscripcion_id} className="hover:bg-slate-50/50 transition-colors group">
                      <td className="px-6 py-5">
                        <p className="font-bold text-slate-800">{a.alumno}</p>
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-tighter">{a.no_control}</p>
                      </td>
                      <td className="px-6 py-5">
                        <span className={`text-[10px] font-black px-3 py-1 rounded-full uppercase tracking-widest border ${
                          a.nivel_riesgo === 'ALTO' ? 'bg-rose-50 text-rose-600 border-rose-100' : 
                          a.nivel_riesgo === 'MEDIO' ? 'bg-amber-50 text-amber-600 border-amber-100' : 'bg-emerald-50 text-emerald-600 border-emerald-100'
                        }`}>
                          {a.nivel_riesgo}
                        </span>
                      </td>
                      <td className="px-6 py-5">
                        <p className="font-bold text-slate-600 text-xs">{a.materia}</p>
                      </td>
                      <td className="px-6 py-5">
                        <p className="font-bold text-slate-600 text-xs">{a.grupo}</p>
                      </td>
                      <td className="px-6 py-5 text-center">
                        <span className={`text-sm font-black ${a.promedio_estimado < 70 ? 'text-rose-500' : 'text-slate-700'}`}>
                          {a.promedio_estimado != null ? a.promedio_estimado.toFixed(1) : '—'}
                        </span>
                      </td>
                      <td className="px-6 py-5 text-center">
                        <span className="text-xs font-bold text-slate-500">
                          {a.unidades_con_result} / {a.unidades_totales}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </Card>
      </div>
    </div>
  )
}
