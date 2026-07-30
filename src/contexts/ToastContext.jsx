import React, { createContext, useState, useEffect, useCallback, useContext } from 'react';

// Toast notification system
const ToastContext = createContext()
export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([])

  // Pedir permiso de notificaciones del sistema operativo al montar
  useEffect(() => {
    if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission().catch(() => {})
    }
  }, [])

  const show = useCallback((msg, type = 'success', duration = 3000) => {
    const id = Date.now() + Math.random()
    // Prevent duplicate messages (skip if same msg already showing)
    setToasts(prev => {
      if (prev.some(t => t.msg === msg)) return prev
      return [...prev.slice(-4), { id, msg, type }]
    })
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), duration)

    // Notificación nativa del sistema (Windows Action Center / System Tray Toast)
    try {
      if (typeof window !== 'undefined' && 'Notification' in window) {
        const title = type === 'error' ? 'DJ Free App — Error' : type === 'warning' ? 'DJ Free App — Aviso' : 'DJ Free App'
        const fireNative = () => {
          if (navigator.serviceWorker && navigator.serviceWorker.ready) {
            navigator.serviceWorker.ready.then(reg => {
              reg.showNotification(title, {
                body: msg,
                icon: '/icon-192.png',
                tag: 'djfreeapp-toast-' + id,
                renotify: true
              }).catch(() => {
                new Notification(title, { body: msg, icon: '/icon-192.png' })
              })
            }).catch(() => {
              new Notification(title, { body: msg, icon: '/icon-192.png' })
            })
          } else {
            new Notification(title, { body: msg, icon: '/icon-192.png' })
          }
        }

        if (Notification.permission === 'granted') {
          fireNative()
        } else if (Notification.permission === 'default') {
          Notification.requestPermission().then(perm => {
            if (perm === 'granted') fireNative()
          }).catch(() => {})
        }
      }
    } catch (e) {
      console.warn('Native notification error:', e)
    }
  }, [])
  return (
    <ToastContext.Provider value={show}>
      {children}
      <div className="fixed bottom-20 right-4 z-50 flex flex-col gap-2 pointer-events-none">
        {toasts.map(t => (
          <div key={t.id} className={`pointer-events-auto px-4 py-2.5 rounded-lg shadow-lg text-sm font-medium animate-in fade-in slide-in-from-bottom-2 duration-300 ${
            t.type === 'error' ? 'bg-red-600 text-white' : t.type === 'warning' ? 'bg-yellow-600 text-white' : 'bg-emerald-600 text-white'
          }`}>
            {t.msg}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}
export const useToast = () => useContext(ToastContext)
