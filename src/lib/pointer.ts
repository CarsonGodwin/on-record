import { useEffect, useLayoutEffect, useRef, type PointerEvent, type RefObject } from 'react'

/*
 * On touch screens "pointerleave" fires right after a tap, which would hide a
 * tooltip the moment it appears. These keep tap-to-inspect working on phones
 * while mouse hover behaves as usual.
 */

/** True when the main pointer is a finger, so hints should talk about taps rather than hovering */
export const COARSE = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches

/** True on a phone: a finger on a screen small enough that the Long Play fills it (same breakpoint as the CSS) */
export const PHONE = COARSE && matchMedia('(max-width: 699px), (max-height: 559px)').matches

/** Runs `clear` when a mouse or pen leaves, but not after a tap */
/** The launcher's shortcut as this keyboard writes it: ⌘K on Apple devices, Ctrl K everywhere else */
export const LAUNCH_KEY = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent) ? '⌘K' : 'Ctrl K'

export function leaveUnlessTouch(clear: () => void) {
  return (e: PointerEvent) => {
    if (e.pointerType !== 'touch') clear()
  }
}

/** True for a real hover; false for the move events a touch drag produces */
export function isHover(e: PointerEvent): boolean {
  return e.pointerType !== 'touch'
}

interface HoldDragHandlers {
  onStart: (e: globalThis.PointerEvent) => void
  onMove: (e: globalThis.PointerEvent) => void
  onEnd: () => void
}

/** How long a finger has to rest before it grabs, and how far it can wander meanwhile */
const HOLD_MS = 240
const HOLD_SLOP = 9

/**
 * Touch and hold, then drag: the finger version of hovering. A quick swipe
 * still scrolls the page and a tap is still a tap; only a finger that rests
 * for a moment takes over and stops the page from scrolling under it.
 * Returns a ref that is true while a finger is dragging.
 */
export function useHoldDrag(ref: RefObject<HTMLElement | null>, handlers: HoldDragHandlers): RefObject<boolean> {
  const active = useRef(false)
  const latest = useRef(handlers)
  useLayoutEffect(() => {
    latest.current = handlers
  })

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const fingers = new Set<number>()
    let id: number | null = null
    let timer = 0
    let origin = { x: 0, y: 0 }
    let last: globalThis.PointerEvent | null = null

    const stop = () => {
      window.clearTimeout(timer)
      id = null
      if (!active.current) return
      active.current = false
      latest.current.onEnd()
    }

    const down = (e: globalThis.PointerEvent) => {
      if (e.pointerType !== 'touch') return
      fingers.add(e.pointerId)
      // A second finger is a pinch, not a scrub
      if (fingers.size > 1) return stop()
      id = e.pointerId
      origin = { x: e.clientX, y: e.clientY }
      last = e
      timer = window.setTimeout(() => {
        if (id === null || !last) return
        active.current = true
        navigator.vibrate?.(8)
        latest.current.onStart(last)
      }, HOLD_MS)
    }

    const move = (e: globalThis.PointerEvent) => {
      if (e.pointerId !== id) return
      last = e
      if (active.current) latest.current.onMove(e)
      else if (Math.hypot(e.clientX - origin.x, e.clientY - origin.y) > HOLD_SLOP) {
        // Moving straight away means scrolling: let the page have it
        window.clearTimeout(timer)
        id = null
      }
    }

    const up = (e: globalThis.PointerEvent) => {
      fingers.delete(e.pointerId)
      if (e.pointerId === id) stop()
    }

    // Holding: the finger drags instead of scrolling. This has to be a non-passive touch listener to work.
    const touchmove = (e: TouchEvent) => {
      if (active.current && e.cancelable) e.preventDefault()
    }
    // Android opens a context menu on long press
    const contextmenu = (e: Event) => {
      if (id !== null || active.current) e.preventDefault()
    }

    el.addEventListener('pointerdown', down)
    el.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    window.addEventListener('pointercancel', up)
    el.addEventListener('touchmove', touchmove, { passive: false })
    el.addEventListener('contextmenu', contextmenu)
    return () => {
      window.clearTimeout(timer)
      el.removeEventListener('pointerdown', down)
      el.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      window.removeEventListener('pointercancel', up)
      el.removeEventListener('touchmove', touchmove)
      el.removeEventListener('contextmenu', contextmenu)
    }
  }, [ref])

  return active
}
