import React, { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'motion/react'
import {
  X,
  FolderOpen,
  ArrowClockwise,
  SpotifyLogo,
  ArrowSquareOut,
  CheckCircle,
  WarningCircle,
  HardDrives,
  Sliders,
  Globe,
  Wrench,
  AppWindow
} from '@phosphor-icons/react'
import { useStore } from '../store.js'

const api = window.yoink

/* ---------- primitives, scoped to the modal ---------- */

const input =
  'h-9 w-full rounded-lg bg-void px-3 text-[13px] text-text placeholder:text-dim ' +
  'transition-shadow duration-150 focus:outline-none ' +
  'shadow-[0_0_0_1px_var(--color-surface0)] focus:shadow-[0_0_0_1px_var(--color-green)]'

function Field({ label, hint, children }) {
  return (
    <label className="flex flex-col gap-1.5">
      {label && <span className="label">{label}</span>}
      {children}
      {hint && <span className="text-[12px] leading-snug text-muted">{hint}</span>}
    </label>
  )
}

function Text({ ...rest }) {
  return <input className={input} spellCheck={false} {...rest} />
}

function Pick({ options, ...rest }) {
  return (
    <div className="relative">
      <select className={`${input} cursor-pointer appearance-none pr-8`} {...rest}>
        {options.map(([v, l]) => (
          <option key={v} value={v} className="bg-base">
            {l}
          </option>
        ))}
      </select>
      <svg
        className="pointer-events-none absolute right-3 top-1/2 h-3 w-3 -translate-y-1/2 text-muted"
        viewBox="0 0 16 16"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.75"
      >
        <path d="M4 6l4 4 4-4" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </div>
  )
}

function Toggle({ checked, onChange, label, hint }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className="group flex w-full items-start gap-3 rounded-lg py-1.5 text-left"
    >
      <motion.span
        animate={{ backgroundColor: checked ? 'var(--color-green)' : 'var(--color-surface1)' }}
        transition={{ duration: 0.16 }}
        className="mt-[3px] flex h-[18px] w-[31px] shrink-0 items-center rounded-full p-[2px]"
      >
        <motion.span
          animate={{ x: checked ? 13 : 0 }}
          transition={{ type: 'spring', stiffness: 600, damping: 34 }}
          className="h-[14px] w-[14px] rounded-full bg-crust"
        />
      </motion.span>
      <span className="min-w-0">
        <span className="block text-[13px] text-subtext group-hover:text-text">{label}</span>
        {hint && <span className="block text-[12px] leading-snug text-muted">{hint}</span>}
      </span>
    </button>
  )
}

function Btn({ variant = 'ghost', children, ...rest }) {
  const styles = {
    primary: 'bg-green text-crust font-semibold hover:bg-[color-mix(in_oklab,var(--color-green)_88%,white)]',
    solid: 'bg-surface1 text-text hover:bg-surface2',
    ghost: 'text-soft hover:bg-surface0 hover:text-text',
    danger: 'text-red hover:bg-[color-mix(in_oklab,var(--color-red)_14%,transparent)]'
  }
  return (
    <motion.button
      whileTap={{ scale: 0.97 }}
      transition={{ duration: 0.12 }}
      className={`inline-flex h-9 items-center justify-center gap-2 rounded-lg px-3.5 text-[13px]
                  transition-colors duration-150 disabled:opacity-40 ${styles[variant]}`}
      {...rest}
    >
      {children}
    </motion.button>
  )
}

function PathRow({ value, onChange }) {
  return (
    <div className="flex gap-2">
      <Text value={value} onChange={(e) => onChange(e.target.value)} />
      <Btn
        variant="solid"
        onClick={async () => {
          const r = await api.pickFolder(value)
          if (r.ok && r.data) onChange(r.data)
        }}
      >
        <FolderOpen size={15} />
      </Btn>
    </div>
  )
}

const Grid = ({ children }) => <div className="grid gap-4 sm:grid-cols-2">{children}</div>

/* ---------- sections ---------- */

const SECTIONS = [
  { id: 'output', label: 'Output', Icon: HardDrives },
  { id: 'quality', label: 'Quality', Icon: Sliders },
  { id: 'network', label: 'Network', Icon: Globe },
  { id: 'spotify', label: 'Spotify', Icon: SpotifyLogo },
  { id: 'tools', label: 'Toolchain', Icon: Wrench },
  { id: 'app', label: 'App', Icon: AppWindow }
]

