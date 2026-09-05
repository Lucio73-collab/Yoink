import { shell } from 'electron'
import http from 'node:http'
import crypto from 'node:crypto'
import { search } from './ytdlp.js'

/**
 * Spotify streams are encrypted and Yoink does not touch that. This module
 * only reads public catalogue metadata through Spotify's own Web API, then
 * finds the matching recording on YouTube Music and downloads that. It is the
 * same approach spotDL uses.
 *
 * Since Spotify's February 2026 Developer Mode changes, a shared Client ID is
 * no longer viable: each one is capped to a handful of authorised users and
 * distributing one publicly gets it revoked. So the user brings their own,
 * and we use Authorization Code + PKCE rather than Client Credentials, which
 * Spotify has been moving metadata endpoints away from.
 */

const REDIRECT_PORT = 8888
const REDIRECT_URI = `http://127.0.0.1:${REDIRECT_PORT}/callback`
const SCOPES = 'playlist-read-private playlist-read-collaborative user-library-read'

let token = null // { access_token, refresh_token, expires_at }

const b64url = (buf) =>
  buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '')

export function isAuthed() {
  return Boolean(token?.refresh_token)
}

export function signOut() {
  token = null
}

export async function authorize(clientId) {
  if (!clientId) throw new Error('Add your Spotify Client ID in Settings first.')

  const verifier = b64url(crypto.randomBytes(64))
  const challenge = b64url(crypto.createHash('sha256').update(verifier).digest())
  const state = b64url(crypto.randomBytes(16))

  const url =
    'https://accounts.spotify.com/authorize?' +
    new URLSearchParams({
      client_id: clientId,
      response_type: 'code',
      redirect_uri: REDIRECT_URI,
      state,
      scope: SCOPES,
      code_challenge_method: 'S256',
      code_challenge: challenge
    })

  const code = await new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      const parsed = new URL(req.url, `http://127.0.0.1:${REDIRECT_PORT}`)
      if (parsed.pathname !== '/callback') {
        res.writeHead(404).end()
        return
      }
      const err = parsed.searchParams.get('error')
      const got = parsed.searchParams.get('code')
      const gotState = parsed.searchParams.get('state')

      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
      res.end(
        `<!doctype html><meta charset="utf-8"><body style="background:#1e1e2e;color:#cdd6f4;font:16px system-ui;display:grid;place-items:center;height:100vh;margin:0">
         <p>${err ? 'Authorisation failed.' : 'Connected. You can close this tab.'}</p></body>`
      )
      server.close()
      if (err) reject(new Error(err))
      else if (gotState !== state) reject(new Error('State mismatch, aborting.'))
      else resolve(got)
    })

    server.on('error', (e) =>
      reject(
        new Error(
          e.code === 'EADDRINUSE'
            ? `Port ${REDIRECT_PORT} is busy. Close whatever is using it and try again.`
            : String(e.message)
        )
      )
    )
    server.listen(REDIRECT_PORT, '127.0.0.1', () => shell.openExternal(url))
    setTimeout(() => {
      server.close()
      reject(new Error('Timed out waiting for Spotify authorisation.'))
    }, 180_000)
  })

  const res = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: REDIRECT_URI,
      client_id: clientId,
      code_verifier: verifier
    })
  })
  if (!res.ok) throw new Error(`Token exchange failed: ${await res.text()}`)
  const json = await res.json()
  token = { ...json, client_id: clientId, expires_at: Date.now() + json.expires_in * 1000 }
  return true
}

async function accessToken() {
  if (!token) throw new Error('Not connected to Spotify.')
  if (Date.now() < token.expires_at - 30_000) return token.access_token

  const res = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: token.refresh_token,
      client_id: token.client_id
    })
  })
  if (!res.ok) {
    token = null
    throw new Error('Spotify session expired, reconnect in Settings.')
  }
  const json = await res.json()
  token = {
    ...token,
    ...json,
    refresh_token: json.refresh_token || token.refresh_token,
    expires_at: Date.now() + json.expires_in * 1000
  }
  return token.access_token
}

async function api(pathname, params = {}) {
  const at = await accessToken()
  const url = new URL(`https://api.spotify.com/v1/${pathname}`)
  Object.entries(params).forEach(([k, v]) => v != null && url.searchParams.set(k, v))
  const res = await fetch(url, { headers: { Authorization: `Bearer ${at}` } })
  if (res.status === 403) {
    throw new Error(
      'Spotify returned 403. Make sure your account is on the app\'s allowlist in the developer dashboard.'
    )
  }
  if (!res.ok) throw new Error(`Spotify API ${res.status}: ${await res.text()}`)
  return res.json()
}

async function paged(pathname, params = {}, key = 'items') {
  const out = []
  let offset = 0
  for (;;) {
    const page = await api(pathname, { ...params, limit: 50, offset })
    const items = page[key] ?? page.items ?? []
    out.push(...items)
    if (items.length < 50 || out.length >= (page.total ?? out.length)) break
    offset += 50
  }
  return out
}

export function parseUrl(input) {
  const m = String(input).match(
    /(?:open\.spotify\.com\/(?:intl-\w+\/)?|spotify:)(track|album|playlist|artist)[/:]([A-Za-z0-9]+)/
  )
  return m ? { type: m[1], id: m[2] } : null
}

