import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { grupos as gruposApi, materias as materiasApi, docentes as docentesApi, periodos as periodosApi } from '../api/endpoints'
import { PageHeader } from '../components/layout/Layout'
import {
  StatCard, Badge, Spinner, EmptyState, Btn, Modal, Input,
  ErrorMsg, Toast, ConfirmDialog, Table, SearchInput
} from '../components/ui'
import {
  BookOpen, Users, CheckCircle, Clock, Plus, Trash2, User,
  GraduationCap, Calendar, ChevronRight
} from 'lucide-react'

// ── Grupos del ADMIN ───────────────────────────────────────────────────────
function GruposAdmin() {
  const [grupos, setGrupos] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [search, setSearch] = useState('')
  const [toast, setToast] = useState(null)
  const navigate = useNavigate()

  const [modal, setModal] = useState(false)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({
    materia_id: '', docente_id: '', periodo_id: '', letra_grupo: ''
  })
  const [opts, setOpts] = useState({ materias: [], docentes: [], periodos: [] })
  const [confirmDel, setConfirmDel] = useState({ open: false, id: null, loading: false })

  const notify = (msg, type = 'success') => {
    setToast({ message: msg, type });
    setTimeout(() => setToast(null), 3500)
  }

  async function cargar() {
    setLoading(true)
    try {
      const res = await gruposApi.listar()
      setGrupos(res.data)
    } catch (err) {
      setError('Error al conectar con el servidor de grupos')
    } finally {
      setLoading(false)
    }
  }

  async function cargarCatalogos() {
    try {
      const [m, d, p] = await Promise.all([
        materiasApi.listar(),
        docentesApi.listar(),
        periodosApi.listar()
      ])
      setOpts({
        materias: m.data.filter(x => x.activa),
        docentes: d.data.filter(x => x.activo),
        periodos: p.data.filter(x => !x.cerrado)
      })
    } catch (err) {
      setError('Error al cargar catálogos para el nuevo grupo')
    }
  }

  useEffect(() => { cargar() }, [])

  async function handleCrear(e) {
    e.preventDefault()
    setSaving(true); setError(null)

    const periodo = opts.periodos.find(p => p.id.toString() === form.periodo_id.toString())?.codigo ?? ''
    const materia = opts.materias.find(m => m.id.toString() === form.materia_id.toString())?.clave ?? ''
    const nombreAuto = `${periodo} ${materia}${form.letra_grupo.toUpperCase()}`.trim()

    try {
      await gruposApi.crear({
        nombre: nombreAuto,
        materia_id: form.materia_id,
        docente_id: form.docente_id,
        periodo_id: parseInt(form.periodo_id)
      })
      setModal(false)
      setForm({ materia_id: '', docente_id: '', periodo_id: '', letra_grupo: '' })
      await cargar()
      notify('Grupo académico creado con éxito')
    } catch (err) {
      setError(err?.response?.data?.detail?.mensaje ?? 'No se pudo crear el grupo')
    } finally {
      setSaving(false)
    }
  }

  async function handleEliminar() {
    setConfirmDel(prev => ({ ...prev, loading: true }))
    try {
      await gruposApi.eliminar(confirmDel.id)
      await cargar()
      notify('Grupo eliminado del sistema')
    } catch (err) {
      notify('Error: El grupo tiene inscripciones activas', 'error')
    } finally {
      setConfirmDel({ open: false, id: null, loading: false })
    }
  }

  const filtered = grupos.filter(g =>
    g.nombre?.toLowerCase().includes(search.toLowerCase()) ||
    g.materia_nombre?.toLowerCase().includes(search.toLowerCase()) ||
    g.docente_nombre?.toLowerCase().includes(search.toLowerCase())
  )

  const columns = [
    {
      label: 'Grupo',
      render: (g) => (
        <div className="flex items-center gap-4 group">
          <div className="w-10 h-10 rounded-xl bg-darkerBlue text-white flex items-center justify-center shadow-inner border border-white/10 group-hover:bg-yellow-600 transition-colors">
            <BookOpen size={18} />
          </div>
          <div>
            <p className="text-sm font-black text-slate-900 uppercase tracking-tight group-hover:text-darkerBlue transition-colors">{g.nombre}</p>
            <p className="text-[10px] font-bold text-brand-600 uppercase tracking-widest">{g.materia_nombre}</p>
          </div>
        </div>
      )
    },
    {
      label: 'Docente Asignado',
      render: (g) => (
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-full bg-slate-100 flex items-center justify-center">
            <User size={14} className="text-slate-400" />
          </div>
          <p className="text-xs font-bold text-slate-700">{g.docente_nombre || 'Sin asignar'}</p>
        </div>
      )
    },
    {
      label: 'Periodo',
      render: (g) => (
        <div className="flex items-center gap-2 text-slate-500">
          <Calendar size={14} />
          <span className="text-xs font-black uppercase">{g.periodo_codigo || '—'}</span>
        </div>
      )
    },
    {
      label: 'Estado',
      className: 'w-32',
      render: (g) => <Badge estado={g.cerrado ? 'FINALIZADO' : 'ACTIVO'} />
    },
    {
      label: 'Acciones',
      className: 'w-28 text-right',
      render: (g) => (
        <div className="flex justify-end gap-1">
          <button onClick={(e) => { e.stopPropagation(); navigate(`/grupos/${g.id}`) }} className="btn-icon" title="Ver detalles">
            <ChevronRight size={16} />
          </button>
          <button onClick={(e) => { e.stopPropagation(); setConfirmDel({ open: true, id: g.id, loading: false }) }} className="btn-icon text-rose-500 hover:bg-rose-50" title="Eliminar">
            <Trash2 size={16} />
          </button>
        </div>
      )
    }
  ]

  if (loading && !grupos.length) return <Spinner />

  return (
    <div className="min-h-screen bg-slate-50/30">
      <PageHeader
        title="Gestión de Grupos"
        subtitle="Administración centralizada de secciones y asignaciones"
        icon={Users}
        actions={
          <Btn variant="white-gold" onClick={() => { setModal(true); cargarCatalogos(); setError(null) }}>
            <Plus size={18} /> Nuevo Grupo
          </Btn>
        }
      />

      <div className="p-8 max-w-7xl mx-auto space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <StatCard label="Total de Grupos" value={grupos.length} icon={Users} color="institucional-dark" />
          <StatCard label="Grupos Activos" value={grupos.filter(g => !g.cerrado).length} icon={Clock} color="institucional" />
          <StatCard label="Finalizados" value={grupos.filter(g => g.cerrado).length} icon={CheckCircle} color="institucional" />
        </div>

        <div className="bg-white rounded-[24px] border border-slate-100 p-3 shadow-card">
          <SearchInput
            value={search}
            onChange={setSearch}
            placeholder="Buscar por nombre, materia o docente..."
            className="max-w-md"
          />
        </div>

        <div className="bg-white rounded-[24px] border border-slate-100 overflow-hidden shadow-sm">
          <Table
            columns={columns}
            data={filtered}
            onRowClick={(g) => navigate(`/grupos/${g.id}`)}
            empty={<EmptyState icon={BookOpen} title="No hay grupos" description="Comienza creando un nuevo grupo académico" />}
          />
        </div>
      </div>

      <Modal open={modal} onClose={() => setModal(false)} title="Crear Nuevo Grupo Académico"
        footer={
          <div className="flex gap-2 justify-end">
            <Btn variant="secondary" onClick={() => setModal(false)}>Cancelar</Btn>
            <Btn form="form-grupo" type="submit" loading={saving}>Crear Grupo</Btn>
          </div>
        }
      >
        <form id="form-grupo" onSubmit={handleCrear} className="space-y-4">
          {error && <ErrorMsg error={error} />}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-1">Periodo Escolar</label>
              <select className="input" value={form.periodo_id} onChange={e => setForm(f => ({ ...f, periodo_id: e.target.value }))} required>
                <option value="">Seleccione...</option>
                {opts.periodos.map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}
              </select>
            </div>
            <Input
              label="Sufijo / Letra"
              value={form.letra_grupo}
              onChange={e => setForm(f => ({ ...f, letra_grupo: e.target.value }))}
              required
              placeholder="A, B, C..."
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-1">Asignatura (Materia)</label>
            <select className="input" value={form.materia_id} onChange={e => setForm(f => ({ ...f, materia_id: e.target.value }))} required>
              <option value="">Seleccione...</option>
              {opts.materias.map(m => <option key={m.id} value={m.id}>{m.nombre} ({m.clave})</option>)}
            </select>
          </div>
          <div className="space-y-1.5">
            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-1">Docente Responsable</label>
            <select className="input" value={form.docente_id} onChange={e => setForm(f => ({ ...f, docente_id: e.target.value }))} required>
              <option value="">Seleccione...</option>
              {opts.docentes.map(d => <option key={d.id} value={d.id}>{d.nombre} {d.apellido_pat}</option>)}
            </select>
          </div>
          <div className="p-3 bg-brand-50/50 rounded-xl border border-brand-100">
            <p className="text-[10px] font-bold text-brand-600 uppercase">Previsualización del nombre:</p>
            <p className="text-sm font-black text-darkerBlue">
              {opts.periodos.find(p => p.id.toString() === form.periodo_id.toString())?.codigo || 'PER'} {opts.materias.find(m => m.id.toString() === form.materia_id.toString())?.clave || 'MAT'}{form.letra_grupo.toUpperCase() || 'X'}
            </p>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        open={confirmDel.open}
        title="¿Eliminar Grupo?"
        message="Esta acción no se puede deshacer. Solo se pueden eliminar grupos que no tengan alumnos inscritos."
        onConfirm={handleEliminar}
        onCancel={() => setConfirmDel({ open: false, id: null, loading: false })}
        loading={confirmDel.loading}
      />

      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
    </div>
  )
}

