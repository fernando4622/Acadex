import axios from 'axios'

const BASE = import.meta.env.DEV ? '/api' : ''

const client = axios.create({
  baseURL: BASE,
  headers: { 'Content-Type': 'application/json' },
})

client.interceptors.request.use((config) => {
  const token = localStorage.getItem('token')
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

client.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401) {
      localStorage.removeItem('token')
      localStorage.removeItem('user')
      // No redireccionar si ya estamos intentando loguearnos, para evitar recargas infinitas/pérdida de errores
      if (!err.config.url.includes('/auth/login')) {
        window.location.href = '/login'
      }
    }

    if (err.response?.status === 422) {
      console.log("ERROR 422:", err.response.data)
    }
    return Promise.reject(err)
  }
)

export default client
