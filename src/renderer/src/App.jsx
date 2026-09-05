import React, { useEffect, useMemo } from 'react'
import {
  Gear,
  Stack,
  Broom,
  X,
  CheckCircle,
  WarningCircle,
  Info,
  DownloadSimple
} from '@phosphor-icons/react'
import { useStore } from './store.js'
import { Button } from './components/ui/Primitives.jsx'
import AddPanel from './components/AddPanel.jsx'
import JobRow from './components/JobRow.jsx'
import Settings from './components/Settings.jsx'
import { rate } from './lib/format.js'

const api = window.yoink

function TitleBar({ view, setView, stats }) {
  return (
    <header className="drag-region flex h-10 shrink-0 items-center gap-3 border-b border-surface0 bg-crust px-4">
      <div className="flex items-center gap-2">
        <span
          className="grid h-[18px] w-[18px] place-items-center rounded-[5px] bg-green text-crust"
          aria-hidden
        >
          <DownloadSimple size={12} weight="bold" />
        </span>
        <span className="font-display text-[14px] font-semibold tracking-tight text-text">
          Yoink
        </span>
      </div>

      <nav className="no-drag ml-3 flex items-center gap-0.5">
        <Button
          size="sm"
          variant={view === 'queue' ? 'solid' : 'ghost'}
          onClick={() => setView('queue')}
        >
          <Stack size={14} /> Queue
        </Button>
        <Button
          size="sm"
          variant={view === 'settings' ? 'solid' : 'ghost'}
          onClick={() => setView('settings')}
        >
          <Gear size={14} /> Settings
        </Button>
      </nav>

      {/* Live totals sit in the chrome so they are always visible */}
      <div className="tabular ml-auto mr-[140px] flex items-center gap-4 text-overlay0">
        {stats.active > 0 && (
          <>
            <span className="text-green">{rate(stats.speed)}</span>
            <span className="text-surface2">/</span>
          </>
        )}
        <span>
          {stats.active} active
          {stats.queued ? ` / ${stats.queued} queued` : ''}
        </span>
      </div>
    </header>
  )
}

function Empty() {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 px-8 text-center">
      <div className="grid h-12 w-12 place-items-center rounded-xl border border-surface0 bg-mantle">
        <DownloadSimple size={20} className="text-overlay0" />
      </div>
      <h2 className="text-[16px] font-semibold text-subtext1">Nothing queued</h2>
      <p className="max-w-[46ch] text-[13px] leading-relaxed text-overlay0">
        Paste a link above and press Enter. Multiple links, one per line, all get queued at once.
        Press Ctrl+L from anywhere to jump to the input.
      </p>
    </div>
  )
}

function SetupOverlay({ items }) {
  const list = Object.values(items)
  return (
    <div className="absolute inset-0 z-50 grid place-items-center bg-crust/92 backdrop-blur-sm">
      <div className="w-[420px] rounded-xl border border-surface0 bg-mantle p-6">
        <h2 className="text-[16px] font-semibold text-text">Getting the toolchain</h2>
        <p className="mt-1.5 text-[13px] leading-relaxed text-overlay1">
          Yoink fetches yt-dlp, FFmpeg and Deno on first run so they stay updatable independently.
          Roughly 120 MB, once.
        </p>
        <div className="mt-5 grid gap-3">
          {['ytdlp', 'ffmpeg', 'deno'].map((key) => {
            const item = items[key]
            const p = item?.phase === 'done' ? 1 : item?.progress || 0
            return (
              <div key={key}>
                <div className="tabular mb-1 flex justify-between text-overlay1">
                  <span>{item?.label || key}</span>
                  <span>
                    {item?.phase === 'done'
                      ? 'ready'
                      : item?.phase === 'error'
                        ? 'failed'
                        : item
                          ? `${Math.round(p * 100)}%`
                          : 'waiting'}
                  </span>
                </div>
                <div className="h-[3px] overflow-hidden rounded-full bg-surface0">
                  <div
                    className="h-full origin-left bg-green transition-transform duration-300 ease-[cubic-bezier(0.23,1,0.32,1)]"
                    style={{ transform: `scaleX(${p})` }}
                  />
                </div>
              </div>
            )
          })}
        </div>
        {list.some((i) => i.phase === 'error') && (
          <p className="mt-4 text-[12px] leading-relaxed text-red">
            Something failed to download. Check your connection, then use Update tools in Settings.
          </p>
        )}
      </div>
    </div>
  )
}

