import { spawn, execFile } from 'node:child_process'
import { promisify } from 'node:util'
import path from 'node:path'
import { binPath, ffmpegDir, capabilities, isInstalled } from './binaries.js'

const execFileAsync = promisify(execFile)

/**
 * Pipe delimited rather than JSON. yt-dlp's --progress-template goes through
 * Windows argument escaping, and a template full of braces and quotes is a
 * reliable way to get a mangled command line. Pipes survive it.
 */
const FIELDS = [
  'progress.status',
  'progress.downloaded_bytes',
  'progress.total_bytes',
  'progress.total_bytes_estimate',
  'progress.speed',
  'progress.eta',
  'progress.fragment_index',
  'progress.fragment_count',
  'info.id'
]

const PROGRESS_TEMPLATE =
  'download:@Y@' + FIELDS.map((f) => `%(${f})s`).join('|') + '@'

const POST_TEMPLATE = 'postprocess:@P@%(progress.status)s|%(info.id)s@'

const num = (v) => {
  const n = Number(v)
  return Number.isFinite(n) && v !== 'NA' && v !== '' ? n : null
}

/** Base flags every invocation gets. */
async function baseArgs(settings) {
  const caps = await capabilities()
  const args = [
    '--newline',
    '--no-colors',
    '--no-call-home',
    '--ignore-config',
    '--progress',
    '--progress-template',
    PROGRESS_TEMPLATE,
    '--progress-template',
    POST_TEMPLATE,
    '--ffmpeg-location',
    ffmpegDir(),
    '--retries',
    String(settings.retries ?? 10),
    '--fragment-retries',
    String(settings.retries ?? 10),
    '--concurrent-fragments',
    String(settings.fragments ?? 4),
    '--windows-filenames',
    '--no-overwrites',
    '--continue'
  ]

  // Point yt-dlp at our managed deno so YouTube's JS challenges resolve.
  if (caps.jsRuntimes && isInstalled('deno')) {
    args.push('--js-runtimes', `deno:${binPath('deno')}`)
  }

  if (settings.restrictFilenames) args.push('--restrict-filenames')
  if (settings.rateLimit) args.push('--limit-rate', settings.rateLimit)
  if (settings.proxy) args.push('--proxy', settings.proxy)
  if (settings.forceIpv4) args.push('--force-ipv4')

  if (settings.cookiesFrom === 'file' && settings.cookiesFile) {
    args.push('--cookies', settings.cookiesFile)
  } else if (settings.cookiesFrom && settings.cookiesFrom !== 'none') {
    args.push('--cookies-from-browser', settings.cookiesFrom)
  }

  return args
}

/**
 * Format selection. The goal is maximum quality without a needless re-encode,
 * so we lean on -S sorting rather than hardcoding format ids.
 */
function formatArgs(job, settings) {
  const args = []
  const mode = job.mode || settings.mode

  if (mode === 'audio') {
    args.push('-f', 'bestaudio/best', '--extract-audio')
    const fmt = job.audioFormat || settings.audioFormat
    // "original" avoids a lossy to lossy re-encode. Opus in, Opus out.
    args.push('--audio-format', fmt === 'original' ? 'best' : fmt)
    args.push('--audio-quality', String(settings.audioBitrate ?? '0'))
    args.push('-S', 'acodec:opus,abr,asr')
    return args
  }

  const cap = Number(job.maxHeight ?? settings.maxHeight) || 0
  const heightFilter = cap ? `[height<=?${cap}]` : ''
  args.push('-f', `bv*${heightFilter}+ba/b${heightFilter}/bv*+ba/b`)

  const sort = []
  if (cap) sort.push(`res:${cap}`)
  else sort.push('res')
  sort.push('fps', 'hdr:12')

  const codec = job.preferCodec || settings.preferCodec
  if (codec === 'av1') sort.push('vcodec:av01')
  else if (codec === 'vp9') sort.push('vcodec:vp9.2')
  else if (codec === 'h264') sort.push('vcodec:h264')
  sort.push('channels', 'acodec:opus', 'br')
  args.push('-S', sort.join(','))

  const container = job.container || settings.container
  if (container === 'auto') {
    // mkv accepts every stream combination, so nothing gets re-encoded.
    args.push('--merge-output-format', 'mkv')
  } else {
    args.push('--merge-output-format', container)
    if (container === 'mp4') args.push('--remux-video', 'mp4')
  }

  return args
}

function extraArgs(job, settings) {
  const args = []
  const mode = job.mode || settings.mode

  if (settings.embedMetadata) args.push('--embed-metadata')
  if (settings.embedThumbnail) args.push('--embed-thumbnail')
  if (settings.embedChapters && mode === 'video') args.push('--embed-chapters')
  if (settings.writeThumbnail) args.push('--write-thumbnail')

  if (mode === 'video') {
    if (settings.embedSubs) {
      args.push('--embed-subs', '--sub-langs', settings.subLangs || 'en.*')
    }
    if (settings.writeSubs) {
      args.push(
        '--write-subs',
        '--write-auto-subs',
        '--sub-langs',
        settings.subLangs || 'en.*',
        '--convert-subs',
        'srt'
      )
    }
    if (settings.splitChapters) args.push('--split-chapters')
  }

  if (settings.sponsorblock) {
    args.push('--sponsorblock-remove', settings.sponsorblockCategories || 'sponsor')
  }

  if (settings.keepArchive) {
    args.push('--download-archive', path.join(job.outputDir, '.yoink-archive.txt'))
  }

  // Clip a section without downloading the whole thing.
  if (job.section?.start || job.section?.end) {
    const start = job.section.start || '0'
    const end = job.section.end || 'inf'
    args.push('--download-sections', `*${start}-${end}`, '--force-keyframes-at-cuts')
  }

  if (job.playlistItems) args.push('--playlist-items', job.playlistItems)
  if (job.noPlaylist) args.push('--no-playlist')

  return args
}

