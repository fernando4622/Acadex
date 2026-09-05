import { render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { AuthProvider, useAuth } from './AuthContext'


function encodeToken(payload) {
  const encodedPayload = btoa(JSON.stringify(payload))
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')

  return `header.${encodedPayload}.signature`
}

function SessionState() {
  const { loading, user } = useAuth()

  if (loading) return <span>loading</span>
  return <span>{user?.nombre ?? 'anonymous'}</span>
}

function renderSession() {
  return render(
    <AuthProvider>
      <SessionState />
    </AuthProvider>,
  )
}

describe('AuthProvider session restoration', () => {
  it('restores a valid unexpired session', async () => {
    const token = encodeToken({ exp: Math.floor(Date.now() / 1000) + 3600 })
    const user = { token, roles: ['ALUMNO'], nombre: 'Ana', id_entidad: 7 }
    localStorage.setItem('token', token)
    localStorage.setItem('user', JSON.stringify(user))

    renderSession()

    expect(await screen.findByText('Ana')).toBeInTheDocument()
    expect(localStorage.getItem('token')).toBe(token)
  })

  it('clears an expired session', async () => {
    const token = encodeToken({ exp: Math.floor(Date.now() / 1000) - 60 })
    localStorage.setItem('token', token)
    localStorage.setItem('user', JSON.stringify({ token, roles: ['ALUMNO'] }))

    renderSession()

    expect(await screen.findByText('anonymous')).toBeInTheDocument()
    expect(localStorage.getItem('token')).toBeNull()
    expect(localStorage.getItem('user')).toBeNull()
  })

  it('clears malformed persisted user data', async () => {
    const token = encodeToken({ exp: Math.floor(Date.now() / 1000) + 3600 })
    localStorage.setItem('token', token)
    localStorage.setItem('user', '{invalid-json')

    renderSession()

    await waitFor(() => expect(localStorage.getItem('token')).toBeNull())
    expect(localStorage.getItem('user')).toBeNull()
    expect(screen.getByText('anonymous')).toBeInTheDocument()
  })

  it('rejects tokens without an expiration time', async () => {
    const token = encodeToken({ sub: '7' })
    localStorage.setItem('token', token)
    localStorage.setItem('user', JSON.stringify({ token, roles: ['ALUMNO'] }))

    renderSession()

    expect(await screen.findByText('anonymous')).toBeInTheDocument()
    expect(localStorage.getItem('token')).toBeNull()
  })
})
