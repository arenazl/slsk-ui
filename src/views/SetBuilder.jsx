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
import { API_BASE, agentFetch, getAudioUrl, normDupeKey, GENRE_COLORS, ScreenHint } from '../App';

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
      if (!isMixMode || (isMd && mdGap)) return 0
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
  }, [setTracks, onPlay, playNextRef, page, mdGap, isMd, playingFile])

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

    setSetTracks(picked)
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
    setIsRecordingMode(!!recording)
    onPlay(setTracks[0])
    toast(recording
      ? `Grabación MiniDisc iniciada (${setTracks.length} temas en Autoplay)`
      : `Reproduciendo la lista (${setTracks.length} temas seguidos)`, 'success', 3000)
  }
  const startMDAutoplay = () => startPlayAll(true)

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
            {/* Circular Spotify Play Button */}
            <button
              onClick={() => startPlayAll(false)}
              disabled={!setTracks.length}
              className="w-10 h-10 rounded-full bg-emerald-500 hover:bg-emerald-400 text-black flex items-center justify-center shadow-lg hover:scale-105 active:scale-95 transition-all disabled:opacity-40 flex-shrink-0"
              title={isMixMode ? "Reproducir mezclado continuo (Modo Mixear ON)" : "Reproducir lista"}
            >
              <svg className="w-5 h-5 fill-current ml-0.5" viewBox="0 0 24 24"><path d="M8 5v14l11-7z" /></svg>
            </button>

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
                {isMixMode ? '✨ Mixear' : 'Mixear'}
              </button>

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
            </div>
          </div>
        </div>

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
