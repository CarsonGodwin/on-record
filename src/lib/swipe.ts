import { useRef, type TouchEvent } from 'react'

/*
 * A sideways swipe between cards: quick, mostly horizontal and long enough
 * that it can't be a tap or a wobble. Anything slower or steeper belongs to
 * whatever is under the finger.
 */

/** How far a finger has to travel, in CSS pixels */
export const SWIPE_DISTANCE = 56
/** How long a swipe can take; a slow drag is someone moving something */
export const SWIPE_MS = 650

/** -1 for a swipe towards the previous card (finger moving right), 1 for the next, 0 for neither */
export function swipeDirection(dx: number, dy: number, ms: number): -1 | 0 | 1 {
  if (ms > SWIPE_MS || Math.abs(dx) < SWIPE_DISTANCE || Math.abs(dx) < Math.abs(dy) * 1.6) return 0
  return dx < 0 ? 1 : -1
}

/**
 * Touch handlers that call `onSwipe` for a swipe (see swipeDirection). A touch that starts on something
 * matching `ignore` stays that thing's, and a second finger makes it a pinch. Touch events rather than
 * pointer events: they keep coming even once the browser takes a gesture.
 */
export function useSwipe(onSwipe: (dir: -1 | 1) => void, ignore?: string) {
  const start = useRef<{ x: number; y: number; t: number } | null>(null)
  return {
    onTouchStart(e: TouchEvent) {
      const t = e.touches[0]
      const own = ignore !== undefined && (e.target as Element).closest(ignore) !== null
      start.current = e.touches.length === 1 && !own ? { x: t.clientX, y: t.clientY, t: e.timeStamp } : null
    },
    onTouchEnd(e: TouchEvent) {
      const s = start.current
      start.current = null
      const t = e.changedTouches[0]
      if (!s || !t || e.touches.length > 0) return
      const dir = swipeDirection(t.clientX - s.x, t.clientY - s.y, e.timeStamp - s.t)
      if (dir) onSwipe(dir)
    },
    onTouchCancel() {
      start.current = null
    },
  }
}
