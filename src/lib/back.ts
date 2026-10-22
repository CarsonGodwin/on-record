import { useEffect, useLayoutEffect, useRef } from 'react'

/*
 * On a phone's deck the back gesture steps back a card. When something is
 * open over the card (a sheet, the launcher, the tracklist), back closes that
 * first, the way it does in an app. Each open thing registers how to close
 * it; the most recently opened goes first.
 */

const closers: (() => void)[] = []

/** While `open`, the back gesture calls `close` instead of leaving the card */
export function useCloseOnBack(open: boolean, close: () => void) {
  const latest = useRef(close)
  useLayoutEffect(() => {
    latest.current = close
  })
  useEffect(() => {
    if (!open) return
    const fn = () => latest.current()
    closers.push(fn)
    return () => {
      const at = closers.lastIndexOf(fn)
      if (at >= 0) closers.splice(at, 1)
    }
  }, [open])
}

/** Closes whatever was opened last; false when nothing is open */
export function closeTopmost(): boolean {
  const fn = closers.pop()
  if (!fn) return false
  fn()
  return true
}
