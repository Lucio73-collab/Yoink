#!/usr/bin/env node
/**
 * Yoink Web — self-hosted front end for yt-dlp.
 *
 * Single file, no dependencies, no build step. Intended for hardware you own,
 * behind Tailscale or an authenticated reverse proxy.
 */

import http from 'node:http'
import { spawn, execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { randomUUID, timingSafeEqual } from 'node:crypto'
import fs from 'node:fs/promises'
import { createReadStream } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const execFileAsync = promisify(execFile)
const __dirname = path.dirname(fileURLToPath(import.meta.url))

const PORT = Number(process.env.PORT || 8080)
const HOST = process.env.HOST || '0.0.0.0'
const DOWNLOAD_DIR = process.env.DOWNLOAD_DIR || '/downloads'
const COOKIES_FILE = process.env.COOKIES_FILE || ''
const TOKEN = process.env.YOINK_TOKEN || ''
const CONCURRENCY = Number(process.env.CONCURRENCY || 2)
const RETENTION_HOURS = Number(process.env.RETENTION_HOURS || 12)
// Multi-threaded ffmpeg.wasm needs SharedArrayBuffer, which needs cross-origin
// isolation. That is opt-in because COEP: require-corp also blocks any
// third-party resource that does not send CORP, which can break a page in
// ways that are hard to diagnose. Single-threaded works everywhere.
const CROSS_ORIGIN_ISOLATED = process.env.CROSS_ORIGIN_ISOLATED === '1'
const YTDLP = process.env.YTDLP_PATH || 'yt-dlp'
const DENO = process.env.DENO_PATH || 'deno'

/* ---------------- queue ---------------- */

const jobs = new Map()
const running = new Map()
const clients = new Set()

function broadcast(job) {
  const payload = `data: ${JSON.stringify(publicJob(job))}\n\n`
  for (const res of clients) res.write(payload)
}

function publicJob(j) {
  const { proc, ...rest } = j
  return rest
}

function patch(id, changes) {
  const job = jobs.get(id)
  if (!job) return
  Object.assign(job, changes)
  broadcast(job)
}

/**
 * Pipe-delimited rather than JSON: a progress template full of braces and
 * quotes is fragile across shells and argument escaping.
 */
const PROGRESS_TEMPLATE =
  'download:@Y@%(progress.status)s|%(progress.downloaded_bytes)s|' +
  '%(progress.total_bytes)s|%(progress.total_bytes_estimate)s|' +
  '%(progress.speed)s|%(progress.eta)s@'

const num = (v) => {
  const n = Number(v)
  return Number.isFinite(n) && v !== 'NA' && v !== '' ? n : null
}

function buildArgs(job) {
  const args = [
    '--newline', '--no-colors', '--ignore-config',
    '--progress', '--progress-template', PROGRESS_TEMPLATE,
    '--no-playlist',
    '--retries', '10', '--fragment-retries', '10',
    '--concurrent-fragments', '4',
    '--no-overwrites', '--continue',
    // Keeps names predictable and safe on any filesystem.
    '-o', `${job.id}/%(title).120B.%(ext)s`,
    '-P', DOWNLOAD_DIR
  ]

  // yt-dlp needs a JS runtime for full YouTube support.
  args.push('--js-runtimes', `deno:${DENO}`)

  if (COOKIES_FILE) args.push('--cookies', COOKIES_FILE)

  if (job.mode === 'audio') {
    args.push('-f', 'bestaudio/best', '--extract-audio',
              '--audio-format', job.format === 'original' ? 'best' : job.format,
              '--audio-quality', '0', '--embed-metadata', '--embed-thumbnail')
  } else {
    const cap = Number(job.quality) || 0
    const f = cap ? `[height<=?${cap}]` : ''
    args.push('-f', `bv*${f}+ba/b${f}/bv*+ba/b`)
    args.push('-S', cap ? `res:${cap},fps,vcodec:h264` : 'res,fps,vcodec:h264')
    // MP4 travels better through browsers than MKV.
    args.push('--merge-output-format', 'mp4', '--embed-metadata')
  }

  args.push('--', job.url)
  return args
}

async function start(job) {
  patch(job.id, { status: 'running', progress: 0 })

  const child = spawn(YTDLP, buildArgs(job), { env: { ...process.env, NO_COLOR: '1' } })
  running.set(job.id, child)

  let buf = ''
  let stderr = ''

  child.stdout.on('data', (c) => {
    buf += c.toString()
    const lines = buf.split(/[\r\n]+/)
    buf = lines.pop() ?? ''
    for (const line of lines) {
      const text = line.trim()
      if (!text.startsWith('@Y@')) continue
      const p = text.slice(3, -1).split('|')
      const downloaded = num(p[1])
      const total = num(p[2]) ?? num(p[3])
      patch(job.id, {
        status: p[0] === 'finished' ? 'processing' : 'running',
        progress: total && downloaded ? Math.min(1, downloaded / total) : job.progress,
        speed: num(p[4]),
        eta: num(p[5]),
        total
      })
    }
  })

  child.stderr.on('data', (c) => { stderr += c.toString() })

  const code = await new Promise((r) => {
    child.on('error', () => r(-1))
    child.on('close', r)
  })
  running.delete(job.id)

  if (jobs.get(job.id)?.status === 'canceled') return pump()

  if (code === 0) {
    try {
      const dir = path.join(DOWNLOAD_DIR, job.id)
      const [file] = await fs.readdir(dir)
      const stat = await fs.stat(path.join(dir, file))
      patch(job.id, {
        status: 'done', progress: 1, speed: null, eta: null,
        file, size: stat.size, finishedAt: Date.now()
      })
    } catch {
      patch(job.id, { status: 'error', error: 'Finished but no file was produced' })
    }
  } else {
    // Surface the meaningful line rather than the whole stderr dump.
    const line = stderr.split('\n').reverse().find((l) => /^ERROR|error/i.test(l)) || ''
    patch(job.id, {
      status: 'error',
      error: line.replace(/^ERROR:\s*/i, '').replace(/\s*See\s+https?:\/\/\S+/g, '').slice(0, 200)
        || `yt-dlp exited with code ${code}`,
      finishedAt: Date.now()
    })
  }
  pump()
}

function pump() {
  const active = [...jobs.values()].filter((j) => j.status === 'running' || j.status === 'processing')
  if (active.length >= CONCURRENCY) return
  const next = [...jobs.values()].find((j) => j.status === 'queued')
  if (!next) return
  next.status = 'running'
  start(next)
}

function addJob({ url, mode, quality, format, title }) {
  const job = {
    id: randomUUID(),
    url, mode: mode || 'video',
    quality: quality || 0,
    format: format || 'mp3',
    title: title || url,
    status: 'queued', progress: 0,
    speed: null, eta: null, total: null,
    file: null, size: null, error: null,
    addedAt: Date.now(), finishedAt: null
  }
  jobs.set(job.id, job)
  broadcast(job)
  pump()
  return job
}

/* ---------------- housekeeping ---------------- */

/** Finished downloads are deleted after the retention window. */
async function sweep() {
  const cutoff = Date.now() - RETENTION_HOURS * 3600_000
  for (const [id, job] of jobs) {
    if (job.finishedAt && job.finishedAt < cutoff) {
      await fs.rm(path.join(DOWNLOAD_DIR, id), { recursive: true, force: true }).catch(() => {})
      jobs.delete(id)
      broadcast({ id, removed: true })
    }
  }
}
setInterval(sweep, 15 * 60_000).unref()

/* ---------------- http ---------------- */

/** Headers that unlock SharedArrayBuffer, and therefore threaded ffmpeg.wasm. */
const isolationHeaders = () =>
  CROSS_ORIGIN_ISOLATED
    ? {
        'Cross-Origin-Opener-Policy': 'same-origin',
        'Cross-Origin-Embedder-Policy': 'require-corp'
      }
    : {}

const json = (res, code, body) => {
  res.writeHead(code, { 'Content-Type': 'application/json' })
  res.end(JSON.stringify(body))
}

/** Constant-time compare so the token cannot be guessed by timing. */
function tokenOk(supplied) {
  if (!TOKEN) return true
  if (!supplied) return false
  const a = Buffer.from(String(supplied))
  const b = Buffer.from(TOKEN)
  return a.length === b.length && timingSafeEqual(a, b)
}

function authed(req) {
  if (!TOKEN) return true
  const header = req.headers.authorization?.replace(/^Bearer\s+/i, '')
  const cookie = /(?:^|;\s*)yoink_token=([^;]+)/.exec(req.headers.cookie || '')?.[1]
  return tokenOk(header) || tokenOk(cookie && decodeURIComponent(cookie))
}

async function readBody(req, limit = 64 * 1024) {
  let data = ''
  for await (const chunk of req) {
    data += chunk
    if (data.length > limit) throw new Error('Body too large')
  }
  return data ? JSON.parse(data) : {}
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`)
  const route = url.pathname

  try {
    if (route === '/healthz') return json(res, 200, { ok: true })

    if (route === '/api/login' && req.method === 'POST') {
      const { token } = await readBody(req)
      if (!tokenOk(token)) return json(res, 401, { error: 'Wrong token' })
      res.writeHead(200, {
        'Content-Type': 'application/json',
        'Set-Cookie': `yoink_token=${encodeURIComponent(token || '')}; HttpOnly; SameSite=Strict; Path=/; Max-Age=2592000`
      })
      return res.end(JSON.stringify({ ok: true }))
    }

    if (route === '/api/config') {
      return json(res, 200, {
        needsToken: Boolean(TOKEN),
        authed: authed(req),
        threaded: CROSS_ORIGIN_ISOLATED
      })
    }

    // Everything below requires auth.
    if (!authed(req)) {
      if (route.startsWith('/api/')) return json(res, 401, { error: 'Unauthorized' })
    }

    if (route === '/' || route === '/index.html') {
      const html = await fs.readFile(path.join(__dirname, 'public', 'index.html'))
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', ...isolationHeaders() })
      return res.end(html)
    }

    // ffmpeg.wasm is served from here rather than a CDN. Under COEP a
    // cross-origin script is blocked unless it sends CORP, and unpkg does
    // not, so self-hosting is the only arrangement that works either way.
    if (route.startsWith('/vendor/')) {
      const base = path.resolve(__dirname, 'public', 'vendor')
      const full = path.resolve(base, route.slice('/vendor/'.length))
      if (!full.startsWith(base + path.sep)) return json(res, 400, { error: 'Bad path' })
      try {
        const body = await fs.readFile(full)
        const types = {
          '.js': 'text/javascript', '.wasm': 'application/wasm',
          '.mjs': 'text/javascript', '.map': 'application/json'
        }
        res.writeHead(200, {
          'Content-Type': types[path.extname(full)] || 'application/octet-stream',
          'Cross-Origin-Resource-Policy': 'same-origin',
          'Cache-Control': 'public, max-age=604800',
          ...isolationHeaders()
        })
        return res.end(body)
      } catch {
        return json(res, 404, { error: 'Asset not built. See web/README.md' })
      }
    }

    if (route === '/api/jobs') {
      return json(res, 200, [...jobs.values()].map(publicJob))
    }

    if (route === '/api/events') {
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
        'X-Accel-Buffering': 'no'
      })
      res.write(': connected\n\n')
      clients.add(res)
      // Proxies drop idle streams; a periodic comment keeps them open.
      const ka = setInterval(() => res.write(': ping\n\n'), 25_000)
      req.on('close', () => { clearInterval(ka); clients.delete(res) })
      return
    }

    if (route === '/api/add' && req.method === 'POST') {
      const body = await readBody(req)
      const links = String(body.url || '')
        .split(/\s+/)
        .filter((u) => /^https?:\/\//i.test(u))
        .slice(0, 20)
      if (!links.length) return json(res, 400, { error: 'No valid links' })

      const added = []
      for (const link of links) {
        let title = link
        try {
          const { stdout } = await execFileAsync(
            YTDLP,
            ['--ignore-config', '--no-warnings', '--skip-download', '--print', '%(title)s',
             '--js-runtimes', `deno:${DENO}`,
             ...(COOKIES_FILE ? ['--cookies', COOKIES_FILE] : []), '--', link],
            { timeout: 25_000, maxBuffer: 1 << 20 }
          )
          title = stdout.trim().split('\n')[0] || link
        } catch {
          // Probing is best effort; the download often works anyway.
        }
        added.push(addJob({ ...body, url: link, title }))
      }
      return json(res, 200, added.map(publicJob))
    }

    if (route.startsWith('/api/cancel/') && req.method === 'POST') {
      const id = route.split('/').pop()
      const job = jobs.get(id)
      if (!job) return json(res, 404, { error: 'No such job' })
      patch(id, { status: 'canceled', speed: null, eta: null })
      running.get(id)?.kill('SIGKILL')
      running.delete(id)
      pump()
      return json(res, 200, { ok: true })
    }

    if (route.startsWith('/api/remove/') && req.method === 'POST') {
      const id = route.split('/').pop()
      running.get(id)?.kill('SIGKILL')
      running.delete(id)
      await fs.rm(path.join(DOWNLOAD_DIR, id), { recursive: true, force: true }).catch(() => {})
      jobs.delete(id)
      broadcast({ id, removed: true })
      return json(res, 200, { ok: true })
    }

    if (route.startsWith('/api/file/')) {
      const id = route.split('/').pop()
      const job = jobs.get(id)
      if (!job || job.status !== 'done' || !job.file) return json(res, 404, { error: 'Not ready' })

      // Resolve and confirm containment: the id comes from the URL, so this
      // is the boundary where a traversal attempt would otherwise land.
      const base = path.resolve(DOWNLOAD_DIR)
      const full = path.resolve(base, id, job.file)
      if (!full.startsWith(base + path.sep)) return json(res, 400, { error: 'Bad path' })

      const stat = await fs.stat(full)
      res.writeHead(200, {
        'Content-Type': 'application/octet-stream',
        'Content-Length': stat.size,
        'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(job.file)}`
      })
      return createReadStream(full).pipe(res)
    }

    json(res, 404, { error: 'Not found' })
  } catch (err) {
    json(res, 500, { error: String(err.message || err) })
  }
})

await fs.mkdir(DOWNLOAD_DIR, { recursive: true }).catch(() => {})

server.listen(PORT, HOST, () => {
  console.log(`[yoink-web] listening on ${HOST}:${PORT}`)
  console.log(`[yoink-web] downloads -> ${DOWNLOAD_DIR}`)
  console.log(`[yoink-web] auth ${TOKEN ? 'enabled' : 'DISABLED (set YOINK_TOKEN)'}`)
  if (COOKIES_FILE) console.log(`[yoink-web] cookies -> ${COOKIES_FILE}`)
  console.log(`[yoink-web] browser ffmpeg: ${CROSS_ORIGIN_ISOLATED ? 'multi-threaded' : 'single-threaded'}`)
})
