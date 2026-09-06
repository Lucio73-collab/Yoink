import React, { useEffect, useState } from 'react'
import { useStore } from '../store.js'
import { Button, TextBox, Dropdown, Toggle, InfoBar, Field, GroupLabel, SettingRow } from './ui/Fluent.jsx'

const api = window.yoink

function Glyph({ d, className = 'h-4 w-4' }) {
  return (
    <svg viewBox="0 0 16 16" className={className} fill="none" stroke="currentColor"
         strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round">
      <path d={d} />
    </svg>
  )
}

const PAGES = [
  { id: 'output',  label: 'Output',    icon: 'M2 4.5A1.5 1.5 0 013.5 3h2.2l1.3 1.5h5.5A1.5 1.5 0 0114 6v5.5A1.5 1.5 0 0112.5 13h-9A1.5 1.5 0 012 11.5z' },
  { id: 'quality', label: 'Quality',   icon: 'M3 11l3-3 2.5 2.5L13 5M3 3v10h10' },
  { id: 'network', label: 'Network',   icon: 'M8 14A6 6 0 108 2a6 6 0 000 12zM2 8h12M8 2c1.7 1.8 2.6 3.9 2.6 6S9.7 12.2 8 14c-1.7-1.8-2.6-3.9-2.6-6S6.3 3.8 8 2z' },
  { id: 'spotify', label: 'Spotify',   icon: 'M8 14A6 6 0 108 2a6 6 0 000 12zM5 6.5c2-.6 4.2-.4 6 .6M5.4 9c1.6-.5 3.4-.3 4.9.5M5.8 11.2c1.2-.4 2.6-.2 3.7.4' },
  { id: 'tools',   label: 'Toolchain', icon: 'M10.5 2a3.5 3.5 0 00-3.2 4.9L2.5 11.7a1.2 1.2 0 001.8 1.8l4.8-4.8A3.5 3.5 0 1010.5 2z' },
  { id: 'app',     label: 'General',   icon: 'M2.5 3.5h11v9h-11zM2.5 6h11' }
]

const COOKIES = [
  ['none', 'None'], ['chrome', 'Chrome'], ['firefox', 'Firefox'], ['edge', 'Edge'],
  ['brave', 'Brave'], ['opera', 'Opera'], ['vivaldi', 'Vivaldi'], ['file', 'cookies.txt file']
]
const CODECS = [
  ['any', 'Highest quality available'], ['av1', 'Prefer AV1 (smallest files)'],
  ['vp9', 'Prefer VP9'], ['h264', 'Prefer H.264 (most compatible)']
]
const CONTAINERS = [
  ['auto', 'MKV — never re-encodes'], ['mp4', 'MP4'], ['mkv', 'MKV'], ['webm', 'WebM']
]

function PathRow({ label, value, onChange }) {
  return (
    <Field label={label}>
      <div className="flex gap-2">
        <TextBox value={value} onChange={(e) => onChange(e.target.value)} />
        <Button appearance="standard" className="shrink-0 w-[36px] px-0" title="Browse"
          onClick={async () => {
            const r = await api.pickFolder(value)
            if (r.ok && r.data) onChange(r.data)
          }}>
          <Glyph d="M2 4.5A1.5 1.5 0 013.5 3h2.2l1.3 1.5h5.5A1.5 1.5 0 0114 6v5.5A1.5 1.5 0 0112.5 13h-9A1.5 1.5 0 012 11.5z" />
        </Button>
      </div>
    </Field>
  )
}

const Two = ({ children }) => <div className="grid gap-4 sm:grid-cols-2">{children}</div>

