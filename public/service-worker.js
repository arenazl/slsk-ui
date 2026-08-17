// Minimal service worker to make the app installable as PWA.
// No aggressive caching — we WANT the user to always get the latest version,
// just like the normal web app. The SW exists mainly to satisfy install criteria.

const CACHE_NAME = 'groove-sync-v2'

self.addEventListener('install', (event) => {
  // Skip waiting so new versions activate immediately on reload
  self.skipWaiting()
})

// Permite que la UI fuerce activación de un SW nuevo sin esperar a que
// se cierren todas las pestañas (clásico tema de PWAs).
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting()
  }
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then(keys => Promise.all(
      keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))
    )).then(() => self.clients.claim())
  )
})

// Network-first strategy: always try the network, fall back to cache only if offline.
// NEVER cache JS assets or HTML to prevent stale code errors in PWA.
self.addEventListener('fetch', (event) => {
  // Skip POST/PUT/etc. and any non-GET requests
  if (event.request.method !== 'GET') return
  // Skip external API calls (Heroku backend, Cloudinary, etc.) — let them go direct
  const url = new URL(event.request.url)
  if (url.origin !== self.location.origin) return

  // JS/HTML assets must always be network-fresh to avoid stale ReferenceError bugs.
  // El catch NUNCA puede resolver undefined (eso rompe respondWith con
  // "Failed to convert value to 'Response'" y la app no carga): si no hay
  // cache, respuesta sintética que auto-reintenta en 2s.
  if (url.pathname.includes('/assets/') || url.pathname.endsWith('.html') || url.pathname === '/') {
    event.respondWith(
      fetch(event.request).catch(() =>
        caches.match(event.request, { ignoreSearch: true })
          .then((cached) => cached || caches.match('/'))
          .then((cached) => cached || new Response(
            '<!doctype html><meta charset="utf-8"><meta http-equiv="refresh" content="2"><title>Sin conexion</title><body style="background:#0b0f14;color:#9ca3af;font-family:system-ui;display:grid;place-items:center;height:100vh;margin:0">Reconectando...</body>',
            { status: 503, headers: { 'Content-Type': 'text/html; charset=utf-8' } }
          ))
      )
    )
    return
  }

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        if (response.ok && response.status === 200 && response.type === 'basic') {
          const clone = response.clone()
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone)).catch(() => {})
        }
        return response
      })
      .catch(() => caches.match(event.request).then((cached) => cached || new Response('', { status: 504, statusText: 'Network Error (offline)' })))
  )
})

// Focus window when clicking native OS desktop notification
self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if ('focus' in client) return client.focus()
      }
      if (self.clients.openWindow) return self.clients.openWindow('/')
    })
  )
})

