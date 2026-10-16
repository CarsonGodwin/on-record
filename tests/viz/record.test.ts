import { describe, expect, it } from 'vitest'
import {
  MINUTES,
  SLOT_OTHER,
  SLOT_PODCAST,
  buildRecord,
  quietestMinute,
  recordGeometry,
  recordGuides,
  visibleWindow,
} from '../../src/viz/record'
import { formatMonthShort } from '../../src/lib/format'
import { at, play, sorted } from '../helpers'

describe('visibleWindow', () => {
  it('shows everything when no rectangle is given', () => {
    expect(visibleWindow(500, undefined, 10)).toEqual({ rMin: 0, rMax: Infinity, from: 0, to: MINUTES })
  })

  it('shows every time of day while the center is on screen', () => {
    const w = visibleWindow(500, { x0: 0, y0: 0, x1: 1000, y1: 1000 }, 0)
    expect(w.rMin).toBe(0)
    expect(w.rMax).toBeCloseTo(Math.hypot(500, 500))
    expect([w.from, w.to]).toEqual([0, MINUTES])
  })

  it('narrows to the radii and times that reach a rectangle off to one side', () => {
    // To the right of the center: around 6 am, since midnight is at the top and time runs clockwise
    const w = visibleWindow(0, { x0: 100, y0: -50, x1: 200, y1: 50 }, 0)
    expect(w.rMin).toBe(100)
    expect(w.rMax).toBeCloseTo(Math.hypot(200, 50))
    expect(w.from).toBeLessThan(360)
    expect(w.to).toBeGreaterThan(360)
    expect((w.from + w.to) / 2).toBeCloseTo(360)
    // The corners at 100 across and 50 up/down are atan(0.5) either side of 6 am
    expect(w.to - w.from).toBeCloseTo(((2 * Math.atan(0.5)) / (2 * Math.PI)) * MINUTES)
  })

  it('runs past midnight for a rectangle above the center', () => {
    const w = visibleWindow(0, { x0: -50, y0: -200, x1: 50, y1: -100 }, 0)
    expect(w.rMin).toBe(100)
    expect(w.from).toBeGreaterThan(MINUTES / 2)
    expect(w.to).toBeGreaterThan(MINUTES)
    expect((w.from + w.to) / 2).toBeCloseTo(MINUTES)
  })

  it('looks the other way for a rectangle below the center', () => {
    const w = visibleWindow(0, { x0: -50, y0: 100, x1: 50, y1: 200 }, 0)
    expect((w.from + w.to) / 2).toBeCloseTo(MINUTES / 2)
  })

  it('grows with the padding', () => {
    const tight = visibleWindow(0, { x0: 100, y0: -50, x1: 200, y1: 50 }, 0)
    const loose = visibleWindow(0, { x0: 100, y0: -50, x1: 200, y1: 50 }, 20)
    expect(loose.rMin).toBeLessThan(tight.rMin)
    expect(loose.rMax).toBeGreaterThan(tight.rMax)
    expect(loose.to - loose.from).toBeGreaterThan(tight.to - tight.from)
  })

  it('covers every time of day once padding brings the center on screen', () => {
    const w = visibleWindow(0, { x0: 10, y0: 10, x1: 100, y1: 100 }, 20)
    expect(w.rMin).toBe(0)
    expect([w.from, w.to]).toEqual([0, MINUTES])
  })
})

describe('buildRecord', () => {
  it('puts each play on its day, at its time of day', () => {
    const m = buildRecord(sorted([play(at(2024, 1, 10, 9), { msPlayed: 3_600_000 }), play(at(2024, 1, 12, 21, 30), { msPlayed: 600_000 })]), [], null)
    expect(m.days).toBe(3)
    expect(m.count).toBe(2)
    expect([m.ring[0], m.from[0], m.to[0]]).toEqual([0, 540, 600])
    expect([m.ring[1], m.from[1], m.to[1]]).toEqual([2, 1290, 1300])
    expect(m.dayMinutes[0]).toBeCloseTo(60)
    expect(m.dayMinutes[1]).toBe(0)
  })

  it('splits a play that crosses midnight into two arcs', () => {
    const m = buildRecord([play(at(2024, 1, 10, 23, 30), { msPlayed: 3_600_000 })], [], null)
    expect(m.count).toBe(2)
    expect([m.ring[0], m.from[0], m.to[0]]).toEqual([0, 1410, MINUTES])
    expect([m.ring[1], m.from[1], m.to[1]]).toEqual([1, 0, 30])
    expect(m.play[0]).toBe(0)
    expect(m.play[1]).toBe(0)
  })

  it('assigns slots by legend, other artists, and podcasts', () => {
    const m = buildRecord(
      [
        play(at(2024, 1, 10, 9), { artist: 'B' }),
        play(at(2024, 1, 10, 10), { artist: 'Stranger' }),
        play(at(2024, 1, 10, 11), { kind: 'episode' }),
      ],
      ['A', 'B'],
      null,
    )
    expect([...m.slot.slice(0, 3)]).toEqual([1, SLOT_OTHER, SLOT_PODCAST])
  })

  it('spans a whole calendar year when given one, dropping plays outside it', () => {
    const m = buildRecord([play(at(2023, 12, 31, 12)), play(at(2024, 2, 1, 12))], [], 2024)
    expect(m.days).toBe(366)
    expect(m.count).toBe(1)
    expect(m.ring[0]).toBe(31)
  })
})

describe('recordGeometry', () => {
  it('keeps the grooves between the label and the rim', () => {
    const g = recordGeometry(1000, 100)
    expect(g.center).toBe(500)
    expect(g.inner).toBeLessThan(g.outer)
    expect(g.outer).toBeLessThan(g.disc)
    expect(g.label).toBeLessThan(g.inner)
    expect(g.inner + 100 * g.ring).toBeCloseTo(g.outer)
  })
})

describe('recordGuides', () => {
  const guideModel = (from: Date, to: Date) => buildRecord([play(from), play(to)], [], null)

  it('marks month starts for a year or so of history', () => {
    const guides = recordGuides(guideModel(at(2024, 1, 10), at(2024, 4, 20)))
    expect(guides.map((g) => g.label)).toEqual([1, 2, 3].map(formatMonthShort))
    expect(guides[0].ring).toBe(22)
  })

  it('marks year starts for longer history', () => {
    const guides = recordGuides(guideModel(at(2021, 6, 1), at(2024, 6, 1)))
    expect(guides.map((g) => g.label)).toEqual(['2022', '2023', '2024'])
  })

  it('has none for a single month', () => {
    expect(recordGuides(guideModel(at(2024, 1, 2), at(2024, 1, 28)))).toEqual([])
  })
})

describe('quietestMinute', () => {
  it('picks the middle of the two quietest hours', () => {
    // Listening from 6 am to 6 pm every day leaves the evening and night quiet
    const plays = Array.from({ length: 10 }, (_, d) => play(at(2024, 1, 10 + d, 6), { msPlayed: 12 * 3_600_000 }))
    const quiet = quietestMinute(buildRecord(plays, [], null))
    // Anywhere in 6 pm to 6 am, away from the busy daytime
    expect(quiet >= 18 * 60 + 60 || quiet <= 6 * 60 - 60).toBe(true)
    expect(quiet % 30).toBe(0)
  })
})
