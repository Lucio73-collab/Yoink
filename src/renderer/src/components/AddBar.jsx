import React, { useState, useRef, useEffect } from 'react'
import { motion, AnimatePresence } from 'motion/react'
import {
  ArrowUp,
  SpotifyLogo,
  Scissors,
  VideoCamera,
  MusicNotes,
  CircleNotch
} from '@phosphor-icons/react'
import { useStore } from '../store.js'
import { splitUrls, isSpotify, siteOf } from '../lib/format.js'

const api = window.yoink

const HEIGHTS = [
  ['0', 'Best'],
  ['2160', '4K'],
  ['1440', '1440p'],
  ['1080', '1080p'],
  ['720', '720p']
]

const AUDIO = [
  ['original', 'Original'],
  ['opus', 'Opus'],
  ['m4a', 'M4A'],
  ['mp3', 'MP3'],
  ['flac', 'FLAC']
]

/** Small inline chips instead of dropdowns. One tap, no menu to open. */
function Chips({ options, value, onChange }) {
  return (
    <div className="flex items-center gap-0.5">
      {options.map(([val, label]) => {
        const active = String(value) === String(val)
        return (
          <button
            key={val}
            onClick={() => onChange(val)}
            className="no-drag relative rounded-md px-2 py-[3px] text-[11.5px] font-medium transition-colors duration-150"
          >
            {active && (
              <motion.span
                layoutId="chip-active"
                className="absolute inset-0 rounded-md bg-surface1"
                transition={{ type: 'spring', stiffness: 500, damping: 38 }}
              />
            )}
            <span className={`relative z-10 ${active ? 'text-bright' : 'text-muted hover:text-soft'}`}>
              {label}
            </span>
          </button>
        )
      })}
    </div>
  )
}

