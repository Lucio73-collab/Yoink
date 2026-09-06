import { app } from 'electron'
import { createWriteStream, existsSync } from 'node:fs'
import fs from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import { pipeline } from 'node:stream/promises'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)

/**
 * Unzips using tooling that ships with Windows, so there is no third party
 * archive dependency. bsdtar (tar.exe) has been in Windows 10 since build
 * 17063 and is considerably faster than Expand-Archive, which is the fallback.
 */
async function unzip(zipPath, destDir) {
  await fs.mkdir(destDir, { recursive: true })
  try {
    await execFileAsync('tar', ['-xf', zipPath, '-C', destDir], {
      windowsHide: true,
      maxBuffer: 16 * 1024 * 1024
    })
    return
  } catch {
    // Older Windows builds, or tar missing from PATH.
  }
  await execFileAsync(
    'powershell',
    [
      '-NoProfile',
      '-NonInteractive',
      '-Command',
      `Expand-Archive -LiteralPath '${zipPath.replace(/'/g, "''")}' -DestinationPath '${destDir.replace(/'/g, "''")}' -Force`
    ],
    { windowsHide: true, maxBuffer: 16 * 1024 * 1024 }
  )
}

/**
 * Third-party binaries are fetched on first run rather than bundled, so
 * yt-dlp can be refreshed independently of app releases.
 */

export const BIN_DIR = path.join(app.getPath('userData'), 'bin')
const STATE_FILE = path.join(app.getPath('userData'), 'binaries.json')

const IS_ARM = process.arch === 'arm64'

const SOURCES = {
  ytdlp: {
    label: 'yt-dlp',
    exe: 'yt-dlp.exe',
    kind: 'raw',
    // Official Windows release binary, tracks the latest stable tag.
    url: IS_ARM
      ? 'https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp_arm64.exe'
      : 'https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp.exe',
    versionApi: 'https://api.github.com/repos/yt-dlp/yt-dlp/releases/latest'
  },
  ffmpeg: {
    label: 'FFmpeg',
    exe: 'ffmpeg.exe',
    kind: 'zip',
    // yt-dlp's OWN patched build, not BtbN's vanilla one. Upstream FFmpeg
    // mishandles merging some YouTube format pairs (notably HLS-sourced
    // avc1 with opus), which surfaces as "Postprocessing: Conversion
    // failed!". yt-dlp ships patched builds specifically to fix that.
    url: 'https://github.com/yt-dlp/FFmpeg-Builds/releases/download/latest/ffmpeg-master-latest-win64-gpl.zip',
    versionApi:
      'https://api.github.com/repos/yt-dlp/FFmpeg-Builds/releases/tags/latest',
    pick: ['ffmpeg.exe', 'ffprobe.exe']
  },
  deno: {
    label: 'Deno',
    exe: 'deno.exe',
    kind: 'zip',
    // Required by yt-dlp >= 2025.11.12 to solve YouTube's JS challenges.
    url: IS_ARM
      ? 'https://github.com/denoland/deno/releases/latest/download/deno-aarch64-pc-windows-msvc.zip'
      : 'https://github.com/denoland/deno/releases/latest/download/deno-x86_64-pc-windows-msvc.zip',
    versionApi: 'https://api.github.com/repos/denoland/deno/releases/latest',
    pick: ['deno.exe']
  }
}

export const BINARY_KEYS = Object.keys(SOURCES)

export function binPath(key) {
  return path.join(BIN_DIR, SOURCES[key].exe)
}

export function ffmpegDir() {
  return BIN_DIR
}

async function readState() {
  try {
    return JSON.parse(await fs.readFile(STATE_FILE, 'utf8'))
  } catch {
    return {}
  }
}

async function writeState(next) {
  await fs.mkdir(path.dirname(STATE_FILE), { recursive: true })
  await fs.writeFile(STATE_FILE, JSON.stringify(next, null, 2), 'utf8')
}

async function fetchLatestTag(key) {
  const api = SOURCES[key].versionApi
  if (!api) return null
  try {
    const res = await fetch(api, {
      headers: {
        Accept: 'application/vnd.github+json',
        'User-Agent': 'Yoink'
      }
    })
    if (!res.ok) return null
    const json = await res.json()
    // BtbN's "latest" tag is a moving target, so fall back to publish time.
    return json.tag_name === 'latest'
      ? json.published_at || json.tag_name
      : json.tag_name
  } catch {
    return null
  }
}

async function downloadTo(url, dest, onProgress) {
  const res = await fetch(url, {
    redirect: 'follow',
    headers: { 'User-Agent': 'Yoink' }
  })
  if (!res.ok || !res.body) {
    throw new Error(`Download failed (${res.status}) for ${url}`)
  }
  const total = Number(res.headers.get('content-length') || 0)
  let seen = 0
  const reader = res.body.getReader()
  const out = createWriteStream(dest)

  await pipeline(
    (async function* () {
      for (;;) {
        const { done, value } = await reader.read()
        if (done) break
        seen += value.byteLength
        if (onProgress && total) onProgress(seen / total)
        yield value
      }
    })(),
    out
  )
}

