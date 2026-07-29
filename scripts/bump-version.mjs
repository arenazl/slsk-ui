import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const rootDir = path.resolve(__dirname, '..')

const pkgPath = path.join(rootDir, 'package.json')
const pubVerPath = path.join(rootDir, 'public', 'agent', 'version.json')
const landVerPath = path.resolve(rootDir, '..', 'landing', 'agent', 'version.json')

try {
  if (fs.existsSync(pkgPath)) {
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'))
    const parts = (pkg.version || '2.12.0').split('.')
    parts[parts.length - 1] = parseInt(parts[parts.length - 1] || '0', 10) + 1
    const newVer = parts.join('.')
    pkg.version = newVer
    fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n')
    console.log(`[Auto-Bump] Version incremented automatically to v${newVer}`)

    const verObj = {
      version: newVer,
      windows_url: `https://github.com/arenazl/slsk-agent/releases/download/v${newVer}/GrooveSyncAgent.exe`,
      macos_url: `https://github.com/arenazl/slsk-agent/releases/download/v${newVer}/GrooveSyncAgent-macOS.dmg`,
      notes: `v${newVer}: auto-bump build`
    }

    if (fs.existsSync(pubVerPath)) {
      fs.writeFileSync(pubVerPath, JSON.stringify(verObj, null, 2) + '\n')
    }
    if (fs.existsSync(landVerPath)) {
      fs.writeFileSync(landVerPath, JSON.stringify(verObj, null, 2) + '\n')
    }
  }
} catch (err) {
  console.error('[Auto-Bump] Failed to bump version:', err)
}
