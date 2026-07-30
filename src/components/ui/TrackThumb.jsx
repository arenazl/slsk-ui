import React from 'react';

export default function TrackThumb({ src, size = 'w-8 h-8' }) {
  const [err, setErr] = useState(false)
  if (!src || err) {
    return (
      <span className={`${size} rounded-md flex-shrink-0 bg-[var(--bg-hover)] border border-[var(--border-color)] flex items-center justify-center`}>
        <svg className="w-3.5 h-3.5 text-[var(--text-dim)]" fill="currentColor" viewBox="0 0 24 24"><path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55C7.79 13 6 14.79 6 17s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z" /></svg>
      </span>
    )
  }
  return <img src={src} alt="" loading="lazy" onError={() => setErr(true)} className={`${size} rounded-md object-cover flex-shrink-0 ring-1 ring-white/10`} />
}
