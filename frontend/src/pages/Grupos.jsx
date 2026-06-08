import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { grupos as gruposApi, materias as materiasApi, docentes as docentesApi, periodos as periodosApi, importar as importarApi, planes as planesApi, carreras as carrerasApi } from '../api/endpoints'
import { PageHeader } from '../components/layout/Layout'
import { Card, StatCard, Badge, Spinner, EmptyState, Btn, Modal, Input, ErrorMsg, Toast, ConfirmDialog } from '../components/ui'
import {
  BookOpen, Users, CheckCircle, Clock, ChevronRight, BarChart3, Plus, Trash2, UploadCloud, MapPin, User, FileSpreadsheet, Download
} from 'lucide-react'

function GruposAdmin() {
  const [grupos, setGrupos] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [filtro, setFiltro] = useState('TODOS')
  const [filtroCarrera, setFiltroCarrera] = useState('TODAS')
  const [carreras, setCarreras] = useState([])
  const [toast, setToast] = useState(null)
  const navigate = useNavigate()

  // Modal Nuevo Grupo
  const [modal, setModal] = useState(false)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({
    nombre: '', plan_materia_id: '', docente_id: '', periodo_id: '',
    calificacion_maxima: 100, letra_grupo: ''
  })
  const [opts, setOpts] = useState({ materias: [], docentes: [], periodos: [] })

  // Borrado
  const [confirmDel, setConfirmDel] = useState({ open: false, id: null, loading: false })

  // Importacion CSV (Grupos)
  const [modalImport, setModalImport] = useState(false)
  const [importFile, setImportFile] = useState(null)
  const [importPreview, setImportPreview] = useState(null)
  const [importResult, setImportResult] = useState(null)

  // Importacion CSV (Inscripciones)
  const [modalInsc, setModalInsc] = useState(false)
  const [inscFile, setInscFile] = useState(null)
  const [inscPreview, setInscPreview] = useState(null)
  const [inscResult, setInscResult] = useState(null)
  const [inscLoading, setInscLoading] = useState(false)

  const notify = (msg, type = 'success') => { setToast({ message: msg, type }); setTimeout(() => setToast(null), 3500) }

  async function cargar() {
    setLoading(true)
    try {
      const [rG, rC] = await Promise.all([gruposApi.listar(), carrerasApi.listar()])
      setGrupos(rG.data)
      setCarreras(rC.data)
    } catch (err) {
      setError(err?.response?.data?.detail?.mensaje ?? 'Error al cargar datos')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { cargar() }, [])

  async function cargarCatalogos() {
    try {
      const [pm, d, p] = await Promise.all([
        planesApi.listarTodasMaterias(),
        docentesApi.listar(),
        periodosApi.listar()
      ])
      setOpts({
        materias: pm.data, // Estas son academ.plan_materia
        docentes: d.data.filter(x => x.activo),
        periodos: p.data.filter(x => x.estado === 'activo')
      })
    } catch { }
  }

  async function crear(e) {
    e.preventDefault()
    setSaving(true); setError(null)
    const periodo = opts.periodos.find(p => p.id?.toString() === form.periodo_id?.toString())?.codigo ?? ''
    const materia = opts.materias.find(m => m.id?.toString() === form.plan_materia_id?.toString())?.clave ?? ''
    const claveAuto = `${periodo} ${materia}${form.letra_grupo?.toUpperCase() ?? ''}`.trim()


    try {
      await gruposApi.crear({
        nombre: claveAuto || 'GRUPO',
        plan_materia_id: form.plan_materia_id,
        docente_id: form.docente_id,
        periodo_id: form.periodo_id,
        calificacion_maxima: parseFloat(form.calificacion_maxima) || 100,
        letra_grupo: form.letra_grupo.toLocaleUpperCase(),
        semestre: parseInt(form.semestre) || null
      })
      setModal(false)
      setForm({ nombre: '', plan_materia_id: '', docente_id: '', periodo_id: '', calificacion_maxima: 100, letra_grupo: '' })
      await cargar()
      notify('Grupo creado exitosamente')
    } catch (err) {
      // Extraer mensaje descriptivo del error de solapamiento u otro error del backend
      const detail = err?.response?.data?.detail
      if (detail?.mensaje) {
        setError(detail.mensaje)
      } else if (typeof detail === 'string') {
        setError(detail)
      } else {
        setError(err)
      }
    } finally {
      setSaving(false)
    }
  }

  async function eliminarGrupo() {
    const id = confirmDel.id
    setConfirmDel(prev => ({ ...prev, loading: true }))
    try {
      await gruposApi.eliminar(id)
      await cargar()
      notify('Grupo eliminado correctamente')
      setConfirmDel({ open: false, id: null, loading: false })
    } catch (err) {
      const msg = err?.response?.data?.detail?.mensaje ?? 'No se pudo eliminar el grupo'
      notify(msg, 'error')
      setConfirmDel({ open: false, id: null, loading: false })
    }
  }

  async function handlePreviewImport() {
    if (!importFile) return
    setSaving(true); setImportPreview(null); setImportResult(null); setError(null)
    try {
      const res = await importarApi.previewGrupos(importFile)
      setImportPreview(res.data)
    } catch (err) {
      setError(err?.response?.data?.detail?.mensaje ?? err?.response?.data?.detail ?? 'Error al previsualizar')
    } finally {
      setSaving(false)
    }
  }

  async function handleConfirmImport() {
    if (!importFile) return
    setSaving(true); setError(null)
    try {
      const res = await importarApi.confirmarGrupos(importFile)
      setImportResult(res.data)
      await cargar()
      notify('Importación de grupos finalizada')
    } catch (err) {
      setError(err?.response?.data?.detail?.mensaje ?? err?.response?.data?.detail ?? 'Error en la importación')
    } finally {
      setSaving(false)
    }
  }

  async function handlePreviewInsc() {
    if (!inscFile) return
    setInscLoading(true); setInscPreview(null); setInscResult(null); setError(null)
    try {
      const res = await importarApi.previewInscripciones(inscFile)
      setInscPreview(res.data)
    } catch (err) {
      setError(err?.response?.data?.detail?.mensaje ?? err?.response?.data?.detail ?? 'Error al previsualizar')
    } finally {
      setInscLoading(false)
    }
  }

  async function handleConfirmInsc() {
    if (!inscFile) return
    setInscLoading(true); setError(null)
    try {
      const res = await importarApi.confirmarInscripciones(inscFile)
      setInscResult(res.data)
      await cargar()
      notify('Inscripciones procesadas correctamente')
    } catch (err) {
      setError(err?.response?.data?.detail?.mensaje ?? err?.response?.data?.detail ?? 'Error al procesar inscripciones')
    } finally {
      setInscLoading(false)
    }
  }

  const activos = grupos.filter(g => g.estado === 'ACTIVO').length
  const finalizados = grupos.filter(g => g.estado === 'FINALIZADO').length

  if (loading && !grupos.length) return <Spinner />

  return (
    <div>
      <PageHeader
        title="Gestión de Grupos"
        subtitle="Administra los grupos académicos, asigna docentes y materias"
        actions={
          <div className="flex gap-2">
            <Btn size="md" variant="white-gold" onClick={() => { setInscFile(null); setInscResult(null); setError(null); setModalInsc(true) }}>
              <Users size={16} className="mr-1" /> Carga Masiva Alumnos
            </Btn>
            <Btn size="md" variant="white-gold" onClick={() => { setImportFile(null); setImportResult(null); setError(null); setModalImport(true) }}>
              <UploadCloud size={16} className="mr-1" /> Importar Grupos CSV
            </Btn>
            <Btn size="md" variant="white-gold" onClick={() => { setModal(true); cargarCatalogos(); setError(null) }}>
              <Plus size={18} className="mr-1" /> Nuevo grupo
            </Btn>
          </div>
        }
      />
      <div className="p-8 space-y-6">

        {/* Stats globales */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatCard label="Total de grupos" value={grupos.length} icon={BookOpen} color="white" />
          <StatCard label="Grupos activos" value={activos} icon={Clock} color="white" />
          <StatCard label="En precierre" value={grupos.filter(g => g.estado === 'PRECIERRE').length} icon={Clock} color="white" />
          <StatCard label="Grupos finalizados" value={finalizados} icon={CheckCircle} color="white" />
        </div>

        {/* Lista de todos los grupos */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-gray-700">Explorar grupos</h2>
            <div className="flex gap-3 items-center">
              {/* Filtro por Carrera */}
              <select
                className="bg-white border border-slate-200 rounded-[20px] px-6 py-2.5 text-sm font-bold text-slate-700 outline-none focus:ring-brand-500/20 focus:ring-2 focus:border-brand-500 transition-all shadow-sm cursor-pointer appearance-none min-w-[200px]" value={filtroCarrera}
                onChange={e => setFiltroCarrera(e.target.value)}
              >
                <option value="TODAS">Todas las Carreras</option>
                {carreras.map(c => <option key={c.id} value={c.nombre}>{c.nombre}</option>)}
              </select>

              {/* Filtro por Estado */}
              <div className="flex gap-1 bg-slate-200/50 rounded-xl p-1 border border-slate-200">
                {['TODOS', 'ACTIVO', 'PRECIERRE', 'FINALIZADO'].map(f => (
                  <button
                    key={f}
                    onClick={() => setFiltro(f)}
                    className={`px-4 py-1.5 text-[12px] font-bold rounded-lg transition-all ${filtro === f ? 'bg-white shadow-sm text-slate-900' : 'text-slate-500 hover:text-slate-700'
                      }`}
                  >
                    {f}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
        {grupos.length === 0 && !loading
          ? <EmptyState icon={BookOpen} title="Sin grupos" description="Registra el primer grupo para empezar." />
          : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {grupos.filter(g => {
                const matchEstado = filtro === 'TODOS' || g.estado === filtro
                const matchCarrera = filtroCarrera === 'TODAS' ||
                  g.carrera_nombre?.trim().toUpperCase() === filtroCarrera.trim().toUpperCase()
                return matchEstado && matchCarrera
              }).map(g => (
                <GrupoCard
                  key={g.id}
                  grupo={g}
                  onClick={() => navigate(`/grupos/${g.id}`)}
                  onDelete={() => setConfirmDel({ open: true, id: g.id, loading: false })}
                />
              ))}
            </div>
          )
        }
      </div>

      <Modal open={modal} onClose={() => setModal(false)} title="Nuevo grupo"
        footer={<div className="flex gap-2 justify-end"><Btn variant="secondary" onClick={() => setModal(false)}>Cancelar</Btn><Btn form="fg" type="submit" loading={saving}>Crear</Btn></div>}
      >
        <form id="fg" onSubmit={crear} className="space-y-4">
          {/* Error con formato especial para solapamientos (multi-línea) */}
          {error && (
            typeof error === 'string' && error.includes('\n') ? (
              <div className="rounded-xl bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
                {error.split('\n').map((line, i) => (
                  <p key={i} className={i === 0 ? 'font-bold mb-1' : 'text-xs mt-0.5'}>{line}</p>
                ))}
              </div>
            ) : (
              <ErrorMsg error={error} />
            )
          )}

          <div className="grid grid-cols-2 gap-3">
            <Input
              label="Nombre del Grupo"
              value={
                (opts.periodos.find(p => p.id?.toString() === form.periodo_id?.toString())?.codigo ?? '') +
                ' ' +
                (opts.materias.find(m => m.id?.toString() === form.plan_materia_id?.toString())?.clave ?? '') +
                (form.letra_grupo?.toUpperCase() ?? '')
              }
              disabled
              placeholder="Se generará automáticamente"
            />
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5">Periodo Académico <span className="text-red-500">*</span></label>
              <select className="w-full form-input text-sm" value={form.periodo_id} onChange={e => setForm(f => ({ ...f, periodo_id: e.target.value }))} required>
                <option value="">Seleccione...</option>
                {opts.periodos.map(p => <option key={p.id} value={p.id}>{p.nombre} ({p.codigo})</option>)}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5">Materia (Plan) <span className="text-red-500">*</span></label>
              <select className="w-full form-input text-sm" value={form.plan_materia_id} onChange={e => setForm(f => ({ ...f, plan_materia_id: e.target.value }))} required>
                <option value="">Seleccione...</option>
                {opts.materias.map(m => (
                  <option key={m.id} value={m.id}>
                    {m.materia_nombre} ({m.clave}) - {m.plan_nombre} ({m.carrera_nombre})
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5">Docente <span className="text-red-500">*</span></label>
              <select className="w-full form-input text-sm" value={form.docente_id} onChange={e => setForm(f => ({ ...f, docente_id: e.target.value }))} required>
                <option value="">Seleccione...</option>
                {opts.docentes.map(d => <option key={d.id} value={d.id}>{d.nombre} {d.apellido_pat}{d.apellido_mat ? ` ${d.apellido_mat}` : ''}</option>)}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Input label="Letra grupo *" value={form.letra_grupo} onChange={e => setForm(f => ({ ...f, letra_grupo: e.target.value }))} required placeholder="A, B, C…" maxLength={5} />
          </div>


        </form>
      </Modal>

      <Modal size={importPreview || importResult ? '2xl' : 'lg'} open={modalImport} onClose={() => { setModalImport(false); setImportFile(null); setImportPreview(null); setImportResult(null); setError(null); }} title="Importación masiva de grupos"
        footer={
          <div className="flex gap-2 justify-end">
            <Btn variant="secondary" onClick={() => { setModalImport(false); setImportFile(null); setImportPreview(null); setImportResult(null); setError(null); }}>Cerrar</Btn>
            {!importPreview && !importResult && (
              <Btn onClick={handlePreviewImport} loading={saving} disabled={!importFile}>Previsualizar</Btn>
            )}
            {importPreview && (
              <Btn
                onClick={handleConfirmImport}
                loading={saving}
                disabled={!importPreview.some(r => !r.error && !r.ya_existe)}
              >
                Confirmar Importación ({importPreview.filter(r => !r.error && !r.ya_existe).length})
              </Btn>
            )}
          </div>
        }
      >
        <div className="space-y-4">
          {error && <ErrorMsg error={typeof error === 'string' ? error : JSON.stringify(error)} />}

          {!importPreview && !importResult && (
            <>
              <div className="bg-brand-50 p-4 rounded-2xl border border-brand-100 flex items-start gap-3">
                <FileSpreadsheet className="text-brand-600 mt-1 flex-shrink-0" size={20} />
                <div className="text-sm text-brand-900 leading-relaxed">
                  <p className="font-black uppercase tracking-wider mb-1">Formato del archivo CSV</p>
                  <ul className="list-disc list-inside mt-1 font-mono text-xs opacity-80 space-y-0.5">
                    <li><span className="font-bold">materia</span>, <span className="font-bold">docente</span>, <span className="font-bold">periodo</span>, <span className="font-bold">letra</span></li>

                  </ul>
                  <p className="mt-2 text-[10px] opacity-70">El nombre del grupo se genera automáticamente (ej: EJ26 1J1A). Si la materia es multi-carrera, agrega <span className="font-mono">carrera</span>.</p>
                </div>
              </div>

              <div className="p-8 border-2 border-dashed border-slate-200 rounded-3xl text-center hover:border-brand-400 transition-colors bg-slate-50/50">
                <input type="file" accept=".csv" required onChange={e => { setImportFile(e.target.files[0]); setImportPreview(null); setImportResult(null); }} className="hidden" id="csv-grupos" />
                <label htmlFor="csv-grupos" className="cursor-pointer block">
                  <UploadCloud className="mx-auto text-slate-400 mb-2" size={32} />
                  <p className="text-sm font-bold text-slate-700">{importFile ? importFile.name : 'Seleccionar archivo CSV'}</p>
                  <p className="text-xs text-slate-400 mt-1">Haz clic para buscar en tu equipo</p>
                </label>
              </div>
            </>
          )}

          {importPreview && (
            <div className="border border-slate-100 rounded-2xl overflow-hidden">
              <div className="overflow-auto max-h-80">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 text-slate-500 text-xs uppercase tracking-wider">
                    <tr>
                      <th className="px-3 py-2 text-left">#</th>
                      <th className="px-3 py-2 text-left">Nombre Grupo</th>
                      <th className="px-3 py-2 text-left">Materia</th>
                      <th className="px-3 py-2 text-left">Docente</th>
                      <th className="px-3 py-2 text-left">Periodo</th>
                      <th className="px-3 py-2 text-center">Estado</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {importPreview.map((r, idx) => (
                      <tr key={idx} className={r.error ? 'bg-rose-50/40' : r.ya_existe ? 'bg-amber-50/40' : 'bg-white'}>
                        <td className="px-3 py-2 text-xs font-mono text-slate-400">{r.fila}</td>
                        <td className="px-3 py-2 font-mono text-xs font-bold text-brand-600">{r.nombre}</td>
                        <td className="px-3 py-2 text-xs font-semibold text-slate-700">{r.materia}</td>
                        <td className="px-3 py-2 text-xs font-mono text-slate-600">{r.docente}</td>
                        <td className="px-3 py-2 text-xs text-slate-500">{r.periodo}</td>
                        <td className="px-3 py-2 text-center">
                          {r.error ? (
                            <div className="flex flex-col items-center gap-1">
                              <Badge estado="ERROR" className="!bg-rose-50 !text-rose-600 border-none text-[10px]" />
                            </div>
                          ) : r.ya_existe ? (
                            <Badge estado="OMITIR" className="!bg-amber-50 !text-amber-600 border-none text-[10px]" />
                          ) : (
                            <Badge estado="LISTO" className="!bg-emerald-50 !text-emerald-600 border-none text-[10px]" />
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {importPreview.some(r => r.error) && (
                <div className="border-t border-slate-100 bg-rose-50/30 p-3 max-h-28 overflow-auto">
                  <p className="text-[12px] font-bold text-slate-700 uppercase mb-1">Detalle de errores</p>
                  {importPreview.filter(r => r.error).map((r, idx) => (
                    <p key={idx} className="text-[13px] font-mono text-rose-600">Fila {r.fila}: {r.error}</p>
                  ))}
                </div>
              )}
            </div>
          )}

          {importResult && (
            <div className="bg-emerald-50 border border-emerald-200 p-5 rounded-2xl space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-black text-emerald-800 uppercase tracking-widest">Proceso Completado</p>
                  <p className="text-xs text-emerald-600 font-medium">{importResult.insertados} grupos creados correctamente</p>
                </div>
              </div>
              <div className="flex gap-4 text-sm">
                <span className="font-bold text-emerald-700">✓ Creados: {importResult.insertados}</span>
                <span className="text-amber-600">↷ Existentes: {importResult.omitidos}</span>
                <span className="text-rose-600">✕ Errores: {importResult.errores?.length || 0}</span>
              </div>
              {importResult.errores?.length > 0 && (
                <div className="bg-white/50 p-3 rounded-xl max-h-28 overflow-auto border border-emerald-100">
                  <p className="text-[9px] font-bold text-slate-400 uppercase mb-1">Filas con error</p>
                  {importResult.errores.map((e, idx) => (
                    <p key={idx} className="text-[10px] font-mono text-rose-600">Fila {e.fila}: {e.error}</p>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </Modal>

      <Modal
        size={inscPreview || inscResult ? '2xl' : 'lg'}
        open={modalInsc}
        onClose={() => { setModalInsc(false); setInscFile(null); setInscPreview(null); setInscResult(null); setError(null) }}
        title="Carga masiva de Inscripciones"
        subtitle="Inscribe alumnos a distintos grupos en un solo archivo"
        footer={
          <div className="flex gap-2 justify-end">
            <Btn variant="secondary" onClick={() => { setModalInsc(false); setInscFile(null); setInscPreview(null); setInscResult(null); setError(null) }}>Cerrar</Btn>
            {!inscPreview && !inscResult && (
              <Btn onClick={handlePreviewInsc} loading={inscLoading} disabled={!inscFile}>Previsualizar</Btn>
            )}
            {inscPreview && (
              <Btn
                onClick={handleConfirmInsc}
                loading={inscLoading}
                disabled={!inscPreview.some(r => !r.error && !r.ya_inscrito)}
              >
                Confirmar Inscripciones ({inscPreview.filter(r => !r.error && !r.ya_inscrito).length})
              </Btn>
            )}
          </div>
        }
      >
        <div className="space-y-4">
          {error && <ErrorMsg error={typeof error === 'string' ? error : JSON.stringify(error)} />}

          {!inscPreview && !inscResult && (
            <>
              <div className="bg-brand-50 p-4 rounded-2xl border border-brand-100 flex items-start gap-3">
                <FileSpreadsheet className="text-brand-600 mt-1 flex-shrink-0" size={20} />
                <div className="text-sm text-brand-900 leading-relaxed">
                  <p className="font-black uppercase tracking-wider mb-1">Formato del archivo CSV</p>
                  <ul className="list-disc list-inside mt-1 font-mono text-xs opacity-80 space-y-0.5">
                    <li><span className="font-bold">numero_control</span> — No. de control del alumno</li>
                    <li><span className="font-bold">nombre</span> (o <span className="font-bold">grupo</span>) — Nombre exacto del grupo (ej: EJ26 1J1A)</li>
                  </ul>
                  <p className="mt-2 text-[10px] opacity-70">Puedes mezclar alumnos y grupos distintos. Si la materia es multi-carrera, agrega la columna <span className="font-mono">carrera</span> (ej. ISC).</p>
                </div>
              </div>

              <div className="p-8 border-2 border-dashed border-slate-200 rounded-3xl text-center hover:border-brand-400 transition-colors bg-slate-50/50">
                <input type="file" accept=".csv" onChange={e => { setInscFile(e.target.files[0]); setInscPreview(null) }} className="hidden" id="csv-inscripciones" />
                <label htmlFor="csv-inscripciones" className="cursor-pointer block">
                  <UploadCloud className="mx-auto text-slate-400 mb-2" size={32} />
                  <p className="text-sm font-bold text-slate-700">{inscFile ? inscFile.name : 'Seleccionar archivo CSV'}</p>
                  <p className="text-xs text-slate-400 mt-1">Haz clic para buscar en tu equipo</p>
                </label>
              </div>
            </>
          )}

          {inscPreview && (
            <div className="border border-slate-100 rounded-2xl overflow-hidden">
              <div className="overflow-auto max-h-80">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 text-slate-500 text-xs uppercase tracking-wider">
                    <tr>
                      <th className="px-3 py-2 text-left">#</th>
                      <th className="px-3 py-2 text-left">No. Control</th>
                      <th className="px-3 py-2 text-left">Alumno</th>
                      <th className="px-3 py-2 text-left">Grupo</th>
                      <th className="px-3 py-2 text-left">Carrera</th>
                      <th className="px-3 py-2 text-center">Estado</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {inscPreview.map((r, idx) => (
                      <tr key={idx} className={r.error ? 'bg-rose-50/40' : r.ya_inscrito ? 'bg-amber-50/40' : 'bg-white'}>
                        <td className="px-3 py-2 text-xs font-mono text-slate-400">{r.fila}</td>
                        <td className="px-3 py-2 font-mono text-xs font-bold text-brand-600">{r.matricula}</td>
                        <td className="px-3 py-2 text-xs font-semibold text-slate-700">{r.alumno_nombre || <span className="text-rose-400 italic">No encontrado</span>}</td>
                        <td className="px-3 py-2 text-xs font-mono text-slate-600">{r.grupo}</td>
                        <td className="px-3 py-2 text-xs text-slate-500">{r.carrera || '—'}</td>
                        {/* Sustituye el <td> de Estado por este: */}
                        <td className="px-3 py-2 text-center">
                          {r.error ? (
                            <div className="flex flex-col items-center gap-1">
                              <Badge
                                estado="ERROR"
                                className="!bg-rose-50 !text-rose-600 border-none text-[10px]"
                              />
                            </div>
                          ) : r.ya_inscrito ? (
                            <Badge
                              estado="OMITIR"
                              className="!bg-amber-50 !text-amber-600 border-none text-[10px]"
                            />
                          ) : (
                            <Badge
                              estado="LISTO"
                              className="!bg-emerald-50 !text-emerald-600 border-none text-[10px]"
                            />
                          )}
                        </td>

                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {/* Leyenda de errores */}
              {inscPreview.some(r => r.error) && (
                <div className="border-t border-slate-100 bg-rose-50/30 p-3 max-h-28 overflow-auto">
                  <p className="text-[12px] font-bold text-slate-700 uppercase mb-1">Detalle de errores</p>
                  {inscPreview.filter(r => r.error).map((r, idx) => (
                    <p key={idx} className="text-[13px] font-mono text-rose-600">Fila {r.fila}: {r.error}</p>
                  ))}
                </div>
              )}
            </div>
          )}

          {inscResult && (
            <div className="bg-emerald-50 border border-emerald-200 p-5 rounded-2xl space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-black text-emerald-800 uppercase tracking-widest">Proceso Completado</p>
                  <p className="text-xs text-emerald-600 font-medium">{inscResult.insertados} inscripciones registradas correctamente</p>
                </div>
              </div>
              <div className="flex gap-4 text-sm">
                <span className="font-bold text-emerald-700">✓ Insertados: {inscResult.insertados}</span>
                <span className="text-amber-600">↷ Omitidos: {inscResult.omitidos}</span>
                <span className="text-rose-600">✕ Errores: {inscResult.errores?.length || 0}</span>
              </div>
              {inscResult.errores?.length > 0 && (
                <div className="bg-white/50 p-3 rounded-xl max-h-28 overflow-auto border border-emerald-100">
                  <p className="text-[9px] font-bold text-slate-400 uppercase mb-1">Filas con error</p>
                  {inscResult.errores.map((e, idx) => (
                    <p key={idx} className="text-[10px] font-mono text-rose-600">Fila {e.fila}: {e.error}</p>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </Modal>

      <ConfirmDialog
        open={confirmDel.open}
        onClose={() => setConfirmDel({ open: false, id: null, loading: false })}
        onConfirm={eliminarGrupo}
        loading={confirmDel.loading}
        title="Eliminar Grupo"
        message="¿Estás seguro de que deseas eliminar este grupo? Esta acción no se puede deshacer y borrará todas las unidades vacías asociadas."
        confirmText="Eliminar permanentemente"
      />

      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
    </div>
  )
}

function GruposDocente() {
  const [grupos, setGrupos] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [filtro, setFiltro] = useState('TODOS')
  const [filtroCarrera, setFiltroCarrera] = useState('TODAS')
  const [carreras, setCarreras] = useState([])
  const navigate = useNavigate()
  const [periodos, setPeriodos] = useState([])
  const [selectedPeriodo, setSelectedPeriodo] = useState('ALL')

  useEffect(() => {
    Promise.all([
      gruposApi.listar(),
      periodosApi.listar(),
      carrerasApi.listar()
    ]).then(([resGrupos, resPeriodos, resCarreras]) => {
      setGrupos(resGrupos.data)
      setPeriodos(resPeriodos.data)
      setCarreras(resCarreras.data)
      // Seleccionar el periodo activo por defecto si existe
      const activo = resPeriodos.data.find(p => p.estado === 'activo')
      if (activo) {
        setSelectedPeriodo(activo.id.toString())
      }
    }).catch(err => setError(err?.response?.data?.detail?.mensaje ?? 'Error al cargar grupos'))
      .finally(() => setLoading(false))
  }, [])

  const gruposFiltrados = (selectedPeriodo === 'ALL'
    ? grupos
    : grupos.filter(g => g.periodo_id?.toString() === selectedPeriodo)
  ).filter(g => {
    const matchEstado = filtro === 'TODOS' || g.estado === filtro
    // Si la materia es multi-carrera, dejar que aparezca si se elige cualquiera de sus carreras
    const matchCarrera = filtroCarrera === 'TODAS' || 
      (g.carreras_ids && g.carreras_ids.includes(parseInt(filtroCarrera))) ||
      g.carrera_id?.toString() === filtroCarrera
    return matchEstado && matchCarrera
  })

  const activos = gruposFiltrados.filter(g => g.estado === 'ACTIVO').length
  const finalizados = gruposFiltrados.filter(g => g.estado === 'FINALIZADO').length

  if (loading) return <Spinner />
  if (error) return <div className="p-8"><div className="rounded-xl bg-red-50 border border-red-200 px-5 py-4 text-sm text-red-700 font-medium">{error}</div></div>

  return (
    <div>
      <PageHeader
        title="Mis Grupos"
        subtitle="Grupos académicos asignados a ti"
        actions={
          <div className="flex bg-white rounded-xl p-1 border border-slate-200 shadow-sm">
            <select
              className="text-xs font-bold bg-transparent border-none focus:ring-0 text-slate-700 py-1.5 pl-3 pr-8 cursor-pointer"
              value={selectedPeriodo}
              onChange={(e) => setSelectedPeriodo(e.target.value)}
            >
              <option value="ALL">Todos los periodos</option>
              {periodos.map(p => (
                <option key={p.id} value={p.id}>{p.nombre} {p.estado === 'activo' ? '— Actual' : ''}</option>
              ))}
            </select>
          </div>
        }
      />
      <div className="p-8 space-y-6">
        {/* Stats del Docente */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatCard label="Total de grupos" value={gruposFiltrados.length} icon={BookOpen} color="white" />
          <StatCard label="Grupos activos" value={activos} icon={Clock} color="white" />
          <StatCard label="En precierre" value={gruposFiltrados.filter(g => g.estado === 'PRECIERRE').length} icon={Clock} color="white" />
          <StatCard label="Grupos finalizados" value={finalizados} icon={CheckCircle} color="white" />
        </div>

        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-3">
          <h2 className="text-sm font-semibold text-gray-700">Tus grupos asignados</h2>
          <div className="flex flex-wrap gap-3 items-center">
            {/* Filtro por Carrera */}
            <select
              className="bg-white border border-slate-200 rounded-[20px] px-6 py-2.5 text-sm font-bold text-slate-700 outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 transition-all shadow-sm cursor-pointer appearance-none min-w-[200px]" 
              value={filtroCarrera}
              onChange={e => setFiltroCarrera(e.target.value)}
            >
              <option value="TODAS">Todas las Carreras</option>
              {carreras.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
            </select>

            {/* Filtro por Estado */}
            <div className="flex gap-1 bg-slate-200/50 rounded-xl p-1 border border-slate-200">
              {['TODOS', 'ACTIVO', 'PRECIERRE', 'FINALIZADO'].map(f => (
                <button
                  key={f}
                  onClick={() => setFiltro(f)}
                  className={`px-4 py-1.5 text-[10px] font-bold rounded-lg transition-all ${filtro === f ? 'bg-white shadow-sm text-slate-900' : 'text-slate-500 hover:text-slate-700'
                    }`}
                >
                  {f}
                </button>
              ))}
            </div>
          </div>
        </div>

        {gruposFiltrados.length === 0
          ? <EmptyState icon={BookOpen} title="Sin grupos asignados" description="No se encontraron grupos con los filtros seleccionados." />
          : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {gruposFiltrados.map(g => (
                <GrupoCard key={g.id} grupo={g} onClick={() => navigate(`/grupos/${g.id}`)} />
              ))}
            </div>
          )
        }
      </div>
    </div>
  )
}

function GrupoCard({ grupo, onClick, onDelete }) {
  const isMultiCarrera = grupo.carreras_ids && grupo.carreras_ids.length > 1;

  return (
    <Card className="p-5 hover:border-primary-200 transition-colors group relative overflow-hidden">
      <div className="cursor-pointer h-full flex flex-col" onClick={onClick}>
        <div className="flex items-start justify-between mb-4">
          <div className="p-2.5 bg-primary-50 rounded-xl">
            <BookOpen size={20} className="text-primary-700" />
          </div>
          <div className="flex gap-2">
            <Badge estado={grupo.estado} />
            {onDelete && (
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); onDelete(); }}
                className="p-1.5 rounded bg-slate-50 text-slate-400 hover:text-red-500 hover:bg-red-50 transition-all opacity-0 group-hover:opacity-100 shadow-sm border border-slate-100 z-10"
                title="Eliminar grupo"
              >
                <Trash2 size={18} />
              </button>
            )}
          </div>
        </div>

        <h3 className="font-bold text-slate-900 text-[18px] leading-tight mb-1">{grupo.materia || 'Materia'}</h3>
        <p className="text-[13px] text-brand-600 font-bold uppercase tracking-wider mb-1">{grupo.carrera_nombre}</p>
        <div className="flex items-center justify-between mb-4">
          <p className="text-[16px] text-slate-600 uppercase tracking-widest">Grupo: <span className="font-bold text-slate-500">{grupo.nombre}</span></p>
        </div>

        <div className="space-y-2.5 mb-6">
          {grupo.docente_nombre && (
            <div className="flex items-center gap-2.5 text-[13px] text-slate-600">
              <div className="p-1 bg-slate-50 rounded-md">
                <User size={22} className="text-slate-400" />
              </div>
              <span className="font-semibold text-slate-600 truncate">{grupo.docente_nombre}</span>
            </div>
          )}
        </div>

        <div className="mt-auto pt-4 border-t border-slate-50 flex items-center justify-between group/btn">
          <span className="text-[11px] font-bold text-slate-800/50 uppercase tracking-[0.15em] transition-colors group-hover/btn:text-slate-600">Ver Detalles</span>
          <div className="p-1 bg-primary-50 rounded-full transition-transform group-hover/btn:translate-x-1">
            <ChevronRight size={16} className="text-primary-600" />
          </div>
        </div>
      </div>
    </Card>
  )
}

function GruposAlumno() {
  const [grupos, setGrupos] = useState([])
  const [periodos, setPeriodos] = useState([])
  const [selectedPeriodo, setSelectedPeriodo] = useState('ALL')
  const [loading, setLoading] = useState(true)
  const navigate = useNavigate()

  useEffect(() => {
    Promise.all([
      gruposApi.listar(),
      periodosApi.listar()
    ]).then(([resG, resP]) => {
      setGrupos(resG.data)
      setPeriodos(resP.data)
      const activo = resP.data.find(p => p.estado === 'activo')
      if (activo) setSelectedPeriodo(activo.id.toString())
    }).finally(() => setLoading(false))
  }, [])

  const gruposFiltrados = selectedPeriodo === 'ALL'
    ? grupos
    : grupos.filter(g => g.periodo_id?.toString() === selectedPeriodo)

  if (loading) return <Spinner />

  return (
    <div>
      <PageHeader 
        title="Mis Materias" 
        subtitle="Listado de grupos y resultados" 
        actions={
          <div className="flex bg-white rounded-xl p-1 border border-slate-200 shadow-sm">
            <select
              className="text-xs font-bold bg-transparent border-none focus:ring-0 text-slate-700 py-1.5 pl-3 pr-8 cursor-pointer"
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
      <div className="p-8 space-y-4">
        {gruposFiltrados.length === 0
          ? <EmptyState icon={BookOpen} title="Sin materias inscritas" description="No se encontraron materias en el periodo seleccionado." />
          : (
            <div className="grid grid-cols-1 gap-3">
              {gruposFiltrados.map(g => (
                <Card key={g.id} onClick={() => navigate(`/mis-calificaciones?grupo=${g.id}`)} className="p-5 cursor-pointer hover:border-primary-200 transition-all group relative overflow-hidden">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div className="flex items-center gap-4">
                      <div className="hidden sm:flex p-2.5 bg-primary-50 rounded-xl">
                        <BookOpen size={20} className="text-primary-700" />
                      </div>
                      <div>
                        <h3 className="font-bold text-slate-900 text-[15px] leading-tight mb-0.5">{g.materia || 'Materia'}</h3>
                        <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider mb-2">{g.nombre} {g.docente_nombre ? `· ${g.docente_nombre}` : ''}</p>
                        <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
                          <span className="text-xs text-slate-400 font-medium uppercase tracking-wider">Escala: 0 – {g.calificacion_maxima}</span>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center justify-between sm:justify-end gap-4 border-t sm:border-t-0 pt-3 sm:pt-0">
                      <Badge estado={g.estado} />
                      <div className="p-1.5 bg-slate-50 rounded-full transition-transform group-hover:translate-x-1">
                        <ChevronRight size={18} className="text-slate-400" />
                      </div>
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          )
        }
      </div>
    </div>
  )
}

export default function Grupos() {
  const { isAdmin, isAlumno, isDocente } = useAuth()
  if (isAdmin) return <GruposAdmin />
  if (isAlumno) return <GruposAlumno />
  if (isDocente) return <GruposDocente />
}
