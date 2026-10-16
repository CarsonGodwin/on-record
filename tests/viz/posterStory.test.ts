import { describe, expect, it } from 'vitest'
import { formatMonthShort } from '../../src/lib/format'
import { circularMean, clock, driftScale, findEraRuns, monthly, spreadEras, type Month } from '../../src/viz/posterStory'
import { SLOT_OTHER, SLOT_PODCAST, buildRecord, MINUTES } from '../../src/viz/record'
import { at, play, sorted } from '../helpers'

const HOUR = 3_600_000

/** A month with the given minutes per top-10 slot, e.g. `month({ 0: 100 })` */
function month(slots: Record<number, number> = {}): Month {
  const filled = Array(SLOT_OTHER).fill(0)
  for (const [slot, minutes] of Object.entries(slots)) filled[Number(slot)] = minutes
  return { ring0: 0, ring1: 1, label: '', minute: null, slots: filled, total: 0, year: 2024, month: 0 }
}

/** One month per entry, each led by the given slot with 100 minutes */
const led = (...slots: number[]) => slots.map((slot) => month({ [slot]: 100 }))

const distance = (a: number, b: number) => {
  const d = Math.abs(a - b) % MINUTES
  return Math.min(d, MINUTES - d)
}

describe('monthly', () => {
  const plays = sorted([
    play(at(2024, 1, 15, 20), { artist: 'A', msPlayed: HOUR }),
    play(at(2024, 2, 10, 8), { artist: 'B', msPlayed: HOUR / 2 }),
    play(at(2024, 3, 5, 20), { artist: 'A', msPlayed: HOUR }),
  ])
  const model = buildRecord(plays, ['A'], null)

  it('splits the rings at calendar month starts', () => {
    const months = monthly(model, 'month', false)
    expect(months.map((m) => m.month)).toEqual([0, 1, 2])
    expect(months[0].ring0).toBe(0)
    expect(months[0].ring1).toBe(months[1].ring0)
    expect(months[1].ring1).toBe(months[2].ring0)
    expect(months[2].ring1).toBe(model.days)
    // Jan 15 to Jan 31 is 17 grooves
    expect(months[0].ring1 - months[0].ring0).toBe(17)
  })

  it('labels by month, with the year when asked', () => {
    expect(monthly(model, 'month', false)[0].label).toBe(formatMonthShort(0))
    expect(monthly(model, 'month', true)[0].label).toBe(`${formatMonthShort(0)} ’24`)
  })

  it('groups by quarter and by year', () => {
    const wide = buildRecord(sorted([play(at(2023, 11, 20)), play(at(2024, 5, 2))]), [], null)
    expect(monthly(wide, 'quarter', false).map((m) => [m.year, m.month])).toEqual([
      [2023, 10],
      [2024, 0],
      [2024, 3],
    ])
    const years = monthly(wide, 'year', true)
    expect(years.map((m) => m.label)).toEqual(['2023', '2024'])
  })

  it('totals listening and splits music by top-artist slot', () => {
    const mixed = buildRecord(
      sorted([
        play(at(2024, 1, 10, 10), { artist: 'A', msPlayed: HOUR }),
        play(at(2024, 1, 11, 10), { artist: 'Nobody', msPlayed: HOUR / 2 }),
        play(at(2024, 1, 12, 10), { kind: 'episode', msPlayed: HOUR / 4 }),
      ]),
      ['A'],
      null,
    )
    const [jan] = monthly(mixed, 'month', false)
    expect(jan.slots[0]).toBeCloseTo(60)
    expect(jan.slots.slice(1).every((v) => v === 0)).toBe(true)
    // Other artists and podcasts count toward the total but have no slot of their own
    expect(jan.total).toBeCloseTo(60 + 30 + 15)
    expect(SLOT_PODCAST).toBeGreaterThan(SLOT_OTHER)
    expect(jan.slots).toHaveLength(SLOT_OTHER)
  })

  it('finds the usual time of day', () => {
    // 8 pm to 9 pm: the middle is 8:30 pm
    const [jan] = monthly(buildRecord([play(at(2024, 1, 15, 20), { msPlayed: HOUR })], [], null), 'month', false)
    expect(jan.minute).toBeCloseTo(20.5 * 60, 3)
  })

  it('leaves the time null when there is hardly any listening', () => {
    const [jan] = monthly(buildRecord([play(at(2024, 1, 15, 20), { msPlayed: 30 * 60_000 })], [], null), 'month', false)
    expect(jan.total).toBeCloseTo(30)
    expect(jan.minute).toBeNull()
  })

  it('smooths a month toward its neighbours', () => {
    const smoothed = monthly(
      buildRecord(
        sorted([
          play(at(2024, 1, 15, 2), { msPlayed: HOUR }),
          play(at(2024, 2, 15, 2), { msPlayed: HOUR }),
          play(at(2024, 3, 15, 8), { msPlayed: HOUR }),
        ]),
        [],
        null,
      ),
      'month',
      false,
    )
    // February sits at 2:30 am by itself; March at 8:30 am pulls it later
    expect(smoothed[1].minute!).toBeGreaterThan(2.5 * 60)
    expect(smoothed[1].minute!).toBeLessThan(8.5 * 60)
    // February's own weight is double, so it stays closer to itself than to March
    expect(distance(smoothed[1].minute!, 2.5 * 60)).toBeLessThan(distance(smoothed[1].minute!, 8.5 * 60))
  })
})

