// Minimal service worker to make the app installable as PWA.
// No aggressive caching — we WANT the user to always get the latest version,
// just like the normal web app. The SW exists mainly to satisfy install criteria.

const CACHE_NAME = 'groove-sync-v1'

self.addEventListener('install', (event) => {
  // Skip waiting so new versions activate immediately on reload
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then(keys => Promise.all(
      keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))
    )).then(() => self.clients.claim())
  )
})

// Network-first strategy: always try the network, fall back to cache only if offline.
// This keeps the app fresh and avoids stale-asset problems.
self.addEventListener('fetch', (event) => {
  // Skip POST/PUT/etc. and any non-GET requests
  if (event.request.method !== 'GET') return
  // Skip external API calls (Heroku backend, Cloudinary, etc.) — let them go direct
  const url = new URL(event.request.url)
  if (url.origin !== self.location.origin) return

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        // Cache successful responses for offline fallback
        if (response.ok) {
          const clone = response.clone()
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone))
        }
        return response
      })
      .catch(() => caches.match(event.request))
  )
})
