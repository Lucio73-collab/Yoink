import React, { useState, useRef, useEffect } from 'react'
import { Download, Sparkle, SpotifyLogo, Scissors, Spinner } from '@phosphor-icons/react'
import { Button, Input, Select, Segmented } from './ui/Primitives.jsx'
import { useStore } from '../store.js'
import { splitUrls, isSpotify, siteOf } from '../lib/format.js'

const api = window.yoink

const HEIGHTS = [
  { value: '0', label: 'Best available' },
  { value: '4320', label: '4320p (8K)' },
  { value: '2160', label: '2160p (4K)' },
  { value: '1440', label: '1440p' },
  { value: '1080', label: '1080p' },
  { value: '720', label: '720p' },
  { value: '480', label: '480p' }
]

const AUDIO = [
  { value: 'original', label: 'Original (no re-encode)' },
  { value: 'opus', label: 'Opus' },
  { value: 'm4a', label: 'M4A / AAC' },
  { value: 'mp3', label: 'MP3' },
  { value: 'flac', label: 'FLAC' },
  { value: 'wav', label: 'WAV' }
]

const CONTAINERS = [
  { value: 'auto', label: 'Auto (MKV, never re-encodes)' },
  { value: 'mp4', label: 'MP4' },
  { value: 'mkv', label: 'MKV' },
  { value: 'webm', label: 'WebM' }
]

export default function AddPanel() {
  const { settings, saveSettings, toast, spotify, setSpotify } = useStore()
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [clip, setClip] = useState(false)
  const [section, setSection] = useState({ start: '', end: '' })
  const ref = useRef(null)

  const mode = settings.mode

  useEffect(() => {
    const off = api.onClipboardUrl((url) => {
      setText((t) => (t.includes(url) ? t : t ? `${t}\n${url}` : url))
    })
    return off
  }, [])

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
      toast('That Spotify link has no tracks', 'error')
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

    await api.queue.add(
      good.map(({ track, match }) => ({
        url: match.url,
        title: `${track.artist} - ${track.title}`,
        uploader: match.uploader,
        duration: Math.round((track.durationMs || 0) / 1000) || match.duration,
        thumbnail: track.cover,
        mode: 'audio',
        audioFormat: settings.audioFormat,
        noPlaylist: true,
        sourceLabel: `Spotify (${match.confidence}% match)`,
        tags: track,
        outputTemplate: resolved.data.name
          ? `${resolved.data.name.replace(/[\\/:*?"<>|]/g, '_')}/%(title).150B.%(ext)s`
          : null
      }))
    )

    if (missed) toast(`${missed} track${missed > 1 ? 's' : ''} had no confident match`, 'info')
    return good.length
  }

  async function submit() {
    const urls = splitUrls(text)
    if (!urls.length) {
      toast('Paste one or more links first', 'error')
      return
    }

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

        if (info.ok) {
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
          // Probing can fail on private or rate limited pages. Queue it anyway,
          // yt-dlp often succeeds on the real download where the probe did not.
          await api.queue.add({ ...base, title: url, sourceLabel: siteOf(url) })
          added += 1
        }
      }

      setText('')
      toast(`Added ${added} item${added === 1 ? '' : 's'}`, 'ok')
    } finally {
      setBusy(false)
    }
  }

  const onKeyDown = (e) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey || !e.shiftKey)) {
      e.preventDefault()
      submit()
    }
  }

  const count = splitUrls(text).length
  const hasSpotify = splitUrls(text).some(isSpotify)

  return (
    <div className="border-b border-surface0 bg-mantle/70 px-5 py-4">
      <div className="flex gap-3">
        <div className="relative flex-1">
          <textarea
            ref={ref}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={onKeyDown}
            rows={text.includes('\n') ? 4 : 1}
            spellCheck={false}
            placeholder="Paste a link. YouTube, TikTok, Instagram, X, Reddit, Twitch, SoundCloud, Spotify and about 1800 more."
            className="no-drag w-full resize-none rounded-lg border border-surface0 bg-crust px-3.5 py-2.5
                       text-[13px] leading-relaxed text-text placeholder:text-overlay0
                       transition-colors duration-150 hover:border-surface1
                       focus:border-green focus:outline-none"
          />
          {count > 1 && (
            <span className="tabular pointer-events-none absolute right-3 top-2.5 text-overlay0">
              {count} links
            </span>
          )}
        </div>

        <Button
          variant="primary"
          size="lg"
          onClick={submit}
          disabled={busy || spotify.busy || !count}
          className="shrink-0 self-start"
        >
          {busy || spotify.busy ? (
            <Spinner size={16} className="animate-spin" />
          ) : hasSpotify ? (
            <SpotifyLogo size={16} weight="fill" />
          ) : (
            <Download size={16} weight="bold" />
          )}
          {spotify.busy && spotify.progress
            ? `Matching ${spotify.progress.index + 1}/${spotify.progress.total}`
            : 'Download'}
        </Button>
      </div>

      {/* Controls sit on one dense line rather than in a card */}
      <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2">
        <Segmented
          value={mode}
          onChange={(v) => saveSettings({ mode: v })}
          options={[
            { value: 'video', label: 'Video' },
            { value: 'audio', label: 'Audio' }
          ]}
        />

        <div className="h-5 w-px bg-surface0" />

        {mode === 'video' ? (
          <>
            <Select
              className="h-8 w-[152px] text-[12px]"
              value={String(settings.maxHeight)}
              onChange={(e) => saveSettings({ maxHeight: Number(e.target.value) })}
              options={HEIGHTS}
            />
            <Select
              className="h-8 w-[210px] text-[12px]"
              value={settings.container}
              onChange={(e) => saveSettings({ container: e.target.value })}
              options={CONTAINERS}
            />
          </>
        ) : (
          <Select
            className="h-8 w-[200px] text-[12px]"
            value={settings.audioFormat}
            onChange={(e) => saveSettings({ audioFormat: e.target.value })}
            options={AUDIO}
          />
        )}

        <Button
          size="sm"
          variant={clip ? 'solid' : 'ghost'}
          onClick={() => setClip((v) => !v)}
          title="Download only part of the video"
        >
          <Scissors size={13} /> Clip
        </Button>

        {clip && (
          <div className="flex items-center gap-1.5">
            <Input
              className="h-8 w-[86px] text-center text-[12px]"
              placeholder="0:30"
              value={section.start}
              onChange={(e) => setSection((s) => ({ ...s, start: e.target.value }))}
            />
            <span className="text-overlay0">to</span>
            <Input
              className="h-8 w-[86px] text-center text-[12px]"
              placeholder="2:15"
              value={section.end}
              onChange={(e) => setSection((s) => ({ ...s, end: e.target.value }))}
            />
          </div>
        )}

        <div className="ml-auto flex items-center gap-2 text-[12px] text-overlay0">
          <Sparkle size={13} weight="fill" className="text-green/60" />
          {mode === 'audio' && settings.audioFormat === 'original'
            ? 'Keeps the source codec, no quality loss'
            : mode === 'audio'
              ? 'Re-encoded from the source'
              : settings.container === 'auto'
                ? 'Merges without re-encoding'
                : 'Remuxes to your container'}
        </div>
      </div>
    </div>
  )
}
