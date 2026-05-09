import { useState, useEffect, useRef, useCallback, useMemo, forwardRef, useImperativeHandle, createContext, useContext } from 'react'
import { fsaBackend, makeStorage } from './storage'

// Toast notification system
const ToastContext = createContext()
function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([])
  const show = useCallback((msg, type = 'success', duration = 3000) => {
    const id = Date.now()
    // Prevent duplicate messages (skip if same msg already showing)
    setToasts(prev => {
      if (prev.some(t => t.msg === msg)) return prev
      return [...prev.slice(-4), { id, msg, type }]
    })
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

function TrackRow({ track, onCancel }) {
  return (
    <div className={`flex items-center gap-2 md:gap-3 px-3 md:px-4 py-2 md:py-2.5 border-b border-[var(--border-color)] transition-all duration-200 group ${
      track.status === 'downloading' ? 'bg-[var(--color-accent)]/5' :
      track.status === 'completed' ? 'bg-green-500/5' :
      track.status === 'skipped' ? 'bg-cyan-500/5' : ''
    }`}>
      <span className="text-gray-500 text-xs md:text-sm w-6 md:w-8 text-right flex-shrink-0">{track.id + 1}</span>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-[var(--text-primary)] truncate font-medium text-xs md:text-sm">{track.title}</span>
          {track.format && (
            <span className="hidden sm:inline text-xs px-1.5 py-0.5 rounded bg-gray-700 text-gray-300 flex-shrink-0">
              {track.format}
            </span>
          )}
        </div>
        <div className="text-xs md:text-sm text-gray-400 truncate">
          {track.artist}
          <span className="hidden sm:inline">
            {track.source_user && <span className="text-gray-600"> &middot; de {track.source_user}</span>}
            {track.size_mb > 0 && <span className="text-gray-600"> &middot; {track.size_mb} MB</span>}
          </span>
        </div>
      </div>

      <div className="flex items-center gap-2 md:gap-3 flex-shrink-0">
        {track.status === 'downloading' && track.progress > 0 && (
          <div className="w-16 md:w-24 flex items-center gap-1 md:gap-2">
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
          <div className="w-4 h-4 md:w-5 md:h-5 border-2 border-yellow-500 border-t-transparent rounded-full animate-spin" />
        )}
        <span className={`text-[10px] md:text-xs px-1.5 md:px-2 py-0.5 md:py-1 rounded-full ${STATUS_COLORS[track.status] || 'bg-gray-700'}`}>
          {STATUS_LABELS[track.status] || track.status}
        </span>
        {onCancel && track.status !== 'completed' && (
          <button
            onClick={() => onCancel(track)}
            title="Cancelar / quitar de la lista"
            className="opacity-0 group-hover:opacity-100 p-1 rounded text-gray-500 hover:text-red-400 hover:bg-red-500/10 transition-all"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        )}
      </div>
    </div>
  )
}

const API_BASE = ['5173', '5174', '5175'].includes(window.location.port) ? 'http://localhost:8899' : 'https://slsk-backend-7da97b8a965d.herokuapp.com'

// Stable per-browser device id + human label. Used para que el banner de
// "temas en cola desde otros dispositivos" solo cuente los que realmente
// vienen de OTRO device, no los que vos mismo agregaste acá.
function getDeviceInfo() {
  let id = localStorage.getItem('device_id')
  if (!id) {
    id = (crypto.randomUUID?.() || `dev-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`)
    localStorage.setItem('device_id', id)
  }
  const ua = navigator.userAgent || ''
  let name = 'Desktop'
  if (/iPhone/i.test(ua)) name = 'iPhone'
  else if (/iPad/i.test(ua)) name = 'iPad'
  else if (/Android/i.test(ua)) name = 'Android'
  else if (/Mac/i.test(ua)) name = 'Mac'
  else if (/Windows/i.test(ua)) name = 'Windows'
  else if (/Linux/i.test(ua)) name = 'Linux'
  return { id, name }
}
const DEVICE = typeof window !== 'undefined' ? getDeviceInfo() : { id: 'server', name: 'Server' }
let AGENT_BASE = 'http://localhost:9900'
let AGENT_MODE = 'local' // 'local' = direct, 'proxy' = through server
let AGENT_USER = ''
let AGENT_CONNECTED = false

// Build agent API URL — direct or proxied through the server
function agentUrl(path) {
  if (AGENT_MODE === 'proxy') {
    const sep = path.includes('?') ? '&' : '?'
    return `${API_BASE}/api/agent/proxy/${path}${sep}u=${encodeURIComponent(AGENT_USER)}`
  }
  return `${AGENT_BASE}/api/${path}`
}

// Fetch wrapper for agent calls — emits toast on errors/timeouts
async function agentFetch(path, opts = {}) {
  if (!AGENT_CONNECTED) {
    const msg = 'Agente no conectado — esta acción requiere el agente local corriendo'
    window.dispatchEvent(new CustomEvent('agent-error', { detail: msg }))
    throw new Error(msg)
  }
  const url = typeof path === 'string' && !path.startsWith('http') ? agentUrl(path) : path
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(30000), ...opts })
    if (!res.ok) {
      // Clone before reading body so callers can still call res.json()/text()
      const msg = await res.clone().text().catch(() => res.statusText)
      window.dispatchEvent(new CustomEvent('agent-error', { detail: `Agent ${res.status}: ${msg.slice(0, 120)}` }))
    }
    return res
  } catch (e) {
    const msg = e.name === 'TimeoutError' ? 'Agent timeout' : `Agent error: ${e.message}`
    window.dispatchEvent(new CustomEvent('agent-error', { detail: msg }))
    throw e
  }
}

function getAudioUrl(file, useAgent) {
  if (useAgent) {
    const path = file.in_subfolder && file.subfolder
      ? 'audio/' + encodeURIComponent(file.subfolder) + '/' + encodeURIComponent(file.filename)
      : 'audio/' + encodeURIComponent(file.filename)
    return agentUrl(path)
  }
  const base = API_BASE + '/audio/'
  if (file.in_subfolder && file.subfolder) {
    return base + encodeURIComponent(file.subfolder) + '/' + encodeURIComponent(file.filename)
  }
  return base + encodeURIComponent(file.filename)
}

async function createAudioElement(file, useAgent) {
  // Prefer FSA: file lives on user's local disk via a directory handle.
  // Heroku's /audio/ has no files (downloads land on the agent or in FSA),
  // so when the agent path is disabled (FSA-ready desktop), this is the only
  // way <audio> can actually find the bytes.
  if (await fsaBackend.ready()) {
    const fsaUrl = await fsaBackend.getFileUrl(file.filename, file.subfolder)
    if (fsaUrl) return new Audio(fsaUrl)
  }
  const url = getAudioUrl(file, useAgent)
  // Use Audio element directly — Chrome allows <audio> to load from localhost
  // even on HTTPS pages (unlike fetch which gets blocked by private network policy)
  return new Audio(url)
}

// Detach handlers + pause + clear src so a stale audio element can't fire
// onended/onerror later and trigger setNowPlaying(null) or autoplay advance
// after the user moved on to another track.
function killAudio(a) {
  if (!a) return
  try { a.onended = null } catch {}
  try { a.onerror = null } catch {}
  try { a.oncanplaythrough = null } catch {}
  try { a.pause() } catch {}
  try {
    if (a.src && a.src.startsWith('blob:')) URL.revokeObjectURL(a.src)
  } catch {}
  try { a.src = '' } catch {}
}

// ScreenHint — modern dismissible mini-guide shown above each main screen.
// Auto-rotates tips, gradient bg, animated icon, persisted-dismiss per screen.
function ScreenHint({ id, title, tips }) {
  const [dismissed, setDismissed] = useState(() => !!localStorage.getItem(`hint_${id}_dismissed`))
  const [activeTip, setActiveTip] = useState(0)
  useEffect(() => {
    if (dismissed || !tips || tips.length <= 1) return
    const t = setInterval(() => setActiveTip(i => (i + 1) % tips.length), 4500)
    return () => clearInterval(t)
  }, [dismissed, tips?.length])
  if (dismissed || !tips || !tips.length) return null
  const tip = tips[activeTip]
  return (
    <div className="flex-shrink-0 relative overflow-hidden border-b border-[var(--color-accent)]/30 animate-fade-in">
      {/* Animated gradient background */}
      <div className="absolute inset-0 bg-gradient-to-r from-blue-600/10 via-purple-600/10 to-pink-600/10" />
      <div className="absolute inset-0 opacity-30">
        <div className="absolute -top-10 -left-10 w-40 h-40 rounded-full bg-blue-500/30 blur-3xl animate-blob" />
        <div className="absolute -bottom-10 right-1/4 w-32 h-32 rounded-full bg-purple-500/30 blur-3xl animate-blob animation-delay-2000" />
      </div>
      <div className="relative flex items-center gap-3 px-3 md:px-6 py-2.5">
        <div className="flex-shrink-0 relative">
          <span className="absolute inset-0 rounded-full bg-[var(--color-accent)]/30 blur-md animate-pulse" />
          <span className="relative inline-flex w-8 h-8 rounded-full bg-gradient-to-br from-[var(--color-accent)] to-purple-500 items-center justify-center text-base shadow-lg">{tip.icon || '✨'}</span>
        </div>
        <div className="flex-1 min-w-0">
          {title && <div className="text-[10px] uppercase tracking-wider text-[var(--text-muted)] font-semibold mb-0.5">{title}</div>}
          <div key={activeTip} className="text-xs md:text-sm text-[var(--text-primary)] animate-fade-in-up">
            {typeof tip === 'string' ? tip : tip.text}
          </div>
        </div>
        {tips.length > 1 && (
          <div className="hidden sm:flex flex-shrink-0 items-center gap-1">
            {tips.map((_, i) => (
              <button
                key={i}
                onClick={() => setActiveTip(i)}
                className={`h-1 rounded-full transition-all duration-300 ${i === activeTip ? 'w-5 bg-[var(--color-accent)]' : 'w-1 bg-white/20 hover:bg-white/40'}`}
                aria-label={`Tip ${i + 1}`}
              />
            ))}
          </div>
        )}
        <button
          onClick={() => { localStorage.setItem(`hint_${id}_dismissed`, '1'); setDismissed(true) }}
          className="flex-shrink-0 p-1 rounded text-gray-400 hover:text-white hover:bg-white/10 transition-colors"
          title="No mostrar de nuevo"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
        </button>
      </div>
    </div>
  )
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
        className="relative px-3 md:px-4 py-2.5 md:py-3 cursor-pointer select-none group"
        onClick={onToggle}
        style={{ background: `linear-gradient(135deg, rgba(${colorRgb},0.15) 0%, transparent 60%)` }}
      >
        <div className="flex items-center gap-2 md:gap-3">
          <div className={`w-2.5 md:w-3 h-2.5 md:h-3 rounded-full flex-shrink-0 ${color} ring-2 ring-white/10`} />
          <div className="flex-1 min-w-0">
            <div className="text-xs md:text-sm font-bold text-[var(--text-primary)] truncate">{genre || 'Unsorted'}</div>
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

function AudioPlayerBar({ file, isPlaying, audio: audioProp, audioRef, onPlayPause, onStop, onRadio, agentConnected }) {
  // Helper: always read fresh audio from ref
  const getAudio = () => audioRef?.current || audioProp
  const audio = getAudio()
  const canvasRef = useRef(null)
  const waveformRef = useRef(null) // Float32Array of peaks
  const animFrameRef = useRef(null)
  const lastFileRef = useRef(null)
  // Default state shows just track name + a single play/stop button.
  // Tapping the name flips into wave mode where the canvas takes the full
  // width and tapping anywhere on it seeks. The volume slider was removed
  // (browser default is fine; users can adjust system volume).
  const [waveMode, setWaveMode] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  // Reset to text mode whenever the track changes
  useEffect(() => { setWaveMode(false) }, [file?.filename])

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
      const a = getAudio() // always fresh from ref
      const w = canvas.width
      const h = canvas.height
      ctx.clearRect(0, 0, w, h)

      const peaks = waveformRef.current
      if (a) {
        setCurrentTime(a.currentTime || 0)
        setDuration(a.duration || 0)
      }
      if (!peaks) {
        const pct = (a && a.duration) ? (a.currentTime / a.duration) : 0
        const barY = h / 2 - 3
        const barH = 6
        const accentRgb = getComputedStyle(document.documentElement).getPropertyValue('--color-accent-rgb').trim() || '59,130,246'
        ctx.fillStyle = 'rgba(100,116,139,0.2)'
        ctx.beginPath()
        ctx.roundRect(0, barY, w, barH, 3)
        ctx.fill()
        if (pct > 0) {
          ctx.fillStyle = `rgba(${accentRgb},0.8)`
          ctx.beginPath()
          ctx.roundRect(0, barY, w * pct, barH, 3)
          ctx.fill()
          ctx.fillStyle = `rgb(${accentRgb})`
          ctx.beginPath()
          ctx.arc(w * pct, h / 2, 5, 0, Math.PI * 2)
          ctx.fill()
        }
        return
      }

      const accentRgb = getComputedStyle(document.documentElement).getPropertyValue('--color-accent-rgb').trim() || '59,130,246'
      const bars = peaks.length
      const barW = Math.max((w / bars) - 1, 1)
      const pct = (a && a.duration) ? (a.currentTime / a.duration) : 0

      for (let i = 0; i < bars; i++) {
        const x = (i / bars) * w
        const amp = peaks[i]
        const barH = Math.max(amp * h * 0.9, 2)
        const y = (h - barH) / 2
        if ((i / bars) < pct) {
          ctx.fillStyle = `rgba(${accentRgb},0.9)`
        } else {
          ctx.fillStyle = 'rgba(100,116,139,0.35)'
        }
        ctx.fillRect(x, y, barW, barH)
      }

      if (pct > 0) {
        const px = pct * w
        ctx.fillStyle = 'rgba(255,255,255,0.8)'
        ctx.fillRect(px - 1, 0, 2, h)
      }
    }
    draw()

    return () => {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current)
    }
  }, [file, isPlaying, waveMode])

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
    const a = getAudio()
    if (!a) return
    const dur = a.duration || duration
    if (!dur || !isFinite(dur)) return
    const rect = e.currentTarget.getBoundingClientRect()
    const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width))
    const wasPlaying = !a.paused
    try {
      a.currentTime = pct * dur
    } catch {}
    if (wasPlaying) {
      a.play().catch(() => {})
    }
  }

  if (!file) return null

  // Single button toggles between play (when paused/idle) and stop (when
  // playing). No separate stop button; no pause — the user wanted "stop" to
  // be the second state of "play". A short tap while playing fully stops
  // (clears nowPlaying so the bar disappears); from idle it resumes/plays.
  const handlePrimary = () => {
    if (isPlaying) onStop()
    else onPlayPause()
  }

  // Desktop (md+) always shows title + waveform + actions side-by-side, no
  // toggle needed. On mobile we keep the title-by-default layout with a
  // tap-to-expand wave mode because there isn't enough width for both.
  return (
    <div className="flex-shrink-0 bg-[var(--bg-surface)] border-t border-[var(--border-color)] px-4 py-2">
      <div className="flex items-center gap-3">
        {/* Play / Stop combined button */}
        <button
          onClick={handlePrimary}
          className="w-10 h-10 flex items-center justify-center rounded-full bg-white text-black shadow-md hover:scale-105 active:scale-95 transition-transform flex-shrink-0"
          title={isPlaying ? 'Detener' : 'Reproducir'}
        >
          {isPlaying ? (
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
              <rect x="6" y="6" width="12" height="12" rx="1.5" />
            </svg>
          ) : (
            <svg className="w-5 h-5 ml-0.5" fill="currentColor" viewBox="0 0 24 24">
              <path d="M8 5v14l11-7z" />
            </svg>
          )}
        </button>

        {/* Title block — always visible on desktop (compact width), takes full
            width on mobile when wave mode is collapsed, hidden on mobile when
            the user expanded the wave. The button click only matters on mobile
            (no-op on desktop where wave is already shown). */}
        <button
          onClick={() => setWaveMode(true)}
          className={`text-left rounded px-2 py-1 transition-colors min-w-0 md:cursor-default md:hover:bg-transparent ${
            waveMode ? 'hidden md:block md:flex-shrink-0 md:w-auto md:max-w-[14rem]' : 'flex-1 hover:bg-white/5 active:bg-white/10 md:flex-shrink-0 md:w-auto md:max-w-[14rem] md:hover:bg-transparent'
          }`}
          title="Tocar para ver la onda"
        >
          <div className="text-sm text-[var(--text-primary)] truncate font-medium">
            {file.title || file.filename}
          </div>
          {file.artist && (
            <div className="text-xs text-gray-500 truncate">{file.artist}</div>
          )}
        </button>

        {/* Waveform — always rendered so canvasRef stays mounted. Visually
            hidden on mobile until the user expands wave mode; always shown on
            desktop where it consumes the remaining width. */}
        <div
          className={`relative cursor-pointer min-w-0 h-12 group ${
            waveMode ? 'flex-1' : 'hidden md:block md:flex-1'
          }`}
          onClick={handleSeek}
        >
          <canvas ref={canvasRef} className="absolute inset-0 w-full h-full rounded" width={1600} height={48} />
          <div className="absolute top-0 left-2 text-[10px] text-gray-400 pointer-events-none font-mono">
            {formatTime(currentTime)} / {formatTime(duration)}
          </div>
          {/* Mobile-only collapse button — desktop has no need to collapse */}
          <button
            onClick={(e) => { e.stopPropagation(); setWaveMode(false) }}
            className="md:hidden absolute top-0.5 right-0.5 w-5 h-5 rounded-full bg-black/60 hover:bg-black/80 text-white flex items-center justify-center transition-all"
            title="Volver al título"
          >
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Wave-toggle icon — mobile only, when wave is collapsed */}
        {!waveMode && (
          <button
            onClick={() => setWaveMode(true)}
            className="md:hidden w-7 h-7 flex items-center justify-center rounded-full text-cyan-400 hover:text-cyan-300 hover:bg-cyan-400/10 transition-all flex-shrink-0"
            title="Ver waveform"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
              <path strokeLinecap="round" d="M4 12h2M8 8v8M12 5v14M16 8v8M20 12h-2" />
            </svg>
          </button>
        )}

        {/* Radio button — always visible on both layouts */}
        {onRadio && (file.artist || file.title) && (
          <button
            onClick={() => onRadio(file)}
            className="w-7 h-7 flex items-center justify-center rounded-full text-amber-400 hover:text-amber-300 hover:bg-amber-400/10 transition-all flex-shrink-0"
            title="Radio desde este tema"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
              <circle cx="12" cy="12" r="1.5" fill="currentColor" stroke="none" />
              <path strokeLinecap="round" d="M16.24 7.76a6 6 0 010 8.49M7.76 16.24a6 6 0 010-8.48M19.07 4.93a10 10 0 010 14.14M4.93 19.07a10 10 0 010-14.14" />
            </svg>
          </button>
        )}
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

const Library = forwardRef(function Library({ playingFile, onPlay, onPlayPause, onStop, onStartPreviewMode, previewMode, onStopPreviewMode, agentConnected, onRadio, authUser, collection }, ref) {
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
  const [toolsOpen, setToolsOpen] = useState(false)
  const ctxRef = useRef(null)
  const toolsRef = useRef(null)

  const fetchIdRef = useRef(0)
  const fetchLibrary = useCallback(async () => {
    const id = ++fetchIdRef.current
    // Backfill `collection` field on manifest entries derived from genre.
    // Cheap pure-function call on the server, idempotent. Runs in parallel
    // with metadata fetch so it doesn't block. After a few seconds the
    // metadata reflects the derived universe — no manual classify needed.
    if (authUser?.name) {
      fetch(`${API_BASE}/api/manifest/backfill-collection?user=${encodeURIComponent(authUser.name)}`,
            { method: 'POST' }).catch(() => {})
      // Lazy-cache iTunes preview URLs (~50/call, ~3s each = ~2.5min). Lets
      // iOS play library tracks sync from cached URL instead of fetching on
      // each click (gesture-blocked on iOS).
      fetch(`${API_BASE}/api/manifest/cache-previews`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: authUser.name, limit: 50 }),
      }).catch(() => {})
    }
    try {
      // Fetch metadata from Heroku (Cloudinary = source of truth)
      const metaRes = await fetch(`${API_BASE}/api/metadata?user=${encodeURIComponent(authUser?.name || '')}&collection=${collection}`)
      const metadata = await metaRes.json()

      // Local file scan: prefer FSA, fallback to agent. Mobile (no FSA, no agent)
      // reads the list the desktop last synced to Cloudinary (/api/user-files).
      let localFiles = null
      let didLocalScan = false
      if (await fsaBackend.ready()) {
        const fsaList = await fsaBackend.listLibrary()
        localFiles = fsaList.map(f => ({
          ...f,
          format: (f.filename.match(/\.(\w{3,4})$/) || [])[1]?.toUpperCase() || '',
          mtime: f.modified ? new Date(f.modified).toISOString() : '',
        }))
        didLocalScan = true
      } else if (agentConnected) {
        const agentRes = await agentFetch('library')
        localFiles = await agentRes.json()
        didLocalScan = true
      } else {
        // No local storage — try Cloudinary-synced list (written by desktop)
        try {
          const syncRes = await fetch(`${API_BASE}/api/user-files?user=${encodeURIComponent(authUser?.name || '')}`)
          const synced = await syncRes.json()
          if (Array.isArray(synced) && synced.length > 0) {
            localFiles = synced
          }
        } catch {}
      }

      // Desktop only: push the scanned list up so mobile can see it
      if (didLocalScan && localFiles && authUser?.name) {
        fetch(`${API_BASE}/api/user-files`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ user: authUser.name, files: localFiles }),
        }).catch(() => {})
      }

      if (localFiles) {
        // Show EVERY file in the user's local storage, even if it's not in
        // Heroku metadata. Metadata enriches title/artist/rating/key when
        // available; otherwise we fall back to the filename so nothing gets
        // silently hidden (which caused Discover/Biblioteca inconsistencies).
        const merged = localFiles.map(f => {
          const meta = metadata[f.filename] || {}
          // Genre source: AI-classified value if present, else folder name as
          // a *visual* hint (rendered dimmed). genre_estimated lets the UI
          // distinguish the two so we don't lie about what we know.
          const aiGenre = meta.genre || ''
          const folderGenre = f.subfolder || ''
          return {
            filename: f.filename,
            title: meta.title || '',
            artist: meta.artist || '',
            genre: aiGenre || folderGenre,
            genre_estimated: !aiGenre && !!folderGenre,
            collection: meta.collection || '',  // edm/pop/latin — used by toggle filter
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
            has_metadata: !!metadata[f.filename],  // flag for UI (e.g. grey out orphans)
            preview_url: meta.preview_url,  // iTunes cached URL for iOS sync play
          }
        })
        if (id === fetchIdRef.current) setFiles(merged)
      } else {
        // No FSA, no agent: fall back to Heroku metadata (read-only view)
        const libRes = await fetch(`${API_BASE}/api/library?user=${encodeURIComponent(authUser?.name || '')}&collection=${collection}`)
        const data = await libRes.json()
        if (id === fetchIdRef.current) setFiles(data)
      }
    } catch (e) {
      console.error('Failed to fetch library', e)
    } finally {
      if (id === fetchIdRef.current) setLoading(false)
    }
  }, [agentConnected, authUser, collection])

  useEffect(() => {
    fetchLibrary()
  }, [fetchLibrary])

  // Background auto-classify: any track without an AI genre gets sent to
  // Groq silently. Dedup by filename so we don't re-classify what we already
  // attempted in this session. Refresh once when a batch lands so the UI
  // swaps the dimmed folder-estimated genre for the real one.
  const autoClassifyRef = useRef(new Set())
  const autoClassifyInflightRef = useRef(false)
  useEffect(() => {
    if (!authUser?.name || autoClassifyInflightRef.current) return
    const candidates = files
      .filter(f => f.genre_estimated || (!f.genre && f.has_metadata !== undefined))
      .map(f => f.filename)
      .filter(fn => !autoClassifyRef.current.has(fn))
    if (candidates.length === 0) return
    candidates.forEach(fn => autoClassifyRef.current.add(fn))
    autoClassifyInflightRef.current = true
    fetch(`${API_BASE}/api/classify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: authUser.name, filenames: candidates }),
    })
      .then(r => r.json())
      .then(data => {
        if (data?.classified > 0) fetchLibrary()
      })
      .catch(() => {})
      .finally(() => { autoClassifyInflightRef.current = false })
  }, [files, authUser, fetchLibrary])

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

  // Close tools dropdown on outside click
  useEffect(() => {
    if (!toolsOpen) return
    const handleClick = (e) => {
      if (toolsRef.current && !toolsRef.current.contains(e.target)) setToolsOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [toolsOpen])

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
    setFiles(prev => {
      const idx = prev.findIndex(f => f.filename === file.filename)
      if (idx === -1) return prev
      return [...prev.slice(0, idx), ...prev.slice(idx + 1)]
    })
    try {
      // Delete from agent (local files)
      if (agentConnected) {
        await agentFetch('delete', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ filename: file.filename }),
        })
      }
      // Delete from Heroku manifest (Cloudinary)
      await fetch(`${API_BASE}/api/delete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filename: file.filename, username: authUser?.name || '' }),
      })
    } catch (e) {
      console.error('Failed to delete', e)
      fetchLibrary()
    }
  }

  const downloadGenreZip = (genre) => {
    if (agentConnected) {
      agentFetch(`open-folder?folder=${encodeURIComponent(genre)}`)
    } else {
      window.open(`${API_BASE}/api/download-genre?genre=${encodeURIComponent(genre)}`, '_blank')
    }
  }

  const openFolder = async (folder) => {
    if (agentConnected) {
      await agentFetch(`open-folder?folder=${encodeURIComponent(folder || '')}`)
    } else {
      await fetch(`${API_BASE}/api/open-folder`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ folder: folder || '' }),
      })
    }
  }

  const classifyAndOrganize = async () => {
    setOrganizing(true)
    try {
      const ungroupedNames = files.filter(f => !f.genre).map(f => f.filename)
      if (ungroupedNames.length > 0) {
        setClassifying(true)
        toast(`Clasificando ${ungroupedNames.length} temas con IA...`, 'info', 4000)
        const res = await fetch(`${API_BASE}/api/classify`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username: authUser?.name || '', filenames: ungroupedNames }),
        })
        const data = await res.json()
        setClassifying(false)
        if (data.error) {
          toast(`Classify error: ${data.error.slice(0, 100)}`, 'error', 6000)
        } else {
          toast(`Clasificados: ${data.classified || 0}/${data.total || ungroupedNames.length}`, 'success', 4000)
        }
      }
      if (agentConnected) {
        const metaRes = await fetch(`${API_BASE}/api/metadata?user=${encodeURIComponent(authUser?.name || '')}&collection=${collection || 'edm'}`)
        const metadata = await metaRes.json()
        const moves = Object.entries(metadata)
          .filter(([, info]) => info.genre)
          .map(([filename, info]) => ({ filename, genre: info.genre }))
        if (moves.length > 0) {
          const res = await agentFetch('organize', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ moves }),
          }).catch(() => null)
          if (res) {
            const data = await res.json().catch(() => ({}))
            if (data.moved) toast(`Organizados: ${data.moved}`, 'success', 4000)
          }
        }
      }
      fetchLibrary()
    } catch (e) {
      console.error('Failed classifyAndOrganize', e)
    } finally {
      setClassifying(false)
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
      let detected = 0
      for (const fname of toDetect) {
        try {
          const audioUrl = agentConnected ? agentUrl(`audio/${encodeURIComponent(fname)}`) : `${API_BASE}/api/audio/${encodeURIComponent(fname)}`
          const audioRes = await fetch(audioUrl)
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
    let agentDeleted = 0
    try {
      // Agent removes the actual files locally; Heroku updates the Cloudinary
      // manifest. Files added directly to disk may not be in the manifest, so
      // refresh whenever EITHER side reports a delete.
      if (agentConnected) {
        try {
          const ar = await agentFetch('delete-dupes', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ filenames: toDelete }),
          })
          const ad = await ar.json().catch(() => ({}))
          agentDeleted = ad.deleted || 0
        } catch (e) { console.error('Agent delete-dupes failed:', e) }
      }
      const res = await fetch(`${API_BASE}/api/delete-dupes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filenames: toDelete, username: authUser?.name || '' }),
      })
      const data = await res.json()
      if ((data.deleted || 0) + agentDeleted > 0) fetchLibrary()
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
      const res = await agentFetch('move-file', {
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
      const res = await agentFetch('export', {
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

  // Filter by current collection (EDM / POP / LATIN). Files without a
  // collection field default to 'edm' for backwards compatibility (most of
  // the historical library is EDM downloads).
  const collectionFiltered = files.filter(f => (f.collection || 'edm') === collection)

  // Filter by genre (multi-select)
  const genreFiltered = genreFilter.length === 0 ? collectionFiltered : collectionFiltered.filter(f => genreFilter.includes(f.genre))

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
      <ScreenHint id="library" title="Tu biblioteca" tips={[
        { icon: '⭐', text: <>Click <strong>derecho</strong> sobre un track para puntuar, mover de género, o renombrar. En mobile: deslizá lateral.</> },
        { icon: '🎼', text: <>Botón <strong>Detectar Keys</strong> — la IA analiza cada tema y le pone tonalidad (C, Am, etc) para mezclar armónicamente después.</> },
        { icon: '🤖', text: <>Botón <strong>Clasificar</strong> — IA detecta género (Tech House, Melodic, Trance...) y mueve a la subcarpeta correcta.</> },
        { icon: '🔁', text: <>Vista <strong>Cards</strong>: agrupado por género · <strong>Tracks</strong>: lista plana ordenable · <strong>Join</strong>: tabla compacta para auditar.</> },
        { icon: '🎯', text: <>Filtrá por <strong>estrellas + género + búsqueda</strong> en simultáneo. Lo que veas se respeta al armar Sets.</> },
      ]} />
      {/* Toolbar - on mobile this wraps to 2 rows so the search stays usable;
          on desktop everything fits in one row. */}
      <div className="flex-shrink-0 flex flex-wrap md:flex-nowrap items-center gap-2 md:gap-3 px-3 md:px-5 py-2 md:py-3 bg-[var(--bg-panel)] border-b border-[var(--border-color)]">
        <div className="flex items-center gap-1.5 flex-shrink-0">
          <span className="text-base md:text-lg font-bold text-[var(--text-primary)]">{filtered.length}</span>
          <span className="text-xs md:text-sm text-gray-500">{q || selectedStars.length > 0 || genreFilter.length > 0 ? `/ ${files.length}` : 'tracks'}</span>
        </div>

        {/* View toggle */}
        <div className="flex gap-0.5 md:gap-1 flex-shrink-0">
          {['cards', 'list', 'tracks'].map(v => (
            <button
              key={v}
              onClick={() => setView(v)}
              className={`px-2 md:px-3 py-1 md:py-1.5 rounded-lg text-xs md:text-sm ${
                view === v ? 'btn-accent font-semibold' : 'btn-ghost'
              }`}
            >
              {v === 'cards' ? 'Cards' : v === 'list' ? 'Join' : 'Tracks'}
            </button>
          ))}
        </div>

        {/* Star filter - hidden on mobile */}
        <div className="hidden md:flex items-center gap-1 flex-shrink-0">
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

        {/* Action buttons - hidden on mobile, shown on md+ */}
        {view === 'tracks' && dupeGroups.length > 0 && (
          <button
            onClick={deleteDupes}
            disabled={deletingDupes}
            className="hidden md:flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm transition-all duration-200 active:scale-95 flex-shrink-0 disabled:opacity-50 bg-red-900/50 hover:bg-red-800 text-red-300"
          >
            {deletingDupes ? (
              <div className="w-4 h-4 border-2 border-red-300 border-t-transparent rounded-full animate-spin" />
            ) : (
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
              </svg>
            )}
            {deletingDupes ? 'Borrando...' : `Duplicados (${dupeGroups.reduce((s, g) => s + g.dupes.length, 0)})`}
          </button>
        )}

        {(() => {
          const toOrganize = files.filter(f => !f.in_subfolder && f.genre).length
          const pending = ungrouped.length + toOrganize
          if (pending === 0) return null
          const busy = classifying || organizing
          const label = classifying ? 'Clasificando...' : organizing ? 'Organizando...' : `Organizar (${pending})`
          return (
          <button
            onClick={classifyAndOrganize}
            disabled={busy}
            className="hidden md:flex items-center gap-1.5 px-3 py-1.5 disabled:opacity-50 rounded-lg text-sm text-[var(--color-accent-text)] transition-all duration-200 active:scale-95 flex-shrink-0"
            style={{ background: 'var(--color-accent)' }}
          >
            {busy ? (
              <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
            ) : (
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
              </svg>
            )}
            {label}
          </button>
          )
        })()}
        {files.some(f => !f.key) && (
          <button
            onClick={detectKeys}
            disabled={detectingKeys}
            className="hidden md:flex items-center gap-1.5 px-3 py-1.5 disabled:opacity-50 rounded-lg text-sm text-[var(--color-accent-text)] transition-all duration-200 active:scale-95 flex-shrink-0"
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
          <div className="hidden md:flex items-center gap-1 flex-shrink-0">
            <button
              onClick={() => setShowDupes(d => !d)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-l-lg text-sm transition-all duration-200 active:scale-95 ${
                showDupes ? 'bg-red-600 text-[var(--text-primary)] font-semibold' : 'bg-red-900/50 hover:bg-red-800 text-red-300'
              }`}
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
              </svg>
              Duplicados ({dupeGroups.reduce((s, g) => s + g.dupes.length, 0)})
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

        {/* Search - full width on mobile (wraps to new row), inline on desktop */}
        <div className="relative w-full order-last md:order-none md:w-auto md:flex-1 md:min-w-24 md:ml-auto">
          <svg className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-500 pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Buscar..."
            className="w-full pl-7 pr-2 py-1.5 bg-[var(--bg-input)] border border-gray-700 rounded-lg text-sm md:text-xs text-[var(--text-primary)] placeholder-gray-500 focus:outline-none focus:border-[var(--color-accent)] transition-colors"
          />
        </div>
        <div className="flex items-center gap-1 flex-shrink-0">
          {(moving || organizing) && <span className="hidden md:inline text-xs text-yellow-400 animate-pulse mr-2">{organizing ? 'Organizando...' : 'Moviendo...'}</span>}
          <button
            onClick={() => openFolder('')}
            className="hidden md:flex p-2 rounded-lg text-gray-400 hover:bg-gray-700 hover:text-[var(--text-primary,white)] transition-all duration-200 active:scale-95"
            title="Abrir carpeta"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 19a2 2 0 01-2-2V7a2 2 0 012-2h4l2 2h4a2 2 0 012 2v1M5 19h14a2 2 0 002-2v-5a2 2 0 00-2-2H9a2 2 0 00-2 2v5a2 2 0 01-2 2z" />
            </svg>
          </button>
          <button
            onClick={() => { fetchLibrary(); window.dispatchEvent(new Event('library-changed')); toast('Re-indexando biblioteca…', 'success', 1500) }}
            className="p-1.5 md:p-2 rounded-lg text-gray-400 hover:bg-gray-700 hover:text-[var(--text-primary,white)] transition-all duration-200 active:scale-95"
            title="Re-indexar (escanear carpeta + refrescar Discover)"
          >
            <svg className="w-4 h-4 md:w-5 md:h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
          </button>
          {/* Tools button - mobile/tablet */}
          <div className="md:hidden relative" ref={toolsRef}>
            <button
              onClick={() => setToolsOpen(p => !p)}
              className={`p-1.5 rounded-lg transition-all active:scale-95 ${toolsOpen ? 'bg-[var(--color-accent)] text-white' : 'text-gray-400 hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]'}`}
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" />
              </svg>
            </button>
            {toolsOpen && (<>
              <div className="fixed inset-0 z-40 bg-black/50 animate-fade-in" onClick={() => setToolsOpen(false)} />
              <div ref={toolsRef} className="fixed inset-x-0 bottom-0 z-50 bg-[var(--bg-panel)] rounded-t-2xl shadow-2xl border-t border-[var(--border-color)] animate-sheet-up">
                <div className="flex justify-center py-2"><div className="w-10 h-1 rounded-full bg-gray-600" /></div>
                <div className="px-5 pb-2"><span className="text-sm font-semibold text-[var(--text-primary)]">Herramientas</span></div>
                <div className="px-5 py-2 border-t border-[var(--border-color)]">
                  <div className="text-[10px] text-gray-500 uppercase font-bold mb-2">Rating</div>
                  <div className="flex items-center gap-1.5">
                    <button onClick={() => setStarFilter('0')} className={`px-3 py-1 rounded-full text-xs ${selectedStars.length === 0 ? 'bg-[var(--color-accent)]/20 text-[var(--text-primary)] font-bold' : 'text-gray-500 bg-white/5'}`}>All</button>
                    {[1,2,3,4,5].map(s => (
                      <button key={s} onClick={() => { const next = selectedStars.includes(s) ? selectedStars.filter(x=>x!==s) : [...selectedStars,s]; setStarFilter(next.length > 0 ? next.join(',') : '0') }}
                        className={`px-2 py-1 rounded-full text-xs ${selectedStars.includes(s) ? 'bg-[var(--color-accent)]/20 text-[var(--text-primary)] font-bold' : 'text-gray-500 bg-white/5'}`}>{'★'.repeat(s)}</button>
                    ))}
                  </div>
                </div>
                <div className="py-2 px-2">
                  {(() => {
                    const toOrganize = files.filter(f => !f.in_subfolder && f.genre).length
                    const pending = ungrouped.length + toOrganize
                    if (pending === 0) return null
                    const busy = classifying || organizing
                    const label = classifying ? 'Clasificando...' : organizing ? 'Organizando...' : `Organizar (${pending})`
                    return (
                    <button onClick={() => { classifyAndOrganize(); setToolsOpen(false) }} disabled={busy}
                      className="w-full text-left px-4 py-3 rounded-xl text-sm text-[var(--text-primary)] hover:bg-[var(--bg-hover)] transition-colors flex items-center gap-3 active:scale-[0.98] disabled:opacity-50">
                      <div className="w-8 h-8 rounded-full bg-[var(--color-accent)]/15 flex items-center justify-center">
                        {busy ? <div className="w-4 h-4 border-2 border-[var(--color-accent)] border-t-transparent rounded-full animate-spin" />
                          : <svg className="w-4 h-4 text-[var(--color-accent)]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" /></svg>}
                      </div>
                      {label}
                    </button>
                    )
                  })()}
                  {files.some(f => !f.key) && (
                    <button onClick={() => { detectKeys(); setToolsOpen(false) }} disabled={detectingKeys}
                      className="w-full text-left px-4 py-3 rounded-xl text-sm text-[var(--text-primary)] hover:bg-[var(--bg-hover)] transition-colors flex items-center gap-3 active:scale-[0.98] disabled:opacity-50">
                      <div className="w-8 h-8 rounded-full bg-amber-500/15 flex items-center justify-center">
                        {detectingKeys ? <div className="w-4 h-4 border-2 border-amber-400 border-t-transparent rounded-full animate-spin" />
                          : <svg className="w-4 h-4 text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2z" /></svg>}
                      </div>
                      {detectingKeys ? 'Detectando...' : `Detectar Keys (${files.filter(f => !f.key).length})`}
                    </button>
                  )}
                  {dupeKeys.size > 0 && (
                    <button onClick={() => { deleteDupes(); setToolsOpen(false) }}
                      disabled={deletingDupes}
                      className="w-full text-left px-4 py-3 rounded-xl text-sm text-red-400 hover:bg-[var(--bg-hover)] transition-colors flex items-center gap-3 active:scale-[0.98] disabled:opacity-50">
                      <div className="w-8 h-8 rounded-full bg-red-500/15 flex items-center justify-center">
                        {deletingDupes ? (
                          <div className="w-4 h-4 border-2 border-red-400 border-t-transparent rounded-full animate-spin" />
                        ) : (
                          <svg className="w-4 h-4 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>
                        )}
                      </div>
                      {deletingDupes ? 'Borrando...' : `Borrar duplicados (${dupeGroups.reduce((s, g) => s + g.dupes.length, 0)})`}
                    </button>
                  )}
                  <button onClick={() => { openFolder(''); setToolsOpen(false) }}
                    className="w-full text-left px-4 py-3 rounded-xl text-sm text-[var(--text-primary)] hover:bg-[var(--bg-hover)] transition-colors flex items-center gap-3 active:scale-[0.98]">
                    <div className="w-8 h-8 rounded-full bg-white/5 flex items-center justify-center">
                      <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 19a2 2 0 01-2-2V7a2 2 0 012-2h4l2 2h4a2 2 0 012 2v1M5 19h14a2 2 0 002-2v-5a2 2 0 00-2-2H9a2 2 0 00-2 2v5a2 2 0 01-2 2z" /></svg>
                    </div>
                    Abrir carpeta
                  </button>
                </div>
                <div className="px-4 pb-6 pt-1">
                  <button onClick={() => setToolsOpen(false)}
                    className="w-full py-3 rounded-xl text-sm font-medium text-gray-400 bg-[var(--bg-surface)] hover:bg-[var(--bg-hover)] transition-colors active:scale-[0.98]">
                    Cancelar
                  </button>
                </div>
              </div>
            </>)}
          </div>
        </div>
      </div>

      {/* Genre filter pills */}
      {availGenres.length > 1 && (
        <div className="flex-shrink-0 flex items-center gap-1 px-3 md:px-5 py-2 bg-[var(--bg-panel)] border-b border-[var(--border-color)] overflow-x-auto md:flex-wrap scrollbar-none">
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
                className={`flex-shrink-0 px-2.5 py-1 rounded-full text-xs font-medium transition-all duration-200`}
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
                  await agentFetch('delete-dupes', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ filenames: toDelete }) })
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
                          agentFetch('delete-dupes', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ filenames: [f.filename] }) })
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
                            await agentFetch('delete-dupes', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ filenames: [f.filename] }) })
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
          <div className="flex-shrink-0 flex items-center gap-2 px-3 md:px-4 py-2 bg-[var(--bg-surface)] border-b border-[var(--border-color)] text-xs text-gray-500 uppercase tracking-wider select-none">
            <span className="w-6 md:w-8 text-center">#</span>
            <span className="w-8"></span>
            <button onClick={() => toggleSort('artist')} className={`flex-1 min-w-0 text-left hover:text-[var(--text-primary,white)] transition-colors ${sortCol === 'artist' ? 'text-[var(--color-accent)]' : ''}`}>Artista - Título<SortArrow col="artist" /></button>
            <button onClick={() => toggleSort('genre')} className={`hidden md:block w-32 flex-shrink-0 text-left hover:text-[var(--text-primary,white)] transition-colors ${sortCol === 'genre' ? 'text-[var(--color-accent)]' : ''}`}>Género<SortArrow col="genre" /></button>
            <button onClick={() => toggleSort('key')} className={`hidden sm:block w-14 flex-shrink-0 text-center hover:text-[var(--text-primary,white)] transition-colors ${sortCol === 'key' ? 'text-[var(--color-accent)]' : ''}`}>Key<SortArrow col="key" /></button>
            <button onClick={() => toggleSort('rating')} className={`w-20 md:w-24 flex-shrink-0 text-center hover:text-[var(--text-primary,white)] transition-colors ${sortCol === 'rating' ? 'text-[var(--color-accent)]' : ''}`}>Rating<SortArrow col="rating" /></button>
            <button onClick={() => toggleSort('date')} className={`hidden lg:block w-20 flex-shrink-0 text-center hover:text-[var(--text-primary,white)] transition-colors ${sortCol === 'date' ? 'text-[var(--color-accent)]' : ''}`}>Fecha<SortArrow col="date" /></button>
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
                  className={`flex items-center gap-2 px-3 md:px-4 py-1.5 border-b border-[var(--border-color)]/50 transition-colors hover:bg-[var(--bg-hover)] cursor-default ${
                    isPlaying ? 'bg-white/5' : ''
                  }`}
                >
                  <span className="w-6 md:w-8 text-center text-xs text-gray-600">{i + 1}</span>
                  <PlayPauseBtn isPlaying={isPlaying} onClick={() => handlePlay(f)} />
                  <div className="flex-1 min-w-0 flex items-center gap-1">
                    <div className={`text-xs md:text-sm truncate ${isPlaying ? 'font-medium text-[var(--color-accent)]' : 'text-[var(--text-primary)]'}`}>
                      {f.artist ? `${f.artist} - ` : ''}{f.title || f.filename}
                    </div>
                    <a href={`https://www.youtube.com/results?search_query=${encodeURIComponent((f.artist || '') + ' ' + (f.title || f.filename))}`} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()} className="hidden sm:flex flex-shrink-0 text-gray-700 hover:text-red-500 transition-colors" title="YouTube">
                      <svg className="w-3 h-3" viewBox="0 0 24 24" fill="currentColor"><path d="M23.5 6.2a3 3 0 00-2.1-2.1C19.5 3.5 12 3.5 12 3.5s-7.5 0-9.4.6A3 3 0 00.5 6.2 31.5 31.5 0 000 12a31.5 31.5 0 00.5 5.8 3 3 0 002.1 2.1c1.9.6 9.4.6 9.4.6s7.5 0 9.4-.6a3 3 0 002.1-2.1A31.5 31.5 0 0024 12a31.5 31.5 0 00-.5-5.8zM9.6 15.5V8.5l6.4 3.5-6.4 3.5z"/></svg>
                    </a>
                  </div>
                  <span title={f.genre_estimated ? 'Estimado por carpeta — falta clasificar con AI' : ''} className={`hidden md:block w-32 flex-shrink-0 text-xs truncate ${f.genre_estimated ? 'text-gray-600 italic' : 'text-gray-500'}`}>{f.genre || '-'}</span>
                  <span className={`hidden sm:block w-14 flex-shrink-0 text-center text-xs font-mono ${f.key ? 'text-amber-400' : 'text-gray-700'}`}>{f.key || '-'}</span>
                  <div className="w-20 md:w-24 flex-shrink-0 flex justify-center">
                    <StarRating rating={f.rating || 0} onRate={(r) => handleRate(f, r)} />
                  </div>
                  <span className="hidden lg:block w-20 flex-shrink-0 text-center text-xs text-gray-600">{f.date ? new Date(f.date).toLocaleDateString('es-AR', { day: '2-digit', month: 'short' }) : '-'}</span>
                </div>
              )
            })}
          </div>

          {/* Export bar */}
          <div className="flex-shrink-0 flex items-center gap-2 md:gap-3 px-3 md:px-4 py-2 md:py-2.5 bg-[var(--bg-panel)] border-t border-[var(--border-color)]">
            <span className="hidden sm:inline text-sm text-gray-400 flex-shrink-0">{finalList.length} tracks</span>
            <input
              value={exportName}
              onChange={e => setExportName(e.target.value)}
              placeholder="Nombre del set..."
              className="flex-1 min-w-0 max-w-xs px-3 py-1.5 bg-[var(--bg-input)] border border-gray-700 rounded-lg text-sm text-[var(--text-primary)] placeholder-gray-500 focus:outline-none focus:border-[var(--color-accent)] transition-colors"
              onKeyDown={e => e.key === 'Enter' && handleExport()}
            />
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
        <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden px-3 py-3 md:p-4">
          <div className="grid grid-cols-2 md:grid-cols-3 gap-2.5 md:gap-3 items-start auto-rows-min w-full">
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
                      <span title={f.genre_estimated ? 'Estimado por carpeta — falta clasificar con AI' : ''} className={`w-32 flex-shrink-0 text-xs truncate ${f.genre_estimated ? 'text-gray-600 italic' : 'text-gray-500'}`}>{f.genre || '-'}</span>
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

function SetBuilder({ page, playingFile, onPlay, onPlayPause, onStop, agentConnected, onEditMix, authUser, collection, onGoToLibrary, playNextRef, libraryRoot }) {
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
  const [searchQuery, setSearchQuery] = useState('')
  const [allTracks, setAllTracks] = useState([])

  // Fetch genres that have tracks with >= minStars
  useEffect(() => {
    if (page !== 'set') return
    fetch(`${API_BASE}/api/library?user=${encodeURIComponent(authUser?.name || '')}&collection=${collection || 'edm'}`).then(r => r.json()).then(tracks => {
      setAllTracks(tracks)
      const genreCounts = {}
      tracks.forEach(t => {
        if ((setSelectedStars.length > 0 ? setSelectedStars.includes(t.rating || 0) : (t.rating || 0) >= minStars) && t.genre && t.key) {
          genreCounts[t.genre] = (genreCounts[t.genre] || 0) + 1
        }
      })
      const sorted = Object.entries(genreCounts).sort((a, b) => b[1] - a[1]).map(([g, c]) => ({ genre: g, count: c }))
      setAvailableGenres(sorted)
      setSelectedGenres(prev => prev.filter(g => genreCounts[g]))
    }).catch(() => {})
  }, [page, minStars, setSelectedStars, authUser, collection])

  // Hint banner — dismissible, persisted via localStorage
  const [hintDismissed, setHintDismissed] = useState(() => !!localStorage.getItem('set_hint_dismissed'))
  const dismissHint = () => { localStorage.setItem('set_hint_dismissed', '1'); setHintDismissed(true) }

  // Auto-generate a starter set on first entry (when no set yet)
  const autoGenRef = useRef(false)
  useEffect(() => {
    if (page !== 'set') return
    if (autoGenRef.current) return
    if (setTracks.length > 0) return
    if (allTracks.length === 0) return  // wait until library loads
    autoGenRef.current = true
    generateSet('camelot')
  }, [page, allTracks.length, setTracks.length])

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

  // Autoplay-next: when a set track finishes (real audio, not preview/stop),
  // advance to the next one. Re-registered on every setTracks/onPlay change
  // so the closure always sees the current list.
  useEffect(() => {
    if (!playNextRef || page !== 'set') return
    playNextRef.current = (endedFilename) => {
      const idx = setTracks.findIndex(t => t.filename === endedFilename)
      if (idx >= 0 && idx + 1 < setTracks.length) {
        onPlay(setTracks[idx + 1])
      }
    }
    return () => { if (playNextRef.current) playNextRef.current = null }
  }, [setTracks, onPlay, playNextRef, page])

  const addToSet = (track) => {
    setSetTracks(prev => [...prev, track])
    setTotalMin(prev => prev + 6)
    setSuggestions(prev => prev.filter(s => s.filename !== track.filename))
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

  const generateSet = async (m, overrideStars, overrideDuration, overrideSelectedStars, overrideGenres) => {
    const useMethod = m || method
    setMethod(useMethod)
    setGenerating(true)
    try {
      const selStars = overrideSelectedStars !== undefined ? overrideSelectedStars : setSelectedStars
      const gens = overrideGenres !== undefined ? overrideGenres : selectedGenres
      const res = await fetch(`${API_BASE}/api/generate-set`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ min_stars: overrideStars ?? minStars, selected_stars: selStars.length > 0 ? selStars : undefined, duration: overrideDuration ?? duration, method: useMethod, genres: gens.length > 0 ? gens : undefined, username: authUser?.name || '' }),
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
  // Default name: genre-method-month (e.g. "tech-house-camelot-mayo")
  const computeSetName = () => {
    const slug = (s) => (s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
    const months = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']
    const genrePart = slug(selectedGenres[0] || setTracks[0]?.genre || 'set')
    const methodPart = slug(method || 'mix')
    return setName.trim() || `${genrePart}-${methodPart}-${months[new Date().getMonth()]}`
  }

  // Resolve library root via fallback chain (settings → agent → cache → guess)
  const resolveLibraryRoot = async () => {
    let root = (libraryRoot || '').trim()
    if (!root && agentConnected) {
      try {
        const r = await agentFetch('status', { signal: AbortSignal.timeout(5000) })
        if (r.ok) {
          const s = await r.json()
          if (s?.folder) {
            root = s.folder
            try { localStorage.setItem('library_root_cached', root) } catch {}
          }
        }
      } catch {}
    }
    if (!root) {
      try { root = localStorage.getItem('library_root_cached') || '' } catch {}
    }
    if (!root) {
      if (navigator.userAgent.includes('Windows')) root = 'C:\\Users\\Public\\Music\\groove-new'
      else if (navigator.userAgent.includes('Mac')) root = '~/Music/groove-new'
    }
    root = root.replace(/[\\/]+$/, '')
    const isWindows = /^[A-Z]:/i.test(root) || navigator.userAgent.includes('Windows')
    if (isWindows) root = root.replace(/\//g, '\\')
    return { root, sep: isWindows ? '\\' : '/' }
  }

  const downloadFile = (filename, content, mime) => {
    const blob = new Blob([content], { type: mime })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    a.click()
    URL.revokeObjectURL(url)
  }

  // Export 1: Rekordbox-compatible M3U playlist (paths only, no metadata)
  const exportM3U = async () => {
    const name = computeSetName()
    setExporting(true)
    try {
      const { root, sep } = await resolveLibraryRoot()
      const lines = ['#EXTM3U']
      for (const t of setTracks) {
        const dur = t.duration_est ? Math.round(t.duration_est * 60) : -1
        const label = t.artist ? `${t.artist} - ${t.title || t.filename}` : (t.title || t.filename)
        lines.push(`#EXTINF:${dur},${label}`)
        const path = root
          ? (t.subfolder ? `${root}${sep}${t.subfolder}${sep}${t.filename}` : `${root}${sep}${t.filename}`)
          : t.filename
        lines.push(path)
      }
      downloadFile(`${name}.m3u`, lines.join('\n'), 'audio/x-mpegurl')
      toast(`${name}.m3u exportada`)
    } catch (e) {
      console.error('Failed to export m3u', e)
      toast('Error exportando playlist', 'error', 3000)
    } finally {
      setExporting(false)
    }
  }

  // Export 2: Rekordbox XML (full metadata: rating, BPM, key, genre)
  const exportRekordboxXML = async () => {
    const name = computeSetName()
    setExporting(true)
    try {
      const { root, sep } = await resolveLibraryRoot()
      const xmlEscape = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;')
      // Rekordbox rating: 0=none, 51=★, 102=★★, 153=★★★, 204=★★★★, 255=★★★★★
      const rbRating = (r) => [0, 51, 102, 153, 204, 255][Math.max(0, Math.min(5, r || 0))]
      // Path → file:// URL with forward slashes (Rekordbox XML spec)
      const fileUrl = (t) => {
        const localPath = root
          ? (t.subfolder ? `${root}${sep}${t.subfolder}${sep}${t.filename}` : `${root}${sep}${t.filename}`)
          : t.filename
        const fwd = localPath.replace(/\\/g, '/')
        // file://localhost/C:/path... — encode each segment
        const encoded = fwd.split('/').map(p => encodeURIComponent(p).replace(/'/g, '%27')).join('/')
        return `file://localhost/${encoded.replace(/^\//, '')}`
      }

      const tracksXml = setTracks.map((t, i) => {
        const ext = (t.format || (t.filename.split('.').pop() || '')).toUpperCase()
        const kind = ext === 'MP3' ? 'MP3 File' : ext === 'WAV' ? 'WAV File' : ext === 'M4A' ? 'M4A File' : 'FLAC File'
        return `    <TRACK TrackID="${i + 1}" Name="${xmlEscape(t.title || t.filename.replace(/\.[^.]+$/, ''))}" Artist="${xmlEscape(t.artist || '')}" Genre="${xmlEscape(t.genre || '')}" Kind="${kind}" TotalTime="${Math.round((t.duration_est || 6) * 60)}" AverageBpm="${t.bpm ? t.bpm.toFixed(2) : '0.00'}" Tonality="${xmlEscape(t.key || '')}" Rating="${rbRating(t.rating)}" Location="${fileUrl(t)}"/>`
      }).join('\n')

      const playlistEntries = setTracks.map((_, i) => `      <TRACK Key="${i + 1}"/>`).join('\n')

      const xml = `<?xml version="1.0" encoding="UTF-8"?>
<DJ_PLAYLISTS Version="1.0.0">
  <PRODUCT Name="rekordbox" Version="6.0.0" Company="Pioneer DJ"/>
  <COLLECTION Entries="${setTracks.length}">
${tracksXml}
  </COLLECTION>
  <PLAYLISTS>
    <NODE Type="0" Name="ROOT" Count="1">
      <NODE Name="${xmlEscape(name)}" Type="1" KeyType="0" Entries="${setTracks.length}">
${playlistEntries}
      </NODE>
    </NODE>
  </PLAYLISTS>
</DJ_PLAYLISTS>`
      downloadFile(`${name}.xml`, xml, 'application/xml')
      toast(`${name}.xml — Rekordbox XML exportado (rating + BPM + key)`)
    } catch (e) {
      console.error('Failed to export xml', e)
      toast('Error exportando XML', 'error', 3000)
    } finally {
      setExporting(false)
    }
  }

  const exportSet = exportM3U  // legacy alias for any other caller

  if (page !== 'set') return null

  return (
    <div className="flex-1 flex flex-col min-h-0">
      <ScreenHint id="set" title="Armado de set" tips={[
        { icon: '⭐', text: <>Tocá <strong>estrellas</strong> para subir/bajar el corte de calidad — el set se regenera al toque.</> },
        { icon: '⏱️', text: <>Cambiá la <strong>duración</strong> (60'/90'/120') y el set se rearma con la cantidad de tracks justos.</> },
        { icon: '🎯', text: <><strong>Camelot</strong>: encadena tracks por compatibilidad armónica. <strong>Energy</strong>: por curva de energía. <strong>Genre</strong>: por estilo. <strong>Peak</strong>: arma el momento alto.</> },
        { icon: '🎵', text: <>Filtrá por <strong>género</strong> con las pills de abajo. Multi-select OK.</> },
        { icon: '📤', text: <>Exportá como <strong>Rekordbox playlist</strong> (.m3u) o <strong>Rekordbox XML</strong> con rating + BPM + key.</> },
      ]} />
      {/* Controls: single compact row - duration + algorithms + search */}
      <div className="flex-shrink-0 flex items-center gap-1.5 md:gap-3 px-3 md:px-6 py-2 bg-[var(--bg-panel)] border-b border-[var(--border-color)] overflow-x-auto scrollbar-none">
        {/* Star filter - desktop only */}
        <div className="hidden lg:flex items-center gap-1">
          <button
            onClick={() => { setSetSelectedStars([]); setMinStars(1); if (method) generateSet(method, 1, undefined, []) }}
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
                  if (method) generateSet(method, newMin, undefined, next)
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
        {/* Duration */}
        <div className="flex items-center gap-0.5 md:gap-1 flex-shrink-0">
          {[60, 90, 120].map(d => (
            <button
              key={d}
              onClick={() => { setDuration(d); if (method) generateSet(method, undefined, d) }}
              className={`px-2 py-1 rounded-lg text-xs font-medium transition-all duration-200 flex-shrink-0 ${
                duration === d ? 'font-bold' : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
              }`}
              style={duration === d ? { background: 'color-mix(in srgb, var(--color-accent) 20%, transparent)', color: 'var(--color-accent)' } : {}}
            >
              {d}'
            </button>
          ))}
        </div>
        {/* Separator */}
        <div className="w-px h-5 bg-[var(--border-color)] flex-shrink-0" />
        {/* Generation algorithms */}
        {[
          { id: 'camelot', label: 'Camelot', icon: '🎯' },
          { id: 'energy', label: 'Energy', icon: '⚡' },
          { id: 'genre', label: 'Genre', icon: '🎭' },
          { id: 'peak', label: 'Peak', icon: '📈' },
        ].map(m => (
          <button
            key={m.id}
            onClick={() => generateSet(m.id)}
            disabled={generating}
            className={`flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium transition-all duration-200 active:scale-95 disabled:opacity-50 flex-shrink-0`}
            style={method === m.id
              ? { background: 'rgba(var(--color-accent-rgb, 59,130,246), 0.25)', color: 'var(--color-accent)' }
              : { background: 'rgba(var(--color-accent-rgb, 59,130,246), 0.08)', color: 'rgba(var(--color-accent-rgb, 59,130,246), 0.6)' }
            }
          >
            {generating && method === m.id ? <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <span>{m.icon}</span>}
            <span className="hidden md:inline">{m.label}</span>
          </button>
        ))}
        {/* Separator */}
        <div className="w-px h-5 bg-[var(--border-color)] flex-shrink-0" />
        {/* Search inline */}
        <div className="flex-1 min-w-32 md:min-w-48 relative flex-shrink-0">
          <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="Agregar track..."
            className="w-full pl-8 pr-3 py-1.5 bg-[var(--bg-input)] border border-gray-700 rounded-lg text-xs text-[var(--text-primary)] placeholder-gray-600 focus:outline-none focus:border-[var(--color-accent)] transition-colors"
          />
        </div>
      </div>

      {/* Genre pills - single scrollable row */}
      {availableGenres.length > 0 && (
        <div className="flex-shrink-0 flex items-center gap-1 px-3 md:px-6 py-1.5 bg-[var(--bg-panel)] border-b border-[var(--border-color)] overflow-x-auto scrollbar-none">
          <button
            onClick={() => { setSelectedGenres([]); if (method) generateSet(method, undefined, undefined, undefined, []) }}
            className={`flex-shrink-0 px-2 py-0.5 rounded-full text-[11px] font-medium transition-all duration-200 active:scale-95 ${
              selectedGenres.length === 0 ? 'btn-accent font-semibold' : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
            }`}
          >All</button>
          {availableGenres.map(({ genre, count }, idx) => {
            const active = selectedGenres.includes(genre)
            const gColor = GENRE_COLORS[idx % GENRE_COLORS.length]
            return (
              <button
                key={genre}
                onClick={() => {
                  const next = active ? selectedGenres.filter(g => g !== genre) : [...selectedGenres, genre]
                  setSelectedGenres(next)
                  if (method) generateSet(method, undefined, undefined, undefined, next)
                }}
                className={`flex-shrink-0 px-2 py-0.5 rounded-full text-[11px] font-medium transition-all duration-200 active:scale-95`}
                style={{
                  background: active ? `rgba(${gColor.rgb}, 0.25)` : `rgba(${gColor.rgb}, 0.08)`,
                  color: active ? `rgb(${gColor.rgb})` : `rgba(${gColor.rgb}, 0.5)`,
                }}
              >
                {genre} ({count})
              </button>
            )
          })}
        </div>
      )}

      {/* Search results dropdown */}
      <div className="flex-shrink-0">
        {searchQuery.length >= 2 && (() => {
          const q = searchQuery.toLowerCase()
          const results = allTracks
            .filter(t => !setTracks.some(s => s.filename === t.filename))
            .filter(t => (t.title || t.filename || '').toLowerCase().includes(q) || (t.artist || '').toLowerCase().includes(q) || (t.genre || '').toLowerCase().includes(q))
            .slice(0, 8)
          return results.length > 0 ? (
            <div className="border-b border-[var(--border-color)] bg-[var(--bg-surface)]">
              {results.map(t => (
                <button
                  key={t.filename}
                  onClick={() => { addToSet(t); setSearchQuery('') }}
                  className="w-full flex items-center gap-2 md:gap-3 px-3 md:px-6 py-2 text-left hover:bg-[var(--bg-hover)] transition-colors border-b border-[var(--border-color)]/30 last:border-0"
                >
                  <svg className="w-4 h-4 text-green-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                  </svg>
                  <div className="flex-1 min-w-0">
                    <div className="text-xs md:text-sm text-[var(--text-primary)] truncate">{t.title || t.filename}</div>
                    <div className="text-xs text-gray-500 truncate">{t.artist}<span className="hidden sm:inline"> · {t.genre} · {t.bpm || '?'} BPM</span> · {t.key || '?'}</div>
                  </div>
                  {t.rating > 0 && <span className="hidden sm:inline text-xs text-yellow-500 flex-shrink-0">{'★'.repeat(t.rating)}</span>}
                </button>
              ))}
            </div>
          ) : (
            <div className="px-3 md:px-6 py-2 text-xs text-gray-600 border-b border-[var(--border-color)]">Sin resultados para "{searchQuery}"</div>
          )
        })()}
      </div>

      {/* Tracklist */}
      <div className="flex-1 min-h-0 overflow-y-auto">
        {setTracks.length === 0 ? (
          <div className="flex items-center justify-center h-full text-gray-600">
            <div className="text-center space-y-2">
              <p className="text-4xl">&#127911;</p>
              <p>Buscá un tema arriba para agregarlo, o generá un set automático</p>
              <p className="text-sm text-gray-700">Camelot Greedy · Energy Wave · Genre Journey · Peak Time</p>
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
                  className={`flex items-center gap-2 md:gap-3 px-3 md:px-6 py-2 md:py-3 transition-all duration-150 border-b border-[var(--border-color)]/30 cursor-grab active:cursor-grabbing ${
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
                  <span className="w-5 md:w-6 text-center text-xs text-gray-600 font-mono flex-shrink-0">{i + 1}</span>
                  <div className="flex-1 min-w-0">
                    <div className={`text-xs md:text-sm truncate ${isPlaying ? 'font-medium text-[var(--color-accent)]' : 'text-[var(--text-primary)]'}`}>
                      {t.artist ? `${t.artist} - ` : ''}{t.title || t.filename}
                    </div>
                  </div>
                  <span className="hidden lg:block w-24 flex-shrink-0 text-xs text-gray-500 truncate text-center">{t.genre || '-'}</span>
                  <span className={`hidden md:block w-10 flex-shrink-0 text-xs text-center ${
                    t.format === 'FLAC' || t.format === 'flac' ? 'text-purple-400' : 'text-gray-500'
                  }`}>{(t.format || t.filename?.split('.').pop() || '').toUpperCase()}</span>
                  <span className="hidden md:block w-14 flex-shrink-0 text-xs text-gray-500 text-center">{t.size_mb ? `${t.size_mb}MB` : `~${t.duration_est || 6}m`}</span>
                  <span className={`w-16 md:w-20 flex-shrink-0 text-[10px] md:text-xs font-mono px-1 md:px-2 py-0.5 rounded text-center ${
                    i > 0 && t.camelot === setTracks[i-1].camelot ? 'bg-green-500/20 text-green-400' :
                    'bg-amber-500/20 text-amber-400'
                  }`}>
                    {t.key}{t.camelot ? <span className="hidden sm:inline"> · {t.camelot}</span> : ''}
                  </span>
                  <span className="hidden sm:block w-16 flex-shrink-0 text-xs text-[var(--text-primary)] text-center">{'★'.repeat(t.rating || 0)}</span>
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
            <div className="flex items-center gap-2 px-3 md:px-6 py-2 bg-[var(--bg-panel)]">
              <svg className="w-4 h-4 text-green-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
              </svg>
              <span className="text-sm font-semibold text-[var(--text-primary)]">Sugerencias</span>
              {loadingSuggestions && <div className="w-3.5 h-3.5 border-2 border-[var(--color-accent)] border-t-transparent rounded-full animate-spin" />}
              <span className="hidden md:inline text-xs text-[var(--text-muted)]">compatibles con el último track</span>
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
                    className={`flex items-center gap-2 md:gap-3 px-3 md:px-6 py-2 hover:bg-[var(--bg-hover)] transition-colors cursor-default ${isPlaying ? 'bg-white/5' : ''}`}
                  >
                    <PlayPauseBtn isPlaying={isPlaying} onClick={(e) => { e.stopPropagation(); handlePlay(s) }} size="sm" />
                    <div className="flex-1 min-w-0">
                      <div className={`text-xs md:text-sm truncate ${isPlaying ? 'text-[var(--color-accent)]' : 'text-[var(--text-primary)]'}`}>{s.artist ? `${s.artist} - ` : ''}{s.title || s.filename}</div>
                    </div>
                    <span className="hidden lg:block w-24 flex-shrink-0 text-xs text-gray-500 truncate text-center">{s.genre || '-'}</span>
                    <span className={`hidden md:block w-10 flex-shrink-0 text-xs text-center ${
                      s.format === 'FLAC' ? 'text-purple-400' : 'text-gray-500'
                    }`}>{(s.format || '').toUpperCase()}</span>
                    <span className="hidden md:block w-14 flex-shrink-0 text-xs text-gray-500 text-center">{s.size_mb ? `${s.size_mb}MB` : '-'}</span>
                    <span className={`w-16 md:w-20 flex-shrink-0 text-[10px] md:text-xs font-mono px-1 md:px-1.5 py-0.5 rounded text-center ${
                      s.distance <= 1 ? 'bg-green-500/20 text-green-400' : 'bg-amber-500/20 text-amber-400'
                    }`}>
                      {s.key}{s.camelot ? <span className="hidden sm:inline"> · {s.camelot}</span> : ''}
                    </span>
                    <span className="hidden sm:block w-16 flex-shrink-0 text-xs text-[var(--text-primary)] text-center">{'★'.repeat(s.rating)}</span>
                    <button
                      onClick={() => addToSet(s)}
                      className="flex items-center gap-1 px-2 py-1 rounded-lg text-xs text-[var(--color-accent-text)] font-medium transition-all duration-200 active:scale-95 flex-shrink-0"
                      style={{ background: 'var(--color-accent)' }}
                    >
                      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                      </svg>
                      <span className="hidden sm:inline">Agregar</span>
                    </button>
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </div>

      {/* Export footer */}
      {setTracks.length > 0 && (
        <div className="flex-shrink-0 flex items-center gap-2 md:gap-3 px-3 md:px-6 py-2 md:py-2.5 bg-[var(--bg-panel)] border-t border-[var(--border-color)]">
          <span className="text-xs md:text-sm text-gray-400 flex-shrink-0">
            {setTracks.length} tracks · ~{totalMin}'
          </span>
          <input
            value={setName}
            onChange={e => setSetName(e.target.value)}
            placeholder="Nombre del set..."
            className="flex-1 min-w-0 max-w-xs px-2 md:px-3 py-1.5 bg-[var(--bg-input)] border border-gray-700 rounded-lg text-sm text-[var(--text-primary)] placeholder-gray-600 focus:outline-none focus:border-[var(--color-accent)] transition-colors"
          />
          <button
            onClick={exportM3U}
            disabled={exporting}
            className="flex items-center gap-1.5 px-3 py-1.5 disabled:opacity-50 rounded-lg text-xs md:text-sm font-medium text-white transition-all duration-200 active:scale-95 flex-shrink-0 shadow-md hover:brightness-110"
            style={{ background: 'linear-gradient(135deg, #ff5500, #ff2266)' }}
            title="Playlist .m3u — File → Import → Import Playlist en Rekordbox"
          >
            {exporting ? <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" /> : (
              // Vinyl record (Pioneer/Rekordbox vibe)
              <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 14c-2.21 0-4-1.79-4-4s1.79-4 4-4 4 1.79 4 4-1.79 4-4 4zm0-6c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2z"/></svg>
            )}
            Rekordbox playlist
          </button>
          <button
            onClick={exportRekordboxXML}
            disabled={exporting}
            className="flex items-center gap-1.5 px-3 py-1.5 disabled:opacity-50 rounded-lg text-xs md:text-sm font-medium text-white transition-all duration-200 active:scale-95 flex-shrink-0 shadow-md hover:brightness-110"
            style={{ background: 'linear-gradient(135deg, #ff5500, #ff2266)' }}
            title="Rekordbox XML — incluye rating, BPM, key, género (Preferences → Advanced → Database)"
          >
            {/* Same vinyl mark for visual consistency */}
            <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 14c-2.21 0-4-1.79-4-4s1.79-4 4-4 4 1.79 4 4-1.79 4-4 4zm0-6c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2z"/></svg>
            Rekordbox XML
          </button>
          <button
            onClick={() => onEditMix(setTracks)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs md:text-sm font-medium transition-all duration-200 active:scale-95 bg-purple-600 hover:bg-purple-500 text-white flex-shrink-0"
            title="Editor de mezcla con waveforms, fades y crossfade"
          >
            {/* Crossfader / mixer sliders */}
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" d="M4 7h16M4 12h16M4 17h16"/>
              <circle cx="15" cy="7" r="2.2" fill="currentColor"/>
              <circle cx="9" cy="12" r="2.2" fill="currentColor"/>
              <circle cx="13" cy="17" r="2.2" fill="currentColor"/>
            </svg>
            Mezclar
          </button>
        </div>
      )}
      {/* Hint: how to import */}
      {setTracks.length > 0 && (
        <div className="flex-shrink-0 px-3 md:px-6 py-2 bg-gradient-to-r from-orange-500/5 via-pink-500/5 to-orange-500/5 border-t border-[var(--border-color)] flex flex-col sm:flex-row gap-2 sm:gap-6 text-[11px] md:text-xs text-[var(--text-muted)]">
          <div className="flex items-start gap-2">
            <span className="flex-shrink-0 mt-0.5 w-4 h-4 rounded-full bg-orange-500/20 text-orange-400 flex items-center justify-center text-[10px] font-bold">P</span>
            <div>
              <span className="text-[var(--text-secondary)] font-semibold">Playlist:</span> en Rekordbox <code className="px-1 py-0.5 rounded bg-white/5 text-orange-400">File → Import → Import Playlist</code> y elegí el .m3u
            </div>
          </div>
          <div className="flex items-start gap-2">
            <span className="flex-shrink-0 mt-0.5 w-4 h-4 rounded-full bg-pink-500/20 text-pink-400 flex items-center justify-center text-[10px] font-bold">X</span>
            <div>
              <span className="text-[var(--text-secondary)] font-semibold">XML (con rating + BPM + key):</span> <code className="px-1 py-0.5 rounded bg-white/5 text-pink-400">Preferences → Advanced → Database → rekordbox xml</code> → seteás el path
            </div>
          </div>
        </div>
      )}

    </div>
  )
}

const TRANSITION_TYPES = {
  auto: { label: 'Auto', overlap: null }, // calculated per-track from energy analysis
  smooth: { label: 'Smooth', overlap: 60 },
  quick: { label: 'Quick', overlap: 16 },
  cut: { label: 'Cut', overlap: 0 },
  longblend: { label: 'Long Blend', overlap: 90 },
  drop: { label: 'Drop', overlap: 8 },
  eqmix: { label: 'EQ Mix', overlap: 45 },
}

function MixEditor({ tracks: initialTracks, onBack, agentConnected }) {
  const toast = useToast()
  const [mixTracks, setMixTracks] = useState([])
  const [loading, setLoading] = useState(true)
  const [pxPerSec, setPxPerSec] = useState(10)
  const [dragging, setDragging] = useState(null) // { index, startX, origStartTime }
  const [resizing, setResizing] = useState(null) // { index, side: 'left'|'right', startX, origTrimStart, origTrimEnd }
  const [fadeDragging, setFadeDragging] = useState(null) // { index, side: 'in'|'out', startX, origFade }
  const wasDraggingRef = useRef(false)
  const [contextMenu, setContextMenu] = useState(null) // { x, y, trackIndex, side: 'left'|'right' }
  const [exporting, setExporting] = useState(false)
  const [mixName, setMixName] = useState(() => `Mix ${new Date().toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit' }).replace(/\//g, '-')}`)
  const [exportFormat, setExportFormat] = useState('mp3')
  const [masterBPM, setMasterBPM] = useState(128)
  const [snapEnabled, setSnapEnabled] = useState(true)
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
    return agentUrl(`audio/${path}`)
  }

  // Find which track should be playing at a given time
  const trackAtTime = useCallback((time) => {
    for (let i = mixTracks.length - 1; i >= 0; i--) {
      if (time >= mixTracks[i].startTime) return i
    }
    return 0
  }, [mixTracks])

  // BPM ratio: how much a track's duration changes when time-stretched to masterBPM
  const bpmRatio = useCallback((t) => {
    if (!t.bpm || !masterBPM || t.bpm === masterBPM) return 1
    return t.bpm / masterBPM // >1 means track plays slower (longer), <1 means faster (shorter)
  }, [masterBPM])

  // Effective duration accounting for trims AND BPM time-stretch
  const effectiveDuration = useCallback((t) => {
    const raw = t.duration - (t.trimStart || 0) - (t.trimEnd || 0)
    return raw * bpmRatio(t)
  }, [bpmRatio])

  // Total mix duration (must be before togglePlay/keyboard effects)
  const totalDuration = useMemo(() => {
    if (mixTracks.length === 0) return 0
    const last = mixTracks[mixTracks.length - 1]
    return last.startTime + effectiveDuration(last)
  }, [mixTracks, effectiveDuration])

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
        const actualFadeOut = currentTrack.customFadeOut ?? currentTrack.fadeOut
        const fadeOutStart = currentTrack.duration - actualFadeOut
        if (actualFadeOut > 0 && timeInCurrent >= fadeOutStart && audioBRef.current.paused) {
          // Start next track
          const audioB = audioBRef.current
          audioB.src = audioUrl(nextTrack)
          audioB.currentTime = 0
          audioB.volume = 0
          audioB.play().catch(() => {})
        }
        // Crossfade volumes
        if (actualFadeOut > 0 && timeInCurrent >= fadeOutStart && !audioBRef.current.paused) {
          const fadeProgress = (timeInCurrent - fadeOutStart) / actualFadeOut
          const mv = volumeRef.current
          audioA.volume = Math.max(0, (1 - fadeProgress) * mv)
          audioBRef.current.volume = Math.min(mv, fadeProgress * mv)
          if (fadeProgress >= 1) {
            // Crossfade complete: A is silent, B is full volume
            // Just stop A cleanly and promote B — no re-assign needed
            audioA.pause()
            audioA.src = ''
            // Swap refs: B becomes the new A for the next crossfade
            const tmpSrc = audioBRef.current.src
            const tmpTime = audioBRef.current.currentTime
            const tmpVol = audioBRef.current.volume
            // B continues playing, just swap the references
            const temp = audioARef.current
            audioARef.current = audioBRef.current
            audioBRef.current = temp
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
        e.stopImmediatePropagation()
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

  // On mount, fetch track info (duration, bpm, intro/outro from manifest)
  useEffect(() => {
    if (!initialTracks || initialTracks.length === 0) { setLoading(false); return }
    let cancelled = false
    const DEFAULT_FADE = 16

    const fetchAndLayout = async () => {
      // Fetch all track info in parallel — manifest data comes back instantly
      const results = await Promise.all(initialTracks.map(async (t) => {
        const path = t.subfolder
          ? `${encodeURIComponent(t.subfolder)}/${encodeURIComponent(t.filename)}`
          : encodeURIComponent(t.filename)
        try {
          const res = await agentFetch(`track-info/${path}`)
          const info = await res.json()
          return {
            ...t,
            duration: info.duration_seconds || 300,
            bpm: t.bpm || info.bpm || null,
            _introEnd: info.intro_end || 0,
            _outroStart: info.outro_start || info.duration_seconds || 300,
          }
        } catch {
          return { ...t, duration: 300, _introEnd: 0, _outroStart: 300 }
        }
      }))

      if (cancelled) return

      // Layout with smart overlaps using manifest data
      const laid = []
      let cumStart = 0
      for (let i = 0; i < results.length; i++) {
        const r = results[i]
        const trackBpm = r.bpm || masterBPM
        const ratio = trackBpm / masterBPM
        const stretchedDuration = r.duration * ratio

        // Smart overlap from intro/outro if available
        const hasAnalysis = r._introEnd > 0 || r._outroStart < r.duration
        let smartOverlap = DEFAULT_FADE
        if (hasAnalysis && i < results.length - 1) {
          const outroLen = Math.max(0, r.duration - r._outroStart)
          const nextIntroLen = results[i + 1]._introEnd || 0
          smartOverlap = Math.max(8, Math.min(90,
            Math.min(outroLen, nextIntroLen) || Math.max(outroLen, nextIntroLen) || DEFAULT_FADE
          ))
        } else if (i === results.length - 1) {
          smartOverlap = 0
        }

        laid.push({
          ...r,
          startTime: cumStart,
          fadeIn: i === 0 ? 0 : (laid[i - 1]._autoOverlap || DEFAULT_FADE),
          fadeOut: smartOverlap,
          transitionType: 'auto',
          trimStart: 0,
          trimEnd: 0,
          customFadeIn: null,
          customFadeOut: null,
          _autoOverlap: smartOverlap,
        })
        cumStart += stretchedDuration - smartOverlap
      }
      setMixTracks(laid)
      setLoading(false)

      // For tracks missing analysis, fetch in background and enrich (no position changes)
      const needsAnalysis = results.filter(r => !r._introEnd && r._outroStart >= r.duration)
      if (needsAnalysis.length > 0) {
        const analyses = await Promise.all(results.map(async (r) => {
          if (r._introEnd > 0 || r._outroStart < r.duration) return null // already has data
          const path = r.subfolder
            ? `${encodeURIComponent(r.subfolder)}/${encodeURIComponent(r.filename)}`
            : encodeURIComponent(r.filename)
          try {
            const res = await agentFetch(`track-analysis/${path}`)
            if (res.ok) return await res.json()
          } catch { /* ignore */ }
          return null
        }))

        if (cancelled) return

        setMixTracks(prev => prev.map((t, i) => {
          const a = analyses[i]
          if (!a) return t
          const outroLen = Math.max(0, t.duration - a.outro_start)
          const nextIntroLen = i < prev.length - 1 && analyses[i + 1] ? analyses[i + 1].intro_end : 0
          const smartOverlap = i < prev.length - 1
            ? Math.max(8, Math.min(90, Math.min(outroLen, nextIntroLen) || Math.max(outroLen, nextIntroLen) || DEFAULT_FADE))
            : 0
          return { ...t, _introEnd: a.intro_end, _outroStart: a.outro_start, _autoOverlap: smartOverlap }
        }))
      }
    }
    fetchAndLayout()
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

  // Resolve the effective overlap for a track (auto uses stored analysis, others use fixed)
  const resolveOverlap = useCallback((track) => {
    if (track.transitionType === 'auto') return track._autoOverlap || 16
    return TRANSITION_TYPES[track.transitionType || 'quick'].overlap
  }, [])

  // Change transition type for a track (affects overlap with NEXT track)
  const changeTransitionType = useCallback((index, type) => {
    setMixTracks(prev => {
      const next = [...prev]
      next[index] = { ...next[index], transitionType: type }
      const overlap = type === 'auto'
        ? (next[index]._autoOverlap || 16)
        : TRANSITION_TYPES[type].overlap
      // Update the next track's startTime and fade values
      if (index < next.length - 1) {
        const currentTrack = next[index]
        const currentEnd = currentTrack.startTime + effectiveDuration(currentTrack)
        const nextStart = currentEnd - overlap
        next[index] = { ...next[index], fadeOut: overlap }
        next[index + 1] = { ...next[index + 1], startTime: Math.max(0, nextStart), fadeIn: overlap }
        // Recalculate all subsequent tracks
        for (let j = index + 2; j < next.length; j++) {
          const prevT = next[j - 1]
          const prevEnd = prevT.startTime + effectiveDuration(prevT)
          const thisOverlap = prevT.transitionType === 'auto'
            ? (prevT._autoOverlap || 16)
            : TRANSITION_TYPES[prevT.transitionType || 'quick'].overlap
          next[j] = { ...next[j], startTime: prevEnd - thisOverlap, fadeIn: thisOverlap }
        }
      }
      return next
    })
  }, [effectiveDuration])

  // Handle resize start (trim handles)
  const handleResizeStart = (e, index, side) => {
    e.preventDefault()
    e.stopPropagation()
    setResizing({
      index,
      side,
      startX: e.clientX,
      origTrimStart: mixTracks[index].trimStart || 0,
      origTrimEnd: mixTracks[index].trimEnd || 0,
    })
  }

  // Handle resize move and end
  useEffect(() => {
    if (!resizing) return
    const handleMouseMove = (e) => {
      const dx = e.clientX - resizing.startX
      const dtSec = dx / pxPerSec
      setMixTracks(prev => {
        const next = [...prev]
        const track = { ...next[resizing.index] }
        const maxTrim = track.duration * 0.8 // Don't allow trimming more than 80%
        if (resizing.side === 'left') {
          const newTrimStart = Math.max(0, Math.min(maxTrim - (track.trimEnd || 0), resizing.origTrimStart + dtSec))
          track.trimStart = newTrimStart
          // Shift visual start forward
          if (resizing.index > 0) {
            const prevTrack = next[resizing.index - 1]
            const prevEnd = prevTrack.startTime + effectiveDuration(prevTrack)
            const overlap = prevEnd - track.startTime
            // Keep startTime adjusted so visual block moves
          }
        } else {
          const newTrimEnd = Math.max(0, Math.min(maxTrim - (track.trimStart || 0), resizing.origTrimEnd - dtSec))
          track.trimEnd = newTrimEnd
        }
        next[resizing.index] = track
        return next
      })
    }
    const handleMouseUp = () => {
      wasDraggingRef.current = true
      setResizing(null)
    }
    window.addEventListener('mousemove', handleMouseMove)
    window.addEventListener('mouseup', handleMouseUp)
    return () => {
      window.removeEventListener('mousemove', handleMouseMove)
      window.removeEventListener('mouseup', handleMouseUp)
    }
  }, [resizing, pxPerSec, effectiveDuration])

  // Handle fade drag
  useEffect(() => {
    if (!fadeDragging) return
    const handleMouseMove = (e) => {
      const dx = e.clientX - fadeDragging.startX
      const dtSec = dx / pxPerSec
      setMixTracks(prev => {
        const next = [...prev]
        const track = { ...next[fadeDragging.index] }
        const maxFade = (track.duration - (track.trimStart || 0) - (track.trimEnd || 0)) * 0.5
        if (fadeDragging.side === 'in') {
          track.customFadeIn = Math.max(0, Math.min(maxFade, Math.round(fadeDragging.origFade + dtSec)))
        } else {
          track.customFadeOut = Math.max(0, Math.min(maxFade, Math.round(fadeDragging.origFade - dtSec)))
        }
        next[fadeDragging.index] = track
        return next
      })
    }
    const handleMouseUp = () => {
      wasDraggingRef.current = true
      setFadeDragging(null)
    }
    window.addEventListener('mousemove', handleMouseMove)
    window.addEventListener('mouseup', handleMouseUp)
    return () => {
      window.removeEventListener('mousemove', handleMouseMove)
      window.removeEventListener('mouseup', handleMouseUp)
    }
  }, [fadeDragging, pxPerSec])

  // Close context menu on click outside
  useEffect(() => {
    if (!contextMenu) return
    const handleClick = () => setContextMenu(null)
    window.addEventListener('click', handleClick)
    return () => window.removeEventListener('click', handleClick)
  }, [contextMenu])

  // Handle right-click on track block for fade context menu
  const handleTrackContextMenu = (e, index) => {
    e.preventDefault()
    e.stopPropagation()
    const track = mixTracks[index]
    const trackLeft = track.startTime * pxPerSec
    const trackWidth = effectiveDuration(track) * pxPerSec
    const rect = e.currentTarget.getBoundingClientRect()
    const clickX = e.clientX - rect.left
    const side = clickX < rect.width / 2 ? 'left' : 'right'
    setContextMenu({ x: e.clientX, y: e.clientY, trackIndex: index, side })
  }

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
          // Free movement — snap to beat grid if enabled
          let snapped = Math.max(0, newStart)
          if (snapEnabled && masterBPM > 0) {
            const beatLen = 60 / masterBPM
            snapped = Math.round(snapped / beatLen) * beatLen
          }
          track.startTime = snapped
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
        master_bpm: masterBPM,
        tracks: mixTracks.map(t => ({
          filename: t.filename,
          subfolder: t.subfolder || '',
          start_time: t.startTime,
          duration: t.duration,
          fade_in: t.customFadeIn ?? t.fadeIn,
          fade_out: t.customFadeOut ?? t.fadeOut,
          trim_start: t.trimStart || 0,
          trim_end: t.trimEnd || 0,
          bpm: t.bpm || null,
        })),
        format: exportFormat,
        bitrate: '320k',
      }
      const res = await agentFetch('mix-export', {
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
      <ScreenHint id="mix" title="Editor de mezcla" tips={[
        { icon: '🎚️', text: <>Arrastrá los tracks horizontalmente para reordenar el momento de entrada. La superposición es el crossfade.</> },
        { icon: '🌊', text: <>Los <strong>fades</strong> se ven en el waveform — arrastrá los bordes para ajustar duración del fade in/out.</> },
        { icon: '🔢', text: <>Activá <strong>Snap a beats</strong> y poné el BPM master para que todo cuadre al grid musical.</> },
        { icon: '🖱️', text: <>Click derecho en un track para <strong>tipo de transición</strong> (Smooth, Cut, Drop, EQ Mix, Long Blend).</> },
        { icon: '📤', text: <>Exportá el mix bounceado como un solo .mp3/.wav para subirlo a SoundCloud o llevarlo a la fiesta.</> },
      ]} />
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

        {/* BPM Master + Snap */}
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-[var(--text-muted)]">BPM</span>
          <input
            type="number"
            value={masterBPM}
            onChange={(e) => setMasterBPM(Math.max(60, Math.min(200, parseInt(e.target.value) || 128)))}
            className="w-14 px-1.5 py-0.5 bg-[var(--bg-input)] border border-gray-700 rounded text-xs text-center text-[var(--text-primary)] focus:outline-none focus:border-[var(--color-accent)]"
          />
          <button
            onClick={() => setSnapEnabled(s => !s)}
            className={`px-2 py-0.5 rounded text-xs font-medium transition-all duration-200 ${
              snapEnabled ? 'bg-[var(--color-accent)]/20 text-[var(--color-accent)]' : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
            }`}
            title="Snap to beat grid"
          >
            Snap
          </button>
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
            {/* Beat grid lines */}
            {snapEnabled && masterBPM > 0 && (() => {
              const beatLen = 60 / masterBPM
              const barLen = beatLen * 4
              const lines = []
              for (let t = 0; t <= totalDuration; t += beatLen) {
                const isBar = Math.abs(t % barLen) < 0.01 || Math.abs(t % barLen - barLen) < 0.01
                lines.push(
                  <div
                    key={`beat${t.toFixed(3)}`}
                    className="absolute top-0 bottom-0 pointer-events-none"
                    style={{
                      left: t * pxPerSec,
                      width: 1,
                      background: isBar ? 'rgba(255,255,255,0.12)' : 'rgba(255,255,255,0.04)',
                    }}
                  />
                )
              }
              return lines
            })()}
            {mixTracks.map((track, i) => {
              const color = getTrackColor(track, i)
              const trimS = track.trimStart || 0
              const trimE = track.trimEnd || 0
              const effDur = track.duration - trimS - trimE
              const left = (track.startTime + trimS) * pxPerSec
              const width = effDur * pxPerSec
              const prevTrack = i > 0 ? mixTracks[i - 1] : null
              const overlapSec = prevTrack ? Math.max(0, (prevTrack.startTime + effectiveDuration(prevTrack)) - track.startTime) : 0
              const overlapPx = overlapSec * pxPerSec

              return (
                <div key={`${track.filename}-${i}`}>
                  {/* Track block */}
                  <div
                    className={`absolute rounded-lg border overflow-hidden select-none ${
                      dragging?.index === i ? 'ring-2 ring-white/50 z-20 cursor-grabbing' : resizing?.index === i ? 'ring-2 ring-yellow-400/50 z-20' : 'cursor-grab hover:ring-1 hover:ring-white/20 z-10'
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
                    onContextMenu={(e) => handleTrackContextMenu(e, i)}
                  >
                    {/* Left resize handle (trim start) */}
                    <div
                      className="absolute inset-y-0 left-0 w-1 bg-white/30 hover:bg-white/60 z-20"
                      style={{ cursor: 'col-resize' }}
                      onMouseDown={(e) => handleResizeStart(e, i, 'left')}
                    />
                    {/* Right resize handle (trim end) */}
                    <div
                      className="absolute inset-y-0 right-0 w-1 bg-white/30 hover:bg-white/60 z-20"
                      style={{ cursor: 'col-resize' }}
                      onMouseDown={(e) => handleResizeStart(e, i, 'right')}
                    />
                    {/* Fade in gradient + drag handle */}
                    {(() => {
                      const fi = track.customFadeIn ?? track.fadeIn
                      return fi > 0 && (<>
                        <div
                          className="absolute inset-y-0 left-0"
                          style={{
                            width: fi * pxPerSec,
                            background: `linear-gradient(to right, transparent, rgba(${color.rgb}, 0.3))`,
                          }}
                        />
                        <div
                          className="absolute inset-y-0 z-20 group/fade"
                          style={{ left: fi * pxPerSec - 2, width: 8, cursor: 'col-resize' }}
                          onMouseDown={(e) => {
                            e.preventDefault(); e.stopPropagation()
                            setFadeDragging({ index: i, side: 'in', startX: e.clientX, origFade: fi })
                          }}
                        >
                          <div className="absolute inset-y-1 left-1/2 -translate-x-1/2 w-0.5 bg-white/30 group-hover/fade:bg-white/80 rounded-full transition-colors" />
                          <div className="absolute top-0 left-1/2 -translate-x-1/2 text-[8px] text-white/50 group-hover/fade:text-white/90 font-mono whitespace-nowrap pointer-events-none" style={{ top: -12 }}>{Math.round(fi)}s</div>
                        </div>
                      </>)
                    })()}
                    {/* Fade out gradient + drag handle */}
                    {(() => {
                      const fo = track.customFadeOut ?? track.fadeOut
                      return fo > 0 && (<>
                        <div
                          className="absolute inset-y-0 right-0"
                          style={{
                            width: fo * pxPerSec,
                            background: `linear-gradient(to left, transparent, rgba(${color.rgb}, 0.3))`,
                          }}
                        />
                        <div
                          className="absolute inset-y-0 z-20 group/fade"
                          style={{ right: fo * pxPerSec - 2, width: 8, cursor: 'col-resize' }}
                          onMouseDown={(e) => {
                            e.preventDefault(); e.stopPropagation()
                            setFadeDragging({ index: i, side: 'out', startX: e.clientX, origFade: fo })
                          }}
                        >
                          <div className="absolute inset-y-1 left-1/2 -translate-x-1/2 w-0.5 bg-white/30 group-hover/fade:bg-white/80 rounded-full transition-colors" />
                          <div className="absolute top-0 left-1/2 -translate-x-1/2 text-[8px] text-white/50 group-hover/fade:text-white/90 font-mono whitespace-nowrap pointer-events-none" style={{ top: -12 }}>{Math.round(fo)}s</div>
                        </div>
                      </>)
                    })()}
                    {/* Intro/outro boundary markers from energy analysis */}
                    {track._introEnd > 0 && (
                      <div
                        className="absolute top-0 bottom-0 w-px pointer-events-none z-10"
                        style={{
                          left: (track._introEnd - trimS) * pxPerSec,
                          borderLeft: '1px dashed rgba(34,197,94,0.6)',
                        }}
                        title={`Intro ends: ${Math.round(track._introEnd)}s`}
                      />
                    )}
                    {track._outroStart > 0 && track._outroStart < track.duration && (
                      <div
                        className="absolute top-0 bottom-0 w-px pointer-events-none z-10"
                        style={{
                          left: (track._outroStart - trimS) * pxPerSec,
                          borderLeft: '1px dashed rgba(239,68,68,0.6)',
                        }}
                        title={`Outro starts: ${Math.round(track._outroStart)}s`}
                      />
                    )}
                    {/* Custom fade in overlay */}
                    {track.customFadeIn != null && track.customFadeIn > 0 && (
                      <div
                        className="absolute inset-y-0 left-0 pointer-events-none"
                        style={{
                          width: track.customFadeIn * pxPerSec,
                          background: `linear-gradient(to right, rgba(0,0,0,0.5), transparent)`,
                        }}
                      />
                    )}
                    {/* Custom fade out overlay */}
                    {track.customFadeOut != null && track.customFadeOut > 0 && (
                      <div
                        className="absolute inset-y-0 right-0 pointer-events-none"
                        style={{
                          width: track.customFadeOut * pxPerSec,
                          background: `linear-gradient(to left, rgba(0,0,0,0.5), transparent)`,
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
                        {track.artist}{track.bpm ? ` · ${track.bpm} BPM` : ''}{track.key ? ` · ${track.key}` : ''} · {fmtTime(effDur)}
                        {trimS > 0 && <span className="text-yellow-400"> T+{Math.round(trimS)}s</span>}
                        {trimE > 0 && <span className="text-yellow-400"> T-{Math.round(trimE)}s</span>}
                      </div>
                    </div>
                  </div>

                  {/* Overlap label - shows transition type name */}
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
                        {track.transitionType === 'auto' ? `Auto ${Math.round(overlapSec)}s` : (TRANSITION_TYPES[track.transitionType]?.label || `${Math.round(overlapSec)}s`)}
                      </span>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      </div>

      {/* Context menu for custom fade in/out */}
      {contextMenu && (
        <div
          className="fixed z-50 bg-[var(--bg-panel)] border border-[var(--border-color)] rounded-lg shadow-xl py-1 min-w-36"
          style={{ left: contextMenu.x, top: contextMenu.y }}
          onClick={(e) => e.stopPropagation()}
        >
          {contextMenu.side === 'left' ? (
            <>
              <div className="px-3 py-1 text-[10px] text-[var(--text-muted)] uppercase font-bold">Fade In</div>
              {[{val: undefined, label: 'Auto'}, {val: 0, label: 'Off'}, {val: 4, label: '4s'}, {val: 8, label: '8s'}, {val: 16, label: '16s'}, {val: 24, label: '24s'}].map(opt => (
                <button
                  key={`fi-${opt.val}`}
                  className={`w-full text-left px-3 py-1.5 text-xs hover:bg-[var(--bg-hover)] transition-colors ${
                    mixTracks[contextMenu.trackIndex]?.customFadeIn === opt.val ? 'text-[var(--color-accent)] font-semibold' : 'text-[var(--text-primary)]'
                  }`}
                  onClick={() => {
                    setMixTracks(prev => prev.map((t, idx) => idx === contextMenu.trackIndex ? { ...t, customFadeIn: opt.val } : t))
                    setContextMenu(null)
                  }}
                >
                  Fade In: {opt.label}
                </button>
              ))}
            </>
          ) : (
            <>
              <div className="px-3 py-1 text-[10px] text-[var(--text-muted)] uppercase font-bold">Fade Out</div>
              {[{val: undefined, label: 'Auto'}, {val: 0, label: 'Off'}, {val: 4, label: '4s'}, {val: 8, label: '8s'}, {val: 16, label: '16s'}, {val: 24, label: '24s'}].map(opt => (
                <button
                  key={`fo-${opt.val}`}
                  className={`w-full text-left px-3 py-1.5 text-xs hover:bg-[var(--bg-hover)] transition-colors ${
                    mixTracks[contextMenu.trackIndex]?.customFadeOut === opt.val ? 'text-[var(--color-accent)] font-semibold' : 'text-[var(--text-primary)]'
                  }`}
                  onClick={() => {
                    setMixTracks(prev => prev.map((t, idx) => idx === contextMenu.trackIndex ? { ...t, customFadeOut: opt.val } : t))
                    setContextMenu(null)
                  }}
                >
                  Fade Out: {opt.label}
                </button>
              ))}
            </>
          )}
        </div>
      )}

      {/* Track list summary */}
      <div className="flex-shrink-0 max-h-48 overflow-y-auto border-t border-[var(--border-color)] bg-[var(--bg-panel)]">
        {mixTracks.map((t, i) => {
          const color = getTrackColor(t, i)
          const prevTrack = i > 0 ? mixTracks[i - 1] : null
          const overlap = prevTrack ? Math.max(0, (prevTrack.startTime + effectiveDuration(prevTrack)) - t.startTime) : 0
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
              <span className="text-[10px] text-[var(--text-muted)] flex-shrink-0 w-14 text-center">{fmtTime(effectiveDuration(t))}</span>
              <span className="text-[10px] text-[var(--text-muted)] flex-shrink-0 w-14 text-right">@{fmtTime(t.startTime)}</span>
              {overlap > 0 && (
                <span className="text-[10px] font-medium flex-shrink-0 w-16 text-center" style={{ color: `rgb(${color.rgb})` }}>
                  -{Math.round(overlap)}s fade
                </span>
              )}
              {/* Transition type selector */}
              <select
                value={t.transitionType || 'quick'}
                onChange={(e) => changeTransitionType(i, e.target.value)}
                onClick={(e) => e.stopPropagation()}
                className="text-[10px] flex-shrink-0 w-20 px-1 py-0.5 bg-[var(--bg-input)] border border-gray-700 rounded text-[var(--text-primary)] focus:outline-none focus:border-[var(--color-accent)] transition-colors"
              >
                {Object.entries(TRANSITION_TYPES).map(([key, { label, overlap: ov }]) => (
                  <option key={key} value={key}>{label} ({key === 'auto' ? `${Math.round(t._autoOverlap || 0)}s` : `${ov}s`})</option>
                ))}
              </select>
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

function Tutorial({ onDone }) {
  const [step, setStep] = useState(0)
  const slides = [
    {
      icon: '🔍',
      title: 'Descubrí música nueva',
      desc: 'Beatport, Spotify y SoulSeek en un solo lugar. Filtrá por género, BPM, key y energía.',
      bars: [40, 70, 55, 85, 60, 75, 45],
    },
    {
      icon: '🎯',
      title: 'Sets armados con Camelot',
      desc: 'Generá sets que matchean en tonalidad y energía automáticamente. Camelot, Energy, Genre, Peak.',
      bars: [50, 80, 65, 90, 70, 85, 60],
    },
    {
      icon: '🎚️',
      title: 'Mezclá y exportá',
      desc: 'Editor de mix con waveforms, fades, beat-grid. Exportá a USB con un click.',
      bars: [60, 75, 90, 65, 85, 70, 80],
    },
    {
      icon: '☁️',
      title: 'Sync cross-device',
      desc: 'Tu biblioteca en PC y celu, siempre actualizada. Bajá desde cualquier lado.',
      bars: [55, 65, 80, 70, 95, 75, 85],
    },
  ]
  const s = slides[step]
  const next = () => step < slides.length - 1 ? setStep(step + 1) : onDone()

  return (
    <div className="fixed inset-0 z-[100] bg-slate-950 flex items-center justify-center overflow-hidden animate-fade-in">
      {/* Animated mesh blobs */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -left-40 w-[40rem] h-[40rem] rounded-full bg-blue-600/30 blur-[120px] animate-blob" />
        <div className="absolute top-1/2 -right-40 w-[35rem] h-[35rem] rounded-full bg-purple-600/30 blur-[120px] animate-blob animation-delay-2000" />
        <div className="absolute -bottom-40 left-1/3 w-[30rem] h-[30rem] rounded-full bg-pink-600/20 blur-[120px] animate-blob animation-delay-4000" />
      </div>

      {/* Animated waveform bottom */}
      <div className="absolute bottom-0 left-0 right-0 h-40 flex items-end justify-center gap-[3px] px-4 pointer-events-none opacity-60">
        {Array.from({ length: 64 }).map((_, i) => (
          <div
            key={i}
            className="w-1.5 rounded-t-full bg-gradient-to-t from-blue-500 via-purple-500 to-pink-500"
            style={{
              height: `${20 + Math.random() * 70}%`,
              animation: `bounce-bar ${(0.5 + Math.random() * 1).toFixed(2)}s ease-in-out ${(-Math.random() * 1.5).toFixed(2)}s infinite alternate`,
            }}
          />
        ))}
      </div>

      <div className="absolute inset-0 bg-gradient-to-b from-slate-950/40 via-transparent to-slate-950/90 pointer-events-none" />

      <div key={step} className="relative w-full max-w-md px-6 text-center animate-fade-in-up">
        <div className="text-7xl mb-6 inline-block animate-bounce-subtle">{s.icon}</div>
        <h2 className="text-4xl md:text-5xl font-bold text-white mb-3 tracking-tight">{s.title}</h2>
        <p className="text-base md:text-lg text-gray-300 mb-8 leading-relaxed">{s.desc}</p>

        {/* Mini visualizer specific to this slide */}
        <div className="flex items-end justify-center gap-1.5 h-20 mb-10">
          {s.bars.map((h, i) => (
            <div
              key={i}
              className="w-2.5 rounded-full bg-gradient-to-t from-[var(--color-accent)] to-purple-400"
              style={{
                height: `${h}%`,
                animation: `bounce-bar ${(0.4 + i * 0.05).toFixed(2)}s ease-in-out ${(-i * 0.1).toFixed(2)}s infinite alternate`,
              }}
            />
          ))}
        </div>

        {/* Dots */}
        <div className="flex justify-center gap-2 mb-8">
          {slides.map((_, i) => (
            <button
              key={i}
              onClick={() => setStep(i)}
              className={`h-1.5 rounded-full transition-all duration-300 ${
                i === step ? 'w-8 bg-white' : 'w-1.5 bg-white/30 hover:bg-white/50'
              }`}
            />
          ))}
        </div>

        <div className="flex items-center justify-center gap-3">
          <button
            onClick={onDone}
            className="px-5 py-3 rounded-2xl text-sm text-gray-400 hover:text-white transition-colors"
          >
            Saltear
          </button>
          <button
            onClick={next}
            className="px-8 py-3.5 rounded-2xl font-semibold text-white shadow-xl shadow-blue-500/40 hover:brightness-110 active:scale-[0.98] transition-all"
            style={{ background: 'linear-gradient(135deg, var(--color-accent), #a855f7)' }}
          >
            {step < slides.length - 1 ? 'Siguiente' : 'Empezar'}
          </button>
        </div>
      </div>
    </div>
  )
}

function LoginScreen({ onLogin, isModal = false, onClose, onGuestStart }) {
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

  // 64 waveform bars with random heights + animation delays — memoized so keystrokes don't restart the animation
  const bars = useMemo(() => Array.from({ length: 64 }, () => ({
    h: 20 + Math.random() * 70,
    delay: -(Math.random() * 1.6).toFixed(2),
    dur: (0.6 + Math.random() * 0.8).toFixed(2),
  })), [])

  const inner = (
    <>
      {!isModal && (
        <video
          autoPlay
          muted
          loop
          playsInline
          className="absolute inset-0 w-full h-full object-cover opacity-40"
          onError={(e) => { e.currentTarget.style.display = 'none' }}
        >
          <source src="/bg.mp4" type="video/mp4" />
        </video>
      )}

      {/* Animated mesh gradient blobs */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -left-40 w-[40rem] h-[40rem] rounded-full bg-blue-600/20 blur-[120px] animate-blob" />
        <div className="absolute top-1/2 -right-40 w-[35rem] h-[35rem] rounded-full bg-purple-600/20 blur-[120px] animate-blob animation-delay-2000" />
        <div className="absolute -bottom-40 left-1/3 w-[30rem] h-[30rem] rounded-full bg-pink-600/15 blur-[120px] animate-blob animation-delay-4000" />
      </div>

      {/* Waveform bars across the bottom */}
      <div className="absolute bottom-0 left-0 right-0 h-32 flex items-end justify-center gap-[3px] px-4 pointer-events-none opacity-50">
        {bars.map((b, i) => (
          <div
            key={i}
            className="w-1 rounded-t-full bg-gradient-to-t from-[var(--color-accent)] via-purple-500 to-pink-500"
            style={{
              height: `${b.h}%`,
              animation: `bounce-bar ${b.dur}s ease-in-out ${b.delay}s infinite alternate`,
            }}
          />
        ))}
      </div>

      {/* Top fade overlay so bars don't overpower form */}
      <div className="absolute inset-0 bg-gradient-to-b from-slate-950/60 via-transparent to-slate-950/80 pointer-events-none" />

      {/* Card */}
      <div className="relative w-[24rem] max-w-[92vw] bg-white/[0.04] backdrop-blur-2xl border border-white/10 rounded-3xl p-8 shadow-2xl shadow-black/50 animate-fade-in-up">
        <div className="flex flex-col items-center gap-3 mb-8">
          <div className="relative">
            <div className="absolute inset-0 rounded-2xl bg-blue-500/40 blur-2xl" />
            <img src="/logo.png" alt="DJ Free App" className="relative w-20 h-20 rounded-2xl ring-1 ring-white/20" />
          </div>
          <h1 className="text-3xl font-bold text-white tracking-tight">DJ Free App</h1>
          <p className="text-xs text-gray-400 text-center">Discover · Sync · Set Builder · Mix</p>
        </div>

        <form onSubmit={handleLogin} className="space-y-3">
          <input
            type="text"
            name="username"
            id="login-username"
            autoComplete="username"
            value={username}
            onChange={e => setUsername(e.target.value)}
            placeholder="Usuario"
            autoFocus
            className="w-full px-4 py-3.5 bg-white/[0.06] border border-white/10 rounded-2xl text-white placeholder-gray-500 focus:outline-none focus:border-[var(--color-accent)] focus:bg-white/[0.10] transition-all"
          />
          <input
            type="password"
            name="password"
            id="login-password"
            autoComplete="current-password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            placeholder="Contraseña"
            className="w-full px-4 py-3.5 bg-white/[0.06] border border-white/10 rounded-2xl text-white placeholder-gray-500 focus:outline-none focus:border-[var(--color-accent)] focus:bg-white/[0.10] transition-all"
          />
          {error && <p className="text-red-400 text-sm text-center">{error}</p>}
          <button
            type="submit"
            disabled={loading || !username || !password}
            className="w-full py-3.5 disabled:opacity-50 rounded-2xl font-semibold transition-all duration-200 active:scale-[0.98] shadow-lg shadow-blue-500/30 hover:shadow-blue-500/50 hover:brightness-110"
            style={{ background: 'linear-gradient(135deg, var(--color-accent), #a855f7)', color: '#fff' }}
          >
            {loading ? (
              <span className="inline-flex items-center gap-2">
                <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                Ingresando…
              </span>
            ) : 'Ingresar'}
          </button>
          <div className="flex items-center gap-3 py-1">
            <div className="flex-1 h-px bg-white/10" />
            <span className="text-[10px] uppercase tracking-wider text-gray-500">o</span>
            <div className="flex-1 h-px bg-white/10" />
          </div>
          <button
            type="button"
            onClick={() => { if (onGuestStart) onGuestStart(); else window.location.href = `${window.location.pathname}?guest=1` }}
            className="w-full py-3 rounded-2xl text-sm text-gray-300 hover:text-white border border-white/10 hover:border-white/30 hover:bg-white/[0.06] transition-all duration-200 active:scale-[0.98]"
          >
            Entrar como invitado
          </button>
        </form>

        {/* Feature pills */}
        <div className="mt-6 flex flex-wrap gap-1.5 justify-center">
          {[
            { icon: '🎯', label: 'Camelot' },
            { icon: '⚡', label: 'Energy' },
            { icon: '🎚️', label: 'Mix' },
            { icon: '☁️', label: 'Sync' },
          ].map(p => (
            <span key={p.label} className="text-[10px] px-2.5 py-1 rounded-full bg-white/[0.04] border border-white/10 text-gray-400 inline-flex items-center gap-1">
              <span>{p.icon}</span>{p.label}
            </span>
          ))}
        </div>
        {isModal && (
          <button onClick={onClose} className="absolute -top-3 -right-3 w-9 h-9 rounded-full bg-slate-800 border border-white/10 text-white hover:bg-slate-700 transition-colors flex items-center justify-center" aria-label="Cerrar">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        )}
      </div>
    </>
  )

  return isModal ? (
    <div className="fixed inset-0 z-[90] bg-black/70 backdrop-blur-md flex items-center justify-center animate-fade-in p-4" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="relative">{inner}</div>
    </div>
  ) : (
    <div className="h-screen flex items-center justify-center bg-slate-950 relative overflow-hidden">{inner}</div>
  )
}

// =====================================================================
// DemoShowcase — animated 7-scene demo of DJ Free App features.
// Replaces a static video with real app concepts: Beatport/Spotify lists,
// auto-download, dynamic library + BPM/Key analysis, set automation,
// Rekordbox export, CTA. ~25s loop, all Tailwind + CSS keyframes.
// =====================================================================
function DemoShowcase() {
  const SCENES = 7
  // Per user: pace slower, dwell longer on Set Builder (Export) where the
  // playlist-assistant features need to be enumerated. Total ~70s, fits
  // inside the 75s bg.mp3 so the music never restarts.
  const D = [6000, 13000, 9000, 9000, 18000, 9000, 5000]
  const [scene, setScene] = useState(0)
  const [muted, setMuted] = useState(false)
  const audioRef = useRef(null)
  useEffect(() => {
    if (scene >= SCENES - 1) return // one-shot: freeze on the CTA
    const t = setTimeout(() => setScene(s => s + 1), D[scene])
    return () => clearTimeout(t)
  }, [scene])
  // Try to autoplay unmuted on mount. The click on "Ver demo" counts as a
  // user gesture so most browsers allow it. If blocked anyway, fall back to
  // muted (and the user can click the speaker icon to enable sound).
  useEffect(() => {
    const a = audioRef.current
    if (!a) return
    a.muted = false
    a.volume = 0.7
    a.play().catch(() => {
      a.muted = true
      setMuted(true)
    })
  }, [])
  const toggleMute = () => {
    const next = !muted
    setMuted(next)
    if (audioRef.current) {
      audioRef.current.muted = next
      if (!next) audioRef.current.play().catch(() => {})
    }
  }

  return (
    <div className="relative w-full aspect-video bg-slate-950 rounded-2xl overflow-hidden ring-1 ring-white/10 shadow-2xl">
      {/* Background music — KREAM & Script · Turn Up The Dose (32s loop, demo only).
          autoPlay + JS .play() fallback maximize chances Chrome honors the user-gesture from "Ver demo" click. */}
      <audio ref={audioRef} src="/demo/bg.mp3" loop autoPlay muted={muted} preload="auto" />
      {/* Mute toggle */}
      <button
        onClick={toggleMute}
        className="absolute top-3 right-3 z-30 w-9 h-9 rounded-full bg-black/50 hover:bg-black/70 backdrop-blur-md border border-white/10 flex items-center justify-center text-white transition-all active:scale-95"
        aria-label={muted ? 'Activar audio' : 'Silenciar'}
        title={muted ? 'Activar audio' : 'Silenciar'}
      >
        {muted ? (
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15zM17 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2" /></svg>
        ) : (
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" /></svg>
        )}
      </button>
      {/* Animated background blobs (shared across all scenes) */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-32 -left-32 w-96 h-96 rounded-full bg-blue-600/25 blur-3xl animate-blob" />
        <div className="absolute top-1/2 -right-32 w-96 h-96 rounded-full bg-purple-600/25 blur-3xl animate-blob animation-delay-2000" />
        <div className="absolute -bottom-32 left-1/3 w-80 h-80 rounded-full bg-pink-600/20 blur-3xl animate-blob animation-delay-4000" />
      </div>

      {scene === 0 && <DemoIntro />}
      {scene === 1 && <DemoSources />}
      {scene === 2 && <DemoDownload />}
      {scene === 3 && <DemoLibrary />}
      {scene === 4 && <DemoSetBuilder />}
      {scene === 5 && <DemoExport />}
      {scene === 6 && <DemoCTA />}

      {/* Scene progress indicators */}
      <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex gap-1.5 z-20">
        {Array.from({ length: SCENES }).map((_, i) => (
          <button
            key={i}
            onClick={() => setScene(i)}
            className={`h-1 rounded-full transition-all duration-300 ${i === scene ? 'w-8 bg-white' : 'w-1.5 bg-white/30 hover:bg-white/50'}`}
            aria-label={`Escena ${i + 1}`}
          />
        ))}
      </div>
    </div>
  )
}

// Centered scene title overlay — appears in the middle of the screen with
// a fade+scale animation, holds, then fades out so the mockup behind is fully
// visible. One per scene, consistent placement.
function DemoSceneTitle({ title, subtitle, accent = 'text-blue-400' }) {
  return (
    <div className="absolute inset-0 z-30 flex items-center justify-center pointer-events-none animate-demo-title-overlay px-6">
      <div className="absolute inset-0 bg-gradient-to-b from-slate-950/40 via-slate-950/70 to-slate-950/40" />
      <div className="relative text-center max-w-2xl">
        <h2 className="text-3xl md:text-5xl font-black text-white leading-tight drop-shadow-2xl">{title}</h2>
        <p className={`text-base md:text-xl mt-3 font-bold ${accent} drop-shadow-2xl`}>{subtitle}</p>
      </div>
    </div>
  )
}

// Faux app-shell topbar — makes a scene feel like a real app screenshot.
function DemoAppHeader({ active }) {
  const tabs = ['Discover', 'Biblioteca', 'Set', 'Mix']
  return (
    <div className="flex-shrink-0 flex items-center gap-2 px-3 py-1.5 mb-3 rounded-lg bg-slate-900/60 border border-white/10 backdrop-blur-sm">
      <img src="/logo.png" alt="" className="w-4 h-4 rounded" />
      <span className="text-[10px] text-white font-bold">DJ Free App</span>
      <div className="flex-1 flex justify-center gap-0.5">
        {tabs.map(t => (
          <span
            key={t}
            className={`text-[10px] px-2 py-0.5 rounded font-semibold transition-colors ${
              t === active
                ? 'bg-blue-500 text-white shadow-md shadow-blue-500/30'
                : 'text-gray-500'
            }`}
          >
            {t}
          </span>
        ))}
      </div>
      <div className="flex gap-1">
        <span className="w-1.5 h-1.5 rounded-full bg-red-500/70" />
        <span className="w-1.5 h-1.5 rounded-full bg-yellow-500/70" />
        <span className="w-1.5 h-1.5 rounded-full bg-green-500/70" />
      </div>
    </div>
  )
}

function DemoIntro() {
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center animate-fade-in z-10">
      <div className="relative animate-bounce-subtle">
        <div className="absolute inset-0 rounded-3xl bg-blue-500/50 blur-3xl" />
        <img src="/logo.png" alt="DJ Free App" className="relative w-28 h-28 rounded-3xl ring-2 ring-white/20" />
      </div>
      <h1 className="mt-6 text-5xl font-extrabold text-white tracking-tight animate-fade-in-up">DJ Free App</h1>
      <p className="mt-3 text-base text-gray-300 animate-fade-in-up">Tu workflow completo de DJ — automatizado</p>
      <div className="mt-5 flex gap-2 animate-fade-in-up">
        {['Discover', 'Download', 'Analyze', 'Mix', 'Export'].map(t => (
          <span key={t} className="text-xs px-3 py-1 rounded-full bg-white/[0.06] border border-white/10 text-gray-300 font-semibold">{t}</span>
        ))}
      </div>
    </div>
  )
}

// Discover — replica de la página "Melodic House" de Beatport: header grande
// con track count + refresh + 3 album thumbs, tabs de género, "Preview
// continuo" + chips de duración, lista de tracks con label + BPM + Key.
function DemoSources() {
  // Two genre catalogs that cycle, showing the user that Discover walks through
  // multiple Beatport/Spotify charts.
  const CATALOGS = [
    {
      genre: 'Melodic House',
      count: 100,
      tracks: [
        { n: 'Hot Sauce (Extended)',    a: 'Kapuchon, Miss Monique', label: 'AETERNA',     bpm: 129, k: 'Gb · 11A', d: '5:36', state: 'dl',                       cover: '/demo/covers/hot-sauce.jpg' },
        { n: 'Be The One (Extended)',   a: 'Adam Port, Keinemusik',  label: 'Keinemusik',  bpm: 123, k: 'F · 11A',  d: '4:45', state: 'dl',                       cover: '/demo/covers/be-the-one.jpg' },
        { n: 'Recall (Extended Mix)',   a: 'HotLap',                 label: 'One Seven',   bpm: 122, k: 'E · 11A',  d: '5:48', state: 'done', dot: true,          cover: '/demo/covers/recall.jpg' },
        { n: "Didn't Miss You (OG)",    a: 'Liva K',                 label: 'Magnifik',    bpm: 122, k: 'F · 11A',  d: '5:46', state: 'dl',   highlight: true,    cover: '/demo/covers/didnt-miss.jpg' },
        { n: 'Eternity (Extended Mix)', a: 'Anyma',                  label: 'Afterlife',   bpm: 124, k: '8A',       d: '6:54', state: 'dl',                       cover: '/demo/covers/eternity.jpg' },
        { n: 'Innerbloom (RÜFÜS Remix)',a: 'RÜFÜS DU SOL',           label: 'Rose Avenue', bpm: 122, k: '6B',       d: '7:21', state: 'done', dot: true,          cover: '/demo/covers/innerbloom.jpg' },
        { n: 'At Night (Extended)',     a: 'Anyma, Layton Giordani', label: 'Afterlife',   bpm: 124, k: '8A',       d: '6:18', state: 'dl',                       cover: '/demo/covers/at-night.jpg' },
        { n: 'Velvet Avenue (Extended)',a: 'Aname',                  label: 'Crosstown',   bpm: 122, k: 'Fm · 4A',  d: '5:24', state: 'dl',                       cover: '/demo/covers/velvet.jpg' },
      ],
    },
    {
      genre: 'Tech House',
      count: 88,
      tracks: [
        { n: 'Tesla (Extended Mix)',    a: 'Mau P',                  label: 'Repopulate',     bpm: 128, k: '4A',       d: '6:12', state: 'dl',                       cover: '/demo/covers/tesla.jpg' },
        { n: 'Crush (Extended Mix)',    a: 'Biscits',                label: 'Solid Grooves',  bpm: 128, k: 'Fm · 4A',  d: '5:48', state: 'dl',                       cover: '/demo/covers/biscits-crush.jpg' },
        { n: 'Operate (Extended)',      a: 'Deeper Purpose',         label: 'Drumcode',       bpm: 128, k: 'Gm · 6A',  d: '5:32', state: 'done', dot: true,          cover: '/demo/covers/deeper-purpose.jpg' },
        { n: 'Pom (Original Mix) 130',  a: 'Chico Rose (NL)',        label: 'Toolroom',       bpm: 130, k: 'D# · 5B',  d: '5:11', state: 'dl',   highlight: true,    cover: '/demo/covers/chico-rose.jpg' },
        { n: "Don't Stop (Extended)",   a: 'Prospa',                 label: 'Higher Ground',  bpm: 124, k: 'D# · 5B',  d: '5:02', state: 'dl',                       cover: '/demo/covers/prospa.jpg' },
        { n: 'Sweet Dreams (Original)', a: 'Polovich',               label: 'Repopulate',     bpm: 130, k: 'B · 1B',   d: '4:37', state: 'done', dot: true,          cover: '/demo/covers/polovich.jpg' },
        { n: 'Spotlight (Original)',    a: 'Andrea Oliva',           label: 'VOD',            bpm: 122, k: 'Eb · 4B',  d: '6:21', state: 'dl',                       cover: '/demo/covers/spotlight.jpg' },
        { n: 'Pa Ca (Original Mix)',    a: 'Massano, Silver Panda',  label: 'Simulate',       bpm: 128, k: 'B · 1B',   d: '4:47', state: 'dl',                       cover: '/demo/covers/paca.jpg' },
      ],
    },
  ]
  const [catIdx, setCatIdx] = useState(0)
  useEffect(() => {
    const t = setTimeout(() => setCatIdx(i => (i + 1) % CATALOGS.length), 5500)
    return () => clearTimeout(t)
  }, [catIdx])
  const cat = CATALOGS[catIdx]
  const tracks = cat.tracks
  return (
    <div className="absolute inset-0 flex flex-col p-3 md:p-5 animate-fade-in z-10">
      <DemoSceneTitle
        title="Recorré los charts de Beatport y Spotify"
        subtitle="top charts renovados cada semana · EDM · POP · LATIN"
        accent="text-blue-400"
      />
      <DemoAppHeader active="Discover" />
      {/* Hero header: dynamic genre + track count + refresh + album thumbs */}
      <div className="flex-shrink-0 flex items-center gap-3 mb-2 px-1">
        <div className="flex-1 min-w-0">
          <h2 key={`title-${catIdx}`} className="text-lg md:text-xl font-extrabold text-white leading-tight animate-fade-in">{cat.genre}</h2>
          <p className="text-[10px] text-gray-400 flex items-center gap-1">
            <span className="text-white font-bold">{cat.count}</span> tracks · actualizado hoy 12:28
            <svg className="w-2.5 h-2.5 text-blue-400 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
          </p>
        </div>
        <div key={`thumbs-${catIdx}`} className="flex gap-1 flex-shrink-0 animate-fade-in">
          {tracks.slice(0, 3).map((t, i) => (
            <img key={i} src={t.cover} alt="" className="w-7 h-7 rounded object-cover ring-1 ring-white/20" />
          ))}
        </div>
      </div>

      {/* Genre tabs — active tab highlights based on the cycling catalog */}
      <div className="flex-shrink-0 flex items-center gap-2 mb-2 px-1 overflow-hidden text-[10px]">
        {['All', 'Melodic House', 'Mel. Techno', 'Tech House', 'Afro House', 'Deep House', 'Hip Hop', 'Nu Disco'].map(t => {
          const isActive = (cat.genre === 'Melodic House' && t === 'Melodic House') || (cat.genre === 'Tech House' && t === 'Tech House')
          return (
            <span key={t} className={isActive ? 'text-blue-300 border-b-2 border-blue-400 pb-0.5 font-semibold transition-colors' : 'text-gray-500 transition-colors'}>{t}</span>
          )
        })}
      </div>

      {/* Preview continuo + duration chips + Stop */}
      <div className="flex-shrink-0 flex items-center gap-1.5 mb-2 px-1">
        <span className="text-[10px] px-2 py-0.5 rounded-full bg-purple-500/30 border border-purple-400/50 text-purple-200 font-bold flex items-center gap-1">
          <svg className="w-2.5 h-2.5" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z" /></svg>
          Preview continuo
        </span>
        <span className="text-[9px] px-1.5 py-0.5 rounded-md bg-blue-500/30 text-blue-200 font-bold">30s</span>
        <span className="text-[9px] px-1.5 py-0.5 rounded text-gray-400">60s</span>
        <span className="text-[9px] px-1.5 py-0.5 rounded text-gray-400">90s</span>
        <span className="text-[9px] px-1.5 py-0.5 rounded text-gray-400">120s</span>
        <span className="text-[10px] px-2 py-0.5 rounded-full bg-red-500/30 border border-red-400/50 text-red-200 font-bold flex items-center gap-1">
          <span className="w-1.5 h-1.5 rounded-full bg-red-500" />
          Stop
        </span>
        <span className="text-[10px] text-gray-500 ml-1">{cat.count} tracks</span>
      </div>

      {/* Track list */}
      <div key={`list-${catIdx}`} className="flex-1 min-h-0 space-y-1 overflow-hidden">
        {tracks.map((t, i) => (
          <div
            key={`${catIdx}-${i}`}
            className={`flex items-center gap-2 px-1.5 py-1 rounded animate-demo-tag-pop ${
              t.highlight ? 'bg-green-500/[0.08] ring-1 ring-green-500/40' : ''
            }`}
            style={{ animationDelay: `${i * 200}ms` }}
          >
            <span className="text-[9px] text-gray-500 font-mono w-3 flex-shrink-0">{i + 1}</span>
            <img src={t.cover} alt="" className="w-7 h-7 rounded object-cover flex-shrink-0 ring-1 ring-white/10" />
            <div className="flex-1 min-w-0">
              <div className={`text-[10px] font-bold truncate flex items-center gap-1 ${t.highlight ? 'text-green-300' : 'text-white'}`}>
                {t.n}
                {t.dot && <span className="w-1.5 h-1.5 rounded-full bg-green-400 flex-shrink-0" />}
              </div>
              <div className="text-[9px] text-gray-400 truncate">{t.a}</div>
            </div>
            <span className="text-[9px] px-1.5 py-0.5 rounded bg-white/[0.06] text-gray-300 font-semibold flex-shrink-0 hidden md:inline">Mel. H&T</span>
            <span className="text-[9px] px-1.5 py-0.5 rounded bg-white/[0.06] text-gray-400 flex-shrink-0 hidden md:inline">{t.label}</span>
            <span className="text-[9px] text-gray-500 font-mono flex-shrink-0">{t.bpm}</span>
            <span className="text-[9px] px-1.5 py-0.5 rounded bg-orange-500/20 text-orange-300 font-bold font-mono flex-shrink-0">{t.k}</span>
            <span className="text-[9px] text-gray-500 font-mono flex-shrink-0 hidden md:inline">{t.d}</span>
            <button
              className={`text-[9px] px-2 py-0.5 rounded-full font-bold flex-shrink-0 ${
                t.state === 'done'
                  ? 'bg-green-500/30 text-green-300 border border-green-500/40'
                  : 'bg-blue-500 text-white shadow-md shadow-blue-500/30'
              }`}
            >
              {t.state === 'done' ? '✓ Descargado' : '↓ Descargar'}
            </button>
          </div>
        ))}
      </div>

    </div>
  )
}

// Download — replica de la lista Discover + context menu popup mostrando
// las opciones Autoplay 30s/60s/90s/120s + Radio + Compartir, mientras
// las descargas avanzan en background con progress bars.
function DemoDownload() {
  const listRows = [
    { n: 'Recall (Extended Mix)',     a: 'HotLap',                fmt: 'FLAC', state: 'done', cover: '/demo/covers/recall.jpg' },
    { n: "Didn't Miss You (OG)",      a: 'Liva K',                fmt: 'FLAC', state: 'menu', cover: '/demo/covers/didnt-miss.jpg', highlight: true },
    { n: 'Spotlight (Original Mix)',  a: 'Andrea Oliva',          fmt: 'FLAC', state: 'dl',   cover: '/demo/covers/spotlight.jpg' },
    { n: 'Pa Ca (Original Mix)',      a: 'Massano, Silver Panda', fmt: 'FLAC', state: 'dl',   cover: '/demo/covers/paca.jpg' },
  ]
  const downloads = [
    { name: 'Liva K - Didn\'t Miss You.flac',     size: '40MB', fmt: 'FLAC', progress: 88, cover: '/demo/covers/didnt-miss.jpg' },
    { name: 'Andrea Oliva - Spotlight.flac',     size: '46MB', fmt: 'FLAC', progress: 54, cover: '/demo/covers/spotlight.jpg' },
    { name: 'Massano - Pa Ca.flac',              size: '32MB', fmt: 'FLAC', progress: 22, cover: '/demo/covers/paca.jpg' },
  ]
  return (
    <div className="absolute inset-0 flex flex-col p-3 md:p-5 animate-fade-in z-10">
      <DemoSceneTitle
        title="Descarga directa · calidad profesional"
        subtitle="FLAC sin pérdida · MP3 320k · WAV — al instante"
        accent="text-green-400"
      />
      <DemoAppHeader active="Discover" />

      <div className="flex-1 grid grid-cols-2 gap-3 min-h-0">
        {/* Left: track list with context menu popup */}
        <div className="relative min-w-0">
          <div className="space-y-1">
            {listRows.map((t, i) => (
              <div
                key={i}
                className={`flex items-center gap-1.5 px-1.5 py-1 rounded animate-demo-tag-pop ${
                  t.highlight ? 'bg-green-500/[0.08] ring-1 ring-green-500/40' : ''
                }`}
                style={{ animationDelay: `${i * 150}ms` }}
              >
                <span className="text-[9px] text-gray-500 font-mono w-3 flex-shrink-0">{i + 3}</span>
                <img src={t.cover} alt="" className="w-6 h-6 rounded object-cover flex-shrink-0 ring-1 ring-white/10" />
                <div className="flex-1 min-w-0">
                  <div className={`text-[10px] font-bold truncate ${t.highlight ? 'text-green-300' : 'text-white'}`}>{t.n}</div>
                  <div className="text-[9px] text-gray-400 truncate">{t.a}</div>
                </div>
                <span className="text-[8px] text-green-400 font-bold flex-shrink-0">{t.fmt}</span>
              </div>
            ))}
          </div>

          {/* Context menu popup overlay */}
          <div className="absolute right-0 top-7 w-44 rounded-lg bg-slate-900 border border-white/15 shadow-2xl shadow-black/60 z-30 overflow-hidden animate-demo-tag-pop" style={{ animationDelay: '600ms' }}>
            <div className="px-2.5 py-1.5 border-b border-white/10 text-[9px] text-white font-bold truncate">Liva K · Didn't Miss You</div>
            <div className="px-2.5 py-1.5 flex items-center gap-1.5 hover:bg-white/5 text-[10px] text-white">
              <svg className="w-2.5 h-2.5 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
              Descargar
            </div>
            <div className="px-2.5 pt-2 pb-0.5 text-[8px] uppercase tracking-wider text-gray-500 font-semibold">Preview continuo</div>
            <div className="px-2.5 py-1 flex items-center gap-1.5 bg-purple-500/10 text-[10px] text-purple-200">
              <svg className="w-2.5 h-2.5 text-purple-400" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z" /></svg>
              Autoplay 30s por tema
            </div>
            <div className="px-2.5 py-1 flex items-center gap-1.5 text-[10px] text-gray-300">
              <svg className="w-2.5 h-2.5 text-purple-400" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z" /></svg>
              Autoplay 60s por tema
            </div>
            <div className="px-2.5 py-1 flex items-center gap-1.5 text-[10px] text-gray-300">
              <svg className="w-2.5 h-2.5 text-purple-400" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z" /></svg>
              Autoplay 90s · 120s
            </div>
            <div className="border-t border-white/10 px-2.5 py-1 flex items-center gap-1.5 text-[10px] text-gray-300">
              📻 Radio
            </div>
            <div className="px-2.5 py-1 flex items-center gap-1.5 text-[10px] text-gray-300">
              🔗 Compartir link
            </div>
          </div>
        </div>

        {/* Right: live downloads with progress */}
        <div className="flex flex-col gap-1.5 min-w-0">
          <div className="text-[9px] font-bold text-blue-400 uppercase tracking-widest flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse" />
            Descargas activas · 3/3
          </div>
          {downloads.map((d, i) => (
            <div key={i} className="bg-white/[0.04] border border-white/10 rounded-lg p-1.5 animate-demo-tag-pop" style={{ animationDelay: `${300 + i * 200}ms` }}>
              <div className="flex items-center gap-1.5 mb-1">
                <img src={d.cover} alt="" className="w-5 h-5 rounded object-cover flex-shrink-0 ring-1 ring-white/10" />
                <div className="flex-1 min-w-0">
                  <div className="text-[9px] text-white truncate">{d.name}</div>
                  <div className="text-[8px] text-gray-500">{d.size} · {d.progress}%</div>
                </div>
                <span className="text-[8px] px-1.5 py-0.5 rounded-full bg-green-500/30 text-green-300 font-bold flex-shrink-0">{d.fmt}</span>
              </div>
              <div className="h-1 bg-white/5 rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-blue-500 via-purple-500 to-pink-500 animate-demo-progress"
                  style={{ animationDelay: `${i * 250}ms` }}
                />
              </div>
            </div>
          ))}
          <div className="mt-1 px-2 py-1 rounded-md bg-green-500/10 border border-green-500/30 text-[9px] text-green-300 font-bold flex items-center gap-1">
            ✓ SoulSeek · análisis BPM/Key automático al terminar
          </div>
        </div>
      </div>
    </div>
  )
}

// Library — replica fiel del Cards layout: header con stats (305 tracks, ★, Keys, Buscar)
// + grupos por género en columnas (Tech House 92, Deep House 47, ...).
function DemoLibrary() {
  const groups = [
    { name: 'Tech House', count: 92, dot: 'bg-blue-500', tracks: [
      { t: '04 - 05 - Biscits - 2C2 (Extended Mix)', f: 'FLAC' },
      { t: '06 - 04 - Corrupt (Uk) - Trippin (Extended)', f: 'FLAC' },
      { t: '08 - Biscits - Freak (Extended Mix)', f: 'FLAC' },
      { t: '01-mau_p-merther_(extended_mix)', f: 'FLAC' },
    ]},
    { name: 'Deep House', count: 47, dot: 'bg-green-500', tracks: [
      { t: 'For The Soul', f: 'FLAC' },
      { t: '01. Feels Like Us (Extended Mix)', f: 'FLAC' },
      { t: '02-zehv-leland.mp3', f: 'MP3' },
      { t: 'dreams (Extended Mix)', f: 'FLAC' },
    ]},
    { name: 'Melodic House', count: 41, dot: 'bg-purple-500', tracks: [
      { t: '07 - 02 - 03-nordfold-forever_(extended_mix)', f: 'MP3' },
      { t: '01 - Rainy (Devault Remix)', f: 'FLAC' },
      { t: '01 RÜFÜS DU SOL - On My Knees', f: 'M4A' },
      { t: '01 Somebody (2024)', f: 'FLAC' },
    ]},
  ]
  return (
    <div className="absolute inset-0 flex flex-col p-3 md:p-5 animate-fade-in z-10">
      <DemoSceneTitle
        title="Biblioteca clasificada por IA"
        subtitle="305 tracks · BPM · Camelot Key · género — sin tocar nada"
        accent="text-purple-400"
      />
      <DemoAppHeader active="Biblioteca" />
      {/* Stats bar replicando el header real "305 tracks · Cards · Join · Tracks · All ★...★★★★★ · Organizar (3) · Keys (115) · Buscar..." */}
      <div className="flex-shrink-0 flex items-center gap-2 px-2 py-1.5 mb-2 rounded-lg bg-slate-900/60 border border-white/10 overflow-hidden">
        <span className="text-[10px] text-gray-400"><span className="text-white font-bold">305</span> tracks</span>
        <span className="text-[10px] px-2 py-0.5 rounded-md bg-blue-500/30 text-blue-200 font-bold">Cards</span>
        <span className="text-[10px] text-gray-500">Tracks</span>
        <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-500/20 text-blue-300 font-bold">All</span>
        <span className="text-[10px] text-yellow-400 tracking-wider">★★★★★</span>
        <span className="flex-1" />
        <span className="text-[10px] px-2 py-0.5 rounded-md bg-blue-500/20 text-blue-300 font-bold">📁 Organizar (3)</span>
        <span className="text-[10px] px-2 py-0.5 rounded-md bg-purple-500/20 text-purple-300 font-bold">🎵 Keys (115)</span>
      </div>
      {/* Genre filter pills */}
      <div className="flex-shrink-0 flex items-center gap-1 mb-2 overflow-hidden">
        <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-blue-500/30 border border-blue-400/40 text-blue-200 font-bold">All</span>
        {[
          { n: 'Tech House', c: 92, color: 'text-blue-400' },
          { n: 'Deep House', c: 47, color: 'text-green-400' },
          { n: 'Melodic House', c: 41, color: 'text-purple-400' },
          { n: 'Progressive', c: 20, color: 'text-orange-400' },
          { n: 'Afro House', c: 18, color: 'text-pink-400' },
          { n: 'Mel. Techno', c: 17, color: 'text-cyan-400' },
        ].map(g => (
          <span key={g.n} className={`text-[9px] px-1.5 py-0.5 rounded-full bg-white/[0.04] border border-white/10 ${g.color} font-semibold flex items-center gap-1 flex-shrink-0`}>
            <span className="w-1 h-1 rounded-full bg-current" />
            {g.n} ({g.c})
          </span>
        ))}
      </div>
      {/* Cards grid — 3 genre cards visible */}
      <div className="flex-1 grid grid-cols-3 gap-2 min-h-0">
        {groups.map((g, gi) => (
          <div
            key={g.name}
            className="bg-slate-900/80 border border-white/10 rounded-lg overflow-hidden animate-demo-tag-pop flex flex-col"
            style={{ animationDelay: `${gi * 200}ms` }}
          >
            <div className="flex-shrink-0 flex items-center justify-between px-2.5 py-1.5 border-b border-white/10">
              <div className="flex items-center gap-1.5 min-w-0">
                <span className={`w-1.5 h-1.5 rounded-full ${g.dot} flex-shrink-0`} />
                <span className="text-[10px] font-bold text-white truncate">{g.name}</span>
              </div>
              <span className="text-[9px] font-bold text-gray-300 bg-white/10 px-1.5 py-0.5 rounded">{g.count}</span>
            </div>
            <div className="flex-1 px-2 py-1 space-y-0.5 overflow-hidden">
              {g.tracks.map((tr, ti) => (
                <div
                  key={ti}
                  className="flex items-center gap-1.5 py-0.5 animate-demo-tag-pop"
                  style={{ animationDelay: `${gi * 200 + 300 + ti * 100}ms` }}
                >
                  <svg className="w-2.5 h-2.5 text-gray-500 flex-shrink-0" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z" /></svg>
                  <span className="text-[9px] text-gray-300 truncate flex-1">{tr.t}</span>
                  <span className={`text-[8px] font-bold flex-shrink-0 ${
                    tr.f === 'FLAC' ? 'text-green-400' : tr.f === 'MP3' ? 'text-blue-400' : 'text-purple-400'
                  }`}>{tr.f}</span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// Set Builder — the killer feature scene. Cycles through 4 generation methods
// (Camelot / Energy / Genre / Peak) showing how the same library produces
// 4 different orderings. Each method ~2s on screen.
function DemoSetBuilder() {
  const TRACKS = [
    { name: 'Prospa - Don\'t Stop (Extended Mix)',           k: 'D# · 5B', bpm: 124, energy: 5, genre: 'Indie Dance',  fmt: 'FLAC', size: '27.82MB', stars: 3 },
    { name: 'Chico Rose (NL) - Pom (Original Mix) 130',      k: 'D# · 5B', bpm: 130, energy: 6, genre: 'Tech House',   fmt: 'FLAC', size: '49.8MB',  stars: 4 },
    { name: '22 - Deeper Purpose - Operate (Extended)',      k: 'Gm · 6A', bpm: 128, energy: 7, genre: 'Tech House',   fmt: 'FLAC', size: '40.39MB', stars: 5 },
    { name: 'Polovich - Sweet Dreams (Original Mix)',        k: 'B · 1B',  bpm: 130, energy: 8, genre: 'Melodic House',fmt: 'MP3',  size: '10.73MB', stars: 5 },
    { name: 'Biscits - Crush (Extended Mix)',                k: 'Fm · 4A', bpm: 128, energy: 9, genre: 'Tech House',   fmt: 'FLAC', size: '43.18MB', stars: 5 },
  ]
  // Only Camelot + Energy methods (per user feedback — Genre/Peak removed)
  const METHODS = [
    {
      id: 'camelot',
      label: '🎯 Camelot',
      desc: 'Encadena tracks por compatibilidad armónica',
      order: [0, 1, 2, 3, 4],
      color: 'purple',
    },
    {
      id: 'energy',
      label: '⚡ Energy',
      desc: 'Por curva de energía — sube progresivamente',
      order: [0, 1, 2, 3, 4],
      color: 'yellow',
    },
  ]

  const [stage, setStage] = useState(-1)
  useEffect(() => {
    const t = setTimeout(() => {
      setStage(s => (s >= METHODS.length - 1 ? s : s + 1))
    }, stage === -1 ? 1500 : 3500)
    return () => clearTimeout(t)
  }, [stage])

  const activeMethod = stage >= 0 ? METHODS[stage] : null
  const orderedTracks = activeMethod ? activeMethod.order.map(i => TRACKS[i]) : TRACKS

  const colorMap = {
    purple: { chip: 'bg-purple-500/30 border-purple-400/60 text-purple-200 shadow-purple-500/30', ring: 'ring-purple-400/60', text: 'text-purple-300' },
    yellow: { chip: 'bg-yellow-500/30 border-yellow-400/60 text-yellow-200 shadow-yellow-500/30', ring: 'ring-yellow-400/60', text: 'text-yellow-300' },
    pink:   { chip: 'bg-pink-500/30 border-pink-400/60 text-pink-200 shadow-pink-500/30',         ring: 'ring-pink-400/60',   text: 'text-pink-300' },
    orange: { chip: 'bg-orange-500/30 border-orange-400/60 text-orange-200 shadow-orange-500/30', ring: 'ring-orange-400/60', text: 'text-orange-300' },
  }

  return (
    <div className="absolute inset-0 flex flex-col p-4 md:p-6 animate-fade-in z-10">
      <DemoSceneTitle
        title="Asistente IA de playlists"
        subtitle="Sets compatibles por Camelot · Energy — 1 click"
        accent="text-purple-400"
      />
      <DemoAppHeader active="Set" />

      {/* Filter row (always visible) */}
      <div className="flex flex-wrap justify-center gap-1.5 mb-2">
        <span className="text-[10px] px-2 py-0.5 rounded-full bg-blue-500/20 border border-blue-400/40 text-blue-300 font-bold">60'</span>
        <span className="text-[10px] px-2 py-0.5 rounded-full bg-yellow-500/20 border border-yellow-400/40 text-yellow-300 font-bold">★★★★★</span>
        <span className="text-[10px] px-2 py-0.5 rounded-full bg-blue-500/20 border border-blue-400/40 text-blue-300 font-bold">Tech House</span>
      </div>

      {/* Method chips — active one highlighted */}
      <div className="flex justify-center gap-1.5 mb-2">
        {METHODS.map((m, i) => {
          const isActive = stage === i
          const c = colorMap[m.color]
          return (
            <span
              key={m.id}
              className={`text-[11px] px-2.5 py-1 rounded-full border font-bold transition-all duration-300 ${
                isActive
                  ? `${c.chip} shadow-lg scale-110`
                  : 'bg-white/[0.04] border-white/10 text-gray-500'
              }`}
            >
              {m.label}
            </span>
          )
        })}
      </div>

      {/* Active method description */}
      <div className="text-center min-h-4 mb-2">
        {activeMethod ? (
          <p key={activeMethod.id} className={`text-[11px] font-semibold animate-fade-in ${colorMap[activeMethod.color].text}`}>
            {activeMethod.desc}
          </p>
        ) : (
          <p className="text-[11px] text-gray-500 animate-fade-in">Generando set…</p>
        )}
      </div>

      {/* Track sequence — only visible during method cycling stages. After
          the cycle finishes, swap for a Features enumeration. */}
      {showFeatures ? (
        <div className="flex-1 flex flex-col justify-center min-h-0 px-3 py-2 space-y-2.5">
          <div className="text-center mb-2 animate-fade-in-up">
            <p className="text-[11px] uppercase tracking-widest text-purple-400 font-bold">Editor de playlists con IA</p>
            <h3 className="text-base md:text-lg font-extrabold text-white">Integración nativa con <span className="text-orange-400">Rekordbox</span></h3>
          </div>
          {FEATURES.map((f, i) => (
            <div
              key={f.label}
              className="flex items-start gap-3 px-3 py-2 rounded-xl bg-gradient-to-r from-white/[0.06] to-transparent border-l-2 border-purple-400/60 animate-demo-tag-pop"
              style={{ animationDelay: `${i * 250}ms` }}
            >
              <span className="text-2xl flex-shrink-0">{f.icon}</span>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-extrabold text-white leading-tight">{f.label}</div>
                <div className="text-[11px] text-gray-400 leading-tight mt-0.5">{f.desc}</div>
              </div>
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-green-500/20 text-green-300 font-bold flex-shrink-0">✓</span>
            </div>
          ))}
        </div>
      ) : (
      <div key={activeMethod?.id || 'intro'} className="flex-1 space-y-0.5 mb-2 min-h-0 overflow-hidden">
        {orderedTracks.map((t, i) => {
          const accent = {
            5: 'bg-blue-500',
            6: 'bg-cyan-400',
            7: 'bg-purple-500',
            8: 'bg-pink-500',
            9: 'bg-red-500',
          }[t.energy] || 'bg-slate-500'
          const rowBg = {
            5: 'bg-blue-500/[0.04]',
            6: 'bg-cyan-500/[0.05]',
            7: 'bg-purple-500/[0.06]',
            8: 'bg-pink-500/[0.08]',
            9: 'bg-red-500/[0.10]',
          }[t.energy] || ''
          return (
            <div
              key={`${activeMethod?.id || 'intro'}-${i}`}
              className={`relative ${rowBg} hover:bg-white/[0.02] rounded px-2 py-1.5 flex items-center gap-2 animate-demo-tag-pop`}
              style={{ animationDelay: `${i * 80}ms` }}
            >
              <span className={`absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-5 rounded-r ${accent}`} />
              <span className="text-[10px] text-gray-500 font-mono w-4 flex-shrink-0">{i + 1}</span>
              <svg className="w-3 h-3 text-gray-500 flex-shrink-0" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z" /></svg>
              <div className="flex-1 min-w-0">
                <div className="text-[11px] font-semibold text-white truncate">{t.name}</div>
              </div>
              <span className="text-[9px] text-gray-300 truncate flex-shrink-0 hidden md:inline">{t.genre}</span>
              <span className={`text-[9px] font-bold flex-shrink-0 ${t.fmt === 'FLAC' ? 'text-green-400' : 'text-blue-400'}`}>{t.fmt}</span>
              <span className="text-[9px] font-mono text-gray-400 flex-shrink-0 hidden md:inline w-14 text-right">{t.size}</span>
              <span className="text-[9px] font-bold font-mono px-1.5 py-0.5 rounded bg-orange-500/20 text-orange-300 flex-shrink-0">{t.k}</span>
              <span className="text-[10px] text-yellow-400 tracking-tighter flex-shrink-0">{'★'.repeat(t.stars)}<span className="text-white/10">{'★'.repeat(5 - t.stars)}</span></span>
              <span className="text-gray-500 text-xs flex-shrink-0">×</span>
            </div>
          )
        })}
      </div>
      )}

      {/* Curve visualization — bars representing energy by position. Hidden when showing features list. */}
      {!showFeatures && (
        <div className="space-y-1">
          <div className="flex justify-between text-[10px] text-gray-300">
            <span className="font-semibold">⚡ {activeMethod?.id === 'peak' ? 'Curva Peak' : 'Energy curve'}</span>
            <span className="text-yellow-400 font-bold font-mono">
              {orderedTracks.map(t => t.energy).join(' → ')}
            </span>
          </div>
          <div className="flex items-end gap-1 h-8">
            {orderedTracks.map((t, i) => (
              <div
                key={`${activeMethod?.id || 'intro'}-bar-${i}`}
                className="flex-1 rounded-t bg-gradient-to-t from-blue-500 via-purple-500 to-pink-500 transition-all duration-500 ease-out"
                style={{ height: `${t.energy * 11}%` }}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// Mix Editor — replica del timeline real con tracks crossfading, etiquetas
// "Auto 16s" indicando fade automático, BPM 128, Snap, "Exportar Mix" → MP3.
function DemoExport() {
  // Track positions on timeline (start% / width% / color)
  const blocks = [
    { name: 'Nick Curly · Attention',                    left: 2,  width: 22, color: 'bg-blue-500/40 border-blue-400/60',   text: 'text-blue-200'   },
    { name: 'Adriatique · Miracle (RÜFÜS Remix)',        left: 20, width: 30, color: 'bg-purple-500/40 border-purple-400/60', text: 'text-purple-200' },
    { name: 'Zeca Veloso · Todo Homem',                  left: 46, width: 24, color: 'bg-orange-500/40 border-orange-400/60', text: 'text-orange-200' },
    { name: '01-mau_p-merther',                          left: 67, width: 26, color: 'bg-green-500/40 border-green-400/60',  text: 'text-green-200'  },
  ]
  return (
    <div className="absolute inset-0 flex flex-col p-3 md:p-5 animate-fade-in z-10">
      <DemoAppHeader active="Mix" />
      {/* Toolbar replicando "Volver al Set | Mix Editor 15 tracks · 83:52 | ▶ | 0:00/83:52 | BPM 128 | Snap | Zoom" */}
      <div className="flex-shrink-0 flex items-center gap-2 px-2 py-1.5 mb-1 rounded-lg bg-slate-900/60 border border-white/10 text-[10px]">
        <span className="text-gray-400 hover:text-white">‹ Volver al Set</span>
        <span className="text-white font-bold">Mix Editor</span>
        <span className="text-gray-400">15 tracks · 83:52</span>
        <button className="w-5 h-5 rounded-full bg-blue-500 flex items-center justify-center text-white">
          <svg className="w-2.5 h-2.5" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z" /></svg>
        </button>
        <span className="text-gray-300 font-mono text-[9px]">0:00 / 83:52</span>
        <span className="text-gray-400">BPM</span>
        <span className="px-1.5 py-0.5 rounded bg-slate-800 text-white font-bold font-mono">128</span>
        <span className="px-1.5 py-0.5 rounded bg-purple-500/30 text-purple-200 font-bold">Snap</span>
        <span className="text-gray-400">Zoom <span className="text-gray-500">- 2x +</span></span>
        <span className="flex-1" />
        <span className="px-2 py-0.5 rounded-md bg-slate-800 text-gray-300 font-mono">Mix 9-5</span>
        <span className="px-2 py-0.5 rounded-md bg-slate-800 text-blue-300 font-bold">MP3 320k ▾</span>
        <button className="px-2 py-0.5 rounded-md bg-blue-500 text-white font-bold flex items-center gap-1">
          <svg className="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
          Exportar Mix
        </button>
      </div>

      <DemoSceneTitle
        title="Previsualizá tu mix antes de tocarlo"
        subtitle="Crossfading auto · beatmatching · export MP3 320k"
        accent="text-pink-400"
      />

      {/* Timeline ruler */}
      <div className="flex-shrink-0 flex border-b border-white/10 px-1 py-0.5 text-[8px] text-gray-500 font-mono">
        {['11:00', '12:00', '13:00', '14:00', '15:00', '16:00', '17:00', '18:00', '19:00', '20:00'].map(t => (
          <span key={t} className="flex-1">{t}</span>
        ))}
      </div>

      {/* Timeline track lanes */}
      <div className="flex-1 relative bg-slate-900/40 rounded-b-lg overflow-hidden min-h-0">
        {/* Vertical grid lines */}
        <div className="absolute inset-0 flex">
          {Array.from({ length: 10 }).map((_, i) => (
            <div key={i} className="flex-1 border-r border-white/[0.04]" />
          ))}
        </div>

        {/* Track blocks */}
        <div className="absolute inset-y-2 left-0 right-0">
          {blocks.map((b, i) => (
            <div
              key={i}
              className={`absolute top-0 bottom-0 ${b.color} border-2 rounded animate-demo-tag-pop overflow-hidden`}
              style={{ left: `${b.left}%`, width: `${b.width}%`, animationDelay: `${i * 200}ms` }}
            >
              {/* Fake waveform bars */}
              <div className="absolute inset-x-1 inset-y-2 flex items-end gap-px opacity-60">
                {Array.from({ length: 32 }).map((_, j) => (
                  <span
                    key={j}
                    className="flex-1 bg-current rounded-t"
                    style={{ height: `${30 + Math.abs(Math.sin(j * 0.7 + i) * 60)}%` }}
                  />
                ))}
              </div>
              <div className={`absolute inset-x-1.5 top-1 text-[8px] font-bold ${b.text} truncate`}>{b.name}</div>
            </div>
          ))}
        </div>

        {/* Crossfade "Auto 16s" labels at overlap points */}
        <div className="absolute -top-1 left-[19%] flex flex-col items-center animate-demo-tag-pop" style={{ animationDelay: '800ms' }}>
          <span className="text-[8px] px-1 py-0.5 rounded bg-purple-600 text-white font-bold leading-none">Auto</span>
          <span className="text-[8px] text-purple-300 font-mono leading-none mt-0.5">16s</span>
        </div>
        <div className="absolute -top-1 left-[45%] flex flex-col items-center animate-demo-tag-pop" style={{ animationDelay: '900ms' }}>
          <span className="text-[8px] px-1 py-0.5 rounded bg-orange-600 text-white font-bold leading-none">Auto</span>
          <span className="text-[8px] text-orange-300 font-mono leading-none mt-0.5">16s</span>
        </div>
        <div className="absolute -top-1 left-[66%] flex flex-col items-center animate-demo-tag-pop" style={{ animationDelay: '1000ms' }}>
          <span className="text-[8px] px-1 py-0.5 rounded bg-green-600 text-white font-bold leading-none">Auto</span>
          <span className="text-[8px] text-green-300 font-mono leading-none mt-0.5">16s</span>
        </div>

        {/* Playhead */}
        <div className="absolute top-0 bottom-0 left-[12%] w-0.5 bg-red-500 z-10 shadow-[0_0_8px_rgba(239,68,68,0.6)]">
          <div className="absolute -top-1 -left-1 w-2.5 h-2.5 rounded-full bg-red-500" />
        </div>
      </div>
    </div>
  )
}

function DemoCTA() {
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center p-8 animate-fade-in z-10">
      <div className="relative animate-bounce-subtle">
        <div className="absolute inset-0 rounded-3xl bg-blue-500/50 blur-3xl" />
        <img src="/logo.png" alt="" className="relative w-20 h-20 rounded-2xl ring-2 ring-white/20" />
      </div>
      <h2 className="mt-4 text-3xl md:text-4xl font-extrabold text-white text-center">Tu set perfecto en minutos</h2>
      <p className="mt-2 text-sm text-gray-300">DJ Free App</p>
      <div className="mt-5 px-6 py-2.5 rounded-2xl text-base font-bold text-white shadow-2xl shadow-blue-500/40 bg-gradient-to-br from-blue-500 to-purple-600 animate-pulse">
        Probá gratis
      </div>
    </div>
  )
}

// =====================================================================
// DemoReels — VERTICAL 9:16 (1080×1920) demo for Instagram/TikTok reels.
// NOT exposed via UI. Activated by `?reels=1` query param so playwright
// can record it natively at 1080×1920 (no upscale, no letterbox crop).
// 7 scenes designed for portrait: full-screen, huge text, single focus.
// =====================================================================
function DemoReels() {
  const SCENES = 7
  // +1.5x slower per user feedback
  const D = [5000, 7000, 7000, 7000, 10000, 7000, 5000]
  const [scene, setScene] = useState(0)
  const audioRef = useRef(null)
  useEffect(() => {
    if (scene >= SCENES - 1) return // one-shot
    const t = setTimeout(() => setScene(s => s + 1), D[scene])
    return () => clearTimeout(t)
  }, [scene])
  useEffect(() => {
    const a = audioRef.current
    if (!a) return
    a.muted = false
    a.volume = 0.7
    a.play().catch(() => {})
  }, [])

  return (
    <div className="fixed inset-0 bg-slate-950 overflow-hidden">
      <audio ref={audioRef} src="/demo/bg.mp3" loop autoPlay preload="auto" />
      {/* Background blobs (always visible) */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-60 -left-60 w-[40rem] h-[40rem] rounded-full bg-blue-600/30 blur-3xl animate-blob" />
        <div className="absolute top-1/3 -right-60 w-[40rem] h-[40rem] rounded-full bg-purple-600/30 blur-3xl animate-blob animation-delay-2000" />
        <div className="absolute -bottom-60 left-1/4 w-[36rem] h-[36rem] rounded-full bg-pink-600/25 blur-3xl animate-blob animation-delay-4000" />
      </div>
      {scene === 0 && <ReelIntro />}
      {scene === 1 && <ReelDiscover />}
      {scene === 2 && <ReelDownload />}
      {scene === 3 && <ReelLibrary />}
      {scene === 4 && <ReelSet />}
      {scene === 5 && <ReelMix />}
      {scene === 6 && <ReelCTA />}
      {/* Bottom progress dots */}
      <div className="absolute bottom-12 left-1/2 -translate-x-1/2 flex gap-2 z-20">
        {Array.from({ length: SCENES }).map((_, i) => (
          <div key={i} className={`h-1.5 rounded-full transition-all duration-500 ${i === scene ? 'w-12 bg-white' : 'w-2 bg-white/30'}`} />
        ))}
      </div>
    </div>
  )
}

function ReelIntro() {
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center px-12 animate-fade-in z-10">
      <div className="relative animate-bounce-subtle">
        <div className="absolute inset-0 rounded-[3rem] bg-blue-500/60 blur-3xl scale-150" />
        <img src="/logo.png" alt="" className="relative w-48 h-48 rounded-[3rem] ring-4 ring-white/20" />
      </div>
      <h1 className="mt-8 text-6xl font-black text-white tracking-tight text-center leading-none animate-fade-in-up">DJ Free<br/>App</h1>
      <p className="mt-6 text-2xl text-gray-200 font-semibold text-center animate-fade-in-up">Tu workflow completo de DJ</p>
      <p className="mt-1 text-xl text-blue-400 font-bold text-center animate-fade-in-up">automatizado · gratis</p>
    </div>
  )
}

// Vertical app-shell header — bigger version of DemoAppHeader for 1080×1920
function ReelHeader({ active }) {
  const tabs = ['Discover', 'Biblioteca', 'Set', 'Mix']
  return (
    <div className="flex items-center gap-4 px-6 py-4 rounded-2xl bg-slate-900/60 border border-white/10 backdrop-blur-sm">
      <img src="/logo.png" alt="" className="w-10 h-10 rounded-lg" />
      <span className="text-2xl text-white font-bold">DJ Free App</span>
      <div className="flex-1 flex justify-center gap-1">
        {tabs.map(t => (
          <span
            key={t}
            className={`text-xl px-4 py-1.5 rounded-lg font-bold transition-colors ${
              t === active ? 'bg-blue-500 text-white shadow-lg shadow-blue-500/40' : 'text-gray-500'
            }`}
          >
            {t}
          </span>
        ))}
      </div>
      <div className="flex gap-2">
        <span className="w-3 h-3 rounded-full bg-red-500/70" />
        <span className="w-3 h-3 rounded-full bg-yellow-500/70" />
        <span className="w-3 h-3 rounded-full bg-green-500/70" />
      </div>
    </div>
  )
}

// Mirrors DemoSources — Melodic House Beatport-style page in portrait.
function ReelDiscover() {
  const tracks = [
    { n: 'Hot Sauce (Extended)',  a: 'Kapuchon, Miss Monique', label: 'AETERNA',    bpm: 129, k: 'Gb · 11A', d: '5:36', state: 'dl',                       cover: '/demo/covers/hot-sauce.jpg' },
    { n: 'Be The One (Extended)', a: 'Adam Port, Keinemusik',  label: 'Keinemusik', bpm: 123, k: 'F · 11A',  d: '4:45', state: 'dl',                       cover: '/demo/covers/be-the-one.jpg' },
    { n: 'Recall (Extended Mix)', a: 'HotLap',                 label: 'One Seven',  bpm: 122, k: 'E · 11A',  d: '5:48', state: 'done', dot: true,          cover: '/demo/covers/recall.jpg' },
    { n: "Didn't Miss You (OG)",  a: 'Liva K',                 label: 'Magnifik',   bpm: 122, k: 'F · 11A',  d: '5:46', state: 'dl',   highlight: true,    cover: '/demo/covers/didnt-miss.jpg' },
  ]
  return (
    <div className="absolute inset-0 flex flex-col p-8 animate-fade-in z-10 gap-4">
      <ReelHeader active="Discover" />
      {/* Hero header */}
      <div className="flex items-center gap-4">
        <div className="flex-1 min-w-0">
          <h2 className="text-4xl font-black text-white leading-tight">Melodic House</h2>
          <p className="text-xl text-gray-400 flex items-center gap-2">
            <span className="text-white font-bold">100</span> tracks · actualizado hoy 12:28
          </p>
        </div>
        <div className="flex gap-2">
          <img src="/demo/covers/hot-sauce.jpg" alt="" className="w-14 h-14 rounded-lg object-cover ring-2 ring-white/20" />
          <img src="/demo/covers/be-the-one.jpg" alt="" className="w-14 h-14 rounded-lg object-cover ring-2 ring-white/20" />
          <img src="/demo/covers/recall.jpg" alt="" className="w-14 h-14 rounded-lg object-cover ring-2 ring-white/20" />
        </div>
      </div>
      {/* Genre tabs */}
      <div className="flex items-center gap-3 overflow-hidden text-lg">
        <span className="text-gray-500">All</span>
        <span className="text-blue-300 border-b-2 border-blue-400 pb-1 font-semibold">Melodic House</span>
        <span className="text-gray-500">Mel. Techno</span>
        <span className="text-gray-500">Tech House</span>
        <span className="text-gray-500">Afro</span>
        <span className="text-gray-500">Deep</span>
      </div>
      {/* Preview continuo */}
      <div className="flex items-center gap-3">
        <span className="text-lg px-4 py-1.5 rounded-full bg-purple-500/30 border-2 border-purple-400/50 text-purple-200 font-bold flex items-center gap-2">
          <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z" /></svg>
          Preview continuo
        </span>
        <span className="text-base px-3 py-1 rounded-md bg-blue-500/30 text-blue-200 font-bold">30s</span>
        <span className="text-base text-gray-400">60s</span>
        <span className="text-base text-gray-400">90s</span>
        <span className="text-base text-gray-400">120s</span>
        <span className="text-lg px-4 py-1.5 rounded-full bg-red-500/30 border-2 border-red-400/50 text-red-200 font-bold">● Stop</span>
      </div>
      {/* Track list */}
      <div className="flex-1 space-y-2.5 overflow-hidden">
        {tracks.map((t, i) => (
          <div
            key={i}
            className={`flex items-center gap-3 px-3 py-3 rounded-xl animate-demo-tag-pop ${t.highlight ? 'bg-green-500/[0.10] ring-2 ring-green-500/40' : 'bg-white/[0.04]'}`}
            style={{ animationDelay: `${i * 250}ms` }}
          >
            <span className="text-base text-gray-500 font-mono w-6 flex-shrink-0">{i + 1}</span>
            <img src={t.cover} alt="" className="w-14 h-14 rounded-xl object-cover flex-shrink-0 ring-1 ring-white/10" />
            <div className="flex-1 min-w-0">
              <div className={`text-xl font-bold truncate flex items-center gap-2 ${t.highlight ? 'text-green-300' : 'text-white'}`}>
                {t.n}
                {t.dot && <span className="w-2 h-2 rounded-full bg-green-400 flex-shrink-0" />}
              </div>
              <div className="text-base text-gray-400 truncate">{t.a}</div>
            </div>
            <span className="text-base text-gray-500 font-mono flex-shrink-0">{t.bpm}</span>
            <span className="text-base px-2.5 py-1 rounded-lg bg-orange-500/20 text-orange-300 font-bold font-mono flex-shrink-0">{t.k}</span>
            <button
              className={`text-base px-4 py-1.5 rounded-full font-bold flex-shrink-0 ${
                t.state === 'done' ? 'bg-green-500/30 text-green-300 border border-green-500/40' : 'bg-blue-500 text-white shadow-lg shadow-blue-500/40'
              }`}
            >
              {t.state === 'done' ? '✓' : '↓'}
            </button>
          </div>
        ))}
      </div>
      {/* Tagline */}
      <div className="text-center pt-2">
        <p className="text-3xl font-black text-white">Catálogo <span className="text-blue-400">Beatport</span> + <span className="text-green-400">Spotify</span></p>
        <p className="text-xl text-gray-400">renovado <span className="text-purple-300 font-bold">cada semana</span></p>
      </div>
    </div>
  )
}

// Mirrors DemoDownload — track list + context menu popup + active downloads.
function ReelDownload() {
  const listRows = [
    { n: 'Recall (Extended Mix)',     a: 'HotLap',                 fmt: 'FLAC', state: 'done', cover: '/demo/covers/recall.jpg' },
    { n: "Didn't Miss You (OG)",      a: 'Liva K',                 fmt: 'FLAC', state: 'menu', cover: '/demo/covers/didnt-miss.jpg', highlight: true },
    { n: 'Spotlight (Original Mix)',  a: 'Andrea Oliva',           fmt: 'FLAC', state: 'dl',   cover: '/demo/covers/spotlight.jpg' },
    { n: 'Pa Ca (Original Mix)',      a: 'Massano, Silver Panda',  fmt: 'FLAC', state: 'dl',   cover: '/demo/covers/paca.jpg' },
  ]
  const downloads = [
    { name: "Liva K - Didn't Miss You.flac", size: '40MB', fmt: 'FLAC', cover: '/demo/covers/didnt-miss.jpg' },
    { name: 'Andrea Oliva - Spotlight.flac', size: '46MB', fmt: 'FLAC', cover: '/demo/covers/spotlight.jpg' },
    { name: 'Massano - Pa Ca.flac',          size: '32MB', fmt: 'FLAC', cover: '/demo/covers/paca.jpg' },
  ]
  return (
    <div className="absolute inset-0 flex flex-col p-8 animate-fade-in z-10 gap-4">
      <ReelHeader active="Discover" />
      <div className="text-center">
        <h2 className="text-4xl font-black text-white">Descarga directa · <span className="text-blue-400">calidad profesional</span></h2>
        <p className="text-xl text-gray-400 mt-2">FLAC sin pérdida · MP3 320k · WAV — al instante, sin colas</p>
      </div>
      {/* Track list with context menu popup */}
      <div className="relative flex-1">
        <div className="space-y-2">
          {listRows.map((t, i) => (
            <div
              key={i}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-xl animate-demo-tag-pop ${t.highlight ? 'bg-green-500/[0.10] ring-2 ring-green-500/40' : 'bg-white/[0.04]'}`}
              style={{ animationDelay: `${i * 200}ms` }}
            >
              <span className="text-base text-gray-500 font-mono w-6 flex-shrink-0">{i + 3}</span>
              <img src={t.cover} alt="" className="w-12 h-12 rounded-xl object-cover flex-shrink-0 ring-1 ring-white/10" />
              <div className="flex-1 min-w-0">
                <div className={`text-xl font-bold truncate ${t.highlight ? 'text-green-300' : 'text-white'}`}>{t.n}</div>
                <div className="text-base text-gray-400 truncate">{t.a}</div>
              </div>
              <span className="text-base text-green-400 font-bold flex-shrink-0">{t.fmt}</span>
            </div>
          ))}
        </div>
        {/* Context menu popup */}
        <div className="absolute right-4 top-16 w-72 rounded-2xl bg-slate-900 border border-white/15 shadow-2xl shadow-black/60 z-30 overflow-hidden animate-demo-tag-pop" style={{ animationDelay: '600ms' }}>
          <div className="px-4 py-2.5 border-b border-white/10 text-base text-white font-bold truncate">Liva K · Didn't Miss You</div>
          <div className="px-4 py-2.5 flex items-center gap-2.5 text-lg text-white">
            <svg className="w-4 h-4 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
            Descargar
          </div>
          <div className="px-4 pt-3 pb-1 text-sm uppercase tracking-wider text-gray-500 font-semibold">Preview continuo</div>
          <div className="px-4 py-1.5 flex items-center gap-2.5 bg-purple-500/10 text-lg text-purple-200">
            <svg className="w-4 h-4 text-purple-400" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z" /></svg>
            Autoplay 30s por tema
          </div>
          <div className="px-4 py-1.5 flex items-center gap-2.5 text-lg text-gray-300">
            <svg className="w-4 h-4 text-purple-400" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z" /></svg>
            Autoplay 60s por tema
          </div>
          <div className="px-4 py-1.5 flex items-center gap-2.5 text-lg text-gray-300">
            <svg className="w-4 h-4 text-purple-400" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z" /></svg>
            Autoplay 90s · 120s
          </div>
          <div className="border-t border-white/10 px-4 py-1.5 flex items-center gap-2.5 text-lg text-gray-300">📻 Radio</div>
          <div className="px-4 py-1.5 flex items-center gap-2.5 text-lg text-gray-300">🔗 Compartir link</div>
        </div>
      </div>
      {/* Active downloads */}
      <div className="space-y-2">
        <div className="text-base font-bold text-blue-400 uppercase tracking-widest flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
          Descargas activas · 3/3
        </div>
        {downloads.map((d, i) => (
          <div key={i} className="bg-white/[0.04] border border-white/10 rounded-xl p-3 animate-demo-tag-pop" style={{ animationDelay: `${500 + i * 200}ms` }}>
            <div className="flex items-center gap-3 mb-2">
              <img src={d.cover} alt="" className="w-9 h-9 rounded-lg object-cover flex-shrink-0 ring-1 ring-white/10" />
              <div className="flex-1 min-w-0">
                <div className="text-base text-white truncate">{d.name}</div>
                <div className="text-sm text-gray-500">{d.size}</div>
              </div>
              <span className="text-sm px-2.5 py-1 rounded-full bg-green-500/30 text-green-300 font-bold flex-shrink-0">{d.fmt}</span>
            </div>
            <div className="h-1.5 bg-white/5 rounded-full overflow-hidden">
              <div className="h-full bg-gradient-to-r from-blue-500 via-purple-500 to-pink-500 animate-demo-progress" style={{ animationDelay: `${i * 250}ms` }} />
            </div>
          </div>
        ))}
        <div className="px-3 py-2 rounded-lg bg-green-500/10 border border-green-500/30 text-sm text-green-300 font-bold flex items-center gap-2">
          ✓ SoulSeek · análisis BPM/Key automático al terminar
        </div>
      </div>
    </div>
  )
}

// Mirrors DemoLibrary — Cards layout with stats, filter pills, 3 genre cards.
function ReelLibrary() {
  const groups = [
    { name: 'Tech House',    count: 92, dot: 'bg-blue-500',   tracks: [
      { t: '04 - 05 - Biscits - 2C2 (Extended)', f: 'FLAC' },
      { t: '06 - Corrupt (Uk) - Trippin', f: 'FLAC' },
      { t: '08 - Biscits - Freak (Extended)', f: 'FLAC' },
      { t: '01-mau_p-merther_(extended)', f: 'FLAC' },
    ]},
    { name: 'Deep House',    count: 47, dot: 'bg-green-500',  tracks: [
      { t: 'For The Soul', f: 'FLAC' },
      { t: '01. Feels Like Us (Extended)', f: 'FLAC' },
      { t: '02-zehv-leland.mp3', f: 'MP3' },
      { t: 'dreams (Extended Mix)', f: 'FLAC' },
    ]},
    { name: 'Melodic House', count: 41, dot: 'bg-purple-500', tracks: [
      { t: '07 - 03-nordfold-forever_(extended)', f: 'MP3' },
      { t: '01 - Rainy (Devault Remix)', f: 'FLAC' },
      { t: '01 RÜFÜS DU SOL - On My Knees', f: 'M4A' },
      { t: '01 Somebody (2024)', f: 'FLAC' },
    ]},
  ]
  return (
    <div className="absolute inset-0 flex flex-col p-8 animate-fade-in z-10 gap-4">
      <ReelHeader active="Biblioteca" />
      <div className="text-center">
        <h2 className="text-4xl font-black text-white">Biblioteca clasificada <span className="text-purple-400">por IA</span></h2>
        <p className="text-xl text-gray-400 mt-2"><span className="text-white font-bold">305 tracks</span> · BPM · Camelot Key · género — sin tocar nada</p>
      </div>
      {/* Stats bar */}
      <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-slate-900/60 border border-white/10">
        <span className="text-base text-gray-400"><span className="text-white font-bold">305</span> tracks</span>
        <span className="text-base px-3 py-1 rounded-md bg-blue-500/30 text-blue-200 font-bold">Cards</span>
        <span className="text-base text-gray-500">Tracks</span>
        <span className="text-base px-2 py-1 rounded bg-blue-500/20 text-blue-300 font-bold">All</span>
        <span className="text-base text-yellow-400 tracking-wider">★★★★★</span>
        <span className="flex-1" />
        <span className="text-base px-3 py-1 rounded-md bg-blue-500/20 text-blue-300 font-bold">📁 Organizar (3)</span>
        <span className="text-base px-3 py-1 rounded-md bg-purple-500/20 text-purple-300 font-bold">🎵 Keys (115)</span>
      </div>
      {/* Genre filter pills */}
      <div className="flex items-center gap-2 overflow-hidden">
        <span className="text-sm px-2.5 py-1 rounded-full bg-blue-500/30 border border-blue-400/40 text-blue-200 font-bold flex-shrink-0">All</span>
        {[
          { n: 'Tech House',    c: 92, color: 'text-blue-400' },
          { n: 'Deep House',    c: 47, color: 'text-green-400' },
          { n: 'Melodic House', c: 41, color: 'text-purple-400' },
          { n: 'Progressive',   c: 20, color: 'text-orange-400' },
          { n: 'Afro House',    c: 18, color: 'text-pink-400' },
          { n: 'Mel. Techno',   c: 17, color: 'text-cyan-400' },
        ].map(g => (
          <span key={g.n} className={`text-sm px-2.5 py-1 rounded-full bg-white/[0.04] border border-white/10 ${g.color} font-semibold flex items-center gap-1.5 flex-shrink-0`}>
            <span className="w-1.5 h-1.5 rounded-full bg-current" />
            {g.n} ({g.c})
          </span>
        ))}
      </div>
      {/* Cards stacked vertically (instead of 3 cols horizontal) */}
      <div className="flex-1 space-y-3 overflow-hidden">
        {groups.map((g, gi) => (
          <div
            key={g.name}
            className="bg-slate-900/80 border border-white/10 rounded-2xl overflow-hidden animate-demo-tag-pop"
            style={{ animationDelay: `${gi * 200}ms` }}
          >
            <div className="flex items-center justify-between px-5 py-3 border-b border-white/10">
              <div className="flex items-center gap-3 min-w-0">
                <span className={`w-3 h-3 rounded-full ${g.dot} flex-shrink-0`} />
                <span className="text-2xl font-bold text-white truncate">{g.name}</span>
              </div>
              <span className="text-base font-bold text-gray-300 bg-white/10 px-3 py-1 rounded-md">{g.count}</span>
            </div>
            <div className="px-4 py-2 space-y-1">
              {g.tracks.map((tr, ti) => (
                <div key={ti} className="flex items-center gap-3 py-1 animate-demo-tag-pop" style={{ animationDelay: `${gi * 200 + 300 + ti * 80}ms` }}>
                  <svg className="w-4 h-4 text-gray-500 flex-shrink-0" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z" /></svg>
                  <span className="text-base text-gray-300 truncate flex-1">{tr.t}</span>
                  <span className={`text-sm font-bold flex-shrink-0 ${tr.f === 'FLAC' ? 'text-green-400' : tr.f === 'MP3' ? 'text-blue-400' : 'text-purple-400'}`}>{tr.f}</span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// Mirrors DemoSetBuilder — 2 methods (Camelot/Energy) cycling + compact rows
// with intensity-graded accent.
function ReelSet() {
  const TRACKS = [
    { name: "Prospa - Don't Stop (Extended Mix)",        k: 'D# · 5B', bpm: 124, energy: 5, genre: 'Indie Dance',   fmt: 'FLAC', size: '27.82MB', stars: 3, cover: '/demo/covers/prospa.jpg' },
    { name: 'Chico Rose (NL) - Pom (Original Mix) 130',  k: 'D# · 5B', bpm: 130, energy: 6, genre: 'Tech House',    fmt: 'FLAC', size: '49.8MB',  stars: 4, cover: '/demo/covers/chico-rose.jpg' },
    { name: '22 - Deeper Purpose - Operate (Extended)',  k: 'Gm · 6A', bpm: 128, energy: 7, genre: 'Tech House',    fmt: 'FLAC', size: '40.39MB', stars: 5, cover: '/demo/covers/deeper-purpose.jpg' },
    { name: 'Polovich - Sweet Dreams (Original Mix)',    k: 'B · 1B',  bpm: 130, energy: 8, genre: 'Melodic House', fmt: 'MP3',  size: '10.73MB', stars: 5, cover: '/demo/covers/polovich.jpg' },
    { name: 'Biscits - Crush (Extended Mix)',            k: 'Fm · 4A', bpm: 128, energy: 9, genre: 'Tech House',    fmt: 'FLAC', size: '43.18MB', stars: 5, cover: '/demo/covers/biscits-crush.jpg' },
  ]
  const METHODS = [
    { id: 'camelot', label: '🎯 Camelot', desc: 'Encadena tracks por compatibilidad armónica (Mixed in Key)', color: 'purple' },
    { id: 'energy',  label: '⚡ Energy',   desc: 'Por curva de energía — sube progresivamente sin saltos',     color: 'yellow' },
  ]
  // Features enumeration shown after the method cycling — one bullet per second.
  const FEATURES = [
    { icon: '🎯', label: 'Mixed in Key',     desc: 'Compatibilidad armónica por nota — rueda Camelot' },
    { icon: '⚡', label: 'Energy progresiva', desc: 'Curva de intensidad sin saltos · 1 → 10' },
    { icon: '🎭', label: 'Genre matching',   desc: 'Mismo género o subgéneros vecinos' },
    { icon: '📈', label: 'Peak Time',        desc: 'Warmup → Peak → Cooldown automático' },
    { icon: '💾', label: 'Export Rekordbox', desc: 'XML con rating · BPM · Camelot Key + M3U' },
  ]
  // Stage flow: -1 (intro) → 0 (Camelot) → 1 (Energy) → 2 (Features list)
  const TOTAL_STAGES = METHODS.length + 1 // methods + features
  const [stage, setStage] = useState(-1)
  useEffect(() => {
    if (stage >= TOTAL_STAGES - 1) return // freeze on features list
    const t = setTimeout(() => setStage(s => s + 1), stage === -1 ? 1500 : 3500)
    return () => clearTimeout(t)
  }, [stage])
  const showFeatures = stage >= METHODS.length
  const activeMethod = stage >= 0 ? METHODS[stage] : null
  const colorMap = {
    purple: { chip: 'bg-purple-500/30 border-purple-400/60 text-purple-200 shadow-purple-500/40', text: 'text-purple-300' },
    yellow: { chip: 'bg-yellow-500/30 border-yellow-400/60 text-yellow-200 shadow-yellow-500/40', text: 'text-yellow-300' },
  }
  return (
    <div className="absolute inset-0 flex flex-col p-8 animate-fade-in z-10 gap-4">
      <ReelHeader active="Set" />
      <div className="text-center">
        <h2 className="text-4xl font-black text-white">Asistente <span className="text-blue-400">IA</span> de playlists</h2>
        <p className="text-xl text-gray-400 mt-2">Sets compatibles por <span className="text-purple-300 font-bold">Camelot · Energy</span> — 1 click</p>
      </div>
      {/* Filter chips */}
      <div className="flex justify-center gap-2.5 flex-wrap">
        <span className="text-base px-4 py-1.5 rounded-full bg-blue-500/20 border border-blue-400/40 text-blue-300 font-bold">60'</span>
        <span className="text-base px-4 py-1.5 rounded-full bg-yellow-500/20 border border-yellow-400/40 text-yellow-300 font-bold">★★★★★</span>
        <span className="text-base px-4 py-1.5 rounded-full bg-blue-500/20 border border-blue-400/40 text-blue-300 font-bold">Tech House</span>
      </div>
      {/* Method chips */}
      <div className="flex justify-center gap-3">
        {METHODS.map((m, i) => {
          const isActive = stage === i
          const c = colorMap[m.color]
          return (
            <span
              key={m.id}
              className={`text-2xl px-6 py-3 rounded-full border-2 font-bold transition-all duration-300 ${
                isActive ? `${c.chip} shadow-2xl scale-110` : 'bg-white/[0.04] border-white/10 text-gray-500'
              }`}
            >
              {m.label}
            </span>
          )
        })}
      </div>
      {/* Method description */}
      <div className="text-center min-h-8">
        {activeMethod ? (
          <p key={activeMethod.id} className={`text-2xl font-bold animate-fade-in ${colorMap[activeMethod.color].text}`}>{activeMethod.desc}</p>
        ) : (
          <p className="text-2xl text-gray-500 animate-fade-in">Generando set…</p>
        )}
      </div>
      {/* Track rows — full info, intensity-graded accent bar */}
      <div key={activeMethod?.id || 'intro'} className="flex-1 space-y-2 overflow-hidden">
        {TRACKS.map((t, i) => {
          const accent = { 5: 'bg-blue-500', 6: 'bg-cyan-400', 7: 'bg-purple-500', 8: 'bg-pink-500', 9: 'bg-red-500' }[t.energy]
          const rowBg = { 5: 'bg-blue-500/[0.05]', 6: 'bg-cyan-500/[0.07]', 7: 'bg-purple-500/[0.09]', 8: 'bg-pink-500/[0.12]', 9: 'bg-red-500/[0.15]' }[t.energy]
          return (
            <div
              key={`${activeMethod?.id || 'intro'}-${i}`}
              className={`relative ${rowBg} rounded-xl px-4 py-3 flex items-center gap-3 animate-demo-tag-pop`}
              style={{ animationDelay: `${i * 100}ms` }}
            >
              <span className={`absolute left-0 top-1/2 -translate-y-1/2 w-1 h-10 rounded-r ${accent}`} />
              <span className="text-base text-gray-500 font-mono w-6 flex-shrink-0">{i + 1}</span>
              <img src={t.cover} alt="" className="w-10 h-10 rounded-lg object-cover flex-shrink-0 ring-1 ring-white/10" />
              <div className="flex-1 min-w-0">
                <div className="text-lg font-bold text-white truncate">{t.name}</div>
              </div>
              <span className="text-sm text-gray-300 truncate flex-shrink-0">{t.genre}</span>
              <span className={`text-sm font-bold flex-shrink-0 ${t.fmt === 'FLAC' ? 'text-green-400' : 'text-blue-400'}`}>{t.fmt}</span>
              <span className="text-sm font-mono text-gray-400 flex-shrink-0 w-20 text-right">{t.size}</span>
              <span className="text-sm font-bold font-mono px-2.5 py-1 rounded-md bg-orange-500/20 text-orange-300 flex-shrink-0">{t.k}</span>
              <span className="text-base text-yellow-400 tracking-tighter flex-shrink-0">{'★'.repeat(t.stars)}<span className="text-white/10">{'★'.repeat(5 - t.stars)}</span></span>
              <span className="text-gray-500 text-xl flex-shrink-0">×</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// Mirrors DemoExport — Mix Editor toolbar + timeline with crossfading.
function ReelMix() {
  const blocks = [
    { name: 'Nick Curly · Attention',                    color: 'from-blue-500/40 to-blue-700/40 border-blue-400/60',     text: 'text-blue-200',   waveColor: 'text-blue-300' },
    { name: 'Adriatique · Miracle (RÜFÜS Remix)',        color: 'from-purple-500/40 to-purple-700/40 border-purple-400/60', text: 'text-purple-200', waveColor: 'text-purple-300' },
    { name: 'Zeca Veloso · Todo Homem',                  color: 'from-orange-500/40 to-orange-700/40 border-orange-400/60', text: 'text-orange-200', waveColor: 'text-orange-300' },
    { name: '01-mau_p-merther',                          color: 'from-green-500/40 to-green-700/40 border-green-400/60',   text: 'text-green-200',  waveColor: 'text-green-300' },
  ]
  return (
    <div className="absolute inset-0 flex flex-col p-8 animate-fade-in z-10 gap-4">
      <ReelHeader active="Mix" />
      <div className="text-center">
        <h2 className="text-4xl font-black text-white">Previsualizá tu mix <span className="text-blue-400">antes de tocarlo</span></h2>
        <p className="text-xl text-gray-400 mt-2">Crossfading auto · beatmatching · fade 16s · export MP3 320k</p>
      </div>
      {/* Mix Editor toolbar */}
      <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl bg-slate-900/60 border border-white/10 text-base flex-wrap">
        <span className="text-gray-400">‹ Volver al Set</span>
        <span className="text-white font-bold">Mix Editor</span>
        <span className="text-gray-400">15 tracks · 83:52</span>
        <button className="w-8 h-8 rounded-full bg-blue-500 flex items-center justify-center text-white">
          <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z" /></svg>
        </button>
        <span className="text-gray-300 font-mono">0:00 / 83:52</span>
        <span className="text-gray-400">BPM</span>
        <span className="px-2 py-1 rounded bg-slate-800 text-white font-bold font-mono">128</span>
        <span className="px-2 py-1 rounded bg-purple-500/30 text-purple-200 font-bold">Snap</span>
        <span className="flex-1" />
        <span className="px-3 py-1 rounded-md bg-slate-800 text-gray-300 font-mono">Mix 9-5</span>
        <span className="px-3 py-1 rounded-md bg-slate-800 text-blue-300 font-bold">MP3 320k ▾</span>
        <button className="px-3 py-1 rounded-md bg-blue-500 text-white font-bold flex items-center gap-1">
          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
          Exportar Mix
        </button>
      </div>
      {/* Timeline ruler */}
      <div className="flex-shrink-0 flex border-b border-white/10 px-1 py-1 text-sm text-gray-500 font-mono">
        {['11:00', '12:30', '14:00', '15:30', '17:00', '18:30', '20:00'].map(t => (
          <span key={t} className="flex-1">{t}</span>
        ))}
      </div>
      {/* Timeline track lanes — vertical stack instead of horizontal columns */}
      <div className="flex-1 relative bg-slate-900/40 rounded-b-xl overflow-hidden">
        <div className="absolute inset-0 flex">
          {Array.from({ length: 7 }).map((_, i) => (
            <div key={i} className="flex-1 border-r border-white/[0.04]" />
          ))}
        </div>
        <div className="relative flex flex-col gap-2 p-3 h-full">
          {blocks.map((b, i) => (
            <div
              key={i}
              className={`relative bg-gradient-to-r ${b.color} border-2 rounded-xl flex-1 overflow-hidden animate-demo-tag-pop`}
              style={{ animationDelay: `${i * 200}ms` }}
            >
              <div className="absolute inset-x-3 inset-y-3 flex items-end gap-px opacity-50">
                {Array.from({ length: 60 }).map((_, j) => (
                  <span
                    key={j}
                    className={`flex-1 ${b.waveColor} rounded-t bg-current`}
                    style={{ height: `${30 + Math.abs(Math.sin(j * 0.5 + i) * 60)}%` }}
                  />
                ))}
              </div>
              <div className={`absolute inset-x-4 top-2 text-base font-bold ${b.text} truncate`}>{b.name}</div>
              {/* Auto fade label between tracks */}
              {i < blocks.length - 1 && (
                <div className="absolute -bottom-1 right-6 z-10 flex flex-col items-center animate-demo-tag-pop" style={{ animationDelay: `${600 + i * 100}ms` }}>
                  <span className="text-xs px-2 py-0.5 rounded bg-purple-600 text-white font-bold leading-none">Auto</span>
                  <span className="text-xs text-purple-300 font-mono leading-none mt-0.5">16s</span>
                </div>
              )}
            </div>
          ))}
        </div>
        {/* Playhead */}
        <div className="absolute top-0 bottom-0 left-[15%] w-1 bg-red-500 z-20 shadow-[0_0_12px_rgba(239,68,68,0.7)]">
          <div className="absolute -top-2 -left-2 w-5 h-5 rounded-full bg-red-500" />
        </div>
      </div>
    </div>
  )
}

function ReelCTA() {
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center px-12 animate-fade-in z-10">
      <div className="relative animate-bounce-subtle">
        <div className="absolute inset-0 rounded-[3rem] bg-blue-500/60 blur-3xl scale-150" />
        <img src="/logo.png" alt="" className="relative w-40 h-40 rounded-[3rem] ring-4 ring-white/20" />
      </div>
      <h2 className="mt-8 text-6xl font-black text-white tracking-tight text-center leading-none">Probá<br/><span className="text-blue-400">gratis</span></h2>
      <p className="mt-6 text-3xl text-gray-200 font-bold text-center">DJ Free App</p>
      <p className="mt-2 text-xl text-blue-400 font-mono font-bold">djfreeapp.ar</p>
      <div className="mt-8 px-8 py-4 rounded-2xl text-2xl font-black text-white shadow-2xl shadow-blue-500/50 bg-gradient-to-br from-blue-500 to-purple-600 animate-pulse">
        Empezá ahora →
      </div>
    </div>
  )
}

function App() {
  // Hidden recording route — bypasses auth so playwright can capture the
  // vertical reels demo at 1080×1920. Not exposed in UI.
  if (typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('reels') === '1') {
    return <DemoReels />
  }
  const toast = useToast()
  useEffect(() => {
    const handler = (e) => toast(e.detail, 'error', 4000)
    window.addEventListener('agent-error', handler)
    return () => window.removeEventListener('agent-error', handler)
  }, [toast])

  // Storage backend (FSA in browser OR agent fallback)
  const [fsaReady, setFsaReady] = useState(false)
  const [fsaFolderName, setFsaFolderName] = useState(null)
  const [fsaStatus, setFsaStatus] = useState('no-folder') // 'no-folder' | 'needs-activation' | 'granted'
  const [showFolderModal, setShowFolderModal] = useState(false)

  // Check FSA on mount. Three cases:
  // - 'granted'  → fully ready, no UI prompt
  // - 'needs-activation' → folder picked previously but Chrome requires
  //                        a user click each session to re-grant access.
  //                        Show small banner with "Activar carpeta X" button.
  // - 'no-folder'→ never picked → show full picker modal
  useEffect(() => {
    if (!fsaBackend.supported) return
    ;(async () => {
      const status = await fsaBackend.status()
      setFsaStatus(status)
      const name = await fsaBackend.folderName()
      setFsaFolderName(name)
      if (status === 'granted') setFsaReady(true)
      else if (status === 'no-folder') setShowFolderModal(true)
      // 'needs-activation' → show banner via fsaStatus, don't auto-prompt
    })()
  }, [])

  // PWA install prompt handling
  const [installPrompt, setInstallPrompt] = useState(null)
  const [isStandalone, setIsStandalone] = useState(false)
  const [showIosInstall, setShowIosInstall] = useState(false)

  // Cross-device queue count — the useEffect that fetches is below, after authUser is declared
  const [queueCount, setQueueCount] = useState(0)
  const [queueDevices, setQueueDevices] = useState([])  // ['iPhone', 'Desktop', ...]
  const [queueBannerDismissed, setQueueBannerDismissed] = useState(false)

  useEffect(() => {
    // Detect already-installed (standalone mode)
    const standalone = window.matchMedia('(display-mode: standalone)').matches ||
      window.navigator.standalone === true
    setIsStandalone(standalone)

    // Chrome/Edge/Android: capture the prompt event
    const handleBeforeInstall = (e) => {
      e.preventDefault()
      setInstallPrompt(e)
    }
    window.addEventListener('beforeinstallprompt', handleBeforeInstall)
    window.addEventListener('appinstalled', () => {
      setInstallPrompt(null)
      setIsStandalone(true)
      toast('App instalada', 'success', 3000)
    })
    return () => window.removeEventListener('beforeinstallprompt', handleBeforeInstall)
  }, [toast])

  const handleInstall = async () => {
    // 1. If Chrome already gave us a beforeinstallprompt, use it (best UX).
    if (installPrompt) {
      installPrompt.prompt()
      const { outcome } = await installPrompt.userChoice
      if (outcome === 'accepted') toast('Instalando...', 'success', 2000)
      setInstallPrompt(null)
      return
    }
    // 2. No native prompt available — always show the iOS-style instructions
    //    modal (works for Safari + as a fallback for Chrome desktop where the
    //    user can also use the URL-bar install icon).
    setShowIosInstall(true)
  }

  const pickStorageFolder = async () => {
    const ok = await fsaBackend.pickFolder()
    if (ok) {
      const name = await fsaBackend.folderName()
      setFsaReady(true)
      setFsaStatus('granted')
      setFsaFolderName(name)
      setShowFolderModal(false)
      toast(`Carpeta lista: ${name} — recargando...`, 'success', 1500)
      setTimeout(() => window.location.reload(), 800)
    } else {
      toast('No se eligió carpeta', 'warning', 3000)
    }
  }

  // Activate the previously-picked folder (handles Chrome's per-session re-grant).
  // Must be triggered by a user click — we just call it from the banner button.
  const activateStorageFolder = async () => {
    const ok = await fsaBackend.activate()
    if (ok) {
      setFsaReady(true)
      setFsaStatus('granted')
      toast(`Carpeta activada: ${fsaFolderName}`, 'success', 2000)
    } else {
      toast('No se pudo activar — elegí la carpeta de nuevo', 'warning', 3000)
      setShowFolderModal(true)
    }
  }

  const forgetStorageFolder = async () => {
    await fsaBackend.forget()
    setFsaReady(false)
    setFsaStatus('no-folder')
    setFsaFolderName(null)
    setShowFolderModal(true)
    setTimeout(() => window.location.reload(), 500)
  }
  const [authUser, setAuthUser] = useState(() => {
    const saved = localStorage.getItem('auth_user')
    return saved ? JSON.parse(saved) : null
  })

  // Cross-device queue: poll pending count for this user (added from iPhone or any device)
  useEffect(() => {
    if (!authUser?.name) { setQueueCount(0); return }
    const fetchQueue = async () => {
      try {
        const res = await fetch(`${API_BASE}/api/pending?user=${encodeURIComponent(authUser.name)}`)
        const arr = await res.json()
        // Contar solo los que vienen de OTRO device. Items sin device_id son
        // legacy (pre-device-tracking) — los mostramos para no perder datos.
        const others = Array.isArray(arr) ? arr.filter(t => !t.device_id || t.device_id !== DEVICE.id) : []
        setQueueCount(others.length)
        // Lista única de devices que aportaron
        const devs = Array.from(new Set(others.map(t => t.device_name || 'Otro dispositivo')))
        setQueueDevices(devs)
      } catch {}
    }
    fetchQueue()
    const t = setInterval(fetchQueue, 30000)
    return () => clearInterval(t)
  }, [authUser])

  const [page, setPage] = useQS('page', 'discover')
  // When leaving Discover, strip its URL params (playlist/genre/label/chart)
  // so navegar a Biblioteca/Set no arrastra residuos del descubrimiento.
  useEffect(() => {
    if (page === 'discover') return
    const p = new URLSearchParams(window.location.search)
    let changed = false
    for (const k of ['playlist', 'genre', 'label', 'chart']) {
      if (p.has(k)) { p.delete(k); changed = true }
    }
    if (changed) {
      const qs = p.toString()
      window.history.replaceState(null, '', qs ? '?' + qs : window.location.pathname)
    }
  }, [page])
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [dlPanelOpen, setDlPanelOpen] = useState(false)
  const [logsExpanded, setLogsExpanded] = useState(false)
  const [pendingRadioTrack, setPendingRadioTrack] = useState(null)
  const [theme, setTheme] = useState(() => localStorage.getItem('theme') || 'dark')
  const [collection, setCollection] = useState(() => localStorage.getItem('collection') || 'edm')
  useEffect(() => { localStorage.setItem('collection', collection) }, [collection])
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
  const [agentHasSlsk, setAgentHasSlsk] = useState(false)
  useEffect(() => {
    if (!authUser) return
    AGENT_USER = authUser.name
    const connectAgent = async (mode, statusUrl, configFn) => {
      const res = await fetch(statusUrl, { signal: AbortSignal.timeout(3000) })
      if (res.ok) {
        AGENT_MODE = mode
        const status = await res.json()
        setAgentConnected(true); agentConnectedRef.current = true; AGENT_CONNECTED = true
        setAgentVersion(status.version || '')
        setAgentHasSlsk(!!status.slsk)
        await configFn()
        return true
      }
      return false
    }
    // Skip agent polling when:
    // - on mobile (no localhost to reach)
    // - FSA is ready (user has local storage via browser, agent not needed)
    // Avoids spamming console with ERR_CONNECTION_REFUSED.
    const IS_MOBILE = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent || '')

    const checkAgent = async () => {
      if (IS_MOBILE) {
        setAgentConnected(false); agentConnectedRef.current = false; AGENT_CONNECTED = false
        return
      }
      const configBody = JSON.stringify({ username: authUser.name })
      const configHeaders = { 'Content-Type': 'application/json' }
      // Direct attempts (localhost, Funnel) hit the agent's CORS check and fail
      // for users on domains the agent doesn't whitelist (anything other than
      // groovesyncdj.netlify.app on v2.8.0). They also trigger Chrome's PNA
      // permission prompt on HTTPS pages. Going via Heroku proxy avoids both:
      // server-to-server, no CORS, no PNA. Slightly higher latency but seamless.
      try {
        const proxyStatus = `${API_BASE}/api/agent/proxy/status?u=${encodeURIComponent(authUser.name)}`
        if (await connectAgent('proxy',
          proxyStatus,
          () => agentFetch('config', { method: 'POST', headers: configHeaders, body: configBody })
        )) return
      } catch { /* proxy failed */ }
      setAgentConnected(false); agentConnectedRef.current = false; AGENT_CONNECTED = false
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
  const [searchDlStatus, setSearchDlStatus] = useState({}) // { filename: { status, local_name?, ... } }
  // Filenames the user actually has in local storage (FSA / agent / synced).
  // The "Descargado" badge in search results derives from this — not from
  // searchDlStatus.completed — so the badge cannot lie when the server says
  // completed but the file never aterrizó local.
  const [localFilesSet, setLocalFilesSet] = useState(() => new Set())
  const [pendingTracks, setPendingTracks] = useState([]) // tracks that failed to download
  // Favorite tracks (hearts) — marked for filtering, never downloaded automatically.
  // Persisted in Cloudinary per user. Each entry: { artist, title, addedAt, source }.
  const [favoriteTracks, setFavoriteTracks] = useState([])
  const [pendingExpanded, setPendingExpanded] = useState(false)
  const [previewLoading, setPreviewLoading] = useState(null)
  const [playingFile, setPlayingFile] = useState(null)
  const [nowPlaying, setNowPlaying] = useState(null)
  const [isAudioPlaying, setIsAudioPlaying] = useState(false)
  const [previewMode, setPreviewMode] = useState(false)

  // Playback mode for Library/Set tracks:
  // - 'local':   stream the actual file (via agent or Heroku /audio/) — needs the file to exist where we can reach it
  // - 'preview': search iTunes by artist+title and play its 30s preview — works on any device, even mobile without local file
  // Mobile: forced to 'preview' (they can't reach the PC's files).
  // Desktop: default 'local', can toggle to 'preview'.
  const IS_MOBILE_DEVICE = typeof navigator !== 'undefined' &&
    /iPhone|iPad|iPod|Android/i.test(navigator.userAgent || '')
  // Mobile: default to 'preview' when no agent (no way to reach files), but
  // if the agent IS connected (via proxy/Funnel) prefer 'local' so the
  // actual track plays instead of an iTunes substitute that may not exist.
  const [playbackMode, setPlaybackModeState] = useState(() => {
    return localStorage.getItem('playback_mode') || (IS_MOBILE_DEVICE ? 'preview' : 'local')
  })
  const setPlaybackMode = (mode) => {
    setPlaybackModeState(mode)
    localStorage.setItem('playback_mode', mode)
  }
  // On mobile: auto-switch to 'local' when the agent comes online so the
  // user hears the actual track (via Heroku proxy → Funnel → agent), not the
  // iTunes substitute. Only flip if the user hasn't explicitly chosen.
  useEffect(() => {
    if (!IS_MOBILE_DEVICE) return
    if (localStorage.getItem('playback_mode')) return  // user-chosen, respect it
    setPlaybackModeState(agentConnected ? 'local' : 'preview')
  }, [agentConnected, IS_MOBILE_DEVICE])
  const [mixTracks, setMixTracks] = useState(null) // tracks array for MixEditor
  const previewTimerRef = useRef(null)
  const audioRef = useRef(null)
  // DiscoverPage registers its autoplay-cancel here so the global Stop button
  // (and any new playback) can kill the pending "advance to next track" timer.
  // Without this, pause()ing audioRef left the timer alive — it fired playNext()
  // 30s later and resumed playback over whatever track the user had selected.
  const autoplayCancelRef = useRef(null)
  // Pages can register here to be notified when the *real* track audio
  // finishes (not preview, not manual stop). Used by SetBuilder to advance
  // to the next track in the set automatically.
  const playNextRef = useRef(null)
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

      // Server-authoritative pending list. Filtered by user so multi-user server
      // broadcasts don't cross-contaminate.
      if (data.type === 'pending_updated' && data.user === username && Array.isArray(data.pending)) {
        setPendingTracks(data.pending)
        setQueueCount(data.pending.length)
      }

      if (data.type === 'track_update') {
        setTracks(prev => prev.map(t => t.id === data.track.id ? data.track : t))
        // Remove from pending list if successfully downloaded or already in library
        if (data.track.status === 'completed' || data.track.status === 'skipped') {
          const artist = (data.track.artist || '').toLowerCase()
          const title = (data.track.title || '').toLowerCase()
          setPendingTracks(prev => prev.filter(p => !((p.artist || '').toLowerCase() === artist && (p.title || '').toLowerCase() === title)))
          if (data.track.artist && data.track.title) {
            fetch(`${API_BASE}/api/pending/remove`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ user: username, tracks: [{ artist: data.track.artist, title: data.track.title }] }),
            }).catch(() => {})
          }
        }
        if (data.track.status === 'completed' && data.track.filename) {
          // Transfer file from Heroku to local disk: prefer FSA (browser-native),
          // fallback to agent if FSA not available/ready.
          fetch(`${API_BASE}/audio/${encodeURIComponent(data.track.filename)}`)
            .then(r => { if (!r.ok) throw new Error(`Heroku audio ${r.status}`); return r.blob() })
            .then(async (blob) => {
              if (await fsaBackend.ready()) {
                await fsaBackend.saveFile(data.track.filename, blob, data.track.genre || '')
                libraryRef.current?.refresh()
              } else if (agentConnectedRef.current) {
                const form = new FormData()
                form.append('file', blob, data.track.filename)
                form.append('filename', data.track.filename)
                form.append('genre', data.track.genre || '')
                form.append('metadata', JSON.stringify({ title: data.track.title || '', artist: data.track.artist || '', genre: data.track.genre || '', key: data.track.key || '', rating: data.track.rating }))
                const r = await agentFetch('save-file', { method: 'POST', body: form })
                await r.json()
                libraryRef.current?.refresh()
              } else {
                console.log('Sin FSA ni agent — archivo queda solo en Heroku')
              }
            })
            .catch(e => console.error('Failed to save file locally:', e))
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

      // Streaming: cada peer que contesta llega como partial result. Acumulamos
      // in-place para que la UI se llene en vivo (slskd-style). El final
      // `search_results` reemplaza con la versión deduplicada cuando cierra.
      if (data.type === 'search_result_partial' && data.result) {
        setSearchResults(prev => Array.isArray(prev) ? [...prev, data.result] : [data.result])
      }

      if (data.type === 'search_results') {
        setSearchResults(data.results)
        setSearchStatus('idle')
      }

      if (data.type === 'search_dl_status') {
        // The server may rename the file between request and save (peer's
        // actual filename can differ from the search-result filename). The
        // broadcast carries `local_name` = real on-disk filename — we keep it
        // so the UI fetch/save uses the correct name AND so the "Descargado"
        // badge can later be verified against the local file listing.
        const localName = data.local_name || data.filename
        setSearchDlStatus(prev => ({ ...prev, [data.filename]: {
          status: data.status, pct: data.pct, speed: data.speed,
          queue: data.queue, source: data.source, wait_secs: data.wait_secs,
          timeout_secs: data.timeout_secs, source_idx: data.source_idx, source_total: data.source_total,
          local_name: localName,
        }}))
        // When a single download finishes, drop the matching pending entry (logged on click in Discover)
        if (data.status === 'completed' && data.filename) {
          const fnameLower = data.filename.toLowerCase()
          const toRemove = []
          setPendingTracks(prev => {
            const updated = prev.filter(p => {
              const artist = (p.artist || '').toLowerCase()
              const title = (p.title || '').toLowerCase()
              if (!artist || !title) return true
              const matches = fnameLower.includes(artist.slice(0, 10)) && fnameLower.includes(title.slice(0, 10))
              if (matches) toRemove.push({ artist: p.artist, title: p.title, filename: data.filename })
              return !matches
            })
            return updated
          })
          if (toRemove.length) {
            fetch(`${API_BASE}/api/pending/remove`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ user: username, tracks: toRemove }),
            }).catch(() => {})
          }
        }
        if (data.status === 'completed' && data.filename) {
          // Si el download lo hizo el agente local, el archivo ya está en tu
          // disco — no hay que hacer fetch a Heroku (que daría 404). Solo
          // refresh para que la library se entere.
          if (data.via === 'agent') {
            libraryRef.current?.refresh()
            window.dispatchEvent(new Event('library-changed'))
          } else {
            // Use the real on-disk name (server may have renamed it) — fetching
            // /audio/<original_search_name> returns 404 when the peer's file had
            // a different name, leaving the file orphaned on Heroku.
            const markError = (reason) => setSearchDlStatus(prev => ({
              ...prev,
              [data.filename]: { ...(prev[data.filename] || {}), status: 'error', error: reason },
            }))
            fetch(`${API_BASE}/audio/${encodeURIComponent(localName)}`)
              .then(r => { if (!r.ok) throw new Error(`Heroku audio ${r.status}`); return r.blob() })
              .then(async (blob) => {
                if (await fsaBackend.ready()) {
                  await fsaBackend.saveFile(localName, blob, '')
                  libraryRef.current?.refresh()
                  window.dispatchEvent(new Event('library-changed'))
                } else if (agentConnectedRef.current) {
                  const form = new FormData()
                  form.append('file', blob, localName)
                  form.append('filename', localName)
                  const r = await agentFetch('save-file', { method: 'POST', body: form })
                  await r.json()
                  libraryRef.current?.refresh()
                  window.dispatchEvent(new Event('library-changed'))
                } else {
                  // No local storage available — file stays on Heroku only.
                  // Surface this so the badge does NOT claim "Descargado".
                  markError('no_local_storage')
                }
              })
              .catch(e => {
                console.error('Failed to save file locally:', e)
                markError(e.message || 'save_failed')
              })
          }
        }
      }
    }
  }, [])

  // Source of truth for the "Descargado" badge in search results: a Set of
  // filenames the user actually has in local storage (FSA / agent / synced).
  // Re-scans on mount and on every `library-changed` event (dispatched by the
  // Library and by the WS download handler after a successful save).
  useEffect(() => {
    let cancelled = false
    const scan = async () => {
      let localFiles = []
      try {
        if (await fsaBackend.ready()) {
          localFiles = await fsaBackend.listLibrary()
        } else if (agentConnected) {
          const res = await agentFetch('library')
          const arr = await res.json()
          if (Array.isArray(arr)) localFiles = arr
        } else if (authUser?.name) {
          const res = await fetch(`${API_BASE}/api/user-files?user=${encodeURIComponent(authUser.name)}`)
          const arr = await res.json()
          if (Array.isArray(arr)) localFiles = arr
        }
      } catch {}
      if (cancelled) return
      setLocalFilesSet(new Set(localFiles.map(f => f.filename).filter(Boolean)))
    }
    scan()
    const handler = () => scan()
    window.addEventListener('library-changed', handler)
    return () => { cancelled = true; window.removeEventListener('library-changed', handler) }
  }, [agentConnected, authUser?.name])

  // Load favorites — Cloudinary if logged in, localStorage if guest
  useEffect(() => {
    if (!username) {
      try {
        const saved = JSON.parse(localStorage.getItem('guest_favorites') || '[]')
        if (Array.isArray(saved)) setFavoriteTracks(saved)
      } catch {}
      return
    }
    fetch(`${API_BASE}/api/favorites?user=${encodeURIComponent(username)}`)
      .then(r => r.json())
      .then(arr => { if (Array.isArray(arr)) setFavoriteTracks(arr) })
      .catch(() => {})
  }, [username])

  // Load pending tracks from Cloudinary on mount, filter out ones already in library
  useEffect(() => {
    if (!username || !authUser?.name) return
    Promise.all([
      fetch(`${API_BASE}/api/pending?user=${encodeURIComponent(username)}`).then(r => r.json()).catch(() => []),
      fetch(`${API_BASE}/api/metadata?user=${encodeURIComponent(authUser.name)}&collection=${collection || 'edm'}`).then(r => r.json()).catch(() => ({})),
    ]).then(([pending, metadata]) => {
      if (!Array.isArray(pending)) return
      const normalize = (s) => (s || '').toLowerCase().replace(/[^\w\s]/g, ' ').replace(/\s+/g, ' ').trim()
      const stopwords = new Set(['mix', 'the', 'and', 'ext', 'original', 'feat', 'featuring', 'remix', 'extended', 'edit', 'club', 'radio', 'vocal'])
      const libraryNames = []
      Object.entries(metadata || {}).forEach(([filename, m]) => {
        libraryNames.push(normalize(filename))
        if (m && typeof m === 'object') {
          if (m.artist || m.title) libraryNames.push(normalize(`${m.artist || ''} ${m.title || ''}`))
        }
      })
      const filtered = pending.filter(p => {
        const artistNorm = normalize(p.artist || '')
        const titleNorm = normalize(p.title || '')
        const artistWords = artistNorm.split(' ').filter(w => w.length >= 3 && !stopwords.has(w))
        const titleWords = titleNorm.split(' ').filter(w => w.length >= 3 && !stopwords.has(w))
        if (titleWords.length < 2 && artistWords.length < 2) return true
        // Match requires: at least 1 artist word in filename AND ≥70% of title words
        return !libraryNames.some(name => {
          const artistMatch = artistWords.length === 0 || artistWords.some(w => name.includes(w))
          if (!artistMatch) return false
          const titleMatches = titleWords.filter(w => name.includes(w)).length
          return titleMatches >= Math.max(2, Math.ceil(titleWords.length * 0.7))
        })
      })
      setPendingTracks(filtered)
      // If we dropped items because they matched the local library, tell the
      // server to remove just those — never full-replace (would clobber adds
      // made from another device between our GET and POST).
      if (filtered.length !== pending.length) {
        const dropped = pending.filter(p => !filtered.includes(p)).map(p => ({ artist: p.artist, title: p.title }))
        fetch(`${API_BASE}/api/pending/remove`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ user: username, tracks: dropped }),
        }).catch(() => {})
      }
    })
  }, [username, authUser?.name, collection])

  const savePending = (tracks) => {
    setPendingTracks(tracks)
    fetch(`${API_BASE}/api/pending`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user: username, tracks }),
    }).catch(() => {})
  }

  const addToPending = (track) => {
    const entry = {
      artist: track.artist || '',
      title: track.title || '',
      query: track.query || `${track.artist} - ${track.title}`,
      source: track.source || 'manual',
      addedAt: new Date().toISOString(),
      device_id: DEVICE.id,
      device_name: DEVICE.name,
    }
    setPendingTracks(prev => {
      if (prev.some(t => t.artist === entry.artist && t.title === entry.title)) return prev
      return [...prev, entry]
    })
    fetch(`${API_BASE}/api/pending/add`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user: username, track: entry }),
    }).catch(() => {})
  }

  const removeFromPending = (idx) => {
    const target = pendingTracks[idx]
    setPendingTracks(prev => prev.filter((_, i) => i !== idx))
    if (target) {
      fetch(`${API_BASE}/api/pending/remove`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user: username, tracks: [{ artist: target.artist, title: target.title }] }),
      }).catch(() => {})
    }
  }

  // Favorites: heart toggle on Discover rows. Used for filtering in Biblioteca —
  // never triggers a download. Persisted in Cloudinary per user, or localStorage for guests.
  const persistFavorites = (tracks) => {
    if (!username) {
      try { localStorage.setItem('guest_favorites', JSON.stringify(tracks)) } catch {}
      return
    }
    fetch(`${API_BASE}/api/favorites`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user: username, tracks }),
    }).catch(() => {})
  }

  const isFavorite = (track) => {
    if (!track) return false
    const a = (track.artist || '').toLowerCase()
    const t = (track.title || '').toLowerCase()
    return favoriteTracks.some(f => (f.artist || '').toLowerCase() === a && (f.title || '').toLowerCase() === t)
  }

  const toggleFavorite = (track) => {
    const a = (track.artist || '').toLowerCase()
    const t = (track.title || '').toLowerCase()
    setFavoriteTracks(prev => {
      const already = prev.some(f => (f.artist || '').toLowerCase() === a && (f.title || '').toLowerCase() === t)
      const next = already
        ? prev.filter(f => !((f.artist || '').toLowerCase() === a && (f.title || '').toLowerCase() === t))
        : [...prev, {
            artist: track.artist || '',
            title: track.title || '',
            source: track.source || 'discover',
            addedAt: new Date().toISOString(),
          }]
      persistFavorites(next)
      return next
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

  // Global spacebar → play/pause (disabled when Mix Editor is active)
  useEffect(() => {
    const handler = (e) => {
      if (e.code !== 'Space') return
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName)) return
      if (page === 'mix') return
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
  }, [page])

  const handleCancelTrack = (track) => {
    // Remove track from local list (if it's downloading, the server continues but UI hides it)
    setTracks(prev => prev.filter(t => t.id !== track.id))
    // Also remove from pending if it's there
    const artist = (track.artist || '').toLowerCase()
    const title = (track.title || '').toLowerCase()
    setPendingTracks(prev => prev.filter(p => !((p.artist || '').toLowerCase() === artist && (p.title || '').toLowerCase() === title)))
    if (track.artist && track.title) {
      fetch(`${API_BASE}/api/pending/remove`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user: username, tracks: [{ artist: track.artist, title: track.title }] }),
      }).catch(() => {})
    }
  }

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
  // Play a track via iTunes 30s preview (works without local file access).
  // Used on mobile and when user toggles "preview mode" on desktop.
  //
  // iOS autoplay policy: Audio().play() must be called within the SAME
  // synchronous call frame as the user gesture. Awaiting fetch BEFORE creating
  // the Audio element breaks this — iOS blocks. Solution: create the Audio
  // element synchronously (empty src) in the click handler, then set src +
  // play() once the fetch resolves. The element is already "unlocked" from
  // the original gesture.
  const playLibraryPreview = (file) => {
    autoplayCancelRef.current?.()
    autoplayCancelRef.current = null
    killAudio(audioRef.current)

    // FAST PATH (iOS gesture preserved): cached preview_url from manifest.
    // new Audio(url) + play() in same call frame as click → iOS allows it.
    if (file.preview_url) {
      const audio = new Audio(file.preview_url)
      audio.preload = 'auto'
      audioRef.current = audio
      audio.onended = () => { setPlayingFile(null); setNowPlaying(null); setIsAudioPlaying(false) }
      audio.onerror = () => { setPlayingFile(null); setNowPlaying(null); setIsAudioPlaying(false) }
      audio.play().catch(() => { setPlayingFile(null); setNowPlaying(null); setIsAudioPlaying(false) })
      return
    }

    // SLOW PATH (no cached URL yet). Trick to keep iOS gesture alive:
    // start playing a 1-frame silent MP3 SYNCHRONOUSLY so iOS marks the
    // element as "user-initiated"; then swap src to the real URL once iTunes
    // responds. The element stays unlocked across the swap.
    const SILENT_MP3 = 'data:audio/mpeg;base64,/+MYxAAAAANIAAAAAExBTUUzLjEwMFVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVV'
    const audio = new Audio(SILENT_MP3)
    audio.preload = 'auto'
    audioRef.current = audio
    audio.onended = () => { setPlayingFile(null); setNowPlaying(null); setIsAudioPlaying(false) }
    audio.onerror = () => {}  // silent.mp3 may error on some browsers — ignore until real src loaded
    audio.play().catch(() => { /* ignore — keeps iOS unlock attempt */ })

    const fallbackQuery = (file.filename || '').replace(/\.(flac|mp3|wav|m4a|wav|aif|aiff|ogg)$/i, '').replace(/^\d+[\s.\-]+/, '').replace(/_/g, ' ')
    const query = `${file.artist || ''} ${file.title || ''}`.trim() || fallbackQuery
    if (!query) return

    const swapSrc = (url) => {
      // Element already unlocked — set the real src and resume playback.
      audio.onerror = () => { setPlayingFile(null); setNowPlaying(null); setIsAudioPlaying(false) }
      audio.src = url
      audio.play().catch(() => { setPlayingFile(null); setNowPlaying(null); setIsAudioPlaying(false) })
    }

    fetch(`https://itunes.apple.com/search?term=${encodeURIComponent(query)}&media=music&limit=1`)
      .then(r => r.json())
      .then(data => {
        const url = data.results?.[0]?.previewUrl
        if (!url) {
          const cleanQuery = fallbackQuery.replace(/\b(extended|original|radio|club)\s*mix\b/gi, '').replace(/\s+/g, ' ').trim()
          if (cleanQuery && cleanQuery !== query) {
            return fetch(`https://itunes.apple.com/search?term=${encodeURIComponent(cleanQuery)}&media=music&limit=1`)
              .then(r => r.json())
          }
          return { results: [] }
        }
        swapSrc(url)
      })
      .then(fallbackData => {
        if (!fallbackData) return
        const url = fallbackData.results?.[0]?.previewUrl
        if (url) swapSrc(url)
        else { setPlayingFile(null); setNowPlaying(null); setIsAudioPlaying(false) }
      })
      .catch(() => { setPlayingFile(null); setNowPlaying(null); setIsAudioPlaying(false) })
  }

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
    autoplayCancelRef.current?.()
    autoplayCancelRef.current = null
    killAudio(audioRef.current)
    // Preview mode: 30s iTunes preview instead of the actual file.
    // Call synchronously to keep iOS autoplay gesture valid.
    if (playbackMode === 'preview') {
      setPlayingFile(file.filename)
      setNowPlaying({ ...file, isPreview: true })
      setIsAudioPlaying(true)
      playLibraryPreview(file)
      return
    }
    setPlayingFile(file.filename)
    setNowPlaying(file)
    setIsAudioPlaying(true)
    try {
      const audio = await createAudioElement(file, agentConnected)
      audio.preload = 'auto'
      audio.onended = () => {
        const ended = file.filename
        setPlayingFile(null); setNowPlaying(null); setIsAudioPlaying(false)
        playNextRef.current?.(ended)
      }
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
    autoplayCancelRef.current?.()
    autoplayCancelRef.current = null
    // Manual stop must NOT trigger autoplay-next. The page's effect will
    // re-arm playNextRef next time it plays a track from the set.
    playNextRef.current = null
    killAudio(audioRef.current)
    audioRef.current = null
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
    if (audioRef.current) {
      audioRef.current.oncanplaythrough = null
      audioRef.current.onended = null
      audioRef.current.onerror = null
      audioRef.current.pause()
      audioRef.current = null
    }
    setPlayingFile(null)
    setNowPlaying(null)
    setIsAudioPlaying(false)
  }

  const playPreviewTrack = async (list, idx) => {
    if (idx >= list.length) {
      stopPreviewModeApp()
      return
    }
    // Clean up previous audio completely
    if (previewTimerRef.current) clearTimeout(previewTimerRef.current)
    if (audioRef.current) {
      audioRef.current.oncanplaythrough = null
      audioRef.current.onended = null
      audioRef.current.onerror = null
      audioRef.current.pause()
      audioRef.current.src = ''
      audioRef.current = null
    }

    const file = list[idx]
    try {
      const audio = await createAudioElement(file, agentConnected)
      audio.preload = 'auto'
      let started = false
      audio.oncanplaythrough = () => {
        if (started) return // prevent double-fire
        started = true
        const startTime = audio.duration > 120 ? 60 : audio.duration * 0.3
        audio.currentTime = startTime
        audio.play().catch(() => {})
        // Start 30s timer only after playback begins
        previewTimerRef.current = setTimeout(() => {
          playPreviewTrack(list, idx + 1)
        }, 30000)
      }
      audio.onended = () => playPreviewTrack(list, idx + 1)
      audio.onerror = () => playPreviewTrack(list, idx + 1)
      audioRef.current = audio
      setPlayingFile(file.filename)
      setNowPlaying(file)
      setIsAudioPlaying(true)
    } catch {
      playPreviewTrack(list, idx + 1)
    }
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
    if (!authUser) { window.requireLogin?.(); return }
    if (!username || !password) return
    setSearchDlStatus(prev => ({ ...prev, [result.filename]: { status: 'downloading' } }))
    // Si el agente está conectado y tiene aioslsk, delegar el download a él:
    // corre en tu home network, sin los bugs de NAT de Heroku, peers-ghost
    // dejan de ghostear. El agent postea progress a Heroku que lo rebota por WS.
    if (agentConnected && agentHasSlsk) {
      agentFetch('slsk-download', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username,
          password,
          filename: result.filename,
          sources: result.sources && result.sources.length ? result.sources : [result],
          callback_url: `${API_BASE}/api/agent-dl-callback`,
          collection,
        }),
      }).catch(e => {
        console.error('agent slsk-download failed, fallback to heroku:', e)
        wsRef.current?.send(JSON.stringify({ type: 'download_single', username, password, result, app_user: authUser?.name || '', collection }))
      })
      return
    }
    if (!wsRef.current) return
    wsRef.current.send(JSON.stringify({
      type: 'download_single',
      username,
      password,
      result,
      app_user: authUser?.name || '',
      collection,
    }))
  }

  const goToLibraryTrack = (filename) => {
    console.info('[goToLibraryTrack]', { filename, libraryReady: !!libraryRef.current })
    setPage('library')
    // Defer to next frame so Library is visible before applying the search.
    // Without this, the search filter can race with page switch on slow paths.
    requestAnimationFrame(() => {
      libraryRef.current?.goToTrack(filename)
    })
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

  // Status priority: active first, completed, then pending, then failures last
  const statusOrder = { downloading: 0, searching: 1, completed: 2, skipped: 3, pending: 4, not_found: 5, error: 6 }
  const sortByStatus = (arr) => [...arr].sort((a, b) => {
    const ap = statusOrder[a.status] ?? 99
    const bp = statusOrder[b.status] ?? 99
    if (ap !== bp) return ap - bp
    return (a.id ?? 0) - (b.id ?? 0)
  })

  const filteredTracks = dlQ
    ? sortByStatus(searchedTracks)
    : activeTab === 'all'
    ? sortByStatus(searchedTracks)
    : activeTab === 'by_genre'
    ? searchedTracks
    : activeTab.startsWith('genre:')
    ? sortByStatus(searchedTracks.filter(t => t.genre === activeTab.slice(6)))
    : sortByStatus(searchedTracks.filter(t => t.status === activeTab))

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

  // Trial config (editable in Settings, only by admin "look").
  // Default: 2 days, demo/123, $4999 ARS/mes, MP + Cafecito links.
  const [trialDays, setTrialDays] = useState(() => parseInt(localStorage.getItem('trial_days') || '2', 10))
  const [trialAmount, setTrialAmount] = useState(() => parseInt(localStorage.getItem('trial_amount') || '4999', 10))
  const [trialMpUrl, setTrialMpUrl] = useState(() => localStorage.getItem('trial_mp_url') || '')
  const [cafecitoUrl, setCafecitoUrl] = useState(() => localStorage.getItem('cafecito_url') || 'https://cafecito.app/djfreeapp')
  const [upgradeModalOpen, setUpgradeModalOpen] = useState(false)
  const [demoUser, setDemoUser] = useState(() => localStorage.getItem('demo_user') || 'demo')
  const [demoPass, setDemoPass] = useState(() => localStorage.getItem('demo_pass') || '123')
  // Absolute path to user's music library root (used for client-side m3u
  // exports with full paths so DJ software like Rekordbox / Serato can resolve).
  const [libraryRoot, setLibraryRoot] = useState(() => localStorage.getItem('library_root') || '')

  const isDemo = !!authUser && authUser.user === demoUser
  const trialStart = parseInt(localStorage.getItem('trial_start') || '0', 10)
  const trialExpired = isDemo && trialStart > 0 && (Date.now() - trialStart) > trialDays * 86400000

  // Trial expired → open the upgrade modal (no redirect, user picks how to pay)
  useEffect(() => {
    if (trialExpired) setUpgradeModalOpen(true)
  }, [trialExpired])

  // Every time a demo session starts, auto-show the upgrade prompt once.
  // This nudges them toward subscribing on each login (per session, not per click).
  useEffect(() => {
    if (!isDemo) return
    const key = `upgrade_shown_${authUser?.user || ''}_${trialStart || ''}`
    if (!sessionStorage.getItem(key)) {
      // Small delay so the app finishes loading before the modal pops.
      const t = setTimeout(() => { setUpgradeModalOpen(true); sessionStorage.setItem(key, '1') }, 1500)
      return () => clearTimeout(t)
    }
  }, [isDemo, authUser?.user, trialStart])

  // Admin can edit settings — only the "look" account.
  const isAdmin = !!authUser && (authUser.user === 'look' || authUser.user === 'Look' || authUser.role === 'admin')

  // Tutorial state — triggered explicitly from LoginScreen "Entrar como invitado".
  const [showTutorial, setShowTutorial] = useState(false)
  const dismissTutorial = async () => {
    setShowTutorial(false)
    // After tutorial, auto-login as demo + mark trial start.
    try {
      const res = await fetch(`${API_BASE}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: demoUser, password: demoPass }),
      })
      const data = await res.json()
      if (res.ok) {
        if (!localStorage.getItem('trial_start')) {
          localStorage.setItem('trial_start', String(Date.now()))
        }
        localStorage.setItem('auth_token', data.token)
        localStorage.setItem('auth_user', JSON.stringify(data))
        setAuthUser(data)
      }
    } catch {}
  }

  const [loginModalOpen, setLoginModalOpen] = useState(false)
  const [userMenuOpen, setUserMenuOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [demoVideoOpen, setDemoVideoOpen] = useState(false)
  const [agentInstallOpen, setAgentInstallOpen] = useState(false)
  const requireLogin = () => { if (!authUser) { setLoginModalOpen(true); return false } return true }
  useEffect(() => { window.requireLogin = requireLogin }, [authUser])

  // Gate: no auth → LoginScreen (with "Entrar como invitado" → Tutorial → demo login)
  if (!authUser && !showTutorial) {
    return <LoginScreen
      onLogin={setAuthUser}
      onGuestStart={() => setShowTutorial(true)}
    />
  }
  if (showTutorial) {
    return <Tutorial onDone={dismissTutorial} />
  }

  // Demo can navigate everywhere — only the Subscribirse button distinguishes it
  const isGuest = false
  const showDemoBanner = isDemo

  return (
    <div className="h-screen flex flex-col overflow-hidden bg-[var(--bg-app)] text-[var(--text-primary)]">
      {loginModalOpen && (
        <LoginScreen
          isModal
          onClose={() => setLoginModalOpen(false)}
          onLogin={(data) => { setAuthUser(data); setLoginModalOpen(false) }}
        />
      )}
      {demoVideoOpen && (
        <div className="fixed inset-0 z-[80] bg-black/85 backdrop-blur-md flex items-center justify-center p-4 animate-fade-in" onClick={() => setDemoVideoOpen(false)}>
          <div onClick={(e) => e.stopPropagation()} className="relative w-full max-w-7xl">
            <DemoShowcase />
            <button
              onClick={() => setDemoVideoOpen(false)}
              className="absolute -top-3 -right-3 w-9 h-9 rounded-full bg-slate-800 border border-white/10 text-white hover:bg-slate-700 transition-colors flex items-center justify-center"
              aria-label="Cerrar"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
          </div>
        </div>
      )}
      {agentInstallOpen && (
        <div className="fixed inset-0 z-[85] bg-black/85 backdrop-blur-md flex items-center justify-center p-4 animate-fade-in" onClick={() => setAgentInstallOpen(false)}>
          <div onClick={(e) => e.stopPropagation()} className="relative w-full max-w-2xl bg-[var(--bg-panel)] border border-white/10 rounded-3xl shadow-2xl p-6 md:p-8 animate-fade-in-up max-h-[90vh] overflow-y-auto">
            <button
              onClick={() => setAgentInstallOpen(false)}
              className="absolute top-4 right-4 w-8 h-8 rounded-full bg-white/5 hover:bg-white/10 text-gray-400 hover:text-white flex items-center justify-center transition-all"
              aria-label="Cerrar"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
            </button>

            <div className="text-center mb-5">
              <div className="inline-flex w-14 h-14 rounded-2xl bg-gradient-to-br from-blue-500 to-cyan-500 items-center justify-center mb-3 shadow-lg shadow-blue-500/30">
                <svg className="w-7 h-7 text-white" viewBox="0 0 24 24" fill="currentColor"><path d="M0 3.449L9.75 2.1v9.451H0m10.949-9.602L24 0v11.4H10.949M0 12.6h9.75v9.451L0 20.699M10.949 12.6H24V24l-12.9-1.801"/></svg>
              </div>
              <h2 className="text-xl md:text-2xl font-bold text-white mb-1">Instalá el agente local</h2>
              <p className="text-sm text-[var(--text-muted)]">El agente corre en tu PC y maneja descargas + biblioteca local</p>
            </div>

            {/* Heads-up about Windows warning */}
            <div className="mb-5 p-4 rounded-2xl bg-amber-500/10 border border-amber-500/30">
              <div className="flex items-start gap-3">
                <svg className="w-5 h-5 text-amber-400 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/></svg>
                <div className="text-xs md:text-sm text-amber-100">
                  <strong className="text-amber-300">Windows va a mostrar un aviso de seguridad.</strong> Es normal — la app no está firmada todavía con cert comercial. <strong>No es virus</strong>, solo Windows siendo cauto. Te dejo los pasos abajo.
                </div>
              </div>
            </div>

            {/* Step-by-step with mock screenshots */}
            <div className="space-y-3 mb-5">
              <div className="flex gap-3 p-3 rounded-xl bg-white/[0.03] border border-white/5">
                <div className="flex-shrink-0 w-8 h-8 rounded-full bg-blue-500/20 text-blue-400 flex items-center justify-center text-sm font-bold">1</div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm text-[var(--text-primary)] font-semibold">Bajá el .exe</div>
                  <div className="text-xs text-[var(--text-muted)] mt-0.5">Click en el botón abajo. Se baja a tu carpeta Descargas.</div>
                </div>
              </div>
              <div className="flex gap-3 p-3 rounded-xl bg-white/[0.03] border border-white/5">
                <div className="flex-shrink-0 w-8 h-8 rounded-full bg-blue-500/20 text-blue-400 flex items-center justify-center text-sm font-bold">2</div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm text-[var(--text-primary)] font-semibold">Abrí <code className="px-1.5 py-0.5 rounded bg-white/10 text-xs font-mono">GrooveSyncAgent.exe</code></div>
                  <div className="text-xs text-[var(--text-muted)] mt-0.5">Doble click. Aparece un cuadro azul: <span className="font-semibold text-white">"Windows protegió tu PC"</span></div>
                </div>
              </div>
              <div className="flex gap-3 p-3 rounded-xl bg-white/[0.03] border border-white/5">
                <div className="flex-shrink-0 w-8 h-8 rounded-full bg-blue-500/20 text-blue-400 flex items-center justify-center text-sm font-bold">3</div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm text-[var(--text-primary)] font-semibold">Click en <span className="text-blue-300">"Más información"</span></div>
                  <div className="text-xs text-[var(--text-muted)] mt-0.5">Es un texto chiquito en el cuadro azul. Lo expande con un nuevo botón.</div>
                </div>
              </div>
              <div className="flex gap-3 p-3 rounded-xl bg-white/[0.03] border border-white/5">
                <div className="flex-shrink-0 w-8 h-8 rounded-full bg-green-500/20 text-green-400 flex items-center justify-center text-sm font-bold">4</div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm text-[var(--text-primary)] font-semibold">Click en <span className="text-green-300">"Ejecutar de todos modos"</span></div>
                  <div className="text-xs text-[var(--text-muted)] mt-0.5">App arranca silenciosa. Vas a ver el icono ✨ en la bandeja del sistema (al lado del reloj).</div>
                </div>
              </div>
              <div className="flex gap-3 p-3 rounded-xl bg-green-500/10 border border-green-500/30">
                <div className="flex-shrink-0 w-8 h-8 rounded-full bg-green-500/30 text-green-300 flex items-center justify-center">✓</div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm text-green-200 font-semibold">Listo</div>
                  <div className="text-xs text-green-200/80 mt-0.5">El indicador en la topbar de DJ Free App pasa a verde. Ya podés bajar tracks de SoulSeek.</div>
                </div>
              </div>
            </div>

            {/* Download buttons */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <a
                href="https://djfreeapp.ar/GrooveSyncAgent.exe"
                className="group relative overflow-hidden rounded-2xl px-5 py-4 text-center transition-all duration-200 hover:scale-[1.02] active:scale-[0.98] shadow-lg hover:shadow-xl"
                style={{ background: 'linear-gradient(135deg, #00b1ea, #0080c9)' }}
              >
                <div className="absolute top-0 right-0 w-20 h-20 bg-white/10 rounded-full blur-2xl group-hover:scale-150 transition-transform duration-500" />
                <div className="relative flex items-center justify-center gap-2">
                  <svg className="w-5 h-5 text-white" viewBox="0 0 24 24" fill="currentColor"><path d="M0 3.449L9.75 2.1v9.451H0m10.949-9.602L24 0v11.4H10.949M0 12.6h9.75v9.451L0 20.699M10.949 12.6H24V24l-12.9-1.801"/></svg>
                  <span className="font-semibold text-white">Descargar para Windows</span>
                </div>
              </a>
              <a
                href="https://djfreeapp.ar/GrooveSyncAgent-macOS.zip"
                className="group relative overflow-hidden rounded-2xl px-5 py-4 text-center transition-all duration-200 hover:scale-[1.02] active:scale-[0.98] shadow-lg hover:shadow-xl"
                style={{ background: 'linear-gradient(135deg, #4b5563, #1f2937)' }}
              >
                <div className="absolute top-0 right-0 w-20 h-20 bg-white/10 rounded-full blur-2xl group-hover:scale-150 transition-transform duration-500" />
                <div className="relative flex items-center justify-center gap-2">
                  <svg className="w-5 h-5 text-white" viewBox="0 0 24 24" fill="currentColor"><path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.8-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z"/></svg>
                  <span className="font-semibold text-white">Descargar para Mac</span>
                </div>
              </a>
            </div>

            <p className="mt-4 text-center text-[10px] text-[var(--text-muted)]">El agente solo se conecta a tu carpeta de música. No envía ningún dato a terceros.</p>
          </div>
        </div>
      )}
      {upgradeModalOpen && (
        <div className="fixed inset-0 z-[85] bg-black/85 backdrop-blur-md flex items-center justify-center p-4 animate-fade-in" onClick={() => !trialExpired && setUpgradeModalOpen(false)}>
          <div onClick={(e) => e.stopPropagation()} className="relative w-full max-w-2xl">
            {/* Animated gradient bg */}
            <div className="absolute inset-0 -m-8 overflow-hidden pointer-events-none">
              <div className="absolute -top-20 -left-20 w-96 h-96 rounded-full bg-blue-600/30 blur-3xl animate-blob" />
              <div className="absolute -bottom-20 -right-20 w-96 h-96 rounded-full bg-purple-600/30 blur-3xl animate-blob animation-delay-2000" />
            </div>

            <div className="relative bg-[var(--bg-panel)] border border-white/10 rounded-3xl shadow-2xl p-6 md:p-8 animate-fade-in-up">
              {!trialExpired && (
                <button
                  onClick={() => setUpgradeModalOpen(false)}
                  className="absolute top-4 right-4 w-8 h-8 rounded-full bg-white/5 hover:bg-white/10 text-gray-400 hover:text-white flex items-center justify-center transition-all"
                  aria-label="Cerrar"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                </button>
              )}

              <div className="text-center mb-6">
                <div className="inline-flex w-16 h-16 rounded-2xl bg-gradient-to-br from-blue-500 to-purple-500 items-center justify-center mb-3 shadow-lg shadow-blue-500/30 animate-bounce-subtle">
                  <span className="text-3xl">⚡</span>
                </div>
                <h2 className="text-2xl md:text-3xl font-bold text-white mb-2">
                  {trialExpired ? 'Tu prueba terminó' : 'Subí a Premium'}
                </h2>
                <p className="text-sm text-[var(--text-muted)]">
                  {trialExpired
                    ? 'Para seguir usando DJ Free App, elegí cómo querés bancar el proyecto:'
                    : 'Apoyá DJ Free App y desbloqueá todo sin límite de tiempo.'}
                </p>
              </div>

              {/* Features list */}
              <div className="grid grid-cols-2 gap-2 mb-6 text-xs md:text-sm">
                {[
                  { icon: '∞', text: 'Sin límite de tiempo' },
                  { icon: '🎯', text: 'Sets ilimitados' },
                  { icon: '🎚️', text: 'Mix Editor completo' },
                  { icon: '☁️', text: 'Sync entre dispositivos' },
                  { icon: '⬇️', text: 'Downloads ilimitados' },
                  { icon: '💜', text: 'Bancás el proyecto' },
                ].map((f, i) => (
                  <div key={i} className="flex items-center gap-2 text-[var(--text-secondary)]">
                    <span className="flex-shrink-0 w-6 h-6 rounded-full bg-[var(--color-accent)]/20 text-[var(--color-accent)] flex items-center justify-center text-sm">{f.icon}</span>
                    {f.text}
                  </div>
                ))}
              </div>

              {/* Payment options — 2 cards */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {/* MercadoPago */}
                <button
                  onClick={async () => {
                    try {
                      const res = await fetch(`${API_BASE}/api/mp/checkout`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ user: authUser?.user || authUser?.name }),
                      })
                      const data = await res.json()
                      if (data.init_point) window.location.href = data.init_point
                      else if (trialMpUrl) window.location.href = trialMpUrl
                      else toast('Error iniciando checkout', 'error', 3000)
                    } catch (e) {
                      console.error('MP checkout error', e)
                      if (trialMpUrl) window.location.href = trialMpUrl
                    }
                  }}
                  className="group relative overflow-hidden rounded-2xl p-5 text-left transition-all duration-200 hover:scale-[1.02] active:scale-[0.98] shadow-lg hover:shadow-xl"
                  style={{ background: 'linear-gradient(135deg, #00b1ea, #0080c9)' }}
                >
                  <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full blur-2xl group-hover:scale-150 transition-transform duration-500" />
                  <div className="relative">
                    <div className="text-[10px] uppercase tracking-wider text-white/70 font-semibold mb-1">Suscripción mensual</div>
                    <div className="text-2xl font-bold text-white mb-1">${trialAmount.toLocaleString('es-AR')} ARS<span className="text-sm font-normal text-white/70">/mes</span></div>
                    <div className="text-xs text-white/80 mb-3">MercadoPago · cancelás cuando quieras</div>
                    <div className="inline-flex items-center gap-1.5 text-xs font-semibold text-white bg-white/15 backdrop-blur rounded-full px-3 py-1">
                      Suscribirme
                      <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24"><path strokeLinecap="round" d="M9 5l7 7-7 7"/></svg>
                    </div>
                  </div>
                </button>

                {/* Cafecito */}
                <a
                  href={cafecitoUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="group relative overflow-hidden rounded-2xl p-5 text-left transition-all duration-200 hover:scale-[1.02] active:scale-[0.98] shadow-lg hover:shadow-xl block"
                  style={{ background: 'linear-gradient(135deg, #6c3ce0, #a855f7)' }}
                >
                  <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full blur-2xl group-hover:scale-150 transition-transform duration-500" />
                  <div className="relative">
                    <div className="text-[10px] uppercase tracking-wider text-white/70 font-semibold mb-1">Tip único</div>
                    <div className="text-2xl font-bold text-white mb-1">☕ Cafecito<span className="text-sm font-normal text-white/70"> · vos elegís</span></div>
                    <div className="text-xs text-white/80 mb-3">Pago único $100 ARS o más · sin recurrencia</div>
                    <div className="inline-flex items-center gap-1.5 text-xs font-semibold text-white bg-white/15 backdrop-blur rounded-full px-3 py-1">
                      Apoyar
                      <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24"><path strokeLinecap="round" d="M9 5l7 7-7 7"/></svg>
                    </div>
                  </div>
                </a>
              </div>

              {trialExpired && (
                <button
                  onClick={() => { localStorage.setItem('trial_start', String(Date.now() - (trialDays - 1) * 86400000)); setUpgradeModalOpen(false); window.location.reload() }}
                  className="w-full mt-4 text-xs text-gray-500 hover:text-gray-300 transition-colors"
                >
                  Probar 1 día más
                </button>
              )}
            </div>
          </div>
        </div>
      )}
      {settingsOpen && (
        <div className="fixed inset-0 z-[80] bg-black/70 backdrop-blur-md flex items-center justify-center p-4 animate-fade-in" onClick={() => setSettingsOpen(false)}>
          <div onClick={(e) => e.stopPropagation()} className="w-full max-w-md bg-[var(--bg-panel)] border border-[var(--border-color)] rounded-2xl shadow-2xl p-6 max-h-[90vh] overflow-y-auto">
            <h2 className="text-lg font-bold text-[var(--text-primary)] mb-4">Configuración</h2>
            <div className="space-y-4">
              <div>
                <div className="text-xs uppercase tracking-wider text-[var(--text-muted)] mb-2">Trial gratuito</div>
                <label className="block text-sm text-[var(--text-secondary)] mb-1">Días antes de redirigir a MercadoPago</label>
                <input
                  type="number"
                  min="1"
                  value={trialDays}
                  onChange={e => { const v = parseInt(e.target.value || '1', 10); setTrialDays(v); localStorage.setItem('trial_days', String(v)) }}
                  className="w-full px-3 py-2 bg-[var(--bg-input)] border border-[var(--border-color)] rounded-lg text-sm text-[var(--text-primary)]"
                />
              </div>
              <div>
                <label className="block text-sm text-[var(--text-secondary)] mb-1">URL de MercadoPago</label>
                <input
                  type="url"
                  value={trialMpUrl}
                  onChange={e => { setTrialMpUrl(e.target.value); localStorage.setItem('trial_mp_url', e.target.value) }}
                  className="w-full px-3 py-2 bg-[var(--bg-input)] border border-[var(--border-color)] rounded-lg text-sm text-[var(--text-primary)]"
                />
              </div>
              <div>
                <div className="text-xs uppercase tracking-wider text-[var(--text-muted)] mb-2">Biblioteca local</div>
                <label className="block text-sm text-[var(--text-secondary)] mb-1">Carpeta raíz de tu música (path absoluto)</label>
                <input
                  type="text"
                  value={libraryRoot}
                  onChange={e => { setLibraryRoot(e.target.value); localStorage.setItem('library_root', e.target.value) }}
                  placeholder="C:\Users\look\Music\groove-new"
                  className="w-full px-3 py-2 bg-[var(--bg-input)] border border-[var(--border-color)] rounded-lg text-sm text-[var(--text-primary)] font-mono"
                />
                <div className="text-xs text-[var(--text-muted)] mt-1">Se usa para que los .m3u exportados tengan paths absolutos válidos en Rekordbox / Serato / Traktor.</div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm text-[var(--text-secondary)] mb-1">Demo user</label>
                  <input
                    value={demoUser}
                    onChange={e => { setDemoUser(e.target.value); localStorage.setItem('demo_user', e.target.value) }}
                    className="w-full px-3 py-2 bg-[var(--bg-input)] border border-[var(--border-color)] rounded-lg text-sm text-[var(--text-primary)]"
                  />
                </div>
                <div>
                  <label className="block text-sm text-[var(--text-secondary)] mb-1">Demo pass</label>
                  <input
                    value={demoPass}
                    onChange={e => { setDemoPass(e.target.value); localStorage.setItem('demo_pass', e.target.value) }}
                    className="w-full px-3 py-2 bg-[var(--bg-input)] border border-[var(--border-color)] rounded-lg text-sm text-[var(--text-primary)]"
                  />
                </div>
              </div>
              {trialStart > 0 && (
                <div className="text-xs text-[var(--text-muted)] bg-[var(--bg-input)] rounded-lg p-3">
                  <div>Trial iniciado: {new Date(trialStart).toLocaleString()}</div>
                  <div>Quedan: {Math.max(0, Math.ceil((trialStart + trialDays * 86400000 - Date.now()) / 86400000))} días</div>
                  <button
                    onClick={() => { localStorage.removeItem('trial_start'); setSettingsOpen(false) }}
                    className="mt-2 text-red-400 hover:text-red-300 underline text-xs"
                  >
                    Reiniciar trial
                  </button>
                </div>
              )}
            </div>
            <button
              onClick={() => setSettingsOpen(false)}
              className="mt-5 w-full py-2.5 rounded-xl text-sm font-semibold bg-[var(--color-accent)] text-[var(--color-accent-text)] hover:opacity-90 transition-all active:scale-95"
            >
              Cerrar
            </button>
          </div>
        </div>
      )}
      {/* iOS install instructions modal (Safari doesn't expose beforeinstallprompt) */}
      {showIosInstall && (
        <div
          className="fixed inset-0 z-[60] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 animate-fade-in"
          onClick={() => setShowIosInstall(false)}
        >
          <div
            className="bg-[var(--bg-panel)] border border-[var(--border-color)] rounded-2xl shadow-2xl max-w-md w-full p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-lg font-bold text-[var(--text-primary)] mb-3">Instalá DJ Free App</h2>
            <p className="text-sm text-[var(--text-secondary)] mb-4">
              Elegí tu dispositivo:
            </p>
            <div className="space-y-4 mb-5 text-sm text-[var(--text-primary)]">
              <div>
                <div className="text-xs uppercase tracking-wider text-[var(--text-muted)] mb-2">📱 iPhone (Safari)</div>
                <ol className="space-y-2 ml-2">
                  <li className="flex gap-2"><span className="text-[var(--color-accent)] font-bold">1.</span><span>Tocá el botón <strong>Compartir</strong> abajo del browser</span></li>
                  <li className="flex gap-2"><span className="text-[var(--color-accent)] font-bold">2.</span><span>Bajá y tocá <strong>"Añadir a pantalla de inicio"</strong></span></li>
                  <li className="flex gap-2"><span className="text-[var(--color-accent)] font-bold">3.</span><span>Tocá <strong>Añadir</strong> arriba a la derecha</span></li>
                </ol>
              </div>
              <div>
                <div className="text-xs uppercase tracking-wider text-[var(--text-muted)] mb-2">💻 Chrome / Edge (PC)</div>
                <ol className="space-y-2 ml-2">
                  <li className="flex gap-2"><span className="text-[var(--color-accent)] font-bold">1.</span><span>Click en el ícono <strong>Instalar</strong> ⊕ a la derecha de la barra de URL</span></li>
                  <li className="flex gap-2"><span className="text-[var(--color-accent)] font-bold">2.</span><span>O menú ⋮ → <strong>"Instalar DJ Free App"</strong></span></li>
                </ol>
              </div>
              <div>
                <div className="text-xs uppercase tracking-wider text-[var(--text-muted)] mb-2">🤖 Android (Chrome)</div>
                <ol className="space-y-2 ml-2">
                  <li className="flex gap-2"><span className="text-[var(--color-accent)] font-bold">1.</span><span>Menú ⋮ arriba a la derecha</span></li>
                  <li className="flex gap-2"><span className="text-[var(--color-accent)] font-bold">2.</span><span>Tocá <strong>"Instalar app"</strong> o "Añadir a pantalla de inicio"</span></li>
                </ol>
              </div>
            </div>
            <button
              onClick={() => setShowIosInstall(false)}
              className="w-full py-3 rounded-xl text-sm font-semibold bg-[var(--color-accent)] text-[var(--color-accent-text)] hover:opacity-90 transition-all active:scale-95"
            >
              Entendido
            </button>
          </div>
        </div>
      )}

      {/* Guest mode banner: prompt login so users can save favs + download */}
      {isGuest && (
        <div className="flex-shrink-0 bg-[var(--color-accent)]/10 border-b border-[var(--color-accent)]/30 px-3 md:px-6 py-2 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0">
            <svg className="w-4 h-4 text-[var(--color-accent)] flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span className="text-xs md:text-sm text-[var(--text-primary)] truncate">
              Modo invitado — explorá, escuchá previews y marcá favoritos. Para bajar música, logueate.
            </span>
          </div>
        </div>
      )}

      {/* Cross-device queue banner: visible on PCs that can save locally
           when there are tracks queued from iPhone/other devices. */}
      {queueCount > 0 && !queueBannerDismissed && (fsaReady || agentConnected) && (
        <div className="flex-shrink-0 bg-[var(--color-accent)]/15 border-b border-[var(--color-accent)]/30 px-3 md:px-6 py-2 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0">
            <svg className="w-4 h-4 text-[var(--color-accent)] flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
            </svg>
            <span className="text-sm text-[var(--text-primary)] truncate">
              Tenés <strong>{queueCount}</strong> {queueCount === 1 ? 'tema' : 'temas'} en cola
              {queueDevices.length > 0 && <> desde <strong>{queueDevices.join(' + ')}</strong></>}
            </span>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <button
              onClick={() => setPage('download')}
              className="px-3 py-1 rounded-full text-xs font-semibold bg-[var(--color-accent)] text-[var(--color-accent-text)] hover:opacity-90 transition-all active:scale-95"
            >
              Ver y bajar
            </button>
            <button
              onClick={() => setQueueBannerDismissed(true)}
              className="p-1 rounded text-gray-400 hover:text-white hover:bg-white/10 transition-colors"
              title="Cerrar"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>
      )}

      {/* Activation banner: folder picked previously but needs user click to re-grant permission this session */}
      {fsaBackend.supported && fsaStatus === 'needs-activation' && !showFolderModal && (
        <div className="flex-shrink-0 bg-blue-500/15 border-b border-blue-500/30 px-3 md:px-6 py-2 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0">
            <svg className="w-4 h-4 text-blue-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
            </svg>
            <span className="text-sm text-blue-300 truncate">
              Carpeta <strong>{fsaFolderName}</strong> requiere reactivación (Chrome lo pide cada sesión)
            </span>
          </div>
          <button
            onClick={activateStorageFolder}
            className="flex-shrink-0 px-3 py-1 rounded-full text-xs font-semibold bg-blue-500 text-white hover:bg-blue-400 transition-colors active:scale-95"
          >
            Activar
          </button>
        </div>
      )}

      {/* Folder picker modal: only shown when no folder was ever picked */}
      {showFolderModal && fsaBackend.supported && (
        <div className="fixed inset-0 z-[60] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 animate-fade-in">
          <div className="bg-[var(--bg-panel)] border border-[var(--border-color)] rounded-2xl shadow-2xl max-w-md w-full p-6 md:p-8">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-12 h-12 rounded-full bg-[var(--color-accent)]/15 flex items-center justify-center flex-shrink-0">
                <svg className="w-6 h-6 text-[var(--color-accent)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
                </svg>
              </div>
              <div>
                <h2 className="text-lg font-bold text-[var(--text-primary)]">Elegí tu carpeta de música</h2>
                <p className="text-xs text-gray-400">Es donde se van a guardar tus descargas</p>
              </div>
            </div>
            <p className="text-sm text-[var(--text-secondary)] mb-5 leading-relaxed">
              La app necesita una carpeta en tu disco para guardar los temas. La elegís una sola vez y queda recordada.
              Cada género se va a guardar en su propia subcarpeta automáticamente (Tech House/, Melodic House/, etc).
            </p>
            <div className="flex gap-2">
              <button
                onClick={pickStorageFolder}
                className="flex-1 py-3 rounded-xl text-sm font-semibold transition-all duration-200 active:scale-95"
                style={{ background: 'var(--color-accent)', color: 'var(--color-accent-text)' }}
              >
                Elegir carpeta
              </button>
              <button
                onClick={() => setShowFolderModal(false)}
                className="px-4 py-3 rounded-xl text-sm text-gray-400 hover:bg-[var(--bg-hover)] transition-colors"
              >
                Después
              </button>
            </div>
            <p className="text-[10px] text-gray-500 mt-4 leading-relaxed">
              Si tu browser no soporta esta función (Safari/Firefox) seguís necesitando el agent local instalado.
            </p>
          </div>
        </div>
      )}
      {/* Header */}
      <header
        className="flex-shrink-0 flex items-center justify-between px-3 md:px-6 bg-[var(--bg-panel)] border-b border-[var(--border-color)]"
        style={{
          // Push header down past the notch/Dynamic Island in PWA standalone mode on iOS.
          // env() returns 0 on non-iOS browsers so it's a no-op there.
          paddingTop: 'max(env(safe-area-inset-top), 0px)',
          paddingLeft: 'max(env(safe-area-inset-left), 0.75rem)',
          paddingRight: 'max(env(safe-area-inset-right), 0.75rem)',
          height: 'calc(3.5rem + env(safe-area-inset-top, 0px))',
        }}
      >
        <div className="flex items-center gap-2 md:gap-4 min-w-0">
          {/* Mobile hamburger */}
          <button
            onClick={() => setMobileMenuOpen(prev => !prev)}
            className="md:hidden p-1.5 rounded-lg text-[var(--text-muted)] hover:bg-[var(--bg-hover)] transition-all"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
          <div className="flex items-center gap-2">
            <img src="/logo.png" alt="DJ Free App" className="h-6 object-contain" />
            <span className="font-semibold text-base text-[var(--text-primary)] hidden sm:inline">DJ Free App</span>
          </div>
          <button
            onClick={() => setDemoVideoOpen(true)}
            className="hidden md:flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold text-white shadow-md hover:brightness-110 active:scale-95 transition-all flex-shrink-0"
            style={{ background: 'linear-gradient(135deg, var(--color-accent), #a855f7)' }}
            title="Ver features en video"
          >
            <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z" /></svg>
            Ver demo
          </button>
          <div className="hidden md:flex gap-1">
            {[
              { id: 'discover', label: 'Discover' },
              { id: 'library', label: 'Biblioteca' },
              { id: 'set', label: 'Export' },
              { id: 'mix', label: 'Mix' },
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
          <div className="flex items-center bg-white/10 rounded-full p-0.5">
            {[
              { id: 'edm',   label: 'EDM' },
              { id: 'pop',   label: 'POP' },
              { id: 'latin', label: 'LATIN' },
            ].map(c => (
              <button key={c.id}
                onClick={() => setCollection(c.id)}
                className={`px-2 md:px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider transition-all duration-200 ${
                  collection === c.id ? 'bg-white/20 text-white' : 'text-white/40 hover:text-white/60'
                }`}
              >
                {c.label}
              </button>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-1.5 md:gap-3 min-w-0 flex-1 justify-end">
          {logs.length > 0 && isRunning && (
            <div className="hidden lg:flex items-center gap-1.5 max-w-lg">
              <span className="text-sm text-yellow-400 truncate">
                {logs[logs.length - 1]}
              </span>
              <button
                onClick={() => { handleForceStop(); toast('Detenido — podés iniciar otra descarga', 'success', 2500) }}
                title="Forzar detención (reset del download actual)"
                className="flex-shrink-0 w-6 h-6 flex items-center justify-center rounded-full text-yellow-400/60 hover:text-red-400 hover:bg-red-500/10 transition-colors active:scale-90"
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          )}
          <button
            onClick={() => setAgentInstallOpen(true)}
            className="hidden lg:flex relative p-1.5 rounded-lg text-[var(--text-muted)] hover:text-green-400 hover:bg-[var(--bg-hover)] transition-all duration-200 active:scale-95 flex-shrink-0"
            title={agentConnected ? `Agente v${agentVersion} conectado` : 'Descargar Agente (Windows)'}
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
              <path d="M0 3.449L9.75 2.1v9.451H0m10.949-9.602L24 0v11.4H10.949M0 12.6h9.75v9.451L0 20.699M10.949 12.6H24V24l-12.9-1.801" />
            </svg>
            <span className={`absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-[var(--bg-panel)] ${agentConnected ? 'bg-green-500' : 'bg-gray-500'}`} />
          </button>
          <a
            href="https://github.com/arenazl/slsk-agent/releases/latest/download/GrooveSyncAgent-macOS.zip"
            className="hidden lg:flex relative p-1.5 rounded-lg text-[var(--text-muted)] hover:text-green-400 hover:bg-[var(--bg-hover)] transition-all duration-200 active:scale-95 flex-shrink-0"
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
            className="hidden lg:flex p-1.5 rounded-lg text-[var(--text-muted)] hover:text-yellow-400 hover:bg-[var(--bg-hover)] transition-all duration-200 active:scale-95 flex-shrink-0"
            title="Reiniciar conexión SoulSeek"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
          </button>
          <div className="hidden xl:flex items-center gap-1 flex-shrink-0" title="Color de acento">
            {[
              { color: '#3b82f6', gradient: 'from-blue-500 to-blue-600' },
              { color: '#8b5cf6', gradient: 'from-violet-500 to-purple-600' },
              { color: '#f43f5e', gradient: 'from-rose-500 to-pink-600' },
              { color: '#f59e0b', gradient: 'from-amber-400 to-orange-500' },
              { color: '#22c55e', gradient: 'from-green-400 to-emerald-600' },
            ].map(p => (
              <button
                key={p.color}
                onClick={() => setAccentColor(p.color)}
                className={`w-4.5 h-4.5 rounded-full bg-gradient-to-br ${p.gradient} transition-all duration-200 hover:scale-125 active:scale-95 ${
                  accentColor === p.color ? 'ring-2 ring-white/60 scale-110' : 'ring-1 ring-white/10'
                }`}
                style={{ width: '18px', height: '18px' }}
              />
            ))}
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
          {/* Global panic-stop: kills every audio element on the page (HTML5
              <audio> + autoplay session in Discover) so any "doble tema"
              that snuck through can be silenced in one tap. Only shown when
              something is actually playing to avoid clutter. */}
          {nowPlaying && (
            <button
              onClick={() => {
                autoplayCancelRef.current?.()
                autoplayCancelRef.current = null
                document.querySelectorAll('audio').forEach(el => {
                  try { el.onended = null } catch {}
                  try { el.onerror = null } catch {}
                  try { el.pause() } catch {}
                  try { el.src = '' } catch {}
                })
                handleAppStop()
              }}
              className="p-1.5 rounded-lg text-red-400 hover:text-red-300 hover:bg-red-500/10 transition-all duration-200 active:scale-95 flex-shrink-0"
              title="Detener todo el audio"
            >
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                <rect x="6" y="6" width="12" height="12" rx="1.5" />
              </svg>
            </button>
          )}
          {!IS_MOBILE_DEVICE && (
            <div
              className="hidden lg:flex items-center rounded-full bg-[var(--bg-input)] p-0.5 flex-shrink-0"
              title="Modo de reproducción: Local (archivos reales) / Preview (30s desde iTunes)"
            >
              {[
                { id: 'local', label: 'Local' },
                { id: 'preview', label: 'Preview' },
              ].map(m => (
                <button
                  key={m.id}
                  onClick={() => setPlaybackMode(m.id)}
                  className={`px-2.5 py-1 rounded-full text-xs font-medium transition-all duration-200 ${
                    playbackMode === m.id
                      ? 'bg-[var(--color-accent)] text-[var(--color-accent-text)]'
                      : 'text-gray-400 hover:text-white'
                  }`}
                >
                  {m.label}
                </button>
              ))}
            </div>
          )}
          {!isStandalone && (installPrompt || /iPhone|iPad|iPod/i.test(navigator.userAgent)) && (
            <button
              onClick={handleInstall}
              className="flex items-center gap-1 px-2 py-1 rounded-full text-xs font-semibold bg-[var(--color-accent)] text-[var(--color-accent-text)] hover:opacity-90 transition-all active:scale-95 flex-shrink-0"
              title="Instalar como app"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3M3 17V7a2 2 0 012-2h14a2 2 0 012 2v10a2 2 0 01-2 2H5a2 2 0 01-2-2z" />
              </svg>
              <span className="hidden sm:inline">Instalar app</span>
            </button>
          )}
          <button
            onClick={() => window.location.reload()}
            className="p-1.5 rounded-lg text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)] transition-all active:scale-90 flex-shrink-0"
            title="Recargar versión nueva"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
          </button>
          <div className="flex items-center gap-1.5 flex-shrink-0">
            <div className={`w-2 h-2 rounded-full ${connected ? 'bg-green-500' : 'bg-red-500'}`} />
            <span className="hidden sm:inline text-xs text-[var(--text-muted)]">
              {connected ? (isRunning ? 'Descargando...' : 'Server') : 'Desconectado'}
            </span>
            {agentConnected && (
              <div className="flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-green-500/10 border border-green-500/20" title={`Agente ${agentVersion} — ${AGENT_MODE === 'local' ? 'local' : AGENT_BASE.includes('ts.net') ? 'Tailscale' : 'proxy'}`}>
                <svg className="w-3 h-3 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2zM9 9h6v6H9V9z" /></svg>
                <span className="text-xs text-green-400 hidden sm:inline">
                  {AGENT_MODE === 'local' ? 'Local' : AGENT_BASE.includes('ts.net') ? 'Tailscale' : 'Remoto'}
                </span>
              </div>
            )}
            {fsaReady && (
              <button
                onClick={forgetStorageFolder}
                className="flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-blue-500/10 border border-blue-500/20 hover:bg-blue-500/20 transition-colors"
                title={`Carpeta: ${fsaFolderName} (click para cambiar)`}
              >
                <svg className="w-3 h-3 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" /></svg>
                <span className="text-xs text-blue-400 hidden sm:inline truncate max-w-24">{fsaFolderName}</span>
              </button>
            )}
            {fsaBackend.supported && !fsaReady && !agentConnected && (
              <button
                onClick={() => setShowFolderModal(true)}
                className="flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-yellow-500/10 border border-yellow-500/20 hover:bg-yellow-500/20 transition-colors"
                title="Elegir carpeta de descargas"
              >
                <svg className="w-3 h-3 text-yellow-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" /></svg>
                <span className="text-xs text-yellow-400 hidden sm:inline">Elegir carpeta</span>
              </button>
            )}
          </div>
          {authUser && (
            <div className="relative">
              <button
                onClick={() => setUserMenuOpen(o => !o)}
                className="flex items-center gap-1.5 px-2 py-1 rounded-lg text-xs text-gray-400 hover:text-white hover:bg-[var(--bg-hover)] transition-all"
                title={authUser.name}
              >
                <span className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold ring-1 ring-white/10" style={{ background: 'var(--color-accent)', color: 'var(--color-accent-text)' }}>{authUser.name?.[0]?.toUpperCase()}</span>
                <span className="hidden sm:inline">{authUser.name}</span>
                <svg className="w-3 h-3 hidden sm:block" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
              </button>
              {userMenuOpen && (<>
                <div className="fixed inset-0 z-30" onClick={() => setUserMenuOpen(false)} />
                <div className="absolute right-0 top-full mt-2 z-40 w-64 bg-[var(--bg-panel)] border border-[var(--border-color)] rounded-2xl shadow-2xl overflow-hidden animate-fade-in">
                  <div className="px-4 py-3 border-b border-[var(--border-color)] flex items-center gap-3">
                    <span className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold" style={{ background: 'var(--color-accent)', color: 'var(--color-accent-text)' }}>{authUser.name?.[0]?.toUpperCase()}</span>
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-semibold text-[var(--text-primary)] truncate">{authUser.name}</div>
                      <div className="text-[11px] text-[var(--text-muted)] truncate">@{authUser.user || authUser.name?.toLowerCase()}</div>
                    </div>
                  </div>
                  <div className="py-1">
                    <button
                      onClick={() => { setUserMenuOpen(false); setSettingsOpen(true) }}
                      className="w-full text-left px-4 py-2.5 text-sm text-[var(--text-primary)] hover:bg-[var(--bg-hover)] transition-colors flex items-center gap-3"
                    >
                      <svg className="w-4 h-4 text-[var(--text-muted)]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                      Configuración
                    </button>
                    <button
                      onClick={() => { setUserMenuOpen(false); setShowTutorial(true) }}
                      className="w-full text-left px-4 py-2.5 text-sm text-[var(--text-primary)] hover:bg-[var(--bg-hover)] transition-colors flex items-center gap-3"
                    >
                      <svg className="w-4 h-4 text-[var(--text-muted)]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" /></svg>
                      Ver tutorial
                    </button>
                    <a
                      href="https://github.com/arenazl/slsk-ui/issues"
                      target="_blank"
                      rel="noreferrer"
                      onClick={() => setUserMenuOpen(false)}
                      className="w-full text-left px-4 py-2.5 text-sm text-[var(--text-primary)] hover:bg-[var(--bg-hover)] transition-colors flex items-center gap-3"
                    >
                      <svg className="w-4 h-4 text-[var(--text-muted)]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" /></svg>
                      Reportar bug
                    </a>
                    <a
                      href="https://djfreeapp.ar/GrooveSyncAgent.exe"
                      onClick={() => setUserMenuOpen(false)}
                      className="w-full text-left px-4 py-2.5 text-sm text-[var(--text-primary)] hover:bg-[var(--bg-hover)] transition-colors flex items-center gap-3"
                    >
                      <svg className="w-4 h-4 text-[var(--text-muted)]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" /></svg>
                      Descargar agente
                    </a>
                  </div>
                  <div className="border-t border-[var(--border-color)] py-1">
                    <button
                      onClick={() => { localStorage.removeItem('auth_token'); localStorage.removeItem('auth_user'); setAuthUser(null); setUserMenuOpen(false) }}
                      className="w-full text-left px-4 py-2.5 text-sm text-red-400 hover:bg-red-500/10 transition-colors flex items-center gap-3"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" /></svg>
                      Cerrar sesión
                    </button>
                  </div>
                </div>
              </>)}
            </div>
          )}
          {isDemo && (
            <button
              onClick={() => setUpgradeModalOpen(true)}
              className="relative flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold text-white shadow-md hover:brightness-110 active:scale-95 transition-all overflow-hidden group"
              style={{ background: 'linear-gradient(135deg, #3b82f6, #a855f7, #ec4899)' }}
              title={trialStart > 0 ? `Trial: ${Math.max(0, Math.ceil((trialStart + trialDays * 86400000 - Date.now()) / 86400000))} días restantes` : 'Unite a la comunidad'}
            >
              <span className="absolute inset-0 bg-gradient-to-r from-white/0 via-white/20 to-white/0 -translate-x-full group-hover:translate-x-full transition-transform duration-700" />
              <span className="relative animate-pulse">✨</span>
              <span className="relative">Unite a la comunidad</span>
            </button>
          )}
        </div>
      </header>

      {/* Mobile menu overlay */}
      {mobileMenuOpen && (
        <div className="md:hidden fixed inset-0 z-50 bg-black/60" onClick={() => setMobileMenuOpen(false)}>
          <div className="absolute left-0 top-0 bottom-0 w-64 bg-[var(--bg-panel)] border-r border-[var(--border-color)] flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--border-color)]">
              <div className="flex items-center gap-2">
                <img src="/logo.png" alt="DJ Free App" className="h-6 object-contain" />
                <span className="font-semibold text-base text-[var(--text-primary)]">DJ Free App</span>
              </div>
              <button onClick={() => setMobileMenuOpen(false)} className="p-1.5 rounded-lg text-gray-400 hover:bg-[var(--bg-hover)]">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <nav className="flex-1 overflow-y-auto p-3 space-y-1">
              {(isGuest ? [
                { id: 'discover', label: 'Discover', icon: 'M21 12a9 9 0 11-18 0 9 9 0 0118 0z' },
              ] : [
                { id: 'discover', label: 'Discover', icon: 'M21 12a9 9 0 11-18 0 9 9 0 0118 0z' },
                { id: 'library', label: 'Biblioteca', icon: 'M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10' },
                { id: 'set', label: 'Set Builder', icon: 'M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3' },
                ...(mixTracks ? [{ id: 'mix', label: 'Mix Editor', icon: 'M9 19V6l12-3v13' }] : []),
              ]).map(tab => (
                <button
                  key={tab.id}
                  onClick={() => { setPage(tab.id); setMobileMenuOpen(false) }}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-all ${
                    page === tab.id ? 'bg-[var(--color-accent)] text-white font-semibold' : 'text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]'
                  }`}
                >
                  <svg className="w-4.5 h-4.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={tab.icon} />
                  </svg>
                  {tab.label}
                </button>
              ))}
            </nav>
            {/* Mobile menu footer */}
            <div className="flex-shrink-0 border-t border-[var(--border-color)] p-4 space-y-4">
              {/* Accent color - segmented picker */}
              <div className="flex items-center gap-0.5 p-1 rounded-xl bg-[var(--bg-surface)]">
                {[
                  { color: '#3b82f6', label: 'Azul', gradient: 'from-blue-500 to-blue-600' },
                  { color: '#8b5cf6', label: 'Violeta', gradient: 'from-violet-500 to-purple-600' },
                  { color: '#f43f5e', label: 'Rosa', gradient: 'from-rose-500 to-pink-600' },
                  { color: '#f59e0b', label: 'Amber', gradient: 'from-amber-400 to-orange-500' },
                  { color: '#22c55e', label: 'Verde', gradient: 'from-green-400 to-emerald-600' },
                ].map(p => (
                  <button
                    key={p.color}
                    onClick={() => setAccentColor(p.color)}
                    className={`flex-1 flex flex-col items-center gap-1 py-2 rounded-lg transition-all duration-200 active:scale-95 ${
                      accentColor === p.color ? 'bg-white/10' : ''
                    }`}
                  >
                    <div className={`w-5 h-5 rounded-full bg-gradient-to-br ${p.gradient} ${
                      accentColor === p.color ? 'ring-2 ring-white/50' : ''
                    }`} />
                    <span className={`text-[9px] leading-none ${accentColor === p.color ? 'text-[var(--text-primary)] font-semibold' : 'text-gray-600'}`}>{p.label}</span>
                  </button>
                ))}
              </div>

              {/* Agent downloads */}
              <div>
                <div className="text-[10px] text-gray-500 uppercase font-bold mb-2">Agente</div>
                <div className="flex items-center gap-2">
                  <a href="https://djfreeapp.ar/GrooveSyncAgent.exe"
                    className="flex items-center gap-2 flex-1 px-3 py-2.5 rounded-xl bg-[var(--bg-surface)] hover:bg-[var(--bg-hover)] transition-all active:scale-[0.98]">
                    <svg className="w-5 h-5 text-[var(--text-muted)]" viewBox="0 0 24 24" fill="currentColor"><path d="M0 3.449L9.75 2.1v9.451H0m10.949-9.602L24 0v11.4H10.949M0 12.6h9.75v9.451L0 20.699M10.949 12.6H24V24l-12.9-1.801" /></svg>
                    <span className="text-xs text-[var(--text-secondary)]">Windows</span>
                  </a>
                  <a href="https://github.com/arenazl/slsk-agent/releases/latest/download/GrooveSyncAgent-macOS.zip"
                    className="flex items-center gap-2 flex-1 px-3 py-2.5 rounded-xl bg-[var(--bg-surface)] hover:bg-[var(--bg-hover)] transition-all active:scale-[0.98]">
                    <svg className="w-5 h-5 text-[var(--text-muted)]" viewBox="0 0 24 24" fill="currentColor"><path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.8-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z" /></svg>
                    <span className="text-xs text-[var(--text-secondary)]">macOS</span>
                  </a>
                </div>
              </div>

              {/* Connection status */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-xs text-[var(--text-muted)]">
                  <div className={`w-2.5 h-2.5 rounded-full ${connected ? 'bg-green-500' : 'bg-red-500'}`} />
                  <span>{connected ? (isRunning ? 'Descargando...' : 'SoulSeek conectado') : 'Desconectado'}</span>
                </div>
                <div className="flex items-center gap-1.5">
                  {agentConnected && (
                    <span className="text-[10px] text-green-400 bg-green-500/10 px-2 py-0.5 rounded-full">v{agentVersion}</span>
                  )}
                  <button onClick={async () => { try { await fetch(`${API_BASE}/api/restart-slsk`, { method: 'POST' }); connectWs() } catch {} }}
                    className="p-1.5 rounded-lg text-[var(--text-muted)] hover:text-yellow-400 hover:bg-[var(--bg-hover)] transition-all" title="Reiniciar SoulSeek">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
                  </button>
                  {agentConnected && (
                    <button
                      className="p-1.5 rounded-lg text-[var(--text-muted)] hover:text-yellow-400 hover:bg-[var(--bg-hover)] transition-all"
                      title="Reiniciar Agente"
                      onClick={async () => {
                        try {
                          const res = await agentFetch('restart', { method: 'POST' })
                          if (res.ok) toast('Reiniciando agente...', 'info')
                        } catch {}
                        toast('Agente reiniciándose...', 'info')
                      }}
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Library - always mounted, hidden when not active */}
      <div className={`flex-1 flex min-h-0 ${page !== 'library' ? 'hidden' : ''}`}>
        <Library
          key={`library-${collection}`}
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
          collection={collection}
        />
      </div>

      {/* Download page */}
      <div className={`flex-1 flex flex-col min-h-0 ${page !== 'download' ? 'hidden' : ''}`}>

        {/* SoulSeek search bar */}
        <div className="flex-shrink-0 flex items-center gap-2 px-3 md:px-4 py-2 bg-[var(--bg-panel)] border-b border-[var(--border-color)]">
          <div className="relative flex-1">
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500 pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              value={dlSearch}
              onChange={e => setDlSearch(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') handleSearchSlsk() }}
              placeholder="Buscar en SoulSeek..."
              className="w-full pl-9 pr-3 py-2 bg-[var(--bg-input)] border border-gray-700 rounded-lg text-sm text-[var(--text-primary)] placeholder-gray-500 focus:outline-none focus:border-[var(--color-accent)] transition-colors"
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
              className="p-1.5 rounded-lg text-gray-500 hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)] transition-all flex-shrink-0"
              title="Cerrar resultados"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>

        <div className="flex-1 flex flex-col md:flex-row min-h-0">

        {/* Mobile: collapsible input panel */}
        <div className="md:hidden flex-shrink-0 border-b border-[var(--border-color)] bg-[var(--bg-panel)]">
          <button
            onClick={() => setDlPanelOpen(prev => !prev)}
            className="w-full flex items-center justify-between px-4 py-2.5"
          >
            <div className="flex items-center gap-2">
              <svg className="w-4 h-4 text-[var(--color-accent)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 13h6m-3-3v6m5 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              <span className="text-sm font-medium text-[var(--text-primary)]">Pegar tracks</span>
              {tracks.length > 0 && <span className="text-xs text-[var(--color-accent)] bg-[var(--color-accent)]/10 px-2 py-0.5 rounded-full">{tracks.length}</span>}
            </div>
            <div className="flex items-center gap-2">
              {isRunning && <div className="w-2 h-2 rounded-full bg-[var(--color-accent)] animate-pulse" />}
              <svg className={`w-4 h-4 text-gray-400 transition-transform duration-200 ${dlPanelOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </div>
          </button>
          {dlPanelOpen && (
            <div className="px-4 pb-4 space-y-2 animate-fade-in">
              <input
                value={genre}
                onChange={e => setGenre(e.target.value)}
                placeholder="Estilo: Tech House, Melodic Techno..."
                className="w-full px-3 py-2 bg-[var(--bg-input)] border border-gray-700 rounded-lg text-sm focus:outline-none focus:border-[var(--color-accent)] transition-colors"
              />
              <textarea
                value={inputText}
                onChange={e => setInputText(e.target.value)}
                placeholder={"1. Artist - Title - Mix\n\nO pegar HTML de Beatport..."}
                rows={5}
                className="w-full px-3 py-2 bg-[var(--bg-input)] border border-gray-700 rounded-lg text-sm font-mono resize-none focus:outline-none focus:border-[var(--color-accent)] transition-colors"
              />
              <div className="flex gap-2">
                <button
                  onClick={handleParse}
                  disabled={!inputText.trim() || !connected}
                  className="flex-1 py-2 bg-gray-700 hover:bg-gray-600 disabled:opacity-40 rounded-lg text-sm transition-all active:scale-95"
                >
                  Previsualizar
                </button>
                {!isRunning ? (
                  <button
                    onClick={() => { handleStart(); setDlPanelOpen(false) }}
                    disabled={!inputText.trim() || !username || !password || !connected}
                    className="flex-1 py-2 disabled:opacity-40 rounded-lg text-sm font-semibold transition-all active:scale-95"
                    style={{ background: 'var(--color-accent)', color: 'var(--color-accent-text)' }}
                  >
                    Descargar {tracks.length > 0 ? `(${tracks.length})` : ''}
                  </button>
                ) : (
                  <button
                    onClick={handleStop}
                    className="flex-1 py-2 bg-red-600 hover:bg-red-500 rounded-lg text-sm font-semibold transition-all active:scale-95"
                  >
                    Detener
                  </button>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Desktop: Sidebar - Input */}
        <aside className="hidden md:flex flex-shrink-0 w-80 flex-col bg-[var(--bg-panel)] border-r border-[var(--border-color)]">
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
        <main className="flex-1 flex flex-col min-w-0 min-h-0">
          {/* Tabs */}
          {tracks.length > 0 && (
            <div className="flex-shrink-0 flex items-center gap-1 px-3 md:px-4 py-2 bg-[var(--bg-panel)] border-b border-[var(--border-color)] overflow-x-auto scrollbar-none">
              {tabs.map(tab => (
                <button
                  key={tab.key}
                  onClick={() => { setActiveTab(tab.key); setSearchResults(null); setDlSearch('') }}
                  className={`px-2 md:px-3 py-1.5 rounded-lg text-xs md:text-sm transition-all duration-200 flex-shrink-0 ${
                    activeTab === tab.key
                      ? 'font-semibold'
                      : 'text-gray-400 hover:text-[var(--text-primary,white)] hover:bg-gray-800'
                  }`}
                  style={activeTab === tab.key ? { background: 'var(--color-accent)', color: 'var(--color-accent-text)' } : {}}
                >
                  {tab.label}
                  <span className={`ml-1 text-xs ${activeTab === tab.key ? 'opacity-70' : 'text-gray-600'}`}>
                    {tab.count}
                  </span>
                </button>
              ))}
            </div>
          )}

          {/* Active progress banner */}
          {isRunning && tracks.length > 0 && (() => {
            const done = completed + skipped + notFound + errors
            const pct = tracks.length > 0 ? (done / tracks.length) * 100 : 0
            const active = tracks.find(t => t.status === 'downloading') || tracks.find(t => t.status === 'searching')
            return (
              <div className="flex-shrink-0 border-b border-[var(--border-color)] bg-[var(--bg-panel)] px-3 md:px-4 py-2">
                <div className="flex items-center gap-3 mb-1.5">
                  <div className="w-4 h-4 border-2 border-[var(--color-accent)] border-t-transparent rounded-full animate-spin flex-shrink-0" />
                  <span className="text-xs text-gray-400 flex-shrink-0">{done}/{tracks.length}</span>
                  {active && (
                    <span className="text-xs truncate min-w-0 text-[var(--text-primary)]">
                      <span className={active.status === 'downloading' ? 'text-[var(--color-accent)]' : 'text-yellow-400'}>
                        {active.status === 'downloading' ? '↓' : '🔍'}
                      </span>
                      {' '}{active.artist} - {active.title}
                    </span>
                  )}
                </div>
                <div className="h-1 bg-gray-800 rounded-full overflow-hidden">
                  <div className="h-full bg-[var(--color-accent)] transition-all duration-300" style={{ width: `${pct}%` }} />
                </div>
              </div>
            )
          })()}

          {/* Pending tracks banner */}
          {pendingTracks.length > 0 && !searchResults && (
            <div className="flex-shrink-0 border-b border-[var(--border-color)] bg-yellow-500/5">
              <button
                onClick={() => setPendingExpanded(prev => !prev)}
                className="w-full px-3 md:px-4 py-2 flex items-center justify-between text-sm hover:bg-yellow-500/10 transition-colors"
              >
                <span className="flex items-center gap-2 text-yellow-400">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                  {pendingTracks.length} pendiente{pendingTracks.length > 1 ? 's' : ''}
                </span>
                <svg className={`w-4 h-4 text-gray-400 transition-transform ${pendingExpanded ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
              </button>
              {pendingExpanded && (
                <div className="px-3 md:px-4 pb-3 space-y-1">
                  <button
                    onClick={() => {
                      if (isRunning) { toast('Ya hay una descarga en curso. Esperá que termine o tocá Forzar detención', 'warning', 4000); return }
                      if (!wsRef.current || wsRef.current.readyState !== 1 || !username || !password) return
                      // Use batch download flow: send all pending tracks as a single job
                      const tracksText = pendingTracks.map(t => `${t.artist} - ${t.title}`).join('\n')
                      setSearchResults(null) // Hide search results view so track list is visible
                      setDlSearch('')
                      setSummary(null)
                      setLogs([])
                      wsRef.current.send(JSON.stringify({
                        type: 'start',
                        tracks_text: tracksText,
                        username,
                        password,
                        genre: '',
                        app_user: authUser?.name || '',
                      }))
                      setPendingExpanded(false)
                    }}
                    disabled={!connected}
                    className="w-full py-1.5 rounded-lg bg-yellow-500/20 text-yellow-400 text-xs font-semibold hover:bg-yellow-500/30 disabled:opacity-40 transition-all duration-200 active:scale-95 flex items-center justify-center gap-1.5"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
                    Reintentar todos ({pendingTracks.length})
                  </button>
                  <div className="max-h-64 overflow-y-auto space-y-1 overscroll-contain">
                    {pendingTracks.map((t, idx) => (
                      <div key={idx} className="flex items-center justify-between gap-2 py-1.5 px-3 rounded-lg bg-[var(--bg-input)] text-xs">
                        <span className="truncate min-w-0 text-[var(--text-primary)]">{t.artist} - {t.title}</span>
                        <div className="flex items-center gap-1 flex-shrink-0">
                          <button
                            onClick={() => {
                              if (isRunning) { toast('Esperá que termine la descarga actual o tocá Forzar detención', 'warning', 4000); return }
                              if (!wsRef.current || wsRef.current.readyState !== 1) return
                              setSearchResults(null)
                              setDlSearch('')
                              setSummary(null)
                              setLogs([])
                              wsRef.current.send(JSON.stringify({
                                type: 'start',
                                tracks_text: `${t.artist} - ${t.title}`,
                                username, password,
                                genre: '',
                                app_user: authUser?.name || '',
                              }))
                              setPendingExpanded(false)
                            }}
                            disabled={isRunning}
                            className="px-2 py-1 rounded bg-[var(--color-accent)] text-[var(--color-accent-text)] hover:opacity-80 transition-opacity disabled:opacity-40 disabled:cursor-not-allowed"
                          >Bajar</button>
                          <button
                            onClick={() => removeFromPending(idx)}
                            className="px-2 py-1 rounded bg-red-500/20 text-red-400 hover:bg-red-500/30 transition-colors"
                          >✕</button>
                        </div>
                      </div>
                    ))}
                  </div>
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
                  <div className="sticky top-0 z-10 px-3 md:px-4 py-2 bg-[var(--bg-genre-header)] border-b border-[var(--border-color)] flex items-center gap-3">
                    <span className="text-sm font-semibold text-[var(--color-accent)]">Resultados SoulSeek</span>
                    <span className="text-xs text-gray-500">{(() => { const grouped = {}; searchResults.forEach(r => { if (!grouped[r.filename]) grouped[r.filename] = []; grouped[r.filename].push(r) }); return Object.keys(grouped).length })()} archivos</span>
                  </div>
                  {(() => {
                    const grouped = {}
                    searchResults.forEach(r => {
                      if (!grouped[r.filename]) grouped[r.filename] = []
                      grouped[r.filename].push(r)
                    })
                    return Object.entries(grouped).map(([filename, sources]) => {
                      const best = sources[0]
                      // Server-side dedup groups multiple peers under best.sources.
                      // Prefer that list (has queue/slots/speed per peer) over the
                      // UI-level filename grouping, which would lose fallback peers.
                      const serverSources = Array.isArray(best.sources) && best.sources.length > 0 ? best.sources : null
                      const effectiveSources = serverSources || sources
                      const sourceCount = best.source_count || serverSources?.length || sources.length
                      const dlInfo = searchDlStatus[filename]
                      const dlSt = dlInfo?.status || dlInfo
                      const dlPct = dlInfo?.pct
                      // The badge MUST reflect filesystem reality: green only when
                      // the file (under its real on-disk name, possibly renamed by
                      // the peer) is in the user's local storage. The server's
                      // `completed` event alone is not enough — /audio fetch +
                      // FSA save can still fail and leave it on Heroku only.
                      const localName = dlInfo?.local_name || filename
                      const isLocal = localFilesSet.has(localName) || localFilesSet.has(filename)
                      return (
                        <div key={filename}
                          onDoubleClick={() => isLocal && goToLibraryTrack(localName)}
                          className={`flex items-center gap-2 md:gap-3 px-3 md:px-4 py-2.5 md:py-2 border-b border-[var(--border-color)]/50 hover:bg-gray-800/30 transition-colors text-sm ${isLocal ? 'cursor-pointer' : ''}`}>
                          <PlayPauseBtn
                            isPlaying={playingFile === filename && isAudioPlaying}
                            loading={previewLoading === filename}
                            onClick={() => handlePreview(filename)}
                          />
                          <div className="flex-1 min-w-0">
                            <div className="truncate text-xs md:text-sm text-[var(--text-primary)]">{filename}</div>
                            <div className="flex items-center gap-2 md:gap-3 text-xs text-gray-500 mt-0.5">
                              <span className="text-purple-400">{best.ext}</span>
                              <span>{best.size_mb} MB</span>
                              <span className="hidden sm:inline">{best.bitrate > 0 ? `${best.bitrate} kbps` : ''}</span>
                              <span className="hidden sm:inline">{best.duration > 0 ? `${Math.floor(best.duration / 60)}:${String(best.duration % 60).padStart(2, '0')}` : ''}</span>
                              <span className="text-gray-600">{sourceCount} fuente{sourceCount > 1 ? 's' : ''}</span>
                            </div>
                          </div>
                          {isLocal ? (
                            <span className="text-green-400 text-xs flex-shrink-0">Descargado</span>
                          ) : dlSt === 'completed' ? (
                            <span className="text-yellow-400 text-xs flex-shrink-0 animate-pulse">Guardando local…</span>
                          ) : dlSt === 'queued' ? (
                            <div className="flex-shrink-0 flex items-center gap-2">
                              <div className="flex flex-col items-end">
                                <span className="text-yellow-400 text-xs animate-pulse">
                                  En cola <span className="hidden sm:inline">({dlInfo.source})</span> q:{dlInfo.queue || '?'}
                                </span>
                                {dlInfo.wait_secs > 0 && (
                                  <div className="hidden sm:flex items-center gap-1.5 mt-0.5">
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
                                  <div className="w-16 md:w-20 h-1.5 bg-gray-700 rounded-full overflow-hidden">
                                    <div className="h-full rounded-full transition-all duration-300 bg-[var(--color-accent)]" style={{ width: `${dlPct}%` }} />
                                  </div>
                                  <span className="text-[var(--color-accent)] text-xs w-10 md:w-12 text-right">{dlPct}%{dlInfo?.speed > 0 ? ` ${dlInfo.speed}k` : ''}</span>
                                </>
                              ) : (
                                <span className="text-yellow-400 text-xs animate-pulse">Iniciando...</span>
                              )}
                            </div>
                          ) : dlSt === 'error' ? (
                            <button
                              onClick={() => { setSearchDlStatus(prev => { const n = {...prev}; delete n[filename]; return n }); handleDownloadSingle({ ...best, sources: effectiveSources }) }}
                              title={dlInfo?.error === 'no_local_storage' ? 'Servidor descargó pero no hay storage local (FSA/agente). Reintentar para guardar.' : (dlInfo?.error || 'Reintentar')}
                              className="text-red-400 hover:text-red-300 text-xs flex-shrink-0 hover:underline transition-colors"
                            >{dlInfo?.error === 'no_local_storage' ? 'Sin storage local' : 'Reintentar'}</button>
                          ) : (
                            <button
                              onClick={() => handleDownloadSingle({ ...best, sources: effectiveSources })}
                              className="flex-shrink-0 px-2 md:px-3 py-1 rounded text-xs transition-all duration-200 active:scale-95"
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
                <div className="text-center space-y-2 px-6">
                  <p className="text-4xl">&#127925;</p>
                  <p className="text-sm md:text-base">Pega tu lista de tracks <span className="hidden md:inline">a la izquierda</span><span className="md:hidden">arriba</span></p>
                  <p className="text-xs md:text-sm text-gray-500">Soporta Beatport (texto o HTML), Rekordbox</p>
                </div>
              </div>
            ) : activeTab === 'by_genre' ? (
              <>
                {genres.map(g => (
                  <div key={g}>
                    <div className="sticky top-0 z-10 px-3 md:px-4 py-2 bg-[var(--bg-genre-header)] border-b border-[var(--border-color)] flex items-center gap-2">
                      <span className="text-sm font-semibold text-[var(--color-accent)]">{g}</span>
                      <span className="text-xs text-gray-500">{tracksByGenre[g].length} tracks</span>
                      <span className="text-xs text-green-500">{tracksByGenre[g].filter(t => t.status === 'completed').length} completados</span>
                    </div>
                    {tracksByGenre[g].map(track => <TrackRow key={track.id} track={track} onCancel={handleCancelTrack} />)}
                  </div>
                ))}
                {ungrouped.length > 0 && (
                  <div>
                    <div className="sticky top-0 z-10 px-3 md:px-4 py-2 bg-[var(--bg-genre-header)] border-b border-[var(--border-color)]">
                      <span className="text-sm font-semibold text-gray-400">Sin estilo</span>
                      <span className="text-xs text-gray-500 ml-2">{ungrouped.length} tracks</span>
                    </div>
                    {ungrouped.map(track => <TrackRow key={track.id} track={track} onCancel={handleCancelTrack} />)}
                  </div>
                )}
              </>
            ) : (
              filteredTracks.map(track => <TrackRow key={track.id} track={track} onCancel={handleCancelTrack} />)
            )}
          </div>

          {/* Logs técnicos — collapsados por default, toggle en el header */}
          {logs.length > 0 && (
            <div className="flex-shrink-0 border-t border-[var(--border-color)] bg-[var(--bg-surface)]">
              <button
                onClick={() => setLogsExpanded(v => !v)}
                className="w-full flex items-center justify-between px-3 md:px-4 py-1.5 text-xs text-gray-500 hover:text-gray-300 transition-colors"
              >
                <span className="flex items-center gap-2">
                  <svg className={`w-3 h-3 transition-transform ${logsExpanded ? 'rotate-90' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                  Logs técnicos ({logs.length})
                </span>
                {!logsExpanded && logs.length > 0 && (
                  <span className="truncate ml-2 text-gray-600 max-w-md">{logs[logs.length - 1]}</span>
                )}
              </button>
              {logsExpanded && (
                <div className="max-h-40 md:max-h-56 overflow-y-auto px-3 md:px-4 py-2 font-mono text-xs border-t border-[var(--border-color)]">
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
            </div>
          )}

          {/* Summary */}
          {summary && (
            <div className="flex-shrink-0 px-3 md:px-4 py-2 md:py-3 bg-[var(--bg-panel)] border-t border-[var(--border-color)]">
              <div className="flex flex-wrap items-center gap-2 md:gap-4 text-xs md:text-sm">
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
      </div>

      {/* Set Builder page */}
      <SetBuilder page={page} playingFile={playingFile} onPlay={handleAppPlay} onPlayPause={handleAppPlayPause} onStop={handleAppStop} agentConnected={agentConnected} onEditMix={(tracks) => { setMixTracks(tracks); setPage('mix') }} authUser={authUser} collection={collection} onGoToLibrary={goToLibraryTrack} playNextRef={playNextRef} libraryRoot={libraryRoot} />

      {/* Mix Editor page */}
      {page === 'mix' && (
        <MixEditor
          tracks={mixTracks || []}
          onBack={() => setPage('set')}
          agentConnected={agentConnected}
        />
      )}

      {/* Discover page */}
      <div className={`flex-1 flex flex-col min-h-0 ${page !== 'discover' ? 'hidden' : ''}`}>
        <ScreenHint id="discover" title="Descubrí música nueva" tips={[
          { icon: '🔍', text: <>Top 100 de <strong>Beatport</strong> + playlists curadas de <strong>Spotify</strong>. Filtrá por género en las pills de arriba.</> },
          { icon: '▶️', text: <>Click en cualquier track para preview 30s desde iTunes/Beatport — sin descarga.</> },
          { icon: '❤️', text: <>Marcá <strong>corazón</strong> para guardar como favorito (filtrable después en Biblioteca).</> },
          { icon: '⬇️', text: <>Click <strong>Descargar</strong> y se baja vía SoulSeek con el agente — entra automático a tu biblioteca con metadata.</> },
          { icon: '📻', text: <>Click derecho → <strong>Radio</strong>: arma una sesión de 1h con tracks similares al que tocaste. Para inspirarte.</> },
        ]} />
        <DiscoverPage
          wsRef={wsRef}
          username={username}
          password={password}
          connected={connected}
          onGoToDownloads={() => setPage('download')}
          audioRef={audioRef}
          autoplayCancelRef={autoplayCancelRef}
          playingFile={playingFile}
          setPlayingFile={setPlayingFile}
          setNowPlaying={setNowPlaying}
          setIsAudioPlaying={setIsAudioPlaying}
          addToPending={addToPending}
          isFavorite={isFavorite}
          toggleFavorite={toggleFavorite}
          isGuest={isGuest}
          pendingRadioTrack={pendingRadioTrack}
          onRadioConsumed={() => setPendingRadioTrack(null)}
          agentConnected={agentConnected}
          agentHasSlsk={agentHasSlsk}
          authUser={authUser}
          collection={collection}
          onGoToLibrary={goToLibraryTrack}
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
        audioRef={audioRef}
        onPlayPause={handleAppPlayPause}
        onStop={handleAppStop}
        onRadio={(f) => {
          setPendingRadioTrack({ artist: f.artist || '', title: f.title || f.filename })
          setPage('discover')
        }}
        agentConnected={agentConnected}
      />
    </div>
  )
}


function SwipeableRow({ children, onReveal }) {
  const [dx, setDx] = useState(0)
  const [sliding, setSliding] = useState(false)
  const startX = useRef(0)
  const startY = useRef(0)
  const locked = useRef(null)
  const THRESHOLD = 70
  const MAX = 140

  const handleStart = (e) => {
    const t = e.touches[0]
    startX.current = t.clientX
    startY.current = t.clientY
    locked.current = null
    setSliding(true)
  }
  const handleMove = (e) => {
    const t = e.touches[0]
    const rx = t.clientX - startX.current
    const ry = t.clientY - startY.current
    if (locked.current == null && (Math.abs(rx) > 10 || Math.abs(ry) > 10)) {
      locked.current = Math.abs(rx) > Math.abs(ry) ? 'x' : 'y'
    }
    if (locked.current === 'x') {
      setDx(Math.max(-MAX, Math.min(MAX, rx)))
    }
  }
  const handleEnd = () => {
    const past = Math.abs(dx) > THRESHOLD
    const wasX = locked.current === 'x'
    setSliding(false)
    setDx(0)
    locked.current = null
    if (wasX && past) setTimeout(() => onReveal?.(), 0)
  }

  const absDx = Math.abs(dx)
  const revealed = absDx > THRESHOLD
  const rightAligned = dx < 0

  return (
    <div className="relative mb-1">
      <div
        className={`absolute inset-0 rounded-xl flex items-center ${rightAligned ? 'justify-end pr-5' : 'justify-start pl-5'} transition-colors duration-150 ${revealed ? 'bg-[var(--color-accent)]' : 'bg-[var(--color-accent)]/30'}`}
      >
        <div
          className={`flex items-center gap-2 text-sm font-medium select-none ${revealed ? 'text-[var(--color-accent-text,white)]' : 'text-[var(--color-accent)]'}`}
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
          </svg>
          Opciones
        </div>
      </div>
      <div
        onTouchStart={handleStart}
        onTouchMove={handleMove}
        onTouchEnd={handleEnd}
        onTouchCancel={handleEnd}
        style={{
          transform: `translateX(${dx}px)`,
          transition: sliding ? 'none' : 'transform 220ms cubic-bezier(0.2, 0.9, 0.3, 1)',
          background: 'var(--bg-app)',
        }}
        className="relative rounded-xl"
      >
        {children}
      </div>
    </div>
  )
}


function DiscoverPage({ wsRef, username, password, connected, onGoToDownloads, audioRef, autoplayCancelRef, playingFile, setPlayingFile, setNowPlaying, setIsAudioPlaying, addToPending, isFavorite, toggleFavorite, isGuest, pendingRadioTrack, onRadioConsumed, agentConnected, agentHasSlsk, authUser, collection, onGoToLibrary }) {
  const toast = useToast()
  const [genres, setGenres] = useState([])
  // URL-synced selections: share/bookmark any view directly
  const [selectedGenre, setSelectedGenre] = useState(null) // null = All
  const [genreSlug, setGenreSlug] = useQS('genre', '')    // ?genre=tech-house
  const [spotifyKey, setSpotifyKey] = useQS('playlist', '') // ?playlist=top50_argentina
  const [tracks, setTracks] = useState([])
  const [loading, setLoading] = useState(false)
  const [playingId, setPlayingId] = useState(null)
  // Last successful chart scrape (ms epoch) + source ("live"/"cache"/"cloudinary")
  const [chartScrapedAt, setChartScrapedAt] = useState(0)
  const [chartSource, setChartSource] = useState('')
  // Label filter: URL-synced via ?label=<name>. When set, the server scrapes
  // Beatport's label page and returns up to 150 tracks.
  const [labelName, setLabelName] = useQS('label', '')
  const [labelTrackCount, setLabelTrackCount] = useState(0)
  const [labelTracks, setLabelTracks] = useState([])
  const [labelLoading, setLabelLoading] = useState(false)
  const labelFilter = labelName ? { name: labelName, count: labelTrackCount } : null

  // Source derived from global collection toggle
  // EDM → Beatport. POP and LATIN → Spotify (filtered by playlist's category).
  const discoverSource = collection === 'edm' ? 'beatport' : 'spotify'
  const [spotifyCategories, setSpotifyCategories] = useState([])
  const [selectedSpotifyCategory, setSelectedSpotifyCategory] = useState(null)
  const [spotifyPlaylistName, setSpotifyPlaylistName] = useState('')

  // Library manifest for marking already-downloaded tracks
  const [libraryManifest, setLibraryManifest] = useState({})
  const loadLibraryRef = useRef(null)

  useEffect(() => {
    // Library manifest = files that ACTUALLY EXIST in user's local storage.
    // Heroku metadata is used only to enrich title/artist for those files;
    // it never adds entries on its own (otherwise empty folders would still
    // mark Discover tracks as "Descargado").
    const loadLibrary = async () => {
      const merged = {}

      // 1. Get local file list (FSA → agent → Cloudinary-synced from another device)
      let localFiles = []
      const fsaActive = await fsaBackend.ready()
      try {
        if (fsaActive) {
          localFiles = await fsaBackend.listLibrary()
        } else if (agentConnected) {
          const agentRes = await agentFetch('library')
          const arr = await agentRes.json()
          if (Array.isArray(arr)) localFiles = arr
        } else {
          // Mobile or browsers without FSA: read the list the desktop last synced
          const syncRes = await fetch(`${API_BASE}/api/user-files?user=${encodeURIComponent(authUser?.name || '')}`)
          const synced = await syncRes.json()
          if (Array.isArray(synced)) localFiles = synced
        }
      } catch {}

      // Build manifest from local files only
      for (const f of localFiles) {
        merged[f.filename] = { title: '', artist: '', genre: f.subfolder || '' }
      }

      // 2. Enrich with Heroku/Cloudinary metadata (title, artist, key, etc.)
      //    — only for filenames that exist in local storage
      try {
        const meta = await fetch(`${API_BASE}/api/metadata?user=${encodeURIComponent(authUser?.name || '')}&collection=${collection || 'edm'}`).then(r => r.json())
        if (meta && typeof meta === 'object') {
          for (const fname of Object.keys(merged)) {
            if (meta[fname]) merged[fname] = { ...merged[fname], ...meta[fname] }
          }
        }
      } catch {}

      setLibraryManifest(merged)
    }
    loadLibraryRef.current = loadLibrary
    loadLibrary()
    // Re-scan cuando la Library dispare "library-changed" (después de mover
    // archivos a la carpeta nueva, por ejemplo). Permite que los badges
    // "Descargado" en Discover se actualicen sin tener que recargar la app.
    const handler = () => loadLibrary()
    window.addEventListener('library-changed', handler)
    return () => window.removeEventListener('library-changed', handler)
  }, [authUser, collection, agentConnected])

  // Refresh library manifest whenever any download completes (global WS listener).
  // Avoids stale marks after batch downloads — the per-track handler in
  // searchAndDownload only fires for the track it was registered for.
  useEffect(() => {
    const ws = wsRef?.current
    if (!ws) return
    const handler = (e) => {
      try {
        const data = JSON.parse(e.data)
        if ((data.type === 'search_dl_status' && data.status === 'completed') ||
            (data.type === 'track_update' && data.track?.status === 'completed')) {
          loadLibraryRef.current?.()
        }
      } catch {}
    }
    ws.addEventListener('message', handler)
    return () => ws.removeEventListener('message', handler)
  }, [wsRef?.current])

  const isInLibrary = useMemo(() => {
    // Normalize: strip accents, parens, featuring, mix names, extensions, non-alphanumeric
    const norm = (s) => (s || '')
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')      // strip accents
      .toLowerCase()
      .replace(/\(.*?\)/g, ' ')                               // remove (Extended Mix), etc
      .replace(/\[.*?\]/g, ' ')                               // remove [brackets]
      .replace(/\b(feat\.?|featuring|ft\.?|with)\s+[^-,]*/gi, ' ') // remove "feat. ..."
      .replace(/\.(flac|mp3|wav|m4a|aif|aiff|ogg)$/i, '')     // remove extension
      .replace(/^\d+[\s.\-]+/, '')                            // remove leading track numbers
      .replace(/[^a-z0-9]/g, '')                              // only alphanumeric
      .trim()

    // Tokenized version (for word-overlap fuzzy match): returns array of words ≥3 chars
    const tokens = (s) => (s || '')
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/\(.*?\)/g, ' ')
      .replace(/\[.*?\]/g, ' ')
      .replace(/\b(feat\.?|featuring|ft\.?|with)\s+[^-,]*/gi, ' ')
      .replace(/\.(flac|mp3|wav|m4a|aif|aiff|ogg)$/i, '')
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter(w => w.length >= 3 && !['the','and','feat','mix','ext','org','original','extended','edit','remix','club','radio','vocal','version'].includes(w))

    // Build indexes
    const titleWords = new Set()    // individual normalized titles
    const artistTitle = new Set()   // "artist|title" combos
    const filenames = []            // [{full, tokens}] for fuzzy search

    for (const [filename, meta] of Object.entries(libraryManifest)) {
      const fn = norm(filename)
      const fnTokens = tokens(filename)
      if (fn) filenames.push({ full: fn, tokens: new Set(fnTokens) })

      const artist = norm(meta.artist || '')
      const title = norm(meta.title || '')
      if (title) titleWords.add(title)
      if (artist && title) artistTitle.add(`${artist}|${title}`)

      // Extract artist/title from filename split on dashes
      const base = filename.replace(/\.(flac|mp3|wav|m4a|aif|aiff|ogg)$/i, '')
      const parts = base.split(/\s*-\s*/)
      if (parts.length >= 2) {
        const fnArtist = norm(parts[0])
        const fnTitle = norm(parts.slice(1).join(' '))
        if (fnArtist && fnTitle) artistTitle.add(`${fnArtist}|${fnTitle}`)
        if (fnTitle) titleWords.add(fnTitle)
        if (parts.length >= 3) {
          const lastArtist = norm(parts[parts.length - 2])
          const lastTitle = norm(parts[parts.length - 1])
          if (lastArtist && lastTitle) artistTitle.add(`${lastArtist}|${lastTitle}`)
          if (lastTitle) titleWords.add(lastTitle)
        }
      }
    }

    // Returns the matching library filename (key into libraryManifest) or null.
    // Used both to answer "is in library?" (truthy) and to recover the
    // matched file so the UI can resolve its folder/genre and open it.
    const findFilename = (track) => {
      const a = norm(track.artist || '')
      const t = norm(track.title || '')
      if (!t) return null

      const findInFilenames = (predicate) => {
        for (const [filename, meta] of Object.entries(libraryManifest)) {
          const fn = norm(filename)
          if (predicate(fn, filename, meta)) return filename
        }
        return null
      }

      // 1) Exact artist+title — scan manifest to recover the actual filename
      if (a && artistTitle.has(`${a}|${t}`)) {
        const hit = findInFilenames((fn, filename, meta) => {
          const ma = norm(meta.artist || '')
          const mt = norm(meta.title || '')
          if (ma === a && mt === t) return true
          // Also check filename-derived parts
          const base = filename.replace(/\.(flac|mp3|wav|m4a|aif|aiff|ogg)$/i, '')
          const parts = base.split(/\s*-\s*/)
          if (parts.length >= 2) {
            if (norm(parts[0]) === a && norm(parts.slice(1).join(' ')) === t) return true
          }
          return false
        })
        if (hit) return hit
      }
      // 2) Title-only exact
      if (titleWords.has(t)) {
        const hit = findInFilenames((fn, filename, meta) => norm(meta.title || '') === t)
        if (hit) return hit
      }
      // 3) artist+title concatenated matches any full filename
      if (a) {
        const hit = findInFilenames((fn) => fn === a + t || fn.includes(a + t))
        if (hit) return hit
      }
      // 4) Substring: title of length ≥ 4 appearing inside any filename
      if (t.length >= 4) {
        const hit = findInFilenames((fn) => fn.includes(t))
        if (hit) return hit
      }
      // 5) Token overlap: title+artist words with ≥ 70% matching any filename tokens
      const trackTokens = [...tokens(track.artist || ''), ...tokens(track.title || '')]
      if (trackTokens.length >= 2) {
        const needed = Math.max(2, Math.ceil(trackTokens.length * 0.7))
        for (const filename of Object.keys(libraryManifest)) {
          const fnTokens = new Set(tokens(filename))
          const matches = trackTokens.filter(w => fnTokens.has(w)).length
          if (matches >= needed) return filename
        }
      }
      return null
    }

    const checker = (track) => findFilename(track) != null
    // Returns { folder, file } for the matched library entry — used to
    // build the agent's open-folder?folder=&file= request which reveals the
    // file in Explorer. Returns null when the track isn't in the library.
    checker.findLocation = (track) => {
      const filename = findFilename(track)
      if (!filename) return null
      return { folder: libraryManifest[filename]?.genre || '', file: filename }
    }
    return checker
  }, [libraryManifest])
  // Download queue state
  const [downloadQueue, setDownloadQueue] = useState({}) // trackId -> {status, message}
  // IDs the user explicitly "limpió" this session — suppresses the "Descargado"
  // badge so the user can re-trigger a download. Reset on page reload.
  const [clearedTrackIds, setClearedTrackIds] = useState(() => new Set())

  const handleShareTrack = async (track) => {
    if (!track) return
    const params = new URLSearchParams({ share: '1' })
    if (track.artist) params.set('artist', track.artist)
    if (track.title) params.set('title', track.title)
    if (track.artwork_url) params.set('artwork', track.artwork_url)
    const preview = track.sample_url || track.preview_url
    if (preview) params.set('preview', preview)
    // Always share the production HTTPS root, not whatever local origin the
    // user is on. Avoids leaking localhost / dev URLs and guarantees ShareView
    // (no-login preview) gets served.
    const url = `https://djfreeapp.ar/?${params.toString()}`
    const shareText = `🎵 ${track.artist || ''} - ${track.title || ''}`.trim()

    console.log('[Share] url=', url)
    setDiscoverCtx(null)
    const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent || '')
    if (isMobile && navigator.share) {
      try {
        await navigator.share({ title: shareText, text: shareText, url })
        return
      } catch (e) { console.log('[Share] navigator.share failed:', e?.message) }
    }
    // Try modern Clipboard API
    if (navigator.clipboard && window.isSecureContext) {
      try {
        await navigator.clipboard.writeText(url)
        toast('Link copiado al portapapeles ✓', 'success', 2500)
        return
      } catch (e) { console.log('[Share] clipboard.writeText failed:', e?.message) }
    }
    // Legacy execCommand path (works without focus / permissions in older browsers)
    try {
      const ta = document.createElement('textarea')
      ta.value = url
      ta.style.position = 'fixed'
      ta.style.left = '-9999px'
      document.body.appendChild(ta)
      ta.select()
      const ok = document.execCommand('copy')
      document.body.removeChild(ta)
      if (ok) {
        toast('Link copiado ✓', 'success', 2500)
        return
      }
    } catch (e) { console.log('[Share] execCommand failed:', e?.message) }
    // Last resort: native prompt
    window.prompt('Copiá el link para compartir:', url)
  }

  const cleanTrackState = (t) => {
    setDownloadQueue(prev => {
      if (!(t.id in prev)) return prev
      const n = { ...prev }
      delete n[t.id]
      return n
    })
    setClearedTrackIds(prev => {
      const next = new Set(prev)
      next.add(t.id)
      return next
    })
    if (t.artist && t.title && username) {
      fetch(`${API_BASE}/api/pending/remove`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user: username, tracks: [{ artist: t.artist, title: t.title }] }),
      }).catch(() => {})
    }
    toast?.('Limpiado', 'success', 1200)
  }
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
  // Auto-preview duration per track (30 / 60 / 90 / 120 s). Default 30.
  const [previewDuration, setPreviewDuration] = useState(() => {
    const saved = parseInt(localStorage.getItem('preview_duration') || '30', 10)
    return [30, 60, 90, 120].includes(saved) ? saved : 30
  })
  useEffect(() => { localStorage.setItem('preview_duration', String(previewDuration)) }, [previewDuration])
  // Use a ref so the currently-running preview picks up changes mid-session too
  const previewDurationRef = useRef(previewDuration)
  useEffect(() => { previewDurationRef.current = previewDuration }, [previewDuration])

  // Track the track object the user last started — used by the top "Preview continuo"
  // button to resume autoplay from THAT track instead of falling back to track 1
  // when state lookups race.
  const lastPlayedTrackRef = useRef(null)

  const handlePreviewFromCtx = (startTrack) => {
    console.log('[PreviewContinuo] click on', startTrack?.artist, '-', startTrack?.title)
    // Use the list currently visible to the user (label filter switches it)
    const activeList = labelFilter ? labelTracks : tracks
    const startIdx = activeList.findIndex(t =>
      (t.id && startTrack.id && t.id === startTrack.id) ||
      (t.title === startTrack.title && t.artist === startTrack.artist)
    )
    console.log('[PreviewContinuo] startIdx=', startIdx, 'listLen=', activeList.length)
    if (startIdx === -1) return
    const playlist = activeList.slice(startIdx)
    let current = 0

    // Reusar el mismo Audio element durante toda la sesión para que el autoplay
    // policy de Chrome no bloquee los tracks después del primero. new Audio()
    // en cada iteración requiere user-gesture; cambiar src sobre un elemento
    // ya unlocked funciona sin restricción.
    const initialVol = audioRef?.current?.volume ?? 0.8
    const sessionAudio = new Audio()
    sessionAudio.volume = initialVol
    sessionAudio.preload = 'auto'  // iOS background: load ahead so src swap is instant
    // Kill any previous audio (handlers + timer) before swapping in this session,
    // otherwise stale onended/onerror or a pending advance-timer can fire later
    // and cause "doble tema" (two audios overlapping).
    autoplayCancelRef?.current?.()
    if (audioRef?.current && audioRef.current !== sessionAudio) {
      try { audioRef.current.onended = null } catch {}
      try { audioRef.current.onerror = null } catch {}
      try { audioRef.current.pause() } catch {}
    }
    audioRef.current = sessionAudio
    sessionAudio.onended = () => { if (previewIntervalRef.current) clearTimeout(previewIntervalRef.current); current++; playNext() }
    sessionAudio.onerror = () => { current++; playNext() }
    // Register cancel so global Stop / new playback can kill this autoplay session
    if (autoplayCancelRef) {
      autoplayCancelRef.current = () => {
        if (previewIntervalRef.current) { clearTimeout(previewIntervalRef.current); previewIntervalRef.current = null }
        try { sessionAudio.onended = null } catch {}
        try { sessionAudio.onerror = null } catch {}
        try { sessionAudio.pause() } catch {}
        try { sessionAudio.src = '' } catch {}
      }
    }

    // MediaSession — exposes track metadata + AirPods/lockscreen actions.
    // CRITICAL: do NOT register a 'pause' handler. iOS sometimes invokes it
    // when the screen locks or app goes background, which kills our audio
    // element and breaks the autoplay chain. Let iOS use its default pause
    // (just suspends the element without telling us). For 'play', we DO
    // handle it because users expect the lockscreen play button to resume.
    const setupMediaSession = (track) => {
      if (!('mediaSession' in navigator)) return
      try {
        navigator.mediaSession.metadata = new window.MediaMetadata({
          title: track.title || '',
          artist: track.artist || '',
          album: track.label || track.genre || '',
          artwork: track.artwork_url ? [
            { src: track.artwork_url.replace('1400x1400', '256x256'), sizes: '256x256', type: 'image/jpeg' },
            { src: track.artwork_url.replace('1400x1400', '512x512'), sizes: '512x512', type: 'image/jpeg' },
          ] : [],
        })
        navigator.mediaSession.setActionHandler('play', () => {
          sessionAudio.play().catch(() => {})
          setIsAudioPlaying(true)
        })
        navigator.mediaSession.setActionHandler('nexttrack', () => {
          if (previewIntervalRef.current) clearTimeout(previewIntervalRef.current)
          current++
          playNext()
        })
        navigator.mediaSession.setActionHandler('previoustrack', () => {
          if (previewIntervalRef.current) clearTimeout(previewIntervalRef.current)
          if (current > 0) current--
          playNext()
        })
        try { navigator.mediaSession.setActionHandler('seekbackward', null) } catch {}
        try { navigator.mediaSession.setActionHandler('seekforward', null) } catch {}
        try { navigator.mediaSession.setActionHandler('seekto', null) } catch {}
      } catch {}
    }

    const playNext = async () => {
      if (current >= playlist.length) return
      const t = playlist[current]

      const startAudio = (url) => {
        // Cancel any pending advance — we're starting fresh with this src.
        if (previewIntervalRef.current) { clearTimeout(previewIntervalRef.current); previewIntervalRef.current = null }
        sessionAudio.src = url
        setPlayingFile(`discover-preview-${current}`)
        setPlayingId(t.id)
        lastPlayedTrackRef.current = t
        setNowPlaying({ filename: `discover-preview-${current}`, title: t.title, artist: t.artist, isPreview: true })
        setIsAudioPlaying(true)
        setupMediaSession(t)
        // Tell iOS the playback is active — without this, MediaSession may
        // think we're paused and let the audio session expire in background.
        try { if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'playing' } catch {}
        sessionAudio.play().then(() => {
          // CRITICAL for iOS background continuity: do NOT call pause() before
          // advancing. Just call playNext() which sets the new src on the same
          // element — iOS keeps the audio session alive across src swaps as
          // long as we never stop. If we pause(), iOS releases the session and
          // the next play() rejects silently in background.
          previewIntervalRef.current = setTimeout(() => { current++; playNext() }, previewDurationRef.current * 1000)
        }).catch(() => { current++; playNext() })
      }

      // 1) Use track's own preview URL (Beatport sample_url or Spotify preview_url)
      const directUrl = t.sample_url || t.preview_url
      if (directUrl) {
        startAudio(directUrl)
        return
      }

      // 2) Fallback: search iTunes
      const query = `${t.artist} ${t.title}`.trim()
      try {
        const res = await fetch(`https://itunes.apple.com/search?term=${encodeURIComponent(query)}&media=music&limit=1`)
        const data = await res.json()
        if (data.results?.[0]?.previewUrl) {
          startAudio(data.results[0].previewUrl)
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
    if (!track) return
    setDiscoverCtx(null)
    setRadioLoading(true)
    setRadioTracks([])
    radioTracksRef.current = []
    setRadioSeed(`${track.artist} - ${track.title}`)
    setRadioSource('radio')

    const ws = wsRef?.current
    if (!ws || ws.readyState !== 1) {
      toast('Conexión no disponible — recargá la página', 'error', 5000)
      setRadioLoading(false)
      setRadioTracks(null)  // hide the radio view
      return
    }
    toast(`Radio: buscando similar a ${track.artist} - ${track.title}`, 'info', 3000)

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
    setGenreSlug(genre ? genre.slug : '')  // sync URL ?genre=<slug>
    setLoading(true)
    setTracks([])
    try {
      const params = genre ? `?genre_id=${genre.beatport_id}&slug=${genre.slug}` : ''
      const forceParam = force ? `${params ? '&' : '?'}force=1` : ''
      const res = await fetch(`${API_BASE}/api/discover/chart${params}${forceParam}`)
      const data = await res.json()
      setTracks(data.tracks || [])
      setChartScrapedAt(data.scraped_at || 0)
      setChartSource(data.source || '')
    } catch (e) {
      console.error('Failed to load chart', e)
    } finally {
      setLoading(false)
    }
  }

  // Initial load: if URL has ?label=, ?genre=, ?playlist=, auto-load that view.
  // Otherwise load the default "All" Beatport chart.
  useEffect(() => {
    if (labelName) return           // label effect handles it
    if (genreSlug) return           // handled by genres effect below
    if (spotifyKey && discoverSource === 'spotify') return
    loadChart(null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Once genres load, if URL has ?genre=<slug>, auto-select it
  useEffect(() => {
    if (!genreSlug || genres.length === 0) return
    if (selectedGenre?.slug === genreSlug) return
    const match = genres.find(g => g.slug === genreSlug)
    if (match) loadChart(match)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [genres, genreSlug])

  // Once Spotify categories load, if URL has ?playlist=<key>, auto-select it
  useEffect(() => {
    if (!spotifyKey || spotifyCategories.length === 0) return
    if (selectedSpotifyCategory?.key === spotifyKey) return
    const match = spotifyCategories.find(c => c.key === spotifyKey)
    if (match) loadSpotifyPlaylist(match)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spotifyCategories, spotifyKey])

  // Filter by label: call the server-side Beatport scraper that fetches the
  // full label catalog page (up to 150 tracks in one request).
  const loadLabel = async (name) => {
    if (!name) return
    setLabelName(name)           // updates URL ?label=<name>
    setLabelLoading(true)
    setLabelTracks([])
    setLabelTrackCount(0)
    try {
      const res = await fetch(`${API_BASE}/api/discover/label?name=${encodeURIComponent(name)}`)
      const data = await res.json()
      // Assign synthetic ids so React keys and downloadQueue work
      const list = (data.tracks || []).map((t, i) => ({ ...t, id: t.id || `label-${name}-${i}` }))
      setLabelTracks(list)
      setLabelTrackCount(list.length)
    } catch (e) {
      console.error('Failed to load label', e)
      toast('Error al cargar el sello', 'error')
    } finally {
      setLabelLoading(false)
    }
  }

  const clearLabelFilter = () => {
    setLabelName('')
    setLabelTracks([])
    setLabelTrackCount(0)
  }

  // If the page loads with ?label=<name> in the URL, auto-fetch it.
  useEffect(() => {
    if (labelName && labelTracks.length === 0 && !labelLoading) {
      loadLabel(labelName)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Spotify connection state
  const [spotifyConnected, setSpotifyConnected] = useState(false)

  // Load Spotify categories on mount
  useEffect(() => {
    fetch(`${API_BASE}/api/discover/spotify/categories`).then(r => r.json()).then(data => {
      setSpotifyCategories(data.categories || data)
      if (data.spotify_connected !== undefined) setSpotifyConnected(data.spotify_connected)
    }).catch(() => {})
  }, [])

  const loadSpotifyPlaylist = async (cat) => {
    setSelectedSpotifyCategory(cat)
    setSpotifyKey(cat?.key || 'top50_argentina')  // sync URL ?playlist=<key>
    setLoading(true)
    setTracks([])
    try {
      const key = cat ? cat.key : 'top50_argentina'
      const res = await fetch(`${API_BASE}/api/discover/spotify/playlist?key=${key}`)
      const data = await res.json()
      setTracks(data.tracks || [])
      setSpotifyPlaylistName(data.name || cat?.name || '')
    } catch (e) {
      console.error('Failed to load Spotify playlist', e)
    } finally {
      setLoading(false)
    }
  }

  // React to collection/source changes. Reacts to BOTH `discoverSource`
  // (beatport vs spotify) AND `collection` (pop vs latin within spotify) so
  // the playlist list refreshes when toggling between POP and LATIN.
  const prevCollectionRef = useRef(collection)
  useEffect(() => {
    if (prevCollectionRef.current === collection) return
    prevCollectionRef.current = collection
    setTracks([])
    setLoading(true)
    if (discoverSource === 'beatport') {
      loadChart(selectedGenre)
    } else {
      fetch(`${API_BASE}/api/spotify/status`).then(r => r.json()).then(data => {
        setSpotifyConnected(data.connected)
        if (!data.connected) {
          window.location.href = `${API_BASE}/api/spotify/login`
          return
        }
      }).catch(() => {})
      // Pick first playlist whose category matches the current collection
      const firstInCategory = spotifyCategories.find(c => (c.category || 'pop') === collection)
      // If currently-selected category doesn't belong to this collection anymore, reset
      const stillValid = selectedSpotifyCategory &&
        (selectedSpotifyCategory.category || 'pop') === collection
      loadSpotifyPlaylist(stillValid ? selectedSpotifyCategory : (firstInCategory || null))
    }
  }, [collection])

  const clearDiscoverAudio = () => {
    setPlayingId(null)
    setPlayingFile(null)
    setNowPlaying(null)
    setIsAudioPlaying(false)
  }

  const setDiscoverAudio = (audio, track) => {
    if (audioRef.current && audioRef.current !== audio) {
      try { audioRef.current.onended = null } catch {}
      try { audioRef.current.onerror = null } catch {}
      try { audioRef.current.pause() } catch {}
    }
    audioRef.current = audio
    setPlayingId(track.id)
    lastPlayedTrackRef.current = track   // remember which track for top-bar Preview button
    setPlayingFile(`discover-${track.id}`)
    setNowPlaying({ filename: `discover-${track.id}`, title: track.title, artist: track.artist, isPreview: true })
    setIsAudioPlaying(true)
  }

  const playPreview = (track) => {
    // Kill the autoplay session entirely (timer + handlers + sessionAudio).
    // Without removing onended/onerror, setting src='' below could fire
    // sessionAudio.onerror → playNext() → resumes autoplay over the user's pick.
    autoplayCancelRef?.current?.()
    autoplayCancelRef && (autoplayCancelRef.current = null)
    if (previewIntervalRef.current) {
      clearTimeout(previewIntervalRef.current)
      previewIntervalRef.current = null
    }

    if (playingId === track.id) {
      if (audioRef.current) {
        try { audioRef.current.onended = null } catch {}
        try { audioRef.current.onerror = null } catch {}
        try { audioRef.current.pause() } catch {}
        audioRef.current = null
      }
      clearDiscoverAudio()
      return
    }
    if (audioRef.current) {
      try { audioRef.current.onended = null } catch {}
      try { audioRef.current.onerror = null } catch {}
      try { audioRef.current.pause() } catch {}
      try { audioRef.current.src = '' } catch {}
    }

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
    // Always log the click in Discover to pending so we have a persistent record
    // for later cross-reference in Descargas. Removed automatically when the track
    // actually completes (see search_dl_status handler).
    addToPending({ artist: track.artist, title: track.title, source: 'discover', collection })

    // Mobile: no SoulSeek available, send to pending queue for later download on desktop
    const isMobile = window.innerWidth < 768 || /iPhone|iPad|iPod|Android/i.test(navigator.userAgent)
    if (isMobile || !wsRef?.current || wsRef.current.readyState !== 1 || !username || !password) {
      setDownloadQueue(prev => ({ ...prev, [track.id]: { status: 'done', message: 'Agregado a pendientes' } }))
      return
    }
    // Dedupe consecutive identical parenthetical groups before stripping brackets
    // (charts sometimes return "Title (feat. X) (feat. X)" — search needs clean text)
    const cleanTitle = (track.title || '').replace(/(\([^)]*\)|\[[^\]]*\])\s*\1/g, '$1')
    const query = `${track.artist} - ${cleanTitle}`.replace(/[()[\]{}]/g, '')
    setDownloadQueue(prev => ({ ...prev, [track.id]: { status: 'searching', message: `Buscando...` } }))

    // Ranked list of variants to try in order (calidad → fuentes). Filled
    // when search_results arrives. If a variant fails all its sources,
    // pasamos al siguiente de la lista antes de rendirnos.
    let ranked = []
    let rankIdx = -1
    let currentFilename = ''
    let variantWatchdog = null

    const clearVariantWatchdog = () => {
      if (variantWatchdog) { clearTimeout(variantWatchdog); variantWatchdog = null }
    }

    const qScore = (r) => {
      const ext = (r.ext || '').toLowerCase()
      const br = r.bitrate || 0
      if (ext === 'flac' || ext === 'wav') return 1000
      if (ext === 'aiff' || ext === 'aif') return 900
      if (ext === 'mp3') return 300 + Math.min(br, 320)
      return 100
    }

    const dispatchPick = (idx) => {
      clearVariantWatchdog()
      if (idx >= ranked.length) {
        console.warn('[DL] all variants exhausted', { track: track.title, tried: ranked.length })
        setDownloadQueue(prev => ({ ...prev, [track.id]: { status: 'error', message: `Sin éxito en ${ranked.length} variantes` } }))
        addToPending({ artist: track.artist, title: track.title, source: 'discover', collection })
        wsRef.current?.removeEventListener('message', handler)
        return
      }
      rankIdx = idx
      const best = ranked[idx]
      currentFilename = best.filename
      const bestSources = Array.isArray(best.sources) && best.sources.length > 0 ? best.sources : [best]
      setDownloadQueue(prev => ({ ...prev, [track.id]: { status: 'downloading', message: 'Descargando' } }))

      const sendViaWs = (reason) => {
        console.info('[DL] via=ws', { reason, filename: best.filename })
        wsRef.current?.send(JSON.stringify({ type: 'download_single', username, password, result: best, app_user: authUser?.name || '', collection }))
      }

      if (agentConnected && agentHasSlsk) {
        console.info('[DL] via=agent', { filename: best.filename })
        agentFetch('slsk-download', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            username, password,
            filename: best.filename,
            sources: bestSources,
            callback_url: `${API_BASE}/api/agent-dl-callback`,
            collection,
          }),
        }).catch(err => {
          console.warn('[DL] agent failed, falling back to ws', err?.message || err)
          sendViaWs('agent-error')
        })
      } else {
        sendViaWs(agentConnected ? 'no-aioslsk' : 'agent-disconnected')
      }

      // Watchdog: if we don't even get a queued/downloading status within 90s,
      // treat the variant as stuck and advance.
      variantWatchdog = setTimeout(() => {
        console.warn('[DL] variant pre-status timeout, advancing', { filename: best.filename })
        dispatchPick(idx + 1)
      }, 90000)
    }

    // Listen for search results + download progress
    const handler = (e) => {
      try {
        const data = JSON.parse(e.data)
        if (data.type === 'search_results' && rankIdx < 0) {
          const results = data.results || []
          const hasDecentPeer = (r) => {
            const srcs = Array.isArray(r.sources) && r.sources.length ? r.sources : [r]
            return srcs.some(s => (s.queue || 0) <= 2000)
          }
          const viable = results.filter(hasDecentPeer)
          const pool = viable.length ? viable : results
          ranked = [...pool].sort((a, b) => {
            const dq = qScore(b) - qScore(a)
            if (dq) return dq
            const ds = (b.source_count || 1) - (a.source_count || 1)
            if (ds) return ds
            return 0
          })
          console.info('[DL] search_results', { track: track.title, total: results.length, viable: viable.length, ranked: ranked.length })
          if (ranked.length === 0) {
            setDownloadQueue(prev => ({ ...prev, [track.id]: { status: 'not_found', message: 'No encontrado en SoulSeek' } }))
            addToPending({ artist: track.artist, title: track.title, source: 'discover', collection })
            wsRef.current.removeEventListener('message', handler)
            return
          }
          dispatchPick(0)
        }
        if (data.type === 'search_dl_status') {
          const fname = data.filename || ''
          if (currentFilename && fname === currentFilename) {
            if (data.status === 'queued' || data.status === 'downloading') {
              // Server signaled progress — extend the watchdog (slow peers OK,
              // truly-stuck transfers still get caught at 3 min).
              clearVariantWatchdog()
              variantWatchdog = setTimeout(() => {
                console.warn('[DL] variant stuck after status, advancing', { fname, lastStatus: data.status })
                dispatchPick(rankIdx + 1)
              }, 180000)
            } else if (data.status === 'completed') {
              clearVariantWatchdog()
              setDownloadQueue(prev => ({ ...prev, [track.id]: { status: 'done', message: 'Descargado' } }))
              fetch(`${API_BASE}/api/metadata?user=${encodeURIComponent(authUser?.name || '')}&collection=${collection || 'edm'}`).then(r => r.json()).then(setLibraryManifest).catch(() => {})
              wsRef.current.removeEventListener('message', handler)
            } else if (data.status === 'error') {
              console.warn('[DL] variant error from server, advancing', { fname, error: data.error })
              dispatchPick(rankIdx + 1)
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

    // Timeout after 160s. Must exceed server worst-case: up to 3 queries ×
    // (MANUAL_SEARCH_WAIT 35s + MANUAL_GRACE_WAIT 10s) = 135s, plus semaphore
    // wait time when multiple searches are queued. Shorter timeouts would
    // unregister the handler before results arrive, breaking auto-download.
    setTimeout(() => {
      setDownloadQueue(prev => {
        const curr = prev[track.id]
        if (curr?.status === 'searching') {
          wsRef.current?.removeEventListener('message', handler)
          clearVariantWatchdog()
          addToPending({ artist: track.artist, title: track.title, source: 'discover', collection })
          return { ...prev, [track.id]: { status: 'not_found', message: 'No encontrado' } }
        }
        return prev
      })
    }, 160000)
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
  const spotifyAccent = selectedSpotifyCategory ? (selectedSpotifyCategory.color || '#1DB954') : '#1DB954'
  const accentColor = discoverSource === 'spotify' ? spotifyAccent : (selectedGenre ? (genreAccents[selectedGenre.name] || '#22c55e') : '#22c55e')

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-[var(--bg-app)] relative">
      {/* Header with artwork mosaic background */}
      <div className="flex-shrink-0 relative overflow-hidden h-28 md:h-36">
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

        <div className="relative h-full flex flex-col justify-end gap-2 md:gap-3 px-4 md:px-8 pb-3 md:pb-4">
          <div className="flex items-start justify-between">
            <div>
              <div className="flex items-center gap-3 md:gap-5 mt-1">
                <h1 className="text-xl md:text-3xl font-bold text-white tracking-tight">
                  {discoverSource === 'beatport'
                    ? (selectedGenre ? selectedGenre.name : 'Top 100')
                    : (spotifyPlaylistName || selectedSpotifyCategory?.name || 'Top 50 Argentina')
                  }
                </h1>
                {tracks.length > 0 && <span className="text-sm text-white/40">{tracks.length} tracks</span>}
                {tracks.length > 0 && chartScrapedAt > 0 && discoverSource === 'beatport' && (
                  <span
                    className="text-xs text-white/40"
                    title={`Source: ${chartSource}`}
                  >
                    {(() => {
                      const d = new Date(chartScrapedAt)
                      const dd = String(d.getDate()).padStart(2, '0')
                      const mm = String(d.getMonth() + 1).padStart(2, '0')
                      const hh = String(d.getHours()).padStart(2, '0')
                      const mi = String(d.getMinutes()).padStart(2, '0')
                      const today = new Date()
                      const isToday = d.toDateString() === today.toDateString()
                      const datePart = isToday ? 'hoy' : `${dd}/${mm}`
                      return `· actualizado ${datePart} ${hh}:${mi}`
                    })()}
                  </span>
                )}
                {loading && <span className="text-sm text-white/40">Cargando...</span>}
                {!loading && discoverSource === 'beatport' && (
                  <button
                    onClick={async () => {
                      if (agentConnected) {
                        try {
                          toast('Scrapeando Beatport...', 'warning', 5000)
                          await agentFetch('refresh-charts', { method: 'POST' })
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
                {!loading && discoverSource === 'spotify' && (
                  <>
                    <button
                      onClick={() => loadSpotifyPlaylist(selectedSpotifyCategory)}
                      className="p-2 rounded-lg hover:bg-white/20 transition-all active:scale-95"
                      title="Refrescar playlist"
                    >
                      <svg className="w-5 h-5 text-white/60" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                      </svg>
                    </button>
                    {!spotifyConnected && (
                      <a href={`${API_BASE}/api/spotify/login`}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium bg-[#1DB954] text-white hover:bg-[#1ed760] transition-all active:scale-95"
                      >
                        <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor"><path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z"/></svg>
                        Conectar Spotify
                      </a>
                    )}
                    {spotifyConnected && (
                      <span className="flex items-center gap-1 text-xs text-[#1DB954]">
                        <span className="w-2 h-2 rounded-full bg-[#1DB954]" />
                        Conectado
                      </span>
                    )}
                  </>
                )}
              </div>
            </div>
            {/* Featured artwork */}
            {tracks[0]?.artwork_url && (
              <div className="hidden sm:flex gap-2">
                {tracks.slice(0, 3).map((t, i) => t.artwork_url && (
                  <img key={i} src={t.artwork_url.replace('1400x1400', '250x250')} alt=""
                    className="w-12 h-12 md:w-16 md:h-16 rounded-lg object-cover ring-1 ring-white/10 shadow-xl"
                    style={{opacity: 1 - i * 0.2, transform: `rotate(${(i - 1) * 3}deg)`}}
                  />
                ))}
              </div>
            )}
          </div>

          {/* Category pills - single line with horizontal scroll */}
          <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-none w-full flex-nowrap">
            {discoverSource === 'beatport' ? (<>
              <button
                onClick={() => loadChart(null)}
                className={`flex-shrink-0 px-3 py-1.5 rounded-lg text-xs font-medium transition-all duration-200 active:scale-95 ${
                  !selectedGenre ? 'text-white font-semibold' : 'text-white/50 hover:text-white'
                }`}
                style={!selectedGenre ? { background: `rgba(${GENRE_COLORS[0].rgb}, 0.3)` } : {}}
              >
                All
              </button>
              {(() => {
                let clicks = {}
                try { clicks = JSON.parse(localStorage.getItem('beatport_genre_clicks') || '{}') } catch {}
                const sorted = genres
                  .map((g, i) => ({ g, i, n: clicks[g.name] || 0 }))
                  .sort((a, b) => b.n - a.n || a.i - b.i)
                return sorted.map(({ g, i: gi }) => {
                  const isActive = selectedGenre?.name === g.name
                  const c = GENRE_COLORS[gi % GENRE_COLORS.length]
                  return (
                    <button
                      key={g.name}
                      onClick={() => {
                        try {
                          const cur = JSON.parse(localStorage.getItem('beatport_genre_clicks') || '{}')
                          cur[g.name] = (cur[g.name] || 0) + 1
                          localStorage.setItem('beatport_genre_clicks', JSON.stringify(cur))
                        } catch {}
                        loadChart(g)
                      }}
                      className={`flex-shrink-0 px-3 py-1.5 rounded-lg text-xs font-medium transition-all duration-200 active:scale-95 ${
                        isActive ? 'text-white font-semibold' : 'text-white/50 hover:text-white'
                      }`}
                      style={isActive ? { background: `rgba(${c.rgb}, 0.3)` } : {}}
                    >
                      {g.name}
                    </button>
                  )
                })
              })()}
            </>) : (<>
              {(() => {
                let clicks = {}
                try { clicks = JSON.parse(localStorage.getItem('spotify_cat_clicks') || '{}') } catch {}
                const filtered = spotifyCategories.filter(c => (c.category || 'pop') === collection)
                const sorted = filtered
                  .map((c, i) => ({ c, i, n: clicks[c.key] || 0 }))
                  .sort((a, b) => b.n - a.n || a.i - b.i)
                  .map(x => x.c)
                return sorted.map((cat) => {
                  const isActive = selectedSpotifyCategory?.key === cat.key
                  return (
                    <button
                      key={cat.key}
                      onClick={() => {
                        try {
                          const cur = JSON.parse(localStorage.getItem('spotify_cat_clicks') || '{}')
                          cur[cat.key] = (cur[cat.key] || 0) + 1
                          localStorage.setItem('spotify_cat_clicks', JSON.stringify(cur))
                        } catch {}
                        loadSpotifyPlaylist(cat)
                      }}
                      className={`flex-shrink-0 px-3 py-1.5 rounded-lg text-xs font-medium transition-all duration-200 active:scale-95 ${
                        isActive ? 'text-white font-semibold' : 'text-white/50 hover:text-white'
                      }`}
                      style={isActive ? { background: `${cat.color}40` } : {}}
                    >
                      {cat.name}
                    </button>
                  )
                })
              })()}
            </>)}
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
          {/* Preview continuo sub-bar */}
          <div className="flex-shrink-0 flex items-center gap-2 px-3 md:px-6 py-2 border-b border-[var(--border-color)] bg-[var(--bg-panel)]/50">
            <button
              onClick={() => {
                const list = labelFilter ? labelTracks : tracks
                if (list.length === 0) return
                // Priority: last-played track (ref survives state races) → track with
                // matching playingId → first track in the list.
                const lastPlayed = lastPlayedTrackRef.current
                let startTrack = null
                if (lastPlayed) {
                  startTrack = list.find(t => t.id === lastPlayed.id) ||
                               list.find(t => t.title === lastPlayed.title && t.artist === lastPlayed.artist)
                }
                if (!startTrack && playingId) {
                  startTrack = list.find(t => t.id === playingId)
                }
                if (!startTrack) startTrack = list[0]
                handlePreviewFromCtx(startTrack)
              }}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium bg-purple-500/15 text-purple-400 hover:bg-purple-500/25 transition-all active:scale-95"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span className="hidden sm:inline">Preview continuo</span>
              <span className="sm:hidden">Preview</span>
            </button>
            {/* Duration selector (30/60/90/120 s per track) */}
            <div className="flex items-center rounded-full bg-[var(--bg-input)] p-0.5">
              {[30, 60, 90, 120].map(secs => (
                <button
                  key={secs}
                  onClick={() => setPreviewDuration(secs)}
                  className={`px-2.5 py-1 rounded-full text-xs font-medium transition-all duration-200 ${
                    previewDuration === secs
                      ? 'bg-purple-500/30 text-purple-300'
                      : 'text-gray-400 hover:text-white'
                  }`}
                  title={`${secs}s por tema`}
                >
                  {secs}s
                </button>
              ))}
            </div>
            {playingId && (
              <button
                onClick={() => { if (audioRef?.current) audioRef.current.pause(); clearDiscoverAudio(); if (previewIntervalRef.current) clearTimeout(previewIntervalRef.current) }}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium bg-red-500/15 text-red-400 hover:bg-red-500/25 transition-all active:scale-95"
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 10a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1v-4z" />
                </svg>
                Stop
              </button>
            )}
            <span className="text-xs text-[var(--text-muted)]">{(labelFilter ? labelTracks : tracks).length} tracks</span>
          </div>
          {/* Label filter banner */}
          {labelFilter && (
            <div className="flex-shrink-0 flex items-center justify-between gap-3 px-3 md:px-6 py-2 bg-[var(--color-accent)]/10 border-b border-[var(--color-accent)]/30">
              <div className="flex items-center gap-2 min-w-0">
                <svg className="w-4 h-4 text-[var(--color-accent)] flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A2 2 0 013 12V7a4 4 0 014-4z" />
                </svg>
                <span className="text-sm text-[var(--text-primary)] font-medium truncate">
                  Sello: <span className="text-[var(--color-accent)]">{labelFilter.name}</span>
                </span>
                {labelLoading ? (
                  <span className="text-xs text-gray-400 flex items-center gap-1.5">
                    <div className="w-3 h-3 border-2 border-gray-400 border-t-transparent rounded-full animate-spin" />
                    Buscando en todos los géneros...
                  </span>
                ) : (
                  <span className="text-xs text-gray-400">{labelFilter.count} temas encontrados</span>
                )}
              </div>
              <button
                onClick={clearLabelFilter}
                className="flex-shrink-0 flex items-center gap-1 px-3 py-1 rounded-full text-xs text-gray-400 hover:text-white hover:bg-white/10 transition-all duration-200 active:scale-95"
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
                Limpiar
              </button>
            </div>
          )}
          <div className="px-3 md:px-6 py-2 md:py-3">
            {(labelFilter ? labelTracks : tracks).map((t, i) => {
              const isPlaying = playingId === t.id
              return (
                <SwipeableRow key={t.id || i} onReveal={() => setDiscoverCtx({ x: window.innerWidth / 2, y: window.innerHeight - 100, track: t })}>
                <div
                  onClick={() => playPreview(t)}
                  onContextMenu={(e) => { e.preventDefault(); setDiscoverCtx({ x: e.clientX, y: e.clientY, track: t }) }}
                  className={`group flex items-center gap-2 md:gap-4 px-2 md:px-4 py-2 md:py-3 rounded-xl transition-all duration-200 cursor-pointer select-none ${
                  isPlaying ? 'bg-green-500/10 ring-1 ring-green-500/30' : 'hover:bg-[var(--bg-hover)]'
                }`}>
                  {/* Position number */}
                  <div className="w-6 md:w-8 flex-shrink-0 text-center">
                    <span className={`text-xs md:text-sm font-mono ${isPlaying ? 'text-green-400 font-bold' : 'text-gray-600'}`}>
                      {t.position || i + 1}
                    </span>
                  </div>

                  {/* Artwork (purely visual — click handler is on the whole row) */}
                  <div
                    className={`w-10 h-10 md:w-12 md:h-12 flex-shrink-0 rounded-lg overflow-hidden relative transition-all duration-200 ${
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
                      <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
                        <div className="flex items-end gap-0.5 h-4">
                          <div className="w-1 bg-green-400 rounded-full animate-pulse" style={{height: '60%', animationDelay: '0ms'}} />
                          <div className="w-1 bg-green-400 rounded-full animate-pulse" style={{height: '100%', animationDelay: '150ms'}} />
                          <div className="w-1 bg-green-400 rounded-full animate-pulse" style={{height: '40%', animationDelay: '300ms'}} />
                          <div className="w-1 bg-green-400 rounded-full animate-pulse" style={{height: '80%', animationDelay: '450ms'}} />
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Track info */}
                  <div className="flex-1 min-w-0">
                    <div className={`text-sm md:text-base font-medium truncate flex items-center gap-1.5 ${isPlaying ? 'text-green-400' : 'text-[var(--text-primary)]'}`}>
                      {t.title}
                      {isInLibrary(t) && <span className="flex-shrink-0 w-2 h-2 rounded-full bg-emerald-500" title="En tu biblioteca" />}
                    </div>
                    <div className="text-xs md:text-sm text-gray-500 truncate mt-0.5">{t.artist}</div>
                  </div>

                  {/* Metadata pills */}
                  <div className="hidden xl:flex items-center gap-2 flex-shrink-0">
                    {t.genre && (
                      <span className="px-2 py-0.5 rounded-full bg-white/5 text-xs text-gray-400">{t.genre}</span>
                    )}
                    {t.label && (
                      <button
                        onClick={(e) => { e.stopPropagation(); loadLabel(t.label) }}
                        className="px-2 py-0.5 rounded-full bg-white/5 text-xs text-gray-500 max-w-28 truncate hover:bg-[var(--color-accent)] hover:text-[var(--color-accent-text)] transition-colors duration-200 active:scale-95 cursor-pointer"
                        title={`Ver temas de ${t.label}`}
                      >
                        {t.label}
                      </button>
                    )}
                  </div>

                  {/* BPM & Key - hidden on mobile */}
                  <div className="hidden md:flex items-center gap-3 flex-shrink-0">
                    <span className="text-xs text-gray-500 font-mono w-8 text-center">{t.bpm || '-'}</span>
                    <span className={`text-xs font-mono px-2 py-0.5 rounded ${t.key ? 'bg-amber-500/10 text-amber-400' : 'text-gray-700'}`}>{t.key || '-'}</span>
                    <span className="text-xs text-gray-600 w-10 text-center">{formatDuration(t.duration_ms)}</span>
                  </div>

                  {/* Heart button — guests save favs to localStorage */}
                  <button
                    onClick={(e) => { e.stopPropagation(); toggleFavorite?.(t) }}
                    className="flex-shrink-0 flex items-center justify-center w-7 h-7 md:w-8 md:h-8 rounded-full transition-all duration-200 active:scale-90"
                    title={isFavorite?.(t) ? 'Quitar de favoritos' : 'Marcar como favorito'}
                  >
                    <svg
                      className={`w-4 h-4 md:w-4.5 md:h-4.5 transition-colors duration-200 ${isFavorite?.(t) ? 'text-pink-500' : 'text-gray-500 hover:text-pink-400'}`}
                      fill={isFavorite?.(t) ? 'currentColor' : 'none'}
                      stroke="currentColor"
                      strokeWidth={isFavorite?.(t) ? 0 : 2}
                      viewBox="0 0 24 24"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
                    </svg>
                  </button>

                  {/* Action button — hidden in guest mode (can't download without login) */}
                  {!isGuest && (() => {
                    const dl = downloadQueue[t.id]
                    const alreadyInLibrary = !dl && !clearedTrackIds.has(t.id) && isInLibrary(t)
                    const clearBtn = (
                      <button
                        onClick={(e) => { e.stopPropagation(); cleanTrackState(t) }}
                        title="Limpiar: quita de pendientes y permite re-descargar"
                        className="flex-shrink-0 w-7 h-7 flex items-center justify-center rounded-full text-gray-500 hover:text-red-400 hover:bg-red-500/10 transition-colors duration-150 active:scale-90"
                      >
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    )
                    if (alreadyInLibrary) return (
                      <div className="flex-shrink-0 flex items-center gap-1">
                        <span
                          title="Ya está en tu biblioteca"
                          className="flex items-center gap-1 px-2 md:px-3 py-1.5 md:py-2 rounded-full text-xs font-medium text-green-400 bg-green-500/10 border border-green-500/20"
                        >
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                          </svg>
                          <span className="hidden md:inline">Descargado</span>
                        </span>
                        {clearBtn}
                      </div>
                    )
                    if (!dl) return (
                      <button
                        onClick={(e) => { e.stopPropagation(); searchAndDownload(t) }}
                        className="flex-shrink-0 flex items-center gap-1 md:gap-1.5 px-2 md:px-3 py-1.5 md:py-2 rounded-full text-xs font-medium transition-all duration-200 active:scale-95 opacity-60 group-hover:opacity-100"
                        style={{ background: 'var(--color-accent)', color: 'var(--color-accent-text)' }}
                      >
                        {/* Mobile: queue icon (adds to Cloudinary pending for later PC download). Desktop: download icon. */}
                        <svg className="w-3.5 h-3.5 md:hidden" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                        </svg>
                        <svg className="w-3.5 h-3.5 hidden md:block" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                        </svg>
                        <span className="hidden sm:inline md:hidden">A cola</span>
                        <span className="hidden md:inline">Descargar</span>
                      </button>
                    )
                    if (dl.status === 'searching') return (
                      <div className="flex-shrink-0 flex items-center gap-1">
                        <span className="flex items-center gap-1.5 px-2 md:px-3 py-1.5 md:py-2 rounded-full text-xs text-yellow-400 animate-pulse">
                          <div className="w-3 h-3 border-2 border-yellow-400 border-t-transparent rounded-full animate-spin" />
                          <span className="hidden sm:inline">Buscando...</span>
                        </span>
                        {clearBtn}
                      </div>
                    )
                    if (dl.status === 'downloading') return (
                      <div className="flex-shrink-0 flex items-center gap-1">
                        <span className="flex items-center gap-1.5 px-2 md:px-3 py-1.5 md:py-2 rounded-full text-xs text-[var(--color-accent)] animate-pulse">
                          <div className="w-3 h-3 border-2 border-[var(--color-accent)] border-t-transparent rounded-full animate-spin" />
                          <span className="hidden sm:inline">Descargando</span>
                        </span>
                        {clearBtn}
                      </div>
                    )
                    if (dl.status === 'done') return (
                      <div className="flex-shrink-0 flex items-center gap-1">
                        <span className={`flex items-center gap-1.5 px-2 md:px-3 py-1.5 md:py-2 rounded-full text-xs ${dl.message === 'Agregado a pendientes' ? 'text-yellow-400 bg-yellow-500/10' : 'text-green-400 bg-green-500/10'}`}>
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={dl.message === 'Agregado a pendientes' ? 'M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z' : 'M5 13l4 4L19 7'} />
                          </svg>
                          <span className="hidden sm:inline">{dl.message === 'Agregado a pendientes' ? 'Pendiente' : 'Listo'}</span>
                        </span>
                        {clearBtn}
                      </div>
                    )
                    if (dl.status === 'not_found') return (
                      <button
                        onClick={(e) => { e.stopPropagation(); setDownloadQueue(prev => { const n = {...prev}; delete n[t.id]; return n }); searchAndDownload(t) }}
                        className="flex-shrink-0 flex items-center gap-1.5 px-2 md:px-3 py-1.5 md:py-2 rounded-full text-xs text-gray-500 bg-gray-800 hover:bg-gray-700 transition-all"
                      >
                        <span className="hidden sm:inline">No encontrado -</span> Reintentar
                      </button>
                    )
                    return (
                      <button
                        onClick={(e) => { e.stopPropagation(); setDownloadQueue(prev => { const n = {...prev}; delete n[t.id]; return n }) }}
                        className="flex-shrink-0 flex items-center gap-1.5 px-2 md:px-3 py-1.5 md:py-2 rounded-full text-xs text-red-400 bg-red-500/10 hover:bg-red-500/20 transition-all"
                      >
                        Error
                      </button>
                    )
                  })()}
                </div>
                </SwipeableRow>
              )
            })}
          </div>
        </div>
      )}

      {/* Radio view - overlays the track list */}
      {radioTracks !== null && (
        <div className="absolute inset-0 z-20 bg-[var(--bg-app)] flex flex-col">
          {/* Radio header */}
          <div className="flex-shrink-0 px-3 md:px-6 py-3 md:py-4 border-b border-[var(--border-color)] bg-[var(--bg-panel)]">
            <div className="flex items-center gap-3">
              <button
                onClick={() => { setRadioTracks(null); setRadioSeed(''); setRadioSource('') }}
                className="p-1.5 rounded-lg text-gray-400 hover:text-[var(--text-primary,white)] hover:bg-gray-700 transition-all duration-200"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
              </button>
              <div className="min-w-0 flex-1">
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
              <div className="px-3 md:px-6 py-2 md:py-3">
                {radioTracks.map((t, i) => {
                  const isPlaying = playingId === t.id
                  return (
                    <SwipeableRow key={t.id || i} onReveal={() => setDiscoverCtx({ x: window.innerWidth / 2, y: window.innerHeight - 100, track: t })}>
                    <div
                      onContextMenu={(e) => { e.preventDefault(); setDiscoverCtx({ x: e.clientX, y: e.clientY, track: t }) }}
                      className={`group flex items-center gap-2 md:gap-4 px-2 md:px-4 py-2 md:py-3 rounded-xl transition-all duration-200 ${
                      isPlaying ? 'bg-green-500/10 ring-1 ring-green-500/30' : 'hover:bg-[var(--bg-hover)]'
                    }`}>
                      <div className="w-6 md:w-8 flex-shrink-0 text-center">
                        <span className={`text-xs md:text-sm font-mono group-hover:hidden ${isPlaying ? 'text-green-400 font-bold' : 'text-gray-600'}`}>
                          {t.position || i + 1}
                        </span>
                        <PlayPauseBtn isPlaying={isPlaying} onClick={() => playPreview(t)} className={`hidden group-hover:flex ${isPlaying ? '!text-green-400' : ''}`} />
                      </div>
                      <button
                        onClick={() => playPreview(t)}
                        onContextMenu={(e) => e.preventDefault()}
                        className={`w-10 h-10 md:w-12 md:h-12 flex-shrink-0 rounded-lg overflow-hidden relative transition-all duration-200 select-none ${
                          isPlaying ? 'ring-2 ring-green-400 shadow-lg shadow-green-500/20' : 'ring-1 ring-white/10'
                        }`}
                        style={{ WebkitTouchCallout: 'none', WebkitUserSelect: 'none' }}
                        title={isPlaying ? 'Pausar' : 'Reproducir preview'}
                      >
                        {t.artwork_url ? (
                          <img src={t.artwork_url} alt="" className="w-full h-full object-cover" loading="lazy" />
                        ) : (
                          <div className="w-full h-full bg-gradient-to-br from-gray-700 to-gray-800 flex items-center justify-center">
                            <svg className="w-5 h-5 text-gray-500" fill="currentColor" viewBox="0 0 24 24"><path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55C7.79 13 6 14.79 6 17s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z"/></svg>
                          </div>
                        )}
                        {isPlaying ? (
                          <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
                            <div className="flex items-end gap-0.5 h-4">
                              <div className="w-1 bg-green-400 rounded-full animate-pulse" style={{height: '60%', animationDelay: '0ms'}} />
                              <div className="w-1 bg-green-400 rounded-full animate-pulse" style={{height: '100%', animationDelay: '150ms'}} />
                              <div className="w-1 bg-green-400 rounded-full animate-pulse" style={{height: '40%', animationDelay: '300ms'}} />
                              <div className="w-1 bg-green-400 rounded-full animate-pulse" style={{height: '80%', animationDelay: '450ms'}} />
                            </div>
                          </div>
                        ) : (
                          // Play overlay — indica que el artwork es clickeable para preview
                          <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-70 hover:opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity pointer-events-none">
                            <svg className="w-5 h-5 md:w-6 md:h-6 text-white drop-shadow" fill="currentColor" viewBox="0 0 24 24">
                              <path d="M8 5v14l11-7z" />
                            </svg>
                          </div>
                        )}
                      </button>
                      <div className="flex-1 min-w-0">
                        <div className={`text-xs md:text-sm font-medium truncate ${isPlaying ? 'text-green-400' : 'text-[var(--text-primary)]'}`}>{t.title}</div>
                        <div className="text-xs text-gray-500 truncate mt-0.5">{t.artist}</div>
                      </div>
                      <div className="hidden xl:flex items-center gap-2 flex-shrink-0">
                        {t.genre && <span className="px-2 py-0.5 rounded-full bg-white/5 text-xs text-gray-400">{t.genre}</span>}
                      </div>
                      <div className="hidden md:flex items-center gap-3 flex-shrink-0">
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
                            className="flex-shrink-0 flex items-center gap-1 md:gap-1.5 px-2 md:px-3 py-1.5 md:py-2 rounded-full text-xs font-medium transition-all duration-200 active:scale-95 opacity-60 group-hover:opacity-100"
                            style={{ background: 'var(--color-accent)', color: 'var(--color-accent-text)' }}
                          >
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                            </svg>
                            <span className="hidden sm:inline">Descargar</span>
                          </button>
                        )
                        if (dl.status === 'searching') return <span className="flex-shrink-0 text-xs text-yellow-400 animate-pulse"><span className="hidden sm:inline">Buscando...</span><span className="sm:hidden">...</span></span>
                        if (dl.status === 'downloading') return <span className="flex-shrink-0 text-xs text-[var(--color-accent)] animate-pulse"><span className="hidden sm:inline">Descargando</span><span className="sm:hidden">...</span></span>
                        if (dl.status === 'done') return <span className="flex-shrink-0 text-xs text-green-400">Listo</span>
                        if (dl.status === 'not_found') return (
                          <button onClick={() => { setDownloadQueue(prev => { const n = {...prev}; delete n[t.id]; return n }); searchAndDownload(t) }}
                            className="flex-shrink-0 text-xs text-gray-500 hover:text-gray-300">Reintentar</button>
                        )
                        return <span className="flex-shrink-0 text-xs text-red-400">Error</span>
                      })()}
                    </div>
                    </SwipeableRow>
                  )
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Context menu / Bottom sheet */}
      {discoverCtx && (<>
        {/* Backdrop */}
        <div className="fixed inset-0 z-40 bg-black/50 md:bg-transparent animate-fade-in" onClick={() => setDiscoverCtx(null)} />

        {/* Desktop: positioned dropdown */}
        <div
          ref={discoverCtxRef}
          className="hidden md:block fixed z-50 bg-[var(--bg-panel)] border border-gray-700 rounded-lg shadow-2xl py-1 min-w-48"
          style={{ left: Math.min(discoverCtx.x, window.innerWidth - 220), top: Math.min(discoverCtx.y, window.innerHeight - 200) }}
        >
          <div className="px-3 py-1.5 text-xs text-gray-500 border-b border-[var(--border-color)] truncate">
            {discoverCtx.track?.artist} - {discoverCtx.track?.title}
          </div>
          {isInLibrary(discoverCtx.track) && !clearedTrackIds.has(discoverCtx.track?.id) ? (
            agentConnected ? (
              <button
                onClick={() => {
                  const loc = isInLibrary.findLocation(discoverCtx.track) || { folder: '', file: '' }
                  agentFetch(`open-folder?folder=${encodeURIComponent(loc.folder)}&file=${encodeURIComponent(loc.file)}`).catch(() => {})
                  setDiscoverCtx(null)
                }}
                className="w-full text-left px-3 py-2 text-sm text-green-400 hover:bg-[var(--bg-hover)] hover:text-green-300 transition-colors flex items-center gap-2"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V7z" />
                </svg>
                Abrir en Explorer
              </button>
            ) : (
              <div className="w-full text-left px-3 py-2 text-sm text-green-400 flex items-center gap-2 cursor-default">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" /></svg>
                Ya descargado
              </div>
            )
          ) : (
            <button onClick={() => { searchAndDownload(discoverCtx.track); setDiscoverCtx(null) }}
              className="w-full text-left px-3 py-2 text-sm text-gray-300 hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary,white)] transition-colors flex items-center gap-2">
              <svg className="w-4 h-4 text-[var(--color-accent)]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
              Descargar
            </button>
          )}
          <div className="px-3 py-1.5 text-[10px] uppercase tracking-wider text-gray-500 border-t border-[var(--border-color)]">Preview continuo desde este tema</div>
          {[30, 60, 90, 120].map(secs => (
            <button
              key={secs}
              onClick={() => { setPreviewDuration(secs); handlePreviewFromCtx(discoverCtx.track); setDiscoverCtx(null) }}
              className="w-full text-left px-3 py-2 text-sm text-gray-300 hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary,white)] transition-colors flex items-center gap-2"
            >
              <svg className="w-4 h-4 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              Autoplay {secs}s por tema
            </button>
          ))}
          <div className="border-t border-[var(--border-color)]" />
          <button onClick={() => loadRadio(discoverCtx.track)}
            className="w-full text-left px-3 py-2 text-sm text-gray-300 hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary,white)] transition-colors flex items-center gap-2">
            <svg className="w-4 h-4 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" /></svg>
            Radio
          </button>
          <button onClick={() => handleShareTrack(discoverCtx.track)}
            className="w-full text-left px-3 py-2 text-sm text-gray-300 hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary,white)] transition-colors flex items-center gap-2">
            <svg className="w-4 h-4 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z"/></svg>
            Compartir link
          </button>
          {isInLibrary(discoverCtx.track) && onGoToLibrary && (
            <button
              onClick={() => {
                const loc = isInLibrary.findLocation(discoverCtx.track)
                const target = loc?.file || `${discoverCtx.track.artist || ''} ${discoverCtx.track.title || ''}`.trim()
                onGoToLibrary(target)
                setDiscoverCtx(null)
              }}
              className="w-full text-left px-3 py-2 text-sm text-gray-300 hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary,white)] transition-colors flex items-center gap-2"
            >
              <svg className="w-4 h-4 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h7" /></svg>
              Ir a la biblioteca
            </button>
          )}
          {discoverCtx.track?.album_id && (
            <button onClick={async () => {
                const albumId = discoverCtx.track.album_id; const albumName = discoverCtx.track.album || 'Album'
                setDiscoverCtx(null); setLoading(true)
                try { const res = await fetch(`${API_BASE}/api/discover/spotify/album?id=${albumId}`); const data = await res.json()
                  if (data.tracks?.length) { setTracks(data.tracks); setSpotifyPlaylistName(`${albumName}`) }
                } catch (e) { console.error('Album fetch error', e) } finally { setLoading(false) }
              }}
              className="w-full text-left px-3 py-2 text-sm text-gray-300 hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary,white)] transition-colors flex items-center gap-2">
              <svg className="w-4 h-4 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" /></svg>
              Ver album completo ({discoverCtx.track?.album})
            </button>
          )}
        </div>

        {/* Mobile: bottom sheet */}
        <div ref={discoverCtxRef} className="md:hidden fixed inset-x-0 bottom-0 z-50 bg-[var(--bg-panel)] rounded-t-2xl shadow-2xl border-t border-[var(--border-color)] animate-sheet-up">
          {/* Drag handle */}
          <div className="flex justify-center py-2">
            <div className="w-10 h-1 rounded-full bg-gray-600" />
          </div>
          {/* Track info header */}
          <div className="flex items-center gap-3 px-5 pb-3 border-b border-[var(--border-color)]">
            {discoverCtx.track?.artwork_url && (
              <img src={discoverCtx.track.artwork_url.replace('1400x1400', '250x250')} alt="" className="w-12 h-12 rounded-lg object-cover ring-1 ring-white/10" />
            )}
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium text-[var(--text-primary)] truncate">{discoverCtx.track?.title}</div>
              <div className="text-xs text-gray-500 truncate">{discoverCtx.track?.artist}</div>
              {discoverCtx.track?.bpm && (
                <div className="flex items-center gap-2 mt-1">
                  <span className="text-[10px] text-gray-500 font-mono">{discoverCtx.track.bpm} BPM</span>
                  {discoverCtx.track?.key && <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-400">{discoverCtx.track.key}</span>}
                </div>
              )}
            </div>
          </div>
          {/* Actions */}
          <div className="py-2 px-2">
            {isInLibrary(discoverCtx.track) && !clearedTrackIds.has(discoverCtx.track?.id) ? (
              agentConnected ? (
                <button
                  onClick={() => {
                    const loc = isInLibrary.findLocation(discoverCtx.track) || { folder: '', file: '' }
                    agentFetch(`open-folder?folder=${encodeURIComponent(loc.folder)}&file=${encodeURIComponent(loc.file)}`).catch(() => {})
                    setDiscoverCtx(null)
                  }}
                  className="w-full text-left px-4 py-3 rounded-xl text-sm text-green-400 hover:bg-[var(--bg-hover)] transition-colors flex items-center gap-3 active:scale-[0.98]"
                >
                  <div className="w-8 h-8 rounded-full bg-green-500/15 flex items-center justify-center">
                    <svg className="w-4 h-4 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V7z" />
                    </svg>
                  </div>
                  Abrir en Explorer
                </button>
              ) : (
                <div className="w-full text-left px-4 py-3 rounded-xl text-sm text-green-400 flex items-center gap-3 cursor-default">
                  <div className="w-8 h-8 rounded-full bg-green-500/15 flex items-center justify-center">
                    <svg className="w-4 h-4 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" /></svg>
                  </div>
                  Ya descargado
                </div>
              )
            ) : (
              <button onClick={() => { searchAndDownload(discoverCtx.track); setDiscoverCtx(null) }}
                className="w-full text-left px-4 py-3 rounded-xl text-sm text-[var(--text-primary)] hover:bg-[var(--bg-hover)] transition-colors flex items-center gap-3 active:scale-[0.98]">
                <div className="w-8 h-8 rounded-full bg-yellow-500/15 flex items-center justify-center">
                  <svg className="w-4 h-4 text-yellow-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                </div>
                Agregar a pendientes
              </button>
            )}
            <button onClick={() => { playPreview(discoverCtx.track); setDiscoverCtx(null) }}
              className="w-full text-left px-4 py-3 rounded-xl text-sm text-[var(--text-primary)] hover:bg-[var(--bg-hover)] transition-colors flex items-center gap-3 active:scale-[0.98]">
              <div className="w-8 h-8 rounded-full bg-green-500/15 flex items-center justify-center">
                <svg className="w-4 h-4 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                </svg>
              </div>
              Preview
            </button>
            <div className="px-4 pt-2 pb-1 text-[10px] uppercase tracking-wider text-gray-500">Autoplay desde este tema</div>
            <div className="grid grid-cols-4 gap-2 px-4 pb-2">
              {[30, 60, 90, 120].map(secs => (
                <button
                  key={secs}
                  onClick={() => { setPreviewDuration(secs); handlePreviewFromCtx(discoverCtx.track); setDiscoverCtx(null) }}
                  className="py-2.5 rounded-xl text-sm font-semibold bg-purple-500/15 text-purple-300 hover:bg-purple-500/25 transition-all active:scale-95"
                >
                  {secs}s
                </button>
              ))}
            </div>
            <button onClick={() => loadRadio(discoverCtx.track)}
              className="w-full text-left px-4 py-3 rounded-xl text-sm text-[var(--text-primary)] hover:bg-[var(--bg-hover)] transition-colors flex items-center gap-3 active:scale-[0.98]">
              <div className="w-8 h-8 rounded-full bg-purple-500/15 flex items-center justify-center">
                <svg className="w-4 h-4 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" /></svg>
              </div>
              Radio - tracks similares
            </button>
            <button onClick={() => handleShareTrack(discoverCtx.track)}
              className="w-full text-left px-4 py-3 rounded-xl text-sm text-[var(--text-primary)] hover:bg-[var(--bg-hover)] transition-colors flex items-center gap-3 active:scale-[0.98]">
              <div className="w-8 h-8 rounded-full bg-blue-500/15 flex items-center justify-center">
                <svg className="w-4 h-4 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z"/></svg>
              </div>
              Compartir link
            </button>
            {isInLibrary(discoverCtx.track) && onGoToLibrary && (
              <button
                onClick={() => {
                  const loc = isInLibrary.findLocation(discoverCtx.track)
                  const target = loc?.file || `${discoverCtx.track.artist || ''} ${discoverCtx.track.title || ''}`.trim()
                  onGoToLibrary(target)
                  setDiscoverCtx(null)
                }}
                className="w-full text-left px-4 py-3 rounded-xl text-sm text-[var(--text-primary)] hover:bg-[var(--bg-hover)] transition-colors flex items-center gap-3 active:scale-[0.98]"
              >
                <div className="w-8 h-8 rounded-full bg-emerald-500/15 flex items-center justify-center">
                  <svg className="w-4 h-4 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h7" /></svg>
                </div>
                Ir a la biblioteca
              </button>
            )}
            {discoverCtx.track?.album_id && (
              <button onClick={async () => {
                  const albumId = discoverCtx.track.album_id; const albumName = discoverCtx.track.album || 'Album'
                  setDiscoverCtx(null); setLoading(true)
                  try { const res = await fetch(`${API_BASE}/api/discover/spotify/album?id=${albumId}`); const data = await res.json()
                    if (data.tracks?.length) { setTracks(data.tracks); setSpotifyPlaylistName(`${albumName}`) }
                  } catch (e) { console.error('Album fetch error', e) } finally { setLoading(false) }
                }}
                className="w-full text-left px-4 py-3 rounded-xl text-sm text-[var(--text-primary)] hover:bg-[var(--bg-hover)] transition-colors flex items-center gap-3 active:scale-[0.98]">
                <div className="w-8 h-8 rounded-full bg-green-500/15 flex items-center justify-center">
                  <svg className="w-4 h-4 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" /></svg>
                </div>
                Ver album ({discoverCtx.track?.album})
              </button>
            )}
          </div>
          {/* Cancel button */}
          <div className="px-4 pb-6 pt-1">
            <button onClick={() => setDiscoverCtx(null)}
              className="w-full py-3 rounded-xl text-sm font-medium text-gray-400 bg-[var(--bg-surface)] hover:bg-[var(--bg-hover)] transition-colors active:scale-[0.98]">
              Cancelar
            </button>
          </div>
        </div>
      </>)}

      {/* Download activity toast */}
      {(() => {
        const active = Object.entries(downloadQueue).filter(([, d]) => d.status === 'searching' || d.status === 'downloading')
        const done = Object.entries(downloadQueue).filter(([, d]) => d.status === 'done')
        const errors = Object.entries(downloadQueue).filter(([, d]) => d.status === 'not_found' || d.status === 'error')
        if (active.length === 0 && done.length === 0) return null
        return (
          <div className="flex-shrink-0 border-t border-[var(--border-color)] bg-[var(--bg-panel)] px-3 md:px-6 py-2 md:py-2.5 flex items-center justify-between">
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

function ShareView() {
  const params = new URLSearchParams(window.location.search)
  const artist = params.get('artist') || ''
  const title = params.get('title') || ''
  const artwork = params.get('artwork') || ''
  const previewFromUrl = params.get('preview') || ''
  const [previewUrl, setPreviewUrl] = useState(previewFromUrl)
  const [isPlaying, setIsPlaying] = useState(false)
  const [loadingPreview, setLoadingPreview] = useState(!previewFromUrl)
  const audioRef = useRef(null)

  useEffect(() => {
    document.title = artist && title ? `${artist} – ${title}` : 'DJ Free App'
  }, [artist, title])

  useEffect(() => {
    if (previewFromUrl) return
    const q = `${artist} ${title}`.trim()
    if (!q) { setLoadingPreview(false); return }
    let cancelled = false
    fetch(`https://itunes.apple.com/search?term=${encodeURIComponent(q)}&media=music&limit=1`)
      .then(r => r.json())
      .then(d => {
        if (cancelled) return
        if (d.results?.[0]?.previewUrl) setPreviewUrl(d.results[0].previewUrl)
      })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoadingPreview(false) })
    return () => { cancelled = true }
  }, [])

  const togglePlay = () => {
    const a = audioRef.current
    if (!a || !previewUrl) return
    if (a.paused) { a.play().then(() => setIsPlaying(true)).catch(() => {}) }
    else { a.pause(); setIsPlaying(false) }
  }

  const appUrl = `${window.location.origin}${window.location.pathname}`
  const bigArt = artwork ? artwork.replace('1400x1400', '600x600') : ''

  return (
    <div className="h-screen flex flex-col overflow-hidden bg-[var(--bg-app)] text-[var(--text-primary)]">
      <header className="flex-shrink-0 h-14 px-4 md:px-6 flex items-center justify-between border-b border-[var(--border-color)] bg-[var(--bg-topbar)]">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-[var(--color-accent)] flex items-center justify-center">
            <svg className="w-4 h-4 text-[var(--color-accent-text,white)]" fill="currentColor" viewBox="0 0 24 24"><path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55C7.79 13 6 14.79 6 17s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z"/></svg>
          </div>
          <span className="font-bold text-sm md:text-base">DJ Free App</span>
        </div>
        <span className="text-xs text-gray-500">Preview compartida</span>
      </header>

      <main className="flex-1 min-h-0 overflow-y-auto">
        <div className="min-h-full flex flex-col items-center justify-center p-6 gap-6">
          <div className="relative">
            <div className="w-64 h-64 md:w-80 md:h-80 rounded-2xl overflow-hidden ring-1 ring-white/10 shadow-2xl bg-gradient-to-br from-gray-800 to-gray-900">
              {bigArt ? (
                <img src={bigArt} alt="" className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full flex items-center justify-center">
                  <svg className="w-20 h-20 text-gray-600" fill="currentColor" viewBox="0 0 24 24"><path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55C7.79 13 6 14.79 6 17s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z"/></svg>
                </div>
              )}
            </div>
            <button
              onClick={togglePlay}
              disabled={!previewUrl}
              className="absolute bottom-3 right-3 w-16 h-16 rounded-full bg-[var(--color-accent)] text-[var(--color-accent-text,white)] shadow-2xl flex items-center justify-center transition-all duration-200 active:scale-90 disabled:opacity-40 disabled:cursor-not-allowed"
              aria-label={isPlaying ? 'Pausar' : 'Reproducir'}
            >
              {isPlaying ? (
                <svg className="w-7 h-7" fill="currentColor" viewBox="0 0 24 24"><rect x="6" y="5" width="4" height="14" rx="1"/><rect x="14" y="5" width="4" height="14" rx="1"/></svg>
              ) : (
                <svg className="w-7 h-7 translate-x-0.5" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
              )}
            </button>
          </div>

          <div className="text-center max-w-md">
            <div className="text-xl md:text-2xl font-bold">{title || 'Tema compartido'}</div>
            {artist && <div className="text-base md:text-lg text-gray-400 mt-1">{artist}</div>}
            {loadingPreview && <div className="text-xs text-gray-500 mt-3 animate-pulse">Buscando preview…</div>}
            {!loadingPreview && !previewUrl && <div className="text-xs text-gray-500 mt-3">Preview no disponible</div>}
          </div>

          <audio ref={audioRef} src={previewUrl || undefined} onEnded={() => setIsPlaying(false)} preload="auto" />

          <a
            href={appUrl}
            className="mt-2 px-5 py-3 rounded-xl bg-white/5 hover:bg-white/10 text-gray-300 text-sm flex items-center gap-2 transition-colors duration-200 active:scale-95"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6"/></svg>
            Abrí DJ Free App
          </a>
        </div>
      </main>
    </div>
  )
}


function ReelsView() {
  // Public reels/promo view — full-screen demo video + CTA. Shareable on IG.
  return (
    <div className="h-screen w-screen bg-black flex items-center justify-center relative overflow-hidden">
      {/* Animated bg blobs */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -left-40 w-96 h-96 rounded-full bg-blue-600/30 blur-3xl animate-blob" />
        <div className="absolute -bottom-40 -right-40 w-96 h-96 rounded-full bg-purple-600/30 blur-3xl animate-blob animation-delay-2000" />
        <div className="absolute top-1/2 left-1/2 w-80 h-80 rounded-full bg-pink-600/20 blur-3xl animate-blob animation-delay-4000" />
      </div>

      <div className="relative w-full max-w-md mx-auto px-4 py-6 flex flex-col items-center gap-5">
        <div className="flex items-center gap-3">
          <img src="/logo.png" alt="DJ Free App" className="w-12 h-12 rounded-2xl shadow-lg shadow-blue-500/30" />
          <span className="text-2xl font-bold text-white tracking-tight">DJ Free App</span>
        </div>

        <video
          src="/feature-video.mp4"
          controls
          autoPlay
          loop
          muted
          playsInline
          className="w-full rounded-3xl shadow-2xl ring-1 ring-white/10 aspect-[9/16] bg-black object-cover"
        />

        <div className="text-center">
          <div className="text-xs uppercase tracking-wider text-pink-300 font-bold mb-1">DJs argentos</div>
          <h1 className="text-xl md:text-2xl font-bold text-white">Set armado en 30 segundos</h1>
          <p className="text-sm text-gray-400 mt-1">Discover · Sets armónicos · Mix Editor · Sync</p>
        </div>

        <a
          href="/?guest=1"
          className="w-full py-4 rounded-2xl text-center font-bold text-white shadow-xl shadow-blue-500/40 hover:brightness-110 active:scale-[0.98] transition-all"
          style={{ background: 'linear-gradient(135deg, #3b82f6, #a855f7, #ec4899)' }}
        >
          Probalo gratis →
        </a>
        <a href="/" className="text-xs text-gray-500 hover:text-gray-300 transition-colors">Ya tengo cuenta</a>
      </div>
    </div>
  )
}

function AppWithToast() {
  if (typeof window !== 'undefined') {
    const params = new URLSearchParams(window.location.search)
    // Native vertical DemoReels — used by playwright to record the raw
    // animation at 1080x1920 (no landing wrapper, no controls)
    if (params.get('demorec') === '1') {
      return <DemoReels />
    }
    if (params.get('reels') === '1') {
      return <ToastProvider><ReelsView /></ToastProvider>
    }
    if (params.get('share') === '1') {
      return <ToastProvider><ShareView /></ToastProvider>
    }
  }
  return (
    <ToastProvider>
      <App />
    </ToastProvider>
  )
}

export default AppWithToast
