import React, { useEffect, useState } from 'react'
import {
  FolderOpen,
  ArrowClockwise,
  SpotifyLogo,
  ArrowSquareOut,
  CheckCircle,
  WarningCircle
} from '@phosphor-icons/react'
import { Button, Input, Select, Toggle, Field, Row, SectionTitle } from './ui/Primitives.jsx'
import { useStore } from '../store.js'

const api = window.yoink

const COOKIE_SOURCES = [
  { value: 'none', label: 'None' },
  { value: 'chrome', label: 'Chrome' },
  { value: 'firefox', label: 'Firefox' },
  { value: 'edge', label: 'Edge' },
  { value: 'brave', label: 'Brave' },
  { value: 'opera', label: 'Opera' },
  { value: 'vivaldi', label: 'Vivaldi' },
  { value: 'file', label: 'cookies.txt file' }
]

const CODECS = [
  { value: 'any', label: 'Whatever is highest quality' },
  { value: 'av1', label: 'Prefer AV1 (smallest files)' },
  { value: 'vp9', label: 'Prefer VP9' },
  { value: 'h264', label: 'Prefer H.264 (most compatible)' }
]

function PathField({ label, value, onChange, hint }) {
  return (
    <Field label={label} hint={hint}>
      <div className="flex gap-2">
        <Input value={value} onChange={(e) => onChange(e.target.value)} spellCheck={false} />
        <Button
          variant="outline"
          onClick={async () => {
            const res = await api.pickFolder(value)
            if (res.ok && res.data) onChange(res.data)
          }}
          title="Browse"
        >
          <FolderOpen size={15} />
        </Button>
      </div>
    </Field>
  )
}

function Panel({ children }) {
  return <section className="border-b border-surface0 px-6 py-6">{children}</section>
}

