import { useState, useEffect } from 'react'
import { docentes as api, importar as importarApi } from '../api/endpoints'
import { PageHeader } from '../components/layout/Layout'
import { Card, Btn, Input, Modal, Table, Badge, SearchInput, ErrorMsg, Toast, EmptyState, Spinner, StatCard, Drawer } from '../components/ui'
import { Users, Plus, Pencil, Key, Mail, Hash, CheckCircle2, UserCheck, UserX, Briefcase, Upload, AlertTriangle, ChevronRight, FileSpreadsheet, Copy, AlertCircle, Download, TrendingUp, User, BarChart3, GraduationCap } from 'lucide-react'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts'

export default function DocentesAdmin() {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [modal, setModal] = useState(null)
  const [selected, setSelected] = useState(null)
  const [saving, setSaving] = useState(false)
  const [toast, setToast] = useState(null)
  const [error, setError] = useState(null)
  const [modalCreds, setModalCreds] = useState(null)
  const [activeTab, setActiveTab] = useState('general')
  const [dataAnalytics, setDataAnalytics] = useState(null)

  const [form, setForm] = useState({ num_empleado: '', nombre: '', apellido_pat: '', apellido_mat: '', fecha_nacimiento: '', email: '', password: '', activo: true })
  const [pwForm, setPwForm] = useState({ nueva_password: '' })

  const [openActivos, setOpenActivos] = useState(true)
  const [openInactivos, setOpenInactivos] = useState(false)

  // CSV
  const [csvFile, setCsvFile] = useState(null)
  const [csvPreview, setCsvPreview] = useState(null)
  const [csvLoading, setCsvLoading] = useState(false)
  const [csvResult, setCsvResult] = useState(null)

  const load = async () => {
    setLoading(true)
    try {
      const res = await api.listar()
      setItems(res.data)
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  useEffect(() => {
    if (selected) {
      setActiveTab('general')
      api.historial(selected.id).then(r => setDataAnalytics(r.data))
    } else {
      setDataAnalytics(null)
    }
  }, [selected])

  const notify = (m, t = 'success') => {
    setToast({ message: m, type: t })
    setTimeout(() => setToast(null), 3000)
  }

  const cleanForEmail = (s) => {
    if (!s) return "";
    return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");
  }

  const previewEmail = (form.nombre && form.apellido_pat)
    ? `${cleanForEmail(form.nombre)}${cleanForEmail(form.apellido_pat)}${cleanForEmail(form.apellido_mat || "")}@veracruz.tecnm.mx`
    : "";

  const previewPassword = form.fecha_nacimiento
    ? form.fecha_nacimiento.replace(/-/g, "")
    : "";

  const handleSave = async (e) => {
    if (e) e.preventDefault()
    setSaving(true)
    setError(null)
    try {
      if (modal === 'new') {
        const res = await api.crear(form)
        const data = res.data
        // El backend ahora devuelve password_provisional y username (email)
        setModalCreds({
          nombre: `${data.nombre} ${data.apellido_pat}${data.apellido_mat ? ` ${data.apellido_mat}` : ''}`,
          email: data.email,
          password: data.password_provisional,
          num_empleado: data.num_empleado
        })
        notify('Docente registrado exitosamente')
      } else {
        await api.actualizar(selected.id, form)
        notify('Información del docente actualizada')
      }
      setModal(null)
      load()
    } catch (e) {
      setError(e.response?.data?.detail?.mensaje || 'Error al procesar la solicitud')
    } finally {
      setSaving(false)
    }
  }

  const handlePreviewCSV = async () => {
    if (!csvFile) return
    setCsvLoading(true); setCsvPreview(null); setCsvResult(null)
    try {
      const res = await importarApi.previewDocentes(csvFile)
      setCsvPreview(res.data)
    } catch (err) {
      notify('Error al previsualizar CSV', 'error')
    } finally {
      setCsvLoading(false)
    }
  }

  const handleImportCSV = async () => {
    if (!csvFile) return
    setCsvLoading(true)
    try {
      const res = await importarApi.confirmarDocentes(csvFile)
      setCsvResult(res.data)
      notify(`${res.data.importados} docentes importados`)
      load()
    } catch (err) {
      notify('Error al importar docentes', 'error')
    } finally {
      setCsvLoading(false)
    }
  }

  const normalize = (s) => s ? s.normalize('NFD').replace(/[\u0300-\u036f]/g, "").toLowerCase() : ""

  const filtrados = items.filter(i => {
    const s = normalize(search).trim()
    const nombreCompleto = normalize(`${i.nombre} ${i.apellido_pat} ${i.apellido_mat || ''}`)
    return nombreCompleto.includes(s) ||
      normalize(i.num_empleado).includes(s) ||
      normalize(i.email).includes(s)
  })

  const activos = filtrados.filter(i => i.activo)
  const inactivos = filtrados.filter(i => !i.activo)

  const handleReset = async (e) => {
    if (e) e.preventDefault()
    setSaving(true)
    try {
      if (selected.usuario_id) await api.resetPassword(selected.id, pwForm)
      else await api.crearAcceso(selected.id, pwForm)
      notify(selected.usuario_id ? 'Contraseña restablecida' : 'Acceso al sistema creado')
      setModal(null)
      load()
    } catch (e) {
      notify(e.response?.data?.detail?.mensaje || 'Error al gestionar acceso', 'error')
    } finally {
      setSaving(false)
    }
  }

  const handleBaja = async (docente) => {
    setSaving(true)
    try {
      await api.actualizar(docente.id, { activo: !docente.activo })
      notify(docente.activo ? 'Docente dado de baja' : 'Docente reactivado')
      setSelected(null)
      setModal(null)
      load()
    } catch {
      notify('Error al cambiar estado del docente', 'error')
    } finally {
      setSaving(false)
    }
  }

  // Table columns
  const cols = [
    {
      label: 'Docente',
      render: (i) => (
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-brand-50 to-brand-100 border border-brand-200 flex items-center justify-center flex-shrink-0">
            <span className="text-brand-700 text-sm font-bold uppercase">{i.nombre[0]}{i.apellido_pat[0]}</span>
          </div>
          <div>
            <p className="font-bold text-slate-900 text-sm uppercase">{i.nombre} {i.apellido_pat} {i.apellido_mat || ''}</p>
            <p className="text-[11px] text-slate-500 flex items-center gap-1"><Mail size={10} />{i.email}</p>
          </div>
        </div>
      )
    },
    {
      label: 'Num. Empleado',
      className: 'text-center',
      render: (i) => (
        <div className="flex justify-center">
          <p className="font-mono text-md font-bold text-brand-600">{i.num_empleado}</p>
        </div>
      )
    },
    {
      label: 'GRUPOS',
      className: 'text-center',
      render: (i) => (
        <div className="flex flex-col items-center gap-1">
          <span className="inline-flex items-center justify-center min-w-[2rem] h-8 px-2 rounded-lg text-lg font-bold">
            {i.grupos_activos || 0}
          </span>
        </div>
      )
    },
    {
      label: 'Estado',
      render: (i) => <Badge estado={i.activo ? 'ACTIVO' : 'BAJA'} />
    },
    {
      label: 'Acciones',
      className: 'w-24',
      render: (i) => (
        <div className="flex justify-end gap-1">
          <button
            onClick={() => {
              setForm({
                num_empleado: i.num_empleado,
                nombre: i.nombre,
                apellido_pat: i.apellido_pat,
                apellido_mat: i.apellido_mat || '',
                email: i.email || '',
                fecha_nacimiento: i.fecha_nacimiento || '',
                activo: i.activo
              });
              setSelected(i);
              setError(null);
              setModal('edit');
            }}
            className="btn-icon"
            title="Editar Perfil"
          >
            <Pencil size={15} />
          </button>
          <button
            onClick={() => {
              setSelected(i);
              setPwForm({ nueva_password: '' });
              setModal('reset');
            }}
            className="btn-icon"
            title={i.usuario_id ? "Resetear Contraseña" : "Crear Acceso"}
          >
            <Key size={15} />
          </button>
          <button
            onClick={() => handleBaja(i)}
            className={`btn-icon ${i.activo ? 'text-rose-500 hover:bg-rose-50' : 'text-emerald-500 hover:bg-emerald-50'}`}
            title={i.activo ? 'Dar de baja' : 'Reactivar'}
          >
            {i.activo ? <UserX size={15} /> : <UserCheck size={15} />}
          </button>
        </div>
      )
    }
  ]

  if (loading) return <Spinner />

  return (
    <div className="min-h-screen bg-slate-50/30">
      <PageHeader
        title="Docentes"
        subtitle={`${items.length} docentes en la plantilla institucional`}
        icon={Users}
        actions={
          <div className="flex gap-2">
            <Btn variant="secondary" onClick={() => { setModal('csv'); setCsvFile(null); setCsvResult(null); setError(null) }}>
              <Upload size={15} /> Carga masiva
            </Btn>
            <Btn onClick={() => {
              setForm({ num_empleado: '', nombre: '', apellido_pat: '', apellido_mat: '', fecha_nacimiento: '', email: '', password: '', activo: true });
              setError(null);
              setModal('new');
            }}>
              <Plus size={15} /> Nuevo Docente
            </Btn>
          </div>
        }
      />

      <div className="p-8 space-y-6">
        {/* Estadísticas */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <StatCard 
            label="Total Plantilla" 
            value={items.length} 
            icon={Users} 
            color="institucional-dark" 
          />
          <StatCard 
            label="Docentes Activos" 
            value={items.filter(i => i.activo).length} 
            icon={UserCheck} 
            color="institucional" 
          />
          <StatCard 
            label="Docentes en Baja" 
            value={items.filter(i => !i.activo).length} 
            icon={UserX} 
            color="institucional" 
          />
        </div>

        <div className="space-y-4">
          <SearchInput
            value={search}
            onChange={setSearch}
            placeholder="Buscar por nombre, clave o email..."
            className="max-w-md"
          />

          {/* Sección Activos */}
          <div className="bg-white rounded-[24px] border border-slate-100 overflow-hidden shadow-sm">
            <button
              onClick={() => setOpenActivos(!openActivos)}
              className="w-full flex items-center justify-between p-5 hover:bg-slate-50/50 transition-colors"
            >
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center">
                  <UserCheck size={18} />
                </div>
                <h2 className="font-black text-slate-800 uppercase tracking-wider text-sm">Docentes Activos ({activos.length})</h2>
              </div>
              <ChevronRight className={`text-slate-400 transition-transform ${openActivos ? 'rotate-90' : ''}`} />
            </button>

            {openActivos && (
              <div className="border-t border-slate-50">
                <Table
                  columns={cols}
                  data={activos}
                  onRowClick={(d) => { setSelected(d); setForm({ ...d }); setModal('edit') }}
                  empty={<EmptyState icon={Users} title="Sin docentes activos" description="No hay docentes activos que coincidan con la búsqueda" />}
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
                <h2 className="font-black text-slate-400 uppercase tracking-wider text-sm">Docentes en Baja ({inactivos.length})</h2>
              </div>
              <ChevronRight className={`text-slate-400 transition-transform ${openInactivos ? 'rotate-90' : ''}`} />
            </button>

            {openInactivos && (
              <div className="border-t border-slate-50 bg-slate-50/10">
                <Table
                  columns={cols}
                  data={inactivos}
                  onRowClick={(d) => { setSelected(d); setForm({ ...d }); setModal('edit') }}
                  empty={<EmptyState icon={Users} title="Sin docentes en baja" description="No hay registros de docentes inactivos" />}
                />
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Drawer Detalle Docente */}
      <Drawer
        open={modal === 'edit'}
        onClose={() => setModal(null)}
        title="Gestión de Docente"
        subtitle={selected ? `${selected.num_empleado} • ${selected.nombre} ${selected.apellido_pat}` : ''}
        footer={activeTab === 'general' ? (
          <div className="flex gap-2 justify-end w-full">
            <Btn variant="secondary" onClick={() => setModal(null)}>Cerrar</Btn>
            <Btn onClick={handleSave} loading={saving}>Actualizar Docente</Btn>
          </div>
        ) : null}
      >
        <div className="flex bg-slate-100 p-1 rounded-xl mb-6">
          <button onClick={() => setActiveTab('general')} className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all flex items-center justify-center gap-2 ${activeTab === 'general' ? 'bg-white shadow-sm text-darkerBlue' : 'text-slate-500 hover:text-slate-700'}`}>
            <User size={14} /> Información
          </button>
          <button onClick={() => setActiveTab('desempeno')} className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all flex items-center justify-center gap-2 ${activeTab === 'desempeno' ? 'bg-white shadow-sm text-darkerBlue' : 'text-slate-500 hover:text-slate-700'}`}>
            <BarChart3 size={14} /> Desempeño
          </button>
        </div>

        {activeTab === 'general' && (
          <div className="space-y-6 animate-fade-in">
            {error && <ErrorMsg error={error} />}
            
            <div className="bg-slate-50 rounded-2xl p-5 border border-slate-100 flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-xl bg-darkerBlue text-yellow-500 flex items-center justify-center shadow-inner">
                  <Briefcase size={24} />
                </div>
                <div>
                  <p className="text-[10px] font-bold text-slate-400 uppercase">Num. Empleado</p>
                  <p className="font-mono text-lg font-black text-slate-900">{form.num_empleado}</p>
                </div>
              </div>
              <Badge estado={form.activo ? 'ACTIVO' : 'BAJA'} />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <Input label="Nombre(s)" value={form.nombre} onChange={e => setForm({ ...form, nombre: e.target.value })} required />
              <Input label="Apellido Paterno" value={form.apellido_pat} onChange={e => setForm({ ...form, apellido_pat: e.target.value })} required />
            </div>
            <Input label="Apellido Materno" value={form.apellido_mat} onChange={e => setForm({ ...form, apellido_mat: e.target.value })} />
            
            <div className="grid grid-cols-2 gap-4">
              <Input label="Fecha de Nacimiento" type="date" value={form.fecha_nacimiento ? form.fecha_nacimiento.split('T')[0] : ''} onChange={e => setForm({ ...form, fecha_nacimiento: e.target.value })} />
              <Input label="Email Institucional" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} />
            </div>

            <div className="pt-4 border-t border-slate-100 space-y-4">
               <h4 className="text-xs font-bold text-slate-400 uppercase tracking-widest">Seguridad</h4>
               <div className="flex gap-2">
                 <Btn variant="secondary" className="flex-1" onClick={() => setModal('pw')}>
                   <Key size={14} className="mr-2" /> Resetear Contraseña
                 </Btn>
               </div>
            </div>

            <div className="pt-4">
              <label className="flex items-center gap-3 p-4 rounded-xl border border-slate-100 hover:bg-slate-50 transition-colors cursor-pointer group">
                <input type="checkbox" className="w-5 h-5 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
                  checked={form.activo} onChange={e => setForm({ ...form, activo: e.target.checked })} />
                <div>
                  <p className="text-sm font-bold text-slate-700 group-hover:text-brand-600">Cuenta activa</p>
                  <p className="text-xs text-slate-400">Permite al docente ingresar a sus grupos</p>
                </div>
              </label>
            </div>
          </div>
        )}

        {activeTab === 'desempeno' && (
          <div className="space-y-8 animate-fade-in">
            {/* KPIs Docente */}
            <div className="grid grid-cols-3 gap-3">
              <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100 text-center">
                <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Grupos</p>
                <p className="text-2xl font-black text-darkerBlue">{dataAnalytics?.stats?.total_grupos}</p>
              </div>
              <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100 text-center">
                <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Promedio</p>
                <p className="text-2xl font-black text-darkerBlue">{(dataAnalytics?.stats?.promedio_otorgado || 0).toFixed(1)}</p>
              </div>
              <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100 text-center">
                <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Alumnos</p>
                <p className="text-2xl font-black text-darkerBlue">{dataAnalytics?.stats?.total_alumnos_atendidos}</p>
              </div>
            </div>

            {/* Gráfico de Aprobación */}
            <div className="space-y-3">
              <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest flex items-center gap-2">
                <TrendingUp size={14} /> Índice de Aprobación por Grupo
              </h3>
              <div className="h-[250px] w-full bg-white rounded-2xl border border-slate-100 p-4">
                {dataAnalytics?.grupos?.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={dataAnalytics.grupos} layout="vertical">
                      <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={false} stroke="#f1f5f9" />
                      <XAxis type="number" domain={[0, 100]} hide />
                      <YAxis dataKey="grupo" type="category" axisLine={false} tickLine={false} tick={{fontSize: 10, fill: '#64748b'}} width={80} />
                      <Tooltip 
                        cursor={{fill: '#f8fafc'}}
                        contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)', fontSize: '11px' }}
                      />
                      <Bar dataKey="total" fill="#e2e8f0" radius={[0, 4, 4, 0]} barSize={12} />
                      <Bar dataKey="aprobados" radius={[0, 4, 4, 0]} barSize={12}>
                        {dataAnalytics.grupos.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={(entry.aprobados/entry.total) < 0.7 ? '#f43f5e' : '#10b981'} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="h-full flex flex-col items-center justify-center text-slate-400">
                    <GraduationCap size={32} className="opacity-20 mb-2" />
                    <p className="text-xs font-medium">Sin datos de grupos recientes</p>
                  </div>
                )}
              </div>
            </div>

            {/* Tabla Detallada */}
            <div className="space-y-3">
              <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest">Resumen de Grupos</h3>
              <div className="overflow-hidden rounded-2xl border border-slate-100">
                <table className="w-full text-[10px]">
                  <thead className="bg-slate-50 text-slate-500 font-bold">
                    <tr>
                      <th className="px-3 py-2 text-left">Grupo / Materia</th>
                      <th className="px-3 py-2 text-center">Aprobación</th>
                      <th className="px-3 py-2 text-right">Prom.</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {dataAnalytics?.grupos?.map((g, i) => (
                      <tr key={i} className="hover:bg-slate-50 transition-colors">
                        <td className="px-3 py-3">
                          <p className="font-bold text-slate-700">{g.grupo}</p>
                          <p className="text-[9px] text-slate-400">{g.materia}</p>
                        </td>
                        <td className="px-3 py-3 text-center">
                          <div className="flex items-center justify-center gap-1.5">
                            <div className="w-12 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                              <div className={`h-full ${ (g.aprobados/g.total) < 0.7 ? 'bg-rose-500' : 'bg-emerald-500' }`} style={{ width: `${(g.aprobados/g.total)*100}%` }}></div>
                            </div>
                            <span className="font-bold text-slate-600">{Math.round((g.aprobados/g.total)*100)}%</span>
                          </div>
                        </td>
                        <td className="px-3 py-3 text-right font-black text-darkerBlue">{(g.promedio || 0).toFixed(1)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </Drawer>

      <Modal open={modal === 'new'} onClose={() => setModal(null)} title="Registrar Docente"
        footer={<div className="flex gap-2 justify-end w-full"><Btn variant="secondary" onClick={() => setModal(null)}>Cancelar</Btn><Btn onClick={handleSave} loading={saving}>Registrar</Btn></div>}
      >
        <form id="form-docente" onSubmit={handleSave} className="space-y-4">
          {error && <ErrorMsg error={error} />}
          <div className="bg-brand-50 rounded-xl p-3.5 text-xs text-brand-700">
            <p className="font-semibold mb-1 text-darkerBlue">Automatización Acadex</p>
            <p>Se generará el correo institucional y la contraseña provisional automáticamente.</p>
          </div>

          <div className="grid grid-cols-1 gap-3 mb-4">
            <div className="flex items-center gap-3 bg-slate-50 p-3 rounded-xl border border-slate-100">
              <div className="w-8 h-8 rounded-lg bg-darkerBlue text-yellow-500 flex items-center justify-center shadow-inner">
                <Mail size={14} />
              </div>
              <div>
                <p className="text-[9px] font-bold text-slate-400 uppercase tracking-tighter">Correo Institucional (Preview)</p>
                <p className="text-xs font-mono font-bold text-slate-700 break-all">
                  {previewEmail || <span className="italic opacity-50 font-sans">Esperando nombre y apellidos...</span>}
                </p>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 mb-4">
            <Input label="Num. Empleado *" value={form.num_empleado} onChange={e => setForm({ ...form, num_empleado: e.target.value })} required placeholder="Ej. 12345" />
            <Input label="Fecha de Nacimiento *" type="date" value={form.fecha_nacimiento} onChange={e => setForm({ ...form, fecha_nacimiento: e.target.value })} required />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Input label="Nombre(s) *" value={form.nombre} onChange={e => setForm({ ...form, nombre: e.target.value })} required />
            <Input label="Apellido Paterno *" value={form.apellido_pat} onChange={e => setForm({ ...form, apellido_pat: e.target.value })} required />
          </div>
          <Input label="Apellido Materno" value={form.apellido_mat} onChange={e => setForm({ ...form, apellido_mat: e.target.value })} />
        </form>
      </Modal>

      {/* Modal Credenciales */}
      <Modal open={!!modalCreds} onClose={() => setModalCreds(null)} title="Docente registrado exitosamente">
        {modalCreds && (
          <div className="space-y-4">
            <div className="flex items-center gap-3 p-1">
              <div className="w-12 h-12 rounded-2xl bg-brand-50 flex items-center justify-center text-brand-600">
                <Users size={24} />
              </div>
              <div>
                <p className="text-sm font-black text-slate-900 uppercase">{modalCreds.nombre}</p>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Nuevas credenciales de acceso</p>
              </div>
            </div>

            <div className="bg-slate-50 rounded-2xl p-5 space-y-4 border border-slate-100">
              {[
                { label: 'Num. Empleado', value: modalCreds.num_empleado, icon: Hash },
                { label: 'Correo institucional', value: modalCreds.email, icon: Mail },
                { label: 'Contraseña provisional', value: modalCreds.password, icon: Key },
              ].map(item => (
                <div key={item.label} className="flex items-center justify-between group">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-white border border-slate-200 flex items-center justify-center text-slate-400 group-hover:text-brand-500 group-hover:border-brand-200 transition-colors">
                      <item.icon size={14} />
                    </div>
                    <div>
                      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-tight">{item.label}</p>
                      <p className="font-mono text-sm font-black text-slate-900">{item.value}</p>
                    </div>
                  </div>
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(item.value)
                      notify('Copiado al portapapeles')
                    }}
                    className="p-2 hover:bg-brand-50 text-slate-400 hover:text-brand-600 rounded-xl transition-colors"
                    title="Copiar"
                  >
                    <Copy size={14} />
                  </button>
                </div>
              ))}
            </div>

            <div className="bg-amber-50 border border-amber-100 rounded-2xl p-4 flex items-start gap-3">
              <AlertTriangle className="text-amber-600 mt-0.5" size={16} />
              <div className="text-[11px] text-amber-800 leading-relaxed">
                <p className="font-black uppercase tracking-wider mb-1">Aviso importante</p>
                <p className="opacity-80 font-medium">Por favor, proporcione estas credenciales al docente. Se recomienda que cambie su contraseña al ingresar por primera vez.</p>
              </div>
            </div>

            <div className="flex justify-end pt-2">
              <Btn onClick={() => setModalCreds(null)} className="w-full sm:w-auto">Entendido</Btn>
            </div>
          </div>
        )}
      </Modal>

      {/* Modal Carga Masiva */}
      <Modal open={modal === 'csv'} onClose={() => { setModal(null); setCsvPreview(null); setCsvResult(null) }}
        title="Carga Masiva de Docentes"
        subtitle="Importar plantilla de docentes desde CSV"
        size="md"
        className={csvPreview ? '!w-fit !max-w-[1000px] min-w-[500px]' : ''}
        footer={
          <div className="flex gap-2 justify-end">
            <Btn variant="secondary" onClick={() => setModal(null)}>Cerrar</Btn>
            {csvFile && !csvPreview && !csvResult && (
              <Btn onClick={handlePreviewCSV} loading={csvLoading}>Previsualizar</Btn>
            )}
            {csvPreview && !csvResult && (
              <Btn onClick={handleImportCSV} loading={csvLoading} variant="primary" disabled={!csvPreview.some(r => !r.error)}>
                Confirmar Importación ({csvPreview.filter(r => !r.error).length})
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
                <div className="text-sm text-brand-900 leading-relaxed">
                  <p className="font-black uppercase tracking-wider mb-1">Instrucciones del CSV</p>
                  <p>El archivo debe contener las siguientes columnas:</p>
                  <ul className="list-disc list-inside mt-1 font-mono text-[16px] opacity-80">
                    <li>num_empleado (Clave única)</li>
                    <li>nombre, apellido_pat, apellido_mat</li>
                    <li>email (Opcional)</li>
                    <li>fecha_nacimiento (YYYY-MM-DD)</li>
                  </ul>
                </div>
              </div>
              <div className="p-8 border-2 border-dashed border-slate-200 rounded-3xl text-center hover:border-brand-400 transition-colors bg-slate-50/50">
                <input type="file" accept=".csv" onChange={e => { setCsvFile(e.target.files[0]); setCsvPreview(null) }} className="hidden" id="csv-docentes" />
                <label htmlFor="csv-docentes" className="cursor-pointer block">
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
                  { label: 'Docente', render: r => <span className="text-sm font-bold text-slate-700">{r.nombre} {r.apellido_pat}{r.apellido_mat ? ` ${r.apellido_mat}` : ''}</span> },
                  { label: 'Num. Empleado', render: r => <span className="text-sm font-mono">{r.num_empleado}</span> },
                  { label: 'Correo Generado', render: r => <span className="text-xs text-slate-500">{r.email}</span> },
                  { label: 'Estado', render: r => r.error ? (r.ya_existe ? <Badge estado="OMITIR" className="!bg-amber-50 !text-amber-600 border-none" /> : <Badge estado="ERROR" className="!bg-rose-50 !text-rose-600 border-none" />) : <Badge estado="LISTO" className="!bg-emerald-50 !text-emerald-600 border-none" /> }
                ]}
                data={csvPreview}
              />
            </div>
          )}

          {csvResult && (
            <div className="bg-emerald-50 border border-emerald-200 p-5 rounded-2xl space-y-4 animate-in slide-in-from-bottom-2 duration-300">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-black text-emerald-800 uppercase tracking-widest">Importación Exitosa</p>
                  <p className="text-xs text-emerald-600 font-medium">{csvResult.importados} docentes procesados correctamente</p>
                </div>
                <Btn variant="secondary" size="sm" onClick={() => {
                  const header = 'num_empleado,nombre,email,password\n'
                  const rows = csvResult.resultados.map(r => `${r.num_empleado},"${r.nombre}","${r.email}","${r.password}"`).join('\n')
                  const blob = new Blob([header + rows], { type: 'text/csv' })
                  const url = URL.createObjectURL(blob)
                  const a = document.createElement('a'); a.href = url; a.download = 'docentes_importados.csv'; a.click()
                }}>
                  <Download size={14} /> Descargar reporte
                </Btn>
              </div>

              {csvResult.errores?.length > 0 && (
                <div className="bg-white/50 p-3 rounded-xl max-h-32 overflow-auto border border-emerald-100">
                  <p className="text-[9px] font-bold text-slate-400 uppercase mb-1">Omitidos o con error</p>
                  {csvResult.errores.map((e, idx) => (
                    <p key={idx} className="text-[10px] font-mono text-rose-600">Fila {e.fila}: {e.error}</p>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </Modal>

      {/* Modal Reset Password */}
      <Modal
        open={modal === 'reset'}
        title={selected?.usuario_id ? 'Restablecer Contraseña' : 'Crear Acceso'}
        subtitle={`Generar nuevas credenciales para ${selected?.nombre}`}
        onClose={() => setModal(null)}
        footer={
          <div className="flex gap-2 justify-end">
            <Btn variant="secondary" onClick={() => setModal(null)}>Cancelar</Btn>
            <Btn variant="primary" onClick={handleReset} loading={saving}>
              {selected?.usuario_id ? 'Restablecer' : 'Crear Acceso'}
            </Btn>
          </div>
        }
      >
        <form onSubmit={handleReset} className="space-y-5">
          <div className="bg-brand-50 rounded-xl p-4 flex items-start gap-3">
            <div className="mt-1 text-brand-600"><Key size={18} /></div>
            <div className="text-xs text-brand-800 space-y-1">
              <p className="font-bold">Seguridad de la cuenta</p>
              <p className="opacity-80">
                {selected?.usuario_id
                  ? 'Se invalidará la contraseña actual y se asignará la nueva que definas abajo.'
                  : 'Este docente aún no tiene cuenta. Al crearla, su usuario será su correo institucional.'}
              </p>
            </div>
          </div>
          <Input
            label="Nueva Contraseña de Acceso"
            type="password"
            value={pwForm.nueva_password}
            onChange={e => setPwForm({ nueva_password: e.target.value })}
            placeholder="Escriba la nueva contraseña"
            required
            autoFocus
          />
        </form>
      </Modal>

      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
    </div>
  )
}
