import { useState, useEffect, useRef, useCallback, useMemo, forwardRef, useImperativeHandle, createContext, useContext } from 'react'

// Toast notification system
const ToastContext = createContext()
function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([])
  const show = useCallback((msg, type = 'success', duration = 3000) => {
    const id = Date.now()
    setToasts(prev => [...prev, { id, msg, type }])
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), duration)
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
const useToast = () => useContext(ToastContext)

const STATUS_LABELS = {
  pending: 'Pendiente',
  searching: 'Buscando...',
  downloading: 'Descargando',
  completed: 'Completado',
  skipped: 'Ya descargado',
  not_found: 'No encontrado',
  error: 'Error',
}

const PLAY_SIZES = {
  xs: { btn: 'w-6 h-6', icon: 'w-3 h-3' },
  sm: { btn: 'w-7 h-7', icon: 'w-3 h-3' },
  md: { btn: 'w-8 h-8', icon: 'w-3.5 h-3.5' },
  lg: { btn: 'w-9 h-9', icon: 'w-4 h-4' },
}

function PlayPauseBtn({ isPlaying, onClick, size = 'md', loading = false, className = '' }) {
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

const STATUS_COLORS = {
  pending: 'bg-gray-700',
  searching: 'bg-yellow-500/20 text-yellow-400',
  downloading: 'bg-[var(--color-accent)]/20 text-[var(--color-accent)]',
  completed: 'bg-green-500/20 text-green-400',
  skipped: 'bg-cyan-500/20 text-cyan-400',
  not_found: 'bg-red-500/20 text-red-400',
  error: 'bg-red-500/20 text-red-400',
}

function TrackRow({ track }) {
  return (
    <div className={`flex items-center gap-3 px-4 py-2.5 border-b border-[var(--border-color)] transition-all duration-200 ${
      track.status === 'downloading' ? 'bg-[var(--color-accent)]/5' :
      track.status === 'completed' ? 'bg-green-500/5' :
      track.status === 'skipped' ? 'bg-cyan-500/5' : ''
    }`}>
      <span className="text-gray-500 text-sm w-8 text-right flex-shrink-0">{track.id + 1}</span>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-[var(--text-primary)] truncate font-medium">{track.title}</span>
          {track.format && (
            <span className="text-xs px-1.5 py-0.5 rounded bg-gray-700 text-gray-300 flex-shrink-0">
              {track.format}
            </span>
          )}
        </div>
        <div className="text-sm text-gray-400 truncate">
          {track.artist}
          {track.source_user && <span className="text-gray-600"> &middot; de {track.source_user}</span>}
          {track.size_mb > 0 && <span className="text-gray-600"> &middot; {track.size_mb} MB</span>}
        </div>
      </div>

      <div className="flex items-center gap-3 flex-shrink-0">
        {track.status === 'downloading' && track.progress > 0 && (
          <div className="w-24 flex items-center gap-2">
            <div className="flex-1 h-1.5 bg-gray-700 rounded-full overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-300 bg-[var(--color-accent)]"
                style={{ width: `${track.progress}%` }}
              />
            </div>
            <span className="text-xs text-[var(--color-accent)] w-8">{track.progress}%</span>
          </div>
        )}
        {track.status === 'searching' && (
          <div className="w-5 h-5 border-2 border-yellow-500 border-t-transparent rounded-full animate-spin" />
        )}
        <span className={`text-xs px-2 py-1 rounded-full ${STATUS_COLORS[track.status] || 'bg-gray-700'}`}>
          {STATUS_LABELS[track.status] || track.status}
        </span>
      </div>
    </div>
  )
}

const API_BASE = ['5173', '5174', '5175'].includes(window.location.port) ? 'http://localhost:8899' : 'https://slsk-backend-7da97b8a965d.herokuapp.com'
const AGENT_BASE = 'http://localhost:9900'

function getAudioUrl(file, useAgent) {
  const base = useAgent ? AGENT_BASE + '/api/audio/' : API_BASE + '/audio/'
  if (file.in_subfolder && file.subfolder) {
    return base + encodeURIComponent(file.subfolder) + '/' + encodeURIComponent(file.filename)
  }
  return base + encodeURIComponent(file.filename)
}

async function createAudioElement(file, useAgent) {
  const url = getAudioUrl(file, useAgent)
  // Use Audio element directly — Chrome allows <audio> to load from localhost
  // even on HTTPS pages (unlike fetch which gets blocked by private network policy)
  return new Audio(url)
}

function GenreCard({ genre, files, onDrop, onOpenFolder, onDownloadZip, color, colorRgb, expanded, onToggle, playingFile, onPlay, onContextMenu }) {
  const [dragOver, setDragOver] = useState(false)

  return (
    <div
      onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; setDragOver(true) }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => {
        e.preventDefault()
        setDragOver(false)
        try {
          const file = JSON.parse(e.dataTransfer.getData('application/json'))
          if (file.genre !== genre) onDrop(file, genre)
        } catch {}
      }}
      className={`rounded-2xl border overflow-hidden transition-all duration-300 ${
        dragOver
          ? 'border-[var(--color-accent)] ring-2 ring-[var(--color-accent)]/30 scale-[1.02]'
          : 'border-[var(--border-color)]/60 hover:border-gray-700'
      } bg-[var(--bg-panel)]`}
    >
      {/* Card header with gradient accent */}
      <div
        className="relative px-4 py-3 cursor-pointer select-none group"
        onClick={onToggle}
        style={{ background: `linear-gradient(135deg, rgba(${colorRgb},0.15) 0%, transparent 60%)` }}
      >
        <div className="flex items-center gap-3">
          <div className={`w-3 h-3 rounded-full flex-shrink-0 ${color} ring-2 ring-white/10`} />
          <div className="flex-1 min-w-0">
            <div className="text-sm font-bold text-[var(--text-primary)] truncate">{genre || 'Unsorted'}</div>
          </div>
          <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${color}/20 text-[var(--text-primary)]/80`}>
            {files.length}
          </span>
          {genre && (
            <>
              <button
                onClick={(e) => { e.stopPropagation(); onDownloadZip(genre) }}
                className="opacity-0 group-hover:opacity-100 text-gray-400 hover:text-green-400 transition-all p-1 rounded-lg hover:bg-white/10"
                title="Descargar ZIP"
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); onOpenFolder(genre) }}
                className="opacity-0 group-hover:opacity-100 text-gray-400 hover:text-[var(--text-primary,white)] transition-all p-1 rounded-lg hover:bg-white/10"
                title="Abrir carpeta"
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 19a2 2 0 01-2-2V7a2 2 0 012-2h4l2 2h4a2 2 0 012 2v1M5 19h14a2 2 0 002-2v-5a2 2 0 00-2-2H9a2 2 0 00-2 2v5a2 2 0 01-2 2z" />
                </svg>
              </button>
            </>
          )}
          <svg className={`w-3.5 h-3.5 text-gray-500 transition-transform duration-300 ${expanded ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </div>

        {/* Mini preview when collapsed */}
        {!expanded && files.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-2">
            {files.slice(0, 4).map((f, i) => (
              <span key={i} className="text-[10px] px-1.5 py-0.5 rounded-md bg-white/5 text-gray-400 truncate max-w-24">
                {f.artist || f.title || f.filename}
              </span>
            ))}
            {files.length > 4 && (
              <span className="text-[10px] px-1.5 py-0.5 text-gray-600">+{files.length - 4}</span>
            )}
          </div>
        )}
      </div>

      {/* Expanded track list */}
      {expanded && (
        <div className="px-2 pb-2 space-y-0.5 max-h-48 overflow-y-auto scrollbar-none">
          {files.map((f, i) => {
            const isPlaying = playingFile === f.filename
            return (
              <div
                key={`${f.filename}-${i}`}
                draggable
                onDragStart={(e) => {
                  e.dataTransfer.setData('application/json', JSON.stringify(f))
                  e.dataTransfer.effectAllowed = 'move'
                }}
                onContextMenu={(e) => onContextMenu?.(e, f)}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-lg cursor-grab active:cursor-grabbing hover:bg-[var(--bg-hover)] transition-colors group/item ${
                  isPlaying ? 'bg-white/5' : ''
                }`}
              >
                <PlayPauseBtn isPlaying={isPlaying} onClick={(e) => { e.stopPropagation(); onPlay(f) }} size="xs" />
                <div className="flex-1 min-w-0">
                  <div className={`text-xs truncate ${isPlaying ? 'font-medium text-[var(--color-accent)]' : 'text-[var(--text-primary)]/90'}`}>{f.title || f.filename}</div>
                  <div className="text-[10px] text-gray-500 truncate">{f.artist}</div>
                </div>
                <span className="text-[10px] text-gray-600 flex-shrink-0">{f.format}</span>
              </div>
            )
          })}
          {files.length === 0 && (
            <div className="text-center text-gray-600 text-xs py-4">
              Arrastrá archivos aquí
            </div>
          )}
        </div>
      )}
    </div>
  )
}

const GENRE_COLORS = [
  { bg: 'bg-blue-500', rgb: '59,130,246' },
  { bg: 'bg-emerald-500', rgb: '16,185,129' },
  { bg: 'bg-purple-500', rgb: '168,85,247' },
  { bg: 'bg-orange-500', rgb: '249,115,22' },
  { bg: 'bg-pink-500', rgb: '236,72,153' },
  { bg: 'bg-cyan-500', rgb: '6,182,212' },
  { bg: 'bg-yellow-500', rgb: '234,179,8' },
  { bg: 'bg-red-500', rgb: '239,68,68' },
  { bg: 'bg-indigo-500', rgb: '99,102,241' },
  { bg: 'bg-teal-500', rgb: '20,184,166' },
  { bg: 'bg-rose-500', rgb: '244,63,94' },
  { bg: 'bg-amber-500', rgb: '245,158,11' },
  { bg: 'bg-violet-500', rgb: '139,92,246' },
  { bg: 'bg-lime-500', rgb: '132,204,22' },
  { bg: 'bg-fuchsia-500', rgb: '217,70,239' },
  { bg: 'bg-sky-500', rgb: '14,165,233' },
  { bg: 'bg-green-500', rgb: '34,197,94' },
  { bg: 'bg-slate-400', rgb: '148,163,184' },
]

function AudioPlayerBar({ file, isPlaying, audio, onPlayPause, onStop, agentConnected }) {
  const canvasRef = useRef(null)
  const waveformRef = useRef(null) // Float32Array of peaks
  const animFrameRef = useRef(null)
  const lastFileRef = useRef(null)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [volume, setVolume] = useState(0.8)
  const [muted, setMuted] = useState(false)

  // Sync volume to audio element
  useEffect(() => {
    if (!audio) return
    audio.volume = muted ? 0 : volume
  }, [audio, volume, muted])

  // Generate waveform from audio element using Web Audio API
  useEffect(() => {
    if (!file) { waveformRef.current = null; return }
    const key = file.filename
    if (lastFileRef.current === key) return
    lastFileRef.current = key
    waveformRef.current = null

    if (!audio || !audio.src) return

    // Generate waveform: try fetch for same-origin, skip for cross-origin (localhost)
    const src = audio.src
    if (src.includes('localhost') || src.startsWith('blob:')) {
      // Can't fetch from localhost on HTTPS page — waveform will use simple progress bar
      return
    }
    fetch(src)
      .then(r => r.arrayBuffer())
      .then(buf => {
        const ctx = new (window.AudioContext || window.webkitAudioContext)()
        return ctx.decodeAudioData(buf).then(decoded => {
          const raw = decoded.getChannelData(0)
          const numPeaks = 200
          const blockSize = Math.floor(raw.length / numPeaks)
          const peaks = new Float32Array(numPeaks)
          for (let i = 0; i < numPeaks; i++) {
            let sum = 0
            const start = i * blockSize
            for (let j = 0; j < blockSize; j++) {
              sum += Math.abs(raw[start + j])
            }
            peaks[i] = sum / blockSize
          }
          // Normalize
          const max = Math.max(...peaks) || 1
          for (let i = 0; i < numPeaks; i++) peaks[i] /= max
          waveformRef.current = peaks
          ctx.close()
        })
      })
      .catch(() => {})
  }, [file, audio])

  // Draw waveform + progress cursor
  useEffect(() => {
    if (!file) return
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')

    const draw = () => {
      animFrameRef.current = requestAnimationFrame(draw)
      const w = canvas.width
      const h = canvas.height
      ctx.clearRect(0, 0, w, h)

      const peaks = waveformRef.current
      if (audio) {
        setCurrentTime(audio.currentTime || 0)
        setDuration(audio.duration || 0)
      }
      if (!peaks) {
        // Simple progress bar (for previews or while loading)
        const pct = (audio && audio.duration) ? (audio.currentTime / audio.duration) : 0
        const barY = h / 2 - 3
        const barH = 6
        // Read accent color from CSS variable
        const accentRgb = getComputedStyle(document.documentElement).getPropertyValue('--color-accent-rgb').trim() || '59,130,246'
        // Background
        ctx.fillStyle = 'rgba(100,116,139,0.2)'
        ctx.beginPath()
        ctx.roundRect(0, barY, w, barH, 3)
        ctx.fill()
        // Progress
        if (pct > 0) {
          ctx.fillStyle = `rgba(${accentRgb},0.8)`
          ctx.beginPath()
          ctx.roundRect(0, barY, w * pct, barH, 3)
          ctx.fill()
        }
        // Cursor dot
        if (pct > 0) {
          ctx.fillStyle = `rgb(${accentRgb})`
          ctx.beginPath()
          ctx.arc(w * pct, h / 2, 5, 0, Math.PI * 2)
          ctx.fill()
        }
        return
      }

      // Read accent color from CSS variable
      const accentRgb = getComputedStyle(document.documentElement).getPropertyValue('--color-accent-rgb').trim() || '59,130,246'
      const bars = peaks.length
      const barW = Math.max((w / bars) - 1, 1)
      const gap = 1
      const pct = (audio && audio.duration) ? (audio.currentTime / audio.duration) : 0

      for (let i = 0; i < bars; i++) {
        const x = (i / bars) * w
        const amp = peaks[i]
        const barH = Math.max(amp * h * 0.9, 2)
        const y = (h - barH) / 2
        const progress = (i / bars)

        if (progress < pct) {
          ctx.fillStyle = `rgba(${accentRgb},0.9)`
        } else {
          ctx.fillStyle = 'rgba(100,116,139,0.35)'
        }
        ctx.fillRect(x, y, barW, barH)
      }

      // Playhead line
      if (pct > 0) {
        const px = pct * w
        ctx.fillStyle = 'rgba(255,255,255,0.8)'
        ctx.fillRect(px - 1, 0, 2, h)
      }

      if (audio) {
        setCurrentTime(audio.currentTime || 0)
        setDuration(audio.duration || 0)
      }
    }
    draw()

    return () => {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current)
    }
  }, [file, audio, isPlaying])

  useEffect(() => {
    return () => { if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current) }
  }, [])

  const formatTime = (s) => {
    if (!s || isNaN(s)) return '0:00'
    const m = Math.floor(s / 60)
    const sec = Math.floor(s % 60)
    return `${m}:${sec.toString().padStart(2, '0')}`
  }

  const handleSeek = (e) => {
    if (!audio) return
    const dur = audio.duration || duration
    if (!dur || !isFinite(dur)) return
    const rect = e.currentTarget.getBoundingClientRect()
    const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width))
    const wasPlaying = !audio.paused
    try {
      audio.currentTime = pct * dur
    } catch {}
    if (wasPlaying) {
      audio.play().catch(() => {})
    }
  }

  if (!file) return null

  return (
    <div className="flex-shrink-0 bg-[var(--bg-surface)] border-t border-[var(--border-color)] px-4 py-2">
      <div className="flex items-center gap-3">
        {/* Play/Pause */}
        <PlayPauseBtn isPlaying={isPlaying} onClick={onPlayPause} size="lg" className="hover:scale-105 !bg-white !text-black !shadow-md" />

        {/* Stop */}
        <button
          onClick={onStop}
          className="w-7 h-7 flex items-center justify-center rounded-full text-gray-500 hover:text-[var(--text-primary,white)] hover:bg-white/10 transition-all flex-shrink-0"
        >
          <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24">
            <rect x="6" y="6" width="12" height="12" rx="1" />
          </svg>
        </button>

        {/* Track info */}
        <div className="flex-shrink-0 min-w-0 w-48">
          <div className="text-sm text-[var(--text-primary)] truncate font-medium">{file.title || file.filename}</div>
          <div className="text-xs text-gray-500 truncate">{file.artist}</div>
        </div>

        {/* Time */}
        <span className="text-xs text-gray-500 flex-shrink-0 w-10 text-right">{formatTime(currentTime)}</span>

        {/* Waveform / Seek bar */}
        <div className="flex-1 min-w-0 h-12 relative cursor-pointer" onClick={handleSeek}>
          <canvas ref={canvasRef} className="w-full h-full rounded" width={800} height={48} />
        </div>

        <span className="text-xs text-gray-500 flex-shrink-0 w-10">{formatTime(duration)}</span>

        {/* Volume */}
        <button
          onClick={() => setMuted(m => !m)}
          className="w-7 h-7 flex items-center justify-center rounded-full text-gray-500 hover:text-[var(--text-primary,white)] hover:bg-white/10 transition-all flex-shrink-0"
          title={muted ? 'Unmute' : 'Mute'}
        >
          {muted || volume === 0 ? (
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2" />
            </svg>
          ) : (
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.536 8.464a5 5 0 010 7.072M18.364 5.636a9 9 0 010 12.728" />
            </svg>
          )}
        </button>
        <input
          type="range"
          min="0"
          max="1"
          step="0.01"
          value={muted ? 0 : volume}
          onChange={(e) => { setVolume(parseFloat(e.target.value)); if (muted) setMuted(false) }}
          className="w-20 h-1 accent-[var(--color-accent)] flex-shrink-0"
        />
      </div>
    </div>
  )
}

function StarRating({ rating, onRate }) {
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

function useQS(key, defaultVal) {
  const [val, setVal] = useState(() => {
    const p = new URLSearchParams(window.location.search)
    return p.get(key) || defaultVal
  })
  const set = useCallback((v) => {
    const next = typeof v === 'function' ? v(val) : v
    setVal(next)
    const p = new URLSearchParams(window.location.search)
    if (next === defaultVal || next === '' || next === '0') p.delete(key)
    else p.set(key, next)
    const qs = p.toString()
    window.history.replaceState(null, '', qs ? '?' + qs : window.location.pathname)
  }, [key, defaultVal, val])
  return [val, set]
}

const Library = forwardRef(function Library({ playingFile, onPlay, onPlayPause, onStop, onStartPreviewMode, previewMode, onStopPreviewMode, agentConnected, onRadio, authUser }, ref) {
  const toast = useToast()
  const [files, setFiles] = useState([])
  const [loading, setLoading] = useState(true)
  const [classifying, setClassifying] = useState(false)
  const [moving, setMoving] = useState(false)
  const [organizing, setOrganizing] = useState(false)
  const [expanded, setExpanded] = useState({})
  const [search, setSearch] = useQS('q', '')
  const [view, setView] = useQS('view', 'cards')
  const [starFilter, _setStarFilter] = useQS('stars', '0')
  const setStarFilter = useCallback((v) => _setStarFilter(String(v)), [_setStarFilter])
  const [exportName, setExportName] = useState('')
  const [exporting, setExporting] = useState(false)
  const [exportWithTracks, setExportWithTracks] = useState(false)
  const [detectingKeys, setDetectingKeys] = useState(false)
  const [sortCol, setSortCol] = useQS('sort', 'date')
  const [sortDir, setSortDir] = useQS('dir', 'desc')
  const [showDupes, setShowDupes] = useState(false)
  const [genreFilter, setGenreFilter] = useState([])
  const [deletingDupes, setDeletingDupes] = useState(false)
  const [ctxMenu, setCtxMenu] = useState(null) // { x, y, file }
  const [customGenre, setCustomGenre] = useState('')
  const ctxRef = useRef(null)

  const fetchIdRef = useRef(0)
  const fetchLibrary = useCallback(async () => {
    const id = ++fetchIdRef.current
    try {
      // Fetch metadata from Heroku (Cloudinary = source of truth)
      const metaRes = await fetch(`${API_BASE}/api/metadata?user=${encodeURIComponent(authUser?.name || '')}`)
      const metadata = await metaRes.json()

      if (agentConnected) {
        // Fetch file list from agent (file info only)
        const agentRes = await fetch(`${AGENT_BASE}/api/library`)
        const agentFiles = await agentRes.json()

        // Merge: agent file info + Cloudinary metadata by filename
        const merged = agentFiles.map(f => {
          const meta = metadata[f.filename] || {}
          return {
            filename: f.filename,
            title: meta.title || '',
            artist: meta.artist || '',
            genre: meta.genre || f.subfolder || '',
            key: meta.key || '',
            bpm: meta.bpm,
            rating: meta.rating || 0,
            size_mb: f.size_mb,
            format: f.format,
            date: meta.date || meta.date_added || f.mtime || '',
            date_added: meta.date_added || meta.date || f.mtime || '',
            in_subfolder: !!f.subfolder,
            subfolder: f.subfolder || '',
            manual_genre: meta.manual_genre || false,
          }
        })
        if (id === fetchIdRef.current) setFiles(merged)
      } else {
        // No agent: use Heroku library endpoint (metadata-only view)
        const libRes = await fetch(`${API_BASE}/api/library?user=${encodeURIComponent(authUser?.name || '')}`)
        const data = await libRes.json()
        if (id === fetchIdRef.current) setFiles(data)
      }
    } catch (e) {
      console.error('Failed to fetch library', e)
    } finally {
      if (id === fetchIdRef.current) setLoading(false)
    }
  }, [agentConnected, authUser])

  const hasFetched = useRef(false)
  useEffect(() => {
    hasFetched.current = false
  }, [agentConnected, authUser])
  useEffect(() => {
    if (!hasFetched.current) {
      hasFetched.current = true
      fetchLibrary()
    }
  }, [fetchLibrary])

  useImperativeHandle(ref, () => ({
    refresh: fetchLibrary,
    getFiles: () => files,
    goToTrack: (filename) => {
      fetchLibrary().then(() => {
        setView('tracks')
        setSearch(filename.replace(/\.\w{3,4}$/, '').replace(/^\d+[\s\-\.]+/, ''))
      })
    },
  }), [fetchLibrary, setView, setSearch])

  // Close context menu on outside click
  useEffect(() => {
    if (!ctxMenu) return
    const handleClick = (e) => {
      if (ctxRef.current && !ctxRef.current.contains(e.target)) setCtxMenu(null)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [ctxMenu])

  const handleContextMenu = (e, file) => {
    e.preventDefault()
    setCtxMenu({ x: e.clientX, y: e.clientY, file })
    setCustomGenre('')
  }

  const changeGenre = (newGenre) => {
    if (ctxMenu?.file && newGenre !== ctxMenu.file.genre) {
      moveFile(ctxMenu.file, newGenre)
    }
    setCtxMenu(null)
  }

  const deleteFile = async (file) => {
    setCtxMenu(null)
    setFiles(prev => prev.filter(f => f.filename !== file.filename))
    try {
      // Delete file from agent
      await fetch(`${AGENT_BASE}/api/delete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filename: file.filename }),
      })
    } catch (e) {
      console.error('Failed to delete', e)
      fetchLibrary()
    }
  }

  const downloadGenreZip = (genre) => {
    if (agentConnected) {
      fetch(`${AGENT_BASE}/api/open-folder?folder=${encodeURIComponent(genre)}`)
    } else {
      window.open(`${API_BASE}/api/download-genre?genre=${encodeURIComponent(genre)}`, '_blank')
    }
  }

  const openFolder = async (folder) => {
    if (agentConnected) {
      await fetch(`${AGENT_BASE}/api/open-folder?folder=${encodeURIComponent(folder || '')}`)
    } else {
      await fetch(`${API_BASE}/api/open-folder`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ folder: folder || '' }),
      })
    }
  }

  const classifyWithAI = async () => {
    setClassifying(true)
    try {
      const res = await fetch(`${API_BASE}/api/classify`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: authUser?.name || '' }) })
      const data = await res.json()
      // After classification, tell agent to organize files into genre folders
      if (agentConnected && data.classified > 0) {
        // Get updated metadata from Heroku to build move list
        const metaRes = await fetch(`${API_BASE}/api/metadata?user=${encodeURIComponent(authUser?.name || '')}`)
        const metadata = await metaRes.json()
        const moves = Object.entries(metadata)
          .filter(([, info]) => info.genre)
          .map(([filename, info]) => ({ filename, genre: info.genre }))
        await fetch(`${AGENT_BASE}/api/organize`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ moves }),
        }).catch(() => {})
      }
      fetchLibrary()
    } catch (e) {
      console.error('Failed to classify', e)
    } finally {
      setClassifying(false)
    }
  }

  const organizeAll = async () => {
    setOrganizing(true)
    try {
      await fetch(`${AGENT_BASE}/api/organize`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      })
      fetchLibrary()
    } catch (e) {
      console.error('Failed to organize', e)
    } finally {
      setOrganizing(false)
    }
  }

  const detectKeys = async () => {
    setDetectingKeys(true)
    try {
      // Get list of tracks without key from Heroku (Cloudinary manifest)
      const res = await fetch(`${API_BASE}/api/detect-keys`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: authUser?.name || '' }) })
      const data = await res.json()
      const toDetect = data.to_detect || []
      if (toDetect.length === 0) { fetchLibrary(); return }

      // For each track, fetch audio from agent and send to Heroku for analysis
      // Heroku's detect-key endpoint now also updates Cloudinary manifest
      const audioBase = agentConnected ? AGENT_BASE : API_BASE
      let detected = 0
      for (const fname of toDetect) {
        try {
          const audioRes = await fetch(`${audioBase}/api/audio/${encodeURIComponent(fname)}`)
          if (!audioRes.ok) continue
          const blob = await audioRes.blob()
          const form = new FormData()
          form.append('file', blob, fname)
          form.append('filename', fname)
          form.append('username', authUser?.name || '')
          const keyRes = await fetch(`${API_BASE}/api/detect-key`, { method: 'POST', body: form })
          const keyData = await keyRes.json()
          if (keyData.key) detected++
        } catch (e) { console.error('Key detect failed for:', fname, e) }
      }
      fetchLibrary()
    } catch (e) {
      console.error('Failed to detect keys', e)
    } finally {
      setDetectingKeys(false)
    }
  }

  const deleteDupes = async () => {
    const toDelete = dupeGroups.flatMap(g => g.dupes.map(d => d.filename))
    if (!toDelete.length) return
    if (!confirm(`Borrar ${toDelete.length} duplicados? Se mantienen los de mejor rating/calidad.`)) return
    setDeletingDupes(true)
    try {
      const res = await fetch(`${AGENT_BASE}/api/delete-dupes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filenames: toDelete }),
      })
      const data = await res.json()
      if (data.deleted > 0) fetchLibrary()
    } catch (e) {
      console.error('Failed to delete dupes', e)
    } finally {
      setDeletingDupes(false)
      setShowDupes(false)
    }
  }

  const moveFile = async (file, newGenre) => {
    setMoving(true)
    // Optimistic update
    setFiles(prev => prev.map(f =>
      f.filename === file.filename ? { ...f, genre: newGenre, in_subfolder: !!newGenre, subfolder: newGenre } : f
    ))
    try {
      // Move file on agent
      const res = await fetch(`${AGENT_BASE}/api/move-file`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filename: file.filename, genre: newGenre }),
      })
      if (!res.ok) {
        console.error('Move failed:', await res.text())
        fetchLibrary() // Revert on error
        return
      }
      // Update genre metadata on Heroku (Cloudinary)
      await fetch(`${API_BASE}/api/move-file`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filename: file.filename, genre: newGenre, username: authUser?.name || '' }),
      }).catch(() => {})
    } catch (e) {
      console.error('Failed to move file', e)
      fetchLibrary() // Revert on error
    } finally {
      setMoving(false)
    }
  }

  const handlePlay = (file) => onPlay(file)
  const handlePlayPause = () => onPlayPause()
  const handleStop = () => onStop()

  const startPreviewMode = (startFile) => {
    // Get the current visible list to know the order
    const list = view === 'tracks' ? finalList : filtered
    const startIdx = list.findIndex(f => f.filename === startFile.filename)
    if (startIdx === -1) return
    onStartPreviewMode(startFile, list)
  }

  const stopPreviewMode = () => onStopPreviewMode()

  const handleRate = async (file, newRating) => {
    setFiles(prev => prev.map(f => f.filename === file.filename ? { ...f, rating: newRating } : f))
    try {
      await fetch(`${API_BASE}/api/rate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filename: file.filename, rating: newRating, username: authUser?.name || '' }),
      })
    } catch (e) {
      console.error('Failed to rate', e)
    }
  }

  const handleExport = async () => {
    if (!exportName.trim()) return
    setExporting(true)
    try {
      const filesToExport = finalList.map(f => f.filename)
      const metadata = {}
      finalList.forEach(f => { metadata[f.filename] = { genre: f.genre, key: f.key, bpm: f.bpm, rating: f.rating, artist: f.artist, title: f.title } })
      const res = await fetch(`${AGENT_BASE}/api/export`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: exportName.trim(), files: filesToExport, include_tracks: exportWithTracks, metadata }),
      })
      const data = await res.json()
      if (!exportWithTracks) {
        // Download .m3u directly in browser
        const m3uContent = data.m3u_content
        if (m3uContent) {
          const blob = new Blob([m3uContent], { type: 'audio/x-mpegurl' })
          const url = URL.createObjectURL(blob)
          const a = document.createElement('a')
          a.href = url
          a.download = `${exportName.trim()}.m3u`
          a.click()
          URL.revokeObjectURL(url)
        }
      } else {
        toast(`${data.copied} archivos + playlist exportados`)
      }
      setExportName('')
    } catch (e) {
      console.error('Failed to export', e)
    } finally {
      setExporting(false)
    }
  }

  // Available genres (with counts)
  const availGenres = useMemo(() => {
    const counts = {}
    files.forEach(f => { const g = f.genre || ''; if (g) counts[g] = (counts[g] || 0) + 1 })
    return Object.entries(counts).sort((a, b) => b[1] - a[1]).map(([g, c]) => ({ genre: g, count: c }))
  }, [files])

  // Filter by genre (multi-select)
  const genreFiltered = genreFilter.length === 0 ? files : files.filter(f => genreFilter.includes(f.genre))

  // Filter by search
  const q = search.toLowerCase().trim()
  const searchFiltered = q
    ? genreFiltered.filter(f => (f.title || f.filename).toLowerCase().includes(q) || (f.artist || '').toLowerCase().includes(q) || (f.genre || '').toLowerCase().includes(q))
    : genreFiltered

  // Filter by stars (multi-select)
  const selectedStars = starFilter ? starFilter.split(',').map(Number).filter(n => n > 0) : []
  const starsFiltered = selectedStars.length > 0
    ? searchFiltered.filter(f => selectedStars.includes(f.rating || 0))
    : searchFiltered

  // Duplicate detection - normalize by filename removing track numbers, BPM, extensions
  const normDupe = (filename) => {
    let s = (filename || '').toLowerCase()
    // Remove extension
    s = s.replace(/\.(flac|mp3|wav|aif|aiff|m4a|ogg|aac|wma|opus)$/i, '')
    // Remove leading track numbers: "01 - ", "02.", "14 - "
    s = s.replace(/^\d+[\s\-.]+/, '')
    // Remove parenthesized/bracketed content
    s = s.replace(/[\(\[\{].*?[\)\]\}]/g, '')
    // Remove common mix words
    s = s.replace(/extended|original|remix|mix|feat\.?|ft\.?/gi, '')
    // Remove trailing BPM numbers
    s = s.replace(/\s*\d{2,3}\s*$/, '')
    // Collapse to alphanumeric
    s = s.replace(/[^a-z0-9]/g, '')
    return s
  }
  const FORMAT_SCORE = { FLAC: 100, WAV: 90, AIFF: 85, AIF: 85, MP3: 50, M4A: 40, OGG: 30, AAC: 30, WMA: 10, OPUS: 20 }

  // Score for dupe sorting: prioritize rated > categorized > format > size
  const dupeScore = (f) => {
    return (f.rating || 0) * 100000
      + (f.genre ? 10000 : 0)
      + (f.in_subfolder ? 5000 : 0)
      + (FORMAT_SCORE[f.format] || 0) * 100
      + (f.size_mb || 0)
  }
  const dupeKeys = useMemo(() => {
    const counts = {}
    files.forEach(f => {
      const key = normDupe(f.filename)
      counts[key] = (counts[key] || 0) + 1
    })
    const dupes = new Set()
    files.forEach(f => {
      const key = normDupe(f.filename)
      if (counts[key] > 1) dupes.add(f.filename)
    })
    return dupes
  }, [files])

  // Group duplicates for the Tracks view
  const dupeGroups = useMemo(() => {
    const groups = {}
    files.forEach(f => {
      const key = normDupe(f.filename)
      if (!groups[key]) groups[key] = []
      groups[key].push(f)
    })
    return Object.values(groups)
      .filter(g => g.length > 1)
      .map(g => {
        // Sort: rated > categorized > format > size
        g.sort((a, b) => dupeScore(b) - dupeScore(a))
        // Check if all dupes are identical quality (same format+size)
        const autoClean = g.slice(1).every(d =>
          dupeScore(g[0]) > dupeScore(d)
        )
        return { keep: g[0], dupes: g.slice(1), autoClean }
      })
  }, [files])

  // In tracks view, auto-deduplicate keeping highest rated version
  const deduped = useMemo(() => {
    if (view !== 'tracks') return starsFiltered
    const best = {}
    starsFiltered.forEach(f => {
      const key = normDupe(f.filename)
      const prev = best[key]
      if (!prev) { best[key] = f; return }
      const score = (r) => (r.rating || 0) * 10000 + (FORMAT_SCORE[r.format] || 0) * 100 + (r.size_mb || 0)
      if (score(f) > score(prev)) best[key] = f
    })
    return Object.values(best)
  }, [starsFiltered, view])

  const filtered = showDupes ? starsFiltered.filter(f => dupeKeys.has(f.filename)) : (view === 'tracks' ? deduped : starsFiltered)

  // Group by genre
  const byGenre = {}
  const ungrouped = []
  filtered.forEach(f => {
    if (f.genre) {
      if (!byGenre[f.genre]) byGenre[f.genre] = []
      byGenre[f.genre].push(f)
    } else {
      ungrouped.push(f)
    }
  })
  const genres = Object.keys(byGenre).sort((a, b) => byGenre[b].length - byGenre[a].length)

  // All genres from unfiltered files (for context menu)
  const ALL_GENRE_OPTIONS = [
    'Tech House', 'Deep House', 'Melodic House', 'Progressive House', 'Minimal Tech', 'Afro House',
    'Melodic Techno', 'Peak Time Techno', 'Hard Techno', 'Raw Techno',
    'Trance', 'Progressive Trance', 'Psy Trance',
    'Drum & Bass', 'Breaks', 'Electro', 'Downtempo', 'Indie Dance', 'Nu Disco',
    'Pop', 'Hip Hop', 'R&B', 'Rock', 'Other',
  ]

  const allGenres = useMemo(() => {
    const existing = new Set()
    files.forEach(f => { if (f.genre) existing.add(f.genre) })
    // Start with all predefined genres, then add any custom genres from files
    const merged = [...ALL_GENRE_OPTIONS]
    existing.forEach(g => { if (!merged.includes(g)) merged.push(g) })
    return merged
  }, [files])

  // Flat list with dynamic sorting for "Join" view
  const toggleSort = (col) => {
    if (sortCol === col) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortCol(col); setSortDir(col === 'date' ? 'desc' : 'asc') }
  }
  const SortArrow = ({ col }) => sortCol !== col ? null : <span className="ml-0.5">{sortDir === 'asc' ? '▲' : '▼'}</span>

  const finalList = [...genres.flatMap(g => byGenre[g]), ...ungrouped].sort((a, b) => {
    const dir = sortDir === 'asc' ? 1 : -1
    switch (sortCol) {
      case 'title': return dir * (a.title || a.filename || '').localeCompare(b.title || b.filename || '')
      case 'artist': return dir * (a.artist || '').localeCompare(b.artist || '')
      case 'genre': return dir * (a.genre || '').localeCompare(b.genre || '')
      case 'key': return dir * (a.key || '').localeCompare(b.key || '')
      case 'rating': return dir * ((a.rating || 0) - (b.rating || 0))
      case 'format': return dir * (a.format || '').localeCompare(b.format || '')
      case 'size': return dir * ((a.size_mb || 0) - (b.size_mb || 0))
      case 'date': return dir * (a.date || '').localeCompare(b.date || '')
      default: return 0
    }
  })

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center text-gray-500">
        Cargando biblioteca...
      </div>
    )
  }

  return (
    <div className="flex-1 flex flex-col min-h-0">
      {/* Toolbar */}
      <div className="flex-shrink-0 flex items-center gap-3 px-5 py-3 bg-[var(--bg-panel)] border-b border-[var(--border-color)]">
        <div className="flex items-center gap-2 flex-shrink-0">
          <span className="text-lg font-bold text-[var(--text-primary)]">{filtered.length}</span>
          <span className="text-sm text-gray-500">{q || selectedStars.length > 0 || genreFilter.length > 0 ? `/ ${files.length}` : 'tracks'}</span>
        </div>

        {/* View toggle */}
        <div className="flex gap-1 flex-shrink-0">
          {['cards', 'list', 'tracks'].map(v => (
            <button
              key={v}
              onClick={() => setView(v)}
              className={`px-3 py-1.5 rounded-lg text-sm ${
                view === v ? 'btn-accent font-semibold' : 'btn-ghost'
              }`}
            >
              {v === 'cards' ? 'Cards' : v === 'list' ? 'Join' : 'Tracks'}
            </button>
          ))}
        </div>

        {/* Star filter (multi-select) */}
        <div className="flex items-center gap-1 flex-shrink-0">
          <button
            onClick={() => setStarFilter('0')}
            className={`px-2 py-1 rounded text-xs transition-all duration-200 ${
              selectedStars.length === 0 ? 'bg-[var(--color-accent)]/20 text-[var(--text-primary)] font-bold' : 'text-gray-500 hover:text-gray-300'
            }`}
          >All</button>
          {[1, 2, 3, 4, 5].map(s => {
            const active = selectedStars.includes(s)
            return (
              <button
                key={s}
                onClick={() => {
                  const next = active ? selectedStars.filter(x => x !== s) : [...selectedStars, s]
                  setStarFilter(next.length > 0 ? next.join(',') : '0')
                }}
                className={`px-2 py-1 rounded text-xs transition-all duration-200 ${
                  active ? 'bg-[var(--color-accent)]/20 text-[var(--text-primary)] font-bold' : 'text-gray-500 hover:text-gray-300'
                }`}
              >
                {'★'.repeat(s)}
              </button>
            )
          })}
        </div>

        {view === 'tracks' && dupeGroups.length > 0 && (
          <button
            onClick={async () => {
              if (!showDupes) {
                setShowDupes(true)
              } else {
                // Second click: auto-delete all inferior dupes
                const toDelete = dupeGroups.flatMap(g => g.dupes.map(d => d.filename))
                await fetch(`${AGENT_BASE}/api/delete-dupes`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ filenames: toDelete }) })
                fetchLibrary()
                setShowDupes(false)
              }
            }}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm transition-all duration-200 active:scale-95 flex-shrink-0 ${
              showDupes ? 'bg-red-600 text-[var(--text-primary)] font-semibold' : 'bg-red-900/50 hover:bg-red-800 text-red-300'
            }`}
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
            </svg>
            {showDupes ? `Limpiar duplicados (${dupeGroups.reduce((s, g) => s + g.dupes.length, 0)})` : `Duplicados (${dupeGroups.length})`}
          </button>
        )}

        {ungrouped.length > 0 && (
          <button
            onClick={classifyWithAI}
            disabled={classifying}
            className="flex items-center gap-1.5 px-3 py-1.5 disabled:opacity-50 rounded-lg text-sm text-[var(--color-accent-text)] transition-all duration-200 active:scale-95 flex-shrink-0"
            style={{ background: 'var(--color-accent)' }}
          >
            {classifying ? (
              <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
            ) : (
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
              </svg>
            )}
            {classifying ? 'Clasificando...' : `Clasificar (${ungrouped.length})`}
          </button>
        )}
        {files.some(f => !f.in_subfolder && f.genre) && (
          <button
            onClick={organizeAll}
            disabled={organizing}
            className="flex items-center gap-1.5 px-3 py-1.5 disabled:opacity-50 rounded-lg text-sm text-[var(--color-accent-text)] transition-all duration-200 active:scale-95 flex-shrink-0"
            style={{ background: 'var(--color-accent)' }}
          >
            {organizing ? (
              <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
            ) : (
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
              </svg>
            )}
            {organizing ? 'Organizando...' : 'Organizar'}
          </button>
        )}
        {files.some(f => !f.key) && (
          <button
            onClick={detectKeys}
            disabled={detectingKeys}
            className="flex items-center gap-1.5 px-3 py-1.5 disabled:opacity-50 rounded-lg text-sm text-[var(--color-accent-text)] transition-all duration-200 active:scale-95 flex-shrink-0"
            style={{ background: 'var(--color-accent)' }}
          >
            {detectingKeys ? (
              <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
            ) : (
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2z" />
              </svg>
            )}
            {detectingKeys ? 'Detectando...' : `Keys (${files.filter(f => !f.key).length})`}
          </button>
        )}

        {dupeKeys.size > 0 && (
          <div className="flex items-center gap-1 flex-shrink-0">
            <button
              onClick={() => setShowDupes(d => !d)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-l-lg text-sm transition-all duration-200 active:scale-95 ${
                showDupes ? 'bg-red-600 text-[var(--text-primary)] font-semibold' : 'bg-red-900/50 hover:bg-red-800 text-red-300'
              }`}
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
              </svg>
              Duplicados ({dupeKeys.size})
            </button>
            <button
              onClick={deleteDupes}
              disabled={deletingDupes}
              className="px-2 py-1.5 bg-red-700 hover:bg-red-600 disabled:opacity-50 rounded-r-lg text-sm text-[var(--text-primary)] transition-all duration-200 active:scale-95"
              title="Borrar duplicados (mantiene mejor rating/calidad)"
            >
              {deletingDupes ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : '✕'}
            </button>
          </div>
        )}

        {/* Search */}
        <div className="relative flex-1 min-w-24 ml-auto">
          <svg className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-500 pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Buscar..."
            className="w-full pl-7 pr-2 py-1.5 bg-[var(--bg-input)] border border-gray-700 rounded-lg text-xs text-[var(--text-primary)] placeholder-gray-500 focus:outline-none focus:border-[var(--color-accent)] transition-colors"
          />
        </div>
        <div className="flex items-center gap-1 ml-auto flex-shrink-0">
          {(moving || organizing) && <span className="text-xs text-yellow-400 animate-pulse mr-2">{organizing ? 'Organizando...' : 'Moviendo...'}</span>}
          <button
            onClick={() => openFolder('')}
            className="p-2 rounded-lg text-gray-400 hover:bg-gray-700 hover:text-[var(--text-primary,white)] transition-all duration-200 active:scale-95"
            title="Abrir carpeta"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 19a2 2 0 01-2-2V7a2 2 0 012-2h4l2 2h4a2 2 0 012 2v1M5 19h14a2 2 0 002-2v-5a2 2 0 00-2-2H9a2 2 0 00-2 2v5a2 2 0 01-2 2z" />
            </svg>
          </button>
          <button
            onClick={fetchLibrary}
            className="p-2 rounded-lg text-gray-400 hover:bg-gray-700 hover:text-[var(--text-primary,white)] transition-all duration-200 active:scale-95"
            title="Refrescar"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
          </button>
        </div>
      </div>

      {/* Genre filter pills */}
      {availGenres.length > 1 && (
        <div className="flex-shrink-0 flex items-center gap-1 px-5 py-2 bg-[var(--bg-panel)] border-b border-[var(--border-color)] flex-wrap">
          <button
            onClick={() => setGenreFilter([])}
            className={`px-2.5 py-1 rounded-full text-xs ${
              genreFilter.length === 0 ? 'btn-accent font-semibold' : 'btn-ghost'
            }`}
          >
            All
          </button>
          {availGenres.map(({ genre, count }) => {
            const active = genreFilter.includes(genre)
            const gIdx = genres.indexOf(genre)
            const gColor = GENRE_COLORS[(gIdx >= 0 ? gIdx : availGenres.findIndex(g => g.genre === genre)) % GENRE_COLORS.length]
            return (
              <button
                key={genre}
                onClick={() => setGenreFilter(prev =>
                  active ? prev.filter(g => g !== genre) : [...prev, genre]
                )}
                className={`px-2.5 py-1 rounded-full text-xs font-medium transition-all duration-200`}
                style={{
                  background: active ? `rgba(${gColor.rgb}, 0.3)` : `rgba(${gColor.rgb}, 0.08)`,
                  color: active ? `rgb(${gColor.rgb})` : `rgba(${gColor.rgb}, 0.6)`,
                  boxShadow: active ? `0 0 0 1.5px rgba(${gColor.rgb}, 0.5), 0 0 8px rgba(${gColor.rgb}, 0.15)` : 'none',
                  fontWeight: active ? 600 : 500,
                }}
              >
                <span className="inline-block w-1.5 h-1.5 rounded-full mr-1.5" style={{background: `rgb(${gColor.rgb})`}} />
                {genre} ({count})
              </button>
            )
          })}
        </div>
      )}

      {/* Content */}
      {files.length === 0 ? (
        <div className="flex-1 flex items-center justify-center text-gray-600">
          <p>No hay archivos descargados</p>
        </div>
      ) : view === 'tracks' && showDupes ? (
        /* Duplicates view */
        <div className="flex-1 min-h-0 overflow-y-auto p-4 space-y-3">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-3">
              <button
                onClick={() => setShowDupes(false)}
                className="p-1.5 rounded-lg text-gray-400 hover:text-[var(--text-primary,white)] hover:bg-gray-700 transition-all duration-200"
                title="Volver"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
              </button>
              <div>
                <div className="text-sm font-semibold text-[var(--text-primary)]">Duplicados</div>
                <div className="text-xs text-gray-500">{dupeGroups.length} grupos, {dupeGroups.reduce((s, g) => s + g.dupes.length, 0)} a eliminar</div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={async () => {
                  const toDelete = dupeGroups.flatMap(g => g.dupes.map(d => d.filename))
                  await fetch(`${AGENT_BASE}/api/delete-dupes`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ filenames: toDelete }) })
                  fetchLibrary()
                  setShowDupes(false)
                }}
                className="px-3 py-1.5 bg-red-600 hover:bg-red-500 text-sm rounded-lg text-[var(--text-primary)] transition-all duration-200 active:scale-95"
              >
                Limpiar todos ({dupeGroups.reduce((s, g) => s + g.dupes.length, 0)})
              </button>
            </div>
          </div>
          <div className="text-xs text-gray-600 px-1">Se mantiene el de mayor rating, con género asignado, mejor formato y mayor tamaño. Click derecho para borrar manualmente.</div>
          {dupeGroups.map((group, gi) => (
              <div key={gi} className="bg-[var(--bg-panel)] rounded-xl border border-[var(--border-color)] overflow-hidden">
                <div className="px-4 py-2 bg-[var(--bg-surface)] border-b border-[var(--border-color)] flex items-center gap-2">
                  <svg className="w-4 h-4 text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                  </svg>
                  <span className="text-sm font-semibold text-[var(--text-primary)] truncate">{group.keep.artist ? `${group.keep.artist} - ` : ''}{group.keep.title || group.keep.filename}</span>
                  <span className="text-xs text-gray-500 flex-shrink-0">{1 + group.dupes.length} versiones</span>
                </div>
                {[group.keep, ...group.dupes].map((f, fi) => {
                  const isBest = fi === 0
                  const isPlaying = playingFile === f.filename
                  // Build "why keep" tags
                  const keepReasons = []
                  if (isBest) {
                    if (f.rating) keepReasons.push(`★${f.rating}`)
                    if (f.genre) keepReasons.push(f.genre)
                    if (FORMAT_SCORE[f.format] >= 85) keepReasons.push(f.format)
                  }
                  return (
                    <div
                      key={f.filename}
                      onContextMenu={(e) => {
                        if (isBest) return
                        e.preventDefault()
                        if (confirm(`Borrar "${f.filename}"?`)) {
                          fetch(`${AGENT_BASE}/api/delete-dupes`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ filenames: [f.filename] }) })
                            .then(() => fetchLibrary())
                        }
                      }}
                      className={`flex items-center gap-3 px-4 py-2 border-b border-[var(--border-color)]/30 last:border-b-0 ${
                        isBest ? 'bg-green-500/5' : 'bg-red-500/5 hover:bg-red-500/10'
                      }`}
                    >
                      <PlayPauseBtn isPlaying={isPlaying} onClick={() => handlePlay(f)} />
                      <div className="flex-1 min-w-0">
                        <div className={`text-sm truncate ${isPlaying ? 'font-medium text-[var(--color-accent)]' : isBest ? 'text-[var(--text-primary)]' : 'text-gray-400'}`}>
                          {f.filename}
                        </div>
                        <div className="flex items-center gap-2 mt-0.5 text-xs text-gray-500">
                          <span className={`font-medium ${isBest ? 'text-green-400' : 'text-red-400/70'}`}>{f.format}</span>
                          <span>{f.size_mb} MB</span>
                          {f.genre && <span className="text-purple-400">{f.genre}</span>}
                          {f.in_subfolder && <span className="text-cyan-400/60">en carpeta</span>}
                        </div>
                      </div>
                      <span className={`w-14 flex-shrink-0 text-center text-xs font-mono ${f.key ? 'text-amber-400' : 'text-gray-700'}`}>{f.key || '-'}</span>
                      <div className="flex-shrink-0">
                        <StarRating rating={f.rating || 0} onRate={(r) => handleRate(f, r)} />
                      </div>
                      {isBest ? (
                        <span className="flex-shrink-0 px-2 py-0.5 bg-green-500/20 text-green-400 text-xs rounded font-medium text-center" title={keepReasons.join(' · ')}>
                          Mantener
                        </span>
                      ) : (
                        <button
                          onClick={async () => {
                            await fetch(`${AGENT_BASE}/api/delete-dupes`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ filenames: [f.filename] }) })
                            fetchLibrary()
                          }}
                          className="flex-shrink-0 px-2 py-0.5 bg-red-500/20 text-red-400 text-xs rounded font-medium hover:bg-red-500/40 transition-all duration-200 active:scale-95 text-center"
                        >
                          Borrar
                        </button>
                      )}
                    </div>
                  )
                })}
              </div>
          ))}
        </div>
      ) : view === 'tracks' ? (
        /* Tracks view - flat table by rating only */
        <div className="flex-1 min-h-0 flex flex-col">
          {/* Table header */}
          <div className="flex-shrink-0 flex items-center gap-2 px-4 py-2 bg-[var(--bg-surface)] border-b border-[var(--border-color)] text-xs text-gray-500 uppercase tracking-wider select-none">
            <span className="w-8 text-center">#</span>
            <span className="w-8"></span>
            <button onClick={() => toggleSort('artist')} className={`flex-1 min-w-0 text-left hover:text-[var(--text-primary,white)] transition-colors ${sortCol === 'artist' ? 'text-[var(--color-accent)]' : ''}`}>Artista - Título<SortArrow col="artist" /></button>
            <button onClick={() => toggleSort('genre')} className={`w-32 flex-shrink-0 text-left hover:text-[var(--text-primary,white)] transition-colors ${sortCol === 'genre' ? 'text-[var(--color-accent)]' : ''}`}>Género<SortArrow col="genre" /></button>
            <button onClick={() => toggleSort('key')} className={`w-14 flex-shrink-0 text-center hover:text-[var(--text-primary,white)] transition-colors ${sortCol === 'key' ? 'text-[var(--color-accent)]' : ''}`}>Key<SortArrow col="key" /></button>
            <button onClick={() => toggleSort('rating')} className={`w-24 flex-shrink-0 text-center hover:text-[var(--text-primary,white)] transition-colors ${sortCol === 'rating' ? 'text-[var(--color-accent)]' : ''}`}>Rating<SortArrow col="rating" /></button>
            <button onClick={() => toggleSort('date')} className={`w-20 flex-shrink-0 text-center hover:text-[var(--text-primary,white)] transition-colors ${sortCol === 'date' ? 'text-[var(--color-accent)]' : ''}`}>Fecha<SortArrow col="date" /></button>
          </div>

          {/* Table rows */}
          <div className="flex-1 min-h-0 overflow-y-auto">
            {finalList.map((f, i) => {
              const isPlaying = playingFile === f.filename
              return (
                <div
                  key={`${f.filename}-${i}`}
                  onDoubleClick={() => handlePlay(f)}
                  onContextMenu={(e) => handleContextMenu(e, f)}
                  className={`flex items-center gap-2 px-4 py-1.5 border-b border-[var(--border-color)]/50 transition-colors hover:bg-[var(--bg-hover)] cursor-default ${
                    isPlaying ? 'bg-white/5' : ''
                  }`}
                >
                  <span className="w-8 text-center text-xs text-gray-600">{i + 1}</span>
                  <PlayPauseBtn isPlaying={isPlaying} onClick={() => handlePlay(f)} />
                  <div className="flex-1 min-w-0 flex items-center gap-1">
                    <div className={`text-sm truncate ${isPlaying ? 'font-medium text-[var(--color-accent)]' : 'text-[var(--text-primary)]'}`}>
                      {f.artist ? `${f.artist} - ` : ''}{f.title || f.filename}
                    </div>
                    <a href={`https://www.youtube.com/results?search_query=${encodeURIComponent((f.artist || '') + ' ' + (f.title || f.filename))}`} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()} className="flex-shrink-0 text-gray-700 hover:text-red-500 transition-colors" title="YouTube">
                      <svg className="w-3 h-3" viewBox="0 0 24 24" fill="currentColor"><path d="M23.5 6.2a3 3 0 00-2.1-2.1C19.5 3.5 12 3.5 12 3.5s-7.5 0-9.4.6A3 3 0 00.5 6.2 31.5 31.5 0 000 12a31.5 31.5 0 00.5 5.8 3 3 0 002.1 2.1c1.9.6 9.4.6 9.4.6s7.5 0 9.4-.6a3 3 0 002.1-2.1A31.5 31.5 0 0024 12a31.5 31.5 0 00-.5-5.8zM9.6 15.5V8.5l6.4 3.5-6.4 3.5z"/></svg>
                    </a>
                  </div>
                  <span className="w-32 flex-shrink-0 text-xs text-gray-500 truncate">{f.genre || '-'}</span>
                  <span className={`w-14 flex-shrink-0 text-center text-xs font-mono ${f.key ? 'text-amber-400' : 'text-gray-700'}`}>{f.key || '-'}</span>
                  <div className="w-24 flex-shrink-0 flex justify-center">
                    <StarRating rating={f.rating || 0} onRate={(r) => handleRate(f, r)} />
                  </div>
                  <span className="w-20 flex-shrink-0 text-center text-xs text-gray-600">{f.date ? new Date(f.date).toLocaleDateString('es-AR', { day: '2-digit', month: 'short' }) : '-'}</span>
                </div>
              )
            })}
          </div>

          {/* Export bar */}
          <div className="flex-shrink-0 flex items-center gap-3 px-4 py-2.5 bg-[var(--bg-panel)] border-t border-[var(--border-color)]">
            <span className="text-sm text-gray-400 flex-shrink-0">{finalList.length} tracks</span>
            <input
              value={exportName}
              onChange={e => setExportName(e.target.value)}
              placeholder="Nombre del set..."
              className="flex-1 max-w-xs px-3 py-1.5 bg-[var(--bg-input)] border border-gray-700 rounded-lg text-sm text-[var(--text-primary)] placeholder-gray-500 focus:outline-none focus:border-[var(--color-accent)] transition-colors"
              onKeyDown={e => e.key === 'Enter' && handleExport()}
            />
            <label className="flex items-center gap-1.5 cursor-pointer flex-shrink-0" title="Incluir copia de archivos">
              <div
                onClick={() => setExportWithTracks(v => !v)}
                className={`w-8 h-4 rounded-full transition-colors duration-200 ${exportWithTracks ? 'bg-[var(--color-accent)]' : 'bg-gray-600'}`}
              >
                <div className={`w-4 h-4 rounded-full bg-white shadow transition-transform duration-200 ${exportWithTracks ? 'translate-x-4' : 'translate-x-0'}`} />
              </div>
              <span className="text-xs text-gray-400">+ Tracks</span>
            </label>
            <button
              onClick={handleExport}
              disabled={!exportName.trim() || exporting || finalList.length === 0}
              className="flex items-center gap-1.5 px-4 py-1.5 disabled:opacity-40 rounded-lg text-sm text-[var(--color-accent-text)] font-medium transition-all duration-200 active:scale-95 flex-shrink-0"
              style={{ background: 'var(--color-accent)' }}
            >
              {exporting ? (
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              ) : (
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
              )}
              {exporting ? 'Exportando...' : 'Exportar'}
            </button>
          </div>
        </div>
      ) : (view === 'cards' && !q) ? (
        /* Genre grid (cards view) */
        <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden p-4">
          <div className="grid grid-cols-3 gap-3 items-start auto-rows-min">
            {genres.map((g, i) => {
              const c = GENRE_COLORS[i % GENRE_COLORS.length]
              return (
                <GenreCard
                  key={g}
                  genre={g}
                  files={byGenre[g]}
                  onDrop={moveFile}
                  onOpenFolder={openFolder}
                  onDownloadZip={downloadGenreZip}
                  color={c.bg}
                  colorRgb={c.rgb}
                  expanded={expanded[g] !== false}
                  onToggle={() => setExpanded(p => ({ ...p, [g]: !p[g] }))}
                  playingFile={playingFile}
                  onPlay={handlePlay}
                  onContextMenu={handleContextMenu}
                />
              )
            })}
            {ungrouped.length > 0 && (
              <GenreCard
                genre=""
                files={ungrouped}
                onDrop={moveFile}
                onOpenFolder={openFolder}
                color="bg-gray-500"
                colorRgb="148,163,184"
                expanded={expanded[''] !== false}
                onToggle={() => setExpanded(p => ({ ...p, '': !p[''] }))}
                playingFile={playingFile}
                onPlay={handlePlay}
                onContextMenu={handleContextMenu}
              />
            )}
          </div>
        </div>
      ) : (
        /* Join view - flat table */
        <div className="flex-1 min-h-0 flex flex-col">
          {/* Table header */}
          <div className="flex-shrink-0 flex items-center gap-2 px-4 py-2 bg-[var(--bg-surface)] border-b border-[var(--border-color)] text-xs text-gray-500 uppercase tracking-wider select-none">
            <span className="w-8 text-center">#</span>
            <span className="w-8"></span>
            <button onClick={() => toggleSort('title')} className={`flex-1 min-w-0 text-left hover:text-[var(--text-primary,white)] transition-colors ${sortCol === 'title' ? 'text-[var(--color-accent)]' : ''}`}>Título<SortArrow col="title" /></button>
            <button onClick={() => toggleSort('artist')} className={`w-36 flex-shrink-0 text-left hover:text-[var(--text-primary,white)] transition-colors ${sortCol === 'artist' ? 'text-[var(--color-accent)]' : ''}`}>Artista<SortArrow col="artist" /></button>
            <button onClick={() => toggleSort('genre')} className={`w-32 flex-shrink-0 text-left hover:text-[var(--text-primary,white)] transition-colors ${sortCol === 'genre' ? 'text-[var(--color-accent)]' : ''}`}>Género<SortArrow col="genre" /></button>
            <button onClick={() => toggleSort('key')} className={`w-14 flex-shrink-0 text-center hover:text-[var(--text-primary,white)] transition-colors ${sortCol === 'key' ? 'text-[var(--color-accent)]' : ''}`}>Key<SortArrow col="key" /></button>
            <button onClick={() => toggleSort('rating')} className={`w-24 flex-shrink-0 text-center hover:text-[var(--text-primary,white)] transition-colors ${sortCol === 'rating' ? 'text-[var(--color-accent)]' : ''}`}>Rating<SortArrow col="rating" /></button>
            <button onClick={() => toggleSort('date')} className={`w-20 flex-shrink-0 text-center hover:text-[var(--text-primary,white)] transition-colors ${sortCol === 'date' ? 'text-[var(--color-accent)]' : ''}`}>Added<SortArrow col="date" /></button>
            <button onClick={() => toggleSort('format')} className={`w-12 flex-shrink-0 text-center hover:text-[var(--text-primary,white)] transition-colors ${sortCol === 'format' ? 'text-[var(--color-accent)]' : ''}`}>Fmt<SortArrow col="format" /></button>
            <button onClick={() => toggleSort('size')} className={`w-14 flex-shrink-0 text-right hover:text-[var(--text-primary,white)] transition-colors ${sortCol === 'size' ? 'text-[var(--color-accent)]' : ''}`}>MB<SortArrow col="size" /></button>
          </div>

          {/* Table rows */}
          <div className="flex-1 min-h-0 overflow-y-auto">
            {(() => {
              let lastGenre = null
              let idx = 0
              return finalList.map((f, i) => {
                const isPlaying = playingFile === f.filename
                const showGenreHeader = f.genre !== lastGenre
                lastGenre = f.genre
                idx++
                return (
                  <div key={`${f.filename}-${i}`}>
                    {showGenreHeader && (
                      <div className="sticky top-0 z-10 flex items-center gap-2 px-4 py-1.5 bg-[var(--bg-genre-header)] border-b border-[var(--border-color)]">
                        <div className={`w-2.5 h-2.5 rounded-full ${GENRE_COLORS[genres.indexOf(f.genre || '') % GENRE_COLORS.length]?.bg || 'bg-gray-500'}`} />
                        <span className="text-xs font-bold text-[var(--text-primary)]">{f.genre || 'Unsorted'}</span>
                        <span className="text-xs text-gray-600">{byGenre[f.genre]?.length || ungrouped.length} tracks</span>
                      </div>
                    )}
                    <div
                      onDoubleClick={() => handlePlay(f)}
                      onContextMenu={(e) => handleContextMenu(e, f)}
                      className={`flex items-center gap-2 px-4 py-1.5 border-b border-[var(--border-color)]/50 transition-colors hover:bg-[var(--bg-hover)] cursor-default ${
                      isPlaying ? 'bg-white/5' : ''
                    }`}>
                      <span className="w-8 text-center text-xs text-gray-600">{idx}</span>
                      <PlayPauseBtn isPlaying={isPlaying} onClick={() => handlePlay(f)} />
                      <div className="flex-1 min-w-0 flex items-center gap-1">
                        <div className={`text-sm truncate ${isPlaying ? 'font-medium text-[var(--color-accent)]' : 'text-[var(--text-primary)]'}`}>
                          {f.title || f.filename}
                        </div>
                        <a href={`https://www.youtube.com/results?search_query=${encodeURIComponent((f.artist || '') + ' ' + (f.title || f.filename))}`} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()} className="flex-shrink-0 text-gray-700 hover:text-red-500 transition-colors" title="YouTube">
                          <svg className="w-3 h-3" viewBox="0 0 24 24" fill="currentColor"><path d="M23.5 6.2a3 3 0 00-2.1-2.1C19.5 3.5 12 3.5 12 3.5s-7.5 0-9.4.6A3 3 0 00.5 6.2 31.5 31.5 0 000 12a31.5 31.5 0 00.5 5.8 3 3 0 002.1 2.1c1.9.6 9.4.6 9.4.6s7.5 0 9.4-.6a3 3 0 002.1-2.1A31.5 31.5 0 0024 12a31.5 31.5 0 00-.5-5.8zM9.6 15.5V8.5l6.4 3.5-6.4 3.5z"/></svg>
                        </a>
                        <a href={`https://www.beatport.com/search?q=${encodeURIComponent((f.artist || '') + ' ' + (f.title || f.filename))}`} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()} className="flex-shrink-0 text-gray-700 hover:text-green-500 transition-colors" title="Beatport">
                          <svg className="w-3 h-3" viewBox="0 0 24 24" fill="currentColor"><path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.6 0 12 0zm5.3 17.3c-1.4 1.4-3.3 2.2-5.3 2.2s-3.9-.8-5.3-2.2C5.3 15.9 4.5 14 4.5 12s.8-3.9 2.2-5.3C8.1 5.3 10 4.5 12 4.5s3.9.8 5.3 2.2c1.4 1.4 2.2 3.3 2.2 5.3s-.8 3.9-2.2 5.3z"/></svg>
                        </a>
                      </div>
                      <a href={`https://www.beatport.com/search?q=${encodeURIComponent(f.artist || '')}`} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()} className="w-36 flex-shrink-0 text-sm text-gray-400 truncate hover:text-[var(--color-accent)] transition-colors" title="Buscar artista en Beatport">{f.artist}</a>
                      <span className="w-32 flex-shrink-0 text-xs text-gray-500 truncate">{f.genre || '-'}</span>
                      <span className={`w-14 flex-shrink-0 text-center text-xs font-mono ${f.key ? 'text-amber-400' : 'text-gray-700'}`}>{f.key || '-'}</span>
                      <div className="w-24 flex-shrink-0 flex justify-center">
                        <StarRating rating={f.rating || 0} onRate={(r) => handleRate(f, r)} />
                      </div>
                      <span className="w-20 flex-shrink-0 text-center text-xs text-gray-600">{f.date ? new Date(f.date).toLocaleDateString('es-AR', { day: '2-digit', month: 'short' }) : '-'}</span>
                      <span className="w-12 flex-shrink-0 text-center text-xs text-gray-600">{f.format}</span>
                      <span className="w-14 flex-shrink-0 text-right text-xs text-gray-600">{f.size_mb}</span>
                    </div>
                  </div>
                )
              })
            })()}
          </div>

          {/* Export bar */}
          <div className="flex-shrink-0 flex items-center gap-3 px-4 py-2.5 bg-[var(--bg-panel)] border-t border-[var(--border-color)]">
            <span className="text-sm text-gray-400 flex-shrink-0">{finalList.length} tracks en lista</span>
            <input
              value={exportName}
              onChange={e => setExportName(e.target.value)}
              placeholder="Nombre del set..."
              className="flex-1 max-w-xs px-3 py-1.5 bg-[var(--bg-input)] border border-gray-700 rounded-lg text-sm text-[var(--text-primary)] placeholder-gray-500 focus:outline-none focus:border-[var(--color-accent)] transition-colors"
              onKeyDown={e => e.key === 'Enter' && handleExport()}
            />
            <label className="flex items-center gap-1.5 cursor-pointer flex-shrink-0" title="Incluir copia de archivos">
              <div
                onClick={() => setExportWithTracks(v => !v)}
                className={`w-8 h-4 rounded-full transition-colors duration-200 ${exportWithTracks ? 'bg-[var(--color-accent)]' : 'bg-gray-600'}`}
              >
                <div className={`w-4 h-4 rounded-full bg-white shadow transition-transform duration-200 ${exportWithTracks ? 'translate-x-4' : 'translate-x-0'}`} />
              </div>
              <span className="text-xs text-gray-400">+ Tracks</span>
            </label>
            <button
              onClick={handleExport}
              disabled={!exportName.trim() || exporting || finalList.length === 0}
              className="flex items-center gap-1.5 px-4 py-1.5 disabled:opacity-40 rounded-lg text-sm text-[var(--color-accent-text)] font-medium transition-all duration-200 active:scale-95 flex-shrink-0"
              style={{ background: 'var(--color-accent)' }}
            >
              {exporting ? (
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              ) : (
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
              )}
              {exporting ? 'Exportando...' : 'Exportar'}
            </button>
          </div>
        </div>
      )}

      {/* Context menu for genre change */}
      {ctxMenu && (
        <div
          ref={ctxRef}
          className="fixed z-50 bg-[var(--bg-panel)] border border-gray-700 rounded-lg shadow-2xl min-w-56 flex flex-col"
          style={{
            left: Math.min(ctxMenu.x, window.innerWidth - 260),
            top: Math.min(ctxMenu.y, window.innerHeight - 500),
            maxHeight: Math.min(500, window.innerHeight - 40),
          }}
        >
          {/* Header - fixed */}
          <div className="flex-shrink-0 px-3 py-1.5 text-xs text-gray-500 border-b border-[var(--border-color)] truncate">
            <span className="text-gray-300">{ctxMenu.file?.title || ctxMenu.file?.filename}</span>
          </div>

          {/* Genre list - scrollable */}
          <div className="flex-shrink-0 px-3 py-1 text-[10px] text-gray-600 uppercase tracking-wider">Género</div>
          <div className="flex-1 min-h-0 overflow-y-auto border-b border-[var(--border-color)]">
            {allGenres.map(g => (
              <button
                key={g}
                onClick={() => changeGenre(g)}
                className={`w-full text-left px-3 py-1 text-sm transition-colors ${
                  g === ctxMenu.file?.genre ? 'text-[var(--color-accent)] bg-[var(--color-accent)]/10 font-medium' : 'text-gray-300 hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary,white)]'
                }`}
              >
                {g} {g === ctxMenu.file?.genre && '✓'}
              </button>
            ))}
            <button
              onClick={() => changeGenre('')}
              className={`w-full text-left px-3 py-1 text-sm text-gray-400 hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary,white)] transition-colors ${
                !ctxMenu.file?.genre ? 'text-[var(--color-accent)] bg-[var(--color-accent)]/10 font-medium' : ''
              }`}
            >
              Unsorted {!ctxMenu.file?.genre && '✓'}
            </button>
          </div>

          {/* Custom genre input - fixed */}
          <div className="flex-shrink-0 px-2 py-1.5">
            <form onSubmit={(e) => { e.preventDefault(); if (customGenre.trim()) changeGenre(customGenre.trim()) }} className="flex gap-1">
              <input
                value={customGenre}
                onChange={e => setCustomGenre(e.target.value)}
                placeholder="Nuevo género..."
                className="flex-1 min-w-0 px-2 py-1 bg-[var(--bg-input)] border border-gray-700 rounded text-xs text-[var(--text-primary)] placeholder-gray-600 focus:outline-none focus:border-[var(--color-accent)]"
                autoFocus
              />
              <button
                type="submit"
                disabled={!customGenre.trim()}
                className="px-2 py-1 disabled:opacity-40 rounded text-xs text-[var(--color-accent-text)] transition-colors"
                style={{ background: 'var(--color-accent)' }}
              >
                OK
              </button>
            </form>
          </div>

          {/* Rating */}
          <div className="flex-shrink-0 border-t border-[var(--border-color)] px-3 py-2 flex items-center gap-2">
            <span className="text-xs text-[var(--text-secondary)]">Rating:</span>
            <StarRating rating={ctxMenu.file?.rating || 0} onRate={(r) => { handleRate(ctxMenu.file, r); setCtxMenu(null) }} />
          </div>

          {/* Actions - fixed */}
          <div className="flex-shrink-0 border-t border-[var(--border-color)] py-1">
            {onRadio && (
              <button
                onClick={() => { onRadio(ctxMenu.file); setCtxMenu(null) }}
                className="w-full text-left px-3 py-1.5 text-sm text-purple-400 hover:bg-purple-500/10 hover:text-purple-300 transition-colors flex items-center gap-2"
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5.636 18.364a9 9 0 010-12.728m12.728 0a9 9 0 010 12.728m-9.9-2.829a5 5 0 010-7.07m7.072 0a5 5 0 010 7.07M13 12a1 1 0 11-2 0 1 1 0 012 0z" />
                </svg>
                Radio
              </button>
            )}
            <button
              onClick={() => { startPreviewMode(ctxMenu.file); setCtxMenu(null) }}
              className="w-full text-left px-3 py-1.5 text-sm text-[var(--color-accent)] hover:bg-[var(--color-accent)]/10 transition-colors flex items-center gap-2"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              Preview continuo (30s c/u)
            </button>
            <button
              onClick={() => { openFolder(ctxMenu.file?.subfolder || ctxMenu.file?.genre || ''); setCtxMenu(null) }}
              className="w-full text-left px-3 py-1.5 text-sm text-gray-300 hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary,white)] transition-colors flex items-center gap-2"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 19a2 2 0 01-2-2V7a2 2 0 012-2h4l2 2h4a2 2 0 012 2v1M5 19h14a2 2 0 002-2v-5a2 2 0 00-2-2H9a2 2 0 00-2 2v5a2 2 0 01-2 2z" />
              </svg>
              Abrir ubicación
            </button>
            <button
              onClick={() => deleteFile(ctxMenu.file)}
              className="w-full text-left px-3 py-1.5 text-sm text-red-400 hover:bg-red-500/10 hover:text-red-300 transition-colors flex items-center gap-2"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
              Eliminar
            </button>
          </div>
        </div>
      )}

    </div>
  )
})

