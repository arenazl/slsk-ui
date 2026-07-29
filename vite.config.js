import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { readFileSync } from 'node:fs'

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf-8'))

export default defineConfig({
  plugins: [react(), tailwindcss()],
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
    // Hora de build (ART) — visible en el tooltip de la versión para saber
    // exactamente qué deploy estás viendo (fin del "¿llegó o es caché?").
    __BUILD_TIME__: JSON.stringify(new Date().toLocaleString('es-AR', { timeZone: 'America/Argentina/Buenos_Aires', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })),
  },
  server: {
    proxy: {
      '/api': 'http://localhost:8899',
      '/ws': {
        target: 'ws://localhost:8899',
        ws: true,
      },
    },
  },
})