export async function buildArgs(job, settings) {
  const mode = job.mode || settings.mode
  const outputDir =
    job.outputDir || (mode === 'audio' ? settings.audioDir : settings.downloadDir)

  const template = job.isPlaylist
    ? settings.playlistTemplate
    : job.outputTemplate || settings.outputTemplate

  const args = [
    ...(await baseArgs(settings)),
    ...formatArgs(job, settings),
    ...extraArgs({ ...job, outputDir }, settings),
    '-P',
    outputDir,
    '-o',
    template,
    '--',
    job.url
  ]

  return { args, outputDir }
}

/** Read metadata without downloading. Used to populate the queue card. */
export async function probe(url, settings, { flat = true } = {}) {
  const caps = await capabilities()
  const args = [
    '--ignore-config',
    '--no-colors',
    '--no-warnings',
    '-J',
    '--no-download'
  ]
  if (flat) args.push('--flat-playlist')
  if (caps.jsRuntimes && isInstalled('deno')) {
    args.push('--js-runtimes', `deno:${binPath('deno')}`)
  }
  if (settings?.cookiesFrom === 'file' && settings.cookiesFile) {
    args.push('--cookies', settings.cookiesFile)
  } else if (settings?.cookiesFrom && settings.cookiesFrom !== 'none') {
    args.push('--cookies-from-browser', settings.cookiesFrom)
  }
  if (settings?.proxy) args.push('--proxy', settings.proxy)
  args.push('--', url)

  const { stdout } = await execFileAsync(binPath('ytdlp'), args, {
    maxBuffer: 128 * 1024 * 1024,
    windowsHide: true
  })
  return JSON.parse(stdout)
}

/** Resolve a search query to concrete entries, used by the Spotify matcher. */
export async function search(query, limit, settings) {
  const info = await probe(`ytsearch${limit}:${query}`, settings, { flat: false })
  return info?.entries || []
}

/**
 * Spawns yt-dlp and streams normalised progress events.
 * Returns { child, done } so the queue can cancel mid flight.
 */
export function run(args, handlers = {}) {
  const child = spawn(binPath('ytdlp'), args, {
    windowsHide: true,
    env: { ...process.env, PYTHONUNBUFFERED: '1', NO_COLOR: '1' }
  })

  let stdoutBuf = ''
  let stderrBuf = ''

  const handleLine = (line) => {
    const text = line.trim()
    if (!text) return

    if (text.startsWith('@Y@') && text.endsWith('@')) {
      const parts = text.slice(3, -1).split('|')
      handlers.onProgress?.({
        status: parts[0],
        downloaded: num(parts[1]),
        total: num(parts[2]) ?? num(parts[3]),
        speed: num(parts[4]),
        eta: num(parts[5]),
        fragmentIndex: num(parts[6]),
        fragmentCount: num(parts[7])
      })
      return
    }

    if (text.startsWith('@P@') && text.endsWith('@')) {
      handlers.onPhase?.('processing')
      return
    }

    // Fallback for anything the template did not cover, plus useful phases.
    if (/^\[(Merger|ExtractAudio|VideoConvertor|EmbedThumbnail|Metadata|SponsorBlock|Fixup)/i.test(text)) {
      handlers.onPhase?.('processing')
    }
    const dest = text.match(/^\[(?:download|Merger|ExtractAudio)\].*?(?:Destination:|Merging formats into)\s+"?(.+?)"?$/)
    if (dest) handlers.onFile?.(dest[1])

    handlers.onLog?.(text)
  }

  // yt-dlp uses \r for in place progress even with --newline in some paths.
  const consume = (chunk, isErr) => {
    const text = chunk.toString()
    if (isErr) {
      stderrBuf += text
      const lines = stderrBuf.split(/\r?\n/)
      stderrBuf = lines.pop() ?? ''
      lines.forEach((l) => l.trim() && handlers.onLog?.(l.trim()))
      return
    }
    stdoutBuf += text
    const lines = stdoutBuf.split(/[\r\n]+/)
    stdoutBuf = lines.pop() ?? ''
    lines.forEach(handleLine)
  }

  child.stdout.on('data', (c) => consume(c, false))
  child.stderr.on('data', (c) => consume(c, true))

  const done = new Promise((resolve) => {
    child.on('error', (err) => resolve({ code: -1, error: String(err.message || err) }))
    child.on('close', (code) => {
      if (stdoutBuf.trim()) handleLine(stdoutBuf)
      if (stderrBuf.trim()) handlers.onLog?.(stderrBuf.trim())
      resolve({ code })
    })
  })

  return { child, done }
}