export default function AddBar() {
  const { settings, saveSettings, toast, spotify, setSpotify } = useStore()
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [focused, setFocused] = useState(false)
  const [clip, setClip] = useState(false)
  const [section, setSection] = useState({ start: '', end: '' })
  const ref = useRef(null)

  const mode = settings.mode
  const urls = splitUrls(text)
  const count = urls.length
  const hasSpotify = urls.some(isSpotify)

  useEffect(() => api.onClipboardUrl((url) => {
    setText((t) => (t.includes(url) ? t : t ? `${t}\n${url}` : url))
  }), [])

  useEffect(() => {
    const onKey = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'l') {
        e.preventDefault()
        ref.current?.focus()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  async function handleSpotify(url) {
    if (!settings.spotifyClientId) {
      toast('Add a Spotify Client ID in Settings first', 'error')
      return 0
    }
    if (!spotify.connected) {
      const auth = await api.spotify.connect()
      if (!auth.ok) {
        toast('Spotify connection failed', 'error', auth.error)
        return 0
      }
      setSpotify({ connected: true })
    }

    const resolved = await api.spotify.resolve(url)
    if (!resolved.ok) {
      toast('Could not read that Spotify link', 'error', resolved.error)
      return 0
    }
    const tracks = resolved.data.tracks
    if (!tracks.length) {
      toast('That link has no tracks', 'error')
      return 0
    }

    setSpotify({ busy: true, progress: { index: 0, total: tracks.length } })
    const matched = await api.spotify.match(tracks)
    setSpotify({ busy: false, progress: null })

    if (!matched.ok) {
      toast('Matching failed', 'error', matched.error)
      return 0
    }

    const good = matched.data.filter((m) => m.match)
    const missed = matched.data.length - good.length

    // A single track stays a plain row. A collection folds into one group.
    const gid = good.length > 1 ? `sp-${Date.now()}-${Math.random().toString(36).slice(2, 7)}` : null
    const gtitle = resolved.data.name || 'Spotify collection'

    await api.queue.add(
      good.map(({ track, match }, i) => ({
        url: match.url,
        title: `${track.artist} - ${track.title}`,
        uploader: match.uploader,
        duration: Math.round((track.durationMs || 0) / 1000) || match.duration,
        thumbnail: track.cover,
        mode: 'audio',
        audioFormat: settings.audioFormat,
        noPlaylist: true,
        sourceLabel: `Spotify · ${match.confidence}%`,
        tags: track,
        groupId: gid,
        groupTitle: gid ? gtitle : null,
        groupIndex: i,
        groupSize: good.length,
        outputTemplate: resolved.data.name
          ? `${resolved.data.name.replace(/[\\/:*?"<>|]/g, '_')}/%(title).150B.%(ext)s`
          : null
      }))
    )

    if (missed) toast(`${missed} track${missed > 1 ? 's' : ''} had no confident match`, 'info')
    return good.length
  }

  async function submit() {
    if (!count) return
    setBusy(true)
    let added = 0

    try {
      for (const url of urls) {
        if (isSpotify(url)) {
          added += await handleSpotify(url)
          continue
        }

        const info = await api.probe(url)
        const base = {
          url,
          mode,
          maxHeight: Number(settings.maxHeight),
          container: settings.container,
          audioFormat: settings.audioFormat,
          preferCodec: settings.preferCodec,
          section: clip && (section.start || section.end) ? section : null
        }

        if (info.ok && info.data.isPlaylist && settings.expandPlaylists && info.data.entries?.length) {
          // Expanding gives per-item progress, retry and a collapsible group.
          // The index is baked into the template because --no-playlist means
          // yt-dlp cannot supply %(playlist_index)s itself.
          const entries = info.data.entries.slice(0, settings.expandLimit || 300)
          const gid = `pl-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
          const folder = (info.data.title || 'Playlist').replace(/[\\/:*?"<>|]/g, '_')

          await api.queue.add(
            entries.map((e, i) => ({
              ...base,
              url: e.url,
              title: e.title || e.url,
              uploader: info.data.uploader,
              duration: e.duration,
              thumbnail: e.thumbnail,
              noPlaylist: true,
              sourceLabel: siteOf(url),
              groupId: gid,
              groupTitle: info.data.title || 'Playlist',
              groupIndex: i,
              groupSize: entries.length,
              outputTemplate: `${folder}/${String(i + 1).padStart(3, '0')} - %(title).150B [%(id)s].%(ext)s`
            }))
          )
          added += entries.length
          if (info.data.count > entries.length) {
            toast(`Queued the first ${entries.length} of ${info.data.count}`, 'info')
          }
        } else if (info.ok) {
          await api.queue.add({
            ...base,
            url: info.data.webpage_url,
            title: info.data.title,
            uploader: info.data.uploader,
            duration: info.data.duration,
            thumbnail: info.data.thumbnail,
            extractor: info.data.extractor,
            isPlaylist: info.data.isPlaylist,
            sourceLabel: siteOf(url)
          })
          added += info.data.isPlaylist ? info.data.count : 1
        } else {
          // Probe can fail on rate limited pages where the download succeeds.
          await api.queue.add({ ...base, title: url, sourceLabel: siteOf(url) })
          added += 1
        }
      }
      setText('')
      if (added) toast(`Queued ${added} item${added === 1 ? '' : 's'}`, 'ok')
    } finally {
      setBusy(false)
    }
  }

  const working = busy || spotify.busy
  const multiline = text.includes('\n')

  return (
    <div className="px-6 pb-3 pt-1">
      <motion.div
        animate={{
          backgroundColor: focused ? 'var(--color-base)' : 'var(--color-mantle)'
        }}
        transition={{ duration: 0.18, ease: [0.23, 1, 0.32, 1] }}
        className="rounded-[16px] p-1.5"
        style={{
          boxShadow: focused
            ? '0 0 0 1px color-mix(in oklab, var(--color-green) 40%, transparent)'
            : '0 0 0 1px var(--color-surface0)'
        }}
      >
        <div className="flex items-end gap-2">
          <textarea
            ref={ref}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                submit()
              }
            }}
            rows={multiline ? 4 : 1}
            spellCheck={false}
            placeholder="Paste a link"
            className="no-drag min-h-[34px] flex-1 resize-none bg-transparent px-3 py-1.5 text-[14px]
                       leading-relaxed text-text placeholder:text-dim focus:outline-none"
          />

          <AnimatePresence mode="popLayout">
            {count > 1 && (
              <motion.span
                key="count"
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
                transition={{ duration: 0.15 }}
                className="tabular mb-2 text-[11px] text-muted"
              >
                {count}
              </motion.span>
            )}
          </AnimatePresence>

          {/* Send button only materialises when there is something to send */}
          <motion.button
            onClick={submit}
            disabled={!count || working}
            animate={{
              backgroundColor: count && !working ? 'var(--color-green)' : 'var(--color-surface0)',
              scale: count ? 1 : 0.94
            }}
            whileTap={count && !working ? { scale: 0.93 } : undefined}
            transition={{ duration: 0.16, ease: [0.23, 1, 0.32, 1] }}
            className="no-drag grid h-[34px] w-[34px] shrink-0 place-items-center rounded-full
                       disabled:cursor-default"
            aria-label="Download"
          >
            {working ? (
              <CircleNotch size={15} weight="bold" className="animate-spin text-soft" />
            ) : hasSpotify ? (
              <SpotifyLogo size={16} weight="fill" className={count ? 'text-crust' : 'text-dim'} />
            ) : (
              <ArrowUp size={16} weight="bold" className={count ? 'text-crust' : 'text-dim'} />
            )}
          </motion.button>
        </div>

        {/* Controls live inside the input surface, not on a separate toolbar */}
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5 px-1.5 pb-0.5 pt-1.5">
          <div className="flex items-center gap-0.5">
            {[
              ['video', VideoCamera],
              ['audio', MusicNotes]
            ].map(([m, Icon]) => (
              <button
                key={m}
                onClick={() => saveSettings({ mode: m })}
                className="no-drag relative grid h-[26px] w-[30px] place-items-center rounded-md"
                aria-label={m}
              >
                {mode === m && (
                  <motion.span
                    layoutId="mode-active"
                    className="absolute inset-0 rounded-md bg-surface1"
                    transition={{ type: 'spring', stiffness: 500, damping: 38 }}
                  />
                )}
                <Icon
                  size={15}
                  weight={mode === m ? 'fill' : 'regular'}
                  className={`relative z-10 ${mode === m ? 'text-green' : 'text-muted'}`}
                />
              </button>
            ))}
          </div>

          <div className="h-4 w-px bg-surface1" />

          {mode === 'video' ? (
            <Chips
              options={HEIGHTS}
              value={settings.maxHeight}
              onChange={(v) => saveSettings({ maxHeight: Number(v) })}
            />
          ) : (
            <Chips
              options={AUDIO}
              value={settings.audioFormat}
              onChange={(v) => saveSettings({ audioFormat: v })}
            />
          )}

          <div className="h-4 w-px bg-surface1" />

          <button
            onClick={() => setClip((v) => !v)}
            className={`no-drag flex items-center gap-1.5 rounded-md px-2 py-[3px] text-[11.5px]
                        font-medium transition-colors duration-150 ${
                          clip ? 'bg-surface1 text-bright' : 'text-muted hover:text-soft'
                        }`}
          >
            <Scissors size={12} /> Clip
          </button>

          <AnimatePresence>
            {clip && (
              <motion.div
                initial={{ opacity: 0, width: 0 }}
                animate={{ opacity: 1, width: 'auto' }}
                exit={{ opacity: 0, width: 0 }}
                transition={{ duration: 0.22, ease: [0.23, 1, 0.32, 1] }}
                className="flex items-center gap-1 overflow-hidden"
              >
                {['start', 'end'].map((k) => (
                  <input
                    key={k}
                    value={section[k]}
                    onChange={(e) => setSection((s) => ({ ...s, [k]: e.target.value }))}
                    placeholder={k === 'start' ? '0:30' : '2:15'}
                    className="tabular no-drag h-[26px] w-[62px] rounded-md bg-crust px-2 text-center
                               text-[11.5px] text-text placeholder:text-dim focus:outline-none"
                  />
                ))}
              </motion.div>
            )}
          </AnimatePresence>

          <span className="tabular ml-auto text-[11px] text-dim">
            {spotify.busy && spotify.progress
              ? `matching ${spotify.progress.index + 1}/${spotify.progress.total}`
              : mode === 'audio' && settings.audioFormat === 'original'
                ? 'no re-encode'
                : mode === 'video' && settings.container === 'auto'
                  ? 'no re-encode'
                  : 're-encodes'}
          </span>
        </div>
      </motion.div>
    </div>
  )
}
