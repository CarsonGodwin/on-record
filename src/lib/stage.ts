import { createContext } from 'react'

/**
 * While The Long Play walks through the page, the id of the one chapter on
 * stage (or of a stop that isn't a chapter); null the rest of the time.
 */
export const OnStage = createContext<string | null>(null)

/** True inside a chapter that is waiting offstage, so things it portals out of itself can hide too */
export const Offstage = createContext(false)

/**
 * Where The Long Play's stop `id` sits in `stops`. When the tour has lost it (a period with no
 * music runs a shorter record), the next stop it does have, going by `order`; failing that, its last.
 */
export function resolveStop(stops: string[], id: string, order: string[]): number {
  const at = stops.indexOf(id)
  if (at >= 0) return at
  const rank = order.indexOf(id)
  const next = stops.findIndex((s) => order.indexOf(s) > rank)
  return next >= 0 ? next : stops.length - 1
}
