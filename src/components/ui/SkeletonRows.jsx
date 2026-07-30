import React from 'react';

export default function SkeletonRows({ rows = 10 }) {
  return (
    <div className="flex-1 min-h-0 overflow-hidden px-3 md:px-4 py-2 space-y-1 animate-pulse">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 py-2.5 border-b border-[var(--border-color)]/30" style={{ opacity: 1 - i * 0.07 }}>
          <span className="w-8 h-8 rounded-md bg-[var(--bg-hover)] flex-shrink-0" />
          <div className="flex-1 min-w-0 space-y-1.5">
            <div className="h-3 rounded bg-[var(--bg-hover)]" style={{ width: `${45 + ((i * 17) % 40)}%` }} />
            <div className="h-2 rounded bg-[var(--bg-hover)]" style={{ width: `${25 + ((i * 11) % 25)}%` }} />
          </div>
          <span className="hidden md:block w-16 h-4 rounded-full bg-[var(--bg-hover)] flex-shrink-0" />
          <span className="hidden md:block w-12 h-4 rounded bg-[var(--bg-hover)] flex-shrink-0" />
        </div>
      ))}
    </div>
  )
}
