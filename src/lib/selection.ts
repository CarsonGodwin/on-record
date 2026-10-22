/*
 * The launcher's highlight and Shift selection over a list of rows, as plain
 * functions so they can be tested. The list can start with an "all matches"
 * row that a selection never takes in; `firstPick` is then 1, else 0.
 */

export interface ListSelection {
  /** The highlighted row, or -1 for the first one you'd pick, so a quick Enter never acts on every match */
  active: number
  /** Where a Shift selection started; null while only the highlighted row is picked */
  anchor: number | null
  /**
   * The row the keyboard last put the highlight on (null: the first pickable one). Hovering moves
   * the highlight too, but a Shift-click stretches from here, not from wherever the pointer passed.
   */
  origin: number | null
}

export const NO_SELECTION: ListSelection = { active: -1, anchor: null, origin: null }

/** The highlighted row and the run of rows picked around it, kept inside a list of `count` rows */
export function span(sel: ListSelection, count: number, firstPick: number): { current: number; from: number; to: number } {
  const current = Math.min(sel.active < 0 ? firstPick : sel.active, Math.max(count - 1, 0))
  if (sel.anchor === null) return { current, from: current, to: current }
  return { current, from: Math.min(sel.anchor, current), to: Math.max(sel.anchor, current) }
}

/**
 * An arrow key. On its own the highlight moves and wraps around; with `extend` (Shift) the
 * selection stretches instead, stopping at the ends and never taking in the "all matches" row.
 */
export function arrow(sel: ListSelection, count: number, firstPick: number, step: 1 | -1, extend: boolean): ListSelection {
  if (count === 0) return sel
  const { current } = span(sel, count, firstPick)
  if (!extend) {
    const next = (current + step + count) % count
    return { active: next, anchor: null, origin: next }
  }
  const next = Math.min(Math.max(current + step, firstPick), count - 1)
  return { active: next, anchor: sel.anchor ?? current, origin: next }
}

/** A Shift-click on row `i`: the selection stretches there from where the keyboard left it */
export function stretchTo(sel: ListSelection, count: number, firstPick: number, i: number): ListSelection {
  const anchor = sel.anchor ?? Math.min(sel.origin ?? firstPick, Math.max(count - 1, 0))
  return { active: i, anchor, origin: sel.origin }
}

/** The pointer passing over row `i` moves the highlight, but not while a selection is out, which it would reshape */
export function hover(sel: ListSelection, i: number): ListSelection {
  return sel.anchor === null && sel.active !== i ? { ...sel, active: i } : sel
}

/** After acting on the picked rows: one highlight, where the run started, on whichever row has moved up into its place */
export function settle(sel: ListSelection, count: number, firstPick: number): ListSelection {
  const { from } = span(sel, count, firstPick)
  return { active: from, anchor: null, origin: from }
}
