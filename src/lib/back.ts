import { useContext, useEffect, useLayoutEffect, useRef } from 'react'
import { Offstage } from './stage'

/*
 * On a phone's deck the back gesture steps back a card. When something is
 * open over the card (a sheet, the launcher, the tracklist), back closes that
 * first, the way it does in an app. Each open thing registers how to close
 * it; the most recently opened goes first.
 */

const closers: (() => void)[] = []

/**
 * While `open`, the back gesture calls `close` instead of leaving the card. A sheet left open on a
 * card you've moved on from stays open (cards keep their state offstage), but it isn't what back
 * should close: it steps aside until its card is dealt again.
 */
export function useCloseOnBack(open: boolean, close: () => void) {
  const offstage = useContext(Offstage)
  const active = open && !offstage
  const latest = useRef(close)
  useLayoutEffect(() => {
    latest.current = close
  })
  useEffect(() => {
    if (!active) return
    const fn = () => latest.current()
    closers.push(fn)
    return () => {
      const at = closers.lastIndexOf(fn)
      if (at >= 0) closers.splice(at, 1)
    }
  }, [active])
}

/** Closes whatever was opened last; false when nothing is open */
export function closeTopmost(): boolean {
  const fn = closers.pop()
  if (!fn) return false
  fn()
  return true
}
