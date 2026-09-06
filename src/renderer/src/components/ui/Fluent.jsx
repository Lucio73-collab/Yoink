import React from 'react'
import { useReveal } from '../../lib/motion.js'

/**
 * Fluent 2 controls. Every interactive element has explicit Rest, Hover and
 * Pressed states, which is a large part of why Microsoft apps feel solid: a
 * control that only changes on hover feels unfinished when clicked.
 *
 * Standard control height is 32px and corner radius is 4px throughout.
 */

const cx = (...c) => c.filter(Boolean).join(' ')

export function Button({ appearance = 'standard', size = 'md', className, children, ...rest }) {
  const base =
    'no-drag inline-flex items-center justify-center gap-2 rounded-[4px] ' +
    'border transition-[background-color,border-color,color] duration-100 ' +
    'select-none disabled:pointer-events-none disabled:text-[var(--color-ink-4)]'

  const sizes = {
    sm: 'h-[28px] px-2.5 text-[12px]',
    md: 'h-[32px] px-3 text-[14px]',
    lg: 'h-[38px] px-4 text-[14px]'
  }

  const looks = {
    // Accent: the single primary action on a surface.
    accent:
      'bg-[var(--color-accent)] border-transparent text-[#101010] font-semibold ' +
      'hover:bg-[var(--color-accent-hover)] active:bg-[var(--color-accent-press)] ' +
      'disabled:bg-[var(--color-fill-press)] disabled:border-[var(--color-stroke)]',
    // Standard: the default Fluent button, a faint fill with a stroke.
    standard:
      'bg-[var(--color-fill-rest)] border-[var(--color-stroke-2)] text-[var(--color-ink)] ' +
      'hover:bg-[var(--color-fill-hover)] active:bg-[var(--color-fill-press)] active:text-[var(--color-ink-2)]',
    // Subtle: toolbar and icon buttons, transparent until touched.
    subtle:
      'bg-transparent border-transparent text-[var(--color-ink-2)] ' +
      'hover:bg-[var(--color-fill-subtle-hover)] hover:text-[var(--color-ink)] ' +
      'active:bg-[var(--color-fill-subtle-press)] active:text-[var(--color-ink-3)]',
    danger:
      'bg-transparent border-transparent text-[var(--color-danger)] ' +
      'hover:bg-[var(--color-danger-bg)] active:opacity-70'
  }

  useReveal()

  return (
    <button
      className={cx(base, sizes[size], looks[appearance], 'reveal active:scale-[0.97]', className)}
      {...rest}
    >
      {children}
    </button>
  )
}

/**
 * WinUI ProgressRing. The arc rotates while its length grows and shrinks, so
 * it never reads as a static dash being spun around.
 */
export function ProgressRing({ size = 16, className }) {
  return (
    <svg
      viewBox="0 0 32 32"
      width={size}
      height={size}
      className={cx('ring', className)}
      role="progressbar"
      aria-label="Working"
    >
      <circle
        cx="16" cy="16" r="13"
        fill="none"
        stroke="currentColor"
        strokeWidth="3"
      />
    </svg>
  )
}

/**
 * Fluent TextBox. The bottom-edge accent rule on focus is a defining detail
 * of Windows 11 inputs and reads as native immediately.
 */
export function TextBox({ className, multiline, rows, ...rest }) {
  const shared =
    'no-drag w-full rounded-[4px] bg-[var(--color-fill-rest)] px-3 ' +
    'border border-[var(--color-stroke-2)] text-[14px] text-[var(--color-ink)] ' +
    'placeholder:text-[var(--color-ink-3)] transition-colors duration-100 ' +
    'hover:bg-[var(--color-fill-hover)] ' +
    'focus:bg-[var(--color-app)] focus:outline-none ' +
    'focus:border-[var(--color-stroke-2)] focus:[border-bottom-color:var(--color-accent)] ' +
    'focus:[border-bottom-width:2px]'

  if (multiline) {
    return <textarea rows={rows} className={cx(shared, 'resize-none py-1.5 leading-5', className)} {...rest} />
  }
  return <input className={cx(shared, 'h-[32px]', className)} {...rest} />
}

export function Dropdown({ options, className, ...rest }) {
  return (
    <div className="relative">
      <select
        className={cx(
          'no-drag h-[32px] w-full cursor-pointer appearance-none rounded-[4px] pl-3 pr-8',
          'bg-[var(--color-fill-rest)] border border-[var(--color-stroke-2)]',
          'text-[14px] text-[var(--color-ink)] transition-colors duration-100',
          'hover:bg-[var(--color-fill-hover)] focus:outline-none',
          className
        )}
        {...rest}
      >
        {options.map(([v, l]) => (
          <option key={v} value={v} className="bg-[var(--color-elevated)]">
            {l}
          </option>
        ))}
      </select>
      <svg
        className="pointer-events-none absolute right-2.5 top-1/2 h-3 w-3 -translate-y-1/2 text-[var(--color-ink-2)]"
        viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.25"
      >
        <path d="M2.5 4.5L6 8l3.5-3.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </div>
  )
}

