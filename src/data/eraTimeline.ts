import type { Era } from './insights'

/*
 * The eras as a timeline that runs down a phone's card: which eras get a
 * label, and where each label sits so none of them overlap.
 */

/** How many bins (weeks or months) an era spans */
export function eraLength(era: Era): number {
  return era.end - era.start + 1
}

/**
 * The eras a card has room for: at most `max`, leaving out the shortest (and,
 * between two as short, the one with less listening). Kept in time order.
 */
export function pickEras(eras: Era[], max: number): { shown: Era[]; hidden: number } {
  if (eras.length <= max) return { shown: eras, hidden: 0 }
  const keep = new Set([...eras].sort((a, b) => eraLength(b) - eraLength(a) || b.ms - a.ms).slice(0, Math.max(0, max)))
  return { shown: eras.filter((e) => keep.has(e)), hidden: eras.length - keep.size }
}

/** The era that lasted longest, the earlier one on a tie */
export function longestEra(eras: Era[]): Era | null {
  return eras.reduce<Era | null>((best, e) => (!best || eraLength(e) > eraLength(best) ? e : best), null)
}

/**
 * Places labels along one axis without overlaps. Label `i` would like to start
 * at `want[i]` (given in axis order), is `size` long and keeps `gap` from the
 * next; all stay within [0, length]. Labels that would collide move as a
 * group, centered on where its members want to be, so each moves as little as
 * the room allows and the order never changes. If they can't all fit, they
 * pack from 0 and the last ones run past `length`.
 */
export function spreadLabels(want: number[], size: number, gap: number, length: number): number[] {
  const step = size + gap
  const groups: { first: number; count: number; start: number }[] = []
  const place = (g: { first: number; count: number; start: number }) => {
    let sum = 0
    for (let k = 0; k < g.count; k++) sum += want[g.first + k] - k * step
    const span = g.count * step - gap
    g.start = Math.max(0, Math.min(length - span, sum / g.count))
  }
  for (let i = 0; i < want.length; i++) {
    const g = { first: i, count: 1, start: 0 }
    place(g)
    groups.push(g)
    // Merge with the group before while they overlap; a merged group can then overlap the one before it
    while (groups.length > 1) {
      const last = groups[groups.length - 1]
      const prev = groups[groups.length - 2]
      if (last.start >= prev.start + prev.count * step) break
      prev.count += last.count
      groups.pop()
      place(prev)
    }
  }
  return groups.flatMap((g) => Array.from({ length: g.count }, (_, k) => g.start + k * step))
}
