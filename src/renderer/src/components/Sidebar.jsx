import React from 'react'
import { motion } from 'motion/react'
import {
  Stack,
  ArrowsDownUp,
  CheckCircle,
  WarningCircle,
  Gear,
  DownloadSimple,
  FolderOpen
} from '@phosphor-icons/react'
import Throughput from './Throughput.jsx'
import { bytes } from '../lib/format.js'

const FILTERS = [
  { id: 'all', label: 'All', Icon: Stack },
  { id: 'active', label: 'Active', Icon: ArrowsDownUp },
  { id: 'done', label: 'Done', Icon: CheckCircle },
  { id: 'failed', label: 'Failed', Icon: WarningCircle }
]

function NavItem({ id, label, Icon, count, active, onClick }) {
  return (
    <button
      onClick={onClick}
      className="no-drag relative flex w-full items-center gap-2.5 rounded-lg px-2.5 py-[7px] text-left"
    >
      {/*
        Shared layout animation: one pill slides between items rather than
        each item fading its own background. A left border as the active
        marker is the default everyone reaches for, so this does the job
        with movement instead.
      */}
      {active && (
        <motion.span
          layoutId="nav-active"
          className="absolute inset-0 rounded-lg bg-surface0"
          transition={{ type: 'spring', stiffness: 420, damping: 34 }}
        />
      )}
      <Icon
        size={15}
        weight={active ? 'fill' : 'regular'}
        className={`relative z-10 shrink-0 transition-colors duration-150 ${
          active ? 'text-green' : 'text-muted'
        }`}
      />
      <span
        className={`relative z-10 flex-1 text-[13px] transition-colors duration-150 ${
          active ? 'text-bright' : 'text-soft'
        }`}
      >
        {label}
      </span>
      {count > 0 && (
        <span
          className={`tabular relative z-10 text-[11px] transition-colors duration-150 ${
            active ? 'text-subtext' : 'text-dim'
          }`}
        >
          {count}
        </span>
      )}
    </button>
  )
}

function Stat({ label, value }) {
  return (
    <div className="flex items-baseline justify-between px-3 py-[3px]">
      <span className="text-[11.5px] text-muted">{label}</span>
      <span className="tabular text-[11.5px] text-subtext">{value}</span>
    </div>
  )
}

export default function Sidebar({ filter, setFilter, counts, stats, onSettings, onOpenFolder }) {
  return (
    <aside className="flex w-[228px] shrink-0 flex-col bg-crust">
      {/* Wordmark doubles as the drag handle on the left edge */}
      <div className="drag-region flex h-[52px] shrink-0 items-center gap-2.5 px-4">
        <span className="grid h-[22px] w-[22px] shrink-0 place-items-center rounded-[7px] bg-green text-crust">
          <DownloadSimple size={13} weight="bold" />
        </span>
        <span className="font-display text-[15px] font-semibold tracking-tight text-bright">
          Yoink
        </span>
      </div>

      <nav className="flex flex-col gap-0.5 px-2.5 pt-1">
        {FILTERS.map((f) => (
          <NavItem
            key={f.id}
            {...f}
            count={counts[f.id]}
            active={filter === f.id}
            onClick={() => setFilter(f.id)}
          />
        ))}
      </nav>

      <div className="mx-4 my-4 h-px hairline" />

      <Throughput speed={stats.speed} active={stats.active > 0} />

      <div className="mx-4 my-4 h-px hairline" />

      <div className="flex flex-col">
        <div className="mb-1 px-3">
          <span className="label">Session</span>
        </div>
        <Stat label="Completed" value={counts.done} />
        <Stat label="Downloaded" value={stats.totalBytes ? bytes(stats.totalBytes) : '--'} />
        <Stat label="In queue" value={counts.queued} />
      </div>

      <div className="mt-auto flex flex-col gap-0.5 p-2.5">
        <button
          onClick={onOpenFolder}
          className="no-drag flex items-center gap-2.5 rounded-lg px-2.5 py-[7px] text-left text-[13px] text-soft transition-colors duration-150 hover:bg-surface0 hover:text-text"
        >
          <FolderOpen size={15} className="text-muted" />
          Open folder
        </button>
        <button
          onClick={onSettings}
          className="no-drag flex items-center gap-2.5 rounded-lg px-2.5 py-[7px] text-left text-[13px] text-soft transition-colors duration-150 hover:bg-surface0 hover:text-text"
        >
          <Gear size={15} className="text-muted" />
          Settings
        </button>
      </div>
    </aside>
  )
}
