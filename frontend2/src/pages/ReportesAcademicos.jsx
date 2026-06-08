import { useState, useEffect } from 'react'
import { periodos as periodosApi, analytics as api } from '../api/endpoints'
import { PageHeader, Spinner, EmptyState } from '../components/ui'
import { FileText, Trophy, Users, AlertTriangle, BookOpen, BarChart2 } from 'lucide-react'

export default function ReportesAcademicos() {
  const [periodos, setPeriodos] = useState([])
  const [periodoActivo, setPeriodoActivo] = useState(null)
  const [tab, setTab] = useState('mejores') // mejores, desercion, reprobacion, docentes
  const [loading, setLoading] = useState(true)
  const [data, setData] = useState([])

  useEffect(() => {
    async function loadPeriodos() {
      try {
        const { data: ps } = await periodosApi.listar()
        setPeriodos(ps)
        const activo = ps.find(p => p.estado === 'activo' || p.estado?.toUpperCase() === 'ACTIVO')
        if (activo) setPeriodoActivo(activo.id)
      } catch (err) {
        console.error(err)
      }
    }
    loadPeriodos()
  }, [])

  useEffect(() => {
    if (!periodoActivo) return
    async function loadData() {
      setLoading(true)
      setData([])
      try {
        let res;
        if (tab === 'mejores') res = await api.mejoresAlumnos(periodoActivo)
        if (tab === 'desercion') res = await api.desercion(periodoActivo)
        if (tab === 'reprobacion') res = await api.reprobacionHistorica()
        if (tab === 'docentes') res = await api.docentesAprobacion(periodoActivo)
        setData(res?.data || [])
      } catch (err) {
        console.error(err)
      } finally {
        setLoading(false)
      }
    }
    loadData()
  }, [tab, periodoActivo])

  return (
    <div className="min-h-screen bg-slate-50/50 pb-20">
      <PageHeader
        title="Reportes Académicos"
        subtitle="Métricas de desempeño, deserción y aprovechamiento institucional"
        icon={FileText}
      />

      <div className="px-8 mt-6">
        <div className="flex justify-between items-center bg-white p-4 rounded-[24px] border border-slate-100 shadow-sm mb-6">
          <div className="flex gap-2 bg-slate-50 p-1.5 rounded-xl border border-slate-100">
            {[
              { id: 'mejores', label: 'Mejores Alumnos', icon: Trophy, color: 'text-amber-500' },
              { id: 'desercion', label: 'Deserción', icon: AlertTriangle, color: 'text-red-500' },
              { id: 'docentes', label: 'Rendimiento Docente', icon: Users, color: 'text-indigo-500' },
              { id: 'reprobacion', label: 'Reprobación Histórica', icon: BookOpen, color: 'text-rose-500' }
            ].map(t => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold transition-all ${
                  tab === t.id ? 'bg-white shadow-sm border border-slate-200 text-slate-800' : 'text-slate-500 hover:text-slate-700 hover:bg-slate-100'
                }`}
              >
                <t.icon size={16} className={tab === t.id ? t.color : 'text-slate-400'} />
                {t.label}
              </button>
            ))}
          </div>

          {tab !== 'reprobacion' && (
            <div className="flex items-center gap-3">
              <span className="text-xs font-bold text-slate-400 uppercase">Periodo:</span>
              <select
                className="form-select text-sm h-[38px] rounded-xl border border-slate-200 bg-white font-bold text-slate-600 outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
                value={periodoActivo || ''}
                onChange={e => setPeriodoActivo(Number(e.target.value))}
              >
                {periodos.map(p => (
                  <option key={p.id} value={p.id}>{p.codigo} {p.activo ? '(Actual)' : ''}</option>
                ))}
              </select>
            </div>
          )}
        </div>

        {loading ? (
          <Spinner />
        ) : data.length === 0 ? (
          <EmptyState icon={BarChart2} title="No hay datos" description="No se encontraron registros para los filtros seleccionados." />
        ) : (
          <div className="bg-white border border-slate-100 rounded-[24px] shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              {tab === 'mejores' && <MejoresAlumnosTable data={data} />}
              {tab === 'desercion' && <DesercionTable data={data} />}
              {tab === 'reprobacion' && <ReprobacionTable data={data} />}
              {tab === 'docentes' && <DocentesTable data={data} />}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function MejoresAlumnosTable({ data }) {
  return (
    <table className="w-full text-sm">
      <thead className="bg-slate-50 border-b border-slate-100 text-slate-500 text-xs uppercase tracking-wider">
        <tr>
          <th className="px-6 py-4 text-left font-black">Nº Control</th>
          <th className="px-6 py-4 text-left font-black">Alumno</th>
          <th className="px-6 py-4 text-center font-black">Materias Cursadas</th>
          <th className="px-6 py-4 text-center font-black">Promedio</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-slate-50">
        {data.map((r, i) => (
          <tr key={r.num_control} className="hover:bg-slate-50/50 transition-colors">
            <td className="px-6 py-4 font-mono font-bold text-slate-600">{r.num_control}</td>
            <td className="px-6 py-4 font-semibold text-slate-800 flex items-center gap-2">
              {i < 3 && <Trophy size={14} className={i === 0 ? 'text-yellow-500' : i === 1 ? 'text-slate-400' : 'text-amber-600'} />}
              {r.alumno}
            </td>
            <td className="px-6 py-4 text-center text-slate-600">{r.materias_cursadas}</td>
            <td className="px-6 py-4 text-center">
              <span className={`px-3 py-1 rounded-full text-xs font-black ${r.promedio >= 90 ? 'bg-emerald-50 text-emerald-600' : r.promedio >= 80 ? 'bg-blue-50 text-blue-600' : 'bg-amber-50 text-amber-600'}`}>
                {r.promedio}
              </span>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

function DesercionTable({ data }) {
  return (
    <table className="w-full text-sm">
      <thead className="bg-slate-50 border-b border-slate-100 text-slate-500 text-xs uppercase tracking-wider">
        <tr>
          <th className="px-6 py-4 text-left font-black">Grupo</th>
          <th className="px-6 py-4 text-left font-black">Materia</th>
          <th className="px-6 py-4 text-center font-black">Inscritos</th>
          <th className="px-6 py-4 text-center font-black">Sin Actividad</th>
          <th className="px-6 py-4 text-center font-black">Tasa Deserción</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-slate-50">
        {data.map((r, i) => (
          <tr key={i} className="hover:bg-slate-50/50 transition-colors">
            <td className="px-6 py-4 font-mono font-bold text-slate-600">{r.grupo}</td>
            <td className="px-6 py-4 font-semibold text-slate-700">{r.materia}</td>
            <td className="px-6 py-4 text-center text-slate-600">{r.total_inscritos}</td>
            <td className="px-6 py-4 text-center font-bold text-rose-500">{r.sin_actividad}</td>
            <td className="px-6 py-4 text-center">
              <span className={`px-3 py-1 rounded-full text-xs font-black ${r.tasa_desercion_pct > 20 ? 'bg-rose-50 text-rose-600' : r.tasa_desercion_pct > 0 ? 'bg-amber-50 text-amber-600' : 'bg-emerald-50 text-emerald-600'}`}>
                {r.tasa_desercion_pct}%
              </span>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

function ReprobacionTable({ data }) {
  return (
    <table className="w-full text-sm">
      <thead className="bg-slate-50 border-b border-slate-100 text-slate-500 text-xs uppercase tracking-wider">
        <tr>
          <th className="px-6 py-4 text-left font-black">Materia</th>
          <th className="px-6 py-4 text-center font-black">Evaluados</th>
          <th className="px-6 py-4 text-center font-black">Reprobados</th>
          <th className="px-6 py-4 text-center font-black">% Reprobación</th>
          <th className="px-6 py-4 text-center font-black">Promedio Histórico</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-slate-50">
        {data.map((r, i) => (
          <tr key={i} className="hover:bg-slate-50/50 transition-colors">
            <td className="px-6 py-4 font-bold text-slate-700">{r.materia}</td>
            <td className="px-6 py-4 text-center text-slate-500">{r.total_evaluados}</td>
            <td className="px-6 py-4 text-center font-bold text-rose-500">{r.reprobados}</td>
            <td className="px-6 py-4 text-center">
              <span className={`px-3 py-1 rounded-full text-xs font-black ${r.pct_reprobacion > 30 ? 'bg-rose-50 text-rose-600' : r.pct_reprobacion > 15 ? 'bg-amber-50 text-amber-600' : 'bg-slate-100 text-slate-600'}`}>
                {r.pct_reprobacion}%
              </span>
            </td>
            <td className="px-6 py-4 text-center font-bold text-slate-600">{r.promedio_historico}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

function DocentesTable({ data }) {
  return (
    <table className="w-full text-sm">
      <thead className="bg-slate-50 border-b border-slate-100 text-slate-500 text-xs uppercase tracking-wider">
        <tr>
          <th className="px-6 py-4 text-left font-black">Docente</th>
          <th className="px-6 py-4 text-center font-black">Grupos</th>
          <th className="px-6 py-4 text-center font-black">Alumnos</th>
          <th className="px-6 py-4 text-center font-black">% Aprobación</th>
          <th className="px-6 py-4 text-center font-black">Promedio</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-slate-50">
        {data.map((r, i) => (
          <tr key={i} className="hover:bg-slate-50/50 transition-colors">
            <td className="px-6 py-4 font-bold text-slate-700">
              <div className="flex flex-col">
                <span>{r.docente}</span>
                <span className="text-[10px] text-slate-400 font-mono font-normal">#{r.num_empleado}</span>
              </div>
            </td>
            <td className="px-6 py-4 text-center text-slate-600">{r.num_grupos}</td>
            <td className="px-6 py-4 text-center text-slate-600">{r.total_alumnos}</td>
            <td className="px-6 py-4 text-center">
              <span className={`px-3 py-1 rounded-full text-xs font-black ${r.pct_aprobacion >= 80 ? 'bg-emerald-50 text-emerald-600' : r.pct_aprobacion >= 60 ? 'bg-amber-50 text-amber-600' : 'bg-rose-50 text-rose-600'}`}>
                {r.pct_aprobacion}%
              </span>
            </td>
            <td className="px-6 py-4 text-center font-black text-slate-700">{r.promedio_general}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}