async function installOne(key, onProgress) {
  const src = SOURCES[key]
  await fs.mkdir(BIN_DIR, { recursive: true })

  if (src.kind === 'raw') {
    const tmp = path.join(BIN_DIR, `${src.exe}.part`)
    await downloadTo(src.url, tmp, onProgress)
    await fs.rename(tmp, path.join(BIN_DIR, src.exe))
    return
  }

  const tmpZip = path.join(os.tmpdir(), `yoink-${key}-${Date.now()}.zip`)
  const tmpDir = path.join(os.tmpdir(), `yoink-${key}-${Date.now()}`)
  try {
    await downloadTo(src.url, tmpZip, onProgress)
    await unzip(tmpZip, tmpDir)

    // Archives nest their payload differently, so walk and pick by filename.
    const wanted = new Set(src.pick.map((n) => n.toLowerCase()))
    const found = new Map()

    async function walk(dir) {
      for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name)
        if (entry.isDirectory()) await walk(full)
        else if (wanted.has(entry.name.toLowerCase())) found.set(entry.name.toLowerCase(), full)
      }
    }
    await walk(tmpDir)

    for (const name of src.pick) {
      const from = found.get(name.toLowerCase())
      if (!from) throw new Error(`${name} was not present in the ${src.label} archive`)
      await fs.copyFile(from, path.join(BIN_DIR, name))
    }
  } finally {
    await fs.rm(tmpZip, { force: true }).catch(() => {})
    await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {})
  }
}

export function isInstalled(key) {
  return existsSync(binPath(key))
}

export async function status() {
  const state = await readState()
  return BINARY_KEYS.map((key) => ({
    key,
    label: SOURCES[key].label,
    installed: isInstalled(key),
    version: state[key]?.version || null,
    installedAt: state[key]?.installedAt || null
  }))
}

/**
 * Installs anything missing. Pass force to reinstall everything, which is what
 * the "Update tools" button in Settings does.
 */
export async function ensure({ force = false, onEvent } = {}) {
  const state = await readState()
  const report = []

  for (const key of BINARY_KEYS) {
    const src = SOURCES[key]
    const have = isInstalled(key)

    if (have && !force) {
      report.push({ key, action: 'kept' })
      continue
    }

    onEvent?.({ key, label: src.label, phase: 'downloading', progress: 0 })
    try {
      await installOne(key, (p) =>
        onEvent?.({ key, label: src.label, phase: 'downloading', progress: p })
      )
      state[key] = {
        version: (await fetchLatestTag(key)) || 'unknown',
        installedAt: new Date().toISOString()
      }
      onEvent?.({ key, label: src.label, phase: 'done', progress: 1 })
      report.push({ key, action: force ? 'updated' : 'installed' })
    } catch (err) {
      onEvent?.({ key, label: src.label, phase: 'error', message: String(err.message || err) })
      report.push({ key, action: 'failed', error: String(err.message || err) })
    }
  }

  await writeState(state)
  return report
}

/**
 * yt-dlp ships extractor fixes almost daily, and a stale copy is the single
 * most common cause of a download that used to work and suddenly does not.
 * This refreshes it quietly in the background, at most once a day, and only
 * when the published release tag differs from what is installed.
 *
 * Only yt-dlp is refreshed. FFmpeg and Deno change rarely and are large, so
 * re-downloading them on a schedule would cost a lot for almost no benefit.
 */
const DAY_MS = 24 * 60 * 60 * 1000

export async function refreshIfStale() {
  const state = await readState()
  const last = state._lastCheck ? Date.parse(state._lastCheck) : 0
  if (Date.now() - last < DAY_MS) return { checked: false }

  state._lastCheck = new Date().toISOString()
  await writeState(state)

  if (!isInstalled('ytdlp')) return { checked: true, updated: false }

  const latest = await fetchLatestTag('ytdlp')
  const have = state.ytdlp?.version
  if (!latest || !have || latest === have) return { checked: true, updated: false }

  try {
    await installOne('ytdlp')
    const next = await readState()
    next.ytdlp = { version: latest, installedAt: new Date().toISOString() }
    next._lastCheck = state._lastCheck
    await writeState(next)
    resetCapabilityCache()
    return { checked: true, updated: true, version: latest }
  } catch {
    return { checked: true, updated: false }
  }
}

/**
 * yt-dlp gained --js-runtimes fairly recently. Probing once at startup means a
 * slightly older binary degrades instead of hard failing on an unknown flag.
 */
let capabilityCache = null
export async function capabilities() {
  if (capabilityCache) return capabilityCache
  const fallback = { jsRuntimes: false, version: null }
  if (!isInstalled('ytdlp')) return fallback
  try {
    const { stdout } = await execFileAsync(binPath('ytdlp'), ['--help'], {
      maxBuffer: 8 * 1024 * 1024,
      windowsHide: true
    })
    let version = null
    try {
      const v = await execFileAsync(binPath('ytdlp'), ['--version'], { windowsHide: true })
      version = v.stdout.trim()
    } catch {
      /* non fatal */
    }
    capabilityCache = { jsRuntimes: stdout.includes('--js-runtimes'), version }
    return capabilityCache
  } catch {
    return fallback
  }
}

export function resetCapabilityCache() {
  capabilityCache = null
}
