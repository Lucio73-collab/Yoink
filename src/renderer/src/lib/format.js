export function bytes(n) {
  if (!n && n !== 0) return '--'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  let i = 0
  let v = n
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024
    i++
  }
  return `${v < 10 && i > 0 ? v.toFixed(1) : Math.round(v)} ${units[i]}`
}

export function rate(n) {
  if (!n) return '--'
  return `${bytes(n)}/s`
}

export function duration(s) {
  if (!s && s !== 0) return '--'
  const total = Math.round(s)
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const sec = total % 60
  const pad = (x) => String(x).padStart(2, '0')
  return h ? `${h}:${pad(m)}:${pad(sec)}` : `${m}:${pad(sec)}`
}

export function eta(s) {
  if (!s && s !== 0) return '--'
  return duration(s)
}

export function pct(v) {
  return `${Math.round((v || 0) * 100)}%`
}

const HOSTS = [
  [/youtube\.com|youtu\.be/i, 'YouTube'],
  [/tiktok\.com/i, 'TikTok'],
  [/instagram\.com/i, 'Instagram'],
  [/(twitter|x)\.com/i, 'X'],
  [/reddit\.com/i, 'Reddit'],
  [/twitch\.tv/i, 'Twitch'],
  [/soundcloud\.com/i, 'SoundCloud'],
  [/bandcamp\.com/i, 'Bandcamp'],
  [/vimeo\.com/i, 'Vimeo'],
  [/facebook\.com/i, 'Facebook'],
  [/open\.spotify\.com|spotify:/i, 'Spotify'],
  [/bilibili\.com/i, 'Bilibili'],
  [/dailymotion\.com/i, 'Dailymotion'],
  [/nos\.nl|npo\.nl/i, 'NPO']
]

export function siteOf(url) {
  for (const [re, name] of HOSTS) if (re.test(url)) return name
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return 'Link'
  }
}

export function isSpotify(url) {
  return /open\.spotify\.com|spotify:/i.test(url)
}

export function splitUrls(text) {
  return [...new Set(
    String(text)
      .split(/[\s\n]+/)
      .map((s) => s.trim())
      .filter((s) => /^(https?:\/\/|spotify:)/i.test(s))
  )]
}
