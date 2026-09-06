import React, { useEffect, useRef, useState } from 'react'
import { rate } from '../lib/format.js'

/**
 * Throughput over the last 24 seconds. Styled after the graphs in Task
 * Manager and Resource Monitor: a faint grid, a thin accent line, a flat
 * subdued fill. Restrained rather than decorative.
 */

const POINTS = 48
const SAMPLE_MS = 500

export default function Throughput({ speed, active }) {
  const [history, setHistory] = useState(() => new Array(POINTS).fill(0))
  const ref = useRef(speed)
  ref.current = speed

  useEffect(() => {
    const id = setInterval(() => setHistory((h) => [...h.slice(1), ref.current || 0]), SAMPLE_MS)
    return () => clearInterval(id)
  }, [])

  const peak = Math.max(...history, 1)
  const w = 216
  const h = 52

  const pts = history.map((v, i) => [
    (i / (POINTS - 1)) * w,
    h - (v / peak) * (h - 6) - 3
  ])

  let line = ''
  pts.forEach(([x, y], i) => {
    if (i === 0) return (line += `M ${x} ${y}`)
    const [px, py] = pts[i - 1]
    const cx = (px + x) / 2
    line += ` C ${cx} ${py}, ${cx} ${y}, ${x} ${y}`
  })

  const idle = !active && history.every((v) => v === 0)

  return (
    <div className="px-2">
      <div className="mb-1.5 flex items-baseline justify-between px-0.5">
        <span className="t-caption text-[var(--color-ink-3)]">Throughput</span>
        <span className={`num t-caption ${active ? 'text-[var(--color-accent-text)]' : 'text-[var(--color-ink-3)]'}`}>
          {active ? rate(speed) : '0 B/s'}
        </span>
      </div>

      <div className="overflow-hidden rounded-[4px] border border-[var(--color-stroke)] bg-[var(--color-card-2)]">
        <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none"
             className="h-[52px] w-full" aria-hidden="true">
          <defs>
            <linearGradient id="tp" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--color-accent)" stopOpacity="0.20" />
              <stop offset="100%" stopColor="var(--color-accent)" stopOpacity="0.02" />
            </linearGradient>
          </defs>

          {/* Grid, as in Task Manager */}
          {[0.25, 0.5, 0.75].map((f) => (
            <line key={f} x1="0" y1={h * f} x2={w} y2={h * f}
                  stroke="rgba(255,255,255,0.06)" strokeWidth="1"
                  vectorEffect="non-scaling-stroke" />
          ))}

          {!idle && (
            <>
              <path d={`${line} L ${w} ${h} L 0 ${h} Z`} fill="url(#tp)" />
              <path d={line} fill="none" strokeWidth="1.5" className="draw"
                    stroke={active ? 'var(--color-accent)' : 'var(--color-ink-4)'}
                    strokeLinecap="round" strokeLinejoin="round"
                    vectorEffect="non-scaling-stroke" />
            </>
          )}
        </svg>
      </div>

      <div className="mt-1 flex justify-between px-0.5">
        <span className="t-caption text-[var(--color-ink-4)]">24s</span>
        <span className="num t-caption text-[var(--color-ink-4)]">
          {peak > 1 ? `peak ${rate(peak)}` : ''}
        </span>
      </div>
    </div>
  )
}
