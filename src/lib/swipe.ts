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
