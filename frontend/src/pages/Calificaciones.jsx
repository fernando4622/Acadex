import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  unidades as unidadesApi,
  actividades as actividadesApi,
  calificaciones as calsApi,
  resultados as resApi,
  grupos as gruposApi,
  entregas as entregasApi,
} from '../api/endpoints'
import { PageHeader } from '../components/layout/Layout'
import { Card, Btn, CalDisplay, Spinner, Toast, EmptyState, Modal, Input } from '../components/ui'
import { Save, ChevronLeft, ChevronRight, BarChart2, AlertTriangle, CheckCircle, FileDown, Gift, Paperclip, Download, Eye, Book } from 'lucide-react'
import { generarReporteAcademico } from '../utils/reportGenerator'

export default function Calificaciones() {
  const { grupoId, unidadId } = useParams()
  const navigate = useNavigate()

  const [unidad, setUnidad] = useState(null)
  const [acts, setActs] = useState([])
  const [actIdx, setActIdx] = useState(0)
  const [registros, setRegistros] = useState([])
  const [edited, setEdited] = useState({})
  const [resultados, setResultados] = useState({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [toast, setToast] = useState(null)
  const [numAlumnos, setNumAlumnos] = useState(0)
  const [modalEntrega, setModalEntrega] = useState({ open: false, alumno: null, entregas: [] })

  // Captura pendiente
  const [captura, setCaptura] = useState(null)   // { total, pendientes, completado, detalle }

  const [bonusForm, setBonusForm] = useState({ monto: '', justificacion: '' })
  const [savingBonus, setSavingBonus] = useState(false)

  const act = acts[actIdx]

  function notify(message, type = 'success') {
    setToast({ message, type })
    setTimeout(() => setToast(null), 3000)
  }

  useEffect(() => {
    async function init() {
      const uIdNum = parseInt(unidadId)
      const [u, a, cap, alum] = await Promise.all([
        unidadesApi.listar(grupoId).then(r => r.data.find(x => x.id === uIdNum)),
        actividadesApi.listar(uIdNum).then(r => r.data),
        unidadesApi.capturaPendiente(uIdNum).then(r => r.data).catch(() => null),
        gruposApi.alumnos(grupoId).then(r => r.data.filter(i => i.estado_inscripcion === 'ACTIVA').length).catch(() => 0),
      ])

      setUnidad(u)
      setActs(a)
      setCaptura(cap)
      setNumAlumnos(alum)
      setLoading(false)
    }
    init()
  }, [grupoId, unidadId])

  async function refrescarCaptura() {
    try {
      console.log('Solicitando refresco de captura para unidad:', unidadId);
      const r = await unidadesApi.capturaPendiente(parseInt(unidadId));
      console.log('Respuesta de captura recibida:', r.data);
      setCaptura(r.data);
    } catch (e) {
      console.error('Error refrescando captura:', e);
    }
  }

  useEffect(() => {
    console.log('Estado de captura actualizado:', captura);
  }, [captura]);

  useEffect(() => {
    if (!act) return
    setLoading(true)
    setResultados({})   // limpiar parciales de la actividad anterior
      calsApi.listar(act.id)
      .then(async (r) => {
        setRegistros(r.data)
        setEdited({})
        
        // Populate resultados from the optimized backend response
        const newResultados = {};
        r.data.forEach(x => {
          newResultados[x.inscripcion_id] = { final: x.parcial_unidad };
        });
        setResultados(newResultados);
      })
      .finally(() => setLoading(false))
  }, [act?.id])



  function onChange(inscripcionId, field, value) {
    setEdited(prev => ({
      ...prev,
      [inscripcionId]: { ...(prev[inscripcionId] ?? {}), [field]: value }
    }))
  }

  async function guardarTodo() {
    if (Object.keys(edited).length === 0) {
      notify('Sin cambios que guardar', 'info')
      return
    }
    setSaving(true)
    const payload = Object.entries(edited).map(([inscripcion_id, val]) => ({
      inscripcion_id,                                           // UUID — no parseInt
      calificacion: val.estado_entrega === 'NP' ? 0 : parseFloat(val.calificacion ?? 0),
      estado_entrega: val.estado_entrega ?? 'ENTREGADA',
    }))
    try {
      const r = await calsApi.bulk(act.id, { calificaciones: payload, motivo: 'Registro de calificaciones' })
      notify(`${r.data.guardadas} calificaciones guardadas`)
      setEdited({})
      refrescarCaptura()
      const reloaded = await calsApi.listar(act.id)
      setRegistros(reloaded.data)
      setEdited({})
      // Recalcular parciales con los valores ya persistidos en BD
      const newResultados = {};
      reloaded.data.forEach(r => {
        newResultados[r.inscripcion_id] = { final: r.parcial_unidad };
      });
      setResultados(newResultados);
      await refrescarCaptura()
    } catch (err) {
      notify(err?.response?.data?.detail?.mensaje ?? 'Error al guardar', 'error')
    } finally {
      setSaving(false)
    }
  }


  async function exportarPDF() {
    setSaving(true)
    try {
      const statsForPdf = {
        total_alumnos: numAlumnos,
        promedio_grupo: Object.values(resultados).reduce((a, b) => a + (b.final || 0), 0) / (numAlumnos || 1),
        aprobados: Object.values(resultados).filter(r => (r.final || 0) >= 70).length,
        reprobados: Object.values(resultados).filter(r => (r.final || 0) < 70).length
      }

      const rows = registros.map(r => ({
        no_control: r.no_control,
        alumno: r.alumno,
        materia: `${unidad?.nombre} (Unidad ${unidad?.numero})`,
        resultado_final: resultados[r.inscripcion_id]?.final || 0,
        estatus: (resultados[r.inscripcion_id]?.final || 0) >= 70 ? 'APROBADO' : 'REPROBADO'
      }))

      generarReporteAcademico(statsForPdf, rows, {
        filename: `Reporte_${unidad?.nombre}_${new Date().toISOString().split('T')[0]}.pdf`,
        subtitle: `Reporte Detallado de Unidad: ${unidad?.nombre}`
      })
      notify('Reporte de unidad generado')
    } catch (err) {
      notify('Error al generar reporte', 'error')
    } finally {
      setSaving(false)
    }
  }

  function aplicarATodos(calificacion) {
    const next = {}
    registros.forEach(r => {
      next[r.inscripcion_id] = { calificacion: String(calificacion), estado_entrega: 'ENTREGADA' }
    })
    setEdited(next)
  }

  const handleVerEntregas = async (reg) => {
    try {
      const res = await entregasApi.entregasAlumno(act.id, reg.inscripcion_id)
      setModalEntrega({
        open: true,
        alumno: reg.alumno,
        entregas: res.data
      })
    } catch (err) {
      notify('Error al obtener entregas', 'error')
    }
  }

  const handleDescargar = async (entregaId, nombre) => {
    try {
      const res = await entregasApi.descargar(entregaId)
      const url = window.URL.createObjectURL(new Blob([res.data]))
      const link = document.createElement('a')
      link.href = url
      link.setAttribute('download', nombre)
      document.body.appendChild(link)
      link.click()
      link.remove()
    } catch (err) {
      notify('Error al descargar el archivo', 'error')
    }
  }

  if (loading || captura === null) return <Spinner />

  if (!unidad) {
    return (
      <div className="p-8 text-center">
        <Card className="p-12">
          <AlertTriangle className="mx-auto text-amber-500 mb-4" size={48} />
          <h2 className="text-xl font-bold mb-2">Unidad no encontrada</h2>
          <p className="text-slate-500 mb-6">No se pudo cargar la información de la unidad seleccionada.</p>
          <Btn onClick={() => navigate(`/grupos/${grupoId}`)}>Volver al grupo</Btn>
        </Card>
      </div>
    )
  }

  const completados = registros.filter(r => !r.pendiente).length
  const pendientesActuales = registros.filter(r => r.pendiente).length
  const totalActividadesEsperadas = acts.length * registros.length

  // Calcular porcentaje basado en actividades pendientes vs totales
  const pctUnidad = totalActividadesEsperadas > 0 
    ? ((totalActividadesEsperadas - (registros.filter(r => r.pendiente).length * acts.length)) / totalActividadesEsperadas) * 100 
    : 0
  const unidadCompleta = pendientesActuales === 0 && acts.length > 0 && registros.length > 0

  return (
    <div>
      <PageHeader
        breadcrumb={['Grupos', unidad?.nombre ?? '...', 'Captura']}
        title="Capturar calificaciones"
        subtitle={act ? `Actividad: ${act.tipo_nombre || act.tipo || 'Sin tipo'} ${act.descripcion ? '— ' + act.descripcion : ''} · Peso: ${act.ponderacion}%` : acts.length === 0 ? 'Sin actividades' : 'Seleccione una actividad'}
        actions={
          <div className="flex gap-2">
            <Btn variant="secondary" size="sm" onClick={() => navigate(`/grupos/${grupoId}`)}>
              <ChevronLeft size={18} /> Volver
            </Btn>
            <Btn variant="secondary" size="sm" onClick={() => navigate(`/grupos/${grupoId}/resultados`)}>
              <BarChart2 size={18} /> Resultados finales
            </Btn>
          </div>
        }
      />

      <div className="p-8 space-y-4">

        <div className={`flex items-center gap-4 px-5 py-3.5 rounded-xl border
          ${unidadCompleta
            ? 'bg-emerald-50 border-emerald-200'
            : 'bg-amber-50 border-amber-200'}`}
        >
          <div className={`flex-shrink-0 ${unidadCompleta ? 'text-emerald-500' : 'text-amber-500'}`}>
            {unidadCompleta
              ? <CheckCircle size={18} />
              : <AlertTriangle size={18} />
            }
          </div>
          <div className="flex-1 min-w-0">
            <p className={`text-sm font-semibold ${unidadCompleta ? 'text-emerald-800' : 'text-amber-800'}`}>
              {unidadCompleta
                ? 'Unidad completa — todos los alumnos tienen calificación'
                : `Faltan calificaciones en esta unidad`}
            </p>
            <div className="mt-1.5 h-1.5 w-full bg-white/60 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-500 ${unidadCompleta ? 'bg-emerald-500' : 'bg-amber-400'}`}
                style={{ width: `${Math.min(100, Math.max(0, pctUnidad))}%` }}
              />
            </div>
          </div>
          <span className={`text-sm font-bold tabular-nums flex-shrink-0 ${unidadCompleta ? 'text-emerald-700' : 'text-amber-700'}`}>
            {Math.min(100, Math.max(0, pctUnidad)).toFixed(0)}%
          </span>
        </div>


        <Card className="p-4">
          <div className="flex items-center gap-2 overflow-x-auto pb-1">
            {acts.map((a, i) => {
              const pendAct = Array.isArray(captura) ? captura.filter(d => d.actividad_id === a.id && d.pendiente === true).length : 0
              return (
                <button
                  key={a.id}
                  onClick={() => setActIdx(i)}
                  className={`flex-shrink-0 flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium transition-all
                    ${i === actIdx
                      ? 'bg-brand-700 text-white shadow-sm'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
                >
                  {a.tipo_nombre || 'Sin nombre'}{a.descripcion ? ` — ${a.descripcion}` : ''}
                  <span className="opacity-70">{a.ponderacion}%</span>
                  {pendAct > 0 && (
                    <span className={`px-1 py-0.5 rounded text-[10px] font-bold
                      ${i === actIdx ? 'bg-white/20 text-white' : 'bg-amber-100 text-amber-700'}`}>
                      {pendAct}
                    </span>
                  )}

                </button>
              )
            })}
          </div>
        </Card>

        <div className="flex items-center justify-between text-sm">
          <span className="text-slate-600">
            <span className="font-semibold text-brand-700">{completados}</span> de {registros.length} alumnos con calificación en esta actividad
          </span>
          <div className="flex items-center gap-3">
            <span className="text-xs text-slate-400">Rellenar todos con:</span>
            {[100, 80, 60].map(n => (
              <button
                key={n}
                onClick={() => aplicarATodos(n)}
                className="px-2 py-1 rounded text-xs bg-slate-100 hover:bg-slate-200 font-medium text-slate-600 transition"
              >
                {n}
              </button>
            ))}
          </div>
        </div>

        <Card className="overflow-hidden">
          {loading
            ? <Spinner />
            : acts.length === 0
              ? (
                <div className="p-12 text-center">
                  <div className="w-16 h-16 rounded-2xl bg-slate-50 flex items-center justify-center text-slate-300 mx-auto mb-4">
                    <Book size={32} />
                  </div>
                  <h3 className="text-lg font-bold text-slate-800">Sin actividades</h3>
                  <p className="text-slate-500 max-w-xs mx-auto mt-1 mb-6 text-sm">
                    Esta unidad aún no tiene actividades evaluables configuradas. Añada actividades para comenzar la captura.
                  </p>
                  <Btn variant="secondary" size="sm" onClick={() => navigate(`/grupos/${grupoId}`)}>
                    Gestionar actividades
                  </Btn>
                </div>
              )
              : registros.length === 0
                ? <EmptyState title="Sin alumnos inscritos" subtitle="No hay alumnos activos en este grupo para calificar." />
                : (
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 border-b border-slate-100">
                    <tr>
                      <th className="text-left px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Alumno</th>
                      <th className="text-left px-3 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide w-28">Estado</th>
                      <th className="text-center px-3 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide w-36">Calificación</th>
                      <th className="text-right px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide w-32">Parcial unidad</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {registros.map(r => {
                      const edit = edited[r.inscripcion_id]
                      const curCal = edit?.calificacion ?? (r.calificacion !== null ? String(r.calificacion) : '')
                      const curEst = edit?.estado_entrega ?? r.estado_entrega ?? 'NP'
                      const isNP = curEst === 'NP'
                      const modified = !!edit

                      const isEditable = unidad?.estado === 'EDICION';

                      return (
                        <tr key={r.inscripcion_id} className={`group transition-colors ${modified ? 'bg-brand-50/40' : 'hover:bg-slate-50/50'}`}>
                          <td className="px-5 py-3">
                            <div className="flex items-center gap-2">
                              {r.pendiente && !edit && (
                                <span className="w-1.5 h-1.5 rounded-full bg-amber-400 flex-shrink-0" title="Sin calificación" />
                              )}
                              <div>
                                <p className="font-medium text-slate-900">{r.alumno}</p>
                                <p className="text-xs text-slate-400">{r.no_control}</p>
                              </div>
                            </div>
                          </td>
                          <td className="px-3 py-3">
                            <div className="flex items-center gap-2">
                              <select
                                value={curEst}
                                onChange={e => onChange(r.inscripcion_id, 'estado_entrega', e.target.value)}
                                disabled={!isEditable}
                                className="text-xs border border-slate-200 rounded-lg px-2 py-1.5 bg-white focus:ring-2 focus:ring-brand-500 focus:border-transparent outline-none flex-1 disabled:opacity-50 disabled:cursor-not-allowed"
                              >
                                <option value="ENTREGADA">{act?.tipo === 'ASISTENCIA' ? 'Presente' : 'Entregada'}</option>
                                <option value="NP">{act?.tipo === 'ASISTENCIA' ? 'Falta' : 'No presentó'}</option>
                                <option value="EXENTO">Exento</option>
                              </select>

                            </div>
                          </td>
                          <td className="px-3 py-3 text-center">
                            {isNP
                              ? <span className="text-xs text-red-500 font-medium">NP = 0</span>
                              : (
                                <input
                                  type="number" min="0" max={100} step="1"
                                  value={curCal}
                                  onChange={e => onChange(r.inscripcion_id, 'calificacion', e.target.value)}
                                  placeholder="—"
                                  disabled={!isEditable}
                                  className={`w-24 text-center border rounded-lg px-2 py-1.5 text-sm font-semibold
                                  focus:ring-2 focus:ring-brand-500 focus:border-transparent outline-none transition
                                  ${modified ? 'border-brand-300 bg-white' : 'border-slate-200 bg-white'}
                                  disabled:opacity-50 disabled:cursor-not-allowed`}
                                />
                              )
                            }
                          </td>
                          <td className="px-5 py-3 text-right">
                            <CalDisplay valor={resultados[r.inscripcion_id]?.final ?? null} size="sm" />
                            {!resultados[r.inscripcion_id]?.final && (
                              <span className="text-xs text-slate-300">—</span>
                            )}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              )
          }
        </Card>

        <div className="flex items-center justify-between pt-2">
          <div className="flex gap-2">
            <Btn variant="secondary" size="sm" disabled={actIdx === 0} onClick={() => setActIdx(i => i - 1)}>
              <ChevronLeft size={14} /> Anterior
            </Btn>
            <Btn variant="secondary" size="sm" disabled={actIdx === acts.length - 1} onClick={() => setActIdx(i => i + 1)}>
              Siguiente <ChevronRight size={14} />
            </Btn>
          </div>
          <Btn size="md" loading={saving} disabled={Object.keys(edited).length === 0} onClick={guardarTodo}>
            <Save size={15} />
            Guardar {Object.keys(edited).length > 0 ? `(${Object.keys(edited).length})` : 'todo'}
          </Btn>
        </div>
      </div>


      {modalEntrega.open && (
        <Modal
          open={modalEntrega.open}
          onClose={() => setModalEntrega({ open: false, alumno: null, entregas: [] })}
          title={`Entregas de ${modalEntrega.alumno}`}
          size="md"
        >
          <div className="space-y-3">
            {modalEntrega.entregas.length === 0 ? (
              <EmptyState title="Sin archivos" subtitle="No se encontraron archivos físicos para esta entrega." />
            ) : (
              <div className="divide-y divide-slate-100">
                {modalEntrega.entregas.map((e, idx) => (
                  <div key={e.id} className="py-3 flex items-center justify-between group">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-slate-700 truncate">
                        {e.nombre_original}
                      </p>
                      <div className="flex items-center gap-3 mt-1">
                        <span className="text-[10px] text-slate-400 font-mono">
                          v{e.version} · {new Date(e.ts_servidor).toLocaleString()}
                        </span>
                        <span className="text-[10px] text-slate-400">
                          {(e.tamanio_bytes / 1024).toFixed(1)} KB
                        </span>
                      </div>
                    </div>
                    <Btn
                      variant="secondary"
                      size="sm"
                      onClick={() => handleDescargar(e.id, e.nombre_original)}
                    >
                      <Download size={14} className="mr-1.5" /> Descargar
                    </Btn>
                  </div>
                ))}
              </div>
            )}
            <div className="pt-4 flex justify-end">
              <Btn onClick={() => setModalEntrega({ open: false, alumno: null, entregas: [] })}>Cerrar</Btn>
            </div>
          </div>
        </Modal>
      )}

      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
    </div>
  )
}
