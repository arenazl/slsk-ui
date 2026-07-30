import React, { useState, useEffect, useRef, useCallback, useMemo, forwardRef, useImperativeHandle, createContext, useContext } from 'react';

export default function StarFilterHover({ rating, selectedStars, onSelect }) {
  const [hoverRating, setHoverRating] = useState(0)

  return (
    <div className="hidden md:flex items-center gap-1 bg-[var(--bg-input)]/40 px-2 py-1 rounded-lg border border-[var(--border-color)] flex-shrink-0" onMouseLeave={() => setHoverRating(0)}>
      <button
        onClick={() => onSelect(0)}
        title="Mostrar todas las estrellas"
        className={`px-1.5 py-0.5 rounded text-[11px] font-semibold transition-all ${
          selectedStars.length === 0 ? 'bg-[var(--color-accent)]/20 text-[var(--text-primary)] font-bold' : 'text-gray-500 hover:text-gray-300'
        }`}
      >
        Todas
      </button>
      <div className="flex items-center gap-0.5 ml-1">
        {[1, 2, 3, 4, 5].map(star => {
          const active = hoverRating ? star <= hoverRating : (rating !== null ? star <= rating : selectedStars.includes(star))
          return (
            <button
              key={star}
              onMouseEnter={() => setHoverRating(star)}
              onClick={() => onSelect(star)}
              title={`Filtrar por ${star} estrella${star > 1 ? 's' : ''}`}
              className="p-0.5 transition-transform duration-150 hover:scale-125 focus:outline-none"
            >
              <span className={`text-base leading-none transition-colors ${
                active ? 'text-amber-400 font-bold drop-shadow-[0_0_6px_rgba(251,191,36,0.5)]' : 'text-gray-600 hover:text-gray-400'
              }`}>
                ★
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
