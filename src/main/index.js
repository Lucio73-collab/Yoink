import { app, BrowserWindow, ipcMain, dialog, shell, Notification, clipboard } from 'electron'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import fs from 'node:fs/promises'
import { existsSync } from 'node:fs'

import * as settingsStore from './settings.js'
import * as binaries from './binaries.js'
import * as queue from './queue.js'
import * as spotify from './spotify.js'
import * as updater from './updater.js'
import * as media from './media.js'
import { probe } from './ytdlp.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

/* Background work should never bring down the app with a native error dialog. */
process.on('uncaughtException', (err) => {
  console.error('[yoink] uncaught exception:', err)
})
process.on('unhandledRejection', (reason) => {
  console.error('[yoink] unhandled rejection:', reason)
})

// electron-vite emits the preload as .mjs when the package is an ES module,
// because Electron requires that extension for ESM preload scripts. Resolve it
// rather than hardcoding, so a build tool change cannot silently break startup.
function preloadPath() {
  const mjs = path.join(__dirname, '../preload/index.mjs')
  return existsSync(mjs) ? mjs : path.join(__dirname, '../preload/index.js')
}

let win = null
let clipboardTimer = null
let lastClipboard = ''

function createWindow() {
  win = new BrowserWindow({
    width: 1180,
    height: 780,
    minWidth: 900,
    minHeight: 600,
    show: false,
    backgroundColor: '#202020',
    titleBarStyle: 'hidden',
    titleBarOverlay: { color: '#202020', symbolColor: '#ffffff', height: 48 },
    webPreferences: {
      preload: preloadPath(),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  win.once('ready-to-show', () => win.show())

  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })

  if (process.env.ELECTRON_RENDERER_URL) {
    win.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    win.loadFile(path.join(__dirname, '../renderer/index.html'))
  }
}

const send = (channel, payload) => {
  if (win && !win.isDestroyed()) win.webContents.send(channel, payload)
}

/* ---------- notification batching ---------- */

/**
 * Collapses a burst of completions into one notification.
 * QUIET fires once activity stops, MAX_HOLD prevents a steady stream from
 * resetting the debounce forever, MAX_BATCH caps a single summary.
 */
const QUIET_MS = 3500
const MAX_HOLD_MS = 20000
const MAX_BATCH = 25

const notifyBatcher = {
  pending: [],
  quietTimer: null,
  holdTimer: null,

  push(job) {
    this.pending.push(job)
    clearTimeout(this.quietTimer)
    this.quietTimer = setTimeout(() => this.flush(), QUIET_MS)
    if (!this.holdTimer) {
      this.holdTimer = setTimeout(() => this.flush(), MAX_HOLD_MS)
    }
    if (this.pending.length >= MAX_BATCH) this.flush()
  },

  async flush() {
    try {
      await this.deliver()
    } catch (err) {
      console.error('[yoink] notification failed:', err)
    }
  },

  async deliver() {
    clearTimeout(this.quietTimer)
    clearTimeout(this.holdTimer)
    this.quietTimer = null
    this.holdTimer = null

    const batch = this.pending
    this.pending = []
    if (!batch.length || !Notification.isSupported()) return

    // Read fresh so toggling the setting takes effect without a restart.
    const current = await settingsStore.load()
    if (!current.notifyOnComplete) return

    if (batch.length === 1) {
      new Notification({ title: 'Download finished', body: batch[0].title }).show()
      return
    }

    // If the whole batch came from one collection, name it instead of counting.
    const groups = new Set(batch.map((j) => j.groupTitle).filter(Boolean))
    const title = `${batch.length} downloads finished`
    const body =
      groups.size === 1 && batch.every((j) => j.groupTitle)
        ? [...groups][0]
        : batch
            .slice(0, 3)
            .map((j) => j.title)
            .join('\n') + (batch.length > 3 ? `\nand ${batch.length - 3} more` : '')

    new Notification({ title, body }).show()
  }
}

/* ---------- clipboard watcher ---------- */

// Accept spotify: URIs too, not just http(s), so copied Spotify links register.
const URL_RE = /^(?:https?:\/\/|spotify:)\S+$/i

/**
 * readText is documented as returning a string but can return undefined on
 * Windows when the clipboard holds non-text data or another process has it
 * locked. Coerced and guarded so a polling timer cannot crash the process.
 */
function readClipboardText() {
  try {
    const value = clipboard.readText()
    return typeof value === 'string' ? value.trim() : ''
  } catch {
    return ''
  }
}

function setClipboardWatch(enabled) {
  clearInterval(clipboardTimer)
  clipboardTimer = null
  if (!enabled) return
  lastClipboard = readClipboardText()
  clipboardTimer = setInterval(() => {
    const text = readClipboardText()
    if (text && text !== lastClipboard && URL_RE.test(text)) {
      lastClipboard = text
      send('clipboard:url', text)
    }
  }, 1200)
}

/* ---------- app lifecycle ---------- */

app.whenReady().then(async () => {
  const settings = await settingsStore.load()

  queue.configure({
    onChange: (job) => {
      send('queue:update', job)
      if (job.status === 'done') notifyBatcher.push(job)
    },
    settings: () => settingsStore.load()
  })

  queue.enablePersistence(path.join(app.getPath('userData'), 'queue.json'))

  createWindow()
  setClipboardWatch(settings.clipboardWatch)

  if (settings.restoreQueue) {
    // Wait for the renderer so restored jobs actually appear in the list.
    win?.webContents.once('did-finish-load', async () => {
      const n = await queue.restore()
      if (n) send('queue:toast', { message: `Restored ${n} unfinished download${n === 1 ? '' : 's'}`, tone: 'info' })
    })
  }
  updater.init((status) => send('update:status', status))

  // Quiet background refresh of yt-dlp. Delayed so it never competes with
  // window startup, and it silently no-ops if the daily check already ran.
  if (settings.autoUpdateTools) {
    setTimeout(async () => {
      try {
        const res = await binaries.refreshIfStale()
        if (res.updated) {
          send('bin:refreshed', { version: res.version })
          send('queue:toast', { message: `yt-dlp updated to ${res.version}`, tone: 'ok' })
        }
      } catch (err) {
        console.error('[yoink] tool refresh failed:', err)
      }
    }, 20_000)
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  queue.cancelAll()
  app.quit()
})

app.on('before-quit', () => {
  queue.cancelAll()
  spotify.cancelPendingAuth('App closing')
})

/* ---------- IPC ---------- */

const handle = (channel, fn) =>
  ipcMain.handle(channel, async (_e, ...args) => {
    try {
      return { ok: true, data: await fn(...args) }
    } catch (err) {
      return { ok: false, error: String(err?.message || err) }
    }
  })

// Settings
handle('settings:get', () => settingsStore.load())
handle('settings:set', async (patch) => {
  const next = await settingsStore.save(patch)
  if ('clipboardWatch' in patch) setClipboardWatch(next.clipboardWatch)
  return next
})
handle('settings:reset', () => settingsStore.reset())

// Binaries
handle('bin:status', () => binaries.status())
handle('bin:ensure', (opts) =>
  binaries.ensure({
    ...opts,
    onEvent: (e) => send('bin:progress', e)
  }).then(async (r) => {
    binaries.resetCapabilityCache()
    await binaries.capabilities()
    return r
  })
)
handle('bin:capabilities', () => binaries.capabilities())

// Metadata
handle('probe', async (url) => {
  const settings = await settingsStore.load()
  const info = await probe(url, settings)
  const entries = info._type === 'playlist' ? info.entries || [] : null
  return {
    isPlaylist: Boolean(entries),
    title: info.title || info.fulltitle || url,
    uploader: info.uploader || info.channel || info.uploader_id || null,
    duration: info.duration || null,
    thumbnail: info.thumbnail || info.thumbnails?.at(-1)?.url || null,
    extractor: info.extractor_key || info.extractor || null,
    webpage_url: info.webpage_url || url,
    count: entries?.length || 1,
    entries:
      entries?.slice(0, 500).map((e) => ({
        id: e.id,
        title: e.title || e.url,
        url: e.url || e.webpage_url,
        duration: e.duration || null,
        thumbnail: e.thumbnails?.at(-1)?.url || null
      })) || null
  }
})

// Queue
handle('queue:list', () => queue.list())
handle('queue:add', (entries) => (Array.isArray(entries) ? entries : [entries]).map(queue.add))
handle('queue:cancel', (id) => queue.cancel(id))
handle('queue:retry', (id) => queue.retry(id))
handle('queue:remove', (id) => queue.remove(id))
handle('queue:clearFinished', () => queue.clearFinished())
handle('queue:stats', () => queue.stats())

// Spotify
handle('spotify:status', () => ({ connected: spotify.isAuthed() }))
handle('spotify:connect', async () => {
  const settings = await settingsStore.load()
  return spotify.authorize(settings.spotifyClientId)
})
handle('spotify:disconnect', () => {
  spotify.cancelPendingAuth('Disconnected')
  return spotify.signOut()
})
handle('spotify:cancelAuth', () => spotify.cancelPendingAuth('Cancelled by user'))
handle('spotify:parse', (url) => spotify.parseUrl(url))
handle('spotify:resolve', (url) => spotify.resolve(url))
handle('spotify:match', async (tracks) => {
  const settings = await settingsStore.load()
  const out = []
  for (const [i, track] of tracks.entries()) {
    send('spotify:matchProgress', { index: i, total: tracks.length, title: track.title })
    try {
      const match = await spotify.findAudio(track, settings)
      out.push({ track, match, error: match ? null : 'No confident match found' })
    } catch (err) {
      out.push({ track, match: null, error: String(err.message || err) })
    }
  }
  return out
})

// Local media
handle('media:probe', (files) =>
  Promise.all((Array.isArray(files) ? files : [files]).map((f) => media.probeFile(f)))
)
handle('media:presets', () => ({
  sizes: media.SIZE_PRESETS,
  formats: media.CONVERT_FORMATS
}))
handle('media:plan', async (file, targetBytes) => {
  const info = await media.probeFile(file)
  return media.planCompress(info, targetBytes)
})

// Shell helpers
handle('pick:folder', async (current) => {
  const res = await dialog.showOpenDialog(win, {
    properties: ['openDirectory', 'createDirectory'],
    defaultPath: current || undefined
  })
  return res.canceled ? null : res.filePaths[0]
})
handle('pick:file', async (filters) => {
  const res = await dialog.showOpenDialog(win, { properties: ['openFile'], filters })
  return res.canceled ? null : res.filePaths[0]
})
handle('pick:media', async () => {
  const res = await dialog.showOpenDialog(win, {
    properties: ['openFile', 'multiSelections'],
    filters: [
      { name: 'Media', extensions: ['mp4','mkv','webm','mov','avi','flv','m4v','ts','mp3','m4a','opus','flac','wav','ogg','aac'] }
    ]
  })
  return res.canceled ? [] : res.filePaths
})
handle('open:path', async (target) => {
  try {
    await fs.access(target)
    shell.showItemInFolder(target)
  } catch {
    shell.openPath(path.dirname(target))
  }
})
handle('open:folder', (dir) => shell.openPath(dir))
handle('open:external', (url) => shell.openExternal(url))
handle('app:info', () => ({
  version: app.getVersion(),
  electron: process.versions.electron,
  userData: app.getPath('userData'),
  binDir: binaries.BIN_DIR,
  updateMode: updater.mode()
}))

// Updates
handle('update:check', () => updater.check())
handle('update:install', () => updater.install())
