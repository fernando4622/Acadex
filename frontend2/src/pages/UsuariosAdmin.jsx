import { useState, useEffect } from 'react'
import { usuarios as api } from '../api/endpoints'
import { PageHeader } from '../components/layout/Layout'
import { Card, Spinner, Badge, Btn, Modal, Input, Toast } from '../components/ui'
import { Shield, UserPlus, UserMinus, ShieldAlert, ShieldCheck, Mail, Calendar, Activity, Search, Filter, Plus, Key, User } from 'lucide-react'
import { auth as authApi } from '../api/endpoints'

export default function UsuariosAdmin() {
  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedUser, setSelectedUser] = useState(null)
  const [showRoleModal, setShowRoleModal] = useState(false)
  const [toast, setToast] = useState(null)
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [newUserInfo, setNewUserInfo] = useState({ email: '', password: '', role: 'ADMIN' })
  const [creating, setCreating] = useState(false)

  useEffect(() => {
    load()
  }, [])

  const load = async () => {
    try {
      setLoading(true)
      const { data } = await api.listar()
      setUsers(data)
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }

  const handleToggleActive = async (id) => {
    try {
      await api.toggleActivo(id)
      setToast({ type: 'success', text: 'Estado de usuario actualizado' })
      load()
    } catch (e) {
      setToast({ type: 'error', text: 'Error al actualizar estado' })
    }
  }

  const handleCreateUser = async (e) => {
    e.preventDefault()
    try {
      setCreating(true)
      await authApi.crearUsuario({
        username: newUserInfo.email,
        password: newUserInfo.password,
        roles: [newUserInfo.role]
      })
      setToast({ type: 'success', text: 'Usuario creado exitosamente' })
      setShowCreateModal(false)
      setNewUserInfo({ email: '', password: '', role: 'ADMIN' })
      load()
    } catch (e) {
      setToast({ type: 'error', text: e.response?.data?.detail?.mensaje || 'Error al crear usuario' })
    } finally {
      setCreating(false)
    }
  }

  const handleManageRole = async (user, rol, action) => {
    try {
      if (action === 'add') {
        await api.asignarRol({ usuario_id: user.id, rol })
      } else {
        await api.removerRol({ usuario_id: user.id, rol })
      }
      setToast({ type: 'success', text: `Rol ${rol} ${action === 'add' ? 'asignado' : 'removido'}` })
      load()
    } catch (e) {
      setToast({ type: 'error', text: 'Error al gestionar rol' })
    }
  }

  const filtered = users.filter(u =>
    u.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (u.entidad_nombre && u.entidad_nombre.toLowerCase().includes(searchTerm.toLowerCase()))
  )

  return (
    <div className="space-y-6">
      <PageHeader
        title="Gestión de Usuarios y Roles"
        subtitle="Administración de accesos y perfiles de seguridad del sistema."
        icon={Shield}
        actions={
          <Btn variant="white-gold" onClick={() => setShowCreateModal(true)}>
            <Plus className="w-4 h-4 mr-2" />
            Nuevo Administrador
          </Btn>
        }
      />

      <div className="flex flex-col md:flex-row gap-4 items-center justify-between bg-white p-4 rounded-xl shadow-sm border border-slate-100">
        <div className="relative flex-1 w-full">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
          <input
            type="text"
            placeholder="Buscar por email o nombre..."
            className="w-full pl-10 pr-4 py-2 bg-slate-50 border-none rounded-lg focus:ring-2 focus:ring-blue-500 transition-all"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
        <div className="flex gap-2">
          <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-100 py-2 px-3">
            <Activity className="w-4 h-4 mr-2" />
            {users.length} Usuarios Registrados
          </Badge>
        </div>
      </div>

      {loading ? (
        <div className="h-64 flex items-center justify-center">
          <Spinner className="w-12 h-12 text-blue-600" />
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {filtered.map(u => (
            <Card key={u.id} className="group hover:shadow-md transition-all border-slate-200">
              <div className="flex items-start justify-between p-1">
                <div className="flex gap-4">
                  <div className={`w-12 h-12 rounded-full flex items-center justify-center ${u.entidad_tipo === 'DOCENTE' ? 'bg-purple-100 text-purple-600' :
                      u.entidad_tipo === 'ALUMNO' ? 'bg-blue-100 text-blue-600' : 'bg-slate-100 text-slate-600'
                    }`}>
                    {u.entidad_tipo === 'DOCENTE' ? 'D' : u.entidad_tipo === 'ALUMNO' ? 'A' : 'S'}
                  </div>
                  <div className="space-y-1">
                    <h3 className="font-semibold text-slate-900">{u.entidad_nombre || 'Usuario del Sistema'}</h3>
                    <div className="flex items-center text-sm text-slate-500">
                      <Mail className="w-3.5 h-3.5 mr-1.5" />
                      {u.email}
                    </div>
                    <div className="flex flex-wrap gap-1.5 mt-2">
                      {u.roles.map(r => (
                        <Badge key={r} className={`${r === 'ADMIN' ? 'bg-rose-100 text-rose-700' :
                            r === 'DOCENTE' ? 'bg-amber-100 text-amber-700' : 'bg-emerald-100 text-emerald-700'
                          } border-none font-medium px-2 py-0.5 text-[11px]`}>
                          {r}
                        </Badge>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="flex flex-col items-end gap-2">
                  <Badge variant={u.activo ? 'success' : 'error'} className="rounded-full">
                    {u.activo ? 'Activo' : 'Inactivo'}
                  </Badge>
                  <div className="flex gap-1">
                    <Btn
                      size="sm"
                      variant="ghost"
                      className="text-blue-600 hover:bg-blue-50"
                      title="Gestionar Roles"
                      onClick={() => { setSelectedUser(u); setShowRoleModal(true); }}
                    >
                      <ShieldCheck className="w-4 h-4" />
                    </Btn>
                    <Btn
                      size="sm"
                      variant="ghost"
                      className={u.activo ? 'text-rose-600 hover:bg-rose-50' : 'text-emerald-600 hover:bg-emerald-50'}
                      onClick={() => handleToggleActive(u.id)}
                    >
                      {u.activo ? <UserMinus className="w-4 h-4" /> : <UserPlus className="w-4 h-4" />}
                    </Btn>
                  </div>
                </div>
              </div>

              <div className="mt-4 pt-4 border-t border-slate-50 flex items-center justify-between text-[11px] text-slate-400">
                <div className="flex items-center">
                  <Calendar className="w-3 h-3 mr-1" />
                  Último acceso: {u.ultimo_acceso || 'Nunca'}
                </div>
                <div className="uppercase tracking-wider font-bold opacity-50">
                  {u.entidad_tipo}
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      <Modal
        open={showRoleModal}
        onClose={() => setShowRoleModal(false)}
        title={`Gestionar Roles: ${selectedUser?.email}`}
      >
        <div className="space-y-4 py-2">
          <p className="text-sm text-slate-500 mb-4">
            Selecciona los roles que deseas asignar o remover para este usuario.
          </p>

          {['ADMIN', 'DOCENTE', 'ALUMNO'].map(role => {
            const hasRole = selectedUser?.roles.includes(role)
            return (
              <div key={role} className="flex items-center justify-between p-3 rounded-lg border border-slate-100 bg-slate-50 hover:bg-white transition-all">
                <div className="flex items-center gap-3">
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${role === 'ADMIN' ? 'bg-rose-100 text-rose-600' :
                      role === 'DOCENTE' ? 'bg-amber-100 text-amber-600' : 'bg-emerald-100 text-emerald-600'
                    }`}>
                    <Shield className="w-4 h-4" />
                  </div>
                  <span className="font-medium text-slate-700">{role}</span>
                </div>
                <Btn
                  size="sm"
                  variant={hasRole ? 'error' : 'success'}
                  className="min-w-[100px]"
                  onClick={() => handleManageRole(selectedUser, role, hasRole ? 'remove' : 'add')}
                >
                  {hasRole ? 'Remover' : 'Asignar'}
                </Btn>
              </div>
            )
          })}
        </div>
      </Modal>

      <Modal
        open={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        title="Crear Nuevo Usuario"
        subtitle="Agrega un nuevo acceso al sistema sin vincularlo a un docente o alumno."
      >
        <form onSubmit={handleCreateUser} className="space-y-4">
          <Input
            label="Correo Electrónico / Identificador"
            type="email"
            required
            value={newUserInfo.email}
            onChange={e => setNewUserInfo({ ...newUserInfo, email: e.target.value })}
            placeholder="ejemplo@tecnm.mx"
          />
          <Input
            label="Contraseña"
            type="password"
            required
            value={newUserInfo.password}
            onChange={e => setNewUserInfo({ ...newUserInfo, password: e.target.value })}
            placeholder="Mínimo 8 caracteres"
          />
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-slate-500 uppercase">Rol Inicial</label>
            <select
              className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500"
              value={newUserInfo.role}
              onChange={e => setNewUserInfo({ ...newUserInfo, role: e.target.value })}
            >
              <option value="ADMIN">Administrador</option>
              <option value="DOCENTE">Docente (Acceso general)</option>
              <option value="ALUMNO">Alumno (Acceso general)</option>
            </select>
          </div>
          <div className="pt-4">
            <Btn type="submit" className="w-full" loading={creating}>
              Crear Usuario
            </Btn>
          </div>
        </form>
      </Modal>

      {toast && <Toast type={toast.type} text={toast.text} onClose={() => setToast(null)} />}
    </div>
  )
}
