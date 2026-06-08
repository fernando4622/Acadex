import { useState } from 'react'
import { PageHeader } from '../components/layout/Layout'
import { Btn, Input, Toast } from '../components/ui'
import { UserCog, Lock, Eye, EyeOff } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import client from '../api/client'

export default function Perfil() {
  const { user, rolPrincipal } = useAuth()
  const [pw, setPw] = useState({ actual: '', nueva: '', confirmar: '' })
  const [showPw, setShowPw] = useState({ actual: false, nueva: false, confirmar: false })
  const [toast, setToast] = useState(null)
  const notify = (m, t = 'success') => { setToast({ message: m, type: t }); setTimeout(() => setToast(null), 3000) }

  const cambiarPassword = async () => {
    if (pw.nueva !== pw.confirmar) return notify('Las contraseñas no coinciden', 'error')
    if (pw.nueva.length < 6) return notify('Mínimo 6 caracteres', 'error')
    try {
      await client.post('/auth/cambiar-password', { password_actual: pw.actual, password_nueva: pw.nueva })
      notify('Contraseña actualizada')
      setPw({ actual: '', nueva: '', confirmar: '' })
      setShowPw({ actual: false, nueva: false, confirmar: false })
    } catch (e) { notify(e.response?.data?.detail?.mensaje || 'Error al cambiar contraseña', 'error') }
  }

  const toggleIcon = (field) => (
    <button type="button" onClick={() => setShowPw(p => ({ ...p, [field]: !p[field] }))} className="text-slate-400 hover:text-slate-600 transition-colors focus:outline-none">
      {showPw[field] ? <EyeOff size={18} /> : <Eye size={18} />}
    </button>
  )

  return (
    <div>
      <PageHeader title="Mi Perfil" subtitle="Información personal y seguridad" icon={UserCog} />
      <div className="px-8 py-6 space-y-6 max-w-2xl">
        {/* Info */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-6">
          <h3 className="text-sm font-bold text-slate-400 uppercase tracking-wider mb-4">Información Personal</h3>
          <div className="grid grid-cols-2 gap-4">
            <div><label className="text-xs text-slate-400">Nombre</label><p className="font-semibold text-slate-800">{user?.nombre}</p></div>
            <div><label className="text-xs text-slate-400">Rol</label><p className="font-semibold text-slate-800">{rolPrincipal}</p></div>
            <div><label className="text-xs text-slate-400">Email</label><p className="font-semibold text-slate-800">{user?.email || '—'}</p></div>
            {user?.num_empleado && <div><label className="text-xs text-slate-400">Núm. Empleado</label><p className="font-mono font-semibold text-brand-600">{user.num_empleado}</p></div>}
            {user?.no_control && <div><label className="text-xs text-slate-400">No. Control</label><p className="font-mono font-semibold text-brand-600">{user.no_control}</p></div>}
          </div>
        </div>
        {/* Cambio de contraseña */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-6">
          <h3 className="text-sm font-bold text-slate-400 uppercase tracking-wider mb-4 flex items-center gap-2"><Lock size={16} />Cambiar Contraseña</h3>
          <div className="space-y-4">
            <Input label="Contraseña actual" type={showPw.actual ? 'text' : 'password'} rightElement={toggleIcon('actual')} value={pw.actual} onChange={e => setPw(p => ({ ...p, actual: e.target.value }))} />
            <Input label="Nueva contraseña" type={showPw.nueva ? 'text' : 'password'} rightElement={toggleIcon('nueva')} value={pw.nueva} onChange={e => setPw(p => ({ ...p, nueva: e.target.value }))} />
            <Input label="Confirmar nueva contraseña" type={showPw.confirmar ? 'text' : 'password'} rightElement={toggleIcon('confirmar')} value={pw.confirmar} onChange={e => setPw(p => ({ ...p, confirmar: e.target.value }))} />
            <Btn onClick={cambiarPassword} disabled={!pw.actual || !pw.nueva}>Cambiar Contraseña</Btn>
          </div>
        </div>
      </div>
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
    </div>
  )
}
