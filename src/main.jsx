import { StrictMode, useState } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'

// Cartel de mantenimiento: tapa toda la app. Tocando el logo aparece el login;
// solo entra con look / 3211 (queda recordado en localStorage). El resto ve el cartel.
// NOTA: la clave está en el frontend (no es seguridad real), sirve para "modo
// mantenimiento" mientras se trabaja — la app de atrás conserva su login con JWT.
function MaintenanceGate({ children }) {
  const [ok, setOk] = useState(() => { try { return localStorage.getItem('maint_ok') === '1' } catch { return false } })
  const [showLogin, setShowLogin] = useState(false)
  const [user, setUser] = useState('')
  const [pass, setPass] = useState('')
  const [err, setErr] = useState(false)

  if (ok) return children

  const submit = (e) => {
    e.preventDefault()
    const u = user.trim().toLowerCase()
    // usuarios habilitados durante el mantenimiento (misma clave)
    if (['look', 'jony', 'ari'].includes(u) && pass === '3211') {
      try { localStorage.setItem('maint_ok', '1') } catch {}
      setOk(true)
    } else {
      setErr(true)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col items-center justify-center text-center px-6 select-none"
      style={{ background: 'radial-gradient(circle at 50% 25%, #1b1733 0%, #0a0a10 70%)' }}
    >
      {/* Logo (tocar para mostrar el login) */}
      <button
        onClick={() => setShowLogin((s) => !s)}
        className="relative mb-9 focus:outline-none active:scale-95 transition-transform"
        title="GrooveSync"
        aria-label="Acceso"
      >
        <span
          className="absolute inset-0 rounded-full blur-3xl opacity-50 animate-pulse"
          style={{ background: 'radial-gradient(circle, #7c3aed 0%, transparent 70%)' }}
        />
        <img src="/logo.png" alt="GrooveSync" className="relative w-28 h-28 md:w-32 md:h-32 object-contain drop-shadow-2xl" />
      </button>

      <h1 className="text-2xl md:text-3xl font-bold text-white mb-3 max-w-md leading-snug">
        Estamos trabajando en mejorar la aplicación
      </h1>
      <p className="text-gray-400 mb-7">Volvemos en un ratito. Gracias por la paciencia.</p>

      {/* Animación "trabajando" */}
      <div className="flex items-center gap-2">
        <span className="w-2.5 h-2.5 rounded-full bg-purple-500 animate-bounce" />
        <span className="w-2.5 h-2.5 rounded-full bg-purple-500 animate-bounce" style={{ animationDelay: '0.15s' }} />
        <span className="w-2.5 h-2.5 rounded-full bg-purple-500 animate-bounce" style={{ animationDelay: '0.3s' }} />
      </div>

      {showLogin && (
        <form onSubmit={submit} className="mt-10 w-full max-w-xs flex flex-col gap-3">
          <input
            value={user}
            onChange={(e) => { setUser(e.target.value); setErr(false) }}
            placeholder="Usuario"
            autoFocus
            autoCapitalize="none"
            className="px-4 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white placeholder-gray-500 focus:outline-none focus:border-purple-500 transition-colors"
          />
          <input
            type="password"
            value={pass}
            onChange={(e) => { setPass(e.target.value); setErr(false) }}
            placeholder="Contraseña"
            className="px-4 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white placeholder-gray-500 focus:outline-none focus:border-purple-500 transition-colors"
          />
          <button type="submit" className="px-4 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-semibold transition-colors active:scale-95">
            Entrar
          </button>
          {err && <span className="text-red-400 text-sm">Credenciales incorrectas</span>}
        </form>
      )}
    </div>
  )
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <MaintenanceGate>
      <App />
    </MaintenanceGate>
  </StrictMode>,
)
