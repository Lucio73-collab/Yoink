import React, { useEffect, useRef, useState } from 'react'
import { rate } from '../lib/format.js'

/**
 * A rolling graph of aggregate download speed, sampled on a fixed interval so
 * the line advances at a constant rate regardless of how often yt-dlp reports
 * progress. This is the one piece of the UI that exists purely to make the app
 * feel alive rather than to convey something a number could not.
 */

const POINTS = 48
const SAMPLE_MS = 500

export default function Throughput({ speed, active }) {
  const [history, setHistory] = useState(() => new Array(POINTS).fill(0))
  const speedRef = useRef(speed)
  speedRef.current = speed

  useEffect(() => {
    const id = setInterval(() => {
      setHistory((h) => [...h.slice(1), speedRef.current || 0])
    }, SAMPLE_MS)
    return () => clearInterval(id)
  }, [])

  const peak = Math.max(...history, 1)
  const w = 200
  const h = 44

  // Catmull-Rom style smoothing keeps the line organic without a chart library.
  const pts = history.map((v, i) => [
    (i / (POINTS - 1)) * w,
    h - (v / peak) * (h - 4) - 2
  ])

  let line = ''
  pts.forEach(([x, y], i) => {
    if (i === 0) {
      line += `M ${x} ${y}`
      return
    }
    const [px, py] = pts[i - 1]
    const cx = (px + x) / 2
    line += ` C ${cx} ${py}, ${cx} ${y}, ${x} ${y}`
  })

  const area = `${line} L ${w} ${h} L 0 ${h} Z`
  const idle = !active && history.every((v) => v === 0)

  return (
    <div className="px-3">
      <div className="mb-2 flex items-baseline justify-between">
        <span className="label">Throughput</span>
        <span
          className={`tabular text-[11px] ${active ? 'text-green' : 'text-dim'}`}
        >
          {active ? rate(speed) : 'idle'}
        </span>
      </div>

      <svg
        viewBox={`0 0 ${w} ${h}`}
        preserveAspectRatio="none"
        className="h-11 w-full overflow-visible"
        aria-hidden="true"
      >
        <defs>
          <linearGradient id="tp-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--color-green)" stopOpacity="0.22" />
            <stop offset="100%" stopColor="var(--color-green)" stopOpacity="0" />
          </linearGradient>
        </defs>

        {/* Baseline so the panel does not look broken when idle */}
        <line
          x1="0"
          y1={h - 2}
          x2={w}
          y2={h - 2}
          stroke="var(--color-surface1)"
          strokeWidth="1"
          vectorEffect="non-scaling-stroke"
        />

        {!idle && (
          <>
            <path d={area} fill="url(#tp-fill)" />
            <path
              d={line}
              fill="none"
              stroke={active ? 'var(--color-green)' : 'var(--color-dim)'}
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              vectorEffect="non-scaling-stroke"
              style={{ transition: 'stroke 300ms var(--ease-out)' }}
            />
            {active && (
              <circle
                cx={pts.at(-1)[0]}
                cy={pts.at(-1)[1]}
                r="2.5"
                fill="var(--color-green)"
                vectorEffect="non-scaling-stroke"
              />
            )}
          </>
        )}
      </svg>

      <div className="tabular mt-1 flex justify-between text-[10px] text-dim">
        <span>24s</span>
        <span>peak {peak > 1 ? rate(peak) : '--'}</span>
      </div>
    </div>
  )
}