function Toasts() {
  const { toasts, dismissToast } = useStore()
  const icon = { ok: CheckCircle, error: WarningCircle, info: Info }
  const tone = { ok: 'text-green', error: 'text-red', info: 'text-blue' }

  return (
    <div className="pointer-events-none fixed bottom-4 right-4 z-50 flex w-[340px] flex-col gap-2">
      {toasts.map((t) => {
        const Icon = icon[t.tone] || Info
        return (
          <div
            key={t.id}
            className="enter pointer-events-auto flex items-start gap-2.5 rounded-lg border border-surface0 bg-mantle px-3.5 py-2.5 shadow-lg shadow-crust/60"
          >
            <Icon size={16} weight="fill" className={`mt-0.5 shrink-0 ${tone[t.tone]}`} />
            <div className="min-w-0 flex-1">
              <p className="text-[13px] text-text">{t.message}</p>
              {t.detail && (
                <p className="mt-0.5 break-words text-[12px] leading-snug text-overlay0">
                  {t.detail}
                </p>
              )}
            </div>
            <button
              onClick={() => dismissToast(t.id)}
              className="text-overlay0 transition-colors hover:text-text"
              aria-label="Dismiss"
            >
              <X size={13} />
            </button>
          </div>
        )
      })}
    </div>
  )
}

export default function App() {
  const { ready, init, view, setView, jobs, settings, setup } = useStore()

  useEffect(() => {
    init()
  }, [])

  const stats = useMemo(() => {
    const active = jobs.filter((j) => j.status === 'running' || j.status === 'processing')
    return {
      active: active.length,
      queued: jobs.filter((j) => j.status === 'queued').length,
      finished: jobs.filter((j) => ['done', 'error', 'canceled'].includes(j.status)).length,
      speed: active.reduce((sum, j) => sum + (j.speed || 0), 0)
    }
  }, [jobs])

  if (!ready || !settings) {
    return (
      <div className="grid h-full place-items-center bg-crust">
        <span className="tabular text-overlay0">Starting</span>
      </div>
    )
  }

  return (
    <div className="relative flex h-full flex-col bg-crust">
      <TitleBar view={view} setView={setView} stats={stats} />

      {view === 'settings' ? (
        <main className="min-h-0 flex-1">
          <Settings />
        </main>
      ) : (
        <>
          <AddPanel />
          <main className="min-h-0 flex-1 overflow-y-auto">
            {jobs.length === 0 ? (
              <Empty />
            ) : (
              jobs.map((job) => (
                <JobRow
                  key={job.id}
                  job={job}
                  onCancel={api.queue.cancel}
                  onRetry={api.queue.retry}
                  onRemove={api.queue.remove}
                  onReveal={api.reveal}
                />
              ))
            )}
          </main>

          {stats.finished > 0 && (
            <footer className="flex h-9 shrink-0 items-center justify-between border-t border-surface0 bg-mantle/60 px-4">
              <span className="tabular text-overlay0">
                {stats.finished} finished
              </span>
              <Button size="sm" variant="ghost" onClick={api.queue.clearFinished}>
                <Broom size={13} /> Clear finished
              </Button>
            </footer>
          )}
        </>
      )}

      {setup.active && <SetupOverlay items={setup.items} />}
      <Toasts />
    </div>
  )
}
