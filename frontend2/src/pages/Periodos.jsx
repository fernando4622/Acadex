import { useState, useEffect } from 'react'
import { useAuth } from '../context/AuthContext'
import { periodos as periodosApi } from '../api/endpoints'
import { PageHeader } from '../components/layout/Layout'
import { Btn, Input, Modal, Table, Badge, ErrorMsg, Toast, EmptyState, Spinner, StatCard } from '../components/ui'
import { Plus, Calendar, CheckCircle, Clock, Lock, ChevronRight } from 'lucide-react'

export default function Periodos() {
  const { isAdmin } = useAuth()
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState(false)
  const [form, setForm] = useState({ codigo: '', nombre: '', fecha_inicio: '', fecha_fin: '' })


  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const [toast, setToast] = useState(null)

  const notify = (msg, type = 'success') => { setToast({ message: msg, type }); setTimeout(() => setToast(null), 4000) }

  async function cargar() {
    try {
      setLoading(true)
      const r = await periodosApi.listar()
      setItems(r.data)
    } catch (err) {
      setError(err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { cargar() }, [])

  async function crear(e) {
    e.preventDefault(); setSaving(true); setError(null)
    try {
      await periodosApi.crear(form)
      setModal(false)
      setForm({ codigo: '', nombre: '', fecha_inicio: '', fecha_fin: '' })

      await cargar()
      notify('Periodo académico registrado correctamente')

    } catch (err) { 
      const msg = err?.response?.data?.detail?.mensaje || err?.response?.data?.detail?.[0]?.msg || 'Error al registrar periodo'
      setError(msg)
    } finally { 
      setSaving(false) 
    }
  }

  async function handleActivar(id) {
    try {
      await periodosApi.activar(id)
      await cargar()
      notify('Periodo activado exitosamente')
    } catch (err) { notify(err?.response?.data?.detail?.mensaje || 'Error', 'error') }
  }

  async function handleCerrar(id) {
    try {
      await periodosApi.cerrar(id)
      await cargar()
      notify('Periodo cerrado exitosamente')
    } catch (err) { notify(err?.response?.data?.detail?.mensaje || 'Error', 'error') }
  }

  const cols = [
    {
      label: 'Ciclo Escolar',
      render: (p) => (
        <div className="flex items-center gap-4 group">
          <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 shadow-sm border border-white/10 transition-colors ${p.estado?.toUpperCase() === 'ACTIVO' ? 'bg-emerald-500 text-white shadow-emerald-200' : p.estado?.toUpperCase() === 'PROXIMO' ? 'bg-sky-500 text-white shadow-sky-200' : 'bg-slate-100 text-slate-400'}`}>
            <Calendar size={18} />
          </div>

          <div>
            <p className="font-black text-slate-900 uppercase tracking-tight text-sm group-hover:text-darkerBlue transition-colors">{p.nombre}</p>
            <p className="text-[10px] font-mono font-bold text-slate-400 uppercase tracking-widest">{p.codigo}</p>
          </div>
        </div>
      )
    },
    { 
      label: 'Vigencia', 
      render: (p) => (
        <div className="text-xs text-slate-600">
          <p className="font-bold text-slate-900">{new Date(p.fecha_inicio).toLocaleDateString(undefined, { month: 'short', year: 'numeric' })}</p>
          <p className="opacity-60 text-[10px] uppercase font-black tracking-tighter">al {new Date(p.fecha_fin).toLocaleDateString(undefined, { month: 'short', year: 'numeric' })}</p>
        </div>
      ) 
    },
    { 
      label: 'Estado', 
      render: (p) => (
        <div className="flex items-center gap-2">
           <Badge estado={p.estado} />
        </div>
      )
    },
    {
      label: 'Acciones',
      className: 'w-32 text-right',
      render: (p) => (
        <div className="flex items-center justify-end gap-2">
          {p.estado?.toUpperCase() === 'PROXIMO' && (
            <button onClick={() => handleActivar(p.id)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-50 text-emerald-600 hover:bg-emerald-500 hover:text-white transition-all text-[10px] font-black uppercase tracking-widest">
              <CheckCircle size={12}/> Activar
            </button>
          )}
          {p.estado?.toUpperCase() === 'ACTIVO' && (
            <button onClick={() => handleCerrar(p.id)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-100 text-slate-600 hover:bg-darkerBlue hover:text-white transition-all text-[10px] font-black uppercase tracking-widest">
              <Lock size={12}/> Cerrar
            </button>
          )}
        </div>

      )
    }
  ]

  if (loading && !items.length) return <Spinner />

  return (
    <div className="min-h-screen bg-slate-50/30">
      <PageHeader 
        title="Periodos Académicos" 
        subtitle="Administración del calendario y ciclos escolares" 
        icon={Calendar}
        actions={isAdmin && (
          <Btn onClick={() => { setModal(true); setError(null) }}><Plus size={18} /> Nuevo Periodo</Btn>
        )}
      />

      <div className="p-8 max-w-7xl mx-auto space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <StatCard label="Periodo Vigente" value={items.find(p => p.estado?.toUpperCase() === 'ACTIVO')?.codigo || 'Ninguno'} sub="Ciclo escolar actual" icon={Calendar} color="institucional-dark" />
          <StatCard label="Próximos" value={items.filter(p => p.estado?.toUpperCase() === 'PROXIMO').length} sub="Semestres planeados" icon={Clock} color="institucional" />
          <StatCard label="Histórico" value={items.filter(p => p.estado?.toUpperCase() === 'CERRADO').length} sub="Ciclos finalizados" icon={CheckCircle} color="institucional" />
        </div>


        <div className="bg-white rounded-[24px] border border-slate-100 overflow-hidden shadow-sm">
          <Table 
            columns={cols} 
            data={items}
            empty={<EmptyState icon={Calendar} title="Sin periodos registrados" description="Comienza registrando el próximo ciclo escolar" />}
          />
        </div>
      </div>

      <Modal open={modal} onClose={() => setModal(false)} title="Nuevo Periodo Académico"
        footer={<div className="flex gap-2 justify-end"><Btn variant="secondary" onClick={() => setModal(false)}>Cancelar</Btn><Btn form="fp" type="submit" loading={saving}>Crear Periodo</Btn></div>}
      >
        <form id="fp" onSubmit={crear} className="space-y-4">
          {error && <ErrorMsg error={error} />}
          <div className="p-4 bg-brand-50 rounded-xl border border-brand-100 text-xs text-brand-700 leading-relaxed">
            <p className="font-black uppercase tracking-widest mb-1">Nota importante:</p>
            El nuevo periodo se creará en estado <b>PRÓXIMO</b>. Deberás activarlo manualmente desde la lista cuando el ciclo escolar comience.
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Input 
              label="Clave / Código" 
              value={form.codigo} 
              onChange={e => setForm(f => ({ ...f, codigo: e.target.value.toUpperCase() }))} 
              required placeholder="Ej: 2024-2"
            />
            <Input 
              label="Nombre Público" 
              value={form.nombre} 
              onChange={e => setForm(f => ({ ...f, nombre: e.target.value }))} 
              required placeholder="Agosto - Diciembre 2024"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Input 
              label="Fecha de Inicio" type="date"
              value={form.fecha_inicio} 
              onChange={e => setForm(f => ({ ...f, fecha_inicio: e.target.value }))} 
              required 
            />
            <Input 
              label="Fecha de Cierre" type="date"
              value={form.fecha_fin} 
              onChange={e => setForm(f => ({ ...f, fecha_fin: e.target.value }))} 
              required 
            />
          </div>


        </form>
      </Modal>

      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
    </div>
  )
}
