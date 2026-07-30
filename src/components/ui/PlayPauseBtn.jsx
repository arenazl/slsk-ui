import React, { useState, useEffect, useRef, useCallback, useMemo, forwardRef, useImperativeHandle, createContext, useContext } from 'react';

const PLAY_SIZES = {
  xs: { btn: 'w-6 h-6', icon: 'w-3 h-3' },
  sm: { btn: 'w-7 h-7', icon: 'w-3 h-3' },
  md: { btn: 'w-8 h-8', icon: 'w-3.5 h-3.5' },
  lg: { btn: 'w-9 h-9', icon: 'w-4 h-4' },
}


export default function PlayPauseBtn({ isPlaying, onClick, size = 'md', loading = false, className = '' }) {
  const s = PLAY_SIZES[size] || PLAY_SIZES.md
  return (
    <button
      onClick={onClick}
      className={`${s.btn} flex items-center justify-center rounded-full flex-shrink-0 transition-all duration-200 active:scale-95 ${
        loading ? 'bg-white/10 text-gray-400 animate-pulse' :
        isPlaying ? 'bg-white text-black shadow-md' : 'text-gray-600 hover:text-[var(--text-primary,white)] hover:bg-white/10'
      } ${className}`}
    >
      {loading ? (
        <span className="text-xs">...</span>
      ) : isPlaying ? (
        <svg className={s.icon} fill="currentColor" viewBox="0 0 24 24">
          <rect x="6" y="4" width="4" height="16" rx="1" />
          <rect x="14" y="4" width="4" height="16" rx="1" />
        </svg>
      ) : (
        <svg className={`${s.icon} ml-0.5`} fill="currentColor" viewBox="0 0 24 24">
          <path d="M8 5v14l11-7z" />
        </svg>
      )}
    </button>
  )
}