function SetBuilder({ page, playingFile, onPlay, onPlayPause, onStop, agentConnected, onEditMix, authUser }) {
  const toast = useToast()
  const [minStars, setMinStars] = useState(3)
  const [setSelectedStars, setSetSelectedStars] = useState([])
  const [duration, setDuration] = useState(60)
  const [method, setMethod] = useState('camelot')
  const [setTracks, setSetTracks] = useState([])
  const [generating, setGenerating] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [totalMin, setTotalMin] = useState(0)
  const playing = playingFile
  const [setName, setSetName] = useState('')
  const [dragIdx, setDragIdx] = useState(null)
  const [dragOverIdx, setDragOverIdx] = useState(null)
  const [suggestions, setSuggestions] = useState([])
  const [loadingSuggestions, setLoadingSuggestions] = useState(false)
  const [selectedGenres, setSelectedGenres] = useState([])
  const [availableGenres, setAvailableGenres] = useState([])

  // Fetch genres that have tracks with >= minStars
  useEffect(() => {
    if (page !== 'set') return
    fetch(`${API_BASE}/api/library?user=${encodeURIComponent(authUser?.name || '')}`).then(r => r.json()).then(tracks => {
      const genreCounts = {}
      tracks.forEach(t => {
        if ((setSelectedStars.length > 0 ? setSelectedStars.includes(t.rating || 0) : (t.rating || 0) >= minStars) && t.genre && t.key) {
          genreCounts[t.genre] = (genreCounts[t.genre] || 0) + 1
        }
      })
      const sorted = Object.entries(genreCounts).sort((a, b) => b[1] - a[1]).map(([g, c]) => ({ genre: g, count: c }))
      setAvailableGenres(sorted)
      // Keep only previously selected genres that still exist
      setSelectedGenres(prev => prev.filter(g => genreCounts[g]))
    }).catch(() => {})
  }, [page, minStars, setSelectedStars, authUser])

  const fetchSuggestions = async (currentTracks) => {
    if (!currentTracks.length) return
    setLoadingSuggestions(true)
    try {
      const res = await fetch(`${API_BASE}/api/suggest-tracks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          current: currentTracks.map(t => t.filename),
          min_stars: minStars,
          limit: 8,
          username: authUser?.name || '',
        }),
      })
      const data = await res.json()
      setSuggestions(data.suggestions || [])
    } catch (e) {
      console.error('Failed to fetch suggestions', e)
    } finally {
      setLoadingSuggestions(false)
    }
  }

  const addToSet = (track) => {
    setSetTracks(prev => [...prev, track])
    setTotalMin(prev => prev + 6)
    setSuggestions(prev => prev.filter(s => s.filename !== track.filename))
    // Refresh suggestions with new last track
    fetchSuggestions([...setTracks, track])
  }

  const removeFromSet = (index) => {
    setSetTracks(prev => {
      const next = prev.filter((_, i) => i !== index)
      setTotalMin(next.length * 6)
      if (next.length > 0) fetchSuggestions(next)
      else setSuggestions([])
      return next
    })
  }

  const moveTrack = (from, to) => {
    if (to < 0 || to >= setTracks.length) return
    setSetTracks(prev => {
      const next = [...prev]
      const [moved] = next.splice(from, 1)
      next.splice(to, 0, moved)
      return next
    })
  }

  const generateSet = async (m, overrideStars, overrideDuration) => {
    const useMethod = m || method
    setMethod(useMethod)
    setGenerating(true)
    try {
      const res = await fetch(`${API_BASE}/api/generate-set`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ min_stars: overrideStars ?? minStars, selected_stars: setSelectedStars.length > 0 ? setSelectedStars : undefined, duration: overrideDuration ?? duration, method: useMethod, genres: selectedGenres.length > 0 ? selectedGenres : undefined, username: authUser?.name || '' }),
      })
      const data = await res.json()
      setSetTracks(data.tracks || [])
      setTotalMin(data.total_minutes || 0)
      fetchSuggestions(data.tracks || [])
    } catch (e) {
      console.error('Failed to generate set', e)
    } finally {
      setGenerating(false)
    }
  }

  const handlePlay = (t) => onPlay(t)
  const handlePlayPause = () => onPlayPause()
  const handleStop = () => onStop()

  const [exportWithTracks, setExportWithTracks] = useState(false)
  const exportSet = async () => {
    const name = setName.trim() || `Set ${new Date().toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' }).replace(/\//g, '-')}`
    setExporting(true)
    try {
      const metadata = {}
      setTracks.forEach(t => { metadata[t.filename] = { genre: t.genre, key: t.key, bpm: t.bpm, rating: t.rating, artist: t.artist, title: t.title } })
      const res = await fetch(`${AGENT_BASE}/api/export`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, files: setTracks.map(t => t.filename), include_tracks: exportWithTracks, metadata }),
      })
      const data = await res.json()
      if (!exportWithTracks) {
        const m3uContent = data.m3u_content
        if (m3uContent) {
          const blob = new Blob([m3uContent], { type: 'audio/x-mpegurl' })
          const url = URL.createObjectURL(blob)
          const a = document.createElement('a')
          a.href = url
          a.download = `${name}.m3u`
          a.click()
          URL.revokeObjectURL(url)
        }
      } else {
        toast(`${data.copied} archivos + playlist exportados`)
      }
    } catch (e) {
      console.error('Failed to export set', e)
    } finally {
      setExporting(false)
    }
  }

  if (page !== 'set') return null

  return (
    <div className="flex-1 flex flex-col min-h-0">
      {/* Controls */}
      <div className="flex-shrink-0 flex items-center gap-4 px-6 py-4 bg-[var(--bg-panel)] border-b border-[var(--border-color)] flex-wrap">
        <div className="flex items-center gap-1">
          <button
            onClick={() => { setSetSelectedStars([]); setMinStars(1) }}
            className={`px-2 py-1 rounded text-xs transition-all duration-200 ${
              setSelectedStars.length === 0 ? 'bg-[var(--color-accent)]/20 text-[var(--text-primary)] font-bold' : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
            }`}
          >All</button>
          {[1, 2, 3, 4, 5].map(s => {
            const active = setSelectedStars.includes(s)
            return (
              <button
                key={s}
                onClick={() => {
                  const next = active ? setSelectedStars.filter(x => x !== s) : [...setSelectedStars, s]
                  setSetSelectedStars(next)
                  const newMin = next.length > 0 ? Math.min(...next) : 1
                  setMinStars(newMin)
                }}
                className={`px-2 py-1 rounded text-xs transition-all duration-200 ${
                  active ? 'bg-[var(--color-accent)]/20 text-[var(--text-primary)] font-bold' : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                }`}
              >
                {'★'.repeat(s)}
              </button>
            )
          })}
        </div>
        {availableGenres.length > 0 && (
          <div className="flex items-center gap-1.5 flex-wrap">
            <button
              onClick={() => setSelectedGenres([])}
              className={`px-2.5 py-1 rounded-full text-xs font-medium transition-all duration-200 active:scale-95 ${
                selectedGenres.length === 0 ? 'btn-accent font-semibold' : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
              }`}
            >All</button>
            {availableGenres.map(({ genre, count }, idx) => {
              const active = selectedGenres.includes(genre)
              const gColor = GENRE_COLORS[idx % GENRE_COLORS.length]
              return (
                <button
                  key={genre}
                  onClick={() => setSelectedGenres(prev => active ? prev.filter(g => g !== genre) : [...prev, genre])}
                  className={`px-2.5 py-1 rounded-full text-xs font-medium transition-all duration-200 active:scale-95`}
                  style={{
                    background: active ? `rgba(${gColor.rgb}, 0.25)` : `rgba(${gColor.rgb}, 0.1)`,
                    color: active ? `rgb(${gColor.rgb})` : `rgba(${gColor.rgb}, 0.7)`,
                    boxShadow: active ? `0 0 8px rgba(${gColor.rgb}, 0.15)` : 'none',
                  }}
                >
                  {genre} ({count})
                </button>
              )
            })}
          </div>
        )}

        <div className="flex items-center gap-1.5">
          <span className="text-sm text-gray-400">Duración:</span>
          {[60, 90, 120].map(d => (
            <button
              key={d}
              onClick={() => setDuration(d)}
              className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-all duration-200 ${
                duration === d ? 'font-bold' : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)]'
              }`}
              style={duration === d ? { background: 'color-mix(in srgb, var(--color-accent) 20%, transparent)', color: 'var(--color-accent)' } : {}}
            >
              {d}'
            </button>
          ))}
        </div>
        <div className="flex items-center gap-1.5">
          {[
            { id: 'camelot', label: 'Camelot Greedy', icon: '🎯' },
            { id: 'energy', label: 'Energy Wave', icon: '⚡' },
            { id: 'genre', label: 'Genre Journey', icon: '🎭' },
            { id: 'peak', label: 'Peak Time', icon: '📈' },
          ].map(m => (
            <button
              key={m.id}
              onClick={() => generateSet(m.id)}
              disabled={generating}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium transition-all duration-200 active:scale-95 disabled:opacity-50`}
              style={method === m.id
                ? { background: 'rgba(var(--color-accent-rgb, 59,130,246), 0.25)', color: 'var(--color-accent)' }
                : { background: 'rgba(var(--color-accent-rgb, 59,130,246), 0.08)', color: 'rgba(var(--color-accent-rgb, 59,130,246), 0.6)' }
              }
            >
              {generating && method === m.id ? <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <span>{m.icon}</span>}
              {m.label}
            </button>
          ))}
        </div>
        {setTracks.length > 0 && (
          <>
            <span className="text-sm text-gray-400">
              {setTracks.length} tracks · ~{totalMin} min
            </span>
            <div className="flex items-center gap-2">
              <input
                value={setName}
                onChange={e => setSetName(e.target.value)}
                placeholder="Nombre del set..."
                className="w-40 px-2 py-1 bg-[var(--bg-input)] border border-gray-700 rounded-lg text-sm text-[var(--text-primary)] placeholder-gray-600 focus:outline-none focus:border-green-500"
              />
              <label className="flex items-center gap-1.5 cursor-pointer" title="Incluir copia de archivos + metadata">
                <div
                  onClick={() => setExportWithTracks(v => !v)}
                  className={`w-8 h-4 rounded-full transition-colors duration-200 cursor-pointer ${exportWithTracks ? 'bg-[var(--color-accent)]' : 'bg-gray-600'}`}
                >
                  <div className={`w-4 h-4 rounded-full bg-white shadow transition-transform duration-200 ${exportWithTracks ? 'translate-x-4' : 'translate-x-0'}`} />
                </div>
                <span className="text-xs text-gray-400">+ Tracks</span>
              </label>
              <button
                onClick={exportSet}
                disabled={exporting}
                className="flex items-center gap-1.5 px-3 py-1.5 disabled:opacity-50 rounded-lg text-sm text-[var(--color-accent-text)] transition-all duration-200 active:scale-95"
                style={{ background: 'var(--color-accent)' }}
              >
                {exporting ? <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" /> : (
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                )}
                Exportar
              </button>
              {agentConnected && (
                <button
                  onClick={() => onEditMix(setTracks)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-all duration-200 active:scale-95 bg-purple-600 hover:bg-purple-500 text-white"
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" />
                  </svg>
                  Editar Mix
                </button>
              )}
            </div>
          </>
        )}
      </div>

      {/* Tracklist */}
      <div className="flex-1 min-h-0 overflow-y-auto">
        {setTracks.length === 0 ? (
          <div className="flex items-center justify-center h-full text-gray-600">
            <div className="text-center space-y-2">
              <p className="text-4xl">&#127911;</p>
              <p>Elegí las estrellas mínimas y la duración del set</p>
              <p className="text-sm text-gray-700">Elegí un método: Camelot Greedy · Energy Wave · Genre Journey · Peak Time</p>
            </div>
          </div>
        ) : (
          <div>
            {setTracks.map((t, i) => {
              const isPlaying = playing === t.filename
              return (
                <div
                  key={t.filename}
                  draggable
                  onDragStart={(e) => {
                    const url = getAudioUrl(t, agentConnected)
                    e.dataTransfer.effectAllowed = 'copy'
                    e.dataTransfer.setData('text/uri-list', url)
                    e.dataTransfer.setData('text/plain', url)
                    e.dataTransfer.setData('DownloadURL', `audio/mpeg:${t.filename}:${url}`)
                  }}
                  className={`flex items-center gap-3 px-6 py-3 transition-all duration-150 border-b border-[var(--border-color)]/30 cursor-grab active:cursor-grabbing ${
                    isPlaying ? 'bg-[var(--color-accent)]/5' : 'hover:bg-[var(--bg-hover)]'}`}
                >
                  {/* Move buttons */}
                  <div className="flex flex-col gap-0.5 flex-shrink-0">
                    <button
                      onClick={() => moveTrack(i, i - 1)}
                      disabled={i === 0}
                      className="w-5 h-4 flex items-center justify-center text-gray-700 hover:text-[var(--text-primary,white)] disabled:opacity-20 disabled:hover:text-gray-700 transition-colors"
                    >
                      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 15l7-7 7 7" /></svg>
                    </button>
                    <button
                      onClick={() => moveTrack(i, i + 1)}
                      disabled={i === setTracks.length - 1}
                      className="w-5 h-4 flex items-center justify-center text-gray-700 hover:text-[var(--text-primary,white)] disabled:opacity-20 disabled:hover:text-gray-700 transition-colors"
                    >
                      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M19 9l-7 7-7-7" /></svg>
                    </button>
                  </div>
                  <PlayPauseBtn isPlaying={isPlaying} onClick={() => handlePlay(t)} />
                  <span className="w-6 text-center text-xs text-gray-600 font-mono flex-shrink-0">{i + 1}</span>
                  <div className="flex-1 min-w-0">
                    <div className={`text-sm truncate ${isPlaying ? 'font-medium text-[var(--color-accent)]' : 'text-[var(--text-primary)]'}`}>
                      {t.artist ? `${t.artist} - ` : ''}{t.title || t.filename}
                    </div>
                  </div>
                  <span className="w-24 flex-shrink-0 text-xs text-gray-500 truncate text-center">{t.genre || '-'}</span>
                  <span className={`w-10 flex-shrink-0 text-xs text-center ${
                    t.format === 'FLAC' || t.format === 'flac' ? 'text-purple-400' : 'text-gray-500'
                  }`}>{(t.format || t.filename?.split('.').pop() || '').toUpperCase()}</span>
                  <span className="w-14 flex-shrink-0 text-xs text-gray-500 text-center">{t.size_mb ? `${t.size_mb}MB` : `~${t.duration_est || 6}m`}</span>
                  <span className={`w-20 flex-shrink-0 text-xs font-mono px-2 py-0.5 rounded text-center ${
                    i > 0 && t.camelot === setTracks[i-1].camelot ? 'bg-green-500/20 text-green-400' :
                    'bg-amber-500/20 text-amber-400'
                  }`}>
                    {t.key} · {t.camelot}
                  </span>
                  <span className="w-16 flex-shrink-0 text-xs text-[var(--text-primary)] text-center">{'★'.repeat(t.rating || 0)}</span>
                  <button
                    onClick={() => removeFromSet(i)}
                    className="w-6 h-6 flex items-center justify-center rounded-full text-gray-700 hover:text-red-400 hover:bg-red-500/10 transition-all duration-200 active:scale-95 flex-shrink-0"
                    title="Quitar del set"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              )
            })}
          </div>
        )}

        {/* Suggestions */}
        {setTracks.length > 0 && (
          <div className="flex-shrink-0 border-t border-[var(--border-color)]">
            <div className="flex items-center gap-2 px-6 py-2 bg-[var(--bg-panel)]">
              <svg className="w-4 h-4 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
              </svg>
              <span className="text-sm font-semibold text-[var(--text-primary)]">Sugerencias para extender</span>
              {loadingSuggestions && <div className="w-3.5 h-3.5 border-2 border-[var(--color-accent)] border-t-transparent rounded-full animate-spin" />}
              <span className="text-xs text-[var(--text-muted)]">compatibles con el último track</span>
            </div>
            <div className="max-h-48 overflow-y-auto">
              {suggestions.length === 0 && !loadingSuggestions && (
                <div className="px-6 py-3 text-sm text-gray-600">No hay sugerencias disponibles</div>
              )}
              {suggestions.map((s, i) => {
                const isPlaying = playing === s.filename
                return (
                  <div
                    key={s.filename}
                    onDoubleClick={() => handlePlay(s)}
                    className={`flex items-center gap-3 px-6 py-2 hover:bg-[var(--bg-hover)] transition-colors cursor-default ${isPlaying ? 'bg-white/5' : ''}`}
                  >
                    <PlayPauseBtn isPlaying={isPlaying} onClick={(e) => { e.stopPropagation(); handlePlay(s) }} size="sm" />
                    <div className="flex-1 min-w-0">
                      <div className={`text-sm truncate ${isPlaying ? 'text-[var(--color-accent)]' : 'text-[var(--text-primary)]'}`}>{s.artist ? `${s.artist} - ` : ''}{s.title || s.filename}</div>
                    </div>
                    <span className="w-24 flex-shrink-0 text-xs text-gray-500 truncate text-center">{s.genre || '-'}</span>
                    <span className={`w-10 flex-shrink-0 text-xs text-center ${
                      s.format === 'FLAC' ? 'text-purple-400' : 'text-gray-500'
                    }`}>{(s.format || '').toUpperCase()}</span>
                    <span className="w-14 flex-shrink-0 text-xs text-gray-500 text-center">{s.size_mb ? `${s.size_mb}MB` : '-'}</span>
                    <span className={`w-20 flex-shrink-0 text-xs font-mono px-1.5 py-0.5 rounded text-center ${
                      s.distance <= 1 ? 'bg-green-500/20 text-green-400' : 'bg-amber-500/20 text-amber-400'
                    }`}>
                      {s.key} · {s.camelot}
                    </span>
                    <span className="w-16 flex-shrink-0 text-xs text-[var(--text-primary)] text-center">{'★'.repeat(s.rating)}</span>
                    <button
                      onClick={() => addToSet(s)}
                      className="flex items-center gap-1 px-2 py-1 rounded-lg text-xs text-[var(--color-accent-text)] font-medium transition-all duration-200 active:scale-95 flex-shrink-0"
                      style={{ background: 'var(--color-accent)' }}
                    >
                      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                      </svg>
                      Agregar
                    </button>
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </div>

    </div>
  )
}

function MixEditor({ tracks: initialTracks, onBack, agentConnected }) {
  const toast = useToast()
  const [mixTracks, setMixTracks] = useState([])
  const [loading, setLoading] = useState(true)
  const [pxPerSec, setPxPerSec] = useState(10)
  const [dragging, setDragging] = useState(null) // { index, startX, origStartTime }
  const wasDraggingRef = useRef(false)
  const [exporting, setExporting] = useState(false)
  const [mixName, setMixName] = useState(() => `Mix ${new Date().toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit' }).replace(/\//g, '-')}`)
  const [exportFormat, setExportFormat] = useState('mp3')
  const timelineRef = useRef(null)

  // Preview player state
  const [isPlaying, setIsPlaying] = useState(false)
  const [playhead, setPlayhead] = useState(0) // current time in seconds
  const [volume, setVolume] = useState(1)
  const [muted, setMuted] = useState(false)
  const audioARef = useRef(new Audio())
  const audioBRef = useRef(new Audio())
  const playheadInterval = useRef(null)
  const activeTrackRef = useRef(-1)
  const cursorRef = useRef(null)
  const waveformCache = useRef({}) // { filename: Float32Array of peaks }

  // Build audio URL for a track
  const audioUrl = (track) => {
    const path = track.subfolder
      ? `${encodeURIComponent(track.subfolder)}/${encodeURIComponent(track.filename)}`
      : encodeURIComponent(track.filename)
    return `${AGENT_BASE}/api/audio/${path}`
  }

  // Find which track should be playing at a given time
  const trackAtTime = useCallback((time) => {
    for (let i = mixTracks.length - 1; i >= 0; i--) {
      if (time >= mixTracks[i].startTime) return i
    }
    return 0
  }, [mixTracks])

  // Total mix duration (must be before togglePlay/keyboard effects)
  const totalDuration = useMemo(() => {
    if (mixTracks.length === 0) return 0
    const last = mixTracks[mixTracks.length - 1]
    return last.startTime + last.duration
  }, [mixTracks])

  const timelineWidth = totalDuration * pxPerSec

  // Play/pause toggle
  const togglePlay = useCallback(() => {
    if (isPlaying) {
      // Pause
      audioARef.current.pause()
      audioBRef.current.pause()
      clearInterval(playheadInterval.current)
      setIsPlaying(false)
      return
    }
    // Start playing from playhead position
    setIsPlaying(true)
    const startTime = playhead
    const trackIdx = trackAtTime(startTime)
    const track = mixTracks[trackIdx]
    if (!track) return

    const audioA = audioARef.current
    audioA.src = audioUrl(track)
    audioA.currentTime = startTime - track.startTime
    audioA.volume = volumeRef.current
    audioA.play().catch(() => {})
    activeTrackRef.current = trackIdx

    const startedAt = Date.now() - (startTime * 1000)
    playheadInterval.current = setInterval(() => {
      const now = (Date.now() - startedAt) / 1000
      setPlayhead(now)

      // Check if we need to crossfade to next track
      const currentIdx = activeTrackRef.current
      const currentTrack = mixTracks[currentIdx]
      const nextTrack = mixTracks[currentIdx + 1]

      if (nextTrack) {
        const timeInCurrent = now - currentTrack.startTime
        const fadeOutStart = currentTrack.duration - currentTrack.fadeOut
        if (timeInCurrent >= fadeOutStart && audioBRef.current.paused) {
          // Start next track
          const audioB = audioBRef.current
          audioB.src = audioUrl(nextTrack)
          audioB.currentTime = 0
          audioB.volume = 0
          audioB.play().catch(() => {})
        }
        // Crossfade volumes
        if (timeInCurrent >= fadeOutStart && !audioBRef.current.paused) {
          const fadeProgress = (timeInCurrent - fadeOutStart) / currentTrack.fadeOut
          const mv = volumeRef.current
          audioA.volume = Math.max(0, (1 - fadeProgress) * mv)
          audioBRef.current.volume = Math.min(mv, fadeProgress * mv)
          if (fadeProgress >= 1) {
            // Switch: B becomes A
            audioA.pause()
            audioA.src = audioBRef.current.src
            audioA.currentTime = audioBRef.current.currentTime
            audioA.volume = volumeRef.current
            audioA.play().catch(() => {})
            audioBRef.current.pause()
            audioBRef.current.src = ''
            activeTrackRef.current = currentIdx + 1
          }
        }
      }

      // Check if mix is done
      const lastTrack = mixTracks[mixTracks.length - 1]
      if (now >= lastTrack.startTime + lastTrack.duration) {
        audioA.pause()
        audioBRef.current.pause()
        clearInterval(playheadInterval.current)
        setIsPlaying(false)
        setPlayhead(0)
      }
    }, 50)
  }, [isPlaying, playhead, mixTracks, trackAtTime])

  // Stop and reset
  const stopPlay = useCallback(() => {
    audioARef.current.pause()
    audioBRef.current.pause()
    clearInterval(playheadInterval.current)
    setIsPlaying(false)
    setPlayhead(0)
    activeTrackRef.current = -1
  }, [])

  // Click on timeline to seek (skip if we just finished dragging a track)
  const seekTimeline = useCallback((e) => {
    if (wasDraggingRef.current) {
      wasDraggingRef.current = false
      return
    }
    if (!timelineRef.current) return
    const rect = timelineRef.current.getBoundingClientRect()
    const scrollLeft = timelineRef.current.scrollLeft
    const x = e.clientX - rect.left + scrollLeft
    const time = x / pxPerSec
    setPlayhead(Math.max(0, time))
    if (isPlaying) {
      stopPlay()
      // Will restart from new position on next togglePlay
    }
  }, [pxPerSec, isPlaying, stopPlay])

  // Master volume ref for use in crossfade interval
  const effectiveVolume = muted ? 0 : volume
  const volumeRef = useRef(effectiveVolume)
  volumeRef.current = effectiveVolume
  // Apply volume changes immediately to playing audio
  useEffect(() => {
    const v = muted ? 0 : volume
    if (!isPlaying) return
    // Scale current audio volumes
    audioARef.current.volume = Math.min(1, audioARef.current.volume > 0 ? v : 0)
    if (!audioBRef.current.paused) audioBRef.current.volume = Math.min(1, audioBRef.current.volume > 0 ? v : 0)
  }, [volume, muted, isPlaying])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      audioARef.current.pause()
      audioBRef.current.pause()
      clearInterval(playheadInterval.current)
    }
  }, [])

  // Keyboard: spacebar play/pause, arrows seek
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.target.closest('input, select, textarea')) return
      if (e.code === 'Space') {
        e.preventDefault()
        togglePlay()
      } else if (e.code === 'ArrowRight') {
        e.preventDefault()
        setPlayhead(p => Math.min(totalDuration, p + 5))
      } else if (e.code === 'ArrowLeft') {
        e.preventDefault()
        setPlayhead(p => Math.max(0, p - 5))
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [togglePlay, totalDuration])

  // Auto-scroll to keep cursor visible
  useEffect(() => {
    if (isPlaying && timelineRef.current && cursorRef.current) {
      const container = timelineRef.current
      const cursorX = playhead * pxPerSec
      const viewLeft = container.scrollLeft
      const viewRight = viewLeft + container.clientWidth
      if (cursorX < viewLeft + 50 || cursorX > viewRight - 50) {
        container.scrollLeft = cursorX - container.clientWidth / 3
      }
    }
  }, [playhead, isPlaying, pxPerSec])

  // On mount, fetch durations for all tracks
  useEffect(() => {
    if (!initialTracks || initialTracks.length === 0) { setLoading(false); return }
    let cancelled = false
    const fetchDurations = async () => {
      const results = []
      for (const t of initialTracks) {
        const path = t.subfolder
          ? `${encodeURIComponent(t.subfolder)}/${encodeURIComponent(t.filename)}`
          : encodeURIComponent(t.filename)
        try {
          const res = await fetch(`${AGENT_BASE}/api/track-info/${path}`)
          const info = await res.json()
          results.push({
            ...t,
            duration: info.duration_seconds || 300,
            bpm: t.bpm || info.bpm || null,
          })
        } catch {
          results.push({ ...t, duration: 300 })
        }
      }
      if (cancelled) return
      // Calculate initial layout with 16s crossfade
      const DEFAULT_FADE = 16
      const laid = []
      let cumStart = 0
      for (let i = 0; i < results.length; i++) {
        laid.push({
          ...results[i],
          startTime: cumStart,
          fadeIn: i === 0 ? 0 : DEFAULT_FADE,
          fadeOut: i === results.length - 1 ? 0 : DEFAULT_FADE,
        })
        cumStart += results[i].duration - (i === results.length - 1 ? 0 : DEFAULT_FADE)
      }
      setMixTracks(laid)
      setLoading(false)
    }
    fetchDurations()
    return () => { cancelled = true }
  }, [initialTracks])

  // Format seconds to mm:ss
  const fmtTime = (s) => {
    const m = Math.floor(s / 60)
    const sec = Math.floor(s % 60)
    return `${m}:${sec.toString().padStart(2, '0')}`
  }

  // Get color for track based on genre
  const getTrackColor = (track, idx) => {
    const genres = [...new Set(mixTracks.map(t => t.genre || ''))]
    const gi = genres.indexOf(track.genre || '')
    return GENRE_COLORS[(gi >= 0 ? gi : idx) % GENRE_COLORS.length]
  }

  // Generate waveform peaks for a track
  const generateWaveform = useCallback(async (track) => {
    const key = track.subfolder ? `${track.subfolder}/${track.filename}` : track.filename
    if (waveformCache.current[key]) return waveformCache.current[key]
    try {
      const url = audioUrl(track)
      const response = await fetch(url)
      const arrayBuffer = await response.arrayBuffer()
      const audioCtx = new (window.AudioContext || window.webkitAudioContext)()
      const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer)
      audioCtx.close()
      const channelData = audioBuffer.getChannelData(0)
      const PEAKS = 200
      const blockSize = Math.floor(channelData.length / PEAKS)
      const peaks = new Float32Array(PEAKS)
      for (let i = 0; i < PEAKS; i++) {
        let sum = 0
        const start = i * blockSize
        for (let j = start; j < start + blockSize && j < channelData.length; j++) {
          sum += Math.abs(channelData[j])
        }
        peaks[i] = sum / blockSize
      }
      // Normalize
      const max = Math.max(...peaks) || 1
      for (let i = 0; i < peaks.length; i++) peaks[i] /= max
      waveformCache.current[key] = peaks
      return peaks
    } catch {
      return null
    }
  }, [])

  // Draw waveform on a canvas element
  const drawWaveform = useCallback((canvas, peaks, rgbColor) => {
    if (!canvas || !peaks) return
    const ctx = canvas.getContext('2d')
    const w = canvas.width
    const h = canvas.height
    ctx.clearRect(0, 0, w, h)
    ctx.fillStyle = `rgba(${rgbColor}, 0.4)`
    const barWidth = w / peaks.length
    for (let i = 0; i < peaks.length; i++) {
      const barH = peaks[i] * h * 0.9
      const x = i * barWidth
      const y = (h - barH) / 2
      ctx.fillRect(x, y, Math.max(barWidth - 0.5, 1), barH)
    }
  }, [])

  // Load waveforms for all tracks
  const [waveforms, setWaveforms] = useState({})
  useEffect(() => {
    if (mixTracks.length === 0) return
    let cancelled = false
    const loadAll = async () => {
      for (const track of mixTracks) {
        const key = track.subfolder ? `${track.subfolder}/${track.filename}` : track.filename
        if (waveformCache.current[key]) {
          if (!cancelled) setWaveforms(prev => ({ ...prev, [key]: waveformCache.current[key] }))
          continue
        }
        const peaks = await generateWaveform(track)
        if (!cancelled && peaks) {
          setWaveforms(prev => ({ ...prev, [key]: peaks }))
        }
      }
    }
    loadAll()
    return () => { cancelled = true }
  }, [mixTracks, generateWaveform])

  // Handle drag start
  const handleMouseDown = (e, index) => {
    e.preventDefault()
    setDragging({ index, startX: e.clientX, origStartTime: mixTracks[index].startTime })
  }

  // Handle drag move and end
  useEffect(() => {
    if (!dragging) return
    const handleMouseMove = (e) => {
      const dx = e.clientX - dragging.startX
      const dtSec = dx / pxPerSec
      const newStart = dragging.origStartTime + dtSec

      setMixTracks(prev => {
        const next = [...prev]
        const track = { ...next[dragging.index] }
        const i = dragging.index

        if (i === 0) {
          // First track always starts at 0
          track.startTime = 0
        } else {
          const prevTrack = next[i - 1]
          // Free movement — no limits on overlap
          track.startTime = Math.max(0, newStart)
          // Update fadeIn/fadeOut based on overlap
          const prevEnd = prevTrack.startTime + prevTrack.duration
          const overlap = prevEnd - track.startTime
          track.fadeIn = Math.max(0, Math.round(overlap))
          // Also update previous track fadeOut
          next[i - 1] = { ...prevTrack, fadeOut: Math.max(0, Math.round(overlap)) }
        }
        next[i] = track
        return next
      })
    }
    const handleMouseUp = () => {
      wasDraggingRef.current = true
      setDragging(null)
    }
    window.addEventListener('mousemove', handleMouseMove)
    window.addEventListener('mouseup', handleMouseUp)
    return () => {
      window.removeEventListener('mousemove', handleMouseMove)
      window.removeEventListener('mouseup', handleMouseUp)
    }
  }, [dragging, pxPerSec])

  // Export mix
  const handleExport = async () => {
    if (!agentConnected) { toast('Agent no conectado', 'error'); return }
    setExporting(true)
    try {
      const payload = {
        name: mixName.trim() || 'mix',
        tracks: mixTracks.map(t => ({
          filename: t.filename,
          subfolder: t.subfolder || '',
          start_time: t.startTime,
          duration: t.duration,
          fade_in: t.fadeIn,
          fade_out: t.fadeOut,
        })),
        format: exportFormat,
        bitrate: '320k',
      }
      const res = await fetch(`${AGENT_BASE}/api/mix-export`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const data = await res.json()
      if (data.ok) {
        toast(`Mix exportado: ${fmtTime(data.duration)}`)
      } else {
        toast(data.error || 'Error al exportar', 'error', 5000)
      }
    } catch (e) {
      toast('Error al exportar mix', 'error')
      console.error('Mix export failed', e)
    } finally {
      setExporting(false)
    }
  }

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-3 border-[var(--color-accent)] border-t-transparent rounded-full animate-spin" />
          <span className="text-sm text-[var(--text-muted)]">Analizando tracks...</span>
        </div>
      </div>
    )
  }

  return (
    <div className="flex-1 flex flex-col min-h-0">
      {/* Toolbar */}
      <div className="flex-shrink-0 flex items-center gap-3 px-5 py-3 bg-[var(--bg-panel)] border-b border-[var(--border-color)]">
        <button
          onClick={onBack}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm btn-ghost transition-all duration-200 active:scale-95"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Volver al Set
        </button>

        <div className="w-px h-6 bg-[var(--border-color)]" />

        <span className="text-sm font-bold text-[var(--text-primary)]">Mix Editor</span>
        <span className="text-xs text-[var(--text-muted)]">
          {mixTracks.length} tracks · {fmtTime(totalDuration)}
        </span>

        <div className="w-px h-6 bg-[var(--border-color)]" />

        {/* Play controls */}
        <div className="flex items-center gap-1.5">
          <button
            onClick={stopPlay}
            className="w-7 h-7 flex items-center justify-center rounded-lg btn-ghost transition-all duration-200 active:scale-95"
            title="Stop"
          >
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><rect x="6" y="6" width="12" height="12" rx="1" /></svg>
          </button>
          <button
            onClick={togglePlay}
            className="w-8 h-8 flex items-center justify-center rounded-lg transition-all duration-200 active:scale-95"
            style={{ background: isPlaying ? 'var(--color-accent)' : 'rgba(var(--color-accent-rgb, 59,130,246), 0.2)' }}
            title={isPlaying ? 'Pause' : 'Play'}
          >
            {isPlaying ? (
              <svg className="w-4 h-4 text-white" fill="currentColor" viewBox="0 0 24 24"><rect x="6" y="5" width="4" height="14" rx="1" /><rect x="14" y="5" width="4" height="14" rx="1" /></svg>
            ) : (
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z" /></svg>
            )}
          </button>
          <span className="text-xs text-[var(--text-muted)] w-16 text-center font-mono">{fmtTime(playhead)} / {fmtTime(totalDuration)}</span>
        </div>

        <div className="w-px h-6 bg-[var(--border-color)]" />

        {/* Zoom controls */}
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-[var(--text-muted)]">Zoom</span>
          <button
            onClick={() => setPxPerSec(p => Math.max(2, p - 2))}
            className="w-7 h-7 flex items-center justify-center rounded-lg btn-ghost text-sm font-bold transition-all duration-200 active:scale-95"
          >-</button>
          <span className="text-xs text-[var(--text-muted)] w-8 text-center">{pxPerSec}x</span>
          <button
            onClick={() => setPxPerSec(p => Math.min(50, p + 2))}
            className="w-7 h-7 flex items-center justify-center rounded-lg btn-ghost text-sm font-bold transition-all duration-200 active:scale-95"
          >+</button>
        </div>

        <div className="flex-1" />

        {/* Export controls */}
        <input
          value={mixName}
          onChange={e => setMixName(e.target.value)}
          placeholder="Nombre del mix..."
          className="w-40 px-2 py-1 bg-[var(--bg-input)] border border-gray-700 rounded-lg text-sm text-[var(--text-primary)] placeholder-gray-600 focus:outline-none focus:border-[var(--color-accent)] transition-colors"
        />
        <select
          value={exportFormat}
          onChange={e => setExportFormat(e.target.value)}
          className="px-2 py-1 bg-[var(--bg-input)] border border-gray-700 rounded-lg text-sm text-[var(--text-primary)] focus:outline-none focus:border-[var(--color-accent)] transition-colors"
        >
          <option value="mp3">MP3 320k</option>
          <option value="flac">FLAC</option>
          <option value="wav">WAV</option>
        </select>
        <button
          onClick={handleExport}
          disabled={exporting || mixTracks.length === 0}
          className="flex items-center gap-1.5 px-4 py-1.5 disabled:opacity-50 rounded-lg text-sm font-semibold text-[var(--color-accent-text)] transition-all duration-200 active:scale-95"
          style={{ background: 'var(--color-accent)' }}
        >
          {exporting ? (
            <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
          ) : (
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
          )}
          {exporting ? 'Exportando...' : 'Exportar Mix'}
        </button>
      </div>

      {/* Timeline */}
      <div className="flex-1 min-h-0 overflow-auto" ref={timelineRef} onClick={seekTimeline}>
        <div className="relative min-w-full" style={{ width: Math.max(timelineWidth + 100, 800) }}>
          {/* Playhead cursor */}
          <div
            ref={cursorRef}
            className="absolute top-0 bottom-0 w-0.5 bg-red-500 z-30 pointer-events-none"
            style={{ left: playhead * pxPerSec, transition: isPlaying ? 'none' : 'left 0.1s' }}
          >
            <div
              className="absolute -top-0 -left-2.5 w-5 h-5 bg-red-500 rounded-full border-2 border-red-300 cursor-grab active:cursor-grabbing pointer-events-auto z-40"
              onMouseDown={(e) => {
                e.stopPropagation()
                e.preventDefault()
                const wasPlaying = isPlaying
                if (wasPlaying) { audioARef.current.pause(); audioBRef.current.pause(); clearInterval(playheadInterval.current); setIsPlaying(false) }
                const onMove = (ev) => {
                  if (!timelineRef.current) return
                  const rect = timelineRef.current.getBoundingClientRect()
                  const scrollLeft = timelineRef.current.scrollLeft
                  const x = ev.clientX - rect.left + scrollLeft
                  setPlayhead(Math.max(0, Math.min(totalDuration, x / pxPerSec)))
                }
                const onUp = () => {
                  window.removeEventListener('mousemove', onMove)
                  window.removeEventListener('mouseup', onUp)
                  wasDraggingRef.current = true
                }
                window.addEventListener('mousemove', onMove)
                window.addEventListener('mouseup', onUp)
              }}
            />
          </div>
          {/* Time ruler */}
          <div className="sticky top-0 z-10 h-8 bg-[var(--bg-panel)] border-b border-[var(--border-color)] flex items-end">
            <div className="relative w-full h-full">
              {Array.from({ length: Math.ceil(totalDuration / 30) + 1 }, (_, i) => i * 30).map(sec => (
                <div
                  key={sec}
                  className="absolute bottom-0 flex flex-col items-center"
                  style={{ left: sec * pxPerSec }}
                >
                  <span className="text-[10px] text-[var(--text-muted)] mb-0.5">{fmtTime(sec)}</span>
                  <div className="w-px h-2 bg-[var(--border-color)]" />
                </div>
              ))}
              {/* Minor ticks every 10s */}
              {Array.from({ length: Math.ceil(totalDuration / 10) + 1 }, (_, i) => i * 10).filter(s => s % 30 !== 0).map(sec => (
                <div
                  key={`m${sec}`}
                  className="absolute bottom-0 w-px h-1 bg-[var(--border-color)]/50"
                  style={{ left: sec * pxPerSec }}
                />
              ))}
            </div>
          </div>

          {/* Track lanes - 2 alternating rows */}
          <div className="relative" style={{ height: 2 * 80 + 40 }}>
            {mixTracks.map((track, i) => {
              const color = getTrackColor(track, i)
              const left = track.startTime * pxPerSec
              const width = track.duration * pxPerSec
              const prevTrack = i > 0 ? mixTracks[i - 1] : null
              const overlapSec = prevTrack ? Math.max(0, (prevTrack.startTime + prevTrack.duration) - track.startTime) : 0
              const overlapPx = overlapSec * pxPerSec

              return (
                <div key={`${track.filename}-${i}`}>
                  {/* Track block */}
                  <div
                    className={`absolute rounded-lg border overflow-hidden select-none ${
                      dragging?.index === i ? 'ring-2 ring-white/50 z-20 cursor-grabbing' : 'cursor-grab hover:ring-1 hover:ring-white/20 z-10'
                    }`}
                    style={{
                      left,
                      width: Math.max(width, 40),
                      top: (i % 2) * 80 + 12,
                      height: 56,
                      background: `rgba(${color.rgb}, 0.2)`,
                      borderColor: `rgba(${color.rgb}, 0.4)`,
                    }}
                    onMouseDown={(e) => handleMouseDown(e, i)}
                  >
                    {/* Fade in gradient */}
                    {track.fadeIn > 0 && (
                      <div
                        className="absolute inset-y-0 left-0"
                        style={{
                          width: track.fadeIn * pxPerSec,
                          background: `linear-gradient(to right, transparent, rgba(${color.rgb}, 0.3))`,
                        }}
                      />
                    )}
                    {/* Fade out gradient */}
                    {track.fadeOut > 0 && (
                      <div
                        className="absolute inset-y-0 right-0"
                        style={{
                          width: track.fadeOut * pxPerSec,
                          background: `linear-gradient(to left, transparent, rgba(${color.rgb}, 0.3))`,
                        }}
                      />
                    )}
                    {/* Waveform canvas */}
                    <canvas
                      className="absolute inset-0 w-full h-full pointer-events-none"
                      ref={(el) => {
                        if (!el) return
                        const key = track.subfolder ? `${track.subfolder}/${track.filename}` : track.filename
                        const peaks = waveforms[key]
                        if (peaks) {
                          el.width = el.offsetWidth
                          el.height = el.offsetHeight
                          drawWaveform(el, peaks, color.rgb)
                        }
                      }}
                    />
                    {/* Track info */}
                    <div className="relative z-10 px-3 py-1.5 h-full flex flex-col justify-center min-w-0">
                      <div className="text-xs font-semibold truncate" style={{ color: `rgb(${color.rgb})` }}>
                        {track.title || track.filename}
                      </div>
                      <div className="text-[10px] text-[var(--text-muted)] truncate">
                        {track.artist}{track.bpm ? ` · ${track.bpm} BPM` : ''}{track.key ? ` · ${track.key}` : ''} · {fmtTime(track.duration)}
                      </div>
                    </div>
                  </div>

                  {/* Overlap label */}
                  {overlapSec > 0 && (
                    <div
                      className="absolute z-20 flex items-center justify-center pointer-events-none"
                      style={{
                        left: left,
                        width: overlapPx,
                        top: (i % 2) * 80 + 2,
                        height: 10,
                      }}
                    >
                      <span
                        className="text-[9px] font-bold px-1.5 py-0 rounded-full"
                        style={{ background: `rgba(${color.rgb}, 0.5)`, color: 'white' }}
                      >
                        {Math.round(overlapSec)}s
                      </span>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      </div>

      {/* Track list summary */}
      <div className="flex-shrink-0 max-h-48 overflow-y-auto border-t border-[var(--border-color)] bg-[var(--bg-panel)]">
        {mixTracks.map((t, i) => {
          const color = getTrackColor(t, i)
          const prevTrack = i > 0 ? mixTracks[i - 1] : null
          const overlap = prevTrack ? Math.max(0, (prevTrack.startTime + prevTrack.duration) - t.startTime) : 0
          return (
            <div
              key={`list-${t.filename}-${i}`}
              className="flex items-center gap-3 px-5 py-2 border-b border-[var(--border-color)]/30 hover:bg-[var(--bg-hover)] transition-colors text-sm"
            >
              <span className="w-6 text-center text-xs font-mono flex-shrink-0" style={{ color: `rgb(${color.rgb})` }}>
                {i + 1}
              </span>
              <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: `rgb(${color.rgb})` }} />
              <div className="flex-1 min-w-0">
                <span className="text-[var(--text-primary)] truncate text-xs font-medium">
                  {t.artist ? `${t.artist} - ` : ''}{t.title || t.filename}
                </span>
              </div>
              <span className="text-[10px] text-[var(--text-muted)] flex-shrink-0 w-20 text-center">{t.genre || '-'}</span>
              <span
                className="text-[10px] text-[var(--text-muted)] flex-shrink-0 w-12 text-center cursor-pointer hover:text-[var(--color-accent)] transition-colors"
                title="Doble click para editar BPM"
                onDoubleClick={(e) => {
                  const span = e.currentTarget
                  const current = t.bpm || ''
                  const input = document.createElement('input')
                  input.type = 'number'
                  input.value = current
                  input.className = 'w-12 text-[10px] text-center bg-[var(--bg-input)] border border-[var(--color-accent)] rounded px-1 py-0 outline-none'
                  input.style.cssText = 'width:48px;font-size:10px;text-align:center'
                  span.replaceWith(input)
                  input.focus()
                  input.select()
                  const finish = () => {
                    const val = parseInt(input.value) || null
                    setMixTracks(prev => prev.map((tr, idx) => idx === i ? { ...tr, bpm: val } : tr))
                    input.replaceWith(span)
                  }
                  input.addEventListener('blur', finish)
                  input.addEventListener('keydown', (ev) => { if (ev.key === 'Enter') input.blur() })
                }}
              >{t.bpm || '-'}</span>
              <span className="text-[10px] text-[var(--text-muted)] flex-shrink-0 w-12 text-center">{t.key || '-'}</span>
              <span className="text-[10px] text-[var(--text-muted)] flex-shrink-0 w-14 text-center">{fmtTime(t.duration)}</span>
              <span className="text-[10px] text-[var(--text-muted)] flex-shrink-0 w-14 text-right">@{fmtTime(t.startTime)}</span>
              {overlap > 0 && (
                <span className="text-[10px] font-medium flex-shrink-0 w-16 text-center" style={{ color: `rgb(${color.rgb})` }}>
                  -{Math.round(overlap)}s fade
                </span>
              )}
            </div>
          )
        })}
      </div>

      {/* Bottom transport bar */}
      <div className="flex-shrink-0 h-14 flex items-center gap-3 px-4 bg-[var(--bg-panel)] border-t border-[var(--border-color)]">
        {/* Play/Pause */}
        <button
          onClick={togglePlay}
          className="w-8 h-8 flex items-center justify-center rounded-full transition-all duration-200 active:scale-95 flex-shrink-0"
          style={{ background: isPlaying ? 'var(--color-accent)' : 'rgba(var(--color-accent-rgb, 59,130,246), 0.2)' }}
        >
          {isPlaying ? (
            <svg className="w-3.5 h-3.5 text-white" fill="currentColor" viewBox="0 0 24 24"><rect x="6" y="5" width="4" height="14" rx="1" /><rect x="14" y="5" width="4" height="14" rx="1" /></svg>
          ) : (
            <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z" /></svg>
          )}
        </button>

        {/* Time */}
        <span className="text-xs text-[var(--text-muted)] font-mono flex-shrink-0 w-10">{fmtTime(playhead)}</span>

        {/* Progress bar */}
        <div
          className="flex-1 h-8 relative cursor-pointer rounded overflow-hidden bg-black/20"
          onClick={(e) => {
            const rect = e.currentTarget.getBoundingClientRect()
            const pct = (e.clientX - rect.left) / rect.width
            const newTime = pct * totalDuration
            setPlayhead(Math.max(0, Math.min(totalDuration, newTime)))
            if (isPlaying) { stopPlay() }
          }}
        >
          {/* Track segments background */}
          {mixTracks.map((t, i) => {
            const color = getTrackColor(t, i)
            const startPct = (t.startTime / totalDuration) * 100
            const widthPct = (t.duration / totalDuration) * 100
            return (
              <div
                key={i}
                className="absolute top-0 bottom-0"
                style={{
                  left: `${startPct}%`,
                  width: `${widthPct}%`,
                  background: `rgba(${color.rgb}, 0.15)`,
                  borderRight: i < mixTracks.length - 1 ? '1px solid rgba(255,255,255,0.1)' : 'none',
                }}
              />
            )
          })}
          {/* Progress fill */}
          <div
            className="absolute top-0 bottom-0 left-0 bg-[var(--color-accent)]/30"
            style={{ width: totalDuration > 0 ? `${(playhead / totalDuration) * 100}%` : '0%' }}
          />
          {/* Playhead indicator */}
          <div
            className="absolute top-0 bottom-0 w-0.5 bg-[var(--color-accent)]"
            style={{ left: totalDuration > 0 ? `${(playhead / totalDuration) * 100}%` : '0%' }}
          />
          {/* Track name labels */}
          {mixTracks.map((t, i) => {
            const startPct = (t.startTime / totalDuration) * 100
            const widthPct = (t.duration / totalDuration) * 100
            return widthPct > 3 ? (
              <div
                key={`l${i}`}
                className="absolute top-1 text-[8px] text-white/60 truncate pointer-events-none px-0.5"
                style={{ left: `${startPct}%`, width: `${widthPct}%` }}
              >
                {t.filename.replace(/\.[^.]+$/, '').replace(/^\d+\s*-\s*/, '')}
              </div>
            ) : null
          })}
        </div>

        {/* Time total */}
        <span className="text-xs text-[var(--text-muted)] font-mono flex-shrink-0 w-10">{fmtTime(totalDuration)}</span>

        <div className="w-px h-6 bg-[var(--border-color)]" />

        {/* Volume controls */}
        <button
          onClick={() => setMuted(m => !m)}
          className="w-7 h-7 flex items-center justify-center rounded-lg btn-ghost transition-all duration-200 active:scale-95 flex-shrink-0"
          title={muted ? 'Unmute' : 'Mute'}
        >
          {muted || volume === 0 ? (
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2" />
            </svg>
          ) : volume < 0.5 ? (
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.536 8.464a5 5 0 010 7.072" />
            </svg>
          ) : (
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.536 8.464a5 5 0 010 7.072M18.364 5.636a9 9 0 010 12.728" />
            </svg>
          )}
        </button>
        <input
          type="range"
          min="0"
          max="1"
          step="0.01"
          value={muted ? 0 : volume}
          onChange={(e) => { setVolume(parseFloat(e.target.value)); if (muted) setMuted(false) }}
          className="w-20 h-1 accent-[var(--color-accent)] flex-shrink-0"
        />
      </div>
    </div>
  )
}

function LoginScreen({ onLogin }) {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleLogin = async (e) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const res = await fetch(`${API_BASE}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error || 'Error'); return }
      localStorage.setItem('auth_token', data.token)
      localStorage.setItem('auth_user', JSON.stringify(data))
      onLogin(data)
    } catch {
      setError('No se pudo conectar al servidor')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="h-screen flex items-center justify-center bg-[#0f172a]">
      <div className="w-80">
        <div className="flex items-center justify-center gap-3 mb-8">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center text-lg font-bold" style={{ background: 'var(--color-accent)', color: 'var(--color-accent-text)' }}>S</div>
          <span className="text-2xl font-bold text-white">SoulSeek</span>
        </div>
        <form onSubmit={handleLogin} className="space-y-4">
          <input
            value={username}
            onChange={e => setUsername(e.target.value)}
            placeholder="Usuario"
            autoFocus
            className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:border-[var(--color-accent)] transition-colors"
          />
          <input
            type="password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            placeholder="Contraseña"
            className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:border-[var(--color-accent)] transition-colors"
          />
          {error && <p className="text-red-400 text-sm text-center">{error}</p>}
          <button
            type="submit"
            disabled={loading || !username || !password}
            className="w-full py-3 disabled:opacity-50 rounded-xl font-semibold transition-all duration-200 active:scale-98"
            style={{ background: 'var(--color-accent)', color: 'var(--color-accent-text)' }}
          >
            {loading ? 'Ingresando...' : 'Ingresar'}
          </button>
        </form>
      </div>
    </div>
  )
}

function App() {
  const toast = useToast()
  const [authUser, setAuthUser] = useState(() => {
    const saved = localStorage.getItem('auth_user')
    return saved ? JSON.parse(saved) : null
  })
  const [page, setPage] = useQS('page', 'discover')
  const [pendingRadioTrack, setPendingRadioTrack] = useState(null)
  const [theme, setTheme] = useState(() => localStorage.getItem('theme') || 'dark')
  const [accentColor, setAccentColor] = useState(() => localStorage.getItem('accent_color') || '#3b82f6')
  const [accentOpacity, setAccentOpacity] = useState(() => parseFloat(localStorage.getItem('accent_opacity') || '1'))

  // Determine if accent color is dark (needs white text) or light (needs black text)
  const accentTextColor = useMemo(() => {
    const hex = accentColor.replace('#', '')
    const r = parseInt(hex.substring(0, 2), 16)
    const g = parseInt(hex.substring(2, 4), 16)
    const b = parseInt(hex.substring(4, 6), 16)
    const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255
    return luminance > 0.5 ? '#000000' : '#ffffff'
  }, [accentColor])

  // Apply accent color as CSS variable
  useEffect(() => {
    const hex = accentColor.replace('#', '')
    const r = parseInt(hex.substring(0, 2), 16)
    const g = parseInt(hex.substring(2, 4), 16)
    const b = parseInt(hex.substring(4, 6), 16)
    document.documentElement.style.setProperty('--color-accent', `rgba(${r},${g},${b},${accentOpacity})`)
    document.documentElement.style.setProperty('--color-accent-text', accentTextColor)
    document.documentElement.style.setProperty('--color-accent-rgb', `${r},${g},${b}`)
    document.documentElement.style.setProperty('--color-accent-glow', `rgba(${r},${g},${b},${accentOpacity * 0.3})`)
    document.documentElement.style.setProperty('--color-accent-opacity', `${accentOpacity}`)
    localStorage.setItem('accent_color', accentColor)
    localStorage.setItem('accent_opacity', `${accentOpacity}`)
  }, [accentColor, accentTextColor, accentOpacity])

  const toggleTheme = () => {
    const next = theme === 'dark' ? 'light' : 'dark'
    setTheme(next)
    localStorage.setItem('theme', next)
    document.documentElement.setAttribute('data-theme', next === 'light' ? 'light' : '')
  }
  useEffect(() => {
    if (theme === 'light') document.documentElement.setAttribute('data-theme', 'light')
  }, [])

  const [agentConnected, setAgentConnected] = useState(false)
  const agentConnectedRef = useRef(false)
  const [agentVersion, setAgentVersion] = useState('')
  useEffect(() => {
    if (!authUser) return
    const checkAgent = async () => {
      try {
        const res = await fetch(`${AGENT_BASE}/api/status`, { signal: AbortSignal.timeout(2000) })
        if (res.ok) {
          const status = await res.json()
          setAgentConnected(true); agentConnectedRef.current = true
          setAgentVersion(status.version || '')
          await fetch(`${AGENT_BASE}/api/config`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username: authUser.name })
          })
        }
      } catch { setAgentConnected(false); agentConnectedRef.current = false }
    }
    checkAgent()
    const interval = setInterval(checkAgent, 30000)
    return () => clearInterval(interval)
  }, [authUser])

  const [tracks, setTracks] = useState([])
  const [connected, setConnected] = useState(false)
  const [serverStatus, setServerStatus] = useState('idle')
  const [activeTab, setActiveTab] = useQS('tab', 'all')
  const [username, setUsername] = useState('arenazl')
  const [password, setPassword] = useState('look')
  const [inputText, setInputText] = useState('')
  const [genre, setGenre] = useState('')
  const [summary, setSummary] = useState(null)
  const [logs, setLogs] = useState([])
  const [dlSearch, setDlSearch] = useState('')
  const [searchResults, setSearchResults] = useState(null) // null = no search, [] = empty results
  const [searchStatus, setSearchStatus] = useState('idle') // idle, connecting, searching
  const [searchDlStatus, setSearchDlStatus] = useState({}) // { filename: 'downloading'|'completed'|'error' }
  const [pendingTracks, setPendingTracks] = useState([]) // tracks that failed to download
  const [pendingExpanded, setPendingExpanded] = useState(false)
  const [previewLoading, setPreviewLoading] = useState(null)
  const [playingFile, setPlayingFile] = useState(null)
  const [nowPlaying, setNowPlaying] = useState(null)
  const [isAudioPlaying, setIsAudioPlaying] = useState(false)
  const [previewMode, setPreviewMode] = useState(false)
  const [mixTracks, setMixTracks] = useState(null) // tracks array for MixEditor
  const previewTimerRef = useRef(null)
  const audioRef = useRef(null)
  const wsRef = useRef(null)
  const libraryRef = useRef(null)
  const logsEndRef = useRef(null)

  const reconnectTimer = useRef(null)

  const connectWs = useCallback(() => {
    // Close existing connection first
    if (wsRef.current && wsRef.current.readyState <= 1) {
      wsRef.current.close()
    }
    if (reconnectTimer.current) {
      clearTimeout(reconnectTimer.current)
      reconnectTimer.current = null
    }

    const wsHost = ['5173', '5174', '5175'].includes(window.location.port) ? 'localhost:8899' : 'slsk-backend-7da97b8a965d.herokuapp.com'
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    const ws = new WebSocket(`${protocol}//${wsHost}/ws`)
    wsRef.current = ws

    ws.onopen = () => setConnected(true)
    ws.onclose = () => {
      setConnected(false)
      // Only reconnect if this is still the current ws
      if (wsRef.current === ws) {
        reconnectTimer.current = setTimeout(connectWs, 2000)
      }
    }

    ws.onmessage = (e) => {
      const data = JSON.parse(e.data)

      if (data.type === 'tracks_parsed') {
        setTracks(data.tracks)
      }

      if (data.type === 'track_update') {
        setTracks(prev => prev.map(t => t.id === data.track.id ? data.track : t))
        if (data.track.status === 'completed' && data.track.filename) {
          // Transfer file from Heroku to local agent
          if (agentConnectedRef.current) {
            console.log('Transferring file to agent:', data.track.filename)
            fetch(`${API_BASE}/audio/${encodeURIComponent(data.track.filename)}`)
              .then(r => { if (!r.ok) throw new Error(`Heroku audio ${r.status}`); return r.blob() })
              .then(blob => {
                console.log('Got blob from Heroku:', blob.size, 'bytes')
                const form = new FormData()
                form.append('file', blob, data.track.filename)
                form.append('filename', data.track.filename)
                form.append('genre', data.track.genre || '')
                form.append('metadata', JSON.stringify({ title: data.track.title || '', artist: data.track.artist || '', genre: data.track.genre || '', key: data.track.key || '', rating: data.track.rating }))
                return fetch(`${AGENT_BASE}/api/save-file`, { method: 'POST', body: form })
              })
              .then(r => { console.log('Agent save-file response:', r.status); return r.json() })
              .then(d => { console.log('Agent saved:', d); libraryRef.current?.refresh() })
              .catch(e => console.error('Failed to transfer file to agent:', e))
          } else {
            console.log('No agent connected, skipping transfer')
            libraryRef.current?.refresh()
          }
        }
      }

      if (data.type === 'status') {
        setServerStatus(data.status)
      }

      if (data.type === 'summary') {
        setSummary(data)
      }

      if (data.type === 'log') {
        setLogs(prev => [...prev.slice(-200), data.message])
      }

      if (data.type === 'error') {
        toast(data.message, 'error')
      }

      if (data.type === 'search_status') {
        setSearchStatus(data.status)
      }

      if (data.type === 'search_results') {
        setSearchResults(data.results)
        setSearchStatus('idle')
      }

      if (data.type === 'search_dl_status') {
        setSearchDlStatus(prev => ({ ...prev, [data.filename]: {
          status: data.status, pct: data.pct, speed: data.speed,
          queue: data.queue, source: data.source, wait_secs: data.wait_secs,
          timeout_secs: data.timeout_secs, source_idx: data.source_idx, source_total: data.source_total,
        }}))
        if (data.status === 'completed' && data.filename && agentConnectedRef.current) {
          console.log('Transferring search file to agent:', data.filename)
          fetch(`${API_BASE}/audio/${encodeURIComponent(data.filename)}`)
            .then(r => { if (!r.ok) throw new Error(`Heroku audio ${r.status}`); return r.blob() })
            .then(blob => {
              console.log('Got blob from Heroku:', blob.size, 'bytes')
              const form = new FormData()
              form.append('file', blob, data.filename)
              form.append('filename', data.filename)
              return fetch(`${AGENT_BASE}/api/save-file`, { method: 'POST', body: form })
            })
            .then(r => { console.log('Agent save-file response:', r.status); return r.json() })
            .then(d => { console.log('Agent saved:', d); libraryRef.current?.refresh() })
            .catch(e => console.error('Failed to transfer file to agent:', e))
        } else if (data.status === 'completed') {
          libraryRef.current?.refresh()
        }
      }
    }
  }, [])

  // Load pending tracks from Cloudinary on mount
  useEffect(() => {
    if (!username) return
    fetch(`${API_BASE}/api/pending?user=${encodeURIComponent(username)}`)
      .then(r => r.json())
      .then(data => { if (Array.isArray(data)) setPendingTracks(data) })
      .catch(() => {})
  }, [username])

  const savePending = (tracks) => {
    setPendingTracks(tracks)
    fetch(`${API_BASE}/api/pending`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user: username, tracks }),
    }).catch(() => {})
  }

  const addToPending = (track) => {
    setPendingTracks(prev => {
      const exists = prev.some(t => t.artist === track.artist && t.title === track.title)
      if (exists) return prev
      const updated = [...prev, { artist: track.artist || '', title: track.title || '', query: track.query || `${track.artist} - ${track.title}`, source: track.source || 'manual', addedAt: new Date().toISOString() }]
      fetch(`${API_BASE}/api/pending`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user: username, tracks: updated }),
      }).catch(() => {})
      return updated
    })
  }

  const removeFromPending = (idx) => {
    setPendingTracks(prev => {
      const updated = prev.filter((_, i) => i !== idx)
      fetch(`${API_BASE}/api/pending`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user: username, tracks: updated }),
      }).catch(() => {})
      return updated
    })
  }

  useEffect(() => {
    connectWs()
    return () => {
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current)
      wsRef.current?.close()
    }
  }, [connectWs])

  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [logs])

  // Global spacebar → play/pause
  useEffect(() => {
    const handler = (e) => {
      if (e.code !== 'Space') return
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName)) return
      if (!audioRef.current) return
      e.preventDefault()
      if (audioRef.current.paused) {
        audioRef.current.play().catch(() => {})
        setIsAudioPlaying(true)
      } else {
        audioRef.current.pause()
        setIsAudioPlaying(false)
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  const handleStart = () => {
    if (!wsRef.current || !inputText.trim() || !username || !password) return
    setSummary(null)
    setLogs([])
    wsRef.current.send(JSON.stringify({
      type: 'start',
      tracks_text: inputText,
      username,
      password,
      genre,
      app_user: authUser?.name || '',
    }))
  }

  const handleStop = () => {
    wsRef.current?.send(JSON.stringify({ type: 'stop' }))
  }

  const handleForceStop = () => {
    wsRef.current?.send(JSON.stringify({ type: 'force_stop' }))
    setTracks([])
    setSummary(null)
    setServerStatus('idle')
  }

  const handleSearchSlsk = () => {
    if (!wsRef.current || wsRef.current.readyState !== 1 || !dlSearch.trim() || !username || !password) return
    setSearchResults([])
    setSearchStatus('connecting')
    setSearchDlStatus({})
    wsRef.current.send(JSON.stringify({
      type: 'search_slsk',
      query: dlSearch.trim(),
      username,
      password,
    }))
  }

  // === Unified audio handlers ===
  const handleAppPlay = async (file) => {
    stopPreviewModeApp()
    if (playingFile === file.filename) {
      // Toggle pause/resume
      if (audioRef.current?.paused) {
        audioRef.current.play()
        setIsAudioPlaying(true)
      } else {
        audioRef.current?.pause()
        setIsAudioPlaying(false)
      }
      return
    }
    if (audioRef.current) {
      audioRef.current.pause()
    }
    setPlayingFile(file.filename)
    setNowPlaying(file)
    setIsAudioPlaying(true)
    try {
      const audio = await createAudioElement(file, agentConnected)
      audio.preload = 'auto'
      audio.onended = () => { setPlayingFile(null); setNowPlaying(null); setIsAudioPlaying(false) }
      audio.onerror = () => { setPlayingFile(null); setNowPlaying(null); setIsAudioPlaying(false) }
      audio.play().catch(() => {})
      audioRef.current = audio
    } catch (e) {
      console.error('Failed to load audio', e)
      setPlayingFile(null); setNowPlaying(null); setIsAudioPlaying(false)
    }
  }

  const handleAppPlayPause = () => {
    if (!audioRef.current) return
    if (audioRef.current.paused) {
      audioRef.current.play()
      setIsAudioPlaying(true)
    } else {
      audioRef.current.pause()
      setIsAudioPlaying(false)
    }
  }

  const handleAppStop = () => {
    if (audioRef.current) {
      audioRef.current.pause()
      audioRef.current.currentTime = 0
    }
    setPlayingFile(null)
    setNowPlaying(null)
    setIsAudioPlaying(false)
    stopPreviewModeApp()
  }

  const stopPreviewModeApp = () => {
    setPreviewMode(false)
    if (previewTimerRef.current) {
      clearTimeout(previewTimerRef.current)
      previewTimerRef.current = null
    }
  }

  const playPreviewTrack = async (list, idx) => {
    if (idx >= list.length) {
      stopPreviewModeApp()
      return
    }
    const file = list[idx]
    if (audioRef.current) audioRef.current.pause()

    try {
      const audio = await createAudioElement(file, agentConnected)
      audio.preload = 'auto'
      audio.oncanplaythrough = () => {
        const startTime = audio.duration > 120 ? 60 : audio.duration * 0.3
        audio.currentTime = startTime
        audio.play().catch(() => {})
      }
      audio.onended = () => {
        playPreviewTrack(list, idx + 1)
      }
      audio.onerror = () => {
        playPreviewTrack(list, idx + 1)
      }
      audioRef.current = audio
      setPlayingFile(file.filename)
      setNowPlaying(file)
      setIsAudioPlaying(true)
    } catch {
      playPreviewTrack(list, idx + 1)
    }

    if (previewTimerRef.current) clearTimeout(previewTimerRef.current)
    previewTimerRef.current = setTimeout(() => {
      playPreviewTrack(list, idx + 1)
    }, 30000)
  }

  const startPreviewModeApp = (startFile, list) => {
    const startIdx = list.findIndex(f => f.filename === startFile.filename)
    if (startIdx === -1) return
    setPreviewMode(true)
    playPreviewTrack(list, startIdx)
  }

  const handlePreview = async (filename) => {
    // If same track is playing, toggle pause/play
    if (nowPlaying?.filename === filename && audioRef.current) {
      if (audioRef.current.paused) {
        audioRef.current.play()
        setIsAudioPlaying(true)
      } else {
        audioRef.current.pause()
        setIsAudioPlaying(false)
      }
      return
    }
    // Stop current audio
    if (audioRef.current) { audioRef.current.pause() }
    setPreviewLoading(filename)
    try {
      const clean = filename.replace(/\.\w{3,4}$/, '').replace(/^\d+[\.\-\s]+/, '').replace(/\s*\(.*?\)\s*/g, ' ').replace(/\s*\[.*?\]\s*/g, ' ').trim()
      const res = await fetch(`https://itunes.apple.com/search?term=${encodeURIComponent(clean)}&media=music&limit=5`)
      const data = await res.json()
      if (data.results?.length > 0) {
        const url = data.results[0].previewUrl
        const audio = new Audio(url)
        audio.preload = 'auto'
        audio.onended = () => { setPlayingFile(null); setNowPlaying(null); setIsAudioPlaying(false) }
        audio.onerror = () => { setPlayingFile(null); setNowPlaying(null); setIsAudioPlaying(false) }
        audio.play().catch(() => {})
        audioRef.current = audio
        setPlayingFile(filename)
        setNowPlaying({ filename, title: clean, artist: data.results[0].artistName || '', isPreview: true })
        setIsAudioPlaying(true)
      }
    } catch (e) {
      console.error('Preview error:', e)
    } finally {
      setPreviewLoading(null)
    }
  }

  const handleDownloadSingle = (result) => {
    if (!wsRef.current || !username || !password) return
    setSearchDlStatus(prev => ({ ...prev, [result.filename]: { status: 'downloading' } }))
    wsRef.current.send(JSON.stringify({
      type: 'download_single',
      username,
      password,
      result,
      app_user: authUser?.name || '',
    }))
  }

  const goToLibraryTrack = (filename) => {
    libraryRef.current?.goToTrack(filename)
    setPage('library')
  }

  const handleParse = () => {
    if (!wsRef.current || !inputText.trim()) return
    wsRef.current.send(JSON.stringify({
      type: 'parse',
      tracks_text: inputText,
      genre,
    }))
  }

  const isRunning = ['connecting', 'connected', 'waiting_downloads'].includes(serverStatus)
  const completed = tracks.filter(t => t.status === 'completed').length
  const skipped = tracks.filter(t => t.status === 'skipped').length
  const downloading = tracks.filter(t => t.status === 'downloading').length
  const searching = tracks.filter(t => t.status === 'searching').length
  const notFound = tracks.filter(t => t.status === 'not_found').length
  const pending = tracks.filter(t => t.status === 'pending').length
  const errors = tracks.filter(t => t.status === 'error').length

  const genres = [...new Set(tracks.map(t => t.genre).filter(Boolean))]

  const dlQ = dlSearch.toLowerCase()
  const searchedTracks = dlQ
    ? tracks.filter(t => (t.title || '').toLowerCase().includes(dlQ) || (t.artist || '').toLowerCase().includes(dlQ) || (t.genre || '').toLowerCase().includes(dlQ))
    : tracks

  const filteredTracks = dlQ
    ? searchedTracks
    : activeTab === 'all'
    ? searchedTracks
    : activeTab === 'by_genre'
    ? searchedTracks
    : activeTab.startsWith('genre:')
    ? searchedTracks.filter(t => t.genre === activeTab.slice(6))
    : searchedTracks.filter(t => t.status === activeTab)

  const tracksByGenre = genres.reduce((acc, g) => {
    acc[g] = (dlQ ? searchedTracks : tracks).filter(t => t.genre === g)
    return acc
  }, {})
  const ungrouped = (dlQ ? searchedTracks : tracks).filter(t => !t.genre)

  const tabs = [
    { key: 'all', label: 'Todos', count: tracks.length },
    ...(genres.length > 0 ? [{ key: 'by_genre', label: 'Por estilo', count: genres.length }] : []),
    { key: 'completed', label: 'Completados', count: completed },
    { key: 'skipped', label: 'Ya descargados', count: skipped },
    { key: 'downloading', label: 'Descargando', count: downloading },
    { key: 'searching', label: 'Buscando', count: searching },
    { key: 'pending', label: 'Pendientes', count: pending },
    { key: 'not_found', label: 'No encontrados', count: notFound },
    { key: 'error', label: 'Errores', count: errors },
  ].filter(t => t.key === 'all' || t.key === 'by_genre' || t.count > 0)

  if (!authUser) return <LoginScreen onLogin={setAuthUser} />

  return (
    <div className="h-screen flex flex-col overflow-hidden bg-[var(--bg-app)] text-[var(--text-primary)]">
      {/* Header */}
      <header className="flex-shrink-0 h-14 flex items-center justify-between px-6 bg-[var(--bg-panel)] border-b border-[var(--border-color)]">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-3">
            <img src="/logo.png" alt="Groove Sync" className="h-6 object-contain" />
            <span className="font-semibold text-base text-[var(--text-primary)]">Groove Sync</span>
          </div>
          <div className="flex gap-1">
            {[
              { id: 'discover', label: 'Discover' },
              { id: 'download', label: 'Descargar' },
              { id: 'library', label: 'Biblioteca' },
              { id: 'set', label: 'Set' },
              ...(mixTracks ? [{ id: 'mix', label: 'Mix Editor' }] : []),
            ].map(tab => (
              <button
                key={tab.id}
                onClick={() => setPage(tab.id)}
                className={`px-3 py-1.5 rounded-lg text-sm ${
                  page === tab.id ? 'btn-accent font-semibold' : 'btn-ghost'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-3 min-w-0 flex-1 justify-end">
          {logs.length > 0 && isRunning && (
            <span className="text-sm text-yellow-400 truncate max-w-lg">
              {logs[logs.length - 1]}
            </span>
          )}
          {page === 'download' && (
            <div className="relative flex-shrink-0 w-64 flex items-center gap-1">
              <div className="relative flex-1">
                <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-500 pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
                <input
                  value={dlSearch}
                  onChange={e => setDlSearch(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') handleSearchSlsk() }}
                  placeholder="Buscar en SoulSeek..."
                  className="w-full pl-8 pr-3 py-1 bg-[var(--bg-input)] border border-gray-700 rounded-lg text-xs text-[var(--text-primary)] placeholder-gray-500 focus:outline-none focus:border-[var(--color-accent)] transition-colors"
                />
              </div>
              {searchStatus !== 'idle' && (
                <span className="text-xs text-yellow-400 animate-pulse flex-shrink-0">
                  {searchStatus === 'connecting' ? 'Conectando...' : 'Buscando...'}
                </span>
              )}
              {searchResults && (
                <button
                  onClick={() => { setSearchResults(null); setDlSearch(''); setSearchDlStatus({}) }}
                  className="text-xs text-gray-500 hover:text-[var(--text-primary,white)] flex-shrink-0"
                  title="Cerrar resultados"
                >✕</button>
              )}
            </div>
          )}
          <a
            href="https://github.com/arenazl/slsk-agent/releases/latest/download/GrooveSyncAgent.exe"
            className="relative p-1.5 rounded-lg text-[var(--text-muted)] hover:text-green-400 hover:bg-[var(--bg-hover)] transition-all duration-200 active:scale-95 flex-shrink-0"
            title={agentConnected ? `Agente v${agentVersion} conectado` : 'Descargar Agente (Windows)'}
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
              <path d="M0 3.449L9.75 2.1v9.451H0m10.949-9.602L24 0v11.4H10.949M0 12.6h9.75v9.451L0 20.699M10.949 12.6H24V24l-12.9-1.801" />
            </svg>
            <span className={`absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-[var(--bg-panel)] ${agentConnected ? 'bg-green-500' : 'bg-gray-500'}`} />
          </a>
          <a
            href="https://github.com/arenazl/slsk-agent/releases/latest/download/GrooveSyncAgent-macOS.zip"
            className="relative p-1.5 rounded-lg text-[var(--text-muted)] hover:text-green-400 hover:bg-[var(--bg-hover)] transition-all duration-200 active:scale-95 flex-shrink-0"
            title={agentConnected ? `Agente v${agentVersion} conectado` : 'Descargar Agente (Mac) - Click derecho para Mac viejo'}
            onContextMenu={(e) => { e.preventDefault(); window.prompt('Copiá este comando y pegalo en Terminal:', 'curl -sL https://bootstrap.pypa.io/get-pip.py | python3 && python3 -m pip install pystray pillow aiohttp cloudinary && curl -sL https://raw.githubusercontent.com/arenazl/slsk-agent/master/agent.py -o /tmp/agent.py && python3 /tmp/agent.py') }}
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
              <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.8-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z" />
            </svg>
          </a>
          <button
            onClick={async () => {
              try {
                await fetch(`${API_BASE}/api/restart-slsk`, { method: 'POST' })
                connectWs()
              } catch (e) { console.error('Restart failed', e) }
            }}
            className="p-1.5 rounded-lg text-[var(--text-muted)] hover:text-yellow-400 hover:bg-[var(--bg-hover)] transition-all duration-200 active:scale-95 flex-shrink-0"
            title="Reiniciar conexión SoulSeek"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
          </button>
          <div className="flex items-center gap-1.5 flex-shrink-0">
            <label className="cursor-pointer" title="Color de acento">
              <input
                type="color"
                value={accentColor}
                onChange={e => setAccentColor(e.target.value)}
                className="w-5 h-5 rounded-full border-0 cursor-pointer bg-transparent"
                style={{appearance: 'none', WebkitAppearance: 'none', padding: 0}}
              />
            </label>
            <input
              type="range"
              min="0.3"
              max="1"
              step="0.05"
              value={accentOpacity}
              onChange={e => setAccentOpacity(parseFloat(e.target.value))}
              className="w-12 h-1 accent-current cursor-pointer"
              style={{accentColor: accentColor}}
              title={`Opacidad: ${Math.round(accentOpacity * 100)}%`}
            />
          </div>
          <button
            onClick={toggleTheme}
            className="p-1.5 rounded-lg text-[var(--text-muted)] hover:text-[var(--text-primary,white)] hover:bg-[var(--bg-hover)] transition-all duration-200 active:scale-95 flex-shrink-0"
            title={theme === 'dark' ? 'Tema claro' : 'Tema oscuro'}
          >
            {theme === 'dark' ? (
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
              </svg>
            ) : (
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
              </svg>
            )}
          </button>
          <div className={`w-2 h-2 rounded-full flex-shrink-0 ${connected ? 'bg-green-500' : 'bg-red-500'}`} />
          <span className="text-sm text-[var(--text-muted)] flex-shrink-0">
            {connected ? (isRunning ? 'Descargando...' : 'Conectado') : 'Desconectado'}
          </span>
          {authUser && (
            <button
              onClick={() => { localStorage.removeItem('auth_token'); localStorage.removeItem('auth_user'); setAuthUser(null) }}
              className="flex items-center gap-1.5 px-2 py-1 rounded-lg text-xs text-gray-400 hover:text-white hover:bg-[var(--bg-hover)] transition-all"
              title="Cerrar sesión"
            >
              <span className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold" style={{ background: 'var(--color-accent)', color: 'var(--color-accent-text)' }}>{authUser.name?.[0]?.toUpperCase()}</span>
              {authUser.name}
            </button>
          )}
        </div>
      </header>

      {/* Library - always mounted, hidden when not active */}
      <div className={`flex-1 flex min-h-0 ${page !== 'library' ? 'hidden' : ''}`}>
        <Library
          ref={libraryRef}
          playingFile={playingFile}
          onPlay={handleAppPlay}
          onPlayPause={handleAppPlayPause}
          onStop={handleAppStop}
          onStartPreviewMode={startPreviewModeApp}
          previewMode={previewMode}
          onStopPreviewMode={stopPreviewModeApp}
          agentConnected={agentConnected}
          onRadio={(file) => { setPendingRadioTrack({ artist: file.artist || '', title: file.title || file.filename }); setPage('discover') }}
          authUser={authUser}
        />
      </div>

      {/* Download page */}
      <div className={`flex-1 flex min-h-0 ${page !== 'download' ? 'hidden' : ''}`}>
        {/* Sidebar - Input */}
        <aside className="flex-shrink-0 w-80 flex flex-col bg-[var(--bg-panel)] border-r border-[var(--border-color)]">
          <div className="flex-1 min-h-0 flex flex-col px-4 pb-4">
            <label className="text-sm text-gray-400 mb-1">Estilo / Género:</label>
            <input
              value={genre}
              onChange={e => setGenre(e.target.value)}
              placeholder="Ej: Tech House, Melodic Techno..."
              className="w-full px-3 py-2 mb-2 bg-[var(--bg-input)] border border-gray-700 rounded-lg text-sm focus:outline-none focus:border-[var(--color-accent)] transition-colors"
            />
            <label className="text-sm text-gray-400 mb-1">Pegar lista de tracks:</label>
            <textarea
              value={inputText}
              onChange={e => setInputText(e.target.value)}
              placeholder={"1. Artist - Title - Mix\n\nO pegar HTML directo de Beatport..."}
              className="flex-1 min-h-0 w-full px-3 py-2 bg-[var(--bg-input)] border border-gray-700 rounded-lg text-sm font-mono resize-none focus:outline-none focus:border-[var(--color-accent)] transition-colors"
            />
          </div>

          <div className="flex-shrink-0 p-4 pt-0 space-y-2">
            <button
              onClick={handleParse}
              disabled={!inputText.trim() || !connected}
              className="w-full py-2 bg-gray-700 hover:bg-gray-600 disabled:opacity-40 rounded-lg text-sm transition-all duration-200 active:scale-95"
            >
              Previsualizar
            </button>
            {!isRunning ? (
              <button
                onClick={handleStart}
                disabled={!inputText.trim() || !username || !password || !connected}
                className="w-full py-2.5 disabled:opacity-40 rounded-lg text-sm font-semibold transition-all duration-200 active:scale-95"
                style={{ background: 'var(--color-accent)', color: 'var(--color-accent-text)' }}
              >
                Descargar {tracks.length > 0 ? `(${tracks.length} tracks)` : ''}
              </button>
            ) : (
              <button
                onClick={handleStop}
                className="w-full py-2.5 bg-red-600 hover:bg-red-500 rounded-lg text-sm font-semibold transition-all duration-200 active:scale-95"
              >
                Detener
              </button>
            )}
            <button
              onClick={handleForceStop}
              disabled={!connected}
              className="w-full py-2 bg-red-900 hover:bg-red-800 border border-red-700 disabled:opacity-40 rounded-lg text-sm text-red-300 transition-all duration-200 active:scale-95"
            >
              Forzar detención
            </button>
          </div>
        </aside>

        {/* Main - Track list */}
        <main className="flex-1 flex flex-col min-w-0">
          {/* Tabs */}
          {tracks.length > 0 && (
            <div className="flex-shrink-0 flex items-center gap-1 px-4 py-2 bg-[var(--bg-panel)] border-b border-[var(--border-color)] overflow-x-auto">
              {tabs.map(tab => (
                <button
                  key={tab.key}
                  onClick={() => setActiveTab(tab.key)}
                  className={`px-3 py-1.5 rounded-lg text-sm transition-all duration-200 flex-shrink-0 ${
                    activeTab === tab.key
                      ? 'font-semibold'
                      : 'text-gray-400 hover:text-[var(--text-primary,white)] hover:bg-gray-800'
                  }`}
                  style={activeTab === tab.key ? { background: 'var(--color-accent)', color: 'var(--color-accent-text)' } : {}}
                >
                  {tab.label}
                  <span className={`ml-1.5 text-xs ${activeTab === tab.key ? 'opacity-70' : 'text-gray-600'}`}>
                    {tab.count}
                  </span>
                </button>
              ))}
            </div>
          )}

          {/* Pending tracks banner */}
          {pendingTracks.length > 0 && !searchResults && (
            <div className="flex-shrink-0 border-b border-[var(--border-color)] bg-yellow-500/5">
              <button
                onClick={() => setPendingExpanded(prev => !prev)}
                className="w-full px-4 py-2 flex items-center justify-between text-sm hover:bg-yellow-500/10 transition-colors"
              >
                <span className="flex items-center gap-2 text-yellow-400">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                  {pendingTracks.length} pendiente{pendingTracks.length > 1 ? 's' : ''}
                </span>
                <svg className={`w-4 h-4 text-gray-400 transition-transform ${pendingExpanded ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
              </button>
              {pendingExpanded && (
                <div className="px-4 pb-3 space-y-1">
                  {pendingTracks.map((t, idx) => (
                    <div key={idx} className="flex items-center justify-between gap-2 py-1.5 px-3 rounded-lg bg-[var(--bg-input)] text-xs">
                      <span className="truncate min-w-0 text-[var(--text-primary)]">{t.artist} - {t.title}</span>
                      <div className="flex items-center gap-1 flex-shrink-0">
                        <button
                          onClick={() => { setDlSearch(`${t.artist} - ${t.title}`); handleSearchSlsk() }}
                          className="px-2 py-1 rounded bg-[var(--color-accent)] text-[var(--color-accent-text)] hover:opacity-80 transition-opacity"
                        >Buscar</button>
                        <button
                          onClick={() => removeFromPending(idx)}
                          className="px-2 py-1 rounded bg-red-500/20 text-red-400 hover:bg-red-500/30 transition-colors"
                        >✕</button>
                      </div>
                    </div>
                  ))}
                  <button
                    onClick={() => savePending([])}
                    className="text-xs text-gray-500 hover:text-red-400 transition-colors mt-1"
                  >Limpiar todos</button>
                </div>
              )}
            </div>
          )}

          {/* Track list / Search results */}
          <div className="flex-1 min-h-0 overflow-y-auto">
            {searchResults !== null ? (
              /* SoulSeek search results */
              searchResults.length === 0 && searchStatus !== 'idle' ? (
                <div className="flex items-center justify-center h-full text-gray-500">
                  <div className="text-center space-y-2">
                    <div className="w-6 h-6 border-2 border-[var(--color-accent)] border-t-transparent rounded-full animate-spin mx-auto" />
                    <p className="text-sm">Buscando "{dlSearch}" en SoulSeek...</p>
                  </div>
                </div>
              ) : searchResults.length === 0 ? (
                <div className="flex items-center justify-center h-full text-gray-500 text-sm">
                  Sin resultados para "{dlSearch}"
                </div>
              ) : (
                <div>
                  <div className="sticky top-0 z-10 px-4 py-2 bg-[var(--bg-genre-header)] border-b border-[var(--border-color)] flex items-center gap-3">
                    <span className="text-sm font-semibold text-[var(--color-accent)]">Resultados SoulSeek</span>
                    <span className="text-xs text-gray-500">{(() => { const grouped = {}; searchResults.forEach(r => { if (!grouped[r.filename]) grouped[r.filename] = []; grouped[r.filename].push(r) }); return Object.keys(grouped).length })()} archivos</span>
                  </div>
                  {(() => {
                    // Group by filename, keep best source first (already sorted by score)
                    const grouped = {}
                    searchResults.forEach(r => {
                      if (!grouped[r.filename]) grouped[r.filename] = []
                      grouped[r.filename].push(r)
                    })
                    return Object.entries(grouped).map(([filename, sources]) => {
                      const best = sources[0]
                      const dlInfo = searchDlStatus[filename]
                      const dlSt = dlInfo?.status || dlInfo
                      const dlPct = dlInfo?.pct
                      return (
                        <div key={filename}
                          onDoubleClick={() => dlSt === 'completed' && goToLibraryTrack(filename)}
                          className={`flex items-center gap-3 px-4 py-2 border-b border-[var(--border-color)]/50 hover:bg-gray-800/30 transition-colors text-sm ${dlSt === 'completed' ? 'cursor-pointer' : ''}`}>
                          <PlayPauseBtn
                            isPlaying={playingFile === filename && isAudioPlaying}
                            loading={previewLoading === filename}
                            onClick={() => handlePreview(filename)}
                          />
                          <div className="flex-1 min-w-0">
                            <div className="truncate text-[var(--text-primary)]">{filename}</div>
                            <div className="flex items-center gap-3 text-xs text-gray-500 mt-0.5">
                              <span className="text-purple-400">{best.ext}</span>
                              <span>{best.size_mb} MB</span>
                              {best.bitrate > 0 && <span>{best.bitrate} kbps</span>}
                              {best.duration > 0 && <span>{Math.floor(best.duration / 60)}:{String(best.duration % 60).padStart(2, '0')}</span>}
                              <span className="text-gray-600">{sources.length} fuente{sources.length > 1 ? 's' : ''}</span>
                            </div>
                          </div>
                          {dlSt === 'completed' ? (
                            <span className="text-green-400 text-xs flex-shrink-0">Descargado</span>
                          ) : dlSt === 'queued' ? (
                            <div className="flex-shrink-0 flex items-center gap-2">
                              <div className="flex flex-col items-end">
                                <span className="text-yellow-400 text-xs animate-pulse">
                                  En cola ({dlInfo.source}) q:{dlInfo.queue || '?'}
                                </span>
                                {dlInfo.wait_secs > 0 && (
                                  <div className="flex items-center gap-1.5 mt-0.5">
                                    <div className="w-16 h-1 bg-gray-700 rounded-full overflow-hidden">
                                      <div className="h-full rounded-full bg-yellow-500/60 transition-all duration-1000" style={{ width: `${Math.min(100, (dlInfo.wait_secs / (dlInfo.timeout_secs || 300)) * 100)}%` }} />
                                    </div>
                                    <span className="text-gray-500 text-[10px]">{dlInfo.wait_secs}s</span>
                                  </div>
                                )}
                              </div>
                            </div>
                          ) : dlSt === 'downloading' ? (
                            <div className="flex-shrink-0 flex items-center gap-2">
                              {dlPct != null ? (
                                <>
                                  <div className="w-20 h-1.5 bg-gray-700 rounded-full overflow-hidden">
                                    <div className="h-full rounded-full transition-all duration-300 bg-[var(--color-accent)]" style={{ width: `${dlPct}%` }} />
                                  </div>
                                  <span className="text-[var(--color-accent)] text-xs w-12 text-right">{dlPct}%{dlInfo?.speed > 0 ? ` ${dlInfo.speed}k` : ''}</span>
                                </>
                              ) : (
                                <span className="text-yellow-400 text-xs animate-pulse">Iniciando...</span>
                              )}
                            </div>
                          ) : dlSt === 'error' ? (
                            <button
                              onClick={() => { setSearchDlStatus(prev => { const n = {...prev}; delete n[filename]; return n }); handleDownloadSingle({ ...best, sources }) }}
                              className="text-red-400 hover:text-red-300 text-xs flex-shrink-0 hover:underline transition-colors"
                            >Reintentar</button>
                          ) : (
                            <button
                              onClick={() => handleDownloadSingle({ ...best, sources })}
                              className="flex-shrink-0 px-3 py-1 rounded text-xs transition-all duration-200 active:scale-95"
                              style={{ background: 'var(--color-accent)', color: 'var(--color-accent-text)' }}
                            >
                              Descargar
                            </button>
                          )}
                        </div>
                      )
                    })
                  })()}
                </div>
              )
            ) : tracks.length === 0 ? (
              <div className="flex items-center justify-center h-full text-gray-600">
                <div className="text-center space-y-2">
                  <p className="text-4xl">&#127925;</p>
                  <p>Pega tu lista de tracks a la izquierda</p>
                  <p className="text-sm">Soporta Beatport (texto o HTML), Rekordbox</p>
                </div>
              </div>
            ) : activeTab === 'by_genre' ? (
              <>
                {genres.map(g => (
                  <div key={g}>
                    <div className="sticky top-0 z-10 px-4 py-2 bg-[var(--bg-genre-header)] border-b border-[var(--border-color)] flex items-center gap-2">
                      <span className="text-sm font-semibold text-[var(--color-accent)]">{g}</span>
                      <span className="text-xs text-gray-500">{tracksByGenre[g].length} tracks</span>
                      <span className="text-xs text-green-500">{tracksByGenre[g].filter(t => t.status === 'completed').length} completados</span>
                    </div>
                    {tracksByGenre[g].map(track => <TrackRow key={track.id} track={track} />)}
                  </div>
                ))}
                {ungrouped.length > 0 && (
                  <div>
                    <div className="sticky top-0 z-10 px-4 py-2 bg-[var(--bg-genre-header)] border-b border-[var(--border-color)]">
                      <span className="text-sm font-semibold text-gray-400">Sin estilo</span>
                      <span className="text-xs text-gray-500 ml-2">{ungrouped.length} tracks</span>
                    </div>
                    {ungrouped.map(track => <TrackRow key={track.id} track={track} />)}
                  </div>
                )}
              </>
            ) : (
              filteredTracks.map(track => <TrackRow key={track.id} track={track} />)
            )}
          </div>

          {/* Logs */}
          {logs.length > 0 && (
            <div className="flex-shrink-0 max-h-40 overflow-y-auto border-t border-[var(--border-color)] bg-[var(--bg-surface)] px-4 py-2 font-mono text-xs">
              {logs.map((log, i) => (
                <div key={i} className={`py-0.5 ${
                  log.includes('✓') ? 'text-green-400' :
                  log.includes('✗') ? 'text-red-400' :
                  log.includes('→') ? 'text-gray-500' :
                  'text-gray-400'
                }`}>
                  {log}
                </div>
              ))}
              <div ref={logsEndRef} />
            </div>
          )}

          {/* Summary */}
          {summary && (
            <div className="flex-shrink-0 px-4 py-3 bg-[var(--bg-panel)] border-t border-[var(--border-color)]">
              <div className="flex items-center gap-4 text-sm">
                <span className="font-semibold">Resumen:</span>
                <span className="text-green-400">{summary.completed} descargados</span>
                {summary.skipped > 0 && <span className="text-cyan-400">{summary.skipped} omitidos</span>}
                <span className="text-red-400">{summary.not_found} no encontrados</span>
                {summary.errors > 0 && <span className="text-orange-400">{summary.errors} errores</span>}
                <span className="text-gray-400">de {summary.total} total</span>
              </div>
            </div>
          )}

        </main>
      </div>

      {/* Set Builder page */}
      <SetBuilder page={page} playingFile={playingFile} onPlay={handleAppPlay} onPlayPause={handleAppPlayPause} onStop={handleAppStop} agentConnected={agentConnected} onEditMix={(tracks) => { setMixTracks(tracks); setPage('mix') }} authUser={authUser} />

      {/* Mix Editor page */}
      {page === 'mix' && mixTracks && (
        <MixEditor
          tracks={mixTracks}
          onBack={() => setPage('set')}
          agentConnected={agentConnected}
        />
      )}

      {/* Discover page */}
      <div className={`flex-1 flex flex-col min-h-0 ${page !== 'discover' ? 'hidden' : ''}`}>
        <DiscoverPage
          wsRef={wsRef}
          username={username}
          password={password}
          connected={connected}
          onGoToDownloads={() => setPage('download')}
          audioRef={audioRef}
          playingFile={playingFile}
          setPlayingFile={setPlayingFile}
          setNowPlaying={setNowPlaying}
          setIsAudioPlaying={setIsAudioPlaying}
          addToPending={addToPending}
          pendingRadioTrack={pendingRadioTrack}
          onRadioConsumed={() => setPendingRadioTrack(null)}
          agentConnected={agentConnected}
          authUser={authUser}
        />
      </div>

      {/* Preview mode indicator */}
      {previewMode && (
        <div className="flex-shrink-0 flex items-center justify-between px-4 py-1.5 bg-[var(--color-accent)]/10 border-t border-[var(--border-color)]">
          <span className="flex items-center gap-2 text-xs text-[var(--color-accent)]">
            <span className="w-2 h-2 rounded-full bg-[var(--color-accent)] animate-pulse" />
            Preview continuo — 30s desde el minuto de cada tema
          </span>
          <button
            onClick={stopPreviewModeApp}
            className="text-xs text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors px-2 py-0.5 rounded hover:bg-[var(--bg-hover)]"
          >
            Detener
          </button>
        </div>
      )}

      {/* Global audio player */}
      <AudioPlayerBar
        file={nowPlaying}
        isPlaying={isAudioPlaying}
        audio={audioRef.current}
        onPlayPause={handleAppPlayPause}
        onStop={handleAppStop}
        agentConnected={agentConnected}
      />
    </div>
  )
}


function DiscoverPage({ wsRef, username, password, connected, onGoToDownloads, audioRef, playingFile, setPlayingFile, setNowPlaying, setIsAudioPlaying, addToPending, pendingRadioTrack, onRadioConsumed, agentConnected, authUser }) {
  const [genres, setGenres] = useState([])
  const [selectedGenre, setSelectedGenre] = useState(null) // null = All
  const [tracks, setTracks] = useState([])
  const [loading, setLoading] = useState(false)
  const [playingId, setPlayingId] = useState(null)

  // Library manifest for marking already-downloaded tracks
  const [libraryManifest, setLibraryManifest] = useState({})
  useEffect(() => {
    fetch(`${API_BASE}/api/metadata?user=${encodeURIComponent(authUser?.name || '')}`).then(r => r.json()).then(setLibraryManifest).catch(() => {})
  }, [authUser])

  const isInLibrary = useMemo(() => {
    // Normalize: lowercase, strip parens content like (Extended Mix), remove non-alphanumeric
    const norm = (s) => (s || '').toLowerCase()
      .replace(/\(.*?\)/g, '')  // remove (Extended Mix), (Original Mix), etc
      .replace(/\[.*?\]/g, '')  // remove [brackets]
      .replace(/\.(flac|mp3|wav|m4a|aif|aiff|ogg)$/i, '') // remove extension
      .replace(/^\d+[\s.\-]+/, '') // remove leading track numbers
      .replace(/[^a-z0-9]/g, '') // only alphanumeric
      .trim()

    // Build multiple indexes for fuzzy matching
    const titleWords = new Set()  // individual normalized titles
    const artistTitle = new Set() // "artist|title" combos
    const filenames = new Set()   // normalized filenames

    for (const [filename, meta] of Object.entries(libraryManifest)) {
      const fn = norm(filename)
      if (fn) filenames.add(fn)

      const artist = norm(meta.artist || '')
      const title = norm(meta.title || '')
      if (title) titleWords.add(title)
      if (artist && title) artistTitle.add(`${artist}|${title}`)

      // Also extract artist-title from filename pattern "Artist - Title"
      const parts = filename.replace(/\.(flac|mp3|wav|m4a)$/i, '').split(/\s*-\s*/)
      if (parts.length >= 2) {
        const fnArtist = norm(parts[0])
        const fnTitle = norm(parts.slice(1).join(''))
        if (fnArtist && fnTitle) artistTitle.add(`${fnArtist}|${fnTitle}`)
        if (fnTitle) titleWords.add(fnTitle)
      }
    }

    return (track) => {
      const a = norm(track.artist || '')
      const t = norm(track.title || '')
      // Exact artist+title match
      if (a && t && artistTitle.has(`${a}|${t}`)) return true
      // Title-only match
      if (t && titleWords.has(t)) return true
      // Check if track title+artist appears in any filename
      const combined = a + t
      if (combined && filenames.has(combined)) return true
      // Check if any filename contains the title
      if (t && t.length > 5) {
        for (const fn of filenames) {
          if (fn.includes(t)) return true
        }
      }
      return false
    }
  }, [libraryManifest])
  // Download queue state
  const [downloadQueue, setDownloadQueue] = useState({}) // trackId -> {status, message}
  // Radio state
  const [radioTracks, setRadioTracks] = useState(null) // null = not in radio view
  const [radioSeed, setRadioSeed] = useState('')
  const [radioSource, setRadioSource] = useState('')
  const [radioLoading, setRadioLoading] = useState(false)
  // Context menu
  const [discoverCtx, setDiscoverCtx] = useState(null) // {x, y, track}
  const discoverCtxRef = useRef(null)

  // Handle pending radio track from Library
  useEffect(() => {
    if (pendingRadioTrack && connected) {
      loadRadio(pendingRadioTrack)
      onRadioConsumed?.()
    }
  }, [pendingRadioTrack, connected])

  // Close context menu on outside click
  const previewIntervalRef = useRef(null)
  const handlePreviewFromCtx = (startTrack) => {
    const startIdx = tracks.findIndex(t => t.title === startTrack.title && t.artist === startTrack.artist)
    if (startIdx === -1) return
    const playlist = tracks.slice(startIdx)
    let current = 0

    const playNext = async () => {
      if (current >= playlist.length) return
      const t = playlist[current]
      const query = `${t.artist} ${t.title}`.trim()
      try {
        const res = await fetch(`https://itunes.apple.com/search?term=${encodeURIComponent(query)}&media=music&limit=1`)
        const data = await res.json()
        if (data.results?.[0]?.previewUrl) {
          if (audioRef?.current) { audioRef.current.pause() }
          const a = new Audio(data.results[0].previewUrl)
          a.volume = audioRef?.current?.volume ?? 0.8
          setPlayingFile({ ...t, isPreview: true, filename: `${t.artist} - ${t.title}` })
          setNowPlaying(`${t.artist} - ${t.title}`)
          setIsAudioPlaying(true)
          a.play()
          // After 30s, go to next
          previewIntervalRef.current = setTimeout(() => { a.pause(); current++; playNext() }, 30000)
          a.onended = () => { current++; playNext() }
        } else {
          current++; playNext()
        }
      } catch { current++; playNext() }
    }
    // Stop any existing preview
    if (previewIntervalRef.current) clearTimeout(previewIntervalRef.current)
    playNext()
  }

  useEffect(() => {
    if (!discoverCtx) return
    const handleClick = (e) => {
      if (discoverCtxRef.current && !discoverCtxRef.current.contains(e.target)) setDiscoverCtx(null)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [discoverCtx])

  const radioListenerRef = useRef(null)

  const radioTracksRef = useRef([])

  const loadRadio = (track) => {
    setDiscoverCtx(null)
    setRadioLoading(true)
    setRadioTracks([])
    radioTracksRef.current = []
    setRadioSeed(`${track.artist} - ${track.title}`)
    setRadioSource('radio')

    const ws = wsRef?.current
    if (!ws || ws.readyState !== 1) return

    // Remove previous listener
    if (radioListenerRef.current) {
      ws.removeEventListener('message', radioListenerRef.current)
    }

    // Create new listener
    const handler = (e) => {
      try {
        const data = JSON.parse(e.data)
        if (data.type === 'radio_start') {
          radioTracksRef.current = []
          setRadioTracks([])
        } else if (data.type === 'radio_count') {
          setRadioSource(`${data.total} tracks`)
        } else if (data.type === 'radio_track') {
          radioTracksRef.current = [...radioTracksRef.current, data.track]
            .sort((a, b) => (b.match || 0) - (a.match || 0) || (a.key_compat ?? 99) - (b.key_compat ?? 99))
          radioTracksRef.current.forEach((tr, i) => { tr.position = i + 1 })
          setRadioTracks([...radioTracksRef.current])
        } else if (data.type === 'radio_done') {
          setRadioLoading(false)
        } else if (data.type === 'radio_error') {
          setRadioLoading(false)
        }
      } catch {}
    }
    radioListenerRef.current = handler
    ws.addEventListener('message', handler)

    // Send request
    ws.send(JSON.stringify({
      type: 'radio',
      artist: track.artist,
      title: track.title,
      seed_key: track.key || '',
    }))
  }

  // Load genres
  useEffect(() => {
    fetch(`${API_BASE}/api/discover/genres?user=${encodeURIComponent(authUser?.name || '')}`).then(r => r.json()).then(setGenres).catch(() => {})
  }, [authUser])

  // Load chart when genre changes
  const loadChart = async (genre, force = false) => {
    setSelectedGenre(genre)
    setLoading(true)
    setTracks([])
    try {
      const params = genre ? `?genre_id=${genre.beatport_id}&slug=${genre.slug}` : ''
      const forceParam = force ? `${params ? '&' : '?'}force=1` : ''
      const res = await fetch(`${API_BASE}/api/discover/chart${params}${forceParam}`)
      const data = await res.json()
      setTracks(data.tracks || [])
    } catch (e) {
      console.error('Failed to load chart', e)
    } finally {
      setLoading(false)
    }
  }

  // Load "All" on mount
  useEffect(() => { loadChart(null) }, [])

  const clearDiscoverAudio = () => {
    setPlayingId(null)
    setPlayingFile(null)
    setNowPlaying(null)
    setIsAudioPlaying(false)
  }

  const setDiscoverAudio = (audio, track) => {
    audioRef.current = audio
    setPlayingId(track.id)
    setPlayingFile(`discover-${track.id}`)
    setNowPlaying({ filename: `discover-${track.id}`, title: track.title, artist: track.artist, isPreview: true })
    setIsAudioPlaying(true)
  }

  const playPreview = (track) => {
    if (playingId === track.id) {
      if (audioRef.current) { audioRef.current.pause(); audioRef.current = null }
      clearDiscoverAudio()
      return
    }
    if (audioRef.current) audioRef.current.pause()

    // Try Beatport sample_url first, then iTunes
    const tryPlay = (url) => {
      const audio = new Audio(url)
      audio.onended = () => { clearDiscoverAudio(); audioRef.current = null }
      audio.onerror = () => {
        // Fallback to iTunes
        fetch(`https://itunes.apple.com/search?term=${encodeURIComponent(`${track.artist} ${track.title}`)}&media=music&limit=1`)
          .then(r => r.json())
          .then(data => {
            if (data.results?.[0]?.previewUrl) {
              const a2 = new Audio(data.results[0].previewUrl)
              a2.onended = () => { clearDiscoverAudio(); audioRef.current = null }
              a2.play().catch(() => clearDiscoverAudio())
              setDiscoverAudio(a2, track)
            } else {
              clearDiscoverAudio()
            }
          })
          .catch(() => clearDiscoverAudio())
      }
      audio.play().catch(() => {
        audio.onerror()
      })
      setDiscoverAudio(audio, track)
    }

    if (track.sample_url) {
      tryPlay(track.sample_url)
    } else {
      // Directly try iTunes
      fetch(`https://itunes.apple.com/search?term=${encodeURIComponent(`${track.artist} ${track.title}`)}&media=music&limit=1`)
        .then(r => r.json())
        .then(data => {
          if (data.results?.[0]?.previewUrl) {
            const audio = new Audio(data.results[0].previewUrl)
            audio.onended = () => { clearDiscoverAudio(); audioRef.current = null }
            audio.play().catch(() => clearDiscoverAudio())
            setDiscoverAudio(audio, track)
          } else {
            clearDiscoverAudio()
          }
        })
        .catch(() => clearDiscoverAudio())
    }
  }

  const searchAndDownload = (track) => {
    if (!wsRef?.current || wsRef.current.readyState !== 1 || !username || !password) {
      setDownloadQueue(prev => ({ ...prev, [track.id]: { status: 'error', message: 'No conectado a SoulSeek' } }))
      return
    }
    const query = `${track.artist} - ${track.title}`.replace(/[()[\]{}]/g, '')
    setDownloadQueue(prev => ({ ...prev, [track.id]: { status: 'searching', message: `Buscando...` } }))

    // Listen for search results
    const handler = (e) => {
      try {
        const data = JSON.parse(e.data)
        if (data.type === 'search_results' && downloadQueue[track.id]?.status !== 'downloading') {
          const results = data.results || []
          if (results.length > 0) {
            // Auto-pick best result and download
            setDownloadQueue(prev => ({ ...prev, [track.id]: { status: 'downloading', message: `Descargando de ${results[0].sources?.[0]?.username || 'peer'}...` } }))
            wsRef.current.send(JSON.stringify({
              type: 'download_single',
              username, password,
              result: results[0],
              app_user: authUser?.name || '',
            }))
          } else {
            setDownloadQueue(prev => ({ ...prev, [track.id]: { status: 'not_found', message: 'No encontrado en SoulSeek' } }))
            addToPending({ artist: track.artist, title: track.title, source: 'discover' })
          }
          wsRef.current.removeEventListener('message', handler)
        }
        if (data.type === 'search_dl_status') {
          const fname = data.filename || ''
          // Match by partial track name
          const trackName = `${track.artist} ${track.title}`.toLowerCase()
          if (fname.toLowerCase().includes(track.title?.toLowerCase()?.slice(0, 20) || '---')) {
            if (data.status === 'completed') {
              setDownloadQueue(prev => ({ ...prev, [track.id]: { status: 'done', message: 'Descargado' } }))
              // Refresh manifest to update "in library" marks
              fetch(`${API_BASE}/api/metadata?user=${encodeURIComponent(authUser?.name || '')}`).then(r => r.json()).then(setLibraryManifest).catch(() => {})
              wsRef.current.removeEventListener('message', handler)
            } else if (data.status === 'error') {
              setDownloadQueue(prev => ({ ...prev, [track.id]: { status: 'error', message: 'Error al descargar' } }))
              addToPending({ artist: track.artist, title: track.title, source: 'discover' })
              wsRef.current.removeEventListener('message', handler)
            }
          }
        }
      } catch {}
    }
    wsRef.current.addEventListener('message', handler)

    // Send search
    wsRef.current.send(JSON.stringify({
      type: 'search_slsk',
      username, password,
      query,
    }))

    // Timeout after 30s
    setTimeout(() => {
      setDownloadQueue(prev => {
        const curr = prev[track.id]
        if (curr?.status === 'searching') {
          wsRef.current?.removeEventListener('message', handler)
          addToPending({ artist: track.artist, title: track.title, source: 'discover' })
          return { ...prev, [track.id]: { status: 'not_found', message: 'No encontrado' } }
        }
        return prev
      })
    }, 30000)
  }

  const formatDuration = (ms) => {
    if (!ms) return '-'
    const m = Math.floor(ms / 60000)
    const s = Math.floor((ms % 60000) / 1000)
    return `${m}:${s.toString().padStart(2, '0')}`
  }

  // Subtle accent colors per genre
  const genreAccents = {
    'Tech House': '#3b82f6',
    'Melodic House': '#8b5cf6',
    'Afro House': '#f59e0b',
    'Deep House': '#6366f1',
    'Hip Hop': '#ef4444',
    'Nu Disco': '#ec4899',
    'Downtempo': '#14b8a6',
    'Electro': '#eab308',
    'Indie Dance': '#a78bfa',
    'Melodic Techno': '#c084fc',
    'Minimal Tech': '#64748b',
    'Progressive House': '#10b981',
    'Trance': '#06b6d4',
    'Peak Time Techno': '#f43f5e',
  }
  const accentColor = selectedGenre ? (genreAccents[selectedGenre.name] || '#22c55e') : '#22c55e'

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-[var(--bg-app)] relative">
      {/* Header with artwork mosaic background */}
      <div className="flex-shrink-0 relative overflow-hidden h-36">
        {/* Artwork mosaic background from first tracks */}
        <div className="absolute inset-0 flex flex-wrap opacity-30">
          {tracks.slice(0, 20).map((t, i) => t.artwork_url && (
            <img key={i} src={t.artwork_url.replace('1400x1400', '100x100')} alt="" className="w-1/10 h-1/4 object-cover" style={{width: '10%', height: '50%'}} />
          ))}
        </div>
        {/* Gradient overlay */}
        <div className="absolute inset-0" style={{background: `linear-gradient(135deg, ${accentColor}90 0%, ${accentColor}50 30%, rgba(15,23,42,0.95) 70%, rgba(15,23,42,1) 100%)`}} />
        {/* Blur overlay for smoothness */}
        <div className="absolute inset-0 backdrop-blur-sm" />

        <div className="relative h-full flex flex-col justify-end gap-3 px-8 pb-4">
          <div className="flex items-start justify-between">
            <div>
              <span className="text-xs font-medium uppercase tracking-widest" style={{color: `${accentColor}`}}>Beatport Charts</span>
              <div className="flex items-center gap-5 mt-1">
                <h1 className="text-3xl font-bold text-white tracking-tight">
                  {selectedGenre ? selectedGenre.name : 'Top 100'}
                </h1>
                {tracks.length > 0 && <span className="text-sm text-white/40">{tracks.length} tracks</span>}
                {loading && <span className="text-sm text-white/40">Cargando...</span>}
                {!loading && (
                  <button
                    onClick={async () => {
                      if (agentConnected) {
                        try {
                          toast('Scrapeando Beatport...', 'warning', 5000)
                          await fetch(`${AGENT_BASE}/api/refresh-charts`, { method: 'POST' })
                          toast('Charts actualizados')
                        } catch { toast('Error al scrapear', 'error') }
                      }
                      loadChart(selectedGenre, true)
                    }}
                    className="p-2 rounded-lg hover:bg-white/20 transition-all active:scale-95"
                    title={agentConnected ? "Scrapear Beatport y actualizar" : "Actualizar chart"}
                  >
                    <svg className="w-5 h-5 text-white/60" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                    </svg>
                  </button>
                )}
              </div>
            </div>
            {/* Featured artwork */}
            {tracks[0]?.artwork_url && (
              <div className="flex gap-2">
                {tracks.slice(0, 3).map((t, i) => t.artwork_url && (
                  <img key={i} src={t.artwork_url.replace('1400x1400', '250x250')} alt=""
                    className="w-16 h-16 rounded-lg object-cover ring-1 ring-white/10 shadow-xl"
                    style={{opacity: 1 - i * 0.2, transform: `rotate(${(i - 1) * 3}deg)`}}
                  />
                ))}
              </div>
            )}
          </div>

          {/* Genre pills - single line with horizontal scroll */}
          <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-none w-full">
            <button
              onClick={() => loadChart(null)}
              className={`flex-shrink-0 px-3 py-1.5 rounded-lg text-xs font-medium transition-all duration-200 active:scale-95 ${
                !selectedGenre ? 'text-white font-semibold' : 'text-white/50 hover:text-white'
              }`}
              style={!selectedGenre ? { background: `rgba(${GENRE_COLORS[0].rgb}, 0.3)` } : {}}
            >
              All
            </button>
            {genres.map((g, gi) => {
              const isActive = selectedGenre?.name === g.name
              const c = GENRE_COLORS[gi % GENRE_COLORS.length]
              return (
                <button
                  key={g.name}
                  onClick={() => loadChart(g)}
                  className={`flex-shrink-0 px-3 py-1.5 rounded-lg text-xs font-medium transition-all duration-200 active:scale-95 ${
                    isActive ? 'text-white font-semibold' : 'text-white/50 hover:text-white'
                  }`}
                  style={isActive ? { background: `rgba(${c.rgb}, 0.3)` } : {}}
                >
                  {g.name}
                </button>
              )
            })}
          </div>
        </div>
      </div>

      {/* Track list */}
      {loading ? (
        <div className="flex-1 flex items-center justify-center">
          <div className="flex flex-col items-center gap-4 text-gray-400">
            <div className="w-8 h-8 border-3 border-green-400 border-t-transparent rounded-full animate-spin" />
            <span className="text-sm">Cargando chart...</span>
          </div>
        </div>
      ) : tracks.length === 0 ? (
        <div className="flex-1 flex items-center justify-center text-gray-600">
          <div className="text-center space-y-2">
            <p className="text-4xl">&#127925;</p>
            <p>No se encontraron tracks</p>
          </div>
        </div>
      ) : (
        <div className="flex-1 min-h-0 overflow-y-auto">
          <div className="px-6 py-3">
            {tracks.map((t, i) => {
              const isPlaying = playingId === t.id
              return (
                <div key={t.id || i}
                  onContextMenu={(e) => { e.preventDefault(); setDiscoverCtx({ x: e.clientX, y: e.clientY, track: t }) }}
                  className={`group flex items-center gap-4 px-4 py-3 rounded-xl mb-1 transition-all duration-200 ${
                  isPlaying ? 'bg-green-500/10 ring-1 ring-green-500/30' : 'hover:bg-[var(--bg-hover)]'
                }`}>
                  {/* Position number - shows play on hover */}
                  <div className="w-8 flex-shrink-0 text-center">
                    <span className={`text-sm font-mono group-hover:hidden ${isPlaying ? 'text-green-400 font-bold' : 'text-gray-600'}`}>
                      {t.position || i + 1}
                    </span>
                    <PlayPauseBtn isPlaying={isPlaying} onClick={() => playPreview(t)} className={`hidden group-hover:flex ${isPlaying ? '!text-green-400' : ''}`} />
                  </div>

                  {/* Artwork */}
                  <button
                    onClick={() => playPreview(t)}
                    className={`w-12 h-12 flex-shrink-0 rounded-lg overflow-hidden relative group/art transition-all duration-200 ${
                      isPlaying ? 'ring-2 ring-green-400 shadow-lg shadow-green-500/20' : 'ring-1 ring-white/10'
                    }`}
                  >
                    {t.artwork_url ? (
                      <img src={t.artwork_url.replace('1400x1400', '250x250')} alt="" className="w-full h-full object-cover" loading="lazy" />
                    ) : (
                      <div className="w-full h-full bg-gradient-to-br from-gray-700 to-gray-800 flex items-center justify-center">
                        <svg className="w-5 h-5 text-gray-500" fill="currentColor" viewBox="0 0 24 24"><path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55C7.79 13 6 14.79 6 17s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z"/></svg>
                      </div>
                    )}
                    {isPlaying && (
                      <div className="absolute inset-0 bg-black/30 flex items-center justify-center">
                        <div className="flex items-end gap-0.5 h-4">
                          <div className="w-1 bg-green-400 rounded-full animate-pulse" style={{height: '60%', animationDelay: '0ms'}} />
                          <div className="w-1 bg-green-400 rounded-full animate-pulse" style={{height: '100%', animationDelay: '150ms'}} />
                          <div className="w-1 bg-green-400 rounded-full animate-pulse" style={{height: '40%', animationDelay: '300ms'}} />
                          <div className="w-1 bg-green-400 rounded-full animate-pulse" style={{height: '80%', animationDelay: '450ms'}} />
                        </div>
                      </div>
                    )}
                  </button>

                  {/* Track info */}
                  <div className="flex-1 min-w-0">
                    <div className={`text-sm font-medium truncate flex items-center gap-1.5 ${isPlaying ? 'text-green-400' : 'text-[var(--text-primary)]'}`}>
                      {t.title}
                      {isInLibrary(t) && <span className="flex-shrink-0 w-2 h-2 rounded-full bg-emerald-500" title="En tu biblioteca" />}
                    </div>
                    <div className="text-xs text-gray-500 truncate mt-0.5">{t.artist}</div>
                  </div>

                  {/* Metadata pills */}
                  <div className="hidden xl:flex items-center gap-2 flex-shrink-0">
                    {t.genre && (
                      <span className="px-2 py-0.5 rounded-full bg-white/5 text-xs text-gray-400">{t.genre}</span>
                    )}
                    {t.label && (
                      <span className="px-2 py-0.5 rounded-full bg-white/5 text-xs text-gray-500 max-w-28 truncate">{t.label}</span>
                    )}
                  </div>

                  {/* BPM & Key */}
                  <div className="flex items-center gap-3 flex-shrink-0">
                    <span className="text-xs text-gray-500 font-mono w-8 text-center">{t.bpm || '-'}</span>
                    <span className={`text-xs font-mono px-2 py-0.5 rounded ${t.key ? 'bg-amber-500/10 text-amber-400' : 'text-gray-700'}`}>{t.key || '-'}</span>
                    <span className="text-xs text-gray-600 w-10 text-center">{formatDuration(t.duration_ms)}</span>
                  </div>

                  {/* Action button */}
                  {(() => {
                    const dl = downloadQueue[t.id]
                    if (!dl) return (
                      <button
                        onClick={() => searchAndDownload(t)}
                        className="flex-shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-full text-xs font-medium transition-all duration-200 active:scale-95 opacity-60 group-hover:opacity-100"
                        style={{ background: 'var(--color-accent)', color: 'var(--color-accent-text)' }}
                      >
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                        </svg>
                        Descargar
                      </button>
                    )
                    if (dl.status === 'searching') return (
                      <span className="flex-shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-full text-xs text-yellow-400 animate-pulse">
                        <div className="w-3 h-3 border-2 border-yellow-400 border-t-transparent rounded-full animate-spin" />
                        Buscando...
                      </span>
                    )
                    if (dl.status === 'downloading') return (
                      <span className="flex-shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-full text-xs text-[var(--color-accent)] animate-pulse">
                        <div className="w-3 h-3 border-2 border-[var(--color-accent)] border-t-transparent rounded-full animate-spin" />
                        Descargando
                      </span>
                    )
                    if (dl.status === 'done') return (
                      <span className="flex-shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-full text-xs text-green-400 bg-green-500/10">
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                        Listo
                      </span>
                    )
                    if (dl.status === 'not_found') return (
                      <button
                        onClick={() => { setDownloadQueue(prev => { const n = {...prev}; delete n[t.id]; return n }); searchAndDownload(t) }}
                        className="flex-shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-full text-xs text-gray-500 bg-gray-800 hover:bg-gray-700 transition-all"
                      >
                        No encontrado - Reintentar
                      </button>
                    )
                    return (
                      <button
                        onClick={() => { setDownloadQueue(prev => { const n = {...prev}; delete n[t.id]; return n }) }}
                        className="flex-shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-full text-xs text-red-400 bg-red-500/10 hover:bg-red-500/20 transition-all"
                      >
                        Error - Cerrar
                      </button>
                    )
                  })()}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Radio view - overlays the track list */}
      {radioTracks !== null && (
        <div className="absolute inset-0 z-20 bg-[var(--bg-app)] flex flex-col">
          {/* Radio header */}
          <div className="flex-shrink-0 px-6 py-4 border-b border-[var(--border-color)] bg-[var(--bg-panel)]">
            <div className="flex items-center gap-3">
              <button
                onClick={() => { setRadioTracks(null); setRadioSeed(''); setRadioSource('') }}
                className="p-1.5 rounded-lg text-gray-400 hover:text-[var(--text-primary,white)] hover:bg-gray-700 transition-all duration-200"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
              </button>
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-[var(--text-primary)]">Radio</span>
                  <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-white/10 text-gray-400 uppercase tracking-wider">{radioSource}</span>
                  {radioLoading && <div className="w-4 h-4 border-2 border-[var(--color-accent)] border-t-transparent rounded-full animate-spin" />}
                </div>
                <div className="text-xs text-gray-500 mt-0.5 truncate">Similar a: {radioSeed}</div>
              </div>
            </div>
          </div>
          {/* Radio tracks */}
          {!radioLoading && radioTracks.length === 0 ? (
            <div className="flex-1 flex items-center justify-center text-gray-600">
              <p className="text-lg">No se encontraron tracks similares</p>
            </div>
          ) : (
            <div className="flex-1 min-h-0 overflow-y-auto">
              <div className="px-6 py-3">
                {radioTracks.map((t, i) => {
                  const isPlaying = playingId === t.id
                  return (
                    <div key={t.id || i}
                      onContextMenu={(e) => { e.preventDefault(); setDiscoverCtx({ x: e.clientX, y: e.clientY, track: t }) }}
                      className={`group flex items-center gap-4 px-4 py-3 rounded-xl mb-1 transition-all duration-200 ${
                      isPlaying ? 'bg-green-500/10 ring-1 ring-green-500/30' : 'hover:bg-[var(--bg-hover)]'
                    }`}>
                      <div className="w-8 flex-shrink-0 text-center">
                        <span className={`text-sm font-mono group-hover:hidden ${isPlaying ? 'text-green-400 font-bold' : 'text-gray-600'}`}>
                          {t.position || i + 1}
                        </span>
                        <PlayPauseBtn isPlaying={isPlaying} onClick={() => playPreview(t)} className={`hidden group-hover:flex ${isPlaying ? '!text-green-400' : ''}`} />
                      </div>
                      <button
                        onClick={() => playPreview(t)}
                        className={`w-12 h-12 flex-shrink-0 rounded-lg overflow-hidden relative transition-all duration-200 ${
                          isPlaying ? 'ring-2 ring-green-400 shadow-lg shadow-green-500/20' : 'ring-1 ring-white/10'
                        }`}
                      >
                        {t.artwork_url ? (
                          <img src={t.artwork_url} alt="" className="w-full h-full object-cover" loading="lazy" />
                        ) : (
                          <div className="w-full h-full bg-gradient-to-br from-gray-700 to-gray-800 flex items-center justify-center">
                            <svg className="w-5 h-5 text-gray-500" fill="currentColor" viewBox="0 0 24 24"><path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55C7.79 13 6 14.79 6 17s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z"/></svg>
                          </div>
                        )}
                        {isPlaying && (
                          <div className="absolute inset-0 bg-black/30 flex items-center justify-center">
                            <div className="flex items-end gap-0.5 h-4">
                              <div className="w-1 bg-green-400 rounded-full animate-pulse" style={{height: '60%', animationDelay: '0ms'}} />
                              <div className="w-1 bg-green-400 rounded-full animate-pulse" style={{height: '100%', animationDelay: '150ms'}} />
                              <div className="w-1 bg-green-400 rounded-full animate-pulse" style={{height: '40%', animationDelay: '300ms'}} />
                              <div className="w-1 bg-green-400 rounded-full animate-pulse" style={{height: '80%', animationDelay: '450ms'}} />
                            </div>
                          </div>
                        )}
                      </button>
                      <div className="flex-1 min-w-0">
                        <div className={`text-sm font-medium truncate ${isPlaying ? 'text-green-400' : 'text-[var(--text-primary)]'}`}>{t.title}</div>
                        <div className="text-xs text-gray-500 truncate mt-0.5">{t.artist}</div>
                      </div>
                      <div className="hidden xl:flex items-center gap-2 flex-shrink-0">
                        {t.genre && <span className="px-2 py-0.5 rounded-full bg-white/5 text-xs text-gray-400">{t.genre}</span>}
                      </div>
                      <div className="flex items-center gap-3 flex-shrink-0">
                        {t.match > 0 && <span className="text-[10px] text-gray-600 w-8 text-center">{t.match}%</span>}
                        <span className="text-xs text-gray-500 font-mono w-8 text-center">{t.bpm || '-'}</span>
                        <span className={`text-xs font-mono px-2 py-0.5 rounded w-20 text-center ${t.key ? (t.key_compat <= 2 ? 'bg-green-500/20 text-green-400' : t.key_compat <= 4 ? 'bg-amber-500/10 text-amber-400' : 'bg-white/5 text-gray-400') : 'text-gray-700'}`}>{t.key || '-'}</span>
                        <span className="text-xs text-gray-600 w-10 text-center">{formatDuration(t.duration_ms)}</span>
                      </div>
                      {(() => {
                        const dl = downloadQueue[t.id]
                        if (!dl) return (
                          <button
                            onClick={() => searchAndDownload(t)}
                            className="flex-shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-full text-xs font-medium transition-all duration-200 active:scale-95 opacity-60 group-hover:opacity-100"
                            style={{ background: 'var(--color-accent)', color: 'var(--color-accent-text)' }}
                          >
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                            </svg>
                            Descargar
                          </button>
                        )
                        if (dl.status === 'searching') return <span className="flex-shrink-0 text-xs text-yellow-400 animate-pulse">Buscando...</span>
                        if (dl.status === 'downloading') return <span className="flex-shrink-0 text-xs text-[var(--color-accent)] animate-pulse">Descargando</span>
                        if (dl.status === 'done') return <span className="flex-shrink-0 text-xs text-green-400">Listo</span>
                        if (dl.status === 'not_found') return (
                          <button onClick={() => { setDownloadQueue(prev => { const n = {...prev}; delete n[t.id]; return n }); searchAndDownload(t) }}
                            className="flex-shrink-0 text-xs text-gray-500 hover:text-gray-300">Reintentar</button>
                        )
                        return <span className="flex-shrink-0 text-xs text-red-400">Error</span>
                      })()}
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Context menu for radio */}
      {discoverCtx && (
        <div
          ref={discoverCtxRef}
          className="fixed z-50 bg-[var(--bg-panel)] border border-gray-700 rounded-lg shadow-2xl py-1 min-w-48"
          style={{ left: Math.min(discoverCtx.x, window.innerWidth - 220), top: Math.min(discoverCtx.y, window.innerHeight - 150) }}
        >
          <div className="px-3 py-1.5 text-xs text-gray-500 border-b border-[var(--border-color)] truncate">
            {discoverCtx.track?.artist} - {discoverCtx.track?.title}
          </div>
          <button
            onClick={() => { handlePreviewFromCtx(discoverCtx.track); setDiscoverCtx(null) }}
            className="w-full text-left px-3 py-2 text-sm text-[var(--color-accent)] hover:bg-[var(--color-accent)]/10 transition-colors flex items-center gap-2"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            Preview continuo (30s c/u)
          </button>
          <button
            onClick={() => loadRadio(discoverCtx.track)}
            className="w-full text-left px-3 py-2 text-sm text-gray-300 hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary,white)] transition-colors flex items-center gap-2"
          >
            <svg className="w-4 h-4 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" />
            </svg>
            Radio
          </button>
        </div>
      )}

      {/* Download activity toast */}
      {(() => {
        const active = Object.entries(downloadQueue).filter(([, d]) => d.status === 'searching' || d.status === 'downloading')
        const done = Object.entries(downloadQueue).filter(([, d]) => d.status === 'done')
        const errors = Object.entries(downloadQueue).filter(([, d]) => d.status === 'not_found' || d.status === 'error')
        if (active.length === 0 && done.length === 0) return null
        return (
          <div className="flex-shrink-0 border-t border-[var(--border-color)] bg-[var(--bg-panel)] px-6 py-2.5 flex items-center justify-between">
            <div className="flex items-center gap-4">
              {active.length > 0 && (
                <span className="flex items-center gap-2 text-xs text-[var(--color-accent)]">
                  <div className="w-3 h-3 border-2 border-[var(--color-accent)] border-t-transparent rounded-full animate-spin" />
                  {active.length} descargando...
                </span>
              )}
              {done.length > 0 && (
                <span className="flex items-center gap-2 text-xs text-green-400">
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  {done.length} descargados
                </span>
              )}
              {errors.length > 0 && (
                <span className="text-xs text-gray-500">{errors.length} no encontrados</span>
              )}
            </div>
            <div className="flex items-center gap-2">
              {(done.length > 0 || active.length > 0) && (
                <button
                  onClick={onGoToDownloads}
                  className="text-xs text-[var(--color-accent)] hover:brightness-125 transition-all"
                >
                  Ver descargas
                </button>
              )}
              {active.length === 0 && (
                <button
                  onClick={() => setDownloadQueue({})}
                  className="text-xs text-gray-600 hover:text-gray-400 transition-colors"
                >
                  Limpiar
                </button>
              )}
            </div>
          </div>
        )
      })()}
    </div>
  )
}

function AppWithToast() {
  return (
    <ToastProvider>
      <App />
    </ToastProvider>
  )
}

export default AppWithToast
