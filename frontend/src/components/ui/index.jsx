import { useState, useEffect, useRef } from 'react'
import { X, AlertTriangle, CheckCircle, Info, XCircle, ChevronRight, Loader2, } from 'lucide-react'

export function Badge({ estado, variant, className = '', children, size = 'sm' }) {
  const st = estado?.toUpperCase()
  const map = {
    APROBADO: 'badge-green',
    REPROBADO: 'badge-red',
    PENDIENTE: 'badge-amber',
    ACTIVO: 'badge-green',
    PROXIMO: 'badge-blue',
    FINALIZADO: 'badge-slate',
    EDICION: 'badge-blue',
    CERRADA: 'badge-slate',
    CERRADO: 'badge-slate',
    FINALIZADA: 'badge-slate',
    ACTIVA: 'badge-green',
    NP: 'badge-red',
    ENTREGADA: 'badge-green',
    EXENTO: 'badge-blue',
    ADMIN: 'badge-brand',
    DOCENTE: 'badge-blue',
    ALUMNO: 'badge-green',
    BAJA: 'badge-red',
    ERROR: 'badge-red',
    LISTO: 'badge-green',
    OMITIR: 'badge-amber',
    SECONDARY: 'badge-slate', // Añadido para el tipo de actividad
  }
  const dot = {
    APROBADO: 'bg-emerald-500', OMITIR: 'bg-amber-500', LISTO: 'bg-green-500', ERROR: 'bg-red-500', REPROBADO: 'bg-red-500', PENDIENTE: 'bg-amber-500',
    ACTIVO: 'bg-green-500', PROXIMO: 'bg-blue-500', FINALIZADO: 'bg-slate-400', EDICION: 'bg-blue-500',
    CERRADA: 'bg-slate-400', CERRADO: 'bg-slate-400', ACTIVA: 'bg-emerald-500', BAJA: 'bg-red-500',
  }
  
  // Usamos el variant si se proporciona, sino la lógica de estado
  const cls = variant ? `badge-${variant}` : (map[st] ?? 'badge-slate')

  return (
    <span className={`${cls} ${className}`}>
      {estado && !children && dot[st] && <span className={`w-2.5 h-2.5 rounded-full ${dot[st]}`} />}
      {children || st || estado}
    </span>
  )
}

export function CalDisplay({ valor, max = 100, size = 'md' }) {
  if (valor === null || valor === undefined) {
    return <span className="text-slate-300 font-medium">—</span>
  }
  const num = parseFloat(valor)
  const pct = num / max
  const color = pct >= 0.8 ? 'text-emerald-600' : pct >= 0.7 ? 'text-amber-500' : 'text-red-500'
  const sizes = {
    xs: 'text-sm font-bold',
    sm: 'text-lg font-bold',
    md: 'text-2xl font-bold',
    lg: 'text-4xl font-extrabold',
    xl: 'text-5xl font-black',
  }
  return <span className={`${sizes[size] ?? sizes.md} ${color} tabular-nums`}>{num.toFixed(2)}</span>
}

export function PonderacionBar({ suma }) {
  const pct = Math.min(parseFloat(suma) || 0, 100)
  const falta = (100 - pct).toFixed(1)
  const completa = Math.abs(pct - 100) < 0.01
  const excede = pct > 100.001
  const color = completa ? 'bg-emerald-500' : excede ? 'bg-red-500' : 'bg-brand-500'
  const textColor = completa ? 'text-emerald-600' : excede ? 'text-red-600' : 'text-amber-600'

  return (
    <div className="space-y-2">
      <div className="flex justify-between items-center">
        <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Ponderaciones</span>
        <span className={`text-sm font-bold tabular-nums ${textColor}`}>{pct.toFixed(1)}%</span>
      </div>
      <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden">
        <div className={`h-full rounded-full transition-all duration-500 ${color}`} style={{ width: `${pct}%` }} />
      </div>
      {!completa && !excede && (
        <p className="text-sm text-amber-600 flex items-center gap-1">
          {falta}% restante
        </p>
      )}
      {excede && <p className="text-xs text-red-600 flex items-center gap-1"><AlertTriangle size={11} /> Excede 100% por {(pct - 100).toFixed(1)}%</p>}
      {completa && <p className="text-xs text-emerald-600 flex items-center gap-1"><CheckCircle size={11} /> Estructura completa</p>}
    </div>
  )
}

export function Card({ children, className = '', onClick, hover = false }) {
  const base = hover || onClick ? 'card-hover' : 'card'
  return <div className={`${base} ${className}`} onClick={onClick}>{children}</div>
}

