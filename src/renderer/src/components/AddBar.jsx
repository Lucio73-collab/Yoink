import React, { useState, useRef, useEffect } from 'react'
import { Button, TextBox, Dropdown } from './ui/Fluent.jsx'
import { useStore } from '../store.js'
import { splitUrls, isSpotify, siteOf } from '../lib/format.js'

const api = window.yoink

const HEIGHTS = [
  ['0', 'Best quality'], ['2160', '4K (2160p)'], ['1440', '1440p'],
  ['1080', '1080p'], ['720', '720p'], ['480', '480p']
]
const AUDIO = [
  ['original', 'Original (no re-encode)'], ['opus', 'Opus'], ['m4a', 'M4A'],
  ['mp3', 'MP3'], ['flac', 'FLAC'], ['wav', 'WAV']
]

function Glyph({ d, className = 'h-4 w-4' }) {
  return (
    <svg viewBox="0 0 16 16" className={className} fill="none" stroke="currentColor"
         strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round">
      <path d={d} />
    </svg>
  )
}

/**
 * Fluent CommandBar: a text field with the primary action beside it and
 * secondary options on a single row beneath. Options are real controls rather
 * than custom chips, which is what makes it read as a Windows app.
 */
export default function AddBar() {
  const { settings, saveSettings, toast, spotify, setSpotify } = useStore()
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [clip, setClip] = useState(false)
  const [section, setSection] = useState({ start: '', end: '' })
  const ref = useRef(null)

  const mode = settings.mode
  const urls = splitUrls(text)
  const count = urls.length

  useEffect(() => api.onClipboardUrl((url) => {
    setText((t) => (t.includes(url) ? t : t ? `${t}\n${url}` : url))
  }), [])

  useEffect(() => {
    const onKey = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'l') { e.preventDefault(); ref.current?.focus() }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  async function handleSpotify(url) {
    if (!settings.spotifyClientId) {
      toast('Add a Spotify Client ID in Settings first', 'error'); return 0
    }
    if (!spotify.connected) {
      const auth = await api.spotify.connect()
      if (!auth.ok) { toast('Spotify connection failed', 'error', auth.error); return 0 }
      setSpotify({ connected: true })
    }
    const resolved = await api.spotify.resolve(url)
    if (!resolved.ok) { toast('Could not read that Spotify link', 'error', resolved.error); return 0 }
    const tracks = resolved.data.tracks
    if (!tracks.length) { toast('That link has no tracks', 'error'); return 0 }

    setSpotify({ busy: true, progress: { index: 0, total: tracks.length } })
    const matched = await api.spotify.match(tracks)
    setSpotify({ busy: false, progress: null })
    if (!matched.ok) { toast('Matching failed', 'error', matched.error); return 0 }

    const good = matched.data.filter((m) => m.match)
    const missed = matched.data.length - good.length
    const gid = good.length > 1 ? `sp-${Date.now()}-${Math.random().toString(36).slice(2, 7)}` : null
    const gtitle = resolved.data.name || 'Spotify collection'

    await api.queue.add(good.map(({ track, match }, i) => ({
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
        ? `${resolved.data.name.replace(/[\\/:*?"<>|]/g, '_')}/%(title).150B.%(ext)s` : null
    })))
    if (missed) toast(`${missed} track${missed > 1 ? 's' : ''} had no confident match`, 'info')
    return good.length
  }

  async function submit() {
    if (!count) return
    setBusy(true)
    let added = 0
    try {
      for (const url of urls) {
        if (isSpotify(url)) { added += await handleSpotify(url); continue }
        const info = await api.probe(url)
        const base = {
          url, mode,
          maxHeight: Number(settings.maxHeight),
          container: settings.container,
          audioFormat: settings.audioFormat,
          preferCodec: settings.preferCodec,
          section: clip && (section.start || section.end) ? section : null
        }
        if (info.ok && info.data.isPlaylist && settings.expandPlaylists && info.data.entries?.length) {
          const entries = info.data.entries.slice(0, settings.expandLimit || 300)
          const gid = `pl-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
          const folder = (info.data.title || 'Playlist').replace(/[\\/:*?"<>|]/g, '_')
          await api.queue.add(entries.map((e, i) => ({
            ...base, url: e.url, title: e.title || e.url,
            uploader: info.data.uploader, duration: e.duration, thumbnail: e.thumbnail,
            noPlaylist: true, sourceLabel: siteOf(url),
            groupId: gid, groupTitle: info.data.title || 'Playlist',
            groupIndex: i, groupSize: entries.length,
            outputTemplate: `${folder}/${String(i + 1).padStart(3, '0')} - %(title).150B [%(id)s].%(ext)s`
          })))
          added += entries.length
          if (info.data.count > entries.length) {
            toast(`Queued the first ${entries.length} of ${info.data.count}`, 'info')
          }
        } else if (info.ok) {
          await api.queue.add({
            ...base, url: info.data.webpage_url, title: info.data.title,
            uploader: info.data.uploader, duration: info.data.duration,
            thumbnail: info.data.thumbnail, extractor: info.data.extractor,
            isPlaylist: info.data.isPlaylist, sourceLabel: siteOf(url)
          })
          added += info.data.isPlaylist ? info.data.count : 1
        } else {
          await api.queue.add({ ...base, title: url, sourceLabel: siteOf(url) })
          added += 1
        }
      }
      setText('')
      if (added) toast(`Added ${added} item${added === 1 ? '' : 's'} to the queue`, 'ok')
    } finally { setBusy(false) }
  }

  const working = busy || spotify.busy

  return (
    <div className="border-b border-[var(--color-divider)] px-6 pb-4 pt-1">
      <div className="flex items-start gap-2">
        <div className="flex-1">
          <TextBox
            ref={ref}
            multiline
            rows={text.includes('\n') ? 4 : 1}
            value={text}
            spellCheck={false}
            placeholder="Paste a link"
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit() }
            }}
            className={text.includes('\n') ? '' : 'h-[32px] py-[5px]'}
          />
        </div>

        <Button appearance="accent" onClick={submit} disabled={!count || working} className="shrink-0">
          {working
            ? (spotify.progress ? `Matching ${spotify.progress.index + 1}/${spotify.progress.total}` : 'Working')
            : count > 1 ? `Download ${count}` : 'Download'}
        </Button>
      </div>

      <div className="mt-2.5 flex flex-wrap items-center gap-2">
        <Dropdown
          className="w-[104px]"
          value={mode}
          onChange={(e) => saveSettings({ mode: e.target.value })}
          options={[['video', 'Video'], ['audio', 'Audio']]}
        />

        {mode === 'video' ? (
          <>
            <Dropdown className="w-[136px]" value={String(settings.maxHeight)}
                      onChange={(e) => saveSettings({ maxHeight: Number(e.target.value) })}
                      options={HEIGHTS} />
            <Dropdown className="w-[168px]" value={settings.container}
                      onChange={(e) => saveSettings({ container: e.target.value })}
                      options={[['auto', 'MKV (no re-encode)'], ['mp4', 'MP4'], ['mkv', 'MKV'], ['webm', 'WebM']]} />
          </>
        ) : (
          <Dropdown className="w-[196px]" value={settings.audioFormat}
                    onChange={(e) => saveSettings({ audioFormat: e.target.value })}
                    options={AUDIO} />
        )}

        <Button appearance={clip ? 'standard' : 'subtle'} onClick={() => setClip((v) => !v)}>
          <Glyph d="M4 3l8 8M12 3l-8 8M5 13a2 2 0 100-4 2 2 0 000 4zM11 13a2 2 0 100-4 2 2 0 000 4z"
                 className="h-3.5 w-3.5" />
          Trim
        </Button>

        {clip && (
          <div className="flex items-center gap-1.5">
            <TextBox className="num w-[76px] text-center" placeholder="0:30" value={section.start}
                     onChange={(e) => setSection((s) => ({ ...s, start: e.target.value }))} />
            <span className="t-caption text-[var(--color-ink-3)]">to</span>
            <TextBox className="num w-[76px] text-center" placeholder="2:15" value={section.end}
                     onChange={(e) => setSection((s) => ({ ...s, end: e.target.value }))} />
          </div>
        )}
      </div>
    </div>
  )
}
