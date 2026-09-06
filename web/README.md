# Yoink Web

A small self-hosted web front end for yt-dlp. One Node file, no dependencies, no build step.

Paste a link on your phone, download the file when it is done.

---

## Read this before deploying it publicly

Do not run this as an open service on the internet. Two reasons, both practical:

**It will stop working.** Datacenter IPs get flagged by YouTube quickly, and a public instance cannot fall back on browser cookies to recover. This is exactly why public downloader sites break constantly.

**You become the operator.** Running a service that downloads content for strangers is a different position from running a tool on your own machine.

Self-hosted on hardware you own, reachable over Tailscale or behind your own reverse proxy, has neither problem. Your IP, your cookies, your traffic.

---

## Run it

```bash
cd web
echo "YOINK_TOKEN=$(openssl rand -hex 24)" > .env
docker compose up -d --build
```

It listens on `127.0.0.1:8080`, so nothing reaches it except through your reverse proxy.

Without Docker:

```bash
YOINK_TOKEN=something-long node server.mjs
```

You need `yt-dlp`, `ffmpeg` and `deno` on PATH.

## Behind Caddy

`Caddyfile.snippet` has a working block. The important line is:

```
flush_interval -1
```

Without it Caddy buffers the response and the live progress stream never arrives, so downloads look frozen until they finish.

## Configuration

| Variable | Default | Notes |
|---|---|---|
| `YOINK_TOKEN` | none | Leave unset and the instance is open. Always set it. |
| `PORT` | 8080 | |
| `DOWNLOAD_DIR` | `/downloads` | |
| `CONCURRENCY` | 2 | Two is right for a Pi. |
| `RETENTION_HOURS` | 12 | Finished files are deleted after this. |
| `COOKIES_FILE` | none | Netscape `cookies.txt`. Lets the server reach content your account can see. |

## Cookies

Optional, and the single biggest quality upgrade. Without cookies the server is an anonymous visitor and YouTube treats it accordingly. With them it can fetch age-restricted and members-only content your account has access to, and bot checks largely stop.

Export a `cookies.txt` from a browser extension, mount it read-only, and point `COOKIES_FILE` at it. Export from a private window and then close it without logging out: logging out invalidates the session server-side and kills the exported file with it.

## Notes

- Progress streams over Server-Sent Events. A comment is sent every 25 seconds because proxies drop idle streams.
- Video is merged to MP4 rather than MKV, since browsers handle MP4 far better on the download step.
- The container runs as an unprivileged user and is capped at 768 MB so one runaway encode cannot take the Pi down.
- Downloads land under a UUID directory, and `/api/file/:id` resolves the path and confirms containment before serving.

## Running work in the visitor's browser

The page has two halves, split by what browsers are actually allowed to do.

**Compress and convert runs entirely client-side.** ffmpeg.wasm does the encoding on the visitor's own machine. The file is never uploaded, the server spends no CPU and stores nothing, and the work scales with however many people are using it. Same target-size logic as the desktop app, including dropping resolution when the bitrate gets too low to look good.

**Downloading cannot.** Not "hard", not "needs a workaround" — browsers forbid it. Media hosts like googlevideo do not send `Access-Control-Allow-Origin`, so page JavaScript is blocked from fetching the stream even if it knew the URL. That is a security boundary, so the fetch stays on the server.

The encoder is about 32 MB and loads on first use, then stays cached.

### Threaded encoding

By default the single-threaded core is used, which needs no special headers and works everywhere.

Set `CROSS_ORIGIN_ISOLATED=1` for roughly 3-5x faster encoding. It enables `SharedArrayBuffer` by sending:

```
Cross-Origin-Opener-Policy: same-origin
Cross-Origin-Embedder-Policy: require-corp
```

The catch is that `require-corp` blocks any third-party resource that does not send `Cross-Origin-Resource-Policy`. Nothing external is loaded here, so it is safe, but it is opt-in because it is a page-breaking failure elsewhere if you add a CDN font later.

ffmpeg.wasm is vendored at build time rather than pulled from a CDN, because under COEP a cross-origin script is blocked unless it sends CORP, and the public CDNs do not. Versions are pinned so builds are reproducible.

Without Docker, run `./fetch-vendor.sh` once first.

## What it does not do

No Spotify matching, no local file compression or conversion, no playlist expansion. Those live in the desktop app, which has a real UI and your browser's cookies. This is the paste-a-link-from-your-phone case, kept small on purpose.
