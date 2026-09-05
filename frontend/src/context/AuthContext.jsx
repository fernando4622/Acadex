import { createContext, useContext, useState, useEffect, useCallback } from 'react'
import { auth as authApi } from '../api/endpoints'

const AuthContext = createContext(null)

function isTokenExpired(token) {
  try {
    const encodedPayload = token.split('.')[1]
    const normalizedPayload = encodedPayload
      .replace(/-/g, '+')
      .replace(/_/g, '/')
      .padEnd(Math.ceil(encodedPayload.length / 4) * 4, '=')
    const payload = JSON.parse(atob(normalizedPayload))

    return typeof payload.exp !== 'number' || payload.exp * 1000 <= Date.now()
  } catch {
    return true
  }
}

function clearStoredSession() {
  localStorage.removeItem('token')
  localStorage.removeItem('user')
}

export function AuthProvider({ children }) {
  const [user, setUser]       = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const token  = localStorage.getItem('token')
    const stored = localStorage.getItem('user')

    if (token && stored && !isTokenExpired(token)) {
      try {
        const storedUser = JSON.parse(stored)
        if (storedUser.token !== token || !Array.isArray(storedUser.roles)) {
          clearStoredSession()
        } else {
          setUser(storedUser)
        }
      } catch {
        clearStoredSession()
      }
    } else {
      clearStoredSession()
    }

    setLoading(false)
  }, [])

  async function login(username, password) {
    const { data } = await authApi.login({ username, password })
    const userData = {
      token:      data.access_token,
      roles:      data.roles,
      nombre:     data.nombre,
      id_entidad: data.id_entidad,
    }
    localStorage.setItem('token', data.access_token)
    localStorage.setItem('user',  JSON.stringify(userData))
    setUser(userData)
    return userData
  }

  const logout = useCallback(() => {
    clearStoredSession()
    setUser(null)
  }, [])

  const hasRole    = (...roles) => roles.some(r => user?.roles?.includes(r))
  const isAdmin    = hasRole('ADMIN')
  const isDocente  = hasRole('DOCENTE')
  const isAlumno   = hasRole('ALUMNO')
  const rolPrincipal = isAdmin ? 'ADMIN' : isDocente ? 'DOCENTE' : 'ALUMNO'

  return (
    <AuthContext.Provider value={{
      user, loading, login, logout,
      isAdmin, isDocente, isAlumno, hasRole, rolPrincipal,
    }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth debe usarse dentro de AuthProvider')
  return ctx
}
