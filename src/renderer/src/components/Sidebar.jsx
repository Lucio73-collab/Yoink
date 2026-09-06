import React from 'react'
import Throughput from './Throughput.jsx'
import { useReveal } from '../lib/motion.js'
import { bytes } from '../lib/format.js'

/**
 * Fluent NavigationView. The selection indicator is a short vertical pill on
 * the leading edge, which is the correct Windows pattern rather than a
 * highlighted background alone.
 */

const FILTERS = [
  { id: 'all', label: 'All', icon: 'M2 3h12M2 8h12M2 13h12' },
  { id: 'active', label: 'Active', icon: 'M8 2v9M4.5 7.5L8 11l3.5-3.5M3 14h10' },
  { id: 'done', label: 'Completed', icon: 'M3 8.5L6.5 12 13 4.5' },
  { id: 'failed', label: 'Failed', icon: 'M8 4v5M8 11.5v.5M8 2l6 11H2z' }
]

function Icon({ d }) {
  return (
    <svg viewBox="0 0 16 16" className="h-4 w-4 shrink-0" fill="none"
         stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round">
      <path d={d} />
    </svg>
  )
}

function NavItem({ id, label, icon, count, selected, onClick }) {
  useReveal()
  return (
    <button
      onClick={onClick}
      data-selected={selected}
      aria-current={selected ? 'page' : undefined}
      className={`nav-item reveal no-drag flex h-[36px] w-full items-center gap-3 rounded-[4px] pl-3 pr-2.5
                  text-left transition-colors duration-100
                  ${selected
                    ? 'bg-[var(--color-fill-rest)] text-[var(--color-ink)]'
                    : 'text-[var(--color-ink-2)] hover:bg-[var(--color-fill-subtle-hover)] hover:text-[var(--color-ink)]'}`}
    >
      <Icon d={icon} />
      <span className="t-body flex-1 truncate">{label}</span>
      {count > 0 && (
        <span className="num t-caption text-[var(--color-ink-3)]">{count}</span>
      )}
    </button>
  )
}

export default function Sidebar({ filter, setFilter, counts, stats, onSettings, onOpenFolder }) {
  return (
    <nav className="flex w-[248px] shrink-0 flex-col border-r border-[var(--color-divider)] bg-[var(--color-pane)]">
      <div className="drag-region flex h-[48px] shrink-0 items-center gap-2.5 px-4">
        <span className="grid h-5 w-5 place-items-center rounded-[4px] bg-[var(--color-accent)]">
          <svg viewBox="0 0 16 16" className="h-3 w-3" fill="none" stroke="#101010"
               strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
            <path d="M8 2v8M4.5 6.5L8 10l3.5-3.5M3 13.5h10" />
          </svg>
        </span>
        <span className="t-body-str text-[var(--color-ink)]">Yoink</span>
      </div>

      <div className="flex flex-col gap-0.5 px-2">
        {FILTERS.map((f) => (
          <NavItem key={f.id} {...f} count={counts[f.id]}
                   selected={filter === f.id} onClick={() => setFilter(f.id)} />
        ))}
      </div>

      <div className="mx-4 my-3 h-px bg-[var(--color-divider)]" />

      <div className="px-2">
        <Throughput speed={stats.speed} active={stats.active > 0} />
      </div>

      <div className="mx-4 my-3 h-px bg-[var(--color-divider)]" />

      <div className="px-4">
        <div className="t-caption mb-2 text-[var(--color-ink-3)]">This session</div>
        {[
          ['Completed', counts.done],
          ['Downloaded', stats.totalBytes ? bytes(stats.totalBytes) : '0 B'],
          ['In queue', counts.queued]
        ].map(([k, v]) => (
          <div key={k} className="flex items-baseline justify-between py-[3px]">
            <span className="t-caption text-[var(--color-ink-2)]">{k}</span>
            <span className="num t-caption text-[var(--color-ink)]">{v}</span>
          </div>
        ))}
      </div>

      <div className="mt-auto flex flex-col gap-0.5 p-2">
        <button onClick={onOpenFolder}
          className="no-drag flex h-[36px] items-center gap-3 rounded-[4px] px-3 text-left
                     text-[var(--color-ink-2)] transition-colors duration-100
                     hover:bg-[var(--color-fill-subtle-hover)] hover:text-[var(--color-ink)]">
          <Icon d="M2 4.5A1.5 1.5 0 013.5 3h2.2l1.3 1.5h5.5A1.5 1.5 0 0114 6v5.5A1.5 1.5 0 0112.5 13h-9A1.5 1.5 0 012 11.5z" />
          <span className="t-body">Open folder</span>
        </button>
        <button onClick={onSettings}
          className="no-drag flex h-[36px] items-center gap-3 rounded-[4px] px-3 text-left
                     text-[var(--color-ink-2)] transition-colors duration-100
                     hover:bg-[var(--color-fill-subtle-hover)] hover:text-[var(--color-ink)]">
          <Icon d="M8 10a2 2 0 100-4 2 2 0 000 4zM13 8a5 5 0 00-.1-1l1.3-1-1.5-2.6-1.5.6a5 5 0 00-1.7-1L9.2 1.4H6.8L6.5 3a5 5 0 00-1.7 1l-1.5-.6L1.8 6l1.3 1a5 5 0 000 2l-1.3 1 1.5 2.6 1.5-.6a5 5 0 001.7 1l.3 1.6h2.4l.3-1.6a5 5 0 001.7-1l1.5.6 1.5-2.6-1.3-1c.06-.33.1-.66.1-1z" />
          <span className="t-body">Settings</span>
        </button>
      </div>
    </nav>
  )
}
