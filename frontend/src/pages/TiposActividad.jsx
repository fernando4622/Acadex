import { useState, useEffect } from 'react'
import { PageHeader } from '../components/layout/Layout'
import { Spinner, EmptyState, Btn, Modal, Drawer, Input, Toast, Badge } from '../components/ui'
import { Target, Plus, Pencil, Trash2, Power, Activity } from 'lucide-react'
import { tiposActividad as api } from '../api/endpoints'

export default function TiposActividad() {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState(null)
  const [saving, setSaving] = useState(false)
  const [toast, setToast] = useState(null)
  const [form, setForm] = useState({ nombre: '', descripcion: '', valor_ponderacion_sugerido: '' })

  const load = async () => {
    setLoading(true)
    try {
      const r = await api.listar()
      setItems(r.data)
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }
  useEffect(() => { load() }, [])

  const notify = (message, type = 'success') => {
    setToast({ message, type })
    setTimeout(() => setToast(null), 3000)
  }

  const openNew = () => {
    setForm({ nombre: '', descripcion: '', valor_ponderacion_sugerido: '' })
    setModal('new')
  }
  const openEdit = (item) => {
    setForm({
      nombre: item.nombre,
      descripcion: item.descripcion || '',
      valor_ponderacion_sugerido: item.valor_ponderacion_sugerido || ''
    })
    setModal(item)
  }

  const handleSave = async (e) => {
    if (e) e.preventDefault()
    setSaving(true)
    const body = {
      nombre: form.nombre,
      descripcion: form.descripcion || '',
      valor_ponderacion_sugerido: form.valor_ponderacion_sugerido || ''
    }
    try {
      if (modal === 'new') {
        await api.crear(body)
        notify('Tipo de actividad creado')
      } else {
        await api.actualizar(modal.id, body)
        notify('Tipo de actividad actualizado')
      }
      setModal(null)
      load()
    } catch (e) {
      notify(e.response?.data?.detail?.mensaje || 'Error al guardar', 'error')
    } finally {
      setSaving(false)
    }
  }

  const handleToggle = async (item) => {
    try {
      await api.actualizar(item.id, { activo: !item.activo })
      notify(item.activo ? 'Tipo desactivado' : 'Tipo activado')
      load()
    } catch (e) {
      notify(e.response?.data?.detail?.mensaje || 'Error', 'error')
    }
  }

  if (loading) return <Spinner />

  return (
    <div className="min-h-screen bg-slate-50/50">
      <PageHeader
        title="Tipos de Actividad"
        subtitle="Catálogo de tipos para las evaluaciones docentes"
        icon={Activity}
        actions={
          <Btn variant="white-gold" onClick={openNew} className="!rounded-xl px-5">
            <Plus size={18} /> Nuevo Tipo
          </Btn>
        }
      />

      <div className="px-8 py-8">
        {items.length === 0 ? (
          <EmptyState
            icon={Target}
            title="Sin tipos de actividad"
            description="Cree categorías como Examen, Tarea o Proyecto para clasificar las evaluaciones."
          />
        ) : (
          <div className="bg-white rounded-[24px] shadow-sm border border-slate-100 overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50/50">
                  <th className="text-left px-8 py-5 text-[11px] font-bold text-slate-400 uppercase tracking-[0.1em]">Nombre</th>
                  <th className="text-left px-8 py-5 text-[11px] font-bold text-slate-400 uppercase tracking-[0.1em]">Descripción</th>
                  <th className="text-center px-8 py-5 text-[11px] font-bold text-slate-400 uppercase tracking-[0.1em]">% Sugerido</th>
                  <th className="text-center px-8 py-5 text-[11px] font-bold text-slate-400 uppercase tracking-[0.1em]">Estado</th>
                  <th className="text-center px-8 py-5 text-[11px] font-bold text-slate-400 uppercase tracking-[0.1em]">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {items.map(item => (
                  <tr key={item.id} className="hover:bg-slate-50/50 transition-colors group cursor-pointer" onClick={() => openEdit(item)}>
                    <td className="px-8 py-5">
                      <span className="font-bold text-slate-900 text-[15px]">{item.nombre}</span>
                    </td>
                    <td className="px-8 py-5 text-slate-500 font-medium">
                      {item.descripcion || '—'}
                    </td>
                    <td className="px-8 py-5 text-center font-bold text-slate-900">
                      {item.valor_ponderacion_sugerido ? `${item.valor_ponderacion_sugerido}%` : '—'}
                    </td>
                    <td className="px-8 py-5 text-center">
                      <div className="flex justify-center">
                        <Badge estado={item.activo ? 'ACTIVA' : 'BAJA'} />
                      </div>
                    </td>
                    <td className="px-8 py-5 text-center">
                      <div className="flex items-center justify-center gap-1 opacity-60 group-hover:opacity-100 transition-opacity" onClick={e => e.stopPropagation()}>
                        <button
                          onClick={() => openEdit(item)}
                          className="p-2 rounded-xl hover:bg-slate-100 text-slate-400 hover:text-brand-600 transition-all"
                          title="Editar"
                        >
                          <Pencil size={18} strokeWidth={1.5} />
                        </button>
                        <button
                          onClick={() => handleToggle(item)}
                          className={`p-2 rounded-xl transition-all ${item.activo ? 'hover:bg-red-50 text-slate-400 hover:text-red-500' : 'hover:bg-emerald-50 text-slate-400 hover:text-emerald-500'}`}
                          title={item.activo ? 'Desactivar' : 'Activar'}
                        >
                          <Power size={18} strokeWidth={1.5} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <Drawer
        title={modal === 'new' ? 'Nuevo Tipo de Actividad' : 'Editar Tipo'}
        onClose={() => setModal(null)}
        open={!!modal}
        footer={
          <div className="flex justify-end gap-3">
            <Btn variant="secondary" onClick={() => setModal(null)}>Cancelar</Btn>
            <Btn onClick={handleSave} loading={saving}>
              {modal === 'new' ? 'Crear Tipo' : 'Guardar Cambios'}
            </Btn>
          </div>
        }
      >
        <form onSubmit={handleSave} className="space-y-5">
          <Input
            label="Nombre del Tipo"
            value={form.nombre}
            onChange={e => setForm(f => ({ ...f, nombre: e.target.value }))}
            placeholder="Ej: Examen Parcial"
            required
          />
          <Input
            label="Descripción"
            value={form.descripcion}
            onChange={e => setForm(f => ({ ...f, descripcion: e.target.value }))}
            placeholder="Evaluación escrita individual..."
          />
          <Input
            label="% Ponderación sugerido"
            type="number"
            value={form.valor_ponderacion_sugerido}
            onChange={e => setForm(f => ({ ...f, valor_ponderacion_sugerido: e.target.value }))}
            placeholder="Ej: 30"
          />
        </form>
      </Drawer>

      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
    </div>
  )
}
