import { useState, useEffect, useCallback } from 'react'
import { auditoria as api } from '../api/endpoints'
import { PageHeader } from '../components/layout/Layout'
import { Card, Spinner } from '../components/ui'
import { ShieldCheck, RefreshCw, Filter, ChevronDown, ChevronRight } from 'lucide-react'

const OP_COLOR = {
  INSERT: 'bg-emerald-100 text-emerald-700',
  UPDATE: 'bg-amber-100  text-amber-700',
  DELETE: 'bg-rose-100   text-rose-700',
  BONUS_APLICADO: 'bg-violet-100 text-violet-700',
  BONUS_MODIFICADO: 'bg-purple-100 text-purple-700',
  OVERRIDE_APLICADO: 'bg-sky-100    text-sky-700',
  UNIDAD_CERRADA: 'bg-indigo-100 text-indigo-700',
  MATERIA_FINALIZADA: 'bg-blue-100   text-blue-700',
  RECALCULO: 'bg-slate-100  text-slate-600',
}

function fmtFecha(iso) {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('es-MX', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  })
}

function JsonViewer({ data, label }) {
  const [open, setOpen] = useState(false)
  if (!data) return <span className="text-slate-400 italic text-xs">—</span>
  return (
    <div>
      <button
        onClick={() => setOpen(v => !v)}
        className="flex items-center gap-1 text-xs text-indigo-600 font-semibold hover:underline"
      >
        {open ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
        {label}
      </button>
      {open && (
        <pre className="mt-2 text-[10px] bg-slate-900 text-emerald-300 p-3 rounded-xl overflow-x-auto max-h-48 leading-relaxed">
          {JSON.stringify(typeof data === 'string' ? JSON.parse(data) : data, null, 2)}
        </pre>
      )}
    </div>
  )
}

export default function Auditoria() {
  const [registros, setRegistros] = useState([])
  const [tablas, setTablas] = useState([])
  const [loading, setLoading] = useState(true)
  const [filtros, setFiltros] = useState({ tabla: '', operacion: '', registro_id: '', limite: 100 })

  const OPERACIONES = [
    'INSERT', 'UPDATE', 'DELETE', 'BONUS_APLICADO', 'BONUS_MODIFICADO',
    'OVERRIDE_APLICADO', 'UNIDAD_CERRADA', 'MATERIA_FINALIZADA', 'RECALCULO',
  ]

  const cargar = useCallback(() => {
    setLoading(true)
    const params = {}
    if (filtros.tabla) params.tabla = filtros.tabla
    if (filtros.operacion) params.operacion = filtros.operacion
    if (filtros.registro_id) params.registro_id = filtros.registro_id
    params.limite = filtros.limite

    api.listar(params).then(res => {
      setRegistros(res.data || [])
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [filtros])

  useEffect(() => {
    api.tablas().then(res => setTablas(res.data || []))
  }, [])

  useEffect(() => { cargar() }, [cargar])

  return (
    <div className="bg-slate-50/50 min-h-screen pb-20">
      <div className="bg-white border-b border-slate-200">
        <PageHeader
          title="Auditoría del Sistema"
          subtitle="Historial inmutable de todas las operaciones críticas"
        />
      </div>

      <div className="max-w-7xl mx-auto p-8 space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-700">
        {/* Filtros */}
        <Card className="p-6 rounded-3xl">
          <h3 className="font-bold text-slate-700 mb-4 flex items-center gap-2">
            <Filter size={18} className="text-indigo-500" /> Filtros
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
            <div>
              <label className="block text-xs font-bold text-slate-500 mb-1">Tabla</label>
              <select
                className="w-full text-sm border border-slate-200 rounded-xl px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-300"
                value={filtros.tabla}
                onChange={e => setFiltros(f => ({ ...f, tabla: e.target.value }))}
              >
                <option value="">Todas</option>
                {tablas.map(t => (
                  <option key={t.tabla} value={t.tabla}>{t.tabla} ({t.registros})</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-500 mb-1">Operación</label>
              <select
                className="w-full text-sm border border-slate-200 rounded-xl px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-300"
                value={filtros.operacion}
                onChange={e => setFiltros(f => ({ ...f, operacion: e.target.value }))}
              >
                <option value="">Todas</option>
                {OPERACIONES.map(op => <option key={op} value={op}>{op}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-500 mb-1">ID Registro</label>
              <input
                type="text"
                placeholder="UUID o ID numérico"
                className="w-full text-sm border border-slate-200 rounded-xl px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-300"
                value={filtros.registro_id}
                onChange={e => setFiltros(f => ({ ...f, registro_id: e.target.value }))}
              />
            </div>
            <div className="flex items-end gap-2">
              <div className="flex-1">
                <label className="block text-xs font-bold text-slate-500 mb-1">Límite</label>
                <select
                  className="w-full text-sm border border-slate-200 rounded-xl px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-300"
                  value={filtros.limite}
                  onChange={e => setFiltros(f => ({ ...f, limite: Number(e.target.value) }))}
                >
                  {[50, 100, 200, 500].map(l => <option key={l} value={l}>{l}</option>)}
                </select>
              </div>
              <button
                onClick={cargar}
                className="mb-0.5 p-2.5 rounded-xl bg-indigo-600 text-white hover:bg-indigo-700 transition-colors"
                title="Recargar"
              >
                <RefreshCw size={16} />
              </button>
            </div>
          </div>
        </Card>

        {/* Resumen rápido */}
        <div className="flex items-center gap-2 text-sm text-slate-500">
          <ShieldCheck size={16} className="text-indigo-500" />
          <span><strong className="text-slate-700">{registros.length}</strong> registros mostrados • Log inmutable protegido por RLS</span>
        </div>

        {/* Tabla de registros */}
        <Card className="rounded-3xl overflow-hidden">
          {loading ? (
            <div className="flex justify-center py-16"><Spinner /></div>
          ) : registros.length === 0 ? (
            <div className="text-center py-16 text-slate-400">
              <ShieldCheck size={40} className="mx-auto mb-3 text-slate-300" />
              <p className="font-medium">No hay registros con los filtros aplicados.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 border-b border-slate-100">
                  <tr>
                    {['#', 'Fecha', 'Tabla', 'Operación', 'Registro ID', 'Usuario', 'Motivo', 'Anterior', 'Nuevo'].map(h => (
                      <th key={h} className="px-4 py-3 text-left text-xs font-bold text-slate-500 uppercase tracking-wider whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {registros.map((r, i) => (
                    <tr key={r.id} className="hover:bg-indigo-50/30 transition-colors">
                      <td className="px-4 py-3 text-xs text-slate-400 font-mono">{r.id}</td>
                      <td className="px-4 py-3 text-xs text-slate-600 whitespace-nowrap font-mono">{fmtFecha(r.ts)}</td>
                      <td className="px-4 py-3 text-xs font-bold text-slate-700">{r.tabla}</td>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-black whitespace-nowrap ${OP_COLOR[r.operacion] || 'bg-slate-100 text-slate-600'}`}>
                          {r.operacion}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-500 font-mono max-w-[120px] truncate">{r.registro_id ?? '—'}</td>
                      <td className="px-4 py-3 text-xs text-slate-500 font-mono max-w-[100px] truncate">{r.usuario_app ?? '—'}</td>
                      <td className="px-4 py-3 text-xs text-slate-500 max-w-[150px] truncate">{r.motivo ?? '—'}</td>
                      <td className="px-4 py-3"><JsonViewer data={r.valor_anterior} label="Ver anterior" /></td>
                      <td className="px-4 py-3"><JsonViewer data={r.valor_nuevo} label="Ver nuevo" /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>
    </div>
  )
}
