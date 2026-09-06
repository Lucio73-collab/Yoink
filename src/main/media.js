import { spawn, execFile } from 'node:child_process'
import { promisify } from 'node:util'
import path from 'node:path'
import os from 'node:os'
import fs from 'node:fs/promises'
import { ffmpegDir } from './binaries.js'

const execFileAsync = promisify(execFile)

const ffmpeg = () => path.join(ffmpegDir(), 'ffmpeg.exe')
const ffprobe = () => path.join(ffmpegDir(), 'ffprobe.exe')

/** Reads duration, size and stream info for a local file. */
export async function probeFile(file) {
  const { stdout } = await execFileAsync(
    ffprobe(),
    ['-v', 'quiet', '-print_format', 'json', '-show_format', '-show_streams', file],
    { windowsHide: true, maxBuffer: 16 * 1024 * 1024 }
  )
  const info = JSON.parse(stdout)
  const video = info.streams?.find((s) => s.codec_type === 'video')
  const audio = info.streams?.find((s) => s.codec_type === 'audio')
  const stat = await fs.stat(file)

  return {
    file,
    name: path.basename(file),
    duration: Number(info.format?.duration) || 0,
    size: stat.size,
    hasVideo: Boolean(video && video.disposition?.attached_pic !== 1),
    hasAudio: Boolean(audio),
    width: video?.width || null,
    height: video?.height || null,
    fps: video?.r_frame_rate ? eval0(video.r_frame_rate) : null,
    vcodec: video?.codec_name || null,
    acodec: audio?.codec_name || null
  }
}

// "30000/1001" -> 29.97, without pulling in a parser.
function eval0(frac) {
  const [a, b] = String(frac).split('/').map(Number)
  return b ? Math.round((a / b) * 100) / 100 : a
}

export const SIZE_PRESETS = [
  { id: '10mb', label: '10 MB', bytes: 10 * 1024 * 1024, note: 'Discord free' },
  { id: '25mb', label: '25 MB', bytes: 25 * 1024 * 1024, note: 'Discord Nitro Basic' },
  { id: '50mb', label: '50 MB', bytes: 50 * 1024 * 1024, note: '' },
  { id: '100mb', label: '100 MB', bytes: 100 * 1024 * 1024, note: 'Discord Nitro' },
  { id: '500mb', label: '500 MB', bytes: 500 * 1024 * 1024, note: '' }
]

/**
 * Works out the bitrates needed to land under a target size, and how far the
 * picture has to be scaled down to make that bitrate look acceptable.
 *
 * Naively dividing size by duration produces technically-correct numbers that
 * look terrible: 1080p at 400 kbps is a smear. Dropping resolution so the
 * available bits are spread over fewer pixels is what makes the result
 * watchable, and it is the step most size-targeting tools skip.
 */
export function planCompress(info, targetBytes) {
  const duration = info.duration
  if (!duration) throw new Error('Could not read the duration of that file.')

  // Container overhead plus muxing slack. Overshooting the target is a failure,
  // so aim slightly under rather than exactly at it.
  const budget = targetBytes * 0.94
  const totalKbps = Math.floor((budget * 8) / duration / 1000)

  if (totalKbps < 40) {
    throw new Error(
      `That file is too long to fit in this size. It would need ${totalKbps} kbps.`
    )
  }

  const audioKbps = !info.hasAudio ? 0 : totalKbps < 200 ? 48 : totalKbps < 600 ? 96 : 128
  const videoKbps = Math.max(24, totalKbps - audioKbps)

  // Resolution ladder: the height a given bitrate can actually sustain.
  const srcHeight = info.height || 1080
  let height = srcHeight
  if (videoKbps < 250) height = Math.min(srcHeight, 360)
  else if (videoKbps < 600) height = Math.min(srcHeight, 480)
  else if (videoKbps < 1500) height = Math.min(srcHeight, 720)
  else if (videoKbps < 4000) height = Math.min(srcHeight, 1080)

  // Long videos at low bitrate also benefit from fewer frames.
  const fps = videoKbps < 400 && (info.fps || 30) > 30 ? 30 : null

  return {
    videoKbps,
    audioKbps,
    height: height < srcHeight ? height : null,
    fps,
    estimatedBytes: Math.round(((videoKbps + audioKbps) * 1000 * duration) / 8),
    duration
  }
}

