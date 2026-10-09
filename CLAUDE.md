# Yoink

Windows Electron downloader (electron-vite + React, Fluent UI) on top of yt-dlp, FFmpeg and Deno, which are downloaded at runtime into `%APPDATA%/Yoink/bin`. `web/` is a separate self-hosted web version.

## Commands
- Install: `npm install` (Node 22+; `scripts/ensure-electron.mjs` fetches the Electron runtime if npm skipped it)
- Dev: `npm run dev`
- Build: `npm run dist` (setup + portable exe in `release/`)
- Release: push a `v*` tag; `.github/workflows/build.yml` builds and uploads to Releases

## Layout
- `src/main/` main process: `ytdlp.js`, `queue.js`, `recovery.js` (auto-retry fixes), `media.js` (compress/convert), `spotify.js`, `updater.js`, `binaries.js`
- `src/preload/` bridge, `src/renderer/src/` React UI (`App.jsx`, `components/`, `store.js`)
- `web/` single-file Node server + Docker setup, `build/` app icons, `docs/assets/` README art

## Conventions
- GPL-3.0; third-party notices live in `NOTICE`
- Never bundle yt-dlp/FFmpeg/Deno in the installer; they update independently
- No DRM circumvention; no em dashes in docs; Conventional Commits

## Never
- Commit Spotify client IDs, cookies, or `release/` output
- Push tags or create releases without explicit confirmation
