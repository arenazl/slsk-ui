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

// APP ABIERTA (2026-08-17): se saca la puerta de mantenimiento — la app
// muestra su pantalla de login normal y entra quien tenga usuario. El acceso
// lo controla el server (usuarios en Cloudinary), no un redirect del front.
// El bypass del dueño (?k= / maintenance.html) sigue funcionando por si se
// quiere volver a cerrar: alcanza con restaurar el redirect de abajo.
createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
