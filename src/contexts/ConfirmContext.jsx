import React, { createContext, useState, useCallback, useContext } from 'react';

// Modern Confirm dialog — replaces window.confirm() with a Tailwind modal.
// Usage:  const confirm = useConfirm(); if (await confirm('Borrar?')) { ... }
const ConfirmContext = createContext(() => Promise.resolve(false))
export function ConfirmProvider({ children }) {
  const [state, setState] = useState(null)
  const confirm = useCallback((opts) => {
    const o = typeof opts === 'string' ? { message: opts } : opts
    return new Promise(resolve => setState({ ...o, resolve }))
  }, [])
  const close = (result) => {
    if (state) state.resolve(result)
    setState(null)
  }
  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      {state && (
        <div className="fixed inset-0 z-[200] bg-black/70 backdrop-blur-md flex items-center justify-center p-4 animate-fade-in" onClick={() => close(false)}>
          <div onClick={(e) => e.stopPropagation()} className="bg-[var(--bg-panel)] border border-[var(--border-color)] rounded-2xl shadow-2xl p-6 max-w-md w-full animate-fade-in-up">
            {state.title && <h3 className="text-lg font-bold text-[var(--text-primary)] mb-2">{state.title}</h3>}
            <p className="text-sm text-[var(--text-secondary)] mb-5 leading-relaxed">{state.message}</p>
            <div className="flex gap-2 justify-end">
              <button onClick={() => close(false)} className="px-4 py-2 rounded-lg text-sm text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] transition-colors">{state.cancelLabel || 'Cancelar'}</button>
              <button onClick={() => close(true)} className={`px-4 py-2 rounded-lg text-sm font-semibold text-white transition-all active:scale-95 ${state.danger !== false ? 'bg-red-600 hover:bg-red-500' : 'bg-[var(--color-accent)] hover:opacity-90'}`}>{state.confirmLabel || 'Borrar'}</button>
            </div>
          </div>
        </div>
      )}
    </ConfirmContext.Provider>
  )
}
export const useConfirm = () => useContext(ConfirmContext)
