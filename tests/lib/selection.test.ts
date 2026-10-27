import { describe, expect, it } from 'vitest'
import { arrow, hover, NO_SELECTION, settle, span, stretchTo, type ListSelection } from '../../src/lib/selection'

const at = (active: number, anchor: number | null = null, origin: number | null = active): ListSelection => ({ active, anchor, origin })

describe('span', () => {
  it('starts on the first row you would pick, past an "all matches" row', () => {
    expect(span(NO_SELECTION, 5, 0)).toEqual({ current: 0, from: 0, to: 0 })
    expect(span(NO_SELECTION, 5, 1)).toEqual({ current: 1, from: 1, to: 1 })
  })

  it('runs from the anchor to the highlight, either way round', () => {
    expect(span(at(4, 2), 6, 0)).toEqual({ current: 4, from: 2, to: 4 })
    expect(span(at(1, 3), 6, 0)).toEqual({ current: 1, from: 1, to: 3 })
  })

  it('keeps the highlight inside a list that got shorter', () => {
    expect(span(at(9), 3, 0).current).toBe(2)
    expect(span(at(9), 0, 0).current).toBe(0)
  })
})

describe('arrow', () => {
  it('moves the highlight and wraps around the ends', () => {
    expect(arrow(at(2), 4, 0, 1, false)).toEqual(at(3))
    expect(arrow(at(3), 4, 0, 1, false)).toEqual(at(0))
    expect(arrow(at(0), 4, 0, -1, false)).toEqual(at(3))
  })

  it('drops a selection when moving without Shift', () => {
    expect(arrow(at(3, 1), 5, 0, 1, false)).toEqual(at(4))
  })

  it('stretches a selection from where the highlight was', () => {
    const one = arrow(at(1), 6, 1, 1, true)
    expect(one).toEqual(at(2, 1))
    expect(span(arrow(one, 6, 1, 1, true), 6, 1)).toEqual({ current: 3, from: 1, to: 3 })
  })

  it('stops a selection at the ends, short of the "all matches" row', () => {
    expect(arrow(at(5, 3), 6, 1, 1, true).active).toBe(5)
    expect(arrow(at(1, 3), 6, 1, -1, true).active).toBe(1)
  })

  it('does nothing in an empty list', () => {
    expect(arrow(NO_SELECTION, 0, 0, 1, false)).toBe(NO_SELECTION)
  })
})

describe('stretchTo', () => {
  it('stretches from where the keyboard left the highlight, not where the pointer passed', () => {
    // The keyboard left it on 2, then the pointer drifted over 4
    const drifted = hover(at(2), 4)
    expect(span(stretchTo(drifted, 8, 0, 6), 8, 0)).toEqual({ current: 6, from: 2, to: 6 })
  })

  it('stretches from the first pickable row when the keyboard hasn’t moved', () => {
    expect(stretchTo(NO_SELECTION, 8, 1, 4)).toEqual({ active: 4, anchor: 1, origin: null })
  })

  it('keeps the anchor of a selection that is already out', () => {
    expect(stretchTo(at(4, 2), 8, 0, 6).anchor).toBe(2)
  })
})

describe('hover', () => {
  it('moves the highlight', () => {
    expect(hover(at(1), 3)).toEqual({ active: 3, anchor: null, origin: 1 })
  })

  it('leaves a selection alone, and returns the same state when nothing moves', () => {
    const out = at(4, 2)
    expect(hover(out, 6)).toBe(out)
    const still = at(3)
    expect(hover(still, 3)).toBe(still)
  })
})

describe('settle', () => {
  it('lands one highlight where the run started', () => {
    expect(settle(at(5, 2), 8, 0)).toEqual(at(2))
    expect(settle(at(2, 5), 8, 0)).toEqual(at(2))
  })
})
