import { useEffect, useRef, useState, useLayoutEffect } from 'react'

const reduced = () =>
  typeof window !== 'undefined' &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches

/**
 * FLIP repositioning for lists.
 *
 * When rows are added, removed or filtered, the survivors normally teleport to
 * their new positions. This measures where each element was, lets React
 * repaint, then plays the difference backwards so everything glides. Done with
 * the Web Animations API rather than an animation library, because the whole
 * technique is about twenty lines and the library was 350 kB.
 */
export function useFlip(deps) {
  const container = useRef(null)
  const positions = useRef(new Map())

  // Measure before the browser paints the new layout.
  useLayoutEffect(() => {
    if (!container.current || reduced()) return
    const next = new Map()
    for (const el of container.current.querySelectorAll('[data-flip-key]')) {
      next.set(el.dataset.flipKey, el.getBoundingClientRect())
    }

    for (const [key, box] of next) {
      const prev = positions.current.get(key)
      if (!prev) continue
      const dx = prev.left - box.left
      const dy = prev.top - box.top
      if (Math.abs(dx) < 1 && Math.abs(dy) < 1) continue

      const el = container.current.querySelector(`[data-flip-key="${CSS.escape(key)}"]`)
      el?.animate(
        [{ transform: `translate(${dx}px, ${dy}px)` }, { transform: 'translate(0, 0)' }],
        { duration: 320, easing: 'cubic-bezier(0.1, 0.9, 0.2, 1)' }
      )
    }

    positions.current = next
  }, deps)

  return container
}

/**
 * Eases a number toward its target and writes it straight to the DOM.
 *
 * The obvious implementation calls setState on every animation frame, which
 * re-renders the whole row. With one of these per speed readout and per
 * percentage, a queue of twenty active downloads would push forty React
 * renders per frame. Writing textContent through a ref animates the same
 * pixels at zero render cost.
 */
export function useSmoothText(target, format) {
  const ref = useRef(null)
  const current = useRef(target || 0)
  const raf = useRef(null)

  useEffect(() => {
    const el = ref.current
    if (!el) return

    if (reduced()) {
      current.current = target || 0
      el.textContent = format(current.current)
      return
    }

    const from = current.current
    const to = target || 0
    if (from === to) {
      el.textContent = format(to)
      return
    }

    const start = performance.now()
    const duration = 400

    const tick = (now) => {
      const t = Math.min(1, (now - start) / duration)
      const eased = 1 - Math.pow(1 - t, 3)
      current.current = from + (to - from) * eased
      el.textContent = format(current.current)
      if (t < 1) raf.current = requestAnimationFrame(tick)
    }
    raf.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf.current)
  }, [target])

  return ref
}

/**
 * Fluent Reveal highlight, delegated.
 *
 * A light follows the cursor across a surface and brightens the nearest
 * border. Attaching a listener per card meant a three hundred item queue
 * carried three hundred listeners, so this installs exactly one on the
 * document and finds the hovered surface by closest(). Coordinates are
 * written at most once per frame.
 */
let revealInstalled = false

function installReveal() {
  if (revealInstalled || typeof document === 'undefined' || reduced()) return
  revealInstalled = true

  let frame = null
  let last = null
  let pending = null

  const apply = () => {
    frame = null
    if (!pending) return
    const { el, x, y } = pending
    el.style.setProperty('--reveal-x', `${x}px`)
    el.style.setProperty('--reveal-y', `${y}px`)
  }

  document.addEventListener(
    'pointermove',
    (e) => {
      const el = e.target?.closest?.('.reveal')
      if (el !== last) {
        // Only the surface under the cursor should paint its gradient.
        if (last) last.style.setProperty('--reveal-o', '0')
        if (el) el.style.setProperty('--reveal-o', '1')
        last = el
      }
      if (!el) return
      const box = el.getBoundingClientRect()
      pending = { el, x: e.clientX - box.left, y: e.clientY - box.top }
      if (!frame) frame = requestAnimationFrame(apply)
    },
    { passive: true }
  )

  document.addEventListener('pointerleave', () => {
    if (last) last.style.setProperty('--reveal-o', '0')
    last = null
  })
}

/** Opts an element into the delegated reveal effect. */
export function useReveal() {
  useEffect(installReveal, [])
  return undefined
}

/**
 * Delays unmount so an element can play an exit animation. React removes
 * children immediately, which means exit transitions never get a chance to
 * run without holding the node for the duration.
 */
export function usePresence(active, duration = 200) {
  const [mounted, setMounted] = useState(active)
  const [leaving, setLeaving] = useState(false)

  useEffect(() => {
    if (active) {
      setMounted(true)
      setLeaving(false)
      return
    }
    if (!mounted) return
    setLeaving(true)
    const id = setTimeout(() => {
      setMounted(false)
      setLeaving(false)
    }, reduced() ? 0 : duration)
    return () => clearTimeout(id)
  }, [active])

  return { mounted, leaving }
}

/** Staggered entrance delay, capped so long lists do not crawl in. */
export function stagger(index, step = 26, max = 260) {
  return `${Math.min(index * step, max)}ms`
}
