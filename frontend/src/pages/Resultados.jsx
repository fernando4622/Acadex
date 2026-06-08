import { useState, useEffect } from 'react'
import { useParams } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { grupos as gruposApi, resultados as resApi, unidades as unidadesApi, dashboard as dashboardApi } from '../api/endpoints'
import { PageHeader } from '../components/layout/Layout'
import { Card, StatCard, Badge, CalDisplay, Btn, Modal, Input, Spinner, Toast, EmptyState } from '../components/ui'
import { BarChart2, Users, CheckCircle, XCircle, Search, Eye, Gift, Edit, Clock, FileDown, GraduationCap, Info } from 'lucide-react'
import { generarReporteAcademico } from '../utils/reportGenerator'

export default function Resultados() {
  const { grupoId } = useParams()
  const { user, isDocente, isAdmin } = useAuth()

  const [grupo, setGrupo] = useState(null)
  const [resultados, setResultados] = useState([])
  const [resUnidades, setResUnidades] = useState([])
  const [stats, setStats] = useState(null)
  const [unidades, setUnidades] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [desglose, setDesglose] = useState(null)
  const [modalBonus, setModalBonus] = useState(null)  // { insc, tipo: 'materia'|'unidad' }
  const [modalOverride, setModalOvr] = useState(null)
  const [modalVerBonus, setModalVerBonus] = useState(null)
  const [toast, setToast] = useState(null)

  const [bonusForm, setBonusForm] = useState({ monto: '', justificacion: '', unidad_id: '' })
  const [ovrForm, setOvrForm] = useState({ valor: '', justificacion: '' })
  const [saving, setSaving] = useState(false)

  function notify(msg, type = 'success') {
    setToast({ message: msg, type })
    setTimeout(() => setToast(null), 3500)
  }

  async function cargar() {
    try {
      const [g, r, s, u, ru] = await Promise.all([
        gruposApi.obtener(grupoId),
        gruposApi.resultados(grupoId),
        gruposApi.estadisticas(grupoId),
        unidadesApi.listar(grupoId),
        gruposApi.resultadosUnidades(grupoId).catch(() => ({ data: [] }))
      ])
      setGrupo(g.data)
      setResultados(r.data)
      setStats(s.data)
      setUnidades(u.data)
      setResUnidades(ru.data)
    } catch (err) {
      console.error(err)
      notify('Error al cargar resultados', 'error')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { cargar() }, [grupoId])

  async function verDesglose(inscripcionId) {
    const r = await resApi.desglose(inscripcionId)
    setDesglose(r.data)
  }

  async function aplicarBonus(e) {
    e.preventDefault()
    setSaving(true)
    try {
      if (modalBonus.tipo === 'unit') {
        await gruposApi.bonusUnidad(grupoId, {
          inscripcion_id: modalBonus.insc.inscripcion_id,
          unidad_id: modalBonus.unidad_id,
          monto: parseFloat(bonusForm.monto),
          justificacion: bonusForm.justificacion || null,
        })
        notify('Bonus de unidad aplicado correctamente')
      } else {
        await gruposApi.bonusMateria(grupoId, {
          inscripcion_id: modalBonus.insc.inscripcion_id,
          monto: parseFloat(bonusForm.monto),
          justificacion: bonusForm.justificacion || null,
        })
        notify('Bonus de materia aplicado correctamente')
      }
      setModalBonus(null)
      setBonusForm({ monto: '', justificacion: '', unidad_id: '' })
      await cargar()
    } catch (err) {
      notify(err?.response?.data?.detail?.mensaje ?? 'Error al aplicar bonus', 'error')
    } finally {
      setSaving(false)
    }
  }

  async function aplicarOverride(e) {
    e.preventDefault()
    setSaving(true)
    try {
      await gruposApi.override(grupoId, {
        inscripcion_id: modalOverride,
        resultado_override: parseFloat(ovrForm.valor),
        justificacion: ovrForm.justificacion,
      })
      setModalOvr(null)
      setOvrForm({ valor: '', justificacion: '' })
      await cargar()
      notify('Cambio aplicado correctamente')
    } catch (err) {
      notify(err?.response?.data?.detail?.mensaje ?? 'Error al aplicar cambio', 'error')
    } finally {
      setSaving(false)
    }
  }

  async function exportarPDF() {
    const unidadesCerradas = unidades.filter(u => ['CERRADA', 'PRE_CIERRE'].includes(u.estado)).sort((a, b) => a.numero - b.numero)

    if (unidadesCerradas.length === 0 && resultados.length === 0) {
      notify('No hay resultados disponibles para generar el reporte aún. Debes cerrar al menos una unidad.', 'info');
      return;
    }

    setSaving(true)
    try {
      // 1. Intentar obtener datos detallados del BI (materia finalizada)
      let dataToReport = [];
      let isFinalized = false;
      try {
        const detailedResponse = await dashboardApi.detalle({ grupo_id: grupoId })
        if (detailedResponse.data?.length > 0) {
          dataToReport = detailedResponse.data;
          isFinalized = true;
        }
      } catch (e) {
        console.warn("Materia no finalizada, generando reporte parcial...");
      }

      // 2. Si no hay datos finales, construir reporte por unidades cerradas
      if (!isFinalized) {
        if (unidadesCerradas.length === 0) {
           notify('Aún no hay unidades cerradas para generar el reporte.', 'warning');
           return;
        }

        // Construir tabla: [No. Control, Alumno, U1, U2, ..., Promedio Actual]
        const headers = [['No. Control', 'Alumno', ...unidadesCerradas.map(u => `U${u.numero}`), 'Prom. Actual', 'Estado']];
        
        // Agrupar resultados de unidades por alumno
        const alumnosMap = new Map();
        resUnidades.forEach(ru => {
          if (!alumnosMap.has(ru.inscripcion_id)) {
            alumnosMap.set(ru.inscripcion_id, {
              matricula: ru.matricula,
              alumno: ru.alumno,
              unidades: {}
            });
          }
          alumnosMap.get(ru.inscripcion_id).unidades[ru.unidad_id] = ru.resultado;
        });

        const body = Array.from(alumnosMap.values()).map(a => {
          const valsUnidades = unidadesCerradas.map(u => a.unidades[u.id] !== undefined ? a.unidades[u.id].toFixed(1) : '--');
          const suma = unidadesCerradas.reduce((acc, u) => acc + (a.unidades[u.id] || 0), 0);
          const prom = suma / unidadesCerradas.length;
          return [
            a.matricula,
            a.alumno,
            ...valsUnidades,
            prom.toFixed(2),
            prom >= 70 ? 'APROBADO' : 'REPROBADO'
          ];
        });

        generarReporteAcademico(stats, [], {
          filename: `Reporte_Parcial_${grupo?.nombre}_${new Date().toISOString().split('T')[0]}.pdf`,
          titulo_reporte: `Reporte Académico Parcial — ${grupo?.nombre}`,
          seccion_detalle_titulo: `3. Desglose de Unidades (${unidadesCerradas.length} cerradas)`,
          headers,
          body,
          onCellParse: (data) => {
            if (data.section === 'body' && data.column.index === headers[0].length - 1) {
              if (data.cell.raw === 'REPROBADO') data.cell.styles.textColor = [220, 38, 38];
              else data.cell.styles.textColor = [22, 163, 74];
            }
          }
        });
      } else {
        // Reporte Final (Estándar)
        generarReporteAcademico(stats, dataToReport, {
          filename: `Reporte_Final_${grupo?.nombre}_${new Date().toISOString().split('T')[0]}.pdf`,
          titulo_reporte: `Reporte Académico Final — ${grupo?.nombre}`
        })
      }

      notify('Reporte generado exitosamente')
    } catch (err) {
      console.error(err);
      notify('Error al generar el reporte', 'error')
    } finally {
      setSaving(false)
    }
  }

  async function preCerrarMateria() {
    if (!window.confirm('¿Deseas pre-cerrar la materia? Esto generará un borrador de resultados finales y permitirá aplicar bonus de materia y overrides.')) return
    setSaving(true)
    try {
      await gruposApi.preCerrar(grupoId)
      notify('Materia en estado PRECIERRE')
      await cargar()
    } catch (err) {
      notify(err?.response?.data?.detail?.mensaje ?? 'Error al pre-cerrar', 'error')
    } finally {
      setSaving(false)
    }
  }

  async function clickFinalizarMateria() {
    if (!window.confirm('¿ESTÁS SEGURO? Esta acción es IRREVERSIBLE. Se sellarán las actas y no se podrán hacer más cambios.')) return
    setSaving(true)
    try {
      await gruposApi.finalizar(grupoId)
      notify('Materia FINALIZADA y SELLADA con éxito')
      await cargar()
    } catch (err) {
      notify(err?.response?.data?.detail?.mensaje ?? 'Error al finalizar', 'error')
    } finally {
      setSaving(false)
    }
  }

  const filtrados = resultados.filter(r =>
    r.alumno?.toLowerCase().includes(search.toLowerCase()) ||
    r.no_control?.toLowerCase().includes(search.toLowerCase())
  )

  const sortedUnidades = [...unidades].sort((a, b) => a.numero - b.numero)
  const firstEdicionIdx = sortedUnidades.findIndex(u => u.estado === 'EDICION')
  const unidadesVisibles = firstEdicionIdx === -1 ? sortedUnidades : sortedUnidades.slice(0, firstEdicionIdx + 1)

  if (loading) return <Spinner />

  return (
    <div>
      <PageHeader
        breadcrumb={['Grupos', 'Resultados']}
        title="Resultados del Grupo"
        subtitle={`${resultados.length} alumnos · ${grupo?.nombre}`}
        actions={
          <div className="flex items-center gap-2">
            <Btn
              onClick={exportarPDF}
              variant="secondary"
              loading={saving}
              size="sm"
            >
              <FileDown size={18} className="mr-2" /> Descargar Reporte
            </Btn>
          </div>
        }
      />

      <div className="p-8 space-y-6">

        {/* Stats */}
        {stats && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <StatCard label="Total alumnos" value={stats.total_alumnos} icon={Users} color="white" />
            <StatCard label="Promedio grupo" value={stats.promedio_grupo ?? '--'} icon={BarChart2} color="white" />
            <StatCard label="Aprobados" value={stats.aprobados ?? '--'} icon={CheckCircle} color="white" />
            <StatCard label="Reprobados" value={stats.reprobados ?? '--'} icon={XCircle} color="white" />
          </div>
        )}

        {/* Buscador */}
        {unidadesVisibles.length > 0 && (
          <div className="relative max-w-xs">
            <Search size={20} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Buscar alumno..."
              className="w-full pl-10 pr-4 py-2 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none"
            />
          </div>
        )}

        {unidadesVisibles.length === 0 ? (
          <EmptyState icon={Clock} title="Resultados no disponibles" description="No hay unidades disponibles en este momento." />
        ) : (
          <div className="space-y-8">
            <div className="space-y-6">
              <h2 className="text-lg font-bold text-gray-900">Resultados por Unidad</h2>
              {unidadesVisibles.map(u => {
                const resultsU = resUnidades.filter(ru => ru.unidad_id === u.id && (
                  ru.alumno?.toLowerCase().includes(search.toLowerCase()) ||
                  ru.no_control?.toLowerCase().includes(search.toLowerCase())
                ))

                return (
                  <Card key={u.id} className="overflow-hidden border-t-4 border-t-primary-500">
                    <div className="bg-white px-5 py-3 border-b border-gray-100 flex items-center justify-between">
                      <h3 className="font-semibold text-gray-800">Unidad {u.numero}: {u.nombre}</h3>
                      <Badge estado={u.estado} />
                    </div>
                    <table className="w-full text-sm">
                      <thead className="bg-gray-50 border-b border-gray-100">
                        <tr>
                          <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Alumno</th>
                          <th className="text-center px-3 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide w-28">Promedio</th>
                          <th className="text-center px-3 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide w-24">Bonus</th>
                          <th className="text-center px-3 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide w-28">Resultado Unidad</th>
                          {isDocente && u.estado === 'EDICION' && <th className="w-16" />}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-50">
                        {resultsU.map(r => (
                          <tr key={r.inscripcion_id} className="hover:bg-gray-50/50 transition-colors">
                            <td className="px-5 py-3">
                              <p className="font-medium text-gray-900">{r.alumno}</p>
                              <p className="text-xs text-gray-400">{r.no_control}</p>
                            </td>
                            <td className="px-3 py-3 text-center">
                              {u.estado === 'EDICION' && (r.actividades_con_resultado === 0 || r.actividades_con_resultado === undefined) ? (
                                <span className="text-xs text-gray-400 font-medium tracking-wider">--</span>
                              ) : (
                                <CalDisplay valor={r.promedio_parcial} size="sm" />
                              )}
                            </td>
                            <td className="px-3 py-3 text-center">
                              {r.bonus_unidad > 0 ? (
                                <div className="flex items-center justify-center gap-1 group/bonus relative">
                                  <span className="text-xs font-semibold text-emerald-500">+{r.bonus_unidad}</span>
                                  {r.justificacion && (
                                    <button
                                      onClick={() => setModalVerBonus({ titulo: 'Razón de Bonus (Unidad)', justificacion: r.justificacion })}
                                      className="cursor-pointer text-emerald-400 hover:text-emerald-600 transition-colors p-1"
                                    >
                                      <Info size={14} />
                                    </button>
                                  )}
                                </div>
                              ) : (
                                <span className="text-xs text-gray-300">—</span>
                              )}
                            </td>
                            <td className="px-3 py-3 text-center">
                              {u.estado === 'EDICION' && (r.actividades_con_resultado === 0 || r.actividades_con_resultado === undefined) ? (
                                <span className="text-sm text-gray-400 font-bold tracking-wider">--</span>
                              ) : (
                                <CalDisplay valor={r.resultado} size="md" />
                              )}
                            </td>
                            {isDocente && u.estado === 'EDICION' && (
                              <td className="px-5 py-3 text-right">
                                <div className="relative group/tooltip inline-block">
                                  <button
                                    onClick={() => {
                                      if (!r.actividades_con_resultado || r.actividades_con_resultado === 0) return;
                                      setModalBonus({ insc: r, tipo: 'unit', unidad_id: u.id, unidad_num: u.numero });
                                      setBonusForm({ monto: r.bonus_unidad || '', justificacion: '', unidad_id: u.id });
                                    }}
                                    className={`p-1.5 rounded-lg transition-all cursor-pointer ${(!r.actividades_con_resultado || r.actividades_con_resultado === 0)
                                      ? 'text-gray-400 opacity-50'
                                      : 'text-slate-400 hover:text-emerald-600 hover:bg-emerald-50'
                                      }`}
                                  >
                                    <Gift size={18} />
                                  </button>

                                  {(!r.actividades_con_resultado || r.actividades_con_resultado === 0) && (
                                    <div className="absolute right-full top-1/2 -translate-y-1/2 mr-3 hidden group-hover/tooltip:block w-56 p-3 bg-slate-900 text-white text-sm rounded-xl shadow-2xl z-50 pointer-events-none animate-fade-in">
                                      <p className="font-bold text-center leading-tight text-white">
                                        Captura Pendiente
                                      </p>
                                      <p className="text-xs text-slate-400 text-center mt-1">
                                        No puedes asignar bonus hasta calificar al menos una actividad.
                                      </p>
                                      {/* Flechita apuntando a la derecha */}
                                      <div className="absolute left-full top-1/2 -translate-y-1/2 border-8 border-transparent border-l-slate-900" />
                                    </div>
                                  )}
                                </div>
                              </td>
                            )}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </Card>
                )
              })}
            </div>

            {(() => {
              const todasCerradas = unidades.length > 0 && unidades.every(u => ['CERRADA', 'PRE_CIERRE'].includes(u.estado))
              const mostrarGlobal = !isDocente || todasCerradas || ['PRECIERRE', 'FINALIZADO'].includes(grupo?.estado)

              if (!mostrarGlobal) {
                return (
                  <div className="mt-8 p-10 bg-slate-50 border border-slate-200 border-dashed rounded-3xl text-center">
                    <p className="text-lg font-bold text-slate-600 mb-1">
                      Resultado Global Pendiente
                    </p>
                    <p className="text-base text-slate-400">
                      El acumulado se mostrará aquí una vez que todas las unidades hayan sido cerradas.
                    </p>
                  </div>
                )
              }

              return (
                <div className="space-y-4 mt-8">
                  <h2 className="text-lg font-bold text-gray-900">Resultado Global (Acumulado)</h2>
                  <Card className="overflow-hidden">
                    <table className="w-full text-sm">
                      <thead className="bg-gray-50 border-b border-gray-100">
                        <tr>
                          <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Alumno</th>
                          <th className="text-center px-3 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide w-28">Base</th>
                          <th className="text-center px-3 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide w-24">Bonus</th>
                          <th className="text-center px-3 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide w-28">Cambio</th>
                          <th className="text-center px-3 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide w-28">Final</th>
                          <th className="text-center px-3 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide w-28">Estatus</th>
                          <th className="text-right px-5 py-3 w-28" />
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-50">
                        {filtrados.map(r => (
                          <tr key={r.inscripcion_id} className="hover:bg-gray-50/50 transition-colors">
                            <td className="px-5 py-3">
                              <p className="font-medium text-gray-900">{r.alumno}</p>
                              <p className="text-xs text-gray-400">{r.no_control}</p>
                            </td>
                            <td className="px-3 py-3 text-center">
                              {r.promedio_base !== null && r.promedio_base !== undefined
                                ? <CalDisplay valor={r.promedio_base} size="sm" />
                                : <span className="inline-flex items-center gap-1 text-xs font-semibold text-amber-500"><Clock size={11} /> Pendiente</span>
                              }
                            </td>
                            <td className="px-3 py-3 text-center">
                              {r.bonus_materia > 0 ? (
                                <div className="flex items-center justify-center gap-1 group/bonus relative">
                                  <span className="text-xs font-semibold text-success-500">+{r.bonus_materia}</span>
                                  {r.justificacion && (
                                    <button
                                      onClick={() => setModalVerBonus({ titulo: 'Razón de Bonus (Materia)', justificacion: r.justificacion })}
                                      className="cursor-pointer text-success-400 hover:text-success-600 transition-colors p-1"
                                    >
                                      <Info size={14} />
                                    </button>
                                  )}
                                </div>
                              ) : (
                                <span className="text-xs text-gray-300">—</span>
                              )}
                            </td>
                            <td className="px-3 py-3 text-center">
                              {r.resultado_override !== null && r.resultado_override !== undefined
                                ? (
                                  <span className="inline-flex items-center gap-1 text-xs font-medium text-warning-500 bg-warning-50 px-2 py-0.5 rounded-full">
                                    <Edit size={10} />
                                    {r.resultado_override}
                                  </span>
                                )
                                : <span className="text-xs text-gray-300">—</span>
                              }
                            </td>
                            <td className="px-3 py-3 text-center">
                              {r.resultado_final !== null && r.resultado_final !== undefined
                                ? <CalDisplay valor={r.resultado_final} size="md" />
                                : <span className="inline-flex items-center gap-1 text-xs font-semibold text-amber-500"><Clock size={11} /> Pendiente</span>
                              }
                            </td>
                            <td className="px-3 py-3 text-center">
                              {r.estatus ? <Badge estado={r.estatus} /> : <span className="text-xs text-gray-400">Pendiente</span>}
                            </td>
                            <td className="px-5 py-3 text-right">
                              <div className="flex items-center justify-end gap-1">
                                <button
                                  onClick={() => verDesglose(r.inscripcion_id)}
                                  className="p-1.5 rounded-lg text-gray-400 hover:text-primary-700 hover:bg-primary-50 transition-all"
                                  title="Ver desglose detallado"
                                >
                                  <Eye size={18} />
                                </button>

                                {/* Botón Bonus Materia — solo Docente si no está FINALIZADO */}
                                {isDocente && grupo?.estado !== 'FINALIZADO' && (
                                  <button
                                    onClick={() => {
                                      setModalBonus({ insc: r });
                                      setBonusForm({ monto: '', justificacion: '', unidad_id: '' });
                                    }}
                                    className="p-1.5 rounded-lg text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 transition-all"
                                    title="Bonus de materia"
                                  >
                                    <Gift size={18} />
                                  </button>
                                )}

                                {/* Override — solo Docente si no está FINALIZADO */}
                                {isDocente && grupo?.estado !== 'FINALIZADO' && (
                                  <button
                                    onClick={() => { setModalOvr(r.inscripcion_id); setOvrForm({ valor: '', justificacion: '' }) }}
                                    className="p-1.5 rounded-lg text-gray-400 hover:text-warning-500 hover:bg-warning-50 transition-all"
                                    title="Override (Ajuste manual del resultado final)"
                                  >
                                    <Edit size={18} />
                                  </button>
                                )}
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </Card>
                </div>
              )
            })()}
          </div>
        )}
      </div>

      <Modal open={!!desglose} onClose={() => setDesglose(null)} title="Desglose de calificaciones" size="xl">
        {desglose && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-semibold text-gray-900">{desglose.alumno}</p>
                <p className="text-xs text-gray-500">{desglose.no_control} · {desglose.materia}</p>
              </div>
              <div className="text-right">
                <p className="text-xs text-gray-500">Resultado final</p>
                <CalDisplay valor={desglose.resultado_materia} size="lg" />
              </div>
            </div>

            <div className="space-y-3">
              {(() => {
                const sortedU = [...(desglose.unidades || [])].sort((a, b) => a.numero - b.numero);
                const firstEditIdx = sortedU.findIndex(u => u.estado === 'EDICION');
                const visU = firstEditIdx === -1 ? sortedU : sortedU.slice(0, firstEditIdx + 1);

                return visU.map(u => (
                  <div key={u.unidad_id} className="bg-gray-50 rounded-xl p-4">
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <span className="w-6 h-6 bg-primary-700 text-white rounded-full flex items-center justify-center text-xs font-bold">
                          {u.numero}
                        </span>
                        <span className="font-medium text-sm text-gray-900">{u.nombre}</span>
                        <Badge estado={u.estado} />
                      </div>
                      <div className="text-right">
                        {u.bonus_unidad > 0 && (
                          <div className="flex items-center justify-end gap-1">
                            <p className="text-xs text-success-500">+{u.bonus_unidad} bonus</p>
                            {u.justificacion && (
                              <Info size={10} className="text-success-300" title={u.justificacion} />
                            )}
                          </div>
                        )}
                        <CalDisplay valor={u.resultado_unidad} size="sm" />
                      </div>
                    </div>

                    {u.desglose_actividades && (
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="text-gray-400 border-b border-gray-200">
                            <th className="text-left pb-1.5 font-medium">Actividad</th>
                            <th className="text-center pb-1.5 font-medium">Peso</th>
                            <th className="text-center pb-1.5 font-medium">Calificación</th>
                            <th className="text-right pb-1.5 font-medium">Contribución</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                          {u.desglose_actividades.map((a, i) => (
                            <tr key={i} className={a.estado_entrega === 'NP' ? 'text-danger-500' : 'text-gray-700'}>
                              <td className="py-1.5">{a.actividad}</td>
                              <td className="py-1.5 text-center">{a.ponderacion}%</td>
                              <td className="py-1.5 text-center font-semibold">
                                {a.estado_entrega === 'NP' ? 'NP' : parseFloat(a.calificacion).toFixed(2)}
                              </td>
                              <td className="py-1.5 text-right font-mono">
                                {parseFloat(a.contribucion).toFixed(2)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </div>
                ))
              })()}
            </div>
          </div>
        )}
      </Modal>

      <Modal open={!!modalBonus} onClose={() => setModalBonus(null)}
        title={modalBonus?.tipo === 'unit' ? `Bonus de Unidad ${modalBonus.unidad_num}` : "Bonus de Materia"}
      >
        {modalBonus && (
          <form onSubmit={aplicarBonus} className="space-y-4">
            <p className="text-sm text-slate-600">
              Alumno: <strong>{modalBonus.insc.alumno}</strong>
            </p>
            <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-3">
              <p className="text-xs text-emerald-700 font-medium">
                {modalBonus.tipo === 'unit'
                  ? `El bonus de unidad se suma al promedio parcial de la unidad ${modalBonus.unidad_num}, con tope máximo de ${grupo?.calificacion_maxima ?? 100}.`
                  : `El bonus de materia se aplica sobre el promedio final del alumno, con tope máximo de ${grupo?.calificacion_maxima ?? 100}.`
                }
              </p>
            </div>

            <Input
              label="Monto del bonus"
              type="number" min="0" step="0.01"
              value={bonusForm.monto}
              onChange={e => setBonusForm(f => ({ ...f, monto: e.target.value }))}
              required
            />
            <Input
              label="Justificación (opcional)"
              value={bonusForm.justificacion}
              onChange={e => setBonusForm(f => ({ ...f, justificacion: e.target.value }))}
              placeholder="Motivo del bonus..."
            />
            <div className="flex gap-2 justify-end">
              <Btn variant="secondary" onClick={() => setModalBonus(null)}>Cancelar</Btn>
              <Btn type="submit" variant="success" loading={saving}>Aplicar bonus</Btn>
            </div>
          </form>
        )}
      </Modal>

      <Modal open={!!modalOverride} onClose={() => setModalOvr(null)} title="Override de Resultado Final">
        <form onSubmit={aplicarOverride} className="space-y-4">
          <div className="bg-warning-50 border border-warning-500/20 rounded-lg p-3">
            <p className="text-xs text-warning-700 font-medium">
              ⚠ Esta acción reemplaza el resultado calculado. Queda registrada en auditoría.
            </p>
          </div>
          <Input
            label="Nuevo resultado (0 – 100)"
            type="number" min="0" max="100" step="1"
            value={ovrForm.valor}
            onChange={e => setOvrForm(f => ({ ...f, valor: e.target.value }))}
            required
          />
          <div className="space-y-1">
            <label className="block text-sm font-medium text-gray-700">
              Justificación <span className="text-gray-400 text-xs">(mín. 20 caracteres)</span>
            </label>
            <textarea
              value={ovrForm.justificacion}
              onChange={e => setOvrForm(f => ({ ...f, justificacion: e.target.value }))}
              rows={3}
              required minLength={20}
              placeholder="Justifica el motivo del ajuste manual..."
              className="block w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none resize-none"
            />
            <p className="text-xs text-gray-400">{ovrForm.justificacion.length}/20 caracteres mínimo</p>
          </div>
          <div className="flex gap-2 justify-end">
            <Btn variant="secondary" onClick={() => setModalOvr(null)}>Cancelar</Btn>
            <Btn type="submit" variant="danger" loading={saving}>Aplicar override</Btn>
          </div>
        </form>
      </Modal>

      {/* Modal Ver Justificación de Bonus */}
      <Modal
        open={!!modalVerBonus}
        onClose={() => setModalVerBonus(null)}
        title={modalVerBonus?.titulo || 'Detalle de Bonus'}
      >
        {modalVerBonus && (
          <div className="space-y-4">
            <div className="bg-emerald-50 rounded-xl p-4 border border-emerald-100 flex gap-3">
              <Gift className="text-emerald-500 mt-0.5 flex-shrink-0" size={20} />
              <div>
                <p className="text-xs font-bold text-emerald-800 uppercase tracking-wide mb-1">Razón otorgada por el docente:</p>
                <p className="text-sm text-emerald-900 leading-relaxed font-medium">
                  {modalVerBonus.justificacion}
                </p>
              </div>
            </div>
          </div>
        )}
      </Modal>

      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
    </div>
  )
}
