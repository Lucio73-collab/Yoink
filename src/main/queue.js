import { randomUUID } from 'node:crypto'
import fsp from 'node:fs/promises'
import { spawn } from 'node:child_process'
import { buildArgs, run } from './ytdlp.js'
import * as media from './media.js'
import { nextStrategy, explain, throttleArgs } from './recovery.js'

/**
 * A small in-memory queue. Jobs are plain objects that get broadcast to the
 * renderer on every change, which keeps the UI a pure function of this state.
 */

const jobs = new Map()
const running = new Map() // id -> child process
let emit = () => {}
let getSettings = async () => ({})

export function configure({ onChange, settings }) {
  emit = onChange
  getSettings = settings
}

function snapshot(job) {
  const { proc, ...rest } = job
  return rest
}

function push(job) {
  jobs.set(job.id, job)
  emit(snapshot(job))
  schedulePersist()
}

function patch(id, changes) {
  const job = jobs.get(id)
  if (!job) return
  Object.assign(job, changes)
  emit(snapshot(job))
  schedulePersist()
}

export function list() {
  return [...jobs.values()].map(snapshot)
}

export function add(entry) {
  const job = {
    id: randomUUID(),
    url: entry.url,
    title: entry.title || entry.url,
    uploader: entry.uploader || null,
    duration: entry.duration || null,
    thumbnail: entry.thumbnail || null,
    extractor: entry.extractor || null,
    mode: entry.mode || null,
    maxHeight: entry.maxHeight ?? null,
    container: entry.container || null,
    audioFormat: entry.audioFormat || null,
    preferCodec: entry.preferCodec || null,
    section: entry.section || null,
    playlistItems: entry.playlistItems || null,
    noPlaylist: entry.noPlaylist ?? false,
    isPlaylist: entry.isPlaylist ?? false,
    outputDir: entry.outputDir || null,
    outputTemplate: entry.outputTemplate || null,
    // Spotify jobs carry tags that get written after the audio lands.
    tags: entry.tags || null,
    sourceLabel: entry.sourceLabel || null,
    // Set when a job came from expanding a playlist or Spotify collection,
    // so the UI can fold them into one collapsible row.
    groupId: entry.groupId || null,
    groupTitle: entry.groupTitle || null,
    groupIndex: entry.groupIndex ?? null,
    groupSize: entry.groupSize ?? null,
    // Local media jobs (compress / convert) share this queue so they get the
    // same progress, cancel and retry behaviour as downloads.
    kind: entry.kind || 'download',
    file: entry.file || null,
    targetBytes: entry.targetBytes ?? null,
    targetLabel: entry.targetLabel || null,
    format: entry.format || null,
    crf: entry.crf ?? null,
    preset: entry.preset || null,
    gifFps: entry.gifFps ?? null,
    gifWidth: entry.gifWidth ?? null,
    audioBitrate: entry.audioBitrate ?? null,
    resultSize: null,
    plan: null,
    // Auto-recovery bookkeeping
    extraArgs: entry.extraArgs || null,
    tried: [],
    recovery: null,

    status: 'queued', // queued | running | processing | done | error | canceled
    progress: 0,
    speed: null,
    eta: null,
    total: null,
    downloaded: null,
    file: null,
    error: null,
    log: [],
    addedAt: Date.now(),
    finishedAt: null
  }
  push(job)
  pump()
  return snapshot(job)
}

