# Yoink

A fast, good-looking downloader for Windows. Paste a link, get the highest quality file the source actually has.

Built on yt-dlp, so it reaches roughly 1800 sites: YouTube, TikTok, Instagram, X, Reddit, Twitch, SoundCloud, Bandcamp, Vimeo, Dailymotion, Bilibili and a long tail of everything else. Spotify links work through metadata matching (see below).

Catppuccin Mocha, green accent, dense single-window layout.

---

## Quick start

```bash
npm install
npm run dev
```

On first launch Yoink downloads its toolchain into `%APPDATA%/Yoink/bin`. About 120 MB, once.

## Build the exe

```bash
npm run dist
```

Output lands in `release/`:

- `Yoink-1.0.0-x64-nsis.exe` — installer
- `Yoink-1.0.0-portable.exe` — single file, no install

## Publish to GitHub

```bash
git init && git add . && git commit -m "Initial commit"
git remote add origin https://github.com/Lucio73/yoink.git
git push -u origin main
git tag v1.0.0 && git push --tags
```

The tag push triggers `.github/workflows/build.yml`, which builds on `windows-latest` and attaches both exes to a GitHub release. No local Windows build needed after that.

---

## Why it fetches three binaries

| Tool | Why |
|---|---|
| **yt-dlp** | The extractor. Ships fixes almost daily as sites break things. |
| **FFmpeg** | Merges video and audio streams, remuxes, extracts audio, embeds tags. |
| **Deno** | Since yt-dlp 2025.11.12, an external JavaScript runtime is required for full YouTube support. Deno is the only one enabled by default. Without it, YouTube loses its best formats or fails outright. |

Archives are unpacked with Windows' built-in `tar.exe`, falling back to PowerShell `Expand-Archive`. No third party archive library, so `npm audit` stays clean.

Nothing is bundled into the installer. They live in `%APPDATA%/Yoink/bin` and update independently via **Settings → Update tools**, which matters because a stale yt-dlp is the single most common cause of a broken download.

---

## Quality

The defaults aim for maximum quality with no unnecessary re-encoding.

- **Video** uses `bv*+ba/b` with a `-S` sort on resolution, fps, HDR, then codec. Merging into MKV is the default because MKV accepts every stream combination, so nothing gets transcoded. Pick MP4 if you need broader device support; it remuxes rather than re-encodes wherever possible.
- **Audio → Original** keeps the source codec exactly as delivered. Opus in, Opus out, no generation loss.
- MP3 and FLAC re-encode from a lossy source. FLAC from YouTube is a bigger file containing the same lossy audio, not better sound. The UI says so inline.

---

## Spotify

Yoink does not decrypt Spotify audio and will not. That is DRM circumvention, which is a genuinely different thing legally from downloading a public URL.

What it does instead is the same approach spotDL uses:

1. Reads track, album and playlist metadata via Spotify's Web API.
2. Searches YouTube Music for each track.
3. Scores candidates on title overlap, artist match, duration delta (within 2 seconds scores highest), and whether the channel is an auto-generated `- Topic` artist channel.
4. Downloads the winner and writes the Spotify tags onto it.

Anything scoring below the confidence floor is reported as unmatched rather than silently downloading a remix.

### Setup

Spotify's February 2026 Developer Mode changes made shared Client IDs unusable: each one is capped to a handful of authorised users and distributing one publicly gets it revoked. So you bring your own.

1. Create an app at [developer.spotify.com/dashboard](https://developer.spotify.com/dashboard)
2. Redirect URI: `http://127.0.0.1:8888/callback`
3. Add your own account to the app's user allowlist
4. Paste the Client ID into Settings and connect

Auth is Authorization Code + PKCE, not Client Credentials, since Spotify has been moving metadata endpoints off the latter. Playlist reads use `/playlists/{id}/items`; the old `/tracks` endpoint returns 403 after the March 2026 migration.

---

## Not supported

DRM-protected streaming: Netflix, Disney+, Prime Video, Apple Music, Spotify audio itself. Those streams are encrypted, and stripping that protection is a different category of thing from downloading a public URL. Not a technical limitation, a deliberate boundary.

---

## Features

**Queue** — parallel downloads, live speed and ETA, cancel mid-flight (kills the whole process tree so FFmpeg does not linger), retry, per-job log.

**Input** — multiple links at once, one per line. Ctrl+L focuses the input. Optional clipboard watching drops copied links straight in.

**Clip** — grab only part of a video with `--download-sections`, keyframe-accurate.

**Extras** — embed thumbnail, metadata, chapters and subtitles. Sidecar `.srt` files. SponsorBlock segment removal. Split by chapter. Download archive so re-running a playlist skips what you already have.

**Access** — cookies from Chrome, Firefox, Edge, Brave, Opera or Vivaldi, or a `cookies.txt` file, for age-restricted and subscriber-only content you have access to.

**Network** — parallel fragments, speed limit, proxy, force IPv4.

---

## Shortcuts

| Key | Action |
|---|---|
| `Ctrl` `L` | Focus the link input |
| `Enter` | Queue everything in the input |
| `Shift` `Enter` | New line |

---

## Structure

```
src/
├── main/
│   ├── index.js      app lifecycle, window, IPC surface
│   ├── binaries.js   fetches and updates yt-dlp, FFmpeg, Deno
│   ├── ytdlp.js      argument construction, spawning, progress parsing
│   ├── queue.js      concurrency, cancel, retry
│   ├── spotify.js    PKCE auth, metadata, YouTube Music matching
│   └── settings.js   persisted config
├── preload/          contextBridge, no node in the renderer
└── renderer/         React 19, Tailwind 4, zustand
```

Two implementation notes worth knowing if you extend it:

- Progress uses a **pipe-delimited** `--progress-template`, not JSON. A template full of braces and quotes gets mangled by Windows argument escaping; pipes survive it.
- Cancel uses `taskkill /T /F` on the process tree. Killing just yt-dlp leaves FFmpeg running and holding the output file.

---

## Legal

Downloading is your responsibility. Public content you have a right to access is one thing; redistributing copyrighted material is another. Respect the terms of the sites you use.

GPL-3.0, matching yt-dlp's license.
