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
import { API_BASE, IS_MOBILE_DEVICE, agentFetch, GENRE_COLORS, SwipeableRow } from '../App';

export default function DiscoverPage({ wsRef, username, password, connected, onGoToDownloads, audioRef, autoplayCancelRef, playingFile, setPlayingFile, setNowPlaying, setIsAudioPlaying, addToPending, isFavorite, toggleFavorite, isGuest, pendingRadioTrack, onRadioConsumed, agentConnected, agentHasSlsk, downloadMode, authUser, collection, onGoToLibrary, isRemoteOutput, sendRemoteCommand, discoverRemoteRef, outputDeviceName, onTriggerSearch }) {
  const toast = useToast()
  // Per-user genre click tracking with 5-click reorder threshold (server-persisted)
  const beatportClicks = useGenreClicks('beatport_genre_clicks', authUser?.name || '')
  const spotifyClicks  = useGenreClicks('spotify_cat_clicks',    authUser?.name || '')
  // YouTube embed for POP/LATIN — higher quality than iTunes 30s previews.
  // { videoId, track } | null. The iframe stays MOUNTED while playing so audio
  // keeps coming; `youtubeVisible` only controls whether the video card is
  // on-screen or parked offscreen (hidden iframes get throttled, offscreen
  // ones keep playing). Default is hidden — footer is the primary UI.
  const [youtubeEmbed, setYoutubeEmbed] = useState(null)
  const [youtubeVisible, setYoutubeVisible] = useState(false)
  // When playback stops globally (footer Stop, panic-stop, etc.) drop the iframe.
  useEffect(() => {
    if (!playingFile || !playingFile.startsWith('discover-')) {
      setYoutubeEmbed(null)
      setYoutubeVisible(false)
    }
  }, [playingFile])
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
    // Cloud Run metadata is used only to enrich title/artist for those files;
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

      // 2. Enrich with Cloud Run/Cloudinary metadata (title, artist, key, etc.)
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
      // De aca en adelante, exigimos que el artist del track aparezca en el
      // filename o en meta.artist. Sin esto el matching laxo (substring o
      // token overlap) genera FALSOS POSITIVOS cuando dos temas distintos
      // comparten parte del titulo — ej "Hardt Antoine - Sing It Back" vs
      // "Moloko - Sing It Back (Hardt Antoine Edit)". El user veia
      // "Descargado" en Discover y al ir a la biblioteca no estaba.
      if (!a) return null  // sin artist no podemos validar

      const artistMatches = (filename, meta) => {
        const ma = norm(meta?.artist || '')
        if (ma && ma === a) return true
        // Permitimos que el artist aparezca como substring del filename
        // norm (cubre casos "Artist - Title.mp3" y "Title (Artist Edit).mp3")
        const fn = norm(filename)
        return fn.includes(a)
      }

      // 2) artist+title concatenated matches filename norm
      const hit3 = findInFilenames((fn, filename, meta) =>
        artistMatches(filename, meta) && (fn === a + t || fn.includes(a + t))
      )
      if (hit3) return hit3
      // 3) Substring: title ≥ 4 chars in filename AND artist tambien
      if (t.length >= 4) {
        const hit = findInFilenames((fn, filename, meta) =>
          fn.includes(t) && artistMatches(filename, meta)
        )
        if (hit) return hit
      }
      // 4) Token overlap ≥ 70% pero exigiendo artist match
      const trackTokens = [...tokens(track.artist || ''), ...tokens(track.title || '')]
      if (trackTokens.length >= 2) {
        const needed = Math.max(2, Math.ceil(trackTokens.length * 0.7))
        for (const [filename, meta] of Object.entries(libraryManifest)) {
          if (!artistMatches(filename, meta)) continue
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
    // Clean URL: djfreeapp.ar/s/<artist-title-slug>. Metadata (artwork,
    // preview) is persisted server-side in Cloudinary so the link stays short.
    const slugify = (s) => (s || '').toLowerCase()
      .normalize('NFKD').replace(/\p{M}/gu, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
    const combined = `${track.artist || ''} ${track.title || ''}`.trim()
    const slug = slugify(combined) || 'track'
    const url = `https://djfreeapp.ar/s/${slug}`
    setDiscoverCtx(null)
    setShareDialog({ track, url })
    try {
      await fetch(`${API_BASE}/api/share`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          slug,
          artist: track.artist || '',
          title: track.title || '',
          artwork_url: track.artwork_url || '',
          preview_url: track.preview_url || '',
        }),
      })
    } catch { /* link still works via iTunes fallback */ }
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
    if (t.artist && t.title && authUser?.name) {
      fetch(`${API_BASE}/api/pending/remove`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user: authUser.name, tracks: [{ artist: t.artist, title: t.title }] }),
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
  const [shareDialog, setShareDialog] = useState(null)  // { track, url }
  // Feature "Modernizar": remix AL AZAR del tema (SoundCloud) — primero suena,
  // después botón para bajarlo. {base, title, artist, duration_sec}
  const [remixPick, setRemixPick] = useState(null)
  const modernizarTrack = async (track) => {
    setDiscoverCtx(null)
    toast('Buscando un remix para modernizar...', 'info', 2000)
    try {
      const params = new URLSearchParams({ q: `${track.artist} ${track.title}` })
      if (track.duration_ms) params.set('avoid_dur', String(Math.round(track.duration_ms / 1000)))
      const r = await fetch(`${API_BASE}/api/sc-remix?${params}`)
      const d = await r.json().catch(() => ({}))
      if (!r.ok || !d.ok) { toast('No encontré remixes de este tema', 'warning', 2500); return }
      setRemixPick({ base: track, title: d.title, artist: d.artist, duration_sec: d.duration_sec })
      playPreview({
        id: `remix-${track.id}`,
        artist: track.artist,
        title: d.title,
        duration_ms: (d.duration_sec || 0) * 1000,
        sample_url: `${API_BASE}/api/sc-audio?q=${encodeURIComponent(d.title)}&dur=${d.duration_sec || ''}`,
      })
    } catch {
      toast('No pude buscar remixes', 'error', 2500)
    }
  }
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
  // Duraciones de preview. EDM: samples de Beatport (60-120s). POP/LATIN:
  // tema COMPLETO vía SoundCloud (proxy /api/sc-audio), así 60/90/120 son
  // reales. Fallback al clip de 30s de Spotify/iTunes si SC no encuentra el tema.
  const durationOptions = [30, 60, 90, 120]

  // Track the track object the user last started — used by the top "Preview continuo"
  // button to resume autoplay from THAT track instead of falling back to track 1
  // when state lookups race.
  const lastPlayedTrackRef = useRef(null)

  // Motor de preview continuo. Reusable: lo usa el click local Y el RECEPTOR
  // cuando otro device manda un remote_command 'preview' (Spotify-Connect).
  // playlist: array de tracks; startIndex: desde dónde arranca; durationOverride:
  // segundos por track (si null usa previewDurationRef del propio device).
  const startPreviewEngine = (playlist, startIndex = 0, durationOverride = null) => {
    if (!Array.isArray(playlist) || playlist.length === 0) return
    let current = startIndex || 0
    const dur = () => (durationOverride && durationOverride > 0) ? durationOverride : previewDurationRef.current

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
    // Exponer control remoto: si ESTE device es el target, el otro puede
    // mandar next/prev y los aplicamos sobre el engine activo.
    if (discoverRemoteRef) {
      discoverRemoteRef.current = {
        startPreviewEngine,
        next: () => { if (previewIntervalRef.current) clearTimeout(previewIntervalRef.current); current++; playNext() },
        prev: () => { if (previewIntervalRef.current) clearTimeout(previewIntervalRef.current); if (current > 0) current--; playNext() },
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

      const startAudio = (url, onFail) => {
        // Cancel any pending advance — we're starting fresh with this src.
        if (previewIntervalRef.current) { clearTimeout(previewIntervalRef.current); previewIntervalRef.current = null }
        // onError per-track: probar el siguiente candidato (SC → sample → iTunes)
        // antes de saltar de tema, así un fallo de SoundCloud no se come el track.
        sessionAudio.onerror = () => { if (onFail) onFail(); else { current++; playNext() } }
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
          previewIntervalRef.current = setTimeout(() => { current++; playNext() }, dur() * 1000)
        }).catch(() => { if (onFail) onFail(); else { current++; playNext() } })
      }

      // Candidatos en orden. POP/LATIN: SoundCloud (tema COMPLETO vía proxy)
      // primero → 60/90/120 reales. Si SC no lo encuentra, cae al sample/preview
      // de 30s y al final a iTunes. EDM: sample de Beatport directo (ya 60-120s).
      const candidates = []
      if (collection !== 'edm') {
        candidates.push(`${API_BASE}/api/sc-audio?q=${encodeURIComponent(`${t.artist} ${t.title}`)}`)
      }
      if (t.sample_url) candidates.push(t.sample_url)
      if (t.preview_url && t.preview_url !== t.sample_url) candidates.push(t.preview_url)

      const tryFrom = (idx) => {
        if (idx < candidates.length) {
          startAudio(candidates[idx], () => tryFrom(idx + 1))
          return
        }
        // Último recurso: iTunes 30s
        const query = `${t.artist} ${t.title}`.trim()
        fetch(`https://itunes.apple.com/search?term=${encodeURIComponent(query)}&media=music&limit=1`)
          .then(r => r.json())
          .then(data => {
            if (data.results?.[0]?.previewUrl) startAudio(data.results[0].previewUrl)
            else { current++; playNext() }
          })
          .catch(() => { current++; playNext() })
      }
      tryFrom(0)
    }
    // Stop any existing preview
    if (previewIntervalRef.current) clearTimeout(previewIntervalRef.current)
    playNext()
  }

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
    // Tocar SIEMPRE suena acá. El casting a otro equipo se hace con el selector
    // de salida (PUSH); cuando este equipo arranca, el otro se calla solo por la
    // regla de single-playback (sync_player). Antes, si "isRemoteOutput", esto
    // ruteaba al otro device y confundía (tocabas en la PC y sonaba en el celu).
    startPreviewEngine(playlist, 0)
  }

  // Registrar el motor en el ref apenas monta, así el RECEPTOR puede arrancar
  // la primera sesión aunque todavía no haya tocado nada localmente.
  useEffect(() => {
    if (!discoverRemoteRef) return
    discoverRemoteRef.current = { ...(discoverRemoteRef.current || {}), startPreviewEngine }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (!discoverCtx) return
    // Both desktop dropdown and mobile bottom-sheet share the same ref name,
    // so React only keeps the last one (mobile). Looking up via the data
    // marker matches whichever menu is actually rendered/clicked.
    const handleClick = (e) => {
      if (!e.target.closest('[data-discover-ctx="1"]')) setDiscoverCtx(null)
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

  // Once genres load, if URL has ?genre=<slug>, auto-select it.
  // Solo aplica en EDM (beatport): en POP/LATIN el param es residuo de otro
  // ecosistema y se limpia — el selector de colección MANDA sobre la URL.
  useEffect(() => {
    if (!genreSlug) return
    if (discoverSource !== 'beatport') { setGenreSlug(''); return }
    if (genres.length === 0) return
    if (selectedGenre?.slug === genreSlug) return
    const match = genres.find(g => g.slug === genreSlug)
    if (match) loadChart(match)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [genres, genreSlug, discoverSource])

  // Once Spotify categories load, if URL has ?playlist=<key>, auto-select it.
  // Solo aplica en POP/LATIN (spotify): estando en EDM un ?playlist= viejo en
  // la URL dejaba los chips en EDM pero la LISTA en POP tras un refresh.
  useEffect(() => {
    if (!spotifyKey) return
    if (discoverSource !== 'spotify') { setSpotifyKey(''); return }
    if (spotifyCategories.length === 0) return
    if (selectedSpotifyCategory?.key === spotifyKey) return
    const match = spotifyCategories.find(c => c.key === spotifyKey)
    if (match) loadSpotifyPlaylist(match)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spotifyCategories, spotifyKey, discoverSource])

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
      // Listas PÚBLICAS: el backend las lee sin login (embed/api/curl fallback).
      // NO forzamos el OAuth de Spotify — antes este redirect pateaba a TODOS
      // (incluidos clientes) al login. Solo refrescamos el flag informativo.
      fetch(`${API_BASE}/api/spotify/status`).then(r => r.json()).then(data => {
        setSpotifyConnected(data.connected)
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
    setYoutubeEmbed(null)
  }

  // Stop global: cuando el equipo transfiere la reproducción a otro device
  // (Spotify-Connect PUSH), App dispara 'groovesync-force-stop' para que ACÁ
  // matemos TODO el audio de Discovery — preview continuo (autoplayCancelRef +
  // su timer), preview individual (audioRef), iframe YouTube legacy y cualquier
  // timer suelto. Garantiza que el origen se calle aunque la vía no sea audioRef.
  useEffect(() => {
    const forceStop = () => {
      try { autoplayCancelRef?.current?.() } catch {}
      try { if (previewIntervalRef.current) { clearTimeout(previewIntervalRef.current); previewIntervalRef.current = null } } catch {}
      try { if (audioRef?.current) { audioRef.current.pause(); audioRef.current.src = '' } } catch {}
      clearDiscoverAudio()
    }
    window.addEventListener('groovesync-force-stop', forceStop)
    return () => window.removeEventListener('groovesync-force-stop', forceStop)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

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
      setYoutubeEmbed(null)
      return
    }
    if (audioRef.current) {
      try { audioRef.current.onended = null } catch {}
      try { audioRef.current.onerror = null } catch {}
      try { audioRef.current.pause() } catch {}
      try { audioRef.current.src = '' } catch {}
    }
    // Cambio de tema: el <audio> HTML5 ya se pausó arriba; falta matar el iframe
    // de YouTube (preview POP/LATIN) del tema anterior. Sin esto, al pasar de POP
    // a EDM y dar play seguían sonando los dos a la vez.
    setYoutubeEmbed(null)

    // POP/LATIN va por audio directo IGUAL que EDM (sin iframe de YouTube). El
    // iframe se plantaba en mobile en el 2do tema, dejaba un 2do audio sonando
    // (no cortaba el anterior → "suenan los 2 juntos") y metía el botón de
    // YouTube minimizado. Un solo mecanismo (new Audio) = sin doble audio, sin
    // video, sin botón. Cae al tryPlay de abajo (sample_url → iTunes).

    // Candidatos en orden. POP/LATIN: SoundCloud (tema COMPLETO) primero;
    // después sample/preview; al final iTunes 30s. EDM: sample directo → iTunes.
    const candidates = []
    if (collection !== 'edm' && !(track.sample_url || '').includes('/api/sc-audio')) {
      // dur = duración esperada según la playlist → SoundCloud devuelve la
      // VERSIÓN correcta (antes traía el remix más largo que encontrara,
      // p.ej. 10 min de "Locked Out of Heaven" para el original de 3:53).
      const durQ = track.duration_ms ? `&dur=${Math.round(track.duration_ms / 1000)}` : ''
      candidates.push(`${API_BASE}/api/sc-audio?q=${encodeURIComponent(`${track.artist} ${track.title}`)}${durQ}`)
    }
    if (track.sample_url) candidates.push(track.sample_url)
    if (track.preview_url && track.preview_url !== track.sample_url) candidates.push(track.preview_url)

    const playUrl = (url, onFail) => {
      let failed = false
      const fail = () => { if (failed) return; failed = true; if (onFail) onFail(); else clearDiscoverAudio() }
      const audio = new Audio(url)
      audio.onended = () => { clearDiscoverAudio(); audioRef.current = null }
      audio.onerror = fail
      audio.play().catch(() => fail())
      setDiscoverAudio(audio, track)
    }

    const tryFrom = (idx) => {
      if (idx < candidates.length) { playUrl(candidates[idx], () => tryFrom(idx + 1)); return }
      // Último recurso: iTunes 30s
      fetch(`https://itunes.apple.com/search?term=${encodeURIComponent(`${track.artist} ${track.title}`)}&media=music&limit=1`)
        .then(r => r.json())
        .then(data => {
          if (data.results?.[0]?.previewUrl) playUrl(data.results[0].previewUrl)
          else clearDiscoverAudio()
        })
        .catch(() => clearDiscoverAudio())
    }
    tryFrom(0)
  }

  const searchAndDownload = (track) => {
    // Discovery es un facilitador de ideas: al tocar Bajar, copia "Artista - Tema" al input
    // de búsqueda, cambia a la pestaña Buscar y ejecuta la búsqueda manual inmediatamente.
    const query = `${track.artist || ''} ${track.title || ''}`.trim()
    if (!query) return

    if (window.__ensureCanDownload && !window.__ensureCanDownload()) return

    if (!agentConnected) {
      toast('Agente no conectado — iniciá el agente local (slsk-agent) para descargar', 'warning', 4000)
      return
    }

    if (track && track.id) {
      setDownloadQueue(prev => ({
        ...prev,
        [track.id]: { status: 'searching', message: 'Buscando...' }
      }))
    }

    toast(`🔍 Buscando "${query}"...`, 'info', 2500)
    if (onTriggerSearch) {
      onTriggerSearch(query)
    }
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
                {!loading && discoverSource === 'beatport' && !IS_MOBILE_DEVICE && (authUser?.role === 'admin' || authUser?.user === 'look' || authUser?.user === 'Look') && (
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
                    {/* Login de Spotify eliminado: las listas son públicas y se
                        leen sin OAuth. El token de usuario vivía solo en memoria
                        y se perdía en cada reinicio del dyno → no aportaba nada. */}
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
                const clicks = beatportClicks.committed
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
                        beatportClicks.bump(g.name)
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
                const clicks = spotifyClicks.committed
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
                        spotifyClicks.bump(cat.key)
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
        <SkeletonRows rows={12} />
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
            {/* Duration selector. EDM: 30/60/90/120s. POP/LATIN: solo 30s
                (los previews de Spotify son clips de 30s, no se pueden estirar). */}
            <div className="flex items-center rounded-full bg-[var(--bg-input)] p-0.5">
              {durationOptions.map(secs => (
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
                        <button
                          onClick={(e) => { e.stopPropagation(); const loc = isInLibrary.findLocation(t); onGoToLibrary?.(loc?.file || `${t.artist || ''} ${t.title || ''}`.trim()) }}
                          title="Ya está en tu biblioteca — Clic para ir a la biblioteca"
                          className="flex items-center gap-1.5 px-2.5 md:px-3 py-1.5 md:py-2 rounded-full text-xs font-semibold text-emerald-400 bg-emerald-500/15 border border-emerald-500/30 hover:bg-emerald-500/25 transition-all duration-200 active:scale-95 cursor-pointer shadow-sm"
                        >
                          <svg className="w-3.5 h-3.5 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                          </svg>
                          <span>Ya descargado</span>
                        </button>
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
                        <span className="hidden md:inline">Bajar</span>
                      </button>
                    )
                    if (dl.status === 'searching') return (
                      <div className="flex-shrink-0 flex items-center gap-1">
                        <span className="flex items-center gap-1.5 px-2 md:px-3 py-1.5 md:py-2 rounded-full text-xs text-yellow-400">
                          <div className="w-3 h-3 border-2 border-yellow-400 border-t-transparent rounded-full animate-spin" />
                          <SearchingLabel className="hidden sm:inline" />
                        </span>
                        {clearBtn}
                      </div>
                    )
                    if (dl.status === 'downloading') return (
                      <div className="flex-shrink-0 flex items-center gap-1">
                        {dl.pct != null ? (
                          <span className="flex items-center gap-1.5 px-2 md:px-3 py-1.5 md:py-2 rounded-full text-xs text-[var(--color-accent)]">
                            <div className="w-12 md:w-16 h-1.5 bg-gray-700 rounded-full overflow-hidden">
                              <div className="h-full rounded-full bg-[var(--color-accent)] transition-all duration-300" style={{ width: `${dl.pct}%` }} />
                            </div>
                            <span className="w-8 text-right">{dl.pct}%</span>
                          </span>
                        ) : (
                          <span className="flex items-center gap-1.5 px-2 md:px-3 py-1.5 md:py-2 rounded-full text-xs text-[var(--color-accent)] animate-pulse">
                            <div className="w-3 h-3 border-2 border-[var(--color-accent)] border-t-transparent rounded-full animate-spin" />
                            <span className="hidden sm:inline">{dl.message === 'En cola' ? `En cola${dl.source ? ` (${dl.source})` : ''}` : 'Descargando'}</span>
                          </span>
                        )}
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
                            <span className="hidden sm:inline">Bajar</span>
                          </button>
                        )
                        if (dl.status === 'searching') return (
                          <span className="flex-shrink-0 flex items-center gap-1.5 text-xs text-yellow-400">
                            <div className="w-3 h-3 border-2 border-yellow-400 border-t-transparent rounded-full animate-spin" />
                            <SearchingLabel className="hidden sm:inline" />
                            <span className="sm:hidden">...</span>
                          </span>
                        )
                        if (dl.status === 'downloading') return dl.pct != null
                          ? (
                            <span className="flex-shrink-0 flex items-center gap-1.5 text-xs text-[var(--color-accent)]">
                              <div className="w-3 h-3 border-2 border-[var(--color-accent)] border-t-transparent rounded-full animate-spin" />
                              <div className="w-10 h-1.5 bg-gray-700 rounded-full overflow-hidden"><div className="h-full rounded-full bg-[var(--color-accent)] transition-all duration-300" style={{ width: `${dl.pct}%` }} /></div>
                              <span>{dl.pct}%</span>
                            </span>
                          ) : (
                            <span className="flex-shrink-0 flex items-center gap-1.5 text-xs text-[var(--color-accent)] animate-pulse">
                              <div className="w-3 h-3 border-2 border-[var(--color-accent)] border-t-transparent rounded-full animate-spin" />
                              <span className="hidden sm:inline">{dl.message === 'En cola' ? 'En cola' : 'Descargando'}</span>
                              <span className="sm:hidden">...</span>
                            </span>
                          )
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
          data-discover-ctx="1"
          className="hidden md:block fixed z-50 bg-[var(--bg-panel)] border border-gray-700 rounded-lg shadow-2xl py-1 min-w-48"
          style={{ left: Math.min(discoverCtx.x, window.innerWidth - 220), top: Math.min(discoverCtx.y, Math.max(8, window.innerHeight - 460)) }}
        >
          <div className="px-3 py-1.5 text-xs text-gray-500 border-b border-[var(--border-color)] truncate">
            {discoverCtx.track?.artist} - {discoverCtx.track?.title}
          </div>
          {isInLibrary(discoverCtx.track) && !clearedTrackIds.has(discoverCtx.track?.id) ? (
            agentConnected ? (
              <button
                onClick={() => {
                  const loc = isInLibrary.findLocation(discoverCtx.track) || { folder: '', file: '' }
                  ;(async () => {
                    // folder = género de la IA; un tema sin organizar vive en la
                    // raíz → si da 404, reintentar en la raíz para resaltarlo.
                    const r = await agentFetch(`open-folder?folder=${encodeURIComponent(loc.folder)}&file=${encodeURIComponent(loc.file)}`).catch(() => null)
                    if (loc.file && (!r || !r.ok)) await agentFetch(`open-folder?file=${encodeURIComponent(loc.file)}`).catch(() => {})
                  })()
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
          {durationOptions.map(secs => (
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
          <button onClick={() => modernizarTrack(discoverCtx.track)}
            className="w-full text-left px-3 py-2 text-sm text-gray-300 hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary,white)] transition-colors flex items-center gap-2">
            <svg className="w-4 h-4 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
            Modernizar (remix al azar)
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
        <div ref={discoverCtxRef} data-discover-ctx="1" className="md:hidden fixed inset-x-0 bottom-0 z-50 bg-[var(--bg-panel)] rounded-t-2xl shadow-2xl border-t border-[var(--border-color)] animate-sheet-up">
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
                    ;(async () => {
                    // folder = género de la IA; un tema sin organizar vive en la
                    // raíz → si da 404, reintentar en la raíz para resaltarlo.
                    const r = await agentFetch(`open-folder?folder=${encodeURIComponent(loc.folder)}&file=${encodeURIComponent(loc.file)}`).catch(() => null)
                    if (loc.file && (!r || !r.ok)) await agentFetch(`open-folder?file=${encodeURIComponent(loc.file)}`).catch(() => {})
                  })()
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
            <div className={`grid gap-2 px-4 pb-2 ${durationOptions.length === 1 ? 'grid-cols-1' : 'grid-cols-4'}`}>
              {durationOptions.map(secs => (
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
            <button onClick={() => modernizarTrack(discoverCtx.track)}
              className="w-full text-left px-4 py-3 rounded-xl text-sm text-[var(--text-primary)] hover:bg-[var(--bg-hover)] transition-colors flex items-center gap-3 active:scale-[0.98]">
              <div className="w-8 h-8 rounded-full bg-purple-500/15 flex items-center justify-center">
                <svg className="w-4 h-4 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
              </div>
              Modernizar (remix al azar)
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

      {/* Barra "Modernizado": el remix al azar está sonando — bajar u otro */}
      {remixPick && (
        <div className="fixed bottom-24 left-1/2 -translate-x-1/2 z-40 flex items-center gap-2.5 px-3.5 py-2.5 rounded-2xl bg-[var(--bg-panel)] border border-[var(--border-color)] shadow-2xl max-w-[94vw]">
          <svg className="w-4 h-4 text-purple-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
          <div className="min-w-0">
            <div className="text-[9px] uppercase tracking-wider text-[var(--text-muted)] font-bold">Modernizado{remixPick.artist ? ` · ${remixPick.artist}` : ''}</div>
            <div className="text-xs font-medium text-[var(--text-primary)] truncate max-w-[15rem]" title={remixPick.title}>{remixPick.title}</div>
          </div>
          <button
            onClick={() => {
              searchAndDownload({ ...remixPick.base, id: `rmx-${remixPick.base.id}-${Date.now()}`, title: remixPick.title })
              toast('Buscando ese remix en SoulSeek...', 'success', 2500)
            }}
            className="flex-shrink-0 flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-all active:scale-95 hover:brightness-110"
            style={{ background: 'var(--color-accent)', color: 'var(--color-accent-text)' }}
          >
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2M12 4v12m0 0l-4-4m4 4l4-4" /></svg>
            Descargar
          </button>
          <button onClick={() => modernizarTrack(remixPick.base)} className="flex-shrink-0 px-2 py-1.5 rounded-lg text-xs font-semibold text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)] transition-all" title="Probar otro remix">
            Otro
          </button>
          <button onClick={() => setRemixPick(null)} className="flex-shrink-0 p-1 rounded-lg text-gray-500 hover:text-red-400 transition-colors" title="Cerrar">
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>
      )}

      {/* Share dialog — modal in-app con preview del track + link copiable */}
      {shareDialog && (() => {
        const { track, url } = shareDialog
        const shareText = `🎵 ${track.artist || ''} - ${track.title || ''}`.trim()
        const close = () => setShareDialog(null)
        const copyLink = async () => {
          try {
            if (navigator.clipboard && window.isSecureContext) {
              await navigator.clipboard.writeText(url)
            } else {
              const ta = document.createElement('textarea')
              ta.value = url
              ta.style.position = 'fixed'
              ta.style.left = '-9999px'
              document.body.appendChild(ta)
              ta.select()
              document.execCommand('copy')
              document.body.removeChild(ta)
            }
            toast('Link copiado ✓', 'success', 2000)
            close()
          } catch (e) {
            toast('No se pudo copiar — seleccioná el link y copialo a mano', 'warning', 4000)
          }
        }
        const nativeShare = async () => {
          if (!navigator.share) return
          try {
            await navigator.share({ title: shareText, text: shareText, url })
            close()
          } catch {}
        }
        return (
          <div className="fixed inset-0 z-[80] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 animate-fade-in" onClick={close}>
            <div className="w-full max-w-md bg-[var(--bg-panel)] border border-[var(--border-color)] rounded-2xl shadow-2xl overflow-hidden" onClick={(e) => e.stopPropagation()}>
              <div className="flex items-center justify-between px-5 py-3 border-b border-[var(--border-color)]">
                <h3 className="text-sm font-semibold text-[var(--text-primary)]">Compartir tema</h3>
                <button onClick={close} className="w-8 h-8 flex items-center justify-center rounded-lg text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)] transition-all active:scale-90" title="Cerrar">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                </button>
              </div>
              <div className="px-5 py-4 flex items-center gap-3">
                {track.artwork_url && (
                  <img src={track.artwork_url.replace('1400x1400', '250x250')} alt="" className="w-14 h-14 rounded-lg object-cover ring-1 ring-white/10 flex-shrink-0" />
                )}
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold text-[var(--text-primary)] truncate">{track.title}</div>
                  <div className="text-xs text-[var(--text-muted)] truncate">{track.artist}</div>
                </div>
              </div>
              <div className="px-5 pb-3">
                <label className="block text-[10px] uppercase tracking-widest text-[var(--text-muted)] font-semibold mb-1">Link público</label>
                <input
                  readOnly
                  value={url}
                  onFocus={(e) => e.target.select()}
                  className="w-full px-3 py-2 bg-[var(--bg-input)] border border-[var(--border-color)] rounded-lg text-xs font-mono text-[var(--text-primary)] focus:outline-none focus:border-[var(--color-accent)]"
                />
                <p className="mt-1.5 text-[11px] text-[var(--text-muted)]">Quien abra el link puede escuchar el preview sin loguearse.</p>
              </div>
              <div className="px-5 pb-5 flex gap-2">
                <button
                  onClick={copyLink}
                  className="flex-1 flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg text-sm font-semibold text-[var(--color-accent-text)] transition-all active:scale-95"
                  style={{ background: 'var(--color-accent)' }}
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>
                  Copiar link
                </button>
                {typeof navigator !== 'undefined' && navigator.share && (
                  <button
                    onClick={nativeShare}
                    className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-semibold bg-[var(--bg-input)] border border-[var(--border-color)] text-[var(--text-primary)] hover:bg-[var(--bg-hover)] transition-all active:scale-95"
                    title="Usar el compartidor del sistema"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z"/></svg>
                    Compartir…
                  </button>
                )}
              </div>
            </div>
          </div>
        )
      })()}

      {/* Download activity toast */}
      {(() => {
        const active = Object.entries(downloadQueue).filter(([, d]) => d.status === 'searching' || d.status === 'downloading')
        const done = Object.entries(downloadQueue).filter(([, d]) => d.status === 'done')
        const errors = Object.entries(downloadQueue).filter(([, d]) => d.status === 'not_found' || d.status === 'error')
        if (active.length === 0 && done.length === 0) return null
        return (
          <div className="flex-shrink-0 border-t border-[var(--border-color)] bg-[var(--bg-genre-header)] px-3 md:px-6 py-2 flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5 flex-wrap">
              {active.length > 0 && (
                <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-[var(--color-accent)]/15 text-[var(--color-accent)] ring-1 ring-[var(--color-accent)]/30">
                  <div className="w-3 h-3 border-2 border-[var(--color-accent)] border-t-transparent rounded-full animate-spin" />
                  {active.length} descargando
                </span>
              )}
              {done.length > 0 && (
                <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-green-500/10 text-green-400 ring-1 ring-green-500/30">
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                  </svg>
                  {done.length} descargados
                </span>
              )}
              {errors.length > 0 && (
                <span className="px-2.5 py-1 rounded-full text-[11px] font-semibold bg-white/[0.04] text-gray-500 ring-1 ring-white/10">{errors.length} no encontrados</span>
              )}
            </div>
            <div className="flex items-center gap-1.5">
              {(done.length > 0 || active.length > 0) && (
                <button
                  onClick={onGoToDownloads}
                  className="px-3 py-1 rounded-full text-[11px] font-bold transition-all active:scale-95 hover:brightness-110"
                  style={{ background: 'var(--color-accent)', color: 'var(--color-accent-text)' }}
                >
                  Ver descargas
                </button>
              )}
              {active.length === 0 && (
                <button
                  onClick={() => setDownloadQueue({})}
                  className="px-2.5 py-1 rounded-full text-[11px] font-semibold text-gray-500 hover:text-gray-300 hover:bg-white/5 transition-all"
                >
                  Limpiar
                </button>
              )}
            </div>
          </div>
        )
      })()}

      {/* YouTube Music embed — POP/LATIN preview. Audio is primary (via footer);
          video is hidden by default and toggled with the YT button sitting
          just above the AudioPlayerBar. The iframe is ALWAYS rendered while a
          track is active so audio keeps flowing; only its position changes. */}
      {youtubeEmbed && (
        <>
          {/* Toggle button — floats just above the global AudioPlayerBar.
              The footer has h-14 (≈3.5rem) so we sit at bottom-20 with a small gap. */}
          <button
            onClick={() => setYoutubeVisible(v => !v)}
            className={`fixed bottom-20 right-4 z-[71] w-11 h-11 flex items-center justify-center rounded-full shadow-xl shadow-black/40 ring-1 transition-all duration-200 active:scale-95 ${
              youtubeVisible
                ? 'bg-red-600 ring-red-400/40 text-white hover:bg-red-500'
                : 'bg-[var(--bg-panel)] ring-[var(--border-color)] text-red-500 hover:text-red-400 hover:bg-[var(--bg-hover)]'
            }`}
            title={youtubeVisible ? 'Ocultar video' : 'Ver video de YouTube'}
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
              <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/>
            </svg>
          </button>

          {/* Iframe — visible card OR parked offscreen. Parking via `left/top` (not
              display:none) keeps the iframe playing without browser throttling. */}
          <div
            className={`z-[70] bg-[var(--bg-panel)] border border-[var(--border-color)] rounded-2xl shadow-2xl overflow-hidden ${
              youtubeVisible
                ? 'fixed bottom-20 right-4 w-80 max-w-[calc(100vw-2rem)] animate-fade-in'
                : 'fixed w-1 h-1 opacity-0 pointer-events-none'
            }`}
            style={youtubeVisible ? undefined : { left: '-9999px', top: '-9999px' }}
          >
            {youtubeVisible && (
              <div className="flex items-center justify-between px-3 py-2 border-b border-[var(--border-color)]">
                <div className="min-w-0 flex-1">
                  <div className="text-xs font-semibold text-[var(--text-primary)] truncate">{youtubeEmbed.track?.title}</div>
                  <div className="text-[10px] text-[var(--text-muted)] truncate">{youtubeEmbed.track?.artist} • YouTube Music</div>
                </div>
                <button
                  onClick={() => setYoutubeVisible(false)}
                  className="ml-2 w-7 h-7 flex-shrink-0 flex items-center justify-center rounded-lg text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)] transition-all active:scale-90"
                  title="Minimizar"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 13H5" /></svg>
                </button>
              </div>
            )}
            <iframe
              key={youtubeEmbed.videoId}
              src={`https://www.youtube-nocookie.com/embed/${youtubeEmbed.videoId}?autoplay=1&modestbranding=1&rel=0`}
              title="YouTube preview"
              className={youtubeVisible ? 'w-full aspect-video border-0' : 'w-full h-full border-0'}
              allow="autoplay; encrypted-media; picture-in-picture"
              allowFullScreen
            />
          </div>
        </>
      )}
    </div>
  )
}