/** Streams ffmpeg progress as a 0..1 fraction of the given duration. */
function runFfmpeg(args, duration, { onProgress, onLog } = {}, weight = { from: 0, to: 1 }) {
  const child = spawn(ffmpeg(), ['-hide_banner', '-nostats', '-progress', 'pipe:1', ...args], {
    windowsHide: true
  })

  let out = ''
  child.stdout.on('data', (c) => {
    out += c.toString()
    const lines = out.split(/\r?\n/)
    out = lines.pop() ?? ''
    for (const line of lines) {
      const m = line.match(/^out_time_us=(\d+)/)
      if (m && duration) {
        const secs = Number(m[1]) / 1_000_000
        const frac = Math.min(1, secs / duration)
        onProgress?.(weight.from + frac * (weight.to - weight.from))
      }
    }
  })

  let errBuf = ''
  child.stderr.on('data', (c) => {
    errBuf += c.toString()
    const lines = errBuf.split(/\r?\n/)
    errBuf = lines.pop() ?? ''
    lines.forEach((l) => l.trim() && onLog?.(l.trim()))
  })

  const done = new Promise((resolve) => {
    child.on('error', (e) => resolve({ code: -1, error: String(e.message) }))
    child.on('close', (code) => {
      if (errBuf.trim()) onLog?.(errBuf.trim())
      resolve({ code })
    })
  })

  return { child, done }
}

function uniquePath(dir, base, ext) {
  return path.join(dir, `${base}${ext}`)
}

/**
 * Two-pass x264 encode to hit a target size. Two-pass matters here: a single
 * CRF pass cannot be told "be this many bytes", and single-pass ABR overshoots
 * badly on variable content, which defeats the entire point.
 */
export async function compress(job, handlers = {}) {
  const info = await probeFile(job.file)
  const plan = planCompress(info, job.targetBytes)

  const dir = job.outputDir || path.dirname(job.file)
  await fs.mkdir(dir, { recursive: true })
  const base = path.basename(job.file, path.extname(job.file))
  const out = uniquePath(dir, `${base} (${job.targetLabel || 'compressed'})`, '.mp4')

  const logFile = path.join(os.tmpdir(), `yoink-2pass-${Date.now()}`)

  const filters = []
  if (plan.height) filters.push(`scale=-2:${plan.height}`)
  if (plan.fps) filters.push(`fps=${plan.fps}`)
  const vf = filters.length ? ['-vf', filters.join(',')] : []

  const common = [
    '-i', job.file,
    '-c:v', 'libx264',
    '-b:v', `${plan.videoKbps}k`,
    '-maxrate', `${Math.round(plan.videoKbps * 1.5)}k`,
    '-bufsize', `${plan.videoKbps * 2}k`,
    '-preset', job.preset || 'medium',
    ...vf,
    '-passlogfile', logFile
  ]

  handlers.onPlan?.(plan)

  // Pass 1 analyses only, so no audio and no output file.
  const p1 = runFfmpeg(
    ['-y', ...common, '-pass', '1', '-an', '-f', 'null', process.platform === 'win32' ? 'NUL' : '/dev/null'],
    plan.duration,
    handlers,
    { from: 0, to: 0.45 }
  )
  handlers.onChild?.(p1.child)
  const r1 = await p1.done
  if (r1.code !== 0) {
    await cleanupLogs(logFile)
    return { code: r1.code, error: r1.error || 'First pass failed' }
  }

  const audioArgs = info.hasAudio
    ? ['-c:a', 'aac', '-b:a', `${plan.audioKbps}k`]
    : ['-an']

  const p2 = runFfmpeg(
    ['-y', ...common, '-pass', '2', ...audioArgs, '-movflags', '+faststart', out],
    plan.duration,
    handlers,
    { from: 0.45, to: 1 }
  )
  handlers.onChild?.(p2.child)
  const r2 = await p2.done
  await cleanupLogs(logFile)

  if (r2.code !== 0) return { code: r2.code, error: r2.error || 'Encode failed' }

  const stat = await fs.stat(out)
  handlers.onFile?.(out)
  return {
    code: 0,
    file: out,
    size: stat.size,
    overTarget: stat.size > job.targetBytes
  }
}

