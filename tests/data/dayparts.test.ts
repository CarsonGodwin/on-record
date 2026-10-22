import { describe, expect, it } from 'vitest'
import { daypartLeans, dayNight, formatTimes, isDaytime, leanSentence, strongestLean, windowOf } from '../../src/data/dayparts'
import type { Play } from '../../src/types'
import { at, play } from '../helpers'

/** `n` three-minute plays of `artist` starting at `hour` on successive days */
function plays(artist: string, hour: number, n: number, overrides: Partial<Play> = {}): Play[] {
  return Array.from({ length: n }, (_, i) => play(at(2024, 3, 1 + (i % 28), hour, i % 50), { artist, ...overrides }))
}

describe('day and night', () => {
  it('splits the day at 6 AM and 6 PM', () => {
    expect(isDaytime(5)).toBe(false)
    expect(isDaytime(6)).toBe(true)
    expect(isDaytime(17)).toBe(true)
    expect(isDaytime(18)).toBe(false)
    expect(isDaytime(0)).toBe(false)
  })

  it('puts every hour in one window, starting with the mornings', () => {
    expect(Array.from({ length: 24 }, (_, h) => windowOf(h))).toEqual([
      3, 3, 3, 3, 3, 3, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 1, 2, 2, 2, 2, 2, 2,
    ])
  })

  it('shares listening time between day and night', () => {
    const ms = new Array<number>(24).fill(0)
    ms[9] = 300
    ms[23] = 100
    expect(dayNight(ms)).toEqual({ day: 0.75, night: 0.25 })
    expect(dayNight(new Array<number>(24).fill(0))).toEqual({ day: 0, night: 0 })
  })
})

describe('daypartLeans', () => {
  // Big all day; Moon is a small artist who mostly turns up after midnight
  const history = [
    ...plays('Big', 9, 40),
    ...plays('Big', 14, 40),
    ...plays('Big', 20, 40),
    ...plays('Big', 2, 20),
    ...plays('Moon', 2, 10),
    ...plays('Moon', 14, 2),
    ...plays('Sun', 8, 10),
    ...plays('Dusk', 19, 6),
    ...plays('Dusk', 21, 4),
  ]

  it('names who stands out in each window, not who is biggest everywhere', () => {
    const leans = daypartLeans(history)
    expect(leans.map((l) => [l.label, l.artist, l.kind])).toEqual([
      ['Mornings', 'Sun', 'leans'],
      ['Afternoons', 'Big', 'top'],
      ['Evenings', 'Dusk', 'leans'],
      ['Late nights', 'Moon', 'leans'],
    ])
  })

  it('measures the lean against the rest of the day', () => {
    const night = daypartLeans(history)[3]
    // Moon is 10 of 30 plays late at night, and 2 of 142 the rest of the day
    expect(night.share).toBeCloseTo(10 / 30)
    expect(night.vsRest).toBeCloseTo(10 / 30 / (2 / 142))
    // Sun never plays outside the mornings
    expect(daypartLeans(history)[0].vsRest).toBe(Infinity)
  })

  it('leaves out podcasts, and says when a window has no music', () => {
    const leans = daypartLeans([...plays('Big', 9, 30), ...plays('Pod', 2, 30, { kind: 'episode' })])
    expect(leans[3]).toMatchObject({ kind: 'none', artist: null, ms: 0 })
    expect(leanSentence(leans[3])).toBe('No music late at night.')
  })

  it('only names the most played when a window is too quiet to say more', () => {
    const leans = daypartLeans([...plays('Big', 9, 40), ...plays('Owl', 2, 3), ...plays('Big', 2, 2)])
    expect(leans[3]).toMatchObject({ artist: 'Owl', kind: 'top' })
    expect(leanSentence(leans[3])).toBe('Late at night you play Owl most.')
  })

  it('ignores artists too small in a window to stand out', () => {
    // Speck is 1% of the mornings: never named, however rare elsewhere
    const leans = daypartLeans([...plays('Big', 9, 99), ...plays('Speck', 9, 1), ...plays('Big', 14, 50)])
    expect(leans[0]).toMatchObject({ artist: 'Big', kind: 'top' })
  })

  it('picks the strongest lean to lead with', () => {
    const lead = strongestLean(daypartLeans(history))
    expect(lead?.label).toBe('Mornings')
    expect(strongestLean(daypartLeans([]))).toBeNull()
  })

  it('works in local time', () => {
    // 11:59 PM and midnight land in different windows wherever the tests run
    const leans = daypartLeans([play(at(2024, 1, 1, 23, 59), { artist: 'Late' }), play(at(2024, 1, 2, 0, 0), { artist: 'Later' })])
    expect(leans[2].artist).toBe('Late')
    expect(leans[3].artist).toBe('Later')
  })
})

describe('copy', () => {
  it('rounds multiples so they read easily', () => {
    expect(formatTimes(3)).toBe('3×')
    expect(formatTimes(2.44)).toBe('2.4×')
    expect(formatTimes(12.6)).toBe('13×')
  })

  it('says what the numbers mean', () => {
    const [mornings, , evenings] = daypartLeans([
      ...plays('Big', 9, 40),
      ...plays('Big', 14, 40),
      ...plays('Big', 20, 40),
      ...plays('Sun', 8, 10),
      ...plays('Dusk', 19, 10),
      ...plays('Dusk', 14, 5),
    ])
    expect(leanSentence(mornings)).toBe('In the mornings you lean on Sun, and you never play them the rest of the day.')
    // Dusk: 10 of 50 evening plays, 5 of 95 the rest of the day
    expect(leanSentence(evenings)).toBe(`In the evenings you lean on Dusk: ${formatTimes(10 / 50 / (5 / 95))} more than the rest of the day.`)
  })
})
