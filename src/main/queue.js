import { randomUUID } from 'node:crypto'
import { spawn } from 'node:child_process'
import { buildArgs, run } from './ytdlp.js'

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
}

function patch(id, changes) {
  const job = jobs.get(id)
  if (!job) return
  Object.assign(job, changes)
  emit(snapshot(job))
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

  let built
  try {
    built = await buildArgs(job, settings)
  } catch (err) {
    patch(job.id, { status: 'error', error: String(err.message || err) })
    pump()
    return
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
    onLog: (line) => {
      const cur = jobs.get(job.id)
      if (!cur) return
      const log = [...cur.log, line].slice(-400)
      patch(job.id, { log })
    }
  })

  running.set(job.id, child)
  const result = await done
  running.delete(job.id)

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
    const tail = cur.log.filter((l) => /error|unable|unsupported|forbidden/i.test(l)).slice(-3)
    patch(job.id, {
      status: 'error',
      error: result.error || tail.join(' | ') || `yt-dlp exited with code ${result.code}`,
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