export default function SettingsModal({ onClose }) {
  const { settings: s, saveSettings, resetSettings, bins, caps, runSetup, setup, spotify, setSpotify, toast } = useStore()
  const [page, setPage] = useState('output')
  const [info, setInfo] = useState(null)
  const set = (patch) => saveSettings(patch)

  useEffect(() => { api.appInfo().then((r) => r.ok && setInfo(r.data)) }, [])
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  async function connectSpotify() {
    if (!s.spotifyClientId) return toast('Paste your Client ID first', 'error')
    const res = await api.spotify.connect()
    if (res.ok) { setSpotify({ connected: true }); toast('Spotify connected', 'ok') }
    else toast('Connection failed', 'error', res.error)
  }

  return (
    <div onClick={onClose} className="acrylic-scrim fixed inset-0 z-50 grid place-items-center p-8">
      <div onClick={(e) => e.stopPropagation()}
        className="flex h-full max-h-[620px] w-full max-w-[880px] flex-col overflow-hidden rounded-[8px]
                   border border-[var(--color-stroke-2)] acrylic enter-scale
                   shadow-[0_32px_64px_rgba(0,0,0,0.5)]">

        <div className="flex items-center justify-between border-b border-[var(--color-divider)] px-6 py-4">
          <h2 className="t-title text-[var(--color-ink)]">Settings</h2>
          <Button appearance="subtle" onClick={onClose} aria-label="Close" className="w-[36px] px-0">
            <Glyph d="M3.5 3.5l9 9M12.5 3.5l-9 9" />
          </Button>
        </div>

        <div className="flex min-h-0 flex-1">
          <div className="w-[196px] shrink-0 overflow-y-auto border-r border-[var(--color-divider)] p-2">
            {PAGES.map((p) => (
              <button key={p.id} onClick={() => setPage(p.id)} data-selected={page === p.id}
                className={`nav-item flex h-[36px] w-full items-center gap-3 rounded-[4px] pl-3 pr-2 text-left
                            transition-colors duration-100
                            ${page === p.id
                              ? 'bg-[var(--color-fill-rest)] text-[var(--color-ink)]'
                              : 'text-[var(--color-ink-2)] hover:bg-[var(--color-fill-subtle-hover)] hover:text-[var(--color-ink)]'}`}>
                <Glyph d={p.icon} />
                <span className="t-body">{p.label}</span>
              </button>
            ))}
          </div>

          <div className="min-w-0 flex-1 overflow-y-auto p-6">
            {page === 'output' && (
              <div className="flex flex-col gap-4">
                <GroupLabel>Folders</GroupLabel>
                <Two>
                  <PathRow label="Video" value={s.downloadDir} onChange={(v) => set({ downloadDir: v })} />
                  <PathRow label="Audio" value={s.audioDir} onChange={(v) => set({ audioDir: v })} />
                </Two>
                <GroupLabel>Filenames</GroupLabel>
                <Field label="Template" hint="%(title)s, %(id)s, %(uploader)s, %(upload_date)s">
                  <TextBox value={s.outputTemplate} onChange={(e) => set({ outputTemplate: e.target.value })} />
                </Field>
                <Field label="Playlist template" hint="Used when a link expands to multiple items.">
                  <TextBox value={s.playlistTemplate} onChange={(e) => set({ playlistTemplate: e.target.value })} />
                </Field>
                <GroupLabel>Behaviour</GroupLabel>
                <SettingRow label="Restrict filenames to ASCII"
                            hint="Safer for network shares and older players.">
                  <Toggle checked={s.restrictFilenames} onChange={(v) => set({ restrictFilenames: v })} label="" />
                </SettingRow>
                <SettingRow label="Keep a download archive"
                            hint="Re-running a playlist skips what you already have.">
                  <Toggle checked={s.keepArchive} onChange={(v) => set({ keepArchive: v })} label="" />
                </SettingRow>
                <SettingRow label="Expand playlists into a group"
                            hint="Each item gets its own progress and retry, folded into one row.">
                  <Toggle checked={s.expandPlaylists} onChange={(v) => set({ expandPlaylists: v })} label="" />
                </SettingRow>
              </div>
            )}

            {page === 'quality' && (
              <div className="flex flex-col gap-4">
                <GroupLabel>Video</GroupLabel>
                <Two>
                  <Field label="Container">
                    <Dropdown options={CONTAINERS} value={s.container}
                              onChange={(e) => set({ container: e.target.value })} />
                  </Field>
                  <Field label="Codec preference" hint="Applies when several exist at one resolution.">
                    <Dropdown options={CODECS} value={s.preferCodec}
                              onChange={(e) => set({ preferCodec: e.target.value })} />
                  </Field>
                </Two>
                <Field label="Audio quality" hint="0 is best, 10 is smallest. Ignored when the format is Original.">
                  <TextBox type="number" min={0} max={10} value={s.audioBitrate}
                           onChange={(e) => set({ audioBitrate: e.target.value })} className="w-[120px]" />
                </Field>

                <GroupLabel>Include</GroupLabel>
                <div className="flex flex-col gap-1.5">
                  {[
                    ['embedThumbnail', 'Embed thumbnail'],
                    ['embedMetadata', 'Embed metadata'],
                    ['embedChapters', 'Embed chapters'],
                    ['splitChapters', 'Split by chapter'],
                    ['embedSubs', 'Embed subtitles'],
                    ['writeSubs', 'Save .srt files'],
                    ['writeThumbnail', 'Save thumbnail file'],
                    ['sponsorblock', 'Remove sponsor segments']
                  ].map(([k, label]) => (
                    <SettingRow key={k} label={label}>
                      <Toggle checked={s[k]} onChange={(v) => set({ [k]: v })} label="" />
                    </SettingRow>
                  ))}
                </div>
                {(s.embedSubs || s.writeSubs) && (
                  <Field label="Subtitle languages" hint="Comma separated, regex allowed. en.*,nl">
                    <TextBox value={s.subLangs} onChange={(e) => set({ subLangs: e.target.value })} />
                  </Field>
                )}
                {s.sponsorblock && (
                  <Field label="SponsorBlock categories">
                    <TextBox value={s.sponsorblockCategories}
                             onChange={(e) => set({ sponsorblockCategories: e.target.value })} />
                  </Field>
                )}
              </div>
            )}

            {page === 'network' && (
              <div className="flex flex-col gap-4">
                <GroupLabel>Performance</GroupLabel>
                <Two>
                  <Field label="Parallel downloads">
                    <TextBox type="number" min={1} max={10} value={s.concurrency}
                             onChange={(e) => set({ concurrency: Number(e.target.value) })} />
                  </Field>
                  <Field label="Fragments per download" hint="4 to 8 saturates a fast connection.">
                    <TextBox type="number" min={1} max={16} value={s.fragments}
                             onChange={(e) => set({ fragments: Number(e.target.value) })} />
                  </Field>
                </Two>
                <Two>
                  <Field label="Speed limit" hint="Blank for unlimited. 5M, 800K.">
                    <TextBox value={s.rateLimit} placeholder="Unlimited"
                             onChange={(e) => set({ rateLimit: e.target.value })} />
                  </Field>
                  <Field label="Retries" hint="Attempts per download and per fragment.">
                    <TextBox type="number" min={0} max={50} value={s.retries}
                             onChange={(e) => set({ retries: Number(e.target.value) })} />
                  </Field>
                </Two>

                <GroupLabel>Access</GroupLabel>
                <Field label="Cookies" hint="Needed for age-restricted or subscriber content you have access to.">
                  <Dropdown options={COOKIES} value={s.cookiesFrom}
                            onChange={(e) => set({ cookiesFrom: e.target.value })} />
                </Field>
                {s.cookiesFrom === 'file' && (
                  <Field label="cookies.txt path">
                    <div className="flex gap-2">
                      <TextBox value={s.cookiesFile} onChange={(e) => set({ cookiesFile: e.target.value })} />
                      <Button appearance="standard" className="w-[36px] shrink-0 px-0"
                        onClick={async () => {
                          const r = await api.pickFile([{ name: 'Cookies', extensions: ['txt'] }])
                          if (r.ok && r.data) set({ cookiesFile: r.data })
                        }}>
                        <Glyph d="M2 4.5A1.5 1.5 0 013.5 3h2.2l1.3 1.5h5.5A1.5 1.5 0 0114 6v5.5A1.5 1.5 0 0112.5 13h-9A1.5 1.5 0 012 11.5z" />
                      </Button>
                    </div>
                  </Field>
                )}
                <Field label="Proxy" hint="socks5://127.0.0.1:1080">
                  <TextBox value={s.proxy} placeholder="None" onChange={(e) => set({ proxy: e.target.value })} />
                </Field>
                <SettingRow label="Force IPv4" hint="Fixes some ISP and VPN routing issues.">
                  <Toggle checked={s.forceIpv4} onChange={(v) => set({ forceIpv4: v })} label="" />
                </SettingRow>
              </div>
            )}

            {page === 'spotify' && (
              <div className="flex flex-col gap-4">
                <InfoBar severity="informational" title="Metadata only">
                  Yoink does not decrypt Spotify audio. It reads metadata through Spotify's API,
                  then finds the matching recording on YouTube Music.
                </InfoBar>
                <p className="t-body text-[var(--color-ink-2)]">
                  Spotify's February 2026 developer changes mean a shared Client ID is no longer
                  allowed, so you need your own. It is free and takes about a minute.
                </p>
                <ol className="t-body list-decimal space-y-1 pl-5 text-[var(--color-ink-2)]">
                  <li>Create an app in the Spotify developer dashboard.</li>
                  <li>
                    Set the redirect URI to{' '}
                    <code className="rounded-[4px] bg-[var(--color-fill-rest)] px-1.5 py-0.5 font-[var(--font-mono)] text-[12px] text-[var(--color-accent-text)]">
                      http://127.0.0.1:8888/callback
                    </code>
                  </li>
                  <li>Add your own account to the app's user allowlist.</li>
                </ol>
                <div>
                  <Button appearance="standard"
                          onClick={() => api.openExternal('https://developer.spotify.com/dashboard')}>
                    Open developer dashboard
                  </Button>
                </div>
                <Two>
                  <Field label="Client ID">
                    <TextBox value={s.spotifyClientId} placeholder="32 character ID"
                             onChange={(e) => set({ spotifyClientId: e.target.value.trim() })} />
                  </Field>
                  <Field label="Match candidates" hint="YouTube results ranked per track.">
                    <TextBox type="number" min={3} max={10} value={s.spotifyMatchCandidates}
                             onChange={(e) => set({ spotifyMatchCandidates: Number(e.target.value) })} />
                  </Field>
                </Two>
                <div className="flex items-center gap-3">
                  <Button appearance={spotify.connected ? 'standard' : 'accent'} onClick={connectSpotify}>
                    {spotify.connected ? 'Reconnect' : 'Connect Spotify'}
                  </Button>
                  {spotify.connected && (
                    <span className="t-body text-[var(--color-accent-text)]">Connected</span>
                  )}
                </div>
              </div>
            )}

            {page === 'tools' && (
              <div className="flex flex-col gap-4">
                <p className="t-body text-[var(--color-ink-2)]">
                  Sites break extractors constantly, so yt-dlp needs to stay current. Deno is
                  required to solve YouTube's JavaScript challenges; without it YouTube loses its
                  best formats.
                </p>
                <div className="card divide-y divide-[var(--color-divider)]">
                  {bins.map((b) => {
                    const live = setup.items[b.key]
                    return (
                      <div key={b.key} className="flex items-center gap-3 px-4 py-3">
                        <span className={`h-[6px] w-[6px] shrink-0 rounded-full ${
                          b.installed ? 'bg-[var(--color-success)]' : 'bg-[var(--color-danger)]'}`} />
                        <span className="t-body w-24 text-[var(--color-ink)]">{b.label}</span>
                        <span className="num t-caption flex-1 text-[var(--color-ink-3)]">
                          {live?.phase === 'downloading'
                            ? `${Math.round((live.progress || 0) * 100)}%`
                            : b.version || (b.installed ? 'Installed' : 'Not installed')}
                        </span>
                        {b.key === 'ytdlp' && caps?.version && (
                          <span className="num t-caption text-[var(--color-ink-4)]">{caps.version}</span>
                        )}
                      </div>
                    )
                  })}
                </div>
                <SettingRow label="Keep yt-dlp up to date automatically"
                            hint="Checks once a day. A stale yt-dlp is the most common cause of a download that stops working.">
                  <Toggle checked={s.autoUpdateTools} onChange={(v) => set({ autoUpdateTools: v })} label="" />
                </SettingRow>
                <div className="flex gap-2">
                  <Button appearance="standard" onClick={() => runSetup(true)} disabled={setup.active}>
                    {setup.active ? 'Updating…' : 'Update tools'}
                  </Button>
                  {info && (
                    <Button appearance="subtle" onClick={() => api.openFolder(info.binDir)}>
                      Open tools folder
                    </Button>
                  )}
                </div>
              </div>
            )}

            {page === 'app' && (
              <div className="flex flex-col gap-4">
                <GroupLabel>Reliability</GroupLabel>
                <SettingRow label="Recover from failures automatically"
                            hint="Recognises known errors and retries with the fix applied.">
                  <Toggle checked={s.autoRecover} onChange={(v) => set({ autoRecover: v })} label="" />
                </SettingRow>
                <SettingRow label="Slow down during large batches"
                            hint="Bulk downloading is the fastest way to get rate limited.">
                  <Toggle checked={s.autoThrottle} onChange={(v) => set({ autoThrottle: v })} label="" />
                </SettingRow>
                <SettingRow label="Restore the queue after a restart">
                  <Toggle checked={s.restoreQueue} onChange={(v) => set({ restoreQueue: v })} label="" />
                </SettingRow>

                <GroupLabel>Notifications</GroupLabel>
                <SettingRow label="Notify when downloads finish"
                            hint="Batched, so a playlist does not produce one alert per track.">
                  <Toggle checked={s.notifyOnComplete} onChange={(v) => set({ notifyOnComplete: v })} label="" />
                </SettingRow>
                <SettingRow label="Watch the clipboard"
                            hint="Copied links are added to the input automatically.">
                  <Toggle checked={s.clipboardWatch} onChange={(v) => set({ clipboardWatch: v })} label="" />
                </SettingRow>

                <GroupLabel>About</GroupLabel>
                <div className="card flex items-center gap-4 px-4 py-3">
                  <div className="flex-1">
                    <div className="t-body text-[var(--color-ink)]">Yoink {info?.version}</div>
                    <div className="t-caption mt-0.5 text-[var(--color-ink-3)]">
                      Electron {info?.electron} ·{' '}
                      {info?.updateMode === 'portable' ? 'Portable build'
                        : info?.updateMode === 'dev' ? 'Development' : 'Automatic updates on'}
                    </div>
                  </div>
                  <Button appearance="standard" onClick={async () => {
                    const r = await api.update.check()
                    if (!r.ok) return toast('Update check failed', 'error', r.error)
                    if (r.data.state === 'portable') toast('Portable builds do not self-update', 'info', 'Grab a newer exe from Releases')
                    else if (r.data.state === 'dev') toast('Updates only apply to installed builds', 'info')
                    else toast('Checking for updates', 'info')
                  }}>Check for updates</Button>
                </div>
                <div>
                  <Button appearance="subtle" onClick={resetSettings} className="text-[var(--color-danger)]">
                    Reset all settings
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
