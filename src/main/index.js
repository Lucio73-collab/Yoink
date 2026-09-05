import { app, BrowserWindow, ipcMain, dialog, shell, Notification, clipboard } from 'electron'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import fs from 'node:fs/promises'
import { existsSync } from 'node:fs'

import * as settingsStore from './settings.js'
import * as binaries from './binaries.js'
import * as queue from './queue.js'
import * as spotify from './spotify.js'
import { probe } from './ytdlp.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

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
    backgroundColor: '#11111b',
    titleBarStyle: 'hidden',
    titleBarOverlay: { color: '#11111b', symbolColor: '#a6adc8', height: 40 },
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

/* ---------- clipboard watcher ---------- */

const URL_RE = /^https?:\/\/\S+$/i

function setClipboardWatch(enabled) {
  clearInterval(clipboardTimer)
  clipboardTimer = null
  if (!enabled) return
  lastClipboard = clipboard.readText()
  clipboardTimer = setInterval(() => {
    const text = clipboard.readText().trim()
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
    onChange: async (job) => {
      send('queue:update', job)
      if (job.status !== 'done' || !Notification.isSupported()) return
      // Read fresh rather than closing over the startup snapshot, otherwise
      // toggling the setting has no effect until the app restarts.
      const current = await settingsStore.load()
      if (current.notifyOnComplete) {
        new Notification({ title: 'Download finished', body: job.title }).show()
      }
    },
    settings: () => settingsStore.load()
  })

  createWindow()
  setClipboardWatch(settings.clipboardWatch)

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  queue.cancelAll()
  app.quit()
})

app.on('before-quit', () => queue.cancelAll())

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
handle('spotify:disconnect', () => spotify.signOut())
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
  binDir: binaries.BIN_DIR
}))
