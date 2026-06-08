import { useState, useEffect, useCallback } from 'react'
import { PageHeader } from '../components/layout/Layout'
import { Spinner, EmptyState, Btn } from '../components/ui'
import {
  FileText, BarChart2, AlertTriangle, Users, BookOpen,
  ClipboardCheck, Download, Filter, ChevronDown, Search
} from 'lucide-react'
import { periodos as periodosApi, reportes as reportesApi, grupos as gruposApi, materias as materiasApi, docentes as docentesApi } from '../api/endpoints'

// ─── Exportación CSV ──────────────────────────────────────────────────────────
function exportCSV(data, filename) {
  if (!data.length) return
  const keys = Object.keys(data[0])
  const rows = [keys.join(','), ...data.map(r => keys.map(k => JSON.stringify(r[k] ?? '')).join(','))]
  const blob = new Blob([rows.join('\n')], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a'); a.href = url; a.download = filename; a.click()
  URL.revokeObjectURL(url)
}

// ─── Barra de filtros reutilizable ────────────────────────────────────────────
function FilterBar({ periodos, periodoId, onPeriodo, onBuscar, loading, extras }) {
  return (
    <div className="bg-white border border-slate-100 rounded-2xl p-4 flex flex-wrap gap-3 items-end shadow-sm mb-5">
      <div>
        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1">Periodo</label>
        <select
          value={periodoId || ''}
          onChange={e => onPeriodo(e.target.value ? Number(e.target.value) : null)}
          className="h-9 px-3 rounded-xl border border-slate-200 text-sm font-semibold text-slate-700 bg-white outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500 min-w-[160px]"
        >
          <option value="">Todos los periodos</option>
          {periodos.map(p => <option key={p.id} value={p.id}>{p.codigo}{p.estado === 'activo' ? ' (Actual)' : ''}</option>)}
        </select>
      </div>
      {extras}
      <Btn onClick={onBuscar} disabled={loading} className="h-9">
        {loading ? <Spinner size="sm" /> : <Filter size={14} />}
        Consultar
      </Btn>
    </div>
  )
}

// ─── Tabla genérica ordenable ─────────────────────────────────────────────────
function ReporteTable({ cols, data, csvName, emptyText = 'Sin resultados' }) {
  const [q, setQ] = useState('')
  if (!data) return null
  const filtered = q
    ? data.filter(r => Object.values(r).some(v => String(v ?? '').toLowerCase().includes(q.toLowerCase())))
    : data
  return (
    <div className="bg-white border border-slate-100 rounded-2xl shadow-sm overflow-hidden">
      <div className="flex items-center justify-between px-5 py-3 border-b border-slate-50 gap-3 flex-wrap">
        <div className="relative">
          <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            placeholder="Buscar…"
            value={q} onChange={e => setQ(e.target.value)}
            className="pl-8 pr-3 py-1.5 text-xs rounded-lg border border-slate-200 bg-slate-50 outline-none focus:border-brand-500 w-52"
          />
        </div>
        <button
          onClick={() => exportCSV(filtered, `${csvName}.csv`)}
          className="flex items-center gap-1.5 text-xs font-bold text-slate-500 hover:text-brand-600 transition-colors px-3 py-1.5 rounded-lg hover:bg-brand-50 border border-transparent hover:border-brand-100"
        >
          <Download size={13} /> Exportar CSV
        </button>
      </div>
      {filtered.length === 0
        ? <div className="py-12"><EmptyState icon={BarChart2} title={emptyText} /></div>
        : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b border-slate-100">
                <tr>
                  {cols.map(c => (
                    <th key={c.key} className="px-4 py-3 text-left text-[10px] font-black text-slate-400 uppercase tracking-wider whitespace-nowrap">
                      {c.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {filtered.map((row, i) => (
                  <tr key={i} className="hover:bg-slate-50/50 transition-colors">
                    {cols.map(c => (
                      <td key={c.key} className="px-4 py-3 text-slate-700 whitespace-nowrap">
                        {c.render ? c.render(row[c.key], row) : (row[c.key] ?? '—')}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      }
      <div className="px-5 py-2 border-t border-slate-50 text-[10px] text-slate-400 font-semibold">
        {filtered.length} registros
      </div>
    </div>
  )
}

// ─── Badge de estatus ─────────────────────────────────────────────────────────
function EstatusBadge({ v }) {
  const map = {
    APROBADO: 'bg-emerald-50 text-emerald-700',
    REPROBADO: 'bg-rose-50 text-rose-700',
    EN_CURSO: 'bg-indigo-50 text-indigo-700',
    COMPLETO: 'bg-emerald-50 text-emerald-700',
    PARCIAL: 'bg-amber-50 text-amber-700',
    PENDIENTE: 'bg-rose-50 text-rose-700',
    SIN_UNIDADES: 'bg-slate-100 text-slate-500',
  }
  return <span className={`text-[10px] font-black px-2 py-0.5 rounded-full ${map[v] || 'bg-slate-100 text-slate-500'}`}>{v}</span>
}

// ─── KPI Cards ────────────────────────────────────────────────────────────────
function KpiRow({ items }) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-5">
      {items.map((kpi, i) => (
        <div key={i} className="bg-white border border-slate-100 rounded-2xl p-4 shadow-sm flex flex-col gap-1">
          <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider">{kpi.label}</span>
          <span className={`text-2xl font-black ${kpi.color || 'text-slate-800'}`}>{kpi.value ?? '—'}</span>
        </div>
      ))}
    </div>
  )
}

// =============================================================================
// TAB: R2 — Calificaciones por Grupo
// =============================================================================
function TabCalificacionesGrupo({ periodos }) {
  const [periodoId, setPeriodoId] = useState(null)
  const [grupos, setGrupos] = useState([])
  const [grupoId, setGrupoId] = useState('')
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(false)
  const [loadingGrupos, setLoadingGrupos] = useState(false)

  useEffect(() => {
    if (!periodoId) return
    setLoadingGrupos(true)
    reportesApi.gruposPeriodo(periodoId)
      .then(r => { setGrupos(r.data); setGrupoId('') })
      .catch(() => {})
      .finally(() => setLoadingGrupos(false))
  }, [periodoId])

  const buscar = async () => {
    if (!grupoId) return
    setLoading(true); setData(null)
    try { const r = await reportesApi.calificacionesGrupo(grupoId); setData(r.data) }
    catch (e) { console.error(e) }
    finally { setLoading(false) }
  }

  // Construir columnas dinámicas con unidades
  const unidades = data?.unidades || []
  const cols = [
    { key: 'matricula', label: 'Matrícula' },
    { key: 'alumno', label: 'Alumno' },
    ...unidades.map(u => ({
      key: `_u${u.numero}`,
      label: `U${u.numero}`,
      render: (_, row) => {
        const pu = row.por_unidad?.[String(u.numero)]
        return <span className={`font-bold ${parseFloat(pu) < 70 ? 'text-rose-500' : 'text-slate-700'}`}>{pu ?? '—'}</span>
      }
    })),
    {
      key: 'resultado_final',
      label: 'Final',
      render: v => <span className={`font-black ${v >= 70 ? 'text-emerald-600' : v != null ? 'text-rose-600' : 'text-slate-400'}`}>{v ?? '—'}</span>
    },
    { key: 'estatus', label: 'Estatus', render: v => <EstatusBadge v={v} /> },
  ]

  const stats = data?.estadisticas
  return (
    <div>
      <FilterBar
        periodos={periodos} periodoId={periodoId} onPeriodo={setPeriodoId}
        loading={loading} onBuscar={buscar}
        extras={
          <div>
            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1">Grupo</label>
            <select
              value={grupoId} onChange={e => setGrupoId(e.target.value)}
              disabled={!periodoId || loadingGrupos}
              className="h-9 px-3 rounded-xl border border-slate-200 text-sm font-semibold text-slate-700 bg-white outline-none focus:border-brand-500 min-w-[200px] disabled:opacity-50"
            >
              <option value="">Seleccionar grupo…</option>
              {grupos.map(g => <option key={g.id} value={g.id}>{g.nombre} — {g.materia}</option>)}
            </select>
          </div>
        }
      />
      {stats && (
        <KpiRow items={[
          { label: 'Alumnos', value: stats.total_alumnos },
          { label: 'Aprobados', value: stats.aprobados, color: 'text-emerald-600' },
          { label: 'Reprobados', value: stats.reprobados, color: 'text-rose-600' },
          { label: 'Promedio', value: stats.promedio_grupo, color: 'text-brand-600' },
        ]} />
      )}
      {loading && <Spinner />}
      {data && <ReporteTable cols={cols} data={data.alumnos} csvName={`calificaciones_grupo_${grupoId}`} emptyText="Sin alumnos inscritos" />}
    </div>
  )
}

// =============================================================================
// TAB: R3 — Reporte por Materia
// =============================================================================
function TabPorMateria({ periodos }) {
  const [periodoId, setPeriodoId] = useState(null)
  const [materiasList, setMateriasList] = useState([])
  const [materiaId, setMateriaId] = useState('')
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    materiasApi.listar().then(r => setMateriasList(r.data)).catch(() => {})
  }, [])

  const buscar = async () => {
    if (!materiaId) return
    setLoading(true); setData(null)
    try { const r = await reportesApi.porMateria(materiaId, periodoId); setData(r.data) }
    catch (e) { console.error(e) }
    finally { setLoading(false) }
  }

  const cols = [
    { key: 'periodo', label: 'Periodo' },
    { key: 'grupo', label: 'Grupo' },
    { key: 'docente', label: 'Docente' },
    { key: 'matricula', label: 'Matrícula' },
    { key: 'alumno', label: 'Alumno' },
    { key: 'resultado_final', label: 'Final', render: v => <span className={`font-black ${v >= 70 ? 'text-emerald-600' : v != null ? 'text-rose-600' : 'text-slate-400'}`}>{v ?? '—'}</span> },
    { key: 'estatus', label: 'Estatus', render: v => <EstatusBadge v={v} /> },
  ]

  const stats = data?.estadisticas
  return (
    <div>
      <FilterBar
        periodos={periodos} periodoId={periodoId} onPeriodo={setPeriodoId}
        loading={loading} onBuscar={buscar}
        extras={
          <div>
            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1">Materia</label>
            <select
              value={materiaId} onChange={e => setMateriaId(e.target.value)}
              className="h-9 px-3 rounded-xl border border-slate-200 text-sm font-semibold text-slate-700 bg-white outline-none focus:border-brand-500 min-w-[220px]"
            >
              <option value="">Seleccionar materia…</option>
              {materiasList.map(m => <option key={m.id} value={m.id}>{m.nombre}</option>)}
            </select>
          </div>
        }
      />
      {stats && (
        <KpiRow items={[
          { label: 'Total alumnos', value: stats.total_alumnos },
          { label: 'Aprobados', value: stats.aprobados, color: 'text-emerald-600' },
          { label: 'Reprobados', value: stats.reprobados, color: 'text-rose-600' },
          { label: '% Reprobación', value: `${stats.pct_reprobacion}%`, color: stats.pct_reprobacion > 30 ? 'text-rose-600' : 'text-amber-600' },
        ]} />
      )}
      {loading && <Spinner />}
      {data && <ReporteTable cols={cols} data={data.alumnos} csvName={`reporte_materia_${materiaId}`} emptyText="Sin alumnos para esta materia" />}
    </div>
  )
}

// =============================================================================
// TAB: R7 — Índice de Reprobación
// =============================================================================
function TabIndiceReprobacion({ periodos }) {
  const [periodoId, setPeriodoId] = useState(null)
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(false)

  const buscar = async () => {
    setLoading(true); setData(null)
    try { const r = await reportesApi.indiceReprobacion({ ...(periodoId ? { periodo_id: periodoId } : {}) }); setData(r.data) }
    catch (e) { console.error(e) }
    finally { setLoading(false) }
  }

  const cols = [
    { key: 'periodo', label: 'Periodo' },
    { key: 'materia', label: 'Materia' },
    { key: 'clave_materia', label: 'Clave' },
    { key: 'grupo', label: 'Grupo' },
    { key: 'docente', label: 'Docente' },
    { key: 'total_inscritos', label: 'Inscritos' },
    { key: 'total_evaluados', label: 'Evaluados' },
    { key: 'aprobados', label: 'Aprobados', render: v => <span className="font-bold text-emerald-600">{v}</span> },
    { key: 'reprobados', label: 'Reprobados', render: v => <span className="font-bold text-rose-600">{v}</span> },
    {
      key: 'pct_reprobacion', label: '% Reprobación',
      render: v => v != null
        ? <span className={`font-black px-2 py-0.5 rounded-full text-xs ${v > 30 ? 'bg-rose-50 text-rose-700' : v > 15 ? 'bg-amber-50 text-amber-700' : 'bg-slate-100 text-slate-600'}`}>{v}%</span>
        : '—'
    },
    { key: 'promedio', label: 'Promedio', render: v => <span className="font-bold text-slate-700">{v ?? '—'}</span> },
  ]

  return (
    <div>
      <FilterBar periodos={periodos} periodoId={periodoId} onPeriodo={setPeriodoId} loading={loading} onBuscar={buscar} />
      {loading && <Spinner />}
      {data && <ReporteTable cols={cols} data={data} csvName="indice_reprobacion" />}
    </div>
  )
}

// =============================================================================
// TAB: R11 — Lista de Reprobados
// =============================================================================
function TabReprobados({ periodos }) {
  const [periodoId, setPeriodoId] = useState(null)
  const [grupos, setGrupos] = useState([])
  const [grupoId, setGrupoId] = useState('')
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!periodoId) return
    reportesApi.gruposPeriodo(periodoId).then(r => { setGrupos(r.data); setGrupoId('') }).catch(() => {})
  }, [periodoId])

  const buscar = async () => {
    setLoading(true); setData(null)
    try {
      const r = await reportesApi.reprobados({
        ...(periodoId ? { periodo_id: periodoId } : {}),
        ...(grupoId ? { grupo_id: grupoId } : {}),
      })
      setData(r.data)
    } catch (e) { console.error(e) }
    finally { setLoading(false) }
  }

  const cols = [
    { key: 'matricula', label: 'Matrícula', render: v => <span className="font-mono font-bold text-slate-600">{v}</span> },
    { key: 'alumno', label: 'Alumno', render: v => <span className="font-semibold text-slate-800">{v}</span> },
    { key: 'materia', label: 'Materia' },
    { key: 'grupo', label: 'Grupo' },
    { key: 'periodo', label: 'Periodo' },
    { key: 'docente', label: 'Docente' },
    { key: 'resultado_final', label: 'Calificación', render: v => <span className="font-black text-rose-600">{v}</span> },
  ]

  return (
    <div>
      <FilterBar
        periodos={periodos} periodoId={periodoId} onPeriodo={setPeriodoId}
        loading={loading} onBuscar={buscar}
        extras={
          <div>
            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1">Grupo (opcional)</label>
            <select
              value={grupoId} onChange={e => setGrupoId(e.target.value)}
              disabled={!periodoId}
              className="h-9 px-3 rounded-xl border border-slate-200 text-sm font-semibold text-slate-700 bg-white outline-none focus:border-brand-500 min-w-[200px] disabled:opacity-50"
            >
              <option value="">Todos los grupos</option>
              {grupos.map(g => <option key={g.id} value={g.id}>{g.nombre} — {g.materia}</option>)}
            </select>
          </div>
        }
      />
      {data && (
        <KpiRow items={[
          { label: 'Total reprobados', value: data.length, color: 'text-rose-600' },
        ]} />
      )}
      {loading && <Spinner />}
      {data && <ReporteTable cols={cols} data={data} csvName="reprobados" emptyText="Sin alumnos reprobados con los filtros aplicados" />}
    </div>
  )
}

// =============================================================================
// TAB: R13 — Estado de Captura
// =============================================================================
function TabEstadoCaptura({ periodos }) {
  const [periodoId, setPeriodoId] = useState(null)
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(false)

  const buscar = async () => {
    setLoading(true); setData(null)
    try { const r = await reportesApi.estadoCaptura(periodoId); setData(r.data) }
    catch (e) { console.error(e) }
    finally { setLoading(false) }
  }

  const cols = [
    { key: 'docente', label: 'Docente', render: (v, row) => (
      <div><p className="font-bold text-slate-800">{v}</p><p className="text-[10px] text-slate-400 font-mono">#{row.num_empleado}</p></div>
    )},
    { key: 'materia', label: 'Materia' },
    { key: 'grupo', label: 'Grupo' },
    { key: 'periodo', label: 'Periodo' },
    { key: 'total_alumnos', label: 'Alumnos' },
    { key: 'total_unidades', label: 'Unidades' },
    { key: 'unidades_cerradas', label: 'Cerradas', render: v => <span className="font-bold text-emerald-600">{v}</span> },
    { key: 'unidades_abiertas', label: 'Abiertas', render: v => v > 0 ? <span className="font-bold text-amber-600">{v}</span> : <span className="text-slate-400">0</span> },
    { key: 'estado_captura', label: 'Estado', render: v => <EstatusBadge v={v} /> },
  ]

  const resumen = data?.resumen
  return (
    <div>
      <FilterBar periodos={periodos} periodoId={periodoId} onPeriodo={setPeriodoId} loading={loading} onBuscar={buscar} />
      {resumen && (
        <KpiRow items={[
          { label: 'Completo', value: resumen.completo, color: 'text-emerald-600' },
          { label: 'Parcial', value: resumen.parcial, color: 'text-amber-600' },
          { label: 'Pendiente', value: resumen.pendiente, color: 'text-rose-600' },
          { label: 'Sin unidades', value: resumen.sin_unidades, color: 'text-slate-500' },
        ]} />
      )}
      {loading && <Spinner />}
      {data && <ReporteTable cols={cols} data={data.grupos} csvName="estado_captura" />}
    </div>
  )
}

// =============================================================================
// PÁGINA PRINCIPAL — Centro de Reportes
// =============================================================================
const TABS = [
  { id: 'calificaciones-grupo', label: 'Calific. por Grupo', icon: BookOpen, desc: 'Todos los alumnos de un grupo con parciales y final' },
  { id: 'por-materia',          label: 'Por Materia',         icon: ClipboardCheck, desc: 'Todos los grupos de una materia cruzados' },
  { id: 'indice-reprobacion',   label: 'Índice Reprobación',  icon: AlertTriangle, desc: 'Tasa de reprobación por grupo, materia y docente' },
  { id: 'reprobados',           label: 'Lista Reprobados',    icon: Users, desc: 'Alumnos reprobados con filtros combinados' },
  { id: 'estado-captura',       label: 'Estado de Captura',   icon: ClipboardCheck, desc: 'Avance de captura de calificaciones por docente' },
]

export default function Reportes() {
  const [tab, setTab] = useState('calificaciones-grupo')
  const [periodos, setPeriodos] = useState([])

  useEffect(() => {
    periodosApi.listar().then(r => setPeriodos(r.data)).catch(() => {})
  }, [])

  const activeTab = TABS.find(t => t.id === tab)

  return (
    <div className="min-h-screen bg-slate-50/50 pb-20">
      <PageHeader
        title="Centro de Reportes"
        subtitle="Reportes académicos y administrativos con exportación CSV"
        icon={FileText}
      />

      <div className="px-8 mt-6">
        {/* Tabs */}
        <div className="flex gap-1.5 flex-wrap mb-6 bg-white p-1.5 rounded-2xl border border-slate-100 shadow-sm">
          {TABS.map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold transition-all ${
                tab === t.id
                  ? 'bg-darkerBlue text-white shadow-sm'
                  : 'text-slate-500 hover:text-slate-700 hover:bg-slate-50'
              }`}
            >
              <t.icon size={14} className={tab === t.id ? 'text-yellow-400' : 'text-slate-400'} />
              {t.label}
            </button>
          ))}
        </div>

        {/* Descripción del tab activo */}
        {activeTab && (
          <p className="text-sm text-slate-500 mb-4 font-medium">
            <span className="font-black text-slate-700">{activeTab.label}:</span> {activeTab.desc}
          </p>
        )}

        {/* Contenido */}
        {tab === 'calificaciones-grupo' && <TabCalificacionesGrupo periodos={periodos} />}
        {tab === 'por-materia'          && <TabPorMateria periodos={periodos} />}
        {tab === 'indice-reprobacion'   && <TabIndiceReprobacion periodos={periodos} />}
        {tab === 'reprobados'           && <TabReprobados periodos={periodos} />}
        {tab === 'estado-captura'       && <TabEstadoCaptura periodos={periodos} />}
      </div>
    </div>
  )
}