// ── Grupos del DOCENTE ──────────────────────────────────────────────────────
function GruposDocente() {
  const [grupos, setGrupos] = useState([])
  const [loading, setLoading] = useState(true)
  const navigate = useNavigate()

  useEffect(() => {
    gruposApi.listar()
      .then(res => setGrupos(res.data))
      .finally(() => setLoading(false))
  }, [])

  if (loading) return <Spinner />

  return (
    <div className="min-h-screen bg-slate-50/30">
      <PageHeader
        title="Mis Grupos"
        subtitle="Control académico de tus asignaturas vigentes"
        icon={GraduationCap}
      />
      <div className="p-8 max-w-7xl mx-auto space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <StatCard label="Mis Grupos" value={grupos.length} icon={BookOpen} color="institucional-dark" />
          <StatCard label="Grupos Activos" value={grupos.filter(g => !g.cerrado).length} icon={Clock} color="institucional" />
          <StatCard label="Finalizados" value={grupos.filter(g => g.cerrado).length} icon={CheckCircle} color="institucional" />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">

          {grupos.length === 0 ? (
            <div className="col-span-full">
              <EmptyState icon={BookOpen} title="Sin grupos asignados" description="No tienes grupos registrados en el periodo actual" />
            </div>
          ) : (
            grupos.map(g => (
              <div
                key={g.id}
                onClick={() => navigate(`/grupos/${g.id}`)}
                className="group bg-white rounded-[24px] border border-slate-100 p-6 shadow-sm hover:shadow-card hover:-translate-y-1 transition-all cursor-pointer relative overflow-hidden"
              >
                <div className="absolute top-0 right-0 w-32 h-32 bg-slate-50 rounded-full -translate-y-16 translate-x-16 group-hover:scale-110 transition-transform" />

                <div className="relative">
                  <div className="flex justify-between items-start mb-4">
                    <Badge estado={g.cerrado ? 'FINALIZADO' : 'ACTIVO'} />
                    <div className="p-2 rounded-lg bg-slate-50 text-slate-400 group-hover:bg-darkerBlue group-hover:text-white transition-colors">
                      <ChevronRight size={16} />
                    </div>
                  </div>

                  <h3 className="font-black text-slate-900 uppercase leading-tight mb-1 group-hover:text-darkerBlue transition-colors">{g.nombre}</h3>
                  <p className="text-[10px] font-bold text-brand-600 uppercase tracking-widest mb-4">{g.materia_nombre}</p>

                  <div className="flex items-center gap-2 pt-4 border-t border-slate-50">
                    <Calendar size={14} className="text-slate-400" />
                    <span className="text-xs font-bold text-slate-500 uppercase">{g.periodo_codigo}</span>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

export default function Grupos() {
  const { isAdmin } = useAuth()
  return isAdmin ? <GruposAdmin /> : <GruposDocente />
}
