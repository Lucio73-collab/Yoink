import React from 'react'

const cx = (...c) => c.filter(Boolean).join(' ')

export function Button({ variant = 'ghost', size = 'md', className, children, ...rest }) {
  const base =
    'no-drag inline-flex items-center justify-center gap-2 rounded-md font-medium ' +
    'transition-[transform,background-color,border-color,color] duration-150 ease-out ' +
    'active:scale-[0.98] disabled:pointer-events-none disabled:opacity-40 select-none'

  const sizes = {
    sm: 'h-7 px-2.5 text-[12px]',
    md: 'h-9 px-3.5 text-[13px]',
    lg: 'h-11 px-5 text-[14px]'
  }

  const variants = {
    primary:
      'bg-green text-crust hover:bg-[color-mix(in_oklab,var(--color-green)_88%,white)] font-semibold',
    solid: 'bg-surface0 text-text hover:bg-surface1',
    ghost: 'text-subtext0 hover:bg-surface0 hover:text-text',
    outline: 'border border-surface0 text-subtext1 hover:border-surface1 hover:text-text',
    danger: 'text-red hover:bg-[color-mix(in_oklab,var(--color-red)_14%,transparent)]'
  }

  return (
    <button className={cx(base, sizes[size], variants[variant], className)} {...rest}>
      {children}
    </button>
  )
}

export function Field({ label, hint, children, className }) {
  return (
    <label className={cx('flex flex-col gap-1.5', className)}>
      {label && (
        <span className="text-[11px] font-medium uppercase tracking-[0.08em] text-overlay1">
          {label}
        </span>
      )}
      {children}
      {hint && <span className="text-[12px] leading-snug text-overlay0">{hint}</span>}
    </label>
  )
}

const inputBase =
  'no-drag h-9 w-full rounded-md border border-surface0 bg-mantle px-3 text-[13px] ' +
  'text-text placeholder:text-overlay0 transition-colors duration-150 ' +
  'hover:border-surface1 focus:border-green focus:outline-none'

export function Input({ className, ...rest }) {
  return <input className={cx(inputBase, className)} {...rest} />
}

export function Select({ options, className, ...rest }) {
  return (
    <div className="relative">
      <select
        className={cx(inputBase, 'cursor-pointer appearance-none pr-8', className)}
        {...rest}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value} className="bg-mantle">
            {o.label}
          </option>
        ))}
      </select>
      <svg
        className="pointer-events-none absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-overlay0"
        viewBox="0 0 16 16"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
      >
        <path d="M4 6l4 4 4-4" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </div>
  )
}

export function Toggle({ checked, onChange, label, hint, disabled }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className="no-drag group flex w-full items-start gap-3 rounded-md py-1.5 text-left disabled:opacity-40"
    >
      <span
        className={cx(
          'mt-0.5 flex h-[18px] w-[32px] shrink-0 items-center rounded-full p-[2px]',
          'transition-colors duration-150 ease-out',
          checked ? 'bg-green' : 'bg-surface1 group-hover:bg-surface2'
        )}
      >
        <span
          className={cx(
            'h-[14px] w-[14px] rounded-full bg-crust transition-transform duration-150',
            'ease-[cubic-bezier(0.23,1,0.32,1)]',
            checked ? 'translate-x-[14px]' : 'translate-x-0'
          )}
        />
      </span>
      <span className="min-w-0">
        <span className="block text-[13px] text-subtext1">{label}</span>
        {hint && <span className="block text-[12px] leading-snug text-overlay0">{hint}</span>}
      </span>
    </button>
  )
}

export function Segmented({ value, onChange, options }) {
  return (
    <div className="no-drag inline-flex rounded-md border border-surface0 bg-mantle p-[3px]">
      {options.map((o) => {
        const active = o.value === value
        return (
          <button
            key={o.value}
            onClick={() => onChange(o.value)}
            className={cx(
              'rounded-[5px] px-3 py-1 text-[12px] font-medium transition-colors duration-150',
              active ? 'bg-green text-crust' : 'text-overlay1 hover:text-subtext1'
            )}
          >
            {o.label}
          </button>
        )
      })}
    </div>
  )
}

export function Row({ children, className }) {
  return <div className={cx('grid gap-4 sm:grid-cols-2', className)}>{children}</div>
}

export function SectionTitle({ children, note }) {
  return (
    <div className="mb-3 flex items-baseline justify-between gap-4">
      <h2 className="text-[15px] font-semibold text-text">{children}</h2>
      {note && <span className="text-[12px] text-overlay0">{note}</span>}
    </div>
  )
}
