/**
 * npm 12 blocks dependency install scripts by default (a good change: install
 * scripts are arbitrary code from strangers). But Electron ships its ~100 MB
 * runtime via its own postinstall, so when that is blocked you get a package
 * folder with no binary in it, and electron-vite fails with "Electron
 * uninstall".
 *
 * This runs as the project's own postinstall and fetches the runtime if it is
 * missing. It is idempotent: if the binary is already there it exits straight
 * away, so it costs nothing on repeat installs or in CI.
 */
import { existsSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import path from 'node:path'

const electronDir = path.join(process.cwd(), 'node_modules', 'electron')
const marker = path.join(electronDir, 'path.txt')
const installer = path.join(electronDir, 'install.js')

if (!existsSync(electronDir)) {
  // Nothing to do: dependencies are not installed yet.
  process.exit(0)
}

if (existsSync(marker)) {
  process.exit(0)
}

if (!existsSync(installer)) {
  console.warn('[yoink] electron/install.js missing, skipping runtime fetch')
  process.exit(0)
}

console.log('[yoink] Electron runtime missing, fetching it now...')
try {
  execFileSync(process.execPath, [installer], { stdio: 'inherit' })
  console.log('[yoink] Electron runtime ready')
} catch (err) {
  // Never fail the install over this. Print the manual escape hatch instead.
  console.warn(
    '\n[yoink] Could not fetch the Electron runtime automatically.\n' +
      '        Run this once, then try again:\n' +
      '          node node_modules/electron/install.js\n'
  )
}
