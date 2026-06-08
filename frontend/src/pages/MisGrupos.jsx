import { useState, useEffect } from 'react'
import { inscripciones as inscApi, periodos as periodosApi } from '../api/endpoints'
import { PageHeader } from '../components/layout/Layout'
import { Card, Badge, Spinner, EmptyState, CalDisplay } from '../components/ui'
import { BookOpen, Calendar, ChevronRight } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

export default function MisGrupos() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [grupos, setGrupos] = useState([])
  const [periodos, setPeriodos] = useState([])
  const [selectedPeriodo, setSelectedPeriodo] = useState('ALL')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([
      inscApi.misGrupos(),
      periodosApi.listar()
    ]).then(([resGrupos, resPeriodos]) => {
      setGrupos(resGrupos.data)
      setPeriodos(resPeriodos.data)
      // Seleccionar el periodo activo por defecto si existe
      const activo = resPeriodos.data.find(p => p.estado === 'activo')
      if (activo) {
        setSelectedPeriodo(activo.id.toString())
      }
      setLoading(false)
    }).catch((err) => {
      console.error(err)
      setLoading(false)
    })
  }, [])

  const gruposFiltrados = selectedPeriodo === 'ALL' 
    ? grupos 
    : grupos.filter(g => g.periodo_id?.toString() === selectedPeriodo)

  if (loading) return <Spinner />

  return (
    <div>
      <PageHeader
        title="Mis Grupos"
        subtitle={user?.nombre ?? 'Listado de tus materias inscritas'}
        actions={
          <div className="flex bg-white rounded-lg p-1 border border-slate-200">
            <select 
              className="text-sm font-medium bg-transparent border-none focus:ring-0 text-slate-700 py-1.5 pl-3 pr-8"
              value={selectedPeriodo}
              onChange={(e) => setSelectedPeriodo(e.target.value)}
            >
              <option value="ALL">Todos los periodos</option>
              {periodos.map(p => (
                <option key={p.id} value={p.id}>{p.nombre}</option>
              ))}
            </select>
          </div>
        }
      />

      <div className="p-8 space-y-4 max-w-5xl mx-auto">
        {gruposFiltrados.length === 0 ? (
          <EmptyState
            icon={BookOpen}
            title="Sin grupos en este periodo"
            description="No estás inscrito en ningún grupo para el periodo escolar seleccionado."
          />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {gruposFiltrados.map(g => (
              <Card key={g.inscripcion_id} className="hover:-translate-y-1 transition-all duration-200 hover:shadow-lg cursor-pointer border hover:border-brand-200" onClick={() => navigate(`/mis-grupos/${g.inscripcion_id}`)}>
                <div className="p-5">
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-brand-50 flex items-center justify-center flex-shrink-0">
                        <BookOpen size={20} className="text-brand-600" />
                      </div>
                      <div>
                        <h3 className="font-bold text-slate-900 leading-tight">{g.materia}</h3>
                        <p className="text-xs font-semibold text-slate-500 mt-0.5">{g.nombre}</p>
                      </div>
                    </div>
                    <Badge estado={g.estado} />
                  </div>
                  
                  <div className="bg-slate-50 rounded-xl p-3 flex items-center justify-between">
                    <div>
                      <p className="text-[10px] uppercase font-bold text-slate-400">Docente</p>
                      <p className="text-sm font-semibold text-slate-700 truncate max-w-[150px]">{g.docente}</p>
                    </div>
                    <div className="text-right">
                       <p className="text-[10px] uppercase font-bold text-slate-400 mb-0.5">Promedio</p>
                       {g.resultado_final !== null && g.resultado_final !== undefined ? (
                         <span className={`text-base font-black ${g.resultado_final >= 70 ? 'text-emerald-500' : 'text-rose-500'}`}>
                           {g.resultado_final.toFixed(1)}
                         </span>
                       ) : (
                         <span className="text-base font-black text-slate-400">--</span>
                       )}
                    </div>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
