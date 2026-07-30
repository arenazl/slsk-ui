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
import { API_BASE, agentFetch, agentUrl, formatSmallMeta, prettyMeta, normDupeKey, GENRE_COLORS, ScreenHint, useQS, IS_MOBILE_DEVICE } from '../App';
import { fsaBackend } from '../storage';

export default  forwardRef(function Library({ playingFile, onPlay, onPlayPause, onStop, onStartPreviewMode, previewMode, onStopPreviewMode, agentConnected, onRadio, authUser, collection }, ref) {
  const toast = useToast()
  const confirmDialog = useConfirm()
  const [files, setFiles] = useState([])
  const [loading, setLoading] = useState(true)
  const [classifying, setClassifying] = useState(false)
  const [moving, setMoving] = useState(false)
  const [organizing, setOrganizing] = useState(false)
  const [expanded, setExpanded] = useState({})
  const [search, setSearch] = useQS('q', '')
  const [localSearch, setLocalSearch] = useState(search)
  useEffect(() => { setLocalSearch(search) }, [search])
  const searchTimeoutRef = useRef(null)
  const [view, setView] = useQS('view', IS_MOBILE_DEVICE ? 'list' : 'cards')
  const [starFilter, _setStarFilter] = useQS('stars', '0')
  const setStarFilter = useCallback((v) => _setStarFilter(String(v)), [_setStarFilter])
  const [exportName, setExportName] = useState('')
  const [exportMode, setExportMode] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [exportWithTracks, setExportWithTracks] = useState(false)
  const [detectingKeys, setDetectingKeys] = useState(false)
  const [fixingMeta, setFixingMeta] = useState(false)
  const [sortCol, setSortCol] = useQS('sort', 'date')
  const [sortDir, setSortDir] = useQS('dir', 'desc')
  const [showDupes, setShowDupes] = useState(false)
  const [dupeRemove, setDupeRemove] = useState(() => new Set())
  const [showFilename, setShowFilename] = useState(() => { try { return localStorage.getItem('lib_show_filename') === '1' } catch { return false } })
  const toggleFilename = () => setShowFilename(v => { const n = !v; try { localStorage.setItem('lib_show_filename', n ? '1' : '0') } catch {} return n })
  const [genreFilter, setGenreFilter] = useState([])
  const [deletingDupes, setDeletingDupes] = useState(false)
  const [ctxMenu, setCtxMenu] = useState(null) // { x, y, file }
  // Ecosistema activo del recategorizador del menú contextual (la clínica):
  // arranca en el del tema y el toggle permite moverlo de ambiente en un click.
  const [ctxEco, setCtxEco] = useState('edm')
  const [fetchingArt, setFetchingArt] = useState(false)
  const longPressRef = useRef({ timer: null, fired: false }) // long-press en mobile -> menu contextual
  const [customGenre, setCustomGenre] = useState('')
  const [toolsOpen, setToolsOpen] = useState(false)
  const ctxRef = useRef(null)
  const toolsRef = useRef(null)

  const fetchIdRef = useRef(0)
  // SWR por colección: al alternar EDM/POP/LATIN se muestra al INSTANTE lo
  // último conocido de esa colección y se revalida por detrás (antes: ~2s de
  // pantalla vacía en cada cambio).
  const libCacheRef = useRef({})
  const fetchLibrary = useCallback(async () => {
    const id = ++fetchIdRef.current
    if (libCacheRef.current[collection]) setFiles(libCacheRef.current[collection])
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
      // Fetch metadata from Cloud Run (Cloudinary = source of truth).
      // cache-bust + no-store: sin esto el navegador/SW servía el manifest viejo y
      // los contadores (ej. "Metatags (N)") no bajaban tras curar.
      // SIN filtro de colección: el cruce necesita la metadata de TODOS los
      // archivos del disco (el filtro por colección es de la VISTA). Filtrada,
      // los temas de otras colecciones quedaban "sin artista" e inflaban los
      // contadores (Curador/Metatags marcaban 415 sucios que no existían).
      const metaRes = await fetch(`${API_BASE}/api/metadata?user=${encodeURIComponent(authUser?.name || '')}&_=${Date.now()}`, { cache: 'no-store' })
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
        // Cloud Run metadata. Metadata enriches title/artist/rating/key when
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
            artwork: meta.artwork || meta.artwork_url || '',  // mini-foto en grillas
          }
        })
        if (id === fetchIdRef.current) { libCacheRef.current[collection] = merged; setFiles(merged) }
      } else {
        // No FSA, no agent: fall back to Cloud Run metadata (read-only view)
        const libRes = await fetch(`${API_BASE}/api/library?user=${encodeURIComponent(authUser?.name || '')}&collection=${collection}`)
        const data = await libRes.json()
        if (id === fetchIdRef.current) { libCacheRef.current[collection] = data; setFiles(data) }
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

  // Auto-classify: corre DESPUÉS de la descarga. Cuando un tema nuevo entra a la
  // biblioteca (files cambia post-download), se le pone género vía Gemini, UNA
  // vez (dedup a nivel módulo _autoClassifyAttempted → no re-loopea). La IA nunca
  // bloquea la descarga: corre sobre archivos YA bajados, best-effort.
  const autoClassifyInflightRef = useRef(false)
  useEffect(() => {
    if (!authUser?.name || autoClassifyInflightRef.current) return
    const candidates = files
      .filter(f => f.genre_estimated || (!f.genre && f.has_metadata !== undefined))
      .map(f => f.filename)
      .filter(fn => !_autoClassifyAttempted.has(fn))
    if (candidates.length === 0) return
    candidates.forEach(fn => _autoClassifyAttempted.add(fn))
    autoClassifyInflightRef.current = true
    fetch(`${API_BASE}/api/classify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: authUser.name, filenames: candidates }),
    })
      .then(r => r.json())
      .then(data => { if (data?.classified > 0) fetchLibrary() })
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

  // Al abrir el menú, el toggle de ecosistema arranca en el del tema.
  useEffect(() => {
    if (ctxMenu?.file) setCtxEco(ctxMenu.file.collection || 'edm')
  }, [ctxMenu])

  // Carátulas determinísticas (iTunes→Deezer) vía server; actualiza estado local.
  const fetchArtworkFor = async (filenames) => {
    if (!filenames.length || fetchingArt) return
    setFetchingArt(true)
    try {
      const res = await fetch(`${API_BASE}/api/fetch-artwork`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: authUser?.name || '', filenames }),
      })
      const data = await res.json()
      const resolved = data.resolved || {}
      const n = Object.keys(resolved).length
      if (n) setFiles(prev => prev.map(f => resolved[f.filename] ? { ...f, artwork: resolved[f.filename] } : f))
      toast(n
        ? `Carátulas: ${n} encontradas${data.missed?.length ? `, ${data.missed.length} sin match` : ''}`
        : 'Sin carátula en iTunes/Deezer', n ? 'success' : 'info', 3500)
    } catch (e) {
      console.error('fetch-artwork', e)
      toast('Error buscando carátulas', 'error', 3000)
    } finally {
      setFetchingArt(false)
    }
  }

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
    // Anchor the menu to the ROW element instead of the click coords —
    // on tablets long-press and touch events report inconsistent x/y,
    // so the menu was showing far from the track. Bottom-left of the row
    // is predictable on any input device.
    const row = e.currentTarget?.getBoundingClientRect?.() || null
    if (row) {
      setCtxMenu({ x: row.left + 8, y: row.bottom + 4, file })
    } else {
      setCtxMenu({ x: e.clientX, y: e.clientY, file })
    }
    setCustomGenre('')
  }

  const changeGenre = (newGenre, eco) => {
    const f = ctxMenu?.file
    if (f && (newGenre !== f.genre || (eco && eco !== (f.collection || 'edm')))) {
      moveFile(f, newGenre, eco)
    }
    setCtxMenu(null)
  }

  const deleteFile = async (file) => {
    setCtxMenu(null)
    // OJO: acá había refs a isInLibrary/setLocalFilesSet que NO existen en este
    // componente (ReferenceError al borrar) — se resuelven con filename directo.
    const targetFilename = file.filename || file.local_name || ''
    if (!targetFilename && !file.title) {
      console.warn('deleteFile: no target filename found for', file)
      return
    }
    const fname = targetFilename || ''
    setFiles(prev => prev.filter(f => f.filename !== fname))
    try {
      if (agentConnected) {
        await agentFetch('delete', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ filename: fname, artist: file.artist, title: file.title }),
        })
      }
      await fetch(`${API_BASE}/api/delete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filename: fname, artist: file.artist, title: file.title, username: authUser?.name || '' }),
      })
      fetchLibrary()
      window.dispatchEvent(new Event('library-changed'))
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

  const openFolder = async (folder, file) => {
    // Si pasamos `file`, el agente hace `explorer /select,"path\file"` (Windows)
    // o `open -R` (mac) — abre la carpeta CON el archivo resaltado.
    // Sin `file` solo abre la carpeta sin marcar nada.
    const fileQs = file ? `&file=${encodeURIComponent(file)}` : ''
    if (agentConnected) {
      const r = await agentFetch(`open-folder?folder=${encodeURIComponent(folder || '')}${fileQs}`).catch(() => null)
      if (r?.ok || !file) return
      // El subfolder de la UI puede estar VIEJO (recategorización movió el
      // archivo) o el tema estar aún en la raíz. Cadena de rescate:
      // 1) raíz → 2) ubicación REAL según el listado fresco del agente →
      // 3) toast honesto (antes fallaba mudo y "no llevaba al tema").
      const r2 = await agentFetch(`open-folder?file=${encodeURIComponent(file)}`).catch(() => null)
      if (r2?.ok) return
      try {
        const lib = await agentFetch('library').then(x => x.json())
        const hit = Array.isArray(lib) ? lib.find(t => t.filename === file) : null
        if (hit?.subfolder) {
          const r3 = await agentFetch(`open-folder?folder=${encodeURIComponent(hit.subfolder)}&file=${encodeURIComponent(file)}`).catch(() => null)
          if (r3?.ok) return
        }
      } catch {}
      toast('No encontré el archivo en el disco (¿se movió o se borró?)', 'warning', 3500)
      return
    } else {
      await fetch(`${API_BASE}/api/open-folder`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ folder: folder || '', file: file || '' }),
      })
    }
  }

  const classifyAndOrganize = async () => {
    setOrganizing(true)
    try {
      const ungroupedNames = files.filter(f => !f.genre).map(f => f.filename)
      if (ungroupedNames.length > 0) {
        setClassifying(true)
        toast(`Clasificando ${ungroupedNames.length} temas automáticamente...`, 'info', 4000)
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

  // Completa artista/título faltantes (y key/bpm de paso) vía Beatport+IA en el
  // backend. NUNCA pisa el género ya asignado. Solo toca el manifest (no el archivo).
  // Arregla los metatags vía el AGENTE: cura los faltantes (Beatport+IA, sin pisar
  // género) y ESCRIBE los tags dentro del archivo (mutagen) para que Rekordbox los lea.
  // ── Curador en vivo (side modal): pasa los temas "sucios" por la cascada
  // determinística. AUTO-aplica SOLO con fuente Beatport (certeza de catálogo);
  // lo que decide la IA queda "a revisar" y el dueño elige por tema.
  const [curadorOpen, setCuradorOpen] = useState(false)
  const [curRunning, setCurRunning] = useState(false)
  const [curRows, setCurRows] = useState([])
  const [curStats, setCurStats] = useState({ done: 0, auto: 0, revisar: 0, err: 0, total: 0 })
  const curCancelRef = useRef(false)

  const aplicarCuracion = async (filename, d) => {
    const r = await fetch(`${API_BASE}/api/track-meta`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: authUser?.name || '', filename, artist: d.artist, title: d.title, genre: d.genre, collection: d.collection, bpm: d.bpm, key: d.key }),
    })
    const ok = (await r.json().catch(() => ({}))).ok
    if (!ok) throw new Error('no se pudo aplicar')
  }

  const isDirtyMeta = f => Boolean(f && (!f.artist || !f.title || f.artist === 'Unknown Artist' || f.title === 'Unknown Title' || !f.genre || !f.key || !f.bpm))

  const startCurador = async () => {
    const targets = files.filter(isDirtyMeta)
    setCurStats({ done: 0, auto: 0, revisar: 0, err: 0, total: targets.length })
    setCurRows([])
    setCurRunning(true)
    curCancelRef.current = false
    for (const f of targets) {
      if (curCancelRef.current) break
      const id = f.filename
      setCurRows(prev => [{ id, filename: f.filename, estado: 'procesando', antes: { artist: f.artist, title: f.title } }, ...prev])
      try {
        const r = await fetch(`${API_BASE}/api/curate-track`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ artist: f.artist || '', title: f.title || '', filename: f.filename }),
        })
        const d = await r.json()
        if (!d.artist && !d.title) throw new Error('sin propuesta')
        if (d.source === 'beatport') {
          await aplicarCuracion(f.filename, d)
          setCurRows(prev => prev.map(x => x.id === id ? { ...x, estado: 'auto', prop: d } : x))
          setCurStats(s => ({ ...s, done: s.done + 1, auto: s.auto + 1 }))
        } else {
          // IA o default → decisión del dueño (seleccionada por defecto para
          // el "Aplicar seleccionados"; desmarcás las que no te cierran)
          setCurRows(prev => prev.map(x => x.id === id ? { ...x, estado: 'revisar', prop: d, sel: true } : x))
          setCurStats(s => ({ ...s, done: s.done + 1, revisar: s.revisar + 1 }))
        }
      } catch (e) {
        setCurRows(prev => prev.map(x => x.id === id ? { ...x, estado: 'error', error: String(e.message || e).slice(0, 60) } : x))
        setCurStats(s => ({ ...s, done: s.done + 1, err: s.err + 1 }))
      }
    }
    setCurRunning(false)
    fetchLibrary()
  }

  const setSelTodas = (v) => setCurRows(prev => prev.map(x => x.estado === 'revisar' ? { ...x, sel: v } : x))

  const aplicarSeleccionados = async () => {
    const rows = curRows.filter(x => x.estado === 'revisar' && x.sel)
    for (const row of rows) {
      try {
        await aplicarCuracion(row.filename, row.prop)
        setCurRows(prev => prev.map(x => x.id === row.id ? { ...x, estado: 'ok' } : x))
      } catch {
        setCurRows(prev => prev.map(x => x.id === row.id ? { ...x, estado: 'error', error: 'no se pudo aplicar' } : x))
      }
    }
    toast(`${rows.length} curaciones aplicadas`, 'success', 2500)
    fetchLibrary()
  }

  const decidirRevision = async (row, aceptar) => {
    if (!aceptar) {
      setCurRows(prev => prev.map(x => x.id === row.id ? { ...x, estado: 'saltado' } : x))
      return
    }
    try {
      await aplicarCuracion(row.filename, row.prop)
      setCurRows(prev => prev.map(x => x.id === row.id ? { ...x, estado: 'ok' } : x))
      fetchLibrary()
    } catch {
      setCurRows(prev => prev.map(x => x.id === row.id ? { ...x, estado: 'error', error: 'no se pudo aplicar' } : x))
    }
  }

  const fixMetatags = async () => {
    if (!agentConnected) { toast('Necesitás el agente conectado para escribir los tags en los archivos'); return }
    const before = files.filter(isDirtyMeta).length
    setFixingMeta(true)
    try {
      const res = await agentFetch('fix-metadata', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: authUser?.name || '' }),
      })
      const data = await res.json().catch(() => ({}))
      const after = Math.max(0, before - (data.fixed_meta || 0))
      toast(`Faltantes: ${before} → ${after}  ·  ${data.tags_written || 0} tags escritos en los archivos${data.errors ? ` · ${data.errors} rotos` : ''}`)
      fetchLibrary()
    } catch (e) {
      console.error('fixMetatags failed', e)
      toast('Error arreglando metatags')
    } finally {
      setFixingMeta(false)
    }
  }

  const detectKeys = async () => {
    setDetectingKeys(true)
    try {
      // Get list of tracks without key from Cloud Run (Cloudinary manifest)
      const res = await fetch(`${API_BASE}/api/detect-keys`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: authUser?.name || '' }) })
      const data = await res.json()
      const toDetect = data.to_detect || []
      if (toDetect.length === 0) { fetchLibrary(); return }

      // For each track, fetch audio from agent and send to Cloud Run for analysis
      // Cloud Run's detect-key endpoint now also updates Cloudinary manifest
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

  // Abre el panel de duplicados, pre-marcando los "idénticos" (misma copia: mismo
  // formato + tamaño ~igual) para sacar. Los "dudosos" (otra versión/calidad) los
  // marca el usuario en el panel.
  const openDupes = () => {
    const auto = new Set()
    dupeGroups.forEach(g => g.identical.forEach(d => auto.add(d.filename)))
    setDupeRemove(auto)
    setShowDupes(true)
  }

  // Saca SOLO los archivos marcados: el agente borra el archivo local y Cloud Run
  // limpia la entrada del manifest. Refresca si cualquiera de los dos reportó borrado.
  const applyDupeResolution = async () => {
    const toDelete = [...dupeRemove]
    if (!toDelete.length) { setShowDupes(false); return }
    setDeletingDupes(true)
    let agentDeleted = 0
    try {
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
      const data = await res.json().catch(() => ({}))
      if ((data.deleted || 0) + agentDeleted > 0) fetchLibrary()
    } catch (e) {
      console.error('Failed to delete dupes', e)
    } finally {
      setDeletingDupes(false)
      setShowDupes(false)
      setDupeRemove(new Set())
    }
  }

  const moveFile = async (file, newGenre, newCollection) => {
    setMoving(true)
    // Optimistic update
    setFiles(prev => prev.map(f =>
      f.filename === file.filename ? { ...f, genre: newGenre, collection: newCollection || f.collection, in_subfolder: !!newGenre, subfolder: newGenre } : f
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
      // Update genre metadata on Cloud Run (Cloudinary) — collection viaja solo
      // en recategorización de ecosistema (acción manual del dueño, pisa todo)
      await fetch(`${API_BASE}/api/move-file`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filename: file.filename, genre: newGenre, username: authUser?.name || '', collection: newCollection || undefined }),
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
    files.forEach(f => {
      if (collection !== 'all' && (f.collection || 'edm') !== collection) return
      const g = f.genre || ''
      if (g) counts[g] = (counts[g] || 0) + 1
    })
    return Object.entries(counts).sort((a, b) => b[1] - a[1]).map(([g, c]) => ({ genre: g, count: c }))
  }, [files, collection])

  // Filter by current collection (TODOS / EDM / POP / LATIN).
  const collectionFiltered = collection === 'all'
    ? files
    : files.filter(f => (f.collection || 'edm') === collection)

  // Filter by genre (multi-select)
  const genreFiltered = genreFilter.length === 0 ? collectionFiltered : collectionFiltered.filter(f => genreFilter.includes(f.genre))

  // Filter by search — Global search across ALL files/collections when active
  const q = search.toLowerCase().trim()
  const activeQ = q.length >= 3 ? q : (q.length > 0 ? q : '')
  const searchBase = activeQ ? files : genreFiltered
  const searchFiltered = activeQ
    ? searchBase.filter(f =>
        (f.filename || '').toLowerCase().includes(activeQ) ||
        (f.title || '').toLowerCase().includes(activeQ) ||
        (f.artist || '').toLowerCase().includes(activeQ) ||
        (f.genre || '').toLowerCase().includes(activeQ) ||
        (f.collection || '').toLowerCase().includes(activeQ))
    : genreFiltered

  // Filter by stars (multi-select)
  const selectedStars = starFilter ? starFilter.split(',').map(Number).filter(n => n > 0) : []
  const starsFiltered = selectedStars.length > 0
    ? searchFiltered.filter(f => selectedStars.includes(f.rating || 0))
    : searchFiltered

  // Duplicate detection - normalize by filename removing track numbers, BPM, extensions
  const normDupe = normDupeKey  // shared module-level helper (see normDupeKey)
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

  // Group duplicates for the Tracks view.
  // Dentro de cada grupo separamos por TAMAÑO+FORMATO:
  //  - "identical": misma copia (mismo formato y tamaño ~igual) -> se sacan solos.
  //  - "doubtful": tamaño/formato distinto -> puede ser otra versión (Extended vs
  //    Original) o distinta calidad -> lo decide el usuario en el panel.
  const SIZE_TOL = 0.03 // ±3% de tamaño = misma copia
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
        // keep = mejor: rated > categorized > format > size
        g.sort((a, b) => dupeScore(b) - dupeScore(a))
        const keep = g[0]
        const ks = keep.size_mb || 0
        const identical = []
        const doubtful = []
        g.slice(1).forEach(d => {
          const sameFmt = (d.format || '') === (keep.format || '')
          const closeSize = ks > 0 && Math.abs((d.size_mb || 0) - ks) / ks <= SIZE_TOL
          if (sameFmt && closeSize) identical.push(d)
          else doubtful.push(d)
        })
        return { key: normDupe(keep.filename), keep, identical, doubtful, dupes: [...identical, ...doubtful] }
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

  // Géneros por ECOSISTEMA para el recategorizador del menú contextual:
  // el toggle EDM/POP/LATIN define qué lista se ofrece (más los géneros
  // custom ya existentes en esa colección).
  const ECO_GENRES = {
    edm: ['Tech House', 'Deep House', 'Melodic House', 'Progressive House', 'Minimal Tech', 'Afro House',
      'Melodic Techno', 'Peak Time Techno', 'Hard Techno', 'Raw Techno',
      'Trance', 'Progressive Trance', 'Psy Trance',
      'Drum & Bass', 'Breaks', 'Electro', 'Downtempo', 'Indie Dance', 'Nu Disco', 'Other'],
    pop: ['Pop', 'Rock', 'Hip Hop', 'R&B', 'Indie', 'Funk', 'Soul', 'Disco', 'Dance', 'Other'],
    latin: ['Reggaeton', 'Cumbia', 'RKT', 'Dembow', 'Salsa', 'Bachata', 'Merengue', 'Latin Pop', 'Rock Nacional', 'Cuarteto', 'Other'],
  }
  const ecoGenreOptions = (eco, currentGenre) => {
    const base = ECO_GENRES[eco] || ECO_GENRES.edm
    const customs = []
    files.forEach(f => {
      if (f.genre && (f.collection || 'edm') === eco && !base.includes(f.genre) && !customs.includes(f.genre)) customs.push(f.genre)
    })
    const opts = [...base, ...customs.sort()]
    // El género actual del tema siempre visible aunque sea de otro ambiente,
    // para que el select no mienta.
    if (currentGenre && !opts.includes(currentGenre)) opts.unshift(currentGenre)
    return opts
  }

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
      case 'duration': return dir * ((a.duration || 0) - (b.duration || 0))
      case 'date': return dir * (a.date || '').localeCompare(b.date || '')
      default: return 0
    }
  })

  if (loading) {
    return <SkeletonRows rows={12} />
  }

  return (
    <div className="flex-1 flex flex-col min-h-0">
      <ScreenHint id="library" title="Tu biblioteca" tips={[
        { icon: '⭐', text: <>Click <strong>derecho</strong> sobre un track para puntuar, mover de género, o renombrar. En mobile: deslizá lateral.</> },
        { icon: '🎼', text: <>Botón <strong>Detectar Keys</strong> — análisis automático que pone tonalidad (C, Am, etc) a cada tema para mezclar armónicamente después.</> },
        { icon: '🤖', text: <>Botón <strong>Clasificar</strong> — detector automático de género (Tech House, Melodic, Trance...) que mueve a la subcarpeta correcta.</> },
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

        {/* View toggle — 3 icon-only buttons */}
        <div className="flex items-center gap-1 bg-[var(--bg-input)]/40 p-0.5 rounded-lg border border-[var(--border-color)] flex-shrink-0">
          {[
            {
              key: 'cards',
              title: 'Vista de Tarjetas por Género (Cards)',
              icon: (
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
                </svg>
              )
            },
            {
              key: 'list',
              title: 'Vista Unida por Género (Join)',
              icon: (
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                </svg>
              )
            },
            {
              key: 'tracks',
              title: 'Lista Plana (Tracks)',
              icon: (
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17V5l12-2v12M9 17c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2z" />
                </svg>
              )
            }
          ].map(tab => (
            <button
              key={tab.key}
              onClick={() => setView(tab.key)}
              title={tab.title}
              className={`w-7 h-7 flex items-center justify-center rounded-md transition-all duration-200 ${
                view === tab.key
                  ? 'bg-[var(--color-accent)] text-[var(--color-accent-text)] font-bold shadow'
                  : 'text-gray-400 hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)]'
              }`}
            >
              {tab.icon}
            </button>
          ))}
          
          <div className="w-px h-4 bg-[var(--border-color)] mx-1" />
          <button
            onClick={() => setExportMode(v => !v)}
            title="Mostrar panel de Exportación rápida"
            className={`flex items-center gap-1 px-2.5 h-7 rounded-md text-xs font-semibold transition-colors duration-200 ${
              exportMode 
                ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30' 
                : 'bg-[var(--bg-input)] text-[var(--text-muted)] hover:text-white border border-[var(--border-color)] hover:bg-[var(--bg-hover)]'
            }`}
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
            Exportar...
          </button>
        </div>
        {/* Star filter — 5-star interactive hover selector */}
        {(() => {
          const currentRating = selectedStars.length === 1 ? selectedStars[0] : (selectedStars.length === 0 ? 0 : null)
          return (
            <StarFilterHover
              rating={currentRating}
              selectedStars={selectedStars}
              onSelect={(star) => {
                if (star === 0) {
                  setStarFilter('0')
                } else if (selectedStars.includes(star) && selectedStars.length === 1) {
                  setStarFilter('0')
                } else {
                  setStarFilter(String(star))
                }
              }}
            />
          )
        })()}

        {/* Action buttons - hidden on mobile, shown on md+ */}

        {/* Action buttons — compact icon-only badges with tooltips */}
        {(() => {
          const toOrganize = files.filter(f => !f.in_subfolder && f.genre).length
          const pending = ungrouped.length + toOrganize
          if (pending === 0) return null
          const busy = classifying || organizing
          return (
            <button
              onClick={classifyAndOrganize}
              disabled={busy}
              className="hidden md:flex relative items-center justify-center h-8 w-8 disabled:opacity-50 rounded-lg text-[var(--color-accent-text)] transition-all duration-200 active:scale-95 flex-shrink-0"
              style={{ background: 'var(--color-accent)' }}
              title={busy ? 'Organizando subcarpetas...' : `Organizar en subcarpetas (${pending})`}
            >
              {busy ? (
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              ) : (
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
                </svg>
              )}
              <span className="absolute -top-1.5 -right-1.5 px-1.5 py-0.2 min-w-4 text-[9px] font-bold rounded-full bg-blue-600 text-white shadow text-center leading-tight">
                {pending}
              </span>
            </button>
          )
        })()}
        {files.some(f => !f.key) && (
          <button
            onClick={detectKeys}
            disabled={detectingKeys}
            className="hidden md:flex relative items-center justify-center h-8 w-8 disabled:opacity-50 rounded-lg text-[var(--color-accent-text)] transition-all duration-200 active:scale-95 flex-shrink-0"
            style={{ background: 'var(--color-accent)' }}
            title={detectingKeys ? 'Detectando tonalidades (Keys)...' : `Detectar tonalidades Key (${files.filter(f => !f.key).length})`}
          >
            {detectingKeys ? (
              <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
            ) : (
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2z" />
              </svg>
            )}
            <span className="absolute -top-1.5 -right-1.5 px-1.5 py-0.2 min-w-4 text-[9px] font-bold rounded-full bg-indigo-600 text-white shadow text-center leading-tight">
              {files.filter(f => !f.key).length}
            </span>
          </button>
        )}
        {(() => {
          const count = files.filter(isDirtyMeta).length
          return (
            <button
              onClick={() => setCuradorOpen(true)}
              className="hidden md:flex relative items-center justify-center h-8 w-8 rounded-lg border border-purple-500/40 bg-purple-500/10 text-purple-400 hover:bg-purple-500/20 transition-all duration-200 active:scale-95 flex-shrink-0"
              title={`Curador de metatags (${count} pendientes)`}
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" /></svg>
              {count > 0 && (
                <span className="absolute -top-1.5 -right-1.5 px-1.5 py-0.2 min-w-4 text-[9px] font-bold rounded-full bg-purple-600 text-white shadow text-center leading-tight">
                  {count}
                </span>
              )}
            </button>
          )
        })()}
        {filtered.filter(f => !f.artwork).length > 0 && (
          <button
            onClick={() => fetchArtworkFor(filtered.filter(f => !f.artwork).map(f => f.filename).slice(0, 60))}
            disabled={fetchingArt}
            className="hidden md:flex relative items-center justify-center h-8 w-8 rounded-lg border border-[var(--border-color)] bg-[var(--bg-input)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)] transition-all duration-200 active:scale-95 flex-shrink-0 disabled:opacity-50"
            title={`Buscar carátulas iTunes/Deezer (${filtered.filter(f => !f.artwork).length} sin foto)`}
          >
            {fetchingArt
              ? <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
              : <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>}
            <span className="absolute -top-1.5 -right-1.5 px-1.5 py-0.2 min-w-4 text-[9px] font-bold rounded-full bg-gray-700 text-white shadow text-center leading-tight">
              {filtered.filter(f => !f.artwork).length}
            </span>
          </button>
        )}
        {/* ── Side modal: Curador en vivo ── */}
        {curadorOpen && (
          <div className="fixed inset-y-0 right-0 z-[80] w-full sm:w-[30rem] bg-[var(--bg-panel)] border-l border-[var(--border-color)] shadow-2xl flex flex-col animate-sheet-up sm:animate-fade-in">
            <div className="flex items-center gap-2 px-4 py-3 border-b border-[var(--border-color)]">
              <svg className="w-5 h-5 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" /></svg>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-bold text-[var(--text-primary)]">Curador de metatags</div>
                <div className="text-[11px] text-[var(--text-muted)]">Beatport auto-aplica · la IA propone y decidís vos</div>
              </div>
              <button onClick={() => { curCancelRef.current = true; setCuradorOpen(false) }} className="p-1.5 rounded-lg text-gray-500 hover:text-red-400 transition-colors">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
            <div className="px-4 py-2.5 border-b border-[var(--border-color)] flex items-center gap-2 flex-wrap">
              {!curRunning ? (
                <button onClick={startCurador} disabled={files.filter(isDirtyMeta).length === 0}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all active:scale-95 hover:brightness-110 disabled:opacity-40"
                  style={{ background: 'var(--color-accent)', color: 'var(--color-accent-text)' }}>
                  <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z" /></svg>
                  Iniciar ({files.filter(isDirtyMeta).length} temas)
                </button>
              ) : null}
              {!curRunning && agentConnected && (
                <button onClick={fixMetatags} disabled={fixingMeta}
                  title="Paso final: escribe la curación en los tags físicos de los archivos (Rekordbox los lee). Antes era el botón Metatags."
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-[var(--bg-input)] border border-[var(--border-color)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)] transition-all active:scale-95 disabled:opacity-40">
                  {fixingMeta ? <div className="w-3 h-3 border-2 border-[var(--color-accent)] border-t-transparent rounded-full animate-spin" /> : (
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                  )}
                  {fixingMeta ? 'Grabando...' : 'Grabar tags en archivos'}
                </button>
              )}
              {curRunning ? (
                <button onClick={() => { curCancelRef.current = true }}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-red-500/15 text-red-400 hover:bg-red-500/25 transition-all active:scale-95">
                  <div className="w-3 h-3 border-2 border-red-400 border-t-transparent rounded-full animate-spin" />
                  Frenar
                </button>
              ) : null}
              {curStats.total > 0 && (
                <>
                  <div className="flex-1 h-1.5 min-w-16 bg-[var(--bg-hover)] rounded-full overflow-hidden">
                    <div className="h-full rounded-full bg-[var(--color-accent)] transition-all duration-300" style={{ width: `${Math.round((curStats.done / curStats.total) * 100)}%` }} />
                  </div>
                  <span className="text-[11px] font-mono text-[var(--text-muted)]">{curStats.done}/{curStats.total}</span>
                  <span className="px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-green-500/10 text-green-500">{curStats.auto} auto</span>
                  <span className="px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/10 text-amber-500">{curStats.revisar} a revisar</span>
                  {curStats.err > 0 && <span className="px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-red-500/10 text-red-400">{curStats.err} err</span>}
                </>
              )}
              {/* Acciones masivas sobre las filas "a revisar" */}
              {curRows.some(r => r.estado === 'revisar') && (
                <div className="w-full flex items-center gap-1.5 pt-1.5 border-t border-[var(--border-color)] mt-1">
                  <button onClick={() => setSelTodas(true)} className="px-2 py-1 rounded-lg text-[11px] font-semibold text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)] transition-all">Seleccionar todo</button>
                  <button onClick={() => setSelTodas(false)} className="px-2 py-1 rounded-lg text-[11px] font-semibold text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)] transition-all">Deseleccionar</button>
                  <button
                    onClick={aplicarSeleccionados}
                    disabled={!curRows.some(r => r.estado === 'revisar' && r.sel)}
                    className="ml-auto px-3 py-1 rounded-lg text-[11px] font-bold transition-all active:scale-95 hover:brightness-110 disabled:opacity-40"
                    style={{ background: 'var(--color-accent)', color: 'var(--color-accent-text)' }}
                  >
                    Aplicar seleccionados ({curRows.filter(r => r.estado === 'revisar' && r.sel).length})
                  </button>
                </div>
              )}
            </div>
            <div className="flex-1 min-h-0 overflow-y-auto px-3 py-2 space-y-1.5">
              {curRows.length === 0 && (
                <div className="text-center text-xs text-[var(--text-muted)] pt-10 px-6">
                  Tocá Iniciar y mirá en vivo cómo se cura cada tema: Beatport (dato de catálogo, se aplica solo) o IA (te propone y elegís).
                </div>
              )}
              {curRows.map(row => (
                <div key={row.id} className={`rounded-xl border px-3 py-2 text-xs ${
                  row.estado === 'procesando' ? 'border-[var(--color-accent)]/40 bg-[var(--color-accent)]/5' :
                  row.estado === 'auto' || row.estado === 'ok' ? 'border-green-500/25 bg-green-500/5' :
                  row.estado === 'revisar' ? 'border-amber-500/35 bg-amber-500/5' :
                  row.estado === 'saltado' ? 'border-[var(--border-color)] opacity-50' :
                  'border-red-500/30 bg-red-500/5'
                }`}>
                  <div className="flex items-center gap-1.5">
                    {row.estado === 'procesando' && <div className="w-3 h-3 border-2 border-[var(--color-accent)] border-t-transparent rounded-full animate-spin flex-shrink-0" />}
                    {(row.estado === 'auto' || row.estado === 'ok') && <svg className="w-3.5 h-3.5 text-green-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" /></svg>}
                    {row.estado === 'revisar' && <svg className="w-3.5 h-3.5 text-amber-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>}
                    {row.estado === 'error' && <svg className="w-3.5 h-3.5 text-red-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>}
                    <span className="truncate font-mono text-[10px] text-[var(--text-muted)]" title={row.filename}>{row.filename}</span>
                  </div>
                  {row.prop && (
                    <div className="mt-1.5 space-y-0.5">
                      <div className="text-[var(--text-primary)] font-medium truncate">{row.prop.artist} <span className="text-[var(--text-muted)]">—</span> {row.prop.title}</div>
                      <div className="flex items-center gap-1.5">
                        <span className="px-1.5 py-0.5 rounded bg-[var(--bg-hover)] text-[10px] text-[var(--text-secondary)]">{row.prop.genre}</span>
                        {row.prop.bpm && <span className="text-[10px] text-[var(--text-muted)]">{row.prop.bpm} bpm</span>}
                        {row.prop.key && <span className="text-[10px] text-amber-500 font-mono">{row.prop.key}</span>}
                        <span className={`ml-auto px-1.5 py-0.5 rounded-full text-[9px] font-bold uppercase ${row.prop.source === 'beatport' ? 'bg-green-500/10 text-green-500' : 'bg-amber-500/10 text-amber-500'}`}>{row.prop.source === 'beatport' ? 'Beatport' : 'IA'}</span>
                      </div>
                    </div>
                  )}
                  {row.estado === 'revisar' && (
                    <div className="mt-2 flex items-center gap-1.5">
                      <input
                        type="checkbox"
                        checked={!!row.sel}
                        onChange={() => setCurRows(prev => prev.map(x => x.id === row.id ? { ...x, sel: !x.sel } : x))}
                        className="w-3.5 h-3.5 accent-[var(--color-accent)] cursor-pointer"
                        title="Incluir en Aplicar seleccionados"
                      />
                      <button onClick={() => decidirRevision(row, true)}
                        className="px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all active:scale-95 hover:brightness-110"
                        style={{ background: 'var(--color-accent)', color: 'var(--color-accent-text)' }}>Aplicar</button>
                      <button onClick={() => decidirRevision(row, false)}
                        className="px-2.5 py-1 rounded-lg text-[11px] font-semibold text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)] transition-all">Saltar</button>
                    </div>
                  )}
                  {row.error && <div className="mt-1 text-[10px] text-red-400">{row.error}</div>}
                </div>
              ))}
            </div>
          </div>
        )}
        {view === 'tracks' && (
          <button
            onClick={toggleFilename}
            className={`hidden md:flex items-center justify-center h-8 w-8 rounded-lg transition-all duration-200 active:scale-95 flex-shrink-0 ${
              showFilename ? 'bg-[var(--color-accent)]/20 text-[var(--text-primary)] font-semibold border border-[var(--color-accent)]/40' : 'text-gray-500 hover:text-gray-300 bg-[var(--bg-input)]/40 border border-[var(--border-color)]'
            }`}
            title="Mostrar / Ocultar columna de Filename"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
            </svg>
          </button>
        )}

        {view === 'tracks' && dupeGroups.length > 0 && (
          <button
            onClick={openDupes}
            disabled={deletingDupes}
            className={`hidden md:flex relative items-center justify-center h-8 w-8 rounded-lg transition-all duration-200 active:scale-95 flex-shrink-0 disabled:opacity-50 ${
              showDupes ? 'bg-red-600 text-[var(--text-primary)]' : 'bg-red-900/40 hover:bg-red-800/60 text-red-300 border border-red-500/40'
            }`}
            title={`Revisar y resolver duplicados (${dupeGroups.reduce((s, g) => s + g.dupes.length, 0)})`}
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
            </svg>
            <span className="absolute -top-1.5 -right-1.5 px-1.5 py-0.2 min-w-4 text-[9px] font-bold rounded-full bg-red-600 text-white shadow text-center leading-tight">
              {dupeGroups.reduce((s, g) => s + g.dupes.length, 0)}
            </span>
          </button>
        )}

        {/* Search - full width on mobile (wraps to new row), inline on desktop */}
        <div className="relative w-full order-last md:order-none md:w-auto md:flex-1 md:min-w-24 md:ml-auto">
          <svg className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-500 pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            value={localSearch}
            onChange={e => {
              const val = e.target.value
              setLocalSearch(val)
              clearTimeout(searchTimeoutRef.current)
              searchTimeoutRef.current = setTimeout(() => {
                if (val.length === 0 || val.length >= 3) {
                  setSearch(val)
                }
              }, 300)
            }}
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
                  {agentConnected && (
                    <button onClick={() => { fixMetatags(); setToolsOpen(false) }} disabled={fixingMeta}
                      className="w-full text-left px-4 py-3 rounded-xl text-sm text-[var(--text-primary)] hover:bg-[var(--bg-hover)] transition-colors flex items-center gap-3 active:scale-[0.98] disabled:opacity-50">
                      <div className="w-8 h-8 rounded-full bg-[var(--color-accent)]/15 flex items-center justify-center">
                        {fixingMeta ? <div className="w-4 h-4 border-2 border-[var(--color-accent)] border-t-transparent rounded-full animate-spin" />
                          : <svg className="w-4 h-4 text-[var(--color-accent)]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>}
                      </div>
                      {fixingMeta ? 'Arreglando...' : `Arreglar metatags${files.filter(isDirtyMeta).length ? ` (${files.filter(isDirtyMeta).length})` : ''}`}
                    </button>
                  )}
                  {dupeKeys.size > 0 && (
                    <button onClick={() => { openDupes(); setToolsOpen(false) }}
                      disabled={deletingDupes}
                      className="w-full text-left px-4 py-3 rounded-xl text-sm text-red-400 hover:bg-[var(--bg-hover)] transition-colors flex items-center gap-3 active:scale-[0.98] disabled:opacity-50">
                      <div className="w-8 h-8 rounded-full bg-red-500/15 flex items-center justify-center">
                        {deletingDupes ? (
                          <div className="w-4 h-4 border-2 border-red-400 border-t-transparent rounded-full animate-spin" />
                        ) : (
                          <svg className="w-4 h-4 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>
                        )}
                      </div>
                      {deletingDupes ? 'Borrando...' : `Revisar duplicados (${dupeGroups.reduce((s, g) => s + g.dupes.length, 0)})`}
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
                <div className="text-xs text-gray-500">{dupeGroups.reduce((s,g)=>s+g.identical.length,0)} idénticos · {dupeGroups.reduce((s,g)=>s+g.doubtful.length,0)} dudosos · {dupeRemove.size} marcados</div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={applyDupeResolution}
                disabled={deletingDupes || dupeRemove.size === 0}
                className="px-3 py-1.5 bg-red-600 hover:bg-red-500 disabled:opacity-40 text-sm rounded-lg text-[var(--text-primary)] transition-all duration-200 active:scale-95"
              >
                {deletingDupes ? 'Aplicando...' : `Aplicar (${dupeRemove.size})`}
              </button>
            </div>
          </div>
          <div className="text-xs text-gray-600 px-1">Los <span className="text-red-400">idénticos</span> (mismo formato y tamaño) vienen marcados para sacar. Los <span className="text-amber-400">dudosos</span> (otra versión o calidad distinta) los marcás vos. Siempre se mantiene el de mejor rating/calidad.</div>
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
                  const isIdentical = group.identical.some(d => d.filename === f.filename)
                  const marked = dupeRemove.has(f.filename)
                  const toggleMark = () => setDupeRemove(prev => {
                    const n = new Set(prev)
                    n.has(f.filename) ? n.delete(f.filename) : n.add(f.filename)
                    return n
                  })
                  return (
                    <div
                      key={f.filename}
                      className={`flex items-center gap-3 px-4 py-2 border-b border-[var(--border-color)]/30 last:border-b-0 ${
                        isBest ? 'bg-green-500/5' : marked ? 'bg-red-500/10' : 'bg-[var(--bg-surface)]/30'
                      }`}
                    >
                      <PlayPauseBtn isPlaying={isPlaying} onClick={() => handlePlay(f)} />
                      <TrackThumb src={f.artwork} size="w-7 h-7" />
                      <div className="flex-1 min-w-0">
                        <div className={`text-sm truncate ${isPlaying ? 'font-medium text-[var(--color-accent)]' : isBest ? 'text-[var(--text-primary)]' : 'text-gray-400'}`}>
                          {f.filename}
                        </div>
                        <div className="flex items-center gap-2 mt-0.5 text-xs text-gray-500">
                          <span className={`font-medium ${isBest ? 'text-green-400' : 'text-gray-400'}`}>{f.format}</span>
                          <span>{f.size_mb} MB</span>
                          {f.genre && <span className="text-purple-400">{f.genre}</span>}
                          {!isBest && (isIdentical
                            ? <span className="text-red-400/80">idéntico</span>
                            : <span className="text-amber-400/90">¿otra versión?</span>)}
                        </div>
                      </div>
                      <span className={`w-14 flex-shrink-0 text-center text-xs font-mono ${f.key ? 'text-amber-400' : 'text-gray-700'}`}>{f.key || '-'}</span>
                      <div className="flex-shrink-0">
                        <StarRating rating={f.rating || 0} onRate={(r) => handleRate(f, r)} />
                      </div>
                      {isBest ? (
                        <span className="flex-shrink-0 w-24 px-2 py-0.5 bg-green-500/20 text-green-400 text-xs rounded font-medium text-center">Mantener</span>
                      ) : (
                        <button
                          onClick={toggleMark}
                          className={`flex-shrink-0 w-24 px-2 py-1 text-xs rounded font-medium transition-all duration-200 active:scale-95 text-center flex items-center justify-center gap-1 ${
                            marked ? 'bg-red-500/30 text-red-300' : 'bg-white/5 text-gray-400 hover:bg-white/10'
                          }`}
                        >
                          <span className={`w-3 h-3 rounded-sm border flex items-center justify-center ${marked ? 'bg-red-500 border-red-500' : 'border-gray-500'}`}>
                            {marked && <svg className="w-2.5 h-2.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>}
                          </span>
                          Sacar
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
            <span className="hidden md:block w-8"></span>
            <button onClick={() => toggleSort('artist')} className={`w-28 sm:w-40 flex-shrink-0 text-left hover:text-[var(--text-primary,white)] transition-colors ${sortCol === 'artist' ? 'text-[var(--color-accent)]' : ''}`}>Artista<SortArrow col="artist" /></button>
            <button onClick={() => toggleSort('title')} className={`flex-1 min-w-0 text-left hover:text-[var(--text-primary,white)] transition-colors ${sortCol === 'title' ? 'text-[var(--color-accent)]' : ''}`}>Título<SortArrow col="title" /></button>
            {showFilename && <span className="hidden sm:block flex-1 min-w-0 text-left text-gray-600 normal-case">Filename</span>}
            <button onClick={() => toggleSort('genre')} className={`hidden md:block w-32 flex-shrink-0 text-left hover:text-[var(--text-primary,white)] transition-colors ${sortCol === 'genre' ? 'text-[var(--color-accent)]' : ''}`}>Género<SortArrow col="genre" /></button>
            <button onClick={() => toggleSort('key')} className={`hidden sm:block w-14 flex-shrink-0 text-center hover:text-[var(--text-primary,white)] transition-colors ${sortCol === 'key' ? 'text-[var(--color-accent)]' : ''}`}>Key<SortArrow col="key" /></button>
            {/* Columnas nuevas: el renglón 2 de la fila ("MB • hora • FLAC") era
                confuso (la hora de DESCARGA parecía duración) — ahora son
                columnas propias, ordenables, y el título respira. */}
            <button onClick={() => toggleSort('format')} className={`hidden md:block w-14 flex-shrink-0 text-center hover:text-[var(--text-primary,white)] transition-colors ${sortCol === 'format' ? 'text-[var(--color-accent)]' : ''}`}>Fmt<SortArrow col="format" /></button>
            <button onClick={() => toggleSort('duration')} className={`hidden md:block w-14 flex-shrink-0 text-center hover:text-[var(--text-primary,white)] transition-colors ${sortCol === 'duration' ? 'text-[var(--color-accent)]' : ''}`}>Dur<SortArrow col="duration" /></button>
            <button onClick={() => toggleSort('size')} className={`hidden md:block w-14 flex-shrink-0 text-right hover:text-[var(--text-primary,white)] transition-colors ${sortCol === 'size' ? 'text-[var(--color-accent)]' : ''}`}>MB<SortArrow col="size" /></button>
            <button onClick={() => toggleSort('rating')} className={`hidden md:block w-20 md:w-24 flex-shrink-0 text-center hover:text-[var(--text-primary,white)] transition-colors ${sortCol === 'rating' ? 'text-[var(--color-accent)]' : ''}`}>Rating<SortArrow col="rating" /></button>
            <button onClick={() => toggleSort('date')} className={`hidden lg:block w-20 flex-shrink-0 text-center hover:text-[var(--text-primary,white)] transition-colors ${sortCol === 'date' ? 'text-[var(--color-accent)]' : ''}`}>Fecha<SortArrow col="date" /></button>
          </div>

          {/* Table rows */}
          <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden">
            {finalList.map((f, i) => {
              const isPlaying = playingFile === f.filename
              const pm = prettyMeta(f)
              return (
                <div
                  key={`${f.filename}-${i}`}
                  onClick={() => { if (longPressRef.current.fired) { longPressRef.current.fired = false; return } handlePlay(f) }}
                  onContextMenu={(e) => handleContextMenu(e, f)}
                  onTouchStart={(e) => { longPressRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY, fired: false } }}
                  onTouchMove={(e) => { const t = longPressRef.current; if (!t || t.fired) return; const dx = e.touches[0].clientX - t.x; const dy = Math.abs(e.touches[0].clientY - t.y); if (Math.abs(dx) > 55 && dy < 30) { t.fired = true; navigator.vibrate?.(10); setCtxMenu({ file: f }) } }}
                  className={`flex items-center gap-2 px-3 md:px-4 py-1.5 border-b border-[var(--border-color)]/50 transition-colors hover:bg-[var(--bg-hover)] cursor-pointer select-none ${
                    isPlaying ? 'bg-white/5' : ''
                  }`}
                >
                  <span className="w-6 md:w-8 text-center text-xs text-gray-600">{i + 1}</span>
                  {/* En mobile el play es tocar la fila; el boton solo en desktop */}
                  <span className="hidden md:inline-flex flex-shrink-0" onClick={(e) => e.stopPropagation()}>
                    <PlayPauseBtn isPlaying={isPlaying} onClick={() => handlePlay(f)} />
                  </span>
                  <TrackThumb src={f.artwork} />
                  <div className="w-28 sm:w-40 flex-shrink-0 min-w-0">
                    <div className="text-xs md:text-sm truncate text-[var(--text-secondary)]" title={pm.artist}>{pm.artist || '—'}</div>
                  </div>
                  <div className="flex-1 min-w-0 flex flex-col justify-center">
                    <div className="flex items-center gap-1">
                      <div className={`text-xs md:text-sm truncate ${isPlaying ? 'font-medium text-[var(--color-accent)]' : 'text-[var(--text-primary)]'}`} title={pm.title}>
                        {pm.title}
                      </div>
                      <a href={`https://www.youtube.com/results?search_query=${encodeURIComponent((pm.artist || '') + ' ' + (pm.title || f.filename))}`} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()} className="hidden sm:flex flex-shrink-0 text-gray-700 hover:text-red-500 transition-colors" title="YouTube">
                        <svg className="w-3 h-3" viewBox="0 0 24 24" fill="currentColor"><path d="M23.5 6.2a3 3 0 00-2.1-2.1C19.5 3.5 12 3.5 12 3.5s-7.5 0-9.4.6A3 3 0 00.5 6.2 31.5 31.5 0 000 12a31.5 31.5 0 00.5 5.8 3 3 0 002.1 2.1c1.9.6 9.4.6 9.4.6s7.5 0 9.4-.6a3 3 0 002.1-2.1A31.5 31.5 0 0024 12a31.5 31.5 0 00-.5-5.8zM9.6 15.5V8.5l6.4 3.5-6.4 3.5z"/></svg>
                      </a>
                    </div>
                    {/* En desktop la data del renglón 2 vive en columnas; en mobile
                        queda esta línea compacta porque no hay ancho para columnas. */}
                    <div className="md:hidden text-[10px] text-gray-400 font-mono truncate">{formatSmallMeta(f)}</div>
                  </div>
                  {showFilename && <span className="hidden sm:block flex-1 min-w-0 text-xs text-gray-600 truncate" title={f.filename}>{f.filename}</span>}
                  <span title={f.genre_estimated ? 'Estimado por carpeta — falta clasificar con AI' : ''} className={`hidden md:block w-32 flex-shrink-0 text-xs truncate ${f.genre_estimated ? 'text-gray-600 italic' : 'text-gray-500'}`}>{f.genre || '-'}</span>
                  <span className={`hidden sm:block w-14 flex-shrink-0 text-center text-xs font-mono ${f.key ? 'text-amber-400' : 'text-gray-700'}`}>{f.key || '-'}</span>
                  <span className="hidden md:block w-14 flex-shrink-0 text-center text-xs text-gray-500">{(f.format || f.filename?.split('.').pop() || '').toUpperCase()}</span>
                  <span className="hidden md:block w-14 flex-shrink-0 text-center text-xs text-gray-500 font-mono">{f.duration ? `${Math.floor(f.duration / 60)}:${String(Math.floor(f.duration % 60)).padStart(2, '0')}` : '—'}</span>
                  <span className="hidden md:block w-14 flex-shrink-0 text-right text-xs text-gray-500 font-mono">{f.size_mb ? Math.round(f.size_mb) : '—'}</span>
                  <div className="hidden md:flex w-20 md:w-24 flex-shrink-0 justify-center" onClick={(e) => e.stopPropagation()}>
                    <StarRating rating={f.rating || 0} onRate={(r) => handleRate(f, r)} />
                  </div>
                  <span className="hidden lg:block w-20 flex-shrink-0 text-center text-xs text-gray-600">{f.date ? new Date(f.date).toLocaleDateString('es-AR', { day: '2-digit', month: 'short' }) : '-'}</span>
                </div>
              )
            })}
          </div>

          {/* Export bar */}
          {exportMode && (
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
          )}
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
                      onClick={() => { if (longPressRef.current.fired) { longPressRef.current.fired = false; return } handlePlay(f) }}
                      onContextMenu={(e) => handleContextMenu(e, f)}
                      onTouchStart={(e) => { longPressRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY, fired: false } }}
                      onTouchMove={(e) => { const t = longPressRef.current; if (!t || t.fired) return; const dx = e.touches[0].clientX - t.x; const dy = Math.abs(e.touches[0].clientY - t.y); if (Math.abs(dx) > 55 && dy < 30) { t.fired = true; navigator.vibrate?.(10); setCtxMenu({ file: f }) } }}
                      className={`flex items-center gap-2 px-3 md:px-4 py-1.5 border-b border-[var(--border-color)]/50 transition-colors hover:bg-[var(--bg-hover)] cursor-pointer select-none ${
                      isPlaying ? 'bg-white/5' : ''
                    }`}>
                      <span className="w-6 md:w-8 text-center text-xs text-gray-600 flex-shrink-0">{idx}</span>
                      <span className="hidden md:inline-flex flex-shrink-0" onClick={(e) => e.stopPropagation()}>
                        <PlayPauseBtn isPlaying={isPlaying} onClick={() => handlePlay(f)} />
                      </span>
                      <TrackThumb src={f.artwork} size="w-7 h-7" />
                      <div className="flex-1 min-w-0 flex flex-col justify-center">
                        <div className="flex items-center gap-1">
                          <div className={`text-xs md:text-sm truncate ${isPlaying ? 'font-medium text-[var(--color-accent)]' : 'text-[var(--text-primary)]'}`}>
                            {f.title || f.filename}
                          </div>
                          <a href={`https://www.youtube.com/results?search_query=${encodeURIComponent((f.artist || '') + ' ' + (f.title || f.filename))}`} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()} className="hidden sm:flex flex-shrink-0 text-gray-700 hover:text-red-500 transition-colors" title="YouTube">
                            <svg className="w-3 h-3" viewBox="0 0 24 24" fill="currentColor"><path d="M23.5 6.2a3 3 0 00-2.1-2.1C19.5 3.5 12 3.5 12 3.5s-7.5 0-9.4.6A3 3 0 00.5 6.2 31.5 31.5 0 000 12a31.5 31.5 0 00.5 5.8 3 3 0 002.1 2.1c1.9.6 9.4.6 9.4.6s7.5 0 9.4-.6a3 3 0 002.1-2.1A31.5 31.5 0 0024 12a31.5 31.5 0 00-.5-5.8zM9.6 15.5V8.5l6.4 3.5-6.4 3.5z"/></svg>
                          </a>
                        </div>
                        <div className="text-[10px] text-gray-400 font-mono truncate">{formatSmallMeta(f)}</div>
                      </div>
                      <span className="w-24 sm:w-36 flex-shrink-0 text-xs md:text-sm text-gray-400 truncate">{f.artist}</span>
                      <span title={f.genre_estimated ? 'Estimado por carpeta — falta clasificar con AI' : ''} className={`hidden md:block w-32 flex-shrink-0 text-xs truncate ${f.genre_estimated ? 'text-gray-600 italic' : 'text-gray-500'}`}>{f.genre || '-'}</span>
                      <span className={`hidden sm:block w-14 flex-shrink-0 text-center text-xs font-mono ${f.key ? 'text-amber-400' : 'text-gray-700'}`}>{f.key || '-'}</span>
                      <div className="hidden md:flex w-24 flex-shrink-0 justify-center" onClick={(e) => e.stopPropagation()}>
                        <StarRating rating={f.rating || 0} onRate={(r) => handleRate(f, r)} />
                      </div>
                      <span className="hidden lg:block w-20 flex-shrink-0 text-center text-xs text-gray-600">{f.date ? new Date(f.date).toLocaleDateString('es-AR', { day: '2-digit', month: 'short' }) : '-'}</span>
                      <span className="hidden lg:block w-12 flex-shrink-0 text-center text-xs text-gray-600">{f.format}</span>
                      <span className="hidden lg:block w-14 flex-shrink-0 text-right text-xs text-gray-600">{f.size_mb}</span>
                    </div>
                  </div>
                )
              })
            })()}
          </div>

          {/* Export bar */}
          {exportMode && (
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
          )}
        </div>
      )}

      {/* Context menu for genre change */}
      {ctxMenu && (<>
        {/* Backdrop: cierra al tocar fuera (oscurece en mobile) */}
        <div className="fixed inset-0 z-40 bg-black/50 md:bg-transparent animate-fade-in" onClick={() => setCtxMenu(null)} />
        {/* Desktop: dropdown posicionado */}
        <div
          ref={ctxRef}
          className="hidden md:flex fixed z-50 bg-[var(--bg-panel)] border border-gray-700 rounded-lg shadow-2xl min-w-56 flex-col"
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

          {/* Género: toggle de ECOSISTEMA + combo con los géneros de ese ambiente.
              Tocar otro ecosistema recategoriza YA (mantiene el género) — rescata
              temas que cayeron por error en otro universo. */}
          <div className="flex-shrink-0 px-3 py-2 border-b border-[var(--border-color)]">
            <div className="text-[10px] text-gray-600 uppercase tracking-wider mb-1">Género</div>
            <div className="flex items-center gap-0.5 mb-1.5 bg-[var(--bg-input)] border border-[var(--border-color)] rounded-lg p-0.5">
              {['edm', 'pop', 'latin'].map(eco => (
                <button
                  key={eco}
                  onClick={() => {
                    setCtxEco(eco)
                    if (ctxMenu.file && (ctxMenu.file.collection || 'edm') !== eco) {
                      moveFile(ctxMenu.file, ctxMenu.file.genre || '', eco)
                      toast(`Movido al ecosistema ${eco.toUpperCase()}`, 'success', 2000)
                    }
                  }}
                  title={`Recategorizar al ecosistema ${eco.toUpperCase()}`}
                  className={`flex-1 px-2 py-1 rounded-md text-[10px] font-bold uppercase tracking-wide transition-all ${ctxEco === eco ? 'text-[var(--color-accent-text)]' : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'}`}
                  style={ctxEco === eco ? { background: 'var(--color-accent)' } : undefined}
                >
                  {eco}
                </button>
              ))}
            </div>
            <select
              value={ctxMenu.file?.genre || ''}
              onChange={(e) => changeGenre(e.target.value, ctxEco)}
              className="w-full px-2 py-1.5 bg-[var(--bg-input)] border border-gray-700 rounded text-sm text-[var(--text-primary)] focus:outline-none focus:border-[var(--color-accent)]"
            >
              <option value="">Unsorted</option>
              {ecoGenreOptions(ctxEco, ctxMenu.file?.genre).map(g => <option key={g} value={g}>{g}</option>)}
            </select>
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
            {!ctxMenu.file?.artwork && (
              <button
                onClick={() => { const fn = ctxMenu.file?.filename; setCtxMenu(null); if (fn) fetchArtworkFor([fn]) }}
                disabled={fetchingArt}
                className="w-full text-left px-3 py-1.5 text-sm text-gray-300 hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary,white)] transition-colors flex items-center gap-2 disabled:opacity-50"
                title="Busca la carátula en iTunes/Deezer y la guarda para este tema"
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
                Buscar carátula
              </button>
            )}
            <button
              onClick={() => { openFolder(ctxMenu.file?.subfolder || '', ctxMenu.file?.filename || ctxMenu.file?.name || ''); setCtxMenu(null) }}
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

        {/* Mobile: bottom sheet (formato Discovery) — solo rating, duración, calidad, radio */}
        <div className="md:hidden fixed inset-x-0 bottom-0 z-50 bg-[var(--bg-panel)] rounded-t-2xl shadow-2xl border-t border-[var(--border-color)] animate-sheet-up">
          <div className="flex justify-center py-2"><div className="w-10 h-1 rounded-full bg-gray-600" /></div>
          {/* Header del track */}
          <div className="px-5 pb-3 border-b border-[var(--border-color)]">
            <div className="text-sm font-medium text-[var(--text-primary)] truncate">{prettyMeta(ctxMenu.file).title || ctxMenu.file?.filename}</div>
            <div className="text-xs text-gray-500 truncate">{prettyMeta(ctxMenu.file).artist || ''}</div>
            <div className="flex items-center gap-2 mt-1">
              {ctxMenu.file?.bpm && <span className="text-[10px] text-gray-500 font-mono">{ctxMenu.file.bpm} BPM</span>}
              {ctxMenu.file?.key && <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-400">{ctxMenu.file.key}</span>}
            </div>
          </div>
          {/* Rating */}
          <div className="px-5 py-3 flex items-center justify-between border-b border-[var(--border-color)]">
            <span className="text-sm text-[var(--text-secondary)]">Rating</span>
            <StarRating rating={ctxMenu.file?.rating || 0} onRate={(r) => handleRate(ctxMenu.file, r)} />
          </div>
          {/* Género (toggle de ecosistema + combo del ambiente) */}
          <div className="px-5 py-3 border-b border-[var(--border-color)]">
            <div className="flex items-center justify-between gap-3 mb-2">
              <span className="text-sm text-[var(--text-secondary)] flex-shrink-0">Género</span>
              <div className="flex items-center gap-0.5 bg-[var(--bg-input)] border border-[var(--border-color)] rounded-lg p-0.5">
                {['edm', 'pop', 'latin'].map(eco => (
                  <button
                    key={eco}
                    onClick={() => {
                      setCtxEco(eco)
                      if (ctxMenu.file && (ctxMenu.file.collection || 'edm') !== eco) {
                        moveFile(ctxMenu.file, ctxMenu.file.genre || '', eco)
                        toast(`Movido al ecosistema ${eco.toUpperCase()}`, 'success', 2000)
                      }
                    }}
                    className={`px-2.5 py-1 rounded-md text-[10px] font-bold uppercase tracking-wide transition-all ${ctxEco === eco ? 'text-[var(--color-accent-text)]' : 'text-[var(--text-muted)]'}`}
                    style={ctxEco === eco ? { background: 'var(--color-accent)' } : undefined}
                  >
                    {eco}
                  </button>
                ))}
              </div>
            </div>
            <select value={ctxMenu.file?.genre || ''} onChange={(e) => changeGenre(e.target.value, ctxEco)} className="w-full px-2 py-1.5 bg-[var(--bg-input)] border border-gray-700 rounded text-sm text-[var(--text-primary)] focus:outline-none focus:border-[var(--color-accent)]">
              <option value="">Unsorted</option>
              {ecoGenreOptions(ctxEco, ctxMenu.file?.genre).map(g => <option key={g} value={g}>{g}</option>)}
            </select>
          </div>
          {/* Duración + Calidad (info) */}
          <div className="px-5 py-3 flex items-stretch gap-8 border-b border-[var(--border-color)]">
            <div>
              <div className="text-[10px] uppercase tracking-wider text-gray-500">Duración</div>
              <div className="text-[var(--text-primary)] font-mono text-sm">{ctxMenu.file?.duration ? `${Math.floor(ctxMenu.file.duration / 60)}:${String(Math.floor(ctxMenu.file.duration % 60)).padStart(2, '0')}` : '—'}</div>
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-wider text-gray-500">Calidad</div>
              <div className="text-[var(--text-primary)] text-sm">{(ctxMenu.file?.format || (ctxMenu.file?.filename || '').split('.').pop() || '?').toUpperCase()}{ctxMenu.file?.size_mb ? ` · ${Math.round(ctxMenu.file.size_mb)} MB` : ''}</div>
            </div>
          </div>
          {/* Radio */}
          {onRadio && (
            <button onClick={() => { onRadio(ctxMenu.file); setCtxMenu(null) }} className="w-full text-left px-5 py-3.5 text-sm text-[var(--text-primary)] hover:bg-[var(--bg-hover)] transition-colors flex items-center gap-3 active:scale-[0.98]">
              <div className="w-8 h-8 rounded-full bg-purple-500/15 flex items-center justify-center flex-shrink-0">
                <svg className="w-4 h-4 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" /></svg>
              </div>
              Radio
            </button>
          )}
          <div style={{ height: 'env(safe-area-inset-bottom)' }} />
        </div>
      </>)}

    </div>
  )
})
