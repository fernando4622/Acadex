import { useState, useEffect } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import {
  LayoutDashboard, Users, BookOpen, GraduationCap,
  ClipboardList, BarChart3, Upload, LogOut,
  ChevronRight, Settings, Shield, Menu, X,
  CalendarDays, ShieldCheck, Plus, Target, BarChart2, Star,
  FileText, Map, UserCog, Bell
} from 'lucide-react'
import { Modal, Input, Spinner, Toast, Btn } from '../ui'
import { periodos as periodosApi, dashboard as dashboardApi } from '../../api/endpoints'
import logoG from '../../assets/logo-r.png'

const NAV = {
  ADMIN: [
    { to: '/', label: 'Dashboard', icon: LayoutDashboard },
    {
      section: 'Académico',
      items: [
        { to: '/carreras', label: 'Carreras', icon: Map },
        { to: '/catalogos', label: 'Materias', icon: ClipboardList },
      ]
    },
    {
      section: 'Operación',
      items: [
        { to: '/grupos', label: 'Grupos', icon: BookOpen },
        { to: '/alumnos', label: 'Alumnos', icon: GraduationCap },
        { to: '/docentes-admin', label: 'Docentes', icon: Users },
        { to: '/periodos', label: 'Periodos', icon: CalendarDays },

      ]
    },
    {
      section: 'Evaluación',
      items: [
        { to: '/tipos-actividad', label: 'Actividades', icon: Target },

      ]
    },
    {
      section: 'Sistema',
      items: [
        { to: '/gestion-usuarios', label: 'Administradores', icon: UserCog },
        { to: '/auditoria', label: 'Auditoría', icon: ShieldCheck },
        { to: '/configuracion-sistema', label: 'Configuración', icon: Settings },
      ]
    }
  ],
  DOCENTE: [
    { to: '/', label: 'Dashboard', icon: LayoutDashboard },
    { to: '/grupos', label: 'Mis Grupos', icon: BookOpen },
    { to: '/periodos', label: 'Periodos', icon: CalendarDays },

    { to: '/perfil', label: 'Perfil', icon: UserCog },
  ],
  ALUMNO: [
    { to: '/', label: 'Dashboard', icon: LayoutDashboard },
    { to: '/mis-grupos', label: 'Mis Grupos', icon: BookOpen },
    { to: '/mis-calificaciones', label: 'Mis Calificaciones', icon: BarChart3 },


    { to: '/perfil', label: 'Perfil', icon: UserCog },
  ],
}

const ROL_STYLE = {
  ADMIN: { badge: 'bg-brand-500/20 text-brand-300', dot: 'bg-brand-400' },
  DOCENTE: { badge: 'bg-sky-500/20 text-sky-300', dot: 'bg-sky-400' },
  ALUMNO: { badge: 'bg-emerald-500/20 text-emerald-300', dot: 'bg-emerald-400' },
}