const toTrack = (t, albumArt) => ({
  id: t.id,
  title: t.name,
  artists: (t.artists || []).map((a) => a.name),
  artist: (t.artists || []).map((a) => a.name).join(', '),
  album: t.album?.name || null,
  albumArtist: t.album?.artists?.[0]?.name || t.artists?.[0]?.name || null,
  trackNumber: t.track_number || null,
  discNumber: t.disc_number || null,
  year: (t.album?.release_date || '').slice(0, 4) || null,
  durationMs: t.duration_ms || null,
  isrc: t.external_ids?.isrc || null,
  cover: t.album?.images?.[0]?.url || albumArt || null
})

/** Expands any Spotify link into a flat list of track metadata. */
export async function resolve(input) {
  const ref = parseUrl(input)
  if (!ref) throw new Error('That does not look like a Spotify link.')

  if (ref.type === 'track') {
    return { name: null, tracks: [toTrack(await api(`tracks/${ref.id}`))] }
  }

  if (ref.type === 'album') {
    const album = await api(`albums/${ref.id}`)
    const art = album.images?.[0]?.url
    const items = await paged(`albums/${ref.id}/tracks`)
    return {
      name: album.name,
      tracks: items.map((t) =>
        toTrack({ ...t, album: { name: album.name, release_date: album.release_date, images: album.images, artists: album.artists } }, art)
      )
    }
  }

  if (ref.type === 'playlist') {
    const pl = await api(`playlists/${ref.id}`, { fields: 'name' })
    // February 2026 migration: /tracks is gone, /items replaced it and the
    // response nests under item rather than track.
    const items = await paged(`playlists/${ref.id}/items`)
    return {
      name: pl.name,
      tracks: items
        .map((row) => row.item ?? row.track)
        .filter((t) => t && t.type === 'track')
        .map((t) => toTrack(t))
    }
  }

  const artist = await api(`artists/${ref.id}`)
  const albums = await paged(`artists/${ref.id}/albums`, { include_groups: 'album,single' })
  const tracks = []
  for (const al of albums) {
    const items = await paged(`albums/${al.id}/tracks`)
    tracks.push(
      ...items.map((t) =>
        toTrack({ ...t, album: { name: al.name, release_date: al.release_date, images: al.images, artists: al.artists } })
      )
    )
  }
  return { name: artist.name, tracks }
}

/* ---------- matching ---------- */

const normalise = (s) =>
  String(s)
    .toLowerCase()
    .replace(/\(.*?\)|\[.*?\]/g, ' ')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()

const BAD = /\b(live|cover|remix|karaoke|instrumental|sped up|slowed|reverb|8d|nightcore|reaction|lyrics video)\b/i

function score(track, candidate) {
  const wantTitle = normalise(track.title)
  const wantArtist = normalise(track.artist)
  const gotTitle = normalise(candidate.title || '')
  const gotChannel = normalise(candidate.uploader || candidate.channel || '')
  const haystack = `${gotTitle} ${gotChannel}`

  let s = 0

  // Title token overlap carries the most weight.
  const wantTokens = wantTitle.split(' ').filter(Boolean)
  const hit = wantTokens.filter((t) => gotTitle.includes(t)).length
  s += wantTokens.length ? (hit / wantTokens.length) * 50 : 0

  // Artist appearing anywhere in title or channel.
  const artistTokens = wantArtist.split(' ').filter(Boolean)
  const aHit = artistTokens.filter((t) => haystack.includes(t)).length
  s += artistTokens.length ? (aHit / artistTokens.length) * 25 : 0

  // Duration is the strongest signal that it is the same recording.
  if (track.durationMs && candidate.duration) {
    const delta = Math.abs(candidate.duration - track.durationMs / 1000)
    if (delta <= 2) s += 25
    else if (delta <= 5) s += 18
    else if (delta <= 10) s += 8
    else if (delta > 30) s -= 30
  }

  // Auto generated artist channels are almost always the clean official audio.
  if (/ - topic$/i.test(candidate.uploader || '')) s += 15
  if (/provided to youtube/i.test(candidate.description || '')) s += 10
  if (/official audio/i.test(gotTitle)) s += 5

  // Penalise variants unless the source track is itself that variant.
  if (BAD.test(gotTitle) && !BAD.test(track.title)) s -= 25

  return s
}

/** Picks the best YouTube result for a Spotify track. */
export async function findAudio(track, settings) {
  const limit = Math.max(3, Number(settings.spotifyMatchCandidates) || 5)
  const query = `${track.artist} ${track.title} audio`
  const candidates = await search(query, limit, settings)
  if (!candidates.length) return null

  const ranked = candidates
    .map((c) => ({ c, s: score(track, c) }))
    .sort((a, b) => b.s - a.s)

  const best = ranked[0]
  if (best.s < 35) return null
  return {
    url: best.c.webpage_url || best.c.url || `https://www.youtube.com/watch?v=${best.c.id}`,
    title: best.c.title,
    uploader: best.c.uploader,
    duration: best.c.duration,
    confidence: Math.round(Math.min(100, best.s))
  }
}
