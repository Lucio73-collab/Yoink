import React, { useState } from 'react'
import {
  ArrowClockwise,
  FolderOpen,
  X,
  Trash,
  CaretDown,
  MusicNote,
  FilmSlate
} from '@phosphor-icons/react'
import { Button } from './ui/Primitives.jsx'
import { bytes, rate, eta, duration, pct, siteOf } from '../lib/format.js'

const STATE = {
  queued: { label: 'Queued', color: 'text-overlay1' },
  running: { label: 'Downloading', color: 'text-green' },
  processing: { label: 'Processing', color: 'text-teal' },
  done: { label: 'Done', color: 'text-green' },
  error: { label: 'Failed', color: 'text-red' },
  canceled: { label: 'Canceled', color: 'text-overlay0' }
}

export default function JobRow({ job, onCancel, onRetry, onRemove, onReveal }) {
  const [open, setOpen] = useState(false)
  const state = STATE[job.status] || STATE.queued
  const active = job.status === 'running' || job.status === 'processing'
  const indeterminate = job.status === 'processing' || (job.status === 'running' && !job.total)

  return (
    <div
      className="job-row enter rule group"
      data-state={job.status}
      style={{ '--fill': job.progress || 0 }}
    >
      <div className={`flex items-center gap-3 px-4 py-2.5 ${indeterminate ? 'sweep' : ''}`}>
        {/* Thumbnail keeps the row scannable at speed */}
        <div className="relative h-[38px] w-[68px] shrink-0 overflow-hidden rounded bg-surface0">
          {job.thumbnail ? (
            <img
              src={job.thumbnail}
              alt=""
              loading="lazy"
              className="h-full w-full object-cover"
              onError={(e) => (e.currentTarget.style.display = 'none')}
            />
          ) : (
            <div className="grid h-full w-full place-items-center text-overlay0">
              {job.mode === 'audio' ? <MusicNote size={16} /> : <FilmSlate size={16} />}
            </div>
          )}
        </div>

        {/* Identity */}
        <div className="min-w-0 flex-1">
          <div className="truncate text-[13px] font-medium text-text" title={job.title}>
            {job.title}
          </div>
          <div className="tabular mt-0.5 flex items-center gap-2 text-overlay0">
            <span className={state.color}>{state.label}</span>
            <span className="text-surface2">/</span>
            <span>{job.sourceLabel || siteOf(job.url)}</span>
            {job.uploader && (
              <>
                <span className="text-surface2">/</span>
                <span className="truncate max-w-[180px]">{job.uploader}</span>
              </>
            )}
            {job.duration ? (
              <>
                <span className="text-surface2">/</span>
                <span>{duration(job.duration)}</span>
              </>
            ) : null}
          </div>
        </div>

        {/* Telemetry, fixed width so rows never jitter */}
        <div className="tabular hidden w-[210px] shrink-0 items-center justify-end gap-4 text-overlay1 sm:flex">
          {active ? (
            <>
              <span className="w-[70px] text-right">{rate(job.speed)}</span>
              <span className="w-[48px] text-right">{eta(job.eta)}</span>
              <span className="w-[42px] text-right text-subtext1">{pct(job.progress)}</span>
            </>
          ) : job.status === 'done' ? (
            <span className="text-overlay0">{job.total ? bytes(job.total) : ''}</span>
          ) : job.status === 'error' ? (
            <span className="truncate text-red/80" title={job.error}>
              {job.error?.slice(0, 40)}
            </span>
          ) : null}
        </div>

        {/* Actions reveal on hover but stay keyboard reachable */}
        <div className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity duration-150 focus-within:opacity-100 group-hover:opacity-100">
          {job.log?.length > 0 && (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setOpen((v) => !v)}
              aria-label="Toggle log"
              title="Log"
            >
              <CaretDown
                size={14}
                className={`transition-transform duration-150 ${open ? 'rotate-180' : ''}`}
              />
            </Button>
          )}
          {job.status === 'done' && job.file && (
            <Button size="sm" variant="ghost" onClick={() => onReveal(job.file)} title="Show in folder">
              <FolderOpen size={14} />
            </Button>
          )}
          {(job.status === 'error' || job.status === 'canceled') && (
            <Button size="sm" variant="ghost" onClick={() => onRetry(job.id)} title="Retry">
              <ArrowClockwise size={14} />
            </Button>
          )}
          {active || job.status === 'queued' ? (
            <Button size="sm" variant="danger" onClick={() => onCancel(job.id)} title="Cancel">
              <X size={14} />
            </Button>
          ) : (
            <Button size="sm" variant="ghost" onClick={() => onRemove(job.id)} title="Remove">
              <Trash size={14} />
            </Button>
          )}
        </div>
      </div>

      {open && (
        <pre className="tabular max-h-52 overflow-auto border-t border-surface0/60 bg-crust/60 px-4 py-2.5 text-[11px] leading-relaxed text-overlay1">
          {job.log.slice(-120).join('\n')}
        </pre>
      )}
    </div>
  )
}