async function start(job) {
  const settings = await getSettings()
  patch(job.id, { status: 'running', progress: 0, error: null })

  if (job.kind === 'compress' || job.kind === 'convert') {
    await startLocal(job, settings)
    return
  }

  let built
  try {
    // Spacing requests out preemptively is cheaper than being rate limited
    // halfway through a big batch and having to recover from it.
    const queuedNow = [...jobs.values()].filter((j) => j.status === 'queued').length
    const throttle = settings.autoThrottle === false ? [] : throttleArgs(queuedNow)
    built = await buildArgs({ ...job, extraArgs: [...(job.extraArgs || []), ...throttle] }, settings)
  } catch (err) {
    patch(job.id, { status: 'error', error: String(err.message || err) })
    pump()
    return
  }

  /**
   * yt-dlp runs with --verbose so postprocessor failures carry the real ffmpeg
   * output. That is hundreds of lines per download, and emitting each one as
   * its own IPC message would re-render the renderer hundreds of times per
   * job. Lines are buffered and flushed on an interval instead.
   */
  let logBuffer = []
  let logTimer = null

  const flushLog = () => {
    logTimer = null
    if (!logBuffer.length) return
    const cur = jobs.get(job.id)
    if (!cur) return
    const lines = logBuffer
    logBuffer = []
    patch(job.id, { log: [...cur.log, ...lines].slice(-400) })
  }

  const queueLog = (line) => {
    logBuffer.push(line)
    if (!logTimer) logTimer = setTimeout(flushLog, 250)
  }

  const { child, done } = run(built.args, {
    onProgress: (p) => {
      const pct =
        p.total && p.downloaded
          ? Math.min(1, p.downloaded / p.total)
          : p.fragmentCount && p.fragmentIndex
            ? Math.min(1, p.fragmentIndex / p.fragmentCount)
            : jobs.get(job.id)?.progress || 0
      patch(job.id, {
        status: p.status === 'finished' ? 'processing' : 'running',
        progress: pct,
        speed: p.speed,
        eta: p.eta,
        total: p.total,
        downloaded: p.downloaded
      })
    },
    onPhase: (phase) => patch(job.id, { status: phase }),
    onFile: (file) => patch(job.id, { file }),
    onLog: queueLog
  })

  running.set(job.id, child)
  const result = await done
  running.delete(job.id)

  clearTimeout(logTimer)
  flushLog()

  const cur = jobs.get(job.id)
  if (!cur) return

  if (cur.status === 'canceled') {
    // Leave it as the user set it.
  } else if (result.code === 0) {
    patch(job.id, {
      status: 'done',
      progress: 1,
      speed: null,
      eta: null,
      finishedAt: Date.now()
    })
  } else {
    const tail = cur.log.filter((l) => /error|unable|unsupported|forbidden|warning/i.test(l)).slice(-6).join(' | ')
    const raw = result.error || tail || `yt-dlp exited with code ${result.code}`

    // Try the known fix for this failure before bothering the user with it.
    const settings2 = await getSettings()
    const strategy = settings2.autoRecover === false ? null : nextStrategy(raw, cur.tried)

    if (strategy) {
      patch(job.id, {
        status: 'queued',
        progress: 0,
        speed: null,
        eta: null,
        tried: [...cur.tried, strategy.id],
        extraArgs: [...(cur.extraArgs || []), ...strategy.args(settings2)],
        recovery: { title: strategy.title, action: strategy.action },
        error: null
      })
    } else {
      patch(job.id, {
        status: 'error',
        error: explain(raw),
        rawError: raw,
        finishedAt: Date.now()
      })
    }
  }

  pump()
}

/** Runs a local ffmpeg job: compress to a target size, or convert format. */
async function startLocal(job, settings) {
  let logBuffer = []
  let logTimer = null
  const flushLog = () => {
    logTimer = null
    if (!logBuffer.length) return
    const cur = jobs.get(job.id)
    if (!cur) return
    const lines = logBuffer
    logBuffer = []
    patch(job.id, { log: [...cur.log, ...lines].slice(-400) })
  }

  const handlers = {
    onProgress: (frac) => patch(job.id, { progress: Math.min(1, frac) }),
    onPlan: (plan) => patch(job.id, { plan }),
    onFile: (file) => patch(job.id, { file: job.file, outputFile: file }),
    onChild: (child) => running.set(job.id, child),
    onLog: (line) => {
      logBuffer.push(line)
      if (!logTimer) logTimer = setTimeout(flushLog, 250)
    }
  }

  let result
  try {
    const target = { ...job, outputDir: job.outputDir || settings.downloadDir }
    result = job.kind === 'compress'
      ? await media.compress(target, handlers)
      : await media.convert(target, handlers)
  } catch (err) {
    result = { code: -1, error: String(err.message || err) }
  }

  running.delete(job.id)
  clearTimeout(logTimer)
  flushLog()

  const cur = jobs.get(job.id)
  if (!cur) return
  if (cur.status === 'canceled') {
    pump()
    return
  }

  if (result.code === 0) {
    patch(job.id, {
      status: 'done',
      progress: 1,
      file: result.file,
      resultSize: result.size,
      total: result.size,
      finishedAt: Date.now(),
      // Overshooting a size target is a failure the user needs to see, even
      // though ffmpeg exited cleanly.
      error: result.overTarget ? 'Result is slightly over the target size' : null
    })
  } else {
    patch(job.id, {
      status: 'error',
      error: result.error || 'ffmpeg failed',
      finishedAt: Date.now()
    })
  }

  pump()
}