const COOKIES = [
  ['none', 'None'], ['chrome', 'Chrome'], ['firefox', 'Firefox'], ['edge', 'Edge'],
  ['brave', 'Brave'], ['opera', 'Opera'], ['vivaldi', 'Vivaldi'], ['file', 'cookies.txt file']
]

const CODECS = [
  ['any', 'Highest quality available'],
  ['av1', 'Prefer AV1 (smallest)'],
  ['vp9', 'Prefer VP9'],
  ['h264', 'Prefer H.264 (most compatible)']
]

const CONTAINERS = [
  ['auto', 'Auto — MKV, never re-encodes'],
  ['mp4', 'MP4'], ['mkv', 'MKV'], ['webm', 'WebM']
]

export default function SettingsModal({ onClose }) {
  const { settings: s, saveSettings, resetSettings, bins, caps, runSetup, setup, spotify, setSpotify, toast } =
    useStore()
  const [tab, setTab] = useState('output')
  const [info, setInfo] = useState(null)
  const set = (patch) => saveSettings(patch)

  useEffect(() => {
    api.appInfo().then((r) => r.ok && setInfo(r.data))
  }, [])

  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  async function connectSpotify() {
    if (!s.spotifyClientId) return toast('Paste your Client ID first', 'error')
    const res = await api.spotify.connect()
    if (res.ok) {
      setSpotify({ connected: true })
      toast('Spotify connected', 'ok')
    } else {
      toast('Connection failed', 'error', res.error)
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.18 }}
      onClick={onClose}
      className="fixed inset-0 z-50 grid place-items-center bg-void/70 p-8 backdrop-blur-[3px]"
    >
      <motion.div
        initial={{ scale: 0.97, opacity: 0, y: 8 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        exit={{ scale: 0.98, opacity: 0, transition: { duration: 0.14 } }}
        transition={{ type: 'spring', stiffness: 420, damping: 34 }}
        onClick={(e) => e.stopPropagation()}
        className="flex h-full max-h-[640px] w-full max-w-[880px] overflow-hidden rounded-[18px] bg-crust
                   shadow-[0_0_0_1px_var(--color-surface0),0_24px_60px_-12px_rgba(0,0,0,0.7)]"
      >
        {/* Left nav, mirroring the app's own sidebar language */}
        <div className="flex w-[190px] shrink-0 flex-col bg-void/40 p-2.5">
          <div className="px-2.5 pb-2 pt-1.5">
            <h2 className="text-[15px] text-bright">Settings</h2>
          </div>
          {SECTIONS.map(({ id, label, Icon }) => (
            <button
              key={id}
              onClick={() => setTab(id)}
              className="relative flex items-center gap-2.5 rounded-lg px-2.5 py-[7px] text-left"
            >
              {tab === id && (
                <motion.span
                  layoutId="settings-active"
                  className="absolute inset-0 rounded-lg bg-surface0"
                  transition={{ type: 'spring', stiffness: 440, damping: 36 }}
                />
              )}
              <Icon
                size={15}
                weight={tab === id ? 'fill' : 'regular'}
                className={`relative z-10 ${tab === id ? 'text-green' : 'text-muted'}`}
              />
              <span
                className={`relative z-10 text-[13px] ${tab === id ? 'text-bright' : 'text-soft'}`}
              >
                {label}
              </span>
            </button>
          ))}

          <button
            onClick={onClose}
            className="mt-auto flex items-center gap-2.5 rounded-lg px-2.5 py-[7px] text-left
                       text-[13px] text-muted transition-colors duration-150 hover:bg-surface0 hover:text-text"
          >
            <X size={15} /> Close
          </button>
        </div>

        {/* Panel */}
        <div className="min-w-0 flex-1 overflow-y-auto">
          <AnimatePresence mode="wait">
            <motion.div
              key={tab}
              initial={{ opacity: 0, x: 8 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -6 }}
              transition={{ duration: 0.18, ease: [0.23, 1, 0.32, 1] }}
              className="p-7"
            >
              {tab === 'output' && (
                <div className="grid gap-5">
                  <Grid>
                    <Field label="Video folder">
                      <PathRow value={s.downloadDir} onChange={(v) => set({ downloadDir: v })} />
                    </Field>
                    <Field label="Audio folder">
                      <PathRow value={s.audioDir} onChange={(v) => set({ audioDir: v })} />
                    </Field>
                  </Grid>
                  <Field label="Filename template" hint="%(title)s, %(id)s, %(uploader)s, %(upload_date)s">
                    <Text value={s.outputTemplate} onChange={(e) => set({ outputTemplate: e.target.value })} />
                  </Field>
                  <Field label="Playlist template" hint="Used when a link expands to multiple items.">
                    <Text value={s.playlistTemplate} onChange={(e) => set({ playlistTemplate: e.target.value })} />
                  </Field>
                  <div>
                    <Toggle
                      checked={s.restrictFilenames}
                      onChange={(v) => set({ restrictFilenames: v })}
                      label="Restrict filenames to ASCII"
                      hint="Safer for NAS shares and older players."
                    />
                    <Toggle
                      checked={s.keepArchive}
                      onChange={(v) => set({ keepArchive: v })}
                      label="Keep a download archive"
                      hint="Re-running a playlist skips what you already have."
                    />
                    <Toggle
                      checked={s.expandPlaylists}
                      onChange={(v) => set({ expandPlaylists: v })}
                      label="Expand playlists into a group"
                      hint="Each item gets its own progress and retry, folded into one collapsible row. Off downloads the playlist as a single job, which is faster but all-or-nothing."
                    />
                  </div>
                </div>
              )}

              {tab === 'quality' && (
                <div className="grid gap-5">
                  <Grid>
                    <Field label="Container">
                      <Pick
                        options={CONTAINERS}
                        value={s.container}
                        onChange={(e) => set({ container: e.target.value })}
                      />
                    </Field>
                    <Field label="Codec preference" hint="Applies only when several exist at one resolution.">
                      <Pick
                        options={CODECS}
                        value={s.preferCodec}
                        onChange={(e) => set({ preferCodec: e.target.value })}
                      />
                    </Field>
                  </Grid>
                  <Field
                    label="Audio quality"
                    hint="0 is best, 10 is smallest. Ignored when the audio format is Original, since nothing is re-encoded."
                  >
                    <Text
                      type="number" min={0} max={10}
                      value={s.audioBitrate}
                      onChange={(e) => set({ audioBitrate: e.target.value })}
                    />
                  </Field>
                  <div className="grid sm:grid-cols-2">
                    <Toggle checked={s.embedThumbnail} onChange={(v) => set({ embedThumbnail: v })} label="Embed thumbnail" />
                    <Toggle checked={s.embedMetadata} onChange={(v) => set({ embedMetadata: v })} label="Embed metadata" />
                    <Toggle checked={s.embedChapters} onChange={(v) => set({ embedChapters: v })} label="Embed chapters" />
                    <Toggle checked={s.splitChapters} onChange={(v) => set({ splitChapters: v })} label="Split by chapter" />
                    <Toggle checked={s.embedSubs} onChange={(v) => set({ embedSubs: v })} label="Embed subtitles" />
                    <Toggle checked={s.writeSubs} onChange={(v) => set({ writeSubs: v })} label="Save .srt files" />
                    <Toggle checked={s.writeThumbnail} onChange={(v) => set({ writeThumbnail: v })} label="Save thumbnail file" />
                    <Toggle checked={s.sponsorblock} onChange={(v) => set({ sponsorblock: v })} label="Cut sponsor segments" />
                  </div>
                  {(s.embedSubs || s.writeSubs) && (
                    <Field label="Subtitle languages" hint="Comma separated, regex allowed. en.*,nl">
                      <Text value={s.subLangs} onChange={(e) => set({ subLangs: e.target.value })} />
                    </Field>
                  )}
                  {s.sponsorblock && (
                    <Field label="SponsorBlock categories">
                      <Text
                        value={s.sponsorblockCategories}
                        onChange={(e) => set({ sponsorblockCategories: e.target.value })}
                      />
                    </Field>
                  )}
                </div>
              )}

              {tab === 'network' && (
                <div className="grid gap-5">
                  <Grid>
                    <Field label="Parallel downloads">
                      <Text
                        type="number" min={1} max={10}
                        value={s.concurrency}
                        onChange={(e) => set({ concurrency: Number(e.target.value) })}
                      />
                    </Field>
                    <Field label="Fragments per download" hint="4 to 8 saturates a fast line.">
                      <Text
                        type="number" min={1} max={16}
                        value={s.fragments}
                        onChange={(e) => set({ fragments: Number(e.target.value) })}
                      />
                    </Field>
                  </Grid>
                  <Grid>
                    <Field label="Speed limit" hint="Blank for unlimited. 5M, 800K.">
                      <Text value={s.rateLimit} placeholder="unlimited" onChange={(e) => set({ rateLimit: e.target.value })} />
                    </Field>
                    <Field label="Proxy" hint="socks5://127.0.0.1:1080">
                      <Text value={s.proxy} placeholder="none" onChange={(e) => set({ proxy: e.target.value })} />
                    </Field>
                  </Grid>
                  <Field label="Retries" hint="Attempts per download and per fragment before giving up.">
                    <Text
                      type="number" min={0} max={50}
                      value={s.retries}
                      onChange={(e) => set({ retries: Number(e.target.value) })}
                    />
                  </Field>
                  <Field label="Cookies" hint="For age restricted or subscriber content you have access to.">
                    <Pick options={COOKIES} value={s.cookiesFrom} onChange={(e) => set({ cookiesFrom: e.target.value })} />
                  </Field>
                  {s.cookiesFrom === 'file' && (
                    <Field label="cookies.txt path">
                      <div className="flex gap-2">
                        <Text value={s.cookiesFile} onChange={(e) => set({ cookiesFile: e.target.value })} />
                        <Btn
                          variant="solid"
                          onClick={async () => {
                            const r = await api.pickFile([{ name: 'Cookies', extensions: ['txt'] }])
                            if (r.ok && r.data) set({ cookiesFile: r.data })
                          }}
                        >
                          <FolderOpen size={15} />
                        </Btn>
                      </div>
                    </Field>
                  )}
                  <Toggle checked={s.forceIpv4} onChange={(v) => set({ forceIpv4: v })} label="Force IPv4" hint="Fixes some ISP and VPN routing issues." />
                </div>
              )}

              {tab === 'spotify' && (
                <div className="grid gap-5">
                  <p className="max-w-[62ch] text-[13px] leading-relaxed text-soft">
                    Yoink does not decrypt Spotify audio. It reads metadata through Spotify's API,
                    then finds the matching recording on YouTube Music. Since the February 2026
                    developer changes a shared Client ID is no longer allowed, so you need your own.
                    Free, about a minute.
                  </p>
                  <ol className="max-w-[62ch] list-decimal space-y-1 pl-5 text-[13px] text-soft">
                    <li>Create an app in the Spotify developer dashboard.</li>
                    <li>
                      Redirect URI:{' '}
                      <code className="tabular rounded bg-void px-1.5 py-0.5 text-[12px] text-green">
                        http://127.0.0.1:8888/callback
                      </code>
                    </li>
                    <li>Add your own account to the app's user allowlist.</li>
                  </ol>
                  <Btn variant="ghost" onClick={() => api.openExternal('https://developer.spotify.com/dashboard')} style={{ justifySelf: 'start', marginLeft: -14 }}>
                    Open dashboard <ArrowSquareOut size={13} />
                  </Btn>
                  <Grid>
                    <Field label="Client ID">
                      <Text
                        value={s.spotifyClientId}
                        placeholder="32 character id"
                        onChange={(e) => set({ spotifyClientId: e.target.value.trim() })}
                      />
                    </Field>
                    <Field label="Match candidates" hint="YouTube results ranked per track.">
                      <Text
                        type="number" min={3} max={10}
                        value={s.spotifyMatchCandidates}
                        onChange={(e) => set({ spotifyMatchCandidates: Number(e.target.value) })}
                      />
                    </Field>
                  </Grid>
                  <div className="flex items-center gap-3">
                    <Btn variant={spotify.connected ? 'solid' : 'primary'} onClick={connectSpotify}>
                      <SpotifyLogo size={15} weight="fill" />
                      {spotify.connected ? 'Reconnect' : 'Connect'}
                    </Btn>
                    {spotify.connected && (
                      <span className="flex items-center gap-1.5 text-[13px] text-green">
                        <CheckCircle size={15} weight="fill" /> Connected
                      </span>
                    )}
                  </div>
                </div>
              )}

              {tab === 'tools' && (
                <div className="grid gap-5">
                  <p className="max-w-[62ch] text-[13px] leading-relaxed text-soft">
                    Sites break extractors constantly, so keep yt-dlp fresh. Deno is required by
                    yt-dlp to solve YouTube's JavaScript challenges. Without it YouTube loses its
                    best formats.
                  </p>
                  <div className="overflow-hidden rounded-xl bg-void/50">
                    {bins.map((b, i) => {
                      const live = setup.items[b.key]
                      return (
                        <div
                          key={b.key}
                          className={`flex items-center gap-3 px-4 py-3 ${i > 0 ? 'shadow-[inset_0_1px_0_var(--color-surface0)]' : ''}`}
                        >
                          {b.installed ? (
                            <CheckCircle size={16} weight="fill" className="text-green" />
                          ) : (
                            <WarningCircle size={16} weight="fill" className="text-red" />
                          )}
                          <span className="w-24 text-[13px] text-subtext">{b.label}</span>
                          <span className="tabular flex-1 text-[11.5px] text-muted">
                            {live?.phase === 'downloading'
                              ? `${Math.round((live.progress || 0) * 100)}%`
                              : b.version || (b.installed ? 'installed' : 'missing')}
                          </span>
                          {b.key === 'ytdlp' && caps?.version && (
                            <span className="tabular text-[11.5px] text-dim">{caps.version}</span>
                          )}
                        </div>
                      )
                    })}
                  </div>
                  <Toggle
                    checked={s.autoUpdateTools}
                    onChange={(v) => set({ autoUpdateTools: v })}
                    label="Keep yt-dlp up to date automatically"
                    hint="Checks once a day in the background. A stale yt-dlp is the most common cause of a download that suddenly stops working."
                  />
                  <div className="flex gap-2">
                    <Btn variant="solid" onClick={() => runSetup(true)} disabled={setup.active}>
                      <ArrowClockwise size={15} className={setup.active ? 'animate-spin' : ''} />
                      {setup.active ? 'Updating' : 'Update tools'}
                    </Btn>
                    {info && (
                      <Btn variant="ghost" onClick={() => api.openFolder(info.binDir)}>
                        Open tools folder
                      </Btn>
                    )}
                  </div>
                </div>
              )}

              {tab === 'app' && (
                <div className="grid gap-5">
                  <div>
                    <Toggle
                      checked={s.notifyOnComplete}
                      onChange={(v) => set({ notifyOnComplete: v })}
                      label="Notify when a download finishes"
                    />
                    <Toggle
                      checked={s.clipboardWatch}
                      onChange={(v) => set({ clipboardWatch: v })}
                      label="Watch the clipboard"
                      hint="Copied links drop into the input automatically."
                    />
                  </div>
                  <div className="rounded-xl bg-void/50 px-4 py-3">
                    <div className="flex items-center gap-3">
                      <span className="flex-1 text-[13px] text-subtext">
                        Yoink {info?.version}
                        <span className="tabular ml-2 text-[11.5px] text-dim">
                          {info?.updateMode === 'portable'
                            ? 'portable build'
                            : info?.updateMode === 'dev'
                              ? 'development'
                              : 'auto-updates on'}
                        </span>
                      </span>
                      <Btn
                        variant="solid"
                        onClick={async () => {
                          const r = await api.update.check()
                          if (!r.ok) return toast('Update check failed', 'error', r.error)
                          if (r.data.state === 'portable') {
                            toast('Portable builds do not self-update', 'info', 'Grab a newer exe from Releases')
                          } else if (r.data.state === 'dev') {
                            toast('Updates only apply to installed builds', 'info')
                          } else {
                            toast('Checking for updates', 'info')
                          }
                        }}
                      >
                        Check for updates
                      </Btn>
                    </div>
                  </div>

                  <div className="flex items-center justify-between">
                    {info && (
                      <span className="tabular text-[11.5px] text-dim">
                        Electron {info.electron}
                      </span>
                    )}
                    <Btn variant="danger" onClick={resetSettings}>
                      Restore defaults
                    </Btn>
                  </div>
                </div>
              )}
            </motion.div>
          </AnimatePresence>
        </div>
      </motion.div>
    </motion.div>
  )
}