export function StatCard({ label, value, sub, icon: Icon, trend, color = 'institucional', badge }) {
  const palettes = {
    brand: { bg: 'from-brand-600 to-brand-700', icon: 'bg-white/20 text-white', text: 'text-white', sub: 'text-brand-200' },
    emerald: { bg: 'from-emerald-500 to-emerald-700', icon: 'bg-white/20 text-white', text: 'text-white', sub: 'text-emerald-200' },
    red: { bg: 'from-red-500 to-red-700', icon: 'bg-white/20 text-white', text: 'text-white', sub: 'text-red-200' },
    amber: { bg: 'from-amber-400 to-amber-600', icon: 'bg-white/20 text-white', text: 'text-white', sub: 'text-amber-100' },
    institucional: {
      bg: 'bg-white',
      icon: 'bg-slate-50 text-darkerBlue border border-slate-100 group-hover:bg-darkerBlue group-hover:text-yellow-500',
      text: 'text-slate-900',
      sub: 'text-slate-400',
      border: 'border-l-4 border-yellow-600 shadow-sm'
    },
    'institucional-dark': {
      bg: 'bg-darkerBlue bg-mesh',
      icon: 'bg-white/10 text-yellow-500 border border-white/10 group-hover:bg-white group-hover:text-darkerBlue',
      text: 'text-white',
      sub: 'text-white/60',
      border: 'border-l-4 border-yellow-600 shadow-glow'
    }
  }
  const p = palettes[color] ?? palettes.institucional

  return (
    <div className={`relative group overflow-hidden rounded-[24px] p-6 transition-all duration-300 hover:-translate-y-1 ${p.bg} ${p.border || 'border border-slate-100 shadow-card'}`}>
      <div className="relative z-10 flex items-start justify-between">
        <div className="space-y-1">
          <p className={`text-[10px] font-bold text-slate-400 uppercase tracking-widest ${p.sub}`}>{label}</p>
          <div className="flex items-baseline gap-2">
            <h3 className={`text-3xl font-black tracking-tight ${p.text}`}>{value ?? '—'}</h3>
            {trend && <span className="text-xs font-bold text-emerald-500">{trend}</span>}
          </div>
          {sub && <p className={`text-xs font-medium ${p.sub}`}>{sub}</p>}
          {badge && <div className="mt-3">{badge}</div>}
        </div>
        {Icon && (
          <div className={`p-3 rounded-2xl transition-all duration-500 transform group-hover:rotate-12 ${p.icon}`}>
            <Icon size={24} />
          </div>
        )}
      </div>

      {/* Decoración sutil */}
      {color === 'institucional-dark' && Icon && (
        <Icon size={120} className="absolute -bottom-6 -right-6 text-white/5 opacity-10 rotate-12 pointer-events-none" />
      )}
    </div>
  )
}

export function Btn({ children, variant = 'primary', size = 'md', loading, disabled, onClick, type = 'button', className = '', ...rest }) {
  const variants = {
    primary: 'btn-primary',
    secondary: 'btn-secondary',
    danger: 'btn-danger',
    success: 'btn-success',
    ghost: 'btn-ghost',
    warning: 'btn-warning',
    'white-gold': 'btn-white-gold',
  }
  const sizes = { sm: 'px-3 py-1.5 text-xs !rounded-lg', md: '', lg: 'px-5 py-2.5 text-base' }
  return (
    <button
      type={type} disabled={disabled || loading} onClick={onClick}
      className={`${variants[variant] ?? variants.primary} ${sizes[size]} ${className} flex items-center justify-center gap-2`}
      {...rest}
    >
      {loading ? <Loader2 size={16} className="animate-spin shrink-0" /> : null}
      {children}
    </button>
  )
}

