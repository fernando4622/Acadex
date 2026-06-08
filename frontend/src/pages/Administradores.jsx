import { useState, useEffect } from 'react'
import { administracion as api } from '../api/endpoints'
import { PageHeader } from '../components/layout/Layout'
import { Card, Btn, Input, Modal, Table, Badge, ErrorMsg, Toast, EmptyState, Spinner } from '../components/ui'
import { UserCog, Plus, ShieldCheck, Mail, Users, Key } from 'lucide-react'

export default function Administradores() {
  const [items, setItems] = useState([])
  const [docentesNoAdmin, setDocentesNoAdmin] = useState([])
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState(null)
  const [saving, setSaving] = useState(false)
  const [toast, setToast] = useState(null)
  const [error, setError] = useState(null)
  const [form, setForm] = useState({ nombre: '', email: '', password: '' })
  const [selectedDocente, setSelectedDocente] = useState('')

  const load = async () => {
    setLoading(true)
    try {
      const [resAdmins, resDocentes] = await Promise.all([
        api.administradores(),
        api.docentesNoAdmin()
      ])
      setItems(resAdmins.data)
      setDocentesNoAdmin(resDocentes.data)
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  const notify = (m, t = 'success') => {
    setToast({ message: m, type: t })
    setTimeout(() => setToast(null), 3000)
  }

  const handleSave = async (e) => {
    if (e) e.preventDefault()
    setSaving(true)
    setError(null)
    try {
      if (modal === 'new') {
        await api.crearAdministrador(form)
        notify('Administrador registrado exitosamente')
      } else if (modal === 'assign') {
        if (!selectedDocente) throw new Error('Selecciona un docente')
        await api.asignarAdmin({ docente_id: selectedDocente })
        notify('Rol de administrador asignado al docente')
      }
      setModal(null)
      load()
    } catch (e) {
      setError(e.message || e.response?.data?.detail || 'Error al procesar la solicitud')
    } finally {
      setSaving(false)
    }
  }

  const cols = [
    {
      label: 'Administrador',
      render: (i) => (
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-darkerBlue flex items-center justify-center flex-shrink-0 shadow-sm">
            <span className="text-yellow-400 text-sm font-black uppercase">{i.nombre?.slice(0, 2) || 'AD'}</span>
          </div>
          <div className="min-w-0">
            <p className="font-black text-slate-900 text-sm uppercase tracking-tight truncate">
              {i.nombre}
            </p>
            <p className="text-[10px] text-slate-400 flex items-center gap-1 mt-0.5 font-medium">
              <Mail size={9} />{i.email}
            </p>
          </div>
        </div>
      )
    },
    {
      label: 'Perfil',
      className: 'text-center',
      render: (i) => (
        <div className="flex justify-center">
          {i.es_docente ? (
             <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-indigo-50 text-indigo-600 text-xs font-black border border-indigo-100">
               Docente + Admin
             </span>
          ) : (
             <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-emerald-50 text-emerald-600 text-xs font-black border border-emerald-100">
               Administrador Puro
             </span>
          )}
        </div>
      )
    }
  ]

  if (loading) return <Spinner />

  return (
    <div className="min-h-screen bg-slate-50/30">
      <PageHeader
        title="Gestión de Administradores"
        subtitle={`${items.length} administradores en el sistema`}
        icon={UserCog}
        actions={
          <div className="flex gap-2">
            <Btn variant="white-gold" onClick={() => { setSelectedDocente(''); setError(null); setModal('assign') }}>
              <ShieldCheck size={15} /> Asignar Rol a Docente
            </Btn>
            <Btn variant="white-gold" onClick={() => {
              setForm({ nombre: '', email: '', password: '' });
              setError(null);
              setModal('new');
            }}>
              <Plus size={15} /> Nuevo Admin Puro
            </Btn>
          </div>
        }
      />

      <div className="p-8 space-y-6">
        <div className="bg-white rounded-[24px] border border-slate-100 overflow-hidden shadow-sm">
          <Table
            columns={cols}
            data={items}
            empty={<EmptyState icon={UserCog} title="Sin administradores" description="No hay administradores registrados" />}
          />
        </div>
      </div>

      {/* Modal Nuevo Admin */}
      <Modal open={modal === 'new'} onClose={() => setModal(null)} title="Registrar Administrador Puro"
        footer={<div className="flex gap-2 justify-end w-full"><Btn variant="secondary" onClick={() => setModal(null)}>Cancelar</Btn><Btn onClick={handleSave} loading={saving}>Registrar</Btn></div>}
      >
        <form onSubmit={handleSave} className="space-y-4">
          {error && <ErrorMsg error={error} />}
          <div className="bg-brand-50 rounded-xl p-3.5 text-xs text-brand-700">
            <p className="font-semibold mb-1 text-darkerBlue">Administrador Puro</p>
            <p>Se creará un usuario con rol de Administrador que no está vinculado a ningún registro de Docente ni Alumno.</p>
          </div>

          <Input label="Nombre o Identificador *" value={form.nombre} onChange={e => setForm({ ...form, nombre: e.target.value })} required />
          <Input label="Correo Electrónico *" type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} required />
          <Input label="Contraseña *" type="password" value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} required minLength={8} />
        </form>
      </Modal>

      {/* Modal Asignar Admin a Docente */}
      <Modal open={modal === 'assign'} onClose={() => setModal(null)} title="Asignar Rol Admin a Docente"
        footer={<div className="flex gap-2 justify-end w-full"><Btn variant="secondary" onClick={() => setModal(null)}>Cancelar</Btn><Btn onClick={handleSave} loading={saving} disabled={!selectedDocente}>Asignar Rol</Btn></div>}
      >
        <form onSubmit={handleSave} className="space-y-4">
          {error && <ErrorMsg error={error} />}
          <div className="bg-indigo-50 rounded-xl p-3.5 text-xs text-indigo-700">
            <p className="font-semibold mb-1">Docente Administrador</p>
            <p>Selecciona un docente activo en el sistema. El docente podrá cambiar entre el perfil Docente y el perfil Administrador.</p>
          </div>

          <div className="space-y-1">
            <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest px-1">Docente</label>
            <select
              className="w-full bg-white border border-slate-200 rounded-xl px-4 py-2.5 text-sm font-semibold text-slate-700 outline-none focus:border-brand-500 transition-colors shadow-sm"
              value={selectedDocente}
              onChange={e => setSelectedDocente(e.target.value)}
              required
            >
              <option value="">-- Selecciona un docente --</option>
              {docentesNoAdmin.map(d => (
                <option key={d.id} value={d.id}>
                  {d.nombre} {d.apellido_pat} {d.apellido_mat} ({d.email})
                </option>
              ))}
            </select>
          </div>
        </form>
      </Modal>

      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
    </div>
  )
}
