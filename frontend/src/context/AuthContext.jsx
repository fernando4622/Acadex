import { createContext, useContext, useState, useEffect, useCallback } from 'react'
import { auth as authApi } from '../api/endpoints'

const AuthContext = createContext(null)

// Checks whether a JWT token string is expired (without validating the signature)
function isTokenExpired(token) {
  try {
    const payload = JSON.parse(atob(token.split('.')[1]))
    // exp is in seconds; Date.now() is in ms
    return payload.exp * 1000 < Date.now()
  } catch {
    return true  // malformed token → treat as expired
  }
}

export function AuthProvider({ children }) {
  const [user, setUser]       = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const token  = localStorage.getItem('token')
    const stored = localStorage.getItem('user')

    // Bug 2 fix: validate token expiry before restoring session
    if (token && stored && !isTokenExpired(token)) {
      try { setUser(JSON.parse(stored)) }
      catch { /* corrupted JSON — clear it */ }
    } else {
      // Token missing, expired, or user data corrupted — clear everything
      localStorage.removeItem('token')
      localStorage.removeItem('user')
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
    localStorage.removeItem('token')
    localStorage.removeItem('user')
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
