import React, { useState, useEffect, useRef, useCallback, useMemo, forwardRef, useImperativeHandle, createContext, useContext } from 'react';
import PlayPauseBtn from '../components/ui/PlayPauseBtn';
import SearchingLabel from '../components/ui/SearchingLabel';
import SkeletonRows from '../components/ui/SkeletonRows';
import StarFilterHover from '../components/ui/StarFilterHover';
import StarRating from '../components/ui/StarRating';
import TrackThumb from '../components/ui/TrackThumb';
import GenreCombo from '../components/ui/GenreCombo';
import { useToast } from '../contexts/ToastContext';
import { useConfirm } from '../contexts/ConfirmContext';
import { API_BASE, agentFetch, agentUrl, getAudioUrl, normDupeKey, GENRE_COLORS, ScreenHint } from '../App';

// Popover selector for Spotify-style DJ mix transitions
function TransitionPopover({ track1, track2, currentTransition, onSelect, onClose }) {
  const bpm1 = track1.bpm || 128
  const bpm2 = track2.bpm || 128
  const diffPercent = bpm1 && bpm2 ? Math.round(((bpm2 - bpm1) / bpm1) * 100 * 10) / 10 : 0
  const isHarmonic = track1.camelot && track2.camelot && (track1.camelot === track2.camelot || Math.abs(parseInt(track1.camelot) - parseInt(track2.camelot)) <= 1)

  const options = [
    { id: 'auto', label: '⚡ Auto (AI Smart Mix)', desc: 'Superposición inteligente intro/outro (~16s) calculada automáticamente', overlap: 16 },
    { id: 'quick', label: '🎚️ Crossfade Corto (8s)', desc: 'Mezcla rápida y suave de 8 segundos', overlap: 8 },
    { id: 'long', label: '🎚️ Long Blend (32s)', desc: 'Mezcla progresiva larga de 32 segundos', overlap: 32 },
    { id: 'cut', label: '🎛️ Drop on 1 / Cut (0s)', desc: 'Corte directo al primer golpe del siguiente tema', overlap: 0 },
    { id: 'eqmix', label: '🎵 EQ Mix (45s)', desc: 'Intercambio de bajos extendido para pistas de club', overlap: 45 },
  ]

  return (
    <div className="absolute left-1/2 -translate-x-1/2 top-full z-50 mt-2 w-80 bg-zinc-950/95 border border-emerald-500/30 rounded-2xl p-4 shadow-2xl backdrop-blur-xl text-white font-sans animate-in fade-in zoom-in-95 duration-150">
      <div className="flex items-center justify-between border-b border-white/10 pb-2 mb-3">
        <div className="flex items-center gap-1.5 text-xs font-bold text-emerald-400">
          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
          Configurar Transición DJ
        </div>
        <button onClick={onClose} className="text-gray-400 hover:text-white text-xs font-bold px-1.5 py-0.5 rounded-md hover:bg-white/10">✕</button>
      </div>

      {/* Analysis badge */}
      <div className="bg-white/5 rounded-xl p-2.5 mb-3 border border-white/5 space-y-1.5">
        <div className="flex items-center justify-between text-[11px]">
          <span className="text-gray-400">Análisis BPM:</span>
          <span className="font-mono text-emerald-400 font-bold">{bpm1} ➔ {bpm2} {diffPercent === 0 ? '(100% Match)' : `(Sync ${diffPercent > 0 ? '+' : ''}${diffPercent}%)`}</span>
        </div>
        <div className="flex items-center justify-between text-[11px]">
          <span className="text-gray-400">Harmonic Key:</span>
          <span className={`font-mono text-[11px] font-bold ${isHarmonic ? 'text-green-400' : 'text-amber-400'}`}>
            {track1.camelot || track1.key || '?'} ➔ {track2.camelot || track2.key || '?'} {isHarmonic ? '✨ Armónico' : '⚡ Cambio energía'}
          </span>
        </div>
      </div>

      {/* Options */}
      <div className="space-y-1.5">
        {options.map(opt => (
          <button
            key={opt.id}
            onClick={() => onSelect({ type: opt.id, duration: opt.overlap })}
            className={`w-full text-left p-2.5 rounded-xl transition-all border ${
              (currentTransition.type || 'auto') === opt.id
                ? 'bg-emerald-500/20 border-emerald-500/50 text-white shadow-md'
                : 'bg-white/5 border-transparent hover:bg-white/10 text-gray-300'
            }`}
          >
            <div className="text-xs font-bold flex items-center justify-between">
              <span>{opt.label}</span>
              {(currentTransition.type || 'auto') === opt.id && <span className="text-[10px] text-emerald-400">Activo ✓</span>}
            </div>
            <div className="text-[10px] text-gray-400 leading-tight mt-0.5">{opt.desc}</div>
          </button>
        ))}
      </div>
    </div>
  )
}

