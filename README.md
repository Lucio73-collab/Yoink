# Yoink

A fast, good-looking downloader for Windows. Paste a link, get the highest quality file the source actually has.

Built on yt-dlp, so it reaches roughly 1800 sites: YouTube, TikTok, Instagram, X, Reddit, Twitch, SoundCloud, Bandcamp, Vimeo, Dailymotion, Bilibili and a long tail of everything else. Spotify links work through metadata matching (see below).

Built to Microsoft's Fluent 2 / WinUI 3 design language, so it looks like it belongs on Windows rather than like a web page in a window.

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

## Compress and convert

Drop any video or audio file onto the window.

**Compress to a target size** does a two-pass x264 encode aimed at 10, 25, 50, 100 or 500 MB, labelled by which Discord tier each one matches.

The step most size-targeting tools skip: dividing size by duration produces technically correct bitrates that look terrible, because 1080p at 400 kbps is a smear. Yoink drops resolution so the available bits cover fewer pixels, and trims frame rate on long low-bitrate jobs. You see the plan before committing, and a target that genuinely cannot fit fails with an explanation instead of producing sludge.

**Convert** handles MP4, MKV, WebM, GIF, MP3, M4A, Opus, FLAC and WAV. MKV stream-copies, so it is instant and lossless. GIF uses two-stage palette generation, since a single-pass GIF falls back to a generic palette and looks visibly muddy.

Both run through the same queue as downloads, with the same progress, cancel and retry.

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
| `Esc` | Close settings or the drop panel |
| Drag a file in | Compress or convert it |

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
└── renderer/         React 19, Tailwind 4, zustand
```

Implementation notes worth knowing if you extend it:

- Progress uses a **pipe-delimited** `--progress-template`, not JSON. A template full of braces and quotes gets mangled by Windows argument escaping; pipes survive it.
- Cancel uses `taskkill /T /F` on the process tree. Killing just yt-dlp leaves FFmpeg running and holding the output file.
- yt-dlp runs with `--verbose` so postprocessor failures carry real FFmpeg output. Log lines are buffered and flushed every 250ms, because emitting each line as its own IPC message re-renders the UI hundreds of times per download.
- The clipboard watcher coerces and try/catches every read. `clipboard.readText()` is documented as returning a string but can hand back `undefined` on Windows when the clipboard holds image data or another process holds a lock, and an unguarded `.trim()` there takes down the whole main process.
- Auto-update is skipped for portable builds. They run from a temp extraction that is discarded on exit, so swapping files next to the executable is impossible.

---

## Design

The interface follows Fluent 2 / WinUI 3 rather than approximating it, because the gap between "looks like Windows" and "looks like it is imitating Windows" lives entirely in the exact values.

- **Segoe UI Variable**, which ships with Windows and carries separate optical sizes for captions, body text and headings. No downloaded display fonts.
- **4px corner radius on controls, 8px on cards and dialogs.** Rounder than that reads as a web app immediately.
- **Controls are white at low alpha over the background**, not solid greys. That layering is what makes Windows 11 surfaces feel native.
- **Real Rest, Hover and Pressed states** on every interactive element. A control that only responds to hover feels unfinished the moment it is clicked.
- **4px spacing grid** and the Fluent type ramp (12 / 14 / 16 / 20 / 28). No ad-hoc sizes.
- **Fluent NavigationView selection indicator**: a short vertical pill on the leading edge.
- **InfoBars** rather than custom toasts, matching how Windows surfaces status.

Using the system font instead of a downloaded display font removed five dependencies and cut the renderer bundle by a third.

### Motion

All of it is Fluent's own motion system, written natively. No animation library, no downloaded asset packs, nothing with a licence to track.

- **Reveal highlight** — a light follows the cursor across cards, buttons and nav items, brightening the nearest border. The most recognisable Fluent effect, and it costs two CSS custom properties updated on pointer move.
- **Acrylic** — dialogs blur and tint what is behind them rather than dimming it.
- **FLIP list transitions** — filtering the queue makes rows glide to their new positions instead of teleporting. About twenty lines using the Web Animations API; the library that does this weighs 350 kB.
- **ProgressRing** — the WinUI indeterminate spinner, an arc whose length grows and shrinks as it rotates.
- **Eased numbers** — download speed jumps around on every sample, so the readout glides toward each value. A snapping counter is genuinely harder to read.
- **Live pulse** — rows that are actually transferring breathe a faint accent border, so a busy queue is readable at a glance.
- **Staggered entrance**, capped so long lists do not crawl in.

Every one of these is skipped under `prefers-reduced-motion`, in both CSS and JavaScript.

**Performance rules the motion follows**, because a downloader is opened many times a day and lag is worse than no animation at all:

- **Eased numbers write to the DOM through a ref, never through state.** The obvious implementation calls setState every frame; with two readouts per row and twenty active downloads that is 2,400 React renders per second. Direct writes animate the same pixels at zero render cost.
- **Reveal is delegated to one document listener.** One per card meant a 300 item queue carried 300 listeners.
- **Only `transform` and `opacity` are animated.** The active-row pulse originally faded `border-color`, which repaints every frame; it now fades a pre-rendered ring's opacity and runs entirely on the GPU.
- **Pointer coordinates are throttled to one write per frame.**

---

## Web version

`web/` holds a small self-hosted web front end: one dependency-free Node file plus a single HTML page, about 24 KB of source total. Paste a link from your phone, download the file when it is ready.

It is meant for hardware you own, reachable over Tailscale or your own reverse proxy. A public instance would get its IP flagged by YouTube quickly and could not fall back on browser cookies, which is why public downloader sites break constantly.

Compression and format conversion run **entirely in the visitor's browser** via ffmpeg.wasm: nothing is uploaded and the server does no work. Downloading stays server-side because browsers forbid fetching from media hosts that do not send CORS headers, which is a security boundary rather than a limitation.

See `web/README.md`.

---

## Legal

Downloading is your responsibility. Public content you have a right to access is one thing; redistributing copyrighted material is another. Respect the terms of the sites you use.

GPL-3.0, matching yt-dlp's license.
