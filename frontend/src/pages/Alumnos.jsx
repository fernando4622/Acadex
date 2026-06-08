import { useState, useEffect, useRef } from 'react'
import { alumnos as alumnosApi, carreras as carrerasApi, periodos as periodosApi, resultados as resultadosApi } from '../api/endpoints'
import { PageHeader } from '../components/layout/Layout'
import {
  Card, Btn, Input, Modal, Table, Badge,
  SearchInput, ErrorMsg, Toast, EmptyState, ConfirmDialog, Spinner, StatCard, Select,
  Dropdown, DropdownItem, Drawer
} from '../components/ui'
import { Plus, Edit2, GraduationCap, Mail, Hash, Upload, Download, CheckCircle2, Copy, AlertTriangle, FileSpreadsheet, UserX, UserCheck, ChevronRight, ChevronDown, ChevronUp, BarChart2, User, BookOpen, TrendingUp } from 'lucide-react'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, AreaChart, Area } from 'recharts'

// ═══════════════════════════════════════════════════════════════════════════
// COMPONENTES EXTRAÍDOS
// ═══════════════════════════════════════════════════════════════════════════

/** Panel de Auditoría Detallada de Unidad */
function AuditPanelUnidad({ panelUnidad, dataPanelUnidad, loadingPanel }) {
  if (!panelUnidad) return null

  // Filtramos las actividades. Inspeccionamos la estructura.
  console.log('dataPanelUnidad:', dataPanelUnidad);
  const actividadesValidas = dataPanelUnidad?.actividades || []

  return (
    <div className="space-y-6 animate-fade-in p-2">
      {/* Log de depuración para inspeccionar las actividades */}
      {console.log('Actividades auditadas:', actividadesValidas)}
      
      {/* Cabecera de Resumen */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-slate-50 p-5 rounded-2xl border border-slate-100">
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Estudiante</p>
          <p className="font-bold text-slate-900 text-lg">{panelUnidad.info.alumno}</p>
          <p className="text-xs font-mono text-slate-500">{panelUnidad.info.no_control}</p>
        </div>
        <div className="bg-slate-50 p-5 rounded-2xl border border-slate-100">
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Materia / Unidad</p>
          <p className="font-bold text-slate-900 text-sm">{panelUnidad.info.materia}</p>
          <p className="text-xs text-brand-600 font-medium">{panelUnidad.info.unidad_nombre}</p>
        </div>
        <div className="bg-brand-50 p-5 rounded-2xl border border-brand-100 text-right">
          <p className="text-[10px] font-black text-brand-600 uppercase tracking-widest">Calificación Final</p>
          <p className="text-4xl font-black text-brand-900 tabular-nums">
            {dataPanelUnidad?.resultado_final != null ? dataPanelUnidad.resultado_final.toFixed(1) : '0.0'}
          </p>
        </div>
      </div>

      {/* Tabla de Desglose */}
      <div className="bg-white rounded-2xl border border-slate-100 overflow-hidden shadow-sm">
        <div className="px-5 py-4 border-b border-slate-100">
          <h4 className="text-xs font-black text-slate-700 uppercase tracking-widest">Desglose de Actividades</h4>
        </div>
        {loadingPanel ? (
          <div className="py-20 flex justify-center"><Spinner /></div>
        ) : actividadesValidas.length > 0 ? (
          <table className="w-full text-sm text-left">
            <thead className="bg-slate-50 text-slate-500 text-[10px] uppercase font-black">
              <tr>
                <th className="px-6 py-3">Actividad</th>
                <th className="px-6 py-3">Tipo</th>
                <th className="px-6 py-3 text-center">Peso (%)</th>
                <th className="px-6 py-3 text-center">Calificación</th>
                <th className="px-6 py-3 text-right">Aportación</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {actividadesValidas.map((act, i) => {
                console.log('Fila de actividad (depuración):', act);
                return (
                  <tr key={i} className="hover:bg-slate-50/50 transition-colors">
                    <td className="px-6 py-4 font-bold text-slate-700">{act.descripcion || 'Sin descripción'}</td>
                    <td className="px-6 py-4">
                      <Badge>
                        {act.tipo_nombre || 'Sin tipo'}
                      </Badge>
                    </td>
                    <td className="px-6 py-4 text-center font-mono text-slate-600">{act.valor_maximo}%</td>
                    <td className="px-6 py-4 text-center font-black text-brand-600 text-lg">
                      {act.calificacion != null ? act.calificacion.toFixed(1) : '0.0'}
                    </td>
                    <td className="px-6 py-4 text-right font-bold text-slate-800">
                      {((act.calificacion || 0) * (act.valor_maximo / 100)).toFixed(2)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        ) : (
          <div className="p-12"><EmptyState icon={BookOpen} title="Sin actividades" description="No hay detalle de actividades para esta unidad." /></div>
        )}
      </div>
    </div>
  )
}

/** KPIs del período seleccionado */
function TrayectoriaStats({ dataAnalytics, filtroPeriodoDrawer }) {
  const hist = dataAnalytics?.historial || []
  const filteredHist = filtroPeriodoDrawer === 'ALL' ? hist : hist.filter(h => h.periodo_id?.toString() === filtroPeriodoDrawer)
  const stats = filteredHist.length > 0 ? {
    promedio: filteredHist.reduce((acc, h) => acc + (h.promedio || 0), 0) / filteredHist.length,
    aprobadas: filteredHist.reduce((acc, h) => acc + (h.materias_aprobadas || 0), 0),
    totales: filteredHist.reduce((acc, h) => acc + (h.materias_totales || 0), 0)
  } : { promedio: 0, aprobadas: 0, totales: 0 }

  return (
    <div className="grid grid-cols-2 gap-4">
      <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100">
        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Promedio {filtroPeriodoDrawer === 'ALL' ? 'General' : 'del Periodo'}</p>
        <p className="text-3xl font-black text-darkerBlue tabular-nums">{stats.promedio.toFixed(1)}</p>
      </div>
      <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100">
        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Materias Aprobadas</p>
        <p className="text-3xl font-black text-darkerBlue tabular-nums">{stats.aprobadas} / {stats.totales}</p>
      </div>
    </div>
  )
}

/** Gráfico de progreso de calificaciones */
function TrayectoriaChart({ dataAnalytics, filtroPeriodoDrawer }) {
  const filteredData = filtroPeriodoDrawer === 'ALL' ?
    dataAnalytics?.historial :
    dataAnalytics?.historial?.filter(h => h.periodo_id?.toString() === filtroPeriodoDrawer)

  return (
    <div className="space-y-3">
      <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest flex items-center gap-2">
        <BarChart2 size={14} /> Progreso de Calificaciones
      </h3>
      <div className="h-[250px] w-full bg-white rounded-2xl border border-slate-100 p-4 shadow-sm">
        {filteredData?.length > 0 ? (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={filteredData}>
              <defs>
                <linearGradient id="colorProm" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#1e293b" stopOpacity={0.1} />
                  <stop offset="95%" stopColor="#1e293b" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
              <XAxis dataKey="periodo" axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#94a3b8' }} dy={10} />
              <YAxis domain={[0, 100]} axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#94a3b8' }} />
              <Tooltip contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)', fontSize: '12px' }} />
              <Area type="monotone" dataKey="promedio" stroke="#1e293b" strokeWidth={3} fillOpacity={1} fill="url(#colorProm)" />
            </AreaChart>
          </ResponsiveContainer>
        ) : (
          <div className="h-full flex flex-col items-center justify-center text-slate-400">
            <BookOpen size={32} className="opacity-20 mb-2" />
            <p className="text-xs font-medium">Sin datos para la gráfica en este periodo</p>
          </div>
        )}
      </div>
    </div>
  )
}

/** Historial detallado por periodo */
function KardexHistorial({ dataKardex, filtroPeriodoDrawer, modalEdit, expandedKardex, desgloseKardex,
  toggleKardexExpand, setPanelUnidad, setLoadingPanel, setDataPanelUnidad, resultadosApi }) {
  const gruposPorPeriodo = dataKardex?.periodos
    ?.filter(p => filtroPeriodoDrawer === 'ALL' || p.id?.toString() === filtroPeriodoDrawer)
    ?.map(p => ({
      ...p,
      grupos: dataKardex.grupos.filter(g => g.periodo_id === p.id),
    })).filter(p => p.grupos.length > 0) || []

  // Promedio general: solo si TODOS los grupos visibles tienen resultado_final > 0
  const todosGrupos = gruposPorPeriodo.flatMap(p => p.grupos)
  const todosConCalifGeneral = todosGrupos.length > 0 && todosGrupos.every(g => g.resultado_final > 0)
  const promedioGeneral = todosConCalifGeneral
    ? todosGrupos.reduce((acc, g) => acc + g.resultado_final, 0) / todosGrupos.length
    : null

  if (gruposPorPeriodo.length === 0) {
    return <EmptyState icon={FileSpreadsheet} title="Sin historial" description="El alumno no tiene materias registradas." />
  }

  return (
    <div className="space-y-4">
      <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest px-1">Historial Detallado</h3>

      {/* Promedio general en el body — solo cuando TODAS las materias tienen calificación */}
      <div className="flex items-center justify-between bg-indigo-50 border border-indigo-100 rounded-2xl px-5 py-4 shadow-sm">
        <div>
          <p className="text-[10px] font-black text-indigo-400 uppercase tracking-widest mb-0.5">
            {filtroPeriodoDrawer === 'ALL' ? 'Promedio General' : 'Promedio del Periodo'}
          </p>
          <p className="text-xs text-indigo-500 font-medium">
            {todosConCalifGeneral ? 'Todas las materias calificadas' : 'Pendiente de cierre completo'}
          </p>
        </div>
        {promedioGeneral !== null ? (
          <span className={`text-3xl font-black tabular-nums tracking-tighter ${promedioGeneral >= 70 ? 'text-emerald-600' : 'text-rose-500'}`}>
            {promedioGeneral.toFixed(1)}
          </span>
        ) : (
          <span className="text-xl font-bold text-slate-400">Pendiente</span>
        )}
      </div>

      {gruposPorPeriodo.map(periodo => {
        // Promedio del periodo: solo si TODAS sus materias tienen resultado_final > 0
        const todosConCalif = periodo.grupos.every(g => g.resultado_final > 0)
        const promPeriodo = todosConCalif
          ? periodo.grupos.reduce((acc, g) => acc + g.resultado_final, 0) / periodo.grupos.length
          : null

        return (
          <div key={periodo.id} className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
            {/* Header: solo nombre y badge "Actual" */}
            <div className="px-5 py-3 bg-slate-50/80 border-b border-slate-100 flex justify-between items-center">
              <h3 className="font-bold text-slate-800 text-sm">
                {periodo.nombre} <span className="text-slate-400 font-medium text-xs ml-1">({periodo.codigo})</span>
              </h3>
              {periodo.estado === 'activo' && (
                <span className="text-[9px] font-black text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded uppercase tracking-wider">Actual</span>
              )}
            </div>

            {/* Lista de materias */}
            <div className="divide-y divide-slate-50">
              {periodo.grupos.map(g => (
                <div key={g.inscripcion_id || g.id}>
                  <button
                    onClick={() => toggleKardexExpand(g.inscripcion_id)}
                    className="w-full flex items-center justify-between px-5 py-3 hover:bg-slate-50/50 transition"
                  >
                    <div className="flex items-center gap-3">
                      <BookOpen size={16} className="text-brand-400" />
                      <div className="text-left">
                        <p className="text-sm font-semibold text-slate-800">{g.materia || g.nombre}</p>
                        <p className="text-[10px] text-slate-400">{g.nombre}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-4">
                      <span className="text-sm font-black">{g.resultado_final > 0 ? g.resultado_final.toFixed(1) : '—'}</span>
                      {expandedKardex === g.inscripcion_id
                        ? <ChevronUp size={16} className="text-slate-400" />
                        : <ChevronDown size={16} className="text-slate-400" />}
                    </div>
                  </button>

                  {expandedKardex === g.inscripcion_id && desgloseKardex && (
                    <div className="px-5 pb-3">
                      {desgloseKardex.unidades?.map(u => (
                        <div
                          key={u.unidad_id}
                          className="flex items-center justify-between p-2 text-xs hover:bg-brand-50 rounded-lg cursor-pointer transition"
                          onClick={() => {
                            setPanelUnidad({
                              inscripcion_id: g.inscripcion_id,
                              unidad_id: u.unidad_id,
                              info: {
                                alumno: `${modalEdit.nombre} ${modalEdit.apellido_pat}`,
                                no_control: modalEdit.no_control,
                                materia: g.materia || g.nombre,
                                unidad_nombre: `Unidad ${u.numero}: ${u.nombre}`
                              }
                            })
                            setLoadingPanel(true)
                            resultadosApi.actividades(g.inscripcion_id, u.unidad_id)
                              .then(r => setDataPanelUnidad(r.data))
                              .catch(() => setDataPanelUnidad({ error: true }))
                              .finally(() => setLoadingPanel(false))
                          }}
                        >
                          <span className="font-bold text-slate-700">Unidad {u.numero}: {u.nombre}</span>
                          <span className="font-black text-brand-600">
                            {u.resultado_final?.toFixed(1) || u.resultado_unidad?.toFixed(1) || '—'}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>

            {/* Pie de la tarjeta: promedio del periodo en el body, "Pendiente" si falta alguna calificación */}
            <div className="px-5 py-3 border-t border-slate-100 bg-slate-50/40 flex items-center justify-between">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Promedio del Periodo</span>
              {promPeriodo !== null ? (
                <span className={`text-xl font-black tabular-nums ${promPeriodo >= 70 ? 'text-emerald-600' : 'text-rose-500'}`}>
                  {promPeriodo.toFixed(1)}
                </span>
              ) : (
                <span className="text-sm font-bold text-slate-400">Pendiente</span>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════
// COMPONENTE PRINCIPAL
// ═══════════════════════════════════════════════════════════════════════════

export default function Alumnos() {
  const [lista, setLista] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [selectedCarrera, setSelectedCarrera] = useState('all')
  const [toast, setToast] = useState(null)
  const [error, setError] = useState(null)
  const [saving, setSaving] = useState(false)
  const [opts, setOpts] = useState({ carreras: [] })

  // Modals
  const [modalCreate, setModalCreate] = useState(false)
  const [modalEdit, setModalEdit] = useState(null)
  const [modalCreds, setModalCreds] = useState(null)
  const [panelUnidad, setPanelUnidad] = useState(null)
  const [dataPanelUnidad, setDataPanelUnidad] = useState(null)
  const [loadingPanel, setLoadingPanel] = useState(false)
  const [modalCSV, setModalCSV] = useState(false)
  const [confirmBaja, setConfirmBaja] = useState(null)
  const [activeTab, setActiveTab] = useState('general')
  const [filtroPeriodoDrawer, setFiltroPeriodoDrawer] = useState('ALL')
  const [dataAnalytics, setDataAnalytics] = useState(null)
  const [dataKardex, setDataKardex] = useState(null)
  const [expandedKardex, setExpandedKardex] = useState(null)
  const [desgloseKardex, setDesgloseKardex] = useState(null)

  // Create form
  const emptyForm = {
    nombre: '', apellido_pat: '', apellido_mat: '', fecha_nacimiento: '', curp: '', carrera_id: '',
    registro_manual: false, no_control: '', email: ''
  }
  const [formCreate, setFormCreate] = useState(emptyForm)

  // CSV
  const [csvFile, setCsvFile] = useState(null)
  const [csvPreview, setCsvPreview] = useState(null)
  const [csvLoading, setCsvLoading] = useState(false)
  const [csvResult, setCsvResult] = useState(null)
  const fileRef = useRef(null)

  const [openActivos, setOpenActivos] = useState(true)
  const [openInactivos, setOpenInactivos] = useState(false)

  const notify = (msg, type = 'success') => {
    setToast({ message: msg, type })
    setTimeout(() => setToast(null), 4000)
  }

  async function cargar() {
    try {
      const [rA, rC] = await Promise.all([alumnosApi.listar(), carrerasApi.listar()])
      const mapped = rA.data.map(a => ({ ...a, carrera_id: a.plan_estudio_id || a.carrera_id }))
      setLista(mapped)
      setOpts({ carreras: rC.data })
    }
    catch (e) { console.error('Error cargando alumnos:', e) }
    finally { setLoading(false) }
  }

  useEffect(() => { cargar() }, [])

  const normalize = (s) => s ? s.normalize('NFD').replace(/[\u0300-\u036f]/g, "").toLowerCase() : ""

  const filtrados = lista.filter(a => {
    const s = normalize(search).trim()
    const nombreCompleto = normalize(`${a.nombre} ${a.apellido_pat} ${a.apellido_mat || ''}`)
    const matchesSearch = normalize(a.no_control).includes(s) ||
      nombreCompleto.includes(s) ||
      normalize(a.curp).includes(s)
    const matchesCarrera = selectedCarrera === 'all' || a.carrera_id === selectedCarrera
    return matchesSearch && matchesCarrera
  })

  useEffect(() => {
    if (modalEdit) {
      setActiveTab('general')
      Promise.all([
        alumnosApi.historial(modalEdit.id),
        alumnosApi.kardexDetallado(modalEdit.id),
        periodosApi.listar()
      ]).then(([rHist, rKardex, rPer]) => {
        setDataAnalytics(rHist.data)
        setDataKardex({ grupos: rKardex.data, periodos: rPer.data })
      }).catch(console.error)
    } else {
      setDataAnalytics(null)
      setDataKardex(null)
      setExpandedKardex(null)
      setDesgloseKardex(null)
    }
  }, [modalEdit])

  const toggleKardexExpand = async (inscId) => {
    if (expandedKardex === inscId) {
      setExpandedKardex(null)
      setDesgloseKardex(null)
      return
    }
    setExpandedKardex(inscId)
    setDesgloseKardex(null)
    try {
      const r = await resultadosApi.desglose(inscId)
      setDesgloseKardex(r.data)
    } catch (e) {
      setDesgloseKardex({ error: true })
    }
  }

  const alumnosActivos = filtrados.filter(a => a.activo)
  const alumnosInactivos = filtrados.filter(a => !a.activo)

  // ── Crear ──
  async function crearAlumno(e) {
    e.preventDefault()
    setSaving(true)
    setError(null)
    try {
      const { data } = await alumnosApi.crear(formCreate)
      setModalCreate(false)
      setFormCreate(emptyForm)
      setModalCreds({
        nombre: `${data.nombre} ${data.apellido_pat}${data.apellido_mat ? ` ${data.apellido_mat}` : ''}`,
        no_control: data.no_control,
        username: data.username,
        email: data.email,
        nip_provisional: data.nip_provisional,
      })
      await cargar()
    } catch (err) {
      setError(err.response?.data || err)
    }
    finally { setSaving(false) }
  }

  // ── Editar ──
  async function actualizarAlumno(e) {
    e.preventDefault()
    setSaving(true)
    setError(null)
    try {
      await alumnosApi.actualizar(modalEdit.id, {
        nombre: modalEdit.nombre,
        apellido_pat: modalEdit.apellido_pat,
        apellido_mat: modalEdit.apellido_mat,
        curp: modalEdit.curp,
        semestre: modalEdit.semestre,
        fecha_nacimiento: modalEdit.fecha_nacimiento,
        plan_estudio_id: modalEdit.carrera_id,
        activo: modalEdit.activo
      })
      setModalEdit(null)
      await cargar()
      notify('Alumno actualizado')
    } catch (err) {
      setError(err)
    }
    finally { setSaving(false) }
  }

  // ── CSV Preview ──
  async function handleCSVPreview() {
    if (!csvFile) return
    setCsvLoading(true)
    setCsvPreview(null)
    setCsvResult(null)
    try {
      const { data } = await alumnosApi.previewCSV(csvFile)
      setCsvPreview(data)
    }
    catch {
      notify('Error al procesar CSV', 'error')
    }
    finally { setCsvLoading(false) }
  }

  // ── CSV Confirm ──
  async function handleCSVConfirm() {
    if (!csvFile) return
    setCsvLoading(true)
    try {
      const { data } = await alumnosApi.confirmarCSV(csvFile)
      setCsvResult(data)
      setCsvPreview(null)
      await cargar()
      if (data.importados > 0) {
        notify(`${data.importados} alumnos importados correctamente`)
      } else if (data.errores_count > 0) {
        notify('No se importó ningún alumno debido a errores', 'error')
      }
    } catch {
      notify('Error al importar', 'error')
    }
    finally { setCsvLoading(false) }
  }

  // ── Baja ──
  async function handleBaja(a) {
    setSaving(true)
    try {
      await alumnosApi.actualizar(a.id, { activo: !a.activo })
      await cargar()
      notify(a.activo ? 'Alumno dado de baja' : 'Alumno reactivado')
      setConfirmBaja(null)
    } catch {
      notify('Error al cambiar estado', 'error')
    }
    finally { setSaving(false) }
  }

  // ── CSV Download ──
  function downloadCSVResult() {
    if (!csvResult?.resultados?.length) return
    const header = 'no_control,email,nip_provisional,nombre,curp\n'
    const rows = csvResult.resultados.map(r =>
      `${r.no_control},${r.email},${r.password},"${r.nombre}","${r.curp || ''}"`
    ).join('\n')
    const blob = new Blob([header + rows], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'alumnos_importados.csv'
    a.click()
    URL.revokeObjectURL(url)
  }

  function copyText(text) {
    navigator.clipboard.writeText(text)
    notify('Copiado')
  }

  // Stats
  const totalActivos = lista.filter(a => a.activo).length
  const totalBaja = lista.filter(a => !a.activo).length

  // Table columns
  const cols = [
    {
      label: 'Alumno',
      render: (a) => (
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-darkerBlue flex items-center justify-center flex-shrink-0 shadow-sm">
            <span className="text-yellow-400 text-sm font-black uppercase">{a.nombre[0]}{a.apellido_pat[0]}</span>
          </div>
          <div className="min-w-0">
            <p className="font-black text-slate-900 text-sm truncate uppercase tracking-tight">
              {a.nombre} {a.apellido_pat} {a.apellido_mat || ''}
            </p>
            <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
              {a.carrera_id && (
                <span className="inline-flex items-center px-2 py-0.5 rounded-md bg-brand-50 border border-brand-100 text-darkerBlue text-[9px] font-black uppercase tracking-widest">
                  {opts.carreras.find(c => c.id === a.carrera_id)?.nombre || 'Sin carrera'}
                </span>
              )}
              {a.semestre > 0 && (
                <span className="inline-flex items-center px-1.5 py-0.5 rounded-md bg-slate-100 text-slate-500 text-[9px] font-bold">
                  Sem. {a.semestre}
                </span>
              )}
            </div>
          </div>
        </div>
      )
    },
    {
      label: 'No. Control',
      className: 'text-center',
      render: (a) => (
        <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-100 border border-slate-200 font-mono text-xs font-black text-slate-700">
          <Hash size={11} className="text-slate-400" />{a.no_control || '—'}
        </span>
      )
    },
    {
      label: 'CURP',
      className: 'hidden md:table-cell',
      render: (a) => (
        <span className="font-mono text-[10px] text-slate-500">{a.curp || '—'}</span>
      )
    },
    {
      label: 'Estado',
      className: 'text-center',
      render: (a) => <div className="flex justify-center"><Badge estado={a.activo ? 'ACTIVO' : 'BAJA'} /></div>
    },
    {
      label: '',
      className: 'w-16 text-right',
      render: (a) => (
        <div className="flex gap-1 justify-end" onClick={e => e.stopPropagation()}>
          <button onClick={(e) => { e.stopPropagation(); setConfirmBaja(a) }}
            className={`btn-icon ${a.activo ? 'text-rose-500 hover:bg-rose-50' : 'text-emerald-500 hover:bg-emerald-50'}`}
            title={a.activo ? 'Dar de baja' : 'Reactivar'}>
            {a.activo ? <UserX size={14} /> : <UserCheck size={14} />}
          </button>
        </div>
      )
    },
  ]

  if (loading) return <Spinner />

  return (
    <div className="min-h-screen bg-slate-50/30">
      <PageHeader title="Alumnos" subtitle={`${lista.length} alumnos registrados en el sistema`}
        icon={GraduationCap}
        actions={
          <div className="flex gap-3">
            <Btn variant="white-gold" onClick={() => { setModalCreate(true); setError(null); setFormCreate(emptyForm) }}>
              <Plus size={16} /> Registro Individual
            </Btn>
            <Btn variant="white-gold" onClick={() => { setModalCSV(true); setCsvFile(null); setCsvPreview(null); setCsvResult(null) }}>
              <Upload size={16} /> Importación Masiva
            </Btn>
          </div>
        }
      />

      <div className="p-8 max-w-7xl mx-auto space-y-6">
        {/* Estadísticas */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <StatCard label="Total Registrados" value={lista.length} icon={GraduationCap} color="institucional-dark" />
          <StatCard label="Alumnos Activos" value={totalActivos} icon={UserCheck} color="institucional" />
          <StatCard label="Alumnos en Baja" value={totalBaja} icon={UserX} color="institucional" />
        </div>

        {/* Barra de Control */}
        <div className="bg-white rounded-[24px] border border-slate-100 p-4 shadow-sm">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="flex-1 max-w-md">
              <SearchInput value={search} onChange={setSearch} placeholder="Buscar por nombre, No. Control o CURP..." className="w-full bg-slate-50" />
            </div>
            <div className="flex items-center gap-4">
              <select
                value={selectedCarrera}
                onChange={e => setSelectedCarrera(e.target.value)}
                className="bg-slate-50 border border-slate-200 rounded-[20px] px-6 py-2 text-sm font-bold text-slate-700 outline-none focus:ring-2 focus:ring-yellow-500 focus:border-yellow-500 transition-all cursor-pointer min-w-[200px]"
              >
                <option value="all">Todas las carreras</option>
                {opts.carreras.map(c => (
                  <option key={c.id} value={c.id}>{c.nombre}</option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* Sección Activos */}
        <div className="bg-white rounded-[24px] border border-slate-100 overflow-hidden shadow-sm">
          <button
            onClick={() => setOpenActivos(!openActivos)}
            className="w-full flex items-center justify-between p-5 hover:bg-slate-50/50 transition-colors"
          >
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center">
                <GraduationCap size={18} />
              </div>
              <h2 className="font-black text-slate-800 uppercase tracking-wider text-sm">Alumnos Activos ({alumnosActivos.length})</h2>
            </div>
            <ChevronRight className={`text-slate-400 transition-transform ${openActivos ? 'rotate-90' : ''}`} />
          </button>

          {openActivos && (
            <div className="border-t border-slate-50">
              <Table
                columns={cols}
                data={alumnosActivos}
                onRowClick={(a) => { setModalEdit({ ...a }); setError(null) }}
                empty={<EmptyState icon={GraduationCap} title="Sin alumnos activos" description="No hay alumnos activos que coincidan con la búsqueda" />}
              />
            </div>
          )}
        </div>

        {/* Sección Inactivos */}
        <div className="bg-white rounded-[24px] border border-slate-100 overflow-hidden shadow-sm">
          <button
            onClick={() => setOpenInactivos(!openInactivos)}
            className="w-full flex items-center justify-between p-5 hover:bg-slate-50/50 transition-colors"
          >
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-slate-100 text-slate-500 flex items-center justify-center">
                <UserX size={18} />
              </div>
              <h2 className="font-black text-slate-400 uppercase tracking-wider text-sm">Alumnos en Baja ({alumnosInactivos.length})</h2>
            </div>
            <ChevronRight className={`text-slate-400 transition-transform ${openInactivos ? 'rotate-90' : ''}`} />
          </button>

          {openInactivos && (
            <div className="border-t border-slate-50 bg-slate-50/10">
              <Table
                columns={cols}
                data={alumnosInactivos}
                onRowClick={(a) => { setModalEdit({ ...a }); setError(null) }}
                empty={<EmptyState icon={UserX} title="Sin alumnos en baja" description="No hay registros de alumnos inactivos" />}
              />
            </div>
          )}
        </div>
      </div>

      {/* ═════════════════════════════════════════════════════════════ */}
      {/* MODALES Y DRAWERS */}
      {/* ═════════════════════════════════════════════════════════════ */}

      {/* Modal: Registrar alumno */}
      <Modal open={modalCreate} onClose={() => setModalCreate(false)} title="Registrar alumno"
        subtitle="Complete los datos del estudiante"
        footer={<div className="flex gap-2 justify-end"><Btn variant="secondary" onClick={() => setModalCreate(false)}>Cancelar</Btn><Btn form="form-create" type="submit" loading={saving}>Registrar</Btn></div>}
      >
        <form id="form-create" onSubmit={crearAlumno} className="space-y-4">
          {error && <ErrorMsg error={error} />}

          <div className="flex bg-slate-100 p-1 rounded-xl gap-1">
            <button
              type="button"
              onClick={() => setFormCreate(f => ({ ...f, registro_manual: false }))}
              className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all ${!formCreate.registro_manual ? 'bg-white shadow-sm text-darkerBlue' : 'text-slate-500 hover:text-slate-700'}`}
            >
              Nuevo Ingreso
            </button>
            <button
              type="button"
              onClick={() => setFormCreate(f => ({ ...f, registro_manual: true }))}
              className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all ${formCreate.registro_manual ? 'bg-white shadow-sm text-darkerBlue' : 'text-slate-500 hover:text-slate-700'}`}
            >
              Manual / Migración
            </button>
          </div>

          <div className="bg-brand-50 rounded-xl p-3.5 text-xs text-brand-700">
            {formCreate.registro_manual ? (
              <>
                <p className="font-semibold mb-1">Modo Manual</p>
                <p>Debe proporcionar el No. Control y el correo institucional del otro sistema.</p>
              </>
            ) : (
              <>
                <p className="font-semibold mb-1">Campos auto-generados</p>
                <p>No. Control, correo institucional, NIP provisional y cuenta de acceso.</p>
              </>
            )}
          </div>

          {formCreate.registro_manual && (
            <div className="grid grid-cols-2 gap-3 animate-fade-in">
              <Input label="No. Control *" value={formCreate.no_control} onChange={e => setFormCreate(f => ({ ...f, no_control: e.target.value }))} required placeholder="Ej. 19020001" />
              <Input label="Correo Institucional *" type="email" value={formCreate.email} onChange={e => setFormCreate(f => ({ ...f, email: e.target.value }))} required placeholder="ejemplo@itsslp.edu.mx" />
            </div>
          )}
          <div className="grid grid-cols-2 gap-3">
            <Input label="Nombre *" value={formCreate.nombre} onChange={e => setFormCreate(f => ({ ...f, nombre: e.target.value }))} required placeholder="Juan" />
            <Input label="Apellido paterno *" value={formCreate.apellido_pat} onChange={e => setFormCreate(f => ({ ...f, apellido_pat: e.target.value }))} required placeholder="García" />
          </div>
          <Input label="Apellido materno" value={formCreate.apellido_mat} onChange={e => setFormCreate(f => ({ ...f, apellido_mat: e.target.value }))} placeholder="López (opcional)" />
          <div className="grid grid-cols-2 gap-3">
            <Input label="Fecha de nacimiento *" type="date" value={formCreate.fecha_nacimiento} onChange={e => setFormCreate(f => ({ ...f, fecha_nacimiento: e.target.value }))} required />
            <Select label="Carrera *" value={formCreate.carrera_id} onChange={e => setFormCreate(f => ({ ...f, carrera_id: e.target.value }))} required>
              <option value="">-- Seleccionar --</option>
              {opts.carreras.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
            </Select>
          </div>
          <Input label="CURP" value={formCreate.curp} onChange={e => setFormCreate(f => ({ ...f, curp: e.target.value.toUpperCase() }))} placeholder="18 caracteres" maxLength={18} />
        </form>
      </Modal>

      {/* Modal: Credenciales generadas */}
      <Modal open={!!modalCreds} onClose={() => setModalCreds(null)} title="Alumno registrado exitosamente">
        {modalCreds && (
          <div className="space-y-4">
            <p className="text-sm text-slate-600 font-medium">{modalCreds.nombre}</p>
            <div className="bg-slate-50 rounded-xl p-4 space-y-3">
              {[
                { label: 'No. Control', value: modalCreds.no_control },
                { label: 'Correo institucional', value: modalCreds.email },
                { label: 'NIP provisional', value: modalCreds.nip_provisional },
              ].map(item => (
                <div key={item.label} className="flex items-center justify-between">
                  <div>
                    <p className="text-xs text-slate-400">{item.label}</p>
                    <p className="font-mono text-sm font-semibold text-slate-900">{item.value}</p>
                  </div>
                  <button onClick={() => copyText(item.value)} className="btn-icon" title="Copiar"><Copy size={14} /></button>
                </div>
              ))}
            </div>
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-3.5 text-xs text-amber-800">
              <p className="font-semibold flex items-center gap-1"><AlertTriangle size={12} /> Importante</p>
              <p className="mt-1">Entregue estos datos al alumno.</p>
            </div>
            <div className="flex justify-end"><Btn onClick={() => setModalCreds(null)}>Entendido</Btn></div>
          </div>
        )}
      </Modal>

      {/* Drawer: Detalle del Estudiante */}
      <Drawer
        open={!!modalEdit}
        onClose={() => setModalEdit(null)}
        title="Detalle del Estudiante"
        subtitle={modalEdit ? `${modalEdit.no_control} • ${modalEdit.nombre} ${modalEdit.apellido_pat}` : ''}
        footer={activeTab === 'general' ? (
          <div className="flex gap-2 justify-end w-full">
            <Btn variant="secondary" onClick={() => setModalEdit(null)}>Cerrar</Btn>
            <Btn form="form-edit" type="submit" loading={saving}>Actualizar Información</Btn>
          </div>
        ) : null}
      >
        <div className="flex bg-slate-100 p-1 rounded-xl mb-4">
          <button onClick={() => setActiveTab('general')} className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all flex items-center justify-center gap-2 ${activeTab === 'general' ? 'bg-white shadow-sm text-darkerBlue' : 'text-slate-500 hover:text-slate-700'}`}>
            <User size={14} /> Información
          </button>
          <button onClick={() => setActiveTab('trayectoria')} className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all flex items-center justify-center gap-2 ${activeTab === 'trayectoria' ? 'bg-white shadow-sm text-darkerBlue' : 'text-slate-500 hover:text-slate-700'}`}>
            <BarChart2 size={14} /> Trayectoria
          </button>
        </div>

        {/* TAB: Información General */}
        {activeTab === 'general' && modalEdit && (
          <form id="form-edit" onSubmit={actualizarAlumno} className="space-y-6 animate-fade-in">
            {error && <ErrorMsg error={error} />}

            <div className="space-y-4">
              <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest border-b border-slate-100 pb-2">Información Académica</h3>
              <div className="bg-slate-50 rounded-2xl p-5 border border-slate-100 flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-xl bg-darkerBlue text-yellow-500 flex items-center justify-center shadow-inner">
                    <Hash size={24} />
                  </div>
                  <div>
                    <p className="text-[10px] font-bold text-slate-400 uppercase">Número de Control</p>
                    <p className="font-mono text-lg font-black text-slate-900">{modalEdit.no_control}</p>
                  </div>
                </div>
                <div className="text-right">
                  <Badge estado={modalEdit.activo ? 'ACTIVO' : 'BAJA'} />
                </div>
              </div>

              <div className="grid gap-4">
                <Select label="Carrera" value={modalEdit.carrera_id || ''} onChange={e => setModalEdit(m => ({ ...m, carrera_id: e.target.value }))} className="!bg-slate-50">
                  <option value="">-- Sin carrera --</option>
                  {opts.carreras.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
                </Select>
                <div className="w-32">
                  <Input label="Semestre" type="number" min="0" value={modalEdit.semestre || 0} onChange={e => setModalEdit(m => ({ ...m, semestre: parseInt(e.target.value) }))} />
                </div>
              </div>
            </div>

            <div className="space-y-4 pt-4">
              <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest border-b border-slate-100 pb-2">Datos Personales</h3>
              <div className="grid grid-cols-2 gap-4">
                <Input label="Nombre" value={modalEdit.nombre} onChange={e => setModalEdit(m => ({ ...m, nombre: e.target.value }))} required />
                <Input label="Apellido paterno" value={modalEdit.apellido_pat} onChange={e => setModalEdit(m => ({ ...m, apellido_pat: e.target.value }))} required />
              </div>
              <Input label="Apellido materno" value={modalEdit.apellido_mat || ''} onChange={e => setModalEdit(m => ({ ...m, apellido_mat: e.target.value }))} />

              <div className="grid grid-cols-2 gap-4">
                <Input label="CURP" value={modalEdit.curp || ''} onChange={e => setModalEdit(m => ({ ...m, curp: e.target.value.toUpperCase() }))} maxLength={18} />
                <Input label="Fecha de Nacimiento" type="date" value={modalEdit.fecha_nacimiento || ''} onChange={e => setModalEdit(m => ({ ...m, fecha_nacimiento: e.target.value }))} />
              </div>
              <Input label="Correo Institucional" value={modalEdit.email || ''} disabled className="opacity-70" />
            </div>

            <div className="pt-6">
              <label className="flex items-center gap-3 p-4 rounded-xl border border-slate-100 hover:bg-slate-50 transition-colors cursor-pointer group">
                <input type="checkbox" className="w-5 h-5 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
                  checked={modalEdit.activo} onChange={e => setModalEdit(m => ({ ...m, activo: e.target.checked }))} />
                <div>
                  <p className="text-sm font-bold text-slate-700 group-hover:text-brand-600">Estado de la cuenta</p>
                  <p className="text-xs text-slate-400">Define si el alumno puede acceder al sistema</p>
                </div>
              </label>
            </div>
          </form>
        )}

        {/* TAB: Trayectoria */}
        {activeTab === 'trayectoria' && (
          <div className="space-y-8 animate-fade-in">
            {/* Filtro de periodo */}
            <div className="mb-6 flex gap-3 bg-slate-50 p-3 rounded-2xl border border-slate-100 animate-in fade-in slide-in-from-top-2 duration-300">
              <select className="flex-1 bg-white border border-slate-200 rounded-xl text-[10px] px-3 py-2 outline-none focus:border-brand-500 font-black text-slate-700 uppercase tracking-tight shadow-sm" value={filtroPeriodoDrawer} onChange={e => setFiltroPeriodoDrawer(e.target.value)}>
                <option value="ALL">Todos los periodos</option>
                {dataKardex?.periodos?.map(p => <option key={p.id} value={p.id}>{p.codigo} — {p.nombre}</option>)}
              </select>
            </div>

            {/* Stats */}
            <TrayectoriaStats dataAnalytics={dataAnalytics} filtroPeriodoDrawer={filtroPeriodoDrawer} />

            {/* Gráfica */}
            <TrayectoriaChart dataAnalytics={dataAnalytics} filtroPeriodoDrawer={filtroPeriodoDrawer} />

            {/* Historial */}
            <KardexHistorial
              dataKardex={dataKardex}
              filtroPeriodoDrawer={filtroPeriodoDrawer}
              modalEdit={modalEdit}
              expandedKardex={expandedKardex}
              desgloseKardex={desgloseKardex}
              toggleKardexExpand={toggleKardexExpand}
              setPanelUnidad={setPanelUnidad}
              setLoadingPanel={setLoadingPanel}
              setDataPanelUnidad={setDataPanelUnidad}
              resultadosApi={resultadosApi}
            />

          </div>
        )}
      </Drawer>

      {/* Modal: Auditoría Detallada */}
      <Modal
        open={!!panelUnidad}
        onClose={() => setPanelUnidad(null)}
        title="Auditoría Académica Detallada"
        subtitle={panelUnidad ? `${panelUnidad.info.alumno} • ${panelUnidad.info.materia} • ${panelUnidad.info.unidad_nombre}` : ''}
        size="" // <- Dejar vacío para que no aplique ningún max-w por defecto
        className="max-w-[1050px]"
      >
        <AuditPanelUnidad panelUnidad={panelUnidad} dataPanelUnidad={dataPanelUnidad} loadingPanel={loadingPanel} />
      </Modal>

      {/* Modal: Carga Masiva CSV */}
      <Modal open={modalCSV} onClose={() => { setModalCSV(false); setCsvPreview(null); setCsvResult(null) }}
        title="Carga Masiva de Alumnos"
        subtitle="Importar plantilla de alumnos desde CSV"
        size={csvPreview ? "3xl" : "lg"}
        footer={
          <div className="flex gap-2 justify-end">
            <Btn variant="secondary" onClick={() => setModalCSV(false)}>Cerrar</Btn>
            {csvFile && !csvPreview && !csvResult && (
              <Btn onClick={handleCSVPreview} loading={csvLoading}>Previsualizar</Btn>
            )}
            {csvPreview && (
              <Btn onClick={handleCSVConfirm} loading={csvLoading} variant="primary" disabled={!csvPreview.some(r => !r.error && !r.ya_existe)}>
                Confirmar Importación ({csvPreview.filter(r => !r.error && !r.ya_existe).length})
              </Btn>
            )}
          </div>
        }
      >
        <div className="space-y-4">
          {!csvPreview && !csvResult && (
            <>
              <div className="bg-brand-50 p-4 rounded-2xl border border-brand-100 flex items-start gap-3">
                <FileSpreadsheet className="text-brand-600 mt-1" size={20} />
                <div className="text-xs text-brand-900 leading-relaxed">
                  <p className="font-black uppercase tracking-wider mb-1">Instrucciones del CSV</p>
                  <p>El sistema es flexible con los encabezados (puede usar mayúsculas o minúsculas):</p>
                  <ul className="list-disc list-inside mt-1 font-mono text-[16px] opacity-80">
                    <li>numero_control</li>
                    <li>nombre, apellido_pat, apellido_mat</li>
                    <li>fecha (o fecha_nacimiento): YYYY-MM-DD</li>
                    <li>curp: 18 caracteres (opcional)</li>
                    <li>carrera_id (opcional)</li>
                  </ul>
                </div>
              </div>
              <div className="p-8 border-2 border-dashed border-slate-200 rounded-3xl text-center hover:border-brand-400 transition-colors bg-slate-50/50">
                <input ref={fileRef} type="file" accept=".csv" onChange={e => { setCsvFile(e.target.files[0]); setCsvPreview(null) }} className="hidden" id="csv-alumnos" />
                <label htmlFor="csv-alumnos" className="cursor-pointer block">
                  <Upload className="mx-auto text-slate-400 mb-2" size={32} />
                  <p className="text-sm font-bold text-slate-700">{csvFile ? csvFile.name : 'Seleccionar archivo CSV'}</p>
                  <p className="text-xs text-slate-400 mt-1">Haz clic para buscar en tu equipo</p>
                </label>
              </div>
            </>
          )}

          {csvPreview && (
            <div className="border border-slate-100 rounded-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
              <Table
                columns={[
                  { label: 'Fila', render: r => <span className="text-xs font-mono text-slate-400">{r.fila}</span> },
                  { label: 'Alumno', render: r => <span className={`text-sm font-bold ${r.error ? 'text-rose-500' : 'text-slate-700'}`}>{r.nombre} {r.apellido_pat}{r.apellido_mat ? ` ${r.apellido_mat}` : ''}</span> },
                  { label: 'No. Control', tdClassName: 'whitespace-nowrap', render: r => <span className="text-sm font-mono">{r.no_control || '—'}</span> },
                  { label: 'CURP', tdClassName: 'whitespace-nowrap', render: r => <span className="text-xs font-mono">{r.curp || '—'}</span> },
                  { label: 'Email Generado', render: r => <span className="text-xs text-slate-500">{r.email || '—'}</span> },
                  { label: 'NIP', render: r => <span className="text-xs font-mono">{r.nip_provisional || '—'}</span> },
                  {
                    label: 'Estado', render: r => {
                      if (r.error) return <Badge estado="ERROR" className="!bg-rose-50 !text-rose-600 border-none" />
                      if (r.ya_existe) return <Badge estado="OMITIR" className="!bg-amber-50 !text-amber-600 border-none" />
                      return <Badge estado="LISTO" className="!bg-emerald-50 !text-emerald-600 border-none" />
                    }
                  }
                ]}
                data={csvPreview}
              />
            </div>
          )}

          {csvResult && (
            <div className={`${csvResult.importados > 0 ? 'bg-emerald-50 border-emerald-200' : 'bg-rose-50 border-rose-200'} border p-5 rounded-2xl space-y-4 animate-in slide-in-from-bottom-2 duration-300`}>
              <div className="flex items-center justify-between">
                <div>
                  <p className={`text-sm font-black uppercase tracking-widest ${csvResult.importados > 0 ? 'text-emerald-800' : 'text-rose-800'}`}>
                    {csvResult.importados > 0 ? 'Importación Finalizada' : 'Fallo en la Importación'}
                  </p>
                  <p className={`text-xs font-medium ${csvResult.importados > 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                    {csvResult.importados} alumnos importados, {csvResult.omitidos || 0} omitidos por ya existir.
                  </p>
                </div>
                {csvResult.importados > 0 && (
                  <Btn variant="secondary" size="sm" onClick={downloadCSVResult}>
                    <Download size={14} /> Descargar credenciales
                  </Btn>
                )}
              </div>

              {csvResult.errores_count > 0 && (
                <div className="bg-white/50 p-3 rounded-xl border border-black/5">
                  <p className="text-[13px] font-bold text-rose-500 uppercase mb-1">Detalles de errores</p>
                  <p className="text-[15px] font-mono text-rose-600 leading-relaxed">
                    {csvResult.errores_count} errores detectados. {csvResult.importados === 0 ? 'Revisa que los alumnos no estén ya registrados o que el formato sea correcto.' : 'Algunas filas se omitieron.'}
                  </p>
                </div>
              )}
            </div>
          )}
        </div>
      </Modal>

      {/* Dialog: Confirmar Baja */}
      <ConfirmDialog
        open={!!confirmBaja}
        onClose={() => setConfirmBaja(null)}
        onConfirm={() => handleBaja(confirmBaja)}
        title={confirmBaja?.activo ? 'Dar de baja alumno' : 'Reactivar alumno'}
        message={`¿Estás seguro de que deseas ${confirmBaja?.activo ? 'dar de baja' : 'reactivar'} al alumno ${confirmBaja?.nombre} con No. Control ${confirmBaja?.no_control}?`}
        variant={confirmBaja?.activo ? 'danger' : 'success'}
        loading={saving}
      />

      {/* Toast */}
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
    </div>
  )
}