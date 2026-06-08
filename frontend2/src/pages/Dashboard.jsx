import { useState, useEffect } from 'react'
import { useAuth } from '../context/AuthContext'
import { dashboard as dashboardApi } from '../api/endpoints'
import { PageHeader } from '../components/layout/Layout'
import { StatCard, Card, Spinner, Badge } from '../components/ui'
import {
  Users, GraduationCap, BookOpen, Clock, CheckCircle,
  TrendingUp, AlertTriangle, FileText, Download, Target, Activity,
  ClipboardList, Award, ShieldCheck, BarChart2, TrendingDown, Star,
  Calendar as CalendarIcon, ChevronLeft, ChevronRight
} from 'lucide-react'
import { ResponsiveBar } from '@nivo/bar'
import { ResponsivePie } from '@nivo/pie'
import { generarReporteAcademico } from '../utils/reportGenerator'
import { useNavigate } from 'react-router-dom'
import { Modal, Btn } from '../components/ui'

// ─── Componente Calendario Interactivo ──────────────────────────────────────
function CalendarSection({ events = [], title = "Calendario de Actividades" }) {
  const [currentDate, setCurrentDate] = useState(new Date())
  const [selectedDay, setSelectedDay] = useState(null)
  const [modalOpen, setModalOpen] = useState(false)
  const navigate = useNavigate()
  
  const daysInMonth = (year, month) => new Date(year, month + 1, 0).getDate()
  const firstDayOfMonth = (year, month) => new Date(year, month, 1).getDay()
  
  const monthNames = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"]
  
  const year = currentDate.getFullYear()
  const month = currentDate.getMonth()
  
  const days = []
  for (let i = 0; i < firstDayOfMonth(year, month); i++) {
    days.push(<div key={`cal-empty-${i}`} className="h-10 w-10"></div>)
  }
  
  for (let d = 1; d <= daysInMonth(year, month); d++) {
    const isToday = d === new Date().getDate() && month === new Date().getMonth() && year === new Date().getFullYear()
    const dayEvents = events.filter(e => {
        const ed = new Date(e.date)
        return ed.getDate() === d && ed.getMonth() === month && ed.getFullYear() === year
    })
    const hasEvent = dayEvents.length > 0
    
    days.push(
      <div 
        key={`cal-day-${d}`} 
        onClick={() => {
          if (hasEvent) {
            setSelectedDay({ day: d, date: new Date(year, month, d), events: dayEvents })
            setModalOpen(true)
          }
        }}
        className={`h-10 w-10 flex items-center justify-center rounded-xl text-sm font-bold relative transition-all duration-300 ${
          isToday ? 'bg-darkerBlue text-white shadow-glow scale-110 z-10' : 
          hasEvent ? 'bg-brand-50 text-darkerBlue border border-brand-100 hover:bg-brand-100 cursor-pointer' : 'text-slate-600 hover:bg-slate-100'
        }`}
      >
        {d}
        {hasEvent && !isToday && <div className="absolute bottom-1 w-1 h-1 bg-yellow-500 rounded-full shadow-sm"></div>}
      </div>
    )
  }

  const handleNavigate = (event) => {
    setModalOpen(false)
    if (event.inscripcion_id) {
      navigate(`/mis-grupos/${event.inscripcion_id}`)
    } else if (event.grupo_id) {
      if (event.unidad_id) {
        navigate(`/grupos/${event.grupo_id}/calificaciones/${event.unidad_id}`)
      } else {
        navigate(`/grupos/${event.grupo_id}`)
      }
    }
  }

  return (
    <>
      <Card className="p-6 rounded-[24px] shadow-card flex flex-col h-full bg-white border-0">
        <div className="flex items-center justify-between mb-6">
          <h3 className="font-black text-slate-800 text-sm uppercase tracking-widest flex items-center gap-2">
            <CalendarIcon size={18} className="text-darkerBlue" /> {title}
          </h3>
          <div className="flex gap-1">
            <button onClick={() => setCurrentDate(new Date(year, month - 1))} className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-400 transition-colors"><ChevronLeft size={16}/></button>
            <button onClick={() => setCurrentDate(new Date(year, month + 1))} className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-400 transition-colors"><ChevronRight size={16}/></button>
          </div>
        </div>
        
        <div className="text-center mb-4">
          <span className="text-xs font-black text-slate-400 uppercase tracking-tighter">{monthNames[month]} {year}</span>
        </div>

        <div className="grid grid-cols-7 gap-1 mb-2">
          {['D','L','Ma','Mi','J','V','S'].map((d, i) => (
            <div key={`cal-header-${i}`} className="text-[10px] font-black text-slate-300 text-center uppercase py-2">{d}</div>
          ))}
          {days}
        </div>

        <div className="mt-auto pt-6">
          <div className="p-4 rounded-2xl bg-brand-50/50 border border-brand-100/50">
             <p className="text-[10px] font-bold text-darkerBlue uppercase tracking-widest mb-1 text-center">Calendario Interactivo</p>
             <p className="text-[9px] text-brand-600 text-center">Haz clic en los días marcados para ver el detalle de actividades.</p>
          </div>
        </div>
      </Card>

      <Modal 
        open={modalOpen} 
        onClose={() => setModalOpen(false)}
        title={`Actividades del ${selectedDay?.date?.toLocaleDateString()}`}
        subtitle={`${selectedDay?.events?.length || 0} actividades pendientes`}
      >
        <div className="space-y-3">
          {selectedDay?.events?.map((e, i) => (
            <div key={i} className="flex items-center justify-between p-4 rounded-2xl bg-slate-50 border border-slate-100 group hover:border-indigo-200 transition-all">
              <div className="flex items-center gap-3">
                <div className="w-1.5 h-10 bg-indigo-400 rounded-full"></div>
                <div>
                  <p className="text-sm font-bold text-slate-800 leading-none mb-1">{e.title}</p>
                  <p className="text-[11px] text-slate-400 font-medium italic">Vence hoy</p>
                </div>
              </div>
              <Btn size="sm" variant="ghost" onClick={() => handleNavigate(e)}>
                Ver actividad <ChevronRight size={14} />
              </Btn>
            </div>
          ))}
        </div>
      </Modal>
    </>
  )
}