export function Dropdown({ trigger, children, align = 'right' }) {
  const [open, setOpen] = useState(false)
  const ref = useRef()
  useEffect(() => {
    function handleClickOutside(e) { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  return (
    <div className="relative inline-block text-left" ref={ref}>
      <div onClick={() => setOpen(!open)}>{trigger}</div>
      {open && (
        <div className={`absolute z-50 mt-2 w-56 rounded-xl bg-white shadow-card-lg border border-slate-100 ${align === 'right' ? 'right-0' : 'left-0'} animate-fade-in origin-top-right`} onClick={() => setOpen(false)}>
          <div className="py-1.5 px-1">{children}</div>
        </div>
      )}
    </div>
  )
}

export function DropdownItem({ children, onClick, icon: Icon, className = '' }) {
  return (
    <button onClick={onClick} className={`w-full flex items-center gap-2.5 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 hover:text-brand-600 rounded-lg text-left transition-colors ${className}`}>
      {Icon && <Icon size={15} className="text-slate-400 group-hover:text-brand-500" />}
      {children}
    </button>
  )
}

export function Input({ label, error, hint, rightElement, className = '', ...props }) {
  return (
    <div className="space-y-1.5">
      {label && <label className="label">{label}</label>}
      <div className="relative">
        <input className={`input ${error ? '!border-red-400 !ring-red-400' : ''} ${rightElement ? 'pr-10' : ''} ${className}`} {...props} />
        {rightElement && (
          <div className="absolute right-0 top-0 bottom-0 flex items-center pr-3">
            {rightElement}
          </div>
        )}
      </div>
      {error && <p className="text-xs text-red-500 flex items-center gap-1"><XCircle size={11} />{error}</p>}
      {hint && !error && <p className="text-xs text-slate-400">{hint}</p>}
    </div>
  )
}

export function Select({ label, error, children, className = '', ...props }) {
  return (
    <div className="space-y-1.5">
      {label && <label className="label">{label}</label>}
      <select className={`input ${error ? '!border-red-400' : ''} ${className}`} {...props}>
        {children}
      </select>
      {error && <p className="text-xs text-red-500 flex items-center gap-1"><XCircle size={11} />{error}</p>}
    </div>
  )
}

export function Textarea({ label, error, ...props }) {
  return (
    <div className="space-y-1.5">
      {label && <label className="label">{label}</label>}
      <textarea className={`input resize-none ${error ? '!border-red-400' : ''}`} {...props} />
      {error && <p className="text-xs text-red-500">{error}</p>}
    </div>
  )
}

export function Modal({ open, onClose, title, subtitle, children, size = 'md', footer, className = '' }) {
  useEffect(() => {
    if (open) document.body.style.overflow = 'hidden'
    else document.body.style.overflow = ''
    return () => { document.body.style.overflow = '' }
  }, [open])

  if (!open) return null
  const sizes = { sm: 'max-w-sm', md: 'max-w-md', lg: 'max-w-lg', xl: 'max-w-2xl', '2xl': 'max-w-3xl' }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm animate-fade-in" onClick={onClose} />
      <div className={`relative bg-white rounded-2xl shadow-card-lg w-full ${sizes[size] || ''} ${className} max-h-[90vh] overflow-hidden flex flex-col animate-slide-up`}>
        <div className="flex items-start justify-between px-6 py-5 border-b-4 border-yellow-600 bg-darkerBlue">
          <div>
            <h2 className="text-base font-bold text-white tracking-tight">{title}</h2>
            {subtitle && <p className="mt-0.5 text-sm font-medium text-white/60">{subtitle}</p>}
          </div>
          <button onClick={onClose} className="btn-icon ml-4 flex-shrink-0 text-white/60 hover:text-white hover:bg-white/10"><X size={16} /></button>
        </div>
        <div className="flex-1 overflow-y-auto px-6 py-5">{children}</div>
        {footer && <div className="px-6 py-4 border-t border-slate-100 bg-slate-50/50">{footer}</div>}
      </div>
    </div>
  )
}

export function Drawer({ open, onClose, title, subtitle, children, footer, className = '' }) {
  useEffect(() => {
    if (open) document.body.style.overflow = 'hidden'
    else document.body.style.overflow = ''
    return () => { document.body.style.overflow = '' }
  }, [open])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-[2px] animate-fade-in" onClick={onClose} />
      <div className={`relative bg-white w-full max-w-xl shadow-2xl flex flex-col animate-slide-right h-full ${className}`}>
        <div className="flex items-center justify-between px-8 h-[100px] border-b-4 border-yellow-600 bg-darkerBlue flex-shrink-0">
          <div>
            <h2 className="text-lg font-black text-white tracking-tight leading-tight">{title}</h2>
            {subtitle && <p className="mt-1 text-sm font-medium text-white/50">{subtitle}</p>}
          </div>
          <button onClick={onClose} className="btn-icon text-white/60 hover:text-white hover:bg-white/10 transition-colors"><X size={20} /></button>
        </div>
        <div className="flex-1 overflow-y-auto px-8 py-8 custom-scrollbar">{children}</div>
        {footer && <div className="px-8 py-6 border-t border-slate-100 bg-slate-50/50">{footer}</div>}
      </div>
    </div>
  )
}

export function Toast({ message, type = 'success', onClose, duration = 6000 }) {
  useEffect(() => { const t = setTimeout(onClose, duration); return () => clearTimeout(t) }, [onClose, duration])
  const styles = {
    success: { cls: 'bg-emerald-500', Icon: CheckCircle },
    error: { cls: 'bg-red-500', Icon: XCircle },
    warning: { cls: 'bg-amber-500', Icon: AlertTriangle },
    info: { cls: 'bg-brand-600', Icon: Info },
  }
  const { cls, Icon } = styles[type] ?? styles.info
  return (
    <div className={`fixed bottom-6 right-6 z-[100] flex items-start gap-3 px-4 py-3.5 rounded-2xl shadow-card-lg text-white max-w-sm animate-slide-up ${cls}`}>
      <Icon size={18} className="flex-shrink-0 mt-0.5" />
      <p className="text-sm font-medium flex-1">{message}</p>
      <button onClick={onClose} className="opacity-70 hover:opacity-100 flex-shrink-0"><X size={14} /></button>
    </div>
  )
}

export function Spinner({ size = 'md', full = true }) {
  const sizes = { sm: 'h-4 w-4', md: 'h-8 w-8', lg: 'h-12 w-12' }
  if (!full) return <Loader2 className={`animate-spin text-brand-500 ${sizes[size]}`} />
  return (
    <div className="flex items-center justify-center py-16">
      <div className="flex flex-col items-center gap-3">
        <Loader2 className={`animate-spin text-brand-500 ${sizes[size]}`} />
        <p className="text-xs text-slate-400 font-medium">Cargando...</p>
      </div>
    </div>
  )
}

export function EmptyState({ icon: Icon, title, description, action }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center px-4">
      {Icon && (
        <div className="mb-4 p-5 bg-slate-50 rounded-2xl ring-1 ring-slate-100">
          <Icon size={28} className="text-slate-300" />
        </div>
      )}
      <p className="text-sm font-semibold text-slate-700">{title}</p>
      {description && <p className="mt-1.5 text-xs text-slate-400 max-w-xs">{description}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  )
}

export function ErrorMsg({ error }) {
  let msg = error?.response?.data?.detail?.mensaje
    ?? error?.response?.data?.detail
    ?? error?.message
    ?? 'Ocurrió un error inesperado'

  if (Array.isArray(msg)) {
    msg = msg.map(m => m.msg || JSON.stringify(m)).join('\n')
  } else if (typeof msg === 'object' && msg !== null) {
    msg = JSON.stringify(msg)
  }

  // Dividir en líneas para mostrar errores multi-línea (solapamientos, etc.)
  const lines = String(msg).split('\n').filter(l => l.trim())
  const isMultiLine = lines.length > 1

  if (isMultiLine) {
    return (
      <div className="rounded-xl bg-red-50 border border-red-200 px-4 py-3">
        <div className="flex items-start gap-2.5 mb-2">
          <XCircle size={15} className="text-red-500 flex-shrink-0 mt-0.5" />
          <p className="text-sm font-bold text-red-700">{lines[0]}</p>
        </div>
        <ul className="space-y-1.5 pl-6">
          {lines.slice(1).map((line, i) => (
            <li key={i} className="flex items-start gap-2 text-xs text-red-600">
              <span className="w-1.5 h-1.5 rounded-full bg-red-400 flex-shrink-0 mt-1.5" />
              <span>{line.replace(/^•\s*/, '')}</span>
            </li>
          ))}
        </ul>
      </div>
    )
  }

  return (
    <div className="rounded-xl bg-red-50 border border-red-200 px-4 py-3 flex items-start gap-2.5">
      <XCircle size={15} className="text-red-500 flex-shrink-0 mt-0.5" />
      <p className="text-sm text-red-700 font-medium">{lines[0] ?? msg}</p>
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

export function Table({ columns, data, onRowClick, empty }) {
  if (!data?.length) return empty ?? <EmptyState title="Sin datos" />
  return (
    <div className="overflow-hidden rounded-2xl border border-slate-100">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-slate-50 border-b border-slate-100">
            {columns.map((col, i) => (
              <th key={i} className={`px-4 py-3 text-left text-xs font-bold text-slate-500 uppercase tracking-wider ${col.className ?? ''}`}>
                {col.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-50">
          {data.map((row, i) => (
            <tr
              key={row.id ?? i}
              onClick={onRowClick ? () => onRowClick(row) : undefined}
              className={`bg-white transition-colors ${onRowClick ? 'hover:bg-slate-50/80 cursor-pointer' : ''}`}
            >
              {columns.map((col, j) => (
                <td key={j} className={`px-4 py-3.5 ${col.tdClassName ?? ''}`}>
                  {col.render ? col.render(row) : row[col.key]}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export function ConfirmDialog({ open, onClose, onConfirm, title, message, confirmText = 'Confirmar', variant = 'danger', loading }) {
  return (
    <Modal open={open} onClose={onClose} title={title} size="sm"
      footer={
        <div className="flex gap-2 justify-end">
          <Btn variant="secondary" onClick={onClose}>Cancelar</Btn>
          <Btn variant={variant} onClick={onConfirm} loading={loading}>{confirmText}</Btn>
        </div>
      }
    >
      <p className="text-sm text-slate-600">{message}</p>
    </Modal>
  )
}

export function SearchInput({ value, onChange, placeholder = 'Buscar...', className = '' }) {
  return (
    <div className={`relative ${className}`}>
      <svg className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
      </svg>
      <input
        value={value} onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        className="input pl-10"
      />
    </div>
  )
}
