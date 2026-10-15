import type { PointerEvent } from 'react'

/*
 * On touch screens "pointerleave" fires right after a tap, which would hide a
 * tooltip the moment it appears. These keep tap-to-inspect working on phones
 * while mouse hover behaves as usual.
 */

/** Runs `clear` when a mouse or pen leaves, but not after a tap */
export function leaveUnlessTouch(clear: () => void) {
  return (e: PointerEvent) => {
    if (e.pointerType !== 'touch') clear()
  }
}

/** True for a real hover; false for the move events a touch drag produces */
export function isHover(e: PointerEvent): boolean {
  return e.pointerType !== 'touch'
}
