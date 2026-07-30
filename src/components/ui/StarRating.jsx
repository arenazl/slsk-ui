import React, { useState, useEffect, useRef, useCallback, useMemo, forwardRef, useImperativeHandle, createContext, useContext } from 'react';

export default function StarRating({ rating, onRate }) {
  const [localRating, setLocalRating] = useState(rating)
  useEffect(() => { setLocalRating(rating) }, [rating])
  return (
    <div className="flex gap-0.5" onClick={e => e.stopPropagation()}>
      {[1, 2, 3, 4, 5].map(star => (
        <button
          key={star}
          onClick={(e) => {
            e.stopPropagation()
            e.preventDefault()
            const next = localRating === star ? 0 : star
            setLocalRating(next)
            onRate(next)
          }}
          className="transition-all duration-150 hover:scale-125"
        >
          <svg className={`w-4 h-4 pointer-events-none ${star <= localRating ? 'text-yellow-500' : 'text-gray-300 dark:text-gray-700 hover:text-yellow-300'}`} fill="currentColor" viewBox="0 0 20 20">
            <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
          </svg>
        </button>
      ))}
    </div>
  )
}
