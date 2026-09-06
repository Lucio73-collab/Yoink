<div align="center">

# Yoink

**A downloader for Windows.** Paste a link, get the highest quality file the source has.

[![Download](https://img.shields.io/github/v/release/Lucio73-collab/yoink?label=Download&style=for-the-badge&color=6ccb5f)](https://github.com/Lucio73-collab/yoink/releases/latest)
[![License](https://img.shields.io/badge/License-GPL--3.0-blue?style=for-the-badge)](LICENSE)

</div>

---

## Download

Grab the latest build from [Releases](https://github.com/Lucio73-collab/yoink/releases/latest).

| File | Use it if |
|---|---|
| `Yoink-x.y.z-setup.exe` | You want it installed, with a Start menu entry and automatic updates |
| `Yoink-x.y.z-portable.exe` | You want a single file you can run from anywhere |

Windows will show a SmartScreen warning on first run because the app is not code-signed. Click **More info**, then **Run anyway**.

First launch downloads yt-dlp, FFmpeg and Deno into `%APPDATA%/Yoink/bin`. About 120 MB, once.

---

## What it does

**Downloads** from YouTube, TikTok, Instagram, X, Reddit, Twitch, SoundCloud, Bandcamp, Vimeo and roughly 1800 other sites.

**Picks the best quality available** and merges without re-encoding. Audio can be extracted in its original codec with no quality loss, or converted to MP3, FLAC, Opus, M4A or WAV.

**Handles playlists** as a single collapsible group. Each item downloads, retries and fails independently.

**Reaches restricted content** using cookies from Chrome, Firefox, Edge, Brave, Opera or Vivaldi. Age-restricted, private and members-only videos work when your account has access.

**Recovers from failures** on its own. Bot checks, filename length limits, rate limiting and missing formats are detected and retried with the appropriate fix. Permanent failures stop immediately with a plain explanation.

**Compresses to a target size.** Drop in a video, pick 10, 25, 50, 100 or 500 MB, and get a file that fits. Resolution is reduced automatically when the bitrate would be too low to look good.

**Converts formats.** Drag any video or audio file onto the window for MP4, MKV, WebM, GIF, MP3, M4A, Opus, FLAC or WAV.

**Spotify links** are resolved through Spotify's API and matched to the corresponding recording on YouTube Music. See [Spotify setup](#spotify).

Also: trim to a timestamp range, SponsorBlock removal, embedded thumbnails, metadata, chapters and subtitles, download archives, proxy support, speed limits and clipboard watching.

---

## Keyboard

| Key | Action |
|---|---|
| `Ctrl` `L` | Focus the link box |
| `Enter` | Start downloading |
| `Shift` `Enter` | New line for multiple links |
| `Esc` | Close the current dialog |

---

## Spotify

Yoink reads Spotify metadata and downloads the matching audio from YouTube Music. It does not decrypt Spotify streams.

Spotify requires each user to supply their own API credentials. Setup takes about a minute:

1. Create an app at [developer.spotify.com/dashboard](https://developer.spotify.com/dashboard)
2. Set the redirect URI to `http://127.0.0.1:8888/callback`
3. Add your Spotify account to the app's user allowlist
4. Paste the Client ID into **Settings → Spotify** and connect

---

## Not supported

DRM-protected streaming services: Netflix, Disney+, Prime Video, Apple Music, and Spotify audio itself. These streams are encrypted and Yoink does not attempt to decrypt them.

---

## Web version

`web/` contains a self-hosted web interface for use from a phone or another machine. A single Node file with no dependencies, plus a Docker setup for ARM64 and amd64.

Compression and format conversion run in the visitor's browser through ffmpeg.wasm, so files are never uploaded and the server does no encoding work.

Intended for hardware you own, reachable over Tailscale or your own reverse proxy. See [web/README.md](web/README.md).

---

## Building from source

```bash
npm install
npm run dev      # development
npm run dist     # produces both exes in release/
```

Requires Node 22 or newer.

npm 12 blocks dependency install scripts by default, which prevents Electron from downloading its runtime. `scripts/ensure-electron.mjs` runs after install and fetches it if missing. If that ever fails:

```bash
node node_modules/electron/install.js
```

### Releasing

```bash
git tag v2.0.0
git push origin v2.0.0
```

GitHub Actions builds both installers and publishes them to Releases.

---

## Third-party tools

Downloaded at runtime, not bundled:

| Tool | Purpose | License |
|---|---|---|
| [yt-dlp](https://github.com/yt-dlp/yt-dlp) | Extraction and downloading | Unlicense |
| [FFmpeg](https://github.com/yt-dlp/FFmpeg-Builds) | Merging, conversion, metadata | GPL-3.0 |
| [Deno](https://github.com/denoland/deno) | JavaScript runtime required by yt-dlp for YouTube | MIT |

Keeping them outside the installer means yt-dlp can update independently, which matters because sites change frequently. Yoink checks for a new version once a day and there is a manual update button in **Settings → Toolchain**.

---

## License

GPL-3.0. See [LICENSE](LICENSE).

Downloading content is your responsibility. Respect the terms of the sites you use and the rights of the people who made what you are downloading.
