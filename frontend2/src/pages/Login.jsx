import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
// Asumiendo que tienes un contexto de autenticación o una función de login global
import { useAuth } from '../context/AuthContext';
import { Lock, Eye, EyeOff, ArrowRight, Megaphone } from 'lucide-react';
import logoTecnm from '../assets/logo-tecnm-blanco.png'
import logoEscuela from '../assets/logo-local.png'
import itver from '../assets/itver.png'
import logo from '../assets/logo-w.png'

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ username: '', password: '' });
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  async function handleSubmit(e) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      await login(form.username.trim(), form.password)
      navigate('/')
    } catch (err) {
      console.error("Login error:", err)
      // Extraer mensaje detallado del backend si existe
      const msg = err.response?.data?.detail?.mensaje || err.message || 'Credenciales incorrectas o error de servidor.'
      setError(msg)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex flex-col bg-white font-sans">
      {/*Header*/}
      <header className="w-full bg-darkerBlue py-4 px-10 flex items-center justify-between">
        {/* Bloque Izquierdo */}
        <div className="flex items-center gap-6 flex-nowrap">
          {/* Primer logo */}
          <img src={logoTecnm} alt="Escudo Institucional" className="h-16 object-contain flex-shrink-0" />

          {/* Separador vertical entre logos */}
          <div className="h-10 w-px bg-white/20 flex-shrink-0"></div>

          {/* Segundo logo */}
          <img src={logoEscuela} alt="Escudo Local" className="h-16 object-contain filter brightness-110 flex-shrink-0" />

          {/* Texto institucional (sin separador, todo en una línea) */}

          <p style={{ transform: 'scaleY(1.5)' }} className="text-white text-lg font-semibold font-serif leading-tight tracking-wide uppercase text-nowrap">
            Instituto Tecnológico de Veracruz
          </p>

        </div>

        {/* Bloque Derecho */}
        <div className="flex items-center flex-shrink-0">
          <img src={logo} alt="Logo Acadex" className="h-16 object-contain pr-6" />
        </div>
      </header>
      <div className="w-full h-1 bg-yellow-600"></div>

      <main className="flex-1 flex">
        {/* Left Panel (Institutional Image & Message) */}
        <div
          className="hidden lg:flex lg:w-7/12 bg-cover bg-center relative items-center justify-center"
          style={{ backgroundImage: `url(${itver})` }}
        >
          <div className="absolute inset-0 bg-blue-900 opacity-40"></div> {/* Overlay */}
        </div>

        {/* Right Panel (Login Form) */}
        <div className="flex-1 flex items-center justify-center p-3 bg-gray-100">
          <div className="w-full max-w-md bg-white p-8 rounded-lg shadow-lg border border-gray-200 relative">
            {/* Candado flotante */}
            <div className="absolute -top-8 left-1/2 transform -translate-x-1/2">
              <div className="w-16 h-16 bg-darkBlue rounded-full flex items-center justify-center shadow-md">
                <Lock size={32} className="text-white" />
              </div>
            </div>
            {/* Login Card */}
            <div className="text-center pt-4 mb-4">
              <h2 style={{ transform: 'scaleY(1.15)' }} className="text-2xl font-serif font-bold text-darkBlue">Acceso al Sistema</h2>
              <div className="w-28 h-1 bg-yellow-600 mx-auto mt-2"></div> {/* Underline */}
            </div>
            <form onSubmit={handleSubmit} className="space-y-6">
              <div>
                <label htmlFor="username" className="block text-sm font-medium text-gray-700 mb-1">Usuario</label>
                <div className="relative group border border-gray-300 rounded-lg focus-within:border-blue-500 focus-within:ring-2 focus-within:ring-blue-500/30 transition-all duration-200">
                  <input
                    type="text"
                    id="username"
                    placeholder="usuario@email.com"
                    value={form.username}
                    onChange={e => setForm(f => ({ ...f, username: e.target.value }))}
                    required
                    autoFocus
                    className="w-full bg-transparent px-4 py-2.5 text-sm focus:outline-none pl-10 rounded-lg"
                  />
                  <svg className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 group-focus-within:text-blue-500 transition" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                    <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"></path>
                    <circle cx="12" cy="7" r="4"></circle></svg>
                </div>
              </div>

              <div>
                <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-1">Contraseña</label>
                <div className="relative group border border-gray-300 rounded-lg focus-within:border-blue-500 focus-within:ring-2 focus-within:ring-blue-500/30 transition-all duration-200">
                  <input
                    type={showPw ? 'text' : 'password'}
                    id="password"
                    placeholder="••••••••"
                    value={form.password}
                    onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
                    required
                    className="w-full bg-transparent px-4 py-2.5 text-sm focus:outline-none pl-10 rounded-lg"
                  />
                  <svg className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 group-focus-within:text-blue-500 transition" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                    <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
                    <path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg>
                  <button
                    type="button"
                    onClick={() => setShowPw(v => !v)}
                    className="absolute right-3.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors"
                  >
                    {showPw ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
              </div>

              <div className="space-y-2">
                <div className="space-y-2">
                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full bg-blue-800 text-white py-3 text-base rounded-lg font-medium hover:bg-darkBlue transition flex items-center justify-center gap-2"
                  >
                    {loading
                      ? <><span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Ingresando...</>
                      : <>Ingresar <ArrowRight size={18} /></>
                    }
                  </button>

                  <div className="h-10 flex items-center">
                    {error && (
                      <div className="w-full p-2 bg-red-50 rounded-lg border-l-4 border-red-500 text-red-700 text-sm animate-in fade-in slide-in-from-top-1 duration-200">
                        {error}
                      </div>
                    )}
                  </div>
                </div>

                <div className="text-center text-sm">
                  <a href="#" className="text-darkBlue hover:underline">¿Olvidaste tu contraseña?</a>
                </div>
              </div>
            </form>
          </div>
        </div>
      </main>

      {/* Footer */}{/*
      <footer className="w-full bg-darkerBlue text-white py-4 px-10 text-sm flex flex-col sm:flex-row items-center justify-between gap-2">
        <p>© 2026 Servicios Escolares</p>
        <div className="flex gap-8">
          <a href="#" className="hover:underline">Contacto: soporte@institucion.edu.mx</a>
        </div>
      </footer>*/}
    </div>
  );
}