export default function Settings() {
  const { settings, saveSettings, resetSettings, bins, caps, runSetup, setup, spotify, setSpotify, toast } =
    useStore()
  const [info, setInfo] = useState(null)
  const s = settings
  const set = (patch) => saveSettings(patch)

  useEffect(() => {
    api.appInfo().then((r) => r.ok && setInfo(r.data))
  }, [])

  async function connectSpotify() {
    if (!s.spotifyClientId) {
      toast('Paste your Client ID first', 'error')
      return
    }
    const res = await api.spotify.connect()
    if (res.ok) {
      setSpotify({ connected: true })
      toast('Spotify connected', 'ok')
    } else {
      toast('Spotify connection failed', 'error', res.error)
    }
  }

  return (
    <div className="h-full overflow-y-auto">
      <Panel>
        <SectionTitle note="Where files land">Output</SectionTitle>
        <div className="grid gap-4">
          <Row>
            <PathField label="Video folder" value={s.downloadDir} onChange={(v) => set({ downloadDir: v })} />
            <PathField label="Audio folder" value={s.audioDir} onChange={(v) => set({ audioDir: v })} />
          </Row>
          <Row>
            <Field
              label="Filename template"
              hint="yt-dlp output template. %(title)s, %(id)s, %(uploader)s, %(upload_date)s."
            >
              <Input
                value={s.outputTemplate}
                spellCheck={false}
                onChange={(e) => set({ outputTemplate: e.target.value })}
              />
            </Field>
            <Field label="Playlist template" hint="Used when a link expands to multiple items.">
              <Input
                value={s.playlistTemplate}
                spellCheck={false}
                onChange={(e) => set({ playlistTemplate: e.target.value })}
              />
            </Field>
          </Row>
          <Toggle
            checked={s.restrictFilenames}
            onChange={(v) => set({ restrictFilenames: v })}
            label="Restrict filenames to ASCII"
            hint="Safer for external drives, NAS shares and older players."
          />
          <Toggle
            checked={s.keepArchive}
            onChange={(v) => set({ keepArchive: v })}
            label="Keep a download archive"
            hint="Records what has been fetched so re-running a playlist skips existing files."
          />
        </div>
      </Panel>

      <Panel>
        <SectionTitle note="Defaults for new downloads">Quality</SectionTitle>
        <div className="grid gap-4">
          <Row>
            <Field label="Video codec preference" hint="Only applies when several codecs exist at the same resolution.">
              <Select
                value={s.preferCodec}
                onChange={(e) => set({ preferCodec: e.target.value })}
                options={CODECS}
              />
            </Field>
            <Field
              label="Audio quality"
              hint="0 is best. Ignored when the format is set to Original."
            >
              <Input
                value={s.audioBitrate}
                onChange={(e) => set({ audioBitrate: e.target.value })}
                placeholder="0"
              />
            </Field>
          </Row>
          <div className="grid gap-1 sm:grid-cols-2">
            <Toggle checked={s.embedThumbnail} onChange={(v) => set({ embedThumbnail: v })} label="Embed thumbnail" />
            <Toggle checked={s.embedMetadata} onChange={(v) => set({ embedMetadata: v })} label="Embed metadata" />
            <Toggle checked={s.embedChapters} onChange={(v) => set({ embedChapters: v })} label="Embed chapters" />
            <Toggle checked={s.splitChapters} onChange={(v) => set({ splitChapters: v })} label="Split by chapter" />
            <Toggle checked={s.embedSubs} onChange={(v) => set({ embedSubs: v })} label="Embed subtitles" />
            <Toggle checked={s.writeSubs} onChange={(v) => set({ writeSubs: v })} label="Save .srt sidecar files" />
            <Toggle checked={s.writeThumbnail} onChange={(v) => set({ writeThumbnail: v })} label="Save thumbnail file" />
            <Toggle
              checked={s.sponsorblock}
              onChange={(v) => set({ sponsorblock: v })}
              label="Cut sponsor segments"
              hint="Uses the SponsorBlock database."
            />
          </div>
          {(s.embedSubs || s.writeSubs) && (
            <Field label="Subtitle languages" hint="Comma separated. Regex allowed, for example en.*,nl">
              <Input value={s.subLangs} onChange={(e) => set({ subLangs: e.target.value })} />
            </Field>
          )}
          {s.sponsorblock && (
            <Field label="SponsorBlock categories">
              <Input
                value={s.sponsorblockCategories}
                onChange={(e) => set({ sponsorblockCategories: e.target.value })}
              />
            </Field>
          )}
        </div>
      </Panel>

      <Panel>
        <SectionTitle note="Speed and access">Network</SectionTitle>
        <div className="grid gap-4">
          <Row>
            <Field label="Parallel downloads" hint="How many items run at once.">
              <Input
                type="number"
                min={1}
                max={10}
                value={s.concurrency}
                onChange={(e) => set({ concurrency: Number(e.target.value) })}
              />
            </Field>
            <Field label="Fragments per download" hint="Higher saturates a fast line. 4 to 8 is sensible.">
              <Input
                type="number"
                min={1}
                max={16}
                value={s.fragments}
                onChange={(e) => set({ fragments: Number(e.target.value) })}
              />
            </Field>
          </Row>
          <Row>
            <Field label="Speed limit" hint="Blank for unlimited. Accepts values like 5M or 800K.">
              <Input
                value={s.rateLimit}
                placeholder="unlimited"
                onChange={(e) => set({ rateLimit: e.target.value })}
              />
            </Field>
            <Field label="Proxy" hint="Optional. socks5://127.0.0.1:1080 or an http proxy.">
              <Input value={s.proxy} placeholder="none" onChange={(e) => set({ proxy: e.target.value })} />
            </Field>
          </Row>
          <Row>
            <Field
              label="Cookies"
              hint="Needed for age restricted, private or subscriber only content you have access to."
            >
              <Select
                value={s.cookiesFrom}
                onChange={(e) => set({ cookiesFrom: e.target.value })}
                options={COOKIE_SOURCES}
              />
            </Field>
            {s.cookiesFrom === 'file' && (
              <Field label="cookies.txt path">
                <div className="flex gap-2">
                  <Input value={s.cookiesFile} onChange={(e) => set({ cookiesFile: e.target.value })} />
                  <Button
                    variant="outline"
                    onClick={async () => {
                      const res = await api.pickFile([{ name: 'Cookies', extensions: ['txt'] }])
                      if (res.ok && res.data) set({ cookiesFile: res.data })
                    }}
                  >
                    <FolderOpen size={15} />
                  </Button>
                </div>
              </Field>
            )}
          </Row>
          <Toggle checked={s.forceIpv4} onChange={(v) => set({ forceIpv4: v })} label="Force IPv4" hint="Fixes some ISP and VPN routing issues." />
        </div>
      </Panel>

      <Panel>
        <SectionTitle note="Metadata only">Spotify</SectionTitle>
        <p className="mb-4 max-w-[70ch] text-[13px] leading-relaxed text-overlay1">
          Yoink does not decrypt Spotify audio. It reads track, album and playlist metadata through
          Spotify's own API, then finds the matching recording on YouTube Music and downloads that.
          Since Spotify's February 2026 developer changes, a shared Client ID is no longer allowed,
          so you need your own. It takes about a minute and is free.
        </p>

        <ol className="mb-4 max-w-[70ch] list-decimal space-y-1 pl-5 text-[13px] text-overlay1">
          <li>Create an app in the Spotify developer dashboard.</li>
          <li>
            Set the redirect URI to{' '}
            <code className="rounded bg-crust px-1.5 py-0.5 font-mono text-[12px] text-green">
              http://127.0.0.1:8888/callback
            </code>
          </li>
          <li>Add your own Spotify account to the app's user allowlist.</li>
          <li>Paste the Client ID below and connect.</li>
        </ol>

        <Button
          variant="ghost"
          size="sm"
          className="mb-4 -ml-2"
          onClick={() => api.openExternal('https://developer.spotify.com/dashboard')}
        >
          Open the dashboard <ArrowSquareOut size={13} />
        </Button>

        <Row>
          <Field label="Client ID">
            <Input
              value={s.spotifyClientId}
              spellCheck={false}
              placeholder="32 character id"
              onChange={(e) => set({ spotifyClientId: e.target.value.trim() })}
            />
          </Field>
          <Field label="Match candidates" hint="How many YouTube results to rank per track.">
            <Input
              type="number"
              min={3}
              max={10}
              value={s.spotifyMatchCandidates}
              onChange={(e) => set({ spotifyMatchCandidates: Number(e.target.value) })}
            />
          </Field>
        </Row>

        <div className="mt-4 flex items-center gap-3">
          <Button variant={spotify.connected ? 'outline' : 'primary'} onClick={connectSpotify}>
            <SpotifyLogo size={15} weight="fill" />
            {spotify.connected ? 'Reconnect' : 'Connect Spotify'}
          </Button>
          {spotify.connected && (
            <span className="flex items-center gap-1.5 text-[13px] text-green">
              <CheckCircle size={15} weight="fill" /> Connected
            </span>
          )}
        </div>
      </Panel>

      <Panel>
        <SectionTitle note="Fetched on first run, updated on demand">Toolchain</SectionTitle>
        <p className="mb-4 max-w-[70ch] text-[13px] leading-relaxed text-overlay1">
          Sites break extractors constantly, so keep yt-dlp fresh. Deno is required by yt-dlp to
          solve YouTube's JavaScript challenges. Without it, YouTube downloads lose their best
          formats or fail outright.
        </p>

        <div className="mb-4 divide-y divide-surface0/70 rounded-lg border border-surface0">
          {bins.map((b) => {
            const live = setup.items[b.key]
            return (
              <div key={b.key} className="flex items-center gap-3 px-4 py-3">
                {b.installed ? (
                  <CheckCircle size={16} weight="fill" className="text-green" />
                ) : (
                  <WarningCircle size={16} weight="fill" className="text-peach" />
                )}
                <span className="w-24 text-[13px] font-medium text-subtext1">{b.label}</span>
                <span className="tabular flex-1 text-overlay0">
                  {live?.phase === 'downloading'
                    ? `Downloading ${Math.round((live.progress || 0) * 100)}%`
                    : b.version || (b.installed ? 'installed' : 'not installed')}
                </span>
                {b.key === 'ytdlp' && caps?.version && (
                  <span className="tabular text-overlay0">{caps.version}</span>
                )}
              </div>
            )
          })}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button variant="solid" onClick={() => runSetup(true)} disabled={setup.active}>
            <ArrowClockwise size={15} className={setup.active ? 'animate-spin' : ''} />
            {setup.active ? 'Updating' : 'Update tools'}
          </Button>
          {info && (
            <Button variant="ghost" onClick={() => api.openFolder(info.binDir)}>
              Open tools folder
            </Button>
          )}
        </div>
      </Panel>

      <Panel>
        <SectionTitle>App</SectionTitle>
        <div className="grid gap-1 sm:grid-cols-2">
          <Toggle
            checked={s.notifyOnComplete}
            onChange={(v) => set({ notifyOnComplete: v })}
            label="Notify when a download finishes"
          />
          <Toggle
            checked={s.clipboardWatch}
            onChange={(v) => set({ clipboardWatch: v })}
            label="Watch the clipboard"
            hint="Copied links get dropped into the input automatically."
          />
        </div>

        <div className="mt-6 flex items-center justify-between gap-4">
          {info && (
            <span className="tabular text-overlay0">
              Yoink {info.version} / Electron {info.electron}
            </span>
          )}
          <Button variant="danger" size="sm" onClick={resetSettings}>
            Restore defaults
          </Button>
        </div>
      </Panel>
    </div>
  )
}
