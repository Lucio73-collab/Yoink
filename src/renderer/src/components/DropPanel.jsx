import React, { useState, useEffect } from 'react'
import { useStore } from '../store.js'
import { Button, InfoBar } from './ui/Fluent.jsx'
import { bytes, duration } from '../lib/format.js'

const api = window.yoink

function Glyph({ d, className = 'h-4 w-4' }) {
  return (
    <svg viewBox="0 0 16 16" className={className} fill="none" stroke="currentColor"
         strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round">
      <path d={d} />
    </svg>
  )
}

/** Fluent ContentDialog for files dropped onto the window. */
export default function DropPanel({ files, onClose }) {
  const { toast } = useStore()
  const [mode, setMode] = useState('compress')
  const [presets, setPresets] = useState(null)
  const [infos, setInfos] = useState(null)
  const [target, setTarget] = useState('10mb')
  const [format, setFormat] = useState('mp4')
  const [plans, setPlans] = useState({})

  useEffect(() => {
    api.media.presets().then((r) => r.ok && setPresets(r.data))
    api.media.probe(files).then((r) => {
      if (r.ok) setInfos(r.data)
      else { toast('Could not read those files', 'error', r.error); onClose() }
    })
  }, [])

  useEffect(() => {
    if (!infos || !presets || mode !== 'compress') return
    const t = presets.sizes.find((s) => s.id === target)?.bytes
    if (!t) return
    let cancelled = false
    Promise.all(infos.map((i) => api.media.plan(i.file, t).then((r) => [i.file, r])))
      .then((pairs) => { if (!cancelled) setPlans(Object.fromEntries(pairs)) })
    return () => { cancelled = true }
  }, [infos, presets, target, mode])

  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  async function submit() {
    const size = presets?.sizes.find((s) => s.id === target)
    await api.queue.add(infos.map((info) => ({
      kind: mode,
      file: info.file,
      title: info.name,
      duration: info.duration,
      sourceLabel: mode === 'compress' ? `Compress to ${size?.label}` : `Convert to ${format.toUpperCase()}`,
      targetBytes: size?.bytes,
      targetLabel: size?.label?.replace(' ', ''),
      format
    })))
    toast(`Added ${infos.length} file${infos.length === 1 ? '' : 's'} to the queue`, 'ok')
    onClose()
  }

  const videoFormats = presets?.formats.filter((f) => f.kind === 'video') || []
  const audioFormats = presets?.formats.filter((f) => f.kind === 'audio') || []

  const Chip = ({ selected, children, ...rest }) => (
    <button {...rest}
      className={`h-[32px] rounded-[4px] border px-3 text-[14px] transition-colors duration-100
                  ${selected
                    ? 'border-transparent bg-[var(--color-accent)] font-semibold text-[#101010]'
                    : 'border-[var(--color-stroke-2)] bg-[var(--color-fill-rest)] text-[var(--color-ink)] hover:bg-[var(--color-fill-hover)]'}`}>
      {children}
    </button>
  )

  return (
    <div onClick={onClose} className="acrylic-scrim fixed inset-0 z-50 grid place-items-center p-8">
      <div onClick={(e) => e.stopPropagation()}
        className="flex max-h-[620px] w-full max-w-[560px] flex-col overflow-hidden rounded-[8px]
                   border border-[var(--color-stroke-2)] acrylic enter-scale isolate
                   shadow-[0_32px_64px_rgba(0,0,0,0.5)]">

        <div className="px-6 pb-3 pt-5">
          <h2 className="t-subtitle text-[var(--color-ink)]">
            {files.length} file{files.length === 1 ? '' : 's'}
          </h2>
        </div>

        <div className="flex gap-2 px-6 pb-4">
          {[['compress', 'Compress'], ['convert', 'Convert']].map(([id, label]) => (
            <Chip key={id} selected={mode === id} onClick={() => setMode(id)}>{label}</Chip>
          ))}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-6">
          {mode === 'compress' ? (
            <>
              <div className="t-caption mb-2 text-[var(--color-ink-2)]">Target size</div>
              <div className="mb-4 flex flex-wrap gap-2">
                {presets?.sizes.map((s) => (
                  <Chip key={s.id} selected={target === s.id} onClick={() => setTarget(s.id)} title={s.note}>
                    {s.label}
                  </Chip>
                ))}
              </div>
              {presets?.sizes.find((s) => s.id === target)?.note && (
                <div className="mb-4">
                  <InfoBar severity="informational">
                    {presets.sizes.find((s) => s.id === target).note}
                  </InfoBar>
                </div>
              )}
            </>
          ) : (
            <>
              <div className="t-caption mb-2 text-[var(--color-ink-2)]">Video</div>
              <div className="mb-4 flex flex-wrap gap-2">
                {videoFormats.map((f) => (
                  <Chip key={f.id} selected={format === f.id} onClick={() => setFormat(f.id)}>{f.label}</Chip>
                ))}
              </div>
              <div className="t-caption mb-2 text-[var(--color-ink-2)]">Audio only</div>
              <div className="mb-4 flex flex-wrap gap-2">
                {audioFormats.map((f) => (
                  <Chip key={f.id} selected={format === f.id} onClick={() => setFormat(f.id)}>{f.label}</Chip>
                ))}
              </div>
            </>
          )}

          <div className="t-caption mb-2 text-[var(--color-ink-2)]">Files</div>
          <div className="mb-4 flex flex-col gap-1.5">
            {(infos || files.map((f) => ({ file: f, name: f.split(/[\\/]/).pop() }))).map((info) => {
              const plan = plans[info.file]
              const failed = plan && plan.ok === false
              return (
                <div key={info.file} className="card flex items-center gap-3 px-3 py-2.5">
                  <Glyph d="M2.5 4h11v8h-11zM6.5 6.5l3.5 1.5-3.5 1.5z"
                         className="h-4 w-4 shrink-0 text-[var(--color-ink-3)]" />
                  <div className="min-w-0 flex-1">
                    <div className="t-body truncate text-[var(--color-ink)]">{info.name}</div>
                    {info.duration != null && (
                      <div className="num t-caption mt-0.5 flex items-center gap-1.5 text-[var(--color-ink-3)]">
                        <span>{bytes(info.size)}</span>
                        <span aria-hidden>•</span>
                        <span>{duration(info.duration)}</span>
                        {info.height && (<><span aria-hidden>•</span><span>{info.height}p</span></>)}
                      </div>
                    )}
                  </div>
                  {mode === 'compress' && plan && (
                    <div className="num t-caption shrink-0 text-right">
                      {failed ? (
                        <span className="text-[var(--color-danger)]">Too long</span>
                      ) : (
                        <span className="text-[var(--color-accent-text)]">
                          {plan.data?.height ? `${plan.data.height}p` : 'Same size'}
                          <span className="ml-1.5 text-[var(--color-ink-3)]">
                            {plan.data ? `${plan.data.videoKbps}k` : ''}
                          </span>
                        </span>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>

        <div className="flex items-center gap-3 border-t border-[var(--color-divider)] px-6 py-4">
          <p className="t-caption flex-1 text-[var(--color-ink-3)]">
            {mode === 'compress'
              ? 'Two-pass encode. Resolution is reduced when the bitrate requires it.'
              : format === 'mkv'
                ? 'Copies existing streams. Instant and lossless.'
                : 'This re-encodes the file.'}
          </p>
          <Button appearance="subtle" onClick={onClose}>Cancel</Button>
          <Button appearance="accent" onClick={submit} disabled={!infos}>
            {mode === 'compress' ? 'Compress' : 'Convert'}
          </Button>
        </div>
      </div>
    </div>
  )
}
