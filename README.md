# Yoink

A fast, good-looking downloader for Windows. Paste a link, get the highest quality file the source actually has.

Built on yt-dlp, so it reaches roughly 1800 sites: YouTube, TikTok, Instagram, X, Reddit, Twitch, SoundCloud, Bandcamp, Vimeo, Dailymotion, Bilibili and a long tail of everything else. Spotify links work through metadata matching (see below).

Neutral greyscale, one green accent, dense single-window layout.

---

## Just want the app?

Grab the latest exe from [Releases](https://github.com/Lucio73-collab/yoink/releases). No Node, no build step.

- **`Yoink-x.y.z-portable.exe`** — single file, no install, run it anywhere
- **`Yoink-x.y.z-setup.exe`** — installer, Start menu entry, auto-updates

Windows will show **"Windows protected your PC"** because the exe is not code-signed. Click **More info**, then **Run anyway**. Signing costs a few hundred dollars a year, which is not worth it for a free tool.

First launch downloads yt-dlp, FFmpeg and Deno (~120 MB, once).

---

## Building it yourself

```bash
npm install
npm run dev
```

To produce the exes locally:

```bash
npm run dist
```

They land in `release/`.

### A note on npm 12

npm 12 blocks dependency install scripts by default, which is a good change: install scripts are arbitrary code from strangers running at install time. But Electron ships its ~100 MB runtime through its own postinstall, so when that is blocked you get `Error: Electron uninstall`.

`scripts/ensure-electron.mjs` runs as this project's own postinstall and fetches the runtime if it is missing. It is idempotent, so it costs nothing on repeat installs or in CI. If it ever cannot run, the manual fix is:

```bash
node node_modules/electron/install.js
```

### Releasing

Push a tag and GitHub Actions does the rest.

```bash
git tag v1.1.0
git push origin v1.1.0
```

electron-builder owns publishing, because it is the only step that generates `latest.yml`, which is what installed copies read to find new versions.

---

## Why it fetches three binaries

| Tool | Why |
|---|---|
| **yt-dlp** | The extractor. Ships fixes almost daily as sites break things. |
| **FFmpeg** | Merges streams, remuxes, extracts audio, embeds tags. Yoink pulls yt-dlp's *patched* build rather than a vanilla one: upstream FFmpeg mishandles merging some YouTube format pairs and fails with `Postprocessing: Conversion failed!`. |
| **Deno** | Since yt-dlp 2025.11.12, an external JavaScript runtime is required for full YouTube support, and only deno is enabled by default. Without it, YouTube loses its best formats or fails outright. |

Nothing is bundled into the installer. They live in `%APPDATA%/Yoink/bin` and update independently. A yt-dlp frozen inside a release goes stale within weeks, so the app repairs itself instead of needing a new release every time a site changes something.

yt-dlp is refreshed automatically once a day in the background. There is a manual **Update tools** button in Settings, and a toggle to turn the automatic check off.

Archives are unpacked with Windows' built-in `tar.exe`, falling back to PowerShell `Expand-Archive`. No third party archive library, so `npm audit` stays clean.

---

## Quality

Defaults aim for maximum quality with no unnecessary re-encoding.

- **Video** uses `bv*+ba/b` with a `-S` sort on resolution, fps, HDR, then codec. Merging into MKV is the default because MKV accepts every stream combination, so nothing gets transcoded. Pick MP4 if you need broader device support; it remuxes rather than re-encodes wherever possible.
- **Audio → Original** keeps the source codec exactly as delivered. Opus in, Opus out, no generation loss.
- MP3 and FLAC re-encode from a lossy source. FLAC from YouTube is a bigger file containing the same lossy audio, not better sound. The UI says so inline.

---

## Playlists

A playlist expands into individual jobs that fold into one collapsible row, showing combined progress, a `12/50` count, aggregate speed and any failures. Collapsed by default, because fifty expanded rows is exactly the clutter it exists to prevent.

Each item retries independently, so one dead video does not take the batch with it. The index is baked into the filename template, since `--no-playlist` means yt-dlp cannot supply `%(playlist_index)s` itself.

There is a toggle in **Settings → Output** to download a playlist as a single job instead. Faster, but all-or-nothing.

---

## Notifications

A Spotify playlist finishes tracks in bursts, and one toast per track is unusable. Completions are batched by three limits working together:

- **Quiet for 3.5s** → fires, so a single download still feels instant
- **20s max hold** → fires during a long steady stream, which would otherwise reset the debounce forever and never notify at all
- **25 max batch** → fires early on a huge burst so the count stays meaningful

One download shows its title. A batch shows the count, and names the collection if they all came from one.

---

## Spotify

Yoink does not decrypt Spotify audio and will not. That is DRM circumvention, which is genuinely different legally from downloading a public URL.

What it does instead is the same approach spotDL uses:

1. Reads track, album and playlist metadata via Spotify's Web API.
2. Searches YouTube Music for each track.
3. Scores candidates on title overlap, artist match, duration delta (within 2 seconds scores highest), and whether the channel is an auto-generated `- Topic` artist channel.
4. Downloads the winner and writes the Spotify tags onto it.

Anything below the confidence floor is reported as unmatched rather than silently handing you a remix.

### Setup

Spotify's February 2026 Developer Mode changes made shared Client IDs unusable: each is capped to a handful of authorised users, and distributing one publicly gets it revoked. So you bring your own.

1. Create an app at [developer.spotify.com/dashboard](https://developer.spotify.com/dashboard)
2. Redirect URI: `http://127.0.0.1:8888/callback`
3. Add your own account to the app's user allowlist
4. Paste the Client ID into Settings and connect

Auth is Authorization Code + PKCE, not Client Credentials, since Spotify has been moving metadata endpoints off the latter. Playlist reads use `/playlists/{id}/items`; the old `/tracks` endpoint returns 403 after the March 2026 migration.

Spotify requires an exact redirect URI, so port 8888 cannot float. Yoink tracks its own callback server and reclaims the port if you abandon a login halfway, rather than colliding with itself.

---

## Not supported

DRM-protected streaming: Netflix, Disney+, Prime Video, Apple Music, Spotify audio itself. Those streams are encrypted, and stripping that protection is a different category of thing from downloading a public URL. Not a technical limitation, a deliberate boundary.

---

## Features

**Queue** — parallel downloads, live speed and ETA, a throughput graph that draws itself from real aggregate speed, cancel mid-flight (kills the whole process tree so FFmpeg does not linger), retry, per-job log.

**Input** — multiple links at once, one per line. `Ctrl` `L` focuses the input. Optional clipboard watching drops copied links straight in, including `spotify:` URIs.

**Clip** — grab only part of a video with `--download-sections`, keyframe-accurate.

**Extras** — embed thumbnail, metadata, chapters and subtitles. Sidecar `.srt` files. SponsorBlock segment removal. Split by chapter. Download archive so re-running a playlist skips what you already have.

**Access** — cookies from Chrome, Firefox, Edge, Brave, Opera or Vivaldi, or a `cookies.txt` file, for age-restricted and subscriber-only content you have access to.

**Network** — parallel fragments, speed limit, proxy, retries, force IPv4.

---

## Shortcuts

| Key | Action |
|---|---|
| `Ctrl` `L` | Focus the link input |
| `Enter` | Queue everything in the input |
| `Shift` `Enter` | New line |
| `Esc` | Close settings |

---

## Structure

```
src/
├── main/
│   ├── index.js      app lifecycle, window, IPC, notification batching
│   ├── binaries.js   fetches and updates yt-dlp, FFmpeg, Deno
│   ├── ytdlp.js      argument construction, spawning, progress parsing
│   ├── queue.js      concurrency, cancel, retry, grouping
│   ├── spotify.js    PKCE auth, metadata, YouTube Music matching
│   ├── updater.js    app auto-update, disabled for portable builds
│   └── settings.js   persisted config
├── preload/          contextBridge, no node in the renderer
└── renderer/         React 19, Tailwind 4, motion, zustand
```

Implementation notes worth knowing if you extend it:

- Progress uses a **pipe-delimited** `--progress-template`, not JSON. A template full of braces and quotes gets mangled by Windows argument escaping; pipes survive it.
- Cancel uses `taskkill /T /F` on the process tree. Killing just yt-dlp leaves FFmpeg running and holding the output file.
- yt-dlp runs with `--verbose` so postprocessor failures carry real FFmpeg output. Log lines are buffered and flushed every 250ms, because emitting each line as its own IPC message re-renders the UI hundreds of times per download.
- The clipboard watcher coerces and try/catches every read. `clipboard.readText()` is documented as returning a string but can hand back `undefined` on Windows when the clipboard holds image data or another process holds a lock, and an unguarded `.trim()` there takes down the whole main process.
- Auto-update is skipped for portable builds. They run from a temp extraction that is discarded on exit, so swapping files next to the executable is impossible.

---

## Legal

Downloading is your responsibility. Public content you have a right to access is one thing; redistributing copyrighted material is another. Respect the terms of the sites you use.

GPL-3.0, matching yt-dlp's license.
