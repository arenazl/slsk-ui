import React, { useState, useEffect, useRef, useCallback, useMemo, forwardRef, useImperativeHandle, createContext, useContext } from 'react';

export default function GenreCombo({ value, options, onChange, placeholder = 'Todos los géneros' }) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const wrapRef = useRef(null)
  const inputRef = useRef(null)
  // Close on outside click
  useEffect(() => {
    if (!open) return
    const onDoc = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [open])
  const filtered = (options || []).filter(o => {
    if (!query) return true
    return o.genre.toLowerCase().includes(query.toLowerCase())
  })
  const display = open ? query : (value || '')
  return (
    <div ref={wrapRef} className="relative flex-shrink-0">
      <div className={`flex items-center gap-1 pl-2 pr-1 py-1 bg-[var(--bg-input)] border rounded-lg text-xs transition-colors ${open ? 'border-[var(--color-accent)]' : 'border-[var(--border-color)]'}`}>
        <input
          ref={inputRef}
          value={display}
          onFocus={() => { setOpen(true); setQuery('') }}
          onChange={(e) => { setQuery(e.target.value); if (!open) setOpen(true) }}
          onKeyDown={(e) => {
            if (e.key === 'Escape') { setOpen(false); inputRef.current?.blur() }
            else if (e.key === 'Enter' && filtered[0]) { onChange(filtered[0].genre); setOpen(false); inputRef.current?.blur() }
          }}
          placeholder={placeholder}
          className="w-32 bg-transparent outline-none text-[var(--text-primary)] placeholder-gray-600"
        />
        {value && !open ? (
          <button
            onClick={(e) => { e.stopPropagation(); onChange(''); setQuery(''); inputRef.current?.focus() }}
            className="w-5 h-5 flex items-center justify-center rounded text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)] transition-colors"
            title="Limpiar"
          >
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        ) : (
          <svg className="w-3.5 h-3.5 text-[var(--text-muted)]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 9l-7 7-7-7" /></svg>
        )}
      </div>
      {open && (
        <div className="absolute z-50 mt-1 w-56 max-h-64 overflow-y-auto bg-[var(--bg-panel)] border border-[var(--border-color)] rounded-lg shadow-2xl py-1 animate-fade-in">
          <button
            onClick={() => { onChange(''); setOpen(false); setQuery('') }}
            className={`w-full px-3 py-1.5 text-left text-xs hover:bg-[var(--bg-hover)] transition-colors ${!value ? 'text-[var(--color-accent)] font-semibold' : 'text-[var(--text-secondary)]'}`}
          >
            {placeholder}
          </button>
          {filtered.length === 0 && (
            <div className="px-3 py-2 text-xs text-[var(--text-muted)] italic">Sin resultados</div>
          )}
          {filtered.map(g => (
            <button
              key={g.genre}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => { onChange(g.genre); setOpen(false); setQuery('') }}
              className={`w-full px-3 py-1.5 text-left text-xs hover:bg-[var(--bg-hover)] flex items-center justify-between transition-colors ${value === g.genre ? 'text-[var(--color-accent)] font-semibold' : 'text-[var(--text-primary)]'}`}
            >
              <span className="truncate">{g.genre}</span>
              <span className="text-[10px] text-[var(--text-muted)] font-mono ml-2">{g.count}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