// ─── Paleta de colores institucional ─────────────────────────────────────────
const PALETTE = {
  aprobado:  '#10b981',
  reprobado: '#f43f5e',
  info:      '#6366f1',
  warning:   '#f59e0b',
  neutral:   '#94a3b8',
}

const TIPO_LABEL = {
  EXAMEN: 'Examen', TAREA: 'Tarea', PROYECTO: 'Proyecto',
  PRACTICA_LAB: 'Práctica Lab', FORO: 'Foro',
  PARTICIPACION: 'Participación', ASISTENCIA: 'Asistencia',
}

// ─── Tooltip común para Nivo ──────────────────────────────────────────────────
const NivoTooltip = ({ value, label, color }) => (
  <div className="bg-white shadow-xl rounded-xl px-4 py-2 text-sm border border-slate-100">
    <span className="font-bold" style={{ color }}>{label}: </span>
    <span className="text-slate-700">{value}</span>
  </div>
)

// =============================================================================
// DASHBOARD ADMIN
// =============================================================================
function AdminDashboard() {
  const [stats, setStats] = useState(null)
  const [loading, setLoading] = useState(true)
  const [exporting, setExporting] = useState(false)

  useEffect(() => {
    dashboardApi.admin().then(res => {
      setStats(res.data)
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [])

  const handleExportPDF = async () => {
    setExporting(true)
    try {
      const detailed = await dashboardApi.detalle()
      generarReporteAcademico(stats, detailed.data)
    } catch (err) {
      console.error('Error exportando PDF:', err)
    } finally {
      setExporting(false)
    }
  }

  if (loading) return <Spinner />
  if (!stats) return <div className="p-8 text-center text-slate-500">Error al cargar estadísticas.</div>

  const global = stats.globales || {}

  // Pie chart aprobados/reprobados
  const pieData = [
    { id: 'Aprobados', label: 'Aprobados', value: global.aprobados || 0, color: PALETTE.aprobado },
    { id: 'Reprobados', label: 'Reprobados', value: global.reprobados || 0, color: PALETTE.reprobado },
  ]

  // Bar chart distribución (rango 0-100)
  const barDistribucion = (stats.distribucion || []).map(d => ({
    rango: `${d.rango_inicio}-${d.rango_inicio + 9}`,
    Cantidad: d.cantidad,
    color: d.rango_inicio >= 70 ? PALETTE.aprobado : PALETTE.reprobado,
  }))

  // Bar chart eficiencia docentes
  const barDocentes = (stats.eficiencia_docentes || []).map(d => ({
    docente: d.docente.split(' ')[0],  // primer nombre
    'Eficiencia %': d.eficiencia_pct,
    'Promedio': d.promedio_promedio,
  }))

  return (
    <div className="p-8 space-y-8 max-w-7xl mx-auto">
      {/* Acción PDF */}
      <div className="flex justify-end">
        <button
          onClick={handleExportPDF}
          disabled={exporting}
          className="flex items-center gap-2 px-6 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold shadow-lg shadow-indigo-200 transition-all disabled:opacity-50"
        >
          {exporting ? <Spinner size="sm" color="white" /> : <Download size={18} />}
          {exporting ? 'Generando...' : 'Reporte PDF'}
        </button>
      </div>

      {/* KPIs Principales */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatCard label="Promedio General" value={global.promedio_general?.toFixed(1) ?? '—'}
          icon={Target} color="institucional-dark"
          badge={<span className="text-xs font-bold text-yellow-500 bg-white/10 px-2 py-0.5 rounded-full">META: 70.0</span>}
        />
        <StatCard label="Tasa Reprobación" value={`${global.tasa_reprobacion_pct ?? 0}%`}
          icon={TrendingDown} color="institucional"
          badge={<span className="text-xs font-bold text-rose-600 bg-rose-50 px-2 py-0.5 rounded-full">{global.reprobados ?? 0} reprobados</span>}
        />
        <StatCard label="Mediana Institucional" value={global.mediana?.toFixed(1) ?? '—'}
          icon={Activity} color="institucional"
          badge={<span className="text-xs font-bold text-darkerBlue bg-brand-50 px-2 py-0.5 rounded-full">σ={global.desviacion_estandar?.toFixed(2) ?? '—'}</span>}
        />
        <StatCard label="Total Estudiantes" value={global.total_estudiantes ?? 0}
          icon={Users} color="institucional"
          badge={<span className="text-xs font-bold text-darkerBlue bg-brand-50 px-2 py-0.5 rounded-full">{stats.totales?.grupos_activos} grupos activos</span>}
        />
      </div>

      {/* Gráficas Nivo: Distribución + Pie */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <Card className="p-6 rounded-3xl">
          <h3 className="font-bold text-slate-800 mb-4 flex items-center gap-2">
            <BarChart2 size={20} className="text-indigo-500" /> Distribución de Calificaciones
          </h3>
          <div style={{ height: 280 }}>
            <ResponsiveBar
              data={barDistribucion}
              keys={['Cantidad']}
              indexBy="rango"
              margin={{ top: 10, right: 10, bottom: 40, left: 40 }}
              padding={0.35}
              colors={({ data }) => data.color}
              borderRadius={6}
              axisBottom={{ tickSize: 0, tickPadding: 8, tickRotation: -20 }}
              axisLeft={{ tickSize: 0, tickPadding: 8 }}
              enableGridX={false}
              gridYValues={5}
              tooltip={({ data, value }) => (
                <NivoTooltip value={value} label={data.rango} color={data.color} />
              )}
              animate
              theme={{ fontFamily: 'inherit', fontSize: 12 }}
            />
          </div>
        </Card>

        <Card className="p-6 rounded-3xl">
          <h3 className="font-bold text-slate-800 mb-4 flex items-center gap-2">
            <Target size={20} className="text-indigo-500" /> Aprobados vs Reprobados
          </h3>
          <div style={{ height: 280 }}>
            <ResponsivePie
              data={pieData}
              margin={{ top: 20, right: 80, bottom: 20, left: 80 }}
              innerRadius={0.65}
              padAngle={2}
              cornerRadius={6}
              colors={({ data }) => data.color}
              borderWidth={0}
              enableArcLinkLabels
              arcLinkLabelsSkipAngle={10}
              arcLinkLabelsTextColor="#334155"
              arcLinkLabelsThickness={2}
              arcLinkLabelsColor={{ from: 'color' }}
              arcLabelsSkipAngle={10}
              arcLabelsTextColor="#fff"
              tooltip={({ datum }) => (
                <NivoTooltip value={datum.value} label={datum.label} color={datum.color} />
              )}
              theme={{ fontFamily: 'inherit', fontSize: 12 }}
            />
          </div>
        </Card>
      </div>

      {/* Eficiencia Docentes + Materias Críticas */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <Card className="p-6 rounded-3xl">
          <h3 className="font-bold text-slate-800 mb-4 flex items-center gap-2">
            <Award size={20} className="text-amber-500" /> Eficiencia por Docente
          </h3>
          <div style={{ height: 260 }}>
            <ResponsiveBar
              data={barDocentes}
              keys={['Eficiencia %']}
              indexBy="docente"
              margin={{ top: 10, right: 10, bottom: 40, left: 50 }}
              padding={0.35}
              colors={[PALETTE.info]}
              borderRadius={6}
              maxValue={100}
              axisLeft={{ tickSize: 0, tickPadding: 8 }}
              axisBottom={{ tickSize: 0, tickPadding: 8 }}
              enableGridX={false}
              gridYValues={5}
              tooltip={({ data, value }) => (
                <NivoTooltip value={`${value}%`} label={data.docente} color={PALETTE.info} />
              )}
              theme={{ fontFamily: 'inherit', fontSize: 12 }}
            />
          </div>
        </Card>

        <Card className="p-6 rounded-3xl">
          <h3 className="font-bold text-slate-800 mb-4 flex items-center gap-2">
            <AlertTriangle size={20} className="text-rose-500" /> Materias con Mayor Reprobación
          </h3>
          <div className="space-y-3">
            {(stats.por_materia || []).slice(0, 5).map((m, i) => (
              <div key={i} className="p-3 rounded-2xl bg-slate-50 border border-slate-100">
                <div className="flex justify-between items-center mb-1.5">
                  <div>
                    <p className="font-bold text-slate-900 text-sm">{m.materia}</p>
                    <p className="text-xs text-slate-500">{m.docente} • {m.grupo}</p>
                  </div>
                  <div className="text-right">
                    <p className={`text-lg font-black ${(m.tasa_reprobacion_pct || 0) > 30 ? 'text-rose-600' : 'text-amber-600'}`}>
                      {m.tasa_reprobacion_pct ?? '—'}%
                    </p>
                    <p className="text-xs text-slate-400">{m.reprobados} reprobados</p>
                  </div>
                </div>
                <div className="w-full h-1.5 bg-slate-200 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full ${(m.tasa_reprobacion_pct || 0) > 30 ? 'bg-rose-500' : 'bg-amber-400'}`}
                    style={{ width: `${Math.min(m.tasa_reprobacion_pct || 0, 100)}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>

      {/* Inventario del sistema */}
      <Card className="p-6 rounded-3xl">
        <h3 className="font-bold text-slate-800 mb-6 flex items-center gap-2">
          <ClipboardList size={20} className="text-indigo-500" /> Inventario del Sistema
        </h3>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-6">
          {[
            { label: 'Alumnos activos', value: stats.totales?.alumnos, icon: GraduationCap, color: 'indigo' },
            { label: 'Docentes activos', value: stats.totales?.docentes, icon: Users, color: 'violet' },
            { label: 'Materias activas', value: stats.totales?.materias, icon: BookOpen, color: 'emerald' },
            { label: 'Grupos totales', value: stats.totales?.grupos, icon: FileText, color: 'amber' },
          ].map(({ label, value, icon: Icon, color }) => (
            <div key={label} className={`flex items-center gap-4 p-4 rounded-2xl bg-${color}-50`}>
              <div className={`p-3 bg-${color}-100 rounded-xl`}><Icon className={`text-${color}-600`} size={22} /></div>
              <div>
                <p className="text-2xl font-black text-slate-900">{value ?? '—'}</p>
                <p className="text-xs text-slate-500 font-medium">{label}</p>
              </div>
            </div>
          ))}
        </div>
      </Card>
    </div>
  )
}

// =============================================================================
// DASHBOARD DOCENTE — KPIs de rendimiento relativo con Nivo
// =============================================================================
function DocenteDashboard() {
  const [stats, setStats] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    dashboardApi.docente().then(res => {
      setStats(res.data)
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [])

  if (loading) return <Spinner />
  if (!stats) return <div className="p-8 text-center text-slate-500">Error al cargar estadísticas del docente.</div>

  const kpis = stats.kpis || []
  const pendientes = stats.pendientes || []
  const totalAlumnos = kpis.reduce((a, g) => a + (g.total_alumnos || 0), 0)

  const barKpi = kpis.map(g => ({
    grupo: g.grupo,
    'Mi Grupo': g.promedio_grupo ?? 0,
    'Media Materia': g.promedio_materia ?? 0,
  }))

  return (
    <div className="p-8 space-y-6 max-w-7xl mx-auto">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
        <StatCard label="Mis Grupos" value={kpis.length} icon={BookOpen} color="institucional-dark" />
        <StatCard label="Total Alumnos" value={totalAlumnos} icon={Users} color="institucional" />
        <StatCard label="Capturas Pendientes" value={pendientes.length} icon={Clock} color="institucional" />
      </div>

      {/* Rendimiento comparativo */}
      {kpis.length > 0 && (
        <Card className="p-6 rounded-3xl">
          <h3 className="font-bold text-slate-800 mb-4 flex items-center gap-2">
            <TrendingUp size={20} className="text-indigo-500" /> Mi Grupo vs. Media de la Materia
          </h3>
          <div style={{ height: 280 }}>
            <ResponsiveBar
              data={barKpi}
              keys={['Mi Grupo', 'Media Materia']}
              indexBy="grupo"
              groupMode="grouped"
              margin={{ top: 10, right: 120, bottom: 40, left: 50 }}
              padding={0.3}
              colors={[PALETTE.info, PALETTE.neutral]}
              borderRadius={5}
              maxValue={100}
              axisLeft={{ tickSize: 0, tickPadding: 8 }}
              axisBottom={{ tickSize: 0, tickPadding: 8 }}
              enableGridX={false}
              legends={[{
                dataFrom: 'keys', anchor: 'bottom-right', direction: 'column',
                justify: false, translateX: 120, translateY: 0,
                itemWidth: 100, itemHeight: 20, symbolSize: 12, symbolShape: 'circle',
              }]}
              tooltip={({ id, value, indexValue }) => (
                <NivoTooltip value={value?.toFixed(1)} label={`${indexValue} — ${id}`} color={id === 'Mi Grupo' ? PALETTE.info : PALETTE.neutral} />
              )}
              theme={{ fontFamily: 'inherit', fontSize: 12 }}
            />
          </div>
        </Card>
      )}

      {/* Detalle de grupos */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
            <Card className="p-6 rounded-3xl">
            <h3 className="font-bold text-slate-800 mb-4">Mis Grupos</h3>
            <div className="space-y-3">
                {kpis.map(g => (
                <div key={g.grupo_id} className="p-4 rounded-2xl bg-slate-50 border border-slate-100">
                    <div className="flex justify-between items-start mb-2">
                    <div>
                        <p className="font-bold text-slate-900">{g.grupo}</p>
                        <p className="text-xs text-slate-500">{g.materia} • {g.periodo}</p>
                    </div>
                    <div className="text-right">
                        <span className={`text-lg font-black ${
                        g.rendimiento_relativo === 'SOBRE_PROMEDIO' ? 'text-emerald-600' :
                        g.rendimiento_relativo === 'BAJO_PROMEDIO'  ? 'text-rose-600' : 'text-indigo-600'
                        }`}>{g.promedio_grupo?.toFixed(1) ?? '—'}</span>
                        <p className="text-xs text-slate-400">
                        {g.diferencia_vs_materia != null
                            ? `${g.diferencia_vs_materia > 0 ? '+' : ''}${g.diferencia_vs_materia} vs materia`
                            : 'Sin datos comparativos'}
                        </p>
                    </div>
                    </div>
                    <div className="flex gap-3 text-xs">
                    <span className="text-emerald-600 font-semibold">✓ {g.aprobados ?? 0} aprob.</span>
                    <span className="text-rose-600 font-semibold">✗ {g.reprobados ?? 0} reprob.</span>
                    <span className="text-indigo-500 font-semibold ml-auto">ET: {g.eficiencia_terminal_pct ?? '—'}%</span>
                    </div>
                </div>
                ))}
                {kpis.length === 0 && <p className="text-slate-500 text-sm text-center py-4">Sin grupos activos.</p>}
            </div>
            </Card>

            <Card className="p-6 rounded-3xl">
            <h3 className="font-bold text-slate-800 mb-4">Capturas Pendientes</h3>
            {pendientes.length === 0 ? (
                <div className="text-center py-8">
                <div className="inline-flex p-3 bg-emerald-50 text-emerald-600 rounded-full mb-3"><CheckCircle size={24} /></div>
                <p className="text-sm text-slate-500 font-medium">¡Todo al día!</p>
                </div>
            ) : (
                <div className="space-y-3">
                {pendientes.map((p, i) => (
                    <div key={i} className="p-4 rounded-2xl bg-amber-50 border border-amber-100">
                    <div className="flex justify-between items-start">
                        <div className="flex items-center gap-3">
                        <div className="p-2 bg-amber-100 text-amber-600 rounded-xl"><Clock size={16} /></div>
                        <div>
                            <p className="text-sm font-bold text-amber-900">{p.unidad}</p>
                            <p className="text-xs text-amber-700">{p.grupo}</p>
                        </div>
                        </div>
                        <div className="text-right text-xs">
                        <p className={`font-bold ${p.estructura_completa ? 'text-emerald-600' : 'text-rose-600'}`}>
                            {p.suma_ponderaciones?.toFixed(1) ?? 0}% config.
                        </p>
                        {p.calificaciones_pendientes > 0 && (
                            <p className="text-amber-700">{p.calificaciones_pendientes} cal. pendientes</p>
                        )}
                        </div>
                    </div>
                    </div>
                ))}
                </div>
            )}
            </Card>
        </div>

        <div className="lg:col-span-1">
            <CalendarSection events={stats.actividades_cercanas || []} title="Actividades del Docente" />
        </div>
      </div>
    </div>
  )
}

// =============================================================================
// DASHBOARD ALUMNO — posicionamiento + en curso
// =============================================================================
function AlumnoDashboard() {
  const [stats, setStats] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    dashboardApi.alumno().then(res => {
      setStats({ posicionamiento: [], en_curso: [], ...res.data })
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [])

  if (loading) return <Spinner />
  if (!stats) return <div className="p-8 text-center text-slate-500">Error al cargar estadísticas.</div>

  const posic = stats.posicionamiento || []
  const enCurso = stats.en_curso || []

  const promedioFinal = posic.length > 0
    ? (posic.reduce((a, c) => a + (c.resultado_final || 0), 0) / posic.length).toFixed(1)
    : '—'

  return (
    <div className="p-8 space-y-6 max-w-7xl mx-auto">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
        <StatCard label="Materias Finalizadas" value={posic.length} icon={CheckCircle} color="white" />
        <StatCard label="En Curso" value={enCurso.length} icon={Clock} color="white" />
        <StatCard label="Promedio Histórico" value={promedioFinal} icon={Star} color="white" />
      </div>

      {/* Materias finalizadas con posicionamiento */}
      {posic.length > 0 && (
        <Card className="p-6 rounded-3xl">
          <h3 className="font-bold text-slate-800 mb-4 flex items-center gap-2">
            <ShieldCheck size={20} className="text-indigo-500" /> Mi Posición en el Grupo
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {posic.map((c, i) => (
              <div key={i} className={`p-5 rounded-2xl border ${c.estatus === 'APROBADO' ? 'bg-emerald-50 border-emerald-100' : 'bg-rose-50 border-rose-100'}`}>
                <div className="flex justify-between items-start mb-3">
                  <div>
                    <p className="font-bold text-slate-900">{c.materia}</p>
                    <p className="text-xs text-slate-500">{c.grupo} • {c.periodo}</p>
                  </div>
                  <span className={`text-[10px] font-black px-2 py-1 rounded-full ${c.estatus === 'APROBADO' ? 'bg-emerald-200 text-emerald-800' : 'bg-rose-200 text-rose-800'}`}>
                    {c.estatus}
                  </span>
                </div>
                <div className="flex items-end justify-between">
                  <div>
                    <p className={`text-3xl font-black ${c.estatus === 'APROBADO' ? 'text-emerald-700' : 'text-rose-700'}`}>
                      {c.resultado_final?.toFixed(1)}
                    </p>
                    <p className="text-xs text-slate-500">Media del grupo: {c.promedio_grupo?.toFixed(1)}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs font-bold text-slate-700">Pos. #{c.posicion_grupo} / {c.total_alumnos}</p>
                    <p className={`text-xs font-semibold ${c.diferencia_vs_media >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                      {c.diferencia_vs_media > 0 ? '+' : ''}{c.diferencia_vs_media?.toFixed(1)} vs media
                    </p>
                    <p className="text-xs text-indigo-600 font-bold">Top {c.percentil_superior}%</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Materias en curso + Calendario */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
            <Card className="p-6 rounded-3xl">
            <h3 className="font-bold text-slate-800 mb-4">Materias en Curso</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {enCurso.map((c, i) => (
                <div key={i} className="p-5 rounded-2xl bg-indigo-50 border border-indigo-100">
                    <div className="flex justify-between items-start mb-2">
                    <p className="font-bold text-slate-900">{c.materia}</p>
                    <span className="text-[10px] font-black px-2 py-1 rounded-full bg-indigo-200 text-indigo-800">EN CURSO</span>
                    </div>
                    <p className="text-xs text-slate-500 mb-3">{c.periodo}</p>
                    <div className="flex items-center justify-between">
                    <div>
                        <p className="text-2xl font-black text-indigo-700">
                        {c.resultado_estimado != null ? c.resultado_estimado?.toFixed(1) : '—'}
                        </p>
                        <p className="text-xs text-slate-500">Resultado estimado</p>
                    </div>
                    <div className="text-right text-xs text-slate-500">
                        <p>{c.unidades_con_result ?? 0} / {c.unidades_totales ?? '?'} unidades</p>
                    </div>
                    </div>
                </div>
                ))}
            </div>
            </Card>
        </div>

        <div className="lg:col-span-1">
            <CalendarSection 
                events={stats.actividades_cercanas || []} 
                title="Calendario Académico" 
            />
        </div>
      </div>
    </div>
  )
}

// =============================================================================
// PÁGINA PRINCIPAL
// =============================================================================
export default function Dashboard() {
  const { user, isAdmin, isDocente, isAlumno } = useAuth()

  return (
    <div className="bg-slate-50/50 min-h-screen pb-20">
      <div className="">
        <PageHeader
          title={`Buen día, ${user?.nombre || 'Usuario'}`}
          subtitle="Análisis académico y gestión de resultados"
        />
      </div>
      <div className="animate-in fade-in slide-in-from-bottom-4 duration-700">
        {isAdmin   && <AdminDashboard />}
        {isDocente && <DocenteDashboard />}
        {isAlumno  && <AlumnoDashboard />}
      </div>
    </div>
  )
}
