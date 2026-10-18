import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { arcsThrough, createPress } from '../../src/viz/pressing'
import { buildRecord } from '../../src/viz/record'
import { at, play, sorted } from '../helpers'

/** A Path2D that only counts its arcs, and a context that tallies what it strokes since the last clear */
class FakePath {
  arcs = 0
  moveTo() {}
  arc() {
    this.arcs++
  }
}

function fakeContext() {
  const ctx = {
    stroked: 0,
    clears: 0,
    lineCap: '',
    lineWidth: 0,
    strokeStyle: '',
    clearRect() {
      ctx.stroked = 0
      ctx.clears++
    },
    stroke(path: FakePath) {
      ctx.stroked += path.arcs
    },
  }
  return ctx
}

describe('arcsThrough', () => {
  it('counts the arcs on grooves up to and including a day', () => {
    const model = buildRecord(
      sorted([play(at(2024, 3, 1, 9)), play(at(2024, 3, 1, 21)), play(at(2024, 3, 2, 12)), play(at(2024, 3, 4, 12))]),
      [],
      null,
    )
    expect([-1, 0, 1, 2, 3, 99].map((ring) => arcsThrough(model, ring))).toEqual([0, 2, 3, 3, 4, 4])
  })

  it('counts both halves of a play that runs past midnight', () => {
    const model = buildRecord([play(at(2024, 3, 1, 23, 58), { msPlayed: 4 * 60_000 })], [], null)
    expect(model.count).toBe(2)
    expect(arcsThrough(model, 0)).toBe(1)
    expect(arcsThrough(model, 1)).toBe(2)
  })
})

describe('createPress', () => {
  beforeEach(() => vi.stubGlobal('Path2D', FakePath))
  afterEach(() => vi.unstubAllGlobals())

  // Four arcs over three grooves: day 0 has two, days 1 and 3 one each
  const model = () =>
    buildRecord(
      sorted([play(at(2024, 3, 1, 9)), play(at(2024, 3, 1, 21)), play(at(2024, 3, 2, 12)), play(at(2024, 3, 4, 12))]),
      [],
      null,
    )
  const colors = Array.from({ length: 12 }, () => '#fff')
  const press = (data: ReturnType<typeof fakeContext>, focus: ReturnType<typeof fakeContext> | null = null) =>
    createPress(data as unknown as CanvasRenderingContext2D, focus as unknown as CanvasRenderingContext2D, model(), 400, colors)

  it('draws only the new arcs as it presses further', () => {
    const data = fakeContext()
    const p = press(data)
    p.pressTo(0)
    expect(data.stroked).toBe(2)
    p.pressTo(1)
    p.pressTo(1)
    p.pressTo(3)
    expect(data.stroked).toBe(4)
    expect(data.clears).toBe(0)
  })

  it('starts over when pressing goes backwards', () => {
    const data = fakeContext()
    const p = press(data)
    p.pressTo(3)
    p.pressTo(0)
    expect(data.clears).toBe(1)
    expect(data.stroked).toBe(2)
    expect(p.ring).toBe(0)
  })

  it('redraws what is already pressed onto the focus layer, then keeps it up as pressing goes on', () => {
    const data = fakeContext()
    const focus = fakeContext()
    const slot = model().slot[0]
    const p = press(data, focus)
    p.pressTo(1)
    p.setFocus(slot)
    expect(focus.stroked).toBe(3)
    p.pressTo(3)
    expect(focus.stroked).toBe(4)
    p.setFocus(null)
    expect(focus.stroked).toBe(0)
  })
})