describe('findEraRuns', () => {
  it('finds nothing in an empty or silent history', () => {
    expect(findEraRuns([], 3)).toEqual([])
    expect(findEraRuns([month(), month(), month()], 3)).toEqual([])
  })

  it('makes one era when one artist leads throughout', () => {
    expect(findEraRuns(led(0, 0, 0, 0), 3)).toEqual([{ slot: 0, first: 0, last: 3 }])
  })

  it('splits where the leader changes', () => {
    expect(findEraRuns(led(0, 0, 1, 1, 1, 1), 3)).toEqual([
      { slot: 0, first: 0, last: 1 },
      { slot: 1, first: 2, last: 5 },
    ])
  })

  it('drops a run of a single month', () => {
    const months = [...led(0, 0, 0, 0), month({ 1: 150 })]
    expect(findEraRuns(months, 3)).toEqual([{ slot: 0, first: 0, last: 3 }])
  })

  it('joins runs of the same artist split by a one-month interruption', () => {
    // Slot 1 leads only the middle month, where slot 0 is quiet
    const months = [month({ 0: 100 }), month(), month({ 1: 50 }), month(), month({ 0: 100 })]
    expect(findEraRuns(months, 3)).toEqual([{ slot: 0, first: 0, last: 4 }])
  })

  it('keeps the longest runs, in time order', () => {
    const months = led(0, 0, 1, 1, 1, 1, 2, 2, 2)
    expect(findEraRuns(months, 9)).toEqual([
      { slot: 0, first: 0, last: 1 },
      { slot: 1, first: 2, last: 5 },
      { slot: 2, first: 6, last: 8 },
    ])
    expect(findEraRuns(months, 2)).toEqual([
      { slot: 1, first: 2, last: 5 },
      { slot: 2, first: 6, last: 8 },
    ])
  })
})

describe('spreadEras', () => {
  const months = led(0, 0, 0, 0, 1, 1, 1, 1, 2, 2, 2, 2)

  it('takes the longest era from each equal slice of the history', () => {
    expect(spreadEras(months, 3)).toEqual([
      { slot: 0, first: 0, last: 3 },
      { slot: 1, first: 4, last: 7 },
      { slot: 2, first: 8, last: 11 },
    ])
    expect(spreadEras(months, 2).map((e) => e.slot)).toEqual([0, 2])
  })

  it('never picks the same era twice', () => {
    expect(spreadEras(led(0, 0, 0, 0, 0, 0), 3)).toEqual([{ slot: 0, first: 0, last: 5 }])
  })

  it('returns nothing when there are no eras', () => {
    expect(spreadEras([], 3)).toEqual([])
    expect(spreadEras([month(), month()], 2)).toEqual([])
  })
})

describe('circularMean', () => {
  it('averages ordinary times', () => {
    expect(circularMean([60, 120])).toBeCloseTo(90)
    expect(circularMean([600])).toBeCloseTo(600)
    expect(circularMean([720])).toBeCloseTo(720)
  })

  it('wraps around midnight instead of landing at noon', () => {
    expect(distance(circularMean([1430, 10]), 0)).toBeLessThan(1e-6)
    expect(distance(circularMean([1380, 60]), 0)).toBeLessThan(1e-6)
    expect(distance(circularMean([1420, 20, 1430, 10]), 0)).toBeLessThan(1e-6)
  })

  it('always lands within a day', () => {
    for (const set of [[1439], [1, 2], [1300, 100], [0, 0]]) {
      const m = circularMean(set)
      expect(m).toBeGreaterThanOrEqual(0)
      expect(m).toBeLessThan(MINUTES)
    }
  })

  it('is midnight for no times', () => {
    expect(circularMean([])).toBe(0)
  })
})

describe('driftScale', () => {
  const days = (n: number) => ({ days: n }) as Parameters<typeof driftScale>[0]

  it('traces a single year by month whatever its length', () => {
    expect(driftScale(days(5000), false)).toBe('month')
  })

  it('goes quarterly, then yearly, as history grows', () => {
    expect(driftScale(days(3 * 365), true)).toBe('quarter')
    expect(driftScale(days(6 * 365), true)).toBe('quarter')
    expect(driftScale(days(6 * 365 + 1), true)).toBe('year')
  })
})

describe('clock', () => {
  it('rounds to the nearest half hour', () => {
    expect(clock(0)).toBe('12 am')
    expect(clock(20 * 60)).toBe('8 pm')
    expect(clock(22.5 * 60)).toBe('10:30 pm')
    expect(clock(12 * 60)).toBe('12 pm')
    expect(clock(8 * 60 + 14)).toBe('8 am')
    expect(clock(8 * 60 + 16)).toBe('8:30 am')
  })

  it('wraps the end of the day to midnight', () => {
    expect(clock(1440)).toBe('12 am')
  })
})
