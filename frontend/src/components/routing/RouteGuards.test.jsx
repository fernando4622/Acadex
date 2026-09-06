import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useAuth } from '../../context/AuthContext'
import { PrivateRoute, PublicRoute } from './RouteGuards'


vi.mock('../../context/AuthContext', () => ({
  useAuth: vi.fn(),
}))

vi.mock('../layout/Layout', () => ({
  default: ({ children }) => <div data-testid="layout">{children}</div>,
}))

function CurrentLocation() {
  return <span data-testid="location">{useLocation().pathname}</span>
}

function renderAtRoute(element, initialPath = '/protected') {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <Routes>
        <Route path="/protected" element={element} />
        <Route path="*" element={<CurrentLocation />} />
      </Routes>
    </MemoryRouter>,
  )
}

describe('PrivateRoute', () => {
  beforeEach(() => {
    vi.mocked(useAuth).mockReturnValue({
      user: null,
      loading: false,
      isAdmin: false,
      isDocente: false,
      isAlumno: false,
    })
  })

  it('redirects unauthenticated users to login', async () => {
    renderAtRoute(<PrivateRoute><span>protected</span></PrivateRoute>)

    expect(await screen.findByTestId('location')).toHaveTextContent('/login')
    expect(screen.queryByText('protected')).not.toBeInTheDocument()
  })

  it('redirects users without an allowed role', async () => {
    vi.mocked(useAuth).mockReturnValue({
      user: { roles: ['ALUMNO'] },
      loading: false,
      isAdmin: false,
      isDocente: false,
      isAlumno: true,
    })

    renderAtRoute(
      <PrivateRoute roles={['ADMIN']}><span>admin content</span></PrivateRoute>,
    )

    expect(await screen.findByTestId('location')).toHaveTextContent('/')
    expect(screen.queryByText('admin content')).not.toBeInTheDocument()
  })

  it('renders protected content for an allowed role', () => {
    vi.mocked(useAuth).mockReturnValue({
      user: { roles: ['ADMIN'] },
      loading: false,
      isAdmin: true,
      isDocente: false,
      isAlumno: false,
    })

    renderAtRoute(
      <PrivateRoute roles={['ADMIN']}><span>admin content</span></PrivateRoute>,
    )

    expect(screen.getByTestId('layout')).toBeInTheDocument()
    expect(screen.getByText('admin content')).toBeInTheDocument()
  })
})

describe('PublicRoute', () => {
  it('redirects authenticated users to the dashboard', async () => {
    vi.mocked(useAuth).mockReturnValue({
      user: { roles: ['ALUMNO'] },
      loading: false,
    })

    renderAtRoute(<PublicRoute><span>login form</span></PublicRoute>)

    expect(await screen.findByTestId('location')).toHaveTextContent('/')
    expect(screen.queryByText('login form')).not.toBeInTheDocument()
  })
})
