import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './context/AuthContext'
import Layout from './components/layout/Layout'
import { Spinner, EmptyState } from './components/ui'
import { FileText, Map, UserCog, Settings, Bell } from 'lucide-react'

import Login           from './pages/Login'
import Dashboard       from './pages/Dashboard'
import Alumnos         from './pages/Alumnos'
import Catalogos       from './pages/Catalogos'
import GrupoDetalle    from './pages/GrupoDetalle'
import MisCalificaciones from './pages/MisCalificaciones'
import Calificaciones  from './pages/Calificaciones'
import Resultados      from './pages/Resultados'
import ReportesAcademicos from './pages/ReportesAcademicos'
import MisGrupos       from './pages/MisGrupos'
import MisGrupoDetalle from './pages/MisGrupoDetalle'



import Periodos        from './pages/Periodos'
import Grupos          from './pages/Grupos'
import Auditoria       from './pages/Auditoria'


import TiposActividad  from './pages/TiposActividad'
import DocentesAdmin   from './pages/DocentesAdmin'
import UsuariosAdmin   from './pages/UsuariosAdmin'


import Perfil          from './pages/Perfil'
import Carreras        from './pages/Carreras'

// Stubs for new Admin routes
const AdminStub = ({title, icon}) => (
  <div className="p-8"><EmptyState icon={icon} title={title} description="Este un módulo en desarrollo. Estará disponible en futuras versiones y su UI es stub" /></div>
)

function PrivateRoute({ children, roles }) {
  const { user, loading, isAdmin, isDocente, isAlumno } = useAuth()
  if (loading) return <Spinner/>
  if (!user)   return <Navigate to="/login" replace/>
  if (roles) {
    const ok = roles.includes('ADMIN') && isAdmin
            || roles.includes('DOCENTE') && isDocente
            || roles.includes('ALUMNO') && isAlumno
    if (!ok) return <Navigate to="/" replace/>
  }
  return <Layout>{children}</Layout>
}

function PublicRoute({ children }) {
  const { user, loading } = useAuth()
  if (loading) return <Spinner/>
  if (user)    return <Navigate to="/" replace/>
  return children
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
          <Route path="/login" element={<PublicRoute><Login/></PublicRoute>}/>

          <Route path="/" element={<PrivateRoute><Dashboard/></PrivateRoute>}/>
          <Route path="/grupos" element={<PrivateRoute><Grupos/></PrivateRoute>}/>

          <Route path="/grupos/:id" element={
            <PrivateRoute><GrupoDetalle/></PrivateRoute>
          }/>
          <Route path="/grupos/:grupoId/calificaciones/:unidadId" element={
            <PrivateRoute roles={['DOCENTE','ADMIN']}><Calificaciones/></PrivateRoute>
          }/>
          <Route path="/grupos/:grupoId/resultados" element={
            <PrivateRoute><Resultados/></PrivateRoute>
          }/>


          <Route path="/alumnos" element={
            <PrivateRoute roles={['ADMIN']}><Alumnos/></PrivateRoute>
          }/>
          <Route path="/catalogos" element={
            <PrivateRoute roles={['ADMIN']}><Catalogos/></PrivateRoute>
          }/>
          <Route path="/carreras" element={
            <PrivateRoute roles={['ADMIN']}><Carreras/></PrivateRoute>
          }/>

          <Route path="/periodos" element={
            <PrivateRoute roles={['ADMIN', 'DOCENTE']}><Periodos/></PrivateRoute>
          }/>

          <Route path="/mis-calificaciones" element={
            <PrivateRoute roles={['ALUMNO']}><MisCalificaciones/></PrivateRoute>
          }/>

          <Route path="/mis-grupos" element={
            <PrivateRoute roles={['ALUMNO']}><MisGrupos/></PrivateRoute>
          }/>

          <Route path="/mis-grupos/:inscripcionId" element={
            <PrivateRoute roles={['ALUMNO']}><MisGrupoDetalle/></PrivateRoute>
          }/>

          <Route path="/auditoria" element={
            <PrivateRoute roles={['ADMIN']}><Auditoria/></PrivateRoute>
          }/>

          {/* Nuevas rutas de la Fase 3, 4 y 5 */}
          <Route path="/docentes-admin" element={<PrivateRoute roles={['ADMIN']}><DocentesAdmin/></PrivateRoute>}/>
          <Route path="/tipos-actividad" element={<PrivateRoute roles={['ADMIN']}><TiposActividad/></PrivateRoute>}/>

          

          <Route path="/perfil" element={<PrivateRoute roles={['DOCENTE', 'ALUMNO']}><Perfil/></PrivateRoute>}/>


          {/* Stubs admin */}
          <Route path="/reportes-academicos" element={
            <PrivateRoute roles={['ADMIN']}><ReportesAcademicos /></PrivateRoute>
          }/>

          <Route path="/gestion-usuarios" element={
            <PrivateRoute roles={['ADMIN']}><UsuariosAdmin/></PrivateRoute>
          }/>
          <Route path="/configuracion-sistema" element={
            <PrivateRoute roles={['ADMIN']}><AdminStub title="Configuración del Sistema" icon={Settings} /></PrivateRoute>
          }/>
          <Route path="/comunicados" element={
            <PrivateRoute roles={['ADMIN']}><AdminStub title="Comunicados Institucionales" icon={Bell} /></PrivateRoute>
          }/>

          <Route path="*" element={<Navigate to="/" replace/>}/>
        </Routes>
    </BrowserRouter>
  )
}
