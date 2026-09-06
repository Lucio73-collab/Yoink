import { app } from 'electron'
import electronUpdater from 'electron-updater'

const { autoUpdater } = electronUpdater

/**
 * Auto-update, but only where it can actually work.
 *
 * electron-updater installs by swapping files next to the executable, which is
 * fine for an NSIS install and impossible for a portable exe (it runs from a
 * temp extraction that is thrown away on exit). Attempting it there throws a
 * confusing error at the user, so portable builds simply report their version
 * and let the person grab a new exe when they want one.
 */

const isPortable = Boolean(process.env.PORTABLE_EXECUTABLE_DIR)
const supported = app.isPackaged && !isPortable

let emit = () => {}

export function mode() {
  if (!app.isPackaged) return 'dev'
  return isPortable ? 'portable' : 'auto'
}

export function init(onStatus) {
  emit = onStatus
  if (!supported) return

  autoUpdater.autoDownload = true
  autoUpdater.autoInstallOnAppQuit = true

  autoUpdater.on('update-available', (info) =>
    emit({ state: 'available', version: info.version })
  )
  autoUpdater.on('update-not-available', () => emit({ state: 'current' }))
  autoUpdater.on('download-progress', (p) =>
    emit({ state: 'downloading', percent: Math.round(p.percent) })
  )
  autoUpdater.on('update-downloaded', (info) =>
    emit({ state: 'ready', version: info.version })
  )
  autoUpdater.on('error', (err) =>
    emit({ state: 'error', message: String(err?.message || err) })
  )

  // Let the window settle before adding network work to startup.
  setTimeout(() => {
    autoUpdater.checkForUpdates().catch(() => {})
  }, 12_000)
}

export async function check() {
  if (!supported) {
    return { state: mode() === 'portable' ? 'portable' : 'dev', version: app.getVersion() }
  }
  const res = await autoUpdater.checkForUpdates()
  return { state: 'checking', version: res?.updateInfo?.version || null }
}

export function install() {
  if (!supported) return false
  autoUpdater.quitAndInstall()
  return true
}
