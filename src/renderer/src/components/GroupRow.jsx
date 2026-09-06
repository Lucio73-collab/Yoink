import React from 'react'
import JobRow from './JobRow.jsx'
import { ProgressBar, Button } from './ui/Fluent.jsx'
import { useReveal, stagger } from '../lib/motion.js'
import { rate } from '../lib/format.js'

function Glyph({ d, className = 'h-4 w-4' }) {
  return (
    <svg viewBox="0 0 16 16" className={className} fill="none" stroke="currentColor"
         strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round">
      <path d={d} />
    </svg>
  )
}

/**
 * A playlist rendered as one expandable Fluent list item. Collapsed by
 * default, because fifty rows for one playlist is the clutter this removes.
 */
export default function GroupRow({ group, collapsed, onToggle, actions, index = 0 }) {
  useReveal()
  const { title, jobs } = group
  const done = jobs.filter((j) => j.status === 'done').length
  const failed = jobs.filter((j) => ['error', 'canceled'].includes(j.status)).length
  const running = jobs.filter((j) => j.status === 'running' || j.status === 'processing')
  const active = running.length > 0
  const speed = running.reduce((s, j) => s + (j.speed || 0), 0)
  const allDone = done + failed === jobs.length

  const progress = jobs.length
    ? jobs.reduce((sum, j) =>
        sum + (j.status === 'done' ? 1 : j.status === 'running' ? j.progress || 0 : 0), 0) / jobs.length
    : 0

  return (
    <div className="mb-1.5" data-flip-key={group.id}>
      <div
           style={{ animationDelay: stagger(index) }}
           className={`card reveal reveal-border enter overflow-hidden ${active ? 'alive' : ''}`}>
        <button onClick={onToggle} aria-expanded={!collapsed}
                className="flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors duration-100 hover:bg-[var(--color-fill-subtle-hover)]">
          <Glyph d="M6 3.5L10.5 8 6 12.5"
                 className={`h-3.5 w-3.5 shrink-0 text-[var(--color-ink-3)] transition-transform duration-150 ${collapsed ? '' : 'rotate-90'}`} />

          <div className="grid h-[40px] w-[68px] shrink-0 place-items-center rounded-[4px] bg-[var(--color-fill-press)]">
            <Glyph d="M2 4h9M2 7h9M2 10h5M12.5 8.5v5l3.5-2.5z"
                   className={`h-4 w-4 ${active ? 'text-[var(--color-accent-text)]' : 'text-[var(--color-ink-4)]'}`} />
          </div>

          <div className="min-w-0 flex-1">
            <div className="t-body truncate text-[var(--color-ink)]" title={title}>{title}</div>
            <div className="t-caption mt-0.5 flex items-center gap-1.5 text-[var(--color-ink-3)]">
              <span className="num">{done} of {jobs.length}</span>
              <span aria-hidden>•</span>
              <span>{allDone ? (failed ? `${failed} failed` : 'Completed') : active ? 'Downloading' : 'Queued'}</span>
              {failed > 0 && !allDone && (
                <>
                  <span aria-hidden>•</span>
                  <span className="text-[var(--color-danger)]">{failed} failed</span>
                </>
              )}
            </div>
            {!allDone && <ProgressBar value={progress} live={active} className="mt-2" />}
          </div>

          <div className="num t-caption hidden shrink-0 items-baseline gap-4 sm:flex">
            {active && <span className="w-[72px] text-right text-[var(--color-ink-2)]">{rate(speed)}</span>}
            <span className="w-[38px] text-right text-[var(--color-ink)]">{Math.round(progress * 100)}%</span>
          </div>

          <span className="flex shrink-0 items-center gap-0.5">
            {failed > 0 && (
              <Button appearance="subtle" size="sm" className="w-[28px] px-0" title="Retry failed"
                onClick={(e) => {
                  e.stopPropagation()
                  jobs.filter((j) => ['error', 'canceled'].includes(j.status)).forEach((j) => actions.onRetry(j.id))
                }}>
                <Glyph d="M13 8a5 5 0 11-1.6-3.7M13 2v3h-3" className="h-3.5 w-3.5" />
              </Button>
            )}
            <Button appearance="subtle" size="sm" className="w-[28px] px-0"
              title={allDone ? 'Remove all' : 'Cancel all'}
              onClick={(e) => {
                e.stopPropagation()
                jobs.forEach((j) => (allDone ? actions.onRemove(j.id) : actions.onCancel(j.id)))
              }}>
              <Glyph d={allDone
                ? 'M3 4.5h10M6.5 4.5V3h3v1.5M4.5 4.5l.6 8.2a1 1 0 001 .8h3.8a1 1 0 001-.8l.6-8.2'
                : 'M3.5 3.5l9 9M12.5 3.5l-9 9'} className="h-3.5 w-3.5" />
            </Button>
          </span>
        </button>
      </div>

      {!collapsed && (
        <div className="ml-6 mt-1.5 border-l border-[var(--color-divider)] pl-3">
          {jobs.map((job, i) => <JobRow key={job.id} index={i} job={job} {...actions} />)}
        </div>
      )}
    </div>
  )
}
