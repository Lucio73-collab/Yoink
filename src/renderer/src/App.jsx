import React, { useEffect, useMemo, useState } from 'react'
import { useStore } from './store.js'
import Sidebar from './components/Sidebar.jsx'
import AddBar from './components/AddBar.jsx'
import JobRow from './components/JobRow.jsx'
import GroupRow from './components/GroupRow.jsx'
import SettingsModal from './components/SettingsModal.jsx'
import DropPanel from './components/DropPanel.jsx'
import { Button, InfoBar, ProgressBar } from './components/ui/Fluent.jsx'
import { useFlip, usePresence, stagger } from './lib/motion.js'

const api = window.yoink

const MATCH = {
  all: () => true,
  active: (j) => ['running', 'processing', 'queued'].includes(j.status),
  done: (j) => j.status === 'done',
  failed: (j) => ['error', 'canceled'].includes(j.status)
}

function buildRows(jobs) {
  const rows = []
  const seen = new Map()
  for (const job of jobs) {
    if (!job.groupId) { rows.push({ kind: 'job', key: job.id, job }); continue }
    if (!seen.has(job.groupId)) {
      const g = { kind: 'group', key: job.groupId,
                  group: { id: job.groupId, title: job.groupTitle || 'Playlist', jobs: [] } }
      seen.set(job.groupId, g)
      rows.push(g)
    }
    seen.get(job.groupId).group.jobs.push(job)
  }
  for (const r of rows) {
    if (r.kind === 'group') r.group.jobs.sort((a, b) => (a.groupIndex ?? 0) - (b.groupIndex ?? 0))
  }
  return rows
}

function Empty({ filter }) {
  const copy = {
    all: ['No downloads yet', 'Paste a link above, or drop a file here to compress or convert it.'],
    active: ['Nothing in progress', 'Downloads that are running or queued appear here.'],
    done: ['Nothing completed yet', 'Finished downloads are listed here for this session.'],
    failed: ['No failures', 'Downloads that could not complete are listed here with their logs.']
  }[filter]

  return (
    <div className="enter flex h-full flex-col items-center justify-center px-8 pb-12 text-center">
      <div className="mb-4 grid h-12 w-12 place-items-center rounded-[8px] border border-[var(--color-stroke)] bg-[var(--color-card-2)]">
        <svg viewBox="0 0 16 16" className="h-5 w-5 text-[var(--color-ink-4)]" fill="none"
             stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round">
          <path d="M8 2v8M4.5 6.5L8 10l3.5-3.5M3 13.5h10" />
        </svg>
      </div>
      <h2 className="t-subtitle text-[var(--color-ink)]">{copy[0]}</h2>
      <p className="t-body mt-1 max-w-[42ch] text-[var(--color-ink-3)]">{copy[1]}</p>
    </div>
  )
}

