import React, { useState } from 'react'
import { ProgressBar, Button, ProgressRing } from './ui/Fluent.jsx'
import { useReveal, useSmoothText, stagger } from '../lib/motion.js'
import { bytes, rate, eta, duration, siteOf } from '../lib/format.js'

const STATE = {
  queued:     { label: 'Queued' },
  running:    { label: 'Downloading' },
  processing: { label: 'Processing' },
  done:       { label: 'Completed' },
  error:      { label: 'Failed' },
  canceled:   { label: 'Canceled' }
}

function Glyph({ d, className }) {
  return (
    <svg viewBox="0 0 16 16" className={className || 'h-4 w-4'} fill="none"
         stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round">
      <path d={d} />
    </svg>
  )
}

const G = {
  folder: 'M2 4.5A1.5 1.5 0 013.5 3h2.2l1.3 1.5h5.5A1.5 1.5 0 0114 6v5.5A1.5 1.5 0 0112.5 13h-9A1.5 1.5 0 012 11.5z',
  retry: 'M13 8a5 5 0 11-1.6-3.7M13 2v3h-3',
  close: 'M3.5 3.5l9 9M12.5 3.5l-9 9',
  trash: 'M3 4.5h10M6.5 4.5V3h3v1.5M4.5 4.5l.6 8.2a1 1 0 001 .8h3.8a1 1 0 001-.8l.6-8.2',
  chev: 'M6 3.5L10.5 8 6 12.5',
  media: 'M2.5 4h11v8h-11zM6.5 6.5l3.5 1.5-3.5 1.5z'
}

export default function JobRow({ job, onCancel, onRetry, onRemove, onReveal, index = 0 }) {
  const [open, setOpen] = useState(false)
  useReveal()
  // Speed jumps around on every sample; easing it makes the readout legible.
  // These write to the DOM directly, so easing costs no React renders.
  const speedRef = useSmoothText(job.speed || 0, rate)
  const pctRef = useSmoothText((job.progress || 0) * 100, (v) => `${Math.round(v)}%`)
  const state = STATE[job.status] || STATE.queued
  const active = job.status === 'running' || job.status === 'processing'
  const indeterminate = job.status === 'processing' || (job.status === 'running' && !job.total)

  return (
    <div
      data-flip-key={job.id}
      style={{ animationDelay: stagger(index) }}
      className={`card reveal reveal-border enter mb-1.5 overflow-hidden
                  transition-colors duration-150 ${active ? 'alive' : ''}`}
    >
      <div className="flex items-center gap-3 px-3 py-2.5">
        <div className="grid h-[40px] w-[68px] shrink-0 place-items-center overflow-hidden rounded-[4px] bg-[var(--color-fill-press)]">
          {job.thumbnail ? (
            <img src={job.thumbnail} alt="" loading="lazy" className="h-full w-full object-cover"
                 onError={(e) => (e.currentTarget.style.display = 'none')} />
          ) : (
            <Glyph d={G.media} className="h-4 w-4 text-[var(--color-ink-4)]" />
          )}
        </div>

        <div className="min-w-0 flex-1">
          <div className="t-body truncate text-[var(--color-ink)]" title={job.title}>
            {job.title}
          </div>
          <div className="t-caption mt-0.5 flex items-center gap-1.5 text-[var(--color-ink-3)]">
            {job.status === 'processing' && (
              <ProgressRing size={11} className="text-[var(--color-accent-text)]" />
            )}
            <span className={job.status === 'error' ? 'text-[var(--color-danger)]' : ''}>
              {job.recovery && job.status === 'queued' ? job.recovery.action : state.label}
            </span>
            <span aria-hidden>•</span>
            <span className="truncate">{job.sourceLabel || siteOf(job.url)}</span>
            {job.duration ? (
              <>
                <span aria-hidden>•</span>
                <span className="num">{duration(job.duration)}</span>
              </>
            ) : null}
          </div>

          {active && (
            <ProgressBar value={indeterminate ? null : job.progress} live className="mt-2" />
          )}
        </div>

        <div className="num t-caption hidden shrink-0 items-baseline gap-4 text-right sm:flex">
          {active ? (
            <>
              <span ref={speedRef} className="w-[72px] text-[var(--color-ink-2)]" />
              <span className="w-[44px] text-[var(--color-ink-3)]">{eta(job.eta)}</span>
              <span ref={pctRef} className="w-[38px] text-[var(--color-ink)]" />
            </>
          ) : job.status === 'done' ? (
            <span className="text-[var(--color-ink-3)]">{job.total ? bytes(job.total) : ''}</span>
          ) : job.status === 'error' ? (
            <span className="max-w-[240px] truncate text-left text-[var(--color-danger)]" title={job.error}>
              {job.error}
            </span>
          ) : null}
        </div>

        <div className="flex shrink-0 items-center gap-0.5">
          {job.log?.length > 0 && (
            <Button appearance="subtle" size="sm" onClick={() => setOpen((v) => !v)}
                    aria-label="Details" title="Details" className="w-[28px] px-0">
              <Glyph d={G.chev}
                     className={`h-3.5 w-3.5 transition-transform duration-150 ${open ? 'rotate-90' : ''}`} />
            </Button>
          )}
          {job.status === 'done' && job.file && (
            <Button appearance="subtle" size="sm" onClick={() => onReveal(job.file)}
                    aria-label="Show in folder" title="Show in folder" className="w-[28px] px-0">
              <Glyph d={G.folder} className="h-3.5 w-3.5" />
            </Button>
          )}
          {(job.status === 'error' || job.status === 'canceled') && (
            <Button appearance="subtle" size="sm" onClick={() => onRetry(job.id)}
                    aria-label="Retry" title="Retry" className="spin-once w-[28px] px-0">
              <Glyph d={G.retry} className="h-3.5 w-3.5" />
            </Button>
          )}
          {active || job.status === 'queued' ? (
            <Button appearance="subtle" size="sm" onClick={() => onCancel(job.id)}
                    aria-label="Cancel" title="Cancel" className="w-[28px] px-0">
              <Glyph d={G.close} className="h-3.5 w-3.5" />
            </Button>
          ) : (
            <Button appearance="subtle" size="sm" onClick={() => onRemove(job.id)}
                    aria-label="Remove" title="Remove" className="w-[28px] px-0">
              <Glyph d={G.trash} className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>
      </div>

      {open && (
        <pre className="enter max-h-52 overflow-auto border-t border-[var(--color-divider)] bg-[var(--color-app)]
                        px-3 py-2.5 font-[var(--font-mono)] text-[11px] leading-[16px] text-[var(--color-ink-3)]">
          {job.log.slice(-120).join('\n')}
        </pre>
      )}
    </div>
  )
}
