import React, { useState, useEffect, useRef, useCallback, useMemo, forwardRef, useImperativeHandle, createContext, useContext } from 'react';

export default function SkeletonRows({ rows = 10 }) {
  return (
    <div className="flex-1 min-h-0 overflow-hidden px-3 md:px-4 py-2 space-y-1 animate-pulse">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 md:gap-4 py-2.5 border-b border-[var(--border-color)]/20" style={{ opacity: 0.9 - i * 0.04 }}>
          {/* Index */}
          <span className="hidden sm:block w-4 h-3 rounded bg-gray-600/40 flex-shrink-0" />
          {/* Play button */}
          <span className="w-8 h-8 rounded-full bg-gray-600/40 flex-shrink-0" />
          {/* Artwork (if Discover) / Padding */}
          <span className="hidden sm:block w-10 h-10 rounded-md bg-gray-600/40 flex-shrink-0" />
          
          {/* Title and Artist */}
          <div className="flex-1 min-w-0 flex flex-col sm:flex-row sm:items-center sm:gap-2 space-y-1.5 sm:space-y-0">
            {/* Artist */}
            <div className="h-3.5 rounded bg-gray-500/50" style={{ width: `${20 + ((i * 17) % 20)}%` }} />
            {/* Title */}
            <div className="h-3.5 rounded bg-gray-600/40" style={{ width: `${35 + ((i * 11) % 30)}%` }} />
          </div>
          
          {/* Columns (Genre, Key, Fmt, Dur, MB) */}
          <span className="hidden md:block w-16 h-3.5 rounded-full bg-gray-600/40 flex-shrink-0" />
          <span className="hidden lg:block w-10 h-3.5 rounded bg-gray-600/40 flex-shrink-0" />
          <span className="hidden lg:block w-10 h-3.5 rounded bg-gray-600/40 flex-shrink-0" />
          <span className="hidden xl:block w-12 h-3.5 rounded bg-gray-600/40 flex-shrink-0" />
          
          {/* Rating */}
          <span className="hidden sm:block w-20 h-3.5 rounded bg-gray-600/40 flex-shrink-0" />
        </div>
      ))}
    </div>
  )
}