export default React.memo(forwardRef(function SetBuilder({ page, playingFile, onPlay, onPlayPause, onStop, agentConnected, onEditMix, authUser, collection, onGoToLibrary, playNextRef, libraryRoot }, ref) {
  const toast = useToast()
  const [minStars, setMinStars] = useState(3)
  const [setSelectedStars, setSetSelectedStars] = useState([])
  const [duration, setDuration] = useState(60)
  const [method, setMethod] = useState('camelot')
  // Modo de energia del Set Pro: warmup (apertura suave) | peak (pico) | closing (cierre melodico)
  const [setProMode, setSetProMode] = useState('peak')
  const [setTracks, setSetTracks] = useState([])
  const [generating, setGenerating] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [totalMin, setTotalMin] = useState(0)
  const playing = playingFile
  const [setName, setSetName] = useState('')
  const [dragIdx, setDragIdx] = useState(null)
  const [dragOverIdx, setDragOverIdx] = useState(null)
  const [suggestions, setSuggestions] = useState([])
  const [suggestionOffset, setSuggestionOffset] = useState(0) // page index into 9-track grid
  const [bottomTab, setBottomTab] = useState('sugerencias') // 'sugerencias' | 'biblioteca'
  const [panelCollapsed, setPanelCollapsed] = useState(true)
  const [libBrowserSearch, setLibBrowserSearch] = useState('')
  const [libBrowserGenre, setLibBrowserGenre] = useState('')
  const [libBrowserPage, setLibBrowserPage] = useState(0)
  const [libBrowserSort, setLibBrowserSort] = useState('rating') // rating | artist | bpm | key | recent
  const [libBrowserShowAll, setLibBrowserShowAll] = useState(false)
  const [loadingSuggestions, setLoadingSuggestions] = useState(false)
  const [selectedGenres, setSelectedGenres] = useState([])
  const [availableGenres, setAvailableGenres] = useState([])
  const [searchQuery, setSearchQuery] = useState('')
  const [allTracks, setAllTracks] = useState([])
  const [dupeCtx, setDupeCtx] = useState(null) // { x, y, index, track } — right-click version-swap popover

  // Spotify DJ Mix Mode & Transitions state
  const [isMixMode, setIsMixMode] = useState(true)
  const [transitions, setTransitions] = useState({})
  const [activeTransitionPopover, setActiveTransitionPopover] = useState(null)
  const [curatorName, setCuratorName] = useState(() => authUser?.name || 'Lucas Arenaz')

  const getTransitionBadge = (trans) => {
    const type = trans?.type || 'auto'
    switch (type) {
      case 'quick': return { label: '🎚️ Crossfade 8s', color: 'border-blue-500/40 text-blue-400' }
      case 'long': return { label: '🎚️ Long Blend 32s', color: 'border-purple-500/40 text-purple-400' }
      case 'cut': return { label: '🎛️ Drop on 1 (0s)', color: 'border-amber-500/40 text-amber-400' }
      case 'eqmix': return { label: '🎵 EQ Mix 45s', color: 'border-pink-500/40 text-pink-400' }
      case 'auto':
      default: return { label: '⚡ Auto', color: 'border-emerald-500/40 text-emerald-400 shadow-[0_0_10px_rgba(16,185,129,0.25)]' }
    }
  }

  // MiniDisc Recording Studio state
  const [mdCapacity, setMdCapacityState] = useState(() => {
    const v = localStorage.getItem('md_capacity')
    return v && v !== '0' ? v : '74'  // '0' (sin límite) ya no aplica a un disco físico
  })
  const setMdCapacity = (val) => { setMdCapacityState(val); localStorage.setItem('md_capacity', val) }
  const [mdGap, setMdGapState] = useState(() => localStorage.getItem('md_gap') === 'true')
  const setMdGap = (val) => { setMdGapState(val); localStorage.setItem('md_gap', val ? 'true' : 'false') }
  const [isRecordingMode, setIsRecordingMode] = useState(false)

  // ── Barra polimórfica (Generador | Límite | Destino) ──
  // Estrategia del GENERADOR: la decide la colección activa, no el usuario.
  //   edm → 'club' (Set Pro / Mixed in Key)  ·  pop/latin → 'playlist' (presets curados)
  const genStrategy = (collection || 'edm') === 'edm' ? 'club' : 'playlist'
  // DESTINO de exportación: m3u | xml | mix | md. MiniDisc es un destino más:
  // al elegirlo, el slot Límite pasa de minutos (60/90/120) a capacidad de disco.
  const [exportTarget, setExportTargetState] = useState(() => localStorage.getItem('export_target') || 'm3u')
  const setExportTarget = (v) => { setExportTargetState(v); localStorage.setItem('export_target', v) }
  const isMd = exportTarget === 'md'
  // Último preset de playlist usado — para regenerar al cambiar filtros/límite.
  const lastPresetRef = useRef('auto')
  // Límite vigente en minutos (0 = sin límite): capacidad del disco si el
  // destino es MiniDisc, si no la duración elegida. Una sola variable, dos unidades.
  const limitMin = isMd ? (parseInt(mdCapacity, 10) || 0) : (duration || 0)

  // Track duration helper (seconds)
  const getTrackDurationSec = (t) => {
    if (!t) return 210
    if (t.duration_ms) return Math.round(t.duration_ms / 1000)
    if (t.duration_sec) return Math.round(t.duration_sec)
    if (t.duration_est) return Math.round(t.duration_est * 60)
    if (t.duration) return Math.round(t.duration)
    return 210
  }

  // Calculate total MiniDisc time metrics
  const totalPlaylistSec = setTracks.reduce((acc, t) => acc + getTrackDurationSec(t) + (mdGap && isMd ? 2 : 0), 0)
  const totalPlaylistMin = Math.round((totalPlaylistSec / 60) * 10) / 10
  const maxMdMin = parseInt(mdCapacity, 10) || 0
  const mdUsagePercent = maxMdMin > 0 ? Math.min(100, Math.round((totalPlaylistMin / maxMdMin) * 100)) : 0
  const isMdOverCapacity = maxMdMin > 0 && totalPlaylistMin > maxMdMin

  // Fetch genres that have tracks with >= minStars
  useEffect(() => {
    if (page !== 'set') return
    fetch(`${API_BASE}/api/library?user=${encodeURIComponent(authUser?.name || '')}&collection=${collection || 'edm'}`).then(r => r.json()).then(tracks => {
      setAllTracks(tracks)
      const genreCounts = {}
      // Conteo polimórfico: en EDM (club) exige key (Camelot) + corte de estrellas;
      // en POP/LATIN (playlist) cuenta TODO lo que tenga género — sin key y sin
      // corte implícito de 3 estrellas (solo filtra si el user marcó estrellas).
      const isPlaylistMode = (collection || 'edm') !== 'edm'
      tracks.forEach(t => {
        const passStars = setSelectedStars.length > 0
          ? setSelectedStars.includes(t.rating || 0)
          : (isPlaylistMode ? true : (t.rating || 0) >= minStars)
        if (passStars && t.genre && (isPlaylistMode || t.key)) {
          genreCounts[t.genre] = (genreCounts[t.genre] || 0) + 1
        }
      })
      const sorted = Object.entries(genreCounts).sort((a, b) => b[1] - a[1]).map(([g, c]) => ({ genre: g, count: c }))
      setAvailableGenres(sorted)
      setSelectedGenres(prev => prev.filter(g => genreCounts[g]))
    }).catch(() => {})
  }, [page, minStars, setSelectedStars, authUser, collection])

  // Hint de importación a Rekordbox (P/X) — info de principiante: se cierra
  // con la cruz y queda cerrado para siempre (localStorage).
  const [rbHintDismissed, setRbHintDismissed] = useState(() => !!localStorage.getItem('rb_import_hint_dismissed'))
  const dismissRbHint = () => { localStorage.setItem('rb_import_hint_dismissed', '1'); setRbHintDismissed(true) }

  // Auto-generate a starter set on first entry (when no set yet) — polimórfico:
  // en EDM arma un set armónico; en POP/LATIN arma una playlist client-side
  // (allTracks ya viene filtrado por colección, así no se cuelan temas de otra).
  const autoGenRef = useRef(false)
  useEffect(() => {
    if (page !== 'set') return
    if (autoGenRef.current) return
    if (setTracks.length > 0) return
    if (allTracks.length === 0) return  // wait until library loads
    autoGenRef.current = true
    if (genStrategy === 'club') generateSet('camelot')
    else generateCuratedPlaylist('auto')
  }, [page, allTracks.length, setTracks.length])

  // Al cambiar de colección la lista armada deja de tener sentido (un set EDM
  // no es una playlist POP): se vacía todo y el auto-generado rearma con la
  // biblioteca nueva cuando termina de cargar.
  const prevCollectionRef = useRef(collection)
  useEffect(() => {
    if (prevCollectionRef.current === collection) return
    prevCollectionRef.current = collection
    setSetTracks([]); setSuggestions([]); setTotalMin(0); setAllTracks([])
    autoGenRef.current = false
  }, [collection])

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
          limit: 30,
          username: authUser?.name || '',
        }),
      })
      const data = await res.json()
      setSuggestions(data.suggestions || [])
      setSuggestionOffset(0)
    } catch (e) {
      console.error('Failed to fetch suggestions', e)
    } finally {
      setLoadingSuggestions(false)
    }
  }

  // La "cocina": análisis de mezcla pre-calculado (grilla rígida + markers)
  // que viaja con la UI como JSON estático. Clave = filename. Un tema sin
  // entrada acá NO es apto para mezclar (regla: sin análisis no hay Mixear).
  const [mixAnalysis, setMixAnalysis] = useState({})
  useEffect(() => {
    fetch('/mix-analysis.json')
      .then(r => (r.ok ? r.json() : {}))
      .then(setMixAnalysis)
      .catch(() => {})
  }, [])

  // Cues manuales del dueño (marcados sobre la waveform): PISAN al análisis.
  // { filename: { mixIn?, mixOut? } } en localStorage.
  const readUserCues = () => {
    try { return JSON.parse(localStorage.getItem('mix_user_cues') || '{}') } catch { return {} }
  }
  const [userCues, setUserCues] = useState(readUserCues)

  // Devuelve el track enriquecido con su análisis (mix+grid) o null si no
  // está analizado. Acepta análisis propio (lab) o del JSON de la cocina.
  // Los cues manuales del dueño mandan sobre todo (anchorSource 'user').
  const trackAnalysis = (t) => {
    if (!t) return null
    let base = null
    if (t.mix && t.grid) base = t
    else {
      const a = mixAnalysis[t.filename]
      if (a) base = { ...t, bpm: a.bpm, duration_sec: a.duration, mix: a.mix, grid: a.grid, sections: a.sections, subfolder: a.subfolder || t.subfolder, in_subfolder: true }
    }
    if (!base) return null
    const uc = userCues[t.filename]
    if (uc && base.grid?.beatLen) {
      const mix = { ...base.mix }
      let grid = base.grid
      if (uc.mixIn != null) {
        mix.mixIn = uc.mixIn
        grid = { ...grid, offset: uc.mixIn % grid.beatLen, anchorSource: 'user' }
      }
      if (uc.mixOut != null) mix.mixOut = uc.mixOut
      base = { ...base, mix, grid }
    }
    return base
  }

  // Mixear disponible solo si TODO el set está analizado (>=2 temas)
  const mixAvailable = setTracks.length >= 2 && setTracks.every(t => !!trackAnalysis(t))

  // Dedup de set ("esto no puede pasar": Alive x2 y On My Knees x2 en el
  // mismo set): la misma canción entra UNA vez, y queda la mejor copia —
  // la de mejor grilla en la cocina; empate, la primera.
  const dedupeSetTracks = (list) => {
    const best = new Map()
    for (const t of list) {
      const k = normDupeKey(t.filename || t.title || '')
      const q = mixAnalysis[t.filename]?.grid?.quality ?? 999
      const prev = best.get(k)
      if (!prev || q < prev.q) best.set(k, { t, q })
    }
    const out = list.filter(t => best.get(normDupeKey(t.filename || t.title || ''))?.t === t)
    if (out.length < list.length) toast(`Se quitaron ${list.length - out.length} duplicados del set`, 'info', 3000)
    return out
  }

  // Continuidad de BPM ("está mal poner uno de 132 pegado a uno de 122"):
  // NO se reordena (el sort ascendente hacía que todo set arranque con el
  // mismo tema) — se respeta el orden del generador y se AVISAN los saltos
  // >6% entre vecinos para que el dueño decida.
  const orderSetByBpm = (list) => {
    const eff = (t) => {
      const a = mixAnalysis[t.filename]
      if (a?.grid?.quality != null && a.grid.quality <= 80) return a.bpm
      return t.bpm || a?.bpm || 0
    }
    let jumps = 0
    for (let i = 1; i < list.length; i++) {
      const b1 = eff(list[i - 1])
      const b2 = eff(list[i])
      if (b1 > 0 && b2 > 0 && Math.abs(b2 - b1) / b1 > 0.06) jumps++
    }
    if (jumps > 0) toast(`Ojo: ${jumps} salto(s) de BPM >6% entre temas vecinos`, 'info', 3500)
    return list
  }

  // Autoplay-next: when a set track finishes (real audio, not preview/stop),
  // advance to the next one. Re-registered on every setTracks/onPlay change
  // so the closure always sees the current list. Handles 2s gap for MiniDisc track marking.
  useEffect(() => {
    if (!playNextRef || page !== 'set') return
    const fn = (endedFilename, crossfadeSec = 0) => {
      console.log('[SetBuilder playNextRef] Triggered with endedFilename:', endedFilename, 'crossfadeSec:', crossfadeSec)
      let idx = setTracks.findIndex(t =>
        t.filename === endedFilename ||
        t.title === endedFilename ||
        (t.filename && endedFilename && (t.filename.includes(endedFilename) || endedFilename.includes(t.filename)))
      )

      // Fallback: if not found by filename, find using playingFile or default
      if (idx === -1 && playingFile) {
        idx = setTracks.findIndex(t => t.filename === playingFile || t.title === playingFile)
      }

      console.log('[SetBuilder playNextRef] Matched index:', idx, 'of', setTracks.length)

      if (idx >= 0 && idx + 1 < setTracks.length) {
        const nextTrack = setTracks[idx + 1]
        console.log('[SetBuilder playNextRef] Advancing to next track:', nextTrack.title || nextTrack.filename)
        toast(`▶ Siguiente tema: ${nextTrack.title || nextTrack.filename}`, 'info', 2000)
        if (mdGap && isMd) {
          toast(`[MiniDisc] Pausa 2s (Track Mark)... Siguiente: ${nextTrack.title || nextTrack.filename}`, 'info', 2000)
          setTimeout(() => {
            onPlay(nextTrack, 0)
          }, 2000)
        } else {
          onPlay(nextTrack, crossfadeSec)
        }
      } else if (idx >= 0 && idx + 1 === setTracks.length) {
        console.log('[SetBuilder playNextRef] Reached end of set!')
        toast('✨ Set finalizado', 'success', 4000)
        setIsRecordingMode(false)
      } else {
        console.warn('[SetBuilder playNextRef] Could not match endedFilename in setTracks. endedFilename:', endedFilename, 'playingFile:', playingFile)
      }
    }

    fn.getCrossfadeSec = (filename) => {
      // Sin análisis completo del set no hay mezcla: reproducción lista simple
      if (!isMixMode || (isMd && mdGap) || !mixAvailable) return 0
      let idx = setTracks.findIndex(t =>
        t.filename === filename || t.title === filename ||
        (t.filename && filename && (t.filename.includes(filename) || filename.includes(t.filename)))
      )
      if (idx === -1 && playingFile) idx = setTracks.findIndex(t => t.filename === playingFile || t.title === playingFile)
      if (idx >= 0 && idx < setTracks.length) {
        const trans = transitions[idx]
        const type = trans?.type || 'auto'
        switch (type) {
          case 'quick': return 8
          case 'long': return 32
          case 'cut': return 0.2
          case 'eqmix': return 45
          case 'auto':
          default: return 12
        }
      }
      return 0
    }

    playNextRef.current = fn
    return () => { if (playNextRef.current === fn) playNextRef.current = null }
  }, [setTracks, onPlay, playNextRef, page, mdGap, isMd, playingFile, mixAnalysis]) // eslint-disable-line react-hooks/exhaustive-deps

  // Lab dual-deck por Web Audio API (chau HTMLAudioElement): ambos temas
  // decodificados a AudioBuffer y programados sobre el MISMO reloj
  // (ctx.currentTime) con precisión de sample. Como mixOut de A y mixIn de B
  // están snapeados a la grilla rígida de cada tema, arrancarlos en el mismo
  // instante deja los golpes matemáticamente clavados — sin latencia de
  // decode, sin jitter de currentTime, sin glitches de streaming.
  const [labState, setLabState] = useState(null) // null | 'loading' | 'playing'
  const [mixSessionInfo, setMixSessionInfo] = useState(null) // {mode, idx, label} de la sesión Web Audio del set
  // Log de sesión de mezcla: consola + panel UI + backend (/api/client-log →
  // visible en los logs de Cloud Run) para diagnosticar sin copiar nada.
  const [mixLog, setMixLog] = useState([])
  const logMix = (line) => {
    const stamp = new Date().toISOString().slice(11, 19)
    const entry = `[${stamp}] ${line}`
    console.log('[MIX]', entry)
    setMixLog(prev => [...prev.slice(-150), entry])
    try {
      fetch(`${API_BASE}/api/client-log`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ msg: `[MIX] ${line}`, level: 'info' }),
      }).catch(() => {})
    } catch { /* best-effort */ }
  }
  // kickAnchor (toggle A/B): corre el arranque al ataque real del bombo.
  // labRecipe: receta de transición del recetario — todas sobre la misma
  // grilla y reloj; se aplican al PRÓXIMO play.
  // kickAnchor OFF por defecto: la verificación objetiva (2026-08-02, script
  // verify_anchors) midió que la grilla estadística ya está clavada (±10ms)
  // en 7 de 10 temas buenos y el refinado "al bombo" le mete -30/-60ms de
  // bias sistemático. Queda como experimento, no como default.
  const [labOpts, setLabOpts] = useState({ kickAnchor: false })
  // Buffers decodificados PERSISTENTES entre sesiones/seeks (adelantar no
  // re-decodifica) + buffers resueltos y picos para dibujar la waveform.
  const bufCacheRef = useRef(new Map())
  const bufReadyRef = useRef(new Map())
  const wavePeaksRef = useRef(new Map())
  // Calibración de entrada (slider, pedido del dueño): corrimiento global en
  // ms del punto de entrada del tema B. Positivo = B arranca más adentro del
  // archivo -> sus golpes llegan ANTES (corrige "entra apenas atrás").
  // Persiste y se lee por ref para poder ajustarlo EN VIVO entre segmentos.
  // v14: la convención de ancla cambió a PICO del primer kick — el 55 viejo
  // (calibrado con convención falda) ya no aplica; arranca en 25 (≈ priming
  // MP3) y se recalibra a oído con el slider. La migración pisa el valor
  // guardado UNA vez.
  const [labOffsetMs, setLabOffsetMs] = useState(() => {
    try {
      if (localStorage.getItem('mix_offset_cal') !== 'v14') {
        localStorage.setItem('mix_offset_cal', 'v14')
        localStorage.setItem('mix_offset_ms', '25')
        return 25
      }
      const v = localStorage.getItem('mix_offset_ms')
      return v === null ? 25 : (parseInt(v, 10) || 0)
    } catch { return 25 }
  })
  const labOffsetRef = useRef(labOffsetMs)
  labOffsetRef.current = labOffsetMs
  useEffect(() => {
    try { localStorage.setItem('mix_offset_ms', String(labOffsetMs)) } catch { /* sin storage */ }
  }, [labOffsetMs])
  const [labRecipe, setLabRecipe] = useState('short2')
  // Banco de FX para catar (pedido del dueño: "poné 10-20 tipos y te digo
  // cuáles son los mejores"). Se elige en el dropdown, aplica al próximo
  // enganche (ref para cambiarlo EN VIVO entre segmentos del Ensayo).
  const [labFx, setLabFx] = useState('directo')
  const labFxRef = useRef('directo')
  labFxRef.current = labFx

  // Auto: elige la receta por par con los datos del análisis. Prioridades:
  // tempos incompatibles → cut; outro corto → loop (lo estira); grilla dudosa
  // → corto con filtro (disimula, estilo AutoMix); grillas clavadas y outro
  // largo → blend; default corto.
  const autoRecipe = (A, B) => {
    const qA = A.grid?.quality ?? 999
    const qB = B.grid?.quality ?? 999
    const bpmDelta = (A.bpm && B.bpm) ? Math.abs(A.bpm - B.bpm) / A.bpm : 0
    const bar = A.grid?.barLen || 240 / (A.bpm || 125)
    const outroWin = (A.duration_sec || 0) - A.mix.mixOut
    if (bpmDelta > 0.06) return 'cut'
    if (outroWin > 0 && outroWin < 8 * bar) return 'loop4'
    if (qA > 60 || qB > 60) return 'short8'
    if (outroWin >= 16 * bar && qA < 30 && qB < 30) return 'blend16'
    return 'short8'
  }
  const RECIPE_LABELS = { short8: 'Corto 8c', loop4: 'Loop 4b', blend16: 'Blend 16c', eqmix: 'EQ Mix', cut: 'Cut', fade: 'Fade' }
  const labRef = useRef(null)
  // Guardia SINCRÓNICA de sesión (labState es async: el seek re-arranca a los
  // 80ms y con el estado viejo la sesión nueva abortaba en silencio)
  const labBusyRef = useRef(false)

  const eqPowerCurve = (rising) => {
    const N = 128
    const c = new Float32Array(N)
    for (let i = 0; i < N; i++) {
      const x = i / (N - 1)
      c[i] = rising ? Math.sin(x * Math.PI / 2) : Math.cos(x * Math.PI / 2)
    }
    return c
  }

  // Corrimiento de ancla: diferencia (con wrap al beat) entre el ancla afinada
  // al bombo (kickOffset) y la estadística (offset). Corre el arranque del
  // tema al golpe REAL manteniendo el marker musical.
  const gridDelta = (t) => {
    const g = t.grid
    if (!g?.kickOffset || !g?.beatLen) return 0
    let d = (g.kickOffset - g.offset) % g.beatLen
    if (d > g.beatLen / 2) d -= g.beatLen
    if (d < -g.beatLen / 2) d += g.beatLen
    return d
  }

  // Posición segura para source.start(): si el corrimiento de ancla la dejó
  // negativa, avanza de a UN BEAT (la grilla es periódica → misma fase).
  const gridSafePos = (pos, t) => {
    const bl = t.grid?.beatLen || 0.48
    while (pos < 0) pos += bl
    return pos
  }

  // FASE DE COMPÁS (fix del LLM del dueño, 2026-08-02): el enganche solo
  // puede disparar en un "1". Beats contados desde el 0.0.0 del tema (su
  // primer kick): si el mixOut cayó en beat 2/3/4 del compás (medido: Be The
  // One mod4=2, Feeling Good mod4=1 → compás cruzado con beats perfectos),
  // se corre al próximo 1. Sin esto, B entra con su 1 sobre cualquier beat de A.
  const barSnapPos = (pos, t) => {
    const g = t.grid
    const ref = t.mix?.mixIn
    if (!g?.beatLen || ref == null) return pos
    const idx = Math.round((pos - ref) / g.beatLen)
    const ph = ((idx % 4) + 4) % 4
    return ph === 0 ? pos : pos + (4 - ph) * g.beatLen
  }

  const stopLabTransition = useCallback(() => {
    const l = labRef.current
    labRef.current = null
    labBusyRef.current = false
    if (l) {
      l.active = false
      try { l.srcA.stop() } catch { /* ya parado */ }
      try { l.srcB.stop() } catch { /* ya parado */ }
      try { l.ctx.close() } catch { /* ya cerrado */ }
    }
    setLabState(null)
    setMixSessionInfo(null)
  }, [])
  useEffect(() => stopLabTransition, [stopLabTransition])

  const playLabTransition = async () => {
    if (labBusyRef.current) return
    labBusyRef.current = true
    // Cualquier par: los primeros 2 temas del set, enriquecidos con su
    // análisis (propio del lab o del JSON de la cocina)
    const A = trackAnalysis(setTracks[0])
    const B = trackAnalysis(setTracks[1])
    if (!A?.mix?.mixOut || !B?.mix) {
      toast('Los primeros 2 temas del set no están analizados (cocina: Melodic House por ahora)', 'error', 3500)
      return
    }
    onStop() // silenciar el player global de la app
    setLabState('loading')
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)()
      // Audio CRUDO del agente (sin ?fast=1): el transcode MP3 al vuelo mete
      // delay de encoder al inicio y correría la grilla; el FLAC/MP3 original
      // decodifica sin corrimiento.
      const loadBuffer = async (t) => {
        const url = agentUrl('audio/' + encodeURIComponent(t.subfolder) + '/' + encodeURIComponent(t.filename))
        const res = await fetch(url)
        if (!res.ok) throw new Error(`audio ${res.status}`)
        return ctx.decodeAudioData(await res.arrayBuffer())
      }
      const [bufA, bufB] = await Promise.all([loadBuffer(A), loadBuffer(B)])
      const master = ctx.createGain()
      master.gain.value = 0.516 // 0.65 − 2dB exactos
      master.connect(ctx.destination)
      const gA = ctx.createGain()
      const gB = ctx.createGain()
      gA.connect(master)
      gB.connect(master)
      const srcA = ctx.createBufferSource()
      srcA.buffer = bufA
      const srcB = ctx.createBufferSource()
      srcB.buffer = bufB
      // Sync de tempo: B corre al BPM de A durante el solape (con el par del
      // lab ambos son 125.000 -> rate 1.0 exacto). Tope de cordura ±8%.
      let rate = (A.bpm && B.bpm) ? A.bpm / B.bpm : 1
      if (!isFinite(rate) || Math.abs(rate - 1) > 0.08) rate = 1
      srcB.playbackRate.value = rate
      const T0 = ctx.currentTime + 0.25
      // Directo al outro: A arranca EN su mixOut y B entra en el mismo
      // instante en su mixIn (ambos golpes de grilla) -> beats clavados.
      // Con "Ancla bombo" el arranque se corre al ataque real del kick.
      const posA = barSnapPos(gridSafePos(A.mix.mixOut + (labOpts.kickAnchor ? gridDelta(A) : 0), A), A)
      const posB = gridSafePos(B.mix.mixIn + (labOpts.kickAnchor ? gridDelta(B) : 0) + labOffsetRef.current / 1000, B)
      const bar = A.grid?.barLen || 240 / (A.bpm || 125)
      const beat = A.grid?.beatLen || bar / 4

      // Cadena con bass swap: B entra por highpass (sin graves) y en swapT se
      // cruzan los filtros — la entrega del bajo. Un solo bombo siempre.
      // darkB (EQ mix): B además entra "oscuro" (lowpass) y se abre hasta la entrega.
      const bassSwapChain = (swapT, darkB) => {
        const hpB = ctx.createBiquadFilter()
        hpB.type = 'highpass'
        hpB.Q.value = 0.7
        hpB.frequency.setValueAtTime(180, ctx.currentTime)
        hpB.frequency.setValueAtTime(180, swapT - 0.1)
        hpB.frequency.exponentialRampToValueAtTime(25, swapT + 0.4)
        if (darkB) {
          const lpB = ctx.createBiquadFilter()
          lpB.type = 'lowpass'
          lpB.frequency.setValueAtTime(900, ctx.currentTime)
          lpB.frequency.exponentialRampToValueAtTime(18000, swapT)
          srcB.connect(hpB)
          hpB.connect(lpB)
          lpB.connect(gB)
        } else {
          srcB.connect(hpB)
          hpB.connect(gB)
        }
        const hpA = ctx.createBiquadFilter()
        hpA.type = 'highpass'
        hpA.Q.value = 0.7
        hpA.frequency.setValueAtTime(25, ctx.currentTime)
        hpA.frequency.setValueAtTime(25, swapT - 0.1)
        hpA.frequency.exponentialRampToValueAtTime(220, swapT + 0.4)
        srcA.connect(hpA)
        hpA.connect(gA)
      }
      // Rampa estándar de entrada de B y salida de A alrededor de la entrega
      const swapRamps = (swapT, endT, riseBar) => {
        // B a nivel desde el arranque (micro-rampa anti-click); sin fade-in
        gB.gain.setValueAtTime(0.0001, T0)
        gB.gain.linearRampToValueAtTime(0.92, T0 + 0.08)
        gB.gain.setValueAtTime(0.92, swapT)
        gB.gain.linearRampToValueAtTime(1, swapT + riseBar)
        gA.gain.setValueAtTime(1, ctx.currentTime)
        gA.gain.setValueAtTime(1, swapT)
        gA.gain.setValueCurveAtTime(eqPowerCurve(false), swapT + 0.01, endT - swapT - 0.01)
      }

      // Recetario de transiciones ('auto' resuelve por datos y avisa cuál)
      const recipe = labRecipe === 'auto' ? autoRecipe(A, B) : labRecipe
      if (labRecipe === 'auto') {
        toast(`Auto eligió: ${RECIPE_LABELS[recipe]} (grillas ${A.grid?.quality ?? '?'}ms / ${B.grid?.quality ?? '?'}ms)`, 'info', 3000)
      }
      if (recipe === 'diag') {
        // Diagnóstico: B fuerte y sin filtro — dos bombos juntos
        srcA.connect(gA)
        srcB.connect(gB)
        gA.gain.setValueAtTime(1, ctx.currentTime)
        gB.gain.setValueAtTime(0.95, ctx.currentTime)
        srcA.stop(T0 + 8 * bar + 0.1)
      } else if (recipe === 'fade') {
        // Crossfade equal-power parejo (referencia)
        srcA.connect(gA)
        srcB.connect(gB)
        const fade = A.mix.recommendedFade || 12
        gA.gain.setValueAtTime(1, ctx.currentTime)
        gB.gain.setValueAtTime(0, ctx.currentTime)
        gA.gain.setValueCurveAtTime(eqPowerCurve(false), T0, fade)
        gB.gain.setValueCurveAtTime(eqPowerCurve(true), T0, fade)
        srcA.stop(T0 + fade + 0.1)
      } else if (recipe === 'cut') {
        // Corte en frase: B entra al palo, A muere en 1 beat
        srcA.connect(gA)
        srcB.connect(gB)
        gA.gain.setValueAtTime(1, ctx.currentTime)
        gB.gain.setValueAtTime(1, ctx.currentTime)
        gA.gain.setValueCurveAtTime(eqPowerCurve(false), T0, beat)
        srcA.stop(T0 + beat + 0.05)
      } else if (recipe === 'blend16' || recipe === 'eqmix') {
        // Blend largo de 16 compases, entrega del bajo en el 8; eqmix además
        // trae a B oscuro abriéndose (estilo AutoMix largo)
        const swapT = T0 + 8 * bar
        const endT = T0 + 16 * bar
        bassSwapChain(swapT, recipe === 'eqmix')
        swapRamps(swapT, endT, 2 * bar)
        srcA.stop(endT + 0.1)
      } else if (recipe === 'loop4') {
        // Loop out: A queda girando en 4 beats clavados a grilla mientras B
        // se instala; A se va en fade a los 8 compases sin soltar el loop
        srcA.loop = true
        srcA.loopStart = posA
        srcA.loopEnd = posA + 4 * beat
        const swapT = T0 + 4 * bar
        bassSwapChain(swapT, false)
        gB.gain.setValueAtTime(0.0001, T0)
        gB.gain.linearRampToValueAtTime(0.55, T0 + bar)
        gB.gain.linearRampToValueAtTime(0.92, swapT)
        gB.gain.linearRampToValueAtTime(1, swapT + bar)
        gA.gain.setValueAtTime(1, ctx.currentTime)
        gA.gain.setValueAtTime(1, T0 + 8 * bar)
        gA.gain.setValueCurveAtTime(eqPowerCurve(false), T0 + 8 * bar + 0.01, 2 * bar)
        srcA.stop(T0 + 10 * bar + 0.2)
      } else {
        // corto: 2 compases por defecto (~4-5s); 'short8' = versión de 8
        const P = recipe === 'short8' ? [4, 8, 1] : [1, 2, 0.5]
        const swapT = T0 + P[0] * bar
        const endT = T0 + P[1] * bar
        bassSwapChain(swapT, false)
        swapRamps(swapT, endT, P[2] * bar)
        srcA.stop(endT + 0.1)
      }

      srcA.start(T0, posA)
      srcB.start(T0, posB)
      srcB.onended = () => { if (labRef.current?.srcB === srcB) stopLabTransition() }
      labRef.current = { ctx, srcA, srcB, baseRate: rate }
      setLabState('playing')
    } catch (e) {
      console.error('[LAB WebAudio]', e)
      toast('Error en la prueba de enganche', 'error', 3000)
      stopLabTransition()
    }
  }

  // Jog nudge en vivo: corre el tema B ±ms con un toque breve de playbackRate
  // (como empujar el plato). Sirve para ENCONTRAR a oído el error de ancla
  // residual: si con +30ms clava, ese es el corrimiento que falta corregir.
  const nudgeLab = (ms) => {
    const l = labRef.current
    if (!l) return
    const now = l.ctx.currentTime
    const dur = 0.25
    try {
      l.srcB.playbackRate.cancelScheduledValues(now)
      l.srcB.playbackRate.setValueAtTime(l.baseRate + (ms / 1000) / dur, now)
      l.srcB.playbackRate.setValueAtTime(l.baseRate, now + dur)
    } catch { /* source ya parado */ }
  }

  // ===== Editor de cues sobre WAVEFORM ("te lo marco yo", spec del dueño) ====
  // Muestra la onda (intro de B: primeros 6s / outro de A: mixOut±4s), click
  // = marker, ajuste fino, audición desde el marker, y guarda el cue manual
  // que PISA al análisis para siempre (trackAnalysis, anchorSource 'user').
  const [cueEdit, setCueEdit] = useState(null) // {track, which:'in'|'out', buf?, win, marker, loading}
  const cueCanvasRef = useRef(null)
  const cueCtxRef = useRef(null)
  const cueAudRef = useRef(null)

  const openCueEdit = async (t, which) => {
    const ta = trackAnalysis(t)
    if (!ta) { toast('El tema no está analizado', 'error', 2500); return }
    const marker = which === 'in' ? ta.mix.mixIn : ta.mix.mixOut
    setCueEdit({ track: ta, which, marker, loading: true })
    try {
      const ctx = cueCtxRef.current || new (window.AudioContext || window.webkitAudioContext)()
      cueCtxRef.current = ctx
      const url = agentUrl('audio/' + encodeURIComponent(ta.subfolder) + '/' + encodeURIComponent(ta.filename))
      const res = await fetch(url)
      if (!res.ok) throw new Error(`audio ${res.status}`)
      const buf = await ctx.decodeAudioData(await res.arrayBuffer())
      // Ventana centrada en el marker actual (un mixIn puede estar a los 30s
      // si la intro es melódica) — ±6s de contexto para ver el golpe.
      const win = which === 'in'
        ? [Math.max(0, marker - 6), Math.min(buf.duration, Math.max(marker + 6, 8))]
        : [Math.max(0, marker - 4), Math.min(buf.duration, marker + 4)]
      setCueEdit({ track: ta, which, buf, win, marker })
    } catch (e) {
      console.error('[CUE EDIT]', e)
      toast('No pude cargar el audio del tema', 'error', 2500)
      setCueEdit(null)
    }
  }

  // Dibuja la waveform + marker cada vez que cambia el estado del editor
  useEffect(() => {
    const ce = cueEdit
    const cv = cueCanvasRef.current
    if (!ce?.buf || !cv) return
    const W = cv.width
    const H = cv.height
    const g = cv.getContext('2d')
    g.clearRect(0, 0, W, H)
    const data = ce.buf.getChannelData(0)
    const sr = ce.buf.sampleRate
    const [t0, t1] = ce.win
    const i0 = Math.floor(t0 * sr)
    const i1 = Math.min(data.length, Math.floor(t1 * sr))
    const spp = Math.max(1, Math.floor((i1 - i0) / W))
    g.fillStyle = 'rgba(34,211,238,0.75)'
    for (let x = 0; x < W; x++) {
      let mn = 1
      let mx = -1
      const s = i0 + x * spp
      for (let j = s; j < Math.min(i1, s + spp); j++) {
        const v = data[j]
        if (v < mn) mn = v
        if (v > mx) mx = v
      }
      const y1 = ((1 - mx) * H) / 2
      const y2 = ((1 - mn) * H) / 2
      g.fillRect(x, y1, 1, Math.max(1, y2 - y1))
    }
    const xm = ((ce.marker - t0) / (t1 - t0)) * W
    g.fillStyle = '#f43f5e'
    g.fillRect(xm - 1, 0, 2, H)
  }, [cueEdit])

  const cueAudition = () => {
    const ce = cueEdit
    const ctx = cueCtxRef.current
    if (!ce?.buf || !ctx) return
    try { cueAudRef.current?.stop() } catch { /* ya parado */ }
    const src = ctx.createBufferSource()
    src.buffer = ce.buf
    src.connect(ctx.destination)
    src.start(ctx.currentTime, Math.max(0, ce.marker), 2.5)
    cueAudRef.current = src
  }

  const saveCue = () => {
    const ce = cueEdit
    if (!ce) return
    try { cueAudRef.current?.stop() } catch { /* ya parado */ }
    const cues = readUserCues()
    const c = cues[ce.track.filename] || {}
    if (ce.which === 'in') c.mixIn = Math.round(ce.marker * 1000) / 1000
    else c.mixOut = Math.round(ce.marker * 1000) / 1000
    cues[ce.track.filename] = c
    try { localStorage.setItem('mix_user_cues', JSON.stringify(cues)) } catch { /* sin storage */ }
    setUserCues(cues)
    toast('Cue guardado — tu marca manda sobre el análisis', 'success', 2500)
    setCueEdit(null)
  }

  const clearCue = () => {
    const ce = cueEdit
    if (!ce) return
    const cues = readUserCues()
    if (cues[ce.track.filename]) {
      delete cues[ce.track.filename][ce.which === 'in' ? 'mixIn' : 'mixOut']
      if (!Object.keys(cues[ce.track.filename]).length) delete cues[ce.track.filename]
      try { localStorage.setItem('mix_user_cues', JSON.stringify(cues)) } catch { /* sin storage */ }
      setUserCues(cues)
    }
    toast('Marca manual borrada — vuelve el análisis automático', 'info', 2500)
    setCueEdit(null)
  }

  // ===== Transporte de la sesión: barra de avance + seek + marcar 0.0.0 =====
  const [mixProgress, setMixProgress] = useState(null) // {idx, pos, dur, title}
  useEffect(() => {
    if (labState !== 'playing') { setMixProgress(null); return }
    const tick = setInterval(() => {
      const l = labRef.current
      const pi = l?.posInfo
      if (!pi || !l?.ctx) return
      const pos = pi.posRef + Math.max(0, l.ctx.currentTime - pi.tRef)
      const dur = pi.dur || bufReadyRef.current.get(pi.track?.filename)?.duration || 0
      setMixProgress({ idx: pi.idx, pos, dur, track: pi.track })
    }, 500)
    return () => clearInterval(tick)
  }, [labState])

  const seekMixSession = (frac) => {
    const mp = mixProgress
    if (!mp?.dur) return
    const target = frac * mp.dur
    const idx = mp.idx
    stopLabTransition()
    setTimeout(() => runMixSession('set', { startIdx: idx, startPos: target }), 80)
  }

  // Marcar 0.0.0 mientras suena: captura la posición actual del tema en
  // reproducción como su mixIn manual (después se afina en el editor de cues)
  const markZeroHere = () => {
    const l = labRef.current
    const pi = l?.posInfo
    if (!pi?.track || !l?.ctx) return
    const pos = pi.posRef + Math.max(0, l.ctx.currentTime - pi.tRef)
    const cues = readUserCues()
    cues[pi.track.filename] = { ...(cues[pi.track.filename] || {}), mixIn: Math.round(pos * 1000) / 1000 }
    try { localStorage.setItem('mix_user_cues', JSON.stringify(cues)) } catch { /* sin storage */ }
    setUserCues(cues)
    logMix(`0.0.0 manual: "${pi.track.title || pi.track.filename}" en ${pos.toFixed(3)}s`)
    toast(`0.0.0 marcado en ${pos.toFixed(2)}s — afinalo en Cue si hace falta`, 'success', 2500)
  }

  // Waveform-deck del tema sonando: picos pre-computados por tema, progreso
  // pintado, markers visibles (ámbar = mixIn, rojo = mixOut), click = seek.
  const progCanvasRef = useRef(null)
  // Waveform estilo DAW: RMS (energía real, muestra las caídas) + silueta de
  // picos tenue. El dibujo por picos absolutos era un "ladrillo" en masters
  // comprimidos — el dueño no veía los valles ("está muy saturado").
  const peaksFor = (fn) => {
    let p = wavePeaksRef.current.get(fn)
    if (p) return p
    const buf = bufReadyRef.current.get(fn)
    if (!buf) return null
    const data = buf.getChannelData(0)
    const N = 600
    const spp = Math.max(1, Math.floor(data.length / N))
    const pk = new Float32Array(N)
    const rms = new Float32Array(N)
    let maxR = 0
    for (let i = 0; i < N; i++) {
      let m = 0
      let acc = 0
      let cnt = 0
      const s = i * spp
      const e = Math.min(data.length, s + spp)
      for (let j = s; j < e; j += 8) {
        const v = data[j]
        const a = Math.abs(v)
        if (a > m) m = a
        acc += v * v
        cnt++
      }
      pk[i] = m
      rms[i] = cnt ? Math.sqrt(acc / cnt) : 0
      if (rms[i] > maxR) maxR = rms[i]
    }
    if (maxR > 0) {
      for (let i = 0; i < N; i++) rms[i] = Math.pow(rms[i] / maxR, 0.7)
    }
    p = { pk, rms }
    wavePeaksRef.current.set(fn, p)
    return p
  }

  useEffect(() => {
    const cv = progCanvasRef.current
    const mp = mixProgress
    if (!cv || !mp?.track || !mp.dur) return
    const g = cv.getContext('2d')
    const W = cv.width
    const H = cv.height
    g.clearRect(0, 0, W, H)
    const frac = Math.min(1, mp.pos / mp.dur)
    const peaks = peaksFor(mp.track.filename)
    if (peaks) {
      const NN = peaks.rms.length
      for (let x = 0; x < W; x++) {
        const k = Math.floor((x / W) * NN)
        const played = x / W <= frac
        // silueta de picos tenue (contexto) + cuerpo RMS sólido (dinámica real)
        const hp = Math.max(1, (peaks.pk[k] || 0) * (H - 2))
        g.fillStyle = played ? 'rgba(34,211,238,0.22)' : 'rgba(148,163,184,0.14)'
        g.fillRect(x, (H - hp) / 2, 1, hp)
        const hr = Math.max(1, (peaks.rms[k] || 0) * (H - 4))
        g.fillStyle = played ? 'rgba(34,211,238,0.95)' : 'rgba(148,163,184,0.45)'
        g.fillRect(x, (H - hr) / 2, 1, hr)
      }
    } else {
      g.fillStyle = 'rgba(148,163,184,0.25)'
      g.fillRect(0, H / 2 - 2, W, 4)
      g.fillStyle = 'rgba(34,211,238,0.9)'
      g.fillRect(0, H / 2 - 2, W * frac, 4)
    }
    const mark = (sec, color) => {
      if (sec == null) return
      const x = (sec / mp.dur) * W
      g.fillStyle = color
      g.fillRect(x - 1, 0, 2, H)
    }
    // Mapa de secciones: ticks sutiles en cada frontera estructural
    for (const s of (mp.track.sections || [])) {
      const x = (s[0] / mp.dur) * W
      g.fillStyle = 'rgba(255,255,255,0.16)'
      g.fillRect(x, 0, 1, H)
    }
    // Candidatos de mezcla (mapa de secciones): líneas finas rosadas; el
    // mixOut elegido va sólido
    for (const c of (mp.track.mix?.outCandidates || [])) {
      const x = (c / mp.dur) * W
      g.fillStyle = 'rgba(244,63,94,0.4)'
      g.fillRect(x, 0, 1, H)
    }
    mark(mp.track.mix?.mixIn, '#fbbf24')
    mark(mp.track.mix?.mixOut, '#f43f5e')
  }, [mixProgress])

  const jumpToMixOut = () => {
    const mp = mixProgress
    const mo = mp?.track?.mix?.mixOut
    if (!mp?.dur || mo == null) return
    seekMixSession(Math.max(0, mo - 10) / mp.dur)
  }

  // ===== Alineador visual de DOS waveforms (pedido del dueño: "hacé correr
  // las dos waveforms así te ayudo") ==========================================
  // Outro de A arriba, intro de B abajo, misma escala de tiempo, línea
  // vertical = instante del enganche. Nudge de B (o A) en ms redibuja y se
  // escucha el solape real; Guardar persiste como cues manuales.
  const [alignEdit, setAlignEdit] = useState(null) // {A,B,bufA,bufB,offA,offB,loading}
  const alignCanvasARef = useRef(null)
  const alignCanvasBRef = useRef(null)
  const alignAudRef = useRef(null)

  const ALIGN_PRE = 2   // segundos antes del enganche visibles
  const ALIGN_WIN = 12  // ancho total de la ventana en segundos

  const drawWaveOn = (cv, buf, t0, t1, lineFrac, color) => {
    if (!cv || !buf) return
    const W = cv.width
    const H = cv.height
    const g = cv.getContext('2d')
    g.clearRect(0, 0, W, H)
    const data = buf.getChannelData(0)
    const sr = buf.sampleRate
    const i0 = Math.floor(Math.max(0, t0) * sr)
    const i1 = Math.min(data.length, Math.floor(t1 * sr))
    const spp = Math.max(1, Math.floor((i1 - i0) / W))
    g.fillStyle = color
    const xOff = t0 < 0 ? Math.floor((-t0 / (t1 - t0)) * W) : 0
    for (let x = xOff; x < W; x++) {
      let mn = 1
      let mx = -1
      const s = i0 + (x - xOff) * spp
      if (s >= i1) break
      for (let j = s; j < Math.min(i1, s + spp); j++) {
        const v = data[j]
        if (v < mn) mn = v
        if (v > mx) mx = v
      }
      const y1 = ((1 - mx) * H) / 2
      const y2 = ((1 - mn) * H) / 2
      g.fillRect(x, y1, 1, Math.max(1, y2 - y1))
    }
    g.fillStyle = '#f43f5e'
    g.fillRect(lineFrac * W - 1, 0, 2, H)
  }

  useEffect(() => {
    const ae = alignEdit
    if (!ae?.bufA || !ae?.bufB) return
    const lineFrac = ALIGN_PRE / ALIGN_WIN
    drawWaveOn(alignCanvasARef.current, ae.bufA, ae.offA - ALIGN_PRE, ae.offA + (ALIGN_WIN - ALIGN_PRE), lineFrac, 'rgba(251,191,36,0.8)')
    drawWaveOn(alignCanvasBRef.current, ae.bufB, ae.offB - ALIGN_PRE, ae.offB + (ALIGN_WIN - ALIGN_PRE), lineFrac, 'rgba(34,211,238,0.8)')
  }, [alignEdit])

  const openAlignEdit = async () => {
    const A = trackAnalysis(setTracks[0])
    const B = trackAnalysis(setTracks[1])
    if (!A?.mix?.mixOut || !B?.mix) { toast('Los primeros 2 temas tienen que estar analizados', 'error', 2500); return }
    setAlignEdit({ A, B, loading: true, offA: A.mix.mixOut, offB: B.mix.mixIn })
    try {
      const ctx = cueCtxRef.current || new (window.AudioContext || window.webkitAudioContext)()
      cueCtxRef.current = ctx
      const load = async (t) => {
        const res = await fetch(agentUrl('audio/' + encodeURIComponent(t.subfolder) + '/' + encodeURIComponent(t.filename)))
        if (!res.ok) throw new Error(`audio ${res.status}`)
        return ctx.decodeAudioData(await res.arrayBuffer())
      }
      const [bufA, bufB] = await Promise.all([load(A), load(B)])
      setAlignEdit({ A, B, bufA, bufB, offA: A.mix.mixOut, offB: B.mix.mixIn })
    } catch (e) {
      console.error('[ALIGN]', e)
      toast('No pude cargar los audios', 'error', 2500)
      setAlignEdit(null)
    }
  }

  const alignAudition = () => {
    const ae = alignEdit
    const ctx = cueCtxRef.current
    if (!ae?.bufA || !ctx) return
    try { alignAudRef.current?.forEach(s => s.stop()) } catch { /* ok */ }
    const mk = (buf) => {
      const g = ctx.createGain()
      g.connect(ctx.destination)
      const s = ctx.createBufferSource()
      s.buffer = buf
      s.connect(g)
      return { s, g }
    }
    const dA = mk(ae.bufA)
    const dB = mk(ae.bufB)
    dB.s.playbackRate.value = (ae.A.bpm && ae.B.bpm) ? ae.A.bpm / ae.B.bpm : 1
    dA.g.gain.value = 0.55
    dB.g.gain.value = 0.55
    const T0 = ctx.currentTime + 0.1
    dA.s.start(T0, Math.max(0, ae.offA - ALIGN_PRE))
    dB.s.start(T0 + ALIGN_PRE, Math.max(0, ae.offB))
    dA.s.stop(T0 + 10)
    dB.s.stop(T0 + 10)
    alignAudRef.current = [dA.s, dB.s]
  }

  const alignStop = () => { try { alignAudRef.current?.forEach(s => s.stop()) } catch { /* ok */ } }

  const alignSave = () => {
    const ae = alignEdit
    if (!ae) return
    alignStop()
    const cues = readUserCues()
    cues[ae.A.filename] = { ...(cues[ae.A.filename] || {}), mixOut: Math.round(ae.offA * 1000) / 1000 }
    cues[ae.B.filename] = { ...(cues[ae.B.filename] || {}), mixIn: Math.round(ae.offB * 1000) / 1000 }
    try { localStorage.setItem('mix_user_cues', JSON.stringify(cues)) } catch { /* sin storage */ }
    setUserCues(cues)
    toast('Alineación guardada — tus cues mandan sobre el análisis', 'success', 2500)
    setAlignEdit(null)
  }

  // ===== Motor Web Audio del SET COMPLETO (play real + modo Ensayo) =====
  // Mismo principio que el lab pero encadenado: todo agendado sobre el reloj
  // del AudioContext; el siguiente tema se decodifica mientras suena el
  // actual; cada enganche usa la receta del selector de esa transición
  // ('auto' decide por datos). El motor viejo queda para sets sin análisis.
  // Versión del motor de mezcla: SIEMPRE en la primera línea del log de cada
  // sesión — si el usuario reporta un problema y esta versión no coincide con
  // el último deploy, está corriendo un bundle viejo cacheado (PWA).
  const MIX_ENGINE_VERSION = 'v36-mapa-secciones'
  const OLD2RECIPE = { auto: 'auto', quick: 'short8', long: 'blend16', cut: 'cut', eqmix: 'eqmix' }

  // Auto-alineación por correlación (idea del dueño: "partir del primer bombo
  // y corregir con RMS"): con ambos buffers en RAM se correlaciona la
  // envolvente grave REAL de A alrededor del mixOut con la de B alrededor del
  // mixIn (±1.2 beats) y se corrige la entrada al pico — cada par se alinea
  // contra el audio, no contra el análisis. Mata errores de 1 beat y finos.
  const lowEnvSeg = (buf, center, halfWin) => {
    const sr = buf.sampleRate
    const data = buf.getChannelData(0)
    const from = Math.max(0, Math.floor((center - halfWin) * sr))
    const to = Math.min(data.length, Math.floor((center + halfWin) * sr))
    const step = Math.max(1, Math.floor(sr / 800))
    const N = Math.max(1, Math.floor(sr / 150))
    const out = []
    let acc = 0
    for (let i = from; i < to; i++) {
      acc += data[i]
      if (i - from >= N) acc -= data[i - N]
      if ((i - from) % step === 0) out.push(Math.abs(acc / N))
    }
    return { env: out, fs: sr / step }
  }
  const xcorrAlign = (bufA, posA, bufB, posB, beatLen) => {
    try {
      const half = Math.max(1.5, beatLen * 3)
      const A = lowEnvSeg(bufA, posA, half)
      const B = lowEnvSeg(bufB, posB, half)
      const fs = Math.min(A.fs, B.fs)
      const n = Math.min(A.env.length, B.env.length)
      const maxLag = Math.floor(beatLen * 1.2 * fs)
      let best = 0
      let bestV = -Infinity
      for (let lag = -maxLag; lag <= maxLag; lag++) {
        let s = 0
        for (let i = Math.max(0, -lag); i < Math.min(n, n - lag); i += 2) {
          s += A.env[i] * B.env[i + lag]
        }
        if (s > bestV) { bestV = s; best = lag }
      }
      return best / fs
    } catch { return 0 }
  }

  const waitUntilCtx = (ctx, t, session) => new Promise((resolve) => {
    const tick = () => {
      if (!session.active) return resolve(false)
      const remain = t - ctx.currentTime
      if (remain <= 0) return resolve(true)
      setTimeout(tick, Math.min(1000, Math.max(50, remain * 1000)))
    }
    tick()
  })

  // Agenda una transición receta-completa entre dos decks ya creados.
  // posMixA = posición (en el archivo de A) del punto de mezcla, para loop4.
  // Devuelve el ctx-time en que termina la transición. (El "dark B" del EQ
  // mix del lab acá se simplifica a blend16.)
  const scheduleTransition = (ctx, srcA, gA, srcB, gB, A, B, tMix, recipe, posMixA, master, fx = 'low') => {
    const bar = A.grid?.barLen || 240 / (A.bpm || 125)
    const beat = A.grid?.beatLen || bar / 4
    const now = ctx.currentTime
    const hpChain = (src, g, f0, f1, swapT) => {
      const hp = ctx.createBiquadFilter()
      hp.type = 'highpass'
      hp.Q.value = 0.7
      hp.frequency.setValueAtTime(f0, now)
      hp.frequency.setValueAtTime(f0, swapT - 0.1)
      hp.frequency.exponentialRampToValueAtTime(f1, swapT + 0.4)
      src.connect(hp)
      hp.connect(g)
    }
    let endT
    if (recipe === 'diag') {
      // Modo diagnóstico (pedido del dueño): B entra SIN filtro y casi a
      // pleno volumen desde el primer instante — los dos bombos juntos, el
      // corrimiento se escucha obvio.
      srcA.connect(gA)
      srcB.connect(gB)
      gA.gain.setValueAtTime(1, now)
      gB.gain.setValueAtTime(0.95, now)
      endT = tMix + 8 * bar
      gA.gain.setValueAtTime(1, endT - bar)
      gA.gain.setValueCurveAtTime(eqPowerCurve(false), endT - bar + 0.01, bar - 0.02)
    } else if (recipe === 'cut') {
      srcA.connect(gA)
      srcB.connect(gB)
      gA.gain.setValueAtTime(1, now)
      gB.gain.setValueAtTime(1, now)
      gA.gain.setValueCurveAtTime(eqPowerCurve(false), tMix, beat)
      endT = tMix + beat
    } else if (recipe === 'fade') {
      srcA.connect(gA)
      srcB.connect(gB)
      const fade = A.mix.recommendedFade || 12
      gA.gain.setValueAtTime(1, now)
      gB.gain.setValueAtTime(0, now)
      gA.gain.setValueCurveAtTime(eqPowerCurve(false), tMix, fade)
      gB.gain.setValueCurveAtTime(eqPowerCurve(true), tMix, fade)
      endT = tMix + fade
    } else if (recipe === 'loop4') {
      srcA.loop = true
      srcA.loopStart = posMixA
      srcA.loopEnd = posMixA + 4 * beat
      const swapT = tMix + 4 * bar
      hpChain(srcB, gB, 180, 25, swapT)
      hpChain(srcA, gA, 25, 220, swapT)
      gB.gain.setValueAtTime(0.0001, now)
      gB.gain.setValueAtTime(0.0001, tMix)
      gB.gain.linearRampToValueAtTime(0.55, tMix + bar)
      gB.gain.linearRampToValueAtTime(0.92, swapT)
      gB.gain.linearRampToValueAtTime(1, swapT + bar)
      gA.gain.setValueAtTime(1, now)
      gA.gain.setValueAtTime(1, tMix + 8 * bar)
      gA.gain.setValueCurveAtTime(eqPowerCurve(false), tMix + 8 * bar + 0.01, 2 * bar)
      endT = tMix + 10 * bar
    } else {
      // short2 (default: mezcla de ~4-5s, pedido del dueño) / short8 / blend16/eqmix
      const P = (recipe === 'blend16' || recipe === 'eqmix') ? [8, 16, 2]
        : recipe === 'short8' ? [4, 8, 1] : [1, 2, 0.5]
      const swapT = tMix + P[0] * bar
      endT = tMix + P[1] * bar
      const rise = P[2] * bar

      // ===== Banco de FX (catálogo para catar) =====
      const beatA = A.grid?.beatLen || bar / 4
      const isEcho = String(fx).startsWith('echo') || fx === 'filtro+echo'
      const sweepA = (type, f0, f1, q) => {
        const fl = ctx.createBiquadFilter()
        fl.type = type
        fl.Q.value = q
        fl.frequency.setValueAtTime(f0, now)
        fl.frequency.setValueAtTime(f0, swapT - 0.05)
        fl.frequency.exponentialRampToValueAtTime(f1, endT)
        srcA.connect(fl)
        fl.connect(gA)
      }
      const echoOut = (dtBeats, fbv, dark) => {
        const dl = ctx.createDelay(3.0)
        dl.delayTime.value = beatA * dtBeats
        const fb = ctx.createGain()
        fb.gain.value = fbv
        const wet = ctx.createGain()
        wet.gain.value = 0.0001
        srcA.connect(dl)
        if (dark) {
          const lp = ctx.createBiquadFilter()
          lp.type = 'lowpass'
          lp.frequency.value = 1200
          dl.connect(lp)
          lp.connect(fb)
        } else {
          dl.connect(fb)
        }
        fb.connect(dl)
        dl.connect(wet)
        if (master) wet.connect(master)
        wet.gain.setValueAtTime(0.0001, swapT - 0.05)
        wet.gain.exponentialRampToValueAtTime(0.5, swapT + 0.1)
        wet.gain.setValueAtTime(0.5, endT + 1)
        wet.gain.linearRampToValueAtTime(0.0001, endT + 3)
      }

      switch (fx) {
        case 'directo': srcB.connect(gB); srcA.connect(gA); break
        case 'hp-suave': srcB.connect(gB); sweepA('highpass', 25, 900, 0.7); break
        case 'hp-agresivo': srcB.connect(gB); sweepA('highpass', 25, 3200, 3); break
        case 'lp-suave': srcB.connect(gB); sweepA('lowpass', 16000, 250, 0.7); break
        case 'lp-reso': srcB.connect(gB); sweepA('lowpass', 16000, 300, 4); break
        case 'cruzado': hpChain(srcB, gB, 1200, 25, swapT); sweepA('lowpass', 16000, 250, 0.9); break
        case 'echo-slap': srcB.connect(gB); srcA.connect(gA); echoOut(0.5, 0.45, false); break
        case 'echo-dotted': srcB.connect(gB); srcA.connect(gA); echoOut(0.75, 0.5, false); break
        case 'echo-largo': srcB.connect(gB); srcA.connect(gA); echoOut(1, 0.6, false); break
        case 'echo-dark': srcB.connect(gB); srcA.connect(gA); echoOut(0.75, 0.65, true); break
        case 'echo-space': srcB.connect(gB); srcA.connect(gA); echoOut(2, 0.35, false); break
        case 'filtro+echo': srcB.connect(gB); sweepA('highpass', 25, 1600, 0.8); echoOut(0.75, 0.5, false); break
        case 'low':
        default:
          hpChain(srcB, gB, 180, 25, swapT)
          hpChain(srcA, gA, 25, 220, swapT)
      }

      // B entra A NIVEL (sin fade-in, pedido del dueño): micro-rampa anti-click
      // y listo — la "entrada" la hace el filtro, no el volumen. En 'directo'
      // (debug): volumen pleno al instante, golpe desnudo.
      gB.gain.setValueAtTime(0.0001, now)
      gB.gain.setValueAtTime(0.0001, tMix)
      // "Siempre con fade-in" (dueño): 1.2s de entrada real — 250ms sonaba a
      // "sin fade" porque el bombo pegaba pleno enseguida.
      if (fx === 'directo') {
        gB.gain.linearRampToValueAtTime(1, tMix + 1.2)
      } else {
        gB.gain.linearRampToValueAtTime(0.92, tMix + 1.2)
        gB.gain.setValueAtTime(0.92, Math.max(swapT, tMix + 1.25))
        gB.gain.linearRampToValueAtTime(1, swapT + rise)
      }
      gA.gain.setValueAtTime(1, now)
      gA.gain.setValueAtTime(1, swapT)
      if (isEcho && fx !== 'filtro+echo') {
        // corte seco: la cola del delay hace la despedida
        gA.gain.linearRampToValueAtTime(0.0001, swapT + Math.min(0.4, rise))
      } else {
        gA.gain.setValueCurveAtTime(eqPowerCurve(false), swapT + 0.01, endT - swapT - 0.01)
      }
    }
    srcA.stop(endT + 0.15)
    logMix(`  agenda [${recipe}/${fx}]: transición ${(endT - tMix).toFixed(1)}s (bar ${bar.toFixed(3)}s) | A para en +${(endT - tMix + 0.15).toFixed(1)}s`)
    return endT
  }

  const runMixSession = async (mode, opts = {}) => {
    if (labBusyRef.current) return
    labBusyRef.current = true
    const tracks = setTracks.map(trackAnalysis)
    if (tracks.length < 2 || tracks.some(t => !t)) {
      toast('El set tiene temas sin analizar — no se puede mezclar', 'error', 3000)
      return
    }
    onStop() // silenciar el player global
    setLabState('loading')
    const ctx = new (window.AudioContext || window.webkitAudioContext)()
    const session = { ctx, active: true, srcA: { stop() {} }, srcB: { stop() {} } }
    labRef.current = session
    const loadBuffer = async (t) => {
      const tload = performance.now()
      const url = agentUrl('audio/' + encodeURIComponent(t.subfolder) + '/' + encodeURIComponent(t.filename))
      const res = await fetch(url)
      if (!res.ok) throw new Error(`audio ${res.status}: ${t.filename}`)
      const buf = await ctx.decodeAudioData(await res.arrayBuffer())
      bufReadyRef.current.set(t.filename, buf)
      logMix(`decode "${t.title || t.filename}": ${((performance.now() - tload) / 1000).toFixed(1)}s (audio ${(buf.duration / 60).toFixed(1)}min)`)
      return buf
    }
    // Cache PERSISTENTE (ref del componente): cada tema se decodifica UNA vez
    // y sobrevive a seeks/re-sesiones. Cap de memoria: 10 temas.
    const bufCache = bufCacheRef.current
    const getBuffer = (t) => {
      if (!bufCache.has(t.filename)) {
        if (bufCache.size >= 10) {
          const oldest = bufCache.keys().next().value
          bufCache.delete(oldest)
          bufReadyRef.current.delete(oldest)
          wavePeaksRef.current.delete(oldest)
        }
        bufCache.set(t.filename, loadBuffer(t))
      }
      return bufCache.get(t.filename)
    }
    // Headroom: dos decks sumados a plena ganancia clipean el bus ("está
    // saturadísimo") — master a 0.65 + limitador antes de la salida.
    const master = ctx.createGain()
    master.gain.value = 0.516 // 0.65 − 2dB exactos (pedido del dueño)
    const limiter = ctx.createDynamicsCompressor()
    limiter.threshold.value = -6
    limiter.knee.value = 4
    limiter.ratio.value = 12
    limiter.attack.value = 0.003
    limiter.release.value = 0.25
    master.connect(limiter)
    limiter.connect(ctx.destination)
    const mkDeck = (buf) => {
      const g = ctx.createGain()
      g.connect(master)
      const s = ctx.createBufferSource()
      s.buffer = buf
      return { s, g }
    }
    const recipeFor = (i, A, B) => {
      // Modo Diag global: si la pill Diag está activa, TODA la sesión sale en
      // diagnóstico (B fuerte sin filtro) para escuchar el corrimiento.
      if (labRecipe === 'diag') return { recipe: 'diag', autoChosen: false }
      // Default del producto (pedido del dueño): enganche CLÁSICO por outro
      // (short8) para todas las transiciones. Otra receta solo si se eligió
      // explícita en esa transición; 'auto' (por datos) también explícito.
      const t = transitions[i]?.type
      if (!t || t === 'auto') return { recipe: 'short2', autoChosen: true }
      const sel = OLD2RECIPE[t] || 'short2'
      return { recipe: sel === 'auto' ? autoRecipe(A, B) : sel, autoChosen: false }
    }
    const pairInfo = (A, B) => `"${A.title || A.filename}" (${A.bpm}bpm q${A.grid?.quality ?? '?'}ms) -> "${B.title || B.filename}" (${B.bpm}bpm q${B.grid?.quality ?? '?'}ms)`
    logMix(`Sesión ${mode} [MOTOR ${MIX_ENGINE_VERSION}]: ${tracks.length} temas, anclaBombo=${labOpts.kickAnchor ? 'ON' : 'OFF'}`)
    tracks.forEach((t, i) => logMix(`  ${i + 1}. "${t.title || t.filename}" | ${t.bpm}bpm | grilla q${t.grid?.quality ?? '?'}ms beat ${t.grid?.beatLen ?? '?'}s | mixIn ${t.mix?.mixIn}s mixOut ${t.mix?.mixOut}s | ancla ${(gridDelta(t) * 1000).toFixed(0)}ms`))
    try {
      if (mode === 'ensayo') {
        // Solo los enganches: 8s de contexto -> transición real -> 6s del
        // tema nuevo -> corte y siguiente enganche. Audita el set en minutos.
        setLabState('playing')
        for (let i = 0; i < tracks.length - 1; i++) {
          if (!session.active) return
          const A = tracks[i]
          const B = tracks[i + 1]
          setMixSessionInfo({ mode, idx: i, label: `Ensayo ${i + 1}/${tracks.length - 1}: ${A.title || A.filename} → ${B.title || B.filename}` })
          const [bufA, bufB] = await Promise.all([getBuffer(A), getBuffer(B)])
          if (!session.active) return
          if (i + 2 < tracks.length) getBuffer(tracks[i + 2]) // prefetch del próximo segmento
          const dA = mkDeck(bufA)
          const dB = mkDeck(bufB)
          session.srcA = dA.s
          session.srcB = dB.s
          let rate = (A.bpm && B.bpm) ? A.bpm / B.bpm : 1
          // Sync SOLO con data confiable: si la grilla de cualquiera es
          // ficción (q>80), su BPM es inventado (caso Feels Like Us "131.5"
          // q151 → corrección del 7% basada en basura). Y tope ±8%.
          const qA = A.grid?.quality ?? 999
          const qB = B.grid?.quality ?? 999
          if (qA > 80 || qB > 80) {
            logMix(`AVISO: grilla no confiable (qA=${qA} qB=${qB}) — SIN sync de tempo, B nativo`)
            rate = 1
          } else if (!isFinite(rate) || Math.abs(rate - 1) > 0.08) {
            logMix(`AVISO: BPMs incompatibles (${A.bpm} -> ${B.bpm}, rate ${rate.toFixed(3)}) — B entra a tempo NATIVO`)
            rate = 1
          }
          dB.s.playbackRate.value = rate
          const entryFix = labOffsetRef.current / 1000
          const posA = barSnapPos(gridSafePos(A.mix.mixOut + (labOpts.kickAnchor ? gridDelta(A) : 0), A), A)
          let posB = gridSafePos(B.mix.mixIn + (labOpts.kickAnchor ? gridDelta(B) : 0) + entryFix, B)
          const alignFix = xcorrAlign(bufA, posA, bufB, posB, A.grid?.beatLen || 0.48)
          if (Math.abs(alignFix) > 0.005) {
            logMix(`  autoAlign RMS: ${(alignFix * 1000).toFixed(0)}ms`)
            posB = gridSafePos(posB + alignFix, B)
          }
          const T0 = ctx.currentTime + 0.5 // respiro deliberado entre enganches
          const preroll = 8
          const tMix = T0 + preroll
          dA.s.start(T0, Math.max(0, posA - preroll))
          dB.s.start(tMix, posB)
          session.posInfo = { idx: i, track: A, tRef: T0, posRef: Math.max(0, posA - preroll), dur: A.duration_sec || 0 }
          const { recipe } = recipeFor(i, A, B)
          const fx = labFxRef.current
          logMix(`Ensayo ${i + 1}/${tracks.length - 1}: ${pairInfo(A, B)} | receta ${recipe} fx=${fx} | rate ${rate.toFixed(4)} | mixOut ${posA.toFixed(2)}s (dur ${A.duration_sec}s) -> mixIn ${posB.toFixed(2)}s | offsetEntrada ${labOffsetRef.current}ms`)
          if (A.duration_sec && posA > A.duration_sec - 20) logMix(`AVISO: mixOut de "${A.title || A.filename}" está a ${(A.duration_sec - posA).toFixed(1)}s del final — probablemente cae en el fade`)
          const endT = scheduleTransition(ctx, dA.s, dA.g, dB.s, dB.g, A, B, tMix, recipe, posA, master, fx)
          const segEnd = endT + 6
          // Rampa a tempo NATIVO dentro del segmento: sin esto, el próximo
          // segmento arranca el mismo tema a otra velocidad ("acelera de golpe")
          if (rate !== 1) {
            dB.s.playbackRate.setValueAtTime(rate, endT)
            dB.s.playbackRate.linearRampToValueAtTime(1, segEnd)
          }
          dB.g.gain.setValueAtTime(1, segEnd - 0.05)
          dB.g.gain.linearRampToValueAtTime(0.0001, segEnd + 0.8)
          dB.s.stop(segEnd + 0.9)
          const ok = await waitUntilCtx(ctx, segEnd + 1, session)
          try { dA.s.stop() } catch { /* ya parado */ }
          try { dB.s.stop() } catch { /* ya parado */ }
          if (!ok) return
        }
        if (session.active) stopLabTransition()
      } else {
        // Set completo de corrido con el motor nuevo (con seek: opts.startIdx
        // + opts.startPos re-arman la cadena desde cualquier punto)
        setLabState('playing')
        const startIdx = Math.min(opts.startIdx || 0, tracks.length - 1)
        let A = tracks[startIdx]
        let deckA = mkDeck(await getBuffer(A))
        if (!session.active) return
        session.srcA = deckA.s
        const T0 = ctx.currentTime + 0.2
        const posStart = Math.max(0, opts.startPos != null
          ? Math.min(opts.startPos, Math.max(0, (A.mix.mixOut || A.duration_sec || 60) - 2))
          : (A.mix.mixIn || 0))
        deckA.s.start(T0, posStart)
        setMixSessionInfo({ mode, idx: startIdx, label: `Sonando: ${A.title || A.filename}` })
        session.posInfo = { idx: startIdx, track: A, tRef: T0, posRef: posStart, dur: A.duration_sec || 0 }
        logMix(`Play: "${A.title || A.filename}" desde ${posStart.toFixed(2)}s`)
        // timeAt(p): ctx-time en que el deck actual pasa por la posición p
        // (válido en el tramo post-rampa, cuando corre a rate 1)
        let timeAt = (p) => T0 + (p - posStart)
        for (let i = startIdx + 1; i < tracks.length; i++) {
          const B = tracks[i]
          const bufB = await getBuffer(B)
          if (!session.active) return
          if (i + 1 < tracks.length) getBuffer(tracks[i + 1]) // prefetch del que sigue
          const deckB = mkDeck(bufB)
          let rate = (A.bpm && B.bpm) ? A.bpm / B.bpm : 1
          const qA2 = A.grid?.quality ?? 999
          const qB2 = B.grid?.quality ?? 999
          if (qA2 > 80 || qB2 > 80) {
            logMix(`AVISO: grilla no confiable (qA=${qA2} qB=${qB2}) — SIN sync de tempo, B nativo`)
            rate = 1
          } else if (!isFinite(rate) || Math.abs(rate - 1) > 0.08) {
            logMix(`AVISO: BPMs incompatibles (${A.bpm} -> ${B.bpm}, rate ${rate.toFixed(3)}) — B entra a tempo NATIVO`)
            rate = 1
          }
          deckB.s.playbackRate.value = rate
          const posMixA = barSnapPos(A.mix.mixOut + (labOpts.kickAnchor ? gridDelta(A) : 0), A)
          let tMix = timeAt(posMixA)
          if (tMix < ctx.currentTime + 1) {
            // Decode tarde: NUNCA disparar en instante arbitrario (rompería la
            // fase) — correr el enganche de a compases enteros de A.
            const barA = A.grid?.barLen || 240 / (A.bpm || 125)
            const bars = Math.ceil((ctx.currentTime + 1 - tMix) / barA)
            tMix += bars * barA
            logMix(`AVISO: decode tarde — enganche corrido ${bars} compás(es) para preservar la fase`)
          }
          let posB = gridSafePos(B.mix.mixIn + (labOpts.kickAnchor ? gridDelta(B) : 0) + labOffsetRef.current / 1000, B)
          const bufAcur = bufReadyRef.current.get(A.filename)
          if (bufAcur) {
            const alignFix = xcorrAlign(bufAcur, posMixA, bufB, posB, A.grid?.beatLen || 0.48)
            if (Math.abs(alignFix) > 0.005) {
              logMix(`  autoAlign RMS: ${(alignFix * 1000).toFixed(0)}ms`)
              posB = gridSafePos(posB + alignFix, B)
            }
          }
          deckB.s.start(tMix, posB)
          session.srcB = deckB.s
          const { recipe } = recipeFor(i - 1, A, B)
          const fx = labFxRef.current
          logMix(`Enganche ${i}/${tracks.length - 1}: ${pairInfo(A, B)} | receta ${recipe} fx=${fx} | rate ${rate.toFixed(4)} | mixOut ${posMixA.toFixed(2)}s (dur ${A.duration_sec}s) -> mixIn ${posB.toFixed(2)}s | dispara en ${(tMix - ctx.currentTime).toFixed(1)}s`)
          if (A.duration_sec && posMixA > A.duration_sec - 20) logMix(`AVISO: mixOut de "${A.title || A.filename}" está a ${(A.duration_sec - posMixA).toFixed(1)}s del final — probablemente cae en el fade`)
          const endT = scheduleTransition(ctx, deckA.s, deckA.g, deckB.s, deckB.g, A, B, tMix, recipe, posMixA, master, fx)
          // B vuelve a su tempo nativo con rampa de 16 compases (~30s):
          // con el cap de ±8% queda <0.3%/s — imperceptible ("se acelera de
          // golpe" era la rampa corta de 4 compases)
          const D = 16 * (B.grid?.barLen || 240 / (B.bpm || 125))
          deckB.s.playbackRate.setValueAtTime(rate, endT)
          deckB.s.playbackRate.linearRampToValueAtTime(1, endT + D)
          // posición exacta de B al final de la rampa (integral del rate lineal)
          const posBRampEnd = posB + (endT - tMix) * rate + D * (rate + 1) / 2
          const rampEnd = endT + D
          const ok = await waitUntilCtx(ctx, endT + 0.5, session)
          if (!ok) return
          setMixSessionInfo({ mode, idx: i, label: `Sonando: ${B.title || B.filename}` })
          session.posInfo = { idx: i, track: B, tRef: rampEnd, posRef: posBRampEnd, dur: B.duration_sec || 0 }
          A = B
          deckA = deckB
          session.srcA = deckB.s
          timeAt = (p) => rampEnd + (p - posBRampEnd)
        }
        deckA.s.onended = () => { if (labRef.current === session) stopLabTransition() }
      }
    } catch (e) {
      console.error('[MIX SESSION]', e)
      logMix(`ERROR: ${e?.message || e}`)
      toast('Error en la mezcla del set', 'error', 3000)
      stopLabTransition()
    }
  }

  // Generador de playlists (estrategia POP/LATIN de la barra polimórfica).
  // 'auto' respeta los filtros activos (géneros + estrellas); los presets
  // (pop/latin/edm/top) son atajos curados. El límite lo pone el slot Límite:
  // minutos en destino digital, capacidad del disco en destino MiniDisc.
  // opts = { limitMin, genres, stars } para overrides síncronos desde onClick.
  const generateCuratedPlaylist = (preset, opts = {}) => {
    if (!allTracks.length) {
      toast('Cargando biblioteca...', 'info', 2000)
      return
    }
    lastPresetRef.current = preset
    let filtered = []
    if (preset === 'auto') {
      const gens = opts.genres !== undefined ? opts.genres : selectedGenres
      const stars = opts.stars !== undefined ? opts.stars : setSelectedStars
      filtered = allTracks.filter(t => (!gens.length || gens.includes(t.genre)) && (!stars.length || stars.includes(t.rating || 0)))
    } else if (preset === 'pop') {
      filtered = allTracks.filter(t => {
        const g = (t.genre || '').toLowerCase()
        const col = (t.collection || '').toLowerCase()
        return col === 'pop' || col === 'latin' || g.includes('pop') || g.includes('rock') || g.includes('cumbia')
      })
    } else if (preset === 'latin') {
      // SOLO ecosistema latino: colección latin o géneros latinos explícitos.
      // OJO: NADA de 'rock' como proxy de Rock Nacional — agarraba rock en inglés.
      filtered = allTracks.filter(t => {
        const g = (t.genre || '').toLowerCase()
        const col = (t.collection || '').toLowerCase()
        return col === 'latin' || ['cumbia', 'reggaeton', 'latin', 'salsa', 'bachata', 'dembow', 'rkt', 'merengue'].some(x => g.includes(x))
      })
    } else if (preset === 'edm') {
      filtered = allTracks.filter(t => {
        const g = (t.genre || '').toLowerCase()
        const col = (t.collection || '').toLowerCase()
        return col === 'edm' || g.includes('house') || g.includes('techno') || g.includes('trance') || g.includes('edm')
      })
    } else if (preset === 'top') {
      filtered = allTracks.filter(t => (t.rating || 0) >= 4)
    }

    // Sin relleno silencioso: si el filtro no encuentra nada, se dice y listo —
    // rellenar con cualquier cosa disfrazaba el vacío (bandas en inglés en "latino").
    if (!filtered.length) {
      toast('No hay temas de ese estilo en esta colección — bajá algunos primero', 'info', 3500)
      return
    }

    const targetMin = opts.limitMin !== undefined ? opts.limitMin : limitMin
    const targetSec = targetMin * 60
    let picked = []
    let currentSec = 0
    const pool = [...filtered].sort(() => Math.random() - 0.5)
    const gapSec = mdGap && isMd ? 2 : 0

    // Dedup por CANCIÓN (no por archivo): la biblioteca puede tener 6 versiones
    // de "Numb" (live/instrumental/acústica) y una playlist no repite tema.
    const songKey = (t) => `${t.artist || ''} ${t.title || t.filename || ''}`.toLowerCase()
      .replace(/\(.*?\)|\[.*?\]/g, ' ')
      .replace(/\b(feat|ft|featuring)\b.*$/g, ' ')
      .replace(/\.[a-z0-9]{2,4}$/, '')
      .replace(/[^a-z0-9áéíóúñü]+/g, ' ')
      .trim()
    const seenSongs = new Set()

    for (const t of pool) {
      const sk = songKey(t)
      if (sk && seenSongs.has(sk)) continue
      const dur = getTrackDurationSec(t)
      if (targetMin > 0 && currentSec + dur > targetSec) continue
      if (sk) seenSongs.add(sk)
      picked.push(t)
      currentSec += dur + gapSec
    }

    setSetTracks(orderSetByBpm(dedupeSetTracks(picked)))
    setTotalMin(Math.round(currentSec / 60))
    const presetName = preset === 'auto'
      ? `Playlist-${(collection || 'pop').toUpperCase()}`
      : preset === 'pop' ? 'Pop-Hits' : preset === 'latin' ? 'Pop-Latino' : preset === 'edm' ? 'EDM-Highlights' : 'Top-Stars'
    setSetName(presetName)
    toast(`"${presetName}": ${picked.length} temas (${Math.round(currentSec / 60)} min)`, 'success', 3500)
  }

  // Export MiniDisc J-Card sleeve text file
  const exportMDJCard = () => {
    const name = computeSetName()
    let txt = `========================================\n`
    txt += `  MINIDISC J-CARD / TRACKLIST\n`
    txt += `========================================\n`
    txt += `TITULO: ${name}\n`
    txt += `FORMATO: ${mdCapacity !== '0' ? 'MD ' + mdCapacity + ' min' : 'Sin limite'}\n`
    txt += `TRACKS: ${setTracks.length}\n`
    txt += `DURACION TOTAL: ${totalPlaylistMin} min\n`
    txt += `FECHA: ${new Date().toLocaleDateString()}\n`
    txt += `----------------------------------------\n\n`
    setTracks.forEach((t, i) => {
      const sec = getTrackDurationSec(t)
      const m = Math.floor(sec / 60)
      const s = String(sec % 60).padStart(2, '0')
      txt += `${String(i + 1).padStart(2, '0')}. ${t.artist || 'Desconocido'} - ${t.title || t.filename} [${m}:${s}]\n`
    })
    txt += `\n========================================\n`
    downloadFile(`${name}-MD-JCard.txt`, txt, 'text/plain;charset=utf-8')
    toast(`Carátula J-Card exportada (${name}-MD-JCard.txt)`)
  }

  // Etiqueta MD imprimible: tamaño FÍSICO real de la etiqueta de un MiniDisc
  // (54×38 mm, aprox. la pantalla de un Apple Watch). Encabezado + tracklist
  // numerado a 2 columnas. Las medidas van en mm para que imprima a escala 1:1;
  // el borde punteado es la guía de recorte.
  const printMDLabel = () => {
    if (!setTracks.length) { toast('Agregá temas a la lista primero', 'info', 2000); return }
    const name = computeSetName()
    const fecha = new Date().toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: '2-digit' })
    const esc = (s) => String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;')
    const rows = setTracks.map((t, i) =>
      `<div class="tr"><span class="n">${i + 1}</span><span class="t">${esc(`${t.artist ? t.artist + ' - ' : ''}${t.title || t.filename}`)}</span></div>`
    ).join('')
    const w = window.open('', '_blank', 'width=540,height=680')
    if (!w) { toast('El navegador bloqueó la ventana de impresión — permití popups', 'warning', 3500); return }
    w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>Etiqueta MD — ${esc(name)}</title>
