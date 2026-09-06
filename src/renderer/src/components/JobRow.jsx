import React, { useState } from 'react'
import { motion, AnimatePresence } from 'motion/react'
import {
  ArrowClockwise,
  FolderOpen,
  X,
  Trash,
  CaretRight,
  MusicNote,
  FilmSlate
} from '@phosphor-icons/react'
import { bytes, rate, eta, duration, siteOf } from '../lib/format.js'

const STATE = {
  queued:     { label: 'Queued',      dot: 'bg-dim' },
  running:    { label: 'Downloading', dot: 'bg-green pulse' },
  processing: { label: 'Processing',  dot: 'bg-green pulse' },
  done:       { label: 'Done',        dot: 'bg-green' },
  error:      { label: 'Failed',      dot: 'bg-red' },
  canceled:   { label: 'Canceled',    dot: 'bg-dim' }
}

function Action({ Icon, onClick, label, danger }) {
  return (
    <button
      onClick={onClick}
      title={label}
      aria-label={label}
      className={`grid h-7 w-7 place-items-center rounded-md transition-colors duration-150
                  ${danger ? 'text-muted hover:bg-surface1 hover:text-red'
                           : 'text-muted hover:bg-surface1 hover:text-text'}`}
    >
      <Icon size={14} />
    </button>
  )
}

export default function JobRow({ job, onCancel, onRetry, onRemove, onReveal }) {
  const [open, setOpen] = useState(false)
  const state = STATE[job.status] || STATE.queued
  const active = job.status === 'running' || job.status === 'processing'
  const indeterminate = job.status === 'processing' || (job.status === 'running' && !job.total)

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.98, transition: { duration: 0.14 } }}
      transition={{ type: 'spring', stiffness: 460, damping: 38 }}
      className="job-row group mx-3 mb-0.5 bg-mantle/40 transition-colors duration-150 hover:bg-mantle"
      data-state={job.status}
      style={{ '--fill': job.progress || 0 }}
    >
      <div className={`flex items-center gap-3 px-3 py-2.5 ${indeterminate ? 'sweep' : ''}`}>
        <div className="relative h-[40px] w-[68px] shrink-0 overflow-hidden rounded-md bg-surface0">
          {job.thumbnail ? (
            <img
              src={job.thumbnail}
              alt=""
              loading="lazy"
              className="h-full w-full object-cover"
              onError={(e) => (e.currentTarget.style.display = 'none')}
            />
          ) : (
            <div className="grid h-full w-full place-items-center text-dim">
              {job.mode === 'audio' ? <MusicNote size={15} /> : <FilmSlate size={15} />}
            </div>
          )}
        </div>

        <div className="min-w-0 flex-1">
          <div className="truncate text-[13.5px] font-medium text-text" title={job.title}>
            {job.title}
          </div>
          <div className="mt-[3px] flex items-center gap-2 text-[11.5px] text-muted">
            <span className={`h-[5px] w-[5px] shrink-0 rounded-full ${state.dot}`} />
            <span className={job.status === 'error' ? 'text-red' : ''}>{state.label}</span>
            <span className="text-surface2">·</span>
            <span className="truncate">{job.sourceLabel || siteOf(job.url)}</span>
            {job.duration ? (
              <>
                <span className="text-surface2">·</span>
                <span className="tabular">{duration(job.duration)}</span>
              </>
            ) : null}
          </div>
        </div>

        {/* Telemetry column, fixed widths so rows never jitter as numbers change */}
        <div className="tabular hidden shrink-0 items-baseline gap-4 text-[11.5px] sm:flex">
          {active ? (
            <>
              <span className="w-[74px] text-right text-soft">{rate(job.speed)}</span>
              <span className="w-[46px] text-right text-muted">{eta(job.eta)}</span>
              <span className="w-[40px] text-right text-[13px] font-medium text-green">
                {Math.round((job.progress || 0) * 100)}%
              </span>
            </>
          ) : job.status === 'done' ? (
            <span className="text-dim">{job.total ? bytes(job.total) : ''}</span>
          ) : job.status === 'error' ? (
            <span className="max-w-[220px] truncate text-red/70" title={job.error}>
              {job.error}
            </span>
          ) : null}
        </div>

        <div className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity duration-150 focus-within:opacity-100 group-hover:opacity-100">
          {job.log?.length > 0 && (
            <button
              onClick={() => setOpen((v) => !v)}
              title="Log"
              aria-label="Toggle log"
              className="grid h-7 w-7 place-items-center rounded-md text-muted transition-colors duration-150 hover:bg-surface1 hover:text-text"
            >
              <motion.span animate={{ rotate: open ? 90 : 0 }} transition={{ duration: 0.16 }}>
                <CaretRight size={14} />
              </motion.span>
            </button>
          )}
          {job.status === 'done' && job.file && (
            <Action Icon={FolderOpen} onClick={() => onReveal(job.file)} label="Show in folder" />
          )}
          {(job.status === 'error' || job.status === 'canceled') && (
            <Action Icon={ArrowClockwise} onClick={() => onRetry(job.id)} label="Retry" />
          )}
          {active || job.status === 'queued' ? (
            <Action Icon={X} onClick={() => onCancel(job.id)} label="Cancel" danger />
          ) : (
            <Action Icon={Trash} onClick={() => onRemove(job.id)} label="Remove" danger />
          )}
        </div>
      </div>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.22, ease: [0.23, 1, 0.32, 1] }}
            className="overflow-hidden"
          >
            <pre className="tabular mx-3 mb-3 max-h-52 overflow-auto rounded-md bg-void px-3 py-2.5 text-[11px] leading-relaxed text-muted">
              {job.log.slice(-120).join('\n')}
            </pre>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}