export default function Layout({ children }) {
  const { user, logout, isAdmin, isDocente, rolPrincipal } = useAuth()
  const navigate = useNavigate()
  const [openSections, setOpenSections] = useState({
    Académico: true,
    Operación: true,
    Evaluación: false,
    Sistema: false
  })

  const toggleSection = (name) => {
    setOpenSections(prev => ({ ...prev, [name]: !prev[name] }))
  }

  const [open, setOpen] = useState(false)
  const [toast, setToast] = useState(null)

  const nav = NAV[rolPrincipal] ?? NAV.ALUMNO
  const style = ROL_STYLE[rolPrincipal] ?? ROL_STYLE.ALUMNO

  const notify = (message, type = 'success') => {
    setToast({ message, type })
    setTimeout(() => setToast(null), 3000)
  }

  function handleLogout() { logout(); navigate('/login') }

  const initials = user?.nombre?.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase() ?? '?'

  const SidebarContent = () => (
    <div className="flex flex-col h-full bg-white border-r border-slate-200">

      {/* Logo */}
      <div className="px-6 py-6 bg-darkerBlue border-b-4 border-yellow-600 flex items-center h-[100px]">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 bg-white rounded-xl flex items-center justify-center shadow-sm overflow-hidden pl-0.1 pr-0.5">
            <img src={logoG} alt="Logo" className="w-full h-full object-contain scale-110" />
          </div>

          <div>
            <p className="text-white font-black text-xl tracking-tight leading-none">ACADEX</p>
            <p className="text-white/60 text-[10px] font-bold uppercase tracking-widest mt-1">Sistema Escolar</p>
          </div>
        </div>
      </div>

      <div className="mx-4 h-px bg-slate-100" />

      {/* Nav */}
      <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
        {nav.map((item, idx) => {

          if (item.section) {
            const isOpen = openSections[item.section]

            return (
              <div key={idx} className="space-y-1">

                <button
                  onClick={() => toggleSection(item.section)}
                  className="flex items-center justify-between w-full px-3 py-2 text-[10px] font-black text-slate-400 uppercase tracking-widest hover:text-slate-600 transition-colors"
                >
                  {item.section}
                  <ChevronRight
                    size={12}
                    className={`transition-transform ${isOpen ? 'rotate-90' : ''}`}
                  />
                </button>

                <div className={`${isOpen ? 'block' : 'hidden'} space-y-1`}>
                  {item.items.map(sub => (
                    <NavLink
                      key={sub.to}
                      to={sub.to}
                      onClick={() => setOpen(false)}
                      className={({ isActive }) =>
                        `relative flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-semibold transition-all duration-300 group
                      ${isActive
                          ? 'bg-darkerBlue text-white shadow-glow border-l-4 border-yellow-600 pl-2'
                          : 'text-slate-500 hover:bg-slate-50 hover:text-darkerBlue hover:pl-4'}`
                      }
                    >
                      {({ isActive }) => (
                        <>
                          <sub.icon size={18} className={`transition-colors ${isActive ? 'text-white' : 'text-slate-400 group-hover:text-darkerBlue'}`} />
                          <span className="flex-1">{sub.label}</span>
                        </>
                      )}
                    </NavLink>
                  ))}
                </div>
              </div>
            )
          }

          return (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/'}
              onClick={() => setOpen(false)}
              className={({ isActive }) =>
                `relative flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-semibold transition-all duration-200
              ${isActive
                  ? 'bg-darkerBlue text-white shadow-lg border-l-4 border-yellow-600 pl-2'
                  : 'text-slate-500 hover:bg-slate-50 hover:text-slate-900'}`
              }
            >
              {({ isActive }) => (
                <>
                  <item.icon size={18} className={isActive ? 'text-white' : 'text-slate-400'} />
                  <span className="flex-1">{item.label}</span>
                </>
              )}
            </NavLink>
          )
        })}
      </nav>

      <div className="mx-4 h-px bg-slate-200" />

      {/* User */}
      <div className="p-4">
        <div className="flex items-center gap-3 mb-3">

          <div className="w-9 h-9 rounded-lg bg-darkerBlue flex items-center justify-center text-white text-xs font-semibold border-b-2 border-yellow-600/50">
            {initials}
          </div>

          <div className="flex-1 min-w-0">
            <p className="text-slate-900 text-sm font-bold truncate">
              {user?.nombre}
            </p>

            <span className={`inline-flex items-center gap-1 text-[10px] font-black px-2 py-0.5 rounded-full text-slate-700 ${style.badge}`}>
              <span className={`w-1.5 h-1.5 rounded-full ${style.dot}`} />
              {rolPrincipal}
            </span>
          </div>
        </div>

        <button
          onClick={handleLogout}
          className="flex items-center gap-2 w-full px-3 py-2.5 rounded-xl text-slate-500 font-semibold hover:bg-rose-50 hover:text-rose-600 text-sm transition-all mt-2"
        >
          <LogOut size={18} className="text-slate-400" />
          Cerrar sesión
        </button>
      </div>
    </div>
  )


  return (
    <div className="flex h-screen bg-slate-50 overflow-hidden">
      {/* Desktop sidebar */}
      <aside className="hidden lg:flex w-64 flex-shrink-0 bg-white flex-col z-10 border-r border-slate-200 shadow-sm">
        <SidebarContent />
      </aside>

      {/* Mobile sidebar */}
      {open && (
        <div className="lg:hidden fixed inset-0 z-50 flex">
          <div className="absolute inset-0 bg-black/60" onClick={() => setOpen(false)} />
          <aside className="relative w-64 bg-white flex flex-col animate-slide-up">
            <SidebarContent />
          </aside>
        </div>
      )}

      {/* Main */}
      <main className="flex-1 flex flex-col overflow-hidden">
        {/* Mobile topbar */}
        <div className="lg:hidden flex items-center justify-between px-4 py-3 bg-white border-b border-slate-100 shadow-sm z-10">
          <button onClick={() => setOpen(true)} className="p-2 text-slate-500 hover:bg-slate-50 rounded-xl transition-colors">
            <Menu size={24} />
          </button>
          <div className="flex items-center gap-2">
            <div className="w-10 h-10 bg-white rounded-lg flex items-center justify-center border border-slate-100 overflow-hidden p-0">
              <img src={logoG} alt="Logo" className="w-full h-full object-contain" />
            </div>
            <span className="text-base font-black text-slate-900 tracking-tight">ACADEX</span>
          </div>
          <div className="w-10" />
        </div>
        <div className="flex-1 overflow-y-auto relative">
          <div className="absolute inset-0 bg-mesh opacity-[0.03] pointer-events-none" />
          <div className="relative z-10">
            {children}
          </div>
        </div>
      </main>

      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
    </div>
  )
}

export function PageHeader({ title, subtitle, actions, breadcrumb, icon: Icon }) {
  return (
    <div className="bg-darkerBlue border-b-4 border-yellow-600 px-8 h-[100px] flex items-center relative sticky top-0 z-20 shadow-lg">
      <div className="absolute inset-0 bg-mesh opacity-10 overflow-hidden pointer-events-none" />
      <div className="relative flex-1 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          {Icon ? (
            <div className="w-12 h-12 rounded-2xl bg-white/10 flex items-center justify-center text-yellow-500 shadow-inner border border-white/10">
              <Icon size={24} />
            </div>
          ) : breadcrumb && (
            <div className="hidden md:block">
              <div className="flex items-center gap-1.5 text-[10px] uppercase font-bold tracking-widest text-white/40 mb-1">
                {breadcrumb.map((item, i) => (
                  <span key={i} className="flex items-center gap-1.5">
                    {i > 0 && <ChevronRight size={10} />}
                    <span className={i === breadcrumb.length - 1 ? 'text-yellow-500' : ''}>{item}</span>
                  </span>
                ))}
              </div>
            </div>
          )}
          <div>
            <h1 className="text-2xl font-black text-white tracking-tight leading-tight">{title}</h1>
            {subtitle && <p className="text-sm font-medium text-white/60 mt-0.5">{subtitle}</p>}
          </div>
        </div>
        {actions && <div className="flex items-center gap-3">{actions}</div>}
      </div>
    </div>
  )
}
