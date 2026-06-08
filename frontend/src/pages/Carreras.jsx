import { useState, useEffect } from 'react'
import { useAuth } from '../context/AuthContext'
import { carreras as api } from '../api/endpoints'
import { PageHeader } from '../components/layout/Layout'
import { 
  StatCard, Badge, Spinner, EmptyState, Btn, Modal, Drawer, Input, 
  ErrorMsg, Toast, ConfirmDialog, Table 
} from '../components/ui'
import {
  GraduationCap, Plus, Pencil, Power, Briefcase, 
  CheckCircle, Clock
} from 'lucide-react'

export default function Carreras() {
  const { isAdmin } = useAuth()
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const [toast, setToast] = useState(null)
  const [form, setForm] = useState({ clave: '', nombre: '', descripcion: '', activo: true })
  const [confirmToggle, setConfirmToggle] = useState({ open: false, item: null })

  const notify = (msg, type = 'success') => { 
    setToast({ message: msg, type }); 
    setTimeout(() => setToast(null), 3500) 
  }

  const load = async () => {
    setLoading(true)
    try {
      const r = await api.listar()
      setItems(r.data)
    } catch (e) {
      setError('Error al conectar con el servidor de carreras')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  const handleSave = async (e) => {
    e.preventDefault()
    setSaving(true); setError(null)
    try {
      if (modal === 'new') {
        await api.crear(form)
        notify('Programa académico registrado con éxito')
      } else {
        await api.actualizar(modal.id, form)
        notify('Información de carrera actualizada')
      }
      setModal(null)
      load()
    } catch (e) {
      setError(e.response?.data?.detail?.mensaje || 'Error al procesar la solicitud')
    } finally {
      setSaving(false)
    }
  }

  const handleToggle = async () => {
    const { item } = confirmToggle
    try {
      await api.actualizar(item.id, { ...item, activo: !item.activo })
      notify(item.activo ? 'Carrera desactivada' : 'Carrera reactivada')
      load()
    } catch (e) {
      notify('No se pudo cambiar el estado de la carrera', 'error')
    } finally {
      setConfirmToggle({ open: false, item: null })
    }
  }

  const columns = [
    {
      label: 'Identificación',
      render: (item) => (
        <div className="flex items-center gap-4 group">
          <div className="w-10 h-10 rounded-xl bg-darkerBlue text-white flex items-center justify-center shadow-inner border border-white/10 font-black text-xs uppercase tracking-tighter group-hover:bg-yellow-600 transition-colors">
            {item.clave}
          </div>
          <div>
            <p className="text-sm font-black text-slate-900 uppercase tracking-tight group-hover:text-darkerBlue transition-colors">{item.nombre}</p>
            <p className="text-[10px] font-bold text-brand-600 uppercase tracking-widest">Programa Institucional</p>
          </div>
        </div>
      )
    },
    {
      label: 'Descripción / Perfil',
      render: (item) => (
        <p className="text-xs font-medium text-slate-500 max-w-md line-clamp-2 italic">
          {item.descripcion || 'Sin descripción detallada'}
        </p>
      )
    },
    {
      label: 'Estado',
      className: 'w-32',
      render: (item) => <Badge estado={item.activo ? 'ACTIVA' : 'BAJA'} />
    },
    {
      label: 'Acciones',
      className: 'w-28 text-right',
      render: (item) => (
        <div className="flex justify-end gap-1" onClick={e => e.stopPropagation()}>
          <button 
            onClick={() => { setForm({ ...item }); setModal(item) }} 
            className="btn-icon" 
            title="Editar carrera"
          >
            <Pencil size={16} />
          </button>
          <button 
            onClick={() => setConfirmToggle({ open: true, item })} 
            className={`btn-icon ${item.activo ? 'text-rose-500 hover:bg-rose-50' : 'text-emerald-500 hover:bg-emerald-50'}`}
            title={item.activo ? 'Desactivar' : 'Activar'}
          >
            <Power size={16} />
          </button>
        </div>
      )
    }
  ]

  if (loading && !items.length) return <Spinner />

  return (
    <div className="min-h-screen bg-slate-50/30">
      <PageHeader
        title="Oferta Educativa"
        subtitle="Administración de carreras y programas académicos"
        icon={GraduationCap}
        actions={isAdmin && (
          <Btn variant="white-gold" onClick={() => { setForm({ clave: '', nombre: '', descripcion: '', activo: true }); setModal('new'); setError(null) }}>
            <Plus size={18} /> Nueva Carrera
          </Btn>
        )}
      />

      <div className="p-8 max-w-7xl mx-auto space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <StatCard label="Total de Carreras" value={items.length} icon={Briefcase} color="institucional-dark" />
          <StatCard label="Programas Activos" value={items.filter(i => i.activo).length} icon={CheckCircle} color="institucional" />
          <StatCard label="En Pausa / Baja" value={items.filter(i => !i.activo).length} icon={Clock} color="institucional" />
        </div>

        <div className="bg-white rounded-[24px] border border-slate-100 overflow-hidden shadow-sm">
          <Table
            columns={columns}
            data={items} onRowClick={(item) => { setForm({ ...item }); setModal(item) }}
            empty={<EmptyState icon={GraduationCap} title="No hay carreras" description="Comienza registrando la oferta educativa de la institución" />}
          />
        </div>
      </div>

      <Drawer 
        open={!!modal} 
        onClose={() => setModal(null)} 
        title={modal === 'new' ? 'Registrar Nueva Carrera' : 'Editar Programa Académico'}
        footer={
          <div className="flex gap-2 justify-end">
            <Btn variant="secondary" onClick={() => setModal(null)}>Cancelar</Btn>
            <Btn onClick={handleSave} loading={saving}>
              {modal === 'new' ? 'Crear Carrera' : 'Guardar Cambios'}
            </Btn>
          </div>
        }
      >
        <form onSubmit={handleSave} className="space-y-4">
          {error && <ErrorMsg error={error} />}
          <div className="grid grid-cols-3 gap-4">
            <div className="col-span-1">
              <Input
                label="Clave"
                value={form.clave}
                onChange={e => setForm(f => ({ ...f, clave: e.target.value.toUpperCase() }))}
                placeholder="Ej: IS"
                required
              />
            </div>
            <div className="col-span-2">
              <Input
                label="Nombre Oficial"
                value={form.nombre}
                onChange={e => setForm(f => ({ ...f, nombre: e.target.value }))}
                placeholder="Ej: Ingeniería en Sistemas..."
                required
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-1">Descripción del Programa</label>
            <textarea 
              className="input min-h-[100px] py-3 resize-none"
              value={form.descripcion}
              onChange={e => setForm(f => ({ ...f, descripcion: e.target.value }))}
              placeholder="Describa brevemente el objetivo o perfil de la carrera..."
            />
          </div>
        </form>
      </Drawer>

      <ConfirmDialog
        open={confirmToggle.open}
        title={confirmToggle.item?.activo ? '¿Desactivar Carrera?' : '¿Activar Carrera?'}
        message={confirmToggle.item?.activo 
          ? 'La carrera dejará de estar disponible para nuevos grupos y alumnos.' 
          : 'La carrera volverá a estar disponible en todos los catálogos del sistema.'}
        onConfirm={handleToggle}
        onCancel={() => setConfirmToggle({ open: false, item: null })}
      />

      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
    </div>
  )
}