<style>
  @page { size: A4 portrait; margin: 12mm }
  * { margin: 0; padding: 0; box-sizing: border-box; font-family: 'Segoe UI', Arial, sans-serif }
  body { padding: 8mm; color: #111; background: #fff }
  .hint { font-size: 9pt; color: #777; margin-bottom: 4mm }
  .label { width: 54mm; height: 38mm; border: 0.4mm dashed #999; border-radius: 1.5mm; padding: 1.8mm 2mm; overflow: hidden; display: flex; flex-direction: column }
  .hd { display: flex; justify-content: space-between; align-items: baseline; border-bottom: 0.3mm solid #111; padding-bottom: 0.8mm; margin-bottom: 1mm }
  .hd b { font-size: 6.5pt; text-transform: uppercase; letter-spacing: 0.2mm; max-width: 36mm; overflow: hidden; white-space: nowrap; text-overflow: ellipsis }
  .hd span { font-size: 4.5pt; color: #444; white-space: nowrap }
  .cols { flex: 1; column-count: 2; column-gap: 2mm; column-rule: 0.2mm solid #ccc }
  .tr { font-size: 4.2pt; line-height: 1.5; display: flex; gap: 0.8mm; break-inside: avoid }
  .tr .n { font-weight: 700; min-width: 2.4mm; text-align: right }
  .tr .t { overflow: hidden; white-space: nowrap; text-overflow: ellipsis }
</style></head><body>
  <div class="hint">Recortá por la línea punteada — tamaño real de etiqueta MiniDisc (54×38 mm)</div>
  <div class="label">
    <div class="hd"><b>${esc(name)}</b><span>${fecha} · ${setTracks.length}t · ${totalPlaylistMin}'</span></div>
    <div class="cols">${rows}</div>
  </div>
  <script>window.onload = function(){ setTimeout(function(){ window.print() }, 300) }<\/script>
</body></html>`)
    w.document.close()
  }

  // Reproducción continua de la lista — para CUALQUIER destino (escuchar el
  // set de corrido; el avance lo hace playNextRef). Con recording=true (destino
  // MiniDisc) además activa el modo grabación: REC, toast de finalizada y la
  // pausa 2s del Track Mark si está prendida.
  const startPlayAll = (recording = false) => {
    if (!setTracks.length) {
      toast('Agregá temas a la lista antes de reproducir', 'info', 2000)
      return
    }
    // Set analizado + Mixear ON (y sin grabación MD) -> motor Web Audio nuevo
    // (grilla + recetas). El motor viejo queda para listas sin análisis y MD.
    if (!recording && isMixMode && mixAvailable) {
      runMixSession('set')
      toast(`Mezclando el set con motor de grilla (${setTracks.length} temas)`, 'success', 3000)
      return
    }
    setIsRecordingMode(!!recording)
    onPlay(setTracks[0])
    toast(recording
      ? `Grabación MiniDisc iniciada (${setTracks.length} temas en Autoplay)`
      : `Reproduciendo la lista (${setTracks.length} temas seguidos)`, 'success', 3000)
  }
  const startMDAutoplay = () => startPlayAll(true)

  const addToSet = (track) => {
    // Bloquear otra versión/copia de una canción que ya está en el set
    const k = normDupeKey(track.filename || track.title || '')
    if (setTracks.some(t => normDupeKey(t.filename || t.title || '') === k)) {
      toast('Ese tema ya está en el set (otra versión/copia)', 'info', 2500)
      return
    }
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

  // Swap the set's track at `index` for another version (frontend only — the old
  // file stays in the library, per the chosen behavior).
  const replaceTrack = (index, version) => {
    setSetTracks(prev => prev.map((t, i) => (i === index ? version : t)))
  }

  // Other files in the library that are the same song (same normalized key),
  // including the current one (marked "actual" in the popover).
  const versionsOf = (track) => {
    const key = normDupeKey(track?.filename || '')
    return allTracks.filter(t => normDupeKey(t.filename) === key)
  }

  // Send a file to the Recycle Bin via the agent (reversible) and clean the
  // manifest. Without the agent only the manifest entry is removed — say so.
  const deleteFromDisk = async (track, index) => {
    try {
      if (agentConnected) {
        await agentFetch('delete-dupes', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ filenames: [track.filename] }),
        }).catch(() => {})
      }
      await fetch(`${API_BASE}/api/delete-dupes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filenames: [track.filename], username: authUser?.name || '' }),
      }).catch(() => {})
      setAllTracks(prev => prev.filter(t => t.filename !== track.filename))
      if (index != null) removeFromSet(index)
      toast(
        agentConnected ? 'Enviado a la Papelera' : 'Sacado de la biblioteca (sin agente el archivo queda en disco)',
        agentConnected ? 'success' : 'info', 3000,
      )
    } catch (e) {
      console.error('deleteFromDisk failed', e)
      toast('No se pudo borrar el archivo', 'error', 3000)
    }
  }

  // Close the version-swap popover when clicking outside it.
  useEffect(() => {
    if (!dupeCtx) return
    const close = () => setDupeCtx(null)
    window.addEventListener('click', close)
    return () => window.removeEventListener('click', close)
  }, [dupeCtx])

  const generateSet = async (m, overrideStars, overrideDuration, overrideSelectedStars, overrideGenres, overrideMode) => {
    const useMethod = m || method
    setMethod(useMethod)
    setGenerating(true)
    try {
      const selStars = overrideSelectedStars !== undefined ? overrideSelectedStars : setSelectedStars
      const gens = overrideGenres !== undefined ? overrideGenres : selectedGenres
      const res = await fetch(`${API_BASE}/api/generate-set`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ min_stars: overrideStars ?? minStars, selected_stars: selStars.length > 0 ? selStars : undefined, duration: overrideDuration ?? (isMd ? (parseInt(mdCapacity, 10) || 74) : duration), method: useMethod, genres: gens.length > 0 ? gens : undefined, collection: collection || 'edm', username: authUser?.name || '', seed: useMethod === 'pro' ? Math.floor(Math.random() * 1e9) : undefined, mode: useMethod === 'pro' ? (overrideMode ?? setProMode) : undefined }),
      })
      const data = await res.json()
      setSetTracks(orderSetByBpm(dedupeSetTracks(data.tracks || [])))
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
    const methodPart = slug(genStrategy === 'playlist' ? 'playlist' : (method || 'mix'))
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

  const runLabTest = async () => {
    setExporting(true)
    // Análisis pre-calculado en local (librosa 0.11 + grilla rígida, 2026-08-01)
    // para estos 2 archivos exactos. Es el fallback cuando el agente instalado
    // no expone /api/analyze-audio (el endpoint entró después de la v2.12.30).
    // Par elegido POR MEDICIÓN: ambos a 125.000 BPM exacto y clavados a grilla
    // (residuo 29.8ms / 8.4ms) — cero drift posible entre ellos.
    const LAB_TRACKS = [
      {
        filename: "05 - Olivier Giacomotto, Mila Journée - Smash It (Extended Mix).flac",
        subfolder: "Melodic Techno",
        title: "Smash It (Extended Mix)",
        artist: "Olivier Giacomotto, Mila Journée",
        rating: 5,
        precomputed: {
          bpm: 125.0, duration: 278.82,
          mix: { mixIn: 0.808, mixOut: 246.088, recommendedFade: 15.4 },
          grid: { offset: 0.3283, kickOffset: 0.4462, beatLen: 0.48, barLen: 1.92, quality: 29.8 },
        },
      },
      {
        filename: "DE SOFFER - Smalltown Boy.flac",
        subfolder: "Nu Disco",
        title: "Smalltown Boy",
        artist: "DE SOFFER",
        rating: 5,
        precomputed: {
          bpm: 125.0, duration: 226.56,
          mix: { mixIn: 0.515, mixOut: 210.755, recommendedFade: 12.8 },
          grid: { offset: 0.035, kickOffset: 0.023, beatLen: 0.48, barLen: 1.92, quality: 8.4 },
        },
      },
    ]
    try {
      const loaded = []
      for (const { precomputed, ...t } of LAB_TRACKS) {
        let a = null
        try {
          const r = await agentFetch('analyze-audio', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ filename: t.filename, subfolder: t.subfolder }),
          })
          if (r.ok) {
            const j = await r.json()
            if (j && !j.error && j.bpm && j.mix) a = j
          }
        } catch { /* agente sin el endpoint -> pre-cálculo */ }
        // Prioridad: agente vivo > cocina (JSON, tiene las anclas calibradas) > constante embebida
        if (!a) a = mixAnalysis[t.filename] || precomputed
        // in_subfolder es obligatorio: sin él getAudioUrl arma la URL sin la
        // subcarpeta y el audio da 404 al reproducir.
        loaded.push({ ...t, bpm: a.bpm, duration_sec: a.duration, mix: a.mix, grid: a.grid, in_subfolder: true })
      }
      setSetTracks(loaded)
      setTransitions({ 0: { type: 'auto' } })
      toast('Lab listo: 2 temas con markers de mezcla', 'success', 3000)
    } catch(e) {
      console.error(e)
      toast('Error preparando el lab', 'error', 3000)
    } finally {
      setExporting(false)
    }
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
        { icon: '⭐', text: <>Tocá <strong>estrellas</strong> para subir/bajar el corte de calidad — la lista se regenera al toque.</> },
        { icon: '🎛️', text: <>La <strong>barra de abajo</strong> tiene 3 partes: <strong>Generador</strong> (cambia según la colección), <strong>Límite</strong> (minutos o capacidad del disco) y <strong>Destino</strong>.</> },
        { icon: '🧠', text: <>En <strong>EDM</strong> el generador arma sets con <strong>Mixed in Key</strong> (Set Pro y métodos armónicos); en <strong>POP/LATIN</strong> arma playlists con presets curados.</> },
        { icon: '📀', text: <>Elegí <strong>MiniDisc</strong> como destino y el límite pasa a capacidad de disco (74/80/LP2), con etiqueta imprimible y grabación autoplay.</> },
        { icon: '📤', text: <>Destinos digitales: <strong>.m3u</strong> (Rekordbox playlist), <strong>.xml</strong> (con rating + BPM + key) o el <strong>mezclador</strong>.</> },
      ]} />
      {/* Controls: Generador, Regenerar, Tiempo/Duración, Estrellas y Búsqueda */}
      <div className="flex-shrink-0 flex items-center gap-2 md:gap-3 px-3 md:px-6 py-2 bg-[var(--bg-panel)] border-b border-[var(--border-color)] overflow-x-auto scrollbar-none">
        {/* 1. Generador + Regenerar */}
        <div className="flex items-center gap-1.5 flex-shrink-0">
          <span className="text-[10px] uppercase tracking-wider text-[var(--text-muted)] font-bold">Generador</span>
          {genStrategy === 'club' ? (
            <>
              <select
                value={method || 'pro'}
                onChange={e => {
                  const m = e.target.value
                  if (m === 'pro' && !selectedGenres.length) { setMethod('pro'); toast('Marcá un género arriba para Set Pro', 'info', 2500); return }
                  generateSet(m)
                }}
                className="px-2 py-1 rounded-lg text-xs font-semibold bg-[var(--bg-input)] border border-[var(--border-color)] text-[var(--text-primary)] focus:outline-none focus:border-[var(--color-accent)]"
              >
                <option value="pro">Set Pro</option>
                <option value="camelot">Camelot</option>
                <option value="energy">Energy</option>
                <option value="genre">Genre</option>
                <option value="peak">Peak</option>
              </select>

              {(method || 'pro') === 'pro' && (
                <div className="flex items-center gap-0.5 bg-[var(--bg-input)] border border-[var(--border-color)] rounded-lg p-0.5">
                  {[
                    { id: 'warmup', label: 'Warm-up' },
                    { id: 'peak', label: 'Peak' },
                    { id: 'closing', label: 'Closing' },
                  ].map(mo => (
                    <button
                      key={mo.id}
                      onClick={() => { setSetProMode(mo.id); if (method === 'pro' && setTracks.length > 0 && selectedGenres.length) generateSet('pro', undefined, undefined, undefined, undefined, mo.id) }}
                      className={`px-2 py-0.5 rounded text-[11px] font-semibold transition-all ${setProMode === mo.id ? 'bg-[var(--color-accent)] text-white' : 'text-[var(--text-muted)] hover:text-white'}`}
                    >
                      {mo.label}
                    </button>
                  ))}
                </div>
              )}

              <button
                onClick={() => { const m = method || 'pro'; generateSet(m) }}
                disabled={generating}
                className="flex items-center gap-1 px-3 py-1 rounded-lg text-xs font-bold text-[var(--color-accent-text)] disabled:opacity-50 active:scale-95 transition-all flex-shrink-0"
                style={{ background: 'var(--color-accent)' }}
                title="Generar set"
              >
                {generating
                  ? <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  : <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>}
                Generar
              </button>

              {/* REGENERAR BUTTON */}
              <button
                onClick={() => { const m = method || 'pro'; generateSet(m) }}
                disabled={generating}
                className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold bg-[var(--bg-input)] border border-[var(--border-color)] text-[var(--text-secondary)] hover:text-white transition-all active:scale-95 flex-shrink-0"
                title="Generar otra combinación variante del set"
              >
                <svg className="w-3.5 h-3.5 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
                Regenerar
              </button>
            </>
          ) : (
            <>
              {(collection === 'latin'
                ? [{ id: 'latin', label: 'Pop Latino' }, { id: 'top', label: 'Top ★' }]
                : [{ id: 'pop', label: 'Pop Hits' }, { id: 'latin', label: 'Pop Latino' }, { id: 'top', label: 'Top ★' }]
              ).map(c => (
                <button
                  key={c.id}
                  onClick={() => generateCuratedPlaylist(c.id)}
                  className="px-2 py-1 rounded-lg text-xs font-semibold bg-[var(--bg-input)] border border-[var(--border-color)] text-[var(--text-secondary)] hover:text-white transition-all"
                >
                  {c.label}
                </button>
              ))}
              <button
                onClick={() => generateCuratedPlaylist(lastPresetRef.current || 'auto')}
                className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold bg-[var(--bg-input)] border border-[var(--border-color)] text-emerald-400 hover:text-emerald-300 transition-all"
                title="Regenerar playlist"
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
                Regenerar
              </button>
            </>
          )}
        </div>

        <div className="w-px h-5 bg-[var(--border-color)] flex-shrink-0" />

        {/* 2. Límite / Tiempo (Duración) */}
        <div className="flex items-center gap-1.5 flex-shrink-0">
          <span className="text-[10px] uppercase tracking-wider text-[var(--text-muted)] font-bold">Tiempo</span>
          {[60, 90, 120, ...(genStrategy === 'playlist' ? [0] : [])].map(d => (
            <button
              key={d}
              onClick={() => { setDuration(d); if (genStrategy === 'playlist') generateCuratedPlaylist(lastPresetRef.current || 'auto', { limitMin: d }); else if (method) generateSet(method, undefined, d) }}
              className={`px-2 py-1 rounded-lg text-xs font-semibold transition-all ${duration === d ? 'bg-[var(--color-accent)] text-white' : 'bg-[var(--bg-input)] border border-[var(--border-color)] text-[var(--text-muted)] hover:text-white'}`}
            >
              {d === 0 ? 'Sin límite' : `${d}'`}
            </button>
          ))}
          <span className="text-[11px] font-mono text-emerald-400 font-bold whitespace-nowrap pl-1">
            {setTracks.length}t · ~{totalPlaylistMin || totalMin}'
          </span>
        </div>

        <div className="w-px h-5 bg-[var(--border-color)] flex-shrink-0 hidden lg:block" />

        {/* 3. Star filter */}
        <div className="hidden lg:flex items-center gap-1 flex-shrink-0">
          <button
            onClick={() => { setSetSelectedStars([]); setMinStars(1); if (genStrategy === 'playlist') generateCuratedPlaylist(lastPresetRef.current || 'auto', { stars: [] }); else if (method) generateSet(method, 1, undefined, []) }}
            className={`px-2 py-1 rounded text-xs transition-all ${setSelectedStars.length === 0 ? 'bg-[var(--color-accent)]/20 text-white font-bold' : 'text-gray-400 hover:text-white'}`}
          >All</button>
          {[1, 2, 3, 4, 5].map(s => (
            <button
              key={s}
              onClick={() => {
                const next = setSelectedStars.includes(s) ? setSelectedStars.filter(x => x !== s) : [...setSelectedStars, s]
                setSetSelectedStars(next)
                const newMin = next.length > 0 ? Math.min(...next) : 1
                setMinStars(newMin)
                if (genStrategy === 'playlist') generateCuratedPlaylist(lastPresetRef.current || 'auto', { stars: next })
                else if (method) generateSet(method, newMin, undefined, next)
              }}
              className={`px-1.5 py-1 rounded text-xs transition-all ${setSelectedStars.includes(s) ? 'bg-[var(--color-accent)]/20 text-white font-bold' : 'text-gray-400 hover:text-white'}`}
            >
              {'★'.repeat(s)}
            </button>
          ))}
        </div>

        {/* 4. Search inline */}
        <div className="flex-1 min-w-32 md:min-w-44 relative flex-shrink-0">
          <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="Agregar track..."
            className="w-full pl-8 pr-3 py-1 bg-[var(--bg-input)] border border-gray-700 rounded-lg text-xs text-[var(--text-primary)] placeholder-gray-600 focus:outline-none focus:border-[var(--color-accent)] transition-colors"
          />
        </div>
      </div>

      {/* Genre pills - single scrollable row */}
      {availableGenres.length > 0 && (
        <div className="flex-shrink-0 flex items-center gap-1 px-3 md:px-6 py-1.5 bg-[var(--bg-panel)] border-b border-[var(--border-color)] overflow-x-auto scrollbar-none">
          <button
            onClick={() => { setSelectedGenres([]); if (genStrategy === 'playlist') generateCuratedPlaylist(lastPresetRef.current || 'auto', { genres: [] }); else if (method) generateSet(method, undefined, undefined, undefined, []) }}
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
                  if (genStrategy === 'playlist') generateCuratedPlaylist(lastPresetRef.current || 'auto', { genres: next })
                  else if (method) generateSet(method, undefined, undefined, undefined, next)
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

      {/* Set Pro y MiniDisc Studio: absorbidos por la barra polimorfica de abajo (Generador | Limite | Destino). */}

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

      {/* ═══ COMPACT DJ SET HEADER BAR (ULTRA-SLIM) ═══ */}
      {setTracks.length > 0 && (
        <div className="flex-shrink-0 px-3 md:px-6 py-2 bg-[var(--bg-panel)] border-b border-[var(--border-color)] flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            {/* Mini Cover Thumbnail */}
            <div className="w-9 h-9 rounded-lg overflow-hidden border border-white/10 flex-shrink-0 bg-black/40 relative">
              {setTracks[0]?.artwork ? (
                <img src={setTracks[0].artwork} alt="" className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-xs">🎧</div>
              )}
            </div>

            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-purple-500/20 text-purple-300 border border-purple-500/30">
                  Set DJ Local
                </span>
                <span className="text-xs md:text-sm font-bold text-white truncate max-w-[220px] sm:max-w-[350px] md:max-w-[500px]">
                  {computeSetName()}
                </span>
              </div>
              <div className="text-[11px] text-[var(--text-muted)] flex items-center gap-2 mt-0.5">
                <span className="font-mono text-emerald-400 font-semibold">{setTracks.length} tracks</span>
                <span>•</span>
                <span className="font-mono">{totalPlaylistMin} min</span>
                <span>•</span>
                <span>Colección {(collection || 'EDM').toUpperCase()}</span>
              </div>
            </div>
          </div>

          {/* Header Action Row (Spotify Exact Design) */}
          <div className="flex items-center gap-3 flex-wrap">
            {/* Circular Spotify Play Button — se vuelve Stop con la sesión Web Audio activa */}
            <button
              onClick={() => (labState ? stopLabTransition() : startPlayAll(false))}
              disabled={!setTracks.length && !labState}
              className={`w-10 h-10 rounded-full ${labState ? 'bg-red-500 hover:bg-red-400' : 'bg-emerald-500 hover:bg-emerald-400'} text-black flex items-center justify-center shadow-lg hover:scale-105 active:scale-95 transition-all disabled:opacity-40 flex-shrink-0`}
              title={labState ? 'Detener la mezcla' : (isMixMode && mixAvailable ? 'Mezclar el set con motor de grilla (Mixear ON)' : 'Reproducir lista')}
            >
              {labState
                ? <svg className="w-4 h-4 fill-current" viewBox="0 0 24 24"><rect x="6" y="6" width="12" height="12" rx="1" /></svg>
                : <svg className="w-5 h-5 fill-current ml-0.5" viewBox="0 0 24 24"><path d="M8 5v14l11-7z" /></svg>}
            </button>
            {mixSessionInfo && (
              <span className="text-xs font-semibold text-cyan-300 truncate max-w-[340px]">{mixSessionInfo.label}</span>
            )}
            {mixProgress && (
              <div className="w-full flex items-center gap-2">
                <span className="text-[10px] font-mono text-gray-400 w-10 text-right">
                  {Math.floor(mixProgress.pos / 60)}:{String(Math.floor(mixProgress.pos % 60)).padStart(2, '0')}
                </span>
                <canvas
                  ref={progCanvasRef}
                  width={600}
                  height={36}
                  className="flex-1 h-9 rounded-lg bg-black/30 cursor-pointer"
                  title="Waveform del tema sonando — click para adelantar (ámbar = mixIn, rojo = mixOut)"
                  onClick={(e) => {
                    if (mixSessionInfo?.mode !== 'set') return // en Ensayo no hay seek
                    const r = e.currentTarget.getBoundingClientRect()
                    seekMixSession((e.clientX - r.left) / r.width)
                  }}
                />
                <span className="text-[10px] font-mono text-gray-500 w-10">
                  {mixProgress.dur > 0 ? `${Math.floor(mixProgress.dur / 60)}:${String(Math.floor(mixProgress.dur % 60)).padStart(2, '0')}` : '--:--'}
                </span>
                <button
                  onClick={markZeroHere}
                  className="px-2.5 py-1 rounded-lg text-[10px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/50 transition-all active:scale-95"
                  title="Marca la posición actual como 0.0.0 (mixIn manual) del tema que está sonando"
                >
                  0.0.0 acá
                </button>
                <button
                  onClick={jumpToMixOut}
                  className="px-2.5 py-1 rounded-lg text-[10px] font-bold bg-rose-500/20 text-rose-300 border border-rose-500/50 transition-all active:scale-95"
                  title="Saltar a 10 segundos antes del mixOut del tema que está sonando"
                >
                  Saltar al enganche
                </button>
              </div>
            )}
            {mixLog.length > 0 && (
              <details className="w-full">
                <summary className="text-[11px] text-[var(--text-muted)] cursor-pointer select-none">Log de mezcla ({mixLog.length})</summary>
                <pre className="mt-1 max-h-44 overflow-y-auto text-[10px] leading-relaxed text-gray-400 bg-black/30 rounded-lg p-2 whitespace-pre-wrap">{mixLog.join('\n')}</pre>
              </details>
            )}

            {/* Action Pills */}
            <div className="flex items-center gap-2 flex-wrap">
              <button
                onClick={() => {
                  const el = document.getElementById('set-bottom-panel')
                  if (el) el.scrollIntoView({ behavior: 'smooth' })
                }}
                className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-white/10 hover:bg-white/20 text-white text-xs font-semibold border border-white/10 transition-all active:scale-95"
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" /></svg>
                Agregar
              </button>

              {/* Mixear solo aparece con el set completo analizado (la cocina):
                  sin análisis no hay mezcla — reproducción lista simple. */}
              {mixAvailable && (
                <button
                  onClick={() => setIsMixMode(!isMixMode)}
                  className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-bold transition-all active:scale-95 border ${
                    isMixMode
                      ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/60 shadow-[0_0_12px_rgba(16,185,129,0.25)]'
                      : 'bg-white/10 hover:bg-white/20 text-white border-white/10'
                  }`}
                  title="Activar/Desactivar Modo Mezcla (Mixear)"
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" /></svg>
                  {isMixMode ? 'Mixear ON' : 'Mixear'}
                </button>
              )}
              {/* Ensayo: audita SOLO los enganches del set (8s antes de cada
                  mixOut -> transición real -> 6s del entrante -> siguiente) */}
              {mixAvailable && isMixMode && (
                <>
                  <button
                    onClick={() => (labState ? stopLabTransition() : runMixSession('ensayo'))}
                    className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-bold bg-cyan-500/20 text-cyan-300 border border-cyan-500/50 transition-all active:scale-95"
                    title="Escuchar solo las transiciones del set, una atrás de otra, sin los temas enteros"
                  >
                    <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M13 5l7 7-7 7M5 5l7 7-7 7" /></svg>
                    Ensayo
                  </button>
                  {/* Slider de calibración: corre la ENTRADA del tema B en ms.
                      Positivo = B entra antes (corrige "entra apenas atrás").
                      Aplica al próximo play/segmento; persiste. */}
                  <div
                    className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white/5 border border-white/10"
                    title="Calibración de entrada del tema B. Positivo = entra antes. Se aplica al próximo play o al próximo enganche del Ensayo; queda guardado."
                  >
                    <span className="text-[10px] text-gray-400 whitespace-nowrap">Entrada</span>
                    <input
                      type="range"
                      min="-100"
                      max="100"
                      step="5"
                      value={labOffsetMs}
                      onChange={(e) => setLabOffsetMs(parseInt(e.target.value, 10))}
                      className="w-28 accent-cyan-400"
                    />
                    <span className="text-[10px] font-mono text-cyan-300 w-11 text-right">{labOffsetMs > 0 ? '+' : ''}{labOffsetMs}ms</span>
                    {labOffsetMs !== 0 && (
                      <button onClick={() => setLabOffsetMs(0)} className="text-[10px] text-gray-500 hover:text-white" title="Volver a 0">0</button>
                    )}
                  </div>
                </>
              )}

              <button
                onClick={() => {
                  const newName = prompt('Nombre del Set / Playlist:', setName || computeSetName())
                  if (newName !== null) setSetName(newName)
                }}
                className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-white/10 hover:bg-white/20 text-white text-xs font-semibold border border-white/10 transition-all active:scale-95"
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>
                Nombre y datos
              </button>

              <button
                onClick={() => onEditMix(setTracks)}
                disabled={!setTracks.length}
                className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-purple-600/30 hover:bg-purple-600/50 text-purple-200 border border-purple-500/40 text-xs font-semibold transition-all active:scale-95 disabled:opacity-40"
                title="Editor DAW Multitrack"
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" d="M4 7h16M4 12h16M4 17h16" /><circle cx="15" cy="7" r="2" fill="currentColor" /><circle cx="9" cy="12" r="2" fill="currentColor" /><circle cx="13" cy="17" r="2" fill="currentColor" /></svg>
                Editor DAW
              </button>
            </div>
          </div>
        </div>
      )}

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
          <div
            onDragOver={(e) => {
              // Accept drops from the bottom panel (Sugerencias/Biblioteca)
              if (e.dataTransfer.types.includes('text/plain')) e.preventDefault()
            }}
            onDrop={(e) => {
              const filename = e.dataTransfer.getData('text/plain')
              if (!filename) return
              const candidate = suggestions.find(s => s.filename === filename) || allTracks.find(t => t.filename === filename)
              if (candidate && !setTracks.some(t => t.filename === filename)) addToSet(candidate)
            }}
          >
            {/* Spotify Track Table Header */}
            <div className="flex items-center gap-2 md:gap-3 px-3 md:px-6 py-2 border-b border-white/10 text-[11px] font-bold uppercase tracking-wider text-gray-400 bg-black/40 sticky top-0 backdrop-blur-md z-20">
              <span className="w-5 md:w-6 text-center">#</span>
              <span className="w-6" /> {/* Play button space */}
              <span className="w-8" /> {/* Thumb space */}
              <span className="flex-1">Título</span>
              <span className="hidden lg:block w-24 text-center">Género</span>
              <span className="w-16 md:w-20 text-center">BPM</span>
              <span className="hidden sm:block w-14 text-center">Clave</span>
              <span className="hidden sm:block w-12 text-center font-mono">Duración</span>
              <span className="w-10 text-center" />
            </div>

            {setTracks.map((t, i) => {
              const isPlaying = playing === t.filename
              return (
                <React.Fragment key={t.filename || i}>
                  <div
                    draggable
                    onDragStart={(e) => {
                      const url = getAudioUrl(t, agentConnected)
                      e.dataTransfer.effectAllowed = 'copy'
                      e.dataTransfer.setData('text/uri-list', url)
                      e.dataTransfer.setData('text/plain', url)
                      e.dataTransfer.setData('DownloadURL', `audio/mpeg:${t.filename}:${url}`)
                    }}
                    onContextMenu={(e) => { e.preventDefault(); setDupeCtx({ x: e.clientX, y: e.clientY, index: i, track: t }) }}
                    className={`flex items-center gap-2 md:gap-3 px-3 md:px-6 py-1.5 md:py-2 transition-all duration-150 border-b border-white/5 cursor-grab active:cursor-grabbing ${
                      isPlaying ? 'bg-emerald-500/10 border-emerald-500/30' : 'hover:bg-white/5'}`}
                  >
                    {/* Move buttons */}
                    <div className="flex flex-col gap-0.5 flex-shrink-0">
                      <button
                        onClick={() => moveTrack(i, i - 1)}
                        disabled={i === 0}
                        className="w-5 h-3 flex items-center justify-center text-gray-600 hover:text-white disabled:opacity-20 transition-colors"
                      >
                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 15l7-7 7 7" /></svg>
                      </button>
                      <button
                        onClick={() => moveTrack(i, i + 1)}
                        disabled={i === setTracks.length - 1}
                        className="w-5 h-3 flex items-center justify-center text-gray-600 hover:text-white disabled:opacity-20 transition-colors"
                      >
                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M19 9l-7 7-7-7" /></svg>
                      </button>
                    </div>

                    {/* Number or Animated Equalizer */}
                    {isPlaying ? (
                      <div className="w-5 md:w-6 flex items-center justify-center flex-shrink-0">
                        <svg className="w-4 h-4 text-emerald-400" viewBox="0 0 24 24" fill="currentColor">
                          <rect x="3" y="8" width="3" height="8" rx="1" className="animate-pulse" />
                          <rect x="9" y="4" width="3" height="16" rx="1" className="animate-pulse" style={{ animationDelay: '150ms' }} />
                          <rect x="15" y="10" width="3" height="6" rx="1" className="animate-pulse" style={{ animationDelay: '300ms' }} />
                        </svg>
                      </div>
                    ) : (
                      <span className="w-5 md:w-6 text-center text-xs text-gray-500 font-mono flex-shrink-0">{i + 1}</span>
                    )}

                    <PlayPauseBtn isPlaying={isPlaying} onClick={() => handlePlay(t)} />
                    <TrackThumb src={t.artwork} />

                    <div className="flex-1 min-w-0">
                      <div className={`text-xs md:text-sm truncate flex items-center gap-1.5 ${isPlaying ? 'font-bold text-emerald-400' : 'text-white font-medium'}`}>
                        {t.is_classic && <span className="flex-shrink-0 text-[9px] font-bold px-1 py-0.5 rounded bg-amber-500/25 text-amber-400">CLÁSICO</span>}
                        {t.beatport_pos && <span className="flex-shrink-0 text-[9px] font-bold px-1 py-0.5 rounded bg-green-500/20 text-green-400">BP#{t.beatport_pos}</span>}
                        <span className="truncate">{t.artist ? `${t.artist} - ` : ''}{t.title || t.filename}</span>
                      </div>
                    </div>

                    <span className="hidden lg:block w-24 flex-shrink-0 text-xs text-gray-400 truncate text-center">{t.genre || '-'}</span>

                    {/* BPM Column */}
                    <span className="w-16 md:w-20 flex-shrink-0 text-xs font-mono font-bold text-emerald-400 text-center">
                      {t.bpm ? `${t.bpm} BPM` : '128 BPM'}
                    </span>

                    {/* Key Column */}
                    <span className={`hidden sm:block w-14 flex-shrink-0 text-[10px] md:text-xs font-mono px-1 py-0.5 rounded text-center ${
                      i > 0 && t.camelot === setTracks[i-1].camelot ? 'bg-green-500/20 text-green-400' : 'bg-amber-500/20 text-amber-400'
                    }`}>
                      {t.key}{t.camelot ? ` · ${t.camelot}` : ''}
                    </span>

                    {/* Duration Column */}
                    <span className="hidden sm:block w-12 flex-shrink-0 text-xs text-gray-400 font-mono text-center">{(() => {
                      const sec = t.duration_ms ? Math.round(t.duration_ms / 1000) : t.duration_sec ? Math.round(t.duration_sec) : t.duration ? Math.round(t.duration) : 0
                      if (sec > 0) return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`
                      return t.duration_est ? `~${t.duration_est}m` : '—'
                    })()}</span>

                    <button
                      onClick={(e) => { e.stopPropagation(); openCueEdit(t, 'in') }}
                      className="flex-shrink-0 text-[9px] font-bold text-amber-300/80 hover:text-amber-200 border border-amber-500/30 hover:border-amber-400/60 rounded px-1.5 py-0.5 transition-all"
                      title="Editor 0.0.0: marcar a mano el punto exacto de entrada (primer bombo) sobre la waveform — tu marca pisa al análisis"
                    >
                      0.0.0
                    </button>
                    <button
                      onClick={() => removeFromSet(i)}
                      className="w-6 h-6 flex items-center justify-center rounded-full text-gray-500 hover:text-red-400 hover:bg-red-500/10 transition-all duration-200 active:scale-95 flex-shrink-0"
                      title="Quitar del set"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>

                  {/* SPOTIFY DJ TRANSITION CONNECTOR BADGE BETWEEN TRACKS */}
                  {isMixMode && i < setTracks.length - 1 && (
                    <div className="relative py-0.5 flex items-center justify-center my-0 group">
                      {/* Vertical line connecting track rows */}
                      <div className="absolute top-0 bottom-0 left-10 md:left-14 w-0.5 bg-gradient-to-b from-emerald-500/40 via-blue-500/30 to-purple-500/40 group-hover:w-1 transition-all" />

                      {/* Transition Pill Badge Button */}
                      {(() => {
                        const badge = getTransitionBadge(transitions[i])
                        return (
                          <button
                            onClick={() => setActiveTransitionPopover(activeTransitionPopover === i ? null : i)}
                            className={`relative z-10 flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-zinc-950/90 border ${badge.color} text-[10px] font-bold backdrop-blur-md hover:scale-105 active:scale-95 transition-all shadow cursor-pointer`}
                            title="Click para cambiar el tipo de mezcla/transición"
                          >
                            <span>{badge.label}</span>
                            <svg className="w-2.5 h-2.5 opacity-60" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                          </button>
                        )
                      })()}

                      {/* Transition Popover */}
                      {activeTransitionPopover === i && (
                        <TransitionPopover
                          track1={t}
                          track2={setTracks[i + 1]}
                          currentTransition={transitions[i] || { type: 'auto' }}
                          onSelect={(newTrans) => {
                            setTransitions(prev => ({ ...prev, [i]: newTrans }))
                            setActiveTransitionPopover(null)
                          }}
                          onClose={() => setActiveTransitionPopover(null)}
                        />
                      )}
                    </div>
                  )}
                </React.Fragment>
              )
            })}
          </div>
        )}
      </div>

      {/* Bottom panel — tabbed: Sugerencias (3×4) | Biblioteca (browse all).
          Sits OUTSIDE the scrollable tracklist so it always shows the same
          4 rows regardless of how many tracks are in the playlist above. */}
      {setTracks.length > 0 && (() => {
          // Filter library by current selectedGenres + minStars + search.
          const setIds = new Set(setTracks.map(t => t.filename))
          const q = libBrowserSearch.trim().toLowerCase()
          const filteredLib = allTracks.filter(t => {
            if (setIds.has(t.filename)) return false
            if ((t.rating || 0) < minStars) return false
            if (libBrowserGenre && t.genre !== libBrowserGenre) return false
            if (!libBrowserGenre && selectedGenres.length > 0 && !selectedGenres.includes(t.genre)) return false
            if (!q) return true
            const hay = `${t.artist || ''} ${t.title || ''} ${t.filename}`.toLowerCase()
            return hay.includes(q)
          })
          // Sort
          const sortedLib = [...filteredLib].sort((a, b) => {
            switch (libBrowserSort) {
              case 'artist': return (a.artist || '').localeCompare(b.artist || '')
              case 'bpm':    return (b.bpm || 0) - (a.bpm || 0)
              case 'key':    return (a.camelot || a.key || '').localeCompare(b.camelot || b.key || '')
              case 'recent': return (b.added_at || 0) - (a.added_at || 0)
              case 'rating':
              default:       return (b.rating || 0) - (a.rating || 0)
            }
          })
          const PAGE = 12
          const totalPages = Math.max(1, Math.ceil(sortedLib.length / PAGE))
          const safePage = Math.min(libBrowserPage, totalPages - 1)
          const libPaged = libBrowserShowAll ? sortedLib : sortedLib.slice(safePage * PAGE, safePage * PAGE + PAGE)
          const list = bottomTab === 'sugerencias' ? suggestions.slice(suggestionOffset, suggestionOffset + PAGE) : libPaged
          // Render row for either tab — both use same shape.
          const renderRow = (s) => {
            const isPlaying = playing === s.filename
            return (
              <div
                key={s.filename}
                draggable
                onDragStart={(e) => { e.dataTransfer.effectAllowed = 'copy'; e.dataTransfer.setData('text/plain', s.filename) }}
                onDoubleClick={() => handlePlay(s)}
                className={`flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-[var(--bg-hover)] transition-colors cursor-grab active:cursor-grabbing min-w-0 ${isPlaying ? 'bg-white/5' : 'bg-[var(--bg-input)]/40'}`}
              >
                <PlayPauseBtn isPlaying={isPlaying} onClick={(e) => { e.stopPropagation(); handlePlay(s) }} size="sm" />
                <div className="flex-1 min-w-0">
                  <div className={`text-xs truncate ${isPlaying ? 'text-[var(--color-accent)]' : 'text-[var(--text-primary)]'}`}>{s.artist ? `${s.artist} - ` : ''}{s.title || s.filename}</div>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <span className={`text-[9px] font-mono px-1 py-0.5 rounded ${s.distance != null && s.distance <= 1 ? 'bg-green-500/20 text-green-400' : 'bg-amber-500/20 text-amber-400'}`}>
                      {s.camelot || s.key || '—'}
                    </span>
                    <span className={`text-[9px] font-bold ${s.format === 'FLAC' ? 'text-purple-400' : 'text-gray-500'}`}>{(s.format || '').toUpperCase()}</span>
                    {s.rating ? <span className="text-[9px] text-yellow-400">{'★'.repeat(s.rating)}</span> : null}
                  </div>
                </div>
                <button
                  onClick={() => addToSet(s)}
                  className="w-7 h-7 flex items-center justify-center rounded-md text-[var(--color-accent-text)] transition-all duration-200 active:scale-95 flex-shrink-0"
                  style={{ background: 'var(--color-accent)' }}
                  title="Agregar al set"
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 6v6m0 0v6m0-6h6m-6 0H6" /></svg>
                </button>
              </div>
            )
          }
          return (
            <div className="flex-shrink-0 border-t border-[var(--border-color)]">
              {/* Tab strip */}
              <div className="flex items-center gap-1 px-3 md:px-6 py-2 bg-[var(--bg-panel)]">
                <button
                  onClick={() => setBottomTab('sugerencias')}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-semibold transition-colors ${
                    bottomTab === 'sugerencias' ? 'bg-[var(--color-accent)]/15 text-[var(--color-accent)]' : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
                  }`}
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" /></svg>
                  Sugerencias
                  <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-white/10 font-mono">{suggestions.length}</span>
                </button>
                <button
                  onClick={() => setBottomTab('biblioteca')}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-semibold transition-colors ${
                    bottomTab === 'biblioteca' ? 'bg-[var(--color-accent)]/15 text-[var(--color-accent)]' : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
                  }`}
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" /></svg>
                  Biblioteca
                  <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-white/10 font-mono">{filteredLib.length}</span>
                </button>
                <button
                  onClick={() => setPanelCollapsed(c => !c)}
                  className="ml-1 w-7 h-7 flex items-center justify-center rounded-lg text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)] transition-all active:scale-95"
                  title={panelCollapsed ? 'Expandir panel' : 'Colapsar panel'}
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d={panelCollapsed ? 'M5 15l7-7 7 7' : 'M19 9l-7 7-7-7'} />
                  </svg>
                </button>
                {!panelCollapsed && bottomTab === 'sugerencias' && loadingSuggestions && <div className="w-3.5 h-3.5 border-2 border-[var(--color-accent)] border-t-transparent rounded-full animate-spin ml-2" />}
                <div className="flex-1" />
                {!panelCollapsed && bottomTab === 'sugerencias' && suggestions.length > 12 && (
                  <button
                    onClick={() => setSuggestionOffset(o => (o + 12) % Math.max(12, suggestions.length))}
                    className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold text-[var(--color-accent)] bg-[var(--color-accent)]/10 hover:bg-[var(--color-accent)]/20 transition-all active:scale-95"
                    title="Mostrar otras 12 sugerencias"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
                    Más recomendados
                  </button>
                )}
                {!panelCollapsed && bottomTab === 'biblioteca' && (
                  <>
                    {/* BUSCAR */}
                    <div className="flex flex-col gap-0.5">
                      <span className="text-[8px] uppercase tracking-widest text-[var(--text-muted)] font-bold pl-0.5">Buscar</span>
                      <input
                        value={libBrowserSearch}
                        onChange={(e) => { setLibBrowserSearch(e.target.value); setLibBrowserPage(0) }}
                        placeholder="Artista, título…"
                        className="w-28 md:w-40 px-2 py-1 bg-[var(--bg-input)] border border-[var(--border-color)] rounded-lg text-xs text-[var(--text-primary)] placeholder-gray-600 focus:outline-none focus:border-[var(--color-accent)] transition-colors"
                      />
                    </div>
                    {/* GÉNERO */}
                    <div className="flex flex-col gap-0.5">
                      <span className="text-[8px] uppercase tracking-widest text-[var(--text-muted)] font-bold pl-0.5">Género</span>
                      <GenreCombo
                        value={libBrowserGenre}
                        options={availableGenres}
                        onChange={(g) => { setLibBrowserGenre(g); setLibBrowserPage(0) }}
                      />
                    </div>
                    {/* ORDEN */}
                    <div className="flex flex-col gap-0.5">
                      <span className="text-[8px] uppercase tracking-widest text-[var(--text-muted)] font-bold pl-0.5">Orden</span>
                      <div className="flex items-center gap-0.5 px-0.5 py-0.5 bg-[var(--bg-input)] border border-[var(--border-color)] rounded-lg" title="Ordenar por">
                        {[
                          { id: 'rating', label: '★' },
                          { id: 'artist', label: 'A·Z' },
                          { id: 'bpm',    label: 'BPM' },
                          { id: 'key',    label: 'Key' },
                          { id: 'recent', label: 'New' },
                        ].map(s => (
                          <button
                            key={s.id}
                            onClick={() => setLibBrowserSort(s.id)}
                            className={`px-2 py-0.5 rounded-md text-[11px] font-semibold transition-all ${
                              libBrowserSort === s.id
                                ? 'bg-[var(--color-accent)] text-[var(--color-accent-text)] shadow-sm'
                                : 'text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)]'
                            }`}
                          >
                            {s.label}
                          </button>
                        ))}
                      </div>
                    </div>
                    {/* VISTA */}
                    <div className="flex flex-col gap-0.5">
                      <span className="text-[8px] uppercase tracking-widest text-[var(--text-muted)] font-bold pl-0.5">Vista</span>
                      <button
                        onClick={() => setLibBrowserShowAll(v => !v)}
                        className={`w-7 h-7 flex items-center justify-center rounded-lg border transition-all active:scale-95 ${libBrowserShowAll ? 'bg-[var(--color-accent)]/15 border-[var(--color-accent)]/40 text-[var(--color-accent)]' : 'bg-[var(--bg-input)] border-[var(--border-color)] text-[var(--text-muted)] hover:text-[var(--text-primary)]'}`}
                        title={libBrowserShowAll ? 'Volver a paginado' : 'Mostrar todos con scroll'}
                      >
                        {libBrowserShowAll ? (
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 10h16M4 14h16M4 18h16" /></svg>
                        ) : (
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h7" /></svg>
                        )}
                      </button>
                    </div>
                    {!libBrowserShowAll && totalPages > 1 && (
                      <div className="flex flex-col gap-0.5">
                        <span className="text-[8px] uppercase tracking-widest text-[var(--text-muted)] font-bold pl-0.5">Página</span>
                        <div className="flex items-center gap-0.5 px-1 py-0.5 rounded-lg bg-[var(--bg-input)] border border-[var(--border-color)] text-[var(--text-muted)]">
                          <button onClick={() => setLibBrowserPage(p => Math.max(0, p - 1))} disabled={safePage === 0} className="w-6 h-6 flex items-center justify-center rounded-md hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)] disabled:opacity-30 disabled:hover:bg-transparent transition-all">
                            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15 19l-7-7 7-7" /></svg>
                          </button>
                          <span className="text-[10px] font-mono px-1.5">{safePage + 1}/{totalPages}</span>
                          <button onClick={() => setLibBrowserPage(p => Math.min(totalPages - 1, p + 1))} disabled={safePage >= totalPages - 1} className="w-6 h-6 flex items-center justify-center rounded-md hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)] disabled:opacity-30 disabled:hover:bg-transparent transition-all">
                            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7" /></svg>
                          </button>
                        </div>
                      </div>
                    )}
                  </>
                )}
                {/* Exportar vive en la barra polimórfica de abajo (slot Destino). */}
                <div className="ml-auto pl-3 border-l border-[var(--border-color)] self-center text-[10px] text-[var(--text-muted)] font-mono whitespace-nowrap">{setTracks.length}t · ~{totalMin}'</div>
              </div>
              {/* Grid */}
              {!panelCollapsed && (
                <div className={`px-3 md:px-6 py-2 ${bottomTab === 'biblioteca' && libBrowserShowAll ? 'max-h-96 overflow-y-auto' : ''}`}>
                  {list.length === 0 && (
                    <div className="px-3 py-3 text-sm text-gray-600">
                      {bottomTab === 'sugerencias' ? 'No hay sugerencias disponibles' : 'Sin resultados — probá otra búsqueda'}
                    </div>
                  )}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-1.5">{list.map(renderRow)}</div>
                </div>
              )}
            </div>
          )
        })()}

      {/* Hint: how to import — info de principiante, cerrable con la cruz;
          solo tiene sentido con destino digital (.m3u/.xml) */}
      {!rbHintDismissed && setTracks.length > 0 && (exportTarget === 'm3u' || exportTarget === 'xml') && (
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
          <button
            onClick={dismissRbHint}
            title="Cerrar esta ayuda (no se muestra más)"
            className="sm:ml-auto self-start flex-shrink-0 p-1 rounded-md text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)] transition-all"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>
      )}

      {/* ═══ BARRA DE EXPORTACIÓN (EXCLUSIVA) ═══ */}
      <div
        onWheel={(e) => { if (e.deltaY !== 0) e.currentTarget.scrollLeft += e.deltaY }}
        className="flex-shrink-0 border-t border-[var(--border-color)] bg-[var(--bg-panel)] px-3 md:px-6 py-2.5 overflow-x-auto scrollbar-thin scrollbar-thumb-gray-700/50 scrollbar-track-transparent"
      >
        <div className="flex items-center justify-between gap-4 min-w-max">
          <div className="flex items-center gap-2">
            <span className="text-[10px] uppercase tracking-wider text-[var(--text-muted)] font-bold">Destino de Exportación:</span>
            <div className="flex items-center gap-1 bg-[var(--bg-input)] border border-[var(--border-color)] rounded-lg p-0.5">
              {[
                { id: 'm3u', label: 'Rekordbox (.m3u)' },
                { id: 'xml', label: 'Rekordbox XML' },
                { id: 'mix', label: 'Editor DAW' },
                { id: 'md', label: 'MiniDisc' },
                { id: 'lab', label: '🧪 AI Mix Lab' },
              ].map(t => (
                <button
                  key={t.id}
                  onClick={() => setExportTarget(t.id)}
                  className={`px-3 py-1 rounded-md text-xs font-semibold transition-all active:scale-95 ${exportTarget === t.id ? 'bg-[var(--color-accent)] text-white shadow-md' : 'text-gray-400 hover:text-white'}`}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          {/* Export actions */}
          <div className="flex items-center gap-2">
            {exportTarget === 'm3u' && (
              <button
                onClick={exportM3U}
                disabled={exporting || !setTracks.length}
                className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-xs font-bold text-white shadow-md transition-all active:scale-95 disabled:opacity-40 hover:brightness-110"
                style={{ background: 'linear-gradient(135deg, #ff5500, #ff2266)' }}
                title="Exportar playlist para Rekordbox (.m3u)"
              >
                {exporting
                  ? <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  : <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2M12 4v16m0 0l-4-4m4 4l4-4" /></svg>}
                Exportar .m3u
              </button>
            )}

            {exportTarget === 'xml' && (
              <button
                onClick={exportRekordboxXML}
                disabled={exporting || !setTracks.length}
                className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-xs font-bold text-white shadow-md transition-all active:scale-95 disabled:opacity-40 hover:brightness-110"
                style={{ background: 'linear-gradient(135deg, #ff5500, #ff2266)' }}
                title="Exportar Rekordbox XML con metadatos completos"
              >
                {exporting
                  ? <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  : <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2M12 4v16m0 0l-4-4m4 4l4-4" /></svg>}
                Exportar Rekordbox XML
              </button>
            )}

            {exportTarget === 'mix' && (
              <button
                onClick={() => onEditMix(setTracks)}
                disabled={!setTracks.length}
                className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-xs font-bold bg-purple-600 hover:bg-purple-500 text-white shadow-md transition-all active:scale-95 disabled:opacity-40"
                title="Abrir editor multitrack"
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" d="M4 7h16M4 12h16M4 17h16" /><circle cx="15" cy="7" r="2.2" fill="currentColor" /><circle cx="9" cy="12" r="2.2" fill="currentColor" /><circle cx="13" cy="17" r="2.2" fill="currentColor" /></svg>
                Abrir Editor DAW Multitrack
              </button>
            )}

            {exportTarget === 'md' && (
              <>
                <button
                  onClick={() => setMdGap(!mdGap)}
                  className={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all ${mdGap ? 'border-transparent text-emerald-400 bg-emerald-500/20' : 'bg-[var(--bg-input)] border-[var(--border-color)] text-gray-400 hover:text-white'}`}
                  title="Pausa 2s entre temas para que el grabador marque el track"
                >
                  Pausa 2s (Track Mark)
                </button>
                <button
                  onClick={printMDLabel}
                  disabled={!setTracks.length}
                  className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold bg-[var(--bg-input)] border border-[var(--border-color)] text-gray-300 hover:text-white transition-all disabled:opacity-40"
                  title="Imprimir etiqueta MiniDisc"
                >
                  Etiqueta MD
                </button>
                <button
                  onClick={startMDAutoplay}
                  disabled={!setTracks.length}
                  className={`flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-xs font-bold text-white shadow-md transition-all active:scale-95 disabled:opacity-40 ${isRecordingMode ? 'bg-red-600 animate-pulse' : 'bg-emerald-600 hover:bg-emerald-500'}`}
                >
                  <span>{isRecordingMode ? 'Grabación Activa' : 'Grabar (Autoplay)'}</span>
                </button>
                </>
              )}
            {exportTarget === 'lab' && (
              <>
                <button
                  onClick={runLabTest}
                  disabled={exporting}
                  className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-xs font-bold bg-cyan-600 hover:bg-cyan-500 text-white shadow-md transition-all active:scale-95 disabled:opacity-40"
                  title="Cargar los 2 temas de prueba con sus markers de mezcla (mixIn/mixOut/BPM)"
                >
                  {exporting ? (
                    <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  ) : (
                    <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 3h6M10 3v6.3L4.8 18a2 2 0 0 0 1.8 3h10.8a2 2 0 0 0 1.8-3L14 9.3V3" /></svg>
                  )}
                  Preparar Dual-Deck Automático
                </button>
                {setTracks.length >= 2 && !!trackAnalysis(setTracks[0]) && !!trackAnalysis(setTracks[1]) && (
                  <>
                    <button
                      onClick={() => setLabOpts(o => ({ ...o, kickAnchor: !o.kickAnchor }))}
                      className={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all ${labOpts.kickAnchor ? 'border-transparent text-emerald-400 bg-emerald-500/20' : 'bg-[var(--bg-input)] border-[var(--border-color)] text-gray-400 hover:text-white'}`}
                      title="Corre el arranque de cada tema al ataque real del bombo (corrige el bias del ancla estadística; en este par son ~130ms). Aplica al próximo play."
                    >
                      Ancla bombo
                    </button>
                    {[
                      { id: 'auto', label: 'Auto', tip: 'Elige la receta por datos: ΔBPM, calidad de grilla y largo del outro; el estándar (Corto 8c) es su fallback' },
                      { id: 'short2', label: 'Corto 2c', tip: 'Mezcla de ~4-5 segundos: B entra sin graves 1 compás, entrega del bajo, A sale en 1 compás (default)' },
                      { id: 'short8', label: 'Corto 8c', tip: 'Versión larga del clásico: B sin graves 4 compases, entrega del bajo en el 5, A sale 5-8' },
                      { id: 'loop4', label: 'Loop 4b', tip: 'A queda girando en un loop de 4 beats clavado a grilla mientras B se instala' },
                      { id: 'blend16', label: 'Blend 16c', tip: 'Blend largo progresivo, entrega del bajo en el compás 8' },
                      { id: 'eqmix', label: 'EQ Mix', tip: 'Como Blend 16c pero B entra oscuro (lowpass) y se abre hasta la entrega' },
                      { id: 'cut', label: 'Cut', tip: 'Corte en frase: B al palo, A muere en 1 beat' },
                      { id: 'fade', label: 'Fade', tip: 'Crossfade parejo equal-power (referencia)' },
                      { id: 'diag', label: 'Diag', tip: 'Diagnóstico: B entra fuerte y SIN filtro — los dos bombos juntos para escuchar el corrimiento. Aplica a toda la sesión (Ensayo incluido)' },
                    ].map(r => (
                      <button
                        key={r.id}
                        onClick={() => setLabRecipe(r.id)}
                        className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold border transition-all ${labRecipe === r.id ? 'border-transparent text-cyan-300 bg-cyan-500/20' : 'bg-[var(--bg-input)] border-[var(--border-color)] text-gray-400 hover:text-white'}`}
                        title={`${r.tip}. Aplica al próximo play.`}
                      >
                        {r.label}
                      </button>
                    ))}
                    <select
                      value={labFx}
                      onChange={(e) => setLabFx(e.target.value)}
                      className="px-2 py-1.5 rounded-lg text-xs font-semibold bg-[var(--bg-input)] border border-[var(--border-color)] text-purple-300"
                      title="Banco de FX de transición — se cambia en vivo entre enganches del Ensayo; aplica al próximo"
                    >
                      <option value="directo">FX: Directo (debug — golpe desnudo)</option>
                      <option value="low">FX: Low swap (clásico)</option>
                      <option value="hp-suave">FX: Filtro HP suave</option>
                      <option value="hp-agresivo">FX: Filtro HP agresivo</option>
                      <option value="lp-suave">FX: Filtro LP (bajo el agua)</option>
                      <option value="lp-reso">FX: Filtro LP resonante</option>
                      <option value="cruzado">FX: Filtros cruzados</option>
                      <option value="echo-slap">FX: Echo corto 1/2 beat</option>
                      <option value="echo-dotted">FX: Echo 3/4 beat</option>
                      <option value="echo-largo">FX: Echo 1 beat</option>
                      <option value="echo-dark">FX: Echo oscuro (cola filtrada)</option>
                      <option value="echo-space">FX: Echo 2 beats spacey</option>
                      <option value="filtro+echo">FX: Filtro + Echo</option>
                    </select>
                    {setTracks.length >= 2 && (
                      <>
                        <button
                          onClick={() => openCueEdit(setTracks[0], 'out')}
                          className="px-2.5 py-1.5 rounded-lg text-xs font-semibold border bg-[var(--bg-input)] border-[var(--border-color)] text-amber-300 hover:text-amber-200 transition-all"
                          title="Marcar a mano el punto de salida (mixOut) del primer tema sobre la waveform"
                        >
                          Cue fin A
                        </button>
                        <button
                          onClick={() => openCueEdit(setTracks[1], 'in')}
                          className="px-2.5 py-1.5 rounded-lg text-xs font-semibold border bg-[var(--bg-input)] border-[var(--border-color)] text-amber-300 hover:text-amber-200 transition-all"
                          title="Marcar a mano el 0.0.0 (primer kick) del segundo tema sobre la waveform"
                        >
                          Cue inicio B
                        </button>
                        <button
                          onClick={openAlignEdit}
                          className="px-2.5 py-1.5 rounded-lg text-xs font-bold border bg-amber-500/20 border-amber-500/50 text-amber-300 transition-all active:scale-95"
                          title="Ver las DOS waveforms alineadas en el punto de enganche y ajustar a mano"
                        >
                          Alinear waveforms
                        </button>
                      </>
                    )}
                    {labState === 'playing' ? (
                      <>
                        <button
                          onClick={() => nudgeLab(-10)}
                          className="px-2.5 py-1.5 rounded-lg text-xs font-bold bg-[var(--bg-input)] border border-[var(--border-color)] text-gray-300 hover:text-white transition-all active:scale-95"
                          title="Atrasar el tema B 10ms (jog). Si nudgeando clava, ese es el error de ancla que queda."
                        >
                          -10ms
                        </button>
                        <button
                          onClick={() => nudgeLab(10)}
                          className="px-2.5 py-1.5 rounded-lg text-xs font-bold bg-[var(--bg-input)] border border-[var(--border-color)] text-gray-300 hover:text-white transition-all active:scale-95"
                          title="Adelantar el tema B 10ms (jog)"
                        >
                          +10ms
                        </button>
                        <button
                          onClick={stopLabTransition}
                          className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-xs font-bold bg-red-600 hover:bg-red-500 text-white shadow-md transition-all active:scale-95"
                          title="Detener la prueba de enganche"
                        >
                          <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="6" width="12" height="12" rx="1" /></svg>
                          Detener prueba
                        </button>
                      </>
                    ) : (
                      <button
                        onClick={playLabTransition}
                        disabled={labState === 'loading'}
                        className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-xs font-bold bg-emerald-600 hover:bg-emerald-500 text-white shadow-md transition-all active:scale-95 disabled:opacity-40"
                        title="Web Audio dual-deck: A arranca en su outro y B entra clavado en grilla, mismo reloj de audio"
                      >
                        {labState === 'loading' ? (
                          <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                        ) : (
                          <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z" /></svg>
                        )}
                        {labState === 'loading' ? 'Decodificando...' : 'Probar enganche (Web Audio)'}
                      </button>
                    )}
                  </>
                )}
              </>
            )}
            </div>
          </div>
        </div>

      {/* Alineador visual: outro de A + intro de B en la misma escala, línea
          = instante del enganche; nudge en ms, audición del solape, guardar */}
      {alignEdit && (
        <div className="fixed inset-0 z-[130] bg-black/70 flex items-center justify-center p-4" onClick={() => { alignStop(); setAlignEdit(null) }}>
          <div className="bg-[var(--bg-panel)] border border-[var(--border-color)] rounded-xl shadow-2xl max-w-3xl w-full flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="px-4 py-3 border-b border-[var(--border-color)]">
              <div className="text-[10px] uppercase tracking-wide text-[var(--text-muted)]">Alinear enganche — la línea roja es el instante donde entra B</div>
            </div>
            <div className="p-4">
              {alignEdit.loading ? (
                <div className="h-40 flex items-center justify-center text-sm text-gray-400">
                  <div className="w-4 h-4 mr-2 border-2 border-cyan-400 border-t-transparent rounded-full animate-spin" />
                  Decodificando los dos temas...
                </div>
              ) : (
                <>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs text-amber-300 truncate">{alignEdit.A.title || alignEdit.A.filename} — outro (mixOut {alignEdit.offA.toFixed(3)}s)</span>
                    <div className="flex gap-1">
                      {[-25, -5, 5, 25].map(ms => (
                        <button key={`a${ms}`} onClick={() => setAlignEdit({ ...alignEdit, offA: Math.max(0, alignEdit.offA + ms / 1000) })} className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-[var(--bg-input)] border border-[var(--border-color)] text-gray-300 hover:text-white">{ms > 0 ? `+${ms}` : ms}</button>
                      ))}
                    </div>
                  </div>
                  <canvas ref={alignCanvasARef} width={720} height={80} className="w-full rounded-lg bg-black/40 mb-3" />
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs text-cyan-300 truncate">{alignEdit.B.title || alignEdit.B.filename} — intro (mixIn {alignEdit.offB.toFixed(3)}s)</span>
                    <div className="flex gap-1">
                      {[-25, -5, 5, 25].map(ms => (
                        <button key={`b${ms}`} onClick={() => setAlignEdit({ ...alignEdit, offB: Math.max(0, alignEdit.offB + ms / 1000) })} className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-[var(--bg-input)] border border-[var(--border-color)] text-gray-300 hover:text-white">{ms > 0 ? `+${ms}` : ms}</button>
                      ))}
                    </div>
                  </div>
                  <canvas ref={alignCanvasBRef} width={720} height={80} className="w-full rounded-lg bg-black/40" />
                  <div className="mt-3 flex items-center gap-2">
                    <button onClick={alignAudition} className="px-3 py-1.5 rounded-lg text-xs font-bold bg-cyan-600 hover:bg-cyan-500 text-white transition-all" title="Escuchar el solape real desde 2s antes del enganche">
                      Escuchar enganche
                    </button>
                    <button onClick={alignStop} className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-[var(--bg-input)] border border-[var(--border-color)] text-gray-300 hover:text-white transition-all">
                      Parar
                    </button>
                    <div className="flex-1" />
                    <button onClick={alignSave} className="px-4 py-1.5 rounded-lg text-xs font-bold bg-emerald-600 hover:bg-emerald-500 text-white transition-all">
                      Guardar alineación
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Editor de cues sobre waveform: click = marker, ajuste fino, audición,
          guardar (la marca manual PISA al análisis) */}
      {cueEdit && (
        <div className="fixed inset-0 z-[130] bg-black/70 flex items-center justify-center p-4" onClick={() => { try { cueAudRef.current?.stop() } catch { /* ok */ } setCueEdit(null) }}>
          <div className="bg-[var(--bg-panel)] border border-[var(--border-color)] rounded-xl shadow-2xl max-w-2xl w-full flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="px-4 py-3 border-b border-[var(--border-color)] flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="text-[10px] uppercase tracking-wide text-[var(--text-muted)]">
                  {cueEdit.which === 'in' ? 'Marcar 0.0.0 — inicio (primer kick)' : 'Marcar salida — mixOut (outro)'}
                </div>
                <div className="text-sm font-medium text-[var(--text-primary)] truncate">{cueEdit.track.title || cueEdit.track.filename}</div>
              </div>
              <span className="text-sm font-mono text-rose-400 whitespace-nowrap">{cueEdit.marker?.toFixed(3)}s</span>
            </div>
            <div className="p-4">
              {cueEdit.loading ? (
                <div className="h-24 flex items-center justify-center text-sm text-gray-400">
                  <div className="w-4 h-4 mr-2 border-2 border-cyan-400 border-t-transparent rounded-full animate-spin" />
                  Decodificando audio...
                </div>
              ) : (
                <>
                  <canvas
                    ref={cueCanvasRef}
                    width={640}
                    height={96}
                    className="w-full rounded-lg bg-black/40 cursor-crosshair"
                    onClick={(e) => {
                      const rect = e.currentTarget.getBoundingClientRect()
                      const frac = (e.clientX - rect.left) / rect.width
                      const [t0, t1] = cueEdit.win
                      setCueEdit({ ...cueEdit, marker: t0 + frac * (t1 - t0) })
                    }}
                  />
                  <div className="mt-3 flex items-center gap-2 flex-wrap">
                    {[-25, -5, 5, 25].map(ms => (
                      <button
                        key={ms}
                        onClick={() => setCueEdit({ ...cueEdit, marker: Math.max(0, cueEdit.marker + ms / 1000) })}
                        className="px-2.5 py-1.5 rounded-lg text-xs font-mono bg-[var(--bg-input)] border border-[var(--border-color)] text-gray-300 hover:text-white transition-all"
                      >
                        {ms > 0 ? `+${ms}` : ms}ms
                      </button>
                    ))}
                    <button
                      onClick={cueAudition}
                      className="px-3 py-1.5 rounded-lg text-xs font-bold bg-cyan-600 hover:bg-cyan-500 text-white transition-all"
                      title="Escuchar 2.5s desde el marker"
                    >
                      Escuchar
                    </button>
                    <div className="flex-1" />
                    <button onClick={clearCue} className="px-3 py-1.5 rounded-lg text-xs font-semibold text-gray-400 hover:text-white transition-all" title="Borrar la marca manual y volver al análisis automático">
                      Borrar marca
                    </button>
                    <button onClick={saveCue} className="px-4 py-1.5 rounded-lg text-xs font-bold bg-emerald-600 hover:bg-emerald-500 text-white transition-all">
                      Guardar cue
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Right-click version-swap popover: other versions of the song with a
          play to preview + "Usar" to replace; footer removes from set or trashes. */}
      {dupeCtx && (() => {
        const versions = versionsOf(dupeCtx.track)
        const others = versions.filter(v => v.filename !== dupeCtx.track.filename)
        return (
          <div
            className="fixed z-[100] w-72 max-h-[70vh] overflow-y-auto rounded-xl border border-[var(--border-color)] bg-[var(--bg-panel)] shadow-2xl"
            style={{ left: Math.min(dupeCtx.x, window.innerWidth - 300), top: Math.min(dupeCtx.y, window.innerHeight - 360) }}
            onClick={(e) => e.stopPropagation()}
            onContextMenu={(e) => e.preventDefault()}
          >
            <div className="px-3 py-2 border-b border-[var(--border-color)]/60">
              <div className="text-[10px] uppercase tracking-wide text-[var(--text-muted)]">Versiones del tema</div>
              <div className="truncate text-xs font-medium text-[var(--text-primary)]">
                {dupeCtx.track.artist ? `${dupeCtx.track.artist} - ` : ''}{dupeCtx.track.title || dupeCtx.track.filename}
              </div>
            </div>

            <div className="py-1">
              {versions.map((v) => {
                const isCurrent = v.filename === dupeCtx.track.filename
                const isPlaying = playing === v.filename
                const fmt = (v.format || v.filename?.split('.').pop() || '').toUpperCase()
                return (
                  <div key={v.filename} className={`flex items-center gap-2 px-2 py-1.5 ${isCurrent ? 'bg-[var(--color-accent)]/10' : 'hover:bg-[var(--bg-hover)]'}`}>
                    <PlayPauseBtn isPlaying={isPlaying} size="sm" onClick={() => handlePlay(v)} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 text-xs">
                        <span className={`font-mono ${fmt === 'FLAC' ? 'text-purple-400' : 'text-gray-400'}`}>{fmt}</span>
                        {v.size_mb ? <span className="text-gray-500">{v.size_mb}MB</span> : null}
                        {v.rating ? <span className="text-[var(--text-primary)]">{'★'.repeat(v.rating)}</span> : null}
                        {isCurrent && <span className="text-[9px] uppercase tracking-wide text-[var(--color-accent)] font-bold">actual</span>}
                      </div>
                      <div className="truncate text-[10px] text-[var(--text-muted)]">{v.filename}</div>
                    </div>
                    {!isCurrent && (
                      <button
                        onClick={() => { replaceTrack(dupeCtx.index, v); setDupeCtx(null); toast('Versión reemplazada en el set', 'success', 2000) }}
                        className="flex-shrink-0 text-[10px] px-2 py-1 rounded-md btn-accent font-semibold"
                        title="Usar esta versión en el set"
                      >Usar</button>
                    )}
                  </div>
                )
              })}
              {others.length === 0 && (
                <div className="px-3 py-2 text-xs text-[var(--text-muted)]">Sin otras versiones en la biblioteca.</div>
              )}
            </div>

            <div className="border-t border-[var(--border-color)]/60 py-1">
              {/* El Export NO cura: deriva a la Biblioteca (la clínica de la música),
                  donde viven TODAS las tools — género, metatags, rating, papelera. */}
              <button
                onClick={() => { const fn = dupeCtx.track.filename; setDupeCtx(null); onGoToLibrary?.(fn) }}
                className="w-full flex items-center gap-2 px-3 py-1.5 text-xs font-semibold text-[var(--color-accent)] hover:bg-[var(--color-accent)]/10 transition-colors"
                title="Abre este tema en la Biblioteca para curarlo (género, metatags, rating)"
              >
                <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0zM12 8v4m-2-2h4" /></svg>
                Ir a la Biblioteca (curar ahí)
              </button>
              <button
                onClick={() => { removeFromSet(dupeCtx.index); setDupeCtx(null) }}
                className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-[var(--text-primary)] hover:bg-[var(--bg-hover)] transition-colors"
              >
                <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                Quitar del set
              </button>
              <button
                onClick={() => { const t = dupeCtx.track, idx = dupeCtx.index; setDupeCtx(null); deleteFromDisk(t, idx) }}
                className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-red-400 hover:bg-red-500/10 transition-colors"
                title={agentConnected ? 'Manda el archivo a la Papelera de Windows' : 'Sin agente solo se saca de la biblioteca; el archivo queda en disco'}
              >
                <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                Borrar del disco {agentConnected ? '(Papelera)' : '(sin agente)'}
              </button>
            </div>
          </div>
        )
      })()}

    </div>
  )
}))