/** Fluent ToggleSwitch: 40x20 track, label to the right. */
export function Toggle({ checked, onChange, label, hint, disabled }) {
  return (
    <div className="flex items-start gap-3 py-1.5">
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={cx(
          'no-drag group mt-[2px] flex h-[20px] w-[40px] shrink-0 items-center rounded-full border px-[3px]',
          'transition-colors duration-100 disabled:opacity-40',
          checked
            ? 'border-transparent bg-[var(--color-accent)] hover:bg-[var(--color-accent-hover)]'
            : 'border-[var(--color-ink-2)] bg-transparent hover:bg-[var(--color-fill-hover)]'
        )}
      >
        <span
          className={cx(
            'block h-[12px] w-[12px] rounded-full transition-[transform,width] duration-150',
            'ease-[cubic-bezier(0.1,0.9,0.2,1)] group-active:w-[16px]',
            checked ? 'translate-x-[17px] bg-[#101010]' : 'translate-x-0 bg-[var(--color-ink)]'
          )}
        />
      </button>
      <div className="min-w-0 pt-[1px]">
        <div className="t-body text-[var(--color-ink)]">{label}</div>
        {hint && <div className="t-caption mt-0.5 text-[var(--color-ink-3)]">{hint}</div>}
      </div>
    </div>
  )
}

/**
 * Fluent InfoBar. Windows uses these instead of floating toasts for anything
 * the user may need to read twice or act on.
 */
export function InfoBar({ severity = 'informational', title, children, onDismiss }) {
  const looks = {
    informational: 'bg-[var(--color-card)] border-[var(--color-stroke-2)]',
    success: 'bg-[var(--color-accent-subtle)] border-[rgba(108,203,95,0.28)]',
    error: 'bg-[var(--color-danger-bg)] border-[rgba(255,153,164,0.28)]'
  }
  const dot = {
    informational: 'bg-[var(--color-ink-3)]',
    success: 'bg-[var(--color-success)]',
    error: 'bg-[var(--color-danger)]'
  }
  return (
    <div className={cx('flex items-start gap-3 rounded-[4px] border px-3 py-2.5', looks[severity])}>
      <span className={cx('mt-[7px] h-[6px] w-[6px] shrink-0 rounded-full', dot[severity])} />
      <div className="min-w-0 flex-1">
        {title && <div className="t-body-str text-[var(--color-ink)]">{title}</div>}
        {children && <div className="t-caption mt-0.5 text-[var(--color-ink-2)]">{children}</div>}
      </div>
      {onDismiss && (
        <button
          onClick={onDismiss}
          aria-label="Close"
          className="-mr-1 -mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-[4px] text-[var(--color-ink-2)] transition-colors hover:bg-[var(--color-fill-subtle-hover)] hover:text-[var(--color-ink)]"
        >
          <svg viewBox="0 0 12 12" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="1.25">
            <path d="M2.5 2.5l7 7M9.5 2.5l-7 7" strokeLinecap="round" />
          </svg>
        </button>
      )}
    </div>
  )
}

/** Settings-page row: a card with a label, description and trailing control. */
export function SettingRow({ label, hint, children, className }) {
  useReveal()
  return (
    <div className={cx('card reveal reveal-border flex items-center gap-4 px-4 py-3', className)}>
      <div className="min-w-0 flex-1">
        <div className="t-body text-[var(--color-ink)]">{label}</div>
        {hint && <div className="t-caption mt-0.5 text-[var(--color-ink-3)]">{hint}</div>}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  )
}

export function Field({ label, hint, children }) {
  return (
    <label className="block">
      {label && <span className="t-caption mb-1.5 block text-[var(--color-ink-2)]">{label}</span>}
      {children}
      {hint && <span className="t-caption mt-1.5 block text-[var(--color-ink-3)]">{hint}</span>}
    </label>
  )
}

export function GroupLabel({ children }) {
  return <h3 className="t-body-str mb-2 mt-1 text-[var(--color-ink)]">{children}</h3>
}

/** Fluent ProgressBar. Determinate by value, indeterminate when value is null. */
export function ProgressBar({ value, className, live }) {
  const indet = value == null
  return (
    <div className={cx('bar', indet && 'bar-indet', live && !indet && 'bar-live', className)}>
      <span style={indet ? undefined : { transform: `scaleX(${Math.min(1, value || 0)})`, width: '100%' }} />
    </div>
  )
}
