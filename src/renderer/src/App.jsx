import React, { useEffect, useMemo, useState } from 'react'
import { motion, AnimatePresence } from 'motion/react'
import { CheckCircle, WarningCircle, Info, X, Broom, DownloadSimple } from '@phosphor-icons/react'
import { useStore } from './store.js'
import Sidebar from './components/Sidebar.jsx'
import AddBar from './components/AddBar.jsx'
import JobRow from './components/JobRow.jsx'
import GroupRow from './components/GroupRow.jsx'
import SettingsModal from './components/SettingsModal.jsx'

const api = window.yoink

const MATCH = {
  all: () => true,
  active: (j) => ['running', 'processing', 'queued'].includes(j.status),
  done: (j) => j.status === 'done',
  failed: (j) => ['error', 'canceled'].includes(j.status)
}

/**
 * Folds jobs into an ordered list of standalone jobs and group bundles.
 * A group's position is where its first member appeared, so the queue keeps
 * the order things were added rather than hoisting groups to the top.
 */
function buildRows(jobs) {
  const rows = []
  const seen = new Map()
  for (const job of jobs) {
    if (!job.groupId) {
      rows.push({ kind: 'job', key: job.id, job })
      continue
    }
    if (!seen.has(job.groupId)) {
      const group = {
        kind: 'group',
        key: job.groupId,
        group: { id: job.groupId, title: job.groupTitle || 'Playlist', jobs: [] }
      }
      seen.set(job.groupId, group)
      rows.push(group)
    }
    seen.get(job.groupId).group.jobs.push(job)
  }
  for (const row of rows) {
    if (row.kind === 'group') {
      row.group.jobs.sort((a, b) => (a.groupIndex ?? 0) - (b.groupIndex ?? 0))
    }
  }
  return rows
}

function Empty({ filter }) {
  const copy = {
    all: ['Nothing queued', 'Paste a link above and press Enter. Multiple links, one per line.'],
    active: ['Nothing running', 'Downloads in progress will show up here.'],
    done: ['Nothing finished yet', 'Completed downloads collect here for the session.'],
    failed: ['No failures', 'Anything that breaks lands here with its log attached.']
  }[filter]

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: [0.23, 1, 0.32, 1] }}
      className="flex h-full flex-col items-center justify-center gap-2.5 px-8 pb-16 text-center"
    >
      <div className="mb-1 grid h-11 w-11 place-items-center rounded-xl bg-mantle">
        <DownloadSimple size={19} className="text-dim" />
      </div>
      <h2 className="text-[15px] text-subtext">{copy[0]}</h2>
      <p className="max-w-[42ch] text-[13px] leading-relaxed text-muted">{copy[1]}</p>
    </motion.div>
  )
}

function SetupOverlay({ items }) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="absolute inset-0 z-50 grid place-items-center bg-void/85 backdrop-blur-sm"
    >
      <motion.div
        initial={{ scale: 0.97, y: 8 }}
        animate={{ scale: 1, y: 0 }}
        transition={{ type: 'spring', stiffness: 400, damping: 32 }}
        className="w-[400px] rounded-2xl bg-crust p-6 shadow-[0_0_0_1px_var(--color-surface0)]"
      >
        <h2 className="text-[16px] text-bright">Getting the toolchain</h2>
        <p className="mt-1.5 text-[13px] leading-relaxed text-muted">
          yt-dlp, FFmpeg and Deno, fetched once so they stay updatable on their own.
        </p>
        <div className="mt-5 grid gap-3.5">
          {['ytdlp', 'ffmpeg', 'deno'].map((key) => {
            const item = items[key]
            const p = item?.phase === 'done' ? 1 : item?.progress || 0
            return (
              <div key={key}>
                <div className="tabular mb-1.5 flex justify-between text-[11.5px]">
                  <span className="text-soft">{item?.label || key}</span>
                  <span className={item?.phase === 'done' ? 'text-green' : 'text-muted'}>
                    {item?.phase === 'done' ? 'ready'
                      : item?.phase === 'error' ? 'failed'
                      : item ? `${Math.round(p * 100)}%` : 'waiting'}
                  </span>
                </div>
                <div className="h-[3px] overflow-hidden rounded-full bg-surface0">
                  <motion.div
                    className="h-full origin-left rounded-full bg-green"
                    animate={{ scaleX: p }}
                    initial={{ scaleX: 0 }}
                    transition={{ duration: 0.35, ease: [0.23, 1, 0.32, 1] }}
                  />
                </div>
              </div>
            )
          })}
        </div>
      </motion.div>
    </motion.div>
  )
}