async function pump() {
  const settings = await getSettings()
  const limit = Math.max(1, Number(settings.concurrency) || 3)
  const active = [...jobs.values()].filter((j) => j.status === 'running' || j.status === 'processing')
  if (active.length >= limit) return

  const next = [...jobs.values()].find((j) => j.status === 'queued')
  if (!next) return

  // Claim the slot synchronously. start() awaits settings before it can mark
  // the job, and a concurrent pump() would otherwise pick the same job twice.
  next.status = 'running'
  start(next)

  // Fill remaining slots.
  if (active.length + 1 < limit) setImmediate(pump)
}

/** Windows needs the whole process tree killed, ffmpeg is a child of yt-dlp. */
function killTree(child) {
  if (!child?.pid) return
  if (process.platform === 'win32') {
    spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], { windowsHide: true })
  } else {
    child.kill('SIGKILL')
  }
}

export function cancel(id) {
  const job = jobs.get(id)
  if (!job) return
  if (job.status === 'running' || job.status === 'processing') {
    patch(id, { status: 'canceled', speed: null, eta: null })
    killTree(running.get(id))
    running.delete(id)
  } else if (job.status === 'queued') {
    patch(id, { status: 'canceled' })
  }
  pump()
}

export function retry(id) {
  const job = jobs.get(id)
  if (!job) return
  patch(id, {
    status: 'queued',
    progress: 0,
    error: null,
    speed: null,
    eta: null,
    log: [],
    finishedAt: null
  })
  pump()
}

export function remove(id) {
  cancel(id)
  jobs.delete(id)
  emit({ id, removed: true })
}

export function clearFinished() {
  for (const [id, job] of jobs) {
    if (['done', 'error', 'canceled'].includes(job.status)) {
      jobs.delete(id)
      emit({ id, removed: true })
    }
  }
}

export function cancelAll() {
  for (const id of jobs.keys()) cancel(id)
}

/* ---------- persistence ---------- */

let persistPath = null
let saveTimer = null

/**
 * Unfinished work survives a restart. Only pending jobs are kept: completed
 * ones are history, and half-finished ffmpeg output cannot be resumed anyway.
 */
export function enablePersistence(file) {
  persistPath = file
}

function schedulePersist() {
  if (!persistPath || saveTimer) return
  saveTimer = setTimeout(async () => {
    saveTimer = null
    try {
      const pending = [...jobs.values()]
        .filter((j) => ['queued', 'running', 'processing'].includes(j.status))
        .map((j) => ({ ...snapshot(j), status: 'queued', progress: 0, log: [], speed: null, eta: null }))
      await fsp.writeFile(persistPath, JSON.stringify(pending), 'utf8')
    } catch {
      /* never let a failed save break downloading */
    }
  }, 1500)
}

export async function restore() {
  if (!persistPath) return 0
  try {
    const saved = JSON.parse(await fsp.readFile(persistPath, 'utf8'))
    if (!Array.isArray(saved) || !saved.length) return 0
    for (const job of saved) {
      const { id, addedAt, finishedAt, ...rest } = job
      add(rest)
    }
    await fsp.rm(persistPath, { force: true })
    return saved.length
  } catch {
    return 0
  }
}

export function stats() {
  const all = [...jobs.values()]
  return {
    total: all.length,
    active: all.filter((j) => j.status === 'running' || j.status === 'processing').length,
    queued: all.filter((j) => j.status === 'queued').length,
    done: all.filter((j) => j.status === 'done').length,
    failed: all.filter((j) => j.status === 'error').length,
    speed: all
      .filter((j) => j.status === 'running')
      .reduce((sum, j) => sum + (j.speed || 0), 0)
  }
}