async function cleanupLogs(base) {
  for (const suffix of ['-0.log', '-0.log.mbtree', '.log', '.log.mbtree']) {
    await fs.rm(`${base}${suffix}`, { force: true }).catch(() => {})
  }
}

export const CONVERT_FORMATS = [
  { id: 'mp4', label: 'MP4', kind: 'video', v: 'libx264', a: 'aac' },
  { id: 'mkv', label: 'MKV', kind: 'video', v: 'copy', a: 'copy' },
  { id: 'webm', label: 'WebM', kind: 'video', v: 'libvpx-vp9', a: 'libopus' },
  { id: 'gif', label: 'GIF', kind: 'video', v: null, a: null },
  { id: 'mp3', label: 'MP3', kind: 'audio', a: 'libmp3lame' },
  { id: 'm4a', label: 'M4A', kind: 'audio', a: 'aac' },
  { id: 'opus', label: 'Opus', kind: 'audio', a: 'libopus' },
  { id: 'flac', label: 'FLAC', kind: 'audio', a: 'flac' },
  { id: 'wav', label: 'WAV', kind: 'audio', a: 'pcm_s16le' }
]

export async function convert(job, handlers = {}) {
  const info = await probeFile(job.file)
  const fmt = CONVERT_FORMATS.find((f) => f.id === job.format)
  if (!fmt) throw new Error(`Unknown format: ${job.format}`)

  const dir = job.outputDir || path.dirname(job.file)
  await fs.mkdir(dir, { recursive: true })
  const base = path.basename(job.file, path.extname(job.file))
  const out = uniquePath(dir, base, `.${fmt.id}`)

  let args
  if (fmt.id === 'gif') {
    // Two-stage palette generation. A single-pass GIF uses a generic 216
    // colour palette and looks visibly dithered and muddy.
    const palette = path.join(os.tmpdir(), `yoink-pal-${Date.now()}.png`)
    const fps = job.gifFps || 15
    const width = job.gifWidth || 480
    const pal = runFfmpeg(
      ['-y', '-i', job.file, '-vf', `fps=${fps},scale=${width}:-1:flags=lanczos,palettegen`, palette],
      info.duration, handlers, { from: 0, to: 0.4 }
    )
    handlers.onChild?.(pal.child)
    const rp = await pal.done
    if (rp.code !== 0) return { code: rp.code, error: 'Palette generation failed' }

    const gen = runFfmpeg(
      ['-y', '-i', job.file, '-i', palette,
       '-lavfi', `fps=${fps},scale=${width}:-1:flags=lanczos[x];[x][1:v]paletteuse`,
       '-loop', '0', out],
      info.duration, handlers, { from: 0.4, to: 1 }
    )
    handlers.onChild?.(gen.child)
    const rg = await gen.done
    await fs.rm(palette, { force: true }).catch(() => {})
    if (rg.code !== 0) return { code: rg.code, error: 'GIF encode failed' }
    const stat = await fs.stat(out)
    handlers.onFile?.(out)
    return { code: 0, file: out, size: stat.size }
  }

  if (fmt.kind === 'audio') {
    args = ['-y', '-i', job.file, '-vn', '-c:a', fmt.a]
    if (job.audioBitrate && fmt.a !== 'flac' && fmt.a !== 'pcm_s16le') {
      args.push('-b:a', `${job.audioBitrate}k`)
    }
    args.push(out)
  } else {
    args = ['-y', '-i', job.file]
    // MKV can usually take the existing streams untouched, which is instant
    // and lossless. Everything else needs a real encode.
    if (fmt.v === 'copy') args.push('-c', 'copy')
    else {
      args.push('-c:v', fmt.v, '-crf', String(job.crf ?? 23), '-preset', job.preset || 'medium')
      args.push(info.hasAudio ? '-c:a' : '-an', ...(info.hasAudio ? [fmt.a] : []))
      if (fmt.id === 'mp4') args.push('-movflags', '+faststart')
    }
    args.push(out)
  }

  const run = runFfmpeg(args, info.duration, handlers)
  handlers.onChild?.(run.child)
  const r = await run.done
  if (r.code !== 0) return { code: r.code, error: r.error || 'Conversion failed' }

  const stat = await fs.stat(out)
  handlers.onFile?.(out)
  return { code: 0, file: out, size: stat.size }
}
