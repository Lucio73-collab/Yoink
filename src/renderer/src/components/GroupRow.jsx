import React from 'react'
import { motion, AnimatePresence } from 'motion/react'
import { CaretRight, Playlist, X, Trash, ArrowClockwise } from '@phosphor-icons/react'
import JobRow from './JobRow.jsx'
import { rate } from '../lib/format.js'

/**
 * Folds a playlist or Spotify collection into a single row. Collapsed by
 * default once it is running, because 50 expanded track rows is exactly the
 * clutter this exists to remove.
 */
export default function GroupRow({ group, collapsed, onToggle, actions }) {
  const { id, title, jobs } = group

  const done = jobs.filter((j) => j.status === 'done').length
  const failed = jobs.filter((j) => ['error', 'canceled'].includes(j.status)).length
  const running = jobs.filter((j) => j.status === 'running' || j.status === 'processing')
  const active = running.length > 0
  const speed = running.reduce((s, j) => s + (j.speed || 0), 0)

  // Aggregate progress counts each finished item as whole, plus partials.
  const progress = jobs.length
    ? jobs.reduce(
        (sum, j) => sum + (j.status === 'done' ? 1 : j.status === 'running' ? j.progress || 0 : 0),
        0
      ) / jobs.length
    : 0

  const allDone = done + failed === jobs.length
  const state = failed && allDone ? 'error' : allDone ? 'done' : active ? 'running' : 'queued'

  return (
    <div className="mb-1">
      <motion.div
        layout
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.98, transition: { duration: 0.14 } }}
        transition={{ type: 'spring', stiffness: 460, damping: 38 }}
        className="job-row group mx-3 bg-mantle/60 transition-colors duration-150 hover:bg-mantle"
        data-state={state}
        style={{ '--fill': progress }}
      >
        <button
          onClick={onToggle}
          className="flex w-full items-center gap-3 px-3 py-2.5 text-left"
        >
          <span className="grid h-[40px] w-[68px] shrink-0 place-items-center rounded-md bg-surface0">
            <Playlist size={16} className={active ? 'text-green' : 'text-dim'} />
          </span>

          <span className="min-w-0 flex-1">
            <span className="flex items-center gap-2">
              <motion.span
                animate={{ rotate: collapsed ? 0 : 90 }}
                transition={{ duration: 0.18, ease: [0.23, 1, 0.32, 1] }}
                className="text-muted"
              >
                <CaretRight size={13} weight="bold" />
              </motion.span>
              <span className="truncate text-[13.5px] font-medium text-text" title={title}>
                {title}
              </span>
            </span>
            <span className="mt-[3px] flex items-center gap-2 pl-[21px] text-[11.5px] text-muted">
              <span className="tabular">
                {done}/{jobs.length}
              </span>
              <span className="text-surface2">·</span>
              <span>
                {allDone ? (failed ? `${failed} failed` : 'complete') : active ? 'downloading' : 'queued'}
              </span>
              {failed > 0 && !allDone && (
                <>
                  <span className="text-surface2">·</span>
                  <span className="text-red">{failed} failed</span>
                </>
              )}
            </span>
          </span>

          <span className="tabular hidden shrink-0 items-baseline gap-4 text-[11.5px] sm:flex">
            {active && <span className="w-[74px] text-right text-soft">{rate(speed)}</span>}
            <span className="w-[40px] text-right text-[13px] font-medium text-green">
              {Math.round(progress * 100)}%
            </span>
          </span>

          <span className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity duration-150 group-hover:opacity-100">
            {failed > 0 && (
              <span
                role="button"
                tabIndex={0}
                title="Retry failed"
                onClick={(e) => {
                  e.stopPropagation()
                  jobs.filter((j) => ['error', 'canceled'].includes(j.status)).forEach((j) => actions.onRetry(j.id))
                }}
                className="grid h-7 w-7 place-items-center rounded-md text-muted transition-colors duration-150 hover:bg-surface1 hover:text-text"
              >
                <ArrowClockwise size={14} />
              </span>
            )}
            <span
              role="button"
              tabIndex={0}
              title={allDone ? 'Remove all' : 'Cancel all'}
              onClick={(e) => {
                e.stopPropagation()
                jobs.forEach((j) => (allDone ? actions.onRemove(j.id) : actions.onCancel(j.id)))
              }}
              className="grid h-7 w-7 place-items-center rounded-md text-muted transition-colors duration-150 hover:bg-surface1 hover:text-red"
            >
              {allDone ? <Trash size={14} /> : <X size={14} />}
            </span>
          </span>
        </button>
      </motion.div>

      <AnimatePresence initial={false}>
        {!collapsed && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.26, ease: [0.23, 1, 0.32, 1] }}
            className="overflow-hidden"
          >
            <div className="ml-6 mt-1 border-l border-surface1/60 pl-1">
              {jobs.map((job) => (
                <JobRow key={job.id} job={job} {...actions} />
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
