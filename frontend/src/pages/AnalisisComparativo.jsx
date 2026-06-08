import { useState, useEffect } from 'react'
import { PageHeader } from '../components/layout/Layout'
import { Spinner, EmptyState, Btn, Toast } from '../components/ui'
import { BarChart2, ArrowUpDown } from 'lucide-react'
import { analytics, periodos as periodosApi } from '../api/endpoints'

function SortableTable({ columns, data, emptyText }) {
  const [sortKey, setSortKey] = useState(null)
  const [sortDir, setSortDir] = useState('asc')
  const toggle = (key) => {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortKey(key); setSortDir('asc') }
  }
  const sorted = sortKey ? [...data].sort((a, b) => {
    const va = a[sortKey], vb = b[sortKey]
    if (va == null) return 1; if (vb == null) return -1
    const cmp = typeof va === 'number' ? va - vb : String(va).localeCompare(String(vb))
    return sortDir === 'asc' ? cmp : -cmp
  }) : data

  if (!data.length) return <EmptyState icon={BarChart2} title={emptyText || 'Sin datos'} />
  return (
    <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="bg-slate-50/80 border-b border-slate-100">
          <tr>{columns.map(c => (
            <th key={c.key} className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase cursor-pointer select-none hover:text-slate-700" onClick={() => toggle(c.key)}>
              <span className="inline-flex items-center gap-1">{c.label} <ArrowUpDown size={12} className={sortKey===c.key?'text-brand-500':'text-slate-300'}/></span>
            </th>
          ))}</tr>
        </thead>
        <tbody className="divide-y divide-slate-50">
          {sorted.map((row, i) => (
            <tr key={i} className="hover:bg-slate-50/50 transition">
              {columns.map(c => <td key={c.key} className="px-4 py-3 text-slate-700">{c.render ? c.render(row[c.key], row) : (row[c.key] ?? '—')}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export default function AnalisisComparativo() {
  const [tab, setTab] = useState(0)
  const [periodosList, setPeriodosList] = useState([])
  const [periodoA, setPeriodoA] = useState('')
  const [periodoB, setPeriodoB] = useState('')
  const [periodoSel, setPeriodoSel] = useState('')
  const [data, setData] = useState([])
  const [loading, setLoading] = useState(false)
  const [toast, setToast] = useState(null)

  useEffect(() => { periodosApi.listar().then(r => setPeriodosList(r.data)).catch(() => {}) }, [])

  const tabs = [
    { label: 'Comparativa Materias', needTwo: true },
    { label: 'Ranking Docentes' },
    { label: 'Mejores Alumnos' },
    { label: 'Deserción' },
    { label: 'Reprobación Histórica', noFilter: true },
  ]

  const fetchData = async () => {
    setLoading(true); setData([])
    try {
      let res
      if (tab === 0) res = await analytics.comparativaMaterias(periodoA, periodoB)
      else if (tab === 1) res = await analytics.docentesAprobacion(periodoSel || undefined)
      else if (tab === 2) res = await analytics.mejoresAlumnos(periodoSel || undefined)
      else if (tab === 3) res = await analytics.desercion(periodoSel)
      else if (tab === 4) res = await analytics.reprobacionHistorica()
      setData(res.data)
    } catch(e) { setToast({message: e.response?.data?.detail?.mensaje || 'Error al obtener datos', type:'error'}) }
    setLoading(false)
  }

  const colsByTab = [
    [ {key:'materia_id',label:'ID'},{key:'materia',label:'Materia'},{key:'promedio_a',label:'Prom. A'},{key:'promedio_b',label:'Prom. B'},{key:'diferencia',label:'Dif.'},{key:'pct_reprobacion_a',label:'% Rep. A'},{key:'pct_reprobacion_b',label:'% Rep. B'},{key:'inscritos_a',label:'Insc. A'},{key:'inscritos_b',label:'Insc. B'} ],
    [ {key:'num_empleado',label:'Num. Emp.'},{key:'docente',label:'Docente'},{key:'num_grupos',label:'Grupos'},{key:'total_alumnos',label:'Alumnos'},{key:'pct_aprobacion',label:'% Aprob.',render:v=>v!=null?`${v}%`:'—'},{key:'promedio_general',label:'Promedio'} ],
    [ {key:'num_control',label:'Num. Control'},{key:'alumno',label:'Alumno'},{key:'promedio',label:'Promedio'},{key:'materias_cursadas',label:'Cursadas'},{key:'materias_reprobadas',label:'Reprobadas'} ],
    [ {key:'grupo',label:'Grupo'},{key:'materia',label:'Materia'},{key:'docente',label:'Docente'},{key:'total_inscritos',label:'Inscritos'},{key:'sin_actividad',label:'Sin Actividad'},{key:'tasa_desercion_pct',label:'% Deserción',render:v=>v!=null?`${v}%`:'—'} ],
    [ {key:'id',label:'ID'},{key:'materia',label:'Materia'},{key:'total_evaluados',label:'Evaluados'},{key:'reprobados',label:'Reprobados'},{key:'pct_reprobacion',label:'% Rep.',render:v=>v!=null?`${v}%`:'—'},{key:'promedio_historico',label:'Prom. Hist.'},{key:'periodos_impartidos',label:'Periodos'} ],
  ]

  return (
    <div>
      <PageHeader title="Análisis Comparativo" subtitle="Consultas analíticas institucionales" icon={BarChart2} />
      <div className="px-8 py-6 space-y-6">
        {/* Tabs */}
        <div className="flex gap-1 bg-slate-100 rounded-xl p-1 overflow-x-auto">
          {tabs.map((t,i) => (
            <button key={i} onClick={() => {setTab(i);setData([])}} className={`px-4 py-2 rounded-lg text-sm font-semibold whitespace-nowrap transition ${tab===i?'bg-white text-slate-900 shadow-sm':'text-slate-500 hover:text-slate-700'}`}>{t.label}</button>
          ))}
        </div>

        {/* Filters */}
        {!tabs[tab].noFilter && (
          <div className="flex items-end gap-4 flex-wrap">
            {tabs[tab].needTwo ? (<>
              <div><label className="text-xs font-semibold text-slate-500 mb-1 block">Periodo A</label>
                <select value={periodoA} onChange={e=>setPeriodoA(e.target.value)} className="input-field w-48">
                  <option value="">Seleccionar</option>
                  {periodosList.map(p=><option key={p.id} value={p.id}>{p.nombre}</option>)}
                </select></div>
              <div><label className="text-xs font-semibold text-slate-500 mb-1 block">Periodo B</label>
                <select value={periodoB} onChange={e=>setPeriodoB(e.target.value)} className="input-field w-48">
                  <option value="">Seleccionar</option>
                  {periodosList.map(p=><option key={p.id} value={p.id}>{p.nombre}</option>)}
                </select></div>
            </>) : (
              <div><label className="text-xs font-semibold text-slate-500 mb-1 block">Periodo</label>
                <select value={periodoSel} onChange={e=>setPeriodoSel(e.target.value)} className="input-field w-48">
                  <option value="">Todos</option>
                  {periodosList.map(p=><option key={p.id} value={p.id}>{p.nombre}</option>)}
                </select></div>
            )}
            <Btn onClick={fetchData} disabled={loading || (tabs[tab].needTwo && (!periodoA||!periodoB)) || (tab===3&&!periodoSel)}>Consultar</Btn>
          </div>
        )}
        {tabs[tab].noFilter && <Btn onClick={fetchData} disabled={loading}>Consultar</Btn>}

        {loading && <Spinner />}
        {!loading && data.length > 0 && <SortableTable columns={colsByTab[tab]} data={data} />}
      </div>
      {toast&&<Toast message={toast.message} type={toast.type} onClose={()=>setToast(null)} />}
    </div>
  )
}
