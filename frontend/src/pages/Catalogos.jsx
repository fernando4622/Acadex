import { useState, useEffect } from 'react'
import { materias as materiasApi, importar as importarApi, carreras as carrerasApi } from '../api/endpoints'
import { PageHeader, Btn, Input, Modal, Badge, ErrorMsg, Toast, EmptyState, SearchInput, Spinner, StatCard, Drawer, ConfirmDialog } from '../components/ui'
import { Plus, BookOpen, ChevronRight, UploadCloud, Trash2, X, Info, CheckCircle, AlertTriangle, AlertCircle, FileSpreadsheet, Hash, Layers, GraduationCap, Settings, UserCheck, TrendingUp } from 'lucide-react'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts'

export default function Catalogos() {
  const [mats, setMats] = useState([])
  const [carreras, setCarreras] = useState([])
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState(null)
  const [form, setForm] = useState({
    id: '', nombre: '', clave: '', creditos: '', unidades: '', carreras_ids: []
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const [toast, setToast] = useState(null)
  const [modalImport, setModalImport] = useState(false)
  const [importFile, setImportFile] = useState(null)
  const [importPreview, setImportPreview] = useState(null)
  const [modalResumenImport, setModalResumenImport] = useState(false)
  const [resumenImport, setResumenImport] = useState(null)

  const [expanded, setExpanded] = useState(null)
  const [unidadesPlantilla, setUnidadesPlantilla] = useState({})
  const [formUnidad, setFormUnidad] = useState({ id: '', numero: '', nombre: '' })
  const [savingU, setSavingU] = useState(false)
  const [openActivas, setOpenActivas] = useState(true)
  const [openInactivas, setOpenInactivas] = useState(false)
  const [modalConfirm, setModalConfirm] = useState(null)
  const [busqueda, setBusqueda] = useState('')
  const [filtroCarreras, setFiltroCarreras] = useState([]) // multi-checkbox filter
  const [activeTab, setActiveTab] = useState('general')
  const [selectedMateria, setSelectedMateria] = useState(null)
  const [dataAnalytics, setDataAnalytics] = useState(null)

  const notify = (msg, type = 'success') => { setToast({ message: msg, type }); setTimeout(() => setToast(null), 4000) }

  async function cargar() {
    try {
      setLoading(true)
      const [rM, rC] = await Promise.all([
        materiasApi.listar(),
        carrerasApi.listar()
      ])
      setMats(rM.data)
      setCarreras(rC.data)
    } catch (error) {
      console.error("Error cargando datos:", error)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { cargar() }, [])

  useEffect(() => {
    if (selectedMateria) {
      materiasApi.historial(selectedMateria.id).then(r => setDataAnalytics(r.data))
    } else {
      setDataAnalytics(null)
    }
  }, [selectedMateria])

  async function cargarUnidades(materiaId) {
    try {
      const r = await materiasApi.unidades(materiaId)
      setUnidadesPlantilla(prev => ({ ...prev, [materiaId]: r.data }))
    } catch (e) {
      console.error("Error cargando unidades:", e)
    }
  }

  function toggleMateria(m) {
    const next = expanded === m.id ? null : m.id
    setExpanded(next)
    if (next && !unidadesPlantilla[m.id]) cargarUnidades(m.id)
  }

  function openModal(m = null) {
    if (m) {
      setForm({
        id: m.id,
        clave: m.clave || '',
        nombre: m.nombre,
        creditos: m.creditos || '',
        carreras_ids: m.carreras_ids || [],
        unidades: '',
        unidadesLista: (unidadesPlantilla[m.id] || []).map(u => u.nombre),
      })
      setSelectedMateria(m)
      setModal('edit')
    } else {
      setForm({
        id: '',
        nombre: '',
        clave: '',
        creditos: '',
        carreras_ids: [],
        unidades: '',
        unidadesLista: [''],
      })
      setModal('new')
    }
    setActiveTab('general')
    setError(null)
  }

  async function guardar(e) {
    e.preventDefault(); setSaving(true); setError(null)
    try {
      const payload = {
        nombre: form.nombre,
        clave: form.clave,
        creditos: form.creditos ? parseInt(form.creditos) : null,
        unidades: (form.unidadesLista || []).filter(u => u.trim()).join('|'),
      }

      if (form.id) {
        await materiasApi.actualizar(form.id, payload)
        notify('Materia actualizada')
      } else {
        await materiasApi.crear(payload)
        notify('Materia creada exitosamente')
      }
      setModal(null)
      cargar()
    } catch (err) { setError(err) }
    finally { setSaving(false) }
  }

  async function guardarUnidad(materiaId, e) {
    e.preventDefault()
    setSavingU(true)
    try {
      if (formUnidad.id) {
        await materiasApi.actualizarUnidad(materiaId, formUnidad.id, { numero: formUnidad.numero, nombre: formUnidad.nombre })
        notify('Unidad actualizada')
      } else {
        await materiasApi.crearUnidad(materiaId, { numero: formUnidad.numero, nombre: formUnidad.nombre })
        notify('Unidad agregada')
      }
      setFormUnidad({ id: '', numero: '', nombre: '' })
      await cargarUnidades(materiaId)
    } catch (err) {
      notify('Error al guardar unidad', 'error')
    } finally { setSavingU(false) }
  }

  async function eliminarUnidad(materiaId, unidadId) {
    if (!confirm('¿Eliminar esta unidad?')) return
    try {
      await materiasApi.eliminarUnidad(materiaId, unidadId)
      await cargarUnidades(materiaId)
      notify('Unidad eliminada')
    } catch { }
  }

  async function eliminarMateria(id) {
    setModalConfirm({
      title: 'Desactivar Materia',
      msg: '¿Estás seguro de desactivar esta materia?',
      onConfirm: async () => {
        try {
          await materiasApi.eliminar(id)
          await cargar()
          notify('Materia desactivada')
        } catch (err) { notify('Error al desactivar', 'error') }
        setModalConfirm(null)
      }
    })
  }

  async function reactivarMateria(id) {
    setModalConfirm({
      title: 'Reactivar Materia',
      msg: '¿Deseas activar esta materia?',
      onConfirm: async () => {
        try {
          await materiasApi.reactivar(id)
          await cargar()
          notify('Materia reactivada')
        } catch (err) { notify('Error al reactivar', 'error') }
        setModalConfirm(null)
      }
    })
  }

  const normalizeStr = (str) =>
    str ? str.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase() : ""

  const toggleFiltroCarrera = (id) => {
    setFiltroCarreras(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    )
  }

  const materiasFiltradas = mats.filter(m => {
    const cumpleBusqueda = normalizeStr(m.nombre).includes(normalizeStr(busqueda)) || normalizeStr(m.clave).includes(normalizeStr(busqueda))
    const cumpleCarrera = filtroCarreras.length === 0 || (m.carreras_ids || []).some(id => filtroCarreras.includes(id))
    return cumpleBusqueda && cumpleCarrera
  })

  const stats = {
    total: mats.length,
    activas: mats.filter(m => m.activa).length,
    inactivas: mats.filter(m => !m.activa).length
  }

  // ── Importación CSV ──
  async function handlePreviewMaterias() {
    if (!importFile) return
    setSaving(true)
    setImportPreview(null)
    setResumenImport(null)
    try {
      const { data } = await importarApi.previewMaterias(importFile)
      setImportPreview(data)
    }
    catch (e) {
      notify('Error al procesar archivo CSV', 'error')
    }
    finally { setSaving(false) }
  }

  async function handleConfirmMaterias() {
    if (!importFile) return
    setSaving(true)
    try {
      const { data } = await importarApi.confirmarMaterias(importFile)
      setResumenImport(data)
      setImportPreview(null)
      await cargar()
      if (data.importados > 0) {
        notify(`${data.importados} materias importadas correctamente`)
      } else if (data.errores_count > 0) {
        notify('No se importó ninguna materia debido a errores', 'error')
      }
    } catch {
      notify('Error al importar', 'error')
    }
    finally { setSaving(false) }
  }

  if (loading) return <Spinner />

  return (
    <div className="min-h-screen bg-slate-50/30">
      <PageHeader
        title="Catálogo Académico"
        subtitle="Gestión de materias, carreras y planes de estudio"
        icon={BookOpen}
        actions={
          <div className="flex gap-3">
            <Btn variant="white-gold" onClick={() => setModalImport(true)}>
              <UploadCloud size={16} /> Importar Materias
            </Btn>
            <Btn variant="white-gold" onClick={() => openModal()}>
              <Plus size={16} /> Nueva Materia
            </Btn>
          </div>
        }
      />

      <div className="p-8 max-w-7xl mx-auto space-y-6">
        {/* Estadísticas */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <StatCard label="Total Materias" value={stats.total} icon={BookOpen} color="institucional-dark" />
          <StatCard label="Materias Activas" value={stats.activas} icon={CheckCircle} color="institucional" />
          <StatCard label="Sin Activar" value={stats.inactivas} icon={AlertCircle} color="institucional" />
        </div>

        {/* Buscador + Filtro */}
        <div className="bg-white rounded-[24px] border border-slate-100 p-4 shadow-sm space-y-3">
          <SearchInput
            value={busqueda}
            onChange={setBusqueda}
            placeholder="Buscar por nombre o clave de materia..."
            className="max-w-xl bg-slate-50"
          />
          {carreras.length > 0 && (
            <div className="flex flex-wrap gap-2 pt-1">
              <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider self-center">Filtrar por carrera:</span>
              {carreras.map(c => {
                const checked = filtroCarreras.includes(c.id)
                return (
                  <button
                    key={c.id}
                    onClick={() => toggleFiltroCarrera(c.id)}
                    className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-bold border transition-all ${
                      checked
                        ? 'bg-darkerBlue text-yellow-400 border-darkerBlue'
                        : 'bg-slate-50 text-slate-500 border-slate-200 hover:border-slate-300'
                    }`}
                  >
                    <span className={`w-3 h-3 rounded border flex items-center justify-center transition-all ${
                      checked ? 'bg-yellow-400 border-yellow-400' : 'border-slate-300'
                    }`}>
                      {checked && <span className="text-darkerBlue text-[8px] font-black leading-none">✓</span>}
                    </span>
                    {c.nombre}
                  </button>
                )
              })}
              {filtroCarreras.length > 0 && (
                <button
                  onClick={() => setFiltroCarreras([])}
                  className="text-[10px] text-rose-400 hover:text-rose-600 font-bold px-2 underline"
                >Limpiar</button>
              )}
            </div>
          )}
        </div>

        <div className="space-y-6">
          {/* Activas */}
          <div className="bg-white rounded-[24px] border border-slate-100 overflow-hidden shadow-sm">
            <button onClick={() => setOpenActivas(!openActivas)} className="w-full flex items-center justify-between p-5 hover:bg-slate-50/50 transition-colors">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center"><BookOpen size={18} /></div>
                <h2 className="font-black text-slate-800 uppercase tracking-wider text-sm">Materias Vigentes ({materiasFiltradas.filter(m => m.activa).length})</h2>
              </div>
              <ChevronRight className={`text-slate-400 transition-transform ${openActivas ? 'rotate-90' : ''}`} />
            </button>
            {openActivas && (
              <div className="border-t border-slate-50 divide-y divide-slate-50">
                {materiasFiltradas.filter(m => m.activa).map(m => (
                  <MateriaRow
                    key={m.id} m={m}
                    openModal={openModal}
                    eliminarMateria={eliminarMateria}
                    reactivarMateria={reactivarMateria}
                    carreras={carreras}
                  />
                ))}
                {materiasFiltradas.filter(m => m.activa).length === 0 && (
                  <div className="p-10"><EmptyState icon={BookOpen} title="Sin materias" description="No se encontraron materias activas" /></div>
                )}
              </div>
            )}
          </div>

          {/* Inactivas */}
          <div className="bg-white rounded-[24px] border border-slate-100 overflow-hidden shadow-sm">
            <button onClick={() => setOpenInactivas(!openInactivas)} className="w-full flex items-center justify-between p-5 hover:bg-slate-50/50 transition-colors">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-slate-100 text-slate-500 flex items-center justify-center"><Trash2 size={18} /></div>
                <h2 className="font-black text-slate-400 uppercase tracking-wider text-sm">Archivo de Materias ({materiasFiltradas.filter(m => !m.activa).length})</h2>
              </div>
              <ChevronRight className={`text-slate-400 transition-transform ${openInactivas ? 'rotate-90' : ''}`} />
            </button>
            {openInactivas && (
              <div className="border-t border-slate-50 divide-y divide-slate-50">
                {materiasFiltradas.filter(m => !m.activa).map(m => (
                  <MateriaRow
                    key={m.id} m={m}
                    openModal={openModal}
                    eliminarMateria={eliminarMateria}
                    reactivarMateria={reactivarMateria}
                    carreras={carreras}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
      {/* Drawer Materia (Pattern Acadex) */}
      <Drawer
        open={modal === 'edit'}
        onClose={() => { setModal(null); setActiveTab('general') }}
        title="Gestión de Materia"
        subtitle={selectedMateria ? `${selectedMateria.clave} • ${selectedMateria.nombre}` : ''}
        footer={activeTab === 'general' ? (
          <div className="flex gap-2 justify-end w-full">
            <Btn variant="secondary" onClick={() => setModal(null)}>Cerrar</Btn>
            <Btn onClick={guardar} loading={saving}>Actualizar Materia</Btn>
          </div>
        ) : null}
      >
        <div className="flex bg-slate-100 p-1 rounded-xl mb-6">
          <button onClick={() => setActiveTab('general')} className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all flex items-center justify-center gap-2 ${activeTab === 'general' ? 'bg-white shadow-sm text-darkerBlue' : 'text-slate-500 hover:text-slate-700'}`}>
            <Settings size={14} /> Gestión Materia
          </button>
          <button onClick={() => setActiveTab('historial')} className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all flex items-center justify-center gap-2 ${activeTab === 'historial' ? 'bg-white shadow-sm text-darkerBlue' : 'text-slate-500 hover:text-slate-700'}`}>
            <TrendingUp size={14} /> Historial Académico
          </button>
        </div>

        {activeTab === 'general' && selectedMateria && (
          <div className="space-y-8 animate-fade-in">
            {/* Formulario de Información */}
            <form id="fm" onSubmit={guardar} className="space-y-6">
              {error && <ErrorMsg error={error} />}
              <div className="bg-slate-50 rounded-2xl p-5 border border-slate-100 flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-xl bg-darkerBlue text-yellow-500 flex items-center justify-center shadow-inner">
                    <BookOpen size={24} />
                  </div>
                  <div>
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                      {carreras.find(c => c.id === form.carrera_id)?.nombre || 'Clave de Materia'}
                    </p>
                    <p className="font-mono text-lg font-black text-slate-900">{form.clave || 'NUEVA MATERIA'}</p>
                  </div>
                </div>
                <Badge estado={selectedMateria ? (selectedMateria.activa ? 'ACTIVO' : 'BAJA') : 'ACTIVO'} />
              </div>

              <div className="space-y-4">
                <Input label="Nombre de la Materia" value={form.nombre} onChange={e => setForm({ ...form, nombre: e.target.value })} required />
                <div className="grid grid-cols-2 gap-4">
                  <Input label="Clave" value={form.clave} onChange={e => setForm({ ...form, clave: e.target.value })} required />
                  <Input label="Créditos" type="number" value={form.creditos} onChange={e => setForm({ ...form, creditos: e.target.value })} />
                </div>
                <div className="bg-brand-50/50 p-4 rounded-xl border border-brand-100 flex gap-3 items-start">
                  <Info size={16} className="text-brand-500 mt-0.5 shrink-0" />
                  <p className="text-xs text-brand-700 leading-relaxed">
                    <strong>Nota:</strong> Para asociar esta materia a una o más carreras, debes vincularla a un <span className="font-bold">Plan de Estudio</span> específico desde el módulo de <span className="font-bold">Planes de Estudio</span>.
                  </p>
                </div>
              </div>
            </form>

            {/* Gestión de Unidades (Ahora integrada aquí) */}
            <div className="pt-6 border-t border-slate-100 space-y-4">
              <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-1">Estructura de Unidades</h4>
              <div className="grid grid-cols-1 gap-2">
                {(unidadesPlantilla[selectedMateria.id] ?? []).map(u => (
                  <div key={u.id} className="flex items-center justify-between bg-white p-3 rounded-xl border border-slate-100 shadow-sm hover:border-slate-200 transition-all group">
                    <div className="flex items-center gap-3">
                      <div className="w-7 h-7 rounded-lg bg-slate-100 text-slate-500 flex items-center justify-center font-bold text-[10px]">{u.numero}</div>
                      <span className="text-xs font-bold text-slate-700">{u.nombre}</span>
                    </div>
                    <button onClick={() => eliminarUnidad(selectedMateria.id, u.id)} className="p-2 text-slate-300 hover:text-rose-500 transition-colors">
                      <Trash2 size={14} />
                    </button>
                  </div>
                ))}

                <form onSubmit={e => guardarUnidad(selectedMateria.id, e)} className="bg-slate-50 p-4 rounded-xl border border-slate-100 mt-2 flex gap-2 items-end">
                  <div className="w-16">
                    <Input label="#" size="sm" type="number" value={formUnidad.numero} onChange={e => setFormUnidad({ ...formUnidad, numero: e.target.value })} required />
                  </div>
                  <div className="flex-1">
                    <Input label="Nueva Unidad" size="sm" placeholder="Nombre..." value={formUnidad.nombre} onChange={e => setFormUnidad({ ...formUnidad, nombre: e.target.value })} required />
                  </div>
                  <Btn type="submit" variant="brand" size="sm" loading={savingU} className="h-[38px]"><Plus size={14} /></Btn>
                </form>
              </div>
            </div>

            <div className="pt-6 border-t border-slate-100">
              {selectedMateria?.activa ? (
                <Btn variant="danger" className="w-full" onClick={() => eliminarMateria(form.id)}>
                  <Trash2 size={14} className="mr-2" /> Desactivar Materia
                </Btn>
              ) : (
                <Btn variant="secondary" className="w-full" onClick={() => reactivarMateria(form.id)}>
                  <CheckCircle size={14} className="mr-2" /> Activar Materia
                </Btn>
              )}
            </div>
          </div>
        )}

        {activeTab === 'historial' && selectedMateria && (
          <div className="space-y-8 animate-fade-in">
            {/* Resumen Histórico */}
            <div className="grid grid-cols-3 gap-3">
              <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100 text-center">
                <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Grupos</p>
                <p className="text-2xl font-black text-darkerBlue">{dataAnalytics?.stats?.total_grupos}</p>
              </div>
              <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100 text-center">
                <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Promedio Global</p>
                <p className="text-2xl font-black text-darkerBlue">{(dataAnalytics?.stats?.promedio_global || 0).toFixed(1)}</p>
              </div>
              <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100 text-center">
                <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Alumnos</p>
                <p className="text-2xl font-black text-darkerBlue">{dataAnalytics?.stats?.total_alumnos_historico}</p>
              </div>
            </div>

            {/* Gráfico de Tendencia de Promedios */}
            <div className="space-y-3">
              <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest flex items-center gap-2">
                <TrendingUp size={14} /> Evolución de Promedios por Periodo
              </h3>
              <div className="h-[200px] w-full bg-white rounded-2xl border border-slate-100 p-4">
                {dataAnalytics?.historial?.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={[...dataAnalytics.historial].reverse()}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                      <XAxis dataKey="periodo" axisLine={false} tickLine={false} tick={{ fontSize: 9, fill: '#64748b' }} />
                      <YAxis domain={[0, 100]} hide />
                      <Tooltip
                        contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)', fontSize: '11px' }}
                      />
                      <Bar dataKey="promedio_grupo" fill="#1e293b" radius={[4, 4, 0, 0]} barSize={20} />
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="h-full flex items-center justify-center text-slate-400 text-xs italic">Sin datos históricos suficientes</div>
                )}
              </div>
            </div>

            {/* Tabla de Grupos Histórica */}
            <div className="space-y-3">
              <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-1">Detalle por Grupos</h4>
              <div className="overflow-hidden rounded-2xl border border-slate-100">
                <table className="w-full text-[10px]">
                  <thead className="bg-slate-50 text-slate-500 font-bold">
                    <tr>
                      <th className="px-3 py-2 text-left">Periodo / Grupo</th>
                      <th className="px-3 py-2 text-center">Aprobación</th>
                      <th className="px-3 py-2 text-right">Prom.</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {dataAnalytics?.historial?.map((h, i) => (
                      <tr key={i} className="hover:bg-slate-50 transition-colors bg-white">
                        <td className="px-3 py-3">
                          <p className="font-bold text-slate-700">{h.periodo}</p>
                          <p className="text-[9px] text-slate-400">{h.grupo}</p>
                        </td>
                        <td className="px-3 py-3 text-center">
                          <div className="flex items-center justify-center gap-1.5">
                            <span className="font-bold text-slate-600">{Math.round((h.aprobados / h.total_alumnos) * 100)}%</span>
                            <div className="w-10 h-1 bg-slate-100 rounded-full overflow-hidden">
                              <div className="h-full bg-emerald-500" style={{ width: `${(h.aprobados / h.total_alumnos) * 100}%` }}></div>
                            </div>
                          </div>
                        </td>
                        <td className="px-3 py-3 text-right font-black text-darkerBlue">{(h.promedio_grupo || 0).toFixed(1)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </Drawer>

      {/* Modal: Importar Materias */}
      <Modal open={modalImport} onClose={() => setModalImport(false)} title="Importar Materias (CSV)">
        <div className="space-y-4">
          <div className="bg-brand-50 rounded-xl p-4 text-xs text-brand-700">
            <p className="font-bold mb-1">Formato requerido</p>
            <p>El archivo CSV debe contener las columnas: <code>nombre, clave, creditos, horas_teoria, horas_practica</code>.</p>
          </div>

          {!importPreview && !resumenImport && (
            <div className="space-y-4">
              <input
                type="file"
                accept=".csv"
                onChange={e => setImportFile(e.target.files[0])}
                className="w-full text-sm text-slate-500 file:mr-4 file:py-2.5 file:px-4 file:rounded-xl file:border-0 file:text-sm file:font-semibold file:bg-darkerBlue file:text-white hover:file:bg-darkerBlue/90"
              />
              <div className="flex justify-end">
                <Btn onClick={handlePreviewMaterias} disabled={!importFile} loading={saving}>Previsualizar</Btn>
              </div>
            </div>
          )}

          {importPreview && (
            <div className="space-y-4 animate-in fade-in">
              <div className="bg-slate-50 border border-slate-200 rounded-xl overflow-hidden max-h-60 overflow-y-auto">
                <table className="w-full text-left text-[11px]">
                  <thead className="bg-slate-100 text-slate-500 uppercase font-black sticky top-0">
                    <tr>
                      <th className="px-3 py-2">Fila</th>
                      <th className="px-3 py-2">Clave</th>
                      <th className="px-3 py-2">Nombre</th>
                      <th className="px-3 py-2">Estado</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {importPreview.map((r, i) => (
                      <tr key={i} className={r.error ? 'bg-rose-50/50' : r.ya_existe ? 'bg-amber-50/50' : ''}>
                        <td className="px-3 py-2 text-slate-400 font-mono">{r.fila}</td>
                        <td className="px-3 py-2 font-mono font-bold">{r.clave || '—'}</td>
                        <td className="px-3 py-2 font-bold">{r.nombre}</td>
                        <td className="px-3 py-2">
                          {r.error ? <Badge estado="ERROR" className="!bg-rose-100 !text-rose-700" /> :
                           r.ya_existe ? <Badge estado="OMITIR" className="!bg-amber-100 !text-amber-700" /> :
                           <Badge estado="LISTO" className="!bg-emerald-100 !text-emerald-700" />}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="flex justify-end gap-2">
                <Btn variant="secondary" onClick={() => setImportPreview(null)}>Cancelar</Btn>
                <Btn onClick={handleConfirmMaterias} loading={saving}>Confirmar Importación</Btn>
              </div>
            </div>
          )}

          {resumenImport && (
            <div className={`p-5 rounded-2xl border ${resumenImport.importados > 0 ? 'bg-emerald-50 border-emerald-200' : 'bg-rose-50 border-rose-200'}`}>
              <p className={`text-sm font-black uppercase tracking-widest ${resumenImport.importados > 0 ? 'text-emerald-800' : 'text-rose-800'}`}>
                {resumenImport.importados > 0 ? 'Importación Finalizada' : 'Fallo en la Importación'}
              </p>
              <p className={`text-xs mt-1 font-medium ${resumenImport.importados > 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                {resumenImport.importados} materias importadas, {resumenImport.omitidos || 0} omitidas.
              </p>
              {resumenImport.errores_count > 0 && (
                <p className="mt-3 text-[13px] font-mono text-rose-600 bg-white/50 p-2 rounded-lg">
                  {resumenImport.errores_count} errores detectados.
                </p>
              )}
              <div className="mt-4 flex justify-end">
                <Btn onClick={() => setModalImport(false)}>Cerrar</Btn>
              </div>
            </div>
          )}
        </div>
      </Modal>

      <Modal open={modal === 'new'} onClose={() => setModal(null)} title="Nueva Materia"
        footer={<div className="flex gap-2 justify-end"><Btn variant="secondary" onClick={() => setModal(null)}>Cancelar</Btn><Btn form="fm" type="submit" loading={saving}>Guardar</Btn></div>}
      >
        <form id="fm" onSubmit={guardar} className="space-y-4">
          {error && <ErrorMsg error={error} />}
          <div className="bg-brand-50 p-4 rounded-xl text-brand-700 text-xs mb-4">
            <p className="font-bold">Alta de Materia</p>
            <p>Define los datos base y la estructura inicial de unidades.</p>
          </div>
          <Input label="Nombre de la Materia" value={form.nombre} onChange={e => setForm({ ...form, nombre: e.target.value })} required />
          <div className="grid grid-cols-2 gap-3">
            <Input label="Clave" value={form.clave} onChange={e => setForm({ ...form, clave: e.target.value })} required />
            <Input label="Créditos" type="number" value={form.creditos} onChange={e => setForm({ ...form, creditos: e.target.value })} />
          </div>
          <div className="bg-brand-50/50 p-4 rounded-xl border border-brand-100 flex gap-3 items-start">
            <Info size={16} className="text-brand-500 mt-0.5 shrink-0" />
            <p className="text-xs text-brand-700 leading-relaxed">
              <strong>Nota:</strong> Para asociar esta materia a una o más carreras, debes vincularla a un <span className="font-bold">Plan de Estudio</span> específico desde el módulo de <span className="font-bold">Planes de Estudio</span>.
            </p>
          </div>
          <div className="space-y-2">
            <label className="text-xs font-bold text-slate-500 uppercase">Unidades Iniciales (Separadas por |)</label>
            <Input value={form.unidades} onChange={e => setForm({ ...form, unidades: e.target.value })} placeholder="Unidad 1 | Unidad 2 | Unidad 3..." />
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        open={!!modalConfirm}
        onClose={() => setModalConfirm(null)}
        onConfirm={modalConfirm?.onConfirm}
        title={modalConfirm?.title}
        message={modalConfirm?.msg}
      />

      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
    </div>
  )
}

function MateriaRow({ m, openModal, eliminarMateria, reactivarMateria, carreras }) {
  const matCarreras = carreras.filter(c => m.carreras_ids?.includes(c.id))
  return (
    <div
      className="flex items-center gap-4 px-6 py-4 cursor-pointer hover:bg-slate-50/80 transition-all group"
      onClick={() => openModal(m)}
    >
      <div className="w-20 h-10 rounded-xl bg-slate-100 flex items-center justify-center font-mono text-[10px] font-black text-slate-500 border border-slate-100 group-hover:border-slate-200 group-hover:bg-white transition-all">
        {m.clave}
      </div>
      <div className="flex-1">
        <p className="font-black text-sm uppercase text-slate-800 tracking-tight">{m.nombre}</p>
        <div className="flex flex-col gap-1 mt-1 items-start">
          <span className="inline-flex items-center px-2 py-0.5 rounded-md bg-brand-50 border border-brand-100 text-darkerBlue text-[9px] font-black uppercase tracking-widest">
            {matCarreras.length === carreras.length && carreras.length > 0 ? 'Todas' : matCarreras.length > 0 ? matCarreras.map(c => c.nombre).join(', ') : 'Sin Carrera'}
          </span>
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-tight">
            {m.creditos || 0} Créditos
          </p>
        </div>
      </div>
      <div className="flex items-center gap-3">
        {!m.activa ? (
          <button onClick={e => { e.stopPropagation(); reactivarMateria(m.id) }} className="p-2 text-emerald-500 hover:bg-emerald-50 rounded-xl transition-all" title="Reactivar">
            <CheckCircle size={18} />
          </button>
        ) : (
          <div className="w-8 h-8 rounded-full bg-slate-50 flex items-center justify-center text-slate-300 group-hover:bg-darkerBlue group-hover:text-yellow-500 transition-all">
            <ChevronRight size={16} />
          </div>
        )}
      </div>
    </div>
  )
}