function Toasts() {
  const { toasts, dismissToast } = useStore()
  const Icon = { ok: CheckCircle, error: WarningCircle, info: Info }
  const tone = { ok: 'text-green', error: 'text-red', info: 'text-soft' }

  return (
    <div className="pointer-events-none fixed bottom-5 right-5 z-40 flex w-[330px] flex-col gap-2">
      <AnimatePresence>
        {toasts.map((t) => {
          const I = Icon[t.tone] || Info
          return (
            <motion.div
              key={t.id}
              layout
              initial={{ opacity: 0, y: 12, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, x: 16, transition: { duration: 0.16 } }}
              transition={{ type: 'spring', stiffness: 480, damping: 36 }}
              className="pointer-events-auto flex items-start gap-2.5 rounded-xl bg-base px-3.5 py-3
                         shadow-[0_0_0_1px_var(--color-surface0),0_12px_28px_-8px_rgba(0,0,0,0.6)]"
            >
              <I size={16} weight="fill" className={`mt-[1px] shrink-0 ${tone[t.tone]}`} />
              <div className="min-w-0 flex-1">
                <p className="text-[13px] text-text">{t.message}</p>
                {t.detail && (
                  <p className="mt-0.5 break-words text-[11.5px] leading-snug text-muted">{t.detail}</p>
                )}
              </div>
              <button
                onClick={() => dismissToast(t.id)}
                className="text-dim transition-colors hover:text-text"
                aria-label="Dismiss"
              >
                <X size={13} />
              </button>
            </motion.div>
          )
        })}
      </AnimatePresence>
    </div>
  )
}

export default function App() {
  const { ready, init, jobs, settings, setup, filter, setFilter } = useStore()
  const [showSettings, setShowSettings] = useState(false)
  // Groups start collapsed. Expanding is opt-in, which is the whole point.
  const [expanded, setExpanded] = useState(() => new Set())

  useEffect(() => { init() }, [])

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
      speed: running.reduce((sum, j) => sum + (j.speed || 0), 0),
      totalBytes: jobs.filter((j) => j.status === 'done').reduce((sum, j) => sum + (j.total || 0), 0)
    }
  }, [jobs])

  const visible = useMemo(() => jobs.filter(MATCH[filter]), [jobs, filter])
  const rows = useMemo(() => buildRows(visible), [visible])
  const finished = counts.done + counts.failed

  const queueActions = {
    onCancel: api.queue.cancel,
    onRetry: api.queue.retry,
    onRemove: api.queue.remove,
    onReveal: api.reveal
  }

  if (!ready || !settings) {
    return (
      <div className="grid h-full place-items-center bg-void">
        <motion.span
          animate={{ opacity: [0.3, 1, 0.3] }}
          transition={{ duration: 1.6, repeat: Infinity, ease: 'easeInOut' }}
          className="tabular text-[12px] text-muted"
        >
          starting
        </motion.span>
      </div>
    )
  }

  return (
    <div className="relative flex h-full bg-void">
      <Sidebar
        filter={filter}
        setFilter={setFilter}
        counts={counts}
        stats={stats}
        onSettings={() => setShowSettings(true)}
        onOpenFolder={() => api.openFolder(settings.mode === 'audio' ? settings.audioDir : settings.downloadDir)}
      />

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Reserved strip for the Windows control overlay, doubles as drag handle */}
        <div className="drag-region h-[52px] shrink-0" />

        <AddBar />

        <main className="min-h-0 flex-1 overflow-y-auto pb-3">
          {visible.length === 0 ? (
            <Empty filter={filter} />
          ) : (
            <AnimatePresence mode="popLayout" initial={false}>
              {rows.map((row) =>
                row.kind === 'group' ? (
                  <GroupRow
                    key={row.key}
                    group={row.group}
                    collapsed={!expanded.has(row.key)}
                    onToggle={() =>
                      setExpanded((prev) => {
                        const next = new Set(prev)
                        next.has(row.key) ? next.delete(row.key) : next.add(row.key)
                        return next
                      })
                    }
                    actions={queueActions}
                  />
                ) : (
                  <JobRow key={row.key} job={row.job} {...queueActions} />
                )
              )}
            </AnimatePresence>
          )}
        </main>

        <AnimatePresence>
          {finished > 0 && (
            <motion.footer
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 10 }}
              transition={{ duration: 0.2, ease: [0.23, 1, 0.32, 1] }}
              className="flex h-11 shrink-0 items-center justify-between px-6"
            >
              <span className="tabular text-[11.5px] text-dim">{finished} finished</span>
              <button
                onClick={api.queue.clearFinished}
                className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[12px] text-muted
                           transition-colors duration-150 hover:bg-surface0 hover:text-text"
              >
                <Broom size={13} /> Clear
              </button>
            </motion.footer>
          )}
        </AnimatePresence>
      </div>

      <AnimatePresence>
        {showSettings && <SettingsModal onClose={() => setShowSettings(false)} />}
      </AnimatePresence>

      <AnimatePresence>{setup.active && <SetupOverlay items={setup.items} />}</AnimatePresence>

      <Toasts />
    </div>
  )
}
