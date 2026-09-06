# Debian rather than Alpine on purpose: Deno ships glibc binaries only, and
# yt-dlp needs Deno for full YouTube support. Alpine's musl would break it.
FROM node:22-bookworm-slim

ARG TARGETARCH
RUN apt-get update && apt-get install -y --no-install-recommends \
      ffmpeg ca-certificates curl unzip \
    && rm -rf /var/lib/apt/lists/*

# yt-dlp and Deno are fetched at build time, pinned to the architecture the
# image is being built for so the same Dockerfile works on a Pi and a laptop.
RUN set -eux; \
    case "${TARGETARCH}" in \
      arm64) YTDLP=yt-dlp_linux_aarch64; DENO=deno-aarch64-unknown-linux-gnu.zip ;; \
      amd64) YTDLP=yt-dlp_linux;         DENO=deno-x86_64-unknown-linux-gnu.zip ;; \
      *) echo "unsupported arch ${TARGETARCH}" >&2; exit 1 ;; \
    esac; \
    curl -fsSL -o /usr/local/bin/yt-dlp \
      "https://github.com/yt-dlp/yt-dlp/releases/latest/download/${YTDLP}"; \
    chmod +x /usr/local/bin/yt-dlp; \
    curl -fsSL -o /tmp/deno.zip \
      "https://github.com/denoland/deno/releases/latest/download/${DENO}"; \
    unzip -q /tmp/deno.zip -d /usr/local/bin; \
    chmod +x /usr/local/bin/deno; \
    rm /tmp/deno.zip; \
    yt-dlp --version; deno --version

# ffmpeg.wasm is vendored at build time rather than pulled from a CDN at
# runtime. Under COEP a cross-origin script is blocked unless it sends CORP,
# and the public CDNs do not, so self-hosting is the only arrangement that
# works whether or not cross-origin isolation is enabled. Versions are pinned
# so a build is reproducible.
ARG FFMPEG_WASM=0.12.15
ARG FFMPEG_CORE=0.12.10
RUN set -eux; \
    mkdir -p /vendor; \
    curl -fsSL -o /vendor/ffmpeg.js \
      "https://unpkg.com/@ffmpeg/ffmpeg@${FFMPEG_WASM}/dist/umd/ffmpeg.js"; \
    curl -fsSL -o /vendor/ffmpeg-core.js \
      "https://unpkg.com/@ffmpeg/core@${FFMPEG_CORE}/dist/umd/ffmpeg-core.js"; \
    curl -fsSL -o /vendor/ffmpeg-core.wasm \
      "https://unpkg.com/@ffmpeg/core@${FFMPEG_CORE}/dist/umd/ffmpeg-core.wasm"; \
    ls -la /vendor

WORKDIR /app
COPY server.mjs ./
COPY public ./public
RUN mkdir -p public/vendor && cp /vendor/* public/vendor/

# Runs unprivileged. The node image already provides this user.
RUN mkdir -p /downloads && chown -R node:node /downloads /app
USER node

ENV PORT=8080 HOST=0.0.0.0 DOWNLOAD_DIR=/downloads
EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s \
  CMD node -e "fetch('http://127.0.0.1:8080/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "server.mjs"]
