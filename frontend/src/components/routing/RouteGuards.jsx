import { Navigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import Layout from '../layout/Layout'
import { Spinner } from '../ui'


export function PrivateRoute({ children, roles }) {
  const { user, loading, isAdmin, isDocente, isAlumno } = useAuth()

  if (loading) return <Spinner />
  if (!user) return <Navigate to="/login" replace />

  if (roles) {
    const hasAllowedRole = (
      (roles.includes('ADMIN') && isAdmin)
      || (roles.includes('DOCENTE') && isDocente)
      || (roles.includes('ALUMNO') && isAlumno)
    )

    if (!hasAllowedRole) return <Navigate to="/" replace />
  }

  return <Layout>{children}</Layout>
}

export function PublicRoute({ children }) {
  const { user, loading } = useAuth()

  if (loading) return <Spinner />
  if (user) return <Navigate to="/" replace />

  return children
}
