import { useState, useEffect } from 'react'
import { planes as api, carreras as carrerasApi, materias as materiasApi } from '../api/endpoints'
import { PageHeader, Btn, Input, Modal, Drawer, Badge, Toast, Spinner, EmptyState } from '../components/ui'
import { Map, Plus, BookOpen, LayoutGrid, Trash2, ChevronRight, Search, Info, GripVertical, Move, CheckSquare } from 'lucide-react'

export default function Planes() {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [selectedPlan, setSelectedPlan] = useState(null)
  const [planMaterias, setPlanMaterias] = useState([])
  const [loadingM, setLoadingM] = useState(false)
  const [toast, setToast] = useState(null)
  const [busqueda, setBusqueda] = useState('')

  // Modales
  const [modalNew, setModalNew] = useState(false)
  const [modalAddMateria, setModalAddMateria] = useState(false)
  const [modalConfirm, setModalConfirm] = useState(null)

  // Formularios
  const [formPlan, setFormPlan] = useState({ carrera_id: '', nombre: '', vigente: true })
  const [formVincular, setFormVincular] = useState({ materia_id: '', semestre: '1', obligatoria: true })
  const [materiaSearch, setMateriaSearch] = useState('')

  const [carreras, setCarreras] = useState([])
  const [materiasBase, setMateriasBase] = useState([])
  const [saving, setSaving] = useState(false)

  // Drag and Drop State
  const [draggedItem, setDraggedItem] = useState(null)
  const [dropTargetSem, setDropTargetSem] = useState(null)

  // Prerrequisitos
  const [modalPrerrequisitos, setModalPrerrequisitos] = useState(false)
  const [selectedPM, setSelectedPM] = useState(null)
  const [prerrequisitos, setPrerrequisitos] = useState([])

  const notify = (msg, type = 'success') => { setToast({ message: msg, type }); setTimeout(() => setToast(null), 4000) }

  const load = async () => {
    setLoading(true)
    try {
      const [rP, rC] = await Promise.all([api.listar(), carrerasApi.listar()])
      setItems(rP.data)
      setCarreras(rC.data)
    } catch { notify('Error al cargar datos', 'error') }
    finally { setLoading(false) }
  }

  const loadPlanMaterias = async (planId) => {
    setLoadingM(true)
    try {
      const r = await api.materias(planId)
      setPlanMaterias(r.data)
    } catch { notify('Error al cargar materias del plan', 'error') }
    finally { setLoadingM(false) }
  }

  const loadMateriasBase = async () => {
    try {
      const r = await materiasApi.listar()
      setMateriasBase(r.data)
    } catch { }
  }

  useEffect(() => { load() }, [])

  const handleCreatePlan = async (e) => {
    e.preventDefault()
    setSaving(true)
    try {
      await api.crear(formPlan)
      notify('Plan creado exitosamente')
      setModalNew(false)
      load()
    } catch { notify('Error al crear plan', 'error') }
    finally { setSaving(false) }
  }

  const handleVincular = async (e, directMateriaId = null) => {
    if (e && e.preventDefault) e.preventDefault()
    const targetMId = directMateriaId || formVincular.materia_id
    if (!selectedPlan || !targetMId) return
    setSaving(true)
    try {
      await api.vincularMateria(targetMId, {
        materia_id: parseInt(targetMId),
        plan_estudio_id: selectedPlan.id,
        semestre: parseInt(formVincular.semestre),
        obligatoria: formVincular.obligatoria
      })
      notify('Materia vinculada al plan')
      setModalAddMateria(false)
      setMateriaSearch('')
      loadPlanMaterias(selectedPlan.id)
    } catch { notify('Error al vincular materia', 'error') }
    finally { setSaving(false) }
  }

  const handleDesvincular = (pmId, mNombre) => {
    setModalConfirm({
      title: 'Quitar Materia',
      msg: `¿Estás seguro de quitar "${mNombre}" de este plan de estudio?`,
      onConfirm: async () => {
        try {
          const rel = planMaterias.find(p => p.id === pmId)
          await api.desvincularMateria(rel.materia_id, selectedPlan.id)
          notify('Materia removida del plan')
          loadPlanMaterias(selectedPlan.id)
        } catch { notify('Error al remover materia', 'error') }
        setModalConfirm(null)
      }
    })
  }

  const openPrerrequisitos = async (pm) => {
    setSelectedPM(pm)
    setLoadingM(true)
    try {
      const r = await api.listarPrerrequisitos(pm.id)
      setPrerrequisitos(r.data)
      setModalPrerrequisitos(true)
    } catch { notify('Error al cargar prerrequisitos', 'error') }
    finally { setLoadingM(false) }
  }

  const handleAddPrerrequisito = async (requisitoId) => {
    try {
      await api.crearPrerrequisito(selectedPM.id, {
        plan_materia_id: selectedPM.id,
        requisito_id: requisitoId,
        activo: true
      })
      notify('Prerrequisito agregado')
      const r = await api.listarPrerrequisitos(selectedPM.id)
      setPrerrequisitos(r.data)
    } catch (err) {
      notify(err.response?.data?.detail || 'Error al agregar prerrequisito', 'error')
    }
  }

  const handleRemovePrerrequisito = async (prId) => {
    try {
      await api.eliminarPrerrequisito(prId)
      setPrerrequisitos(prev => prev.filter(p => p.id !== prId))
      notify('Prerrequisito eliminado')
    } catch { notify('Error al eliminar prerrequisito', 'error') }
  }

  const onDragStart = (e, item) => {
    setDraggedItem(item)
    e.dataTransfer.setData('application/json', JSON.stringify(item))
    e.dataTransfer.effectAllowed = 'move'
  }

  const onDragOver = (e, sem) => {
    e.preventDefault()
    setDropTargetSem(sem)
    e.dataTransfer.dropEffect = 'move'
  }

  const onDragLeave = (e) => {
    e.preventDefault()
    setDropTargetSem(null)
  }

  const onDrop = async (e, targetSem) => {
    e.preventDefault()
    setDropTargetSem(null)
    if (!draggedItem) return

    const newSem = targetSem

    try {
      const materiasEnTarget = planMaterias.filter(m => m.semestre === newSem)
      const maxOrden = Math.max(0, ...materiasEnTarget.map(m => m.orden || 0))
      const newOrden = maxOrden + 1

      setPlanMaterias(prev => prev.map(m =>
        m.id === draggedItem.id ? { ...m, semestre: newSem, orden: newOrden } : m
      ))

      await api.actualizarPosicion(draggedItem.id, {
        semestre: newSem,
        orden: newOrden
      })
      notify(`Materia movida al semestre ${newSem}`)
    } catch {
      notify('Error al mover materia', 'error')
      loadPlanMaterias(selectedPlan.id)
    } finally {
      setDraggedItem(null)
    }
  }

  if (loading) return <div className="h-screen flex items-center justify-center"><Spinner /></div>

  const filteredPlanes = items.filter(p =>
    p.nombre.toLowerCase().includes(busqueda.toLowerCase()) ||
    p.carrera_nombre.toLowerCase().includes(busqueda.toLowerCase())
  )

  const normalize = (str) => str ? str.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase() : ""

  const filteredMateriasBase = materiasBase.filter(m => {
    const search = normalize(materiaSearch)
    return normalize(m.nombre).includes(search) || normalize(m.clave_base || m.clave).includes(search)
  }).slice(0, 50)

  return (
    <div className="min-h-screen bg-slate-50/50">
      <PageHeader
        title="Planes de Estudio"
        subtitle="Diseño curricular y mapas de materias por carrera"
        icon={Map}
        actions={
          <Btn variant="white-gold" onClick={() => { setFormPlan({ carrera_id: '', nombre: '', vigente: true }); setModalNew(true) }} className="!rounded-xl shadow-glow">
            <Plus size={18} /> Nuevo Plan
          </Btn>
        }
      />

      <div className="px-8 py-8 grid grid-cols-12 gap-8">
        {/* Sidebar de Planes */}
        <div className="col-span-12 lg:col-span-4 space-y-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
            <input
              type="text"
              placeholder="Buscar plan o carrera..."
              className="form-input pl-10 text-md h-10 w-full rounded-2xl border-slate-200 bg-white shadow-sm"
              value={busqueda}
              onChange={e => setBusqueda(e.target.value)}
            />
          </div>

          <div className="bg-white rounded-[32px] border border-slate-100 shadow-sm overflow-hidden">
            <div className="max-h-[60vh] overflow-y-auto custom-scrollbar">
              {filteredPlanes.length === 0 ? (
                <div className="p-8 text-center"><p className="text-xs text-slate-400">No se encontraron planes</p></div>
              ) : (
                filteredPlanes.map(p => (
                  <div
                    key={p.id}
                    onClick={() => { setSelectedPlan(p); loadPlanMaterias(p.id) }}
                    className={`p-5 border-b border-slate-50 cursor-pointer transition-all ${selectedPlan?.id === p.id ? 'bg-brand-50/50 border-l-[6px] border-l-brand-500' : 'hover:bg-slate-50'}`}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-[16px] font-black text-brand-600 uppercase tracking-widest bg-brand-50 px-2 py-0.5 rounded-full">{p.carrera_clave}</span>
                      {p.vigente && <Badge estado="ACTIVO" />}
                    </div>
                    <p className="font-bold text-slate-900 text-sm leading-tight mb-1">{p.nombre}</p>
                    <p className="text-[16px] text-slate-500 font-medium truncate">{p.carrera_nombre}</p>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        {/* Detalle del Plan */}
        <div className="col-span-12 lg:col-span-8">
          {!selectedPlan ? (
            <EmptyState icon={Map} title="Selecciona un plan" description="Elige un plan de estudio de la lista para ver y gestionar su mapa curricular." />
          ) : (
            <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
              {/* Header Detalle */}
              <div className="bg-white p-6 rounded-[32px] border border-slate-100 shadow-sm flex flex-col md:flex-row items-center justify-between gap-4">
                <div className="flex items-center gap-4">
                  <div className="w-14 h-14 bg-brand-50 rounded-2xl flex items-center justify-center text-brand-600 shadow-inner">
                    <LayoutGrid size={28} />
                  </div>
                  <div>
                    <h2 className="text-xl font-black text-slate-900 tracking-tight">{selectedPlan.nombre}</h2>
                    <p className="text-xs text-slate-500 font-bold uppercase tracking-widest">{selectedPlan.carrera_nombre}</p>
                  </div>
                </div>
                <Btn onClick={() => { loadMateriasBase(); setModalAddMateria(true) }} size="md" className="!rounded-2xl shadow-glow w-full md:w-auto">
                  <Plus size={18} /> Vincular Materia
                </Btn>
              </div>

              {loadingM ? (
                <div className="py-20 flex justify-center"><Spinner /></div>
              ) : planMaterias.length === 0 ? (
                <div className="bg-white p-12 rounded-[32px] border border-slate-100 text-center space-y-4">
                  <div className="w-20 h-20 bg-slate-50 rounded-full flex items-center justify-center mx-auto">
                    <BookOpen size={40} className="text-slate-200" />
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-slate-900">Mapa curricular vacío</h3>
                    <p className="text-sm text-slate-400 max-w-xs mx-auto">Aún no has vinculado materias a este plan. Elige materias del catálogo para armar el mapa.</p>
                  </div>
                </div>
              ) : (
                <div className="space-y-10 pb-10">
                  {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map(sem => {
                    const materias = planMaterias.filter(m => m.semestre === sem).sort((a, b) => a.orden - b.orden)
                    if (materias.length === 0 && sem > Math.max(...planMaterias.map(m => m.semestre), 1)) return null;

                    return (
                      <div
                        key={sem}
                        className={`space-y-4 p-4 rounded-3xl transition-all ${dropTargetSem === sem ? 'bg-brand-50/50 ring-2 ring-brand-300 ring-dashed' : ''}`}
                        onDragOver={(e) => onDragOver(e, sem)}
                        onDragLeave={onDragLeave}
                        onDrop={(e) => onDrop(e, sem)}
                      >
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-lg bg-slate-900 text-white flex items-center justify-center text-[14px] font-black">{sem}</div>
                          <span className="text-xs font-black text-slate-800 uppercase tracking-widest">Semestre</span>
                          <div className="h-px bg-slate-200 flex-1"></div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                          {materias.map(m => (
                            <div
                              key={m.id}
                              draggable
                              onDragStart={(e) => onDragStart(e, m)}
                              className="flex items-center justify-between p-4 bg-white border border-slate-100 rounded-2xl hover:shadow-xl hover:border-brand-200 transition-all group/card cursor-grab active:cursor-grabbing min-h-[5.5rem]"
                            >
                              <div className="flex items-center gap-3 min-w-0 flex-1">
                                <div className="p-1 text-slate-300 shrink-0">
                                  <GripVertical size={16} />
                                </div>
                                <div className="w-10 h-10 rounded-xl bg-slate-50 flex items-center justify-center text-[16px] font-black text-brand-600 border border-slate-100 shrink-0">
                                  {m.clave}
                                </div>
                                <div className="min-w-0 flex-1">
                                  <p className="text-[16px] font-bold text-slate-800 leading-snug line-clamp-2" title={m.materia_nombre}>
                                    {m.materia_nombre}
                                  </p>
                                  <div className="flex items-center gap-2 mt-0.5">
                                    <span className="text-[12px] text-slate-400 font-black uppercase tracking-tighter shrink-0">{m.creditos_base} CRÉDITOS</span>
                                    {!m.obligatoria && <span className="text-[9px] bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded-lg font-black border border-amber-200 shrink-0 uppercase">OPCIONAL</span>}
                                  </div>
                                </div>
                              </div>
                              <div className="flex items-center gap-1 opacity-0 group-hover/card:opacity-100 transition-all shrink-0 ml-2">
                                <button
                                  onClick={(e) => { e.stopPropagation(); openPrerrequisitos(m) }}
                                  className="p-2 text-slate-300 hover:text-brand-500 hover:bg-brand-50 rounded-xl transition-all"
                                  title="Gestionar Seriación (Prerrequisitos)"
                                >
                                  <CheckSquare size={16} />
                                </button>
                                <button
                                  onClick={() => handleDesvincular(m.id, m.materia_nombre)}
                                  className="p-2 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-xl transition-all"
                                  title="Quitar del plan"
                                >
                                  <Trash2 size={16} />
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Modal Nuevo Plan */}
      <Modal open={modalNew} onClose={() => setModalNew(false)} title="Crear Plan de Estudio"
        footer={<div className="flex gap-2 justify-end"><Btn variant="secondary" onClick={() => setModalNew(false)}>Cancelar</Btn><Btn onClick={handleCreatePlan} loading={saving}>Crear Plan</Btn></div>}
      >
        <form onSubmit={handleCreatePlan} className="space-y-4">
          <div>
            <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1.5 block">Carrera Destino</label>
            <select
              className="form-input w-full rounded-xl border-slate-200 text-sm h-11"
              value={formPlan.carrera_id}
              onChange={e => setFormPlan({ ...formPlan, carrera_id: e.target.value })}
              required
            >
              <option value="">Selecciona una carrera...</option>
              {carreras.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
            </select>
          </div>
          <Input label="Nombre del Plan" placeholder="Ej: Plan 2024 (RVOE-123)" value={formPlan.nombre} onChange={e => setFormPlan({ ...formPlan, nombre: e.target.value })} required />
          <div className="flex items-center gap-2 p-4 bg-slate-50 rounded-2xl border border-slate-100">
            <input type="checkbox" id="vig" checked={formPlan.vigente} onChange={e => setFormPlan({ ...formPlan, vigente: e.target.checked })} className="w-4 h-4 rounded text-brand-600" />
            <label htmlFor="vig" className="text-xs font-bold text-slate-600">Plan Vigente (Habilitar para inscripciones)</label>
          </div>
        </form>
      </Modal>

      {/* Modal Vincular Materia */}
      <Modal open={modalAddMateria} onClose={() => { setModalAddMateria(false); setMateriaSearch('') }} title="Vincular Materia"
        footer={<div className="flex gap-2 justify-end"><Btn variant="secondary" onClick={() => setModalAddMateria(false)}>Cerrar</Btn></div>}
      >
        <div className="space-y-6">
          <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100 space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5 block">Semestre de inicio</label>
                <select
                  className="form-input w-full rounded-xl border-slate-200 text-sm h-10"
                  value={formVincular.semestre}
                  onChange={e => setFormVincular({ ...formVincular, semestre: e.target.value })}
                >
                  {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map(s => <option key={s} value={s}>Semestre {s}</option>)}
                </select>
              </div>
              <div className="pt-6">
                <label className="flex items-center gap-2 cursor-pointer group">
                  <div className={`w-5 h-5 rounded-lg border-2 flex items-center justify-center transition-all ${formVincular.obligatoria ? 'bg-brand-600 border-brand-600 text-white' : 'border-slate-300 bg-white group-hover:border-brand-400'}`}>
                    <input type="checkbox" className="hidden" checked={formVincular.obligatoria} onChange={e => setFormVincular({ ...formVincular, obligatoria: e.target.checked })} />
                    {formVincular.obligatoria && <CheckSquare size={14} />}
                  </div>
                  <span className="text-xs font-bold text-slate-600">Es Obligatoria</span>
                </label>
              </div>
            </div>
          </div>

          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
            <input
              autoFocus
              type="text"
              placeholder="Escribe el nombre o clave para buscar..."
              className="form-input pl-10 text-sm h-12 w-full rounded-2xl border-slate-200 shadow-sm"
              value={materiaSearch}
              onChange={e => setMateriaSearch(e.target.value)}
            />
          </div>

          <div className="space-y-2 max-h-[300px] overflow-y-auto pr-2 custom-scrollbar">
            {filteredMateriasBase.map(m => (
              <div
                key={m.id}
                className="group flex items-center justify-between p-4 bg-slate-50 hover:bg-brand-50 rounded-2xl border border-transparent hover:border-brand-200 transition-all cursor-pointer"
                onClick={() => {
                  handleVincular(null, m.id.toString())
                }}
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-white rounded-xl flex items-center justify-center text-[10px] font-black text-slate-400 group-hover:text-brand-600 shadow-sm">
                    {m.clave || '---'}
                  </div>
                  <div>
                    <p className="text-sm font-bold text-slate-800">{m.nombre}</p>
                    <p className="text-[10px] text-slate-400 font-bold uppercase">{m.creditos} Créditos</p>
                  </div>
                </div>
                <div className="p-2 bg-white rounded-xl text-slate-300 group-hover:text-brand-600 transition-colors shadow-sm">
                  <Plus size={18} />
                </div>
              </div>
            ))}
            {filteredMateriasBase.length === 0 && (
              <p className="text-center text-xs text-slate-400 py-4 italic">No hay materias disponibles para esta carrera.</p>
            )}
          </div>
        </div>
      </Modal>

      {/* Modal Confirmar */}
      <Modal open={!!modalConfirm} onClose={() => setModalConfirm(null)} title={modalConfirm?.title}
        footer={<div className="flex gap-2 justify-end"><Btn variant="secondary" onClick={() => setModalConfirm(null)}>Cancelar</Btn><Btn variant="danger" onClick={() => modalConfirm?.onConfirm()}>Confirmar</Btn></div>}
      >
        <div className="flex items-center gap-4 py-4">
          <div className="w-14 h-14 rounded-full bg-red-50 flex items-center justify-center text-red-500 flex-shrink-0">
            <BookOpen size={30} />
          </div>
          <p className="text-sm text-slate-600 leading-relaxed font-medium">{modalConfirm?.msg}</p>
        </div>
      </Modal>

      {/* Modal Prerrequisitos (Seriación) */}
      <Modal
        open={modalPrerrequisitos}
        onClose={() => setModalPrerrequisitos(false)}
        title={`Seriación: ${selectedPM?.materia_nombre}`}
        size="lg"
      >
        <div className="space-y-6">
          <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100">
            <p className="text-xs text-slate-500 font-bold uppercase tracking-widest mb-3">Requisitos actuales</p>
            {prerrequisitos.length === 0 ? (
              <p className="text-sm text-slate-400 italic">No tiene materias como prerrequisito.</p>
            ) : (
              <div className="space-y-2">
                {prerrequisitos.map(pr => (
                  <div key={pr.id} className="flex items-center justify-between p-3 bg-white rounded-xl border border-slate-100">
                    <div className="flex items-center gap-3">
                      <span className="text-[10px] font-black text-brand-600 bg-brand-50 px-2 py-0.5 rounded-md border border-brand-100">
                        {pr.requisito_clave}
                      </span>
                      <span className="text-sm font-bold text-slate-700">{pr.requisito_nombre}</span>
                    </div>
                    <button
                      onClick={() => handleRemovePrerrequisito(pr.id)}
                      className="p-1.5 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-lg"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="space-y-3">
            <p className="text-xs text-slate-500 font-bold uppercase tracking-widest">Agregar Requisito</p>
            <p className="text-[10px] text-slate-400 mb-2 italic">Solo se pueden elegir materias de semestres anteriores o del mismo semestre (si el diseño lo permite).</p>
            <div className="max-h-60 overflow-y-auto custom-scrollbar border border-slate-100 rounded-2xl">
              {planMaterias
                .filter(m => m.id !== selectedPM?.id && m.semestre <= (selectedPM?.semestre || 0))
                .filter(m => !prerrequisitos.some(pr => pr.requisito_id === m.id))
                .sort((a, b) => a.semestre - b.semestre || a.orden - b.orden)
                .map(m => (
                  <div
                    key={m.id}
                    onClick={() => handleAddPrerrequisito(m.id)}
                    className="flex items-center justify-between p-3 border-b border-slate-50 hover:bg-brand-50 cursor-pointer transition-all"
                  >
                    <div className="flex items-center gap-3">
                      <span className="text-[10px] font-bold text-slate-400">SEM {m.semestre}</span>
                      <span className="text-[10px] font-black text-slate-600 bg-slate-100 px-1.5 py-0.5 rounded uppercase">{m.clave}</span>
                      <span className="text-xs font-bold text-slate-700">{m.materia_nombre}</span>
                    </div>
                    <Plus size={16} className="text-brand-400" />
                  </div>
                ))
              }
              {planMaterias.filter(m => m.id !== selectedPM?.id && m.semestre <= (selectedPM?.semestre || 0)).length === 0 && (
                <div className="p-4 text-center text-xs text-slate-400">No hay materias disponibles para asignar como requisito.</div>
              )}
            </div>
          </div>
        </div>
      </Modal>

      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
    </div>
  )
}
