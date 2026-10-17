import { useCallback, useEffect, useState, useSyncExternalStore, type RefObject } from 'react'

/** Tracks an element's content-box width */
export function useWidth(ref: RefObject<HTMLElement | null>, fallback = 800): number {
  const [width, setWidth] = useState(fallback)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    // Fires once right away with the current size, then on every change
    const observer = new ResizeObserver(([entry]) => setWidth(Math.round(entry.contentRect.width)))
    observer.observe(el)
    return () => observer.disconnect()
  }, [ref, fallback])
  return width
}

/** True once the element has scrolled into view (and stays true) */
export function useSeen(ref: RefObject<Element | null>, threshold = 0.25): boolean {
  const [seen, setSeen] = useState(false)
  useEffect(() => {
    const el = ref.current
    if (!el || seen) return
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) setSeen(true)
      },
      { threshold },
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [ref, seen, threshold])
  return seen
}

/** The page's scroll offset, tracked only while `enabled` (lets a pinned tooltip stay on its mark) */
export function usePageScroll(enabled: boolean): number {
  const [, setY] = useState(0)
  useEffect(() => {
    if (!enabled) return
    const update = () => setY(window.scrollY)
    window.addEventListener('scroll', update, { passive: true })
    return () => window.removeEventListener('scroll', update)
  }, [enabled])
  // Read live so the first render after pinning is already right; the state just triggers re-renders
  return enabled ? window.scrollY : 0
}

export function prefersReducedMotion(): boolean {
  return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches
}

/** Counts from 0 up to `target` once `active` turns true */
export function useCountUp(target: number, active: boolean, duration = 1600): number {
  const reduced = prefersReducedMotion()
  const [value, setValue] = useState(0)
  useEffect(() => {
    if (!active || reduced) return
    let frame = 0
    const start = performance.now()
    const tick = (now: number) => {
      // A frame's timestamp can be slightly before `start`, so clamp at both ends
      const t = Math.max(0, Math.min(1, (now - start) / duration))
      // Ease out: fast at first, settling at the end
      setValue(target * (1 - Math.pow(1 - t, 4)))
      if (t < 1) frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [target, active, duration, reduced])
  return reduced && active ? target : value
}

/** Whether a media query matches right now, kept up to date as the window changes */
export function useMediaQuery(query: string): boolean {
  const subscribe = useCallback(
    (onChange: () => void) => {
      const list = matchMedia(query)
      list.addEventListener('change', onChange)
      return () => list.removeEventListener('change', onChange)
    },
    [query],
  )
  return useSyncExternalStore(subscribe, () => matchMedia(query).matches)
}
