import { app } from 'electron'
import fs from 'node:fs/promises'
import path from 'node:path'

const FILE = path.join(app.getPath('userData'), 'settings.json')

export const DEFAULTS = {
  // Output
  downloadDir: path.join(app.getPath('videos'), 'Yoink'),
  audioDir: path.join(app.getPath('music'), 'Yoink'),
  outputTemplate: '%(title).180B [%(id)s].%(ext)s',
  playlistTemplate: '%(playlist_title).100B/%(playlist_index)03d - %(title).150B [%(id)s].%(ext)s',
  restrictFilenames: false,
  // Expand a playlist into individual jobs so each can be retried and the
  // whole set folds into one collapsible group in the queue.
  expandPlaylists: true,
  expandLimit: 300,

  // Quality
  mode: 'video', // video | audio
  maxHeight: 0, // 0 means no cap, take the best available
  container: 'auto', // auto | mp4 | mkv | webm
  preferCodec: 'any', // any | av1 | vp9 | h264
  audioFormat: 'original', // original | opus | m4a | mp3 | flac | wav
  audioBitrate: '0', // yt-dlp --audio-quality, 0 is best VBR

  // Extras
  embedThumbnail: true,
  embedMetadata: true,
  embedChapters: true,
  embedSubs: false,
  writeSubs: false,
  subLangs: 'en.*,nl',
  sponsorblock: false,
  sponsorblockCategories: 'sponsor,selfpromo,interaction',
  splitChapters: false,
  writeThumbnail: false,
  keepArchive: false,

  // Network and behaviour
  concurrency: 3,
  fragments: 4,
  rateLimit: '', // e.g. 5M, empty means unlimited
  retries: 10,
  proxy: '',
  cookiesFrom: 'none', // none | chrome | firefox | edge | brave | opera | vivaldi | file
  cookiesFile: '',
  forceIpv4: false,

  // Spotify (metadata only, audio is matched from YouTube Music)
  spotifyClientId: '',
  spotifyMatchCandidates: 5,

  // App
  notifyOnComplete: true,
  clipboardWatch: false,
  autoUpdateTools: true
}

let cache = null

export async function load() {
  if (cache) return cache
  try {
    const raw = JSON.parse(await fs.readFile(FILE, 'utf8'))
    cache = { ...DEFAULTS, ...raw }
  } catch {
    cache = { ...DEFAULTS }
  }
  return cache
}

export async function save(patch) {
  const current = await load()
  cache = { ...current, ...patch }
  await fs.mkdir(path.dirname(FILE), { recursive: true })
  await fs.writeFile(FILE, JSON.stringify(cache, null, 2), 'utf8')
  return cache
}

export async function reset() {
  cache = { ...DEFAULTS }
  await fs.writeFile(FILE, JSON.stringify(cache, null, 2), 'utf8')
  return cache
}
