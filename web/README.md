# Yoink Web

A self-hosted web interface for downloading video and audio. One Node file, no dependencies, no build step.

Meant for hardware you own, reached over Tailscale or your own reverse proxy.

---

## Setup

```bash
cd web
echo "YOINK_TOKEN=$(openssl rand -hex 24)" > .env
docker compose up -d --build
```

Listens on `127.0.0.1:8080`. Add the block in `Caddyfile.snippet` to your Caddyfile to expose it.

Without Docker:

```bash
./fetch-vendor.sh
YOINK_TOKEN=your-token node server.mjs
```

Requires `yt-dlp`, `ffmpeg` and `deno` on PATH.

---

## Configuration

| Variable | Default | Description |
|---|---|---|
| `YOINK_TOKEN` | none | Access token. Without it the instance is open to anyone who can reach it. |
| `PORT` | `8080` | |
| `DOWNLOAD_DIR` | `/downloads` | |
| `CONCURRENCY` | `2` | Simultaneous downloads |
| `RETENTION_HOURS` | `12` | Completed files are deleted after this many hours |
| `COOKIES_FILE` | none | Path to a Netscape-format `cookies.txt` |
| `CROSS_ORIGIN_ISOLATED` | `0` | Set to `1` for multi-threaded in-browser encoding |

---

## Browser-side processing

Compression and format conversion run entirely on the visitor's machine through ffmpeg.wasm. Files are never uploaded and the server does no encoding.

Downloading stays server-side. Browsers block requests to media hosts that do not send CORS headers, so page JavaScript cannot fetch the streams.

The encoder is about 32 MB and loads on first use, then stays cached.

### Threaded encoding

The default single-threaded encoder works everywhere with no extra configuration.

`CROSS_ORIGIN_ISOLATED=1` enables the multi-threaded encoder, roughly 3 to 5 times faster. It sends:

```
Cross-Origin-Opener-Policy: same-origin
Cross-Origin-Embedder-Policy: require-corp
```

`require-corp` blocks third-party resources that do not send `Cross-Origin-Resource-Policy`. Nothing external is loaded here, but keep it in mind if you add anything later.

ffmpeg.wasm is served from the app rather than a CDN, with pinned versions.

---

## Reverse proxy

`flush_interval -1` is required in the Caddy block. Without it responses are buffered, the progress stream never arrives, and downloads appear frozen until they complete.

---

## Cookies

Optional, and the largest quality improvement available. With a `cookies.txt` mounted, the server can reach age-restricted and members-only content your account has access to, and bot checks largely stop.

Export from a private browsing window, then close it without logging out. Logging out invalidates the session and the exported file with it.

---

## Notes

- Progress is delivered over Server-Sent Events, with a keepalive every 25 seconds.
- Video is merged to MP4 rather than MKV for browser compatibility.
- The container runs unprivileged with a 768 MB memory limit.
- Files are stored under a UUID directory; download paths are resolved and checked for containment.

---

## Not included

Spotify matching and playlist expansion are desktop-only features.

---

## Security

Do not expose this publicly. Server IP addresses get rate-limited by video hosts quickly, and a public instance cannot fall back on browser cookies. Running it behind Tailscale or an authenticated reverse proxy avoids both problems.