function SetupDialog({ items }) {
  const order = ['ytdlp', 'ffmpeg', 'deno']
  const failed = order.some((k) => items[k]?.phase === 'error')
  return (
    <div className="acrylic-scrim fixed inset-0 z-50 grid place-items-center p-8">
      <div className="acrylic enter-scale w-[440px] rounded-[8px] border border-[var(--color-stroke-2)] shadow-[0_32px_64px_rgba(0,0,0,0.5)]">
        <div className="px-6 pb-4 pt-5">
          <h2 className="t-subtitle text-[var(--color-ink)]">Setting up Yoink</h2>
          <p className="t-body mt-1.5 text-[var(--color-ink-2)]">
            Downloading yt-dlp, FFmpeg and Deno. About 120 MB, once.
          </p>
          <div className="mt-5 flex flex-col gap-3.5">
            {order.map((key) => {
              const item = items[key]
              const p = item?.phase === 'done' ? 1 : item?.progress || 0
              return (
                <div key={key}>
                  <div className="mb-1.5 flex items-baseline justify-between">
                    <span className="t-body text-[var(--color-ink-2)]">{item?.label || key}</span>
                    <span className="num t-caption text-[var(--color-ink-3)]">
                      {item?.phase === 'done' ? 'Ready'
                        : item?.phase === 'error' ? 'Failed'
                        : item ? `${Math.round(p * 100)}%` : 'Waiting'}
                    </span>
                  </div>
                  <ProgressBar value={p} />
                </div>
              )
            })}
          </div>
          {failed && (
            <div className="mt-4">
              <InfoBar severity="error" title="Something failed to download">
                Check your connection, then use Update tools in Settings.
              </InfoBar>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

/** Notifications stack bottom-right as Fluent InfoBars rather than custom toasts. */
function Notifications() {
  const { toasts, dismissToast } = useStore()
  const map = { ok: 'success', error: 'error', info: 'informational' }
  return (
    <div className="pointer-events-none fixed bottom-4 right-4 z-40 flex w-[360px] flex-col gap-2">
      {toasts.map((t, i) => (
        <div key={t.id} style={{ animationDelay: stagger(i, 40, 120) }}
             className="enter-slide pointer-events-auto rounded-[4px] bg-[var(--color-elevated)] shadow-[0_8px_24px_rgba(0,0,0,0.4)]">
          <InfoBar severity={map[t.tone] || 'informational'} title={t.message}
                   onDismiss={() => dismissToast(t.id)}>
            {t.detail}
          </InfoBar>
        </div>
      ))}
    </div>
  )
}

export default function App() {
  const { ready, init, jobs, settings, setup, filter, setFilter } = useStore()
  const [showSettings, setShowSettings] = useState(false)
  const [expanded, setExpanded] = useState(() => new Set())
  const [dropped, setDropped] = useState(null)
  const [dragging, setDragging] = useState(false)

  useEffect(() => { init() }, [])

  useEffect(() => {
    let depth = 0
    const over = (e) => e.preventDefault()
    const enter = (e) => {
      e.preventDefault()
      if (e.dataTransfer?.types?.includes('Files')) { depth++; setDragging(true) }
    }
    const leave = (e) => { e.preventDefault(); if (--depth <= 0) { depth = 0; setDragging(false) } }
    const drop = (e) => {
      e.preventDefault(); depth = 0; setDragging(false)
      const paths = [...(e.dataTransfer?.files || [])]
        .map((f) => window.yoink.pathForFile?.(f) || f.path).filter(Boolean)
      if (paths.length) setDropped(paths)
    }
    window.addEventListener('dragover', over)
    window.addEventListener('dragenter', enter)
    window.addEventListener('dragleave', leave)
    window.addEventListener('drop', drop)
    return () => {
      window.removeEventListener('dragover', over)
      window.removeEventListener('dragenter', enter)
      window.removeEventListener('dragleave', leave)
      window.removeEventListener('drop', drop)
    }
  }, [])

  const counts = useMemo(() => ({
    all: jobs.length,
    active: jobs.filter(MATCH.active).length,
    done: jobs.filter(MATCH.done).length,
    failed: jobs.filter(MATCH.failed).length,
    queued: jobs.filter((j) => j.status === 'queued').length
  }), [jobs])

  const stats = useMemo(() => {
    const running = jobs.filter((j) => j.status === 'running' || j.status === 'processing')
    return {
      active: running.length,
      speed: running.reduce((s, j) => s + (j.speed || 0), 0),
      totalBytes: jobs.filter((j) => j.status === 'done').reduce((s, j) => s + (j.total || 0), 0)
    }
  }, [jobs])

  const visible = useMemo(() => jobs.filter(MATCH[filter]), [jobs, filter])
  const rows = useMemo(() => buildRows(visible), [visible])
  // Rows glide to new positions when filtered rather than teleporting.
  const listRef = useFlip([rows.map((r) => r.key).join(','), filter])
  const finished = counts.done + counts.failed

  const queueActions = {
    onCancel: api.queue.cancel, onRetry: api.queue.retry,
    onRemove: api.queue.remove, onReveal: api.reveal
  }

  if (!ready || !settings) {
    return (
      <div className="grid h-full place-items-center bg-[var(--color-app)]">
        <span className="t-body text-[var(--color-ink-3)]">Starting…</span>
      </div>
    )
  }

  const TITLES = { all: 'All downloads', active: 'Active', done: 'Completed', failed: 'Failed' }

  return (
    <div className="relative flex h-full bg-[var(--color-app)]">
      <Sidebar
        filter={filter} setFilter={setFilter} counts={counts} stats={stats}
        onSettings={() => setShowSettings(true)}
        onOpenFolder={() => api.openFolder(settings.mode === 'audio' ? settings.audioDir : settings.downloadDir)}
      />

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Title area doubles as the window drag region, clearing the caption buttons */}
        <header className="drag-region flex h-[48px] shrink-0 items-end px-6 pb-1">
          <h1 key={filter} className="t-title enter-slide text-[var(--color-ink)]">{TITLES[filter]}</h1>
        </header>

        <AddBar />

        <main ref={listRef} className="min-h-0 flex-1 overflow-y-auto px-6 py-3">
          {rows.length === 0 ? <Empty filter={filter} /> : rows.map((row, i) =>
            row.kind === 'group' ? (
              <GroupRow key={row.key} index={i} group={row.group}
                        collapsed={!expanded.has(row.key)}
                        onToggle={() => setExpanded((prev) => {
                          const next = new Set(prev)
                          next.has(row.key) ? next.delete(row.key) : next.add(row.key)
                          return next
                        })}
                        actions={queueActions} />
            ) : (
              <JobRow key={row.key} index={i} job={row.job} {...queueActions} />
            )
          )}
        </main>

        {finished > 0 && (
          <footer className="flex h-[44px] shrink-0 items-center justify-between border-t border-[var(--color-divider)] px-6">
            <span className="t-caption text-[var(--color-ink-3)]">
              {finished} finished this session
            </span>
            <Button appearance="subtle" size="sm" onClick={api.queue.clearFinished}>
              Clear completed
            </Button>
          </footer>
        )}
      </div>

      {dragging && (
        <div className="acrylic-scrim pointer-events-none fixed inset-0 z-40 grid place-items-center">
          <div className="acrylic enter-scale rounded-[8px] border-2 border-dashed border-[var(--color-accent)] px-8 py-6 text-center">
            <p className="t-subtitle text-[var(--color-ink)]">Drop to compress or convert</p>
            <p className="t-body mt-1 text-[var(--color-ink-3)]">Video and audio files</p>
          </div>
        </div>
      )}

      {dropped && <DropPanel files={dropped} onClose={() => setDropped(null)} />}
      {showSettings && <SettingsModal onClose={() => setShowSettings(false)} />}
      {setup.active && <SetupDialog items={setup.items} />}
      <Notifications />
    </div>
  )
}
