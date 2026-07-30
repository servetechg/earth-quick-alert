/**
 * Windows + OneDrive often corrupts Next.js `.next` (EINVAL readlink on symlinks).
 * Before `next dev` / `next build`, wipe a broken in-project `.next`.
 *
 * We intentionally keep `.next` inside the project. Moving it outside OneDrive via
 * a junction breaks Node module resolution for server chunks (react/jsx-runtime).
 */
import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const nextDir = path.join(root, '.next')

function rmNext() {
  if (!fs.existsSync(nextDir)) return
  try {
    try {
      fs.rmdirSync(nextDir) // junction: remove link only
    } catch {
      fs.rmSync(nextDir, { recursive: true, force: true })
    }
    console.log('[ensure-next] Removed corrupted/stale .next')
  } catch (err) {
    console.warn('[ensure-next] Could not remove .next:', err?.message || err)
  }
}

function looksCorruptNext() {
  if (!fs.existsSync(nextDir)) return false
  const probe = path.join(nextDir, 'server')
  if (!fs.existsSync(probe)) return false
  try {
    fs.readdirSync(probe)
    return false
  } catch (err) {
    const code = err && err.code
    return code === 'EINVAL' || code === 'EUNKNOWN' || code === 'UNKNOWN'
  }
}

// If a leftover off-OneDrive junction exists, remove the link so Next uses a
 // real in-project `.next` (avoids react/jsx-runtime MODULE_NOT_FOUND).
try {
  if (fs.existsSync(nextDir) && fs.lstatSync(nextDir).isSymbolicLink()) {
    console.log('[ensure-next] Removing off-OneDrive .next junction')
    rmNext()
  }
} catch {
  // ignore
}

if (looksCorruptNext()) {
  rmNext()
}
