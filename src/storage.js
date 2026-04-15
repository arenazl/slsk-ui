// Unified storage abstraction: writes/reads to user's local disk via either
// the File System Access API (browser-native, no install) or the agent process.
//
// The rest of the app calls `storage.X()` without knowing which backend runs.
// Pick happens on app boot: if browser supports FSA → use that. Else → agent.

const FSA_SUPPORTED = typeof window !== 'undefined' && 'showDirectoryPicker' in window
const DB_NAME = 'groovesync'
const HANDLE_STORE = 'handles'
const HANDLE_KEY = 'music_root'

// ─── IndexedDB helpers (persist FileSystemDirectoryHandle across sessions) ───
function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1)
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(HANDLE_STORE)) {
        req.result.createObjectStore(HANDLE_STORE)
      }
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

async function idbGet(key) {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(HANDLE_STORE, 'readonly')
    const req = tx.objectStore(HANDLE_STORE).get(key)
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

async function idbSet(key, value) {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(HANDLE_STORE, 'readwrite')
    tx.objectStore(HANDLE_STORE).put(value, key)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}

async function idbDelete(key) {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(HANDLE_STORE, 'readwrite')
    tx.objectStore(HANDLE_STORE).delete(key)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}

// ─── File System Access API backend ──────────────────────────────────────────
const AUDIO_EXT_RE = /\.(flac|mp3|wav|m4a|aif|aiff|ogg)$/i

async function ensurePermission(handle) {
  if (!handle) return false
  try {
    const opts = { mode: 'readwrite' }
    let p = await handle.queryPermission(opts)
    if (p === 'granted') return true
    if (p === 'prompt') {
      p = await handle.requestPermission(opts)
      return p === 'granted'
    }
    return false
  } catch {
    return false
  }
}

async function loadHandle() {
  if (!FSA_SUPPORTED) return null
  try {
    return await idbGet(HANDLE_KEY)
  } catch {
    return null
  }
}

export const fsaBackend = {
  type: 'fsa',
  supported: FSA_SUPPORTED,

  // Opens native folder picker. Returns true on success, false if user cancelled.
  async pickFolder() {
    if (!FSA_SUPPORTED) return false
    try {
      const handle = await window.showDirectoryPicker({ mode: 'readwrite', startIn: 'music' })
      await idbSet(HANDLE_KEY, handle)
      return true
    } catch (e) {
      // User cancelled or denied
      return false
    }
  },

  // Returns true if a previously-picked folder is still usable (permission granted).
  async ready() {
    const handle = await loadHandle()
    if (!handle) return false
    return await ensurePermission(handle)
  },

  // Returns the human-readable name of the picked folder (or null).
  async folderName() {
    const handle = await loadHandle()
    return handle?.name || null
  },

  async forget() {
    await idbDelete(HANDLE_KEY)
  },

  // Recursively scan the picked folder. Returns [{filename, subfolder, size_mb, modified}].
  async listLibrary() {
    const root = await loadHandle()
    if (!root) return []
    const ok = await ensurePermission(root)
    if (!ok) return []

    const out = []
    async function scan(dir, sub) {
      for await (const [name, h] of dir.entries()) {
        if (h.kind === 'directory') {
          await scan(h, sub ? `${sub}/${name}` : name)
        } else if (h.kind === 'file' && AUDIO_EXT_RE.test(name)) {
          try {
            const f = await h.getFile()
            out.push({
              filename: name,
              subfolder: sub,
              size_mb: +(f.size / (1024 * 1024)).toFixed(1),
              modified: f.lastModified,
            })
          } catch { /* skip unreadable */ }
        }
      }
    }
    await scan(root, '')
    return out
  },

  // Save a Blob to the picked folder, optionally inside a subfolder (genre).
  // Subfolder is created automatically if it doesn't exist.
  async saveFile(filename, blob, subfolder = '') {
    const root = await loadHandle()
    if (!root) throw new Error('No hay carpeta seleccionada — tocá "Elegir carpeta"')
    const ok = await ensurePermission(root)
    if (!ok) throw new Error('Permiso a la carpeta denegado')

    let dir = root
    if (subfolder) {
      // Sanitize: no leading slash, no path separators inside
      const safe = subfolder.replace(/[\\\/]/g, '_').replace(/^_+|_+$/g, '')
      if (safe) dir = await root.getDirectoryHandle(safe, { create: true })
    }
    const fh = await dir.getFileHandle(filename, { create: true })
    const w = await fh.createWritable()
    await w.write(blob)
    await w.close()
  },

  // Delete a file from the picked folder. Subfolder optional.
  async deleteFile(filename, subfolder = '') {
    const root = await loadHandle()
    if (!root) throw new Error('No hay carpeta seleccionada')
    const ok = await ensurePermission(root)
    if (!ok) throw new Error('Permiso denegado')
    let dir = root
    if (subfolder) dir = await root.getDirectoryHandle(subfolder)
    await dir.removeEntry(filename)
  },
}

// ─── Agent backend (delegates to the existing agent HTTP endpoints) ──────────
// Wraps the existing agentFetch for compatibility. Used as fallback when FSA
// is unavailable (Safari/Firefox).
export function makeAgentBackend(agentFetch, isAgentConnected) {
  return {
    type: 'agent',
    supported: true,
    async pickFolder() {
      // Agent has its own folder picked via system tray; return true if connected.
      return isAgentConnected()
    },
    async ready() {
      return isAgentConnected()
    },
    async folderName() {
      try {
        const res = await agentFetch('status')
        const d = await res.json()
        return d.folder || null
      } catch {
        return null
      }
    },
    async forget() { /* no-op for agent */ },
    async listLibrary() {
      try {
        const res = await agentFetch('library')
        const arr = await res.json()
        return Array.isArray(arr) ? arr : []
      } catch {
        return []
      }
    },
    async saveFile(filename, blob, subfolder = '') {
      const form = new FormData()
      form.append('file', blob, filename)
      form.append('filename', filename)
      form.append('genre', subfolder || '')
      const res = await agentFetch('save-file', { method: 'POST', body: form })
      if (!res.ok) throw new Error(`Agent save-file ${res.status}`)
      return await res.json()
    },
    async deleteFile(filename) {
      await agentFetch('delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filenames: [filename] }),
      })
    },
  }
}

// ─── Storage facade ──────────────────────────────────────────────────────────
// Picks FSA if browser supports + folder selected. Falls back to agent otherwise.
// Components that need to switch dynamically should use useStorage() (added in App).
export function makeStorage(agentFetch, isAgentConnected) {
  const agent = makeAgentBackend(agentFetch, isAgentConnected)
  return {
    fsa: fsaBackend,
    agent,
    fsaSupported: FSA_SUPPORTED,
    // Picks the right backend at call time (FSA if ready, else agent).
    async active() {
      if (await fsaBackend.ready()) return fsaBackend
      return agent
    },
  }
}
