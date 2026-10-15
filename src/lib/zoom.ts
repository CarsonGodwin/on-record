import { useCallback, useEffect, useRef, useState, type RefObject } from 'react'

/*
 * Pan and zoom for a fixed-size box: pinch with two fingers, pinch on a
 * trackpad (or ⌘/ctrl + scroll), drag to pan once zoomed in. At 1× a single
 * finger still scrolls the page; zoomed in, it pans instead. A drag never
 * counts as a click, so tap-to-select keeps working underneath.
 *
 * The view maps content to screen: screen = view.x + view.s * content.
 */

export interface View {
  s: number
  x: number
  y: number
}

export const IDENTITY: View = { s: 1, x: 0, y: 0 }

export interface PanZoom {
  view: View
  max: number
  zoomBy: (factor: number) => void
  reset: () => void
}

interface Options {
  width: number
  height: number
  max: number
}

interface Point {
  x: number
  y: number
}

/** Pixels a press can wander before it counts as a drag rather than a tap */
const DRAG_SLOP = 5

export function usePanZoom(ref: RefObject<HTMLElement | null>, { width, height, max }: Options): PanZoom {
  const [view, setViewState] = useState<View>(IDENTITY)
  const viewRef = useRef(view)
  const bounds = useRef({ width, height, max })
  const tween = useRef(0)

  const clamp = useCallback((v: View): View => {
    const { width: w, height: h, max: m } = bounds.current
    const s = Math.min(m, Math.max(1, v.s))
    return { s, x: Math.min(0, Math.max(w - w * s, v.x)), y: Math.min(0, Math.max(h - h * s, v.y)) }
  }, [])

  const setView = useCallback(
    (v: View) => {
      const next = clamp(v)
      const cur = viewRef.current
      if (next.s === cur.s && next.x === cur.x && next.y === cur.y) return
      viewRef.current = next
      setViewState(next)
    },
    [clamp],
  )

  /** Zooms by `factor`, keeping the content under (px, py) where it is */
  const zoomAt = useCallback(
    (factor: number, px: number, py: number, from = viewRef.current): View => {
      const s = Math.min(bounds.current.max, Math.max(1, from.s * factor))
      const k = s / from.s
      return clamp({ s, x: px - (px - from.x) * k, y: py - (py - from.y) * k })
    },
    [clamp],
  )

  /** Eases to a view, for the buttons */
  const animateTo = useCallback(
    (target: View) => {
      cancelAnimationFrame(tween.current)
      const from = viewRef.current
      const start = performance.now()
      const step = (now: number) => {
        const t = Math.min(1, (now - start) / 220)
        const e = 1 - Math.pow(1 - t, 3)
        setView({ s: from.s + (target.s - from.s) * e, x: from.x + (target.x - from.x) * e, y: from.y + (target.y - from.y) * e })
        if (t < 1) tween.current = requestAnimationFrame(step)
      }
      tween.current = requestAnimationFrame(step)
    },
    [setView],
  )

  const zoomBy = useCallback(
    (factor: number) => animateTo(zoomAt(factor, bounds.current.width / 2, bounds.current.height / 2)),
    [animateTo, zoomAt],
  )
  const reset = useCallback(() => animateTo(IDENTITY), [animateTo])

  // A new size means new content coordinates: start over
  const sizeKey = `${width}×${height}×${max}`
  const [lastSizeKey, setLastSizeKey] = useState(sizeKey)
  if (sizeKey !== lastSizeKey) {
    setLastSizeKey(sizeKey)
    setViewState(IDENTITY)
  }
  useEffect(() => {
    bounds.current = { width, height, max }
    cancelAnimationFrame(tween.current)
    viewRef.current = IDENTITY
  }, [width, height, max])

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const pts = new Map<number, Point>()
    let start: { view: View; pts: Point[] } | null = null
    let dragged = false
    let gestureStart = 1

    const local = (e: { clientX: number; clientY: number }): Point => {
      const r = el.getBoundingClientRect()
      return { x: e.clientX - r.left, y: e.clientY - r.top }
    }
    // Every time a finger lands or lifts, the gesture restarts from where things are now
    const restart = () => {
      start = pts.size ? { view: viewRef.current, pts: [...pts.values()] } : null
      el.classList.toggle('is-panning', dragged && pts.size > 0)
    }

    const down = (e: PointerEvent) => {
      if (e.pointerType === 'mouse' && e.button !== 0) return
      cancelAnimationFrame(tween.current)
      if (pts.size === 0) dragged = false
      pts.set(e.pointerId, local(e))
      restart()
    }

    const move = (e: PointerEvent) => {
      if (!start || !pts.has(e.pointerId)) return
      pts.set(e.pointerId, local(e))
      const now = [...pts.values()]
      const v0 = start.view
      if (now.length >= 2 && start.pts.length >= 2) {
        const [a, b] = now
        const [a0, b0] = start.pts
        const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
        const mid0 = { x: (a0.x + b0.x) / 2, y: (a0.y + b0.y) / 2 }
        const d0 = Math.hypot(a0.x - b0.x, a0.y - b0.y) || 1
        const s = Math.min(bounds.current.max, Math.max(1, (v0.s * Math.hypot(a.x - b.x, a.y - b.y)) / d0))
        // The content point that was under the fingers' midpoint follows the midpoint
        const cx = (mid0.x - v0.x) / v0.s
        const cy = (mid0.y - v0.y) / v0.s
        dragged = true
        setView({ s, x: mid.x - cx * s, y: mid.y - cy * s })
        return
      }
      if (v0.s <= 1) return
      const p = now[0]
      const p0 = start.pts[0]
      if (!dragged) {
        if (Math.hypot(p.x - p0.x, p.y - p0.y) < DRAG_SLOP) return
        dragged = true
        el.setPointerCapture(e.pointerId)
        el.classList.add('is-panning')
      }
      setView({ s: v0.s, x: v0.x + p.x - p0.x, y: v0.y + p.y - p0.y })
    }

    const up = (e: PointerEvent) => {
      if (!pts.delete(e.pointerId)) return
      restart()
    }

    // Swallow the click that ends a drag or pinch
    const click = (e: MouseEvent) => {
      if (!dragged) return
      dragged = false
      e.stopPropagation()
      e.preventDefault()
    }

    // Trackpad pinch arrives as ctrl + wheel in Chrome, Firefox and Edge; ⌘ + scroll works with a mouse
    const wheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return
      e.preventDefault()
      cancelAnimationFrame(tween.current)
      const p = local(e)
      // Trackpads send small deltas, mouse wheels big notches: cap a notch at about 1.6×
      const delta = Math.max(-50, Math.min(50, e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY))
      setView(zoomAt(Math.exp(-delta * 0.01), p.x, p.y))
    }

    // Safari on a Mac sends trackpad pinches as gesture events instead
    type Gesture = Event & { scale: number; clientX: number; clientY: number }
    const gestureBegin = (e: Event) => {
      e.preventDefault()
      gestureStart = viewRef.current.s
    }
    const gestureChange = (e: Event) => {
      e.preventDefault()
      // On iPhone the pointer events above already handle the pinch
      if (pts.size >= 2) return
      const g = e as Gesture
      const p = local(g)
      setView(zoomAt((gestureStart * g.scale) / viewRef.current.s, p.x, p.y))
    }

    el.addEventListener('pointerdown', down)
    el.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    window.addEventListener('pointercancel', up)
    el.addEventListener('click', click, true)
    el.addEventListener('wheel', wheel, { passive: false })
    el.addEventListener('gesturestart', gestureBegin)
    el.addEventListener('gesturechange', gestureChange)
    return () => {
      el.removeEventListener('pointerdown', down)
      el.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      window.removeEventListener('pointercancel', up)
      el.removeEventListener('click', click, true)
      el.removeEventListener('wheel', wheel)
      el.removeEventListener('gesturestart', gestureBegin)
      el.removeEventListener('gesturechange', gestureChange)
      cancelAnimationFrame(tween.current)
    }
  }, [ref, setView, zoomAt])

  return { view, max, zoomBy, reset }
}
