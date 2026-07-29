import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'

// PUERTA ÚNICA: sin la sesión del dueño, TODO visitante va a la pantalla de
// bienvenida (/maintenance.html): 3 toques al logo + código validado en el
// SERVER (/api/auth/owner-login, env OWNER_CODE) → entra look y nadie más.
// Excepciones públicas que NO pasan por la puerta:
//   /s/...     → links compartidos (tienen que abrir para cualquiera)
//   ?k=<token> → entrada privada por link (la valida App contra el server)
//   ?demorec   → grabación de reels
const ownerSession = localStorage.getItem('gsync_maint_bypass') === '1' && !!localStorage.getItem('auth_token')
const params = new URLSearchParams(window.location.search)
const publicPath = window.location.pathname.startsWith('/s/') || params.has('k') || params.has('demorec')

if (!ownerSession && !publicPath) {
  window.location.replace('/maintenance.html')
} else {
  createRoot(document.getElementById('root')).render(
    <StrictMode>
      <App />
    </StrictMode>,
  )
}
